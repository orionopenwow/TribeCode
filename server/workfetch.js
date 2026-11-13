// The careful fetch for other tribes' gig feeds (feat/build-feeds, docs/WORK-BACKEND.md › Phase 2). This is the one
// place the server fetches a URL a person typed for another server, so it is strict:
//
//   · https only. (http is allowed for localhost only when the caller passes allowLocal: tests, and TRIBE_FEED_ALLOW_LOCAL=1.)
//   · No credentials in the URL. Port 443 or 1024+.
//   · The host name is resolved first and EVERY address it resolves to is checked: private, loopback, link-local,
//     carrier-grade NAT, metadata (169.254.169.254, fd00:ec2::254), multicast, documentation and IPv4-mapped ranges are
//     refused. If any one address is not public, the whole fetch is refused.
//   · The connection is pinned to the address that was checked (a custom lookup hands the socket that address and
//     nothing else), so a DNS answer that changes between the check and the connect (rebinding) can't move it.
//   · Redirects: followed at most twice and only to the same host and port over https; anything else is refused.
//     Each hop is resolved, checked and pinned again.
//   · A size cap (streamed; the socket is destroyed past it), a total time limit, and a content type that must be JSON
//     (or text/plain, which static hosts use for raw JSON). No cookies, no auth headers, nothing of ours is sent.
//
//   safeFetch(url, { etag?, maxBytes?, timeoutMs?, allowLocal?, lookup?, request? }) ->
//     { status: 200, text, etag } | { status: 304 }      throws Error with .code = 'refused' | 'failed'
'use strict';
const dns = require('node:dns');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');

const MAX_BYTES = 256 * 1024, TIMEOUT = 10_000, MAX_HOPS = 2;
const refuse = msg => Object.assign(new Error(msg), { code: 'refused' });
const failed = msg => Object.assign(new Error(msg), { code: 'failed' });

function v4ok(ip) {
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some(n => !(n >= 0 && n <= 255))) return false;
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return false;            // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false;            // carrier-grade NAT
  if (a === 169 && b === 254) return false;                      // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;             // private
  if (a === 192 && b === 168) return false;                      // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocol assignments, documentation
  if (a === 192 && b === 88 && c === 99) return false;           // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false;         // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;          // documentation
  if (a === 203 && b === 0 && c === 113) return false;           // documentation
  if (a >= 224) return false;                                    // multicast, reserved, broadcast
  return true;
}
function v6parts(ip) {   // -> 8 numbers, or null
  let s = String(ip).toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) { const q = tail[1].split('.').map(Number); if (q.some(n => !(n >= 0 && n <= 255))) return null; s = s.slice(0, -tail[1].length) + ((q[0] << 8) | q[1]).toString(16) + ':' + ((q[2] << 8) | q[3]).toString(16); }
  const halves = s.split('::'); if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [], rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const fill = 8 - head.length - rest.length; if (fill < 0) return null;
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...rest].map(h => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  return all.length === 8 && !all.some(Number.isNaN) ? all : null;
}
function v6ok(ip) {
  const p = v6parts(ip); if (!p) return false;
  const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  if (p.slice(0, 7).every(n => n === 0)) return false;                                  // :: and ::1
  if (p.slice(0, 5).every(n => n === 0) && p[5] === 0xffff) return v4ok(v4(p[6], p[7])); // ::ffff:a.b.c.d (mapped)
  if (p.slice(0, 6).every(n => n === 0)) return false;                                  // ::a.b.c.d (deprecated compatible)
  if (p[0] === 0x64 && p[1] === 0xff9b) return p.slice(2, 6).every(n => n === 0) && v4ok(v4(p[6], p[7]));   // NAT64
  if (p[0] === 0x2002) return v4ok(v4(p[1], p[2]));                                     // 6to4 carries an IPv4 address
  if (p[0] === 0x2001 && p[1] === 0) return false;                                      // Teredo
  if (p[0] === 0x2001 && p[1] === 0xdb8) return false;                                  // documentation
  if ((p[0] & 0xfe00) === 0xfc00) return false;                                         // unique local (fd00:ec2::254 too)
  if ((p[0] & 0xffc0) === 0xfe80) return false;                                         // link-local
  if ((p[0] & 0xffc0) === 0xfec0) return false;                                         // site-local (old)
  if ((p[0] & 0xff00) === 0xff00) return false;                                         // multicast
  return (p[0] & 0xe000) === 0x2000;                                                    // global unicast only
}
const isPublic = ip => { const f = net.isIP(String(ip).replace(/^\[|\]$/g, '')); return f === 4 ? v4ok(ip) : f === 6 ? v6ok(ip) : false; };
const isLoopback = ip => { const s = String(ip).replace(/^\[|\]$/g, ''); return net.isIP(s) === 4 ? s.startsWith('127.') : s === '::1'; };

// Parse and check the URL itself. -> URL
function checkUrl(raw, { allowLocal = false } = {}) {
  let u; try { u = new URL(String(raw)); } catch { throw refuse('That is not a web address.'); }
  if (u.username || u.password) throw refuse('A feed address can’t carry a user name or password.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const local = allowLocal && (host === 'localhost' || isLoopback(host));
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw refuse('A feed address must start with https://');
  const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
  if (!local && port !== 443 && port < 1024) throw refuse('That port isn’t allowed for a feed.');
  if (!host || /[\s\\]/.test(host)) throw refuse('That is not a web address.');
  return u;
}
// Resolve the host and check every address. -> { address, family }
async function resolveChecked(u, { allowLocal = false, lookup = dns.lookup } = {}) {
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host, family: net.isIP(host) }];
  else {
    addrs = await new Promise((res, rej) => lookup(host, { all: true, verbatim: true }, (e, list) => (e ? rej(failed(`Couldn’t find ${host}.`)) : res(Array.isArray(list) ? list : [{ address: list, family: net.isIP(list) }]))));
    if (!addrs.length) throw failed(`Couldn’t find ${host}.`);
  }
  for (const a of addrs) {
    if (!net.isIP(a.address)) throw refuse('The feed’s address didn’t resolve to an IP address.');
    if (allowLocal && isLoopback(a.address) && (host === 'localhost' || isLoopback(host))) continue;
    if (!isPublic(a.address)) throw refuse('That address points at a private or local network, so it won’t be fetched.');
  }
  return { address: addrs[0].address, family: addrs[0].family || net.isIP(addrs[0].address) };
}
function getOnce(u, pin, { etag, maxBytes, deadline, request }) {
  return new Promise((res, rej) => {
    const mod = request || (u.protocol === 'https:' ? https.request : http.request);
    const left = deadline - Date.now(); if (left <= 0) return rej(failed('The feed took too long.'));
    // the socket may only ever connect to the address that was checked
    const lookup = (h, o, cb) => { if (typeof o === 'function') { cb = o; o = {}; } return o && o.all ? cb(null, [{ address: pin.address, family: pin.family }]) : cb(null, pin.address, pin.family); };
    const req = mod({ protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined, path: u.pathname + u.search, method: 'GET', lookup, agent: false, servername: net.isIP(u.hostname.replace(/^\[|\]$/g, '')) ? undefined : u.hostname,
      headers: { Accept: 'application/json', 'User-Agent': 'TribeCode-feed', 'Accept-Encoding': 'identity', ...(etag ? { 'If-None-Match': etag } : {}) } }, r => {
      const done = v => { clearTimeout(timer); res(v); };
      const st = r.statusCode;
      if (st >= 300 && st < 400 && st !== 304) { r.resume(); return done({ redirect: String(r.headers.location || '') }); }
      if (st === 304) { r.resume(); return done({ status: 304 }); }
      if (st !== 200) { r.destroy(); clearTimeout(timer); return rej(failed(`The feed’s server answered ${st}.`)); }
      const type = String(r.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
      if (!/^(application\/([\w.-]+\+)?json|text\/plain)$/.test(type)) { r.destroy(); clearTimeout(timer); return rej(refuse('That address didn’t answer with a feed (JSON).')); }
      if (Number(r.headers['content-length']) > maxBytes) { r.destroy(); clearTimeout(timer); return rej(refuse('The feed is too large.')); }
      const chunks = []; let n = 0;
      r.on('data', c => { n += c.length; if (n > maxBytes) { r.destroy(); req.destroy(); clearTimeout(timer); rej(refuse('The feed is too large.')); } else chunks.push(c); });
      r.on('end', () => done({ status: 200, text: Buffer.concat(chunks).toString('utf8'), etag: String(r.headers.etag || '').slice(0, 200) || null }));
      r.on('error', () => { clearTimeout(timer); rej(failed('The feed stopped part-way.')); });
    });
    const timer = setTimeout(() => { req.destroy(); rej(failed('The feed took too long.')); }, left);
    req.on('error', e => { clearTimeout(timer); rej(e.code === 'refused' || e.code === 'failed' ? e : failed('Couldn’t reach the feed’s server.')); });
    req.end();
  });
}
async function safeFetch(raw, opts = {}) {
  const maxBytes = opts.maxBytes || MAX_BYTES, deadline = Date.now() + (opts.timeoutMs || TIMEOUT);
  let u = checkUrl(raw, opts);
  for (let hop = 0; ; hop++) {
    const pin = await resolveChecked(u, opts);
    const r = await getOnce(u, pin, { etag: opts.etag, maxBytes, deadline, request: opts.request });
    if (!r.redirect && r.redirect !== '') return r;
    if (hop >= MAX_HOPS) throw refuse('The feed redirects too many times.');
    let next; try { next = new URL(r.redirect, u); } catch { throw refuse('The feed redirects somewhere that isn’t a web address.'); }
    if (next.protocol !== u.protocol || next.host !== u.host) throw refuse('The feed redirects to a different address, so it wasn’t followed. Subscribe to the final address instead.');
    u = checkUrl(next.href, opts);
  }
}

module.exports = { safeFetch, checkUrl, resolveChecked, isPublic, v4ok, v6ok, MAX_BYTES, TIMEOUT };
