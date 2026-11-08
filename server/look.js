// Look: tribe-wide and per-project customization (Settings › Look, the project menu's Customize; app/ui/look.js).
//
//   Tribe   accent (the theme's highlight hue: --accent-2 / --live; Ember stays the brand and the burnt-rust primary
//           button stays the main action), background (none · flat pattern · solid tint · uploaded image, dimmed),
//           name, emoji or icon, density (cozy | compact), font size (s | m | l | xl)
//   Project theme override (a theme id from app/ui/themes.js) and a banner (cover image) on the Dashboard
//   Personal overrides live on each device (TribeStore `look`), never here.
//
// Legibility is checked, not hoped for: an accent must reach 3:1 against the default theme's canvas, surface and main
// pane (WCAG 1.4.11, the same bar the theme accents meet), and text on it must reach 4.5:1 in black or white. The
// browser adapts the accent per theme and refuses personal combinations that fail on the theme you use. Images are
// dimmed in the browser and the dim never goes below MIN_DIM.
//
//   GET /api/look     { look: { tribe, projects }, canEdit, palette, patterns, tints, fontSizes }
//   PUT /api/look     { tribe?: {...}, project?: { id, theme?, banner? } }   host and builders (project: its members)
// State: .tribe/look.json (tribe folder). Changes broadcast { type: 'look' }.
'use strict';

const PALETTE = [   // the swatches: each one passes on every built-in theme after the browser's per-theme adjustment
  { id: 'moss', name: 'Moss', hex: '#8EC07C' }, { id: 'teal', name: 'Teal', hex: '#38C6B1' }, { id: 'sky', name: 'Sky', hex: '#5BB4F0' },
  { id: 'iris', name: 'Iris', hex: '#8F9BFF' }, { id: 'violet', name: 'Violet', hex: '#BD93F9' }, { id: 'rose', name: 'Rose', hex: '#FF8FA6' },
  { id: 'amber', name: 'Amber', hex: '#FABD2F' }, { id: 'lime', name: 'Lime', hex: '#B8E05A' },
];
const PATTERNS = ['stars', 'dots', 'grid', 'topo'];
const TINTS = { ember: '#F26B1D', teal: '#38C6B1', indigo: '#6C7CFF', moss: '#8EC07C', plum: '#B07CC6', sand: '#C9A66B' };
const DENSITY = ['cozy', 'compact'];
const FONT_SIZES = { s: 0.94, m: 1, l: 1.08, xl: 1.16 };
const MIN_DIM = 0.72, MAX_IMG = 1_200_000, MAX_ICON = 200_000;
// The default theme (Campfire): the accent is checked against these.
const BASE = { canvas: '#1D2021', surface: '#282828', main: '#232526' };

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const okHex = c => /^#[0-9a-fA-F]{6}$/.test(String(c || ''));
const okImg = (s, max) => typeof s === 'string' && s.length <= max && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s);
const okTheme = t => /^[a-z][a-z-]{1,23}$/.test(String(t || ''));

// '' when the accent is fine on the default theme, else why not.
function accentProblem(hex) {
  if (!okHex(hex)) return 'Pick a color like #38C6B1.';
  const worst = Math.min(...Object.values(BASE).map(bg => ratio(hex, bg)));
  if (worst < 3) return `That color is hard to see on the default theme (${worst.toFixed(1)}:1, needs 3:1). Try a lighter one.`;
  if (Math.max(ratio(hex, '#000000'), ratio(hex, '#FFFFFF')) < 4.5) return 'Text on that color would be hard to read. Try another one.';
  return '';
}

// The cover above a project's Dashboard: { kind: 'color', hex } | { kind: 'pattern', id, hex } | { kind: 'image', image }
// | { kind: 'github' } (the repo's social preview, only when the pinned repo has a github.com remote; fetched here,
// cached in .tribe/look/cover-<project>.png, never hotlinked by browsers). TRIBE_OG_BASE / TRIBE_GH_API: test hooks.
const OG_BASE = () => (process.env.TRIBE_OG_BASE || 'https://opengraph.githubassets.com').replace(/\/+$/, '');
const GH_API = () => (process.env.TRIBE_GH_API || 'https://api.github.com').replace(/\/+$/, '');
function githubOf(remote) {
  const s = String(remote || '').trim(); let m;
  if ((m = s.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)) || (m = s.match(/^(?:ssh:\/\/git@|https?:\/\/(?:[^/@]+@)?)github\.com(?::\d+)?\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/))) return { owner: m[1], repo: m[2] };
  return null;
}

module.exports = function look({ base, P, tribe, saveTribe, broadcast, getMembers, W = null }) {
  const FILE = '.tribe/look.json';
  const blank = () => ({ tribe: { accent: null, bg: { kind: 'none' }, emoji: '', icon: '', density: '', fontSize: '' }, projects: {} });
  let st = (() => { const s = base.readJSON(FILE, null); return s ? { ...blank(), ...s, tribe: { ...blank().tribe, ...(s.tribe || {}) }, projects: s.projects || {} } : blank(); })();
  const save = () => base.writeJSON(FILE, st);
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const canTribe = me => !!me && (me.role === 'host' || me.role === 'builder');
  const canProject = (me, pid) => canTribe(me) && P.canSee(me, pid);

  // ---------- covers ----------
  const fs = require('node:fs'), path = require('node:path');
  const coverFile = pid => base.p('.tribe', 'look', `cover-${String(pid).replace(/[^\w-]/g, '')}.png`);
  const ghCache = new Map();   // pid -> { gh, at }
  async function githubFor(pid) {
    const p = P.get(pid); if (!p || !p.repo || !W || !W.isRepo || !W.isRepo(p.repo)) return null;
    const c = ghCache.get(pid); if (c && Date.now() - c.at < 5000) return c.gh;
    let gh = null; try { gh = githubOf(await W.remoteOf(p.repo)); } catch {}
    ghCache.set(pid, { gh, at: Date.now() }); return gh;
  }
  async function fetchCover(pid) {
    const gh = await githubFor(pid); if (!gh) throw err(400, 'This project\'s repo is not on GitHub yet.');
    const get = async (u, ms) => { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms); try { return await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'TribeCode', Accept: '*/*' } }); } finally { clearTimeout(t); } };
    let html = `https://github.com/${gh.owner}/${gh.repo}`;
    try { const r = await get(`${GH_API()}/repos/${gh.owner}/${gh.repo}`, 6000); if (r.ok) { const j = await r.json(); if (j && /^https:\/\/github\.com\//.test(j.html_url || '')) html = j.html_url; } } catch {}
    const [owner, repo] = html.replace(/^https:\/\/github\.com\//, '').split('/');
    let buf = null;
    try { const r = await get(`${OG_BASE()}/1/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, 10_000); if (r.ok && /^image\//.test(r.headers.get('content-type') || 'image/png')) buf = Buffer.from(await r.arrayBuffer()); } catch {}
    if (!buf || buf.length < 64 || buf.length > MAX_IMG) throw err(502, 'Could not get the GitHub preview right now. Try again in a minute.');
    fs.mkdirSync(path.dirname(coverFile(pid)), { recursive: true }); fs.writeFileSync(coverFile(pid), buf);
    return { kind: 'github', repo: `${owner}/${repo}`, at: new Date().toISOString() };
  }
  function coverOut(pid, v) {
    const c = v.cover || (v.banner ? { kind: 'image', image: v.banner } : null);
    if (!c) return null;
    if (c.kind === 'github') { try { return { ...c, image: 'data:image/png;base64,' + fs.readFileSync(coverFile(pid)).toString('base64') }; } catch { return null; } }
    return c;
  }

  async function view(me) {
    const projects = {};
    for (const [pid, v] of Object.entries(st.projects)) if (P.get(pid) && P.canSee(me, pid)) { const { banner, ...rest } = v; projects[pid] = { ...rest, cover: coverOut(pid, v) }; }
    const github = {};
    for (const p of (P.visibleTo ? P.visibleTo(me) : [])) { const gh = await githubFor(p.id).catch(() => null); if (gh) github[p.id] = `${gh.owner}/${gh.repo}`; }
    return { look: { tribe: { ...st.tribe, name: tribe.name }, projects }, github, canEdit: canTribe(me), palette: PALETTE, patterns: PATTERNS, tints: TINTS, fontSizes: FONT_SIZES, minDim: MIN_DIM, base: BASE };
  }

  function setTribe(b, me) {
    if (!canTribe(me)) throw err(403, 'only the host and builders change the tribe\'s look');
    const t = st.tribe;
    if (b.accent !== undefined) {
      if (b.accent === null || b.accent === '') t.accent = null;
      else { const why = accentProblem(b.accent); if (why) throw err(400, why); t.accent = String(b.accent).toUpperCase(); }
    }
    if (b.bg !== undefined) {
      const g = b.bg || { kind: 'none' };
      if (g.kind === 'none') t.bg = { kind: 'none' };
      else if (g.kind === 'pattern') { if (!PATTERNS.includes(g.id)) throw err(400, 'unknown pattern'); t.bg = { kind: 'pattern', id: g.id }; }
      else if (g.kind === 'tint') { if (!TINTS[g.id]) throw err(400, 'unknown tint'); t.bg = { kind: 'tint', id: g.id }; }
      else if (g.kind === 'image') {
        const dim = Number(g.dim ?? 0.85);
        if (!(dim >= MIN_DIM && dim <= 0.97)) throw err(400, `Keep the image dimmed at least ${Math.round(MIN_DIM * 100)}% so text stays readable.`);
        const image = g.image === undefined && t.bg.kind === 'image' ? t.bg.image : g.image;
        if (!okImg(image, MAX_IMG)) throw err(400, 'Use a PNG, JPEG or WebP picture under about 1 MB.');
        t.bg = { kind: 'image', image, dim: Math.round(dim * 100) / 100 };
      } else throw err(400, 'unknown background');
    }
    if (b.emoji !== undefined) { const e = String(b.emoji || '').trim(); if ([...e].length > 4) throw err(400, 'one emoji is enough'); t.emoji = e; }
    if (b.icon !== undefined) { if (b.icon && !okImg(b.icon, MAX_ICON)) throw err(400, 'Use a small PNG, JPEG or WebP icon.'); t.icon = b.icon || ''; }
    if (b.density !== undefined) { if (b.density && !DENSITY.includes(b.density)) throw err(400, 'density is cozy or compact'); t.density = b.density || ''; }
    if (b.fontSize !== undefined) { if (b.fontSize && !FONT_SIZES[b.fontSize]) throw err(400, 'font size is s, m, l or xl'); t.fontSize = b.fontSize || ''; }
    if (b.name !== undefined) {
      if (me.role !== 'host') throw err(403, 'only the host renames the tribe');
      const n = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 48);
      if (!n) throw err(400, 'give the tribe a name');
      tribe.name = n; saveTribe();
    }
  }
  async function setProject(b, me) {
    const pid = String(b.id || '');
    if (!P.get(pid)) throw err(404, 'project not found');
    if (!canProject(me, pid)) throw err(403, 'only the host and builders change a project\'s look');
    const v = { ...(st.projects[pid] || {}) };
    if (b.theme !== undefined) { if (b.theme && !okTheme(b.theme)) throw err(400, 'unknown theme'); if (b.theme) v.theme = b.theme; else delete v.theme; }
    if (b.banner !== undefined) b.cover = b.banner ? { kind: 'image', image: b.banner } : null;   // older callers
    if (b.cover !== undefined) {
      const c = b.cover; delete v.banner;
      if (!c) delete v.cover;
      else if (c.kind === 'color') { if (!okHex(c.hex)) throw err(400, 'Pick a color like #38C6B1.'); v.cover = { kind: 'color', hex: c.hex.toUpperCase() }; }
      else if (c.kind === 'pattern') { if (!PATTERNS.includes(c.id) || !okHex(c.hex)) throw err(400, 'unknown pattern'); v.cover = { kind: 'pattern', id: c.id, hex: c.hex.toUpperCase() }; }
      else if (c.kind === 'image') { if (!okImg(c.image, MAX_IMG)) throw err(400, 'Use a PNG, JPEG or WebP picture under about 1 MB.'); v.cover = { kind: 'image', image: c.image }; }
      else if (c.kind === 'github') v.cover = await fetchCover(pid);
      else throw err(400, 'unknown cover');
    }
    if (Object.keys(v).length) st.projects[pid] = v; else delete st.projects[pid];
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (b) return fail(res, 404, 'no such look route');
    if (m === 'GET') return send(res, 200, await view(me));
    if (m === 'PUT') {
      const body = await readBody(req, 4 * 1024 * 1024);
      const before = JSON.stringify(st);
      try {
        if (body.tribe && typeof body.tribe === 'object') setTribe(body.tribe, me);
        if (body.project && typeof body.project === 'object') await setProject(body.project, me);
      } catch (e) { st = JSON.parse(before); return fail(res, e.status || 400, e.message); }
      st.at = new Date().toISOString(); st.by = me.id; save();
      broadcast({ type: 'look', tribe: tribe.name });
      return send(res, 200, await view(me));
    }
    return fail(res, 405, 'GET or PUT');
  }
  return { route, view, accentProblem };
};
module.exports.accentProblem = accentProblem;
module.exports.ratio = ratio;
module.exports.PALETTE = PALETTE;
module.exports.githubOf = githubOf;
