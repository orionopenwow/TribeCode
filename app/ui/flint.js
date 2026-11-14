// Flint: TribeCode's built-in helper (the thing you strike to start a campfire: it lives in the room and gets things going).
// Desktop: a compact "Ask Flint…" bar pinned at the bottom of the right panel, with a short thread above it that opens
// upward (at most ~45% of the panel) and folds. Phones: a full-screen thread, opened from "Talk to…" (mobile2.js).
// With no model at all it runs a deterministic intent router (connect Claude, guide answers, notes, tasks, invites,
// hosting, navigation, find, room status, helper toggles). With a brain (Settings › Flint's brain, brainpick.js): the
// built-in model in this browser (WebLLM), or the tribe's brain on the host (server/flint.js → server/llm.js: the host's
// cloud key or Ollama),
// messages no intent matched go to the model and the reply streams in (Ollama or the in-browser model: on the device; a cloud provider the host picked: sent there).
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
  const mounts = new Set();
  let sink = null;   // feat/flint-unify: while a mounted chat (designer, canvas, preview) runs a command, Flint's replies go there
  function push(who, text, acts, extra) { const m = { who, text: String(text || ''), acts: acts || [], at: new Date().toISOString(), ...(extra || {}) }; if (who === 'flint' && window.TribePrefs) window.TribePrefs.speak(m.text);   // feat/settings-tabs: Settings › Plan & AI › Flint reads aloud
    if (sink) { sink.add(m); return m; } thread.push(m); thread = thread.slice(-MAX); save(); draw(); return m; }
  const say = (text, acts, extra) => push('flint', text, acts, extra);

  // ---------- actions (stored by name so buttons still work after a reload) ----------
  const ACTS = {
    dz: a => window.TribeDropZone && window.TribeDropZone.run(a),   // feat/dropzone: a dropped folder's suggestions
    assets: o => window.TribeAssets && window.TribeAssets.open(o || {}),
    flintpage: q => window.TribeFlintPage && window.TribeFlintPage.open(q || ''),   // feat/flint-max: Flint's page (what I can do, levels)   // v0.25: the asset library
    inspoApply: to => window.TribeInspo && window.TribeInspo.apply(to || 'both'),
    connect: () => App() && App().connectClaude && App().connectClaude(),
    brain: () => (B() ? B().open() : ACTS.guide('agents-and-office')),
    credits: () => window.TribePremium && window.TribePremium.gate('credits'),   // feat/flint-site: the one AI-boost pair (aiboost.js)
    guide: slug => window.TribeGuide && window.TribeGuide.open(slug || undefined),
    note: id => { if (Hub() && Hub().openNote) Hub().openNote(id); else if (Hub()) Hub().open('docs'); },
    newnote: () => { const b = $('#room-note-new'); if (b) b.click(); else if (Hub()) Hub().open('docs'); },
    nav: v => { if (v === 'hub') return Hub() ? Hub().open('home') : App().show('hub'); if (v === 'guide') return ACTS.guide(); if (v === 'settings') return window.TribeSettings && window.TribeSettings.open(); if (v === 'whiteboard') return window.TribeWhiteboard && window.TribeWhiteboard.open();   /* feat/whiteboard */ App().show(v); },
    invite: () => App() && App().openInvite(),
    inviteclaude: () => window.TribeInviteClaude && window.TribeInviteClaude.open(),   // its first name: lands on Claude
    inviteagent: kind => window.TribeInviteAgent && window.TribeInviteAgent.open(kind ? { kind } : undefined),   // Invite your agent (inviteagent.js), on that kind
    host: () => App() && (App().hostHere ? App().hostHere() : App().openInvite()),
    stophost: () => App() && App().setHosting && App().setHosting(false),
    secretary: () => window.TribeSecretary && window.TribeSecretary.open(),
    repo: () => App().show('repo'),
    model: () => (B() ? B().open() : ACTS.guide('agents-and-office')),
    agents: () => window.TribeAgentsHub && window.TribeAgentsHub.open(),
    doc: ref => { const [pid, slug] = String(ref).split('|'); const open = () => { App().show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.open && window.TribeDocs.open(slug), 120); }; if (pid && PJ() && PJ().current && PJ().current() !== pid && PJ().switchTo) { PJ().switchTo(pid, 'docs'); setTimeout(open, 400); } else open(); },
    search: q => { if (!window.TribePalette) return; window.TribePalette.open(); const i = $('#pal-input'); if (i) { i.value = q || ''; i.dispatchEvent(new Event('input', { bubbles: true })); } },
    ask: text => send(text),
    fill: text => prefill(String(text || '')),   // feat/flint-unify: a chip that starts the sentence for you
    website: () => (window.TribeShell ? window.TribeShell.go('website') : window.TribeWebsite && window.TribeWebsite.open()),   // feat/customize
    customize: tab => window.TribeLook && window.TribeLook.open(tab || 'tribe'),
    capture: id => window.TribeCaptures && window.TribeCaptures.open(id || undefined),   // feat/captures
    company: () => window.TribeCompany && window.TribeCompany.go(),   // v0.27 company
    flintmem: arg => window.TribeFlintMem && window.TribeFlintMem.act(arg),   // v0.27.1
    feedback: () => window.TribeFeedback && window.TribeFeedback.open(),   // feat/reviews
    prompt: async () => { const p = window.TribeFocus && window.TribeFocus.prompt(); if (!p) return; try { await navigator.clipboard.writeText(p); toast('Copied. Paste it into your AI helper.'); } catch { window.prompt('Copy this for your AI helper:', p); } },   // feat/focus
    preview: () => (window.TribePreview && window.TribePreview.open ? window.TribePreview.open() : App().show('docs')),
    dm: id => window.TribeDM && window.TribeDM.open && window.TribeDM.open(id),   // flint-local
    meant: arg => window.TribeFlintLocal && window.TribeFlintLocal.meant(arg),
    res: key => window.TribeFlintGrow && window.TribeFlintGrow.run('res', key),   // feat/flint-ai: open a resource (Academy, Guide, Legal, Marketplace, templates, docs)
    grow: arg => window.TribeFlintGrow && window.TribeFlintGrow.run('grow', arg),   // feat/flint-ai: the "Grow your idea" questions
    usestyle: () => window.TribeFlintGrow && window.TribeFlintGrow.run('usestyle'),
    today: () => window.TribeFlintGrow && window.TribeFlintGrow.run('today'),   // flint-local: a "did you mean" chip teaches Flint the phrase, then runs it
  };
  const act = (label, name, arg) => ({ label, act: name, arg: arg == null ? '' : String(arg) });
  // v0.27.2 Flint at work: a small flame flies to whatever he's changing (app/ui/flintfly.js)
  const FF = () => window.TribeFlintFly && window.TribeFlintFly.enabled() ? window.TribeFlintFly : null;
  const seen = s => { const e = typeof s === 'string' ? document.querySelector(s) : s; return e && e.offsetParent !== null && e.getClientRects().length ? e : null; };
  const curView = () => [...document.querySelectorAll('#main [id^="view-"]')].find(e => e.id !== 'view-tabs' && seen(e)) || seen('#main');
  const later = (ms, f) => setTimeout(() => { try { f(); } catch {} }, ms);

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
    nav: /^(?:open|go to|goto|show(?: me)?|take me to|switch to|bring me to|where(?:'s| is| are| do i find)|how do i (?:get to|find))\s+(?:the\s+|my\s+|our\s+)?(files|docs|documents|tasks|task board|board|chat|messages|home|dashboard|overview|repo|code|guide|settings|calendar|agents hub|agents|mcp|bugs|website|whiteboard|white board)\b/,
    doStep: /^(?:how (?:do|can) i |help me |let'?s |i want to |)(?:add|make|create|start)(?: a| my| the)? (?:first )?task\b|^(?:how (?:do|can) i |help me |let'?s |)(write|start)(?: the| our)? vision\b|^(?:how (?:do|can) i |help me |)(?:connect|hook up|add)(?: my)? (?:ai|claude|codex|gemini|cursor|agent)\b|^(?:how (?:do|can) i |help me |let'?s |)(?:create|make|set up|start)(?: a| the| our)? (?:git )?repo\b/,
    // v0.25: the inspiration board. "use this for inspiration https://…", a Pinterest/Dribbble link, "dress it up"
    inspo: /(?:\b(?:inspiration|inspo|mood ?board|style (?:it )?like)\b[^h]*?(https?:\/\/\S+)|(https?:\/\/(?:[\w-]+\.)?(?:pinterest\.[a-z.]+|pin\.it|dribbble\.com|behance\.net|fonts\.google\.com)\S*))/i,
    dress: /\b(dress (?:it|this|the (?:site|website|app|game|project)) up|dress up the (?:site|website|app|game|project)|apply (?:the )?(?:inspiration|palette|board|mood ?board))\b/i,
    // v0.25: "add a jump sound", "get me a coin sprite", "find a 3D fox", "I need a heart icon"
    asset: /^(?:please\s+|can you\s+|could you\s+)?(?:add|get|find|grab|give me|i need|we need|use|put in|drop in|pick)\s+(?:me\s+|us\s+)?(?:an?\s+|some\s+|the\s+)?(.*?)\b(sound effects?|sounds?|sfx|3d models?|models?|glb|rigged|animated character|sprites?|pixel art|icons?|fonts?|textures?|hdris?|motion|animations?)\b(.*)$/,
    find: /^(?:find|search(?: for)?|look for|where(?:'s| is))\s+(.+)$/,
    help: /^(how|what|why|where|when|can i|could i|help|guide|explain|is there|do i)\b|\?$/,
    // Invite your agent (inviteagent.js): "invite my agent", "invite my cursor", "bring in my codex", "invite my claude"
    inviteClaude: /\b(invite|add|bring|connect|hook up) (in )?(my|our) (own )?(ai )?(claude( code| desktop)?|cursor|codex|chatgpt|gemini( cli)?|copilot|vs ?code|windsurf|cline|zed|agent)\b|\binvite (an? )?(ai )?(claude|cursor|codex|chatgpt|gemini|copilot|windsurf|cline|zed|agent)\b/,
    invite: /\binvite\b|\badd (a )?friend\b|\bshare (the|a) link\b/,
    hello: /^(hi|hey|hello|yo|hiya|good (morning|afternoon|evening))\b|^(thanks|thank you|thx|cheers)\b/,
    website: /\b(make|build|generate|create|design|redo|refresh|write|shuffle)\b.*\b(web ?site|home ?page|landing page|site)\b|^(our |the )?web ?site$/,   // feat/customize
    customize: /\b(customi[sz]e|change|pick|set)\b.*\b(background|accent|look|banner|font size|density)\b|^customi[sz]e\b/,
    focus: /^(what should i (do|work on)|what'?s (next|my next)|my (next )?task|what am i (doing|working on)|where was i|next steps?)\b/,   // feat/focus
    prompt: /\b(copy|give me|write|make)\b.*\bprompt\b|^prompt( for)? my (ai|agent|claude)/,
    preview: /^(open |show |run |start )?(the )?preview\b|^(play|try) (the|our) (game|app)\b/,
    make: /^(?:please\s+|can you\s+|could you\s+)?(?:make|write|create|draft|build|start|put together|give me|do)\s+(?:me\s+|us\s+)?(?:a|an|some|the|our)?\s*(?:new\s+|quick\s+|short\s+|simple\s+)?(?:[a-z-]+\s+)?(doc|document|write-?up|sheet|spreadsheet|table|budget|tracker|slides?|slide deck|deck|presentation)\b/,   // feat/crafts
  };

  // v0.25: the asset library. A built-in that matches exactly (a sound or a sprite) goes straight into the project;
  // anything else opens the library already searched.
  async function asset(m) {
    const noun = m[2], kind = /sound|sfx/.test(noun) ? 'sound' : /rigged|animated character/.test(noun) ? 'rigged' : /model|glb|3d/.test(noun) ? 'model' : /sprite|pixel/.test(noun) ? 'pixel' : /icon/.test(noun) ? 'icon' : /font/.test(noun) ? 'font' : /texture|hdri/.test(noun) ? 'texture' : 'motion';
    const q = `${m[1]} ${m[3]}`.replace(/\b(for|to|in|into|the|our|my|game|project|site|website|app|please|a|an|some|3d|pixel)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const BUILT = { sound: ['sfx', ['jump', 'coin', 'hit', 'explosion', 'powerup', 'laser', 'click', 'select', 'blip', 'hurt', 'pickup', 'door']], pixel: ['sprites', ['hero', 'slime', 'coin', 'heart', 'gem', 'key', 'chest', 'lantern', 'flame', 'star', 'sword', 'potion', 'tree', 'cloud', 'door', 'block']] };
    const b = BUILT[kind], hit = b && b[1].find(n => q === n || q.split(' ').includes(n) || q.split(' ').includes(n + 's') || (n === 'powerup' && /power ?up/.test(q)));
    if (hit && C && C.connected()) {
      const at = seen('#pvw-frame') || seen('#pvw') || seen('#nest-docs') || curView(); if (FF() && at) FF().work(at, `Adding ${hit}`);
      try { const r = await C.api('/assets/add', { method: 'POST', body: { project: C.project(), items: [{ pack: b[0], name: hit }] } }); if (FF() && at) FF().done(at, `Added ${hit} ✓`);
        return say(`Added ${kind === 'sound' ? 'a' : 'the'} ${hit} ${kind === 'sound' ? 'sound' : 'sprite'}: \`${r.where}${r.files[0]}\` (credits in ${r.where}CREDITS.md). Want more?`, [act('Open the asset library', 'assets', { kind })]); }
      catch (e) { if (FF()) FF().home(); return say(`I couldn't add it: ${esc(e.message)}`, [act('Open the asset library', 'assets', { kind, q })]); }
    }
    ACTS.assets({ q, kind }); if (FF()) later(350, () => { const lib = seen('.as-modal') || seen('#assets') || curView(); if (lib) FF().done(lib, 'Asset library'); });
    return say(`Opened the asset library${q ? ` searching for “${esc(q)}”` : ''}. Tap what you like (sounds play when you tap), then Add to project. Everything is open-licensed and credited.`, [act('Open it again', 'assets', { q, kind })]);
  }

  // flint-free (docs/FLINT-TIERS.md): what I do with no AI, with a small free model, and what needs a stronger AI
  async function tiersReply() {
    let T = null; try { T = connected() ? await C.api('/flint/tiers') : null; } catch {}
    const list = (T && T.tiers) || [];
    if (!list.length) return say('With no AI at all I make palettes and fix contrast, pair fonts, tidy layouts, write headline ideas, sum and chart sheets, add a table of contents, make a pitch from your vision, add tasks and notes, and edit your website and designs. All of it is on my page, with Try it.', [act('See everything I can do', 'flintpage')]);
    const host = (T.now && T.now.host) || {};
    const lines = list.map(x => `**${esc(x.label)}** (${esc(x.where)}): ${x.can.map(esc).join(', ')}.`);
    return say(`${lines.join('\n\n')}\n\nRight now: ${host.online ? `the tribe's AI is on (${esc(host.via || 'ready')})` : 'no AI is on, so I use the free tiers'}.`,
      [act('See everything I can do', 'flintpage'), act('Build something free', 'ask', 'Build a to-do app'), act('Choose Flint\'s AI', 'brain')]);
  }
  async function route(raw) {
    const text = String(raw || '').trim().replace(/\s+/g, ' '), t = text.toLowerCase();
    let m;
    // feat/agents-free: "turn this answer into changes" (an answer from ChatGPT, Gemini…), "use a free AI": the AI bridge
    if (window.TribeAIBridge && /\b(?:(?:turn|make)\s+(?:this|that|the|an?|my)\s+(?:ai\s+|chatgpt\s+|gemini\s+)?(?:answer|reply|response)\s+into\s+(?:code\s+)?changes|(?:paste|apply)\s+(?:an?|the|this|my)\s+(?:ai|chatgpt|gemini|claude|copilot)(?:'s)?\s+(?:answer|reply)|(?:use|ask)\s+(?:a\s+)?free\s+ai|copy\s+(?:this\s+)?(?:out\s+)?for\s+(?:chatgpt|gemini|a free ai))\b/.test(t)) {
      const body = String(raw || ''), at = body.search(/```|^--- |^diff --git /m), reply = at >= 0 ? body.slice(at) : '';
      const back = !!reply || /answer|reply|response/.test(t);
      window.TribeAIBridge.open({ fresh: true, tab: back ? 'back' : 'out', reply });
      return say(back ? (reply ? 'I read that answer in the AI bridge: check each file, keep what you like, then Apply. Nothing runs by itself.' : 'Paste the AI\'s whole answer in the box, then Read the answer. You pick what to keep; Undo puts it back.') : 'Pick what to send and copy the pack. Paste it into ChatGPT, Gemini, Claude, Copilot or Le Chat, then paste the answer back.');
    }
    if (window.TribeDropZone) { const r = await window.TribeDropZone.flint(text); if (r) { if (r !== true) say(r.text, r.acts || [], r.extra); return null; } }   // feat/dropzone: questions about the folder Flint is reading (only when one is in context)
    if (/^(what can (you|flint) do( for free)?|what('?s| is) free|what do you do for free|what can you build( for free)?|(show )?(your|flint'?s) (free )?tiers?|are you free)\??$/.test(t)) return tiersReply();   // flint-free: the honest capability map
    // flint-local: Flint's own brain first (app/ui/flintnlu.js + flintlocal.js): many-step commands, typos, eight
    // languages, taught phrases, undo, how-to answers from the docs. It hands back to the routes below when they fit.
    if (window.TribeFlintLocal && !localBusy) {
      localBusy = true;
      try { const r = await window.TribeFlintLocal.handle(text, LH); if (r) return r === true ? null : r; } finally { localBusy = false; }
      return legacyRoute(text, true);
    }
    return legacyRoute(text);
  }
  let localBusy = false;
  async function special(text) {   // the feature routers that know their own phrases (memory, company, academy, captures)
    if (window.TribeFlintGrow && await window.TribeFlintGrow.flint(text)) return true;   // feat/flint-ai: grow your idea, resources, today's plan, the inspiration board, your style
    if (window.TribeFlintRun) { const r = await window.TribeFlintRun.flint(text); if (r) { if (r !== true) say(r.text, r.acts || []); return true; } }   // feat/flint-runthrough: tribe/project/vision/proposal/standup/presentation/proof/Blender
    if (window.TribeAIBasics && window.TribeAIBasics.flint) { const r = await window.TribeAIBasics.flint(text); if (r) { if (r !== true) say(r.text, r.acts || []); return true; } }   // feat/flint-runthrough: summarize / key points / title / tags / reading time / glossary of any doc, note or file   // feat/flint-ai: grow your idea, resources, today's plan, the inspiration board, your style
    if (window.TribeFlintMem) { const r = await window.TribeFlintMem.route(text); if (r) { if (r !== true) say(r.text, r.acts || []); return true; } }   // v0.27.1: memory, teaching, drafts, build, skills, project words (flintmem.js)
    if (window.TribeCompany) { const co = await window.TribeCompany.flint(text); if (co) { say(co.text, co.open ? [act('Open Company', 'company')] : []); return true; } }   // v0.27 company: make me a company, who's in charge of X, give X to my claude
    if (window.TribeAcademy) { const ac = window.TribeAcademy.flint(text); if (ac) { say(ac.text); return true; } }   // v0.27 company: "learn sales", "do this for free", "draft an NDA"
    if (window.TribeCaptures) { const cap = await window.TribeCaptures.flint(text); if (cap) { say(cap.text, cap.capture ? [act('Open notes', 'capture', cap.capture)] : []); return true; } }   // feat/captures: summarize <url>, what did we decide about X
    return false;
  }
  // the specific phrases the routes below handle well on their own (flintlocal.js lets them keep those)
  const LEGACY = ['inviteClaude', 'status', 'summarize', 'helper', 'connect', 'hosting', 'website', 'focus', 'prompt', 'preview', 'inspo', 'dress', 'asset', 'make', 'customize', 'task', 'note', 'doStep', 'nav'];
  const legacyHit = raw => { const text = String(raw || '').trim().replace(/\s+/g, ' '), t = text.toLowerCase(); return LEGACY.some(k => { const m = RX[k].exec(k === 'inspo' ? text : t); return m && (k !== 'task' || (m[1] && m[1].trim())); }); };
  const LH = { clear: () => (sink && sink.clearAll ? sink.clearAll() : clear()), say: (text, acts, extra) => say(text, acts || [], extra), act, legacy: text => legacyRoute(text, false, true), special, legacyHit, task: (title, extra, quiet) => task(title, extra, quiet), guide: async t => { const g = await guideSearch(t); return g ? guideReply(g) : null; }, modelOnline: () => !!model.online && !(B() && B().choice() === 'none') };
  async function legacyRoute(raw, specialsDone, viaLocal) {
    const text = String(raw || '').trim().replace(/\s+/g, ' '), t = text.toLowerCase();
    let m;
    if (!specialsDone && await special(text)) return null;
    if (RX.inviteClaude.test(t)) return inviteClaude(t);
    if (RX.status.test(t)) return status();
    if (RX.summarize.test(t)) return summarize();
    if (RX.helper.test(t)) return helper(t);
    if (RX.connect.test(t)) { if (agentKindIn(t)) return inviteClaude(t); ACTS.connect(); return say('Let\'s get your AI into the room: Claude Code, Codex, Gemini CLI, Cursor or any MCP tool. I opened the connect steps: one command or one config on your computer and it joins.', [act('Show the steps again', 'connect'), act('How it works', 'guide', 'connect-claude-code')]); }
    if (RX.hosting.test(t)) return hosting(t);
    if (RX.website.test(t)) return website(t);
    if (RX.focus.test(t)) return focusReply();
    if (RX.prompt.test(t)) { await ACTS.prompt(); return say('I copied a prompt for your AI helper: your task, your part of the code, the branch to use, and what to leave alone so nothing collides. Paste it into Claude Code, Codex or Cursor.', [act('Copy it again', 'prompt')]); }
    if (RX.preview.test(t)) { ACTS.preview(); if (FF()) later(350, () => { const p = seen('#pvw'); if (p) FF().done(p, 'Preview'); }); return say('Opened the preview, right next to the work.', [act('Open it again', 'preview')]); }
    if ((m = RX.inspo.exec(text))) { const u = m[1] || m[2]; if (window.TribeInspo) { if (App() && App().show) App().show('home'); setTimeout(() => window.TribeInspo.addLink(u), 400); } return say(`Pinned it to the inspiration board on the dashboard. I'm reading the colors and fonts now; say "dress it up" when you like the palette.`, [act('Dress it up', 'inspoApply', 'both')]); }
    if (RX.dress.test(t)) { const to = /\b(site|website)\b/.test(t) ? 'site' : /\b(app|game)\b/.test(t) ? 'app' : 'both'; if (window.TribeInspo) { const r = await window.TribeInspo.apply(to); if (r) return say(`Done: ${esc(r.changed.join(', '))}. Accent ${esc(r.palette.accent)} on ${r.palette.mode === 'dark' ? 'a dark' : 'a light'} background.`, [act('Open the preview', 'preview')]); } return say('Drop a few pictures or a Pinterest link on the inspiration board (on the dashboard) first, then I can dress it up.'); }
    if ((m = RX.asset.exec(t))) return asset(m);
    if ((m = RX.make.exec(t))) return makeFile(/sheet|table|budget|tracker/.test(m[1]) ? 'sheet' : /slide|deck|presentation/.test(m[1]) ? 'deck' : 'doc', text);   // feat/crafts   // feat/customize: "make our website"
    if (RX.customize.test(t)) { ACTS.customize(/\b(banner|this project)\b/.test(t) ? 'project' : 'tribe'); return say('I opened Customize: accent, background, spacing, font size and the tribe\'s name and icon. "Just me" changes only your view.', [act('Open Customize again', 'customize')]); }
    if ((m = RX.task.exec(t)) && m[1].trim()) return task(text.slice(text.length - m[1].length).trim());
    if ((m = RX.note.exec(t))) return note(text.slice(text.length - m[1].length).trim());
    // Setup steps by name: Flint does them (and shows where they live) instead of explaining
    if ((m = RX.doStep.exec(t))) { const k = /task/.test(t) ? 'newtask' : /vision/.test(t) ? 'vision' : /repo/.test(t) ? 'repo' : 'claude';
      if (window.TribeProjects && window.TribeProjects.step) { window.TribeProjects.step(k); return say(k === 'newtask' ? 'Opened the Task Board with a new task ready. Give it a short name.' : k === 'vision' ? 'Opened the vision. Pick what it is and write the gist.' : k === 'repo' ? 'Making the code repository: a home for the code, right on the host.' : 'Here’s how to connect your AI. Pick your tool and copy one line.'); } }
    if ((m = RX.nav.exec(t))) { const map = { files: 'docs', docs: 'docs', documents: 'docs', code: 'docs', tasks: 'tasks', 'task board': 'tasks', board: 'tasks', chat: 'chat', messages: 'chat', home: 'hub', dashboard: 'home', overview: 'home', repo: 'repo', guide: 'guide', settings: 'settings', calendar: 'calendar', 'agents hub': 'agents', agents: 'agents', mcp: 'mcp', bugs: 'bugs', website: 'website', whiteboard: 'whiteboard', 'white board': 'whiteboard' }, v = map[m[1]];
      // Flint flies to the place in the sidebar first, so you learn where it lives, then opens it
      const ROW = { docs: '#nest-docs', tasks: '#nest-ws-tasks', chat: '#nest-chat', hub: '#rail-logo', home: '#nest-home', agents: '#nest-ws-agents', repo: '#pin-repo .nest-row', settings: '#ub-gear', calendar: '#nest-extra [data-wkey="calendar"]', bugs: '#nest-extra [data-wkey="bugs"]', website: '#nest-extra [data-wkey="website"]', whiteboard: '#wg-whiteboard' }, row = ROW[v] && document.querySelector(ROW[v]);
      const NAME = { docs: 'Files', tasks: 'Task Board', chat: 'Messages', hub: 'Home', home: 'The Dashboard', agents: 'Agents Hub', repo: 'Code repository', settings: 'Settings', calendar: 'Calendar', mcp: 'The MCP page', bugs: 'Bugs', website: 'Website', whiteboard: 'The whiteboard' };
      if (v === 'agents' || v === 'mcp') { if (FF()) { if (seen(row)) FF().done(row, 'Opening'); } else if (row && row.offsetParent && window.TribeFlintGuide && !matchMedia('(max-width: 820px)').matches) window.TribeFlintGuide.point(row, `${NAME[v]} lives here. Opening it for you.`, { next: 'Thanks' });
        if (v === 'mcp' && window.TribeMcpDir && window.TribeMcpDir.open) window.TribeMcpDir.open(); else { const inTribe = !!(C && C.hasToken && C.hasToken() && C.project && C.project()); if (inTribe && window.TribeShell) window.TribeShell.go('ws-agents'); else if (window.TribeAgentsHub) window.TribeAgentsHub.open({ global: true }); }   // feat/agents-free: never a dead end (no tribe: the Agent fleet)
        return say(`Opened ${NAME[v].replace(/^The /, 'the ')}.`); }
      if (FF()) { if (seen(row)) { FF().to(row, 'Opening'); await FF().beat(420); } }
      else if (row && row.offsetParent && window.TribeFlintGuide && !matchMedia('(max-width: 820px)').matches) window.TribeFlintGuide.point(row, `${NAME[v] || m[1]} lives here. Opening it for you.`, { next: 'Thanks' });
      ACTS.nav(v); if (FF()) later(260, () => { const w = v === 'whiteboard' ? seen('.wb') || seen('#whiteboard') || curView() : curView(); if (w) FF().done(w, NAME[v] ? NAME[v].replace(/^The /, '') : 'Here'); });
      return say(`Opened ${m[1] === 'home' ? 'Home' : v === 'whiteboard' ? 'the whiteboard' : m[1]}.`); }
    if ((m = RX.find.exec(t)) && !RX.help.test(t.replace(/^where('s| is)/, ''))) return find(text.slice(text.length - m[1].length).trim());
    if (RX.help.test(t) || /\b(guide|how do i|how to)\b/.test(t)) { const g = await guideSearch(text); if (g) return guideReply(g); if (RX.invite.test(t)) return invite(); return fallback(text, true); }
    if (RX.invite.test(t)) return invite();
    if (RX.hello.test(t)) return /^(thanks|thank you|thx|cheers)/.test(t) ? say('Any time.') : say(`Hi${C && C.state().me ? ' ' + esc(first(C.state().me.name)) : ''}. I can connect your AI, jot a note, add a task or tell you what's happening.`, chipsActs());
    return fallback(text);
  }
  const chipsActs = () => [act('Connect my AI', 'ask', 'Connect my AI'), act('What\'s happening?', 'ask', 'What\'s happening?')];
  const guideReply = g => say(`${g.heading && g.heading !== g.title ? `${g.title} › ${g.heading}: ` : `${g.title}: `}${g.snippet}`, [act('Open in Guide', 'guide', g.slug)], { guide: g.slug });

  async function note(body) {
    if (!body) return say('What should I write down? Say "note: …", or start a blank one.', [act('Start a blank note', 'newnote')]);
    const S = Hub() && Hub().scratch; if (!S) return say('Notes are not ready yet. Try again in a moment.');
    body = body.replace(/^(that|to)\s+/i, (x, w) => (w.toLowerCase() === 'to' ? 'To ' : ''));
    try { const id = await S.create(body.charAt(0).toUpperCase() + body.slice(1)); if (FF()) { const n = seen('#room-notes') || seen('#nest-docs') || curView(); if (n) FF().done(n, 'Noted ✓'); } return say(`Saved to your notes: “${body}”.`, id ? [act('Open note', 'note', id)] : [], { link: id ? 'note:' + id : '' }); }
    catch (e) { return say('I could not save that note: ' + e.message); }
  }
  async function task(title, extra, quiet) {   // flint-local: extra = { due, assignee, type } from flintnlu; quiet returns the task for flintlocal.js to word the reply
    if (!connected()) return say('Tasks live in a tribe. Host one on this computer or join a friend, then ask me again.', [act('Host or join', 'invite')]);
    title = title.charAt(0).toUpperCase() + title.slice(1);
    const tr = seen('#board') || seen('#nest-ws-tasks') || curView(); if (FF() && tr) FF().work(tr, 'Adding a task');
    try { const { task: tk } = await C.api('/tasks', { method: 'POST', body: { title: title.slice(0, 200), ...(extra || {}) } }); const p = PJ() && PJ().cur && PJ().cur();
      if (FF()) later(450, () => { const card = seen(`#board .task[data-id="${CSS.escape(tk.id)}"]`); FF().done(card || tr, card ? 'Added ✓' : 'Task added ✓'); });
      if (quiet) return tk;
      return say(`Added to Tasks${p ? ` in ${p.name}` : ''}: “${tk.title}”.`, [act('Open Tasks', 'nav', 'tasks')], { link: 'task:' + tk.id }); }
    catch (e) { if (FF()) FF().home(); say('I could not add that task: ' + e.message); return null; }
  }
  // feat/customize: the site generator (server/sitegen.js). A draft only; the host or the project lead publishes.
  async function website(t) {
    if (!connected()) return say('Websites belong to a project. Host or join a tribe first.', [act('Host or join', 'invite')]);
    const pid = PJ() && PJ().current && PJ().current(); if (!pid) return say('Open a project first, then ask me again.');
    const how = /\b(shuffle|another|different|new layout)\b/.test(t) ? 'shuffle' : /\b(redo|refresh|regenerate)\b/.test(t) ? 'regenerate' : 'generate';
    try {
      // feat/site-builder: "make a website" / "build a site for my bakery" runs Instant (the kind of site is guessed from the words)
      if (how === 'generate') {
        const r = await C.api(`/projects/${encodeURIComponent(pid)}/website/instant`, { method: 'POST', body: { hint: t } });
        const G = r.website.gen, L = (G.layouts.find(x => x.id === G.draft.layout) || {}).name || 'a', T = (G.types.find(x => x.id === r.type) || {}).name || 'site';
        if (window.TribeSiteGen && window.TribeSiteGen.mode) window.TribeSiteGen.mode('instant');
        ACTS.website(); if (FF()) later(400, () => { const w = seen('#pvw') || curView(); if (w) FF().done(w, 'Website draft ✓'); });
        return say(`Here's a draft in the ${L} layout as ${/^[aeiou]/i.test(T) ? 'an' : 'a'} ${T.toLowerCase()}, filled from what the project has. It's in the preview now. Nothing is live yet${G.canPublish ? ': press Publish when you like it' : ': the host or the project lead publishes it'}.`,
          [act('Open Website', 'website'), act('Another layout', 'ask', 'Shuffle our website layout')]);
      }
      const r = await C.api(`/projects/${encodeURIComponent(pid)}/website/gen`, { method: 'POST', body: { how } });
      const G = r.website.gen, L = (G.layouts.find(x => x.id === G.draft.layout) || {}).name || 'a';
      ACTS.website();
      return say(`Here's a draft in the ${L} layout, filled from the bio, vision, screenshots, saved changes and team. Nothing is live yet${G.canPublish ? ': press Publish when you like it' : ': the host or the project lead publishes it'}.`,
        [act('Open Website', 'website'), act('Another layout', 'ask', 'Shuffle our website layout')]);
    } catch (e) { return say('I could not make the draft: ' + e.message); }
  }
  // feat/focus: what you're on, what's next, and a prompt that keeps your AI helper in your part of the code
  async function focusReply() {
    if (!connected()) return say('Join or host a tribe and I can tell you what to work on next.', [act('Host or join', 'invite')]);
    const r = await room(), mine = r.mine || [], meId = r.meId;
    let tasks = []; try { tasks = (await C.api('/tasks')).tasks || []; } catch {}
    const open = tasks.filter(x => x.status !== 'done'), now = open.find(x => x.assignee === meId && x.status === 'doing') || open.find(x => x.assignee === meId);
    const next = open.find(x => !x.assignee && x.status !== 'review'), review = open.filter(x => x.status === 'review' && x.assignee !== meId);
    const parts = [now ? `You're on “${now.title}”.` : 'Nothing is assigned to you yet.', next ? `Next up for anyone: “${next.title}”.` : '', review.length ? `${review.length} task${review.length === 1 ? '' : 's'} waiting for someone to review.` : ''].filter(Boolean);
    return say(parts.join(' '), [act('Copy a prompt for my AI', 'prompt'), act('Open Tasks', 'nav', 'tasks')]);
  }
  // feat/crafts: Flint writes a doc, a sheet or slides into Files (server/flint.js /api/flint/make)
  async function makeFile(kind, text) {
    const D = window.TribeDocs, name = { doc: 'doc', sheet: 'sheet', deck: 'slides' }[kind];
    if (!D) return say('Files are not ready yet. Try again in a moment.');
    if (!connected()) return say(`I write ${name} with the tribe's brain. Host or join a tribe first.`, [act('Host or join', 'invite')]);
    const msg = say(`Writing the ${name}…`, [], { streaming: true });
    const fd = seen('#nest-docs') || curView(); if (FF() && fd) FF().work(fd, 'Writing…');
    try {
      const r = await C.api('/flint/make', { method: 'POST', body: { kind, ask: text } });
      const doc = await D.create(r.title || 'Untitled', r.body || '', undefined, kind === 'doc' ? undefined : kind);
      App().show('docs'); setTimeout(() => D.open(doc.slug), 60);
      if (FF()) { later(380, () => { const ed = seen('#doc-body') || seen('#view-docs'); if (ed) FF().work(ed, 'Writing…'); }); later(1500, () => { const ed = seen('#doc-body') || seen('#view-docs'); FF().done(ed, 'Done ✓'); }); }
      msg.text = `${r.basic ? (r.note || 'Basic mode: I started you from a template.') : `Done: “${doc.title}” is in Files.`} ${kind === 'sheet' ? 'Click a cell to change it; = starts a formula.' : kind === 'deck' ? 'Press Present when it looks right.' : 'Edit away, the tribe sees it live.'}`;
      msg.acts = [act(`Open the ${name}`, 'doc', `${(PJ() && PJ().current && PJ().current()) || ''}|${doc.slug}`), ...(r.basic ? [act('Give Flint a brain', 'brain')] : [])];
    } catch (e) { msg.text = `I could not write that ${name}: ${e.message}`; if (FF()) FF().home(); }
    delete msg.streaming; save(); draw(); return msg;
  }
  // Which agent a sentence names ("add codex" -> codex); null when it names none ("invite my agent").
  const AGENT_WORDS = [['claude', /\bclaude\b/, 'Claude'], ['cursor', /\bcursor\b/, 'Cursor'], ['codex', /\bcodex\b/, 'Codex'], ['chatgpt', /\bchat ?gpt\b/, 'ChatGPT'], ['gemini', /\bgemini\b/, 'Gemini'], ['vscode', /\b(vs ?code|copilot)\b/, 'VS Code'], ['windsurf', /\bwindsurf\b/, 'Windsurf'], ['cline', /\bcline\b/, 'Cline'], ['zed', /\bzed\b/, 'Zed']];
  const agentKindIn = t => { const w = AGENT_WORDS.find(x => x[1].test(String(t || '').toLowerCase())); return w ? w[0] : null; };
  function inviteClaude(t) {
    const kind = agentKindIn(t), name = kind ? AGENT_WORDS.find(x => x[0] === kind)[2] : '';
    if (!connected()) return say(`Your ${name || 'agent'} joins a tribe. Host one on this computer or join a friend first.`, [act('Host or join', 'invite')]);
    ACTS.inviteagent(kind || undefined);
    return say(name ? `Here's your ${name}'s invite. Copy what it shows into ${name} and it joins next to you, with your access and never more.` : 'Here\'s the invite for your AI agent. Pick which one (Claude, Cursor, Codex, ChatGPT, Gemini…), copy what it shows, and it joins next to you, with your access and never more.', [act('Open it again', 'inviteagent', kind || undefined)]);
  }
  function invite() { ACTS.invite(); if (FF()) later(300, () => { const ib = seen('#invite-body'); if (ib) FF().done(ib, 'Invite ready'); }); return say(connected() ? 'Here\'s your invite. Send the link to a friend: they tap it, type a name, and they\'re in.' : 'Invites come from a tribe. Host one on this computer first, then invite friends.', [act('Open invite again', 'invite'), act('How invites work', 'guide', 'projects-and-invites')]); }
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
      if (!connected()) return say('Autopilot runs on the tribe host. Host or join a tribe first.', [act('Host or join', 'invite')]);
      try { await C.api('/repo/settings', { method: 'PUT', body: { autopilot: { enabled: on } } }); return say(on ? 'Autopilot is on. Every change it makes is listed under Code repository.' : 'Autopilot is off.', [act('Open the code repository', 'repo')]); }
      catch (e) { return say(e.status === 403 ? 'Only the host can switch autopilot.' : 'Autopilot needs a project with a code repository: ' + e.message, [act('Open the code repository', 'repo')]); }
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
    const cm = r.commit ? ` Last saved change: “${r.commit.title}”${r.commit.byName ? ` by ${first(r.commit.byName)}` : ''}${r.commit.at ? `, ${ago(r.commit.at)}` : ''}.` : '';
    return say(who + ag + tk + cm, [act('Open Tasks', 'nav', 'tasks'), act('Open chat', 'nav', 'chat')]);
  }
  async function summarize() {   // feat/flint-runthrough: works with no AI (extractive, aibasics-core.js); an AI refines it in place
    if (!connected()) return say('There\'s no chat yet: host or join a tribe first.');
    let msgs = [];
    try { msgs = ((await C.api('/chat/' + encodeURIComponent((window.TribeChannels && window.TribeChannels.current && window.TribeChannels.current()) || 'general'))).messages || []).filter(x => x.by !== 'tribecode' && x.text).slice(-80); } catch {}
    if (!msgs.length) try { msgs = ((await C.api('/chat/general')).messages || []).filter(x => x.by !== 'tribecode' && x.text).slice(-80); } catch {}
    if (!msgs.length) return say('The chat is quiet so far: nothing to summarize.');
    const st = C.state(), nm = id => ((st.members || []).find(x => x.id === id) || {}).name || 'someone';
    const lines = msgs.map(x => ({ who: nm(x.by), text: String(x.text).slice(0, 400) }));
    const basic = window.TribeAICore ? window.TribeAICore.summarize(lines) : { lines: [`${msgs.length} messages.`] };
    const msg = say(`✦ **Chat summary** · Basic · no AI\n${basic.lines.map(l => `- ${l}`).join('\n')}`);
    await refreshModel();
    if (model.online || (window.TribeAIBasics && (await window.TribeAIBasics.online()).online)) {
      try { const r = await C.api('/ai/refine', { method: 'POST', body: { kind: 'chat.summary', input: lines, draft: basic.text } }); if (r && r.text) { msg.text = `✦ **Chat summary** · via ${esc(r.via)}\n${r.text.split('\n').filter(Boolean).map(l => `- ${l.replace(/^\s*[-*•]\s*/, '')}`).join('\n')}`; msg.via = r.via; save(); draw(); } } catch {}
    }
    return msg;
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
    // feat/flint-unify: the AI card only when the ask really needs generation (long copy, pictures, code). Anything
    // else gets one short question with chips that do something real.
    const NL = window.TribeNLU, ctx = sink ? sink.ctx : 'app';
    if (!(NL && NL.needsAI && !NL.needsAI(text))) return say('', [], { html: boostHtml(text, ctx) });
    const q = NL.clarify(text, { view: ctx });
    return say(q.q, q.chips.map(c => c.fill ? act(c.label, 'fill', c.say) : act(c.label, 'ask', c.say)));
  }
  const BOOST = {
    app: ['Nothing changed. For free I add, finish and assign tasks, tell people things, schedule, switch themes, design websites and screens from templates, and answer how-to questions from the docs.', 'An AI reads what you mean and does this one too: longer writing, pictures and code.'],
    designer: ['Nothing changed. For free I add links, socials, buttons, pages and sections, change any words, colors and layouts, and export HTML.', 'An AI writes new copy or pictures for this site and turns them into the same edits here, each one undoable.'],
    canvas: ['Nothing changed on the canvas. For free I draw screens from templates, align, group, tidy, rename, recolor and export.', 'An AI draws what you described as real layers here, and Undo takes it back.'],
    preview: ['Nothing changed yet. For free I edit what you pick, build first versions from recipes and reload the preview.', 'An AI makes this change in your code, and the preview reloads as it saves.'],
  };
  const boostHtml = (ask, ctx) => { const b = BOOST[ctx] || BOOST.app; return window.TribeBoost ? window.TribeBoost.html({ did: b[0], would: b[1], ask }) : esc(b[0]); };

  // ---------- a brain: built in (this browser, WebLLM) or the tribe's (server/flint.js → server/llm.js), streamed ----------
  async function browserReply(text, extra) {
    const r = connected() ? await room().catch(() => null) : null;
    const history = thread.slice(-9, -1).map(m => ({ role: m.who === 'flint' ? 'assistant' : 'user', content: String(m.text).slice(0, 400) }));
    const msg = say(B().browserReady() ? '…' : 'Waking up the built-in model (the first time downloads it)…', [], { streaming: true });
    try {
      const out = await B().askBrowser([{ role: 'system', content: SYSTEM + (window.TribeFlintMem ? window.TribeFlintMem.brief() : '') + (r ? `\n\nRoom facts:\n${roomText(r)}` : '') + (extra ? `\n\nRecent chat:\n${extra}` : '') }, ...history, { role: 'user', content: text }],
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
      if (res.status === 402) {   // feat/auth3-pay: out of AI credits. Once per session: a calm line and the plans; after that the basic answer, quietly.
        const j = await res.json().catch(() => ({})); let told = false; try { told = sessionStorage.getItem('tribecode.flint.402') === '1'; sessionStorage.setItem('tribecode.flint.402', '1'); } catch {}
        if (j.need === 'credits' && !told) {
          msg.text = window.TribePremium && window.TribePremium.offered && window.TribePremium.offered() ? 'The AI credits have run out, so I\'m answering in basic mode for now. The plans are open if you want more, and your own AI is always free.' : 'The AI credits have run out, so I\'m answering in basic mode for now. Your own AI is always free to connect.'; msg.acts = [act('Flint\'s brain', 'brain')]; msg.noCredits = true; delete msg.streaming; save(); draw();
          if (window.TribePlans && window.TribePlans.open && !window.TribePlans.isOpen()) window.TribePlans.open(null);
          return;
        }
      }
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
    if (window.TribeFlintMem) window.TribeFlintMem.log(text);   // v0.27.1: notices repeats and offers to make a skill
  }

  // ---------- view ----------
  const CHIPS = ['Connect my AI', 'What\'s happening?'];   // simple right panel: two, the rest is one question away
  const statusLine = () => (model.online ? `ready · ${model.browser ? 'built in' : model.cloud ? 'the host\'s AI' : 'local model on'}` : 'basic mode · no model');
  const privLine = () => {   // qa-pass: say where words actually go (a friend's words go to the host; a cloud model sees what you ask)
    const host = !(window.TribeClient && window.TribeClient.state && window.TribeClient.state().me) || window.TribeClient.state().me.role === 'host';
    if (model.online && model.cloud) return `Flint uses ${model.via || model.model} through the host's key, so what you ask goes to that service. The key never leaves the host.`;
    if (model.online && model.browser) return '🔒 Runs in your browser. Nothing you type here leaves it.';
    return host ? '🔒 Nothing you type here leaves it.' : '🔒 What you type stays in this tribe.';
  };
  // Early on Flint keeps it simple: a short hello and the next setup steps as nudges. He shows more as the tribe grows.
  const NUDGE = { vision: ['✨ Write the vision', 'vision'], task: ['📝 Add a first task', 'newtask'], agent: ['🤖 Connect my AI', 'claude'], repo: ['🌿 Create the code repository', 'repo'] };   // feat/setup-flow: the four setup steps
  function emptyHtml() {
    const S = window.TribeStage, lv = S ? S.level() : 'going', st = S ? S.steps() : null;
    if (lv !== 'going' && st) {   // the next steps are big cards at the top of the panel; Flint just says hi
      return `<div class="fl-empty"><p class="fl-hi"><b>Hi, I'm Flint.</b> ${lv === 'new' ? 'Pick a step above and I’ll show you where it happens.' : 'Nice start. Ask me anything, or pick the next step above.'}</p></div>`;
    }
    return `<div class="fl-empty"><p class="fl-hi"><b>Hi, I'm Flint.</b> Ask me anything.</p>
      <div class="fl-chips">${CHIPS.map(c => `<button class="fl-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <p class="fl-priv">${esc(privLine())}</p></div>`;
  }
  const linkify = s => esc(s).replace(/```[a-z]*\n?([\s\S]*?)```/g, (_, c) => `<pre class="fl-code"><code>${c.replace(/\n$/, '')}</code></pre>`)   // v0.27.1: lessons show code
    .replace(/`([^`\n]{1,80})`/g, '<code>$1</code>').replace(/\*\*([^*\n]{1,120})\*\*/g, '<b>$1</b>').replace(/“([^”]{1,120})”/g, '“<b>$1</b>”');
  const EVI = { reload: '↻', file: '✎', error: '!', agent: '◆', ask: '→', build: '▣', info: '·' };
  function msgHtml(m, i) {
    if (m.who === 'ev') return `<div class="fl-ev fl-ev-${esc(m.k || 'info')}" data-i="${i}"><span class="fl-ev-ic" aria-hidden="true">${EVI[m.k] || '·'}</span><span class="fl-ev-t">${m.who2 ? `<b>${esc(m.who2)}</b> ` : ''}${m.html || linkify(m.text)}${m.add != null ? ` <span class="fl-diff"><ins>+${m.add}</ins> <del>−${m.del || 0}</del></span>` : ''}</span>${(m.acts || []).length ? `<span class="fl-acts">${m.acts.map((a, j) => `<button class="fl-act" data-act="${i}:${j}">${esc(a.label)}</button>`).join('')}</span>` : ''}</div>`;
    const mine = m.who === 'me';
    return `<div class="fl-msg ${mine ? 'me' : 'fl'}${m.streaming ? ' streaming' : ''}${m.undone ? ' undone' : ''}" data-i="${i}">${mine ? '' : `<span class="fl-av sm">${flintIco(12)}</span>`}
      <div class="fl-b">${mine && m.name ? `<small class="fl-who">${esc(m.name)}</small>` : ''}${m.text ? `<div class="fl-t">${linkify(m.text)}</div>` : ''}${m.html ? `<div class="fl-h">${m.html}</div>` : ''}${m.via && !m.streaming ? `<small class="fl-via">via ${esc(m.via)}</small>` : ''}${(m.acts || []).length ? `<div class="fl-acts">${m.acts.map((a, j) => `<button class="fl-act${a.primary ? ' primary' : ''}" data-act="${i}:${j}"${a.off ? ' disabled' : ''}>${esc(a.label)}</button>`).join('')}</div>` : ''}</div></div>`;
  }
  function threadHtml() { return thread.length ? thread.map(msgHtml).join('') : emptyHtml(); }
  function barHtml(id) {
    return `<form class="fl-bar" data-flbar autocomplete="off"><button type="button" class="fl-av fl-me" data-flme title="What Flint can do" aria-label="What Flint can do" aria-haspopup="menu">${flintIco(14)}</button>
      <input class="fl-in" ${id ? `id="${id}"` : ''} placeholder="Ask Flint…" aria-label="Ask Flint" maxlength="2000" enterkeyhint="send">
      <button type="button" class="fl-ic fl-att" data-dzpick title="Add files or a folder (Ctrl Shift U)" aria-label="Add files or a folder"><svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px" aria-hidden="true"><path d="M20 11.5 12.6 19a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4L15 7.2"/></svg></button>
      <button type="button" class="fl-ic fl-mic" data-flmic title="Dictate" aria-label="Dictate">${ico('i-mic', 16)}</button>
      <button type="submit" class="fl-ic fl-send" title="Send" aria-label="Send">${SEND}</button></form>`;
  }
  const threads = () => [...document.querySelectorAll('.fl-thread, .fh-thread')];   // feat/flint-ai: the Home card's thread too
  window.addEventListener('tribe:stage', () => { if (!thread.length) draw(); });   // nudges follow the project's progress
  function draw() {
    mounts.forEach(u => u.draw());
    threads().filter(el => !el.closest('.flint-mount')).forEach(el => { el.innerHTML = threadHtml(); el.scrollTop = el.scrollHeight; });
    const dock = $('#flint'); if (dock) { dock.classList.toggle('has-msgs', thread.length > 0); const c = dock.querySelector('#fl-clear'); if (c) c.hidden = !thread.length; }
  }
  function drawLast() {
    mounts.forEach(u => u.draw());
    const i = thread.length - 1, m = thread[i];
    threads().filter(el => !el.closest('.flint-mount')).forEach(el => { const n = el.querySelector(`.fl-msg[data-i="${i}"] .fl-t`); if (n) { n.innerHTML = linkify(m.text); el.scrollTop = el.scrollHeight; } else { el.innerHTML = threadHtml(); el.scrollTop = el.scrollHeight; } });
  }
  function drawStatus() { document.querySelectorAll('[data-flst]').forEach(e => { e.textContent = statusLine(); e.classList.toggle('ok', model.online); }); }
  // The flame in the Ask bar: a small menu of what Flint does (feat: clickable Flint)
  function flintMenu(btn, root, sendFn) {
    const go = sendFn || (t => { setOpen(true); send(t); });
    const old = document.getElementById('fl-menu'); if (old) { old.remove(); return; }
    const input = root.querySelector('.fl-in');
    const fill = t => { if (input) { input.value = t; input.focus(); input.setSelectionRange(t.length, t.length); } };
    const items = [
      ['🎯', 'What should I do next?', 'Your task, and what is next for the tribe', () => go('what should i do next?')],
      ['🤖', 'Prompt for my AI helper', 'Keeps it in your part of the code', () => go('copy a prompt for my ai')],
      ['📰', "What's new?", 'A quick catch-up on the project', () => go("what's new?")],
      ['📝', 'Take a note', 'Saved for the whole tribe', () => fill('note: ')],
      ['✅', 'Make a task', 'Straight onto the Task Board', () => fill('task: ')],
      ['📄', 'Write a doc', 'A page, plan or write-up in Files', () => fill('write a doc about ')],
      ['📊', 'Make a sheet', 'A table with working formulas', () => fill('make a sheet for ')],
      ['🎞️', 'Make slides', 'A deck you can present', () => fill('make slides about ')],
      ['🔎', 'What did we decide?', 'Searches chat, notes and captures', () => fill('what did we decide about ')],
      ['🧭', 'Show me around', 'A 30-second tour of the app', () => window.TribeFlintGuide && window.TribeFlintGuide.tour()],
      ['✨', 'What can Flint do?', 'Search everything he does, and try it', () => (window.TribeFlintPage ? window.TribeFlintPage.open() : window.TribeFlintGuide && window.TribeFlintGuide.intro(input))],   // feat/flint-max: his page
      ['🧠', "Pick Flint's brain", 'Choose the model he thinks with', () => window.TribeBrain && window.TribeBrain.open()],
      ['⭐', 'Rate TribeCode', 'Tell us how it went, good or bad', () => window.TribeFeedback && window.TribeFeedback.open()],
    ];
    const m = document.createElement('div'); m.id = 'fl-menu'; m.className = 'fl-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="fl-menu-h">${flintIco(16)}<b>Flint</b><small>${esc(statusLine())}</small></div>` + items.map(([e, t, s], i) => `<button type="button" role="menuitem" data-fm="${i}"><span class="fm-e" aria-hidden="true">${e}</span><span><b>${esc(t)}</b><small>${esc(s)}</small></span></button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    m.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
    const close = () => { m.remove(); removeEventListener('mousedown', out, true); removeEventListener('keydown', esc_, true); };
    const out = ev => { if (!m.contains(ev.target) && !btn.contains(ev.target)) close(); };
    const esc_ = ev => { if (ev.key === 'Escape') { close(); btn.focus(); } };
    addEventListener('mousedown', out, true); addEventListener('keydown', esc_, true);
    m.querySelectorAll('[data-fm]').forEach(b => b.onclick = () => { close(); items[+b.dataset.fm][3](); });
    const first = m.querySelector('[data-fm]'); if (first) first.focus();
  }
  function wire(root) {
    if (window.TribeBoost) window.TribeBoost.bind(root);
    root.addEventListener('click', e => {
      const ns = e.target.closest('[data-step]'); if (ns && ns.closest('.fl-empty')) { if (window.TribeProjects && window.TribeProjects.step) window.TribeProjects.step(ns.dataset.step); return; }
      const c = e.target.closest('[data-chip]'); if (c) { const v = c.dataset.chip; if (v === 'Capture a note') { const i = root.querySelector('.fl-in'); if (i) { i.value = 'note: '; i.focus(); } return; } return send(v); }
      const a = e.target.closest('[data-act]'); if (a) { const [i, j] = a.dataset.act.split(':').map(Number), x = thread[i] && thread[i].acts[j]; if (x && ACTS[x.act]) { if (x.act !== 'ask' && phone()) closeFull(); ACTS[x.act](x.arg); } return; }
      const me = e.target.closest('[data-flme]'); if (me) { e.preventDefault(); flintMenu(me, root); return; }
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
  // a quiet message from Flint with one button (feedback.js asks for a review this way, once)
  const nudge = (text, label, actName, arg) => say(text, [act(label, actName, arg)]);
  function prefill(t) { focus(); setTimeout(() => { const i = document.querySelector('.fl-in, #fl-in, [data-flin]'); if (i) { i.value = t; i.focus(); i.setSelectionRange(t.length, t.length); } }, 60); }
  // feat/flint-ai: Flint on the Dashboard (Home), with or without a tribe. The same thread as the room panel; the chips
  // are his dashboard abilities: today's plan, grow your idea, the inspiration board, your files, start a project.
  function dashChips() {
    const on = connected();
    return [['✦', 'Today\'s plan', 'plan my day'], ['🌱', 'Grow my idea', 'grow my idea'], ['🎨', 'Inspiration board', 'open my inspiration board'], ['📁', 'My files', 'open my files'],
      on ? ['📚', 'Learn something', 'resources to grow my company'] : ['➕', 'Start a project', 'start a project'], ['❔', 'What can you do?', 'what can you do']];
  }
  function mountDashboard(el) {
    if (!el) return null;
    let card = el.querySelector('#flint-home');
    if (!card) {
      card = document.createElement('section'); card.className = 'flint-home'; card.id = 'flint-home'; card.setAttribute('aria-label', 'Flint');
      el.appendChild(card);
      card.innerHTML = `<div class="fh-head"><span class="fl-av" aria-hidden="true">${flintIco(16)}</span><div class="fh-id"><span class="eyebrow">Flint · ${connected() ? 'your helper' : 'works without a tribe'}</span><h2>Ask Flint</h2></div><span class="fl-st" data-flst>${statusLine()}</span></div>
      <div class="fh-chips" role="group" aria-label="Flint's shortcuts">${dashChips().map(([e, l, q]) => `<button type="button" class="fl-chip fh-chip" data-fhq="${esc(q)}"><span aria-hidden="true">${e}</span>${esc(l)}</button>`).join('')}</div>
      <div class="fh-thread" role="log" aria-live="polite" aria-label="Conversation with Flint"></div>${barHtml('fh-input')}`;
    }
    if (!card._wired) { card._wired = true; wire(card); card.addEventListener('click', e => { const b = e.target.closest('[data-fhq]'); if (b) send(b.dataset.fhq); }); }
    draw(); drawStatus(); refreshModel();
    return card;
  }

  // ---------- one Flint chat everywhere (feat/flint-unify) ----------
  // TribeFlint.mount(el, { ctx, run, chips, onSay, onClear, tools, placeholder }) puts Flint's own chat (the same thread,
  // composer, chips, AI-boost card and history look) inside an editor: the website designer, the design canvas, the
  // live preview. run(text, ui) does the editor's own commands and returns 'flint' to hand the rest to Flint's full
  // brain, whose replies land in this thread (sink). onSay(m) lets an editor keep the thread in its own log (undo
  // history, a shared canvas thread); otherwise the thread is kept per ctx on this device.
  //   ui = { ctx, el, thread, say(text, acts, extra), ev(text, extra), me(text), add(m), set(list), draw(), chips(list),
  //          send(text), flint(text), capture(text), fill(text), focus(), extra, input }
  const CTXN = { designer: 'Website', canvas: 'Design', preview: 'Preview', app: 'Anywhere' };
  const CTXPH = { designer: 'Tell Flint what to change…', canvas: 'Describe a screen or a change…', preview: 'Ask Flint to change…', app: 'Ask Flint…' };
  function mount(el, o = {}) {
    if (!el) return null;
    const ctx = o.ctx || 'app';
    const old = el.querySelector(`.flint-mount[data-flctx="${ctx}"]`); if (old && old._ui) return old._ui;
    const root = document.createElement('section'); root.className = 'flint-mount'; root.dataset.flctx = ctx; root.setAttribute('aria-label', 'Flint');
    root.innerHTML = `<header class="flm-head"><span class="fl-av sm" aria-hidden="true">${flintIco(12)}</span><b class="flm-name">Flint</b><span class="fl-eyebrow flm-ctx">${esc(CTXN[ctx] || ctx)}</span><span class="fl-st" data-flst>${statusLine()}</span>
        <span class="flm-tools"></span><button type="button" class="fl-x" data-flm="clear" title="Clear the thread" aria-label="Clear the thread"${o.onClear || !o.onSay ? '' : ' hidden'}>${ico('i-x', 13)}</button></header>
      <div class="fl-thread flm-thread" role="log" aria-live="polite" aria-label="Conversation with Flint"></div>
      <div class="fl-chips flm-chips" role="group" aria-label="Suggestions"></div>
      <div class="flm-extra"></div>${barHtml('flm-in-' + ctx)}`;
    el.appendChild(root);
    const KEYT = `tribecode.flint.thread.${ctx}${o.key ? '.' + o.key : ''}`;
    let list = o.onSay ? [] : (ls.get(KEYT, []) || []).filter(m => m && (m.text != null || m.html)).slice(-MAX), chipList = [];
    const box = root.querySelector('.flm-thread'), chipBox = root.querySelector('.flm-chips'), input = root.querySelector('.fl-in');
    if (o.placeholder || CTXPH[ctx]) input.placeholder = o.placeholder || CTXPH[ctx];
    const keep = () => { if (!o.onSay) ls.set(KEYT, list.slice(-MAX).map(m => ({ who: m.who, text: m.text, html: m.html, acts: (m.acts || []).filter(a => a.act), at: m.at, k: m.k }))); };
    const ui = {
      ctx, el: root, input, extra: root.querySelector('.flm-extra'), tools: root.querySelector('.flm-tools'), busy: false,
      get thread() { return list; },
      add(m) { m.at = m.at || new Date().toISOString(); m.acts = m.acts || []; if (o.onSay) o.onSay(m); else { list.push(m); list = list.slice(-MAX); keep(); } ui.draw(); return m; },
      say: (text, acts, extra) => ui.add({ who: 'flint', text: String(text || ''), acts: acts || [], ...(extra || {}) }),
      ev: (text, extra) => ui.add({ who: 'ev', text: String(text || ''), ...(extra || {}) }),
      me: text => ui.add({ who: 'me', text: String(text || '') }),
      set(l) { list = l || []; ui.draw(); },
      draw() {
        const empty = !list.length && !ui.busy;
        box.innerHTML = empty ? `<div class="fl-empty"><p class="fl-hi"><b>Hi, I'm Flint.</b> ${esc(o.hello || 'Say what you want. Everything I do here can be undone.')}</p></div>`
          : list.map(msgHtml).join('') + (ui.busy && (!list.length || list[list.length - 1].who === 'me') ? `<div class="fl-msg fl streaming"><span class="fl-av sm">${flintIco(12)}</span><div class="fl-b"><div class="fl-t">On it…</div></div></div>` : '');
        box.scrollTop = box.scrollHeight;
        const c = root.querySelector('[data-flm="clear"]'); if (c && !o.onSay) c.hidden = !list.length;
      },
      chips(l) {
        chipList = (l || []).map(c => typeof c === 'string' ? { label: c.replace(/…$/, '…'), say: c, fill: /…$/.test(c) } : c).filter(Boolean);
        chipBox.innerHTML = chipList.map((c, i) => `<button type="button" class="fl-chip" data-flchip="${i}">${esc(c.label)}</button>`).join('');
        chipBox.hidden = !chipList.length;
      },
      fill(t) { input.value = String(t || '').replace(/…$/, ''); input.focus(); try { input.setSelectionRange(input.value.length, input.value.length); } catch {} },
      focus(prefillText) { if (typeof prefillText === 'string') ui.fill(prefillText); else if (!phone()) input.focus({ preventScroll: true }); },
      clearAll() { if (o.onClear) o.onClear(ui); else { list = []; keep(); ui.draw(); } },
      async flint(text) { const prev = sink; sink = ui; try { await route(text); } finally { sink = prev; } },
      async capture(text) { const out = []; const cap = { ctx, add: m => { out.push(m); return m; }, draw() {} }; const prev = sink; sink = cap; try { await route(text); } finally { sink = prev; } return out; },
      async send(text) {
        text = String(text || '').trim(); if (!text || ui.busy) return;
        ui.busy = true; if (o.echo !== false) ui.me(text); else ui.draw();
        try { const r = o.run ? await o.run(text, ui) : 'flint'; if (r === 'flint') { ui.busy = false; await ui.flint(text); } }
        catch (e) { ui.say('Something went wrong: ' + (e && e.message || e)); }
        finally { ui.busy = false; ui.draw(); if (o.after) try { o.after(ui); } catch {} }
        if (window.TribeFlintMem) try { window.TribeFlintMem.log(text); } catch {}
      },
    };
    root._ui = ui; mounts.add(ui);
    root.addEventListener('click', e => {
      const ch = e.target.closest('[data-flchip]'); if (ch) { const c = chipList[+ch.dataset.flchip]; if (!c) return; if (c.fn) return c.fn(ui); return c.fill ? ui.fill(c.say) : ui.send(c.say); }
      const a = e.target.closest('[data-act]'); if (a && root.contains(a)) {
        const [i, j] = a.dataset.act.split(':').map(Number), x = list[i] && list[i].acts && list[i].acts[j]; if (!x) return;
        if (x.fn) return x.fn(ui, a);
        if (x.act === 'ask') return ui.send(x.arg);
        if (x.act === 'fill') return ui.fill(x.arg);
        if (x.act === 'meant') { let m = {}; try { m = JSON.parse(x.arg); } catch {} if (m.say && m.means && window.TribeFlintLocal && window.TribeFlintLocal._learn) window.TribeFlintLocal._learn(m.say, m.means); return ui.send(m.means || ''); }
        if (ACTS[x.act]) ACTS[x.act](x.arg); return;
      }
      if (e.target.closest('[data-flm="clear"]')) { if (o.onClear) o.onClear(ui); else { list = []; keep(); ui.draw(); } return; }
      const me = e.target.closest('[data-flme]'); if (me) { e.preventDefault(); flintMenu(me, root, t => ui.send(t)); return; }
      const mic = e.target.closest('[data-flmic]'); if (mic) { if (window.TribeSpeech && window.TribeSpeech.supported && window.TribeSpeech.supported()) window.TribeSpeech.dictate(input); else toast((window.TribeSpeech && window.TribeSpeech.HINT) || 'Dictation is not available in this browser.'); }
    });
    root.querySelector('[data-flbar]').addEventListener('submit', e => { e.preventDefault(); const v = input.value; input.value = ''; if (window.TribeSpeech && window.TribeSpeech.stopDictation) try { window.TribeSpeech.stopDictation(); } catch {} ui.send(v); });
    input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape' && o.onEscape) { e.preventDefault(); o.onEscape(ui); } });
    if (window.TribeBoost) window.TribeBoost.bind(root, o.onAI ? { onAI: (t, b) => o.onAI(t, b, ui) } : {});
    if (o.tools) o.tools.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fl-x flm-tool'; b.title = t.title || ''; b.setAttribute('aria-label', t.title || t.label || ''); b.innerHTML = t.html || esc(t.label || ''); if (t.attrs) Object.entries(t.attrs).forEach(([k, v]) => b.setAttribute(k, v)); b.onclick = () => t.fn(ui, b); ui.tools.appendChild(b); });
    ui.chips(typeof o.chips === 'function' ? o.chips() : o.chips || []);
    ui.draw(); drawStatus();
    return ui;
  }
  { const slot = document.getElementById('hub-flint-slot'); if (slot) setTimeout(() => mountDashboard(slot), 0); }   // Home drew before Flint loaded
  window.TribeFlint = { mount, mounts: () => [...mounts], mountDashboard, redraw: () => { save(); draw(); }, prefill, focus, openFull, closeFull, ask: send, thread: () => thread.slice(), clear, status: () => ({ ...model }), nudge,
    say: (text, acts, extra) => say(text, acts || [], extra), act, step: async t => { push('me', t); await route(t); }, think: async t => { await refreshModel(); if (!model.online) return false; await modelReply(t); return true; } };   // v0.27.1: flintmem.js uses say/act/step/think
})();
