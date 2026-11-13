// Work feeds, Phase 2 groundwork (feat/work-v2, docs/WORK-BACKEND.md › Phase 2). A tribe publishes the gigs its people
// chose to make Public as one signed JSON document; another tribe that subscribes to it (pinning the publisher's key)
// can verify and import it. No central server. Phase 2 (feat/build-feeds): subscribed feeds are fetched on a schedule
// through server/workfetch.js (https only, every resolved address checked and pinned, no cross-host redirects, a size
// cap, a timeout), verified against the pinned key, and stored on disk; Gigs › Public reads them from there.
//
//   Key   .tribe/work/feed-key.json  { publicKey: base64url raw 32 bytes, privateKey: PKCS#8 PEM }  (file mode 0600)
//         Made on first use with node:crypto ed25519. The private key never leaves this file or this process.
//   Feed  { schema: 'tribecode.workfeed/1', tribe: { name, key }, issued, expires (issued + 7 d), seq, gigs: [bundle] }
//         + signature: { alg: 'ed25519', key, sig }   sig = ed25519(canonical JSON of the feed without `signature`)
//         canonical = JSON with object keys sorted, no whitespace. A bundle is server/talent.js's public gig bundle.
//   Subscriptions  .tribe/work/subscriptions.json  [{ id, name, key, url?, paused?, blocked?, added, by }]  hosts and admins only
//   Fetch state    .tribe/work/fetch-state.json    { <sub id>: { etag, lastTry, lastOk, fails, error, nextAt } }  (per-host backoff)
//   Settings       .tribe/work/settings.json       { publish: 'members' | 'open', hidden: ['<key>:<gig id>'] }
//   Requests       .tribe/work/requests.json       [{ id, to: <their key>, gig, title, note, contact, by, at }]  ours, sent out
//                  A request rides in THIS tribe's signed feed (feed.requests). The other tribe sees it only if it
//                  subscribes to us and fetches our feed; otherwise the person copies a message and sends it themselves.
//   Imported feeds .tribe/work/feeds/<key>.json   the last verified feed per subscribed key (newer seq wins)
//
// HTTP (members only unless noted, under /api/work):
//   GET  /feed.json                 this tribe's signed feed (no sign-in needed when the host set publish: 'open'; rate-limited)
//   GET  /admin                     hosts and admins: { publish, key, fingerprint, subscriptions with fetch state, hidden }
//   PUT  /settings { publish }      hosts and admins
//   POST /subscriptions { url, fingerprint }   subscribe by address: fetched safely, and the feed's key must match the fingerprint
//   PATCH /subscriptions/<id> { paused?, blocked?, name? }
//   POST /fetch { id? }             fetch now (hosts and admins)
//   POST /hide { key, gig, hidden } hide one imported gig for this tribe (hosts and admins)
//   GET  /requests                  { sent (yours; all for leads), received (leads: requests other tribes' feeds address to us) }
//   POST /requests { from, gig, note, contact }   ask about another tribe's gig -> { request, message (to copy), delivery }
//   GET  /feed/key                  { key, fingerprint }
//   POST /feed/verify { feed }      { ok, reason?, tribe, gigs }   checks a feed, stores nothing
//   GET  /subscriptions             POST /subscriptions { name, key, url? }   DELETE /subscriptions/<id>
//   POST /import { feed }           verify + the key must be subscribed + newer seq -> stored; returns the clean gigs
//   GET  /imported                  every stored feed's gigs, tagged with the tribe they came from
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const SCHEMA = 'tribecode.workfeed/1';
const MAX_GIGS = 200, MAX_SUBS = 50, MAX_REQ = 100, WEEK = 7 * 86400000;
const FETCH_MS = () => Number(process.env.TRIBE_WORK_FETCH_MS) || 45 * 60000;   // how often subscribed feeds are pulled
const BACKOFF_MS = () => Number(process.env.TRIBE_WORK_BACKOFF_MS) || 5 * 60000;   // first wait after a failure; doubles, up to a day
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

// A contact request another tribe put in its feed: only these fields, length-capped.
function cleanRequest(r) {
  if (!r || typeof r !== 'object' || !isKey(r.to)) return null;
  const id = str(r.id, 40), gig = str(r.gig, 64);
  if (!/^[a-z0-9-]{3,40}$/.test(id) || !/^[a-z0-9-]{3,64}$/.test(gig)) return null;
  return { id, to: r.to, gig, title: str(r.title, 100), note: str(r.note, 500), contact: str(r.contact, 120), from: str(r.from, 40), at: /^\d{4}-\d{2}-\d{2}T/.test(String(r.at || '')) ? String(r.at).slice(0, 24) : undefined };
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
  return { ok: true, key: sg.key, seq: Number(doc.seq) || 0, tribe: { name: str(doc.tribe.name, 40), key: sg.key, fingerprint: fingerprint(sg.key) }, gigs: doc.gigs.map(cleanGig).filter(Boolean),
    requests: (Array.isArray(doc.requests) ? doc.requests : []).slice(0, MAX_REQ).map(cleanRequest).filter(Boolean) };
}

module.exports = function makeWorkFeed({ base, tribeName, publicGigs, id, fetcher = null, publicBase = () => null, memberName = m => (m && m.name) || '', log = () => {}, schedule = true }) {
  const { safeFetch } = require('./workfetch');
  const pull = fetcher || safeFetch;
  const allowLocal = process.env.TRIBE_FEED_ALLOW_LOCAL === '1';   // tests: two tribes on localhost
  const KEY_FILE = '.tribe/work/feed-key.json';
  const fail = (status, msg) => Object.assign(new Error(msg), { status });
  const dir = () => fs.mkdirSync(base.p('.tribe/work'), { recursive: true });
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
  const settings = () => { const d = base.readJSON('.tribe/work/settings.json', null) || {}; return { publish: d.publish === 'open' ? 'open' : 'members', hidden: Array.isArray(d.hidden) ? d.hidden.filter(x => typeof x === 'string').slice(0, 500) : [] }; };
  const saveSettings = d => { dir(); base.writeJSON('.tribe/work/settings.json', d); };
  const sent = () => base.readJSON('.tribe/work/requests.json', []) || [];
  function feed(now = Date.now()) {
    const k = keyPair();
    const reqs = sent().filter(r => now - Date.parse(r.at) < 2 * WEEK).slice(-MAX_REQ).map(r => cleanRequest({ ...r, from: r.byName })).filter(Boolean);
    const body = { schema: SCHEMA, tribe: { name: str(tribeName && tribeName(), 40), key: k.pub }, issued: new Date(now).toISOString(), expires: new Date(now + WEEK).toISOString(), seq: now,
      gigs: (publicGigs() || []).map(cleanGig).filter(Boolean).slice(0, MAX_GIGS), ...(reqs.length ? { requests: reqs } : {}) };
    return { ...body, signature: { alg: 'ed25519', key: k.pub, sig: crypto.sign(null, Buffer.from(canonical(body)), k.priv).toString('base64url') } };
  }

  const subs = () => base.readJSON('.tribe/work/subscriptions.json', []) || [];
  const saveSubs = list => { dir(); base.writeJSON('.tribe/work/subscriptions.json', list); };
  const lead = me => me && (me.role === 'host' || me.role === 'admin');
  const needLead = (me, what) => { if (!lead(me)) throw fail(403, `only the host or an admin ${what}`); };
  const cleanUrl = v => { let url = str(v, 300); if (!url) return ''; try { require('./workfetch').checkUrl(url, { allowLocal }); return url; } catch (e) { throw fail(400, e.message); } };
  const fpNorm = v => String(v || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  // Subscribe by key (a body-import subscription, as before) or by address + fingerprint: the address is fetched
  // safely, the feed must verify, and its key's fingerprint must be the one the person was given.
  async function subscribe(b, me) {
    needLead(me, 'subscribes to other tribes');
    b = b || {};
    const url = cleanUrl(b.url); let key = String(b.key || '').trim(), name = str(b.name, 40), first = null;
    if (!key && url) {
      const want = fpNorm(b.fingerprint); if (want.length !== 16) throw fail(400, 'paste the other tribe’s key fingerprint (xxxx-xxxx-xxxx-xxxx) so only their feed is accepted');
      let r; try { r = await pull(url, { allowLocal }); } catch (e) { throw fail(e.code === 'refused' ? 400 : 502, e.message); }
      let doc; try { doc = JSON.parse(r.text); } catch { throw fail(400, 'That address didn’t answer with a feed.'); }
      const v = verify(doc); if (!v.ok) throw fail(400, `That feed can’t be trusted: ${v.reason}.`);
      if (fpNorm(v.tribe.fingerprint) !== want) throw fail(400, 'That feed is signed by a different key than the fingerprint you pasted. Nothing was added.');
      key = v.key; name = name || v.tribe.name; first = { doc, etag: r.etag };
    }
    if (!isKey(key)) throw fail(400, 'paste the other tribe’s feed address and key fingerprint, or its feed key (43 characters)');
    if (key === keyPair().pub) throw fail(400, 'that is this tribe’s own key');
    const list = subs(); if (list.some(s => s.key === key)) throw fail(409, 'already subscribed');
    if (list.length >= MAX_SUBS) throw fail(400, `at most ${MAX_SUBS} subscriptions`);
    const s = { id: id ? id() : crypto.randomBytes(6).toString('hex'), name: name || 'A tribe', key, fingerprint: fingerprint(key), url: url || undefined, added: new Date().toISOString(), by: me.id };
    saveSubs([...list, s]);
    if (first) { try { importFeed(first.doc); } catch {} const st = state(); st[s.id] = { etag: first.etag || null, lastTry: Date.now(), lastOk: Date.now(), fails: 0, error: null, nextAt: Date.now() + FETCH_MS() }; saveState(st); }
    return s;
  }
  const dropStored = key => { try { fs.rmSync(base.p(`.tribe/work/feeds/${key}.json`), { force: true }); } catch {} };
  function unsubscribe(sid, me) {
    needLead(me, 'changes subscriptions');
    const list = subs(), s = list.find(x => x.id === sid); if (!s) throw fail(404, 'no such subscription');
    saveSubs(list.filter(x => x !== s)); dropStored(s.key);
    const st = state(); delete st[s.id]; saveState(st);
    return { ok: true };
  }
  function patch(sid, b, me) {
    needLead(me, 'changes subscriptions');
    const list = subs(), s = list.find(x => x.id === sid); if (!s) throw fail(404, 'no such subscription');
    if (b.paused !== undefined) s.paused = !!b.paused || undefined;
    if (b.blocked !== undefined) { s.blocked = !!b.blocked || undefined; if (s.blocked) dropStored(s.key); }   // a blocked source: its stored gigs go, and it is never fetched or imported
    if (b.name !== undefined) s.name = str(b.name, 40) || s.name;
    saveSubs(list); return s;
  }
  function importFeed(doc) {
    const v = verify(doc); if (!v.ok) throw fail(400, v.reason);
    const s = subs().find(x => x.key === v.key); if (!s) throw fail(403, 'this tribe isn’t subscribed to that feed’s key');
    if (s.blocked) throw fail(403, 'that tribe is blocked here');
    const rel = `.tribe/work/feeds/${v.key}.json`, prev = base.readJSON(rel, null);
    if (prev && prev.seq >= v.seq) return { stored: false, older: prev.seq > v.seq, reason: prev.seq > v.seq ? 'an older copy than the one already stored: refused' : 'already have this copy', tribe: { ...v.tribe, name: s.name }, gigs: prev.gigs };
    fs.mkdirSync(base.p('.tribe/work/feeds'), { recursive: true });
    const mine = keyPair().pub;
    base.writeJSON(rel, { seq: v.seq, at: new Date().toISOString(), expires: doc.expires, tribe: v.tribe.name, gigs: v.gigs, requests: v.requests.filter(r => r.to === mine) });
    return { stored: true, tribe: { ...v.tribe, name: s.name }, gigs: v.gigs };
  }
  function imported(now = Date.now()) {
    const out = [], hidden = new Set(settings().hidden);
    for (const s of subs()) { if (s.blocked) continue; const f = base.readJSON(`.tribe/work/feeds/${s.key}.json`, null); if (f && Date.parse(f.expires) > now) for (const g of f.gigs || []) if (!hidden.has(`${s.key}:${g.id}`)) out.push({ ...g, tribe: s.name, from: s.fingerprint, source: s.key, remote: true }); }
    return out;
  }

  // ---------- fetching (the schedule, the state, the backoff) ----------
  const state = () => base.readJSON('.tribe/work/fetch-state.json', {}) || {};
  const saveState = st => { dir(); base.writeJSON('.tribe/work/fetch-state.json', st); };
  const hostOf = u => { try { return new URL(u).host; } catch { return ''; } };
  let fetching = false;
  async function fetchOne(s, { force = false } = {}) {
    if (!s.url) return { id: s.id, skipped: 'no address' };
    if (s.paused) return { id: s.id, skipped: 'paused' };
    if (s.blocked) return { id: s.id, skipped: 'blocked' };
    const st = state(), my = st[s.id] || {}, now = Date.now(), host = hostOf(s.url);
    // per-host backoff: a host that failed waits (5 min, doubling, up to a day) for every subscription on it, unless a person presses Fetch now
    const hostWait = Math.max(0, ...subs().filter(x => x.url && hostOf(x.url) === host).map(x => ((st[x.id] || {}).fails ? (st[x.id].nextAt || 0) : 0)));
    if (!force && (now < (my.nextAt || 0) || now < hostWait)) return { id: s.id, skipped: 'waiting' };
    const done = o => { const all = state(); all[s.id] = { ...my, ...o, lastTry: now }; saveState(all); return { id: s.id, ...o }; };
    let r;
    try { r = await pull(s.url, { etag: my.etag || undefined, allowLocal }); }
    catch (e) { const fails = (my.fails || 0) + 1; return done({ fails, error: str(e.message, 200), refused: e.code === 'refused' || undefined, nextAt: now + Math.min(86400000, BACKOFF_MS() * 2 ** (fails - 1)) }); }
    const ok = extra => done({ fails: 0, error: null, refused: undefined, lastOk: now, nextAt: now + FETCH_MS(), ...extra });
    if (r.status === 304) return ok({ unchanged: true });
    let doc; try { doc = JSON.parse(r.text); } catch { const fails = (my.fails || 0) + 1; return done({ fails, error: 'That address didn’t answer with a feed.', nextAt: now + Math.min(86400000, BACKOFF_MS() * 2 ** (fails - 1)) }); }
    const v = verify(doc), bad = why => { const fails = (my.fails || 0) + 1; return done({ fails, error: why, refused: true, nextAt: now + Math.min(86400000, BACKOFF_MS() * 2 ** (fails - 1)) }); };
    if (!v.ok) return bad(`Refused: ${v.reason}.`);
    if (v.key !== s.key) return bad('Refused: the feed is signed by a different key than the one you subscribed to.');
    try { const imp = importFeed(doc); if (imp.older) return bad('Refused: an older copy than the one already stored (a replay or a rollback).'); return ok({ etag: r.etag || null, gigs: imp.gigs.length, stored: imp.stored }); }
    catch (e) { return bad(str(e.message, 200)); }
  }
  async function fetchAll(opts = {}) {
    if (fetching) return []; fetching = true;
    try { const out = []; for (const s of subs()) { if (opts.id && s.id !== opts.id) continue; out.push(await fetchOne(s, opts)); } return out; }
    finally { fetching = false; }
  }
  let timer = null;
  if (schedule) { timer = setInterval(() => fetchAll().catch(e => log('work feeds: ' + e.message)), Math.max(1000, Math.min(FETCH_MS(), 10 * 60000))); timer.unref && timer.unref(); }

  // ---------- asking about another tribe's gig ----------
  function requestsFor(me) {
    const mine = sent().filter(r => lead(me) || r.by === me.id);
    const received = [];
    if (lead(me)) for (const s of subs()) { if (s.blocked) continue; const f = base.readJSON(`.tribe/work/feeds/${s.key}.json`, null); if (f && Date.parse(f.expires) > Date.now()) for (const r of f.requests || []) received.push({ ...r, to: undefined, tribe: s.name, fingerprint: s.fingerprint }); }
    return { sent: mine.slice(-50).reverse(), received };
  }
  function request(b, me) {
    if (!me || me.role === 'agent' || me.role === 'spectator') throw fail(403, 'only a person in the tribe asks about another tribe’s gig');
    const s = subs().find(x => x.key === b.from && !x.blocked); if (!s) throw fail(404, 'that gig’s tribe isn’t one this tribe follows');
    const f = base.readJSON(`.tribe/work/feeds/${s.key}.json`, null), g = f && (f.gigs || []).find(x => x.id === b.gig); if (!g) throw fail(404, 'that gig is no longer in the feed');
    const contact = str(b.contact, 120); if (!contact) throw fail(400, 'add how they can reach you');
    const list = sent(); if (list.filter(r => r.by === me.id && Date.now() - Date.parse(r.at) < 3600000).length >= 10) throw fail(429, 'that is a lot of requests in an hour: try again later');
    const r = { id: 'rq-' + crypto.randomBytes(5).toString('hex'), to: s.key, gig: g.id, title: g.title, note: str(b.note, 500), contact, by: me.id, byName: str(memberName(me), 40), at: new Date().toISOString() };
    dir(); base.writeJSON('.tribe/work/requests.json', [...list.filter(x => !(x.by === me.id && x.to === r.to && x.gig === r.gig)), r].slice(-200));
    const open = settings().publish === 'open', url = feedUrl();
    const message = `Hi! I’m ${r.byName || 'someone'} from the tribe ${str(tribeName && tribeName(), 40)}. I saw your gig “${g.title}” and I’m interested.${r.note ? `\n\n${r.note}` : ''}\n\nReach me: ${contact}${open && url ? `\nOur gig feed: ${url} (key ${fingerprint(keyPair().pub)})` : ''}`;
    return { request: r, message, gigContact: g.contact || '', delivery: open ? 'feed' : 'copy',
      note: open ? `${s.name} sees this only if they follow this tribe’s feed. To be sure, send them the message yourself.` : 'This tribe’s feed is members-only, so the other tribe can’t read this request. Send them the message yourself.' };
  }
  function unrequest(rid, me) {
    const list = sent(), r = list.find(x => x.id === rid); if (!r) throw fail(404, 'no such request');
    if (r.by !== me.id && !lead(me)) throw fail(403, 'not your request');
    base.writeJSON('.tribe/work/requests.json', list.filter(x => x !== r)); return { ok: true };
  }
  const feedUrl = () => { const b = publicBase && publicBase(); return b ? `${String(b).replace(/\/+$/, '')}/api/work/feed.json` : null; };
  function admin(me) {
    needLead(me, 'manages gig feeds');
    const st = state(), k = keyPair().pub, cfg = settings();
    return { publish: cfg.publish, key: k, fingerprint: fingerprint(k), url: feedUrl(), hidden: cfg.hidden,
      subscriptions: subs().map(s => { const f = base.readJSON(`.tribe/work/feeds/${s.key}.json`, null), x = st[s.id] || {}; return { ...s, gigs: f && !s.blocked ? (f.gigs || []).length : 0, lastOk: x.lastOk ? new Date(x.lastOk).toISOString() : null, lastTry: x.lastTry ? new Date(x.lastTry).toISOString() : null, error: x.error || null, fails: x.fails || 0, nextAt: x.nextAt ? new Date(x.nextAt).toISOString() : null }; }) };
  }
  function hide(b, me) {
    needLead(me, 'hides gigs');
    const k = `${String(b.key || '')}:${String(b.gig || '')}`; if (!isKey(String(b.key || '')) || !/^[a-z0-9-]{3,64}$/.test(String(b.gig || ''))) throw fail(400, 'which gig?');
    const cfg = settings(); cfg.hidden = cfg.hidden.filter(x => x !== k); if (b.hidden !== false) cfg.hidden.push(k); saveSettings(cfg); return { hidden: cfg.hidden };
  }

  const openHits = new Map();   // the open feed: a small per-address rate limit
  function openLimited(req) {
    const ip = (req.socket && req.socket.remoteAddress) || '?', now = Date.now(), h = (openHits.get(ip) || []).filter(t => now - t < 60000); h.push(now); openHits.set(ip, h);
    if (openHits.size > 5000) openHits.clear();
    return h.length > 30;
  }
  async function route(req, res, { m, b, c, me, readBody, send, fail: f }) {
    try {
      if (b === 'feed.json' && m === 'GET') {
        if (!me) { if (settings().publish !== 'open') return f(res, 401, 'not a member'); if (openLimited(req)) { res.setHeader && res.setHeader('Retry-After', '60'); return f(res, 429, 'slow down'); } }
        res.setHeader && res.setHeader('Cache-Control', 'no-store'); return send(res, 200, feed());
      }
      if (!me) return f(res, 401, 'not a member');
      const body = async () => (await readBody(req)) || {};
      if (b === 'feed' && c === 'key' && m === 'GET') { const k = keyPair().pub; return send(res, 200, { key: k, fingerprint: fingerprint(k) }); }
      if (b === 'feed' && c === 'verify' && m === 'POST') { const v = verify((await body()).feed); return send(res, 200, v); }
      if (b === 'admin' && m === 'GET') return send(res, 200, admin(me));
      if (b === 'settings' && (m === 'PUT' || m === 'PATCH')) { needLead(me, 'changes how the feed is published'); const x = await body(), cfg = settings(); if (x.publish !== undefined) { if (!['open', 'members'].includes(x.publish)) throw fail(400, 'publish: open or members'); cfg.publish = x.publish; } saveSettings(cfg); return send(res, 200, admin(me)); }
      if (b === 'subscriptions' && !c && m === 'GET') return send(res, 200, { subscriptions: subs() });
      if (b === 'subscriptions' && !c && m === 'POST') return send(res, 200, { subscription: await subscribe(await body(), me) });
      if (b === 'subscriptions' && c && m === 'PATCH') return send(res, 200, { subscription: patch(c, await body(), me) });
      if (b === 'subscriptions' && c && m === 'DELETE') return send(res, 200, unsubscribe(c, me));
      if (b === 'fetch' && m === 'POST') { needLead(me, 'fetches feeds'); const x = await body(); return send(res, 200, { results: await fetchAll({ force: true, id: x.id || undefined }) }); }
      if (b === 'hide' && m === 'POST') return send(res, 200, hide(await body(), me));
      if (b === 'import' && m === 'POST') return send(res, 200, importFeed((await body()).feed));
      if (b === 'imported' && m === 'GET') return send(res, 200, { gigs: imported(), canManage: !!lead(me) });
      if (b === 'requests' && !c && m === 'GET') return send(res, 200, requestsFor(me));
      if (b === 'requests' && !c && m === 'POST') return send(res, 200, request(await body(), me));
      if (b === 'requests' && c && m === 'DELETE') return send(res, 200, unrequest(c, me));
      return f(res, 404, 'no such work route');
    } catch (e) { return f(res, e.status || 500, e.message); }
  }
  return { route, feed, verify, canonical, keyPair: () => ({ pub: keyPair().pub }), subscribe, unsubscribe, patch, importFeed, imported, fetchAll, fetchOne, admin, hide, request, requestsFor, settings, stop: () => timer && clearInterval(timer) };
};
module.exports.verify = verify;
module.exports.canonical = canonical;
module.exports.fingerprint = fingerprint;
