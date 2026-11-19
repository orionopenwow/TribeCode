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
    site: { title: 'The website designer', steps: ['Pick a template, or tell Flint what the site is for: “something for my band”.', 'Click any words in the preview and type. Click a button to choose where it goes.', 'Blocks on the left: + Add block, drag to reorder, pick a layout on the right. Templates, Save design and Code are under More.', '“Dark mode”, “add a page called About”, “make the buttons work”: every change has Undo.', 'Download HTML gives one standalone file; the zip has a file per page.'], show: { go: 'designer', sel: '#wdz-start .wdz-kmain, #wdz-blocks', say: 'Start here: pick a kind of site, or click a block to change it.' }, guide: 'start-here' },
    canvas: { title: 'Design (the canvas)', steps: ['Ask Flint for a screen: “a login screen for Ember”. It is real layers with auto layout.', 'Select a frame and say “dark mode”: the layers are recolored in place, Ctrl Z undoes it.', '“Wire this button to the login screen” links a layer to another screen.', '“Send to app” turns a frame into code in the project.'], show: { go: 'canvas', sel: '#cv-flint-btn, #flm-in-canvas, #nest-canvas', say: 'Talk to Flint here, or draw with the tools.' } },
    preview: { title: 'The live preview', steps: ['Preview runs your app, game or site beside everything else.', 'App | Website switches what it shows. Website opens the designer with “Design”.', 'Edit lets you click an element and change it in plain words, free.', 'Saved keeps designs of the website you can compare and restore. The project’s whole history is in Versions.'], show: { go: 'preview', sel: '#pvw, #nest-preview-slot .nest-row', say: 'Your project runs here, live.' } },
    tasks: { title: 'Tasks', steps: ['Say “add a task to fix the menu for Maya by friday”, or type /task in chat.', 'Every card has one clear button for the next step.', '“Mark it done”, “push it to monday”, “what needs someone” all work without AI.'], show: { go: 'ws-tasks', sel: '#nest-ws-tasks, #view-tasks', say: 'The Task Board: who does what.' }, guide: 'working-together' },
    work: { title: 'Work: get help, offer help', steps: ['Say what you need: Work › Get help posts a gig.', 'Friends or AIs offer: they say they are interested, or you find people by skill.', 'Accept one and it becomes a task on their board. Hours can go in the time bank.'], show: { go: 'work', sel: '#wk-tiles', say: 'Start here: Get help, Offer help or Find people.' },
      tour: [{ sel: '#wk-get', say: '1 · Say what you need: Get help posts a gig.' }, { sel: '#wk-tabs [data-tab="gigs"], #tl-body', say: '2 · Friends or AIs offer: they show up on your gig.' }, { sel: '#hub-mytasks', say: '3 · Accept one and it becomes a task, listed here.' }], guide: 'work-and-hiring' },
    templates: { title: 'Website templates', steps: ['Sixteen real templates: link in bio, band, café, shop, portfolio, wedding, podcast and more.', 'Say what the site is for and Flint picks one: “a page for my bakery”.', 'Every template opens in the designer as blocks you can change, wire and export.'], show: { go: 'templates', sel: '.wdz-tpls, #slx', say: 'Pick one; you can switch later.' } },
    files: { title: 'Files', steps: ['Files holds docs, sheets, decks and anything you drop in.', 'Drag a file onto the window to add it; AI helpers read it before they build.', 'Website lives here too, with its saved designs.'], show: { go: 'docs', sel: '#nest-docs, #view-docs', say: 'Everything the project knows.' }, guide: 'working-together' },
    chat: { title: 'Chat', steps: ['One chat for friends and their AI helpers, with channels and DMs.', 'Type /task to make a task, @ai to ask an AI, or just talk.', 'Flint can post for you: “tell everyone the build is up”.'], show: { go: 'chat', sel: '#nest-chat, #view-chat', say: 'Messages for the whole tribe.' }, guide: 'working-together' },
    huddles: { title: 'Huddles (voice)', steps: ['A huddle is a voice room for the project: one click to join.', 'Ctrl Shift M starts or joins it from anywhere.', 'Capture to notes writes down what was said, if you turn it on.'], show: { go: 'chat', sel: '[data-cb="huddle"], #nest-huddle-row, #nest-huddle', say: 'Start or join the huddle here.' }, guide: 'working-together' },
    agents: { title: 'AI helpers (agents)', steps: ['Invite your own agent (Claude, Cursor, Codex, ChatGPT, Gemini…): it joins like a friend, with your access and never more.', 'Agents Hub shows what each one is doing and their hand-offs.', 'They read the vision and Files first, and stay in their part of the code.'], show: { go: 'ws-agents', sel: '#nest-ws-agents, #view-agents', say: 'Every AI helper, live.' }, guide: 'connect-claude-code' },
    company: { title: 'Company mode', steps: ['Answer four questions and your project runs like a small business: each job is a role.', 'A role can go to a friend, an AI helper, or both. An AI helper asks a person before anything costly or public.', 'A short daily check-in and a weekly look-back collect answers for you; the page shows one next step at a time.'], show: { go: 'company', sel: '#nest-company, #view-company', say: 'Roles, goals and decisions.' }, guide: 'company-mode', academy: true },
    inspo: { title: 'The inspiration board', steps: ['Save pictures, sounds, links and fonts you like (openly licensed search included).', 'TribeCode measures the colors and suggests an accent and fonts.', '“Use my board’s style” dresses up your site and app; the designer can use a board picture.'], show: { go: 'inspo', sel: '#ibd', say: 'Your board: drop things here.' } },
    export: { title: 'Export', steps: ['In the website designer, Download HTML gives one standalone index.html: every page, pictures inside, no scripts.', 'The ▾ menu has a zip: a file per page, assets/, fonts/ and site.json to open it again.', 'Docs, sheets and decks export to Word, Excel and PowerPoint from their menus.'], show: { go: 'designer', sel: '#wdz-dl', say: 'One click: a site that works anywhere.' } },
    premium: { title: 'Premium and AI credits', steps: ['Everything local is free and open source, forever.', 'When something needs an AI, Use my AI connects your own (free); Get credits / Premium uses ours.', 'Premium also keeps the tribe online in our cloud and adds a few extras.'], show: { go: 'premium', sel: '#pm-sheet', say: 'What is free and what Premium adds.' } },
    invite: { title: 'Inviting friends', steps: ['Invite friends in the sidebar copies your tribe link: anyone with it picks a name and they are in, on a phone or a laptop.', 'People in the top bar also has the link, a QR code and one-time guest passes.', 'Ask Flint: “invite a friend”.'], show: { go: 'chat', sel: '#tour-invite, #ppl-btn', say: 'Copy the tribe link here.' }, guide: 'working-together' },
    people: { title: 'People and presence', steps: ['People in the top bar lists the tribe and your friends: who is online and where (a doc, the designer, a task).', 'Click someone to message them, jump to where they are, or see their profile.', 'Settings › Show where I am turns it off. Or tell Flint “go invisible”.'], show: { go: 'chat', sel: '#ppl-btn', say: 'Who is here, and where.' } },
    market: { title: 'The Marketplace', steps: ['Widgets, skills, libraries, connectors, studios and asset packs, each with its source and license.', 'Add does something real for every kind, with Undo. The Installed tab lists what you added.', 'Ask Flint: “find a physics library” or “what have I installed”.'], show: { go: 'market', sel: '#mk-q, .mk-search input, [data-mk-search]', say: 'Search everything here.' } },
    local: { title: 'Flint on your device', steps: ['Level 0 is plain code on this device: commands, follow-ups, plans, palettes, sums. No model, nothing sent anywhere.', 'Level 1, the local brain, is a small download (recommended): Flint matches by meaning. Level 2, a local model, is opt-in: Ollama on your computer or a model in the browser writes and rewrites.', 'Flint’s page shows what this device can do, with a self-test, and what would leave it: nothing, unless you connect your own AI or use credits.'], show: { go: 'flintpage', sel: '#fp-device', say: 'What runs on this device, measured here.' } },
    design: { title: 'The Design flow', steps: ['Design asks what you are making: a website, app, game, screen, slides, poster, whiteboard or logo.', 'Pick a template (or describe it), and a Plan card ticks off as it becomes tasks.', 'Ask Flint: “make a poster for our gig” or “design a logo for Ember Socks”.'], show: { go: 'designflow', sel: '.dfl-kinds, .dfl-kind, .dfl-page', say: 'Start any kind of design here.' } },
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
      if (key !== 'market' && W.TribeMarket && W.TribeMarket.unpage) W.TribeMarket.unpage();   // the full-page Marketplace would cover the place we show
      if (key === 'designer') return W.TribeSiteDesigner && W.TribeSiteDesigner.open({});
      if (key === 'templates') { if (W.TribeSiteDesigner) { W.TribeSiteDesigner.open({}).then(() => { const b = document.querySelector('#wdz [data-wdz="templates"]'); if (b) b.click(); }); return; } return W.TribeSiteLib && W.TribeSiteLib.open({}); }
      if (key === 'designflow' && W.TribeDesignFlow) return W.TribeDesignFlow.open({});
      if (key === 'canvas' && W.TribeCanvas) return W.TribeCanvas.open();
      if (key === 'preview' && W.TribePreview) return W.TribePreview.open();
      if (key === 'inspo' && W.TribeInspoBoard) return W.TribeInspoBoard.open({});
      if (key === 'premium' && W.TribePremium) return W.TribePremium.open();
      if (key === 'flintpage' && W.TribeFlintPage) return W.TribeFlintPage.open('', 'device');
      if (W.TribeFlintPage && W.TribeFlintPage.close && document.querySelector('.fpg')) W.TribeFlintPage.close();   // p6: going somewhere else leaves Flint's page
      if (W.TribeSiteDesigner && document.querySelector('#wdz:not([hidden])')) W.TribeSiteDesigner.close();
      if (sh && sh.go) return sh.go(key);
    } catch {}
  }
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // p6: prefer a match nothing covers (an open tool can hide the dashboard's copy of the same control); else the first with a size
  const clear = el => { const r = el.getBoundingClientRect(), x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
  function find(sel) { let first = null; for (const one of String(sel).split(',')) { let all = []; try { all = [...document.querySelectorAll(one.trim())].filter(visible); } catch {} const top = all.find(clear); if (top) return top; first = first || all[0] || null; } return first; }
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
    const g = begin(); let n = 0, sel = L.show.sel, alt = false; const tick = () => { if (!live(g)) return; const el = find(sel); if (el) return place(el, L.show.say); if (n === 10 && !alt) { const a = phoneAlt(sel); if (a) { alt = true; sel = a; } } if (++n < 30) setTimeout(tick, 120); else say(notHere(), 'warn'); };
    setTimeout(tick, 150);
  }
  // p6: Flint's full page sits over the app; ringing something behind it showed nothing. Close it first.
  // A full-screen page left open (Flint's page, the inspiration board, Motion Studio, a shared clip, the Launch kit, the
  // shelf's full page) sat over the control being shown, so the ring went round something nobody could see. When one of
  // those covers the target and the target is not inside it, close it, then look again (up to three layers).
  const W0 = window, COVERS = [
    ['.fpg', () => W0.TribeFlintPage.close()], ['#ibd', () => W0.TribeInspoBoard.close()], ['.mos', () => W0.TribeMotionStudio.close()],
    ['.lch, .lch-scrim', () => W0.TribeLaunchKit.close()], ['.shc, .shc-scrim', () => W0.TribeShareClip.close()], ['.mkp-page, .mk-page', () => W0.TribeMarket.unpage()],
    ['#flint-full', () => W0.TribeFlint.closeFull()],
    ['#pvw', () => W0.TribePreview.close()],   // a phone: Show me pressed in Flint's own sheet rang the app behind it
    ['#vr, .vr-scrim', () => W0.TribeVersions.close()],
    ['.ph-scrim', () => { const sc = [...document.querySelectorAll('.ph-scrim')].pop(); if (!sc) throw 0; sc.click(); }],   // any other phone-style sheet: its scrim closes it
    ['#settings-modal', () => W0.TribeSettings.close()], ['#nf-settings', () => document.querySelector('#nf-settings [data-x]').click()],
    ['.ui-sheet, .ui-scrim', () => { const all = document.querySelectorAll('.ui-sheet'), x = all.length && all[all.length - 1].querySelector('.ui-x'); if (!x) throw 0; x.click(); }]];
  // p6: on a phone some controls live somewhere else (the ? menu, Flint's own sheet, More in the designer, the drawer's +,
  // the dashboard's people button). When the desktop control is not on screen, open the phone's version and ring that.
  const PHONE_ALT = [
    [/#tb-help|#tour-search/, () => { if (!document.querySelector('#help-menu') && W0.TribeHelp) W0.TribeHelp.open(); }, '#help-menu'],
    [/#flint\b|#flint-home/, () => W0.TribeFlint && W0.TribeFlint.openFull(), '#flint-full .ff-foot'],
    [/#wdz-dl/, null, "#wdz [data-wdz='more']"],
    [/#pj-plus/, () => document.body.classList.add('drawer-open'), '.pj-plus[data-pj-new]'],
    [/data-fc-act/, () => { const r = document.querySelector('#wdz'); if (r && !r.classList.contains('fl-sheet')) { const g = r.querySelector("[data-wdz='flint-sheet']"); if (g) g.click(); } }, null],   // the designer's Flint sheet
    [/#ppl-btn/, () => { if (document.body.classList.contains('m2-in-chat') && W0.TribeShell) W0.TribeShell.go('home'); }, '#ppl-btn']];
  function phoneAlt(sel) {
    if (innerWidth > 820) return null;
    const a = PHONE_ALT.find(([re]) => re.test(String(sel || ''))); if (!a) return null;
    try { if (a[1]) a[1](); } catch {}
    return a[2] || sel;
  }
  function clearCover(el) {
    // a phone: the section list is a drawer off the left edge; a control in it was ringed off screen. Slide it in (the ring follows).
    try { if (!document.body.classList.contains('drawer-open') && el.closest('.window > .side') && el.getBoundingClientRect().right <= 0) document.body.classList.add('drawer-open'); } catch {}
    for (let i = 0; i < 3; i++) {
      const r = el.getBoundingClientRect(), x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const h = document.elementFromPoint(x, y); if (!h || h === el || el.contains(h)) return;
      const c = COVERS.find(([sel]) => { const L = h.closest(sel); return L && !L.contains(el); }); if (!c) return;
      try { c[1](); } catch { return; }
    }
  }
  // p6: the ring follows its target while it is up (a panel that settles, a list that grows, a scroll), and the tip is
  // measured before it is placed, so it sits below or above the target and never on top of it.
  let follow = 0;
  function fit(el, tip) {
    if (!ring || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    ring.style.left = `${Math.max(4, r.left - 4)}px`; ring.style.top = `${Math.max(4, r.top - 4)}px`; ring.style.width = `${r.width + 8}px`; ring.style.height = `${r.height + 8}px`;
    const th = tip.offsetHeight || 60, tw = tip.offsetWidth || 250, below = r.bottom + 12, above = r.top - 12 - th;
    const top = below + th <= innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, Math.min(innerHeight - th - 8, r.top + 8));
    tip.style.left = `${Math.min(innerWidth - tw - 8, Math.max(8, r.left))}px`; tip.style.top = `${top}px`;
  }
  function place(el, text) {
    drop(); clearCover(el);
    try { el.scrollIntoView({ block: 'nearest' }); } catch {}
    ring = document.createElement('div'); ring.className = 'fls-ring'; ring.setAttribute('role', 'status'); ring._el = el;   // p6: what it rings (the demo rings check reads it)
    const tip = document.createElement('p'); tip.className = 'fls-tip'; tip.textContent = text;
    ring.appendChild(document.createElement('span')); document.body.appendChild(ring); document.body.appendChild(tip); ring._tip = tip;
    fit(el, tip);
    clearInterval(follow); const mine = ring; follow = setInterval(() => { if (ring !== mine) return clearInterval(follow); fit(el, tip); }, 200);
    clearTimeout(ringT); ringT = setTimeout(unring, 7000);
    if (card) card.hidden = true;
  }

  const notHere = () => (window.TribeClient && window.TribeClient.project && window.TribeClient.project() ? 'That isn’t on this screen right now. Open it from the menu, then try Show me again.' : 'Open a project first, then try Show me again.');
  function say(t, kind) { if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast(t, kind); }
  function drop() { clearInterval(follow); if (ring) { if (ring._tip) ring._tip.remove(); ring.remove(); ring = null; } }
  // p6: only the newest Show me may ring. A Show me that was still looking for its control rang later, over the one you
  // pressed after it. begin() starts one and retires any still looking. (unring() only clears the ring: a tool that
  // closes while the next one opens must not cancel the Show me that is waiting for it.)
  let gen = 0;
  const begin = () => ++gen, live = g => g === gen;
  function unring() { drop(); }
  addEventListener('pointerdown', e => { if (ring && !e.target.closest('.fls-tip')) drop(); }, true);
  return { LESSONS, FEATURES, open, close, showMe, tour, ring: (el, text, g) => { if (g == null || live(g)) place(el, text); }, unring, begin, live, phoneAlt, notHere };
});
