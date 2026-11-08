// Link previews for chat (feat/chat2): the host's server fetches a page's title / description / site / image so the
// chat can show a small card, and proxies preview pictures (and images linked by URL, and GIFs) so friends' browsers
// never talk to third-party sites and no third-party content runs on the page.
// SSRF protection, on every hop: http/https only, no credentials in the URL, the host name is resolved and every
// address must be public (no loopback, private, link-local, CGNAT, multicast, documentation, metadata ranges, IPv4
// mapped/NAT64 forms of those), and the connection goes to the address that was checked (no DNS rebinding). Redirects
// are followed by hand (3 at most) and checked the same way. 3 s timeout, 512 KB cap for pages, 5 MB for pictures.
// Results are cached for an hour. The host can turn previews off (Settings › Chat).
//   GET   /api/embeds?url=           -> { preview: { url, title, description, site, image, kind } } or { blocked | off }
//   GET   /api/embeds/img?u=         -> the picture (png, jpeg, gif, webp, avif only; never svg)
//   GET   /api/embeds/settings       -> { previews }
//   PATCH /api/embeds/settings { previews }   host only
'use strict';
const dns = require('node:dns');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');

const PAGE_CAP = 512 * 1024, IMG_CAP = 5 * 1024 * 1024, TIMEOUT = 3000, HOPS = 3, TTL = 3600_000;
const IMG_TYPES = /^image\/(png|jpeg|gif|webp|avif)$/;

// ---------- address checks ----------
function v4num(ip) { const p = ip.split('.').map(Number); return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ? ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] : null; }
const V4_BLOCK = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]
  .map(([a, n]) => [v4num(a), n]);
function privateV4(ip) {
  const x = v4num(ip); if (x === null) return true;
  return V4_BLOCK.some(([base, bits]) => ((x ^ base) >>> (32 - bits)) === 0);
}
function expand6(ip) {
  let s = ip.toLowerCase().split('%')[0];
  const m4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m4) { const n = v4num(m4[2]); if (n === null) return null; s = m4[1] + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16); }
  const [h, t] = s.split('::'); if (s.split('::').length > 2) return null;
  const hp = h ? h.split(':') : [], tp = t !== undefined && t !== '' ? t.split(':') : [];
  const fill = s.includes('::') ? 8 - hp.length - tp.length : 0; if (fill < 0) return null;
  const all = [...hp, ...Array(fill).fill('0'), ...tp]; if (all.length !== 8) return null;
  const out = all.map(x => parseInt(x || '0', 16)); return out.some(n => !(n >= 0 && n <= 0xffff)) ? null : out;
}
function privateV6(ip) {
  const w = expand6(ip); if (!w) return true;
  if (w.every(x => x === 0)) return true;                                    // ::
  if (w.slice(0, 7).every(x => x === 0) && w[7] === 1) return true;          // ::1
  const v4of = (a, b) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  if (w.slice(0, 5).every(x => x === 0) && w[5] === 0xffff) return privateV4(v4of(w[6], w[7]));   // ::ffff:a.b.c.d
  if (w.slice(0, 6).every(x => x === 0)) return true;                        // ::a.b.c.d (deprecated compat)
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every(x => x === 0)) return privateV4(v4of(w[6], w[7]));   // NAT64
  if ((w[0] & 0xfe00) === 0xfc00) return true;                               // fc00::/7 unique local (incl. fd00:ec2::254)
  if ((w[0] & 0xffc0) === 0xfe80) return true;                               // fe80::/10 link-local
  if ((w[0] & 0xffc0) === 0xfec0) return true;                               // fec0::/10 site-local
  if ((w[0] & 0xff00) === 0xff00) return true;                               // multicast
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true;                       // documentation
  if (w[0] === 0x2002) return privateV4(v4of(w[1], w[2]));                   // 6to4
  if (w[0] === 0x2001 && w[1] === 0) return true;                            // Teredo
  return false;
}
const isPrivate = ip => (net.isIPv4(ip) ? privateV4(ip) : net.isIPv6(ip) ? privateV6(ip) : true);

module.exports = function embeds({ store, isHost = me => me && me.role === 'host', log = () => {} }) {
  const CFG = '.tribe/chat-settings.json';
  const cfg = () => Object.assign({ previews: true }, store.readJSON(CFG, {}) || {});
  // Tests only (TRIBE_TEST=1): host:port pairs that may be fetched even though they are local (a fake page).
  const testAllow = new Set(process.env.TRIBE_TEST === '1' ? String(process.env.TRIBE_TEST_EMBED_ALLOW || '').split(',').map(s => s.trim()).filter(Boolean) : []);
  const cache = new Map();   // url -> { at, data }
  const remember = (k, data) => { cache.set(k, { at: Date.now(), data }); if (cache.size > 500) cache.delete(cache.keys().next().value); return data; };
  const minute = new Map();   // member -> [times]
  const tooFast = mid => { const now = Date.now(), h = (minute.get(mid) || []).filter(t => now - t < 60_000); h.push(now); minute.set(mid, h); return h.length > 60; };
  setInterval(() => { const now = Date.now(); for (const [k, h] of minute) if (!h.length || now - h[h.length - 1] > 60_000) minute.delete(k); for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k); }, 60_000).unref();

  const blocked = msg => Object.assign(new Error(msg), { blocked: true });
  function checkUrl(raw) {
    let u; try { u = new URL(String(raw)); } catch { throw blocked('not a link'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw blocked('only http and https links');
    if (u.username || u.password) throw blocked('links with passwords are not previewed');
    if (String(raw).length > 2048) throw blocked('link too long');
    return u;
  }
  // Resolve and check every address; returns the one to connect to.
  async function safeAddress(u) {
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    if (testAllow.has(`${host}:${port}`)) return { address: net.isIP(host) ? host : '127.0.0.1', family: net.isIPv6(host) ? 6 : 4 };
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw blocked('private address');
    let addrs;
    if (net.isIP(host)) addrs = [{ address: host, family: net.isIPv6(host) ? 6 : 4 }];
    else { try { addrs = await dns.promises.lookup(host, { all: true, verbatim: true }); } catch { throw blocked('could not find that site'); } }
    if (!addrs.length || addrs.some(a => isPrivate(a.address))) throw blocked('private address');
    return addrs[0];
  }
  // One GET to a checked address; resolves { status, headers, body (Buffer, capped), url }.
  function getOnce(u, addr, cap, accept, deadline, opts = {}) {
    return new Promise((resolve, reject) => {
      const lib = u.protocol === 'https:' ? https : http;
      const lookup = (h, o, cb) => (o && o.all ? cb(null, [{ address: addr.address, family: addr.family }]) : cb(null, addr.address, addr.family));
      const req = lib.request(u, { method: 'GET', lookup, agent: false, timeout: Math.max(200, deadline - Date.now()),
        headers: { 'User-Agent': opts.ua || 'TribeCodeLinkPreview/1.0 (+https://github.com/orionopenwow/TribeCode)', Accept: accept, 'Accept-Language': 'en', 'Accept-Encoding': 'identity' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); return resolve({ status: res.statusCode, headers: res.headers, body: Buffer.alloc(0) }); }
        const chunks = []; let size = 0, done = false;
        const finish = () => { if (done) return; done = true; resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); };
        res.on('data', c => { if (done) return; size += c.length; if (size > cap) { if (cap === PAGE_CAP || opts.truncate) { chunks.push(c.slice(0, c.length - (size - cap))); finish(); req.destroy(); } else { done = true; req.destroy(); reject(blocked('too big')); } return; } chunks.push(c); });
        res.on('end', finish); res.on('error', e => (done ? null : reject(e)));
      });
      const t = setTimeout(() => { req.destroy(blocked('timed out')); }, Math.max(100, deadline - Date.now()));
      req.on('timeout', () => req.destroy(blocked('timed out')));
      req.on('error', e => { clearTimeout(t); reject(e.blocked ? e : blocked('could not reach that site')); });
      req.on('close', () => clearTimeout(t));
      req.end();
    });
  }
  // opts (feat/captures, the link reader): { timeout (ms, max 15 s), truncate (keep the first `cap` bytes instead of failing), ua }.
  // The address checks, DNS pinning and redirect re-checks are the same for every caller.
  async function safeGet(raw, cap, accept, opts = {}) {
    const deadline = Date.now() + Math.min(Math.max(Number(opts.timeout) || TIMEOUT, 500), 15000);
    let u = checkUrl(raw);
    for (let hop = 0; hop <= HOPS; hop++) {
      const addr = await safeAddress(u);
      const r = await getOnce(u, addr, cap, accept, deadline, opts);
      if (r.status >= 300 && r.status < 400) {
        if (!r.headers.location || hop === HOPS) throw blocked('too many redirects');
        u = checkUrl(new URL(r.headers.location, u).href); continue;
      }
      if (r.status !== 200) throw blocked(`the site answered ${r.status}`);
      return { ...r, url: u.href };
    }
    throw blocked('too many redirects');
  }

  // ---------- page -> preview ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
  const decode = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : all;
  });
  const clean = (s, n) => { s = decode(s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  function parse(html, pageUrl) {
    const head = html.slice(0, PAGE_CAP);
    const metas = {};
    for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
      const tag = m[0], attr = k => { const r = new RegExp(`\\b${k}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return r ? (r[2] ?? r[3] ?? r[4] ?? '') : null; };
      const key = (attr('property') || attr('name') || '').toLowerCase(), val = attr('content');
      if (key && val !== null && metas[key] === undefined) metas[key] = val;
    }
    const title = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    const pick = (...k) => { for (const x of k) if (metas[x]) return metas[x]; return ''; };
    let image = pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
    try { image = image ? new URL(decode(image), pageUrl).href : ''; if (image && !/^https?:/.test(image)) image = ''; } catch { image = ''; }
    let site = pick('og:site_name', 'application-name'); if (!site) { try { site = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch {} }
    return { title: clean(pick('og:title', 'twitter:title') || title, 140), description: clean(pick('og:description', 'twitter:description', 'description'), 280), site: clean(site, 60), image: image.slice(0, 2048) || null };
  }
  async function preview(raw) {
    const hit = cache.get(raw); if (hit && Date.now() - hit.at < (hit.data.kind === 'blocked' ? 300_000 : TTL)) return hit.data;   // failures are retried after 5 minutes
    try {
      const r = await safeGet(raw, PAGE_CAP, 'text/html,application/xhtml+xml;q=0.9,image/*;q=0.5');
      const type = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (IMG_TYPES.test(type)) return remember(raw, { url: r.url, kind: 'image', title: '', description: '', site: new URL(r.url).hostname.replace(/^www\./, ''), image: raw });
      if (!/^(text\/html|application\/xhtml\+xml)$/.test(type)) return remember(raw, { url: r.url, kind: 'none' });
      const html = require('./capture-html').decodeBody(r.body, r.headers['content-type']);   // feat/captures: header, BOM, <meta charset>, or a windows-1252 guess
      const p = parse(html, r.url);
      return remember(raw, { url: r.url, kind: p.title || p.description ? 'page' : 'none', ...p });
    } catch (e) {
      return remember(raw, { url: raw, kind: 'blocked', reason: e.blocked ? e.message : 'could not preview' });
    }
  }

  async function route(req, res, { m, b, me, url, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (b === 'settings') {
      if (m === 'GET') return send(res, 200, { previews: cfg().previews });
      if (m === 'PATCH') {
        if (!isHost(me)) return fail(res, 403, 'only the host can change this');
        const body = await readBody(req); const c = cfg();
        if (typeof body.previews === 'boolean') c.previews = body.previews;
        store.writeJSON(CFG, c); return send(res, 200, { previews: c.previews });
      }
      return fail(res, 405, 'GET or PATCH');
    }
    if (m !== 'GET') return fail(res, 405, 'GET only');
    if (!cfg().previews) return send(res, 200, { off: true });
    if (tooFast(me.id)) return fail(res, 429, 'slow down');
    if (!b) {
      const raw = String(url.searchParams.get('url') || '');
      try { checkUrl(raw); } catch (e) { return send(res, 200, { preview: { url: raw, kind: 'blocked', reason: e.message } }); }
      return send(res, 200, { preview: await preview(raw) });
    }
    if (b === 'img') {
      const raw = String(url.searchParams.get('u') || '');
      try {
        const r = await safeGet(raw, IMG_CAP, 'image/avif,image/webp,image/png,image/gif,image/jpeg;q=0.9');
        const type = String(r.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!IMG_TYPES.test(type)) return fail(res, 415, 'not a picture');
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': r.body.length, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=86400', 'Referrer-Policy': 'no-referrer' });
        return res.end(r.body);
      } catch (e) { return fail(res, e.blocked && /private/.test(e.message) ? 403 : 404, e.blocked ? e.message : 'could not load that picture'); }
    }
    return fail(res, 404, 'not found');
  }
  return { route, preview, safeGet, isPrivate, enabled: () => cfg().previews };
};
module.exports.isPrivate = isPrivate;
