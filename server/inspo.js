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
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const HEX = /^#[0-9a-f]{6}$/i;
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
  const file = pid => base.p('.tribe', 'inspo', `${String(pid).replace(/[^a-z0-9-]/gi, '')}.json`);
  const load = pid => { try { return JSON.parse(fs.readFileSync(file(pid), 'utf8')); } catch { return { items: [] }; } };
  const save = (pid, st) => { fs.mkdirSync(path.dirname(file(pid)), { recursive: true }); fs.writeFileSync(file(pid), JSON.stringify(st)); };
  const can = (me, pid) => { const p = P.get(pid); if (!p || !P.canSee(me, pid)) throw err(404, 'project not found'); if (!me || ['spectator', 'guest'].includes(me.role)) throw err(403, 'only builders can add inspiration'); };
  const rid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function view(pid) {
    const st = load(pid), cols = [];
    for (const it of st.items) (it.colors || []).forEach((c, i) => cols.push({ c, n: Math.max(1, 6 - i) * (it.kind === 'image' ? 2 : 1) }));
    const pal = palette(cols, st.shuffle || 0);
    const names = st.items.flatMap(it => it.fonts || []);
    return { items: st.items, palette: pal, font: fontFrom(names, pal), applied: st.applied || null };
  }
  function add(pid, me, it) {
    const st = load(pid); if (st.items.length >= 40) throw err(400, 'the board is full (40): take something off first');
    const item = { id: rid(), by: me.id, byName: nameOf(me.id), at: new Date().toISOString(), ...it };
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
  async function apply(pid, me, to = 'both') {
    const v = view(pid); if (!v.palette) throw err(400, 'add a picture or a link first: there are no colors on the board yet');
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

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      const pidQ = url.searchParams.get('project') || P.current() || P.defaultId();
      if (!b && m === 'GET') { const p = P.get(pidQ); if (!p || !P.canSee(me, pidQ)) return fail(res, 404, 'project not found'); return send(res, 200, view(pidQ)); }
      const body = m === 'GET' || m === 'DELETE' ? {} : await readBody(req, 400 * 1024);
      const pid = String(body.project || pidQ).slice(0, 80);
      if (b === 'link' && m === 'POST') { can(me, pid); return send(res, 200, { item: await link(pid, me, body.url), ...view(pid) }); }
      if (b === 'image' && m === 'POST') {
        can(me, pid);
        const thumb = String(body.thumb || ''); if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(thumb) || thumb.length > 220 * 1024) return fail(res, 400, 'send a small picture (a jpeg, png or webp under 160 KB)');
        const colors = (Array.isArray(body.colors) ? body.colors : []).filter(c => HEX.test(c)).slice(0, 8).map(c => c.toUpperCase());
        return send(res, 200, { item: add(pid, me, { kind: 'image', title: String(body.name || 'A picture').slice(0, 80), thumb, colors, fonts: [] }), ...view(pid) });
      }
      if (b === 'font' && m === 'POST') { can(me, pid); const n = String(body.name || '').trim().slice(0, 60); if (!n) return fail(res, 400, 'which font?'); return send(res, 200, { item: add(pid, me, { kind: 'font', title: n, fonts: [n], colors: [] }), ...view(pid) }); }
      if (b === 'apply' && m === 'POST') {
        can(me, pid); if (body.shuffle) { const st = load(pid); st.shuffle = (st.shuffle || 0) + 1; save(pid, st); if (body.shuffle === 'only') return send(res, 200, view(pid)); }
        return send(res, 200, { ...(await apply(pid, me, ['site', 'app', 'both'].includes(body.to) ? body.to : 'both')), ...view(pid) });
      }
      if (b && b !== 'link' && b !== 'image' && b !== 'font' && b !== 'apply') {
        can(me, pid); const st = load(pid), it = st.items.find(x => x.id === b); if (!it) return fail(res, 404, 'not on the board');
        if (m === 'DELETE') { st.items = st.items.filter(x => x.id !== b); save(pid, st); broadcast && broadcast({ type: 'inspo', project: pid }); return send(res, 200, view(pid)); }
        if (m === 'PATCH') { if (Array.isArray(body.colors)) it.colors = body.colors.filter(c => HEX.test(c)).slice(0, 8).map(c => c.toUpperCase()); save(pid, st); return send(res, 200, view(pid)); }
      }
      return fail(res, 404, 'not found');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, view, apply, link, palette, fontFrom, parseHtml };
};
module.exports.palette = palette;
module.exports.fontFrom = fontFrom;
