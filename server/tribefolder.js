// The tribe's folder on the Desktop (p13). When a tribe is made on a computer that runs it (the
// desktop app or `npm start`), a folder named after it appears on that computer's Desktop:
//
//   Desktop/<Tribe>/
//     README.md          what this folder is, how friends get it, how the GitHub backup works (plain words)
//     .gitignore         node_modules, .env, keys, secrets/, .tribe/, OS junk
//     <Tribe>.tribe      a copy of the tribe in one file (server/tribecopy.js), refreshed after saves: never keys,
//                        tokens or private messages
//     <Project>/         one per project: that project's folder home (server/folderhome.js), its own git repo with a
//                        first commit, so the Backup on GitHub card only sets the remote and pushes (server/sync.js)
//     .tribe/folder.json says the folder is ours (so a second tribe with the same name gets "<Tribe> 2")
//
// Never overwrites or deletes anything: a name that is taken by something not ours gets " 2", " 3"…; a folder the
// person deleted is not made again.
//
// Where the Desktop is: TRIBE_DESKTOP (tests), else Windows: the Desktop in the registry's User Shell Folders (OneDrive
// redirects it), else %USERPROFILE%\OneDrive\Desktop, else %USERPROFILE%\Desktop; macOS ~/Desktop; Linux XDG_DESKTOP_DIR
// from ~/.config/user-dirs.dirs, else ~/Desktop; none: ~/TribeCode/<name> (or ~/Tribes/<name> when that is the data).
// Off with TRIBE_DESKTOP_FOLDER=0, on cloud servers, and in tests unless TRIBE_DESKTOP points at a temp folder.
//
// HTTP:
//   GET  /api/tribe/desktop                 members: { on, made, display, exists, canOpen, projects: { id: display } }
//   POST /api/tribe/desktop/make            host, on this computer: make it now (a tribe from before this existed)
//   POST /api/tribe/desktop/open {path?}    host, on this computer: open it (or a folder inside it) with the OS
//   POST /api/tribe/desktop/save-copy {copy}  this computer only (the desktop app of a friend): their copy of a friend's
//                                           tribe as a folder on their own Desktop (README, .gitignore, <Tribe>.tribe)
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { run } = require('./gitutil');

const WIN = process.platform === 'win32';
const STATE = '.tribe/desktop-folder.json';
const MARK = path.join('.tribe', 'folder.json');
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const realOr = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const inside = (child, parent) => { const n = s => (WIN ? s.toLowerCase() : s); const c = n(child), p = n(parent); return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep); };

const GITIGNORE = ['# Kept out of git and GitHub by TribeCode', 'node_modules/', '.env', '.env.*', '*.pem', '*.key', 'id_rsa*', 'id_ed25519*', 'secrets/', '.tribe/', '.trees/', '.my-changes/',
  '', '# computer junk', '.DS_Store', 'Thumbs.db', 'desktop.ini', '*.swp', '*~', ''].join('\n');

// A name that works as a folder on Windows, macOS and Linux.
function safeName(name, fallback = 'My Tribe') {
  let s = String(name || '').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 60).trim();
  if (!s) s = fallback;
  if (RESERVED.test(s)) s += ' Tribe';
  return s;
}

function homeDir() { const h = process.env.HOME || process.env.USERPROFILE || os.homedir(); return realOr(h); }
function xdgDesktop(home) {
  try {
    const txt = fs.readFileSync(path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'user-dirs.dirs'), 'utf8');
    const m = txt.match(/^\s*XDG_DESKTOP_DIR\s*=\s*"?([^"\n]+)"?/m); if (!m) return null;
    const v = m[1].replace(/^\$HOME(?=\/|$)/, home).replace(/^~(?=\/|$)/, home);
    return path.isAbsolute(v) && path.resolve(v) !== path.resolve(home) ? v : null;
  } catch { return null; }
}
function winDesktop(home) {
  try {   // the real Desktop, wherever OneDrive or a policy moved it
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '/v', 'Desktop'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
    const m = out.match(/Desktop\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
    if (m) { const v = m[1].trim().replace(/%([^%]+)%/g, (x, k) => process.env[k] || x); if (!v.includes('%') && fs.existsSync(v)) return v; }
  } catch {}
  const prof = process.env.USERPROFILE || home;
  for (const d of [process.env.OneDrive && path.join(process.env.OneDrive, 'Desktop'), path.join(prof, 'OneDrive', 'Desktop')]) if (d && fs.existsSync(d) && !fs.existsSync(path.join(prof, 'Desktop'))) return d;
  for (const d of [path.join(prof, 'Desktop'), process.env.OneDrive && path.join(process.env.OneDrive, 'Desktop'), path.join(prof, 'OneDrive', 'Desktop')]) if (d && fs.existsSync(d)) return d;
  return null;
}
// -> { dir, desktop: true } or { dir, desktop: false } (the fallback)
function desktopDir(dataDir) {
  if (process.env.TRIBE_DESKTOP) return { dir: path.resolve(process.env.TRIBE_DESKTOP), desktop: true };
  const home = homeDir();
  let d = null;
  if (WIN) d = winDesktop(home);
  else if (process.platform === 'darwin') d = path.join(home, 'Desktop');
  else d = xdgDesktop(home) || path.join(home, 'Desktop');
  if (d && fs.existsSync(d)) return { dir: realOr(d), desktop: true };
  const tc = path.join(home, 'TribeCode');
  return { dir: dataDir && (inside(realOr(dataDir), tc) || inside(tc, realOr(dataDir))) ? path.join(home, 'Tribes') : tc, desktop: false };
}

function readme(name, projects) {
  return `# ${name}

This folder is your tribe, **${name}**, made by TribeCode. Everything you make together is saved here as real files.

## What is in it

${projects.length ? projects.map(p => `- **${p}/**: the files of ${p}. Change them here or in TribeCode, either way works.`).join('\n') : '- A folder for each project, made when you start one.'}
- **${name}.tribe**: a copy of the whole tribe in one file (tasks, docs, chat and designs). Open it in TribeCode to bring it back. It never holds passwords, keys or private messages.
- **.gitignore**: things that never go to GitHub, like passwords, keys and \`node_modules\`.

Files you change in another program show up in TribeCode right away, for everyone in the tribe. What you change in TribeCode is written here a moment later.

## How friends get it

Send them an invite link from TribeCode (the Invite button). They open it on their phone or computer and see the same projects, live, while this computer is on. Their changes land here as files.

With the TribeCode app, friends can keep their own copy too: "Save a folder on this computer too".

## Backup on GitHub

Each project folder is already set up for git. In TribeCode, open **Backup on GitHub** and turn it on: every change goes to your GitHub a moment later, and friends can get the latest even when this computer is off. Things in .gitignore never go there.

## Good to know

- Moving or renaming this folder: use **Change** in TribeCode, so it knows where the files are.
- Deleting it does not delete the tribe. TribeCode keeps its own copy, and will not make this folder again by itself.
`;
}

module.exports = function tribeFolder({ P, baseStore, tribe, folderHome, tribeCopy = null, members = () => [], dataDir, cloud = false, log = () => {} }) {
  const env = process.env;
  function enabled() {
    if (env.TRIBE_DESKTOP_FOLDER === '0' || cloud) return false;
    if (env.TRIBE_DESKTOP) return true;
    if (env.TRIBE_TEST === '1' || env.TRIBE_NO_DOWNLOAD === '1') return false;   // tests never touch the real Desktop
    if (dataDir && inside(realOr(dataDir), realOr(os.tmpdir()))) return false;     // a throwaway tribe in a temp folder
    return true;
  }
  let cached = null;   // only this module writes the file
  const state = () => cached || (cached = baseStore.readJSON(STATE, null) || {});
  const saveState = s => { cached = s; baseStore.writeJSON(STATE, s); };
  const tribeId = () => String(tribe.created || tribe.name || 'tribe');
  const hostMember = () => members().find(m => m.role === 'host') || null;
  const display = p => { const d = desktopDir(dataDir); if (d.desktop && inside(p, d.dir)) return 'Desktop' + p.slice(d.dir.length).replace(/\\/g, '/'); return folderHome.display(p); };

  const readMark = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, MARK), 'utf8')); } catch { return null; } };
  function writeMark(dir, o) { fs.mkdirSync(path.join(dir, '.tribe'), { recursive: true }); fs.writeFileSync(path.join(dir, MARK), JSON.stringify(o, null, 2)); }
  // A free folder for name under parent: ours (same mark) is used again, anything else gets " 2", " 3"…
  function pick(parent, name, isOurs) {
    for (let i = 1; i < 100; i++) {
      const full = path.join(parent, i === 1 ? name : `${name} ${i}`);
      let st = null; try { st = fs.lstatSync(full); } catch {}
      if (!st) return { dir: full, fresh: true };
      if (st.isDirectory() && !st.isSymbolicLink() && isOurs(full)) return { dir: full, fresh: false };
    }
    throw fail(409, 'Too many folders with that name on the Desktop.');
  }
  const writeNew = (f, text) => { if (!fs.existsSync(f)) fs.writeFileSync(f, text, { flag: 'wx' }); };

  // The name the folder gets: the tribe's own, or the one project's when the tribe still has the starting name.
  function nameFor() {
    const n = String(tribe.name || '').trim(), list = P.all();
    if ((!n || n === 'My Tribe') && list.length === 1 && list[0].name && list[0].name !== 'My Tribe') return safeName(list[0].name);
    return safeName(n);
  }

  let gitOk = null;
  const hasGit = async () => (gitOk == null ? (gitOk = (await run('git', ['--version'], { timeout: 5000 })).code === 0) : gitOk);
  const GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'TribeCode', GIT_AUTHOR_EMAIL: 'bot@users.noreply.tribecode', GIT_COMMITTER_NAME: 'TribeCode', GIT_COMMITTER_EMAIL: 'bot@users.noreply.tribecode' };
  async function gitStart(dir, msg) {
    if (!(await hasGit())) return false;
    if (!fs.existsSync(path.join(dir, '.git'))) { try { await folderHome.initRepo(dir); } catch (e) { log('tribe folder: ' + e.message); return false; } }
    await run('git', ['add', '-A'], { cwd: dir, env: GIT_ENV });
    const r = await run('git', ['commit', '-q', '--allow-empty', '-m', msg], { cwd: dir, env: GIT_ENV });
    return r.code === 0;
  }

  // ---------- the tribe folder ----------
  let making = null;
  function ensure({ force = false } = {}) {
    if (making) return making;
    making = (async () => {
      if (!force && !enabled()) return null;
      let s = state();
      if (s.path) { if (!fs.existsSync(s.path)) return null; await wireAll(); return s.path; }   // deleted by the person: not made again
      const where = desktopDir(dataDir);
      fs.mkdirSync(where.dir, { recursive: true });
      const name = nameFor(), id = tribeId();
      const got = pick(realOr(where.dir), name, d => { const m = readMark(d); return !!(m && m.kind === 'tribe' && m.id === id); });
      fs.mkdirSync(got.dir, { recursive: true });
      writeMark(got.dir, { kind: 'tribe', id, made: new Date().toISOString(), by: 'TribeCode' });
      writeNew(path.join(got.dir, '.gitignore'), GITIGNORE);
      s = { path: got.dir, name: path.basename(got.dir), made: new Date().toISOString(), desktop: where.desktop };
      saveState(s);
      writeReadme();
      await wireAll();
      writeReadme();
      refreshCopy(true);
      log(`Your tribe's folder: ${got.dir}`);
      return got.dir;
    })().catch(e => { log('tribe folder: ' + e.message); return null; }).finally(() => { making = null; });
    return making;
  }
  function writeReadme() {
    const s = state(); if (!s.path || !fs.existsSync(s.path)) return;
    const f = path.join(s.path, 'README.md');
    const projects = P.all().filter(p => p.folder && inside(p.folder, s.path)).map(p => path.basename(p.folder));
    try {
      const mine = !fs.existsSync(f) || /^# .*\n\nThis folder is your tribe, \*\*/.test(fs.readFileSync(f, 'utf8').slice(0, 300));   // never write over a README the person changed
      if (mine) fs.writeFileSync(f, readme(s.name || nameFor(), projects));
    } catch {}
  }

  // ---------- a project's folder inside it ----------
  const wiring = new Set();
  async function wire(pid) {
    const s = state(), p = P.get(pid);
    if (!s.path || !fs.existsSync(s.path) || !p || p.folder || (p.repo && !p.workspace) || wiring.has(pid)) return null;
    if (p.workspace && p.repo) return null;   // a clone or a dropped folder: it keeps its own place
    wiring.add(pid);
    try {
      const got = pick(s.path, safeName(p.name, 'Project'), d => { const m = readMark(d); return !!(m && m.kind === 'project' && m.id === pid); });
      fs.mkdirSync(got.dir, { recursive: true });
      writeMark(got.dir, { kind: 'project', id: pid });
      writeNew(path.join(got.dir, '.gitignore'), GITIGNORE);
      await folderHome.setFolder(pid, { path: got.dir }, { id: 'tribecode', name: 'TribeCode', role: 'host' }, { quiet: true });
      await gitStart(got.dir, `Start ${p.name}`);
      writeReadme();
      return got.dir;
    } catch (e) { log(`tribe folder (${pid}): ${e.message}`); return null; }
    finally { wiring.delete(pid); }
  }
  async function wireAll() { for (const p of P.all()) await wire(p.id); }
  // a project was made: its folder follows once its first moment is over (an import may still be naming it)
  function onProject(pid) { if (!state().path) return; const t = setTimeout(() => { wire(pid).then(d => { if (d) refreshCopy(); }); }, 800); if (t.unref) t.unref(); }
  let bootT = null;
  // a tribe got its host: the folder comes a moment later, so a project moved in right after (POST /api/import/solo) names it
  function onTribeMade(delay = 3000) { clearTimeout(bootT); if (!enabled()) return; bootT = setTimeout(() => ensure(), delay); if (bootT.unref) bootT.unref(); }
  function onImported() { clearTimeout(bootT); if (enabled() && !state().path && hostMember()) ensure(); else if (state().path) wireAll().then(() => refreshCopy()); }

  // ---------- <Tribe>.tribe, refreshed after saves ----------
  let copyT = null;
  function refreshCopy(now) {
    const s = state(); if (!s.path || !tribeCopy) return;
    clearTimeout(copyT);
    copyT = setTimeout(() => {
      try {
        if (!fs.existsSync(s.path)) return;
        const host = hostMember() || { id: 'tribecode', role: 'host' };
        const data = tribeCopy.build(host, '');
        const f = path.join(s.path, `${s.name || 'tribe'}.tribe`);
        const text = JSON.stringify(data, null, 1);
        let old = ''; try { old = fs.readFileSync(f, 'utf8'); } catch {}
        const strip = t => t.replace(/"saved": "[^"]*"/, '');
        if (old && strip(old) === strip(text)) return;
        const tmp = f + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f);
      } catch (e) { log('tribe folder copy: ' + e.message); }
    }, now ? 50 : Number(env.TRIBE_DESKTOP_COPY_MS) || 8000);
    if (copyT.unref) copyT.unref();
  }
  const SAVES = new Set(['site-config', 'app-config', 'doc', 'doc-saved', 'docs', 'task', 'tasks', 'projects', 'vision', 'folder-change']);
  function note(msg) { if (msg && SAVES.has(String(msg.type || '')) && state().path) refreshCopy(); }

  // ---------- open with the OS ----------
  function reveal(dir) {
    if (env.TRIBE_NO_REVEAL) return false;
    const cmd = WIN ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    try { const c = spawn(cmd, [dir], { detached: true, stdio: 'ignore', windowsHide: false }); c.on('error', () => {}); c.unref(); return true; } catch { return false; }
  }
  // Only the tribe folder or a folder inside it, never through a link.
  function inTribeFolder(input) {
    const s = state(); if (!s.path || !fs.existsSync(s.path)) throw fail(404, 'This tribe has no folder on this computer yet.');
    const root = realOr(s.path);
    if (input == null || input === '') return root;
    const v = String(input);
    if (v.includes('\0') || /(^|[\\/])\.\.([\\/]|$)/.test(v)) throw fail(400, 'Only the tribe’s own folder opens from here.');
    const abs = path.isAbsolute(v) ? path.resolve(v) : path.join(root, v);
    let st; try { st = fs.lstatSync(abs); } catch { throw fail(404, 'There is no folder there.'); }
    if (st.isSymbolicLink() || !st.isDirectory()) throw fail(400, 'Only the tribe’s own folder opens from here.');
    const real = realOr(abs);
    if (!inside(real, root) || !inside(abs, root)) throw fail(403, 'Only the tribe’s own folder opens from here.');
    return real;
  }

  // ---------- a friend's copy on their own Desktop ----------
  function saveCopy(copy, from) {
    if (!enabled()) throw fail(403, 'Folders on the Desktop are off on this computer.');
    if (!copy || copy.format !== 'tribecode-tribe' || !Array.isArray(copy.projects)) throw fail(400, 'That is not a copy of a tribe.');
    const clean = require('./tribecopy').scrub(copy);
    const name = safeName((clean.tribe && clean.tribe.name) || (clean.projects[0] && clean.projects[0].name) || 'Friends’ tribe');
    const key = String(from || '').slice(0, 300);
    const where = desktopDir(dataDir); fs.mkdirSync(where.dir, { recursive: true });
    const got = pick(realOr(where.dir), name, d => { const m = readMark(d); return !!(m && m.kind === 'copy' && m.key === key); });
    fs.mkdirSync(got.dir, { recursive: true });
    writeMark(got.dir, { kind: 'copy', key, saved: new Date().toISOString() });
    writeNew(path.join(got.dir, '.gitignore'), GITIGNORE);
    const rf = path.join(got.dir, 'README.md');
    if (!fs.existsSync(rf)) fs.writeFileSync(rf, readme(name, []).replace('This folder is your tribe', 'This folder is your copy of the tribe'));
    const f = path.join(got.dir, `${path.basename(got.dir)}.tribe`), tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 1)); fs.renameSync(tmp, f);
    return got.dir;
  }

  function info(me, local) {
    const s = state(), exists = !!(s.path && fs.existsSync(s.path));
    const projects = {};
    if (exists) for (const p of P.visibleTo ? P.visibleTo(me) : P.all()) if (p.folder && inside(p.folder, s.path)) projects[p.id] = display(p.folder);
    return { on: enabled(), made: !!s.path, exists, display: s.path ? display(s.path) : '', name: s.name || '', desktop: s.desktop !== false, canOpen: !!(local && me && me.role === 'host' && exists),
      canMake: !!(local && me && me.role === 'host' && enabled() && !s.path), projects, path: local && me && me.role === 'host' ? s.path || '' : undefined };
  }

  async function route(req, res, { m, c, me, send, fail: f, readBody, isLocal }) {
    try {
      const local = !!isLocal(req);
      if (c === 'save-copy') {
        if (m !== 'POST') return f(res, 405, 'POST only');
        if (!local) return f(res, 403, 'A folder is saved on the computer it is for.');
        const body = await readBody(req, 8 * 1024 * 1024);
        const dir = saveCopy(body.copy, body.from);
        return send(res, 200, { ok: true, display: display(dir), revealed: body.open ? reveal(dir) : false });
      }
      if (!me || me.role === 'guest') return f(res, 403, 'join the tribe first');
      if (!c && m === 'GET') return send(res, 200, info(me, local));
      if (m !== 'POST') return f(res, 405, 'POST only');
      if (!local || me.role !== 'host') return f(res, 403, 'The tribe’s folder opens on the computer that keeps the tribe, by its owner.');
      if (c === 'make') { if (!enabled()) return f(res, 403, 'Folders on the Desktop are off on this computer.'); const d = await ensure(); return send(res, 200, { ...info(me, local), made: !!d }); }
      if (c === 'open') { const body = await readBody(req, 4096).catch(() => ({})); const dir = inTribeFolder(body && body.path); return send(res, 200, { display: display(dir), revealed: reveal(dir) }); }
      return f(res, 404, 'not found');
    } catch (e) { return f(res, e.status || 500, e.message); }
  }

  return { enabled, ensure, wire, wireAll, onProject, onTribeMade, onImported, note, refreshCopy, route, info, state, desktopDir: () => desktopDir(dataDir), safeName, inTribeFolder };
};
module.exports.safeName = safeName;
module.exports.desktopDir = desktopDir;
module.exports.GITIGNORE = GITIGNORE;
