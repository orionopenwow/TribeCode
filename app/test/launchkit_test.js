#!/usr/bin/env node
// Launch kit core (app/ui/launchkit-core.js): the catalogues are as big and as varied as promised, the store limits and
// checks are right, the first draft invents nothing, and the suggestions for the tribe fire when they should.
'use strict';
const assert = require('assert');
const L = require('../ui/launchkit-core.js');
const dist = (a, b, ks) => ks.filter(k => a[k] !== b[k]).length;
const minDist = (list, ks) => { let m = 9; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) m = Math.min(m, dist(list[i], list[j], ks)); return m; };

// catalogues: counts, and no two that differ only by colour (colour is never part of a style)
assert(L.SHOT_STYLES.length >= 50, 'at least 50 screenshot styles');
assert(minDist(L.SHOT_STYLES, ['layout', 'bg', 'type', 'frame']) >= 2, 'every two screenshot styles differ in two or more of layout, background, type and frame');
assert(new Set(L.SHOT_STYLES.map(s => s.layout)).size >= 18, 'at least 18 layouts in use');
assert(L.ICON_STYLES.length >= 50, 'at least 50 icon styles');
assert(minDist(L.ICON_STYLES, ['bg', 'glyph', 'plate', 'weight']) >= 2, 'every two icon styles differ in two or more parts');
assert(L.CAPTIONS.length >= 50 && new Set(L.CAPTIONS).size === L.CAPTIONS.length, 'at least 50 different caption starters');
assert(L.PAYWALLS.length >= 15 && new Set(L.PAYWALLS.map(p => p[0])).size === L.PAYWALLS.length, 'at least 15 paywall layouts');

// sizes from the stores' pages
const sz = id => L.SIZES.find(s => s.id === id);
assert.deepStrictEqual([sz('ios69').w, sz('ios69').h], [1320, 2868]); assert.deepStrictEqual([sz('ios65').w, sz('ios65').h], [1284, 2778]);
assert.deepStrictEqual([sz('ios61').w, sz('ios61').h], [1206, 2622]); assert(sz('ios61').req, 'the 6.1" set is the one Apple needs');
assert.deepStrictEqual([sz('ipad13').w, sz('ipad13').h], [2064, 2752]);
for (const s of L.SIZES.filter(x => x.store === 'google')) assert(Math.max(s.w, s.h) <= 3840 && Math.min(s.w, s.h) >= 320 && Math.max(s.w, s.h) <= 2 * Math.min(s.w, s.h), 'Play sizes inside the rules: ' + s.id);
assert.deepStrictEqual([L.FEATURE.w, L.FEATURE.h], [1024, 500]);
assert(L.ICON_FILES.find(f => f.file === 'ios/AppIcon-1024.png').kind === 'opaque', 'the App Store icon has no alpha');

// limits and checks
const lim = id => L.FIELDS.find(f => f.id === id).max;
assert.deepStrictEqual([lim('name'), lim('subtitle'), lim('keywords'), lim('promo'), lim('description'), lim('gtitle'), lim('gshort'), lim('gfull')], [30, 30, 100, 170, 4000, 30, 80, 4000]);
const keys = arr => arr.map(c => c.key);
assert(keys(L.check('name', 'x'.repeat(31))).includes('{n} characters over the limit.'));
assert(keys(L.check('keywords', 'é'.repeat(51))).includes('{n} bytes over the limit.'), 'keywords count bytes, not characters');
assert(keys(L.check('subtitle', 'The best planner')).some(k => /ranking/.test(k)), 'ranking claims are flagged');
assert(keys(L.check('gshort', 'Plan your day 🎯')).some(k => /emoji/.test(k)));
const kc = L.check('keywords', 'quest, pixel,games,game,ab', { name: 'Pixel Quest' });
assert(keys(kc).some(k => /Spaces after commas/.test(k)) && keys(kc).some(k => /Said twice/.test(k)) && keys(kc).some(k => /Already in your name/.test(k)) && keys(kc).some(k => /three or more/.test(k)));
const t = L.tidyKeywords('quest, pixel,games,game,ab,jump', { name: 'Pixel Quest' });
assert.strictEqual(t.value, 'games,jump'); assert(t.saved > 0);

// the first draft: within limits, built from what the project says, no invented claims
const d = L.draft({ name: 'Pixel Quest', summary: 'A cozy platformer about a lantern keeper.', vision: '# Pixel Quest\n\nRelight the valley in short levels.', features: ['Add double jump', 'Save progress'], kind: 'game', audience: 'casual players' });
for (const f of L.FIELDS) assert(f.bytes ? L.byteLen(d[f.id]) <= f.max : [...d[f.id]].length <= f.max, 'draft fits ' + f.id);
assert(/Double jump/.test(d.description) && /lantern keeper/.test(d.promo), 'the draft uses the project’s own words');
assert(!/best|#1|award|million|rated/i.test(JSON.stringify(d)), 'the draft invents no claims');
assert(!L.keywordList(d.keywords).some(k => /pixel|quest/i.test(k)), 'keywords skip words already in the name');
assert(/\n/.test(d.description), 'long fields keep their line breaks');

// What's new from chat, YouTube links
assert.strictEqual(L.changelogFrom('Released v0.4!\n- double jump\n- new boss'), 'New in this version:\n• Double jump\n• New boss');
assert.strictEqual(L.changelogFrom('lunch at noon?'), null);
assert(L.youtubeOk('https://youtu.be/dQw4w9WgXcQ').ok && !L.youtubeOk('https://www.youtube.com/playlist?list=PL1').ok && !L.youtubeOk('https://youtu.be/dQw4w9WgXcQ?t=30').ok && !L.youtubeOk('https://vimeo.com/1').ok);

// paywalls: a self-contained screen that says payments are not connected
const html = L.paywallHTML({ layout: 'cards', title: 'Go <Pro>' }, { colors: { accent: '#38C6B1' } });
assert(/Payments are not connected yet/.test(html) && /Go &lt;Pro&gt;/.test(html) && /#38C6B1/.test(html) && !/<script src/.test(html));

// the record and the checklist
const k = L.norm({ style: 'nope', checks: { 'a-icon': true, bogus: true }, text: { name: 'x'.repeat(999) } });
assert.strictEqual(k.style, 's01'); assert.deepStrictEqual(Object.keys(k.checks), ['a-icon']); assert(k.text.name.length <= 120);
assert.deepStrictEqual(L.progress(k), { done: 1, total: L.CHECKLIST.length });
assert(L.CHECKLIST.filter(c => c.store === 'apple').length >= 10 && L.CHECKLIST.filter(c => c.store === 'google').length >= 10);

// suggestions for the tribe
const kit = { slides: [{ src: { kind: 'visual', ref: 'home/1' } }], shotsAt: '2026-11-10T00:00:00Z', text: { name: 'Pixel Quest', keywords: 'pixel,quest,jump,jumps' } };
const g = { kit, screens: [{ slug: 'home', name: 'Home', latest: { ts: '1', at: '2026-11-09T00:00:00Z' } }, { slug: 'shop', name: 'Shop', latest: { ts: '2', at: '2026-11-12T00:00:00Z' } }], messages: [{ id: 'm1', by: 'u1', name: 'Maya', text: "What's new in v0.5:\n- a shop\n- coins" }] };
const s = L.suggestions(g), ids = s.map(x => x.id);
assert.deepStrictEqual(ids, ['launch-shots', 'launch-whatsnew', 'launch-keywords'], ids.join());
assert(s[0].op.screens.length === 1 && s[0].op.screens[0].ref === 'shop/2', 'only the new screen');
assert(/a shop/i.test(s[1].op.value) && s[1].from[0].who === 'u1');
assert.strictEqual(s[2].op.value, 'jump'); assert(s[2].vars.n >= 8);
assert.deepStrictEqual(L.suggestions({ kit: {}, screens: [], messages: [] }), [], 'nothing to say about an empty kit');

console.log(`launchkit_test: OK (${L.SHOT_STYLES.length} screenshot styles, ${L.ICON_STYLES.length} icon styles, ${L.CAPTIONS.length} headline starters, ${L.PAYWALLS.length} paywalls, ${L.CHECKLIST.length} checklist steps)`);
