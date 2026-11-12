// Local document smarts (feat/flint-runthrough): small, dependency-free features that read any text with no model at
// all, in the browser and on the server. Same pattern as aibasics-core.js (docs/DESIGN-SYSTEM.md §11): the answer comes
// from rules first ("Basic · no AI"); with the tribe's AI on, server/aibasics.js refines it in the same shape.
// Shared: window.TribeLocalDoc in the browser, require() on the server and in tests.
//   extract(name, data, inflate?) -> Promise<text>     txt / md / html / pdf (text layer; inflate = zlib for FlateDecode)
//   plain(md)                     -> text without Markdown or HTML markup
//   summarize(text, { max })      -> { sentences, text, words }          extractive: TextRank-lite (sentence graph + PageRank)
//   keyPoints(text, ctx)          -> { points, actions }                 top sentences + to-dos (checkboxes, "we should…")
//   titles(text)                  -> [3 title ideas]
//   tags(text)                    -> [up to 6 tags]
//   reading(text)                 -> { words, minutes, label, outline }
//   glossary(text)                -> [{ term, def, from: 'doc' | 'basics' }]   "explain like I'm new"
//   run(kind, text)               -> the basic answer for an ✦ kind (doc.summary, doc.points, doc.title, doc.tags, doc.read, doc.glossary)
//   format(kind, r)               -> the same answer as Markdown lines (Flint's chat, exports)
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeLocalDoc = api; })(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const core = () => (typeof module === 'object' && module.exports ? require('./aibasics-core.js') : root && root.TribeAICore);
  const STOP = new Set(('a an the to of in on at for and or is are be been was were do does did i me my we our you your it its this that these those with ' +
    'get got use used using just so but if then than there here what when where why how who can could should would will shall may might must not no yes ok ' +
    'also too very really like about into from up down out over all any some more most much many one two three have has had it\'s that\'s let\'s ' +
    'dont don\'t need needs want make made think know see go going been being still now each every other such only own same them they their his her him she he ' +
    'which while because before after again further once both few nor off per via etc eg ie e.g i.e lot lots thing things way well even back new first last next').split(' '));
  const cap = s => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
  const stem = w => (w.length > 4 ? w.replace(/(ations?|ings?|ments?|ness|edly|ed|es|s)$/, '') : w.length > 3 ? w.replace(/s$/, '') : w);
  const toks = s => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' -]+/gu, ' ').split(/[\s-]+/).map(w => w.replace(/^'+|'+$/g, '')).filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  const title = s => String(s || '').replace(/\b([a-z])([\w'-]*)/g, (m, a, b, i) => (i > 0 && /^(a|an|the|and|or|of|in|on|for|to|with|at|by)$/.test(m) ? m : a.toUpperCase() + b));

  // ---------- markup -> plain text ----------
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©' };
  function htmlText(h) {
    return String(h || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, t, x) => `\n\n${'#'.repeat(+t[1])} ${x.replace(/<[^>]+>/g, ' ').trim()}\n\n`)
      .replace(/<li\b[^>]*>/gi, '\n- ').replace(/<(br|hr)\b[^>]*>/gi, '\n').replace(/<\/(p|div|section|article|header|footer|li|tr|h\d|blockquote|pre|ul|ol|table|main|nav)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ').replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m))
      .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function plain(md) {
    let t = String(md || '').replace(/\r\n?/g, '\n');
    if (/<\/?(p|div|h[1-6]|li|body|html|span|section)\b/i.test(t)) t = htmlText(t);
    return t.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]+)`/g, '$1').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s*>\s?/gm, '').replace(/^\s*\|?[-:| ]+\|[-:| ]*$/gm, '').replace(/\|/g, ' ')
      .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~\n]+?)\1/g, '$2').replace(/[ \t]+/g, ' ').trim();
  }
  const isHeading = l => /^#{1,6}\s/.test(l);
  // sentences with their paragraph index, from Markdown (headings and list items are their own units)
  function units(md) {
    const out = []; let para = 0;
    for (const block of plain(md).split(/\n\s*\n/)) {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean); if (!lines.length) continue;
      for (const l of lines) {
        if (/^[✦⚠]/.test(l)) continue;   // banners ("✦ Flint draft · …") are not content
        if (isHeading(l)) { out.push({ s: l.replace(/^#+\s*/, ''), para, head: true }); continue; }
        const li = /^(?:[-*•+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.*)$/.exec(l);
        const body = li ? li[1] : l;
        for (const s of body.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“(])/u)) { const x = s.trim(); if (x) out.push({ s: x, para, item: !!li }); }
      }
      para++;
    }
    return out;
  }
  const wordCount = t => (String(plain(t)).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

  // ---------- PDF text layer (no dependencies; covers the plain PDFs most tools write) ----------
  const latin = b => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; };
  function pdfStrings(content) {
    const out = []; let line = '';
    const push = () => { if (line.trim()) out.push(line.replace(/\s+/g, ' ').trim()); line = ''; };
    const unesc = s => s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (m, e) => ({ n: '\n', r: '', t: ' ', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[e] ?? (/^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : '')));
    const hex = h => { h = h.replace(/\s+/g, ''); if (h.length % 2) h += '0'; let s = ''; const two = h.length >= 4 && /^(00|fe|ff)/i.test(h); for (let i = 0; i < h.length; i += two ? 4 : 2) s += String.fromCharCode(parseInt(h.substr(i, two ? 4 : 2), 16)); return s.replace(/[\x00-\x08﻿]/g, ''); };
    const rx = /\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]+>|\[|\]|-?\d*\.?\d+|\/[^\s/[\]()<>]+|[A-Za-z'"*]+/g;
    let m, arr = null, prev = [];
    while ((m = rx.exec(content))) {
      const tk = m[0];
      if (tk[0] === '(') { const s = unesc(tk.slice(1, -1)); if (arr) arr.push(s); else prev.push(s); continue; }
      if (tk[0] === '<') { const s = hex(tk.slice(1, -1)); if (arr) arr.push(s); else prev.push(s); continue; }
      if (tk === '[') { arr = []; continue; }
      if (tk === ']') { prev.push(arr ? arr.join('') : ''); arr = null; continue; }
      if (arr && /^-?\d*\.?\d+$/.test(tk)) { if (+tk < -180) arr.push(' '); continue; }
      if (tk === 'Tj' || tk === 'TJ') { line += prev.join(''); prev = []; continue; }
      if (tk === "'" || tk === '"') { push(); line += prev.join(''); prev = []; continue; }
      if (tk === 'Td' || tk === 'TD' || tk === 'T*' || tk === 'Tm') { if (tk === 'Tm' || tk === 'T*' || line.length > 0) push(); prev = []; continue; }
      if (tk === 'ET') { push(); prev = []; continue; }
      if (/^[A-Za-z]/.test(tk)) prev = [];
    }
    push();
    return out;
  }
  async function pdfText(bytes, inflate) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), s = latin(b), lines = [];
    const rx = /<<([\s\S]{0,600}?)>>\s*stream\r?\n/g; let m;
    while ((m = rx.exec(s))) {
      const dict = m[1], start = m.index + m[0].length, end = s.indexOf('endstream', start); if (end < 0) break;
      if (/\/Subtype\s*\/(Image|Type1C|CIDFontType0C|OpenType)|\/Length1|\/FontFile/.test(dict)) { rx.lastIndex = end; continue; }
      let data = b.subarray(start, end);
      if (/\/FlateDecode/.test(dict)) { if (!inflate) { rx.lastIndex = end; continue; } try { data = await inflate(data); } catch { rx.lastIndex = end; continue; } }
      else if (/\/Filter/.test(dict)) { rx.lastIndex = end; continue; }
      const txt = latin(data instanceof Uint8Array ? data : new Uint8Array(data));
      if (/\bBT\b/.test(txt)) lines.push(...pdfStrings(txt));
      rx.lastIndex = end;
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  async function extract(name, data, inflate) {
    const n = String(name || '').toLowerCase(), ext = (/\.([a-z0-9]+)$/.exec(n) || [, ''])[1];
    if (ext === 'pdf') return pdfText(typeof data === 'string' ? new Uint8Array([...data].map(c => c.charCodeAt(0) & 255)) : data, inflate);
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    if (/^(html?|xhtml|svg)$/.test(ext) || /^\s*<(!doctype|html)\b/i.test(text)) return htmlText(text);
    if (ext === 'json') { try { return JSON.stringify(JSON.parse(text), null, 1).replace(/[{}[\]",]/g, ' ').replace(/[ \t]+/g, ' '); } catch { return text; } }
    return text;
  }

  // ---------- keyphrases (word and two-word phrases, TF with a position bonus) ----------
  function phrases(md, n = 8) {
    const f = new Map(), show = new Map(), us = units(md);
    us.forEach((u, i) => {
      const w = toks(u.s), boost = u.head ? 2.2 : i < 3 ? 1.4 : 1;
      w.forEach((x, j) => {
        const k = stem(x); f.set(k, (f.get(k) || 0) + boost); if (!show.has(k)) show.set(k, x);
        if (j + 1 < w.length) { const y = w[j + 1], kk = k + ' ' + stem(y); f.set(kk, (f.get(kk) || 0) + boost * 1.15); if (!show.has(kk)) show.set(kk, x + ' ' + y); }
      });
    });
    const bi = [...f.entries()].filter(([k, c]) => k.includes(' ') && c >= 2.2);
    const uni = [...f.entries()].filter(([k]) => !k.includes(' '));
    const all = [...bi.map(([k, c]) => [k, c * 1.3]), ...uni].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const out = [];
    for (const [k] of all) { if (out.some(o => o.k.split(' ').some(p => k.split(' ').includes(p)))) continue; out.push({ k, w: show.get(k) }); if (out.length >= n) break; }
    return out.map(o => o.w);
  }

  // ---------- summarize: TextRank-lite ----------
  function summarize(md, opt = {}) {
    const us = units(md).filter(u => !u.head && toks(u.s).length >= 3), words = wordCount(md);
    if (!us.length) { const t = clip(plain(md), 200); return { sentences: t ? [t] : [], text: t || 'Nothing to sum up yet: it is empty.', words }; }
    const max = Math.max(1, Math.min(opt.max || 5, us.length <= 3 ? us.length : Math.max(2, Math.round(us.length * 0.25))));
    const sets = us.map(u => new Set(toks(u.s).map(stem)));
    const heads = new Set(units(md).filter(u => u.head).flatMap(u => toks(u.s).map(stem)));
    const N = us.length, W = Array.from({ length: N }, () => new Float64Array(N));
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let c = 0; for (const w of sets[i]) if (sets[j].has(w)) c++;
      if (c) { const v = c / (Math.log(sets[i].size + 1) + Math.log(sets[j].size + 1)); W[i][j] = W[j][i] = v; }
    }
    const out = W.map(r => r.reduce((a, b) => a + b, 0));
    let pr = new Float64Array(N).fill(1 / N);
    for (let it = 0; it < 30; it++) { const nx = new Float64Array(N).fill(0.15 / N); for (let i = 0; i < N; i++) { if (!out[i]) continue; for (let j = 0; j < N; j++) if (W[i][j]) nx[j] += 0.85 * pr[i] * W[i][j] / out[i]; } pr = nx; }
    const score = us.map((u, i) => {
      const len = toks(u.s).length, head = [...sets[i]].filter(w => heads.has(w)).length;
      return pr[i] * (1 + (i === 0 ? 0.35 : i < 3 ? 0.15 : 0) + Math.min(head, 3) * 0.12 + (/\b(decided|goal|so that|because|important|key|must|we will|in short|summary|means)\b/i.test(u.s) ? 0.2 : 0)) * (len < 6 ? 0.6 : len > 45 ? 0.75 : 1);
    });
    const order = us.map((u, i) => i).sort((a, b) => score[b] - score[a]), pick = [];
    for (const i of order) { if (pick.length >= max) break; if (pick.some(j => { let c = 0; for (const w of sets[i]) if (sets[j].has(w)) c++; return c / Math.min(sets[i].size, sets[j].size) > 0.7; })) continue; pick.push(i); }
    const sentences = pick.sort((a, b) => a - b).map(i => clip(cap(us[i].s.replace(/[:;,]$/, '.')), 240));
    return { sentences, text: sentences.join(' '), words };
  }

  // ---------- key points and action items ----------
  const ACTION = /^(?:todo|to do|to-do|action|next)\s*[:\-–]\s*(.+)$/i;
  function keyPoints(md, ctx = {}) {
    const points = summarize(md, { max: 6 }).sentences, actions = [], seen = new Set();
    const add = (t, extra = {}) => { const k = toks(t).map(stem).join(' '); if (!k || seen.has(k)) return; seen.add(k); actions.push({ title: cap(clip(t.replace(/[.!]+$/, ''), 100)), ...extra }); };
    for (const l of String(md || '').split('\n')) { const m = /^\s*[-*]\s+\[ \]\s+(.+)$/.exec(l) || ACTION.exec(l.trim()); if (m) add(m[1].trim()); }
    const C = core();
    if (C && C.toTasks) for (const t of C.toTasks(units(md).filter(u => !u.head).map(u => ({ who: 'doc', text: u.s.replace(/(\S)\s+lets\s+/gi, '$1 allows ') })), { members: ctx.members || [], now: ctx.now })) add(t.title, { ...(t.assignee ? { assignee: t.assignee } : {}), ...(t.due ? { due: t.due } : {}) });
    return { points, actions: actions.slice(0, 10) };
  }

  // ---------- title and tag ideas ----------
  function titles(md) {
    const out = [], add = t => { t = clip(String(t || '').replace(/[.:;,!?]+$/, '').trim(), 70); if (t && !out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t); };
    const ph = phrases(md, 4), us = units(md), h1 = us.find(u => u.head);
    const kind = /\b(standup|meeting|agenda|minutes|retro)\b/i.test(md) ? 'Notes' : /\b(plan|roadmap|milestone|launch)\b/i.test(md) ? 'Plan' : /\b(how to|step|install|setup|set up)\b/i.test(md) ? 'Guide' : /\b(should|proposal|propose|option)\b/i.test(md) ? 'Proposal' : 'Notes';
    if (ph[0] && ph[1]) add(`${title(ph[0])}: ${kind === 'Notes' ? title(ph[1]) : `the ${kind.toLowerCase()}`}`);
    if (ph[0]) add(`${title(ph[0])} ${kind}`);
    const s = summarize(md, { max: 1 }).sentences[0];
    if (s) add(title(s.split(/\s+/).slice(0, 7).join(' ').replace(/[,;:]$/, '')));
    if (h1) add(h1.s);
    if (ph[0] && ph[1]) add(`${title(ph[0])} and ${title(ph[1])}`);
    if (!out.length) add('Untitled notes');
    return out.slice(0, 3);
  }
  const KIND_TAGS = [[/\b(standup|meeting|agenda|minutes|retro)\b/i, 'meeting-notes'], [/\b(plan|roadmap|milestone)\b/i, 'plan'], [/\b(launch|release|ship)\b/i, 'launch'], [/\b(design|mockup|logo|palette|font)\b/i, 'design'],
    [/\b(bug|crash|fix|error)\b/i, 'bugs'], [/\b(game|level|sprite|player)\b/i, 'game'], [/\b(website|landing page|site)\b/i, 'website'], [/\b(budget|price|cost|revenue)\b/i, 'money'], [/\b(how to|install|set up|setup)\b/i, 'how-to'], [/\b(research|compare|option)\b/i, 'research']];
  function tags(md) {
    const t = plain(md), out = [];
    for (const p of phrases(md, 8)) { const k = p.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''); if (k && k.length <= 24 && !out.includes(k)) out.push(k); if (out.length >= 4) break; }
    for (const [rx, k] of KIND_TAGS) if (rx.test(t) && !out.includes(k) && out.length < 6) out.push(k);
    return out.slice(0, 6);
  }

  // ---------- reading time and outline ----------
  function reading(md) {
    const words = wordCount(md), minutes = Math.max(1, Math.round(words / 238)), C = core();
    const outline = C && C.outline ? C.outline(String(md || '')) : units(md).filter(u => u.head).map(u => `- ${u.s}`).join('\n');
    return { words, minutes, label: words < 120 ? 'under a minute' : `about ${minutes} min`, outline };
  }

  // ---------- "explain like I'm new": a glossary of the terms the text uses ----------
  const BASICS = {
    api: 'A way for one program to ask another for data or actions, like a menu of requests it accepts.', mcp: 'Model Context Protocol: a standard plug that lets an AI helper use a tool or app safely.',
    llm: 'Large language model: an AI that reads and writes text by predicting the next words.', ai: 'Artificial intelligence: software that does tasks that usually need a person, like writing or recognizing pictures.',
    repo: 'Repository: the folder that holds a project\'s code and its full history of changes.', repository: 'The folder that holds a project\'s code and its full history of changes.',
    git: 'The tool that records every change to code, so you can see who changed what and go back.', commit: 'One saved change in the code\'s history, with a short note about what changed.',
    branch: 'A separate line of work in the code, so changes can be tried without touching the main version.', merge: 'Combining the changes from one branch into another.',
    'pull request': 'A request to merge your changes, where teammates can review them first.', deploy: 'Putting a new version where people can use it, like a website going live.',
    frontend: 'The part of an app people see and click.', backend: 'The part of an app that runs on a server: data, accounts, the rules behind the screens.',
    server: 'A computer program that waits for requests and answers them, for example by sending a web page.', host: 'The computer that runs the shared server for everyone else.',
    pwa: 'Progressive web app: a website you can install like an app, that also works offline.', cli: 'Command-line interface: a program you use by typing commands in a terminal.',
    json: 'A plain-text format for structured data, with names and values in curly braces.', markdown: 'A simple way to format text with symbols, like # for a heading and - for a list.',
    html: 'The language web pages are written in: it says what is a heading, a paragraph, a button.', css: 'The language that styles web pages: colors, fonts, spacing, layout.',
    javascript: 'The programming language that makes web pages interactive.', js: 'JavaScript, the programming language that makes web pages interactive.',
    sdk: 'Software development kit: ready-made code and tools for building on a platform.', oauth: 'A standard way to sign in with another account (like Google or GitHub) without sharing your password.',
    ui: 'User interface: the screens, buttons and text people use.', ux: 'User experience: how easy and pleasant something is to use.',
    mvp: 'Minimum viable product: the smallest version that is still useful, made to learn fast.', kpi: 'Key performance indicator: a number you watch to know if things are going well.',
    roi: 'Return on investment: what you get back compared with what you put in.', ci: 'Continuous integration: tests that run automatically on every change.',
    qa: 'Quality assurance: checking that things work before people use them.', sprint: 'A short, fixed stretch of work (often one or two weeks) with a clear goal.',
    backlog: 'The list of things the team may do later, in rough order.', standup: 'A short daily check-in: what I did, what I\'ll do, what\'s blocking me.',
    milestone: 'A named point in a project, like a version, that marks real progress.', roadmap: 'A plan of what gets built, in order, over the next weeks or months.',
    wireframe: 'A plain sketch of a screen\'s layout, without colors or final words.', mockup: 'A picture of how a screen will look, before it is built.',
    prototype: 'An early, rough version made to try an idea.', sprite: 'A small picture in a game, often a character, drawn in frames for animation.',
    tileset: 'A picture made of small square tiles a game uses to draw its levels.', shader: 'A tiny program the graphics card runs to color pixels or move shapes.',
    render: 'Turning a scene or a page into the final picture you see.', latency: 'The delay between asking for something and getting it.',
    cache: 'A saved copy kept close by so the next time is faster.', database: 'An organized store of data that programs can search and update.',
    endpoint: 'One address on a server that answers one kind of request.', webhook: 'A message one app sends to another automatically when something happens.',
    'open source': 'Code anyone can read, use and change, under its license.', license: 'The rules for how others may use, change and share a work.',
    github: 'A website that stores git repositories and helps teams review and share code.', docker: 'A tool that packs an app with everything it needs so it runs the same anywhere.',
    container: 'A packaged app with everything it needs, isolated from the rest of the computer.', cloud: 'Computers in a data center you rent or use over the internet.',
    dns: 'The internet\'s address book: it turns names like example.com into machine addresses.', domain: 'A website\'s name, like example.com.',
    seo: 'Search engine optimization: making a page easy for search engines to find and rank.', cta: 'Call to action: the button or line that asks people to do the next thing.',
    'landing page': 'A single web page made to explain one thing and ask for one action.', beta: 'An early version shared for testing before the full release.',
    changelog: 'A list of what changed in each version.', refactor: 'Reorganizing code without changing what it does, to make it easier to work on.',
    bug: 'A mistake in software that makes it do the wrong thing.', token: 'A small piece of text a language model reads, or a secret key that proves who you are.',
    prompt: 'The instruction or question you give an AI model.', agent: 'An AI helper that can take steps on its own, like editing files or running tools.',
    webgpu: 'A modern browser feature that lets web pages use the graphics card, for games or running AI models.', ollama: 'A free app that runs open AI models on your own computer.',
    tunnel: 'A secure link that makes a computer at home reachable from the internet.', vision: 'The short statement of what the project is and why it matters.',
    textrank: 'A method that picks a text\'s most central sentences by seeing which ones share the most words with the others.', zip: 'One file that packs many files and folders together.',
    svg: 'A picture format made of shapes instead of pixels, so it stays sharp at any size.', png: 'A picture format made of pixels that keeps every detail (no blur from compression).',
    blender: 'A free, open-source app for 3D modeling, animation and rendering.', python: 'A popular, readable programming language, also used to script apps like Blender.',
  };
  const ACR = new Set('api mcp llm ai pwa cli json html css js sdk ui ux mvp kpi roi ci qa dns seo cta svg png zip'.split(' '));
  function glossary(md) {
    const t = plain(md), low = ' ' + t.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ') + ' ', out = [], have = new Set();
    const add = (term, def, from) => { const k = term.toLowerCase(); if (have.has(k) || !def) return; have.add(k); out.push({ term, def: clip(cap(def), 220), from }); };
    // the text's own definitions: "Model Context Protocol (MCP)", "Flint is the built-in helper …", "MCP: a standard …"
    for (const m of t.matchAll(/\b((?:[A-Z][\w-]+\s){1,5}[A-Z][\w-]+)\s+\(([A-Z][A-Za-z0-9]{1,8})\)/g)) add(m[2], m[1], 'doc');
    for (const m of t.matchAll(/(?:^|[.!?\n]\s*)(?:An?\s+|The\s+)?([A-Z][\w-]+(?:\s[A-Z][\w-]+){0,2}|[A-Z]{2,8})\s+(?:is|are|means|stands for|refers to)\s+((?:a|an|the|our|when|how|what|where)\b[^.!?\n]{8,180})/g)) if (!/^(This|That|It|There|Here|What|Who|He|She|We|They|I)$/.test(m[1])) add(m[1], m[2], 'doc');
    for (const m of t.matchAll(/^\s*(?:[-*]\s+)?\**([A-Z][\w -]{1,30}?)\**\s*[:—–]\s+([^\n]{10,200})$/gm)) if (m[1].split(' ').length <= 4 && !/^(Note|Notes|Tip|Goal|Why|Date|Owner|Status|Next|Todo|Done)$/i.test(m[1])) add(m[1].trim(), m[2], 'doc');
    for (const [k, v] of Object.entries(BASICS)) if (low.includes(' ' + k + ' ') || (k.length > 3 && low.includes(' ' + k + 's '))) add(ACR.has(k) ? k.toUpperCase() : k.replace(/^\w/, c => c.toUpperCase()), v, 'basics');
    // what else looks like jargon: ALL-CAPS words the text uses more than once, with no definition yet
    const caps = new Map(); for (const m of t.matchAll(/\b([A-Z]{2,6})s?\b/g)) caps.set(m[1], (caps.get(m[1]) || 0) + 1);
    for (const [k, n] of caps) if (n > 1 && !have.has(k.toLowerCase()) && out.length < 14) add(k, 'An abbreviation this text uses; it does not say what it stands for (ask the author or your AI).', 'unknown');
    return out.slice(0, 14);
  }

  // ---------- one entry point per ✦ kind, and Markdown for Flint ----------
  function run(kind, text, ctx) {
    if (kind === 'doc.summary') return summarize(text);
    if (kind === 'doc.points') return keyPoints(text, ctx);
    if (kind === 'doc.title') return titles(text);
    if (kind === 'doc.tags') return tags(text);
    if (kind === 'doc.read') return reading(text);
    if (kind === 'doc.glossary') return glossary(text);
    return null;
  }
  function format(kind, r) {
    if (!r) return '';
    if (kind === 'doc.summary') return r.sentences.length ? r.sentences.map(s => `- ${s}`).join('\n') : r.text;
    if (kind === 'doc.points') return `**Key points**\n${r.points.map(s => `- ${s}`).join('\n') || '- (nothing stands out yet)'}\n\n**Action items**\n${r.actions.map(a => `- [ ] ${a.title}${a.due ? ` (by ${a.due})` : ''}`).join('\n') || '- (no to-dos found)'}`;
    if (kind === 'doc.title') return r.map((t, i) => `${i + 1}. ${t}`).join('\n');
    if (kind === 'doc.tags') return r.map(t => `#${t}`).join(' ');
    if (kind === 'doc.read') return `**${r.label}** to read (${r.words} words)\n\n${r.outline}`;
    if (kind === 'doc.glossary') return r.length ? r.map(g => `- **${g.term}**: ${g.def}`).join('\n') : 'No special terms: it reads plainly already.';
    return String(r);
  }
  // reading a model's refined answer back into the same shape
  function parse(kind, text) {
    const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(); if (!t) return null;
    const bullets = s => s.split('\n').map(l => /^\s*(?:[-*•]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/.exec(l)).filter(Boolean).map(m => m[1].replace(/\*\*/g, '').trim()).filter(Boolean);
    if (kind === 'doc.summary') { const b = bullets(t); const s = b.length ? b : t.split(/(?<=[.!?])\s+/).filter(Boolean); return { sentences: s.slice(0, 6), text: s.join(' '), words: 0 }; }
    if (kind === 'doc.points') { const [a, b = ''] = t.split(/^\s*\**action items?\**\s*:?\s*$/im); const p = bullets(a.replace(/^\s*\**key points\**\s*:?\s*$/im, '')); return p.length ? { points: p.slice(0, 8), actions: bullets(b).slice(0, 10).map(x => ({ title: x })) } : null; }
    if (kind === 'doc.title') { const b = bullets(t); return (b.length ? b : t.split('\n')).map(x => x.replace(/^["“]|["”]$/g, '').trim()).filter(Boolean).slice(0, 3); }
    if (kind === 'doc.tags') return t.split(/[,\n#]+/).map(x => x.trim().toLowerCase().replace(/^[-*\d.)\s]+/, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')).filter(x => x && x.length <= 24).slice(0, 6);
    if (kind === 'doc.read') return { outline: bullets(t).length ? t : null };
    if (kind === 'doc.glossary') { const g = t.split('\n').map(l => /^\s*(?:[-*•]\s*)?\**([^:*]{1,40})\**\s*[:—–-]\s+(.{6,})$/.exec(l)).filter(Boolean).map(m => ({ term: m[1].trim(), def: m[2].trim(), from: 'ai' })); return g.length ? g.slice(0, 14) : null; }
    return t;
  }

  return { extract, pdfText, htmlText, plain, units, summarize, keyPoints, titles, tags, reading, glossary, phrases, run, format, parse, wordCount, BASICS };
});
