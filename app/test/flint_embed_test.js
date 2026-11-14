#!/usr/bin/env node
// Flint's local helper, tier 1 (app/ui/flintembed.js): the file format, the tokenizer, pooling and cosine; then, with
// the fixture model (app/test/fixtures/flint-model, made by scripts/dev/flint-fixture-model.js) or a real one:
//   - the eval (flint_eval.json) scores exactly the same with the model present as without it
//   - "did you mean" for unrecognized paraphrases (flint_dym_cases.json): top-3 hits without and with the model
//   node app/test/flint_embed_test.js [--model <folder with model.safetensors + tokenizer.json>] [-v]
'use strict';
const assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const E = require('../ui/flintembed.js'), N = require('../ui/flintnlu.js');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const dir = arg('--model') || path.join(__dirname, 'fixtures', 'flint-model'), verbose = process.argv.includes('-v');
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

// ---------- the format ----------
{
  const tok = { model: { type: 'WordPiece', unk_token: '[UNK]', continuing_subword_prefix: '##', vocab: { '[PAD]': 0, '[UNK]': 1, play: 2, '##ing': 3, '##ed': 4, cat: 5, dog: 6, '!': 7, 'café': 8, cafe: 9 } }, normalizer: { lowercase: true }, added_tokens: [{ id: 0, content: '[PAD]', special: true }, { id: 1, content: '[UNK]', special: true }] };
  const T = E.tokenizer(tok);
  assert.deepStrictEqual(T.ids('Playing CAT!'), [2, 3, 5, 7], 'lowercase, pieces, punctuation split');
  assert.deepStrictEqual(T.ids('played zzz dog'), [2, 4, 6], 'an unknown word is dropped');
  assert.deepStrictEqual(T.ids('Café'), [9], 'accents are stripped before the lookup');
  assert.deepStrictEqual(T.ids(''), []);
  const table = new Float32Array(10 * 2); table.set([1, 0], 4); table.set([0, 1], 6); table.set([1, 0], 10); table.set([0, 1], 12);   // play=[1,0] ##ing=[0,1] cat=[1,0] dog=[0,1]
  const file = E.writeSafetensors(table, 10, 2, { note: 'test' });
  const M = E.fromFiles({ model: ab(Buffer.from(file)), tokenizer: JSON.stringify(tok) });
  assert.strictEqual(M.dim, 2); assert.strictEqual(M.vocabSize, 10);
  const v = M.embed('playing'); assert.ok(Math.abs(v[0] - Math.SQRT1_2) < 1e-6 && Math.abs(v[1] - Math.SQRT1_2) < 1e-6, 'mean of the pieces, unit length');
  assert.ok(Math.abs(M.sim(M.embed('cat'), M.embed('play')) - 1) < 1e-6); assert.ok(Math.abs(M.sim(M.embed('cat'), M.embed('dog'))) < 1e-6);
  assert.deepStrictEqual([...M.embed('zzz')], [0, 0], 'nothing known: a zero vector, similar to nothing');
  assert.deepStrictEqual(M.rank('cat', ['dog', 'play', 'zzz']).map(r => r.i), [1], 'rank keeps what is similar');
  // float16 tables read the same
  const h = new Uint16Array(20); h[4] = 0x3c00; h[7] = 0x3c00; h[10] = 0x3c00; h[13] = 0x3c00;
  const head = JSON.stringify({ embeddings: { dtype: 'F16', shape: [10, 2], data_offsets: [0, 40] } }), hb = Buffer.from(head), f16 = Buffer.concat([Buffer.alloc(8), hb, Buffer.from(h.buffer)]); f16.writeUInt32LE(hb.length, 0);
  const M16 = E.fromFiles({ model: ab(f16), tokenizer: tok }); assert.ok(Math.abs(M16.embed('playing')[0] - Math.SQRT1_2) < 1e-6, 'float16');
  // damaged files say so
  assert.throws(() => E.fromFiles({ model: new ArrayBuffer(4), tokenizer: tok }), /not a safetensors/);
  assert.throws(() => E.fromFiles({ model: ab(Buffer.from('{"not":"a model"}  padding padding')), tokenizer: tok }), /not a safetensors/);
  const cut = Buffer.from(file).subarray(0, file.length - 20); assert.throws(() => E.fromFiles({ model: ab(cut), tokenizer: tok }), /outside the file/);
  assert.throws(() => E.fromFiles({ model: ab(Buffer.from(file)), tokenizer: '{}' }), /no vocabulary/);
}

// ---------- the model on disk ----------
const M = E.fromFiles({ model: ab(fs.readFileSync(path.join(dir, 'model.safetensors'))), tokenizer: fs.readFileSync(path.join(dir, 'tokenizer.json'), 'utf8') });
const s = (a, b) => M.sim(M.embed(a), M.embed(b));
assert.ok(s('purchase groceries', 'buy milk') > s('purchase groceries', 'switch to dark theme') + 0.15, 'synonyms are closer than unrelated words');
assert.ok(s('erase that picture', 'delete the screenshot') > 0.5);
const t0 = Date.now(); for (let i = 0; i < 2000; i++) M.embed('add a task to buy milk tomorrow for maya'); const per = (Date.now() - t0) / 2000;
assert.ok(per < 5, `an embed takes ${per} ms`);

// ---------- the eval is the same with the model present ----------
const data = require('./flint_eval.json'), CTX = { g: {}, s: { view: 'site', pages: ['Home', 'About', 'Contact'] }, p: { view: 'preview', site: true }, c: { view: 'canvas' }, cs: { view: 'canvas', selection: true }, sh: { view: 'sheet' }, d: { view: 'doc' }, sl: { view: 'deck' } };
const BASE = { now: new Date(data.now), members: [{ id: 'm1', name: 'Maya Lee' }, { id: 'm2', name: 'Sam Ortiz' }], tasks: [] };
const sig = () => data.cases.map(c => N.parse(c.t, { ...BASE, ...CTX[c.ctx || 'g'] }).steps.map(x => `${x.intent}:${(x.conf || 0).toFixed(2)}:${JSON.stringify(x.slots || {})}`).join('|'));
const without = sig(); N.setSemantic(M); const withM = sig(); N.setSemantic(null);
const moved = without.filter((x, i) => x !== withM[i]).length;
assert.strictEqual(moved, 0, `${moved} eval cases changed with the model present`);

// ---------- did you mean ----------
const dym = require('./flint_dym_cases.json').cases; let n = 0, a = 0, b = 0; const lines = [];
for (const [t, want] of dym) {
  const p0 = N.parse(t, { ...BASE }).steps; if (p0.length !== 1 || (p0[0].intent && p0[0].conf >= 0.6)) continue;   // the rules already had it (or split it)
  n++;
  const hit = st => (st.alts || []).some(x => want.includes(x.intent));
  const h0 = hit(p0[0]); N.setSemantic(M); const p1 = N.parse(t, { ...BASE }).steps[0], h1 = hit(p1); N.setSemantic(null);
  a += h0; b += h1; lines.push(`  ${h0 ? '✓' : '·'}→${h1 ? '✓' : '·'} ${JSON.stringify(t)} want ${want[0]}: ${p1.alts.map(x => x.intent).join(', ')}`);
}
if (verbose) console.log(lines.join('\n'));
console.log(`did you mean, top 3 (${n} unrecognized paraphrases): without the model ${a}/${n} = ${Math.round(a / n * 100)}% · with ${M.name || path.basename(dir)} ${b}/${n} = ${Math.round(b / n * 100)}%`);
assert.ok(n >= 12, 'enough unrecognized paraphrases to measure'); assert.ok(b > a, 'the model improves did-you-mean');
// ---------- feat/flint-local: the tier-1 uses (app/ui/flintsem.js) work with no model and blend the model in when it is there ----------
{
  const S = require('../ui/flintsem.js');
  const docs = [{ id: 'd1', text: 'Pricing notes: three plans, discounts for students' }, { id: 't1', text: 'Fix the jump bug on the second level' }, { id: 'c1', text: 'the server went down again last night' }, { id: 't2', text: 'Buy milk and eggs' }];
  for (const model of [null, M]) {
    assert.strictEqual(S.rank('how much does it cost', docs, { nlu: N, model })[0].id, 'd1', 'search: concept match' + (model ? ' + model' : ''));
    assert.strictEqual(S.rank('the outage', docs, { nlu: N, model })[0].id, 'c1');
    assert.strictEqual(S.rank('zzz qqq', docs, { nlu: N, model }).length, 0, 'nothing in common: nothing found');
    assert.strictEqual(S.duplicate('Get milk and eggs from the shop', docs.map(d => d.text), { model }), 3);
    assert.strictEqual(S.duplicate('Draw the hero', docs.map(d => d.text), { model }), -1);
    assert.deepStrictEqual(S.related('What everything costs', docs, { nlu: N, model, k: 1 }).map(r => r.id), ['d1']);
    const g = S.cluster(['the boss is too hard', 'boss fight is way too difficult', 'love the music'], { model }); assert.deepStrictEqual(g[0].items, [0, 1]); assert.strictEqual(g.length, 2);
  }
  const withM = S.rank('purchase groceries', [{ id: 'a', text: 'buy milk' }, { id: 'b', text: 'switch to dark theme' }], { nlu: N, model: M })[0];
  assert.ok(withM && withM.id === 'a' && withM.cos > 0.3, 'the model adds its cosine to the blend');
  assert.ok(/14 June/.test(S.summary('We met on Tuesday. The sale is on Saturday 14 June at the gym. The weather was lovely. We still need a card reader.', null, { maxWords: 30 })), 'the summary keeps the date');
  console.log('tier-1 uses (search, duplicates, related, groups) pass with no model and with the fixture model');
}
console.log(`flint_embed_test ok (${M.vocabSize} tokens × ${M.dim}, ${per.toFixed(3)} ms per embed, eval unchanged with the model: ${without.length} cases)`);
