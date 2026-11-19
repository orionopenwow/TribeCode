#!/usr/bin/env node
// fix/p7-cache: every script and stylesheet the app page loads carries the app's version (x.js?v=0.41.1), so a new
// version never reuses an old cached copy (the desktop app's web view kept old files after an update). release.js runs
// this; `node scripts/dev/stamp-ui.js --check` fails when a file address lacks the current version.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), CHECK = process.argv.includes('--check');
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/src-tauri/tauri.conf.json'), 'utf8')).version;
const PAGES = ['app/ui/index.html'];
let bad = 0;
for (const rel of PAGES) {
  const file = path.join(ROOT, rel), html = fs.readFileSync(file, 'utf8');
  const out = html.replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=")((?!https?:|\/\/|data:)[\w./-]+\.(?:js|css))(?:\?v=[^"]*)?(")/g, `$1$2?v=${ver}$3`);
  if (CHECK) { const n = (html.match(/\.(?:js|css)"/g) || []).filter(Boolean).length; if (out !== html) { bad++; console.log(`stamp-ui: ${rel} has file addresses without ?v=${ver} (${n})`); } }
  else if (out !== html) fs.writeFileSync(file, out);
}
if (CHECK && bad) process.exit(1);
console.log(`stamp-ui: ${CHECK ? 'OK' : 'stamped'} (v${ver})`);
