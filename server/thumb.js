// The pinned repo's thumbnail ("Flare": the one hero area per screen may carry real imagery).
// Source, in order:
//   1. the first real image in the repo's README (a local file inside the repo, or an absolute http(s) URL;
//      badges are skipped). A GitHub remote with no README image uses GitHub's own card for the repo.
//   2. else the latest screenshot of the running app (server/visuals.js).
//   3. else a flat generated tile: the repo's initials on the project color.
// Cached per project; the cache key is the README's mtime + the newest screenshot, so it refreshes when either changes.
//   GET /api/thumb                  -> { thumb: { kind: 'readme'|'github'|'screenshot'|'tile', src?, initials, color, name } }
//   GET /api/thumb/file?p=<path>    -> the README image (image files inside the repo only)
'use strict';
const fs = require('fs');
const path = require('path');

const IMG = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif' };
const BADGE = /shields\.io|badge|badgen\.net|travis-ci|circleci|codecov|coveralls|github\.com\/[^)\s]+\/workflows\/|\/actions\/workflows\/|img\.youtube|gitter\.im|herokucdn\.com\/deploy/i;

module.exports = function thumb({ P, visuals }) {
  const cache = new Map();   // pid -> { key, thumb }

  const readmeOf = repo => {
    if (!repo) return null;
    let names = []; try { names = fs.readdirSync(repo); } catch { return null; }
    const n = names.find(f => /^readme\.(md|markdown|mdx)$/i.test(f)) || names.find(f => /^readme(\.txt)?$/i.test(f));
    if (!n) return null;
    const file = path.join(repo, n);
    try { const st = fs.statSync(file); return st.size > 2e6 ? null : { file, mtime: st.mtimeMs, text: fs.readFileSync(file, 'utf8') }; } catch { return null; }
  };
  // Image references in Markdown and HTML, in document order.
  function images(md) {
    const out = [], re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']|^\s*\[[^\]]+\]:\s*(\S+\.(?:png|jpe?g|gif|webp|svg|avif))\b/gim;
    let m; while ((m = re.exec(md))) out.push(m[1] || m[2] || m[3]);
    return out.filter(u => u && !BADGE.test(u) && !/^data:/i.test(u));
  }
  const inside = (root, f) => { const r = path.resolve(root) + path.sep; return path.resolve(f).startsWith(r); };
  function githubOf(repo) {
    try {
      const cfg = fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8');
      const m = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(cfg); if (!m) return null;
      const g = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(m[1]);
      return g ? { owner: g[1], repo: g[2] } : null;
    } catch { return null; }
  }
  function latestShot() {
    let best = null;
    try { for (const s of visuals.screens()) if (s.latest && (!best || String(s.latest.ts) > String(best.ts))) best = s.latest; } catch {}
    return best;
  }
  const initials = name => String(name || '?').replace(/[-_.]+/g, ' ').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  function compute(p, rd, shot) {
    const repo = p.repo, gh = repo ? githubOf(repo) : null;
    const name = gh ? `${gh.owner}/${gh.repo}` : repo ? path.basename(repo) : p.name;
    const base = { name, initials: initials(gh ? gh.repo : repo ? path.basename(repo) : p.name), color: p.color || '#F26B1D' };
    if (rd) {
      for (const ref of images(rd.text)) {
        if (/^https?:\/\//i.test(ref)) return { ...base, kind: 'readme', src: ref };
        const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
        const f = clean.startsWith('/') ? path.resolve(repo, '.' + clean) : path.resolve(path.dirname(rd.file), clean);
        if (IMG[path.extname(f).toLowerCase()] && inside(repo, f) && fs.existsSync(f)) return { ...base, kind: 'readme', src: `/api/thumb/file?p=${encodeURIComponent(path.relative(repo, f).split(path.sep).join('/'))}` };
      }
    }
    if (gh) return { ...base, kind: 'github', src: `https://opengraph.githubassets.com/1/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}` };
    if (shot) return { ...base, kind: 'screenshot', src: `/api/visuals/${encodeURIComponent(shot.screen)}/${encodeURIComponent(shot.ts)}.png` };
    return { ...base, kind: 'tile' };
  }
  function get(pid) {
    const p = P.get(pid || P.current() || P.defaultId()) || P.get(P.defaultId()); if (!p) return null;
    const rd = readmeOf(p.repo), shot = latestShot();
    const key = `${p.repo || ''}|${rd ? rd.mtime : 0}|${shot ? shot.screen + '/' + shot.ts : ''}|${p.name}|${p.color}`;
    const hit = cache.get(p.id); if (hit && hit.key === key) return hit.thumb;
    const t = { ...compute(p, rd, shot), at: new Date().toISOString() };
    cache.set(p.id, { key, thumb: t });
    return t;
  }

  async function route(req, res, { m, b, me, url, send, fail }) {
    if (m !== 'GET') return null;
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!b) return send(res, 200, { thumb: get() });
    if (b === 'file') {
      const p = P.get(P.current() || P.defaultId()); const repo = p && p.repo;
      const rel = String(url.searchParams.get('p') || ''), f = repo ? path.resolve(repo, rel) : '';
      const type = IMG[path.extname(f).toLowerCase()];
      if (!repo || !rel || !type || !inside(repo, f) || /(^|[\\/])\.git([\\/]|$)/.test(rel)) return fail(res, 404, 'not found');
      let st; try { st = fs.statSync(f); } catch { return fail(res, 404, 'not found'); }
      if (!st.isFile() || st.size > 8 * 1024 * 1024) return fail(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', ...(type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}) });
      return fs.createReadStream(f).pipe(res);
    }
    return null;
  }
  return { get, route, images };
};
