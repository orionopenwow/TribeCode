// Flint's project memory (feat/flint-local): a small list of facts about the project (names, dates, decisions, words)
// that Flint gathers in each member's browser as people work (app/ui/flintfacts.js) and uses in answers and drafts.
// Stored WITH the project (<project>/.tribe/flint-facts.json), visible and editable by its members
// ("What Flint knows about this project"), and never sent to any outside service by this module.
//   GET    /api/flint/facts            -> { facts: [{ id, kind, key, value, from, at, by }] }
//   POST   /api/flint/facts            { facts: [{ kind, key, value, from? }] }   add or update by (kind, key)
//   PUT    /api/flint/facts/<id>       { key?, value? }
//   DELETE /api/flint/facts/<id>       one;   DELETE /api/flint/facts   all (builders and up)
'use strict';
const KINDS = ['name', 'date', 'decision', 'term', 'person', 'link', 'fact'];
const FILE = '.tribe/flint-facts.json', MAX = 300;

module.exports = function flintFacts({ store, str, broadcast = () => {} }) {
  const load = () => { const j = store.readJSON(FILE, null); return j && Array.isArray(j.facts) ? j.facts : []; };
  const save = facts => { store.writeJSON(FILE, { about: 'What Flint knows about this project. Made on members\' devices, kept here, never sent anywhere.', facts: facts.slice(-MAX) }); try { broadcast({ type: 'flint-facts' }); } catch {} };
  const nid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const norm = k => String(k || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const clean = (f, me) => { const kind = KINDS.includes(f && f.kind) ? f.kind : 'fact', key = str(f && f.key, 80).trim(), value = str(f && f.value, 300).trim(); return key && value ? { kind, key, value, from: str(f.from, 60) || undefined, at: new Date().toISOString(), by: me.id } : null; };
  async function route(req, res, { m, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'spectator') return m === 'GET' ? send(res, 200, { facts: load() }) : fail(res, 403, 'viewers can\'t change what Flint knows');
    const facts = load();
    if (m === 'GET' && !c) return send(res, 200, { facts });
    if (m === 'POST' && !c) {
      const body = await readBody(req), list = (Array.isArray(body.facts) ? body.facts : [body]).slice(0, 40); let n = 0;
      for (const raw of list) { const f = clean(raw, me); if (!f) continue; const old = facts.find(x => x.kind === f.kind && norm(x.key) === norm(f.key)); if (old) { if (old.pinned) continue; Object.assign(old, f); } else facts.push({ id: nid(), ...f }); n++; }
      if (n) save(facts); return send(res, 200, { facts: load(), saved: n });
    }
    if (m === 'DELETE' && !c) { save([]); return send(res, 200, { facts: [] }); }
    const f = facts.find(x => x.id === c); if (!f) return fail(res, 404, 'no such fact');
    if (m === 'PUT') { const body = await readBody(req); if (body.key !== undefined) f.key = str(body.key, 80).trim() || f.key; if (body.value !== undefined) f.value = str(body.value, 300).trim() || f.value; if (KINDS.includes(body.kind)) f.kind = body.kind; f.pinned = true; f.at = new Date().toISOString(); f.by = me.id; save(facts); return send(res, 200, { fact: f }); }
    if (m === 'DELETE') { save(facts.filter(x => x.id !== c)); return send(res, 200, { ok: true }); }
    return fail(res, 405, 'not allowed');
  }
  return { route, load, KINDS };
};
