#!/usr/bin/env node
// Flint's capability report (feat/flint-local): what he can do with no model and with the local helper, by editor and
// by skill type, and where he is weakest. Writes docs/FLINT-CAPABILITY.md.
//   node scripts/dev/flint-capability.js              score the code as it is and rewrite the doc
//   node scripts/dev/flint-capability.js --baseline   score with the feat/flint-local upgrades switched off and save
//                                                     that as "before" (scripts/dev/flint-eval/capability-baseline.json)
//   node scripts/dev/flint-capability.js --json       print the numbers only
// Two sets: the main eval (app/test/flint_eval.json, tuned against over many rounds) and held-out batch 7
// (scripts/dev/flint-eval/held7.js, written before the upgrades). "Fixture model" is app/test/fixtures/flint-model: a
// 740 KB stand-in made by scripts/dev/flint-fixture-model.js, NOT a trained model; a real one has not been run here.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'app', 'ui');
const N = require(path.join(UI, 'flintnlu.js')), E = require(path.join(UI, 'flintembed.js')), FM = require(path.join(UI, 'flintmax.js')), LD = require(path.join(UI, 'localdoc.js'));
const H7 = require('./flint-eval/held7.js'), H8 = require('./flint-eval/held8.js'), EVAL = require(path.join(ROOT, 'app', 'test', 'flint_eval.json'));
const BASELINE = process.argv.includes('--baseline'), JSON_ONLY = process.argv.includes('--json');
const opt = f => { if (BASELINE) return null; try { return require(path.join(UI, f)); } catch { return null; } };
const CONV = opt('flintconv.js'), PLAN = opt('flintplan.js'), SEMX = opt('flintsem.js');   // the upgrades (absent in the baseline)
const kb = require(path.join(ROOT, 'server', 'flintkb.js'))({ nlu: N });
const fx = path.join(ROOT, 'app', 'test', 'fixtures', 'flint-model');
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const MODEL = E.fromFiles({ model: ab(fs.readFileSync(path.join(fx, 'model.safetensors'))), tokenizer: fs.readFileSync(path.join(fx, 'tokenizer.json'), 'utf8') });

const NOW = new Date('2026-11-13T10:00:00');
const CTX = { g: {}, s: { view: 'site', pages: ['Home', 'About', 'Contact'] }, p: { view: 'preview', site: true }, c: { view: 'canvas' }, cs: { view: 'canvas', selection: true }, sh: { view: 'sheet' }, d: { view: 'doc' }, sl: { view: 'deck' } };
const EDITOR = { g: 'Anywhere (tasks, chat, calendar, settings)', s: 'Website designer', p: 'Preview', c: 'Design canvas', cs: 'Design canvas', sh: 'Sheets', d: 'Docs', sl: 'Slides' };
const members = () => [{ id: 'm1', name: 'Maya Lee' }, { id: 'm2', name: 'Sam Ortiz' }];
const base = () => ({ now: NOW, members: members(), tasks: [] });
const low = v => String(v == null ? '' : v).toLowerCase().trim();
function slotWhy(got, want) {
  for (const [k, v] of Object.entries(want || {})) {
    let g = got[k];
    if (k === 'who') g = got.who && got.who.name; else if (k === 'ref') g = got.task && got.task.title; else if (k === 'minutes') g = got.n; else if (k === 'color') g = got.color && (low(got.color.name) === low(v) ? got.color.name : got.color.hex);
    if (low(g) !== low(v)) return `${k}: ${JSON.stringify(g == null ? null : g)}`;
  }
  return '';
}
function cmdWhy(steps, want, slots) {
  const s = steps[0];
  if (Array.isArray(want)) return steps.length !== want.length || want.some((id, n) => steps[n].intent !== id) ? `steps ${steps.map(x => x.intent).join(',')}` : '';
  if (want === null) return steps.length === 1 && s.intent && s.conf >= 0.6 && s.intent !== 'help.kb' ? `claimed ${s.intent}` : '';
  if (steps.length !== 1) return `split into ${steps.map(x => x.intent).join(',')}`;
  if (s.intent !== want) return `got ${s.intent || 'nothing'}`;
  if (s.conf < 0.6) return 'low confidence';
  return slotWhy(s.slots || {}, slots);
}
// the path the app takes: flintconv.js (follow-ups, everyday rewrites) in front of flintnlu.js when it is there
const parse = (t, ctx) => (CONV ? CONV.create().parse(t, ctx, N) : N.parse(t, ctx));
const tally = () => ({ ok: 0, n: 0, fails: [] });
const mark = (t, why, label) => { t.n++; if (!why) t.ok++; else t.fails.push(`“${label}” → ${why}`); };

function run(withModel, H7) {
  N.setSemantic(withModel ? MODEL : null);
  const R = { editor: {}, held: {}, skill: {} };
  // ---- by editor: the main eval, then held-out batch 7's commands ----
  for (const c of EVAL.cases) { const ed = EDITOR[c.ctx || 'g']; R.editor[ed] = R.editor[ed] || tally(); const cx = { ...base(), now: new Date(EVAL.now), ...CTX[c.ctx || 'g'] }; let why = cmdWhy(parse(c.t, cx).steps, c.i, c.s); if (!why && PLAN && c.i !== null && PLAN.isGoal(c.t, N, cx)) why = 'the planner would take it'; mark(R.editor[ed], why, c.t); }
  const cmd = R.skill.commands = tally();
  for (const [cx, t, i, s] of H7.cmd) { const why = cmdWhy(parse(t, { ...base(), ...CTX[cx] }).steps, i, s); mark(cmd, why, t); const ed = EDITOR[cx]; R.held[ed] = R.held[ed] || tally(); mark(R.held[ed], why, t); }
  // ---- follow-ups: a conversation; the session keeps what flintlocal.js keeps (the last task and person), or flintconv.js's memory ----
  const fol = R.skill['follow-ups'] = tally();
  for (const conv of H7.follow) {
    const ctx = base(), last = {}, mem = CONV ? CONV.create() : null; let tn = 0;
    conv.forEach(([cx, t, want, slots], k) => {
      const c2 = { ...ctx, ...CTX[cx], last };
      const steps = mem ? mem.parse(t, c2, N).steps : N.parse(t, c2).steps, s = steps[0] || {};
      if (k) mark(fol, cmdWhy(steps, want, slots), `${conv[0][1]} … ${t}`);
      // what the app would do after the step
      if (s.intent === 'task.add' && s.slots && s.slots.title) { const tk = { id: 't' + (++tn), title: s.slots.title, status: 'todo', assignee: s.slots.who && s.slots.who.id }; ctx.tasks.push(tk); last.task = tk; }
      else if (s.slots && s.slots.task) last.task = s.slots.task;
      if (s.intent === 'task.delete' && s.slots && s.slots.task) ctx.tasks = ctx.tasks.filter(x => x.id !== s.slots.task.id);
      if (s.slots && s.slots.who && !s.slots.who.all) last.person = s.slots.who;
      if (mem) mem.done(steps);
    });
  }
  // ---- did you mean: handled directly, or the wanted intent among the three chips ----
  const dym = R.skill['did-you-mean'] = tally();
  for (const [t, want] of H7.dym) {
    const st = parse(t, base()).steps, s = st[0];
    const direct = st.length === 1 && s.intent && s.conf >= 0.6, hit = direct ? want.includes(s.intent) : st.length === 1 && (s.alts || []).slice(0, 3).some(a => want.includes(a.intent));
    mark(dym, hit ? '' : direct ? `did ${s.intent}` : `chips: ${(s.alts || []).slice(0, 3).map(a => a.intent).join(', ') || 'none'}`, t);
  }
  // ---- help answers: is the first answer from the right page ----
  const help = R.skill['help answers'] = tally();
  for (const [q, rx] of H7.help) {
    let a = kb.ask(q, 8);
    if (withModel && a.length) { const qv = MODEL.embed(q), top = Math.max(1e-6, ...a.map(x => x.score || 0)); a = a.map(x => ({ ...x, blend: MODEL.sim(qv, MODEL.embed(`${x.title} ${x.heading} ${x.snippet}`)) * 0.6 + (x.score || 0) / top * 0.4 })).sort((x, y) => y.blend - x.blend); }   // flintmodel.js rerank()
    mark(help, a[0] && rx.test(`${a[0].file} ${a[0].slug || ''}`) ? '' : `answered from ${a[0] ? a[0].file : 'nothing'}`, q);
  }
  // ---- search by meaning: the query shares few or no words with the item ----
  const srch = R.skill['search by meaning'] = tally();
  {
    const docs = H7.search.corpus.map(([id, kind, text]) => ({ id, kind, text })), idx = N.index(docs);
    for (const [q, want] of H7.search.q) {
      let top = null;
      if (SEMX) top = (SEMX.rank(q, docs, { nlu: N, model: withModel ? MODEL : null, k: 1 })[0] || {}).id;
      else if (withModel) { const r = MODEL.rank(q, docs.map(d => d.text), 1)[0]; top = r ? docs[r.i].id : null; }
      else { const r = N.search(idx, q, 1)[0]; top = r ? r.doc.id : null; }
      mark(srch, top === want ? '' : `found ${top || 'nothing'}, wanted ${want}`, q);
    }
  }
  // ---- duplicate tasks ----
  const dup = R.skill['duplicate tasks'] = tally();
  for (const [t, have, want] of H7.dup) {
    const got = SEMX ? SEMX.duplicate(t, have, { nlu: N, model: withModel ? MODEL : null }) : -1;
    mark(dup, got === want ? '' : got < 0 ? 'no warning' : `flagged “${have[got]}”`, t);
  }
  // ---- summaries (extractive, no model): every key fact kept, inside the word limit ----
  const sum = R.skill.summaries = tally();
  for (const [text, facts, max] of H7.summary) {
    const out = (SEMX ? SEMX.summary(text, LD, { maxWords: max }) : LD.summarize(text, { max: 3 }).text) || '', words = out.split(/\s+/).filter(Boolean).length;
    const miss = facts.filter(f => !low(out).includes(low(f)));
    mark(sum, words > max ? `${words} words (limit ${max})` : miss.length ? `lost “${miss.join('”, “')}”` : '', text.slice(0, 40) + '…');
  }
  // ---- copy and tone (word lists) ----
  const tone = R.skill['copy / tone'] = tally();
  for (const [text, t, must, mustNot] of H7.tone) {
    const out = FM.tone(text, t), bad = [...must.filter(m => !low(out).includes(low(m))).map(m => `missing “${m}”`), ...mustNot.filter(m => out.includes(m)).map(m => `still has “${m}”`)];
    mark(tone, bad.join(', '), `${t}: ${text.slice(0, 44)}`);
  }
  // ---- generation: something real from a description ----
  const gen = R.skill.generation = tally(), wr = R.skill['open writing (needs a writing model)'] = tally();
  for (const [t, kind] of H7.gen) {
    const st = parse(t, base()).steps, s = st[0] || {};
    if (kind === 'build') mark(gen, st.length === 1 && s.intent && s.conf >= 0.6 && /^(site|build|deck|sheet|doc|design|canvas)\b/.test(s.intent) ? '' : `got ${s.intent || 'nothing'}`, t);
    else if (kind === 'plan') { const p = PLAN ? PLAN.plan(t, { ...base(), nlu: N }) : null; mark(gen, p && p.steps.length >= 3 && p.steps.every(x => x.intent) ? '' : p ? `a plan of ${p.steps.length} steps` : 'no plan: one question with chips', t); }
    else mark(wr, 'needs a writing model (tier 2 or 3); Flint says so and offers one', t);
  }
  N.setSemantic(null);
  return R;
}

const flat = R => { const o = {}; for (const g of ['editor', 'held', 'skill']) { o[g] = {}; for (const [k, t] of Object.entries(R[g])) o[g][k] = [t.ok, t.n]; } return o; };
const none = run(false, H7), fix = run(true, H7), now = { none: flat(none), fixture: flat(fix) };
const none8 = run(false, H8), fix8 = run(true, H8), now8 = { none: flat(none8), fixture: flat(fix8) };
const BF = path.join(__dirname, 'flint-eval', 'capability-baseline.json');
if (BASELINE) { let old = null; try { old = JSON.parse(fs.readFileSync(BF, 'utf8')); } catch {}   // batch 7's first run is kept as it was scored; batch 8 is added with the upgrades switched off
  fs.writeFileSync(BF, JSON.stringify({ ...(old && old.none ? old : { at: new Date().toISOString().slice(0, 10), ...now }), h8: now8 }, null, 1) + '\n'); console.log('saved the baseline'); }
if (JSON_ONLY) { console.log(JSON.stringify(now)); process.exit(0); }
let before = null; try { before = JSON.parse(fs.readFileSync(BF, 'utf8')); } catch {}

const pc = ([a, b]) => (b ? `${a}/${b} (${Math.round(a / b * 100)}%)` : '–');
const sumOf = o => Object.values(o).reduce((s, [a, b]) => [s[0] + a, s[1] + b], [0, 0]);
const SK = Object.keys(now.none.skill), scored = SK.filter(k => !/open writing/.test(k));
const h7 = m => scored.reduce((s, k) => [s[0] + m.skill[k][0], s[1] + m.skill[k][1]], [0, 0]);
const L = [];
L.push('# Flint capability report', '',
  'Written by `node scripts/dev/flint-capability.js`; do not edit by hand. What Flint does **on the device with no AI service**, measured two ways:', '',
  `- **Main eval** (\`app/test/flint_eval.json\`, ${EVAL.cases.length} phrasings): tuned against over many rounds, so read it as a regression check, not as a fair score.`,
  `- **Held-out batch 7** (\`scripts/dev/flint-eval/held7.js\`, ${h7(now.none)[1]} scored checks + ${now.none.skill['open writing (needs a writing model)'][1]} writing requests): written before the feat/flint-local upgrades, from the intent list only.`,
  '', 'Caveats, read before quoting a number:', '',
  '- The same hand wrote the tests and the code. Batch 7 was scored once before the upgrades (“before” below); the upgrades were then built **with those misses in view**, so “after” is a tuned score on that batch, not a held-out one.',
  '- “Fixture model” is a 740 KB stand-in (`scripts/dev/flint-fixture-model.js`), not a trained model, and its synonym list was written by the same hand. It shows the wiring works. The real default model (potion-base-8M) has **not** been run here: the build machine cannot reach its publisher.',
  '- Tier 2 (a local LLM) has no score: no real model was reachable. Its plumbing is tested with a scripted fake server (`app/test/e2e_flint_llm.py`). The “open writing” row is what it is for.',
  '- Small sets: one case is 7–17 points in most rows.', '');
L.push('## By skill type (held-out batch 7)', '');
L.push(before ? '| Skill | Before · no model | Before · fixture model | After · no model | After · fixture model |' : '| Skill | No model | Fixture model |', before ? '|---|---|---|---|---|' : '|---|---|---|');
for (const k of SK) L.push(before ? `| ${k} | ${pc(before.none.skill[k] || [0, 0])} | ${pc(before.fixture.skill[k] || [0, 0])} | ${pc(now.none.skill[k])} | ${pc(now.fixture.skill[k])} |` : `| ${k} | ${pc(now.none.skill[k])} | ${pc(now.fixture.skill[k])} |`);
L.push(before ? `| **All scored rows** | **${pc(h7(before.none))}** | **${pc(h7(before.fixture))}** | **${pc(h7(now.none))}** | **${pc(h7(now.fixture))}** |` : `| **All scored rows** | **${pc(h7(now.none))}** | **${pc(h7(now.fixture))}** |`, '');
if (!BASELINE && CONV) {
  L.push('## Held-out batch 8 (written after the upgrades, scored once, never tuned against)', '', 'The fairer “after” number. Same shapes, new phrasings and topics.', '', '| Skill | Upgrades off · no model | No model | Fixture model |', '|---|---|---|---|');
  const b8 = (before && before.h8) || null;
  for (const k of SK) L.push(`| ${k} | ${b8 ? pc(b8.none.skill[k]) : '–'} | ${pc(now8.none.skill[k])} | ${pc(now8.fixture.skill[k])} |`);
  L.push(`| **All scored rows** | **${b8 ? pc(h7(b8.none)) : '–'}** | **${pc(h7(now8.none))}** | **${pc(h7(now8.fixture))}** |`, '', '“Upgrades off” runs the same batch with flintconv.js, flintplan.js and flintsem.js switched off (the tone word lists cannot be switched off, so that row is the same).', '', 'Examples of what still fails on batch 8:', '');
  for (const k of scored) none8.skill[k].fails.slice(0, 2).forEach(f => L.push(`- ${k}: ${f}`));
  L.push('');
}
L.push('## By editor (commands)', '', '| Editor | Main eval, no model | Batch 7 commands, no model |', '|---|---|---|');
for (const k of Object.keys(now.none.editor)) L.push(`| ${k} | ${pc(now.none.editor[k])} | ${pc(now.none.held[k] || [0, 0])} |`);
L.push(`| **All** | **${pc(sumOf(now.none.editor))}** | **${pc(sumOf(now.none.held))}** |`, '', 'The local helper never decides a command, so these are the same with the fixture model.', '');
L.push('## Weakest areas now', '');
const weak = scored.map(k => [k, now.none.skill[k][0] / now.none.skill[k][1], none.skill[k], fix.skill[k]]).sort((a, b) => a[1] - b[1]).slice(0, 5);
for (const [k, , t, tf] of weak) { L.push(`- **${k}**: ${pc([t.ok, t.n])} with no model, ${pc([tf.ok, tf.n])} with the fixture model.${t.fails.length ? ' Fails:' : ''}`); t.fails.slice(0, 3).forEach(f => L.push(`  - ${f}`)); }
const w = none.skill['open writing (needs a writing model)'];
L.push(`- **open writing**: 0/${w.n} without a writing model, by design. Examples: ${H7.gen.filter(g => g[2 - 1] === 'write').slice(0, 3).map(g => `“${g[0]}”`).join(', ')}.`, '');
if (before) { L.push('## Weakest areas before the upgrades', ''); scored.map(k => [k, before.none.skill[k]]).filter(([, v]) => v && v[1]).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).slice(0, 5).forEach(([k, v]) => L.push(`- ${k}: ${pc(v)}`)); L.push(''); }
const out = L.join('\n');
if (!BASELINE) fs.writeFileSync(path.join(ROOT, 'docs', 'FLINT-CAPABILITY.md'), out + '\n');
console.log(out);
