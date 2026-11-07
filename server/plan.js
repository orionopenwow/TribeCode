// Planning: calendar events (calendar/<id>.md), task due dates, and reminders.
// Events are Markdown files with front-matter so people, agents and git all read the same thing:
//   title, start, end (ISO), attendees [memberId], huddle (bool), repeat ('weekly' | null), remind (minutes, optional)
// The reminder loop emits bus.notify({ type: 'reminder' }) to attendees/assignees and posts a chat line with
// a "Join huddle" button when a scheduled huddle starts.
'use strict';
const bus = require('./bus');

const DAY = 86_400_000;
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isoOk = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Every start of an event that overlaps [from, to). Weekly series step in local time so 9am stays 9am across DST.
function occurrences(ev, from, to) {
  const s0 = Date.parse(ev.start), len = Math.max(0, Date.parse(ev.end) - s0) || 30 * 60_000;
  const out = [];
  if (ev.repeat !== 'weekly') { if (s0 < to && s0 + len > from) out.push({ start: s0, end: s0 + len }); return out; }
  const until = ev.until ? Date.parse(ev.until) + DAY : Infinity;
  const d = new Date(s0);
  if (s0 + len <= from) { const skip = Math.floor((from - len - s0) / (7 * DAY)); if (skip > 0) d.setDate(d.getDate() + skip * 7); }
  for (let i = 0; i < 1000; i++) {
    const t = d.getTime(); if (t >= to || t >= until) break;
    if (t + len > from && !(ev.skip || []).includes(new Date(t).toISOString())) out.push({ start: t, end: t + len });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

module.exports = function plan({ store, id, str, broadcast, postChat, getMembers, loadTasks, nameOf }) {
  const rel = eid => `calendar/${eid}.md`;
  const okId = v => /^e-[a-z0-9-]{3,40}$/i.test(v);
  try { require('node:fs').mkdirSync(store.p('calendar'), { recursive: true }); } catch {}

  function all() {
    return store.listMd('calendar').map(f => { const r = store.readMd(f); return r && r.meta.id ? { ...r.meta, notes: r.body } : null; }).filter(Boolean);
  }
  const get = eid => { const r = okId(eid) && store.readMd(rel(eid)); return r && r.meta.id ? { ...r.meta, notes: r.body } : null; };
  function save(ev) {
    const { notes = '', ...meta } = ev;
    store.writeMd(rel(ev.id), meta, notes);
    broadcast({ type: 'event', event: ev });
    return ev;
  }

  // Validate and normalize a create/patch body. Returns { error } or the cleaned fields.
  function clean(b, prev = {}) {
    const out = {};
    if (b.title !== undefined) out.title = str(b.title, 160) || 'Untitled event';
    if (b.start !== undefined) { if (!isoOk(b.start)) return { error: 'bad start' }; out.start = new Date(b.start).toISOString(); }
    const start = Date.parse(out.start || prev.start);
    if (b.end !== undefined) { if (!isoOk(b.end)) return { error: 'bad end' }; out.end = new Date(b.end).toISOString(); }
    else if (b.duration !== undefined) out.end = new Date(start + Math.min(Math.max(Number(b.duration) || 30, 5), 24 * 60) * 60_000).toISOString();
    else if (out.start && prev.end) out.end = new Date(start + (Date.parse(prev.end) - Date.parse(prev.start))).toISOString();
    else if (!prev.end) out.end = new Date(start + 30 * 60_000).toISOString();
    if (out.end && Date.parse(out.end) <= start) out.end = new Date(start + 15 * 60_000).toISOString();
    if (b.attendees !== undefined) {
      const ms = getMembers(); const list = Array.isArray(b.attendees) ? b.attendees : [];
      out.attendees = [...new Set(list.map(a => { const s = String(a); const m = ms.find(x => x.id === s) || ms.find(x => x.name.toLowerCase() === s.toLowerCase()) || ms.find(x => x.name.toLowerCase().split(/\s+/)[0] === s.toLowerCase()); return m && m.id; }).filter(Boolean))];
    }
    if (b.huddle !== undefined) out.huddle = !!b.huddle;
    if (b.repeat !== undefined) out.repeat = b.repeat === 'weekly' ? 'weekly' : null;
    if (b.remind !== undefined) out.remind = b.remind === null ? null : Math.min(Math.max(Number(b.remind) || 0, 0), 7 * 24 * 60);
    if (b.notes !== undefined) out.notes = str(b.notes, 20000);
    return out;
  }

  function create(b, by) {
    if (!isoOk(b.start)) return { error: 'start required' };
    const c = clean({ title: 'Untitled event', attendees: [], ...b }); if (c.error) return c;
    const now = new Date().toISOString();
    const ev = { id: `e-${Date.now().toString(36)}-${id(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`, by, created: now, updated: now, huddle: false, repeat: null, ...c };
    if (!ev.attendees.includes(by) && getMembers().some(m => m.id === by && m.role !== 'agent')) ev.attendees.unshift(by);
    return { event: save(ev) };
  }

  function expand(from, to) {
    const out = [];
    for (const ev of all()) for (const o of occurrences(ev, from, to))
      out.push({ id: ev.id, key: `${ev.id}@${new Date(o.start).toISOString()}`, title: ev.title, start: new Date(o.start).toISOString(), end: new Date(o.end).toISOString(),
        attendees: ev.attendees || [], huddle: !!ev.huddle, repeat: ev.repeat || null, by: ev.by });
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }
  const dueTasks = (fromDay, toDay) => loadTasks().filter(t => isDay(t.due) && t.due >= fromDay && t.due <= toDay)
    .map(t => ({ id: t.id, title: t.title, due: t.due, status: t.status, assignee: t.assignee || null }));

  function upcoming(n = 3, me) {
    const now = Date.now(), today = localDay(new Date());
    const evs = expand(now, now + 60 * DAY).filter(e => Date.parse(e.end) > now).map(e => ({ kind: 'event', at: e.start, ...e }));
    const tasks = loadTasks().filter(t => isDay(t.due) && t.status !== 'done').map(t => ({ kind: 'task', at: t.due + 'T23:59:00', id: t.id, title: t.title, due: t.due, status: t.status, assignee: t.assignee || null, overdue: t.due < today }));
    // Overdue tasks first (they need attention), then everything by time.
    return [...tasks.filter(t => t.overdue), ...[...evs, ...tasks.filter(t => !t.overdue)].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))].slice(0, n);
  }

  // ---------- reminders ----------
  const SENT = '.tribe/reminders-sent.json';
  let sent = store.readJSON(SENT, {});
  const mark = k => { sent[k] = Date.now(); const cut = Date.now() - 30 * DAY; for (const [x, t] of Object.entries(sent)) if (t < cut) delete sent[x]; store.writeJSON(SENT, sent); };
  const leadMs = ev => (ev.remind !== undefined && ev.remind !== null ? Number(ev.remind) * 60_000 : Number(process.env.TRIBE_REMINDER_LEAD_MS) || 10 * 60_000);
  const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  function tick(now = Date.now()) {
    const evs = all();
    for (const ev of evs) {
      const lead = leadMs(ev);
      for (const o of occurrences(ev, now - 5 * 60_000, now + lead + 1)) {
        const key = `${ev.id}@${new Date(o.start).toISOString()}`;
        if (o.start - lead <= now && o.start > now - 5 * 60_000 && !sent['r:' + key]) {
          mark('r:' + key);
          const mins = Math.max(0, Math.round((o.start - now) / 60_000));
          bus.notify({ type: 'reminder', to: ev.attendees && ev.attendees.length ? ev.attendees : 'all', priority: 'normal', view: 'calendar', ref: ev.id,
            title: ev.huddle ? `Huddle: ${ev.title}` : ev.title, body: mins ? `Starts in ${mins} min · ${fmtTime(o.start)}` : `Starting now · ${fmtTime(o.start)}`,
            ...(ev.huddle ? { actions: [{ id: 'join-huddle', label: 'Join huddle' }] } : {}) });
        }
        if (ev.huddle && o.start <= now && o.start > now - 5 * 60_000 && !sent['h:' + key]) {
          mark('h:' + key);
          const who = (ev.attendees || []).map(nameOf).join(', ');
          postChat('general', 'tribecode', `🎙️ Scheduled huddle **${ev.title}** is starting${who ? ` · ${who}` : ''}. Join the huddle.`);
        }
      }
    }
    // Tasks due today: remind the assignee once, on the morning of.
    const d = new Date(now), today = localDay(d), hour = Number(process.env.TRIBE_MORNING_HOUR ?? 9);
    if (d.getHours() >= hour) for (const t of loadTasks()) {
      if (t.due !== today || t.status === 'done' || sent[`t:${t.id}@${today}`]) continue;
      mark(`t:${t.id}@${today}`);
      bus.notify({ type: 'reminder', to: [t.assignee || t.by].filter(Boolean), priority: 'normal', view: 'tasks', ref: t.id, title: `Due today: ${t.title}`, body: 'This task is due today.' });
    }
  }
  const TICK = Number(process.env.TRIBE_REMINDER_TICK_MS) || 30_000;
  const timer = setInterval(() => { try { tick(); } catch (e) { console.error(e); } }, TICK); timer.unref();
  setTimeout(() => { try { tick(); } catch {} }, 1500).unref();

  // ---------- routes: /api/calendar ----------
  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (m === 'GET' && b === 'upcoming') return send(res, 200, { items: upcoming(Math.min(Number(url.searchParams.get('n')) || 3, 20), me) });
    if (m === 'GET' && !b) {
      const from = Date.parse(url.searchParams.get('from')) || Date.now() - 7 * DAY, to = Date.parse(url.searchParams.get('to')) || from + 42 * DAY;
      if (to - from > 400 * DAY) return fail(res, 400, 'range too large');
      return send(res, 200, { events: all(), occurrences: expand(from, to), tasks: dueTasks(localDay(new Date(from - DAY)), localDay(new Date(to + DAY))) });
    }
    if (m === 'GET' && b) { const ev = get(b); return ev ? send(res, 200, { event: ev }) : fail(res, 404, 'event not found'); }
    if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
    if (m === 'POST' && !b) { const r = create(await readBody(req), me.id); return r.error ? fail(res, 400, r.error) : send(res, 200, r); }
    const ev = b && get(b); if (!ev) return fail(res, 404, 'event not found');
    if (m === 'PATCH') {
      const c = clean(await readBody(req), ev); if (c.error) return fail(res, 400, c.error);
      const next = { ...ev, ...c, updated: new Date().toISOString(), updatedBy: me.id };
      if (c.start && c.start !== ev.start) for (const k of Object.keys(sent)) if (k.includes(ev.id + '@')) delete sent[k];   // moved: remind again
      return send(res, 200, { event: save(next) });
    }
    if (m === 'DELETE') { store.remove(rel(ev.id)); broadcast({ type: 'event-removed', id: ev.id }); return send(res, 200, { ok: true }); }
    return null;
  }

  return { route, all, get, create, expand, upcoming, tick, occurrences };
};
module.exports.occurrences = occurrences;
