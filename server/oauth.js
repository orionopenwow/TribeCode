// Sign in with Discord / GitHub / Google: for JOINING a tribe from an invite and for signing back in on a new device.
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
    name: 'Discord', scope: 'identify', base: 'https://discord.com',
    env: 'TRIBE_OAUTH_DISCORD_BASE', register: 'https://discord.com/developers/applications',
    where: 'Discord Developer Portal › New Application › OAuth2: add the redirect, copy the client id and reset the secret.',
    authorize: b => b + '/oauth2/authorize', token: b => b + '/api/oauth2/token', user: b => b + '/api/users/@me',
    profile: u => ({ id: u.id, name: u.global_name || u.username,
      avatar: u.avatar && /^\d{5,25}$/.test(String(u.id)) && /^(a_)?[0-9a-f]{32}$/.test(String(u.avatar)) ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null }),
  },
  github: {
    name: 'GitHub', scope: 'read:user', base: 'https://github.com', api: 'https://api.github.com',
    env: 'TRIBE_OAUTH_GITHUB_BASE', register: 'https://github.com/settings/developers',
    where: 'GitHub › Settings › Developer settings › OAuth Apps › New OAuth App: paste the redirect as the callback URL.',
    authorize: b => b + '/login/oauth/authorize', token: b => b + '/login/oauth/access_token', user: (b, mock) => (mock ? b : 'https://api.github.com') + '/user',
    profile: u => ({ id: u.id, name: u.name || u.login, avatar: u.avatar_url }),
  },
  google: {
    name: 'Google', scope: 'openid profile', base: 'https://accounts.google.com',
    env: 'TRIBE_OAUTH_GOOGLE_BASE', register: 'https://console.cloud.google.com/apis/credentials',
    where: 'Google Cloud console › APIs & Services › Credentials › Create OAuth client ID › Web application: add the redirect.',
    authorize: b => b + '/o/oauth2/v2/auth', token: (b, mock) => (mock ? b + '/token' : 'https://oauth2.googleapis.com/token'),
    user: (b, mock) => (mock ? b + '/v1/userinfo' : 'https://openidconnect.googleapis.com/v1/userinfo'),
    profile: u => ({ id: u.sub, name: u.name || u.given_name, avatar: u.picture }),
  },
};
// Avatars only from the provider's own image CDN, over https.
const AVATAR_HOSTS = { discord: /^cdn\.discordapp\.com$/, github: /^avatars\.githubusercontent\.com$/, google: /^lh\d\.googleusercontent\.com$/ };
const TTL = 10 * 60_000, MAX_FLOWS = 500;
const CID_RE = /^[A-Za-z0-9._-]{6,200}$/, SECRET_RE = /^[\x21-\x7e]{6,300}$/;
const ERRORS = ['denied', 'expired', 'mismatch', 'provider', 'invite', 'unknown', 'taken', 'busy', 'off'];

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

module.exports = function makeOAuth({ store, getMembers, saveMembers, publicMember, isLocal, str, limited, publicBase, findInvite, joinByInvite, addToProject, devices, tribe, log = () => {} }) {
  const CONF = '.tribe/oauth.json';
  const conf = () => store.readJSON(CONF, {}) || {};
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
    const mode = ['join', 'signin', 'link'].includes(body.mode) ? body.mode : null;
    if (!mode) throw err(400, 'mode must be join, signin or link');
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
    const f = { fid: rnd(18), state: rnd(32), provider: p, mode, invite, member, verifier, nonceHash: sha(nonce), nonce, base, redirectUri: `${base}/api/oauth/${p}/callback`,
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
      const me = await call(P.user(baseOf(p), mocked(p)), { token: at });
      if (me.status >= 300 || !me.data) throw new Error(`profile HTTP ${me.status}`);
      const raw = P.profile(me.data), pid = String(raw.id == null ? '' : raw.id);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(pid)) throw new Error('profile has no usable id');
      f.profile = { id: pid, name: cleanName(raw.name), avatar: cleanAvatar(p, raw.avatar) };
    } catch (e) {
      log(`Sign in with ${P.name}: ${e.message}`); drop(f);
      return redirect(res, oops(f, 'provider'), clear);
    }
    f.verifier = null;
    f.rc = rnd(32); byResult.set(f.rc, f);
    return redirect(res, `${landing(f)}#oauth=${f.rc}`, clear);
  }

  // The page trades its one-time result code for the outcome (and, for join/signin, a key).
  function finish(req, body, me) {
    const rc = str(body.rc, 80), f = rc ? byResult.get(rc) : null;
    if (!live(f) || f.done || !f.profile) throw err(410, 'this sign-in expired: try again', 'expired');
    f.done = true; drop(f);
    const { id: pid, name, avatar } = f.profile, P = PROVIDERS[f.provider];
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
      if (!owner) throw err(404, `no one in this tribe has linked that ${P.name} account yet: ask for an invite, or link it in Settings first`, 'unknown');
      let project = null;
      if (f.mode === 'join') {
        const inv = findInvite(f.invite);
        if (inv) project = addToProject(owner, inv);
      }
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
  const tooMany = (req, what, n) => limited({ socket: { remoteAddress: `oauth-${what}:${req.socket.remoteAddress}` } }, n);
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
