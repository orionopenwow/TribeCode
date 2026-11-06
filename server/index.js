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

const VERSION = require('../app/package.json').version;
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const PORT = Number(args.port || process.env.TRIBE_PORT || 4747);
const HOST = args.host || process.env.TRIBE_HOST || '0.0.0.0';
const DIR = args.dir || process.env.TRIBE_DIR || path.join(os.homedir(), 'TribeCode');
const UI = path.resolve(__dirname, '..', 'app', 'ui');
const STATUSES = ['backlog', 'doing', 'review', 'done'];

const store = new Store(DIR);
const tribe = store.readJSON('.tribe/tribe.json', null) || (() => { const t = { name: args.name || 'My Tribe', created: new Date().toISOString() }; store.writeJSON('.tribe/tribe.json', t); return t; })();
let members = store.readJSON('.tribe/members.json', []);
let invites = store.readJSON('.tribe/invites.json', []);
const saveMembers = () => store.writeJSON('.tribe/members.json', members);
const saveInvites = () => store.writeJSON('.tribe/invites.json', invites);
const publicMember = m => m && ({ id: m.id, name: m.name, color: m.color, role: m.role, joined: m.joined });

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', ...headers });
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
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const color = v => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#7C5CFF');
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
function authed(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : new URL(req.url, 'http://x').searchParams.get('token');
  if (!t) return null;
  const th = hash(t);
  return members.find(m => m.tokenHash === th) || null;
}
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
function presence() {
  return members.map(m => { const o = online.get(m.id); return { ...publicMember(m), online: !!o, where: o ? o.where : null, since: o ? o.since : null }; });
}
const pushPresence = () => broadcast({ type: 'presence', members: presence() });

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
function saveTask(t) { const { body = '', ...meta } = t; store.writeMd(taskFile(t), meta, body); broadcast({ type: 'task', task: t }); return t; }
function createTask({ title, by, status = 'backlog', assignee = null, body = '', source }) {
  const now = new Date().toISOString();
  const t = { id: `t-${Date.now().toString(36)}-${id(3).toLowerCase()}`, title: str(title, 200) || 'Untitled task', status: STATUSES.includes(status) ? status : 'backlog',
    assignee, by, created: now, updated: now, order: Date.now(), source, body: str(body, 20000) };
  return saveTask(t);
}

// ---------- routes ----------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after /api
  const [a, b] = parts; const m = req.method;
  const me = authed(req);
  const need = () => { if (!me) { fail(res, 401, 'not a member of this tribe'); return false; } return true; };

  if (a === 'health') return send(res, 200, { ok: true, version: VERSION, tribe: tribe.name, members: members.length });

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

  if (!need()) return;

  if (a === 'me') return send(res, 200, { member: publicMember(me), tribe, version: VERSION });

  if (a === 'members' && m === 'GET') return send(res, 200, { members: presence() });

  if (a === 'invites' && !b && m === 'POST') {
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

  return fail(res, 404, 'not found');
}

function serveStatic(req, res, url) {
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
  s.send({ type: 'hello', member: publicMember(me), tribe, members: presence(), version: VERSION });
  pushPresence();
  s.on('message', msg => {
    if (msg.type === 'activity' && typeof msg.where === 'string') { o.where = msg.where.slice(0, 80); pushPresence(); }
    if (msg.type === 'ping') s.send({ type: 'pong', t: msg.t });
    if (msg.type === 'announce' && typeof msg.text === 'string') postChat('general', me.id, msg.text.slice(0, 400));
  });
  s.on('close', () => { o.sockets.delete(s); if (!o.sockets.size) online.delete(me.id); pushPresence(); });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
    console.log(`\n  🔥 TribeCode server v${VERSION}  ·  tribe "${tribe.name}"`);
    console.log(`  Folder:   ${store.root}`);
    console.log(`  Open:     http://localhost:${PORT}`);
    if (lan) console.log(`  Friends:  http://${lan.address}:${PORT}  (same network, or use Tailscale)`);
    console.log('');
  });
}

module.exports = { server, store };
