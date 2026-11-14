#!/usr/bin/env node
// What a project on this device needs from the server, bundled into the app (feat/calm-parity). A project that lives
// only in the browser (app/ui/offline.js) has no server to ask, so two small JSON files ship with the app shell:
//   app/ui/guide-pages.json    the Guide: docs/guide/*.md, exactly as GET /api/guide answers ({ pages: [...] })
//   app/ui/site-library.json   the Website templates gallery list, as GET /api/site-library answers; thumbnails point
//                              at the small JPEGs already in app/ui/demo/sites/ (scripts/dev/demo-thumbs.py)
// Both are in SHELL (app/ui/sw.js), so they work with no network. Run it after changing docs/guide or templates/sites
// and at every release (scripts/dev/release.js checks it):
//   node scripts/dev/app-bundle.js          write the files
//   node scripts/dev/app-bundle.js --check  exit 1 if either file is out of date (used by npm test)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const ui = path.join(root, 'app', 'ui');

delete process.env.TRIBE_GUIDE;   // always the checkout's docs/guide
const guide = require(path.join(root, 'server', 'guide'))({});
const pages = guide.pages();
if (!pages.length) { console.error('app-bundle: no guide pages found in docs/guide'); process.exit(1); }

const tpl = require(path.join(root, 'server', 'tpldir')).root();
const lib = require(path.join(root, 'server', 'sitelib'))({ P: {}, W: {}, root: tpl, log: () => {} });
const templates = lib.catalog().map(x => ({ ...x, thumb: fs.existsSync(path.join(ui, 'demo', 'sites', `${x.id}.jpg`)) ? `demo/sites/${x.id}.jpg` : '' }));
if (!templates.length) { console.error('app-bundle: no website templates found in templates/sites'); process.exit(1); }

const files = {
  'guide-pages.json': JSON.stringify({ pages, paths: guide.paths() }) + '\n',
  'site-library.json': JSON.stringify({ templates, categories: lib.CATEGORIES }) + '\n',
};
const check = process.argv.includes('--check');
let stale = 0;
for (const [name, text] of Object.entries(files)) {
  const file = path.join(ui, name);
  let have = null; try { have = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); } catch {}
  if (have === text) continue;
  if (check) { console.error(`app-bundle: app/ui/${name} is out of date. Run: node scripts/dev/app-bundle.js`); stale++; }
  else fs.writeFileSync(file, text);
}
if (check) {
  const sw = fs.readFileSync(path.join(ui, 'sw.js'), 'utf8');
  for (const name of Object.keys(files)) if (!sw.includes(`'${name}'`)) { console.error(`app-bundle: ${name} is missing from SHELL in app/ui/sw.js`); stale++; }
  if (stale) process.exit(1);
}
console.log(`app-bundle: ${check ? 'OK' : 'wrote'} (${pages.length} guide pages, ${templates.length} website templates)`);
