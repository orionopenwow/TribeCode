#!/usr/bin/env node
// feat/flint-local, the pure parts (no browser, no model): conversation memory (flintconv.js), the planner
// (flintplan.js), project memory's fact rules (flintfacts.js) and the local model's safety check (flintllm.js validate).
//   node app/test/flint_local_test.js
'use strict';
const assert = require('node:assert'), path = require('node:path');
const U = f => require(path.join(__dirname, '..', 'ui', f));
const N = U('flintnlu.js'), CV = U('flintconv.js'), PL = U('flintplan.js'), FX = U('flintfacts.js'), LLM = U('flintllm.js');
const now = new Date('2026-11-13T10:00:00'), members = [{ id: 'm1', name: 'Maya Lee' }, { id: 'm2', name: 'Sam Ortiz' }];

// ---------- conversation memory ----------
{
  const mem = CV.create(), ctx = { now, members, tasks: [], last: {} };
  const say = t => { const P = mem.parse(t, ctx, N), s = P.steps[0]; if (s.intent === 'task.add') { const tk = { id: 't' + ctx.tasks.length, title: s.slots.title, status: 'todo' }; ctx.tasks.push(tk); ctx.last.task = tk; } mem.done(P.steps); return P; };
  assert.strictEqual(say('tell maya the build is up').steps[0].intent, 'dm.send');
  let P = say('tell sam too'); assert.strictEqual(P.via, 'follow-up'); assert.strictEqual(P.steps[0].slots.who.name, 'Sam Ortiz'); assert.strictEqual(P.steps[0].slots.msg, 'the build is up');
  say('add a task to buy flour'); P = say('and another one to book the hall'); assert.strictEqual(P.steps[0].slots.title, 'Book the hall');
  P = say('its due tomorrow'); assert.strictEqual(P.steps[0].intent, 'task.due'); assert.strictEqual(P.steps[0].slots.task.title, 'Book the hall'); assert.ok(!P.steps[0].ask, 'the date was read, so no question');
  P = say('never mind, delete it'); assert.strictEqual(P.steps[0].intent, 'task.delete'); assert.strictEqual(P.steps[0].slots.task.title, 'Book the hall');
  say('set a timer for 10 minutes'); P = say('make that 15'); assert.strictEqual(P.steps[0].intent, 'timer'); assert.strictEqual(P.steps[0].slots.n, 15);
  say('switch to light theme'); assert.strictEqual(say('actually make it midnight').steps[0].intent, 'theme.midnight');
  // with nothing before it, a follow-up shape is not invented
  const fresh = CV.create(); assert.ok(!fresh.parse('make that 15', { now, members, tasks: [] }, N).via);
  assert.ok(!fresh.parse('tell sam too', { now, members, tasks: [] }, N).via);
  // a command the rules are sure of is returned as it is
  const a = N.parse('add a task to buy milk tomorrow for maya', { now, members, tasks: [] }), b2 = fresh.parse('add a task to buy milk tomorrow for maya', { now, members, tasks: [] }, N);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.steps)), JSON.parse(JSON.stringify(b2.steps)));
  // everyday rewrites only count when the rules then understand them
  assert.strictEqual(fresh.parse('start a countdown for 25 minutes', { now, members, tasks: [] }, N).steps[0].intent, 'timer');
  assert.strictEqual(fresh.parse('hunt down the banner image', { now, members, tasks: [] }, N).steps[0].intent, 'find');
  mem.clear(); assert.strictEqual(mem.turns().length, 0);
}
// ---------- the planner ----------
{
  const o = { now, members, nlu: N };
  const p = PL.plan('launch page for our bake sale by friday', o);
  assert.ok(p && p.kind === 'page' && p.subject === 'bake sale' && p.due === 'friday' && p.steps.length === 5, JSON.stringify(p));
  assert.deepStrictEqual(p.steps.map(s => s.intent), ['build.landing', 'task.add', 'task.add', 'task.add', 'event.add']);
  for (const s of p.steps) { const st = N.parse(s.say, { now, members, tasks: [] }).steps; assert.ok(st.length === 1 && st[0].intent === s.intent && st[0].conf >= 0.6, s.say); }
  assert.strictEqual(PL.plan('organise a team offsite in june', o).kind, 'event');
  assert.strictEqual(PL.plan('set up everything for a new podcast', o).kind, 'podcast');
  for (const t of ['plan my day', 'launch it for everyone', 'organise the files', 'add a task to plan the party', 'make a landing page for sunrise bakery', 'open the calendar', 'what is the plan', 'undo'])
    assert.strictEqual(PL.isGoal(t, N, { now, members, tasks: [] }), false, t);
  // no eval phrasing with an expected command is taken by the planner
  const E = require('./flint_eval.json'), CTX = { g: {}, s: { view: 'site', pages: ['Home', 'About', 'Contact'] }, p: { view: 'preview', site: true }, c: { view: 'canvas' }, cs: { view: 'canvas', selection: true }, sh: { view: 'sheet' }, d: { view: 'doc' }, sl: { view: 'deck' } };
  const taken = E.cases.filter(c => c.i !== null && PL.isGoal(c.t, N, { now, members, tasks: [], ...CTX[c.ctx || 'g'] })).map(c => c.t);
  assert.deepStrictEqual(taken, [], 'the planner takes eval commands: ' + taken.join(' | '));
}
// ---------- project memory: the fact rules ----------
{
  const one = t => FX.extract(t)[0] || {};
  assert.deepStrictEqual(one('The bake sale is on Saturday 14 June at the school gym.'), { kind: 'date', key: 'bake sale', value: 'Saturday 14 June' });
  assert.strictEqual(one('We decided to drop multiplayer for the first release.').kind, 'decision');
  assert.deepStrictEqual(one('We are calling it Ember Run.'), { kind: 'name', key: 'project name', value: 'Ember Run' });
  assert.deepStrictEqual(one('MVP means the first playable level.'), { kind: 'term', key: 'MVP', value: 'the first playable level' });
  assert.deepStrictEqual(one('Maya is our artist and Sam handles the music.'), { kind: 'person', key: 'Maya', value: 'artist' });
  for (const t of ['It is a nice day today.', 'when is the bake sale?', 'add a task to buy milk', 'lol ok', '']) assert.deepStrictEqual(FX.extract(t), [], t);
  assert.ok(FX.extract('x '.repeat(20000)).length === 0);
}
// ---------- the local model's output: only checked commands get through ----------
{
  const ctx = { now, members, tasks: [] }, V = o => LLM.validate(o, N, ctx);
  let v = V({ ops: [{ say: 'add a task to buy groceries tomorrow' }] }); assert.ok(v.ok && v.kind === 'ops' && v.steps[0].intent === 'task.add' && !v.steps[0].confirm);
  v = V({ ops: [{ say: 'tell maya the build is up' }] }); assert.ok(v.ok && v.steps[0].confirm, 'a message to someone waits for a press');
  v = V({ text: 'Hello there.' }); assert.ok(v.ok && v.kind === 'text');
  for (const [bad, why] of [[null, 'not an object'], [[], 'not an object'], ['x', 'not an object'], [{}, 'neither'], [{ ops: [] }, '1 to 5'], [{ ops: Array(6).fill({ say: 'add a task to x' }) }, '1 to 5'],
    [{ ops: [{ say: 'add a task to x', run: 'rm -rf /' }] }, 'do not know'], [{ ops: [{ say: 'add a task to x' }], exec: 1 }, 'unknown field'], [{ ops: [{ intent: 'task.add' }] }, 'plain'],
    [{ ops: [{ say: 'add a task to <script>alert(1)</script>' }] }, 'plain'], [{ ops: [{ say: 'transmogrify the flux capacitor' }] }, 'not one of my commands'], [{ ops: [{ say: 'start hosting' }] }, 'may not start'],
    [{ ops: [{ say: 'invite a friend' }] }, 'may not start'], [{ ops: [{ say: 'buy credits' }] }, 'may not start'], [{ ops: [{ say: 'publish it' }] }, 'may not start'], [{ ops: [{ say: 'undo' }] }, 'not an edit'],
    [{ ops: [{ say: 'add a task to paint the fence', intent: 'task.delete' }] }, 'does not mean'], [{ ops: [{ say: 'add a task to a then delete the task b' }] }, 'not one of my commands'], [{ ops: ['add a task'] }, 'not an object']]) {
    const r = V(bad); assert.ok(!r.ok && r.why.includes(why), `${JSON.stringify(bad)} -> ${JSON.stringify(r)}`);
  }
  assert.deepStrictEqual(LLM.parseReply('<think>hmm</think>```json\n{"text":"hi"}\n```'), { text: 'hi' }); assert.strictEqual(LLM.parseReply('no json here'), null); assert.strictEqual(LLM.parseReply('{broken'), null);
  for (const [u, ok] of [['http://localhost:11434', true], ['http://127.0.0.1:1234/v1', true], ['http://[::1]:8080', true], ['https://api.openai.com', false], ['http://localhost.evil.com', false], ['http://127.0.0.1.evil.com', false], ['http://user:pw@localhost:1', false], ['file:///etc/passwd', false], ['http://192.168.1.5:11434', false], ['javascript:alert(1)', false]]) assert.strictEqual(!!LLM.isLoopback(u), ok, u);
  assert.strictEqual(LLM.kindOf('rewrite this friendly: We regret to inform you.').kind, 'rewrite'); assert.strictEqual(LLM.kindOf('explain this error: TypeError x is undefined').kind, 'explain');
  assert.strictEqual(LLM.kindOf('come up with a name for our cafe app').kind, 'name'); assert.strictEqual(LLM.kindOf('add a task to buy milk'), null); assert.strictEqual(LLM.kindOf('write a note'), null);
  const sys = LLM.sysOps('sort out the groceries', N, ctx, ''); assert.ok(/JSON only/.test(sys) && /add a task to buy milk/.test(sys) && !/start hosting|invite a friend|buy credits/.test(sys), 'the prompt never offers what a model may not start');
}
console.log('flint_local_test ok: conversation memory, the planner (and it takes no eval command), fact rules, the local model\'s safety check (19 kinds of bad output refused, loopback only)');
