#!/usr/bin/env node
// Search by meaning, measured (feat/flint-meaning). Three tiers on the same sets:
//   no table      flintnlu.js + flintsem.js with no word vectors at all (what shipped in v0.36)
//   built-in      the word table that ships with the app (app/ui/flintwords.bin via flintmeaning.js), always on
//   stand-in      the local helper's fixture model (app/test/fixtures/flint-model) on top of the built-in table. It is
//                 NOT a trained model: it only proves the wiring. The real helper model has not been run here.
// Sets: the tuning sets (batches 7 and 8 and flint-eval/tune9.js; blends and thresholds were tuned on them) and held-out batch 9
// (scripts/dev/flint-eval/held9.js: written before the table existed and never tuned against).
//   node scripts/dev/flint-meaning-eval.js [--json] [-v] [--write]     --write updates docs/FLINT-MEANING.md
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'app', 'ui');
const N = require(path.join(UI, 'flintnlu.js')), E = require(path.join(UI, 'flintembed.js')), SEMX = require(path.join(UI, 'flintsem.js'));
let CONV = null; try { CONV = require(path.join(UI, 'flintconv.js')); } catch {}
let MEAN = null; try { MEAN = require(path.join(UI, 'flintmeaning.js')); } catch {}
const H7 = require('./flint-eval/held7.js'), H8 = require('./flint-eval/held8.js'), H9 = require('./flint-eval/held9.js'), T9 = require('./flint-eval/tune9.js');
let TIER = null;   // the model of the tier being scored; the knowledge base re-ranks with it, as the server does with the shipped table
const kb = require(path.join(ROOT, 'server', 'flintkb.js'))({ nlu: N, model: () => (TIER && TIER.cover ? TIER : null) });
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const fx = path.join(ROOT, 'app', 'test', 'fixtures', 'flint-model');
const FIX = E.fromFiles({ model: ab(fs.readFileSync(path.join(fx, 'model.safetensors'))), tokenizer: fs.readFileSync(path.join(fx, 'tokenizer.json'), 'utf8') });
const BIN = process.env.FLINT_BIN || path.join(UI, 'flintwords.bin');
const BUILTIN = MEAN && fs.existsSync(BIN) ? MEAN.fromBuffer(ab(fs.readFileSync(BIN))) : null;
const TIERS = [['no table', null], ['built-in', BUILTIN], ['stand-in', BUILTIN && MEAN.stack ? MEAN.stack(BUILTIN, FIX) : FIX]].filter(t => t[0] === 'no table' || t[1]);
const V = process.argv.includes('-v'), JSON_ONLY = process.argv.includes('--json');

const NOW = new Date('2026-11-13T10:00:00');
const base = () => ({ now: NOW, members: [{ id: 'm1', name: 'Maya Lee' }, { id: 'm2', name: 'Sam Ortiz' }], tasks: [] });
const parse = (t, ctx) => (CONV ? CONV.create().parse(t, ctx, N) : N.parse(t, ctx));
const tally = () => ({ ok: 0, n: 0, direct: 0, wrong: 0, sure: 0, sureOk: 0, fails: [] });

function para(list, model) {
  const T = tally();
  for (const [t, want] of list) {
    const st = parse(t, base()).steps, s = st[0] || {};
    const direct = st.length === 1 && s.intent && s.conf >= 0.6 && s.intent !== 'help.kb';
    const chips = (s.alts || []).slice(0, 3).map(a => a.intent);
    const hit = direct ? want.includes(s.intent) : st.length === 1 && (want.includes(s.intent) || chips.some(c => want.includes(c)));
    // the single "Did you mean this?" chip (TribeMeaning.sure): well clear of the next one
    if (!direct && model && s.alts && s.alts[0] && s.alts[0].score >= 0.4 && s.alts[0].score - (s.alts[1] ? s.alts[1].score || 0 : 0) >= 0.15) { T.sure++; if (want.includes(s.alts[0].intent)) T.sureOk++; }
    T.n++; if (hit) { T.ok++; if (direct) T.direct++; } else { if (direct) T.wrong++; T.fails.push(`“${t}” → ${direct ? 'did ' + s.intent : 'chips: ' + (chips.join(', ') || 'none')}`); }
  }
  return T;
}
function help(list, model) {
  const T = tally();
  for (const [q, rx] of list) {
    let a = kb.ask(q, 8);
    if (model && !model.cover && a.length) a = MEAN.rerank(model, q, a, x => `${x.title} ${x.heading} ${x.snippet}`, x => x.score || 0);
    // The path pages (docs/guide/p-*, added after these sets were written) answer two kinds of question as well as the pages
    // the labels name: inviting people (p-friends) and connecting an agent (p-ai). One rule for every set, held-out included.
    const f = a[0] ? `${a[0].file} ${a[0].slug || ''}` : '', also = (/invite/.test(rx.source) && /p-friends/.test(f)) || (/connect|agents/.test(rx.source) && /p-ai/.test(f));
    T.n++; if (a[0] && (rx.test(f) || also)) T.ok++; else T.fails.push(`“${q}” → ${a[0] ? a[0].file : 'nothing'}`);
  }
  return T;
}
function search(S, model) {
  const T = tally(); T.top3 = 0;
  const docs = S.corpus.map(([id, kind, text]) => ({ id, kind, text }));
  for (const [q, want] of S.q) {
    const r = SEMX.rank(q, docs, { nlu: N, model, k: 3 }).map(x => x.id);
    T.n++; if (r[0] === want) T.ok++; else T.fails.push(`“${q}” → ${r[0] || 'nothing'}, wanted ${want}`);
    if (r.includes(want)) T.top3++;
  }
  return T;
}
const dymList = H => H.dym.concat(H.cmd.filter(c => c[0] === 'g').map(c => [c[1], [c[2]]]));

const R = {};
for (const [name, model] of TIERS) {
  N.setSemantic(model); TIER = model;
  R[name] = {
    'tuning sets · paraphrases': para(dymList(H7).concat(dymList(H8), T9.para), model),
    'tuning sets · help': help(H7.help.concat(H8.help, T9.help), model),
    'tuning sets · search': (() => { const a = [H7.search, H8.search, T9.search].map(x => search(x, model)); return { ok: a.reduce((n, x) => n + x.ok, 0), n: a.reduce((n, x) => n + x.n, 0), top3: a.reduce((n, x) => n + x.top3, 0), fails: [].concat(...a.map(x => x.fails)) }; })(),
    'batch 9 (held out) · paraphrases': para(H9.para, model),
    'batch 9 (held out) · help': help(H9.help, model),
    'batch 9 (held out) · search': search(H9.search, model),
  };
}
N.setSemantic(null);
const pct = t => `${t.ok}/${t.n} (${Math.round(t.ok / t.n * 100)}%)`;
if (JSON_ONLY) { console.log(JSON.stringify(Object.fromEntries(Object.entries(R).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([s, t]) => [s, { ok: t.ok, n: t.n, top3: t.top3, direct: t.direct, wrong: t.wrong, sure: t.sure, sureOk: t.sureOk }]))])), null, 1)); process.exit(0); }
const rows = Object.keys(R['no table']);
const lines = ['| Set | ' + TIERS.map(t => t[0]).join(' | ') + ' |', '|---|' + TIERS.map(() => '---').join('|') + '|'];
for (const r of rows) lines.push(`| ${r} | ${TIERS.map(([n]) => { const t = R[n][r]; return pct(t) + (t.top3 != null ? `, top 3: ${t.top3}` : '') + (t.wrong ? `, ${t.wrong} wrong action${t.wrong > 1 ? 's' : ''}` : '') + (t.sure ? `, single chip right ${t.sureOk} of ${t.sure}` : ''); }).join(' | ')} |`);
console.log(lines.join('\n'));
if (V) for (const [n] of TIERS) for (const r of rows) if (process.argv.includes('--held') ? /batch 9/.test(r) : /tuning/.test(r)) { console.log(`\n## ${n} · ${r}`); R[n][r].fails.forEach(f => console.log('  ' + f)); }
if (process.argv.includes('--write')) {
  const p = path.join(ROOT, 'docs', 'FLINT-MEANING.md'), cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const block = `<!-- numbers:start -->\n${lines.join('\n')}\n<!-- numbers:end -->`;
  if (/<!-- numbers:start -->[\s\S]*<!-- numbers:end -->/.test(cur)) fs.writeFileSync(p, cur.replace(/<!-- numbers:start -->[\s\S]*<!-- numbers:end -->/, block)); else console.error('docs/FLINT-MEANING.md has no numbers block');
}
