#!/usr/bin/env node
// Scores Flint's local brain on the held-out batch 4 (scripts/dev/flint-held4.js) and prints the misses.
//   node scripts/dev/flint-held4-try.js [-v]
'use strict';
const path = require('path');
const N = require(path.join(__dirname, '..', '..', 'app', 'ui', 'flintnlu.js'));
const CASES = require('./flint-held4.js');
const CTX = { g: {}, s: { view: 'site', pages: ['Home', 'About', 'Contact'] }, p: { view: 'preview', site: true }, c: { view: 'canvas' }, cs: { view: 'canvas', selection: true } };
const BASE = { now: new Date('2026-11-12T10:00:00'), members: [{ id: 'm1', name: 'Maya Lee' }, { id: 'm2', name: 'Sam Ortiz' }],
  tasks: [{ id: 't1', title: 'logo', status: 'todo' }, { id: 't2', title: 'menu bug', status: 'todo' }, { id: 't3', title: 'trailer', status: 'todo' }, { id: 't4', title: 'jump bug', status: 'todo' }] };
const low = v => String(v == null ? '' : v).toLowerCase().trim();
let pass = 0; const miss = [];
for (const [cx, t, want, slots] of CASES) {
  const steps = N.parse(t, { ...BASE, ...CTX[cx] }).steps; let why = '';
  if (want === null) { const s = steps[0]; if (steps.length === 1 && s.intent && s.conf >= 0.6 && s.intent !== 'help.kb') why = 'claimed ' + s.intent; }
  else if (Array.isArray(want)) { if (steps.length !== want.length || want.some((w, i) => steps[i].intent !== w)) why = 'steps ' + steps.map(s => s.intent).join(','); }
  else { const s = steps[0]; if (steps.length !== 1) why = 'split ' + steps.map(x => x.intent).join(','); else if (s.intent !== want) why = `got ${s.intent} (${(s.conf || 0).toFixed(2)})`; else if (s.conf < 0.6) why = 'low ' + s.conf.toFixed(2);
    else for (const [k, v] of Object.entries(slots || {})) { const g = (s.slots || {})[k]; const gv = k === 'color' ? (g && (g.name || g.hex)) : g; if (low(gv) !== low(v)) { why = `${k}=${JSON.stringify(g)}`; break; } } }
  if (why) miss.push(`  ✗ [${cx}] ${JSON.stringify(t)} → ${JSON.stringify(want)}: ${why}`); else pass++;
}
console.log(miss.join('\n'));
console.log(`held-out batch 4: ${pass}/${CASES.length} = ${Math.round(pass / CASES.length * 1000) / 10}%`);
