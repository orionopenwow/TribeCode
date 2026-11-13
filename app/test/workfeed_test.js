// feat/work-v2: the signed gig feed (server/workfeed.js). Sign, verify, tamper, expiry, subscribe-only import, key file mode.
'use strict';
const assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Store } = require('../../server/store');
const makeWorkFeed = require('../../server/workfeed');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workfeed-'));
const base = new Store(dir);
let gigs = [{ id: 'otters-q1', title: 'Pixel artist for a cozy game', kind: 'task', description: 'Eight sprites', skills: ['Pixel Art'], pay: { type: 'time', text: '1 h for 1 h' }, contact: '@camp', posted: '2026-11-12', secret: 'never published' }];
const A = makeWorkFeed({ base, tribeName: () => 'Otters', publicGigs: () => gigs });
const f = A.feed();
assert.strictEqual(f.schema, 'tribecode.workfeed/1');
assert.strictEqual(f.gigs.length, 1); assert.ok(!('secret' in f.gigs[0]), 'only whitelisted fields'); assert.deepStrictEqual(f.gigs[0].skills, ['pixel art']);
const v = makeWorkFeed.verify(JSON.parse(JSON.stringify(f)));
assert.ok(v.ok, v.reason); assert.strictEqual(v.gigs[0].title, 'Pixel artist for a cozy game');
// tampering breaks it
const t = JSON.parse(JSON.stringify(f)); t.gigs[0].title = 'Send me your password'; assert.strictEqual(makeWorkFeed.verify(t).ok, false);
const t2 = JSON.parse(JSON.stringify(f)); t2.tribe.key = 'A'.repeat(43); assert.strictEqual(makeWorkFeed.verify(t2).ok, false);
assert.strictEqual(makeWorkFeed.verify(f, Date.now() + 8 * 86400000).ok, false, 'expired after a week');
assert.strictEqual(makeWorkFeed.verify({ schema: 'x' }).ok, false);
// the key persists and its file is private
const kf = path.join(dir, '.tribe/work/feed-key.json');
if (process.platform !== 'win32') assert.strictEqual(fs.statSync(kf).mode & 0o777, 0o600);
const A2 = makeWorkFeed({ base, tribeName: () => 'Otters', publicGigs: () => gigs }); assert.strictEqual(A2.keyPair().pub, A.keyPair().pub);
// import: only subscribed keys, newer seq wins
const bdir = fs.mkdtempSync(path.join(os.tmpdir(), 'workfeed-b-')), B = makeWorkFeed({ base: new Store(bdir), tribeName: () => 'Bears', publicGigs: () => [] });
const host = { id: 'm1', role: 'host' }, guest = { id: 'm2', role: 'builder' };
const call = async (fn, method, b, c, body, me) => { let out; await fn({}, {}, { m: method, b, c, me, readBody: async () => body, send: (_, s, d) => { out = [s, d]; }, fail: (_, s, e) => { out = [s, { error: e }]; } }); return out; };
(async () => {
  let r = await call(B.route, 'POST', 'import', null, { feed: f }, host); assert.strictEqual(r[0], 403, 'not subscribed');
  r = await call(B.route, 'POST', 'subscriptions', null, { name: 'Otters', key: f.tribe.key }, guest); assert.strictEqual(r[0], 403, 'builders cannot subscribe');
  r = await call(B.route, 'POST', 'subscriptions', null, { name: 'Otters', key: f.tribe.key, url: 'http://x' }, host); assert.strictEqual(r[0], 400, 'https only'); assert.ok(/https/.test(r[1].error));
  r = await call(B.route, 'POST', 'subscriptions', null, { name: 'Otters', key: f.tribe.key }, host); assert.strictEqual(r[0], 200, JSON.stringify(r)); assert.ok(!r[1].subscription.url);
  r = await call(B.route, 'POST', 'import', null, { feed: f }, host); assert.strictEqual(r[0], 200); assert.ok(r[1].stored);
  r = await call(B.route, 'POST', 'import', null, { feed: f }, host); assert.strictEqual(r[1].stored, false, 'same seq is not stored twice');
  r = await call(B.route, 'GET', 'imported', null, null, guest); assert.strictEqual(r[1].gigs[0].tribe, 'Otters');
  r = await call(A.route, 'GET', 'feed.json', null, null, guest); assert.ok(makeWorkFeed.verify(r[1]).ok);
  r = await call(A.route, 'GET', 'feed.json', null, null, null); assert.strictEqual(r[0], 401, 'members only unless the host publishes it openly');
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(bdir, { recursive: true, force: true });
  console.log('workfeed_test ok');
})().catch(e => { console.error(e); process.exit(1); });
