// The Guide (#/guide, #/guide/<slug>): how to TribeCode in a handful of short pages, tucked away.
// No sidebar row and no floating button: it opens from the profile menu (Guide), Ctrl K (Guide) and the
// small "? Guide" link at the bottom of Settings. Pages are docs/guide/*.md, served read-only by
// server/guide.js (GET /api/guide, /api/guide/<slug>) and rendered with app/ui/md.js.
// Desktop: a list of pages on the left and a reading column (line-height 1.6, ~65ch).
// Phones (<= 820px): one list, tap a page, Back returns to the list. Search filters titles and text.
// Public: window.TribeGuide = { open(slug?), close(), isOpen() }.
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

  let pages = null, cur = null, q = '', open_ = false, loadErr = '';

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
    let t; root.querySelector('#gd-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim().toLowerCase(); drawList(); if (q && !phone()) { const first = matches()[0]; if (first && (!cur || !matches().some(p => p.slug === cur))) show(first.slug, { keepFocus: true }); } }, 120); });
    root.querySelector('#gd-q').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = matches()[0]; if (first) { show(first.slug); } } });
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-gd]'); if (a) { e.preventDefault(); show(a.dataset.gd); }
    });
    return root;
  }

  async function load() {
    if (pages) return pages;
    loadErr = '';
    try {
      const base = (C && C.base && C.base()) || '';
      const r = await fetch(base + '/api/guide', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      pages = ((await r.json()).pages || []);
      if (!pages.length) { pages = null; loadErr = 'empty'; }   // a project on this device has no guide pages: say where the guide is, not "Nothing about"
    } catch (e) { loadErr = e.message || 'offline'; pages = null; }
    // feat/calm-parity: no server to ask (a project on this device, no tribe yet, offline): the same pages ship inside
    // the app as guide-pages.json (scripts/dev/app-bundle.js)
    if (!pages) { try { const r = await fetch('guide-pages.json'); if (r.ok) { const b = (await r.json()).pages || []; if (b.length) { pages = b; loadErr = ''; } } } catch {} }
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
    box.innerHTML = `<span class="eyebrow gd-eye">${q ? `${list.length} match${list.length === 1 ? '' : 'es'}` : 'Pages'}</span>` + (list.length ? `<ol class="gd-items">${list.map(p => {
      const n = pages.indexOf(p) + 1;
      return `<li><a href="#/guide/${esc(p.slug)}" class="gd-item ${p.slug === cur ? 'on' : ''}" data-gd="${esc(p.slug)}" ${p.slug === cur ? 'aria-current="page"' : ''}><span class="gd-n">${String(n).padStart(2, '0')}</span><span class="gd-t"><b>${esc(p.title)}</b><small>${snippet(p)}</small></span></a></li>`;
    }).join('')}</ol>` : `<div class="gd-empty"><p>Nothing about "${esc(q)}". Try another word, or press Ctrl K.</p></div>`);
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
    drawList();
    if (!pages) { root.classList.remove('reading'); root.querySelector('#gd-page').innerHTML = ''; return; }
    if (slug || !phone()) show(slug || cur || (pages[0] || {}).slug);
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
  const fromHash = () => { const m = /^#\/guide(?:\/([a-z0-9-]+))?$/.exec(location.hash); if (m) { if (!open_ || (m[1] && m[1] !== cur)) open(m[1]); } else if (open_) close(); };
  addEventListener('hashchange', fromHash);
  if (/^#\/guide/.test(location.hash)) setTimeout(fromHash, 300);

  window.TribeGuide = { open, close, isOpen: () => open_ };
})();
