// Sign-in for MCP clients that sign in instead of sending a key (the claude.ai connector form, ChatGPT's custom MCP
// server, an editor or CLI set up with only the address), so no key rides in a URL. It is standard MCP authorization
// and assumes no particular product: any client that follows the spec can use it.
// The tribe host is both the MCP server (resource server) and its own small authorization server, following the MCP
// authorization spec (2025-11-25): OAuth 2.1 authorization code + PKCE (S256 only), public clients, Dynamic Client
// Registration (RFC 7591), Protected Resource Metadata (RFC 9728), Authorization Server Metadata (RFC 8414),
// token revocation (RFC 7009).
//
//   GET  /.well-known/oauth-protected-resource[/mcp]   { resource, authorization_servers }
//   GET  /.well-known/oauth-authorization-server       endpoints, code_challenge_methods_supported: ['S256']
//   POST /connect/register    { redirect_uris, client_name }  -> { client_id }   (https, or http on localhost; no fragments)
//   GET  /connect/authorize   checks the client, the exact redirect URI and PKCE, then shows TribeCode's own consent page
//                             (app/ui/agent-consent.html): "Let Cursor join as <name>'s Cursor".
//   GET  /connect/request     what the consent page shows; once approved, where to send the browser
//   POST /connect/token       authorization_code (+ code_verifier) | refresh_token (rotating; reuse revokes the grant)
//   POST /connect/revoke      { token }
//   /api/agent-auth           the signed-in person approves: GET ?code= (what is asking), POST { rid | code, allow }
//                             (/api/claude-auth is the old name of the same route)
//
// Which agent it becomes: the name the app registered under (client_name) picks the kind (server/agentshub.js
// agentKindOfClient: "Claude" -> claude, "Cursor" -> cursor, "ChatGPT" -> chatgpt…; a name nobody knows is "other",
// "<name>'s agent"). The name is only a label: it changes what the agent is called, never what it may do.
// Redirects: any https address, or http on this computer (any port: RFC 8252 §7.3). No list of vendors' addresses, so
// nothing here assumes claude.ai. Custom app schemes (cursor://, vscode://) are refused; the tools listed in
// docs/ANY-LLM.md all document an https or a loopback redirect.
// Who approves: the member signed in on the consent page's own address. A host who uses the app on localhost while
// the app opens the public address isn't signed in there, so the page also shows a short code to type in the app
// (Invite › Your AI agent); the app shows who is asking before Approve.
// What a token is: an access token (1 hour) and a refresh token (30 days, rotated on every use), random, kept only as
// sha256 hashes in .tribe/claude-oauth.json (the file keeps its name). An access token signs in as the person's invited
// agent of that kind, so every rule in server/inviteagent.js applies (their access and never more, scopes, Pause,
// Remove, the rate limit).
// Revoking: the sheet's "Signed in" list, Remove, a new key, or POST /connect/revoke.
'use strict';
const crypto = require('node:crypto');
const { AGENT_KINDS, agentKindOfClient } = require('./agentshub');

const ACCESS_MS = 3600_000, REFRESH_MS = 30 * 86400_000, CODE_MS = 120_000, REQ_MS = 600_000;
const FILE = '.tribe/claude-oauth.json';
const MAX_CLIENTS = 400, MAX_GRANTS_PER_AGENT = 8, MAX_PENDING = 500;
const ACCESS_PREFIX = 'tcm_', REFRESH_PREFIX = 'tcmr_';   // not tca_: that is an account session (server/accounts.js)
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L

// A redirect URI a client may register: https anywhere, http only on this computer; no fragment, no credentials.
function redirectOk(raw) {
  if (typeof raw !== 'string' || raw.length > 1000) return false;
  let u; try { u = new URL(raw); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && LOOPBACK.test(u.hostname);
}
// Exact match, except a loopback redirect may use any port (native apps pick a free one: RFC 8252 §7.3).
function redirectMatches(registered, asked) {
  if (registered === asked) return true;
  let a, b; try { a = new URL(registered); b = new URL(asked); } catch { return false; }
  if (a.protocol !== 'http:' || b.protocol !== 'http:' || !LOOPBACK.test(a.hostname) || !LOOPBACK.test(b.hostname)) return false;
  return !b.hash && !b.username && !b.password && a.hostname.toLowerCase() === b.hostname.toLowerCase() && a.pathname === b.pathname && a.search === b.search;
}
const s256 = v => crypto.createHash('sha256').update(v).digest('base64url');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = function agentAuth({ store, hash, id, limited, member, ensureAgent, bases, tribe, pushPresence = () => {}, audit = () => {}, now = () => Date.now() }) {
  let db = store.readJSON(FILE, null) || {};
  if (!Array.isArray(db.clients)) db.clients = [];
  if (!Array.isArray(db.grants)) db.grants = [];
  const save = () => store.writeJSON(FILE, db);
  const pending = new Map();   // rid -> the authorization request waiting for a person
  const codes = new Map();     // hash(code) -> { grant seed, exp, used }
  const iso = t => new Date(t).toISOString();

  function sweep() {
    const t = now();
    for (const [k, p] of pending) if (t - p.at > REQ_MS) pending.delete(k);
    for (const [k, c] of codes) if (t > c.exp + 600_000) codes.delete(k);
    const before = db.grants.length;
    db.grants = db.grants.filter(g => t < g.refreshExp && member(g.agent));
    if (db.grants.length !== before) save();
  }
  const timer = setInterval(sweep, 60_000); if (timer.unref) timer.unref();

  // ---------- metadata ----------
  function resourceMeta(req) {
    const b = bases(req);
    return { resource: b.mcp, authorization_servers: [b.issuer], bearer_methods_supported: ['header'], scopes_supported: ['tribe'], resource_name: `TribeCode · ${tribe.name}` };
  }
  function serverMeta(req) {
    const i = bases(req).issuer;
    return { issuer: i, authorization_endpoint: `${i}/connect/authorize`, token_endpoint: `${i}/connect/token`, registration_endpoint: `${i}/connect/register`, revocation_endpoint: `${i}/connect/revoke`,
      response_types_supported: ['code'], response_modes_supported: ['query'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: ['tribe'], authorization_response_iss_parameter_supported: true };
  }
  // The 401 an MCP client reads to find the sign-in (RFC 9728 §5.1).
  const challenge = req => `Bearer resource_metadata="${bases(req).issuer}/.well-known/oauth-protected-resource/mcp", scope="tribe"`;
  // A token's audience is this tribe's MCP endpoint (RFC 8707): a `resource` naming anything else is refused.
  const resourceOk = (req, r) => !r || bases(req).resources.includes(String(r).replace(/\/+$/, ''));

  // ---------- clients ----------
  function register(body) {
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : null;
    if (!uris || !uris.length || uris.length > 5 || !uris.every(redirectOk)) return { status: 400, body: { error: 'invalid_redirect_uri', error_description: 'redirect_uris: 1 to 5 https addresses (or http on localhost), without fragments' } };
    const method = body.token_endpoint_auth_method;
    if (method && method !== 'none') return { status: 400, body: { error: 'invalid_client_metadata', error_description: 'only public clients (token_endpoint_auth_method "none") with PKCE' } };
    const grants = Array.isArray(body.grant_types) ? body.grant_types : ['authorization_code', 'refresh_token'];
    if (!grants.includes('authorization_code') || grants.some(g => !['authorization_code', 'refresh_token'].includes(g))) return { status: 400, body: { error: 'invalid_client_metadata', error_description: 'grant_types: authorization_code and refresh_token' } };
    const name = (typeof body.client_name === 'string' ? body.client_name : '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 60) || 'An MCP client';
    const c = { id: 'tcc_' + id(24), name, redirect_uris: uris.slice(), created: iso(now()) };
    db.clients.push(c);
    if (db.clients.length > MAX_CLIENTS) {   // forget the oldest clients nobody approved
      const used = new Set(db.grants.map(g => g.client));
      const drop = db.clients.filter(x => !used.has(x.id)).slice(0, db.clients.length - MAX_CLIENTS);
      db.clients = db.clients.filter(x => !drop.includes(x));
    }
    save();
    return { status: 201, body: { client_id: c.id, client_id_issued_at: Math.floor(now() / 1000), client_name: c.name, redirect_uris: c.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] } };
  }
  const client = cid => db.clients.find(c => c.id === cid) || null;

  // ---------- authorize ----------
  const userCode = () => { let s = ''; for (const b of crypto.randomBytes(6)) s += CODE_ALPHABET[b % CODE_ALPHABET.length]; return s; };
  const back = (redirect, params) => { const u = new URL(redirect); for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v); return u.toString(); };
  // -> { error: 'text for a page' } (never redirect: the client or its address is wrong) | { redirect } | { rid }
  function authorize(req, q) {
    const c = client(q.get('client_id') || '');
    if (!c) return { error: 'This app isn\'t registered with this tribe. Add the connector again.' };
    const asked = q.get('redirect_uri') || (c.redirect_uris.length === 1 ? c.redirect_uris[0] : '');
    if (!asked || !c.redirect_uris.some(r => redirectMatches(r, asked))) return { error: 'The address this app wants to return to isn\'t one it registered, so nothing was approved.' };
    const state = q.get('state') || '', iss = bases(req).issuer;
    const no = (error, error_description) => ({ redirect: back(asked, { error, error_description, state, iss }) });
    if (q.get('response_type') !== 'code') return no('unsupported_response_type', 'response_type must be code');
    const ch = q.get('code_challenge') || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(ch) || q.get('code_challenge_method') !== 'S256') return no('invalid_request', 'PKCE is required: code_challenge with code_challenge_method=S256');
    const resource = q.get('resource') || '';
    if (!resourceOk(req, resource)) return no('invalid_target', 'resource must be this tribe\'s MCP address');
    sweep();
    if (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
    const rid = id(32);
    pending.set(rid, { rid, client: c.id, redirect: asked, challenge: ch, state, resource: resource.replace(/\/+$/, ''), iss, code: userCode(), at: now(), done: null });
    return { rid };
  }
  const hostOf = u => { try { return new URL(u).host; } catch { return ''; } };
  const kindOfClient = c => agentKindOfClient(c && c.name);
  const describe = p => { const c = client(p.client) || {}, k = kindOfClient(c); return { client: c.name || 'An MCP client', kind: k, kindLabel: AGENT_KINDS[k].label, short: AGENT_KINDS[k].short, host: hostOf(p.redirect), loopback: LOOPBACK.test((() => { try { return new URL(p.redirect).hostname; } catch { return ''; } })()), tribe: tribe.name, expires: iso(p.at + REQ_MS) }; };
  const live = p => (p && now() - p.at <= REQ_MS ? p : null);
  // The consent page (it holds the rid): what to show, or where to go once someone approved or declined.
  function request(rid) {
    const p = live(pending.get(String(rid || ''))); if (!p) return null;
    return p.done ? { done: true, redirect: p.done } : { ...describe(p), code: p.code };
  }
  const byCode = code => { const k = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (k.length !== 6) return null; for (const p of pending.values()) if (!p.done && same(p.code, k) && live(p)) return p; return null; };
  // The signed-in person decides. -> { redirect } for the consent page in this browser, or just { ok } for the code path.
  function decide(me, { rid, code, allow }) {
    const p = rid ? live(pending.get(String(rid))) : byCode(code);
    if (!p || p.done) return { status: 404, error: 'That request ran out. Start again from the app you are connecting.' };
    if (!allow) { p.done = back(p.redirect, { error: 'access_denied', state: p.state, iss: p.iss }); return { ok: true, denied: true, ...(rid ? { redirect: p.done } : {}) }; }
    const ag = ensureAgent(me, kindOfClient(client(p.client))); if (!ag) return { status: 403, error: 'Your role can\'t bring an AI in.' };
    const raw = id(40);
    codes.set(hash(raw), { client: p.client, redirect: p.redirect, challenge: p.challenge, resource: p.resource, agent: ag.id, owner: me.id, exp: now() + CODE_MS, used: false, grant: null });
    p.done = back(p.redirect, { code: raw, state: p.state, iss: p.iss });
    audit(me, 'claude-oauth-approve', ag, { client: (client(p.client) || {}).name, host: hostOf(p.redirect) });
    return { ok: true, name: ag.name, ...(rid ? { redirect: p.done } : {}) };
  }

  // ---------- tokens ----------
  function issue(g) {
    const access = ACCESS_PREFIX + id(40), refresh = REFRESH_PREFIX + id(48), t = now();
    Object.assign(g, { access: hash(access), accessExp: t + ACCESS_MS, prev: g.refresh || null, refresh: hash(refresh), refreshExp: t + REFRESH_MS, used: iso(t) });
    save();
    return { access_token: access, token_type: 'Bearer', expires_in: Math.floor(ACCESS_MS / 1000), refresh_token: refresh, scope: 'tribe' };
  }
  const dropGrant = g => { const n = db.grants.length; db.grants = db.grants.filter(x => x !== g); if (db.grants.length !== n) { save(); pushPresence(); } };
  const bad = (error, error_description, status = 400) => ({ status, body: { error, error_description } });
  function token(req, f) {
    const type = f.grant_type;
    if (type === 'authorization_code') {
      const ck = hash(String(f.code || '')), rec = codes.get(ck);
      if (!rec) return bad('invalid_grant', 'unknown or expired code');
      if (rec.used) { const g = db.grants.find(x => x.id === rec.grant); if (g) dropGrant(g); return bad('invalid_grant', 'this code was already used'); }   // a replayed code also ends what it made
      if (now() > rec.exp) return bad('invalid_grant', 'unknown or expired code');
      if (f.client_id !== rec.client) return bad('invalid_grant', 'this code belongs to another client');
      if (f.redirect_uri && f.redirect_uri !== rec.redirect) return bad('invalid_grant', 'redirect_uri differs from the authorization request');
      const v = String(f.code_verifier || '');
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(v) || !same(s256(v), rec.challenge)) { codes.delete(ck); return bad('invalid_grant', 'code_verifier does not match the code_challenge'); }   // one try: the code is spent
      if (f.resource && String(f.resource).replace(/\/+$/, '') !== rec.resource && (rec.resource || !resourceOk(req, f.resource))) return bad('invalid_target', 'resource differs from the authorization request');
      const ag = member(rec.agent), owner = member(rec.owner);
      if (!ag || !owner || ag.owner !== owner.id || ag.removed) return bad('invalid_grant', 'that agent is no longer in this tribe');
      rec.used = true;
      const mine = db.grants.filter(x => x.agent === ag.id);
      if (mine.length >= MAX_GRANTS_PER_AGENT) db.grants = db.grants.filter(x => !mine.slice(0, mine.length - MAX_GRANTS_PER_AGENT + 1).includes(x));
      const g = { id: 'tcg_' + id(12), agent: ag.id, owner: owner.id, client: rec.client, host: hostOf(rec.redirect), resource: rec.resource || bases(req).mcp, created: iso(now()) };
      db.grants.push(g); rec.grant = g.id;
      const out = issue(g); pushPresence();
      return { status: 200, body: out };
    }
    if (type === 'refresh_token') {
      const th = hash(String(f.refresh_token || ''));
      const reused = db.grants.find(x => x.prev === th);
      if (reused) { dropGrant(reused); return bad('invalid_grant', 'this refresh token was already used: sign in again'); }   // a stolen, rotated token ends the whole grant
      const g = db.grants.find(x => x.refresh === th);
      if (!g || now() > g.refreshExp) return bad('invalid_grant', 'unknown or expired refresh token');
      if (f.client_id && f.client_id !== g.client) return bad('invalid_grant', 'this refresh token belongs to another client');
      const ag = member(g.agent); if (!ag || ag.removed || !member(g.owner)) { dropGrant(g); return bad('invalid_grant', 'that agent is no longer in this tribe'); }
      return { status: 200, body: issue(g) };
    }
    return bad('unsupported_grant_type', 'authorization_code or refresh_token');
  }
  function revoke(f) {
    const th = hash(String(f.token || ''));
    const g = db.grants.find(x => x.access === th || x.refresh === th || x.prev === th);
    if (g) dropGrant(g);
  }
  // server/index.js authed(): an access token signs in as the agent member it was issued for.
  let touched = 0;
  function memberForToken(raw) {
    if (typeof raw !== 'string' || !raw.startsWith(ACCESS_PREFIX)) return null;
    const th = hash(raw), g = db.grants.find(x => x.access === th);
    if (!g || now() > g.accessExp) return null;
    const ag = member(g.agent); if (!ag || ag.removed || ag.owner !== g.owner) return null;
    if (now() - touched > 300_000) { touched = now(); g.used = iso(touched); save(); }
    return ag;
  }
  const isAccessToken = raw => typeof raw === 'string' && (raw.startsWith(ACCESS_PREFIX) || raw.startsWith(REFRESH_PREFIX));
  // For the sheet: which apps hold a sign-in for this agent, and ending one or all.
  const connections = agentId => db.grants.filter(g => g.agent === agentId && now() < g.refreshExp).map(g => ({ id: g.id, client: (client(g.client) || {}).name || 'An MCP client', host: g.host || '', created: g.created, used: g.used || g.created }));
  const active = agentId => db.grants.some(g => g.agent === agentId && now() < g.refreshExp);
  function revokeGrant(agentIds, gid) { const g = db.grants.find(x => x.id === gid && agentIds.includes(x.agent)); if (!g) return false; dropGrant(g); return true; }
  function revokeAgent(agentId) { const n = db.grants.length; db.grants = db.grants.filter(g => g.agent !== agentId); if (db.grants.length !== n) save(); for (const [k, c] of codes) if (c.agent === agentId) codes.delete(k); }

  // ---------- HTTP: the public endpoints (not under /api) ----------
  const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
  function readForm(req, limit = 32 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (/json/i.test(String(req.headers['content-type'] || ''))) { try { const j = JSON.parse(raw || '{}'); return resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : {}); } catch { return reject(Object.assign(new Error('invalid JSON'), { status: 400 })); } }
        resolve(Object.fromEntries(new URLSearchParams(raw)));
      });
      req.on('error', reject);
    });
  }
  const matches = url => url.pathname.startsWith('/connect/') || url.pathname.startsWith('/.well-known/oauth-');
  async function serve(req, res, url, { send, page }) {
    const p = url.pathname, m = req.method;
    const slow = (n, bucket) => { if (!limited(req, n, 60_000, 'claude-oauth-' + bucket)) return false; send(res, 429, { error: 'slow_down', error_description: 'too many requests: try again in a minute' }, { 'Retry-After': '60', ...NO_STORE }); return true; };
    if (/^\/\.well-known\/oauth-protected-resource(\/mcp)?\/?$/.test(p) && m === 'GET') return send(res, 200, resourceMeta(req), { 'Cache-Control': 'max-age=300' });
    if (/^\/\.well-known\/oauth-authorization-server(\/mcp)?\/?$/.test(p) && m === 'GET') return send(res, 200, serverMeta(req), { 'Cache-Control': 'max-age=300' });
    if (p === '/connect/register' && m === 'POST') {
      if (slow(20, 'register')) return;
      const r = register(await readForm(req)); return send(res, r.status, r.body, NO_STORE);
    }
    if (p === '/connect/authorize' && m === 'GET') {
      if (slow(40, 'authorize')) return;
      const r = authorize(req, url.searchParams);
      if (r.error) return page(res, 400, r.error);
      res.writeHead(302, { Location: r.redirect || `/agent-consent.html#rid=${r.rid}`, ...NO_STORE, 'Referrer-Policy': 'no-referrer' }); return res.end();
    }
    if (p === '/connect/request' && m === 'GET') {
      if (slow(120, 'request')) return;
      const r = request(url.searchParams.get('rid')); return r ? send(res, 200, r, NO_STORE) : send(res, 404, { error: 'That request ran out. Start again from the app you are connecting.' }, NO_STORE);
    }
    if (p === '/connect/token' && m === 'POST') {
      if (slow(40, 'token')) return;
      const r = token(req, await readForm(req)); return send(res, r.status, r.body, NO_STORE);
    }
    if (p === '/connect/revoke' && m === 'POST') {
      if (slow(40, 'revoke')) return;
      revoke(await readForm(req)); return send(res, 200, {}, NO_STORE);
    }
    return send(res, 404, { error: 'not found' });
  }
  // ---------- HTTP: /api/claude-auth (a signed-in person) ----------
  async function route(req, res, { m, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'agent') return fail(res, 403, 'people only');
    if (limited(req, 30, 60_000, 'claude-oauth-approve:' + me.id)) return fail(res, 429, 'slow down: too many tries in a minute');
    if (m === 'GET') { const p = byCode(url.searchParams.get('code')); return p ? send(res, 200, describe(p)) : fail(res, 404, 'No request with that code. Check it, or start again from the app you are connecting.'); }
    if (m === 'POST') {
      if (me.role === 'spectator' || me.guest || me.guestUntil) return fail(res, 403, 'spectators and guests can\'t bring an AI in');
      const body = await readBody(req).catch(() => ({}));
      const r = decide(me, { rid: typeof body.rid === 'string' ? body.rid : '', code: typeof body.code === 'string' ? body.code : '', allow: body.allow !== false });
      return r.error ? fail(res, r.status, r.error) : send(res, 200, r);
    }
    return fail(res, 405, 'method not allowed');
  }

  return { matches, serve, route, challenge, memberForToken, isAccessToken, connections, active, revokeGrant, revokeAgent, resourceMeta, serverMeta, register, authorize, request, decide, token, revoke, sweep, _db: () => db };
};
module.exports.redirectOk = redirectOk;
module.exports.redirectMatches = redirectMatches;
