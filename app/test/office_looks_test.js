// Office looks: the character parts and their recolouring (app/ui/officelooks-core.js, app/ui/officespace/characters).
// Every part is a 128x96 sheet on the 16x32 frame grid with a full row of frames wherever it draws; nothing draws far
// outside the body; head parts move with the head (no jitter); every recolour keeps the number of distinct shades;
// random characters have no holes and no clashes; old looks still read; the server's look check uses the same fields.
// Usage: node app/test/office_looks_test.js
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const PNG = require('../../scripts/dev/png-lite.js');
const C = require('../ui/officelooks-core.js');
const DIR = path.join(__dirname, '../ui/officespace/characters');
const get = f => { const p = path.join(DIR, f); return fs.existsSync(p) ? PNG.decode(fs.readFileSync(p)) : null; };
let n = 0; const ok = m => { n++; console.log('ok  ' + m); };

// every part, with how it recolours
const parts = [];
for (const [field, list] of Object.entries(C.PARTS)) for (const p of list) if (p && p.file) parts.push({ field, p });
for (const e of ['plain', 'lashes']) for (const k of ['whites', 'iris.both', 'lashes']) parts.push({ field: 'eyes', p: { id: e + k, file: `eyes/${e}/${k}.png` } });
for (const e of ['lidded', 'stern', 'closed-stern']) parts.push({ field: 'eyes', p: { id: e, file: `eyes/${e}/lashes.png` } });
parts.push({ field: 'paper', p: { id: 'paper', file: 'props/paper.png' } });

// 1. files, size, frame grid
const body = get('body/flat.png');
const opaqueAt = (im, x, y) => im.data[(y * im.width + x) * 4 + 3] > 1;
function frameBox(im, r, c) { let x0 = 99, y0 = 99, x1 = -1, y1 = -1; for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) if (opaqueAt(im, c * 16 + x, r * 32 + y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return x1 < 0 ? null : { x0, y0, x1, y1 }; }
for (const { field, p } of parts) {
  const im = get(p.file); assert(im, `${p.file} is missing`);
  assert.strictEqual(im.width, 128, p.file); assert.strictEqual(im.height, 96, p.file);
  if (p.id !== 'stubble') for (let i = 3; i < im.data.length; i += 4) assert(im.data[i] < 2 || im.data[i] > 253, `${p.file}: half-transparent pixel`);   // stubble alone is a see-through shadow
  for (let r = 0; r < 3; r++) {
    const has = [0, 1, 2, 3, 4, 5, 6, 7].map(c => !!frameBox(im, r, c));
    if (field === 'paper' || !has.some(Boolean)) continue;
    // where the art itself leaves a frame empty: the page covers the hands while reading (front), the chair hides the
    // feet from behind while seated, and the tie hides behind the arm in some side frames
    const gap = [[5, 6], [3, 4, 5, 6, 7], /^tie\//.test(p.file) ? [2, 4, 6] : /^eyes\//.test(p.file) ? [5, 6] : []][r];   // eyes look down at the page in profile
    has.forEach((h, c) => assert(h || gap.includes(c), `${p.file}: row ${r} frame ${c} is empty`));
  }
}
ok(`${parts.length} part sheets are 128x96 with whole rows of 16x32 frames and no half-transparent pixels (but stubble)`);

// 2. nothing draws outside the body's box (per frame) by more than the margin
const MARGIN = 4;
for (const { p } of parts) {
  const im = get(p.file);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
    const b = frameBox(body, r, c), q = frameBox(im, r, c); if (!q) continue;
    assert(q.x0 >= b.x0 - MARGIN && q.x1 <= b.x1 + MARGIN && q.y0 >= b.y0 - MARGIN && q.y1 <= b.y1 + MARGIN, `${p.file}: frame ${r},${c} reaches outside the body by more than ${MARGIN}px (${JSON.stringify(q)} vs ${JSON.stringify(b)})`);
  }
}
ok(`no part draws more than ${MARGIN}px outside the body in any frame`);

// 3. head parts follow the head: their top stays at the same height above the head's top in every frame of a row
const HEAD = new Set(['hair', 'hat', 'eyewear', 'beard', 'headphones', 'earrings']);
for (const { field, p } of parts) {
  if (!HEAD.has(field)) continue;
  const im = get(p.file);
  for (let r = 0; r < 3; r++) {
    const offs = new Set();
    for (let c = 0; c < 8; c++) { const b = frameBox(body, r, c), q = frameBox(im, r, c); if (q) offs.add(q.y0 - b.y0); }
    assert(offs.size <= 1, `${p.file}: row ${r} jitters against the head (${[...offs]})`);
  }
}
ok('head parts (hair, hats, glasses, beards, headphones, earrings) move with the head in every frame: no jitter');

// 4. every recolour keeps the number of distinct shades; outlines stay; the base colour lands on the reference shade
let maps = 0;
for (const { field, p } of parts) {
  if (!p.pal) continue;
  const src = C.colours(get(p.file).data);
  for (const e of C.PAL[p.pal]) {
    const m = C.recolor(src, p, e.hex);
    const out = new Set(src.map(h => m.get(h) || h));
    assert.strictEqual(out.size, src.length, `${p.file} in ${e.name}: ${src.length} shades became ${out.size}`);
    maps++;
  }
  void field;
}
ok(`${maps} part-and-colour recolours keep every shade distinct`);
{
  const src = C.colours(get('top/tshirt.png').data), m = C.recolor(src, C.PARTS.top[0], '#c63b3b');
  const L = h => C.lch(h)[0];
  const sorted = [...src].sort((a, b) => L(a) - L(b));
  for (let i = 1; i < sorted.length; i++) assert(L(m.get(sorted[i])) > L(m.get(sorted[i - 1])), 'the ramp keeps its order dark to light');
  const g = C.colours(get('pants/jeans.png').data).find(h => C.lch(h)[0] < 0.2), mj = C.recolor(C.colours(get('pants/jeans.png').data), C.PARTS.pants[0], '#c63b3b');
  assert.strictEqual(mj.get(g), g, 'near-black outlines are kept');
  const sg = C.colours(get('shades/shades.png').data), ms = C.recolor(sg, C.PARTS.eyewear[2], '#b5313a');
  assert.strictEqual(ms.get('#2a3240'), '#2a3240', 'lenses keep their colour; only the frame changes');
  ok('a ramp keeps its order dark to light; outlines and lenses are kept');
}

// 5. random characters: the body is always there under the clothes, nothing clashes, every look is valid
{
  const r = C.rng('test');
  const bodies = [get('body/flat.png'), get('body/bust.png')], cache = new Map();
  for (let i = 0; i < 300; i++) {
    const L = C.random(r);
    for (const rule of C.conflicts) assert(!rule.when(L), `random look clashes: ${rule.why}`);
    for (const [k, nmax] of Object.entries(C.FIELDS)) assert(Number.isInteger(L[k]) && L[k] >= 0 && L[k] < nmax, `${k} out of range`);
    if (i % 5) continue;
    const sh = C.composite(L, get, cache); assert(!sh.missing.length, 'missing ' + sh.missing);
    const b = bodies[L.body];
    for (let p = 0; p < 128 * 96; p++) if (b.data[p * 4 + 3] > 1) assert(sh.data[p * 4 + 3] > 1, `random look ${i} has a hole at ${p % 128},${(p / 128) | 0}`);
  }
  ok('300 random characters: valid fields, no clashes, no holes where the body is');
}

// 6. old looks (v1 numbers) still read; compact/normalize round-trip; the server checks the same fields
{
  const old = { body: 1, skin: 3, hair: 4, hairColor: 17, top: 2, topColor: 0, acc: 2, extra: 6 };
  const L = C.normalize(old);
  assert.strictEqual(L.body, 1); assert.strictEqual(L.hair, 4); assert.strictEqual(C.PAL.skin[L.skin].id, 'deep');
  assert.strictEqual(C.PAL.hair[L.hairColor].id, 'black'); assert.strictEqual(C.PAL.cloth[L.topColor].id, 'red');
  assert.strictEqual(C.part('eyewear', L.eyewear).id, 'shades'); assert.strictEqual(L.lanyard, 1);
  const x = C.random(C.rng('rt')); assert.deepStrictEqual(C.normalize(C.compact(x)), x, 'compact then normalize gives the same look');
  // a clash resolves toward what was just chosen
  const hat = C.PARTS.hat.findIndex(p => p && p.id === 'beanie'), hs = C.PARTS.eyewear.findIndex(p => p && p.id === 'hairshades');
  assert.strictEqual(C.normalize({ v: 2, hat, eyewear: hs }, 'eyewear').hat, 0); assert.strictEqual(C.normalize({ v: 2, hat, eyewear: hs }, 'hat').eyewear, 0);
  const office = require('../../server/office.js')({ store: { readJSON: () => ({}), writeJSON() {} }, getMembers: () => [], presenceFor: () => [], agentSeen: null, claims: { list: () => [] }, loadTasks: () => [], changeReqs: () => [], nameOf: () => '', broadcast() {}, canSet: () => false });
  const clean = office.cleanLook({ v: 2, hair: C.FIELDS.hair - 1, skin: 99, evil: '<x>', hatColor: 3 });
  assert.strictEqual(clean.hair, C.FIELDS.hair - 1); assert(!('skin' in clean) && !('evil' in clean)); assert.strictEqual(clean.hatColor, 3);
  ok('old looks read as before (skin, hair colour, clothes, accessories); the server keeps only known fields in range');
}

// 7. how much there is to choose from
{
  const nParts = Object.values(C.PARTS).reduce((s, l) => s + l.filter(Boolean).length, 0);
  const nCol = Object.values(C.PAL).reduce((s, l) => s + l.length, 0);
  assert(nParts >= 90, 'at least 90 parts'); assert(nCol >= 75, 'at least 75 colours');
  ok(`${nParts} parts and ${nCol} colours`);
}
console.log(`\n${n} checks passed`);
