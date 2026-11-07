#!/usr/bin/env node
// One click: a real test project to build with a friend.
// Copies the Pixel Quest starter (templates/starter-game) to ~/TribeCode-Projects/pixel-quest, makes it a
// git repo, then hands off to invite-friend.js, which starts TribeCode, turns on the public address,
// creates the project, seeds starter tasks, makes a project invite + QR and the Claude Code command.
// Usage: node scripts/start-test-project.js [--name "Pixel Quest"] [--dir <folder>] [--no-share] [--no-open]
'use strict';
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const name = opt('--name') || 'Pixel Quest';
const dest = path.resolve(opt('--dir') || path.join(os.homedir(), 'TribeCode-Projects', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pixel-quest'));
const git = (...a) => execFileSync('git', a, { cwd: dest, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();

console.log(`\n  TribeCode · start a test project\n`);
if (!fs.existsSync(path.join(dest, '.git'))) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(root, 'templates', 'starter-game'), dest, { recursive: true, force: false, errorOnExist: false });
  git('init', '-q');
  try { git('checkout', '-q', '-b', 'main'); } catch {}
  const who = (() => { try { return git('config', 'user.name') ? [] : null; } catch { return null; } })();
  const ident = who ? [] : ['-c', `user.name=${os.userInfo().username || 'TribeCode'}`, '-c', 'user.email=host@users.noreply.tribecode'];
  git('add', '-A');
  execFileSync('git', [...ident, 'commit', '-q', '-m', 'Pixel Quest starter from TribeCode'], { cwd: dest, stdio: 'ignore' });
  console.log(`  Created ${dest}`);
} else console.log(`  Using ${dest}`);

const tasks = [
  'Make the double jump feel floatier (movement lane)',
  'Add a coin pickup sound (art lane)',
  'Give slimes a hop every 2 seconds (combat lane)',
  'Add a checkpoint flag before the last platform',
  'Draw a real player sprite in src/art/ (art lane)',
].join('|');
const args = [path.join(root, 'scripts', 'invite-friend.js'), '--project-path', dest, '--project-name', name, '--emoji', '🕹️', '--tasks', tasks, '--agent',
  ...argv.filter(a => ['--no-share', '--no-open', '--cloudflare'].includes(a)), ...(opt('--port') ? ['--port', opt('--port')] : [])];
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
child.on('exit', code => process.exit(code || 0));
