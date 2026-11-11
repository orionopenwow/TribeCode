// "Basic features, supercharged by AI" (docs/DESIGN-SYSTEM.md §11): the deterministic half. Every ✦ in the app
// (app/ui/aibasics.js) computes its answer here first, with no model, in the browser or on the server. With an AI on
// (the tribe's brain, server/aibasics.js → server/llm.js) the same answer is then refined in place.
// Shared like flintnlu.js: window.TribeAICore in the browser, require() on the server and in tests.
//   summarize(msgs)              chat lines -> { lines, text, people, topics, decided, questions }
//   toTasks(msgs, ctx)           chat lines -> [{ title, assignee?, due?, from }]
//   splitTask(task)              -> [step titles]
//   estimate(task)               -> { size: 'S'|'M'|'L'|'XL', hours, why }
//   suggestOwner(task, ctx)      -> { id, name, why } | null      ctx = { members, tasks, me }
//   tidy(md) / outline(md) / continueDoc(md, title)
//   describeFile(f)              -> { description, tags }          f = { name, kind?, type?, size?, w?, h? }
//   planDay(ctx)                 -> { items: [{ t, why, kind, ref? }], text }
//   seatCharter(seat, project)   -> { goal, owns, mayDo, needsApproval, done }
//   parse(kind, text)            reads a model's refined answer back into the same shape (lines, label: value)
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeAICore = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const STOP = new Set(('a an the to of in on at for and or is are be been was were do does did i me my we our you your it its this that these those with ' +
    'get got use just so but if then than there here what when where why how who can could should would will shall may might must not no yes ok okay ' +
    'lol yeah yep hey hi hello thanks thank also too very really like about into from up down out over all any some more most much many one two ' +
    'have has had im i\'m it\'s that\'s let\'s lets dont don\'t gonna wanna need needs want make made think know see go going been being still now today tomorrow').split(' '));
  const cap = s => { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
  const words = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  const stem = w => (w.length > 3 ? w.replace(/(ings?|ed|s)$/, '') : w);
  const list = a => (a.length <= 1 ? a.join('') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const first = n => String(n || '').split(/\s+/)[0];
  const sentences = t => String(t || '').replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);

  // ---------- dates ("by friday", "tomorrow", "next week") ----------
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function due(text, now = new Date()) {
    const t = String(text || '').toLowerCase(), d = new Date(now);
    if (/\b(today|tonight|asap|eod)\b/.test(t)) return ymd(d);
    if (/\b(tomorrow|tmrw|tmr)\b/.test(t)) { d.setDate(d.getDate() + 1); return ymd(d); }
    if (/\bnext week\b/.test(t)) { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return ymd(d); }
    if (/\b(this|end of( the)?) week(end)?\b/.test(t)) { d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return ymd(d); }
    const m = /\b(?:by|on|before|until|for|this|next)?\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/.exec(t);
    if (m && /\b(by|on|before|until|this|next)\s+\w+day\b|\b\w+day\b/.test(t)) { const want = DAYS.findIndex(x => x.startsWith(m[1])); let n = (want - d.getDay() + 7) % 7; if (!n) n = 7; d.setDate(d.getDate() + n); return ymd(d); }
    return null;
  }
  const stripDue = s => s.replace(/\s*\b(?:by|on|before|until|for)\s+(?:today|tonight|tomorrow|tmrw|next week|(?:this |next )?(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|satur)(?:day)?)\b/gi, '').replace(/\s*\b(?:asap|eod|today|tomorrow|tmrw)\b\s*$/i, '');

  // ---------- chat: summarize ----------
  const DECIDED = /\b(decided|let'?s go with|going with|we('ll| will) (use|go|ship|keep|do)|agreed|final(ly)? (call|answer)|ship it|approved|settled on|picked)\b/i;
  function topics(texts, n = 4) {
    const f = new Map(), show = new Map();
    for (const t of texts) for (const w of new Set(words(t))) { const k = stem(w); f.set(k, (f.get(k) || 0) + 1); if (!show.has(k)) show.set(k, w); }
    return [...f.entries()].filter(([, c]) => c > 1 || texts.length < 4).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => show.get(k));
  }
  function summarize(msgs) {
    msgs = (msgs || []).filter(m => m && m.text && String(m.text).trim()).slice(-120);
    if (!msgs.length) return { lines: ['The chat is quiet: nothing to sum up yet.'], text: 'The chat is quiet: nothing to sum up yet.', people: [], topics: [], decided: [], questions: [], tasks: [] };
    const people = [...new Set(msgs.map(m => first(m.who || 'someone')))];
    const tps = topics(msgs.map(m => m.text));
    const decided = msgs.filter(m => DECIDED.test(m.text)).slice(-3).map(m => clip(m.text, 110));
    const qs = msgs.filter((m, i) => /\?\s*$/.test(m.text) && i >= msgs.length - 25 && !msgs.slice(i + 1).some(r => r.who !== m.who)).slice(-2).map(m => `${first(m.who)}: ${clip(m.text, 100)}`);
    const tasks = toTasks(msgs);
    const lines = [`${msgs.length} message${msgs.length === 1 ? '' : 's'} from ${list(people.slice(0, 4))}${people.length > 4 ? ` and ${people.length - 4} more` : ''}.`];
    if (tps.length) lines.push(`Mostly about ${list(tps)}.`);
    if (decided.length) lines.push(`Decided: ${decided.join(' · ')}`);
    if (qs.length) lines.push(`Still open: ${qs.join(' · ')}`);
    if (tasks.length) lines.push(`${tasks.length} thing${tasks.length === 1 ? '' : 's'} to do: ${tasks.slice(0, 3).map(t => t.title).join('; ')}${tasks.length > 3 ? '…' : ''}`);
    return { lines, text: lines.join('\n'), people, topics: tps, decided, questions: qs, tasks };
  }

  // ---------- chat: things to do ----------
  const ACT = [
    /^(?:todo|to do|to-do|task|action)\s*[:\-–]\s*(.+)$/i,
    /\b(?:we|i|you|someone|somebody|anyone|they)\s+(?:really\s+)?(?:should|need to|needs to|have to|has to|must|gotta|ought to)\s+(.+)$/i,
    /\b(?:let'?s|lets)\s+(?!go\b|see\b|do this\b|talk\b)(.+)$/i,
    /\b(?:can|could|would)\s+(?:someone|somebody|anyone|you)\s+(?:please\s+)?(.+?)\??$/i,
    /\b(?:don'?t forget to|remember to|make sure (?:to|we)|please)\s+(.+)$/i,
    /^((?:fix|add|build|make|write|update|remove|delete|design|test|ship|create|draft|set up|setup|clean up|refactor|rename|move|record|upload|deploy|invite|email|call|book|order|buy|check|review)\b.+)$/i,
  ];
  const WILL = /^@?([A-Z][\w-]+)\s+(?:will|can|is going to|'ll|should)\s+(.+)$/;
  function toTasks(msgs, ctx = {}) {
    const out = [], seen = new Set(), names = (ctx.members || []).map(m => ({ id: m.id, name: m.name, f: first(m.name).toLowerCase() }));
    const who = n => { n = String(n || '').toLowerCase().replace(/^@/, ''); const m = names.find(x => x.f === n || x.name.toLowerCase() === n); return m ? m.id : null; };
    for (const m of (msgs || []).slice(-150)) {
      if (!m || !m.text || m.who === 'TribeCode' || /^\s*>/.test(m.text)) continue;
      for (let s of sentences(m.text)) {
        if (s.length < 6 || s.length > 220 || /\?$/.test(s) && !/^(can|could|would)\b/i.test(s)) continue;
        let title = null, assignee = null, w;
        if ((w = WILL.exec(s)) && !/^(I|We|You|It|This|That|They|He|She)$/i.test(w[1])) { title = w[2]; assignee = who(w[1]); }
        const at = /@([\w-]+)/.exec(s); if (at && !assignee) assignee = who(at[1]);
        if (!title) for (const rx of ACT) { const x = rx.exec(s); if (x) { title = x[1]; break; } }
        if (!title) continue;
        title = stripDue(title.replace(/@[\w-]+\s*/g, '').replace(/\b(please|pls|plz|asap)\b/gi, '').replace(/[.!?…]+$/, '').replace(/\s+/g, ' ').trim());
        title = title.replace(/^(to|that)\s+/i, '');
        if (words(title).length < 1 || title.length < 4) continue;
        title = cap(clip(title, 90)); const key = words(title).map(stem).join(' ');
        if (seen.has(key)) continue; seen.add(key);
        out.push({ title, ...(assignee ? { assignee } : {}), ...(due(s, ctx.now) ? { due: due(s, ctx.now) } : {}), from: first(m.who) });
      }
    }
    return out.slice(0, 12);
  }

  // ---------- tasks ----------
  const TYPES = [
    ['fix', /\b(fix|bug|broken|crash|error|issue|glitch|wrong|fails?)\b/i, ['Reproduce it and write down the steps', 'Find what causes it', 'Fix it', 'Check it is gone and nothing else broke']],
    ['design', /\b(design|mockup|logo|colou?rs?|font|layout|ui|ux|screen|icon|style|look)\b/i, ['Collect 3–5 references (the inspiration board helps)', 'Sketch two directions', 'Pick one with the tribe', 'Make the final version and hand it over']],
    ['write', /\b(write|copy|doc|docs|readme|post|blog|email|text|words|script|bio|faq)\b/i, ['List the points it must make', 'Write a rough first draft', 'Cut it down by a third', 'Ask someone to read it, then publish']],
    ['research', /\b(research|look into|compare|find out|investigate|explore|evaluate|spike)\b/i, ['Write the question in one line', 'Find 3 sources or options', 'Compare them in a short table', 'Post the answer and the pick']],
    ['ship', /\b(ship|release|publish|deploy|launch)\b/i, ['Check it works on a phone and a computer', 'Write a short changelog', 'Publish it', 'Tell the tribe and share the link']],
  ];
  const typeOf = t => (TYPES.find(([, rx]) => rx.test(t)) || ['build'])[0];
  function splitTask(task) {
    const title = String((task && task.title) || task || '').trim(), notes = String((task && task.notes) || '');
    const parts = title.replace(/\s*\.\s*$/, '').split(/\s*(?:,|;|\bthen\b|\band then\b|\band also\b|\bplus\b|\s\+\s|&|\band\b)\s*/i).map(s => s.trim()).filter(s => words(s).length >= 1 && s.length > 2);
    const verbish = /^(add|build|make|fix|write|design|test|ship|create|draft|set|clean|update|remove|record|upload|polish|tune|draw|hook|wire|connect|move|rename|publish|play)/i;
    if (parts.length >= 2) { const lead = (verbish.exec(parts[0]) || [''])[0]; return parts.slice(0, 6).map(p => cap(verbish.test(p) || !lead ? p : `${lead.toLowerCase()} ${p}`)); }
    const bullets = notes.split('\n').map(l => /^\s*[-*]\s+(?:\[ \]\s*)?(.+)$/.exec(l)).filter(Boolean).map(m => cap(m[1].trim()));
    if (bullets.length >= 2) return bullets.slice(0, 8);
    const ty = typeOf(title + ' ' + notes), T = TYPES.find(x => x[0] === ty);
    if (T) return T[2].slice();
    const thing = title.replace(verbish, '').trim() || 'it';
    return [`Sketch how ${thing.toLowerCase()} should work`, `Build a first version of ${thing.toLowerCase()}`, 'Try it and fix what feels off', 'Show the tribe and get a yes'];
  }
  const HARD = /\b(multiplayer|online|auth|login|accounts?|database|db|payments?|stripe|sync|refactor|rewrite|migrat\w*|engine|physics|ai|machine learning|ml|server|backend|api|realtime|real-time|security|encrypt\w*|performance|optimi[sz]e|port|editor|level editor|save system|saves?)\b/gi;
  const EASY = /\b(typo|copy|text|wording|colou?r|rename|label|icon|link|tweak|small|tiny|quick|minor|bump|padding|margin|font size)\b/gi;
  function estimate(task) {
    const title = String((task && task.title) || task || ''), notes = String((task && task.notes) || ''), all = `${title} ${notes}`;
    const hard = (all.match(HARD) || []).length, easy = (all.match(EASY) || []).length, steps = ((task && task.subtasks) || []).length || splitTask(task).length;
    const score = words(title).length * 0.35 + hard * 2.2 - easy * 1.4 + Math.max(0, steps - 3) * 0.6 + (notes.length > 300 ? 1 : 0);
    const size = score < 1.4 ? 'S' : score < 3.2 ? 'M' : score < 5.6 ? 'L' : 'XL';
    const hours = { S: 'about an hour', M: 'half a day', L: 'a day or two', XL: 'most of a week: split it' }[size];
    const why = hard ? `it touches ${[...new Set((all.match(HARD) || []).map(x => x.toLowerCase()))].slice(0, 2).join(' and ')}` : easy ? 'it is a small, contained change' : steps > 3 ? `it has ${steps} steps` : 'it reads like one clear change';
    return { size, hours, why, label: `est ${size}` };
  }
  function suggestOwner(task, ctx = {}) {
    const members = (ctx.members || []).filter(m => m && m.role !== 'spectator' && m.role !== 'guest'), tasks = ctx.tasks || [];
    if (!members.length) return null;
    const tw = new Set(words((task && task.title) || task).map(stem)), ty = typeOf((task && task.title) || task);
    const scored = members.map(m => {
      const theirs = tasks.filter(t => t.assignee === m.id || (t.status === 'done' && t.doneBy === m.id));
      const like = theirs.filter(t => t.id !== (task && task.id) && words(t.title).map(stem).some(w => tw.has(w)));
      const load = tasks.filter(t => t.assignee === m.id && t.status !== 'done').length;
      const agentFit = m.role === 'agent' && /build|fix/.test(ty) ? 0.6 : 0;
      return { m, like, load, s: like.length * 2 - load * 0.7 + agentFit + (m.online ? 0.4 : 0) + (m.id === ctx.me ? 0.2 : 0) };
    }).sort((a, b) => b.s - a.s || a.load - b.load || String(a.m.name).localeCompare(String(b.m.name)));
    const b = scored[0];
    const why = b.like.length ? `${first(b.m.name)} did ${b.like.length} similar task${b.like.length === 1 ? '' : 's'} (${b.like.slice(0, 2).map(t => `“${clip(t.title, 30)}”`).join(', ')})`
      : b.load === 0 ? `${first(b.m.name)} has nothing open right now` : `${first(b.m.name)} has the fewest open tasks (${b.load})`;
    return { id: b.m.id, name: b.m.name, why };
  }

  // ---------- notes and docs ----------
  function tidy(md) {
    const out = [], src = String(md || '').replace(/\r\n?/g, '\n').split('\n'); let fence = false, n = 0;
    for (let ln of src) {
      if (/^\s*```/.test(ln)) { fence = !fence; out.push(ln.replace(/\s+$/, '')); continue; }
      if (fence) { out.push(ln); continue; }
      ln = ln.replace(/[ \t]+$/, '').replace(/\t/g, '  ');
      let h = /^(#{1,6})\s*(\S.*)$/.exec(ln);
      if (h) { if (out.length && out[out.length - 1] !== '') out.push(''); out.push(`${h[1]} ${cap(h[2].replace(/\s*#+\s*$/, ''))}`); n = 0; continue; }
      const b = /^(\s*)[*+•]\s+(.*)$/.exec(ln); if (b) ln = `${b[1]}- ${b[2]}`;
      const num = /^(\s*)\d+[.)]\s+(.*)$/.exec(ln); if (num && !num[1]) { n++; ln = `${n}. ${num[2]}`; } else if (!/^\s*$/.test(ln) && !num) n = 0;
      const li = /^(\s*(?:- (?:\[[ xX]\] )?|\d+\. ))(.*)$/.exec(ln);
      if (li) ln = li[1] + cap(li[2]); else if (ln.trim() && !/^\s*[|>]/.test(ln)) ln = ln.replace(/^(\s*)(\S)/, (x, s, c) => s + c.toUpperCase());
      if (!/`/.test(ln)) ln = ln.replace(/ {2,}/g, ' ').replace(/\s+([,;:!?])/g, '$1').replace(/\s+\.(?=\s|$)/g, '.').replace(/\bi\b(?=[ ']|$)/g, 'I');
      out.push(ln);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
  }
  function outline(md) {
    const lines = String(md || '').split('\n'), hs = [];
    let fence = false; for (const l of lines) { if (/^\s*```/.test(l)) fence = !fence; const h = !fence && /^(#{1,4})\s+(.+)$/.exec(l); if (h) hs.push({ d: h[1].length, t: h[2].trim() }); }
    if (hs.length > 1) { const min = Math.min(...hs.map(h => h.d)); return hs.map(h => `${'  '.repeat(h.d - min)}- ${h.t}`).join('\n'); }
    const paras = String(md || '').split(/\n\s*\n/).map(p => p.replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim()).filter(p => p.length > 20);
    return paras.slice(0, 10).map(p => `- ${clip(sentences(p)[0] || p, 70)}`).join('\n') || '- (Write a few paragraphs and the outline appears here.)';
  }
  const SECTIONS = [['goal', /^#+\s*(goal|why|purpose|summary|overview)/im, '## Goal\n\nWhat this is for, in one or two sentences.'], ['how', /^#+\s*(how|plan|approach|steps|details)/im, '## Plan\n\n1. \n2. \n3. '],
    ['open', /^#+\s*(open questions|questions|risks|unknowns)/im, '## Open questions\n\n- '], ['next', /^#+\s*(next steps?|to ?do|actions?|what'?s next)/im, '## Next steps\n\n- [ ] ']];
  function continueDoc(md, title) {
    const t = String(md || '').replace(/\s+$/, ''), last = t.split('\n').pop() || '';
    const li = /^(\s*)(- \[[ xX]\] |- |\d+\. )/.exec(last);
    if (li) { const nx = /\d+\. /.test(li[2]) ? `${parseInt(li[2], 10) + 1}. ` : li[2].replace(/\[[xX]\]/, '[ ]'); return `\n${li[1]}${nx}`; }
    const missing = SECTIONS.filter(([, rx]) => !rx.test(t));
    if (!t) return `# ${title || 'Untitled'}\n\n${SECTIONS.map(s => s[2]).join('\n\n')}\n`;
    if (missing.length) return `\n\n${missing.slice(0, 2).map(s => s[2]).join('\n\n')}\n`;
    return '\n\n## Notes\n\n- ';
  }

  // ---------- files ----------
  const EXT = { image: /^(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/, audio: /^(mp3|wav|ogg|m4a|flac|aac|opus)$/, video: /^(mp4|webm|mov|mkv|avi)$/, model: /^(glb|gltf|obj|fbx|stl|blend|vox)$/, doc: /^(md|txt|pdf|docx?|rtf|odt|pages)$/,
    sheet: /^(csv|tsv|xlsx?|ods|numbers)$/, deck: /^(pptx?|key|odp)$/, code: /^(js|mjs|ts|tsx|jsx|py|rb|go|rs|java|c|cpp|h|cs|php|swift|kt|lua|gd|sh|html|css|json|ya?ml|toml|sql)$/, archive: /^(zip|tar|gz|tgz|rar|7z)$/, font: /^(ttf|otf|woff2?)$/ };
  const KIND_WORD = { image: 'picture', audio: 'sound', video: 'video', model: '3D model', doc: 'document', sheet: 'spreadsheet', deck: 'slide deck', code: 'code file', archive: 'archive', font: 'font', file: 'file' };
  const HINTS = [[/screen ?shot|screen[-_ ]?cap|capture/, 'screenshot', 'a screenshot'], [/logo|brand|wordmark/, 'brand', 'a logo or brand mark'], [/icon|favicon/, 'icon', 'an icon'], [/sprite|tileset|tiles|sheet/, 'game-art', 'game art'],
    [/bg|background|wallpaper|backdrop/, 'background', 'a background'], [/mock ?up|wireframe|figma|design/, 'design', 'a design mockup'], [/avatar|profile|headshot|portrait/, 'people', 'a portrait'], [/jump|coin|hit|explos|laser|click|blip|sfx|whoosh|pickup/, 'sfx', 'a sound effect'],
    [/music|song|theme|loop|ost|track/, 'music', 'music'], [/invoice|receipt|bill/, 'money', 'an invoice'], [/contract|nda|terms|agreement|privacy/, 'legal', 'a legal document'], [/readme|notes?|draft|spec|plan|brief/, 'notes', 'notes or a plan'],
    [/final|v\d+|release/, 'version', ''], [/test|spec\b/, 'test', '']];
  const fsize = n => (!n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  function describeFile(f) {
    f = f || {}; const name = String(f.name || 'file'), ext = (/\.([a-z0-9]+)$/i.exec(name) || [, ''])[1].toLowerCase();
    let kind = f.kind && KIND_WORD[f.kind] ? f.kind : Object.keys(EXT).find(k => EXT[k].test(ext)) || (/^image\//.test(f.type || '') ? 'image' : /^audio\//.test(f.type || '') ? 'audio' : /^video\//.test(f.type || '') ? 'video' : 'file');
    const base = name.replace(/\.[^.]+$/, ''), pretty = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(), low = pretty + ' ' + base.toLowerCase();
    const hits = HINTS.filter(([rx]) => rx.test(low));
    const tags = [...new Set([kind, ext, ...hits.map(h => h[1]), ...words(pretty).filter(w => !/^\d+$/.test(w) && w.length > 2).slice(0, 3),
      ...(f.w && f.h ? [f.w > f.h * 1.2 ? 'landscape' : f.h > f.w * 1.2 ? 'portrait' : 'square'] : []), ...(f.size > 25 * 1048576 ? ['large'] : [])])].filter(Boolean).slice(0, 7);
    const what = hits.find(h => h[2]);
    const description = `${/^[aeiou]/i.test(ext || kind) ? 'An' : 'A'} ${ext ? ext.toUpperCase() + ' ' : ''}${KIND_WORD[kind]} called “${pretty || name}”${f.size ? `, ${fsize(f.size)}` : ''}${f.w && f.h ? `, ${f.w}×${f.h}` : ''}.${what ? ` From the name it looks like ${what[2]}.` : ''}`;
    return { description, tags, kind };
  }

  // ---------- Home: today's plan ----------
  function planDay(ctx = {}) {
    const me = ctx.me, now = ctx.now ? new Date(ctx.now) : new Date(), today = ymd(now), tasks = (ctx.tasks || []).filter(t => t && t.status !== 'done');
    const items = [], has = new Set(), add = (t, why, kind, ref) => { if (has.has(kind + ref) || items.length >= 6) return; has.add(kind + ref); items.push({ t, why, kind, ref }); };
    const mine = tasks.filter(t => t.assignee === me);
    mine.filter(t => t.status === 'doing').forEach(t => add(t.title, 'You started it: finish it first', 'task', t.id));
    mine.filter(t => t.due && t.due <= today).sort((a, b) => String(a.due).localeCompare(String(b.due))).forEach(t => add(t.title, t.due < today ? `Overdue since ${t.due}` : 'Due today', 'task', t.id));
    (ctx.events || []).filter(e => e && String(e.start || e.at || e.date || '').slice(0, 10) === today).slice(0, 2).forEach(e => add(e.title, `At ${String(e.start || e.at || '').slice(11, 16) || 'some point today'}`, 'event', e.id));
    tasks.filter(t => t.status === 'review' && t.assignee !== me).slice(0, 2).forEach(t => add(`Review “${t.title}”`, 'Someone is waiting for a second look', 'task', t.id));
    mine.filter(t => t.status !== 'doing').slice(0, 2).forEach(t => add(t.title, t.due ? `Due ${t.due}` : 'On your list', 'task', t.id));
    const free = tasks.filter(t => !t.assignee && t.status !== 'review'); if (free.length) add(free[0].title, `Nobody's on it yet (${free.length} like this)`, 'task', free[0].id);
    for (const n of (ctx.notes || []).slice(0, 20)) for (const l of String(n.text || '').split('\n')) { const m = /^\s*[-*]\s+\[ \]\s+(.+)$/.exec(l); if (m) add(m[1].trim(), 'An open checkbox in your notes', 'note', n.id); }
    if (!items.length) add(ctx.connected === false ? 'Start your first project' : 'Pick one small thing to build', ctx.connected === false ? 'Everything else follows from it' : 'Nothing is waiting on you: a quiet day to make something', 'start', '');
    const text = items.map((x, i) => `${i + 1}. ${x.t} (${x.why})`).join('\n');
    return { items, text };
  }

  // ---------- Company: a seat's charter ----------
  const CHARTERS = {
    ceo: n => ({ goal: `Pick the one goal for ${n} this month and tell everyone`, owns: ['vision', 'decisions', 'priorities'], mayDo: ['set goals', 'make calls', 'assign seats'], needsApproval: ['spend money', 'sign contracts'], done: 'Everyone can say the goal and who owns what.' }),
    cto: n => ({ goal: `Ship the next version of ${n}`, owns: ['code', 'tasks:build', 'releases'], mayDo: ['write code', 'fix bugs', 'review changes'], needsApproval: ['deploy to production', 'add paid services'], done: 'Someone outside the team used the new version.' }),
    design: n => ({ goal: `Make ${n}'s main screen clear and good-looking`, owns: ['design', 'brand', 'inspiration board'], mayDo: ['design mockups', 'pick colors and fonts'], needsApproval: ['publish', 'spend money on assets'], done: 'A newcomer understands the main screen without help.' }),
    growth: n => ({ goal: `Find the next 10 people who want ${n}`, owns: ['website', 'posts'], mayDo: ['draft posts', 'write landing copy', 'research where users are'], needsApproval: ['publish', 'email customers', 'spend money'], done: '10 real people said yes.' }),
    sales: n => ({ goal: `Talk to 5 people who could pay for ${n}`, owns: ['leads', 'proposals'], mayDo: ['research leads', 'draft outreach'], needsApproval: ['email customers', 'send proposals', 'sign contracts'], done: '5 real conversations, notes written down.' }),
    support: n => ({ goal: `Answer every question about ${n} within a day`, owns: ['help docs', 'feedback'], mayDo: ['draft replies', 'write help pages'], needsApproval: ['email customers', 'give refunds'], done: 'No question older than a day.' }),
    ops: n => ({ goal: `Keep ${n}'s week calm and planned`, owns: ['tasks', 'calendar'], mayDo: ['tidy the task board', 'write weekly notes', 'chase blockers'], needsApproval: ['spend money', 'change who has access'], done: 'Every open task has an owner.' }),
    finance: n => ({ goal: `Know what ${n} spends and earns each week`, owns: ['budget'], mayDo: ['track costs', 'draft a budget'], needsApproval: ['spend money', 'change prices', 'connect payments'], done: 'A weekly line: spent, earned, left. (A starting point, not financial advice.)' }),
    legal: n => ({ goal: `Keep ${n}'s terms and privacy page current`, owns: ['terms', 'privacy page', 'contracts'], mayDo: ['draft terms from a template', 'list what to check with a professional'], needsApproval: ['sign contracts', 'publish legal pages'], done: 'Pages drafted and checked by someone qualified.' }),
  };
  const KIND_WORDS = [['ceo', /ceo|chief|lead|founder|boss|head/], ['cto', /cto|build|code|dev|engineer|tech/], ['design', /design|art|brand|ui|ux|look/], ['growth', /grow|market|social|community|content|seo|ads/],
    ['sales', /sales|sell|deals|partner/], ['support', /support|help|care|success/], ['ops', /ops|operat|run|project manag|pm\b|admin/], ['finance', /financ|money|budget|account|book/], ['legal', /legal|law|contract|compliance/]];
  function seatCharter(seat, project) {
    const n = (project && project.name) || 'the project', title = String((seat && seat.title) || ''), kind = seat && CHARTERS[seat.kind] ? seat.kind : (KIND_WORDS.find(([, rx]) => rx.test(title.toLowerCase())) || ['ops'])[0];
    const c = CHARTERS[kind](n), vision = String((project && (project.vision || project.bio)) || '').split(/[.\n]/)[0].trim();
    if (vision && (kind === 'ceo' || kind === 'growth')) c.goal = clip(`${c.goal}: ${vision.charAt(0).toLowerCase()}${vision.slice(1)}`, 190);
    return { kind, ...c };
  }

  // ---------- reading a model's refined answer back ----------
  function parse(kind, text) {
    const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const bullets = () => t.split('\n').map(l => /^\s*(?:[-*•]|\d+[.)])\s+(?:\[ \]\s*)?(.+)$/.exec(l)).filter(Boolean).map(m => m[1].replace(/\*\*/g, '').trim()).filter(Boolean);
    const field = k => { const m = new RegExp(`^\\s*\\**${k}\\**\\s*[:：]\\s*(.+)$`, 'im').exec(t); return m ? m[1].trim() : ''; };
    const csv = s => s.split(/[,;·]/).map(x => x.trim().replace(/^and\s+/, '')).filter(Boolean).slice(0, 8);
    if (kind === 'chat.tasks' || kind === 'task.split') { const b = bullets(); return b.length ? b.slice(0, 12) : null; }
    if (kind === 'task.estimate') { const m = /\b(XL|S|M|L)\b/.exec(t); return m ? { size: m[1], hours: field('time') || field('hours') || '', why: field('why') || clip(t.replace(/^.*\b(XL|S|M|L)\b[:\s-]*/, ''), 140) } : null; }
    if (kind === 'task.owner') return clip(field('owner') || t.split('\n')[0], 80) || null;
    if (kind === 'file.describe') { const d = field('description'), g = field('tags'); return d || g ? { description: d, tags: g ? csv(g).map(x => x.toLowerCase().replace(/^#/, '')) : [] } : null; }
    if (kind === 'seat.charter') { const goal = field('goal'); if (!goal) return null; return { goal, owns: csv(field('owns')), mayDo: csv(field('may do')), needsApproval: csv(field('needs a yes') || field('needs approval')), done: field('done') }; }
    return t || null;
  }

  return { summarize, toTasks, splitTask, estimate, suggestOwner, tidy, outline, continueDoc, describeFile, planDay, seatCharter, parse, due, typeOf, topics };
});
