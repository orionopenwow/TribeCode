// Shared event bus for server modules. Features announce things here; the notification hub
// (server/notify.js) decides who hears about them, through which channel, and whether it's
// worth interrupting anyone.
//
//   const bus = require('./bus');
//   bus.notify({
//     type: 'approval' | 'mention' | 'task-assigned' | 'reminder' | 'meeting-notes' | 'repo' |
//           'proposal' | 'release' | 'bug-critical' | 'huddle' | 'dm' | 'digest' | <new types>,
//     to: ['memberId', ...] | 'all',      // recipients (default 'all')
//     title: 'Short title', body: 'One or two lines',
//     view: 'tasks' | 'docs' | 'board' | ..., ref: 'id of the thing',   // where tapping it should go
//     priority: 'high' | 'normal' | 'low', // high = approvals, direct asks; low = FYI, never interrupts
//     actions: [{ id: 'approve', label: 'Approve' }, ...]                // optional (approvals)
//   });
//   bus.on('notify', n => ...);            // the notification hub listens here
'use strict';
const { EventEmitter } = require('node:events');
const bus = new EventEmitter();
bus.setMaxListeners(50);
bus.notify = n => bus.emit('notify', { to: 'all', priority: 'normal', at: new Date().toISOString(), ...n });
module.exports = bus;
