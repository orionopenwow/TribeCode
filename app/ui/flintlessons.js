// Flint's lessons (feat/flint-site): a short built-in lesson for every feature, with "Show me" that opens the real
// place and rings the real control. "teach me <feature>" or "how do I <thing>" (app/ui/flintnlu.js intent 'lesson')
// opens it from Flint's chat, the canvas, the preview or the website designer. Longer reading points to the Guide
// (docs/guide, TribeGuide) or the Academy where they exist. No AI. Shared with node for the lesson index test.
//   LESSONS[feature] = { title, steps: [..], show: { go, sel, say }, guide?, academy? }
//   window.TribeFlintLessons = { LESSONS, open(feature), close(), showMe(feature), tour(steps), ring(el, text), unring() }
//   A lesson may have tour: [{ sel, say }]: Show me rings each in turn (Work's guide uses it).
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeFlintLessons = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LESSONS = {
    site: { title: 'The website designer', steps: ['Pick a template, or tell Flint what the site is for: “something for my band”.', 'Click any words in the preview and type. Click a button to choose where it goes.', 'Blocks on the left: + Add block, drag to reorder, pick a layout on the right.', '“Dark mode”, “add a page called About”, “make the buttons work”: every change has Undo.', 'Download HTML gives one standalone file; the zip has a file per page.'], show: { go: 'designer', sel: '#wdz-blocks, #flm-in-designer', say: 'Blocks live here. Click one, or add a new one below.' }, guide: 'start-here' },
    canvas: { title: 'Design (the canvas)', steps: ['Ask Flint for a screen: “a login screen for Ember”. It is real layers with auto layout.', 'Select a frame and say “dark mode”: the layers are recolored in place, Ctrl Z undoes it.', '“Wire this button to the login screen” links a layer to another screen.', '“Send to app” turns a frame into code in the project.'], show: { go: 'canvas', sel: '#cv-flint-btn, #flm-in-canvas, #nest-canvas', say: 'Talk to Flint here, or draw with the tools.' } },
    preview: { title: 'The live preview', steps: ['Preview runs your app, game or site beside everything else.', 'App | Website switches what it shows. Website opens the designer with “Design”.', 'Edit lets you click an element and change it in plain words, free.', 'Saved keeps versions you can compare and restore.'], show: { go: 'preview', sel: '#pvw, #nest-preview-slot .nest-row', say: 'Your project runs here, live.' } },
    tasks: { title: 'Tasks', steps: ['Say “add a task to fix the menu for Maya by friday”, or type /task in chat.', 'Every card has one clear button for the next step.', '“Mark it done”, “push it to monday”, “what needs someone” all work without AI.'], show: { go: 'ws-tasks', sel: '#nest-ws-tasks, #view-tasks', say: 'The Task Board: who does what.' }, guide: 'working-together' },
    work: { title: 'Work: get help, offer help', steps: ['Say what you need: Work › Get help posts a gig.', 'Friends or AIs offer: they say they are interested, or you find people by skill.', 'Accept one and it becomes a task on their board. Hours can go in the time bank.'], show: { go: 'work', sel: '#wk-tiles', say: 'Start here: Get help, Offer help or Find people.' },
      tour: [{ sel: '#wk-get', say: '1 · Say what you need: Get help posts a gig.' }, { sel: '#wk-tabs [data-tab="gigs"], #tl-body', say: '2 · Friends or AIs offer: they show up on your gig.' }, { sel: '#hub-mytasks', say: '3 · Accept one and it becomes a task, listed here.' }], guide: 'work-and-hiring' },
    templates: { title: 'Website templates', steps: ['Sixteen real templates: link in bio, band, café, shop, portfolio, wedding, podcast and more.', 'Say what the site is for and Flint picks one: “a page for my bakery”.', 'Every template opens in the designer as blocks you can change, wire and export.'], show: { go: 'templates', sel: '.wdz-tpls, #slx', say: 'Pick one; you can switch later.' } },
    files: { title: 'Files', steps: ['Files holds docs, sheets, decks and anything you drop in.', 'Drag a file onto the window to add it; AI helpers read it before they build.', 'Website lives here too, with its versions.'], show: { go: 'docs', sel: '#nest-docs, #view-docs', say: 'Everything the project knows.' }, guide: 'working-together' },
    chat: { title: 'Chat', steps: ['One chat for friends and their AI helpers, with channels and DMs.', 'Type /task to make a task, @ai to ask an AI, or just talk.', 'Flint can post for you: “tell everyone the build is up”.'], show: { go: 'chat', sel: '#nest-chat, #view-chat', say: 'Messages for the whole tribe.' }, guide: 'working-together' },
    huddles: { title: 'Huddles (voice)', steps: ['A huddle is a voice room for the project: one click to join.', 'Ctrl Shift M starts or joins it from anywhere.', 'Capture to notes writes down what was said, if you turn it on.'], show: { go: 'chat', sel: '[data-cb="huddle"], #nest-huddle-row, #nest-huddle', say: 'Start or join the huddle here.' }, guide: 'working-together' },
    agents: { title: 'AI helpers (agents)', steps: ['Connect your own Claude Code, Codex or Gemini: they join like a friend.', 'Agents Hub shows what each one is doing and their hand-offs.', 'They read the vision and Files first, and stay in their part of the code.'], show: { go: 'ws-agents', sel: '#nest-ws-agents, #view-agents', say: 'Every AI helper, live.' }, guide: 'connect-claude-code' },
    company: { title: 'Company mode', steps: ['Give the work seats like a real business: CEO, builder, grower.', 'Each seat has a charter and can be a friend, an AI helper, or both.', 'Standups and weekly reviews collect answers for you; people approve anything outward.'], show: { go: 'company', sel: '#nest-company, #view-company', say: 'Seats, goals and decisions.' }, guide: 'company-mode', academy: true },
    inspo: { title: 'The inspiration board', steps: ['Save pictures, sounds, links and fonts you like (openly licensed search included).', 'TribeCode measures the colors and suggests an accent and fonts.', '“Use my board’s style” dresses up your site and app; the designer can use a board picture.'], show: { go: 'inspo', sel: '#ibd', say: 'Your board: drop things here.' } },
    export: { title: 'Export', steps: ['In the website designer, Download HTML gives one standalone index.html: every page, pictures inside, no scripts.', 'The ▾ menu has a zip: a file per page, assets/, fonts/ and site.json to open it again.', 'Docs, sheets and decks export to Word, Excel and PowerPoint from their menus.'], show: { go: 'designer', sel: '#wdz-dl', say: 'One click: a site that works anywhere.' } },
    premium: { title: 'Premium and AI credits', steps: ['Everything local is free and open source, forever.', 'When something needs an AI, Use my AI connects your own (free); Get credits / Premium uses ours.', 'Premium also keeps the tribe online in our cloud and adds a few extras.'], show: { go: 'premium', sel: '#pm-sheet', say: 'What is free and what Premium adds.' } },
  };
  const FEATURES = Object.keys(LESSONS);
  if (typeof document === 'undefined') return { LESSONS, FEATURES };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let card = null, ring = null, ringT = 0;
  function open(f) {
    const L = LESSONS[f]; if (!L) return false;
    if (!card) { card = document.createElement('section'); card.id = 'fls'; card.className = 'fls'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Lesson'); document.body.appendChild(card); card.addEventListener('click', onClick); card.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }); }
    card.dataset.feature = f; card.hidden = false;
    card.innerHTML = `<p class="fls-eyebrow"><img src="assets/flint.svg" alt="" width="11" height="14"> Lesson · free</p><h3>${esc(L.title)}</h3><ol>${L.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <p class="fls-acts"><button type="button" class="btn sm primary" data-fls="show">Show me</button>${L.guide ? `<button type="button" class="btn sm" data-fls="guide">Read more in the Guide</button>` : ''}${L.academy ? `<button type="button" class="btn sm ghost" data-fls="academy">Academy</button>` : ''}<button type="button" class="btn sm ghost fls-x" data-fls="close" aria-label="Close lesson">Close</button></p>`;
    setTimeout(() => { const b = card.querySelector('[data-fls="show"]'); if (b) b.focus(); }, 30);
    return true;
  }
  function close() { if (card) card.hidden = true; unring(); }
  function onClick(e) {
    const b = e.target.closest('[data-fls]'); if (!b) return; const f = card.dataset.feature, L = LESSONS[f];
    if (b.dataset.fls === 'close') return close();
    if (b.dataset.fls === 'show') return showMe(f);
    if (b.dataset.fls === 'guide' && window.TribeGuide) return window.TribeGuide.open(L.guide);
    if (b.dataset.fls === 'academy' && window.TribeAcademy) return window.TribeAcademy.open({});
  }
  function go(key) {
    const W = window, sh = W.TribeShell;
    try {
      if (key === 'designer') return W.TribeSiteDesigner && W.TribeSiteDesigner.open({});
      if (key === 'templates') { if (W.TribeSiteDesigner) { W.TribeSiteDesigner.open({}).then(() => { const b = document.querySelector('#wdz [data-wdz="templates"]'); if (b) b.click(); }); return; } return W.TribeSiteLib && W.TribeSiteLib.open({}); }
      if (key === 'canvas' && W.TribeCanvas) return W.TribeCanvas.open();
      if (key === 'preview' && W.TribePreview) return W.TribePreview.open();
      if (key === 'inspo' && W.TribeInspoBoard) return W.TribeInspoBoard.open({});
      if (key === 'premium' && W.TribePremium) return W.TribePremium.open();
      if (W.TribeSiteDesigner && document.querySelector('#wdz:not([hidden])')) W.TribeSiteDesigner.close();
      if (sh && sh.go) return sh.go(key);
    } catch {}
  }
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  function find(sel) { for (const one of String(sel).split(',')) { const el = [...document.querySelectorAll(one.trim())].find(visible); if (el) return el; } return null; }
  // feat/work-v2: a lesson with a tour rings each real control in turn (about 2.6 s each); any tap ends it.
  let tourN = 0;
  function tour(steps) {
    const id = ++tourN; let i = 0;
    const next = () => { if (id !== tourN || i >= steps.length) return; const s = steps[i++]; let n = 0;
      const tick = () => { if (id !== tourN) return; const el = find(s.sel); if (el) { place(el, s.say); if (ring) ring.dataset.step = String(i); return setTimeout(() => { if (id === tourN && ring) next(); }, 2600); } if (++n < 25) setTimeout(tick, 120); else next(); };
      tick(); };
    next();
  }
  function showMe(f) {
    const L = LESSONS[f]; if (!L) return;
    go(L.show.go);
    if (L.tour) { if (card) card.hidden = true; return setTimeout(() => tour(L.tour), 200); }
    let n = 0; const tick = () => { const el = find(L.show.sel); if (el) return place(el, L.show.say); if (++n < 30) setTimeout(tick, 120); else say('Open a project first, then try Show me again.'); };
    setTimeout(tick, 150);
  }
  function place(el, text) {
    unring();
    try { el.scrollIntoView({ block: 'nearest' }); } catch {}
    const r = el.getBoundingClientRect();
    ring = document.createElement('div'); ring.className = 'fls-ring'; ring.setAttribute('role', 'status');
    ring.style.left = `${Math.max(4, r.left - 4)}px`; ring.style.top = `${Math.max(4, r.top - 4)}px`; ring.style.width = `${r.width + 8}px`; ring.style.height = `${r.height + 8}px`;
    const tip = document.createElement('p'); tip.className = 'fls-tip'; tip.textContent = text;
    tip.style.left = `${Math.min(innerWidth - 260, Math.max(8, r.left))}px`; tip.style.top = `${r.bottom + 12 + 60 > innerHeight ? Math.max(8, r.top - 56) : r.bottom + 12}px`;
    ring.appendChild(document.createElement('span')); document.body.appendChild(ring); document.body.appendChild(tip); ring._tip = tip;
    clearTimeout(ringT); ringT = setTimeout(unring, 7000);
    if (card) card.hidden = true;
  }
  function say(t) { if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast(t); }
  function unring() { if (ring) { if (ring._tip) ring._tip.remove(); ring.remove(); ring = null; } }
  addEventListener('pointerdown', e => { if (ring && !e.target.closest('.fls-tip')) unring(); }, true);
  return { LESSONS, FEATURES, open, close, showMe, tour, ring: (el, text) => place(el, text), unring };
});
