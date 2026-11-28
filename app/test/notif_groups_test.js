// Unit tests for notification settings per project / channel (p14, server/notify.js groupVerdict, cleanPrefs, the hub).
// The rules follow Discord; docs/NOTIFICATIONS.md writes them down.
// Usage: node app/test/notif_groups_test.js
'use strict';
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const makeNotify = require('../../server/notify');
const { Store } = require('../../server/store');
const { groupVerdict, cleanPrefs, defaultPrefs, mergePrefs, mentionDetail, defaultLevel } = makeNotify;

let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);
const T0 = Date.parse('2026-11-27T12:00:00Z');
const P = body => cleanPrefs(defaultPrefs(), body, T0);
const v = (prefs, n, o = {}) => groupVerdict(prefs, n, { project: 'pq', size: 3, now: T0, ...o });
const msg = { type: 'message', ref: 'p-pq' }, men = { type: 'mention', ref: 'p-pq' };

test('defaults: up to 5 people hear every message, a bigger project only @mentions', () => {
  assert.equal(defaultLevel(5), 'all'); assert.equal(defaultLevel(6), 'mentions');
  assert.equal(v(defaultPrefs(), msg).notify, true);
  assert.equal(v(defaultPrefs(), msg, { size: 9 }).notify, false);
  assert.equal(v(defaultPrefs(), men, { size: 9 }).notify, true);
});
test('levels: All messages, Only @mentions, Nothing (Nothing means nothing, mentions included)', () => {
  const m = P({ groups: { projects: { pq: { level: 'mentions' } } } });
  assert.deepEqual([v(m, msg).notify, v(m, men).notify, v(m, men).badge], [false, true, true]);
  const n = P({ groups: { projects: { pq: { level: 'none' } } } });
  assert.deepEqual([v(n, msg).notify, v(n, men).notify, v(n, men).badge, v(n, msg).dot], [false, false, false, true]);
  assert.equal(v(n, { type: 'approval', ref: 'p-pq' }).notify, true, 'approvals need you and always come through');
  assert.equal(v(n, { type: 'reminder', ref: 'p-pq' }).notify, false, 'a meeting reminder is a personal ping: Nothing silences it too');
  assert.equal(v(m, { type: 'reminder', ref: 'p-pq' }).notify, true, 'and Only @mentions lets it through');
});
test('mute: hides the unread dot and plain messages; @mentions still come through; it runs out', () => {
  const p = P({ groups: { projects: { pq: { mute: '1h' } } } });
  assert.equal(p.groups.projects.pq.until, T0 + 3600_000);
  assert.deepEqual([v(p, msg).notify, v(p, msg).dot, v(p, men).notify], [false, false, true]);
  assert.equal(v(p, msg, { now: T0 + 3600_001 }).notify, true, 'an hour later it is over');
  const f = P({ groups: { projects: { pq: { mute: 'forever' } } } });
  assert.equal(f.groups.projects.pq.until, -1); assert.equal(v(f, msg, { now: T0 + 1e12 }).notify, false);
  assert.equal(cleanPrefs(f, { groups: { projects: { pq: { mute: null } } } }, T0).groups.projects.pq, undefined, 'unmute leaves nothing behind');
});
test('suppress @everyone / role mentions turns them into plain messages', () => {
  const p = P({ groups: { projects: { pq: { level: 'mentions', noEveryone: true, noRoles: true } } } });
  assert.equal(v(p, { ...men, everyone: true }).notify, false);
  assert.equal(v(p, { ...men, role: true }).notify, false);
  assert.equal(v(p, men).notify, true, 'a mention by name still counts');
});
test('channels override the project; DMs only listen to their own mute', () => {
  const p = P({ groups: { projects: { pq: { level: 'all' } }, channels: { 'p-pq': { mute: '8h' }, 'c-12345678': { level: 'none' } } } });
  assert.equal(v(p, msg).notify, false, 'the channel is muted');
  assert.equal(v(p, { type: 'message', ref: 'c-12345678' }).notify, false);
  assert.equal(v(p, { type: 'message', ref: 'c-abcdef01' }).notify, true, 'other channels use the project');
  const q = P({ groups: { projects: { pq: { level: 'none', mute: 'forever' } } } });
  assert.equal(groupVerdict(q, { type: 'dm', ref: 'dm-a-b' }, { now: T0 }).notify, true, 'DMs always notify');
  const r = cleanPrefs(q, { groups: { channels: { 'dm-a-b': { mute: '15m' } } } }, T0);
  assert.equal(groupVerdict(r, { type: 'dm', ref: 'dm-a-b' }, { now: T0 }).notify, false, 'unless that DM is muted');
});
test('mobile push off: still in the app, not on the phone; mute new channels', () => {
  const p = P({ groups: { projects: { pq: { push: false, muteNew: true } } } });
  assert.deepEqual([v(p, msg).notify, v(p, msg).push], [true, false]);
  const at = p.groups.projects.pq.muteNewAt;
  assert.equal(v(p, { type: 'message', ref: 'c-11111111' }, { chanCreated: new Date(Date.parse(at) + 1000).toISOString() }).notify, false, 'a channel made after the switch starts muted');
  assert.equal(v(p, { type: 'message', ref: 'c-22222222' }, { chanCreated: '2020-01-01T00:00:00Z' }).notify, true, 'older channels do not');
});
test('old per channel / project levels carry over; bad input is dropped', () => {
  const p = mergePrefs(defaultPrefs(), { mutes: { projects: { pq: 'mentions' }, channels: {} } });
  assert.equal(p.groups.projects.pq.level, 'mentions');
  const q = P({ groups: { projects: { 'bad id!': { level: 'none' }, pq: { level: 'loud', mute: '2y', push: 'x' } } } });
  assert.deepEqual(q.groups.projects, {});
  assert.deepEqual(cleanPrefs(P({ groups: { projects: { pq: { level: 'none' } } } }), { types: { mention: true } }, T0).groups.projects.pq, { level: 'none' }, 'other changes keep the groups');
});
test('mentionDetail: by name, through @everyone, through a role', () => {
  const ms = [{ id: 'ana', name: 'Ana', role: 'host' }, { id: 'ben', name: 'Ben', role: 'builder' }, { id: 'mo', name: 'Mo', role: 'mod' }];
  const d = mentionDetail('@Ben and @mods, @everyone look', ms, 'ana');
  assert.deepEqual(Object.fromEntries(d), { ben: {}, mo: { role: true } });
  assert.deepEqual(Object.fromEntries(mentionDetail('@here hi', ms, 'ben')), { ana: { everyone: true }, mo: { everyone: true } });
});
test('hub: plain messages reach only "All messages" people, never the inbox; a project mute holds them back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-')), store = new Store(dir), bus = new EventEmitter(), sent = [];
  bus.notify = n => bus.emit('notify', { to: 'all', priority: 'normal', at: new Date().toISOString(), ...n });
  const members = [{ id: 'ana', name: 'Ana', role: 'host' }, { id: 'ben', name: 'Ben', role: 'builder' }, { id: 'cy', name: 'Cy', role: 'builder' }];
  const hub = makeNotify({ store, bus, getMembers: () => members, sendTo: (mid, m) => sent.push([mid, m]), publicUrl: () => 'http://t', tick: false, projectOf: ref => (ref === 'p-pq' ? 'pq' : null), projectSize: () => 3 });
  { const cp = hub.prefsOf('cy'); Object.assign(cp, cleanPrefs(cp, { groups: { projects: { pq: { level: 'mentions' } } } })); }
  hub.chat('p-pq', 'ana', 'hello all', 'general');
  await hub.settle();
  assert.deepEqual(sent.filter(([, m]) => m.type === 'notification').map(([mid, m]) => [mid, m.item.type, !!m.item.transient]), [['ben', 'message', true]]);
  assert.equal(hub.inbox('ben').length, 0, 'plain messages never land in the inbox');
  hub.chat('p-pq', 'ana', '@Cy look', 'general'); await hub.settle();
  assert.equal(hub.inbox('cy')[0].title, 'Ana mentioned you in #general');
  { const bp = hub.prefsOf('ben'); Object.assign(bp, cleanPrefs(bp, { groups: { projects: { pq: { mute: '1h' } } } })); }
  sent.length = 0; hub.chat('p-pq', 'ana', 'quiet please', 'general'); await hub.settle();
  assert.equal(sent.filter(([mid, m]) => mid === 'ben' && m.type === 'notification').length, 0);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { console.log('  FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} notification settings tests passed`);
})();
