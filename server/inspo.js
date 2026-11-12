// The inspiration board (v0.25): drop pictures, Pinterest boards and pins, Dribbble or Behance shots, any gallery or
// website, Google Fonts links or plain font names. TribeCode pulls out the colors and fonts and Flint "dresses up" the
// project with them: the website's brand kit (primary, accent, font pair) and design/inspiration.css in the repo
// (CSS variables for the app or game, plus the font files from the asset library). No AI needed: color extraction
// runs in the browser (canvas + k-means, app/ui/inspo.js), and everything here is rules.
//   GET    /api/inspo?project=                     { items, palette, fonts, applied }
//   POST   /api/inspo/link   { project, url }      fetch the page (the SSRF-safe fetcher in embeds.js): title, og:image,
//                                                  up to 12 pictures (Pinterest pinimg.com pins too), theme-color, CSS
//                                                  hex colors, Google Fonts families and font-family names
//   POST   /api/inspo/image  { project, name, thumb (data:image/jpeg|png|webp, <= 160 KB), colors: [#hex] }
//   POST   /api/inspo/font   { project, name }     a font you like by name ("Fraunces", "pixel", "a serif")
//   PATCH  /api/inspo/:id    { colors?, keep? }     colors measured in the browser for a link's pictures
//   DELETE /api/inspo/:id
//   POST   /api/inspo/apply  { project, to: 'site' | 'app' | 'both', shuffle? }
// Members who can build (not spectators or guests). At most 40 items per project.
// feat/flint-ai: a board per person too (board=me; on this computer with no tribe yet, a local "you"), genuine openly
// licensed pictures and sounds, and Flint adapting your style from it:
//   GET    /api/inspo/search?q=&type=image|audio&source=openverse|wikimedia   Openverse by default (CC-licensed images and
//                                                  audio with license, creator and attribution); Wikimedia Commons as a
//                                                  second image source. Offline -> { offline: true, results: [] }.
//   POST   /api/inspo/save   { project | board: 'me', ref }   a search result (ref = its source:id) saved to the board: the
//                                                  thumbnail (and a sound's preview, up to 6 MB) is fetched through this
//                                                  server into .tribe/inspo/cache (no hotlinking), colors are measured
//                                                  here (server/imgcolors.js), attribution is stored with it
//   GET    /api/inspo/cache/<hash>                  the cached file (public: openly licensed media addressed by hash)
//   POST   /api/inspo/apply  { project, from: 'me' }  dress the project up from your own board
//   source=freesound (type=audio)                  polish: Freesound sounds (previews, license, attribution) when the host
//                                                  set a Freesound API key (Settings › More settings). The key stays here:
//                                                  .tribe/freesound.json (0600), sent only as "Authorization: Token" to
//                                                  Freesound, never to a browser.
//   GET    /api/inspo/freesound                    { configured }     PUT { key } (the host; '' removes it)
// Search endpoints are configurable for tests and mirrors: TRIBE_OPENVERSE_URL, TRIBE_WIKIMEDIA_URL, TRIBE_FREESOUND_URL.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const HEX = /^#[0-9a-f]{6}$/i;
const crypto = require('node:crypto');
const imgcolors = require('./imgcolors');
const OV = () => (process.env.TRIBE_OPENVERSE_URL || 'https://api.openverse.org').replace(/\/+$/, '');
const WM = () => (process.env.TRIBE_WIKIMEDIA_URL || 'https://commons.wikimedia.org').replace(/\/+$/, '');
const FSD = () => (process.env.TRIBE_FREESOUND_URL || 'https://freesound.org').replace(/\/+$/, '');
// a heading font + a body font for each pair the website knows (server/sitegen.js)
const PAIRS = { silkscreen: ['Silkscreen', 'Inter'], mono: ['JetBrains Mono', 'Inter'], instrument: ['Instrument Serif', 'Inter'], fraunces: ['Fraunces', 'Inter'], bricolage: ['Bricolage Grotesque', 'DM Sans'], grotesk: ['Space Grotesk', 'Inter'] };
const LICENSES = { by: 'CC BY', 'by-sa': 'CC BY-SA', 'by-nd': 'CC BY-ND', 'by-nc': 'CC BY-NC', 'by-nc-sa': 'CC BY-NC-SA', 'by-nc-nd': 'CC BY-NC-ND', cc0: 'CC0', pdm: 'Public domain', sampling: 'Sampling+', 'sampling+': 'Sampling+', 'nc-sampling+': 'NC Sampling+' };
// font names we know -> the website's font pairs (server/sitegen.js) and a self-hosted family (Fontsource id)
const FONT_RULES = [
  [/press start|pixel|8.?bit|silkscreen|vt323|retro|arcade/i, 'silkscreen', 'silkscreen'],
  [/mono|code|jetbrains|fira code|ibm plex mono|courier|typewriter/i, 'mono', 'jetbrains-mono'],
  [/instrument|playfair|cormorant|didot|bodoni|elegant|luxury|wedding/i, 'instrument', null],
  [/fraunces|serif|garamond|georgia|merriweather|lora|baskerville|editorial|classic/i, 'fraunces', null],
  [/bricolage|rounded|playful|fun|kids|baloo|nunito|quicksand|fredoka|comic/i, 'bricolage', null],
  [/grotesk|inter|helvetica|neue|sans|geometric|poppins|montserrat|manrope|dm sans|modern|minimal|clean/i, 'grotesk', 'space-grotesk'],
];
const slug = s => String(s || '').toLowerCase().trim().replace(/['"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// ---------- color helpers (deterministic) ----------
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function hsl(h) { let [r, g, b] = rgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let s = 0, hu = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hu = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hu *= 60; }
  return [hu, s, l]; }
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * (1 - t) + y[i] * t)); };
const hueDist = (a, b) => { const d = Math.abs(hsl(a)[0] - hsl(b)[0]) % 360; return d > 180 ? 360 - d : d; };
// push `fg` toward white or black until it reads on `bg` at `min` contrast
function readable(fg, bg, min) { let c = fg; const to = lum(bg) < 0.4 ? '#FFFFFF' : '#000000'; for (let i = 0; i < 20 && contrast(c, bg) < min; i++) c = mix(c, to, 0.12); return c; }

// From every color on the board (weighted), pick a palette with roles: background, surface, text, accent, accent 2.
function palette(colors, shuffle = 0) {
  const w = new Map(); for (const { c, n } of colors) if (HEX.test(c)) w.set(c.toUpperCase(), (w.get(c.toUpperCase()) || 0) + (n || 1));
  let all = [...w.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  if (!all.length) return null;
  // merge near-duplicates
  const uniq = []; for (const c of all) if (!uniq.some(u => contrast(u, c) < 1.12 && hueDist(u, c) < 18)) uniq.push(c);
  all = uniq.slice(0, 16);
  const chroma = c => { const v = rgb(c); return (Math.max(...v) - Math.min(...v)) / 255; };
  const neutral = all.filter(c => chroma(c) < 0.14 || (lum(c) > 0.7 && chroma(c) < 0.22)), vivid = all.filter(c => !neutral.includes(c) && chroma(c) >= 0.18 && hsl(c)[2] > 0.18 && hsl(c)[2] < 0.85);
  const darkCount = all.filter(c => lum(c) < 0.18).length, dark = darkCount >= all.length / 2;
  let bg = (neutral.find(c => dark ? lum(c) < 0.12 : lum(c) > 0.75)) || (dark ? '#14161B' : '#FAF8F4');
  if (dark && lum(bg) > 0.06) bg = mix(bg, '#000000', 0.4); if (!dark && lum(bg) < 0.85) bg = mix(bg, '#FFFFFF', 0.5);
  const surface = mix(bg, dark ? '#FFFFFF' : '#000000', dark ? 0.06 : 0.04);
  const text = dark ? readable('#F4F2EE', bg, 12) : readable('#1A1A1F', bg, 12);
  const rot = arr => (arr.length ? arr.slice(shuffle % arr.length).concat(arr.slice(0, shuffle % arr.length)) : arr);
  const pool = rot(vivid.length ? vivid : all.filter(c => c !== bg));
  let accent = pool[0] || (dark ? '#F26B1D' : '#C2410C');
  accent = readable(accent, bg, 3);
  let accent2 = pool.find(c => hueDist(c, accent) > 40) || mix(accent, dark ? '#FFFFFF' : '#000000', 0.35);
  accent2 = readable(accent2, bg, 3);
  return { mode: dark ? 'dark' : 'light', bg, surface, text, accent, accent2, swatches: all.slice(0, 8) };
}
function fontFrom(names, pal) {
  for (const n of names) for (const [re, pair, family] of FONT_RULES) if (re.test(n)) return { pair, family: family || slug(n), from: n };
  // no font named: pick from the mood of the colors
  if (pal) { const s = hsl(pal.accent)[1]; if (s > 0.75) return { pair: 'bricolage', family: null, from: 'bright colors' }; if (pal.mode === 'light' && hsl(pal.accent)[0] < 60) return { pair: 'fraunces', family: null, from: 'warm, light colors' }; }
  return { pair: 'grotesk', family: 'space-grotesk', from: 'a clean default' };
}

module.exports = function inspo({ P, base, embeds, showcase, assets, postChat, nameOf, broadcast }) {
  const err = (status, m) => Object.assign(new Error(m), { status });
  const isMe = pid => /^u-/.test(String(pid));
  const boardOf = (me, b) => (b === 'me' ? 'u-' + String(me && me.id || 'local').replace(/[^a-z0-9-]/gi, '') : b);
  const file = pid => base.p('.tribe', 'inspo', `${String(pid).replace(/[^a-z0-9-]/gi, '')}.json`);
  const cacheDir = () => base.p('.tribe', 'inspo', 'cache');
  const load = pid => { try { return JSON.parse(fs.readFileSync(file(pid), 'utf8')); } catch { return { items: [] }; } };
  const save = (pid, st) => { fs.mkdirSync(path.dirname(file(pid)), { recursive: true }); fs.writeFileSync(file(pid), JSON.stringify(st)); };
  const can = (me, pid) => { if (isMe(pid)) { if (!me || ['spectator', 'guest'].includes(me.role)) throw err(403, 'only builders can keep a board'); return; } if (me && me.role === 'local') throw err(401, 'join or start a tribe for project boards'); const p = P.get(pid); if (!p || !P.canSee(me, pid)) throw err(404, 'project not found'); if (!me || ['spectator', 'guest'].includes(me.role)) throw err(403, 'only builders can add inspiration'); };
  const rid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function view(pid) {
    const st = load(pid), cols = [];
    for (const it of st.items) (it.colors || []).forEach((c, i) => cols.push({ c, n: Math.max(1, 6 - i) * (it.kind === 'image' ? 2 : 1) }));
    const pal = palette(cols, st.shuffle || 0);
    const names = st.items.flatMap(it => it.fonts || []);
    const font = fontFrom(names, pal);
    return { items: st.items, palette: pal, font, style: pal ? { accent: pal.accent, accent2: pal.accent2, mode: pal.mode, fonts: PAIRS[font.pair] || PAIRS.grotesk } : null, applied: st.applied || null, board: pid };
  }
  function add(pid, me, it) {
    const st = load(pid); if (st.items.length >= (isMe(pid) ? 80 : 40)) throw err(400, 'the board is full: take something off first');
    const item = { id: rid(), by: me.id, byName: me.role === 'local' ? 'You' : nameOf(me.id), at: new Date().toISOString(), ...it };
    st.items.unshift(item); save(pid, st); broadcast && broadcast({ type: 'inspo', project: pid }); return item;
  }

  // ---------- reading a link ----------
  function parseHtml(html, pageUrl) {
    const abs = u => { try { return new URL(u.replace(/&amp;/g, '&'), pageUrl).href; } catch { return null; } };
    const meta = k => { const m = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)`, 'i').exec(html) || new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, 'i').exec(html); return m ? m[1] : ''; };
    const title = (meta('og:title') || (/<title[^>]*>([^<]{1,200})/i.exec(html) || [])[1] || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const imgs = new Set(); const og = meta('og:image'); if (og) imgs.add(abs(og));
    // Pinterest pins and boards put their pictures on i.pinimg.com; prefer the bigger sizes
    for (const m of html.matchAll(/https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x)\/[0-9a-f/]+\.(?:jpg|jpeg|png|webp)/gi)) imgs.add(m[0]);
    for (const m of html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)) { const u = abs(m[1]); if (u && /^https?:/.test(u) && !/\.svg(\?|$)|sprite|icon|logo|avatar|pixel\.gif|1x1/i.test(u)) imgs.add(u); if (imgs.size >= 14) break; }
    const colors = new Map(); const tc = meta('theme-color'); if (HEX.test(tc)) colors.set(tc.toUpperCase(), 8);
    for (const m of html.matchAll(/#([0-9a-f]{6})\b/gi)) { const c = '#' + m[1].toUpperCase(); colors.set(c, (colors.get(c) || 0) + 1); }
    const fonts = new Set();
    for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) for (const f of m[1].split('&')) if (/^family=/.test(f)) fonts.add(decodeURIComponent(f.slice(7).split(':')[0]).replace(/\+/g, ' '));
    for (const m of html.matchAll(/font-family\s*:\s*([^;}"]+)/gi)) { const f = m[1].split(',')[0].replace(/['"]/g, '').trim(); if (f && !/^(inherit|initial|var\(|system-ui|-apple-system|sans-serif|serif|monospace|arial|helvetica)$/i.test(f) && f.length < 40) fonts.add(f); if (fonts.size > 6) break; }
    return { title, images: [...imgs].filter(Boolean).slice(0, 12), colors: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c), fonts: [...fonts].slice(0, 4) };
  }
  async function link(pid, me, raw) {
    let u; try { u = new URL(String(raw || '').trim()); } catch { throw err(400, 'that doesn\'t look like a link'); }
    if (!/^https?:$/.test(u.protocol)) throw err(400, 'only web links');
    if (!embeds || !embeds.safeGet) throw err(503, 'link reading is off on this tribe');
    let r; try { r = await embeds.safeGet(u.href, 1024 * 1024, 'text/html,application/xhtml+xml;q=0.9,image/*;q=0.8', { timeout: 8000 }); }
    catch (e) { throw err(e.blocked ? 400 : 502, e.blocked ? 'that address can\'t be read (private or blocked)' : 'couldn\'t open that page'); }
    const type = String(r.headers['content-type'] || '').split(';')[0].toLowerCase();
    const host = new URL(r.url || u.href).hostname.replace(/^www\./, '');
    if (/^image\/(png|jpe?g|gif|webp|avif)$/.test(type)) return add(pid, me, { kind: 'link', url: u.href, site: host, title: 'A picture', images: [u.href], colors: [], fonts: [] });
    if (!/html/.test(type)) throw err(400, 'that link isn\'t a page or a picture');
    const html = require('./capture-html').decodeBody(r.body, r.headers['content-type']);
    const p = parseHtml(html, r.url || u.href);
    const fontsFromUrl = /fonts\.google\.com\/specimen\/([^/?#]+)/.exec(u.href); if (fontsFromUrl) p.fonts.unshift(decodeURIComponent(fontsFromUrl[1]).replace(/\+/g, ' '));
    return add(pid, me, { kind: 'link', url: u.href, site: host, title: p.title || host, images: p.images, colors: p.colors.slice(0, 6), fonts: p.fonts, pinterest: /pinterest\./.test(host) });
  }

  // ---------- dressing up the project ----------
  async function apply(pid, me, to = 'both', from) {
    const v = from ? view(from) : view(pid); if (!v.palette) throw err(400, 'add a picture or a link first: there are no colors on the board yet');
    const pal = v.palette, font = v.font, done = [];
    if ((to === 'site' || to === 'both') && showcase && showcase.brandSet) {
      try { showcase.brandSet(pid, { primary: pal.accent, accent: pal.accent2, font: font.pair }, me); done.push('the website\'s brand kit'); } catch (e) { if (to === 'site') throw e; }
    }
    if (to === 'app' || to === 'both') {
      const p = P.get(pid), repo = p && p.repo && fs.existsSync(p.repo) ? p.repo : null;
      const dir = repo ? path.join(repo, 'design') : base.p('projects', pid, 'design');
      fs.mkdirSync(dir, { recursive: true });
      let fontCss = '', family = font.family;
      if (family && assets && assets.add) { try { await assets.add(pid, [{ pack: 'fonts', name: family }], me); fontCss = `@import url("../assets/fonts/${family}.css");\n`; } catch { family = null; } }
      const fam = family ? family.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join(' ').replace('2p', '2P').replace('Vt323', 'VT323') : '';
      const css = `/* Dressed up from the inspiration board (${v.items.length} item${v.items.length === 1 ? '' : 's'}) by TribeCode. Use these variables in your app, game or site. */
${fontCss}:root {
  --insp-bg: ${pal.bg};
  --insp-surface: ${pal.surface};
  --insp-text: ${pal.text};
  --insp-accent: ${pal.accent};
  --insp-accent-2: ${pal.accent2};
  --insp-font: ${fam ? `"${fam}", ` : ''}system-ui, sans-serif;
  color-scheme: ${pal.mode};
}
body { background: var(--insp-bg); color: var(--insp-text); font-family: var(--insp-font); }
a, .accent { color: var(--insp-accent); }
button, .btn { background: var(--insp-accent); color: ${contrast('#FFFFFF', pal.accent) >= 4.5 ? '#FFFFFF' : '#111111'}; border: 0; border-radius: 10px; }
.card, .panel { background: var(--insp-surface); border-radius: 14px; }
`;
      fs.writeFileSync(path.join(dir, 'inspiration.css'), css); done.push(`${repo ? '' : 'the tribe folder\'s '}design/inspiration.css`);
      // the starter's palette file follows too, when there is one
      const pf = path.join(dir, 'palette.css');
      if (fs.existsSync(pf)) { let t = fs.readFileSync(pf, 'utf8'); t = t.replace(/(--canvas:\s*)#[0-9a-f]{3,8}/i, `$1${pal.bg}`).replace(/(--surface:\s*)#[0-9a-f]{3,8}/i, `$1${pal.surface}`).replace(/(--accent:\s*)#[0-9a-f]{3,8}/i, `$1${pal.accent}`).replace(/(--second:\s*)#[0-9a-f]{3,8}/i, `$1${pal.accent2}`).replace(/(--ink:\s*)#[0-9a-f]{3,8}/i, `$1${pal.text}`); fs.writeFileSync(pf, t); done.push('design/palette.css'); }
    }
    const st = load(pid); st.applied = { at: new Date().toISOString(), by: me.id, palette: pal, font, to }; save(pid, st);
    P.inProject(pid, () => postChat('general', 'tribecode', `🎨 ${nameOf(me.id)} dressed up the project from the inspiration board: ${pal.accent} and ${pal.accent2} on ${pal.mode === 'dark' ? 'a dark' : 'a light'} background, ${font.pair === 'silkscreen' ? 'a pixel font' : font.pair === 'mono' ? 'a code font' : font.pair === 'fraunces' || font.pair === 'instrument' ? 'a serif' : 'a clean sans'} (${done.join(', ') || 'nothing to change'}).`));
    broadcast && broadcast({ type: 'inspo', project: pid });
    return { ok: true, palette: pal, font, changed: done };
  }

  // ---------- genuine, openly licensed pictures and sounds (feat/flint-ai) ----------
  const UA = { 'User-Agent': 'TribeCode/1 (+https://tribecode.org; inspiration board)' };
  const memo = new Map();   // "source:id" -> a normalized search result (so saving never trusts a URL from the browser)
  const urls = new Map();   // cache hash -> { url, cap, accept } (thumbnails and previews fetched on first view)
  const remember = r => { memo.set(r.ref, r); if (memo.size > 3000) memo.delete(memo.keys().next().value); return r; };
  const hashOf = u => crypto.createHash('sha256').update(String(u)).digest('hex').slice(0, 40);
  const via = (u, cap, accept) => { if (!u) return ''; const h = hashOf(u); urls.set(h, { url: u, cap, accept }); if (urls.size > 6000) urls.delete(urls.keys().next().value); return `/api/inspo/cache/${h}`; };
  const IMG_ACCEPT = 'image/avif,image/webp,image/png,image/jpeg;q=0.9,image/gif;q=0.8', AUD_ACCEPT = 'audio/mpeg,audio/ogg,audio/wav,audio/*;q=0.8';
  async function getJSON(u, headers) {
    if (!embeds || !embeds.safeGet) throw err(503, 'searching the web is off on this tribe');
    const r = await embeds.safeGet(u, 2 * 1024 * 1024, 'application/json', { timeout: 9000, ua: UA['User-Agent'], ...(headers ? { headers } : {}) });
    return JSON.parse(Buffer.isBuffer(r.body) ? r.body.toString('utf8') : String(r.body));
  }
  const licName = (l, v) => { const k = String(l || '').toLowerCase(); const n = LICENSES[k] || (k ? k.toUpperCase() : 'Open license'); return v && !/^(cc0|pdm|public)/i.test(n) && !/^(cc0|pdm)$/.test(k) ? `${n} ${v}` : n; };
  const text = (h, n = 160) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  function ovItem(x, kind) {
    const lic = licName(x.license, x.license_version), title = text(x.title, 120) || (kind === 'audio' ? 'A sound' : 'A picture'), creator = text(x.creator, 80);
    return remember({ ref: `openverse:${kind}:${String(x.id).replace(/[^a-z0-9-]/gi, '')}`, source: 'openverse', provider: text(x.source || x.provider, 40), kind: kind === 'audio' ? 'sound' : 'image', title, creator, creatorUrl: /^https?:/.test(x.creator_url || '') ? x.creator_url : '',
      license: lic, licenseUrl: /^https?:/.test(x.license_url || '') ? x.license_url : '', landing: /^https?:/.test(x.foreign_landing_url || '') ? x.foreign_landing_url : '',
      attribution: text(x.attribution, 300) || `“${title}”${creator ? ` by ${creator}` : ''} is licensed under ${lic}.`,
      thumbUrl: x.thumbnail || (kind === 'image' ? x.url : '') || '', mediaUrl: kind === 'audio' ? x.url || '' : '', duration: kind === 'audio' && x.duration ? Math.round(x.duration / 1000) : 0, filetype: x.filetype || '', w: x.width || 0, h: x.height || 0 });
  }
  // ---------- Freesound (polish): the host's API key, server-side only ----------
  const FS_FILE = () => base.p('.tribe', 'freesound.json');
  const fsKey = () => { if (process.env.TRIBE_FREESOUND_KEY) return process.env.TRIBE_FREESOUND_KEY; try { return String(JSON.parse(fs.readFileSync(FS_FILE(), 'utf8')).key || ''); } catch { return ''; } };
  function setFsKey(k) {
    k = String(k || '').trim();
    if (k && !/^[A-Za-z0-9]{16,80}$/.test(k)) throw err(400, 'that does not look like a Freesound API key (letters and digits)');
    if (!k) { try { fs.rmSync(FS_FILE(), { force: true }); } catch {} return false; }
    fs.mkdirSync(path.dirname(FS_FILE()), { recursive: true }); fs.writeFileSync(FS_FILE(), JSON.stringify({ key: k, at: new Date().toISOString() }), { mode: 0o600 }); try { fs.chmodSync(FS_FILE(), 0o600); } catch {}
    return true;
  }
  const fsAuth = () => ({ Authorization: 'Token ' + fsKey() });
  const FS_FIELDS = 'id,name,username,license,previews,duration,url,images';
  function fsLicense(u) {   // Freesound answers a license URL (or a name)
    const t = String(u || '').toLowerCase();
    if (/publicdomain\/zero|cc0|creative commons 0/.test(t)) return { name: 'CC0', url: /^https?:/.test(u) ? u : 'https://creativecommons.org/publicdomain/zero/1.0/' };
    const m = /licenses\/(by(?:-nc)?(?:-sa|-nd)?)\/(\d\.\d)/.exec(t);
    if (m) return { name: `${LICENSES[m[1]] || 'CC ' + m[1].toUpperCase()} ${m[2]}`, url: u };
    if (/sampling\+/.test(t)) return { name: 'Sampling+', url: /^https?:/.test(u) ? u : '' };
    if (/attribution noncommercial/.test(t)) return { name: 'CC BY-NC', url: '' };
    if (/attribution/.test(t)) return { name: 'CC BY', url: '' };
    return { name: text(u, 40) || 'Open license', url: /^https?:/.test(u) ? u : '' };
  }
  function fsItem(x) {
    const lic = fsLicense(x.license), title = text(x.name, 120).replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, '') || 'A sound', creator = text(x.username, 80);
    const pv = x.previews || {}, img = x.images || {};
    return remember({ ref: `freesound:audio:${String(x.id).replace(/\D/g, '')}`, source: 'freesound', provider: 'Freesound', kind: 'sound', title, creator,
      creatorUrl: creator ? `https://freesound.org/people/${encodeURIComponent(creator)}/` : '', license: lic.name, licenseUrl: lic.url,
      landing: /^https?:/.test(x.url || '') ? x.url : `https://freesound.org/s/${String(x.id).replace(/\D/g, '')}/`,
      attribution: `“${title}”${creator ? ` by ${creator}` : ''} (freesound.org) is licensed under ${lic.name}.`,
      thumbUrl: img.waveform_m || img.waveform_l || '', mediaUrl: pv['preview-hq-mp3'] || pv['preview-lq-mp3'] || pv['preview-hq-ogg'] || '', duration: Math.round(Number(x.duration) || 0), filetype: 'mp3', w: 0, h: 0 });
  }

  async function search(q, type, source, page) {
    q = String(q || '').trim().slice(0, 120); if (!q) throw err(400, 'search for something');
    const kind = type === 'audio' ? 'audio' : 'image'; page = Math.max(1, Math.min(10, +page || 1));
    let results = [];
    try {
      if (source === 'freesound') {
        if (!fsKey()) throw err(400, 'add a Freesound API key in Settings › More settings first');
        const j = await getJSON(`${FSD()}/apiv2/search/text/?query=${encodeURIComponent(q)}&page=${page}&page_size=20&fields=${FS_FIELDS}`, fsAuth());
        results = (j.results || []).slice(0, 20).map(fsItem);
        return { q, type: 'audio', source: 'freesound', results: results.map(r => ({ ...pub(r), thumb: via(r.thumbUrl, 1.5 * 1024 * 1024, IMG_ACCEPT), preview: r.mediaUrl ? via(r.mediaUrl, 6 * 1024 * 1024, AUD_ACCEPT) : '' })) };
      } else if (source === 'wikimedia' && kind === 'image') {
        const j = await getJSON(`${WM()}/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=24&gsroffset=${(page - 1) * 24}&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=480`);
        const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
        for (const pg of pages) {
          const ii = (pg.imageinfo || [])[0]; if (!ii) continue; const md = ii.extmetadata || {}, v = k => (md[k] && md[k].value) || '';
          const lic = text(v('LicenseShortName'), 40); if (!/^(cc|public domain|pd|cc0)/i.test(lic)) continue;   // only free licenses
          const title = text(v('ObjectName'), 120) || String(pg.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, ''), creator = text(v('Artist'), 80);
          results.push(remember({ ref: `wikimedia:image:${pg.pageid}`, source: 'wikimedia', provider: 'Wikimedia Commons', kind: 'image', title, creator, creatorUrl: '', license: lic, licenseUrl: /^https?:/.test(v('LicenseUrl')) ? v('LicenseUrl') : '', landing: ii.descriptionurl || '',
            attribution: `“${title}”${creator ? ` by ${creator}` : ''}, ${lic}, via Wikimedia Commons.`, thumbUrl: ii.thumburl || ii.url, mediaUrl: '', duration: 0, w: ii.width || 0, h: ii.height || 0 }));
        }
      } else {
        const j = await getJSON(`${OV()}/v1/${kind === 'audio' ? 'audio' : 'images'}/?q=${encodeURIComponent(q)}&page_size=20&page=${page}${kind === 'image' ? '&mature=false' : ''}`);
        results = (j.results || []).slice(0, 20).map(x => ovItem(x, kind));
      }
    } catch (e) {
      if (e.status) throw e;
      return { q, type: kind, source: source || 'openverse', offline: true, results: [], note: 'Couldn\'t reach the open media library: you may be offline. Your board still works.' };
    }
    return { q, type: kind, source: source || 'openverse', results: results.map(r => ({ ...pub(r), thumb: via(r.thumbUrl, 1.5 * 1024 * 1024, IMG_ACCEPT), preview: r.mediaUrl ? via(r.mediaUrl, 6 * 1024 * 1024, AUD_ACCEPT) : '' })) };
  }
  const pub = r => { const { thumbUrl, mediaUrl, ...rest } = r; return rest; };
  async function fetchToCache(h) {
    const dir = cacheDir(), f = path.join(dir, h), meta = f + '.json';
    if (fs.existsSync(f) && fs.existsSync(meta)) return { file: f, type: JSON.parse(fs.readFileSync(meta, 'utf8')).type };
    const u = urls.get(h); if (!u) return null;
    const r = await embeds.safeGet(u.url, u.cap, u.accept, { timeout: 12000, ua: UA['User-Agent'] });
    const type = String(r.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (!/^image\/(png|jpe?g|gif|webp|avif)$|^audio\//.test(type)) throw err(415, 'not a picture or a sound');
    if (r.body.length >= u.cap) throw err(413, 'too big to keep');
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, r.body); fs.writeFileSync(meta, JSON.stringify({ type, from: u.url, at: new Date().toISOString() }));
    return { file: f, type };
  }
  async function cache(req, res, h) {
    h = String(h || ''); if (!/^[a-f0-9]{40}$/.test(h)) { res.writeHead(404); return res.end(); }
    let c; try { c = await fetchToCache(h); } catch (e) { res.writeHead(e.status || 502, { 'Content-Type': 'text/plain' }); return res.end('unavailable'); }
    if (!c) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not cached'); }
    const st = fs.statSync(c.file), range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const head = { 'Content-Type': c.type, 'Cache-Control': 'public, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Content-Security-Policy': "default-src 'none'" };
    if (range && /^audio\//.test(c.type)) { const s0 = range[1] ? +range[1] : 0, e0 = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1; if (s0 >= st.size) { res.writeHead(416); return res.end(); } res.writeHead(206, { ...head, 'Content-Range': `bytes ${s0}-${e0}/${st.size}`, 'Content-Length': e0 - s0 + 1 }); return fs.createReadStream(c.file, { start: s0, end: e0 }).pipe(res); }
    res.writeHead(200, { ...head, 'Content-Length': st.size }); fs.createReadStream(c.file).pipe(res);
  }
  async function saveRef(pid, me, ref) {
    ref = String(ref || ''); let r = memo.get(ref);
    if (!r) {   // after a restart: look it up again by id (never from a URL the browser sent)
      const f = /^freesound:audio:(\d{1,12})$/.exec(ref);
      if (f) { if (!fsKey()) throw err(400, 'search again, then save'); try { r = fsItem(await getJSON(`${FSD()}/apiv2/sounds/${f[1]}/?fields=${FS_FIELDS}`, fsAuth())); } catch { throw err(502, 'couldn\'t reach Freesound'); } }
      else {
      const m = /^openverse:(image|audio):([a-z0-9-]{8,64})$/i.exec(ref); if (!m) throw err(400, 'search again, then save');
      try { r = ovItem(await getJSON(`${OV()}/v1/${m[1] === 'audio' ? 'audio' : 'images'}/${m[2]}/`), m[1]); } catch { throw err(502, 'couldn\'t reach the open media library'); }
      }
    }
    if (load(pid).items.some(x => x.ref === r.ref)) throw err(409, 'already on the board');
    const thumbH = r.thumbUrl ? hashOf(r.thumbUrl) : '', mediaH = r.mediaUrl ? hashOf(r.mediaUrl) : '';
    if (r.thumbUrl) via(r.thumbUrl, 1.5 * 1024 * 1024, IMG_ACCEPT); if (r.mediaUrl) via(r.mediaUrl, 6 * 1024 * 1024, AUD_ACCEPT);
    let colors = [], thumb = '', preview = '';
    if (thumbH) { try { const c = await fetchToCache(thumbH); thumb = `/api/inspo/cache/${thumbH}`; colors = imgcolors.colors(fs.readFileSync(c.file), 6); } catch (e) { if (r.kind === 'image') throw err(502, 'couldn\'t fetch the picture to keep a copy: ' + e.message); } }
    if (mediaH) { try { await fetchToCache(mediaH); preview = `/api/inspo/cache/${mediaH}`; } catch { preview = ''; } }
    return add(pid, me, { kind: r.kind, ref: r.ref, source: r.source, provider: r.provider, title: r.title, creator: r.creator, creatorUrl: r.creatorUrl, license: r.license, licenseUrl: r.licenseUrl, landing: r.landing, attribution: r.attribution,
      cached: thumb, preview, duration: r.duration, colors, fonts: [], measured: colors.length ? 'server' : '' });
  }

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      const boardQ = url.searchParams.get('board');
      const pidQ = boardQ === 'me' ? boardOf(me, 'me') : url.searchParams.get('project') || (me.role === 'local' ? boardOf(me, 'me') : P.current() || P.defaultId());
      if (b === 'freesound') {   // the host's Freesound key: never sent back, only whether there is one
        if (m === 'GET') return send(res, 200, { configured: !!fsKey() });
        if (m === 'PUT') { if (me.role !== 'host') return fail(res, 403, 'only the host sets the Freesound key'); const body = await readBody(req, 4096); return send(res, 200, { configured: setFsKey(body.key) }); }
        return fail(res, 405, 'GET or PUT');
      }
      if (b === 'search' && m === 'GET') { if (['spectator', 'guest'].includes(me.role)) return fail(res, 403, 'only builders can search'); return send(res, 200, await search(url.searchParams.get('q'), url.searchParams.get('type'), url.searchParams.get('source'), url.searchParams.get('page'))); }
      const mine = boardOf(me, 'me'), notYours = x => isMe(x) && x !== mine;   // review-2026-11-11: u-<someone else> is their private board
      if (notYours(pidQ)) return fail(res, 404, 'project not found');
      if (!b && m === 'GET') { if (!isMe(pidQ)) { const p = P.get(pidQ); if (!p || !P.canSee(me, pidQ)) return fail(res, 404, 'project not found'); } return send(res, 200, view(pidQ)); }
      const body = m === 'GET' || m === 'DELETE' ? {} : await readBody(req, 400 * 1024);
      const pid = body.board === 'me' || boardQ === 'me' ? boardOf(me, 'me') : String(body.project || pidQ).slice(0, 80);
      if (notYours(pid)) return fail(res, 404, 'project not found');
      if (b === 'save' && m === 'POST') { can(me, pid); return send(res, 200, { item: await saveRef(pid, me, body.ref), ...view(pid) }); }
      if (b === 'link' && m === 'POST') { can(me, pid); return send(res, 200, { item: await link(pid, me, body.url), ...view(pid) }); }
      if (b === 'image' && m === 'POST') {
        can(me, pid);
        const thumb = String(body.thumb || ''); if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(thumb) || thumb.length > 220 * 1024) return fail(res, 400, 'send a small picture (a jpeg, png or webp under 160 KB)');
        const colors = (Array.isArray(body.colors) ? body.colors : []).filter(c => HEX.test(c)).slice(0, 8).map(c => c.toUpperCase());
        return send(res, 200, { item: add(pid, me, { kind: 'image', title: String(body.name || 'A picture').slice(0, 80), thumb, colors, fonts: [] }), ...view(pid) });
      }
      if (b === 'font' && m === 'POST') { can(me, pid); const n = String(body.name || '').trim().slice(0, 60); if (!n) return fail(res, 400, 'which font?'); return send(res, 200, { item: add(pid, me, { kind: 'font', title: n, fonts: [n], colors: [] }), ...view(pid) }); }
      if (b === 'apply' && m === 'POST') {
        if (isMe(pid)) return fail(res, 400, 'pick a project to dress up');
        can(me, pid); if (body.shuffle) { const st = load(pid); st.shuffle = (st.shuffle || 0) + 1; save(pid, st); if (body.shuffle === 'only') return send(res, 200, view(pid)); }
        return send(res, 200, { ...(await apply(pid, me, ['site', 'app', 'both'].includes(body.to) ? body.to : 'both', body.from === 'me' ? boardOf(me, 'me') : null)), ...view(pid) });
      }
      if (b && !['link', 'image', 'font', 'apply', 'save', 'search', 'freesound'].includes(b)) {
        can(me, pid); const st = load(pid), it = st.items.find(x => x.id === b); if (!it) return fail(res, 404, 'not on the board');
        if (m === 'DELETE') { st.items = st.items.filter(x => x.id !== b); save(pid, st); broadcast && broadcast({ type: 'inspo', project: pid }); return send(res, 200, view(pid)); }
        if (m === 'PATCH') { if (Array.isArray(body.colors)) it.colors = body.colors.filter(c => HEX.test(c)).slice(0, 8).map(c => c.toUpperCase()); save(pid, st); return send(res, 200, view(pid)); }
      }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, view, apply, link, palette, fontFrom, parseHtml, search, cache, saveRef };
};
module.exports.palette = palette;
module.exports.fontFrom = fontFrom;
