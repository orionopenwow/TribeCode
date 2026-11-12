#!/usr/bin/env node
// feat/files-dash: writes app/ui/market-catalog.json, the Marketplace's saved list for when no tribe answers
// (offline, no tribe yet, the host asleep). A slim copy of templates/marketplace.json: what the cards, filters and
// detail sheet show. `node scripts/dev/market-catalog.js` rewrites it; `--check` fails when it is out of date.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', 'marketplace.json'), 'utf8'));
const KEEP = ['id', 'kind', 'emoji', 'title', 'summary', 'tags', 'for', 'seat', 'url', 'repo', 'license', 'score', 'added', 'featured'];
const items = (src.items || []).map(it => Object.fromEntries(KEEP.filter(k => it[k] !== undefined).map(k => [k, it[k]])));
const out = JSON.stringify({ about: 'The Marketplace catalog, saved with the app (generated from templates/marketplace.json by scripts/dev/market-catalog.js).', items }) + '\n';
const file = path.join(ROOT, 'app', 'ui', 'market-catalog.json');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur !== out) { console.error('app/ui/market-catalog.json is out of date: run node scripts/dev/market-catalog.js'); process.exit(1); }
  console.log(`market-catalog.json up to date (${items.length} items)`);
} else { fs.writeFileSync(file, out); console.log(`wrote app/ui/market-catalog.json (${items.length} items, ${Math.round(out.length / 1024)} KB)`); }
