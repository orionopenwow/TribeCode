// feat/auth3 (docs/ACCOUNTS.md › Two-step sign-in and passkeys): the second step of an account sign-in, and passkeys.
// Zero dependencies: TOTP is HMAC-SHA1 (RFC 6238), WebAuthn is checked with node:crypto and server/cbor.js.
//
// Two-step codes (TOTP)
//   Every account sign-in that proves who you are (password, provider, email link, reset, the desktop handoff) passes
//   one gate in server/accounts.js. With two-step on, the gate hands back { need: 'two-step', ticket } instead of a
//   session; POST two-step trades the ticket plus a code (or a recovery code, or this device's 30-day trust token, or a
//   passkey) for the sign-in it stood for. A ticket lasts 5 minutes, works once and dies after 5 wrong codes; 10 wrong
//   codes for one account within 15 minutes lock its second step for 15 minutes. Codes: 6 digits, 30 seconds, the step
//   before and after accepted, and a step that was used once is never accepted again (replay).
//
// Passkeys (WebAuthn)
//   The relying party id is the host name of the page (the request's Origin): localhost, tauri.localhost (the desktop
//   app on Windows) or the public https name. Plain http on a network address, an IP address and the tauri:// scheme
//   can't have passkeys, and the answer says so. Registration: none or packed attestation (never required). Every
//   ceremony checks the challenge (ours, single use, 5 minutes), the origin it was issued for, the rpIdHash, user
//   presence, the signature (ES256 or RS256) and the signature counter (it must go up when the authenticator counts).
//   A passkey sign-in counts as two-step.
//
// At rest: .tribe/auth3.json (0600, written atomically). TOTP secrets are sealed (server/sealbox.js: AES-256-GCM, the
// key in .tribe/secret.key, 0600); recovery codes and trust tokens are kept only as sha256; passkeys are public keys.
//
// Routes (under /api/accounts, same-origin JSON like the rest; Bearer tca_… where it says "account"):
//   GET    two-step             account   { on, since, recoveryLeft, trusted, required, passkeys }
//   POST   two-step/setup       account   { secret, uri }             a pending secret, 10 minutes
//   POST   two-step/confirm     account   { code } -> { ok, recovery: [10 codes, shown once] }
//   POST   two-step/disable     account   { code }  (a current code, or a recovery code)
//   POST   two-step/recovery    account   { code } -> { recovery }    ten fresh ones; the old ones stop working
//   DELETE two-step/trusted     account   forget every trusted device
//   POST   two-step             public    { ticket, code | recovery | trust, remember? } -> the sign-in (+ trust)
//   GET    passkeys             account   { passkeys, max }
//   POST   passkeys/options     account   -> { publicKey }            registration options
//   POST   passkeys             account   { credential, name? } -> { passkey }
//   PUT    passkeys/<id>        account   { name }
//   DELETE passkeys/<id>        account   (409 last: never the last way in)
//   POST   passkey/start        public    { ticket? } -> { publicKey }   discoverable; with a ticket, that account's keys
//   POST   passkey/finish       public    { credential, ticket?, remember? } -> the sign-in
'use strict';
const crypto = require('node:crypto');
const cbor = require('./cbor');
const sealbox = require('./sealbox');

const FILE = '.tribe/auth3.json';
const TEST = process.env.TRIBE_TEST === '1';
// 30 seconds (RFC 6238). A test can shorten it (TRIBE_TEST=1 with TRIBE_TEST_TOTP_STEP_MS).
const STEP_MS = TEST && Number(process.env.TRIBE_TEST_TOTP_STEP_MS) >= 1000 ? Number(process.env.TRIBE_TEST_TOTP_STEP_MS) : 30_000;
const TICKET_MS = 5 * 60_000, PENDING_MS = 10 * 60_000, CHALLENGE_MS = 5 * 60_000, TRUST_DAYS = 30;
const MAX_PASSKEYS = 10, MAX_TRUSTED = 10, TICKET_TRIES = 5, LOCK_N = 10, LOCK_MS = 15 * 60_000;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function b32encode(buf) { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(v << (5 - bits)) & 31]; return out; }
function b32decode(s) { let bits = 0, v = 0; const out = []; for (const ch of String(s).toUpperCase().replace(/[^A-Z2-7]/g, '')) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totpAt(secret, step) {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', secret).update(c).digest(), o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sha256 = b => crypto.createHash('sha256').update(b).digest();
const B64U = /^[A-Za-z0-9_-]{1,4096}$/;
const unb64 = s => (typeof s === 'string' && B64U.test(s) ? Buffer.from(s, 'base64url') : null);

// Which page is asking, and may it have passkeys? -> { origin, rpId } or { code, error }
function waOrigin(req) {
  let u; try { u = new URL(String(req.headers.origin || '')); } catch { return { code: 'origin', error: 'passkeys work from the TribeCode page itself: open it in a browser or the desktop app' }; }
  const host = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol)) return { code: 'scheme', error: 'passkeys are not available in this window: open TribeCode in a browser at its https address, or at http://localhost on this computer' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return { code: 'ip', error: 'passkeys need a name, not a number address: open TribeCode at http://localhost on this computer, or at its https address' };
  const local = host === 'localhost' || host.endsWith('.localhost');
  if (u.protocol === 'http:' && !local) return { code: 'insecure', error: 'passkeys need a secure address: this one is plain http on the network. Open TribeCode at its https address, or on the host computer at http://localhost' };
  return { origin: u.origin, rpId: host };
}

// A COSE public key (EC2 P-256 / ES256, or RSA / RS256) -> { alg, jwk }
function coseKey(m) {
  if (!(m instanceof Map)) throw new Error('no public key');
  const kty = m.get(1), alg = m.get(3);
  const b = k => { const v = m.get(k); if (!Buffer.isBuffer(v)) throw new Error('bad public key'); return v; };
  let jwk;
  if (kty === 2 && alg === -7 && m.get(-1) === 1) { const x = b(-2), y = b(-3); if (x.length !== 32 || y.length !== 32) throw new Error('bad public key'); jwk = { kty: 'EC', crv: 'P-256', x: x.toString('base64url'), y: y.toString('base64url') }; }
  else if (kty === 3 && alg === -257) { const n = b(-1), e = b(-2); if (n.length < 256 || n.length > 1024 || e.length > 8) throw new Error('bad public key'); jwk = { kty: 'RSA', n: n.toString('base64url'), e: e.toString('base64url') }; }
  else throw new Error('that kind of passkey is not supported (ES256 or RS256 only)');
  crypto.createPublicKey({ key: jwk, format: 'jwk' });   // throws when the point is not on the curve
  return { alg, jwk };
}
function verifySig(key, data, sig) { try { return crypto.verify('sha256', data, key, sig); } catch { return false; } }
// authenticator data: rpIdHash(32) flags(1) signCount(4) [aaguid(16) idLen(2) id COSE-key] [extensions]
function parseAuthData(ad, wantCred) {
  if (!Buffer.isBuffer(ad) || ad.length < 37) throw new Error('short authenticator data');
  const out = { rpIdHash: ad.subarray(0, 32), flags: ad[32], counter: ad.readUInt32BE(33) };
  out.up = !!(out.flags & 0x01); out.uv = !!(out.flags & 0x04); out.be = !!(out.flags & 0x08); out.bs = !!(out.flags & 0x10); out.at = !!(out.flags & 0x40);
  if (wantCred) {
    if (!out.at || ad.length < 55) throw new Error('no credential in the answer');
    const n = ad.readUInt16BE(53); if (n < 1 || n > 1023 || ad.length < 55 + n + 1) throw new Error('bad credential id');
    out.credId = Buffer.from(ad.subarray(55, 55 + n));
    out.key = coseKey(cbor.decodeFirst(ad, 55 + n).value);
  }
  return out;
}

module.exports = function makeAuth3({ store, hash, id, limited, log = () => {}, issueWith, redeemTok, pendSave, fromToken, accountById, usableCount, finish, memberFinish, isAdmin, required, forgetOnDelete = () => [] }) {
  const box = sealbox(store);
  let db = null;
  const load = () => { if (!db) { db = store.readJSON(FILE, null) || { v: 1, accounts: {} }; if (!db.accounts || typeof db.accounts !== 'object') db.accounts = {}; } return db; };
  const save = () => box.writeJSON(FILE, db);
  const peek = aid => load().accounts[aid] || null;
  const rec = aid => load().accounts[aid] || (load().accounts[aid] = {});
  const totpOn = aid => !!(peek(aid) && peek(aid).totp);
  const keysOf = aid => (peek(aid) && peek(aid).passkeys) || [];
  const now = () => new Date().toISOString();
  const pubKey = k => ({ id: k.id, name: k.name, created: k.created, lastUsed: k.lastUsed || null, where: k.rpId, synced: !!k.backup });

  // lockout: wrong codes per account (memory, capped), like the password lockout
  const fails = new Map();
  const locked = aid => { const f = fails.get(aid); return !!(f && f.until > Date.now()); };
  function failed(aid) {
    const n = Date.now(); let f = fails.get(aid); if (!f || n - f.first > LOCK_MS) f = { n: 0, first: n, until: 0 };
    if (++f.n >= LOCK_N) f.until = n + LOCK_MS; fails.set(aid, f);
    if (fails.size > 20000) for (const k of fails.keys()) { if (fails.size <= 18000) break; fails.delete(k); }
  }

  // ---------- TOTP ----------
  // -> 'ok' | 'wrong' | 'replay'. Every step in the window is computed and compared (no early exit).
  function checkCode(secretB32, code, last, commit) {
    const c = String(code == null ? '' : code).replace(/\D/g, ''), secret = b32decode(secretB32);
    if (c.length !== 6 || secret.length < 10) return 'wrong';
    const cur = Math.floor(Date.now() / STEP_MS); let hit = -1;
    for (const d of [-1, 0, 1]) if (same(totpAt(secret, cur + d), c)) hit = Math.max(hit, cur + d);
    if (hit < 0) return 'wrong';
    if (hit <= (last || 0)) return 'replay';
    commit(hit); return 'ok';
  }
  function checkTotp(aid, code) {
    const r = peek(aid); if (!r || !r.totp) return 'wrong';
    return checkCode(box.open(r.totp.enc), code, r.totp.last, s => { r.totp.last = s; save(); });
  }
  const recHash = (aid, code) => hash('r:' + aid + ':' + String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
  function newRecovery(aid) {
    const out = [];
    for (let i = 0; i < 10; i++) { let c = ''; for (let j = 0; j < 10; j++) c += CODE_ABC[crypto.randomInt(CODE_ABC.length)]; out.push(c.slice(0, 5) + '-' + c.slice(5)); }
    rec(aid).recovery = out.map(c => recHash(aid, c));
    return out;
  }
  function useRecovery(aid, code) {   // single use: the code's hash leaves the list
    const r = peek(aid), norm = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!r || !Array.isArray(r.recovery) || norm.length !== 10) return false;
    const h = recHash(aid, norm); let at = -1;
    r.recovery.forEach((x, i) => { if (same(x, h)) at = i; });
    if (at < 0) return false;
    r.recovery.splice(at, 1); save(); return true;
  }
  // "Trust this device for 30 days": a token only this device has; we keep its sha256
  function addTrust(aid, req) {
    const t = 'tct_' + id(32), r = rec(aid);
    r.trusted = (r.trusted || []).filter(x => Date.parse(x.expires) > Date.now()).slice(-(MAX_TRUSTED - 1));
    r.trusted.push({ h: hash(t), created: now(), expires: new Date(Date.now() + TRUST_DAYS * 86400_000).toISOString(), device: String(req.headers['user-agent'] || '').slice(0, 120) });
    save(); return t;
  }
  function trusted(aid, t) {
    const r = peek(aid); if (!r || typeof t !== 'string' || !/^tct_[\w-]{20,64}$/.test(t)) return false;
    const h = hash(t); let ok = false;
    for (const x of r.trusted || []) if (same(x.h, h) && Date.parse(x.expires) > Date.now()) ok = true;
    return ok;
  }
  function forgetTrust(aid) { const r = peek(aid); if (r && r.trusted && r.trusted.length) { r.trusted = []; save(); } }

  // The gate (server/accounts.js calls it before every proven sign-in): null = go on, else the challenge to answer.
  function gate(a, extra = {}) {
    if (!a || !totpOn(a.id)) return null;
    const t = crypto.randomBytes(30).toString('base64url');
    issueWith(t, 'twostep', TICKET_MS, { account: a.id, tries: 0, ...extra });
    const r = peek(a.id);
    return { need: 'two-step', ticket: t, username: a.username, methods: { code: true, recovery: (r.recovery || []).length > 0, passkey: keysOf(a.id).length > 0 } };
  }
  // The ticket was answered: the sign-in it stood for
  function complete(tk, req, a, remember) {
    let out;
    if (tk.member) { const s = memberFinish(tk.member, req); if (!s) throw Object.assign(new Error('that sign-in ran out: start again'), { status: 410 }); out = { mode: 'signin', existing: true, member: s.member, token: s.token, ...(tk.provider ? { provider: tk.provider, providerName: tk.providerName } : {}) }; }
    else out = { mode: 'account', ...finish(a, req, { strong: true }) };
    if (remember) out.trust = addTrust(a.id, req);
    return out;
  }
  const strong = aid => totpOn(aid);

  // ---------- passkeys ----------
  function findCred(credB64) { for (const [aid, r] of Object.entries(load().accounts)) for (const k of r.passkeys || []) if (k.cred === credB64) return { aid, key: k }; return null; }
  function clientData(raw, type) {
    const buf = unb64(raw); if (!buf || buf.length > 4096) throw new Error('bad client data');
    const cd = JSON.parse(buf.toString('utf8'));
    if (!cd || cd.type !== type || typeof cd.challenge !== 'string' || typeof cd.origin !== 'string') throw new Error('bad client data');
    return { cd, buf };
  }
  const bad = (code, error, status = 400) => Object.assign(new Error(error), { status, code });
  function register(a, body) {
    const cr = body && body.credential, resp = cr && cr.response; if (!resp) throw bad('input', 'no passkey came back from the browser');
    let cd, buf; try { ({ cd, buf } = clientData(resp.clientDataJSON, 'webauthn.create')); } catch { throw bad('input', 'the browser\'s answer could not be read'); }
    const ch = redeemTok(cd.challenge, ['wa-reg'], true);   // single use, whatever happens next
    if (!ch || ch.account !== a.id) throw bad('challenge', 'that passkey request ran out or was already used: try again');
    if (cd.origin !== ch.origin || cd.crossOrigin === true) throw bad('origin', 'that passkey was made on another page: add it from TribeCode itself');
    let ad, att;
    try { att = cbor.decode(unb64(resp.attestationObject) || Buffer.alloc(0)); ad = parseAuthData(att.get('authData'), true); } catch (e) { throw bad('input', 'the passkey\'s answer could not be read: ' + e.message); }
    if (!same(ad.rpIdHash.toString('hex'), sha256(ch.rpId).toString('hex'))) throw bad('rp', 'that passkey belongs to another address');
    if (!ad.up) throw bad('presence', 'the passkey did not confirm you were there: try again');
    // attestation is never required. "packed" is checked when it is there (self-attested, or with a certificate); "none" passes.
    const fmt = att.get('fmt'), stmt = att.get('attStmt');
    if (fmt === 'packed') {
      const sig = stmt instanceof Map ? stmt.get('sig') : null, x5c = stmt instanceof Map ? stmt.get('x5c') : null, signed = Buffer.concat([att.get('authData'), sha256(buf)]);
      let key;
      try { key = Array.isArray(x5c) && x5c.length ? new crypto.X509Certificate(x5c[0]).publicKey : stmt.get('alg') === ad.key.alg ? crypto.createPublicKey({ key: ad.key.jwk, format: 'jwk' }) : null; } catch { key = null; }
      if (!Buffer.isBuffer(sig) || !key || !verifySig(key, signed, sig)) throw bad('attestation', 'the passkey\'s attestation did not check out');
    }
    const credB64 = ad.credId.toString('base64url');
    if (findCred(credB64)) throw bad('taken', 'that passkey is already on an account', 409);
    const r = rec(a.id); r.passkeys = r.passkeys || [];
    if (r.passkeys.length >= MAX_PASSKEYS) throw bad('max', `an account keeps at most ${MAX_PASSKEYS} passkeys: remove one first`, 409);
    const name = String(body.name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) || 'Passkey ' + (r.passkeys.length + 1);
    const k = { id: 'pk-' + id(8), cred: credB64, alg: ad.key.alg, jwk: ad.key.jwk, counter: ad.counter, rpId: ch.rpId, name, created: now(), lastUsed: null, uv: ad.uv, backup: ad.be,
      transports: Array.isArray(resp.transports) ? resp.transports.filter(t => typeof t === 'string' && /^[a-z-]{2,16}$/.test(t)).slice(0, 6) : [] };
    r.passkeys.push(k); save(); log(`accounts: ${a.username} added a passkey`);
    return k;
  }
  // -> { a, key, ch } or throws { status, code }
  function assert(body) {
    const cr = body && body.credential, resp = cr && cr.response; if (!resp || typeof cr.id !== 'string') throw bad('input', 'no passkey came back from the browser');
    let cd, buf; try { ({ cd, buf } = clientData(resp.clientDataJSON, 'webauthn.get')); } catch { throw bad('input', 'the browser\'s answer could not be read'); }
    const ch = redeemTok(cd.challenge, ['wa-auth'], true);   // single use
    if (!ch) throw bad('challenge', 'that sign-in ran out or was already used: try again', 401);
    if (cd.origin !== ch.origin || cd.crossOrigin === true) throw bad('origin', 'that passkey answered for another page: sign in from TribeCode itself', 401);
    const hit = B64U.test(cr.id) ? findCred(cr.id) : null, a = hit && accountById(hit.aid);
    if (!hit || !a || a.status === 'disabled') throw bad('unknown', 'that passkey is not on an account here', 401);
    if (ch.account && ch.account !== a.id) throw bad('unknown', 'that passkey belongs to another account', 401);
    const uh = resp.userHandle ? unb64(resp.userHandle) : null;
    if (uh && uh.length && uh.toString('utf8') !== a.id) throw bad('unknown', 'that passkey is not on an account here', 401);
    const k = hit.key, adBuf = unb64(resp.authenticatorData), sig = unb64(resp.signature);
    let ad; try { ad = parseAuthData(adBuf, false); } catch { throw bad('input', 'the passkey\'s answer could not be read'); }
    if (k.rpId !== ch.rpId || !same(ad.rpIdHash.toString('hex'), sha256(ch.rpId).toString('hex'))) throw bad('rp', 'that passkey belongs to another address', 401);
    if (!ad.up) throw bad('presence', 'the passkey did not confirm you were there: try again', 401);
    if (!sig || !verifySig(crypto.createPublicKey({ key: k.jwk, format: 'jwk' }), Buffer.concat([adBuf, sha256(buf)]), sig)) throw bad('signature', 'that passkey\'s signature did not check out', 401);
    // the counter must go up when the authenticator keeps one (0 and 0: it doesn't). A step back means a copied key.
    if ((ad.counter !== 0 || k.counter !== 0) && ad.counter <= k.counter) { k.suspect = now(); save(); log(`accounts: a passkey of ${a.username} answered with an old counter: refused`); throw bad('counter', 'that passkey looks copied (its counter went backwards): remove it and add it again', 401); }
    k.counter = ad.counter; k.lastUsed = now(); k.backup = ad.be; save();
    return { a, key: k, ch };
  }

  // Returns true when it answered. `who` is the signed-in account session (or null).
  async function route(req, res, { b, c, m, body, send }) {
    if (b !== 'two-step' && b !== 'passkeys' && b !== 'passkey') return false;
    const no = (status, error, code, more = {}) => { send(res, status, { error, ...(code ? { code } : {}), ...more }); return true; };
    const many = () => { res.setHeader('Retry-After', '60'); return no(429, 'too many tries in a row: wait a minute, then try again'); };
    if (limited(req, 90, 60_000, 'a3')) return many();
    const isPublic = (b === 'two-step' && !c && m === 'POST') || b === 'passkey';
    if (isPublic && limited(req, 20, 60_000, 'a3try')) return many();
    const who = isPublic ? null : fromToken(req);
    if (!isPublic && !who) return no(401, 'sign in to your account first');
    const a = who && who.account;
    const lockedOut = () => { res.setHeader('Retry-After', '900'); return no(429, 'too many wrong codes: wait 15 minutes, then try again', 'locked'); };
    try {
      // ----- the second step of a sign-in -----
      if (b === 'two-step' && !c && m === 'POST') {
        const tk = redeemTok(body.ticket, ['twostep'], false), acc = tk && accountById(tk.account);
        if (!tk || !acc || acc.status === 'disabled' || !totpOn(acc.id)) { if (tk) redeemTok(body.ticket, ['twostep'], true); return no(410, 'that sign-in ran out: start again', 'expired'); }
        if (typeof body.trust === 'string' && body.code == null && body.recovery == null) {   // a trusted device: no code, and not a wrong try
          if (!trusted(acc.id, body.trust)) return no(401, 'this device is not trusted any more: type a code', 'untrusted');
          redeemTok(body.ticket, ['twostep'], true); send(res, 200, complete(tk, req, acc, false)); return true;
        }
        if (locked(acc.id)) return lockedOut();
        const how = body.recovery != null ? (useRecovery(acc.id, body.recovery) ? 'ok' : 'wrong') : checkTotp(acc.id, body.code);
        if (how !== 'ok') {
          failed(acc.id); tk.tries = (tk.tries || 0) + 1;
          if (tk.tries >= TICKET_TRIES) redeemTok(body.ticket, ['twostep'], true); else pendSave();
          if (locked(acc.id)) return lockedOut();
          return no(401, how === 'replay' ? 'that code was already used: wait for the next one' : body.recovery != null ? 'that recovery code does not work: each one works once' : 'that code does not match: check the clock on your phone, or use a recovery code', how === 'replay' ? 'replay' : 'wrong', { left: Math.max(0, TICKET_TRIES - tk.tries) });
        }
        fails.delete(acc.id); redeemTok(body.ticket, ['twostep'], true);
        if (body.recovery != null) log(`accounts: ${acc.username} used a recovery code (${(peek(acc.id).recovery || []).length} left)`);
        send(res, 200, { ...complete(tk, req, acc, !!body.remember), ...(body.recovery != null ? { recoveryLeft: (peek(acc.id).recovery || []).length } : {}) }); return true;
      }
      // ----- two-step in Settings -----
      if (b === 'two-step') {
        const r = peek(a.id) || {};
        if (!c && m === 'GET') { send(res, 200, { on: !!r.totp, since: r.totp ? r.totp.since : null, recoveryLeft: (r.recovery || []).length, trusted: (r.trusted || []).filter(x => Date.parse(x.expires) > Date.now()).length, passkeys: keysOf(a.id).length, required: !!(required() && isAdmin(a)), period: STEP_MS / 1000 }); return true; }
        if (c === 'setup' && m === 'POST') {
          if (a.status !== 'active') return no(403, 'make a full account first: guests have no two-step sign-in');
          if (r.totp) return no(409, 'two-step sign-in is already on', 'on');
          const secret = b32encode(crypto.randomBytes(20));
          rec(a.id).pending = { enc: box.seal(secret), expires: Date.now() + PENDING_MS }; save();
          const label = encodeURIComponent('TribeCode:' + a.username);
          send(res, 200, { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=TribeCode&algorithm=SHA1&digits=6&period=${Math.round(STEP_MS / 1000)}`, expiresIn: PENDING_MS / 1000 }); return true;
        }
        if (c === 'confirm' && m === 'POST') {
          if (r.totp) return no(409, 'two-step sign-in is already on', 'on');
          if (!r.pending || r.pending.expires < Date.now()) return no(410, 'that set-up ran out: start it again', 'expired');
          if (locked(a.id)) return lockedOut();
          let step = 0; const how = checkCode(box.open(r.pending.enc), body.code, 0, s => { step = s; });
          if (how !== 'ok') { failed(a.id); return no(400, 'that code does not match: type the 6 digits your app shows right now', 'wrong'); }
          fails.delete(a.id);
          r.totp = { enc: r.pending.enc, since: now(), last: step }; delete r.pending;
          const recovery = newRecovery(a.id); save(); log(`accounts: ${a.username} turned on two-step sign-in`);
          const sig = required() && isAdmin(a) ? finish(a, req, { strong: true, memberOnly: true }) : {};   // an admin who had to turn it on: now the tribe key
          send(res, 200, { ok: true, on: true, recovery, ...sig }); return true;
        }
        if ((c === 'disable' || c === 'recovery') && m === 'POST') {
          if (!r.totp) return no(409, 'two-step sign-in is off', 'off');
          if (locked(a.id)) return lockedOut();
          let how = checkTotp(a.id, body.code);
          if (how !== 'ok' && c === 'disable' && useRecovery(a.id, body.code)) how = 'ok';
          if (how !== 'ok') { failed(a.id); if (locked(a.id)) return lockedOut(); return no(401, how === 'replay' ? 'that code was already used: wait for the next one' : 'that code does not match', how === 'replay' ? 'replay' : 'wrong'); }
          fails.delete(a.id);
          if (c === 'recovery') { const recovery = newRecovery(a.id); save(); log(`accounts: ${a.username} made new recovery codes`); send(res, 200, { ok: true, recovery }); return true; }
          delete r.totp; delete r.pending; r.recovery = []; r.trusted = []; save(); log(`accounts: ${a.username} turned off two-step sign-in`);
          send(res, 200, { ok: true, on: false }); return true;
        }
        if (c === 'trusted' && m === 'DELETE') { forgetTrust(a.id); send(res, 200, { ok: true }); return true; }
        return no(404, 'no such two-step route');
      }
      // ----- passkeys in Settings -----
      if (b === 'passkeys') {
        if (!c && m === 'GET') { send(res, 200, { passkeys: keysOf(a.id).map(pubKey), max: MAX_PASSKEYS }); return true; }
        if (c === 'options' && m === 'POST') {
          if (a.status !== 'active') return no(403, 'make a full account first: guests have no passkeys');
          const o = waOrigin(req); if (o.error) return no(400, o.error, o.code);
          if (keysOf(a.id).length >= MAX_PASSKEYS) return no(409, `an account keeps at most ${MAX_PASSKEYS} passkeys: remove one first`, 'max');
          const ch = crypto.randomBytes(32).toString('base64url');
          issueWith(ch, 'wa-reg', CHALLENGE_MS, { account: a.id, origin: o.origin, rpId: o.rpId });
          send(res, 200, { publicKey: { challenge: ch, rp: { id: o.rpId, name: 'TribeCode' }, user: { id: Buffer.from(a.id).toString('base64url'), name: a.username, displayName: a.displayName || a.username },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 120_000, attestation: 'none',
            authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
            excludeCredentials: keysOf(a.id).filter(k => k.rpId === o.rpId).map(k => ({ type: 'public-key', id: k.cred, ...(k.transports && k.transports.length ? { transports: k.transports } : {}) })) } }); return true;
        }
        if (!c && m === 'POST') { send(res, 200, { passkey: pubKey(register(a, body)), passkeys: keysOf(a.id).map(pubKey) }); return true; }
        const k = c && keysOf(a.id).find(x => x.id === c);
        if (!k) return no(404, 'that passkey is not on this account');
        if (m === 'PUT' || m === 'PATCH') {
          const name = String(body.name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40); if (!name) return no(400, 'give the passkey a name');
          k.name = name; save(); send(res, 200, { passkey: pubKey(k), passkeys: keysOf(a.id).map(pubKey) }); return true;
        }
        if (m === 'DELETE') {
          if (usableCount(a) - 1 < 1) return no(409, 'keep at least one way to sign in: add another before removing this one', 'last');
          rec(a.id).passkeys = keysOf(a.id).filter(x => x !== k); save(); log(`accounts: ${a.username} removed a passkey`);
          send(res, 200, { ok: true, passkeys: keysOf(a.id).map(pubKey) }); return true;
        }
        return no(405, 'GET, POST, PUT or DELETE');
      }
      // ----- sign in with a passkey (or answer a two-step ticket with one) -----
      if (b === 'passkey' && c === 'start' && m === 'POST') {
        const o = waOrigin(req); if (o.error) return no(400, o.error, o.code);
        let account = null, allow = [];
        if (body.ticket != null) {
          const tk = redeemTok(body.ticket, ['twostep'], false); if (!tk) return no(410, 'that sign-in ran out: start again', 'expired');
          account = tk.account; allow = keysOf(account).filter(k => k.rpId === o.rpId).map(k => ({ type: 'public-key', id: k.cred, ...(k.transports && k.transports.length ? { transports: k.transports } : {}) }));
          if (!allow.length) return no(409, 'no passkey of this account works at this address: type a code instead', 'none');
        }
        const ch = crypto.randomBytes(32).toString('base64url');
        issueWith(ch, 'wa-auth', CHALLENGE_MS, { origin: o.origin, rpId: o.rpId, ...(account ? { account, ticket: hash(String(body.ticket)) } : {}) });
        send(res, 200, { publicKey: { challenge: ch, rpId: o.rpId, timeout: 120_000, userVerification: 'preferred', allowCredentials: allow } }); return true;
      }
      if (b === 'passkey' && c === 'finish' && m === 'POST') {
        const { a: acc, ch } = assert(body);
        if (ch.ticket) {   // the second step of a sign-in that was already started
          if (typeof body.ticket !== 'string' || !same(hash(body.ticket), ch.ticket)) return no(401, 'that sign-in ran out: start again', 'expired');
          const tk = redeemTok(body.ticket, ['twostep'], true); if (!tk || tk.account !== acc.id) return no(410, 'that sign-in ran out: start again', 'expired');
          send(res, 200, complete(tk, req, acc, !!body.remember)); return true;
        }
        log(`accounts: ${acc.username} signed in with a passkey`);
        send(res, 200, { mode: 'account', ...finish(acc, req, { strong: true }) }); return true;
      }
    } catch (e) {
      if (e.status) return no(e.status, e.message, e.code);
      throw e;
    }
    return no(404, 'no such route');
  }
  // an account went away: its two-step data goes too
  function forget(aids) { let n = 0; for (const x of aids) if (load().accounts[x]) { delete load().accounts[x]; n++; } if (n) save(); }
  return { route, gate, strong, totpOn, forgetTrust, forget, passkeyCount: aid => keysOf(aid).length, passkeyMethods: aid => keysOf(aid).map(k => ({ id: 'passkey:' + k.id, kind: 'passkey', name: k.name, linked: k.created })),
    removePasskey(aid, kid) { const r = peek(aid); if (!r) return false; const n = keysOf(aid).length; r.passkeys = keysOf(aid).filter(k => k.id !== kid); save(); return r.passkeys.length < n; }, reload: () => { db = null; } };
};
module.exports.totpAt = totpAt; module.exports.b32encode = b32encode; module.exports.b32decode = b32decode; module.exports.waOrigin = waOrigin;
