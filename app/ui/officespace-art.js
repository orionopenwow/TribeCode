// Office Space art (pass 11b): loads the pixel art in app/ui/officespace/ and turns it into ready-to-draw canvases.
// The art is Pixel Agents' (MIT, (c) 2026 Pablo De Lucca); the character parts are based on JIK-A-4's Metro City pack
// (CC0). Ideas ported to plain JavaScript from Pixel Agents: 16 px tiles; character sheets of 128x96 (rows down, up,
// right; columns walk1-3, type1-2, read1-2, seated) built from layered parts; exact colour swaps and Photoshop-style
// colourise; walls autotiled by their N/E/S/W neighbours; carpets by marching squares; furniture views per turn.
// Everything is cached: a tinted floor tile, wall piece, carpet piece, furniture view or character sheet is made once.
//   window.TribeOfficeArt = { ready() -> Promise, T, cat(), floor(), wall(), carpet(), furn(), sheet(), pet(), bubble(),
//     flint(), defaultLayout(n), parseType(), PARTS, wardrobe() }
(function () {
  'use strict';
  const T = 16, BASE = 'officespace/';
  let CAT = null, WARD = null, REF = null, BUB = {}, readyP = null;
  const IMG = new Map(), DATA = new Map(), CACHE = new Map();

  // ---------- loading ----------
  function load(path) {
    if (IMG.has(path)) return IMG.get(path);
    const p = new Promise(res => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = BASE + path; });
    IMG.set(path, p); p.then(im => { if (im) { IMG.set(path, im); LOADED.add(path); } });
    return p;
  }
  const LOADED = new Set();   // every art file that arrived (tests and the about box)
  const got = path => { const v = IMG.get(path); return v && !(v instanceof Promise) ? v : null; };
  const json = path => fetch(BASE + path).then(r => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); }).then(j => { LOADED.add(path); return j; });
  function pixels(path) {
    if (DATA.has(path)) return DATA.get(path);
    const im = got(path); if (!im) return null;
    const c = canvas(im.naturalWidth, im.naturalHeight), x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height); DATA.set(path, d); return d;
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function fromData(data, w, h) { const c = canvas(w, h); c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0); return c; }
  function flipped(src) { const c = canvas(src.width, src.height), x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c; }
  const memo = (k, f) => { if (CACHE.has(k)) return CACHE.get(k); const v = f(); if (v) CACHE.set(k, v); return v; };

  function ready() {
    if (readyP) return readyP;
    readyP = (async () => {
      [CAT, WARD, REF] = await Promise.all([json('catalog.json'), json('characters/wardrobe.json'), json('default-layout-1.json')]);
      const b = await Promise.all(['permission', 'waiting', 'pet'].map(n => json('bubbles/' + n + '.json').catch(() => null)));
      BUB = { ask: b[0], done: b[1], heart: b[2] };
      const files = ['walls/wall_0.png', 'pets/claudio/pet.png', 'pets/gitcat/pet.png'];
      for (let i = 0; i < 9; i++) files.push(`floors/floor_${i}.png`);
      for (let i = 0; i < 3; i++) files.push(`carpets/carpet_${i}.png`);
      for (const it of Object.values(CAT.items)) for (const v of Object.values(it.views)) { files.push('furniture/' + v.f); for (const f of v.on || []) files.push('furniture/' + f); }
      await Promise.all(files.map(load));
      return api;
    })();
    readyP.catch(() => { readyP = null; });
    return readyP;
  }

  // ---------- colour (ported from Pixel Agents: colour swaps, then adjust or colourise) ----------
  const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const hex2 = v => v.toString(16).padStart(2, '0');
  const hexOf = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
  const rgbOf = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function hsl2rgb(h, s, l) {   // each 0-1
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  // cv: { h, s, b, c, colorize?, palette? } as in wardrobe.json; swaps: { name: { '#from': '#to' } }
  function tint(src, cv, swaps) {
    const sw = cv && cv.palette && swaps ? swaps[cv.palette] : null;
    const map = sw ? new Map(Object.entries(sw).map(([a, z]) => [a.toLowerCase(), rgbOf(z)])) : null;
    const shift = cv && (cv.colorize || cv.h || cv.s || cv.b || cv.c);
    const out = new Uint8ClampedArray(src.length), k = cv ? (100 + (cv.c || 0)) / 100 : 1;
    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] < 2) continue;
      let r = src[i], g = src[i + 1], b = src[i + 2];
      const m = map && map.get(hexOf(r, g, b)); if (m) [r, g, b] = m;
      if (shift) {
        let h, s, l;
        if (cv.colorize) { h = cv.h / 360; s = cv.s / 100; l = lum(r, g, b); }
        else { const [oh, os, ol] = rgb2hsl(r, g, b); h = (((oh + cv.h) % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(1, os + cv.s / 100)); l = ol; }
        if (cv.c) l = 0.5 + (l - 0.5) * k;
        l = Math.max(0, Math.min(1, l + (cv.b || 0) / 200));
        [r, g, b] = hsl2rgb(h, s, l);
      }
      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = src[i + 3];
    }
    return out;
  }
  const ck = cv => cv ? `${cv.h | 0},${cv.s | 0},${cv.b | 0},${cv.c | 0},${cv.colorize ? 1 : 0},${cv.palette || ''}` : '-';
  // A hex from a set's palette as a colourise value, so a set can stay a list of colours.
  function cvOf(v) {
    if (v && typeof v === 'object') return { h: +v.h || 0, s: +v.s || 0, b: +v.b || 0, c: +v.c || 0, colorize: true };
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) { const [h, s, l] = rgb2hsl(...rgbOf(v)); return { h: Math.round(h), s: Math.round(s * 100), b: Math.round((l - 0.5) * 200), c: -60, colorize: true }; }
    return null;
  }
  function region(path, sx, sy, w, h) {
    const d = pixels(path); if (!d) return null;
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(d.data.subarray(((sy + y) * d.width + sx) * 4, ((sy + y) * d.width + sx + w) * 4), y * w * 4);
    return out;
  }

  // ---------- floors, walls, carpets ----------
  function floor(i, cv) { return memo(`fl${i}|${ck(cv)}`, () => { const d = region(`floors/floor_${i}.png`, 0, 0, T, T); return d && fromData(cv ? tint(d, { ...cv, colorize: true }) : d, T, T); }); }
  // mask: N1 E2 S4 W8 (walls next to this one); 16x32, drawn with its bottom on the tile
  function wall(mask, cv) { return memo(`wa${mask}|${ck(cv)}`, () => { const d = region('walls/wall_0.png', (mask % 4) * T, Math.floor(mask / 4) * 32, T, 32); return d && fromData(cv ? tint(d, { ...cv, colorize: true }) : d, T, 32); }); }
  // case: marching squares over the four tiles around a corner (NW1 NE2 SE4 SW8); drawn centred on the corner
  function carpet(v, c, cv) { return memo(`ca${v}.${c}|${ck(cv)}`, () => { const d = region(`carpets/carpet_${v}.png`, (c % 4) * T, Math.floor(c / 4) * T, T, T); return d && fromData(cv ? tint(d, { ...cv, colorize: true }) : d, T, T); }); }

  // ---------- furniture ----------
  const cat = () => (CAT ? CAT.items : {});
  // r: 0 front, 1 side (facing right), 2 back, 3 side facing left (mirrored when the art allows)
  function viewOf(id, r) {
    const it = cat()[id]; if (!it) return null;
    const V = it.views, want = [V.front, V.side, V.back, V.side][r | 0] || V.front || V.side || V.back;
    return want;
  }
  function furn(id, r, opt) {
    const v = viewOf(id, r); if (!v) return null;
    const flip = (r | 0) === 3 && v.mirror;
    const file = opt && opt.on && v.on ? v.on[(opt.frame | 0) % v.on.length] || v.f : v.f;
    return memo(`fu${file}|${flip ? 1 : 0}|${ck(opt && opt.cv)}`, () => {
      const im = got('furniture/' + file); if (!im) return null;
      let c = canvas(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0);
      if (opt && opt.cv) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height); c = fromData(tint(d.data, opt.cv), c.width, c.height); }
      return flip ? flipped(c) : c;
    });
  }
  // Size in tiles of an item at a turn: { fw, fh, w, h, bg }
  function size(id, r) { const it = cat()[id], v = viewOf(id, r); if (!it || !v) return null; return { fw: v.fw, fh: v.fh, w: v.w, h: v.h, bg: it.bg | 0, cat: it.cat, wall: !!it.wall, surface: !!it.surface, on: !!v.on }; }

  // ---------- characters (layered parts, Pixel Agents' order) ----------
  const LAYERS = ['body', 'whites', 'iris', 'lashes', 'pants', 'top', 'full', 'tie', 'jacket', 'lanyard', 'necklace', 'watch', 'shoes', 'hair', 'earrings', 'beard', 'shades', 'hairshades', 'hat'];
  const EYES = { flat: 'plain', bust: 'lashes' };
  const part = (slot, id) => ((WARD && WARD.parts[slot]) || []).find(p => p.id === id) || null;
  const valueOf = (slot, id, i) => { const P = WARD && WARD.palettes[slot]; const vals = P && P.values && P.values[id]; return vals && vals.length ? vals[((i | 0) % vals.length + vals.length) % vals.length] : null; };
  // A look is plain numbers (server/office.js checks them); these lists turn them into part ids.
  const PARTS = {
    body: ['flat', 'bust'],
    hair: ['short', 'spiky', 'parted', 'side_swept', 'mop', 'bowl_cut', 'slicked_back', 'bob', 'shoulder_length', 'long', 'long_waves', 'long_bangs', 'high_ponytail', 'low_ponytail'],
    top: ['tshirt', 'long_sleeved_shirt', 'turtleneck', 'tank_top', 'tank_long'],
    pants: ['jeans', 'low_cut_jeans', 'shorts', 'fitted_shorts', 'skirt', 'short_skirt', 'long_skirt'],
    shoes: ['sneakers', 'boots'],
    jacket: [null, 'open_shirt', 'vest', 'blazer', 'bomber', 'long_coat'],
    full: [null, 'business_suit', 'suit_and_tie', 'dress', 'fitted_dress'],
    beard: [null, 'stubble', 'moustache', 'goatee', 'full_beard', 'long_beard'],
    hat: [null, 'plain_cap', 'flap_cap', 'badge_cap'],
    acc: [null, 'glasses', 'shades', 'earrings', 'necklace', 'watch', 'lanyard', 'hairshades'],
  };
  const ACC_SLOT = { glasses: 'shades', shades: 'shades', earrings: 'earrings', necklace: 'necklace', watch: 'watch', lanyard: 'lanyard', hairshades: 'hairshades' };
  const pick = (k, i) => { const L = PARTS[k]; return L[((i | 0) % L.length + L.length) % L.length]; };
  // look -> { slot: { id, cv } } in draw order
  function dress(look) {
    const L = look || {}, out = {};
    const body = pick('body', L.body), full = pick('full', L.full);
    out.body = { id: body, cv: valueOf('body', body, L.skin) };
    const eyes = EYES[body] || 'plain';
    out.whites = { file: `eyes/${eyes}/whites.png` }; out.iris = { file: `eyes/${eyes}/iris.both.png` }; out.lashes = { file: `eyes/${eyes}/lashes.png` };
    if (full) { out.full = { id: full, cv: valueOf('full', full, L.fullColor) }; if (full === 'suit_and_tie') out.tie = { file: 'tie/suit_and_tie.png' }; }
    else {
      const top = pick('top', L.top), pants = pick('pants', L.pants);
      out.top = { id: top, cv: valueOf('top', top, L.topColor) }; out.pants = { id: pants, cv: valueOf('pants', pants, L.pantsColor) };
    }
    const jacket = pick('jacket', L.jacket); if (jacket) out.jacket = { id: jacket, cv: valueOf('jacket', jacket, L.jacketColor) };
    const shoes = pick('shoes', L.shoes); out.shoes = { id: shoes, cv: valueOf('shoes', shoes, L.shoesColor) };
    const hair = pick('hair', L.hair); out.hair = { id: hair, cv: valueOf('hair', hair, L.hairColor) };
    const beard = pick('beard', L.beard); if (beard) out.beard = { id: beard, cv: valueOf('beard', beard, L.hairColor) };
    const hat = pick('hat', L.hat); if (hat) out.hat = { id: hat, cv: valueOf('hat', hat, L.hatColor) };
    for (const a of [pick('acc', L.acc), L.extra ? pick('acc', L.extra) : null]) if (a) { const s = ACC_SLOT[a]; out[s] = { id: a, cv: valueOf(s, a, L.accColor) }; }
    return out;
  }
  const lookKey = look => JSON.stringify(look || {});
  // Every part file a look needs (they load on first use, then stay cached by the service worker).
  function partFiles(d) { return Object.entries(d).map(([slot, p]) => 'characters/' + (p.file || `${slot === 'shades' && p.id === 'glasses' ? 'shades' : slot}/${p.id}.png`)); }
  // The look's sheet (128x96), composed bottom to top; earrings go under the hair in the back view. null until loaded.
  function sheet(look, onload) {
    const key = 'ch' + lookKey(look);
    if (CACHE.has(key)) return CACHE.get(key);
    const d = dress(look), files = partFiles(d);
    const missing = files.filter(f => !got(f));
    if (missing.length) { Promise.all(missing.map(load)).then(() => onload && onload()); return null; }
    const W = 128, H = 96, out = new Uint8ClampedArray(W * H * 4);
    const put = (src, rows) => { for (let i = 0; i < src.length; i += 4) { if (src[i + 3] < 2) continue; const row = Math.floor(i / 4 / W / 32); if (rows && !rows.includes(row)) continue; out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3]; } };
    const layer = slot => { const p = d[slot]; if (!p) return null; const file = 'characters/' + (p.file || `${slot}/${p.id}.png`); const px = pixels(file); if (!px || px.width !== W) return null; const pr = p.id ? part(slot, p.id) : null; return tint(px.data, p.cv, pr && pr.swaps); };
    const cooked = {}; for (const s of LAYERS) cooked[s] = layer(s);
    for (const s of LAYERS) {
      if (!cooked[s]) continue;
      if (s === 'hair') { put(cooked.hair); if (cooked.earrings) put(cooked.earrings, [0, 2]); continue; }
      if (s === 'earrings') continue;
      if (s === 'body' && cooked.earrings) { put(cooked.body); put(cooked.earrings, [1]); continue; }
      put(cooked[s]);
    }
    const c = fromData(out, W, H), sh = { c, left: null };
    CACHE.set(key, sh);
    return sh;
  }
  // dir: 0 down, 1 up, 2 right, 3 left; col: 0-2 walk, 3-4 type, 5-6 read, 7 seated. Anchored bottom-centre at (x, y).
  function drawSheet(ctx, sh, dir, col, x, y) {
    if (!sh) return;
    if (dir === 3) { if (!sh.left) sh.left = flipped(sh.c); ctx.drawImage(sh.left, (7 - col) * 16, 64, 16, 32, x - 8, y - 32, 16, 32); return; }
    ctx.drawImage(sh.c, col * 16, [0, 32, 64][dir] || 0, 16, 32, x - 8, y - 32, 16, 32);
  }

  // ---------- pets: 6 columns (walk 0-2, rest 3-5) by 3 rows (down, up, right), 16x32 ----------
  function pet(name) { return memo('pet' + name, () => { const im = got(`pets/${name}/pet.png`); if (!im) return null; const c = canvas(96, 96); c.getContext('2d').drawImage(im, 0, 0); return { c, left: flipped(c) }; }); }
  function drawPet(ctx, p, dir, col, x, y) { if (!p) return; if (dir === 3) ctx.drawImage(p.left, (5 - col) * 16, 64, 16, 32, x - 8, y - 32, 16, 32); else ctx.drawImage(p.c, col * 16, [0, 32, 64][dir] || 0, 16, 32, x - 8, y - 32, 16, 32); }

  // ---------- bubbles (Pixel Agents' 11x13 speech bubbles) and Flint (ours, redrawn at this scale) ----------
  function fromRows(rows, pal) {
    const h = rows.length, w = rows[0].length, d = new Uint8ClampedArray(w * h * 4);
    rows.forEach((row, y) => [...row].forEach((k, x) => { const col = pal[k]; if (!col) return; const [r, g, b] = rgbOf(col), i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }));
    return fromData(d, w, h);
  }
  function bubble(kind) { const b = BUB[kind]; return b ? memo('bu' + kind, () => fromRows(b.rows, b.palette)) : null; }
  // Flint: a small flame in Ember, two flicker frames, 11x15, drawn bottom-centre like a character.
  const FLINT = [
    ['....a......', '...ab...a..', '...abb..ab.', '..abbb.abb.', '..abbbbabb.', '.abbcbbbbba', '.abbccbbbba', 'abbcccccbba', 'abccdddccba', 'abcckdkccba', 'abccdddccba', '.abcccccba.', '..abbbbba..', '...aaaaa...', '...........'],
    ['.....a.....', '....ab..a..', '...abb.ab..', '...abbbabb.', '..abbbbbbb.', '.abbcbbbbba', '.abbccbbbba', 'abbcccccbba', 'abccdddccba', 'abcckdkccba', 'abccdddccba', '.abcccccba.', '..abbbbba..', '...aaaaa...', '...........'],
  ];
  const FLINT_PAL = { a: '#A8400F', b: '#F26B1D', c: '#FFA040', d: '#FFE2A8', k: '#12151A' };
  function flint(frame) { const i = (frame | 0) % 2; return memo('flint' + i, () => fromRows(FLINT[i], FLINT_PAL)); }

  // ---------- the default office: Pixel Agents' default-layout-1.json, cropped, with desks added for bigger tribes ----------
  const TILE_OF = { 255: 'void', 0: 'wall', 1: 'floor', 7: 'wood', 9: 'tile' };
  // 'SOFA_SIDE:left' -> { t: 'SOFA', r: 3 }; 'PC_FRONT_OFF' -> { t: 'PC', r: 0 }
  function parseType(s) {
    s = String(s || ''); const left = /:left$/.test(s); s = s.replace(/:left$/, '');
    if (cat()[s]) return { t: s, r: 0 };
    const ids = Object.keys(cat()).sort((a, b) => b.length - a.length);
    for (const id of ids) if (s.startsWith(id + '_')) { const rest = s.slice(id.length + 1); const r = /^BACK/.test(rest) ? 2 : /^SIDE/.test(rest) ? (left ? 3 : 1) : 0; return { t: id, r }; }
    return null;
  }
  function defaultLayout(n) {
    const R = REF; if (!R) return null;
    const top = 9, bottom = 20, cols = 20;
    let w = cols, h = bottom - top + 1;
    let tiles = [];
    for (let y = top; y <= bottom; y++) for (let x = 0; x < cols; x++) tiles.push(TILE_OF[R.tiles[y * R.cols + x]] || 'floor');
    let items = [];
    for (const f of R.furniture) { const p = parseType(f.type); if (p && f.row >= top) items.push({ t: p.t, x: f.col, y: f.row - top, r: p.r }); }
    // a whiteboard for "handed work in" (the task board), where the small painting was
    items = items.filter(i => !(i.t === 'SMALL_PAINTING' && i.x === 12)); items.push({ t: 'WHITEBOARD', x: 12, y: 0, r: 0 });
    // bigger tribes: widen the work room by 4 columns per two extra desks (up to 40 columns)
    const extra = Math.max(0, Math.min(5, Math.ceil(((n | 0) - 6) / 2)));
    if (extra) {
      const at = 10, add = extra * 4, nt = [];
      for (let y = 0; y < h; y++) { const row = tiles.slice(y * w, y * w + w); nt.push(...row.slice(0, at), ...Array(add).fill(row[at - 1]), ...row.slice(at)); }
      tiles = nt; w += add;
      items.forEach(i => { if (i.x >= at) i.x += add; });
      for (let k = 0; k < extra; k++) {
        const x = at + k * 4;
        items.push({ t: 'DESK', x, y: 3, r: 0 }, { t: 'PC', x: x + 1, y: 3, r: 0 }, { t: 'CUSHIONED_BENCH', x: x + 1, y: 5, r: 0 });
        items.push({ t: 'DESK', x, y: 8, r: 0 }, { t: 'PC', x: x + 1, y: 8, r: 0 }, { t: 'CUSHIONED_BENCH', x: x + 1, y: 10, r: 0 });
        items.push(k % 2 ? { t: 'HANGING_PLANT', x: x + 1, y: 0, r: 0 } : { t: 'DOUBLE_BOOKSHELF', x: x + 1, y: 0, r: 0 });
      }
    }
    return { v: 2, w, h, tiles, items, areas: [] };
  }

  const api = {
    T, ready, cat, size, viewOf, floor, wall, carpet, furn, sheet, drawSheet, pet, drawPet, bubble, flint, cvOf, parseType, defaultLayout,
    PARTS, dress, partFiles, wardrobe: () => WARD,
    swatches: slot => ((WARD && WARD.palettes[slot] && WARD.palettes[slot].squares) || []).map(s => s.hex),
    label: (slot, id) => { const p = part(slot, id); return p ? p.label : id; },
    loaded: () => !!CAT,
    files: () => [...LOADED],
  };
  window.TribeOfficeArt = api;
})();
