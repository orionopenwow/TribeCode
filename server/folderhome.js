// A folder on this computer as a project's home (feat/folder-sync). The folder IS the project's living repo: files
// edited in TribeCode are written straight into it, and a watcher picks up edits made outside (VS Code…) and shows
// them live. GitHub is an optional synced copy on top (server/sync.js).
//
// Path safety (every path that reaches the disk goes through here):
//   - the folder is inside the user's home (never the home itself, never a dot folder like ~/.ssh), or on Windows a
//     non-system drive folder; never a drive root or a system folder;
//   - no `..` segments, and the real path (symlinks resolved) must pass the same checks: a symlink can't escape;
//   - it must not overlap the server's own data dir, the app itself, or another project's folder (either way round);
//   - writes inside it refuse `..`, absolute paths, `.git/` internals and any symlink on the way.
//
// HTTP:
//   GET  /api/folders/browse?path=   host computer only: sub-folders of a folder under home (default: home)
//   POST /api/folders/check {path, project?}  is this folder OK? { ok, path, display, summary } or 400 with a reason
//   POST /api/folders/mkdir {parent, name}    a new empty folder under a safe parent
//   GET  /api/projects/:id/folder             the project's folder: display path, summary, watching
//   PUT  /api/projects/:id/folder {path, gitInit, move}   choose or move the folder (host or project lead, host computer)
//   GET  /api/projects/:id/folder/files?dir=  one level of the folder (lazy tree)
//   GET  /api/projects/:id/folder/file?path=  a text file
//   PUT  /api/projects/:id/folder/file {path, content}   write a file (anyone with write access)
// Websocket: { type: 'folder-change', project, files: [rel…], outside: true } after outside edits (debounced).
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WIN = process.platform === 'win32';
const POSIX_SYSTEM = ['/etc', '/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/var', '/opt', '/boot', '/dev', '/proc', '/sys', '/run', '/srv', '/snap',
  '/root', '/System', '/Library', '/Applications', '/private', '/cores'];
const POSIX_EXACT = ['/', '/tmp', '/mnt', '/media', '/Volumes', '/home', '/Users'];   // fine to be inside, never the folder itself
const WIN_SYSTEM = ['windows', 'program files', 'program files (x86)', 'programdata', '$recycle.bin', 'system volume information', 'recovery', 'perflogs'];
const SKIP = new Set(['.git', 'node_modules', '.trees', '.DS_Store', 'Thumbs.db']);
const DEBOUNCE_MS = Number(process.env.TRIBE_WATCH_DEBOUNCE_MS) || 300;
const FILE_CAP = 2 * 1024 * 1024;
const fail = (status, msg) => Object.assign(new Error(msg), { status });

const homeDir = () => { const h = process.env.HOME || process.env.USERPROFILE || os.homedir(); try { return fs.realpathSync(h); } catch { return path.resolve(h); } };
const norm = p => (WIN ? p.toLowerCase() : p);
const inside = (child, parent) => { const c = norm(child), pa = norm(parent); return c === pa || c.startsWith(pa.endsWith(path.sep) ? pa : pa + path.sep); };
const strictlyInside = (child, parent) => inside(child, parent) && norm(child) !== norm(parent);
const overlap = (a, b) => inside(a, b) || inside(b, a);
const isDriveRoot = p => path.parse(p).root === p || p === path.sep;
const realOr = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };

module.exports = function folderHome({ P, W, baseStore, isLocal, broadcast, perms, resetHub, postChat, nameOf, str, appRoot, onSave = null, log = () => {} }) {
  const dataDir = () => realOr(baseStore.root);
  const app = realOr(appRoot || path.join(__dirname, '..'));
  const display = p => { const h = homeDir(); return inside(p, h) ? '~' + (norm(p) === norm(h) ? '' : p.slice(h.length).replace(/\\/g, '/')) : p; };
  const folderOf = p => (p && p.folder) || null;

  // ---------- the one check ----------
  function systemish(real) {
    if (isDriveRoot(real)) return 'a drive root';
    const h = homeDir();
    if (WIN) {
      const rest = real.slice(path.parse(real).root.length).split(/[\\/]/).filter(Boolean);
      if (rest[0] && WIN_SYSTEM.includes(rest[0].toLowerCase())) return 'a system folder';
      if (strictlyInside(real, h)) { const first = real.slice(h.length + 1).split(/[\\/]/)[0] || ''; if (/^(appdata|\.)/i.test(first)) return 'a system folder'; }
      return null;
    }
    for (const s of POSIX_SYSTEM) if (s !== '/' && inside(real, s) && !inside(h, s)) return 'a system folder';
    for (const s of [...POSIX_SYSTEM, ...POSIX_EXACT]) if (norm(real) === norm(s)) return 'a system folder';
    if (strictlyInside(real, h)) { const first = real.slice(h.length + 1).split(path.sep)[0] || ''; if (first.startsWith('.') || first === 'Library' || first === 'AppData') return 'a hidden or system folder'; }
    return null;
  }
  // check(input) → { abs, real, exists } or throws 400 with a plain reason.
  function check(input, { project = null, create = false, legacy = false } = {}) {
    let s = typeof input === 'string' ? input.trim() : '';
    if (!s || s.length > 1024 || s.includes('\0')) throw fail(400, 'Pick a folder first.');
    if (/(^|[\\/])\.\.([\\/]|$)/.test(s)) throw fail(400, 'That path goes up a folder with "..". Pick the folder itself.');
    s = s.replace(/^~(?=$|[\\/])/, homeDir());
    if (!path.isAbsolute(s)) throw fail(400, 'Use the whole path to the folder (like ~/Games/Jiddles).');
    const abs = path.resolve(s);
    let real, exists = true;
    try {
      const st = fs.statSync(abs); if (!st.isDirectory()) throw fail(400, 'That is a file, not a folder.');
      real = fs.realpathSync(abs);
    } catch (e) {
      if (e.status) throw e;
      if (!create) throw fail(400, 'There is no folder there.');
      const parent = realOr(path.dirname(abs)); if (!fs.existsSync(parent)) throw fail(400, 'Its parent folder does not exist.');
      real = path.join(parent, path.basename(abs)); exists = false;
    }
    const h = homeDir();
    const sys = systemish(real); if (sys) throw fail(400, `That is ${sys}. Pick a folder of your own, like ~/Projects/my-game.`);
    if (norm(real) === norm(h)) throw fail(400, 'That is your whole home folder. Pick or make a folder inside it.');
    if (exists && inside(abs, h) && !inside(real, h)) throw fail(400, 'That folder is a shortcut (symlink) that leads outside your home folder. Pick the real folder.');
    if (inside(dataDir(), real)) throw fail(400, 'That folder holds TribeCode’s own data. Pick another folder.');
    if (inside(app, real) || (!legacy && inside(real, app))) throw fail(400, 'That is where the TribeCode app itself lives. Pick another folder.');
    if (legacy) return { abs, real, exists };   // POST /api/projects {path}: a folder the host typed, git only (no folder home)
    if (inside(real, dataDir())) throw fail(400, 'That folder is inside TribeCode’s own data. Pick another folder.');
    for (const p of P.all()) {
      if (project && p.id === project) continue;
      const f = folderOf(p) || (p.repo && !p.workspace ? realOr(p.repo) : null);
      if (f && overlap(real, f)) throw fail(400, `That folder overlaps ${p.name}’s folder (${display(f)}). Each project needs its own.`);
    }
    return { abs, real, exists };
  }

  function summary(dir) {
    let names = []; try { names = fs.readdirSync(dir).filter(n => n !== '.DS_Store' && n !== 'Thumbs.db'); } catch {}
    const has = n => names.includes(n);
    return { empty: names.length === 0, count: names.length, git: has('.git'), packageJson: has('package.json'), indexHtml: has('index.html'), readme: names.some(n => /^readme(\.|$)/i.test(n)),
      sample: names.filter(n => n !== '.git').slice(0, 12) };
  }

  // ---------- browsing (the web picker): folders under home only ----------
  function browse(input) {
    const h = homeDir();
    let dir = h;
    if (input) {
      let s = String(input).trim().replace(/^~(?=$|[\\/])/, h);
      if (s.includes('\0') || /(^|[\\/])\.\.([\\/]|$)/.test(s) || !path.isAbsolute(s)) throw fail(400, 'Not a folder you can browse.');
      dir = realOr(s);
      if (!inside(dir, h)) throw fail(403, 'Only folders inside your home folder.');
    }
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { throw fail(400, 'That folder can’t be opened.'); }
    const dirs = ents.filter(e => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('.') && !(norm(dir) === norm(h) && /^(Library|AppData)$/.test(e.name)))
      .map(e => ({ name: e.name, path: path.join(dir, e.name) })).filter(d => !overlap(d.path, dataDir()) || inside(dataDir(), d.path))
      .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500);
    let ok = true, why = ''; try { check(dir); } catch (e) { ok = false; why = e.message; }
    return { home: h, path: dir, display: display(dir), parent: norm(dir) === norm(h) ? null : path.dirname(dir), dirs: dirs.map(d => ({ ...d, display: display(d.path) })), summary: summary(dir), ok, why };
  }

  // ---------- writes inside a project's folder: never through a symlink, never out ----------
  function relOk(rel) {
    const r = String(rel || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
    if (!r || r.length > 512 || r.includes('\0') || r.startsWith('/') || /^[a-zA-Z]:/.test(r)) throw fail(400, 'Use a path inside the project folder.');
    const parts = r.split('/').filter(Boolean);
    if (parts.some(x => x === '..' || x === '.')) throw fail(400, 'Paths can’t go up a folder.');
    if (parts[0] === '.git') throw fail(400, 'TribeCode doesn’t write inside .git.');
    return parts;
  }
  function resolveIn(root, rel, { forWrite } = {}) {
    const parts = relOk(rel), base = realOr(root);
    let cur = base;
    for (let i = 0; i < parts.length; i++) {
      cur = path.join(cur, parts[i]);
      let st = null; try { st = fs.lstatSync(cur); } catch {}
      if (!st) { if (forWrite) break; throw fail(404, 'No such file.'); }
      if (st.isSymbolicLink()) throw fail(400, 'That path goes through a shortcut (symlink). TribeCode won’t follow it.');
      if (i < parts.length - 1 && !st.isDirectory()) throw fail(400, 'Part of that path is a file.');
    }
    const full = path.join(base, ...parts);
    if (!strictlyInside(full, base)) throw fail(400, 'That path leaves the project folder.');
    return full;
  }
  const selfWrites = new Map();   // full path -> time: our own writes are not "outside edits"
  function writeFile(root, rel, content) {
    const full = resolveIn(root, rel, { forWrite: true });
    const buf = Buffer.from(String(content == null ? '' : content), 'utf8'); if (buf.length > FILE_CAP) throw fail(413, 'That file is over 2 MB.');
    fs.mkdirSync(path.dirname(full), { recursive: true });
    resolveIn(root, rel, { forWrite: true });   // re-check after mkdir: a race can't slip a link in on the way
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0);
    selfWrites.set(full, Date.now());
    const fd = fs.openSync(full, flags, 0o644); try { fs.writeSync(fd, buf); } finally { fs.closeSync(fd); }
    return full;
  }
  function readFile(root, rel) {
    const full = resolveIn(root, rel);
    const st = fs.statSync(full); if (!st.isFile()) throw fail(400, 'That is a folder.'); if (st.size > FILE_CAP) throw fail(413, 'That file is over 2 MB.');
    return fs.readFileSync(full, 'utf8');
  }
  function list(root, rel) {
    const base = realOr(root), dir = rel ? resolveIn(root, rel) : base;
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => !SKIP.has(e.name)).map(e => ({ name: e.name, path: path.relative(base, path.join(dir, e.name)).replace(/\\/g, '/'), dir: e.isDirectory(), link: e.isSymbolicLink() }))
      .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name)).slice(0, 2000);
  }

  // ---------- the watcher: outside edits show up live ----------
  const watchers = new Map();   // pid -> { w, dir, timer, files }
  function unwatch(pid) { const x = watchers.get(pid); if (!x) return; try { x.w.close(); } catch {} clearTimeout(x.timer); watchers.delete(pid); }
  function watch(pid) {
    unwatch(pid);
    const p = P.get(pid), dir = p && folderOf(p); if (!dir || !fs.existsSync(dir)) return false;
    const x = { dir, timer: null, files: new Set(), outside: false };
    const onEv = (ev, name) => {
      const rel = String(name || '').replace(/\\/g, '/');
      if (!rel || rel.split('/').some(s => SKIP.has(s))) return;
      const full = path.join(dir, rel), t = selfWrites.get(full);
      if (!(t && Date.now() - t < 1500)) x.outside = true;
      x.files.add(rel);
      clearTimeout(x.timer);
      x.timer = setTimeout(() => {
        const files = [...x.files].slice(0, 200), outside = x.outside; x.files.clear(); x.outside = false;
        for (const [k, v] of selfWrites) if (Date.now() - v > 5000) selfWrites.delete(k);
        broadcast({ type: 'folder-change', project: pid, files, outside, at: new Date().toISOString() });
        if (onSave) try { onSave(pid, files) } catch (e) { log('sync: ' + e.message); }
      }, DEBOUNCE_MS);
    };
    try { x.w = fs.watch(dir, { recursive: true }, onEv); }
    catch { try { x.w = fs.watch(dir, {}, onEv); } catch (e) { log(`can't watch ${display(dir)}: ${e.message}`); return false; } }
    x.w.on('error', () => unwatch(pid));
    watchers.set(pid, x); return true;
  }
  const watchAll = () => { for (const p of P.all()) if (folderOf(p)) watch(p.id); };

  // ---------- choose or move a project's folder ----------
  function copyTree(from, to) {
    fs.cpSync(from, to, { recursive: true, errorOnExist: false, force: false, filter: src => { try { return !fs.lstatSync(src).isSymbolicLink() && path.basename(src) !== '.trees'; } catch { return false; } } });
  }
  async function setFolder(pid, body, me) {
    const p = P.get(pid); if (!p) throw fail(404, 'project not found');
    const want = check(body.path, { project: pid, create: !!body.create });
    if (!want.exists) fs.mkdirSync(want.real);
    const before = folderOf(p) || (p.repo && fs.existsSync(p.repo) ? realOr(p.repo) : null);
    const target = want.real, sum = summary(target);
    let moved = null;
    if (before && norm(before) !== norm(target)) {
      if (!sum.empty) throw fail(409, 'Moving needs an empty folder: the project’s files go into it. Pick or make an empty one.');
      unwatch(pid); copyTree(before, target);
      moved = { from: display(before), kept: true };
    }
    if (body.gitInit && !W.isRepo(target)) await W.makeRepo(target, me);
    P.update(pid, { repo: target, workspace: false, folder: target });
    resetHub(pid); watch(pid);
    try { broadcast({ type: 'projects' }); } catch {}
    try { P.inProject(pid, () => postChat('general', 'tribecode', moved ? `${nameOf(me.id) || me.name} moved **${p.name}** to ${display(target)}. The old folder (${moved.from}) is still there.` : `**${p.name}** now lives in ${display(target)} on the host computer.`)); } catch {}
    return { folder: info(pid, me), moved };
  }
  function info(pid, me) {
    const p = P.get(pid), f = folderOf(p);
    if (!f) return null;
    const exists = fs.existsSync(f);
    return { display: display(f), name: path.basename(f), path: me && (me.role === 'host') ? f : undefined, exists, git: exists && W.isRepo(f), watching: watchers.has(pid), summary: exists ? summary(f) : null };
  }

  // ---------- HTTP ----------
  const lead = (me, pid) => !!me && me.role !== 'agent' && (me.role === 'host' || ((P.get(pid) || {}).members || {})[me.id] === 'host' || (perms && perms.can(me, 'settings.edit', pid)));
  const writer = (me, pid) => !!me && !['spectator', 'guest'].includes(me.role) && P.canSee(me, pid);
  async function route(req, res, { m, a, b, c, parts, me, url, readBody, send, fail: f }) {
    try {
      if (a === 'folders') {
        // The host computer only: a page served by this server (or the desktop app) browsing its own disk.
        if (!isLocal(req)) return f(res, 403, 'Folders can only be picked on the computer that runs TribeCode.');
        if (me && me.role !== 'host') return f(res, 403, 'Only the host picks folders on this computer.');
        if (b === 'browse' && m === 'GET') return send(res, 200, browse(url.searchParams.get('path') || ''));
        if (b === 'check' && m === 'POST') {
          const body = await readBody(req), x = check(body.path, { project: str(body.project, 64) || null });
          return send(res, 200, { ok: true, path: x.real, display: display(x.real), summary: summary(x.real) });
        }
        if (b === 'mkdir' && m === 'POST') {
          const body = await readBody(req), name = String(body.name || '').trim();
          if (!name || name.length > 80 || /[\\/:*?"<>|\0]/.test(name) || name.startsWith('.')) return f(res, 400, 'Use a plain folder name (letters, numbers, spaces, - and _).');
          const parent = check(body.parent || '~/', { create: false }).real === homeDir() ? homeDir() : check(body.parent).real;
          const x = check(path.join(parent, name), { create: true });
          if (x.exists) return f(res, 409, 'A folder with that name is already there.');
          fs.mkdirSync(x.real); return send(res, 200, { ok: true, path: x.real, display: display(x.real), summary: summary(x.real) });
        }
        return f(res, 404, 'not found');
      }
      if (a !== 'projects' || c !== 'folder') return null;
      if (!me) return f(res, 401, 'not a member of this tribe');
      const p = P.get(b); if (!p || !P.canSee(me, b)) return f(res, 404, 'project not found');
      const sub = parts[3];
      if (!sub && m === 'GET') return send(res, 200, { folder: info(b, me), can: { move: lead(me, b) && isLocal(req), write: writer(me, b) } });
      if (!sub && m === 'PUT') {
        if (!lead(me, b)) return f(res, 403, 'Only the host or the project lead chooses where it lives.');
        if (!isLocal(req)) return f(res, 403, 'Folders can only be picked on the computer that runs TribeCode.');
        return send(res, 200, await setFolder(b, await readBody(req), me));
      }
      const root = folderOf(p); if (!root) return f(res, 400, 'This project has no folder yet.');
      if (sub === 'files' && m === 'GET') return send(res, 200, { files: list(root, url.searchParams.get('dir') || '') });
      if (sub === 'file' && m === 'GET') return send(res, 200, { path: url.searchParams.get('path'), content: readFile(root, url.searchParams.get('path')) });
      if (sub === 'file' && m === 'PUT') {
        if (!writer(me, b)) return f(res, 403, 'read-only');
        const body = await readBody(req, 4 * 1024 * 1024);
        writeFile(root, body.path, body.content);
        broadcast({ type: 'folder-change', project: b, files: [relOk(body.path).join('/')], outside: false, by: me.id, at: new Date().toISOString() });
        if (onSave) try { onSave(b, [body.path]); } catch {}
        return send(res, 200, { ok: true, path: relOk(body.path).join('/') });
      }
      return f(res, 404, 'not found');
    } catch (e) { return f(res, e.status || 500, e.message); }
  }

  return { check, browse, summary, display, writeFile, readFile, resolveIn, list, watch, unwatch, watchAll, setFolder, info, route, folderOf, homeDir };
};
