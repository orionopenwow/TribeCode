#!/usr/bin/env node
// Office Space art: flatten the furniture manifests in app/ui/officespace/furniture/*/manifest.json (Pixel Agents format,
// MIT, (c) 2026 Pablo De Lucca) into one small app/ui/officespace/catalog.json, so the page loads one file instead of 25.
//   node scripts/dev/officespace-catalog.js          write it
//   node scripts/dev/officespace-catalog.js --check  exit 1 when it is out of date
// Each item: { name, cat, bg, surface, wall, views: { front|back|side: { f, w, h, fw, fh, mirror?, on?: [files] } } }
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '..', 'app', 'ui', 'officespace');
const FUR = path.join(DIR, 'furniture');

function views(id, node, out, orient, state) {
  orient = node.orientation || orient; state = node.state || state;
  if (node.type === 'group') { for (const m of node.members || []) views(id, m, out, orient, node.groupType === 'animation' ? 'on' : state); return; }
  const o = orient || 'front', v = out[o] || (out[o] = {});
  const file = `${id}/${node.file}`;
  if (state === 'on') { (v.on || (v.on = []))[node.frame | 0] = file; if (!v.f) Object.assign(v, size(node)); return; }
  Object.assign(v, size(node), { f: file }, node.mirrorSide ? { mirror: 1 } : {});
}
const size = n => ({ w: n.width, h: n.height, fw: n.footprintW || 1, fh: n.footprintH || 1 });

function build() {
  const items = {};
  for (const id of fs.readdirSync(FUR).sort()) {
    const mf = path.join(FUR, id, 'manifest.json'); if (!fs.existsSync(mf)) continue;
    const m = JSON.parse(fs.readFileSync(mf, 'utf8')), v = {};
    // a single picture's manifest names no file: it is <id>.png
    if (m.type === 'group') views(id, m, v); else views(id, { ...m, type: 'asset', file: m.file || `${id}.png` }, v);
    for (const o of Object.values(v)) if (!o.f && o.on) o.f = o.on[0];
    items[id] = { name: m.name || id, cat: m.category || 'misc', bg: m.backgroundTiles | 0, ...(m.canPlaceOnSurfaces ? { surface: 1 } : {}), ...(m.canPlaceOnWalls ? { wall: 1 } : {}), views: v };
  }
  return JSON.stringify({ v: 1, items }) + '\n';
}

const out = build(), file = path.join(DIR, 'catalog.json');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur !== out) { console.error('officespace catalog.json is out of date: run node scripts/dev/officespace-catalog.js'); process.exit(1); }
  console.log('officespace catalog.json is current');
} else { fs.writeFileSync(file, out); console.log('wrote', path.relative(process.cwd(), file), out.length, 'bytes'); }
