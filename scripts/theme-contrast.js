#!/usr/bin/env node
// Checks every theme (app/ui/themes.js + themes.css on top of the base modes in styles.css, shell.css and
// bubbles.css): body text must reach 4.5:1 (WCAG AA) on every surface it sits on, and the picker swatches in
// themes.js must match the CSS. Exit code 1 on any failure.   Usage: node scripts/theme-contrast.js [--json]
'use strict';
const fs = require('fs'), path = require('path');
const UI = path.join(__dirname, '..', 'app', 'ui');
const read = f => fs.readFileSync(path.join(UI, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// All custom properties declared in the blocks whose selector matches `sel` (a RegExp on the selector text).
function vars(css, sel) {
  const out = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!sel.test(m[1].trim())) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) out[d[1]] = d[2].trim();
  }
  return out;
}
const styles = read('styles.css'), shell = read('shell.css'), bubbles = read('bubbles.css'), themes = read('themes.css');
const base = {
  dark: { ...vars(styles, /^:root$/), ...vars(bubbles, /^:root$/), ...vars(styles, /^body\.dark$/), ...vars(shell, /^body\.dark$/) },
  light: { ...vars(styles, /^:root$/), ...vars(bubbles, /^:root$/), ...vars(styles, /^body\.light$/), ...vars(shell, /^body\.light$/), ...vars(bubbles, /^body\.light$/) },
};
// themes.js runs in a browser; give it just enough of one to read the list.
const sandbox = { window: {}, document: {}, matchMedia: () => ({ matches: false, addEventListener() {} }), localStorage: { getItem: () => null } };
new Function('window', 'document', 'matchMedia', 'localStorage', read('themes.js'))(sandbox.window, sandbox.document, sandbox.matchMedia, sandbox.localStorage);
const LIST = sandbox.window.TribeThemes.list;

const hex = v => { const m = /^#([0-9a-f]{6})$/i.exec(String(v || '').trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const lum = rgb => { const c = rgb.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, backgrounds] — body text on the surfaces it is used on.
const PAIRS = [
  ['--text', ['--canvas', '--surface', '--surface-2', '--surface-3', '--raised', '--main', '--nest', '--rail', '--hover', '--sel']],
  ['--muted', ['--canvas', '--surface', '--surface-2', '--surface-3', '--raised', '--main', '--nest', '--hover', '--sel']],
  ['--faint', ['--canvas', '--surface', '--surface-2', '--raised', '--main', '--nest', '--hover']],
  ['--accent-ink', ['--surface', '--main', '--canvas']],
  ['--live-ink', ['--surface', '--main', '--canvas']],
  ['--peer-ink', ['--surface', '--main']],
  ['--ember-ink', ['--surface', '--main']],
  ['--amber-ink', ['--surface', '--main']],
  ['--bubble-other-text', ['--bubble-other']], ['--bubble-other-meta', ['--bubble-other']],
  ['--bubble-mine-text', ['--bubble-mine']], ['--bubble-mine-meta', ['--bubble-mine']],
];
const MIN = 4.5;
let fails = 0; const report = [];
for (const t of LIST) {
  const v = { ...base[t.mode], ...(t.id === 'dark' || t.id === 'light' ? {} : vars(themes, new RegExp(`body\\[data-theme="${t.id}"\\]$`))) };
  let worst = Infinity, worstPair = '';
  const bad = [];
  for (const [fg, bgs] of PAIRS) for (const bg of bgs) {
    const a = hex(v[fg]), b = hex(v[bg]);
    if (!a || !b) { bad.push(`${fg} on ${bg}: not a #rrggbb value (${v[fg]} / ${v[bg]})`); continue; }
    const r = ratio(a, b);
    if (r < worst) { worst = r; worstPair = `${fg} on ${bg}`; }
    if (r < MIN) bad.push(`${fg} ${v[fg]} on ${bg} ${v[bg]}: ${r.toFixed(2)}:1`);
  }
  // the picker chip: canvas · surface swatches must be the theme's real colors
  if ((v['--canvas'] || '').toUpperCase() !== t.sw[0].toUpperCase()) bad.push(`swatch canvas ${t.sw[0]} ≠ --canvas ${v['--canvas']}`);
  if ((v['--surface'] || '').toUpperCase() !== t.sw[1].toUpperCase()) bad.push(`swatch surface ${t.sw[1]} ≠ --surface ${v['--surface']}`);
  fails += bad.length;
  report.push({ id: t.id, name: t.name, worst: +worst.toFixed(2), worstPair, problems: bad });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else for (const r of report) {
  console.log(`${r.problems.length ? 'FAIL' : 'ok  '} ${r.name.padEnd(15)} lowest ${r.worst.toFixed(2)}:1 (${r.worstPair})`);
  for (const p of r.problems) console.log('       ' + p);
}
process.exit(fails ? 1 : 0);
