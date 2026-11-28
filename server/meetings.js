// p14: scheduled meetings. A meeting is a calendar event (server/plan.js, calendar/<id>.md) with kind: 'meeting' and:
//   scope 'project' (everyone in the project) | 'people' (picked people) | 'dm' (the two people of a DM: only they see it)
//   dm (the DM channel), channel (where its card is), agenda (a few lines), notesOn (turn on Notes when it starts),
//   rsvp { memberId: 'yes' | 'maybe' | 'no' }, cancelled, tz (the organizer's time zone, for reminder wording), msg (the card's id)
// Scheduling posts one chat card in the channel or DM ("Meeting · Thu 3:00 PM · 30 min · Going / Maybe / Can't"); the
// card reads the event live (the 'event' broadcast). Reminders go through bus.notify like every other feature (type
// 'reminder', ref = the channel, project = the project), so each person's notification settings for that group apply:
// 10 minutes before and at the start, with a Join action. Joining: POST /:id/join says how (the project huddle, or the
// private call for a DM or two picked people; more than two picked people use the project huddle) and arms the meeting,
// so the huddle join that follows turns on Notes when the meeting asks for it, and callnotes.js titles the note after it.
//   GET  /api/meetings                 -> { meetings: [meeting + next { start, end }] } upcoming and live, visible to me
//   POST /api/meetings                 { title, start, duration, scope, people, dm, agenda, repeat, notesOn, tz } -> { meeting }
//   GET  /api/meetings/:id             PATCH (organizer or lead: title/start/duration/agenda/repeat/notesOn/people)
//   POST /api/meetings/:id/rsvp        { answer: 'yes' | 'maybe' | 'no' }
//   POST /api/meetings/:id/cancel      organizer or lead; the card says Cancelled, attendees are told
//   POST /api/meetings/:id/join        -> { how: 'huddle' | 'call', with?, notesOn, note? }
'use strict';
const bus = require('./bus');

const MIN = 60_000, DAY = 86_400_000;
const ANSWERS = ['yes', 'maybe', 'no'];

module.exports = function meetings({ P, plan, str, postChat, getMembers, sendTo, dms, isLead, voice, huddle }) {
  const member = id => getMembers().find(m => m.id === id) || null;
  const human = m => m && m.role !== 'agent' && m.role !== 'spectator';
  const pairName = (a, b) => 'dm-' + [a, b].sort().join('-');
  const pid = () => P.current() || P.defaultId();
  const tzOk = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
  const fmt = (t, tz) => new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', ...(tz && tzOk(tz) ? { timeZone: tz } : {}) });
  const mins = ev => Math.round((Date.parse(ev.end) - Date.parse(ev.start)) / MIN);

  const visible = (ev, me) => {
    if (!ev || ev.kind !== 'meeting') return true;
    if (ev.dm) { const p = dms.pair(ev.dm); return !!(me && p && p.includes(me.id)); }
    return true;
  };
  // who a meeting is for: the DM's two, the picked people, or everyone in the project
  function people(ev, project = pid()) {
    if (ev.dm) return (dms.pair(ev.dm) || []).filter(id => human(member(id)));
    if (ev.scope === 'people') return (ev.attendees || []).filter(id => human(member(id)));
    return getMembers().filter(m => human(m) && P.canSee(m, project)).map(m => m.id);
  }
  const deliver = (ev, msg) => { if (!ev.dm) return false; for (const id of dms.pair(ev.dm) || []) sendTo(id, msg); return true; };
  const mayEdit = (ev, me) => !!me && (ev.by === me.id || isLead(me, pid()));
  // the occurrence that is on now, or the next one
  function next(ev, now = Date.now()) {
    const o = plan.occurrences(ev, now, now + 400 * DAY)[0];
    return o ? { start: new Date(o.start).toISOString(), end: new Date(o.end).toISOString() } : null;
  }
  const view = (ev, now) => ({ ...ev, next: next(ev, now) });
  const channelLabel = ev => (ev.dm ? ev.dm : 'general');

  function notify(ev, to, title, body, extra = {}) {
    const list = to.filter(id => (ev.rsvp || {})[id] !== 'no');
    if (!list.length) return;
    bus.notify({ type: 'reminder', priority: 'normal', to: list, project: pid(), ref: ev.dm || P.channelOf(pid()), view: 'meeting:' + ev.id, title, body,
      actions: [{ id: 'join-meeting:' + ev.id, label: 'Join' }], ...extra });
  }

  // ---------- create / change ----------
  function fields(b, prev = {}) {
    const out = {};
    if (b.title !== undefined) out.title = str(b.title, 160) || 'Meeting';
    if (b.agenda !== undefined) out.agenda = String(b.agenda || '').split('\n').map(l => l.replace(/\s+$/, '').slice(0, 200)).filter((l, i, a) => l || (i && i < a.length - 1)).slice(0, 12).join('\n').trim();
    if (b.notesOn !== undefined) out.notesOn = !!b.notesOn;
    if (b.repeat !== undefined) out.repeat = b.repeat === 'weekly' ? 'weekly' : null;
    if (b.start !== undefined) out.start = b.start;
    if (b.duration !== undefined) out.duration = Math.min(Math.max(Number(b.duration) || 30, 5), 8 * 60);
    if (typeof b.tz === 'string' && tzOk(b.tz)) out.tz = b.tz.slice(0, 64);
    if (b.people !== undefined && (prev.scope || b.scope) === 'people') out.attendees = Array.isArray(b.people) ? b.people.map(String).slice(0, 50) : [];
    return out;
  }

  function create(b, me) {
    if (!human(member(me.id)) && me.role !== 'host') return { status: 403, error: 'only people schedule meetings' };
    const f = fields(b);
    if (!f.start || Number.isNaN(Date.parse(f.start))) return { status: 400, error: 'pick a day and a time' };
    let scope = ['project', 'people', 'dm'].includes(b.scope) ? b.scope : 'project', dm = null, attendees = [me.id];
    if (scope === 'dm') {
      dm = typeof b.dm === 'string' ? b.dm : (b.with ? pairName(me.id, String(b.with)) : null);
      const p = dm && dms.isDm(dm) && dms.canRead(dm, me) ? dms.pair(dm) : null;
      if (!p || !p.every(id => human(member(id)))) return { status: 400, error: 'that conversation is not a DM between two people' };
      attendees = p.slice();
    } else if (scope === 'people') {
      attendees = [...new Set([me.id, ...(f.attendees || [])])].filter(id => { const m = member(id); return human(m) && P.canSee(m, pid()); });
      if (attendees.length < 2) return { status: 400, error: 'pick at least one other person' };
    }
    const r = plan.create({ title: f.title || 'Meeting', start: f.start, duration: f.duration || 30, attendees, repeat: f.repeat || null, kind: 'meeting', scope, dm,
      channel: dm || 'general', agenda: f.agenda || '', notesOn: !!f.notesOn, cancelled: false, rsvp: { [me.id]: 'yes' }, tz: f.tz || null }, me.id);
    if (r.error) return { status: 400, error: r.error };
    const ev = r.event;
    const msg = postChat(dm || 'general', 'tribecode', `${me.name} scheduled a meeting: **${ev.title}** · ${fmt(ev.start, ev.tz)} · ${mins(ev)} min`, { meeting: { id: ev.id, title: ev.title, start: ev.start } });
    ev.msg = msg && msg.id; plan.save(ev);
    const others = people(ev).filter(id => id !== me.id);
    if (others.length) bus.notify({ type: 'reminder', priority: 'low', to: others, from: me.id, project: pid(), ref: dm || P.channelOf(pid()), view: 'meeting:' + ev.id,
      title: `${me.name} scheduled ${ev.title}`, body: `${fmt(ev.start, ev.tz)} · ${mins(ev)} min${scope === 'project' ? ' · everyone in the project' : ''}` });
    return { meeting: view(ev) };
  }

  // called by plan.js after any PATCH of a meeting (here, or dragging it on the calendar)
  function patched(prev, ev, me) {
    if (prev.start !== ev.start || prev.end !== ev.end) {
      const to = people(ev).filter(id => id !== me.id);
      if (to.length) notify(ev, to, `${ev.title} moved`, `Now ${fmt(ev.start, ev.tz)} · ${mins(ev)} min (was ${fmt(prev.start, prev.tz)})`);
    }
  }

  // ---------- reminders: 10 minutes before and at the start ----------
  const leadMs = () => Number(process.env.TRIBE_MEETING_LEAD_MS) || 10 * MIN;
  const sent = new Map();   // key -> at (in memory: after a restart a reminder can't repeat, because its window has passed)
  function tick(now = Date.now()) {
    const lead = leadMs();
    for (const p of P.all()) P.inProject(p.id, () => {
      for (const ev of plan.all()) {
        if (ev.kind !== 'meeting' || ev.cancelled) continue;
        for (const o of plan.occurrences(ev, now - 5 * MIN, now + lead + 1)) {
          const key = `${ev.id}@${new Date(o.start).toISOString()}`;
          if (o.start > now && o.start - lead <= now && !sent.has('a:' + key)) {
            sent.set('a:' + key, now);
            notify(ev, people(ev), `${ev.title} in ${Math.max(1, Math.round((o.start - now) / MIN))} min`, `${fmt(o.start, ev.tz)} · ${mins(ev)} min. Join from here or the card.`);
          }
          if (o.start <= now && o.start > now - 5 * MIN && !sent.has('s:' + key)) {
            sent.set('s:' + key, now); sent.set('a:' + key, now);
            notify(ev, people(ev), `${ev.title} is starting`, `Now · ${mins(ev)} min. Tap Join.`, { priority: 'high' });
          }
        }
      }
    });
    for (const [k, t] of sent) if (now - t > DAY) sent.delete(k);
  }
  const TICK = Number(process.env.TRIBE_MEETING_TICK_MS) || 20_000;
  const timer = setInterval(() => { try { tick(); } catch (e) { console.error('meetings', e); } }, TICK); timer.unref();

  // ---------- joining: which call, and Notes ----------
  const armed = new Map();   // memberId -> { id, project, until }
  const live = [];           // [{ id, title, agenda, project, dm, at }] meetings whose call is on, for callnotes.js
  function joinPlan(ev, me) {
    const ps = people(ev);
    if (ev.dm) return { how: 'call', with: ps.find(id => id !== me.id) };
    if (ev.scope === 'people' && ps.length === 2 && ps.includes(me.id)) return { how: 'call', with: ps.find(id => id !== me.id) };
    if (ev.scope === 'people' && ps.length > 2) return { how: 'huddle', note: 'More than two people: this meeting uses the project huddle.' };
    return { how: 'huddle' };
  }
  // index.js calls this right after someone joins the huddle
  function onHuddleJoin(me, sock) {
    const a = armed.get(me.id); if (!a || a.until < Date.now()) return;
    armed.delete(me.id);
    P.inProject(a.project, () => {
      const ev = plan.get(a.id); if (!ev || ev.cancelled) return;
      if (!live.some(x => x.id === ev.id && Date.now() - x.at < 6 * 3600_000)) { live.unshift({ id: ev.id, title: ev.title, agenda: ev.agenda || '', project: a.project, dm: ev.dm || null, at: Date.now() }); live.length = Math.min(live.length, 10); }
      if (ev.notesOn && voice && !voice.state().on && huddle.has(me.id) && me.role !== 'spectator') voice.handle(sock, me, { type: 'captions', on: true });
    });
  }
  // callnotes.js: the meeting this call's notes belong to (the newest armed one for that project / DM in the last 6 hours)
  function forNotes({ project, dm }) {
    const i = live.findIndex(x => Date.now() - x.at < 6 * 3600_000 && (dm ? x.dm === dm : !x.dm && (!project || x.project === project)));
    if (i < 0) return null;
    return live.splice(i, 1)[0];
  }

  // ---------- routes ----------
  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (m === 'GET' && !b) {
      const now = Date.now();
      const list = plan.all().filter(ev => ev.kind === 'meeting' && visible(ev, me)).map(ev => ({ ...view(ev, now), canEdit: mayEdit(ev, me) }))
        .filter(ev => ev.next && Date.parse(ev.next.end) > now - 60 * MIN).sort((x, y) => x.next.start.localeCompare(y.next.start));
      return send(res, 200, { meetings: list.slice(0, 50) });
    }
    if (me.role === 'spectator' && m !== 'GET') return fail(res, 403, 'spectators are read-only');
    if (m === 'POST' && !b) { const r = create(await readBody(req) || {}, me); return r.error ? fail(res, r.status || 400, r.error) : send(res, 200, r); }
    const ev = b && plan.get(b);
    if (!ev || ev.kind !== 'meeting' || !visible(ev, me)) return fail(res, 404, 'meeting not found');
    if (m === 'GET' && !c) return send(res, 200, { meeting: { ...view(ev), canEdit: mayEdit(ev, me) }, canEdit: mayEdit(ev, me) });
    if (m === 'POST' && c === 'rsvp') {
      const body = await readBody(req) || {}; const a = String(body.answer || '');
      if (!ANSWERS.includes(a)) return fail(res, 400, 'answer is yes, maybe or no');
      if (!people(ev).includes(me.id)) return fail(res, 403, 'this meeting is for other people');
      const next = { ...ev, rsvp: { ...(ev.rsvp || {}), [me.id]: a }, updated: new Date().toISOString() };
      plan.save(next); return send(res, 200, { meeting: view(next) });
    }
    if (m === 'POST' && c === 'join') {
      if (ev.cancelled) return fail(res, 400, 'this meeting was cancelled');
      armed.set(me.id, { id: ev.id, project: pid(), until: Date.now() + 3 * MIN });
      return send(res, 200, { ...joinPlan(ev, me), notesOn: !!ev.notesOn, dm: ev.dm || null });
    }
    if (!mayEdit(ev, me)) return fail(res, 403, 'only the organizer or a project lead changes this meeting');
    if (m === 'POST' && c === 'cancel') {
      const next = { ...ev, cancelled: true, updated: new Date().toISOString(), updatedBy: me.id };
      plan.save(next);
      const to = people(ev).filter(id => id !== me.id);
      if (to.length) bus.notify({ type: 'reminder', priority: 'normal', to, from: me.id, project: pid(), ref: ev.dm || P.channelOf(pid()), view: 'meeting:' + ev.id, title: `Cancelled: ${ev.title}`, body: `${me.name} cancelled it (${fmt(ev.start, ev.tz)}).` });
      return send(res, 200, { meeting: view(next) });
    }
    if (m === 'PATCH' && !c) {
      const body = await readBody(req) || {};
      const f = fields(body, ev);
      if (f.attendees) f.attendees = [...new Set([ev.by, ...f.attendees])].filter(id => { const x = member(id); return human(x) && P.canSee(x, pid()); });
      if (f.start !== undefined && Number.isNaN(Date.parse(f.start))) return fail(res, 400, 'bad start');
      const cl = plan.clean({ ...f, kind: 'meeting' }, ev); if (cl.error) return fail(res, 400, cl.error);
      if (f.attendees) cl.attendees = f.attendees;
      const next = { ...ev, ...cl, updated: new Date().toISOString(), updatedBy: me.id };
      plan.save(next); patched(ev, next, me);
      return send(res, 200, { meeting: view(next) });
    }
    if (m === 'DELETE' && !c) return fail(res, 400, 'cancel the meeting instead, so people see it was cancelled');
    return null;
  }

  plan.meetings({ visible, deliver, mayEdit, patched });
  return { route, tick, onHuddleJoin, forNotes, visible, people };
};
