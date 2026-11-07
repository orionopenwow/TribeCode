// Unit test for server/ws.js: heartbeat drops silent sockets, a throwing handler doesn't crash the server,
// fragmented messages are capped, and server/store.js JSONL caching stays correct across appends and rewrites.
// Usage: node app/test/ws_test.js
'use strict';
process.env.TRIBE_WS_PING_MS = '80';
process.env.TRIBE_WS_DEAD_MS = '300';
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ws = require('../../server/ws');
const { Store } = require('../../server/store');

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

function frame(op, payload, fin = true) {
  const mask = crypto.randomBytes(4), data = Buffer.from(payload);
  const len = data.length, head = len < 126 ? Buffer.from([(fin ? 0x80 : 0) | op, 0x80 | len]) : Buffer.from([(fin ? 0x80 : 0) | op, 0x80 | 126, len >> 8, len & 255]);
  const out = Buffer.from(data); for (let i = 0; i < out.length; i++) out[i] ^= mask[i & 3];
  return Buffer.concat([head, mask, out]);
}
function client(port, { answer }) {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1', () => s.write(`GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    let shook = false;
    s.on('data', d => {
      if (!shook) { shook = d.toString().startsWith('HTTP/1.1 101'); return resolve(s); }
      if (answer && (d[0] & 0x0f) === 0x9) s.write(frame(0xA, ''));   // pong, like a browser
    });
    s.on('error', () => {});
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const sockets = [];
  const server = http.createServer();
  server.on('upgrade', (req, sock) => {
    const s = ws.accept(req, sock); s.closedAt = null; sockets.push(s);
    s.on('close', () => { s.closedAt = Date.now(); });
    s.on('message', m => { if (m.boom) throw new Error('handler bug'); s.last = m; });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const origErr = console.error; console.error = () => {};

  const silent = await client(port, { answer: false });
  const alive = await client(port, { answer: true });
  await wait(700);
  ok(sockets[0].closedAt, 'a socket that never answers pings is dropped');
  ok(!sockets[1].closedAt, 'a socket that answers pings stays open');

  alive.write(frame(0x1, JSON.stringify({ boom: true })));
  alive.write(frame(0x1, JSON.stringify({ hi: 1 })));
  await wait(100);
  ok(sockets[1].open && sockets[1].last && sockets[1].last.hi === 1, 'a throwing handler does not kill the socket or the process');

  // fragments: 5 continuation frames of 1 MiB exceed the 4 MiB message cap
  const big = 'x'.repeat(60000);
  alive.write(frame(0x1, big, false));
  for (let i = 0; i < 80; i++) alive.write(frame(0x0, big, false));
  await wait(300);
  ok(!sockets[1].open, 'a fragmented message over 4 MiB closes the socket');
  silent.destroy(); alive.destroy(); server.close();
  console.error = origErr;

  // ---- store.js: cached JSONL stays correct
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-store-'));
  const st = new Store(dir);
  for (let i = 0; i < 1000; i++) st.appendJSONL('chat/x.jsonl', { id: 'm' + i, text: 't' + i });
  ok(st.readJSONL('chat/x.jsonl', 3).map(m => m.id).join() === 'm997,m998,m999', 'readJSONL returns the newest lines');
  ok(st.findJSONL('chat/x.jsonl', m => m.id === 'm5', '"id":"m5"').text === 't5', 'findJSONL finds by hint');
  st.appendJSONL('chat/x.jsonl', { id: 'new', text: 'n' });
  ok(st.readJSONL('chat/x.jsonl', 1)[0].id === 'new', 'appends show up through the cache');
  fs.appendFileSync(st.p('chat/x.jsonl'), JSON.stringify({ id: 'outside' }) + '\n');   // another writer
  ok(st.readJSONL('chat/x.jsonl', 1)[0].id === 'outside', 'writes from outside the store are noticed');
  st._atomic(st.p('chat/x.jsonl'), JSON.stringify({ id: 'only' }) + '\n');             // a rewrite (edit/delete)
  ok(st.readJSONL('chat/x.jsonl', 10).map(m => m.id).join() === 'only', 'rewrites replace the cache');
  ok(st.findJSONL('chat/nope.jsonl', () => true) === null && st.readJSONL('chat/nope.jsonl').length === 0, 'missing files read as empty');
  assert.throws(() => st.p('../' + path.basename(dir) + '-evil/x'), /escapes/); checks++;
  console.log(`ws_test: ${checks} checks passed`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
