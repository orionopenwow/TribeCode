// fix/security-2: short-lived, signed, read-only media links (pictures, voice notes, files, screenshots, PLAN.md).
// Before, <img src> / <audio src> / download links carried the member's full sign-in key as ?token=. A link copied out of
// the app (or left in a log, a proxy, a screenshot of devtools) was a key to the whole account until that device was signed out.
//
// Now each link carries `mt=mt1.<member>.<exp>.<tok>.<sig>`:
//   mediaKey = HMAC-SHA256(tribe secret, "mk1|<member>|<exp>|<tok>")      handed to the signed-in page by GET /api/media/key
//   sig      = HMAC-SHA256(mediaKey, "<path>?<query without mt/token>")   computed in the page (app/ui/media.js), per link
// so one link opens exactly one resource (path + query, e.g. ?project=), for GET/HEAD only, until <exp> (about an hour),
// and only while the sign-in key it came from (<tok> = first 12 hex chars of that key's SHA-256) is still valid: signing a
// device out kills its media links at once. The member's normal checks still run on the request (DM membership, project
// visibility, guest expiry), because the link signs in as that member and nothing more. The page keeps the media key in
// memory/localStorage like the sign-in key itself; a leaked link never reveals it (HMAC is one-way).
// Only the media routes in MEDIA_PATH accept a media link. Old ?token= links keep working for a deprecation window
// (authed() in server/index.js) but the app no longer makes them.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const TTL = 60 * 60_000;          // a key (and every link made with it) lasts about an hour
const STEP = 10 * 60_000;         // expiries land on 10-minute steps, so links stay the same (cacheable) for a while
const MAX_AHEAD = 2 * TTL;        // never accept an expiry further out than this (clock games)
const MT_RE = /^mt1\.([A-Za-z0-9_-]{1,64})\.([0-9a-z]{1,12})\.([0-9a-f]{12})\.([A-Za-z0-9_-]{32,64})$/;
// The routes a media link may open (read-only bytes). Anything else needs the real sign-in key.
const MEDIA_PATH = /^\/api\/(chat\/[^/]+\/media\/[^/]+|profile\/media\/[^/]+|uploads\/[^/]+\/raw|visuals\/[^/]+\/[^/]+\.png|bugs\/[^/]+\/files\/[^/]+|embeds\/img|channels\/[^/]+\/bg\/[^/]+|files\/raw\/.+|flow\/plan|thumb\/file|captures\/[^/]+\/(thumb|audio))$/;

module.exports = function makeMedia({ dir, getMembers, deviceTokens = () => [], now = () => Date.now() }) {
  const file = path.join(dir, '.tribe', 'media-secret');
  let secret;
  try { secret = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex'); } catch {}
  if (!secret || secret.length < 32) {
    secret = crypto.randomBytes(32);
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, secret.toString('hex'), { mode: 0o600 }); } catch {}
  }
  const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest('base64url');
  const keyFor = (mid, exp, tok) => hmac(secret, `mk1|${mid}|${exp}|${tok}`);
  // What a link signs: its path and its query minus mt/token, serialized the WHATWG way (same in the page and here).
  function canonical(u) {
    const q = new URLSearchParams(u.searchParams); q.delete('mt'); q.delete('token');
    const s = q.toString();
    return u.pathname + (s ? '?' + s : '');
  }
  // GET /api/media/key: for the page that is signed in with a real key (tokenHash = SHA-256 hex of that key).
  function issue(me, tokenHash) {
    const exp = Math.ceil((now() + TTL - STEP) / STEP) * STEP;   // 50-60 minutes from now
    const tok = String(tokenHash || '').slice(0, 12);
    const e36 = exp.toString(36);
    return { member: me.id, exp: e36, expires: new Date(exp).toISOString(), tok, key: keyFor(me.id, e36, tok) };
  }
  const sign = (k, mid, e36, tok, u) => `mt1.${mid}.${e36}.${tok}.${hmac(Buffer.from(k, 'base64url'), canonical(u))}`;   // tests and server-made links
  // The member a media link signs in as, or null. `u` is the request URL (new URL(req.url, base)).
  function verify(req, u, mt) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return null;
    if (!MEDIA_PATH.test(u.pathname)) return null;
    const m = MT_RE.exec(String(mt || '')); if (!m) return null;
    const [, mid, e36, tok, sig] = m;
    const exp = parseInt(e36, 36);
    if (!(exp > now()) || exp - now() > MAX_AHEAD) return null;
    const want = Buffer.from(hmac(Buffer.from(keyFor(mid, e36, tok), 'base64url'), canonical(u))), got = Buffer.from(sig);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    const mem = getMembers().find(x => x.id === mid);
    if (!mem) return null;
    // the sign-in key it came from must still be live (signed-out devices and replaced keys lose their links)
    const live = String(mem.tokenHash || '').startsWith(tok) || deviceTokens(mid).some(th => String(th).startsWith(tok));
    return live ? mem : null;
  }
  return { issue, verify, sign, canonical, MEDIA_PATH, TTL };
};
