// Flint's project memory (feat/flint-local): a small list of facts about this project that Flint picks up on this
// device as people work, and uses in his answers, plans and drafts. No model: sentence patterns.
//   names      "we're calling it Ember Run", "the project is called …"
//   dates      "the bake sale is on Saturday 14 June", "launch is next friday", a task or event with a date
//   decisions  "we decided to drop multiplayer", "decision: …", "let's go with …"
//   words      "MVP means the first playable level", "a batch = one brew of kombucha"
//   people     "Maya is our artist", "Sam handles the music"
// Kept WITH the project (server/flintfacts.js -> <project>/.tribe/flint-facts.json; on this device when there is no
// tribe). Everyone in the project can see, edit and delete every fact: "What Flint knows about this project".
// Nothing here is ever sent to an outside service; a local model (tier 2) may be shown the list on this device.
//   extract(text, { now }) -> [{ kind, key, value }]           pure; browser (window.TribeFlintFacts) and Node
//   learn(text, from) · list() · answer(question) -> { text, acts } | null · brief() · open() · scan()
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintFacts = api; })(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const DAY = '(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day)', MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const WHEN = `(?:(?:(?:next|this) )?${DAY}(?:,? (?:the )?\\d{1,2}(?:st|nd|rd|th)?(?: (?:of )?${MON})?)?(?: at \\d{1,2}(?::\\d\\d)? ?(?:am|pm)?)?|(?:the )?\\d{1,2}(?:st|nd|rd|th)? (?:of )?${MON}(?: \\d{4})?|${MON} \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?|tomorrow|next week|next month|\\d{4}-\\d\\d-\\d\\d)`;
  const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\s"'“”]+|[\s"'“”.,;:!]+$/g, '').trim();
  const THING = "((?:the |our |my )?[a-z][\\w' -]{2,40}?)";
  const RULES = [
    ['decision', new RegExp('\\b(?:we(?:\'ve| have)? (?:decided|agreed|chose|settled)(?: on| to| that)?|decision:|decided:|let\'?s go with|we(?:\'re| are) going with|final answer:)\\s+([^.!?\\n]{4,160})', 'i'), m => { const v = clean(m[1]); return { key: v.split(/\s+/).slice(0, 5).join(' '), value: v }; }],
    ['name', /\b(?:[Ww]e(?:'re| are) calling (?:it|this|the (?:project|game|app|site|band|shop))|(?:it|the (?:project|game|app|site|company|band|shop|podcast))(?:'s| is) (?:called|named)|(?:project|working) (?:name|title)(?: is|:))\s+["“]?([A-Z0-9][\w'&-]*(?: [A-Z0-9][\w'&-]*){0,4})/, m => ({ key: 'project name', value: clean(m[1]) })],
    ['date', new RegExp(`\\b${THING} (?:is|are|will be|happens|starts|opens|goes live|ships|launches|is due|is set for|is planned for|is scheduled for)(?: on| at| for| by)? (${WHEN})`, 'i'), m => ({ key: clean(m[1]).replace(/^(?:the|our|my) /i, ''), value: clean(m[2]) })],
    ['date', new RegExp(`\\b(deadline|launch|release|demo|kick-?off|meeting|party|rehearsal)(?: day| date)?(?: is|:)? (?:on |by )?(${WHEN})`, 'i'), m => ({ key: clean(m[1]).toLowerCase(), value: clean(m[2]) })],
    ['term', /(?:^|[.!?]\s+)["“]?([A-Za-z][\w-]{1,24}(?: [\w-]{2,16})?)["”]? (?:means|stands for|is short for|=) ([^.!?\n]{4,140})/, m => ({ key: clean(m[1]), value: clean(m[2]) })],
    ['person', /\b([A-Z][a-z]{1,15})(?: [A-Z][a-z]+)? (?:is (?:our|the|my)|handles|does|owns|runs|is in charge of|looks after|takes care of) ([^.!?\n]{3,80}?)(?= and [A-Z]|[.!?]|$)/, m => (/^(?:It|This|That|There|Here|What|Who|The|Our|My|We|He|She|They)$/.test(m[1]) ? null : { key: clean(m[1]), value: clean(m[2]) })],
  ];
  function extract(text) {
    const out = [], seen = new Set();
    for (const sent of String(text || '').slice(0, 20000).split(/(?<=[.!?])\s+|\n+/)) {
      if (sent.length < 8 || /\?\s*$/.test(sent)) continue;
      for (const [kind, rx, make] of RULES) { const m = rx.exec(sent); if (!m) continue; const f = make(m); if (!f || !f.key || !f.value || f.key.length > 60) continue; const id = kind + '|' + f.key.toLowerCase(); if (seen.has(id)) continue; seen.add(id); out.push({ kind, key: f.key, value: f.value }); break; }
    }
    return out.slice(0, 20);
  }
  const api = { extract, version: 1 };
  if (typeof document === 'undefined') return api;

  // ---------- in the app ----------
  const C = root.TribeClient, KEY = 'tribecode.flintfacts.local', OFF = 'tribecode.flintfacts.off';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const connected = () => !!(C && C.connected && C.connected());
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const paused = () => !!ls.get(OFF, false);
  let cache = null, at = 0, pid = null;
  async function list(force) {
    const p = connected() && C.project ? C.project() : null;
    if (!connected()) return ls.get(KEY, []);
    if (cache && !force && p === pid && Date.now() - at < 20000) return cache;
    try { cache = (await C.api('/flint/facts')).facts || []; at = Date.now(); pid = p; } catch { cache = cache || []; }
    return cache;
  }
  async function add(facts) {
    facts = (facts || []).filter(f => f && f.key && f.value); if (!facts.length) return 0;
    if (connected()) { try { const r = await C.api('/flint/facts', { method: 'POST', body: { facts } }); cache = r.facts || cache; at = Date.now(); return r.saved || 0; } catch { return 0; } }
    const cur = ls.get(KEY, []); let n = 0;
    for (const f of facts) { const o = cur.find(x => x.kind === f.kind && x.key.toLowerCase() === f.key.toLowerCase()); if (o) { if (o.pinned) continue; Object.assign(o, f, { at: new Date().toISOString() }); } else cur.push({ id: 'l' + Date.now().toString(36) + n, ...f, at: new Date().toISOString() }); n++; }
    ls.set(KEY, cur.slice(-200)); return n;
  }
  // what someone just wrote (a Flint command, a chat message they sent, a doc they saved): keep the facts in it
  // "next friday" would go stale: keep the day it meant when it was said
  const pin = f => { if (f.kind !== 'date' || /\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?[a-z]{3}|[a-z]{3,9}\s+\d{1,2}/i.test(f.value) || !root.TribeNLU) return f; try { const w = root.TribeNLU.parseWhen(f.value, new Date()); if (w && w.date) return { ...f, value: `${f.value} (${w.date})` }; } catch {} return f; };
  async function learn(text, from) { if (paused()) return 0; const f = extract(text).map(x => ({ ...pin(x), from: from || '' })); return f.length ? add(f) : 0; }
  async function edit(id, patch) { if (connected()) { await C.api('/flint/facts/' + encodeURIComponent(id), { method: 'PUT', body: patch }); return list(true); } const cur = ls.get(KEY, []); const f = cur.find(x => x.id === id); if (f) Object.assign(f, patch, { pinned: true }); ls.set(KEY, cur); return cur; }
  async function remove(id) { if (connected()) { await C.api('/flint/facts/' + encodeURIComponent(id), { method: 'DELETE' }); return list(true); } const cur = ls.get(KEY, []).filter(x => x.id !== id); ls.set(KEY, cur); return cur; }
  async function clear() { if (connected()) { await C.api('/flint/facts', { method: 'DELETE' }); cache = []; return []; } ls.set(KEY, []); return []; }
  // read what is already in the project (docs, tasks, recent chat) on this device and keep its facts
  async function scan() {
    if (!connected()) return 0; let text = [];
    try { for (const d of ((await C.api('/docs')).docs || []).slice(0, 30)) { text.push([`${d.title || ''}. ${d.summary || ''}`, 'a doc']); try { const full = await C.api('/docs/' + encodeURIComponent(d.slug)); text.push([String((full.doc || full).body || '').slice(0, 6000), d.title || 'a doc']); } catch {} } } catch {}
    try { for (const t of ((await C.api('/tasks')).tasks || []).slice(0, 80)) if (t.due) text.push([`${t.title} is due ${t.due}.`, 'a task']); } catch {}
    try { for (const m of ((await C.api('/chat/general')).messages || []).filter(x => !x.deleted && x.text && x.by !== 'tribecode').slice(-150)) text.push([m.text, 'chat']); } catch {}
    const facts = []; for (const [t, from] of text) for (const f of extract(t)) facts.push({ ...f, from });
    return add(facts.slice(0, 40));
  }
  const brief = () => { const f = (connected() ? cache : ls.get(KEY, [])) || []; return f.length ? '\n\nProject facts:\n' + f.slice(-30).map(x => `- ${x.kind}: ${x.key} = ${x.value}`).join('\n') : ''; };
  // "when is the bake sale?", "what did we decide about multiplayer?", "what does MVP mean?", "what's the project called?"
  const Q = [[/^(?:when(?:'s| is| are| was)|what (?:day|date|time) is)\s+(?:the |our |my )?(.+?)\??$/i, ['date']], [/^what did we (?:decide|agree)(?: on| about| for)?\s*(.*?)\??$/i, ['decision']],
    [/^what (?:does|is|are)\s+(?:an? |the )?(.+?)(?: mean| stand for)?\??$/i, ['term', 'name']], [/^who(?:'s| is| does| handles| owns)\s+(?:the |our )?(.+?)\??$/i, ['person']], [/^what(?:'s| is) (?:the |our )?(project|game|app|site)(?:'s)? (?:called|name[d]?)\??$/i, ['name']]];
  async function answer(text) {
    const t = String(text || '').trim(); let hit = null;
    for (const [rx, kinds] of Q) { const m = rx.exec(t); if (m) { hit = { q: (m[1] || '').toLowerCase().replace(/[?.!]+$/, '').trim(), kinds }; break; } }
    if (!hit) return null;
    const facts = (await list()).filter(f => hit.kinds.includes(f.kind)); if (!facts.length) return null;
    const SM = root.TribeFlintSem, words = s => (SM ? SM.concepts(s) : String(s).toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const qw = new Set(words(hit.q)); if (hit.kinds[0] === 'name' && /project|game|app|site/.test(hit.q)) return { text: `It’s called ${facts[facts.length - 1].value}. (From what I know about this project.)`, acts: [['What Flint knows', 'flintfacts', '']] };
    let best = null, bs = 0;
    for (const f of facts) { const fw = new Set(words(`${f.key} ${hit.kinds[0] === 'person' || hit.kinds[0] === 'decision' ? f.value : ''}`)); let n = 0; qw.forEach(w => { if (fw.has(w)) n++; }); const s = qw.size ? n / qw.size : 0; if (s > bs) { bs = s; best = f; } }
    if (!best || bs < 0.5) { if (hit.kinds[0] === 'decision' && !hit.q) return { text: `Decisions I know of: ${facts.slice(-5).map(f => f.value).join(' · ')}.`, acts: [['What Flint knows', 'flintfacts', '']] }; return null; }
    const say = best.kind === 'date' ? `${best.key.charAt(0).toUpperCase() + best.key.slice(1)}: ${best.value}.` : best.kind === 'decision' ? `You decided: ${best.value}.` : best.kind === 'person' ? `${best.key}: ${best.value}.` : `${best.key}: ${best.value}.`;
    return { text: `${say} (From what I know about this project${best.from ? `, picked up from ${best.from}` : ''}.)`, acts: [['What Flint knows', 'flintfacts', '']] };
  }

  // ---------- "What Flint knows about this project" ----------
  const LABEL = { name: 'Names', date: 'Dates', decision: 'Decisions', term: 'Words', person: 'People', link: 'Links', fact: 'Other' };
  let sheet = null, lastFocus = null;
  function close() { if (!sheet) return; sheet.remove(); sheet = null; if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch {} }
  async function open() {
    lastFocus = document.activeElement; if (sheet) sheet.remove();
    sheet = document.createElement('div'); sheet.id = 'flint-facts'; sheet.className = 'fmd ffx'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'What Flint knows about this project');
    document.body.appendChild(sheet); sheet.onclick = e => { if (e.target === sheet) close(); }; sheet.onkeydown = e => { if (e.key === 'Escape') close(); };
    await draw();
  }
  async function draw(note) {
    if (!sheet) return; const facts = await list(true); if (!sheet) return;
    const groups = Object.keys(LABEL).map(k => [k, facts.filter(f => f.kind === k)]).filter(([, l]) => l.length);
    sheet.innerHTML = `<div class="fmd-card ffx-card">
      <header class="fmd-head"><div><span class="eyebrow">Flint · project memory</span><h2>What Flint knows about this project</h2></div><button type="button" class="btn ghost" id="ffx-x" aria-label="Close">✕</button></header>
      <p class="fmd-lead">Names, dates, decisions and words I picked up as you worked. I use them in answers, plans and drafts. They are kept with the project${connected() ? '' : ' on this device'} and never sent anywhere. Change or remove anything.</p>
      ${groups.length ? groups.map(([k, l]) => `<section class="ffx-grp" aria-label="${LABEL[k]}"><h3 class="eyebrow">${LABEL[k]} <span class="faint">${l.length}</span></h3><ul class="ffx-list">${l.map(f => `<li class="ffx-row" data-id="${esc(f.id)}"><input class="input ffx-k" value="${esc(f.key)}" aria-label="What"><input class="input ffx-v" value="${esc(f.value)}" aria-label="Value"><button type="button" class="btn ghost sm" data-ffx-del aria-label="Forget ${esc(f.key)}" title="Forget this">✕</button>${f.from ? `<small class="ffx-from">from ${esc(f.from)}</small>` : ''}</li>`).join('')}</ul></section>`).join('')
        : '<p class="faint ffx-none" id="ffx-none">Nothing yet. Say something like “the bake sale is on Saturday 14 June” or “we decided to drop multiplayer”, or let me read the project.</p>'}
      <form class="ffx-add" id="ffx-add" autocomplete="off"><label for="ffx-new">Tell me a fact</label><div class="fmd-row"><input class="input" id="ffx-new" placeholder="The demo is on Friday · MVP means the first level"><button class="btn sm">Remember</button></div></form>
      ${note ? `<p class="fmd-hint" id="ffx-note" role="status">${esc(note)}</p>` : ''}
      <div class="fmd-acts"><button type="button" class="btn sm" id="ffx-scan"${connected() ? '' : ' disabled'}>Read the project now</button><button type="button" class="btn sm" id="ffx-pause" role="switch" aria-checked="${!paused()}">${paused() ? 'Paused: start noticing again' : 'Stop noticing new facts'}</button>${facts.length ? '<button type="button" class="btn ghost sm" id="ffx-clear">Forget everything</button>' : ''}<button type="button" class="btn ghost sm" id="ffx-done">Done</button></div>
    </div>`;
    const $ = s => sheet.querySelector(s);
    $('#ffx-x').onclick = close; $('#ffx-done').onclick = close;
    $('#ffx-scan').onclick = async () => { $('#ffx-scan').disabled = true; $('#ffx-scan').textContent = 'Reading…'; const n = await scan(); draw(n ? `Picked up ${n} fact${n === 1 ? '' : 's'} from the docs, tasks and chat.` : 'I read the docs, tasks and chat and found nothing new.'); };
    $('#ffx-pause').onclick = () => { ls.set(OFF, !paused()); draw(paused() ? 'Paused. I keep what is here and notice nothing new.' : 'Noticing again.'); };
    if ($('#ffx-clear')) $('#ffx-clear').onclick = async () => { await clear(); draw('Forgotten.'); };
    $('#ffx-add').onsubmit = async e => { e.preventDefault(); const v = $('#ffx-new').value.trim(); if (!v) return; let f = extract(v); if (!f.length) { const m = /^(.+?)\s*(?:=|:| is | are )\s*(.+)$/.exec(v); f = [{ kind: 'fact', key: m ? m[1].trim() : v.split(/\s+/).slice(0, 4).join(' '), value: m ? m[2].trim() : v }]; } await add(f.map(x => ({ ...x, from: 'you' }))); draw('Got it.'); };
    sheet.querySelectorAll('.ffx-row').forEach(row => {
      const id = row.dataset.id, k = row.querySelector('.ffx-k'), v = row.querySelector('.ffx-v');
      const save = async () => { try { await edit(id, { key: k.value.trim(), value: v.value.trim() }); } catch {} };
      k.onchange = save; v.onchange = save;
      row.querySelector('[data-ffx-del]').onclick = async () => { await remove(id); draw(); };
    });
    setTimeout(() => { const i = sheet && sheet.querySelector('#ffx-new'); if (i) i.focus(); }, 30);
  }
  // as people work: a chat message you send and a doc you save are read here, on this device
  document.addEventListener('submit', e => { try { const f = e.target; if (f && f.id === 'chat-form') { const i = f.querySelector('#chat-input'); if (i && i.value) learn(i.value, 'chat'); } } catch {} }, true);
  document.addEventListener('tribe:doc-saved', e => { try { if (e.detail && e.detail.body) learn(e.detail.body, e.detail.title || 'a doc'); } catch {} });
  return { ...api, list, add, learn, edit, remove, clear, scan, brief, answer, open, close, paused };
});
