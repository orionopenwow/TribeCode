// The main colors of a picture, on the server, with no dependencies (the inspiration board, server/inspo.js).
//   colors(buffer, k = 6) -> ['#RRGGBB', …] most common first, or [] when the format isn't one we read.
// PNG: a real decode (node:zlib inflate + the five row filters; gray, RGB, palette, gray+alpha, RGBA; 8-bit, not
// interlaced). JPEG: a "tiny average": a baseline Huffman decode that keeps only each 8×8 block's DC coefficient, the
// block's average color, which is all a palette needs (no IDCT). Progressive JPEGs and other formats return [] and the
// browser measures them instead (app/ui/inspo.js paletteOf).
'use strict';
const zlib = require('node:zlib');

const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

// ---------- PNG ----------
function png(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let o = 8, w = 0, h = 0, depth = 0, ct = 0, inter = 0, pal = null, trns = null; const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len); o += 12 + len;
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; inter = d[12]; }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
  }
  if (!w || !h || depth !== 8 || inter || w * h > 25e6) return null;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; if (!ch) return null;
  let raw; try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = w * ch, out = Buffer.alloc(stride * h); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0; let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    prev = cur;
  }
  const px = [], step = Math.max(1, Math.floor(Math.sqrt(w * h / 6000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * ch;
    if (ct === 0) px.push([out[i], out[i], out[i]]);
    else if (ct === 4) { if (out[i + 1] > 128) px.push([out[i], out[i], out[i]]); }
    else if (ct === 2) px.push([out[i], out[i + 1], out[i + 2]]);
    else if (ct === 6) { if (out[i + 3] > 128) px.push([out[i], out[i + 1], out[i + 2]]); }
    else if (ct === 3 && pal) { const k = out[i]; if (!trns || k >= trns.length || trns[k] > 128) px.push([pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2]]); }
  }
  return px;
}

// ---------- JPEG (baseline, DC only) ----------
function jpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  const qt = {}, hts = {}; let frame = null, o = 2, restart = 0;
  const huff = (counts, syms) => { const map = new Map(); let code = 0, k = 0; for (let len = 1; len <= 16; len++) { for (let i = 0; i < counts[len - 1]; i++) map.set(len + ':' + code++, syms[k++]); code <<= 1; } return map; };
  while (o + 4 <= buf.length) {
    if (buf[o] !== 0xFF) { o++; continue; }
    const mk = buf[o + 1]; if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD7) || mk === 0x01 || mk === 0xFF) { o += mk === 0xFF ? 1 : 2; continue; }
    const len = buf.readUInt16BE(o + 2), seg = buf.subarray(o + 4, o + 2 + len);
    if (mk === 0xC2 || mk === 0xC3 || (mk >= 0xC5 && mk <= 0xCF && mk !== 0xC8 && mk !== 0xCC)) return null;   // progressive / lossless / arithmetic: the browser measures it
    if (mk === 0xDB) { let p = 0; while (p < seg.length) { const pq = seg[p] >> 4, id = seg[p] & 15; qt[id] = pq ? seg.readUInt16BE(p + 1) : seg[p + 1]; p += 1 + (pq ? 128 : 64); } }
    else if (mk === 0xC0 || mk === 0xC1) { const n = seg[5], comps = []; for (let i = 0; i < n; i++) comps.push({ id: seg[6 + i * 3], h: seg[7 + i * 3] >> 4, v: seg[7 + i * 3] & 15, tq: seg[8 + i * 3] }); frame = { h: seg.readUInt16BE(1), w: seg.readUInt16BE(3), comps }; }
    else if (mk === 0xC4) { let p = 0; while (p < seg.length) { const tc = seg[p] >> 4, th = seg[p] & 15, counts = [...seg.subarray(p + 1, p + 17)], n = counts.reduce((a, b) => a + b, 0); hts[(tc ? 'a' : 'd') + th] = huff(counts, [...seg.subarray(p + 17, p + 17 + n)]); p += 17 + n; } }
    else if (mk === 0xDD) restart = seg.readUInt16BE(0);
    else if (mk === 0xDA) {
      if (!frame) return null;
      const ns = seg[0], sc = []; for (let i = 0; i < ns; i++) { const c = frame.comps.find(x => x.id === seg[1 + i * 2]); if (!c) return null; sc.push({ c, dc: hts['d' + (seg[2 + i * 2] >> 4)], ac: hts['a' + (seg[2 + i * 2] & 15)], pred: 0 }); }
      if (sc.some(s => !s.dc || !s.ac)) return null;
      let p = o + 2 + len, bits = 0, nb = 0;
      const bit = () => { if (!nb) { if (p >= buf.length) throw new Error('eof'); let b = buf[p++]; if (b === 0xFF) { const n2 = buf[p]; if (n2 === 0) p++; else if (n2 >= 0xD0 && n2 <= 0xD7) { /* marker: caller resyncs */ } else throw new Error('marker'); } bits = b; nb = 8; } nb--; return (bits >> nb) & 1; };
      const dec = map => { let code = 0; for (let len = 1; len <= 16; len++) { code = (code << 1) | bit(); const v = map.get(len + ':' + code); if (v !== undefined) return v; } throw new Error('bad code'); };
      const recv = s => { let v = 0; for (let i = 0; i < s; i++) v = (v << 1) | bit(); return v < (1 << (s - 1)) ? v - (1 << s) + 1 : v; };
      const hmax = Math.max(...frame.comps.map(c => c.h)), vmax = Math.max(...frame.comps.map(c => c.v));
      const single = ns === 1, mcux = single ? Math.ceil(frame.w / 8) : Math.ceil(frame.w / (8 * hmax)), mcuy = single ? Math.ceil(frame.h / 8) : Math.ceil(frame.h / (8 * vmax));
      if (mcux * mcuy > 400000) return null;
      const avg = sc.map(() => new Float32Array(mcux * mcuy));
      try {
        for (let m = 0; m < mcux * mcuy; m++) {
          if (restart && m && m % restart === 0) { nb = 0; while (p < buf.length - 1 && !(buf[p] === 0xFF && buf[p + 1] >= 0xD0 && buf[p + 1] <= 0xD7)) p++; p += 2; sc.forEach(s => { s.pred = 0; }); }
          sc.forEach((s, si) => {
            const nblk = single ? 1 : s.c.h * s.c.v; let sum = 0;
            for (let k = 0; k < nblk; k++) {
              const t = dec(s.dc); s.pred += t ? recv(t) : 0; sum += s.pred;
              for (let z = 1; z < 64;) { const rs = dec(s.ac), r = rs >> 4, sz = rs & 15; if (!sz) { if (r === 15) { z += 16; continue; } break; } z += r; recv(sz); z++; }
            }
            avg[si][m] = (sum / nblk) * (qt[s.c.tq] || 1) / 8 + 128;   // DC × quant / 8 = the block's mean (level-shifted)
          });
        }
      } catch { return null; }
      const px = [];
      for (let m = 0; m < mcux * mcuy; m++) {
        if (sc.length === 1) { const y = avg[0][m]; px.push([y, y, y]); continue; }
        const Y = avg[0][m], Cb = avg[1][m] - 128, Cr = avg[2][m] - 128;
        px.push([Y + 1.402 * Cr, Y - 0.344136 * Cb - 0.714136 * Cr, Y + 1.772 * Cb].map(v => Math.max(0, Math.min(255, v))));
      }
      return px;
    }
    o += 2 + len;
  }
  return null;
}

// most common colors: 5-bit bins, merged when close, weighted by count
function quantize(px, k = 6) {
  if (!px || !px.length) return [];
  const bins = new Map();
  for (const [r, g, b] of px) { const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3); const e = bins.get(key) || [0, 0, 0, 0]; e[0] += r; e[1] += g; e[2] += b; e[3]++; bins.set(key, e); }
  const cand = [...bins.values()].map(e => ({ c: [e[0] / e[3], e[1] / e[3], e[2] / e[3]], n: e[3] })).sort((a, b) => b.n - a.n);
  const out = [];
  for (const x of cand) {
    const near = out.find(o => Math.hypot(o.c[0] - x.c[0], o.c[1] - x.c[1], o.c[2] - x.c[2]) < 40);
    if (near) { const t = near.n + x.n; near.c = near.c.map((v, i) => (v * near.n + x.c[i] * x.n) / t); near.n = t; } else out.push({ ...x });
    if (out.length > 24) break;
  }
  return out.sort((a, b) => b.n - a.n).filter(x => x.n >= px.length * 0.02).slice(0, k).map(x => hex(...x.c));
}

function colors(buf, k = 6) { try { return quantize(png(buf) || jpeg(buf) || [], k); } catch { return []; } }
module.exports = { colors, png, jpeg, quantize };
