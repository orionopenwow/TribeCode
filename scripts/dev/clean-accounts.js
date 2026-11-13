#!/usr/bin/env node
// Refresh the username database and clean the tribe's account data before launch (docs/ACCOUNTS.md).
// One-shot and idempotent: a second run finds nothing to do and writes nothing.
//
//   node scripts/dev/clean-accounts.js [--dir <tribe folder>] [--dry-run] [--json]
//
// What it does (stop the TribeCode server for this folder first, it keeps members in memory):
//   1. Names: trims, collapses spaces and NFC-normalizes every person's name (members.json); usernames in accounts.json
//      become unique case-insensitively, with " 2", " 3" suffixes (server/accounts.js has the same rule).
//   2. Expired guest passes: one-time guests whose pass ran out (guestUntil in the past), their agents, and their device keys.
//      Invites that expired, were revoked or are used up go too.
//   3. Orphans: device keys whose member is gone or that expired; account sessions that expired or whose account is
//      disabled; account links to members that no longer exist; agents whose owner is gone.
//   4. Duplicates: members with the same id (the first stays).
//   5. Accounts: every person (not agents) gets an account entry mapped to their member id. Member keys are never changed.
// Before changing anything it copies every file it will write to .tribe/backups/<timestamp>/. It never deletes the
// tribe's chat, docs, tasks or code, only the records above, and never without that backup.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { normalizeUsername, keyOf, uniqueName } = require('../../server/accounts');

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DRY = flag('--dry-run'), JSON_OUT = flag('--json');
const DIR = path.resolve(opt('--dir', process.env.TRIBE_DIR || path.join(os.homedir(), 'TribeCode')));
const T = path.join(DIR, '.tribe');
const FILES = { members: 'members.json', invites: 'invites.json', devices: 'devices.json', accounts: 'accounts.json' };
const now = Date.now();
const past = iso => !!iso && Number.isFinite(Date.parse(iso)) && Date.parse(iso) < now;

if (flag('--help') || flag('-h')) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 18).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
if (!fs.existsSync(T)) { console.error(`No tribe at ${DIR} (no .tribe folder). Pass --dir <tribe folder>.`); process.exit(1); }

const read = (k, d) => { try { return JSON.parse(fs.readFileSync(path.join(T, FILES[k]), 'utf8')); } catch { return d; } };
const orig = { members: read('members', []), invites: read('invites', []), devices: read('devices', []), accounts: read('accounts', null) };
const data = JSON.parse(JSON.stringify({ ...orig, accounts: orig.accounts || { version: 1, accounts: [] } }));
if (!Array.isArray(data.accounts.accounts)) data.accounts.accounts = [];
const log = [];
const note = (kind, what) => log.push({ kind, what });

// 4. duplicate member ids (first stays)
{ const seen = new Set(); data.members = data.members.filter(m => { if (!m || !m.id) { note('dedupe', 'a member record with no id'); return false; } if (seen.has(m.id)) { note('dedupe', `duplicate member ${m.id} (${m.name})`); return false; } seen.add(m.id); return true; }); }

// 2. expired guest passes (people, then their agents)
{
  const gone = new Set(data.members.filter(m => m.role !== 'host' && m.role !== 'agent' && past(m.guestUntil)).map(m => m.id));
  data.members = data.members.filter(m => { if (gone.has(m.id)) { note('guest', `expired guest pass: ${m.name} (${m.id}, until ${m.guestUntil})`); return false; } return true; });
  data.members = data.members.filter(m => { if (m.role === 'agent' && gone.has(m.owner)) { note('guest', `agent of an expired guest: ${m.name} (${m.id})`); return false; } return true; });
  data.invites = data.invites.filter(i => { const dead = i.revoked || past(i.expires) || (Number.isFinite(i.maxUses) && i.uses >= i.maxUses); if (dead) note('invite', `invite ${i.code} (${i.revoked ? 'revoked' : past(i.expires) ? 'expired' : 'used up'})`); return !dead; });
}
// 3. orphans
const ids = new Set(data.members.map(m => m.id));
data.members = data.members.filter(m => { if (m.role === 'agent' && m.owner && !ids.has(m.owner)) { note('orphan', `agent with no owner: ${m.name} (${m.id})`); return false; } return true; });
const ids2 = new Set(data.members.map(m => m.id));
{
  const IDLE = 90 * 86400_000;
  data.devices = data.devices.filter(d => {
    const last = Date.parse(d.lastUsed || d.created) || 0, idle = now > last + (d.idleDays || 90) * 86400_000 || (!d.idleDays && now > last + IDLE);
    if (!ids2.has(d.member)) { note('orphan', `device key for a member that is gone (${d.member}, ${d.label || d.id})`); return false; }
    if (past(d.expires) || idle) { note('orphan', `expired device key (${d.label || d.id})`); return false; }
    return true;
  });
}
// 1. names
for (const m of data.members) {
  if (m.role === 'agent' || typeof m.name !== 'string') continue;
  const n = normalizeUsername(m.name) || 'Member';
  if (n !== m.name) { note('name', `member name ${JSON.stringify(m.name)} -> ${JSON.stringify(n)}`); m.name = n; }
}
// 5 + 1 + 3: accounts
{
  const accts = data.accounts.accounts, taken = new Set();
  for (const a of accts) {
    const u = normalizeUsername(a.username) || 'Member', k = keyOf(u), unique = taken.has(k) ? uniqueName(u, taken) : u;
    if (unique !== a.username || a.usernameKey !== keyOf(unique)) { note('username', `username ${JSON.stringify(a.username)} -> ${JSON.stringify(unique)}`); a.username = unique; a.usernameKey = keyOf(unique); }
    taken.add(a.usernameKey);
    const live = (a.sessions || []).filter(s => !past(s.expires) && a.status !== 'disabled');
    if (live.length !== (a.sessions || []).length) { note('session', `${(a.sessions || []).length - live.length} ended session(s) on ${a.username}`); a.sessions = live; }
    const mem = (a.members || []).filter(id => ids2.has(id));
    if (mem.length !== (a.members || []).length) { note('orphan', `account ${a.username} pointed at member(s) that are gone`); a.members = mem; }
  }
  const mapped = new Set(accts.flatMap(a => a.members || []));
  for (const m of data.members) {
    if (m.role === 'agent' || mapped.has(m.id)) continue;
    const u = uniqueName(m.name, taken); taken.add(keyOf(u));
    accts.push({ id: 'acct-' + crypto.randomBytes(8).toString('base64url').slice(0, 10), username: u, usernameKey: keyOf(u), displayName: m.name, created: m.joined || new Date().toISOString(),
      status: m.guestUntil ? 'guest' : 'active', providers: [], sessions: [], members: [m.id] });
    note('account', `account ${JSON.stringify(u)} for member ${m.id}`);
  }
}

const changed = Object.keys(FILES).filter(k => JSON.stringify(k === 'accounts' ? (orig.accounts || null) : orig[k]) !== JSON.stringify(data[k]));
const summary = log.reduce((o, x) => (o[x.kind] = (o[x.kind] || 0) + 1, o), {});
if (JSON_OUT) console.log(JSON.stringify({ dir: DIR, dryRun: DRY, changes: log, files: changed.map(k => FILES[k]) }, null, 2));
else {
  console.log(`TribeCode account cleanup · ${DIR}${DRY ? ' · dry run (nothing is written)' : ''}`);
  if (!log.length) console.log('  Nothing to do: names, guest passes, sessions, device keys and accounts are already clean.');
  for (const x of log) console.log(`  ${DRY ? 'would ' : ''}${x.kind.padEnd(8)} ${x.what}`);
  if (log.length) console.log(`  ${Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(' · ')}`);
}
if (DRY || !changed.length) process.exit(0);

// the backup first, always
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bdir = path.join(T, 'backups', stamp);
fs.mkdirSync(bdir, { recursive: true });
let copied = 0;
for (const k of changed) { const src = path.join(T, FILES[k]); if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(bdir, FILES[k])); copied++; } }
fs.writeFileSync(path.join(bdir, 'CHANGES.json'), JSON.stringify({ at: new Date().toISOString(), changes: log }, null, 2));
for (const k of changed) {   // atomic: write next to it, then rename
  const f = path.join(T, FILES[k]), tmp = f + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data[k], null, 2)); fs.renameSync(tmp, f);
}
if (!JSON_OUT) console.log(`  Backed up ${copied} file(s) to ${path.relative(DIR, bdir)} and wrote ${changed.map(k => FILES[k]).join(', ')}.`);
