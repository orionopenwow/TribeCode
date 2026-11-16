// Flint's app knowledge with no AI (feat/flint-appknow): the 107 answers, the 48 features, App Creator keeping them, the
// code-app files, and the honest tiers. Usage: node app/test/appknow_test.js
'use strict';
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'app', 'ui');
const FX = require(path.join(UI, 'appfeatures.js'));
const A = require(path.join(UI, 'appcreator-core.js'));
const N = require(path.join(UI, 'flintnlu.js'));
const kb = require(path.join(ROOT, 'server', 'flintkb.js'))({ ui: UI, nlu: N });
const { classify } = require(path.join(ROOT, 'server', 'flintfree.js'));

// 1. answers: 100+ questions, each with a source line, and ten common questions find the right one
const md = fs.readFileSync(path.join(ROOT, 'docs', 'APP-BUILDING.md'), 'utf8');
const qs = md.split('\n').filter(l => /^## /.test(l));
assert(qs.length >= 100, 'questions: ' + qs.length);
for (const sec of md.split(/\n## /).slice(1)) assert(/Read more: https?:\/\//.test(sec), 'a source for: ' + sec.split('\n')[0]);
const WANT = [
  ['how do I add login to my app', /add login/i], ['how do apps work offline', /work offline/i], ['what is a manifest', /manifest/i], ['expo vs capacitor vs pwa', /PWA, Expo or Capacitor/i],
  ['how do push notifications work on iphone', /push notifications work on iPhone/i], ['how do I store data in my app', /store data/i], ['how do I add a map', /add a map/i],
  ['why does my app lose its data when i reload', /lose its data/i], ['how do i take payments', /payments/i], ['how do i put my app on my home screen', /Home Screen/i],
];
for (const [q, rx] of WANT) { const a = kb.ask(q, 1)[0]; assert(a && rx.test(a.heading), `${q} -> ${a && a.heading}`); assert(a.snippet.length > 60, q); }
assert(/guide\/|MOBILE|HOSTING/.test(kb.ask('how do I host on my computer', 1)[0].file), 'TribeCode questions still find TribeCode help');

// 2. features: 40+, every one has words, a what, and code that compiles alone and together
assert(FX.FEATURES.length >= 40, 'features: ' + FX.FEATURES.length);
const ids = FX.FEATURES.map(f => f.id); assert.strictEqual(new Set(ids).size, ids.length, 'unique ids');
for (const f of FX.FEATURES) { assert(f.words.length >= 3 && f.what && f.title && FX.GROUPS[f.group], f.id); new Function(FX.runtime([f.id], { name: 'T' })); }
const all = FX.runtime(ids, { name: 'Test' }); new Function(all); assert(/Everything stays on this phone/.test(all));
assert(!/fetch\(|XMLHttpRequest|sendBeacon/.test(all), 'no feature sends data anywhere');
assert(!/gradient/.test(FX.css(ids)), 'no gradients');
for (const [q, id] of [['add offline storage', 'remember'], ['add a dark mode toggle', 'darkswitch'], ['make the timer work', 'timer'], ['add swipe to delete', 'swipe'], ['add a search bar', null], ['add a timer', null]]) assert.strictEqual(FX.match(q), id, q);

// 3. App Creator keeps them, the export carries them, the brief mentions them
let d = A.template(A.templateList()[0].id);
for (const f of ['remember', 'search', 'darkswitch', 'timer', 'totals']) d = A.apply(d, { op: 'feature.add', feature: f }).doc;
assert.deepStrictEqual(d.features, ['remember', 'search', 'darkswitch', 'timer', 'totals']);
assert(/already has/.test(A.apply(d, { op: 'feature.add', feature: 'timer' }).say));
assert.strictEqual(A.normalize(JSON.parse(JSON.stringify(d))).features.length, 5, 'saved and reloaded');
assert(!A.normalize({ ...d, features: ['nope', 'remember'] }).features.includes('nope'), 'unknown ids dropped');
const files = Object.fromEntries(A.pwa(d)); assert(/Features added by Flint/.test(files['app.js']) && /tcf-bar/.test(files['index.html']));
assert(/What it already does/.test(A.brief(d)));
assert.strictEqual(A.apply(d, { op: 'feature.remove', feature: 'timer' }).doc.features.length, 4);

// 4. code apps: files and the two lines, added once, removed cleanly
const html = '<!doctype html><html><head><title>x</title></head><body><ul><li>a</li></ul><script src="main.js"></script></body></html>';
const h2 = FX.inject(html, ['remember']); assert(/tribe-features\/features\.js/.test(h2) && /tribe-features\/features\.css/.test(h2));
assert.strictEqual(FX.inject(h2, ['remember', 'sort']), h2, 'injected once');
assert(!/tribe-features/.test(FX.inject(h2, [])), 'removed');
assert.deepStrictEqual(FX.codeFiles(['remember']).map(x => x[0]), ['tribe-features/features.js', 'tribe-features/features.css']);

// 5. understanding: inside App Creator any feature; elsewhere only with "app"; questions stay questions
const p = (t, ctx) => (N.parse(t, ctx).steps[0] || {});
const ac = { view: 'appcreator', screens: ['Today', 'Stats'] };
assert.strictEqual(p('add offline storage', ac).intent, 'app.feature');
assert.strictEqual(p('add a search bar', ac).intent, 'app.block');
assert.strictEqual(p('add offline storage to my app', {}).intent, 'app.feature');
assert.notStrictEqual(p('how do I add offline storage to my app', {}).intent, 'app.feature');
assert.strictEqual(p('what features can you add', {}).intent, 'app.features');
assert.deepStrictEqual(p('remove the pin lock', ac).slots, { feature: 'pinlock', off: true });

// 6. honest tiers: a feature is free; a server job says so and carries a ready request
assert.strictEqual(classify('add offline storage to my app').recipe, 'feature:remember');
assert.strictEqual(classify('add a demo login').feature, 'demologin');
for (const q of ['add real login with accounts that work on every device', 'sync the list between phones', 'add payments', 'add bluetooth', 'send push notifications when the app is closed', 'encrypt the data']) {
  const c = classify(q); assert.strictEqual(c.tier, 'agent', q); assert(c.ask && c.ask.includes('ask before big changes'), q);
}
assert.strictEqual(classify('make a to-do app').recipe, 'todo', 'a new build still builds');
console.log(`appknow_test: OK (${qs.length} answers, ${FX.FEATURES.length} features in ${Object.keys(FX.GROUPS).length} groups, App Creator + code apps, tiers)`);
