// Canvas -> code (P1-C, docs/EDITOR-PARITY.md): "Send to app" writes a design frame into the project's code as plain
// HTML + CSS, commits it, and the live preview reloads on its own. The browser makes the markup (app/ui/canvas/scene.js
// toHTML: flex for auto layout, escaped text, class names from layer names); this module decides where it goes and keeps
// the rest of the file alone.
//
// Where: design/<frame-name>.html by default (a small standalone page), or into an existing page the person picks.
// Each frame owns two marked regions in its file:
//     /* tribecode:design <key> */ ...css... /* /tribecode:design <key> */          inside a <style> in <head>
//     <!-- tribecode:design <key> --> ...html... <!-- /tribecode:design <key> -->    in <body>
// Sending again replaces only what's between the markers, so hand edits anywhere else in the file survive. The frame ->
// file link is kept per project in .tribe/canvascode.json, so a second send updates the same file.
//
//   GET  /api/canvascode                     -> { links: { [file:frame]: { path, at, by } }, pages: [path], canEdit, hasRepo }
//   POST /api/canvascode/send { file, frame, name, html, css, path? } -> { path, href, created, commit }
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MAX = 400 * 1024;

module.exports = function canvasCode({ P, W, base, getMembers = () => [], broadcast = () => {}, ensureRepo = null, log = () => {} }) {
  const err = (status, m) => Object.assign(new Error(m), { status });
  const relOf = pid => (pid === P.defaultId() ? '' : `projects/${pid}/`) + '.tribe/canvascode.json';
  const roleIn = (me, pid) => ((P.get(pid) || {}).members || {})[me.id] || me.role;
  const canEdit = (me, pid) => !!me && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator';
  const isHost = (me, pid) => !!me && (me.role === 'host' || roleIn(me, pid) === 'host');
  const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'design';
  const keyOf = (file, frame) => `${String(file || 'main').replace(/[^\w-]/g, '').slice(0, 40)}:${String(frame || '').replace(/[^\w-]/g, '').slice(0, 40)}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function repoOf(pid) { const p = P.get(pid); return p && p.repo && W.isRepo && W.isRepo(p.repo) ? p.repo : null; }
  // A clean relative .html path inside the repo, or a 400.
  function cleanPath(repo, rel) {
    const s = String(rel || '').replace(/\\/g, '/').trim();
    if (!s || s.length > 300 || s.includes('\0') || /^\//.test(s) || /^[a-z]:/i.test(s)) throw err(400, 'pick a page inside the project');
    const segs = s.split('/').filter(x => x && x !== '.');
    if (segs.some(x => x === '..' || x === '.git' || x === 'node_modules' || x.startsWith('.'))) throw err(400, 'pick a page inside the project');
    if (!/\.html?$/i.test(segs[segs.length - 1])) throw err(400, 'designs go into an .html page');
    const full = path.resolve(repo, ...segs);
    if (!full.startsWith(path.resolve(repo) + path.sep)) throw err(400, 'pick a page inside the project');
    return { rel: segs.join('/'), full };
  }
  // The pages a design can go into: .html files near the top of the repo.
  function pages(repo) {
    const out = [];
    const walk = (dir, rel, depth) => {
      let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const d of list) {
        if (d.name.startsWith('.') || d.name === 'node_modules' || d.name === 'dist') continue;
        const r = rel ? `${rel}/${d.name}` : d.name;
        if (d.isDirectory() && depth < 2) walk(path.join(dir, d.name), r, depth + 1);
        else if (d.isFile() && /\.html?$/i.test(d.name)) out.push(r);
        if (out.length >= 80) return;
      }
    };
    walk(repo, '', 0);
    return out.sort();
  }

  // The markup comes from our own exporter, but anyone with edit rights could post anything: refuse scripts and handlers.
  function check(html, css) {
    if (typeof html !== 'string' || typeof css !== 'string' || !html.trim()) throw err(400, 'nothing to send');
    if (html.length + css.length > MAX) throw err(413, 'that frame is too big to send in one go');
    if (/<\s*\/?\s*(script|iframe|object|embed|link|meta|base|form)\b/i.test(html) || /\son[a-z]+\s*=/i.test(html) || /javascript:/i.test(html)) throw err(400, 'the design has markup that isn\'t allowed in a design');
    if (/<\/style|@import|expression\s*\(|javascript:/i.test(css)) throw err(400, 'the design has CSS that isn\'t allowed');
  }

  const cssMark = key => [`/* tribecode:design ${key} */`, `/* /tribecode:design ${key} */`];
  const htmlMark = key => [`<!-- tribecode:design ${key} -->`, `<!-- /tribecode:design ${key} -->`];
  function between(src, [a, b], body) {
    const i = src.indexOf(a), j = i >= 0 ? src.indexOf(b, i + a.length) : -1;
    if (i < 0 || j < 0) return null;
    return src.slice(0, i + a.length) + '\n' + body + '\n' + src.slice(j);
  }
  function page(name, key, html, css) {
    const [ca, cb] = cssMark(key), [ha, hb] = htmlMark(key);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
<!-- Made on the TribeCode design canvas. "Send to app" again replaces only the marked parts; edit anything else freely. -->
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #F4F5F7; font-family: 'Inter', system-ui, sans-serif; }
${ca}
${css}
${cb}
</style>
</head>
<body>
${ha}
${html}
${hb}
</body>
</html>
`;
  }
  // Put (or replace) the frame's two regions in an existing file.
  function merge(src, key, html, css) {
    let out = between(src, cssMark(key), css);
    if (out == null) {
      const [ca, cb] = cssMark(key), block = `<style>\n${ca}\n${css}\n${cb}\n</style>\n`;
      out = /<\/head>/i.test(src) ? src.replace(/<\/head>/i, block + '</head>') : block + src;
    }
    const h = between(out, htmlMark(key), html);
    if (h != null) return h;
    const [ha, hb] = htmlMark(key), block = `${ha}\n${html}\n${hb}\n`;
    return /<\/body>/i.test(out) ? out.replace(/<\/body>/i, block + '</body>') : out + '\n' + block;
  }

  async function send(pid, me, body) {
    if (!canEdit(me, pid)) throw err(403, 'only builders can send designs to the app');
    const html = body.html, css = String(body.css || '');
    check(html, css);
    let repo = repoOf(pid);
    if (!repo) {
      if (!isHost(me, pid) || !ensureRepo) throw err(409, 'this project has no code yet. Ask the host to start it');
      repo = (await ensureRepo(pid, me)).repo;
    }
    const key = keyOf(body.file, body.frame);
    const db = base.readJSON(relOf(pid), { links: {} });
    db.links = db.links || {};
    const link = db.links[key];
    const name = String(body.name || 'Design').slice(0, 80);
    let target;
    if (body.path) target = cleanPath(repo, body.path);
    else if (link && link.path) target = cleanPath(repo, link.path);
    else {
      let rel = `design/${slug(name)}.html`, k = 2;
      while (fs.existsSync(path.join(repo, ...rel.split('/'))) && !Object.values(db.links).some(l => l.path === rel)) rel = `design/${slug(name)}-${k++}.html`;
      target = cleanPath(repo, rel);
    }
    const exists = fs.existsSync(target.full);
    const src = exists ? fs.readFileSync(target.full, 'utf8') : '';
    const next = exists ? merge(src, key, html, css) : page(name, key, html, css);
    fs.mkdirSync(path.dirname(target.full), { recursive: true });
    if (next !== src) fs.writeFileSync(target.full, next);
    db.links[key] = { path: target.rel, at: new Date().toISOString(), by: me.id, name };
    try { fs.mkdirSync(path.dirname(base.p(relOf(pid))), { recursive: true }); } catch {}
    base.writeJSON(relOf(pid), db);
    let commit = false;
    if (next !== src && W.git) {
      const mem = getMembers().find(m => m.id === me.id) || me;
      await W.git(['add', '--', target.rel], repo);
      const g = await W.git([...(W.identity ? W.identity(mem) : []), 'commit', '-q', '-m', `Design: ${name} from the canvas (via TribeCode)`, '--', target.rel], repo);
      commit = !(g && g.code);
      if (g && g.code && !/nothing to commit/i.test(String(g.out || '') + String(g.err || ''))) log(`canvas send commit: ${String(g.err || g.out || '').slice(0, 160)}`);
    }
    broadcast({ type: 'repo', project: pid });
    log(`canvas -> code: ${key} -> ${target.rel}${exists ? '' : ' (new)'}`);
    return { path: target.rel, href: target.rel, created: !exists, changed: next !== src, commit };
  }

  async function route(req, res, { m, b, me, readBody, send: out, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current() || P.defaultId();
    if (!pid || (P.canSee && !P.canSee(me, pid))) return fail(res, 404, 'project not found');
    try {
      if (!b && m === 'GET') {
        const repo = repoOf(pid);
        return out(res, 200, { links: (base.readJSON(relOf(pid), { links: {} }).links) || {}, pages: repo ? pages(repo) : [], canEdit: canEdit(me, pid), hasRepo: !!repo });
      }
      if (b === 'send' && m === 'POST') {
        const body = await readBody(req, MAX + 8 * 1024);
        return out(res, 200, await send(pid, me, body || {}));
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 404, 'no such route');
  }
  return { route, send, merge };
};
