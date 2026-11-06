#!/usr/bin/env node
// Bundles server/*.js into one CommonJS file (dist/tribecode-server.js) so it can be turned into a
// standalone executable with Node's Single Executable Applications (SEA). Zero dependencies.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const srv = path.join(root, 'server');
const out = path.join(root, 'dist', 'tribecode-server.js');
const version = require(path.join(root, 'app', 'package.json')).version;

const modules = fs.readdirSync(srv).filter(f => f.endsWith('.js'));
let code = `'use strict';\n// TribeCode server ${version} (bundled)\nprocess.env.TRIBE_VERSION = process.env.TRIBE_VERSION || ${JSON.stringify(version)};\nconst __mods = {}, __cache = {};\n`;
code += `function __req(name) { if (__cache[name]) return __cache[name].exports; const m = { exports: {} }; __cache[name] = m; __mods[name](m, m.exports, __req2(name)); return m.exports; }\n`;
code += `function __req2() { return n => { const k = n.replace(/^\\.\\//, '').replace(/\\.js$/, ''); return __mods[k] ? __req(k) : require(n); }; }\n`;
for (const f of modules) {
  const name = f.replace(/\.js$/, '');
  const src = fs.readFileSync(path.join(srv, f), 'utf8').replace(/^#!.*\n/, '');
  code += `__mods[${JSON.stringify(name)}] = function (module, exports, require) {\n${src}\n};\n`;
}
code += `const __main = __req('index');\nif (__main && __main.start) __main.start();\n`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, code);
fs.writeFileSync(path.join(root, 'dist', 'sea-config.json'), JSON.stringify({ main: 'dist/tribecode-server.js', output: 'dist/sea-prep.blob', disableExperimentalSEAWarning: true }, null, 2));
console.log(`bundled ${modules.length} modules -> ${path.relative(root, out)}`);
