#!/usr/bin/env node
// App and game starters (docs/STARTERS.md › Built-in starters). Each starter is a folder in app/ui/starters/<id>/ with:
//   STARTER.json  the source of truth: title, kind, summary, the source repo, its license and authors, what changed,
//                 the controls, the params Flint can tweak (gravity, speed, colors…), "try" ideas and the phrasings
//   index.html    runs with no build step (plain HTML, CSS and JS; no CDN, no network)
//   config.js     written here from the params: window.CONFIG = { key: value, … }, one key per line, so Flint (and
//                 people) change a value without touching the game code. Colors also land as CSS variables (--key).
//   README.md     written here: what it is, how to play or use it, what to tweak, credit and license
//   LICENSE       the original project's license, verbatim (or MIT for TribeCode's own starters)
// This script writes config.js, README.md and app/ui/starters/catalog.json (the list the Design flow and Flint read),
// and the NOTICE section that credits every adapted starter. --check only verifies (used by starters_test.js):
// every starter has STARTER.json, LICENSE, index.html, an allowed license, a NOTICE entry, ≤ 300 KB and no binaries
// except small images.
//   node scripts/dev/starters.js [--check]
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'app', 'ui', 'starters');
const NOTICE = path.join(ROOT, 'NOTICE');
const ALLOWED = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Zlib', 'CC0-1.0']);
const MAX = 300 * 1024;
const BIN_OK = /\.(png|webp|gif|jpg|svg)$/i, BIN_MAX = 64 * 1024;
const check = process.argv.includes('--check');

const ids = fs.readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(DIR, d.name, 'STARTER.json'))).map(d => d.name).sort();
const bad = [];
const walk = (d, rel = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap(f => f.isDirectory() ? walk(path.join(d, f.name), rel + f.name + '/') : [{ rel: rel + f.name, size: fs.statSync(path.join(d, f.name)).size }]);
const val = v => (typeof v === 'string' ? JSON.stringify(v) : String(v));

function configJs(s) {
  const lines = (s.params || []).map(p => `  ${p.key}: ${val(p.default)},${' '.repeat(Math.max(1, 26 - p.key.length - val(p.default).length))}// ${p.label}${p.hint ? ': ' + p.hint : ''}`);
  return `// ${s.title}: the knobs. Change a value and reload; Flint changes these when you ask ("make it faster").\n// Written from STARTER.json by TribeCode (scripts/dev/starters.js); your edits here are yours to keep.\nwindow.CONFIG = {\n${lines.join('\n')}\n};\n// colors also reach the CSS as variables (--bg, --accent, …)\nfor (var k in window.CONFIG) if (/^#[0-9a-f]{3,8}$/i.test(String(window.CONFIG[k]))) document.documentElement.style.setProperty('--' + k, window.CONFIG[k]);\n`;
}
function readme(s) {
  const src = s.source || {};
  const credit = src.original
    ? `Written for TribeCode and released under the MIT license (see LICENSE). ${src.inspired ? `Inspired by ${src.inspired}.` : ''}`.trim()
    : `Adapted from [${src.name}](${src.url}) by ${src.authors}, under the ${src.license} license (kept in LICENSE). Changes for TribeCode: ${src.changes}`;
  return `# ${s.title}\n\n${s.summary}\n\n## Run it\n\nOpen \`index.html\` in a browser. No install, no build step.${s.controls ? `\n\n**Controls:** ${s.controls}` : ''}\n\n## Tweak it\n\nEvery knob is in \`config.js\`. Ask Flint (\"${(s.try || [])[0] || 'make it faster'}\") or change a value and reload.\n\n| Knob | What it does | Default |\n| --- | --- | --- |\n${(s.params || []).map(p => `| \`${p.key}\` | ${p.label}${p.hint ? ' (' + p.hint + ')' : ''} | \`${p.default}\` |`).join('\n')}\n\n## Ideas to build next\n\n${(s.try || []).map(t => `- ${t}`).join('\n')}\n\n## Credit\n\n${credit}\n`;
}

const cat = [];
for (const id of ids) {
  const d = path.join(DIR, id);
  let s; try { s = JSON.parse(fs.readFileSync(path.join(d, 'STARTER.json'), 'utf8')); } catch (e) { bad.push(`${id}: STARTER.json: ${e.message}`); continue; }
  const src = s.source || {};
  if (s.id !== id) bad.push(`${id}: STARTER.json id is ${s.id}`);
  if (!['game', 'app'].includes(s.kind)) bad.push(`${id}: kind must be game or app`);
  if (!ALLOWED.has(src.license)) bad.push(`${id}: license ${src.license} is not on the allowed list`);
  if (!src.original && !(src.url && src.authors && src.changes)) bad.push(`${id}: an adapted starter needs source.url, authors and changes`);
  for (const f of ['index.html', 'LICENSE']) if (!fs.existsSync(path.join(d, f))) bad.push(`${id}: no ${f}`);
  if (!check) {
    if ((s.params || []).length) fs.writeFileSync(path.join(d, 'config.js'), configJs(s));
    fs.writeFileSync(path.join(d, 'README.md'), readme(s));
  }
  const files = walk(d), total = files.reduce((a, f) => a + f.size, 0);
  if (total > MAX) bad.push(`${id}: ${Math.round(total / 1024)} KB is over 300 KB`);
  for (const f of files) if (!/\.(html|css|js|json|md|txt)$/i.test(f.rel) && f.rel !== 'LICENSE' && !(BIN_OK.test(f.rel) && f.size <= BIN_MAX)) bad.push(`${id}: ${f.rel} is not allowed (text files and small images only)`);
  const html = fs.existsSync(path.join(d, 'index.html')) ? fs.readFileSync(path.join(d, 'index.html'), 'utf8') : '';
  if (/(src|href)=["']https?:/i.test(html)) bad.push(`${id}: index.html loads from the network`);
  if ((s.params || []).length && !/config\.js/.test(html)) bad.push(`${id}: index.html does not load config.js`);
  cat.push({ id, kind: s.kind, title: s.title, summary: s.summary, icon: s.icon || s.kind, tags: s.tags || [], phrases: s.phrases || [], license: src.license, by: src.original ? 'TribeCode' : src.authors, source: src.original ? '' : src.url, original: !!src.original, params: (s.params || []).map(p => ({ key: p.key, label: p.label, type: p.type, min: p.min, max: p.max, step: p.step, default: p.default, words: p.words, main: p.main || undefined })), try: s.try || [], controls: s.controls || '', size: total, files: files.map(f => f.rel).filter(f => !/^(LICENSE|README\.md|STARTER\.json)$/.test(f)).sort() });
}

// NOTICE: one entry per adapted starter, between the markers (the rest of NOTICE is left alone)
const A = '<!-- starters:begin -->', B = '<!-- starters:end -->';
const block = `${A}\nApp and game starters (app/ui/starters/, docs/STARTERS.md). Each folder keeps its original LICENSE.\n${cat.map(c => `- ${c.id}: ${c.original ? 'original TribeCode starter, MIT' : `adapted from ${c.source} by ${c.by}, ${c.license}`}`).join('\n')}\n${B}`;
let notice = fs.readFileSync(NOTICE, 'utf8');
const has = notice.includes(A) ? notice.slice(notice.indexOf(A), notice.indexOf(B) + B.length) : '';
for (const c of cat) if (!has.includes(`- ${c.id}:`) && check) bad.push(`${c.id}: no NOTICE entry (run node scripts/dev/starters.js)`);
const out = path.join(DIR, 'catalog.json');
const json = JSON.stringify({ about: 'Built-in app and game starters (written by scripts/dev/starters.js from each STARTER.json). docs/STARTERS.md', items: cat }, null, 1) + '\n';
if (check) {
  if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== json) bad.push('catalog.json is out of date (run node scripts/dev/starters.js)');
} else {
  notice = has ? notice.replace(has, block) : notice.replace(/\s*$/, '\n\n' + block + '\n');
  fs.writeFileSync(NOTICE, notice);
  fs.writeFileSync(out, json);
}
if (bad.length) { console.error('starters:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`starters: ${cat.length} (${cat.filter(c => c.kind === 'game').length} games, ${cat.filter(c => c.kind === 'app').length} apps)${check ? ' ok' : ' written'}`);
