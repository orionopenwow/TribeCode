// Who sent what (p12, docs/COPIES.md): a short history of the changes that reached the tribe, for the "Send my changes ·
// Get the latest" control by the tribe status (app/ui/tribestatus.js). It listens to the same events the editors already
// broadcast when a save lands (site-config, app-config, doc saves) and keeps the last 60, with repeats by the same person
// on the same thing within two minutes folded into one line ("Camp sent 4 changes to the website").
//
// Kept in .tribe/copies-log.json (never in a project folder, so never on GitHub). Holds names and what changed, never
// the content.
//
// HTTP (members): GET /api/copies/log -> { log: [{ at, by, name, what, project, n }] }   only projects they can see
'use strict';

const WHAT = { 'site-config': 'website', 'app-config': 'app', doc: 'doc', 'doc-saved': 'doc', docs: 'doc', task: 'task' };
const FOLD_MS = 2 * 60 * 1000, KEEP = 60, FILE = '.tribe/copies-log.json';

module.exports = function copies({ base, P, nameOf = id => id }) {
  let log = null;
  const load = () => (log = log || (() => { const l = base.readJSON(FILE, []); return Array.isArray(l) ? l : []; })());
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { base.writeJSON(FILE, load().slice(-KEEP)); } catch {} }, 500); if (saveT.unref) saveT.unref(); };

  // called from broadcast() for every event; only real saves by a person are kept
  function note(msg) {
    const what = WHAT[String(msg && msg.type || '')]; if (!what || !msg.project) return;
    const by = typeof msg.by === 'string' ? msg.by : (msg.by && msg.by.id) || msg.savedBy || ''; if (!by) return;
    if (what === 'task' && !msg.saved) return;   // tasks are many and noisy; only folded saves would be useful, so skip
    const l = load(), now = Date.now(), last = l[l.length - 1];
    if (last && last.by === by && last.what === what && last.project === msg.project && now - last.at < FOLD_MS) { last.n = (last.n || 1) + 1; last.at = now; }
    else l.push({ at: now, by, what, project: msg.project, n: 1 });
    if (l.length > KEEP * 2) l.splice(0, l.length - KEEP);
    save();
  }
  async function route(req, res, { m, me, send }) {
    if (m !== 'GET') return send(res, 405, { error: 'GET only' });
    const out = load().filter(e => !P || P.canSee(me, e.project)).slice(-20).reverse()
      .map(e => ({ ...e, name: String(nameOf(e.by) || 'Someone'), project: e.project }));
    return send(res, 200, { log: out });
  }
  return { note, route, list: () => load().slice() };
};
