#!/usr/bin/env node
// fix/p15-updates: the build id. Every release gets one id (UTC time + git commit, e.g. 20261127T101500Z-1a2b3c4), written
// into the places that must agree after an update:
//   package.json and app/package.json   "tribeBuild"   the server reports it (/api/health, the websocket hello)
//   app/ui/index.html                   <meta name="tribe-build">   the page knows which build its files are
// The desktop app reads the same meta from its bundled page, so app, server and screens can all be compared.
// release.js calls stampBuild(); `node scripts/dev/buildid.js` stamps a fresh id, `--check` says whether they agree.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PKGS = ['package.json', 'app/package.json'];
const PAGE = 'app/ui/index.html';
const META = /<meta name="tribe-build" content="[^"]*">/;

function makeBuildId({ root = ROOT, now = new Date() } = {}) {
  const t = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  let sha = ''; try { const r = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, encoding: 'utf8' }); if (r.status === 0) sha = r.stdout.trim(); } catch {}
  return sha ? `${t}-${sha}` : t;
}
function stampBuild(id, { root = ROOT } = {}) {
  if (!/^[\w.-]{1,64}$/.test(id)) throw new Error('bad build id: ' + id);
  for (const rel of PKGS) {
    const f = path.join(root, rel); if (!fs.existsSync(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    const out = /"tribeBuild":\s*"[^"]*"/.test(s) ? s.replace(/("tribeBuild":\s*")[^"]*(")/, `$1${id}$2`) : s.replace(/("version":\s*"[^"]*",?)(\r?\n)/, (m, a, nl) => `${a.endsWith(',') ? a : a + ','}${nl}  "tribeBuild": "${id}",${nl}`);
    fs.writeFileSync(f, out);
  }
  const page = path.join(root, PAGE);
  if (fs.existsSync(page)) {
    const h = fs.readFileSync(page, 'utf8'), tag = `<meta name="tribe-build" content="${id}">`;
    fs.writeFileSync(page, META.test(h) ? h.replace(META, tag) : h.replace(/(<meta name="tribe-version" content="[^"]*">)/, `$1\n${tag}`));
  }
  return id;
}
function readBuilds({ root = ROOT } = {}) {
  const out = {};
  for (const rel of PKGS) { try { out[rel] = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')).tribeBuild || ''; } catch { out[rel] = ''; } }
  try { const m = /<meta name="tribe-build" content="([^"]*)">/.exec(fs.readFileSync(path.join(root, PAGE), 'utf8')); out[PAGE] = m ? m[1] : ''; } catch { out[PAGE] = ''; }
  return out;
}
module.exports = { makeBuildId, stampBuild, readBuilds };

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const b = readBuilds(), vals = Object.values(b), ok = vals[0] && vals.every(v => v === vals[0]);
    console.log(`buildid: ${ok ? 'OK ' + vals[0] : 'MISMATCH ' + JSON.stringify(b)}`); process.exit(ok ? 0 : 1);
  }
  console.log('buildid: stamped ' + stampBuild(process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : makeBuildId()));
}
