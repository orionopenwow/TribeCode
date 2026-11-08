// Special connections (feat/mcp-directory): desktop apps on the host's computer that work with a project, such as
// ArtCraft (github.com/storytold/artcraft, an open-source desktop IDE for AI image and video work). ArtCraft has no API,
// CLI or MCP server, so a connection does only two plain things: open the app, and watch a folder the host picked so
// new renders land in the project's Files (and PNGs in Visuals), with one chat line per batch.
//
//   GET    /api/connections                 members: this project's connections (the host also sees paths + detection)
//   POST   /api/connections                 host, local: { kind: 'artcraft'|'custom', name, emoji, app, watch, link }
//   PATCH  /api/connections/<id>            host, local: same fields
//   DELETE /api/connections/<id>            host, local
//   POST   /api/connections/<id>/launch     host, local: starts the saved app path (detached, no shell)
//
// Stored per project in <tribe>/.tribe/connections.json as { [projectId]: [connection] }; what the watcher has seen
// lives in .tribe/connections-seen.json. Security: only the host, only from this computer (isLocal), launches only the
// saved path (never a path from the request), watches only the top level of the folder the host picked, skips
// symlinks, and copies only images and videos up to a size cap.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm)$/i;
const MAX_MEDIA = 50 * 1024 * 1024;        // the Files cap
const MAX_VISUAL = 8 * 1024 * 1024;        // the Visuals cap (PNG only)
const POLL_MS = Number(process.env.TRIBE_CONNECTIONS_POLL_MS) || 3000;

// Where ArtCraft usually lives. Windows: %ProgramFiles%\ArtCraft; macOS: /Applications/ArtCraft.app; Linux: on PATH or
// an AppImage in ~/Applications, ~/.local/bin or ~/Downloads.
function detectArtCraft() {
  const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env.ProgramW6432, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
    for (const r of [...new Set(roots)]) {
      const dir = path.join(r, 'ArtCraft'); if (!isDir(dir)) continue;
      for (const n of ['ArtCraft.exe', 'artcraft.exe']) if (isFile(path.join(dir, n))) return path.join(dir, n);
      let exes = []; try { exes = fs.readdirSync(dir).filter(n => /\.exe$/i.test(n) && !/unins/i.test(n)); } catch {}
      const pick = exes.find(n => /artcraft/i.test(n)) || exes[0]; if (pick) return path.join(dir, pick);
    }
    return null;
  }
  if (process.platform === 'darwin') {
    for (const p of ['/Applications/ArtCraft.app', path.join(os.homedir(), 'Applications', 'ArtCraft.app')]) if (isDir(p)) return p;
    return null;
  }
  for (const d of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) for (const n of ['artcraft', 'ArtCraft']) if (isFile(path.join(d, n))) return path.join(d, n);
  for (const d of ['Applications', '.local/bin', 'Downloads'].map(x => path.join(os.homedir(), x))) {
    let list = []; try { list = fs.readdirSync(d); } catch {}
    const hit = list.find(n => /artcraft.*\.appimage$/i.test(n)); if (hit) return path.join(d, hit);
  }
  return null;
}

module.exports = function connections({ P, store, uploads, visuals, postChat, nameOf, broadcast, isLocal }) {
  const FILE = '.tribe/connections.json', SEEN = '.tribe/connections-seen.json';
  const all = () => { const v = store.readJSON(FILE, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  const listOf = pid => (all()[pid] || []).filter(x => x && x.id);
  const saveList = (pid, list) => { const a = all(); a[pid] = list; store.writeJSON(FILE, a); };
  const pid = () => P.current() || P.defaultId();
  const str = (v, n) => String(v == null ? '' : v).replace(/[\x00-\x1f]/g, '').trim().slice(0, n);

  // ---------- validation ----------
  function appPath(v) {
    const p = str(v, 1024); if (!p) return { value: '' };
    if (!path.isAbsolute(p)) return { error: 'Use the full path to the app.' };
    let st; try { st = fs.statSync(p); } catch { return { error: `Nothing at ${p}.` }; }
    if (st.isFile() || (process.platform === 'darwin' && st.isDirectory() && /\.app$/i.test(p))) return { value: p };
    if (st.isDirectory()) {   // a folder like C:\Program Files\ArtCraft: take the app inside it
      let exes = []; try { exes = fs.readdirSync(p).filter(n => (process.platform === 'win32' ? /\.exe$/i.test(n) : /\.appimage$/i.test(n)) && !/unins/i.test(n)); } catch {}
      const pick = exes.find(n => /artcraft/i.test(n)) || exes[0];
      if (pick) return { value: path.join(p, pick) };
    }
    return { error: 'That is not an app.' };
  }
  function watchPath(v) {
    const p = str(v, 1024); if (!p) return { value: '' };
    if (!path.isAbsolute(p)) return { error: 'Use the full path to the folder.' };
    let st; try { st = fs.lstatSync(p); } catch { return { error: `No folder at ${p}.` }; }
    if (st.isSymbolicLink()) return { error: 'Pick the real folder, not a shortcut to it.' };
    if (!st.isDirectory()) return { error: 'That is not a folder.' };
    const r = path.resolve(p), root = path.resolve(store.root);
    if (r === root || root.startsWith(r + path.sep) || r.startsWith(root + path.sep)) return { error: 'Pick a folder outside the tribe folder.' };
    return { value: path.resolve(p) };
  }
  const linkOf = v => { const s = str(v, 500); if (!s) return { value: '' }; try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? { value: u.href } : { error: 'Links start with http:// or https://' }; } catch { return { error: 'That link does not look right.' }; } };
  const emojiOf = v => [...str(v, 16)].slice(0, 2).join('') || '🔗';

  // What a member sees: no local paths unless they are the host.
  function view(c, host) {
    const base = { id: c.id, kind: c.kind, name: c.name, emoji: c.emoji, link: c.link || '', hasApp: !!c.app, watching: !!c.watch, lastImport: c.lastImport || null, imported: c.imported || 0 };
    return host ? { ...base, app: c.app || '', watch: c.watch || '' } : base;
  }

  // ---------- the watcher ----------
  const seenAll = () => { const v = store.readJSON(SEEN, {}); return v && typeof v === 'object' ? v : {}; };
  const sizes = new Map();   // id|name -> size at the last poll (a file must stop growing before it is copied)
  function baseline(c) {   // what is already in the folder when it is picked is not "new"
    const s = seenAll(), m = {};
    for (const f of entries(c.watch)) m[f.name] = f.mtime;
    s[c.id] = m; store.writeJSON(SEEN, s);
  }
  function entries(dir) {
    let names = []; try { names = fs.readdirSync(dir); } catch { return []; }
    const out = [];
    for (const name of names) {
      if (!MEDIA.test(name) || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      let st; try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink() || !st.isFile()) continue;   // never follow links out of the picked folder
      if (path.dirname(full) !== dir) continue;
      out.push({ name, full, size: st.size, mtime: Math.floor(st.mtimeMs) });
    }
    return out;
  }
  let busy = false;
  function poll() {
    if (busy) return; busy = true;
    try {
      const a = all(); let seen = null, dirty = false, changed = false;
      for (const [p, list] of Object.entries(a)) for (const c of list || []) {
        if (!c || !c.watch) continue;
        seen = seen || seenAll();
        const m = seen[c.id] || (seen[c.id] = {}), fresh = [];
        for (const f of entries(c.watch)) {
          if (m[f.name] === f.mtime) continue;
          const k = c.id + '|' + f.name, prev = sizes.get(k); sizes.set(k, f.size);
          if (prev !== f.size || !f.size) continue;   // still being written: next poll
          m[f.name] = f.mtime; dirty = true; sizes.delete(k);
          if (f.size > MAX_MEDIA) continue;
          fresh.push(f);
        }
        if (!fresh.length) continue;
        const names = Object.keys(m); if (names.length > 3000) for (const n of names.slice(0, names.length - 3000)) delete m[n];
        P.inProject(p, () => {
          let n = 0;
          for (const f of fresh) {
            const file = uploads.addLocal(p, f.full, f.name, c.by || 'tribecode', c.name); if (!file) continue; n++;
            if (/\.png$/i.test(f.name) && f.size <= MAX_VISUAL) { try { visuals.add({ screen: c.name, data: fs.readFileSync(f.full).toString('base64'), note: f.name, by: c.by || 'tribecode' }); } catch {} }
          }
          if (n) {
            const vid = fresh.every(f => /\.(mp4|webm)$/i.test(f.name));
            postChat('general', 'tribecode', `${c.emoji || '🎨'} ${n} new ${vid ? (n === 1 ? 'video' : 'videos') : n === 1 ? 'render' : 'renders'} from ${c.name}`);
            c.lastImport = new Date().toISOString(); c.imported = (c.imported || 0) + n; changed = true;
          }
        });
      }
      if (dirty) store.writeJSON(SEEN, seen);
      if (changed) { store.writeJSON(FILE, a); if (broadcast) broadcast({ type: 'connections' }); }
    } catch (e) { console.error('connections watcher:', e.message); }
    finally { busy = false; }
  }
  const timer = setInterval(poll, POLL_MS); if (timer.unref) timer.unref();

  // ---------- launch ----------
  function launch(c) {
    const r = appPath(c.app); if (!r.value) return { error: r.error || 'No app path saved yet.' };
    if (r.value !== c.app) return { error: 'The saved app path changed. Save it again.' };
    const opts = { detached: true, stdio: 'ignore', shell: false, windowsHide: false, cwd: path.dirname(c.app) };
    const child = process.platform === 'darwin' && /\.app$/i.test(c.app) ? spawn('/usr/bin/open', [c.app], opts) : spawn(c.app, [], opts);
    child.on('error', e => console.error(`connections: could not start ${c.name}: ${e.message}`));
    child.unref();
    return { ok: true };
  }

  // ---------- API ----------
  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const host = me.role === 'host', here = host && isLocal(req), p = pid();
    if (!P.canSee(me, p)) return fail(res, 403, 'not in this project');
    if (!b && m === 'GET') {
      return send(res, 200, { host, local: here, connections: listOf(p).map(x => view(x, host)), ...(here ? { detect: { artcraft: detectArtCraft() }, platform: process.platform } : {}) });
    }
    // Everything else changes the host's computer: the host, from the host's own computer.
    if (!host) return fail(res, 403, 'only the host can change or open special connections');
    if (!here) return fail(res, 403, 'open this on the host\'s computer');
    const body = m === 'POST' || m === 'PATCH' ? await readBody(req).catch(() => ({})) : {};
    const fields = cur => {
      const out = { ...cur }, errs = [];
      if (body.name !== undefined) out.name = str(body.name, 40) || out.name;
      if (body.emoji !== undefined) out.emoji = emojiOf(body.emoji);
      for (const [k, fn] of [['app', appPath], ['watch', watchPath], ['link', linkOf]]) if (body[k] !== undefined) { const r = fn(body[k]); if (r.error) errs.push(r.error); else out[k] = r.value; }
      return { out, err: errs[0] };
    };
    if (!b && m === 'POST') {
      const list = listOf(p); if (list.length >= 24) return fail(res, 409, 'up to 24 special connections per project');
      const kind = body.kind === 'artcraft' ? 'artcraft' : 'custom';
      if (kind === 'artcraft' && list.some(x => x.kind === 'artcraft')) return fail(res, 409, 'ArtCraft is already connected in this project');
      const seed = kind === 'artcraft' ? { name: 'ArtCraft', emoji: '🎨' } : { name: '', emoji: '🔗' };
      if (kind === 'artcraft' && body.app === undefined) body.app = detectArtCraft() || '';
      const { out, err } = fields({ id: 'cx-' + crypto.randomBytes(5).toString('hex'), kind, name: seed.name, emoji: seed.emoji, app: '', watch: '', link: '', by: me.id, at: new Date().toISOString() });
      if (err) return fail(res, 400, err);
      if (!out.name) return fail(res, 400, 'Give it a name.');
      list.push(out); saveList(p, list); if (out.watch) baseline(out);
      if (broadcast) broadcast({ type: 'connections' });
      return send(res, 200, { connection: view(out, true) });
    }
    const list = listOf(p), i = list.findIndex(x => x.id === b);
    if (i < 0) return fail(res, 404, 'no such connection');
    if (!c && m === 'PATCH') {
      const before = list[i].watch, { out, err } = fields(list[i]); if (err) return fail(res, 400, err);
      list[i] = out; saveList(p, list); if (out.watch && out.watch !== before) baseline(out);
      if (broadcast) broadcast({ type: 'connections' });
      return send(res, 200, { connection: view(out, true) });
    }
    if (!c && m === 'DELETE') {
      list.splice(i, 1); saveList(p, list);
      const s = seenAll(); delete s[b]; store.writeJSON(SEEN, s);
      if (broadcast) broadcast({ type: 'connections' });
      return send(res, 200, { ok: true });
    }
    if (c === 'launch' && m === 'POST') {
      const r = launch(list[i]); return r.error ? fail(res, 400, r.error) : send(res, 200, { ok: true, name: list[i].name });
    }
    return fail(res, 405, 'not allowed');
  }
  return { route, poll, detectArtCraft, stop: () => clearInterval(timer) };
};
module.exports.detectArtCraft = detectArtCraft;
