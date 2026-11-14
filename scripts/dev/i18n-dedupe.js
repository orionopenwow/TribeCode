#!/usr/bin/env node
// Removes rows of app/ui/i18n.js that are defined again further down (feat/languages). In a JS object the last of two
// equal keys wins, so an earlier row with the same English is dead text: it is never shown, and it hides which
// translation is really in use. This deletes every occurrence but the last, then proves nothing changed: the table,
// evaluated, must be exactly the same before and after, or the file is left alone.
//   node scripts/dev/i18n-dedupe.js          list the twice-defined keys and what each variant says
//   node scripts/dev/i18n-dedupe.js --write  remove the dead rows
'use strict';
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', '..', 'app', 'ui', 'i18n.js');
const src = fs.readFileSync(FILE, 'utf8');
const a = src.indexOf('const D = {'), b = src.indexOf("const KEY = 'tribecode.lang';");
if (a < 0 || b < 0) { console.error('could not find the table'); process.exit(1); }
const table = src.slice(a, b);
const evalTable = t => new Function('return (' + t.slice(t.indexOf('{'), t.lastIndexOf('};') + 1) + ')')();
const STR = '(?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
const ROW = new RegExp('(' + STR + ')\\s*:\\s*(\\[\\s*(?:' + STR + '\\s*,?\\s*)*\\])\\s*,?[ \\t]*\\n?', 'g');
const lit = s => new Function('return ' + s)();
const hits = [...table.matchAll(ROW)].map(m => ({ key: lit(m[1]), row: m[2], at: m.index, len: m[0].length }));
const before = evalTable(table);
if (new Set(hits.map(h => h.key)).size !== Object.keys(before).length) { console.error(`read ${new Set(hits.map(h => h.key)).size} keys, the table has ${Object.keys(before).length}: not touching it`); process.exit(1); }
const byKey = new Map(); hits.forEach(h => { if (!byKey.has(h.key)) byKey.set(h.key, []); byKey.get(h.key).push(h); });
const dups = [...byKey.entries()].filter(([, l]) => l.length > 1);
const differ = dups.filter(([, l]) => new Set(l.map(h => JSON.stringify(lit(h.row)))).size > 1);   // by what the cells say, not how the row is spaced
console.log(`${dups.length} keys are defined more than once (${differ.length} with different translations, ${dups.length - differ.length} identical).`);
const LANGS = ['es', 'pt', 'fr', 'de', 'ja', 'zh', 'ko'];
for (const [key, l] of differ) {
  const rows = l.map(h => lit(h.row)), last = rows[rows.length - 1];
  const where = LANGS.filter((_, i) => rows.some(r => r[i] !== last[i]));
  console.log(`  ${JSON.stringify(key)}: differs in ${where.join(', ')}`);
  where.slice(0, 2).forEach(code => { const i = LANGS.indexOf(code); console.log(`      ${code}: in use ${JSON.stringify(last[i])} · dead ${[...new Set(rows.slice(0, -1).map(r => r[i]).filter(x => x !== last[i]))].map(x => JSON.stringify(x)).join(', ')}`); });
}
if (!process.argv.includes('--write')) process.exit(0);
// delete all but the last occurrence, from the end so the offsets stay right
const dead = dups.flatMap(([, l]) => l.slice(0, -1)).sort((x, y) => y.at - x.at);
let out = table; for (const h of dead) out = out.slice(0, h.at) + out.slice(h.at + h.len);
const after = evalTable(out);
const same = Object.keys(before).length === Object.keys(after).length && Object.keys(before).every(k => JSON.stringify(before[k]) === JSON.stringify(after[k]));
if (!same) { console.error('the table would change: nothing written'); process.exit(1); }
fs.writeFileSync(FILE, src.slice(0, a) + out + src.slice(b));
console.log(`removed ${dead.length} dead rows; the evaluated table is identical (${Object.keys(after).length} keys).`);
