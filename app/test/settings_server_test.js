// Unit tests for the server side of Settings (feat/settings-tabs): per-channel/project mutes and email notifications
// (server/notify.js), who can DM me, my data export, settings sync whitelist and deletion after a grace period (server/mysettings.js).
// Usage: node app/test/settings_server_test.js
'use strict';
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const makeNotify = require('../../server/notify');
const mySettings = require('../../server/mysettings');
const { Store } = require('../../server/store');
const { mutedBy, cleanPrefs, defaultPrefs } = makeNotify;

let passed = 0; const tests = []; const test = (n, f) => tests.push([n, f]);

test('mutes: none silences a channel, mentions lets mentions/DMs/approvals through, approvals always pass', () => {
  const p = cleanPrefs(defaultPrefs(), { mutes: { channels: { general: 'none', random: 'mentions', 'bad name!': 'none' }, projects: { pq: 'mentions', x: 'loud' } } });
  assert.deepEqual(p.mutes.channels, { general: 'none', random: 'mentions' }, 'bad names and values are dropped');
  assert.deepEqual(p.mutes.projects, { pq: 'mentions' });
  assert.equal(mutedBy(p, { type: 'mention', ref: 'general' }), true);
  assert.equal(mutedBy(p, { type: 'approval', ref: 'general' }), false);
  assert.equal(mutedBy(p, { type: 'mention', ref: 'random' }), false);
  assert.equal(mutedBy(p, { type: 'release', ref: 'random' }), true);
  assert.equal(mutedBy(p, { type: 'task-assigned', project: 'pq' }), true);
  assert.equal(mutedBy(p, { type: 'dm', project: 'pq' }), false);
  assert.equal(mutedBy(cleanPrefs(p, { mutes: { channels: { general: 'all' } } }), { type: 'mention', ref: 'general' }), false, '"all" removes the mute');
});

function rig(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-'));
  const store = new Store(dir), bus = new EventEmitter();
  bus.notify = n => bus.emit('notify', { to: 'all', priority: 'normal', at: new Date().toISOString(), ...n });
  const members = [{ id: 'ana', name: 'Ana', role: 'host', tokenHash: 'h-ana' }, { id: 'ben', name: 'Ben', role: 'builder', tokenHash: 'h-ben' }, { id: 'cy', name: 'Cy', role: 'builder', tokenHash: 'h-cy' }, { id: 'mo', name: 'Mo', role: 'mod' }, { id: 'agent-ben', name: 'Claude', role: 'agent', owner: 'ben' }];
  return { dir, store, bus, members, ...extra };
}
test('hub: a muted channel never reaches the inbox; email goes out when the member turned it on', async () => {
  const r = rig(), mails = [];
  const hub = makeNotify({ store: r.store, bus: r.bus, getMembers: () => r.members, sendTo: () => {}, publicUrl: () => 'http://t', tick: false, mail: (mid, s, t) => { mails.push({ mid, s, t }); return true; }, canMail: () => true, projectOf: ref => (ref === 'pq-chat' ? 'pq' : null) });
  const bp = hub.prefsOf('ben'); Object.assign(bp, cleanPrefs(bp, { mutes: { channels: { general: 'none' }, projects: { pq: 'mentions' } }, channels: { email: true, webpush: false, desktop: false } }));
  r.bus.notify({ type: 'mention', priority: 'high', to: ['ben'], from: 'ana', title: 'in general', ref: 'general' });
  r.bus.notify({ type: 'release', to: ['ben'], from: 'ana', title: 'shipped', ref: 'pq-chat' });
  r.bus.notify({ type: 'mention', priority: 'high', to: ['ben'], from: 'ana', title: 'in pq', ref: 'pq-chat' });
  await hub.settle();
  const titles = hub.inbox('ben').map(i => i.title);
  assert.deepEqual(titles, ['in pq']);
  assert.equal(mails.length, 1); assert.match(mails[0].s, /in pq/); assert.match(mails[0].t, /Settings › Notifications/);
});

function ms(r, o = {}) {
  let removed = [];
  const api = mySettings({ store: r.store, getMembers: () => r.members, memberById: id => r.members.find(m => m.id === id), hash: s => 'h-' + s, id: () => 'tok' + Math.random().toString(36).slice(2, 8),
    saveMembers: () => {}, devices: { reload() {} }, sockets: () => [], removeMember: m => { removed.push(m.id); r.members = r.members.filter(x => x.id !== m.id); }, isBlocked: (to, from) => to === 'cy' && from === 'mo',
    publicMember: m => ({ id: m.id, name: m.name }), tick: false, ...o });
  return { api, removed: () => removed };
}
test('who can DM me: everyone, people I wrote to, staff only; own agents and staff always; blocked never', () => {
  const r = rig(), { api } = ms(r), m = id => r.members.find(x => x.id === id);
  const route = (me, b, method, body) => new Promise(res => api.route({}, { }, { b, m: method, me, readBody: async () => body, send: (_, s, d) => res([s, d]), fail: (_, s, e) => res([s, e]) }));
  return (async () => {
    assert.equal(api.canDm(m('cy'), m('ben')), true);
    assert.deepEqual((await route(m('ben'), 'privacy', 'PUT', { dm: 'known' }))[0], 200);
    assert.equal(api.canDm(m('cy'), m('ben')), false, 'Cy has not been written to');
    r.store.appendJSONL('chat/dm-ben-cy.jsonl', { id: '1', by: 'ben', text: 'hi' });
    assert.equal(api.canDm(m('cy'), m('ben')), true, 'Ben wrote to Cy first');
    await route(m('ben'), 'privacy', 'PUT', { dm: 'staff' });
    assert.equal(api.canDm(m('cy'), m('ben')), false); assert.equal(api.canDm(m('mo'), m('ben')), true, 'mods always');
    assert.equal(api.canDm(m('agent-ben'), m('ben')), true, 'your own agent always');
    assert.equal(api.canDm(m('mo'), m('cy')), false, 'blocked never, even staff');
    assert.equal((await route(m('ben'), 'privacy', 'PUT', { dm: 'nobody?' }))[0], 400);
    await route(m('ben'), 'privacy', 'PUT', { typing: false }); assert.equal(api.typingOn('ben'), false); assert.equal(api.typingOn('cy'), true);
  })();
});
test('my data: only what I wrote, made or own; no keys; settings sync keeps whitelisted keys only', async () => {
  const r = rig(), { api } = ms(r), ben = r.members[1];
  r.store.appendJSONL('chat/general.jsonl', { id: 'a', by: 'ben', text: 'mine' }); r.store.appendJSONL('chat/general.jsonl', { id: 'b', by: 'ana', text: 'not mine' });
  r.store.writeMd('tasks/t1.md', { id: 't1', title: 'Mine', by: 'ana', assignee: 'ben' }, 'do it'); r.store.writeMd('tasks/t2.md', { id: 't2', title: 'Other', by: 'ana' }, '');
  r.store.writeMd('docs/notes.md', { title: 'Notes', by: 'ben' }, 'hello'); r.store.writeMd('docs/theirs.md', { title: 'Theirs', by: 'cy' }, 'x');
  const out = api.exportFor(ben);
  assert.deepEqual(JSON.parse(out.files['messages/general.json']).map(x => x.text), ['mine']);
  assert.ok(out.files['tasks/t1.json'] && !out.files['tasks/t2.json']); assert.ok(out.files['docs/notes.md'] && !out.files['docs/theirs.md']);
  assert.ok(!/h-ben/.test(out.files['profile.json']), 'the key hash never leaves');
  const put = await new Promise(res => api.route({}, {}, { b: 'settings', m: 'PUT', me: ben, readBody: async () => ({ settings: { theme: 'nordic', server: { token: 'x' }, prefs: { sound: false } } }), send: (_, s, d) => res(d), fail: (_, s, e) => res(e) }));
  assert.ok(put.at);
  const got = await new Promise(res => api.route({}, {}, { b: 'settings', m: 'GET', me: ben, readBody: async () => ({}), send: (_, s, d) => res(d), fail: (_, s, e) => res(e) }));
  assert.deepEqual(got.settings, { theme: 'nordic', prefs: { sound: false } });
});
test('deletion: scheduled with a grace period, undone, then carried out; the host cannot', async () => {
  let t = 1_000_000; const r = rig(), { api, removed } = ms(r, { graceMs: 5000, now: () => t });
  const call = (me, m, body) => new Promise(res => api.route({}, {}, { b: 'deletion', m, me, readBody: async () => body, send: (_, s, d) => res([s, d]), fail: (_, s, e) => res([s, e]) }));
  assert.equal((await call(r.members[0], 'POST', { confirm: 'DELETE' }))[0], 403);
  assert.equal((await call(r.members[2], 'POST', {}))[0], 400);
  assert.equal((await call(r.members[2], 'POST', { confirm: 'DELETE' }))[0], 200);
  await call(r.members[2], 'DELETE'); t += 10_000; assert.equal(api.sweep(), 0, 'undone');
  await call(r.members[2], 'POST', { confirm: 'DELETE' }); t += 4000; assert.equal(api.sweep(), 0, 'still in the grace period');
  t += 2000; assert.equal(api.sweep(), 1); assert.deepEqual(removed(), ['cy']);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { console.log('  FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} settings server tests passed`);
})();
