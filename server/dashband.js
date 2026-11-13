// The dashboard's top (feat/dash-preview): a preview band of the main project, and "Needs attention" under it.
//
// The band shows what the project is making, picked in this order unless someone switched it:
//   app     the running app or game (server/preview.js: the repo has a page to serve, or a dev server)
//   site    the website (a designer config, a draft or a published site: server/sitedesign.js, server/showcase.js)
//   design  the latest design canvas with something on it (server/canvas.js)
//   none    nothing yet: the client shows a calm "Set up your preview" card
// "Main project" is the tribe's pinned project (a lead pins it), else the most active one the viewer can see.
//
//   GET  /api/dash/band                     { band } for the request's project (X-Project)
//   PUT  /api/dash/main   { project|null }  pin (or unpin) the tribe's main project: the host or that project's lead
//   PUT  /api/dash/show   { show }          what the band shows for this project: app | site | design | auto (builders)
//   POST /api/dash/signal { kind, ok, text } a build or preview result (an agent's build, a preview error): failing ones rank first
//   GET  /api/dash/criticals                { items, total } ranked: build/preview errors · approvals waiting on you ·
//                                           tasks offered to you · overdue or blocked tasks · open website comments ·
//                                           setup gaps (leads) · company health · unread mentions
// Saved in .tribe/dashband.json: { main, show: { pid: kind }, signals: { pid: { build, preview } } }.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KINDS = ['app', 'site', 'design'];
const RANK = { build: 10, approval: 20, accept: 30, overdue: 40, blocked: 45, comments: 50, company: 60, setup: 70, mention: 80 };

module.exports = function dashband({ P, base, preview, showcase, visuals, hubFor, approvals, loadTasks, canvas, company, notify, nameOf, broadcast, perms = null }) {
  const FILE = '.tribe/dashband.json';
  const read = () => { const d = base.readJSON(FILE, {}) || {}; d.show = d.show && typeof d.show === 'object' ? d.show : {}; d.signals = d.signals && typeof d.signals === 'object' ? d.signals : {}; return d; };
  const write = d => base.writeJSON(FILE, d);
  const err = (status, m) => Object.assign(new Error(m), { status });
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const safe = pid => String(pid).replace(/[^\w-]/g, '');
  const mtime = rel => { try { return fs.statSync(base.p(rel)).mtimeMs; } catch { return 0; } };
  const iso = ms => (ms ? new Date(ms).toISOString() : null);
  const person = me => !!me && me.role !== 'agent' && me.role !== 'spectator';
  const projRole = (me, pid) => ((P.get(pid) || {}).members || {})[me.id];
  const isLead = (me, pid) => !!me && me.role !== 'agent' && !me.guestUntil && (me.role === 'host' || projRole(me, pid) === 'host' || !!(perms && perms.can && perms.can(me, 'settings.edit', pid)));
  const canSwitch = (me, pid) => person(me) && projRole(me, pid) !== 'spectator';

  // ---------- what the project has ----------
  function appOf(pid, me) {
    try { const s = preview.status(pid, me); return !!(s.hasRepo && s.hasIndex); } catch { return false; }
  }
  function siteOf(pid) {
    const cfg = base.readJSON(`.tribe/website/${safe(pid)}.config.json`, null);
    let st = {}; try { st = showcase.load(pid) || {}; } catch {}
    let started = false; try { started = !!(st.built || st.gen || showcase.exists(pid) || (showcase.started && showcase.started(pid))); } catch {}
    if (!cfg && !started) return null;
    const pages = cfg && Array.isArray(cfg.pages) ? cfg.pages : [];
    const home = pages[0] || {}, blocks = Array.isArray(home.blocks) ? home.blocks : [];
    const hero = blocks.find(b => b && /hero|header|cover/i.test(String(b.type || ''))) || blocks[0] || {};
    const f = (hero.props || hero.fields || hero.data || {});
    const nm = cfg && cfg.name && cfg.name !== 'My site' ? cfg.name : '';
    const title = str(f.title || f.headline || nm || (st.fields && st.fields.headline) || '', 80);
    const tagline = str(f.subtitle || f.tagline || f.text || (st.fields && st.fields.tagline) || '', 140);
    const ac = cfg && cfg.theme && ((cfg.theme.colors && cfg.theme.colors.accent) || cfg.theme.accent);
    const accent = /^#[0-9a-f]{3,8}$/i.test(String(ac || '')) ? ac : null;
    const at = (cfg && cfg.savedAt) || (st.built && st.built.at) || (st.gen && st.gen.draft && st.gen.draft.updated) || null;
    const by = (cfg && cfg.savedBy) || (st.built && st.built.by) || null;
    return { title, tagline, accent, blocks: blocks.length, pages: pages.length, at, by, published: !!st.built };
  }
  function designOf(pid) {
    let list = []; try { list = canvas.list(pid) || []; } catch {}
    const d = list.filter(f => f.count > 0).sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')))[0];
    return d ? { id: d.id, name: d.name, at: d.updated || null, count: d.count } : null;
  }
  function appUpdated(pid) {
    try { const s = hubFor(pid).status(); const c = s && s.commits && s.commits[0]; if (c) return { at: c.at, byName: c.author }; } catch {}
    return null;
  }
  // how lively a project is, for "the most active one"
  function activity(pid) {
    let t = mtime(`chat/${P.channelOf(pid)}.jsonl`);
    t = Math.max(t, mtime(`.tribe/website/${safe(pid)}.config.json`));
    try { for (const f of canvas.list(pid) || []) t = Math.max(t, Date.parse(f.updated) || 0); } catch {}
    try { for (const x of P.inProject(pid, () => loadTasks())) t = Math.max(t, Date.parse(x.updated) || 0); } catch {}
    return t;
  }
  function mainFor(me) {
    const d = read(), seen = P.all().filter(p => P.canSee(me, p.id));
    if (d.main && seen.some(p => p.id === d.main)) return { id: d.main, pinned: true };
    let best = null, bt = -1; for (const p of seen) { const t = activity(p.id); if (t > bt) { bt = t; best = p.id; } }
    return best ? { id: best, pinned: false } : null;
  }

  function band(pid, me) {
    const p = P.get(pid); if (!p) return null;
    const d = read(), main = mainFor(me);
    const has = { app: appOf(pid, me), site: siteOf(pid), design: designOf(pid) };
    const chosen = KINDS.includes(d.show[pid]) ? d.show[pid] : null;
    const pick = chosen && has[chosen] ? chosen : KINDS.find(k => has[k]) || 'none';
    let updated = null;
    if (pick === 'app') updated = appUpdated(pid) || null;
    if (pick === 'site') updated = { at: has.site.at, byName: has.site.by ? nameOf(has.site.by) : '' };
    if (pick === 'design') updated = { at: has.design.at, byName: '' };
    let shot = null; try { const s = (visuals.screens() || [])[0]; if (s && s.latest) shot = { at: s.latest.at || iso(parseInt(s.latest.ts, 10)) }; } catch {}
    if (pick === 'app' && !updated && shot) updated = { at: shot.at, byName: '' };
    return {
      project: { id: p.id, name: p.name, color: p.color, emoji: p.emoji || '' },
      pick, chosen, has: { app: has.app, site: !!has.site, design: !!has.design }, site: has.site, design: has.design, updated,
      main: main ? main.id : null, pinned: !!(main && main.pinned), isMain: !!(main && main.id === pid),
      canPin: isLead(me, pid), canSwitch: canSwitch(me, pid), signals: d.signals[pid] || {},
    };
  }

  // ---------- Needs attention ----------
  const dayStr = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
  function criticals(pid, me) {
    const out = [], add = (k, o) => out.push({ k, rank: RANK[k] + (o.bump || 0), ...o });
    const d = read(), sig = d.signals[pid] || {};
    // 1. a failing build or preview errors
    if (sig.build && sig.build.ok === false) add('build', sig.build.source === 'checks'
      ? { title: sig.build.state === 'timeout' ? 'The checks ran out of time' : 'The checks are failing', sub: (sig.build.lines || []).slice(0, 2).join(' · ') || sig.build.text || 'The last run failed.', act: 'Open the code', go: 'repo', tone: 'alert', run: sig.build.run, ms: sig.build.ms, lines: sig.build.lines || [] }
      : { title: 'The build is failing', sub: sig.build.text || 'The last build reported an error.', act: 'Open the code', go: 'repo', tone: 'alert' });
    try { const ci = hubFor(pid).status(); const c = ci && ci.ci; if (c && c.conclusion === 'failure' && !(sig.build && sig.build.ok === false)) add('build', { title: 'The build is failing', sub: `${c.workflow || 'CI'} failed on main`, act: 'See the run', url: c.url, go: 'repo', tone: 'alert' }); } catch {}
    if (sig.preview && sig.preview.ok === false && Date.now() - Date.parse(sig.preview.at || 0) < 24 * 3600e3) add('build', { bump: 1, title: 'The preview has errors', sub: sig.preview.text || 'The app threw an error.', act: 'Open preview', go: 'preview', tone: 'alert' });
    // 2. approvals waiting on you
    let ap = []; try { ap = approvals.list().filter(a => a.status === 'pending' && (a.project || P.defaultId()) === pid && Array.isArray(a.to) && a.to.includes(me.id)); } catch {}
    if (ap.length) add('approval', { title: ap.length === 1 ? `Approve: ${ap[0].title}` : `${ap.length} approvals waiting on you`, sub: ap.length === 1 ? `From ${ap[0].byName || nameOf(ap[0].by)}` : ap.slice(0, 2).map(a => a.title).join(' · '), act: 'Review', go: 'inbox', ref: ap[0].id, n: ap.length });
    // 3-4. tasks: offered to you, overdue, blocked
    let tasks = []; try { tasks = P.inProject(pid, () => loadTasks()); } catch {}
    const open = tasks.filter(t => t.status !== 'done'), today = dayStr();
    const offer = open.filter(t => t.accept === 'pending' && t.assignee === me.id);
    if (offer.length) add('accept', { title: offer.length === 1 ? `Accept: ${offer[0].title}` : `${offer.length} tasks waiting for your Accept`, sub: offer.length === 1 ? `Assigned by ${nameOf(offer[0].assignedBy || offer[0].by)}` : offer.slice(0, 2).map(t => t.title).join(' · '), act: offer.length === 1 ? 'Accept' : 'Open tasks', go: 'tasks', ref: offer[0].id, task: offer.length === 1 ? offer[0].id : null, n: offer.length });
    const late = open.filter(t => t.due && t.due < today);
    if (late.length) { const mine = late.filter(t => t.assignee === me.id); add('overdue', { bump: mine.length ? 0 : 2, title: late.length === 1 ? `Overdue: ${late[0].title}` : `${late.length} tasks overdue`, sub: late.length === 1 ? `Was due ${late[0].due}${late[0].assignee ? ` · ${nameOf(late[0].assignee)}` : ''}` : late.slice(0, 2).map(t => t.title).join(' · '), act: 'Open tasks', go: 'tasks', ref: late[0].id, n: late.length }); }
    const stuck = open.filter(t => Array.isArray(t.labels) && t.labels.includes('blocked'));
    if (stuck.length) add('blocked', { title: stuck.length === 1 ? `Blocked: ${stuck[0].title}` : `${stuck.length} tasks blocked`, sub: 'Someone is stuck. Can you unblock it?', act: 'Unblock', go: 'tasks', ref: stuck[0].id, n: stuck.length });
    // 5. open comments on the website
    const cm = (base.readJSON(`.tribe/website/${safe(pid)}.comments.json`, []) || []).filter(c => c && (c.status || 'open') === 'open');
    if (cm.length) add('comments', { title: `${cm.length} open comment${cm.length === 1 ? '' : 's'} on the website`, sub: cm.slice(0, 2).map(c => `“${str(c.text, 60)}”`).join(' · '), act: 'Open designer', go: 'site', n: cm.length });
    // 6. company health: an open seat, a missed ritual, a blocked seat
    try {
      const v = company.view ? company.view(pid, me) : null, co = v && v.company;
      if (co && co.on !== false) {
        const openSeats = co.seats.filter(x => !x.holder.person && !x.holder.agent), blocked = co.seats.filter(x => x.status === 'blocked');
        if (blocked.length) add('company', { title: `${blocked[0].title} seat is blocked`, sub: (v.health && v.health.text) || '', act: 'Open Company', go: 'company' });
        else if (openSeats.length) add('company', { bump: 1, title: openSeats.length === 1 ? `The ${openSeats[0].title} seat is open` : `${openSeats.length} seats are open`, sub: 'Give it to a person or an AI helper.', act: 'Fill the seat', go: 'company', seat: openSeats[0].id });
        const r = v.rituals || {}, missed = ['standup', 'weekly'].find(k => r[k] && r[k].on && r[k].last && Date.now() - Date.parse(r[k].last) > (k === 'standup' ? 3 : 9) * 864e5);
        if (missed) add('company', { bump: 2, title: missed === 'standup' ? 'The daily standup was missed' : 'The weekly review was missed', sub: `Last ran ${String(r[missed].last).slice(0, 10)}`, act: 'Run it now', go: 'company' });
      }
    } catch {}
    // 7. setup gaps (leads only): no GitHub, no backup
    if (isLead(me, pid)) {
      const p = P.get(pid) || {};
      let gh = false; try { const s = p.repo ? hubFor(pid).status() : null; gh = !!(s && s.remote && s.remote.github); } catch {}
      const started = tasks.length > 0 || !!siteOf(pid) || !!designOf(pid);
      if (started && !gh) add('setup', { title: 'No GitHub connected', sub: 'Your code has no online copy yet.', act: 'Connect GitHub', go: 'github' });
      const bk = base.readJSON('.tribe/backup.json', null), last = bk && Date.parse(bk.last);
      if (started && (!last || Date.now() - last > 30 * 864e5)) add('setup', { bump: 1, title: last ? 'No backup in a month' : 'No backup yet', sub: 'Download a copy of the tribe folder.', act: 'Back up now', go: 'backup' });
    }
    // 8. unread mentions
    let men = []; try { men = (notify.unreadItems ? notify.unreadItems(me.id) : []).filter(i => i.type === 'mention' && (!i.project || i.project === pid)); } catch {}
    if (men.length) add('mention', { title: men.length === 1 ? men[0].title || 'You were mentioned' : `${men.length} unread mentions`, sub: men.length === 1 ? str(men[0].body, 100) : '', act: 'Read', go: men.length === 1 && men[0].view === 'docs' && men[0].ref ? 'doc' : 'inbox', ref: men[0].ref || null, n: men.length });
    out.sort((a, b) => a.rank - b.rank);
    return { items: out, total: out.length };
  }

  // A build or preview result: from an agent (POST /api/dash/signal) or from the host's own runner (server/checks.js,
  // which adds the run's id, duration and failing lines).
  function signal(pid, o) {
    const k = o.kind === 'preview' ? 'preview' : 'build';
    const d = read(), s = d.signals[pid] = d.signals[pid] || {};
    const was = s[k] && s[k].ok;
    s[k] = { ok: o.ok !== false, text: str(o.text, 200), at: new Date().toISOString(), by: o.by };
    if (o.source === 'checks') Object.assign(s[k], { source: 'checks', run: str(o.run, 40), ms: Math.max(0, Number(o.ms) || 0), state: str(o.state, 12), lines: (Array.isArray(o.lines) ? o.lines : []).slice(0, 5).map(l => str(l, 200)) });
    write(d);
    if (was !== s[k].ok || o.source === 'checks') broadcast({ type: 'dashband', project: pid });
    return s[k];
  }

  // ---------- routes ----------
  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current() || P.defaultId();
    try {
      if (b === 'band' && m === 'GET') return send(res, 200, { band: band(pid, me) });
      if (b === 'criticals' && m === 'GET') return send(res, 200, criticals(pid, me));
      if (b === 'main' && (m === 'PUT' || m === 'POST')) {
        const body = await readBody(req); const want = body.project ? String(body.project) : null;
        if (want && (!P.get(want) || !P.canSee(me, want))) throw err(404, 'project not found');
        if (!isLead(me, want || pid)) throw err(403, 'only the host or the project lead can pin the main project');
        const d = read(); if (want) d.main = want; else delete d.main; write(d);
        broadcast({ type: 'dashband', project: want || pid });
        return send(res, 200, { band: band(pid, me) });
      }
      if (b === 'show' && (m === 'PUT' || m === 'POST')) {
        if (!canSwitch(me, pid)) throw err(403, 'spectators can only look');
        const body = await readBody(req), s = String(body.show || '');
        const d = read(); if (KINDS.includes(s)) d.show[pid] = s; else delete d.show[pid]; write(d);
        broadcast({ type: 'dashband', project: pid });
        return send(res, 200, { band: band(pid, me) });
      }
      if (b === 'signal' && m === 'POST') {
        if (me.role === 'spectator') throw err(403, 'spectators can only look');
        const body = await readBody(req);
        signal(pid, { kind: body.kind, ok: body.ok, text: body.text, by: me.id });
        return send(res, 200, { ok: true });
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }
  return { route, band, criticals, mainFor, signal };
};
