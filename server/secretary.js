// The Secretary: a quiet background agent on the host that reads what the tribe makes, keeps notes, and
// dreams up connections. Off until the host turns it on; respects quiet hours; cheap and interruptible.
//
// Every tick, per project (each project's notes stay in that project):
//   INGEST   new chat (voice-note transcripts and images too), docs and dropped files, files in the repo's
//            notes/ and files/ folders, commits, agent gists/prompts, decisions and votes, new tasks, and
//            notes people hand the secretary directly.
//   DISTILL  notes/secretary/YYYY-MM-DD.md (what happened, decisions, open questions, research) and
//            notes/secretary/DIGEST.md (the ten things that matter now). Short gists, never code.
//   DREAM    notes/secretary/INSPIRATION.md: "realizations" that connect what different people are making,
//            each with its sources and one tap to make it a task or suggest a vote.
//   RESEARCH it never browses. Questions that need research become requests the humans' Claudes pick up
//            over MCP (server/mcp-secretary.js: secretary_inbox, secretary_file, secretary_ask).
// It uses the local model (server/brain.js, the host picks which) when Ollama is up, else plain rules.
// It never runs code and never fetches URLs. Notes live in the tribe folder under secretary/<project>/ and,
// when the project's repo autopilot commits the tribe context, they are mirrored into the repo at
// notes/secretary/ and committed + pushed with the same rules (only on main, only when in sync).
//
// HTTP (all project-scoped; the request already runs in one project the caller can see):
//   GET  /api/secretary                    digest, today's journal, ideas, research, config, status
//   GET  /api/secretary/journal/:date      one day's journal (Markdown)
//   PUT  /api/secretary/config             host only: { enabled, model, quiet:{on,from,to}, everyMin, repoNotes, useBrain }
//   POST /api/secretary/tick               host only: run a tick for this project now (ignores quiet hours)
//   POST /api/secretary/ask                { question } -> { answer, sources }   (also @secretary in chat)
//   POST /api/secretary/note               { text } a note for the secretary (lands in the journal)
//   POST /api/secretary/requests           { question, why } a research request for the team's agents
//   POST /api/secretary/ideas/:id/task     make an idea a task (humans)
//   POST /api/secretary/ideas/:id/vote     suggest a team vote from an idea (humans)
//   POST /api/secretary/ideas/:id/dismiss
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const gitutil = require('./gitutil');

const SYS = new Set(['tribecode', 'secretary', 'brain']);
const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'json', 'css', 'html', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'cs', 'rb', 'sh', 'yml', 'yaml', 'toml', 'csv', 'lua', 'gd', 'swift', 'kt']);
const CODE_EXT = new Set(['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'h', 'cpp', 'cs', 'rb', 'sh', 'lua', 'gd', 'swift', 'kt', 'css', 'html']);
const STOP = new Set(('that this with have from they will would there their what when where which about just like think make made also some more then than into them been were your yours okay yeah gonna wanna want really could should maybe thing things good great nice lets going doing done work working today tomorrow yesterday tribe tribecode project message note notes added update updated start starting still very much many only over after before because something anything everything every each well here sure know look looks take give used using first last next same other another again even those these being does while such both between around without within morning evening hello thanks thank cool awesome right left back down make makes made need needs needed want wants come comes came said says tell told time times kind sort stuff people someone everyone anyone guys folks didn doesn isn wasn aren hasn haven couldn wouldn shouldn mine ours theirs also any all can cant will dont didnt doesnt isnt wasnt arent wont thats whats heres theres youre theyre were well shes hes just yes nope sounds sound plan plans try trying tried new old big small little lot lots bit way ways day days week weeks one two three four five six seven eight nine ten once every how why who whom whose did has had was are the and for not but you our its out off get got put see seen saw use say able across along already always among became become becomes beside besides beyond came cannot during either else enough ever except far few further hence however indeed instead later least less likely may might mostly must near nearly neither never none nor often otherwise perhaps please quite rather shall since soon than thereafter therefore though through thus together toward towards under unless until upon usually via whatever whenever wherever whether whole whose within yet secretary brain claude agent agents task tasks chat voice image file files doc docs commit commits idea ideas thought thoughts stuff').split(/\s+/));
const RESEARCH_RE = /\b(how (do|does|can|should|would) (we|i|you|one)|what('s| is| are) the best|which (library|libraries|engine|tool|tools|framework|lib|package|service)|is there an? (library|tool|way|api|package)|best way to|look into|find out|research|any (good )?(library|tool|examples?) for)\b/i;
const DECIDE_RE = /\b(decided|we('re| are) going with|let'?s go with|agreed|we('ll| will) use|final answer|settled on|going with)\b/i;
const Q_RE = /\?\s*$|^(who|what|how|why|should|can|could|is|are|does|do|which|when|where)\b/i;
const pad = n => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const plain = s => String(s || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/`([^`]*)`/g, '$1').replace(/\*\*|__|~~/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const words = s => (String(s || '').toLowerCase().replace(/[\u2019']/g, '').match(/[a-z][a-z0-9-]{3,}/g) || []).map(w => w.replace(/-+$/, '')).filter(w => w.length >= 4 && !STOP.has(w));
const stem = w => (w.length > 5 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const kw = s => [...new Set(words(s).map(stem))];
const KIND_LABEL = { chat: 'message', voice: 'voice note', image: 'image', doc: 'doc', file: 'file', commit: 'commit', decision: 'decision', vote: 'vote', agent: 'agent update', task: 'task', note: 'note', research: 'research' };
const OUT_FILES = ['DIGEST.md', 'INSPIRATION.md'];

module.exports = function secretary({ P, store, pstore, brain, docs, loadTasks, hubFor, getMembers, nameOf, postChat, createTask, votes, broadcast, str, id, log = () => {} }) {
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const who = mid => (mid === 'tribecode' ? 'TribeCode' : mid === 'secretary' ? 'Secretary' : mid === 'brain' ? 'Local Brain' : nameOf(mid));
  const err = (status, msg) => Object.assign(new Error(msg), { status });
  const pid = () => P.current() || P.defaultId();

  // ---------- config (one per tribe, host only) ----------
  const CFG = '.tribe/secretary.json';
  const DEFAULTS = { enabled: false, model: '', useBrain: true, everyMin: 15, quiet: { on: true, from: '22:00', to: '07:00' }, repoNotes: true };
  let cfg = merge(store.readJSON(CFG, {}));
  function merge(o) { return { ...DEFAULTS, ...o, quiet: { ...DEFAULTS.quiet, ...((o || {}).quiet || {}) } }; }
  const saveCfg = () => store.writeJSON(CFG, cfg);
  const okClock = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  function setConfig(b = {}) {
    if (typeof b.enabled === 'boolean') { if (!b.enabled && running) abort = true; cfg.enabled = b.enabled; }
    if (typeof b.model === 'string') cfg.model = b.model === '' || brain.models().includes(b.model) || /^[\w.:/-]{1,80}$/.test(b.model) ? b.model.slice(0, 80) : cfg.model;
    if (typeof b.useBrain === 'boolean') cfg.useBrain = b.useBrain;
    if (typeof b.repoNotes === 'boolean') cfg.repoNotes = b.repoNotes;
    if (Number.isFinite(Number(b.everyMin)) && b.everyMin !== null && b.everyMin !== '') cfg.everyMin = Math.min(Math.max(Math.round(Number(b.everyMin)), 2), 240);
    if (b.quiet && typeof b.quiet === 'object') {
      if (typeof b.quiet.on === 'boolean') cfg.quiet.on = b.quiet.on;
      if (okClock(b.quiet.from)) cfg.quiet.from = b.quiet.from;
      if (okClock(b.quiet.to)) cfg.quiet.to = b.quiet.to;
    }
    saveCfg();
    broadcast({ type: 'secretary-config', config: publicCfg() });
    return publicCfg();
  }
  const publicCfg = () => ({ enabled: cfg.enabled, model: cfg.model, useBrain: cfg.useBrain, everyMin: cfg.everyMin, quiet: { ...cfg.quiet }, repoNotes: cfg.repoNotes });
  function isQuiet(d = new Date()) {
    if (!cfg.quiet.on) return false;
    const m = d.getHours() * 60 + d.getMinutes(), [fh, fm] = cfg.quiet.from.split(':').map(Number), [th, tm] = cfg.quiet.to.split(':').map(Number);
    const f = fh * 60 + fm, t = th * 60 + tm;
    return f === t ? false : f < t ? m >= f && m < t : m >= f || m < t;
  }

  // ---------- per-project files (tribe folder: secretary/<project>/) ----------
  const dir = p => `secretary/${p}`;
  const ensure = p => { fs.mkdirSync(store.p(dir(p), 'notes'), { recursive: true }); };
  const stateOf = p => store.readJSON(`${dir(p)}/state.json`, null);
  const saveState = (p, s) => { ensure(p); store.writeJSON(`${dir(p)}/state.json`, s); };
  const itemsOf = (p, n = 3000) => store.readJSONL(`${dir(p)}/items.jsonl`, n);
  const ideasOf = p => store.readJSON(`${dir(p)}/ideas.json`, []);
  const saveIdeas = (p, l) => { ensure(p); store.writeJSON(`${dir(p)}/ideas.json`, l.slice(-60)); };
  const requestsOf = p => store.readJSON(`${dir(p)}/requests.json`, []);
  const saveRequests = (p, l) => { ensure(p); store.writeJSON(`${dir(p)}/requests.json`, l.slice(-200)); };
  const digestOf = p => store.readJSON(`${dir(p)}/digest.json`, { items: [], updated: null });
  const noteRel = (p, f) => `${dir(p)}/notes/${f}`;
  const readNote = (p, f) => { try { return fs.readFileSync(store.p(noteRel(p, f)), 'utf8'); } catch { return ''; } };
  const writeNote = (p, f, text) => { ensure(p); const full = store.p(noteRel(p, f)), tmp = full + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, full); };
  const days = p => { try { return fs.readdirSync(store.p(dir(p), 'notes')).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).map(f => f.slice(0, 10)).sort().reverse(); } catch { return []; } };
  function addItems(p, list) {
    if (!list.length) return;
    ensure(p);
    fs.appendFileSync(store.p(dir(p), 'items.jsonl'), list.map(x => JSON.stringify(x)).join('\n') + '\n');
  }
  const mkItem = (o) => ({ id: 'i-' + id(8).replace(/[^A-Za-z0-9]/g, 'x'), at: o.at || new Date().toISOString(), kind: o.kind, by: o.by || null, who: o.who || (o.by ? who(o.by) : ''), text: clip(plain(o.text), 400), ref: o.ref || null });

  // ---------- INGEST ----------
  function readRepoFiles(p, since, budget) {
    const proj = P.get(p); const repo = proj && proj.repo; const out = [];
    if (!repo || !fs.existsSync(repo)) return out;
    let seen = 0;
    const walk = (rel, depth) => {
      if (depth > 3 || seen > 400 || Date.now() > budget) return;
      let ents = []; try { ents = fs.readdirSync(path.join(repo, rel), { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const r = rel + '/' + e.name; seen++;
        if (r === 'notes/secretary') continue;   // its own notes
        if (e.isDirectory()) walk(r, depth + 1);
        else if (e.isFile()) { let st; try { st = fs.statSync(path.join(repo, r)); } catch { continue; } if (st.mtimeMs > since) out.push({ rel: r, mtime: st.mtimeMs, size: st.size }); }
      }
    };
    for (const top of ['notes', 'files']) walk(top, 0);
    return out.sort((a, b) => a.mtime - b.mtime).slice(-20).map(f => {
      const ext = (f.rel.split('.').pop() || '').toLowerCase();
      let text = `${path.basename(f.rel)} (${ext || 'file'}, ${f.size < 1024 ? f.size + ' B' : Math.round(f.size / 1024) + ' KB'})`;
      if (TEXT_EXT.has(ext) && f.size < 256 * 1024) { try { text = extract(fs.readFileSync(path.join(repo, f.rel), 'utf8').slice(0, 64 * 1024), ext, path.basename(f.rel)); } catch {} }
      return { at: new Date(f.mtime).toISOString(), rel: f.rel, text };
    });
  }
  // A few words from a text file: headings and first bullets for prose; names and the first comment for code.
  function extract(src, ext, name) {
    if (CODE_EXT.has(ext)) {
      const names = [...src.matchAll(/(?:export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|let)\s+|^\s*(?:def|fn|func|function|class)\s+)([A-Za-z_]\w*)/gm)].map(m => m[1]);
      const comment = (src.match(/^\s*(?:\/\/|#|\/\*+|\*)\s*(.{8,})$/m) || [])[1] || '';
      return `${name}: ${clip(comment.replace(/\*\/\s*$/, ''), 120)}${names.length ? ` (defines ${[...new Set(names)].slice(0, 6).join(', ')})` : ''}`;
    }
    const lines = src.split('\n').map(l => l.trim()).filter(Boolean);
    const heads = lines.filter(l => /^#{1,3}\s/.test(l)).map(l => l.replace(/^#+\s*/, '')).slice(0, 3);
    const bullets = lines.filter(l => /^([-*+]|\d+\.)\s/.test(l)).map(l => l.replace(/^([-*+]|\d+\.)\s+(\[.\]\s*)?/, '')).slice(0, 3);
    const first = lines.find(l => !/^#|^[-*+]|^\d+\.|^---|^\||^```/.test(l)) || '';
    return clip(`${name}: ${[...heads, ...bullets].join('; ') || first}`, 300);
  }
  function ingest(p, st, budget) {
    const out = [];
    // chat (voice notes carry their transcript; images their file name; votes their question)
    const chat = pstore.readJSONL('chat/general.jsonl', 600).filter(m => m.at > st.chatAt && !m.deleted && !SYS.has(m.by));
    for (const m of chat.slice(-150)) {
      const ref = { type: 'chat', id: m.id };
      if (m.vote) out.push(mkItem({ at: m.at, kind: 'vote', by: m.by, text: `Vote: ${m.vote.q || m.text}${m.vote.status && m.vote.status !== 'open' ? ` (${m.vote.status})` : ''}`, ref }));
      else if (m.media && m.media.kind === 'voice') { if (m.text) out.push(mkItem({ at: m.at, kind: 'voice', by: m.by, text: m.text, ref })); }
      else if (m.media && m.media.kind === 'image') out.push(mkItem({ at: m.at, kind: 'image', by: m.by, text: `Image ${m.media.file || ''} (${m.media.mime || 'image'})${m.text ? ': ' + m.text : ''}`, ref }));
      else if (m.text && !/^\/(task|decide|vote)\b/i.test(m.text) && !/^@secretary\b/i.test(m.text.trim())) out.push(mkItem({ at: m.at, kind: DECIDE_RE.test(m.text) ? 'decision' : 'chat', by: m.by, text: m.text, ref }));
    }
    if (chat.length) st.chatAt = chat[chat.length - 1].at;
    // docs (dropped files become docs too): new or changed since the last tick
    try {
      for (const d of docs.list()) {
        if (Date.now() > budget) break;
        if ((st.docs[d.slug] || 0) >= (d.version || 1)) continue;
        const isNew = !st.docs[d.slug]; st.docs[d.slug] = d.version || 1;
        if (st.first && d.updated && d.updated < st.since) continue;
        const full = docs.find(d.slug) || d;
        out.push(mkItem({ at: d.updated || d.created, kind: 'doc', by: d.updatedBy || d.by, text: `${isNew ? 'New doc' : 'Edited'} "${d.title}": ${d.summary || extract(full.body || '', 'md', '').replace(/^:\s*/, '')}`, ref: { type: 'doc', id: d.slug, label: d.title } }));
      }
    } catch (e) { log('secretary docs: ' + e.message); }
    // decisions logged with /decide or by closed votes
    try {
      for (const f of pstore.listMd('decisions')) {
        const k = path.basename(f); if (st.decisions.includes(k)) continue;
        st.decisions.push(k); const r = pstore.readMd(f); if (!r) continue;
        const date = String(r.meta.date || ''); if (st.first && date && date < st.since.slice(0, 10)) continue;
        out.push(mkItem({ at: new Date().toISOString(), kind: 'decision', by: r.meta.by || null, text: `Decided: ${(r.body.match(/^#\s*(.+)$/m) || [])[1] || k}`, ref: { type: 'decision', id: k } }));
      }
      st.decisions = st.decisions.slice(-300);
    } catch {}
    // commits on the project repo
    try {
      const hub = hubFor(p); const rs = hub && hub.status();
      for (const c of ((rs && rs.commits) || []).slice().reverse()) {
        if (st.commits.includes(c.sha)) continue; st.commits.push(c.sha);
        if (c.at && Date.parse(c.at) < Date.parse(st.since)) continue;
        out.push(mkItem({ at: c.at, kind: 'commit', who: c.author, text: `${c.author}: ${c.subject}`, ref: { type: 'commit', id: c.sha } }));
      }
      st.commits = st.commits.slice(-200);
    } catch {}
    // agent gists, shared prompts and focus lines (server/people.js logs them per project)
    for (const r of store.readJSONL(`.tribe/people/${p}.jsonl`, 400).filter(x => x.at > st.agentAt).slice(-30)) out.push(mkItem({ at: r.at, kind: 'agent', by: r.by, text: r.text, ref: { type: 'agent', id: r.by } }));
    const ag = store.readJSONL(`.tribe/people/${p}.jsonl`, 1).pop(); if (ag && ag.at > st.agentAt) st.agentAt = ag.at;
    // new tasks
    try { for (const t of loadTasks().filter(t => t.created > st.taskAt && t.source !== 'secretary')) out.push(mkItem({ at: t.created, kind: 'task', by: t.by, text: `New task: ${t.title}`, ref: { type: 'task', id: t.id } })); } catch {}
    const lastTask = loadTasks().map(t => t.created).sort().pop(); if (lastTask && lastTask > st.taskAt) st.taskAt = lastTask;
    // files people drop into the repo's notes/ and files/ folders
    for (const f of readRepoFiles(p, st.filesAt, budget)) out.push(mkItem({ at: f.at, kind: 'file', text: f.text, ref: { type: 'file', id: f.rel } }));
    st.filesAt = Date.now();
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-200);
  }

  // ---------- DISTILL ----------
  const isQuestion = it => (it.kind === 'chat' || it.kind === 'voice') && Q_RE.test(it.text.trim());
  const line = it => `- ${hhmm(it.at)} **${it.who || 'someone'}** · ${KIND_LABEL[it.kind] || it.kind}: ${clip(it.text, 180)}`;
  function topics(items, n = 3) {
    const freq = new Map(), people = new Map();
    for (const it of items) for (const w of kw(it.text)) { freq.set(w, (freq.get(w) || 0) + 1); if (!people.has(w)) people.set(w, new Set()); people.get(w).add(it.who); }
    return [...freq].filter(([w, c]) => c >= 2).sort((a, b) => b[1] - a[1] || people.get(b[0]).size - people.get(a[0]).size).slice(0, n).map(([w, c]) => ({ word: w, count: c, people: [...people.get(w)].filter(Boolean) }));
  }
  const andList = l => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`);
  function journal(p, day, inShort) {
    const all = itemsOf(p).filter(it => localDay(new Date(it.at)) === day);
    const reqs = requestsOf(p).filter(r => (r.filedAt && localDay(new Date(r.filedAt)) === day) || localDay(new Date(r.at)) === day);
    const proj = P.get(p) || {};
    const happened = all.filter(it => !['note', 'research'].includes(it.kind));
    const decisions = all.filter(it => it.kind === 'decision' || (it.kind === 'vote' && /\((passed|closed|failed|tie)\)/.test(it.text)));
    const questions = all.filter(isQuestion);
    const notes = all.filter(it => it.kind === 'note');
    const names = [...new Set(happened.map(it => it.who).filter(Boolean))].slice(0, 5);
    const t = topics(happened);
    const short = inShort || (happened.length ? `${andList(names) || 'The team'} ${names.length > 1 ? 'were' : 'was'} at it${t.length ? `; talk centred on ${andList(t.map(x => x.word))}` : ''}.` : 'A quiet day so far.');
    const sec = (title, list, empty) => `## ${title}\n${list.length ? list.join('\n') : `_${empty}_`}\n`;
    const shown = happened.slice(-25);
    const md = [`# Secretary journal · ${day}`, `_${proj.name || p} · kept by the TribeCode secretary. Short gists, never code._`, '', '## In short', short, '',
      sec('What happened', [...(happened.length > shown.length ? [`- _…${happened.length - shown.length} earlier items in the tribe folder_`] : []), ...shown.map(line)], 'Nothing yet.'),
      sec('Decisions', decisions.map(line), 'None logged.'),
      sec('Open questions', questions.map(line), 'None.'),
      sec('Notes to the secretary', notes.map(line), 'None.'),
      sec('Research', reqs.map(r => r.status === 'answered' ? `- **${clip(r.question, 140)}** (filed by ${r.filedByName || 'an agent'})\n${r.findings.map(f => `  - ${f}`).join('\n')}${r.sources.length ? `\n  - Sources: ${r.sources.join(' · ')}` : ''}` : `- _Open:_ ${clip(r.question, 160)}`), 'No research today.'),
    ].join('\n');
    writeNote(p, `${day}.md`, md.trim() + '\n');
    return md;
  }
  function digest(p) {
    const now = Date.now(), recent = itemsOf(p).filter(it => now - Date.parse(it.at) < 3 * 86400_000);
    const out = [], push = (kind, text, ref) => { if (out.length < 10 && !out.some(x => x.text === text)) out.push({ kind, text: clip(text, 200), ref: ref || null }); };
    const answered = new Set(), reqs = requestsOf(p);
    // Questions someone answered (a later message by someone else in the same day) drop out.
    const qs = recent.filter(isQuestion).filter(q => now - Date.parse(q.at) < 2 * 86400_000);
    for (const q of qs) if (recent.some(x => x.at > q.at && x.who !== q.who && (x.kind === 'chat' || x.kind === 'voice') && kw(x.text).some(w => kw(q.text).includes(w)))) answered.add(q.id);
    recent.filter(it => it.kind === 'decision').slice(-2).reverse().forEach(it => push('decision', it.text.replace(/^Decided:\s*/, 'Decided: ').replace(/^(?!Decided)/, 'Decided: '), it.ref));
    reqs.filter(r => r.status === 'answered' && now - Date.parse(r.filedAt) < 3 * 86400_000).slice(-2).reverse().forEach(r => push('research', `Found: ${clip(r.question, 80)} → ${r.findings[0] || ''}`, { type: 'research', id: r.id }));
    qs.filter(q => !answered.has(q.id)).slice(-2).reverse().forEach(q => push('question', `Open: ${q.text} (${q.who})`, q.ref));
    try { loadTasks().filter(t => t.status === 'doing' || t.status === 'review').slice(0, 2).forEach(t => push('task', `${t.status === 'review' ? 'In review' : 'In progress'}: ${t.title}${t.assignee ? ` (${nameOf(t.assignee)})` : ''}`, { type: 'task', id: t.id })); } catch {}
    const hot = topics(recent.filter(it => now - Date.parse(it.at) < 2 * 86400_000), 2).filter(t => t.people.length >= 2);
    hot.forEach(t => push('topic', `Hot topic: ${t.word} (${andList(t.people.slice(0, 3))})`, null));
    ideasOf(p).filter(i => i.status === 'new').slice(-2).reverse().forEach(i => push('idea', `Idea: ${i.title}`, { type: 'idea', id: i.id }));
    reqs.filter(r => r.status === 'open').slice(-1).forEach(r => push('research', `Waiting on research: ${r.question}`, { type: 'research', id: r.id }));
    recent.filter(it => it.kind === 'doc' || it.kind === 'file').slice(-2).reverse().forEach(it => push(it.kind, it.text, it.ref));
    recent.filter(it => it.kind === 'commit').slice(-1).forEach(it => push('commit', `Shipped: ${it.text}`, it.ref));
    recent.filter(it => it.kind === 'voice' || it.kind === 'image').slice(-1).forEach(it => push(it.kind, `${it.who}'s ${KIND_LABEL[it.kind]}: ${it.text}`, it.ref));
    const d = { items: out, updated: new Date().toISOString() };
    store.writeJSON(`${dir(p)}/digest.json`, d);
    writeNote(p, 'DIGEST.md', `# What matters now\n_${(P.get(p) || {}).name || p} · updated ${d.updated.slice(0, 16).replace('T', ' ')} UTC by the TribeCode secretary._\n\n${out.length ? out.map((x, i) => `${i + 1}. ${x.text}`).join('\n') : '_Nothing yet. The secretary fills this in as the tribe works._'}\n`);
    return d;
  }

  // ---------- DREAM ----------
  const CREATIVE = new Set(['chat', 'voice', 'image', 'doc', 'file', 'note', 'research', 'agent']);
  function dreamRules(p, pool, known) {
    const docFreq = new Map(); const K = new Map();
    for (const it of pool) { const k = kw(it.text); K.set(it.id, k); k.forEach(w => docFreq.set(w, (docFreq.get(w) || 0) + 1)); }
    const pairs = [];
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i], b = pool[j]; if (!a.who || !b.who || a.who === b.who) continue;
      const ka = K.get(a.id), kb = K.get(b.id); const shared = ka.filter(w => kb.includes(w)); if (!shared.length) continue;
      const score = shared.length * 2 + (a.kind !== b.kind ? 2 : 0) + (['voice', 'image', 'file', 'doc'].includes(a.kind) || ['voice', 'image', 'file', 'doc'].includes(b.kind) ? 1 : 0) + Date.parse(b.at) / 1e13;
      pairs.push({ a, b, shared, score });
    }
    pairs.sort((x, y) => y.score - x.score);
    const out = [], usedWords = new Set();
    for (const { a, b, shared } of pairs) {
      if (out.length >= 3) break;
      const key = [a.id, b.id].sort().join('+');
      // the most specific word they share ("slime" over "cave"), then the other side's strongest topic ("boss")
      const word = shared.sort((x, y) => (docFreq.get(x) || 0) - (docFreq.get(y) || 0) || y.length - x.length)[0];
      if (known.has(key) || usedWords.has(word) || known.has('w:' + word)) continue;
      const extra = K.get(b.id).filter(w => !K.get(a.id).includes(w)).concat(K.get(a.id).filter(w => !K.get(b.id).includes(w)))
        .filter(w => w !== word).sort((x, y) => (docFreq.get(y) || 0) - (docFreq.get(x) || 0) || y.length - x.length)[0];
      const title = extra ? `A ${word} ${extra}?` : `More ${word}?`;
      if (known.has('t:' + title.toLowerCase()) || known.has('k:' + titleKey(title))) continue;
      known.add('k:' + titleKey(title));
      usedWords.add(word);
      out.push({ key, word, title, body: `${a.who}'s ${KIND_LABEL[a.kind]} and ${b.who}'s ${KIND_LABEL[b.kind]} both circle "${word}". Put them together: what would ${extra ? `a ${word} ${extra}` : `more ${word}`} look like?`,
        sources: [a, b].map(src) });
    }
    return out;
  }
  const titleKey = t => kw(t).sort().join(' ');   // "A cave boss?" and "A boss cave?" are the same idea
  const src = it => ({ type: (it.ref && it.ref.type) || it.kind, id: (it.ref && it.ref.id) || it.id, label: clip(it.text, 80), who: it.who || '', kind: it.kind, at: it.at });
  async function dreamBrain(pool, known, calls) {
    if (!brainOk() || calls.n <= 0 || pool.length < 2) return null; calls.n--;
    const list = pool.slice(-40).map((it, i) => `${i + 1}. ${it.who || 'someone'} (${KIND_LABEL[it.kind]}): ${clip(it.text, 160)}`).join('\n');
    const outText = await gen(`What the team has been typing and making:\n${list}\n\nFind up to 3 surprising but useful connections between items from DIFFERENT people that could become a feature, a level, a fix or an experiment. Reply with JSON only: [{"title": "<short idea ending with ?>", "why": "<one sentence>", "sources": [<item numbers>]}]`,
      'You are the secretary of a small team of friends building software. You connect ideas across people. Only use the items given. JSON only.', 320);
    if (!outText) return null;
    try {
      const arr = JSON.parse((outText.match(/\[[\s\S]*\]/) || [''])[0]); const slice = pool.slice(-40);
      const ideas = (Array.isArray(arr) ? arr : []).map(x => {
        const s = (Array.isArray(x.sources) ? x.sources : []).map(n => slice[Number(n) - 1]).filter(Boolean);
        const title = clip(String(x.title || ''), 120);
        if (!title || s.length < 2 || new Set(s.map(y => y.who)).size < 2) return null;
        return { key: s.map(y => y.id).sort().join('+'), title, body: clip(String(x.why || ''), 300), sources: s.map(src), by: 'brain' };
      }).filter(x => x && !known.has(x.key) && !known.has('t:' + x.title.toLowerCase()) && !known.has('k:' + titleKey(x.title))).slice(0, 3);
      return ideas.length ? ideas : null;
    } catch { return null; }
  }
  async function dream(p, calls) {
    const now = Date.now();
    const pool = itemsOf(p).filter(it => CREATIVE.has(it.kind) && now - Date.parse(it.at) < 7 * 86400_000 && it.text.length > 12).slice(-120);
    const ideas = ideasOf(p), known = new Set([...ideas.map(i => i.key), ...ideas.map(i => 't:' + i.title.toLowerCase()), ...ideas.map(i => 'k:' + titleKey(i.title)), ...ideas.filter(i => i.word).map(i => 'w:' + i.word)]);
    const fresh = (await dreamBrain(pool, known, calls)) || dreamRules(p, pool, known);
    const made = fresh.map(x => ({ id: 'idea-' + id(6).toLowerCase().replace(/[^a-z0-9]/g, 'x'), at: new Date().toISOString(), status: 'new', by: x.by || 'rules', ...x }));
    if (made.length) saveIdeas(p, [...ideas, ...made]);
    writeInspiration(p);
    return made;
  }
  function writeInspiration(p) {
    const ideas = ideasOf(p).filter(i => i.status !== 'dismissed').slice().reverse();
    const srcLine = s => `${s.who ? s.who + ' · ' : ''}${KIND_LABEL[s.kind] || s.type} \`${s.type}:${String(s.id).slice(0, 40)}\``;
    writeNote(p, 'INSPIRATION.md', `# Inspiration board\n_${(P.get(p) || {}).name || p} · realizations the TribeCode secretary noticed in what people are making. Make one a task or suggest a vote from the Secretary view._\n\n${ideas.length ? ideas.map(i => `## ${i.title}${i.status === 'task' ? ' · task' : i.status === 'vote' ? ' · vote' : ''}\n${i.body}\n\n${i.sources.map(s => `- ${srcLine(s)}: ${s.label}`).join('\n')}\n`).join('\n') : '_No realizations yet._\n'}`);
  }

  // ---------- RESEARCH ----------
  const normQ = q => kw(q).sort().join(' ');
  function addRequest(p, { question, why, by, auto = false, ref = null }) {
    const q = clip(plain(question), 300); if (q.length < 6) throw err(400, 'ask a real question');
    const list = requestsOf(p), n = normQ(q);
    const dup = list.find(r => r.status === 'open' && normQ(r.question) === n); if (dup) return dup;
    const r = { id: 'rq-' + id(6).toLowerCase().replace(/[^a-z0-9]/g, 'x'), at: new Date().toISOString(), by: by || 'secretary', byName: by ? who(by) : 'Secretary', question: q, why: clip(why, 300), status: 'open', auto, ref, findings: [], sources: [] };
    saveRequests(p, [...list, r]);
    broadcast({ type: 'secretary', project: p, what: 'request' });
    return r;
  }
  function fileFindings(p, { request_id, findings, sources }, me) {
    const list = requestsOf(p), r = list.find(x => x.id === String(request_id || ''));
    if (!r) throw err(404, `No research request ${request_id} in this project (secretary_inbox lists them)`);
    if (r.status === 'answered') throw err(409, `${r.id} was already answered by ${r.filedByName}`);
    const f = (Array.isArray(findings) ? findings : String(findings || '').split('\n')).map(x => clip(plain(String(x)).replace(/^[-*•]\s*/, ''), 300)).filter(Boolean).slice(0, 10);
    if (!f.length) throw err(400, 'file at least one finding (short bullets)');
    const s = (Array.isArray(sources) ? sources : sources ? [sources] : []).map(x => clip(String(x), 300)).filter(Boolean).slice(0, 10);
    Object.assign(r, { status: 'answered', findings: f, sources: s, filedBy: me.id, filedByName: me.name, filedAt: new Date().toISOString() });
    saveRequests(p, list);
    addItems(p, [mkItem({ kind: 'research', by: me.id, text: `Research on "${r.question}": ${f.join('; ')}`, ref: { type: 'research', id: r.id } })]);
    journal(p, localDay()); digest(p);   // findings show up in the notes right away
    broadcast({ type: 'secretary', project: p, what: 'research' });
    return r;
  }

  // ---------- ASK (humans, agents, @secretary) ----------
  function corpus(p) {
    const out = [];
    for (const d of days(p).slice(0, 7)) for (const l of readNote(p, `${d}.md`).split('\n')) if (/^\s*[-\d]/.test(l) && l.length > 8) out.push({ text: l.replace(/^\s*[-\d.]+\s*/, ''), src: `journal ${d}` });
    for (const x of digestOf(p).items) out.push({ text: x.text, src: 'digest' });
    for (const i of ideasOf(p)) out.push({ text: `${i.title} ${i.body}`, src: 'inspiration' });
    for (const r of requestsOf(p).filter(r => r.status === 'answered')) for (const f of r.findings) out.push({ text: `${r.question}: ${f}`, src: `research ${r.id}` });
    try { for (const d of docs.list().slice(0, 60)) { out.push({ text: `${d.title}${d.summary ? ': ' + d.summary : ''}`, src: `doc ${d.slug}` }); const full = docs.find(d.slug); if (full) full.body.split('\n').filter(l => l.trim().length > 12).slice(0, 40).forEach(l => out.push({ text: clip(plain(l).replace(/^[#\-*\s]+/, ''), 240), src: `doc ${d.slug}` })); } } catch {}
    try { for (const t of loadTasks().slice(0, 80)) out.push({ text: `Task [${t.status}] ${t.title}${t.assignee ? ' (' + nameOf(t.assignee) + ')' : ''}`, src: `task ${t.id}` }); } catch {}
    return out;
  }
  async function ask(p, question, asker) {
    const q = clip(plain(question), 500); if (!q) throw err(400, 'ask a question');
    const qk = kw(q); const hits = [];
    for (const c of corpus(p)) { const ck = kw(c.text); const s = qk.filter(w => ck.includes(w)).length; if (s) hits.push({ ...c, s }); }
    hits.sort((a, b) => b.s - a.s);
    const top = []; for (const h of hits) { if (top.length >= 6) break; if (!top.some(x => x.text === h.text)) top.push(h); }
    if (!top.length) return { answer: "I don't have anything on that yet. Ask me to research it (\"@secretary research …\") and the team's Claudes will look into it.", sources: [] };
    let answer = null;
    if (brainOk()) answer = await gen(`Notes:\n${top.map(t => `- (${t.src}) ${clip(t.text, 240)}`).join('\n')}\n\nQuestion from ${asker || 'a teammate'}: ${q}\n\nAnswer in at most 3 short sentences, only from the notes. If the notes do not say, say so.`,
      'You are the secretary of a small team building software together. Brief, factual, friendly.', 200);
    if (!answer || answer.length < 3) answer = `From the notes:\n${top.slice(0, 3).map(t => `- ${clip(t.text, 200)} _(${t.src})_`).join('\n')}`;
    return { answer, sources: [...new Set(top.map(t => t.src))] };
  }
  function note(p, text, me) {
    const t = clip(plain(text), 1000); if (!t) throw err(400, 'empty note');
    const it = mkItem({ kind: 'note', by: me.id, text: t }); addItems(p, [it]);
    journal(p, localDay());
    broadcast({ type: 'secretary', project: p, what: 'note' });
    return it;
  }

  // ---------- brain ----------
  const brainOk = () => cfg.useBrain && brain.status().online;
  async function gen(prompt, system, maxTokens) {
    try {
      const r = await Promise.race([brain.generate(prompt, { system, maxTokens, model: cfg.model, timeoutMs: 25_000 }), new Promise(res => setTimeout(() => res(null), 26_000).unref())]);
      return r ? String(r).trim() : null;
    } catch { return null; }
  }

  // ---------- the repo: notes/secretary/ (same rules as the autopilot's context commits) ----------
  const COMMIT_MS = Number(process.env.TRIBE_SECRETARY_COMMIT_MS) || 15 * 60_000;
  const lastCommit = new Map();
  async function toRepo(p) {
    const proj = P.get(p); if (!cfg.repoNotes || !proj || !proj.repo || !fs.existsSync(path.join(proj.repo, '.git'))) return null;
    const hub = hubFor(p); if (!hub) return null;
    const s = hub.settings(), st = hub.status();
    if (!s.autopilot || !s.autopilot.enabled || !s.autopilot.commitContext) return null;   // the host opted in to commits
    if (!st || !st.enabled || st.loading || st.branch !== st.main || st.behind > 0) return null;
    if (Date.now() - (lastCommit.get(p) || 0) < COMMIT_MS) return null;
    lastCommit.set(p, Date.now());
    const G = gitutil(proj.repo), rel = 'notes/secretary', out = path.join(proj.repo, rel);
    return G.locked(async () => {
      fs.mkdirSync(out, { recursive: true });
      const files = [...OUT_FILES, ...days(p).slice(0, 14).map(d => `${d}.md`)];
      for (const f of files) { const t = readNote(p, f); if (t) fs.writeFileSync(path.join(out, f), t); }
      await G.git(['add', '--', rel]);
      if (!(await G.gitTry(['diff', '--cached', '--quiet', '--', rel])).code) return { skipped: true };
      await G.git([...(await G.identity()), 'commit', '--quiet', '-m', 'TribeCode secretary: update notes', '--', rel]);
      if (!st.upstream) return { pushed: false };
      const r = await G.gitTry(['push', '--quiet', 'origin', st.main], proj.repo, { timeout: 60_000 });
      return { pushed: r.code === 0 };
    }).then(r => { if (r && !r.skipped && hub.log) hub.log('commit', `Secretary committed its notes${r.pushed ? ' and pushed them' : ''}`, { notify: false }); return r; })
      .catch(e => { log('secretary commit: ' + e.message); return { error: e.message }; });
  }

  // ---------- the tick ----------
  let running = null, abort = false, lastRun = 0, lastResult = null;
  async function tickProject(p, calls) {
    const t0 = Date.now(), budget = t0 + 4000;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const st = stateOf(p) || { first: true, since, chatAt: since, agentAt: since, taskAt: since, filesAt: Date.now() - 24 * 3600_000, docs: {}, decisions: [], commits: [] };
    st.since = st.since || since;
    const fresh = ingest(p, st, budget); st.first = false;
    addItems(p, fresh);
    // research requests from questions that need looking up (at most two a tick)
    let auto = 0;
    for (const it of fresh) if (auto < 2 && (it.kind === 'chat' || it.kind === 'voice') && RESEARCH_RE.test(it.text) && Q_RE.test(it.text.trim())) { try { addRequest(p, { question: it.text, why: `${it.who} asked in ${KIND_LABEL[it.kind] === 'voice note' ? 'a voice note' : 'chat'}`, auto: true, ref: it.ref }); auto++; } catch {} }
    if (abort) return { project: p, aborted: true };
    let inShort = null;
    if (fresh.length && brainOk() && calls.n > 0) {
      calls.n--;
      const today = itemsOf(p).filter(it => localDay(new Date(it.at)) === localDay()).slice(-60);
      inShort = await gen(`Today in the team:\n${today.map(it => `- ${it.who} (${KIND_LABEL[it.kind]}): ${clip(it.text, 160)}`).join('\n')}\n\nWrite two short sentences: what happened and what matters. Plain text, no preamble, no code.`, 'You are the secretary of a small team of friends building software. Only use facts given.', 120);
      if (inShort && (inShort.length < 10 || /```/.test(inShort))) inShort = null;
    }
    if (abort) return { project: p, aborted: true };
    const ideas = fresh.length || !ideasOf(p).length ? await dream(p, calls) : [];
    journal(p, localDay(), inShort);
    const d = digest(p);
    st.lastTick = new Date().toISOString(); st.inShort = inShort || st.inShort || null;
    saveState(p, st);
    const committed = await toRepo(p);
    broadcast({ type: 'secretary', project: p, what: 'tick' });
    return { project: p, ingested: fresh.length, ideas: ideas.length, requests: auto, digest: d.items.length, ms: Date.now() - t0, committed: committed || null };
  }
  async function tick({ only = null, force = false } = {}) {
    if (running) return running;
    if (!force && (!cfg.enabled || isQuiet())) return { skipped: !cfg.enabled ? 'off' : 'quiet hours' };
    abort = false;
    running = (async () => {
      const calls = { n: 2 };   // local-model calls per tick, across projects
      const out = [];
      for (const p of only ? [only] : P.all().map(x => x.id)) {
        if (abort) break;
        try { out.push(await P.inProject(p, () => tickProject(p, calls))); } catch (e) { log('secretary tick: ' + e.message); out.push({ project: p, error: e.message }); }
      }
      lastRun = Date.now(); lastResult = { at: new Date(lastRun).toISOString(), projects: out };
      return lastResult;
    })().finally(() => { running = null; });
    return running;
  }
  const timer = setInterval(() => { if (cfg.enabled && !running && Date.now() - lastRun >= cfg.everyMin * 60_000 && !isQuiet()) tick().catch(e => log('secretary: ' + e.message)); }, Number(process.env.TRIBE_SECRETARY_CHECK_MS) || 60_000);
  timer.unref();

  // ---------- chat: @secretary ----------
  function onChat(channel, by, text, msg) {
    if (SYS.has(by) || typeof text !== 'string' || !/(^|\s)@secretary\b/i.test(text) || String(channel).startsWith('dm-')) return;
    const proj = channel === 'general' ? P.defaultId() : (P.byChannel(channel) || {}).id; if (!proj) return;
    const me = member(by); if (!me || me.role === 'spectator') return;
    setImmediate(() => P.inProject(proj, async () => {
      const body = text.replace(/(^|\s)@secretary\b[:,]?/ig, ' ').trim();
      const replyTo = { replyTo: { id: msg.id, by, text: clip(text, 160) } };
      try {
        if (!cfg.enabled) return postChat(channel, 'secretary', 'I am off right now. The host can turn me on in Secretary.', replyTo);
        const r = body.match(/^(research|look into|find out)\b[:\s]*(.+)/i);
        if (r) { const q = addRequest(proj, { question: r[2], why: `${me.name} asked in chat`, by: me.id, ref: { type: 'chat', id: msg.id } }); return postChat(channel, 'secretary', `Filed a research request: **${q.question}**. The team's Claudes pick it up with secretary_inbox; findings land in today's notes.`, replyTo); }
        const n = body.match(/^(note|remember|fyi)\b[:\s]*(.+)/i);
        if (n) { note(proj, n[2], me); return postChat(channel, 'secretary', 'Noted. It is in today\'s journal.', replyTo); }
        const a = await ask(proj, body || 'What matters right now?', me.name);
        postChat(channel, 'secretary', a.answer, replyTo);
      } catch (e) { postChat(channel, 'secretary', `Sorry, ${e.message}.`, replyTo); }
    }));
  }

  // ---------- views ----------
  function view(p, me) {
    const host = me.role === 'host', st = stateOf(p) || {};
    const today = localDay(); let j = readNote(p, `${today}.md`);
    const list = days(p);
    return {
      host, canAct: me.role !== 'agent' && me.role !== 'spectator', enabled: cfg.enabled, quiet: isQuiet(), running: !!running, config: host ? publicCfg() : { enabled: cfg.enabled, model: cfg.model, quiet: { ...cfg.quiet } },
      brain: { online: !!brain.status().online, model: cfg.model || brain.status().model || '', models: brain.models() },
      lastTick: st.lastTick || null, inShort: st.inShort || null,
      digest: digestOf(p), journal: { date: j ? today : list[0] || today, md: j || (list[0] ? readNote(p, `${list[0]}.md`) : '') }, days: list.slice(0, 30),
      ideas: ideasOf(p).filter(i => i.status !== 'dismissed').slice().reverse().slice(0, 24),
      requests: requestsOf(p).slice().reverse().slice(0, 40),
      repo: { path: 'notes/secretary/' },
    };
  }
  const brief = () => ({ enabled: cfg.enabled, quiet: isQuiet(), model: cfg.model || brain.status().model || '', lastRun: lastRun ? new Date(lastRun).toISOString() : null, running: !!running });

  async function route(req, res, { m, a, b, c, parts, me, readBody, send, fail }) {
    if (a !== 'secretary') return null;
    const p = pid(), host = me.role === 'host', human = me.role !== 'agent' && me.role !== 'spectator';
    if (m === 'GET' && !b) return send(res, 200, view(p, me));
    if (m === 'GET' && b === 'journal' && c) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c)) return fail(res, 400, 'bad date');
      const md = readNote(p, `${c}.md`); return md ? send(res, 200, { date: c, md }) : fail(res, 404, 'no journal for that day');
    }
    if (b === 'config' && (m === 'PUT' || m === 'PATCH')) {
      if (!host) return fail(res, 403, 'only the host configures the secretary');
      const out = setConfig(await readBody(req));
      return send(res, 200, { config: out });
    }
    if (b === 'tick' && m === 'POST') {
      if (!host) return fail(res, 403, 'only the host runs the secretary');
      return send(res, 200, await tick({ only: p, force: true }));
    }
    if (b === 'ask' && m === 'POST') {
      if (me.role === 'spectator') return fail(res, 403, 'spectators can read the notes but not ask');
      const body = await readBody(req); return send(res, 200, await ask(p, str(body.question, 500), me.name));
    }
    if (!human) return fail(res, 403, me.role === 'agent' ? 'agents use the MCP tools (secretary_inbox, secretary_file, secretary_ask)' : 'spectators are read-only');
    if (b === 'note' && m === 'POST') { const body = await readBody(req); return send(res, 200, { item: note(p, body.text, me) }); }
    if (b === 'requests' && m === 'POST' && !c) { const body = await readBody(req); return send(res, 200, { request: addRequest(p, { question: str(body.question, 300), why: str(body.why, 300), by: me.id }) }); }
    if (b === 'ideas' && c && m === 'POST') {
      const list = ideasOf(p), idea = list.find(x => x.id === c); if (!idea) return fail(res, 404, 'idea not found');
      const action = parts[3];
      const srcText = idea.sources.map(s => `- ${s.who ? s.who + ': ' : ''}${s.label} (${s.type} ${s.id})`).join('\n');
      if (action === 'task') {
        if (idea.task) return send(res, 200, { idea, task: idea.task });
        const t = createTask({ title: idea.title.replace(/\?$/, ''), by: me.id, source: 'secretary', body: `${idea.body}\n\nFrom the secretary's inspiration board. Sources:\n${srcText}` });
        Object.assign(idea, { status: 'task', task: t.id }); saveIdeas(p, list); writeInspiration(p);
        broadcast({ type: 'secretary', project: p, what: 'idea' });
        return send(res, 200, { idea, task: t.id });
      }
      if (action === 'vote') {
        if (!votes) return fail(res, 501, 'votes are not available on this server');
        if (idea.vote) return send(res, 200, { idea, vote: idea.vote });
        let q = idea.title.replace(/\s+/g, ' ').trim(); q = /\?$/.test(q) ? `Should we try: ${q}` : `Should we try: ${q}?`;
        const msg = votes.create('general', me, { question: clip(q, 200), why: clip(idea.body, 300) });
        Object.assign(idea, { status: 'vote', vote: msg.id }); saveIdeas(p, list); writeInspiration(p);
        broadcast({ type: 'secretary', project: p, what: 'idea' });
        return send(res, 200, { idea, vote: msg.id });
      }
      if (action === 'dismiss') { idea.status = 'dismissed'; saveIdeas(p, list); writeInspiration(p); return send(res, 200, { idea }); }
    }
    return null;
  }

  // ---------- MCP (server/mcp-secretary.js) ----------
  const mcp = {
    inbox: () => requestsOf(pid()).filter(r => r.status === 'open').map(r => ({ id: r.id, question: r.question, why: r.why || undefined, askedBy: r.byName, at: r.at })),
    file: (a, me) => fileFindings(pid(), a, me),
    ask: (q, me) => ask(pid(), q, me.name),
  };

  return { route, tick, onChat, mcp, brief, config: publicCfg, setConfig, isQuiet, view, addRequest, ask, ideas: p => ideasOf(p) };   // ideas: the Insights feed (server/insights.js)
};
