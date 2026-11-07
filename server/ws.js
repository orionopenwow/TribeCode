// Minimal RFC 6455 WebSocket server (text frames, ping/pong, close). Zero dependencies.
'use strict';
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 1 << 20; // 1 MiB
const MAX_MESSAGE = 4 << 20; // a fragmented message may not grow past 4 MiB
// Heartbeat: phones that lose signal never send a FIN, so their socket (and their "online" dot, their huddle
// seat) would stay forever. Ping every 25 s; drop a socket that has been silent for 70 s. Browsers answer pings.
const PING_MS = Number(process.env.TRIBE_WS_PING_MS) || 25_000, DEAD_MS = Number(process.env.TRIBE_WS_DEAD_MS) || 70_000;

class Socket extends EventEmitter {
  constructor(sock) {
    super();
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.open = true;
    sock.setNoDelay(true);
    this.seen = Date.now();
    this.beat = setInterval(() => {
      if (Date.now() - this.seen > DEAD_MS) { try { sock.destroy(); } catch {} return this._closed(); }
      try { sock.write(header(0x9, 0)); } catch {}
    }, PING_MS);
    if (this.beat.unref) this.beat.unref();
    sock.on('data', d => { this.seen = Date.now(); this._onData(d); });
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }

  send(obj) {
    if (!this.open || this.sock.destroyed) return;
    const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
    try { this.sock.write(Buffer.concat([header(0x1, data.length), data])); } catch { this._closed(); }
  }

  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code);
    try { this.sock.write(Buffer.concat([header(0x8, 2), p])); } catch {}
    this.sock.end();
    this._closed();
  }

  _closed() { clearInterval(this.beat); if (this.open) { this.open = false; this.emit('close'); } }

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_FRAME) return this.close(1009);
      if (!masked) return this.close(1002); // clients must mask
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);

      if (op === 0x8) return this.close();
      if (op === 0x9) { this.sock.write(Buffer.concat([header(0xA, payload.length), payload])); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        this.frags.push(payload); this.fragLen = (this.fragLen || 0) + payload.length;
        if (this.fragLen > MAX_MESSAGE) { this.frags = []; this.fragLen = 0; return this.close(1009); }
        if (fin) {
          const text = Buffer.concat(this.frags).toString('utf8'); this.frags = []; this.fragLen = 0;
          let msg; try { msg = JSON.parse(text); } catch { continue; }
          // A bug in one message handler must not take the whole tribe server down (this runs in a socket 'data' event).
          try { this.emit('message', msg); } catch (e) { console.error('ws message handler:', e); }
        }
      }
    }
  }
}

function header(op, len) {
  if (len < 126) return Buffer.from([0x80 | op, len]);
  if (len < 65536) { const h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); return h; }
  const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return h;
}

function accept(req, sock) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { sock.destroy(); return null; }
  const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
  return new Socket(sock);
}

module.exports = { accept };
