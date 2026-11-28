// Screen intros (feat/p13b-intro): the first time someone opens a main screen on this device, a short set of 1-3 slides
// says what the screen is for and what it can do. Home's three slides double as the app's welcome for demos.
//   window.TribeIntro = {
//     maybe(key, slides, opts) -> Promise<boolean>   once per device per key (localStorage 'tribecode.intro.v1'); waits
//                                                   while another sheet or dialog is open (or skips this time); never in
//                                                   automated browsers unless the address has ?screenintro=1 (?screenintro=0: never);
//                                                   true when it was shown and then finished or skipped
//     show(key, slides, opts) -> Promise<void>       always shows (Help › Tour this screen)
//     seen(key) -> boolean, reset(key?)              reset() forgets every key (Settings › Show intros again)
//     current() -> the key of the screen on top ('' when none), slides(key), register(key, slides), tour()
//   }
//   slides: [{ eyebrow, title, body, art, bullets? }]; art is HTML (an <img> or <svg>) or a key of ART below.
//   opts: { onDone(finished), startAt }.
// One intro at a time: a screen that opens while an intro is up waits its turn (a queue), and the screen's own intro
// is dropped if you have left it by then. The main screens are found from the body's view, Home's mode and the
// creators' body classes (watch() below), so no screen has to call anything; others (the office) call maybe() themselves.
// The sheet: a centred card (a bottom sheet on phones), art on top, eyebrow, title, a sentence or two, optional
// bullets, dots, Back / Next / Get started, Skip. Esc skips, ← → move, a swipe moves on touch screens, focus stays
// inside and goes back where it was. Strings go through TribeI18n.t (rows in i18n-more.js).
(function () {
  'use strict';
  const STORE = 'tribecode.intro.v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = s => { try { return (window.TribeI18n && window.TribeI18n.t) ? window.TribeI18n.t(s, s) : s; } catch { return s; } };
  const T = s => esc(t(s));
  const ico = (n, sz = 16) => (window.TribeIcons && window.TribeIcons.svg) ? window.TribeIcons.svg(n, sz) : '';
  const params = () => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); } };

  // ---------- memory ----------
  function read() { try { const v = JSON.parse(localStorage.getItem(STORE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
  function write(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch {} }
  const seen = key => !!read()[key];
  function mark(key) { const o = read(); o[key] = Date.now(); write(o); }
  function reset(key) { if (key) { const o = read(); delete o[key]; write(o); } else write({}); setTimeout(watchTick, 300); }

  // Automated browsers keep the old behaviour (every existing test) unless the address asks for intros.
  function allowed() {
    const p = params().get('screenintro');   // its own flag: ?intro=1 already opens the app's first-run intro
    if (p === '0') return false;
    if (p === '1') return true;
    return !navigator.webdriver;
  }
  // a hands-off tour or a guided run is driving the app: never interrupt it
  function touring() {
    const W = window;
    try {
      return !!((W.TribeDemoWatch && W.TribeDemoWatch.active && W.TribeDemoWatch.active())
        || (W.TribeFlintRun && W.TribeFlintRun.active && W.TribeFlintRun.active())
        || (W.TribeFlintTour && W.TribeFlintTour.running && W.TribeFlintTour.running())
        || (W.TribeShowcase && W.TribeShowcase.on && W.TribeShowcase.on()));
    } catch { return false; }
  }

  // ---------- is something else open? ----------
  const OVERLAYS = '.ui-scrim, .ui-sheet, .modal:not(.hidden), [role="dialog"], [role="alertdialog"], [aria-modal="true"], .help-menu, #help-keys';
  const HOSTS = { settings: '#settings-modal', appcreator: '#apc', website: '#wdz', motion: '#mos', preview: '.pvw-sheet' };
  function visible(el) {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  }
  function busy(key) {
    const host = HOSTS[key] ? document.querySelector(HOSTS[key]) : null;
    for (const el of document.querySelectorAll(OVERLAYS)) {
      if (el.closest('#sci')) continue;
      if (host && (host === el || host.contains(el) || el.contains(host))) continue;
      if (el.closest('[hidden], .hidden')) continue;
      if (visible(el)) return true;
    }
    return false;
  }

  // ---------- art ----------
  const IMG = n => `<img class="sci-ill" src="assets/illustrations/${n}.svg" alt="" draggable="false">`;
  const tile = (icon, label, on) => `<span class="sci-tile${on ? ' on' : ''}">${ico(icon, 20)}<b>${T(label)}</b></span>`;
  const row = (icon, text, tag) => `<span class="sci-row">${ico(icon, 15)}<span>${T(text)}</span>${tag ? `<em>${esc(tag)}</em>` : ''}</span>`;
  const ART = {
    campfire: () => IMG('campfire'),
    chat: () => IMG('chat'),
    cooperative: () => IMG('cooperative'),
    brain: () => IMG('brain'),
    make: () => `<div class="sci-m sci-make"><span class="sci-ask"><span>${T('A page for our bake sale')}</span><i>${ico('chev', 14)}</i></span>
      <span class="sci-tiles">${tile('device', 'App')}${tile('sites', 'Website', true)}${tile('flame', 'Game')}</span></div>`,
    files: () => `<div class="sci-m sci-files">${[['docs', 'Plan'], ['pics', 'Logo.png'], ['sheets', 'Budget'], ['notes', 'Meeting notes']].map(([i, n]) => `<span class="sci-file">${ico(i, 22)}<b>${T(n)}</b></span>`).join('')}</div>`,
    design: () => `<div class="sci-m sci-tiles4">${tile('device', 'App', true)}${tile('sites', 'Website')}${tile('flame', 'Game')}${tile('designs', 'Design')}</div>`,
    appcreator: () => `<div class="sci-m sci-app"><span class="sci-phone"><span class="sci-ph-bar">${T('Recipes')}</span>${row('list', 'Pancakes')}${row('list', 'Tomato soup')}<span class="sci-ph-btn">${T('Add')}</span></span>
      <span class="sci-parts">${['list', 'checklist', 'calendar', 'pics'].map(i => `<span>${ico(i, 18)}</span>`).join('')}</span></div>`,
    website: () => `<div class="sci-m sci-site"><span class="sci-br"><i></i><i></i><i></i></span><span class="sci-site-hero"><b>Corner Bakery</b><span>${T('Fresh bread every morning')}</span><span class="sci-site-btn">${T('Order now')}</span></span>
      <span class="sci-site-secs"><span></span><span></span><span></span></span></div>`,
    tasks: () => `<div class="sci-m sci-board">${[['To do', ['Draw the logo']], ['Doing', ['Menu page']], ['Done', ['Pick colours']]].map(([c, cards]) => `<span class="sci-col"><em>${T(c)}</em>${cards.map(x => `<span class="sci-tk">${T(x)}</span>`).join('')}</span>`).join('')}</div>`,
    code: () => `<div class="sci-m sci-code">${row('code', 'index.html', '+27 −3')}${row('code', 'style.css', '+4')}${row('code', 'game.js', '+112 −9')}</div>`,
    work: () => `<div class="sci-m sci-tiles3">${tile('hand', 'Get help', true)}${tile('gift', 'Offer help')}${tile('people', 'Find people')}</div>`,
    settings: () => `<div class="sci-m sci-set">${row('globe', 'Language', 'English')}${row('palette', 'Theme', 'Dark')}${row('sparkle', 'AI helper', '—')}</div>`,
    preview: () => `<div class="sci-m sci-pv"><span class="sci-pv-wide"><span class="sci-br"><i></i><i></i><i></i></span><span class="sci-pv-body"></span></span><span class="sci-pv-phone"><span class="sci-pv-body"></span></span><span class="sci-pin">${ico('chat', 13)}</span></div>`,
    motion: () => `<div class="sci-m sci-mo"><span class="sci-mo-stage"><span class="sci-mo-dot"></span></span><span class="sci-mo-line"><i>${ico('preview', 14)}</i><span class="sci-mo-track"><b></b><b></b><b></b><b></b></span></span></div>`,
    dashboard: () => `<div class="sci-m sci-dash"><span class="sci-hero"><em>${T('Needs you')}</em><b>${T('1 approval')}</b></span>${row('people', 'Maya changed the menu')}${row('sparkle', 'An AI helper finished a task')}</div>`,
  };
  const artHTML = a => { if (!a) return ''; if (typeof a === 'string' && a.trim().charAt(0) === '<') return a; const f = ART[a]; return f ? f() : ''; };

  // ---------- the slides for each main screen (only what exists) ----------
  const SLIDES = {
    home: [
      { eyebrow: 'Welcome to TribeCode', title: 'Make things with your friends', body: 'Build apps, websites and games together, with AI helpers working beside you.', art: 'campfire',
        bullets: ['Chat, files and tasks in one shared place', 'Everyone’s AI helper can pick up work', 'See each other’s changes as they happen'] },
      { eyebrow: 'How it works', title: 'Start with one sentence', body: 'Say what you want to make. You get a first version to look at straight away, then shape it together.', art: 'make',
        bullets: ['App Creator, Website designer and Design Studio', 'Game starters you can play right away', 'Every change can be undone'] },
      { eyebrow: 'Free to start', title: 'Works offline, better with AI', body: 'Everything works without an AI and keeps working when the internet drops. Connect an AI when you want more help.', art: 'brain',
        bullets: ['Invite friends with a link', 'Use it on your phone too', 'Your files stay in a folder you can open'] },
    ],
    dashboard: [
      { eyebrow: 'Project dashboard', title: 'This project at a glance', body: 'See what changed, what needs you and what to do next. The preview shows the latest version.', art: 'dashboard',
        bullets: ['Approvals waiting for you', 'Recent work from people and AI helpers'] },
    ],
    messages: [
      { eyebrow: 'Messages', title: 'Talk with your tribe', body: 'Channels for the whole project, private messages for two, and voice notes when typing is slow.', art: 'chat',
        bullets: ['Mention @someone or their AI helper', 'Turn a message into a task', 'Start a call from the header'] },
    ],
    files: [
      { eyebrow: 'Files', title: 'Every doc and file in one place', body: 'Write docs together, keep pictures and uploads, and find anything with search.', art: 'files',
        bullets: ['Edit a doc at the same time as friends', 'Drop files in to add them'] },
    ],
    design: [
      { eyebrow: 'Design Studio', title: 'Make anything here', body: 'Pick what you are making: an app, a website, a game or a design. Each one opens its own maker.', art: 'design',
        bullets: ['Start from a template or a blank page', 'Ask Flint for changes in plain words'] },
    ],
    appcreator: [
      { eyebrow: 'App Creator', title: 'Build an app without code', body: 'Pick a template, add screens and parts, and try it as you go. Flint makes changes when you ask.', art: 'appcreator',
        bullets: ['Lists, forms, buttons and more', 'Try it at phone size', 'Download it when it is ready'] },
    ],
    website: [
      { eyebrow: 'Website designer', title: 'A website in minutes', body: 'Start from a template, then change the words and pictures right on the page.', art: 'website',
        bullets: ['Drag sections to put them in order', 'Fonts and colours in one place', 'Publish it when you are ready'] },
    ],
    tasks: [
      { eyebrow: 'Task Board', title: 'Who does what, and what is next', body: 'Add tasks, move them across the board and give them to people or AI helpers.', art: 'tasks',
        bullets: ['Bugs, proposals and milestones in tabs', 'A calendar for dates'] },
    ],
    code: [
      { eyebrow: 'Code', title: 'The project’s code, kept safe', body: 'See the files, what changed and who changed it. Every version is kept, so you can always go back.', art: 'code',
        bullets: ['Branches to try ideas safely', 'Backup on GitHub when you want it'] },
    ],
    work: [
      { eyebrow: 'Work', title: 'Find help, or offer yours', body: 'Post a gig, find people open to work, or offer your time and skills to other tribes.', art: 'work' },
    ],
    settings: [
      { eyebrow: 'Settings', title: 'Make it yours', body: 'Your name and look, the language, which AI helps (or none), and what tells you when.', art: 'settings' },
    ],
    preview: [
      { eyebrow: 'Preview', title: 'See the real thing', body: 'This is the project running, the way people will see it. Try it at phone size and leave comments on the page.', art: 'preview' },
    ],
    motion: [
      { eyebrow: 'Motion Studio', title: 'Make short videos and animations', body: 'Start from a template, change the words and colours, set the timing, then export a video or a GIF.', art: 'motion' },
    ],
  };
  const EXTRA = {};
  const register = (key, slides) => { if (key && Array.isArray(slides) && slides.length) EXTRA[key] = slides; };
  const slidesFor = key => EXTRA[key] || SLIDES[key] || null;

  // ---------- which main screen is on top ----------
  const VIEW = { home: 'dashboard', chat: 'messages', docs: 'files', tasks: 'tasks', board: 'tasks', bugs: 'tasks', repo: 'code', designflow: 'design', work: 'work', website: 'website', 'agents-hub': 'agents', coord: 'agents' };   // 'agents' is the office's own (it calls maybe itself)
  const HUB = { home: 'home', docs: 'files', design: 'design', repos: 'code' };
  function current() {
    const b = document.body; if (!b) return '';
    const c = b.classList;
    if (c.contains('apc-open')) return 'appcreator';
    if (c.contains('wdz-open')) return 'website';
    if (c.contains('mos-on')) return 'motion';
    if (c.contains('pvw-on') || c.contains('pvw-focus')) return 'preview';
    if (c.contains('cv-focus')) return 'design';
    if (c.contains('ws-open') || c.contains('gd-open')) return '';
    try { if (window.TribeSettings && window.TribeSettings.isOpen && window.TribeSettings.isOpen()) return 'settings'; } catch {}
    const v = b.dataset.view || '';
    if (v === 'hub') { const m = (window.TribeHub && window.TribeHub.mode && window.TribeHub.mode()) || 'home'; return HUB[m] || ''; }
    return VIEW[v] || '';
  }

  // ---------- the queue ----------
  let chain = Promise.resolve(), open = null, waiting = 0;
  const enqueue = job => { const p = chain.then(job, job); chain = p.catch(() => {}); return p; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function maybe(key, slides, opts = {}) {
    slides = slides || slidesFor(key);
    if (!key || !slides || !slides.length || seen(key) || !allowed()) return Promise.resolve(false);
    waiting++;
    return enqueue(async () => {
      try {
        const limit = Date.now() + (opts.wait || 60000);
        for (;;) {
          if (seen(key)) return false;
          if (opts.still && !opts.still()) return false;
          if (!busy(key) && !touring() && document.visibilityState !== 'hidden') break;
          if (Date.now() > limit) return false;   // something stayed open: try another time
          await sleep(400);
        }
      } finally { waiting--; }
      await present(key, slides, opts);
      return true;
    });
  }
  function show(key, slides, opts = {}) {
    slides = slides || slidesFor(key) || SLIDES.home;
    return enqueue(() => present(key || 'home', slides, opts)).then(() => {});
  }

  // ---------- the sheet ----------
  function present(key, slides, opts) {
    return new Promise(resolve => {
      const back = document.activeElement;
      let i = Math.max(0, Math.min(slides.length - 1, Number(opts.startAt) || 0)), done = false;
      const wrap = document.createElement('div');
      wrap.id = 'sci'; wrap.className = 'sci-wrap'; wrap.dataset.key = key;
      wrap.innerHTML = `<div class="sci-card" role="dialog" aria-modal="true" aria-labelledby="sci-title" aria-describedby="sci-body" tabindex="-1">
        <div class="sci-art" aria-hidden="true"></div>
        <div class="sci-text" aria-live="polite"><span class="eyebrow sci-eye"></span><h2 id="sci-title"></h2><p id="sci-body"></p><ul class="sci-bul"></ul></div>
        <footer class="sci-foot">
          <button type="button" class="btn ghost sci-skip" data-sci="skip">${T('Skip')}</button>
          <span class="sci-dots"${slides.length < 2 ? ' hidden' : ''}>${slides.map((_, n) => `<button type="button" class="sci-dot" data-sci-dot="${n}" aria-label="${esc(t('Slide {n}').replace('{n}', n + 1))}"></button>`).join('')}</span>
          <span class="sci-nav"><button type="button" class="btn sci-back" data-sci="back">${T('Back')}</button><button type="button" class="btn primary sci-next" data-sci="next"></button></span>
        </footer></div>`;
      const q = s => wrap.querySelector(s);
      const card = q('.sci-card');
      function draw(dir) {
        const s = slides[i] || {};
        const paint = () => {
          q('.sci-art').innerHTML = artHTML(s.art);
          q('.sci-art').hidden = !s.art;
          q('.sci-eye').textContent = t(s.eyebrow || '');
          q('#sci-title').textContent = t(s.title || '');
          q('#sci-body').textContent = t(s.body || '');
          const ul = q('.sci-bul'); const bl = (s.bullets || []).slice(0, 4);
          ul.innerHTML = bl.map(x => `<li>${ico('check', 14)}<span>${T(x)}</span></li>`).join(''); ul.hidden = !bl.length;
          wrap.querySelectorAll('.sci-dot').forEach((d, n) => { d.classList.toggle('on', n === i); d.setAttribute('aria-current', n === i ? 'step' : 'false'); });
          q('.sci-back').hidden = i === 0;
          q('.sci-next').textContent = t(i === slides.length - 1 ? 'Get started' : 'Next');
          wrap.dataset.slide = String(i);
          if (dir) { card.classList.remove('sci-go-l', 'sci-go-r'); void card.offsetWidth; card.classList.add(dir > 0 ? 'sci-go-r' : 'sci-go-l'); }
        };
        if (dir && window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(paint); else paint();
      }
      const go = n => { n = Math.max(0, Math.min(slides.length - 1, n)); if (n === i) return; const d = n > i ? 1 : -1; i = n; draw(d); };
      const next = () => { if (i >= slides.length - 1) finish(true); else go(i + 1); };
      function finish(completed) {
        if (done) return; done = true;
        mark(key);
        window.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', keepIn, true);
        wrap.classList.add('sci-out');
        // the next queued intro starts only once this one is gone, so two never overlap
        const gone = () => { wrap.remove(); open = null; try { if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); } catch {} resolve(); setTimeout(watchTick, 500); };
        const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (calm) gone(); else setTimeout(gone, 160);
        try { opts.onDone && opts.onDone(!!completed); } catch {}
      }
      function onKey(e) {
        if (!wrap.isConnected) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); return; }
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { if (e.altKey || e.ctrlKey || e.metaKey) return; e.preventDefault(); e.stopImmediatePropagation(); go(i + (e.key === 'ArrowRight' ? 1 : -1)); return; }
        if (e.key === 'Tab') {   // focus stays inside the card
          const f = [...card.querySelectorAll('button:not([hidden])')].filter(b => !b.closest('[hidden]'));
          if (!f.length) return;
          const at = f.indexOf(document.activeElement);
          e.preventDefault(); e.stopImmediatePropagation();
          f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
          return;
        }
        if (!card.contains(document.activeElement) && e.key !== 'Shift') { e.stopImmediatePropagation(); }
      }
      // nothing behind the sheet takes focus while it is up (a view focusing its input after drawing, say)
      const keepIn = e => { if (wrap.isConnected && !done && e.target && !wrap.contains(e.target)) { const n = q('.sci-next'); if (n) n.focus({ preventScroll: true }); } };
      wrap.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-sci], [data-sci-dot]');
        if (!b) { if (e.target === wrap) card.focus(); return; }
        if (b.dataset.sciDot != null) return go(Number(b.dataset.sciDot));
        const a = b.dataset.sci;
        if (a === 'skip') finish(false); else if (a === 'back') go(i - 1); else if (a === 'next') next();
      });
      // swipe on touch screens
      let sx = 0, sy = 0, st = 0;
      card.addEventListener('touchstart', e => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; st = Date.now(); }, { passive: true });
      card.addEventListener('touchend', e => {
        const p = e.changedTouches[0]; const dx = p.clientX - sx, dy = p.clientY - sy;
        if (Date.now() - st < 800 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(i + (dx < 0 ? 1 : -1));
      }, { passive: true });
      window.addEventListener('keydown', onKey, true); document.addEventListener('focusin', keepIn, true);   // window capture runs before the creators' document listeners
      document.body.appendChild(wrap);
      open = { key, wrap };
      draw(0);
      try { q('.sci-next').focus({ preventScroll: true }); } catch {}
      requestAnimationFrame(() => wrap.classList.add('on'));
      setTimeout(() => { const n = q('.sci-next'); if (n && wrap.isConnected) n.focus({ preventScroll: true }); }, 30);
    });
  }

  // ---------- watching the main screens ----------
  let tick = 0;
  function watchTick() {
    if (open || waiting || !allowed() || !document.body) return;
    const key = current();
    if (!key || seen(key) || !SLIDES[key]) return;
    maybe(key, SLIDES[key], { still: () => current() === key });
  }
  const soon = () => { if (!tick) tick = setTimeout(() => { tick = 0; watchTick(); }, 700); };
  function watch() {
    const mo = new MutationObserver(soon);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-view'] });
    const cl = document.getElementById('crumb-label');
    if (cl) new MutationObserver(soon).observe(cl, { childList: true, characterData: true, subtree: true });
    addEventListener('hashchange', soon);
    soon();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true }); else watch();

  // Help › Tour this screen: the intro for where you are (Home's when the screen has none)
  function tour() { const k = current(); return show(k && slidesFor(k) ? k : 'home'); }

  window.TribeIntro = { maybe, show, seen, reset, current, slides: key => slidesFor(key), register, tour, isOpen: () => !!open, ART: Object.keys(ART) };
})();
