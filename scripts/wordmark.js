#!/usr/bin/env node
// Draws the "TribeCode" wordmark as vector strokes (squared geometric letters, no font needed)
// and writes every lockup used by the README, docs and app.  Usage: node scripts/wordmark.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const W = 19, h = W / 2, R = 14, GAP = 9;     // stroke width, half, corner radius, letter gap (cap height = 100)
const X = 26 + h;                              // x-height line (centerline)
const B = 100 - h;                             // baseline (centerline)
const a = (x, y, sweep) => `A${R} ${R} 0 0 ${sweep} ${x} ${y}`;
const GLYPHS = {
  T: { w: 70, d: `M0 ${h} H70 M35 ${h} V100` },
  r: { w: 50, d: `M${h} 100 V${X + R} ${a(h + R, X, 1)} H50` },
  i: { w: W, d: `M${h} 26 V100`, extra: `<rect x="0" y="0" width="${W}" height="17" rx="2.5" stroke="none"/>` },
  b: { w: 62 + h, d: `M${h} 0 V${B} H${62 - R} ${a(62, B - R, 0)} V${X + R} ${a(62 - R, X, 0)} H${h}` },
  e: { w: 62 + h, d: `M60 ${B} H${h + R} ${a(h, B - R, 1)} V${X + R} ${a(h + R, X, 1)} H${62 - R} ${a(62, X + R, 1)} V62 H${h}` },
  C: { w: 68, d: `M68 ${h} H${h + R} ${a(h, h + R, 0)} V${B - R} ${a(h + R, B, 0)} H68` },
  o: { w: 62 + h, d: `M${h + R} ${X} H${62 - R} ${a(62, X + R, 1)} V${B - R} ${a(62 - R, B, 1)} H${h + R} ${a(h, B - R, 1)} V${X + R} ${a(h + R, X, 1)} Z` },
  d: { w: 62 + h, d: `M${62} 0 V${B} H${h + R} ${a(h, B - R, 1)} V${X + R} ${a(h + R, X, 1)} H62` },
};

function word(text, color, x0) {
  let x = x0, out = '';
  for (const ch of text) {
    const g = GLYPHS[ch];
    out += `<g transform="translate(${x} 0)"><path d="${g.d}"/>${g.extra || ''}</g>`;
    x += g.w + GAP;
  }
  return { svg: `<g fill="${color}" stroke="${color}">${out}</g>`, end: x - GAP };
}

function wordmark({ tribe, code }) {
  const t = word('Tribe', tribe, 0), c = word('Code', code, t.end + GAP + 2);
  return { body: `<g stroke-width="${W}" stroke-linejoin="miter" stroke-linecap="butt">${t.svg.replace(/fill="[^"]+" stroke/, 'fill="' + tribe + '" stroke')}${c.svg}</g>`.replace(/<path /g, '<path fill="none" '), width: c.end };
}

const ICON = `<rect x="28" y="30" width="492" height="492" rx="112" fill="#171B26"/>
  <g fill="#FFFFFF"><polygon points="158,160 60,272 158,384 158,330 106,272 158,214"/><polygon points="378,160 476,272 378,384 378,330 430,272 378,214"/></g>
  <polygon fill="#EE6F22" points="268,110 302,182 303,250 342,218 366,290 352,358 268,410 186,360 172,290 203,203 226,240 226,182"/>`;

function write(file, svg) { fs.writeFileSync(path.join(root, file), svg + '\n'); console.log('wrote', file); }
const ORANGE = '#EE6F22';
for (const [suffix, tribe] of [['', '#171B26'], ['-dark', '#FFFFFF']]) {
  const wm = wordmark({ tribe, code: ORANGE });
  // text only
  write(`assets/brand/logo-text${suffix}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 ${wm.width + 12} 112" width="${Math.round((wm.width + 12) * 0.6)}" height="${Math.round(112 * 0.6)}"><title>TribeCode</title>${wm.body}</svg>`);
  // icon + text lockup
  const s = 0.255, iconW = 496 * s, gap = 34, tx = iconW + gap;
  write(`assets/brand/logo-wordmark${suffix}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(tx + wm.width + 8)} ${Math.ceil(iconW)}" width="${Math.ceil((tx + wm.width + 8) * 1.6)}" height="${Math.ceil(iconW * 1.6)}"><title>TribeCode</title>
  <g transform="scale(${s}) translate(-26 -28)">${ICON}</g>
  <g transform="translate(${tx} ${(iconW - 100) / 2})">${wm.body}</g></svg>`);
}
// for the app UI (always on dark/glass surfaces it inherits currentColor for "Tribe")
const ui = wordmark({ tribe: 'currentColor', code: ORANGE });
write('app/ui/assets/wordmark.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 ${ui.width + 12} 112"><title>TribeCode</title>${ui.body.replace(/currentColor/g, '#FFFFFF')}</svg>`);
write('app/ui/assets/wordmark-light.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 ${ui.width + 12} 112"><title>TribeCode</title>${ui.body.replace(/currentColor/g, '#14161D')}</svg>`);
