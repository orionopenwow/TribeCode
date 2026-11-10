#!/usr/bin/env node
// Coverage suite for Flint's local brain (app/ui/flintnlu.js): every phrasing in flint_nlu_cases.json must come out as
// the expected intent with the expected slots. Fails under 95%. Run: node app/test/flint_nlu_test.js [-v]
'use strict';
const path = require('path');
const N = require(path.join(__dirname, '..', 'ui', 'flintnlu.js'));
const data = require('./flint_nlu_cases.json');
const verbose = process.argv.includes('-v');
const TASKS = [{ id: 't1', title: 'Fix the jump bug', status: 'todo' }, { id: 't2', title: 'Design the logo', status: 'doing' }, { id: 't3', title: 'Cut the trailer', status: 'todo' }, { id: 't4', title: 'Write the onboarding copy', status: 'review' }];
const BASE = { now: new Date(data.now), members: [{ id: 'm1', name: 'Maya Lee' }, { id: 'm2', name: 'Sam Ortiz' }, { id: 'a1', name: "Camp's Claude", role: 'agent' }], tasks: TASKS };
const low = v => String(v == null ? '' : v).toLowerCase().trim();
function slotOk(got, want) {
  for (const [k, v] of Object.entries(want || {})) {
    const g = got[k];
    if (k === 'who') { if (!g || !low(g.name).startsWith(low(v))) return `${k}: ${JSON.stringify(g)}`; continue; }
    if (k === 'task') { if (!g || g.title !== v) return `${k}: ${JSON.stringify(g && g.title)}`; continue; }
    if (k === 'color') { if (!g || (low(g.name) !== low(v) && low(g.hex) !== low(v))) return `${k}: ${JSON.stringify(g)}`; continue; }
    if (k === 'value') { if (typeof g !== 'number' || Math.abs(g - v) > 0.011) return `${k}: ${g}`; continue; }
    if (k === 'msg') { if (!low(g).includes(low(v))) return `${k}: ${JSON.stringify(g)}`; continue; }
    if (typeof v === 'boolean' || typeof v === 'number') { if (g !== v) return `${k}: ${JSON.stringify(g)}`; continue; }
    if (low(g) !== low(v)) return `${k}: ${JSON.stringify(g)}`;
  }
  return '';
}
let pass = 0; const fails = [], byArea = {}, held = [0, 0], heldFails = [];
for (const c of data.cases) {
  const ctx = { ...BASE };
  if (c.ctx) { Object.assign(ctx, c.ctx); if (c.ctx.last) ctx.last = { task: TASKS.find(t => t.id === c.ctx.last) }; }
  const r = N.parse(c.t, ctx), steps = r.steps;
  let why = '';
  if (c.i === null) { const s = steps[0]; if (steps.length === 1 && s.intent && s.conf >= 0.6 && s.intent !== 'help.kb') why = `claimed ${s.intent} (${s.conf.toFixed(2)})`; }
  else if (Array.isArray(c.i)) {
    if (steps.length !== c.i.length) why = `steps ${steps.map(s => s.intent).join(',')}`;
    else c.i.forEach((id, n) => { if (why) return; if (steps[n].intent !== id) why = `step ${n}: ${steps[n].intent}`; else if (c.s && c.s[n]) { const e = slotOk(steps[n].slots || {}, c.s[n]); if (e) why = `step ${n} ${e}`; } });
  } else {
    const s = steps[0];
    if (steps.length !== 1) why = `split into ${steps.map(x => x.intent).join(',')}`;
    else if (s.intent !== c.i) why = `got ${s.intent} (${(s.conf || 0).toFixed(2)})`;
    else if (s.conf < 0.6) why = `low confidence ${s.conf.toFixed(2)}`;
    else { const e = slotOk(s.slots || {}, c.s); if (e) why = e; }
  }
  const area = Array.isArray(c.i) ? 'multi' : c.i === null ? 'needs-model' : c.i.split('.')[0];
  byArea[area] = byArea[area] || [0, 0]; byArea[area][1]++;
  if (c.v === 'held') { held[1]++; if (!why) held[0]++; else heldFails.push(`  ✗ (held out) ${JSON.stringify(c.t)} → want ${JSON.stringify(c.i)}: ${why}`); }
  if (!why) { pass++; byArea[area][0]++; } else fails.push(`  ✗ ${JSON.stringify(c.t)} → want ${JSON.stringify(c.i)}: ${why}`);
}
if (held[1]) console.log(`held-out set (never tuned against): ${held[0]}/${held[1]} = ${Math.round(held[0] / held[1] * 1000) / 10}%`);
const n = data.cases.length, pct = Math.round(pass / n * 1000) / 10;
if (verbose || fails.length) console.log(fails.slice(0, verbose ? 999 : 40).join('\n'));
console.log(Object.entries(byArea).sort().map(([a, [p, t]]) => `${a} ${p}/${t}`).join(' · '));
console.log(`flint_nlu_test: ${pass}/${n} = ${pct}%  (${data.cases.filter(c => !c.v).length} written, ${data.cases.filter(c => c.v).length} variants)`);
if (n < 400) { console.error('fewer than 400 cases'); process.exit(1); }
if (pct < 95) { console.error('below 95%'); process.exit(1); }
