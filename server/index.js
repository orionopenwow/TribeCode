#!/usr/bin/env node
// TribeCode server: zero dependencies, Node 20+.
//   node server/index.js [--port 4747] [--dir ./tribe] [--name "Campfire Crew"]
// Serves the UI, invite links, presence + chat over WebSocket, and tasks, all stored as files.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { URL } = require('node:url');
const ws = require('./ws');
const { Store, id, code, hash, slug } = require('./store');
const makeBoard = require('./board');
const makeDocs = require('./docs');
const makeBrain = require('./brain');
const makeBugs = require('./bugs');
const makeDrift = require('./drift');
const makeClaims = require('./claims');
const makeMcp = require('./mcp');
const makeDevices = require('./devices');
const makeShare = require('./share');

const VERSION = process.env.TRIBE_VERSION || (() => { try { return require('../app/package.json').version; } catch { return '0.0.0'; } })();
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const PORT = Number(args.port || process.env.TRIBE_PORT || 4747);
const HOST = args.host || process.env.TRIBE_HOST || '0.0.0.0';
const DIR = args.dir || process.env.TRIBE_DIR || path.join(os.homedir(), 'TribeCode');
const UI = path.resolve(args.ui || process.env.TRIBE_UI || path.join(__dirname, '..', 'app', 'ui'));
const STATUSES = ['backlog', 'doing', 'review', 'done'];
const REPO = args.repo ? path.resolve(args.repo) : (process.env.TRIBE_REPO || null);

const store = new Store(DIR);
const tribe = store.readJSON('.tribe/tribe.json', null) || (() => { const t = { name: args.name || 'My Tribe', created: new Date().toISOString() }; store.writeJSON('.tribe/tribe.json', t); return t; })();
let members = store.readJSON('.tribe/members.json', []);
let invites = store.readJSON('.tribe/invites.json', []);
const saveMembers = () => store.writeJSON('.tribe/members.json', members);
const saveInvites = () => store.writeJSON('.tribe/invites.json', invites);
const publicMember = m => m && ({ id: m.id, name: m.name, color: m.color, role: m.role, joined: m.joined });

// ---------- helpers ----------
// Addresses phones and other computers can use to reach this server (Tailscale first: it works anywhere).
function lanUrls() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) for (const a of addrs || []) {
    if (a.family !== 'IPv4' || a.internal) continue;
    const ts = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address) || /tailscale/i.test(name);
    out.push({ url: `http://${a.address}:${PORT}`, kind: ts ? 'tailscale' : 'lan', name });
  }
  return out.sort((x, y) => (y.kind === 'tailscale') - (x.kind === 'tailscale'));
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
const fail = (res, status, error) => send(res, status, { error });
function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
const color = v => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#F26B1D');
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
function authed(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : new URL(req.url, 'http://x').searchParams.get('token');
  if (!t) return null;
  const th = hash(t);
  return members.find(m => m.tokenHash === th) || (devices && devices.memberForToken(th)) || null;
}
const tokenHashOf = req => { const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : new URL(req.url, 'http://x').searchParams.get('token'); return t ? hash(t) : null; };
function newMember({ name, color: c, role }) {
  const token = id(32);
  const m = { id: slug(name).slice(0, 16) + '-' + id(4), name, color: color(c), role, joined: new Date().toISOString(), tokenHash: hash(token) };
  members.push(m); saveMembers();
  return { member: m, token };
}

// simple per-IP limiter for public endpoints
const hits = new Map();
function limited(req, max = 20, windowMs = 60_000) {
  const k = req.socket.remoteAddress, now = Date.now();
  const h = (hits.get(k) || []).filter(t => now - t < windowMs); h.push(now); hits.set(k, h);
  return h.length > max;
}

// ---------- realtime ----------
const online = new Map(); // memberId -> { sockets:Set, where, since }
function broadcast(msg, except) { for (const [, o] of online) for (const s of o.sockets) if (s !== except) s.send(msg); }
const agentSeen = new Map(); // agent id -> { at, where }
const AGENT_IDLE = 3 * 60_000;
function presence() {
  return members.map(m => {
    if (m.role === 'agent') { const a = agentSeen.get(m.id); const on = !!a && Date.now() - a.at < AGENT_IDLE; return { ...publicMember(m), owner: m.owner, online: on, where: on ? a.where : null, since: a ? new Date(a.at).toISOString() : null }; }
    const o = online.get(m.id); return { ...publicMember(m), online: !!o, where: o ? o.where : null, since: o ? o.since : null };
  });
}
function touchAgent(me, tool) {
  if (me.role !== 'agent') return;
  const prev = agentSeen.get(me.id), where = `using ${tool.replace(/_/g, ' ')}`;
  const changed = !prev || Date.now() - prev.at > AGENT_IDLE || prev.where !== where;
  agentSeen.set(me.id, { at: Date.now(), where });
  if (changed) pushPresence();
}
setInterval(() => { for (const [k, a] of agentSeen) if (Date.now() - a.at > AGENT_IDLE && !a.off) { a.off = true; pushPresence(); } }, 30_000).unref();
const pushPresence = () => broadcast({ type: 'presence', members: presence() });

// ---------- huddles (WebRTC signaling only; audio/video flow peer to peer) ----------
const huddle = new Map(); // memberId -> { muted, sharing, joined }
const huddleState = () => [...huddle].map(([mid, h]) => ({ id: mid, muted: h.muted, sharing: h.sharing, joined: h.joined }));
const pushHuddle = () => broadcast({ type: 'huddle', members: huddleState() });
function sendTo(mid, msg) { const o = online.get(mid); if (o) for (const s of o.sockets) s.send(msg); }

// ---------- chat ----------
const channelOk = c => /^[a-z0-9][a-z0-9-]{0,31}$/.test(c);
function postChat(channel, by, text) {
  const msg = { id: id(12), at: new Date().toISOString(), by, text };
  store.appendJSONL(`chat/${channel}.jsonl`, msg);
  broadcast({ type: 'chat', channel, message: msg });
  return msg;
}
function handleCommands(channel, member, text) {
  const t = text.match(/^\/task\s+(.+)/i);
  if (t) { const task = createTask({ title: t[1], by: member.id, source: 'chat' }); postChat(channel, 'tribecode', `Made that a task: **${task.title}**`); }
  const d = text.match(/^\/decide\s+(.+)/i);
  if (d) {
    const day = new Date().toISOString().slice(0, 10), title = d[1].trim().slice(0, 200);
    store.writeMd(`decisions/${day}-${slug(title)}.md`, { date: day, by: member.id, channel }, `# ${title}\n\nDecided in #${channel}.`);
    postChat(channel, 'tribecode', `Logged decision: **${title}**`);
  }
}

// ---------- tasks ----------
const taskFile = t => `tasks/${t.id}.md`;
function loadTasks() {
  return store.listMd('tasks').map(f => { const r = store.readMd(f); return r && { ...r.meta, body: r.body }; }).filter(t => t && t.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.created).localeCompare(String(b.created)));
}
function saveTask(t) {
  const { body = '', ...meta } = t; store.writeMd(taskFile(t), meta, body); broadcast({ type: 'task', task: t });
  bugs.onTask(t);
  return t;
}
function createTask({ title, by, status = 'backlog', assignee = null, body = '', source }) {
  const now = new Date().toISOString();
  const t = { id: `t-${Date.now().toString(36)}-${id(3).toLowerCase()}`, title: str(title, 200) || 'Untitled task', status: STATUSES.includes(status) ? status : 'backlog',
    assignee, by, created: now, updated: now, order: Date.now(), source, body: str(body, 20000) };
  return saveTask(t);
}

// ---------- brain, board, docs ----------
const brain = makeBrain({ host: args.ollama || process.env.OLLAMA_HOST || 'http://localhost:11434', model: args.model || process.env.TRIBE_MODEL || '' });
brain.refresh().then(st => console.log(st.online ? `  Brain:    ${st.model} via Ollama` : `  Brain:    off (${st.error})`));
const readVision = () => { try { return fs.readFileSync(store.p('VISION.md'), 'utf8'); } catch { return ''; } };
const board = makeBoard({ store, id, slug, str, getMembers: () => members, broadcast, postChat, createTask: (o) => createTask(o), repo: REPO, brain, readVision });
const docs = makeDocs({ store, slug, str, broadcast, brain, postChat });
const bugs = makeBugs({ store, id, str, broadcast, postChat, brain, createTask: o => createTask(o), getTask: tid => loadTasks().find(t => t.id === tid) });
const drift = makeDrift({ repo: REPO, getTasks: () => loadTasks(), members: () => members });
const nameOf = mid => (members.find(x => x.id === mid) || {}).name || 'someone';
const claims = makeClaims({ store, id, broadcast, nameOf });
// ---------- web: device links (/m/<key>/) + public https address ----------
const devices = makeDevices({ store, id, hash, str, getMembers: () => members, publicMember, tribe });
const share = makeShare({ port: PORT });
const mcp = makeMcp({
  VERSION, tribe, presence, touchAgent, readVision,
  tasks: {
    all: () => loadTasks().map(t => ({ ...t, assigneeName: t.assignee ? nameOf(t.assignee) : null })),
    create: ({ title, body, status, by }) => createTask({ title, body, status, by, source: 'agent' }),
    update(tid, a, me) {
      const t = loadTasks().find(x => x.id === tid); if (!t) return null;
      if (a.status && STATUSES.includes(a.status)) t.status = a.status;
      if (a.title) t.title = str(a.title, 200);
      if (a.take) t.assignee = me.id;
      if (a.note) t.body = `${t.body ? t.body + '\n\n' : ''}**${me.name}** · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}: ${str(a.note, 2000)}`;
      t.updated = new Date().toISOString(); t.updatedBy = me.id; return saveTask(t);
    },
  },
  docs, claims,
  chat: {
    post(me, text) { const tx = str(text, 4000); if (!tx) return; postChat('general', me.id, tx); handleCommands('general', me, tx); },
    recent: n => store.readJSONL('chat/general.jsonl', n).map(x => `${x.at.slice(11, 16)} ${x.by === 'tribecode' ? 'TribeCode' : nameOf(x.by)}: ${x.text}`).join('\n'),
  },
  board,
});

async function standup() {
  const since = Date.now() - 24 * 3600_000;
  const who = id => (id === 'tribecode' ? 'TribeCode' : (members.find(x => x.id === id) || {}).name || 'someone');
  const chat = store.readJSONL('chat/general.jsonl', 400).filter(x => Date.parse(x.at) > since && x.by !== 'tribecode').map(x => ({ who: who(x.by), text: x.text }));
  const tasks = loadTasks().map(t => ({ title: t.title, status: t.status, assignee: t.assignee ? who(t.assignee) : '' }));
  const text = await brain.standup({ chat, tasks, members });
  if (!text) return null;
  const day = new Date().toISOString().slice(0, 10);
  store.writeMd(`brain/standup-${day}.md`, { date: day, model: brain.status().model }, text);
  postChat('general', 'tribecode', `**Standup for ${day}**\n${text}`);
  return text;
}

// ---------- routes ----------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after /api
  const [a, b, c] = parts; const m = req.method;
  const me = authed(req);
  const need = () => { if (!me) { fail(res, 401, 'not a member of this tribe'); return false; } return true; };

  if (a === 'health') return send(res, 200, { ok: true, version: VERSION, tribe: tribe.name, members: members.length, lan: [...share.lanEntry(), ...lanUrls()] });

  if (a === 'bootstrap' && m === 'POST') {
    if (members.length) return fail(res, 409, 'tribe already has a host');
    if (!isLocal(req)) return fail(res, 403, 'bootstrap only from the host machine');
    const body = await readBody(req); const name = str(body.name, 32);
    if (!name) return fail(res, 400, 'name required');
    if (body.tribe) { tribe.name = str(body.tribe, 48) || tribe.name; store.writeJSON('.tribe/tribe.json', tribe); }
    const out = newMember({ name, color: body.color, role: 'host' });
    postChat('general', 'tribecode', `${name} started the tribe 🔥`);
    return send(res, 200, { member: publicMember(out.member), token: out.token, tribe });
  }

  if (a === 'invites' && b && m === 'GET') {
    if (limited(req)) return fail(res, 429, 'slow down');
    const inv = invites.find(i => i.code === b);
    if (!inv || inv.revoked) return fail(res, 404, 'invite not found');
    if (Date.parse(inv.expires) < Date.now() || inv.uses >= inv.maxUses) return fail(res, 410, 'invite expired');
    const by = members.find(x => x.id === inv.by);
    return send(res, 200, { tribe: tribe.name, invitedBy: by ? by.name : 'someone', role: inv.role, expires: inv.expires,
      members: members.slice(0, 6).map(x => ({ name: x.name, color: x.color })) });
  }

  if (a === 'join' && m === 'POST') {
    if (limited(req, 10)) return fail(res, 429, 'slow down');
    const body = await readBody(req);
    const inv = invites.find(i => i.code === str(body.code, 16));
    if (!inv || inv.revoked || Date.parse(inv.expires) < Date.now() || inv.uses >= inv.maxUses) return fail(res, 410, 'invite expired or invalid');
    const name = str(body.name, 32); if (!name) return fail(res, 400, 'name required');
    inv.uses++; saveInvites();
    const out = newMember({ name, color: body.color, role: inv.role });
    postChat('general', 'tribecode', `${name} joined the tribe 👋`);
    pushPresence();
    return send(res, 200, { member: publicMember(out.member), token: out.token, tribe });
  }

  if (a === 'device-link' || a === 'devices' || a === 'share') {
    const h = await (a === 'share' ? share : devices).route(req, res, { a, b, m, me, tokenHash: tokenHashOf(req), readBody, send, fail, limited });
    if (h !== null) return;
  }

  if (!need()) return;

  if (a === 'me') return send(res, 200, { member: publicMember(me), tribe, version: VERSION });

  if (a === 'members' && m === 'GET') return send(res, 200, { members: presence() });

  if (a === 'invites' && !b && m === 'POST') {
    if (me.role === 'agent') return fail(res, 403, 'agents cannot invite people');
    const body = await readBody(req);
    const hours = Math.min(Math.max(Number(body.hours) || 24, 1), 24 * 30);
    const inv = { code: code(5), by: me.id, role: body.role === 'spectator' ? 'spectator' : 'builder', maxUses: Math.min(Math.max(Number(body.maxUses) || 5, 1), 100),
      uses: 0, created: new Date().toISOString(), expires: new Date(Date.now() + hours * 3600_000).toISOString() };
    invites.push(inv); saveInvites();
    return send(res, 200, { invite: inv });
  }
  if (a === 'invites' && !b && m === 'GET') return send(res, 200, { invites: invites.filter(i => !i.revoked && Date.parse(i.expires) > Date.now()) });
  if (a === 'invites' && b && m === 'DELETE') { const inv = invites.find(i => i.code === b); if (inv) { inv.revoked = true; saveInvites(); } return send(res, 200, { ok: true }); }

  if (a === 'chat' && b) {
    if (!channelOk(b)) return fail(res, 400, 'bad channel');
    if (m === 'GET') return send(res, 200, { messages: store.readJSONL(`chat/${b}.jsonl`, Math.min(Number(url.searchParams.get('limit')) || 100, 500)) });
    if (m === 'POST') {
      if (me.role === 'spectator') return fail(res, 403, 'spectators can read but not post');
      const body = await readBody(req); const text = str(body.text, 4000); if (!text) return fail(res, 400, 'empty message');
      const msg = postChat(b, me.id, text); handleCommands(b, me, text);
      return send(res, 200, { message: msg });
    }
  }

  if (a === 'tasks') {
    if (m === 'GET' && !b) return send(res, 200, { tasks: loadTasks() });
    if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
    if (m === 'POST' && !b) { const body = await readBody(req); return send(res, 200, { task: createTask({ ...body, by: me.id, source: 'board' }) }); }
    const t = b && loadTasks().find(x => x.id === b); if (!t) return fail(res, 404, 'task not found');
    if (m === 'PATCH') {
      const body = await readBody(req);
      if (body.title !== undefined) t.title = str(body.title, 200) || t.title;
      if (body.status !== undefined) { if (!STATUSES.includes(body.status)) return fail(res, 400, 'bad status'); t.status = body.status; }
      if (body.assignee !== undefined) t.assignee = body.assignee && members.some(x => x.id === body.assignee) ? body.assignee : null;
      if (body.order !== undefined && Number.isFinite(Number(body.order))) t.order = Number(body.order);
      if (body.body !== undefined) t.body = str(body.body, 20000);
      t.updated = new Date().toISOString(); t.updatedBy = me.id;
      return send(res, 200, { task: saveTask(t) });
    }
    if (m === 'DELETE') { store.remove(taskFile(t)); broadcast({ type: 'task-removed', id: t.id }); return send(res, 200, { ok: true }); }
  }

  if (a === 'brain') {
    if (m === 'GET') return send(res, 200, { brain: await brain.refresh() });
    if (m === 'POST' && b === 'standup') {
      const text = await standup().catch(e => { console.error(e); return null; });
      return text ? send(res, 200, { text }) : fail(res, 503, brain.status().error || 'local brain is off');
    }
  }
  if (a === 'bugs') {
    const handled = await bugs.route(req, res, { m, b, c, me, readBody, send, fail });
    if (handled !== null) return;
  }
  if (a === 'agents' && m === 'POST') {
    if (me.role === 'spectator' || me.role === 'agent') return fail(res, 403, 'only members can connect agents');
    const name = `Claude · ${me.name}`.slice(0, 32);
    let ag = members.find(x => x.role === 'agent' && x.owner === me.id);
    const token = id(32);
    if (ag) { ag.tokenHash = hash(token); saveMembers(); }
    else { ag = { id: 'agent-' + slug(me.name).slice(0, 10) + '-' + id(4), name, color: '#38C6B1', role: 'agent', owner: me.id, joined: new Date().toISOString(), tokenHash: hash(token) }; members.push(ag); saveMembers(); pushPresence(); }
    const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    return send(res, 200, { agent: publicMember(ag), token, url: `${base}/mcp`, command: `claude mcp add --transport http tribecode ${base}/mcp --header "Authorization: Bearer ${token}"`, tools: mcp.tools });
  }
  if (a === 'claims') {
    if (m === 'GET') return send(res, 200, { claims: claims.list() });
    if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
    if (m === 'POST') { const body = await readBody(req); const r = claims.claim(body.path, body.note, me); return r.conflict ? send(res, 409, { error: `claimed by ${r.conflict.name}`, claim: r.conflict }) : send(res, 200, r); }
    if (m === 'DELETE' && b) return claims.releaseId(b, me) ? send(res, 200, { ok: true }) : fail(res, 404, 'not your claim');
    if (m === 'PATCH' && b) { const body = await readBody(req); if (!members.some(x => x.id === body.to)) return fail(res, 400, 'unknown member'); const c = claims.handOff(b, body.to, me); return c ? send(res, 200, { claim: c }) : fail(res, 404, 'not your claim'); }
  }
  if (a === 'drift' && m === 'GET') return send(res, 200, await drift.radar());
  if (a === 'docs') {
    const handled = await docs.route(req, res, { m, b, c, me, readBody, send, fail });
    if (handled !== null) return;
  }
  if (['proposals', 'milestones', 'vision'].includes(a)) {
    const handled = await board.route(req, res, { m, a, b, c, me, readBody, send, fail });
    if (handled !== null) return;
  }

  return fail(res, 404, 'not found');
}

function serveStatic(req, res, url) {
  if (devices.serveApp(req, res, url, UI)) return;
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' ) rel = '/index.html';
  if (/^\/join\/[A-Za-z0-9]+\/?$/.test(rel)) rel = '/join.html';
  const file = path.resolve(UI, '.' + rel);
  if (!file.startsWith(UI)) return fail(res, 403, 'forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return fail(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  try {
    if (url.pathname === '/mcp') return await mcp.route(req, res, { me: authed(req), readBody, send });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method === 'GET') return serveStatic(req, res, url);
    fail(res, 405, 'method not allowed');
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'server error');
    if (!e.status) console.error(e);
  }
});

server.on('upgrade', (req, sock) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') return sock.destroy();
  const me = authed(req);
  if (!me) { sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return sock.destroy(); }
  const s = ws.accept(req, sock); if (!s) return;
  const o = online.get(me.id) || { sockets: new Set(), where: 'Home', since: new Date().toISOString() };
  o.sockets.add(s); online.set(me.id, o);
  s.send({ type: 'hello', member: publicMember(me), tribe, members: presence(), version: VERSION, huddle: huddleState() });
  pushPresence();
  s.on('message', msg => {
    if (msg.type === 'activity' && typeof msg.where === 'string') { o.where = msg.where.slice(0, 80); pushPresence(); }
    if (msg.type === 'ping') s.send({ type: 'pong', t: msg.t });
    if (typeof msg.type === 'string' && msg.type.startsWith('doc-')) { docs.live.handle(s, me, msg); return; }
    if (msg.type === 'announce' && typeof msg.text === 'string') postChat('general', me.id, msg.text.slice(0, 400));
    if (msg.type === 'huddle-join' && me.role !== 'agent') {
      const first = huddle.size === 0;
      huddle.set(me.id, { muted: !!msg.muted, sharing: false, joined: new Date().toISOString(), socket: s });
      pushHuddle(); if (first) postChat('general', 'tribecode', `🎙️ ${me.name} started a huddle. Jump in from the sidebar.`);
    }
    if (msg.type === 'huddle-leave' && huddle.has(me.id)) { huddle.delete(me.id); pushHuddle(); }
    if (msg.type === 'huddle-state' && huddle.has(me.id)) { const h = huddle.get(me.id); h.muted = !!msg.muted; h.sharing = !!msg.sharing; pushHuddle(); }
    if (msg.type === 'rtc' && typeof msg.to === 'string' && huddle.has(me.id) && huddle.has(msg.to)) {
      const target = huddle.get(msg.to).socket;   // signal only the socket that is in the huddle
      if (target && target.open) target.send({ type: 'rtc', from: me.id, data: msg.data });
    }
  });
  s.on('close', () => {
    o.sockets.delete(s); if (!o.sockets.size) online.delete(me.id);
    docs.live.leaveAll(s);
    const h = huddle.get(me.id); if (h && h.socket === s) { huddle.delete(me.id); pushHuddle(); }
    pushPresence();
  });
});

function start() {
  // --dev (used by scripts/live.js): open tabs reload when UI files change.
  if (args.dev) {
    let t; try {
      fs.watch(UI, { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => broadcast({ type: 'dev-reload' }), 300); });
      console.log('  Live:     UI changes reload open tabs');
    } catch (e) { console.log('  Live:     file watching unavailable (' + e.message + ')'); }
  }
  // When launched by the desktop app, exit if the app goes away.
  if (args['exit-with-parent']) { const parent = process.ppid; setInterval(() => { if (process.ppid !== parent) process.exit(0); }, 2000).unref(); }
  // Write live doc edits that are still inside the debounce window before exiting.
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { docs.live.persistAll(); } catch (e) { console.error(e); } process.exit(0); });
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Is another TribeCode server running?` : e.message); process.exit(1); });
  server.listen(PORT, HOST, () => {
    const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
    console.log(`\n  🔥 TribeCode server v${VERSION}  ·  tribe "${tribe.name}"`);
    console.log(`  Folder:   ${store.root}`);
    console.log(`  Open:     http://localhost:${PORT}`);
    if (lan) console.log(`  Friends:  http://${lan.address}:${PORT}  (same network, or use Tailscale)`);
    console.log('');
  });
}
if (require.main === module) start();

module.exports = { server, store, start };
