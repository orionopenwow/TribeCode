// fix/security-2: signed, short-lived media links (server/media.js).
// Pictures, voice notes, files, screenshots and other bytes the page loads by URL (<img src>, <audio src>, download links)
// used to carry the full sign-in key as ?token=. Now the page asks the server once for a media key (GET /api/media/key,
// about an hour) and signs each link itself: ?mt=mt1.<member>.<exp>.<tok>.<HMAC(media key, path?query)>. A link opens
// that one resource, read-only, until it expires (or the device is signed out). Signing is synchronous (a small SHA-256
// below), so feature code can keep building URLs inside template strings:
//   window.TribeMedia = { url(u), ready(), refresh() }
//   TribeMedia.url(`${C.base()}/api/chat/${ch}/media/${f}`) -> the same URL with ?mt=…
// Until the first key arrives a link says mt=pending; when the key comes, those links on the page are signed in place.
// Servers older than this file (no /api/media/key) still get the old ?token= links, so the desktop app can open them.
(function () {
  'use strict';
  const S = window.TribeStore, C = () => window.TribeClient;

  // ---------- SHA-256 + HMAC (FIPS 180-4, RFC 2104), synchronous ----------
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
    0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(msg) {
    const len = msg.length, n = ((len + 9 + 63) >> 6) << 6, b = new Uint8Array(n);
    b.set(msg); b[len] = 0x80;
    const dv = new DataView(b.buffer); dv.setUint32(n - 8, Math.floor(len / 0x20000000)); dv.setUint32(n - 4, (len << 3) >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
    const rot = (x, r) => (x >>> r) | (x << (32 - r));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], c = W[i - 2];
        W[i] = (W[i - 16] + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + W[i - 7] + (rot(c, 17) ^ rot(c, 19) ^ (c >>> 10))) >>> 0;
      }
      let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
  }
  const utf8 = s => new TextEncoder().encode(s);
  const cat = (x, y) => { const o = new Uint8Array(x.length + y.length); o.set(x); o.set(y, x.length); return o; };
  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64); k.set(key);
    return sha256(cat(k.map(x => x ^ 0x5c), sha256(cat(k.map(x => x ^ 0x36), msg))));
  }
  const b64url = u8 => btoa(String.fromCharCode.apply(null, u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  const hex = u8 => Array.from(u8, x => x.toString(16).padStart(2, '0')).join('');

  // ---------- the media key ----------
  const LS = 'tribecode.mediaKey';
  const token = () => ((S && S.get().server) || {}).token || '';
  let fpMemo = { t: null, f: '' };
  const fp = t => (fpMemo.t === t ? fpMemo.f : (fpMemo = { t, f: hex(sha256(utf8(t))).slice(0, 12) }).f);
  let mk = null, inflight = null, legacy = {};
  try { mk = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
  const left = k => Date.parse(k.expires) - Date.now();
  function current() {
    const t = token(); if (!t || !mk) return null;
    return mk.base === C().base() && mk.tok === fp(t) && left(mk) > 60_000 ? mk : null;
  }
  function refresh() {
    if (inflight || !token() || !C() || !C().api) return inflight;
    const base = C().base();
    inflight = C().api('/media/key').then(k => {
      mk = { ...k, base }; try { localStorage.setItem(LS, JSON.stringify(mk)); } catch {}
      fixPending();
    }).catch(e => { if (e && e.status === 404) { legacy[base] = true; fixPending(); } }).finally(() => { inflight = null; });
    return inflight;
  }

  // ---------- signing ----------
  function url(u) {
    if (!u || !C()) return u;
    if (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active()) return u;
    let x, base; try { base = new URL(C().base()); x = new URL(u, base); } catch { return u; }
    if (x.origin !== base.origin || !/^\/api\//.test(x.pathname)) return u;
    x.searchParams.delete('token'); x.searchParams.delete('mt');
    if (legacy[base.origin] || legacy[C().base()]) { x.searchParams.set('token', token()); return x.href; }   // a server from before signed links
    const k = current();
    if (!k) { refresh(); x.searchParams.set('mt', 'pending'); return x.href; }
    if (left(k) < 15 * 60_000) refresh();   // links made now still last a while; the next ones use a fresh key
    const q = x.searchParams.toString();
    const sig = b64url(hmac(unb64url(k.key), utf8(x.pathname + (q ? '?' + q : ''))));
    x.searchParams.set('mt', `mt1.${k.member}.${k.exp}.${k.tok}.${sig}`);
    return x.href;
  }
  // Links made before the key arrived: sign them where they are (img/audio/video/source/a, data-* used by previews, inline styles).
  const ATTRS = ['src', 'href', 'poster', 'data-preview-img', 'data-src', 'data-full', 'data-view-src', 'data-href'];
  function fixPending() {
    if (!current() && !legacy[C().base()]) return;
    for (const a of ATTRS) document.querySelectorAll(`[${a}*="mt=pending"]`).forEach(el => el.setAttribute(a, url(el.getAttribute(a))));
    document.querySelectorAll('[style*="mt=pending"]').forEach(el => el.setAttribute('style', el.getAttribute('style').replace(/url\((["']?)([^"')]+mt=pending[^"')]*)\1\)/g, (all, qt, u) => `url(${qt}${url(u.replace(/&amp;/g, '&'))}${qt})`)));
  }

  // Have a key ready before the first picture renders, and keep it fresh while the page is open.
  const warm = () => { if (token() && !current()) refresh(); };
  if (C() && C().on) { C().on('hello', warm); C().on('status', s => { if (s && s.status === 'online') warm(); }); }
  setTimeout(warm, 0);
  setInterval(() => { const k = current(); if (token() && (!k || left(k) < 15 * 60_000)) refresh(); }, 5 * 60_000);

  // For links that never sit in the page (new Image(), fetch(), new Audio()): wait for the key first (a few seconds at most).
  async function urlAsync(u) {
    for (let i = 0; i < 3 && !current() && !(C() && legacy[C().base()]) && token(); i++) { try { await refresh(); } catch {} if (!current()) await new Promise(r => setTimeout(r, 300)); }
    return url(u);
  }
  window.TribeMedia = { url, urlAsync, ready: () => !!current(), refresh, _hmac: (k, m) => b64url(hmac(unb64url(k), utf8(m))), _sha256hex: s => hex(sha256(utf8(s))) };
})();
