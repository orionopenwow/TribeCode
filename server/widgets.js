// Sidebar widgets: the extra rows a tribe adds under a project's core rows (Dashboard · Messages · Files · Task Board ·
// Agents Hub), and the two rows that show by themselves when they apply (Preview game / app / site…, labelled by what
// the project is: server/sense.js, then the shelf's types; and Website).
//
//   GET /api/projects/:id/widgets   { widgets, canEdit, preview: { show, label }, website: { show } }
//   PUT /api/projects/:id/widgets   { widgets: [...] }   the whole list (add, remove, re-order); host and builders only
//
// A widget is { id, kind: 'builtin', key } (an existing view: calendar, bugs, board, milestones, repo, visuals, website,
// preview, workshop, plan, secretary, whiteboard) or { id, kind: 'link', name, emoji, url } (opens in the preview pane) or
// { id, kind: 'doc', name, emoji, doc } (a pinned doc, also in the preview pane). Saved per project for the whole tribe
// in .tribe/widgets.json; a change is broadcast as { type: 'widgets', project }.
//
// feat/widgets-v2: live cards. { id, kind: 'card', key, title? } is a small card in the sidebar (CARDS below) that shows
// real data (tasks, presence, milestones, the website, the build…) or keeps its own shared state (a note, a checklist,
// bookmarks, a countdown, a poll) in .tribe/widget-data.json, keyed "<scope>|<widget id>".
//   GET  /api/widgets/home              Home's cards: personal, one list per member ({ widgets, canEdit, data })
//   PUT  /api/widgets/home              { widgets }
//   POST /api/widgets/act               { scope: <project id> | 'home', wid, op, ... }   a card's own state (ops below)
// Project data is written by the host and builders (poll votes: every member who can see the project but spectators);
// Home data only by its owner. A change is broadcast as { type: 'widgets', project, wid } or { type: 'widgets', home }.
'use strict';
const crypto = require('node:crypto');

const BUILTIN = ['calendar', 'bugs', 'board', 'milestones', 'repo', 'visuals', 'website', 'preview', 'workshop', 'plan', 'secretary', 'whiteboard', 'captures', 'assets', 'mcp', 'market'];   // v0.27 company: + captures, assets, mcp, market
const MAX = 24;
// feat/widgets-v2: the live cards. multi: more than one allowed; home: can sit on Home too
const CARDS = {
  timeline: {}, ritual: {}, mytasks: {}, presence: { home: 1 }, activity: { home: 1 }, sitestatus: {}, thumb: {}, build: {},
  note: { multi: 1, home: 1 }, bookmarks: { multi: 1, home: 1 }, inspo: {}, checklist: { multi: 1, home: 1 }, countdown: { multi: 1, home: 1 },
  clocks: { home: 1 }, ship: {}, tip: { home: 1 }, credits: { home: 1 }, poll: { multi: 1 }, quickdocs: { home: 1 },
};

module.exports = function widgets({ P, store, broadcast, preview, showcase, shelf, sense, can = null }) {   // can(me, cap, pid): feat/roles
  const FILE = '.tribe/widgets.json';
  let all = store.readJSON(FILE, {});
  if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  const save = () => store.writeJSON(FILE, all);
  const err = (status, m) => Object.assign(new Error(m), { status });
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

  const roleIn = (me, pid) => ((P.get(pid) || {}).members || {})[me.id] || me.role;
  const canEdit = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator' && (!can || can(me, 'widgets.edit', pid));

  function clean(list, home = false) {
    if (!Array.isArray(list)) throw err(400, 'widgets must be a list');
    if (list.length > MAX) throw err(400, `at most ${MAX} widgets per project`);
    const seen = new Set(), out = [];
    for (const w of list) {
      if (!w || typeof w !== 'object') continue;
      const id = /^[a-z0-9-]{4,40}$/.test(w.id || '') ? w.id : 'w-' + crypto.randomBytes(5).toString('hex');
      if (seen.has(id)) continue;
      if (w.kind === 'builtin') {
        if (!BUILTIN.includes(w.key)) throw err(400, `unknown widget: ${str(w.key, 40)}`);
        if (out.some(x => x.kind === 'builtin' && x.key === w.key)) continue;   // one of each
        out.push({ id, kind: 'builtin', key: w.key });
      } else if (w.kind === 'card') {
        const c = CARDS[w.key]; if (!c) throw err(400, `unknown widget: ${str(w.key, 40)}`);
        if (home && !c.home) throw err(400, `${str(w.key, 40)} only works inside a project`);
        if (!c.multi && out.some(x => x.kind === 'card' && x.key === w.key)) continue;   // one of each, unless it allows more
        const title = str(w.title, 40);
        out.push({ id, kind: 'card', key: w.key, ...(title ? { title } : {}) });
      } else if (home && w.kind !== 'link') {
        throw err(400, 'Home holds cards and links');
      } else if (w.kind === 'link' || w.kind === 'doc') {
        const name = str(w.name, 40); if (!name) throw err(400, 'give the widget a name');
        const emoji = str(w.emoji, 8);
        if (w.kind === 'link') {
          let u; try { u = new URL(str(w.url, 2000)); } catch { throw err(400, 'that link is not a full web address (https://…)'); }
          if (!/^https?:$/.test(u.protocol)) throw err(400, 'links must start with http:// or https://');
          out.push({ id, kind: 'link', name, emoji, url: u.href });
        } else {
          const doc = str(w.doc, 120); if (!/^[a-z0-9][a-z0-9-]*$/i.test(doc)) throw err(400, 'pick a doc to pin');
          out.push({ id, kind: 'doc', name, emoji, doc });
        }
      } else throw err(400, 'unknown widget kind');
      if (home && w.kind === 'builtin') throw err(400, 'Home holds cards and links');
      seen.add(id);
    }
    return out;
  }

  // The rows that show by themselves: Preview (labelled by what the project is) and Website (once built or set up).
  function auto(pid, me) {
    const p = P.get(pid);
    let pv = { show: false, label: 'Preview' };
    try {
      const s = preview.status(pid, me);
      if (s.hasRepo && s.hasIndex) {
        let types = []; try { types = shelf.view(p).types || []; } catch {}
        // what the crew is making, sensed from the project (shelf: template, bio, name, what the repo uses)
        // project sense (server/sense.js) wins when it is sure (name, bio, vision, repo, tasks, chat; or the host's pick)
        const sensed = sense ? sense.kindFor(pid) : '';
        const kind = sensed ? sensed : types.includes('3d') ? '3d' : types.includes('game') || types.includes('platformer') || types.includes('rpg') ? 'game'
          : types.includes('app') ? 'app' : types.includes('site') ? 'site' : types.includes('tool') ? 'tool' : types.includes('notes') ? 'notes' : '';
        const LABEL = { game: 'Preview game', '3d': 'Preview 3D scene', app: 'Preview app', site: 'Preview site', tool: 'Try the tool', bot: 'Try the bot', api: 'Preview API', notes: 'Preview' };
        pv = { show: true, kind, label: LABEL[kind] || 'Preview' };
      }
    } catch {}
    let site = false;
    try { const st = showcase.load(pid) || {}; site = !!(st.built || st.auto || showcase.exists(pid) || (showcase.started && showcase.started(pid))); } catch {}   // feat/site-v2: a designer draft, a built page or a started site
    return { preview: pv, website: { show: site } };
  }

  // v0.27 company: one widget from the Marketplace (server/market.js); skips duplicates (same built-in key or same link)
  function addOne(pid, w, me) {
    if (!P.get(pid) || !P.canSee(me, pid)) throw err(404, 'project not found');
    if (!canEdit(me, pid)) throw err(403, 'only the host and builders can change the sidebar');
    const cur = all[pid] || [];
    const [one] = clean([w]);
    if (cur.some(x => x.kind === one.kind && (one.kind === 'builtin' ? x.key === one.key : one.kind === 'link' ? x.url === one.url : x.doc === one.doc))) return { already: true, widgets: cur };
    all[pid] = clean([...cur, one]); save();
    broadcast({ type: 'widgets', project: pid });
    return { widgets: all[pid] };
  }

  // feat/market-v2: the Marketplace's Remove takes back the one widget it added
  function removeOne(pid, w, me) {
    if (!P.get(pid) || !P.canSee(me, pid)) throw err(404, 'project not found');
    if (!canEdit(me, pid)) throw err(403, 'only the host and builders can change the sidebar');
    const [one] = clean([w]); const cur = all[pid] || [];
    const left = cur.filter(x => !(one && x.kind === one.kind && (one.kind === 'builtin' ? x.key === one.key : one.kind === 'link' ? x.url === one.url : x.doc === one.doc)));
    if (left.length === cur.length) return { gone: true, widgets: cur };
    if (left.length) all[pid] = left; else delete all[pid];
    save(); broadcast({ type: 'widgets', project: pid });
    return { widgets: all[pid] || [] };
  }
  function view(pid, me) { const list = all[pid] || []; return { widgets: list, canEdit: canEdit(me, pid), canVote: canVote(me, pid), builtin: BUILTIN, cards: Object.keys(CARDS), data: dataFor(pid, list, me), ...auto(pid, me) }; }

  // ---------- feat/widgets-v2: the cards' own state ----------
  const DFILE = '.tribe/widget-data.json';
  let data = store.readJSON(DFILE, {}); if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  const saveData = () => store.writeJSON(DFILE, data);
  const homeKey = me => '~home:' + me.id;
  const canVote = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator';
  const nid = () => crypto.randomBytes(4).toString('hex');
  function shown(key, d, me) {   // what a member sees of one card's state
    if (!d) return null;
    if (key !== 'poll') return d;
    const counts = (d.options || []).map((_, i) => Object.values(d.votes || {}).filter(v => v === i).length);
    const mine = me && d.votes && Number.isInteger(d.votes[me.id]) ? d.votes[me.id] : null;
    return { q: d.q, options: d.options, counts, total: counts.reduce((a, b) => a + b, 0), mine, at: d.at };
  }
  function dataFor(scope, list, me) {
    const out = {};
    for (const w of list) if (w.kind === 'card' && data[scope + '|' + w.id]) out[w.id] = shown(w.key, data[scope + '|' + w.id], me);
    return out;
  }
  function prune(scope, list) {   // a removed card takes its state with it
    const keep = new Set(list.map(w => scope + '|' + w.id)); let n = 0;
    for (const k of Object.keys(data)) if (k.startsWith(scope + '|') && !keep.has(k)) { delete data[k]; n++; }
    if (n) saveData();
  }
  function act(me, body) {
    const home = body.scope === 'home', scope = home ? homeKey(me) : String(body.scope || '');
    if (!home && (!P.get(scope) || !P.canSee(me, scope))) throw err(404, 'project not found');
    const w = (all[scope] || []).find(x => x.id === body.wid && x.kind === 'card'); if (!w) throw err(404, 'that widget is gone');
    const op = String(body.op || ''), vote = w.key === 'poll' && op === 'vote';
    if (home ? me.role === 'agent' : !(vote ? canVote(me, scope) : canEdit(me, scope))) throw err(403, vote ? 'spectators can only look' : 'only the host and builders can change this widget');
    const k = scope + '|' + w.id, d = data[k] = data[k] || {}, stamp = () => { d.at = new Date().toISOString(); d.by = me.id; };
    const item = () => { const it = (d.items || []).find(x => x.id === body.item); if (!it) throw err(404, 'that item is gone'); return it; };
    if (op === 'title') { const t = str(body.title, 40); if (t) w.title = t; else delete w.title; save(); }
    else if (w.key === 'note' && op === 'set') { d.text = String(body.text == null ? '' : body.text).slice(0, 4000); stamp(); }
    else if (w.key === 'checklist' && op === 'add') { const t = str(body.text, 140); if (!t) throw err(400, 'write something first'); d.items = d.items || []; if (d.items.length >= 40) throw err(400, 'at most 40 items'); d.items.push({ id: nid(), text: t, done: false }); stamp(); }
    else if (w.key === 'checklist' && op === 'toggle') { const it = item(); it.done = !it.done; stamp(); }
    else if ((w.key === 'checklist' || w.key === 'bookmarks') && op === 'del') { item(); d.items = d.items.filter(x => x.id !== body.item); stamp(); }
    else if (w.key === 'checklist' && op === 'clear') { d.items = (d.items || []).filter(x => !x.done); stamp(); }
    else if (w.key === 'bookmarks' && op === 'add') {
      const name = str(body.name, 40); let u; try { u = new URL(str(body.url, 2000)); } catch { throw err(400, 'that link is not a full web address (https://…)'); }
      if (!/^https?:$/.test(u.protocol)) throw err(400, 'links must start with http:// or https://');
      d.items = d.items || []; if (d.items.length >= 20) throw err(400, 'at most 20 links');
      d.items.push({ id: nid(), name: name || u.hostname, url: u.href }); stamp();
    }
    else if (w.key === 'countdown' && op === 'set') {
      const t = str(body.title, 60), at = str(body.date, 40); if (!t || !at || isNaN(Date.parse(at))) throw err(400, 'give it a name and a date');
      d.title = t; d.date = at; stamp();
    }
    else if (w.key === 'poll' && op === 'set') {
      const q = str(body.q, 140), opts = (Array.isArray(body.options) ? body.options : []).map(o => str(o, 60)).filter(Boolean).slice(0, 6);
      if (!q || opts.length < 2) throw err(400, 'a question and at least two choices');
      data[k] = { q, options: opts, votes: {}, at: new Date().toISOString(), by: me.id };
    }
    else if (w.key === 'poll' && op === 'vote') {
      if (!d.options) throw err(409, 'there is no question yet');
      const i = Number(body.opt); if (!Number.isInteger(i) || i < 0 || i >= d.options.length) throw err(400, 'pick one of the choices');
      d.votes = d.votes || {}; if (d.votes[me.id] === i) delete d.votes[me.id]; else d.votes[me.id] = i;
    }
    else if (w.key === 'poll' && op === 'reset') { d.votes = {}; stamp(); }
    else throw err(400, 'unknown action');
    saveData();
    broadcast(home ? { type: 'widgets', home: me.id, wid: w.id } : { type: 'widgets', project: scope, wid: w.id });
    return { widget: w, data: shown(w.key, data[k], me) };
  }
  function homeView(me) { const k = homeKey(me), list = all[k] || []; return { widgets: list, canEdit: me.role !== 'agent', canVote: false, home: true, cards: Object.keys(CARDS).filter(x => CARDS[x].home), data: dataFor(k, list, me) }; }
  async function routeAll(req, res, { m, b, me, readBody, send, fail }) {   // /api/widgets/...
    if (!me) return fail(res, 401, 'not a member of this tribe');
    try {
      if (b === 'home' && m === 'GET') return send(res, 200, homeView(me));
      if (b === 'home' && (m === 'PUT' || m === 'POST')) {
        if (me.role === 'agent') return fail(res, 403, 'agents have no Home');
        const body = await readBody(req, 64 * 1024), list = clean(body.widgets, true), k = homeKey(me);
        if (list.length) all[k] = list; else delete all[k];
        save(); prune(k, list); broadcast({ type: 'widgets', home: me.id });
        return send(res, 200, homeView(me));
      }
      if (b === 'act' && m === 'POST') return send(res, 200, act(me, await readBody(req, 64 * 1024)));
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!P.get(b) || !P.canSee(me, b)) return fail(res, 404, 'project not found');
    try {
      if (m === 'GET') return send(res, 200, view(b, me));
      if (m === 'PUT' || m === 'POST') {
        if (!canEdit(me, b)) return fail(res, 403, 'only the host and builders can change the sidebar');
        const body = await readBody(req, 64 * 1024);
        const list = clean(body.widgets);
        if (list.length) all[b] = list; else delete all[b];
        save(); prune(b, list);
        broadcast({ type: 'widgets', project: b });
        return send(res, 200, view(b, me));
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  return { route, routeAll, view, addOne, removeOne, BUILTIN, CARDS: Object.keys(CARDS) };
};
