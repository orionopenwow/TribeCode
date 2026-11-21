// Server words about credits (feat/website-one): while payments are off, a person never reads about credits, plans or a
// trial; they read that their own AI is free to connect. With payments on, the old words come back unchanged.
//   node app/test/credit_words_test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const makePremium = require('../../server/premium');

const mem = {};
const store = { readJSON: (f, d) => (f in mem ? JSON.parse(mem[f]) : d), writeJSON: (f, v) => { mem[f] = JSON.stringify(v); } };
let on = false;
const stripe = { enabled: () => on, on: () => on, ITEMS: {}, price: () => null };
const P = makePremium({ store, isLocal: () => true, stripe });
const me = { id: 'm1', name: 'Ana', role: 'host' };

function refused(need) {
  let out = null;
  P.refuse((res, status, body) => { out = { status, body }; }, null, need, 'x', me);
  return out;
}
const BAD = /credit|\bplans?\b|trial|premium|upgrade/i;

// payments off
on = false;
for (const need of ['credits', 'plan']) {
  const r = refused(need);
  assert.strictEqual(r.status, 402);
  assert.ok(!BAD.test(r.body.error), `off, ${need}: ${r.body.error}`);
  assert.ok(/your own AI is free to connect/i.test(r.body.error), `off, ${need}: says the own AI is free: ${r.body.error}`);
}
assert.ok(!BAD.test(P.needText('credits')));

// payments on: the current words
on = true;
assert.strictEqual(refused('credits').body.error, 'You are out of AI credits. Connect your own AI for free, or get credits.');
assert.strictEqual(refused('plan').body.error, 'This one comes with Premium. Everything else stays free.');

// llm.js asks premium for its words, so it follows the same switch
const llm = fs.readFileSync(path.join(__dirname, '../../server/llm.js'), 'utf8');
assert.ok(/credits\.needText\('credits'\)/.test(llm), 'llm.js uses premium.needText');
assert.ok(!/or get credits/.test(llm), 'llm.js has no fixed "or get credits" text');

// any other server text a person can read: no fixed "get credits" outside premium.js
for (const f of fs.readdirSync(path.join(__dirname, '../../server'))) {
  if (!f.endsWith('.js') || f === 'premium.js') continue;
  const s = fs.readFileSync(path.join(__dirname, '../../server', f), 'utf8');
  assert.ok(!/or get credits/i.test(s), `${f} says "or get credits"`);
}
console.log('credit_words_test: ok');
