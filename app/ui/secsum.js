// Secretary summaries without an AI: plain-rules, deterministic, the same in the browser and on the server.
//   summarize(texts, n)            -> the n sentences that matter most (TextRank over word overlap)
//   actions(items, ctx)            -> action items with an owner and a due date when the words say so
//   decisions / questions / people / links (items, ctx)
//   digest(items, ctx)             -> all of the above at once
// items: [{ text, who, by, at }]. ctx: { members: [{ id, name }], now: Date } (now only for due dates).
// Loaded as a <script> (window.TribeSecSum) and required by server/secretary.js.
(function (root) {
  'use strict';
  const STOP = new Set(('a an the and or but if then so to of in on at for with from by as is are was were be been being it its this that these those i me my we our you your he she they them their his her im ive id ill youre were dont didnt cant wont isnt just really very also too okay ok yeah yes no not do does did done have has had will would could should can may might must shall about into over after before up down out off again here there when where why how what which who whom all any both each few more most other some such only own same than too very s t now let lets get got go going gonna want wanna think know like make made thing things stuff one two').split(/\s+/));
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const toks = s => (String(s || '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9][a-z0-9-]*/g) || []).filter(w => w.length > 2 && !STOP.has(w)).map(w => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

  function sentences(text) {
    return String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"'(@])|\s*[\n•]\s*/).map(s => s.trim()).filter(s => s.split(' ').length >= 4);
  }
  // TextRank: sentences are nodes, edges weigh shared words (normalised by length); 20 power iterations.
  function summarize(texts, n = 3) {
    const sents = []; for (const t of [].concat(texts || [])) for (const s of sentences(t)) if (!sents.includes(s)) sents.push(s);
    if (sents.length <= n) return sents;
    const bags = sents.map(s => new Set(toks(s)));
    const N = sents.length, W = Array.from({ length: N }, () => new Float64Array(N));
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let c = 0; for (const w of bags[i]) if (bags[j].has(w)) c++;
      if (!c) continue;
      const v = c / (Math.log(bags[i].size + 1) + Math.log(bags[j].size + 1) || 1); W[i][j] = W[j][i] = v;
    }
    const out = W.map(r => r.reduce((a, b) => a + b, 0) || 1);
    let sc = new Float64Array(N).fill(1);
    for (let it = 0; it < 20; it++) {
      const nx = new Float64Array(N);
      for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) if (W[j][i]) s += W[j][i] / out[j] * sc[j]; nx[i] = 0.15 + 0.85 * s; }
      sc = nx;
    }
    return sents.map((s, i) => ({ s, i, v: (sc[i] + Math.min(bags[i].size, 12) * 0.01) * (/https?:\/\//.test(s) ? 0.5 : 1) })).sort((a, b) => b.v - a.v).slice(0, n).sort((a, b) => a.i - b.i).map(x => clip(x.s, 220));
  }

  // ---------- dates ("by friday", "tomorrow", "next week", "on the 21st", 2026-11-20) ----------
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function dueOf(text, now = new Date()) {
    const t = String(text || '').toLowerCase(), d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let m;
    if ((m = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if (/\b(today|tonight|eod|end of (the )?day)\b/.test(t)) return iso(d);
    if (/\btomorrow\b/.test(t)) { d.setDate(d.getDate() + 1); return iso(d); }
    if (/\b(next week)\b/.test(t)) { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return iso(d); }
    if (/\b(this |the )?weekend\b/.test(t)) { d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); return iso(d); }
    if (/\b(end of (the )?week|this week)\b/.test(t)) { d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return iso(d); }
    if ((m = t.match(/\b(?:by|on|before|until|this|next)?\s*(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\b/))) {
      const k = DAYS.findIndex(x => x.startsWith(m[1].slice(0, 3))); if (k >= 0) { let add = (k - d.getDay() + 7) % 7 || 7; if (/\bnext\s/.test(m[0])) add += add < 7 ? 7 : 0; d.setDate(d.getDate() + add); return iso(d); }
    }
    if ((m = t.match(/\b(?:on the |by the )(\d{1,2})(?:st|nd|rd|th)\b/))) { const n = +m[1]; if (n >= 1 && n <= 31) { if (n < d.getDate()) d.setMonth(d.getMonth() + 1); d.setDate(n); return iso(d); } }
    return null;
  }

  // ---------- people ----------
  function nameIndex(members) {
    const idx = [];
    for (const m of members || []) { const full = String(m.name || '').trim(); if (!full) continue; const first = full.split(/\s+/)[0]; idx.push({ id: m.id, name: full, keys: [...new Set([full.toLowerCase(), first.toLowerCase()])].filter(k => k.length >= 2) }); }
    return idx;
  }
  function mentioned(text, idx) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9@ ]/g, ' ') + ' ';
    return idx.filter(p => p.keys.some(k => t.includes(' ' + k + ' ') || t.includes(' @' + k + ' ')));
  }

  // ---------- action items ----------
  const ACT = /\b(i'?ll|i will|i'?m going to|i can|let me|can you|could you|would you|please|need(s)? to|have to|has to|should|todo|to-do|to do:|action( item)?:?|follow up|remind me|don'?t forget|let'?s|we('ll| will| need| should))\b/i;
  const NOT_ACT = /\?\s*$|^(what|why|how|when|where|who|is|are|does|do)\b.*\?$/i;
  function actions(items, ctx = {}) {
    const idx = nameIndex(ctx.members), now = ctx.now ? new Date(ctx.now) : new Date(), out = [];
    for (const it of items || []) {
      for (const s of sentences(it.text).concat(String(it.text || '').split(' ').length < 4 ? [String(it.text || '')] : [])) {
        if (!ACT.test(s) || (NOT_ACT.test(s) && !/\b(can|could|would) you\b/i.test(s))) continue;
        let owner = null; const low = s.toLowerCase();
        const at = s.match(/@([\w.-]{2,30})/);
        if (at) owner = idx.find(p => p.keys.includes(at[1].toLowerCase())) || null;
        if (!owner && /\b(can|could|would) you\b/i.test(s)) owner = mentioned(s, idx).find(p => p.id !== it.by) || null;
        if (!owner) { const ms = mentioned(s, idx).filter(p => new RegExp(`\\b${p.keys[p.keys.length - 1]}\\b\\s+(will|to|should|needs?|can|could|is going to)\\b`, 'i').test(low)); owner = ms[0] || null; }
        if (!owner && /\b(i'?ll|i will|i'?m going to|i can|let me|remind me)\b/i.test(s) && it.by) owner = idx.find(p => p.id === it.by) || { id: it.by, name: it.who || '' };
        const title = clip(s.replace(/^(ok(ay)?|so|and|also|yeah|um+|uh+)[,\s]+/i, '').replace(/^(todo|to-do|action( item)?)[:\s-]*/i, '').replace(/^@?[A-Z][\w.-]*,?\s+(?=(can|could|would) you\b)/, '').replace(/^(can|could|would) you( please)?\s+/i, '').replace(/^(i'?ll|i will|i'?m going to|let me)\s+/i, '').replace(/^(please)\s+/i, '').replace(/^@?[A-Z][\w.-]*\s+(needs? to|has to|will|should|is going to|can)\s+/, '').replace(/[.!?]+$/, ''), 120);
        if (title.split(' ').length < 2) continue;
        const key = toks(title).slice(0, 6).join(' ');
        if (out.some(a => a.key === key)) continue;
        out.push({ key, title: title.charAt(0).toUpperCase() + title.slice(1), owner: owner ? owner.id : null, ownerName: owner ? owner.name : '', due: dueOf(s, now), from: it.who || '', by: it.by || null, at: it.at || null, kind: it.kind || '' });
      }
    }
    return out.slice(0, 40);
  }
  const DECIDE = /\b(decided|we('re| are) going with|let'?s go with|agreed|we('ll| will) use|settled on|going with|final call|the plan is)\b/i;
  const decisions = items => { const o = []; for (const it of items || []) for (const s of sentences(it.text).concat([String(it.text || '')])) if (DECIDE.test(s) && !o.some(x => x.text === clip(s, 200))) { o.push({ text: clip(s, 200), from: it.who || '', at: it.at || null }); break; } return o; };
  const questions = items => { const o = []; for (const it of items || []) { const q = String(it.text || '').match(/[^.!?]*\?/g) || []; for (const s of q) { const t = clip(s, 200); if (t.split(' ').length >= 3 && !o.some(x => x.text === t)) o.push({ text: t, from: it.who || '', at: it.at || null }); } } return o.slice(0, 20); };
  function people(items, ctx = {}) {
    const idx = nameIndex(ctx.members), c = new Map();
    for (const it of items || []) for (const p of mentioned(it.text, idx)) c.set(p.id, { id: p.id, name: p.name, n: ((c.get(p.id) || {}).n || 0) + 1 });
    return [...c.values()].sort((a, b) => b.n - a.n);
  }
  function links(items) { const o = []; for (const it of items || []) for (const u of String(it.text || '').match(/https?:\/\/[^\s)<>"']+/g) || []) if (!o.some(x => x.url === u)) o.push({ url: u.replace(/[.,]+$/, ''), from: it.who || '' }); return o.slice(0, 30); }
  function digest(items, ctx = {}) {
    const texts = (items || []).map(it => String(it.text || '')).filter(Boolean);
    return { summary: summarize(texts, ctx.n || 3), actions: actions(items, ctx), decisions: decisions(items), questions: questions(items), people: people(items, ctx), links: links(items) };
  }
  const api = { summarize, sentences, actions, decisions, questions, people, links, digest, dueOf };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeSecSum = api;
})(typeof window !== 'undefined' ? window : globalThis);
