// feat/dropzone: the folder reader (app/ui/folderread.js) on the fixture folders (app/test/fixtures/dropzone_fixtures.json):
// kinds, key facts, skips, secrets, duplicates, CSV schema, suggestions, local answers and the AI context pack.
// Usage: node app/test/folderread_test.js
'use strict';
const assert = require('node:assert');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const FR = require('../ui/folderread.js');
const FX = require('./fixtures/dropzone_fixtures.json');

function png(hex) {   // a 4x4 PNG of one color
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, r, g, b, r, g, b, r, g, b, r, g, b])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// a dropped folder: walk with the default skips (as dropzone.js does), then analyze
function folder(name, { all = false } = {}) {
  const files = FX[name], ig = files['.gitignore'] ? FR.gitignore(files['.gitignore']) : null, items = [], skipped = [];
  for (const [p, v] of Object.entries(files)) {
    const why = FR.skipReason(p, ig);
    if (why && !all) { skipped.push({ path: p, why }); continue; }
    const buf = v.startsWith('@png:') ? png(v.slice(5, 11)) : Buffer.from(v);
    items.push({ path: `${name}/${p}`, size: buf.length, text: v.startsWith('@png:') ? null : v, buf });
  }
  return { items, skipped };
}
const hashOf = x => crypto.createHash('sha1').update(x.buf).digest('hex');
const colorsOf = list => list.map(x => '#' + (FX[x.path.split('/')[0]][x.path.split('/').slice(1).join('/')] || '').slice(5, 11));
const run = async (name, o) => { const f = folder(name, o); return { ...f, R: await FR.analyze(f.items, { name, hashOf, colorsOf }) }; };

(async () => {
  let n = 0; const t = (what, fn) => { fn(); n++; };
  // ---- skips: node_modules, dist (also in .gitignore), __pycache__, .godot, Library; .env is NOT skipped, it is flagged
  const vite = await run('recipe-site');
  t('skips', () => {
    assert.deepStrictEqual(vite.skipped.map(s => s.path).sort(), ['dist/index.html', 'node_modules/react/index.js', 'node_modules/react/package.json']);
    assert.strictEqual(FR.skipReason('.git/config'), 'git');
    assert.strictEqual(FR.skipReason('a/__pycache__/x.pyc'), '__pycache__');
    assert.strictEqual(FR.skipReason('src/build.js'), '');
    const ig = FR.gitignore('/secret-out/\n*.log\ntmp/\n'); assert.ok(ig('x/a.log') && ig('tmp/a') && ig('secret-out/a') && !ig('src/tmp.js'));
  });
  // ---- six kinds (and the summary wording)
  t('vite-react', () => {
    const R = vite.R;
    assert.strictEqual(R.kind.id, 'web-react'); assert.match(R.kind.label, /Vite \+ React app/);
    assert.strictEqual(R.key.components, 4, 'App, Login, RecipeCard, RecipeList');
    assert.match(R.summary, /^This looks like a Vite \+ React app with 4 components, no tests, and a README describing a recipe site for busy cooks\. 3 TODOs\./);
    assert.deepStrictEqual(R.key.scripts, { dev: 'vite', build: 'vite build' });
    assert.ok(R.key.entries.includes('index.html') && R.key.entries.includes('src/main.jsx'));
    assert.strictEqual(R.key.readme.title, 'Pantry');
    assert.ok(R.flags.secrets.some(s => s.path === '.env'), 'the .env is flagged');
    assert.match(R.summary, /1 secret \(\.env\)/);
    assert.ok(R.key.deps.includes('react') && R.key.devDeps.includes('vite'));
    const ids = R.suggestions.map(s => s.id);
    for (const id of ['preview', 'project', 'todos', 'bug']) assert.ok(ids.includes(id), id + ' in ' + ids);
    assert.ok(!ids.includes('readme'), 'it has a README');
  });
  const py = (await run('weather-py')).R;
  t('python', () => {
    assert.strictEqual(py.kind.id, 'python'); assert.match(py.kind.label, /Python project \(Flask\)/);
    assert.ok(py.key.tests && py.key.testFiles === 1); assert.ok(py.key.deps.includes('flask') && py.key.deps.includes('requests'));
    assert.match(py.summary, /Python project \(Flask\) with 3 modules, 1 test file, and a README describing a small weather dashboard for your city\. 1 TODO\./);
    assert.ok(py.key.entries.includes('app.py'));
  });
  const site = (await run('lantern-site')).R;
  t('static site', () => {
    assert.strictEqual(site.kind.id, 'static'); assert.match(site.summary, /static website: 2 pages, 1 stylesheet, 2 pictures/);
    assert.ok(site.suggestions.some(s => s.id === 'preview'));
  });
  const pics = (await run('beach-photos')).R;
  t('photos', () => {
    assert.strictEqual(pics.kind.id, 'photos'); assert.match(pics.summary, /photo set: 5 pictures/);
    assert.deepStrictEqual(pics.flags.duplicates, [['IMG_0001.jpg', 'IMG_0003.jpg']]);
    assert.ok(pics.key.colors.includes('#2B7BB9'));
    const ids = pics.suggestions.map(s => s.id); assert.ok(ids.includes('gallery') && ids.includes('moodboard'), ids);
  });
  const data = (await run('sales-data')).R;
  t('csv data', () => {
    assert.strictEqual(data.kind.id, 'data');
    const c = data.key.csv.find(x => x.path === 'sales.csv');
    assert.deepStrictEqual(c.columns.map(x => x.name), ['date', 'region', 'units', 'price', 'total']);
    assert.deepStrictEqual(c.columns.map(x => x.type), ['date', 'text', 'number', 'number', 'number']); assert.strictEqual(c.rows, 4);
    assert.match(data.summary, /data set: 2 data files; .+ has \d columns/);
    assert.ok(data.suggestions.some(s => s.id === 'sheet'));
  });
  const godot = (await run('moss-quest')).R;
  t('godot', () => {
    assert.strictEqual(godot.kind.id, 'godot'); assert.match(godot.summary, /Godot project called “Moss Quest” with 2 GDScript files and 2 scenes\. 1 TODO\./);
    assert.ok(godot.key.entries.includes('scenes/main.tscn'));
  });
  const unity = (await run('star-unity')).R;
  t('unity', () => { assert.strictEqual(unity.kind.id, 'unity'); assert.match(unity.summary, /Unity project \(2022\.3\.10f1\) with 1 C# script and 1 scene/); assert.ok(unity.suggestions.some(s => s.id === 'readme')); });
  const docs = (await run('notes-docs')).R;
  t('docs', () => { assert.strictEqual(docs.kind.id, 'docs'); assert.ok(docs.suggestions.some(s => s.id === 'deck')); });
  // ---- secrets in content and names
  t('secrets', () => {
    assert.ok(FR.isSecretName('.env') && FR.isSecretName('a/id_rsa') && FR.isSecretName('prod.pem') && !FR.isSecretName('.env.example') && !FR.isSecretName('keyboard.js'));
    assert.strictEqual(FR.scanSecrets('const k = "AKIAABCDEFGHIJKLMNOP"').why, 'an AWS access key');
    assert.strictEqual(FR.scanSecrets('hello'), null);
    assert.ok(!FR.redact('x sk-proj-AbCdEfGhIjKlMnOpQrStUvWx0123 y').includes('sk-proj'));
  });
  // ---- local answers
  t('answers', () => {
    const a = FR.answer(pics, 'how many images are there?'); assert.match(a.text, /There are 5 pictures/);
    const w = FR.answer(vite.R, 'where is the API key used?'); assert.match(w.text, /src\/components\/Login\.jsx:3/); assert.ok(!/sk-proj/.test(w.text), 'never quotes the secret');
    const l = FR.answer(vite.R, 'what does the login code do?'); assert.ok(l.needsAI && /Login\.jsx: .*submitLogin/.test(l.text), l.text);
    assert.match(FR.answer(vite.R, 'what dependencies does it use').text, /react/);
    assert.match(FR.answer(vite.R, 'any todos?').text, /3 TODOs/);
    assert.match(FR.answer(data, 'what columns are in it').text, /sales\.csv: date \(date\)/);
    assert.match(FR.answer(vite.R, 'what is this?').text, /Vite \+ React/);
    assert.match(FR.answer(vite.R, 'show me api.js').text, /getRecipes/);
    assert.match(FR.answer(vite.R, 'open .env').text, /won't show/);
    assert.strictEqual(FR.answer(vite.R, 'should I rewrite it in Rust'), null);
  });
  // ---- the AI context pack: question, overview, the right files, no secrets
  t('pack', () => {
    const p = FR.pack(vite.R, 'what does the login code do?');
    assert.ok(p.text.includes('QUESTION: what does the login code do?') && p.text.includes('### src/components/Login.jsx'));
    assert.ok(!p.text.includes('sk-proj') && !p.files.some(f => f.path === '.env'));
    assert.strictEqual(p.files[0].path, 'src/components/Login.jsx');
  });
  console.log(`folderread_test: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
