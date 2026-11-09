// Site templates (v0.25): the host turns any project's website into a template, and new projects start from it in the
// setup guide ("Make the starter" → pick a template) or with one click in the Website view.
//   GET    /api/site-templates                      [{ slug, name, summary, by, at, files, bytes }]
//   POST   /api/site-templates   { project, name, summary? }   host or project lead: copies the project's site (site/ when
//          it has one, else the repo's top-level web files) into the tribe folder's .tribe/site-templates/<slug>/ and
//          swaps the project's name, tagline and color for {{name}}, {{tagline}} and {{color}} so the next project fills them.
//   DELETE /api/site-templates/:slug               host
//   POST   /api/projects/:id/site-template { slug, into?: 'root'|'site' }   builders: copy it in (never overwrites a file)
// The same fill runs for the setup guide's starter (server/setup.js asks templateDir(slug)).
// Only web files are copied (html, css, js, json, md, svg, png, jpg, webp, gif, woff2, ico, txt), no dot folders,
// node_modules or secrets, at most 400 files and 20 MB.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const OK = /\.(html?|css|m?js|json|md|svg|png|jpe?g|webp|gif|woff2?|ico|txt|webmanifest)$/i;
const TEXT = /\.(html?|css|m?js|json|md|svg|txt|webmanifest)$/i;
const SECRET = /(^|\/)(\.env|.*secret.*|.*\.pem|.*\.key|id_rsa.*)$/i;

module.exports = function siteTemplates({ P, base, siteDir, postChat, nameOf, isManager }) {
  const root = () => base.p('.tribe', 'site-templates');
  const err = (status, m) => Object.assign(new Error(m), { status });
  const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function templateDir(slug) { const s = slugify(slug); if (!s) return null; const d = path.join(root(), s); return fs.existsSync(path.join(d, 'template.json')) ? d : null; }
  function list() {
    let names = []; try { names = fs.readdirSync(root()); } catch { return []; }
    return names.map(n => { try { return { slug: n, ...JSON.parse(fs.readFileSync(path.join(root(), n, 'template.json'), 'utf8')) }; } catch { return null; } }).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function walk(src, rel = '', out = []) {
    for (const f of fs.readdirSync(src, { withFileTypes: true })) {
      if (f.name.startsWith('.') || f.name === 'node_modules' || f.name === 'template.json') continue;
      const r = rel ? `${rel}/${f.name}` : f.name, s = path.join(src, f.name);
      if (f.isDirectory()) { if (rel.split('/').length < 5) walk(s, r, out); continue; }
      if (OK.test(f.name) && !SECRET.test(r)) out.push(r);
      if (out.length > 400) throw err(413, 'that site has too many files to be a template');
    }
    return out;
  }
  function sourceOf(pid) {
    const p = P.get(pid); if (!p) throw err(404, 'project not found');
    const sd = siteDir(pid).dir;
    if (fs.existsSync(path.join(sd, 'index.html'))) return sd;
    if (p.repo && fs.existsSync(path.join(p.repo, 'index.html'))) return p.repo;
    throw err(400, 'this project has no website yet (no index.html in site/ or the repo)');
  }
  function save(pid, me, { name, summary }) {
    if (!isManager(pid, me)) throw err(403, 'only the host or the project lead can save templates');
    const p = P.get(pid), src = sourceOf(pid), slug = slugify(name) || slugify(p.name);
    if (!slug) throw err(400, 'give the template a name');
    const files = walk(src); let bytes = 0;
    const dest = path.join(root(), slug); fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true });
    const swaps = [[p.name, '{{name}}'], [p.bio, '{{tagline}}'], [p.color, '{{color}}']].filter(([a]) => a && String(a).length >= 3)
      .flatMap(([a, b]) => [[esc(a), b], [String(a), b]]).sort((x, y) => y[0].length - x[0].length);
    for (const r of files) {
      let buf = fs.readFileSync(path.join(src, r)); bytes += buf.length; if (bytes > 20 * 1024 * 1024) { fs.rmSync(dest, { recursive: true, force: true }); throw err(413, 'that site is too big to be a template (20 MB)'); }
      if (TEXT.test(r)) { let t = buf.toString('utf8'); for (const [a, b] of swaps) t = t.split(a).join(b); buf = Buffer.from(t); }
      const out = path.join(dest, r); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
    }
    const meta = { name: String(name || p.name).slice(0, 60), summary: String(summary || p.bio || '').slice(0, 200), by: me.id, byName: nameOf(me.id), at: new Date().toISOString(), from: p.name, files: files.length, bytes };
    fs.writeFileSync(path.join(dest, 'template.json'), JSON.stringify(meta, null, 2));
    P.inProject(pid, () => postChat('general', 'tribecode', `🧩 ${nameOf(me.id)} saved this project's website as the template **${meta.name}**. New projects can start from it.`));
    return { slug, ...meta };
  }
  function fillFor(pid) {
    const p = P.get(pid) || {};
    return t => t.replace(/\{\{name\}\}/g, esc(p.name || 'My project')).replace(/\{\{tagline\}\}/g, esc(p.bio || '')).replace(/\{\{color\}\}/g, /^#[0-9a-f]{3,8}$/i.test(p.color || '') ? p.color : '#F26B1D');
  }
  function copyInto(slug, dest, fill) {
    const src = templateDir(slug); if (!src) throw err(404, 'no template by that name');
    const written = [];
    for (const r of walk(src)) {
      const out = path.resolve(dest, r); if (!out.startsWith(path.resolve(dest) + path.sep)) continue;
      if (fs.existsSync(out)) continue;   // never overwrite what the tribe already has
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const buf = fs.readFileSync(path.join(src, r));
      fs.writeFileSync(out, TEXT.test(r) ? fill(buf.toString('utf8')) : buf); written.push(r);
    }
    return written;
  }
  function apply(pid, me, { slug, into }) {
    if (!me || ['spectator', 'guest', 'agent'].includes(me.role)) throw err(403, 'only builders can add a template');
    const p = P.get(pid); if (!p || !P.canSee(me, pid)) throw err(404, 'project not found');
    const dest = into === 'root' && p.repo ? p.repo : siteDir(pid).dir; fs.mkdirSync(dest, { recursive: true });
    const written = copyInto(slug, dest, fillFor(pid));
    const t = list().find(x => x.slug === slugify(slug));
    P.inProject(pid, () => postChat('general', 'tribecode', `🧩 ${nameOf(me.id)} started the website from the template **${t ? t.name : slug}** (${written.length} files)`));
    return { ok: true, written, into: dest === p.repo ? 'root' : 'site' };
  }
  async function route(req, res, { m, a, b, c, me, readBody, send, fail, str }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      if (a === 'site-templates') {
        if (!b && m === 'GET') return send(res, 200, { templates: list() });
        if (!b && m === 'POST') { const body = await readBody(req, 8 * 1024); return send(res, 200, save(String(body.project || P.current() || '').slice(0, 80), me, body)); }
        if (b && m === 'DELETE') { if (me.role !== 'host') return fail(res, 403, 'host only'); const d = templateDir(b); if (!d) return fail(res, 404, 'not found'); fs.rmSync(d, { recursive: true, force: true }); return send(res, 200, { ok: true }); }
      }
      if (a === 'projects' && c === 'site-template' && m === 'POST') { const body = await readBody(req, 4 * 1024); return send(res, 200, apply(b, me, body)); }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, list, save, apply, templateDir, copyInto, fillFor };
};
