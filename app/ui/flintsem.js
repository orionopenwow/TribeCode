// Flint's matching by meaning, shared by search, duplicate-task detection, related docs, comment groups and the short
// summary (feat/flint-local). Two layers that add up:
//   no model     words are stemmed and folded into everyday concept groups (cost ~ price ~ budget, cut ~ drop ~ remove),
//                then ranked by TF-IDF (flintnlu.js index/search). Instant, always on.
//   local helper the word-embedding model, when it is on this device (flintembed.js): cosine, blended with the above.
// Pure functions; browser (window.TribeFlintSem) and Node (the capability report, the unit test).
//   rank(q, docs, { nlu, model, k })            docs: [{ id, text }] -> [{ id, score, doc }] best first
//   duplicate(title, titles, { model })         -> index of a task that says the same thing, or -1
//   related(text, docs, { nlu, model, k })      -> docs that are about the same thing
//   cluster(texts, { model, min })              -> [{ label, items: [index] }] groups of similar comments
//   summary(text, LD, { maxWords })             -> the sentences that carry the facts (dates, numbers, decisions, needs)
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintSem = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // everyday concept groups: the first word is the group's name. General project vocabulary, not a model.
  const GROUPS = [
    'cost costs price prices pricing priced money budget cheap cheaper expensive fee fees pay paid payment dollars subscription discount discounts income revenue expenses expense spend runway afford',
    'cut cuts drop dropped remove removed removing scrap scrapped skip skipped delete deleted ditch ditched axe axed',
    'release released launch launched launching ship shipped shipping publish published v1 version1 golive live demo',
    'merch merchandise stickers sticker shirts shirt tshirts hoodies swag posters badges',
    'booth stand stall table kiosk',
    'outage down downtime crash crashed crashes offline broke broken failure failed',
    'video trailer clip footage film teaser recording',
    'narration voiceover voice narrator narrate spoken',
    'education school schools students student teachers classroom university college',
    'hard harder difficult difficulty tough impossible easy easier balance balanced',
    'save saved saves saving savegame checkpoint',
    'plan plans planning roadmap checklist todo todos steps schedule agenda',
    'buy buying get getting order ordering purchase purchasing pick grab',
    'email emails mail send sending message',
    'call calls phone ring',
    'fix fixes fixed fixing repair solve patch debug',
    'bug bugs issue issues glitch error errors problem problems defect',
    'write writing draft drafting compose',
    'meet meeting meetings sync standup call huddle',
    'decide decided decision decisions agreed agree chose chosen settled',
    'people person team members friends everyone folks players users customers readers',
    'picture pictures image images photo photos art artwork drawing sprite sprites graphic graphics logo',
    'music sound sounds audio song songs soundtrack sfx',
    'site website page pages web landing homepage',
    'talk talked discuss discussed discussion chat chatted said mention mentioned conversation',
    'before prior ahead until deadline due',
    'complain complaint complaints complained feedback angry unhappy frustrated nobody',
    'night evening midnight late tonight overnight',
    'game games level levels boss playtest player',
    'begin start started starting kickoff open opened',
    'finish finished done complete completed end ended land landed arrive arrived',
  ].map(g => g.split(' '));
  const CANON = new Map(); for (const g of GROUPS) for (const w of g) if (!CANON.has(w)) CANON.set(w, g[0]);
  const STOP = new Set('a an the to of in on at for and or is are was were be been do does did how what why where when who which can could should would will i me my we our us you your it its this that these those with from by as about into out up so if then than there here have has had not no too very just some any all more most much many them they he she his her'.split(' '));
  const stem = w => { if (w.length > 4) w = w.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, ''); else if (w.length > 3) w = w.replace(/s$/, ''); return w; };
  const SCAN = new Map(); for (const [w, c] of CANON) if (!SCAN.has(stem(w))) SCAN.set(stem(w), c);
  const canon = w => CANON.get(w) || SCAN.get(stem(w)) || stem(w);
  const words = t => String(t || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
  const concepts = t => words(t).map(canon);
  // the text an index sees: its own words plus each word's concept name
  const expand = t => { const w = words(t); return `${t} ${w.map(canon).join(' ')}`; };

  const IDX = new WeakMap();   // the word index of a docs list is kept while that list is (search-as-you-type asks again and again)
  function rank(q, docs, { nlu, model, k = 5 } = {}) {
    const lex = new Map(); let top = 0;
    if (nlu) { let idx = IDX.get(docs); if (!idx) { idx = nlu.index(docs.map((d, i) => ({ id: i, text: expand(d.text) }))); IDX.set(docs, idx); } for (const h of nlu.search(idx, expand(q), docs.length)) { lex.set(h.doc.id, h.score); if (h.score > top) top = h.score; } }
    const qc = new Set(concepts(q));
    const qv = model && !model.cover ? model.embed(q) : null, out = [];
    const many = model && model.coverMany ? model.coverMany(q, docs.map(d => String(d.text).slice(0, 600))) : null;
    docs.forEach((d, i) => {
      const dc = new Set(concepts(d.text)); let shared = 0; qc.forEach(c => { if (dc.has(c)) shared++; });
      const l = (top ? (lex.get(i) || 0) / top : 0) * 0.5 + (qc.size ? shared / qc.size : 0) * 0.5;
      const cos = !model ? 0 : many ? many[i] : model.cover ? model.cover(q, String(d.text).slice(0, 600)) : Math.max(0, model.sim(qv, model.embed(String(d.text).slice(0, 600))));
      const score = model ? (model.cover ? l * 0.2 + cos * 0.8 : l * 0.6 + cos * 0.4) : l;   // the word table carries its own exact-word matching, so it leads
      if (score > 0.08) out.push({ id: d.id, score, doc: d, lex: l, cos });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
  function overlap(a, b) { const A = new Set(concepts(a)), B = new Set(concepts(b)); if (!A.size || !B.size) return { both: 0, frac: 0 }; let n = 0; A.forEach(x => { if (B.has(x)) n++; }); return { both: n, frac: n / Math.min(A.size, B.size) }; }
  function duplicate(title, titles, { model } = {}) {
    let best = -1, bs = 0; const tv = model ? model.embed(title) : null;
    (titles || []).forEach((t, i) => {
      const o = overlap(title, t); let s = o.both >= 2 && o.frac >= 0.75 ? o.frac : 0;
      if (!s && tv && o.both >= 1) { const cos = model.sim(tv, model.embed(t)); if (cos >= 0.86) s = cos * 0.9; }   // the helper only confirms a near miss; it never flags on its own
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }
  function related(text, docs, o = {}) { return rank(String(text || '').slice(0, 400), docs, { ...o, k: (o.k || 3) + 1 }).filter(r => r.doc.text !== text && r.score >= 0.25).slice(0, o.k || 3); }
  function cluster(texts, { model, min = 0.5 } = {}) {
    const groups = [];
    texts.forEach((t, i) => {
      let best = null, bs = 0;
      for (const g of groups) { const o = overlap(t, texts[g.items[0]]); let s = o.both >= 1 ? o.frac : 0; if (model) s = Math.max(s, model.sim(model.embed(t), model.embed(texts[g.items[0]])) * 0.9); if (s > bs) { bs = s; best = g; } }
      if (best && bs >= min) best.items.push(i); else groups.push({ items: [i] });
    });
    for (const g of groups) { const count = new Map(); g.items.forEach(i => new Set(concepts(texts[i])).forEach(c => count.set(c, (count.get(c) || 0) + 1))); const topc = [...count.entries()].sort((a, b) => b[1] - a[1])[0]; g.label = topc && (g.items.length > 1 ? topc[1] > 1 : true) ? topc[0] : 'other'; }
    return groups.sort((a, b) => b.items.length - a.items.length);
  }
  // A summary that keeps the facts: sentences with a date, a number, a decision or a need score highest; small talk scores low.
  const FACT = [[/\b(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}|(?:mon|tues|wednes|thurs|fri|satur|sun)days?|tomorrow|next week|deadline)\b/i, 3],
    [/\b(?:decided|agreed|decision|we will|we'll|will move|going to|plan to|must|have to|has to)\b/i, 3], [/\b(?:need|needs|still need|missing|blocked|bug|lost|broken|problem|too hard|quit|dropped)\b/i, 2.5],
    [/\b\d[\d,.]*\s*(?:percent|%|dollars|\$|people|players|readers|users)?\b|\$\d/i, 1.5], [/\b(?:because|so that|goes to|comes? from|most|all the)\b/i, 1.5]];
  const CHAT = /\b(?:weather|lovely|lunch|pizza|coffee|by the way|nearly done|anyway)\b/i;
  function summary(text, LD, { maxWords = 40 } = {}) {
    const sents = String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 3);
    if (sents.length <= 2) return sents.join(' ');
    const scored = sents.map((s, i) => { let sc = 0; for (const [rx, w] of FACT) if (rx.test(s)) sc += w; if (CHAT.test(s)) sc -= 4; const n = s.split(/\s+/).length; return { s, i, n, sc, per: sc / Math.sqrt(n) }; });
    const pick = []; let used = 0;
    for (const x of scored.slice().sort((a, b) => b.per - a.per || a.i - b.i)) { if (x.sc <= 0 || used + x.n > maxWords) continue; pick.push(x); used += x.n; }
    if (!pick.length) return LD && LD.summarize ? LD.summarize(text, { max: 2 }).text : sents.slice(0, 2).join(' ');
    return pick.sort((a, b) => a.i - b.i).map(x => x.s).join(' ');
  }
  return { rank, duplicate, related, cluster, summary, concepts, canon, expand, GROUPS, version: 1 };
});
