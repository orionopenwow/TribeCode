// The Guide (#/guide, #/guide/<slug>): how to TribeCode in a handful of short pages, tucked away.
// No sidebar row and no floating button: it opens from the profile menu (Guide), Ctrl K (Guide) and the
// small "? Guide" link at the bottom of Settings. Pages are docs/guide/*.md, served read-only by
// server/guide.js (GET /api/guide, /api/guide/<slug>) and rendered with app/ui/md.js.
// Desktop: a list of pages on the left and a reading column (line-height 1.6, ~65ch).
// Phones (<= 820px): one list, tap a page, Back returns to the list. Search filters titles and text.
// feat/help-next (docs/HELP-NEXT.md): the Guide is also the Help center. Its home (#/guide/home) starts with search,
// then six paths by goal (Make a website · a game · an app · Run it as a company · Work with friends · Use AI helpers).
// A path (#/guide/path/<id>/<level>) is a short journey (idea → design → build → check → publish → share), a 60-second
// "Show me", and three depths of the same page: Basics · In practice · Production (docs/guide/p-<id>-<level>.md).
// The tours, demos, set-up pages and links from the old ? menu are on the home too (TribeHelp.all/groups).
// Public: window.TribeGuide = { open(slug?), home(), path(id, level?), paths(), close(), isOpen() }.
(function () {
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const REPO = 'https://github.com/orionopenwow/TribeCode/tree/main/docs/guide';
  const svg = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    next: svg('<path d="M9 5l7 7-7 7"/>'),
  };
  // A "?" in a circle for the profile menu and Ctrl K, added to the app's icon sprite (no edit to index.html).
  (function addIcon() {
    const sym = document.querySelector('svg symbol'); if (!sym || document.getElementById('i-help')) return;
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
    s.setAttribute('id', 'i-help'); s.setAttribute('viewBox', sym.getAttribute('viewBox') || '0 0 24 24');
    s.innerHTML = '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.05" fill="currentColor"/>';
    sym.parentNode.appendChild(s);
  })();

  let pages = null, cur = null, q = '', open_ = false, loadErr = '', deep = [], sem = null;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const LEVELS = [['basics', 'Basics'], ['practice', 'In practice'], ['production', 'Production']];
  // each path: [id, title, one line, lesson for "Show me", the journey: [stage, what you do, the next-step run]]
  const PATHS = [
    ['website', 'Make a website', 'From a template to a link people can open.', 'site', [['Idea', 'Say what the site is for', 'vision'], ['Design', 'Pick a template and a look', 'design'], ['Build', 'Edit the words and pictures', 'design'], ['Check', 'Run Check my site', 'check'], ['Publish', 'Publish, or download the files', 'publish'], ['Share', 'Send the link', 'invite']]],
    ['game', 'Make a game', 'A playable game in the preview, then out to players.', 'design', [['Idea', 'One sentence: what you do and why it is fun', 'vision'], ['Design', 'Pick a game starter', 'design'], ['Build', 'Ask Flint or your AI helper for changes', 'build'], ['Check', 'Play it at phone size', 'check'], ['Publish', 'Make a play link', 'publish'], ['Share', 'Invite testers', 'invite']]],
    ['app', 'Make an app', 'Screens first, then a working app you can open on a phone.', 'preview', [['Idea', 'Who it is for and the one job it does', 'vision'], ['Design', 'Lay out the screens', 'design'], ['Build', 'Build a first version', 'build'], ['Check', 'Try it at phone size', 'check'], ['Publish', 'Publish it', 'publish'], ['Share', 'Get three people to try it', 'invite']]],
    ['company', 'Run it as a company', 'Roles, check-ins and money in and out around your project.', 'company', [['Idea', 'What the company makes', 'vision'], ['Set up', 'Answer four questions', 'company'], ['Roles', 'Give each role to a person or an AI', 'company'], ['Check-ins', 'A short regular check-in', 'company'], ['Money', 'Write down money in and out', 'company'], ['Grow', 'Bring in help', 'invite']]],
    ['friends', 'Work with friends', 'One link, shared tasks, calls and comments.', 'invite', [['Invite', 'Send one link', 'invite'], ['Talk', 'Chat and calls', 'tasks'], ['Plan', 'Tasks with one clear next button', 'tasks'], ['Build', 'Edit together, live', 'design'], ['Review', 'Comment on the page itself', 'check'], ['Decide', 'Approve with one tap', 'tasks']]],
    ['ai', 'Use AI helpers', 'Flint with no AI, your own agent, or a free model.', 'agents', [['Start', 'Ask Flint: he works with no AI', 'build'], ['Invite', 'Invite your own agent', 'ai'], ['Ask', 'Send it a request privately', 'ai'], ['Review', 'Approve what it proposes', 'tasks'], ['Local', 'Give Flint a brain on this device', 'ai'], ['Scale', 'Give agents roles and tasks', 'company']]],
  ];
  const pathOf = id => PATHS.find(x => x[0] === id);
  const deepPage = (id, level) => deep.find(x => x.slug === `${id}-${level}`);

  function frame() {
    let root = document.getElementById('guide'); if (root) return root;
    root = document.createElement('div'); root.id = 'guide'; root.className = 'gd-layer hidden';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Guide');
    root.innerHTML = `
      <header class="gd-top">
        <button class="gd-icon gd-back" id="gd-back" aria-label="Back">${I.back}</button>
        <div class="gd-brand"><span class="eyebrow">Guide</span><h1 id="gd-h">How to TribeCode</h1></div>
        <label class="gd-search">${I.search}<input id="gd-q" type="search" placeholder="Search the guide" autocomplete="off" aria-label="Search the guide"></label>
        <button class="gd-icon" id="gd-close" title="Close (Esc)" aria-label="Close the guide">${I.x}</button>
      </header>
      <div class="gd-body">
        <nav class="gd-list" id="gd-list" aria-label="Guide pages"></nav>
        <main class="gd-read" id="gd-read" tabindex="-1"><article class="gd-page md" id="gd-page"></article></main>
      </div>`;
    (document.querySelector('.shell .window') || document.body).appendChild(root);
    root.querySelector('#gd-close').onclick = close;
    root.querySelector('#gd-back').onclick = () => { if (phone() && root.classList.contains('reading')) showList(); else close(); };
    let t; root.querySelector('#gd-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim().toLowerCase(); drawList(); meaning(); if (q && !phone()) { const first = matches()[0]; if (first && (!cur || !matches().some(p => p.slug === cur))) show(first.slug, { keepFocus: true }); } }, 120); });
    root.querySelector('#gd-q').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = matches()[0]; if (first) { show(first.slug); } } });
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-gd]'); if (a) { e.preventDefault(); show(a.dataset.gd); return; }
      const t = e.target.closest('[data-gdp], [data-gdh], [data-gd-next], [data-gd-show], [data-gd-run], [data-help], [data-gd-ask]'); if (!t) return;
      e.preventDefault();
      if (t.dataset.gdp) return path(t.dataset.gdp, t.dataset.gdl);
      if (t.hasAttribute('data-gdh')) return home();
      if (t.hasAttribute('data-gd-next')) { close(); return window.TribeNextStep && window.TribeNextStep.open(); }
      if (t.dataset.gdShow) { close(); const L = window.TribeFlintLessons; return L && L.open && L.open(t.dataset.gdShow); }
      if (t.dataset.gdRun) { close(); return window.TribeNextStep && window.TribeNextStep.act(t.dataset.gdRun); }
      if (t.dataset.help) { close(); return window.TribeHelp && window.TribeHelp.run(t.dataset.help); }
      if (t.dataset.gdAsk) { close(); const F = window.TribeFlint; return F && F.prefill && F.prefill(t.dataset.gdAsk); }
    });
    return root;
  }

  async function load() {
    if (pages) return pages;
    loadErr = '';
    // no tribe and no demo running: there is no server to ask, so read the pages that ship inside the app (no 404)
    const live = (C && C.connected && C.connected()) || (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active());
    if (live) try {
      const base = (C && C.base && C.base()) || '';
      const r = await fetch(base + '/api/guide', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json(); pages = (j.pages || []); deep = j.paths || [];
      if (!pages.length) { pages = null; loadErr = 'empty'; }   // a project on this device has no guide pages: say where the guide is, not "Nothing about"
    } catch (e) { loadErr = e.message || 'offline'; pages = null; }
    // feat/calm-parity: no server to ask (a project on this device, no tribe yet, offline): the same pages ship inside
    // the app as guide-pages.json (scripts/dev/app-bundle.js)
    if (!pages) { try { const r = await fetch('guide-pages.json'); if (r.ok) { const j = await r.json(), b = j.pages || []; if (b.length) { pages = b; deep = j.paths || []; loadErr = ''; } } } catch {} }
    return pages;
  }

  const textOf = p => (p.title + '\n' + p.body).toLowerCase();
  function matches() { return (pages || []).filter(p => !q || q.split(/\s+/).every(w => textOf(p).includes(w))); }
  function snippet(p) {
    if (!q) return esc(p.summary);
    const w = q.split(/\s+/)[0], plain = p.body.replace(/[#*`|>]/g, '').replace(/\s+/g, ' '), i = plain.toLowerCase().indexOf(w);
    if (i < 0) return esc(p.summary);
    const s = Math.max(0, i - 40), part = plain.slice(s, i + w.length + 60);
    const k = part.toLowerCase().indexOf(w);
    return (s ? '…' : '') + esc(part.slice(0, k)) + '<mark>' + esc(part.slice(k, k + w.length)) + '</mark>' + esc(part.slice(k + w.length)) + '…';
  }

  function drawList() {
    const root = frame(), box = root.querySelector('#gd-list');
    if (!pages) {
      box.innerHTML = `<div class="gd-empty"><b>The guide lives on the tribe's computer</b><p>Open it from TribeCode while you're in a tribe, or read it on <a href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>.</p></div>`;
      return;
    }
    const list = matches();
    const dhits = q ? deepMatches() : [];
    const nav = q ? (dhits.length ? `<span class="eyebrow gd-eye">${T('In the paths')}</span><div class="gd-navs">${dhits.slice(0, 6).map(d => { const [id, lv] = splitDeep(d.slug), P = pathOf(id); return P ? `<a href="#/guide/path/${id}/${lv}" class="gd-nav" data-gdp="${id}" data-gdl="${lv}"><b>${esc(T(P[1]))}</b><small>${esc(T((LEVELS.find(l => l[0] === lv) || [])[1] || ''))} · ${snippet(d)}</small></a>` : ''; }).join('')}</div>` : '')
      : `<div class="gd-navs"><a href="#/guide/home" class="gd-nav ${cur === '@home' ? 'on' : ''}" data-gdh><b>${T('Help center')}</b><small>${T('Search, paths, tours and demos')}</small></a></div>
        <span class="eyebrow gd-eye">${T('Paths')}</span><div class="gd-navs">${PATHS.map(([id, t]) => `<a href="#/guide/path/${id}" class="gd-nav ${cur === '@' + id ? 'on' : ''}" data-gdp="${id}"><b>${esc(T(t))}</b></a>`).join('')}</div>`;
    box.innerHTML = nav + `<span class="eyebrow gd-eye">${q ? `${list.length} match${list.length === 1 ? '' : 'es'}` : 'Pages'}</span>` + (list.length ? `<ol class="gd-items">${list.map(p => {
      const n = pages.indexOf(p) + 1;
      return `<li><a href="#/guide/${esc(p.slug)}" class="gd-item ${p.slug === cur ? 'on' : ''}" data-gd="${esc(p.slug)}" ${p.slug === cur ? 'aria-current="page"' : ''}><span class="gd-n">${String(n).padStart(2, '0')}</span><span class="gd-t"><b>${esc(p.title)}</b><small>${snippet(p)}</small></span></a></li>`;
    }).join('')}</ol>` : `<div class="gd-empty"><p>Nothing about "${esc(q)}". Try another word, or press Ctrl K.</p></div>`);
  }

  const splitDeep = slug => { const m = /^(.*)-(basics|practice|production)$/.exec(slug) || []; return [m[1], m[2]]; };
  function deepMatches() {
    const words = q.split(/\s+/), hit = deep.filter(p => words.every(w => textOf(p).includes(w)));
    if (sem && sem.length) { const ids = sem.map(x => x.slug || x.id), extra = deep.filter(p => ids.includes(p.slug) && !hit.includes(p)); return [...hit, ...extra]; }
    return hit;
  }
  // Flint's search by meaning, when it is there (TribeMeaning.search); the word search above always works without it
  async function meaning() {
    sem = null; const M = window.TribeMeaning; if (!q || !M || !M.search) return;
    try { const want = q, r = await M.search(q, { docs: [...(pages || []), ...deep].map(p => ({ id: p.slug, slug: p.slug, title: p.title, text: p.body })), limit: 6 }); if (want === q && Array.isArray(r)) { sem = r; drawList(); } } catch {}
  }

  // ---------- the Help center home ----------
  function home() {
    const root = frame(), H = window.TribeHelp, all = H && H.all ? H.all() : {}, groups = H && H.groups ? H.groups() : [];
    cur = '@home';
    const ico = id => `<svg class="i"><use href="#${id}"/></svg>`;
    root.querySelector('#gd-page').innerHTML = `<span class="eyebrow gd-pg-eye">${T('Help center')}</span><h1>${T('What do you want to do?')}</h1>
      <p class="gd-lead">${T('Pick a goal for a short path from idea to a published link. Each one has a 60-second Show me and goes as deep as you need.')}</p>
      <button type="button" class="gd-next" data-gd-next>${ico('i-flag')}<span><b>${T('What should I do next?')}</b><small>${T('One step for where your project is right now')}</small></span></button>
      <div class="gd-paths">${PATHS.map(([id, t, line]) => `<a href="#/guide/path/${id}" class="gd-path" data-gdp="${id}"><b>${esc(T(t))}</b><small>${esc(T(line))}</small><span class="gd-lv">${LEVELS.map(l => T(l[1])).join(' · ')}</span></a>`).join('')}</div>
      ${groups.map(([title, keys]) => `<h2>${esc(T(title))}</h2><div class="gd-acts">${keys.filter(k => all[k]).map(k => `<button type="button" class="gd-act" data-help="${k}">${ico(all[k][0])}<span><b>${esc(T(all[k][1]))}</b>${all[k][2] ? `<small>${esc(T(all[k][2]))}</small>` : ''}</span></button>`).join('')}</div>`).join('')}
      <h2>${T('Things you can ask Flint')}</h2><div class="gd-asks">${(window.TribeNextStep ? window.TribeNextStep.prompts('home') : []).map(x => `<button type="button" class="ns-ask" data-gd-ask="${esc(x)}">${esc(T(x))}</button>`).join('')}</div>`;
    root.classList.add('reading'); root.querySelector('#gd-read').scrollTop = 0; drawList();
    if (location.hash !== '#/guide/home') history.replaceState(null, '', location.pathname + location.search + '#/guide/home');
  }
  // ---------- a path: the journey, Show me, and one page at three depths ----------
  function path(id, level) {
    const root = frame(), P = pathOf(id) || PATHS[0]; id = P[0];
    level = LEVELS.some(l => l[0] === level) ? level : 'basics'; cur = '@' + id;
    const pg = deepPage(id, level), body = pg ? window.TribeMD.render(pg.body.replace(/^#\s+.+\n/, '')) : `<p>${T('This page is not on this device yet. Open the Guide while you are in a tribe.')}</p>`;
    root.querySelector('#gd-page').innerHTML = `<span class="eyebrow gd-pg-eye">${T('Path')}</span><h1>${esc(T(P[1]))}</h1><p class="gd-lead">${esc(T(P[2]))}</p>
      <ol class="gd-journey">${P[4].map(([st, what, run], i) => `<li><span class="gd-jn">${i + 1}</span><span class="gd-jt"><b>${esc(T(st))}</b><small>${esc(T(what))}</small></span><button type="button" class="btn sm" data-gd-run="${esc(run)}">${T('Do it')}</button></li>`).join('')}</ol>
      <div class="gd-show"><button type="button" class="btn primary" data-gd-show="${esc(P[3])}">${T('Show me (60 seconds)')}</button><button type="button" class="btn" data-gd-next>${T('What should I do next?')}</button></div>
      <div class="gd-levels" role="tablist" aria-label="${T('How deep')}">${LEVELS.map(([lv, name]) => `<button type="button" role="tab" class="gd-level ${lv === level ? 'on' : ''}" aria-selected="${lv === level}" data-gdl="${lv}" data-gdp="${id}">${esc(T(name))}</button>`).join('')}</div>
      <div class="gd-deep md" data-level="${level}">${body}</div>`;
    root.querySelector('#gd-page').querySelectorAll('input[type=checkbox]').forEach(x => { x.disabled = true; });
    root.classList.add('reading'); root.querySelector('#gd-read').scrollTop = 0; drawList();
    const want = `#/guide/path/${id}${level === 'basics' ? '' : '/' + level}`;
    if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
  }

  function show(slug, { keepFocus } = {}) {
    const root = frame(), p = (pages || []).find(x => x.slug === slug) || (pages || [])[0];
    if (!p) return;
    cur = p.slug;
    const i = pages.indexOf(p), next = pages[i + 1], prev = pages[i - 1];
    root.querySelector('#gd-page').innerHTML = `<span class="eyebrow gd-pg-eye">${String(i + 1).padStart(2, '0')} of ${String(pages.length).padStart(2, '0')}</span>` + window.TribeMD.render(p.body)
      + `<nav class="gd-foot" aria-label="More pages">${prev ? `<a href="#/guide/${esc(prev.slug)}" class="gd-pn prev" data-gd="${esc(prev.slug)}"><small>Previous</small><b>${esc(prev.title)}</b></a>` : '<span></span>'}${next ? `<a href="#/guide/${esc(next.slug)}" class="gd-pn next" data-gd="${esc(next.slug)}"><small>Next</small><b>${esc(next.title)}</b></a>` : ''}</nav>`;
    root.querySelector('#gd-page').querySelectorAll('input[type=checkbox]').forEach(x => { x.disabled = true; });
    root.classList.add('reading');
    root.querySelector('#gd-read').scrollTop = 0;
    drawList();
    const want = '#/guide/' + p.slug;
    if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
    if (!keepFocus) root.querySelector('#gd-read').focus({ preventScroll: true });
  }
  function showList() {
    const root = frame(); root.classList.remove('reading');
    if (location.hash !== '#/guide') history.replaceState(null, '', location.pathname + location.search + '#/guide');
  }

  async function open(slug) {
    const root = frame(); open_ = true;
    if (window.TribeWorkshop && window.TribeWorkshop.close && document.body.classList.contains('ws-open')) window.TribeWorkshop.close();
    root.classList.remove('hidden'); document.body.classList.add('gd-open'); document.body.classList.remove('drawer-open');
    await load();
    if (!open_) return;
    if (typeof slug !== 'string' || !slug) slug = null;
    if (slug === '@home') { if (pages) return home(); slug = null; }
    if (slug && slug[0] === '@') { if (pages) { const [pid, lv] = slug.slice(1).split('/'); return path(pid, lv); } slug = null; }
    drawList();
    if (!pages) { root.classList.remove('reading'); root.querySelector('#gd-page').innerHTML = ''; return; }
    if (slug || !phone()) show(slug || (cur && cur[0] !== '@' ? cur : null) || (pages[0] || {}).slug);
    else showList();
    if (!phone()) root.querySelector('#gd-q').focus({ preventScroll: true });
  }
  function close() {
    const root = document.getElementById('guide'); if (!root || !open_) return;
    open_ = false; root.classList.add('hidden'); document.body.classList.remove('gd-open');
    if (/^#\/guide/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open_ && !document.querySelector('#palette:not(.hidden)')) { e.preventDefault(); close(); } });
  // Leaving for a project (a circle, the logo, a section) closes the Guide, like the Workshop.
  document.addEventListener('click', e => { if (open_ && e.target.closest && e.target.closest('#pj-rail, #rail-logo, #pj-plus, #rail-workshop, [data-nav], [data-pnav]') && !e.target.closest('#guide')) close(); }, true);
  const fromHash = () => {
    const h = location.hash, pm = /^#\/guide\/path\/([a-z]+)(?:\/([a-z]+))?$/.exec(h);
    if (pm) { if (!open_ || cur !== '@' + pm[1]) open('@' + pm[1] + (pm[2] ? '/' + pm[2] : '')); return; }
    if (h === '#/guide/home') { if (!open_ || cur !== '@home') open('@home'); return; }
    const m = /^#\/guide(?:\/([a-z0-9-]+))?$/.exec(h); if (m) { if (!open_ || (m[1] && m[1] !== cur)) open(m[1]); } else if (open_) close();
  };
  addEventListener('hashchange', fromHash);
  if (/^#\/guide/.test(location.hash)) setTimeout(fromHash, 300);

  window.TribeGuide = { open, home: () => open('@home'), path: (id, level) => open('@' + (id || 'website') + (level ? '/' + level : '')), paths: () => PATHS.map(x => ({ id: x[0], title: x[1], line: x[2] })), levels: () => LEVELS.map(l => l[0]), close, isOpen: () => open_ };
})();
