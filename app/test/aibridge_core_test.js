// Unit test for the AI bridge's logic (app/ui/aibridge-core.js): the pack, secrets, splitting, reply parsing, diffs, risks, PDF.
const assert = require('assert');
const B = require('../ui/aibridge-core.js');
const zlib = require('zlib');
(async () => {
  // pack: goal, files with paths, constraints, strict reply format; secrets stripped and reported
  const p = B.pack({ goal: 'Add a pause menu', files: [{ path: 'src/game.js', text: 'const API_KEY = "sk-abcdefghijklmnopqrstuvwxyz123456";\nlet x = 1;\n' }, { path: '.env', text: 'TOKEN=abc' }], task: 'Pause menu' });
  assert(p.text.includes('GOAL: Add a pause menu'));
  assert(p.text.includes('```js path=src/game.js'));
  assert(p.text.includes('No npm packages'));
  assert(p.text.includes('How to reply (strict)'));
  assert(!p.text.includes('sk-abcdefghijklmnop'), 'secret stripped');
  assert(p.removed.length >= 1 && p.skipped[0] === '.env');
  assert(!p.text.includes('TOKEN=abc'));
  // split
  const parts = B.split('x'.repeat(50) + '\n' + 'line\n'.repeat(6000), 8000);
  assert(parts.length >= 4 && parts[0].includes('Part 1 of') && parts[parts.length - 1].includes('the last one'));
  assert(parts.every(x => x.length <= 8000));
  // parse: a ChatGPT-style reply with a diff and a full file
  const old = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\n';
  const reply = 'Sure! Here are the changes.\n\n**src/game.js**\n```diff\n--- a/src/game.js\n+++ b/src/game.js\n@@ -2,3 +2,3 @@\n b\n-c\n+C\n d\n@@ -11,3 +11,4 @@\n k\n l\n+l2\n m\n```\n\nAnd a new file:\n\n```css path=src/pause.css\n.pause { display: grid; }\n```\n\nHope this helps!';
  const r = B.parse(reply);
  assert.deepStrictEqual(r.files.map(f => [f.path, f.kind]), [['src/game.js', 'diff'], ['src/pause.css', 'full']]);
  assert(r.notes.includes('Hope this helps'));
  const pt = B.patch(old, r.files[0].hunks); assert.deepStrictEqual(pt.failed, []);
  assert.strictEqual(pt.text, 'a\nb\nC\nd\ne\nf\ng\nh\ni\nj\nk\nl\nl2\nm\n');
  // shifted line numbers still apply
  const shifted = B.patch('zz\n' + old, r.files[0].hunks); assert.deepStrictEqual(shifted.failed, []); assert(shifted.text.startsWith('zz\na\nb\nC'));
  // hunks + per-hunk accept
  const hs = B.hunks(old, pt.text); assert.strictEqual(hs.length, 2);
  assert.strictEqual(B.applyHunks(old, hs, new Set([0, 1])), pt.text);
  assert.strictEqual(B.applyHunks(old, hs, new Set([1])), old.replace('l\n', 'l\nl2\n'));
  assert.strictEqual(B.applyHunks(old, hs, new Set()), old);
  assert.strictEqual(B.applyHunks('', B.hunks('', 'x\ny\n'), new Set([0])), 'x\ny\n');
  // other path styles
  assert.strictEqual(B.parse('```js\n// file: lib/a.js\nlet a;\n```').files[0].path, 'lib/a.js');
  assert.strictEqual(B.parse('### `index.html`\n```html\n<p>hi</p>\n```').files[0].path, 'index.html');
  assert.strictEqual(B.parse('```js:src/b.js\nx\n```').files[0].path, 'src/b.js');
  // malformed: calm problems, no throw
  const bad = B.parse('I think you should restructure the code.\n```\nfoo()\nbar()\nbaz() and some more text here to be long\n```');
  assert(!bad.files.length && bad.problems.length);
  assert(B.parse('').problems.length);
  assert(B.parse('```js path=a.js\nlet x').problems.some(x => /cut off/.test(x)));
  // site config + html
  assert(B.parse('```json path=site.json\n{"name":"X","pages":[]}\n```').site);
  assert(B.parse('<!doctype html><html><body><h1>Hi</h1></body></html>').html);
  // risks
  const rk = B.risks([{ path: 'a.js', old: '', added: 'fetch("https://x.y"); eval(s); // npm install left-pad' }]).map(x => x.kind);
  assert(rk.includes('network') && rk.includes('eval') && rk.includes('install'), rk);
  assert(B.risks([{ path: '../x.js', added: '' }]).some(x => x.kind === 'path'));
  assert(B.risks([1, 2, 3].map(i => ({ path: `f${i}.js`, kind: 'delete', old: 'x' })))[0].text === 'deletes 3 files');
  // pdf round trip (ours is uncompressed) and a Flate one
  const pdf = B.pdf('Hello (world)\nsecond line', 'Pack');
  assert(Buffer.from(pdf).toString('latin1').startsWith('%PDF-1.4'));
  const txt = await B.pdfText(pdf);
  assert(txt.includes('Hello (world)') && txt.includes('second line'), txt);
  const content = 'BT /F1 9 Tf 10 10 Td (Flate text) Tj T* (line two) Tj ET';
  const z = zlib.deflateSync(Buffer.from(content));
  const fl = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + z.length + ' /Filter /FlateDecode >>\nstream\n', 'latin1'), z, Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1')]);
  const ft = await B.pdfText(new Uint8Array(fl), async u => new Uint8Array(zlib.inflateSync(Buffer.from(u))));
  assert(ft.includes('Flate text') && ft.includes('line two'), ft);
  console.log('ok aibridge_core_test');
})().catch(e => { console.error(e); process.exit(1); });
