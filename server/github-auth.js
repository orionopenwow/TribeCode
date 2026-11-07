// Sign in to GitHub inside TribeCode, so pushes just work (no token pasting, no terminal).
//
//   1. GitHub's OAuth device flow (preferred): TribeCode shows a short code, you type it at github.com/login/device,
//      TribeCode polls until GitHub hands over a token. Needs an OAuth App client id (no secret): env
//      TRIBE_GITHUB_CLIENT_ID, or the host pastes it in Settings › GitHub (.tribe/github.json). docs/GITHUB-AND-FOLDERS.md
//   2. "Use my GitHub CLI login": on the host computer only, reuse `gh auth token` when gh is installed and signed in.
//   3. Paste a token (the old way), checked against GitHub before it is saved.
// The token is saved where TribeCode already keeps a member's GitHub token (workspace.js writeSecret:
// .tribe/secrets/<member>.json, 0600) and is never sent to a browser. So the flow's GitHub step (flow.js tokenOwner),
// "Push my branch" (workspace.js pushAs) and, through pushAuth(), the repo autopilot and the integrator all use it.
// Test hooks: TRIBE_GITHUB_WEB (default https://github.com) and TRIBE_GITHUB_API (default https://api.github.com).
//
// API:
//   GET    /api/github              -> { configured, signedIn, login, via, flow, gh?, local, canConfigure, clientId? }
//   PUT    /api/github/config       { clientId }                     host only
//   POST   /api/github/device       -> { userCode, verificationUri, expiresAt, interval }   start the device flow
//   GET    /api/github/device       -> { state: pending|ok|expired|denied|error|none, login?, error? }
//   DELETE /api/github/device       cancel
//   POST   /api/github/gh           host computer only: use the gh CLI's login
//   POST   /api/github/token        { token }   checked against GitHub, then saved
//   POST   /api/github/signout
'use strict';
const { run } = require('./gitutil');

const API = () => String(process.env.TRIBE_GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
const WEB = () => String(process.env.TRIBE_GITHUB_WEB || 'https://github.com').replace(/\/+$/, '');
const SCOPE = 'repo workflow';
const CID_RE = /^[A-Za-z0-9._-]{8,80}$/;
const TOKEN_RE = /^[\w-]{20,400}$/;
function openUrl(u) {
  if (!/^https?:\/\/[^\s"]+$/.test(String(u || ''))) return false;
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
  try { const c = require('node:child_process').spawn(cmd, args, { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref(); return true; } catch { return false; }
}
const scrub = s => String(s || '').replace(/(gh[pousr]_|github_pat_)[\w]+/g, '***').slice(0, 200);

module.exports = function githubAuth({ W, store, getMembers, isLocal, str, broadcast = () => {}, log = () => {} }) {
  const CONF = '.tribe/github.json';
  const conf = () => store.readJSON(CONF, {}) || {};
  const clientId = () => (process.env.TRIBE_GITHUB_CLIENT_ID || conf().clientId || '').trim() || null;
  const source = () => (process.env.TRIBE_GITHUB_CLIENT_ID ? 'env' : conf().clientId ? 'settings' : null);
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const human = me => me && me.role !== 'agent' && me.role !== 'spectator';

  async function call(url, { method = 'GET', form, token, timeout = 15_000 } = {}) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { method, signal: ctl.signal, body: form ? new URLSearchParams(form).toString() : undefined,
        headers: { Accept: 'application/json', 'User-Agent': 'TribeCode', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(token ? { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } : {}) } });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    } catch (e) { throw err(502, `could not reach GitHub (${e.name === 'AbortError' ? 'timed out' : e.message})`); }
    finally { clearTimeout(t); }
  }
  async function whoami(token) {
    const r = await call(API() + '/user', { token });
    if (r.status === 401) throw err(401, 'GitHub did not accept that token');
    if (r.status >= 300 || !r.data || !r.data.login) throw err(502, `GitHub answered HTTP ${r.status}`);
    return r.data.login;
  }
  async function save(mid, token, via) {
    if (!TOKEN_RE.test(token)) throw err(400, 'that token does not look right');
    const login = await whoami(token);
    W.writeSecret(mid, { ...W.readSecret(mid), githubToken: token, githubLogin: login, githubVia: via, githubAt: new Date().toISOString() });
    broadcast({ type: 'github', member: mid, signedIn: true });
    log(`GitHub: ${login} signed in (${via})`);
    return login;
  }
  function signOut(mid) {
    const { githubToken, githubLogin, githubVia, githubAt, ...rest } = W.readSecret(mid);
    W.writeSecret(mid, Object.keys(rest).length ? rest : null);
    flows.delete(mid);
  }

  // ---------- device flow ----------
  const flows = new Map();   // member id -> { deviceCode, userCode, uri, expires, interval, state, login, error, timer }
  function viewFlow(f) { return f ? { state: f.state, userCode: f.userCode, verificationUri: f.uri, expiresAt: new Date(f.expires).toISOString(), interval: f.interval, login: f.login || null, error: f.error || null } : { state: 'none' }; }
  async function start(me) {
    const cid = clientId();
    if (!cid) throw err(400, 'GitHub sign-in needs an OAuth App client id first (Settings › GitHub)');
    const old = flows.get(me.id); if (old) clearTimeout(old.timer);
    const r = await call(WEB() + '/login/device/code', { method: 'POST', form: { client_id: cid, scope: SCOPE } });
    if (r.data.error) throw err(r.data.error === 'device_flow_disabled' ? 400 : 502, r.data.error === 'device_flow_disabled'
      ? 'Device Flow is off for this OAuth App: on GitHub, open the app\'s settings and tick "Enable Device Flow"'
      : r.data.error === 'unauthorized_client' || r.data.error === 'incorrect_client_credentials' ? 'GitHub does not know that client id: check it in Settings › GitHub'
      : `GitHub said: ${scrub(r.data.error_description || r.data.error)}`);
    if (r.status >= 300 || !r.data.device_code || !r.data.user_code) throw err(502, `GitHub could not start the sign-in (HTTP ${r.status})`);
    const f = { deviceCode: r.data.device_code, userCode: r.data.user_code, uri: r.data.verification_uri || `${WEB()}/login/device`,
      expires: Date.now() + (Number(r.data.expires_in) || 900) * 1000, interval: Math.max(1, Number(r.data.interval) || 5), state: 'pending', timer: null };
    flows.set(me.id, f);
    const tick = async () => {
      if (flows.get(me.id) !== f || f.state !== 'pending') return;
      if (Date.now() > f.expires) { f.state = 'expired'; return; }
      try {
        const p = await call(WEB() + '/login/oauth/access_token', { method: 'POST', form: { client_id: cid, device_code: f.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' } });
        if (flows.get(me.id) !== f) return;
        const e = p.data.error;
        if (p.data.access_token) {
          try { f.login = await save(me.id, p.data.access_token, 'device'); f.state = 'ok'; } catch (x) { f.state = 'error'; f.error = x.message; }
          f.deviceCode = null; return;
        }
        if (e === 'authorization_pending') {}
        else if (e === 'slow_down') f.interval = Number(p.data.interval) || f.interval + 5;
        else if (e === 'expired_token') { f.state = 'expired'; return; }
        else if (e === 'access_denied') { f.state = 'denied'; return; }
        else if (e) { f.state = 'error'; f.error = scrub(p.data.error_description || e); return; }
      } catch (x) { log('GitHub device poll: ' + x.message); }   // network blip: keep trying until it expires
      f.timer = setTimeout(tick, f.interval * 1000); if (f.timer.unref) f.timer.unref();
    };
    f.timer = setTimeout(tick, f.interval * 1000); if (f.timer.unref) f.timer.unref();
    return viewFlow(f);
  }

  // ---------- gh CLI ----------
  async function useGh(me) {
    if (process.env.TRIBE_NO_GH) throw err(400, 'the GitHub CLI is turned off here');
    const r = await run('gh', ['auth', 'token', '--hostname', 'github.com'], { timeout: 8000, env: W.NOPROMPT });
    const token = (r.out || '').split('\n')[0].trim();
    if (r.code || !token) throw err(400, r.code === 127 || /ENOENT/.test(r.err) ? 'the GitHub CLI (gh) is not installed on this computer' : 'the GitHub CLI is not signed in: run `gh auth login` once, or sign in with GitHub here');
    return save(me.id, token, 'gh');
  }

  // A host token for pushes that run on their own (the repo autopilot, the integrator): the host's saved GitHub login.
  function pushAuth() {
    const host = getMembers().find(m => m.role === 'host' && W.hasToken(m.id));
    return host ? W.pushEnv(host.id) : { args: [], env: {} };
  }

  async function status(req, me) {
    const s = W.readSecret(me.id), local = isLocal(req), host = me.role === 'host';
    return { configured: !!clientId(), source: source(), ...(host ? { clientId: clientId() } : {}), signedIn: !!s.githubToken, login: s.githubToken ? s.githubLogin || null : null,
      via: s.githubToken ? s.githubVia || 'token' : null, flow: viewFlow(flows.get(me.id)), local, canConfigure: host && human(me),
      gh: local && !process.env.TRIBE_NO_GH ? await W.ghStatus().catch(() => null) : null };
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!human(me)) return fail(res, 403, 'people sign in to GitHub, not agents');
    try {
      if (!b && m === 'GET') return send(res, 200, { github: await status(req, me) });
      if (b === 'config' && (m === 'PUT' || m === 'POST')) {
        if (me.role !== 'host') return fail(res, 403, 'only the host sets the GitHub app');
        const cid = str((await readBody(req)).clientId, 100);
        if (cid && !CID_RE.test(cid)) return fail(res, 400, 'that does not look like a GitHub client id (it looks like Ov23li… or Iv1.…)');
        const c = conf(); if (cid) c.clientId = cid; else delete c.clientId;
        store.writeJSON(CONF, c);
        return send(res, 200, { github: await status(req, me) });
      }
      if (b === 'device' && m === 'POST') {
        const body = await readBody(req), out = await start(me);
        // The desktop app can't always open a browser tab itself: on the host computer, the server opens the page.
        if (body.open && isLocal(req) && !process.env.TRIBE_NO_REVEAL) openUrl(out.verificationUri);
        return send(res, 200, out);
      }
      if (b === 'device' && m === 'GET') return send(res, 200, viewFlow(flows.get(me.id)));
      if (b === 'device' && m === 'DELETE') { const f = flows.get(me.id); if (f) clearTimeout(f.timer); flows.delete(me.id); return send(res, 200, { ok: true }); }
      if (b === 'gh' && m === 'POST') {
        if (!isLocal(req)) return fail(res, 403, 'only on the host computer: the GitHub CLI login belongs to that computer');
        return send(res, 200, { login: await useGh(me), github: await status(req, me) });
      }
      if (b === 'token' && m === 'POST') {
        const t = str((await readBody(req)).token, 400);
        return send(res, 200, { login: await save(me.id, t, 'token'), github: await status(req, me) });
      }
      if (b === 'signout' && m === 'POST') { signOut(me.id); return send(res, 200, { github: await status(req, me) }); }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  return { route, pushAuth, clientId, start, signOut };
};
