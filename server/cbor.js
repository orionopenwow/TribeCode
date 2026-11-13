// A small CBOR decoder (RFC 8949), enough for WebAuthn: attestation objects and COSE keys. Definite lengths only,
// integers, byte and text strings, arrays, maps, tags (the tag is dropped), true/false/null. Bounded: depth 8, 2000
// items, and it never reads past the buffer. No floats (WebAuthn has none): they are refused like anything else unknown.
//   decodeFirst(buf, offset = 0) -> { value, end }     decode(buf) -> value (the whole buffer must be one item)
// Maps come back as Map (COSE keys are integers).
'use strict';

function decodeFirst(buf, offset = 0) {
  if (!Buffer.isBuffer(buf)) throw new Error('cbor: not a buffer');
  let pos = offset, items = 0;
  const need = n => { if (n < 0 || pos + n > buf.length) throw new Error('cbor: cut short'); };
  function len(info) {
    if (info < 24) return info;
    if (info === 24) { need(1); return buf[pos++]; }
    if (info === 25) { need(2); const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (info === 26) { need(4); const v = buf.readUInt32BE(pos); pos += 4; return v; }
    if (info === 27) { need(8); const v = buf.readBigUInt64BE(pos); pos += 8; if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor: number too large'); return Number(v); }
    throw new Error('cbor: indefinite lengths are not supported');
  }
  function item(depth) {
    if (depth > 8 || ++items > 2000) throw new Error('cbor: too deep or too long');
    need(1);
    const head = buf[pos++], major = head >> 5, info = head & 31;
    if (major === 7) {
      if (info === 20) return false; if (info === 21) return true; if (info === 22 || info === 23) return null;
      throw new Error('cbor: unsupported value');
    }
    const n = len(info);
    if (major === 0) return n;
    if (major === 1) return -1 - n;
    if (major === 2) { need(n); const v = Buffer.from(buf.subarray(pos, pos + n)); pos += n; return v; }
    if (major === 3) { need(n); const v = buf.toString('utf8', pos, pos + n); pos += n; return v; }
    if (major === 4) { if (n > 1000) throw new Error('cbor: array too long'); const a = []; for (let i = 0; i < n; i++) a.push(item(depth + 1)); return a; }
    if (major === 5) {
      if (n > 1000) throw new Error('cbor: map too long');
      const m = new Map();
      for (let i = 0; i < n; i++) { const k = item(depth + 1); if (typeof k !== 'number' && typeof k !== 'string') throw new Error('cbor: unsupported map key'); m.set(k, item(depth + 1)); }
      return m;
    }
    return item(depth + 1);   // major 6: a tag, then the tagged item
  }
  const value = item(0);
  return { value, end: pos };
}
function decode(buf) { const r = decodeFirst(buf, 0); if (r.end !== buf.length) throw new Error('cbor: trailing bytes'); return r.value; }
module.exports = { decode, decodeFirst };
