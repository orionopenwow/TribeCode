#!/usr/bin/env node
// Contact sheets for Office Space characters, drawn with the same rules the app uses (app/ui/officelooks-core.js), to
// compare parts and colours side by side and spot what doesn't match (outline weight, shading, saturation, alignment).
//   node scripts/dev/office-looks-sheet.js [outDir]       (default /tmp/office-looks)
// Writes: parts-<field>.png (every part in every colour on a plain character), random.png (60 random characters, front,
// side and back), frames.png (every frame of a few looks, to catch jitter), floor.png (characters on the office floor
// next to the furniture), skin.png (every skin tone with every hair colour).
'use strict';
const fs = require('fs'), path = require('path');
const PNG = require('./png-lite.js');
const C = require('../../app/ui/officelooks-core.js');
const ROOT = path.resolve(__dirname, '../..'), ART = path.join(ROOT, 'app/ui/officespace');
const OUT = process.argv[2] || '/tmp/office-looks';
fs.mkdirSync(OUT, { recursive: true });

const IMG = new Map();
function get(file, base = 'characters/') { const p = path.join(ART, base + file); if (!IMG.has(p)) IMG.set(p, fs.existsSync(p) ? PNG.decode(fs.readFileSync(p)) : null); return IMG.get(p); }
const maps = new Map();
const sheetOf = look => C.composite(look, f => get(f), maps);

// a canvas of RGBA
function canvas(w, h, bg) { const d = new Uint8Array(w * h * 4); if (bg) { const [r, g, b] = C.rgbOf(bg); for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } } return { w, h, d }; }
function blit(dst, src, sx, sy, sw, sh, dx, dy, z = 1, flip = false) {
  for (let y = 0; y < sh * z; y++) for (let x = 0; x < sw * z; x++) {
    const ux = Math.floor(x / z), uy = Math.floor(y / z), px = flip ? sx + sw - 1 - ux : sx + ux, si = ((sy + uy) * src.width + px) * 4;
    const a = src.data[si + 3]; if (a < 2) continue;
    const tx = dx + x, ty = dy + y; if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
    const di = (ty * dst.w + tx) * 4, k = a / 255;
    for (let c = 0; c < 3; c++) dst.d[di + c] = Math.round(src.data[si + c] * k + dst.d[di + c] * (1 - k));
    dst.d[di + 3] = 255;
  }
}
function rect(dst, x0, y0, w, h, hex) { const [r, g, b] = C.rgbOf(hex); for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { if (x < 0 || y < 0 || x >= dst.w || y >= dst.h) continue; const i = (y * dst.w + x) * 4; dst.d[i] = r; dst.d[i + 1] = g; dst.d[i + 2] = b; dst.d[i + 3] = 255; } }
const save = (cv, name) => { fs.writeFileSync(path.join(OUT, name), PNG.encode(cv.w, cv.h, cv.d)); return path.join(OUT, name); };
// frame (dir 0 down, 1 up, 2 right, 3 left; col 0-7) of a sheet at zoom z
function frame(dst, sh, dir, col, dx, dy, z) { if (dir === 3) blit(dst, sh, col * 16, 64, 16, 32, dx, dy, z, true); else blit(dst, sh, col * 16, [0, 32, 64][dir], 16, 32, dx, dy, z); }

// A plain character for showing one part: grey tee and jeans, short hair, light skin.
const PLAIN = { v: 2, body: 0, skin: 2, hair: C.PARTS.hair.findIndex(p => p.id === 'bald'), top: 0, topColor: 3, pants: 0, pantsColor: 4, shoes: 0, shoesColor: 5 };
const BG = '#2a2f3a', BG2 = '#323846';
const written = [];

// ---------- every part in every colour ----------
const PART_COLOUR = { body: 'skin', eyes: 'eyeColor', hair: 'hairColor', beard: 'beardColor', top: 'topColor', full: 'fullColor', pants: 'pantsColor', shoes: 'shoesColor',
  jacket: 'jacketColor', hat: 'hatColor', eyewear: 'frameColor', earrings: 'metalColor', necklace: 'metalColor', watch: 'metalColor', lanyard: 'lanyardColor', neck: 'neckColor', headphones: 'headphonesColor' };
for (const [field, cfield] of Object.entries(PART_COLOUR)) {
  const parts = C.PARTS[field].map((p, i) => [p, i]).filter(([p]) => p && p.file !== undefined);
  const ncol = cfield === 'beardColor' ? C.FIELDS.beardColor : C.FIELDS[cfield];
  const z = 3, cw = 16 * z + 4, ch = 32 * z + 4;
  const cv = canvas(cw * ncol + 4, ch * parts.length + 4, BG);
  parts.forEach(([p, i], row) => {
    for (let c = 0; c < ncol; c++) {
      const look = Object.assign({}, PLAIN, { [field]: i, [cfield]: c });
      if (field === 'beard') look.hair = 0;
      if (field === 'full') look.full = i;
      const sh = sheetOf(look);
      if ((row + c) % 2) rect(cv, 4 + c * cw - 2, 4 + row * ch - 2, cw, ch, BG2);
      frame(cv, sh, 0, 1, 4 + c * cw, 4 + row * ch, z);
    }
  });
  written.push(save(cv, `parts-${field}.png`));
}

// ---------- every part's shape: front, back, side, walking and seated, one colour (shapes-<n>.png) ----------
{
  const rows = [];
  for (const field of Object.keys(PART_COLOUR)) C.PARTS[field].forEach((p, i) => { if (p && p.file) rows.push([field, i]); });
  const views = [[0, 0], [0, 1], [0, 3], [0, 5], [1, 1], [1, 3], [2, 0], [2, 1], [2, 4], [3, 1]], z = 3, cw = 16 * z, ch = 32 * z + 2, per = 12;
  for (let page = 0; page * per < rows.length; page++) {
    const chunk = rows.slice(page * per, page * per + per), cv = canvas(cw * views.length + 8, ch * chunk.length + 4, BG);
    chunk.forEach(([field, i], row) => {
      const look = Object.assign({}, PLAIN, { hair: field === 'hair' ? i : 0, hairColor: 3, [field]: i, [PART_COLOUR[field]]: field === 'body' ? 2 : field === 'beard' ? 0 : C.COLOR[PART_COLOUR[field]] === 'cloth' ? 15 : 1 });
      if (row % 2) rect(cv, 0, 2 + row * ch, cv.w, ch, BG2);
      const sh = sheetOf(look); views.forEach(([d, col], k) => frame(cv, sh, d, col, 4 + k * cw, 2 + row * ch, z));
    });
    written.push(save(cv, `shapes-${page + 1}.png`));
  }
}

// ---------- 60 random characters: front, side, back ----------
{
  const r = C.rng(process.env.SEED || 'sheet'), n = 60, per = 10, z = 3, cw = 16 * z * 3 + 10, ch = 32 * z + 8;
  const cv = canvas(cw * per + 6, ch * Math.ceil(n / per) + 6, BG);
  for (let i = 0; i < n; i++) {
    const sh = sheetOf(C.random(r)), x = 6 + (i % per) * cw, y = 6 + Math.floor(i / per) * ch;
    if (((i % per) + Math.floor(i / per)) % 2) rect(cv, x - 3, y - 3, cw, ch, BG2);
    frame(cv, sh, 0, 1, x, y, z); frame(cv, sh, 2, 1, x + 16 * z, y, z); frame(cv, sh, 1, 1, x + 32 * z, y, z);
  }
  written.push(save(cv, 'random.png'));
}

// ---------- every frame of a few looks (jitter and stray pixels) ----------
{
  const r = C.rng('frames'), looks = [C.agent('a', 'claude'), ...Array.from({ length: 5 }, () => C.random(r))], z = 3;
  const cv = canvas(8 * 16 * z + 8, looks.length * 4 * 32 * z + 8, BG);
  looks.forEach((L, k) => { const sh = sheetOf(L); for (let dir = 0; dir < 4; dir++) for (let col = 0; col < 8; col++) frame(cv, sh, dir, col, 4 + col * 16 * z, 4 + (k * 4 + dir) * 32 * z, z); });
  written.push(save(cv, 'frames.png'));
}

// ---------- skin tones x hair colours ----------
{
  const z = 3, ns = C.PAL.skin.length, nh = C.PAL.hair.length, cw = 16 * z + 2, ch = 20 * z;
  const cv = canvas(cw * nh + 4, ch * ns * 2 + 4, BG);
  for (let s = 0; s < ns; s++) for (let h = 0; h < nh; h++) for (let b = 0; b < 2; b++) {
    const sh = sheetOf(Object.assign({}, PLAIN, { body: b, skin: s, hair: b ? 7 : 4, hairColor: h, eyes: 0 }));
    blit(cv, sh, 16, 0, 16, 20, 2 + h * cw, 2 + (s * 2 + b) * ch, z);
  }
  written.push(save(cv, 'skin.png'));
}

// ---------- characters on the office floor next to the furniture ----------
{
  const cat = JSON.parse(fs.readFileSync(path.join(ART, 'catalog.json'), 'utf8')).items;
  // Office set's wood (colourise h25 s48 b-43 c-88, as officespace-sets.js); a small port of officespace-art.js tint()
  const hsl2rgb = (h, s, l) => { if (!s) { const v = Math.round(l * 255); return [v, v, v]; } const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255)); };
  function tinted(file, cv) { const im = get(file, ''); const out = { width: im.width, height: im.height, data: new Uint8Array(im.data) }; const k = (100 + cv.c) / 100; for (let i = 0; i < out.data.length; i += 4) { const d = out.data; let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; l = 0.5 + (l - 0.5) * k; l = Math.max(0, Math.min(1, l + cv.b / 200)); const [r, g, b] = hsl2rgb(cv.h / 360, cv.s / 100, l); d[i] = r; d[i + 1] = g; d[i + 2] = b; } return out; }
  const wood = tinted('floors/floor_6.png', { h: 25, s: 48, b: -43, c: -88 }), wall = tinted('walls/wall_0.png', { h: 214, s: 30, b: -100, c: -55 });
  const z = 3, TW = 22, TH = 9, cv = canvas(TW * 16 * z, TH * 16 * z, '#12151a');
  for (let y = 1; y < TH; y++) for (let x = 0; x < TW; x++) blit(cv, wood, 0, 0, 16, 16, x * 16 * z, y * 16 * z, z);
  for (let x = 0; x < TW; x++) blit(cv, wall, 1 * 16 + 0, 2 * 32, 16, 32, x * 16 * z, -16 * z + 0, z);   // a straight east-west wall piece (mask 10)
  const item = (id, tx, ty) => { const it = cat[id]; if (!it) return; const v = it.views.front || it.views.side; const im = get('furniture/' + v.f, ''); if (!im) return; blit(cv, im, 0, 0, im.width, im.height, tx * 16 * z, (ty + (v.fh || 1)) * 16 * z - im.height * z, z); };
  const ids = Object.keys(cat);
  const want = ['DESK', 'PC', 'PLANT', 'BOOKSHELF', 'SOFA', 'COFFEE_TABLE', 'WHITEBOARD', 'CUSHIONED_BENCH'].filter(id => cat[id]);
  item('DOUBLE_BOOKSHELF', 1, 0); item('WHITEBOARD', 8, 0); item('HANGING_PLANT', 14, 0); item('PLANT', 20, 1);
  item('DESK', 2, 2); item('PC', 3, 2); item('DESK', 15, 2); item('PC', 16, 2);
  const r = C.rng('floor');
  const spots = [[1, 5, 0], [3, 5, 2], [5, 5, 0], [7, 4, 0], [9, 5, 3], [11, 5, 0], [13, 4, 0], [15, 5, 0], [17, 5, 2], [19, 5, 0], [2, 7, 0], [6, 7, 1], [10, 7, 0], [14, 7, 0], [18, 7, 3], [20, 7, 0]];
  spots.forEach(([x, y, dir], i) => { const sh = sheetOf(i === 0 ? C.agent('x', 'claude') : C.random(r)); frame(cv, sh, dir, 1, x * 16 * z, (y + 1) * 16 * z - 32 * z, z); });
  void ids; void want;
  written.push(save(cv, 'floor.png'));
}
console.log(written.join('\n'));
