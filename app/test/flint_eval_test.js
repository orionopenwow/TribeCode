#!/usr/bin/env node
// Flint's evaluation set (app/test/flint_eval.json, written by scripts/dev/flint-eval-cases.js): websites, the design
// canvas, preview edits, lessons and global commands, with typos, slang and indirect wording. No AI: only
// app/ui/flintnlu.js. Fails under 95%. Also checks the lesson index (app/ui/flintlessons.js) covers every feature.
//   node app/test/flint_eval_test.js [-v] [--model app/test/fixtures/flint-model]
'use strict';
const path = require('path');
const N = require(path.join(__dirname, '..', 'ui', 'flintnlu.js'));
const data = require('./flint_eval.json');
const verbose = process.argv.includes('-v');
// --model <folder>: run with Flint's local helper (tier 1) present. It only re-ranks "did you mean", so the score must not move.
{ const i = process.argv.indexOf('--model'); if (i > 0) { const fs = require('fs'), E = require(path.join(__dirname, '..', 'ui', 'flintembed.js')), d = process.argv[i + 1], b = fs.readFileSync(path.join(d, 'model.safetensors')); N.setSemantic(E.fromFiles({ model: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), tokenizer: fs.readFileSync(path.join(d, 'tokenizer.json'), 'utf8') })); console.log(`with the local helper: ${d}`); } }
const CTX = {
  g: {}, s: { view: 'site', pages: ['Home', 'About', 'Contact'] }, p: { view: 'preview', site: true },
  c: { view: 'canvas' }, cs: { view: 'canvas', selection: true }, sh: { view: 'sheet' }, d: { view: 'doc' }, sl: { view: 'deck' },
};
const BASE = { now: new Date(data.now), members: [{ id: 'm1', name: 'Maya Lee' }, { id: 'm2', name: 'Sam Ortiz' }], tasks: [] };
const low = v => String(v == null ? '' : v).toLowerCase().trim();
function slotOk(got, want) {
  for (const [k, v] of Object.entries(want || {})) {
    const g = got[k];
    if (k === 'color') { if (!g || (low(g.name) !== low(v) && low(g.hex) !== low(v))) return `${k}: ${JSON.stringify(g)}`; continue; }
    if (low(g) !== low(v)) return `${k}: ${JSON.stringify(g)}`;
  }
  return '';
}
let pass = 0; const fails = [], byArea = {}, held = [0, 0], h1 = [0, 0], v2 = [0, 0], h3 = [0, 0], un = [0, 0], h4 = [0, 0], h5 = [0, 0], mx = [0, 0], h6 = [0, 0], c4 = [0, 0], c5 = [0, 0];
for (const c of data.cases) {
  const ctx = { ...BASE, ...CTX[c.ctx || 'g'] };
  const steps = N.parse(c.t, ctx).steps;
  let why = '';
  if (c.i === null) { const s = steps[0]; if (steps.length === 1 && s.intent && s.conf >= 0.6 && s.intent !== 'help.kb') why = `claimed ${s.intent}`; }
  else if (Array.isArray(c.i)) { if (steps.length !== c.i.length || c.i.some((id, n) => steps[n].intent !== id)) why = `steps ${steps.map(s => s.intent).join(',')}`; }
  else {
    const s = steps[0];
    if (steps.length !== 1) why = `split into ${steps.map(x => x.intent).join(',')}`;
    else if (s.intent !== c.i) why = `got ${s.intent} (${(s.conf || 0).toFixed(2)})`;
    else if (s.conf < 0.6) why = `low confidence ${s.conf.toFixed(2)}`;
    else why = slotOk(s.slots || {}, c.s);
  }
  const area = (c.ctx || 'g') + ':' + (Array.isArray(c.i) ? 'multi' : c.i === null ? 'needs-model' : c.i.split('.')[0]);
  byArea[area] = byArea[area] || [0, 0]; byArea[area][1]++;
  if (c.v === 'held') { held[1]++; if (!why) held[0]++; }
  if (c.v === 'h1') { h1[1]++; if (!why) h1[0]++; }
  if (c.v === 'v2') { v2[1]++; if (!why) v2[0]++; }
  if (c.v === 'held3') { h3[1]++; if (!why) h3[0]++; }
  if (c.v === 'unify') { un[1]++; if (!why) un[0]++; }
  if (c.v === 'held4') { h4[1]++; if (!why) h4[0]++; }
  if (c.v === 'held5') { h5[1]++; if (!why) h5[0]++; }
  if (c.v === 'max') { mx[1]++; if (!why) mx[0]++; }
  if (c.v === 'held6') { h6[1]++; if (!why) h6[0]++; }
  if (c.v === 'c4') { c4[1]++; if (!why) c4[0]++; }
  if (c.v === 'c5') { c5[1]++; if (!why) c5[0]++; }
  if (!why) { pass++; byArea[area][0]++; } else fails.push(`  ✗ [${c.ctx}] ${JSON.stringify(c.t)} → want ${JSON.stringify(c.i)} ${c.s ? JSON.stringify(c.s) : ''}: ${why}`);
}
const n = data.cases.length, pct = Math.round(pass / n * 1000) / 10;
if (fails.length) console.log(fails.slice(0, verbose ? 999 : 30).join('\n'));
console.log(Object.entries(byArea).sort().map(([a, [p, t]]) => `${a} ${p}/${t}`).join(' · '));
if (h1[1]) console.log(`held-out batch 1 (68.8% when first run, then tuned): ${h1[0]}/${h1[1]}`);
if (v2[1]) console.log(`site v2 batch: ${v2[0]}/${v2[1]} = ${Math.round(v2[0] / v2[1] * 1000) / 10}%`);
if (h3[1]) console.log(`held-out batch 3 (site v2, never tuned against): ${h3[0]}/${h3[1]} = ${Math.round(h3[0] / h3[1] * 1000) / 10}%`);
if (un[1]) console.log(`flint-unify batch (new commands): ${un[0]}/${un[1]} = ${Math.round(un[0] / un[1] * 1000) / 10}%`);
if (h4[1]) console.log(`held-out batch 4 (written before the new commands were built): ${h4[0]}/${h4[1]}`);
if (h5[1]) console.log(`held-out batch 5 (written after, 34/40 = 85% on its first untuned run): ${h5[0]}/${h5[1]}`);
if (mx[1]) console.log(`flint-max batch (design, copy, sheets, docs, slides, canvas recipes): ${mx[0]}/${mx[1]} = ${Math.round(mx[0] / mx[1] * 1000) / 10}%`);
if (h6[1]) console.log(`held-out batch 6 (flint-max, written before the matchers, 48/50 = 96% on its first untuned run): ${h6[0]}/${h6[1]}`);
if (c4[1]) console.log(`batch 4, v0.31 features (58.3% when first run, then tuned): ${c4[0]}/${c4[1]} = ${Math.round(c4[0] / c4[1] * 1000) / 10}%`);
if (c5[1]) console.log(`held-out batch 5 (v0.31 features, never tuned against): ${c5[0]}/${c5[1]} = ${Math.round(c5[0] / c5[1] * 1000) / 10}%`);
if (held[1]) console.log(`held-out (never tuned against): ${held[0]}/${held[1]} = ${Math.round(held[0] / held[1] * 1000) / 10}%`);
console.log(`flint_eval: ${pass}/${n} = ${pct}%`);
let bad = false;
if (n < 300) { console.error('fewer than 300 cases'); bad = true; }
if (pct < 98) { console.error('below 98%'); bad = true; }
// the lesson index: every feature has a short lesson with steps and a "Show me"
try {
  const L = require(path.join(__dirname, '..', 'ui', 'flintlessons.js'));
  const need = ['site', 'canvas', 'preview', 'tasks', 'work', 'templates', 'files', 'chat', 'huddles', 'agents', 'company', 'inspo', 'export', 'premium'];
  const miss = need.filter(f => { const l = L.LESSONS[f]; return !l || !l.title || !Array.isArray(l.steps) || l.steps.length < 2 || !l.show || !l.show.sel || !l.show.go; });
  if (miss.length) { console.error('lessons missing or incomplete: ' + miss.join(', ')); bad = true; }
  else console.log(`lessons: ${need.length}/${need.length} features have a lesson with a "Show me"`);
} catch (e) { console.error('no lesson index: ' + e.message); bad = true; }
if (bad) process.exit(1);
