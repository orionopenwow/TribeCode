#!/usr/bin/env node
// Builds the TribeCode server as a standalone executable (Node SEA) and places it where Tauri
// expects a sidecar: app/src-tauri/binaries/tribecode-server-<target-triple>[.exe]
// Usage: node scripts/build-sidecar.js [target-triple]
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...opts });
const triple = process.argv[2] || execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/host: (\S+)/)[1];
const win = triple.includes('windows'), mac = triple.includes('apple');

run(process.execPath, ['scripts/bundle-server.js']);
run(process.execPath, ['--experimental-sea-config', 'dist/sea-config.json']);

const binDir = path.join(root, 'app', 'src-tauri', 'binaries');
fs.mkdirSync(binDir, { recursive: true });
const out = path.join(binDir, `tribecode-server-${triple}${win ? '.exe' : ''}`);
fs.copyFileSync(process.execPath, out);
if (mac) run('codesign', ['--remove-signature', out]);
run('npx', ['--yes', 'postject@1.0.0-alpha.6', out, 'NODE_SEA_BLOB', 'dist/sea-prep.blob',
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', ...(mac ? ['--macho-segment-name', 'NODE_SEA'] : [])]);
if (mac) run('codesign', ['--sign', '-', out]);
if (!win) fs.chmodSync(out, 0o755);
console.log('sidecar ready:', path.relative(root, out));
