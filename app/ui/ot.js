// Operational transform for plain text, shared by the server and the browser (same file in
// server/ot.js and app/ui/ot.js; app/test/ot_test.js checks they stay identical). Zero dependencies.
//
// An op is an array of components that walks the old text from start to end:
//   n > 0     retain n characters
//   "str"     insert str
//   n < 0     delete -n characters
// Indexes are UTF-16 code units, the same unit as String#length and textarea.selectionStart.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TribeOT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const isRetain = c => typeof c === 'number' && c > 0;
  const isInsert = c => typeof c === 'string';
  const isDelete = c => typeof c === 'number' && c < 0;

  // Append a component, merging with the previous one and keeping inserts before deletes.
  function push(op, c) {
    if (c === 0 || c === '' || c === undefined) return op;
    const n = op.length, last = op[n - 1];
    if (isRetain(c)) { if (isRetain(last)) op[n - 1] += c; else op.push(c); }
    else if (isInsert(c)) {
      if (isInsert(last)) op[n - 1] += c;
      else if (isDelete(last)) { if (isInsert(op[n - 2])) op[n - 2] += c; else { op[n - 1] = c; op.push(last); } }
      else op.push(c);
    } else { if (isDelete(last)) op[n - 1] += c; else op.push(c); }
    return op;
  }
  const normalize = op => { const out = []; for (const c of op) push(out, c); if (isRetain(out[out.length - 1])) out.pop(); return out; };
  const baseLen = op => op.reduce((s, c) => s + (isRetain(c) ? c : isDelete(c) ? -c : 0), 0);
  const targetLen = op => op.reduce((s, c) => s + (isRetain(c) ? c : isInsert(c) ? c.length : 0), 0);
  const isNoop = op => op.every(isRetain);
  function valid(op, maxInsert = 1e6) {
    if (!Array.isArray(op) || op.length > 10000) return false;
    let ins = 0;
    for (const c of op) {
      if (typeof c === 'string') { if (!c.length) return false; ins += c.length; }
      else if (!Number.isInteger(c) || c === 0) return false;
    }
    return ins <= maxInsert;
  }

  // Ops may omit the trailing retain; pad so an op covers the whole text.
  const pad = (op, len) => { const b = baseLen(op); if (b > len) throw new Error(`op base length ${b} > text length ${len}`); return b < len ? push(op.slice(), len - b) : op; };

  function apply(text, op) {
    op = pad(op, text.length);
    let out = '', i = 0;
    for (const c of op) {
      if (isRetain(c)) { out += text.slice(i, i + c); i += c; }
      else if (isInsert(c)) out += c;
      else i -= c;
    }
    return out;
  }

  // compose(a, b): one op with the effect of a then b.
  function compose(a, b) {
    const out = []; let i = 0, j = 0, x = a[i++], y = b[j++];
    for (;;) {
      if (x === undefined && y === undefined) break;
      if (isDelete(x)) { push(out, x); x = a[i++]; continue; }
      if (isInsert(y)) { push(out, y); y = b[j++]; continue; }
      if (x === undefined) { push(out, y); y = b[j++]; continue; }   // trailing implicit retain of a
      if (y === undefined) { push(out, x); x = a[i++]; continue; }   // trailing implicit retain of b
      if (isRetain(x) && isRetain(y)) {
        if (x > y) { push(out, y); x -= y; y = b[j++]; } else if (x === y) { push(out, x); x = a[i++]; y = b[j++]; } else { push(out, x); y -= x; x = a[i++]; }
      } else if (isInsert(x) && isDelete(y)) {
        if (x.length > -y) { x = x.slice(-y); y = b[j++]; } else if (x.length === -y) { x = a[i++]; y = b[j++]; } else { y += x.length; x = a[i++]; }
      } else if (isInsert(x) && isRetain(y)) {
        if (x.length > y) { push(out, x.slice(0, y)); x = x.slice(y); y = b[j++]; } else if (x.length === y) { push(out, x); x = a[i++]; y = b[j++]; } else { push(out, x); y -= x.length; x = a[i++]; }
      } else { // retain x, delete y
        if (x > -y) { push(out, y); x += y; y = b[j++]; } else if (x === -y) { push(out, y); x = a[i++]; y = b[j++]; } else { push(out, -x); y += x; x = a[i++]; }
      }
    }
    return normalize(out);
  }

  // transform(a, b) for two ops on the same text: returns [a', b'] with
  // apply(apply(t, a), b') === apply(apply(t, b), a'). On a tie, a's insert goes first.
  function transform(a, b) {
    const len = Math.max(baseLen(a), baseLen(b)); a = pad(a, len); b = pad(b, len);
    const a1 = [], b1 = []; let i = 0, j = 0, x = a[i++], y = b[j++];
    for (;;) {
      if (x === undefined && y === undefined) break;
      if (isInsert(x)) { push(a1, x); push(b1, x.length); x = a[i++]; continue; }
      if (isInsert(y)) { push(a1, y.length); push(b1, y); y = b[j++]; continue; }
      if (x === undefined || y === undefined) throw new Error('transform: ops have different base lengths');
      let m;
      if (isRetain(x) && isRetain(y)) {
        if (x > y) { m = y; x -= y; y = b[j++]; } else if (x === y) { m = x; x = a[i++]; y = b[j++]; } else { m = x; y -= x; x = a[i++]; }
        push(a1, m); push(b1, m);
      } else if (isDelete(x) && isDelete(y)) {
        if (-x > -y) { x -= y; y = b[j++]; } else if (x === y) { x = a[i++]; y = b[j++]; } else { y -= x; x = a[i++]; }
      } else if (isDelete(x) && isRetain(y)) {
        if (-x > y) { m = y; x += y; y = b[j++]; } else if (-x === y) { m = y; x = a[i++]; y = b[j++]; } else { m = -x; y += x; x = a[i++]; }
        push(a1, -m);
      } else { // retain x, delete y
        if (x > -y) { m = -y; x += y; y = b[j++]; } else if (x === -y) { m = x; x = a[i++]; y = b[j++]; } else { m = x; y += x; x = a[i++]; }
        push(b1, -m);
      }
    }
    return [normalize(a1), normalize(b1)];
  }

  // Where does position `pos` end up after op? stick=true moves it past an insert made exactly at pos
  // (use for the author's own cursor); false keeps it in front.
  function transformIndex(pos, op, stick) {
    let i = 0, out = pos;
    for (const c of op) {
      if (i > pos) break;
      if (isRetain(c)) i += c;
      else if (isInsert(c)) { if (i < pos || (stick && i === pos)) out += c.length; }
      else { out -= Math.max(0, Math.min(pos - i, -c)); i -= c; }
    }
    return out;
  }

  // Smallest single splice turning `a` into `b`. `cursor` (the caret in b after the edit) breaks ties
  // inside runs of equal characters so the op lands where the user actually typed.
  function diff(a, b, cursor) {
    if (a === b) return [];
    const max = Math.min(a.length, b.length);
    let s = 0; const sMax = cursor === undefined ? max : Math.max(0, Math.min(max, b.length - cursor));
    while (s < sMax && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    let p = 0; const pMax = Math.min(a.length, b.length) - s;
    while (p < pMax && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    // never split a surrogate pair
    if (p > 0 && /[\uD800-\uDBFF]/.test(a[p - 1])) p--;
    if (s > 0 && /[\uDC00-\uDFFF]/.test(a[a.length - s])) s--;
    return normalize([p, b.slice(p, b.length - s), -(a.length - p - s), s]);
  }

  // Client state machine (ot.js style): synchronized / awaiting confirm / awaiting with buffer.
  class Client {
    constructor(rev) { this.rev = rev; this.inflight = null; this.buffer = null; }
    get state() { return this.buffer ? 'awaitingWithBuffer' : this.inflight ? 'awaitingConfirm' : 'synchronized'; }
    // A local edit. Returns the op to send now, or null if it was buffered.
    local(op) {
      if (isNoop(op)) return null;
      if (!this.inflight) return (this.inflight = op);
      this.buffer = this.buffer ? compose(this.buffer, op) : op; return null;
    }
    // An op from the server (someone else's). Returns it transformed to apply to the local text.
    remote(op) {
      this.rev++;
      if (this.inflight) { const [a, b] = transform(this.inflight, op); this.inflight = a; op = b; }
      if (this.buffer) { const [a, b] = transform(this.buffer, op); this.buffer = a; op = b; }
      return op;
    }
    // The server applied our in-flight op. Returns the next op to send, or null.
    ack() { this.rev++; this.inflight = this.buffer; this.buffer = null; return this.inflight; }
    // Map a position in server space (at this.rev) to local space.
    toLocal(pos) { if (this.inflight) pos = transformIndex(pos, this.inflight, false); if (this.buffer) pos = transformIndex(pos, this.buffer, false); return pos; }
  }

  // Server side of one document: authoritative text, revision and op history.
  class Server {
    constructor(text = '', keep = 2000) { this.text = text; this.rev = 0; this.start = 0; this.hist = []; this.keep = keep; }
    // Returns the op as applied (transformed) or throws if rev is unknown or the op does not fit.
    receive(rev, op, meta = {}) {
      if (!Number.isInteger(rev) || rev < this.start || rev > this.rev) throw new Error(`unknown revision ${rev}`);
      for (const h of this.hist.slice(rev - this.start)) op = transform(op, h.op)[0];
      const b = baseLen(op); if (b > this.text.length) throw new Error('op does not fit the text');
      op = normalize(pad(op, this.text.length));
      this.text = apply(this.text, op); this.rev++;
      this.hist.push({ op, ...meta });
      if (this.hist.length > this.keep) { const drop = this.hist.length - this.keep; this.hist.splice(0, drop); this.start += drop; }
      return op;
    }
    since(rev) { return rev >= this.start && rev <= this.rev ? this.hist.slice(rev - this.start) : null; }
  }

  return { apply, compose, transform, transformIndex, diff, normalize, baseLen, targetLen, isNoop, valid, Client, Server };
});
