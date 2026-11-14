// Suggested changes to the website, drawn from what the tribe already said (feat/site-editor2). Shared by the server
// (server/sitesuggest.js gathers what a member may read and calls this) and the browser (a project that lives on this
// device). No AI: plain rules over chat messages, tasks, docs, updates, decisions, proposals and comments on the site.
//
//   suggest(cfg, sources, S) -> [{ id, kind, title, before, after, ops, target: { page, block, path }, source }]
//       ops are sitecfg.applyOps steps, so applying one is a normal, undoable edit and is checked like any other.
//   related(cfg, sel, sources, S) -> the sources that talk about the selected element or its section, best first
//   source: { id, kind: 'chat'|'task'|'doc'|'update'|'decision'|'proposal'|'comment', text, title?, who, at, link?, decided?, block? }
//
// A rule only fires when the site would really change: if the page already says it, there is nothing to suggest.
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeSiteSuggestCore = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const one = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > (n || 140) ? s.slice(0, (n || 140) - 1) + '…' : s; };
  const hash = s => { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const sentences = t => String(t || '').split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean).slice(0, 40);
  const SITE_W = /\b(?:site|website|web ?page|home ?page|landing page|page|link in bio|linktree)\b/i;
  const OPEN_W = /\b(?:we(?:'re| are)? open(?:ing)?|opens?|opening (?:time|hours?|day)|doors(?: open)?|open (?:on|at|from)|hours (?:are|change))\b/i;
  const PAST_W = /\b(?:was|were|used to|last (?:week|month|year)|yesterday|closed)\b/i;
  // sections a sentence can ask for, and the block that answers it
  const WANT = [[/\b(?:contact|enquiry|inquiry|message)\s+form\b|\bcontact (?:section|page)\b|\bway to (?:contact|reach|message) us\b/i, 'contact', 'a contact form'], [/\b(?:pricing|price list|prices?) (?:section|table|list|page)?\b|\bpricing\b/i, 'pricing', 'a pricing section'], [/\bfaq\b|\bfrequently asked\b|\bquestions? (?:section|and answers)\b/i, 'faq', 'questions and answers'], [/\b(?:photo |picture |image )?gallery\b|\bphotos? section\b/i, 'gallery', 'a gallery'],
    [/\b(?:testimonials?|reviews?|what (?:people|customers) say)\b/i, 'testimonials', 'what people say'], [/\b(?:newsletter|email sign ?up|mailing list|subscribe (?:box|form))\b/i, 'newsletter', 'a newsletter signup'], [/\b(?:team|who we are|about us) (?:section|page)\b|\bmeet the team\b/i, 'team', 'a team section'],
    [/\b(?:opening hours|hours and address|visit us|find us|directions|address) (?:section)?\b/i, 'info', 'a “Visit us” section'], [/\b(?:video|trailer|embed)\b/i, 'embed', 'a video'], [/\b(?:steps|how it works)\b/i, 'steps', 'a “How it works” section'], [/\b(?:timeline|our story so far)\b/i, 'timeline', 'a timeline']];
  const ADD_W = /\b(?:add|adds|adding|need|needs|want|wants|put|include|should have|must have|missing|let'?s (?:add|have|put)|we should (?:add|have)|can we (?:add|have|get))\b/i;
  const COLORS = { teal: '#2A8C80', blue: '#2F5BEA', green: '#4C8C4A', red: '#C92A2A', orange: '#E4572E', yellow: '#E0951F', purple: '#7A5CC2', pink: '#C2417F', black: '#111111', navy: '#1F2A5C', brown: '#7A4B2A', gold: '#B8860B' };
  const EMAIL = /\b([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\b/;
  const WEIGHT = { decision: 5, proposal: 3, task: 3, comment: 3, doc: 2, update: 2, chat: 1 };

  function suggest(cfg, sources, S) {
    const c = S.normalize(JSON.parse(JSON.stringify(cfg))), out = [], seen = new Set();
    const hasType = t => c.pages.some(p => p.blocks.some(b => b.type === t));
    const blockAt = id => { for (const pg of c.pages) { const b = pg.blocks.find(x => x.id === id); if (b) return { pg, b }; } return null; };
    const hero = () => { for (const pg of c.pages) { const b = pg.blocks.find(x => x.type === 'hero' || x.type === 'links'); if (b) return { pg, b }; } return null; };
    const push = (src, kind, title, before, after, ops, target) => {
      const key = `${kind}|${target ? target.block + '|' + target.path : ''}|${after}`; if (seen.has(key)) return; seen.add(key);
      const r = S.applyOps(c, ops); if (!r.done.length) return;   // it must really apply, by the same checks as any helper's steps
      out.push({ id: 'sg' + hash(`${kind}|${src.id}|${key}`), kind, title, before: one(before, 160), after: one(after, 160), ops, target: target || null, does: r.done, source: { id: src.id, kind: src.kind, who: src.who || '', at: src.at || '', title: src.title || '', text: one(src.text, 220), link: src.link || '', decided: !!src.decided }, score: (WEIGHT[src.kind] || 1) + (src.decided ? 2 : 0) + (Date.parse(src.at) || 0) / 1e14 });
    };
    const list = (sources || []).filter(s => s && s.text).slice(-400);
    for (const src of list) {
      const text = String(src.text), full = `${src.title || ''}. ${text}`;
      for (const sent of sentences(full)) {
        let m;
        // 1. when we open: "we open Saturday at 9 now" -> the line on the site that says when
        if (OPEN_W.test(sent) && !PAST_W.test(sent) && /\d/.test(sent)) {
          const w = S.whenOf(sent.replace(/^.*?\b(?:open(?:s|ing)?|doors)\b/i, ' '));
          if (w.time || w.day) for (const o of S.openTimes(c)) { const next = S.retime(o.text, w); if (next) { push(src, 'time', 'Update when you open', o.text, next, [{ op: 'text', block: o.block, path: o.path, value: next }], { page: o.page, block: o.block, path: o.path }); break; } }
        }
        // 2. a section someone asked for that the site does not have
        if (ADD_W.test(sent) && (SITE_W.test(sent) || src.kind === 'comment' || /\b(?:section|form)\b/i.test(sent))) for (const [rx, type, label] of WANT) { if (rx.test(sent) && !hasType(type)) { push(src, 'add', `Add ${label}`, 'Not on the site yet', `${label.replace(/^./, ch => ch.toUpperCase())} on ${c.pages[0].title}`, [{ op: 'add', type, page: c.pages[0].id }], null); break; } }
        // 3. a new headline or tagline
        if ((m = /\b(?:new\s+|our\s+|the\s+)?(headline|tagline|slogan|motto|strapline)\s*(?:is now|is|should be|should say|will be|to|:|=|-)\s*["“']?([^"”\n]{4,120}?)["”']?[.!]?$/i.exec(sent))) {
          const h = hero(); if (h) { const head = /headline/i.test(m[1]), path = h.b.type === 'links' ? 'bio' : head ? 'title' : 'text', old = h.b.props[path], val = m[2].trim(); if (typeof old === 'string' && old.trim().toLowerCase() !== val.toLowerCase()) push(src, 'words', head ? 'Use the new headline' : 'Use the new tagline', old, val, [{ op: 'text', block: h.b.id, path, value: val }], { page: h.pg.id, block: h.b.id, path }); }
        }
        // 4. a new name
        if ((m = /\b(?:rename (?:it|the (?:site|website|shop|project|band|studio))\s+to|(?:let'?s|we(?:'ll| will)?|we should)\s+call (?:it|ourselves|the (?:site|shop|project))|we(?:'re| are) now called|the new name is|our name is now)\s+["“']?([A-Z0-9][^"”.!?\n]{1,40}?)["”']?(?:[.!?]|$|\s+(?:from|now|instead)\b)/.exec(sent)) && (src.decided || src.kind !== 'chat' || /\b(?:decided|agreed|final|official)\b/i.test(full))) { const val = m[1].trim(); if (val.toLowerCase() !== c.name.toLowerCase()) push(src, 'name', 'Rename the site', c.name, val, [{ op: 'name', value: val }], { page: c.pages[0].id, block: '@', path: 'name' }); }
        // 5. the main colour
        if ((m = /\b(?:use|make|go with|switch to|change|pick|picked|chose|choose)\b.*?\b(teal|blue|green|red|orange|yellow|purple|pink|black|navy|brown|gold|#[0-9a-f]{6})\b/i.exec(sent)) && /\b(?:main|accent|brand|primary|theme|buttons?|site|website)\b/i.test(sent) && /\bcolou?r|buttons?\b/i.test(sent)) { const hex = /^#/.test(m[1]) ? m[1].toUpperCase() : COLORS[m[1].toLowerCase()], cur = S.colors(c).accent; if (hex && S.colors(S.setColor(c, hex)).accent.toLowerCase() !== cur.toLowerCase()) push(src, 'colour', `Make ${m[1].toLowerCase()} the main colour`, cur, hex, [{ op: 'accent', color: hex }], null); }
        // 6. a new contact email
        if ((m = EMAIL.exec(sent)) && /\b(?:email|contact|reach|write|send|enquir|inquir|bookings?)\b/i.test(sent) && (/\b(?:new|now|changed?|use|instead|from now)\b/i.test(sent) || src.decided)) { const em = m[1]; for (const pg of c.pages) for (const b of pg.blocks) { if (b.type === 'contact' && b.props.email && b.props.email.toLowerCase() !== em.toLowerCase()) push(src, 'email', 'Use the new email address', b.props.email, em, [{ op: 'text', block: b.id, path: 'email', value: em }], { page: pg.id, block: b.id, path: 'email' }); } S.walkWords(c, (pg, b, path, v) => { const o = EMAIL.exec(v); if (o && o[1].toLowerCase() !== em.toLowerCase() && v.length < 200) push(src, 'email', 'Use the new email address', v, v.replace(o[1], em), [{ op: 'text', block: b.id, path, value: v.replace(o[1], em) }], { page: pg.id, block: b.id, path }); }); }
        // 7. "change “X” to “Y”" where the site says X
        if ((m = /\b(?:change|replace|update|fix|swap)\s+["“]([^"”]{2,120})["”]\s+(?:to|with|into|for)\s+["“]([^"”]{1,160})["”]/i.exec(sent)) || (m = /["“]([^"”]{2,120})["”]\s+should (?:say|be|read)\s+["“]([^"”]{1,160})["”]/i.exec(sent))) { const from = m[1].trim(), to = m[2].trim(); let done = false; S.walkWords(c, (pg, b, path, v) => { if (done) return; const i = v.toLowerCase().indexOf(from.toLowerCase()); if (i < 0) return; done = true; const next = v.slice(0, i) + to + v.slice(i + from.length); push(src, 'words', 'Change the words', v, next, [{ op: 'text', block: b.id, path, value: next }], { page: pg.id, block: b.id, path }); }); }
      }
      // a comment pinned to a section that says exactly what to do with its words: "should say …"
      if (src.kind === 'comment' && src.block) { const at = blockAt(src.block), m = /\b(?:should (?:say|read|be)|change (?:it|this|the (?:title|heading|headline)) to|make (?:it|this) say)\s+["“']?([^"”\n]{2,120}?)["”']?[.!]?$/i.exec(text); if (at && m && typeof at.b.props.title === 'string') { const val = m[1].trim(); if (val.toLowerCase() !== at.b.props.title.trim().toLowerCase()) push(src, 'words', 'Change the heading as the comment says', at.b.props.title, val, [{ op: 'text', block: at.b.id, path: 'title', value: val }], { page: at.pg.id, block: at.b.id, path: 'title' }); } }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 12).map(({ score, ...x }) => x);
  }

  // ---------- what the tribe said about one element ----------
  const STOP = new Set('the and for with that this from your you our are was were have has had not but all any can will just about into over more most some than then them they their there here what when where which who how why its it is of to in on at as by or an be we us if so do no up out one new get got make made'.split(' '));
  const stem = w => w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w.replace(/s$/, '');
  const toks = t => String(t || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(stem);
  // what a line is about, beyond its exact words: when it opens, what it costs, how to reach us
  const TOPICS = [/\b(?:open(?:s|ing)?|hours?|doors|clos(?:e|es|ed|ing))\b/i, /[$€£]\s?\d|\b(?:price|prices|pricing|cost|costs|per month|free)\b/i, /\b(?:email|contact|phone|call us|reach us)\b|@[\w-]+\./i];
  const TYPE_W = { pricing: ['price', 'prices', 'pricing', 'plan', 'plans', 'cost'], contact: ['contact', 'form', 'email', 'message'], faq: ['faq', 'question', 'questions'], gallery: ['gallery', 'photos', 'pictures'], hero: ['headline', 'hero', 'tagline', 'top'], testimonials: ['testimonial', 'testimonials', 'review', 'reviews', 'quote'], team: ['team', 'members'], info: ['hours', 'address', 'open', 'opening', 'directions'], links: ['links', 'link', 'bio'], footer: ['footer', 'copyright'], newsletter: ['newsletter', 'signup', 'subscribe'], embed: ['video', 'trailer'], list: ['menu', 'dates', 'episodes', 'list'], features: ['features', 'feature'], stats: ['stats', 'numbers'], cta: ['button', 'cta'], text: ['story', 'about'], steps: ['steps'], timeline: ['timeline', 'history'], logos: ['logos', 'press'], banner: ['banner', 'announcement'], image: ['picture', 'image', 'photo'] };
  function related(cfg, sel, sources, S) {
    const c = S.normalize(JSON.parse(JSON.stringify(cfg))); if (!sel || !sel.block || sel.block === '@') return [];
    let b = null; for (const pg of c.pages) { const x = pg.blocks.find(y => y.id === sel.block); if (x) b = x; } if (!b) return [];
    const path = String(sel.path || '').replace(/\.$/, ''), own = sel.kind && sel.kind !== 'block' ? S.getAt(b.props, sel.kind === 'button' ? path + '.label' : path) : null;
    const words = typeof own === 'string' ? own : own && typeof own === 'object' ? Object.values(own).filter(x => typeof x === 'string' && !/^data:/.test(x)).join(' ') : `${b.props.title || ''} ${b.props.name || ''}`;
    const mine = new Set(toks(words)), typeW = new Set(TYPE_W[b.type] || []), phrase = one(words, 60).toLowerCase();
    const out = [];
    for (const s of sources || []) {
      if (!s || !s.text) continue; const t = `${s.title || ''} ${s.text}`, tl = t.toLowerCase(), tk = toks(t);
      let score = 0; if (s.kind === 'comment' && s.block === b.id) score += 6;
      if (phrase.length >= 6 && tl.includes(phrase)) score += 5;
      const hit = tk.filter(w => mine.has(w)); score += Math.min(4, new Set(hit).size) * 1.2;
      if (TOPICS.some(rx => rx.test(words) && rx.test(t))) score += 2.5;
      if (SITE_W.test(t) && tk.some(w => typeW.has(w))) score += 2.5;
      if (new Set(hit).size < 2 && score < 2.5) continue;
      if (score >= 2.4) out.push({ id: s.id, kind: s.kind, who: s.who || '', at: s.at || '', title: s.title || '', text: one(s.text, 180), link: s.link || '', decided: !!s.decided, score: score + (WEIGHT[s.kind] || 1) / 10 });
    }
    return out.sort((a, b2) => b2.score - a.score || String(b2.at).localeCompare(String(a.at))).slice(0, 5).map(({ score, ...x }) => x);
  }
  return { suggest, related, version: 1 };
});
