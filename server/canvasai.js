// Flint and agents on the design canvas (P1-F, docs/EDITOR-PARITY.md). Two jobs, no model anywhere:
//   1. Agents' tools (MCP): members' Claude Code / Codex read and change designs through the same rules as people
//      (server/canvas.js ops: permissions, versions, live for everyone), and their cursor shows on the canvas with their
//      name and color while they work.
//   2. Flint's free design moves, planned here and applied by the asking browser (so they land in that person's undo):
//      "make a login screen for Ember", "a pricing section", "a mobile home for a café", "dark mode version of this
//      frame", "rename layers", "tidy up", "make variants". Screens come from templates/canvas/*.json with the name,
//      colors and words filled in from what you said. Anything freeform gets an honest answer (server/flintfree.js tiers).
//
//   GET  /api/canvasai/templates                       -> { templates: [{ id, title, size }] }
//   POST /api/canvasai/plan { ask, file, sel: [ids] }  -> { kind, say, create?: [nodes], change?: [nodes], focus?, tier?, why? }
//        kind: build | rename | tidy | variants | theme | tier | freeform | none
// Template format (templates/canvas/<id>.json): { id, title, keys: [regex], size: [w, h], accent, root: spec, components: [spec] }
// A spec (also what agents send to add_frame / add_layers):
//   { t: frame|rect|ellipse|text|component|instance (default frame), n: name, x, y, w, h, fill, stroke, sw, r, op, clip,
//     lay: "col|row gap pad ai jc" (pad "a" | "v,h" | "t,r,b,l"), sz: "fill" | "hug" | "fill fill" | "fixed hug" …,
//     c: text, s: size, wt: weight, col: text color, f: font, al: align, lh, k: [children],
//     key: a name to refer to (components' children), ref: the component key (instances), ov: { childKey|self: { c, fill, hide } } }
// Strings may use {{name}} {{accent}} {{onAccent}} {{bg}} {{surface}} {{fg}} {{muted}} {{line}} {{soft}} {{ink}} …
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const rid = () => crypto.randomBytes(6).toString('hex');
const FONTS = new Set(['Inter', 'Inter Display', 'JetBrains Mono', 'Georgia', 'system-ui']);
const COLOR = /^#[0-9a-fA-F]{6}$/;
const NAMED = { red: '#E5484D', orange: '#F26B1D', ember: '#F26B1D', yellow: '#E9B000', gold: '#C99A2E', green: '#1F9D55', mint: '#3DBE8B', teal: '#0E9F8E', blue: '#2F6FEB', sky: '#2E9BD6', navy: '#1E3A8A', indigo: '#5B5BD6', purple: '#7C3AED', violet: '#7C3AED', pink: '#E8456B', rose: '#E8456B', brown: '#9A6A43', black: '#16181D', coral: '#F2705A', lime: '#65A30D', plum: '#8E3A80' };

// ---------- colors ----------
const hexRGB = h => { const x = String(h).replace('#', ''); const f = x.length === 3 ? x.split('').map(c => c + c).join('') : x.slice(0, 6); return [0, 2, 4].map(k => parseInt(f.slice(k, k + 2), 16) || 0); };
const rgbHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = h => { const [r, g, b] = hexRGB(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const sat = h => { const a = hexRGB(h), mx = Math.max(...a), mn = Math.min(...a); return mx ? (mx - mn) / mx : 0; };
const mix = (a, b, t) => { const x = hexRGB(a), y = hexRGB(b); return rgbHex(x.map((v, k) => v * t + y[k] * (1 - t))); };
function palette(accent, dark) {
  const L = dark
    ? { bg: '#111318', surface: '#1A1D23', fg: '#F1F0EC', muted: '#9BA1AB', line: '#2C3039', ink: '#F1F0EC', onInk: '#111318', onInkMuted: '#4A4F59' }
    : { bg: '#FAF8F5', surface: '#FFFFFF', fg: '#16181D', muted: '#6B6F78', line: '#E7E3DD', ink: '#1C1A19', onInk: '#FFFFFF', onInkMuted: '#C9C3BB' };
  return { ...L, accent, soft: mix(accent, L.bg, dark ? 0.24 : 0.14), onAccent: lum(accent) > 0.45 ? '#16181D' : '#FFFFFF' };
}

// ---------- words for a screen, from what you said ----------
const DOMAINS = [
  { rx: /\b(caf[eé]|coffee|bak(e|ery)|tea|brew|espresso|pastr(y|ies)|donut|bistro|restaurant|food|pizza|kombucha|juice)\b/i, thing: 'drinks', greeting: 'Good morning', place: 'Open 7am–3pm', tagline: 'Coffee and pastries, made slowly in small batches.', headline: 'Slow coffee for busy mornings', cta: 'Order ahead', link1: 'Menu', link2: 'Visit',
    items: [['Flat white', 'Double shot · oat milk', '$4.50'], ['Maple cold brew', 'Slow steeped · 16 oz', '$5.25'], ['Cardamom bun', 'Baked at 6am', '$3.75']] },
  { rx: /\b(gym|fitness|yoga|pilates|workout|coach|trainer|run(ning)?|climb(ing)?)\b/i, thing: 'classes', greeting: 'Ready to move?', place: 'Classes daily', tagline: 'Small classes, real coaches, every level welcome.', headline: 'Get stronger, one class at a time', cta: 'Book a class', link1: 'Classes', link2: 'Coaches',
    items: [['Morning flow', 'Yoga · 45 min', '6:30'], ['Strength basics', 'Barbell · 60 min', '12:00'], ['Hill sprints', 'Outdoor · 30 min', '18:00']] },
  { rx: /\b(shop|store|merch|brand|cloth(ing|es)?|socks?|tees?|jewel(le)?ry|candles?|ceramics|boutique|handmade)\b/i, thing: 'products', greeting: 'New this week', place: 'Free shipping over $50', tagline: 'Goods made in small runs and built to last.', headline: 'Made in small runs, built to last', cta: 'Shop now', link1: 'Shop', link2: 'Story',
    items: [['Canvas tote', 'Heavy cotton · natural', '$28'], ['Wool beanie', 'Merino · rust', '$34'], ['Enamel mug', '12 oz · speckled', '$22']] },
  { rx: /\b(band|music|album|songs?|tracks?|dj|podcast|episodes?|artist|label)\b/i, thing: 'tracks', greeting: 'Now playing', place: 'New single out Friday', tagline: 'New songs, live dates and the stories behind them.', headline: 'Loud songs for quiet towns', cta: 'Listen now', link1: 'Music', link2: 'Shows',
    items: [['Night drive', 'Single · 3:42', '3:42'], ['Paper moons', 'From the new EP', '4:05'], ['Static', 'Live at the Rialto', '5:11']] },
  { rx: /\b(game|games|studio|indie|arcade|level|quest)\b/i, thing: 'levels', greeting: 'Welcome back', place: 'Playtest open', tagline: 'A small game made by friends. Play the newest build.', headline: 'A tiny world worth getting lost in', cta: 'Play the demo', link1: 'Devlog', link2: 'Press kit',
    items: [['Lantern caves', 'World 1 · 8 stages', '★ 3'], ['Ember peaks', 'World 2 · 6 stages', '★ 2'], ['Glass lake', 'World 3 · new', 'New']] },
  { rx: /\b(travel|trips?|hotel|stays?|flights?|tour|booking)\b/i, thing: 'trips', greeting: 'Where to next?', place: 'Hand-picked stays', tagline: 'Small hotels and good trips, planned in minutes.', headline: 'Trips planned in minutes, not weekends', cta: 'Plan a trip', link1: 'Stays', link2: 'Guides',
    items: [['Lisbon long weekend', '3 nights · 2 people', '$640'], ['Kyoto in spring', '6 nights · ryokan', '$1,480'], ['Big Sur drive', '2 nights · cabin', '$390']] },
  { rx: /\b(notes?|tasks?|to-?do|projects?|productivity|team|work|crm|saas|startup|tool)\b/i, thing: 'projects', greeting: 'Good afternoon', place: 'Built for small teams', tagline: 'Plans, notes and to-dos your whole team can see.', headline: 'Everything your team is working on, in one place', cta: 'Start free', link1: 'Product', link2: 'Customers',
    items: [['Website refresh', '6 tasks · due Friday', '60%'], ['Spring launch', '12 tasks · 3 people', '25%'], ['Hiring', '4 tasks · ongoing', '80%']] },
];
const DEFAULT_DOMAIN = { thing: 'items', greeting: 'Hello again', place: 'Since 2026', tagline: 'Everything you need, kept simple and close at hand.', headline: 'Simple tools for everyday things', cta: 'Get started', link1: 'About', link2: 'Work',
  items: [['Weekly plan', 'Updated today', 'New'], ['Shared photos', '24 items', '24'], ['Reading list', '7 saved', '7']] };
const titleCase = s => s.replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
function nameFrom(ask) {
  const q = /["“']([^"”']{2,40})["”']/.exec(ask); if (q) return q[1].trim();
  const m = /\b(?:for|called|named)\s+(?:my\s+|our\s+|a\s+|an\s+|the\s+)?([^,.!?]{2,40})/i.exec(ask);
  let n = m ? m[1].replace(/\s+(with|that|which|in|using|where|on|and|please|app|in dark.*|dark|light)\b.*$/i, '').trim() : '';
  if (n && n === n.toLowerCase()) n = titleCase(n);
  return n;
}
function accentFrom(ask) {
  const hex = /#([0-9a-f]{6})\b/i.exec(ask); if (hex) return '#' + hex[1].toUpperCase();
  const c = new RegExp(`\\b(${Object.keys(NAMED).join('|')})\\b`, 'i').exec(ask); return c ? NAMED[c[1].toLowerCase()] : null;
}

// ---------- spec -> nodes ----------
function parseLay(l) {
  if (!l) return null;
  if (typeof l === 'object') { const pad = Array.isArray(l.p) ? l.p : l.padding != null ? [].concat(l.padding) : [l.p || 0]; return { d: (l.d || l.direction) === 'row' ? 'row' : 'col', g: +(l.g ?? l.gap ?? 0) || 0, p: padOf(pad), ai: l.ai || l.align || 'start', jc: l.jc || l.justify || 'start', ...(l.wr || l.wrap ? { wr: true } : {}) }; }
  const [d, g, p, ai, jc] = String(l).trim().split(/\s+/);
  return { d: d === 'row' ? 'row' : 'col', g: +g || 0, p: padOf(String(p || '0').split(',').map(Number)), ai: ai || 'start', jc: jc || 'start' };
}
function padOf(a) { a = a.map(x => +x || 0); return a.length >= 4 ? a.slice(0, 4) : a.length === 2 ? [a[0], a[1], a[0], a[1]] : a.length === 3 ? [a[0], a[1], a[2], a[1]] : [a[0], a[0], a[0], a[0]]; }
function parseSz(s, t) {
  if (!s) return null;
  if (typeof s === 'object') return { h: s.h || 'fixed', v: s.v || 'fixed' };
  const [h, v] = String(s).trim().split(/\s+/);
  return { h, v: v || (t === 'rect' || t === 'ellipse' ? 'fixed' : 'hug') };
}
function subAll(o, vars) {
  if (typeof o === 'string') return o.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
  if (Array.isArray(o)) return o.map(x => subAll(x, vars));
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = subAll(v, vars); return r; }
  return o;
}
// Turns a spec tree into flat canvas nodes. comps: key -> { id, kids: { key: id }, w, h } (filled while building components).
function toNodes(spec, { p = '', i = 1, x = 0, y = 0, root = false, comps = {}, fg = '#16181D', out = [] } = {}) {
  const t = spec.t || 'frame';
  const id = rid();
  const n = { id, t, p, i, v: 1, x: root ? x : +(spec.x || 0), y: root ? y : +(spec.y || 0), name: String(spec.n || spec.name || (t === 'text' ? String(spec.c || spec.text || 'Text').slice(0, 40) : titleCase(t))).slice(0, 80) };
  if (t === 'text') {
    const c = String(spec.c ?? spec.text ?? ''), s = +spec.s || +spec.size || 16;
    n.tx = { c, f: FONTS.has(spec.f || spec.font) ? (spec.f || spec.font) : 'Inter', s, wt: +spec.wt || +spec.weight || 400, lh: +spec.lh || 1.35, al: ['left', 'center', 'right'].includes(spec.al || spec.align) ? (spec.al || spec.align) : 'left', col: COLOR.test(spec.col || spec.color) ? (spec.col || spec.color) : fg };
    n.w = +spec.w || Math.max(20, Math.round(Math.min(c.length, 60) * s * 0.55)); n.h = +spec.h || Math.round(s * n.tx.lh * Math.max(1, Math.ceil((c.length * s * 0.55) / Math.max(1, n.w))));
    n.sz = parseSz(spec.sz, t) || { h: 'hug', v: 'hug' };
  } else {
    n.w = +spec.w || (t === 'rect' || t === 'ellipse' ? 40 : 100); n.h = +spec.h || (t === 'rect' || t === 'ellipse' ? 40 : 48);
    const lay = parseLay(spec.lay || spec.layout);
    if (lay && (t === 'frame' || t === 'component')) n.lay = lay;
    const sz = parseSz(spec.sz, t);
    if (sz) n.sz = sz; else if (n.lay && !root && t !== 'component') n.sz = { h: 'hug', v: 'hug' };
  }
  if (COLOR.test(spec.fill)) n.fill = spec.fill;
  if (COLOR.test(spec.stroke)) { n.stroke = spec.stroke; n.sw = +spec.sw || 1; }
  if (spec.r != null) n.r = +spec.r || 0;
  if (spec.op != null && +spec.op !== 1) n.op = +spec.op;
  if (spec.clip || (root && t !== 'text')) n.clip = true;
  if (spec.hide) n.hide = true;
  if (t === 'instance') {
    const c = comps[spec.ref] || null;
    n.comp = c ? c.id : String(spec.comp || '');
    if (!n.comp) return out;
    if (c) { n.w = +spec.w || c.w; n.h = +spec.h || c.h; if (!spec.n) n.name = c.name; }
    if (spec.ov && typeof spec.ov === 'object') {
      const ov = {};
      for (const [k, o] of Object.entries(spec.ov)) { const target = k === 'self' ? 'self' : (c && c.kids[k]) || (/^[A-Za-z0-9_-]{4,40}$/.test(k) ? k : null); if (target && o && typeof o === 'object') ov[target] = { ...(o.c != null ? { c: String(o.c) } : {}), ...(COLOR.test(o.fill) ? { fill: o.fill } : {}), ...(o.hide != null ? { hide: !!o.hide } : {}) }; }
      if (Object.keys(ov).length) n.ov = ov;
    }
    out.push(n); return out;
  }
  out.push(n);
  const kids = spec.k || spec.children || [];
  let reg = null;
  if (t === 'component' && spec.key) { reg = comps[spec.key] = { id, kids: {}, w: n.w, h: n.h, name: n.name }; }
  kids.forEach((k, j) => {
    const before = out.length;
    toNodes(k, { p: id, i: j + 1, comps, fg, out });
    if (reg) Object.assign(reg.kids, kidKeys(k, out, before));
  });
  return out;
}
// map the spec's `key`s inside a component child subtree to the node ids just made (same walk order as toNodes)
function kidKeys(spec, out, start) {
  const keys = {}; let at = start;
  (function walk(s) { const node = out[at++]; if (!node) return; if (s.key) keys[s.key] = node.id; if ((s.t || 'frame') !== 'instance') (s.k || s.children || []).forEach(walk); })(spec);
  return keys;
}

// ---------- the module ----------
module.exports = function canvasAI({ P, canvas, nameOf = () => 'someone', memberColor = () => '#F26B1D', root, classify = null, log = () => {} }) {
  const dir = path.join(root, 'templates', 'canvas');
  let TPL = null;
  function templates() {
    if (TPL) return TPL;
    TPL = [];
    try { for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) { try { const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); t.rx = (t.keys || []).map(k => new RegExp(`\\b(${k})\\b`, 'i')); TPL.push(t); } catch (e) { log('canvas template ' + f + ': ' + e.message); } } } catch {}
    return TPL;
  }
  const FLINT = { id: 'flint', name: 'Flint', color: '#F26B1D' };
  const err = (status, m) => Object.assign(new Error(m), { status });
  const live = f => Object.values(f.nodes).filter(n => !n.del);
  const kidsOf = (f, id) => live(f).filter(n => (n.p || '') === (id || '')).sort((a, b) => (a.i || 0) - (b.i || 0));
  const rootsOf = f => { const ids = new Set(live(f).map(n => n.id)); return live(f).filter(n => !n.p || !ids.has(n.p)); };
  const rootOf = (f, n) => { let r = n, k = 0; while (r && r.p && f.nodes[r.p] && !f.nodes[r.p].del && k++ < 200) r = f.nodes[r.p]; return r; };
  const clone = o => JSON.parse(JSON.stringify(o));
  function freeSpot(f, y0) {
    const rs = rootsOf(f);
    if (!rs.length) return { x: 0, y: 0 };
    return { x: Math.round(Math.max(...rs.map(r => (r.x || 0) + (r.w || 0))) + 120), y: y0 != null ? y0 : Math.round(Math.min(...rs.map(r => r.y || 0))) };
  }

  // a screen from a template, filled in from the ask
  function fromTemplate(t, ask, f, opts = {}) {
    const dom = DOMAINS.find(d => d.rx.test(ask)) || DEFAULT_DOMAIN;
    const dark = /\bdark\b/i.test(ask) && !/\b(dark|light) (mode |theme )?(version|variant|copy)\b/i.test(ask);
    const accent = accentFrom(ask) || t.accent || '#F26B1D';
    const name = nameFrom(ask) || opts.name || 'Lantern';
    const pal = palette(accent, dark);
    const it = dom.items;
    const num = s => parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0;
    const money = it.slice(0, 2).every(x => /^\$/.test(x[2]));
    const vars = { ...pal, name, handle: name.toLowerCase().replace(/[^a-z0-9]+/g, ''), thing: dom.thing, greeting: dom.greeting, place: dom.place, tagline: dom.tagline, headline: dom.headline, cta: dom.cta, link1: dom.link1, link2: dom.link2,
      item1: it[0][0], item1sub: it[0][1], price1: it[0][2], item2: it[1][0], item2sub: it[1][1], price2: it[1][2], item3: it[2][0], item3sub: it[2][1], price3: it[2][2],
      total: money ? '$' + (num(it[0][2]) + num(it[1][2])).toFixed(2) : it[0][2] };
    let [w, h] = t.size || [390, 844];
    const colRoot = /^col/.test(String((t.root || {}).lay || ''));
    if (colRoot && /\b(mobile|phone|iphone|android|ios)\b/i.test(ask)) [w, h] = [390, 844];
    else if (colRoot && /\b(desktop|laptop|web ?page|browser)\b/i.test(ask)) [w, h] = [1280, 800];
    else if (colRoot && /\btablet|ipad\b/i.test(ask)) [w, h] = [834, 1112];
    const spot = opts.at || freeSpot(f);
    const comps = {}; const out = [];
    // components first, to the right of the screen
    let cy = spot.y;
    for (const c of subAll(t.components || [], vars)) { const n0 = out.length; toNodes(c, { root: true, x: spot.x + w + 80, y: cy, comps, fg: pal.fg, out }); const top = out[n0]; top.clip = true; cy += (top.h || 80) + 60; }
    const rootSpec = subAll(t.root, vars);
    const start = out.length;
    toNodes({ ...rootSpec, w, h, fill: rootSpec.fill || pal.bg }, { root: true, x: spot.x, y: spot.y, comps, fg: pal.fg, out });
    const top = out[start]; top.sz = undefined; delete top.sz;
    return { nodes: out, focus: top.id, name, title: t.title, dark };
  }
  function pickTemplate(ask) {
    const a = String(ask || '');
    let best = null, score = 0;
    for (const t of templates()) { const s = t.rx.reduce((n, r) => n + (r.test(a) ? 1 : 0), 0); if (s > score) { best = t; score = s; } }
    return best;
  }

  // ---------- free moves on existing layers ----------
  const DEFAULT_NAME = /^(frame|rectangle|ellipse|text|group|component|layer|copy|instance)( \d+)?$/i;
  function guessName(f, n) {
    const kids = kidsOf(f, n.id), texts = kids.filter(k => k.t === 'text');
    const words = s => String(s || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ').slice(0, 28);
    if (n.t === 'text') { const s = (n.tx || {}).s || 16, c = words((n.tx || {}).c); return s >= 26 ? `Title · ${c}` : s <= 12 ? `Caption · ${c}` : c || 'Text'; }
    if (n.t === 'ellipse') return n.w >= 24 && Math.abs(n.w - n.h) < 4 ? (n.w >= 28 ? 'Avatar' : 'Dot') : 'Oval';
    if (n.t === 'rect') { if (n.h <= 3 || n.w <= 3) return 'Divider'; if (n.w >= 48 && n.h >= 48) return 'Image'; return 'Shape'; }
    if (n.t === 'group') return texts[0] ? `Group · ${words(texts[0].tx && texts[0].tx.c)}` : 'Group';
    if (!n.p || !f.nodes[n.p]) return 'Screen';
    if (kids.length === 1 && texts.length === 1 && (n.fill || n.stroke)) { const c = words(texts[0].tx && texts[0].tx.c); return (n.fill && !n.stroke ? 'Button · ' : n.stroke && !n.fill ? (n.r >= 6 ? 'Input · ' : 'Box · ') : 'Button · ') + c; }
    if (kids.length && kids.every(k => k.t === 'text')) return n.lay && n.lay.d === 'row' ? 'Label row' : 'Text block';
    if (kids.some(k => k.t === 'rect' && k.w >= 48 && k.h >= 48) && texts.length) return 'Card';
    if (n.lay) return n.lay.d === 'row' ? 'Row' : 'Stack';
    return kids.length ? 'Container' : 'Box';
  }
  function scopeOf(f, sel) {
    const ids = (sel || []).filter(id => f.nodes[id] && !f.nodes[id].del);
    if (!ids.length) return live(f);
    const all = new Map();
    const walk = id => { const n = f.nodes[id]; if (!n || n.del) return; all.set(id, n); kidsOf(f, id).forEach(k => walk(k.id)); };
    ids.forEach(walk);
    return [...all.values()];
  }
  function renameLayers(f, sel) {
    const change = [];
    for (const n of scopeOf(f, sel)) { if (n.t === 'instance') continue; if (n.name && !DEFAULT_NAME.test(n.name) && n.t !== 'text') continue; if (n.t === 'text' && n.name && !DEFAULT_NAME.test(n.name) && n.name !== String((n.tx || {}).c || '').slice(0, n.name.length)) continue; const nm = guessName(f, n); if (nm && nm !== n.name) change.push({ ...clone(n), name: nm }); }
    return change;
  }
  const r4 = v => Math.max(0, Math.round(v / 4) * 4);
  function tidy(f, sel) {
    const change = [];
    const targets = scopeOf(f, sel).filter(n => (n.t === 'frame' || n.t === 'component') && !n.lay);
    for (const fr of targets) {
      const kids = kidsOf(f, fr.id).filter(k => !k.hide); if (kids.length < 2) continue;
      const byY = [...kids].sort((a, b) => a.y - b.y), byX = [...kids].sort((a, b) => a.x - b.x);
      const stackY = byY.every((k, j) => !j || k.y >= byY[j - 1].y + byY[j - 1].h - 2);
      const stackX = byX.every((k, j) => !j || k.x >= byX[j - 1].x + byX[j - 1].w - 2);
      if (!stackY && !stackX) continue;
      const d = stackY ? 'col' : 'row', order = stackY ? byY : byX;
      const gaps = order.slice(1).map((k, j) => stackY ? k.y - (order[j].y + order[j].h) : k.x - (order[j].x + order[j].w)).sort((a, b) => a - b);
      const g = r4(gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : 0);   // the even spacing they were going for
      const minX = Math.min(...kids.map(k => k.x)), minY = Math.min(...kids.map(k => k.y));
      const maxX = Math.max(...kids.map(k => k.x + k.w)), maxY = Math.max(...kids.map(k => k.y + k.h));
      const p = [r4(minY), r4(fr.w - maxX), r4(fr.h - maxY), r4(minX)];
      if (stackY) { p[1] = p[3] = Math.min(p[1], p[3]); } else { p[0] = p[2] = Math.min(p[0], p[2]); }
      const inner = stackY ? fr.w - p[1] - p[3] : fr.h - p[0] - p[2];
      const along = k => stackY ? [k.x - minX, k.w] : [k.y - minY, k.h];
      const centred = kids.every(k => { const [o, s] = along(k); return Math.abs(o + s / 2 - (stackY ? (maxX - minX) : (maxY - minY)) / 2) < 6; });
      const fills = kids.every(k => Math.abs(along(k)[1] - inner) < 8);
      const ai = fills ? 'stretch' : centred ? 'center' : 'start';
      change.push({ ...clone(fr), lay: { d, g, p, ai, jc: 'start' } });
      order.forEach((k, j) => { const c = { ...clone(k), i: j + 1 }; if (Math.abs(along(k)[1] - inner) < 8 && k.t !== 'text') c.sz = stackY ? { h: 'fill', v: (k.sz && k.sz.v) || 'fixed' } : { h: (k.sz && k.sz.h) || 'fixed', v: 'fill' }; change.push(c); });
    }
    return change;
  }
  // copies of a subtree as a new top-level layer, with a transform applied to every node
  function copySubtree(f, src, at, fn, nameSuffix) {
    const map = new Map(), out = [];
    const walk = (n, p, top) => {
      const c = clone(n); const id = rid(); map.set(n.id, id);
      Object.assign(c, { id, p, v: 1 });
      delete c.by; delete c.at;
      if (top) { c.p = ''; c.x = at.x; c.y = at.y; c.i = 1; if (at.w) c.w = Math.round(at.w); if (at.h) c.h = Math.round(at.h); c.name = `${n.name || 'Frame'}${nameSuffix}`; if (c.sz) { c.sz = { h: c.sz.h === 'fill' ? 'fixed' : c.sz.h, v: c.sz.v === 'fill' ? 'fixed' : c.sz.v }; } }
      fn(c, p ? out.find(x => x.id === p) : null);
      out.push(c);
      if (n.t !== 'instance') kidsOf(f, n.id).forEach(k => walk(k, id, false));
    };
    walk(src, '', true);
    for (const c of out) if (c.t === 'instance' && c.ov) { const ov = {}; for (const [k, v] of Object.entries(c.ov)) ov[k] = v; c.ov = ov; }
    return out;
  }
  function themeFn(toDark) {
    return (c, parent) => {
      const pf = parent && (parent.fill || null);
      if (c.t === 'text' && c.tx) {
        const L = lum(c.tx.col || '#16181D'), onSat = pf && sat(pf) > 0.35 && lum(pf) < 0.6;
        if (toDark) { if (!onSat && L < 0.2) c.tx.col = '#F1F0EC'; else if (!onSat && L < 0.5 && sat(c.tx.col) < 0.3) c.tx.col = '#9BA1AB'; }
        else { if (!onSat && L > 0.6) c.tx.col = '#16181D'; else if (!onSat && L > 0.25 && sat(c.tx.col) < 0.3) c.tx.col = '#6B6F78'; }
        return;
      }
      if (c.fill) {
        const L = lum(c.fill), s = sat(c.fill);
        if (toDark) { if (L > 0.9) c.fill = parent ? '#1A1D23' : '#111318'; else if (L > 0.5 && s < 0.35) c.fill = '#2C3039'; else if (L > 0.5) c.fill = mix(c.fill, '#111318', 0.35); else if (L < 0.06) c.fill = '#22262E'; }
        else { if (L < 0.06) c.fill = parent ? '#FFFFFF' : '#FAF8F5'; else if (L < 0.3 && s < 0.35) c.fill = '#E7E3DD'; }
      }
      if (c.stroke) { const L = lum(c.stroke); if (toDark && L > 0.5 && sat(c.stroke) < 0.35) c.stroke = '#2C3039'; if (!toDark && L < 0.2 && sat(c.stroke) < 0.35) c.stroke = '#E7E3DD'; }
    };
  }
  function themeCopy(f, sel, toDark, boxes = {}) {
    const id = (sel || []).find(x => f.nodes[x] && !f.nodes[x].del);
    const n = id ? f.nodes[id] : null; if (!n) return null;
    const top = n.t === 'instance' && f.nodes[n.comp] ? n : n;
    const r = rootOf(f, top);
    const bx = boxes[top.id] || {};
    const at = { x: Math.round(Math.max(...rootsOf(f).map(q => (q.x || 0) + (q.w || 0))) + 120), y: r.y || 0, w: bx.w, h: bx.h };
    return { nodes: copySubtree(f, top, at, themeFn(toDark), toDark ? ' · Dark' : ' · Light'), title: toDark ? 'dark' : 'light' };
  }
  function variants(f, sel, boxes = {}) {
    const id = (sel || []).find(x => f.nodes[x] && !f.nodes[x].del); let n = id ? f.nodes[id] : null; if (!n) return null;
    if (n.t === 'instance' && f.nodes[n.comp] && !f.nodes[n.comp].del) n = f.nodes[n.comp];
    if (n.t === 'text' || n.t === 'rect' || n.t === 'ellipse') return null;
    const kids = kidsOf(f, n.id), text = kids.length === 1 && kids[0].t === 'text' ? kids[0] : null;
    const r = rootOf(f, n);
    let x = Math.round(Math.max(...rootsOf(f).map(q => (q.x || 0) + (q.w || 0))) + 120);
    const y = n === r ? r.y || 0 : (r.y || 0);
    const out = [], bx = boxes[n.id] || boxes[id] || {}, w = Math.round(bx.w || n.w || 100), h = Math.round(bx.h || n.h || 48);
    const make = (suffix, fn) => { const nodes = copySubtree(f, n, { x, y, w, h }, fn, suffix); out.push(...nodes); x += w + 40; };
    if (text && (n.fill || n.stroke)) {   // a button: secondary, ghost, disabled
      const base = n.fill || n.stroke;
      make(' / Secondary', (c, p) => { if (!p) { delete c.fill; c.stroke = base; c.sw = c.sw || 1; } else if (c.t === 'text') c.tx.col = base; });
      make(' / Ghost', (c, p) => { if (!p) { delete c.fill; delete c.stroke; delete c.sw; } else if (c.t === 'text') c.tx.col = base; });
      make(' / Disabled', (c, p) => { if (!p) c.op = 0.45; });
      return { nodes: out, kind: 'button', count: 3 };
    }
    make(' / Dark', themeFn(true));
    make(' / Compact', c => { if (c.lay) { c.lay.g = Math.round(c.lay.g * 0.6); c.lay.p = c.lay.p.map(v => Math.round(v * 0.6)); } if (c.tx) c.tx.s = Math.max(10, Math.round(c.tx.s * 0.88)); if (!c.lay && c.t !== 'text' && c.p) { c.w = Math.round(c.w * 0.85); c.h = Math.round(c.h * 0.85); } });
    return { nodes: out, kind: 'frame', count: 2 };
  }

  // ---------- plan a Flint move ----------
  function plan(f, ask, sel, opts = {}) {
    const boxes = opts.boxes || {};
    const a = String(ask || '').trim();
    if (!a) return { kind: 'none', say: 'Tell me what to design: "a login screen for Ember", "a pricing section", "a mobile home for a café". With a frame selected: "dark mode version", "make variants", "tidy up" or "rename layers".' };
    if (/\b(re)?name\b.*\blayers?\b|\blayer names?\b/i.test(a)) {
      const change = renameLayers(f, sel);
      return change.length ? { kind: 'rename', change, say: `Renamed ${change.length} layer${change.length === 1 ? '' : 's'} by what they are and what they say.`, focus: (sel || [])[0] } : { kind: 'none', say: 'Every layer here already has a real name.' };
    }
    if (/\b(tidy|clean ?up|auto ?layout|even(ly)? spac\w*|consistent spacing|fix (the )?spacing|line (it|them|things) up)\b/i.test(a)) {
      const change = tidy(f, sel);
      const frames = change.filter(c => c.lay).length;
      return change.length ? { kind: 'tidy', change, say: `Tidied ${frames} frame${frames === 1 ? '' : 's'}: auto layout with even spacing, so things stay lined up when you add more.`, focus: (sel || [])[0] } : { kind: 'none', say: (sel || []).length ? 'Nothing to tidy: the selection already uses auto layout, or its layers overlap in ways I won\'t guess at.' : 'Select a frame to tidy (or I\'ll look at the whole page next time you ask with nothing selected).' };
    }
    if (/\bvariants?\b/i.test(a)) {
      if (!(sel || []).length) return { kind: 'none', say: 'Select a component, a button or a frame first, then ask for variants.' };
      const v = variants(f, sel, boxes);
      return v ? { kind: 'variants', create: v.nodes, focus: v.nodes[0].id, say: v.kind === 'button' ? 'Made Secondary, Ghost and Disabled variants next to your design.' : 'Made Dark and Compact variants next to your design.' } : { kind: 'none', say: 'Variants need a frame, button or component, not a single shape or text.' };
    }
    const th = /\b(dark|light)\b[\w\s]{0,12}\b(mode|version|variant|copy|theme)\b/i.exec(a);
    if (th && (/\b(this|it|selected|selection|frame|screen)\b/i.test(a) || (sel || []).length)) {
      if (!(sel || []).length) return { kind: 'none', say: 'Select the frame first, then ask for a dark (or light) version.' };
      const t = themeCopy(f, sel, th[1].toLowerCase() === 'dark', boxes);
      return t ? { kind: 'theme', create: t.nodes, focus: t.nodes[0].id, say: `Made a ${t.title} version beside it. The original stays as it was.` } : { kind: 'none', say: 'Select a frame first.' };
    }
    const t = pickTemplate(a);
    if (t) {
      const b = fromTemplate(t, a, f, { name: opts.name });
      const ttl = t.title.toLowerCase();
      return { kind: 'build', create: b.nodes, focus: b.focus, template: t.id, say: `Designed ${/^[aeiou]/.test(ttl) ? 'an' : 'a'} ${ttl} for ${b.name}${b.dark ? ' in dark mode' : ''}, free from a template. Everything is real layers with auto layout: click to change words, colors or spacing.` };
    }
    const c = classify ? classify(a) : { tier: 'small' };
    if (c.tier === 'agent') return { kind: 'tier', tier: 'agent', why: c.why, say: 'Bigger than my free tier.' };
    return { kind: 'freeform', tier: 'small', why: `I design for free from ${templates().length} screen templates (sign in, onboarding, home, feed, product, pricing, settings, profile, checkout, landing, dashboard, chat, empty state) and tidy, rename, theme or make variants of what's selected. A freeform design like this needs a model: your AI helper can draw it here with the canvas tools.`, say: 'That one is freeform.' };
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current(); if (!pid || !P.canSee(me, pid)) return fail(res, 404, 'project not found');
    try {
      if (b === 'templates' && m === 'GET') return send(res, 200, { templates: templates().map(t => ({ id: t.id, title: t.title, size: t.size })) });
      if (b === 'plan' && m === 'POST') {
        const body = await readBody(req, 64 * 1024);
        if (!canvas.canEdit(me, pid)) return fail(res, 403, 'spectators can look but not edit');
        const f = canvas.load(pid, String(body.file || 'main'), String(body.file || 'main') === 'main'); if (!f) return fail(res, 404, 'no such design file');
        const sel = Array.isArray(body.sel) ? body.sel.map(String).slice(0, 200) : [];
        const boxes = {}; if (body.boxes && typeof body.boxes === 'object') for (const [k, b] of Object.entries(body.boxes).slice(0, 200)) if (b && Number.isFinite(+b.w) && Number.isFinite(+b.h)) boxes[k] = { w: Math.max(1, Math.min(20000, +b.w)), h: Math.max(1, Math.min(20000, +b.h)) };
        const out = plan(f, String(body.ask || '').slice(0, 600), sel, { name: (P.get(pid) || {}).name, boxes });
        // Flint's cursor shows where he's working, for everyone looking at this file
        const fx = out.focus && ((out.create || []).find(n => n.id === out.focus) || f.nodes[out.focus]);
        if (fx && !fx.p) canvas.cursor(pid, f.id, FLINT, (fx.x || 0) + 16, (fx.y || 0) + 16);
        return send(res, 200, out);
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 405, 'not allowed');
  }

  // ---------- server-side export (the same scene.js the editor uses) ----------
  let SC = null;
  function scene() {
    if (SC) return SC;
    const sandbox = { window: {}, Math, JSON, String, Number, Object, Array, Map, Set, Date };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'ui', 'canvas', 'scene.js'), 'utf8'), sandbox, { filename: 'scene.js' });
    SC = sandbox.window.TribeCanvasScene; return SC;
  }
  function exportFrame(f, id) {
    const S = scene().create();
    for (const n of Object.values(f.nodes)) S.nodes.set(n.id, n);
    return scene().toHTML(S, id);
  }

  // ---------- agents' tools ----------
  const say = (t, isError) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }], ...(isError ? { isError: true } : {}) });
  const who = me => ({ id: me.id, name: me.name || nameOf(me.id), color: memberColor(me.owner || me.id) || '#38C6B1' });
  const cur = () => P.current();
  const fileOf = (pid, id) => { const f = canvas.load(pid, String(id || 'main'), String(id || 'main') === 'main'); if (!f) throw err(404, `No design file "${id}". Use list_canvases.`); return f; };
  function commit(me, f, nodes, focus) {
    const pid = cur();
    const ops = nodes.map(n => { const prev = f.nodes[n.id]; return { ...n, v: Math.max(n.v || 1, prev ? (prev.v || 0) + 1 : 1) }; });
    const r = canvas.ops(pid, f.id, ops, me);
    const fx = focus && f.nodes[focus];
    if (fx) { let x = fx.x || 0, y = fx.y || 0, p = fx, k = 0; while (p.p && f.nodes[p.p] && k++ < 50) { p = f.nodes[p.p]; if (!p.lay) { x += p.x || 0; y += p.y || 0; } else { x = (p.x || 0) + 12; y = (p.y || 0) + 12; } } canvas.cursor(pid, f.id, who(me), x + 8, y + 8); }
    return r;
  }
  function line(f, n, depth) {
    const pad = '  '.repeat(depth);
    const bits = [n.id, n.t, JSON.stringify(n.name || '')];
    if (!n.lay || n.p === '' || !n.sz) bits.push(`${Math.round(n.w)}×${Math.round(n.h)}`);
    if (!n.p) bits.push(`at ${Math.round(n.x)},${Math.round(n.y)}`);
    if (n.lay) bits.push(`layout ${n.lay.d} gap ${n.lay.g} pad ${n.lay.p.join(',')} ${n.lay.ai}/${n.lay.jc}`);
    if (n.sz) bits.push(`size ${n.sz.h}/${n.sz.v}`);
    if (n.fill) bits.push(`fill ${n.fill}`);
    if (n.t === 'text' && n.tx) bits.push(`text ${JSON.stringify(String(n.tx.c).slice(0, 80))} ${n.tx.s}px ${n.tx.wt} ${n.tx.col}`);
    if (n.t === 'instance') bits.push(`of ${n.comp}${n.ov ? ' overrides ' + JSON.stringify(n.ov) : ''}`);
    return pad + bits.join('  ');
  }
  function tree(f, opts = {}) {
    const out = [], max = Math.max(1, Math.min(12, +opts.depth || 6));
    const walk = (n, d) => { if (out.length > 600) return; out.push(line(f, n, d)); if (d < max && n.t !== 'instance') kidsOf(f, n.id).forEach(k => walk(k, d + 1)); };
    const roots = rootsOf(f).sort((a, b) => (a.x || 0) - (b.x || 0));
    (opts.id ? [f.nodes[opts.id]].filter(Boolean) : roots).forEach(r => walk(r, 0));
    return out.join('\n') || '(empty design: add_frame to start)';
  }
  const SPEC_HELP = 'Spec: { t: frame|rect|ellipse|text|component|instance (default frame), n: name, w, h, x, y (only outside auto layout), fill "#RRGGBB", stroke, sw, r (radius), op, clip, lay: "col|row gap pad align justify" (pad "16" or "12,20" or "t,r,b,l"; align start|center|end|stretch; justify start|center|end|between), sz: "fill"|"hug"|"fill fill"|"fixed hug" (horizontal then vertical, inside auto layout), c: text, s: font size, wt: weight, col: text color, f: Inter|Inter Display|JetBrains Mono|Georgia|system-ui, al: left|center|right, k: [child specs], key/ref/ov for components }.';
  const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
  const FILE = { type: 'string', description: 'Design file id (default "main", see list_canvases)' };
  const mcpTools = {
    list_canvases: {
      description: 'List the design files (Figma-style canvases) of the current project, with how many layers each has. Designs live in the app under Design (#/canvas); people see your edits live with your cursor.',
      inputSchema: S({}),
      run: () => { const fs2 = canvas.list(cur()); return say(fs2.map(x => `${x.id}  ${JSON.stringify(x.name)}  ${x.count} layers  updated ${x.updated}`).join('\n')); },
    },
    get_canvas: {
      description: 'Read a design file as a compact layer tree: id, type, name, size, auto layout, fill, text, component/instance links. Optional `id` reads just that layer\'s subtree; `depth` limits nesting (default 6).',
      inputSchema: S({ file: FILE, id: { type: 'string' }, depth: { type: 'number' } }),
      run: ({ file, id, depth } = {}) => { const f = fileOf(cur(), file); const comps = live(f).filter(n => n.t === 'component'); return say(`Design "${f.name}" (${f.id})\n${tree(f, { id, depth })}${comps.length ? `\n\nComponents: ${comps.map(c => `${c.id} ${JSON.stringify(c.name)}`).join(', ')}` : ''}`); },
    },
    add_frame: {
      description: `Add a new top-level frame (a screen) to a design. Either describe it with \`spec\` (a tree; ${SPEC_HELP}) or pass \`template\` (auth, onboarding, home, feed, product, pricing, settings, profile, checkout, hero, dashboard, chat, empty) plus \`ask\` (e.g. "for Ember Socks in dark mode, green") to fill in names, words and colors. It lands to the right of the existing frames.`,
      inputSchema: S({ file: FILE, spec: { type: 'object', additionalProperties: true }, template: { type: 'string' }, ask: { type: 'string' } }),
      run: ({ file, spec, template, ask } = {}, me) => {
        const f = fileOf(cur(), file);
        let nodes, focus;
        if (template || (!spec && ask)) {
          const t = template ? templates().find(x => x.id === template) : pickTemplate(ask);
          if (!t) return say(`No template "${template || ask}". Templates: ${templates().map(x => x.id).join(', ')}.`, true);
          const b = fromTemplate(t, ask || '', f, { name: (P.get(cur()) || {}).name }); nodes = b.nodes; focus = b.focus;
        } else if (spec && typeof spec === 'object') {
          const at = freeSpot(f); nodes = toNodes({ fill: '#FFFFFF', w: 390, h: 844, ...spec, t: spec.t === 'component' ? 'component' : 'frame' }, { root: true, x: spec.x != null ? +spec.x : at.x, y: spec.y != null ? +spec.y : at.y }); focus = nodes[0] && nodes[0].id;
        } else return say('Pass `spec` or `template`.', true);
        const r = commit(me, f, nodes, focus);
        return say(`Added "${(nodes.find(n => n.id === focus) || {}).name}" (${focus}) with ${r.applied.length} layers. Read it back with get_canvas id ${focus}.`);
      },
    },
    add_layers: {
      description: `Add layers inside an existing frame or component (\`parent\` id from get_canvas). \`layers\`: a list of specs (${SPEC_HELP}). Inside an auto layout frame they flow in order after the current children.`,
      inputSchema: S({ file: FILE, parent: { type: 'string' }, layers: { type: 'array', items: { type: 'object', additionalProperties: true } } }, ['parent', 'layers']),
      run: ({ file, parent, layers } = {}, me) => {
        const f = fileOf(cur(), file); const p = f.nodes[parent];
        if (!p || p.del || !['frame', 'component', 'group'].includes(p.t)) return say(`No frame "${parent}". Use get_canvas.`, true);
        const comps = {}; for (const c of live(f).filter(n => n.t === 'component')) comps[c.id] = { id: c.id, kids: {}, w: c.w, h: c.h, name: c.name };
        let i = Math.max(0, ...kidsOf(f, parent).map(k => k.i || 0)) + 1; const nodes = [];
        for (const s of (layers || []).slice(0, 200)) { const before = nodes.length; toNodes(s.t === 'instance' && s.comp ? { ...s, ref: s.comp } : s, { p: parent, i: i++, comps, out: nodes }); if (nodes.length === before) continue; }
        const r = commit(me, f, nodes, nodes[0] && nodes[0].id);
        return say(`Added ${r.applied.length} layers to ${JSON.stringify(p.name)}: ${nodes.filter(n => n.p === parent).map(n => n.id).join(', ')}.`);
      },
    },
    update_layer: {
      description: 'Change one layer: any of name, x, y, w, h, fill, stroke, sw, r, op, hide, lock, sz ("fill hug"…), and for text: text, size, weight, color, font, align. For an instance, `text`/`fill` with `child` (a layer id inside its component) sets an override.',
      inputSchema: S({ file: FILE, id: { type: 'string' }, child: { type: 'string' }, props: { type: 'object', additionalProperties: true } }, ['id', 'props']),
      run: ({ file, id, child, props = {} } = {}, me) => {
        const f = fileOf(cur(), file); const n = f.nodes[id];
        if (!n || n.del) return say(`No layer "${id}".`, true);
        const c = clone(n);
        if (n.t === 'instance' && child) { c.ov = c.ov || {}; const o = c.ov[child] = { ...(c.ov[child] || {}) }; if (props.text != null) o.c = String(props.text); if (COLOR.test(props.fill)) o.fill = props.fill; if (props.hide != null) o.hide = !!props.hide; }
        else {
          for (const k of ['name', 'x', 'y', 'w', 'h', 'r', 'op', 'sw']) if (props[k] != null) c[k] = k === 'name' ? String(props[k]) : +props[k];
          for (const k of ['fill', 'stroke']) if (props[k] === null || props[k] === 'none') delete c[k]; else if (COLOR.test(props[k])) c[k] = props[k];
          for (const k of ['hide', 'lock', 'clip']) if (props[k] != null) { if (props[k]) c[k] = true; else delete c[k]; }
          if (props.sz) c.sz = parseSz(props.sz, c.t);
          if (c.t === 'text') { c.tx = { ...c.tx }; if (props.text != null) c.tx.c = String(props.text); if (props.size) c.tx.s = +props.size; if (props.weight) c.tx.wt = +props.weight; if (COLOR.test(props.color)) c.tx.col = props.color; if (FONTS.has(props.font)) c.tx.f = props.font; if (props.align) c.tx.al = props.align; }
        }
        commit(me, f, [c], id);
        return say(`Updated ${JSON.stringify(c.name)} (${id}).`);
      },
    },
    set_auto_layout: {
      description: 'Turn auto layout (CSS flex) on, change it, or turn it off for a frame or component. direction row|col, gap, padding (number or [t,r,b,l]), align start|center|end|stretch, justify start|center|end|between, wrap. `off: true` removes it.',
      inputSchema: S({ file: FILE, id: { type: 'string' }, direction: { type: 'string', enum: ['row', 'col'] }, gap: { type: 'number' }, padding: {}, align: { type: 'string' }, justify: { type: 'string' }, wrap: { type: 'boolean' }, off: { type: 'boolean' } }, ['id']),
      run: (a = {}, me) => {
        const f = fileOf(cur(), a.file); const n = f.nodes[a.id];
        if (!n || n.del || !['frame', 'component'].includes(n.t)) return say(`"${a.id}" is not a frame or component.`, true);
        const c = clone(n);
        if (a.off) delete c.lay;
        else { const l = c.lay || { d: 'col', g: 0, p: [0, 0, 0, 0], ai: 'start', jc: 'start' }; c.lay = parseLay({ d: a.direction || l.d, g: a.gap ?? l.g, p: a.padding != null ? [].concat(a.padding) : l.p, ai: a.align || l.ai, jc: a.justify || l.jc, wr: a.wrap ?? l.wr }); }
        commit(me, f, [c], a.id);
        return say(a.off ? `Auto layout off for ${JSON.stringify(c.name)}.` : `Auto layout on ${JSON.stringify(c.name)}: ${c.lay.d}, gap ${c.lay.g}, padding ${c.lay.p.join(',')}, ${c.lay.ai}/${c.lay.jc}.`);
      },
    },
    create_component: {
      description: 'Turn a frame into a main component, so copies (create_instance) follow its changes. Returns the component id.',
      inputSchema: S({ file: FILE, id: { type: 'string' } }, ['id']),
      run: ({ file, id } = {}, me) => { const f = fileOf(cur(), file); const n = f.nodes[id]; if (!n || n.del || n.t !== 'frame') return say(`"${id}" is not a frame.`, true); commit(me, f, [{ ...clone(n), t: 'component' }], id); return say(`${JSON.stringify(n.name)} (${id}) is now a component.`); },
    },
    create_instance: {
      description: 'Place a copy of a component. Inside `parent` (a frame id; it flows there if that frame uses auto layout) or on its own at x,y. `overrides`: { "<layer id inside the component>": { text, fill, hide } }.',
      inputSchema: S({ file: FILE, component: { type: 'string' }, parent: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, overrides: { type: 'object', additionalProperties: true } }, ['component']),
      run: ({ file, component, parent, x, y, overrides } = {}, me) => {
        const f = fileOf(cur(), file); const c = f.nodes[component];
        if (!c || c.del || c.t !== 'component') return say(`"${component}" is not a component.`, true);
        const p = parent && f.nodes[parent] && !f.nodes[parent].del ? parent : '';
        const at = p ? { x: +x || 0, y: +y || 0 } : (x != null ? { x: +x, y: +y || 0 } : freeSpot(f));
        const ov = {}; for (const [k, o] of Object.entries(overrides || {})) { if (!o) continue; ov[k] = { ...(o.text != null ? { c: String(o.text) } : o.c != null ? { c: String(o.c) } : {}), ...(COLOR.test(o.fill) ? { fill: o.fill } : {}), ...(o.hide != null ? { hide: !!o.hide } : {}) }; }
        const n = { id: rid(), t: 'instance', comp: component, p, i: p ? Math.max(0, ...kidsOf(f, p).map(k => k.i || 0)) + 1 : 1, x: at.x, y: at.y, w: c.w, h: c.h, name: c.name, v: 1, ...(Object.keys(ov).length ? { ov } : {}) };
        commit(me, f, [n], n.id);
        return say(`Placed a copy of ${JSON.stringify(c.name)}: ${n.id}.`);
      },
    },
    export_frame: {
      description: 'Export a frame (or component) as HTML + CSS: auto layout comes out as flex, class names from layer names. Use it to build the real page in the code from the design.',
      inputSchema: S({ file: FILE, id: { type: 'string' } }, ['id']),
      run: ({ file, id } = {}) => { const f = fileOf(cur(), file); const r = exportFrame(f, id); return r ? say(`<!-- ${r.name} -->\n<style>\n${r.css}\n</style>\n${r.html}`) : say(`No layer "${id}".`, true); },
    },
  };
  for (const t of Object.values(mcpTools)) { const run = t.run; t.run = async (a, me, ctx) => { try { return await run(a, me, ctx); } catch (e) { return say(e.message || String(e), true); } }; }

  return { route, mcpTools, plan, templates, fromTemplate, toNodes, exportFrame, tidy, renameLayers };
};
module.exports.toNodes = toNodes;
module.exports.palette = palette;
