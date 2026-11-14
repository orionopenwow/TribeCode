#!/usr/bin/env node
// Flint's built-in meaning layer (feat/flint-meaning): app/ui/flintmeaning.js + app/ui/flintwords.bin.
//   - the word table loads, is small enough to ship, and says where it came from
//   - words that mean the same sit together; unrelated words do not
//   - with the table set, a paraphrase Flint's rules miss gets the right "did you mean" chip, a real word is not
//     "corrected" into a command word, and a taught phrase said in other words is offered (never run)
//   - with no table, parsing is exactly as before
//   - search ranks by meaning; the knowledge base re-ranks with the table
//   - the tuning sets stay above their floors (scripts/dev/flint-meaning-eval.js; the held-out batch is not gated here)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'app', 'ui');
const M = require(path.join(UI, 'flintmeaning.js')), N = require(path.join(UI, 'flintnlu.js')), S = require(path.join(UI, 'flintsem.js'));
let n = 0; const ok = (c, msg) => { n++; if (!c) { console.error('FAIL: ' + msg); process.exit(1); } };

const raw = fs.readFileSync(path.join(UI, 'flintwords.bin')), gz = zlib.gzipSync(raw, { level: 9 }).length;
ok(gz <= 1.5 * 1024 * 1024, `the table is ${Math.round(gz / 1024)} KB gzipped; the budget is 1.5 MB`);
const hl = raw.readUInt32LE(0), head = JSON.parse(raw.slice(8, 8 + hl).toString('utf8'));
ok(/GloVe/.test(head.source) && /WordNet/.test(head.license) && /PDDL/.test(head.license), 'the table names its sources and licences');
const m = M.fromBuffer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
ok(m.vocabSize >= 20000 && m.dim === 64 && m.builtin, 'about 21,000 words of 64 numbers');
ok((() => { try { M.fromBuffer(new Uint8Array(64).buffer); return false; } catch { return true; } })(), 'a damaged table is refused');

const near = (a, b) => m.near(m.toks(a)[0], m.toks(b)[0]);
for (const [a, b] of [['cost', 'price'], ['remove', 'delete'], ['picture', 'photo'], ['kids', 'children'], ['brother', 'friend'], ['conversation', 'chat'], ['monday', 'friday']]) ok(near(a, b) >= 0.25, `${a} ~ ${b} (${near(a, b).toFixed(2)})`);
for (const [a, b] of [['cake', 'server'], ['budget', 'crash'], ['poster', 'tuesday']]) ok(near(a, b) === 0, `${a} and ${b} are unrelated (${near(a, b).toFixed(2)})`);
ok(m.cover('photo of the kids', 'a picture of twelve children') > 0.5 && m.cover('photo of the kids', 'Fixed the crash when saving twice') < 0.2,'cover prefers the text about the same thing');
ok(m.tokens('could you please delete it for me') === 1, 'filler words carry no meaning');

const ctx = () => ({ now: new Date('2026-11-13T10:00:00'), members: [{ id: 'm1', name: 'Maya Lee' }], tasks: [] });
const chips = t => { const s = N.parse(t, ctx()).steps[0]; return { s, ids: (s.alts || []).map(a => a.intent) }; };
const before = JSON.stringify(['bin that chore', 'add a task to buy milk', 'open settings', 'zzz qqq'].map(t => N.parse(t, ctx())));
N.setSemantic(m);
ok(chips('bin that chore').ids.includes('task.delete'), '"bin that chore" offers deleting a task');
ok(chips('boil the conversation down for me').ids.includes('chat.summarize'), '"boil the conversation down" offers the chat summary');
ok(chips('add my brother to the tribe').ids.includes('invite'), '"brother" is not corrected to "browser": invite is offered');
ok(!chips('add a task to buy milk').s.fuzzy && chips('add a task to buy milk').s.intent === 'task.add', 'a recognized command is untouched');
{ const s = N.parse('begin the morning meeting', { ...ctx(), learned: [{ say: 'start the daily meeting', means: 'open the calendar' }] }).steps[0];
  ok(!s.intent || s.conf < 0.6, 'a taught phrase in other words does not run by itself'); ok((s.alts || []).some(a => a.learned && a.example === 'start the daily meeting'), 'it is offered as a chip'); }
{ const s = N.parse('start the daily meeting', { ...ctx(), learned: [{ say: 'start the daily meeting', means: 'open the calendar' }] }).steps[0]; ok(s.intent === 'nav.calendar', 'the exact taught phrase still runs'); }
N.setSemantic(null);
ok(JSON.stringify(['bin that chore', 'add a task to buy milk', 'open settings', 'zzz qqq'].map(t => N.parse(t, ctx()))) === before, 'with no table, parsing is exactly as before');

const docs = [['d1', 'Budget: hall hire two hundred, catering four fifty'], ['d2', 'Guest list: forty adults, twelve children'], ['v1', 'Fixed the crash when saving twice'], ['c1', 'parking at the venue is full by five']].map(([id, text]) => ({ id, text }));
const top = q => (S.rank(q, docs, { nlu: N, model: m, k: 1 })[0] || {}).id;
ok(top('cost of the food') === 'd1' && top('how many kids') === 'd2' && top('nowhere to leave the car') === 'c1', 'search ranks by meaning');
ok(M.stack(m, null) === m && M.stack(null, m) === m, 'stack with one side is that side');
{ const fx = path.join(ROOT, 'app', 'test', 'fixtures', 'flint-model'), E = require(path.join(UI, 'flintembed.js')), b = fs.readFileSync(path.join(fx, 'model.safetensors'));
  const st = M.stack(m, E.fromFiles({ model: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), tokenizer: fs.readFileSync(path.join(fx, 'tokenizer.json'), 'utf8') }));
  ok(st.helper && typeof st.score('a', 'b') === 'number' && st.coverMany('cost of the food', docs.map(d => d.text)).length === docs.length, 'the helper stacks on the table behind the same interface'); }

const KB = require(path.join(ROOT, 'server', 'flintkb.js'));
ok(KB({ ui: UI, nlu: N }).ask('how do i add a person to my tribe', 2).length > 0 && KB({ nlu: N, model: null }).ask('how do i add a person to my tribe', 2).length > 0, 'the knowledge base answers with and without the table');

const R = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'dev', 'flint-meaning-eval.js'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 24 }));
const B = R['built-in'], Z = R['no table'], row = (T, k) => T[`tuning sets · ${k}`];
ok(row(B, 'paraphrases').ok >= 103 && row(B, 'paraphrases').ok > row(Z, 'paraphrases').ok, `tuning paraphrases ${row(B, 'paraphrases').ok}/114 (floor 103, no table ${row(Z, 'paraphrases').ok})`);
ok(row(B, 'paraphrases').wrong <= row(Z, 'paraphrases').wrong, 'the table adds no wrong actions');
ok(row(B, 'paraphrases').sureOk >= row(B, 'paraphrases').sure - 1, 'the single chip is nearly always right on the tuning sets');
ok(row(B, 'help').ok >= 17, `tuning help ${row(B, 'help').ok}/26 (floor 17)`);
ok(row(B, 'search').ok >= 23 && row(B, 'search').top3 >= 33, `tuning search ${row(B, 'search').ok}/50, top 3 ${row(B, 'search').top3} (floors 23 and 33)`);
console.log(`flint_meaning_test: OK (${n} checks; table ${Math.round(gz / 1024)} KB gzipped; tuning sets ${row(B, 'paraphrases').ok}/114 paraphrases, ${row(B, 'help').ok}/26 help, ${row(B, 'search').ok}/50 search)`);
