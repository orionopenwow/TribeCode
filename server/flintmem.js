// Flint's memory, skills, project words and drafts (v0.27.1). Flint is TribeCode's own helper; this module gives him
// the parts that need to live on the host:
//   Memory  (.tribe/flint/memory/<person>.json): what each person asked Flint to remember (name, how they like to learn,
//           what they're working on, preferences). Only that person can read or change it; an agent reads and writes
//           its owner's. Never in anyone else's cloud-save copy (server/cloudsave.js) and never in chat.
//   Skills  (.tribe/flint/skills.json): named sequences of Flint commands the tribe saved ("/ship-friday"). Shared with
//           the tribe; builders and up may add them, the author or an admin may change or remove them. A skill only
//           replays Flint commands in the person's own app, so anything outward or costly still asks as usual.
//   Words   GET vocab: the project's own words (from VISION.md, doc titles and headings, task titles) with the line they
//           come from, so Flint knows "batches" are the kombucha batches.
//   Drafts  POST draft { kind: launch|readme|notes|changelog, ask }: Flint writes a real doc in Files from the vision,
//           tasks, decisions and recent chat. Offline from a template; with the tribe's brain, written by the model.
//           Every draft starts with a "Flint draft" line so people review it.
//   GET  /api/flint/memory                -> { notes, style }
//   POST /api/flint/memory                { text, kind? }      add a note (kind: name|style|working|pref|fact)
//   PUT  /api/flint/memory/<id>           { text }             edit;  DELETE /api/flint/memory/<id>  remove
//   DELETE /api/flint/memory              forget everything;   POST /api/flint/memory/style { style } picture|analogy|code|steps
//   GET  /api/flint/skills                -> { skills, canCreate }
//   POST /api/flint/skills                { name, title?, steps: [text] }   PUT/DELETE /api/flint/skills/<id>
//   POST /api/flint/skills/<id>/ran       count a run (the app replays the steps)
//   GET  /api/flint/vocab                 -> { words: [{ term, hint }] }
//   POST /api/flint/draft                 -> { slug, title, basic, via }
'use strict';
const fs = require('fs'), path = require('path');

const STYLES = ['picture', 'analogy', 'code', 'steps'];
const KINDS = ['name', 'style', 'working', 'pref', 'fact'];
const MAX_NOTES = 60, MAX_SKILLS = 80;
const STOP = new Set(('about above after again against all also always and another any are around because been before being below between both but can could did does doing done down during each even every first for from further had has have having her here hers him his how into its itself just like made make many more most much must need next not now off once only other our ours out over own same she should since some still such than that the their them then there these they this those through too under until upon very want was way were what when where which while who whom why will with would you your yours we us it is in on to of a an be by or as at if so do my me i our app project tribe tribecode build built thing things people make makes using use used new one two get got able going good great also just really keep each')
  .split(/\s+/));

module.exports = function flintmem({ base, store, docs, str, nameOf, loadTasks, readVision, recentChat, llm, perms, broadcast = () => {} }) {
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  const owner = me => (me && me.role === 'agent' && me.owner) ? me.owner : me && me.id;
  const memFile = id => `.tribe/flint/memory/${String(id).replace(/[^\w-]/g, '_')}.json`;
  const put = (rel, data) => { try { fs.mkdirSync(path.dirname(base.p(rel)), { recursive: true }); } catch {} base.writeJSON(rel, data); };
  const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // ---------- memory ----------
  function memory(me) {
    const m = base.readJSON(memFile(owner(me)), null) || {};
    return { notes: Array.isArray(m.notes) ? m.notes : [], style: STYLES.includes(m.style) ? m.style : '' };
  }
  function saveMem(me, m) { put(memFile(owner(me)), { notes: m.notes.slice(-MAX_NOTES), style: m.style || '', updated: new Date().toISOString() }); }
  function remember(me, text, kind) {
    const t = clip(String(text || '').replace(/\s+/g, ' ').trim(), 300); if (!t) return { error: 'tell Flint what to remember', status: 400 };
    const m = memory(me), k = KINDS.includes(kind) ? kind : guessKind(t);
    // one name, one "working on": a new one replaces the old
    if (k === 'name' || k === 'working') m.notes = m.notes.filter(n => n.kind !== k);
    if (m.notes.some(n => n.text.toLowerCase() === t.toLowerCase())) return { note: m.notes.find(n => n.text.toLowerCase() === t.toLowerCase()), same: true };
    const note = { id: nid(), text: t, kind: k, at: new Date().toISOString(), by: me.role === 'agent' ? me.id : undefined };
    m.notes.push(note); saveMem(me, m); return { note };
  }
  function guessKind(t) {
    const s = t.toLowerCase();
    if (/^(my name is|call me|i'?m called)\b/.test(s)) return 'name';
    if (/\b(working on|building|making)\b/.test(s)) return 'working';
    if (/\b(pictures?|analog(y|ies)|code examples?|step[- ]by[- ]step)\b/.test(s) && /\b(learn|teach|explain)/.test(s)) return 'style';
    if (/\b(i (like|love|prefer|hate|don'?t like)|prefer|favou?rite)\b/.test(s)) return 'pref';
    return 'fact';
  }
  // the short line Flint gives a model so answers fit the person (only when they ask Flint something)
  function brief(me) {
    const m = memory(me); if (!m.notes.length && !m.style) return '';
    return [`About ${me.name || 'them'} (notes they asked Flint to remember):`, ...m.notes.slice(-12).map(n => `- ${n.text}`), m.style ? `- Likes to learn with ${m.style === 'steps' ? 'step-by-step instructions' : m.style === 'code' ? 'code examples' : m.style === 'analogy' ? 'analogies' : 'pictures'}.` : ''].filter(Boolean).join('\n');
  }

  // ---------- skills (tribe-wide) ----------
  const skills = () => { const s = base.readJSON('.tribe/flint/skills.json', []); return Array.isArray(s) ? s : []; };
  const saveSkills = s => { put('.tribe/flint/skills.json', s.slice(0, MAX_SKILLS)); broadcast({ type: 'flint-skills' }); };
  const canCreate = me => !!me && me.role !== 'agent' && me.role !== 'spectator' && (!perms || !perms.atLeast || perms.atLeast(me, 'builder'));
  const canEdit = (me, sk) => canCreate(me) && (sk.by === me.id || me.role === 'host' || (perms && perms.atLeast && perms.atLeast(me, 'admin')));
  const slugName = s => String(s || '').toLowerCase().replace(/^\/+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  function cleanSteps(steps) {
    return (Array.isArray(steps) ? steps : []).map(x => clip(String(x || '').replace(/\s+/g, ' ').trim(), 200)).filter(Boolean).slice(0, 8);
  }
  function addSkill(me, { name, title, steps }) {
    if (!canCreate(me)) return { error: 'only builders and up can save tribe skills', status: 403 };
    const n = slugName(name || title), st = cleanSteps(steps);
    if (!n) return { error: 'give the skill a short name', status: 400 };
    if (!st.length) return { error: 'a skill needs at least one step', status: 400 };
    if (st.some(x => x.toLowerCase().replace(/^\/+/, '').split(/\s/)[0] === n)) return { error: 'a skill cannot run itself', status: 400 };
    const all = skills(); if (all.some(s => s.name === n)) return { error: `there is already a /${n}`, status: 409 };
    const sk = { id: nid(), name: n, title: clip(title || n.replace(/-/g, ' '), 80), steps: st, by: me.id, at: new Date().toISOString(), runs: 0 };
    all.push(sk); saveSkills(all); return { skill: sk };
  }

  // ---------- the project's own words ----------
  const stem = w => w.replace(/'s$/, '').replace(/(ch|sh|x|ss)es$/, '$1').replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
  function vocab() {
    const vision = readVision() || '';
    let titles = []; try { titles = (docs.list() || []).map(d => d.title); } catch {}
    let tasks = []; try { tasks = loadTasks().map(t => t.title); } catch {}
    const text = [vision, titles.join('\n'), tasks.join('\n')].join('\n');
    const count = new Map();
    for (const w of text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) { const k = stem(w); if (STOP.has(k) || STOP.has(w)) continue; count.set(k, (count.get(k) || 0) + 1); }
    const lines = vision.split(/\n+/).map(s => s.replace(/^[#>*\-\s]+/, '').trim()).filter(s => s.length > 12);
    const sentences = lines.flatMap(l => l.split(/(?<=[.!?])\s+/));
    const words = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([term]) => {
      const rx = new RegExp(`\\b${term}`, 'i'); const hint = sentences.find(s => rx.test(s)) || titles.find(s => rx.test(s)) || tasks.find(s => rx.test(s)) || '';
      return { term, hint: clip(hint, 200) };
    }).filter(w => w.hint);
    return { words };
  }

  // ---------- drafts ----------
  const DRAFT = {
    launch: { title: 'Launch plan', ask: 'a launch plan: what we are launching, who it is for, what is done, what is left, the launch checklist, who does what, and how we will tell people' },
    readme: { title: 'README', ask: 'a README for the project: what it is, how to run it, how to use it, who made it' },
    notes: { title: 'Meeting notes', ask: 'meeting notes from today\'s chat: what was discussed, decisions, action items with owners' },
    changelog: { title: 'Changelog', ask: 'a changelog of what got done recently, newest first, grouped by day' },
  };
  function facts() {
    const vision = clip(readVision() || '', 3000);
    let tasks = []; try { tasks = loadTasks(); } catch {}
    const done = tasks.filter(t => t.status === 'done').slice(-15), open = tasks.filter(t => t.status !== 'done').slice(0, 15);
    let decisions = []; try { decisions = store.listMd('decisions').slice(-8).map(f => { const r = store.readMd(f); return r && (r.meta.title || f.replace(/^.*\/|\.md$/g, '')); }).filter(Boolean); } catch {}
    let chat = []; try { chat = recentChat(60) || []; } catch {}
    return { vision, done, open, decisions, chat };
  }
  function offline(kind, f, me) {
    const today = new Date().toISOString().slice(0, 10);
    const who = t => t.assignee ? ` (${nameOf(t.assignee)})` : '';
    const vl = f.vision.split('\n').map(s => s.trim()).filter(Boolean), visionLine = (vl.find(s => !s.startsWith('#') && s.length > 10) || (vl[0] || '').replace(/^#+\s*/, '') || 'Say what this project is in one sentence.');
    const list = (arr, empty, map) => arr.length ? arr.map(map).join('\n') : empty;
    if (kind === 'readme') return `## What it is\n\n${visionLine}\n\n## Run it\n\nOpen the project's Preview in TribeCode, or open \`index.html\` in a browser.\n\n## What works\n\n${list(f.done, '- (nothing marked done yet)', t => `- ${t.title}`)}\n\n## Coming next\n\n${list(f.open.slice(0, 8), '- (no open tasks)', t => `- ${t.title}${who(t)}`)}\n\n## Made by\n\nThe tribe, in TribeCode.\n`;
    if (kind === 'notes') return `**Date:** ${today}\n\n## What we talked about\n\n${list(f.chat.slice(-12), '- (no chat today)', c => `- ${c.who}: ${clip(c.text, 140)}`)}\n\n## Decisions\n\n${list(f.decisions, '- (none recorded)', d => `- ${d}`)}\n\n## Action items\n\n${list(f.open.slice(0, 8), '- [ ] ', t => `- [ ] ${t.title}${who(t)}`)}\n`;
    if (kind === 'changelog') return `## ${today}\n\n${list(f.done.slice().reverse(), '- (nothing marked done yet)', t => `- ${t.title}${who(t)}`)}\n`;
    return `## What we're launching\n\n${visionLine}\n\n## Who it's for\n\n- \n\n## Done\n\n${list(f.done, '- (nothing marked done yet)', t => `- ${t.title}`)}\n\n## Still to do\n\n${list(f.open.slice(0, 10), '- [ ] ', t => `- [ ] ${t.title}${who(t)}`)}\n\n## Launch checklist\n\n- [ ] The preview works on a phone\n- [ ] Someone outside the tribe tried it\n- [ ] Share link ready\n- [ ] Post written\n\n## Decisions so far\n\n${list(f.decisions, '- (none recorded)', d => `- ${d}`)}\n`;
  }
  async function draft(me, { kind, ask }) {
    if (!me || me.role === 'agent') return { error: 'agents write docs with write_doc', status: 403 };
    if (me.role === 'spectator') return { error: 'spectators can read docs but not write them', status: 403 };
    const k = DRAFT[kind] ? kind : 'launch', D = DRAFT[k], f = facts();
    let body = '', basic = true, via = '';
    try {
      const prompt = `Project facts:\nVision:\n${f.vision || '(none)'}\n\nDone tasks:\n${f.done.map(t => '- ' + t.title).join('\n') || '(none)'}\n\nOpen tasks:\n${f.open.map(t => `- ${t.title}${t.assignee ? ' (' + nameOf(t.assignee) + ')' : ''}`).join('\n') || '(none)'}\n\nDecisions:\n${f.decisions.map(d => '- ' + d).join('\n') || '(none)'}\n\nRecent chat:\n${f.chat.slice(-30).map(c => `${c.who}: ${clip(c.text, 200)}`).join('\n') || '(none)'}\n\nWrite ${D.ask}.${ask ? ' Also: ' + clip(ask, 300) : ''} Use only these facts; leave a short placeholder where something is unknown. Markdown, start with ## headings (no # title).`;
      const out = await llm.stream({ system: 'You are Flint, the built-in helper of TribeCode, writing a clear, short document for a group of friends. Return only Markdown.', prompt, maxTokens: 1800, temperature: 0.3, timeoutMs: 90_000, me });
      const t = String(out.text || '').trim().replace(/^```[a-z]*\s*\n/i, '').replace(/\n```\s*$/, '').replace(/^#\s+.+\n+/, '');
      if (t.length > 40) { body = t; basic = false; via = out.via || ''; }
    } catch {}
    if (!body) body = offline(k, f, me);
    const head = `> ✦ **Flint draft** · ${basic ? 'from your vision, tasks, decisions and chat' : `written with ${via || 'the tribe\'s AI'}`} · review it before you share it.\n\n`;
    const d = docs.create({ title: D.title, body: head + body, by: me.id });
    return { slug: d.slug, title: d.title, basic, via };
  }

  // ---------- routes ----------
  async function route(req, res, { m, b, c, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const d = parts && parts[3];
    if (b === 'memory') {
      if (m === 'GET' && !c) return send(res, 200, memory(me));
      if (m === 'POST' && c === 'style') { const body = await readBody(req); const s = STYLES.includes(body.style) ? body.style : ''; const mm = memory(me); mm.style = s; saveMem(me, mm); return send(res, 200, mm); }
      if (m === 'POST' && !c) { const body = await readBody(req); const r = remember(me, body.text, body.kind); return r.error ? fail(res, r.status, r.error) : send(res, 200, r); }
      if (m === 'PUT' && c) { const body = await readBody(req); const mm = memory(me), n = mm.notes.find(x => x.id === c); if (!n) return fail(res, 404, 'no such note'); const t = clip(String(body.text || '').trim(), 300); if (!t) return fail(res, 400, 'a note needs words'); n.text = t; n.edited = new Date().toISOString(); saveMem(me, mm); return send(res, 200, { note: n }); }
      if (m === 'DELETE' && c) { const mm = memory(me), before = mm.notes.length; mm.notes = mm.notes.filter(x => x.id !== c); if (mm.notes.length === before) return fail(res, 404, 'no such note'); saveMem(me, mm); return send(res, 200, { ok: true }); }
      if (m === 'DELETE' && !c) { saveMem(me, { notes: [], style: '' }); return send(res, 200, { ok: true }); }
    }
    if (b === 'skills') {
      if (m === 'GET' && !c) return send(res, 200, { skills: skills(), canCreate: canCreate(me) });
      if (m === 'POST' && !c) { const r = addSkill(me, await readBody(req)); return r.error ? fail(res, r.status, r.error) : send(res, 200, r); }
      const all = skills(), sk = all.find(x => x.id === c || x.name === c);
      if (!sk) return fail(res, 404, 'no such skill');
      if (m === 'POST' && d === 'ran') { sk.runs = (sk.runs || 0) + 1; sk.last = new Date().toISOString(); put('.tribe/flint/skills.json', all); return send(res, 200, { ok: true }); }
      if (!canEdit(me, sk)) return fail(res, 403, 'only the person who made this skill, or an admin, can change it');
      if (m === 'PUT') { const body = await readBody(req); if (body.title != null) sk.title = clip(body.title, 80) || sk.title; if (body.steps) { const st = cleanSteps(body.steps); if (!st.length) return fail(res, 400, 'a skill needs at least one step'); sk.steps = st; } if (body.name) { const n = slugName(body.name); if (!n) return fail(res, 400, 'bad name'); if (all.some(x => x !== sk && x.name === n)) return fail(res, 409, `there is already a /${n}`); sk.name = n; } saveSkills(all); return send(res, 200, { skill: sk }); }
      if (m === 'DELETE') { saveSkills(all.filter(x => x !== sk)); return send(res, 200, { ok: true }); }
    }
    if (b === 'vocab' && m === 'GET') return send(res, 200, vocab());
    if (b === 'draft' && m === 'POST') { const body = await readBody(req); const r = await draft(me, { kind: str(body.kind, 20), ask: str(body.ask, 500) }); return r.error ? fail(res, r.status, r.error) : send(res, 200, r); }
    return fail(res, 404, 'no such Flint route');
  }

  // ---------- MCP tools (agents act for their owner) ----------
  const text = t => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
  const S = (props, req = []) => ({ type: 'object', properties: props, required: req, additionalProperties: false });
  const mcpTools = {
    flint_remember: {
      description: 'Ask Flint (TribeCode\'s built-in helper) to remember something about the person you work for: their name, how they like to learn, what they are working on, a preference. Only that person can see these notes (Settings › Flint). Without text, returns what Flint already remembers about them.',
      inputSchema: S({ text: { type: 'string', description: 'One short note, e.g. "Camp likes code examples" or "working on the orders page". Leave empty to read the notes.' } }),
      run: ({ text: t }, me) => {
        if (!t) { const mm = memory(me); return text(mm.notes.length ? mm.notes.map(n => `- ${n.text}`).join('\n') + (mm.style ? `\n(likes to learn with ${mm.style})` : '') : 'Flint has no notes about them yet.'); }
        const r = remember(me, t); return r.error ? { content: [{ type: 'text', text: r.error }], isError: true } : text(r.same ? 'Flint already remembers that.' : `Flint will remember: ${r.note.text}`);
      },
    },
    flint_skills: {
      description: 'List the tribe\'s saved Flint skills: named sequences of Flint commands anyone can run by typing /name to Flint (e.g. /ship-friday). Read-only for agents; people save skills in the app.',
      inputSchema: S({}),
      run: () => { const s = skills(); return text(s.length ? s.map(x => `/${x.name}: ${x.title}\n  ${x.steps.map((st, i) => `${i + 1}. ${st}`).join('\n  ')}`).join('\n') : 'No Flint skills yet. In the app, do a few things with Flint and he will offer to save them as a skill.'); },
    },
  };

  return { route, mcpTools, memory, remember, brief, skills, vocab, draft, STYLES };
};
