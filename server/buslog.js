// Keeps the last few hundred bus.notify events for debugging (GET /api/debug/bus-log with --dev or TRIBE_TEST=1).
// Until the notification hub (server/notify.js) is listening, it also delivers each notification to the
// recipients' open tabs as { type: 'notification', fallback: true } so reminders and mentions still reach people.
'use strict';
const bus = require('./bus');

module.exports = function busLog({ broadcast, sendTo, max = 300 }) {
  const log = [];
  const onNotify = n => {
    log.push(n); if (log.length > max) log.shift();
    if (bus.listenerCount('notify') > 1) return;            // a real notification hub is listening: it delivers
    const msg = { type: 'notification', fallback: true, notification: n };
    if (n.to === 'all' || !Array.isArray(n.to)) broadcast(msg); else for (const mid of new Set(n.to)) sendTo(mid, msg);
  };
  bus.on('notify', onNotify);
  return { log: (type) => (type ? log.filter(n => n.type === type) : log.slice()) };
};
