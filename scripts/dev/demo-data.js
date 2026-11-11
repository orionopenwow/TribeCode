#!/usr/bin/env node
// Data for the offline demo (app/ui/offline.js), so the website's live demo (/app/?demo=…) can show the newer
// features with no server: Flint's capability map, the website template gallery, and Flint's free design moves on the
// canvas (one ready-made plan per screen template, made by the real server/canvasai.js with the name "Lantern"; the demo
// swaps in the name you typed). Thumbnails are small JPEGs of templates/sites/<id>/thumb.png, written by
// scripts/dev/demo-thumbs.py into app/ui/demo/sites/ and site/assets/sites/.
// Run after changing templates/canvas, templates/sites or the tiers in server/flintfree.js:
//   node scripts/dev/demo-data.js && python3 scripts/dev/demo-thumbs.py
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const tpl = require(path.join(root, 'server', 'tpldir')).root();

const ai = require(path.join(root, 'server', 'canvasai'))({ P: {}, canvas: {}, root: tpl });
const lib = require(path.join(root, 'server', 'sitelib'))({ P: {}, W: {}, root: tpl, log: () => {} });

// the tiers are a constant inside flintfree.js; read them through its route-free export when there is one
let TIERS = [];
try { const ff = require(path.join(root, 'server', 'flintfree')); TIERS = ff.TIERS || (ff({}) || {}).TIERS || []; } catch {}
if (!TIERS.length) {
  const src = fs.readFileSync(path.join(root, 'server', 'flintfree.js'), 'utf8');
  const m = /const TIERS = (\[[\s\S]*?\n\]);/.exec(src);
  if (m) TIERS = Function('return ' + m[1])();
}

const canvas = ai.templates().map(t => {
  const out = ai.plan({ nodes: {} }, `a ${t.title.toLowerCase()} for Lantern`, [], {});
  if (out.kind !== 'build') throw new Error(`template ${t.id} did not build (${out.kind})`);
  return { id: t.id, title: t.title, keys: t.keys, create: out.create, focus: out.focus, say: out.say };
});

const sites = { templates: lib.catalog().map(x => ({ ...x, thumb: x.thumb ? `demo/sites/${x.id}.jpg` : '' })), categories: lib.CATEGORIES };

const data = { made: new Date().toISOString().slice(0, 10), tiers: TIERS, sites, canvas };
const dir = path.join(root, 'app', 'ui', 'demo');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data));
console.log(`demo data: ${TIERS.length} tiers, ${sites.templates.length} site templates, ${canvas.length} canvas plans → app/ui/demo/data.json (${Math.round(fs.statSync(path.join(dir, 'data.json')).size / 1024)} kB)`);
