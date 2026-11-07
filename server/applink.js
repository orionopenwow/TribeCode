// App links: a stable, private address for one project's live app, made to live on a Home Screen.
//
//   /app/<key>/                       a full-screen launcher page: the project's live preview in a sandboxed iframe
//   /app/<key>/manifest.webmanifest   name = project name, icons = project picture or initials, theme = project color
//   /app/<key>/icon-<size>.png        generated PNG (initials on the project color) or the project picture
//
// Why a separate key: preview links (server/preview.js) expire after ~2 h, and a Home Screen icon must keep working.
// The key is not the member's token: it only opens this one project's preview (read-only, sandboxed), never the API.
// Every launch mints a fresh signed preview token for the key's member, so access is re-checked each time: when the
// member leaves the project, is removed, or turns the link off, the icon stops working.
// Keys are deterministic per (project, member, generation): asking again returns the same URL, so an icon added
// yesterday and the one added today point at the same place. "Turn off" bumps the generation (a new URL next time).
// Only SHA-256 hashes of keys are stored, in .tribe/applinks.json.
//
// API (members of the project, not agents):
//   POST   /api/applink        -> { key, path, name, color, icon }      the current project's link for me
//   DELETE /api/applink        -> { ok }                                turn my link to this project off
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const KEY_RE = /^[A-Za-z0-9_-]{32}$/;
const TTL_MS = Number(process.env.TRIBE_APPLINK_TTL_MS) || 12 * 3600_000;
const SANDBOX = 'allow-scripts allow-forms allow-pointer-lock allow-popups';
const CANVAS = '#12151A';

// ---------- a tiny PNG painter (zero dependencies): initials on a flat color ----------
const FONT = {
  A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
  D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
  G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '01110,00100,00100,00100,00100,00100,01110',
  J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110',
  P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001',
  S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100', U: '10001,10001,10001,10001,10001,10001,01110',
  V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001',
  Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111', 0: '01110,10001,10011,10101,11001,10001,01110',
  1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111', 3: '11111,00010,00100,00010,00001,10001,01110',
  4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110', 6: '00110,01000,10000,11110,10001,10001,01110',
  7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110', 9: '01110,10001,10001,01111,00001,00010,01100',
  '?': '01110,10001,00001,00010,00100,00000,00100',
};
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const rgb = hex => { const h = String(hex || '#F26B1D').replace('#', ''); const n = parseInt(/^[0-9a-f]{6}$/i.test(h) ? h : 'F26B1D', 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const inkOf = hex => { const [r, g, b] = rgb(hex); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? CANVAS : '#FFFFFF'; };
const initialsOf = name => {
  const words = String(name || '').toUpperCase().replace(/[-_.]+/g, ' ').split(/\s+/).map(w => w.replace(/[^A-Z0-9]/g, '')).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)) || '?';
};
function pngInitials(size, color, text) {
  const bg = rgb(color), fg = rgb(inkOf(color));
  const glyphs = [...String(text || '?')].slice(0, 2).map(ch => (FONT[ch] || FONT['?']).split(',').map(r => [...r].map(Number)));
  const units = glyphs.length * 5 + (glyphs.length - 1);   // 5 columns per glyph, 1 column gap
  const scale = Math.max(1, Math.floor((size * (glyphs.length > 1 ? 0.52 : 0.36)) / units));
  const w = units * scale, h = 7 * scale, x0 = Math.floor((size - w) / 2), y0 = Math.floor((size - h) / 2);
  const row = size * 3 + 1, raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < size; x++) {
      let on = false;
      const gx = x - x0, gy = y - y0;
      if (gx >= 0 && gy >= 0 && gx < w && gy < h) {
        const ux = Math.floor(gx / scale), uy = Math.floor(gy / scale), gi = Math.floor(ux / 6), col = ux % 6;
        on = col < 5 && !!(glyphs[gi] && glyphs[gi][uy][col]);
      }
      const c = on ? fg : bg, o = y * row + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// A Windows .ico that wraps one PNG (Vista and later read PNG-in-ICO).
function icoFromPng(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = size >= 256 ? 0 : size; head[7] = size >= 256 ? 0 : size; head[8] = 0; head[9] = 0;
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = function applink({ P, store, getMembers, preview, shareBase = () => null, log = () => {} }) {
  // ---------- secret + records ----------
  const SECRET_FILE = '.tribe/applink-secret';
  let secret = null;
  try { secret = Buffer.from(fs.readFileSync(store.p(SECRET_FILE), 'utf8').trim(), 'hex'); } catch {}
  if (!secret || secret.length < 32) {
    secret = crypto.randomBytes(32);
    try { fs.mkdirSync(path.dirname(store.p(SECRET_FILE)), { recursive: true }); fs.writeFileSync(store.p(SECRET_FILE), secret.toString('hex'), { mode: 0o600 }); } catch (e) { log('applink secret not saved: ' + e.message); }
  }
  const FILE = '.tribe/applinks.json';
  let data = store.readJSON(FILE, null) || {};
  if (!Array.isArray(data.links)) data.links = [];
  if (!data.gens || typeof data.gens !== 'object') data.gens = {};
  const save = () => store.writeJSON(FILE, data);
  const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
  const keyFor = (pid, mid, gen) => crypto.createHmac('sha256', secret).update(`applink:${pid}:${mid}:${gen}`).digest('base64url').slice(0, 32);
  const memberById = mid => getMembers().find(m => m.id === mid) || null;

  function ensure(pid, member) {
    const pair = `${pid}:${member.id}`;
    let rec = data.links.find(l => l.project === pid && l.member === member.id);
    if (!rec) {
      const gen = (Number(data.gens[pair]) || 0) + 1; data.gens[pair] = gen;
      rec = { id: 'a-' + crypto.randomBytes(5).toString('hex'), project: pid, member: member.id, gen, keyHash: sha(keyFor(pid, member.id, gen)), created: new Date().toISOString(), lastUsed: null };
      data.links.push(rec); save();
    }
    const key = keyFor(pid, member.id, rec.gen);
    return { key, path: `/app/${key}/`, record: rec };
  }
  function revoke(pid, mid) {
    const before = data.links.length;
    data.links = data.links.filter(l => !(l.project === pid && l.member === mid));
    if (data.links.length !== before) save();
    return before - data.links.length;
  }
  // -> { rec, project, member } or null
  function resolve(key) {
    if (!KEY_RE.test(key || '')) return null;
    const kh = sha(key);
    const rec = data.links.find(l => l.keyHash === kh);
    if (!rec) return null;
    const project = P.get(rec.project), member = memberById(rec.member);
    if (!project || !member || member.role === 'agent' || !P.canSee(member, project.id)) return null;
    return { rec, project, member };
  }

  // ---------- icons ----------
  const pictureOf = p => {
    const m = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(p && p.image || '');
    return m ? { type: m[1], buf: Buffer.from(m[3], 'base64') } : null;
  };
  const pngSize = buf => (buf.length > 24 && buf.readUInt32BE(12) === 0x49484452 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);
  const iconCache = new Map();
  function iconPng(p, size) {
    const k = `${p.id}:${size}:${p.color}:${p.name}`;
    if (!iconCache.has(k)) { if (iconCache.size > 200) iconCache.clear(); iconCache.set(k, pngInitials(size, p.color || '#F26B1D', initialsOf(p.name))); }
    return iconCache.get(k);
  }
  // The icon used for desktop shortcuts and the Home Screen: the project picture when it is a PNG or JPEG, else initials.
  function iconFor(p, size = 256) {
    const pic = pictureOf(p);
    if (pic && (pic.type === 'image/png' || pic.type === 'image/jpeg')) return pic;
    return { type: 'image/png', buf: iconPng(p, size) };
  }
  function manifest(p, key) {
    const scope = `/app/${key}/`, pic = pictureOf(p), dims = pic && pic.type === 'image/png' ? pngSize(pic.buf) : null;
    const icons = [];
    if (pic) icons.push({ src: `${scope}picture`, type: pic.type, sizes: dims ? `${dims[0]}x${dims[1]}` : 'any', purpose: 'any' });
    icons.push({ src: `${scope}icon-192.png`, type: 'image/png', sizes: '192x192', purpose: 'any maskable' }, { src: `${scope}icon-512.png`, type: 'image/png', sizes: '512x512', purpose: 'any maskable' });
    return { id: scope, name: p.name, short_name: String(p.name).slice(0, 12), description: `${p.name}, live from TribeCode`, start_url: scope, scope,
      display: 'fullscreen', display_override: ['fullscreen', 'standalone'], orientation: 'any', background_color: CANVAS, theme_color: p.color || '#F26B1D', icons };
  }

  // ---------- the launcher page ----------
  function launcher(p, member, key) {
    const t = preview.mint(p.id, member, TTL_MS);
    const src = `/preview/${p.id}/${t.pt}/`, exp = Date.parse(t.expires), nonce = crypto.randomBytes(12).toString('base64');
    const pic = pictureOf(p), touch = pic && (pic.type === 'image/png' || pic.type === 'image/jpeg') ? 'picture' : 'icon-180.png';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(p.name)}</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="${touch}">
<link rel="icon" href="icon-192.png">
<meta name="theme-color" content="${esc(p.color || '#F26B1D')}">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(String(p.name).slice(0, 24))}">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<style nonce="${nonce}">
html,body{margin:0;height:100%;background:${CANVAS};overflow:hidden}
#app{position:fixed;top:env(safe-area-inset-top);left:0;right:0;bottom:0;width:100%;height:calc(100% - env(safe-area-inset-top));border:0;display:block;background:#FFFFFF}
#tip{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #2A313C;border-radius:12px;background:#1B2028;color:#F8FAFC;font:13px/1.45 Inter,system-ui,sans-serif}
#tip[hidden]{display:none}#tip b{font-weight:600}#tip span{flex:1;min-width:0}#tip small{display:block;color:#94A3B8;font-size:12px}
#tip button{flex:none;font:600 12.5px Inter,system-ui,sans-serif;border-radius:8px;padding:7px 11px;cursor:pointer;border:1px solid #2A313C;background:#222833;color:#F8FAFC}
#tip button.go{background:#F26B1D;border-color:#F26B1D;color:#FFFFFF}
</style></head><body>
<iframe id="app" src="${esc(src)}" sandbox="${SANDBOX}" allow="fullscreen; gamepad; autoplay" referrerpolicy="no-referrer" title="${esc(p.name)}"></iframe>
<div id="tip" role="note" hidden><span id="tip-t"></span><button class="go" id="tip-go" hidden>Install</button><button id="tip-x" aria-label="Dismiss">Got it</button></div>
<script nonce="${nonce}">(function(){
var exp=${exp};
function stale(){return Date.now()>exp-120000}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&stale())location.reload()});
window.addEventListener('pageshow',function(e){if(e.persisted&&stale())location.reload()});
var standalone=(window.matchMedia&&(matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches))||navigator.standalone===true;
var seen=false;try{seen=localStorage.getItem('tc.tip')==='1'}catch(e){}
if(standalone||seen||/[?&]tip=0/.test(location.search))return;
var ua=navigator.userAgent,ios=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1),android=/Android/.test(ua);
var t=document.getElementById('tip'),tt=document.getElementById('tip-t'),go=document.getElementById('tip-go');
tt.innerHTML=ios?'<b>Add to Home Screen</b><small>Tap Share, then Add to Home Screen.</small>':android?'<b>Add to Home screen</b><small>Tap \\u22EE, then Add to Home screen.</small>':'<b>Keep this app one tap away</b><small>Install it from the address bar, or bookmark this page.</small>';
t.hidden=false;
var prompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();prompt=e;go.hidden=false});
go.onclick=function(){if(prompt){prompt.prompt();prompt=null;go.hidden=true}};
document.getElementById('tip-x').onclick=function(){t.hidden=true;try{localStorage.setItem('tc.tip','1')}catch(e){}};
})();</script>
</body></html>`;
    return { html, nonce };
  }
  function notice(res, status, title, text) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:#12151A;color:#94A3B8;font:14px/1.6 Inter,system-ui,sans-serif}body{display:grid;place-items:center;padding:16px;box-sizing:border-box}
div{max-width:46ch;border:1px solid #2A313C;background:#1B2028;border-radius:12px;padding:20px 22px}small{font:10.5px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6B7A90}h1{margin:4px 0 8px;font-size:18px;color:#F8FAFC}</style>
<div><small>TribeCode app</small><h1>${esc(title)}</h1><p>${esc(text)}</p></div>`);
  }

  // GET /app/<key>/… -> true when handled
  function serve(req, res, url) {
    const mm = /^\/app\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!mm) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return true; }
    const key = mm[1], rest = mm[2];
    const hit = resolve(key);
    if (!hit) { notice(res, 404, 'This shortcut is turned off', 'Ask a friend in the project for a new one, or open TribeCode and add the app to your Home Screen again.'); return true; }
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' };
    if (!rest) { res.writeHead(302, { ...headers, Location: `/app/${key}/${url.search}` }); res.end(); return true; }
    const { rec, project: p, member } = hit;
    const img = (type, buf) => { res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : buf); return true; };
    if (rest === '/manifest.webmanifest') {
      const body = Buffer.from(JSON.stringify(manifest(p, key), null, 2));
      res.writeHead(200, { ...headers, 'Content-Type': 'application/manifest+json', 'Content-Length': body.length }); res.end(req.method === 'HEAD' ? undefined : body); return true;
    }
    const ic = /^\/icon-(180|192|512)\.png$/.exec(rest);
    if (ic) return img('image/png', iconPng(p, Number(ic[1])));
    if (rest === '/picture') { const pic = pictureOf(p); if (pic) return img(pic.type, pic.buf); return img('image/png', iconPng(p, 512)); }
    if (rest === '/' || rest === '/index.html') {
      const { html, nonce } = launcher(p, member, key);
      rec.lastUsed = new Date().toISOString(); save();
      const body = Buffer.from(html);
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length,
        'Content-Security-Policy': `default-src 'none'; frame-src 'self'; img-src 'self' data:; manifest-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'` });
      res.end(req.method === 'HEAD' ? undefined : body); return true;
    }
    notice(res, 404, 'Not found', 'There is nothing at this address.'); return true;
  }

  // ---------- API ----------
  async function route(req, res, { m, me, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'agent') return fail(res, 403, 'agents cannot make app shortcuts');
    const pid = P.current() || P.defaultId(), p = P.get(pid);
    if (!p || !P.canSee(me, pid)) return fail(res, 404, 'project not found');
    if (m === 'POST') { const r = ensure(pid, me), sb = shareBase(); return send(res, 200, { key: r.key, path: r.path, share: sb ? sb.replace(/\/+$/, '') + r.path : null, name: p.name, color: p.color, icon: `${r.path}icon-192.png`, project: pid }); }
    if (m === 'DELETE') return send(res, 200, { ok: true, removed: revoke(pid, me.id) });
    return null;
  }

  return { serve, route, ensure, revoke, resolve, iconFor, iconPng: (p, size) => iconPng(p, size), manifest };
};
module.exports.pngInitials = pngInitials;
module.exports.icoFromPng = icoFromPng;
module.exports.initialsOf = initialsOf;
