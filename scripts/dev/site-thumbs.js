#!/usr/bin/env node
// Gallery thumbnails for the website templates: renders each templates/sites/<id> into a temp folder (the same
// copy a project gets), serves it, and screenshots it with Playwright into templates/sites/<id>/thumb.png.
// Also writes a contact sheet of all of them. Usage: node scripts/dev/site-thumbs.js [id ...] [--sheet out.png] [--phone]
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const ROOT = path.join(__dirname, '..', '..');
const lib = require(path.join(ROOT, 'server', 'sitelib.js'))({ P: { get: () => null }, W: {}, root: ROOT });

const args = process.argv.slice(2);
const sheetAt = args.indexOf('--sheet'); const sheet = sheetAt >= 0 ? args[sheetAt + 1] : null;
const phone = args.includes('--phone');
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sheet');
const all = lib.catalog().map(t => t.id).filter(id => !ids.length || ids.includes(id));

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' };
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-thumbs-'));
  for (const id of all) lib.copyInto(id, path.join(tmp, id), lib.freshData(id));
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(tmp, p); if (!f.startsWith(tmp) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = srv.address().port;
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const vp = phone ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const pg = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  pg.on('pageerror', e => errs.push(`${pg.url()}: ${e.message}`));
  pg.on('console', m => { if (m.type() === 'error') errs.push(`${pg.url()}: ${m.text()}`); });
  const shots = [];
  for (const id of all) {
    await pg.goto(`http://localhost:${port}/${id}/`, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts && document.fonts.ready);
    await pg.waitForTimeout(250);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) errs.push(`${id}: ${over}px sideways scroll at ${innerWidth}px`);
    const out = phone ? path.join(tmp, `${id}-phone.png`) : path.join(ROOT, 'templates', 'sites', id, 'thumb.png');
    if (phone) await pg.screenshot({ path: out, fullPage: false });
    else { await pg.screenshot({ path: path.join(tmp, id + '-full.png') }); await pg.setViewportSize({ width: 1280, height: 800 }); await pg.screenshot({ path: out, clip: { x: 0, y: 0, width: 1280, height: 800 }, scale: 'css' }); }
    shots.push({ id, out });
  }
  if (!phone) {   // shrink the thumbs to 640×400
    for (const s of shots) { const p2 = await b.newPage({ viewport: { width: 640, height: 400 } }); await p2.setContent(`<body style="margin:0"><img src="data:image/png;base64,${fs.readFileSync(s.out).toString('base64')}" style="width:640px;height:400px;display:block">`); await p2.screenshot({ path: s.out }); await p2.close(); }
  }
  if (sheet) {
    const w = phone ? 195 : 320, h = phone ? 422 : 200, cols = phone ? 8 : 4;
    const cells = shots.map(s => `<figure><img src="data:image/png;base64,${fs.readFileSync(s.out).toString('base64')}"><figcaption>${s.id}</figcaption></figure>`).join('');
    const sp = await b.newPage({ viewport: { width: cols * (w + 12) + 12, height: 600 } });
    await sp.setContent(`<style>body{margin:0;padding:12px;background:#ddd;font:12px system-ui;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:12px}figure{margin:0}img{width:${w}px;height:${h}px;display:block;object-fit:cover;object-position:top;border:1px solid #999}figcaption{padding:3px 0}</style>${cells}`);
    await sp.screenshot({ path: sheet, fullPage: true });
  }
  await b.close(); srv.close();
  if (errs.length) { console.log('problems:\n' + errs.join('\n')); process.exitCode = 1; }
  console.log(`rendered ${shots.length} (${tmp})`);
})().catch(e => { console.error(e); process.exit(1); });
