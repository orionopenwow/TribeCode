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
const makeGuide = require('./guide');   // feat/vision-guide: the Guide's pages (docs/guide/*.md), read-only
const makeFlint = require('./flint');   // feat/flint: Flint's optional local-model step (server/flint.js)
const makeSecretary = require('./secretary');
const makeAgentsHub = require('./agentshub');
const makePreview = require('./preview');
const makeHub = require('./hub');
const makeScratch = require('./scratch');

const VERSION = process.env.TRIBE_VERSION || (() => { try { return require('../app/package.json').version; } catch { return '0.0.0'; } })();
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const PORT = Number(args.port || process.env.TRIBE_PORT || process.env.PORT || 4747);   // PORT: cloud hosts (Render, Koyeb, Railway) set it
// Cloud mode (docs/CLOUD.md): a tribe server on a free cloud host. Nobody there is "the host machine", so the first
// person claims the tribe with a setup code (TRIBE_SETUP_CODE, or one made at start and printed in the logs).
const CLOUD = !!(process.env.TRIBE_CLOUD || process.env.RENDER || process.env.TRIBE_PUBLIC_URL);
let SETUP_CODE = String(process.env.TRIBE_SETUP_CODE || '').trim();
if (CLOUD && !SETUP_CODE) SETUP_CODE = require('node:crypto').randomBytes(9).toString('base64url');
const setupOk = c => { if (!CLOUD || !SETUP_CODE || typeof c !== 'string') return false; const a = Buffer.from(c.trim()), b = Buffer.from(SETUP_CODE); return a.length === b.length && require('node:crypto').timingSafeEqual(a, b); };
const HOST = args.host || process.env.TRIBE_HOST || '0.0.0.0';
const DIR = args.dir || process.env.TRIBE_DIR || path.join(os.homedir(), 'TribeCode');
const UI = path.resolve(args.ui || process.env.TRIBE_UI || path.join(__dirname, '..', 'app', 'ui'));
const STATUSES = ['backlog', 'doing', 'review', 'done'];
const TASK_TYPES = ['build', 'fix', 'design', 'write', 'research'], TASK_DOERS = ['me', 'friend', 'agent', 'flint'];   // feat/setup-flow: task type chips + "Who does it?"

const REPO = args.repo ? path.resolve(args.repo) : (process.env.TRIBE_REPO || null);

const baseStore = new Store(DIR);
const tribe = baseStore.readJSON('.tribe/tribe.json', null) || (() => { const t = { name: args.name || 'My Tribe', created: new Date().toISOString() }; baseStore.writeJSON('.tribe/tribe.json', t); return t; })();
// Project rooms (server/projects.js): every module gets a project-aware view of the tribe folder.
const P = makeProjects({ store: baseStore, tribe, slug, defaultRepo: REPO });
const store = P.scopedStore();
// Cloud save (server/cloudsave.js): members' browsers keep sealed copies, so a free cloud host's wipe loses nothing.
const cloudsave = require('./cloudsave')({ root: baseStore.root, key: CLOUD && process.env.TRIBE_SETUP_CODE ? SETUP_CODE : '', log: m => console.log('  ' + m) });
let lastActivity = Date.now();   // keep-awake (below): real use, not our own pings
function reloadAfterRestore() {
  members = baseStore.readJSON('.tribe/members.json', []); invites = baseStore.readJSON('.tribe/invites.json', []);
  Object.assign(tribe, baseStore.readJSON('.tribe/tribe.json', {}) || {});
  if (P.reload) P.reload();
  if (typeof devices !== 'undefined' && devices.reload) devices.reload();   // phones signed in through device links
}
P.migrate();
const W = makeWorkspace({ store: baseStore, slug });
let members = store.readJSON('.tribe/members.json', []);
let invites = store.readJSON('.tribe/invites.json', []);
const saveMembers = () => store.writeJSON('.tribe/members.json', members);
const saveInvites = () => store.writeJSON('.tribe/invites.json', invites);
// feat/roles: roles & privileges (server/perms.js): host, admin, mod, builder, spectator, agent; the capability table, mutes, audit log.
const perms = require('./perms')({ P, store: baseStore, getMembers: () => members, saveMembers: () => saveMembers(), bus, broadcast: m => broadcast(m), pushPresence: () => pushPresence(),
  pushProjects: () => rooms.pushProjects(), postChat: (...x) => postChat(...x), str: (v, n) => str(v, n) });
const publicMember = m => m && ({ id: m.id, name: m.name, color: m.color, role: m.role, joined: m.joined, ...(m.mode ? { mode: m.mode } : {}), ...(Array.isArray(m.projects) ? { projects: m.projects } : {}), ...(m.guestUntil ? { guest: true, guestUntil: m.guestUntil } : {}), ...(m.avatar ? { avatar: m.avatar } : {}), ...(perms.mutedUntil(m.id) ? { mutedUntil: perms.mutedUntil(m.id) } : {}) });   // avatar: from Sign in with Discord/GitHub/Google (server/oauth.js), https provider CDN only

// ---------- helpers ----------
// Addresses phones and other computers can use to reach this server (Tailscale first: it works anywhere).
// Where a Claude Code session can reach this tribe's MCP endpoint: anywhere (public link), same Wi-Fi, or this computer.
function agentEndpoints(req, token) {
  const pub = share.publicUrl(), lan = (lanUrls().find(u => u.kind === 'lan') || lanUrls()[0] || {}).url;
  const mcpUrl = base => base && `${base.replace(/\/+$/, '')}/mcp`;
  const cmd = u => u && `claude mcp add --transport http tribecode ${u} --header "Authorization: Bearer ${token || '<key>'}"`;
  const urls = { anywhere: mcpUrl(pub), wifi: mcpUrl(lan), here: mcpUrl(`http://localhost:${PORT}`) };
  const best = urls.anywhere || (isLocal(req) ? urls.here : urls.wifi || urls.here);
  return { url: best, command: cmd(best), commands: { anywhere: cmd(urls.anywhere), wifi: cmd(urls.wifi), here: cmd(urls.here) }, urls, public: !!pub, remove: 'claude mcp remove tribecode' };
}
function lanUrls() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) for (const a of addrs || []) {
    if (a.family !== 'IPv4' || a.internal) continue;
    const ts = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address) || /tailscale/i.test(name);
    // virtual adapters (VirtualBox, VMware, Hyper-V/WSL, Docker) look like Wi-Fi addresses but nobody can reach them
    const virt = !ts && (/virtualbox|vbox|vmware|vmnet|vethernet|hyper-v|wsl|docker|br-|virbr|utun|zerotier|loopback/i.test(name) || /^192\.168\.56\./.test(a.address) || /^172\.(1[7-9]|2\d|3[01])\./.test(a.address));
    out.push({ url: `http://${a.address}:${PORT}`, kind: ts ? 'tailscale' : virt ? 'virtual' : 'lan', name });
  }
  const rank = u => (u.kind === 'tailscale' ? 0 : u.kind === 'lan' ? (/wi-?fi|wlan|wireless|ethernet|^en|^eth/i.test(u.name) ? 1 : 2) : 3);
  return out.sort((x, y) => rank(x) - rank(y));
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
// A sign-in that survives cleared storage (iPhone Safari wipes site storage after a week away; every address is its own
// storage): whenever a response hands out a new key (claim, join, sign-in, device link, reclaim), the browser also gets it as
// an HttpOnly cookie that pages can't read. GET /api/session swaps the cookie back for the key when storage comes up empty.
const SESSION_COOKIE = 'tribe_s';
function sessionCookie(res, token) {
  const req = res.req; if (!req || typeof token !== 'string') return;
  const secure = req.socket.encrypted || /https/i.test(String(req.headers['x-forwarded-proto'] || '')) || /^https:/i.test(String(req.headers.origin || ''));
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=34560000${secure ? '; Secure' : ''}`);
}
const cookieToken = req => { const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`)); try { return m ? decodeURIComponent(m[1]) : null; } catch { return null; } };
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  if (isObj && body && status === 200 && typeof body.token === 'string' && body.member && !res.headersSent) sessionCookie(res, body.token);
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
// fix/security-review: the Origin must be this server's own page or the desktop app. Not "null" (sandboxed previews, file://
// pages) and not other localhost ports (a project's dev server): those could otherwise mint invites, host agent keys or tunnels.
const LOCAL_ORIGIN = new RegExp(`^(http:\\/\\/(localhost|127\\.0\\.0\\.1|\\[::1\\]):${PORT}|tauri:\\/\\/localhost|https?:\\/\\/tauri\\.localhost)$`, 'i');
const isLocal = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !PROXY_HEADERS.some(h => req.headers[h] !== undefined)
  && LOCAL_HOST.test(String(req.headers.host || '')) && (req.headers.origin === undefined
    ? !['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site'] || ''))   // no Origin (a GET from an <img>, a form): not from another site
    : LOCAL_ORIGIN.test(String(req.headers.origin)));
function authed(req) {
  const h = req.headers.authorization || '';
  const u = new URL(req.url, 'http://x');
  const t = h.startsWith('Bearer ') ? h.slice(7) : u.searchParams.get('token');   // ?token= is deprecated for media (fix/security-2), still needed by /ws
  if (!t) return u.searchParams.get('mt') && media ? stillValid(media.verify(req, u, u.searchParams.get('mt'))) : null;   // fix/security-2: signed media link
  const th = hash(t);
  return stillValid(members.find(x => x.tokenHash === th) || (devices && devices.memberForToken(th)) || null);
}
function stillValid(m) {
  if (m && m.guestUntil && Date.parse(m.guestUntil) < Date.now()) return null;   // a one-time guest pass that ran out (any of its keys)
  if (m && m.role === 'agent') { const o = members.find(x => x.id === m.owner); if (o && o.guestUntil && Date.parse(o.guestUntil) < Date.now()) return null; }   // fix/security-review: …and its agents
  return m;
}
const tokenHashOf = req => { const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : new URL(req.url, 'http://x').searchParams.get('token'); return t ? hash(t) : null; };
function newMember({ name, color: c, role, projects, extra }) {
  const token = id(32);
  const m = { ...(extra || {}), id: slug(name).slice(0, 16) + '-' + id(4), name, color: color(c), role, joined: new Date().toISOString(), tokenHash: hash(token), ...(projects ? { projects } : {}) };
  members.push(m); saveMembers();
  return { member: m, token };
}
// ---- invites: shared by POST /api/join and Sign in with Discord/GitHub/Google (server/oauth.js) ----
function findInvite(c) { const inv = invites.find(i => i.code === c); return inv && !inv.revoked && Date.parse(inv.expires) >= Date.now() && inv.uses < inv.maxUses ? inv : null; }
// Someone already in the tribe opens a project invite: add that project instead of making a second account.
function addToProject(mem, inv) {
  const proj = inv.project && P.get(inv.project);
  if (proj && Array.isArray(mem.projects) && !mem.projects.includes(proj.id)) { mem.projects.push(proj.id); inv.uses++; saveInvites(); }
  if (proj) P.addMember(proj.id, mem.id, P.scoped(mem) ? inv.role : mem.role);
  saveMembers(); pushPresence(); rooms.pushProjects();
  if (inv.talent && talent) try { talent.onJoin(inv, mem); } catch (e) { console.error(e); }   // v0.27 company: a hire opened their invite
  return proj ? proj.id : null;
}
function joinByInvite(inv, { name, color: c, extra }) {
  const proj = inv.project && P.get(inv.project);
  inv.uses++; saveInvites();
  const out = newMember({ name, color: c, role: inv.role, projects: proj ? [proj.id] : undefined, extra });
  if (inv.guest) { out.member.guestUntil = new Date(Date.now() + (inv.guestHours || 24) * 3600_000).toISOString(); saveMembers(); }   // one-time guest pass
  if (proj) P.addMember(proj.id, out.member.id, inv.role);
  P.inProject(proj ? proj.id : P.defaultId(), () => postChat('general', 'tribecode', `${name} joined ${proj ? proj.name : 'the tribe'} 👋`));
  if (inv.talent && talent) try { talent.onJoin(inv, out.member); } catch (e) { console.error(e); }   // v0.27 company: an outside hire joined -> their seat
  pushPresence(); if (proj) rooms.pushProjects();   // everyone's project list shows the new member (Shared compute, overview team)
  return { ...out, project: proj ? proj.id : null };
}

// simple per-IP limiter for public endpoints
const hits = new Map();
// fix/security-review: behind a tunnel every request comes from 127.0.0.1, so key on the address the tunnel reports
// (cloudflared: CF-Connecting-IP; Tailscale Funnel and others: the last X-Forwarded-For hop, which the tunnel appends).
function clientKey(req) {
  const ra = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ra)) return ra;
  const cf = req.headers['cf-connecting-ip'], xff = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean).pop();
  return String(cf || xff || ra).slice(0, 64);
}
function limited(req, max = 20, windowMs = 60_000, bucket = '') {   // bucket: a route's own count (accounts), else shared
  const k = (bucket ? bucket + ':' : '') + clientKey(req), now = Date.now();
  const h = (hits.get(k) || []).filter(t => now - t < windowMs); h.push(now); hits.set(k, h);
  return h.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (!h.length || now - h[h.length - 1] > 60_000) hits.delete(k); }, 60_000).unref();   // forget idle addresses

// ---------- realtime ----------
const online = new Map(); // memberId -> { sockets:Set, where, since, project }
// Project rooms: data events reach only sockets that are in the event's project (and can see it); other
// sockets of the same person get a tiny 'project-pulse' so the sidebar badges stay live. Project chat
// channels are delivered as `general`, which is what the chat UI shows for the current project.
const UNSCOPED = new Set(['presence', 'huddle', 'captions', 'dev-reload', 'projects', 'hello', 'workshop', 'perms', 'packs']);   // perms: feat/roles; packs: feat/captures
const SOFT = new Set(['approval', 'claims']);   // everyone who can see the project, whatever room they are in
const PULSE = new Set(['chat', 'task', 'proposal', 'change', 'approval', 'doc', 'bug']);
const memberById = mid => members.find(x => x.id === mid);
function broadcast(msg, except) {
  const type = String(msg.type || '');
  let pid = null;
  if (!UNSCOPED.has(type)) {
    const ch = typeof msg.channel === 'string' ? msg.channel : null;
    const chPid = ch ? (ch === 'general' ? (P.current() || P.defaultId()) : (P.byChannel(ch) || {}).id || (chans && chans.projectOf(ch))) : null;   // feat/chat2: created channels
    pid = msg.project || (msg.approval && msg.approval.project) || chPid || (ch && !chPid ? null : P.current());
    if (type === 'approval' && !msg.project && !(msg.approval && msg.approval.project)) pid = P.defaultId();
  }
  if (dashboard) dashboard.onEvent(type, pid);   // the Global Hub recomputes for whoever can see pid (server/hub.js)
  if (sense) sense.onEvent(type, pid);   // feat/project-sense: recompute what the project is (debounced, server/sense.js)
  const asGeneral = typeof msg.channel === 'string' && pid && msg.channel === P.channelOf(pid) && msg.channel !== 'general' ? { ...msg, channel: 'general' } : msg;
  for (const [mid, o] of online) {
    const mem = memberById(mid); if (!mem) continue;
    if (pid && !P.canSee(mem, pid)) continue;
    if ((type === 'huddle' || type === 'captions') && huddleProject && !P.canSee(mem, huddleProject)) continue;   // fix/security-2: the huddle's project only
    const out = type === 'presence' ? { type: 'presence', members: presenceFor(mem) } : asGeneral;
    for (const s of o.sockets) {
      if (s === except) continue;
      if (pid && !SOFT.has(type) && s.project !== pid) { if (PULSE.has(type)) s.send({ type: 'project-pulse', project: pid, kind: type }); continue; }
      s.send(out);
    }
  }
}
let dashboard = null;   // the Global Hub, server/hub.js (made below)
let talent = null;   // v0.27 company: the Work view (server/talent.js, made below)
let profiles = null;   // feat/profiles: avatar, name color, status, presence (server/profiles.js, made below)
let moderation = null;   // feat/appstore: report, block, word filter (server/moderation.js, made below)
let sense = null;   // feat/project-sense (server/sense.js, made below)
let buildKit = null;   // server/buildkit.js (made below)
let setupFlow = null;   // feat/setup-flow (server/setup.js, made below)
const agentSeen = new Map(); // agent id -> { at, where, project }
const AGENT_IDLE = 3 * 60_000;
function presence() {
  return members.map(m => {
    if (m.role === 'agent') { const a = agentSeen.get(m.id); const on = !!a && Date.now() - a.at < AGENT_IDLE; return { ...publicMember(m), owner: m.owner, online: on, where: on ? a.where : null, since: a ? new Date(a.at).toISOString() : null, project: on ? a.project || null : null }; }
    const o = online.get(m.id); return { ...publicMember(m), online: !!o, where: o ? o.where : null, since: o ? o.since : null, project: o ? o.project || null : null };
  }).map(e => (profiles ? profiles.decorate(e, memberById(e.id) || e, idleAll(e.id)) : e));   // feat/profiles
}
const idleAll = mid => { const o = online.get(mid); return !!o && o.sockets.size > 0 && [...o.sockets].every(s => s.idle); };   // feat/profiles: every tab idle
function presenceFor(viewer) {
  const fix = list => (profiles ? list.map(e => profiles.forViewer(e, viewer, online.has(e.id))) : list);   // feat/profiles: invisible, nicknames
  const out = fix(presenceForRaw(viewer));
  return places ? places.scrub(out, viewer) : out;   // feat/presence: "Show where I am" off / "Appear away"
}
// What one viewer sees: project-scoped friends only see people who share one of their projects.
function presenceForRaw(viewer) {
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
  const prev = agentSeen.get(me.id), project = P.current();
  const where = tool === 'connected' ? (prev && Date.now() - prev.at < AGENT_IDLE ? prev.where : 'connected') : `using ${tool.replace(/_/g, ' ')}`;   // comms-smoke: MCP initialize/tools/list (server/mcp.js)
  const changed = !prev || Date.now() - prev.at > AGENT_IDLE || prev.where !== where || prev.project !== project;
  agentSeen.set(me.id, { at: Date.now(), where, project });
  if (changed) { pushPresence(); if (places) places.agentMoved(me.id); }
}
setInterval(() => { for (const [k, a] of agentSeen) if (Date.now() - a.at > AGENT_IDLE && !a.off) { a.off = true; pushPresence(); } }, 30_000).unref();
const pushPresence = () => broadcast({ type: 'presence', members: presence() });
// feat/presence: where everyone is (server/places.js). A viewer only hears about people they can see, and not about
// someone who is invisible (online but shown offline).
function canSeeMember(viewer, mid) {
  const e = presenceFor(viewer).find(x => x.id === mid); if (!e) return false;
  const m = memberById(mid); if (m && m.role === 'agent') return true;
  return !!e.online || !online.has(mid);
}
function agentPlace(mid) {
  const a = agentSeen.get(mid); if (!a || Date.now() - a.at > AGENT_IDLE) return null;
  const pid = a.project || P.defaultId(); let t = null;
  try { t = P.inProject(pid, () => loadTasks()).find(x => x.assignee === mid && x.status === 'doing'); } catch {}
  return t ? { k: 'task', id: t.id, l: String(t.title || 'a task').slice(0, 60), pr: pid || '' } : { k: 'agent', id: '', l: String(a.where || 'working').slice(0, 60), pr: pid || '' };
}
let places = null;   // made below, once chans exists

// ---------- huddles (WebRTC signaling only; audio/video flow peer to peer) ----------
const huddle = new Map(); // memberId -> { muted, sharing, joined }
let huddleProject = null;   // fix/security-2: the project the huddle started in; only people who can see it get its state, captions and audio
const huddleState = () => [...huddle].map(([mid, h]) => ({ id: mid, muted: h.muted, sharing: h.sharing, joined: h.joined, deaf: !!h.deaf, hand: h.hand || null, video: !!h.video, cam: h.cam || null, scr: h.scr || null }));
const pushHuddle = () => { broadcast({ type: 'huddle', members: huddleState() }); voice.huddleChanged(); calls.changed(); if (!huddle.size) huddleProject = null; };
function sendTo(mid, msg) { const o = online.get(mid); if (o) for (const s of o.sockets) s.send(msg); }

// ---------- chat ----------
const channelOk = c => /^[a-z0-9][a-z0-9-]{0,31}$/.test(c);
let chatHook = null;
let rituals = null;   // feat/work-company: /standup answers + ritual runs (server/rituals.js)
let captureHook = null;   // feat/captures (server/captures.js onChat)   // the secretary hears @secretary (server/secretary.js)
// The outbox (app/ui/tribe.js) gives each message a client id (cid): the app shows it at once, the echo replaces it, and a
// resend after a lost reply posts nothing twice.
const CID_RE = /^[A-Za-z0-9_-]{6,40}$/, cidSeen = new Map();
const cidOf = body => (body && typeof body.cid === 'string' && CID_RE.test(body.cid) ? { cid: body.cid } : {});
function postChat(channel, by, text, extra) {
  if (channel === 'general') channel = P.channelOf(P.current() || P.defaultId());   // project rooms: each project has its own channel
  if (extra && extra.cid) { const k = `${channel}:${by}:${extra.cid}`; if (cidSeen.has(k)) return cidSeen.get(k); }
  if (moderation && by !== 'tribecode') text = moderation.clean(text);   // feat/appstore: the host's word filter
  const msg = { id: id(12), at: new Date().toISOString(), by, text, ...extra };   // extra: media, replyTo, fwd (chatx.js), cid (outbox)
  if (extra && extra.cid) { cidSeen.set(`${channel}:${by}:${extra.cid}`, msg); if (cidSeen.size > 2000) cidSeen.delete(cidSeen.keys().next().value); }
  store.appendJSONL(`chat/${channel}.jsonl`, msg);
  if (!dms.deliver(channel, msg)) broadcast({ type: 'chat', channel, message: msg });   // DMs reach only their two members
  if (by !== 'tribecode' && !channel.startsWith('dm-')) pocket.chat(channel, by, text);   // @mentions -> notification hub
  if (chatHook) try { chatHook(channel, by, text, msg); } catch (e) { console.error(e); }
  if (captureHook && by !== 'tribecode' && !(extra && (extra.media || extra.images || extra.vote))) try { captureHook(channel, memberById(by), text, msg); } catch (e) { console.error(e); }   // feat/captures: a pasted link becomes a capture card
  return msg;
}
function handleCommands(channel, member, text) {
  if (rituals && /^\/(standup|retro|weekly-review)\b/i.test(text)) { try { if (rituals.onCommand(channel, member, text)) return; } catch (e) { console.error(e); } }
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
  let was = null; try { const r = store.readMd(taskFile(t)); was = r && r.meta && r.meta.status; } catch {}
  const { body = '', ...meta } = t; store.writeMd(taskFile(t), meta, body); broadcast({ type: 'task', task: t });
  bugs.onTask(t);
  try { if (t.site) siteDesign.onTask(t); } catch {}   // feat/site-v2: a finished website task resolves its comments
  if (flow) flow.onTask(t);   // the living plan checks items off (server/flow.js)
  if (t.status === 'done' && was && was !== 'done' && askai) try { askai.taskDone(t, 'general'); } catch {}   // agents' finished work in the channel
  return t;
}
function createTask({ title, by, status = 'backlog', assignee = null, body = '', source, due, type }) {
  const now = new Date().toISOString();
  const t = { id: `t-${Date.now().toString(36)}-${id(3).toLowerCase()}`, title: str(title, 200) || 'Untitled task', status: STATUSES.includes(status) ? status : 'backlog',
    assignee, by, created: now, updated: now, order: Date.now(), source, body: str(body, 20000), due: dueOk(due), project: P.current() || P.defaultId() };
  if (TASK_TYPES.includes(type)) t.type = type;   // feat/setup-flow
  return saveTask(t);
}

const taskFlow = require('./taskflow')({ P, store, getMembers: () => members, perms, bus, postChat: (...a) => postChat(...a), saveTask: t => saveTask(t), loadTasks: () => loadTasks(), str, nameOf: x => nameOf(x) });   // feat/tasks-company: assign → accept, Council claims

// ---------- brain, board, docs ----------
let flow = null;   // server/flow.js: one-click project flow, gists, living plan (made below)
const brain = makeBrain({ host: args.ollama || process.env.OLLAMA_HOST || 'http://localhost:11434', model: args.model || process.env.TRIBE_MODEL || '' });
const llm = require('./llm')({ brain, store: baseStore, log: m => console.error('  ' + m), canUseHost: me => perms.can(me, 'ai.use_host_brain') });   // feat/any-llm: the tribe's brain (cloud key / Ollama / basic), routes brain.generate
const flint = makeFlint({ brain, str, llm });   // feat/flint
brain.refresh().then(st => console.log(st.online ? `  Brain:    ${st.model} ${st.cloud ? "(the host's key)" : "via Ollama"}` : `  Brain:    off (${st.error})`));
const readVision = () => { try { return fs.readFileSync(store.p('VISION.md'), 'utf8'); } catch { return ''; } };
const projectRepo = () => (P.get(P.current() || P.defaultId()) || {}).repo || null;
const board = makeBoard({ store, id, slug, str, getMembers: () => members, broadcast, postChat, createTask: (o) => createTask(o), repo: projectRepo, brain, readVision, can: (me, cap) => perms.can(me, cap) });
const docs = makeDocs({ store, slug, str, broadcast, brain, postChat, onWrite: (d, prev) => docsx.onWrite(d, prev) });
const bugs = makeBugs({ store, id, str, broadcast, postChat, brain, createTask: o => createTask(o), getTask: tid => loadTasks().find(t => t.id === tid), saveTask: t => saveTask(t), getMembers: () => members, tellAgent: (...x) => coord.tell(...x), can: (me, cap) => perms.can(me, cap) });
const nameOf = mid => (members.find(x => x.id === mid) || {}).name || 'someone';
const claims = makeClaims({ store, id, broadcast, nameOf, project: () => P.current(), isBoss: me => me.role === 'host' || perms.atLeast(me, 'admin') });
// ---------- web: device links (/m/<key>/) + public https address ----------
// Pages carry the server version they were served with (<meta name="tribe-version">): app/ui/selfheal.js compares it
// with the running server's version, so a page cached before an update (service worker, an old tab) knows it is stale.
const stampHtml = (file, data) => (path.extname(file) === '.html' ? Buffer.from(String(data).replace('<meta name="tribe-version" content="">', `<meta name="tribe-version" content="${VERSION}">`)) : data);
const devices = makeDevices({ store, id, hash, str, getMembers: () => members, publicMember, tribe, stamp: stampHtml });
const media = require('./media')({ dir: DIR, getMembers: () => members, deviceTokens: mid => devices.list().filter(d => d.member === mid).flatMap(d => d.tokens) });   // fix/security-2: signed media links
const share = makeShare({ port: PORT });
const site = require('./site')({ args, root: path.join(__dirname, '..'), log: m => console.log(m) });
// Repo autopilot, change requests, TRIBE_CONTEXT.md and the master integrator (server/repo.js): one hub
// per project, each bound to its project's repo and files (--repo is the first project's repo).
// GitHub sign-in (server/github-auth.js): device flow / gh CLI / token; pushAuth() gives the autopilot the host's login.
// Sign in with Discord / GitHub / Google to join a tribe or sign back in on a new device (server/oauth.js, docs/SIGN-IN.md).
const accounts = require('./accounts')({ store: baseStore, getMembers: () => members, isLocal, limited, hash, id, log: m => console.log('  ' + m),
  forgetMembers: ids => {   // DELETE /api/account: the member and their agents leave the tribe (keys, device links, project seats)
    members = members.filter(x => !ids.includes(x.id)); saveMembers();
    try { store.writeJSON('.tribe/devices.json', (store.readJSON('.tribe/devices.json', []) || []).filter(d => !ids.includes(d.member))); devices.reload(); } catch {}
    for (const p of P.all()) if (p.members && ids.some(x => p.members[x])) { for (const x of ids) delete p.members[x]; P.update(p.id, {}); }
    try { pushPresence(); rooms.pushProjects(); } catch {}
  },
  memberFromReq: req => authed(req),
  signInMember: (mid, req) => {   // POST /api/accounts/login: this device gets the member's own device link, redeemed at once
    const mem = members.find(x => x.id === mid); if (!mem) return null;
    const { key } = devices.create(mem, req, 'Account sign-in'); const r = devices.redeem(key, req);
    return r ? { token: r.token, member: publicMember(mem) } : null;
  } });   // feat/nav-accounts: accounts scaffold, off unless TRIBE_ACCOUNTS=1 (docs/ACCOUNTS.md)
const oauth = require('./oauth')({ store: baseStore, getMembers: () => members, saveMembers, publicMember, isLocal, str, limited, devices, tribe,
  publicBase: () => args['public-url'] || process.env.TRIBE_PUBLIC_URL || share.publicUrl(), findInvite, joinByInvite, addToProject, log: m => console.log('  ' + m) });
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
      onHead: x => flow && flow.onHead(p.id, x), contextExtra: () => [...(flow ? flow.contextLines(p.id) : []), ...(buildKit ? buildKit.contextLines(p.id) : [])], pushAuth: () => githubAuth.pushAuth(), can: (me, cap) => perms.can(me, cap, p.id) });
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
  dnd: mid => !!profiles && profiles.isDnd(mid), muted: (to, from) => (!!profiles && !!from && profiles.isMuted(to, from)) || (!!moderation && moderation.isBlocked(to, from)),   // feat/profiles: do not disturb, muted people
  publicUrl: () => (args['public-url'] || process.env.TRIBE_PUBLIC_URL || share.publicUrl() || (lanUrls()[0] || {}).url || `http://localhost:${PORT}`).replace(/\/+$/, '') });
let shipHub = null;   // feat/ship-flow: a ship vote decided from a phone (one-tap approval) counts as that person's vote
let publishOnApproval = null;   // v0.27 publish: an approved "publish" request from an AI helper (server/publish.js)
let companyHub = null;   // v0.27 company: decided approvals land in the company's decision log (server/company.js)
const approvals = makeApprovals({ store, id, str, bus, getMembers: () => members, postChat, broadcast: m => { broadcast(m); if (shipHub && m && m.type === 'approval') try { shipHub.onApproval(m.approval); } catch (e) { console.error('ship:', e.message); } if (companyHub && m && m.type === 'approval') try { companyHub.onApproval(m.approval); } catch (e) { console.error('company:', e.message); } if (publishOnApproval && m && m.type === 'approval') try { publishOnApproval(m.approval); } catch (e) { console.error('publish:', e.message); } }, hub: pocket, project: () => P.current(), canSee: (m, pid) => !pid || P.canSee(m, pid),
  canDecideAny: (who, a) => who.role === 'host' || ((!a.project || P.canSee(who, a.project)) && (perms.can(who, 'approvals.approve', a.project) || (a.risk === 'low' && perms.can(who, 'approvals.approve_low', a.project)))) });   // feat/roles
const canSeeCh = (me, ch) => {   // fix/security-2: typing only in channels you can read
  if (ch === 'general') return true;
  const pj = P.byChannel(ch); if (pj) return P.canSee(me, pj.id);
  if (chans.isCustom(ch)) return chans.canRead(me, ch);
  const ag = /^agents-(.+)$/.exec(ch); return !!(ag && P.get(ag[1]) && P.canSee(me, ag[1]));
};
const dms = makeDm({ store, getMembers: () => members, sendTo, broadcast, bus, canSeeChannel: canSeeCh });
places = require('./places')({ P, store: baseStore, getMembers: () => members, online, idleAll, canSeeChannel: canSeeCh, visible: canSeeMember, agentPlace });
let askai = null;   // server/askai.js (made below, once coord exists): @ai for people without their own Claude
const chatx = makeChatx({ store, id, str, getMembers: () => members, postChat, dms, sendTo, broadcast, brain, docs, loadTasks: () => loadTasks(), commands: (c, mem, t) => handleCommands(c, mem, t), pubCmd: (c, mem, t) => askai && askai.command(c, mem, t), ask: (c, mem, t) => askai && askai.ask(c, mem, t),
  approvals, board, createTask: o => createTask(o), bus, slug, project: () => P.current() || P.defaultId(), channelOf: () => P.channelOf(P.current() || P.defaultId()), inProject: (pid, fn) => P.inProject(pid, fn),
  channelProject: ch => (P.byChannel(ch) || {}).id || (chans && chans.projectOf(ch)) || null, canSeeProject: (mem, pid) => P.canSee(mem, pid),
  canModerate: (mem, msg, ch) => { const pid = (P.byChannel(ch) || {}).id || P.current(); const by = memberById(msg.by); return perms.can(mem, 'chat.moderate', pid) && (!by || perms.outranks(mem, by, pid)); },   // feat/roles
  muteBlock: mem => perms.muteBlock(mem), audit: (...x) => perms.audit(...x),
  voters: () => members.filter(x => x.role !== 'agent' && x.role !== 'spectator' && P.canSee(x, P.current() || P.defaultId())) });   // votes: the project's humans
// feat/chat2: created channels, link previews (SSRF-safe fetch + picture proxy), GIF search (server/channels.js, embeds.js, gifs.js)
const chans = require('./channels')({ store: baseStore, P, str, broadcast, getMembers: () => members });
const embeds = require('./embeds')({ store: baseStore });
const gifs = require('./gifs')({ store: baseStore, pstore: store, P, channels: chans });
// comms-smoke: meetings belong to the project where captions were turned on; optional after-huddle summary (server/huddlesum.js)
const huddleSum = require('./huddlesum')({ P, brain, postChat, nameOf, log: m => console.error('  ' + m) });
// feat/captures: the link reader, voice notes and summaries (server/captures.js), optional packs (server/packs.js)
const packs = require('./packs')({ store: baseStore, broadcast: m => broadcast(m), log: m => console.error('  ' + m) });
const captures = require('./captures')({ P, store, base: baseStore, embeds, packs, llm, docs, dms, perms, postChat: (...x) => postChat(...x), broadcast: m => broadcast(m), sendTo: (...x) => sendTo(...x), createTask: o => createTask(o), getMembers: () => members, nameOf, log: m => console.error('  ' + m) });
huddleSum.setSink(x => captures.fromHuddle(x));
captureHook = (...x) => captures.onChat(...x);
// voice-video: reactions, laser pointer, in-call chat and polls, recording notices, ring/missed, lobby, ICE/TURN config, history
const calls = require('./calls')({ store, id, str, huddle, sendTo, broadcast, postChat, bus, nameOf, getProject: () => huddleProject,
  canSee: (mid, pid) => { const m = memberById(mid); return !!m && P.canSee(m, pid || huddleProject || P.current() || P.defaultId()); } });
const voice = makeVoice({ canSeeHuddle: me => !huddleProject || P.canSee(me, huddleProject), store, id, str, huddle, sendTo, broadcast, postChat, createTask: o => createTask(o), getMembers: () => members, nameOf, brain, docs, bus, P, summary: huddleSum });
const plan = makePlan({ store, id, str, broadcast, postChat, getMembers: () => members, loadTasks: () => loadTasks(), nameOf });
rituals = require('./rituals')({ store, docs, plan, postChat, broadcast, getMembers: () => members, nameOf, str });   // feat/work-company: standup/retro rituals on the calendar
const docsx = makeDocsX({ store, id, str, slug, broadcast, docs, getMembers: () => members, nameOf });
const visuals = makeVisuals({ store, slug, str, broadcast, nameOf });
const thumb = require('./thumb')({ P, visuals });
const preview = makePreview({ P, store: baseStore, getMembers: () => members, broadcast, share, lanUrls, port: PORT, log: m => console.error('  ' + m), llm });   // app preview (server/preview.js)   // the pinned repo's thumbnail: README image → screenshot → tile
// Home Screen app links (server/applink.js) and Desktop folders: export, live copy, shortcut (server/export.js).
const applink = require('./applink')({ P, store: baseStore, getMembers: () => members, preview, shareBase: () => share.publicUrl() || (lanUrls().find(u => u.kind === 'lan') || lanUrls()[0] || {}).url || null, log: m => console.error('  ' + m) });
const exporter = require('./export')({ P, W, store: baseStore, applink, isLocal, port: PORT, getMembers: () => members, log: m => console.log('  ' + m) });
const busLog = makeBusLog({ broadcast, sendTo });
const DEBUG = !!(args.dev || process.env.TRIBE_TEST === '1');
const rooms = makeRooms({ P, W, store, brain, getMembers: () => members, saveMembers, isLocal, presenceFor, loadTasks: () => loadTasks(), hubFor, resetHub, plan, approvals, docs,
  broadcast, postChat, nameOf, str, perms });
const coord = makeCoord({ P, store, id, str, broadcast, postChat, bus, getMembers: () => members, presenceFor, loadTasks: () => loadTasks(), saveTask: t => saveTask(t), claims, hubFor, approvals, brain, nameOf });
// feat/ship-flow: Ship it (review what changed, vote to push), Turbo (ships on its own at calm moments), Share, Pulse, Split (server/ship.js)
const ship = shipHub = require('./ship')({ P, store, hubFor, approvals, getMembers: () => members, loadTasks: () => loadTasks(), createTask: o => createTask(o), postChat, broadcast, bus, str, nameOf,
  can: (m, cap) => m.role === 'host' || perms.can(m, cap, P.current()), pushAuth: () => githubAuth.pushAuth(), coord, claims, id, brain });
const agentnet = makeAgentNet({ P, store, id, str, broadcast, bus, getMembers: () => members, presenceFor, loadTasks: () => loadTasks(), saveTask: t => saveTask(t), createTask: o => createTask(o), approvals, coord, nameOf });
askai = require('./askai')({ store: baseStore, id, str, P, getMembers: () => members, presenceFor, postChat, coord, approvals, brain, askBrain: (c, mem, t) => chatx.askBrain(c, mem, t), createTask: o => createTask(o), bus, nameOf });
const compute = require('./compute')({ store: baseStore, str, getMembers: () => members, isOnline: mid => online.has(mid), broadcast });   // shared compute (Helpers list)
const openspace = require('./openspace')({ P, broadcast, isLocal, log: m => console.log('  ' + m) });   // Open Space office (optional, host-only)
const shelf = require('./shelf')({ P, root: require('./tpldir').root(), docs, postChat, str, nameOf });   // starter shelf: tools, libraries, Claude skills
const assetLib = require('./assets')({ P, root: require('./tpldir').root(), base: baseStore, postChat, str, nameOf });   // v0.25: the open asset library (server/assets.js)
const assist = require('./assist')({ P, store, brain, docs, loadTasks: () => loadTasks(), getMembers: () => members, presenceFor, postChat, coord, shelf, str, nameOf });   // feat/assist: vision drafting + suggested tasks (server/assist.js)
// feat/viewers: asset viewers (server/files.js) + phone app mode (server/phoneapp.js)
const assetFiles = require('./files')({ P });
const codeFiles = require('./codefiles')({ P, claims, identity: W.identity, member: id => members.find(x => x.id === id), broadcast });   // feat/files-code: the read-only Code view of Files (server/codefiles.js)
const uploads = require('./uploads')({ store: baseStore, P, nameOf, broadcast, can: (me, cap) => perms.can(me, cap) });   // the Files center: any file type, yours or the project's
const connections = require('./connections')({ P, store: baseStore, uploads, visuals, postChat, nameOf, broadcast, isLocal });   // feat/mcp-directory: special connections (ArtCraft…), host only
profiles = require('./profiles')({ P, store: baseStore, getMembers: () => members, pushPresence: () => pushPresence() });   // feat/profiles
moderation = require('./moderation')({ store: baseStore, getMembers: () => members, bus, id, limited, log: m => console.log('  moderation: ' + m) });   // feat/appstore (docs/APP-STORE.md)
const pwaIn = require('./pwa')({ UI });   // feat/appstore: the share target without a service worker (docs/BROWSER-APP.md)
const phoneapp = require('./phoneapp')({ P, store: baseStore, shelf, broadcast, isLocal, lanUrls, nameOf, log: m => console.log('  ' + m) });
const people = makePeople({ P, store, getMembers: () => members, presenceFor, claims, coord, docs, loadTasks: () => loadTasks(), nameOf, emailOf: W.emailOf });
require('./mcp-people').bind(people);   // share_prompt, report_context + the agent prompt log
// The Workshop (server/workshop.js): a tribe-wide library apart from projects, plus the community shelf.
const workshop = makeWorkshop({ store: baseStore, P, approvals, getMembers: () => members, nameOf, postChat, broadcast, slug, id, hasToken: W.hasToken, readSecret: W.readSecret });
const guide = makeGuide({ ui: UI });   // feat/vision-guide
// Solo mode: the Secretary (background notes, digest, inspiration, research) and the agents hub.
const secretary = makeSecretary({ secsum: require(path.join(UI, 'secsum.js')), P, store: baseStore, pstore: store, brain, docs, loadTasks: () => loadTasks(), hubFor, getMembers: () => members, nameOf, postChat, createTask: o => createTask(o),
  votes: chatx.votes, broadcast, str, id, log: m => console.error('  ' + m) });
require('./mcp-secretary').bind(secretary);
chatHook = (...x) => secretary.onChat(...x);
const agentsHub = makeAgentsHub({ P, store: baseStore, pstore: store, brain, getMembers: () => members, presenceFor, agentSeen, idleMs: AGENT_IDLE, nameOf, people, coord, claims, endpoints: (req, t) => agentEndpoints(req, t), secretary,
  approvals, loadTasks: () => loadTasks(), createTask: o => createTask(o), saveTask: t => saveTask(t) });   // + the Agent fleet (feat/fleet)
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
  const inv = { code: code(8), by, role: 'builder', maxUses, uses: 0, created: new Date().toISOString(), expires: new Date(Date.now() + hours * 3600_000).toISOString(), ...(project ? { project } : {}) };
  invites.push(inv); saveInvites(); return inv;
}
function linkFor(c) {
  const pub = share.publicUrl(), lan = lanUrls().find(u => u.kind === 'lan') || lanUrls()[0];
  const base = (pub || (lan || {}).url || `http://localhost:${PORT}`).replace(/\/+$/, '');
  return { link: site.joinLink(base, c), kind: pub ? 'public' : lan ? (lan.kind === 'tailscale' ? 'tailscale' : 'wifi') : 'local' };
}
// v0.26 Tribe link: every tribe gets one permanent, memorable link, like a Discord server's: <host>/t/<name>.
// It is a long-lived reusable invite (builder role) behind a name the host can change, turn off or renew. No AI needed.
//   GET /api/tribe-link   members: { slug, on, short, link }      PUT /api/tribe-link { slug?, on?, renew? }  host
const TL_FILE = '.tribe/tribelink.json';
function tribeLink(create = true) {
  let t = baseStore.readJSON(TL_FILE, null);
  const live = t && findInvite(t.code);
  if ((!t || (t.on !== false && !live)) && create && members.some(m => m.role === 'host')) {
    const host = members.find(m => m.role === 'host');
    const inv = makeInvite({ by: host.id, hours: 24 * 365, maxUses: 1000 }); inv.tribeLink = true; saveInvites();
    t = { slug: (t && t.slug) || slug(tribe.name).slice(0, 32) || 'tribe', code: inv.code, on: t ? t.on !== false : true, at: new Date().toISOString() };
    baseStore.writeJSON(TL_FILE, t);
  }
  return t;
}
function tribeLinkView() {
  const t = tribeLink(); if (!t) return { on: false };
  const l = linkFor(t.code);
  const pub = share.publicUrl(), lan = lanUrls().find(u => u.kind === 'lan') || lanUrls()[0];
  const host = (pub || (lan || {}).url || `http://localhost:${PORT}`).replace(/\/+$/, '');
  return { slug: t.slug, on: t.on !== false, short: `${host}/t/${t.slug}`, link: l.link, kind: l.kind, code: t.on !== false ? t.code : null };
}
flow = makeFlow({ P, W, base: baseStore, id, str, slug, broadcast, postChat, bus, getMembers: () => members, nameOf, docs, brain, coord, createTask: o => createTask(o), loadTasks: () => loadTasks(), saveTask: t => saveTask(t),
  rooms, hubFor, resetHub, share, makeInvite, linkFor, isLocal, perms, approvals });   // fix/security-2: perms + approvals for Connect GitHub
W.onCommit = x => flow.onCommit(x);   // commits through "Commit my changes" become gists
dashboard.setFlow(flow);
const showcase = require('./showcase')({ P, base: baseStore, W, getMembers: () => members, nameOf, visuals, hubFor, preview, flow: () => flow, broadcast, postChat, bus, str , ui: UI, llm, sense: () => sense });   // per-project Website (server/showcase.js)
sense = require('./sense')({ P, store, base: baseStore, broadcast, postChat, loadTasks: () => loadTasks(), readVision, shelf, brain, llm, log: m => console.error('  ' + m) });   // feat/project-sense: what the project is + inspiration (server/sense.js)
const look = require('./look')({ base: baseStore, P, tribe, saveTribe: () => baseStore.writeJSON('.tribe/tribe.json', tribe), broadcast, getMembers: () => members, W, perms });   // feat/customize: tribe + project look (server/look.js)
const siteFlint = require('./siteflint')({ P, base: baseStore, showcase, nameOf, llm, log: m => console.log(m) });   // Flint edits the website locally + the Saved shelf (server/siteflint.js)
const inspoBoard = require('./inspo')({ P, base: baseStore, embeds, showcase, assets: assetLib, postChat, nameOf, broadcast });   // v0.25: the inspiration board (server/inspo.js)
const ledger = require('./ledger')({ P, base: baseStore, broadcast, postChat, nameOf, perms, getMembers: () => members }), seatpilot = require('./seatpilot')({ P, base: baseStore, broadcast, nameOf, perms, getMembers: () => members, approvals, coord, bus, ledger });   // v0.27 company: Money + seat autopilot (server/ledger.js, server/seatpilot.js)
const academy = require('./academy')({ P, base: baseStore, store, docs, captures, nameOf, broadcast }), legalDocs = require('./legal')({ P, base: baseStore, store, docs, approvals, postChat, nameOf, broadcast });   // v0.27 company: Role Academy + Offload (server/academy.js), Legal documents (server/legal.js)
const flintKB = require('./flintkb')({ ui: UI, nlu: require(path.join(UI, 'flintnlu.js')) });   // flint-local: Flint's knowledge base (TF-IDF over the Guide and docs)
const aiBasics = require('./aibasics')({ llm, base: baseStore, P, str });   // feat/flint-ai: ✦ basic features supercharged by AI (server/aibasics.js)
const flintMem = require('./flintmem')({ base: baseStore, store, docs, str, nameOf, loadTasks: () => loadTasks(), readVision, recentChat: n => store.readJSONL('chat/general.jsonl', n).filter(x => !x.deleted && x.by !== 'tribecode').map(x => ({ who: nameOf(x.by), text: x.text })), llm, perms, broadcast }); flint.useBrief(me => flintMem.brief(me));   // v0.27.1: Flint remembers you, tribe skills, project words, drafts (server/flintmem.js)
const repoBinding = new Map();   // pid -> the clone in flight (a GitHub-linked draft moved here, server/soloimport.js)
function connectRepo(pid, gh) {   // bind owner/name as the project's code repository, the same as connecting a repo by URL
  if (repoBinding.has(pid)) return repoBinding.get(pid);
  const job = (async () => {
    const p = P.get(pid); if (!p) throw new Error('no such project');
    if (p.repo && W.isRepo(p.repo)) return { already: true, repo: p.repo };
    const dest = baseStore.p('workspaces', pid);
    if (!W.isRepo(dest)) await W.clone(process.env.TRIBE_TEST && process.env.TRIBE_GITHUB_GIT ? path.join(process.env.TRIBE_GITHUB_GIT, gh + '.git') : `https://github.com/${gh}.git`, dest);
    P.update(pid, { repo: dest, workspace: true }); resetHub(pid);
    try { rooms.pushProjects(); } catch {}
    return { repo: dest };
  })().finally(() => repoBinding.delete(pid));
  repoBinding.set(pid, job); return job;
}
const soloImport = require('./soloimport')({ P, docs, postChat, store, str, saveTask, createTask, rooms, base: baseStore, company: () => company, connectRepo });   // phone tribe -> host (docs/PHONE-HOSTING.md)
const siteTpl = require('./sitetemplates')({ P, base: baseStore, siteDir: pid => showcase.siteDir(pid), postChat, nameOf, isManager: (pid, me) => !!me && me.role !== 'agent' && (me.role === 'host' || ((P.get(pid) || {}).members || {})[me.id] === 'host') });   // v0.25: site templates
talent = require('./talent')({ P, base: baseStore, id, getMembers: () => members, nameOf, postChat, broadcast, bus, dms, approvals, askai, workshop, perms, makeInvite, linkFor, tribeName: () => tribe.name, ledger, loadTasks: () => loadTasks(), saveTask: t => saveTask(t), createTask: o => createTask(o), taskFlow,   // v0.27 company: Work (gigs, hiring, time bank, compute)
  joinProject: (mid, pid) => { const mem = memberById(mid); if (!mem) return; if (Array.isArray(mem.projects) && !mem.projects.includes(pid)) mem.projects.push(pid); P.addMember(pid, mid, P.scoped(mem) ? 'builder' : mem.role); saveMembers(); pushPresence(); rooms.pushProjects(); } });
buildKit = require('./buildkit')({ P, root: require('./tpldir').root(), sense });   // build kit: the open-source stack + quality bar per project kind (server/buildkit.js)
setupFlow = require('./setup')({ P, W, base: baseStore, sense, buildKit, readVision, createTask: o => createTask(o), broadcast, resetHub, getMembers: () => members, siteTpl: () => siteTpl, company: () => companyHub });   // v0.27 company: setup/business   // feat/setup-flow: role flows, Create the repo, Make the starter
const siteDesign = require('./sitedesign')({ base: baseStore, root: require('./tpldir').root(), showcase, siteFlint, P, nameOf, members: () => members, inspo: inspoBoard, postChat: (...a) => postChat(...a), broadcast: m => broadcast(m), tasks: { create: a => createTask(a), save: t => saveTask(t), load: () => loadTasks(), flow: taskFlow } });   // the website designer (server/sitedesign.js, app/ui/sitecfg.js)
const siteLib = require('./sitelib')({ P, W, root: require('./tpldir').root(), getMembers: () => members, broadcast, ensureRepo: (pid, me) => setupFlow.ensureRepo(pid, me), log: m => console.error('  ' + m) });   // website template library (server/sitelib.js)
const flintFree = require('./flintfree')({ P, W, root: require('./tpldir').root(), startersDir: path.join(UI, 'starters'), getMembers: () => members, broadcast, ensureRepo: (pid, me) => setupFlow.ensureRepo(pid, me), siteLib, llmStatus: () => (llm.status ? llm.status() : {}), log: m => console.error('  ' + m) });   // Flint's free tier (server/flintfree.js)
const flintRun = require('./flintrun')({ P, root: baseStore.root, tribe, getMembers: () => members, publicMember, visibleMembers: me => presenceFor(me).map(x => x.id), log: m => console.error('  ' + m) });   // feat/flint-runthrough: proof-of-work ZIPs + the Blender bridge stub (server/flintrun.js)
// v0.27 breakout: one-click Publish to a public play link (with a safety check) and tribe game jams (server/publish.js, server/jam.js)
const visualCard = pid => P.inProject(pid, () => { let best = null; const root = store.p('visuals'); try { for (const d of fs.readdirSync(root)) { let fl = []; try { fl = fs.readdirSync(path.join(root, d)); } catch { continue; } for (const f of fl) if (f.endsWith('.png')) { const full = path.join(root, d, f), t = fs.statSync(full).mtimeMs; if (!best || t > best.t) best = { full, t }; } } } catch {} return best && best.full; });
const publishHub = require('./publish')({ P, W, base: baseStore, preview, setupFlow, getMembers: () => members, broadcast, postChat, approvals, nameOf, visualCard, log: m => console.error('  ' + m),
  baseUrl: () => { const pub = share.publicUrl && share.publicUrl(), lan = (lanUrls().find(u => u.kind === 'lan') || lanUrls()[0] || {}).url; return (pub || lan || `http://localhost:${PORT}`).replace(/\/+$/, ''); } });
publishOnApproval = a => publishHub.onApproval(a);
const jamHub = require('./jam')({ P, W, base: baseStore, setupFlow, publish: publishHub, getMembers: () => members, broadcast, postChat, nameOf });
const widgets = require('./widgets')({ P, store: baseStore, broadcast, preview, showcase, shelf, sense, can: (me, cap, pid) => perms.can(me, cap, pid) });   // feat/sidebar-widgets (server/widgets.js)
const studios = require('./studios')({ P, base: baseStore, root: require('./tpldir').root(), sense, broadcast, buildKit });   // v0.27: Studios — creative apps beside TribeCode, linked not bundled (server/studios.js)
const trending = require('./trending')({ store: baseStore, root: require('./tpldir').root() });   // daily "Trending on GitHub" feed (server/trending.js)
const market = require('./market')({ P, store: baseStore, root: require('./tpldir').root(), approvals, widgets, shelf, docs, inspo: inspoBoard, postChat, nameOf, getMembers: () => members, str, trending });   // v0.27 company: the Marketplace (server/market.js)
const whiteboard = require('./whiteboard')({ P, base: baseStore, broadcast, perms, nameOf, memberColor: mid => (memberById(mid) || {}).color || '#F26B1D' });   // feat/whiteboard: the shared team board (server/whiteboard.js)
const pinsHub = require('./pins')({ P, base: baseStore, broadcast, bus, getMembers: () => members, perms, nameOf, memberColor: mid => (memberById(mid) || {}).color || '#F26B1D' });   // P1-E comment pins + preview presence (server/pins.js)
const designCanvas = require('./canvas')({ P, base: baseStore, broadcast, perms, nameOf, memberColor: mid => (memberById(mid) || {}).color || '#F26B1D' });   // P1-A: the design canvas (server/canvas.js)   // feat/whiteboard: the shared team board (server/whiteboard.js)
const designPlans = require('./designplans')({ P, base: baseStore, broadcast, perms });   // feat/design-flow: each design's plan in .tribe/design-plans (server/designplans.js)
const canvasCode = require('./canvascode')({ P, W, base: baseStore, getMembers: () => members, broadcast, ensureRepo: (pid, me) => setupFlow.ensureRepo(pid, me), log: m => console.error('  ' + m) });   // P1-C: design frame -> HTML/CSS in the project (server/canvascode.js)
const canvasAI = require('./canvasai')({ P, canvas: designCanvas, nameOf, memberColor: mid => (memberById(mid) || {}).color || '#38C6B1', root: require('./tpldir').root(), classify: require('./flintfree').classify, log: m => console.error('  ' + m) });   // P1-F: Flint + agents on the canvas (server/canvasai.js)
const canvasChat = require('./canvaschat')({ P, base: baseStore, broadcast, canvas: designCanvas, nameOf, memberColor: mid => (memberById(mid) || {}).color || '#F26B1D' });   // Flint's Make-style chat beside the Design canvas (server/canvaschat.js)
const company = companyHub = require('./company')({ P, base: baseStore, store, broadcast, postChat, nameOf, perms, getMembers: () => members, approvals, bus, coord, createTask: o => createTask(o), saveTask: t => saveTask(t), loadTasks: () => loadTasks(), docs });   // v0.27 company: seats, goals, decisions, rhythms (server/company.js)
company.useLedger(pid => { const w = ledger.aiWeek(pid); return w.seats.some(x => x.events) ? { spentWeek: w.total, currency: w.currency } : null; });   // v0.27 company: real AI spend from Money (ledger.js) in the weekly review
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
      if (a.take) { const prev = t.assignee; t.assignee = me.id; taskFlow.assigned(t, prev, me); }
      if (a.note) t.body = `${t.body ? t.body + '\n\n' : ''}**${me.name}** · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}: ${str(a.note, 2000)}`;
      t.updated = new Date().toISOString(); t.updatedBy = me.id; return saveTask(t);
    },
  },
  docs, claims, extraTools: { ...agentTools, ...visuals.mcpTools, ...mcpFlow.tools, ...makeWorkshopMcp(workshop, { current: () => P.current() }), ...require('./mcp-preview')(preview, P), ...whiteboard.mcpTools, ...showcase.mcpTools, ...siteDesign.mcpTools, ...captures.mcpTools, ...assetLib.mcpTools, ...company.mcpTools, ...taskFlow.mcpTools, ...ledger.mcpTools, ...seatpilot.mcpTools, ...talent.mcpTools /* v0.27 company */, ...market.mcpTools, ...academy.mcpTools, ...flintMem.mcpTools, ...publishHub.mcpTools, ...jamHub.mcpTools, ...pinsHub.mcpTools, ...buildKit.mcpTools, ...canvasAI.mcpTools }, port: PORT, coordTools: h => ({ ...coord.mcpTools(h), ...agentnet.mcpTools(h), ...ship.mcpTools(h) }),
  chat: {
    post(me, text, channel) {   // feat/chat2: optional channel ("design", "#design"); #general by default
      const tx = str(text, 4000); if (!tx) return; const muted = perms.muteBlock(me); if (muted) throw new Error(muted);   /* feat/roles */
      const ch = channel ? chans.resolve(P.current() || P.defaultId(), channel) : 'general';
      if (!ch) throw new Error(`No channel ${String(channel).slice(0, 40)} in this project.`);
      if (chatx.command(ch, me, tx)) return; postChat(ch, me.id, tx); handleCommands(ch, me, tx);
    },
    approvalAsked: (ap, me) => chatx.approvalAsked(ap, me),   // the agent's request also lands in its owner's chat (✅ approves)
    recent: (n, channel) => store.readJSONL(`chat/${(channel && chans.resolve(P.current() || P.defaultId(), channel)) || 'general'}.jsonl`, n).filter(x => !x.deleted).map(x => {
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
    if (!pid && /^\/api\/(hub|scratch|projects|me|github|oauth)(\/|$)/.test(url.pathname)) pid = P.defaultId();   // these need no project of yours (the list can be empty: every project you were in was deleted)
    if (!pid) return fail(res, wanted ? 403 : 404, wanted ? 'you are not in that project' : 'you are not in any project yet');
  }
  return llm.asCaller(who, () => P.inProject(pid, () => apiInProject(req, res, url)));   // feat/any-llm: friend rules for the shared AI
}
async function apiInProject(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after /api
  const [a, , c] = parts; let b = parts[1]; const m = req.method;
  const ctx = () => ({ m, a, b, c, parts, me, url, readBody, send, fail });
  const me = authed(req);
  const need = () => { if (!me) { fail(res, 401, 'not a member of this tribe'); return false; } return true; };

  if (!req.headers['x-tribe-ping']) lastActivity = Date.now();
  // the sign-in backup: the cookie set when this browser joined or signed in becomes the key again
  // Log out (accounts.js): this browser forgets the sign-in backup cookie, so a reload can't sign it back in
  if (a === 'session' && m === 'DELETE') {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return send(res, 200, { ok: true });
  }
  if (a === 'accounts') return accounts.route(req, res, { b, c, m, readBody, send, fail });
  if (a === 'account' && !b) return accounts.account(req, res, { m, me, readBody, send, fail });   // delete my account (docs/APP-STORE.md), flag-gated   // feature-flagged scaffold (server/accounts.js)
  if (a === 'session' && m === 'GET') {
    const t = cookieToken(req); if (!t) return send(res, 200, { member: null });
    const who = authed({ headers: { authorization: 'Bearer ' + t }, url: '/api/session' });
    if (!who || who.role === 'agent') return send(res, 200, { member: null });
    return send(res, 200, { member: publicMember(who), token: t, tribe });
  }
  // v0.26 Storage & sync (Settings): where this tribe's things live, in plain words. People only; paths for the host.
  if (a === 'storage' && !b && m === 'GET') {
    if (!need()) return; if (me.role === 'agent') return fail(res, 403, 'people only');
    const host = me.role === 'host', cloudHost = !!(process.env.RENDER || process.env.KOYEB_APP_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || CLOUD);
    const remoteOf = repo => { try { const cfg = fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8'); const mm = cfg.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/); return mm ? mm[1].replace(/\/\/[^@/]+@/, '//') : null; } catch { return null; } };
    const projects = P.all().filter(p => P.canSee(me, p.id)).map(p => { const st = (() => { try { return baseStore.readJSON(`projects/${p.id}/repo/settings.json`, null); } catch { return null; } })(); return { id: p.id, name: p.name, hasRepo: !!p.repo, github: p.repo ? remoteOf(p.repo) : null, ...(host && p.repo ? { folder: p.repo } : {}) }; });
    return send(res, 200, { where: cloudHost ? 'cloud' : 'computer', folder: host ? DIR : null, cloudSave: !!(CLOUD && cloudsave.enabled), projects,
      github: (() => { try { const sct = W.readSecret(me.id); return { signedIn: !!sct.githubToken, login: sct.githubLogin || null }; } catch { return { signedIn: false }; } })(),
      browser: 'Your device keeps your settings, drafts and a copy of what you can see so the app opens fast and works offline.' });
  }
  // cloud save: a fresh, empty tribe takes a member's sealed copy back (no setup code needed: the seals prove it came from here)
  if (a === 'cloud' && b === 'restore' && m === 'POST') {
    if (!CLOUD || !cloudsave.enabled) return fail(res, 400, 'cloud save is off');
    if (members.length) return fail(res, 409, 'this tribe is already running; use merge');
    if (limited(req, 6)) return fail(res, 429, 'slow down');
    try { const r = cloudsave.restore(await readBody(req, 6_000_000)); reloadAfterRestore(); broadcast({ type: 'project' }); return send(res, 200, { ...r, members: members.length }); }
    catch (e) { return fail(res, e.status || 400, e.message); }
  }
  if (a === 'cloud' && b === 'copy' && m === 'GET') { if (!need()) return; if (me.role === 'agent') return fail(res, 403, 'people only'); return send(res, 200, cloudsave.copy(me)); }   // Settings › Save a copy
  if (a === 'cloud' && b === 'snapshot' && m === 'GET') {
    if (!need()) return;
    if (!CLOUD) return send(res, 200, { enabled: false });
    return send(res, 200, cloudsave.snapshot(me));
  }
  if (a === 'cloud' && b === 'merge' && m === 'POST') {
    if (!need()) return;
    if (!CLOUD || !cloudsave.enabled) return send(res, 200, { enabled: false });
    if (limited(req, 20)) return fail(res, 429, 'slow down');
    try { const r = cloudsave.merge(await readBody(req, 6_000_000)); if (r.added || r.files) reloadAfterRestore(); return send(res, 200, r); }
    catch (e) { return fail(res, e.status || 400, e.message); }
  }
  if (a === 'health') return send(res, 200, { ok: true, cloud: CLOUD, cloudSave: cloudsave.enabled, version: VERSION, tribe: tribe.name, members: members.length, startedAt: new Date(makePeople.STARTED).toISOString(), uptime: Math.round((Date.now() - makePeople.STARTED) / 1000), site: site.url(),
    ...(me || isLocal(req) ? { lan: [...share.lanEntry(), ...lanUrls()] } : {}),   // fix/security-review: home network and Tailscale addresses only for members and this machine
    ...(isLocal(req) ? { user: (() => { try { return os.userInfo().username; } catch { return undefined; } })() } : {}) });   // the OS user name, only for this machine (zero-step setup)

  if (a === 'media' && b === 'key' && m === 'GET') { const th = tokenHashOf(req); return me && th ? send(res, 200, media.issue(me, th)) : fail(res, 401, 'not a member of this tribe'); }   // fix/security-2: key for signed media links (app/ui/media.js)
  if (a === 'guide') return guide.route(req, res, ctx());   // feat/vision-guide: public, read-only how-to pages (server/guide.js)
  // feat/flint-ai: no tribe yet, on this computer: Flint's how-to answers and your own inspiration board still work (a local you)
  if (a === 'inspo' && b === 'cache' && m === 'GET') return inspoBoard.cache(req, res, c);   // cached openly licensed thumbnails and sound previews, by content hash (public media)
  if (!me && isLocal(req) && ((a === 'flint' && b === 'kb') || (a === 'inspo' && (b === 'search' || url.searchParams.get('board') === 'me')))) {
    const local = { id: 'local', name: 'You', role: 'local' };
    return a === 'flint' ? flintKB.route(req, res, { ...ctx(), me: local }) : inspoBoard.route(req, res, { ...ctx(), me: local });
  }

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

  if (a === 'dev' && b === 'stamp' && m === 'GET' && args.dev) return send(res, 200, { stamp: devStamp, dev: true });   // feat/flint-runthrough: clean-slate live reload (no sign-in needed)
  if (a === 'bootstrap' && m === 'POST') {
    if (members.length) return fail(res, 409, 'tribe already has a host');
    if (!isLocal(req) && limited(req, 5)) return fail(res, 429, 'slow down');
    const body = await readBody(req);
    if (!isLocal(req) && !setupOk(body.setupCode)) return fail(res, 403, CLOUD ? 'That setup code is not right. It is TRIBE_SETUP_CODE in your hosting dashboard (or printed in the server log).' : 'bootstrap only from the host machine');
    const name = str(body.name, 32);
    if (!name) return fail(res, 400, 'name required');
    if (body.tribe) { tribe.name = str(body.tribe, 48) || tribe.name; store.writeJSON('.tribe/tribe.json', tribe); }
    const out = newMember({ name, color: body.color, role: 'host' });
    postChat('general', 'tribecode', `${name} started the tribe 🔥`);
    return send(res, 200, { member: publicMember(out.member), token: out.token, tribe });
  }

  // The desktop app on the host's own computer lost its sign-in (a reinstall, cleared app data) but the tribe is still
  // here: give the host's account a fresh key instead of telling them to join their own tribe. Only from this machine,
  // and only from the desktop app itself or a page this server serves (never another site running on localhost).
  // Start fresh (v0.22, Settings › Fix problems): the host, on this computer only, moves the whole tribe (members,
  // guests, chat, projects, docs, device links) into a sibling backup folder and stops the server. The desktop app
  // starts it again empty, and whoever opens it becomes the host. Nothing is deleted: the backup can be put back.
  if (a === 'host' && b === 'fresh-start' && m === 'POST') {
    if (!me || me.role !== 'host') return fail(res, 403, 'only the host can start fresh');
    if (!isLocal(req) || CLOUD) return fail(res, 403, 'start fresh only from the host computer');
    const body = await readBody(req);
    if (body.confirm !== 'START FRESH') return fail(res, 400, 'type START FRESH to confirm');
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const backup = `${DIR}-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    fs.mkdirSync(backup, { recursive: true });
    const failed = [];
    for (const e of fs.readdirSync(DIR)) { try { fs.renameSync(path.join(DIR, e), path.join(backup, e)); } catch (err) { failed.push(e); } }
    if (failed.length) return fail(res, 500, `Moved most of the tribe to ${backup}, but these were in use: ${failed.join(', ')}. Close other apps using the folder and try again.`);
    console.log(`Start fresh: the old tribe is in ${backup}. Stopping so the app can start an empty one.`);
    send(res, 200, { backup });
    setTimeout(() => process.exit(0), 400);
    return;
  }
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

  // Getting started (focused first run): local-only activation milestones for this tribe, never sent anywhere.
  //   GET /api/activation   people: { firstSeen, firstProject, firstPreview, invited, friendJoined, aiConnected, published, done, total }
  //   POST /api/activation { event }   records the first time (firstProject | firstPreview | invited | published)
  if (a === 'activation') {
    if (!need()) return; if (me.role === 'agent' || me.guest) return fail(res, 403, 'people only');
    const f = '.tribe/activation.json', act = baseStore.readJSON(f, null) || { firstSeen: new Date().toISOString() };
    if (m === 'POST') {
      const body = await readBody(req), ev = str(body.event, 24);
      if (!['firstProject', 'firstPreview', 'invited', 'published'].includes(ev)) return fail(res, 400, 'unknown event');
      if (!act[ev]) { act[ev] = new Date().toISOString(); baseStore.writeJSON(f, act); }
    } else if (m !== 'GET') return fail(res, 405, 'GET or POST');
    if (!baseStore.readJSON(f, null)) baseStore.writeJSON(f, act);
    const host = members.find(x => x.role === 'host'), people = members.filter(x => x.role !== 'agent' && (!host || x.id !== host.id));
    const friend = people.map(x => x.joined || x.created).filter(Boolean).sort()[0] || (people.length ? act.firstSeen : null);
    const agent = members.filter(x => x.role === 'agent').map(x => x.created || x.joined).filter(Boolean).sort()[0] || (members.some(x => x.role === 'agent') ? act.firstSeen : null);
    const view = { ...act, friendJoined: friend || null, aiConnected: agent || null };
    const steps = ['firstPreview', 'invited', 'friendJoined', 'aiConnected', 'published'];
    return send(res, 200, { ...view, steps, done: steps.filter(k => view[k]).length, total: steps.length });
  }
  if (a === 'tribe-link') {
    if (!need()) return; if (me.role === 'agent' || me.guest) return fail(res, 403, 'people only');
    if (m === 'GET') return send(res, 200, tribeLinkView());
    if (m === 'PUT') {
      if (me.role !== 'host') return fail(res, 403, 'only the host changes the tribe link');
      const body = await readBody(req); const t = tribeLink() || {};
      if (typeof body.slug === 'string') { const sl = slug(body.slug).slice(0, 32); if (sl.length < 3) return fail(res, 400, 'use at least 3 letters or numbers'); t.slug = sl; }
      if (typeof body.on === 'boolean') t.on = body.on;
      if (body.renew) { const old = invites.find(i => i.code === t.code); if (old) old.revoked = true; const inv = makeInvite({ by: me.id, hours: 24 * 365, maxUses: 1000 }); inv.tribeLink = true; t.code = inv.code; }
      if (t.on === false) { const old = invites.find(i => i.code === t.code); if (old) old.revoked = true; }
      saveInvites(); baseStore.writeJSON(TL_FILE, t);
      return send(res, 200, tribeLinkView());
    }
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
    const inv = findInvite(str(body.code, 16));
    if (!inv) return fail(res, 410, 'invite expired or invalid');
    // Already a member (signed in on this device): a project invite adds that project instead of making a second account.
    const already = authed(req);
    if (already && already.role !== 'agent') return send(res, 200, { member: publicMember(already), tribe, project: addToProject(already, inv), existing: true });
    const name = str(body.name, 32); if (!name) return fail(res, 400, 'name required');
    const out = joinByInvite(inv, { name, color: body.color });
    return send(res, 200, { member: publicMember(out.member), token: out.token, tribe, project: out.project });
  }

  if (a === 'device-link' || a === 'devices' || a === 'share') {
    const h = await (a === 'share' ? share : devices).route(req, res, { a, b, m, me, tokenHash: tokenHashOf(req), readBody, send, fail, limited });
    if (h !== null) return;
  }

  if (a === 'agents' && b === 'bridge.js') { const h = await agentsHub.route(req, res, ctx()); if (h !== null) return; }   // the stdio bridge (plain code, no secrets)
  if (a === 'approvals') { const h = await approvals.route(req, res, { m, b, c, me, url, readBody, send, fail }); if (h !== null) return; }
  if (a === 'projects' && c === 'website') { if ((await siteFlint.route(req, res, ctx())) !== null) return; const h = await showcase.route(req, res, ctx()); if (h !== null) return; }   // Website (signed preview links need no key)
  if (a === 'oauth') { const h = await oauth.route(req, res, { m, b, c, me, url, readBody, send, fail }); if (h !== null) return; }   // Sign in with Discord/GitHub/Google (server/oauth.js)
  if (a === 'site-library' && parts[2] === 'thumb.png') return siteLib.route(req, res, ctx());   // template thumbnails are public (gallery <img> tags carry no key)
  if (a === 'github' && b === 'detect' && m === 'GET' && !me) { const h = await githubAuth.route(req, res, ctx()); if (h !== null) return; }   // feat/tasks-company: setup on the host computer, before a tribe exists
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

  // Experience modes (v0.20): beginner, intermediate or advanced decides how much of TribeCode each person sees.
  // The host (and admins) pick a starting mode per role; everyone can still change their own in Settings.
  if (a === 'tribe' && b === 'modes' && m === 'PUT') {
    if (!(me.role === 'host' || me.role === 'admin')) return fail(res, 403, 'only the host or an admin sets the starting modes');
    const body = await readBody(req), MODES = ['beginner', 'intermediate', 'advanced'], ROLES = ['admin', 'mod', 'builder', 'spectator', 'guest'];
    const next = {}; for (const r of ROLES) if (MODES.includes(body && body[r])) next[r] = body[r];
    tribe.modes = next; baseStore.writeJSON('.tribe/tribe.json', tribe); broadcast({ type: 'tribe', tribe });
    return send(res, 200, { modes: next });
  }
  // Rename / recolor yourself: friends see it at once (Settings used to change it on this device only).
  if (a === 'me' && !b && m === 'PATCH') {
    if (me.role === 'agent') return fail(res, 403, 'agents keep their names');
    const body = await readBody(req), mem = memberById(me.id);
    const name = body.name !== undefined ? str(body.name, 32) : mem.name; if (!name) return fail(res, 400, 'name required');
    mem.name = name; if (body.color !== undefined) mem.color = color(body.color);
    if (body.mode !== undefined) { if (['beginner', 'intermediate', 'advanced'].includes(body.mode)) mem.mode = body.mode; else delete mem.mode; }   // experience mode follows you to every device
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
  if (a === 'perms') return perms.route(req, res, ctx());   // feat/roles: Settings › Roles & privileges, mutes, audit (server/perms.js)
  if (a === 'ask') return askai.route(req, res, ctx());
  if (a === 'compute' && !b) return compute.route(req, res, ctx());
  if (a === 'shelf') return shelf.route(req, res, ctx());
  if (a === 'assets') return assetLib.route(req, res, ctx());
  if (a === 'inspo') return inspoBoard.route(req, res, ctx());
  if (a === 'talent') return talent.route(req, res, ctx());   // v0.27 company: Work (server/talent.js)
  if (a === 'academy') return academy.route(req, res, ctx());   // v0.27 company: Role Academy + Offload
  if (a === 'legal' || (a === 'projects' && c === 'legal')) return legalDocs.route(req, res, ctx());   // v0.27 company: Legal documents
  if (a === 'assist') return assist.route(req, res, ctx());   // feat/assist
  if (a === 'uploads') return uploads.route(req, res, ctx());
  if (a === 'connections') return connections.route(req, res, ctx());   // feat/mcp-directory: special connections (server/connections.js)
  if (a === 'code') return codeFiles.route(req, res, ctx());   // feat/files-code
  if (a === 'moderation') return moderation.route(req, res, ctx());   // feat/appstore: report, block, filter
  if (a === 'places') return places.route(req, res, { me, send, fail, readBody, b, m });   // feat/presence: where everyone is
  if (a === 'profile') return profiles.route(req, res, ctx(), { visible: mid => presenceFor(me).some(x => x.id === mid) });   // feat/profiles
  if (a === 'channels') return chans.route(req, res, ctx());   // feat/chat2
  if (a === 'embeds') return embeds.route(req, res, ctx());    // feat/chat2
  if (a === 'captures') return captures.route(req, res, ctx());   // feat/captures
  if (a === 'packs') return packs.route(req, res, ctx());   // feat/captures: Settings › Packs (host only)
  if (a === 'gifs') return gifs.route(req, res, ctx());        // feat/chat2
  if (a === 'files') return assetFiles.route(req, res, ctx());   // feat/viewers: repo assets for the 3D / pixel-art viewers
  if (a === 'phoneapp') return phoneapp.route(req, res, ctx());   // feat/viewers: phone app mode
  if (a === 'openspace') return openspace.route(req, res, ctx());
  if (a === 'flow' || a === 'gists' || (a === 'projects' && c === 'roles')) { const h = await flow.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'projects' && c === 'setup') return setupFlow.route(req, res, ctx());
  if (a === 'projects' && c === 'company') return company.route(req, res, ctx());   // v0.27 company (server/company.js)
  if (a === 'site-templates' || (a === 'projects' && c === 'site-template')) return siteTpl.route(req, res, { ...ctx(), str });   // feat/setup-flow (server/setup.js)
  if (a === 'projects' && (c === 'ledger' || c === 'ledger.csv')) return ledger.route(req, res, ctx());   // v0.27 company: Money (server/ledger.js)
  if (a === 'projects' && c === 'seatpilot') return seatpilot.route(req, res, ctx());   // v0.27 company: seat autopilot (server/seatpilot.js)
  if (a === 'projects' && c === 'sense') return sense.route(req, res, ctx());
  if (a === 'site-designer' || (a === 'projects' && (c === 'site-config' || c === 'site-autofill' || c === 'site-comments'))) return siteDesign.route(req, res, { ...ctx(), d: parts[3] });
  if (a === 'site-library' || (a === 'projects' && (c === 'site-library' || c === 'site-data'))) return siteLib.route(req, res, ctx());   // website templates (server/sitelib.js)
  if (a === 'flint' && (b === 'proof' || b === 'blender')) return flintRun.route(req, res, ctx());   // feat/flint-runthrough
  if ((a === 'flint' && (b === 'tiers' || b === 'tier' || b === 'starters')) || (a === 'projects' && c === 'flint')) return flintFree.route(req, res, ctx());   // Flint's free tier: recipes + the capability map (server/flintfree.js)
  if (a === 'buildkit' || (a === 'projects' && c === 'buildkit')) return buildKit.route(req, res, ctx());   // build kit (server/buildkit.js)
  if (a === 'projects' && c === 'studios') return studios.route(req, res, ctx());   // v0.27: Studios (server/studios.js)   // feat/project-sense: GET what the project is + inspiration, PUT the host's override
  if (a === 'pins') return pinsHub.route(req, res, ctx());   // P1-E comment pins (server/pins.js)
  if (a === 'whiteboard') return whiteboard.route(req, res, ctx());   // feat/whiteboard (server/whiteboard.js)
  if (a === 'canvasai') return canvasAI.route(req, res, ctx());
  if (a === 'canvaschat') return canvasChat.route(req, res, ctx());   // Flint's chat on a design file   // P1-F: Flint's free design moves (server/canvasai.js)
  if (a === 'projects' && c === 'design-plans') return designPlans.route(req, res, ctx());   // feat/design-flow
  if (a === 'canvas') return designCanvas.route(req, res, ctx());   // P1-A design canvas   // feat/whiteboard (server/whiteboard.js)
  if (a === 'canvascode') return canvasCode.route(req, res, ctx());   // P1-C send a frame to the app
  if (a === 'market') return market.route(req, res, ctx());   // v0.27 company: the Marketplace (server/market.js)
  if (a === 'projects' && c === 'widgets') { const h = await widgets.route(req, res, ctx()); if (h !== null) return; }   // feat/sidebar-widgets: the sidebar's extra rows (server/widgets.js)
  if (a === 'projects' || (a === 'me' && b === 'git')) { const h = await rooms.route(req, res, { m, a, b, c, parts, me, readBody, send, fail }); if (h !== null) return; }

  if (a === 'invites' && !b && m === 'POST') {
    if (me.role === 'agent') return fail(res, 403, 'agents cannot invite people');
    if (me.role === 'spectator') return fail(res, 403, 'spectators cannot invite people');
    if (!perms.can(me, 'members.invite', P.current())) return fail(res, 403, 'your role cannot invite people');   // feat/roles
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
    const visible = i => me.role === 'host' || perms.atLeast(me, 'admin') || (P.scoped(me) ? !!i.project && P.canSee(me, i.project) : true);
    return send(res, 200, { invites: me.role === 'spectator' ? [] : invites.filter(i => !i.revoked && Date.parse(i.expires) > Date.now() && visible(i)) });
  }
  if (a === 'invites' && b && m === 'DELETE') {
    const inv = invites.find(i => i.code === b);
    if (inv && inv.by !== me.id && me.role !== 'host' && !perms.atLeast(me, 'admin')) return fail(res, 403, 'only the host, an admin or whoever made the invite can revoke it');
    if (inv) { inv.revoked = true; saveInvites(); if (inv.by !== me.id) perms.audit(me, 'invite-revoke', null, { code: inv.code.slice(0, 3) + '…' }); } return send(res, 200, { ok: true });
  }

  if (a === 'dms') return dms.route(req, res, { m, me, send, fail });
  if (a === 'chat' && b) {
    if (b === 'general') b = P.channelOf(P.current());   // #general is the current project's channel
    const chProject = P.byChannel(b); if (chProject && !P.canSee(me, chProject.id)) return fail(res, 403, 'you are not in that project');
    // Only real conversations: a project's channel, a DM, or a project's #agents channel you can see.
    // (Before, any name worked, so a project-only friend could read another project's chat/agents-<id>.jsonl.)
    const agentsOf = /^agents-(.+)$/.exec(b);
    if (chans.isCustom(b) && !chans.canRead(me, b)) return fail(res, 403, 'you are not in that project');   // feat/chat2: created channels
    if (!chProject && !dms.isDm(b) && !chans.isCustom(b) && !(agentsOf && P.get(agentsOf[1]) && P.canSee(me, agentsOf[1]))) return fail(res, 404, 'no such conversation');
    if (m !== 'GET' && chans.archived(b) && !(c === 'react' || c === 'pin')) return fail(res, 403, 'this channel is archived');
    if (!dms.canRead(b, me)) return fail(res, 403, 'this conversation is private');
    if (c) return chatx.route(req, res, { m, ch: b, action: c, arg: parts[3], sub: parts[4], me, readBody, send, fail, url });   // voice, image, send, react, pin, forward, vote…
    if (m === 'GET') {   // ?before=<message id> pages back through history
      const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500), before = str(url.searchParams.get('before') || '', 40);
      return send(res, 200, { messages: store.pageJSONL(`chat/${b}.jsonl`, limit, before ? `"id":${JSON.stringify(before)}` : null) });
    }
    if (m === 'POST') {
      if (me.role === 'spectator') return fail(res, 403, 'spectators can read but not post');
      const muted = perms.muteBlock(me); if (muted) return fail(res, 403, muted);   // feat/roles
      const body = await readBody(req); const text = str(body.text, 4000); if (!text) return fail(res, 400, 'empty message');
      const voted = chatx.command(b, me, text); if (voted) return send(res, 200, { message: voted });   // /vote posts a vote card
      const cid = cidOf(body), dup = !!(cid.cid && cidSeen.has(`${b}:${me.id}:${cid.cid}`));
      const msg = postChat(b, me.id, text, cid); if (!dup) chatx.onPost(b, me, text, msg);   // commands, notifications, @brain, vote hints (not twice for a resend)
      return send(res, 200, { message: msg });
    }
  }

  if (a === 'ship' || (a === 'tasks' && c === 'split')) { const h = await ship.route(req, res, ctx()); if (h !== null) return; }   // feat/ship-flow
  if (a === 'tasks') {
    if (m === 'GET' && !b) return send(res, 200, { tasks: loadTasks() });
    try { const r = await taskFlow.route(m, b, c, me, () => readBody(req)); if (r) return send(res, 200, r); } catch (e) { return fail(res, e.status || 400, e.message); }   // feat/tasks-company
    if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
    if (m === 'POST' && !b) {
      const body = await readBody(req), to = body.assignee && members.some(x => x.id === body.assignee) ? body.assignee : null;
      const no = taskFlow.canAssign(me, to); if (no) return fail(res, 403, no);
      const t = createTask({ ...body, assignee: null, by: me.id, source: 'board' });
      if (!to) return send(res, 200, { task: t });
      t.assignee = to; taskFlow.assigned(t, null, me); return send(res, 200, { task: saveTask(t) });
    }
    const t = b && loadTasks().find(x => x.id === b); if (!t) return fail(res, 404, 'task not found');
    const ownTask = t.by === me.id || t.assignee === me.id || (me.role === 'agent' && (t.by === me.owner || t.assignee === me.owner));
    if ((m === 'PATCH' || m === 'DELETE') && !ownTask && !perms.can(me, 'tasks.triage')) return fail(res, 403, 'your role can only change your own tasks');   // feat/roles
    if (m === 'PATCH') {
      const body = await readBody(req);
      if (body.title !== undefined) t.title = str(body.title, 200) || t.title;
      if (body.status !== undefined) { if (!STATUSES.includes(body.status)) return fail(res, 400, 'bad status'); t.status = body.status; }
      const prevAssignee = t.assignee;
      if (body.assignee !== undefined) {
        const to = body.assignee && members.some(x => x.id === body.assignee) ? body.assignee : null;
        const no = to !== (prevAssignee || null) && taskFlow.canAssign(me, to, t); if (no) return fail(res, 403, no);   // feat/tasks-company: only leads assign others
        t.assignee = to;
      }
      taskFlow.assigned(t, prevAssignee, me);   // pending until the person accepts (taskflow.js notifies them)
      if (body.order !== undefined && Number.isFinite(Number(body.order))) t.order = Number(body.order);
      if (body.body !== undefined) t.body = str(body.body, 20000);
      if (body.due !== undefined) t.due = dueOk(body.due);
      if (body.type !== undefined) { if (TASK_TYPES.includes(body.type)) t.type = body.type; else delete t.type; }   // feat/setup-flow
      if (body.doer !== undefined) { if (TASK_DOERS.includes(body.doer)) t.doer = body.doer; else delete t.doer; }
      // v0.27.2 task drawer: a small checklist and a few labels
      if (body.subtasks !== undefined) { const l = Array.isArray(body.subtasks) ? body.subtasks.slice(0, 30).map(s => ({ t: str(s && s.t, 200), done: !!(s && s.done) })).filter(s => s.t) : []; if (l.length) t.subtasks = l; else delete t.subtasks; }
      if (body.labels !== undefined) { const l = Array.isArray(body.labels) ? [...new Set(body.labels.map(x => str(x, 24).toLowerCase()).filter(Boolean))].slice(0, 6) : []; if (l.length) t.labels = l; else delete t.labels; }
      t.updated = new Date().toISOString(); t.updatedBy = me.id;
      return send(res, 200, { task: saveTask(t) });
    }
    if (m === 'DELETE') { store.remove(taskFile(t)); broadcast({ type: 'task-removed', id: t.id }); return send(res, 200, { ok: true }); }
  }

  if (a === 'ai' && ['basic', 'refine', 'tags', 'extract'].includes(b)) return aiBasics.route(req, res, ctx());   // feat/flint-ai: ✦ refine + file tags
  if (a === 'flint' && b === 'kb') return flintKB.route(req, res, ctx());   // flint-local: how-to answers from the docs, no model (server/flintkb.js)
  if (a === 'flint' && ['memory', 'skills', 'vocab', 'draft', 'learned'].includes(b)) return flintMem.route(req, res, ctx());   // v0.27.1; flint-local: phrases people taught Flint
  if (a === 'import' && b === 'solo') return soloImport.route(req, res, { ...ctx(), isBoss: x => x.role === 'host' || perms.can(x, 'project.create') });   // a phone tribe moves to this host (server/soloimport.js)
  if (a === 'flint') return flint.route(req, res, ctx());   // feat/flint: GET status, POST /ask streams the local model's reply
  if (a === 'look') return look.route(req, res, ctx());   // feat/customize: Settings › Look + the project menu's Customize (server/look.js)
  if (a === 'llm') return llm.route(req, res, ctx());   // feat/any-llm: Settings › Flint's brain (host sets provider + key; key never leaves the host)
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
  if (a === 'agents' && (b === 'hub' || b === 'fleet')) { const h = await agentsHub.route(req, res, ctx()); if (h !== null) return; }   // + the Agent fleet (feat/fleet)   // solo mode: "Your agents" (server/agentshub.js)
  if (a === 'agents' && m === 'POST' && !b) {
    if (me.role === 'spectator' || me.role === 'agent') return fail(res, 403, 'only members can connect agents');
    // Default (no kind/label): the person's one Claude Code agent, as before. With { kind, label }: one more
    // named agent per label (Claude Code · laptop, Claude Desktop, Codex…), each with its own revocable key.
    const body = await readBody(req).catch(() => ({}));
    const kind = makeAgentsHub.KINDS[body.kind] ? body.kind : null, label = str(body.label, 24);
    const multi = !!(label || (kind && kind !== 'claude-code'));
    const kindName = kind ? makeAgentsHub.KINDS[kind].label : 'Claude Code';
    const tool = kind && makeAgentsHub.KINDS[kind].tool;   // feat/any-llm: Codex, Gemini CLI, Qwen Code, Cursor -> "Maya's Codex"
    const name = (tool ? (label ? `${label} · ${me.name}` : `${me.name}'s ${makeAgentsHub.KINDS[kind].short}`) : multi ? `${label || kindName} · ${me.name}` : `Claude · ${me.name}`).slice(0, 32);
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
    return send(res, 200, { agent: { ...publicMember(ag), kind: agentsHub.kindOf(ag), label: ag.label || null }, token, ...ep, tools: mcp.tools, ...(desktop ? { desktop } : {}), setup: agentsHub.setups(agentsHub.kindOf(ag), ep, token) });   // setup: steps + copy blocks per place (feat/any-llm)
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
    return send(res, 200, { ok: true, remove: makeAgentsHub.removeFor(ag && ag.kind) });   // per tool (feat/any-llm)
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
  if (a === 'secretary') { const h = await secretary.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'calls') { const h = await calls.route(req, res, ctx()); if (h !== null) return; }   // voice-video   // the Secretary (server/secretary.js)
  if (a === 'hub' || a === 'dashboard') { const h = await dashboard.route(req, res, ctx()); if (h !== null) return; }   // the Global Hub (server/hub.js)
  if (a === 'scratch') { const h = await scratch.route(req, res, ctx()); if (h !== null) return; }   // private scratchpad (server/scratch.js)
  if (a === 'insights') { const h = await insights.route(req, res, ctx()); if (h !== null) return; }   // AI Insights feed (server/insights.js)
  if (['repo', 'changes', 'context', 'integrations'].includes(a)) {
    const handled = await hubFor(P.current()).route(req, res, { m, a, b, c, me, readBody, send, fail });
    if (handled !== null) return;
  }
  if (a === 'rituals') return rituals.route(req, res, ctx());   // feat/work-company
  if (a === 'calendar') { const h = await plan.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'workshop') { const h = await workshop.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'visuals') { const h = await visuals.route(req, res, ctx()); if (h !== null) return; }
  if (a === 'preview') { const h = await preview.route(req, res, ctx()); if (h !== null) return; }   // app preview links + settings
  if (a === 'publish') { const h = await publishHub.route(req, res, ctx()); if (h !== null) return; }   // v0.27 publish: play links
  if (a === 'jam') { const h = await jamHub.route(req, res, ctx()); if (h !== null) return; }   // v0.27 jams
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

// fix/security-review: the app's own pages can't be framed by other sites (clickjacking), aren't type-sniffed, and don't
// send their URL (join codes, device keys) to other sites as a Referer.
const SAFE_HEADERS = file => ({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  ...(path.extname(file) === '.html' ? { 'Content-Security-Policy': "frame-ancestors 'self' tauri://localhost http://tauri.localhost https://tauri.localhost" } : {}) });
function serveStatic(req, res, url) {
  if (applink.serve(req, res, url)) return;   // /app/<key>/: a project's app for the Home Screen (server/applink.js)
  if (devices.serveApp(req, res, url, UI)) return;
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { return fail(res, 400, 'bad path'); }
  if (rel === '/' ) rel = '/index.html';
  if (/^\/join\/[A-Za-z0-9]+\/?$/.test(rel)) rel = '/join.html';
  const tm = rel.match(/^\/t\/([a-z0-9-]{1,40})\/?$/i);   // v0.26 tribe link: /t/<name> -> this tribe's join page
  if (tm) {
    const t = tribeLink(false);
    if (t && t.on !== false && t.slug === tm[1].toLowerCase() && findInvite(t.code)) { res.writeHead(302, { Location: `/join/${t.code}`, 'Cache-Control': 'no-store' }); return res.end(); }
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...SAFE_HEADERS('x.html') });
    return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TribeCode</title><body style="font:16px system-ui;background:#12151A;color:#E6E9EE;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px"><div style="max-width:420px"><h1 style="font-size:22px">This tribe link isn't active</h1><p style="color:#9AA4B2;line-height:1.6">The host may have renamed it or turned it off. Ask them for the new link.</p></div>`);
  }
  const file = path.resolve(UI, '.' + rel);
  if (!file.startsWith(UI + path.sep)) return fail(res, 403, 'forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return fail(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SAFE_HEADERS(file) });
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
    if (publishHub.match(req, url)) return publishHub.serve(req, res, url);   // /play/<slug>/… public play links (server/publish.js)
    if (req.method === 'POST' && pwaIn.match(url)) return await pwaIn.shareTarget(req, res, url);   // feat/appstore
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
  s.send({ type: 'hello', member: publicMember(me), tribe, members: presenceFor(me), version: VERSION, huddle: huddleProject && !P.canSee(me, huddleProject) ? [] : huddleState(), project: s.project, projects: rooms.listFor(me), places: places.snapshot(me) });
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
    if (msg.type === 'activity' && typeof msg.where === 'string') { const w = msg.where.slice(0, 80); if (w !== o.where) { o.where = w; pushPresence(); } }   // feat/presence: only on change (doc autosaves re-send it)
    if (msg.type === 'place') { places.set(me, s, msg.p); return; }   // feat/presence
    if (msg.type === 'activity' && typeof msg.idle === 'boolean' && !!s.idle !== msg.idle) { const was = idleAll(me.id); s.idle = msg.idle; if (idleAll(me.id) !== was) pushPresence(); }   // feat/profiles: idle after inactivity
    if (msg.type === 'ping') s.send({ type: 'pong', t: msg.t });
    // feat/live-cursors: { type:'cursor', view, x, y } (x, y = 0..1 of the main pane) reaches the others in the same
    // project; { type:'cursor', gone:true } hides it. People only (no agents, no spectators), at most ~20 a second each.
    if (msg.type === 'cursor' && me.role !== 'agent' && me.role !== 'spectator') {
      const now = Date.now(); if (!msg.gone && now - (s.curAt || 0) < 45) return; s.curAt = now;
      const pid = s.project || P.current() || P.defaultId(); if (!P.canSee(me, pid)) return;
      const num = v => Math.max(0, Math.min(1, Number(v) || 0));
      const out = msg.gone ? { type: 'cursor', by: me.id, gone: true } : { type: 'cursor', by: me.id, name: me.name, color: me.color || null, view: String(msg.view || '').slice(0, 40), x: num(msg.x), y: num(msg.y) };
      for (const [mid, o] of online) { if (mid === me.id) continue; const m2 = memberById(mid); if (!m2 || !P.canSee(m2, pid)) continue; for (const so of o.sockets) if (so !== s && (so.project || P.current() || P.defaultId()) === pid) so.send(out); }
      return;
    }
    if (typeof msg.type === 'string' && msg.type.startsWith('doc-')) { docs.live.handle(s, me, msg); return; }
    if (msg.type === 'pin-view') { pinsHub.handle(s, me, msg); return; }   // P1-E: who's looking at the preview, follow a friend
    if (typeof msg.type === 'string' && msg.type.startsWith('wbd-')) { whiteboard.handle(s, me, msg); return; }   // feat/whiteboard: board edits + cursors
    if (typeof msg.type === 'string' && msg.type.startsWith('cnv-')) { designCanvas.handle(s, me, msg); return; }   // P1-A design canvas   // feat/whiteboard: board edits + cursors
    if (dms.handle(s, me, msg) || voice.handle(s, me, msg) || calls.handle(s, me, msg)) return;   // typing, captions, meeting capture
    if (msg.type === 'announce' && typeof msg.text === 'string' && me.role !== 'spectator' && me.role !== 'agent' && !perms.muteBlock(me)) postChat('general', me.id, msg.text.slice(0, 400));   // fix/security-review: same rules as posting
    if (msg.type === 'huddle-join' && me.role !== 'agent' && huddle.size && huddleProject && !P.canSee(me, huddleProject)) s.send({ type: 'huddle-error', error: 'A huddle is on in another project.' });   // fix/security-2
    else if (msg.type === 'huddle-join' && me.role !== 'agent' && !huddle.has(me.id) && !calls.canJoin(me)) s.send({ type: 'call-lobby', waiting: true });   // voice-video: a locked call
    else if (msg.type === 'huddle-join' && me.role !== 'agent') {
      const first = huddle.size === 0;
      if (first || !huddleProject) huddleProject = s.project || P.current() || P.defaultId();   // fix/security-2
      huddle.set(me.id, { muted: !!msg.muted, sharing: false, joined: new Date().toISOString(), socket: s });
      pushHuddle(); if (first) postChat('general', 'tribecode', `🎙️ ${me.name} started a huddle. Jump in from the sidebar.`);
      if (first) bus.notify({ type: 'huddle', priority: 'low', from: me.id, title: `${me.name} started a huddle`, body: 'Jump in from the sidebar.', view: 'home' });
    }
    if (msg.type === 'huddle-leave' && huddle.has(me.id)) { huddle.delete(me.id); pushHuddle(); }
    if (msg.type === 'huddle-state' && huddle.has(me.id)) {
      const h = huddle.get(me.id); h.muted = !!msg.muted; h.sharing = !!msg.sharing;
      if ('deaf' in msg) h.deaf = !!msg.deaf; if ('video' in msg) h.video = !!msg.video;
      if ('hand' in msg) h.hand = msg.hand ? new Date().toISOString() : null;
      if ('cam' in msg) h.cam = str(msg.cam || '', 80) || null; if ('scr' in msg) h.scr = str(msg.scr || '', 80) || null;
      pushHuddle();
    }
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
    places.closed(me, s);   // feat/presence: the last tab takes the place with it, "last seen"
    pushPresence();
  });
});

let devStamp = Date.now();   // feat/flint-runthrough: GET /api/dev/stamp lets a signed-out dev page (scripts/dev/clean-slate.js) live-reload too
function start() {
  // --dev (used by scripts/live.js): open tabs reload when UI files change.
  if (args.dev) {
    let t; try {
      fs.watch(UI, { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => { devStamp = Date.now(); broadcast({ type: 'dev-reload' }); }, 300); });
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
  // Keep-awake (cloud): free hosts sleep after ~15 min without visitors. For a few hours after real use, the server visits
  // its own public address every 10 minutes so an evening's chat doesn't nap mid-conversation. TRIBE_KEEP_AWAKE_HOURS=0 turns it off.
  if (CLOUD) {
    const hours = Number(process.env.TRIBE_KEEP_AWAKE_HOURS ?? 3);
    if (hours > 0) setInterval(() => {
      const url = share.publicUrl(); if (!url || Date.now() - lastActivity > hours * 3600_000) return;
      fetch(url + '/api/health', { headers: { 'x-tribe-ping': '1' } }).catch(() => {});
    }, 10 * 60_000).unref();
  }
  server.listen(PORT, HOST, () => {
    const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
    console.log(`\n  🔥 TribeCode server v${VERSION}  ·  tribe "${tribe.name}"`);
    console.log(`  Folder:   ${store.root}`);
    console.log(`  Open:     http://localhost:${PORT}`);
    if (CLOUD) console.log(`  Cloud:    ${share.publicUrl() || 'your cloud address'} · first visitor claims the tribe with setup code ${members.length ? '(already claimed)' : SETUP_CODE}`);
    if (lan) console.log(`  Friends:  http://${lan.address}:${PORT}  (same network, or use Tailscale)`);
    console.log('');
  });
}
if (require.main === module) start();

module.exports = { server, store, start };
