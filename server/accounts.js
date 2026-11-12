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
//   POST signup   { username, displayName?, password, guest? }   -> { account, token, deviceKey? }  (guests: no password, a device key)
//   POST login    { username, password? | deviceKey? }           -> { account, token }
//        fix/review-4: an account with a password logs in only with it. Without one, only a guest account logs in, and only
//        with the device key its sign-up handed out (that device). Mapped members and every other passwordless account
//        can't log in here (they sign in with their tribe key or a provider). Real accounts need a password at sign-up.
//   POST logout   (Bearer tca_…)                                 -> { ok }        ends this session
//   GET  me       (Bearer tca_…)                                 -> { account }
//   GET  sessions (Bearer tca_…)                                 -> { sessions }  DELETE sessions/<id> ends one
// feat/signup:
//   GET  check?username=                                         -> { username, valid, available, suggestions? }  (own rate limit)
//   POST reset/request  { username }                             -> { ok, via: 'host' }  (the same answer for every name)
//   POST reset/complete { username, code, password }             -> { account, token }   (ends every other session)
//   GET  resets  (the host's member key)                         -> { resets }  POST resets/<id> makes a one-time code, DELETE dismisses
//   POST link    (Bearer tca_…) { member: <member key> }         -> { account, linked }  a guest's member joins their new account
// Reset codes: 8 characters, shown once to the host, only their sha256 kept, 30 minutes, 5 tries. Requests last 24 hours.
// There is no email yet: TODO(email) marks where a welcome/verification mail and the reset mail will be sent.
// And, for the signed-in member (their tribe key, like every other route), the account deletion contract of
// docs/APP-STORE.md (also flag-gated; with it off the app clears only the device):
//   GET    /api/account                       -> { canDelete, keeps, account? }   (the host: canDelete false, Start fresh)
//   DELETE /api/account { confirm: 'DELETE' } -> { ok }   removes the member, their agents, tokens, device links, OAuth
//          links, project seats, linked accounts and sessions, files named by their id (private notes, Flint memory,
//          inbox…), and anonymises what they posted: every "<member id>" in the tribe's JSON/JSONL becomes "deleted-…"
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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

// One password rule for the server and the sign-up sheet (app/ui/signup.js mirrors it, and asks for more before Create).
const COMMON = new Set(['password', 'password1', 'password12', 'password123', 'passw0rd', '12345678', '123456789', '1234567890', 'qwerty12', 'qwerty123',
  'qwertyuiop', 'iloveyou', 'letmein1', 'welcome1', 'welcome123', 'admin123', 'abc12345', 'abcd1234', '11111111', '00000000', 'football', 'baseball',
  'sunshine', 'princess', 'trustno1', 'tribecode', 'monkey123', 'dragon123', 'superman', 'changeme']);
function weakPassword(pw, username) {
  const p = String(pw == null ? '' : pw), l = p.toLowerCase(), u = keyOf(username || '').replace(/[\s._-]+/g, '');
  if (p.length < 8) return 'use at least 8 characters for a password';
  if (p.length > 200) return 'use at most 200 characters for a password';
  if (COMMON.has(l) || /^(.)\1+$/.test(p) || '01234567890123456789abcdefghijklmnopqrstuvwxyz'.includes(l)) return 'that password is too easy to guess: try a short phrase';
  if (u.length >= 3 && l.replace(/[\s._-]+/g, '').includes(u)) return 'keep your username out of your password';
  return '';
}
const validEmail = e => e.length <= 254 && /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(e);
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

module.exports = function makeAccounts({ store, getMembers, isLocal, limited, hash, id, log = () => {}, forgetMembers = null, memberFromReq = null, signInMember = null }) {
  const enabled = () => process.env.TRIBE_ACCOUNTS === '1';
  let db = null;
  const load = () => { if (!db) { db = store.readJSON(FILE, null) || { version: 1, accounts: [] }; if (!Array.isArray(db.accounts)) db.accounts = []; } return db; };
  const save = () => store.writeJSON(FILE, db);
  const now = () => new Date().toISOString();
  const taken = () => new Set(load().accounts.map(a => a.usernameKey));
  const pub = a => a && ({ id: a.id, username: a.username, displayName: a.displayName, created: a.created, status: a.status,
    providers: (a.providers || []).map(p => ({ provider: p.provider, linked: p.linked })), members: (a.members || []).slice(), hasPassword: !!a.password,
    email: a.email ? { address: a.email.address, verified: !!a.email.verified } : null });
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

  // Free usernames close to a taken one: "maya2", "maya.dev"… (only ones nobody has)
  function suggest(u) {
    const b = u.slice(0, 26), sep = /\s/.test(b) ? ' ' : '.', yy = String(new Date().getFullYear() % 100);
    const cands = [b + (10 + crypto.randomInt(89)), b + sep + 'dev', b + (sep === ' ' ? ' ' : '_') + yy, b + sep + 'codes', b + (100 + crypto.randomInt(899))];
    return cands.map(normalizeUsername).filter(x => validUsername(x) && !byKey(keyOf(x))).slice(0, 3);
  }

  // Returns true when it answered the request.
  async function route(req, res, { b, c, m, readBody, send, fail }) {
    if (!enabled()) { fail(res, 404, 'accounts are off on this server (TRIBE_ACCOUNTS=1 turns them on)'); return true; }
    if (!isLocal(req)) { fail(res, 403, 'accounts are local-only for now'); return true; }
    const tooMany = () => { res.setHeader('Retry-After', '60'); fail(res, 429, 'too many tries in a row: wait a minute, then try again'); return true; };
    if ((b === 'signup' || b === 'login' || b === 'reset') && limited(req, 30, 60_000, 'accounts')) return tooMany();   // the guessable routes, in their own bucket
    if (b === 'check' && limited(req, 60, 60_000, 'acheck')) return tooMany();   // typing a name: its own, roomier bucket
    syncMembers();
    const body = m === 'POST' ? await readBody(req).catch(() => ({})) : {};
    // feat/signup: is this username free? Only yes or no (plus free suggestions); nothing else about an account.
    if (b === 'check' && m === 'GET') {
      const username = normalizeUsername(new URL(req.url, 'http://x').searchParams.get('username'));
      if (!validUsername(username)) { send(res, 200, { username, valid: false, available: false }); return true; }
      const mem = memberFromReq ? memberFromReq(req) : null, clash = byKey(keyOf(username));
      const mine = clash && mem && !clash.password && (clash.members || []).includes(mem.id);   // the account this member was mapped to: theirs to claim
      const available = !clash || !!mine;
      send(res, 200, { username, valid: true, available, ...(available ? {} : { suggestions: suggest(username) }) }); return true;
    }
    if (b === 'signup' && m === 'POST') {
      const username = normalizeUsername(body.username);
      if (!validUsername(username)) { fail(res, 400, 'pick a username of 2 to 32 letters, numbers, spaces, dots, dashes or underscores'); return true; }
      const weak = body.password != null ? weakPassword(body.password, username) : '';
      if (weak) { fail(res, 400, weak); return true; }
      const email = String(body.email || '').trim().slice(0, 254);
      if (email && !validEmail(email)) { fail(res, 400, 'that email address looks off: check it, or leave it empty'); return true; }
      const mail = email ? { email: { address: email, verified: false, added: now() } } : {};   // TODO(email): send a welcome mail with a verification code
      // polish: { link: true } with the member's own tribe key (Bearer) claims the account this member was mapped to
      // (syncMembers) when it has no password yet: it takes the new username and password, keeps the member link
      const mem = body.link && memberFromReq ? memberFromReq(req) : null;
      if (mem && mem.role !== 'agent') {
        const own = load().accounts.find(a => (a.members || []).includes(mem.id));
        const clash = byKey(keyOf(username));
        if (clash && clash !== own) { fail(res, 409, 'that username is taken'); return true; }
        if (own && own.password) { fail(res, 409, 'you already have an account: log in with it'); return true; }
        if (body.password == null) { fail(res, 400, 'pick a password of at least 8 characters'); return true; }   // fix/review-4
        const a = own || { id: 'acct-' + id(10), created: now(), providers: [], sessions: [], members: [mem.id] };
        Object.assign(a, { username, usernameKey: keyOf(username), displayName: normalizeUsername(body.displayName) || a.displayName || username, status: 'active', ...mail, ...(body.password != null ? { password: scryptHash(body.password) } : {}) });
        if (!own) load().accounts.push(a);
        const token = startSession(a, req, false);
        send(res, 200, { account: pub(a), token, linked: mem.id }); return true;
      }
      if (byKey(keyOf(username))) { fail(res, 409, 'that username is taken'); return true; }
      if (!body.guest && body.password == null) { fail(res, 400, 'pick a password of at least 8 characters'); return true; }   // fix/review-4: real accounts need one
      const deviceKey = body.guest ? 'tcd_' + id(32) : '';   // a guest logs back in only on this device
      const a = { id: 'acct-' + id(10), username, usernameKey: keyOf(username), displayName: normalizeUsername(body.displayName) || username, created: now(),
        status: body.guest ? 'guest' : 'active', providers: [], sessions: [], members: [], ...mail, ...(deviceKey ? { deviceKeyHash: hash(deviceKey) } : {}), ...(body.password != null ? { password: scryptHash(body.password) } : {}) };
      load().accounts.push(a);
      const token = startSession(a, req, !!body.guest);
      send(res, 200, { account: pub(a), token, ...(deviceKey ? { deviceKey } : {}) }); return true;
    }
    if (b === 'login' && m === 'POST') {
      const a = byKey(keyOf(body.username));
      // one answer for "no such account" and "wrong password", so usernames can't be probed
      const ok = a && a.status !== 'disabled' && (a.password ? body.password != null && scryptCheck(body.password, a.password)
        : a.status === 'guest' && !!a.deviceKeyHash && typeof body.deviceKey === 'string' && crypto.timingSafeEqual(Buffer.from(hash(body.deviceKey), 'hex'), Buffer.from(a.deviceKeyHash, 'hex')));   // fix/review-4
      if (!ok) { fail(res, 401, 'that username and password do not match'); return true; }
      const token = startSession(a, req, a.status === 'guest');
      // polish: an account that belongs to a member of this tribe signs that member in on this device (a device link)
      const live = new Set(getMembers().filter(x => x.role !== 'agent').map(x => x.id)), mid = (a.members || []).find(x => live.has(x));
      const sig = mid && a.password && signInMember ? signInMember(mid, req) : null;   // only with a password: auto-mapped accounts have none yet
      send(res, 200, { account: pub(a), token, ...(sig ? { member: sig.member, memberToken: sig.token } : {}) }); return true;
    }
    // feat/signup: forgot password. Until there is email the host completes it: they see the request in Settings › Accounts,
    // make a one-time code and give it to the person, who sets a new password with it.
    if (b === 'reset' && c === 'request' && m === 'POST') {
      const a = byKey(keyOf(body.username));
      if (a && a.password && a.status !== 'disabled') {
        a.resets = (a.resets || []).filter(r => Date.parse(r.expires) > Date.now()).slice(-2);
        if (!a.resets.some(r => r.status === 'requested')) a.resets.push({ id: 'rst-' + id(8), requested: now(), expires: new Date(Date.now() + 86400_000).toISOString(), status: 'requested' });
        save(); log(`accounts: password reset asked for ${a.username}`);   // TODO(email): mail the code to a verified address instead
      }
      send(res, 200, { ok: true, via: 'host' }); return true;   // the same answer for every name: nothing to probe
    }
    if (b === 'reset' && c === 'complete' && m === 'POST') {
      const a = byKey(keyOf(body.username)), code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const r = a && (a.resets || []).find(x => x.status === 'ready' && Date.parse(x.codeExpires) > Date.now());
      const want = r && Buffer.from(r.codeHash, 'hex'), got = Buffer.from(hash(code), 'hex');
      if (!r || code.length !== 8 || !crypto.timingSafeEqual(want, got)) {
        if (r && ++r.tries >= 5) a.resets = a.resets.filter(x => x !== r);
        if (r) save();
        fail(res, 400, 'that reset code does not work or has run out: ask your host for a fresh one'); return true;
      }
      const weak = weakPassword(body.password, a.username); if (weak) { fail(res, 400, weak); return true; }
      a.password = scryptHash(body.password); a.resets = []; a.sessions = [];   // a new password signs every other device out
      log(`accounts: ${a.username} set a new password`);
      const token = startSession(a, req, false);
      send(res, 200, { account: pub(a), token }); return true;
    }
    if (b === 'resets') {
      const mem = memberFromReq ? memberFromReq(req) : null;
      if (!mem || mem.role !== 'host') { fail(res, 403, 'only the host sees password reset requests'); return true; }
      const live = a => (a.resets || []).filter(r => Date.parse(r.expires) > Date.now());
      if (!c && m === 'GET') {
        send(res, 200, { resets: load().accounts.flatMap(a => live(a).map(r => ({ id: r.id, username: a.username, displayName: a.displayName, requested: r.requested, expires: r.expires, status: r.status, codeExpires: r.codeExpires || null }))) }); return true;
      }
      const a = c && load().accounts.find(x => live(x).some(r => r.id === c)), r = a && a.resets.find(x => x.id === c);
      if (!r) { fail(res, 404, 'that reset request is gone'); return true; }
      if (m === 'DELETE') { a.resets = a.resets.filter(x => x !== r); save(); send(res, 200, { ok: true }); return true; }
      if (m === 'POST') {
        let code = ''; for (let i = 0; i < 8; i++) code += CODE_ABC[crypto.randomInt(CODE_ABC.length)];
        Object.assign(r, { status: 'ready', codeHash: hash(code), codeExpires: new Date(Date.now() + 30 * 60_000).toISOString(), tries: 0 });
        save(); log(`accounts: the host made a reset code for ${a.username}`);
        send(res, 200, { code: code.slice(0, 4) + '-' + code.slice(4), expires: r.codeExpires, username: a.username }); return true;
      }
    }
    const who = fromToken(req);
    if (!who) { fail(res, 401, 'sign in first'); return true; }
    // feat/signup: a guest (or a TEST account) made an account: the member they are in this tribe joins it
    if (b === 'link' && m === 'POST') {
      const mem = memberFromReq ? memberFromReq({ headers: { authorization: 'Bearer ' + String(body.member || '') }, url: '/api/accounts/link' }) : null;
      if (!mem || mem.role === 'agent') { fail(res, 400, 'sign in to the tribe on this device first'); return true; }
      const a = who.account, d = load(), other = d.accounts.find(x => x !== a && (x.members || []).includes(mem.id));
      if (other && other.password) { fail(res, 409, 'that member already has an account: log in with it'); return true; }
      if (other) d.accounts = d.accounts.filter(x => x !== other);   // the passwordless placeholder syncMembers made
      a.members = [...new Set([...(a.members || []), mem.id])];
      if (a.status === 'guest') a.status = 'active';
      save(); log(`accounts: linked member ${mem.id} to ${a.username}`);
      send(res, 200, { account: pub(a), linked: mem.id }); return true;
    }
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

  // ---------- /api/account: delete my account (the signed-in member) ----------
  const KEEPS = 'Code you pushed to a Git repository stays in its history. Messages you posted stay in their threads as "deleted member", so replies still make sense.';
  function linked(mid) { return load().accounts.filter(a => (a.members || []).includes(mid)); }
  function anonymise(ids, anon) {   // the tribe folder's JSON/JSONL: "<id>" -> "deleted-…"; files named by an id go
    const root = store.p(), skip = new Set(['workspaces', '.git', 'node_modules', 'backups', 'cache', 'trash']);
    let files = 0;
    const walk = dir => {
      let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of list) {
        const f = path.join(dir, e.name), base = e.name.replace(/\.(jsonl?|md|txt)$/, '');
        if (ids.includes(base)) { try { fs.rmSync(f, { recursive: true, force: true }); files++; } catch {} continue; }
        if (e.isDirectory()) { if (!skip.has(e.name)) walk(f); continue; }
        if (!/\.jsonl?$/.test(e.name) || f === store.p(FILE)) continue;
        let st; try { st = fs.statSync(f); } catch { continue; } if (st.size > 32 * 1048576) continue;
        let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
        let out = t; for (const mid of ids) out = out.split(JSON.stringify(mid)).join(JSON.stringify(anon));
        if (out !== t) { try { fs.writeFileSync(f, out); files++; } catch {} }
      }
    };
    walk(root); return files;
  }
  async function account(req, res, { m, me, readBody, send, fail }) {
    if (!enabled()) return fail(res, 404, 'account deletion is off on this server (TRIBE_ACCOUNTS=1 turns it on)');
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'agent') return fail(res, 403, 'agents have no account to delete');
    const host = me.role === 'host';
    if (m === 'GET') { const a = linked(me.id)[0]; return send(res, 200, { canDelete: !host, keeps: host ? 'You are the host: Settings › More settings › Start fresh moves the whole tribe into a backup folder instead.' : KEEPS, ...(a ? { account: pub(a) } : {}) }); }
    if (m !== 'DELETE') return fail(res, 405, 'GET or DELETE');
    const body = await readBody(req).catch(() => ({}));
    if (!body || body.confirm !== 'DELETE') return fail(res, 400, 'send { confirm: "DELETE" }');
    if (host) return fail(res, 403, 'the host can\'t delete themselves this way: Start fresh in Settings covers that');
    const ids = [me.id, ...getMembers().filter(x => x.role === 'agent' && x.owner === me.id).map(x => x.id)];
    const anon = 'deleted-' + id(6);
    if (forgetMembers) forgetMembers(ids);   // members.json, device links, project seats (server/index.js)
    const d = load(), before = d.accounts.length;
    d.accounts = d.accounts.filter(a => !(a.members || []).some(x => ids.includes(x))); save();
    const files = anonymise(ids, anon);
    log(`accounts: deleted member ${me.id} (${ids.length - 1} agent${ids.length === 2 ? '' : 's'}, ${before - d.accounts.length} account${before - d.accounts.length === 1 ? '' : 's'}, ${files} file${files === 1 ? '' : 's'} changed)`);
    return send(res, 200, { ok: true, removed: ids.length, accounts: before - d.accounts.length });
  }

  return { route, account, enabled, syncMembers, normalizeUsername, keyOf, uniqueName, list: () => load().accounts.map(pub), reload: () => { db = null; } };
};
module.exports.normalizeUsername = normalizeUsername;
module.exports.keyOf = keyOf;
module.exports.uniqueName = uniqueName;
module.exports.weakPassword = weakPassword;
