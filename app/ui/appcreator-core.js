// App Creator engine (docs/APP-CREATOR.md): the app document, its components, themes, edits and exports. No DOM needed
// (strings in, strings out), so the same file runs in the browser (window.TribeAppCore), on the server and in tests.
//   normalize(doc)              -> a clean doc: ids on every screen and block, links that point at real screens
//   template(id) / blank(name)  -> a new doc          kit(doc, kitId) -> { doc, added: [screenId] }
//   css(doc, { scope, fontBase })   the app's stylesheet (theme variables + components), scoped to `.ax` by default
//   screenHTML(doc, screen, { edit })   one screen; with edit: data-e (words), data-lk (linkable), data-img, data-ic
//   apply(doc, op)              -> { doc, say }   the edits Flint, the toolbar and the AI share (see OPS below)
//   pwa(doc, { fonts })         -> [[path, text]]   an installable phone web app: plain HTML/JS, offline, links working
//   expo(doc)                   -> [[path, text]]   an Expo (React Native) project that draws the same screens
//   brief(doc)                  -> markdown for the AI helpers: screens, flows, data model, theme
//   outline(doc)                -> a short text outline (MCP, tests)
//   PRESETS (50+ named looks), FONTS, BLOCKS (the component library), RUNTIME (the prototype's click/transition code)
(function (root, factory) {
  const data = typeof module === 'object' && module.exports ? require('./appcreator-data.js') : root.TribeAppData;
  const more = typeof module === 'object' && module.exports ? (() => { try { return require('./appcreator-more.js'); } catch { return null; } })() : root.TribeAppMore;
  const parts = typeof module === 'object' && module.exports ? (() => { try { return require('./appcreator-parts.js'); } catch { return null; } })() : root.TribeAppParts;
  const api = factory(data, more, parts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TribeAppCore = api;
})(typeof self !== 'undefined' ? self : this, function (D, MORE, PARTS) {
  'use strict';
  // appcreator-parts.js (feat/asset-libs): more icons, parts, starting words and screens join the base sets here
  if (PARTS) { Object.assign(D.ICONS, PARTS.ICONS || {}); D.ICON_NAMES = Object.keys(D.ICONS); D.DEFAULTS = Object.assign({}, D.DEFAULTS, PARTS.DEFAULTS || {}); }
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 400);
  const HEX = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v.toUpperCase() : '';
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'screen';
  const TEMPLATES = D.TEMPLATES.concat(MORE && MORE.TEMPLATES ? MORE.TEMPLATES : []);
  const KITS = Object.assign({}, D.KITS, MORE && MORE.KITS ? MORE.KITS : {}, PARTS && PARTS.KITS ? PARTS.KITS : {});

  // ---------- colours ----------
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgbHex = a => '#' + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = h => { const c = hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const COLORS = { red: '#D23B30', orange: '#F26B1D', amber: '#E0951F', yellow: '#D9A400', gold: '#C9A227', green: '#2F9E6E', lime: '#6FA82E', mint: '#33A889', teal: '#2A8C80', cyan: '#1F8FA8',
    blue: '#2F5BEA', navy: '#1E3A8A', sky: '#3A8DDE', indigo: '#4F5BD5', purple: '#7A5CC2', violet: '#7A5CC2', lavender: '#9C88D9', pink: '#D2477F', magenta: '#B23A8C', rose: '#D9536F',
    brown: '#8A5A3B', coral: '#E06A50', black: '#1A1A1A', charcoal: '#2B2B2B', gray: '#6B7280', grey: '#6B7280', white: '#FFFFFF', ember: '#F26B1D' };

  // ---------- fonts (open licences, bundled in app/ui/assets/site-fonts with their licence files) ----------
  const FONTS = {
    system: { name: 'System', display: null, body: null, files: [] },
    clean: { name: 'Clean (Inter)', display: 'Inter', dw: 600, body: 'Inter', files: ['inter-latin-400-normal', 'inter-latin-600-normal'] },
    friendly: { name: 'Friendly (Outfit + Inter)', display: 'Outfit', dw: 700, body: 'Inter', files: ['outfit-latin-700-normal', 'inter-latin-400-normal'] },
    bold: { name: 'Bold (Bricolage Grotesque + Inter)', display: 'Bricolage Grotesque', dw: 800, body: 'Inter', files: ['bricolage-grotesque-latin-800-normal', 'inter-latin-400-normal'] },
    tech: { name: 'Tech (Space Grotesk + Inter)', display: 'Space Grotesk', dw: 700, body: 'Inter', files: ['space-grotesk-latin-700-normal', 'inter-latin-400-normal'] },
    editorial: { name: 'Editorial (Fraunces + Inter)', display: 'Fraunces', dw: 700, body: 'Inter', files: ['fraunces-latin-700-normal', 'inter-latin-400-normal'] },
    elegant: { name: 'Elegant (DM Serif Display + Inter)', display: 'DM Serif Display', dw: 400, body: 'Inter', files: ['dm-serif-display-latin-400-normal', 'inter-latin-400-normal'] },
    classic: { name: 'Classic (Instrument Serif + Inter)', display: 'Instrument Serif', dw: 400, body: 'Inter', files: ['instrument-serif-latin-400-normal', 'inter-latin-400-normal'] },
    mono: { name: 'Mono (JetBrains Mono + Inter)', display: 'JetBrains Mono', dw: 700, body: 'Inter', files: ['jetbrains-mono-latin-700-normal', 'inter-latin-400-normal'] },
    pixel: { name: 'Pixel (Silkscreen + JetBrains Mono)', display: 'Silkscreen', dw: 400, body: 'JetBrains Mono', files: ['silkscreen-latin-400-normal', 'jetbrains-mono-latin-500-normal'] },
  };
  const FACE = { 'Inter': [['inter-latin-400-normal', 400], ['inter-latin-600-normal', 600]], 'Outfit': [['outfit-latin-700-normal', 700]], 'Bricolage Grotesque': [['bricolage-grotesque-latin-800-normal', 800]],
    'Space Grotesk': [['space-grotesk-latin-700-normal', 700]], 'Fraunces': [['fraunces-latin-700-normal', 700]], 'DM Serif Display': [['dm-serif-display-latin-400-normal', 400]], 'Instrument Serif': [['instrument-serif-latin-400-normal', 400]],
    'JetBrains Mono': [['jetbrains-mono-latin-500-normal', 500], ['jetbrains-mono-latin-700-normal', 700]], 'Silkscreen': [['silkscreen-latin-400-normal', 400]] };
  const RADII = { sharp: [2, 2, 0], soft: [10, 6, 10], round: [18, 10, 16], pill: [26, 14, 999] };   // card, small, button
  const DENS = { compact: [10, 12, 14], regular: [14, 16, 18], roomy: [18, 20, 24] };            // gap, pad, block gap
  const MOTION = { calm: [460, 'cubic-bezier(.2,.75,.2,1)'], standard: [340, 'cubic-bezier(.22,.9,.28,1)'], snappy: [250, 'cubic-bezier(.3,1.12,.4,1)'] };   // tiny overshoot at most
  const SURF = { neutral: 0, warm: 1, cool: 2, tinted: 3 };

  // ---------- 50+ named looks: each differs in more than colour (font, corners, light/dark, density, surface or motion) ----------
  const P = (id, name, accent, mode, font, radius, density, surface, motion, icons) => ({ id, name, theme: { accent, mode, font, radius, density, surface: surface || 'neutral', motion: motion || 'standard', icons: icons || 'regular' } });
  const PRESETS = [
    P('ember', 'Ember', '#F26B1D', 'light', 'clean', 'soft', 'regular', 'warm'), P('campfire', 'Campfire', '#F26B1D', 'dark', 'friendly', 'round', 'regular', 'warm'),
    P('meadow', 'Meadow', '#2F9E6E', 'light', 'friendly', 'round', 'roomy', 'tinted', 'calm'), P('forest', 'Forest night', '#33A889', 'dark', 'editorial', 'soft', 'regular', 'cool', 'calm'),
    P('harbor', 'Harbor', '#2F5BEA', 'light', 'tech', 'soft', 'compact', 'cool'), P('midnight', 'Midnight', '#5B7CFF', 'dark', 'tech', 'sharp', 'compact', 'cool', 'snappy', 'thin'),
    P('paper', 'Paper', '#1A1A1A', 'light', 'editorial', 'sharp', 'roomy', 'warm', 'calm', 'thin'), P('ink', 'Ink', '#E8E2D5', 'dark', 'classic', 'sharp', 'roomy', 'neutral', 'calm', 'thin'),
    P('bloom', 'Bloom', '#D2477F', 'light', 'friendly', 'pill', 'regular', 'tinted'), P('velvet', 'Velvet', '#B23A8C', 'dark', 'elegant', 'round', 'roomy', 'warm', 'calm'),
    P('citrus', 'Citrus', '#E0951F', 'light', 'bold', 'round', 'regular', 'warm', 'snappy', 'bold'), P('arcade', 'Arcade', '#38C6B1', 'dark', 'pixel', 'sharp', 'compact', 'neutral', 'snappy', 'bold'),
    P('lavender', 'Lavender', '#7A5CC2', 'light', 'friendly', 'pill', 'roomy', 'tinted', 'calm'), P('dusk', 'Dusk', '#9C88D9', 'dark', 'friendly', 'pill', 'roomy', 'cool', 'calm'),
    P('slate', 'Slate', '#475569', 'light', 'clean', 'soft', 'compact', 'cool', 'standard', 'thin'), P('graphite', 'Graphite', '#94A3B8', 'dark', 'mono', 'sharp', 'compact', 'neutral', 'snappy', 'thin'),
    P('terracotta', 'Terracotta', '#C2552E', 'light', 'elegant', 'soft', 'regular', 'warm'), P('espresso', 'Espresso', '#C8915A', 'dark', 'classic', 'soft', 'regular', 'warm', 'calm'),
    P('lagoon', 'Lagoon', '#1F8FA8', 'light', 'clean', 'round', 'regular', 'tinted'), P('deepsea', 'Deep sea', '#3BC4D9', 'dark', 'clean', 'round', 'regular', 'cool'),
    P('sunbeam', 'Sunbeam', '#D9A400', 'light', 'bold', 'pill', 'roomy', 'warm', 'snappy'), P('mono', 'Monochrome', '#111111', 'light', 'mono', 'sharp', 'compact', 'neutral', 'snappy', 'thin'),
    P('noir', 'Noir', '#FFFFFF', 'dark', 'bold', 'sharp', 'regular', 'neutral', 'snappy'), P('coral', 'Coral reef', '#E06A50', 'light', 'friendly', 'round', 'regular', 'warm'),
    P('mint', 'Mint', '#33A889', 'light', 'clean', 'pill', 'compact', 'tinted', 'snappy'), P('cobalt', 'Cobalt', '#1E3A8A', 'light', 'editorial', 'soft', 'regular', 'cool'),
    P('neon', 'Neon', '#C6F432', 'dark', 'tech', 'round', 'compact', 'neutral', 'snappy', 'bold'), P('rosewater', 'Rosewater', '#D9536F', 'light', 'classic', 'round', 'roomy', 'warm', 'calm'),
    P('orchard', 'Orchard', '#6FA82E', 'light', 'editorial', 'round', 'regular', 'warm'), P('glacier', 'Glacier', '#3A8DDE', 'light', 'tech', 'pill', 'roomy', 'cool', 'calm', 'thin'),
    P('ember-pro', 'Ember Pro', '#F26B1D', 'dark', 'tech', 'sharp', 'compact', 'neutral', 'snappy'), P('studio', 'Studio', '#2B2B2B', 'light', 'bold', 'soft', 'roomy', 'neutral'),
    P('cinema', 'Cinema', '#E8B04A', 'dark', 'elegant', 'sharp', 'roomy', 'neutral', 'calm'), P('playground', 'Playground', '#4F5BD5', 'light', 'friendly', 'pill', 'roomy', 'tinted', 'snappy', 'bold'),
    P('zen', 'Zen', '#6B8F71', 'light', 'classic', 'pill', 'roomy', 'warm', 'calm', 'thin'), P('stormy', 'Stormy', '#6B7280', 'dark', 'clean', 'soft', 'regular', 'cool', 'calm'),
    P('candy', 'Candy', '#FF5FA2', 'light', 'bold', 'pill', 'regular', 'tinted', 'snappy', 'bold'), P('retro', 'Retro terminal', '#36D399', 'dark', 'mono', 'sharp', 'compact', 'neutral', 'snappy'),
    P('sandstone', 'Sandstone', '#B08850', 'light', 'friendly', 'soft', 'roomy', 'warm', 'calm'), P('aurora', 'Aurora', '#7CE0C3', 'dark', 'friendly', 'round', 'roomy', 'cool', 'calm'),
    P('ledger', 'Ledger', '#0F766E', 'light', 'mono', 'soft', 'compact', 'neutral', 'standard', 'thin'), P('gallery', 'Gallery', '#111111', 'light', 'classic', 'sharp', 'roomy', 'neutral', 'calm', 'thin'),
    P('sport', 'Sport', '#E4572E', 'dark', 'bold', 'soft', 'compact', 'neutral', 'snappy', 'bold'), P('nursery', 'Nursery', '#F2A65A', 'light', 'friendly', 'pill', 'roomy', 'warm', 'calm', 'bold'),
    P('clinic', 'Clinic', '#2A8C80', 'light', 'clean', 'soft', 'regular', 'cool', 'calm'), P('bank', 'Private bank', '#C9A227', 'dark', 'elegant', 'soft', 'regular', 'neutral', 'calm', 'thin'),
    P('festival', 'Festival', '#B23A8C', 'light', 'bold', 'round', 'compact', 'tinted', 'snappy'), P('blueprint', 'Blueprint', '#9FC2FF', 'dark', 'mono', 'sharp', 'regular', 'cool', 'standard', 'thin'),
    P('picnic', 'Picnic', '#D23B30', 'light', 'friendly', 'round', 'regular', 'warm', 'standard', 'bold'), P('library', 'Library', '#8A5A3B', 'light', 'editorial', 'soft', 'roomy', 'warm', 'calm'),
    P('pixel-day', 'Pixel day', '#F26B1D', 'light', 'pixel', 'sharp', 'compact', 'warm', 'snappy', 'bold'), P('lunar', 'Lunar', '#C9C3FF', 'dark', 'classic', 'pill', 'roomy', 'cool', 'calm', 'thin'),
    P('fieldnotes', 'Field notes', '#5F7A3A', 'light', 'mono', 'soft', 'regular', 'warm', 'standard', 'thin'), P('pop', 'Pop', '#2F5BEA', 'light', 'bold', 'sharp', 'regular', 'neutral', 'snappy', 'bold'),
    P('system-ios', 'System light', '#0A84FF', 'light', 'system', 'round', 'regular', 'neutral'), P('system-dark', 'System dark', '#0A84FF', 'dark', 'system', 'round', 'regular', 'neutral'),
  ];

  // ---------- the theme ----------
  const THEME0 = { accent: '#F26B1D', mode: 'light', radius: 'soft', font: 'clean', density: 'regular', icons: 'regular', motion: 'standard', surface: 'neutral', preset: '' };
  function normTheme(t) {
    t = Object.assign({}, THEME0, t || {});
    return { accent: HEX(t.accent) || THEME0.accent, mode: t.mode === 'dark' ? 'dark' : 'light', radius: RADII[t.radius] ? t.radius : 'soft', font: FONTS[t.font] ? t.font : 'clean',
      density: DENS[t.density] ? t.density : 'regular', icons: ['thin', 'regular', 'bold'].includes(t.icons) ? t.icons : 'regular', motion: MOTION[t.motion] ? t.motion : 'standard',
      surface: SURF[t.surface] != null ? t.surface : 'neutral', preset: str(t.preset, 30) };
  }
  // the palette, worked out so text always reads: ink on bg >= 7, muted >= 4.5, text on the accent >= 4.5
  function palette(theme) {
    const t = normTheme(theme), dark = t.mode === 'dark', a = t.accent;
    const tint = { neutral: dark ? '#0F1115' : '#FFFFFF', warm: dark ? '#14110E' : '#FBF8F3', cool: dark ? '#0D1117' : '#F6F8FB', tinted: dark ? mix('#0E0F12', a, 0.08) : mix('#FFFFFF', a, 0.06) }[t.surface];
    const bg = tint, ink = dark ? '#F2F3F5' : '#15171B';
    const surface = dark ? mix(bg, '#FFFFFF', 0.06) : (t.surface === 'neutral' ? '#F4F5F7' : mix(bg, ink, 0.035));
    const surface2 = dark ? mix(bg, '#FFFFFF', 0.11) : mix(bg, ink, 0.07);
    const line = dark ? mix(bg, '#FFFFFF', 0.14) : mix(bg, ink, 0.12);
    let muted = dark ? '#A3A8B3' : '#5F6672'; if (contrast(muted, bg) < 4.5) muted = dark ? '#C0C4CC' : '#4B515C';
    let acc = a; if (contrast(acc, bg) < 3) acc = dark ? mix(a, '#FFFFFF', 0.35) : mix(a, '#000000', 0.3);
    const on = contrast('#FFFFFF', acc) >= contrast('#111111', acc) ? '#FFFFFF' : '#111111';
    const soft = dark ? mix(bg, acc, 0.2) : mix(bg, acc, 0.12);
    return { bg, ink, surface, surface2, line, muted, accent: acc, on, soft };
  }
  function vars(theme) {
    const t = normTheme(theme), k = palette(t), [rc, rs, rb] = RADII[t.radius], [g, pd, bg] = DENS[t.density], f = FONTS[t.font], [ms, ease] = MOTION[t.motion];
    const sys = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
    const disp = f.display ? `'${f.display}',${sys}` : sys, body = f.body ? `'${f.body}',${sys}` : sys;
    return `--ax-bg:${k.bg};--ax-ink:${k.ink};--ax-surface:${k.surface};--ax-surface2:${k.surface2};--ax-line:${k.line};--ax-muted:${k.muted};--ax-accent:${k.accent};--ax-on:${k.on};--ax-soft:${k.soft};`
      + `--ax-r:${rc}px;--ax-rs:${rs}px;--ax-rb:${rb}px;--ax-gap:${g}px;--ax-pad:${pd}px;--ax-bgap:${bg}px;--ax-display:${disp};--ax-body:${body};--ax-dw:${f.dw || 700};--ax-stroke:${t.icons === 'thin' ? 1.4 : t.icons === 'bold' ? 2.2 : 1.8};--ax-ms:${ms}ms;--ax-ease:${ease}`;
  }
  function fontFaces(theme, base) {
    const f = FONTS[normTheme(theme).font]; if (!f.display && !f.body) return '';
    const fams = [f.display, f.body].filter((x, i, a) => x && a.indexOf(x) === i);
    return fams.map(fam => (FACE[fam] || []).map(([file, w]) => `@font-face{font-family:'${fam}';src:url('${typeof base === 'function' ? base(file) : (base || 'assets/site-fonts/') + file + '.woff2'}') format('woff2');font-weight:${w};font-display:swap}`).join('')).join('');
  }

  // ---------- illustrations: small flat scenes from the palette (drawn for TribeCode) ----------
  const ILL = {
    sparkle: k => `<circle cx="150" cy="95" r="58" fill="${k.s}"/><path d="M150 45l12 36 36 12-36 12-12 36-12-36-36-12 36-12z" fill="${k.a}"/><circle cx="215" cy="55" r="7" fill="${k.m}"/><circle cx="90" cy="140" r="5" fill="${k.m}"/>`,
    leaf: k => `<circle cx="150" cy="95" r="62" fill="${k.s}"/><path d="M110 140c0-48 30-78 84-84 0 54-30 84-75 84z" fill="${k.a}"/><path d="M110 140l46-46" stroke="${k.d}" stroke-width="4" stroke-linecap="round"/>`,
    sun: k => `<rect width="300" height="190" fill="${k.s}"/><circle cx="150" cy="120" r="44" fill="${k.a}"/><rect y="132" width="300" height="58" fill="${k.m}"/>`,
    moon: k => `<rect width="300" height="190" fill="${k.d}"/><path d="M175 50a52 52 0 1 0 40 70 42 42 0 0 1-40-70z" fill="${k.a}"/><circle cx="80" cy="50" r="3" fill="${k.l}"/><circle cx="240" cy="40" r="2" fill="${k.l}"/><circle cx="60" cy="130" r="2" fill="${k.l}"/>`,
    food: k => `<rect width="300" height="190" fill="${k.s}"/><ellipse cx="150" cy="118" rx="88" ry="30" fill="${k.l}"/><ellipse cx="150" cy="108" rx="62" ry="22" fill="${k.a}"/><circle cx="130" cy="102" r="7" fill="${k.m}"/><circle cx="165" cy="106" r="6" fill="${k.m}"/>`,
    fish: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M85 95c30-36 95-36 125 0-30 36-95 36-125 0z" fill="${k.a}"/><path d="M210 95l30-22v44z" fill="${k.m}"/><circle cx="115" cy="90" r="5" fill="${k.d}"/>`,
    soup: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M80 95h140a70 70 0 0 1-140 0z" fill="${k.a}"/><path d="M125 70c-8-10 8-16 0-28M155 70c-8-10 8-16 0-28" stroke="${k.m}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    cake: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="95" y="90" width="110" height="60" rx="8" fill="${k.a}"/><rect x="95" y="90" width="110" height="18" rx="8" fill="${k.l}"/><rect x="146" y="62" width="8" height="28" fill="${k.m}"/>`,
    wave: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M0 110q37-25 75 0t75 0 75 0 75 0v80H0z" fill="${k.a}"/><path d="M0 140q37-20 75 0t75 0 75 0 75 0v50H0z" fill="${k.m}"/><circle cx="235" cy="55" r="22" fill="${k.l}"/>`,
    art: k => `<rect width="300" height="190" fill="${k.l}"/><circle cx="110" cy="90" r="45" fill="${k.a}"/><rect x="150" y="60" width="80" height="80" fill="${k.m}"/><path d="M60 170l60-50 50 40 40-30 50 40z" fill="${k.d}"/>`,
    mountain: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M20 170l90-110 60 70 30-30 80 70z" fill="${k.a}"/><path d="M110 60l22 27-14 6-8-12-8 12-14-6z" fill="${k.l}"/><circle cx="235" cy="50" r="16" fill="${k.m}"/>`,
    bag: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="100" y="70" width="100" height="95" rx="8" fill="${k.a}"/><path d="M125 70v-12a25 25 0 0 1 50 0v12" stroke="${k.d}" stroke-width="6" fill="none"/>`,
    coffee: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M105 75h80v45a40 40 0 0 1-80 0z" fill="${k.a}"/><path d="M185 85h12a14 14 0 0 1 0 28h-12" stroke="${k.a}" stroke-width="7" fill="none"/><path d="M130 62c-6-8 6-12 0-22M155 62c-6-8 6-12 0-22" stroke="${k.m}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    book: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M90 50h55v100H90z" fill="${k.a}"/><path d="M155 50h55v100h-55z" fill="${k.m}"/><path d="M150 50v100" stroke="${k.d}" stroke-width="4"/>`,
    dumbbell: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="85" y="70" width="18" height="50" rx="4" fill="${k.a}"/><rect x="197" y="70" width="18" height="50" rx="4" fill="${k.a}"/><rect x="103" y="90" width="94" height="10" fill="${k.d}"/>`,
    music: k => `<rect width="300" height="190" fill="${k.a}"/><circle cx="150" cy="95" r="58" fill="${k.d}"/><circle cx="150" cy="95" r="18" fill="${k.a}"/><circle cx="150" cy="95" r="4" fill="${k.d}"/>`,
    lantern: k => `<rect width="300" height="190" fill="${k.d}"/><rect x="128" y="62" width="44" height="66" rx="6" fill="${k.a}"/><rect x="120" y="54" width="60" height="10" rx="3" fill="${k.m}"/><rect x="120" y="128" width="60" height="10" rx="3" fill="${k.m}"/><path d="M140 54a10 10 0 0 1 20 0" stroke="${k.m}" stroke-width="4" fill="none"/><circle cx="150" cy="95" r="70" fill="${k.a}" opacity=".12"/>`,
    flame: k => `<rect width="300" height="190" fill="${k.d}"/><path d="M150 155c26 0 42-18 42-41 0-26-21-39-25-64-15 9-23 24-24 39-5-5-10-13-11-21-12 11-21 27-21 46 0 23 17 41 39 41z" fill="${k.a}"/>`,
    target: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><circle cx="150" cy="95" r="48" fill="${k.a}"/><circle cx="150" cy="95" r="28" fill="${k.l}"/><circle cx="150" cy="95" r="10" fill="${k.d}"/>`,
    lock: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><rect x="115" y="90" width="70" height="55" rx="10" fill="${k.a}"/><path d="M128 90v-14a22 22 0 0 1 44 0v14" stroke="${k.d}" stroke-width="7" fill="none"/>`,
    heart: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><path d="M150 140s-48-28-48-62a27 27 0 0 1 48-16 27 27 0 0 1 48 16c0 34-48 62-48 62z" fill="${k.a}"/>`,
    star: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><path d="M150 45l15 31 34 5-25 23 6 34-30-16-30 16 6-34-25-23 34-5z" fill="${k.a}"/>`,
    plane: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M60 110l170-55-40 90-30-35z" fill="${k.a}"/><path d="M160 110l-25 30" stroke="${k.d}" stroke-width="5"/><circle cx="70" cy="50" r="14" fill="${k.l}"/>`,
    city: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="60" y="80" width="40" height="110" fill="${k.m}"/><rect x="110" y="50" width="50" height="140" fill="${k.a}"/><rect x="170" y="95" width="40" height="95" fill="${k.d}"/><rect x="220" y="70" width="30" height="120" fill="${k.m}"/>`,
    paw: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><ellipse cx="150" cy="110" rx="30" ry="24" fill="${k.a}"/><circle cx="118" cy="78" r="11" fill="${k.a}"/><circle cx="140" cy="64" r="11" fill="${k.a}"/><circle cx="162" cy="64" r="11" fill="${k.a}"/><circle cx="184" cy="78" r="11" fill="${k.a}"/>`,
    house: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M90 100l60-50 60 50v65H90z" fill="${k.a}"/><rect x="138" y="122" width="24" height="43" fill="${k.d}"/><rect y="165" width="300" height="25" fill="${k.m}"/>`,
    car: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M70 120l20-35h110l25 35z" fill="${k.a}"/><rect x="60" y="118" width="180" height="30" rx="8" fill="${k.a}"/><circle cx="100" cy="150" r="14" fill="${k.d}"/><circle cx="200" cy="150" r="14" fill="${k.d}"/>`,
    pill: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><rect x="95" y="75" width="110" height="40" rx="20" fill="${k.a}" transform="rotate(-25 150 95)"/><path d="M150 72v46" stroke="${k.l}" stroke-width="5" transform="rotate(-25 150 95)"/>`,
    code: k => `<rect width="300" height="190" fill="${k.d}"/><path d="M115 70l-30 25 30 25M185 70l30 25-30 25M162 60l-24 70" stroke="${k.a}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    camera: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="90" y="65" width="120" height="80" rx="12" fill="${k.a}"/><circle cx="150" cy="105" r="24" fill="${k.d}"/><circle cx="150" cy="105" r="11" fill="${k.l}"/><rect x="125" y="52" width="40" height="15" rx="4" fill="${k.a}"/>`,
    ticket: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M70 60h160v25a10 10 0 0 0 0 20v25H70v-25a10 10 0 0 0 0-20z" fill="${k.a}"/><path d="M180 62v66" stroke="${k.l}" stroke-width="3" stroke-dasharray="6 6"/>`,
    globe: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><circle cx="150" cy="95" r="50" fill="${k.a}"/><path d="M110 75c20 5 25 20 15 30s5 25 25 25M170 55c-5 15 10 20 20 15" stroke="${k.l}" stroke-width="5" fill="none"/>`,
    baby: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><circle cx="150" cy="90" r="38" fill="${k.a}"/><circle cx="137" cy="86" r="4" fill="${k.d}"/><circle cx="163" cy="86" r="4" fill="${k.d}"/><path d="M140 103q10 8 20 0" stroke="${k.d}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    chart: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="80" y="110" width="26" height="50" fill="${k.m}"/><rect x="120" y="80" width="26" height="80" fill="${k.a}"/><rect x="160" y="95" width="26" height="65" fill="${k.m}"/><rect x="200" y="55" width="26" height="105" fill="${k.a}"/>`,
    plant: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M125 130h50l-8 40h-34z" fill="${k.d}"/><path d="M150 130c0-30-10-50-35-60 0 25 15 45 35 60zM150 130c0-35 15-60 40-70 0 30-15 55-40 70z" fill="${k.a}"/>`,
    gift: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="100" y="85" width="100" height="70" fill="${k.a}"/><rect x="92" y="70" width="116" height="20" fill="${k.m}"/><rect x="144" y="70" width="12" height="85" fill="${k.l}"/>`,
    game: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="70" y="65" width="160" height="70" rx="35" fill="${k.a}"/><path d="M105 90v20M95 100h20" stroke="${k.l}" stroke-width="6" stroke-linecap="round"/><circle cx="190" cy="92" r="7" fill="${k.l}"/><circle cx="205" cy="108" r="7" fill="${k.m}"/>`,
    bolt: k => `<rect width="300" height="190" fill="${k.d}"/><path d="M165 30l-55 75h40l-15 55 60-80h-40z" fill="${k.a}"/>`,
    chat: k => `<rect width="300" height="190" fill="${k.s}"/><rect x="60" y="40" width="130" height="70" rx="18" fill="${k.a}"/><path d="M85 108l-5 22 25-20z" fill="${k.a}"/><rect x="130" y="95" width="110" height="55" rx="16" fill="${k.m}"/><path d="M215 148l6 18-22-16z" fill="${k.m}"/>`,
    users: k => `<rect width="300" height="190" fill="${k.s}"/><circle cx="120" cy="80" r="26" fill="${k.a}"/><path d="M75 165a45 45 0 0 1 90 0z" fill="${k.a}"/><circle cx="190" cy="88" r="22" fill="${k.m}"/><path d="M152 165a38 38 0 0 1 76 0z" fill="${k.m}"/>`,
    play: k => `<rect width="300" height="190" fill="${k.d}"/><circle cx="150" cy="95" r="52" fill="${k.a}"/><path d="M137 72v46l38-23z" fill="${k.l}"/>`,
    check: k => `<circle cx="150" cy="95" r="70" fill="${k.s}"/><circle cx="150" cy="95" r="48" fill="${k.a}"/><path d="M126 96l17 17 32-34" stroke="${k.l}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    note: k => `<rect width="300" height="190" fill="${k.s}"/><path d="M105 35h70l25 25v95h-95z" fill="${k.l}"/><path d="M175 35v25h25" fill="${k.m}"/><path d="M122 85h56M122 105h56M122 125h36" stroke="${k.a}" stroke-width="7" stroke-linecap="round"/>`,
  };
  const ILL_NAMES = Object.keys(ILL);
  function illus(name, theme) {
    const k0 = palette(theme), dark = normTheme(theme).mode === 'dark';
    const k = { a: k0.accent, d: dark ? mix(k0.bg, '#000000', 0.3) : mix(k0.ink, k0.accent, 0.25), s: mix(k0.bg, k0.accent, dark ? 0.18 : 0.13), l: dark ? mix(k0.ink, k0.accent, 0.1) : mix(k0.bg, '#FFFFFF', 0.8), m: mix(k0.accent, dark ? k0.bg : '#FFFFFF', 0.45) };
    const f = ILL[name] || ILL.sparkle;
    return `<svg viewBox="0 0 300 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${f(k)}</svg>`;
  }
  const icon = (n, cls) => D.ICONS[n] ? `<svg class="ax-i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${D.ICONS[n]}</svg>` : '';

  // ---------- the component library ----------
  // Each: { label, icon, group, lists: { field: { title-field } }, links: [paths that can link], render(p, h) }
  // h = helpers bound to one block: e(path, text, tag, cls) editable words, lk(path) link attributes, ic(path), im(path)
  const BLOCKS = {
    nav: { label: 'Top bar', icon: 'back', group: 'Navigation', render: (p, h) => `<div class="ax-nav">${p.back ? `<button class="ax-navb" data-act="back" aria-label="Back">${icon('back')}</button>` : '<span class="ax-navb ax-ghost"></span>'}${h.e('title', p.title, 'b', 'ax-navt')}${p.action ? `<button class="ax-navb"${h.lk('action')}>${icon(p.action)}</button>` : '<span class="ax-navb ax-ghost"></span>'}</div>` },
    header: { label: 'Big title', icon: 'edit', group: 'Text', render: (p, h) => `<div class="ax-head">${p.eyebrow ? h.e('eyebrow', p.eyebrow, 'span', 'ax-eyebrow') : ''}${h.e('title', p.title, 'h1', 'ax-h1')}${p.sub ? h.e('sub', p.sub, 'p', 'ax-sub') : ''}</div>` },
    tabs: { label: 'Tab bar', icon: 'grid', group: 'Navigation', lists: { items: 'label' }, render: (p, h) => `<nav class="ax-tabs">${(p.items || []).map((it, i) => `<button class="ax-tab${i === (p.on | 0) ? ' on' : ''}"${h.lk('items.' + i)} data-tab="${i}">${h.ic('items.' + i + '.icon', it.icon)}${h.e('items.' + i + '.label', it.label, 'span')}</button>`).join('')}</nav>` },
    list: { label: 'List', icon: 'list', group: 'Content', lists: { items: 'title' }, render: (p, h) => `<div class="ax-sec">${p.title ? h.e('title', p.title, 'h2', 'ax-h2') : ''}<div class="ax-list">${(p.items || []).map((it, i) => `<div class="ax-row" data-item="items.${i}"${h.lk('items.' + i)}>${it.icon ? `<span class="ax-ib">${h.ic('items.' + i + '.icon', it.icon)}</span>` : ''}<span class="ax-rt">${h.e('items.' + i + '.title', it.title, 'b')}${it.sub ? h.e('items.' + i + '.sub', it.sub, 'small') : ''}</span>${it.meta ? h.e('items.' + i + '.meta', it.meta, 'span', 'ax-meta') : ''}${h.has('items.' + i) ? icon('chevron', 'ax-chev') : ''}</div>`).join('')}</div></div>` },
    cards: { label: 'Card row', icon: 'image', group: 'Content', lists: { items: 'title' }, render: (p, h) => `<div class="ax-sec">${p.title ? h.e('title', p.title, 'h2', 'ax-h2') : ''}<div class="ax-cards">${(p.items || []).map((it, i) => `<div class="ax-cardi" data-item="items.${i}"${h.lk('items.' + i)}><div class="ax-art"${h.im('items.' + i + '.illus')}>${illus(it.illus, h.theme)}</div>${it.meta ? `<span class="ax-badge">${icon('star')}${h.e('items.' + i + '.meta', it.meta, 'span')}</span>` : ''}${h.e('items.' + i + '.title', it.title, 'b')}${h.e('items.' + i + '.sub', it.sub, 'small')}</div>`).join('')}</div></div>` },
    card: { label: 'Feature card', icon: 'star', group: 'Content', render: (p, h) => `<div class="ax-feat"${h.lk('')}><div class="ax-art"${h.im('illus')}>${illus(p.illus, h.theme)}</div><div class="ax-featb">${p.meta ? h.e('meta', p.meta, 'span', 'ax-eyebrow') : ''}${h.e('title', p.title, 'h2', 'ax-h2')}${h.e('sub', p.sub, 'p', 'ax-sub')}${p.button ? `<button class="ax-btn"${h.lk('button')}>${h.e('button', p.button, 'span')}</button>` : ''}</div></div>` },
    form: { label: 'Form', icon: 'edit', group: 'Input', lists: { fields: 'label' }, render: (p, h) => `<div class="ax-form">${(p.fields || []).map((f, i) => `<label class="ax-field" data-item="fields.${i}">${h.e('fields.' + i + '.label', f.label, 'span')}<input class="ax-in" placeholder="${esc(f.placeholder)}" data-ph="fields.${i}.placeholder"></label>`).join('')}${p.button ? `<button class="ax-btn ax-wide"${h.lk('button')}>${h.e('button', p.button, 'span')}</button>` : ''}</div>` },
    search: { label: 'Search and chips', icon: 'search', group: 'Input', lists: { chips: '' }, render: (p, h) => `<div class="ax-search">${p.placeholder ? `<label class="ax-sbox">${icon('search')}<input class="ax-in" placeholder="${esc(p.placeholder)}" data-ph="placeholder" data-filter></label>` : ''}${(p.chips || []).length ? `<div class="ax-chips">${p.chips.map((c, i) => `<button class="ax-chip${i === 0 ? ' on' : ''}" data-item="chips.${i}" data-chip>${h.e('chips.' + i, c, 'span')}</button>`).join('')}</div>` : ''}</div>` },
    chat: { label: 'Chat', icon: 'chat', group: 'Social', lists: { messages: 'text' }, render: (p, h) => `<div class="ax-chat"><div class="ax-msgs">${(p.messages || []).map((m, i) => `<div class="ax-msg ${m.who === 'me' ? 'me' : 'them'}" data-item="messages.${i}">${h.e('messages.' + i + '.text', m.text, 'span')}</div>`).join('')}</div><form class="ax-compose" data-compose><input class="ax-in" placeholder="${esc(p.placeholder || 'Message')}" data-ph="placeholder"><button class="ax-send" aria-label="Send">${icon('send')}</button></form></div>` },
    feed: { label: 'Feed post', icon: 'heart', group: 'Social', render: (p, h) => `<article class="ax-post"${h.lk('')}><header class="ax-ph"><span class="ax-av">${esc(String(p.author || '?').slice(0, 1))}</span><span>${h.e('author', p.author, 'b')}${h.e('time', p.time, 'small')}</span></header>${h.e('text', p.text, 'p', 'ax-pt')}<div class="ax-art ax-tall"${h.im('illus')}>${illus(p.illus, h.theme)}</div><footer class="ax-pf"><button data-like>${icon('heart')}${h.e('likes', p.likes, 'span')}</button><span>${icon('chat')}${h.e('comments', p.comments, 'span')}</span><span class="ax-sp">${icon('bookmark')}</span></footer></article>` },
    profile: { label: 'Profile header', icon: 'user', group: 'Social', lists: { stats: 'label' }, render: (p, h) => `<div class="ax-prof"><span class="ax-av ax-big">${esc(String(p.name || '?').slice(0, 1))}</span>${h.e('name', p.name, 'h1', 'ax-h1')}${h.e('handle', p.handle, 'small', 'ax-sub')}${p.bio ? h.e('bio', p.bio, 'p', 'ax-sub') : ''}${(p.stats || []).length ? `<div class="ax-pst">${p.stats.map((s, i) => `<span data-item="stats.${i}">${h.e('stats.' + i + '.n', s.n, 'b')}${h.e('stats.' + i + '.label', s.label, 'small')}</span>`).join('')}</div>` : ''}${p.button ? `<button class="ax-btn ax-quiet"${h.lk('button')}>${h.e('button', p.button, 'span')}</button>` : ''}</div>` },
    settings: { label: 'Settings rows', icon: 'settings', group: 'Content', lists: { items: 'label' }, render: (p, h) => `<div class="ax-sec">${p.title ? h.e('title', p.title, 'h2', 'ax-h2') : ''}<div class="ax-list">${(p.items || []).map((it, i) => `<div class="ax-row" data-item="items.${i}"${it.kind === 'chevron' ? h.lk('items.' + i) : ''}><span class="ax-rt">${h.e('items.' + i + '.label', it.label, 'b')}</span>${it.kind === 'toggle' ? `<button class="ax-tog${it.on ? ' on' : ''}" data-tog role="switch" aria-checked="${it.on ? 'true' : 'false'}" aria-label="${esc(it.label)}"><i></i></button>` : it.kind === 'value' ? h.e('items.' + i + '.value', it.value, 'span', 'ax-meta') : icon('chevron', 'ax-chev')}</div>`).join('')}</div></div>` },
    onboarding: { label: 'Welcome pages', icon: 'sparkle', group: 'Flows', lists: { pages: 'title' }, render: (p, h) => `<div class="ax-onb" data-onb><div class="ax-onbp">${(p.pages || []).map((pg, i) => `<div class="ax-page${i ? '' : ' on'}" data-item="pages.${i}" data-page="${i}"><div class="ax-art ax-hero"${h.im('pages.' + i + '.illus')}>${illus(pg.illus, h.theme)}</div>${h.e('pages.' + i + '.title', pg.title, 'h1', 'ax-h1')}${h.e('pages.' + i + '.text', pg.text, 'p', 'ax-sub')}</div>`).join('')}</div><div class="ax-dots">${(p.pages || []).map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div><button class="ax-btn ax-wide" data-next${h.lk('button')}>${h.e('button', p.button, 'span')}</button>${p.skip ? `<button class="ax-link"${h.lk('skip')}>${h.e('skip', p.skip, 'span')}</button>` : ''}</div>` },
    signin: { label: 'Sign in', icon: 'lock', group: 'Flows', render: (p, h) => `<div class="ax-auth"><span class="ax-logo">${icon('lock')}</span>${h.e('title', p.title, 'h1', 'ax-h1')}${h.e('sub', p.sub, 'p', 'ax-sub')}<label class="ax-field">${h.e('email', p.email, 'span')}<input class="ax-in" type="email" placeholder="you@example.com"></label><label class="ax-field">${h.e('password', p.password, 'span')}<input class="ax-in" type="password" placeholder="••••••••"></label><button class="ax-btn ax-wide"${h.lk('button')}>${h.e('button', p.button, 'span')}</button>${p.alt ? `<button class="ax-link"${h.lk('alt')}>${h.e('alt', p.alt, 'span')}</button>` : ''}</div>` },
    empty: { label: 'Empty state', icon: 'sparkle', group: 'Flows', render: (p, h) => `<div class="ax-empty"><span class="ax-ebig">${h.ic('icon', p.icon)}</span>${h.e('title', p.title, 'h1', 'ax-h1')}${h.e('text', p.text, 'p', 'ax-sub')}${p.button ? `<button class="ax-btn"${h.lk('button')}>${h.e('button', p.button, 'span')}</button>` : ''}</div>` },
    paywall: { label: 'Paywall layout', icon: 'star', group: 'Flows', lists: { features: '', plans: 'name' }, render: (p, h) => `<div class="ax-pay">${h.e('title', p.title, 'h1', 'ax-h1')}${h.e('sub', p.sub, 'p', 'ax-sub')}<ul class="ax-feats">${(p.features || []).map((f, i) => `<li data-item="features.${i}">${icon('check')}${h.e('features.' + i, f, 'span')}</li>`).join('')}</ul><div class="ax-plans">${(p.plans || []).map((pl, i) => `<button class="ax-plan${i === (p.pick | 0) ? ' on' : ''}" data-item="plans.${i}" data-plan>${pl.badge ? h.e('plans.' + i + '.badge', pl.badge, 'span', 'ax-badge') : ''}${h.e('plans.' + i + '.name', pl.name, 'b')}<span>${h.e('plans.' + i + '.price', pl.price, 'strong')} ${h.e('plans.' + i + '.per', pl.per, 'small')}</span></button>`).join('')}</div><button class="ax-btn ax-wide"${h.lk('button')}>${h.e('button', p.button, 'span')}</button>${h.e('fine', p.fine, 'small', 'ax-fine')}<small class="ax-fine ax-demo" data-i18n-hold>Payments are not connected: this is a design.</small></div>` },
    chart: { label: 'Chart', icon: 'chart', group: 'Data', render: (p, h) => { const v = (p.values || []).map(Number).filter(x => !isNaN(x)), mx = Math.max(1, ...v), mn = p.kind === 'line' ? Math.min(...v) * 0.9 : 0, W = 300, H = 120, n = Math.max(1, v.length);
      const pts = v.map((x, i) => [n === 1 ? W / 2 : (i * (W - 20)) / (n - 1) + 10, H - 10 - ((x - mn) / (mx - mn || 1)) * (H - 26)]);
      const g = p.kind === 'line' ? `<path d="M${pts.map(q => q.map(z => z.toFixed(1)).join(' ')).join(' L')}" fill="none" stroke="var(--ax-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${pts.map((q, i) => i === pts.length - 1 ? `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="5" fill="var(--ax-accent)"/>` : '').join('')}`
        : v.map((x, i) => { const bw = Math.min(34, (W - 20) / n - 8), cx = 10 + (i + 0.5) * ((W - 20) / n), hh = (x / mx) * (H - 26); return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(H - 10 - hh).toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="${Math.min(6, bw / 3).toFixed(1)}" fill="${i === v.length - 1 ? 'var(--ax-accent)' : 'var(--ax-soft)'}"/>`; }).join('');
      return `<div class="ax-chart">${h.e('title', p.title, 'small', 'ax-eyebrow')}${p.big ? h.e('big', p.big, 'b', 'ax-big') : ''}<svg viewBox="0 0 ${W} ${H}" class="ax-cs" aria-hidden="true">${g}</svg><div class="ax-cl">${(p.labels || []).map(l => `<span>${esc(l)}</span>`).join('')}</div></div>`; } },
    player: { label: 'Media player', icon: 'music', group: 'Media', render: (p, h) => `<div class="ax-player"><div class="ax-art ax-sq"${h.im('illus')}>${illus(p.illus, h.theme)}</div>${h.e('title', p.title, 'h1', 'ax-h1')}${h.e('artist', p.artist, 'p', 'ax-sub')}<div class="ax-bar"><i style="width:${Math.max(0, Math.min(100, p.progress | 0))}%"></i></div><div class="ax-ctl"><button aria-label="Back">${icon('back')}</button><button class="ax-play" data-play aria-label="Play">${icon('play', 'ax-pl')}${icon('pause', 'ax-pa')}</button><button aria-label="Next">${icon('chevron')}</button></div></div>` },
    map: { label: 'Map', icon: 'pin', group: 'Media', render: (p, h) => `<div class="ax-map"><svg viewBox="0 0 300 150" aria-hidden="true"><rect width="300" height="150" fill="var(--ax-surface2)"/><path d="M0 100 C80 80 120 130 300 60" stroke="var(--ax-line)" stroke-width="14" fill="none"/><path d="M90 0 L140 150 M220 0 L190 150" stroke="var(--ax-line)" stroke-width="8"/>${Array.from({ length: Math.max(1, Math.min(6, p.pins | 0 || 1)) }, (_, i) => `<g transform="translate(${60 + i * 45},${50 + (i % 2) * 30})"><circle r="11" fill="var(--ax-accent)"/><circle r="4" fill="var(--ax-on)"/></g>`).join('')}</svg>${h.e('label', p.label, 'small', 'ax-mapl')}</div>` },
    button: { label: 'Button', icon: 'plus', group: 'Input', render: (p, h) => `<div class="ax-bwrap"><button class="ax-btn ax-wide${p.style === 'secondary' ? ' ax-quiet' : ''}"${h.lk('')}>${p.icon ? h.ic('icon', p.icon) : ''}${h.e('label', p.label, 'span')}</button></div>` },
    text: { label: 'Paragraph', icon: 'note', group: 'Text', render: (p, h) => `<div class="ax-text">${h.e('text', p.text, 'p')}</div>` },
    image: { label: 'Picture', icon: 'image', group: 'Media', render: (p, h) => `<figure class="ax-fig"><div class="ax-art ax-hero"${h.im('illus')}>${illus(p.illus, h.theme)}</div>${p.caption ? h.e('caption', p.caption, 'figcaption') : ''}</figure>` },
    stats: { label: 'Stat tiles', icon: 'chart', group: 'Data', lists: { tiles: 'label' }, render: (p, h) => `<div class="ax-stats">${(p.tiles || []).map((t, i) => `<div class="ax-tile" data-item="tiles.${i}">${h.e('tiles.' + i + '.n', t.n, 'b')}${h.e('tiles.' + i + '.label', t.label, 'small')}</div>`).join('')}</div>` },
    checklist: { label: 'Checklist', icon: 'check', group: 'Content', lists: { items: 'title' }, render: (p, h) => `<div class="ax-sec">${p.title ? h.e('title', p.title, 'h2', 'ax-h2') : ''}<div class="ax-list">${(p.items || []).map((it, i) => `<div class="ax-row ax-chk${it.done ? ' done' : ''}" data-item="items.${i}" data-check><span class="ax-box">${icon('check')}</span><span class="ax-rt">${h.e('items.' + i + '.title', it.title, 'b')}${it.sub ? h.e('items.' + i + '.sub', it.sub, 'small') : ''}</span>${it.streak ? `<span class="ax-meta ax-streak">${icon('flame')}${h.e('items.' + i + '.streak', it.streak, 'span')}</span>` : ''}</div>`).join('')}</div></div>` },
    timer: { label: 'Timer', icon: 'clock', group: 'Data', render: (p, h) => `<div class="ax-timer"><div class="ax-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" stroke="var(--ax-surface2)" stroke-width="8" fill="none"/><circle cx="60" cy="60" r="52" stroke="var(--ax-accent)" stroke-width="8" fill="none" stroke-dasharray="327" stroke-dashoffset="110" stroke-linecap="round" transform="rotate(-90 60 60)"/></svg>${h.e('time', p.time, 'b', 'ax-tbig')}</div>${h.e('label', p.label, 'h2', 'ax-h2')}${h.e('sub', p.sub, 'p', 'ax-sub')}${p.button ? `<button class="ax-btn ax-wide"${h.lk('button')}>${h.e('button', p.button, 'span')}</button>` : ''}</div>` },
    grid: { label: 'Tile grid', icon: 'grid', group: 'Content', lists: { items: 'title' }, render: (p, h) => `<div class="ax-sec">${p.title ? h.e('title', p.title, 'h2', 'ax-h2') : ''}<div class="ax-grid">${(p.items || []).map((it, i) => `<div class="ax-gi" data-item="items.${i}"${h.lk('items.' + i)}><div class="ax-art"${h.im('items.' + i + '.illus')}>${illus(it.illus, h.theme)}</div>${h.e('items.' + i + '.title', it.title, 'b')}${it.price ? h.e('items.' + i + '.price', it.price, 'small') : ''}</div>`).join('')}</div></div>` },
    calendar: { label: 'Day and time picker', icon: 'calendar', group: 'Input', lists: { days: '', slots: '' }, render: (p, h) => `<div class="ax-sec">${p.title ? h.e('title', p.title, 'h2', 'ax-h2') : ''}<div class="ax-days">${(p.days || []).map((d, i) => `<button class="ax-day${i === (p.on | 0) ? ' on' : ''}" data-item="days.${i}" data-pick="day">${h.e('days.' + i, d, 'span')}</button>`).join('')}</div><div class="ax-slots">${(p.slots || []).map((s, i) => `<button class="ax-slot${i === (p.pick | 0) ? ' on' : ''}" data-item="slots.${i}" data-pick="slot">${h.e('slots.' + i, s, 'span')}</button>`).join('')}</div></div>` },
  };
  if (PARTS && PARTS.BLOCKS) for (const [k, B] of Object.entries(PARTS.BLOCKS)) if (!BLOCKS[k]) BLOCKS[k] = { ...B, render: (p, h) => B.render(p, h, { icon, illus, esc }) };
  const BLOCK_TYPES = Object.keys(BLOCKS);
  const GROUPS = ['Navigation', 'Text', 'Content', 'Input', 'Social', 'Commerce', 'Data', 'Media', 'Flows'];

  // ---------- the document ----------
  const rid = () => Math.random().toString(36).slice(2, 8);
  function normBlock(bk, seen) {
    if (!bk || !BLOCKS[bk.type]) return null;
    let id = str(bk.id, 24).replace(/[^\w-]/g, ''); if (!id || seen.has(id)) id = bk.type.slice(0, 3) + '-' + rid(); seen.add(id);
    const props = Object.assign(clone(D.DEFAULTS[bk.type] || {}), bk.props ? clone(bk.props) : {});
    const links = {}; for (const [k, l] of Object.entries(bk.links || {})) if (l && typeof l.to === 'string') links[str(k, 40)] = { to: str(l.to, 40), how: ['push', 'sheet', 'fade', 'morph'].includes(l.how) ? l.how : 'push' };
    return { id, type: bk.type, props, links, ...(bk.hide ? { hide: true } : {}) };
  }
  function normalize(doc) {
    doc = doc && typeof doc === 'object' ? clone(doc) : {};
    const out = { v: 1, name: str(doc.name || 'My app', 48).trim() || 'My app', platform: doc.platform === 'android' ? 'android' : 'ios', device: ['phone', 'max', 'small', 'pixel'].includes(doc.device) ? doc.device : 'phone', theme: normTheme(doc.theme), screens: [], start: '' };
    const ids = new Set(), seen = new Set();
    for (const s of Array.isArray(doc.screens) ? doc.screens.slice(0, 60) : []) {
      if (!s || typeof s !== 'object') continue;
      let id = slug(s.id || s.name); while (ids.has(id)) id = id + '-2'; ids.add(id);
      out.screens.push({ id, name: str(s.name || 'Screen', 40) || 'Screen', ...(s.tab ? { tab: true } : {}), icon: D.ICONS[s.icon] ? s.icon : 'home', blocks: (Array.isArray(s.blocks) ? s.blocks : []).slice(0, 40).map(bk => normBlock(bk, seen)).filter(Boolean) });
    }
    if (!out.screens.length) out.screens.push({ id: 'home', name: 'Home', icon: 'home', blocks: [normBlock({ type: 'header', props: { eyebrow: '', title: out.name, sub: 'Your first screen. Add components from the library.' } }, seen)] });
    const has = id => out.screens.some(s => s.id === id);
    for (const s of out.screens) for (const bk of s.blocks) for (const [k, l] of Object.entries(bk.links)) if (!has(l.to)) delete bk.links[k];
    out.start = has(doc.start) ? doc.start : out.screens[0].id;
    return out;
  }
  const templateList = () => TEMPLATES.map(t => ({ id: t.id, title: t.title, summary: t.summary, icon: t.icon, accent: t.accent, cat: t.cat || 'Everyday', sweet: !!t.sweet }));
  function template(id, opts) {
    const t = TEMPLATES.find(x => x.id === id); if (!t) return null;
    const d = normalize(t.build()); d.template = t.id;
    if (opts && opts.name) d.name = str(opts.name, 48);
    if (opts && HEX(opts.accent)) d.theme.accent = HEX(opts.accent);
    return d;
  }
  const blank = name => normalize({ name: name || 'My app' });
  const findScreen = (doc, id) => doc.screens.find(s => s.id === id) || null;
  function findBlock(doc, bid) { for (const s of doc.screens) { const bk = s.blocks.find(x => x.id === bid); if (bk) return { screen: s, block: bk }; } return null; }

  // add a kit's screens; a kit that is a tab ("settings", "profile") also joins every tab bar
  function kit(doc, kitId) {
    doc = normalize(doc); const K = KITS[kitId]; if (!K) return { doc, added: [] };
    const fresh = normalize({ screens: K.screens() }).screens, map = {}, added = [];
    for (const s of fresh) { let id = s.id; while (findScreen(doc, id)) id = id + '-2'; map[s.id] = id; }
    for (const s of fresh) {
      s.id = map[s.id]; for (const bk of s.blocks) { bk.id = bk.type.slice(0, 3) + '-' + rid(); for (const l of Object.values(bk.links)) if (map[l.to]) l.to = map[l.to]; }
      if (K.screens()[0] && K.screens()[0].first && s === fresh[0]) doc.screens.unshift(s); else doc.screens.push(s);
      added.push(s.id);
    }
    if (K.screens()[0] && K.screens()[0].first) { const first = fresh[0]; const ob = first.blocks.find(x => x.type === 'onboarding'); if (ob) { const to = doc.start === first.id ? (doc.screens[1] || {}).id : doc.start; if (to) { ob.links.button = { to, how: 'fade' }; ob.links.skip = { to, how: 'fade' }; } } doc.start = first.id; }
    if (K.tab) { const s0 = findScreen(doc, added[0]); s0.tab = true; addTab(doc, s0); }
    return { doc: normalize(doc), added };
  }
  // every tab bar gets a tab for this screen; the screen gets the same tab bar, with its own tab lit
  function addTab(doc, screen) {
    const bars = doc.screens.map(s => s.blocks.find(b => b.type === 'tabs')).filter(Boolean);
    if (!bars.length) return false;
    const proto = bars[0];
    for (const bar of bars) if (!Object.values(bar.links).some(l => l.to === screen.id) && bar.props.items.length < 5) { bar.links['items.' + bar.props.items.length] = { to: screen.id, how: 'fade' }; bar.props.items.push({ label: screen.name, icon: screen.icon || 'star' }); }
    if (!screen.blocks.some(b => b.type === 'tabs')) {
      const nb = clone(bars.find(b => Object.values(b.links).some(l => l.to === screen.id)) || proto); nb.id = 'tab-' + rid();
      const i = Object.entries(nb.links).find(([, l]) => l.to === screen.id); nb.props.on = i ? +i[0].split('.')[1] : nb.props.items.length - 1;
      screen.blocks.push(nb);
    }
    return true;
  }

  // ---------- rendering ----------
  const getPath = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = String(p).split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) return false; a = a[ks[i]]; } if (a == null) return false; a[ks[ks.length - 1]] = v; return true; }
  function helpers(doc, bk, edit) {
    return {
      theme: doc.theme,
      e: (path, text, tag, cls) => `<${tag}${cls ? ` class="${cls}"` : ''}${edit ? ` data-e="${esc(path)}"` : ''}>${esc(text)}</${tag}>`,
      lk: path => { const l = bk.links[path]; return (l ? ` data-to="${esc(l.to)}" data-how="${l.how}"` : '') + (edit ? ` data-lk="${esc(path)}"` : ''); },
      has: path => !!bk.links[path],
      ic: (path, n) => `<span class="ax-icw"${edit ? ` data-ic="${esc(path)}"` : ''}>${icon(n || 'star')}</span>`,
      im: path => (edit ? ` data-img="${esc(path)}"` : ''),
    };
  }
  function blockHTML(doc, bk, edit) {
    const B = BLOCKS[bk.type]; if (!B) return '';
    let inner = ''; try { inner = B.render(bk.props, helpers(doc, bk, edit)); } catch (e) { inner = `<p class="ax-sub">${esc(B.label)}</p>`; }
    return `<div class="ax-b ax-b-${bk.type}" data-b="${esc(bk.id)}">${inner}</div>`;
  }
  function screenHTML(doc, screen, opts) {
    const edit = !!(opts && opts.edit), bar = screen.blocks.filter(b => b.type === 'tabs'), body = screen.blocks.filter(b => b.type !== 'tabs' && b.type !== 'nav' && !b.hide), top = screen.blocks.filter(b => b.type === 'nav');
    return `<section class="ax-screen" data-screen="${esc(screen.id)}"><div class="ax-status"><b>9:41</b><span class="ax-sig"><i></i><i></i><i></i></span></div>${top.map(b => blockHTML(doc, b, edit)).join('')}<div class="ax-scroll">${body.map(b => blockHTML(doc, b, edit)).join('')}</div>${bar.map(b => blockHTML(doc, b, edit)).join('')}</section>`;
  }

  // the stylesheet for an app: scope is the class on the app's root (".ax" in the editor, "body" in the export)
  // css(doc) = the fonts + `scope{theme variables}` + the shared component styles. The shared part never changes with the
  // theme (light/dark, corners, platform come in as variables or as data-plat / data-r on the root), so the editor puts it
  // on the page once and each screen or thumbnail only carries style="vars(theme)" and attrs(doc).
  const baseCache = {};
  function attrs(doc) { const t = normTheme(doc.theme); return `data-plat="${doc.platform === 'android' ? 'android' : 'ios'}" data-r="${t.radius}"`; }
  function css(doc, opts) {
    const o = opts || {}, S = o.scope || '.ax', t = normTheme(doc.theme);
    return fontFaces(t, o.fontBase) + `${S}{${vars(t)}}` + baseCSS(S);
  }
  function allFonts(base) { return Object.keys(FACE).map(fam => FACE[fam].map(([file, w]) => `@font-face{font-family:'${fam}';src:url('${(base || 'assets/site-fonts/') + file}.woff2') format('woff2');font-weight:${w};font-display:swap}`).join('')).join(''); }
  function baseCSS(scope) {
    const S = scope || '.ax'; if (baseCache[S]) return baseCache[S];
    const R = s => s.replace(/&/g, S);
    return (baseCache[S] = R(`&{font-family:var(--ax-body);color:var(--ax-ink);background:var(--ax-bg);-webkit-font-smoothing:antialiased;line-height:1.4;font-size:15px}
& *{box-sizing:border-box}& button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:inherit}& input{font:inherit}
& .ax-screen{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--ax-bg);overflow:hidden}
& .ax-status{height:44px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font-size:14px}& .ax-status b{font-weight:600}& .ax-sig{display:flex;gap:2px;align-items:flex-end}& .ax-sig i{width:3px;background:var(--ax-ink);border-radius:1px}& .ax-sig i:nth-child(1){height:5px}& .ax-sig i:nth-child(2){height:8px}& .ax-sig i:nth-child(3){height:11px}
& .ax-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:4px var(--ax-pad) calc(var(--ax-bgap) + 8px);display:flex;flex-direction:column;gap:var(--ax-bgap);scrollbar-width:none}& .ax-scroll::-webkit-scrollbar{display:none}
& .ax-i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:var(--ax-stroke);stroke-linecap:round;stroke-linejoin:round;flex:none;display:block}& .ax-icw{display:inline-flex}
& .ax-h1{font-family:var(--ax-display);font-weight:var(--ax-dw);font-size:28px;line-height:1.12;margin:0;letter-spacing:-.01em}& .ax-h2{font-family:var(--ax-display);font-weight:var(--ax-dw);font-size:17px;margin:0 0 8px}& .ax-sub{color:var(--ax-muted);margin:4px 0 0;font-size:15px}
& .ax-eyebrow{display:block;color:var(--ax-accent);font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}
& .ax-nav{height:48px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px}& .ax-navt{flex:1;text-align:center;font-size:17px;font-weight:600;font-family:var(--ax-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}& .ax-navb{width:40px;height:40px;display:grid;place-items:center;border-radius:var(--ax-rb);color:var(--ax-accent)}& .ax-ghost{visibility:hidden}
& .ax-head{padding-top:6px}
& .ax-tabs{flex:none;display:flex;border-top:1px solid var(--ax-line);background:var(--ax-bg);padding:6px 6px 22px}& .ax-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;color:var(--ax-muted);min-height:44px;justify-content:center;border-radius:var(--ax-rs)}& .ax-tab.on{color:var(--ax-accent)}&[data-plat=android] .ax-navt{text-align:left}&[data-plat=android] .ax-tab.on .ax-icw{background:var(--ax-soft);border-radius:999px;padding:2px 16px}
& .ax-list{background:var(--ax-surface);border:1px solid var(--ax-line);border-radius:var(--ax-r);overflow:hidden}& .ax-row{display:flex;align-items:center;gap:12px;padding:12px var(--ax-pad);min-height:52px}& .ax-row+.ax-row{border-top:1px solid var(--ax-line)}& .ax-rt{flex:1;min-width:0;display:flex;flex-direction:column}& .ax-rt b{font-weight:600;overflow:hidden;text-overflow:ellipsis}& .ax-rt small{color:var(--ax-muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}& .ax-meta{color:var(--ax-muted);font-size:14px;white-space:nowrap}& .ax-chev{width:16px;height:16px;color:var(--ax-muted)}
& .ax-ib{width:36px;height:36px;border-radius:var(--ax-rs);background:var(--ax-soft);color:var(--ax-accent);display:grid;place-items:center;flex:none}
& .ax-art{position:relative;overflow:hidden;border-radius:var(--ax-r);background:var(--ax-surface2);aspect-ratio:300/190}& .ax-art svg{position:absolute;inset:0;width:100%;height:100%;display:block}& .ax-tall{aspect-ratio:4/3}& .ax-sq{aspect-ratio:1;max-width:240px;width:100%;margin:8px auto 0}& .ax-hero{aspect-ratio:16/11}
& .ax-cards{display:flex;gap:var(--ax-gap);overflow-x:auto;margin:0 calc(-1 * var(--ax-pad));padding:0 var(--ax-pad);scrollbar-width:none}& .ax-cardi{flex:0 0 72%;position:relative;display:flex;flex-direction:column;gap:2px}& .ax-cardi .ax-art{margin-bottom:6px}& .ax-cardi small{color:var(--ax-muted);font-size:13px}
& .ax-badge{display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:600;padding:3px 8px;border-radius:999px;background:var(--ax-accent);color:var(--ax-on)}& .ax-badge .ax-i{width:12px;height:12px}& .ax-cardi .ax-badge{position:absolute;top:10px;left:10px}
& .ax-feat{background:var(--ax-surface);border:1px solid var(--ax-line);border-radius:var(--ax-r);overflow:hidden}& .ax-feat .ax-art{border-radius:0}& .ax-featb{padding:var(--ax-pad);display:flex;flex-direction:column;gap:4px}& .ax-featb .ax-btn{margin-top:10px;align-self:flex-start}
& .ax-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 22px;border-radius:var(--ax-rb);background:var(--ax-accent);color:var(--ax-on);font-weight:600;font-size:16px}& .ax-wide{width:100%}& .ax-quiet{background:var(--ax-surface2);color:var(--ax-ink)}& .ax-btn .ax-i{width:18px;height:18px}
& .ax-link{display:block;width:100%;text-align:center;color:var(--ax-accent);font-weight:600;padding:12px;min-height:44px}
& .ax-form{display:flex;flex-direction:column;gap:var(--ax-gap)}& .ax-field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:var(--ax-muted)}& .ax-in{width:100%;min-height:48px;border:1px solid var(--ax-line);background:var(--ax-surface);color:var(--ax-ink);border-radius:var(--ax-rs);padding:0 14px;font-size:16px;outline:none}& .ax-in:focus{border-color:var(--ax-accent)}
& .ax-search{display:flex;flex-direction:column;gap:10px}& .ax-sbox{display:flex;align-items:center;gap:8px;background:var(--ax-surface);border:1px solid var(--ax-line);border-radius:var(--ax-rb);padding:0 14px;color:var(--ax-muted)}& .ax-sbox .ax-in{border:0;background:none;padding:0}
& .ax-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 calc(-1 * var(--ax-pad));padding:0 var(--ax-pad)}& .ax-chip{flex:none;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--ax-line);font-size:14px;font-weight:500;display:inline-flex;align-items:center}& .ax-chip.on{background:var(--ax-ink);color:var(--ax-bg);border-color:var(--ax-ink)}
& .ax-chat{display:flex;flex-direction:column;gap:12px;flex:1}& .ax-msgs{display:flex;flex-direction:column;gap:6px}& .ax-msg{max-width:78%;padding:10px 14px;border-radius:18px;font-size:15px}& .ax-msg.them{background:var(--ax-surface2);align-self:flex-start;border-bottom-left-radius:6px}& .ax-msg.me{background:var(--ax-accent);color:var(--ax-on);align-self:flex-end;border-bottom-right-radius:6px}
& .ax-compose{display:flex;gap:8px;margin-top:auto}& .ax-compose .ax-in{border-radius:999px}& .ax-send{width:48px;height:48px;flex:none;border-radius:999px;background:var(--ax-accent);color:var(--ax-on);display:grid;place-items:center}
& .ax-post{display:flex;flex-direction:column;gap:10px}& .ax-ph{display:flex;align-items:center;gap:10px}& .ax-ph span:last-child{display:flex;flex-direction:column}& .ax-ph small{color:var(--ax-muted);font-size:13px}& .ax-pt{margin:0}& .ax-pf{display:flex;gap:18px;color:var(--ax-muted);font-size:14px;align-items:center}& .ax-pf>*{display:inline-flex;align-items:center;gap:5px;min-height:40px}& .ax-sp{margin-left:auto}& .ax-pf .liked{color:var(--ax-accent)}
& .ax-av{width:40px;height:40px;border-radius:999px;background:var(--ax-soft);color:var(--ax-accent);display:grid;place-items:center;font-weight:700;flex:none}& .ax-av.ax-big{width:88px;height:88px;font-size:34px;font-family:var(--ax-display)}
& .ax-prof{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;padding-top:8px}& .ax-prof .ax-h1{margin-top:10px;font-size:24px}& .ax-pst{display:flex;gap:28px;margin:14px 0 6px}& .ax-pst span{display:flex;flex-direction:column}& .ax-pst b{font-size:18px;font-family:var(--ax-display)}& .ax-pst small{color:var(--ax-muted);font-size:13px}& .ax-prof .ax-btn{min-width:60%;margin-top:6px}
& .ax-tog{width:52px;height:32px;border-radius:999px;background:var(--ax-surface2);position:relative;flex:none;border:1px solid var(--ax-line);transition:background var(--ax-ms) var(--ax-ease)}& .ax-tog i{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:999px;background:#fff;transition:transform var(--ax-ms) var(--ax-ease)}& .ax-tog.on{background:var(--ax-accent);border-color:var(--ax-accent)}& .ax-tog.on i{transform:translateX(20px)}
& .ax-onb{display:flex;flex-direction:column;gap:14px;flex:1;text-align:center;padding-top:10px}& .ax-page{display:none;flex-direction:column;gap:8px}& .ax-page.on{display:flex}& .ax-dots{display:flex;gap:6px;justify-content:center}& .ax-dots i{width:8px;height:8px;border-radius:999px;background:var(--ax-surface2);transition:width var(--ax-ms) var(--ax-ease)}& .ax-dots i.on{width:22px;background:var(--ax-accent)}
& .ax-auth{display:flex;flex-direction:column;gap:12px;padding-top:24px}& .ax-logo{width:64px;height:64px;border-radius:var(--ax-r);background:var(--ax-accent);color:var(--ax-on);display:grid;place-items:center;margin-bottom:8px}& .ax-logo .ax-i{width:30px;height:30px}
& .ax-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:48px 12px}& .ax-ebig{width:84px;height:84px;border-radius:999px;background:var(--ax-soft);color:var(--ax-accent);display:grid;place-items:center;margin-bottom:10px}& .ax-ebig .ax-i{width:38px;height:38px}& .ax-empty .ax-btn{margin-top:14px}
& .ax-pay{display:flex;flex-direction:column;gap:12px}& .ax-feats{list-style:none;margin:6px 0;padding:0;display:flex;flex-direction:column;gap:10px}& .ax-feats li{display:flex;gap:10px;align-items:center;font-weight:500}& .ax-feats .ax-i{color:var(--ax-accent)}
& .ax-plans{display:flex;flex-direction:column;gap:10px}& .ax-plan{position:relative;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px;border-radius:var(--ax-r);border:1.5px solid var(--ax-line);background:var(--ax-surface);min-height:60px}& .ax-plan.on{border-color:var(--ax-accent);background:var(--ax-soft)}& .ax-plan .ax-badge{position:absolute;top:-10px;right:14px}& .ax-plan small{color:var(--ax-muted)}
& .ax-fine{display:block;text-align:center;color:var(--ax-muted);font-size:12px}& .ax-demo{opacity:.8}
& .ax-chart{background:var(--ax-surface);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:var(--ax-pad)}& .ax-big{display:block;font-family:var(--ax-display);font-weight:var(--ax-dw);font-size:30px;margin:2px 0 8px}& .ax-cs{width:100%;height:auto;display:block}& .ax-cl{display:flex;justify-content:space-around;color:var(--ax-muted);font-size:12px;margin-top:6px}
& .ax-player{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px}& .ax-bar{width:100%;height:5px;border-radius:999px;background:var(--ax-surface2);margin:16px 0 6px;overflow:hidden}& .ax-bar i{display:block;height:100%;background:var(--ax-accent);border-radius:999px}& .ax-ctl{display:flex;gap:28px;align-items:center}& .ax-ctl button{width:44px;height:44px;display:grid;place-items:center}& .ax-play{width:68px!important;height:68px!important;border-radius:999px;background:var(--ax-accent);color:var(--ax-on)}& .ax-play .ax-i{width:28px;height:28px}& .ax-pa{display:none!important}& .ax-play.on .ax-pa{display:block!important}& .ax-play.on .ax-pl{display:none!important}
& .ax-map{position:relative;border-radius:var(--ax-r);overflow:hidden;border:1px solid var(--ax-line)}& .ax-map svg{display:block;width:100%;height:auto}& .ax-mapl{position:absolute;left:10px;bottom:10px;background:var(--ax-bg);padding:6px 10px;border-radius:var(--ax-rs);font-weight:600;font-size:13px;border:1px solid var(--ax-line)}
& .ax-text p{margin:0;white-space:pre-wrap;line-height:1.6}& .ax-fig{margin:0}& .ax-fig figcaption{color:var(--ax-muted);font-size:13px;margin-top:6px}
& .ax-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:var(--ax-gap)}& .ax-tile{background:var(--ax-surface);border:1px solid var(--ax-line);border-radius:var(--ax-r);padding:12px var(--ax-pad);display:flex;flex-direction:column}& .ax-tile b{font-family:var(--ax-display);font-weight:var(--ax-dw);font-size:20px}& .ax-tile small{color:var(--ax-muted);font-size:12px}
& .ax-chk{cursor:pointer}& .ax-box{width:26px;height:26px;border-radius:999px;border:1.5px solid var(--ax-line);display:grid;place-items:center;flex:none;color:transparent;transition:background var(--ax-ms) var(--ax-ease)}& .ax-box .ax-i{width:15px;height:15px}&[data-r=sharp] .ax-box{border-radius:4px}& .ax-chk.done .ax-box{background:var(--ax-accent);border-color:var(--ax-accent);color:var(--ax-on)}& .ax-chk.done .ax-rt b{color:var(--ax-muted);text-decoration:line-through}& .ax-streak{display:inline-flex;align-items:center;gap:3px;color:var(--ax-accent)}& .ax-streak .ax-i{width:15px;height:15px}
& .ax-timer{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px}& .ax-ring{position:relative;width:220px;height:220px;margin:6px 0 10px}& .ax-ring svg{width:100%;height:100%}& .ax-tbig{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--ax-display);font-size:44px;font-weight:var(--ax-dw)}& .ax-timer .ax-btn{margin-top:12px}
& .ax-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--ax-gap)}& .ax-gi{display:flex;flex-direction:column;gap:2px}& .ax-gi .ax-art{aspect-ratio:1;margin-bottom:6px}& .ax-gi small{color:var(--ax-muted);font-size:13px}
& .ax-days,& .ax-slots{display:flex;gap:8px;flex-wrap:wrap}& .ax-days{flex-wrap:nowrap;overflow-x:auto;margin-bottom:12px;scrollbar-width:none}& .ax-day{flex:none;min-width:64px;min-height:56px;border-radius:var(--ax-r);border:1px solid var(--ax-line);font-size:13px;font-weight:600;display:grid;place-items:center;padding:6px}& .ax-slot{min-height:44px;padding:0 16px;border-radius:var(--ax-rb);border:1px solid var(--ax-line);font-weight:600}& .ax-day.on,& .ax-slot.on{background:var(--ax-accent);color:var(--ax-on);border-color:var(--ax-accent)}
& .ax-bwrap{display:flex}
${PARTS && PARTS.CSS ? PARTS.CSS : ''}
@media (prefers-reduced-motion: reduce){& *{transition:none!important;animation:none!important}}`));
  }

  // ---------- the prototype runtime: links, transitions, and the little interactions (shared by the editor and the export) ----------
  // window.AxRun(root, { start, onGo }) wires a container holding every .ax-screen. Transitions use the Web Animations
  // API with the theme's motion (--ax-ms, --ax-ease); reduced motion makes them instant.
  function AxRun(root, o) {
      o = o || {};
      var screens = function () { return Array.prototype.slice.call(root.querySelectorAll('.ax-screen')); };
      var byId = function (id) { return root.querySelector('.ax-screen[data-screen="' + id + '"]'); };
      var hist = [], cur = null, busy = false;
      var reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      var cs = getComputedStyle(root), ms = reduce ? 0 : (parseFloat(cs.getPropertyValue('--ax-ms')) || 340), ease = (cs.getPropertyValue('--ax-ease') || 'ease').trim();
      function show(id) { screens().forEach(function (s) { s.style.display = s.getAttribute('data-screen') === id ? '' : 'none'; s.style.transform = ''; s.style.opacity = ''; s.style.zIndex = ''; }); cur = id; }
      function anim(el, kf, d) { if (!el || !el.animate || !ms) return Promise.resolve(); return el.animate(kf, { duration: d || ms, easing: ease, fill: 'both' }).finished.catch(function () {}); }
      function go(id, how, back, from) {
        var a = byId(cur), b = byId(id); if (!b || id === cur || busy) return Promise.resolve();
        busy = true; if (!back) hist.push({ id: cur, how: how }); b.style.display = ''; b.style.zIndex = 2; if (a) a.style.zIndex = 1;
        var done = function () { show(id); busy = false; if (o.onGo) o.onGo(id); };
        var W = root.clientWidth || 390, H = root.clientHeight || 844, p;
        if (how === 'sheet') p = back ? Promise.all([anim(a, [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }]), anim(b, [{ transform: 'scale(.94)', opacity: .6 }, { transform: 'scale(1)', opacity: 1 }])]).then(function () { b.style.zIndex = 1; })
          : Promise.all([anim(b, [{ transform: 'translateY(100%)', borderRadius: '18px 18px 0 0' }, { transform: 'translateY(0)', borderRadius: '0' }]), anim(a, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.94)', opacity: .6 }])]);
        else if (how === 'fade') p = anim(b, [{ opacity: 0 }, { opacity: 1 }], ms * 0.7);
        else if (how === 'morph' && from && !back) {
          var r0 = root.getBoundingClientRect(), r = from.getBoundingClientRect(), sx = r.width / W, sy = r.height / H, tx = r.left - r0.left, ty = r.top - r0.top;
          p = Promise.all([anim(b, [{ transformOrigin: '0 0', transform: 'translate(' + tx + 'px,' + ty + 'px) scale(' + sx + ',' + sy + ')', opacity: 0, borderRadius: '24px' }, { transformOrigin: '0 0', transform: 'translate(0,0) scale(1,1)', opacity: 1, borderRadius: '0' }], ms * 1.15), anim(a, [{ opacity: 1 }, { opacity: .3 }], ms * 1.15)]);
        }
        else p = back ? Promise.all([anim(a, [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }]), anim(b, [{ transform: 'translateX(-30%)', opacity: .7 }, { transform: 'translateX(0)', opacity: 1 }])]).then(function () { b.style.zIndex = 1; })
          : Promise.all([anim(b, [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }]), anim(a, [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-30%)', opacity: .7 }])]);
        return p.then(done);
      }
      function back() { var h = hist.pop(); if (h) return go(h.id, h.how === 'morph' ? 'fade' : h.how, true); }
      root.addEventListener('click', function (e) {
        var t = e.target; if (o.paused && o.paused()) return;
        var tog = t.closest('[data-tog]'); if (tog) { tog.classList.toggle('on'); tog.setAttribute('aria-checked', tog.classList.contains('on') ? 'true' : 'false'); return; }
        var chk = t.closest('[data-check]'); if (chk) { chk.classList.toggle('done'); return; }
        var chip = t.closest('[data-chip]'); if (chip) { Array.prototype.forEach.call(chip.parentNode.children, function (c) { c.classList.toggle('on', c === chip); }); return; }
        var pick = t.closest('[data-pick]'); if (pick) { Array.prototype.forEach.call(pick.parentNode.children, function (c) { c.classList.toggle('on', c === pick); }); return; }
        var plan = t.closest('[data-plan]'); if (plan) { Array.prototype.forEach.call(plan.parentNode.children, function (c) { c.classList.toggle('on', c === plan); }); return; }
        var like = t.closest('[data-like]'); if (like) { like.classList.toggle('liked'); return; }
        var play = t.closest('[data-play]'); if (play) { play.classList.toggle('on'); return; }
        if (t.closest('[data-act="back"]')) { e.preventDefault(); back(); return; }
        var nx = t.closest('[data-next]'); if (nx) { var ob = nx.closest('[data-onb]'), pgs = ob.querySelectorAll('.ax-page'), dots = ob.querySelectorAll('.ax-dots i'), i = 0; for (var k = 0; k < pgs.length; k++) if (pgs[k].classList.contains('on')) i = k; if (i < pgs.length - 1) { pgs[i].classList.remove('on'); pgs[i + 1].classList.add('on'); if (dots[i]) dots[i].classList.remove('on'); if (dots[i + 1]) dots[i + 1].classList.add('on'); return; } }
        var l = t.closest('[data-to]'); if (l && root.contains(l)) { e.preventDefault(); go(l.getAttribute('data-to'), l.getAttribute('data-how') || 'push', false, l); }
      });
      root.addEventListener('submit', function (e) { var f = e.target.closest('[data-compose]'); if (!f) return; e.preventDefault(); var i = f.querySelector('input'), v = (i.value || '').trim(); if (!v) return; var m = document.createElement('div'); m.className = 'ax-msg me'; m.textContent = v; f.previousElementSibling.appendChild(m); i.value = ''; });
      root.addEventListener('input', function (e) { var i = e.target.closest('[data-filter]'); if (!i) return; var q = i.value.toLowerCase(), sc = i.closest('.ax-screen'); Array.prototype.forEach.call(sc.querySelectorAll('.ax-row,.ax-gi,.ax-cardi'), function (r) { r.style.display = !q || r.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; }); });
      show(o.start || (screens()[0] && screens()[0].getAttribute('data-screen')));
      return { go: go, back: back, current: function () { return cur; }, show: show };
  }
  const RUNTIME = AxRun.toString();

  // ---------- edits: what Flint, the toolbar and the AI share ----------
  // op = { op: 'theme', set: { accent?, mode?, radius?, font?, density?, icons?, motion?, surface? } }
  //      { op: 'preset', id }                         a named look
  //      { op: 'platform', platform: 'ios'|'android' }
  //      { op: 'kit', kit }                           add a kit's screens ("add a settings screen")
  //      { op: 'screen.add', name } { op: 'screen.remove', screen } { op: 'screen.rename', screen, name } { op: 'screen.move', screen, to }
  //      { op: 'block.add', screen, type, at? }  { op: 'block.remove', block }  { op: 'block.move', block, dir: -1|1 }  { op: 'block.dup', block }
  //      { op: 'text', block, path, value }          { op: 'icon', block, path, value }  { op: 'illus', block, path, value }
  //      { op: 'link', block, path, to, how }        { op: 'unlink', block, path }
  //      { op: 'item.add'|'item.remove'|'item.dup'|'item.up'|'item.down', block, path }   path = "items.2"
  //      { op: 'tabbar', screen }                    add a tab bar (every top-level screen becomes a tab)
  //      { op: 'rename', name }
  function apply(doc, op) {
    doc = normalize(doc); const say = s => ({ doc: normalize(doc), say: s });
    if (!op || typeof op !== 'object') return say('');
    const O = op.op;
    if (O === 'theme') { const s = op.set || {}; doc.theme = normTheme(Object.assign({}, doc.theme, s, { preset: '' })); return say('Updated the look.'); }
    if (O === 'preset') { const pr = PRESETS.find(x => x.id === op.id); if (!pr) return say('That look is not in the list.'); doc.theme = normTheme(Object.assign({}, pr.theme, { preset: pr.id })); return say(`Switched to the ${pr.name} look.`); }
    if (O === 'platform') { doc.platform = op.platform === 'android' ? 'android' : 'ios'; return say(doc.platform === 'android' ? 'Using the Android look.' : 'Using the iPhone look.'); }
    if (O === 'rename') { doc.name = str(op.name, 48) || doc.name; return say(`Renamed the app to ${doc.name}.`); }
    if (O === 'kit') { const r = kit(doc, op.kit); if (!r.added.length) return say('That kit is not in the library.'); return { doc: r.doc, say: `Added ${(KITS[op.kit] || {}).title || 'the screens'}.`, added: r.added }; }
    if (O === 'screen.add') { let id = slug(op.name || 'Screen'); while (findScreen(doc, id)) id += '-2'; doc.screens.push({ id, name: str(op.name || 'New screen', 40), icon: 'star', blocks: [{ type: 'nav', props: { title: str(op.name || 'New screen', 40), back: true, action: '' } }, { type: 'empty', props: clone(D.DEFAULTS.empty) }] }); return { ...say(`Added the ${op.name || 'new'} screen.`), added: [id] }; }
    if (O === 'screen.remove') { if (doc.screens.length < 2) return say('An app needs at least one screen.'); doc.screens = doc.screens.filter(s => s.id !== op.screen); for (const s of doc.screens) for (const bk of s.blocks) { for (const [k, l] of Object.entries(bk.links)) if (l.to === op.screen) delete bk.links[k]; if (bk.type === 'tabs') { const keep = []; bk.props.items.forEach((it, i) => { const l = bk.links['items.' + i]; if (!(l === undefined && Object.keys(bk.links).length && false)) keep.push(it); }); } } return say('Removed the screen.'); }
    if (O === 'screen.rename') { const s = findScreen(doc, op.screen); if (s) s.name = str(op.name, 40) || s.name; return say('Renamed the screen.'); }
    if (O === 'screen.move') { const i = doc.screens.findIndex(s => s.id === op.screen); const j = Math.max(0, Math.min(doc.screens.length - 1, op.to | 0)); if (i >= 0) { const [s] = doc.screens.splice(i, 1); doc.screens.splice(j, 0, s); } return say('Moved the screen.'); }
    if (O === 'tabbar') { const tops = doc.screens.filter(s => s.tab || !s.blocks.some(b => b.type === 'nav' && b.props.back)).slice(0, 5); if (doc.screens.some(s => s.blocks.some(b => b.type === 'tabs'))) return say('The app already has a tab bar.'); const items = tops.map(s => ({ label: s.name, icon: s.icon || 'star' })), links = {}; tops.forEach((s, i) => { links['items.' + i] = { to: s.id, how: 'fade' }; }); tops.forEach((s, i) => { s.tab = true; s.blocks.push({ type: 'tabs', props: { items: clone(items), on: i }, links: clone(links) }); }); return say(`Added a tab bar with ${tops.length} tabs.`); }
    const f = op.block ? findBlock(doc, op.block) : null;
    if (O === 'block.add') { const s = findScreen(doc, op.screen) || doc.screens[0]; if (!BLOCKS[op.type]) return say('That component is not in the library.'); const nb = { type: op.type, props: clone(D.DEFAULTS[op.type] || {}), links: {} }; if (op.type === 'tabs') return apply(doc, { op: 'tabbar' }); const at = op.at == null ? s.blocks.filter(b => b.type !== 'tabs').length : op.at | 0; s.blocks.splice(at, 0, nb); const r = normalize(doc); const ns = findScreen(r, s.id); return { doc: r, say: `Added ${BLOCKS[op.type].label.toLowerCase()}.`, block: ns.blocks[at] && ns.blocks[at].id }; }
    if (!f) return say('');
    const bk = f.block, sc = f.screen;
    if (O === 'block.remove') { sc.blocks = sc.blocks.filter(x => x !== bk); return say('Removed it.'); }
    if (O === 'block.move') { const i = sc.blocks.indexOf(bk), j = i + (op.dir < 0 ? -1 : 1); if (j >= 0 && j < sc.blocks.length) { sc.blocks[i] = sc.blocks[j]; sc.blocks[j] = bk; } return say('Moved it.'); }
    if (O === 'block.dup') { const c = clone(bk); delete c.id; sc.blocks.splice(sc.blocks.indexOf(bk) + 1, 0, c); return say('Duplicated it.'); }
    if (O === 'text') { setPath(bk.props, op.path, str(op.value, 600)); return say('Changed the words.'); }
    if (O === 'icon') { if (!D.ICONS[op.value]) return say('That icon is not in the set.'); setPath(bk.props, op.path, op.value); return say('Changed the icon.'); }
    if (O === 'illus') { if (!ILL[op.value]) return say('That picture is not in the set.'); setPath(bk.props, op.path, op.value); return say('Changed the picture.'); }
    if (O === 'link') { if (!findScreen(doc, op.to)) return say('That screen does not exist.'); bk.links[str(op.path, 40)] = { to: op.to, how: ['push', 'sheet', 'fade', 'morph'].includes(op.how) ? op.how : 'push' }; return say(`Linked to ${findScreen(doc, op.to).name}.`); }
    if (O === 'unlink') { delete bk.links[str(op.path, 40)]; return say('Removed the link.'); }
    if (/^item\./.test(O)) {
      const m = /^(\w+)\.(\d+)/.exec(op.path || ''); if (!m) return say(''); const arr = bk.props[m[1]]; if (!Array.isArray(arr)) return say(''); const i = +m[2];
      const shift = (from, d) => { const nl = {}; for (const [k, l] of Object.entries(bk.links)) { const mm = new RegExp('^' + m[1] + '\\.(\\d+)$').exec(k); if (!mm) { nl[k] = l; continue; } let n = +mm[1]; if (d === 'del' && n === from) continue; if (d === 'del' && n > from) n--; else if (d === 'ins' && n >= from) n++; nl[m[1] + '.' + n] = l; } bk.links = nl; };
      if (O === 'item.remove') { if (arr.length <= 1) return say('Keep at least one.'); arr.splice(i, 1); shift(i, 'del'); return say('Removed it.'); }
      if (O === 'item.add' || O === 'item.dup') { arr.splice(i + 1, 0, clone(arr[i] != null ? arr[i] : arr[arr.length - 1])); shift(i + 1, 'ins'); return say(O === 'item.add' ? 'Added one more.' : 'Duplicated it.'); }
      if (O === 'item.up' || O === 'item.down') { const j = i + (O === 'item.up' ? -1 : 1); if (j < 0 || j >= arr.length) return say(''); [arr[i], arr[j]] = [arr[j], arr[i]]; const a = bk.links[m[1] + '.' + i], b = bk.links[m[1] + '.' + j]; delete bk.links[m[1] + '.' + i]; delete bk.links[m[1] + '.' + j]; if (a) bk.links[m[1] + '.' + j] = a; if (b) bk.links[m[1] + '.' + i] = b; return say('Moved it.'); }
    }
    return say('');
  }

  // ---------- exports ----------
  const iconSvg = doc => { const k = palette(doc.theme), r = { sharp: 18, soft: 96, round: 120, pill: 256 }[normTheme(doc.theme).radius]; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${r}" fill="${k.accent}"/><text x="256" y="330" text-anchor="middle" font-family="system-ui,sans-serif" font-size="260" font-weight="700" fill="${k.on}">${esc(String(doc.name || 'A').trim().slice(0, 1).toUpperCase())}</text></svg>`; };
  function pwa(doc, opts) {
    doc = normalize(doc); const o = opts || {}, k = palette(doc.theme), f = FONTS[doc.theme.font];
    const screens = doc.screens.map(s => screenHTML(doc, s, { edit: false })).join('\n');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(doc.name)}</title>
<meta name="theme-color" content="${k.bg}"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon.svg"><link rel="apple-touch-icon" href="icon.svg">
<style>${css(doc, { scope: '.ax', fontBase: 'fonts/' })}
html,body{margin:0;height:100%;background:${k.bg}}.ax{position:fixed;inset:0;overflow:hidden}.ax .ax-status{display:none}@supports(padding:env(safe-area-inset-top)){.ax .ax-screen{padding-top:env(safe-area-inset-top)}.ax .ax-tabs{padding-bottom:max(10px,env(safe-area-inset-bottom))}}@media(min-width:600px){body{display:grid;place-items:center}.ax{position:relative;inset:auto;width:390px;height:844px;border-radius:44px;border:1px solid ${k.line}}.ax .ax-status{display:flex}}</style></head>
<body><main class="ax" id="app" ${attrs(doc)}>
${screens}
</main><script src="app.js"></script></body></html>
`;
    const app = `// ${doc.name}: made with TribeCode's App Creator. Plain JavaScript, no build step.\n'use strict';\nvar AxRun = ${RUNTIME};\nAxRun(document.getElementById('app'), { start: ${JSON.stringify(doc.start)} });\ntry { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* a sandboxed preview has no service worker */ }\n`;
    const files = ['index.html', 'app.js', 'manifest.webmanifest', 'icon.svg'].concat(f.files.map(x => 'fonts/' + x + '.woff2'));
    const sw = `// Offline: keep the app's own files.\nvar C = 'app-${slug(doc.name)}-${Date.now().toString(36)}';\nself.addEventListener('install', function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(${JSON.stringify(files.map(x => './' + x))}); })); self.skipWaiting(); });\nself.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); })); })); });\nself.addEventListener('fetch', function (e) { e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); })); });\n`;
    const manifest = JSON.stringify({ name: doc.name, short_name: doc.name.slice(0, 12), start_url: '.', display: 'standalone', background_color: k.bg, theme_color: k.bg, icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] }, null, 2);
    const readme = `# ${doc.name}\n\nA phone web app made with TribeCode's App Creator: ${doc.screens.length} screens, plain HTML and JavaScript, works offline.\n\n- Open \`index.html\` through any web server (or the project's live preview) and, on a phone, use Add to Home Screen.\n- Screens: ${doc.screens.map(s => s.name).join(', ')}.\n- Fonts: ${f.display ? `${f.display}${f.body && f.body !== f.display ? ' and ' + f.body : ''}, under the SIL Open Font License (see fonts/)` : 'the phone\'s own'}.\n- Anything that takes payments or signs people in is a design here: build it for real before you ship.\n`;
    const out = [['index.html', html], ['app.js', app], ['sw.js', sw], ['manifest.webmanifest', manifest], ['icon.svg', iconSvg(doc)], ['README.md', readme]];
    if (o.fonts) for (const x of f.files) out.push(['fonts/' + x + '.woff2', o.fonts(x)]);
    return out;
  }
  const FEATHER = { home: 'home', search: 'search', plus: 'plus', user: 'user', users: 'users', settings: 'settings', heart: 'heart', chat: 'message-circle', bell: 'bell', cart: 'shopping-cart', calendar: 'calendar', chart: 'bar-chart-2', check: 'check', play: 'play', pause: 'pause', star: 'star', book: 'book', pin: 'map-pin', clock: 'clock', flame: 'zap', leaf: 'feather', dumbbell: 'activity', wallet: 'credit-card', music: 'music', image: 'image', back: 'chevron-left', chevron: 'chevron-right', more: 'more-horizontal', close: 'x', lock: 'lock', mail: 'mail', gift: 'gift', list: 'list', grid: 'grid', sun: 'sun', moon: 'moon', bookmark: 'bookmark', share: 'share', filter: 'filter', camera: 'camera', trophy: 'award', game: 'play-circle', edit: 'edit-2', trash: 'trash-2', send: 'send', mic: 'mic', globe: 'globe', coffee: 'coffee', food: 'coffee', target: 'target', tag: 'tag', bolt: 'zap', sparkle: 'star', note: 'file-text', plane: 'navigation', house: 'home', ticket: 'tag', soup: 'coffee', fish: 'anchor', mountain: 'triangle', car: 'truck', wave: 'wind' };
  function expo(doc) {
    doc = normalize(doc);
    // parts from appcreator-parts.js have no native code: the export draws each as the plainer part it names, same words
    if (PARTS && PARTS.basic) for (const s of doc.screens) s.blocks = s.blocks.map(bk => { if (!PARTS.BLOCKS[bk.type]) return bk; const r = PARTS.basic(bk.type, bk.props); return r ? { ...bk, type: r.type, props: Object.assign(clone(D.DEFAULTS[r.type] || {}), r.props) } : bk; });
    const k = palette(doc.theme), t = normTheme(doc.theme), [rc, rs, rb] = RADII[t.radius], [g, pd] = DENS[t.density];
    const sl = slug(doc.name) || 'app';
    const pkg = JSON.stringify({ name: sl, version: '1.0.0', main: 'node_modules/expo/AppEntry.js', private: true, scripts: { start: 'expo start', android: 'expo start --android', ios: 'expo start --ios', web: 'expo start --web' }, dependencies: { expo: '~52.0.0', 'expo-status-bar': '~2.0.0', '@expo/vector-icons': '^14.0.0', react: '18.3.1', 'react-native': '0.76.5' } }, null, 2);
    const appJson = JSON.stringify({ expo: { name: doc.name, slug: sl, version: '1.0.0', orientation: 'portrait', userInterfaceStyle: t.mode === 'dark' ? 'dark' : 'light', backgroundColor: k.bg, ios: { supportsTablet: false }, android: {} } }, null, 2);
    const design = JSON.stringify({ name: doc.name, start: doc.start, theme: { ...k, radius: rc, radiusSmall: rs, radiusButton: Math.min(rb, 28), gap: g, pad: pd, dark: t.mode === 'dark' }, icons: FEATHER, screens: doc.screens }, null, 1);
    const app = `// ${doc.name}: drawn from design.json (TribeCode's App Creator). Every screen, link and tab comes from that file,
// so a new design can replace it. Built on React Native's own pieces and Expo's icon set; no navigation library.
import React, { useRef, useState } from 'react';
import { Animated, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import D from './design.json';
const T = D.theme;
const Icon = ({ name, size = 20, color = T.ink }) => <Feather name={D.icons[name] || 'circle'} size={size} color={color} />;

function Block({ b, go, back }) {
  const p = b.props || {}, link = k => (b.links || {})[k], tap = k => () => { const l = link(k); if (l) go(l.to, l.how); };
  const [on, setOn] = useState(p.on || 0), [pick, setPick] = useState(p.pick || 0);
  switch (b.type) {
    case 'nav': return <View style={s.nav}>{p.back ? <Pressable onPress={back} style={s.navb}><Icon name="back" color={T.accent} /></Pressable> : <View style={s.navb} />}<Text style={s.navt} numberOfLines={1}>{p.title}</Text><View style={s.navb} /></View>;
    case 'header': return <View>{p.eyebrow ? <Text style={s.eyebrow}>{p.eyebrow}</Text> : null}<Text style={s.h1}>{p.title}</Text>{p.sub ? <Text style={s.sub}>{p.sub}</Text> : null}</View>;
    case 'list': case 'settings': case 'checklist': return <View>{p.title ? <Text style={s.h2}>{p.title}</Text> : null}<View style={s.list}>{(p.items || []).map((it, i) => <Row key={i} it={it} kind={b.type} onPress={link('items.' + i) ? tap('items.' + i) : null} />)}</View></View>;
    case 'cards': case 'grid': return <View>{p.title ? <Text style={s.h2}>{p.title}</Text> : null}<View style={s.grid}>{(p.items || []).map((it, i) => <Pressable key={i} style={s.gi} onPress={tap('items.' + i)}><View style={s.art} /><Text style={s.b}>{it.title}</Text><Text style={s.small}>{it.sub || it.price || ''}</Text></Pressable>)}</View></View>;
    case 'card': return <Pressable style={s.card} onPress={tap('')}><View style={s.art} /><View style={{ padding: T.pad }}><Text style={s.eyebrow}>{p.meta}</Text><Text style={s.h2}>{p.title}</Text><Text style={s.sub}>{p.sub}</Text>{p.button ? <Pressable style={[s.btn, { alignSelf: 'flex-start', marginTop: 10 }]} onPress={tap('button')}><Text style={s.btnt}>{p.button}</Text></Pressable> : null}</View></Pressable>;
    case 'form': return <View style={{ gap: T.gap }}>{(p.fields || []).map((f, i) => <View key={i}><Text style={s.label}>{f.label}</Text><TextInput style={s.input} placeholder={f.placeholder} placeholderTextColor={T.muted} /></View>)}{p.button ? <Pressable style={s.btn} onPress={tap('button')}><Text style={s.btnt}>{p.button}</Text></Pressable> : null}</View>;
    case 'search': return <View style={{ gap: 10 }}>{p.placeholder ? <TextInput style={s.input} placeholder={p.placeholder} placeholderTextColor={T.muted} /> : null}<ScrollView horizontal showsHorizontalScrollIndicator={false}>{(p.chips || []).map((c, i) => <Pressable key={i} onPress={() => setOn(i)} style={[s.chip, i === on && s.chipOn]}><Text style={i === on ? { color: T.bg } : s.text}>{c}</Text></Pressable>)}</ScrollView></View>;
    case 'chat': return <View style={{ gap: 6 }}>{(p.messages || []).map((m, i) => <View key={i} style={[s.msg, m.who === 'me' ? s.me : s.them]}><Text style={m.who === 'me' ? { color: T.on } : s.text}>{m.text}</Text></View>)}<TextInput style={[s.input, { marginTop: 8, borderRadius: 999 }]} placeholder={p.placeholder} placeholderTextColor={T.muted} /></View>;
    case 'feed': return <Pressable onPress={tap('')} style={{ gap: 8 }}><Text style={s.b}>{p.author} <Text style={s.small}>{p.time}</Text></Text><Text style={s.text}>{p.text}</Text><View style={[s.art, { aspectRatio: 4 / 3 }]} /><Text style={s.small}>{p.likes} likes · {p.comments} comments</Text></Pressable>;
    case 'profile': return <View style={{ alignItems: 'center', gap: 4 }}><View style={s.avatar}><Text style={[s.h1, { color: T.accent }]}>{String(p.name || '?').slice(0, 1)}</Text></View><Text style={s.h1}>{p.name}</Text><Text style={s.sub}>{p.handle}</Text>{p.bio ? <Text style={s.sub}>{p.bio}</Text> : null}<View style={{ flexDirection: 'row', gap: 28, marginVertical: 12 }}>{(p.stats || []).map((x, i) => <View key={i} style={{ alignItems: 'center' }}><Text style={s.b}>{x.n}</Text><Text style={s.small}>{x.label}</Text></View>)}</View></View>;
    case 'onboarding': { const pg = (p.pages || [])[on] || {}; return <View style={{ gap: 12, alignItems: 'center' }}><View style={[s.art, { width: '100%' }]} /><Text style={s.h1}>{pg.title}</Text><Text style={[s.sub, { textAlign: 'center' }]}>{pg.text}</Text><Pressable style={[s.btn, { alignSelf: 'stretch' }]} onPress={() => (on < (p.pages || []).length - 1 ? setOn(on + 1) : tap('button')())}><Text style={s.btnt}>{p.button}</Text></Pressable></View>; }
    case 'signin': return <View style={{ gap: 12 }}><Text style={s.h1}>{p.title}</Text><Text style={s.sub}>{p.sub}</Text><TextInput style={s.input} placeholder={p.email} placeholderTextColor={T.muted} /><TextInput style={s.input} placeholder={p.password} secureTextEntry placeholderTextColor={T.muted} /><Pressable style={s.btn} onPress={tap('button')}><Text style={s.btnt}>{p.button}</Text></Pressable>{p.alt ? <Pressable onPress={tap('alt')}><Text style={[s.b, { color: T.accent, textAlign: 'center', padding: 12 }]}>{p.alt}</Text></Pressable> : null}</View>;
    case 'empty': return <View style={{ alignItems: 'center', gap: 8, paddingVertical: 40 }}><Icon name={p.icon} size={40} color={T.accent} /><Text style={s.h1}>{p.title}</Text><Text style={[s.sub, { textAlign: 'center' }]}>{p.text}</Text>{p.button ? <Pressable style={[s.btn, { marginTop: 12 }]} onPress={tap('button')}><Text style={s.btnt}>{p.button}</Text></Pressable> : null}</View>;
    case 'paywall': return <View style={{ gap: 12 }}><Text style={s.h1}>{p.title}</Text><Text style={s.sub}>{p.sub}</Text>{(p.features || []).map((f, i) => <Text key={i} style={s.text}>✓  {f}</Text>)}{(p.plans || []).map((pl, i) => <Pressable key={i} onPress={() => setPick(i)} style={[s.plan, i === pick && { borderColor: T.accent, backgroundColor: T.soft }]}><Text style={s.b}>{pl.name}</Text><Text style={s.text}>{pl.price} {pl.per}</Text></Pressable>)}<Pressable style={s.btn} onPress={tap('button')}><Text style={s.btnt}>{p.button}</Text></Pressable><Text style={[s.small, { textAlign: 'center' }]}>Payments are not connected: this is a design.</Text></View>;
    case 'chart': case 'stats': return <View style={s.card}><View style={{ padding: T.pad }}><Text style={s.eyebrow}>{p.title || ''}</Text>{p.big ? <Text style={s.h1}>{p.big}</Text> : null}<View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90, marginTop: 8 }}>{(p.values || []).map((v, i, a) => <View key={i} style={{ flex: 1, height: (90 * v) / Math.max(...a), backgroundColor: i === a.length - 1 ? T.accent : T.soft, borderRadius: 4 }} />)}</View>{(p.tiles || []).map((x, i) => <Text key={i} style={s.text}>{x.n}  {x.label}</Text>)}</View></View>;
    case 'player': case 'timer': return <View style={{ alignItems: 'center', gap: 6 }}><View style={[s.art, { width: 220, aspectRatio: 1 }]} /><Text style={s.h1}>{p.title || p.time}</Text><Text style={s.sub}>{p.artist || p.label}</Text>{p.button ? <Pressable style={[s.btn, { alignSelf: 'stretch' }]} onPress={tap('button')}><Text style={s.btnt}>{p.button}</Text></Pressable> : null}</View>;
    case 'calendar': return <View>{p.title ? <Text style={s.h2}>{p.title}</Text> : null}<ScrollView horizontal>{(p.days || []).map((d, i) => <Pressable key={i} onPress={() => setOn(i)} style={[s.chip, i === on && s.chipOn]}><Text style={i === on ? { color: T.bg } : s.text}>{d}</Text></Pressable>)}</ScrollView><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{(p.slots || []).map((x, i) => <Pressable key={i} onPress={() => setPick(i)} style={[s.chip, i === pick && s.chipOn]}><Text style={i === pick ? { color: T.bg } : s.text}>{x}</Text></Pressable>)}</View></View>;
    case 'button': return <Pressable style={[s.btn, p.style === 'secondary' && { backgroundColor: T.surface2 }]} onPress={tap('')}><Text style={[s.btnt, p.style === 'secondary' && { color: T.ink }]}>{p.label}</Text></Pressable>;
    case 'text': return <Text style={[s.text, { lineHeight: 24 }]}>{p.text}</Text>;
    case 'image': return <View style={[s.art, { aspectRatio: 16 / 11 }]} />;
    case 'map': return <View style={[s.art, { aspectRatio: 2 }]}><Text style={[s.small, { position: 'absolute', left: 10, bottom: 10 }]}>{p.label}</Text></View>;
    default: return null;
  }
}
function Row({ it, kind, onPress }) {
  const [v, setV] = useState(kind === 'settings' ? !!it.on : !!it.done);
  return <Pressable style={s.row} onPress={kind === 'checklist' ? () => setV(!v) : onPress}>
    {kind === 'checklist' ? <View style={[s.check, v && { backgroundColor: T.accent, borderColor: T.accent }]}>{v ? <Icon name="check" size={14} color={T.on} /> : null}</View> : it.icon ? <View style={s.ib}><Icon name={it.icon} color={T.accent} /></View> : null}
    <View style={{ flex: 1 }}><Text style={[s.b, kind === 'checklist' && v && { color: T.muted, textDecorationLine: 'line-through' }]}>{it.title || it.label}</Text>{it.sub ? <Text style={s.small}>{it.sub}</Text> : null}</View>
    {kind === 'settings' && it.kind === 'toggle' ? <Switch value={v} onValueChange={setV} trackColor={{ true: T.accent }} /> : <Text style={s.small}>{it.meta || it.value || ''}</Text>}
    {onPress ? <Icon name="chevron" size={16} color={T.muted} /> : null}
  </Pressable>;
}
function Screen({ sc, go, back }) {
  const bar = sc.blocks.filter(b => b.type === 'tabs')[0], top = sc.blocks.filter(b => b.type === 'nav'), body = sc.blocks.filter(b => b.type !== 'tabs' && b.type !== 'nav');
  return <View style={{ flex: 1, backgroundColor: T.bg }}>
    {top.map(b => <Block key={b.id} b={b} go={go} back={back} />)}
    <ScrollView contentContainerStyle={{ padding: T.pad, gap: 18 }}>{body.map(b => <Block key={b.id} b={b} go={go} back={back} />)}</ScrollView>
    {bar ? <View style={s.tabs}>{bar.props.items.map((it, i) => { const l = (bar.links || {})['items.' + i], on = i === (bar.props.on || 0); return <Pressable key={i} style={s.tab} onPress={() => l && go(l.to, 'fade')}><Icon name={it.icon} color={on ? T.accent : T.muted} /><Text style={{ fontSize: 11, color: on ? T.accent : T.muted }}>{it.label}</Text></Pressable>; })}</View> : null}
  </View>;
}
export default function App() {
  const [stack, setStack] = useState([D.start]), x = useRef(new Animated.Value(0)).current;
  const cur = D.screens.find(sc => sc.id === stack[stack.length - 1]) || D.screens[0];
  const run = (how, after) => { x.setValue(how === 'fade' ? 0.01 : 1); after(); Animated.timing(x, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); };
  const go = (to, how) => run(how, () => setStack(how === 'fade' ? [to] : [...stack, to]));
  const back = () => stack.length > 1 && run('fade', () => setStack(stack.slice(0, -1)));
  const style = { flex: 1, opacity: x.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }), transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }) }] };
  return <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }}><StatusBar style={T.dark ? 'light' : 'dark'} /><Animated.View style={style}><Screen sc={cur} go={go} back={back} /></Animated.View></SafeAreaView>;
}
const s = StyleSheet.create({
  text: { color: T.ink, fontSize: 15 }, b: { color: T.ink, fontSize: 15, fontWeight: '600' }, small: { color: T.muted, fontSize: 13 },
  h1: { color: T.ink, fontSize: 28, fontWeight: '700' }, h2: { color: T.ink, fontSize: 17, fontWeight: '700', marginBottom: 8 }, sub: { color: T.muted, fontSize: 15, marginTop: 4 },
  eyebrow: { color: T.accent, fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  nav: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }, navb: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, navt: { flex: 1, textAlign: 'center', color: T.ink, fontSize: 17, fontWeight: '600' },
  list: { backgroundColor: T.surface, borderColor: T.line, borderWidth: 1, borderRadius: T.radius, overflow: 'hidden' }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: T.pad, minHeight: 52, borderBottomColor: T.line, borderBottomWidth: StyleSheet.hairlineWidth },
  ib: { width: 36, height: 36, borderRadius: T.radiusSmall, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' }, check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: T.gap }, gi: { width: '47%', gap: 2 }, art: { backgroundColor: T.soft, borderRadius: T.radius, aspectRatio: 1.5, marginBottom: 6 },
  card: { backgroundColor: T.surface, borderColor: T.line, borderWidth: 1, borderRadius: T.radius, overflow: 'hidden' },
  btn: { minHeight: 48, borderRadius: T.radiusButton, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 }, btnt: { color: T.on, fontSize: 16, fontWeight: '600' },
  label: { color: T.muted, fontSize: 13, fontWeight: '600', marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderColor: T.line, backgroundColor: T.surface, color: T.ink, borderRadius: T.radiusSmall, paddingHorizontal: 14, fontSize: 16 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: T.line, justifyContent: 'center', marginRight: 8 }, chipOn: { backgroundColor: T.ink, borderColor: T.ink },
  msg: { maxWidth: '78%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 }, me: { alignSelf: 'flex-end', backgroundColor: T.accent }, them: { alignSelf: 'flex-start', backgroundColor: T.surface2 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: T.soft, alignItems: 'center', justifyContent: 'center' }, plan: { padding: 16, borderRadius: T.radius, borderWidth: 1.5, borderColor: T.line, backgroundColor: T.surface },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.line, paddingTop: 6, paddingBottom: 4, backgroundColor: T.bg }, tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 44, justifyContent: 'center' },
});
`;
    const readme = `# ${doc.name} (Expo)\n\nMade with TribeCode's App Creator. \`design.json\` holds the screens, links and theme; \`App.js\` draws them with React Native's own pieces.\n\n1. \`npm install\` (or the phone app card's Install dependencies, on the host computer)\n2. \`npx expo start\`, then scan the QR code with Expo Go on your phone.\n\nSign-in, data and payments are designs here. Ask your AI helper to build them for real; nothing joins the main copy until a person says yes.\n`;
    return [['package.json', pkg], ['app.json', appJson], ['design.json', design], ['App.js', app], ['README.md', readme], ['.gitignore', 'node_modules/\n.expo/\ndist/\n']];
  }

  // ---------- the brief for the AI helpers ----------
  function entities(doc) {
    const out = [];
    for (const s of doc.screens) for (const bk of s.blocks) {
      const items = (bk.props && (bk.props.items || bk.props.fields || bk.props.messages || bk.props.plans)) || null;
      if (!Array.isArray(items) || !items.length || ['tabs', 'settings', 'search'].includes(bk.type)) continue;
      const name = (bk.type === 'chat' ? 'Message' : bk.type === 'form' ? s.name.replace(/^New\s+/i, '') : bk.props.title || s.name).replace(/s$/i, '');
      const fields = Object.keys(items[0]).filter(k => !['icon', 'illus'].includes(k));
      if (!out.some(e => e.name.toLowerCase() === name.toLowerCase())) out.push({ name: name || 'Item', fields, from: s.name });
    }
    return out.slice(0, 12);
  }
  function brief(doc) {
    doc = normalize(doc); const t = doc.theme, f = FONTS[t.font];
    const flows = []; for (const s of doc.screens) for (const bk of s.blocks) for (const [k, l] of Object.entries(bk.links)) { const to = findScreen(doc, l.to); flows.push(`- ${s.name} › ${BLOCKS[bk.type].label}${k ? ` (${k})` : ''} → ${to ? to.name : l.to} (${l.how})`); }
    const ents = entities(doc);
    return [`# Build “${doc.name}” for real`, '', `The tribe designed this ${doc.platform === 'android' ? 'Android' : 'iPhone'} app in TribeCode's App Creator (${doc.screens.length} screens). Build it as a working app in the project's phone app stack (Expo by default), keeping the screens, flows and look. Sign-in, saved data and payments are only drawn in the design: build them properly, and ask a person before choosing a payment or account provider. Nothing joins the main copy until a person says yes.`, '',
      '## Look', `- Accent ${t.accent}, ${t.mode} mode, ${t.radius} corners, ${t.density} spacing, ${t.motion} motion, ${f.name} type.`, '',
      '## Screens', ...doc.screens.map(s => `- **${s.name}**${s.id === doc.start ? ' (first screen)' : ''}${s.tab ? ' (a tab)' : ''}: ${s.blocks.map(b => BLOCKS[b.type].label.toLowerCase()).join(', ')}`), '',
      '## Flows', ...(flows.length ? flows : ['- (no links yet)']), '',
      '## Data to store (a first guess from the screens)', ...(ents.length ? ents.map(e => `- ${e.name}: ${e.fields.join(', ')} (seen on ${e.from})`) : ['- (none spotted)']), '',
      'The full design is `design.json` from **Export › Expo project** (same screens, links and theme as JSON).'].join('\n');
  }
  function outline(doc) {
    doc = normalize(doc);
    return `${doc.name} (${doc.platform}, ${doc.theme.mode}, ${doc.screens.length} screens)\n` + doc.screens.map(s => `  ${s.id === doc.start ? '>' : ' '} ${s.name}: ${s.blocks.map(b => b.type + (Object.keys(b.links).length ? `[${Object.values(b.links).map(l => '→' + l.to).join(',')}]` : '')).join(' ')}`).join('\n');
  }

  return { attrs, vars, baseCSS, allFonts, normalize, template, templateList, blank, kit, addTab, apply, css, screenHTML, blockHTML, pwa, expo, brief, outline, entities, illus, icon, palette, normTheme, findScreen, findBlock, getPath,
    AxRun, PRESETS, FONTS, BLOCKS, BLOCK_TYPES, GROUPS, TEMPLATES, KITS, COLORS, RADII, DENS, MOTION, ILL_NAMES, ICON_NAMES: D.ICON_NAMES, RUNTIME, contrast, version: 1 };
});
