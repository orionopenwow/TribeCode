// The website designer's server side (feat/flint-site; the model is app/ui/sitecfg.js, the UI app/ui/sitedesigner.js).
// One JSON config per project is the source of truth; versions on the Saved shelf keep it (server/siteflint.js useConfig).
//   GET  /api/site-designer/templates                 [{ id, title, summary, category, tags }]  the 16 templates
//   GET  /api/site-designer/template/:id              { config }  the template as a config, its pictures inlined (data: URLs)
//   GET  /api/projects/:id/site-config                { config | null, canEdit }
//   PUT  /api/projects/:id/site-config  { config }    builders (not spectators); <= 6 MB, normalized
//   POST /api/projects/:id/site-config/publish        writes the site to the project's site/ folder (one HTML file per page,
//                                                     assets/, fonts/): host, project lead or builder
// Stored in .tribe/website/<pid>.config.json. Plain files; no AI involved anywhere.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const S = require('../app/ui/sitecfg.js');

module.exports = function siteDesign({ base, root, showcase, siteFlint, log = () => {} }) {
  const LIB = path.join(root, 'templates', 'sites');
  const FONTS = [path.join(root, 'app', 'ui', 'assets', 'site-fonts'), path.join(root, 'ui', 'assets', 'site-fonts')].find(d => fs.existsSync(d));
  const err = (status, m) => Object.assign(new Error(m), { status });
  const file = pid => `.tribe/website/${String(pid).replace(/[^\w-]/g, '')}.config.json`;
  const load = pid => base.readJSON(file(pid), null);
  const save = (pid, cfg) => { const c = S.normalize(cfg); base.writeJSON(file(pid), c); return c; };
  if (siteFlint && siteFlint.useConfig) siteFlint.useConfig({ load, save });
  const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
  function templates() {
    return S.TEMPLATES.map(id => { try { const m = JSON.parse(fs.readFileSync(path.join(LIB, id, 'site.json'), 'utf8')).meta || {}; return { id, title: m.title || id, summary: m.summary || '', category: m.category || '', tags: m.tags || [], order: m.order || 99 }; } catch { return null; } }).filter(Boolean).sort((a, b) => a.order - b.order);
  }
  function template(id) {
    if (!S.TEMPLATES.includes(id)) throw err(404, 'no template by that name');
    const dir = path.join(LIB, id), d = JSON.parse(fs.readFileSync(path.join(dir, 'site.json'), 'utf8'));
    const img = rel => {   // inline the template's own pictures so a design (and its export) stands alone
      if (!rel || /^(https?:|data:)/.test(rel)) return rel || '';
      const f = path.resolve(dir, rel); if (!f.startsWith(dir + path.sep)) return '';
      const ext = path.extname(f).slice(1).toLowerCase(); if (!MIME[ext]) return '';
      try { const b = fs.readFileSync(f); return b.length > 400 * 1024 ? '' : `data:${MIME[ext]};base64,${b.toString('base64')}`; } catch { return ''; }
    };
    return S.fromTemplate(id, d, img);
  }
  function publish(pid) {
    const cfg = load(pid); if (!cfg) throw err(409, 'design the site first');
    const dir = showcase.siteDir(pid).dir; fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    const ex = S.exportFiles(cfg, 'zip'); const written = [];
    for (const [f, text] of Object.entries(ex.files)) { fs.writeFileSync(path.join(dir, f), text); written.push(f); }
    for (const a of ex.assets) { const bytes = S.dataToBytes(a.src); if (bytes) { fs.writeFileSync(path.join(dir, a.path), Buffer.from(bytes)); written.push(a.path); } }
    if (FONTS && ex.fonts.length) { fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true }); for (const f of ex.fonts) for (const n of [f.file, f.license]) { try { fs.copyFileSync(path.join(FONTS, n), path.join(dir, 'fonts', n)); written.push('fonts/' + n); } catch {} } }
    return { ok: true, dir: showcase.siteDir(pid).shown.replace(/index\.html.*$/, ''), files: written };
  }
  async function route(req, res, { m, a, b, c, d, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    const canEdit = !!me && me.role !== 'spectator' && me.role !== 'guest';
    try {
      if (a === 'site-designer') {
        if (b === 'templates' && m === 'GET') return send(res, 200, { templates: templates() });
        if (b === 'template' && c && m === 'GET') return send(res, 200, { config: template(c) });
        return fail(res, 404, 'not found');
      }
      if (a === 'projects' && c === 'site-config') {
        if (!d && m === 'GET') return send(res, 200, { config: load(b), canEdit });
        if (!canEdit) return fail(res, 403, 'spectators are read-only');
        if (!d && m === 'PUT') { const body = await readBody(req, 6 * 1024 * 1024); if (!body || typeof body.config !== 'object') return fail(res, 400, 'config missing'); return send(res, 200, { ok: true, config: save(b, body.config) }); }
        if (d === 'publish' && m === 'POST') return send(res, 200, publish(b));
      }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, load, save, template, templates, publish };
};
