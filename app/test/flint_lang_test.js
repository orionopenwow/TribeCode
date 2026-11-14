// Flint understands everyday requests in seven languages (feat/languages), with no AI.
//   scripts/dev/flint-eval/lang.js       40 phrasings per language, written before any tuning (first untuned run:
//                                        es 15/40, pt 15/40, fr 17/40, de 11/40, ja 6/40, zh 9/40, ko 4/40), then tuned against.
//   scripts/dev/flint-eval/lang-held.js  20 per language, written after the rules existed, scored once, never tuned
//                                        against: the honest number. Its floor below is that first score, so it cannot drop.
//   node app/test/flint_lang_test.js [-v] [--report]
'use strict';
const path = require('path');
const N = require(path.join(__dirname, '..', 'ui', 'flintnlu.js'));
const SET = require(path.join(__dirname, '..', '..', 'scripts', 'dev', 'flint-eval', 'lang.js'));
const HELD = require(path.join(__dirname, '..', '..', 'scripts', 'dev', 'flint-eval', 'lang-held.js'));
const verbose = process.argv.includes('-v'), report = process.argv.includes('--report');
const FLOOR_TUNED = 95;
const FLOOR_HELD = { es: 18, pt: 19, fr: 19, de: 19, ja: 20, zh: 20, ko: 20 };   // out of 20: the first, untuned score
const ok = (want, got) => (want === 'dark' ? /^theme\.(dark|dark-mode|midnight)$/.test(got || '') : got === want);
const hit = (intent, text) => { const s = N.parse(text, { page: 'home' }).steps[0] || {}; return [ok(intent, s.intent) && (s.conf || 0) >= 0.6, s.intent]; };
let bad = false; const lines = [];
for (const lang of Object.keys(SET)) {
  const a = [0, 0], h = [0, 0], fails = [];
  for (const [intent, pair] of Object.entries(SET[lang])) for (const text of pair) { const [y, got] = hit(intent, text); a[1]++; if (y) a[0]++; else fails.push(`  ✗ ${lang} tuned ${JSON.stringify(text)} → want ${intent}, got ${got || 'nothing'}`); }
  for (const [intent, text] of Object.entries(HELD[lang] || {})) { const [y, got] = hit(intent, text); h[1]++; if (y) h[0]++; else fails.push(`  ✗ ${lang} held  ${JSON.stringify(text)} → want ${intent}, got ${got || 'nothing'}`); }
  const pa = Math.round(a[0] / a[1] * 1000) / 10;
  lines.push(`${lang}: tuned ${a[0]}/${a[1]} = ${pa}% · held out ${h[0]}/${h[1]} = ${Math.round(h[0] / h[1] * 1000) / 10}%`);
  if (verbose) fails.forEach(f => console.log(f));
  if (a[1] < 40 || h[1] < 20) { console.error(`${lang}: fewer than 40 + 20 phrasings`); bad = true; }
  if (!report && (pa < FLOOR_TUNED || h[0] < FLOOR_HELD[lang])) { console.error(`${lang}: below the floor (tuned ${FLOOR_TUNED}%, held out ${FLOOR_HELD[lang]}/20)`); bad = true; fails.slice(0, 8).forEach(f => console.error(f)); }
}
// English requests never land in the language layer
const FL = require(path.join(__dirname, '..', 'ui', 'flintlang.js'));
const en = ['open the chat', 'portfolio', 'make my portfolio site', 'timer 10 min', 'a page for my cafe', 'invite a friend', 'publish', 'dark mode', 'new doc', 'go home', 'chat', 'undo', 'add a task: buy bread', 'what time is it'];
const leaked = en.filter(t => FL.rewrite(t)); if (leaked.length) { console.error('English read as another language: ' + leaked.join(' | ')); bad = true; }
console.log('flint_lang:\n  ' + lines.join('\n  '));
if (bad) process.exit(1);
