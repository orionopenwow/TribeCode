// Project rooms: a tribe has projects, and each project is its own room with its own people, chat
// channel, tasks, docs, proposals, calendar, bugs, repo, vision and context.
//
// How scoping works (kept out of the feature modules on purpose):
//  * Every API request, WebSocket message and MCP call runs inside `inProject(pid, fn)` (AsyncLocalStorage).
//  * The store handed to the modules is a project-aware view of the tribe folder:
//      - Markdown records in tasks/, docs/, proposals/, bugs/, calendar/, decisions/ carry a `project`
//        field. Lists and reads only see the current project's records; writes tag new records.
//      - Per-project files (VISION.md, TRIBE_CONTEXT.md, milestones.json, repo/, changes/) live under
//        projects/<id>/ for every project except the first, which keeps the original paths.
//      - chat/general.* means "this project's channel" (the first project's channel is `general`).
//  * Records without a `project` field belong to the first project, so old tribes keep working;
//    migrate() also writes the field into them once (idempotent, nothing is moved or deleted).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');

const TAGGED = new Set(['tasks', 'docs', 'proposals', 'bugs', 'calendar', 'decisions']);
const PER_PROJECT = /^(VISION\.md|TRIBE_CONTEXT\.md|milestones\.json|repo(\/|$)|changes(\/|$)|\.tribe\/context-state\.json$)/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const COLORS = ['#F26B1D', '#38C6B1', '#6C7CFF', '#FFB86B', '#9AE66E', '#E86A92'];
const ROLES = ['host', 'builder', 'spectator'];

module.exports = function projects({ store, tribe, slug, defaultRepo }) {
  const als = new AsyncLocalStorage();
  const FILE = '.tribe/projects.json';
  let list = store.readJSON(FILE, []);
  const save = () => store.writeJSON(FILE, list);

  // ---------- registry ----------
  function ensureFirst() {
    if (list.length) return;
    const name = defaultRepo ? path.basename(defaultRepo) : (tribe.name || 'My Project');
    list.push({ id: slug(name).slice(0, 40) || 'main', name, emoji: '🏕️', color: COLORS[0], channel: 'general', repo: defaultRepo || null, members: {}, created: new Date().toISOString() });
    save();
  }
  ensureFirst();
  // --repo keeps working: it is the first project's repo.
  if (defaultRepo && list[0].repo !== defaultRepo) { list[0].repo = defaultRepo; save(); }

  const all = () => list;
  const get = pid => list.find(p => p.id === pid) || null;
  const defaultId = () => list[0].id;
  const current = () => als.getStore() || null;
  const inProject = (pid, fn) => als.run(pid, fn);
  const channelOf = pid => (get(pid) || list[0]).channel;
  const byChannel = ch => list.find(p => p.channel === ch) || null;
  const pdir = pid => `projects/${pid}`;
  const okId = v => typeof v === 'string' && ID_RE.test(v);

  function uniqueId(name) {
    const base = slug(name).slice(0, 36) || 'project'; let s = base, n = 2;
    while (get(s) || s === 'general') s = `${base}-${n++}`;
    return s;
  }
  function create({ name, emoji, color, repo, workspace, by, role = 'host' }) {
    const nm = String(name || '').trim().slice(0, 48) || 'New project';
    const pid = uniqueId(nm);
    const p = { id: pid, name: nm, emoji: String(emoji || '').slice(0, 4), color: COLORS.includes(color) || /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : COLORS[list.length % COLORS.length],
      channel: `p-${pid}`.slice(0, 32), repo: repo || null, workspace: !!workspace, members: by ? { [by]: role } : {}, created: new Date().toISOString(), by: by || null };
    list.push(p); save();
    fs.mkdirSync(store.p(pdir(pid)), { recursive: true });
    return p;
  }
  function update(pid, patch) {
    const p = get(pid); if (!p) return null;
    if (typeof patch.name === 'string' && patch.name.trim()) p.name = patch.name.trim().slice(0, 48);
    if (typeof patch.emoji === 'string') p.emoji = patch.emoji.slice(0, 4) || p.emoji;
    if (/^#[0-9a-fA-F]{6}$/.test(patch.color || '')) p.color = patch.color;
    if (patch.image === null || patch.image === '') delete p.image;
    else if (typeof patch.image === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(patch.image) && patch.image.length <= 300_000) p.image = patch.image;
    if (typeof patch.bio === 'string') { const b = patch.bio.replace(/\s+/g, ' ').trim().slice(0, 200); if (b) p.bio = b; else delete p.bio; }
    if (patch.repo !== undefined) p.repo = patch.repo;
    if (patch.workspace !== undefined) p.workspace = !!patch.workspace;
    if (typeof patch.hidden === 'boolean') { if (patch.hidden) p.hidden = true; else delete p.hidden; }
    if (typeof patch.huddleSummary === 'boolean') { if (patch.huddleSummary) p.huddleSummary = true; else delete p.huddleSummary; }   // server/huddlesum.js
    save(); return p;
  }
  function remove(pid) { if (pid === defaultId()) return; list = list.filter(p => p.id !== pid); save(); }
  // Delete from the app: off the list, and its tribe data (chat, docs, tasks…) moved to .tribe/trash/<id>-<time> so it can be restored by hand.
  function trash(pid) {
    if (pid === defaultId() || !get(pid)) return false;
    const src = store.p(pdir(pid)), dest = store.p('.tribe', 'trash', `${pid}-${Date.now().toString(36)}`);
    try { if (fs.existsSync(src)) { fs.mkdirSync(require('node:path').dirname(dest), { recursive: true }); fs.renameSync(src, dest); } } catch (e) { console.error('trash project:', e.message); }
    remove(pid); return true;
  }
  function addMember(pid, mid, role = 'builder') {
    const p = get(pid); if (!p || !mid) return;
    if (p.members[mid] === role) return;
    if (!p.members[mid] || role === 'host') { p.members[mid] = ROLES.includes(role) ? role : 'builder'; save(); }
  }

  // ---------- access ----------
  // Tribe-wide members (no `projects` list) see every project; project-scoped friends see only theirs.
  const scoped = m => !!m && Array.isArray(m.projects);
  const canSee = (m, pid) => !!m && !!get(pid) && (!scoped(m) || m.projects.includes(pid));
  // hidden: a project folded away (e.g. the built-in first project once you work elsewhere); it keeps its data and links
  const visibleTo = m => { const v = list.filter(p => canSee(m, p.id)), shown = v.filter(p => !p.hidden); return shown.length ? shown : v; };
  // Which project a request is about: explicit (header/query/argument) if visible, else a sensible default.
  function pick(m, wanted, fallback) {
    if (wanted && get(wanted)) return canSee(m, wanted) ? wanted : null;   // a project that no longer exists (deleted) falls back below
    if (fallback && canSee(m, fallback)) return fallback;
    const v = visibleTo(m); return v.length ? v[0].id : null;
  }

  // ---------- project-aware store ----------
  const baseReadMd = store.readMd.bind(store);
  const dirOf = rel => String(rel).replace(/\\/g, '/').split('/')[0];
  const projectOfMeta = meta => (meta && okId(meta.project) && get(meta.project) ? meta.project : defaultId());
  function mapRel(rel, pid) {
    rel = String(rel).replace(/\\/g, '/');
    if (!pid || pid === defaultId()) return rel;
    if (PER_PROJECT.test(rel)) { ensureDir(pid); return `${pdir(pid)}/${rel}`; }
    if (/^chat\/general(\.|$)/.test(rel)) return rel.replace(/^chat\/general/, `chat/${channelOf(pid)}`);
    return rel;
  }
  const made = new Set();
  function ensureDir(pid) { if (made.has(pid)) return; for (const d of ['repo', 'changes', '.tribe']) fs.mkdirSync(store.p(pdir(pid), d), { recursive: true }); made.add(pid); }
  // getPid: () => project id (defaults to the current request's project).
  function scopedStore(getPid = current) {
    const s = Object.create(store);
    s.p = (...parts) => store.p(mapRel(parts.join('/'), getPid()));
    s.listMd = dir => {
      const files = store.listMd.call(s, dir), pid = getPid();
      if (!pid || !TAGGED.has(dirOf(dir))) return files;
      return files.filter(f => projectOfMeta((baseReadMd(f) || {}).meta) === pid);
    };
    s.readMd = rel => {
      const r = store.readMd.call(s, rel), pid = getPid();
      if (r && pid && TAGGED.has(dirOf(rel)) && projectOfMeta(r.meta) !== pid) return null;
      return r;
    };
    s.writeMd = (rel, meta, body) => {
      if (TAGGED.has(dirOf(rel))) {
        const prev = baseReadMd(mapRel(rel, getPid()));
        const proj = (prev && prev.meta.project && get(prev.meta.project) && prev.meta.project) || (okId(meta.project) && get(meta.project) && meta.project) || getPid() || defaultId();
        meta = { ...meta, project: proj };
      }
      return store.writeMd.call(s, rel, meta, body);
    };
    s.scoped = true;
    return s;
  }

  // ---------- migration: tag untagged records with the first project (idempotent) ----------
  function migrate() {
    let n = 0;
    for (const dir of TAGGED) for (const f of store.listMd(dir)) {
      const r = baseReadMd(f); if (!r || r.meta.project) continue;
      store.writeMd(f, { ...r.meta, project: defaultId() }, r.body); n++;
    }
    return n;
  }

  const view = (p, extra = {}) => p && ({ id: p.id, name: p.name, emoji: p.emoji || '', image: p.image || null, bio: p.bio || '', color: p.color, channel: p.channel, hasRepo: !!p.repo, workspace: !!p.workspace, huddleSummary: !!p.huddleSummary,
    members: Object.entries(p.members || {}).map(([id, role]) => ({ id, role })), created: p.created, default: p.id === defaultId(), ...extra });

  return { als, all, get, defaultId, current, inProject, channelOf, byChannel, okId, create, update, remove, trash, addMember, canSee, visibleTo, pick, scoped,
    scopedStore, migrate, view, pdir, TAGGED };
};
