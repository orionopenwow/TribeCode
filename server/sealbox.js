// Secrets this server must be able to read back (a TOTP secret, the Stripe keys) are never written in the clear:
// AES-256-GCM with a key that lives in its own 0600 file (.tribe/secret.key, made on first use). The files that hold the
// sealed values are 0600 too. Losing secret.key loses those values (people set up two-step again; the host pastes the
// keys again), which is the point: a copy of one file alone opens nothing.
//   const box = sealbox(store);  box.seal('text') -> 'v1.<base64url>'   box.open('v1.…') -> 'text' | ''
//   box.writeJSON(rel, obj)  atomic, 0600
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function sealbox(store) {
  let key = null;
  function getKey() {
    if (key) return key;
    const f = store.p('.tribe', 'secret.key');
    try { const k = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64url'); if (k.length === 32) { try { fs.chmodSync(f, 0o600); } catch {} return (key = k); } } catch {}
    const k = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { fs.writeFileSync(f, k.toString('base64url'), { mode: 0o600, flag: 'wx' }); key = k; }
    catch { key = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64url'); }   // another start made it first
    try { fs.chmodSync(f, 0o600); } catch {}
    return key;
  }
  function seal(text) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return 'v1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
  }
  function open(sealed) {
    try {
      if (typeof sealed !== 'string' || !sealed.startsWith('v1.')) return '';
      const b = Buffer.from(sealed.slice(3), 'base64url'); if (b.length < 28) return '';
      const d = crypto.createDecipheriv('aes-256-gcm', getKey(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    } catch { return ''; }
  }
  function writeJSON(rel, obj) {
    const f = store.p(rel), tmp = f + '.' + process.pid + '.tmp';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
    try { fs.chmodSync(tmp, 0o600); } catch {}
    fs.renameSync(tmp, f);
  }
  return { seal, open, writeJSON };
};
