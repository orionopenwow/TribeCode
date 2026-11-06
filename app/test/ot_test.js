// Unit tests for the OT core (server/ot.js, mirrored to app/ui/ot.js). Usage: node app/test/ot_test.js [iterations]
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OT = require('../../server/ot.js');
const { apply, compose, transform, transformIndex, diff, Client, Server } = OT;

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;
const t = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; } };

// ---------- deterministic edge cases ----------
t('server and browser copies are identical', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'server/ot.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'app/ui/ot.js'), 'utf8'));
});
t('apply basics', () => {
  assert.equal(apply('hello', [5, ' world']), 'hello world');
  assert.equal(apply('hello', [1, -3, 'ipp', 1]), 'hippo');
  assert.equal(apply('hello', [2, 'X']), 'heXllo');     // implicit trailing retain
  assert.equal(apply('', ['abc']), 'abc');
  assert.equal(apply('abc', [-3]), '');
  assert.throws(() => apply('ab', [3]));
});
t('normalize keeps inserts before deletes', () => {
  assert.deepEqual(OT.normalize([1, -2, 'x', 3]), [1, 'x', -2]);
  assert.deepEqual(OT.normalize([2, 3, 'a', 'b', -1, -1]), [5, 'ab', -2]);
});
t('diff: typing, deleting, paste, replace', () => {
  for (const [a, b] of [['', 'a'], ['abc', 'abXc'], ['abc', 'ac'], ['abc', ''], ['hello world', 'hello brave new world'], ['abcdef', 'abZZef'], ['same', 'same']])
    assert.equal(apply(a, diff(a, b)), b);
  assert.deepEqual(diff('abc', 'abXc'), [2, 'X']);
  assert.deepEqual(diff('abc', 'ac'), [1, -1]);
});
t('diff uses the caret to place edits inside repeated characters', () => {
  assert.deepEqual(diff('aa', 'aaa', 2), [1, 'a']);      // typed at index 1
  assert.deepEqual(diff('aa', 'aaa', 3), [2, 'a']);      // typed at the end
  assert.deepEqual(diff('aa', 'aaa', 1), ['a']);         // typed at the start
  assert.deepEqual(diff('aaa', 'aa', 2), [2, -1]);       // backspace at the end
  assert.deepEqual(diff('aaa', 'aa', 0), [-1]);          // delete at start
  assert.deepEqual(diff('\n\n', '\n\n\n', 1), ['\n']);
});
t('diff never splits a surrogate pair', () => {
  const a = 'x😀y', b = 'x😃y';  // same high surrogate
  const op = diff(a, b);
  assert.equal(apply(a, op), b);
  assert.deepEqual(op, [1, '😃', -2]);
});
t('transform: concurrent inserts at the same spot, a first', () => {
  const [a1, b1] = transform([1, 'A'], [1, 'B']);
  assert.equal(apply(apply('xy', [1, 'A']), b1), 'xABy');
  assert.equal(apply(apply('xy', [1, 'B']), a1), 'xABy');
});
t('transform: overlapping deletes', () => {
  const s = 'abcdefgh', a = [1, -4], b = [3, -4];   // a deletes bcde, b deletes defg
  const [a1, b1] = transform(a, b);
  assert.equal(apply(apply(s, a), b1), 'ah');
  assert.equal(apply(apply(s, b), a1), 'ah');
});
t('transform: insert inside a range the other side deleted', () => {
  const s = 'abcdef', a = [3, 'X'], b = [1, -4];
  const [a1, b1] = transform(a, b);
  assert.equal(apply(apply(s, a), b1), apply(apply(s, b), a1));
  assert.equal(apply(apply(s, b), a1), 'aXf');
});
t('transform: delete everything vs type at end', () => {
  const s = 'abc', a = [-3], b = [3, '!'];
  const [a1, b1] = transform(a, b);
  assert.equal(apply(apply(s, a), b1), '!');
  assert.equal(apply(apply(s, b), a1), '!');
});
t('compose matches sequential apply', () => {
  const s = 'hello world', a = [5, ',', -6], b = [6, ' there'];
  assert.equal(apply(s, compose(a, b)), apply(apply(s, a), b));
  const c = ['>> ', 2, -1], d = [-2, 'X'];
  assert.equal(apply('abcdef', compose(c, d)), apply(apply('abcdef', c), d));
});
t('transformIndex: before, after, inside a delete, sticky inserts', () => {
  assert.equal(transformIndex(3, [1, 'XX'], false), 5);
  assert.equal(transformIndex(1, [3, 'XX'], false), 1);
  assert.equal(transformIndex(3, [3, 'XX'], false), 3);
  assert.equal(transformIndex(3, [3, 'XX'], true), 5);
  assert.equal(transformIndex(4, [2, -5], false), 2);
  assert.equal(transformIndex(9, [2, -5], false), 4);
});
t('client state machine buffers and transforms', () => {
  const c = new Client(0);
  assert.equal(c.state, 'synchronized');
  // local text "" -> "a" -> "ab"; meanwhile the server text "" became "Z"
  assert.deepEqual(c.local(['a']), ['a']);
  assert.equal(c.state, 'awaitingConfirm');
  assert.equal(c.local([1, 'b']), null);
  assert.equal(c.state, 'awaitingWithBuffer');
  const op = c.remote(['Z']);                         // someone typed at the start
  assert.deepEqual(op, [2, 'Z']);                     // our inserts win the tie, so Z lands after "ab"
  assert.equal(apply('ab', op), 'abZ');
  assert.equal(c.rev, 1);
  assert.deepEqual(c.ack(), [1, 'b']);                 // server text is now "aZ"; b goes after a
  assert.equal(c.ack(), null); assert.equal(c.state, 'synchronized'); assert.equal(c.rev, 3);
});
t('server rejects unknown revisions and oversize ops', () => {
  const s = new Server('abc');
  assert.throws(() => s.receive(1, ['x']));
  assert.throws(() => s.receive(0, [5, 'x']));
  s.receive(0, [3, '!']); assert.equal(s.text, 'abc!');
  s.receive(0, ['>']); assert.equal(s.text, '>abc!');
});

// ---------- randomized convergence ----------
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = n => Math.floor(rnd() * n);
const ALPHA = 'abcde \n😀';
const randStr = () => { let s = ''; const n = 1 + ri(4); for (let i = 0; i < n; i++) { const ch = [...ALPHA][ri([...ALPHA].length)]; s += ch; } return s; };
function randomEdit(text) {
  // pick positions on code point boundaries so we behave like a real textarea
  const cps = [...text], bound = []; let i = 0; for (const ch of cps) { bound.push(i); i += ch.length; } bound.push(i);
  const r = rnd();
  if (r < 0.55 || !text.length) { const at = bound[ri(bound.length)], ins = randStr(); return { next: text.slice(0, at) + ins + text.slice(at), cursor: at + ins.length }; }
  const a = ri(bound.length - 1), b = Math.min(bound.length - 1, a + 1 + ri(4));
  if (r < 0.85) return { next: text.slice(0, bound[a]) + text.slice(bound[b]), cursor: bound[a] };
  const ins = randStr(); return { next: text.slice(0, bound[a]) + ins + text.slice(bound[b]), cursor: bound[a] + ins.length };
}

function simulate(iter, nClients) {
  const server = new Server('the quick brown fox', 50);  // small history to exercise trimming
  const clients = Array.from({ length: nClients }, (_, k) => ({ k, text: server.text, ot: new Client(0), up: [], down: [], cursor: ri(server.text.length + 1) }));
  const send = (c, op) => c.up.push({ rev: c.ot.rev, op });
  const steps = 30 + ri(60);
  for (let s = 0; s < steps; s++) {
    const c = clients[ri(nClients)], r = rnd();
    if (r < 0.4) {                                   // local edit
      const { next, cursor } = randomEdit(c.text);
      const op = diff(c.text, next, cursor);
      assert.equal(apply(c.text, op), next);
      c.cursor = transformIndex(c.cursor, op, true);
      c.text = next; const out = c.ot.local(op); if (out) send(c, out);
    } else if (r < 0.7 && c.up.length) {             // server receives one message from c
      const m = c.up.shift(), applied = server.receive(m.rev, m.op, { k: c.k });
      for (const o of clients) (o === c ? o.down.push({ ack: true }) : o.down.push({ op: applied }));
    } else if (c.down.length) {                      // c receives one message
      const m = c.down.shift();
      if (m.ack) { const next = c.ot.ack(); if (next) send(c, next); }
      else { const op = c.ot.remote(m.op); c.text = apply(c.text, op); c.cursor = transformIndex(c.cursor, op, false); }
    }
    assert.ok(c.cursor >= 0 && c.cursor <= c.text.length, `cursor ${c.cursor} out of 0..${c.text.length}`);
  }
  // drain everything
  for (let guard = 0; clients.some(c => c.up.length || c.down.length); guard++) {
    assert.ok(guard < 100000, 'drain loop');
    for (const c of clients) {
      while (c.up.length) { const m = c.up.shift(), applied = server.receive(m.rev, m.op, { k: c.k }); for (const o of clients) (o === c ? o.down.push({ ack: true }) : o.down.push({ op: applied })); }
      while (c.down.length) { const m = c.down.shift(); if (m.ack) { const next = c.ot.ack(); if (next) send(c, next); } else c.text = apply(c.text, c.ot.remote(m.op)); }
    }
  }
  for (const c of clients) {
    assert.equal(c.text, server.text, `iteration ${iter}: client ${c.k} diverged`);
    assert.equal(c.ot.state, 'synchronized'); assert.equal(c.ot.rev, server.rev);
  }
}

const N = Number(process.argv[2]) || 1000;
t(`randomized convergence, 2 clients x ${N}`, () => { for (let i = 0; i < N; i++) simulate(i, 2); });
t(`randomized convergence, 3 clients x ${Math.ceil(N / 2)}`, () => { for (let i = 0; i < N / 2; i++) simulate(i, 3); });
t('randomized transform/compose properties x 3000', () => {
  for (let i = 0; i < 3000; i++) {
    let base = 'lorem ipsum 😀 dolor'; for (let k = ri(3); k > 0; k--) base = randomEdit(base).next;
    const ea = randomEdit(base), eb = randomEdit(base);
    const a = diff(base, ea.next, ea.cursor), b = diff(base, eb.next, eb.cursor);
    const [a1, b1] = transform(a, b);
    assert.equal(apply(apply(base, a), b1), apply(apply(base, b), a1));
    const ec = randomEdit(ea.next), c = diff(ea.next, ec.next, ec.cursor);
    assert.equal(apply(base, compose(a, c)), ec.next);
  }
});

console.log(`ot_test: ${passed} checks passed`);
