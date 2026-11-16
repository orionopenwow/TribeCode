// Moving and 3D backgrounds for the website designer (feat/site-3d): the model. Shared by the browser
// (window.TribeSiteFx) and the server (require), like sitecfg.js, which calls in here at four small points
// (normalize, render, exportFiles, command). The drawing itself is app/ui/sitefx/fx.js (+ fx3d.js and three.min.js for
// the 3D kinds), which also ships inside a published or downloaded site, so the site needs no server and no network.
// Ten kinds are ports of ThreeUI Community by Meng To (MIT), see app/ui/sitefx/LICENSE-threeui.txt and NOTICE.
//
// A section's moving background lives on the block:  block.fx = { kind, s: speed, d: density, i: intensity,
//   p: 1|0 (move on phones), c: 'accent'|'ink'|'muted', c2: same }   (colours are names from the site's palette, so a
//   new look or dark mode recolours the background too)
//   KINDS[id] = { name, about, three: needs Three.js, d: defaults }      LIST = ids in picker order
//   clean(fx) -> a valid fx or null · setFx(cfg, pageId, blockId, patch | null) -> new cfg · uses(cfg) -> { any, three, kinds }
//   decorate(html, cfg, o, colors) -> html with the layers, the CSS and the script(s) · exportInto(result, cfg, kind)
//   still(kind, a, b) -> an SVG data URL: what shows before the script runs, with no WebGL, or on phones when p is 0
//   command(cfg, step, at, S) -> { cfg?, say, sel? } for Flint's "site.fx" steps · preload() (browser: fetch the script texts)
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeSiteFx = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o));
  const KINDS = {
    dots: { name: 'Pulsing dots', about: 'A grid of dots that breathe in waves.', d: { s: 1, d: 1, i: 1 } },
    horizon: { name: 'Glowing horizon', about: 'Soft light rising from the bottom edge.', d: { s: 1, d: 1, i: 1 } },
    ribbons: { name: 'Ribbons of light', about: 'Three dotted ribbons that sway.', d: { s: 1, d: 1, i: 1 } },
    streams: { name: 'Flowing streams', about: 'Wide diagonal bands that drift.', d: { s: 0.8, d: 1, i: 0.8 } },
    rings: { name: 'Ripples', about: 'The pattern of a struck bell, calm in the middle.', d: { s: 1, d: 1, i: 0.9 } },
    orb: { name: 'Glowing orb', about: 'A ball of slow smoke beside your words.', d: { s: 1, d: 1, i: 1 } },
    arc: { name: 'Pixel arc', about: 'Small squares lighting up along an arc.', d: { s: 1, d: 1, i: 0.9 } },
    drops: { name: 'Water drops', about: 'Drops gather, run down and ripple.', d: { s: 1, d: 1, i: 1 } },
    sphere: { name: 'Turning sphere', about: 'A 3D sphere of points with orbits.', three: true, d: { s: 1, d: 1, i: 1 } },
    dome: { name: 'Rising dome', about: 'A 3D dome of points turning below.', three: true, d: { s: 1, d: 1, i: 1 } },
    constellation: { name: 'Constellation', about: '3D points joined by thin lines.', three: true, d: { s: 1, d: 1, i: 1 } },
    drift: { name: 'Floating particles', about: 'A deep 3D field of soft dots.', three: true, d: { s: 1, d: 0.7, i: 0.9 } },
    warp: { name: 'Starfield', about: '3D points streaming toward you.', three: true, d: { s: 1, d: 1, i: 1 } },
    // feat/asset-libs: drawn for TribeCode (app/ui/sitefx/fx.js, "more backgrounds")
    aurora: { name: 'Aurora', about: 'Soft curtains of light near the top.', d: { s: 1, d: 1, i: 1 } },
    grid: { name: 'Horizon grid', about: 'A floor of lines running toward you.', d: { s: 1, d: 1, i: 0.9 } },
    contour: { name: 'Contour lines', about: 'A slow map of hills.', d: { s: 1, d: 1, i: 1 } },
    blobs: { name: 'Soft blobs', about: 'Rounded shapes that drift and merge.', d: { s: 1, d: 1, i: 0.8 } },
    waves: { name: 'Wave lines', about: 'Thin lines rolling like a calm sea.', d: { s: 1, d: 1, i: 1 } },
    caustics: { name: 'Pool light', about: 'Light moving on the floor of a pool.', d: { s: 0.8, d: 1, i: 0.9 } },
    halftone: { name: 'Halftone', about: 'Printed dots that swell and shrink.', d: { s: 1, d: 1, i: 0.9 } },
    stripes: { name: 'Sliding stripes', about: 'Diagonal stripes gliding past.', d: { s: 1, d: 1, i: 1 } },
    cells: { name: 'Living cells', about: 'A pattern of cells that shift.', d: { s: 1, d: 1, i: 0.9 } },
    sunburst: { name: 'Sunburst', about: 'Slow rays rising from below.', d: { s: 1, d: 1, i: 1 } },
    spiral: { name: 'Spiral', about: 'Arms of a spiral turning.', d: { s: 1, d: 1, i: 1 } },
    tunnel: { name: 'Tunnel', about: 'Rings moving toward you.', d: { s: 0.8, d: 1, i: 0.9 } },
    dunes: { name: 'Dunes', about: 'Layered hills that shift slowly.', d: { s: 1, d: 1, i: 0.8 } },
    clouds: { name: 'Clouds', about: 'Soft clouds drifting by.', d: { s: 1, d: 1, i: 1 } },
    ink: { name: 'Ink in water', about: 'Swirls folding into each other.', d: { s: 1, d: 1, i: 0.9 } },
    marble: { name: 'Marble', about: 'Veins that wander slowly.', d: { s: 1, d: 1, i: 0.9 } },
    scanlines: { name: 'Scanlines', about: 'Fine lines with a slow bright band.', d: { s: 1, d: 1, i: 1 } },
    truchet: { name: 'Curly tiles', about: 'Quarter circles that flip now and then.', d: { s: 1, d: 1, i: 1 } },
    hexes: { name: 'Honeycomb', about: 'Hexagons that pulse outward.', d: { s: 1, d: 1, i: 1 } },
    plus: { name: 'Plus signs', about: 'A grid of plus signs in a wave.', d: { s: 1, d: 1, i: 1 } },
    hatch: { name: 'Pencil hatch', about: 'Crosshatching that follows the light.', d: { s: 1, d: 1, i: 1 } },
    checker: { name: 'Turning checks', about: 'A checkerboard turning slowly.', d: { s: 1, d: 1, i: 1 } },
    colorfield: { name: 'Colour fields', about: 'Three soft pools of colour that wander.', d: { s: 1, d: 1, i: 0.8 } },
    ridges: { name: 'Ridge lines', about: 'Stacked lines with a peak in the middle.', d: { s: 1, d: 1, i: 1 } },
    radar: { name: 'Radar', about: 'A sweep going round with faint rings.', d: { s: 1, d: 1, i: 1 } },
    bokeh: { name: 'Bokeh', about: 'Soft out-of-focus lights.', d: { s: 1, d: 1, i: 1 } },
    grain: { name: 'Film grain', about: 'Gentle grain with a soft edge.', d: { s: 1, d: 1, i: 0.8 } },
    zigzag: { name: 'Chevrons', about: 'Zigzag lines sliding upward.', d: { s: 1, d: 1, i: 1 } },
    circuit: { name: 'Circuit', about: 'Traces with pulses running along.', d: { s: 1, d: 1, i: 1 } },
    beams: { name: 'Light beams', about: 'Columns of light sweeping sideways.', d: { s: 1, d: 1, i: 1 } },
    sparkle: { name: 'Sparkles', about: 'Little stars that twinkle.', d: { s: 1, d: 1, i: 1 } },
    confetti: { name: 'Confetti', about: 'Paper pieces falling and turning.', d: { s: 1, d: 1, i: 1 } },
    snow: { name: 'Snow', about: 'Flakes drifting down.', d: { s: 1, d: 1, i: 1 } },
    rain: { name: 'Rain', about: 'Light streaks of rain.', d: { s: 1, d: 1, i: 1 } },
    bubbles: { name: 'Bubbles', about: 'Bubbles rising and wobbling.', d: { s: 1, d: 1, i: 1 } },
    fireflies: { name: 'Fireflies', about: 'Glowing dots wandering at dusk.', d: { s: 1, d: 1, i: 1 } },
    coderain: { name: 'Code rain', about: 'Columns of ones and zeros falling.', d: { s: 1, d: 1, i: 0.8 } },
    equalizer: { name: 'Equalizer', about: 'Bars dancing along the bottom.', d: { s: 1, d: 1, i: 0.9 } },
    orbits: { name: 'Orbits', about: 'Little planets going round.', d: { s: 1, d: 1, i: 1 } },
    pendulum: { name: 'Pendulum wave', about: 'Dots swinging out of step and back.', d: { s: 1, d: 1, i: 1 } },
    flow: { name: 'Flow field', about: 'Specks drawn along an invisible wind.', d: { s: 1, d: 1, i: 1 } },
    lissajous: { name: 'Looping curve', about: 'One line that slowly changes shape.', d: { s: 1, d: 1, i: 1 } },
    motion: { name: 'Your motion graphic', about: 'A piece from Motion Studio, playing behind the words.', motion: true, d: { s: 1, d: 1, i: 1 } },   // feat/motion: placed by Motion Studio, not picked here
  };
  const LIST = Object.keys(KINDS).filter(k => !KINDS[k].motion && !KINDS[k].three).concat(Object.keys(KINDS).filter(k => KINDS[k].three)), COLS = ['accent', 'ink', 'muted'];
  const CREDIT = 'Several of these are ports of ThreeUI Community by Meng To (MIT).';
  const num = (v, d, lo, hi) => { v = +v; return Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(hi, v)) * 100) / 100 : d; };
  function clean(fx) {
    if (!fx || typeof fx !== 'object' || !KINDS[fx.kind]) return null; const D = KINDS[fx.kind].d;
    const out = { kind: fx.kind, s: num(fx.s, D.s, 0.2, 2.5), d: num(fx.d, D.d, 0.4, 2), i: num(fx.i, D.i, 0.2, 1.6), p: fx.p === 0 || fx.p === false ? 0 : 1, c: COLS.includes(fx.c) ? fx.c : 'accent', c2: COLS.includes(fx.c2) ? fx.c2 : 'ink' };
    if (KINDS[fx.kind].motion) { const m = motionDoc(fx.m); if (!m) return null; out.m = m; }   // the motion doc rides along, checked by the engine
    return out;
  }
  function motionDoc(m) {
    if (!m || typeof m !== 'object') return null;
    let K = null; try { K = typeof module === 'object' && module.exports && typeof require === 'function' ? require('./motionkit.js') : (typeof self !== 'undefined' && self.TribeMotionKit) || null; } catch { K = null; }
    const d = K ? K.normalize(m) : m; try { if (JSON.stringify(d).length > 400000) return null; } catch { return null; } return d;
  }
  const fresh = kind => clean({ kind });
  function setFx(cfg, pageId, blockId, patch) {
    const c = clone(cfg), pg = c.pages.find(p => p.id === pageId) || c.pages[0], b = pg && pg.blocks.find(x => x.id === blockId); if (!b) return cfg;
    if (!patch) delete b.fx; else { const kindChanged = patch.kind && (!b.fx || b.fx.kind !== patch.kind); const next = clean({ ...(kindChanged ? {} : b.fx || {}), ...(kindChanged && b.fx ? { p: b.fx.p, c: b.fx.c, c2: b.fx.c2 } : {}), ...patch }); if (next) b.fx = next; }
    return c;
  }
  function uses(cfg) { const kinds = new Set(); ((cfg && cfg.pages) || []).forEach(p => (p.blocks || []).forEach(b => { if (b.fx && KINDS[b.fx.kind] && !b.hidden) kinds.add(b.fx.kind); })); return { any: kinds.size > 0, three: [...kinds].some(k => KINDS[k].three), motion: [...kinds].some(k => KINDS[k].motion), kinds: [...kinds] }; }

  // ---------- the still picture (flat shapes in the two colours; no script, no WebGL needed) ----------
  function still(kind, a, b) {
    let s = 7; const R = () => { s = (s * 16807) % 2147483647; return (s & 0xfffffff) / 0x10000000; }; let body = '';
    const C = (x, y, r, col, o) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" opacity="${o.toFixed(2)}"/>`;
    if (kind === 'motion') body = `<rect x="200" y="100" width="200" height="60" rx="30" fill="${a}" opacity=".85"/><circle cx="420" cy="150" r="10" fill="${b}" opacity=".6"/>`;
    else if (/^(dots|ribbons|arc)$/.test(kind)) { for (let y = 0; y < 13; y++) for (let x = 0; x < 30; x++) { const dx = (x - 14.5) / 15, dy = (y - 6) / 6.5, k = kind === 'dots' ? Math.max(0, 1 - Math.hypot(dx, dy)) : kind === 'arc' ? Math.max(0, 1 - Math.abs((y / 12) - (0.3 + Math.pow(Math.abs(dx), 1.8) * 0.7)) * 3) * (1 - Math.pow(Math.abs(dx), 2.5)) : Math.max(0, 1 - Math.abs(dy - 0.4 * Math.sin(x / 4)) * 2.2); if (k > 0.08) body += kind === 'arc' ? `<rect x="${x * 20 + 2}" y="${y * 20 + 2}" width="16" height="16" fill="${k > 0.6 ? a : b}" opacity="${(k * 0.6).toFixed(2)}"/>` : C(x * 20 + 10, y * 20 + 10, 2 + k * 3, x % 2 ? a : b, k * 0.55); } }
    else if (/^(horizon|streams)$/.test(kind)) body = kind === 'horizon' ? `<ellipse cx="300" cy="270" rx="360" ry="90" fill="${a}" opacity=".30"/><ellipse cx="380" cy="275" rx="260" ry="55" fill="${b}" opacity=".22"/>` : `<path d="M-20 200 C120 90 220 230 360 120 S560 60 640 -10" fill="none" stroke="${a}" stroke-width="34" opacity=".28"/><path d="M-20 300 C140 200 260 320 400 210 S580 160 640 110" fill="none" stroke="${b}" stroke-width="26" opacity=".2"/>`;
    else if (/^(rings|orb|sphere|dome)$/.test(kind)) body = kind === 'rings' ? [60, 110, 160, 215].map((r, i) => `<circle cx="300" cy="130" r="${r}" fill="none" stroke="${i % 2 ? b : a}" stroke-width="1.6" opacity="${(0.3 - i * 0.05).toFixed(2)}"/>`).join('') : kind === 'dome' ? `<path d="M120 260 A180 150 0 0 1 480 260" fill="none" stroke="${a}" stroke-width="3" stroke-dasharray="2 9" opacity=".6"/><path d="M170 260 A130 110 0 0 1 430 260" fill="none" stroke="${a}" stroke-width="3" stroke-dasharray="2 12" opacity=".4"/>` : `<circle cx="440" cy="130" r="82" fill="${a}" opacity="${kind === 'orb' ? '.42' : '.12'}"/><circle cx="440" cy="130" r="82" fill="none" stroke="${b}" stroke-width="2" opacity=".35"/>${kind === 'sphere' ? `<ellipse cx="440" cy="130" rx="100" ry="34" fill="none" stroke="${a}" stroke-width="2" opacity=".5" transform="rotate(-24 440 130)"/>` : ''}`;
    else { const n = kind === 'constellation' ? 26 : 70, pts = []; for (let i = 0; i < n; i++) { const x = R() * 600, y = R() * 260; pts.push([x, y]); body += C(x, y, kind === 'drops' ? 2 + R() * 5 : 1 + R() * 2.6, i % 3 ? a : b, 0.25 + R() * 0.4); } if (kind === 'constellation') for (let i = 0; i < n - 1; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; if (Math.hypot(x1 - x2, y1 - y2) < 190) body += `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)}L${x2.toFixed(0)} ${y2.toFixed(0)}" stroke="${b}" stroke-width="1" opacity=".3"/>`; } }
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice">${body}</svg>`);
  }

  // ---------- the script texts (inlined into a one-file download, written out beside a zip or a published site) ----------
  const FILES = { fx: 'fx.js', fx3d: 'fx3d.js', three: 'three.min.js', lic1: 'LICENSE-threeui.txt', lic2: 'LICENSE-three.txt', motion: '../motionkit.js' }, TEXT = {};
  const here = () => { try { return new URL('sitefx/', document.baseURI).href; } catch { return 'sitefx/'; } };
  function text(key) {
    if (TEXT[key] != null) return TEXT[key];
    if (typeof module === 'object' && module.exports && typeof require === 'function') { try { TEXT[key] = require('node:fs').readFileSync(require('node:path').join(__dirname, 'sitefx', FILES[key]), 'utf8'); } catch { TEXT[key] = ''; } return TEXT[key]; }
    try { const x = new XMLHttpRequest(); x.open('GET', here() + FILES[key], false); x.send(); TEXT[key] = x.status >= 200 && x.status < 300 ? x.responseText : ''; } catch { TEXT[key] = ''; }   // only when preload() has not run yet
    return TEXT[key];
  }
  async function preload(three) { if (typeof fetch !== 'function') return; await Promise.all(Object.keys(FILES).filter(k => TEXT[k] == null && (three || !/^(fx3d|three|lic2)$/.test(k))).map(async k => { try { const r = await fetch(here() + FILES[k]); if (r.ok) TEXT[k] = await r.text(); } catch {} })); }
  const inline = t => `<script>${String(t).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')}</script>`;

  const CSS = '.has-fx{position:relative;isolation:isolate;overflow:hidden}.has-fx>.fx-layer{position:absolute;top:0;left:0;right:0;bottom:0;z-index:-1;pointer-events:none;background-position:center;background-size:cover;background-repeat:no-repeat}.has-fx>.fx-layer.fx-live{background-image:none!important}';
  // html = what sitecfg.render made; K = the palette in use. Sections keep their ids ("b-<block id>"), so the layer is added by id.
  function decorate(html, cfg, o, K) {
    o = o || {}; const blocks = []; (cfg.pages || []).forEach(p => (p.blocks || []).forEach(b => { const f = clean(b.fx); if (f && (o.edit || !b.hidden)) blocks.push([b, f]); }));
    // the designer's preview always has the script: the page is swapped in place there, and the script picks up a
    // background the moment one is added (and frees it the moment it goes)
    const editJs = () => `<script src="${here().replace(/"/g, '%22')}fx.js"></script>`, tail = (h, js) => h.replace(/<\/body>(?![\s\S]*<\/body>)/, `${js}</body>`);
    if (!blocks.length) return o.edit ? tail(html, editJs()) : html;
    let n = 0, three = false, motion = false;
    for (const [b, f] of blocks) {
      const a = K[f.c] || K.accent, b2 = K[f.c2] || K.ink, opt = JSON.stringify({ s: f.s, d: f.d, i: f.i, p: f.p, a, b: b2, ...(f.m ? { m: f.m } : {}) }).replace(/'/g, '&#39;');
      const re = new RegExp(`(<(?:section|footer|div) id="b-${String(b.id).replace(/[^a-zA-Z0-9_-]/g, '')}" class=")([^"]*"[^>]*)>`);
      const next = html.replace(re, (m, p1, p2) => `${p1}has-fx ${p2} data-fx="${f.kind}" data-fx-o='${opt}'><div class="fx-layer" aria-hidden="true" style="background-image:url(&quot;${still(f.kind, a, b2)}&quot;)"></div>`);
      if (next !== html) { n++; if (KINDS[f.kind].three) three = true; if (KINDS[f.kind].motion) motion = true; html = next; }
    }
    if (!n) return o.edit ? tail(html, editJs()) : html;
    let js = '';
    if (o.edit) js = editJs();                                                                             // the preview: loaded from the app, like the designer's own helper
    else if (o.mode === 'pages') js = '<script src="fx/fx.js" defer></script>';                              // a folder of files: fx/ sits beside the pages
    else { const t = text('fx'); if (t) js = (motion && text('motion') ? inline(text('motion')) : '') + inline(t) + (three && text('three') && text('fx3d') ? inline(text('three')) + inline(text('fx3d')) : ''); }   // one file: everything inside it
    return tail(html.replace('</style>', `${CSS}</style>`), js);   // the CSS joins the site's own sheet (the first one)
  }
  function exportInto(res, cfg, kind) {
    const u = uses(cfg); if (!u.any || kind !== 'zip' || !res || !res.files) return res;
    const put = (name, key) => { const t = text(key); if (t) res.files['fx/' + name] = t; };
    put('fx.js', 'fx'); put('LICENSE-threeui.txt', 'lic1'); if (u.motion) put('motionkit.js', 'motion'); if (u.three) { put('three.min.js', 'three'); put('fx3d.js', 'fx3d'); put('LICENSE-three.txt', 'lic2'); }
    if (res.files['README.md']) res.files['README.md'] = res.files['README.md'].replace('no build step and no scripts', 'no build step, and one small script for the moving backgrounds').replace('\n- site.json', '\n- fx/: the moving backgrounds (they work offline; licenses alongside)\n- site.json');
    return res;
  }

  // ---------- Flint: "add a 3D background", "put moving particles behind the header", "make the background calmer", … ----------
  // step.slots = { op: 'add'|'remove'|'calmer'|'livelier'|'slower'|'faster'|'fewer'|'more'|'phones'|'colour', kind?, block?, on?, color? }
  const ALIAS = { header: 'hero', top: 'hero', intro: 'hero', banner: 'hero', heading: 'hero' };
  function target(c, at, slots) {
    const pg = c.pages.find(p => p.id === (at && at.page)) || c.pages[0]; let b = null;
    const want = slots.block && (ALIAS[slots.block] || slots.block);
    if (want) b = pg.blocks.find(x => x.type === want);
    if (!b && at && at.sel && at.sel.block && !want) b = pg.blocks.find(x => x.id === at.sel.block && x.type !== 'divider');
    if (!b && slots.op !== 'add') b = pg.blocks.find(x => x.fx);
    if (!b) b = pg.blocks.find(x => x.type === 'hero') || pg.blocks.find(x => !/^(footer|divider|banner)$/.test(x.type)) || pg.blocks[0];
    return { pg, b };
  }
  function command(c, step, at, S) {
    const sl = step.slots || {}, op = sl.op || 'add', { pg, b } = target(c, at, sl);
    if (!b) return { say: 'Add a section first, then I can put a moving background behind it.' };
    { const want = sl.block && (ALIAS[sl.block] || sl.block); if (want && b.type !== want) return { say: `This page has no ${sl.block} section. Click the section you mean, then say it again.` }; }
    const label = ((S && S.BLOCKS[b.type] && S.BLOCKS[b.type].label) || 'section').replace(/ \(.*/, '').toLowerCase(), sel = { block: b.id, path: '' };
    if (op === 'add' || (op === 'kind' && sl.kind)) {
      const kind = KINDS[sl.kind] ? sl.kind : (b.fx && op === 'add' && !sl.kind ? LIST[(LIST.indexOf(b.fx.kind) + 1) % LIST.length] : sl.three ? 'constellation' : 'dots');
      return { cfg: setFx(c, pg.id, b.id, { kind }), sel, say: `Put “${KINDS[kind].name}” behind the ${label}. The words on top are still yours to edit. Say “calmer”, “faster”, “fewer” or “turn off motion on phones” to adjust it, or “remove the moving background”.` };
    }
    if (!b.fx) return { say: `The ${label} has no moving background yet. Say “add a moving background” or “add a 3D background”.` };
    const f = b.fx, name = KINDS[f.kind].name;
    if (op === 'remove') return { cfg: setFx(c, pg.id, b.id, null), sel, say: `Removed the moving background from the ${label}.` };
    if (op === 'calmer') return { cfg: setFx(c, pg.id, b.id, { s: f.s * 0.6, i: f.i * 0.75 }), sel, say: `Made “${name}” calmer: slower and fainter.` };
    if (op === 'livelier') return { cfg: setFx(c, pg.id, b.id, { s: f.s * 1.5, i: f.i * 1.25 }), sel, say: `Made “${name}” livelier: faster and stronger.` };
    if (op === 'slower' || op === 'faster') return { cfg: setFx(c, pg.id, b.id, { s: f.s * (op === 'slower' ? 0.6 : 1.6) }), sel, say: `Made “${name}” ${op}.` };
    if (op === 'fewer' || op === 'more') return { cfg: setFx(c, pg.id, b.id, { d: f.d * (op === 'fewer' ? 0.65 : 1.5) }), sel, say: op === 'fewer' ? `Thinned out “${name}”.` : `Made “${name}” denser.` };
    if (op === 'fainter' || op === 'stronger') return { cfg: setFx(c, pg.id, b.id, { i: f.i * (op === 'fainter' ? 0.65 : 1.4) }), sel, say: `Made “${name}” ${op}.` };
    if (op === 'phones') return { cfg: setFx(c, pg.id, b.id, { p: sl.on ? 1 : 0 }), sel, say: sl.on ? `“${name}” moves on phones again.` : `On phones the ${label} now shows a still picture instead of moving. It saves battery.` };
    if (op === 'colour' && COLS.includes(sl.color)) return { cfg: setFx(c, pg.id, b.id, { c: sl.color }), sel, say: `“${name}” now uses the site’s ${sl.color === 'accent' ? 'main colour' : sl.color === 'ink' ? 'text colour' : 'quiet colour'}.` };
    return { say: `I can make “${name}” calmer, livelier, slower, faster, fewer, more, or turn it off on phones.` };
  }

  return { KINDS, LIST, COLS, CREDIT, CSS, clean, fresh, setFx, uses, still, decorate, exportInto, command, preload, text };
});
