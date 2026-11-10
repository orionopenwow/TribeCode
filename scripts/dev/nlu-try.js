#!/usr/bin/env node
// Try Flint's local brain from the terminal: node scripts/dev/nlu-try.js "add a task to buy milk tomorrow" "open calendar"
'use strict';
const N = require('../../app/ui/flintnlu.js');
const ctx = { now: new Date('2026-11-10T10:00:00'), members: [{ id: 'm1', name: 'Maya Lee' }, { id: 'm2', name: 'Sam Ortiz' }, { id: 'a1', name: "Camp's Claude", role: 'agent' }],
  tasks: [{ id: 't1', title: 'Fix the jump bug', status: 'todo' }, { id: 't2', title: 'Design the logo', status: 'doing' }] };
for (const t of process.argv.slice(2)) {
  const r = N.parse(t, ctx);
  console.log(JSON.stringify(t), '=>', r.steps.map(s => `${s.intent}(${(s.conf || 0).toFixed(2)}) ${JSON.stringify(s.slots || {})}${s.ask ? ' ASK:' + s.ask.question : ''}${s.intent ? '' : ' alts:' + JSON.stringify(s.alts)}`).join(' | '));
}
