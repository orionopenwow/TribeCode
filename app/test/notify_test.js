// Unit tests for the pocket agent: Web Push crypto (RFC 8291 vector), VAPID JWT, the delivery decision
// table (prefs, away, quiet hours, digest, rate limit), signed action links and approvals.
// Usage: node app/test/notify_test.js
'use strict';
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const wp = require('../../server/webpush');
const makeNotify = require('../../server/notify');
const makeApprovals = require('../../server/approvals');
const { Store, id } = require('../../server/store');
const { decide, inQuiet, digestDue, defaultPrefs, mentionsIn, cleanPrefs } = makeNotify;

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const title = h => { const m = /^=\?UTF-8\?B\?(.*)\?=$/.exec(h.Title); return m ? Buffer.from(m[1], 'base64').toString() : h.Title; };

// ---------- Web Push ----------
const V = {   // RFC 8291 section 5 / appendix A
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw', auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg', prk: '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc', cek: 'oIhVW04MRdy2XN9CiKLxTg', nonce: '4h_95klXJ5E_qnoN',
  header: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};
test('RFC 8291 test vector: exact encrypted message', () => {
  const out = wp.encrypt(wp.unb64u(V.plaintext), { p256dh: V.uaPublic, auth: V.auth }, { salt: V.salt, asPrivate: V.asPrivate });
  assert.equal(out.subarray(0, 86).toString('base64url'), V.header);
  assert.equal(out.subarray(86).toString('base64url'), V.ciphertext);
});
test('RFC 8291 intermediate keys (IKM, PRK, CEK, NONCE)', () => {
  const as = crypto.createECDH('prime256v1'); as.setPrivateKey(wp.unb64u(V.asPrivate));
  const k = wp.deriveKeys({ authSecret: wp.unb64u(V.auth), ecdhSecret: as.computeSecret(wp.unb64u(V.uaPublic)), uaPublic: wp.unb64u(V.uaPublic), asPublic: as.getPublicKey(), salt: wp.unb64u(V.salt) });
  assert.equal(wp.b64u(k.ikm), V.ikm); assert.equal(wp.b64u(k.prk), V.prk); assert.equal(wp.b64u(k.cek), V.cek); assert.equal(wp.b64u(k.nonce), V.nonce);
});
test('RFC 8291 vector decrypts with the user agent key', () => {
  const msg = Buffer.concat([wp.unb64u(V.header), wp.unb64u(V.ciphertext)]);
  assert.equal(wp.decrypt(msg, { uaPrivate: V.uaPrivate, auth: V.auth }).toString(), 'When I grow up, I want to be a watermelon');
});
test('round trip with fresh keys, unicode payload, tamper detection', () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = wp.b64u(crypto.randomBytes(16));
  const payload = JSON.stringify({ title: 'Maya asks: drop the 🔥 table?', body: 'x'.repeat(2000) });
  const msg = wp.encrypt(payload, { p256dh: wp.b64u(ua.getPublicKey()), auth });
  assert.equal(wp.decrypt(msg, { uaPrivate: wp.b64u(ua.getPrivateKey()), auth }).toString(), payload);
  const bad = Buffer.from(msg); bad[bad.length - 20] ^= 1;
  assert.throws(() => wp.decrypt(bad, { uaPrivate: wp.b64u(ua.getPrivateKey()), auth }));
});
test('VAPID JWT is ES256 and verifies with the public key', () => {
  const k = wp.generateVapid();
  assert.equal(wp.unb64u(k.publicKey).length, 65);
  const jwt = wp.vapidJwt({ aud: 'https://fcm.googleapis.com', sub: 'mailto:a@b.c' }, k);
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(wp.unb64u(h)), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(wp.unb64u(p));
  assert.equal(claims.aud, 'https://fcm.googleapis.com'); assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 86400);
  assert.equal(wp.unb64u(s).length, 64);
  assert.ok(wp.verifyJwt(jwt, k.publicKey));
  assert.ok(!wp.verifyJwt(jwt, wp.generateVapid().publicKey), 'another key must not verify');
  assert.ok(!wp.verifyJwt(jwt.replace(/\.[^.]+\./, '.' + wp.b64u(JSON.stringify({ ...claims, aud: 'https://evil' })) + '.'), k.publicKey), 'tampered claims must not verify');
});
test('send() posts aes128gcm with a vapid Authorization header', async () => {
  const k = wp.generateVapid(), ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = wp.b64u(crypto.randomBytes(16));
  let seen;
  const r = await wp.send({ endpoint: 'https://push.example.com/abc', keys: { p256dh: wp.b64u(ua.getPublicKey()), auth } }, '{"t":1}', k, { fetchImpl: async (url, o) => { seen = { url, ...o }; return { status: 201 }; } });
  assert.equal(r.status, 201); assert.equal(seen.headers['Content-Encoding'], 'aes128gcm');
  const [, t, kk] = seen.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(kk, k.publicKey); assert.ok(wp.verifyJwt(t, k.publicKey));
  assert.equal(JSON.parse(wp.unb64u(t.split('.')[1])).aud, 'https://push.example.com');
  assert.equal(wp.decrypt(seen.body, { uaPrivate: wp.b64u(ua.getPrivateKey()), auth }).toString(), '{"t":1}');
});

// ---------- decision table ----------
const T0 = Date.parse('2026-11-06T15:00:00Z');   // 15:00 UTC = 16:00 Berlin = 10:00 New York
const P = (patch = {}) => cleanPrefs(defaultPrefs(), patch);
const N = (type, priority = 'normal', ref) => ({ type, priority, ref });
test('decision table', () => {
  const rows = [
    // prefs, event, away, lastPush, expected reason, pocket, digest
    [P(), N('mention', 'high'), true, {}, 'push', true, false],
    [P(), N('mention', 'high'), false, {}, 'online', false, false],
    [P({ when: { mode: 'always' } }), N('mention', 'high'), false, {}, 'push', true, false],
    [P(), N('release', 'low'), true, {}, 'digest', false, true],                       // off by default -> digest
    [P(), N('huddle', 'low'), false, {}, 'digest', false, true],
    [P({ types: { huddle: true } }), N('huddle', 'low'), true, {}, 'push', true, false],
    [P({ types: { mention: false } }), N('mention', 'high'), true, {}, 'digest', false, true],
    [P({ types: { mention: false }, digest: { on: false } }), N('mention', 'high'), true, {}, 'off', false, false],
    [P(), N('some-new-type', 'low'), true, {}, 'digest', false, true],                // unknown low -> digest
    [P(), N('some-new-type', 'normal'), true, {}, 'push', true, false],
    [P({ when: { quiet: { on: true, from: '14:00', to: '16:00' } } }), N('mention', 'high'), true, {}, 'quiet', false, true],
    [P({ when: { quiet: { on: false, from: '14:00', to: '16:00' } } }), N('mention', 'high'), true, {}, 'push', true, false],
    [P({ tz: 'Europe/Berlin', when: { quiet: { on: true, from: '14:00', to: '16:00' } } }), N('mention'), true, {}, 'push', true, false],   // 16:00 there
    [P({ tz: 'America/New_York', when: { quiet: { on: true, from: '22:00', to: '11:00' } } }), N('mention'), true, {}, 'quiet', false, true], // wraps midnight
    [P(), N('mention', 'high', 'general'), true, { mention: { at: T0 - 60_000, ref: 'general' } }, 'duplicate', false, false],
    [P(), N('mention', 'high', 'x'), true, { mention: { at: T0 - 60_000, ref: 'general' } }, 'rate', false, false],
    [P(), N('mention', 'high'), true, { mention: { at: T0 - 121_000 } }, 'push', true, false],
    [P(), N('task-assigned'), true, { mention: { at: T0 - 1000 } }, 'push', true, false],   // limit is per type
    [P(), N('approval', 'high', 'a2'), true, { approval: { at: T0 - 1000, ref: 'a1' } }, 'push', true, false],   // every approval needs its buttons
  ];
  rows.forEach(([prefs, n, away, lastPush, reason, pocket, digest], i) => {
    const d = decide({ prefs, n, away, now: T0, lastPush });
    assert.equal(d.reason, reason, `row ${i}: ${JSON.stringify(n)} -> ${JSON.stringify(d)}`);
    assert.equal(d.pocket, pocket, `row ${i} pocket`); assert.equal(!!d.digest, digest, `row ${i} digest`);
  });
});
test('quiet hours edges', () => {
  const p = P({ when: { quiet: { on: true, from: '22:00', to: '07:00' } } });
  assert.ok(inQuiet(Date.parse('2026-11-06T22:00:00Z'), p)); assert.ok(inQuiet(Date.parse('2026-11-06T06:59:00Z'), p));
  assert.ok(!inQuiet(Date.parse('2026-11-06T07:00:00Z'), p)); assert.ok(!inQuiet(Date.parse('2026-11-06T21:59:00Z'), p));
});
test('digest due: every N hours, daily at a time, after quiet hours, never during quiet hours', () => {
  const q = [{ at: new Date(T0 - 5 * 3600_000).toISOString(), title: 'x' }];
  assert.ok(digestDue({ prefs: P(), queue: q, now: T0 }));
  assert.ok(!digestDue({ prefs: P(), queue: q, lastDigest: T0 - 3600_000, now: T0 }));
  assert.ok(!digestDue({ prefs: P(), queue: [], now: T0 }));
  assert.ok(!digestDue({ prefs: P({ digest: { at: '16:00' } }), queue: q, now: T0 }));
  assert.ok(digestDue({ prefs: P({ digest: { at: '15:00' } }), queue: q, now: T0 }));
  assert.ok(!digestDue({ prefs: P({ digest: { at: '15:00' } }), queue: q, lastDigestDay: '2026-11-06', now: T0 }));
  const held = [{ at: new Date(T0 - 60_000).toISOString(), title: 'y', held: true }];
  assert.ok(digestDue({ prefs: P(), queue: held, lastDigest: T0 - 60_000, now: T0 }), 'held items go out once quiet hours end');
  assert.ok(!digestDue({ prefs: P({ when: { quiet: { on: true, from: '14:00', to: '16:00' } } }), queue: held, now: T0 }));
});
test('mentions: @first name, @fullname, @id, @everyone; never self or agents', () => {
  const ms = [{ id: 'orion-1', name: 'Orion' }, { id: 'maya-2', name: 'Maya Lee' }, { id: 'agent-x', name: 'Claude', role: 'agent' }];
  assert.deepEqual(mentionsIn('hey @maya, look', ms, 'orion-1'), ['maya-2']);
  assert.deepEqual(mentionsIn('@MayaLee ping', ms, 'orion-1'), ['maya-2']);
  assert.deepEqual(mentionsIn('@orion-1 hi', ms, 'maya-2'), ['orion-1']);
  assert.deepEqual(mentionsIn('@everyone standup', ms, 'orion-1'), ['maya-2']);
  assert.deepEqual(mentionsIn('@claude do it', ms, 'orion-1'), []);
  assert.deepEqual(mentionsIn('email me at a@b.c', ms, 'orion-1'), []);
});
test('prefs are validated', () => {
  const p = cleanPrefs(defaultPrefs(), { ntfy: { server: 'javascript:alert(1)', topic: 'a b' }, when: { mode: 'never', quiet: { from: '25:00' } }, tz: 'Mars/Base', digest: { everyHours: 999 } });
  assert.equal(p.ntfy.server, 'https://ntfy.sh'); assert.match(p.ntfy.topic, /^tribe-/); assert.equal(p.when.mode, 'away');
  assert.equal(p.when.quiet.from, '22:00'); assert.equal(p.tz, 'UTC'); assert.equal(p.digest.everyHours, 24);
});

// ---------- hub + approvals, end to end in-process ----------
function rig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-'));
  const store = new Store(dir), bus = new EventEmitter();
  bus.notify = n => bus.emit('notify', { to: 'all', priority: 'normal', at: new Date(clock.t).toISOString(), ...n });
  const clock = { t: T0 };
  const members = [{ id: 'host', name: 'Orion', role: 'host' }, { id: 'maya', name: 'Maya', role: 'builder' }, { id: 'agent-maya', name: 'Claude · Maya', role: 'agent', owner: 'maya' }];
  const posts = [], chat = [];
  const fetchImpl = async (url, o) => { posts.push({ url, ...o }); return { status: 200 }; };
  const hub = makeNotify({ store, bus, getMembers: () => members, sendTo: () => {}, publicUrl: () => 'http://tribe.local', postChat: (c, b, t) => chat.push(t), now: () => clock.t, fetchImpl, tick: false });
  const ap = makeApprovals({ store, id, str: (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : ''), bus, getMembers: () => members, postChat: (c, b, t) => chat.push(t), broadcast: () => {}, hub, now: () => clock.t, tick: false, remindHours: 4 });
  const prefs = hub.prefsOf('maya'); prefs.ntfy.server = 'http://ntfy.local'; prefs.ntfy.topic = 'maya-secret';
  const hostPrefs = hub.prefsOf('host'); hostPrefs.ntfy.server = 'http://ntfy.local'; hostPrefs.ntfy.topic = 'host-secret';
  return { store, bus, hub, ap, clock, members, posts, chat, m: id => members.find(x => x.id === id) };
}
test('hub: away member gets one ntfy push with headers; inbox keeps it; rate limit collapses the second', async () => {
  const r = rig();
  r.bus.notify({ type: 'mention', priority: 'high', to: ['maya'], from: 'host', title: 'Orion mentioned you', body: 'hi', view: 'chat', ref: 'general' });
  await r.hub.settle();
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].url, 'http://ntfy.local/maya-secret');
  assert.equal(r.posts[0].headers.Title, 'Orion mentioned you'); assert.equal(r.posts[0].headers.Priority, '4');
  assert.match(r.posts[0].headers.Click, /^http:\/\/tribe\.local\/\?open=chat/);
  r.bus.notify({ type: 'mention', priority: 'high', to: ['maya'], from: 'host', title: 'again', ref: 'general' });
  await r.hub.settle();
  assert.equal(r.posts.length, 1, 'collapsed by the 2 minute limit');
  r.clock.t += 3 * 60_000;
  r.bus.notify({ type: 'mention', priority: 'high', to: ['maya'], from: 'host', title: 'third', body: 'b', ref: 'general' });
  await r.hub.settle();
  assert.equal(r.posts.length, 2); assert.match(String(r.posts[1].body), /\+1 more/);
  assert.equal(r.hub.inbox('maya').length, 3); assert.equal(r.hub.unread('maya'), 3);
  assert.equal(r.hub.inbox('host').length, 0, 'sender is not notified');
});
test('hub: non-ASCII titles are RFC 2047 encoded for ntfy', async () => {
  const r = rig();
  r.bus.notify({ type: 'mention', priority: 'high', to: ['maya'], title: 'Zoë 🔥 mentioned you' });
  await r.hub.settle();
  const t = r.posts[0].headers.Title; assert.match(t, /^=\?UTF-8\?B\?/);
  assert.equal(Buffer.from(t.slice(10, -2), 'base64').toString(), 'Zoë 🔥 mentioned you');
});
test('approvals: owner gets Approve/Deny ntfy actions; signed link works once; comment shows in chat', async () => {
  const r = rig();
  const a = r.ap.create({ title: 'Run migration 42', details: 'adds a column', risk: 'medium' }, r.m('agent-maya'));
  await r.hub.settle();
  assert.deepEqual(a.to, ['maya']);
  const acts = r.posts[0].headers.Actions; assert.match(acts, /^http, Approve, http:\/\/tribe\.local\/api\/approvals\//);
  const url = new URL(acts.split(', ')[2]);
  const parts = url.pathname.split('/');
  assert.equal(r.hub.verifyAction(parts[3], 'deny', url.searchParams), null, 'token is bound to the decision');
  assert.equal(r.hub.verifyAction(parts[3], parts[4], url.searchParams).id, 'maya');
  assert.equal(r.hub.verifyAction(parts[3], parts[4], url.searchParams), null, 'one time only');
  const done = r.ap.decide(a.id, 'approve', r.m('maya'), 'go ahead, back up first');
  assert.equal(done.status, 'approved'); assert.equal(done.note, 'go ahead, back up first');
  assert.match(r.chat.at(-1), /Maya approved \*\*Run migration 42\*\*.*go ahead, back up first/);
  assert.throws(() => r.ap.decide(a.id, 'deny', r.m('maya')), /already approved/);
});
test('approvals: high risk asks every human; questions reach check_approval', async () => {
  const r = rig();
  const a = r.ap.create({ title: 'Force push main', risk: 'high' }, r.m('agent-maya'));
  assert.deepEqual(a.to.sort(), ['host', 'maya']);
  const q = r.ap.question(a.id, r.m('host'), 'Why not a PR?');
  assert.equal(q.questions[0].text, 'Why not a PR?'); assert.equal(r.ap.get(a.id).questions.length, 1);
  assert.throws(() => r.ap.decide(a.id, 'approve', r.m('agent-maya')), /agents never decide/);
});
test('approvals: bulk approves only low risk addressed to you', () => {
  const r = rig();
  const lo1 = r.ap.create({ title: 'Install lodash', risk: 'low' }, r.m('agent-maya'));
  const lo2 = r.ap.create({ title: 'Run tests', risk: 'low' }, r.m('agent-maya'));
  const med = r.ap.create({ title: 'Edit CI', risk: 'medium' }, r.m('agent-maya'));
  const hi = r.ap.create({ title: 'Delete prod', risk: 'high' }, r.m('agent-maya'));
  const out = r.ap.bulk(r.m('maya'));
  assert.deepEqual(out.map(a => a.id).sort(), [lo1.id, lo2.id].sort());
  assert.equal(r.ap.get(med.id).status, 'pending'); assert.equal(r.ap.get(hi.id).status, 'pending');
  assert.equal(r.ap.bulk(r.m('host')).length, 0, 'host was not asked about low-risk ones');
});
test('approvals: "always allow" rule for a low-risk kind, never for medium, revocable', () => {
  const r = rig();
  const a = r.ap.create({ title: 'Install lodash', risk: 'low', kind: 'install-dependency' }, r.m('agent-maya'));
  assert.ok(r.ap.decide(a.id, 'approve', r.m('maya'), '', { always: true }).ruleAdded);
  assert.equal(r.ap.create({ title: 'Install zod', risk: 'low', kind: 'install-dependency' }, r.m('agent-maya')).status, 'approved');
  assert.equal(r.ap.create({ title: 'Install zod', risk: 'medium', kind: 'install-dependency' }, r.m('agent-maya')).status, 'pending');
  assert.equal(r.ap.create({ title: 'Run tests', risk: 'low', kind: 'tests' }, r.m('agent-maya')).status, 'pending');
  r.ap.rules().length = 0;
  assert.equal(r.ap.create({ title: 'Install x', risk: 'low', kind: 'install-dependency' }, r.m('agent-maya')).status, 'pending');
});
test('approvals: re-notify once after N hours, then escalate to the host', async () => {
  const r = rig();
  const a = r.ap.create({ title: 'Rotate keys', risk: 'medium' }, r.m('agent-maya'));
  await r.hub.settle(); const n0 = r.posts.length;
  r.clock.t += 3 * 3600_000; r.ap.sweep(); await r.hub.settle(); assert.equal(r.posts.length, n0, 'not yet');
  r.clock.t += 1.5 * 3600_000; r.ap.sweep(); await r.hub.settle();
  assert.equal(r.posts.length, n0 + 1); assert.match(title(r.posts.at(-1).headers), /^Still waiting/);
  r.ap.sweep(); await r.hub.settle(); assert.equal(r.posts.length, n0 + 1, 'only once');
  r.clock.t += 4 * 3600_000; r.ap.sweep(); await r.hub.settle();
  assert.equal(r.posts.at(-1).url, 'http://ntfy.local/host-secret'); assert.match(title(r.posts.at(-1).headers), /^Escalated/);
  assert.ok(r.ap.get(a.id).to.includes('host'));
});
test('digest: low-priority items queue, then go out as one summary', async () => {
  const r = rig();
  for (let i = 0; i < 3; i++) r.bus.notify({ type: 'release', priority: 'low', title: `Released v0.${i}.0` });
  await r.hub.settle();
  assert.equal(r.posts.length, 0);
  r.clock.t += 5 * 3600_000; await r.hub.flushDigests();
  const toMaya = r.posts.filter(p => p.url.endsWith('maya-secret'));
  assert.equal(toMaya.length, 1); assert.equal(toMaya[0].headers.Title, '3 updates from your tribe'); assert.match(String(toMaya[0].body), /v0\.2\.0/);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { console.log('  FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} notify tests passed`);
})();
