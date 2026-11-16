// Launch kit storage (docs/LAUNCH-KIT.md): one small record per project with the store text, the screenshot plan, the
// icon, the paywall design, the checklist ticks and notes. The pictures themselves are drawn in the browser
// (app/ui/launchkit-draw.js) and never stored here; uploaded screens go to Visuals like any other screenshot.
//   GET /api/projects/:id/launchkit          -> { kit, canEdit }
//   PUT /api/projects/:id/launchkit { kit }  -> { kit }     builders and the host; spectators read only
// Stored in .tribe/launchkit.json { projects: { <pid>: kit } }. A change goes out as { type: 'launchkit', project }.
'use strict';
const core = require('../app/ui/launchkit-core.js');

module.exports = function launchkit({ P, base, broadcast }) {
  const FILE = '.tribe/launchkit.json';
  let db = null;
  const load = () => { if (!db) { db = base.readJSON(FILE, { projects: {} }); if (!db.projects || typeof db.projects !== 'object') db.projects = {}; } return db; };
  const get = pid => core.norm(load().projects[pid]);
  const canEdit = (me, pid) => !!me && me.role !== 'spectator' && (((P.get(pid) || {}).members || {})[me.id] !== 'spectator');

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    const pid = b;
    if (!pid || !P.get(pid)) return fail(res, 404, 'no such project');
    if (P.canSee && !P.canSee(me, pid)) return fail(res, 403, 'not in this project');
    if (m === 'GET') return send(res, 200, { kit: get(pid), canEdit: canEdit(me, pid) });
    if (m === 'PUT') {
      if (!canEdit(me, pid)) return fail(res, 403, 'spectators can look but not change the launch kit');
      const body = await readBody(req, 2 * 1024 * 1024);
      const kit = core.norm(body && body.kit);
      load().projects[pid] = kit; base.writeJSON(FILE, db);
      broadcast({ type: 'launchkit', project: pid, by: me.id });
      return send(res, 200, { kit });
    }
    return fail(res, 405, 'GET or PUT');
  }
  return { route, get };
};
