// The website tells the truth about numbers (feat/claims). Fails when:
//   - a number quoted on the website, in a site translation, in the README or in the Guide differs from what
//     scripts/dev/site-facts.js counts from the real sources (templates, Flint's actions, quick guides, …);
//   - a number is quoted that no rule counts;
//   - docs/CLAIMS.md (the claims ledger) has a row marked False, or names a test file that does not exist;
//   - a price appears on the website (prices stay hidden until the owner turns payments on).
// Fast: no server, no browser.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const { run } = require(path.join(root, 'scripts', 'dev', 'site-facts.js'));
process.argv.push('--check');
const fail = [];

// 1. numbers and the ledger's False rows (the generator's own check)
delete require.cache[require.resolve(path.join(root, 'scripts', 'dev', 'site-facts.js'))];
const r = require(path.join(root, 'scripts', 'dev', 'site-facts.js')).run();
fail.push(...r.problems);
void run;

// 2. every test the ledger names as evidence exists
const ledger = fs.readFileSync(path.join(root, 'docs', 'CLAIMS.md'), 'utf8');
const named = new Set((ledger.match(/`((?:e2e_|security|flint_|site_|i18n_|bundle_|ui_smoke|sitesuggest_)[a-z0-9_]*)`/g) || []).map(s => s.slice(1, -1)));
for (const t of named) if (!['.py', '.js'].some(x => fs.existsSync(path.join(root, 'app', 'test', t + x)))) fail.push('docs/CLAIMS.md names a test that does not exist: ' + t);
const rows = ledger.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*(-|Claim)/.test(l));
if (rows.length < 40) fail.push('docs/CLAIMS.md has only ' + rows.length + ' rows');
for (const l of rows) if (!/\|\s*(Proven|Partly|Unproven|Real-device-only|False)\s*\|/.test(l)) fail.push('a ledger row has no status: ' + l.slice(0, 90));

// 3. no prices on the website (the app mocks picture example money inside [data-no-i18n] / aria-hidden mocks; "$0" is free)
for (const f of fs.readdirSync(path.join(root, 'site')).filter(f => f.endsWith('.html'))) {
  let s = fs.readFileSync(path.join(root, 'site', f), 'utf8').replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  if (f !== 'pricing.html') continue;   // the pricing page is where a price would be
  const hits = (s.match(/[$€£]\s?\d[\d.,]*/g) || []).filter(h => !/^[$€£]\s?0$/.test(h));
  if (hits.length) fail.push('site/' + f + ' shows a price: ' + hits.slice(0, 3).join(', '));
}

if (fail.length) { console.error('site_facts_test: FAILED\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('site_facts_test: OK (' + Object.keys(r.facts).length + ' facts, ' + rows.length + ' claims in the ledger, ' + named.size + ' tests named as evidence)');
