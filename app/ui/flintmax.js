// Flint, maxed out with no AI (feat/flint-max): the design intelligence, copy helpers and editor moves that run on rules,
// small tables and a little math, offline and instantly, in the browser and in Node (tests). docs/FLINT-RESEARCH.md says
// why each piece is rules and what a model would add on top.
//   Color   palette({ mood | color, mode }) -> { name, mode, light, dark, colors, swatches, fixes }   OKLCH, WCAG auto-fix
//           contrast(a, b), fixContrast(colors) -> { colors, fixes }, moodOf(text)
//   Type    fontsFor(mood) -> { pair, display, body, why }
//   Style   STYLES[style] -> { mood, pair, radius, space, preset? }   ("more professional / elegant / brutalist")
//   Copy    headlines(facts, n), ctas(kind), readability(text), titleCase(s), sentenceCase(s), tone(text, tone)
//   Sheets  sheet.{ col, aggregate, sort, currency, total, chart, chartSpec }   on a grid of strings (row 0 = header)
//   Docs    doc.{ toc, checklist, caps, summary }   on Markdown
//   Slides  pitch(text, { n, name, members }) -> deck Markdown
//   Canvas  recipe(kind, at, nid) -> nodes; recolor(nodes, palette) -> [{ id, patch }]
//   Site    site(cfg, step, at, S) -> { cfg?, say, chips? } | undefined   (the website designer's new moves; S = TribeSiteCfg)
//   DEMOS   the "Try it" demos on Flint's page (pure, no side effects)
// Shared: window.TribeFlintMax in the browser, require() in Node.
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintMax = api; })(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cap = s => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- color: sRGB <-> OKLab/OKLCH (Björn Ottosson's matrices), WCAG 2 contrast ----------
  const hexRgb = h => { h = String(h || '').replace('#', '').trim(); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return isNaN(n) ? [0, 0, 0] : [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgbHex = a => '#' + a.map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const delin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  function toOklch(hex) {
    const [r, g, b] = hexRgb(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
  }
  function oklchRgb(L, C, H) {
    const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3), m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3), s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  // in gamut: lower the chroma until it fits sRGB (keeps lightness and hue, so contrast stays predictable)
  function oklch(L, C, H) { let c = C; for (let i = 0; i < 24; i++) { const v = oklchRgb(L, c, H); if (v.every(x => x >= -0.0005 && x <= 1.0005)) return rgbHex(v.map(delin)); c *= 0.85; } return rgbHex(oklchRgb(L, 0, H).map(delin)); }
  const relLum = hex => { const [r, g, b] = hexRgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100; };
  // move a color's OKLCH lightness away from the background until it reaches the ratio
  function reach(fg, bg, ratio) {
    if (contrast(fg, bg) >= ratio) return fg;
    const o = toOklch(fg), dark = relLum(bg) < 0.18;
    for (let L = o.l, i = 0; i < 60; i++) { L = dark ? Math.min(1, L + 0.02) : Math.max(0, L - 0.02); const c = oklch(L, o.c, o.h); if (contrast(c, bg) >= ratio) return c; }
    return dark ? '#FFFFFF' : '#000000';
  }
  // WCAG 2 targets: body text 4.5:1 (AA), large text and UI parts 3:1 (docs/FLINT-RESEARCH.md › Contrast)
  const TARGET = { ink: 7, muted: 4.5, accent: 4.5, line: 1.2 };
  function fixContrast(k) {
    const out = { ...k }, fixes = [];
    for (const key of ['ink', 'muted', 'accent']) {
      if (!out[key]) continue; const was = out[key], r0 = contrast(was, out.bg), now = reach(was, out.bg, TARGET[key]);
      if (now !== was) { out[key] = now; fixes.push({ key, from: was, to: now, before: r0, after: contrast(now, out.bg) }); }
    }
    out.on = contrast('#FFFFFF', out.accent) >= contrast('#111111', out.accent) ? '#FFFFFF' : '#111111';
    if (contrast(out.on, out.accent) < 4.5) { const was = out.accent; out.accent = reach(out.accent, out.on, 4.5); if (contrast(out.accent, out.bg) >= 3) fixes.push({ key: 'button', from: was, to: out.accent, before: contrast(out.on, was), after: contrast(out.on, out.accent) }); else out.accent = was; }
    return { colors: out, fixes };
  }
  function audit(k) {
    const rows = [['Text', 'ink', 4.5], ['Muted text', 'muted', 4.5], ['Links and accent', 'accent', 3]];
    return rows.map(([label, key, need]) => ({ label, key, ratio: contrast(k[key], k.bg), need, ok: contrast(k[key], k.bg) >= need }));
  }

  // ---------- moods: a hue, a chroma, a default mode, a type pairing and a shape ----------
  // h/c are OKLCH hue (degrees) and chroma; a2 = the second accent's hue offset (analogous ±30, complementary 180)
  const MOODS = {
    autumn: { w: 'autumn|fall|harvest|pumpkin|maple|warm autumn|cozy autumn', h: 48, c: 0.14, a2: -30, pair: 'classic', r: 10 },
    coffee: { w: 'coffee|cafe|coffee shop|espresso|mocha|bakery|cozy coffee', h: 55, c: 0.07, a2: 30, pair: 'book', r: 12 },
    warm: { w: 'warm|earthy warm|toasty|cosy|cozy', h: 55, c: 0.11, a2: 30, pair: 'book', r: 12 },
    sunset: { w: 'sunset|dusk|golden hour|sunrise', h: 32, c: 0.17, a2: -45, pair: 'classic', r: 12 },
    ocean: { w: 'ocean|sea|beach|nautical|coastal|marine|waves|water|aqua', h: 232, c: 0.12, a2: -40, pair: 'modern', r: 10 },
    forest: { w: 'forest|woodland|woods|nature|leafy|green nature|botanical|plants', h: 150, c: 0.11, a2: 40, pair: 'classic', r: 8 },
    earthy: { w: 'earthy|earth|terracotta|clay|rustic|natural', h: 60, c: 0.08, a2: 80, pair: 'book', r: 6 },
    desert: { w: 'desert|sand|sandy|dune|southwest', h: 68, c: 0.09, a2: 160, pair: 'modern', r: 6 },
    pastel: { w: 'pastel|soft|baby|gentle|dreamy', h: 310, c: 0.07, a2: 80, pair: 'loud', r: 18 },
    candy: { w: 'candy|sweet|bubblegum|sugar', h: 350, c: 0.16, a2: 60, pair: 'loud', r: 18 },
    spring: { w: 'spring|fresh|blossom|garden', h: 135, c: 0.13, a2: 200, pair: 'loud', r: 14 },
    summer: { w: 'summer|sunny|tropical|citrus|lemon', h: 88, c: 0.15, a2: 190, pair: 'loud', r: 14 },
    winter: { w: 'winter|icy|ice|frost|snow|cold', h: 238, c: 0.05, a2: 30, pair: 'plain', r: 6 },
    nordic: { w: 'nordic|scandinavian|scandi|hygge', h: 220, c: 0.04, a2: 160, pair: 'plain', r: 4 },
    lavender: { w: 'lavender|lilac|violet|purple', h: 300, c: 0.11, a2: -40, pair: 'editorial', r: 12 },
    berry: { w: 'berry|wine|plum|cherry', h: 355, c: 0.14, a2: -40, pair: 'editorial', r: 8 },
    mint: { w: 'mint|minty|seafoam|fresh mint', h: 168, c: 0.10, a2: 60, pair: 'modern', r: 12 },
    neon: { w: 'neon|cyberpunk|synthwave|vaporwave|rave|electric', h: 330, c: 0.26, a2: -130, pair: 'modern', r: 4, dark: true },
    midnight: { w: 'midnight|night|nocturnal|moody|dark and moody|space|galaxy', h: 275, c: 0.12, a2: -60, pair: 'modern', r: 8, dark: true },
    luxury: { w: 'luxury|luxurious|premium|gold|golden|elegant dark|high end|upscale', h: 85, c: 0.10, a2: 0, pair: 'editorial', r: 0, dark: true },
    corporate: { w: 'corporate|business|professional|trustworthy|bank|finance|serious', h: 255, c: 0.13, a2: 180, pair: 'plain', r: 6 },
    tech: { w: 'tech|techy|startup|saas|developer|software|futuristic', h: 265, c: 0.18, a2: -90, pair: 'modern', r: 8 },
    playful: { w: 'playful|fun|kids|bright|happy|cheerful|colorful|colourful', h: 25, c: 0.19, a2: 140, pair: 'loud', r: 18 },
    calm: { w: 'calm|zen|peaceful|wellness|spa|yoga|serene|relaxing', h: 195, c: 0.06, a2: 60, pair: 'classic', r: 14 },
    retro: { w: 'retro|vintage|70s|seventies|old school|groovy', h: 62, c: 0.14, a2: 150, pair: 'loud', r: 10 },
    brutalist: { w: 'brutalist|brutal|brutalism|raw|anti design', h: 105, c: 0.19, a2: 0, pair: 'modern', r: 0, brutal: true },
    mono: { w: 'monochrome|mono|black and white|grayscale|greyscale|noir', h: 0, c: 0, a2: 0, pair: 'plain', r: 0 },
    romantic: { w: 'romantic|wedding|love|blush|rose', h: 12, c: 0.08, a2: 50, pair: 'editorial', r: 12 },
    gaming: { w: 'gaming|game|arcade|esports|pixel', h: 145, c: 0.22, a2: -150, pair: 'pixel', r: 2, dark: true },
  };
  const MOOD_RX = Object.entries(MOODS).map(([k, m]) => [k, new RegExp(`\\b(?:${m.w})\\b`, 'i')]);
  function moodOf(text) { const t = String(text || '').toLowerCase(); for (const [k, rx] of MOOD_RX) if (rx.test(t)) return k; return ''; }
  const NAMED = { red: '#E5484D', orange: '#F26B1D', amber: '#F2B33D', yellow: '#F5D90A', gold: '#D4A017', green: '#3BD16F', teal: '#38C6B1', blue: '#3B82F6', navy: '#1E3A8A', indigo: '#6C7CFF', purple: '#8B5CF6', violet: '#A58BFF', pink: '#FF6F8E', coral: '#FF7F6B', brown: '#8B5E3C', black: '#111111', mint: '#3EE6B0', cyan: '#22C3E6', lime: '#84CC16', magenta: '#E040FB', crimson: '#DC143C' };
  // the palette: light and dark variants of one hue, both checked against WCAG and fixed if they miss
  function palette(o = {}) {
    let mood = o.mood && MOODS[o.mood] ? o.mood : moodOf(o.mood || o.text || ''), m = MOODS[mood];
    let h, c, name;
    const seed = o.color ? (/^#/.test(o.color) ? o.color : NAMED[String(o.color).toLowerCase()]) : '';
    if (seed) { const k = toOklch(seed); h = k.h; c = Math.max(0.04, k.c); name = `From ${seed.toUpperCase()}`; m = m || { a2: 30, pair: 'modern', r: 10 }; mood = mood || 'custom'; }
    else if (m) { h = m.h; c = m.c; name = cap(mood); }
    else { m = MOODS.tech; mood = 'tech'; h = m.h; c = m.c; name = 'Tech'; }
    const tint = Math.min(0.02, c * 0.12), h2 = (h + (m.a2 || 30) + 360) % 360;
    let light, dark;
    if (m.brutal) {
      light = { bg: '#FFFFFF', card: '#F2F2F2', ink: '#000000', muted: '#333333', line: '#000000', accent: oklch(0.88, 0.19, h) };
      dark = { bg: '#000000', card: '#111111', ink: '#FFFFFF', muted: '#CCCCCC', line: '#FFFFFF', accent: oklch(0.9, 0.19, h) };
      light.accent2 = '#000000'; dark.accent2 = '#FFFFFF';
    } else {
      light = { bg: oklch(0.975, tint, h), card: oklch(0.995, tint * 0.5, h), ink: oklch(0.24, Math.min(0.03, c * 0.25), h), muted: oklch(0.47, Math.min(0.03, c * 0.2), h), line: oklch(0.89, tint, h), accent: oklch(0.55, c, h), accent2: oklch(0.6, c * 0.8, h2) };
      dark = { bg: oklch(0.17, Math.min(0.02, c * 0.15), h), card: oklch(0.22, Math.min(0.025, c * 0.18), h), ink: oklch(0.95, Math.min(0.015, c * 0.1), h), muted: oklch(0.74, Math.min(0.03, c * 0.2), h), line: oklch(0.31, Math.min(0.02, c * 0.15), h), accent: oklch(0.74, c, h), accent2: oklch(0.72, c * 0.8, h2) };
      if (mood === 'luxury') { light.accent = oklch(0.5, 0.1, 80); dark.accent = oklch(0.8, 0.11, 85); }
    }
    const L = fixContrast(light), D = fixContrast(dark), mode = o.mode || (m.dark ? 'dark' : 'light');
    const colors = mode === 'dark' ? D.colors : L.colors;
    return { name, mood, mode, light: L.colors, dark: D.colors, colors, fixes: (mode === 'dark' ? D.fixes : L.fixes), radius: m.r, pair: m.pair, swatches: ['bg', 'card', 'ink', 'muted', 'accent', 'accent2'].map(k => ({ key: k, hex: colors[k] })), audit: audit(colors) };
  }
  const swatchHtml = p => `<div class="fm-sw" role="img" aria-label="${esc(p.name)} palette">${p.swatches.map(s => `<span class="fm-chip" style="background:${esc(s.hex)}" title="${esc(s.key)} ${esc(s.hex)}"></span>`).join('')}<small>${esc(p.name)} · ${p.mode} · text ${contrast(p.colors.ink, p.colors.bg)}:1</small></div>`;

  // ---------- type pairing (the OFL families the website designer ships; docs/FLINT-RESEARCH.md › Type) ----------
  const PAIRS = {
    classic: { display: 'Fraunces', body: 'Inter', why: 'a warm serif for headings over a quiet sans: classic contrast, easy to read' },
    editorial: { display: 'Instrument Serif', body: 'Inter', why: 'a high-contrast display serif reads elegant and expensive; Inter keeps the body plain' },
    modern: { display: 'Space Grotesk', body: 'Inter', why: 'a geometric grotesk with character for headings, the same family feel in the body' },
    loud: { display: 'Bricolage Grotesque', body: 'Inter', why: 'a chunky, friendly display face; one loud voice, one calm one' },
    plain: { display: 'Inter', body: 'Inter', why: 'one neutral family in two weights: trustworthy, nothing to distract' },
    code: { display: 'JetBrains Mono', body: 'JetBrains Mono', why: 'a monospace for the developer look' },
    pixel: { display: 'Silkscreen', body: 'Inter', why: 'a pixel font for headings only (it is hard to read in long text), Inter for the rest' },
    book: { display: 'Fraunces', body: 'System serif', why: 'serif all the way down: bookish, warm, made for reading' },
  };
  const FONT_MOOD = [['editorial', 'elegant|luxur|classy|sophisticat|fashion|high end|upscale|premium|refined|magazine|editorial|wedding|romantic'], ['loud', 'friendly|playful|fun|bubbly|kids|bold|loud|punchy|casual|happy|cheerful|quirky'],
    ['code', 'code|coder|developer|hacker|terminal|techy dev|programmer|monospace'], ['pixel', 'retro game|8 bit|8-bit|pixel|arcade|gaming'], ['modern', 'modern|tech|startup|saas|futuristic|clean modern|geometric|app'],
    ['plain', 'minimal|clean|corporate|professional|business|neutral|simple|swiss|serious|trust'], ['book', 'bookish|literary|cozy|cosy|warm|blog|writer|author|cafe|bakery'], ['classic', 'classic|timeless|traditional|serif|heritage|calm|natural']];
  function fontsFor(text) {
    const t = String(text || '').toLowerCase(); let pair = '';
    for (const [k, w] of FONT_MOOD) if (new RegExp(`\\b(?:${w})`).test(t)) { pair = k; break; }
    if (!pair) { const m = MOODS[moodOf(t)]; pair = m ? m.pair : 'modern'; }
    return { pair, ...PAIRS[pair] };
  }

  // ---------- style transforms: "make this more professional" ----------
  const STYLES = {
    professional: { w: 'professional|corporate|businesslike|business|serious|trustworthy|polished|grown up|grown-up|formal', mood: 'corporate', pair: 'plain', r: 6, space: 'normal' },
    elegant: { w: 'elegant|classy|sophisticated|refined|fancy|chic', mood: 'luxury', pair: 'editorial', r: 2, space: 'roomy', light: true },
    friendly: { w: 'friendly|approachable|warm|welcoming|human|cozy|cosy', mood: 'warm', pair: 'loud', r: 16, space: 'normal' },
    brutalist: { w: 'brutalist|brutal|brutalism|raw|anti design', mood: 'brutalist', pair: 'modern', r: 0, space: 'compact' },
    techy: { w: 'techy|tech|futuristic|high tech|hi tech|startupy|startup', mood: 'tech', pair: 'modern', r: 8, space: 'normal' },
    luxury: { w: 'luxury|luxurious|premium|high end|upscale|expensive', mood: 'luxury', pair: 'editorial', r: 0, space: 'roomy' },
    retro: { w: 'retro|vintage|old school|groovy', mood: 'retro', pair: 'loud', r: 10, space: 'normal' },
    calm: { w: 'calm|zen|peaceful|serene|relaxed|airy', mood: 'calm', pair: 'classic', r: 14, space: 'roomy' },
    modern: { w: 'modern|fresh|contemporary|sleek', mood: 'tech', pair: 'modern', r: 10, space: 'normal' },
  };
  const styleOf = t => { t = String(t || '').toLowerCase(); for (const [k, s] of Object.entries(STYLES)) if (new RegExp(`\\b(?:${s.w})\\b`).test(t)) return k; return ''; };

  // ---------- copy: headlines, calls to action, readability, case, tone (word lists; an AI writes better, this is instant) ----------
  const CTAS = {
    saas: ['Start free', 'Get started', 'See it in action', 'Book a demo'], cafe: ['See the menu', 'Book a table', 'Order ahead', 'Find us'], merch: ['Shop now', 'See the collection', 'Get yours'],
    band: ['Get tickets', 'Listen now', 'See tour dates'], portfolio: ['See my work', 'Let’s talk', 'Hire me'], service: ['Get a quote', 'Book now', 'Call us today'], wedding: ['RSVP', 'See the details'],
    podcast: ['Listen now', 'Subscribe', 'Latest episode'], blog: ['Read the latest', 'Subscribe'], nonprofit: ['Donate', 'Volunteer', 'Get involved'], creator: ['Watch now', 'Follow along', 'Join the community'],
    gamepage: ['Wishlist now', 'Watch the trailer', 'Play the demo'], comingsoon: ['Join the waitlist', 'Get early access'], resume: ['Download my CV', 'Get in touch'], photography: ['See the gallery', 'Book a shoot'],
    linkbio: ['Say hi', 'See everything'], default: ['Get started', 'Learn more', 'Get in touch'],
  };
  function ctas(kind) { return (CTAS[kind] || CTAS.default).slice(); }
  const BEN = { saas: 'work that runs itself', cafe: 'good coffee, made slowly', merch: 'made in small batches', band: 'loud nights and new songs', portfolio: 'design that works', service: 'done right the first time',
    wedding: 'we’re getting married', podcast: 'conversations worth your commute', blog: 'stories and notes', nonprofit: 'help that reaches people', creator: 'new every week', gamepage: 'a small game with a big heart',
    comingsoon: 'something new is coming', resume: 'a maker who ships', photography: 'light, caught', default: 'made with care' };
  // facts: { name, what (noun phrase), kind, audience, benefit }
  function headlines(f = {}, n = 5) {
    const name = String(f.name || '').trim() || 'Your project', what = String(f.what || '').trim(), kind = f.kind || 'default', ben = String(f.benefit || BEN[kind] || BEN.default).replace(/[.!]+$/, ''), aud = String(f.audience || '').trim();
    const w = what || ({ cafe: 'coffee', merch: 'goods', band: 'music', portfolio: 'work', service: 'service', podcast: 'episodes', blog: 'writing', saas: 'software' }[kind] || 'things');
    const out = [`${cap(ben)}.`, `${name}: ${ben}.`, `${cap(w)}, made for ${aud || 'people like you'}.`, `Meet ${name}.`, `The ${/^[aeiou]/i.test(w) ? 'easy' : 'simple'} way to get ${w}.`, `${cap(w)} you’ll actually love.`, `Less fuss. Better ${w}.`, `Everything ${aud || 'you'} need${aud ? '' : ''} for ${w}.`];
    const seen = new Set(); return out.filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n);
  }
  function syllables(word) {
    let w = String(word || '').toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1);
  }
  // Flesch Reading Ease: 206.835 − 1.015 × words/sentence − 84.6 × syllables/word; Flesch-Kincaid grade: 0.39 × w/s + 11.8 × syl/w − 15.59
  function readability(text) {
    const t = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/^#+\s.*$/gm, ' ').replace(/[#*_>`|[\]()-]/g, ' ').trim();
    const sentences = t.split(/(?<=[.!?])\s+|\n{2,}/).map(s => s.trim()).filter(s => /[a-z]/i.test(s)), words = t.match(/[A-Za-z’']+/g) || [];
    if (!words.length) return { score: 0, grade: 0, label: 'Nothing to read yet', words: 0, sentences: 0, tips: [] };
    const syl = words.reduce((a, w) => a + syllables(w), 0), S = Math.max(1, sentences.length), W = words.length;
    const score = Math.round(clamp(206.835 - 1.015 * (W / S) - 84.6 * (syl / W), 0, 100)), grade = Math.max(1, Math.round(0.39 * (W / S) + 11.8 * (syl / W) - 15.59));
    const label = score >= 90 ? 'Very easy' : score >= 80 ? 'Easy' : score >= 70 ? 'Fairly easy' : score >= 60 ? 'Plain English' : score >= 50 ? 'Fairly hard' : score >= 30 ? 'Hard' : 'Very hard';
    const long = sentences.filter(s => (s.match(/\S+/g) || []).length > 25), hard = [...new Set(words.filter(w => syllables(w) >= 4).map(w => w.toLowerCase()))].slice(0, 5), passive = sentences.filter(s => /\b(?:was|were|is|are|been|being|be)\s+\w+ed\b/i.test(s)).length;
    const tips = [];
    if (long.length) tips.push(`${long.length} sentence${long.length === 1 ? ' is' : 's are'} over 25 words: split ${long.length === 1 ? 'it' : 'them'}.`);
    if (hard.length) tips.push(`Long words to swap for short ones: ${hard.join(', ')}.`);
    if (passive) tips.push(`${passive} passive sentence${passive === 1 ? '' : 's'} (“was made”): say who did it.`);
    if (!tips.length) tips.push('Nothing to fix: short sentences, plain words.');
    return { score, grade, label, words: W, sentences: S, avg: Math.round(W / S * 10) / 10, tips };
  }
  const SMALL = new Set('a an the and but or nor for so yet as at by in of off on per to up via vs is with from into over'.split(' '));
  function titleCase(s) {
    const parts = String(s || '').trim().split(/(\s+)/); const words = parts.filter(p => /\S/.test(p)); let wi = 0;
    return parts.map(p => { if (!/\S/.test(p)) return p; const i = wi++, last = i === words.length - 1, low = p.toLowerCase(), prev = i ? words[i - 1] : '';
      if (/^[A-Z0-9]{2,}$/.test(p) || /[a-z][A-Z]/.test(p) || /[./@]/.test(p.slice(1))) return p;   // acronyms, iPhone, urls
      if (i && !last && SMALL.has(low.replace(/[^a-z]/g, '')) && !/[:—–-]$/.test(prev)) return low;
      return low.replace(/^([^a-z]*)([a-z])/, (m, a, b) => a + b.toUpperCase()).replace(/-([a-z])/g, (m, b) => '-' + b.toUpperCase()); }).join('');
  }
  function sentenceCase(s) {
    return String(s || '').replace(/(^|[.!?]\s+|\n\s*(?:[-*]\s+(?:\[[ x]\]\s+)?)?)([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bi\b(?=[\s,.!?'’]|$)/g, 'I').replace(/\bi'm\b/g, "I'm").replace(/\bi’m\b/g, 'I’m').replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|august|september|october|november|december)\b/g, w => cap(w));
  }
  const TONES = {
    friendly: [[/\bwe would like to inform you that\s+/gi, 'good news: '], [/\bwe regret to inform you that\s+/gi, 'sorry, '], [/^buy now\.?$/i, 'Grab yours today'], [/\bpurchase\b/gi, 'buy'], [/\butili[sz]e\b/gi, 'use'], [/\bassist\b/gi, 'help'], [/\bdo not\b/gi, "don't"], [/\bwe are\b/gi, "we're"], [/\bplease contact us\b/gi, 'say hi'], [/\bcustomers\b/gi, 'folks'], [/\bhello\b/gi, 'hey']],
    professional: [[/,?\s*sorry for the (?:trouble|hassle|mess)\b/gi, '. We apologize for the inconvenience'], [/\byou guys\b/gi, 'you'], [/\bhey\b/gi, 'hello'], [/\bfolks\b/gi, 'customers'], [/\bstuff\b/gi, 'work'], [/\bawesome\b/gi, 'excellent'], [/\bgonna\b/gi, 'going to'], [/\bkinda\b/gi, 'somewhat'], [/!+/g, '.'], [/\bdon't\b/gi, 'do not'], [/\bwe're\b/gi, 'we are']],
    playful: [[/\bgood\b/gi, 'great'], [/\bvery\s+/gi, 'super '], [/\bhello\b/gi, 'hey there'], [/\.\s*$/, '!']],
    confident: [[/\b(?:we think|we believe|maybe|perhaps|probably|might|try to|hopefully)\s+/gi, ''], [/\bcould\b/gi, 'will'], [/\b(this|it|that) help you\b/gi, '$1 helps you'], [/\bhelp you\b/gi, 'let you']],
  };
  function tone(text, t) { let s = String(text || ''); for (const [rx, to] of TONES[t] || []) s = s.replace(rx, to); return sentenceCase(s.replace(/\s{2,}/g, ' ').trim()); }

  // ---------- sheets: a grid of strings, row 0 the header ----------
  const L2I = s => [...String(s).toUpperCase()].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const I2L = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const isNum = v => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !/^=/.test(v) && !isNaN(Number(v.replace(/[$€£¥,%\s]/g, ''))));
  const toNum = v => Number(String(v).replace(/[$€£¥,%\s]/g, ''));
  const isTotal = row => /^\s*(?:total|totals|sum|grand total)\b/i.test(String(row[0] || ''));
  const width = g => g.reduce((a, r) => Math.max(a, r.length), 0);
  const dataRows = g => g.map((r, i) => i).filter(i => i > 0 && g[i].some(v => String(v || '').trim()) && !isTotal(g[i]));
  const numCols = g => { const rows = dataRows(g); const out = []; for (let c = 0; c < width(g); c++) { const vals = rows.map(r => g[r][c]).filter(v => String(v || '').trim()); if (vals.length && vals.every(v => isNum(v) || /^=/.test(v))) out.push(c); } return out; };
  const MONTHS = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?$/i;
  // which column: a letter ("column C"), a header name ("the price column", "by month"), the selection, else the last number column
  function col(g, ref, sel) {
    const head = (g[0] || []).map(h => String(h || '').toLowerCase().trim()), r = String(ref || '').toLowerCase().trim().replace(/^(?:the|a|my)\s+/, '').replace(/\s+column$/, '');
    if (r && /^[a-z]{1,2}$/.test(r) && !head.includes(r)) { const i = L2I(r); if (i < width(g)) return i; }
    if (r) { let i = head.findIndex(h => h === r); if (i < 0) i = head.findIndex(h => h && (h.includes(r) || r.includes(h))); if (i < 0) i = head.findIndex(h => h && h.replace(/s$/, '') === r.replace(/s$/, '')); if (i >= 0) return i; }
    const n = numCols(g);
    if (sel && Number.isFinite(sel.c) && sel.c < width(g) && n.includes(sel.c)) return sel.c; return n.length ? n[n.length - 1] : -1;
  }
  const fmt = (v, cur) => cur ? cur + (Math.round(v * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (Math.round(v * 100) / 100).toLocaleString('en-US');
  function aggregate(g, c, fn = 'sum') {
    const vals = dataRows(g).map(r => g[r][c]).filter(isNum).map(toNum); if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return { sum, average: sum / vals.length, min: Math.min(...vals), max: Math.max(...vals), count: vals.length }[fn] ?? sum;
  }
  function sort(g, c, dir) {
    const head = g[0], body = dataRows(g).map(i => g[i]), tail = g.filter((r, i) => i > 0 && isTotal(r));
    const key = v => { v = String(v || '').trim(); if (isNum(v)) return [0, toNum(v)]; const d = Date.parse(v); if (!isNaN(d) && /\d/.test(v)) return [0, d]; const mi = MONTHS.test(v) ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(v.slice(0, 3).toLowerCase()) : -1; return mi >= 0 ? [0, mi] : [1, v.toLowerCase()]; };
    body.sort((a, b) => { const x = key(a[c]), y = key(b[c]); const o = x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0); return dir === 'desc' ? -o : o; });
    return [head, ...body, ...tail];
  }
  function currency(g, c, sym = '$') { return g.map((r, i) => i === 0 || isTotal(r) && /^=/.test(r[c] || '') ? r.slice() : r.map((v, j) => j === c && isNum(v) ? (String(v).trim().endsWith('%') ? v : fmt(toNum(v), sym)) : v)); }
  function total(g) {
    const rows = dataRows(g); if (!rows.length) return null;
    const first = rows[0] + 1, last = rows[rows.length - 1] + 1, nc = numCols(g), w = width(g);
    const row = Array.from({ length: w }, (_, c) => c === 0 && !nc.includes(0) ? 'Total' : nc.includes(c) ? `=SUM(${I2L(c)}${first}:${I2L(c)}${last})` : '');
    const out = g.filter(r => !isTotal(r)).map(r => r.slice()); out.push(row); return { grid: out, cols: nc.map(I2L) };
  }
  // a chart lives in the sheet's Markdown as <!-- chart: bar x=A y=D title="…" --> under the table (sheet.js draws it)
  function chartSpec(g, want = {}) {
    const head = (g[0] || []).map(h => String(h || ''));
    const y = want.y ? col(g, want.y) : -1, nc = numCols(g), yc = y >= 0 && nc.includes(y) ? y : nc.find(c => c !== 0) ?? nc[0];
    let xc = want.x ? col(g, want.x) : -1; if (xc < 0 || xc === yc) xc = head.findIndex((h, i) => i !== yc && !nc.includes(i)); if (xc < 0) xc = 0;
    if (yc == null || yc < 0) return null;
    const type = /\bline\b/.test(want.type || '') ? 'line' : /\bpie\b/.test(want.type || '') ? 'bar' : 'bar';
    return { type, x: I2L(xc), y: I2L(yc), title: `${cap(head[yc] || 'Values')} by ${String(head[xc] || 'row').toLowerCase()}` };
  }
  const chartComment = s => `<!-- chart: ${s.type} x=${s.x} y=${s.y} title="${String(s.title).replace(/"/g, '')}" -->`;
  const readChart = post => { const m = /<!--\s*chart:\s*(bar|line)\s+x=([A-Z]+)\s+y=([A-Z]+)(?:\s+title="([^"]*)")?\s*-->/.exec(String(post || '')); return m ? { type: m[1], x: m[2], y: m[3], title: m[4] || '' } : null; };
  // the chart as flat SVG (1px lines, no gradients); values = [{ label, v }]
  function chartSvg(spec, values, w = 560, h = 220) {
    const max = Math.max(1, ...values.map(x => x.v)), n = Math.max(1, values.length), pad = 28, bw = (w - pad * 2) / n;
    const y = v => h - pad - (v / max) * (h - pad * 2);
    const bars = spec.type === 'line' ? `<polyline fill="none" stroke="var(--brand, currentColor)" stroke-width="2" points="${values.map((x, i) => `${(pad + bw * i + bw / 2).toFixed(1)},${y(x.v).toFixed(1)}`).join(' ')}"/>` + values.map((x, i) => `<circle cx="${(pad + bw * i + bw / 2).toFixed(1)}" cy="${y(x.v).toFixed(1)}" r="3" fill="var(--brand, currentColor)"/>`).join('')
      : values.map((x, i) => `<rect x="${(pad + bw * i + bw * 0.15).toFixed(1)}" y="${y(x.v).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(0, h - pad - y(x.v)).toFixed(1)}" rx="2" fill="var(--brand, currentColor)"><title>${esc(x.label)}: ${esc(fmt(x.v))}</title></rect>`).join('');
    const labels = values.map((x, i) => `<text x="${(pad + bw * i + bw / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">${esc(String(x.label).slice(0, 10))}</text>`).join('');
    return `<svg class="fm-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(spec.title)}"><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="currentColor" opacity=".3"/>${bars}${labels}<text x="${pad}" y="14" font-size="12" fill="currentColor">${esc(spec.title)} · max ${esc(fmt(max))}</text></svg>`;
  }

  // ---------- docs: Markdown ----------
  const slug = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
  function toc(md) {
    const lines = String(md || '').replace(/\n## Contents\n[\s\S]*?(?=\n#{1,3}\s|$)/, '\n').split('\n');
    const heads = []; let fence = false;
    lines.forEach((l, i) => { if (/^```/.test(l)) fence = !fence; const m = !fence && /^(#{2,3})\s+(.+?)\s*#*$/.exec(l); if (m && !/^contents$/i.test(m[2])) heads.push({ i, depth: m[1].length, text: m[2] }); });
    if (!heads.length) return null;
    const block = ['## Contents', '', ...heads.map(h => `${h.depth === 3 ? '  ' : ''}- [${h.text}](#${slug(h.text)})`), ''];
    const h1 = lines.findIndex(l => /^#\s/.test(l)); let at = h1 >= 0 ? h1 + 1 : 0; while (at < lines.length && at < heads[0].i && lines[at].trim() && !/^#/.test(lines[at])) at++;
    if (h1 >= 0) { at = h1 + 1; while (at < heads[0].i && !/^#{2,3}\s/.test(lines[at]) && (lines[at].trim() || at === h1 + 1)) at++; }
    const out = lines.slice(0, at).concat(at && lines[at - 1].trim() ? [''] : [], block, lines.slice(at)).join('\n').replace(/\n{3,}/g, '\n\n');
    return { md: out, n: heads.length };
  }
  function checklist(md) {
    const lines = String(md || '').split('\n'); let n = 0;
    const hasBullets = lines.some(l => /^\s*(?:[-*+]|\d+[.)])\s+(?!\[[ xX]\])\S/.test(l));
    const out = lines.map(l => {
      if (/^\s*[-*+]\s+\[[ xX]\]/.test(l)) return l;
      let m = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+)$/.exec(l); if (m) { n++; return `${m[1]}- [ ] ${m[2]}`; }
      if (!hasBullets && l.trim() && !/^#|^>|^```|^\|/.test(l.trim())) { n++; return `- [ ] ${l.trim()}`; }
      return l;
    });
    return n ? { md: out.join('\n'), n } : null;
  }
  function caps(md) {
    let n = 0; const lines = String(md || '').split('\n'); let fence = false;
    const out = lines.map(l => { if (/^```/.test(l)) { fence = !fence; return l; } if (fence || /^\|/.test(l)) return l; const m = /^(#{1,6}\s+)(.+)$/.exec(l); const v = m ? m[1] + titleCase(m[2]) : sentenceCase(l); if (v !== l) n++; return v; });
    return { md: out.join('\n'), n };
  }
  const LD = () => (typeof module === 'object' && module.exports ? require('./localdoc.js') : root && root.TribeLocalDoc);
  function summaryBlock(md) {
    const L = LD(); const s = L ? L.summarize(md, { max: 3 }) : { sentences: String(md).split(/(?<=[.!?])\s+/).slice(0, 2) };
    if (!s.sentences.length) return null;
    const quote = `> **TL;DR** ${s.sentences.join(' ')}`;
    let body = String(md || '').replace(/^> \*\*TL;DR\*\*.*(?:\n>.*)*\n*/m, '');
    const lines = body.split('\n'), h1 = lines.findIndex(l => /^#\s/.test(l));
    if (h1 >= 0) lines.splice(h1 + 1, 0, '', quote); else lines.unshift(quote, '');
    return { md: lines.join('\n').replace(/\n{3,}/g, '\n\n'), text: s.sentences.join(' ') };
  }

  // ---------- slides: a pitch from any text (extraction + templates; an AI writes it better) ----------
  const PITCH = [
    ['Problem', /\b(?:problem|pain|hard|struggle|frustrat|annoying|today|currently|without|can'?t|cannot|waste|slow|lonely|alone|messy|scattered)\b/i],
    ['What we’re building', /\b(?:we (?:build|make|help|are building|are making)|lets? (?:you|people|friends|teams)|so that|solution|our (?:app|tool|product|game)|is a|is an)\b/i],
    ['How it works', /\b(?:how|step|works|by |using|with|each|every|one click|in the browser)\b/i],
    ['Why now', /\b(?:now|growing|trend|market|million|everyone|more and more|finally|new)\b/i],
    ['The plan', /\b(?:plan|roadmap|next|milestone|launch|week|month|first|then|v1|mvp)\b/i],
    ['The ask', /\b(?:need|looking for|ask|help us|join|support|feedback|try it)\b/i],
  ];
  function pitch(text, o = {}) {
    const n = clamp(Math.round(o.n || 5), 3, 10), raw = String(text || '');
    const L = LD(), plain = L ? L.plain(raw) : raw.replace(/[#*_>`]/g, '');
    const sents = plain.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim().replace(/^[-*]\s+/, '')).filter(s => s.split(/\s+/).length >= 4).map(s => s.length > 110 ? s.slice(0, 107).replace(/\s+\S*$/, '') + '…' : s);
    const title = o.name || (/^#\s+(.+)$/m.exec(raw) || [])[1] || (sents[0] || 'Our project').split(/[:.–—-]/)[0].slice(0, 40);
    const top = L && sents.length ? L.summarize(raw, { max: 4 }).sentences : sents.slice(0, 4);
    const tagline = (top[0] || sents[0] || 'What we’re making, in one line.').replace(/\.$/, '');
    const used = new Set(), pick = (rx, k) => { const got = sents.filter(s => rx.test(s) && !used.has(s)).slice(0, k); got.forEach(s => used.add(s)); return got; };
    const slides = [`# ${title}\n\n${tagline}`];
    const want = n - 1;
    const order = want >= 6 ? PITCH : want === 5 ? PITCH.filter(p => p[0] !== 'Why now') : want === 4 ? PITCH.filter(p => !/Why now|How it works/.test(p[0])) : want === 3 ? PITCH.filter(p => /Problem|What we|The plan/.test(p[0])) : PITCH.filter(p => /Problem|What we/.test(p[0]));
    for (const [head, rx] of order.slice(0, want)) {
      let pts = pick(rx, 3); if (!pts.length) pts = top.filter(s => !used.has(s)).slice(0, 2); pts.forEach(s => used.add(s));
      if (head === 'The ask' && !pts.length) pts = ['Try it with us and tell us what breaks', 'Bring a friend'];
      slides.push(`## ${head}\n\n${(pts.length ? pts : ['(Add a line here)']).map(s => `- ${s.replace(/\.$/, '')}`).join('\n')}`);
    }
    while (slides.length < n) slides.push(slides.length === n - 1 && (o.members || []).length ? `## The team\n\n${o.members.slice(0, 5).map(m => `- ${m}`).join('\n')}` : `## Thank you\n\n${title} · questions?`);
    return `<!-- theme: campfire -->\n\n${slides.slice(0, n).join('\n\n---\n\n')}\n\nNotes: Made by Flint from ${o.from || 'your text'} with no AI: the strongest sentences, sorted into a pitch. Edit freely.\n`;
  }

  // ---------- canvas: component recipes (nodes for app/ui/canvas) and recolor ----------
  // at = { p, x, y, w } (inside the selected frame or the middle of the view); nid() -> a new id; th = a palette's colors
  function recipe(kind, at, nid, th) {
    const k = th || palette({ mood: 'tech' }).light, W = Math.max(320, at.w || 390), out = [];
    const N = (o) => { const n = Object.assign({ id: nid(), p: at.p || '', v: 1 }, o); if (n.stroke && !n.sw) n.sw = 1; out.push(n); return n; };
    const T = (p, x, y, w, c, s, wt, col, al) => N({ p, t: 'text', x, y, w, h: Math.round(s * 1.4), i: out.length, name: String(c).slice(0, 30), tx: { c, f: 'Inter', s, wt: wt || 400, lh: 1.4, al: al || 'left', col: col || k.ink }, sz: { h: 'fixed', v: 'hug' } });
    const box = (name, w, h, fill, r, extra) => N(Object.assign({ t: 'frame', x: at.x || 0, y: at.y || 0, w, h, fill, r: r || 0, clip: true, name, i: 0 }, extra || {}));
    const btn = (p, x, y, label, w = 120) => { const b = N({ p, t: 'frame', x, y, w, h: 40, fill: k.accent, r: 8, name: 'Button', i: out.length }); T(b.id, 12, 10, w - 24, label, 15, 600, k.on || '#FFFFFF', 'center'); return b; };
    if (kind === 'navbar') { const f = box('Navbar', W, 64, k.card, 0, { stroke: k.line }); T(f.id, 20, 20, 120, 'Brand', 18, 700); ['Home', 'Features', 'Pricing'].forEach((l, i) => T(f.id, W - 360 + i * 80, 22, 72, l, 14, 500, k.muted)); btn(f.id, W - 128, 12, 'Sign up', 108); }
    else if (kind === 'footer') { const f = box('Footer', W, 120, k.card, 0); T(f.id, 20, 24, 200, 'Brand', 16, 700); T(f.id, 20, 56, W - 40, '© ' + new Date().getFullYear() + ' Brand · Privacy · Terms', 13, 400, k.muted); }
    else if (kind === 'hero') { const f = box('Hero', W, 360, k.bg, 0); T(f.id, 24, 64, W - 48, 'A clear headline that says what you do', 32, 700); T(f.id, 24, 176, W - 48, 'One line on who it is for and why it helps.', 16, 400, k.muted); btn(f.id, 24, 240, 'Get started', 140); }
    else if (kind === 'form' || kind === 'login') { const f = box(kind === 'login' ? 'Log in' : 'Sign up form', 360, 340, k.card, 12, { stroke: k.line }); T(f.id, 24, 24, 312, kind === 'login' ? 'Welcome back' : 'Create your account', 22, 700); ['Email', 'Password'].forEach((l, i) => { T(f.id, 24, 76 + i * 76, 312, l, 13, 600, k.muted); N({ p: f.id, t: 'rect', x: 24, y: 98 + i * 76, w: 312, h: 40, fill: k.bg, r: 8, stroke: k.line, name: l + ' field', i: out.length }); }); btn(f.id, 24, 260, kind === 'login' ? 'Log in' : 'Sign up', 312); }
    else if (kind === 'cardgrid') { const f = box('Card grid', W, 420, k.bg, 0); const cw = Math.floor((W - 24 * 2 - 16 * 2) / 3); for (let i = 0; i < 6; i++) { const c = N({ p: f.id, t: 'frame', x: 24 + (i % 3) * (cw + 16), y: 24 + Math.floor(i / 3) * 196, w: cw, h: 180, fill: k.card, r: 12, stroke: k.line, clip: true, name: 'Card ' + (i + 1), i: out.length }); N({ p: c.id, t: 'rect', x: 0, y: 0, w: cw, h: 96, fill: k.line, name: 'Image', i: out.length }); T(c.id, 12, 108, cw - 24, 'Card title', 15, 600); T(c.id, 12, 136, cw - 24, 'A short line', 13, 400, k.muted); } }
    else if (kind === 'pricing') { const f = box('Pricing', W, 380, k.bg, 0); const cw = Math.floor((W - 48 - 32) / 3); ['Free', 'Pro', 'Team'].forEach((nm, i) => { const hot = i === 1; const c = N({ p: f.id, t: 'frame', x: 24 + i * (cw + 16), y: 24, w: cw, h: 320, fill: k.card, r: 12, stroke: hot ? k.accent : k.line, sw: hot ? 2 : 1, clip: true, name: nm + ' plan', i: out.length }); T(c.id, 16, 20, cw - 32, nm, 16, 600); T(c.id, 16, 52, cw - 32, ['$0', '$12', '$29'][i], 28, 700); T(c.id, 16, 108, cw - 32, '• Everything you need\n• Friendly support', 13, 400, k.muted); btn(c.id, 16, 260, hot ? 'Start trial' : 'Choose', cw - 32); }); }
    else if (kind === 'sidebar') { const f = box('Sidebar', 240, 640, k.card, 0, { stroke: k.line }); T(f.id, 20, 20, 200, 'Brand', 18, 700); ['Home', 'Projects', 'Tasks', 'Files', 'Settings'].forEach((l, i) => T(f.id, 20, 76 + i * 40, 200, l, 14, i ? 400 : 600, i ? k.muted : k.ink)); }
    else if (kind === 'tabbar') { const f = box('Tab bar', Math.min(W, 390), 72, k.card, 0, { stroke: k.line }); const tw = Math.min(W, 390) / 4; ['Home', 'Search', 'Inbox', 'Profile'].forEach((l, i) => T(f.id, i * tw, 26, tw, l, 12, i ? 400 : 600, i ? k.muted : k.accent, 'center')); }
    else if (kind === 'modal') { const f = box('Dialog', 400, 220, k.card, 14, { stroke: k.line }); T(f.id, 24, 24, 352, 'Are you sure?', 20, 700); T(f.id, 24, 64, 352, 'This can’t be undone.', 14, 400, k.muted); btn(f.id, 256, 156, 'Confirm', 120); }
    else return null;
    return out;
  }
  // "turn these into a card grid": each selected layer becomes a card in 3 columns, 16px gaps
  function gridOf(nodes, cols = 3, gap = 16) { const x0 = Math.min(...nodes.map(n => n.x || 0)), y0 = Math.min(...nodes.map(n => n.y || 0)), cw = Math.max(...nodes.map(n => n.w || 100)), ch = Math.max(...nodes.map(n => n.h || 100)); return nodes.map((n, i) => ({ id: n.id, patch: { x: x0 + (i % cols) * (cw + gap), y: y0 + Math.floor(i / cols) * (ch + gap), w: cw, h: ch, r: n.r || 12 } })); }
  // recolor by role: light or dark surfaces -> bg/card, text -> ink/muted, saturated fills -> accent
  function recolor(nodes, k) {
    const sat = h => { const o = toOklch(h); return o.c; };
    return nodes.map(n => {
      const p = {};
      if (n.t === 'text' && n.tx) { const ip = n.tx.col || '#000000'; p.tx = Object.assign({}, n.tx, { col: sat(ip) > 0.08 ? k.accent : relLum(ip) > 0.25 && relLum(k.bg) > 0.5 || relLum(ip) < 0.25 && relLum(k.bg) < 0.5 ? k.muted : k.ink }); }
      else if (n.fill && /^#/.test(n.fill)) p.fill = sat(n.fill) > 0.08 ? k.accent : n.p ? k.card : k.bg;
      if (n.stroke && /^#/.test(n.stroke)) p.stroke = sat(n.stroke) > 0.08 ? k.accent : k.line;
      return Object.keys(p).length ? { id: n.id, patch: p } : null;
    }).filter(Boolean);
  }

  // ---------- the website designer: Flint's new moves (S = TribeSiteCfg; every one returns a new cfg, one Undo) ----------
  const clone = o => JSON.parse(JSON.stringify(o));
  function applyPalette(c, P, S) {
    c = clone(c); const base = P.mode === 'dark' && c.theme.mode === 'dark' ? 'dark' : 'light', main = base === 'dark' ? P.dark : P.light, other = base === 'dark' ? P.light : P.dark;
    const pick = k => ({ bg: k.bg, card: k.card, ink: k.ink, muted: k.muted, line: k.line, accent: k.accent });
    c.theme.colors = pick(main); c.theme.base = base; c.theme.alt = { [base === 'dark' ? 'light' : 'dark']: pick(other) };
    if (P.mode === 'dark') c.theme.mode = 'dark';
    return S.normalize(c);
  }
  function siteFacts(c) {
    const pg = c.pages[0] || { blocks: [] }, hero = pg.blocks.find(b => b.type === 'hero') || pg.blocks.find(b => b.type === 'links');
    const text = hero ? [hero.props.title, hero.props.text, hero.props.name, hero.props.bio].filter(Boolean).join('. ') : '';
    const kind = Object.keys(CTAS).find(k => k === c.template) || (/menu|coffee|bake|cafe|food/i.test(text) ? 'cafe' : /shop|store|buy/i.test(text) ? 'merch' : /app|software|team|work/i.test(text) ? 'saas' : 'default');
    const what = (/\b(?:sell|make|bake|brew|build|design|write|shoot|play)\s+([a-z ]{3,30}?)(?:[.,]|\s+(?:for|in|with|that)\b|$)/i.exec(text) || [])[1] || '';
    return { name: c.name, what, kind, text, hero };
  }
  const ALLBLOCKS = c => c.pages.flatMap(p => p.blocks.map(b => ({ p, b })));
  function site(c, s, at, S) {
    const sl = s.slots || {}, id = s.intent; at = at || {};
    const pg = c.pages.find(p => p.id === at.page) || c.pages[0], sel = at.sel || {}, selBlock = sel.block && pg.blocks.find(b => b.id === sel.block);
    if (id === 'site.palette') {
      const P = palette({ mood: sl.mood, color: sl.color && (sl.color.hex || sl.color), mode: sl.mode || (MOODS[sl.mood] && MOODS[sl.mood].dark ? 'dark' : c.theme.mode) });
      const cfg = applyPalette(c, P, S);
      return { cfg, say: `${P.name} palette on: ${P.swatches.slice(0, 5).map(x => x.hex).join(' · ')}. Text contrast ${contrast(P.colors.ink, P.colors.bg)}:1${P.fixes.length ? `, and I fixed ${P.fixes.length} color${P.fixes.length === 1 ? '' : 's'} that missed WCAG` : ' (passes WCAG AA)'}. Dark mode has its own matching variant.`, html: swatchHtml(P), chips: [`Pick fonts for ${P.mood === 'custom' ? 'it' : P.mood}`, 'Check the contrast', 'Dark mode'] };
    }
    if (id === 'site.fontpair') { const F = fontsFor(sl.mood || s.text); return { cfg: S.normalize(Object.assign(clone(c), { theme: Object.assign(clone(c.theme), { fonts: { display: F.display, body: F.body } }) })), say: `${F.display} for headings, ${F.body} for text: ${F.why}.`, chips: ['Another pairing', 'Make it more professional'] }; }
    if (id === 'site.style') {
      const st = STYLES[sl.style] || STYLES.professional, P = palette({ mood: st.mood, mode: st.light ? 'light' : (MOODS[st.mood] && MOODS[st.mood].dark ? 'dark' : c.theme.mode) }), F = PAIRS[st.pair];
      let cfg = applyPalette(c, st.light ? Object.assign({}, P, { mode: 'light' }) : P, S); cfg = clone(cfg); cfg.theme.fonts = { display: F.display, body: F.body }; cfg.theme.radius = st.r; cfg.theme.space = st.space;
      return { cfg: S.normalize(cfg), say: `Made it ${sl.style || 'professional'}: the ${P.name.toLowerCase()} palette, ${F.display} headings, ${st.r ? st.r + 'px' : 'square'} corners, ${st.space} spacing. One Undo takes it all back.`, html: swatchHtml(P), chips: ['Make it more playful', 'Make it more minimal', 'Undo'] };
    }
    if (id === 'site.contrast') {
      const k = S.colors(c), F = fixContrast(k), before = audit(k);
      if (!F.fixes.length) return { say: `It passes: ${before.map(r => `${r.label.toLowerCase()} ${r.ratio}:1`).join(', ')} (WCAG AA wants 4.5:1 for text, 3:1 for big text and buttons).` };
      const cfg = clone(c), mode = cfg.theme.mode, put = { ink: F.colors.ink, muted: F.colors.muted, accent: F.colors.accent };
      if (mode === cfg.theme.base) Object.assign(cfg.theme.colors, put); else { cfg.theme.alt = cfg.theme.alt || {}; cfg.theme.alt[mode] = Object.assign({}, k, put); }
      return { cfg: S.normalize(cfg), say: `Fixed ${F.fixes.length}: ${F.fixes.map(f => `${f.key} ${f.before}:1 → ${f.after}:1`).join(', ')}. Everything passes WCAG AA now.` };
    }
    if (id === 'site.tidy') {
      // a spacing rhythm (one step for every section), one alignment per page, and the theme's own radius back on every section
      const cfg = clone(c); let n = 0; const page = cfg.pages.find(p => p.id === pg.id) || cfg.pages[0];
      const al = (page.blocks.find(b => b.type === 'hero') || {}).style && (page.blocks.find(b => b.type === 'hero').style.al) || '';
      page.blocks.forEach(b => { if (b.style) { if (b.style.pad) { delete b.style.pad; n++; } if (b.style.al && b.style.al !== al && b.type !== 'hero') { delete b.style.al; n++; } if (b.style.sz) { delete b.style.sz; n++; } if (!Object.keys(b.style).length) delete b.style; } });
      if (cfg.theme.space !== 'normal') { cfg.theme.space = 'normal'; n++; }
      const r = cfg.theme.radius, snap = [0, 4, 8, 12, 16, 24].reduce((a, v) => Math.abs(v - r) < Math.abs(a - r) ? v : a, 8); if (snap !== r) { cfg.theme.radius = snap; n++; }
      return { cfg: S.normalize(cfg), say: n ? `Tidied ${pg.title}: one spacing rhythm for every section (the 8px grid), one alignment, corners snapped to ${snap}px (${n} fix${n === 1 ? '' : 'es'}).` : `${pg.title} is already tidy: one spacing rhythm, one alignment, even corners.` };
    }
    if (id === 'site.headlines' || id === 'site.cta') {
      const f = siteFacts(c);
      if (id === 'site.cta') { const list = ctas(f.kind); return { say: `Buttons that work best start with a verb and say what happens next. For ${f.kind === 'default' ? 'this site' : 'a ' + f.kind + ' site'}: ${list.map(x => `“${x}”`).join(', ')}. Tap one to use it.`, acts: list.map(x => ({ label: x, act: 'ask', arg: `the button should say ${x}` })) }; }
      const list = headlines(f, 4); return { say: `Headline ideas from what the site says (no AI, from templates): ${list.map(x => `“${x}”`).join(' ')} Tap one to use it.`, acts: list.map(x => ({ label: x.length > 34 ? x.slice(0, 33) + '…' : x, act: 'ask', arg: `change the headline to ${x}` })) };
    }
    if (id === 'site.readability') {
      const txt = pg.blocks.map(b => Object.values(b.props || {}).filter(v => typeof v === 'string' && !/^(?:data:|https?:|#)/.test(v)).concat((b.props.items || []).flatMap(x => [x.title, x.text, x.q, x.a, x.quote].filter(Boolean))).join('. ')).join('\n');
      const R = readability(txt); return { say: `${pg.title} reads as “${R.label}” (Flesch ${R.score}/100, about grade ${R.grade}): ${R.words} words, ${R.avg} per sentence. ${R.tips.join(' ')}` };
    }
    if (id === 'site.titlecase') {
      const cfg = clone(c); let n = 0;
      cfg.pages.forEach(p => p.blocks.forEach(b => { ['title', 'name'].forEach(k => { if (typeof b.props[k] === 'string' && b.type !== 'text') { const v = titleCase(b.props[k]); if (v !== b.props[k]) { b.props[k] = v; n++; } } }); (b.props.items || []).forEach(x => { if (x && typeof x.title === 'string') { const v = titleCase(x.title); if (v !== x.title) { x.title = v; n++; } } }); }));
      return n ? { cfg: S.normalize(cfg), say: `Title Case on ${n} heading${n === 1 ? '' : 's'} (small words like “and”, “of”, “the” stay small).` } : { say: 'The headings are already in Title Case.' };
    }
    if (id === 'site.price.plans') {
      const n = clamp(sl.n || 3, 1, 5), NAMES = [['Free'], ['Basic', 'Pro'], ['Starter', 'Pro', 'Team'], ['Free', 'Starter', 'Pro', 'Business'], ['Free', 'Starter', 'Pro', 'Team', 'Enterprise']][n - 1], PR = { Free: '$0', Basic: '$5', Starter: '$9', Pro: '$19', Team: '$49', Business: '$99', Enterprise: 'Let’s talk' };
      let cfg = c, b = ALLBLOCKS(c).find(x => x.b.type === 'pricing' && x.p.id === pg.id); if (!b) { const r = S.addBlock(c, pg.id, 'pricing'); cfg = r.cfg; b = { p: cfg.pages.find(p => p.id === pg.id), b: r.block }; }
      cfg = clone(cfg); const blk = cfg.pages.find(p => p.id === pg.id).blocks.find(x => x.id === b.b.id), keep = blk.props.plans || [];
      blk.props.plans = NAMES.map((nm, i) => Object.assign({ name: nm, price: PR[nm], per: nm === 'Enterprise' ? '' : '/mo', features: [['Everything to start'], ['Everything in the last one', 'Priority help'], ['Everything in Pro', 'Up to 10 people']][Math.min(i, 2)].slice(), button: { label: i === n - 1 && n > 2 ? 'Contact us' : 'Choose ' + nm, link: { kind: '', to: '' } } }, keep[i] && keep[i].name === nm ? keep[i] : {}));
      return { cfg: S.normalize(cfg), sel: { block: blk.id }, say: `A pricing section with ${n} plan${n === 1 ? '' : 's'}: ${NAMES.join(', ')}. Click any price or line to change it.` };
    }
    if (id === 'site.price.highlight') {
      const hit = ALLBLOCKS(c).filter(x => x.b.type === 'pricing'), b = hit.find(x => x.p.id === pg.id) || hit[0]; if (!b) return { say: 'There is no pricing section yet. Say “add a pricing section with three plans”.' };
      const plans = b.b.props.plans || [], w = String(sl.which || 'middle').toLowerCase();
      let i = w === 'middle' || w === 'center' || w === 'second' ? Math.floor((plans.length - 1) / 2) + (plans.length % 2 ? 0 : 1) - (plans.length === 2 ? 1 : 0) : w === 'first' ? 0 : w === 'last' || w === 'third' && plans.length === 3 ? plans.length - 1 : plans.findIndex(p => String(p.name || '').toLowerCase().includes(w));
      if (w === 'second') i = Math.min(1, plans.length - 1); if (w === 'third') i = Math.min(2, plans.length - 1);
      if (i < 0) return { say: `Which plan? ${plans.map(p => p.name).join(', ')}.`, acts: plans.map(p => ({ label: p.name, act: 'ask', arg: `highlight the ${p.name} plan` })) };
      const cfg = clone(c), blk = cfg.pages.find(p => p.id === b.p.id).blocks.find(x => x.id === b.b.id); blk.props.plans.forEach((p, j) => { if (j === i) { p.hot = true; p.tag = p.tag || 'Most popular'; } else { delete p.hot; delete p.tag; } });
      return { cfg: S.normalize(cfg), sel: { block: blk.id }, say: `${plans[i].name} is the highlighted plan now: an accent border and a “Most popular” tag.` };
    }
    if (id === 'site.size') {
      const b = selBlock || pg.blocks.find(x => x.type === 'hero') || pg.blocks[0]; if (!b) return { say: 'Click a section first, then say “make it bigger”.' };
      const cfg = clone(c), blk = cfg.pages.find(p => p.id === pg.id).blocks.find(x => x.id === b.id), cur = (blk.style || {}).sz || '', up = sl.dir !== 'smaller';
      const next = up ? (cur === 's' ? '' : 'l') : (cur === 'l' ? '' : 's'); blk.style = Object.assign({}, blk.style || {}, { sz: next, pad: up ? 'l' : 's' }); if (!next) delete blk.style.sz;
      return { cfg: S.normalize(cfg), sel: { block: b.id }, say: `${up ? 'Bigger' : 'Smaller'}: the ${S.BLOCKS[b.type].label.toLowerCase().replace(/ \(.*/, '')}'s headings and room around it. Say it again to go further, or Undo.` };
    }
    return undefined;
  }

  // ---------- demos for Flint's page ("Try it": no side effects, all on sample data) ----------
  const SAMPLE_SHEET = [['Month', 'Sales', 'Cost'], ['Jan', '1200', '400'], ['Feb', '950', '380'], ['Mar', '1640', '520'], ['Apr', '1310', '450']];
  const SAMPLE_DOC = '# Team offsite\n\nWe meet in Leeds on the 4th.\n\n## Travel\n\nbook trains by friday. i will send the list.\n\n## Agenda\n\n- review the roadmap\n- plan the launch\n- pick a venue for the party\n';
  const table = g => `<table class="fm-t">${g.map((r, i) => `<tr>${r.map(v => i ? `<td>${esc(v)}</td>` : `<th>${esc(v)}</th>`).join('')}</tr>`).join('')}</table>`;
  const DEMOS = {
    palette: q => { const P = palette({ text: q, mood: moodOf(q) || 'autumn' }); return { html: swatchHtml(P), text: `${P.name}: ${P.audit.map(a => `${a.label} ${a.ratio}:1 ${a.ok ? '✓' : '✗'}`).join(' · ')}` }; },
    contrast: () => { const bad = { bg: '#FFFFFF', ink: '#9AA0A6', muted: '#C0C4C8', accent: '#FFD166' }, F = fixContrast(bad); return { text: F.fixes.map(f => `${f.key} ${f.before}:1 → ${f.after}:1`).join(' · '), html: `<div class="fm-sw">${['ink', 'muted', 'accent'].map(k => `<span class="fm-chip" style="background:${bad[k]}"></span>→<span class="fm-chip" style="background:${F.colors[k]}"></span>`).join(' ')}</div>` }; },
    fonts: q => { const F = fontsFor(q || 'elegant'); return { text: `${F.display} + ${F.body}: ${F.why}.` }; },
    style: q => { const k = styleOf(q) || 'professional', st = STYLES[k]; return { text: `${cap(k)}: ${PAIRS[st.pair].display} headings, the ${st.mood} palette, ${st.r}px corners, ${st.space} spacing.`, html: swatchHtml(palette({ mood: st.mood })) }; },
    headlines: () => ({ text: headlines({ name: 'Ember Candles', what: 'candles', kind: 'merch', audience: 'slow evenings' }, 4).map(x => `“${x}”`).join(' ') }),
    cta: () => ({ text: ctas('cafe').map(x => `“${x}”`).join(' · ') }),
    readability: () => { const R = readability('We utilize a comprehensive methodology in order to facilitate the optimization of collaborative workflows. Short words help.'); return { text: `Flesch ${R.score}/100 (${R.label}), grade ${R.grade}. ${R.tips[0]}` }; },
    titlecase: () => ({ text: titleCase('the night we met the sea: a story of iPhones and NASA') }),
    tone: () => ({ text: tone('Hey folks, we are gonna ship the stuff soon!', 'professional') }),
    sum: () => ({ text: `Sum of Sales: ${fmt(aggregate(SAMPLE_SHEET, 1))} · average ${fmt(aggregate(SAMPLE_SHEET, 1, 'average'))}`, html: table(SAMPLE_SHEET) }),
    sort: () => ({ html: table(sort(SAMPLE_SHEET, 1, 'desc')), text: 'Sorted by Sales, highest first.' }),
    currency: () => ({ html: table(currency(SAMPLE_SHEET, 1)), text: 'Sales as dollars (formulas still add them up).' }),
    total: () => ({ html: table(total(SAMPLE_SHEET).grid), text: 'A Total row with =SUM formulas.' }),
    chart: () => { const sp = chartSpec(SAMPLE_SHEET, { y: 'sales', x: 'month' }); return { html: chartSvg(sp, SAMPLE_SHEET.slice(1).map(r => ({ label: r[0], v: toNum(r[1]) })), 360, 160), text: sp.title }; },
    toc: () => ({ html: `<pre class="fm-pre">${esc(toc(SAMPLE_DOC).md)}</pre>` }),
    checklist: () => ({ html: `<pre class="fm-pre">${esc(checklist('- review the roadmap\n- plan the launch\n- pick a venue').md)}</pre>` }),
    caps: () => ({ html: `<pre class="fm-pre">${esc(caps('## travel plans\n\nbook trains by friday. i will send the list.').md)}</pre>` }),
    summary: () => ({ text: (summaryBlock('We are building TribeCode so friends can code together. It runs on your own computer. Everyone brings their own AI helper. The tasks, docs and chat live in one place, so nothing gets lost. We launch the beta next month.') || {}).text || '' }),
    pitch: () => ({ html: `<pre class="fm-pre">${esc(pitch('# Lantern Run\n\nFriends lose track of game ideas in scattered chats. Lantern Run is a tiny co-op game we build together on weekends. It runs in the browser with one click. We plan a demo next month and need playtesters.', { n: 4, from: 'a sample vision' }).slice(0, 600))}</pre>` }),
    recipe: () => ({ text: 'Navbar · footer · hero · sign-up form · login · card grid · pricing (middle plan highlighted) · sidebar · tab bar · dialog: each is real layers you can move.' }),
  };

  const api = { palette, contrast, fixContrast, audit, toOklch, oklch, moodOf, MOODS, fontsFor, PAIRS, STYLES, styleOf, headlines, ctas, readability, syllables, titleCase, sentenceCase, tone,
    sheet: { col, aggregate, sort, currency, total, chartSpec, chartComment, readChart, chartSvg, numCols, dataRows, isNum, toNum, I2L, L2I, fmt },
    doc: { toc, checklist, caps, summary: summaryBlock }, pitch, recipe, gridOf, recolor, site, siteFacts, applyPalette, swatchHtml, DEMOS, SAMPLE_SHEET, SAMPLE_DOC };

  // ---------- doing it in the app (browser only): the open sheet or deck, the open doc, and Flint's chat anywhere ----------
  const NLU = () => (typeof module === 'object' && module.exports ? require('./flintnlu.js') : root && root.TribeNLU);
  const C = () => root && root.TribeClient;
  const on = () => { const c = C(); return !!(c && c.connected && c.connected()); };
  // the text a pitch is made from: "the vision", a doc by name, "this" (the open doc)
  async function sourceText(from) {
    const f = String(from || '').toLowerCase().trim(), D = root && root.TribeDocs, cur = D && D.current && D.current();
    if ((!f || /^(?:this|it)$/.test(f)) && cur && cur.kind !== 'deck' && cur.kind !== 'sheet') { const ta = root.document && root.document.querySelector('#doc-body'); return { text: ta ? ta.value : cur.body || '', from: `“${cur.title}”` }; }
    const list = (D && D.list && D.list()) || [], want = f.replace(/\s+(?:doc|document|file|notes)$/, '');
    const d = want && !/^vision$/.test(want) && list.find(x => String(x.title || '').toLowerCase().includes(want) && x.kind !== 'deck' && x.kind !== 'sheet');
    if (d) { if (d.body) return { text: d.body, from: `“${d.title}”` }; if (on()) { try { const r = await C().api('/docs/' + encodeURIComponent(d.slug)); if (r && r.doc) return { text: r.doc.body || '', from: `“${d.title}”` }; } catch {} } }
    if (on()) { try { const v = await C().api('/vision'); if (v && String(v.text || '').trim()) return { text: v.text, from: 'the vision' }; } catch {} }
    return null;
  }
  async function craft(kind, text, body, opt = {}) {
    const N = NLU(); if (!N) return null;
    const P = N.parse(text, { view: kind === 'sheet' ? 'sheet' : 'deck', now: new Date() }), steps = (P.steps || []).filter(x => x.intent && x.conf >= 0.6);
    if (!steps.length || steps.some(x => !/^(?:sheet\.|deck\.pitch$)/.test(x.intent))) return null;
    if (kind === 'deck') {
      const s0 = steps.find(x => x.intent === 'deck.pitch'); if (!s0) return null;
      const src = await sourceText(s0.slots.from === 'this' ? 'vision' : s0.slots.from); if (!src) return { say: 'I could not find that text. Name a doc (“from the launch plan”) or write the vision first.' };
      return { body: pitch(src.text, { n: s0.slots.n || 5, from: src.from }), say: `Made a ${s0.slots.n || 5}-slide pitch from ${src.from} (no AI): the strongest sentences, sorted into problem, what we’re building, the plan and the ask.` };
    }
    const Sh = root && root.TribeSheet; if (!Sh) return null;
    const sh = Sh.parse(body); let g = sh.grid.map(r => r.slice()); const said = []; let changed = false;
    if (!g.length) return { say: 'This sheet is empty. Put a header row and some numbers in first.' };
    const head = c => String((g[0] || [])[c] || I2L(c));
    for (const s of steps) {
      const sl = s.slots || {};
      if (s.intent === 'sheet.chart') { const sp = chartSpec(g, sl); if (!sp) { said.push('I need a column of numbers to chart.'); continue; } sh.post = (String(sh.post || '').replace(/\n?<!--\s*chart:[^>]*-->/g, '').trim() + '\n\n' + chartComment(sp)).trim(); changed = true; said.push(`Charted ${sp.title.toLowerCase()} (a ${sp.type} chart under the table).`); continue; }
      if (s.intent === 'sheet.total') { const t = total(g); if (!t) { said.push('There are no rows to total.'); continue; } g = t.grid; changed = true; said.push(`Added a Total row with =SUM for ${t.cols.join(', ')}.`); continue; }
      const c = col(g, sl.col, opt.sel); if (c < 0) { said.push('Which column? Click a cell in it, or say “column C”.'); continue; }
      if (s.intent === 'sheet.sum') { const v = aggregate(g, c, sl.fn || 'sum'); said.push(v == null ? `${head(c)} has no numbers.` : `${{ sum: 'Sum', average: 'Average', min: 'Lowest', max: 'Highest', count: 'Count' }[sl.fn || 'sum']} of ${head(c)}: ${fmt(v)}.`); continue; }
      if (s.intent === 'sheet.sort') { g = sort(g, c, sl.dir); changed = true; said.push(`Sorted by ${head(c)}, ${sl.dir === 'desc' ? 'highest first' : 'lowest first'} (the total stays at the bottom).`); continue; }
      if (s.intent === 'sheet.format') { g = sl.fmt === 'percent' ? g.map((r, i) => i && isNum(r[c]) && !String(r[c]).includes('%') ? r.map((v, j) => j === c ? `${Math.round(toNum(v) * (toNum(v) <= 1 ? 100 : 1) * 10) / 10}%` : v) : r) : currency(g, c, sl.sym || '$'); changed = true; said.push(`${head(c)} shows as ${sl.fmt === 'percent' ? 'percentages' : `money (${sl.sym || '$'})`} now; formulas still add it up.`); continue; }
    }
    sh.grid = g; return { body: changed ? Sh.serialize(sh) : body, say: said.join(' ') || 'Done.' };
  }
  // the open doc: Markdown in #doc-body (Edit mode); every change is one Undo in Flint's list
  function docEdit(fn, label, H) {
    const ta = root.document && root.document.querySelector('#doc-body'); if (!ta) return { text: 'Open the doc in Edit mode first, then ask again.' };
    const old = ta.value, a = ta.selectionStart, b = ta.selectionEnd, part = b > a ? old.slice(a, b) : old, r = fn(part);
    if (!r || r.md == null || r.md === part) return { text: r && r.say ? r.say : 'Nothing to change.' };
    const next = b > a ? old.slice(0, a) + r.md + old.slice(b) : r.md;
    const put = v => { ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); };
    put(next); if (H && H.pushUndo) H.pushUndo(label, () => put(old));
    return { text: r.say };
  }
  const RUN = {
    'design.palette': s => { const P = palette({ mood: s.slots.mood, color: s.slots.color && s.slots.color.hex, text: s.slots.text }); return { text: `${P.name} palette: ${P.swatches.map(x => `${x.key} ${x.hex}`).join(', ')}. Text ${contrast(P.colors.ink, P.colors.bg)}:1, muted ${contrast(P.colors.muted, P.colors.bg)}:1, accent ${contrast(P.colors.accent, P.colors.bg)}:1${P.fixes.length ? ` (I fixed ${P.fixes.length} to pass WCAG)` : ' (all pass WCAG AA)'}. In the website designer, say “${P.mood === 'custom' ? 'palette from ' + (s.slots.color || {}).hex : P.mood + ' palette'}” to use it.`, html: swatchHtml(P), acts: [['More palettes', 'flintpage', 'palette']] }; },
    'design.fonts': s => { const F = fontsFor(s.slots.text || s.slots.mood); return { text: `${F.display} for headings with ${F.body} for text: ${F.why}. All open (SIL OFL) and built into the website designer.` }; },
    'copy.titlecase': s => ({ text: titleCase(s.slots.text), acts: [] }),
    'copy.headlines': s => { const about = String(s.slots.about || ''), kind = Object.keys(CTAS).find(k => about.includes(k)) || (/shop|store|candle|print|shirt/.test(about) ? 'merch' : /cafe|bakery|coffee|restaurant|food/.test(about) ? 'cafe' : /app|saas|software|startup/.test(about) ? 'saas' : /band|music/.test(about) ? 'band' : 'default'); const what = about.replace(/\b(?:shop|store|business|company|startup|page|site|website)\b/g, '').trim() || about; return { text: headlines({ name: cap(about), what: /s$/.test(what) ? what : what, kind }, 5).map(x => `• ${x}`).join('\n') + '\n(From templates, no AI. An AI writes ones that sound like you.)' }; },
    'copy.cta': s => { const about = String(s.slots.about || ''), kind = Object.keys(CTAS).find(k => about.includes(k)) || (/cafe|bakery|coffee|restaurant/.test(about) ? 'cafe' : /yoga|studio|salon|plumb|clean|repair/.test(about) ? 'service' : /shop|store/.test(about) ? 'merch' : 'default'); return { text: `Start with a verb and say what happens next: ${ctas(kind).map(x => `“${x}”`).join(', ')}.` }; },
    'copy.readability': s => { const R = readability(s.slots.text); return { text: `${R.label}: Flesch ${R.score}/100, about grade ${R.grade}. ${R.tips.join(' ')}` }; },
    'deck.pitch': async (s, H) => {
      const D = root.TribeDocs, cur = D && D.current && D.current();
      if (cur && cur.kind === 'deck' && D.flintCraft) { const r = await D.flintCraft(s.text); if (r) return { text: r.say }; }
      const src = await sourceText(s.slots.from); if (!src) return { text: 'I could not find that text. Name a doc (“from the launch plan”), open one, or write the vision first.' };
      const body = pitch(src.text, { n: s.slots.n || 5, from: src.from }), title = `${(/^#\s+(.+)$/m.exec(body) || [])[1] || 'Our'} pitch`;
      if (!D || !D.create) return { text: 'Docs did not load here.' };
      if (root.TribeApp && root.TribeApp.show) root.TribeApp.show('docs');
      await D.create(title, body, undefined, 'deck');
      return { text: `Made “${title}”: ${s.slots.n || 5} slides from ${src.from}, with no AI (the strongest sentences sorted into a pitch). It is open in Files; ▶ Present when ready.` };
    },
    'doc.toc': (s, H) => docEdit(t => { const r = toc(t); return r ? { md: r.md, say: `Added a table of contents with ${r.n} heading${r.n === 1 ? '' : 's'}.` } : { say: 'The doc has no ## headings to list yet.' }; }, 'the table of contents', H),
    'doc.checklist': (s, H) => docEdit(t => { const r = checklist(t); return r ? { md: r.md, say: `Turned ${r.n} line${r.n === 1 ? '' : 's'} into checkboxes.` } : { say: 'Nothing to turn into a checklist.' }; }, 'the checklist', H),
    'doc.caps': (s, H) => docEdit(t => { const r = caps(t); return { md: r.md, say: r.n ? `Fixed the capitals on ${r.n} line${r.n === 1 ? '' : 's'}: sentence starts, “I”, days and months, and Title Case headings.` : 'The capitals already look right.' }; }, 'the capitals', H),
    'doc.summary': (s, H) => docEdit(t => { const r = summaryBlock(t); return r ? { md: r.md, say: `Added a TL;DR at the top (picked from your own sentences, no AI): ${r.text}` } : { say: 'Nothing to sum up yet.' }; }, 'the TL;DR', H),
    'doc.readability': () => { const ta = root.document && root.document.querySelector('#doc-body'), cur = root.TribeDocs && root.TribeDocs.current && root.TribeDocs.current(); const R = readability(ta ? ta.value : cur ? cur.body : ''); return { text: `${R.label}: Flesch ${R.score}/100, about grade ${R.grade}, ${R.words} words, ${R.avg} per sentence. ${R.tips.join(' ')}` }; },
  };
  ['sheet.sum', 'sheet.sort', 'sheet.format', 'sheet.total', 'sheet.chart'].forEach(id => { RUN[id] = async s => { const D = root.TribeDocs; const r = D && D.flintCraft ? await D.flintCraft(s.text) : null; return { text: r ? r.say : 'Open a sheet first, then ask again.' }; }; });
  Object.assign(api, { craft, sourceText, has: id => Object.prototype.hasOwnProperty.call(RUN, id), run: (s, H) => RUN[s.intent](s, H) });

  return api;
});
