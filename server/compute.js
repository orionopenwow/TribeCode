// Shared compute (quiet, opt-in): people lend their computer for the tribe's heavy repo work (builds, test runs,
// analysis). It lives in a project's Helpers list and only shows once a project has a repo and more than one person.
// Step 1 (this file): who lends, how much, whether they're online. Step 2 (docs/SHARED-COMPUTE.md): the host splits
// heavy builds and checks into jobs that lenders' desktop apps pull, run in a sandbox on a clean checkout, and return.
// Routes: GET /api/compute -> { mine, helpers }, PUT /api/compute { on, cores }.
'use strict';
module.exports = function compute({ store, str, getMembers, isOnline, broadcast }) {
  const FILE = '.tribe/compute.json';
  const db = Object.assign({ lend: {} }, store.readJSON(FILE, {}));
  const save = () => store.writeJSON(FILE, db);
  const view = () => getMembers().filter(m => m.role !== 'agent' && db.lend[m.id] && db.lend[m.id].on)
    .map(m => ({ id: m.id, name: m.name, color: m.color, cores: db.lend[m.id].cores || null, since: db.lend[m.id].since, online: isOnline(m.id) }));
  async function route(req, res, { m, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    if (m === 'GET') return send(res, 200, { mine: db.lend[me.id] || { on: false }, helpers: view() });
    if (m === 'PUT') {
      if (me.role === 'agent' || me.role === 'spectator') return fail(res, 403, 'only people can lend their computer');
      const b = await readBody(req); const on = !!b.on, cores = Math.max(1, Math.min(256, Number(b.cores) || 0)) || null;
      db.lend[me.id] = on ? { on, cores, since: (db.lend[me.id] && db.lend[me.id].on && db.lend[me.id].since) || new Date().toISOString() } : { on: false };
      save(); broadcast({ type: 'compute' });
      return send(res, 200, { mine: db.lend[me.id], helpers: view() });
    }
    return fail(res, 405, 'GET or PUT');
  }
  return { route, helpers: view };
};
