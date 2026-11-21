// p10: one set of words for where the tribe runs (app/ui/tribestatus.js describe()). Usage: node app/test/tribestatus_test.js
const assert = require('assert');
const { describe: d } = require('../ui/tribestatus.js');
let n = 0; const eq = (a, b, m) => { n++; assert.strictEqual(a, b, m); };
const base = { hasToken: true, status: 'online', role: 'builder', hostName: 'Camp Wilkins', local: false, cloud: '', waiting: 0, downFor: 0 };
eq(d({ ...base, demo: true }).key, 'demo');
eq(d({ ...base, solo: true }).label, 'Only on this device');
eq(d({ hasToken: false }).label, 'Just you for now');
eq(d({ ...base, role: 'host', local: true, hostName: '' }).label, 'On this computer');
eq(d({ ...base }).label, "On Camp's computer", 'first name only');
eq(d({ ...base, cloud: 'render' }).label, 'Free cloud');
eq(d({ ...base, cloud: 'server' }).label, 'Always-on server');
eq(d({ ...base, waiting: 2 }).sub, 'Sending 2…');
eq(d({ ...base, status: 'reconnecting', downFor: 2000 }).label, 'Connecting…');
eq(d({ ...base, status: 'reconnecting', downFor: 20000, cloud: 'render' }).label, 'Free cloud · waking up');
eq(d({ ...base, status: 'reconnecting', downFor: 20000 }).key, 'offline', 'a long drop on a computer is offline, not "waking up"');
const off = d({ ...base, status: 'offline', waiting: 3 });
eq(off.label, 'Offline · 3 waiting'); eq(off.tone, 'off'); assert(/Camp's computer is off or asleep/.test(off.sub)); n++;
eq(d({ ...base, status: 'offline', waiting: 1 }).label, 'Offline · 1 waiting');
assert(/can’t be reached/.test(d({ ...base, status: 'offline', role: 'host', local: true, hostName: '' }).sub)); n++;
assert(/free cloud/i.test(d({ ...base, status: 'offline', cloud: 'render' }).sub)); n++;
// every state has one short label and a tone
for (const s of ['online', 'connecting', 'reconnecting', 'offline']) for (const c of ['', 'render', 'server']) for (const role of ['host', 'builder']) {
  const r = d({ ...base, status: s, cloud: c, role, local: role === 'host', downFor: 20000, waiting: 4 });
  assert(r.label && r.label.length <= 32 && ['live', 'warn', 'off', 'quiet'].includes(r.tone), JSON.stringify(r)); n++;
}
console.log(`tribestatus_test: all ${n} checks passed`);
