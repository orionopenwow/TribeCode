#!/usr/bin/env node
// One-time release setup + first release, in one command:
//   node scripts/setup-release.js            (uses version from app/package.json)
//   node scripts/setup-release.js 0.2.0
// Needs: Node 20+, git, and the GitHub CLI logged in (`gh auth login`).
// It creates the updater signing key, stores it as GitHub secrets, saves the public key as a
// repo variable (CI injects it), then tags and pushes so GitHub Actions builds the installers.
'use strict';
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
const ok = msg => console.log('  ✔ ' + msg);
const die = msg => { console.error('\n  ✖ ' + msg + '\n'); process.exit(1); };

function have(cmd) { try { sh(`${cmd} --version`); return true; } catch { return false; } }
if (!have('git')) die('git is not installed.');
if (!have('gh')) die('GitHub CLI is not installed. Get it at https://cli.github.com, then run: gh auth login');
try { sh('gh auth status'); } catch { die('GitHub CLI is not logged in. Run: gh auth login'); }

const version = (process.argv[2] || require(path.join(root, 'app', 'package.json')).version).replace(/^v/, '');
const tag = 'v' + version;
const repo = sh('gh repo view --json nameWithOwner -q .nameWithOwner');
console.log(`\n  TribeCode release setup for ${repo} · ${tag}\n`);

// 1. Signing key (reuse if it already exists on this machine)
const keyDir = path.join(os.homedir(), '.tauri'); fs.mkdirSync(keyDir, { recursive: true });
const keyFile = path.join(keyDir, 'tribecode-updater.key');
if (!fs.existsSync(keyFile)) {
  const r = spawnSync('npx', ['--yes', '@tauri-apps/cli@2', 'signer', 'generate', '--ci', '-p', '', '-w', keyFile], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0 || !fs.existsSync(keyFile)) die('Could not generate the signing key.');
  ok(`Created signing key at ${keyFile} (keep it safe; it signs every update)`);
} else ok(`Using existing signing key at ${keyFile}`);
const pub = fs.readFileSync(keyFile + '.pub', 'utf8').trim();

// 2. Secrets + variable on GitHub
const setSecret = (name, value) => { const r = spawnSync('gh', ['secret', 'set', name, '--repo', repo], { input: value, encoding: 'utf8', shell: process.platform === 'win32' }); if (r.status !== 0) die(`Could not set secret ${name}: ${r.stderr}`); };
setSecret('TAURI_SIGNING_PRIVATE_KEY', fs.readFileSync(keyFile, 'utf8').trim());
setSecret('TAURI_SIGNING_PRIVATE_KEY_PASSWORD', ' ');
ok('Saved the private key as GitHub secrets');
const v = spawnSync('gh', ['variable', 'set', 'TAURI_UPDATER_PUBKEY', '--repo', repo, '--body', pub], { encoding: 'utf8', shell: process.platform === 'win32' });
if (v.status !== 0) die('Could not set variable TAURI_UPDATER_PUBKEY: ' + v.stderr);
ok('Saved the public key as a repo variable (CI puts it in the app)');

// 3. Tag and push -> GitHub Actions builds Windows, macOS and Linux installers
try { sh('git fetch --tags --quiet origin'); } catch {}
const exists = (() => { try { sh(`git rev-parse -q --verify refs/tags/${tag}`); return true; } catch { return false; } })();
if (exists) {
  try { sh(`git ls-remote --exit-code --tags origin ${tag}`); ok(`${tag} is already on GitHub; re-running its build`); spawnSync('gh', ['workflow', 'run', 'release.yml', '--repo', repo, '--ref', tag], { stdio: 'inherit', shell: process.platform === 'win32' }); }
  catch { sh(`git push origin ${tag}`); ok(`Pushed ${tag}`); }
} else {
  sh(`git tag -a ${tag} -m "TribeCode ${tag}"`); sh(`git push origin ${tag}`); ok(`Tagged and pushed ${tag}`);
}
console.log(`\n  Done. Installers build in about 15 minutes:\n  https://github.com/${repo}/actions\n  Then download from: https://github.com/${repo}/releases/tag/${tag}\n`);
