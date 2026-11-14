// Flint's meaning layer (feat/flint-meaning). One place that answers "what did they mean?" for commands and for
// search, at whatever level this device has:
//   built-in   a word table that ships with the app (flintwords.bin, about 1.1 MB over the wire, loaded on first use):
//              21,000 everyday words, each as 64 numbers, so "cost" sits next to "price" and "dead url" next to
//              "broken link". Always on, nothing to download, nothing leaves the device.
//   helper     the optional local helper (flintmodel.js, a download the person opts into) is stacked on top when it
//              is installed. Everything below then upgrades by itself.
// It does not replace anything: flintnlu.js still decides commands, flintsem.js still ranks by concept groups and
// shared words. This file gives both a better "model" to blend in, and one search API for the rest of the app.
//
// For other features (Help, "what to do next", the palette):
//   await TribeMeaning.search(query, { scopes, limit })
//        -> [{ kind, label, hint, text, score, run() }] best first. kind is 'Doc' | 'Task' | 'Chat' | 'File' |
//           'Version' | 'Guide' | 'Command'. scopes is a list of those words in lower case (default: all but
//           'command'); limit defaults to 6. Only what this person can already see is searched; chat in private
//           messages is never indexed. Works with no tribe (the Guide and commands only).
//   TribeMeaning.nearestIntent(text, ctx?)
//        -> { intent, label, example, score, confident, alts: [{ intent, label, example, score }] } or null.
//           The closest thing Flint can do, by meaning. `confident` is true only when it is well clear of the next
//           one: show it as one "Did you mean …?" chip. It never runs anything.
//   TribeMeaning.ready() -> Promise<boolean>     the table is loaded (it loads itself on first use)
//   TribeMeaning.model() -> the model in use ({ embed, sim, score, name }) or null while loading
//   TribeMeaning.status() -> { level: 'built-in' | 'helper' | 'none', words, name }
// Node (the evals): require('./flintmeaning.js') -> { fromBuffer(arrayBuffer), stack(builtin, helper), rerank(...) }
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else { root.TribeMeaningCore = api; } })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SUFFIX = [[/ies$/, 'y'], [/sses$/, 'ss'], [/([^s])s$/, '$1'], [/ing$/, ''], [/ing$/, 'e'], [/ed$/, ''], [/ed$/, 'e'], [/([a-z])\1(?:ing|ed)$/, '$1'], [/ly$/, ''], [/er$/, ''], [/est$/, ''], [/ness$/, ''], [/ment$/, '']];
  // words that say nothing about the subject in a request ("can you", "please", "for me")
  const FILLER = new Set('please pls can could would will you your me my i we us our the a an to of for it its this that these those do does did is are was be been am just some any there here now then and or so want need like would let lets get give make have has had with on in at by from up out about into over as if what which who how when where why'.split(' '));

  function fromBuffer(buf) {
    const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const dv = new DataView(ab), hl = dv.getUint32(0, true), vl = dv.getUint32(4, true);
    if (hl > 4096 || 8 + hl + vl > ab.byteLength) throw new Error('not a word table');
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, hl)));
    const words = new TextDecoder().decode(new Uint8Array(ab, 8 + hl, vl)).split('\n'), dim = head.dim, n = head.n;
    if (words.length !== n || 8 + hl + vl + n * dim > ab.byteLength) throw new Error('the word table is damaged');
    const T = new Int8Array(ab, 8 + hl + vl, n * dim), row = new Map(); words.forEach((w, i) => row.set(w, i));
    const S2 = head.scale * head.scale;
    // how much a word tells you: common words ("the", "make") count for little, rare ones for a lot (row = rarity)
    const LOGN = Math.log(n) + 0.58, weightOf = r => { const p = 1 / ((r + 1) * LOGN); return 0.0015 / (0.0015 + p); };
    const find = w => {
      let r = row.get(w); if (r !== undefined) return r;
      if (w.includes('-')) return -1;
      for (const [rx, to] of SUFFIX) { if (w.length > 3 && rx.test(w)) { const s = w.replace(rx, to); if (s.length > 2 && (r = row.get(s)) !== undefined) return r; } }
      return -1;
    };
    const cache = new Map();
    // the words of a text that carry meaning: [{ w, r (row or -1), wt }]
    function toks(text) {
      const key = String(text || ''); let t = cache.get(key); if (t) return t;
      t = [];
      for (const raw of key.toLowerCase().replace(/[’`]/g, "'").split(/[^a-z0-9'-]+/)) {
        const w = raw.replace(/^['-]+|['-]+$/g, '').replace(/'s$/, ''); if (!w || w.length < 2 && !/\d/.test(w)) continue;
        const parts = w.includes('-') && find(w) < 0 ? w.split('-').filter(Boolean) : [w];
        for (const p of parts) { if (FILLER.has(p)) continue; const r = find(p); t.push({ w: p, r, wt: r >= 0 ? weightOf(r) : 1 }); }
      }
      if (cache.size > 4000) cache.clear(); cache.set(key, t); return t;
    }
    const wcos = (a, b) => { let s = 0; const oa = a * dim, ob = b * dim; for (let k = 0; k < dim; k++) s += T[oa + k] * T[ob + k]; return s / S2; };
    // two words: 1 the same, else how close in meaning (raw cosines under ~0.35 are noise for a 64-number table)
    const near = (a, b) => { if (a.w === b.w) return 1; if (a.r < 0 || b.r < 0) return a.w.length > 4 && b.w.length > 4 && (a.w.startsWith(b.w.slice(0, 5)) || b.w.startsWith(a.w.slice(0, 5))) ? 0.8 : 0; if (a.r === b.r) return 1; const c = wcos(a.r, b.r); return c <= 0.35 ? 0 : Math.min(1, (c - 0.35) / 0.45); };
    function embed(text) {
      const v = new Float32Array(dim); let any = 0;
      for (const t of toks(text)) { if (t.r < 0) continue; const o = t.r * dim; for (let k = 0; k < dim; k++) v[k] += T[o + k] * t.wt; any++; }
      if (!any) return v; let s = 0; for (let k = 0; k < dim; k++) s += v[k] * v[k]; s = Math.sqrt(s) || 1; for (let k = 0; k < dim; k++) v[k] /= s; return v;
    }
    const sim = (a, b) => { let s = 0; for (let k = 0; k < dim; k++) s += a[k] * b[k]; return s; };
    // How well does `text` cover what `q` asks about? Each word of q finds its closest word in text; rare words
    // count more. 0..1. This is what search and "did you mean" use (better than one averaged vector for short texts).
    function cover(q, text) {
      const A = toks(q), B = toks(text); if (!A.length || !B.length) return 0;
      let got = 0, all = 0;
      for (const a of A) { let best = 0; for (const b of B) { const s = near(a, b); if (s > best) { best = s; if (best === 1) break; } } got += best * a.wt; all += a.wt; }
      return all ? got / all : 0;
    }
    // The same over a whole list at once, so a query word that matches nearly everything in the list ("list",
    // "hall" in a tribe planning a party in a hall) counts for less than one that picks a few out.
    function coverMany(q, texts) {
      const A = toks(q), N = texts.length; if (!A.length || !N) return texts.map(() => 0);
      const best = A.map(() => new Float32Array(N));
      texts.forEach((text, j) => { const B = toks(text); A.forEach((a, i) => { let m = 0; for (const b of B) { const s = near(a, b); if (s > m) { m = s; if (m === 1) break; } } best[i][j] = m; }); });
      const wt = A.map((a, i) => { let hit = 0; for (let j = 0; j < N; j++) hit += best[i][j]; return a.wt * Math.pow(Math.log(1 + N / (0.5 + hit)) / Math.log(1 + N / 0.5), 2); });
      const all = wt.reduce((s, x) => s + x, 0) || 1;
      return texts.map((_, j) => { let got = 0; for (let i = 0; i < A.length; i++) got += best[i][j] * wt[i]; return got / all; });
    }
    // both ways: a short query against a short text (a command example, a task title)
    const score = (q, text) => { const c1 = cover(q, text); if (!c1) return 0; return c1 * 0.7 + cover(text, q) * 0.3; };
    function rank(q, items, k = 10) { const out = []; for (let i = 0; i < items.length; i++) { const s = typeof items[i] === 'string' ? score(q, items[i]) : sim(typeof q === 'string' ? embed(q) : q, items[i]); if (s > 0) out.push({ i, score: s }); } return out.sort((a, b) => b.score - a.score).slice(0, k); }
    return { embed, sim, score, cover, coverMany, rank, toks, near, knows: w => find(String(w).toLowerCase()) >= 0, dim, vocabSize: n, name: 'built-in', builtin: true, tokens: t => toks(t).length };
  }

  // the built-in table with the optional helper on top: one model object for flintnlu.js and flintsem.js
  function stack(builtin, helper) {
    if (!helper) return builtin; if (!builtin) return helper;
    const cos = (q, text) => Math.max(0, helper.sim(helper.embed(q), helper.embed(String(text).slice(0, 600))));
    return { ...builtin, embed: helper.embed, sim: helper.sim, dim: helper.dim, name: helper.name || 'helper', builtin: false, helper: true,
      score: (q, text) => builtin.score(q, text) * 0.6 + cos(q, text) * 0.4, cover: (q, text) => builtin.cover(q, text) * 0.6 + cos(q, text) * 0.4,
      coverMany: (q, texts) => { const qv = helper.embed(q); return builtin.coverMany(q, texts).map((c, j) => c * 0.6 + Math.max(0, helper.sim(qv, helper.embed(String(texts[j]).slice(0, 600)))) * 0.4); } };
  }
  // re-rank a short list (help answers) by meaning, blended with the score it came with
  function rerank(model, q, items, textOf, baseOf) {
    if (!model || !items || !items.length) return items || [];
    const top = Math.max(1e-6, ...items.map(a => (baseOf ? baseOf(a) : 0) || 0));
    return items.map(a => { const m = model.cover ? model.cover(q, textOf(a)) : Math.max(0, model.sim(model.embed(q), model.embed(textOf(a)))); return { ...a, cos: m, blend: m * 0.5 + ((baseOf ? baseOf(a) : 0) || 0) / top * 0.5 }; }).sort((a, b) => b.blend - a.blend);
  }
  return { fromBuffer, stack, rerank, version: 1 };
});
