#!/usr/bin/env node
// The TribeCode icon (since v0.9.9): a solid orange pixel-art flame between two white pixel brackets, on a deep navy
// rounded square. Drawn from the pixel map below on a 45 × 45 grid, so it stays crisp at every size (shape-rendering
// crispEdges). Writes the SVGs; scripts/render-icons.py turns them into every PNG / ICO / ICNS.
//   node scripts/icon.js            (then: python3 scripts/render-icons.py)
//   require('./icon').svg({ bg })   the markup, for scripts/wordmark.js's lockups
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const N = 45;                              // grid size
const NAVY = '#171B26', WHITE = '#F8FAFC', EMBER = '#F26B1D';
// Rows of [from, to] column runs (inclusive), keyed by grid row. Flame: a centre tongue, a left tongue that starts a
// row higher than the right one (the flame leans a little, on purpose), a round belly. Brackets: mirrored ( ).
const FLAME = {
  11: [[22, 22]], 12: [[21, 23]], 13: [[20, 24]], 14: [[19, 25]], 15: [[19, 25]], 16: [[19, 25]], 17: [[19, 25]],
  18: [[15, 16], [19, 25]], 19: [[15, 25], [28, 29]], 20: [[15, 25], [27, 29]], 21: [[15, 29]], 22: [[15, 30]],
  23: [[14, 30]], 24: [[14, 30]], 25: [[14, 30]], 26: [[14, 30]], 27: [[14, 30]], 28: [[14, 30]],
  29: [[15, 29]], 30: [[15, 29]], 31: [[17, 27]], 32: [[19, 25]], 33: [[20, 24]],
};
const LEFT = {
  14: [[9, 11]], 15: [[8, 11]], 16: [[7, 11]], 17: [[7, 10]], 18: [[6, 9]], 19: [[6, 8]],
  20: [[5, 8]], 21: [[5, 8]], 22: [[5, 8]], 23: [[5, 8]], 24: [[5, 8]], 25: [[5, 8]], 26: [[5, 8]], 27: [[5, 8]],
  28: [[6, 8]], 29: [[6, 9]], 30: [[7, 10]], 31: [[7, 11]], 32: [[8, 11]], 33: [[9, 11]],
};
const mirror = runs => Object.fromEntries(Object.entries(runs).map(([r, rs]) => [r, rs.map(([a, b]) => [N - 1 - b, N - 1 - a])]));
const RIGHT = mirror(LEFT);

function rects(map, fill) {
  let out = '';
  for (const [r, runs] of Object.entries(map)) for (const [a, b] of runs) out += `<rect x="${a}" y="${r}" width="${b - a + 1}" height="1"/>`;
  return `<g fill="${fill}">${out}</g>`;
}
// bg: 'square' (navy rounded square, the app icon), 'full' (navy edge to edge: maskable / Apple), 'none' (transparent)
function svg({ bg = 'square', size = 512, inset = 0 } = {}) {
  const art = `${rects(LEFT, WHITE)}${rects(RIGHT, WHITE)}${rects(FLAME, EMBER)}`;
  const back = bg === 'square' ? `<rect x="0" y="0" width="${N}" height="${N}" rx="10" fill="${NAVY}"/>` : bg === 'full' ? `<rect x="-${inset}" y="-${inset}" width="${N + 2 * inset}" height="${N + 2 * inset}" fill="${NAVY}"/>` : '';
  const vb = `${-inset} ${-inset} ${N + 2 * inset} ${N + 2 * inset}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}" shape-rendering="crispEdges"><title>TribeCode</title>${back}${art}</svg>`;
}
module.exports = { svg, N };

if (require.main === module) {
  const w = (f, s) => { fs.writeFileSync(path.join(root, f), s + '\n'); console.log('wrote', f); };
  w('assets/brand/icon.svg', svg());
  w('site/assets/brand/icon.svg', svg());
  w('app/ui/assets/icon.svg', svg());
  w('assets/brand/icon-maskable.svg', svg({ bg: 'full', inset: 6 }));   // safe zone: the art sits inside the middle 80%
  w('assets/brand/icon-mark.svg', svg({ bg: 'none' }));                   // the mark alone, for lockups on any background
}
