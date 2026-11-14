// The Guide (app/ui/guide.js): short how-to pages kept as Markdown in docs/guide/*.md, served read-only.
//   GET /api/guide         -> { pages: [{ slug, title, summary, body }], paths: [same shape] } in file order (01-…, 02-…)
//   GET /api/guide/<slug>  -> { slug, title, summary, body }
// Only that folder is read. A slug is [a-z0-9-] and must match a file that was listed, so nothing like
// "..%2f..%2fpackage.json" can reach another path (400 for a bad slug, 404 for an unknown one).
// Public on purpose: the pages are the same as in the repo and hold no tribe data.
// Where the folder is: docs/guide next to the server (source checkout), or <ui>/../guide (the desktop app
// ships it as a resource beside ui/, see app/src-tauri/tauri.conf.json), or TRIBE_GUIDE.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
const MAX = 64 * 1024;

module.exports = function makeGuide({ ui } = {}) {
  const dirs = [process.env.TRIBE_GUIDE, path.join(__dirname, '..', 'docs', 'guide'), ui && path.join(ui, '..', 'guide'), ui && path.join(ui, '..', '..', 'docs', 'guide')].filter(Boolean);
  const dir = () => dirs.find(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } }) || null;

  let cache = null, cacheAt = 0, pathCache = [];
  // feat/help-next: files named p-<path>-<level>.md are the Help center's path pages (Basics · In practice · Production).
  // They are served beside the numbered pages as `paths`, not in the page list.
  function pages() {
    if (cache && Date.now() - cacheAt < 5000) return cache;   // live edits show up within seconds
    const d = dir(); if (!d) return (cache = [], cacheAt = Date.now(), cache);
    let files = [];
    try { files = fs.readdirSync(d).filter(f => /^[a-z0-9][a-z0-9-]*\.md$/.test(f)).sort(); } catch {}
    const all = files.map(f => {
      const full = path.join(d, f);
      if (path.dirname(full) !== d) return null;
      let body = '';
      try { const st = fs.lstatSync(full); if (!st.isFile() || st.size > MAX) return null; body = fs.readFileSync(full, 'utf8').replace(/\r/g, ''); } catch { return null; }
      const slug = f.replace(/\.md$/, '').replace(/^\d+-/, '');
      const h = /^#\s+(.+)$/m.exec(body), title = h ? h[1].trim() : slug;
      const rest = h ? body.slice(h.index + h[0].length) : body;
      const para = rest.split(/\n\s*\n/).map(s => s.trim()).find(s => s && !/^(#|\||-|\d+\.|```)/.test(s)) || '';
      const summary = para.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').slice(0, 160);
      return SLUG.test(slug) ? { slug, title, summary, body } : null;
    }).filter(Boolean);
    cache = all.filter(x => !/^p-/.test(x.slug)); pathCache = all.filter(x => /^p-/.test(x.slug)).map(x => ({ ...x, slug: x.slug.slice(2) }));
    cacheAt = Date.now();
    return cache;
  }

  async function route(req, res, { m, b, parts, send, fail }) {
    if (m !== 'GET') return fail(res, 405, 'the guide is read-only');
    if (!b) return send(res, 200, { pages: pages(), paths: paths() });
    if (parts.length > 2 || !SLUG.test(b)) return fail(res, 400, 'bad page name');
    const p = pages().find(x => x.slug === b) || paths().find(x => x.slug === b);
    return p ? send(res, 200, p) : fail(res, 404, 'no such page');
  }
  const paths = () => { pages(); return pathCache; };
  return { route, pages, paths, dir };
};
