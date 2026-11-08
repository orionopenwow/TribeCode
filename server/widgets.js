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
'use strict';
const crypto = require('node:crypto');

const BUILTIN = ['calendar', 'bugs', 'board', 'milestones', 'repo', 'visuals', 'website', 'preview', 'workshop', 'plan', 'secretary', 'whiteboard'];
const MAX = 24;

module.exports = function widgets({ P, store, broadcast, preview, showcase, shelf, sense, can = null }) {   // can(me, cap, pid): feat/roles
  const FILE = '.tribe/widgets.json';
  let all = store.readJSON(FILE, {});
  if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  const save = () => store.writeJSON(FILE, all);
  const err = (status, m) => Object.assign(new Error(m), { status });
  const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

  const roleIn = (me, pid) => ((P.get(pid) || {}).members || {})[me.id] || me.role;
  const canEdit = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator' && (!can || can(me, 'widgets.edit', pid));

  function clean(list) {
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
    try { const st = showcase.load(pid) || {}; site = !!(st.built || st.auto || showcase.exists(pid)); } catch {}
    return { preview: pv, website: { show: site } };
  }

  function view(pid, me) { return { widgets: all[pid] || [], canEdit: canEdit(me, pid), builtin: BUILTIN, ...auto(pid, me) }; }

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
        save();
        broadcast({ type: 'widgets', project: b });
        return send(res, 200, view(b, me));
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  return { route, view, BUILTIN };
};
