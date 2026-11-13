// feat/build-feeds: the careful fetch for other tribes' gig feeds (server/workfetch.js) and the fetch half of
// server/workfeed.js. Private, loopback, link-local and metadata addresses, DNS rebinding, redirects to another host,
// oversize bodies, the wrong content type, slow servers, bad signatures, another key, and rollbacks are all refused;
// ETag, pause, block, hide, backoff and requests that ride in a feed.
'use strict';
const assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { Store } = require('../../server/store');
const makeWorkFeed = require('../../server/workfeed');
const F = require('../../server/workfetch');

const refused = async (p, re) => { try { await p; } catch (e) { assert.strictEqual(e.code, 'refused', `${e.code}: ${e.message}`); if (re) assert.ok(re.test(e.message), e.message); return e; } assert.fail('should have been refused'); };
const failed = async p => { try { await p; } catch (e) { assert.strictEqual(e.code, 'failed', `${e.code}: ${e.message}`); return e; } assert.fail('should have failed'); };
const fakeDns = (...answers) => { let n = 0; const fn = (h, o, cb) => { const a = answers[Math.min(n++, answers.length - 1)]; cb(null, (Array.isArray(a) ? a : [a]).map(address => ({ address, family: address.includes(':') ? 6 : 4 }))); }; fn.calls = () => n; return fn; };
const listen = handler => new Promise(res => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });

(async () => {
  // ---------- which addresses are public ----------
  for (const ip of ['127.0.0.1', '127.8.9.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '169.254.0.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd00:ec2::254', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001:db8::1', '::127.0.0.1', 'fec0::1', 'not-an-ip'])
    assert.strictEqual(F.isPublic(ip), false, ip + ' must not be public');
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.63.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.strictEqual(F.isPublic(ip), true, ip + ' is public');

  // ---------- the URL itself ----------
  await refused(F.safeFetch('http://example.com/feed.json'), /https/);
  await refused(F.safeFetch('ftp://example.com/feed.json'), /https/);
  await refused(F.safeFetch('file:///etc/passwd'));
  await refused(F.safeFetch('https://user:pass@example.com/feed.json'), /password/);
  await refused(F.safeFetch('http://localhost:4747/api/work/feed.json'), /https/);            // http for localhost only in tests (allowLocal)
  await refused(F.safeFetch('https://example.com:22/feed.json', { lookup: fakeDns('93.184.216.34') }), /port/);
  await refused(F.safeFetch('not a url'));

  // ---------- private, loopback, link-local, metadata: literal addresses ----------
  for (const u of ['https://127.0.0.1/x', 'https://10.1.2.3/x', 'https://192.168.0.10/x', 'https://169.254.169.254/latest/meta-data/', 'https://[::1]/x', 'https://[::ffff:127.0.0.1]/x', 'https://[fd00:ec2::254]/x', 'https://[fe80::1]/x', 'https://0.0.0.0/x', 'https://2130706433/x', 'https://0x7f.1/x', 'https://localhost/x'])
    await refused(F.safeFetch(u, { lookup: fakeDns('127.0.0.1') }), /private or local/);
  // ---------- a name that resolves to a private address; EVERY address is checked ----------
  await refused(F.safeFetch('https://intranet.example/feed.json', { lookup: fakeDns('10.0.0.8') }), /private or local/);
  await refused(F.safeFetch('https://mixed.example/feed.json', { lookup: fakeDns(['93.184.216.34', '169.254.169.254']) }), /private or local/);
  await refused(F.safeFetch('https://mixed6.example/feed.json', { lookup: fakeDns(['2606:4700:4700::1111', '::1']) }), /private or local/);
  await refused(F.safeFetch('https://localhost.example/x', { lookup: fakeDns('127.0.0.1'), allowLocal: true }), /private or local/);   // allowLocal is for the name localhost only

  // ---------- DNS rebinding: the socket is pinned to the address that was checked ----------
  {
    const dns = fakeDns('93.184.216.34', '127.0.0.1');   // public when checked, loopback if asked again
    let pinned = null;
    const request = (o, cb) => { o.lookup('rebind.example', {}, (e, addr) => { pinned = addr; }); o.lookup('rebind.example', { all: true }, (e, list) => { pinned = [pinned, list[0].address]; }); throw Object.assign(new Error('stop'), { code: 'failed' }); };
    await failed(F.safeFetch('https://rebind.example/feed.json', { lookup: dns, request }));
    assert.deepStrictEqual(pinned, ['93.184.216.34', '93.184.216.34'], 'the connection only ever gets the checked address');
    assert.strictEqual(dns.calls(), 1, 'the name is resolved once; the socket never asks DNS again');
  }

  // ---------- a real local server (allowLocal: what the tests and TRIBE_FEED_ALLOW_LOCAL use) ----------
  let mode = 'ok', hits = 0, lastHeaders = null;
  const other = await listen((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"other":true}'); });
  const srv = await listen((q, r) => {
    hits++; lastHeaders = q.headers;
    if (q.url === '/hop') { r.writeHead(302, { Location: '/feed.json' }); return r.end(); }
    if (q.url === '/loop') { r.writeHead(302, { Location: '/loop' }); return r.end(); }
    if (q.url === '/away') { r.writeHead(302, { Location: `http://127.0.0.1:${other.address().port}/feed.json` }); return r.end(); }
    if (q.url === '/meta') { r.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); return r.end(); }
    if (q.url === '/big') { r.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': 999999 }); return r.end('x'.repeat(999999)); }
    if (q.url === '/bigstream') { r.writeHead(200, { 'Content-Type': 'application/json' }); const t = setInterval(() => r.write('x'.repeat(60000)), 5); r.on('close', () => clearInterval(t)); return; }
    if (q.url === '/html') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end('<html>'); }
    if (q.url === '/slow') return;   // never answers
    if (q.url === '/500') { r.writeHead(500); return r.end(); }
    if (q.headers['if-none-match'] === '"v1"' && mode === 'ok') { r.writeHead(304); return r.end(); }
    r.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ETag: '"v1"' }); r.end(typeof mode === 'string' ? '{"hello":1}' : JSON.stringify(mode));
  });
  const L = `http://localhost:${srv.address().port}`, local = { allowLocal: true };
  await refused(F.safeFetch(L + '/feed.json'), /https/);                                        // without the test switch: refused
  let r = await F.safeFetch(L + '/feed.json', local); assert.strictEqual(r.status, 200); assert.strictEqual(r.text, '{"hello":1}'); assert.strictEqual(r.etag, '"v1"');
  assert.ok(!lastHeaders.cookie && !lastHeaders.authorization, 'nothing of ours is sent');
  r = await F.safeFetch(L + '/feed.json', { ...local, etag: '"v1"' }); assert.strictEqual(r.status, 304, 'ETag respected');
  r = await F.safeFetch(L + '/hop', local); assert.strictEqual(r.status, 200, 'a redirect on the same host is followed');
  await refused(F.safeFetch(L + '/away', local), /different address/);
  await refused(F.safeFetch(L + '/meta', local), /different address/);
  await refused(F.safeFetch(L + '/loop', local), /too many/);
  await refused(F.safeFetch(L + '/big', local), /too large/);
  await refused(F.safeFetch(L + '/bigstream', local), /too large/);
  await refused(F.safeFetch(L + '/html', local), /JSON/);
  const t0 = Date.now(); await failed(F.safeFetch(L + '/slow', { ...local, timeoutMs: 400 })); assert.ok(Date.now() - t0 < 3000, 'the time limit holds');
  await failed(F.safeFetch(L + '/500', local));

  // ---------- two tribes: B follows A's feed by address + fingerprint ----------
  process.env.TRIBE_FEED_ALLOW_LOCAL = '1'; process.env.TRIBE_WORK_BACKOFF_MS = '60000';
  const adir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-a-')), bdir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-b-')), cdir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-c-'));
  let gigs = [{ id: 'otters-q1', title: 'Pixel artist for a cozy game', kind: 'task', skills: ['pixel art'], pay: { type: 'time', text: '1 h for 1 h' }, contact: '@camp' }, { id: 'otters-q2', title: 'Sound for a title screen', kind: 'task', contact: '@camp' }];
  const A = makeWorkFeed({ base: new Store(adir), tribeName: () => 'Otters', publicGigs: () => gigs, schedule: false });
  const B = makeWorkFeed({ base: new Store(bdir), tribeName: () => 'Bears', publicGigs: () => [], schedule: false, publicBase: () => 'https://bears.example', memberName: m => m.name });
  const C = makeWorkFeed({ base: new Store(cdir), tribeName: () => 'Crows', publicGigs: () => [{ id: 'crows-1', title: 'Fake' }], schedule: false });
  const host = { id: 'm1', role: 'host', name: 'Bea' }, builder = { id: 'm2', role: 'builder', name: 'Maya' };
  const url = L + '/feed.json', fpA = makeWorkFeed.fingerprint(A.keyPair().pub);
  const rejects = async (p, status, re) => { try { await p; } catch (e) { assert.strictEqual(e.status, status, `${e.status}: ${e.message}`); if (re) assert.ok(re.test(e.message), e.message); return; } assert.fail('should have been rejected'); };
  mode = A.feed();
  await rejects(B.subscribe({ url, fingerprint: fpA }, builder), 403);
  await rejects(B.subscribe({ url }, host), 400, /fingerprint/);
  await rejects(B.subscribe({ url, fingerprint: '0000-0000-0000-0000' }, host), 400, /different key/);
  await rejects(B.subscribe({ url: 'https://10.0.0.1/feed.json', fingerprint: fpA }, host), 400, /private or local/);
  await rejects(B.subscribe({ url: 'http://example.com/feed.json', fingerprint: fpA }, host), 400, /https/);
  const sub = await B.subscribe({ url, fingerprint: fpA }, host);
  assert.strictEqual(sub.name, 'Otters'); assert.strictEqual(sub.key, A.keyPair().pub);
  let got = B.imported(); assert.strictEqual(got.length, 2); assert.strictEqual(got[0].tribe, 'Otters'); assert.strictEqual(got[0].from, fpA); assert.ok(got[0].remote);
  // a newer feed arrives on the next pull; unsharing a gig takes it away
  await new Promise(x => setTimeout(x, 5)); gigs = gigs.slice(0, 1); mode = A.feed();
  let res = await B.fetchAll({ force: true }); assert.ok(res[0].stored && res[0].gigs === 1, JSON.stringify(res));
  assert.strictEqual(B.imported().length, 1);
  // not due yet: the schedule waits
  res = await B.fetchAll(); assert.strictEqual(res[0].skipped, 'waiting');
  // rollback: an older, validly signed copy is refused and the stored one stays
  const older = A.feed(Date.now() - 3600000); mode = older;
  res = await B.fetchAll({ force: true }); assert.ok(res[0].refused && /older copy/.test(res[0].error), JSON.stringify(res));
  assert.strictEqual(B.imported().length, 1);
  // per-host backoff: after a failure the schedule waits (a person can still press Fetch now)
  const before = hits; res = await B.fetchAll(); assert.strictEqual(res[0].skipped, 'waiting'); assert.strictEqual(hits, before, 'no request while backing off');
  assert.ok(Date.parse(B.admin(host).subscriptions[0].nextAt) - Date.now() > 50000);
  // a bad signature
  await new Promise(x => setTimeout(x, 5)); const bad = A.feed(); bad.gigs[0].title = 'Send me your password'; mode = bad;
  res = await B.fetchAll({ force: true }); assert.ok(res[0].refused && /signature/.test(res[0].error), JSON.stringify(res));
  assert.strictEqual(B.imported()[0].title, 'Pixel artist for a cozy game');
  assert.strictEqual(B.admin(host).subscriptions[0].fails, 2);
  // someone else's validly signed feed at the same address
  mode = C.feed(); res = await B.fetchAll({ force: true }); assert.ok(res[0].refused && /different key/.test(res[0].error), JSON.stringify(res));
  // expired, not JSON
  mode = A.feed(Date.now() - 8 * 86400000); res = await B.fetchAll({ force: true }); assert.ok(/expired/.test(res[0].error));
  mode = 'x'; res = await B.fetchAll({ force: true }); assert.ok(res[0].error);
  // back to good: the failure clears
  await new Promise(x => setTimeout(x, 5)); gigs = [gigs[0], { id: 'otters-q3', title: 'Playtesters this weekend', kind: 'task', contact: '@camp' }]; mode = A.feed();
  res = await B.fetchAll({ force: true }); assert.ok(res[0].stored && !res[0].error, JSON.stringify(res)); assert.strictEqual(B.admin(host).subscriptions[0].fails, 0);
  // hide one gig
  assert.throws(() => B.hide({ key: sub.key, gig: 'otters-q3' }, builder), /only the host/);
  B.hide({ key: sub.key, gig: 'otters-q3' }, host); assert.deepStrictEqual(B.imported().map(g => g.id), ['otters-q1']);
  B.hide({ key: sub.key, gig: 'otters-q3', hidden: false }, host); assert.strictEqual(B.imported().length, 2);
  // pause: not fetched
  B.patch(sub.id, { paused: true }, host); const h0 = hits; res = await B.fetchAll({ force: true }); assert.strictEqual(res[0].skipped, 'paused'); assert.strictEqual(hits, h0);
  B.patch(sub.id, { paused: false }, host);
  // a request: rides in B's feed, addressed to A's key; A sees it only once it follows B
  assert.throws(() => B.request({ from: sub.key, gig: 'otters-q1', note: 'hi' }, builder), /reach you/);
  const rq = B.request({ from: sub.key, gig: 'otters-q1', note: 'I draw pixel cats.', contact: 'maya@example.com' }, builder);
  assert.strictEqual(rq.delivery, 'copy'); assert.ok(/members-only/.test(rq.note)); assert.ok(/Pixel artist/.test(rq.message) && /maya@example.com/.test(rq.message) && /Maya/.test(rq.message));
  const bf = B.feed(); assert.ok(makeWorkFeed.verify(bf).ok); assert.strictEqual(bf.requests.length, 1); assert.strictEqual(bf.requests[0].to, A.keyPair().pub); assert.ok(!('by' in bf.requests[0]), 'no member id leaves the tribe');
  assert.deepStrictEqual(A.requestsFor(host).received, [], 'A does not follow B: it sees nothing');
  await A.subscribe({ key: B.keyPair().pub, name: 'Bears' }, host); A.importFeed(bf);
  const rec = A.requestsFor(host).received; assert.strictEqual(rec.length, 1); assert.strictEqual(rec[0].contact, 'maya@example.com'); assert.strictEqual(rec[0].tribe, 'Bears');
  assert.deepStrictEqual(A.requestsFor(builder).received, [], 'only the host and admins see requests from other tribes');
  // a request addressed to someone else is not kept
  const cf = C.feed(); await A.subscribe({ key: C.keyPair().pub, name: 'Crows' }, host);
  assert.strictEqual(makeWorkFeed.verify({ ...cf, requests: [{ id: 'rq-x1', to: A.keyPair().pub, gig: 'otters-q1', contact: 'x' }] }).ok, false, 'requests are under the signature');
  // block: the stored gigs go and nothing is fetched or imported
  B.patch(sub.id, { blocked: true }, host); assert.strictEqual(B.imported().length, 0);
  res = await B.fetchAll({ force: true }); assert.strictEqual(res[0].skipped, 'blocked');
  assert.throws(() => B.importFeed(A.feed()), /blocked/);
  assert.throws(() => B.request({ from: sub.key, gig: 'otters-q1', contact: 'x' }, builder), /follows/);
  // remove
  B.unsubscribe(sub.id, host); assert.strictEqual(B.admin(host).subscriptions.length, 0);

  srv.close(); other.close(); srv.closeAllConnections && srv.closeAllConnections();
  for (const d of [adir, bdir, cdir]) fs.rmSync(d, { recursive: true, force: true });
  console.log('workfeed_fetch_test ok');
})().catch(e => { console.error(e); process.exit(1); });
