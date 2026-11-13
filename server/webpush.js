// Web Push with node:crypto only: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291 / RFC 8188).
//   const wp = require('./webpush');
//   const keys = wp.loadVapid(store);                         // generated once into .tribe/vapid.json
//   await wp.send(subscription, JSON.stringify(payload), keys, { subject, ttl, urgency });
'use strict';
const crypto = require('node:crypto');

const b64u = buf => Buffer.from(buf).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');

// ---------- VAPID ----------
function generateVapid() {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()), created: new Date().toISOString() };
}
function loadVapid(store, env = process.env) {
  // loops: hosts whose files are wiped (Render's free plan) set the keys as environment variables, so phones that turned
  // push on keep getting notifications after every sleep. Make a pair with `node scripts/dev/vapid-keys.js`.
  const pub = env.TRIBE_VAPID_PUBLIC, priv = env.TRIBE_VAPID_PRIVATE;
  if (pub && priv) {
    try { const k = { publicKey: String(pub).trim(), privateKey: String(priv).trim(), from: 'env' }; privateKeyObject(k); return k; }
    catch (e) { console.error('  TRIBE_VAPID_PUBLIC / TRIBE_VAPID_PRIVATE are not a valid P-256 key pair; using the saved keys instead.'); }
  }
  let k = store.readJSON('.tribe/vapid.json', null);
  if (!k || !k.publicKey || !k.privateKey) { k = generateVapid(); store.writeJSON('.tribe/vapid.json', k); }
  return k;
}
// Raw P-256 keys -> KeyObjects (JWK is the only zero-dependency import path for raw EC keys).
function jwkFor(publicKey, privateKey) {
  const pub = unb64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('expected an uncompressed P-256 public key');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
  if (privateKey) jwk.d = b64u(unb64u(privateKey));
  return jwk;
}
const privateKeyObject = k => crypto.createPrivateKey({ key: jwkFor(k.publicKey, k.privateKey), format: 'jwk' });
const publicKeyObject = publicKey => crypto.createPublicKey({ key: jwkFor(publicKey), format: 'jwk' });

// ES256 JWT for the push service: aud = origin of the endpoint, exp <= 24h, sub = contact.
function vapidJwt({ aud, sub, exp }, keys) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: exp || Math.floor(Date.now() / 1000) + 12 * 3600, sub }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKeyObject(keys), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}
function verifyJwt(jwt, publicKey) {
  const [h, p, s] = String(jwt).split('.');
  if (!s) return false;
  return crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKeyObject(publicKey), dsaEncoding: 'ieee-p1363' }, unb64u(s));
}

// ---------- RFC 8291 content encryption ----------
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
function deriveKeys({ authSecret, ecdhSecret, uaPublic, asPublic, salt }) {
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  return { prkKey, ikm, prk, cek, nonce };
}

// Encrypt one record. `opts.salt` and `opts.asPrivate` exist only so the RFC test vector is reproducible.
function encrypt(payload, { p256dh, auth }, opts = {}) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const as = crypto.createECDH('prime256v1');
  if (opts.asPrivate) as.setPrivateKey(unb64u(opts.asPrivate)); else as.generateKeys();
  const asPublic = as.getPublicKey();
  const salt = opts.salt ? unb64u(opts.salt) : crypto.randomBytes(16);
  const ecdhSecret = as.computeSecret(uaPublic);
  const { cek, nonce } = deriveKeys({ authSecret, ecdhSecret, uaPublic, asPublic, salt });
  const rs = 4096;
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);   // single (last) record, no padding
  if (plain.length + 16 > rs) throw new Error('push payload too large');
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(rs, 16); header[20] = asPublic.length;
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  return Buffer.concat([header, asPublic, body]);
}

// The user agent side (browsers do this); used by tests to prove the round trip.
function decrypt(message, { uaPrivate, auth }) {
  const msg = Buffer.from(message);
  const salt = msg.subarray(0, 16), idlen = msg[20], asPublic = msg.subarray(21, 21 + idlen), data = msg.subarray(21 + idlen);
  const ua = crypto.createECDH('prime256v1'); ua.setPrivateKey(unb64u(uaPrivate));
  const uaPublic = ua.getPublicKey();
  const ecdhSecret = ua.computeSecret(asPublic);
  const { cek, nonce } = deriveKeys({ authSecret: unb64u(auth), ecdhSecret, uaPublic, asPublic, salt });
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  let end = plain.length - 1; while (end >= 0 && plain[end] === 0) end--;        // strip padding
  if (plain[end] !== 2) throw new Error('bad record delimiter');
  return plain.subarray(0, end);
}

// ---------- delivery ----------
async function send(subscription, payload, keys, { subject = 'https://github.com/orionopenwow/TribeCode', ttl = 3600, urgency = 'normal', fetchImpl = globalThis.fetch } = {}) {
  const endpoint = new URL(subscription.endpoint);
  const jwt = vapidJwt({ aud: endpoint.origin, sub: subject }, keys);
  const body = encrypt(payload, subscription.keys || {});
  const res = await fetchImpl(subscription.endpoint, {
    method: 'POST', body,
    headers: { TTL: String(ttl), Urgency: urgency, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: `vapid t=${jwt}, k=${keys.publicKey}` },
  });
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}

module.exports = { generateVapid, loadVapid, vapidJwt, verifyJwt, encrypt, decrypt, deriveKeys, send, b64u, unb64u };
