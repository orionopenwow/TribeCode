#!/usr/bin/env node
// The suggestion engine's pure parts (app/ui/suggest-core.js): learning with decay, ranking, the cool-down, repeated
// edits, photo colours and "asked for, not planned". No browser.   node app/test/suggest_core_test.js
'use strict';
const assert = require('assert');
const path = require('path');
const K = require(path.join(__dirname, '..', 'ui', 'suggest-core.js'));
const DAY = 864e5, now = Date.parse('2026-11-15T12:00:00Z');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// ---------- learning: yes lifts, no lowers, "not like this" lowers more, old answers fade ----------
let L = {};
ok(K.weight(L, 'photos', 'photo-palette', now) > 0.99 && K.weight(L, 'photos', 'photo-palette', now) < 1.01, 'no answers: neutral weight');
L = K.record(L, { provider: 'photos', kind: 'photo-palette', verdict: 'yes' }, now);
L = K.record(L, { provider: 'photos', kind: 'photo-palette', verdict: 'yes' }, now);
const up = K.weight(L, 'photos', 'photo-palette', now); ok(up > 1, 'applied twice: weight above 1 (' + up + ')');
let M = K.record({}, { provider: 'photos', kind: 'photo-hero', verdict: 'no' }, now);
const down = K.weight(M, 'photos', 'photo-hero', now); ok(down < 1, 'a no: weight below 1 (' + down + ')');
const N2 = K.record({}, { provider: 'photos', kind: 'photo-hero', verdict: 'notlike' }, now);
ok(K.weight(N2, 'photos', 'photo-hero', now) < down, '"not like this" lowers more than a no');
ok(K.weight(N2, 'photos', 'photo-hero', now) >= 0.15, 'never below the floor');
ok(K.weight(M, 'photos', 'photo-hero', now + 120 * DAY) > down, 'a no from four months ago counts less (30-day half-life)');
const later = K.record({}, { provider: 'x', kind: 'y', verdict: 'later' }, now); ok(!Object.keys(later.k || {}).length, '"Not now" teaches nothing');
ok(K.weight(M, 'photos', 'photo-palette', now) < 1 && K.weight(M, 'photos', 'photo-palette', now) > down, 'a no on one kind lowers its provider a little');
ok(/applied 2 like this/.test(K.explain(L, 'photos', 'photo-palette', now)), 'explain says what was applied: ' + K.explain(L, 'photos', 'photo-palette', now));
ok(/said no to 1/.test(K.explain(M, 'photos', 'photo-hero', now)) && /less/.test(K.explain(M, 'photos', 'photo-hero', now)), 'explain says what was turned down');
ok(/New/.test(K.explain({}, 'a', 'b', now)), 'explain for something never answered');

// ---------- ranking: dismissed and muted never come back, weights reorder ----------
const items = [{ id: 'a', title: 'A', provider: 'photos', kind: 'photo-hero' }, { id: 'b', title: 'B', provider: 'photos', kind: 'photo-palette' }, { id: 'c', title: 'C', provider: 'brand', kind: 'brand-save' }, { id: 'd', title: 'D', provider: 'files' }, { id: 'b', title: 'dup', provider: 'photos' }];
const r = K.rank(items.map(x => ({ ...x })), { learn: { p: { ...L.p, ...M.p }, k: { ...L.k, ...M.k } }, dismissed: ['c'], muted: ['files'], now });
ok(r.map(x => x.id).join() === 'b,a', 'palette (applied before) first, hero (said no) after, dismissed and muted gone, no duplicates: ' + r.map(x => x.id).join());
ok(r.every(x => typeof x.rank === 'number'), 'each item carries its rank');

// ---------- the cool-down ----------
ok(K.allowNew([], { mode: 'gentle', now }) === 3, 'gentle: 3 new a day');
ok(K.allowNew([now - 1000, now - 2000], { mode: 'gentle', now }) === 1, 'two shown today: one more');
ok(K.allowNew([now - 2 * DAY, now - 3 * DAY], { mode: 'gentle', now }) === 3, 'shown days ago: not counted');
ok(K.allowNew([], { mode: 'often', now }) === 12, 'often: 12 a day');
ok(K.allowNew([], { mode: 'off', now }) === 0, 'off: none');
ok(K.allowNew([], { mode: 'off', now, asked: true }) > 10, 'off, but asked: shows them');
ok(K.allowNew([], { mode: 'gentle', now, quiet: true }) === 0, 'quiet hours: none unless asked');

// ---------- repeated edits ----------
const log = [1, 2, 3, 4].map(i => ({ tool: 'site', what: 'heading', prop: 'size', dir: 1, ref: 'b' + i, at: now - i * 3600e3 })).concat([{ tool: 'site', what: 'heading', prop: 'size', dir: 1, ref: 'b1', at: now - 100 }, { tool: 'site', what: 'text', prop: 'bold', value: 1, ref: 't1', at: now }]);
const pats = K.editPatterns(log, now); ok(pats.length === 1 && pats[0].n === 4 && pats[0].what === 'heading', 'four headings made bigger: one pattern of 4 different things');
ok(!K.editPatterns(log, now + 9 * DAY).length, 'a week later the pattern is gone');
ok(!K.editPatterns(log.slice(0, 3), now).length, 'three is not a pattern yet');
const before = { pages: [{ id: 'p', blocks: [{ id: 'h', type: 'hero', props: { title: 'Hi' }, es: {} }, { id: 'f', type: 'features', props: { title: 'More', items: [{ title: 'One' }] }, es: { title: { sz: 'l' } } }] }] };
const after = JSON.parse(JSON.stringify(before)); after.pages[0].blocks[0].es = { title: { sz: 'l', b: 1 } }; after.pages[0].blocks[1].es = { title: { sz: 's' } };
const ed = K.siteEdits(before, after);
ok(ed.some(e => e.ref === 'h|title' && e.prop === 'size' && e.dir === 1 && e.what === 'heading'), 'a heading made bigger is noticed');
ok(ed.some(e => e.ref === 'h|title' && e.prop === 'bold' && e.value === 1), 'made bold is noticed');
ok(ed.some(e => e.ref === 'f|title' && e.prop === 'size' && e.dir === -1), 'made smaller is noticed');
const cfg = { pages: [{ id: 'p', blocks: [{ id: 'b1', type: 'hero', props: { title: 'A' }, es: { title: { sz: 'l' } } }, { id: 'b5', type: 'cta', props: { title: 'Join' }, es: {} }, { id: 'b6', type: 'faq', props: { title: 'FAQ' }, es: { title: { sz: 'xl' } } }] }] };
const tg = K.siteTargets(cfg, { what: 'heading', prop: 'size', dir: 1, refs: ['b1|title'] });
ok(tg.length === 1 && tg[0].block === 'b5' && tg[0].set.sz === 'l', 'the rest: one heading to make bigger (one already done, one already the biggest): ' + JSON.stringify(tg));

// ---------- photo colours, on the device ----------
const w = 8, h = 4, px = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < w * h; i++) { const teal = i < 20; px.set(teal ? [42, 140, 128, 255] : [245, 245, 240, 255], i * 4); }
const pal = K.palette(px, w, h, 4);
ok(pal[0] === '#2A8C80' && pal.length === 2, 'palette: most present first, the two colours: ' + pal.join());
ok(K.accentOf(pal) === '#2A8C80', 'the lively colour is the accent, not the near-white');
ok(K.shape(1600, 900) === 'wide' && K.shape(900, 1600) === 'tall' && K.shape(1000, 1000) === 'square', 'shape');
ok(K.near('#2A8C80', '#2B8D81') && !K.near('#2A8C80', '#C92A2A'), 'near colours');

// ---------- asked for, not planned ----------
const src = [{ id: 'chat:1', kind: 'chat', who: 'Ana', text: 'we really need dark mode' }, { id: 'chat:2', kind: 'chat', who: 'Ben', text: 'can we add dark mode please' }, { id: 'chat:3', kind: 'chat', who: 'Ben', text: 'dark mode looks cool on their site' }, { id: 'doc:a', kind: 'doc', who: 'Cy', text: 'We should add a leaderboard.' }, { id: 'chat:4', kind: 'chat', who: 'Ana', text: 'we need search' }];
const as = K.asks(src, [{ title: 'Add search to the list' }]);
ok(as[0].key === 'dark' && as[0].n === 2 && as[0].people === 2, 'dark mode: asked twice by two people (the line that only mentions it does not count): ' + JSON.stringify(as[0]));
ok(as.some(a => a.key === 'leader') && !as.some(a => a.key === 'search'), 'leaderboard is suggested; search already has a task');
ok(as[0].from.every(f => f.who && f.ref), 'each says who and where');

console.log(`suggest_core_test: OK (${n} checks)`);
