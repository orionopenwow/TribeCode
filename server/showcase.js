// Website: every project gets its own public page, made from what the project already has.
// (Not server/site.js: that one is TribeCode's GitHub Pages friend links.)
//
// One self-contained `site/index.html` (no JavaScript, semantic HTML, light + dark, phone-friendly) in the project's
// repo folder (or projects/<id>/site/ in the tribe folder when the project has no repo). Made from: the name, bio,
// picture (logo + favicon), color (palette: the color plus flat tints, no gradients), VISION.md, featured screenshots
// (Visuals, copied to site/shots/), a Play / Try it link (the app's built index.html, or a link the team sets), the
// GitHub repo link (origin remote, https form only), credits (people with their roles, commit authors and agents, by
// name only, never emails) and "What's new" (gists, else commits).
//
// Auto mode: a cheap signature of those inputs is checked every few seconds; when it changes the page is rebuilt
// (only written when the HTML differs). When the repo autopilot is on, the site/ folder is committed (only site/) and
// pushed, like the autopilot's other files. Publishing: GitHub › Settings › Pages (we never call GitHub write APIs).
//
// Suggestions: any member suggests new text for a field ("💡 Maya suggested a new tagline for the website"); the
// host or the project lead approves (the text is applied and the page rebuilt) or declines.
//
// State: .tribe/website/<project>.json (tribe folder).
// HTTP (members of the project):
//   GET  /api/projects/:id/website                      state: auto, fields, sections, last build, suggestions, preview link
//   PUT  /api/projects/:id/website                      { auto, sections: {k: bool}, fields: {headline, tagline, about, footer, playUrl}, shots: [slug] }  (host / lead)
//   POST /api/projects/:id/website/build                build now (builders)
//   GET  /api/projects/:id/website/preview[?pt=]        the built page, images inlined, strict CSP + nosniff (iframes use a signed preview token)
//   POST /api/projects/:id/website/suggest              { field, text }  (any member but spectators)
//   POST /api/projects/:id/website/suggestions/:sid/approve | decline   (host / lead)
// feat/site-builder (docs/WEBSITE-GENERATOR.md):
//   GET|PUT /api/projects/:id/website/brand             brand kit: { primary, accent, font, wordmark, logo: data URL | null }  (PUT: host / lead)
//   POST /api/projects/:id/website/instant              { type?, theme?, hint? }  one tap: a typed draft (type guessed when missing)
//   GET  /api/projects/:id/website/code                 the files Publish writes (index.html, styles.css, fonts, logo) and any hand edits
//   POST /api/projects/:id/website/ideas                { hint?, reply? }  "Suggest for me": the brain, else rules from project sense
//   POST /api/projects/:id/website/ideas/apply | skip   (never applied by itself; both are remembered to order future suggestions)
//   POST /api/projects/:id/website/publish              { onEdited: 'keep' | 'replace' }  409 when someone edited site/ by hand
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const gitutil = require('./gitutil');

const POLL_MS = Number(process.env.TRIBE_WEBSITE_POLL_MS) || 4000;
const COMMIT_MSG = 'TribeCode: update the website';
const SECTIONS = ['about', 'shots', 'play', 'palette', 'news', 'credits', 'repo'];
const FIELDS = { headline: 80, tagline: 160, about: 2000, footer: 160, playUrl: 300 };
const SUGGESTABLE = { headline: 'headline', tagline: 'tagline', about: 'about text', footer: 'footer line' };
const sitegen = require('./sitegen');   // feat/customize: the generator ("Design it for me"): layouts, copy, the brain pass
const CSP = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-popups allow-popups-to-escape-sandbox";
const CSP_EDIT = "default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox";
const SHOT_MAX = 3 * 1024 * 1024;
const LOGO_MAX = 200 * 1024;
const LOGO_MIME = { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml' };
const SVG_BAD = /<script|<foreignObject|<iframe|<embed|<object|<!ENTITY|<!DOCTYPE|\bon[a-z]+\s*=|javascript:|data:text|(?:xlink:)?href\s*=\s*["']\s*(?!#)/i;
// A logo upload: PNG, JPG or a plain SVG (no scripts, no outside links), under 200 KB. Returns { type, data, bytes } or null.
function cleanLogo(v) {
  if (v === null || v === '' || v === false) return null;
  const m = String(v).match(/^data:image\/(png|jpeg|jpg|svg\+xml);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) throw Object.assign(new Error('the logo must be a PNG, JPG or SVG file'), { status: 400 });
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (!buf.length) throw Object.assign(new Error('that logo file is empty'), { status: 400 });
  if (buf.length > LOGO_MAX) throw Object.assign(new Error('the logo is too big: keep it under 200 KB'), { status: 413 });
  const type = m[1] === 'svg+xml' ? 'svg' : m[1] === 'png' ? 'png' : 'jpg';
  if (type === 'png' && buf.slice(0, 4).toString('hex') !== '89504e47') throw Object.assign(new Error('that is not a PNG file'), { status: 400 });
  if (type === 'jpg' && buf.slice(0, 3).toString('hex') !== 'ffd8ff') throw Object.assign(new Error('that is not a JPG file'), { status: 400 });
  if (type === 'svg') { const t = buf.toString('utf8'); if (!/<svg[\s>]/i.test(t) || SVG_BAD.test(t)) throw Object.assign(new Error('that SVG has scripts or outside links: export a plain SVG'), { status: 400 }); }
  return { type, data: buf.toString('base64'), bytes: buf.length };
}
const logoUrl = l => (l && l.type ? `data:${LOGO_MIME[l.type]};base64,${l.data}` : null);

// ---------- small helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const one = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const okHex = c => /^#[0-9a-fA-F]{6}$/.test(String(c || ''));
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };   // t = share of b
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const inkOn = h => (lum(h) > 0.4 ? '#12151A' : '#FFFFFF');
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex');

// https form of a git remote (git@host:o/r.git, ssh://git@host/o/r, https://user@host/o/r.git). Anything else: null.
function httpsRepo(u) {
  if (!u) return null;
  let s = String(u).trim(), m;
  if ((m = s.match(/^git@([\w.-]+):([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/))) s = `https://${m[1]}/${m[2]}`;
  else if ((m = s.match(/^ssh:\/\/git@([\w.-]+)(?::\d+)?\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/))) s = `https://${m[1]}/${m[2]}`;
  s = s.replace(/^http:\/\//, 'https://').replace(/\/\/[^/@]+@/, '//').replace(/\.git\/?$/, '').replace(/\/$/, '');
  return /^https:\/\/[\w.-]+\.[a-z]{2,}\/[\w.-]+\/[\w.-]+$/i.test(s) ? s : null;
}
const okUrl = u => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) && String(u).length <= FIELDS.playUrl;

// Plain text from VISION.md: no headings, no markdown marks; the starter placeholder counts as empty.
function visionText(raw) {
  if (!raw || /Replace these lines together/.test(raw)) return '';
  return String(raw).replace(/^#.*$/gm, '').replace(/[*_`>]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim().slice(0, FIELDS.about);
}
// Paragraphs and "- item" lists, all escaped.
function prose(text) {
  const out = []; let list = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`); list = []; } };
  for (const block of String(text || '').split(/\n\s*\n/)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of lines) {
      const li = l.match(/^[-*•]\s+(.*)$/);
      if (li) list.push(li[1]); else { flush(); out.push(`<p>${esc(l)}</p>`); }
    }
    flush();
  }
  return out.join('\n');
}

module.exports = function showcase({ P, base, W, getMembers, nameOf, visuals, hubFor, preview, flow = () => null, broadcast, postChat, bus, str, ui = '', llm = null, sense = () => null }) {
  fs.mkdirSync(base.p('.tribe/website'), { recursive: true });
  const rel = pid => `.tribe/website/${pid}.json`;
  const cache = new Map();
  // gen: the generator's working draft; genLive: the draft as last published (the built page uses it when set)
  // brand: the brand kit; files: { name: sha } of what Publish last wrote (hand edits show up as a different sha); picks: what this project applied or skipped
  const blank = () => ({ auto: false, sections: Object.fromEntries(SECTIONS.map(k => [k, true])), fields: {}, shots: null, suggestions: [], built: null, sig: null, hash: null, gen: null, genLive: null,
    brand: null, files: null, logoFile: null, picks: null, idea: null, kept: null });
  function load(pid) {
    if (!cache.has(pid)) { const s = base.readJSON(rel(pid), null); cache.set(pid, s ? { ...blank(), ...s, sections: { ...blank().sections, ...(s.sections || {}) } } : blank()); }
    return cache.get(pid);
  }
  const save = (pid, st) => { cache.set(pid, st); base.writeJSON(rel(pid), st); try { kitSync(pid, st); } catch {} };   // the brand fields in here are a copy of the brand kit
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const push = pid => broadcast({ type: 'website', project: pid });
  const flowState = pid => { const f = flow(); try { return f && f.load ? f.load(pid) : null; } catch { return null; } };
  const isLead = (pid, me) => { const st = flowState(pid); const lead = st && st.roles && st.roles.find(r => r.id === 'lead'); return !!(lead && lead.members.includes(me.id)); };
  const canManage = (pid, me) => !!me && me.role !== 'agent' && me.role !== 'spectator' && (me.role === 'host' || (P.get(pid).members || {})[me.id] === 'host' || isLead(pid, me));
  const canSuggest = me => !!me && me.role !== 'spectator' && me.role !== 'agent';
  const managers = pid => getMembers().filter(m => P.canSee(m, pid) && canManage(pid, m)).map(m => m.id);

  // Where the page lives: <repo>/site, else the tribe folder's projects/<id>/site.
  function siteDir(pid) {
    const p = P.get(pid);
    if (p && p.repo && fs.existsSync(p.repo)) return { dir: path.join(p.repo, 'site'), inRepo: true, repo: p.repo, shown: 'site/index.html' };
    return { dir: base.p('projects', pid, 'site'), inRepo: false, repo: null, shown: `projects/${pid}/site/index.html (tribe folder)` };
  }
  const readVision = pid => { try { return fs.readFileSync(P.scopedStore(() => pid).p('VISION.md'), 'utf8'); } catch { return ''; } };
  const screens = () => { try { return visuals.screens(); } catch { return []; } };
  function featured(st) {
    const all = screens();
    const list = Array.isArray(st.shots) ? st.shots.map(s => all.find(x => x.slug === s)).filter(Boolean) : all.slice(0, 3);
    return list.slice(0, 6).map(s => ({ slug: s.slug, name: s.name, file: base.p('visuals', s.slug, s.latest.ts + '.png'), ts: s.latest.ts, note: s.latest.note || '' }))
      .filter(s => { try { return fs.statSync(s.file).size <= SHOT_MAX; } catch { return false; } });
  }

  // ---------- what goes on the page ----------
  async function gather(pid) {
    const p = P.get(pid), st = load(pid), where = siteDir(pid), fl = flowState(pid);
    const vision = visionText(readVision(pid));
    // People: the project's members (or, for a tribe-wide project with none listed, the tribe's builders), with their roles.
    const ids = Object.keys(p.members || {});
    const humans = (ids.length ? ids.map(member) : getMembers().filter(m => (m.role === 'host' || m.role === 'builder') && P.canSee(m, pid))).filter(m => m && m.role !== 'agent');
    const roleNames = mid => (fl && fl.roles ? fl.roles.filter(r => r.members.includes(mid)).map(r => r.name) : []);
    const people = humans.map(m => ({ name: m.name, roles: [...roleNames(m.id), ...((p.members || {})[m.id] === 'host' && !roleNames(m.id).length ? ['Host'] : [])] }));
    const humanIds = new Set(humans.map(m => m.id));
    const agents = getMembers().filter(m => m.role === 'agent' && (m.project === pid || humanIds.has(m.owner))).map(m => m.name);
    // Git: commit authors (names only) and recent commits.
    let authors = [], commits = [];
    if (where.inRepo && W.isRepo(where.repo)) {
      const G = gitutil(where.repo);
      const a = await G.gitTry(['log', '-n', '400', '--format=%an']);
      if (!a.code) { const n = new Map(); a.out.split('\n').map(s => one(s, 60)).filter(s => s && !/^tribecode$/i.test(s)).forEach(s => n.set(s, (n.get(s) || 0) + 1)); authors = [...n].sort((x, y) => y[1] - x[1]).map(x => x[0]); }
      const c = await G.gitTry(['log', '-n', '12', '--format=%s%x1f%cI']);
      if (!c.code) commits = c.out.split('\n').filter(Boolean).map(l => { const [s, at] = l.split('\x1f'); return { title: one(s, 120), at }; }).filter(x => x.title && !x.title.startsWith(COMMIT_MSG));
    }
    const known = new Set(people.map(x => x.name.toLowerCase()));
    authors = authors.filter(n => !known.has(n.toLowerCase()) && !agents.some(a => a.toLowerCase() === n.toLowerCase())).slice(0, 20);
    let news = [];
    try { const f = flow(); if (f && f.gists) news = f.gists.list(pid, 6).map(g => ({ title: one(g.title, 120), at: g.at, by: g.byName || '' })); } catch {}
    if (!news.length) news = commits.slice(0, 5);
    // Repo link + Play link.
    let repoUrl = null;
    if (where.inRepo && W.isRepo(where.repo)) { try { repoUrl = httpsRepo(await W.remoteOf(where.repo)); } catch {} }
    let play = null;
    if (okUrl(st.fields.playUrl)) play = st.fields.playUrl;
    else if (where.inRepo) {
      try {
        const r = preview.rootOf(pid);
        if (r.root && fs.existsSync(path.join(r.root, 'index.html')) && path.resolve(r.root) !== path.resolve(where.dir)) play = path.relative(where.dir, path.join(r.root, 'index.html')).split(path.sep).join('/');
      } catch {}
    }
    const looksGame = /\b(game|play|level|quest|arcade|platformer|puzzle|rpg)\b/i.test(`${p.name} ${p.bio || ''} ${vision}`);
    // feat/customize: what the generator also uses: milestones, project sense
    let milestones = []; try { milestones = (P.scopedStore(() => pid).readJSON('milestones.json', []) || []).filter(m => m && m.title).map(m => ({ version: one(m.version, 20), title: one(m.title, 120), status: one(m.status, 20) })); } catch {}
    let sn = null; try { const s = sense(); sn = s ? s.get(pid) : null; } catch {}
    return { p, st, where, vision, people, agents, authors, news, commits, milestones, sense: sn, repoUrl, play, looksGame, shots: featured(st) };
  }

  // Values shown when a field is left empty.
  const defaults = (p, vision) => ({ headline: p.name, tagline: p.bio || '', about: vision, footer: `${p.name} was built together on TribeCode.` });

  function html(g) {
    const { p, st } = g, f = st.fields, d = defaults(p, g.vision), on = k => st.sections[k] !== false;
    const color = okHex(p.color) ? p.color.toUpperCase() : '#F26B1D';
    const pal = { primary: color, ink: inkOn(color), tint: mix(color, '#FFFFFF', 0.55), shade: mix(color, '#000000', 0.4),
      dBg: '#12151A', dSurface: mix('#1B2028', color, 0.05), dBorder: mix('#2A313C', color, 0.12), lBg: '#F4F5F7', lSurface: '#FFFFFF', lBorder: mix('#DADFE6', color, 0.15),
      lLink: lum(color) > 0.3 ? mix(color, '#000000', 0.45) : color, dLink: lum(color) < 0.12 ? mix(color, '#FFFFFF', 0.45) : color };
    const headline = f.headline || d.headline, tagline = f.tagline || d.tagline, about = f.about || d.about, footer = f.footer || d.footer;
    const initials = String(p.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => [...w][0]).join('').toUpperCase();
    const logo = p.image ? `<img class="logo" src="${esc(p.image)}" alt="${esc(p.name)} logo" width="72" height="72">`
      : `<span class="logo tile" aria-hidden="true">${esc(p.emoji || initials)}</span>`;
    const icon = p.image ? `<link rel="icon" href="${esc(p.image)}">`
      : `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}"/><text x="32" y="42" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="${pal.ink}">${esc(initials)}</text></svg>`)}">`;
    const date = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };
    const playLabel = g.looksGame ? 'Play it' : 'Try it';
    const blocks = [];
    if (on('about') && about) blocks.push(`<section id="about"><h2>About</h2>${prose(about)}</section>`);
    if (on('shots') && g.shots.length) blocks.push(`<section id="screens"><h2>Screens</h2><div class="shots">${g.shots.map(s => `<figure><img src="shots/${esc(s.slug)}.png" alt="${esc(s.name)}" loading="lazy"><figcaption>${esc(s.name)}</figcaption></figure>`).join('')}</div></section>`);
    if (on('palette')) blocks.push(`<section id="colors"><h2>Colors</h2><ul class="swatches">${[['Primary', pal.primary], ['Tint', pal.tint], ['Shade', pal.shade], ['Canvas', pal.dBg], ['Paper', pal.lBg]]
      .map(([n, c]) => `<li><span class="sw" style="background:${c}"></span><b>${n}</b><code>${c}</code></li>`).join('')}</ul></section>`);
    if (on('news') && g.news.length) blocks.push(`<section id="news"><h2>What's new</h2><ul class="news">${g.news.map(n => `<li><time datetime="${esc(date(n.at))}">${esc(date(n.at))}</time><span>${esc(n.title)}${n.by ? ` <small>· ${esc(n.by)}</small>` : ''}</span></li>`).join('')}</ul></section>`);
    if (on('credits') && (g.people.length || g.agents.length || g.authors.length)) blocks.push(`<section id="credits"><h2>Made by</h2><ul class="credits">
${g.people.map(x => `<li><b>${esc(x.name)}</b>${x.roles.length ? `<span>${esc(x.roles.join(' · '))}</span>` : ''}</li>`).join('\n')}
${g.agents.map(a => `<li class="agent"><b>${esc(a)}</b><span>Agent</span></li>`).join('\n')}
${g.authors.map(a => `<li><b>${esc(a)}</b><span>Commits</span></li>`).join('\n')}
</ul></section>`);
    const acts = [on('play') && g.play ? `<a class="btn primary" href="${esc(g.play)}">${playLabel}</a>` : '', on('repo') && g.repoUrl ? `<a class="btn" href="${esc(g.repoUrl)}" target="_blank" rel="noopener noreferrer">Code on ${esc(new URL(g.repoUrl).hostname === 'github.com' ? 'GitHub' : new URL(g.repoUrl).hostname)}</a>` : ''].filter(Boolean).join('');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${pal.dBg}">
<meta name="description" content="${esc(tagline || headline)}">
<meta name="generator" content="TribeCode">
<title>${esc(p.name)}${tagline ? ` · ${esc(one(tagline, 80))}` : ''}</title>
${icon}
<style>
:root { --primary: ${pal.primary}; --ink: ${pal.ink}; --bg: ${pal.lBg}; --surface: ${pal.lSurface}; --border: ${pal.lBorder}; --text: #12151A; --body: #4A5565; --link: ${pal.lLink}; }
@media (prefers-color-scheme: dark) { :root { --bg: ${pal.dBg}; --surface: ${pal.dSurface}; --border: ${pal.dBorder}; --text: #F8FAFC; --body: #A3B0C2; --link: ${pal.dLink}; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--body); font: 16px/1.6 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow-wrap: anywhere; }
.wrap { max-width: 960px; margin: 0 auto; padding: 0 20px; }
header.top { border-bottom: 1px solid var(--border); background: var(--surface); }
header.top .wrap { display: flex; align-items: center; gap: 12px; height: 60px; }
header.top b { color: var(--text); font-size: 15px; }
header.top .bar { width: 10px; height: 10px; background: var(--primary); border-radius: 2px; }
.hero { padding: 56px 0 40px; display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; }
.logo { width: 72px; height: 72px; border-radius: 16px; border: 1px solid var(--border); object-fit: cover; display: block; }
.logo.tile { display: grid; place-items: center; background: var(--primary); color: var(--ink); font: 700 28px/1 system-ui, sans-serif; }
h1 { color: var(--text); font-size: clamp(30px, 6vw, 52px); line-height: 1.08; letter-spacing: -0.025em; margin: 0 0 10px; font-weight: 800; }
.tagline { font-size: clamp(17px, 2.4vw, 20px); margin: 0; max-width: 60ch; }
.acts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; grid-column: 1 / -1; }
.btn { display: inline-flex; align-items: center; height: 44px; padding: 0 18px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-weight: 600; text-decoration: none; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--ink); }
.btn:focus-visible, a:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
main section { border-top: 1px solid var(--border); padding: 36px 0; }
h2 { color: var(--text); font-size: 13px; letter-spacing: .08em; text-transform: uppercase; font-family: ui-monospace, "JetBrains Mono", "SF Mono", monospace; margin: 0 0 16px; font-weight: 600; }
#about p, #about ul { max-width: 65ch; margin: 0 0 12px; }
a { color: var(--link); }
.shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
figure { margin: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
figure img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; border-bottom: 1px solid var(--border); }
figcaption { padding: 10px 14px; font-size: 14px; color: var(--text); }
.swatches, .news, .credits { list-style: none; padding: 0; margin: 0; }
.swatches { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.swatches li { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px; display: grid; gap: 2px; }
.sw { height: 56px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 6px; }
.swatches b { color: var(--text); font-size: 14px; } code { font: 13px ui-monospace, "JetBrains Mono", monospace; }
.news li { display: grid; grid-template-columns: 104px 1fr; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.news li:first-child { border-top: 0; }
.news time { font: 13px/1.9 ui-monospace, monospace; }
.news span { color: var(--text); }
.credits { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.credits li { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: grid; }
.credits li.agent { border-left: 3px solid #38C6B1; }
.credits b { color: var(--text); } .credits span { font-size: 13px; }
footer { border-top: 1px solid var(--border); padding: 28px 0 40px; font-size: 14px; }
@media (max-width: 560px) { .hero { grid-template-columns: 1fr; padding: 36px 0 28px; gap: 16px; } .news li { grid-template-columns: 1fr; gap: 0; } main section { padding: 28px 0; } }
</style>
</head>
<body>
<header class="top"><div class="wrap"><span class="bar" aria-hidden="true"></span><b>${esc(p.name)}</b></div></header>
<main class="wrap">
<div class="hero">
${logo}
<div><h1>${esc(headline)}</h1>${tagline ? `<p class="tagline">${esc(tagline)}</p>` : ''}</div>
${acts ? `<div class="acts">${acts}</div>` : ''}
</div>
${blocks.join('\n')}
</main>
<footer><div class="wrap">${esc(footer)}</div></footer>
</body>
</html>
`;
  }

  // ---------- the generator (feat/customize, server/sitegen.js) ----------
  // Fonts: self-hosted OFL files from <ui>/assets/site-fonts, copied to site/fonts (only the ones the layout uses).
  const fontDir = () => (ui ? path.join(ui, 'assets', 'site-fonts') : '');
  const fontBuf = f => { try { return fs.readFileSync(path.join(fontDir(), f)); } catch { return null; } };
  function syncFonts(dir, files) {
    const fd = path.join(dir, 'fonts'); let changed = false;
    if (files.length) fs.mkdirSync(fd, { recursive: true });
    for (const f of files) { const b = fontBuf(f); if (!b) continue; let same = false; try { same = fs.readFileSync(path.join(fd, f)).equals(b); } catch {} if (!same) { fs.writeFileSync(path.join(fd, f), b); changed = true; } }
    try { for (const f of fs.readdirSync(fd)) if (/\.woff2$/.test(f) && !files.includes(f)) { fs.unlinkSync(path.join(fd, f)); changed = true; } } catch {}
    return changed;
  }
  // Inline what a single file needs: screenshots (from Visuals) and fonts as data URLs; the play iframe becomes a note.
  function inline(page, shots, { keepFrame = false } = {}) {
    const files = new Map((shots || []).map(s => [s.slug, s.file]));
    return page.replace(/src="shots\/([a-z0-9][a-z0-9-]*)\.png"/g, (all, slug) => {
      try { const b = fs.readFileSync(files.get(slug)); return b.length <= SHOT_MAX ? `src="data:image/png;base64,${b.toString('base64')}"` : 'src=""'; } catch { return 'src=""'; }
    }).replace(/url\('fonts\/([\w.-]+\.woff2)'\)/g, (all, f) => { const b = fontBuf(f); return b ? `url('data:font/woff2;base64,${b.toString('base64')}')` : "url('')"; })
      .replace(keepFrame ? /$^/ : /<iframe [^>]*><\/iframe>/g, '<div class="frame-ph">It runs right here on the published page.</div>');
  }
  const canDraft = me => !!me && me.role !== 'spectator';
  const brainOn = () => { try { return !!(llm && llm.status().online); } catch { return false; } };
  // Start (or refresh) the draft. how: 'generate' (keep the layout if there is one) | 'shuffle' | 'regenerate'
  async function generate(pid, how = 'generate', { layout, by } = {}) {
    const st = load(pid), g = await gather(pid);
    let gen = st.gen ? JSON.parse(JSON.stringify(st.gen)) : null;
    if (!gen) gen = { layout: sitegen.pickLayout(g.sense, pid), seed: 0, copySeed: 0, off: {}, order: null, edited: {}, copy: null };
    if (layout && sitegen.LAYOUTS[layout]) gen.layout = layout;
    else if (how === 'shuffle') { gen.layout = sitegen.nextLayout(gen.layout); gen.seed = (gen.seed || 0) + 1; gen.order = null; }
    if (how === 'regenerate') gen.copySeed = (gen.copySeed || 0) + 1;
    fresh(g, gen);
    gen.updated = new Date().toISOString(); gen.by = by || null;
    st.gen = gen; save(pid, st); push(pid);
    return gen;
  }
  // feat/site-builder: the copy for the draft's type and facts, keeping hand edits (and an applied tagline)
  function fresh(g, gen) {
    gen.copy = sitegen.mergeCopy(sitegen.draftCopy(g, gen.copySeed || 0, gen.type || null, gen.info || {}), gen.copy, gen.edited);
    if (gen.tagline && !(gen.edited || {}).hero) gen.copy.hero.dek = gen.tagline;
  }
  const newGen = (g, pid) => ({ layout: sitegen.pickLayout(g.sense, pid), seed: 0, copySeed: 0, off: {}, order: null, edited: {}, copy: null, type: null, info: {} });
  // ---------- feat/site-builder: brand kit, themes, one-tap Instant, suggestions that learn ----------
  const now = () => new Date().toISOString();
  // feat/design-site2: ONE brand record per project, the brand kit (.tribe/website/<id>.brand.json; shape checked by
  // TribeSiteCfg.kitNormalize: name, logo, colors { accent, ink, bg, more }, fonts { display, body }, voice). The website
  // designer, the Design canvas, Design flow and agents read it (GET|PUT /api/projects/:id/brand, server/sitedesign.js).
  // The older fields this page uses (primary, wordmark, logo, font) are a copy of the kit: a project that only had
  // those is moved into a kit the first time it is read, and a change through either route lands in both.
  const KITS = require('../app/ui/sitecfg.js');
  const kitRel = pid => `.tribe/website/${String(pid).replace(/[^\w-]/g, '')}.brand.json`;
  const fontIdOf = display => sitegen.FONT_IDS.find(id => sitegen.FONTS[id].display === display) || '';
  function kitFromOld(b, keep) {
    const k = KITS.kitNormalize(keep || {});
    k.colors.accent = b.primary || '';
    k.name = b.wordmark || '';
    if (b.logo) k.logo = logoUrl(b.logo) || '';
    else if (k.logo) { let shown = true; try { cleanLogo(k.logo); } catch { shown = false; } if (shown) k.logo = ''; }   // a kit logo this page cannot show (WebP, too big) stays in the kit
    if (b.font && sitegen.FONTS[b.font]) { if (fontIdOf(k.fonts.display) !== b.font) k.fonts = { display: sitegen.FONTS[b.font].display, body: k.fonts.body || 'Inter' }; }
    else if (fontIdOf(k.fonts.display)) k.fonts = { display: '', body: k.fonts.body };
    return KITS.kitNormalize(k);
  }
  // every save of this page's state keeps the kit in step (themes, ideas, Flint's edits and undo all change the brand fields)
  function kitSync(pid, st) {
    const b = (st && st.brand) || {}, raw = base.readJSON(kitRel(pid), null);
    if (!raw && !(b.primary || b.wordmark || b.logo || b.font)) return;
    const cur = KITS.kitNormalize(raw || {}), next = kitFromOld(b, cur);
    if (JSON.stringify(cur) === JSON.stringify(next)) return;
    kitWrite(pid, next, null); try { broadcast({ type: 'brand-kit', project: pid }); } catch {}
  }
  const kitWrite = (pid, k, me) => { try { fs.mkdirSync(path.dirname(base.p(kitRel(pid))), { recursive: true }); } catch {} base.writeJSON(kitRel(pid), { ...k, savedBy: me ? me.id : '', savedAt: now() }); };
  function kitGet(pid) {
    const raw = base.readJSON(kitRel(pid), null);
    if (raw) return KITS.kitNormalize(raw);
    const b = load(pid).brand;
    if (b && (b.primary || b.wordmark || b.logo || b.font)) { const k = kitFromOld(b, null); try { kitWrite(pid, k, null); } catch {} return k; }   // move the old record over, once
    return KITS.kitNormalize(null);
  }
  function kitSet(pid, kit, me) {
    const k = KITS.kitNormalize(kit);
    const st = load(pid), b = { ...(st.brand || {}) };
    if (k.colors.accent) b.primary = k.colors.accent; else delete b.primary;
    if (k.name) b.wordmark = sitegen.clean(one(k.name, 60), 60); else delete b.wordmark;
    if (k.logo) { try { const l = cleanLogo(k.logo); if (l) b.logo = l; } catch {} } else delete b.logo;   // a logo this page cannot show (too big, WebP) stays in the kit only
    const f = fontIdOf(k.fonts.display); if (f) b.font = f; else delete b.font;
    st.brand = Object.keys(b).length ? b : null; save(pid, st); kitWrite(pid, k, me); push(pid);
    try { broadcast({ type: 'brand-kit', project: pid }); } catch {}
    return k;
  }
  function brandSet(pid, body, me) {
    if (!canManage(pid, me)) throw err(403, 'only the host or the project lead changes the brand kit; ask them to');
    const st = load(pid), b = { ...(st.brand || {}) };
    for (const k of ['primary', 'accent']) if (body[k] !== undefined) { const v = String(body[k] || '').trim(); if (!v) delete b[k]; else if (!sitegen.okHex(v)) throw err(400, `the ${k} color must look like #RRGGBB`); else b[k] = v.toUpperCase(); }
    if (body.font !== undefined) { if (body.font && !sitegen.FONTS[body.font]) throw err(400, `font pairs are: ${sitegen.FONT_IDS.join(', ')}`); if (body.font) b.font = body.font; else delete b.font; }
    if (body.wordmark !== undefined) { const v = sitegen.clean(one(body.wordmark, 60), 60); if (v) b.wordmark = v; else delete b.wordmark; }
    if (body.logo !== undefined) { const l = cleanLogo(body.logo); if (l) b.logo = l; else delete b.logo; }
    st.brand = Object.keys(b).length ? b : null;
    if (body.font) pick(st, 'font', body.font);
    save(pid, st); push(pid);
    return st.brand;
  }
  function brandView(pid) {
    const st = load(pid), b0 = st.brand || {}, kit = kitGet(pid), layout = (st.gen && st.gen.layout) || (st.genLive && st.genLive.layout) || 'editorial';
    let g = null; try { g = { p: P.get(pid), sense: (sense() || { get: () => null }).get(pid) }; } catch { g = { p: P.get(pid), sense: null }; }
    const b = { ...b0, primary: kit.colors.accent || b0.primary || '', wordmark: kit.name || b0.wordmark || '', font: fontIdOf(kit.fonts.display) || b0.font || '' };   // answered from the kit
    return { primary: b.primary || '', accent: b.accent || '', font: b.font || '', wordmark: b.wordmark || '', kit: { colors: kit.colors, fonts: kit.fonts, voice: kit.voice }, logo: b.logo ? { type: b.logo.type, bytes: b.logo.bytes, url: logoUrl(b.logo) } : null,
      notes: sitegen.brandNotes(layout, b, g), layoutFont: sitegen.LAYOUT_FONT[layout], swatches: sitegen.SWATCHES,
      fonts: sitegen.FONT_IDS.map(id => ({ id, name: `${sitegen.FONTS[id].name} + Inter`, feel: sitegen.FONTS[id].feel })) };
  }
  function pick(st, kind, id) { if (!id) return; st.picks = st.picks || {}; const m = st.picks[kind] = st.picks[kind] || {}; m[id] = (m[id] || 0) + 1; }
  // What this project picked, and what the rest of the tribe picked on other projects (local, explainable).
  function picksFor(pid) {
    const tribe = {};
    for (const p of P.all()) { if (p.id === pid) continue; const o = (load(p.id).picks) || {}; for (const [k, m] of Object.entries(o)) { tribe[k] = tribe[k] || {}; for (const [id, n] of Object.entries(m)) tribe[k][id] = (tribe[k][id] || 0) + n; } }
    return { project: load(pid).picks || {}, tribe };
  }
  function applyTheme(st, gen, id, me, pid) {
    const T = sitegen.THEMES[id]; if (!T) throw err(400, `themes are: ${sitegen.THEME_IDS.join(', ')}`);
    gen.layout = T.layout; gen.theme = id;
    if (canManage(pid, me)) { const b = { ...(st.brand || {}), primary: T.primary, font: T.font }; if (T.accent) b.accent = T.accent; else delete b.accent; st.brand = b; }
    pick(st, 'theme', id);
  }
  async function instant(pid, me, { type, theme, hint } = {}) {
    const st = load(pid), g = await gather(pid);
    const t = sitegen.TYPES[type] ? type : sitegen.guessType(g.sense, g.p, hint);
    const gen = st.gen ? JSON.parse(JSON.stringify(st.gen)) : newGen(g, pid);
    gen.type = t; gen.order = null; gen.off = {}; gen.info = gen.info || {};
    if (theme) applyTheme(st, gen, theme, me, pid);
    else gen.layout = sitegen.TYPES[t].layout || sitegen.pickLayout(g.sense, pid);
    fresh(g, gen); gen.updated = now(); gen.by = me.id;
    pick(st, 'type', t); st.gen = gen; save(pid, st); push(pid);
    return { type: t, guessed: !sitegen.TYPES[type] };
  }
  async function ideas(pid, me, { hint, reply } = {}) {
    const st = load(pid), g = await gather(pid), picks = picksFor(pid);
    let sug = sitegen.suggestRules(g, picks, hint || '');
    if (st.gen && st.gen.type && !hint) { sug.type = st.gen.type; sug.order = sitegen.TYPES[sug.type].order.slice(); const th = sitegen.rankThemes(sug.type, picks)[0], T = sitegen.THEMES[th]; Object.assign(sug, { theme: th, primary: T.primary, accent: T.accent || '', font: T.font, layout: T.layout, why: sitegen.why(th, sug.type, picks) }); }
    if (typeof reply === 'string') sug = sitegen.parseSuggest(reply, sug) || sug;
    else if (brainOn()) {
      try { const pr = sitegen.suggestPrompt(g, sug.type, picks); const r = await llm.stream({ system: pr.system, prompt: pr.prompt, maxTokens: 500, temperature: 0.5, timeoutMs: 60_000, me }); const b = sitegen.parseSuggest(r.text, sug); if (b) sug = { ...b, via: r.via || 'brain' }; } catch {}
    }
    st.idea = { ...sug, id: 'idea-' + crypto.randomBytes(4).toString('hex'), at: now(), by: me.id }; save(pid, st); push(pid);
    return st.idea;
  }
  async function decideIdea(pid, me, apply) {
    const st = load(pid), idea = st.idea; if (!idea) throw err(404, 'there is no suggestion to decide');
    if (!apply) { pick(st, 'skip', idea.theme); st.idea = null; save(pid, st); push(pid); return null; }
    const g = await gather(pid), gen = st.gen ? st.gen : (st.gen = newGen(g, pid));
    gen.type = idea.type; gen.order = idea.order; gen.off = {}; gen.layout = idea.layout || gen.layout; gen.theme = idea.theme;
    if (canManage(pid, me)) { const b = { ...(st.brand || {}), primary: idea.primary, font: idea.font }; if (idea.accent) b.accent = idea.accent; else delete b.accent; st.brand = b; }
    if (idea.tagline) gen.tagline = idea.tagline;
    fresh(g, gen); gen.updated = now(); gen.by = me.id;
    pick(st, 'theme', idea.theme); pick(st, 'type', idea.type); pick(st, 'font', idea.font);
    st.idea = null; save(pid, st); push(pid);
    return gen;
  }
  // Files on disk that differ from what Publish last wrote: someone edited them by hand.
  function handEdits(pid) {
    const st = load(pid), dir = siteDir(pid).dir, out = [];
    for (const [n, h] of Object.entries(st.files || {})) { let t; try { t = fs.readFileSync(path.join(dir, n), 'utf8'); } catch { continue; } if (sha(t) !== h) out.push(n); }
    return out;
  }
  async function codeView(pid) {
    const st = load(pid), gen = st.gen || st.genLive; if (!gen) return null;
    const g = await gather(pid), r = sitegen.render(g, st.gen ? { ...gen, brand: undefined } : gen, { split: true }), b = (st.gen ? st.brand : gen.brand) || {};
    const files = [{ name: 'index.html', bytes: Buffer.byteLength(r.html), text: r.html, note: 'The page. Each section starts with a <!-- ===== section: name ===== --> marker.' },
      { name: 'styles.css', bytes: Buffer.byteLength(r.css), text: r.css, note: 'The look. The brand tokens at the top (colors, fonts, spacing) restyle everything.' }];
    for (const f of sitegen.fontFiles(gen.layout, b.font)) { const x = fontBuf(f); files.push({ name: `fonts/${f}`, bytes: x ? x.length : 0 }); }
    if (b.logo) files.push({ name: `logo.${b.logo.type}`, bytes: b.logo.bytes });
    for (const s of g.shots) files.push({ name: `shots/${s.slug}.png`, bytes: (() => { try { return fs.statSync(s.file).size; } catch { return 0; } })() });
    const where = siteDir(pid);
    return { files, folder: where.inRepo ? 'site/' : `projects/${pid}/site/ (tribe folder)`, inRepo: where.inRepo, handEdited: handEdits(pid), draft: !!st.gen,
      howTo: 'Edit site/index.html and site/styles.css in your editor (or ask your Claude). Change the tokens at the top of styles.css to restyle; find a section by its marker comment. Publish never overwrites hand edits without asking.' };
  }
  function editGen(pid, body, me) {
    const st = load(pid); if (!st.gen) throw err(409, 'make a draft first');
    const gen = st.gen;
    if (body.layout !== undefined) { if (!sitegen.LAYOUTS[body.layout]) throw err(400, `layouts are: ${sitegen.LAYOUT_IDS.join(', ')}`); gen.layout = body.layout; gen.order = null; }
    if (body.off && typeof body.off === 'object') for (const k of sitegen.SECTIONS) if (typeof body.off[k] === 'boolean') { if (body.off[k] && k !== 'hero') gen.off[k] = true; else delete gen.off[k]; }
    if (Array.isArray(body.order)) gen.order = body.order.filter(k => sitegen.SECTIONS.includes(k)).filter((k, i, a) => a.indexOf(k) === i);
    if (body.section) { const k = String(body.section); gen.copy[k] = sitegen.editSection(gen.copy, k, body.copy || {}); gen.edited = { ...(gen.edited || {}), [k]: true }; }
    if (body.reset && sitegen.SECTIONS.includes(body.reset)) { delete gen.edited[body.reset]; }
    let regen = !!body.reset;
    if (body.type !== undefined) { if (body.type && !sitegen.TYPES[body.type]) throw err(400, `site types are: ${sitegen.TYPE_IDS.join(', ')}`); gen.type = body.type || null; gen.order = null; gen.off = {}; if (gen.type) pick(st, 'type', gen.type); regen = true; }
    if (body.info && typeof body.info === 'object') { gen.info = { ...(gen.info || {}), ...sitegen.cleanInfo(body.info) }; for (const k of Object.keys(gen.info)) if (!gen.info[k]) delete gen.info[k]; regen = true; }
    if (body.theme) applyTheme(st, gen, String(body.theme), me, pid);
    gen.updated = new Date().toISOString(); gen.by = me.id;
    save(pid, st);
    if (regen) return generate(pid, 'generate', { by: me.id });
    push(pid); return gen;
  }
  // "Write it for me": the tribe's brain, or a reply the person's own in-browser model already wrote.
  async function polish(pid, me, reply) {
    const st = load(pid); if (!st.gen) await generate(pid, 'generate', { by: me.id });
    const g = await gather(pid), gen = load(pid).gen;
    let text = typeof reply === 'string' ? reply : null, via = 'your browser';
    if (text === null) {
      if (!llm) throw err(503, 'No brain is set up');
      const pr = sitegen.polishPrompt(g, gen);
      try { const r = await llm.stream({ system: pr.system, prompt: pr.prompt, maxTokens: 1100, temperature: 0.4, timeoutMs: 120_000, me }); text = r.text; via = r.via; }
      catch (e) { throw Object.assign(err(e.status || 503, e.message || 'No brain is on'), { basic: true }); }
    }
    const r = sitegen.applyPolish(gen, text);
    if (r.error) throw err(502, r.error);
    gen.copy = r.copy; gen.updated = new Date().toISOString(); gen.polished = { at: new Date().toISOString(), via, changed: r.changed.length, rejected: r.rejected.length };
    save(pid, load(pid)); push(pid);
    return { changed: r.changed, rejected: r.rejected, via };
  }
  async function draftHtml(pid, opts = {}) {
    const st = load(pid); if (!st.gen) return null;
    const g = await gather(pid);
    return inline(sitegen.render(g, st.gen, { logoUrl: logoUrl((st.brand || {}).logo) }), g.shots, opts);
  }
  async function publish(pid, me, onEdited) {
    if (!canManage(pid, me)) throw err(403, 'only the host or the project lead publishes the website; ask them to');
    const st = load(pid); if (!st.gen) throw err(409, 'make a draft first');
    const edits = handEdits(pid);
    if (edits.length && !['keep', 'replace'].includes(onEdited)) throw Object.assign(err(409, `Someone edited the code by hand (${edits.join(', ')}). Keep their edits or replace them.`), { handEdited: edits });
    const { by, updated, ...rest } = st.gen;
    st.genLive = JSON.parse(JSON.stringify({ ...rest, brand: st.brand || null })); st.genLive.publishedAt = new Date().toISOString(); st.genLive.publishedBy = me.id;
    save(pid, st);
    const r = await build(pid, { by: me.id, auto: st.auto, onEdited: onEdited || 'keep' });
    P.inProject(pid, () => postChat('general', 'tribecode', `🌐 ${me.name} published the new ${P.get(pid).name} website (${sitegen.LAYOUTS[st.genLive.layout].name} layout).`));
    return r;
  }
  function genView(pid, me) {
    const st = load(pid), gen = st.gen;
    let draftUrl = null;
    if (gen) { try { draftUrl = `/api/projects/${encodeURIComponent(pid)}/website/draft?pt=${encodeURIComponent(preview.mint(pid, me).pt)}`; } catch {} }
    const live = st.genLive ? { layout: st.genLive.layout, at: st.genLive.publishedAt, byName: st.genLive.publishedBy ? nameOf(st.genLive.publishedBy) : null } : null;
    const core = (x, b) => JSON.stringify({ layout: x.layout, seed: x.seed, off: x.off || {}, order: x.order || null, copy: x.copy, type: x.type || null, info: x.info || {}, brand: b || null });
    const dirty = !!(gen && st.genLive && core(gen, st.brand) !== core(st.genLive, st.genLive.brand));
    const T = gen && sitegen.TYPES[gen.type] ? gen.type : null, picks = picksFor(pid), ptype = T || sitegen.guessType(null, P.get(pid), '');
    const order = gen ? (T ? sitegen.TYPES[T].order : sitegen.LAYOUTS[gen.layout].order) : [];
    return { draft: gen ? { layout: gen.layout, off: gen.off || {}, order: gen.order, edited: gen.edited || {}, copy: gen.copy, polished: gen.polished || null, updated: gen.updated, seed: gen.seed,
        type: T, info: gen.info || {}, theme: gen.theme || null, secs: [...order, ...(gen.add || []).filter(k => !order.includes(k))], add: gen.add || [] } : null,
      types: sitegen.TYPE_IDS.map(id => ({ id, name: sitegen.TYPES[id].name, icon: sitegen.TYPES[id].icon, note: sitegen.TYPES[id].note })),
      themes: sitegen.rankThemes(ptype, picks).map(id => { const x = sitegen.THEMES[id]; return { id, name: x.name, note: x.note, primary: x.primary, accent: x.accent, font: x.font, fontName: sitegen.FONTS[x.font].name, layout: x.layout, why: sitegen.why(id, ptype, picks) }; }),
      guess: sitegen.TYPES[ptype] ? { type: ptype, name: sitegen.TYPES[ptype].name } : null,
      brand: brandView(pid), idea: st.idea || null, handEdited: handEdits(pid), canBrand: canManage(pid, me),
      live, unpublished: !!gen && (!st.genLive || dirty), draftUrl, brain: brainOn(), canDraft: canDraft(me), canPublish: canManage(pid, me),
      layouts: sitegen.LAYOUT_IDS.map(id => ({ id, name: sitegen.LAYOUTS[id].name, note: sitegen.LAYOUTS[id].note })), sections: sitegen.SECTIONS.map(id => ({ id, name: sitegen.SECTION_NAMES[id] })) };
  }

  // MCP: a connected Claude drafts and refines; publishing stays with the host or the project lead.
  const mreply = (t, e) => ({ content: [{ type: 'text', text: t }], ...(e ? { isError: true } : {}) });
  const curPid = () => P.current() || P.defaultId();
  const summary = (pid, gen) => `Website draft for ${P.get(pid).name}: ${sitegen.LAYOUTS[gen.layout].name} layout. Sections: ${sitegen.SECTIONS.filter(k => !(gen.off || {})[k]).join(', ')}.\nCopy (JSON):\n${JSON.stringify(gen.copy, null, 1).slice(0, 6000)}`;
  const mcpTools = {
    website_draft: {
      description: 'Make or refresh the project website draft (TribeCode\'s site generator: six editorial layouts, copy filled from the project\'s bio, VISION.md, sense, milestones, commits, screenshots and team). action: "generate" (default), "shuffle" (next layout), "regenerate" (fresh template copy, keeps hand edits), or "show". Returns the layout and the copy as JSON. Publishing needs the host or the project lead: use website_request_publish.',
      inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['generate', 'shuffle', 'regenerate', 'show'] }, layout: { type: 'string', enum: sitegen.LAYOUT_IDS }, project: { type: 'string' } }, additionalProperties: false },
      run: async ({ action = 'generate', layout } = {}, me) => {
        const pid = curPid(); if (!P.get(pid)) return mreply('No project.', true);
        const gen = action === 'show' && load(pid).gen ? load(pid).gen : await generate(pid, action === 'show' ? 'generate' : action, { layout, by: me.id });
        return mreply(summary(pid, gen) + '\n\nEdit a section with website_edit_section. Keep the voice simple, direct and warm: no hype words, no exclamation marks, no emoji.');
      },
    },
    website_edit_section: {
      description: `Rewrite one section of the website draft. section: ${sitegen.SECTIONS.join(', ')}. Fields: title, body, kicker, dek, cta (hero), text (footer), items (features: [{title, body}], faq: [{q, a}]). Plain text only; hype words, exclamation runs and extra emoji are removed. Hand edits are kept when the copy is regenerated.`,
      inputSchema: { type: 'object', properties: { section: { type: 'string', enum: sitegen.SECTIONS }, title: { type: 'string' }, body: { type: 'string' }, kicker: { type: 'string' }, dek: { type: 'string' }, cta: { type: 'string' }, text: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } }, project: { type: 'string' } }, required: ['section'], additionalProperties: false },
      run: async (a = {}, me) => {
        const pid = curPid(); if (!load(pid).gen) await generate(pid, 'generate', { by: me.id });
        try { const { section, project, ...copy } = a; const gen = editGen(pid, { section, copy }, me); return mreply(`Updated the ${section} section.\n${JSON.stringify(gen.copy[section])}`); }
        catch (e) { return mreply(e.message, true); }
      },
    },
    website_request_publish: {
      description: 'Ask the host or the project lead to publish the website draft (they get a notification and press Publish in Website). Agents cannot publish by themselves.',
      inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'One line for the humans: what changed' }, project: { type: 'string' } }, additionalProperties: false },
      run: async ({ note } = {}, me) => {
        const pid = curPid(), st = load(pid); if (!st.gen) return mreply('There is no draft yet. Call website_draft first.', true);
        const to = managers(pid); const line = one(note, 200);
        P.inProject(pid, () => postChat('general', 'tribecode', `🌐 ${me.name} has a website draft ready for review${line ? `: “${line}”` : ''}. The host or the project lead can publish it from Website.`));
        if (to.length) try { bus.notify({ type: 'website-review', to, priority: 'normal', from: me.id, title: `${me.name} has a website draft ready`, body: line || 'Open Website to look at it and publish.', view: 'docs', project: pid }); } catch {}
        return mreply(`Asked ${to.length ? to.map(nameOf).join(', ') : 'the host'} to review and publish it.`);
      },
    },
  };

  // ---------- build ----------
  const busy = new Map();
  async function build(pid, { by = null, auto = false, onEdited = 'keep' } = {}) {
    if (busy.get(pid)) return busy.get(pid);
    const job = (async () => {
      const g = await gather(pid), st = g.st, where = g.where, live = st.genLive;
      // feat/site-builder: the generator writes index.html + styles.css (readable, for people to edit); the simple page stays one file
      const out = live ? sitegen.render(g, { ...live, brand: live.brand || null }, { split: true }) : { html: html(g), css: null };
      fs.mkdirSync(path.join(where.dir, 'shots'), { recursive: true });
      const want = new Set(g.shots.map(s => `${s.slug}.png`));
      const brand = (live && live.brand) || {};
      let changed = syncFonts(where.dir, live ? sitegen.fontFiles(live.layout, brand.font) : []);
      // the logo: copied next to the page (only the file we wrote is ever removed)
      const lname = live && brand.logo ? `logo.${brand.logo.type}` : null;
      if (st.logoFile && st.logoFile !== lname) { try { fs.unlinkSync(path.join(where.dir, st.logoFile)); changed = true; } catch {} }
      if (lname) { const buf = Buffer.from(brand.logo.data, 'base64'); let same = false; try { same = fs.readFileSync(path.join(where.dir, lname)).equals(buf); } catch {} if (!same) { fs.writeFileSync(path.join(where.dir, lname), buf); changed = true; } }
      st.logoFile = lname;
      for (const s of g.shots) {
        const dest = path.join(where.dir, 'shots', `${s.slug}.png`), buf = fs.readFileSync(s.file);
        let same = false; try { same = fs.readFileSync(dest).equals(buf); } catch {}
        if (!same) { fs.writeFileSync(dest, buf); changed = true; }
      }
      for (const f of fs.readdirSync(path.join(where.dir, 'shots'))) if (/^[a-z0-9][a-z0-9-]*\.png$/.test(f) && !want.has(f)) { try { fs.unlinkSync(path.join(where.dir, 'shots', f)); changed = true; } catch {} }
      // Hand edits: a file whose sha differs from what we last wrote is someone's work. Kept unless the publisher said Replace.
      const kept = [], files = { 'index.html': out.html, ...(out.css ? { 'styles.css': out.css } : {}) };
      for (const [name, text] of Object.entries(files)) {
        const file = path.join(where.dir, name), known = (st.files || {})[name];
        let prev = null; try { prev = fs.readFileSync(file, 'utf8'); } catch {}
        if (prev !== null && known && sha(prev) !== known && prev !== text && onEdited !== 'replace') { kept.push(name); continue; }
        if (prev !== text) { fs.writeFileSync(file, text); changed = true; }
        st.files = { ...(st.files || {}), [name]: sha(text) };
      }
      st.kept = kept.length ? { at: new Date().toISOString(), files: kept } : null;
      const all = out.html + (out.css || '');
      st.built = { at: new Date().toISOString(), by, auto, hash: sha(all).slice(0, 12), bytes: Buffer.byteLength(all), kept: kept.length ? kept : undefined };
      st.sig = signature(pid);
      save(pid, st);
      if (changed && auto && where.inRepo) await commitSite(pid, where.repo).catch(e => console.error('website commit:', e.message));
      push(pid);
      return { changed, built: st.built };
    })();
    busy.set(pid, job);
    try { return await job; } finally { busy.delete(pid); }
  }
  // Like the autopilot's own files: only when the autopilot is on, on main, in sync; only site/ is committed.
  async function commitSite(pid, repo) {
    let hub = null; try { hub = hubFor(pid); } catch {}
    const ap = hub && hub.settings ? hub.settings().autopilot : null;
    if (!ap || !ap.enabled || !W.isRepo(repo)) return;
    const st = hub.status() || {};
    if (st.branch && st.main && st.branch !== st.main) return;
    if (st.behind > 0) return;
    const G = gitutil(repo);
    await G.locked(async () => {
      if (!(await G.gitTry(['status', '--porcelain', '--', 'site'])).out) return;
      await G.git(['add', '--', 'site']);
      if (!(await G.gitTry(['diff', '--cached', '--quiet', '--', 'site'])).code) return;
      await G.git([...(await G.identity()), 'commit', '--quiet', '-m', COMMIT_MSG, '--', 'site']);
      if (st.upstream) await G.gitTry(['push', '--quiet', 'origin', st.main || 'HEAD'], repo, { timeout: 60_000 });
    });
    try { hub.poll({ force: true }).catch(() => {}); } catch {}
  }

  // ---------- auto mode: rebuild when the inputs change ----------
  function signature(pid) {
    const p = P.get(pid); if (!p) return null;
    const st = load(pid), fl = flowState(pid);
    let vision = ''; try { const s = fs.statSync(P.scopedStore(() => pid).p('VISION.md')); vision = `${s.size}:${s.mtimeMs}`; } catch {}
    let head = ''; try { const c = ((hubFor(pid).status() || {}).commits || []).find(x => !String(x.subject || '').startsWith(COMMIT_MSG)); head = c ? c.sha : ''; } catch {}
    let gist = ''; try { const f = flow(); const g = f && f.gists ? f.gists.list(pid, 1)[0] : null; gist = g ? g.id || g.at : ''; } catch {}
    const ms = getMembers().filter(m => (p.members || {})[m.id] || m.project === pid || (m.role === 'agent' && (p.members || {})[m.owner])).map(m => `${m.id}:${m.name}`).sort().join(',');
    return sha(JSON.stringify([p.name, p.bio, p.color, p.emoji, p.image ? sha(p.image) : '', p.repo, vision, head, gist, ms, fl ? fl.roles.map(r => [r.name, r.members]) : null,
      featured(st).map(s => s.slug + s.ts), st.fields, st.sections, st.genLive || null, st.files || null]));
  }
  let ticking = false;
  async function tick() {
    if (ticking) return; ticking = true;
    try {
      for (const p of P.all()) {
        const st = load(p.id); if (!st.auto) continue;
        const sig = signature(p.id);
        if (sig && sig !== st.sig) await build(p.id, { auto: true }).catch(e => console.error('website build:', e.message));
      }
    } finally { ticking = false; }
  }
  setInterval(() => tick().catch(e => console.error("website tick:", e.message)), POLL_MS).unref();

  // ---------- state ----------
  // feat/tasks-company: has the team already started a website? The Website button and the preview open what is
  // there instead of the empty "Make the project's website" card. In order: a site-builder draft (.tribe/website),
  // a built page (site/index.html in the repo or the tribe folder), a site someone made in the repo (website/,
  // docs/, www/, web/ or a root index.html in a site project), or site-builder settings saved but nothing built.
  const SITE_DIRS = ['site', 'website', 'www', 'docs', 'web', 'public/site'];
  const mtime = f => { try { return fs.statSync(f).mtime.toISOString(); } catch { return null; } };
  function started(pid) {
    const st = load(pid), p = P.get(pid) || {};
    try { const dc = base.readJSON(`.tribe/website/${String(pid).replace(/[^\w-]/g, '')}.config.json`, null); if (dc) return { kind: 'designer', path: '.tribe/website', at: dc.savedAt || null, label: 'a website design' }; } catch {}   // feat/site-v2: the website designer's draft
    if (st.gen) return { kind: 'draft', path: '.tribe/website', at: st.gen.updated || null, label: 'a site-builder draft' };
    if (exists(pid)) { const w = siteDir(pid); return { kind: 'built', path: w.shown, at: mtime(path.join(w.dir, 'index.html')), label: 'the built page' }; }
    const tribeCopy = base.p('projects', pid, 'site', 'index.html');
    if (p.repo && fs.existsSync(tribeCopy)) return { kind: 'built', path: `projects/${pid}/site/index.html (tribe folder)`, at: mtime(tribeCopy), label: 'the built page', tribeCopy: true };
    if (p.repo && fs.existsSync(p.repo)) {
      for (const d of SITE_DIRS.slice(1)) { const f = path.join(p.repo, d, 'index.html'); if (fs.existsSync(f)) return { kind: 'repo', path: `${d}/index.html`, at: mtime(f), label: `${d}/ in the code repository` }; }
      const kind = (() => { try { const x = sense(); const g = x ? x.get(pid) : null; return (g && (g.kind || (g.project || {}).kind)) || ''; } catch { return ''; } })();
      const root = path.join(p.repo, 'index.html');
      if (kind === 'site' && fs.existsSync(root)) return { kind: 'repo', path: 'index.html', at: mtime(root), label: 'index.html in the code repository' };
    }
    const f = st.fields || {};
    if (st.built || st.brand || st.idea || Object.keys(f).length || st.genLive) return { kind: 'config', path: '.tribe/website', at: (st.built && st.built.at) || null, label: 'site-builder settings' };
    return null;
  }
  function exists(pid) { try { return fs.existsSync(path.join(siteDir(pid).dir, 'index.html')); } catch { return false; } }
  async function view(pid, me, req) {
    const p = P.get(pid), st = load(pid), where = siteDir(pid);
    const vision = visionText(readVision(pid));
    let previewUrl = null;
    if (exists(pid)) { try { previewUrl = `/api/projects/${encodeURIComponent(pid)}/website/preview?pt=${encodeURIComponent(preview.mint(pid, me).pt)}`; } catch {} }
    let ap = false; try { const h = hubFor(pid); ap = !!(h && h.settings && h.settings().autopilot.enabled); } catch {}
    const sug = st.suggestions.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || String(b.at).localeCompare(String(a.at))).slice(0, 30)
      .map(s => ({ ...s, byName: nameOf(s.by), decidedByName: s.decidedBy ? nameOf(s.decidedBy) : null, label: SUGGESTABLE[s.field] || s.field }));
    return { project: pid, auto: !!st.auto, sections: st.sections, fields: st.fields, defaults: defaults(p, vision), shots: st.shots, screens: screens().map(s => ({ slug: s.slug, name: s.name })),
      built: st.built, exists: exists(pid), path: where.shown, inRepo: where.inRepo, autopilot: ap, previewUrl, suggestions: sug, open: sug.filter(s => s.status === 'open').length,
      canManage: canManage(pid, me), canSuggest: canSuggest(me), suggestable: SUGGESTABLE, sectionList: SECTIONS, gen: genView(pid, me), started: started(pid),
      hint: where.inRepo ? 'Publish it with GitHub Pages: Settings › Pages › Deploy from a branch (root), then open /site/ on the Pages address. Or add a Pages workflow that uploads the site/ folder.' : 'This project has no repo yet, so the page stays in the tribe folder. Give it a repo to publish it with GitHub Pages.' };
  }

  function settings(pid, body, me) {
    if (!canManage(pid, me)) throw err(403, 'only the host or the project lead edits the website; suggest an edit instead');
    const st = load(pid); const wasAuto = st.auto;
    if (typeof body.auto === 'boolean') st.auto = body.auto;
    if (body.sections && typeof body.sections === 'object') for (const k of SECTIONS) if (typeof body.sections[k] === 'boolean') st.sections[k] = body.sections[k];
    const fields = body.fields && typeof body.fields === 'object' ? body.fields : body;
    for (const [k, n] of Object.entries(FIELDS)) {
      if (fields[k] === undefined) continue;
      const v = k === 'about' ? String(fields[k] ?? '').replace(/\r/g, '').trim().slice(0, n) : one(fields[k], n);
      if (k === 'playUrl' && v && !okUrl(v)) throw err(400, 'the Play link must start with https://');
      if (v) st.fields[k] = v; else delete st.fields[k];
    }
    if (body.shots === null) st.shots = null;
    else if (Array.isArray(body.shots)) st.shots = body.shots.map(String).filter(s => /^[a-z0-9][a-z0-9-]{0,47}$/.test(s)).slice(0, 6);
    save(pid, st);
    if (st.auto && !wasAuto) P.inProject(pid, () => postChat('general', 'tribecode', `🌐 ${me.name} turned on the automatic website: it rebuilds as ${P.get(pid).name} changes.`));
    push(pid);
    return st;
  }

  function suggest(pid, body, me) {
    if (!canSuggest(me)) throw err(403, 'spectators and agents cannot suggest edits');
    const field = String(body.field || '');
    if (!SUGGESTABLE[field]) throw err(400, `suggest one of: ${Object.keys(SUGGESTABLE).join(', ')}`);
    const text = field === 'about' ? String(body.text ?? '').replace(/\r/g, '').trim().slice(0, FIELDS.about) : one(body.text, FIELDS[field]);
    if (!text) throw err(400, 'write the text you suggest');
    const st = load(pid);
    if (st.suggestions.filter(s => s.status === 'open').length >= 50) throw err(429, 'there are already 50 open suggestions: decide a few first');
    const s = { id: 'ws-' + crypto.randomBytes(5).toString('hex'), field, text, by: me.id, at: new Date().toISOString(), status: 'open', note: one(body.note, 200) || undefined };
    st.suggestions = [...st.suggestions, s].slice(-200); save(pid, st);
    const a = /^[aeiou]/i.test(SUGGESTABLE[field]) ? 'an' : 'a';
    P.inProject(pid, () => postChat('general', 'tribecode', `💡 ${me.name} suggested ${a} new ${SUGGESTABLE[field]} for the website: “${one(text, 140)}”`));
    const to = managers(pid).filter(x => x !== me.id);
    if (to.length) try { bus.notify({ type: 'website-suggestion', to, priority: 'normal', from: me.id, title: `${me.name} suggested ${a} new ${SUGGESTABLE[field]} for the website`, body: one(text, 200), view: 'docs', ref: s.id, project: pid }); } catch {}
    push(pid);
    return s;
  }

  async function decide(pid, sid, approve, me) {
    if (!canManage(pid, me)) throw err(403, 'only the host or the project lead decides website suggestions');
    const st = load(pid), s = st.suggestions.find(x => x.id === sid);
    if (!s) throw err(404, 'no such suggestion');
    if (s.status !== 'open') throw err(409, `already ${s.status}`);
    s.status = approve ? 'approved' : 'declined'; s.decidedBy = me.id; s.decidedAt = new Date().toISOString();
    if (approve) st.fields[s.field] = s.text;
    save(pid, st);
    P.inProject(pid, () => postChat('general', 'tribecode', approve ? `✅ ${me.name} approved ${nameOf(s.by)}'s ${SUGGESTABLE[s.field]} for the website.` : `${me.name} passed on ${nameOf(s.by)}'s ${SUGGESTABLE[s.field]} for the website.`));
    if (s.by !== me.id) try { bus.notify({ type: 'website-decided', to: [s.by], priority: 'low', from: me.id, title: `${me.name} ${approve ? 'approved' : 'declined'} your ${SUGGESTABLE[s.field]} for the website`, body: one(s.text, 200), view: 'docs', ref: s.id, project: pid }); } catch {}
    let built = null;
    if (approve) built = (await build(pid, { by: me.id, auto: st.auto })).built;
    push(pid);
    return { suggestion: s, built };
  }

  // The built page with its screenshots inlined (iframes and new tabs: images need no second request).
  function previewHtml(pid, opts = {}) {
    const dir = siteDir(pid).dir;
    let page; try { page = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'); } catch { return null; }
    // feat/site-builder: the stylesheet and the logo travel inside the preview (its CSP allows inline styles and data: images only)
    page = page.replace(/<link rel="stylesheet" href="styles\.css">/, () => { try { return `<style>\n${fs.readFileSync(path.join(dir, 'styles.css'), 'utf8').replace(/<\/style/gi, '<\\/style')}</style>`; } catch { return ''; } })
      .replace(/(src|href)="logo\.(png|svg|jpg)"/g, (all, a, t) => { try { const b = fs.readFileSync(path.join(dir, `logo.${t}`)); return b.length <= LOGO_MAX ? `${a}="${logoUrl({ type: t, data: b.toString('base64') })}"` : `${a}=""`; } catch { return `${a}=""`; } });
    // the website designer's Publish keeps pictures in assets/: they travel inline too (the preview's CSP has no 'self')
    const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
    page = page.replace(/(src|href)="assets\/([\w.-]+)\.(png|jpe?g|gif|webp|svg)"/gi, (all, a, f, t) => { try { const x = fs.readFileSync(path.join(dir, 'assets', `${f}.${t}`)); return x.length <= 4 * 1024 * 1024 ? `${a}="data:${MIME[t.toLowerCase()]};base64,${x.toString('base64')}"` : `${a}=""`; } catch { return `${a}=""`; } });
    const shots = [...page.matchAll(/src="shots\/([a-z0-9][a-z0-9-]*)\.png"/g)].map(m => ({ slug: m[1], file: path.join(dir, 'shots', m[1] + '.png') }));
    const out = inline(page, shots, opts);
    return opts.keepFrame ? out : out.replace(/href="(?!https:|data:|#)[^"]*"/g, 'href="#"');   // relative links (Play) don't lead anywhere inside TribeCode's preview
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, b, parts, me, url, readBody, send, fail }) {
    const p = P.get(b);
    const sub = parts[3] || '', sid = parts[4], act = parts[5];
    // The preview: a member's key (header) or a signed preview token (iframes and tabs can't send headers).
    // draft: the generator's draft, rendered live; export: the draft (or the built page) as one self-contained file.
    if ((sub === 'preview' || sub === 'draft' || sub === 'export') && m === 'GET') {
      let who = me;
      if (!who && url.searchParams.get('pt')) { const v = preview.verify(url.searchParams.get('pt'), b); if (v.error) return fail(res, v.status || 403, v.error); who = v.member; }
      if (!who) return fail(res, 401, 'not a member of this tribe');
      if (!p || !P.canSee(who, b)) return fail(res, 404, 'project not found');
      if (sub === 'export') {
        const page = url.searchParams.get('which') === 'live' || !load(b).gen ? previewHtml(b, { keepFrame: true }) : await draftHtml(b, { keepFrame: true });
        if (page === null) return fail(res, 404, 'nothing to export yet: make a draft or build the page');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site'}-website.html"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
        return res.end(page);
      }
      let page = sub === 'draft' ? await draftHtml(b) : previewHtml(b);
      if (page === null) return fail(res, 404, sub === 'draft' ? 'there is no draft yet' : 'the website is not built yet');
      // ?edit=1 (the preview pane): the same draft plus the preview helper (pick, double-click text, comment pins, screenshots).
      // Still its own opaque origin (sandbox without allow-same-origin): the only script is TribeCode's own helper.
      const edit = sub === 'draft' && url.searchParams.get('edit') === '1' && preview.HELPER_SRC;
      if (edit) page = page.replace(/<head\b[^>]*>/i, h => h + preview.HELPER_SRC.replace('__TCV__', '0'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': edit ? CSP_EDIT : CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' });
      return res.end(page);
    }
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (!p || !P.canSee(me, b)) return fail(res, 404, 'project not found');
    try {
      if (!sub && m === 'GET') return send(res, 200, { website: await view(b, me, req) });
      if ((!sub || sub === 'settings') && (m === 'PUT' || m === 'POST')) {
        const before = load(b).auto;
        settings(b, await readBody(req, 256 * 1024), me);
        if (load(b).auto && !before) await build(b, { by: me.id, auto: true });
        return send(res, 200, { website: await view(b, me, req) });
      }
      if (sub === 'build' && m === 'POST') {
        if (me.role === 'spectator') return fail(res, 403, 'spectators are read-only');
        const r = await build(b, { by: me.id, auto: false });
        return send(res, 200, { ...r, website: await view(b, me, req) });
      }
      // feat/customize: the generator
      if (sub === 'gen' && !sid && (m === 'POST' || m === 'PUT')) {
        if (!canDraft(me)) return fail(res, 403, 'spectators are read-only');
        const body = await readBody(req, 128 * 1024);
        if (m === 'POST') await generate(b, ['shuffle', 'regenerate'].includes(body.how) ? body.how : 'generate', { layout: body.layout, by: me.id });
        else await editGen(b, body, me);
        return send(res, 200, { website: await view(b, me, req) });
      }
      if (sub === 'gen' && sid === 'prompt' && m === 'GET') {   // for a browser model (WebLLM): ask it, then POST its raw reply to /write
        if (!load(b).gen) await generate(b, 'generate', { by: me.id });
        return send(res, 200, sitegen.polishPrompt(await gather(b), load(b).gen));
      }
      if (sub === 'write' && m === 'POST') {
        if (!canDraft(me) || me.role === 'agent') return fail(res, 403, 'spectators are read-only');
        const body = await readBody(req, 64 * 1024);
        try { const r = await polish(b, me, typeof body.reply === 'string' ? body.reply : null); return send(res, 200, { ...r, website: await view(b, me, req) }); }
        catch (e) { return send(res, e.status || 503, { error: e.message, basic: !!e.basic }); }
      }
      if (sub === 'publish' && m === 'POST') {
        const body = await readBody(req, 8 * 1024);
        try { const r = await publish(b, me, body.onEdited); return send(res, 200, { ...r, website: await view(b, me, req) }); }
        catch (e) { if (e.handEdited) return send(res, 409, { error: e.message, handEdited: e.handEdited }); throw e; }
      }
      // feat/site-builder
      if (sub === 'brand' && m === 'GET') return send(res, 200, { brand: brandView(b) });
      if (sub === 'brand' && (m === 'PUT' || m === 'POST')) { brandSet(b, await readBody(req, 400 * 1024), me); return send(res, 200, { brand: brandView(b), website: await view(b, me, req) }); }
      if (sub === 'instant' && m === 'POST') {
        if (!canDraft(me)) return fail(res, 403, 'spectators are read-only');
        const r = await instant(b, me, await readBody(req, 16 * 1024));
        return send(res, 200, { ...r, website: await view(b, me, req) });
      }
      if (sub === 'code' && m === 'GET') { const r = await codeView(b); if (!r) return fail(res, 404, 'make a draft first'); return send(res, 200, r); }
      if (sub === 'ideas' && m === 'POST') {
        if (!canDraft(me) || me.role === 'agent') return fail(res, 403, 'spectators are read-only');
        const body = await readBody(req, 64 * 1024);
        if (sid === 'apply' || sid === 'skip') { await decideIdea(b, me, sid === 'apply'); return send(res, 200, { website: await view(b, me, req) }); }
        const idea = await ideas(b, me, { hint: one(body.hint, 200), reply: typeof body.reply === 'string' ? body.reply : undefined });
        return send(res, 200, { idea, website: await view(b, me, req) });
      }
      if (sub === 'ideas' && sid === 'prompt' && m === 'GET') { const g = await gather(b); return send(res, 200, sitegen.suggestPrompt(g, (load(b).gen || {}).type || sitegen.guessType(g.sense, g.p, ''), picksFor(b))); }
      if (sub === 'classic' && m === 'POST') {   // back to the simple page
        if (!canManage(b, me)) return fail(res, 403, 'only the host or the project lead changes the published page');
        const st = load(b); st.genLive = null; save(b, st); await build(b, { by: me.id, auto: st.auto });
        return send(res, 200, { website: await view(b, me, req) });
      }
      if (sub === 'suggest' && m === 'POST') return send(res, 200, { suggestion: suggest(b, await readBody(req, 64 * 1024), me) });
      if (sub === 'suggestions' && sid && ['approve', 'decline'].includes(act) && m === 'POST') {
        const r = await decide(b, sid, act === 'approve', me);
        return send(res, 200, { ...r, website: await view(b, me, req) });
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return null;
  }

  return { kitGet, kitSet, route, build, gather, html, signature, tick, exists, started, brandView, load, save: (pid, st) => save(pid, st), push: pid => push(pid), canManage: (pid, me) => canManage(pid, me), canDraft: me => canDraft(me), cleanLogo, fresh, newGen: (g, pid) => newGen(g, pid), httpsRepo, siteDir, generate, publish, draftHtml, mcpTools, instant, ideas, handEdits, brandSet };
};
module.exports.httpsRepo = httpsRepo;
module.exports.visionText = visionText;
