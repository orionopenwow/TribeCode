// Asset files for the viewers (app/ui/viewers.js, docs/VIEWERS.md): 3D models (GLB/glTF) and pixel art (PNG sprite
// sheets, GIFs, Aseprite/TexturePacker JSON sheets) inside the project's repo.
//   GET /api/files[?project=]            -> { assets: [{ path, kind: 'model'|'sprite', size, sheet? }], total, more }
//   GET /api/files/raw/<path>?project=   -> the file's bytes (members of the project; ?token= works for loaders)
// Only asset types are served (models, their buffers and textures, images, sheet JSON), never dotfiles, dot
// folders, node_modules or key/secret files, and always with nosniff + a sandbox CSP so nothing renders as a page.
// The viewers parse the bytes in the main page (GLTFLoader / canvas); file contents are never evaluated.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const VIEW = { '.glb': 'model', '.gltf': 'model', '.png': 'sprite', '.gif': 'sprite' };
const RAW = {
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.gif': 'image/gif',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.json': 'application/json; charset=utf-8',
};
const SKIP = new Set(['node_modules', 'bower_components', 'target', 'Pods', '__pycache__', 'venv']);
const SECRET = /^(id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|keystore|jks|kdbx|asc|gpg)|credentials(\..*)?|secrets?(\..*)?)$/i;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_LIST = 300;

module.exports = function files({ P }) {
  const repoOf = () => { const p = P.get(P.current() || P.defaultId()); if (!p || !p.repo) return null; try { return fs.realpathSync(p.repo); } catch { return null; } };
  const cache = new Map();   // repo -> { at, out }

  function list(repo) {
    const hit = cache.get(repo); if (hit && Date.now() - hit.at < 5000) return hit.out;
    const found = []; let seen = 0;
    const walk = (rel, depth) => {
      if (depth > 7 || seen > 20000) return;
      let ents; try { ents = fs.readdirSync(path.join(repo, rel), { withFileTypes: true }); } catch { return; }
      const names = new Set(ents.map(e => e.name));
      for (const e of ents) {
        seen++;
        if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { walk(r, depth + 1); continue; }
        if (!e.isFile()) continue;
        const ext = path.extname(e.name).toLowerCase(), kind = VIEW[ext];
        if (!kind || SECRET.test(e.name)) continue;
        let size = 0; try { size = fs.statSync(path.join(repo, r)).size; } catch { continue; }
        const json = e.name.slice(0, -ext.length) + '.json';
        found.push({ path: r, kind, size, ...(ext === '.png' && names.has(json) ? { sheet: rel ? `${rel}/${json}` : json } : {}), ...(ext === '.gif' ? { gif: true } : {}) });
      }
    };
    walk('', 0);
    // models first, then animated things (GIFs, PNGs with a sheet JSON), then the other PNGs; shallow before deep
    const rank = a => (a.kind === 'model' ? 0 : a.gif || a.sheet ? 1 : 2);
    found.sort((a, b) => rank(a) - rank(b) || a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
    const out = { assets: found.slice(0, MAX_LIST), total: found.length, more: found.length > MAX_LIST };
    cache.set(repo, { at: Date.now(), out });
    return out;
  }

  function raw(res, repo, rel, fail) {
    const segs = rel.split('/');
    if (!rel || segs.some(s => !s || s === '..' || s.startsWith('.') || SKIP.has(s)) || SECRET.test(segs[segs.length - 1])) return fail(res, 404, 'not found');
    const type = RAW[path.extname(rel).toLowerCase()]; if (!type) return fail(res, 404, 'not an asset type');
    let real; try { real = fs.realpathSync(path.join(repo, ...segs)); } catch { return fail(res, 404, 'not found'); }
    if (!real.startsWith(repo + path.sep)) return fail(res, 404, 'not found');
    let st; try { st = fs.statSync(real); } catch { return fail(res, 404, 'not found'); }
    if (!st.isFile() || st.size > MAX_BYTES) return fail(res, st.isFile() ? 413 : 404, st.isFile() ? 'too big to view' : 'not found');
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-cache', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(real).pipe(res);
  }

  async function route(req, res, { m, b, me, url, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m !== 'GET') return fail(res, 405, 'GET');
    const repo = repoOf();
    if (!b) return send(res, 200, repo ? { ...list(repo), hasRepo: true } : { assets: [], total: 0, more: false, hasRepo: false });
    if (b === 'raw') {
      if (!repo) return fail(res, 404, 'this project has no repo');
      let rel; try { rel = decodeURIComponent(url.pathname.replace(/^\/api\/files\/raw\/?/, '')); } catch { return fail(res, 400, 'bad path'); }
      return raw(res, repo, rel.replace(/\\/g, '/'), fail);
    }
    return fail(res, 404, 'not found');
  }
  return { route, list };
};
