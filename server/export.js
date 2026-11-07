// Folders on the host's Desktop: export a project, keep a live copy, and drop a shortcut to its app.
//
//   Export        ~/Desktop/TribeCode Projects/<Project name>/  "Just the files" (the working tree, no .git: every
//                 tracked or new file that is not ignored) or "With history" (a git clone whose origin is the
//                 project's GitHub repo, when it has one). The folder opens in Explorer / Finder afterwards.
//   Keep a copy   a per-project setting: a git clone on the Desktop that follows the project. Its remote `tribe` is
//                 the project's repo on this computer (so it needs no credentials) and `origin` is GitHub. A light
//                 poll notices new commits (pushes, merges, the autopilot) and, after a short debounce, fast-forwards
//                 the copy. A copy with your own uncommitted edits is never touched; it waits until they are gone.
//   Shortcut      a Windows .url, a macOS .webloc or a Linux .desktop file on the Desktop that opens the project's app
//                 (server/applink.js: /app/<key>/) in the browser, with the project's icon.
// Everything here writes to the host's disk, so it only answers requests made on the host computer itself (isLocal),
// by people (not agents). git runs with argument arrays, never through a shell.
// Test hooks: TRIBE_DESKTOP_DIR (where "Desktop" is), TRIBE_NO_REVEAL=1 (don't open a file manager),
// TRIBE_MIRROR_POLL_MS / TRIBE_MIRROR_DEBOUNCE_MS, TRIBE_SHORTCUT_KIND (url|webloc|desktop).
//
// API (current project):
//   GET  /api/export                 -> { local, desktop, folder, hasRepo, mirror }
//   POST /api/export                 { mode: 'files'|'history', reveal? } -> { path, mode, files, revealed }
//   PUT  /api/export/mirror          { enabled }  -> { mirror }
//   POST /api/export/mirror/sync     -> { mirror }
//   POST /api/export/reveal          { what: 'mirror'|'folder' }
//   POST /api/shortcut               -> { path, url, kind }
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { icoFromPng } = require('./applink');

const ROOT_NAME = 'TribeCode Projects';
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

function safeName(name, fallback = 'project') {
  let s = String(name || '').replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^[.\s-]+|[.\s]+$/g, '').slice(0, 80).trim();
  if (!s) s = fallback;
  if (RESERVED.test(s)) s += ' project';
  return s;
}
function desktopDir() {
  if (process.env.TRIBE_DESKTOP_DIR) return path.resolve(process.env.TRIBE_DESKTOP_DIR);
  const home = os.homedir();
  const cands = [];
  if (process.platform === 'linux') {   // XDG_DESKTOP_DIR="$HOME/Schreibtisch"
    try { const m = /^XDG_DESKTOP_DIR="?([^"\n]+)"?/m.exec(fs.readFileSync(path.join(home, '.config', 'user-dirs.dirs'), 'utf8')); if (m) cands.push(m[1].replace(/^\$HOME/, home)); } catch {}
  }
  cands.push(path.join(home, 'Desktop'));
  if (process.platform === 'win32') cands.push(path.join(home, 'OneDrive', 'Desktop'));
  return cands.find(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } }) || path.join(home, 'Desktop');
}
const shortcutKind = () => process.env.TRIBE_SHORTCUT_KIND || (process.platform === 'win32' ? 'url' : process.platform === 'darwin' ? 'webloc' : 'desktop');
const xml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// The text of a shortcut file. Pure (used by the tests for all three kinds).
function shortcutFile(kind, { name, url, icon }) {
  if (kind === 'url') return `[InternetShortcut]\r\nURL=${url}\r\n${icon ? `IconFile=${icon}\r\nIconIndex=0\r\n` : ''}`;
  if (kind === 'webloc') return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n\t<key>URL</key>\n\t<string>${xml(url)}</string>\n</dict>\n</plist>\n`;
  const line = s => String(s).replace(/[\r\n]+/g, ' ');
  return `[Desktop Entry]\nVersion=1.0\nType=Link\nName=${line(name)}\nComment=${line(name)}, live from TribeCode\nURL=${line(url)}\n${icon ? `Icon=${line(icon)}\n` : ''}`;
}

module.exports = function exporter({ P, W, store, applink, isLocal, port, getMembers, log = () => {} }) {
  const SETTINGS = '.tribe/export.json';
  let settings = store.readJSON(SETTINGS, null) || {};
  if (!settings.mirrors || typeof settings.mirrors !== 'object') settings.mirrors = {};
  const saveSettings = () => store.writeJSON(SETTINGS, settings);
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const git = (args, cwd, opts) => W.git(args, cwd, opts);
  async function must(args, cwd, opts) { const r = await git(args, cwd, opts); if (r.code) throw err(422, (r.err || r.out || `git ${args[0]} failed`).replace(/\/\/[^/@\s]+@/g, '//').split('\n').slice(0, 3).join(' ')); return r.out; }
  const projectsDir = () => path.join(desktopDir(), ROOT_NAME);
  const isEmptyDir = d => { try { return fs.readdirSync(d).length === 0; } catch { return true; } };
  function freeDir(base) {
    for (let i = 1; i < 100; i++) { const d = i === 1 ? base : `${base} ${i}`; if (!fs.existsSync(d) || isEmptyDir(d)) return d; }
    throw err(409, 'too many folders with that name on the Desktop');
  }
  function reveal(dir) {
    if (process.env.TRIBE_NO_REVEAL) return false;
    const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    try { const c = spawn(cmd, [dir], { detached: true, stdio: 'ignore', windowsHide: false }); c.on('error', () => {}); c.unref(); return true; } catch { return false; }
  }
  function repoOf(pid) {
    const p = P.get(pid);
    if (!p) throw err(404, 'project not found');
    if (!p.repo || !W.isRepo(p.repo)) throw err(400, 'this project has no git repo yet');
    return p;
  }

  // ---------- export ----------
  async function exportFiles(p, dest) {
    const r = await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], p.repo, { timeout: 120_000 });
    if (r.code) throw err(422, 'could not list the project\'s files');
    const files = [...new Set(r.out.split('\0').filter(Boolean))].filter(f => !f.startsWith('.trees/') && !f.split('/').includes('.git'));
    const root = path.resolve(p.repo);
    fs.mkdirSync(dest, { recursive: true });
    let n = 0, bytes = 0;
    for (const f of files) {
      const src = path.resolve(root, f), out = path.resolve(dest, f);
      if (!src.startsWith(root + path.sep) || !out.startsWith(path.resolve(dest) + path.sep)) continue;
      let st; try { st = fs.lstatSync(src); } catch { continue; }   // deleted but still tracked
      if (!st.isFile()) continue;                                   // symlinks and submodules stay behind
      await fs.promises.mkdir(path.dirname(out), { recursive: true });
      await fs.promises.copyFile(src, out);
      n++; bytes += st.size;
    }
    return { files: n, bytes };
  }
  async function exportHistory(p, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await must(['-c', 'protocol.ext.allow=never', 'clone', '--quiet', '--no-hardlinks', '--', p.repo, dest], path.dirname(dest), { timeout: 10 * 60_000 });
    const gh = await W.remoteOf(p.repo);
    if (gh) await must(['remote', 'set-url', 'origin', gh], dest);
    else await git(['remote', 'remove', 'origin'], dest);
    const files = (await git(['ls-files'], dest)).out.split('\n').filter(Boolean).length;
    return { files, remote: gh || null };
  }
  async function doExport(pid, mode, wantReveal = true) {
    const p = repoOf(pid);
    const dest = freeDir(path.join(projectsDir(), safeName(p.name, pid)));
    const out = mode === 'history' ? await exportHistory(p, dest) : await exportFiles(p, dest);
    log(`Exported ${p.name} (${mode === 'history' ? 'with history' : 'files'}) to ${dest}`);
    return { path: dest, mode: mode === 'history' ? 'history' : 'files', ...out, revealed: wantReveal ? reveal(dest) : false };
  }

  // ---------- keep a copy on the Desktop ----------
  const POLL = Number(process.env.TRIBE_MIRROR_POLL_MS) || 15_000;
  const DEBOUNCE = Number(process.env.TRIBE_MIRROR_DEBOUNCE_MS) || 3_000;
  const timers = new Map(), busy = new Set();
  const mirrorView = pid => { const m = settings.mirrors[pid]; return m ? { enabled: !!m.enabled, path: m.path || null, state: m.state || null, note: m.note || '', lastSync: m.lastSync || null, head: m.head || null } : { enabled: false, path: null }; };
  async function headOf(repo) { const r = await git(['rev-parse', 'HEAD'], repo); return r.code ? null : r.out; }
  async function branchOf(repo) { const r = await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo); return r.code || r.out === 'HEAD' ? null : r.out; }
  async function enableMirror(pid) {
    const p = repoOf(pid);
    const cur = settings.mirrors[pid] || {};
    let dest = cur.path && W.isRepo(cur.path) ? cur.path : null;
    if (!dest) {
      const want = path.join(projectsDir(), safeName(p.name, pid));
      dest = fs.existsSync(want) && !isEmptyDir(want) ? freeDir(`${want} (live copy)`) : want;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await must(['-c', 'protocol.ext.allow=never', 'clone', '--quiet', '--no-hardlinks', '--origin', 'tribe', '--', p.repo, dest], path.dirname(dest), { timeout: 10 * 60_000 });
      const gh = await W.remoteOf(p.repo);
      if (gh) { await git(['remote', 'add', 'origin', gh], dest); await git(['config', 'remote.pushDefault', 'origin'], dest); }
    }
    settings.mirrors[pid] = { ...cur, enabled: true, path: dest, state: 'ok', note: '', lastSync: new Date().toISOString(), head: await headOf(p.repo) };
    saveSettings();
    return sync(pid);
  }
  function disableMirror(pid) {
    const m = settings.mirrors[pid]; if (m) { m.enabled = false; m.state = 'off'; m.note = 'The folder stays on your Desktop; it just stops updating.'; saveSettings(); }
    clearTimeout(timers.get(pid)); timers.delete(pid);
    return mirrorView(pid);
  }
  async function sync(pid) {
    const m = settings.mirrors[pid], p = P.get(pid);
    if (!m || !m.enabled || !p || !p.repo) return mirrorView(pid);
    if (busy.has(pid)) return mirrorView(pid);
    busy.add(pid);
    const set = (state, note = '') => { Object.assign(m, { state, note, lastSync: new Date().toISOString() }); saveSettings(); };
    try {
      if (!W.isRepo(m.path)) { set('missing', 'The Desktop copy is gone. Turn it off and on again to make a new one.'); return mirrorView(pid); }
      const branch = await branchOf(p.repo); m.head = await headOf(p.repo);
      const f = await git(['fetch', '--quiet', '--prune', 'tribe'], m.path, { timeout: 120_000 });
      if (f.code) { set('error', 'Could not read the project repo.'); return mirrorView(pid); }
      const dirty = (await git(['status', '--porcelain'], m.path)).out.split('\n').filter(Boolean).length;
      if (dirty) { set('local-changes', `You changed ${dirty} file${dirty > 1 ? 's' : ''} in the Desktop copy, so it waits. Commit or undo them and it catches up.`); return mirrorView(pid); }
      if (branch) {
        const mine = await branchOf(m.path);
        if (mine !== branch) {
          const has = (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], m.path)).code === 0;
          const co = await git(has ? ['checkout', '--quiet', branch] : ['checkout', '--quiet', '-b', branch, '--track', `tribe/${branch}`], m.path);
          if (co.code) { set('error', `Could not switch the copy to ${branch}.`); return mirrorView(pid); }
        }
        const ff = await git(['merge', '--ff-only', '--quiet', `tribe/${branch}`], m.path);
        if (ff.code) { set('diverged', 'The Desktop copy has its own commits. Push them or move them to a branch, and it catches up.'); return mirrorView(pid); }
      }
      set('ok');
    } finally { busy.delete(pid); }
    return mirrorView(pid);
  }
  // New commits in the project (a push, a merge, the autopilot) -> sync after a short pause.
  function kick(pid) {
    clearTimeout(timers.get(pid));
    const t = setTimeout(() => { timers.delete(pid); sync(pid).catch(e => log('desktop copy: ' + e.message)); }, DEBOUNCE);
    if (t.unref) t.unref(); timers.set(pid, t);
  }
  const poller = setInterval(async () => {
    for (const [pid, m] of Object.entries(settings.mirrors)) {
      if (!m.enabled || busy.has(pid) || timers.has(pid)) continue;
      const p = P.get(pid); if (!p || !p.repo) continue;
      const h = await headOf(p.repo).catch(() => null);
      if (h && h !== m.head) kick(pid);
    }
  }, POLL);
  if (poller.unref) poller.unref();

  // ---------- desktop shortcut ----------
  function writeShortcut(pid, member) {
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    const link = applink.ensure(pid, member);
    const url = `http://localhost:${port}${link.path}`;
    const kind = shortcutKind();
    let icon = null;
    try {
      const dir = store.p('.tribe', 'icons'); fs.mkdirSync(dir, { recursive: true });
      const png = applink.iconPng(p, 256);
      if (kind === 'url') { icon = path.join(dir, `${pid}.ico`); fs.writeFileSync(icon, icoFromPng(png, 256)); }
      else if (kind === 'desktop') { icon = path.join(dir, `${pid}.png`); fs.writeFileSync(icon, png); }
    } catch (e) { log('shortcut icon: ' + e.message); icon = null; }
    const desk = desktopDir(); fs.mkdirSync(desk, { recursive: true });
    const file = path.join(desk, `${safeName(p.name, pid)}.${kind}`);
    fs.writeFileSync(file, shortcutFile(kind, { name: p.name, url, icon }));
    if (kind === 'desktop') {
      try { fs.chmodSync(file, 0o755); } catch {}
      try { const c = spawn('gio', ['set', file, 'metadata::trusted', 'true'], { stdio: 'ignore' }); c.on('error', () => {}); } catch {}
    }
    return { path: file, url, kind };
  }

  // ---------- API ----------
  async function route(req, res, { m, a, b, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current() || P.defaultId(), p = P.get(pid);
    if (!p || !P.canSee(me, pid)) return fail(res, 404, 'project not found');
    const local = isLocal(req);
    if (a === 'export' && !b && m === 'GET') return send(res, 200, { local, desktop: local ? desktopDir() : null, folder: local ? path.join(projectsDir(), safeName(p.name, pid)) : null, hasRepo: !!(p.repo && W.isRepo(p.repo)), mirror: local ? mirrorView(pid) : { enabled: !!(settings.mirrors[pid] || {}).enabled } });
    if (!local) return fail(res, 403, 'only on the host computer: this writes to its Desktop');
    if (me.role === 'agent' || me.role === 'spectator') return fail(res, 403, 'only people in the project can do this');
    try {
      if (a === 'shortcut' && m === 'POST') return send(res, 200, writeShortcut(pid, me));
      if (a !== 'export') return null;
      if (!b && m === 'POST') { const body = await readBody(req); return send(res, 200, await doExport(pid, body.mode === 'history' ? 'history' : 'files', body.reveal !== false)); }
      if (b === 'mirror' && !c && (m === 'PUT' || m === 'POST')) { const body = await readBody(req); return send(res, 200, { mirror: body.enabled ? await enableMirror(pid) : disableMirror(pid) }); }
      if (b === 'mirror' && c === 'sync' && m === 'POST') return send(res, 200, { mirror: await sync(pid) });
      if (b === 'reveal' && m === 'POST') {
        const body = await readBody(req), mm = settings.mirrors[pid];
        const dir = body.what === 'mirror' && mm && mm.path ? mm.path : projectsDir();
        fs.mkdirSync(dir, { recursive: true });
        return send(res, 200, { path: dir, revealed: reveal(dir) });
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  return { route, doExport, enableMirror, disableMirror, sync, kick, writeShortcut, desktopDir, projectsDir };
};
module.exports.shortcutFile = shortcutFile;
module.exports.safeName = safeName;
