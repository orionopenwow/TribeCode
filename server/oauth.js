// Sign in with Discord / GitHub / Google (and Apple, config-gated; see PROVIDERS.apple): for JOINING a tribe from an invite and for signing back in on a new device.
//
// Every provider is OFF until the host registers an OAuth app with it and pastes the client id + secret in
// Settings › Sign-in (.tribe/oauth.json, 0600, never sent to a browser; changed only by the host on the host computer).
// docs/SIGN-IN.md has the 2-minute setup per provider.
//
// The flow (authorization code + PKCE S256 for all three; GitHub OAuth Apps accept PKCE too):
//   1. POST /api/oauth/<p>/start { mode: join|signin|link, code? }   -> { url: <public base>/api/oauth/go/<fid> }
//      A flow record (10 min, in memory) holds state, the PKCE verifier, a browser nonce, the mode, the invite
//      (join) or the member (link, needs the member's key). Nothing is decided by the browser after this point.
//   2. GET /api/oauth/go/<fid> (single use) sets an HttpOnly cookie with the nonce on the public origin and
//      redirects to the provider with state + code_challenge. The redirect URI is <public base>/api/oauth/<p>/callback.
//   3. GET /api/oauth/<p>/callback?code&state: state must be a live, unused flow for this provider and the cookie must
//      carry its nonce (so a link someone forwards can't finish in another browser); the code is exchanged with the
//      secret + verifier, the profile is read, and the browser is sent to /join/<code>#oauth=<rc> or
//      /signin.html#oauth=<rc>: a one-time result code in the fragment (never sent to a server, never logged).
//   4. POST /api/oauth/finish { rc } (single use): join consumes the invite exactly like /api/join; signin issues a
//      NEW device token for the member whose identity matches (see below); link attaches the identity to the caller
//      (who must be the member that started it).
//
// Signing back in adds a token instead of rotating the member's only one: it is a device (server/devices.js), so the
// phone and the laptop stay signed in, the new sign-in shows up in the member's device list and can be revoked on its
// own, and a stolen new-device token never touches the others. Rotating would sign every other device out silently.
//
// Test hooks: TRIBE_OAUTH_DISCORD_BASE, TRIBE_OAUTH_GITHUB_BASE, TRIBE_OAUTH_GOOGLE_BASE (one base for all of a
// provider's endpoints, e.g. a local mock).
//
// API:
//   GET    /api/oauth/providers           public: [{ id, name }] for providers that are on
//   GET    /api/oauth/config               host: per provider { enabled, clientId, hasSecret, redirectUri, register }
//   PUT    /api/oauth/config/<p>           host on the host computer: { enabled?, clientId?, clientSecret? }
//   GET    /api/oauth/me                   member: { linked: [{ provider, name, at }], providers }
//   DELETE /api/oauth/me/<p>               member: unlink
//   POST   /api/oauth/<p>/start, GET /api/oauth/go/<fid>, GET /api/oauth/<p>/callback, POST /api/oauth/finish
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');

const PROVIDERS = {
  discord: {
    name: 'Discord', scope: 'identify email', base: 'https://discord.com',
    env: 'TRIBE_OAUTH_DISCORD_BASE', register: 'https://discord.com/developers/applications',
    where: 'Discord Developer Portal › New Application › OAuth2: add the redirect, copy the client id and reset the secret.',
    authorize: b => b + '/oauth2/authorize', token: b => b + '/api/oauth2/token', user: b => b + '/api/users/@me',
    profile: u => ({ id: u.id, name: u.global_name || u.username, email: u.email || '', emailVerified: u.verified === true,
      avatar: u.avatar && /^\d{5,25}$/.test(String(u.id)) && /^(a_)?[0-9a-f]{32}$/.test(String(u.avatar)) ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null }),
  },
  github: {
    name: 'GitHub', scope: 'read:user user:email', base: 'https://github.com', api: 'https://api.github.com',
    env: 'TRIBE_OAUTH_GITHUB_BASE', register: 'https://github.com/settings/developers',
    where: 'GitHub › Settings › Developer settings › OAuth Apps › New OAuth App: paste the redirect as the callback URL.',
    authorize: b => b + '/login/oauth/authorize', token: b => b + '/login/oauth/access_token', user: (b, mock) => (mock ? b : 'https://api.github.com') + '/user',
    emails: (b, mock) => (mock ? b : 'https://api.github.com') + '/user/emails',   // feat/auth2: the primary, verified address
    profile: u => ({ id: u.id, name: u.name || u.login, avatar: u.avatar_url }),
  },
  google: {
    name: 'Google', scope: 'openid profile email', base: 'https://accounts.google.com',
    env: 'TRIBE_OAUTH_GOOGLE_BASE', register: 'https://console.cloud.google.com/apis/credentials',
    where: 'Google Cloud console › APIs & Services › Credentials › Create OAuth client ID › Web application: add the redirect.',
    authorize: b => b + '/o/oauth2/v2/auth', token: (b, mock) => (mock ? b + '/token' : 'https://oauth2.googleapis.com/token'),
    user: (b, mock) => (mock ? b + '/v1/userinfo' : 'https://openidconnect.googleapis.com/v1/userinfo'),
    profile: u => ({ id: u.sub, name: u.name || u.given_name, avatar: u.picture, email: u.email || '', emailVerified: u.email_verified === true || u.email_verified === 'true' }),
  },
  // Sign in with Apple (App Store 4.8): off until the host sets an Apple Services ID (client id) and its client secret in
  // Settings › Sign-in (or TRIBE_OAUTH_APPLE_ID / _SECRET). Apple has no profile endpoint: the token answer's id_token
  // (got straight from Apple over TLS in the code exchange) carries the stable user id in `sub`.
  // TODO(appstore): Apple's client secret is a short-lived ES256 JWT signed with the team's .p8 key (Team ID, Key ID):
  //   generate it here from TRIBE_APPLE_TEAM_ID / _KEY_ID / _PRIVATE_KEY instead of asking for a pasted secret; ask for
  //   the `name email` scopes, which need response_mode=form_post and so a POST callback; check the id_token signature
  //   against https://appleid.apple.com/auth/keys. Until then: scope-less sign-in (query response, the stable id only).
  apple: {
    name: 'Apple', scope: '', base: 'https://appleid.apple.com', idToken: true,
    env: 'TRIBE_OAUTH_APPLE_BASE', register: 'https://developer.apple.com/account/resources/identifiers/list/serviceId',
    where: 'Apple Developer › Certificates, Identifiers & Profiles › Services IDs: turn on Sign in with Apple, add the domain and the redirect. Paste the Services ID and a client secret (a JWT made with your .p8 key).',
    authorize: b => b + '/auth/authorize', token: b => b + '/auth/token', user: null,
    profile: u => ({ id: u.sub, name: '', avatar: null }),
  },
};
const jwtClaims = t => { try { return JSON.parse(Buffer.from(String(t).split('.')[1] || '', 'base64url').toString('utf8')); } catch { return null; } };
// Avatars only from the provider's own image CDN, over https.
const AVATAR_HOSTS = { discord: /^cdn\.discordapp\.com$/, github: /^avatars\.githubusercontent\.com$/, google: /^lh\d\.googleusercontent\.com$/, apple: /^$/ };
const TTL = 10 * 60_000, MAX_FLOWS = 500;
const CID_RE = /^[A-Za-z0-9._-]{6,200}$/, SECRET_RE = /^[\x21-\x7e]{6,300}$/;
const ERRORS = ['denied', 'expired', 'mismatch', 'provider', 'invite', 'unknown', 'taken', 'busy', 'off'];
// feat/auth2: the desktop app's handoff code (tribecode://auth?code=…, or the 6 characters typed in the app): 2 minutes, once, PKCE
const HANDOFF_TTL = process.env.TRIBE_TEST === '1' && Number(process.env.TRIBE_TEST_HANDOFF_MS) > 0 ? Number(process.env.TRIBE_TEST_HANDOFF_MS) : 2 * 60_000, SHORT_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const cleanEmail = e => { const x = String(e || '').trim().slice(0, 254); return /^[^\s@<>]{1,64}@[^\s@<>]{1,253}\.[^\s@<>]{2,}$/.test(x) ? x : ''; };

const rnd = (n = 32) => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32); }
function cleanAvatar(provider, u) {
  try {
    const x = new URL(String(u || ''));
    if (x.protocol !== 'https:' || x.username || x.password || x.port || !AVATAR_HOSTS[provider].test(x.hostname)) return null;
    return x.href.slice(0, 400);
  } catch { return null; }
}
function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); }
  return null;
}

module.exports = function makeOAuth({ store, getMembers, saveMembers, publicMember, isLocal, str, limited, publicBase, findInvite, joinByInvite, addToProject, devices, tribe, accounts = null, log = () => {} }) {
  const acctsOn = () => !!(accounts && accounts.enabled());
  const CONF = '.tribe/oauth.json';
  // Cloud hosts (docs/CLOUD.md) set providers in their environment, which survives restarts:
  // TRIBE_OAUTH_GITHUB_ID / TRIBE_OAUTH_GITHUB_SECRET (and _DISCORD_, _GOOGLE_). The file still works on a host computer.
  const fromEnv = () => { const o = {}; for (const p of Object.keys(PROVIDERS)) { const id = process.env[`TRIBE_OAUTH_${p.toUpperCase()}_ID`], sec = process.env[`TRIBE_OAUTH_${p.toUpperCase()}_SECRET`]; if (id && sec) o[p] = { enabled: true, clientId: String(id).trim(), clientSecret: String(sec).trim(), env: true }; } return o; };
  const conf = () => ({ ...(store.readJSON(CONF, {}) || {}), ...fromEnv() });
  function writeConf(c) {
    const file = store.p(CONF);
    fs.writeFileSync(file, JSON.stringify(c, null, 2), { mode: 0o600 }); try { fs.chmodSync(file, 0o600); } catch {}
  }
  const baseOf = p => String(process.env[PROVIDERS[p].env] || PROVIDERS[p].base).replace(/\/+$/, '');
  const mocked = p => !!process.env[PROVIDERS[p].env];
  const isOn = p => { const c = conf()[p]; return !!(c && c.enabled && c.clientId && c.clientSecret); };
  const err = (status, msg, code) => Object.assign(new Error(msg), { status, code });

  // Where the provider sends people back: the public https address when sharing is on, else this request's origin.
  function originOf(req) {
    const pub = publicBase(); if (pub) return pub.replace(/\/+$/, '');
    const host = String(req.headers.host || 'localhost').replace(/[^A-Za-z0-9.:\[\]-]/g, '');
    return `http://${host}`;
  }
  const redirectUri = (req, p) => `${originOf(req)}/api/oauth/${p}/callback`;

  // ---------- flow records (memory only; 10 minutes) ----------
  const flows = new Map();   // fid -> flow
  const byState = new Map(), byResult = new Map();
  function drop(f) { flows.delete(f.fid); byState.delete(f.state); if (f.rc) byResult.delete(f.rc); }
  function sweep() { const now = Date.now(); for (const f of [...flows.values()]) if (now - f.created > TTL) drop(f); }
  setInterval(sweep, 60_000).unref();
  const live = f => f && Date.now() - f.created <= TTL;

  const identities = m => (Array.isArray(m.identities) ? m.identities : []);
  const memberFor = (p, pid) => getMembers().find(m => m.role !== 'agent' && identities(m).some(i => i.provider === p && i.id === pid)) || null;

  async function call(url, { form, token } = {}) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetch(url, { method: form ? 'POST' : 'GET', signal: ctl.signal, redirect: 'error', body: form ? new URLSearchParams(form).toString() : undefined,
        headers: { Accept: 'application/json', 'User-Agent': 'TribeCode', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      return { status: res.status, data: await res.json().catch(() => ({})) };
    } finally { clearTimeout(t); }
  }

  function start(req, p, body, me) {
    if (!isOn(p)) throw err(404, `${PROVIDERS[p].name} sign-in is off in this tribe`);
    const mode = ['join', 'signin', 'link', 'account'].includes(body.mode) ? body.mode : null;
    if (!mode) throw err(400, 'mode must be join, signin, link or account');
    let account = null, desktop = null;
    if (mode === 'account') {   // feat/auth2: link a provider to the signed-in account (Settings › Account)
      const a = acctsOn() ? accounts.accountFromReq(req) : null;
      if (!a) throw err(401, 'sign in to your account first');
      account = a.id;
    }
    if (body.desktop !== undefined) {   // feat/auth2: the desktop app finishes this itself (PKCE S256 challenge from the app)
      const ch = body.desktop && typeof body.desktop.challenge === 'string' ? body.desktop.challenge : '';
      if (!/^[A-Za-z0-9_-]{43}$/.test(ch) || (body.desktop.method && body.desktop.method !== 'S256')) throw err(400, 'the desktop sign-in needs a PKCE S256 challenge');
      if (mode === 'join' || mode === 'link') throw err(400, 'the desktop app signs in or links an account; join from an invite in the browser');
      desktop = ch;
    }
    let invite = null, member = null;
    if (mode === 'join') {
      invite = str(body.code, 16);
      if (!/^[A-Za-z0-9]{4,16}$/.test(invite) || !findInvite(invite)) throw err(410, 'invite expired or invalid');
    }
    if (mode === 'link') {
      if (!me) throw err(401, 'sign in first');
      if (me.role === 'agent') throw err(403, 'agents do not link accounts');
      member = me.id;
    }
    sweep();
    if (flows.size >= MAX_FLOWS) throw err(429, 'too many sign-ins in progress, try again in a few minutes');
    const verifier = rnd(48), nonce = rnd(24), base = originOf(req);
    const f = { fid: rnd(18), state: rnd(32), provider: p, mode, invite, member, account, desktop, verifier, nonceHash: sha(nonce), nonce, base, redirectUri: `${base}/api/oauth/${p}/callback`,
      created: Date.now(), launched: false, used: false, profile: null, rc: null, done: false };
    flows.set(f.fid, f); byState.set(f.state, f);
    return { url: `${base}/api/oauth/go/${f.fid}`, expiresIn: TTL / 1000 };
  }

  function redirect(res, to, cookie) {
    res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
    res.end();
  }
  const cookieFor = (f, value, maxAge) => `tc_oauth=${value}; Path=/api/oauth/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${f.base.startsWith('https:') ? '; Secure' : ''}`;
  // Where to land after the provider: the invite page (join) or the sign-in page (signin, link).
  const landing = f => (f.mode === 'join' ? `/join/${encodeURIComponent(f.invite)}` : '/signin.html');
  const oops = (f, code) => `${landing(f)}#oauth_error=${ERRORS.includes(code) ? code : 'provider'}`;

  function go(req, res, fid) {
    const f = flows.get(fid);
    if (!live(f) || f.launched) return redirect(res, '/signin.html#oauth_error=expired');
    f.launched = true;
    const P = PROVIDERS[f.provider], c = conf()[f.provider];
    const q = new URLSearchParams({ response_type: 'code', client_id: c.clientId, redirect_uri: f.redirectUri, scope: P.scope, state: f.state,
      code_challenge: crypto.createHash('sha256').update(f.verifier).digest('base64url'), code_challenge_method: 'S256' });
    if (f.provider === 'google') { q.set('nonce', f.nonce); q.set('prompt', 'select_account'); }
    if (f.provider === 'discord') q.set('prompt', 'consent');
    if (f.provider === 'github') q.set('allow_signup', 'true');
    if (f.provider === 'apple') { q.delete('scope'); q.set('response_mode', 'query'); }   // scope-less: see the TODO on PROVIDERS.apple
    const nonce = f.nonce; f.nonce = null;   // only the cookie carries it from here on
    return redirect(res, `${P.authorize(baseOf(f.provider), mocked(f.provider))}?${q}`, cookieFor(f, nonce, TTL / 1000));
  }

  async function callback(req, res, p, url) {
    const state = String(url.searchParams.get('state') || '');
    const f = state.length < 200 ? byState.get(state) : null;
    if (!live(f) || f.provider !== p || !f.launched) return redirect(res, '/signin.html#oauth_error=expired');
    if (f.used) { drop(f); return redirect(res, oops(f, 'expired')); }   // a replayed callback kills the flow
    f.used = true;
    const nonce = cookieOf(req, 'tc_oauth');
    const clear = cookieFor(f, '', 0);
    if (!nonce || !same(sha(nonce), f.nonceHash)) { drop(f); return redirect(res, oops(f, 'mismatch'), clear); }
    if (url.searchParams.get('error')) { drop(f); return redirect(res, oops(f, url.searchParams.get('error') === 'access_denied' ? 'denied' : 'provider'), clear); }
    const code = String(url.searchParams.get('code') || '');
    if (!code || code.length > 2000) { drop(f); return redirect(res, oops(f, 'provider'), clear); }
    const P = PROVIDERS[p], c = conf()[p];
    if (!isOn(p)) { drop(f); return redirect(res, oops(f, 'off'), clear); }
    try {
      const tok = await call(P.token(baseOf(p), mocked(p)), { form: { grant_type: 'authorization_code', code, redirect_uri: f.redirectUri, client_id: c.clientId, client_secret: c.clientSecret, code_verifier: f.verifier } });
      const at = tok.data && tok.data.access_token;
      if (tok.status >= 300 || !at || typeof at !== 'string') throw new Error(`token HTTP ${tok.status} ${String((tok.data && (tok.data.error_description || tok.data.error)) || '').slice(0, 80)}`);
      let data;
      if (P.idToken) { data = jwtClaims(tok.data.id_token); if (!data || data.aud !== c.clientId) throw new Error('no usable id_token'); }   // Apple: no profile endpoint
      else { const me = await call(P.user(baseOf(p), mocked(p)), { token: at }); if (me.status >= 300 || !me.data) throw new Error(`profile HTTP ${me.status}`); data = me.data; }
      const raw = P.profile(data), pid = String(raw.id == null ? '' : raw.id);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(pid)) throw new Error('profile has no usable id');
      if (P.emails && !raw.email) {   // GitHub: the primary verified address, when the user shares it (optional: a failure is no email)
        try { const em = await call(P.emails(baseOf(p), mocked(p)), { token: at }); const x = Array.isArray(em.data) ? em.data.find(e => e && e.primary && e.verified) : null; if (em.status < 300 && x) { raw.email = x.email; raw.emailVerified = true; } } catch {}
      }
      const email = cleanEmail(raw.email);
      f.profile = { id: pid, name: cleanName(raw.name), avatar: cleanAvatar(p, raw.avatar), email, emailVerified: !!(email && raw.emailVerified) };
    } catch (e) {
      log(`Sign in with ${P.name}: ${e.message}`); drop(f);
      return redirect(res, oops(f, 'provider'), clear);
    }
    f.verifier = null;
    if (f.desktop) {   // feat/auth2: a one-time handoff code for the desktop app, never the session itself
      const hc = rnd(32); let short = ''; for (let i = 0; i < 6; i++) short += SHORT_ABC[crypto.randomInt(SHORT_ABC.length)];
      const { fid, state, verifier, nonce, ...keep } = f;   // harden: what the exchange needs, never the provider's flow secrets
      const h = { flow: keep, created: Date.now(), expires: Date.now() + HANDOFF_TTL, used: false, wrong: 0, hcHash: sha(hc), shortHash: sha('s:' + short) };
      handoffs.set(h.hcHash, h); shortIdx.set(h.shortHash, h.hcHash);
      return redirect(res, `/signin.html#desktop=${hc}&short=${short}`, clear);
    }
    f.rc = rnd(32); byResult.set(f.rc, f);
    return redirect(res, `${landing(f)}#oauth=${f.rc}`, clear);
  }

  // The page trades its one-time result code for the outcome (and, for join/signin, a key).
  function finish(req, body, me) {
    const rc = str(body.rc, 80), f = rc ? byResult.get(rc) : null;
    if (!live(f) || f.done || !f.profile) throw err(410, 'this sign-in expired: try again', 'expired');
    f.done = true; drop(f);
    return outcome(req, f, me);
  }
  // feat/auth2: the desktop app trades the handoff code (or the typed 6 characters) plus its PKCE verifier for the outcome
  // harden: kept in .tribe/pending-desktop.json (0600, hashes only: sha(code) and sha('s:' + short)), pruned on expiry, so a
  // restart between the browser and the app doesn't lose the sign-in. One record per handoff; the short code is an index.
  const handoffs = require('./pendstore')(store.p('.tribe', 'pending-desktop.json'), { max: 2000, log });   // sha(code) -> handoff
  const shortIdx = new Map(); for (const [k, h] of handoffs) if (h.shortHash) shortIdx.set(h.shortHash, k);
  const dropHandoff = h => { shortIdx.delete(h.shortHash); handoffs.delete(h.hcHash); };
  setInterval(() => { for (const [k, hc] of shortIdx) if (!handoffs.get(hc)) shortIdx.delete(k); }, 30_000).unref();
  function exchange(req, body, me) {
    const code = str(body.code, 80), short = str(body.short, 12).toUpperCase().replace(/[^A-Z0-9]/g, ''), verifier = str(body.verifier, 200);
    const h = code ? handoffs.get(sha(code)) : short.length === 6 ? handoffs.get(shortIdx.get(sha('s:' + short))) : null;
    if (!h || h.used) throw err(410, 'that code expired or was already used: sign in again from the app', 'expired');
    if (Date.now() - h.created > HANDOFF_TTL) { dropHandoff(h); throw err(410, 'that code expired (codes last 2 minutes): sign in again from the app', 'expired'); }
    const want = h.flow.desktop, got = /^[A-Za-z0-9_-]{43,128}$/.test(verifier) ? crypto.createHash('sha256').update(verifier).digest('base64url') : '';
    if (!same(got, want)) { if (++h.wrong >= 3) dropHandoff(h); else handoffs.save(); throw err(400, 'this code was started in another app: sign in again from TribeCode', 'mismatch'); }
    h.used = true; dropHandoff(h);
    return outcome(req, h.flow, me);
  }
  function outcome(req, f, me) {
    const { id: pid, name, avatar } = f.profile, P = PROVIDERS[f.provider];
    if (f.mode === 'account') {   // feat/auth2: link to the signed-in account (the same account must finish it)
      const a = acctsOn() ? accounts.accountFromReq(req) : null;
      if (!a || a.id !== f.account) throw err(403, 'finish linking where you are signed in to your account', 'mismatch');
      try { return { mode: 'account-link', provider: f.provider, providerName: P.name, account: accounts.attachProvider(a, f.provider, f.profile) }; }
      catch (e) { throw err(e.status || 409, `that ${P.name} account already belongs to another account`, 'taken'); }
    }
    const identity = { provider: f.provider, id: pid, name: name || null, at: new Date().toISOString() };
    const owner = memberFor(f.provider, pid);
    if (f.mode === 'link') {
      if (!me || me.id !== f.member) throw err(403, 'finish linking in the browser where you are signed in to this tribe', 'mismatch');
      if (owner && owner.id !== me.id) throw err(409, `that ${P.name} account is already linked to someone else in this tribe`, 'taken');
      const m = getMembers().find(x => x.id === me.id);
      m.identities = [...identities(m).filter(i => i.provider !== f.provider), identity];
      if (avatar && !m.avatar) m.avatar = avatar;
      saveMembers();
      log(`${m.name} linked ${P.name}`);
      return { mode: 'link', provider: f.provider, providerName: P.name, member: publicMember(m), linked: viewLinked(m) };
    }
    if (f.mode === 'signin' || owner) {
      // Sign back in (or a join by someone who is already in): a new device token for that member.
      if (!owner) {
        // feat/auth2: accounts on -> sign in to the account with this identity, offer a link, or start a new account
        const out = f.mode === 'signin' && acctsOn() ? accounts.oauthOutcome(f.provider, f.profile, req) : null;
        if (out) { log(`Sign in with ${P.name}: ${out.mode}`); return { ...out, provider: f.provider, providerName: P.name, tribe }; }
        throw err(404, `no one in this tribe has linked that ${P.name} account yet: ask for an invite, or link it in Settings first`, 'unknown');
      }
      let project = null;
      if (f.mode === 'join') {
        const inv = findInvite(f.invite);
        if (inv) project = addToProject(owner, inv);
      }
      // feat/auth3: two-step on this member's account -> a code (or a passkey) before the device key
      if (acctsOn() && accounts.memberGate) { let g; try { g = accounts.memberGate(owner, req, { provider: f.provider, providerName: P.name }); } catch (e) { throw err(e.status || 403, e.message, e.code); } if (g) return { ...g, provider: f.provider, providerName: P.name }; }
      const { key } = devices.create(owner, req, `${P.name} sign-in`);
      const r = devices.redeem(key, req);
      log(`${owner.name} signed in with ${P.name}`);
      return { mode: 'signin', provider: f.provider, providerName: P.name, member: publicMember(owner), token: r.token, path: `/m/${key}/`, tribe, project, existing: true };
    }
    // Join: the same invite checks and consumption as POST /api/join.
    const inv = findInvite(f.invite);
    if (!inv) throw err(410, 'invite expired or invalid', 'invite');
    const out = joinByInvite(inv, { name: name || `${P.name} friend`, extra: { identities: [identity], ...(avatar ? { avatar } : {}) } });
    log(`${out.member.name} joined with ${P.name}`);
    return { mode: 'join', provider: f.provider, providerName: P.name, member: publicMember(out.member), token: out.token, tribe, project: out.project };
  }

  const viewLinked = m => identities(m).filter(i => PROVIDERS[i.provider]).map(i => ({ provider: i.provider, providerName: PROVIDERS[i.provider].name, name: i.name || null, at: i.at || null }));
  const onList = () => Object.keys(PROVIDERS).filter(isOn).map(id => ({ id, name: PROVIDERS[id].name }));
  function viewConfig(req) {
    const c = conf();
    return Object.entries(PROVIDERS).map(([id, P]) => {
      const x = c[id] || {};
      return { id, name: P.name, enabled: !!x.enabled, on: isOn(id), clientId: x.clientId || '', hasSecret: !!x.clientSecret, redirectUri: redirectUri(req, id), register: P.register, where: P.where };
    });
  }

  // index.js limited(), with one bucket per endpoint and address, so a sign-in doesn't eat the invite page's budget.
  const tooMany = (req, what, n) => limited(req, n, 60_000, `oauth-${what}`);   // feat/auth2: per client (the tunnel's client address too), per endpoint
  async function route(req, res, { m, b, c, me, url, readBody, send, fail }) {
    try {
      if (b === 'providers' && m === 'GET') {
        if (tooMany(req, 'providers', 60)) return fail(res, 429, 'slow down');
        return send(res, 200, { providers: onList() });
      }
      if (b === 'config') {
        if (!me || me.role !== 'host') return fail(res, 403, 'only the host sets up sign-in');
        if (m === 'GET' && !c) return send(res, 200, { providers: viewConfig(req), canEdit: isLocal(req), public: !!publicBase() });
        if ((m === 'PUT' || m === 'POST') && PROVIDERS[c]) {
          if (!isLocal(req)) return fail(res, 403, 'change sign-in providers on the host computer');
          const body = await readBody(req), all = conf(), x = { ...(all[c] || {}) };
          if (body.clientId !== undefined) {
            const v = str(body.clientId, 200);
            if (v && !CID_RE.test(v)) return fail(res, 400, 'that does not look like a client id');
            if (v) x.clientId = v; else { delete x.clientId; delete x.clientSecret; x.enabled = false; }
          }
          if (body.clientSecret !== undefined && body.clientSecret !== '') {
            const v = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : '';
            if (!SECRET_RE.test(v)) return fail(res, 400, 'that does not look like a client secret');
            x.clientSecret = v;
          }
          if (body.enabled !== undefined) {
            if (body.enabled && !(x.clientId && x.clientSecret)) return fail(res, 400, 'paste the client id and secret first');
            x.enabled = !!body.enabled;
          }
          all[c] = x; if (!x.clientId && !x.clientSecret) delete all[c];
          writeConf(all);
          log(`Sign in with ${PROVIDERS[c].name}: ${x.enabled ? 'on' : 'off'}`);
          return send(res, 200, { providers: viewConfig(req), canEdit: true });
        }
        return fail(res, 404, 'not found');
      }
      if (b === 'me') {
        if (!me) return fail(res, 401, 'not a member of this tribe');
        if (me.role === 'agent') return fail(res, 403, 'agents do not link accounts');
        const mem = getMembers().find(x => x.id === me.id);
        if (m === 'GET' && !c) return send(res, 200, { linked: viewLinked(mem), providers: onList() });
        if (m === 'DELETE' && PROVIDERS[c]) {
          mem.identities = identities(mem).filter(i => i.provider !== c);
          if (!mem.identities.length) delete mem.identities;
          saveMembers();
          return send(res, 200, { linked: viewLinked(mem), providers: onList() });
        }
        return fail(res, 404, 'not found');
      }
      if (b === 'go' && m === 'GET' && c) {
        if (tooMany(req, 'go', 30)) return redirect(res, '/signin.html#oauth_error=busy');
        return go(req, res, str(c, 40));
      }
      if (b === 'desktop' && c === 'exchange' && m === 'POST') {
        if (tooMany(req, 'exchange', 10)) return fail(res, 429, 'slow down: wait a minute, then try again');
        return send(res, 200, exchange(req, await readBody(req), me));
      }
      if (b === 'finish' && m === 'POST') {
        if (tooMany(req, 'finish', 20)) return fail(res, 429, 'slow down');
        return send(res, 200, finish(req, await readBody(req), me));
      }
      if (PROVIDERS[b] && c === 'start' && m === 'POST') {
        if (tooMany(req, 'start', 20)) return fail(res, 429, 'slow down');
        return send(res, 200, start(req, b, await readBody(req), me));
      }
      if (PROVIDERS[b] && c === 'callback' && m === 'GET') {
        if (tooMany(req, 'callback', 30)) return redirect(res, '/signin.html#oauth_error=busy');
        return await callback(req, res, b, url);
      }
    } catch (e) {
      if (e.status) return send(res, e.status, { error: e.message, ...(e.code ? { code: e.code } : {}) });
      throw e;
    }
    return null;
  }

  return { route, providers: onList, PROVIDERS };
};
module.exports.PROVIDERS = PROVIDERS;
