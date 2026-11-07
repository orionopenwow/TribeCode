// The desktop app's server is server/*.js bundled into one file (scripts/bundle-server.js). Windows build machines
// check files out with CRLF line endings; the bundle must still parse and start (v0.6.4 shipped a server that
// didn't: the '#!' line of server/index.js survived inside the bundle). Usage: node app/test/bundle_test.js
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-bundle-'));
fs.mkdirSync(path.join(tmp, 'scripts')); fs.mkdirSync(path.join(tmp, 'app')); fs.mkdirSync(path.join(tmp, 'server'));
fs.copyFileSync(path.join(root, 'scripts', 'bundle-server.js'), path.join(tmp, 'scripts', 'bundle-server.js'));
fs.copyFileSync(path.join(root, 'app', 'package.json'), path.join(tmp, 'app', 'package.json'));
for (const f of fs.readdirSync(path.join(root, 'server'))) {
  const p = path.join(root, 'server', f); if (!fs.statSync(p).isFile()) continue;
  const s = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(path.join(tmp, 'server', f), f.endsWith('.js') ? s.replace(/\r?\n/g, '\r\n') : s);   // like a Windows checkout
}
execFileSync(process.execPath, [path.join(tmp, 'scripts', 'bundle-server.js')], { stdio: 'pipe' });
const out = fs.readFileSync(path.join(tmp, 'dist', 'tribecode-server.js'), 'utf8');
new (require('node:vm').Script)(out, { filename: 'tribecode-server.js' });   // throws on a syntax error
if (/^\s*#!/m.test(out)) throw new Error('a #! line survived in the bundle');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('bundle_test: OK (CRLF checkout bundles into a server that parses)');
