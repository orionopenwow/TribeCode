// Flint's local helper, tier 1 (feat/build-feeds, docs/FLINT-RESEARCH.md §3): static word-embedding inference in plain
// JS. Model2Vec-style: a sentence's vector is the mean of its tokens' vectors (one table lookup each), normalized;
// two texts are compared with a cosine. No GPU, no WebAssembly, no outside service once the model file is on the device.
//
// The model is the two files a Model2Vec model ships as (so a published one can be used as it is):
//   model.safetensors   one tensor "embeddings" [vocab, dim], float32 or float16, little-endian
//                       (optional "mapping" [n] int: token id -> row, and "weights" [n]: a per-token weight)
//   tokenizer.json      a Hugging Face WordPiece tokenizer: model.vocab { token: id }, model.unk_token,
//                       model.continuing_subword_prefix ("##"), normalizer.lowercase
//   config.json         optional: { normalize: true }
//
// Works in the browser (window.TribeEmbed) and in Node (require): the eval and the unit test use the same code.
//   TribeEmbed.fromFiles({ model: ArrayBuffer, tokenizer: object|string, config?: object }) -> E
//   E.embed(text) -> Float32Array (unit length)      E.sim(a, b) -> cosine      E.dim, E.vocabSize, E.tokens(text)
//   E.rank(query, texts|vectors, k?) -> [{ i, score }] best first
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeEmbed = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- safetensors: 8 bytes (header length, little-endian u64), a JSON header, then the raw tensors ----------
  function parseSafetensors(buf) {
    const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (ab.byteLength < 16) throw new Error('not a safetensors file');
    const dv = new DataView(ab), lo = dv.getUint32(0, true), hi = dv.getUint32(4, true);
    if (hi !== 0 || lo > 50 * 1024 * 1024 || 8 + lo > ab.byteLength) throw new Error('not a safetensors file');
    let head; try { head = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, lo))); } catch { throw new Error('not a safetensors file'); }
    const base = 8 + lo, out = {};
    for (const [name, t] of Object.entries(head)) {
      if (name === '__metadata__' || !t || !Array.isArray(t.data_offsets)) continue;
      const [a, b] = t.data_offsets; if (!(a >= 0 && b >= a && base + b <= ab.byteLength)) throw new Error(`tensor ${name} is outside the file`);
      out[name] = { dtype: t.dtype, shape: t.shape, bytes: ab.slice(base + a, base + b) };   // a copy: aligned for typed arrays
    }
    return out;
  }
  function half(h) {   // float16 -> number
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
  }
  function floats(t) {
    if (t.dtype === 'F32') return new Float32Array(t.bytes);
    if (t.dtype === 'F16') { const src = new Uint16Array(t.bytes), out = new Float32Array(src.length); for (let i = 0; i < src.length; i++) out[i] = half(src[i]); return out; }
    if (t.dtype === 'F64') return Float32Array.from(new Float64Array(t.bytes));
    if (t.dtype === 'I8') return Float32Array.from(new Int8Array(t.bytes));
    throw new Error(`this model stores its vectors as ${t.dtype}, which Flint can't read yet`);
  }
  function ints(t) {
    if (t.dtype === 'I32') return new Int32Array(t.bytes);
    if (t.dtype === 'I64') { const v = new BigInt64Array(t.bytes), out = new Int32Array(v.length); for (let i = 0; i < v.length; i++) out[i] = Number(v[i]); return out; }
    if (t.dtype === 'U32') return Int32Array.from(new Uint32Array(t.bytes));
    throw new Error(`unreadable mapping (${t.dtype})`);
  }

  // ---------- WordPiece (BERT-style): lowercase, strip accents, split on spaces and punctuation, longest match first ----------
  const PUNCT = /[!-/:-@[-`{-~¡-¿ -⁯　-〿＀-･]/;
  const CJK = /[一-鿿㐀-䶿豈-﫿]/;
  function tokenizer(tj) {
    const j = typeof tj === 'string' ? JSON.parse(tj) : tj, m = (j && j.model) || {};
    if (!m.vocab || typeof m.vocab !== 'object') throw new Error('tokenizer.json has no vocabulary');
    const vocab = new Map(Object.entries(m.vocab)), unk = m.unk_token || '[UNK]', pre = m.continuing_subword_prefix || '##', maxChars = m.max_input_chars_per_word || 100;
    const n = j.normalizer || {}, lower = n.lowercase !== false, strip = n.strip_accents !== false;
    const special = new Set((j.added_tokens || []).filter(t => t.special).map(t => t.id)); special.add(vocab.get(unk));
    function words(text) {
      let s = String(text || ''); if (lower) s = s.toLowerCase(); if (strip) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const out = []; let cur = '';
      for (const ch of s) {
        if (/\s/.test(ch) || ch === '\u0000' || ch === '�') { if (cur) out.push(cur); cur = ''; }
        else if (PUNCT.test(ch) || CJK.test(ch)) { if (cur) out.push(cur); cur = ''; out.push(ch); }
        else cur += ch;
      }
      if (cur) out.push(cur); return out;
    }
    function ids(text, max = 512) {
      const out = [];
      for (const w of words(text)) {
        if (out.length >= max) break;
        if (w.length > maxChars) continue;
        let start = 0; const piece = [];
        while (start < w.length) {
          let end = w.length, id = null;
          while (start < end) { const sub = (start ? pre : '') + w.slice(start, end), v = vocab.get(sub); if (v !== undefined) { id = v; break; } end--; }
          if (id === null) { piece.length = 0; break; }   // a word with a piece nobody knows is unknown as a whole
          piece.push(id); start = end;
        }
        for (const id of piece) if (!special.has(id)) out.push(id);
      }
      return out;
    }
    return { ids, words, size: vocab.size };
  }

  // ---------- the model ----------
  function create({ table, dim, tok, mapping = null, weights = null, name = '' }) {
    const rows = table.length / dim;
    function embed(text) {
      const v = new Float32Array(dim), ids = tok.ids(text); let n = 0;
      for (const id of ids) {
        const row = mapping ? mapping[id] : id; if (!(row >= 0 && row < rows)) continue;
        const w = weights ? weights[id] : 1, o = row * dim;
        for (let k = 0; k < dim; k++) v[k] += table[o + k] * w;
        n++;
      }
      if (!n) return v;
      let s = 0; for (let k = 0; k < dim; k++) { v[k] /= n; s += v[k] * v[k]; }
      s = Math.sqrt(s) || 1; for (let k = 0; k < dim; k++) v[k] /= s;   // always unit length, so sim() is a dot product
      return v;
    }
    const sim = (a, b) => { let s = 0; for (let k = 0; k < dim; k++) s += a[k] * b[k]; return s; };
    function rank(q, items, k = 10) {
      const qv = typeof q === 'string' ? embed(q) : q, out = [];
      for (let i = 0; i < items.length; i++) { const s = sim(qv, typeof items[i] === 'string' ? embed(items[i]) : items[i]); if (s > 0) out.push({ i, score: s }); }
      return out.sort((a, b) => b.score - a.score).slice(0, k);
    }
    return { embed, sim, rank, dim, vocabSize: rows, name, tokens: t => tok.ids(t).length };
  }
  function fromFiles({ model, tokenizer: tj, config = null, name = '' }) {
    const t = parseSafetensors(model), e = t.embeddings || t.embedding || Object.values(t).find(x => x.shape && x.shape.length === 2);
    if (!e || !e.shape || e.shape.length !== 2) throw new Error('the model file has no embeddings table');
    const table = floats(e), dim = e.shape[1]; if (table.length !== e.shape[0] * dim || !dim) throw new Error('the model file is damaged');
    const tok = tokenizer(tj), cfg = typeof config === 'string' ? JSON.parse(config) : config || {};
    return create({ table, dim, tok, mapping: t.mapping ? ints(t.mapping) : null, weights: t.weights ? floats(t.weights) : null, name: name || cfg.name || '' });
  }
  // Write a safetensors file with one float32 "embeddings" tensor (the fixture generator and tests use it).
  function writeSafetensors(table, rows, dim, meta) {
    const head = JSON.stringify({ ...(meta ? { __metadata__: meta } : {}), embeddings: { dtype: 'F32', shape: [rows, dim], data_offsets: [0, rows * dim * 4] } });
    const hb = new TextEncoder().encode(head), pad = (8 - (hb.length % 8)) % 8, out = new Uint8Array(8 + hb.length + pad + rows * dim * 4), dv = new DataView(out.buffer);
    dv.setUint32(0, hb.length + pad, true); out.set(hb, 8); out.fill(0x20, 8 + hb.length, 8 + hb.length + pad);
    out.set(new Uint8Array(table.buffer, table.byteOffset, rows * dim * 4), 8 + hb.length + pad);
    return out;
  }
  return { fromFiles, create, tokenizer, parseSafetensors, writeSafetensors, version: 1 };
});
