// Put it on your phone: the shared core (app/ui/homescreen-core.js). The installability check, the phone and browser
// detection, the steps, the limits with their sources, and Flint's answers.
'use strict';
const assert = require('node:assert');
const H = require('../ui/homescreen-core.js');

// ---------- the check ----------
const page = (head, extra = {}) => ({ 'index.html': `<!doctype html><html><head>${head}</head><body></body></html>`, ...extra });
let r = H.check({});
assert.strictEqual(r.ok, false); assert.deepStrictEqual(r.missing, ['page']);
r = H.check(page(''));
assert.ok(!r.ok && r.missing.includes('manifest') && r.missing.includes('viewport') && r.fixable, 'a bare page: no manifest, no viewport');
const good = {
  name: 'Habits', short_name: 'Habits', start_url: './', display: 'standalone',
  icons: [{ src: 'i/192.png', sizes: '192x192', type: 'image/png' }, { src: 'i/512.png', sizes: '512x512', type: 'image/png' }, { src: 'i/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
};
const full = '<meta name="viewport" content="width=device-width"><link rel="manifest" href="app.webmanifest"><link rel="apple-touch-icon" href="i/192.png"><script>navigator.serviceWorker.register("sw.js")</script>';
r = H.check(page(full, { 'app.webmanifest': JSON.stringify(good) }));
assert.ok(r.ok && r.missing.length === 0, JSON.stringify(r.missing));
// an SVG-only icon, like App Creator's first export: the 192/512 raster icons and the PNG iPhone icon are missing
r = H.check(page(full.replace('i/192.png"><script', 'icon.svg"><script'), { 'app.webmanifest': JSON.stringify({ ...good, icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }] }) }));
assert.ok(!r.ok && r.missing.includes('icons') && r.missing.includes('apple') && r.missing.includes('maskable'), JSON.stringify(r.missing));
// display, start_url, prefer_related_applications
r = H.check(page(full, { 'app.webmanifest': JSON.stringify({ ...good, display: 'browser', start_url: '', prefer_related_applications: true }) }));
assert.ok(['display', 'start', 'related'].every(id => r.missing.includes(id)), JSON.stringify(r.missing));
// a manifest in a subfolder, linked relatively
r = H.check({ 'index.html': '<link rel="manifest" href="./web/m.json"><meta name="viewport" content="x">', 'web/m.json': JSON.stringify(good) });
assert.ok(!r.missing.includes('manifest'), 'relative paths resolve');
// a missing file, bad JSON, another site
assert.ok(/not in the folder/.test(H.check(page('<link rel="manifest" href="nope.json">')).items.find(x => x.id === 'manifest').why));
assert.ok(/not valid JSON/.test(H.check(page('<link rel="manifest" href="m.json">', { 'm.json': '{oops' })).items.find(x => x.id === 'manifest').why));
assert.ok(/another site/.test(H.check(page('<link rel="manifest" href="https://cdn.example/m.json">')).items.find(x => x.id === 'manifest').why));
// the service worker can be registered from a script file
r = H.check(page(full.replace(/<script>.*<\/script>/, ''), { 'app.webmanifest': JSON.stringify(good), 'app.js': "if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')" }));
assert.ok(!r.missing.includes('sw'));
// live: https is required
r = H.check(page(full, { 'app.webmanifest': JSON.stringify(good) }), { live: true, https: false });
assert.ok(!r.ok && r.missing.includes('https'));
assert.ok(H.check(page(full, { 'app.webmanifest': JSON.stringify(good) }), { live: true, https: true }).ok);
// recommended items never block
r = H.check(page(full.replace(/<script>.*<\/script>/, '').replace(/<link rel="apple-touch-icon"[^>]*>/, ''), { 'app.webmanifest': JSON.stringify({ ...good, icons: good.icons.slice(0, 2) }) }));
assert.ok(r.ok && ['sw', 'apple', 'maskable'].every(id => r.missing.includes(id)), 'recommended only: still installable');

// ---------- which phone and browser ----------
const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ipadDesk: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
  insta: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  fbAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0;]',
  tiktok: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.0 BytedanceWebview/d8a21c6',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0',
  firefoxDesk: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
};
const k = (ua, o) => H.detect(ua, o).key;
assert.strictEqual(k(UA.iosSafari), 'ios-safari');
assert.strictEqual(k(UA.iosChrome), 'ios-other');
assert.strictEqual(k(UA.ipadDesk, { maxTouchPoints: 5 }), 'ios-safari', 'an iPad that says Macintosh');
assert.strictEqual(k(UA.ipadDesk), 'desktop-other', 'a real Mac');
assert.strictEqual(k(UA.android), 'android-chrome');
assert.strictEqual(k(UA.samsung), 'android-samsung');
assert.strictEqual(H.detect(UA.insta).inApp, 'Instagram'); assert.strictEqual(k(UA.insta), 'inapp-ios');
assert.strictEqual(H.detect(UA.fbAndroid).inApp, 'Facebook'); assert.strictEqual(k(UA.fbAndroid), 'inapp-android');
assert.strictEqual(H.detect(UA.tiktok).inApp, 'TikTok');
assert.strictEqual(k(UA.desktop), 'desktop-chromium'); assert.strictEqual(k(UA.edge), 'desktop-chromium'); assert.strictEqual(k(UA.firefoxDesk), 'desktop-other');
for (const [key, s] of Object.entries(H.STEPS)) {
  assert.ok(s.title && s.items.length >= 3 && s.items.length === s.drawings.length && ['iphone', 'android', 'computer'].includes(s.tab), key);
  for (const src of s.res || []) assert.ok(H.SOURCES[src], `${key}: source ${src}`);
}
assert.ok(/Share/.test(H.steps('ios-safari').items[0]) && /Install app/.test(H.steps('android-chrome').items[1]) && /Open in Safari/.test(H.steps('inapp-ios').items[1]));
assert.ok(/^intent:\/\/x\.github\.io\/app\/#Intent;scheme=https;package=com\.android\.chrome;/.test(H.intentUrl('https://x.github.io/app/')));

// ---------- stages, limits, sources, answers ----------
assert.deepStrictEqual(H.STAGES.map(s => s.id), ['ready', 'online', 'open', 'add', 'store']);
for (const s of H.STAGES) { assert.ok(s.title && s.line && s.why && s.local && s.stuck && H.ASKS[s.id], s.id); for (const x of s.res) assert.ok(H.SOURCES[x], `${s.id}: ${x}`); }
for (const row of H.LIMITS.concat(H.STORE)) { assert.ok(row.name && row.cost && row.facts.length, row.id); if (row.src) assert.ok(H.SOURCES[row.src] && /^https:\/\//.test(H.SOURCES[row.src].url), row.id); }
assert.ok(H.STORE.find(x => x.id === 'expo').facts.some(f => /15 Android and 15 iOS/.test(f)));
assert.ok(H.LIMITS.find(x => x.id === 'pages').facts.some(f => /1 GB/.test(f)) && H.LIMITS.find(x => x.id === 'cloud').facts.some(f => /15 minutes/.test(f)));
assert.match(H.READ, /^\d{4}-\d{2}-\d{2}$/);
for (const t of ['path', 'iphone', 'android', 'free', 'mac', 'inapp', 'offline', 'store']) { const a = H.answer(t); assert.ok(a.text.length > 40 && H.STAGES.some(s => s.id === a.stage), t); }
assert.ok(/Mac/.test(H.answer('mac').text) && /\$99/.test(H.answer('free').text) && /Safari/.test(H.answer('iphone').text));
console.log(`homescreen_test: OK (check: ${H.check(page('')).items.length} items; ${Object.keys(H.STEPS).length} phone/browser step lists; ${H.LIMITS.length + H.STORE.length} limits with sources; ${Object.keys(H.ANSWERS).length} answers)`);
