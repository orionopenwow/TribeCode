// feat/dropzone: the desktop app's drops. Tauri hands the page real paths (tauri://drag-drop), not File objects, so the
// page asks the host (this computer, the same machine) to list and read them. Host only, and only from this computer
// (127.0.0.1 with no proxy headers): it is the host's own disk, the same power "Create a project from a folder" has.
//   POST /api/dropzone/scan  { paths: [abs] }        -> { roots: [{ path, name, dir }], files: [{ root, path, size }], truncated }
//   GET  /api/dropzone/file?root=<abs>&path=<rel>    -> the bytes (octet-stream)
// Safety: every root is realpath'ed; the walk never follows a symlink (lstat), never enters .git, stops at 12 levels and
// MAX_LIST entries; a file path is relative, has no "..", resolves (realpath) inside its root and is a plain file of at
// most 50 MB. Key and .env files are listed (so the page can flag them) but never read here. Nothing is ever executed.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MAX_LIST = 5000, MAX_DEPTH = 12, MAX_BYTES = 50 * 1024 * 1024;
const SECRET = /^(\.env(\..*)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|keystore|jks|kdbx|asc|gpg)|credentials(\..*)?|secrets?(\..*)?|\.npmrc|\.netrc|\.htpasswd)$/i;

module.exports = function dropzone({ isLocal }) {
  const real = p => { try { return fs.realpathSync(p); } catch { return null; } };
  function scan(paths) {
    const roots = [], files = []; let truncated = false;
    for (const p of (Array.isArray(paths) ? paths : []).slice(0, 50)) {
      if (typeof p !== 'string' || !path.isAbsolute(p)) continue;
      let st; try { st = fs.lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      const r = real(p); if (!r) continue;
      if (st.isFile()) { roots.push({ path: path.dirname(r), name: path.basename(r), dir: false }); files.push({ root: path.dirname(r), path: path.basename(r), size: st.size }); continue; }
      if (!st.isDirectory()) continue;
      roots.push({ path: r, name: path.basename(r), dir: true });
      const walk = (rel, depth) => {
        if (depth > MAX_DEPTH || truncated) return;
        let ents; try { ents = fs.readdirSync(path.join(r, rel), { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          if (files.length >= MAX_LIST) { truncated = true; return; }
          if (e.isSymbolicLink()) continue;
          const sub = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) { if (e.name !== '.git') walk(sub, depth + 1); continue; }
          if (!e.isFile()) continue;
          let size = 0; try { size = fs.lstatSync(path.join(r, sub)).size; } catch { continue; }
          files.push({ root: r, path: `${path.basename(r)}/${sub}`, size });
        }
      };
      walk('', 0);
    }
    return { roots, files, truncated };
  }
  function file(root, rel) {
    const r = real(root || ''); if (!r || !path.isAbsolute(root)) throw Object.assign(new Error('not found'), { status: 404 });
    const parts = String(rel || '').split(/[\\/]+/).filter(Boolean);
    if (!parts.length || parts.some(x => x === '..' || x === '.')) throw Object.assign(new Error('bad path'), { status: 400 });
    if (SECRET.test(parts[parts.length - 1])) throw Object.assign(new Error('key and .env files are not read'), { status: 403 });
    // the listing names files "<root name>/<sub>" for folders; a single dropped file is just its name
    const sub = parts[0] === path.basename(r) && fs.existsSync(path.join(r, ...parts.slice(1))) && parts.length > 1 ? parts.slice(1) : parts;
    const abs = path.join(r, ...sub);
    let st; try { st = fs.lstatSync(abs); } catch { throw Object.assign(new Error('not found'), { status: 404 }); }
    if (st.isSymbolicLink() || !st.isFile()) throw Object.assign(new Error('not a plain file'), { status: 400 });
    const ra = real(abs); if (!ra || (ra !== r && !ra.startsWith(r + path.sep))) throw Object.assign(new Error('outside the folder'), { status: 400 });
    if (st.size > MAX_BYTES) throw Object.assign(new Error('over 50 MB'), { status: 413 });
    return ra;
  }
  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role !== 'host' || !isLocal(req)) return fail(res, 403, 'only the host, on this computer');
    try {
      if (b === 'scan' && m === 'POST') { const body = await readBody(req); return send(res, 200, scan(body.paths)); }
      if (b === 'file' && m === 'GET') {
        const f = file(url.searchParams.get('root'), url.searchParams.get('path'));
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(f).size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
        return fs.createReadStream(f).pipe(res);
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 405, 'not allowed');
  }
  return { route, scan };
};
