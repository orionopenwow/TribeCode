// App and game starters (app/ui/starters, docs/STARTERS.md): every starter has a LICENSE file, a NOTICE entry, a
// STARTER.json with an allowed license, ≤ 300 KB, a config.js written from its params, and an index.html that loads
// with no console errors and draws something, both opened directly and inside a sandboxed iframe like the Design
// flow's preview (no same-origin, so no localStorage, no alert/prompt). One small interaction per starter too.
//   node app/test/starters_test.js
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), UI = path.join(ROOT, 'app', 'ui'), DIR = path.join(UI, 'starters');
const PORT = 5990 + Number(process.env.TRIBE_PORT_OFFSET || 0);

// 1. the files and licenses (scripts/dev/starters.js --check)
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'dev', 'starters.js'), '--check'], { stdio: 'inherit' });
const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8')).items;
const notice = fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8');
assert.ok(cat.filter(c => c.kind === 'game').length >= 6, 'at least 6 games');
assert.ok(cat.filter(c => c.kind === 'app').length >= 8, 'at least 8 apps');
for (const c of cat) {
  const d = path.join(DIR, c.id);
  for (const f of ['index.html', 'STARTER.json', 'LICENSE', 'README.md']) assert.ok(fs.existsSync(path.join(d, f)), `${c.id}: ${f}`);
  assert.ok(notice.includes(`- ${c.id}:`), `${c.id}: NOTICE entry`);
  assert.ok(fs.readFileSync(path.join(d, 'LICENSE'), 'utf8').length > 100, `${c.id}: LICENSE text`);
  if (c.params.length) {
    const cfg = fs.readFileSync(path.join(d, 'config.js'), 'utf8');
    for (const p of c.params) assert.ok(new RegExp(`^  ${p.key}: `, 'm').test(cfg), `${c.id}: config.js has ${p.key}`);
  }
  assert.ok(fs.existsSync(path.join(UI, 'starters', 'thumbs', c.id + '.webp')), `${c.id}: a preview thumbnail (python3 scripts/dev/design-thumbs.py)`);
}

// 2. the pages, in a real browser
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/favicon.ico') { res.writeHead(204); return res.end(); }   // browsers ask for it on every page
  const f = path.join(UI, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const POKE = {   // one small interaction: the page answers input without errors
  platformer: async p => { await p.keyboard.down('ArrowRight'); await p.waitForTimeout(300); await p.keyboard.up('ArrowRight'); await p.keyboard.press('Space'); },
  breakout: async p => { await p.mouse.move(300, 200); await p.keyboard.press('ArrowLeft'); },
  blocks: async p => { await p.keyboard.press('Space'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowLeft'); },
  snake: async p => { await p.keyboard.press('ArrowRight'); },
  runner: async p => { await p.keyboard.press('Space'); await p.waitForTimeout(400); },
  topdown: async p => { await p.keyboard.down('KeyD'); await p.mouse.click(300, 200); await p.keyboard.up('KeyD'); },
  memory: async p => { await p.click('.card >> nth=0'); await p.click('.card >> nth=1'); },
  todo: async p => { await p.fill('#input', 'Test the starter'); await p.press('#input', 'Enter'); assert.ok(await p.locator('.todos li', { hasText: 'Test the starter' }).count()); },
  notes: async p => { await p.click('#add'); await p.keyboard.type('# Hello'); },
  sketch: async p => { await p.mouse.move(100, 100); await p.mouse.down(); await p.mouse.move(200, 160); await p.mouse.up(); },
  kanban: async p => { await p.click('.add >> nth=0'); await p.keyboard.type('New card'); await p.keyboard.press('Enter'); assert.ok(await p.locator('.item', { hasText: 'New card' }).count()); },
  dashboard: async p => { await p.selectOption('#range', '7'); },
  chat: async p => { await p.fill('#msg', 'hi'); await p.press('#msg', 'Enter'); },
  survey: async p => { await p.fill('#a', 'Rae'); await p.press('#a', 'Enter'); assert.ok((await p.textContent('#step')).includes('2')); },
  pomodoro: async p => { await p.click('#go'); await p.waitForTimeout(300); await p.click('#go'); },
  calculator: async p => { await p.keyboard.type('(2+3)*4'); await p.keyboard.press('Enter'); assert.strictEqual((await p.textContent('#out')).trim(), '20'); },
  weather: async p => { await p.fill('#city', 'Oslo'); await p.press('#city', 'Enter'); await p.waitForTimeout(100); assert.ok((await p.textContent('#now')).includes('Oslo')); },
};

(async () => {
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-proxy-server'] });
  let n = 0;
  try {
    for (const c of cat) {
      for (const mode of ['direct', 'sandboxed']) {
        const ctx = await b.newContext({ viewport: { width: 900, height: 640 } }), p = await ctx.newPage(), errs = [];
        p.on('pageerror', e => errs.push('pageerror: ' + e.message));
        p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
        p.on('requestfailed', r => errs.push('failed: ' + r.url()));
        p.on('response', r => { if (r.status() >= 400) errs.push(`${r.status()}: ${r.url()}`); });
        const url = `http://127.0.0.1:${PORT}/starters/${c.id}/index.html`;
        if (mode === 'direct') await p.goto(url);
        else {   // like the Design flow's play pane: sandbox="allow-scripts", no same-origin
          await p.goto(`http://127.0.0.1:${PORT}/starters/catalog.json`);
          await p.setContent(`<iframe id="f" sandbox="allow-scripts" src="${url}" style="width:880px;height:600px;border:0"></iframe>`);
          await p.waitForTimeout(150);
        }
        const fr = mode === 'direct' ? p : p.frameLocator('#f');
        const root = mode === 'direct' ? p.locator('body') : fr.locator('body');
        await root.waitFor({ timeout: 8000 });
        await p.waitForTimeout(400);
        const drawn = await root.evaluate(body => { const cv = body.querySelector('canvas'); if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4 * 97) if (d[i]) return true; return !!body.innerText.trim(); } return body.innerText.trim().length > 3; });
        assert.ok(drawn, `${c.id} (${mode}): nothing drawn`);
        if (mode === 'direct' && POKE[c.id]) { await p.click('body', { position: { x: 5, y: 5 } }).catch(() => {}); await POKE[c.id](p); await p.waitForTimeout(250); }
        assert.deepStrictEqual(errs, [], `${c.id} (${mode}): ${errs.join(' | ')}`);
        await ctx.close(); n++;
      }
      process.stdout.write('.');
    }
  } finally { await b.close(); srv.close(); }
  console.log(`\nstarters_test: ${cat.length} starters, ${n} page loads, no console errors`);
})().catch(e => { console.error(e); process.exit(1); });
