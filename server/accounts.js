// Accounts scaffold for launch (docs/ACCOUNTS.md). OFF by default: set TRIBE_ACCOUNTS=1 to turn the routes on.
// Local-only for now (requests from this computer, like /api/host/reclaim) and rate-limited.
//
// Store: .tribe/accounts.json  { version: 1, accounts: [ {
//   id, username (as typed, normalized), usernameKey (case-folded, unique), displayName, created, status: active | guest | disabled,
//   providers: [{ provider, subject, linked }], password?: { algo: 'scrypt', salt, hash, N, r, p },
//   sessions: [{ id, tokenHash, created, lastSeen, expires, device }], members: [memberId…] } ] }
// Session tokens are shown once (tca_…) and only their sha256 is kept, like member keys.
// Existing tribe members are mapped to accounts (account.members) without touching their member keys: every key that
// works today keeps working, and an account only adds a way to sign in.
//
// Routes (all under /api/accounts):
//   POST signup   { username, displayName?, password?, guest? }  -> { account, token }
//   POST login    { username, password? }                        -> { account, token }
//   POST logout   (Bearer tca_…)                                 -> { ok }        ends this session
//   GET  me       (Bearer tca_…)                                 -> { account }
//   GET  sessions (Bearer tca_…)                                 -> { sessions }  DELETE sessions/<id> ends one
'use strict';
const crypto = require('node:crypto');

const FILE = '.tribe/accounts.json';
const SESSION_DAYS = 30, GUEST_DAYS = 1;
const PREFIX = 'tca_';

// One rule for usernames everywhere (this module and scripts/dev/clean-accounts.js):
// NFC, trim, collapse inner whitespace, 2–32 characters of letters, digits, space, dot, dash and underscore.
function normalizeUsername(raw) {
  const u = String(raw == null ? '' : raw).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return u.slice(0, 32);
}
const keyOf = u => normalizeUsername(u).toLocaleLowerCase('en-US');
const validUsername = u => u.length >= 2 && /^[\p{L}\p{N} ._-]+$/u.test(u);
// Unique with a numeric suffix: "Maya", "Maya 2", "Maya 3"… (case-insensitive)
function uniqueName(base, taken) {
  const b = normalizeUsername(base) || 'Member';
  if (!taken.has(keyOf(b))) return b;
  for (let i = 2; ; i++) { const c = `${b.slice(0, 28)} ${i}`; if (!taken.has(keyOf(c))) return c; }
}

function scryptHash(pw, salt = crypto.randomBytes(16).toString('base64url'), N = 16384, r = 8, p = 1) {
  const hash = crypto.scryptSync(String(pw), salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 }).toString('base64url');
  return { algo: 'scrypt', salt, hash, N, r, p };
}
function scryptCheck(pw, rec) {
  if (!rec || rec.algo !== 'scrypt') return false;
  const want = Buffer.from(rec.hash, 'base64url');
  const got = crypto.scryptSync(String(pw), rec.salt, want.length, { N: rec.N, r: rec.r, p: rec.p, maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

module.exports = function makeAccounts({ store, getMembers, isLocal, limited, hash, id, log = () => {} }) {
  const enabled = () => process.env.TRIBE_ACCOUNTS === '1';
  let db = null;
  const load = () => { if (!db) { db = store.readJSON(FILE, null) || { version: 1, accounts: [] }; if (!Array.isArray(db.accounts)) db.accounts = []; } return db; };
  const save = () => store.writeJSON(FILE, db);
  const now = () => new Date().toISOString();
  const taken = () => new Set(load().accounts.map(a => a.usernameKey));
  const pub = a => a && ({ id: a.id, username: a.username, displayName: a.displayName, created: a.created, status: a.status,
    providers: (a.providers || []).map(p => ({ provider: p.provider, linked: p.linked })), members: (a.members || []).slice(), hasPassword: !!a.password });
  const byKey = k => load().accounts.find(a => a.usernameKey === k);

  // Existing tribe members -> accounts (once per member; idempotent). Agents are not people and get none.
  function syncMembers() {
    const d = load(), mapped = new Set(d.accounts.flatMap(a => a.members || [])), names = taken();
    let added = 0;
    for (const m of getMembers()) {
      if (!m || m.role === 'agent' || mapped.has(m.id)) continue;
      const username = uniqueName(m.name, names); names.add(keyOf(username));
      d.accounts.push({ id: 'acct-' + id(10), username, usernameKey: keyOf(username), displayName: normalizeUsername(m.name) || username, created: m.joined || now(),
        status: m.guestUntil ? 'guest' : 'active', providers: (m.oauth || []).map(o => ({ provider: o.provider, subject: o.id || o.sub || '', linked: o.at || now() })), sessions: [], members: [m.id] });
      added++;
    }
    if (added) { save(); log(`accounts: mapped ${added} member${added === 1 ? '' : 's'} to accounts`); }
    return added;
  }

  function startSession(a, req, guest) {
    const token = PREFIX + id(32), days = guest ? GUEST_DAYS : SESSION_DAYS;
    a.sessions = (a.sessions || []).filter(s => Date.parse(s.expires) > Date.now()).slice(-19);   // at most 20 live sessions per account
    a.sessions.push({ id: 'ses-' + id(8), tokenHash: hash(token), created: now(), lastSeen: now(), expires: new Date(Date.now() + days * 86400_000).toISOString(),
      device: String(req.headers['user-agent'] || '').slice(0, 120) });
    save();
    return token;
  }
  function fromToken(req) {
    const h = String(req.headers.authorization || ''); const t = h.startsWith('Bearer ' + PREFIX) ? h.slice(7) : '';
    if (!t) return null;
    const th = hash(t);
    for (const a of load().accounts) {
      const s = (a.sessions || []).find(x => x.tokenHash === th);
      if (s) { if (Date.parse(s.expires) < Date.now() || a.status === 'disabled') return null; s.lastSeen = now(); return { account: a, session: s }; }
    }
    return null;
  }

  // Returns true when it answered the request.
  async function route(req, res, { b, c, m, readBody, send, fail }) {
    if (!enabled()) { fail(res, 404, 'accounts are off on this server (TRIBE_ACCOUNTS=1 turns them on)'); return true; }
    if (!isLocal(req)) { fail(res, 403, 'accounts are local-only for now'); return true; }
    if (limited(req, 30)) { fail(res, 429, 'slow down'); return true; }
    syncMembers();
    const body = m === 'POST' ? await readBody(req).catch(() => ({})) : {};
    if (b === 'signup' && m === 'POST') {
      const username = normalizeUsername(body.username);
      if (!validUsername(username)) { fail(res, 400, 'pick a username of 2 to 32 letters, numbers, spaces, dots, dashes or underscores'); return true; }
      if (byKey(keyOf(username))) { fail(res, 409, 'that username is taken'); return true; }
      if (body.password != null && String(body.password).length < 8) { fail(res, 400, 'use at least 8 characters for a password'); return true; }
      const a = { id: 'acct-' + id(10), username, usernameKey: keyOf(username), displayName: normalizeUsername(body.displayName) || username, created: now(),
        status: body.guest ? 'guest' : 'active', providers: [], sessions: [], members: [], ...(body.password != null ? { password: scryptHash(body.password) } : {}) };
      load().accounts.push(a);
      const token = startSession(a, req, !!body.guest);
      send(res, 200, { account: pub(a), token }); return true;
    }
    if (b === 'login' && m === 'POST') {
      const a = byKey(keyOf(body.username));
      // one answer for "no such account" and "wrong password", so usernames can't be probed
      const ok = a && a.status !== 'disabled' && (a.password ? body.password != null && scryptCheck(body.password, a.password) : true);
      if (!ok) { fail(res, 401, 'that username and password do not match'); return true; }
      const token = startSession(a, req, a.status === 'guest');
      send(res, 200, { account: pub(a), token }); return true;
    }
    const who = fromToken(req);
    if (!who) { fail(res, 401, 'sign in first'); return true; }
    if (b === 'logout' && m === 'POST') { who.account.sessions = who.account.sessions.filter(s => s !== who.session); save(); send(res, 200, { ok: true }); return true; }
    if (b === 'me' && m === 'GET') { save(); send(res, 200, { account: pub(who.account) }); return true; }
    if (b === 'sessions' && m === 'GET') {
      send(res, 200, { sessions: who.account.sessions.map(s => ({ id: s.id, created: s.created, lastSeen: s.lastSeen, expires: s.expires, device: s.device, current: s === who.session })) }); return true;
    }
    if (b === 'sessions' && c && m === 'DELETE') {
      const before = who.account.sessions.length; who.account.sessions = who.account.sessions.filter(s => s.id !== c); save();
      send(res, 200, { ok: true, removed: before - who.account.sessions.length }); return true;
    }
    fail(res, 404, 'no such accounts route'); return true;
  }

  return { route, enabled, syncMembers, normalizeUsername, keyOf, uniqueName, list: () => load().accounts.map(pub), reload: () => { db = null; } };
};
module.exports.normalizeUsername = normalizeUsername;
module.exports.keyOf = keyOf;
module.exports.uniqueName = uniqueName;
