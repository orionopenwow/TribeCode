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
// feat/auth2: email (server/smtp.js) when the host sets up SMTP: confirm, sign-in, sign-up and reset links. Without it, the host code path.
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

module.exports = function makeAccounts({ store, getMembers, isLocal, limited, hash, id, log = () => {}, forgetMembers = null, memberFromReq = null, signInMember = null,
  inviteOk = () => false, joinWithInvite = null, publicBase = () => null, lanOrigins = () => [], port = 4747, mailer = require('./smtp') }) {
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

  // ======================= feat/auth2: open sign-up, remote access, OAuth accounts, email links =======================
  // Host settings (.tribe/auth.json, 0600, never sent to a browser whole): { openSignup?: bool, smtp?: { host, port, secure, user, pass, from } }
  const AUTHF = '.tribe/auth.json';
  const readAuth = () => store.readJSON(AUTHF, null) || {};
  function writeAuth(c) { const f = store.p(AUTHF); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(c, null, 2), { mode: 0o600 }); try { fs.chmodSync(f, 0o600); } catch {} }
  // The default is today's rule for accounts: anyone who reaches the server may make one (TRIBE_OPEN_SIGNUP=0 flips it).
  const openSignup = () => { const c = readAuth(); return typeof c.openSignup === 'boolean' ? c.openSignup : process.env.TRIBE_OPEN_SIGNUP !== '0'; };
  const smtpConf = () => { const c = readAuth().smtp; return c && c.host && c.port && c.from ? c : null; };
  const emailOn = () => !!smtpConf();
  const viewSmtp = () => { const c = readAuth().smtp || {}; return { host: c.host || '', port: c.port || 587, secure: c.secure || 'starttls', user: c.user || '', from: c.from || '', hasPass: !!c.pass, on: emailOn() }; };

  // Same-origin check for every POST/PUT/DELETE here (CSRF): a JSON body, and an Origin, when a browser sends one, that is
  // this server's own address (as the browser reached it: a tunnel keeps the public host), its public URL or the desktop app.
  const TAURI = /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost)$/i;
  function csrfOk(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return false;
    const o = req.headers.origin;
    if (o === undefined) return !['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site'] || ''));
    if (TAURI.test(String(o))) return true;
    let oh; try { oh = new URL(String(o)).host.toLowerCase(); } catch { return false; }
    const hosts = [req.headers.host, req.headers['x-forwarded-host'], publicBase() && (() => { try { return new URL(publicBase()).host; } catch { return ''; } })()].filter(Boolean).map(x => String(x).toLowerCase());
    return hosts.includes(oh);
  }
  // Where links in mail point: only an address on the allow-list (the public URL, this computer, the home network), never
  // whatever Host header a request carried (that would let anyone mail a victim a link to their own site).
  function linkOrigin(req) {
    const pub = String(publicBase() || '').replace(/\/+$/, '');
    const allowed = new Set([pub, `http://localhost:${port}`, `http://127.0.0.1:${port}`, ...(lanOrigins() || [])].filter(Boolean).map(x => String(x).replace(/\/+$/, '').toLowerCase()));
    const proto = req.socket && req.socket.encrypted || /^https$/i.test(String(req.headers['x-forwarded-proto'] || '')) ? 'https' : 'http';
    const mine = `${proto}://${String(req.headers['x-forwarded-host'] || req.headers.host || '')}`.toLowerCase();
    return allowed.has(mine) ? mine : pub || `http://localhost:${port}`;
  }
  const isHostAdmin = req => { const mem = memberFromReq ? memberFromReq(req) : null; return !!(mem && mem.role === 'host' && isLocal(req)); };

  // Lockout: 10 wrong passwords for one username within 15 minutes lock that username for 15 minutes. Unknown usernames
  // are counted the same way, so a lockout says nothing about whether an account exists.
  const fails = new Map(), LOCK_N = 10, LOCK_MS = 15 * 60_000;
  const isLocked = k => { const f = fails.get(k); return !!(f && f.until > Date.now()); };
  function failed(k) {
    const n = Date.now(); let f = fails.get(k); if (!f || n - f.first > LOCK_MS) f = { n: 0, first: n, until: 0 };
    if (++f.n >= LOCK_N) f.until = n + LOCK_MS; fails.set(k, f);
    if (fails.size > 20000) for (const [x, v] of fails) if (v.until < n && n - v.first > LOCK_MS) fails.delete(x);
  }

  // One-time things kept only as their sha256, in memory: email links (15 min) and provider sign-up tickets (10 min).
  const pend = new Map();   // hash(token) -> { kind, expires, used, ... }
  function issue(kind, ms, data) {
    const now = Date.now(); for (const [k, v] of pend) if (v.expires < now) pend.delete(k);
    if (pend.size > 5000) throw Object.assign(new Error('too many sign-ins in progress: try again in a few minutes'), { status: 429 });
    const t = id(40); pend.set(hash(t), { kind, expires: now + ms, used: false, ...data }); return t;
  }
  // Look up (and with take, use up) a token of one of the kinds. Constant-time by construction: a map lookup of a sha256.
  function redeemTok(t, kinds, take) {
    if (typeof t !== 'string' || t.length < 20 || t.length > 120) return null;
    const k = hash(t), v = pend.get(k);
    if (!v || !kinds.includes(v.kind) || v.used || v.expires < Date.now()) return null;
    if (take) { v.used = true; pend.delete(k); }
    return v;
  }
  const emailKey = e => String(e || '').trim().toLowerCase();
  // Only a verified address speaks for an account (sign-in links, the provider link offer): anyone can type any address at sign-up.
  const byEmail = e => load().accounts.find(a => a.email && a.email.verified && emailKey(a.email.address) === emailKey(e) && a.status !== 'disabled');
  // Email links last 15 minutes (a test can shorten it: TRIBE_TEST=1 with TRIBE_TEST_LINK_MS)
  const LINK_MS = process.env.TRIBE_TEST === '1' && Number(process.env.TRIBE_TEST_LINK_MS) > 0 ? Number(process.env.TRIBE_TEST_LINK_MS) : 15 * 60_000;
  const byProvider = (p, sub) => load().accounts.find(a => (a.providers || []).some(x => x.provider === p && String(x.subject) === String(sub)));
  function suggestFrom(name, email) {
    const base = normalizeUsername(String(name || '').replace(/[^\p{L}\p{N} ._-]/gu, '')) || normalizeUsername(String(email || '').split('@')[0].replace(/[^\p{L}\p{N}._-]/gu, '')) || 'friend';
    const b = validUsername(base) ? base : 'friend';
    return byKey(keyOf(b)) ? (suggest(b)[0] || uniqueName(b, taken())) : b;
  }
  // The account is signed in on this device; with proof of who it is (a password, a provider, an email link) the member it
  // belongs to in this tribe is signed in too (a device link, like login).
  function signedIn(a, req, proven) {
    const token = startSession(a, req, a.status === 'guest');
    const live = new Set(getMembers().filter(x => x.role !== 'agent').map(x => x.id)), mid = (a.members || []).find(x => live.has(x));
    const sig = mid && proven && signInMember ? signInMember(mid, req) : null;
    return { account: pub(a), token, ...(sig ? { member: sig.member, memberToken: sig.token } : {}) };
  }
  const methodsOf = a => [
    ...(a.password ? [{ id: 'password', kind: 'password' }] : []),
    ...(a.email && a.email.verified ? [{ id: 'email', kind: 'email', address: a.email.address, usable: emailOn() }] : []),
    ...(a.providers || []).filter(p => p.subject).map(p => ({ id: 'provider:' + p.provider, kind: 'provider', provider: p.provider, name: p.name || null, linked: p.linked })),
  ];
  const usableCount = a => methodsOf(a).filter(m => m.kind !== 'email' || m.usable).length;

  function sendMail(req, to, subject, text) {
    const c = smtpConf(); if (!c) return;
    mailer.send(c, { to, subject, text }).then(() => log(`accounts: mail sent (${subject})`), e => log(`accounts: mail failed: ${e.message}`));
  }
  // Rate limit for mail per address (5 per 15 minutes), on top of the per-address bucket of the route
  const mailBudget = to => !limited({ socket: { remoteAddress: 'mail:' + emailKey(to) }, headers: {} }, 5, 15 * 60_000, 'mailto');

  // ---- for server/oauth.js: a provider identity with no member in this tribe ----
  // -> { mode: 'account', … } signed in; { mode: 'link-offer', ticket, username, email } an account has that verified
  // email (sign in to it, then link); { mode: 'new', ticket, suggested, … } open sign-up; { mode: 'invite', ticket } ask for one.
  function oauthOutcome(provider, profile, req) {
    if (!enabled()) return null;
    syncMembers();
    const a = byProvider(provider, profile.id);
    if (a) { if (a.status === 'disabled') return null; const p = a.providers.find(x => x.provider === provider); if (profile.name) p.name = profile.name; return { mode: 'account', ...signedIn(a, req, true) }; }
    const data = { provider, subject: String(profile.id), name: profile.name || '', avatar: profile.avatar || null, email: profile.email || '', emailVerified: !!(profile.email && profile.emailVerified) };
    const owner = data.emailVerified ? byEmail(data.email) : null;
    if (owner) { const ticket = issue('oauth', 10 * 60_000, { ...data, offer: owner.id }); return { mode: 'link-offer', ticket, username: owner.username, email: data.email }; }
    const ticket = issue('oauth', 10 * 60_000, data);
    const out = { ticket, suggested: suggestFrom(data.name, data.email), displayName: normalizeUsername(data.name) || '', email: data.emailVerified ? data.email : '', openSignup: openSignup() };
    return openSignup() || isLocal(req) ? { mode: 'new', ...out } : { mode: 'invite', ...out };
  }
  const accountFromReq = req => { const w = fromToken(req); return w ? w.account : null; };
  function attachProvider(a, provider, profile) {
    const other = byProvider(provider, profile.id);
    if (other && other !== a) throw Object.assign(new Error('that sign-in already belongs to another account'), { status: 409, code: 'taken' });
    a.providers = [...(a.providers || []).filter(x => x.provider !== provider), { provider, subject: String(profile.id), name: profile.name || null, linked: now() }];
    if (profile.email && profile.emailVerified && !a.email) a.email = { address: profile.email, verified: true, added: now() };
    if (a.email && profile.emailVerified && emailKey(a.email.address) === emailKey(profile.email)) a.email.verified = true;
    save(); log(`accounts: ${a.username} linked ${provider}`);
    return pub(a);
  }
  // A new account (from a provider ticket or an email link): the username the person confirmed, an invite when sign-up is closed.
  function createFrom(req, body, extra, inviteCode) {
    const username = normalizeUsername(body.username);
    if (!validUsername(username)) throw Object.assign(new Error('pick a username of 2 to 32 letters, numbers, spaces, dots, dashes or underscores'), { status: 400 });
    if (byKey(keyOf(username))) throw Object.assign(new Error('that username is taken: pick another one'), { status: 409, code: 'taken' });
    const a = { id: 'acct-' + id(10), username, usernameKey: keyOf(username), displayName: normalizeUsername(body.displayName) || username, created: now(), status: 'active', providers: [], sessions: [], members: [], ...extra };
    let joined = null;
    if (inviteCode && joinWithInvite) { joined = joinWithInvite(inviteCode, a.displayName, extra.providers && extra.providers[0] ? { identities: [{ provider: extra.providers[0].provider, id: extra.providers[0].subject, name: extra.providers[0].name || null, at: now() }] } : {}); if (joined) a.members.push(joined.memberId); }
    load().accounts.push(a);
    const token = startSession(a, req, false);
    log(`accounts: ${username} signed up${extra.providers && extra.providers[0] ? ' with ' + extra.providers[0].provider : ' by email'}`);
    return { account: pub(a), token, ...(joined ? { member: joined.member, memberToken: joined.token, project: joined.project } : {}) };
  }
  // sign-up is open, or this is the host computer, or the person has a working invite
  function mayJoin(req, code) {
    if (openSignup() || isLocal(req)) return { ok: true, invite: code && inviteOk(code) ? code : null };
    if (code && inviteOk(String(code))) return { ok: true, invite: String(code) };
    return { ok: false };
  }
  const INVITE_ONLY = 'sign-up here is by invite: ask the host or a friend for an invite code, then paste it here';

  async function auth2(req, res, { b, c, m, body, send, fail, tooMany }) {
    // public: what this TribeCode offers (the sign-up sheet, signin.html and the pop-up read it)
    if (b === 'config' && m === 'GET') { send(res, 200, { on: true, openSignup: openSignup(), email: emailOn() }); return true; }
    // ---- the host's settings: on the host computer only ----
    if (b === 'admin') {
      if (!isHostAdmin(req)) { fail(res, 403, 'only the host changes sign-in settings, on the host computer'); return true; }
      if (c === 'settings' && m === 'GET') { send(res, 200, { openSignup: openSignup(), smtp: viewSmtp() }); return true; }
      if (c === 'settings' && m === 'PUT') {
        const all = readAuth();
        if (body.openSignup !== undefined) all.openSignup = !!body.openSignup;
        if (body.smtp !== undefined) {
          if (body.smtp === null || body.smtp.host === '') delete all.smtp;
          else {
            const x = body.smtp, prev = all.smtp || {};
            const next = { host: String(x.host || '').trim().slice(0, 253), port: Number(x.port) || 587, secure: ['starttls', 'tls', 'none'].includes(x.secure) ? x.secure : 'starttls',
              user: String(x.user == null ? prev.user || '' : x.user).slice(0, 254), pass: typeof x.pass === 'string' && x.pass ? x.pass.slice(0, 500) : prev.pass || '', from: String(x.from || '').trim().slice(0, 300) };
            const bad = mailer.validConfig(next); if (bad) { fail(res, 400, bad); return true; }
            if (!next.user) next.pass = '';
            all.smtp = next;
          }
        }
        writeAuth(all); log(`accounts: sign-in settings changed (open sign-up ${openSignup() ? 'on' : 'off'}, email ${emailOn() ? 'on' : 'off'})`);
        send(res, 200, { openSignup: openSignup(), smtp: viewSmtp() }); return true;
      }
      if (c === 'smtp-test' && m === 'POST') {
        const cfg = smtpConf(); if (!cfg) { fail(res, 400, 'save the SMTP settings first'); return true; }
        const to = String(body.to || '').trim(); if (!validEmail(to)) { fail(res, 400, 'type the address to send the test to'); return true; }
        try { await mailer.send(cfg, { to, subject: 'TribeCode test email', text: 'This is a test from your TribeCode. Sign-in links and password resets will come from this address.' }); }
        catch (e) { fail(res, 502, `the test email did not go out: ${e.message}`); return true; }
        send(res, 200, { ok: true }); return true;
      }
      fail(res, 404, 'no such settings route'); return true;
    }
    // ---- provider sign-up: confirm the username (or paste an invite), or link to the account that has the email ----
    if (b === 'oauth' && c === 'confirm' && m === 'POST') {
      const t = redeemTok(body.ticket, ['oauth'], false);
      if (!t) { fail(res, 410, 'that sign-in expired: start again with the provider button'); return true; }
      if (t.offer) { send(res, 409, { error: 'that email already has an account: sign in to it, and we link this sign-in to it', code: 'link' }); return true; }   // no duplicate accounts
      const may = mayJoin(req, body.invite);
      if (!may.ok) { send(res, 403, { error: body.invite ? 'that invite code does not work: check it, or ask for a fresh one' : INVITE_ONLY, code: 'invite' }); return true; }
      if (byProvider(t.provider, t.subject)) { redeemTok(body.ticket, ['oauth'], true); fail(res, 409, 'that sign-in already has an account: sign in with it'); return true; }
      try {
        const out = createFrom(req, body, { providers: [{ provider: t.provider, subject: t.subject, name: t.name || null, linked: now() }], ...(t.emailVerified && !byEmail(t.email) ? { email: { address: t.email, verified: true, added: now() } } : {}) }, may.invite);
        redeemTok(body.ticket, ['oauth'], true);
        send(res, 200, out);
      } catch (e) { send(res, e.status || 400, { error: e.message, ...(e.code ? { code: e.code } : {}), ...(e.code === 'taken' ? { suggestions: suggest(normalizeUsername(body.username)) } : {}) }); }
      return true;
    }
    if (b === 'oauth' && c === 'link' && m === 'POST') {
      const who = fromToken(req); if (!who) { fail(res, 401, 'sign in to your account first, then link'); return true; }
      const t = redeemTok(body.ticket, ['oauth'], true);
      if (!t) { fail(res, 410, 'that sign-in expired: start again with the provider button'); return true; }
      try { send(res, 200, { account: attachProvider(who.account, t.provider, { id: t.subject, name: t.name, email: t.email, emailVerified: t.emailVerified }), linked: t.provider }); }
      catch (e) { send(res, e.status || 400, { error: e.message, code: e.code }); }
      return true;
    }
    // ---- email links: sign in, sign up, verify ----
    if (b === 'email' && c === 'request' && m === 'POST') {
      if (!emailOn()) { send(res, 400, { error: "this TribeCode doesn't send email: sign in with your password, or ask your host", code: 'no-email' }); return true; }
      const to = String(body.email || '').trim().slice(0, 254);
      if (!validEmail(to)) { fail(res, 400, 'that email address looks off'); return true; }
      if (mailBudget(to)) {
        const a = byEmail(to), origin = linkOrigin(req);
        if (a) { const t = issue('magic-signin', LINK_MS, { account: a.id, email: emailKey(to) });  sendMail(req, to, 'Your TribeCode sign-in link', `Sign in to TribeCode as ${a.username}:\n\n${origin}/signin.html#magic=${t}\n\nThe link works once, for 15 minutes. If you didn't ask for it, ignore this email.`); }
        else { const may = mayJoin(req, body.invite); if (may.ok) { const t = issue('magic-signup', LINK_MS, { email: to, invite: may.invite });  sendMail(req, to, 'Finish making your TribeCode account', `Make your TribeCode account:\n\n${origin}/signin.html#magic=${t}\n\nThe link works once, for 15 minutes. If you didn't ask for it, ignore this email.`); } }
      }
      send(res, 200, { ok: true, via: 'email' }); return true;   // the same answer for every address
    }
    if (b === 'email' && c === 'complete' && m === 'POST') {
      const peek = redeemTok(body.token, ['magic-signin', 'magic-signup', 'verify'], false);
      if (!peek) { fail(res, 410, 'that link has expired or was already used: ask for a new one'); return true; }
      if (peek.kind === 'magic-signup') {
        if (!body.username) { send(res, 200, { need: 'username', email: peek.email, suggested: suggestFrom('', peek.email) }); return true; }   // the confirm step (the link stays good)
        if (byEmail(peek.email)) { redeemTok(body.token, ['magic-signup'], true); fail(res, 409, 'that email already has an account: ask for a sign-in link'); return true; }
        try { const out = createFrom(req, body, { email: { address: peek.email, verified: true, added: now() } }, peek.invite); redeemTok(body.token, ['magic-signup'], true); send(res, 200, out); }
        catch (e) { send(res, e.status || 400, { error: e.message, ...(e.code ? { code: e.code } : {}) }); }
        return true;
      }
      redeemTok(body.token, [peek.kind], true);
      const a = load().accounts.find(x => x.id === peek.account);
      if (!a || a.status === 'disabled' || !a.email || emailKey(a.email.address) !== peek.email) { fail(res, 410, 'that link has expired or was already used: ask for a new one'); return true; }
      a.email.verified = true; save();
      send(res, 200, peek.kind === 'verify' ? { ok: true, verified: a.email.address } : signedIn(a, req, true)); return true;
    }
    return false;
  }

  // Returns true when it answered the request.
  async function route(req, res, { b, c, m, readBody, send, fail }) {
    // the app's "does this server have accounts?" check gets a calm answer instead of a 404 in the console
    if (!enabled() && req.method === 'GET' && (b === 'me' || b === 'config') && !c) { send(res, 200, { on: false }); return true; }
    if (!enabled()) { fail(res, 404, 'accounts are off on this server (TRIBE_ACCOUNTS=1 turns them on)'); return true; }
    // feat/auth2: sign-up and sign-in answer friends' browsers too (a tunnel, the cloud); the host's routes (resets, admin)
    // stay on the host computer. Every change is same-origin JSON (CSRF), and every guessable route is rate-limited.
    if (!csrfOk(req)) { fail(res, 403, 'that request came from another site: open TribeCode itself and try again'); return true; }
    const tooMany = () => { res.setHeader('Retry-After', '60'); fail(res, 429, 'too many tries in a row: wait a minute, then try again'); return true; };
    if ((b === 'signup' || b === 'login' || b === 'reset') && limited(req, 30, 60_000, 'accounts')) return tooMany();   // the guessable routes, in their own bucket
    if (b === 'check' && limited(req, 60, 60_000, 'acheck')) return tooMany();   // typing a name: its own, roomier bucket
    if ((b === 'email' || b === 'oauth') && limited(req, 20, 60_000, 'aemail')) return tooMany();
    if (b === 'email' && c === 'request' && limited(req, 5, 60_000, 'amailreq')) return tooMany();   // mail costs: a tighter bucket
    if (b === 'config' && limited(req, 60, 60_000, 'aconfig')) return tooMany();
    if (b === 'admin' && limited(req, 30, 60_000, 'aadmin')) return tooMany();
    if (b === 'resets' && !isLocal(req)) { fail(res, 403, 'password reset requests are handled on the host computer'); return true; }
    syncMembers();
    const body = m === 'POST' || m === 'PUT' ? await readBody(req).catch(() => ({})) : {};
    if (await auth2(req, res, { b, c, m, body, send, fail, tooMany })) return true;
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
      const mail = email ? { email: { address: email, verified: false, added: now() } } : {};   // feat/auth2: a confirm link goes out below when email is on
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
      const may = mayJoin(req, body.invite);   // feat/auth2: open sign-up off -> an invite code, except on the host computer
      if (!may.ok) { send(res, 403, { error: body.invite ? 'that invite code does not work: check it, or ask for a fresh one' : INVITE_ONLY, code: 'invite' }); return true; }
      if (!body.guest && body.password == null) { fail(res, 400, 'pick a password of at least 8 characters'); return true; }   // fix/review-4: real accounts need one
      const deviceKey = body.guest ? 'tcd_' + id(32) : '';   // a guest logs back in only on this device
      const a = { id: 'acct-' + id(10), username, usernameKey: keyOf(username), displayName: normalizeUsername(body.displayName) || username, created: now(),
        status: body.guest ? 'guest' : 'active', providers: [], sessions: [], members: [], ...mail, ...(deviceKey ? { deviceKeyHash: hash(deviceKey) } : {}), ...(body.password != null ? { password: scryptHash(body.password) } : {}) };
      let joined = null;
      if (may.invite && joinWithInvite && !body.guest) { joined = joinWithInvite(may.invite, a.displayName, {}); if (joined) a.members.push(joined.memberId); }
      load().accounts.push(a);
      const token = startSession(a, req, !!body.guest);
      if (email && emailOn() && mailBudget(email)) { const t = issue('verify', 24 * 3600_000, { account: a.id, email: emailKey(email) });  sendMail(req, email, 'Check your TribeCode email address', `Hi ${a.displayName}, confirm this is your address:\n\n${linkOrigin(req)}/signin.html#verify=${t}\n\nThe link works once, for 24 hours.`); }
      send(res, 200, { account: pub(a), token, ...(deviceKey ? { deviceKey } : {}), ...(joined ? { member: joined.member, memberToken: joined.token, project: joined.project } : {}) }); return true;
    }
    if (b === 'login' && m === 'POST') {
      const lk = keyOf(body.username);
      if (isLocked(lk)) { res.setHeader('Retry-After', '900'); send(res, 429, { error: 'too many wrong passwords for that username: wait 15 minutes, or use Forgot password', code: 'locked' }); return true; }
      const a = byKey(lk);
      // one answer for "no such account" and "wrong password", so usernames can't be probed
      const ok = a && a.status !== 'disabled' && (a.password ? body.password != null && scryptCheck(body.password, a.password)
        : a.status === 'guest' && !!a.deviceKeyHash && typeof body.deviceKey === 'string' && crypto.timingSafeEqual(Buffer.from(hash(body.deviceKey), 'hex'), Buffer.from(a.deviceKeyHash, 'hex')));   // fix/review-4
      if (!ok) { failed(lk); fail(res, 401, 'that username and password do not match'); return true; }
      fails.delete(lk);
      const token = startSession(a, req, a.status === 'guest');
      // polish: an account that belongs to a member of this tribe signs that member in on this device (a device link)
      const live = new Set(getMembers().filter(x => x.role !== 'agent').map(x => x.id)), mid = (a.members || []).find(x => live.has(x));
      const sig = mid && a.password && signInMember ? signInMember(mid, req) : null;   // only with a password: auto-mapped accounts have none yet
      send(res, 200, { account: pub(a), token, ...(sig ? { member: sig.member, memberToken: sig.token } : {}) }); return true;
    }
    // feat/signup: forgot password. Until there is email the host completes it: they see the request in Settings › Accounts,
    // make a one-time code and give it to the person, who sets a new password with it.
    if (b === 'reset' && c === 'request' && m === 'POST') {
      const want = String(body.username || body.email || '').trim();
      const a = byKey(keyOf(body.username)) || (validEmail(want) ? load().accounts.find(x => x.email && emailKey(x.email.address) === emailKey(want)) : null);
      if (emailOn() && a && a.email && a.status !== 'disabled') {   // feat/auth2: a reset link by email (15 minutes, once)
        const to = a.email.address;
        if (mailBudget(to)) { const t = issue('reset', LINK_MS, { account: a.id });  sendMail(req, to, 'Reset your TribeCode password', `Someone (hopefully you) asked to reset the password for ${a.username}:\n\n${linkOrigin(req)}/signin.html#reset=${t}\n\nThe link works once, for 15 minutes. If you didn't ask, ignore this email: your password stays the same.`); }
      } else if (a && a.password && a.status !== 'disabled') {
        a.resets = (a.resets || []).filter(r => Date.parse(r.expires) > Date.now()).slice(-2);
        if (!a.resets.some(r => r.status === 'requested')) a.resets.push({ id: 'rst-' + id(8), requested: now(), expires: new Date(Date.now() + 86400_000).toISOString(), status: 'requested' });
        save(); log(`accounts: password reset asked for ${a.username}`);   // no email on the account (or email off): the host makes the code
      }
      send(res, 200, { ok: true, via: emailOn() ? 'email' : 'host' }); return true;   // the same answer for every name: nothing to probe
    }
    if (b === 'reset' && c === 'complete' && m === 'POST' && body.token) {   // feat/auth2: the emailed link
      const t = redeemTok(body.token, ['reset'], false);
      if (!t) { fail(res, 410, 'that reset link has expired or was already used: ask for a new one'); return true; }
      const a = load().accounts.find(x => x.id === t.account);
      if (!a || a.status === 'disabled') { redeemTok(body.token, ['reset'], true); fail(res, 410, 'that reset link has expired or was already used: ask for a new one'); return true; }
      const weak = weakPassword(body.password, a.username); if (weak) { fail(res, 400, weak); return true; }   // the link stays good for a better password
      redeemTok(body.token, ['reset'], true);
      a.password = scryptHash(body.password); a.resets = []; a.sessions = []; if (a.email) a.email.verified = true; fails.delete(a.usernameKey);
      log(`accounts: ${a.username} set a new password (email link)`);
      send(res, 200, signedIn(a, req, true)); return true;
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
    // feat/auth2: the ways this account signs in (Settings › Account), unlink one (never the last), set a password
    if (b === 'methods' && m === 'GET' && !c) { send(res, 200, { methods: methodsOf(who.account), email: emailOn() }); return true; }
    if (b === 'methods' && c && m === 'DELETE') {
      const a = who.account, has = methodsOf(a).find(x => x.id === c);
      if (!has) { fail(res, 404, 'that sign-in method is not on this account'); return true; }
      if (usableCount(a) - (has.kind !== 'email' || has.usable ? 1 : 0) < 1) { send(res, 409, { error: 'keep at least one way to sign in: add another before removing this one', code: 'last' }); return true; }
      if (has.kind === 'password') delete a.password;
      else if (has.kind === 'email') a.email.verified = false;
      else a.providers = (a.providers || []).filter(x => 'provider:' + x.provider !== c);
      save(); log(`accounts: ${a.username} removed ${c}`);
      send(res, 200, { methods: methodsOf(a), account: pub(a) }); return true;
    }
    if (b === 'password' && m === 'POST') {
      const a = who.account;
      if (a.password && !(typeof body.current === 'string' && scryptCheck(body.current, a.password))) { failed(a.usernameKey); fail(res, 401, 'your current password does not match'); return true; }
      const weak = weakPassword(body.password, a.username); if (weak) { fail(res, 400, weak); return true; }
      a.password = scryptHash(body.password); a.sessions = a.sessions.filter(s => s === who.session); save();
      send(res, 200, { methods: methodsOf(a), account: pub(a) }); return true;
    }
    if (b === 'sessions' && m === 'GET') {
      send(res, 200, { sessions: who.account.sessions.map(s => ({ id: s.id, created: s.created, lastSeen: s.lastSeen, expires: s.expires, device: s.device, current: s === who.session })) }); return true;
    }
    if (b === 'sessions' && c === 'others' && m === 'DELETE') {   // feat/settings-tabs: Sign out other devices
      const before = who.account.sessions.length; who.account.sessions = who.account.sessions.filter(s => s === who.session); save();
      send(res, 200, { ok: true, removed: before - who.account.sessions.length }); return true;
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
    return send(res, 200, removeMember(me));
  }
  // The deletion itself (also used after the grace period: server/mysettings.js)
  function removeMember(me) {
    const ids = [me.id, ...getMembers().filter(x => x.role === 'agent' && x.owner === me.id).map(x => x.id)];
    const anon = 'deleted-' + id(6);
    if (forgetMembers) forgetMembers(ids);   // members.json, device links, project seats (server/index.js)
    const d = load(), before = d.accounts.length;
    d.accounts = d.accounts.filter(a => !(a.members || []).some(x => ids.includes(x))); save();
    const files = anonymise(ids, anon);
    log(`accounts: deleted member ${me.id} (${ids.length - 1} agent${ids.length === 2 ? '' : 's'}, ${before - d.accounts.length} account${before - d.accounts.length === 1 ? '' : 's'}, ${files} file${files === 1 ? '' : 's'} changed)`);
    return { ok: true, removed: ids.length, accounts: before - d.accounts.length };
  }
  // Notifications by email (server/notify.js): the member's verified account email, when the host set up SMTP
  const mailFor = mid => { if (!emailOn()) return ''; const a = load().accounts.find(x => (x.members || []).includes(mid) && x.email && x.email.verified); return a ? a.email.address : ''; };
  function mailMember(mid, subject, text) {
    const to = mailFor(mid); if (!to || !mailBudget(to)) return false;
    mailer.send(smtpConf(), { to, subject, text }).then(() => log('accounts: notification mailed'), e => log(`accounts: notification mail failed: ${e.message}`));
    return true;
  }

  return { route, account, removeMember, mailMember, canMail: mid => !!mailFor(mid), enabled, syncMembers, oauthOutcome, accountFromReq, attachProvider, openSignup, emailOn, normalizeUsername, keyOf, uniqueName, list: () => load().accounts.map(pub), reload: () => { db = null; } };
};
module.exports.normalizeUsername = normalizeUsername;
module.exports.keyOf = keyOf;
module.exports.uniqueName = uniqueName;
module.exports.weakPassword = weakPassword;
