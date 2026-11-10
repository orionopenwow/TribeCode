// Website template library (feat/site-templates): ~16 real, distinct website templates in templates/sites/<id>/
// (link in bio, merch shop, portfolio, café, band, wedding, podcast, blog, …), each driven by its site.json.
//   GET  /api/site-library                         { templates: [{ id, title, category, summary, goodFor, tags, thumb }], categories }
//   GET  /api/site-library/:id/thumb.png           the gallery thumbnail (rendered from the template itself)
//   POST /api/projects/:id/site-library            { template, name?, accent?, level? } builders: copy it into the repo
//          (the top, or builds/<slug>/ when the repo already has a page), fill in the name, render and commit.
//          -> { dir, href, files, template, level }
//   GET  /api/projects/:id/site-data?dir=          { data, form, presets, dir, files }  (the site.json of a site in the repo)
//   PUT  /api/projects/:id/site-data   { dir, data }   save site.json and re-render the pages (no commit; "Done" saves a version)
//   POST /api/projects/:id/site-data/image { dir, name, data: 'data:image/…;base64,…' } -> { path }  (Easy mode photos)
// Rendering (also used by Flint's free builds, server/flintfree.js): the same marker rules site.js uses in the
// browser (data-s, data-s-attr, <template data-s-for>…<!--/s-for-->, data-s-sections, #s-theme, #site-data),
// done on the HTML text so the pages in the repo are complete static files.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const CATEGORIES = [
  { id: 'personal', label: 'Personal' }, { id: 'business', label: 'Business' }, { id: 'shop', label: 'Shop' },
  { id: 'creative', label: 'Creative' }, { id: 'events', label: 'Events' }, { id: 'writing', label: 'Writing & audio' },
];
const PAGE = /\.html?$/i;
const SAFE_DIR = /^(?:[A-Za-z0-9._-]+\/){0,4}[A-Za-z0-9._-]*$/;
const COLOR = /^#[0-9a-f]{3,8}$/i;

module.exports = function siteLib({ P, W, root, getMembers = () => [], broadcast = () => {}, ensureRepo = null, log = () => {} }) {
  const LIB = path.join(root, 'templates', 'sites');
  const FONTS = [path.join(root, 'app', 'ui', 'assets', 'site-fonts'), path.join(root, 'ui', 'assets', 'site-fonts')].find(d => fs.existsSync(d)) || path.join(root, 'app', 'ui', 'assets', 'site-fonts');
  // the same small renderer the pages use in the browser (read from the file, so the desktop app's bundled server finds it too)
  const KIT = (() => { const mod = { exports: {} }; new Function('module', fs.readFileSync(path.join(LIB, '_kit', 'site.js'), 'utf8'))(mod); return mod.exports; })();
  const err = (status, m) => Object.assign(new Error(m), { status });
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site';
  const roleIn = (me, pid) => ((P.get(pid) || {}).members || {})[me.id] || me.role;
  const canEdit = (me, pid) => !!me && me.role !== 'agent' && me.role !== 'spectator' && roleIn(me, pid) !== 'spectator';
  const isHost = (me, pid) => !!me && (me.role === 'host' || roleIn(me, pid) === 'host');

  // ---------- the catalog ----------
  let cache = null;
  function catalog() {
    if (cache) return cache;
    const out = [];
    for (const id of fs.readdirSync(LIB).sort()) {
      if (id.startsWith('_') || id.startsWith('.')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(LIB, id, 'site.json'), 'utf8'));
        const m = j.meta || {};
        out.push({ id, title: m.title || id, category: m.category || 'business', summary: m.summary || '', goodFor: m.goodFor || [], tags: m.tags || [], order: m.order || 99,
          thumb: fs.existsSync(path.join(LIB, id, 'thumb.png')) ? `/api/site-library/${id}/thumb.png` : '' });
      } catch (e) { log(`site template ${id}: ${e.message}`); }
    }
    cache = out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    return cache;
  }
  const byId = id => catalog().find(t => t.id === id);

  // ---------- rendering the HTML text from site data ----------
  const escJson = d => JSON.stringify(d, null, 2).replace(/</g, '\\u003c');
  function setAttr(tag, a, v) {
    const ev = KIT.esc(v), rx = new RegExp(`(\\s${a}=)("[^"]*"|'[^']*')`, 'i');
    if (rx.test(tag)) return tag.replace(rx, `$1"${ev}"`);
    return tag.replace(/\s*(\/?)>$/, ` ${a}="${ev}"$1>`);
  }
  function render(html, data) {
    html = html.replace(/(<style id="s-theme">)[\s\S]*?(<\/style>)/, (m, a, b) => a + KIT.themeCss(data.theme) + b);
    html = html.replace(/(<script type="application\/json" id="site-data">)[\s\S]*?(<\/script>)/, (m, a, b) => a + '\n' + escJson(data) + '\n' + b);
    if (data.theme && data.theme.preset) html = html.replace(/<html([^>]*)>/i, (m, at) => `<html${at.replace(/\sdata-preset="[^"]*"/, '')} data-preset="${KIT.esc(data.theme.preset)}">`);
    // lists first, so their {{…}} templates aren't touched by the text rules below
    html = html.replace(/(<template data-s-for="([\w.]+)">)([\s\S]*?)(<\/template>)[\s\S]*?(<!--\/s-for-->)/g,
      (m, open, k, inner, close, end) => open + inner + close + KIT.mus(`{{#${k}}}${inner}{{/${k}}}`, data) + end);
    const parts = html.split(/(<template data-s-for="[\w.]+">[\s\S]*?<\/template>)/);
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i]
        .replace(/(<([a-z][a-z0-9]*)\b[^>]*\sdata-s="([\w.]+)"[^>]*>)([^<]*)(<\/\2>)/gi, (m, open, tag, k, inner, close) => { const v = KIT.get(data, k); return v == null ? m : open + KIT.esc(v) + close; })
        .replace(/<[a-z][a-z0-9]*\b[^>]*\sdata-s-attr="([^"]+)"[^>]*>/gi, (tag, spec) => {
          for (const pair of spec.split(';')) {
            const i = pair.indexOf(':'); if (i < 1) continue;
            const a = pair.slice(0, i).trim(), v = KIT.attrVal(data, pair.slice(i + 1).trim());
            if (v == null || !/^[a-z-]+$/i.test(a) || /^on/i.test(a) || (/^(href|src|action)$/i.test(a) && /^\s*javascript:/i.test(String(v)))) continue;
            tag = setAttr(tag, a, String(v));
          }
          return tag;
        });
    }
    html = parts.join('');
    // sections: order and on/off
    if (Array.isArray(data.sections)) {
      const off = new Set(data.sections.filter(s => s.on === false).map(s => s.id));
      html = html.replace(/<section\b([^>]*)\sdata-section="([\w-]+)"([^>]*)>/g, (m, a, id, b) => {
        const noHide = s => s.replace(/\shidden(?:="[^"]*")?/g, '');
        return `<section${noHide(a)} data-section="${id}"${noHide(b)}${off.has(id) ? ' hidden' : ''}>`;
      });
      html = html.replace(/(<main\b[^>]*\sdata-s-sections[^>]*>)([\s\S]*?)(<\/main>)/, (m, open, body, close) => {
        const blocks = []; const rx = /<section\b[^>]*\sdata-section="([\w-]+)"[^>]*>[\s\S]*?<\/section>/g; let mm, first = -1, last = 0;
        while ((mm = rx.exec(body))) { if (first < 0) first = mm.index; blocks.push({ id: mm[1], text: mm[0] }); last = rx.lastIndex; }
        if (!blocks.length) return m;
        const order = data.sections.map(s => s.id), sorted = [...blocks].sort((x, y) => (order.indexOf(x.id) + 1 || 999) - (order.indexOf(y.id) + 1 || 999));
        return open + body.slice(0, first) + sorted.map(b => b.text).join('\n\n    ') + body.slice(last) + close;
      });
    }
    return html;
  }

  // ---------- site data: validation ----------
  function clean(v, depth = 0) {
    if (depth > 6) return null;
    if (v == null || typeof v === 'boolean' || typeof v === 'number') return v;
    if (typeof v === 'string') return v.slice(0, 4000);
    if (Array.isArray(v)) return v.slice(0, 200).map(x => clean(x, depth + 1));
    if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v).slice(0, 80)) if (/^[\w.@-]{1,40}$/.test(k)) o[k] = clean(v[k], depth + 1); return o; }
    return null;
  }
  function validTheme(d) {
    const th = d.theme || {};
    if (th.colors) for (const k of Object.keys(th.colors)) if (!COLOR.test(String(th.colors[k]))) delete th.colors[k];
    if (th.fonts) for (const k of Object.keys(th.fonts)) if (!(String(th.fonts[k]) in KIT.FONTS)) delete th.fonts[k];
    return d;
  }

  // ---------- copying a template into a repo ----------
  // every template gets all the bundled fonts (about 250 KB, SIL OFL 1.1, licenses alongside), so switching fonts in
  // Customize always works; templates/sites/_kit/fonts.css declares them
  function fontFiles() { try { return fs.readdirSync(FONTS).filter(n => /\.(woff2|txt)$/.test(n)); } catch { return []; } }
  function copyInto(id, dest, data) {
    const src = path.join(LIB, id), kit = path.join(LIB, '_kit'), out = [];
    const walk = (s, d, rel = '') => {
      for (const f of fs.readdirSync(s, { withFileTypes: true })) {
        if (f.name.startsWith('.') || f.name === 'thumb.png') continue;
        const sp = path.join(s, f.name), dp = path.join(d, f.name), r = rel ? `${rel}/${f.name}` : f.name;
        if (f.isDirectory()) { fs.mkdirSync(dp, { recursive: true }); walk(sp, dp, r); continue; }
        if (fs.existsSync(dp)) continue;   // never overwrite
        if (f.name === 'site.json') { fs.writeFileSync(dp, JSON.stringify(data, null, 2) + '\n'); out.push(r); continue; }
        if (PAGE.test(f.name)) { fs.writeFileSync(dp, render(fs.readFileSync(sp, 'utf8'), data)); out.push(r); continue; }
        fs.copyFileSync(sp, dp); out.push(r);
      }
    };
    fs.mkdirSync(dest, { recursive: true });
    walk(src, dest);
    for (const k of ['site.js', 'fonts.css']) { const kp = path.join(dest, k); if (!fs.existsSync(kp)) { fs.copyFileSync(path.join(kit, k), kp); out.push(k); } }
    const ff = fontFiles();
    if (ff.length) { fs.mkdirSync(path.join(dest, 'fonts'), { recursive: true }); for (const f of ff) { const d = path.join(dest, 'fonts', f); if (!fs.existsSync(d)) { fs.copyFileSync(path.join(FONTS, f), d); out.push('fonts/' + f); } } }
    return out;
  }
  function freshData(id, { name, accent, tagline } = {}) {
    const data = JSON.parse(fs.readFileSync(path.join(LIB, id, 'site.json'), 'utf8'));
    if (name) { data.name = String(name).slice(0, 80); }
    if (tagline) data.tagline = String(tagline).slice(0, 160);
    if (accent && COLOR.test(accent) && data.theme && data.theme.colors && 'accent' in data.theme.colors) data.theme.colors.accent = accent;
    return data;
  }

  async function repoFor(pid, me) {
    const p = P.get(pid);
    let repo = p && p.repo && W.isRepo(p.repo) ? p.repo : null;
    if (!repo) {
      if (!isHost(me, pid)) throw err(403, 'only the host can start the code for a project without a repo');
      if (!ensureRepo) throw err(503, 'the project has no code repository yet');
      repo = (await ensureRepo(pid, me)).repo;
    } else if (!canEdit(me, pid)) throw err(403, 'only builders can add code');
    return repo;
  }
  async function commit(repo, me, msg) {
    if (!W.git) return;
    const mem = getMembers().find(m => m.id === me.id) || me;
    await W.git(['add', '-A'], repo);
    const g = await W.git([...(W.identity ? W.identity(mem) : []), 'commit', '-q', '-m', msg], repo);
    if (g && g.code && !/nothing to commit/i.test((g.out || '') + (g.err || ''))) log(`site template commit: ${(g.err || g.out || '').slice(0, 160)}`);
  }

  async function create(pid, me, { template, name, accent, tagline, level } = {}) {
    const t = byId(String(template || ''));
    if (!t) throw err(404, 'no website template by that name');
    const repo = await repoFor(pid, me);
    const p = P.get(pid) || {};
    const data = freshData(t.id, { name: name || p.name, accent, tagline });
    const topIndex = ['index.html', 'public/index.html'].some(f => fs.existsSync(path.join(repo, f)));
    let dir = topIndex ? `builds/${slug(data.name || t.id)}` : '';
    if (dir && fs.existsSync(path.join(repo, dir, 'index.html'))) {
      let n = 2; while (fs.existsSync(path.join(repo, `${dir}-${n}`, 'index.html')) && n < 50) n++; dir = `${dir}-${n}`;
    }
    const dest = dir ? path.join(repo, ...dir.split('/')) : repo;
    const files = copyInto(t.id, dest, data);
    await commit(repo, me, `Add the ${t.title} website template for ${data.name} (via TribeCode)`);
    log(`site template: ${t.id} -> ${dir || '.'} (${files.length} files)`);
    broadcast({ type: 'repo', project: pid });
    return { template: t.id, title: t.title, name: data.name, dir, href: dir ? dir + '/' : '', files: files.map(f => (dir ? dir + '/' : '') + f), level: ['easy', 'comfortable', 'pro'].includes(level) ? level : 'easy' };
  }

  // ---------- reading and saving a site in the repo ----------
  async function siteDir(pid, me, dir, write) {
    const p = P.get(pid); const repo = p && p.repo && W.isRepo(p.repo) ? p.repo : null;
    if (!repo) throw err(404, 'this project has no code repository yet');
    if (write && !canEdit(me, pid)) throw err(403, 'only builders can change the site');
    dir = String(dir || '').replace(/^\/+|\/+$/g, '');
    if (!SAFE_DIR.test(dir) || dir.split('/').includes('..')) throw err(400, 'bad folder');
    const abs = path.join(repo, ...dir.split('/').filter(Boolean));
    if (!abs.startsWith(repo)) throw err(400, 'bad folder');
    if (!fs.existsSync(path.join(abs, 'site.json'))) throw err(404, 'no site.json there');
    return { repo, abs, dir };
  }
  function pagesIn(abs) {
    const out = [];
    const walk = (d, rel = '') => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name.startsWith('.') || f.name === 'node_modules' || f.name === 'fonts') continue; const r = rel ? `${rel}/${f.name}` : f.name; if (f.isDirectory()) { if (r.split('/').length < 3) walk(path.join(d, f.name), r); } else out.push(r); } };
    walk(abs); return out.sort();
  }
  async function getData(pid, me, dir) {
    const s = await siteDir(pid, me, dir, false);
    const data = JSON.parse(fs.readFileSync(path.join(s.abs, 'site.json'), 'utf8'));
    return { dir: s.dir, data, files: pagesIn(s.abs) };
  }
  async function putData(pid, me, dir, incoming) {
    const s = await siteDir(pid, me, dir, true);
    if (!incoming || typeof incoming !== 'object') throw err(400, 'send the site data');
    const old = JSON.parse(fs.readFileSync(path.join(s.abs, 'site.json'), 'utf8'));
    const data = validTheme(clean(incoming));
    data.meta = old.meta; data.form = old.form;   // the template's own description and form aren't editable here
    const body = JSON.stringify(data, null, 2) + '\n';
    if (body.length > 400 * 1024) throw err(413, 'that is too much site data');
    fs.writeFileSync(path.join(s.abs, 'site.json'), body);
    const pages = pagesIn(s.abs).filter(f => PAGE.test(f));
    for (const f of pages) { const fp = path.join(s.abs, ...f.split('/')); const h = fs.readFileSync(fp, 'utf8'); if (h.includes('id="site-data"')) fs.writeFileSync(fp, render(h, data)); }
    broadcast({ type: 'repo', project: pid, quiet: true });
    return { saved: true, dir: s.dir, pages };
  }
  async function putImage(pid, me, dir, name, dataUrl) {
    const s = await siteDir(pid, me, dir, true);
    const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw err(400, 'send a PNG, JPEG, WebP or GIF picture');
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 6 * 1024 * 1024) throw err(413, 'that picture is over 6 MB');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const base = slug(String(name || 'photo').replace(/\.[a-z0-9]+$/i, '')).slice(0, 30) || 'photo';
    fs.mkdirSync(path.join(s.abs, 'img', 'uploads'), { recursive: true });
    let fn = `${base}.${ext}`, n = 2; while (fs.existsSync(path.join(s.abs, 'img', 'uploads', fn)) && n < 200) fn = `${base}-${n++}.${ext}`;
    fs.writeFileSync(path.join(s.abs, 'img', 'uploads', fn), buf);
    return { path: `img/uploads/${fn}` };
  }

  async function route(req, res, { m, a, b, parts, me, readBody, send, fail, url }) {
    try {
      if (a === 'site-library') {
        if (b && parts[2] === 'thumb.png' && m === 'GET') {   // public: the gallery's <img> tags carry no sign-in header
          const t = byId(b); const f = t && path.join(LIB, t.id, 'thumb.png');
          if (!f || !fs.existsSync(f)) return fail(res, 404, 'no thumbnail');
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }); return fs.createReadStream(f).pipe(res);
        }
        if (!me) return fail(res, 401, 'not a member of this tribe');
        if (!b && m === 'GET') return send(res, 200, { templates: catalog(), categories: CATEGORIES });
        return fail(res, 404, 'no such route');
      }
      if (!me) return fail(res, 401, 'not a member of this tribe');
      if (!P.get(b) || (P.canSee && !P.canSee(me, b))) return fail(res, 404, 'project not found');
      if (parts[2] === 'site-library' && m === 'POST') return send(res, 200, await create(b, me, await readBody(req, 8 * 1024).catch(() => ({}))));
      if (parts[2] === 'site-data') {
        if (parts[3] === 'image' && m === 'POST') { const body = await readBody(req, 9 * 1024 * 1024); return send(res, 200, await putImage(b, me, body.dir, body.name, body.data)); }
        if (m === 'GET') return send(res, 200, await getData(b, me, (url && url.searchParams.get('dir')) || ''));
        if (m === 'PUT') { const body = await readBody(req, 512 * 1024); return send(res, 200, await putData(b, me, body.dir, body.data)); }
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 404, 'no such route');
  }
  return { route, catalog, create, render, freshData, copyInto, CATEGORIES };
};
