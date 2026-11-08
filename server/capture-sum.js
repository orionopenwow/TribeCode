// feat/captures: the deterministic summarizer (no model needed). docs/LINK-READER.md "Summaries without heavy AI".
//   summarize({ text | lines, recipe, corpus, people, weights }) -> { summary, points, actions, decisions, tags, keywords, features }
//     text:   clean article text (paragraphs separated by blank lines)
//     lines:  timestamped transcript lines [{ t (seconds), who, text }] (voice notes, videos)
//     recipe: sections + cue phrases (server/capture-recipes.js)
//     corpus: other texts of the project (its docs) for TF-IDF, so words every doc uses count less
//     people: member names, to give action items an owner ("Maya: record the creak sound")
//     weights: the tribe's learned scorer weights (keep/discard signals, see learn())
// Each picked sentence keeps the timestamp of the line it came from, and its "features" (position bucket, cue phrases)
// so later keep/delete signals can nudge the weights. Everything here is plain functions: easy to test and measure.
'use strict';

const STOP = new Set(('a about above after again against all am an and any are aren\'t as at be because been before being below between both but by can can\'t cannot could ' +
  'did didn\'t do does doesn\'t doing don\'t down during each few for from further had has have having he her here hers herself him himself his how i i\'m i\'ll i\'ve if in into is ' +
  'isn\'t it it\'s its itself just let\'s like me more most my myself no nor not now of off on once only or other our ours ourselves out over own really same she should so some ' +
  'such than that that\'s the their theirs them themselves then there there\'s these they they\'re this those through to too under until up very was wasn\'t we we\'re we\'ll ' +
  'we\'ve were what when where which while who whom why will with would you you\'re your yours yourself yourselves um uh yeah okay ok also maybe kind sort thing things get got ' +
  'gonna going go one two lot well actually basically right know think mean said say says').split(/\s+/));
const ABBR = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|inc|ltd|co|fig|no|approx|min|max)\.$/i;

const DEFAULT_WEIGHTS = { pos: { lead: 1.6, early: 1.15, middle: 1, late: 1.05 }, cue: {}, len: { short: 0.7, ok: 1, long: 0.85 }, keyword: 1 };

function stem(w) {
  if (w.length <= 3) return w;
  return w.replace(/'s$/, '').replace(/(ies)$/, 'y').replace(/(sses)$/, 'ss').replace(/([^s])s$/, '$1').replace(/(ing|ed)$/, '').replace(/(ly)$/, '') || w;
}
const words = s => String(s || '').toLowerCase().replace(/[’']/g, "'").match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
const terms = s => words(s).filter(w => !STOP.has(w) && w.length > 2 && !/^\d+$/.test(w)).map(stem);

// Sentences, keeping where each came from (paragraph index, line index, timestamp).
function sentences(input) {
  const out = [];
  const push = (text, meta) => {
    const parts = []; let buf = '';
    const toks = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"“'‘(\[])/u);
    for (const t of toks) { buf = buf ? `${buf} ${t}` : t; if (!ABBR.test(buf) && !/\b\d+\.$/.test(buf.slice(-4))) { parts.push(buf); buf = ''; } }
    if (buf) parts.push(buf);
    for (const p of parts) { const s = p.trim(); if (s) out.push({ text: s, ...meta }); }
  };
  if (Array.isArray(input.lines) && input.lines.length) input.lines.forEach((l, li) => { if (l && l.text) push(l.text, { line: li, t: Number.isFinite(l.t) ? l.t : null, who: l.who || '', para: li }); });
  else String(input.text || '').split(/\n\s*\n/).forEach((p, pi) => {
    const s = p.trim(); if (!s) return;
    if (/^#{1,6}\s/.test(s)) { out.push({ text: s.replace(/^#+\s*/, ''), para: pi, heading: true }); return; }
    push(s.replace(/^[-*]\s+/, ''), { para: pi, bullet: /^[-*]\s+/.test(s) });
  });
  out.forEach((s, i) => { s.i = i; });
  return out;
}

function idfFrom(docs) {
  const df = new Map(); let n = 0;
  for (const d of docs) { n++; for (const w of new Set(terms(d))) df.set(w, (df.get(w) || 0) + 1); }
  return w => Math.log((n + 1) / ((df.get(w) || 0) + 1)) + 1;
}
const posBucket = (i, n) => (i < Math.max(1, Math.round(n * 0.08)) ? 'lead' : i < n * 0.3 ? 'early' : i < n * 0.8 ? 'middle' : 'late');
const lenBucket = w => (w < 6 ? 'short' : w > 45 ? 'long' : 'ok');

function cueHits(text, cues) {
  const hits = []; const low = String(text).toLowerCase();
  for (const [kind, list] of Object.entries(cues || {})) for (const c of list || []) {
    const re = c instanceof RegExp ? c : new RegExp(`(^|[^\\p{L}])${String(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu');
    if (re.test(low)) hits.push(`${kind}:${String(c)}`);
  }
  return hits;
}
const jaccard = (a, b) => { const A = new Set(terms(a)), B = new Set(terms(b)); if (!A.size || !B.size) return 0; let x = 0; for (const w of A) if (B.has(w)) x++; return x / (A.size + B.size - x); };
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

// ---------- action items ----------
const IMPERATIVE = /^(?:please\s+|let'?s\s+|we\s+(?:need|have|should|must|will|'ll)\s+(?:to\s+)?|i\s*(?:'ll|will|need to|should)\s+|(?:todo|to-do|action(?: item)?|next step)\s*[:\-]\s*)?(add|fix|make|build|write|record|send|check|test|ship|update|call|email|review|design|create|try|finish|set up|setup|look into|follow up|draft|plan|book|schedule|prepare|clean up|remove|move|rename|share|post|upload|merge|deploy|refactor|research|ask|invite|order|buy|playtest|tune|polish|cut|replace|document|sketch|record)\b/i;
function actionOf(s, people) {
  let t = s.text.replace(/\s+/g, ' ').trim().replace(/^[-*•]\s*/, '');
  for (let k = 0; k < 3; k++) t = t.replace(/^(?:first(?: step)?|second|then|and|so|also|next|okay|ok|alright|right|after that|finally|cool|great)\b[,:]?\s+/i, '');
  if (t.length < 8 || t.length > 260 || /\?$/.test(t)) return null;
  let owner = '';
  const nameRe = people.length ? new RegExp(`^(${people.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b[,:]?\\s*(?:will|'ll|is going to|can|should|to|could you|please)?\\s*`, 'i') : null;
  const nm = nameRe && nameRe.exec(t);
  if (nm && (IMPERATIVE.test(t.slice(nm[0].length)) || /\b(will|'ll|is going to|to)\b/i.test(nm[0]))) { owner = people.find(p => p.toLowerCase() === nm[1].toLowerCase()) || nm[1]; t = t.slice(nm[0].length); }
  else if (s.who && /^(i\s*(?:'ll|will|am going to|can)|i\s+need\s+to|let me)\b/i.test(t)) { owner = s.who; t = t.replace(/^(i\s*(?:'ll|will|am going to|can)|i\s+need\s+to|let me)\s+/i, ''); }
  else if (!IMPERATIVE.test(t)) {
    const will = /^([\p{Lu}][\p{L}]+)\s+(?:will|'ll|is going to|needs to|has to)\s+(.+)$/u.exec(t);
    if (will && people.some(p => p.toLowerCase() === will[1].toLowerCase())) { owner = will[1]; t = will[2]; }
    else if (!/\b(todo|to-do|action item|next step|we need to|we should|need to|let'?s)\b/i.test(t)) return null;
  }
  t = t.replace(/^(?:please\s+|let'?s\s+|we\s+(?:need|have|should|must|will|'ll)\s+(?:to\s+)?|(?:todo|to-do|action(?: item)?|next step)\s*[:\-]\s*)/i, '').replace(/[.!]+$/, '').trim();
  if (!owner) { const ask = /^(?:[\p{Lu}][\p{L}]+),\s+(?:can|could) you\s+(.+)$/u.exec(t); if (ask) t = ask[1]; }
  if (t.split(/\s+/).length < 2) return null;
  t = t[0].toLowerCase() + t.slice(1);
  if (!owner) for (const p of people) if (new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) { owner = p; break; }
  return { text: clip(owner ? `${owner}: ${t}` : t[0].toUpperCase() + t.slice(1), 200), owner, t: s.t ?? null };
}

// ---------- tags (project-sense keywords) ----------
function tagsOf(text, lexicon) {
  const count = new Map();
  for (const [tag, re] of lexicon || []) { const n = (String(text).match(new RegExp(re.source, 'gi')) || []).length; if (n) count.set(tag, (count.get(tag) || 0) + Math.min(n, 6)); }
  return [...count].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
}

function summarize(input = {}) {
  const recipe = input.recipe || {};
  const W = mergeWeights(input.weights);
  const sents = sentences(input).filter(s => s.text.split(/\s+/).length >= 3 || s.heading);
  const body = sents.filter(s => !s.heading);
  const n = body.length;
  const people = (input.people || []).filter(Boolean);
  const allText = input.lines && input.lines.length ? input.lines.map(l => l.text).join('\n') : String(input.text || '');
  const paras = input.lines && input.lines.length ? input.lines.map(l => l.text) : allText.split(/\n\s*\n/);
  const idf = idfFrom([...(input.corpus || []).slice(0, 400), ...paras]);
  const tf = new Map(); for (const w of terms(allText)) tf.set(w, (tf.get(w) || 0) + 1);
  const kw = [...tf].map(([w, c]) => [w, c * idf(w)]).sort((a, b) => b[1] - a[1]);
  const top = new Map(kw.slice(0, 30));
  const cues = recipe.cues || {};
  const cueW = k => (W.cue[k] !== undefined ? W.cue[k] : 1);

  const scored = body.map((s, k) => {
    const ts = terms(s.text), wc = s.text.split(/\s+/).length;
    const kwScore = ts.reduce((a, w) => a + (top.get(w) || 0), 0) / Math.sqrt(Math.max(4, ts.length)) / Math.max(1, kw[0] ? kw[0][1] : 1);
    const pos = input.lines && input.lines.length ? (k < 2 ? 'lead' : posBucket(k, n) === 'lead' ? 'early' : posBucket(k, n)) : (s.para === firstPara(body) ? 'lead' : posBucket(k, n));
    const hits = cueHits(s.text, { key: cues.key, decision: cues.decision, action: cues.action, skip: cues.skip });
    const len = lenBucket(wc);
    let v = (0.4 + kwScore * 2 * W.keyword) * (W.pos[pos] || 1) * (W.len[len] || 1);
    for (const h of hits) { const kind = h.split(':')[0]; v *= kind === 'skip' ? 0.3 : (kind === 'decision' ? 1.5 : kind === 'key' ? 1.35 : 1.15) * cueW(h); }
    if (/\?$/.test(s.text)) v *= 0.6;
    if (/^(hi|hello|hey|thanks|thank you|bye|ok|okay|so|um|uh)\b[\s,.!]*$/i.test(s.text)) v *= 0.1;
    return { s, v, features: [`pos:${pos}`, `len:${len}`, ...hits] };
  });

  const want = Math.max(1, Math.min(recipe.summarySentences || 4, Math.ceil(n / 3) || 1));
  const ranked = scored.slice().sort((a, b) => b.v - a.v);
  const pickDistinct = (list, k, exclude = []) => { const out = []; for (const x of list) { if (out.length >= k) break; if ([...out, ...exclude].some(y => jaccard(y.s.text, x.s.text) > 0.55)) continue; out.push(x); } return out; };
  const sum = pickDistinct(ranked, want).sort((a, b) => a.s.i - b.s.i);
  const pts = pickDistinct(ranked.filter(x => !sum.includes(x)), Math.min(recipe.points || 6, 8), sum).sort((a, b) => a.s.i - b.s.i);
  // A short input: points can repeat the summary's sentences rather than be empty.
  const points = (pts.length >= 3 ? pts : pickDistinct(ranked, Math.min(recipe.points || 6, Math.max(3, n)))).sort((a, b) => a.s.i - b.s.i);

  const actions = [], seenA = [];
  for (const x of scored) {
    if (recipe.sections && !recipe.sections.includes('actions')) break;
    const a = actionOf(x.s, people); if (!a) continue;
    if (seenA.some(y => jaccard(y, a.text) > 0.6)) continue;
    seenA.push(a.text); actions.push({ ...a, features: x.features });
    if (actions.length >= 10) break;
  }
  const decisions = [];
  for (const x of scored) {
    if (!x.features.some(f => f.startsWith('decision:'))) continue;
    if (decisions.some(d => jaccard(d.text, x.s.text) > 0.6)) continue;
    decisions.push({ text: clip(x.s.text, 240), t: x.s.t ?? null, who: x.s.who || '' });
    if (decisions.length >= 6) break;
  }
  const item = x => ({ text: clip(x.s.text, 240), t: x.s.t ?? null, ...(x.s.who ? { who: x.s.who } : {}), features: x.features });
  return {
    summary: sum.map(x => x.s.text).join(' ').slice(0, 1400),
    summaryItems: sum.map(item),
    points: points.map(item),
    actions,
    decisions,
    tags: tagsOf(allText, input.lexicon),
    keywords: kw.slice(0, 8).map(([w]) => w),
  };
}
function firstPara(body) { return body.length ? body[0].para : -1; }

// ---------- keep / discard learning ----------
// signals: [{ features: [...], kept: true|false, edited?: bool }]. Small steps, clamped, so one bad day can't wreck it.
function mergeWeights(w) {
  const d = JSON.parse(JSON.stringify(DEFAULT_WEIGHTS));
  if (!w || typeof w !== 'object') return d;
  for (const k of ['pos', 'len', 'cue']) if (w[k] && typeof w[k] === 'object') for (const [a, v] of Object.entries(w[k])) if (Number.isFinite(v)) d[k][a] = v;
  if (Number.isFinite(w.keyword)) d.keyword = w.keyword;
  return d;
}
function learn(weights, signals) {
  const W = mergeWeights(weights); let changed = 0;
  const step = (group, key, delta) => { const cur = W[group][key] !== undefined ? W[group][key] : 1; W[group][key] = Math.round(Math.max(0.2, Math.min(3, cur + delta)) * 1000) / 1000; changed++; };
  for (const s of signals || []) {
    const delta = s.kept ? (s.edited ? -0.02 : 0.03) : -0.12;
    for (const f of s.features || []) {
      const [g, ...rest] = String(f).split(':'), key = rest.join(':');
      if (g === 'pos' || g === 'len') step(g, key, delta);
      else if (g === 'key' || g === 'decision' || g === 'action' || g === 'skip') step('cue', `${g}:${key}`, delta);
    }
  }
  return { weights: W, changed };
}

// ---------- evaluation (app/test/fixtures/captures) ----------
// Unigram recall of the reference summary by our summary + points, and how many reference actions we found.
function evaluate(out, ref) {
  const mine = new Set(terms([out.summary, ...(out.points || []).map(p => p.text)].join(' ')));
  const want = terms((ref.summary || []).join(' '));
  const recall = want.length ? want.filter(w => mine.has(w)).length / want.length : 1;
  const acts = (ref.actions || []);
  const found = acts.filter(a => (out.actions || []).some(b => { const A = new Set(terms(a)), B = new Set(terms(b.text)); let x = 0; for (const w of A) if (B.has(w)) x++; return A.size && x / A.size >= 0.5; })).length;
  return { recall: Math.round(recall * 1000) / 1000, actionRecall: acts.length ? Math.round(found / acts.length * 1000) / 1000 : 1, actions: (out.actions || []).length };
}

module.exports = { summarize, sentences, learn, evaluate, mergeWeights, DEFAULT_WEIGHTS, terms, actionOf, tagsOf };
