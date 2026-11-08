#!/usr/bin/env node
// Draws the "TribeCode" wordmark (Inter Bold outlines from scripts/wordmark-glyphs.json, no font needed)
// and writes every lockup used by the README, docs and app.  Usage: node scripts/wordmark.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// The letters come from Inter Bold, traced once into scripts/wordmark-glyphs.json (scripts/wordmark-glyphs.py):
// top of the tallest letter at y=0, baseline at y=100. "Tribe" takes the ink color, "Code" is Ember.
// Since v0.15.1 the wordmark is pixel lettering (scripts/wordmark-pixel.js): white "Tribe", Ember "Code", darker
// bottom shades and a near-black outline, so one version reads on light and dark backgrounds. Scaled to 100 units tall.
const PX = require('./wordmark-pixel');
function wordmark() {
  const w = PX.wordmark(), k = 100 / w.height;
  return { body: `<g transform="scale(${k.toFixed(5)})" shape-rendering="crispEdges">${w.body}</g>`, width: Math.round(w.width * k * 10) / 10 };
}

// the icon: the pixel flame between brackets on navy (scripts/icon.js)
const ICONSVG = require('./icon').svg({ size: 0 });
const ICON_INNER = ICONSVG.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<title>[^<]*<\/title>/, '');

function write(file, svg) { fs.writeFileSync(path.join(root, file), svg + '\n'); console.log('wrote', file); }
const ORANGE = '#F26B1D';
for (const [suffix, tribe] of [['', '#1D2021'], ['-dark', '#F8FAFC']]) {
  const wm = wordmark({ tribe, code: ORANGE });
  // text only
  write(`assets/brand/logo-text${suffix}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${wm.width + 8} 108" width="${Math.round((wm.width + 8) * 0.6)}" height="${Math.round(108 * 0.6)}"><title>TribeCode</title>${wm.body}</svg>`);
  // icon + text lockup
  const s = 0.255, iconW = 496 * s, gap = 34, tx = iconW + gap;
  write(`assets/brand/logo-wordmark${suffix}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(tx + wm.width + 8)} ${Math.ceil(iconW)}" width="${Math.ceil((tx + wm.width + 8) * 1.6)}" height="${Math.ceil(iconW * 1.6)}"><title>TribeCode</title>
  <svg x="0" y="0" width="${iconW}" height="${iconW}" viewBox="0 0 45 45" shape-rendering="crispEdges">${ICON_INNER}</svg>
  <g transform="translate(${tx} ${(iconW - 100) / 2})">${wm.body}</g></svg>`);
}
// for the app UI (always on dark/glass surfaces it inherits currentColor for "Tribe")
const ui = wordmark({ tribe: 'currentColor', code: ORANGE });
const UI = (ink) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${ui.width + 4} 104"><title>TribeCode</title>${ui.body.replace(/currentColor/g, ink)}</svg>`;
write('app/ui/assets/wordmark.svg', UI('#F8FAFC'));
write('app/ui/assets/wordmark-light.svg', UI('#12151A'));
// the website (site/) keeps its own copies so it works on its own
write('site/assets/brand/wordmark.svg', UI('#F8FAFC'));
if (fs.existsSync(path.join(root, 'site/assets/brand/logo-wordmark-dark.svg'))) fs.copyFileSync(path.join(root, 'assets/brand/logo-wordmark-dark.svg'), path.join(root, 'site/assets/brand/logo-wordmark-dark.svg'));
