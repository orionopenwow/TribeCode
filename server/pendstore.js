// Pending one-time things that must survive a restart (harden, docs/REVIEW-2026-11-12.md): email links and provider
// sign-up tickets (server/accounts.js), the desktop app's handoff codes (server/oauth.js). Keys are already hashes
// (sha256 of the token or code), so the file never holds anything that can be redeemed. The file is 0600, written
// atomically on every change, and expired entries (value.expires, ms) are dropped on load and on every write.
//   const ps = pendStore(file, { max })   ps.get/set/delete/has/values/entries/size/save()/prune()
'use strict';
const fs = require('node:fs');
const path = require('node:path');

module.exports = function pendStore(file, { max = 5000, log = () => {} } = {}) {
  const m = new Map();
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8')), now = Date.now();
    for (const [k, v] of Array.isArray(d.items) ? d.items : []) if (typeof k === 'string' && v && Number(v.expires) > now && !v.used) m.set(k, v);
  } catch {}
  function prune() { const now = Date.now(); for (const [k, v] of m) if (!(Number(v.expires) > now) || v.used) m.delete(k); }
  function save() {
    prune();
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, items: [...m] }), { mode: 0o600 });
      try { fs.chmodSync(tmp, 0o600); } catch {}
      fs.renameSync(tmp, file);
    } catch (e) { log(`pending store: ${e.message}`); }
  }
  setInterval(() => { const n = m.size; prune(); if (m.size !== n) save(); }, 60_000).unref();
  return {
    get: k => { const v = m.get(k); return v && Number(v.expires) > Date.now() ? v : undefined; },
    has: k => m.has(k),
    set(k, v) { prune(); if (m.size >= max && !m.has(k)) throw Object.assign(new Error('too many sign-ins in progress: try again in a few minutes'), { status: 429 }); m.set(k, v); save(); return this; },
    delete(k) { const r = m.delete(k); if (r) save(); return r; },
    values: () => m.values(), entries: () => m.entries(), [Symbol.iterator]: () => m[Symbol.iterator](),
    get size() { return m.size; },
    save, prune,
  };
};
