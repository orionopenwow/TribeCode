// Work feeds, Phase 2 groundwork (feat/work-v2, docs/WORK-BACKEND.md › Phase 2). A tribe publishes the gigs its people
// chose to make Public as one signed JSON document; another tribe that subscribes to it (pinning the publisher's key)
// can verify and import it. No central server, and this module never fetches a URL: a feed comes in as a body.
//
//   Key   .tribe/work/feed-key.json  { publicKey: base64url raw 32 bytes, privateKey: PKCS#8 PEM }  (file mode 0600)
//         Made on first use with node:crypto ed25519. The private key never leaves this file or this process.
//   Feed  { schema: 'tribecode.workfeed/1', tribe: { name, key }, issued, expires (issued + 7 d), seq, gigs: [bundle] }
//         + signature: { alg: 'ed25519', key, sig }   sig = ed25519(canonical JSON of the feed without `signature`)
//         canonical = JSON with object keys sorted, no whitespace. A bundle is server/talent.js's public gig bundle.
//   Subscriptions  .tribe/work/subscriptions.json  [{ id, name, key, url?, added, by }]  hosts and admins only
//   Imported feeds .tribe/work/feeds/<key>.json   the last verified feed per subscribed key (newer seq wins)
//
// HTTP (members only, under /api/work):
//   GET  /feed.json                 this tribe's signed feed
//   GET  /feed/key                  { key, fingerprint }
//   POST /feed/verify { feed }      { ok, reason?, tribe, gigs }   checks a feed, stores nothing
//   GET  /subscriptions             POST /subscriptions { name, key, url? }   DELETE /subscriptions/<id>
//   POST /import { feed }           verify + the key must be subscribed + newer seq -> stored; returns the clean gigs
//   GET  /imported                  every stored feed's gigs, tagged with the tribe they came from
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const SCHEMA = 'tribecode.workfeed/1';
const MAX_GIGS = 200, MAX_SUBS = 50, WEEK = 7 * 86400000;
const KINDS = ['seat', 'task', 'bounty', 'offer'], PAYS = ['free', 'time', 'paid', 'fun', 'equity'];

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}
const isKey = k => typeof k === 'string' && /^[A-Za-z0-9_-]{43}$/.test(k);
const pubFromRaw = raw => crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw }, format: 'jwk' });
const fingerprint = key => crypto.createHash('sha256').update(key).digest('hex').slice(0, 16).replace(/(.{4})(?!$)/g, '$1-');
const str = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

// Only the fields a public card shows, length-capped; anything else in a feed is dropped.
function cleanGig(g) {
  if (!g || typeof g !== 'object') return null;
  const id = str(g.id, 64), title = str(g.title, 100);
  if (!/^[a-z0-9-]{3,64}$/.test(id) || !title) return null;
  const pay = g.pay && typeof g.pay === 'object' ? { type: PAYS.includes(g.pay.type) ? g.pay.type : 'free', text: str(g.pay.text, 80) } : { type: 'free', text: '' };
  return { id, title, kind: KINDS.includes(g.kind) ? g.kind : 'task', seatKind: str(g.seatKind, 20) || undefined, description: str(g.description, 2000),
    skills: (Array.isArray(g.skills) ? g.skills : []).slice(0, 12).map(s => str(s, 32).toLowerCase()).filter(Boolean), hours: Math.max(0, Math.min(1000, Number(g.hours) || 0)) || undefined,
    pay, contact: str(g.contact, 120), posted: /^\d{4}-\d{2}-\d{2}$/.test(String(g.posted || '')) ? g.posted : undefined };
}

function verify(doc, now = Date.now()) {
  const no = reason => ({ ok: false, reason });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return no('not a feed');
  if (doc.schema !== SCHEMA) return no('unknown feed format');
  const sg = doc.signature;
  if (!sg || sg.alg !== 'ed25519' || !isKey(sg.key) || typeof sg.sig !== 'string' || sg.sig.length > 200) return no('missing or malformed signature');
  if (!doc.tribe || doc.tribe.key !== sg.key) return no('the signing key is not the tribe’s key');
  if (!Array.isArray(doc.gigs) || doc.gigs.length > MAX_GIGS) return no('too many gigs');
  const { signature, ...body } = doc;
  let good = false;
  try { good = crypto.verify(null, Buffer.from(canonical(body)), pubFromRaw(sg.key), Buffer.from(sg.sig, 'base64url')); } catch { good = false; }
  if (!good) return no('the signature does not match');
  const exp = Date.parse(doc.expires), iss = Date.parse(doc.issued);
  if (!(exp > now)) return no('the feed has expired');
  if (!(iss <= now + 5 * 60000)) return no('the feed is dated in the future');
  return { ok: true, key: sg.key, seq: Number(doc.seq) || 0, tribe: { name: str(doc.tribe.name, 40), key: sg.key, fingerprint: fingerprint(sg.key) }, gigs: doc.gigs.map(cleanGig).filter(Boolean) };
}

module.exports = function makeWorkFeed({ base, tribeName, publicGigs, id }) {
  const KEY_FILE = '.tribe/work/feed-key.json';
  let keys = null;
  function keyPair() {
    if (keys) return keys;
    const saved = base.readJSON(KEY_FILE, null);
    if (saved && isKey(saved.publicKey) && saved.privateKey) {
      try { keys = { pub: saved.publicKey, priv: crypto.createPrivateKey(saved.privateKey) }; return keys; } catch { /* unreadable: make a new one */ }
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pub = publicKey.export({ format: 'jwk' }).x, pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const full = base.p(KEY_FILE); fs.mkdirSync(require('node:path').dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify({ publicKey: pub, privateKey: pem, created: new Date().toISOString() }, null, 2), { mode: 0o600 });
    try { fs.chmodSync(full, 0o600); } catch {}
    keys = { pub, priv: privateKey }; return keys;
  }
  function feed(now = Date.now()) {
    const k = keyPair();
    const body = { schema: SCHEMA, tribe: { name: str(tribeName && tribeName(), 40), key: k.pub }, issued: new Date(now).toISOString(), expires: new Date(now + WEEK).toISOString(), seq: now,
      gigs: (publicGigs() || []).map(cleanGig).filter(Boolean).slice(0, MAX_GIGS) };
    return { ...body, signature: { alg: 'ed25519', key: k.pub, sig: crypto.sign(null, Buffer.from(canonical(body)), k.priv).toString('base64url') } };
  }

  const subs = () => base.readJSON('.tribe/work/subscriptions.json', []) || [];
  const lead = me => me && (me.role === 'host' || me.role === 'admin');
  function subscribe(b, me) {
    if (!lead(me)) throw Object.assign(new Error('only the host or an admin subscribes to other tribes'), { status: 403 });
    const key = String((b && b.key) || '').trim(); if (!isKey(key)) throw Object.assign(new Error('paste the other tribe’s feed key (43 characters)'), { status: 400 });
    if (key === keyPair().pub) throw Object.assign(new Error('that is this tribe’s own key'), { status: 400 });
    const list = subs(); if (list.some(s => s.key === key)) throw Object.assign(new Error('already subscribed'), { status: 409 });
    if (list.length >= MAX_SUBS) throw Object.assign(new Error(`at most ${MAX_SUBS} subscriptions`), { status: 400 });
    let url = str(b.url, 300); try { if (url && !/^https:$/.test(new URL(url).protocol)) url = ''; } catch { url = ''; }
    const s = { id: id ? id() : crypto.randomBytes(6).toString('hex'), name: str(b.name, 40) || 'A tribe', key, fingerprint: fingerprint(key), url: url || undefined, added: new Date().toISOString(), by: me.id };
    fs.mkdirSync(base.p('.tribe/work'), { recursive: true });
    base.writeJSON('.tribe/work/subscriptions.json', [...list, s]); return s;
  }
  function unsubscribe(sid, me) {
    if (!lead(me)) throw Object.assign(new Error('only the host or an admin changes subscriptions'), { status: 403 });
    const list = subs(), s = list.find(x => x.id === sid); if (!s) throw Object.assign(new Error('no such subscription'), { status: 404 });
    base.writeJSON('.tribe/work/subscriptions.json', list.filter(x => x !== s));
    try { fs.rmSync(base.p(`.tribe/work/feeds/${s.key}.json`), { force: true }); } catch {}
    return { ok: true };
  }
  function importFeed(doc) {
    const v = verify(doc); if (!v.ok) throw Object.assign(new Error(v.reason), { status: 400 });
    const s = subs().find(x => x.key === v.key); if (!s) throw Object.assign(new Error('this tribe isn’t subscribed to that feed’s key'), { status: 403 });
    const rel = `.tribe/work/feeds/${v.key}.json`, prev = base.readJSON(rel, null);
    if (prev && prev.seq >= v.seq) return { stored: false, reason: 'already have this or a newer copy', tribe: { ...v.tribe, name: s.name }, gigs: prev.gigs };
    fs.mkdirSync(base.p('.tribe/work/feeds'), { recursive: true });
    base.writeJSON(rel, { seq: v.seq, at: new Date().toISOString(), expires: doc.expires, tribe: v.tribe.name, gigs: v.gigs });
    return { stored: true, tribe: { ...v.tribe, name: s.name }, gigs: v.gigs };
  }
  function imported(now = Date.now()) {
    const out = [];
    for (const s of subs()) { const f = base.readJSON(`.tribe/work/feeds/${s.key}.json`, null); if (f && Date.parse(f.expires) > now) for (const g of f.gigs || []) out.push({ ...g, tribe: s.name, from: s.fingerprint }); }
    return out;
  }

  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member');
    try {
      if (b === 'feed.json' && m === 'GET') { res.setHeader && res.setHeader('Cache-Control', 'no-store'); return send(res, 200, feed()); }
      if (b === 'feed' && c === 'key' && m === 'GET') { const k = keyPair().pub; return send(res, 200, { key: k, fingerprint: fingerprint(k) }); }
      if (b === 'feed' && c === 'verify' && m === 'POST') { const v = verify(((await readBody(req)) || {}).feed); return send(res, 200, v); }
      if (b === 'subscriptions' && !c && m === 'GET') return send(res, 200, { subscriptions: subs() });
      if (b === 'subscriptions' && !c && m === 'POST') return send(res, 200, { subscription: subscribe((await readBody(req)) || {}, me) });
      if (b === 'subscriptions' && c && m === 'DELETE') return send(res, 200, unsubscribe(c, me));
      if (b === 'import' && m === 'POST') return send(res, 200, importFeed(((await readBody(req)) || {}).feed));
      if (b === 'imported' && m === 'GET') return send(res, 200, { gigs: imported() });
      return fail(res, 404, 'no such work route');
    } catch (e) { return fail(res, e.status || 500, e.message); }
  }
  return { route, feed, verify, canonical, keyPair: () => ({ pub: keyPair().pub }) };
};
module.exports.verify = verify;
module.exports.canonical = canonical;
