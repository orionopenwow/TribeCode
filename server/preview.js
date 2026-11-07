// App preview: the app the tribe is building, live, inside TribeCode and in any browser tab (phones too).
//
//   /preview/<projectId>/<pt>/<path>   the project's app. <pt> is a short-lived signed preview token.
//   /preview/<projectId>/<path>?pt=…   same, redirected to the path form so relative URLs keep the token.
//
// Static mode (default): files from the project's repo folder. The web root is the repo root when it has
// index.html, else the first of public/ dist/ build/ app/ web/ that has one (the host can pin another).
// Dev-server mode (host only): proxy to the project's own dev server on 127.0.0.1:<port> (http, that port
// only, no redirects to other hosts, websocket upgrades proxied for HMR).
//
// Security model
//  * Iframes and new tabs can't send headers, so the URL carries a token, but never the member's real key:
//    `pv1.<payload>.<hmac>` signed with a per-tribe secret, bound to one project and one member, valid ~2 h.
//    It is checked on every request, and the member must still be able to see the project.
//  * Every response carries `Content-Security-Policy: sandbox allow-scripts allow-forms allow-pointer-lock
//    allow-popups` (no allow-same-origin): previewed code runs in an opaque origin even in a top-level tab,
//    so it can never read TribeCode's localStorage, tokens or API with the viewer's credentials.
//  * Paths are resolved, real-pathed and must stay inside the web root. Dotfiles and dot folders (.git,
//    .tribe, .env), node_modules and key/secret files are never served.
//  * Live reload: the web root is watched (debounced); open previews get a `preview` WebSocket event and a
//    Server-Sent Event on /preview/<id>/<pt>/__tribe/live (works in plain tabs and on friends' phones).
//
// API (members of the project):
//   GET  /api/preview            -> { mode, root, candidates, hasIndex, port, canConfigure }
//   POST /api/preview/token      -> { url, path, share, shareKind, expires, mode, hasIndex }
//   PUT  /api/preview/settings   { root?: 'auto'|'<subfolder>', port?: number|null }   (host only)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');

const TTL_MS = Number(process.env.TRIBE_PREVIEW_TTL_MS) || 2 * 3600_000;
const CANDIDATES = ['', 'public', 'dist', 'build', 'app', 'web'];
const CSP = 'sandbox allow-scripts allow-forms allow-pointer-lock allow-popups';
const RESERVED = '__tribe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'text/plain; charset=utf-8', '.ldtk': 'application/json; charset=utf-8', '.tmj': 'application/json; charset=utf-8',
};
// Never served, wherever they sit: key material and credentials.
const SECRET = /^(id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|.*\.(pem|key|p12|pfx|keystore|jks|kdbx|asc|gpg)|credentials(\..*)?|secrets?(\..*)?|.*\.sqlite3?|.*\.db)$/i;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PT_RE = /^pv1\.[A-Za-z0-9_-]{10,400}\.[A-Za-z0-9_-]{20,100}$/;

// Injected at the top of previewed HTML pages: storage that works in the sandbox, live reload (SSE),
// "ready" and screenshots for the TribeCode pane (postMessage to the parent; it checks event.source).
const HELPER = `<script data-tribe-preview>(function(){
var mem=function(){var d={};return{getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[String(k)]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}};
['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('x')}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});
var m=location.pathname.match(/^\\/preview\\/[a-z0-9-]+\\/pv1\\.[^/]+\\//);
if(m&&window.EventSource){try{var es=new EventSource(m[0]+'${RESERVED}/live');es.onmessage=function(e){if(e.data==='reload')location.reload()}}catch(_){}}
var up=window.parent!==window?window.parent:null;
function say(o){if(up)try{up.postMessage(o,'*')}catch(_){}}
function ready(){say({tc:'ready',title:document.title,href:location.pathname})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
function toData(u){return fetch(u).then(function(r){return r.blob()}).then(function(b){return new Promise(function(res){var f=new FileReader();f.onload=function(){res(f.result)};f.onerror=function(){res(u)};f.readAsDataURL(b)})}).catch(function(){return u})}
function bigCanvas(){var best=null,a=0;[].forEach.call(document.querySelectorAll('canvas'),function(c){var r=c.getBoundingClientRect(),s=r.width*r.height;if(s>a){a=s;best=c}});return best}
function page(w,h){var src=[].slice.call(document.querySelectorAll('canvas')),clone=document.documentElement.cloneNode(true),dst=clone.querySelectorAll('canvas');
src.forEach(function(c,i){var d=dst[i];if(!d)return;try{var img=document.createElement('img');img.src=c.toDataURL('image/png');img.className=c.className;img.id=c.id;var cs=getComputedStyle(c),r=c.getBoundingClientRect();img.setAttribute('style',['background-color','border','border-radius','display','margin','box-sizing','image-rendering'].map(function(p){return p+':'+cs.getPropertyValue(p)}).join(';')+';width:'+r.width+'px;height:'+r.height+'px');d.parentNode.replaceChild(img,d)}catch(_){}});
[].forEach.call(clone.querySelectorAll('script,[data-tribe-preview],iframe'),function(s){s.remove()});
var jobs=[].map.call(clone.querySelectorAll('link[rel~=stylesheet][href]'),function(l){return fetch(l.href).then(function(r){return r.text()}).then(function(t){var s=document.createElement('style');s.textContent=t;l.parentNode.replaceChild(s,l)}).catch(function(){})});
jobs=jobs.concat([].map.call(clone.querySelectorAll('img[src]'),function(i){if(/^data:/.test(i.getAttribute('src')))return null;return toData(i.src).then(function(d){i.setAttribute('src',d)})}));
return Promise.all(jobs).then(function(){var html=new XMLSerializer().serializeToString(clone);
var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><foreignObject x="0" y="'+(-window.scrollY)+'" width="'+w+'" height="'+Math.max(h,document.documentElement.scrollHeight)+'">'+html+'</foreignObject></svg>';
return new Promise(function(res,rej){var im=new Image();im.onload=function(){try{var cv=document.createElement('canvas');cv.width=w;cv.height=h;var g=cv.getContext('2d');g.fillStyle=getComputedStyle(document.body).backgroundColor||'#fff';g.fillRect(0,0,w,h);g.drawImage(im,0,0);res(cv.toDataURL('image/png'))}catch(e){rej(e)}};im.onerror=function(){rej(new Error('render failed'))};im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)})})}
function shot(){var w=Math.min(window.innerWidth,2400),h=Math.min(window.innerHeight,2400);return page(w,h).catch(function(){var c=bigCanvas();if(!c)throw new Error('nothing to capture');return c.toDataURL('image/png')})}
window.addEventListener('message',function(e){if(!up||e.source!==up||!e.data||e.data.tc!=='shot')return;var id=e.data.id;shot().then(function(d){say({tc:'shot',id:id,data:d})},function(err){say({tc:'shot',id:id,error:String(err&&err.message||err)})})});
})();</script>`;

module.exports = function preview({ P, store, getMembers, broadcast, share, lanUrls = () => [], port: tribePort, log = () => {} }) {
  // ---------- per-tribe secret + per-project settings (kept apart from projects.js) ----------
  const SECRET_FILE = '.tribe/preview-secret';
  let key = null;
  try { key = Buffer.from(fs.readFileSync(store.p(SECRET_FILE), 'utf8').trim(), 'hex'); } catch {}
  if (!key || key.length < 32) {
    key = crypto.randomBytes(32);
    try { fs.mkdirSync(path.dirname(store.p(SECRET_FILE)), { recursive: true }); fs.writeFileSync(store.p(SECRET_FILE), key.toString('hex'), { mode: 0o600 }); } catch (e) { log('preview secret not saved: ' + e.message); }
  }
  const SETTINGS = '.tribe/preview.json';
  let settings = store.readJSON(SETTINGS, {});
  const settingsOf = pid => settings[pid] || {};
  const saveSettings = () => store.writeJSON(SETTINGS, settings);

  // ---------- tokens ----------
  const b64 = b => Buffer.from(b).toString('base64url');
  const sign = s => crypto.createHmac('sha256', key).update('preview:' + s).digest('base64url');
  function mint(pid, member, ttl = TTL_MS) {
    const exp = Date.now() + ttl;
    const body = b64(JSON.stringify({ p: pid, m: member.id, e: exp }));
    return { pt: `pv1.${body}.${sign(body)}`, expires: new Date(exp).toISOString() };
  }
  // -> { member, pid } or { error, status }
  function verify(pt, pid) {
    if (typeof pt !== 'string' || !PT_RE.test(pt)) return { status: 403, error: 'preview link missing or malformed' };
    const [, body, mac] = pt.split('.');
    const want = Buffer.from(sign(body)), got = Buffer.from(mac);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { status: 403, error: 'preview link is not valid' };
    let d; try { d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return { status: 403, error: 'preview link is not valid' }; }
    if (!d || d.p !== pid) return { status: 403, error: 'this preview link is for another project' };
    if (!(Number(d.e) > Date.now())) return { status: 403, error: 'this preview link expired: open the preview again for a fresh one' };
    const member = getMembers().find(x => x.id === d.m);
    if (!member || (member.role === 'agent' && !member.tokenHash)) return { status: 403, error: 'this preview link is no longer valid' };
    if (!P.canSee(member, pid)) return { status: 403, error: 'you are not in this project' };
    return { member, pid };
  }

  // ---------- web root ----------
  const hasIndex = dir => { try { return fs.statSync(path.join(dir, 'index.html')).isFile(); } catch { return false; } };
  const okSub = s => typeof s === 'string' && s.length <= 120 && !s.split(/[\\/]/).some(seg => seg === '..' || seg.startsWith('.') || seg === 'node_modules') && !path.isAbsolute(s);
  function rootOf(pid) {
    const p = P.get(pid); const repo = p && p.repo;
    if (!repo) return { repo: null, root: null, sub: null, candidates: [] };
    const candidates = CANDIDATES.filter(c => hasIndex(path.join(repo, c)));
    const pinned = settingsOf(pid).root;
    let sub = null;
    if (pinned && pinned !== 'auto' && okSub(pinned)) sub = pinned.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    else if (candidates.length) sub = candidates[0];
    const root = sub === null ? null : path.resolve(repo, sub || '.');
    if (root && !(root === path.resolve(repo) || root.startsWith(path.resolve(repo) + path.sep))) return { repo, root: null, sub: null, candidates };
    return { repo, root, sub, candidates };
  }
  const modeOf = pid => (settingsOf(pid).port ? 'dev' : 'static');
  function status(pid, me) {
    const r = rootOf(pid), s = settingsOf(pid), mode = modeOf(pid);
    return { project: pid, mode, port: s.port || null, root: r.sub === null ? null : r.sub || '.', pinned: s.root || 'auto', candidates: r.candidates.map(c => c || '.'),
      hasRepo: !!r.repo, hasIndex: mode === 'dev' ? true : !!(r.root && hasIndex(r.root)), canConfigure: canConfigure(me, pid) };
  }
  const canConfigure = (me, pid) => !!me && me.role !== 'agent' && (me.role === 'host' || ((P.get(pid) || {}).members || {})[me.id] === 'host');

  // ---------- live reload: watch the web root, tell open previews ----------
  const watchers = new Map();   // pid -> { root, w, until, timer }
  const sse = new Map();        // pid -> Set(res)
  function watch(pid) {
    const r = rootOf(pid), dir = modeOf(pid) === 'dev' ? r.repo : r.root || r.repo;   // no web root yet: watch the repo for one
    const cur = watchers.get(pid);
    if (cur && cur.root === dir) { cur.until = Date.now() + TTL_MS + 600_000; return; }
    if (cur) { try { cur.w.close(); } catch {} watchers.delete(pid); }
    if (!dir) return;
    const entry = { root: dir, until: Date.now() + TTL_MS + 600_000, timer: null, files: new Set() };
    const fire = f => {
      if (f && /(^|[\\/])(\.git|\.tribe|node_modules)([\\/]|$)/.test(f)) return;
      if (f) entry.files.add(String(f).replace(/\\/g, '/'));
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        const files = [...entry.files].slice(0, 20); entry.files.clear();
        const now = rootOf(pid), want = modeOf(pid) === 'dev' ? now.repo : now.root || now.repo;
        if (want !== entry.root) { try { entry.w.close(); } catch {} watchers.delete(pid); watch(pid); }   // index.html appeared (or moved)
        changed(pid, files);
      }, 250);
    };
    entry.w = watchTree(dir, fire, !(r.root || modeOf(pid) === 'dev'));
    if (!entry.w) return;
    watchers.set(pid, entry);
  }
  // Recursive where cheap. A folder with node_modules (or no web root yet) gets the top level plus each
  // ordinary subfolder, so huge dependency trees never eat the host's file watchers.
  function watchTree(dir, fire, shallow) {
    const list = [];
    const add = (d, rec, prefix) => { try { const w = fs.watch(d, { recursive: rec }, (_, f) => fire(f && prefix + f)); w.on('error', () => {}); list.push(w); return true; } catch { return false; } };
    let heavy = shallow; try { heavy = heavy || fs.existsSync(path.join(dir, 'node_modules')); } catch {}
    if (!heavy) { if (!add(dir, true, '') && !add(dir, false, '')) { log('preview: cannot watch ' + dir); return null; } }
    else {
      if (!add(dir, false, '')) { log('preview: cannot watch ' + dir); return null; }
      let subs = []; try { subs = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules'); } catch {}
      for (const e of subs.slice(0, 40)) add(path.join(dir, e.name), !shallow, e.name + '/');
    }
    return { close: () => list.forEach(w => { try { w.close(); } catch {} }) };
  }
  function changed(pid, files = []) {
    broadcast({ type: 'preview', project: pid, at: new Date().toISOString(), files });
    for (const res of sse.get(pid) || []) { try { res.write('data: reload\n\n'); } catch {} }
  }
  setInterval(() => {
    for (const [pid, e] of watchers) if (e.until < Date.now() && !(sse.get(pid) || new Set()).size) { try { e.w.close(); } catch {} watchers.delete(pid); }
    for (const set of sse.values()) for (const res of set) { try { res.write(': ping\n\n'); } catch {} }
  }, 25_000).unref();

  // ---------- links ----------
  const pathFor = (pid, pt) => `/preview/${pid}/${pt}/`;
  function links(pid, pt, req) {
    const p = pathFor(pid, pt);
    const pub = share && share.publicUrl && share.publicUrl();
    const lan = (lanUrls().find(u => u.kind === 'lan') || lanUrls()[0] || {}).url;
    const shareBase = pub || lan || null;
    return { path: p, share: shareBase ? shareBase.replace(/\/+$/, '') + p : null, shareKind: pub ? 'public' : lan ? 'wifi' : null,
      local: `http://localhost:${tribePort}${p}` };
  }

  // ---------- HTTP: serving ----------
  const baseHeaders = mode => ({ 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*',
    'Referrer-Policy': mode === 'dev' ? 'unsafe-url' : 'no-referrer', 'X-Robots-Tag': 'noindex', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  function page(res, status, title, text, extra = {}) {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    res.writeHead(status, { ...baseHeaders('static'), 'Content-Type': 'text/html; charset=utf-8', ...extra });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:#12151A;color:#94A3B8;font:14px/1.6 Inter,system-ui,sans-serif}body{display:grid;place-items:center;padding:16px;box-sizing:border-box}
div{max-width:46ch;border:1px solid #2A313C;background:#1B2028;border-radius:12px;padding:20px 22px}small{font:10.5px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6B7A90}
h1{margin:4px 0 8px;font-size:18px;color:#F8FAFC}code{font:12.5px ui-monospace,monospace;color:#F8FAFC;background:#12151A;border:1px solid #2A313C;border-radius:6px;padding:1px 6px}</style>
<div><small>Preview</small><h1>${esc(title)}</h1><p>${text}</p></div>`);
  }
  const deny = (res, status, msg) => page(res, status, status === 404 ? 'Not found' : 'No access', msg);
  function injectHelper(html) {
    const s = String(html);
    const m = /<head\b[^>]*>/i.exec(s);
    if (m) return s.slice(0, m.index + m[0].length) + HELPER + s.slice(m.index + m[0].length);
    const h = /<html\b[^>]*>/i.exec(s);
    if (h) return s.slice(0, h.index + h[0].length) + HELPER + s.slice(h.index + h[0].length);
    return HELPER + s;
  }

  // Which preview a request belongs to: /preview/<pid>/<pt>/… or (dev mode, absolute paths like /@vite/client)
  // a request whose Referer is such a preview page.
  function parse(url) {
    const m = /^\/preview\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
    if (!m) return null;
    const pid = m[1], rest = m[2];
    if (!ID_RE.test(pid)) return { pid: null };
    if (rest === undefined) return { pid, pt: url.searchParams.get('pt'), rest: null, bare: true };
    const seg = rest.split('/')[0];
    if (seg.startsWith('pv1.')) return { pid, pt: seg, rest: rest.slice(seg.length + 1), prefix: `/preview/${pid}/${seg}/` };
    return { pid, pt: url.searchParams.get('pt'), rest, legacy: true };
  }
  function fromReferer(req, url) {
    const ref = req.headers.referer; if (!ref || url.pathname.startsWith('/api/') || url.pathname === '/mcp' || url.pathname === '/ws') return null;
    let r; try { r = new URL(ref); } catch { return null; }
    if (r.host !== req.headers.host) return null;
    const m = /^\/preview\/([a-z0-9-]+)\/(pv1\.[^/]+)\//.exec(r.pathname);
    if (!m || modeOf(m[1]) !== 'dev') return null;
    return { pid: m[1], pt: m[2], rest: url.pathname.replace(/^\/+/, ''), prefix: `/preview/${m[1]}/${m[2]}/`, viaReferer: true };
  }
  function match(req, url) { return url.pathname.startsWith('/preview/') || !!fromReferer(req, url); }

  function serve(req, res, url) {
    const q = url.pathname.startsWith('/preview/') ? parse(url) : fromReferer(req, url);
    if (!q || !q.pid) return deny(res, 404, 'There is no preview here.');
    const v = verify(q.pt, q.pid);
    if (v.error) return deny(res, v.status, v.error);
    // ?pt= → path form, so the page's relative URLs carry the token.
    if (q.bare || q.legacy) {
      const sp = new URLSearchParams(url.search); sp.delete('pt'); const qs = sp.toString();
      res.writeHead(302, { ...baseHeaders('static'), Location: `/preview/${q.pid}/${q.pt}/${q.rest || ''}${qs ? '?' + qs : ''}` }); return res.end();
    }
    if (q.rest === `${RESERVED}/live`) return live(req, res, q.pid);
    if (modeOf(q.pid) === 'dev') return proxy(req, res, url, q);
    if (req.method !== 'GET' && req.method !== 'HEAD') return deny(res, 405, 'Static previews only answer GET.');
    return serveFile(req, res, url, q);
  }

  function live(req, res, pid) {
    const set = sse.get(pid) || new Set(); sse.set(pid, set);
    if (set.size >= 100) { res.writeHead(429); return res.end(); }
    res.writeHead(200, { ...baseHeaders('static'), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n'); set.add(res); watch(pid);
    req.on('close', () => set.delete(res));
  }

  function serveFile(req, res, url, q) {
    const r = rootOf(q.pid);
    if (!r.root || !hasIndex(r.root)) return page(res, 404, 'No index.html yet', 'This project has no web page to show yet. Ask your Claude to start one: an <code>index.html</code> at the repo root (or in <code>public/</code>).');
    let rel; try { rel = decodeURIComponent(q.rest || ''); } catch { return deny(res, 400, 'Bad path.'); }
    if (rel.includes('\0')) return deny(res, 400, 'Bad path.');
    const segs = rel.split(/[\\/]+/).filter(Boolean);
    if (segs.some(s => s === '..')) return deny(res, 403, 'That path leaves the app folder.');
    if (segs.some(s => s.startsWith('.') || s === 'node_modules' || s === RESERVED) || (segs.length && SECRET.test(segs[segs.length - 1]))) return deny(res, 404, 'Not found.');
    let realRoot; try { realRoot = fs.realpathSync(r.root); } catch { return deny(res, 404, 'Not found.'); }
    let file = path.resolve(realRoot, ...segs);
    const inside = f => f === realRoot || f.startsWith(realRoot + path.sep);
    if (!inside(file)) return deny(res, 403, 'That path leaves the app folder.');
    let st; try { file = fs.realpathSync(file); st = fs.statSync(file); } catch { return deny(res, 404, 'Not found.'); }
    if (!inside(file)) return deny(res, 403, 'That path leaves the app folder.');   // symlinks pointing out
    if (st.isDirectory()) {
      if (!url.pathname.endsWith('/')) { res.writeHead(301, { ...baseHeaders('static'), Location: url.pathname + '/' + url.search }); return res.end(); }
      file = path.join(file, 'index.html');
      try { st = fs.statSync(file); } catch { return deny(res, 404, 'Not found.'); }
    }
    if (!st.isFile()) return deny(res, 404, 'Not found.');
    const ext = path.extname(file).toLowerCase(), type = MIME[ext] || 'application/octet-stream';
    watch(q.pid);
    if (type.startsWith('text/html')) {
      if (st.size > 8 * 1024 * 1024) return deny(res, 413, 'This page is too large to preview.');
      return fs.readFile(file, 'utf8', (err, txt) => {
        if (err) return deny(res, 404, 'Not found.');
        const body = Buffer.from(injectHelper(txt));
        res.writeHead(200, { ...baseHeaders('static'), 'Content-Type': type, 'Content-Length': body.length });
        res.end(req.method === 'HEAD' ? undefined : body);
      });
    }
    res.writeHead(200, { ...baseHeaders('static'), 'Content-Type': type, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }

  // ---------- dev-server proxy: http to 127.0.0.1:<port> only ----------
  const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'proxy-authenticate']);
  const STRIP_REQ = new Set(['authorization', 'cookie', 'host', 'origin', 'referer', 'x-project', 'accept-encoding', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'cf-connecting-ip', 'tailscale-funnel-request']);
  function upstreamPath(url, q) {
    const sp = new URLSearchParams(url.search); sp.delete('pt'); const qs = sp.toString();
    return '/' + String(q.rest || '').replace(/^\/+/, '') + (qs ? '?' + qs : '');
  }
  function proxy(req, res, url, q) {
    const port = settingsOf(q.pid).port;
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && !STRIP_REQ.has(k)) headers[k] = v;
    headers.host = `127.0.0.1:${port}`; headers['accept-encoding'] = 'identity';
    const up = http.request({ host: '127.0.0.1', port, method: req.method, path: upstreamPath(url, q), headers, timeout: 30_000 }, ur => {
      const out = { ...baseHeaders('dev') };
      for (const [k, v] of Object.entries(ur.headers)) {
        if (HOP.has(k) || k === 'set-cookie' || k === 'content-length' || k === 'access-control-allow-origin' || k === 'content-security-policy-report-only') continue;
        if (k === 'content-security-policy') { out[k] = [].concat(v, CSP); continue; }
        if (k === 'x-content-type-options' || k === 'cache-control' || k === 'referrer-policy') continue;
        out[k] = v;
      }
      if (ur.headers.location) {
        const loc = String(ur.headers.location);
        let target; try { target = new URL(loc, `http://127.0.0.1:${port}${upstreamPath(url, q)}`); } catch { target = null; }
        const same = target && target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && Number(target.port || 80) === Number(port);
        if (!same) { ur.resume(); return page(res, 502, 'Redirect blocked', 'The dev server tried to send the preview to another address. Previews only follow redirects inside the dev server.'); }
        out.location = q.prefix + target.pathname.replace(/^\/+/, '') + target.search;
      }
      const ct = String(ur.headers['content-type'] || '');
      if (/text\/html/i.test(ct) && req.method !== 'HEAD' && !ur.headers['content-encoding']) {
        const chunks = []; let size = 0;
        ur.on('data', c => { size += c.length; if (size <= 8 * 1024 * 1024) chunks.push(c); });
        ur.on('end', () => { const body = size > 8 * 1024 * 1024 ? Buffer.concat(chunks) : Buffer.from(injectHelper(Buffer.concat(chunks).toString('utf8'))); res.writeHead(ur.statusCode, { ...out, 'content-length': body.length }); res.end(body); });
        ur.on('error', () => res.destroy());
        return;
      }
      res.writeHead(ur.statusCode, out); ur.pipe(res);
    });
    up.on('timeout', () => up.destroy(new Error('timeout')));
    up.on('error', e => { if (res.headersSent) return res.destroy();
      page(res, 502, `Nothing on port ${port} yet`, `The preview is set to this project's dev server, but nothing answers on <code>localhost:${port}</code> on the host computer. Start it there (for example <code>npm run dev</code>), then reload. ${e.code === 'ECONNREFUSED' ? '' : '(' + String(e.code || e.message).replace(/[<>&]/g, '') + ')'}`); });
    if (req.method === 'GET' || req.method === 'HEAD') up.end(); else req.pipe(up);
  }
  // Websocket upgrades for HMR (Vite, webpack-dev-server): /preview/<pid>/<pt>/… → 127.0.0.1:<port>/…
  function upgrade(req, sock, url) {
    if (!url.pathname.startsWith('/preview/')) return false;
    const q = parse(url);
    const fail = code => { try { sock.write(`HTTP/1.1 ${code} ${code === 403 ? 'Forbidden' : 'Not Found'}\r\n\r\n`); } catch {} sock.destroy(); return true; };
    if (!q || !q.pid || !q.prefix) return fail(404);
    const v = verify(q.pt, q.pid); if (v.error) return fail(403);
    const port = settingsOf(q.pid).port; if (!port) return fail(404);
    const up = net.connect(port, '127.0.0.1', () => {
      const lines = [`GET ${upstreamPath(url, q)} HTTP/1.1`, `Host: 127.0.0.1:${port}`];
      for (const [k, val] of Object.entries(req.headers)) if (!STRIP_REQ.has(k)) for (const x of [].concat(val)) lines.push(`${k}: ${x}`);
      up.write(lines.join('\r\n') + '\r\n\r\n');
      sock.pipe(up); up.pipe(sock);
    });
    const close = () => { sock.destroy(); up.destroy(); };
    up.on('error', close); sock.on('error', close); up.setTimeout(0);
    return true;
  }

  // ---------- API ----------
  async function route(req, res, { m, b, me, readBody, send, fail }) {
    const pid = P.current() || P.defaultId();
    if (!b && m === 'GET') return send(res, 200, { preview: status(pid, me) });
    if (b === 'token' && m === 'POST') {
      const t = mint(pid, me); watch(pid);
      return send(res, 200, { ...links(pid, t.pt, req), expires: t.expires, ...status(pid, me) });
    }
    if (b === 'settings' && (m === 'PUT' || m === 'POST')) {
      if (!canConfigure(me, pid)) return fail(res, 403, 'only the host can change how the preview runs');
      const body = await readBody(req);
      const cur = { ...settingsOf(pid) };
      if (body.root !== undefined) {
        if (body.root === 'auto' || body.root === null || body.root === '') delete cur.root;
        else if (okSub(String(body.root))) cur.root = String(body.root).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') || '.';
        else return fail(res, 400, 'the web root must be a folder inside the repo');
        if (cur.root === '.') cur.root = '';
      }
      if (body.port !== undefined) {
        if (body.port === null || body.port === '' || body.port === 0) delete cur.port;
        else {
          const n = Number(body.port);
          if (!Number.isInteger(n) || n < 1024 || n > 65535) return fail(res, 400, 'pick a port between 1024 and 65535');
          if (n === Number(tribePort)) return fail(res, 400, 'that is TribeCode\'s own port');
          cur.port = n;
        }
      }
      if (cur.root === undefined) delete cur.root;
      settings[pid] = cur; if (!Object.keys(cur).length) delete settings[pid];
      saveSettings();
      const w = watchers.get(pid); if (w) { try { w.w.close(); } catch {} watchers.delete(pid); }
      watch(pid); changed(pid, []);
      return send(res, 200, { preview: status(pid, me) });
    }
    return null;
  }

  return { match, serve, upgrade, route, mint, verify, rootOf, status, changed, links, watch, CANDIDATES, okSub };
};
module.exports.CSP = CSP;
