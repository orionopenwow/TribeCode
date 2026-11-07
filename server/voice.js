// Huddle captions, meeting transcripts and meeting notes.
// Speech is recognized in each person's browser (Web Speech API); only final caption lines reach the
// server. Captions are opt-in twice over: someone turns them on for the huddle, and each person decides
// whether to share their own captions. Lines go to meetings/<date>-<id>.jsonl. When a captioned huddle
// ends (or someone presses "End & summarize") the local brain writes notes into a "Meeting · …" doc and
// its action items become tasks.
'use strict';
const fs = require('node:fs');

const pad = n => String(n).padStart(2, '0');
const day = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

module.exports = function voice({ store, id, str, huddle, sendTo, broadcast, postChat, createTask, getMembers, nameOf, brain, docs, bus }) {
  fs.mkdirSync(store.p('meetings'), { recursive: true });
  let cap = null;                 // { id, file, on, by, started, sharing:Set, people:Set, lines:number }
  const notes = new Set();        // members capturing their own speech to notes right now (shown to the huddle)

  const state = () => ({ type: 'captions', on: !!(cap && cap.on), by: cap ? cap.by : null, meeting: cap ? cap.id : null,
    sharing: cap && cap.on ? [...cap.sharing] : [], notes: [...notes], lines: cap ? cap.lines : 0 });
  const push = () => broadcast(state());
  const inHuddle = me => huddle.has(me.id);

  function start(me) {
    if (!cap) {
      const now = new Date();
      const mid = `${day(now)}-${id(6).replace(/[^A-Za-z0-9]/g, 'x')}`;
      cap = { id: mid, file: `meetings/${mid}.jsonl`, on: true, by: me.id, started: now.toISOString(), sharing: new Set(), people: new Set(), lines: 0 };
    }
    cap.on = true; cap.by = me.id;
    cap.sharing.add(me.id);        // turning captions on is agreeing to share your own
    postChat('general', 'tribecode', `💬 ${me.name} turned on captions for the huddle. Each person chooses whether to share theirs.`);
  }

  function caption(me, msg) {
    if (!cap || !cap.on || !inHuddle(me) || !cap.sharing.has(me.id)) return;
    const text = str(msg.text, 600); if (!text) return;
    const at = new Date().toISOString();
    const line = { at, by: me.id, name: me.name, text };
    store.appendJSONL(cap.file, line);
    cap.lines++; cap.people.add(me.id);
    for (const [mid] of huddle) sendTo(mid, { type: 'caption', meeting: cap.id, ...line });
  }

  function handle(sock, me, msg) {
    switch (msg.type) {
      case 'voice-sync': sock.send(state()); return true;
      case 'captions':
        if (!inHuddle(me) || me.role === 'spectator') return true;
        if (msg.on) start(me);
        else if (cap && cap.on) { cap.on = false; cap.sharing.clear(); postChat('general', 'tribecode', `${me.name} turned captions off.`); }
        push(); return true;
      case 'caption-share':
        if (!cap || !cap.on || !inHuddle(me)) return true;
        if (msg.on) cap.sharing.add(me.id); else cap.sharing.delete(me.id);
        push(); return true;
      case 'caption': caption(me, msg); return true;
      case 'capture-state':
        if (msg.on) notes.add(me.id); else notes.delete(me.id);
        push(); return true;
      case 'meeting-end':
        if (!inHuddle(me) || !cap) return true;
        finish(me.id).catch(e => console.error('meeting notes', e));
        return true;
    }
    return false;
  }

  // Called whenever the huddle roster changes.
  function huddleChanged() {
    if (cap) for (const mid of [...cap.sharing]) if (!huddle.has(mid)) cap.sharing.delete(mid);
    if (huddle.size === 0 && cap) { finish(null).catch(e => console.error('meeting notes', e)); return; }
    if (cap) push();
  }
  function socketClosed(me, stillOnline) { if (!stillOnline && notes.delete(me.id)) push(); }

  // ---------- meeting notes ----------
  async function finish(byId) {
    const m = cap; cap = null; push();
    if (!m) return null;
    const lines = store.readJSONL(m.file, 5000).filter(l => l && l.text);
    if (!lines.length) return null;
    return buildNotes(m, lines, byId);
  }

  const findMember = name => {
    const n = String(name || '').trim().toLowerCase().replace(/^@/, ''); if (!n) return null;
    const people = getMembers().filter(x => x.role !== 'agent');
    return people.find(x => x.name.toLowerCase() === n) || people.find(x => x.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]) || null;
  };
  // "Maya: ship the save points" / "Maya to ship…" / "Ship X (Maya)" → { owner, title }
  function parseItem(raw) {
    let t = raw.replace(/^\s*(?:[-*]|\d+[.)])\s*(?:\[[ xX]?\]\s*)?/, '').replace(/\*\*/g, '').trim();
    if (!t || /^none\.?$/i.test(t)) return null;
    let owner = null;
    const colon = t.match(/^([^:]{1,40}):\s*(.+)$/);
    if (colon && /^(unassigned|anyone|everyone|team)$/i.test(colon[1].trim())) t = colon[2];
    else if (colon && findMember(colon[1])) { owner = findMember(colon[1]); t = colon[2]; }
    if (!owner) { const paren = t.match(/\(([^)]{1,40})\)\s*\.?$/); if (paren && findMember(paren[1])) { owner = findMember(paren[1]); t = t.slice(0, paren.index).trim(); } }
    if (!owner) for (const x of getMembers()) if (x.role !== 'agent' && new RegExp(`\\b${x.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) { owner = x; break; }
    return { owner, title: t.replace(/\.$/, '').slice(0, 200) };
  }
  function sections(md) {
    const out = {}; let key = null;
    for (const line of String(md).split('\n')) {
      const h = line.match(/^\s*#{1,4}\s*(.+?)\s*:?\s*$/) || line.match(/^\s*\*\*(Summary|Decisions|Action items)\*\*:?\s*$/i);
      if (h) { const k = h[1].toLowerCase(); key = k.startsWith('summ') ? 'summary' : k.startsWith('deci') ? 'decisions' : k.startsWith('action') ? 'actions' : null; if (key) out[key] = []; continue; }
      if (key) out[key].push(line);
    }
    for (const k of Object.keys(out)) out[k] = out[k].join('\n').trim();
    return out;
  }

  async function buildNotes(m, lines, byId) {
    const start = new Date(m.started), end = new Date(lines[lines.length - 1].at);
    const title0 = `Meeting · ${day(start)} ${hm(start)}`;
    let title = title0; for (let n = 2; docs.find(title); n++) title = `${title0} (${n})`;
    const speakers = [...new Set(lines.map(l => l.name))];
    const mins = Math.max(1, Math.round((end - start) / 60000));
    const transcript = lines.map(l => `[${hm(new Date(l.at))}] ${l.name}: ${l.text}`).join('\n');

    let notesMd = null;
    try {
      notesMd = await brain.generate(`Meeting transcript:\n${transcript.slice(-12000)}\n\nPeople in the tribe: ${getMembers().filter(x => x.role !== 'agent').map(x => x.name).join(', ')}\n\n` +
        'Write meeting notes in Markdown with exactly three sections:\n## Summary\n2 to 4 short sentences.\n## Decisions\nOne bullet per decision, or "- None".\n' +
        '## Action items\nOne line per item as "- [ ] Owner: what they will do". Owner is the person\'s name when the transcript says who, otherwise "Unassigned".\nOnly use facts from the transcript.',
        { system: 'You take meeting notes for a small team of friends building software. Be concrete and brief. Never invent decisions or tasks.', maxTokens: 600 });
    } catch { notesMd = null; }

    const sec = notesMd ? sections(notesMd) : null;
    const items = sec && sec.actions ? sec.actions.split('\n').filter(l => /^\s*(?:[-*]|\d+[.)])\s+/.test(l)).map(parseItem).filter(Boolean) : [];
    const made = items.map(it => createTask({ title: it.title, by: byId || m.by, assignee: it.owner ? it.owner.id : null, source: 'meeting', body: `From **${title}** (Docs).` }));

    // Speaker turns: consecutive lines from the same person become one paragraph.
    const turns = [];
    for (const l of lines) { const last = turns[turns.length - 1]; if (last && last.by === l.by) last.text += ' ' + l.text; else turns.push({ by: l.by, name: l.name, at: l.at, text: l.text }); }
    const turnsMd = turns.map(t => `**${t.name}** · ${hm(new Date(t.at))}\n${t.text}`).join('\n\n');

    const head = `**When** ${day(start)} ${hm(start)} to ${hm(end)} · ${mins} min\n**Who spoke** ${speakers.join(', ')}\n**Notes by** ${notesMd ? 'local brain (' + (brain.status().model || 'Ollama') + ')' : 'TribeCode (brain off: raw transcript)'}`;
    let body;
    if (sec && (sec.summary || sec.actions || sec.decisions)) {
      const actionsMd = made.length ? made.map((t, i) => `- [ ] ${items[i].owner ? items[i].owner.name + ': ' : ''}${t.title}`).join('\n') : (sec.actions || '- None');
      body = `${head}\n\n## Summary\n\n${sec.summary || '_No summary._'}\n\n## Decisions\n\n${sec.decisions || '- None'}\n\n## Action items\n\n${actionsMd}\n\n## Transcript\n\n${turnsMd}`;
    } else if (notesMd) {
      body = `${head}\n\n## Summary\n\n${notesMd}\n\n## Transcript\n\n${turnsMd}`;
    } else {
      body = `${head}\n\n## Summary\n\n_The local brain was off, so here is the transcript by speaker. Turn on Ollama on the host to get a summary, decisions and action items._\n\n## Decisions\n\n- \n\n## Action items\n\n- [ ] \n\n## Transcript\n\n${turnsMd}`;
    }
    const r = docs.upsert({ name: title, body, by: byId || m.by });
    const doc = r && r.doc;
    const tasksNote = made.length ? ` · ${made.length} action item${made.length > 1 ? 's' : ''} added to Tasks` : '';
    postChat('general', 'tribecode', `📝 Meeting notes are ready: **${title}**${tasksNote}`);
    bus.notify({ type: 'meeting-notes', priority: 'low', to: 'all', title: 'Meeting notes are ready', body: `${title}${tasksNote}`, view: 'docs', ref: doc ? doc.slug : '' });
    return { doc, tasks: made, transcript: m.file };
  }

  return { handle, huddleChanged, socketClosed, state, finish };
};
