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
const HELPER_SRC = `<script data-tribe-preview>(function(){
var mem=function(){var d={};return{getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[String(k)]=String(v)},removeItem:function(k){delete d[String(k)]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}};
['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('x')}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});
var m=location.pathname.match(/^\\/preview\\/[a-z0-9-]+\\/pv1\\.[^/]+\\//);
var pend=false;function busy(){return !!document.querySelector('[contenteditable=true]')}
window.__tcReload=function(){if(busy()){pend=true;return}location.reload()};
if(m&&window.EventSource){try{var es=new EventSource(m[0]+'${RESERVED}/live');es.onmessage=function(e){if(e.data==='reload')window.__tcReload();else if(/^v[0-9]+$/.test(e.data)&&e.data!=='v__TCV__')window.__tcReload()}}catch(_){}}
var up=window.parent!==window?window.parent:null;
function say(o){if(up)try{up.postMessage(o,'*')}catch(_){}}
function ready(){say({tc:'ready',title:document.title,href:location.pathname})}
window.addEventListener('error',function(e){say({tc:'error',msg:String(e.message||'error'),src:String(e.filename||'').split('/').pop(),line:e.lineno||0})});
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
var ED=null;function edOn(on){if(on&&!ED){var st=document.createElement('style');st.setAttribute('data-tribe-preview','');st.textContent='[data-tc-hov]{outline:2px dashed #38C6B1!important;outline-offset:2px;cursor:pointer}[data-tc-sel]{outline:2px solid #F26B1D!important;outline-offset:2px}[contenteditable=true][data-tc-sel]{outline-style:solid;cursor:text}';document.head.appendChild(st);
var TXT=/^(H[1-6]|P|A|LI|SPAN|BUTTON|FIGCAPTION|BLOCKQUOTE|TD|TH|LABEL|SMALL|STRONG|EM|B|I|DT|DD|SUMMARY|CAPTION)$/,hov=null,sel=null,before='';
function leaf(el){return el&&TXT.test(el.tagName)&&el.children.length<=2&&el.textContent.trim().length>0&&el.textContent.length<600}
function over(e){var t=e.target;if(t===hov)return;if(hov)hov.removeAttribute('data-tc-hov');hov=t&&t.nodeType===1&&t!==document.body&&t!==document.documentElement?t:null;if(hov)hov.setAttribute('data-tc-hov','')}
function cssPath(t){var p=[];while(t&&t.nodeType===1&&t!==document.body&&t!==document.documentElement&&p.length<10){var i=1,s=t;while((s=s.previousElementSibling))if(s.tagName===t.tagName)i++;p.unshift(t.tagName.toLowerCase()+':nth-of-type('+i+')');t=t.parentElement}return 'body>'+p.join('>')}
function pick(t,re){if(sel&&sel!==t){finish(sel);sel.removeAttribute('data-tc-sel')}sel=t;t.setAttribute('data-tc-sel','');var h=t.outerHTML.replace(/ data-tc-(hov|sel)=""/g,'');var b=t.getBoundingClientRect();say({tc:'pick',re:!!re,path:cssPath(t),tag:t.tagName.toLowerCase(),text:t.textContent.trim().slice(0,600),html:h.slice(0,2000),editable:leaf(t),href:location.pathname,rect:{left:b.left,top:b.top,width:b.width,height:b.height},cs:(function(){try{var c=getComputedStyle(t),o={};["padding","margin","width","height","color","background-color","font-size","font-weight","border-radius","text-align"].forEach(function(k){o[k]=c.getPropertyValue(k)});o.style=t.getAttribute("style")||"";return o}catch(e){return null}})()})}
function click(e){if(e.target.closest&&e.target.closest('[contenteditable=true]'))return;e.preventDefault();e.stopPropagation();var t=e.target;if(t.nodeType!==1)return;pick(t)}
function dbl(e){var t=e.target;if(!leaf(t))return;e.preventDefault();pick(t);before=t.textContent;t.setAttribute('contenteditable','true');t.focus()}
function finish(t){if(t.getAttribute('contenteditable')!=='true')return;t.removeAttribute('contenteditable');var after=t.textContent;if(after!==before&&before)say({tc:'text',tag:t.tagName.toLowerCase(),before:before.trim(),after:after.trim(),href:location.pathname});before='';if(pend){pend=false;setTimeout(function(){location.reload()},150)}}
function key(e){if(!sel)return;if(e.key==='Enter'&&sel.getAttribute('contenteditable')==='true'&&!e.shiftKey){e.preventDefault();finish(sel)}if(e.key==='Escape'){if(sel.getAttribute('contenteditable')==='true'){sel.textContent=before;sel.removeAttribute('contenteditable');before='';if(pend){pend=false;location.reload()}}else{sel.removeAttribute('data-tc-sel');sel=null;say({tc:'pick',none:true})}}}
function blur(e){if(sel&&e.target===sel)finish(sel)}
document.addEventListener('mouseover',over,true);document.addEventListener('click',click,true);document.addEventListener('dblclick',dbl,true);document.addEventListener('keydown',key,true);document.addEventListener('focusout',blur,true);
ED={off:function(){document.removeEventListener('mouseover',over,true);document.removeEventListener('click',click,true);document.removeEventListener('dblclick',dbl,true);document.removeEventListener('keydown',key,true);document.removeEventListener('focusout',blur,true);if(sel){finish(sel);sel.removeAttribute('data-tc-sel')}if(hov)hov.removeAttribute('data-tc-hov');st.remove()}}}
else if(!on&&ED){ED.off();ED=null}}
try{if(sessionStorage.getItem('tc-edit')==='1')edOn(true)}catch(_){}
window.addEventListener('message',function(e){if(!up||e.source!==up||!e.data||e.data.tc!=='edit')return;edOn(!!e.data.on);try{sessionStorage.setItem('tc-edit',e.data.on?'1':'0')}catch(_){}});
window.addEventListener('message',function(e){if(!up||e.source!==up||!e.data||e.data.tc!=='shot')return;var id=e.data.id;shot().then(function(d){say({tc:'shot',id:id,data:d})},function(err){say({tc:'shot',id:id,error:String(err&&err.message||err)})})});
function rePath(t){var p=[];while(t&&t.nodeType===1&&t!==document.body&&t!==document.documentElement&&p.length<10){var i=1,s=t;while((s=s.previousElementSibling))if(s.tagName===t.tagName)i++;p.unshift(t.tagName.toLowerCase()+':nth-of-type('+i+')');t=t.parentElement}return 'body>'+p.join('>')}
function rePick(t){var b=t.getBoundingClientRect(),c=null;try{var g=getComputedStyle(t);c={};['padding','margin','width','height','color','background-color','font-size','font-weight','border-radius','text-align'].forEach(function(k){c[k]=g.getPropertyValue(k)});c.style=t.getAttribute('style')||''}catch(_){c=null}say({tc:'pick',re:true,path:rePath(t),tag:t.tagName.toLowerCase(),text:t.textContent.trim().slice(0,600),html:t.outerHTML.replace(/ data-tc-(hov|sel)=""/g,'').slice(0,2000),href:location.pathname,rect:{left:b.left,top:b.top,width:b.width,height:b.height},cs:c})}
var PN=null;
function cssSel(el){var parts=[];while(el&&el.nodeType===1&&el!==document.body&&el!==document.documentElement){if(el.id){try{var q='#'+CSS.escape(el.id);if(document.querySelectorAll(q).length===1){parts.unshift(q);return parts.join(' > ')}}catch(_){}}var t=el.tagName.toLowerCase(),i=1,s=el;while((s=s.previousElementSibling))if(s.tagName===el.tagName)i++;parts.unshift(t+':nth-of-type('+i+')');el=el.parentElement}parts.unshift('body');return parts.join(' > ')}
function pinOn(on){if(on&&!PN){var st=document.createElement('style');st.setAttribute('data-tribe-preview','');st.textContent='html.tc-pinmode,html.tc-pinmode *{cursor:crosshair!important}';document.head.appendChild(st);document.documentElement.classList.add('tc-pinmode');
function pc(e){var t=e.target;if(!t||t.nodeType!==1)return;e.preventDefault();e.stopPropagation();var b=t.getBoundingClientRect(),H=Math.max(1,document.documentElement.scrollHeight);say({tc:'pinpick',sel:cssSel(t),ox:b.width?(e.clientX-b.left)/b.width:0,oy:b.height?(e.clientY-b.top)/b.height:0,fx:e.clientX/Math.max(1,window.innerWidth),fy:(e.clientY+window.scrollY)/H,x:e.clientX,y:e.clientY,tag:t.tagName.toLowerCase(),text:(t.textContent||'').trim().slice(0,80),href:location.pathname})}
document.addEventListener('click',pc,true);PN={off:function(){document.removeEventListener('click',pc,true);st.remove();document.documentElement.classList.remove('tc-pinmode')}}}else if(!on&&PN){PN.off();PN=null}}
function where(items){return(items||[]).map(function(p){var el=null;try{el=p.sel?document.querySelector(p.sel):null}catch(_){}var x,y;if(el){var b=el.getBoundingClientRect();x=b.left+b.width*(+p.ox||0);y=b.top+b.height*(+p.oy||0)}else{x=(+p.fx||0)*window.innerWidth;y=(+p.fy||0)*Math.max(1,document.documentElement.scrollHeight)-window.scrollY}return{id:p.id,x:x,y:y,found:!!el}})}
var scAt=0;function sc(){var n=Date.now();clearTimeout(sc.t);if(n-scAt<80){sc.t=setTimeout(sc,90);return}scAt=n;var H=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);say({tc:'scroll',fy:window.scrollY/H,href:location.pathname})}
document.addEventListener('keydown',function(e){if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;var t=e.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))return;if(e.key==='Escape'&&PN)return say({tc:'key',key:'Escape'});if(e.key!=='c'&&e.key!=='C')return;var g=bigCanvas();if(g){var r=g.getBoundingClientRect();if(r.width*r.height>window.innerWidth*window.innerHeight*0.3)return}say({tc:'key',key:'c'})},true);
window.addEventListener('scroll',sc,{passive:true});window.addEventListener('resize',sc);
window.addEventListener('message',function(e){if(!up||e.source!==up||!e.data)return;var d=e.data;if(d.tc==='pins')pinOn(!!d.on);else if(d.tc==='pinpos')say({tc:'pinpos',items:where(d.items)});else if(d.tc==='repick'){var t=null;try{if(d.path)t=document.querySelector(d.path)}catch(_){}if(t&&d.tag&&t.tagName.toLowerCase()!==d.tag)t=null;if(!t){var all=document.getElementsByTagName(d.tag||'*'),want=String(d.text||'').trim().slice(0,80);for(var i=0;i<all.length;i++){if(want&&all[i].textContent.trim().slice(0,80)===want){t=all[i];break}}}if(t)rePick(t);else say({tc:'pick',none:true,re:true})}else if(d.tc==='scrollto'){try{window.scrollTo({top:(+d.fy||0)*Math.max(0,document.documentElement.scrollHeight-window.innerHeight),behavior:d.instant?'auto':'smooth'})}catch(_){}}});
})();</script>`;

module.exports = function preview({ P, store, getMembers, broadcast, share, lanUrls = () => [], port: tribePort, log = () => {}, llm = null }) {
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
      // TribeCode's own living context file is rewritten as the tribe chats and works: it isn't part of the app, and
      // reloading on it restarted games mid-play. Editor swap/backup files are noise too.
      if (f && /(^|[\\/])(TRIBE_CONTEXT\.md|[^\\/]*\.swp|[^\\/]*~|\.#[^\\/]*|4913)$/.test(f)) return;
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
  const gen = new Map();   // pid -> how many changes so far (pages compare it when their live stream connects)
  function changed(pid, files = []) {
    gen.set(pid, (gen.get(pid) || 0) + 1);
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
  function page(res, status, title, text, extra = {}, livePrefix = null, livePid = null) {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    res.writeHead(status, { ...baseHeaders('static'), 'Content-Type': 'text/html; charset=utf-8', ...extra });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:#12151A;color:#94A3B8;font:14px/1.6 Inter,system-ui,sans-serif}body{display:grid;place-items:center;padding:16px;box-sizing:border-box}
div{max-width:46ch;border:1px solid #2A313C;background:#1B2028;border-radius:12px;padding:20px 22px}small{font:10.5px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6B7A90}
h1{margin:4px 0 8px;font-size:18px;color:#F8FAFC}code{font:12.5px ui-monospace,monospace;color:#F8FAFC;background:#12151A;border:1px solid #2A313C;border-radius:6px;padding:1px 6px}</style>
<div><small>Preview</small><h1>${esc(title)}</h1><p>${text}</p></div>${livePrefix ? `<script>var V='v${livePid ? gen.get(livePid) || 0 : 0}';try{new EventSource(${JSON.stringify(livePrefix + RESERVED + '/live')}).onmessage=function(e){if(e.data==='reload'||(/^v[0-9]+$/.test(e.data)&&e.data!==V))location.reload()}}catch(_){}setInterval(function(){fetch(location.href,{method:'HEAD',cache:'no-store'}).then(function(r){if(r.ok)location.reload()}).catch(function(){})},4000)</script>` : ''}`);
  }
  const deny = (res, status, msg) => page(res, status, status === 404 ? 'Not found' : 'No access', msg);
  function injectHelper(html, pid) {
    const s = String(html); const HELPER = HELPER_SRC.replace('__TCV__', String(gen.get(pid) || 0));
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
    res.write(`retry: 3000\ndata: v${gen.get(pid) || 0}\n\n`); set.add(res); watch(pid);
    req.on('close', () => set.delete(res));
  }

  function serveFile(req, res, url, q) {
    const r = rootOf(q.pid);
    if (!r.root || !hasIndex(r.root)) { watch(q.pid); return page(res, 404, 'No index.html yet', 'This project has no web page to show yet. Ask your Claude to start one: an <code>index.html</code> at the repo root (or in <code>public/</code>). This page shows it by itself the moment it exists.', {}, q.prefix, q.pid); }
    let rel; try { rel = decodeURIComponent(q.rest || ''); } catch { return deny(res, 400, 'Bad path.'); }
    if (rel.includes('\0')) return deny(res, 400, 'Bad path.');
    const segs = rel.split(/[\\/]+/).filter(Boolean);
    if (segs.some(s => s === '..')) return deny(res, 403, 'That path leaves the app folder.');
    if (segs.some(s => s.startsWith('.') || s === 'node_modules' || s === RESERVED) || (segs.length && SECRET.test(segs[segs.length - 1]))) return deny(res, 404, 'Not found.');
    let realRoot, realRepo; try { realRoot = fs.realpathSync(r.root); realRepo = fs.realpathSync(r.repo); } catch { return deny(res, 404, 'Not found.'); }
    if (realRoot !== realRepo && !realRoot.startsWith(realRepo + path.sep)) return deny(res, 403, 'The web root points outside the repo.');   // a symlinked public/ → elsewhere
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
        const body = Buffer.from(injectHelper(txt, q.pid));
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
        ur.on('end', () => { const body = size > 8 * 1024 * 1024 ? Buffer.concat(chunks) : Buffer.from(injectHelper(Buffer.concat(chunks).toString('utf8'), q.pid)); res.writeHead(ur.statusCode, { ...out, 'content-length': body.length }); res.end(body); });
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
    // v0.25: edit the page right in the preview. Text changes made in place, and "Ask Flint to change this".
    // P1-G: the point-and-edit property sheet (props) and Undo for every in-preview edit (undo)
    if ((b === 'edit' || b === 'flint' || b === 'props' || b === 'undo') && m === 'POST') {
      if (!me || ['spectator', 'guest'].includes(me.role)) return fail(res, 403, 'only builders can edit the page');
      if (modeOf(pid) === 'dev') return fail(res, 409, 'this preview runs the project\'s own dev server: edit the source files instead');
      const body = await readBody(req, 128 * 1024);
      const f = pageFile(pid, body.href);
      if (f.error) return fail(res, f.status, f.error);
      try {
        if (b === 'undo') {
          const st = undos.get(f.file) || [];
          if (!st.length) return fail(res, 409, 'nothing to undo on this page');
          fs.writeFileSync(f.file, st.pop()); changed(pid, [f.rel]); log(`preview undo: ${f.rel}`);
          return send(res, 200, { ok: true, file: f.rel, undone: 1, left: st.length });
        }
        const before = fs.readFileSync(f.file, 'utf8');
        const out = b === 'edit' ? textEdit(f, String(body.before || ''), String(body.after || ''), String(body.tag || '').toLowerCase()) : b === 'props' ? propsEdit(f, body) : await flintEdit(pid, f, body, me);
        if (fs.readFileSync(f.file, 'utf8') !== before) { const st = undos.get(f.file) || []; st.push(before); if (st.length > 40) st.shift(); undos.set(f.file, st); }
        changed(pid, [f.rel]);
        return send(res, 200, { ok: true, file: f.rel, undo: (undos.get(f.file) || []).length, ...out });
      } catch (e) { return fail(res, e.status || 500, e.message); }
    }
    return null;
  }
  // the source file behind a preview page (its pathname), inside the web root, html only
  function pageFile(pid, href) {
    const r = rootOf(pid); if (!r.root) return { status: 404, error: 'no web page in this project yet' };
    let rel = String(href || '').replace(/^\/preview\/[^/]+\/pv1\.[^/]+\/?/, '');
    try { rel = decodeURIComponent(rel); } catch { return { status: 400, error: 'bad page address' }; }
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const segs = rel.split(/[\\/]+/).filter(Boolean);
    if (segs.some(x => x === '..' || x.startsWith('.') || x === 'node_modules' || x === RESERVED) || !/\.html?$/i.test(rel)) return { status: 400, error: 'only the project\'s own HTML pages can be edited here' };
    let realRoot; try { realRoot = fs.realpathSync(r.root); } catch { return { status: 404, error: 'not found' }; }
    let file = path.resolve(realRoot, ...segs); try { file = fs.realpathSync(file); } catch { return { status: 404, error: 'that page is not a file in the repo' }; }
    if (!file.startsWith(realRoot + path.sep)) return { status: 403, error: 'that page is outside the app folder' };
    const st = fs.statSync(file); if (st.size > 1024 * 1024) return { status: 413, error: 'that page is too big to edit here' };
    return { file, rel: path.relative(r.repo, file).replace(/\\/g, '/'), root: realRoot };
  }
  const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // find `before` once in the source: as typed, HTML-escaped, then with any run of whitespace (or a tag break) between words
  function findOnce(src, before) {
    const tries = [before, escHtml(before)];
    for (const t of tries) { if (!t) continue; const i = src.indexOf(t); if (i >= 0 && src.indexOf(t, i + 1) < 0) return { i, len: t.length }; }
    const words = escHtml(before).split(/\s+/).filter(Boolean); if (!words.length || words.length > 120) return null;
    const re = new RegExp(words.map(reEsc).join('(?:\\s|&nbsp;)+'), 'g'); const all = [...src.matchAll(re)];
    return all.length === 1 ? { i: all[0].index, len: all[0][0].length } : null;
  }
  // ---------- simple looks without an AI ----------
  const COLORS = { red: '#E5484D', orange: '#F26B1D', yellow: '#FABD2F', gold: '#E9B949', green: '#3BD16F', mint: '#5FD3A5', teal: '#38C6B1', blue: '#3B82F6', sky: '#4FB3F6', navy: '#1E3A8A', indigo: '#6C7CFF', purple: '#8B5CF6', violet: '#8B5CF6', pink: '#FF6F8E', rose: '#FF6F8E', brown: '#B07A4F', white: '#FFFFFF', black: '#111111', gray: '#94A3B8', grey: '#94A3B8' };
  const COLOR_RX = new RegExp(`\\b(${Object.keys(COLORS).join('|')})\\b|(#[0-9a-f]{6}\\b|#[0-9a-f]{3}\\b)`, 'i');
  // Flint's free look edits (docs/FLINT-TIERS.md): no AI, just CSS on the picked element (or the whole page for dark/light)
  function styleRule(ask) {
    const a = ask.toLowerCase();
    const more = /\b(much|a lot|way|lots)\b/.test(a);
    if (/\b(dark (mode|theme|background)|make (it|the page|everything) dark(er)?|go dark)\b|^dark( mode)?$/.test(a)) return { page: true, set: { 'background-color': '#12151A', color: '#E7E9EE' }, say: 'Made the page dark.' };
    if (/\b(light (mode|theme|background)|make (it|the page|everything) light(er)?)\b|^light( mode)?$/.test(a)) return { page: true, set: { 'background-color': '#FFFFFF', color: '#16181D' }, say: 'Made the page light.' };
    const px = /\b(?:font(?:\s*size)?|text(?:\s*size)?|size)\s*(?:to\s*)?(\d{1,3})\s*(?:px)?\b|\b(\d{1,3})\s*px\b/.exec(a);
    if (px && !/\b(padding|space|spacing|margin|corner|round|radius)\b/.test(a)) { const n = Math.max(8, Math.min(160, +(px[1] || px[2]))); return { set: { 'font-size': n + 'px' }, say: `Set the text to ${n}px.` }; }
    if (/\b(more|bigger|extra|add)\b.*\b(space|spacing|padding|room|breathing)\b|\b(space|spread) (it )?out\b/.test(a)) return { set: { padding: more ? '32px' : '20px' }, say: 'Gave it more room.' };
    if (/\b(less|smaller|tighter|reduce|remove)\b.*\b(space|spacing|padding|room)\b|\btighten\b/.test(a)) return { set: { padding: '6px' }, say: 'Tightened the spacing.' };
    if (/\b(round(ed)?|soft(er)?) (the )?corners?\b|\bround(ed)? it\b|\bmake it round(ed)?\b/.test(a)) return { set: { 'border-radius': more ? '24px' : '12px' }, say: 'Rounded the corners.' };
    if (/\b(square|sharp) (the )?corners?\b/.test(a)) return { set: { 'border-radius': '0' }, say: 'Squared the corners.' };
    if (/\b(bigger|larger|huge|grow)\b/.test(a)) return { zoom: more || /\bhuge\b/.test(a) ? 1.6 : 1.25, say: 'Made it bigger.' };
    if (/\b(smaller|tiny|shrink)\b/.test(a)) return { zoom: 0.8, say: 'Made it smaller.' };
    if (/\b(not bold|unbold|normal weight)\b/.test(a)) return { set: { 'font-weight': '400' }, say: 'Made it regular weight.' };
    if (/\bbold\b/.test(a)) return { set: { 'font-weight': '700' }, say: 'Made it bold.' };
    if (/\bitalic\b/.test(a)) return { set: { 'font-style': 'italic' }, say: 'Made it italic.' };
    if (/\bunderline\b/.test(a)) return { set: { 'text-decoration': 'underline' }, say: 'Underlined it.' };
    if (/\b(upper ?case|all caps|capitals)\b/.test(a)) return { set: { 'text-transform': 'uppercase' }, say: 'Made it uppercase.' };
    if (/\bcent(er|re)(ed)?\b/.test(a)) return { set: { 'text-align': 'center' }, say: 'Centered it.' };
    if (/\b(align|move|put|push)\b.*\bleft\b|\bleft[- ]align/.test(a)) return { set: { 'text-align': 'left' }, say: 'Aligned it left.' };
    if (/\b(align|move|put|push)\b.*\bright\b|\bright[- ]align/.test(a)) return { set: { 'text-align': 'right' }, say: 'Aligned it right.' };
    if (/^(hide|hide it|hide this|hide that)$/.test(a.trim())) return { set: { display: 'none' }, say: 'Hid it.' };
    const c = COLOR_RX.exec(a);
    if (c && /\b(make|turn|color|colour|paint|change|set|use)\b/.test(a)) { const v = c[2] ? c[2] : COLORS[c[1]]; return { set: { [/\b(background|bg|fill)\b/.test(a) ? 'background-color' : 'color']: v }, say: `Made it ${c[2] || c[1]}.` }; }
    return null;
  }
  // the opening tag of the element to restyle: the picked one (found by its text) or the first title/button the ask names
  function openTagFor(src, text, tag, ask) {
    const close = i => { const e = src.indexOf('>', i); return e > i ? { start: i, end: e + 1 } : null; };
    if (text && /^[a-z][a-z0-9]{0,9}$/.test(tag)) {
      const at = findOnce(src, text); if (!at) return null;
      const re = new RegExp(`<${tag}\\b`, 'gi'); let m, last = -1; while ((m = re.exec(src)) && m.index < at.i) last = m.index;
      return last >= 0 ? close(last) : null;
    }
    const want = /\b(title|heading|headline|header)\b/i.test(ask) ? /<h1\b|<h2\b/i : /\bbutton\b/i.test(ask) ? /<button\b|<a\b[^>]*class=["'][^"']*\bbtn/i : null;
    if (!want) return null;
    const body = src.search(/<body\b/i), from = body < 0 ? 0 : body, m = want.exec(src.slice(from));
    return m ? close(from + m.index) : null;
  }
  // ---------- P1-G: the property sheet. Exact values from the sheet, checked against an allowlist, written as inline
  // style on the picked element's opening tag (the same deterministic path as the look rules). No AI.
  const undos = new Map();   // file -> [earlier contents], newest last (in memory; Undo in the preview)
  const LEN = /^(?:0|auto|-?\d{1,4}(?:\.\d{1,2})?(?:px|rem|em|%|vw|vh))$/;
  const LEN4 = v => String(v).trim().split(/\s+/).length <= 4 && String(v).trim().split(/\s+/).every(x => LEN.test(x));
  const COLOR = /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)|transparent|inherit|currentcolor|[a-z]{3,20})$/i;
  const PROPS = { padding: LEN4, margin: LEN4, width: v => LEN.test(v), height: v => LEN.test(v), 'max-width': v => LEN.test(v), gap: v => LEN.test(v),
    color: v => COLOR.test(v), 'background-color': v => COLOR.test(v), 'border-color': v => COLOR.test(v), 'font-size': v => LEN.test(v) && v !== 'auto',
    'font-weight': v => /^(?:[1-9]00|normal|bold)$/.test(v), 'border-radius': LEN4, 'text-align': v => /^(?:left|center|right|justify)$/.test(v),
    'line-height': v => /^(?:normal|\d(?:\.\d{1,2})?|\d{1,3}px)$/.test(v), 'letter-spacing': v => LEN.test(v) || v === 'normal' };
  function propsEdit(f, body) {
    const pick = body.pick || {}, text = String(pick.text || '').trim().slice(0, 600), tag = String(pick.tag || '').toLowerCase();
    const set = {}, raw = body.set && typeof body.set === 'object' ? body.set : {};
    for (const [k, v0] of Object.entries(raw)) {
      const v = String(v0 == null ? '' : v0).trim().slice(0, 60);
      if (!PROPS[k]) throw Object.assign(new Error(`can't set ${k} here`), { status: 400 });
      if (v === '') { set[k] = null; continue; }   // empty clears it
      if (!PROPS[k](v)) throw Object.assign(new Error(`${v} isn't a value ${k} can take`), { status: 400 });
      set[k] = v;
    }
    if (!Object.keys(set).length) throw Object.assign(new Error('nothing to change'), { status: 400 });
    if (!text || !/^[a-z][a-z0-9]{0,9}$/.test(tag)) throw Object.assign(new Error('pick an element with some text on it first'), { status: 400 });
    const src = fs.readFileSync(f.file, 'utf8'), at = openTagFor(src, text, tag, '');
    if (!at) throw Object.assign(new Error('couldn\'t find that element exactly once in the page\'s source (it may come from a script). Edit it in Files › Code.'), { status: 409 });
    fs.writeFileSync(f.file, src.slice(0, at.start) + restyle(src.slice(at.start, at.end), { set }) + src.slice(at.end));
    log(`preview props: ${f.rel} ${Object.keys(set).join(',')}`);
    return { changed: 1, set, say: 'Updated.' , via: 'props' };
  }
  function restyle(tag, look) {
    const m = /\sstyle=(["'])([\s\S]*?)\1/i.exec(tag), cur = {};
    if (m) m[2].split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) cur[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim(); });
    if (look.zoom) cur.zoom = String(Math.round((parseFloat(cur.zoom) || 1) * look.zoom * 100) / 100);
    for (const [k, v] of Object.entries(look.set || {})) { if (v === null) delete cur[k]; else cur[k] = v; }
    const css = Object.entries(cur).map(([k, v]) => `${k}: ${v}`).join('; ').replace(/"/g, "'");
    if (!css) return m ? tag.slice(0, m.index) + tag.slice(m.index + m[0].length) : tag;
    return m ? tag.slice(0, m.index) + ` style="${css}"` + tag.slice(m.index + m[0].length) : tag.replace(/\s*(\/?)>$/, ` style="${css}"$1>`);
  }
  function textEdit(f, before, after, tag) {
    before = before.trim(); after = after.trim();
    if (!before || before.length > 2000 || after.length > 4000) throw Object.assign(new Error('nothing to change'), { status: 400 });
    const src = fs.readFileSync(f.file, 'utf8');
    let at = findOnce(src, before);
    if (!at && /^[a-z][a-z0-9]{0,9}$/.test(tag || '')) {   // the same words elsewhere (a <title>, say): the one inside this kind of element
      const re = new RegExp(`(<${tag}\\b[^>]*>\\s*)(${escHtml(before).split(/\s+/).map(reEsc).join('(?:\\s|&nbsp;)+')})(\\s*</${tag}>)`, 'g'), all = [...src.matchAll(re)];
      if (all.length === 1) at = { i: all[0].index + all[0][1].length, len: all[0][2].length };
    }
    if (!at) throw Object.assign(new Error('couldn\'t find that text exactly once in the page\'s source (it may come from a script). Ask Flint, or edit the file in Files › Code.'), { status: 409 });
    fs.writeFileSync(f.file, src.slice(0, at.i) + escHtml(after) + src.slice(at.i + at.len));
    log(`preview edit: ${f.rel}`);
    return { changed: 1 };
  }
  async function flintEdit(pid, f, body, me) {
    const ask = String(body.ask || '').trim().slice(0, 600), pick = body.pick || {};
    if (!ask) throw Object.assign(new Error('say what to change'), { status: 400 });
    const text = String(pick.text || '').trim().slice(0, 600);
    // no AI needed for the simple ones: new words, or taking the element out
    const say = /^(?:change|set|make|rename)?\s*(?:the\s+)?(?:text|it|this|words?)?\s*(?:to|say|says|read|reads)\s*[:"“']?\s*(.+?)["”']?\s*$/i.exec(ask);
    if (say && text && !/\b(color|colour|bigger|smaller|bold|font|size|red|blue|green|center|left|right)\b/i.test(say[1])) return { ...textEdit(f, text, say[1], String(pick.tag || '').toLowerCase()), say: 'Changed the words.', via: 'rules' };
    if (/^(?:delete|remove|hide|take out|get rid of)\s+(?:this|it|that)\b/i.test(ask) && text && pick.tag && /^[a-z0-9]+$/.test(pick.tag)) {
      const src = fs.readFileSync(f.file, 'utf8'), at = findOnce(src, text);
      if (at) {
        const open = src.lastIndexOf('<' + pick.tag, at.i), close = src.indexOf('</' + pick.tag + '>', at.i + at.len);
        if (open >= 0 && close > 0 && src.slice(open, at.i).indexOf('<' + pick.tag, 1) < 0) { fs.writeFileSync(f.file, src.slice(0, open) + src.slice(close + pick.tag.length + 3)); return { changed: 1, say: 'Took it out.', via: 'rules' }; }
      }
    }
    // no AI needed for simple looks either: bigger / smaller / bold / centered / a named color, on the picked element
    // (or "the title" / "the button" when nothing is picked)
    const look = styleRule(ask);
    if (look) {
      const src = fs.readFileSync(f.file, 'utf8'), at = look.page ? (() => { const b = /<body\b[^>]*>/i.exec(src); return b ? { start: b.index, end: b.index + b[0].length } : null; })() : openTagFor(src, text, String(pick.tag || '').toLowerCase(), ask);
      if (at) { fs.writeFileSync(f.file, src.slice(0, at.start) + restyle(src.slice(at.start, at.end), look) + src.slice(at.end)); log(`preview flint look: ${f.rel}`); return { changed: 1, say: look.say, via: 'rules' }; }
    }
    if (!llm || !llm.status || !llm.status().online) throw Object.assign(new Error('Flint needs an AI for that one. Choose Flint\'s AI in Settings, or say "change it to …" for new words.'), { status: 503 });
    const src = fs.readFileSync(f.file, 'utf8');
    // the page's own stylesheet (first local <link rel=stylesheet>), so style changes land in the CSS
    let css = null; const lm = /<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']([^"':?#]+\.css)["']/i.exec(src) || /<link[^>]+href=["']([^"':?#]+\.css)["'][^>]*rel=["']?stylesheet/i.exec(src);
    if (lm) { try { const cf = fs.realpathSync(path.resolve(path.dirname(f.file), lm[1])); if (cf.startsWith(f.root + path.sep) && fs.statSync(cf).size < 64 * 1024) css = { file: cf, rel: path.relative(path.dirname(f.file), cf).replace(/\\/g, '/'), text: fs.readFileSync(cf, 'utf8') }; } catch {} }
    let html = src; if (html.length > 48000) { const at = text ? findOnce(src, text) : null, c = at ? at.i : 0; html = src.slice(Math.max(0, c - 20000), c + 20000); }
    const system = 'You edit a web page for a beginner. Make the smallest change that does what they asked, to the element they picked. Keep their style and structure. Reply with ONLY JSON, no prose, no code fences: {"edits":[{"file":"page" or "css","find":"exact text copied from that file","replace":"the new text"}],"say":"one short sentence about what you changed"}. Every "find" must appear exactly once in its file: copy enough surrounding characters to make it unique. At most 6 edits. Never add scripts, external links or tracking.';
    const prompt = `What they asked: ${ask}\n\nThe element they picked (as the browser shows it): <${pick.tag || '?'}> ${String(pick.html || '').slice(0, 1600)}\n\n=== page (${f.rel}) ===\n${html}\n${css ? `\n=== css (${css.rel}) ===\n${css.text.slice(0, 30000)}\n` : ''}`;
    let r; try { r = await llm.stream({ system, prompt, maxTokens: 1500, temperature: 0.2, timeoutMs: 120_000, me }); } catch (e) { throw Object.assign(new Error('Flint\'s AI didn\'t answer: ' + (e.message || e)), { status: 502 }); }
    const raw = String((r && r.text) || ''), j = (() => { const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); try { return JSON.parse(raw.slice(a, z + 1)); } catch { return null; } })();
    if (!j || !Array.isArray(j.edits) || !j.edits.length) throw Object.assign(new Error('Flint couldn\'t work out a change for that. Try saying it another way.'), { status: 422 });
    const files = { page: { file: f.file, text: src }, ...(css ? { css: { file: css.file, text: css.text } } : {}) };
    for (const e of j.edits.slice(0, 6)) {
      const tgt = files[e.file === 'css' ? 'css' : 'page']; if (!tgt || typeof e.find !== 'string' || typeof e.replace !== 'string' || !e.find) throw Object.assign(new Error('Flint\'s change didn\'t fit the page, nothing was changed'), { status: 422 });
      if (/<script|javascript:|on\w+\s*=|<iframe|@import\s+url\(\s*['"]?https?:/i.test(e.replace) && !/<script|javascript:|on\w+\s*=|<iframe/i.test(e.find)) throw Object.assign(new Error('Flint tried to add a script or an outside link, so nothing was changed'), { status: 422 });
      const i = tgt.text.indexOf(e.find); if (i < 0 || tgt.text.indexOf(e.find, i + 1) >= 0) throw Object.assign(new Error('Flint\'s change didn\'t match the page exactly, nothing was changed. Try again.'), { status: 422 });
      tgt.text = tgt.text.slice(0, i) + e.replace + tgt.text.slice(i + e.find.length);
    }
    for (const k of Object.keys(files)) fs.writeFileSync(files[k].file, files[k].text);
    log(`preview flint edit: ${f.rel}`);
    return { changed: j.edits.length, say: String(j.say || 'Done.').slice(0, 200), via: (r && r.via) || 'brain' };
  }

  return { match, serve, upgrade, route, mint, verify, rootOf, status, changed, links, watch, CANDIDATES, okSub };
};
module.exports.CSP = CSP;
