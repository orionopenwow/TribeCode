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
const bus = require('./bus');
const makeNotify = require('./notify');
const makeApprovals = require('./approvals');
const makeDm = require('./dm');
const makeVoice = require('./voice');
const makeChatx = require('./chatx');
const makePlan = require('./plan');
const makeDocsX = require('./docsx');
const makeVisuals = require('./visuals');
const makeBusLog = require('./buslog');
const makeProjects = require('./projects');
const makeWorkspace = require('./workspace');
const makeRooms = require('./rooms');
const makeCoord = require('./coord');
const makeAgentNet = require('./agentnet');
const makePeople = require('./people');
const makeFlow = require('./flow');
const makeMcpFlow = require('./mcp-flow');
const makeWorkshop = require('./workshop');
const makeWorkshopMcp = require('./mcp-workshop');
const makeSecretary = require('./secretary');
const makeAgentsHub = require('./agentshub');
const makePreview = require('./preview');
const makeHub = require('./hub');
const makeScratch = require('./scratch');

const VERSION = process.env.TRIBE_VERSION || (() => { try { return require('../app/package.json').version; } catch { return '0.0.0'; } })();
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const PORT = Number(args.port || process.env.TRIBE_PORT || 4747);
const HOST = args.host || process.env.TRIBE_HOST || '0.0.0.0';
const DIR = args.dir || process.env.TRIBE_DIR || path.join(os.homedir(), 'TribeCode');
const UI = path.resolve(args.ui || process.env.TRIBE_UI || path.join(__dirname, '..', 'app', 'ui'));
const STATUSES = ['backlog', 'doing', 'review', 'done'];
const REPO = args.repo ? path.resolve(args.repo) : (process.env.TRIBE_REPO || null);

const baseStore = new Store(DIR);
const tribe = baseStore.readJSON('.tribe/tribe.json', null) || (() => { const t = { name: args.name || 'My Tribe', created: new Date().toISOString() }; baseStore.writeJSON('.tribe/tribe.json', t); return t; })();
// Project rooms (server/projects.js): every module gets a project-aware view of the tribe folder.
const P = makeProjects({ store: baseStore, tribe, slug, defaultRepo: REPO });
const store = P.scopedStore();
P.migrate();
const W = makeWorkspace({ store: baseStore, slug });
let members = store.readJSON('.tribe/members.json', []);
let invites = store.readJSON('.tribe/invites.json', []);
const saveMembers = () => store.writeJSON('.tribe/members.json', members);
const saveInvites = () => store.writeJSON('.tribe/invites.json', invites);
const publicMember = m => m && ({ id: m.id, name: m.name, color: m.color, role: m.role, joined: m.joined, ...(Array.isArray(m.projects) ? { projects: m.projects } : {}), ...(m.guestUntil ? { guest: true, guestUntil: m.guestUntil } : {}) });

// ---------- helpers ----------
// Addresses phones and other computers can use to reach this server (Tailscale first: it works anywhere).
// Where a Claude Code session can reach this tribe's MCP endpoint: anywhere (public link), same Wi-Fi, or this computer.
function agentEndpoints(req, token) {
  const pub = share.publicUrl(), lan = (lanUrls().find(u => u.kind === 'lan') || lanUrls()[0] || {}).url;
  const mcpUrl = base => base && `${base.replace(/\/+$/, '')}/mcp`;
  const cmd = u => u && `claude mcp add --transport http tribecode ${u} --header "Authorization: Bearer ${token || '<key>'}"`;
  const urls = { anywhere: mcpUrl(pub), wifi: mcpUrl(lan), here: mcpUrl(`http://localhost:${PORT}`) };
  const best = urls.anywhere || (isLocal(req) ? urls.here : urls.wifi || urls.here);
  return { url: best, command: cmd(best), commands: { anywhere: cmd(urls.anywhere), wifi: cmd(urls.wifi), here: cmd(urls.here) }, public: !!pub, remove: 'claude mcp remove tribecode' };
}
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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, X-Project', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS', ...headers });
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
// Local means this machine, not traffic that a tunnel (Tailscale Funnel, cloudflared, a reverse proxy) relays from localhost.
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'tailscale-funnel-request', 'cf-connecting-ip', 'cf-ray'];
// Tunnels (Tailscale Funnel, cloudflared) connect from 127.0.0.1, so the socket address alone proves nothing:
// also require a localhost Host header (tunnels carry the public host name) and a local Origin when one is sent.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?|tauri:\/\/localhost|https?:\/\/tauri\.localhost|null)$/i;
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !PROXY_HEADERS.some(h => req.headers[h] !== undefined)
  && LOCAL_HOST.test(String(req.headers.host || '')) && (req.headers.origin === undefined || LOCAL_ORIGIN.test(String(req.headers.origin)));
function authed(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : new URL(req.url, 'http://x').searchParams.get('token');
  if (!t) return null;
  const th = hash(t);
  const m = members.find(x => x.tokenHash === th);
  if (m && m.guestUntil && Date.parse(m.guestUntil) < Date.now()) return null;   // a one-time guest pass that ran out
  return m || (devices && devices.memberForToken(th)) || null;
}
const tokenHashOf = req => { const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : new URL(req.url, 'http://x').searchParams.get('token'); return t ? hash(t) : null; };
function newMember({ name, color: c, role, projects }) {
  const token = id(32);
  const m = { id: slug(name).slice(0, 16) + '-' + id(4), name, color: color(c), role, joined: new Date().toISOString(), tokenHash: hash(token), ...(projects ? { projects } : {}) };
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
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (!h.length || now - h[h.length - 1] > 60_000) hits.delete(k); }, 60_000).unref();   // forget idle addresses

// ---------- realtime ----------
const online = new Map(); // memberId -> { sockets:Set, where, since, project }
// Project rooms: data events reach only sockets that are in the event's project (and can see it); other
// sockets of the same person get a tiny 'project-pulse' so the sidebar badges stay live. Project chat
// channels are delivered as `general`, which is what the chat UI shows for the current project.
const UNSCOPED = new Set(['presence', 'huddle', 'captions', 'dev-reload', 'projects', 'hello', 'workshop']);
const SOFT = new Set(['approval', 'claims']);   // everyone who can see the project, whatever room they are in
const PULSE = new Set(['chat', 'task', 'proposal', 'change', 'approval', 'doc', 'bug']);
const memberById = mid => members.find(x => x.id === mid);
function broadcast(msg, except) {
  const type = String(msg.type || '');
  let pid = null;
  if (!UNSCOPED.has(type)) {
    const ch = typeof msg.channel === 'string' ? msg.channel : null;
    const chPid = ch ? (ch === 'general' ? (P.current() || P.defaultId()) : (P.byChannel(ch) || {}).id) : null;
    pid = msg.project || (msg.approval && msg.approval.project) || chPid || (ch && !chPid ? null : P.current());
    if (type === 'approval' && !msg.project && !(msg.approval && msg.approval.project)) pid = P.defaultId();
  }
  if (dashboard) dashboard.onEvent(type, pid);   // the Global Hub recomputes for whoever can see pid (server/hub.js)
  const asGeneral = typeof msg.channel === 'string' && pid && msg.channel === P.channelOf(pid) && msg.channel !== 'general' ? { ...msg, channel: 'general' } : msg;
  for (const [mid, o] of online) {
    const mem = memberById(mid); if (!mem) continue;
    if (pid && !P.canSee(mem, pid)) continue;
    const out = type === 'presence' ? { type: 'presence', members: presenceFor(mem) } : asGeneral;
    for (const s of o.sockets) {
      if (s === except) continue;
      if (pid && !SOFT.has(type) && s.project !== pid) { if (PULSE.has(type)) s.send({ type: 'project-pulse', project: pid, kind: type }); continue; }
      s.send(out);
    }
  }
}
let dashboard = null;   // the Global Hub, server/hub.js (made below)
const agentSeen = new Map(); // agent id -> { at, where, project }
const AGENT_IDLE = 3 * 60_000;
function presence() {
  return members.map(m => {
    if (m.role === 'agent') { const a = agentSeen.get(m.id); const on = !!a && Date.now() - a.at < AGENT_IDLE; return { ...publicMember(m), owner: m.owner, online: on, where: on ? a.where : null, since: a ? new Date(a.at).toISOString() : null, project: on ? a.project || null : null }; }
    const o = online.get(m.id); return { ...publicMember(m), online: !!o, where: o ? o.where : null, since: o ? o.since : null, project: o ? o.project || null : null };
  });
}
// What one viewer sees: project-scoped friends only see people who share one of their projects.
function presenceFor(viewer) {
  const all = presence();
  if (!viewer || !P.scoped(viewer)) return all;
  const mine = new Set(viewer.projects);
  const shares = m => {
    const src = m.role === 'agent' ? memberById(m.owner) || m : m;
    if (src.id === viewer.id) return true;
    if (Array.isArray(src.projects)) return src.projects.some(x => mine.has(x));
    return [...mine].some(pid => (P.get(pid) || { members: {} }).members[src.id]) || (m.online && mine.has(m.project));
  };
  return all.filter(shares).map(m => (m.project && !mine.has(m.project) ? { ...m, project: null, where: m.online ? 'another project' : null } : m));
}
function touchAgent(me, tool) {
  if (me.role !== 'agent') return;
  const prev = agentSeen.get(me.id), where = `using ${tool.replace(/_/g, ' ')}`, project = P.current();
  const changed = !prev || Date.now() - prev.at > AGENT_IDLE || prev.where !== where || prev.project !== project;
  agentSeen.set(me.id, { at: Date.now(), where, project });
  if (changed) pushPresence();
}
setInterval(() => { for (const [k, a] of agentSeen) if (Date.now() - a.at > AGENT_IDLE && !a.off) { a.off = true; pushPresence(); } }, 30_000).unref();
const pushPresence = () => broadcast({ type: 'presence', members: presence() });

// ---------- huddles (WebRTC signaling only; audio/video flow peer to peer) ----------
const huddle = new Map(); // memberId -> { muted, sharing, joined }
const huddleState = () => [...huddle].map(([mid, h]) => ({ id: mid, muted: h.muted, sharing: h.sharing, joined: h.joined }));
const pushHuddle = () => { broadcast({ type: 'huddle', members: huddleState() }); voice.huddleChanged(); };
function sendTo(mid, msg) { const o = online.get(mid); if (o) for (const s of o.sockets) s.send(msg); }

// ---------- chat ----------
const channelOk = c => /^[a-z0-9][a-z0-9-]{0,31}$/.test(c);
let chatHook = null;   // the secretary hears @secretary (server/secretary.js)
function postChat(channel, by, text, extra) {
  if (channel === 'general') channel = P.channelOf(P.current() || P.defaultId());   // project rooms: each project has its own channel
  const msg = { id: id(12), at: new Date().toISOString(), by, text, ...extra };   // extra: media, replyTo, fwd (chatx.js)
  store.appendJSONL(`chat/${channel}.jsonl`, msg);
  if (!dms.deliver(channel, msg)) broadcast({ type: 'chat', channel, message: msg });   // DMs reach only their two members
  if (by !== 'tribecode' && !channel.startsWith('dm-')) pocket.chat(channel, by, text);   // @mentions -> notification hub
  if (chatHook) try { chatHook(channel, by, text, msg); } catch (e) { console.error(e); }
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
const dueOk = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);   // YYYY-MM-DD
const taskFile = t => `tasks/${t.id}.md`;
function loadTasks() {
  return store.listMd('tasks').map(f => { const r = store.readMd(f); return r && { ...r.meta, body: r.body }; }).filter(t => t && t.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.created).localeCompare(String(b.created)));
}
function saveTask(t) {
  const { body = '', ...meta } = t; store.writeMd(taskFile(t), meta, body); broadcast({ type: 'task', task: t });
  bugs.onTask(t);
  if (flow) flow.onTask(t);   // the living plan checks items off (server/flow.js)
  return t;
}
function createTask({ title, by, status = 'backlog', assignee = null, body = '', source, due }) {
  const now = new Date().toISOString();
  const t = { id: `t-${Date.now().toString(36)}-${id(3).toLowerCase()}`, title: str(title, 200) || 'Untitled task', status: STATUSES.includes(status) ? status : 'backlog',
    assignee, by, created: now, updated: now, order: Date.now(), source, body: str(body, 20000), due: dueOk(due), project: P.current() || P.defaultId() };
  return saveTask(t);
}

// ---------- brain, board, docs ----------
let flow = null;   // server/flow.js: one-click project flow, gists, living plan (made below)
const brain = makeBrain({ host: args.ollama || process.env.OLLAMA_HOST || 'http://localhost:11434', model: args.model || process.env.TRIBE_MODEL || '' });
brain.refresh().then(st => console.log(st.online ? `  Brain:    ${st.model} via Ollama` : `  Brain:    off (${st.error})`));
const readVision = () => { try { return fs.readFileSync(store.p('VISION.md'), 'utf8'); } catch { return ''; } };
const projectRepo = () => (P.get(P.current() || P.defaultId()) || {}).repo || null;
const board = makeBoard({ store, id, slug, str, getMembers: () => members, broadcast, postChat, createTask: (o) => createTask(o), repo: projectRepo, brain, readVision });
const docs = makeDocs({ store, slug, str, broadcast, brain, postChat, onWrite: (d, prev) => docsx.onWrite(d, prev) });
const bugs = makeBugs({ store, id, str, broadcast, postChat, brain, createTask: o => createTask(o), getTask: tid => loadTasks().find(t => t.id === tid), saveTask: t => saveTask(t), getMembers: () => members, tellAgent: (...x) => coord.tell(...x) });
const nameOf = mid => (members.find(x => x.id === mid) || {}).name || 'someone';
const claims = makeClaims({ store, id, broadcast, nameOf, project: () => P.current() });
// ---------- web: device links (/m/<key>/) + public https address ----------
// Pages carry the server version they were served with (<meta name="tribe-version">): app/ui/selfheal.js compares it
// with the running server's version, so a page cached before an update (service worker, an old tab) knows it is stale.
const stampHtml = (file, data) => (path.extname(file) === '.html' ? Buffer.from(String(data).replace('<meta name="tribe-version" content="">', `<meta name="tribe-version" content="${VERSION}">`)) : data);
const devices = makeDevices({ store, id, hash, str, getMembers: () => members, publicMember, tribe, stamp: stampHtml });
const share = makeShare({ port: PORT });
const site = require('./site')({ args, root: path.join(__dirname, '..'), log: m => console.log(m) });
// Repo autopilot, change requests, TRIBE_CONTEXT.md and the master integrator (server/repo.js): one hub
// per project, each bound to its project's repo and files (--repo is the first project's repo).
// GitHub sign-in (server/github-auth.js): device flow / gh CLI / token; pushAuth() gives the autopilot the host's login.
const githubAuth = require('./github-auth')({ W, store: baseStore, getMembers: () => members, isLocal, str, log: m => console.log('  ' + m) });
const hubs = new Map();
function hubFor(pid) {
  const p = P.get(pid) || P.get(P.defaultId());
  if (hubs.has(p.id)) return hubs.get(p.id);
  const inP = fn => (...x) => P.inProject(p.id, () => fn(...x));
  const hub = P.inProject(p.id, () => {
    const drift = makeDrift({ repo: p.repo, getTasks: inP(() => loadTasks()), members: () => members });
    const h = require('./repo')({ repo: p.repo, store: P.scopedStore(() => p.id), str, broadcast: m => broadcast({ ...m, project: p.id }), postChat: inP(postChat),
      createTask: inP(o => createTask(o)), loadTasks: inP(() => loadTasks()), saveTask: inP(t => saveTask(t)), getMembers: () => members, nameOf, drift, board,
      presence: () => presence().map(m => (m.project && m.project !== p.id ? { ...m, online: false } : m)), readVision: inP(readVision), tribe, claims,
      onHead: x => flow && flow.onHead(p.id, x), contextExtra: () => (flow ? flow.contextLines(p.id) : []), pushAuth: () => githubAuth.pushAuth() });
    return Object.assign(h, { drift });
  });
  hubs.set(p.id, hub);
  return hub;
}
const resetHub = pid => hubs.delete(pid);   // after the project's repo changes (git init, clone)
for (const p of P.all()) if (p.repo || p.id === P.defaultId()) hubFor(p.id);
const repoHub = {   // MCP tools run against the calling agent's project hub
  tools: h => Object.fromEntries(Object.entries(hubFor(P.defaultId()).mcp.tools(h)).map(([k, t]) => [k, { ...t, run: (a, me) => hubFor(P.current()).mcp.tools(h)[k].run(a, me) }])),
  instructions: me => hubFor(P.current()).mcp.instructions(me) + (mcpFlow ? mcpFlow.instructions : ''),
};
let mcpFlow = null;
// Notification hub + approvals (server/notify.js, server/approvals.js)
const pocket = makeNotify({ store, bus, getMembers: () => members, sendTo, postChat: (...x) => postChat(...x), log: m => console.error('  notify: ' + m),
  publicUrl: () => (args['public-url'] || process.env.TRIBE_PUBLIC_URL || share.publicUrl() || (lanUrls()[0] || {}).url || `http://localhost:${PORT}`).replace(/\/+$/, '') });
const approvals = makeApprovals({ store, id, str, bus, getMembers: () => members, postChat, broadcast, hub: pocket, project: () => P.current(), canSee: (m, pid) => !pid || P.canSee(m, pid) });
const dms = makeDm({ store, getMembers: () => members, sendTo, broadcast, bus });
let askai = null;   // server/askai.js (made below, once coord exists): @ai for people without their own Claude
const chatx = makeChatx({ store, id, str, getMembers: () => members, postChat, dms, sendTo, broadcast, brain, docs, loadTasks: () => loadTasks(), commands: (c, mem, t) => handleCommands(c, mem, t), ask: (c, mem, t) => askai && askai.ask(c, mem, t),
  approvals, board, createTask: o => createTask(o), bus, slug, project: () => P.current() || P.defaultId(), channelOf: () => P.channelOf(P.current() || P.defaultId()), inProject: (pid, fn) => P.inProject(pid, fn),
  channelProject: ch => (P.byChannel(ch) || {}).id || null, canSeeProject: (mem, pid) => P.canSee(mem, pid),
  voters: () => members.filter(x => x.role !== 'agent' && x.role !== 'spectator' && P.canSee(x, P.current() || P.defaultId())) });   // votes: the project's humans
const voice = makeVoice({ store, id, str, huddle, sendTo, broadcast, postChat, createTask: o => createTask(o), getMembers: () => members, nameOf, brain, docs, bus });
const plan = makePlan({ store, id, str, broadcast, postChat, getMembers: () => members, loadTasks: () => loadTasks(), nameOf });
const docsx = makeDocsX({ store, id, str, slug, broadcast, docs, getMembers: () => members, nameOf });
const visuals = makeVisuals({ store, slug, str, broadcast, nameOf });
const thumb = require('./thumb')({ P, visuals });
const preview = makePreview({ P, store: baseStore, getMembers: () => members, broadcast, share, lanUrls, port: PORT, log: m => console.error('  ' + m) });   // app preview (server/preview.js)   // the pinned repo's thumbnail: README image → screenshot → tile
// Home Screen app links (server/applink.js) and Desktop folders: export, live copy, shortcut (server/export.js).
const applink = require('./applink')({ P, store: baseStore, getMembers: () => members, preview, shareBase: () => share.publicUrl() || (lanUrls().find(u => u.kind === 'lan') || lanUrls()[0] || {}).url || null, log: m => console.error('  ' + m) });
const exporter = require('./export')({ P, W, store: baseStore, applink, isLocal, port: PORT, getMembers: () => members, log: m => console.log('  ' + m) });
const busLog = makeBusLog({ broadcast, sendTo });
const DEBUG = !!(args.dev || process.env.TRIBE_TEST === '1');
const rooms = makeRooms({ P, W, store, brain, getMembers: () => members, saveMembers, isLocal, presenceFor, loadTasks: () => loadTasks(), hubFor, resetHub, plan, approvals, docs,
  broadcast, postChat, nameOf, str });
const coord = makeCoord({ P, store, id, str, broadcast, postChat, bus, getMembers: () => members, presenceFor, loadTasks: () => loadTasks(), saveTask: t => saveTask(t), claims, hubFor, approvals, brain, nameOf });
const agentnet = makeAgentNet({ P, store, id, str, broadcast, bus, getMembers: () => members, presenceFor, loadTasks: () => loadTasks(), saveTask: t => saveTask(t), createTask: o => createTask(o), approvals, coord, nameOf });
askai = require('./askai')({ store: baseStore, id, str, P, getMembers: () => members, presenceFor, postChat, coord, approvals, brain, askBrain: (c, mem, t) => chatx.askBrain(c, mem, t), createTask: o => createTask(o), bus, nameOf });
const compute = require('./compute')({ store: baseStore, str, getMembers: () => members, isOnline: mid => online.has(mid), broadcast });   // shared compute (Helpers list)
const openspace = require('./openspace')({ P, broadcast, isLocal, log: m => console.log('  ' + m) });   // Open Space office (optional, host-only)
const shelf = require('./shelf')({ P, root: path.join(__dirname, '..'), docs, postChat, str, nameOf });   // starter shelf: tools, libraries, Claude skills
// feat/viewers: asset viewers (server/files.js) + phone app mode (server/phoneapp.js)
const assetFiles = require('./files')({ P });
const phoneapp = require('./phoneapp')({ P, store: baseStore, shelf, broadcast, isLocal, lanUrls, nameOf, log: m => console.log('  ' + m) });
const people = makePeople({ P, store, getMembers: () => members, presenceFor, claims, coord, docs, loadTasks: () => loadTasks(), nameOf, emailOf: W.emailOf });
require('./mcp-people').bind(people);   // share_prompt, report_context + the agent prompt log
// The Workshop (server/workshop.js): a tribe-wide library apart from projects, plus the community shelf.
const workshop = makeWorkshop({ store: baseStore, P, approvals, getMembers: () => members, nameOf, postChat, broadcast, slug, id, hasToken: W.hasToken, readSecret: W.readSecret });
// Solo mode: the Secretary (background notes, digest, inspiration, research) and the agents hub.
const secretary = makeSecretary({ P, store: baseStore, pstore: store, brain, docs, loadTasks: () => loadTasks(), hubFor, getMembers: () => members, nameOf, postChat, createTask: o => createTask(o),
  votes: chatx.votes, broadcast, str, id, log: m => console.error('  ' + m) });
require('./mcp-secretary').bind(secretary);
chatHook = (...x) => secretary.onChat(...x);
const agentsHub = makeAgentsHub({ P, store: baseStore, brain, getMembers: () => members, presenceFor, agentSeen, idleMs: AGENT_IDLE, nameOf, people, coord, claims, endpoints: (req, t) => agentEndpoints(req, t), secretary });
// The Global Hub (server/hub.js): what you see with no project selected. Member-scoped, rolling.
dashboard = makeHub({ P, base: baseStore, getMembers: () => members, presenceFor, loadTasks: () => loadTasks(), docs, approvals, flow: null, secretary, workshop, pocket, sendTo,
  isOnline: mid => online.has(mid), nameOf, str, slug, brain, coord, people, hubFor, preview, agentSeen, idleMs: AGENT_IDLE });
// The global scratchpad (server/scratch.js): private quick notes per member, filed into a project later.
const scratch = makeScratch({ P, base: baseStore, docs, createTask: o => createTask(o), id, str, brain });
dashboard.useScratch(mid => scratch.load(mid));   // Home's Ask and Refine with AI read your own notes
// Insights for the Home panel (server/insights.js): explorer findings, host health checks, the Secretary's ideas.
const insights = require('./insights')({ P, base: baseStore, brain, getMembers: () => members, hasToken: W.hasToken, secretary, version: VERSION, appRoot: path.join(__dirname, '..'), repoOf: p => p.repo || null });
bus.on('notify', n => dashboard.onNotify(n));
// Agents read pause/stop requests, hand-offs and sync asks from coord through check_messages too.
const checkMessages = chatx.mcpTools.check_messages;
const agentTools = { ...chatx.mcpTools, check_messages: { ...checkMessages, run: (a, me) => {
  const r = checkMessages.run(a, me), extra = coord.inboxFor(me);
  if (!extra.length) return r;
  const prev = r.content[0].text;
  return { content: [{ type: 'text', text: `From TribeCode coordination:\n${extra.join('\n')}${prev && prev !== 'No new messages.' ? '\n\n' + prev : ''}` }] };
} } };
// One-click project flow (server/flow.js): invites and links reuse the quick-invite logic.
function makeInvite({ by, project, hours = 72, maxUses = 10 }) {
  const inv = { code: code(5), by, role: 'builder', maxUses, uses: 0, created: new Date().toISOString(), expires: new Date(Date.now() + hours * 3600_000).toISOString(), ...(project ? { project } : {}) };
  invites.push(inv); saveInvites(); return inv;
}
function linkFor(c) {
  const pub = share.publicUrl(), lan = lanUrls().find(u => u.kind === 'lan') || lanUrls()[0];
  const base = (pub || (lan || {}).url || `http://localhost:${PORT}`).replace(/\/+$/, '');
  return { link: site.joinLink(base, c), kind: pub ? 'public' : lan ? (lan.kind === 'tailscale' ? 'tailscale' : 'wifi') : 'local' };
}
flow = makeFlow({ P, W, base: baseStore, id, str, slug, broadcast, postChat, bus, getMembers: () => members, nameOf, docs, brain, coord, createTask: o => createTask(o), loadTasks: () => loadTasks(), saveTask: t => saveTask(t),
  rooms, hubFor, resetHub, share, makeInvite, linkFor, isLocal });
W.onCommit = x => flow.onCommit(x);   // commits through "Commit my changes" become gists
dashboard.setFlow(flow);
const showcase = require('./showcase')({ P, base: baseStore, W, getMembers: () => members, nameOf, visuals, hubFor, preview, flow: () => flow, broadcast, postChat, bus, str });   // per-project Website (server/showcase.js)
mcpFlow = makeMcpFlow({ flow, P });
// MCP calls run in the agent's project, or in `project` when the tool call names one it can see.
function agentProject(me) { return P.pick(me, null, me.project || (online.get(me.owner) || {}).project); }
function mcpScope(me, wanted, fn) {
  const pid = wanted ? P.pick(me, String(wanted)) : agentProject(me);
  if (!pid) throw new Error(wanted ? `No project "${wanted}" (list_projects shows yours)` : 'You are not in any project');
  return P.inProject(pid, fn);
}
const mcp = makeMcp({
  extra: repoHub, scope: mcpScope,
  projects: me => P.visibleTo(me).map(p => ({ id: p.id, name: p.name, repo: !!p.repo, yours: p.id === agentProject(me) })),
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
  docs, claims, extraTools: { ...agentTools, ...visuals.mcpTools, ...mcpFlow.tools, ...makeWorkshopMcp(workshop, { current: () => P.current() }), ...require('./mcp-preview')(preview, P) }, coordTools: h => ({ ...coord.mcpTools(h), ...agentnet.mcpTools(h) }),
  chat: {
    post(me, text) { const tx = str(text, 4000); if (!tx) return; if (chatx.command('general', me, tx)) return; postChat('general', me.id, tx); handleCommands('general', me, tx); },
    approvalAsked: (ap, me) => chatx.approvalAsked(ap, me),   // the agent's request also lands in its owner's chat (✅ approves)
    recent: n => store.readJSONL('chat/general.jsonl', n).filter(x => !x.deleted).map(x => {
      const media = x.media ? (x.media.kind === 'voice' ? '[voice note] ' : x.media.kind === 'image' ? '[image] ' : x.media.kind === 'file' ? `[file: ${x.media.name || 'file'}] ` : '') : '';
      const vote = x.vote ? `[vote] ${x.vote.q || ''} ` : '';
      return `${x.at.slice(11, 16)} ${x.by === 'tribecode' ? 'TribeCode' : nameOf(x.by)}: ${media}${vote}${x.text || ''}`.trimEnd();
    }).join('\n'),
  },
  board, approvals,
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
// Every API request runs in one project: X-Project header (or ?project=), else where the person last was.
async function api(req, res, url) {
  const who = authed(req);
  const wanted = String(req.headers['x-project'] || url.searchParams.get('project') || '').trim();
  let pid = P.defaultId();
  if (who) {
    pid = P.pick(who, wanted || null, (online.get(who.id) || {}).project || who.project);
    if (!pid && /^\/api\/(hub|scratch|projects|me|github)(\/|$)/.test(url.pathname)) pid = P.defaultId();   // these need no project of yours (the list can be empty: every project you were in was deleted)
    if (!pid) return fail(res, wanted ? 403 : 404, wanted ? 'you are not in that project' : 'you are not in any project yet');
  }
  return P.inProject(pid, () => apiInProject(req, res, url));
}
async function apiInProject(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after /api
  const [a, , c] = parts; let b = parts[1]; const m = req.method;
  const ctx = () => ({ m, a, b, c, parts, me, url, readBody, send, fail });
  const me = authed(req);
  const need = () => { if (!me) { fail(res, 401, 'not a member of this tribe'); return false; } return true; };

  if (a === 'health') return send(res, 200, { ok: true, version: VERSION, tribe: tribe.name, members: members.length, startedAt: new Date(makePeople.STARTED).toISOString(), uptime: Math.round((Date.now() - makePeople.STARTED) / 1000), lan: [...share.lanEntry(), ...lanUrls()], site: site.url(),
    ...(isLocal(req) ? { user: (() => { try { return os.userInfo().username; } catch { return undefined; } })() } : {}) });   // the OS user name, only for this machine (zero-step setup)

  // One-click "invite a friend" for the host machine (scripts/invite-friend.js): makes the host if needed,
  // optionally turns on the public https address, and returns a fresh join link.
  if (a === 'host' && b === 'quick-invite' && m === 'POST') {
    if (!isLocal(req)) return fail(res, 403, 'only from the host machine');
    const body = await readBody(req);
    let host = members.find(x => x.role === 'host'), hostOpen = null;
    if (!host) {
      host = newMember({ name: str(body.name, 32) || 'Host', role: 'host' }).member;
      postChat('general', 'tribecode', `${host.name} started the tribe 🔥`);
      hostOpen = `http://localhost:${PORT}/m/${devices.create(host, req, 'This computer').key}/`;
    }
    let shared = null;
    if (body.share) { try { shared = await share.start(['tailscale', 'cloudflare'].includes(body.provider) ? body.provider : ''); } catch (e) { shared = { status: 'error', message: e.message }; } }
    // Optional: start (or reuse) a project from a folder on this machine, scope the invite to it, and give
    // the host's Claude Code a key for it (scripts/start-test-project.js).
    let project = null, agentCommand = null;
    if (body.project && body.project.path) {
      try {
        const r = await rooms.create(req, { path: body.project.path, name: body.project.name, emoji: body.project.emoji, init: true }, host);
        project = r.project; rooms.pushProjects();
        // Starter tasks (only for a brand-new project).
        if (!r.existed && Array.isArray(body.project.tasks)) P.inProject(project.id, () => body.project.tasks.slice(0, 20).forEach(t => createTask({ title: t, by: host.id, source: 'starter' })));
      } catch (e) { return fail(res, e.status || 400, e.message); }
      if (body.agent) {
        const token = id(32); let ag = members.find(x => x.role === 'agent' && x.owner === host.id && !x.label);
        if (ag) { ag.tokenHash = hash(token); ag.project = project.id; }
        else { ag = { id: 'agent-' + slug(host.name).slice(0, 10) + '-' + id(4), name: `Claude · ${host.name}`.slice(0, 32), color: '#38C6B1', role: 'agent', owner: host.id, joined: new Date().toISOString(), tokenHash: hash(token), project: project.id }; members.push(ag); pushPresence(); }
        saveMembers();
        agentCommand = `claude mcp add --transport http tribecode http://localhost:${PORT}/mcp --header "Authorization: Bearer ${token}"`;
      }
    }
    const inv = { code: code(8), by: host.id, role: 'builder', maxUses: 3, uses: 0, created: new Date().toISOString(), expires: new Date(Date.now() + 48 * 3600_000).toISOString(), ...(project ? { project: project.id } : {}) };
    invites.push(inv); saveInvites();
    const base = (share.publicUrl() || (lanUrls().find(u => u.kind === 'lan') || lanUrls()[0] || {}).url || `http://localhost:${PORT}`).replace(/\/+$/, '');
    return send(res, 200, { join: site.joinLink(base, inv.code), project: project && { id: project.id, name: project.name, repo: project.repo }, agentCommand, public: !!share.publicUrl(), provider: shared && shared.provider, approveUrl: shared && shared.approveUrl || null,
      tailscale: !!(shared && shared.available && shared.available.tailscale), shareMessage: shared && shared.status !== 'on' ? (shared.message || '') : '',
      hostOpen, host: host.name, tribe: tribe.name, expires: inv.expires });
  }

  if (a === 'host' && b === 'demo-tribe') return require('./demo')({ P, rooms, flow, shelf, docs, docsx, chatx, hubFor, resetHub, getMembers: () => members, newMember, saveMembers, pushPresence, devices, share, site, lanUrls, makeInvite, linkFor, isLocal, endpoints: agentEndpoints, id, hash, slug, postChat, str, port: PORT }).route(req, res, ctx());   // the demo tribe, local only (server/demo.js)

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

  // The desktop app on the host's own computer lost its sign-in (a reinstall, cleared app data) but the tribe is still
  // here: give the host's account a fresh key instead of telling them to join their own tribe. Only from this machine,
  // and only from the desktop app itself or a page this server serves (never another site running on localhost).
  if (a === 'host' && b === 'reclaim' && m === 'POST') {
    const o = req.headers.origin, own = o === undefined || /^(tauri:\/\/localhost|https?:\/\/tauri\.localhost)$/i.test(o) || new RegExp(`^http://(localhost|127\\.0\\.0\\.1|\\[::1\\]):${PORT}$`, 'i').test(o);
    if (!isLocal(req) || !own) return fail(res, 403, 'only the TribeCode app on the host computer can do this');
    if (limited(req, 5)) return fail(res, 429, 'slow down');
    const h = members.find(x => x.role === 'host');
    if (!h) return fail(res, 404, 'no host yet');
    const token = id(32); h.tokenHash = hash(token); saveMembers();
    console.log(`  Host ${h.name} signed back in from this computer`);
    return send(res, 200, { member: publicMember(h), token, tribe });
  }

  if (a === 'invites' && b && m === 'GET') {
    if (limited(req)) return fail(res, 429, 'slow down');
    const inv = invites.find(i => i.code === b);
    if (!inv || inv.revoked) return fail(res, 404, 'invite not found');
    if (Date.parse(inv.expires) < Date.now() || inv.uses >= inv.maxUses) return fail(res, 410, 'invite expired');
    const by = members.find(x => x.id === inv.by), proj = inv.project && P.get(inv.project);
    return send(res, 200, { tribe: tribe.name, invitedBy: by ? by.name : 'someone', role: inv.role, expires: inv.expires,
      project: proj ? { name: proj.name, emoji: proj.emoji } : null,
      members: (proj ? members.filter(x => proj.members[x.id]) : members).slice(0, 6).map(x => ({ name: x.name, color: x.color })) });
  }

  if (a === 'join' && m === 'POST') {
    if (limited(req, 10)) return fail(res, 429, 'slow down');
    const body = await readBody(req);
    const inv = invites.find(i => i.code === str(body.code, 16));
    if (!inv || inv.revoked || Date.parse(inv.expires) < Date.now() || inv.uses >= inv.maxUses) return fail(res, 410, 'invite expired or invalid');
    const proj = inv.project && P.get(inv.project);
    // Already a member (signed in on this device): a project invite adds that project instead of making a second account.
    const already = authed(req);
    if (already && already.role !== 'agent') {
      if (proj && Array.isArray(already.projects) && !already.projects.includes(proj.id)) { already.projects.push(proj.id); inv.uses++; saveInvites(); }
      if (proj) P.addMember(proj.id, already.id, P.scoped(already) ? inv.role : already.role);
      saveMembers(); pushPresence(); rooms.pushProjects();
      return send(res, 200, { member: publicMember(already), tribe, project: proj ? proj.id : null, existing: true });
    }
    const name = str(body.name, 32); if (!name) return fail(res, 400, 'name required');
    inv.uses++; saveInvites();
    const out = newMember({ name, color: body.color, role: inv.role, projects: proj ? [proj.id] : undefined });
    if (inv.guest) { out.member.guestUntil = new Date(Date.now() + (inv.guestHours || 24) * 3600_000).toISOString(); saveMembers(); }
    if (proj) P.addMember(proj.id, out.member.id, inv.role);
    P.inProject(proj ? proj.id : P.defaultId(), () => postChat('general', 'tribecode', `${name} joined ${proj ? proj.name : 'the tribe'} 👋`));
    pushPresence(); if (proj) rooms.pushProjects();   // everyone's project list shows the new member (Shared compute, overview team)
    return send(res, 200, { member: publicMember(out.member), token: out.token, tribe, project: proj ? proj.id : null });
  }

  if (a === 'device-link' || a === 'devices' || a === 'share') {
    const h = await (a === 'share' ? share : devices).route(req, res, { a, b, m, me, tokenHash: tokenHashOf(req), readBody, send, fail, limited });
    if (h !== null) return;
  }

  if (a === 'agents' && b === 'bridge.js') { const h = await agentsHub.route(req, res, ctx()); if (h !== null) return; }   // the stdio bridge (plain code, no secrets)
  if (a === 'approvals') { const h = await approvals.route(req, res, { m, b, c, me, url, readBody, send, fail }); if (h !== null) return; }
  if (a === 'projects' && c === 'website') { const h = await showcase.route(req, res, ctx()); if (h !== null) return; }   // Website (signed preview links need no key)
  if (!need()) return;
  if (a === 'notify') { const h = await pocket.route(req, res, { m, b, c, me, readBody, send, fail }); if (h !== null) return; }

  // One-click backup of the whole tribe folder (server/backup.js): host only; secrets stay on the host.
  if (a === 'backup' && m === 'GET') {
    if (me.role !== 'host') return fail(res, 403, 'only the host can download a backup');
    const day = new Date().toISOString().slice(0, 10), name = `${slug(tribe.name)}-backup-${day}.tar.gz`;
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    return require('./backup').stream(baseStore.root, res, slug(tribe.name) || 'tribe').then(() => baseStore.writeJSON('.tribe/backup.json', { last: new Date().toISOString() }))   // insights: "no backup in N days"
      .catch(e => { console.error('backup:', e); res.destroy(); });
  }

  // Rename / recolor yourself: friends see it at once (Settings used to change it on this device only).
  if (a === 'me' && !b && m === 'PATCH') {
    if (me.role === 'agent') return fail(res, 403, 'agents keep their names');
    const body = await readBody(req), mem = memberById(me.id);
    const name = body.name !== undefined ? str(body.name, 32) : mem.name; if (!name) return fail(res, 400, 'name required');
    mem.name = name; if (body.color !== undefined) mem.color = color(body.color);
    saveMembers(); pushPresence();
    return send(res, 200, { member: publicMember(mem) });
  }
  if (a === 'me' && !b) return send(res, 200, { member: publicMember(me), tribe, version: VERSION, project: P.current(), projects: P.visibleTo(me).map(p => P.view(p)) });

  if (a === 'members' && m === 'GET') return send(res, 200, { members: presenceFor(me).filter(x => !x.guestUntil || Date.parse(x.guestUntil) > Date.now()) });
  // Friends: each person's own list of people in this tribe (kept on the server, so it follows you to every device).
  if (a === 'friends' && !b) {
    const all = store.readJSON('.tribe/friends.json', {}) || {};
    if (m === 'GET') return send(res, 200, { friends: (all[me.id] || []).filter(fid => memberById(fid)) });
    if (m === 'PUT' && me.role !== 'agent') {
      const body = await readBody(req); const fid = str(body.id, 64), who = memberById(fid);
      if (!who || who.id === me.id || who.role === 'agent' || !presenceFor(me).some(x => x.id === fid)) return fail(res, 400, 'not someone you can see');
      const list = new Set(all[me.id] || []); body.on === false ? list.delete(fid) : list.add(fid);
      all[me.id] = [...list].slice(0, 500); store.writeJSON('.tribe/friends.json', all);
      return send(res, 200, { friends: all[me.id] });
    }
    return fail(res, 405, 'GET or PUT');
  }
  if (a === 'ask') return askai.route(req, res, ctx());
  if (a === 'compute' && !b) return compute.route(req, res, ctx());
  if (a === 'shelf') return shelf.route(req, res, ctx());
  if (a === 'files') return assetFiles.route(req, res, ctx());   // feat/viewers: repo assets for the 3D / pixel-art viewers
  if (a === 'phoneapp') return phoneapp.route(req, res, ctx());   // feat/viewers: phone app mode
  if (a === 'openspace') return openspace.route(req, res, ctx());
  if (a === 'flow' || a === 'gists' || (a === 'projects' && c === 'roles')) { const h = await flow.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'projects' || (a === 'me' && b === 'git')) { const h = await rooms.route(req, res, { m, a, b, c, parts, me, readBody, send, fail }); if (h !== null) return; }

  if (a === 'invites' && !b && m === 'POST') {
    if (me.role === 'agent') return fail(res, 403, 'agents cannot invite people');
    if (me.role === 'spectator') return fail(res, 403, 'spectators cannot invite people');
    const body = await readBody(req);
    const hours = Math.min(Math.max(Number(body.hours) || 24, 1), 24 * 30);
    // Invite to one project (they only see that project) or to the whole tribe. Project-scoped people can only invite to their projects.
    let project = body.project === undefined ? (P.scoped(me) ? P.current() : null) : body.project;   // API default: whole tribe
    if (project === 'tribe' || project === null) project = null;
    if (project && !P.canSee(me, project)) return fail(res, 403, 'you are not in that project');
    if (!project && P.scoped(me)) return fail(res, 403, 'you can invite people to your project only');
    // A one-time guest pass: one use, and the account it makes stops working after `hours` (default a day).
    const guest = !!body.guest;
    const inv = { code: code(8), by: me.id, role: body.role === 'spectator' ? 'spectator' : 'builder', maxUses: guest ? 1 : Math.min(Math.max(Number(body.maxUses) || 5, 1), 100),
      uses: 0, created: new Date().toISOString(), expires: new Date(Date.now() + hours * 3600_000).toISOString(), ...(project ? { project } : {}), ...(guest ? { guest: true, guestHours: hours } : {}) };
    invites.push(inv); saveInvites();
    return send(res, 200, { invite: inv });
  }
  if (a === 'invites' && !b && m === 'GET') {   // project-scoped people only see invites to their own projects
    const visible = i => me.role === 'host' || (P.scoped(me) ? !!i.project && P.canSee(me, i.project) : true);
    return send(res, 200, { invites: me.role === 'spectator' ? [] : invites.filter(i => !i.revoked && Date.parse(i.expires) > Date.now() && visible(i)) });
  }
  if (a === 'invites' && b && m === 'DELETE') {
    const inv = invites.find(i => i.code === b);
    if (inv && inv.by !== me.id && me.role !== 'host') return fail(res, 403, 'only the host or whoever made the invite can revoke it');
    if (inv) { inv.revoked = true; saveInvites(); } return send(res, 200, { ok: true });
  }

  if (a === 'dms') return dms.route(req, res, { m, me, send, fail });
  if (a === 'chat' && b) {
    if (b === 'general') b = P.channelOf(P.current());   // #general is the current project's channel
    const chProject = P.byChannel(b); if (chProject && !P.canSee(me, chProject.id)) return fail(res, 403, 'you are not in that project');
    // Only real conversations: a project's channel, a DM, or a project's #agents channel you can see.
    // (Before, any name worked, so a project-only friend could read another project's chat/agents-<id>.jsonl.)
    const agentsOf = /^agents-(.+)$/.exec(b);
    if (!chProject && !dms.isDm(b) && !(agentsOf && P.get(agentsOf[1]) && P.canSee(me, agentsOf[1]))) return fail(res, 404, 'no such conversation');
    if (!dms.canRead(b, me)) return fail(res, 403, 'this conversation is private');
    if (c) return chatx.route(req, res, { m, ch: b, action: c, arg: parts[3], sub: parts[4], me, readBody, send, fail, url });   // voice, image, send, react, pin, forward, vote…
    if (m === 'GET') {   // ?before=<message id> pages back through history
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500), before = str(url.searchParams.get('before') || '', 40);
      return send(res, 200, { messages: store.pageJSONL(`chat/${b}.jsonl`, limit, before ? `"id":${JSON.stringify(before)}` : null) });
    }
    if (m === 'POST') {
      if (me.role === 'spectator') return fail(res, 403, 'spectators can read but not post');
      const body = await readBody(req); const text = str(body.text, 4000); if (!text) return fail(res, 400, 'empty message');
      const voted = chatx.command(b, me, text); if (voted) return send(res, 200, { message: voted });   // /vote posts a vote card
      const msg = postChat(b, me.id, text); chatx.onPost(b, me, text, msg);   // commands, notifications, @brain, vote hints
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
      const prevAssignee = t.assignee;
      if (body.assignee !== undefined) t.assignee = body.assignee && members.some(x => x.id === body.assignee) ? body.assignee : null;
      if (t.assignee && t.assignee !== prevAssignee && t.assignee !== me.id) bus.notify({ type: 'task-assigned', to: [t.assignee], from: me.id, title: `${me.name} assigned you a task`, body: t.title, view: 'tasks', ref: t.id });
      if (body.order !== undefined && Number.isFinite(Number(body.order))) t.order = Number(body.order);
      if (body.body !== undefined) t.body = str(body.body, 20000);
      if (body.due !== undefined) t.due = dueOk(body.due);
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
    const handled = await bugs.route(req, res, { m, b, c, parts, me, readBody, send, fail });
    if (handled !== null) return;
  }
  if ((a === 'agents' && b === 'channel') || (a === 'coord' && ['delegations', 'recommendations'].includes(b))) { const h = await agentnet.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'agents' && b === 'hub') { const h = await agentsHub.route(req, res, ctx()); if (h !== null) return; }   // solo mode: "Your agents" (server/agentshub.js)
  if (a === 'agents' && m === 'POST' && !b) {
    if (me.role === 'spectator' || me.role === 'agent') return fail(res, 403, 'only members can connect agents');
    // Default (no kind/label): the person's one Claude Code agent, as before. With { kind, label }: one more
    // named agent per label (Claude Code · laptop, Claude Desktop, Codex…), each with its own revocable key.
    const body = await readBody(req).catch(() => ({}));
    const kind = makeAgentsHub.KINDS[body.kind] ? body.kind : null, label = str(body.label, 24);
    const multi = !!(label || (kind && kind !== 'claude-code'));
    const kindName = kind ? makeAgentsHub.KINDS[kind].label : 'Claude Code';
    const name = (multi ? `${label || kindName} · ${me.name}` : `Claude · ${me.name}`).slice(0, 32);
    const mineAll = members.filter(x => x.role === 'agent' && x.owner === me.id);
    if (multi && mineAll.filter(x => x.tokenHash).length >= 8) return fail(res, 429, 'up to 8 connected agents per person: revoke one first');
    let ag = multi ? mineAll.find(x => x.label && x.label.toLowerCase() === (label || kindName).toLowerCase()) : mineAll.find(x => !x.label);
    const token = id(32);
    if (ag) { ag.tokenHash = hash(token); ag.project = P.current(); if (kind) ag.kind = kind; }
    else { ag = { id: 'agent-' + slug(me.name).slice(0, 10) + '-' + id(4), name, color: '#38C6B1', role: 'agent', owner: me.id, joined: new Date().toISOString(), tokenHash: hash(token), project: P.current(), ...(multi ? { label: label || kindName, kind: kind || 'claude-code' } : {}) }; members.push(ag); pushPresence(); }
    if (Array.isArray(me.projects)) ag.projects = [...me.projects]; else delete ag.projects;   // the agent sees what its owner sees
    saveMembers();
    const ep = agentEndpoints(req, token);
    const desktop = kind === 'claude-desktop' || kind === 'mcp' ? agentsHub.desktopConfig(ep.url, token) : undefined;
    return send(res, 200, { agent: { ...publicMember(ag), kind: agentsHub.kindOf(ag), label: ag.label || null }, token, ...ep, tools: mcp.tools, ...(desktop ? { desktop } : {}) });
  }
  // Easy in and out for Claude Code anywhere: status, and disconnect (the key stops working at once).
  if (a === 'agents' && b === 'mine' && m === 'GET') {
    const ag = members.find(x => x.role === 'agent' && x.owner === me.id && x.tokenHash);
    const seen = ag && agentSeen.get(ag.id);
    const live = x => { const s = agentSeen.get(x.id); return !!s && Date.now() - s.at < AGENT_IDLE; };
    return send(res, 200, { agent: ag ? publicMember(ag) : null, online: !!seen && Date.now() - seen.at < AGENT_IDLE, since: seen ? new Date(seen.at).toISOString() : null, ...agentEndpoints(req, null),
      agents: members.filter(x => x.role === 'agent' && x.owner === me.id && x.tokenHash).map(x => ({ ...publicMember(x), kind: agentsHub.kindOf(x), label: x.label || null, online: live(x) })) });
  }
  if (a === 'agents' && b === 'mine' && m === 'DELETE') {   // ?id= revokes one key; without it, the default agent (as before)
    const want = url.searchParams.get('id');
    const ag = want ? members.find(x => x.role === 'agent' && x.owner === me.id && x.id === want) : (members.find(x => x.role === 'agent' && x.owner === me.id && !x.label) || members.find(x => x.role === 'agent' && x.owner === me.id));
    if (want && !ag) return fail(res, 404, 'not one of your agents');
    if (ag) { ag.tokenHash = null; agentSeen.delete(ag.id); saveMembers(); pushPresence(); }
    return send(res, 200, { ok: true, remove: ag && ag.kind === 'claude-desktop' ? 'Remove "tribecode" from claude_desktop_config.json' : 'claude mcp remove tribecode' });
  }
  if (a === 'claims') {
    if (m === 'GET') return send(res, 200, { claims: claims.list() });
    if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
    if (m === 'POST') { const body = await readBody(req); const r = claims.claim(body.path, body.note, me); return r.conflict ? send(res, 409, { error: `claimed by ${r.conflict.name}`, claim: r.conflict }) : send(res, 200, r); }
    if (m === 'DELETE' && b) return claims.releaseId(b, me) ? send(res, 200, { ok: true }) : fail(res, 404, 'not your claim');
    if (m === 'PATCH' && b) { const body = await readBody(req); if (!members.some(x => x.id === body.to)) return fail(res, 400, 'unknown member'); const c = claims.handOff(b, body.to, me); return c ? send(res, 200, { claim: c }) : fail(res, 404, 'not your claim'); }
  }
  if (a === 'drift' && m === 'GET') { const r = await hubFor(P.current()).drift.radar(); if (r.branches) r.branches = r.branches.map(({ allFiles, ...x }) => x); return send(res, 200, r); }
  if (a === 'coord') { const h = await coord.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'people') { const h = await people.route(req, res, ctx()); if (h !== null) return; }   // person view (server/people.js)
  if (a === 'secretary') { const h = await secretary.route(req, res, ctx()); if (h !== null) return; }   // the Secretary (server/secretary.js)
  if (a === 'hub' || a === 'dashboard') { const h = await dashboard.route(req, res, ctx()); if (h !== null) return; }   // the Global Hub (server/hub.js)
  if (a === 'scratch') { const h = await scratch.route(req, res, ctx()); if (h !== null) return; }   // private scratchpad (server/scratch.js)
  if (a === 'insights') { const h = await insights.route(req, res, ctx()); if (h !== null) return; }   // AI Insights feed (server/insights.js)
  if (['repo', 'changes', 'context', 'integrations'].includes(a)) {
    const handled = await hubFor(P.current()).route(req, res, { m, a, b, c, me, readBody, send, fail });
    if (handled !== null) return;
  }
  if (a === 'calendar') { const h = await plan.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'workshop') { const h = await workshop.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'visuals') { const h = await visuals.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'preview') { const h = await preview.route(req, res, ctx()); if (h !== null) return; }   // app preview links + settings
  if (a === 'applink' || a === 'export' || a === 'shortcut' || a === 'github') { const h = await (a === 'applink' ? applink : a === 'github' ? githubAuth : exporter).route(req, res, ctx()); if (h !== null) return; }   // Home Screen app links, Desktop folders, GitHub sign-in
  if (a === 'thumb') { const h = await thumb.route(req, res, { m, b, me, url, send, fail }); if (h !== null) return; }   // pinned repo thumbnail (server/thumb.js)
  if (a === 'templates' && m === 'GET') return send(res, 200, { templates: docsx.templates() });
  if (a === 'debug' && b === 'bus-log' && m === 'GET' && DEBUG) return send(res, 200, { events: busLog.log(url.searchParams.get('type')) });
  if (a === 'debug' && b === 'reminders' && m === 'POST' && DEBUG) { plan.tick(); return send(res, 200, { ok: true }); }
  if (a === 'docs' && c) { const h = await docsx.route(req, res, ctx()); if (h !== null) return; }
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
  if (applink.serve(req, res, url)) return;   // /app/<key>/: a project's app for the Home Screen (server/applink.js)
  if (devices.serveApp(req, res, url, UI)) return;
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { return fail(res, 400, 'bad path'); }
  if (rel === '/' ) rel = '/index.html';
  if (/^\/join\/[A-Za-z0-9]+\/?$/.test(rel)) rel = '/join.html';
  const file = path.resolve(UI, '.' + rel);
  if (!file.startsWith(UI + path.sep)) return fail(res, 403, 'forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return fail(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(stampHtml(file, data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // Preflight. Chromium (WebView2 in the desktop app) asks before a page that isn't on localhost (tauri.localhost) may send
  // JSON to a loopback server (Private Network Access); without this header the app's sign-in POSTs were refused.
  if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' });
  try {
    if (url.pathname === '/mcp') return await mcp.route(req, res, { me: authed(req), readBody, send });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (preview.match(req, url)) return preview.serve(req, res, url);   // /preview/<project>/<pt>/… (server/preview.js)
    if (req.method === 'GET') return serveStatic(req, res, url);
    fail(res, 405, 'method not allowed');
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'server error');
    if (!e.status) console.error(e);
  }
});

server.on('upgrade', (req, sock) => {
  const url = new URL(req.url, 'http://x');
  if (preview.upgrade(req, sock, url)) return;   // dev-server HMR sockets under /preview/
  if (url.pathname !== '/ws') return sock.destroy();
  const me = authed(req);
  if (!me) { sock.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return sock.destroy(); }
  const s = ws.accept(req, sock); if (!s) return;
  const o = online.get(me.id) || { sockets: new Set(), where: 'Home', since: new Date().toISOString() };
  // Which project room this socket is in (?project=…, else where this person last was).
  s.project = P.pick(me, url.searchParams.get('project') || null, o.project || me.project) || P.pick(me, null);
  if (s.project && me.role !== 'agent') P.addMember(s.project, me.id, P.scoped(me) ? (P.get(s.project).members[me.id] || me.role) : me.role);
  o.project = s.project;
  o.sockets.add(s); online.set(me.id, o);
  dashboard.seen(me.id, s.project);
  pocket.attach(me, s);   // idle/away tracking for notifications
  s.send({ type: 'hello', member: publicMember(me), tribe, members: presenceFor(me), version: VERSION, huddle: huddleState(), project: s.project, projects: rooms.listFor(me) });
  pushPresence();
  s.on('message', msg => P.inProject(s.project || P.defaultId(), () => onMessage(msg)));
  function onMessage(msg) {
    if (msg.type === 'project' && typeof msg.id === 'string') {
      if (!P.canSee(me, msg.id)) return s.send({ type: 'project-error', id: msg.id, error: 'you are not in that project' });
      dashboard.seen(me.id, s.project); dashboard.seen(me.id, msg.id);   // leaving one project, entering another
      s.project = o.project = msg.id;
      if (me.role !== 'agent') { P.addMember(msg.id, me.id, (P.get(msg.id).members[me.id]) || me.role); const mem = memberById(me.id); if (mem && mem.project !== msg.id) { mem.project = msg.id; saveMembers(); } }
      s.send({ type: 'project-switched', project: msg.id });
      pushPresence(); return;
    }
    if (msg.type === 'activity' && typeof msg.where === 'string') { o.where = msg.where.slice(0, 80); pushPresence(); }
    if (msg.type === 'ping') s.send({ type: 'pong', t: msg.t });
    if (typeof msg.type === 'string' && msg.type.startsWith('doc-')) { docs.live.handle(s, me, msg); return; }
    if (dms.handle(s, me, msg) || voice.handle(s, me, msg)) return;   // typing, captions, meeting capture
    if (msg.type === 'announce' && typeof msg.text === 'string') postChat('general', me.id, msg.text.slice(0, 400));
    if (msg.type === 'huddle-join' && me.role !== 'agent') {
      const first = huddle.size === 0;
      huddle.set(me.id, { muted: !!msg.muted, sharing: false, joined: new Date().toISOString(), socket: s });
      pushHuddle(); if (first) postChat('general', 'tribecode', `🎙️ ${me.name} started a huddle. Jump in from the sidebar.`);
      if (first) bus.notify({ type: 'huddle', priority: 'low', from: me.id, title: `${me.name} started a huddle`, body: 'Jump in from the sidebar.', view: 'home' });
    }
    if (msg.type === 'huddle-leave' && huddle.has(me.id)) { huddle.delete(me.id); pushHuddle(); }
    if (msg.type === 'huddle-state' && huddle.has(me.id)) { const h = huddle.get(me.id); h.muted = !!msg.muted; h.sharing = !!msg.sharing; pushHuddle(); }
    if (msg.type === 'rtc' && typeof msg.to === 'string' && huddle.has(me.id) && huddle.has(msg.to)) {
      const target = huddle.get(msg.to).socket;   // signal only the socket that is in the huddle
      if (target && target.open) target.send({ type: 'rtc', from: me.id, data: msg.data });
    }
  }
  s.on('close', () => {
    o.sockets.delete(s); if (!o.sockets.size) online.delete(me.id);
    dashboard.seen(me.id, s.project);
    voice.socketClosed(me, online.has(me.id));
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
  if (args['exit-with-parent']) {
    // Exit with the desktop app. On Windows a child's ppid never changes when the parent dies, so also
    // probe the parent pid directly (signal 0 = "does it exist?") and watch for stdin closing.
    const parent = process.ppid;
    const gone = () => { if (process.ppid !== parent) return true; try { process.kill(parent, 0); return false; } catch (e) { return e.code === 'ESRCH'; } };
    setInterval(() => { if (gone()) { try { docs.live.persistAll(); } catch {} process.exit(0); } }, 2000).unref();
    if (process.stdin && !process.stdin.isTTY) { process.stdin.on('end', () => process.exit(0)); process.stdin.on('error', () => {}); process.stdin.resume(); }
  }
  // A stray rejected promise in one feature must not stop the tribe for everyone (Node exits on them by default).
  process.on('unhandledRejection', e => console.error('  unhandled rejection:', e && e.stack || e));
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
