// Flint: TribeCode's built-in helper (the thing you strike to start a campfire: it lives in the room and gets things going).
// Desktop: a compact "Ask Flint…" bar pinned at the bottom of the right panel, with a short thread above it that opens
// upward (at most ~45% of the panel) and folds. Phones: a full-screen thread, opened from "Talk to…" (mobile2.js).
// With no model at all it runs a deterministic intent router (connect Claude, guide answers, notes, tasks, invites,
// hosting, navigation, find, room status, helper toggles). With a brain (Settings › Flint's brain, brainpick.js): the
// built-in model in this browser (WebLLM), or the tribe's brain on the host (server/flint.js → server/llm.js: the host's
// cloud key or Ollama),
// messages no intent matched go to the model and the reply streams in. Nothing leaves this machine.
// The thread is remembered per device (localStorage).
// Public: window.TribeFlint = { focus(), openFull(), closeFull(), ask(text), thread(), clear(), status() }.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp, Hub = () => window.TribeHub, PJ = () => window.TribeProjects;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => App() && App().toast ? App().toast(m) : null;
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const KEY = 'tribecode.flint.thread', OPEN = 'tribecode.flint.open', MAX = 40;
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const connected = () => !!(C && C.connected && C.connected());
  const first = n => String(n || '').split(/\s+/)[0];
  const ago = iso => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return !isFinite(s) ? '' : s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };

  // Flint's face: the mascot, the logo's flame with blinking pixel eyes (assets/flint.svg, scripts/icon.js), drawn once
  // into the page's icon sprite so every #i-flint shows him (the Helpers row, the ? menu, the phone Talk to… row).
  const GLYPH = '<image href="assets/flint.svg" x="1" y="0" width="22" height="24" preserveAspectRatio="xMidYMid meet" style="image-rendering:pixelated"/>';
  (function sprite() {
    const host = document.querySelector('svg symbol') && document.querySelector('svg symbol').parentNode; if (!host || document.getElementById('i-flint')) return;
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'symbol'); s.id = 'i-flint'; s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = GLYPH; host.appendChild(s);
  })();
  const flintIco = (sz = 16) => `<img class="fl-face" src="assets/flint.svg" alt="" width="${Math.round(sz * 1.3)}" height="${Math.round(sz * 1.3)}" aria-hidden="true">`;
  const ico = (id, sz = 16) => `<svg class="i" style="width:${sz}px;height:${sz}px" aria-hidden="true"><use href="#${id}"/></svg>`;
  const SEND = '<svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  // ---------- state ----------
  let thread = (ls.get(KEY, []) || []).filter(m => m && m.text != null).slice(-MAX);
  let model = { online: false, model: '' }, busy = false;
  const save = () => ls.set(KEY, thread.slice(-MAX).map(m => ({ who: m.who, text: m.text, acts: m.acts || [], at: m.at, link: m.link, ...(m.via ? { via: m.via } : {}) })));
  const B = () => window.TribeBrain;   // feat/any-llm: Flint's brain (built in / host / none)
  function push(who, text, acts, extra) { const m = { who, text: String(text || ''), acts: acts || [], at: new Date().toISOString(), ...(extra || {}) }; thread.push(m); thread = thread.slice(-MAX); save(); draw(); return m; }
  const say = (text, acts, extra) => push('flint', text, acts, extra);

  // ---------- actions (stored by name so buttons still work after a reload) ----------
  const ACTS = {
    connect: () => App() && App().connectClaude && App().connectClaude(),
    brain: () => (B() ? B().open() : ACTS.guide('agents-and-office')),
    guide: slug => window.TribeGuide && window.TribeGuide.open(slug || undefined),
    note: id => { if (Hub() && Hub().openNote) Hub().openNote(id); else if (Hub()) Hub().open('docs'); },
    newnote: () => { const b = $('#room-note-new'); if (b) b.click(); else if (Hub()) Hub().open('docs'); },
    nav: v => { if (v === 'hub') return Hub() ? Hub().open('home') : App().show('hub'); if (v === 'guide') return ACTS.guide(); if (v === 'settings') return window.TribeSettings && window.TribeSettings.open(); App().show(v); },
    invite: () => App() && App().openInvite(),
    host: () => App() && (App().hostHere ? App().hostHere() : App().openInvite()),
    stophost: () => App() && App().setHosting && App().setHosting(false),
    secretary: () => window.TribeSecretary && window.TribeSecretary.open(),
    repo: () => App().show('repo'),
    model: () => (B() ? B().open() : ACTS.guide('agents-and-office')),
    agents: () => window.TribeAgentsHub && window.TribeAgentsHub.open(),
    doc: ref => { const [pid, slug] = String(ref).split('|'); const open = () => { App().show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.open && window.TribeDocs.open(slug), 120); }; if (pid && PJ() && PJ().current && PJ().current() !== pid && PJ().switchTo) { PJ().switchTo(pid, 'docs'); setTimeout(open, 400); } else open(); },
    search: q => { if (!window.TribePalette) return; window.TribePalette.open(); const i = $('#pal-input'); if (i) { i.value = q || ''; i.dispatchEvent(new Event('input', { bubbles: true })); } },
    ask: text => send(text),
    website: () => (window.TribeShell ? window.TribeShell.go('website') : window.TribeWebsite && window.TribeWebsite.open()),   // feat/customize
    customize: tab => window.TribeLook && window.TribeLook.open(tab || 'tribe'),
  };
  const act = (label, name, arg) => ({ label, act: name, arg: arg == null ? '' : String(arg) });

  // ---------- the Guide (server/guide.js) ----------
  let guidePages = null;
  async function pages() {
    if (guidePages) return guidePages;
    try { const r = await fetch((C ? C.base() : '') + '/api/guide'); if (r.ok) guidePages = (await r.json()).pages || []; } catch {}
    return guidePages || [];
  }
  const STOP = new Set('a an the i me my we our you your to of in on at for and or is are be do does did how what why where when can could should would will with it this that there here it\'s im i\'m get use using work works working about tell show please flint help guide explain'.split(' '));
  const stem = w => w.replace(/'s$/, '').replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '') || w;
  const words = q => String(q).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w) && w.length > 1).map(stem);
  const plain = s => String(s).replace(/```[\s\S]*?```/g, ' ').replace(/^#+\s*/gm, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s*[-*]\s+/gm, '').replace(/\s+/g, ' ').trim();
  async function guideSearch(q) {
    const ws = words(q); if (!ws.length) return null;
    let best = null;
    for (const p of await pages()) {
      const title = p.title.toLowerCase(), tHits = ws.filter(w => title.includes(w)).length;
      let heading = '';
      for (const block of String(p.body || '').split(/\n\s*\n/)) {
        const h = /^#{1,3}\s+(.+)$/m.exec(block); if (h) heading = h[1];
        const text = plain(block); if (text.length < 30 || /^#/.test(block.trim()) && text.length < 60) continue;
        const low = (heading + ' ' + text).toLowerCase();
        const hits = ws.filter(w => low.includes(w)).length; if (!hits) continue;
        const score = hits * 2 + tHits * 3 + (hits === ws.length ? 2 : 0);
        if (!best || score > best.score) best = { score, page: p, heading, text };
      }
    }
    if (!best || best.score < 4) return null;
    const snip = best.text.length > 240 ? best.text.slice(0, 238).replace(/\s+\S*$/, '') + '…' : best.text;
    return { slug: best.page.slug, title: best.page.title, heading: best.heading, snippet: snip, score: best.score };
  }

  // ---------- the room, from data the client already has ----------
  async function room() {
    const st = C ? C.state() : {}, meId = st.me && st.me.id;
    const ms = (st.members || []).filter(m => m.online);
    const people = ms.filter(m => m.role !== 'agent' && m.role !== 'spectator'), agents = ms.filter(m => m.role === 'agent');
    let tasks = [];
    if (connected()) { try { tasks = (await C.api('/tasks')).tasks || []; } catch {} }
    const open = tasks.filter(t => t.status !== 'done');
    const feed = (Hub() && Hub().data && Hub().data() && Hub().data().feed) || [];
    const commit = feed.find(x => x.kind === 'commit');
    const cur = PJ() && PJ().cur && PJ().cur();
    return { meId, people, agents, open, commit, project: cur && cur.name, mine: open.filter(t => t.assignee && t.assignee === meId) };
  }
  const roomText = r => [r.project ? `Project: ${r.project}` : '', `Online: ${r.people.map(p => p.name).join(', ') || 'nobody'}${r.agents.length ? `; agents: ${r.agents.map(a => a.name).join(', ')}` : ''}`,
    `Open tasks (${r.open.length}): ${r.open.slice(0, 8).map(t => t.title).join('; ') || 'none'}`, r.commit ? `Last commit: ${r.commit.title}${r.commit.byName ? ` by ${r.commit.byName}` : ''}` : ''].filter(Boolean).join('\n');

  // ---------- intents ----------
  const RX = {
    status: /^(what'?s|whats|what is)\s+(new|up|happening|going on)\b|^(status|catch me up|any news|news)\b|\bwho'?s (online|here|around)\b|^what('?s| is) the status/,
    summarize: /\bsummar(y|ise|ize)\b.*\b(chat|conversation|messages|today)\b|^summar(y|ise|ize)$|^tl;?dr\b/,
    helper: /\b(turn|switch|start|stop|enable|disable)\b.*\b(secretary|local model|ollama|brain|qwen|autopilot|auto-pilot)\b|\b(secretary|local model|autopilot)\s+(on|off)\b/,
    connect: /\b(connect|turn on|hook up|link|set ?up|add)\b.*\b(claude|codex|gemini|cursor|my ai|an agent|agent)\b|^claude( code)?$/,
    hosting: /\b(start|stop|turn (on|off)|begin|end)\s+(the\s+)?host(ing)?\b|^host( here| a tribe| on this computer)?$/,
    note: /^(?:please\s+)?(?:capture|note|remember|jot(?:\s+down)?|write down|save)(?:\s+(?:a|this|the|that))?(?:\s+note)?(?:\s*(?::|-|,|that)\s*|\s+|$)([\s\S]*)$/,
    task: /^(?:please\s+)?(?:add|new|make|create)?\s*(?:a\s+)?(?:task|todo|to-do)(?:\s*(?::|-|,)\s*|\s+)([\s\S]+)$/,
    nav: /^(?:open|go to|goto|show(?: me)?|take me to|switch to)\s+(?:the\s+|my\s+)?(files|docs|documents|tasks|board|chat|home|repo|guide|settings|calendar)\b/,
    find: /^(?:find|search(?: for)?|look for|where(?:'s| is))\s+(.+)$/,
    help: /^(how|what|why|where|when|can i|could i|help|guide|explain|is there|do i)\b|\?$/,
    invite: /\binvite\b|\badd (a )?friend\b|\bshare (the|a) link\b/,
    hello: /^(hi|hey|hello|yo|hiya|good (morning|afternoon|evening))\b|^(thanks|thank you|thx|cheers)\b/,
    website: /\b(make|build|generate|create|design|redo|refresh|write|shuffle)\b.*\b(web ?site|home ?page|landing page|site)\b|^(our |the )?web ?site$/,   // feat/customize
    customize: /\b(customi[sz]e|change|pick|set)\b.*\b(background|accent|look|banner|font size|density)\b|^customi[sz]e\b/,
  };

  async function route(raw) {
    const text = String(raw || '').trim().replace(/\s+/g, ' '), t = text.toLowerCase();
    let m;
    if (RX.status.test(t)) return status();
    if (RX.summarize.test(t)) return summarize();
    if (RX.helper.test(t)) return helper(t);
    if (RX.connect.test(t)) { ACTS.connect(); return say('Let\'s get your AI into the room: Claude Code, Codex, Gemini CLI, Cursor or any MCP tool. I opened the connect steps: one command or one config on your computer and it joins.', [act('Show the steps again', 'connect'), act('How it works', 'guide', 'connect-claude-code')]); }
    if (RX.hosting.test(t)) return hosting(t);
    if (RX.website.test(t)) return website(t);   // feat/customize: "make our website"
    if (RX.customize.test(t)) { ACTS.customize(/\b(banner|this project)\b/.test(t) ? 'project' : 'tribe'); return say('I opened Customize: accent, background, spacing, font size and the tribe\'s name and icon. "Just me" changes only your view.', [act('Open Customize again', 'customize')]); }
    if ((m = RX.task.exec(t)) && m[1].trim()) return task(text.slice(text.length - m[1].length).trim());
    if ((m = RX.note.exec(t))) return note(text.slice(text.length - m[1].length).trim());
    if ((m = RX.nav.exec(t))) { const map = { files: 'docs', docs: 'docs', documents: 'docs', tasks: 'tasks', board: 'tasks', chat: 'chat', home: 'hub', repo: 'repo', guide: 'guide', settings: 'settings', calendar: 'calendar' }, v = map[m[1]];
      // Flint flies to the place in the sidebar first, so you learn where it lives, then opens it
      const ROW = { docs: '#nest-docs', tasks: '#nest-ws-tasks', chat: '#nest-chat', hub: '#rail-logo', repo: '#pin-repo .nest-row', settings: '#ub-gear', calendar: '#nest-extra [data-wkey="calendar"]' }, row = ROW[v] && document.querySelector(ROW[v]);
      const NAME = { docs: 'Files', tasks: 'Task Board', chat: 'Messages', hub: 'Home', repo: 'Repo', settings: 'Settings', calendar: 'Calendar' };
      if (row && row.offsetParent && window.TribeFlintGuide && !matchMedia('(max-width: 820px)').matches) window.TribeFlintGuide.point(row, `${NAME[v] || m[1]} lives here. Opening it for you.`, { next: 'Thanks' });
      ACTS.nav(v); return say(`Opened ${m[1] === 'home' ? 'Home' : m[1]}.`); }
    if ((m = RX.find.exec(t)) && !RX.help.test(t.replace(/^where('s| is)/, ''))) return find(text.slice(text.length - m[1].length).trim());
    if (RX.help.test(t) || /\b(guide|how do i|how to)\b/.test(t)) { const g = await guideSearch(text); if (g) return guideReply(g); if (RX.invite.test(t)) return invite(); return fallback(text, true); }
    if (RX.invite.test(t)) return invite();
    if (RX.hello.test(t)) return /^(thanks|thank you|thx|cheers)/.test(t) ? say('Any time.') : say(`Hi${C && C.state().me ? ' ' + esc(first(C.state().me.name)) : ''}. I can connect your Claude, jot a note, add a task or tell you what's happening.`, chipsActs());
    return fallback(text);
  }
  const chipsActs = () => [act('Connect my Claude', 'ask', 'Connect my Claude'), act('What\'s happening?', 'ask', 'What\'s happening?')];
  const guideReply = g => say(`${g.heading && g.heading !== g.title ? `${g.title} › ${g.heading}: ` : `${g.title}: `}${g.snippet}`, [act('Open in Guide', 'guide', g.slug)], { guide: g.slug });

  async function note(body) {
    if (!body) return say('What should I write down? Say "note: …", or start a blank one.', [act('Start a blank note', 'newnote')]);
    const S = Hub() && Hub().scratch; if (!S) return say('Notes are not ready yet. Try again in a moment.');
    body = body.replace(/^(that|to)\s+/i, (x, w) => (w.toLowerCase() === 'to' ? 'To ' : ''));
    try { const id = await S.create(body.charAt(0).toUpperCase() + body.slice(1)); return say(`Saved to your notes: “${body}”.`, id ? [act('Open note', 'note', id)] : [], { link: id ? 'note:' + id : '' }); }
    catch (e) { return say('I could not save that note: ' + e.message); }
  }
  async function task(title) {
    if (!connected()) return say('Tasks live in a tribe. Host one on this computer or join a friend, then ask me again.', [act('Host or join', 'invite')]);
    title = title.charAt(0).toUpperCase() + title.slice(1);
    try { const { task: tk } = await C.api('/tasks', { method: 'POST', body: { title: title.slice(0, 200) } }); const p = PJ() && PJ().cur && PJ().cur();
      return say(`Added to Tasks${p ? ` in ${p.name}` : ''}: “${tk.title}”.`, [act('Open Tasks', 'nav', 'tasks')], { link: 'task:' + tk.id }); }
    catch (e) { return say('I could not add that task: ' + e.message); }
  }
  // feat/customize: the site generator (server/sitegen.js). A draft only; the host or the project lead publishes.
  async function website(t) {
    if (!connected()) return say('Websites belong to a project. Host or join a tribe first.', [act('Host or join', 'invite')]);
    const pid = PJ() && PJ().current && PJ().current(); if (!pid) return say('Open a project first, then ask me again.');
    const how = /\b(shuffle|another|different|new layout)\b/.test(t) ? 'shuffle' : /\b(redo|refresh|regenerate)\b/.test(t) ? 'regenerate' : 'generate';
    try {
      const r = await C.api(`/projects/${encodeURIComponent(pid)}/website/gen`, { method: 'POST', body: { how } });
      const G = r.website.gen, L = (G.layouts.find(x => x.id === G.draft.layout) || {}).name || 'a';
      ACTS.website();
      return say(`Here's a draft in the ${L} layout, filled from the bio, vision, screenshots, commits and team. Nothing is live yet${G.canPublish ? ': press Publish when you like it' : ': the host or the project lead publishes it'}.`,
        [act('Open Website', 'website'), act('Another layout', 'ask', 'Shuffle our website layout')]);
    } catch (e) { return say('I could not make the draft: ' + e.message); }
  }
  function invite() { ACTS.invite(); return say(connected() ? 'Here\'s your invite. Send the link to a friend: they tap it, type a name, and they\'re in.' : 'Invites come from a tribe. Host one on this computer first, then invite friends.', [act('Open invite again', 'invite'), act('How invites work', 'guide', 'projects-and-invites')]); }
  function hosting(t) {
    const desk = !!(window.TribeHost && window.TribeHost.isDesktop);
    if (/\b(stop|turn off|end)\b/.test(t)) return desk ? say('Stop hosting on this computer? Friends lose the room until you start again. Nothing is deleted.', [act('Stop hosting', 'stophost')]) : say('Hosting runs in the desktop app on the host\'s computer. Stop it there.', [act('About hosting', 'guide', 'hosting')]);
    if (connected() && C.hasToken()) return say('You\'re already in a tribe. Want to invite someone?', [act('Invite a friend', 'invite')]);
    if (desk) { ACTS.host(); return say('Starting your tribe on this computer…', [act('About hosting', 'guide', 'hosting')]); }
    return say('Hosting runs in the TribeCode desktop app. On a phone or browser, join a friend\'s tribe with their link.', [act('About hosting', 'guide', 'hosting')]);
  }
  async function helper(t) {
    const off = /\b(stop|off|disable)\b|turn\s+off|switch\s+off/.test(t), on = !off;
    if (/secretary/.test(t)) {
      if (!connected()) return say('The Secretary runs on the tribe host. Host or join a tribe first.', [act('Host or join', 'invite')]);
      try { await C.api('/secretary/config', { method: 'PUT', body: { enabled: on } }); return say(on ? 'The Secretary is on. It turns chat, voice notes and files into a journal and ideas.' : 'The Secretary is off.', [act('Open Secretary', 'secretary')]); }
      catch (e) { ACTS.secretary(); return say(e.status === 403 ? 'Only the host can switch the Secretary. I opened it so you can see what it does.' : 'I could not switch the Secretary: ' + e.message, [act('Open Secretary', 'secretary')]); }
    }
    if (/auto-?pilot/.test(t)) {
      if (!connected()) return say('Repo autopilot runs on the tribe host. Host or join a tribe first.', [act('Host or join', 'invite')]);
      try { await C.api('/repo/settings', { method: 'PUT', body: { autopilot: { enabled: on } } }); return say(on ? 'Repo autopilot is on. Every action it takes is logged in the repo view.' : 'Repo autopilot is off.', [act('Open the repo', 'repo')]); }
      catch (e) { return say(e.status === 403 ? 'Only the host can switch repo autopilot.' : 'Repo autopilot needs a project with a repo: ' + e.message, [act('Open the repo', 'repo')]); }
    }
    await refreshModel();
    if (model.online) return say(off ? `I think with ${model.via || model.model}. Pick None in Flint's brain to drop back to basic mode.` : `I already think with ${model.via || model.model}. I use it for anything I don't know by heart.`, [act('Flint\'s brain', 'brain')]);
    return say('A brain makes me smarter: the built-in model in your browser, Ollama on the host, or a cloud model with the host\'s own key. Pick one in Flint\'s brain.', [act('Give Flint a brain', 'brain')]);
  }
  async function status() {
    const r = await room();
    if (!connected()) return say('You\'re not in a tribe yet, so the room is just you. Host on this computer or join a friend\'s link.', [act('Host or join', 'invite')]);
    const others = r.people.filter(p => p.id !== r.meId);
    const who = others.length ? `${others.length === 1 ? 'Here with you' : `${others.length} here with you`}: ${others.slice(0, 4).map(p => first(p.name)).join(', ')}${others.length > 4 ? '…' : ''}.` : 'Just you in the room right now.';
    const ag = r.agents.length ? ` ${r.agents.length} agent${r.agents.length === 1 ? '' : 's'} online.` : '';
    const tk = ` ${r.open.length ? `${r.open.length} open task${r.open.length === 1 ? '' : 's'}${r.mine.length ? `, ${r.mine.length} yours` : ''}` : 'No open tasks'}.`;
    const cm = r.commit ? ` Last commit: “${r.commit.title}”${r.commit.byName ? ` by ${first(r.commit.byName)}` : ''}${r.commit.at ? `, ${ago(r.commit.at)}` : ''}.` : '';
    return say(who + ag + tk + cm, [act('Open Tasks', 'nav', 'tasks'), act('Open chat', 'nav', 'chat')]);
  }
  async function summarize() {
    await refreshModel();
    if (!model.online) return say('Summaries need a brain: the built-in one in your browser, Ollama on the host, or the host\'s cloud key.', [act('Give Flint a brain', 'brain')]);
    if (!connected()) return say('There\'s no chat yet: host or join a tribe first.');
    let msgs = [];
    try { msgs = ((await C.api('/chat/general')).messages || []).filter(x => x.by !== 'tribecode' && x.text).slice(-60); } catch {}
    if (!msgs.length) return say('The chat is quiet so far: nothing to summarize.');
    const st = C.state(), nm = id => ((st.members || []).find(x => x.id === id) || {}).name || 'someone';
    const log = msgs.map(x => `${nm(x.by)}: ${String(x.text).slice(0, 300)}`).join('\n');
    return modelReply('Summarize this chat in three short lines.', log);
  }
  async function find(q) {
    const out = [];
    if (connected()) {
      try { const { docs = [] } = await C.api('/hub/docs?q=' + encodeURIComponent(q)); docs.slice(0, 3).forEach(d => out.push(act(`Doc · ${d.title}`, 'doc', `${d.project}|${d.slug}`))); } catch {}
      try { const ws = words(q); const { tasks = [] } = await C.api('/tasks'); tasks.filter(t => ws.length && ws.every(w => String(t.title).toLowerCase().includes(w))).slice(0, 2).forEach(t => out.push(act(`Task · ${t.title}`, 'nav', 'tasks'))); } catch {}
    }
    const g = await guideSearch(q); if (g) out.push(act(`Guide · ${g.title}`, 'guide', g.slug));
    out.push(act('Search everything', 'search', q));
    return say(out.length > 1 ? `Here's what I found for “${q}”:` : `Nothing matched “${q}” in docs, tasks or the Guide.`, out.slice(0, 5));
  }
  async function fallback(text, triedGuide, noModel) {
    if (!noModel) await refreshModel();
    if (model.online && !noModel) return modelReply(text);
    const g = triedGuide ? null : await guideSearch(text);
    if (g) return say(`I'm in basic mode, but the Guide might help. ${g.title}: ${g.snippet}`, [act('Open in Guide', 'guide', g.slug)], { guide: g.slug });
    return say('I\'m in basic mode, so I only know a few things by heart: connect your AI, "note: …", "task …", invites, "find …", "what\'s new", and how-to questions from the Guide. Give me a brain (built in, Ollama, or a cloud key) and I can answer anything else.',
      [act('Give Flint a brain', 'brain'), act('What\'s happening?', 'ask', 'What\'s happening?'), act('Open the Guide', 'guide')]);
  }

  // ---------- a brain: built in (this browser, WebLLM) or the tribe's (server/flint.js → server/llm.js), streamed ----------
  async function browserReply(text, extra) {
    const r = connected() ? await room().catch(() => null) : null;
    const history = thread.slice(-9, -1).map(m => ({ role: m.who === 'flint' ? 'assistant' : 'user', content: String(m.text).slice(0, 400) }));
    const msg = say(B().browserReady() ? '…' : 'Waking up the built-in model (the first time downloads it)…', [], { streaming: true });
    try {
      const out = await B().askBrowser([{ role: 'system', content: SYSTEM + (r ? `\n\nRoom facts:\n${roomText(r)}` : '') + (extra ? `\n\nRecent chat:\n${extra}` : '') }, ...history, { role: 'user', content: text }],
        t => { msg.text = t || '…'; drawLast(); });
      msg.text = out.text || 'I had nothing to add there.'; msg.via = out.via; delete msg.streaming; save(); draw();
    } catch (e) { msg.text = 'The built-in model could not answer: ' + e.message; delete msg.streaming; msg.acts = [act('Flint\'s brain', 'brain')]; save(); draw(); }
  }
  const SYSTEM = 'You are Flint, the small built-in helper of TribeCode, where friends and their AI coding agents build one app together. Answer in one to three short, friendly sentences, plain text. Use only the room facts you are given; if you do not know, say so and suggest the Guide.';
  async function modelReply(text, extra) {
    if (B() && B().choice() === 'browser') return browserReply(text, extra);
    if (!connected()) return fallback(text, true, true);
    const r = await room().catch(() => null);
    const history = thread.slice(-9, -1).map(m => ({ who: m.who, text: m.text }));
    const msg = say('…', [], { streaming: true });
    try {
      const S = window.TribeStore, tok = (S.get().server || {}).token || '', pid = C.project && C.project();
      const res = await fetch(C.base() + '/api/flint/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(pid ? { 'X-Project': pid } : {}) },
        body: JSON.stringify({ text, history, room: (r ? roomText(r) : '') + (extra ? `\n\nRecent chat:\n${extra}` : '') }) });
      if (res.status === 403 || res.status === 429) { const j = await res.json().catch(() => ({})); msg.text = (j.error || 'The host\'s AI is not available to you right now.') + ' I can still do notes, tasks and the Guide, or use the built-in model.'; msg.acts = [act('Flint\'s brain', 'brain')]; delete msg.streaming; save(); draw(); return; }
      if (!res.ok || !res.body) { thread = thread.filter(m => m !== msg); draw(); return fallback(text, true, true); }
      try { msg.via = decodeURIComponent(res.headers.get('X-Flint-Via') || ''); } catch {}
      const rd = res.body.getReader(), dec = new TextDecoder(); let out = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; out += dec.decode(value, { stream: true }); msg.text = out.trimStart() || '…'; drawLast(); }
      msg.text = out.trim() || 'I had nothing to add there.'; delete msg.streaming; save(); draw();
    } catch (e) { msg.text = 'The model did not answer. ' + e.message; delete msg.streaming; save(); draw(); }
  }
  async function refreshModel() {
    const ch = B() ? B().choice() : 'host';
    if (ch === 'none') { model = { online: false, model: '' }; drawStatus(); return model; }
    if (ch === 'browser') { const g = await B().gpu(); model = g.ok ? { online: true, model: g.label, via: `${g.label} in your browser`, browser: true } : { online: false, model: '' }; drawStatus(); return model; }
    if (!connected()) { model = { online: false, model: '' }; return model; }
    try { model = (await C.api('/flint')).model || model; } catch {}
    drawStatus(); return model;
  }

  window.addEventListener('tribe-brain', () => refreshModel());
  async function send(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    busy = true; push('me', text);
    try { await route(text); } catch (e) { say('Something went wrong: ' + e.message); }
    finally { busy = false; }
  }

  // ---------- view ----------
  const CHIPS = ['Connect my AI', 'Capture a note', 'What\'s happening?', 'How do invites work?'];
  const statusLine = () => (model.online ? `ready · ${model.browser ? 'built in' : model.cloud ? 'the host\'s AI' : 'local model on'}` : 'basic mode · no model');
  const privLine = () => (model.online && model.cloud ? `Flint uses ${model.via || model.model} through the host's key. The key never leaves the host.` : model.online && model.browser ? 'Flint runs in your browser. Nothing you type here leaves it.' : 'Flint runs on this computer. Nothing you type here leaves it.');
  function emptyHtml() {
    return `<div class="fl-empty"><p class="fl-hi"><b>Hi, I'm Flint.</b> I live in this room and get things going.</p>
      <div class="fl-chips">${CHIPS.map(c => `<button class="fl-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <p class="fl-priv">${esc(privLine())}</p></div>`;
  }
  const linkify = s => esc(s).replace(/“([^”]{1,120})”/g, '“<b>$1</b>”');
  function msgHtml(m, i) {
    const mine = m.who === 'me';
    return `<div class="fl-msg ${mine ? 'me' : 'fl'}${m.streaming ? ' streaming' : ''}" data-i="${i}">${mine ? '' : `<span class="fl-av sm">${flintIco(12)}</span>`}
      <div class="fl-b"><div class="fl-t">${linkify(m.text)}</div>${m.via && !m.streaming ? `<small class="fl-via">via ${esc(m.via)}</small>` : ''}${(m.acts || []).length ? `<div class="fl-acts">${m.acts.map((a, j) => `<button class="fl-act" data-act="${i}:${j}">${esc(a.label)}</button>`).join('')}</div>` : ''}</div></div>`;
  }
  function threadHtml() { return thread.length ? thread.map(msgHtml).join('') : emptyHtml(); }
  function barHtml(id) {
    return `<form class="fl-bar" data-flbar autocomplete="off"><span class="fl-av" aria-hidden="true">${flintIco(14)}</span>
      <input class="fl-in" ${id ? `id="${id}"` : ''} placeholder="Ask Flint…" aria-label="Ask Flint" maxlength="2000" enterkeyhint="send">
      <button type="button" class="fl-ic fl-mic" data-flmic title="Dictate" aria-label="Dictate">${ico('i-mic', 16)}</button>
      <button type="submit" class="fl-ic fl-send" title="Send" aria-label="Send">${SEND}</button></form>`;
  }
  const threads = () => [...document.querySelectorAll('.fl-thread')];
  function draw() {
    threads().forEach(el => { el.innerHTML = threadHtml(); el.scrollTop = el.scrollHeight; });
    const dock = $('#flint'); if (dock) { dock.classList.toggle('has-msgs', thread.length > 0); const c = dock.querySelector('#fl-clear'); if (c) c.hidden = !thread.length; }
  }
  function drawLast() {
    const i = thread.length - 1, m = thread[i];
    threads().forEach(el => { const n = el.querySelector(`.fl-msg[data-i="${i}"] .fl-t`); if (n) { n.innerHTML = linkify(m.text); el.scrollTop = el.scrollHeight; } else { el.innerHTML = threadHtml(); el.scrollTop = el.scrollHeight; } });
  }
  function drawStatus() { document.querySelectorAll('[data-flst]').forEach(e => { e.textContent = statusLine(); e.classList.toggle('ok', model.online); }); }
  function wire(root) {
    root.addEventListener('click', e => {
      const c = e.target.closest('[data-chip]'); if (c) { const v = c.dataset.chip; if (v === 'Capture a note') { const i = root.querySelector('.fl-in'); if (i) { i.value = 'note: '; i.focus(); } return; } return send(v); }
      const a = e.target.closest('[data-act]'); if (a) { const [i, j] = a.dataset.act.split(':').map(Number), x = thread[i] && thread[i].acts[j]; if (x && ACTS[x.act]) { if (x.act !== 'ask' && phone()) closeFull(); ACTS[x.act](x.arg); } return; }
      const mic = e.target.closest('[data-flmic]'); if (mic) { const i = root.querySelector('.fl-in'); if (window.TribeSpeech && window.TribeSpeech.supported && window.TribeSpeech.supported()) window.TribeSpeech.dictate(i); else toast((window.TribeSpeech && window.TribeSpeech.HINT) || 'Dictation is not available in this browser.'); }
    });
    root.querySelectorAll('[data-flbar]').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); const i = f.querySelector('.fl-in'); const v = i.value; i.value = ''; if (window.TribeSpeech && window.TribeSpeech.stopDictation) try { window.TribeSpeech.stopDictation(); } catch {} setOpen(true); send(v); }));
  }

  // Desktop dock: pinned at the bottom of the right panel, below the scrolling room list.
  function setOpen(o) { ls.set(OPEN, o); const d = $('#flint'); if (!d) return; d.classList.toggle('folded', !o); const b = d.querySelector('#fl-fold'); if (b) { b.setAttribute('aria-expanded', String(o)); b.title = o ? 'Fold' : 'Show the thread'; } if (o) draw(); }
  function mountDock() {
    const panel = $('#tour-room'), pane = $('#room-pane'); if (!panel || !pane || $('#flint')) return;
    const d = document.createElement('section'); d.className = 'flint'; d.id = 'flint'; d.setAttribute('aria-label', 'Flint');
    d.innerHTML = `<header class="fl-head"><button class="fl-fold" id="fl-fold" aria-controls="fl-thread" aria-expanded="true"><span class="fl-eyebrow">Flint</span><span class="fl-st" data-flst>${statusLine()}</span>${ico('i-chev', 14)}</button>
        <button class="fl-x" id="fl-clear" title="Clear the thread" aria-label="Clear the thread" hidden>${ico('i-x', 13)}</button></header>
      <div class="fl-thread" id="fl-thread" role="log" aria-live="polite" aria-label="Conversation with Flint"></div>${barHtml('fl-input')}`;
    pane.after(d); wire(d);
    d.querySelector('#fl-fold').onclick = () => setOpen(d.classList.contains('folded'));
    d.querySelector('#fl-clear').onclick = clear;
    setOpen(ls.get(OPEN, true) !== false); draw();
  }
  // Phones: a full-screen thread with the same composer.
  function openFull() {
    let ov = $('#flint-full');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'flint-full'; ov.className = 'flint-full'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Flint');
      ov.innerHTML = `<header class="ff-head"><button class="ff-back" id="ff-back" aria-label="Back">${ico('i-x', 18)}</button><span class="fl-av" aria-hidden="true">${flintIco(16)}</span>
          <div class="ff-id"><span class="fl-eyebrow">Flint</span><small class="fl-st" data-flst>${statusLine()}</small></div><button class="fl-x" id="ff-clear" title="Clear the thread" aria-label="Clear the thread">${ico('i-refresh', 15)}</button></header>
        <div class="fl-thread ff-thread" role="log" aria-live="polite" aria-label="Conversation with Flint"></div><div class="ff-foot">${barHtml('ff-input')}</div>`;
      document.body.appendChild(ov); wire(ov);
      ov.querySelector('#ff-back').onclick = closeFull; ov.querySelector('#ff-clear').onclick = clear;
    }
    ov.classList.remove('hidden'); document.body.classList.add('flint-open'); draw(); drawStatus(); refreshModel();
    setTimeout(() => { const i = $('#ff-input'); if (i && !matchMedia('(hover: none)').matches) i.focus(); }, 50);
  }
  function closeFull() { const ov = $('#flint-full'); if (ov) ov.classList.add('hidden'); document.body.classList.remove('flint-open'); }
  function clear() { thread = []; save(); draw(); }
  function focus() {
    if (phone()) return openFull();
    if (document.body.classList.contains('panel-off')) { const t = $('#panel-toggle'); if (t) t.click(); }
    const pc = $('#preview-close'); if ($('#tour-room') && $('#tour-room').classList.contains('previewing') && pc) pc.click();
    mountDock(); setOpen(true);
    const i = $('#fl-input'); if (i) i.focus();
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('flint-open')) closeFull(); });
  mountDock(); refreshModel();
  if (C && C.on) { C.on('hello', () => { mountDock(); refreshModel(); }); C.on('status', () => drawStatus()); }
  setInterval(() => { if (document.visibilityState === 'visible' && connected()) refreshModel(); }, 60000);
  window.TribeFlint = { focus, openFull, closeFull, ask: send, thread: () => thread.slice(), clear, status: () => ({ ...model }) };
})();
