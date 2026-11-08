#!/usr/bin/env node
// The TribeCode icon (since v0.9.9): a solid orange pixel-art flame between two white pixel brackets, on the Campfire grey slate (#282828, since v0.10.9)
// rounded square. Drawn from the pixel map below on a 45 × 45 grid, so it stays crisp at every size (shape-rendering
// crispEdges). Writes the SVGs; scripts/render-icons.py turns them into every PNG / ICO / ICNS.
//   node scripts/icon.js            (then: python3 scripts/render-icons.py)
//   require('./icon').svg({ bg })   the markup, for scripts/wordmark.js's lockups
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const N = 45;                              // grid size
const NAVY = '#282828', WHITE = '#F8FAFC', EMBER = '#F26B1D';
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
// bg: 'square' (slate rounded square, the app icon), 'full' (slate edge to edge: maskable / Apple), 'none' (transparent)
function svg({ bg = 'square', size = 512, inset = 0 } = {}) {
  const art = `${rects(LEFT, WHITE)}${rects(RIGHT, WHITE)}${rects(FLAME, EMBER)}`;
  const back = bg === 'square' ? `<rect x="0" y="0" width="${N}" height="${N}" rx="10" fill="${NAVY}"/>` : bg === 'full' ? `<rect x="-${inset}" y="-${inset}" width="${N + 2 * inset}" height="${N + 2 * inset}" fill="${NAVY}"/>` : '';
  const vb = `${-inset} ${-inset} ${N + 2 * inset} ${N + 2 * inset}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}" shape-rendering="crispEdges"><title>TribeCode</title>${back}${art}</svg>`;
}
// ---- the flicker (since v0.10.0): four frames of the same solid flame, shifted a pixel at the tip and the tongues ----
const shift = (map, rows, dx) => Object.fromEntries(Object.entries(map).map(([r, rs]) => [r, rows.includes(+r) ? rs.map(([a2, b2]) => [a2 + dx, b2 + dx]) : rs]));
const add = (map, extra) => { const m = JSON.parse(JSON.stringify(map)); for (const [r, rs] of Object.entries(extra)) m[r] = [...(m[r] || []), ...rs]; return m; };
const FRAMES = [
  FLAME,                                                          // rest
  add(shift(FLAME, [11, 12, 13], 1), { 17: [[16, 16]] }),        // tip leans right, the left tongue reaches up
  add(FLAME, { 10: [[22, 22]], 18: [[28, 28]] }),                 // tip stretches, the right tongue reaches up
  shift(FLAME, [11, 12, 13], -1),                                 // tip leans left
];
// An SVG that flickers by itself (CSS steps, no script), so it animates even inside <img>. Reduced motion: the rest frame.
// once: plays the flicker a couple of times and settles on the rest frame (the top-left logo on hover).
function animated({ bg = 'square', size = 512, speed = 0.72, once = 0 } = {}) {
  const st = `<style>.f{opacity:0;animation:tcf ${speed}s steps(1,end) ${once || 'infinite'}}.f0{opacity:1}${FRAMES.map((_, i) => `.f${i}{animation-delay:${(once ? i * speed / FRAMES.length : -speed + i * speed / FRAMES.length).toFixed(3)}s}`).join('')}@keyframes tcf{0%{opacity:1}${(100 / FRAMES.length).toFixed(2)}%{opacity:0}100%{opacity:0}}@media (prefers-reduced-motion:reduce){.f{animation:none;opacity:0}.f0{opacity:1}}</style>`;
  const back = bg === 'square' ? `<rect x="0" y="0" width="${N}" height="${N}" rx="10" fill="${NAVY}"/>` : '';
  const flames = FRAMES.map((m, i) => `<g class="f f${i}">${rects(m, EMBER)}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${size}" height="${size}" shape-rendering="crispEdges"><title>TribeCode</title>${st}${back}${rects(LEFT, WHITE)}${rects(RIGHT, WHITE)}${flames}</svg>`;
}
// one frame as a static SVG (for the GIF renderer)
function frame(i, { bg = 'square', size = 512 } = {}) {
  const back = bg === 'square' ? `<rect x="0" y="0" width="${N}" height="${N}" rx="10" fill="${NAVY}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" width="${size}" height="${size}" shape-rendering="crispEdges">${back}${rects(LEFT, WHITE)}${rects(RIGHT, WHITE)}${rects(FRAMES[i], EMBER)}</svg>`;
}
// ---- Flint, the mascot (since v0.10.6): the logo's flame alone, flickering like the logo, with two black pixel
// eyes that blink now and then. The logo itself never has eyes; Flint does, wherever he shows up.
const INK = '#12151A';
const EYES = { 23: [[20, 20], [24, 24]], 24: [[20, 20], [24, 24]] };      // two eyes, 1 × 2 pixels, a pixel apart from the middle
const BLINK = { 24: [[20, 20], [24, 24]] };                                // half-closed: 1 × 1
const FB = [14, 10, 31, 34];                                               // the flame's box on the grid: x, y, w, h (with room for the flicker)
function flint({ size = 64, speed = 0.72, blink = true } = {}) {
  const vb = `${FB[0] - 1} ${FB[1] - 1} ${FB[2] - FB[0] + 3} ${FB[3] - FB[1] + 2}`;
  const st = `<style>.f{opacity:0;animation:tcf ${speed}s steps(1,end) infinite}.f0{opacity:1}${FRAMES.map((_, i) => `.f${i}{animation-delay:${(-speed + i * speed / FRAMES.length).toFixed(3)}s}`).join('')}@keyframes tcf{0%{opacity:1}${(100 / FRAMES.length).toFixed(2)}%{opacity:0}100%{opacity:0}}`
    + (blink ? `.eo{animation:tce 4.2s steps(1,end) infinite}.ec{opacity:0;animation:tcb 4.2s steps(1,end) infinite}@keyframes tce{0%{opacity:1}94%{opacity:0}97%{opacity:1}}@keyframes tcb{0%{opacity:0}94%{opacity:1}97%{opacity:0}}` : '')
    + `@media (prefers-reduced-motion:reduce){.f,.eo,.ec{animation:none}.f{opacity:0}.f0,.eo{opacity:1}.ec{opacity:0}}</style>`;
  const flames = FRAMES.map((m, i) => `<g class="f f${i}">${rects(m, EMBER)}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${Math.round(size * (FB[3] - FB[1] + 2) / (FB[2] - FB[0] + 3))}" shape-rendering="crispEdges"><title>Flint</title>${st}${flames}<g class="eo">${rects(EYES, INK)}</g><g class="ec">${rects(BLINK, INK)}</g></svg>`;
}
module.exports = { svg, animated, frame, flint, FRAMES, N };

if (require.main === module) {
  fs.mkdirSync(path.join(root, 'assets/brand/frames'), { recursive: true });
  const w = (f, s) => { fs.writeFileSync(path.join(root, f), s + '\n'); console.log('wrote', f); };
  w('assets/brand/icon.svg', svg());
  w('site/assets/brand/icon.svg', svg());
  w('app/ui/assets/icon.svg', svg());
  w('assets/brand/icon-maskable.svg', svg({ bg: 'full', inset: 6 }));   // safe zone: the art sits inside the middle 80%
  w('assets/brand/icon-mark.svg', svg({ bg: 'none' }));                   // the mark alone, for lockups on any background
  w('app/ui/assets/icon-animated.svg', animated());                      // loading: the slate tile, flickering
  w('app/ui/assets/icon-mark-animated.svg', animated({ bg: 'none' }));   // loading inline: the mark alone
  w('app/ui/assets/icon-mark.svg', svg({ bg: 'none' }));                  // the top-left logo at rest (its button is the tile)
  w('app/ui/assets/icon-mark-once.svg', animated({ bg: 'none', once: 2 })); // the top-left logo on hover: one short flicker
  w('site/assets/brand/icon-animated.svg', animated());
  for (let i = 0; i < FRAMES.length; i++) w(`assets/brand/frames/icon-${i}.svg`, frame(i));
  w('app/ui/assets/flint.svg', flint());                               // Flint, the mascot: flickering, blinking
  w('assets/brand/flint.svg', flint());
  w('site/assets/brand/flint.svg', flint());
}
