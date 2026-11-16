#!/usr/bin/env node
// Motion Kit (app/ui/motionkit.js): springs, sums of springs, drags, two-edge springs, perfect loops, Flint's motion steps,
// tempo detection, templates and feel presets. No browser: the engine is a pure function of time.
//   node app/test/motionkit_test.js
'use strict';
const path = require('path'), assert = require('assert');
const K = require(path.join(__dirname, '..', 'ui', 'motionkit.js'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// springs: start at 0, settle exactly at 1, tiny overshoot at most
ok(K.step(0) === 0 && K.step(-1) === 0 && K.step(10) === 1, 'step starts at 0 and settles at exactly 1');
for (const id of K.FEEL_LIST) { const f = K.FEELS[id]; let mx = 0; for (let t = 0; t < 3; t += 0.002) mx = Math.max(mx, K.step(t, f.k, f.z)); ok(mx - 1 < 0.04, `${id}: overshoot ${((mx - 1) * 100).toFixed(1)}% stays under 4%`); }
// a value retargeted many times is the sum of one spring per change
const ev = [{ t: 0, to: 0 }, { t: 0.2, to: 10 }, { t: 0.4, to: 4 }];
ok(near(K.channel(ev, 0.3), 10 * K.step(0.1)), 'one change = one spring');
ok(near(K.channel(ev, 0.5), 10 * K.step(0.3) - 6 * K.step(0.1)), 'two changes = the sum of two springs');
ok(near(K.channel(ev, 9), 4), 'it settles on the last target');
// direct manipulation: the value follows the cursor while held, then springs back from where it was
const dr = [{ t: 0, to: 0 }, { t: 1, t1: 2, path: u => u * 10 }, { t: 2, to: 3 }];
ok(K.channel(dr, 1.5) === 5 && near(K.channel(dr, 2), 10) && near(K.channel(dr, 2.2), 10 - 7 * K.step(0.2)) && near(K.channel(dr, 9), 3), 'drag follows, then springs back from the release point');
// two-edge springs: moving right, the right (leading) edge runs ahead of the left one
const I = { k: 220, z: 0.86 };
const e = K.twoEdge(I, [{ t: 0, l: 100, r: 200 }], 0.08, 0, 100);
ok(e.r - 100 > e.l, 'leading edge ahead'); ok(e.r - e.l > 100, 'the indicator stretches while it moves');
const e2 = K.twoEdge(I, [{ t: 0, l: 100, r: 200 }], 5, 0, 100); ok(near(e2.l, 100) && near(e2.r, 200), 'and lands exactly');

// templates: at least 50, every category, distinct, all loop to the pixel, deterministic
ok(K.LIST.length >= 50, `${K.LIST.length} templates`);
ok(K.CATS.every(([c]) => K.LIST.some(id => K.TEMPLATES[id].cat === c)), 'every category has templates');
const sig = new Set();
for (const id of K.LIST) {
  const d = K.make(id), dur = K.duration(d);
  const s = d.states.map(x => x.kind + ':' + x.at + ':' + (x.style || '')).join('|') + d.aspect; ok(!sig.has(s), `${id} is not a copy of another template`); sig.add(s);
  const a = K.seek(d, 0), b = K.seek(d, dur - 1e-9), c = K.seek(d, 0);
  const val = f => [f.shape.w, f.shape.h, f.shape.r, f.shape.x, f.shape.y, ...f.shape.fill, f.shape.a, f.shape.press, f.zoom, f.cursor ? f.cursor.x : 0, f.cursor ? f.cursor.y : 0, f.cursor ? f.cursor.press : 0];
  ok(val(a).every((v, i) => Math.abs(v - val(b)[i]) < 1e-3), `${id}: the last frame is the first frame`);
  const shown = f => (f.cur.a > 0.5 ? f.cur : f.prev) || f.cur;
  ok(shown(a).st.s.kind === shown(b).st.s.kind && Math.abs(shown(a).lt - shown(b).lt) < 1e-3, `${id}: the same content shows at both ends of the loop`);
  ok(JSON.stringify(val(a)) === JSON.stringify(val(c)), `${id}: seek is a pure function of time`);
  ok(d.states.length >= 1 && d.states.every(x => K.KINDS[x.kind]), `${id}: every state has a known kind`);
}
// the UI reel: 120 BPM, 7 bars, something on every beat
{
  const d = K.make('ui-reel'); ok(d.bpm === 120 && d.bars === 7 && near(K.duration(d), 14), 'the reel is 7 bars at 120 BPM (14 s)');
  const beats = new Set(); d.states.forEach(s => { beats.add(Math.floor(s.at)); s.acts.forEach(a => { for (let b = Math.floor(a.at); b <= Math.floor(a.until != null ? a.until : a.at); b++) beats.add(b); }); });
  const live = ['loader', 'island', 'player', 'chart', 'cmdk']; d.states.forEach((s, i) => { if (live.includes(s.kind)) { const end = (d.states[i + 1] || { at: 28 }).at; for (let b = Math.floor(s.at); b < end; b++) beats.add(b); } });
  const missing = []; for (let b = 0; b < 28; b++) if (!beats.has(b)) missing.push(b); ok(missing.length <= 2, `something happens on (nearly) every beat; quiet beats: ${missing.join(', ') || 'none'}`);
  const evs = K.events(d); ok(evs.some(e => e.kind === 'click') && evs.some(e => e.kind === 'tick') && evs.some(e => e.kind === 'pop'), 'UI sounds are placed on clicks, drags, typing and the toast');
}
// beat snapping
{ const d = K.normalize({ states: [{ kind: 'button', at: 0.3 }, { kind: 'loader', at: 1.74, acts: [{ type: 'click', at: 2.1 }] }] }); const s = K.snap(d); ok(s.states[0].at === 0.5 && s.states[1].at === 1.5 && s.states[1].acts[0].at === 2, 'snap puts states and acts on the half-beat grid'); }
// Flint's steps
{
  let d = K.make('ui-reel');
  const run = (intent, slots) => { const r = K.command(d, { intent, slots }); d = r.doc; return r.say; };
  const bpm = d.bpm; run('motion.speed', { dir: 'slower' }); ok(d.bpm < bpm, 'slower lowers the tempo');
  const k = d.spring.k; run('motion.feel', { feel: 'snappier' }); ok(d.spring.k > k, 'snappier stiffens the springs');
  const z = d.spring.z; run('motion.overshoot', { more: false }); ok(d.spring.z > z, 'less overshoot raises damping');
  run('motion.aspect', { ratio: '9:16' }); ok(d.size.w === 1080 && d.size.h === 1920, '9:16 is 1080 × 1920');
  run('motion.accent', { color: { name: 'teal' } }); ok(d.theme.accent === '#38C6B1', 'accent teal');
  run('motion.loop', { on: false }); ok(d.loop === false, 'play once'); run('motion.loop', { on: true }); ok(d.loop === true, 'loop again');
  const nT = d.states.filter(s => s.kind === 'toast').length; run('motion.add', { kind: 'toast' }); ok(d.states.filter(s => s.kind === 'toast').length === nT + 1, 'add a toast');
  run('motion.remove', { kind: 'chart' }); ok(!d.states.some(s => s.kind === 'chart'), 'remove the chart');
  run('motion.text', { kind: 'button', text: 'Join now' }); ok(d.states.filter(s => s.kind === 'button').every(s => s.text === 'Join now'), 'change the button text');
  run('motion.feel', { feel: 'cinematic' }); ok(d.feel === 'cinematic' && d.blur.n === 8, 'a named feel applies its springs, blur and camera');
  ok(K.command(d, { intent: 'nope' }).doc === d, 'unknown steps change nothing');
}
// tempo: synthetic clicks at 100 BPM, starting at 0.3 s, accent on every fourth
{
  const rate = 22050, sec = 12, x = new Float32Array(rate * sec), bpm = 100, off = 0.3, beat = 60 / bpm;
  for (let b = 0; off + b * beat < sec - 0.1; b++) { const i0 = Math.round((off + b * beat) * rate), amp = b % 4 === 0 ? 1 : 0.55; for (let j = 0; j < 600; j++) x[i0 + j] += amp * Math.sin(j * 0.9) * Math.exp(-j / 120); }
  const r = K.analyze(x, rate); ok(Math.abs(r.bpm - 100) <= 1.5, `tempo found: ${r.bpm} BPM`);
  const ph = (v, p) => { const m = ((v % p) + p) % p; return Math.min(m, p - m); };
  ok(ph(r.offset - off, beat) < 0.05, `beat phase found: ${r.offset}s`);
  ok(ph(r.offset - off, beat * 4) < 0.06, `downbeat found: ${r.offset}s`);
  ok(r.onsets.length >= 15, `${r.onsets.length} onsets`);
}
// feel presets: 50+, named, distinct
ok(K.FEEL_LIST.length >= 50, `${K.FEEL_LIST.length} feel presets`);
{ const seen = new Set(K.FEEL_LIST.map(id => { const f = K.FEELS[id]; return [f.k, f.z, f.blur, f.enter, f.mb, f.cam].join(','); })); ok(seen.size === K.FEEL_LIST.length, 'no two feel presets are the same'); }
// normalize keeps hostile input sane
{ const d = K.normalize({ states: [{ kind: 'evil' }, { kind: 'button', w: 1e9, at: -5 }], bpm: 'x', size: { w: 1e7, h: 2 } }); ok(d.states.length === 1 && d.states[0].w === 6000 && d.states[0].at === 0 && d.bpm === 120 && d.size.w === 4096 && d.size.h === 64, 'normalize clamps everything'); }
console.log(`motionkit_test: OK (${n} checks, ${K.LIST.length} templates, ${K.FEEL_LIST.length} feels)`);
