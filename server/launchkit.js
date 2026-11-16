// Launch kit storage (docs/LAUNCH-KIT.md): one small record per project with the store text, the screenshot plan, the
// icon, the paywall design, the checklist ticks and notes. The pictures themselves are drawn in the browser
// (app/ui/launchkit-draw.js) and never stored here; uploaded screens go to Visuals like any other screenshot.
//   GET /api/projects/:id/launchkit          -> { kit, canEdit }
//   PUT /api/projects/:id/launchkit { kit }  -> { kit }     builders and the host; spectators read only
// Stored in .tribe/launchkit.json { projects: { <pid>: kit } }. A change goes out as { type: 'launchkit', project }.
'use strict';
const core = require('../app/ui/launchkit-core.js');

module.exports = function launchkit({ P, base, broadcast, perms = null, requests = () => null }) {
  const FILE = '.tribe/launchkit.json';
  let db = null;
  const load = () => { if (!db) { db = base.readJSON(FILE, { projects: {} }); if (!db.projects || typeof db.projects !== 'object') db.projects = {}; } return db; };
  const get = pid => core.norm(load().projects[pid]);
  const mayRole = (me, pid) => !!me && me.role !== 'spectator' && (((P.get(pid) || {}).members || {})[me.id] !== 'spectator');
  const canEdit = (me, pid) => mayRole(me, pid) && (!perms || perms.can(me, 'launch.edit', pid));   // feat/cowork-editors: a row in the table (launch.edit)
  function set(pid, raw, me) { const kit = core.norm(raw); load().projects[pid] = kit; base.writeJSON(FILE, db); broadcast({ type: 'launchkit', project: pid, by: me ? me.id : null }); return kit; }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    const pid = b;
    if (!pid || !P.get(pid)) return fail(res, 404, 'no such project');
    if (P.canSee && !P.canSee(me, pid)) return fail(res, 403, 'not in this project');
    if (m === 'GET') return send(res, 200, { kit: get(pid), canEdit: canEdit(me, pid), canSuggest: mayRole(me, pid) && !canEdit(me, pid) });
    if (m === 'PUT') {
      const body = await readBody(req, 2 * 1024 * 1024);
      if (!canEdit(me, pid)) {
        if (mayRole(me, pid) && requests() && body && (me.role === 'agent' || body.asRequest)) return send(res, 202, requests().fromRefusal(pid, me, 'launch', body.kit || {}, { title: body.title, why: body.why, summary: body.summary, before: body.before, after: body.after }));
        if (perms) perms.can(me, 'launch.edit', pid);
        return fail(res, 403, mayRole(me, pid) ? 'changing the store page needs someone’s OK here: suggest the change instead' : 'spectators can look but not change the launch kit');
      }
      return send(res, 200, { kit: set(pid, body && body.kit, me) });
    }
    return fail(res, 405, 'GET or PUT');
  }
  return { route, get, set };
};
