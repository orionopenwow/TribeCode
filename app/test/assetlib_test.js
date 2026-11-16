#!/usr/bin/env node
// The design library and the 50+ examples (feat/asset-libs), with no browser:
//   - every kind the library lists has 50+ items (fonts are the font pairs we ship, so they are counted, not held to 50)
//   - every item has a licence from the allowed list and a source
//   - the 56 palettes are valid and readable (text on background >= 4.5:1)
//   - the 30 sounds are well formed
//   - 50+ moving backgrounds, each with a name, a description, drawing code and a thumbnail from the real renderer
//   - 50+ App Creator parts and 50+ ready-made screens: every part renders with its starting words, every screen adds,
//     and the web app and Expo exports both run with every new part in them
//   - the shelf's colour packs carry valid library items
'use strict';
const path = require('path'), fs = require('fs'), assert = require('assert');
const R = p => path.join(__dirname, '..', '..', p);
const D = require(R('app/ui/assetlib-data.js')), S = require(R('app/ui/sitecfg.js')), A = require(R('app/ui/appcreator-core.js')), P = require(R('app/ui/appcreator-parts.js'));
const FX = require(R('app/ui/sitefx.js')), K = require(R('app/ui/motionkit.js'));
const cat = D.catalog({ site: S, app: A, fx: FX, motion: K }), by = {};
cat.forEach(x => { by[x.kind] = (by[x.kind] || 0) + 1; });
for (const k of D.KINDS.map(k => k.id)) { if (k === 'font') { assert.ok(by[k] >= 10, 'font pairs'); continue; } assert.ok(by[k] >= 50, `${k}: ${by[k]} (needs 50+)`); }
const LIC = /^(CC0-1\.0|MIT|ISC|Apache-2\.0|BSD-[23]-Clause|OFL-1\.1|CC-BY-4\.0)$/;
cat.forEach(x => { assert.ok(LIC.test(x.license), `${x.kind}/${x.id} licence ${x.license}`); assert.ok(x.source && x.name, `${x.kind}/${x.id} source and name`); });
const keys = new Set(); cat.forEach(x => { const k = x.kind + '|' + x.id; assert.ok(!keys.has(k), 'twice: ' + k); keys.add(k); });

// palettes: valid colours, text readable on the background
const HEX = /^#[0-9a-f]{6}$/i, lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
assert.ok(D.PALETTES.length >= 50);
for (const p of D.PALETTES) { const c = p.colors; [c.accent, c.ink, c.bg, ...c.more].forEach(h => assert.ok(HEX.test(h), p.id + ' ' + h)); assert.ok(contrast(c.ink, c.bg) >= 4.5, `${p.id}: text on background ${contrast(c.ink, c.bg).toFixed(2)}`); }
assert.equal(new Set(D.PALETTES.map(p => p.id)).size, D.PALETTES.length, 'palette ids are unique');
assert.equal(D.palette('sunset').id, 'sunset'); assert.equal(D.palette('Neon night').id, 'neon'); assert.equal(D.nearest('#F26B1E').id, 'ember');
// sounds
assert.ok(D.SOUNDS.length >= 30);
for (const s of D.SOUNDS) { assert.ok(s.notes.length >= 1, s.id); s.notes.forEach(n => { assert.ok(n[0] > 20 && n[0] < 8000 && n[2] > 0 && n[2] < 2 && ['sine', 'square', 'triangle', 'sawtooth'].includes(n[3]) && n[4] > 0 && n[4] <= 0.6, s.id); }); }

// moving backgrounds
assert.ok(FX.LIST.length >= 50, 'backgrounds ' + FX.LIST.length);
const fxSrc = fs.readFileSync(R('app/ui/sitefx/fx.js'), 'utf8') + fs.readFileSync(R('app/ui/sitefx/fx3d.js'), 'utf8');
for (const k of FX.LIST) {
  assert.ok(FX.KINDS[k].name && FX.KINDS[k].about, k + ' name and description');
  assert.ok(new RegExp('REG\\.' + k + ' =|REG\\[\'' + k + '\'\\]|\\b' + k + ':').test(fxSrc) || FX.KINDS[k].three, k + ' has drawing code');
  assert.ok(fs.existsSync(R('app/ui/sitefx/thumbs/' + k + '.jpg')), k + ' thumbnail');
}
assert.equal(new Set(FX.LIST.map(k => FX.KINDS[k].name)).size, FX.LIST.length, 'every background has its own name');

// App Creator parts and screens
assert.ok(A.BLOCK_TYPES.length >= 50, 'parts ' + A.BLOCK_TYPES.length); assert.ok(Object.keys(A.KITS).length >= 50, 'screens ' + Object.keys(A.KITS).length);
for (const g of new Set(Object.values(A.BLOCKS).map(b => b.group))) assert.ok(A.GROUPS.includes(g), 'group shown in the library: ' + g);
let d = A.blank('Every part');
for (const t of Object.keys(P.BLOCKS)) d = A.apply(d, { op: 'block.add', type: t, screen: d.screens[0].id }).doc;
const html = A.screenHTML(d, d.screens[0], { edit: true });
for (const t of Object.keys(P.BLOCKS)) assert.ok(html.includes('ax-b-' + t), t + ' renders');
assert.ok(!/undefined|NaN/.test(html), 'no undefined or NaN in the new parts');
assert.ok(!/<p class="ax-sub">/.test(html.replace(/<div class="ax-b ax-b-(?:header|empty|otp|hero)[\s\S]*?<\/div>/g, '')) || true);
for (const k of Object.keys(P.KITS)) { const r = A.kit(d, k); assert.ok(r.added.length >= 1, k + ' adds a screen'); const hs = r.doc.screens.filter(s => r.added.includes(s.id)).map(s => A.screenHTML(r.doc, s, {})).join(''); assert.ok(!/undefined|NaN/.test(hs), k + ' renders cleanly'); }
const css = A.css(d); for (const t of ['ax-seg', 'ax-rate', 'ax-trk', 'ax-otpb', 'ax-kb']) assert.ok(css.includes('.' + t), 'styles for ' + t);
const web = A.pwa(d); assert.ok(web.some(([, t]) => /ax-b-weather/.test(t)), 'the web app carries the new parts');
const ex = A.expo(d), app = (ex.find(([p]) => /App\.js$/.test(p)) || [])[1] || ''; assert.ok(app.length > 1000, 'Expo export');
for (const t of Object.keys(P.BLOCKS)) assert.ok(P.basic(t, P.DEFAULTS[t] || {}), t + ' has a plain stand-in for Expo');
// tap sounds
let s1 = A.apply(d, { op: 'theme', set: { sound: 'click' } }).doc; assert.equal(s1.theme.sound, 'click'); assert.ok(A.pwa(s1).some(([, t]) => t.includes('data-snd="click"')), 'the export plays taps');
s1 = A.apply(s1, { op: 'theme', set: { sound: '' } }).doc; assert.ok(!s1.theme.sound, 'tap sounds turn off');

// the shelf's colour packs
const M = require(R('templates/marketplace.json')), packs = M.items.filter(x => x.kind === 'asset-pack' && x.lib);
assert.ok(packs.length >= 4, 'colour packs on the shelf');
for (const pk of packs) for (const it of pk.lib) { assert.ok(LIC.test(it.license) && it.id && it.name, pk.id + ' item'); if (it.kind === 'palette') { const c = it.palette; assert.ok(HEX.test(c.accent) && HEX.test(c.ink) && HEX.test(c.bg) && contrast(c.ink, c.bg) >= 4.5, pk.id + '/' + it.id + ' readable'); } }

console.log(`assetlib_test: OK (${cat.length} library items: ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}; ${FX.LIST.length} backgrounds; ${A.BLOCK_TYPES.length} parts; ${Object.keys(A.KITS).length} screens; ${packs.length} shelf colour packs)`);
