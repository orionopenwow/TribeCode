// The Workshop: a tribe-wide library of things people and their agents discovered, kept apart from
// projects. Skills (SKILL.md folders), recipes (feature scripts with a check), templates (project
// starters), assets (GLB/glTF, sprites, audio, shaders) and scripts. Plus a read-only view of the
// community shelf: a public GitHub repo served through jsDelivr, and a "donate" flow that prepares a
// contribution bundle and (optionally, with the member's GitHub token) opens a pull request.
//
// Storage (tribe folder, plain files, git-friendly):
//   workshop/items/<id>/workshop.json + the item's files     the library
//   workshop/pending/<pid>/workshop.json + files + pending.json   agent suggestions waiting for a human
//   workshop/usage.json                                       which projects used which item
//   workshop/donations/<id>@<version>/                        ready-to-upload community bundles
//   .tribe/workshop.json                                      { repo } community repo (host setting)
//
// Safety: everything here is treated as untrusted data. Nothing is ever executed or installed; scripts
// are files. File types are allowlisted, sizes are capped, every path is checked for traversal (and
// symlinks are refused), sha256 is verified on publish, on use and on every community download, and
// files are served with nosniff + a sandbox CSP (SVG and unknown types only as downloads).
//
// HTTP (all under /api/workshop, member token required):
//   GET    /items?q=&kind=               library list           GET /items/:id        one item
//   GET    /items/:id/files/<path>       a file (safe headers)  DELETE /items/:id     remove (publisher or host)
//   POST   /items                        publish: { kind,title,summary,tags,license,author,id?,version?,preview?,check?,
//                                          from: { project, paths[] } | files: [{ path, data(base64), sha256? }] }
//                                        humans publish directly; agents create a suggestion a human approves
//   POST   /items/:id/use                { project, dest?, overwrite?, dry? } copy files into a project folder
//   POST   /items/:id/donate             { pr? } community bundle + GitHub links (+ PR with a stored token)
//   GET    /pending                      suggestions; POST /pending/:pid/approve|deny
//   GET    /pending/:pid/files/<path>    look at a suggested file before approving
//   GET    /browse?project=&dir=         list a project folder to pick files from
//   GET    /community[?refresh=1]        community index (empty state when the repo does not exist yet)
//   POST   /community/:id/get            download a community item into the library (verified)
//   GET    /config  PUT /config { repo } community repo (host)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KINDS = ['module', 'skill', 'recipe', 'template', 'asset', 'script'];   // v0.26 'module': a TribeCode add-on (docs/MARKETPLACE.md)
const LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'MIT', 'Apache-2.0'];
const MB = 1024 * 1024;
const LIMITS = { file: 25 * MB, item: 100 * MB, files: 300 };
// ext -> [content type, category]. Categories: image (inline <img>), audio (inline <audio>), model, data,
// text (served as text/plain, never as HTML or JS), download (attachment only: SVG can carry script).
const TEXT = 'text/plain; charset=utf-8';
const TYPES = {
  glb: ['model/gltf-binary', 'model'], gltf: ['model/gltf+json', 'model'], bin: ['application/octet-stream', 'data'],
  png: ['image/png', 'image'], jpg: ['image/jpeg', 'image'], jpeg: ['image/jpeg', 'image'], webp: ['image/webp', 'image'], gif: ['image/gif', 'image'],
  svg: ['application/octet-stream', 'download'],
  ogg: ['audio/ogg', 'audio'], mp3: ['audio/mpeg', 'audio'], wav: ['audio/wav', 'audio'],
  json: [TEXT, 'text'], md: [TEXT, 'text'], txt: [TEXT, 'text'],
  js: [TEXT, 'text'], ts: [TEXT, 'text'], lua: [TEXT, 'text'], gd: [TEXT, 'text'], cs: [TEXT, 'text'], py: [TEXT, 'text'],
  glsl: [TEXT, 'text'], frag: [TEXT, 'text'], vert: [TEXT, 'text'], wgsl: [TEXT, 'text'],
};
const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const SHA_RE = /^[a-f0-9]{64}$/;
const VER_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;   // Windows device names (the host may be Windows)
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.next', '.cache', '.venv', 'venv', '__pycache__', '.trees']);
const err = (status, msg) => Object.assign(new Error(msg), { status });
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const nextVer = v => { const x = String(v).split('.').map(Number); return `${x[0]}.${x[1]}.${x[2] + 1}`; };
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

// A relative path inside an item or a project: no absolute paths, no "..", no .git, no device names.
function safeRel(p) {
  if (typeof p !== 'string' || !p || p.length > 240 || p.includes('\0')) return null;
  const s = p.replace(/\\/g, '/');
  if (s.startsWith('/') || /^[a-zA-Z]:/.test(s)) return null;
  const parts = s.split('/').filter(x => x !== '');
  if (!parts.length || parts.length > 12) return null;
  for (const x of parts) if (x === '.' || x === '..' || x === '.git' || x.length > 100 || /[\x00-\x1f<>:"|?*]/.test(x) || /[. ]$/.test(x) || RESERVED.test(x)) return null;
  return parts.join('/');
}
const extOf = rel => ((String(rel).match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
const typeOf = rel => TYPES[extOf(rel)] || null;

// ---------- previews: image sizes and GLB stats, read from the bytes (zero deps) ----------
function imageSize(buf, ext) {
  try {
    if (ext === 'png' && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (ext === 'gif' && buf.toString('latin1', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if ((ext === 'jpg' || ext === 'jpeg') && buf[0] === 0xff && buf[1] === 0xd8) {
      let p = 2;
      while (p + 9 < buf.length) {
        if (buf[p] !== 0xff) { p++; continue; }
        const mk = buf[p + 1], len = buf.readUInt16BE(p + 2);
        if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return { h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7) };
        p += 2 + len;
      }
    }
    if (ext === 'webp' && buf.toString('latin1', 8, 12) === 'WEBP') {
      const k = buf.toString('latin1', 12, 16);
      if (k === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (k === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
      if (k === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
  } catch {}
  return null;
}
function gltfStats(json) {
  const n = k => (Array.isArray(json[k]) ? json[k].length : 0);
  return { meshes: n('meshes'), nodes: n('nodes'), materials: n('materials'), animations: n('animations'), skins: n('skins'), textures: n('textures'),
    animationNames: (json.animations || []).map(a => String(a && a.name || '')).filter(Boolean).slice(0, 8).map(s => s.slice(0, 40)), generator: String((json.asset || {}).generator || '').slice(0, 60) || undefined };
}
function glbStats(buf) {
  try {
    if (buf.length < 20 || buf.toString('latin1', 0, 4) !== 'glTF') return null;
    const len = buf.readUInt32LE(12), type = buf.toString('latin1', 16, 20);
    if (type !== 'JSON' || len > 8 * MB || 20 + len > buf.length) return null;
    return gltfStats(JSON.parse(buf.toString('utf8', 20, 20 + len)));
  } catch { return null; }
}
function fileInfo(rel, buf) {
  const ext = extOf(rel), t = TYPES[ext];
  if (!t) return undefined;
  if (t[1] === 'image') { const s = imageSize(buf, ext); if (!s || !s.w || !s.h) return undefined; const fr = s.w > s.h && s.w % s.h === 0 && s.w / s.h <= 32 && s.h <= 512 ? s.w / s.h : 0; return { ...s, ...(fr >= 2 ? { frames: fr } : {}) }; }
  if (ext === 'glb') return glbStats(buf) || undefined;
  if (ext === 'gltf') { try { return gltfStats(JSON.parse(buf.toString('utf8'))); } catch { return undefined; } }
  if (t[1] === 'text') return { lines: buf.toString('utf8').split('\n').length };
  return undefined;
}

// Front matter of a SKILL.md ("name:" and "description:"), to fill in a skill's title and summary.
function skillFront(text) {
  const m = String(text).match(/^---\n([\s\S]*?)\n---/); if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
  return out;
}

// ---------- validation of a workshop.json (also used for community items) ----------
function cleanMeta(meta, { requireFiles = false } = {}) {
  const e = [];
  const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const out = {};
  out.kind = KINDS.includes(meta.kind) ? meta.kind : (e.push(`kind must be one of ${KINDS.join(', ')}`), null);
  out.title = s(meta.title, 80) || (e.push('title is required'), '');
  out.summary = s(meta.summary, 400);
  out.tags = (Array.isArray(meta.tags) ? meta.tags : typeof meta.tags === 'string' ? meta.tags.split(',') : [])
    .map(t => String(t).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)).filter(Boolean).slice(0, 12);
  out.tags = [...new Set(out.tags)];
  out.license = LICENSES.includes(meta.license) ? meta.license : (e.push(`license is required: ${LICENSES.join(', ')}`), null);
  out.author = s(meta.author, 64);
  if (meta.version !== undefined && meta.version !== '' && !VER_RE.test(String(meta.version))) e.push('version looks like 1.2.3');
  out.version = VER_RE.test(String(meta.version || '')) ? String(meta.version) : '1.0.0';
  if (meta.id !== undefined && meta.id !== '' && !ID_RE.test(String(meta.id))) e.push('id: lowercase letters, numbers and dashes (2-64)');
  out.id = ID_RE.test(String(meta.id || '')) ? String(meta.id) : null;
  if (meta.preview) { const p = safeRel(meta.preview); if (!p || (typeOf(p) || [])[1] !== 'image') e.push('preview must be a PNG, JPEG, WebP or GIF file of the item'); else out.preview = p; }
  if (meta.check && typeof meta.check === 'object') {
    const c = { kind: ['test', 'screenshot', 'manual'].includes(meta.check.kind) ? meta.check.kind : 'manual', run: s(meta.check.run, 200) || undefined, note: s(meta.check.note, 300) || undefined };
    if (meta.check.file) { const f = safeRel(meta.check.file); if (f) c.file = f; else e.push('check.file is not a safe path'); }
    out.check = c;
  }
  if (requireFiles) {
    if (!Array.isArray(meta.files) || !meta.files.length) e.push('files are required');
    else {
      let total = 0; const seen = new Set();
      out.files = meta.files.slice(0, LIMITS.files + 1).map(f => {
        const p = safeRel(f && f.path);
        if (!p) { e.push(`unsafe path: ${String(f && f.path).slice(0, 80)}`); return null; }
        if (p === 'workshop.json') { e.push('a file cannot be named workshop.json'); return null; }
        if (!typeOf(p)) { e.push(`file type not allowed: ${p}`); return null; }
        if (seen.has(p.toLowerCase())) { e.push(`duplicate file: ${p}`); return null; } seen.add(p.toLowerCase());
        const size = Number(f.size);
        if (!Number.isInteger(size) || size < 0 || size > LIMITS.file) { e.push(`${p}: size over 25 MB or missing`); return null; }
        if (!SHA_RE.test(String(f.sha256 || ''))) { e.push(`${p}: sha256 missing`); return null; }
        total += size; return { path: p, size, sha256: String(f.sha256) };
      }).filter(Boolean);
      if (meta.files.length > LIMITS.files) e.push(`at most ${LIMITS.files} files`);
      if (total > LIMITS.item) e.push('item is over 100 MB');
    }
  }
  return { meta: out, errors: e };
}

module.exports = function workshop({ store, P, approvals, getMembers, nameOf, postChat, broadcast, slug, id, hasToken, readSecret, fetchImpl, now = () => Date.now() }) {
  const ROOT = store.p('workshop');
  for (const d of ['items', 'pending', 'donations']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
  const readme = path.join(ROOT, 'README.md');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, '# Workshop\n\nThe tribe\'s shared library (TribeCode Workshop): skills, recipes, templates, assets and scripts.\nOne folder per item under `items/<id>/` with a `workshop.json` and its files. See docs/WORKSHOP.md in the TribeCode repo.\n');
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const CDN = () => (process.env.TRIBE_WORKSHOP_CDN || 'https://cdn.jsdelivr.net/gh').replace(/\/+$/, '');
  const GH_API = () => (process.env.TRIBE_GITHUB_API || 'https://api.github.com').replace(/\/+$/, '');
  const GH_WEB = 'https://github.com';
  const member = mid => getMembers().find(m => m.id === mid);
  const isHuman = me => me && me.role !== 'agent' && me.role !== 'spectator';
  const notify = () => broadcast({ type: 'workshop' });

  // ---------- config ----------
  const REPO_RE = /^[A-Za-z0-9][\w.-]{0,38}\/[\w.-]{1,100}$/;
  const repo = () => { const r = process.env.TRIBE_WORKSHOP_REPO || (store.readJSON('.tribe/workshop.json', {}) || {}).repo; return REPO_RE.test(r || '') ? r : 'orionopenwow/tribecode-workshop'; };

  // ---------- library on disk ----------
  const itemDir = iid => path.join(ROOT, 'items', iid);
  const readJSONFile = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const loadItem = iid => (ID_RE.test(iid) ? readJSONFile(path.join(itemDir(iid), 'workshop.json')) : null);
  function allItems() {
    let ids = []; try { ids = fs.readdirSync(path.join(ROOT, 'items')).filter(x => ID_RE.test(x)); } catch {}
    return ids.map(loadItem).filter(x => x && x.id);
  }
  const usageFile = path.join(ROOT, 'usage.json');
  const usage = () => readJSONFile(usageFile) || {};
  function addUsage(iid, rec) { const u = usage(); u[iid] = [...(u[iid] || []).filter(x => !(x.project === rec.project && x.dest === rec.dest)), rec].slice(-50); writeAtomic(usageFile, JSON.stringify(u, null, 2)); }
  function writeAtomic(file, text) { const tmp = `${file}.${process.pid}.${id(4)}.tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }

  // Write an item folder (files + workshop.json) to a temp folder, then swap it in.
  function writeFolder(dest, manifest, files) {
    const tmp = path.join(path.dirname(dest), `.tmp-${id(8)}`);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      for (const f of files) {
        const full = path.resolve(tmp, ...f.rel.split('/'));
        if (!full.startsWith(tmp + path.sep)) throw err(400, `unsafe path: ${f.rel}`);
        fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, f.buf);
      }
      fs.writeFileSync(path.join(tmp, 'workshop.json'), JSON.stringify(manifest, null, 2));
      if (fs.existsSync(dest)) { const old = `${dest}.old-${id(6)}`; fs.renameSync(dest, old); fs.renameSync(tmp, dest); fs.rmSync(old, { recursive: true, force: true }); }
      else fs.renameSync(tmp, dest);
    } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
  }

  // Read an item's files back and check every sha256 (catches edits on disk since publishing).
  function readVerified(dir, manifest) {
    const out = [];
    for (const f of manifest.files || []) {
      const rel = safeRel(f.path); if (!rel || !typeOf(rel)) throw err(409, `unsafe file in item: ${f.path}`);
      const full = path.resolve(dir, ...rel.split('/'));
      if (!full.startsWith(dir + path.sep)) throw err(409, `unsafe file in item: ${f.path}`);
      let st; try { st = fs.lstatSync(full); } catch { throw err(409, `missing file: ${rel}`); }
      if (!st.isFile()) throw err(409, `not a regular file: ${rel}`);
      const buf = fs.readFileSync(full);
      if (sha256(buf) !== f.sha256) throw err(409, `${rel} changed since it was published (sha256 mismatch). Publish a new version.`);
      out.push({ rel, buf });
    }
    return out;
  }

  // Validate files ({ rel, buf, sha256? }) and build the manifest.
  function buildManifest(metaIn, files, me, prev) {
    const { meta, errors } = cleanMeta(metaIn);
    if (!files.length) errors.push('pick at least one file');
    if (files.length > LIMITS.files) errors.push(`at most ${LIMITS.files} files`);
    let total = 0; const seen = new Set();
    for (const f of files) {
      const rel = safeRel(f.rel);
      if (!rel) { errors.push(`unsafe path: ${String(f.rel).slice(0, 80)}`); continue; }
      f.rel = rel;
      if (rel === 'workshop.json') errors.push('a file cannot be named workshop.json');
      if (!typeOf(rel)) errors.push(`file type not allowed: ${rel}`);
      if (seen.has(rel.toLowerCase())) errors.push(`duplicate file: ${rel}`); seen.add(rel.toLowerCase());
      if (f.buf.length > LIMITS.file) errors.push(`${rel} is over 25 MB`);
      total += f.buf.length;
      f.sha = sha256(f.buf);
      if (f.sha256 !== undefined && f.sha256 !== f.sha) errors.push(`${rel}: sha256 does not match its bytes`);
    }
    if (total > LIMITS.item) errors.push('the item is over 100 MB');
    if (meta.preview && !files.some(f => f.rel === meta.preview)) errors.push('preview must be one of the item\'s files');
    if (errors.length) throw err(400, errors.slice(0, 6).join('; '));
    // Skills: a SKILL.md's front matter fills in what was left out.
    const skill = files.find(f => /(^|\/)SKILL\.md$/i.test(f.rel));
    if (skill && meta.kind === 'skill' && !meta.summary) meta.summary = String(skillFront(skill.buf.toString('utf8')).description || '').slice(0, 400);
    const preview = meta.preview || (files.find(f => (typeOf(f.rel) || [])[1] === 'image' && /preview|poster|thumb|cover/i.test(f.rel)) || files.find(f => (typeOf(f.rel) || [])[1] === 'image') || {}).rel;
    const at = new Date(now()).toISOString();
    let version = meta.version;
    if (prev) {
      if (!metaIn.version || cmpVer(version, prev.version) <= 0) version = nextVer(prev.version);
    }
    return {
      schema: 1, id: meta.id, kind: meta.kind, title: meta.title, summary: meta.summary, tags: meta.tags, license: meta.license,
      author: meta.author || (me ? (me.role === 'agent' && member(me.owner) ? `${nameOf(me.owner)}'s Claude` : me.name) : ''), version,
      files: files.map(f => ({ path: f.rel, size: f.buf.length, sha256: f.sha, info: fileInfo(f.rel, f.buf) })).sort((a, b) => a.path.localeCompare(b.path)),
      preview: preview || undefined, check: meta.check,
      created: prev ? prev.created : at, updated: at, by: me ? me.id : null,
      history: [...((prev && prev.history) || []), { version, at, by: me ? me.id : null }].slice(-30),
    };
  }

  // ---------- collecting files from a project folder ----------
  function projectRoot(pid) {
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    if (!p.repo) throw err(400, 'that project has no folder on the host yet');
    try { return fs.realpathSync(p.repo); } catch { throw err(400, 'the project folder is missing on the host'); }
  }
  const inside = (root, full) => full === root || full.startsWith(root + path.sep);
  function collect(pid, paths) {
    const root = projectRoot(pid);
    if (!Array.isArray(paths) || !paths.length) throw err(400, 'pick at least one file or folder');
    const picked = [], skipped = [];
    let total = 0;
    const add = (full, rel, size) => { total += size; if (size > LIMITS.file) throw err(413, `${rel} is over 25 MB`); if (total > LIMITS.item) throw err(413, 'that is over 100 MB'); if (picked.length >= LIMITS.files) throw err(413, `at most ${LIMITS.files} files`); picked.push({ full, rel }); };
    function walk(dir, rel, depth) {
      if (depth > 10) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = `${rel}/${ent.name}`;
        if (ent.isSymbolicLink()) { skipped.push(r); continue; }
        if (ent.isDirectory()) { if (!SKIP.has(ent.name) && !ent.name.startsWith('.')) walk(path.join(dir, ent.name), r, depth + 1); else skipped.push(r + '/'); continue; }
        if (!ent.isFile()) continue;
        if (!typeOf(r) || !safeRel(r) || ent.name === 'workshop.json') { skipped.push(r); continue; }
        add(path.join(dir, ent.name), r, fs.statSync(path.join(dir, ent.name)).size);
      }
    }
    for (const raw of paths.slice(0, 200)) {
      const rel = safeRel(raw); if (!rel) throw err(400, `unsafe path: ${String(raw).slice(0, 80)}`);
      const full = path.join(root, ...rel.split('/'));
      let st; try { st = fs.lstatSync(full); } catch { throw err(404, `not in the project: ${rel}`); }
      if (st.isSymbolicLink()) throw err(400, `${rel} is a link; pick the real file`);
      let real; try { real = fs.realpathSync(full); } catch { throw err(404, `not in the project: ${rel}`); }
      if (!inside(root, real) || real === root) throw err(400, `unsafe path: ${rel}`);
      if (st.isDirectory()) walk(full, rel, 0);
      else if (st.isFile()) { if (!typeOf(rel)) throw err(415, `${rel}: that file type is not allowed in the Workshop`); add(full, rel, st.size); }
    }
    if (!picked.length) throw err(400, 'none of those files can go in the Workshop (allowed: models, images, audio, text and code)');
    // Paths inside the item are relative to the common folder of what was picked.
    const dirs = picked.map(f => f.rel.split('/').slice(0, -1));
    let common = dirs[0];
    for (const d of dirs) { let i = 0; while (i < common.length && i < d.length && common[i] === d[i]) i++; common = common.slice(0, i); }
    const files = picked.map(f => ({ rel: f.rel.split('/').slice(common.length).join('/'), buf: fs.readFileSync(f.full) }));
    return { files, skipped, base: common.join('/') };
  }

  function browse(pid, dirRel) {
    const root = projectRoot(pid);
    const rel = dirRel ? safeRel(dirRel) : '';
    if (rel === null) throw err(400, 'unsafe path');
    const dir = rel ? path.join(root, ...rel.split('/')) : root;
    let real; try { real = fs.realpathSync(dir); } catch { throw err(404, 'folder not found'); }
    if (!inside(root, real)) throw err(400, 'unsafe path');
    const entries = fs.readdirSync(real, { withFileTypes: true })
      .filter(e => !e.isSymbolicLink() && (e.isDirectory() ? !SKIP.has(e.name) && !e.name.startsWith('.') : e.isFile()))
      .map(e => { const p = rel ? `${rel}/${e.name}` : e.name; const d = e.isDirectory(); let size = 0; if (!d) try { size = fs.statSync(path.join(real, e.name)).size; } catch {} return { name: e.name, path: p, dir: d, size: d ? undefined : size, allowed: d || (!!typeOf(p) && size <= LIMITS.file) }; })
      .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name)).slice(0, 500);
    return { project: pid, dir: rel, entries };
  }

  // ---------- publish / suggestions ----------
  function uploadFiles(list) {
    if (!Array.isArray(list) || !list.length) throw err(400, 'no files');
    if (list.length > LIMITS.files) throw err(413, `at most ${LIMITS.files} files`);
    return list.map(f => {
      const rel = safeRel(f && f.path); if (!rel) throw err(400, `unsafe path: ${String(f && f.path).slice(0, 80)}`);
      if (!typeOf(rel)) throw err(415, `${rel}: that file type is not allowed in the Workshop`);
      return { rel, buf: Buffer.from(String(f.data || ''), 'base64'), sha256: f.sha256 !== undefined ? String(f.sha256).toLowerCase() : undefined };
    });
  }
  function uniqueId(base) { let s = base.slice(0, 60) || 'item', n = 2; while (fs.existsSync(itemDir(s))) s = `${base.slice(0, 56)}-${n++}`; return s; }
  const canEdit = (it, me) => !!me && (me.role === 'host' || it.by === me.id || (me.role === 'agent' && it.by === me.owner));

  function publish(body, me) {
    if (!me || me.role === 'spectator') throw err(403, 'spectators can browse the Workshop but not add to it');
    let files, source;
    if (body.from && body.from.project) {
      if (!P.canSee(me, body.from.project)) throw err(403, 'you are not in that project');
      const c = collect(body.from.project, body.from.paths);
      files = c.files; source = { type: 'project', project: body.from.project, base: c.base || undefined, skipped: c.skipped.length || undefined };
    } else { files = uploadFiles(body.files); source = { type: 'upload' }; }
    const wantId = body.id && ID_RE.test(String(body.id)) ? String(body.id) : slug(String(body.title || '')).slice(0, 60);
    if (!ID_RE.test(wantId)) throw err(400, 'give it a title');
    const prev = loadItem(wantId);
    const bump = prev && canEdit(prev, me) && (body.id === wantId || body.bump);
    const iid = bump ? wantId : (prev ? uniqueId(wantId) : wantId);
    const manifest = buildManifest({ ...body, id: iid }, files, me, bump ? prev : null);
    manifest.source = source;
    if (me.role === 'agent') return suggest(manifest, files, me);
    writeFolder(itemDir(iid), manifest, files);
    notify();
    return { item: view(manifest, me), bumped: !!bump };
  }

  // Agents never publish straight into the tribe library: a human approves (server/approvals.js).
  const pendDir = pid => path.join(ROOT, 'pending', pid);
  function suggest(manifest, files, me) {
    const pid = `s-${now().toString(36)}-${id(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
    const total = manifest.files.reduce((n, f) => n + f.size, 0);
    const ap = approvals.create({ title: `Add "${manifest.title}" to the Workshop`, risk: 'medium', kind: 'workshop-publish',
      details: `${manifest.kind} · ${manifest.license} · ${manifest.files.length} file${manifest.files.length === 1 ? '' : 's'} (${fmtSize(total)})\n${manifest.files.slice(0, 12).map(f => '- ' + f.path).join('\n')}${manifest.summary ? '\n\n' + manifest.summary : ''}\n\nReview it in the Workshop. Nothing is run; these are files.` }, me);
    writeFolder(pendDir(pid), manifest, files);
    writeAtomic(path.join(pendDir(pid), 'pending.json'), JSON.stringify({ id: pid, approval: ap.id, by: me.id, project: P.current() || null, at: new Date(now()).toISOString() }, null, 2));
    notify();
    if (ap.status === 'approved') sweep();
    return { pending: true, suggestion: pid, approval: ap.id, status: ap.status, askedOf: ap.toNames };
  }
  function pendingList() {
    let ids = []; try { ids = fs.readdirSync(path.join(ROOT, 'pending')).filter(x => /^s-[a-z0-9-]+$/.test(x)); } catch {}
    return ids.map(pid => { const p = readJSONFile(path.join(pendDir(pid), 'pending.json')); const m = readJSONFile(path.join(pendDir(pid), 'workshop.json')); return p && m ? { ...p, manifest: m } : null; }).filter(Boolean);
  }
  // Settle suggestions whose approval was decided (in the Workshop, the inbox, a phone button…).
  function sweep() {
    let changed = false;
    for (const s of pendingList()) {
      const ap = approvals.get(s.approval);
      if (!ap || ap.status === 'denied') { fs.rmSync(pendDir(s.id), { recursive: true, force: true }); changed = true; continue; }
      if (ap.status !== 'approved') continue;
      try {
        const files = readVerified(pendDir(s.id), s.manifest);
        const agent = member(s.by), prev = loadItem(s.manifest.id);
        const bump = prev && agent && canEdit(prev, agent);
        const iid = bump ? s.manifest.id : prev ? uniqueId(s.manifest.id) : s.manifest.id;
        const m = { ...s.manifest, id: iid, approvedBy: ap.decidedBy, updated: new Date(now()).toISOString() };
        if (bump) { if (cmpVer(m.version, prev.version) <= 0) m.version = nextVer(prev.version); m.created = prev.created; m.history = [...(prev.history || []), { version: m.version, at: m.updated, by: s.by }].slice(-30); }
        writeFolder(itemDir(iid), m, files);
        if (s.project && P.get(s.project)) P.inProject(s.project, () => postChat('general', 'tribecode', `📦 **${m.title}** is in the Workshop (suggested by ${nameOf(s.by)}, approved by ${nameOf(ap.decidedBy)})`));
      } catch (e) { console.error('  workshop: could not publish suggestion ' + s.id + ': ' + e.message); }
      fs.rmSync(pendDir(s.id), { recursive: true, force: true }); changed = true;
    }
    if (changed) notify();
  }
  const sweeper = setInterval(sweep, 2000); sweeper.unref();

  function remove(iid, me) {
    const it = loadItem(iid); if (!it) throw err(404, 'not in the Workshop');
    if (!canEdit(it, me) || me.role === 'agent') throw err(403, 'only the person who added it (or the host) can remove it');
    fs.rmSync(itemDir(iid), { recursive: true, force: true }); notify();
    return { ok: true };
  }

  // ---------- use in a project: copy files, never run anything ----------
  function use(iid, body, me) {
    if (!me || me.role === 'spectator') throw err(403, 'spectators can browse but not change projects');
    const it = loadItem(iid); if (!it) throw err(404, 'not in the Workshop');
    const pid = String(body.project || P.current() || '');
    if (!P.get(pid) || !P.canSee(me, pid)) throw err(403, 'you can only use Workshop items in projects you are in');
    const root = projectRoot(pid);
    const dest = safeRel(body.dest || `workshop/${iid}`); if (!dest) throw err(400, 'that folder is not a safe path inside the project');
    const destAbs = path.join(root, ...dest.split('/'));
    // Every folder that already exists on the way must be a real folder inside the project (no links out).
    let probe = destAbs;
    while (!fs.existsSync(probe)) probe = path.dirname(probe);
    let real; try { real = fs.realpathSync(probe); } catch { throw err(400, 'unsafe destination'); }
    if (!inside(root, real)) throw err(400, 'that folder leads outside the project');
    const plan = it.files.map(f => ({ ...f, to: `${dest}/${f.path}`, full: path.join(destAbs, ...f.path.split('/')) }));
    const conflicts = plan.filter(f => { try { fs.lstatSync(f.full); return true; } catch { return false; } }).map(f => f.to);
    const summary = { item: { id: it.id, title: it.title, version: it.version, kind: it.kind }, project: pid, dest, license: it.license, author: it.author,
      files: plan.map(f => ({ path: f.to, size: f.size })), conflicts, note: 'Files are copied into the project folder. Nothing is run or installed.' };
    if (body.dry) return { ...summary, dry: true };
    if (conflicts.length && !body.overwrite) throw Object.assign(err(409, `${conflicts.length} file${conflicts.length === 1 ? '' : 's'} already there (${conflicts.slice(0, 3).join(', ')}). Pick another folder or overwrite.`), { conflicts });
    const files = readVerified(itemDir(iid), it);
    for (const f of plan) {
      try { const st = fs.lstatSync(f.full); if (!st.isFile()) throw err(409, `${f.to} is not a regular file; not touching it`); } catch (e) { if (e.status) throw e; }
      fs.mkdirSync(path.dirname(f.full), { recursive: true });
      const r = fs.realpathSync(path.dirname(f.full)); if (!inside(root, r)) throw err(400, 'that folder leads outside the project');
      fs.writeFileSync(f.full, files.find(x => x.rel === f.path).buf);
    }
    addUsage(iid, { project: pid, dest, version: it.version, by: me.id, at: new Date(now()).toISOString() });
    P.inProject(pid, () => postChat('general', 'tribecode', `📦 ${me.name} added **${it.title}** ${it.version} from the Workshop to \`${dest}/\` (${it.license})`));
    notify();
    return { ...summary, copied: plan.length };
  }

  // ---------- views ----------
  const fmtSize = n => (n >= MB ? `${(n / MB).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
  function view(it, me) {
    const u = (usage()[it.id] || []).filter(x => P.get(x.project) && P.canSee(me, x.project));
    const used = [...new Map(u.map(x => [x.project, x])).values()].map(x => { const p = P.get(x.project); return { project: p.id, name: p.name, emoji: p.emoji || '', at: x.at, dest: x.dest }; });
    const { history, ...rest } = it;
    return { ...rest, size: (it.files || []).reduce((n, f) => n + f.size, 0), byName: it.by ? nameOf(it.by) : null, usedIn: used, versions: (history || []).length, canEdit: canEdit(it, me) && me.role !== 'agent' };
  }
  function search(items, q, kind) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    return items.filter(it => (!kind || it.kind === kind) && words.every(w => [it.id, it.title, it.summary, it.author, ...(it.tags || []), ...(it.files || []).map(f => f.path)].join(' ').toLowerCase().includes(w)))
      .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  }
  const list = (me, q, kind) => search(allItems(), q, KINDS.includes(kind) ? kind : '').map(it => view(it, me));

  // ---------- community: read-only index over the open-source CDN ----------
  const cdnUrl = (r, rel) => `${CDN()}/${r}@main/${rel.split('/').map(encodeURIComponent).join('/')}`;
  async function fetchCapped(url, max, opts = {}) {
    let res;
    try { res = await doFetch(url, { redirect: 'follow', signal: AbortSignal.timeout(opts.timeout || 20000), headers: opts.headers || {} }); }
    catch (e) { throw Object.assign(err(502, `could not reach ${new URL(url).host}`), { offline: true }); }
    if (!res.ok) throw Object.assign(err(res.status === 404 ? 404 : 502, `${new URL(url).host} answered ${res.status}`), { http: res.status });
    const len = Number(res.headers.get('content-length') || 0);
    if (len > max) throw err(413, 'file is larger than allowed');
    const chunks = []; let size = 0;
    if (res.body && res.body.getReader) {
      const rd = res.body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; size += value.length; if (size > max) { try { rd.cancel(); } catch {} throw err(413, 'file is larger than allowed'); } chunks.push(Buffer.from(value)); }
    } else { const b = Buffer.from(await res.arrayBuffer()); if (b.length > max) throw err(413, 'file is larger than allowed'); chunks.push(b); }
    return Buffer.concat(chunks);
  }
  let cache = null;
  async function community(refresh) {
    const r = repo();
    if (!refresh && cache && cache.repo === r && now() - cache.at < 5 * 60_000) return cache.data;
    let data;
    try {
      const raw = await fetchCapped(cdnUrl(r, 'index.json'), 4 * MB);
      let idx; try { idx = JSON.parse(raw.toString('utf8')); } catch { throw err(502, 'index.json is not valid JSON'); }
      const items = [], rejected = [];
      for (const e of (Array.isArray(idx.items) ? idx.items : []).slice(0, 2000)) {
        const { meta, errors } = cleanMeta(e || {}, { requireFiles: true });
        if (errors.length || !meta.id) { rejected.push({ id: String((e && e.id) || '?').slice(0, 64), why: errors[0] || 'missing id' }); continue; }
        const preview = meta.preview && meta.files.some(f => f.path === meta.preview) ? meta.preview : undefined;
        items.push({ ...meta, preview, previewUrl: preview ? cdnUrl(r, `items/${meta.id}/${preview}`) : null, size: meta.files.reduce((n, f) => n + f.size, 0),
          info: e.info && typeof e.info === 'object' ? { frames: Math.min(32, Number(e.info.frames) || 0) || undefined, w: Math.min(8192, Number(e.info.w) || 0) || undefined, h: Math.min(8192, Number(e.info.h) || 0) || undefined } : undefined, inLibrary: !!loadItem(meta.id) });
      }
      data = { repo: r, available: true, updated: typeof idx.updated === 'string' ? idx.updated.slice(0, 40) : null, items, rejected, cdn: cdnUrl(r, '') };
    } catch (e) {
      data = { repo: r, available: false, items: [], reason: e.http === 404 || e.status === 404 ? 'missing' : e.offline ? 'offline' : 'invalid', message: e.message, cdn: cdnUrl(r, '') };
    }
    cache = { repo: r, at: now(), data };
    return data;
  }
  // Download one community item into the tribe library: every file is size-capped, type-checked,
  // path-checked and sha256-verified against workshop.json AND the index entry before anything is written.
  async function getCommunity(iid, me) {
    if (!isHuman(me)) throw err(403, 'only teammates can bring community items into the tribe library');
    if (!ID_RE.test(iid)) throw err(400, 'bad id');
    const c = await community(true);
    if (!c.available) throw err(404, 'the community shelf is not reachable');
    const entry = c.items.find(x => x.id === iid); if (!entry) throw err(404, 'not on the community shelf');
    let manifestRaw; try { manifestRaw = JSON.parse((await fetchCapped(cdnUrl(c.repo, `items/${iid}/workshop.json`), 256 * 1024)).toString('utf8')); } catch (e) { throw err(e.status === 413 ? 413 : 502, `workshop.json: ${e.message}`); }
    const { meta, errors } = cleanMeta(manifestRaw, { requireFiles: true });
    if (errors.length) throw err(422, `rejected: ${errors.slice(0, 3).join('; ')}`);
    if (meta.id !== iid) throw err(422, 'rejected: workshop.json id does not match');
    for (const f of meta.files) { const e2 = entry.files.find(x => x.path === f.path); if (!e2 || e2.sha256 !== f.sha256) throw err(422, `rejected: ${f.path} does not match the index`); }
    const prev = loadItem(iid);
    if (prev && !(prev.source && prev.source.type === 'community' && prev.source.repo === c.repo)) throw err(409, 'the tribe library already has a different item with that id');
    const files = [];
    for (const f of meta.files) {
      const buf = await fetchCapped(cdnUrl(c.repo, `items/${iid}/${f.path}`), Math.min(f.size, LIMITS.file));
      if (buf.length !== f.size) throw err(422, `rejected: ${f.path} has the wrong size`);
      if (sha256(buf) !== f.sha256) throw err(422, `rejected: ${f.path} failed the sha256 check (tampered or changed)`);
      files.push({ rel: f.path, buf, sha256: f.sha256 });
    }
    const m = buildManifest({ ...meta, id: iid }, files, me, null);
    Object.assign(m, { author: meta.author || 'community', version: meta.version, source: { type: 'community', repo: c.repo, version: meta.version, at: new Date(now()).toISOString() } });
    writeFolder(itemDir(iid), m, files);
    notify();
    return { item: view(m, me) };
  }

  // ---------- donate to the community ----------
  const publicManifest = it => ({ schema: 1, id: it.id, kind: it.kind, title: it.title, summary: it.summary, tags: it.tags, license: it.license, author: it.author, version: it.version,
    files: it.files.map(f => ({ path: f.path, size: f.size, sha256: f.sha256 })), preview: it.preview, check: it.check });
  async function donate(iid, body, me) {
    if (!isHuman(me)) throw err(403, 'only people donate to the community (agents can suggest, a human decides)');
    const it = loadItem(iid); if (!it) throw err(404, 'not in the Workshop');
    if (!LICENSES.includes(it.license)) throw err(400, 'pick an open license first');
    const files = readVerified(itemDir(iid), it);
    const pm = publicManifest(it), r = repo();
    const entry = { ...pm, path: `items/${it.id}`, size: it.files.reduce((n, f) => n + f.size, 0) };
    const bdir = path.join(ROOT, 'donations', `${it.id}@${it.version}`);
    writeFolder(path.join(bdir, 'items', it.id), pm, files);
    writeAtomic(path.join(bdir, 'index-entry.json'), JSON.stringify(entry, null, 2));
    const links = {
      repo: `${GH_WEB}/${r}`, fork: `${GH_WEB}/${r}/fork`,
      upload: `${GH_WEB}/${r}/upload/main/items/${it.id}`,
      manifest: `${GH_WEB}/${r}/new/main?filename=${encodeURIComponent(`items/${it.id}/workshop.json`)}&value=${encodeURIComponent(JSON.stringify(pm, null, 2))}`,
    };
    const instructions = [
      `Donate "${it.title}" ${it.version} (${it.license}) to ${r}:`,
      `1. Open ${links.upload}`,
      `   GitHub offers to fork the repo for you if you can't push to it.`,
      `2. Drag in every file from the bundle folder items/${it.id}/ (workshop.json and ${it.files.length} file${it.files.length === 1 ? '' : 's'}).`,
      `3. Choose "Create a new branch and start a pull request", then Propose changes.`,
      `The repo's check validates workshop.json, sha256, sizes and file types, and rebuilds index.json after merge.`,
    ].join('\n');
    const out = { bundle: { folder: `workshop/donations/${it.id}@${it.version}`, path: me.role === 'host' ? bdir : undefined, files: [{ path: `items/${it.id}/workshop.json` }, ...it.files.map(f => ({ path: `items/${it.id}/${f.path}`, size: f.size }))] },
      indexEntry: entry, links, instructions, repo: r, canPr: !!(hasToken && hasToken(me.id)) };
    if (body.pr) out.pr = await openPr(it, pm, files, me, r);
    return out;
  }
  async function gh(method, p, token, body) {
    let res;
    try {
      res = await doFetch(GH_API() + p, { method, signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'TribeCode-Workshop', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw err(502, 'could not reach GitHub'); }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
  async function openPr(it, pm, files, me, r) {
    const token = readSecret && (readSecret(me.id) || {}).githubToken;
    if (!token) throw err(400, 'save a GitHub token in Settings first, or use the upload link');
    const must = (x, what) => { if (x.status >= 300) throw err(502, `GitHub ${what}: ${String((x.data && x.data.message) || x.status).slice(0, 160)}`); return x.data; };
    const user = must(await gh('GET', '/user', token), 'sign-in');
    const up = must(await gh('GET', `/repos/${r}`, token), 'repo');
    const base = up.default_branch || 'main';
    const head = must(await gh('GET', `/repos/${r}/git/ref/heads/${encodeURIComponent(base)}`, token), 'branch');
    const fork = must(await gh('POST', `/repos/${r}/forks`, token, { default_branch_only: true }), 'fork');
    const forkName = fork.full_name || `${user.login}/${r.split('/')[1]}`;
    for (let i = 0; i < 10; i++) { const f = await gh('GET', `/repos/${forkName}`, token); if (f.status === 200) break; await new Promise(z => setTimeout(z, 1500)); }
    const branch = `workshop/${it.id}-${it.version}`.replace(/[^\w./-]/g, '-');
    const ref = await gh('POST', `/repos/${forkName}/git/refs`, token, { ref: `refs/heads/${branch}`, sha: head.object.sha });
    if (ref.status >= 300 && ref.status !== 422) must(ref, 'branch');
    const put = async (rel, buf) => {
      const p = `/repos/${forkName}/contents/${rel.split('/').map(encodeURIComponent).join('/')}`;
      const cur = await gh('GET', `${p}?ref=${encodeURIComponent(branch)}`, token);
      must(await gh('PUT', p, token, { message: `Workshop: ${it.title} ${it.version}`, content: buf.toString('base64'), branch, ...(cur.status === 200 && cur.data.sha ? { sha: cur.data.sha } : {}) }), `upload ${rel}`);
    };
    await put(`items/${it.id}/workshop.json`, Buffer.from(JSON.stringify(pm, null, 2) + '\n'));
    for (const f of files) await put(`items/${it.id}/${f.rel}`, f.buf);
    const pr = await gh('POST', `/repos/${r}/pulls`, token, { title: `Add ${it.title} ${it.version} (${it.kind}, ${it.license})`, head: `${user.login}:${branch}`, base,
      body: `${it.summary || ''}\n\n- kind: ${it.kind}\n- license: ${it.license}\n- author: ${it.author}\n- files: ${it.files.length}\n\nDonated from a TribeCode Workshop.` });
    if (pr.status === 422 && /already exists/i.test(JSON.stringify(pr.data))) return { url: `${GH_WEB}/${r}/pulls`, branch, existing: true };
    const d = must(pr, 'pull request');
    return { url: d.html_url, number: d.number, branch };
  }

  // ---------- serving files ----------
  function serveFile(res, dir, manifest, rel, send) {
    const f = rel && (manifest.files || []).find(x => x.path === rel);
    const t = f && typeOf(rel);
    if (!f || !t) return send(res, 404, { error: 'not found' });
    const full = path.resolve(dir, ...rel.split('/'));
    if (!full.startsWith(dir + path.sep)) return send(res, 404, { error: 'not found' });
    let st; try { st = fs.lstatSync(full); } catch { return send(res, 404, { error: 'not found' }); }
    if (!st.isFile()) return send(res, 404, { error: 'not found' });
    const inline = ['image', 'audio', 'text'].includes(t[1]);
    res.writeHead(200, { 'Content-Type': t[0], 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, no-cache',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${path.basename(rel).replace(/[^\w.-]/g, '_')}"`, 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'same-site' });
    fs.createReadStream(full).pipe(res);
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, b, c, parts, me, url, readBody, send, fail }) {
    if (b === 'config') {
      if (m === 'GET') return send(res, 200, { repo: repo(), cdn: CDN(), kinds: KINDS, licenses: LICENSES, limits: LIMITS, types: Object.keys(TYPES), canPr: !!(hasToken && isHuman(me) && hasToken(me.id)) });
      if (m === 'PUT') {
        if (me.role !== 'host') return fail(res, 403, 'only the host');
        const body = await readBody(req); const r = String(body.repo || '').trim();
        if (r && !REPO_RE.test(r)) return fail(res, 400, 'use owner/repo');
        store.writeJSON('.tribe/workshop.json', r ? { repo: r } : {}); cache = null;
        return send(res, 200, { repo: repo() });
      }
    }
    if (b === 'items' && !c && m === 'GET') { sweep(); return send(res, 200, { items: list(me, url.searchParams.get('q'), url.searchParams.get('kind')), kinds: KINDS, licenses: LICENSES }); }
    if (b === 'items' && !c && m === 'POST') {
      const body = await readBody(req, 140 * MB);
      return send(res, 200, publish(body, me));
    }
    if (b === 'items' && c) {
      if (!ID_RE.test(c)) return fail(res, 400, 'bad id');
      const action = parts[3];
      if (!action && m === 'GET') { const it = loadItem(c); return it ? send(res, 200, { item: { ...view(it, me), history: it.history || [] } }) : fail(res, 404, 'not in the Workshop'); }
      if (!action && m === 'DELETE') return send(res, 200, remove(c, me));
      if (action === 'files' && m === 'GET') { const it = loadItem(c); if (!it) return fail(res, 404, 'not in the Workshop'); return serveFile(res, itemDir(c), it, safeRel(parts.slice(4).map(decodeURIComponent).join('/')), send); }
      if (action === 'use' && m === 'POST') { const body = await readBody(req); return send(res, 200, use(c, body, me)); }
      if (action === 'donate' && m === 'POST') { const body = await readBody(req); return send(res, 200, await donate(c, body, me)); }
    }
    if (b === 'pending') {
      sweep();
      if (!c && m === 'GET') return send(res, 200, { pending: pendingList().map(s => { const ap = approvals.get(s.approval) || {}; return { id: s.id, approval: s.approval, by: s.by, byName: nameOf(s.by), project: s.project, at: s.at, status: ap.status, canDecide: isHuman(me) && ((ap.to || []).includes(me.id) || me.role === 'host'), item: view(s.manifest, me) }; }).filter(s => !s.project || P.canSee(me, s.project)) });
      if (c && /^s-[a-z0-9-]+$/.test(c)) {
        const s = pendingList().find(x => x.id === c); if (!s) return fail(res, 404, 'suggestion not found');
        if (s.project && !P.canSee(me, s.project)) return fail(res, 404, 'suggestion not found');
        const action = parts[3];
        if (action === 'files' && m === 'GET') return serveFile(res, pendDir(c), s.manifest, safeRel(parts.slice(4).map(decodeURIComponent).join('/')), send);
        if ((action === 'approve' || action === 'deny') && m === 'POST') {
          if (!isHuman(me)) return fail(res, 403, 'only teammates decide');
          const body = await readBody(req).catch(() => ({}));
          approvals.decide(s.approval, action, me, body.note);
          sweep();
          return send(res, 200, { ok: true, status: action === 'approve' ? 'approved' : 'denied' });
        }
      }
    }
    if (b === 'browse' && m === 'GET') {
      const pid = String(url.searchParams.get('project') || P.current() || '');
      if (!P.canSee(me, pid)) return fail(res, 403, 'you are not in that project');
      return send(res, 200, browse(pid, url.searchParams.get('dir') || ''));
    }
    if (b === 'community') {
      if (!c && m === 'GET') return send(res, 200, await community(url.searchParams.get('refresh') === '1'));
      if (c && parts[3] === 'get' && m === 'POST') return send(res, 200, await getCommunity(c, me));
    }
    return null;
  }

  return { route, publish, use, list, search: (me, q, kind) => list(me, q, kind), community, getCommunity, donate, remove, sweep, pendingList, browse, loadItem, view, KINDS, LICENSES, LIMITS, stop: () => clearInterval(sweeper) };
};
module.exports.safeRel = safeRel;
module.exports.cleanMeta = cleanMeta;
module.exports.TYPES = TYPES;
module.exports.LIMITS = LIMITS;
module.exports.LICENSES = LICENSES;
