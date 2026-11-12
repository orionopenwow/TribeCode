#!/usr/bin/env node
// Watch Flint build (docs/FLINT-TIERS.md, app/ui/flintrun.js): starts TribeCode on a throwaway tribe folder and opens the
// app with the run-through playing. Flint drives the real app with his normal commands (a tribe, a project, the vision,
// company basics, tasks, a doc, a website + an edit, a game, a design, chat, a proposal, a standup, a summary, the
// product presentation) and saves two proof-of-work ZIPs in <folder>/tribe/exports/. No AI needed.
//   node scripts/flint-runthrough.js                    # a fresh /tmp folder, port 4859, opens the browser
//   node scripts/flint-runthrough.js --dir ~/flint-demo  # keep the result somewhere you can find it
//   node scripts/flint-runthrough.js --headless         # no browser window: runs app/test/e2e_flint_runthrough.py
//                                                       # (Python + Playwright + Chrome) and prints the ZIP paths
// The in-app version is Help (?) › Watch Flint build, or ask Flint "watch flint build", in any tribe.
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const val = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = k => argv.includes(k);
const port = Number(val('--port', 4859)) || 4859;
const dir = path.resolve(val('--dir', fs.mkdtempSync(path.join(os.tmpdir(), 'tribecode-flint-run-'))));

if (has('--headless')) {
  const r = spawnSync(process.env.PYTHON || 'python3', [path.join(root, 'app', 'test', 'e2e_flint_runthrough.py'), '--out', dir], { stdio: 'inherit', cwd: root, env: { ...process.env, TRIBE_NO_DOWNLOAD: '1' } });
  process.exit(r.status == null ? 1 : r.status);
}

const tribeDir = path.join(dir, 'tribe');
const child = spawn(process.execPath, [path.join(root, 'server', 'index.js'), '--port', String(port), '--dir', tribeDir, '--name', 'My Tribe', '--host', '127.0.0.1'],
  { cwd: root, env: { ...process.env, TRIBE_NO_GH: '1', TRIBE_NO_DOWNLOAD: '1' }, stdio: has('--verbose') ? 'inherit' : 'ignore' });
const url = `http://localhost:${port}/?skipIntro=1&flintrun=1`;
function waitUp(tries = 0) {
  http.get(`http://localhost:${port}/api/health`, res => {
    res.resume();
    console.log(`\n  Flint run-through · ${url}\n  The ZIPs land in ${path.join(tribeDir, 'exports')} (and download in the browser at the end).\n  Ctrl+C stops the server; the folder stays.\n`);
    if (!has('--no-open')) { const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]; try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {} }
  }).on('error', () => { if (tries < 80) setTimeout(() => waitUp(tries + 1), 250); else { console.error('  The server did not start (run with --verbose).'); process.exit(1); } });
}
waitUp();
const quit = () => { child.kill('SIGTERM'); setTimeout(() => process.exit(0), 300); };
process.on('SIGINT', quit); process.on('SIGTERM', quit);
