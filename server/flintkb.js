// Flint's local knowledge base (flint-local): "how do I…" answered from TribeCode's own docs, with no model.
//   GET /api/flint/kb?q=<question>&k=3 -> { answers: [{ title, heading, snippet, source, slug?, score }] }
// Reads the Guide (docs/guide/*.md, the same folder server/guide.js serves) and the repo's docs/*.md, splits them into
// sections at their headings, and ranks sections by TF-IDF over words, word pairs and character trigrams (the retrieval
// half of app/ui/flintnlu.js). The answer is the section's best paragraph, cited by file and heading. Long reports
// (test runs, research dumps, audits, plans, ad scripts) are left out: see HELP_DOCS so answers stay about using the app.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Only user-facing help is indexed (audit 2026-11-13). An allow-list, so a new internal doc (an audit, a review, a plan,
// a launch checklist) can never surface in Flint's answers by being dropped into docs/. Add a file here when it
// explains how to USE the app.
const HELP_DOCS = new Set(['ACCOUNTS', 'ANY-LLM', 'ASSETS', 'BROWSER-APP', 'CLOUD', 'COMPANY', 'CRAFTS', 'DATA', 'DEMO-TRIBE', 'EXPORT', 'FLINT-CREATORS', 'FLINT-TIERS',
  'GITHUB-AND-FOLDERS', 'HOSTING', 'LIGHT-HOSTING', 'LINK-READER', 'MARKETPLACE', 'MOBILE', 'MOBILE-TRIBES', 'OPEN-SPACE', 'PHONE-APP-MODE', 'PHONE-APPS', 'PHONE-HOSTING',
  'PREMIUM', 'PROJECTS', 'SHARED-COMPUTE', 'SIGN-IN', 'SITE-TEMPLATES', 'SOLO', 'STARTERS', 'UPDATES', 'VIEWERS', 'WEB-AND-DESKTOP', 'WEBSITE', 'WORKSHOP']);
const indexed = f => HELP_DOCS.has(String(f).replace(/\.md$/i, '').toUpperCase());
const MAX = 200 * 1024;

module.exports = function flintkb({ ui, nlu } = {}) {
  const guideDirs = [process.env.TRIBE_GUIDE, path.join(__dirname, '..', 'docs', 'guide'), ui && path.join(ui, '..', 'guide'), ui && path.join(ui, '..', '..', 'docs', 'guide')].filter(Boolean);
  const docDirs = [path.join(__dirname, '..', 'docs'), ui && path.join(ui, '..', '..', 'docs')].filter(Boolean);
  const isDir = d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };
  const plain = s => String(s).replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ').replace(/^#+\s*/gm, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s*[-*]\s+/gm, '').replace(/^\s*\|.*\|\s*$/gm, ' ').replace(/\s+/g, ' ').trim();

  let idx = null, at = 0, fileList = [];
  function sections(file, body, meta) {
    const out = [], lines = body.replace(/\r/g, '').split('\n'); let title = '', heading = '', buf = [];
    const flush = () => { const text = buf.join('\n').trim(); if (plain(text).length >= 40) out.push({ ...meta, title: title || meta.name, heading, body: text }); buf = []; };
    for (const ln of lines) {
      const h1 = /^#\s+(.+)$/.exec(ln), h = /^#{2,4}\s+(.+)$/.exec(ln);
      if (h1 && !title) { title = h1[1].trim(); continue; }
      if (h) { flush(); heading = h[1].trim(); continue; }
      buf.push(ln);
    }
    flush(); return out;
  }
  function build() {
    if (idx && Date.now() - at < 60000) return idx;
    const secs = [], seen = new Set();
    const gd = guideDirs.find(isDir);
    if (gd) for (const f of fs.readdirSync(gd).filter(f => /^[a-z0-9][a-z0-9-]*\.md$/.test(f)).sort()) {
      try { const full = path.join(gd, f), st = fs.lstatSync(full); if (!st.isFile() || st.size > MAX) continue; seen.add(full); secs.push(...sections(f, fs.readFileSync(full, 'utf8'), { source: 'Guide', slug: f.replace(/\.md$/, '').replace(/^\d+-/, ''), file: `docs/guide/${f}`, name: f, w: 1.3 })); } catch {}
    }
    const dd = docDirs.find(isDir);
    if (dd) for (const f of fs.readdirSync(dd).filter(f => /\.md$/i.test(f) && indexed(f)).sort()) {
      try { const full = path.join(dd, f), st = fs.lstatSync(full); if (!st.isFile() || st.size > MAX) continue; secs.push(...sections(f, fs.readFileSync(full, 'utf8'), { source: 'Docs', file: `docs/${f}`, name: f.replace(/\.md$/i, ''), w: 1 })); } catch {}
    }
    const docs = secs.map((s, i) => ({ id: i, text: `${s.title} ${s.heading} ${s.heading} ${plain(s.body).slice(0, 1800)}`, s }));
    fileList = [...new Set(secs.map(x => x.file).filter(Boolean))];
    idx = nlu.index(docs); at = Date.now(); return idx;
  }
  const STOP = new Set('a an the to of in on at for and or is are be do does did how what why where when can could should i me my we our you your it this that with get use'.split(' '));
  function snippet(body, q) {
    const qw = String(q).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, ''));
    let best = '', bs = -1;
    for (const para of body.split(/\n\s*\n/)) {
      const t = plain(para); if (t.length < 30) continue;
      const low = t.toLowerCase(), s = qw.filter(w => low.includes(w)).length + (/^\s*\d+\.|^\s*[-*]/m.test(para) ? 0.3 : 0);
      if (s > bs) { bs = s; best = t; }
    }
    return best.length > 280 ? best.slice(0, 278).replace(/\s+\S*$/, '') + '…' : best;
  }
  function ask(q, k = 3) {
    q = String(q || '').slice(0, 300); if (!q.trim()) return [];
    const I = build(), hits = nlu.search(I, q, 12).map(h => ({ ...h, score: h.score * (h.doc.s.w || 1) })).sort((a, b) => b.score - a.score);
    const out = [], files = new Set();
    for (const h of hits) { const s = h.doc.s; if (files.has(s.file + s.heading)) continue; files.add(s.file + s.heading); out.push({ title: s.title, heading: s.heading, snippet: snippet(s.body, q), source: s.source, file: s.file, slug: s.slug, score: Math.round(h.score * 100) / 100 }); if (out.length >= k) break; }
    return out.filter(a => a.snippet);
  }
  async function route(req, res, { m, me, send, fail, url }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m !== 'GET') return fail(res, 405, 'GET only');
    const u = url || new URL(req.url, 'http://x'), q = u.searchParams.get('q') || '', k = Math.max(1, Math.min(5, +u.searchParams.get('k') || 3));
    return send(res, 200, { answers: ask(q, k) });
  }
  return { route, ask, build, files: () => { build(); return fileList.slice(); } };
};
module.exports.HELP_DOCS = HELP_DOCS;
module.exports.indexed = indexed;
