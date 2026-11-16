// Launch kit, the part with no drawing (docs/LAUNCH-KIT.md): store sizes, the style catalogues (screenshot styles, icon
// styles, caption starters, paywall layouts), store text limits and checks, rule-based first drafts, the launch checklist,
// and the suggestions it offers the tribe. Loaded in the browser (window.TribeLaunchCore) and in Node for the unit test
// (app/test/launchkit_test.js). The drawing lives in launchkit-draw.js, the workspace in launchkit.js.
//
// Store rules are paraphrased from Apple's and Google's own pages, read 2026-11-15 (links in SOURCES). They change: the
// checklist says to re-read them before each submission. Not legal advice.
(function (root) {
  'use strict';

  // ---------- sizes (App Store Connect screenshot + app preview specifications; Play Console graphic assets) ----------
  // req: what the store needs at least one of. Apple needs the 6.1" iPhone set (6.9" and 6.5" are optional, and the
  // 6.5" set is used when no 6.9" set exists) and the 13" iPad set when the app runs on iPad. Google: at least two
  // screenshots, 320–3840 px, long side at most twice the short side; 1080x1920 also qualifies for large-format spots.
  const SIZES = [
    { id: 'ios69', store: 'apple', label: 'iPhone 6.9"', w: 1320, h: 2868, folder: 'app-store/iphone-6.9', def: true },
    { id: 'ios65', store: 'apple', label: 'iPhone 6.5"', w: 1284, h: 2778, folder: 'app-store/iphone-6.5' },
    { id: 'ios61', store: 'apple', label: 'iPhone 6.1"', w: 1206, h: 2622, folder: 'app-store/iphone-6.1', def: true, req: true },
    { id: 'ipad13', store: 'apple', label: 'iPad 13"', w: 2064, h: 2752, folder: 'app-store/ipad-13', tablet: true },
    { id: 'play', store: 'google', label: 'Google Play phone', w: 1080, h: 1920, folder: 'google-play/phone', def: true, req: true },
    { id: 'playtab', store: 'google', label: 'Google Play tablet', w: 1600, h: 2560, folder: 'google-play/tablet', tablet: true },
  ];
  const FEATURE = { id: 'feature', w: 1024, h: 500, file: 'google-play/feature-graphic.png' };
  const PREVIEW = {
    apple: { phone: [886, 1920], ipad: [1200, 1600], min: 15, max: 30, fps: 30, count: 3, mb: 500 },
    google: { autoplay: 30, note: 'A YouTube link: public or unlisted, ads off, not a playlist or channel.' },
  };
  // App icons. opaque: no alpha channel at all (Apple refuses icons with one); alpha: transparent corners allowed.
  // fg: an Android adaptive foreground, glyph inside the 66% safe circle; mask: a web maskable icon, glyph inside 80%.
  const ICON_FILES = [
    { file: 'ios/AppIcon-1024.png', size: 1024, kind: 'opaque' },
    { file: 'android/play-store-512.png', size: 512, kind: 'alpha' },
    { file: 'android/adaptive-foreground-432.png', size: 432, kind: 'fg' },
    { file: 'android/adaptive-background-432.png', size: 432, kind: 'bg' },
    { file: 'web/icon-192.png', size: 192, kind: 'opaque' },
    { file: 'web/icon-512.png', size: 512, kind: 'opaque' },
    { file: 'web/icon-maskable-512.png', size: 512, kind: 'mask' },
    { file: 'web/apple-touch-icon-180.png', size: 180, kind: 'opaque' },
    { file: 'web/favicon-32.png', size: 32, kind: 'opaque' },
    { file: 'web/favicon-48.png', size: 48, kind: 'opaque' },
  ];

  // ---------- screenshot styles: 50 named starting points, each a different structure ----------
  // A style is { layout, bg, type, frame }. Colours come from the brand, so no two styles differ only by colour: the unit
  // test checks every pair differs in at least two of the four.
  const LAYOUTS = [
    ['top', 'Caption on top'], ['bottom', 'Caption below'], ['big', 'Big headline'], ['tiltL', 'Tilted left'], ['tiltR', 'Tilted right'],
    ['pair', 'Pair'], ['fan', 'Fan of three'], ['bleed', 'Full screen'], ['zoom', 'Close up'], ['block', 'Color block'], ['card', 'Floating card'],
    ['pano', 'Panorama'], ['stack', 'Staggered'], ['callout', 'Detail circle'], ['side', 'Off to the side'], ['badge', 'With a badge'],
    ['minimal', 'Quiet'], ['split', 'Half and half'],
  ];
  const BGS = [['solid', 'Plain'], ['diag', 'Diagonal'], ['band', 'Band'], ['dots', 'Dots'], ['grid', 'Grid'], ['stripes', 'Stripes'], ['circle', 'Circle'], ['arc', 'Arc'], ['corner', 'Corner'], ['frame', 'Border'], ['halves', 'Two tones']];
  const TYPES = [['sans', 'Bold'], ['serif', 'Serif'], ['mono', 'Label'], ['caps', 'Capitals'], ['light', 'Light']];
  const FRAMES = [['dark', 'Dark phone'], ['light', 'Light phone'], ['line', 'Outline'], ['none', 'No frame'], ['brand', 'Brand phone']];
  const NOFRAME = new Set(['bleed', 'card']);
  const SHOT_STYLES = Array.from({ length: 50 }, (_, i) => {
    const layout = LAYOUTS[i % LAYOUTS.length][0];
    return { id: 's' + String(i + 1).padStart(2, '0'), layout, bg: BGS[(i * 7) % BGS.length][0], type: TYPES[(i * 3) % TYPES.length][0], frame: NOFRAME.has(layout) ? 'none' : FRAMES[(i * 2) % FRAMES.length][0] };
  });
  const partName = (list, id) => (list.find(x => x[0] === id) || [id, id])[1];
  const styleName = s => [partName(LAYOUTS, s.layout), partName(BGS, s.bg)];

  // ---------- icon styles: 54 starting points (background × glyph × plate) ----------
  const ICON_BGS = [['solid', 'Plain'], ['diag', 'Diagonal'], ['vsplit', 'Two tones'], ['ring', 'Ring'], ['dots', 'Dots'], ['grid', 'Grid'], ['stripes', 'Stripes'], ['rays', 'Rays'], ['half', 'Half circle'], ['corner', 'Corner'], ['bands', 'Bands']];
  const GLYPHS = [['letter', 'Letter'], ['letters2', 'Two letters'], ['icon', 'Symbol'], ['monogram', 'Monogram'], ['bars', 'Bars'], ['orbit', 'Orbit'], ['wave', 'Wave'], ['spark', 'Spark'], ['stack', 'Layers'], ['dot', 'Dot']];
  const PLATES = [['none', 'No plate'], ['circle', 'Circle'], ['squircle', 'Rounded square'], ['hex', 'Hexagon'], ['diamond', 'Diamond'], ['blob', 'Pebble'], ['offset', 'Offset']];
  const ICON_STYLES = Array.from({ length: 54 }, (_, i) => ({ id: 'i' + String(i + 1).padStart(2, '0'), bg: ICON_BGS[i % ICON_BGS.length][0], glyph: GLYPHS[(i * 3) % GLYPHS.length][0], plate: PLATES[(i * 5) % PLATES.length][0], weight: (i >> 1) % 2 ? 'thin' : 'bold' }));
  const iconStyleName = s => [partName(GLYPHS, s.glyph), partName(ICON_BGS, s.bg)];
  const SYMBOLS = ['spark', 'check', 'chat', 'calendar', 'photo', 'map', 'book', 'coin', 'bell', 'palette', 'globe', 'lock', 'tasks', 'home', 'people', 'quill', 'sun', 'cloud', 'key', 'store'];

  // ---------- caption starters (52) and subcaptions (12). {name} is the app's name. ----------
  const CAPTIONS = [
    'Everything in one place', 'Plan your week in minutes', 'Start in seconds', 'Made for busy days', 'Your day, sorted', 'Less tapping, more doing',
    'Do it together', 'Share with friends', 'Built for teams of any size', 'Never miss a thing', 'See your progress', 'Track what matters',
    'Stay on top of it', 'Works offline', 'Your data stays yours', 'No account needed', 'Simple from day one', 'Find anything fast',
    'Beautiful in the dark', 'Make it yours', 'Pick up where you left off', 'Gentle reminders', 'One tap to start', 'Clear, calm and quick',
    'Learn something new every day', 'Build better habits', 'Keep your streak going', 'Small steps, big changes', 'Celebrate every win', 'Focus on what counts',
    'Play with friends', 'New levels every week', 'Easy to learn, hard to put down', 'Challenge your friends', 'Collect them all', 'Your next favorite game',
    'Cook with what you have', 'Spend smarter', 'Sleep better tonight', 'Move a little every day', 'Your notes, everywhere', 'Write without distractions',
    'Meet {name}', 'Say hello to {name}', '{name} keeps it simple', 'Why people use {name}', 'Get more done with {name}', 'Everything {name} can do',
    'Designed with care', 'Fast. Friendly. Free to try.', 'Your new daily habit', 'Ready when you are',
  ];
  const SUBCAPTIONS = [
    'Set it up once and forget about it.', 'Everything syncs between your devices.', 'No ads. No clutter.', 'Swipe to finish, tap to undo.',
    'Invite friends with one link.', 'Built-in reminders keep you on track.', 'Works on phone, tablet and computer.', 'Your history at a glance.',
    'Light and dark themes included.', 'Private by default.', 'Starts working in seconds.', 'Made by people who use it every day.',
  ];

  // ---------- paywall layouts (16). Example prices belong to the person's own app; nothing here is connected to payments. ----------
  const PAYWALLS = [
    ['list', 'Plan list'], ['cards', 'Plan cards'], ['features', 'Features first'], ['compare', 'Free or Pro'], ['minimal', 'Just one offer'],
    ['hero', 'Big picture'], ['tiles', 'Feature tiles'], ['timeline', 'Trial timeline'], ['toggle', 'Monthly or yearly'], ['checklist', 'Checklist'],
    ['ladder', 'Three tiers'], ['unlock', 'What you unlock'], ['sheet', 'Bottom sheet'], ['lifetime', 'Pay once'], ['spotlight', 'Spotlight'], ['pills', 'Plan chips'], ['onboard', 'Last onboarding step'],
  ];
  const PAYWALL_DEFAULT = {
    layout: 'list', title: 'Unlock everything', sub: 'Get the full app and support the people who make it.',
    features: ['Unlimited projects', 'Sync across devices', 'Themes and icons', 'Priority help'],
    plans: [{ name: 'Yearly', price: '$29.99', period: 'per year', badge: 'Save 50%' }, { name: 'Monthly', price: '$4.99', period: 'per month', badge: '' }, { name: 'Lifetime', price: '$59.99', period: 'one time', badge: '' }],
    pick: 0, trial: { on: true, text: '7-day free trial' }, cta: 'Continue', foot: ['Restore purchases', 'Terms', 'Privacy'],
  };
  const PAYWALL_NOTE = 'Payments are not connected yet. This is a design for your app’s paywall screen.';
  function paywallNorm(m) {
    m = m && typeof m === 'object' ? m : {};
    const d = PAYWALL_DEFAULT, s = (v, n, f) => (typeof v === 'string' ? v.slice(0, n) : f);
    const plans = Array.isArray(m.plans) && m.plans.length ? m.plans.slice(0, 4).map(p => ({ name: s(p && p.name, 30, ''), price: s(p && p.price, 20, ''), period: s(p && p.period, 30, ''), badge: s(p && p.badge, 24, '') })) : d.plans.map(p => ({ ...p }));
    return {
      layout: PAYWALLS.some(x => x[0] === m.layout) ? m.layout : d.layout, title: s(m.title, 60, d.title), sub: s(m.sub, 140, d.sub),
      features: Array.isArray(m.features) ? m.features.slice(0, 8).map(f => String(f || '').slice(0, 60)).filter(Boolean) : d.features.slice(),
      plans, pick: Math.max(0, Math.min(plans.length - 1, m.pick | 0)), trial: { on: m.trial ? !!m.trial.on : d.trial.on, text: s(m.trial && m.trial.text, 40, d.trial.text) },
      cta: s(m.cta, 30, d.cta), foot: Array.isArray(m.foot) ? m.foot.slice(0, 3).map(x => String(x || '').slice(0, 24)) : d.foot.slice(),
    };
  }
  // A self-contained HTML screen, for the App Creator or the person's own code. Plain styles, no scripts but the plan picker.
  function paywallHTML(m, brand) {
    m = paywallNorm(m); const b = brandColors(brand);
    const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const plans = m.plans.map((p, i) => `<label class="pw-plan${i === m.pick ? ' on' : ''}"><input type="radio" name="plan" ${i === m.pick ? 'checked' : ''}><span class="pw-pn">${e(p.name)}${p.badge ? ` <em>${e(p.badge)}</em>` : ''}</span><span class="pw-pp">${e(p.price)} <small>${e(p.period)}</small></span></label>`).join('');
    return `<!doctype html>
<!-- ${e(PAYWALL_NOTE)} Layout: ${e(m.layout)}. Made with TribeCode's Launch kit. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(m.title)}</title>
<style>
:root{--accent:${b.accent};--ink:${b.ink};--bg:${b.bg};--line:${b.line}}
*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink)}
main{max-width:440px;margin:0 auto;padding:40px 20px 28px;display:flex;flex-direction:column;gap:18px;min-height:100vh}
h1{font-size:30px;line-height:1.15;margin:0}p{margin:0;opacity:.75}ul{margin:0;padding:0;list-style:none;display:grid;gap:10px}
li{display:flex;gap:10px;align-items:center}li::before{content:"";width:18px;height:18px;border-radius:50%;border:2px solid var(--accent);flex:none}
.pw-plans{display:grid;gap:10px}.pw-plan{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border:1px solid var(--line);border-radius:14px;cursor:pointer}
.pw-plan.on{border:2px solid var(--accent)}.pw-plan input{display:none}.pw-pn em{font-style:normal;font-size:12px;background:var(--accent);color:var(--bg);padding:2px 8px;border-radius:99px;margin-left:6px}
.pw-pp small{opacity:.7}.pw-trial{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid var(--line);border-radius:14px}
button{margin-top:auto;font:inherit;font-weight:700;padding:16px;border:0;border-radius:14px;background:var(--accent);color:var(--bg)}
nav{display:flex;justify-content:center;gap:18px;font-size:13px;opacity:.7}
</style></head><body><main>
<h1>${e(m.title)}</h1><p>${e(m.sub)}</p>
<ul>${m.features.map(f => `<li>${e(f)}</li>`).join('')}</ul>
<div class="pw-plans">${plans}</div>
${m.trial.on ? `<div class="pw-trial"><span>${e(m.trial.text)}</span><span>On</span></div>` : ''}
<button type="button">${e(m.cta)}</button>
<nav>${m.foot.map(f => `<a>${e(f)}</a>`).join('')}</nav>
</main><script>document.querySelectorAll('.pw-plan').forEach(l=>l.onclick=()=>{document.querySelectorAll('.pw-plan').forEach(x=>x.classList.toggle('on',x===l))})</script></body></html>
`;
  }
  function brandColors(brand) {
    const c = (brand && brand.colors) || {}, ok = v => /^#[0-9a-fA-F]{6}$/.test(v || '');
    const accent = ok(c.accent) ? c.accent : ok(brand && brand.color) ? brand.color : '#F26B1D';
    const bg = ok(c.bg) ? c.bg : '#FFFFFF', ink = ok(c.ink) ? c.ink : (lum(bg) > 0.5 ? '#14171C' : '#F4F5F7');
    return { accent, bg, ink, line: lum(bg) > 0.5 ? '#D9DDE3' : '#2E3540', accentInk: lum(accent) > 0.55 ? '#14171C' : '#FFFFFF' };
  }
  function lum(hex) { const n = parseInt(String(hex || '#000000').slice(1), 16); const ch = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]; }

  // ---------- store text ----------
  // bytes: Apple counts the keywords field in bytes (100), so accented letters and non-Latin scripts use more of it.
  const FIELDS = [
    { id: 'name', store: 'apple', label: 'App name', max: 30, min: 2 },
    { id: 'subtitle', store: 'apple', label: 'Subtitle', max: 30 },
    { id: 'keywords', store: 'apple', label: 'Keywords', max: 100, bytes: true, hint: 'Comma-separated, no spaces after commas.' },
    { id: 'promo', store: 'apple', label: 'Promotional text', max: 170 },
    { id: 'description', store: 'apple', label: 'Description', max: 4000, long: true },
    { id: 'whatsnew', store: 'apple', label: 'What’s new', max: 4000, long: true },
    { id: 'gtitle', store: 'google', label: 'Title', max: 30 },
    { id: 'gshort', store: 'google', label: 'Short description', max: 80 },
    { id: 'gfull', store: 'google', label: 'Full description', max: 4000, long: true },
  ];
  const byteLen = s => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(String(s || '')).length : Buffer.byteLength(String(s || ''), 'utf8'));
  const STOP = new Set('a an and are as at be but by for from has have in into is it its of on or our so that the their this to was we with you your yours app apps new more most very just get all can will one any out up over also than then them they who what when where which while about after before every each make made use using free'.split(' '));
  const words = s => String(s || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const stem = w => w.replace(/['’]s$/, '').replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1');
  const CLAIMS = /(^|[^\p{L}])(best|#\s?1|no\.?\s?1|number one|top[- ]rated|top|world'?s first|free download|download now|install now|get it now)(?=$|[^\p{L}])/iu;
  const EMOJI = /\p{Extended_Pictographic}/u;
  function keywordList(v) { return String(v || '').split(',').map(x => x.trim()).filter(Boolean); }
  // [{ level: 'bad'|'warn'|'tip', key, vars }]: the keys are English sentences with {placeholders}, translated by the UI.
  function check(id, value, all) {
    all = all || {}; const f = FIELDS.find(x => x.id === id); if (!f) return [];
    const v = String(value || ''), out = [], n = f.bytes ? byteLen(v) : [...v].length;
    if (n > f.max) out.push({ level: 'bad', key: f.bytes ? '{n} bytes over the limit.' : '{n} characters over the limit.', vars: { n: n - f.max } });
    if (f.min && v.trim() && [...v.trim()].length < f.min) out.push({ level: 'bad', key: 'At least two characters.' });
    if (['name', 'subtitle', 'promo', 'gtitle', 'gshort'].includes(id) && CLAIMS.test(v)) out.push({ level: 'warn', key: 'Stores turn down ranking or download claims like “best”, “#1” or “download now”.' });
    if (id === 'gshort' && EMOJI.test(v)) out.push({ level: 'warn', key: 'Google Play asks for no emoji in the short description.' });
    if (['name', 'subtitle', 'gtitle', 'gshort'].includes(id) && /\b[A-Z]{4,}\b/.test(v) && v !== v.toUpperCase()) out.push({ level: 'tip', key: 'Words in capitals read as shouting.' });
    if ((id === 'description' || id === 'whatsnew') && /<\/?[a-z][^>]*>/i.test(v)) out.push({ level: 'warn', key: 'The App Store shows plain text only, so tags appear as they are.' });
    if (id === 'keywords') {
      const list = keywordList(v), seen = new Map(), dups = [], shorts = [], inName = [];
      const named = new Set(words(`${all.name || ''} ${all.subtitle || ''}`).map(stem));
      for (const k of list) {
        const s = stem(k.toLowerCase()); if (seen.has(s)) dups.push(k); else seen.set(s, k);
        if ([...k].length <= 2) shorts.push(k);
        if (words(k).length && words(k).every(w => named.has(stem(w)))) inName.push(k);
      }
      if (/,\s+/.test(v)) out.push({ level: 'tip', key: 'Spaces after commas use up {n} bytes for nothing.', vars: { n: (v.match(/,\s+/g) || []).reduce((a, s) => a + s.length - 1, 0) } });
      if (dups.length) out.push({ level: 'warn', key: 'Said twice: {x}.', vars: { x: dups.join(', ') } });
      if (inName.length) out.push({ level: 'warn', key: 'Already in your name or subtitle, so it counts anyway: {x}.', vars: { x: inName.join(', ') } });
      if (shorts.length) out.push({ level: 'tip', key: 'Keywords need three or more characters: {x}.', vars: { x: shorts.join(', ') } });
      if (list.some(k => /^(app|apps|free)$/i.test(k))) out.push({ level: 'tip', key: '“app” and “free” rarely help: every listing has them.' });
    }
    return out;
  }
  // Removes keywords that repeat the name or subtitle, or each other, and spaces after commas. -> { value, saved }
  function tidyKeywords(v, all) {
    const before = byteLen(v), named = new Set(words(`${(all || {}).name || ''} ${(all || {}).subtitle || ''}`).map(stem)), seen = new Set(), keep = [];
    for (const k of keywordList(v)) { const s = stem(k.toLowerCase()); if (seen.has(s) || [...k].length <= 2 || (words(k).length && words(k).every(w => named.has(stem(w))))) continue; seen.add(s); keep.push(k); }
    const value = keep.join(','); return { value, saved: Math.max(0, before - byteLen(value)) };
  }
  const cut = (s, n, lines) => { s = lines ? String(s || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : String(s || '').replace(/\s+/g, ' ').trim(); if ([...s].length <= n) return s; const a = [...s].slice(0, n + 1).join(''); const i = a.lastIndexOf(' '); return (i > n * 0.5 ? a.slice(0, i) : [...s].slice(0, n).join('')).replace(/[,.;:\s-]+$/, ''); };
  const sentences = s => String(s || '').replace(/^#.*$/gm, '').replace(/[*_`>#]/g, '').split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(x => x.length > 3);
  // ctx: { name, summary, vision, features: [string], audience, kind } -> a first draft of every field (no AI).
  function draft(ctx) {
    ctx = ctx || {}; const name = cut(ctx.name || 'My app', 30), sen = sentences(`${ctx.summary || ''}\n${ctx.vision || ''}`);
    const feats = (ctx.features || []).map(x => cut(String(x).replace(/^(add|build|make|create|implement|finish|fix)\s+/i, '').replace(/^\w/, c => c.toUpperCase()), 60)).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 6);
    const lead = sen[0] || (ctx.kind === 'game' ? `${name} is a game you can pick up in a minute.` : `${name} helps you get things done.`);
    const subtitle = cut(ctx.audience ? `${ctx.kind === 'game' ? 'A game' : 'Made'} for ${ctx.audience}` : sen[0] || lead, 30);
    const body = [lead, sen[1] || '', feats.length ? '\nWhat you can do:\n' + feats.map(f => '• ' + f).join('\n') : '', '\nQuestions or ideas? Write to us from the support page.'].filter(Boolean).join('\n').trim();
    const named = new Set(words(`${name} ${subtitle}`).map(stem)); const kw = []; let bytes = 0;
    for (const w of words(`${feats.join(' ')} ${ctx.summary || ''} ${ctx.vision || ''}`)) {
      if (w.length < 3 || STOP.has(w) || named.has(stem(w)) || kw.some(k => stem(k) === stem(w)) || /^\d+$/.test(w)) continue;
      const add = byteLen(w) + (kw.length ? 1 : 0); if (bytes + add > 100) break; kw.push(w); bytes += add;
    }
    return { name, subtitle, keywords: kw.join(','), promo: cut(lead, 170), description: cut(body, 4000, true), whatsnew: feats.length ? 'New in this version:\n' + feats.slice(0, 4).map(f => '• ' + f).join('\n') : 'Our first release. Thank you for trying it.', gtitle: name, gshort: cut(lead.replace(EMOJI, ''), 80), gfull: cut(body, 4000, true) };
  }
  // A message that reads like release notes -> lines for What's new (or null).
  function changelogFrom(text) {
    const t = String(text || ''); if (!/\b(what'?s new|changelog|release notes|new in (?:this|v?\d)|released|shipped|v\d+\.\d+)/i.test(t)) return null;
    const lines = t.split(/\n+/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(l => l && !/^(what'?s new|changelog|release notes)\b[:.]?$/i.test(l));
    let items = lines.filter(l => l.length > 3 && l.length < 140);
    if (items.length > 1 && /\b(what'?s new|changelog|release notes|released|shipped|v\d+\.\d+)/i.test(items[0])) items = items.slice(1);   // the heading line itself
    items = items.slice(0, 8); if (!items.length) return null;
    return 'New in this version:\n' + items.map(x => '• ' + x.replace(/^\w/, c => c.toUpperCase())).join('\n');
  }
  // Play's preview video is a YouTube link: one video, no playlist, channel or timecode.
  function youtubeOk(u) {
    const s = String(u || '').trim(); if (!s) return { ok: true, empty: true };
    let x; try { x = new URL(s); } catch { return { ok: false, key: 'That is not a link.' }; }
    const host = x.hostname.replace(/^www\.|^m\./, '');
    if (!/^(youtube\.com|youtu\.be)$/.test(host)) return { ok: false, key: 'Google Play takes a YouTube link.' };
    if (x.searchParams.has('list') || /\/(playlist|channel|c|user|@)/.test(x.pathname)) return { ok: false, key: 'Use one video, not a playlist or a channel.' };
    if (x.searchParams.has('t') || x.searchParams.has('start')) return { ok: false, key: 'Remove the start time from the link.' };
    const id = host === 'youtu.be' ? x.pathname.slice(1) : x.searchParams.get('v') || (x.pathname.match(/^\/shorts\/([\w-]{6,})/) || [])[1];
    return id && /^[\w-]{6,}$/.test(id) ? { ok: true, id } : { ok: false, key: 'That link has no video in it.' };
  }

  // ---------- the launch checklist ----------
  // go: shots | icon | text | paywall | video | publish:<dest> | url:<link> | note (a box for the person's own answer)
  const CHECKLIST = [
    { id: 'a-account', store: 'apple', title: 'Join the Apple Developer Program', line: 'A paid membership in your own name or your company’s. Needed to put anything on the App Store.', go: 'url:https://developer.apple.com/programs/enroll/' },
    { id: 'a-record', store: 'apple', title: 'Create the app in App Store Connect', line: 'Pick the name, the main language and the bundle ID. The name must be unique on the store.', go: 'url:https://appstoreconnect.apple.com/apps' },
    { id: 'a-build', store: 'apple', title: 'Upload a build and test it in TestFlight', line: 'Apple builds need a Mac. Publish prepares the build file in your GitHub project.', go: 'publish:ios' },
    { id: 'a-icon', store: 'apple', title: 'App icon, 1024 px with no transparency', line: 'Square, no rounded corners: the phone rounds them.', go: 'icon' },
    { id: 'a-shots', store: 'apple', title: 'Screenshots for the 6.1" iPhone (and 13" iPad if it runs there)', line: 'One to ten per size. Bigger sizes are optional.', go: 'shots' },
    { id: 'a-text', store: 'apple', title: 'Name, subtitle, keywords and description', line: 'Within the limits, with no claims like “best”.', go: 'text' },
    { id: 'a-privacy-url', store: 'apple', title: 'A privacy policy link', line: 'Required for every app. It must say what you collect and why.', go: 'privacy' },
    { id: 'a-support', store: 'apple', title: 'A support link', line: 'A page where people can reach you. Your website works.', go: 'note' },
    { id: 'a-labels', store: 'apple', title: 'App Privacy answers', line: 'What data the app collects, and whether it tracks people. Answer for every service your app uses.', go: 'note' },
    { id: 'a-age', store: 'apple', title: 'Age rating questions', line: 'A short questionnaire in App Store Connect.', go: 'url:https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/' },
    { id: 'a-review', store: 'apple', title: 'Review notes and a demo account', line: 'If the app needs a sign-in, give reviewers one that works. Say anything that is hard to find.', go: 'note' },
    { id: 'a-video', store: 'apple', title: 'App preview video (optional)', line: '15 to 30 seconds, up to three per size.', go: 'video' },
    { id: 'g-account', store: 'google', title: 'Create a Google Play developer account', line: 'A one-time fee and an identity check.', go: 'url:https://play.google.com/console/signup' },
    { id: 'g-test', store: 'google', title: 'Closed test: 12 testers for 14 days', line: 'New personal accounts need this before the app can go to everyone.', go: 'note' },
    { id: 'g-build', store: 'google', title: 'A signed app bundle', line: 'Publish builds the Android app in your GitHub project; sign it with your own key.', go: 'publish:android' },
    { id: 'g-icon', store: 'google', title: 'App icon, 512 px', line: 'No badges or words that suggest a ranking or a price.', go: 'icon' },
    { id: 'g-feature', store: 'google', title: 'Feature graphic, 1024 x 500', line: 'Keep the important part in the middle.', go: 'shots' },
    { id: 'g-shots', store: 'google', title: 'Two or more screenshots', line: 'Four or more at 1080 x 1920 can be shown in bigger spots.', go: 'shots' },
    { id: 'g-text', store: 'google', title: 'Title, short and full description', line: '30, 80 and 4,000 characters.', go: 'text' },
    { id: 'g-privacy-url', store: 'google', title: 'A privacy policy link', line: 'Required for every app.', go: 'privacy' },
    { id: 'g-safety', store: 'google', title: 'Data safety form', line: 'What the app collects and shares, and how it is protected.', go: 'note' },
    { id: 'g-rating', store: 'google', title: 'Content rating questionnaire', line: 'Answer it in Play Console to get a rating.', go: 'note' },
    { id: 'g-audience', store: 'google', title: 'Target audience', line: 'Who the app is for. Apps for children have extra rules.', go: 'note' },
    { id: 'g-access', store: 'google', title: 'App access for reviewers', line: 'A test sign-in if parts of the app are behind one.', go: 'note' },
  ];
  const SOURCES = [
    ['App Store screenshot specifications', 'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/'],
    ['App Store app preview specifications', 'https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/'],
    ['App Store app information (name, subtitle)', 'https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/'],
    ['App Store platform version information (keywords, promotional text, description)', 'https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/'],
    ['Google Play preview assets', 'https://support.google.com/googleplay/android-developer/answer/9866151'],
    ['Google Play store listing text', 'https://support.google.com/googleplay/android-developer/answer/13393723'],
    ['Google Play testing requirements for new personal accounts', 'https://support.google.com/googleplay/android-developer/answer/14151465'],
  ];

  // ---------- the kit record ----------
  function norm(k) {
    k = k && typeof k === 'object' ? k : {};
    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const text = {}; for (const f of FIELDS) text[f.id] = str((k.text || {})[f.id], f.max * 4);
    const slides = (Array.isArray(k.slides) ? k.slides : []).slice(0, 10).map(s => ({ src: s && s.src && typeof s.src === 'object' ? { kind: str(s.src.kind, 16), ref: str(s.src.ref, 200), name: str(s.src.name, 60) } : null, caption: str(s && s.caption, 80), sub: str(s && s.sub, 120) }));
    const icon = k.icon && typeof k.icon === 'object' ? k.icon : {};
    return {
      v: 1, style: SHOT_STYLES.some(s => s.id === k.style) ? k.style : 's01', sizes: Array.isArray(k.sizes) ? k.sizes.filter(id => SIZES.some(s => s.id === id)) : SIZES.filter(s => s.def).map(s => s.id),
      feature: k.feature !== false, slides, shotsAt: str(k.shotsAt, 30), seen: Array.isArray(k.seen) ? k.seen.slice(0, 60).map(x => str(x, 80)) : [],
      icon: { style: ICON_STYLES.some(s => s.id === icon.style) ? icon.style : 'i01', text: str(icon.text, 2), symbol: SYMBOLS.includes(icon.symbol) || /^(site|app):[a-z0-9-]{1,40}$/.test(icon.symbol || '') ? icon.symbol : 'spark', upload: /^data:image\/(png|jpeg|webp);base64,/.test(icon.upload || '') && icon.upload.length < 700000 ? icon.upload : '', swap: !!icon.swap },
      text, langs: Array.isArray(k.langs) ? k.langs.slice(0, 8).map(x => str(x, 8)) : [], localized: k.localized && typeof k.localized === 'object' ? k.localized : {},
      paywall: paywallNorm(k.paywall), checks: k.checks && typeof k.checks === 'object' ? Object.fromEntries(Object.entries(k.checks).filter(([id]) => CHECKLIST.some(c => c.id === id)).map(([id, v]) => [id, !!v])) : {},
      notes: k.notes && typeof k.notes === 'object' ? Object.fromEntries(Object.entries(k.notes).filter(([id]) => CHECKLIST.some(c => c.id === id)).map(([id, v]) => [id, str(v, 2000)])) : {},
      youtube: str(k.youtube, 200),
    };
  }
  const progress = k => { const n = CHECKLIST.filter(c => (k.checks || {})[c.id]).length; return { done: n, total: CHECKLIST.length }; };

  // ---------- suggestions from what the tribe did (TribeSuggest provider, launchkit.js wires it) ----------
  // g: { kit, screens: [{ name, slug, latest: { ts, at } }], messages: [{ id, by, name, text, at }] }
  function suggestions(g) {
    const kit = norm(g && g.kit), out = [];
    const used = new Set(kit.slides.map(s => s.src && s.src.ref).filter(Boolean)), seen = new Set(kit.seen);
    const fresh = (g.screens || []).filter(s => s && s.latest && !used.has(`${s.slug}/${s.latest.ts}`) && !seen.has(`${s.slug}/${s.latest.ts}`) && (!kit.shotsAt || String(s.latest.at) > kit.shotsAt));
    if (fresh.length && (kit.slides.length || kit.shotsAt)) out.push({ id: 'launch-shots', title: 'Refresh your store screenshots', why: fresh.length === 1 ? 'A new screen was added: {x}.' : '{n} new screens were added: {x}.', vars: { n: fresh.length, x: fresh.slice(0, 3).map(s => s.name).join(', ') }, from: fresh.slice(0, 3).map(s => ({ kind: 'screen', ref: `${s.slug}/${s.latest.ts}`, who: s.latest.by || '' })), op: { kind: 'shots', screens: fresh.slice(0, 10 - kit.slides.length > 0 ? 10 - kit.slides.length : 0).map(s => ({ kind: 'visual', ref: `${s.slug}/${s.latest.ts}`, name: s.name })) } });
    const msg = (g.messages || []).slice().reverse().find(m => changelogFrom(m.text));
    if (msg) { const v = changelogFrom(msg.text); if (v && v !== kit.text.whatsnew) out.push({ id: 'launch-whatsnew', title: 'Draft What’s New', why: '{who} posted release notes in chat.', vars: { who: msg.name || 'Someone' }, from: [{ kind: 'chat', ref: String(msg.id || ''), who: msg.by || '' }], op: { kind: 'text', field: 'whatsnew', value: v } }); }
    const t = tidyKeywords(kit.text.keywords, kit.text);
    if (kit.text.keywords && t.saved >= 2) out.push({ id: 'launch-keywords', title: 'Free up {n} keyword characters', why: 'Some keywords repeat your name, your subtitle or each other.', vars: { n: t.saved }, from: [{ kind: 'launch', ref: 'keywords', who: '' }], op: { kind: 'text', field: 'keywords', value: t.value } });
    return out;
  }

  const API = { SIZES, FEATURE, PREVIEW, ICON_FILES, LAYOUTS, BGS, TYPES, FRAMES, SHOT_STYLES, styleName, ICON_BGS, GLYPHS, PLATES, ICON_STYLES, iconStyleName, SYMBOLS,
    CAPTIONS, SUBCAPTIONS, PAYWALLS, PAYWALL_DEFAULT, PAYWALL_NOTE, paywallNorm, paywallHTML, brandColors, lum, FIELDS, byteLen, check, keywordList, tidyKeywords, draft, changelogFrom, youtubeOk,
    CHECKLIST, SOURCES, norm, progress, suggestions };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.TribeLaunchCore = API;
})(typeof window !== 'undefined' ? window : null);
