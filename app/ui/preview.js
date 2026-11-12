// App preview: the app the tribe is building, live, in the right panel (desktop), a full-screen sheet
// (phones) or a normal browser tab. The server side is server/preview.js.
// Public: window.TribePreview = { open(), openTab(), refresh(), close(), url() }.
//
// The page is served from /preview/<project>/<pt>/ with a short-lived signed preview token (never the
// member's key) and `CSP: sandbox` without allow-same-origin, and the iframe is sandboxed the same way, so
// the previewed code can't touch TribeCode's storage or API. It reloads itself when files change (the
// server pushes an SSE event into the page; the `preview` WebSocket event is the fallback here).
// Mounted through TribeShell.preview (shell.js's right panel), feature-detected; without it, a sheet.
(function () {
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const SANDBOX = 'allow-scripts allow-forms allow-pointer-lock allow-popups';
  const DEVICES = { desktop: { w: 1280, h: 800, label: 'Desktop' }, tablet: { w: 768, h: 1024, label: 'Tablet' }, phone: { w: 390, h: 844, label: 'Phone' } };
  const ico = d => `<svg class="pvw-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    tab: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    shot: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    gear: '<path d="M10.3 2.6h3.4l.5 2.6a7.3 7.3 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.8a7.4 7.4 0 0 1 0 2.2l2 1.8-1.7 2.9-2.5-.9a7.3 7.3 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.3 7.3 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.8a7.4 7.4 0 0 1 0-2.2l-2-1.8 1.7-2.9 2.5.9a7.3 7.3 0 0 1 1.9-1.1z"/><circle cx="12" cy="12" r="2.8"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    design: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M9 9v11"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    chev: '<path d="m7 10 5 5 5-5"/>',
    more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    home: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 8v6M9 11h6"/>',
    saved: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    app: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/>',
    site: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    zoom: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8.5 11h5"/>',
  };
  // quick jumps from the focused preview back into the app (TribeShell.go keys); badges come from the sidebar's counters
  const JUMPS = [{ key: 'chat', label: 'Chat', icon: 'i-chat', n: '#nn-chat' }, { key: 'ws-tasks', label: 'Tasks', icon: 'i-check', n: '#nn-tasks' }, { key: 'docs', label: 'Docs & files', icon: 'i-doc' }, { key: 'repo', label: 'Code', icon: 'i-git' }];
  const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  let pdev = lsGet('tribecode.preview.pdevice', 'phone') === 'desktop' ? 'desktop' : 'phone';
  let src = 'app', site = null, siteBusy = null, lastFy = 0, zoom = 1, zx = 0, zy = 0;
  let info = null, infoAt = 0, pane = null, frame = null, device = lsGet('tribecode.preview.device', 'desktop'), helperAlive = false, lastHref = '', shots = new Map(), ro = null, sheet = null;
  if (!DEVICES[device]) device = 'desktop';

  const absUrl = p => (/^https?:/.test(p) ? p : C.base() + p);
  async function token(force) {
    const fresh = info && Date.parse(info.expires) - Date.now() > 10 * 60_000 && info.project === C.project();
    if (!force && fresh && Date.now() - infoAt < 60_000) return info;
    if (!force && fresh) { status().catch(() => {}); return info; }
    info = await C.api('/preview/token', { method: 'POST' }); infoAt = Date.now();
    return info;
  }
  async function status() { const r = await C.api('/preview'); if (info) Object.assign(info, r.preview); return r.preview; }
  const appUrl = () => (info ? absUrl(info.path) : null);
  const url = () => (src === 'site' ? (site && site.draftUrl ? absUrl(site.draftUrl) : null) : appUrl());
  // ---------- the project website (server/showcase.js draft; Flint edits it locally, server/siteflint.js) ----------
  const srcKey = () => 'tribecode.preview.src:' + (C.project() || '');
  async function loadSite() {
    const pid = C.project(); if (!pid) return null;
    try {
      const w = (await C.api(`/projects/${encodeURIComponent(pid)}/website`)).website || {}, g = w.gen || {};
      site = { pid, has: !!(g.draft && g.draftUrl), draftUrl: g.draftUrl ? g.draftUrl + '&edit=1' : null, updated: (g.draft && g.draft.updated) || '', canDraft: g.canDraft !== false, canPublish: !!g.canPublish, unpublished: !!g.unpublished };
    } catch { site = { pid, has: false, draftUrl: null, updated: '', canDraft: false }; }
    return site;
  }
  const siteSrc = () => (site && site.draftUrl ? absUrl(site.draftUrl) + '&v=' + encodeURIComponent(site.updated || Date.now()) : null);
  function setSource(s, quiet) {
    if (s !== 'app' && s !== 'site') return;
    if (s === src && !quiet) return;
    src = s; lsSet(srcKey(), s);
    if (editing) { editing = false; picked = null; if (window.TribePreviewFlint) window.TribePreviewFlint.pick(null); }
    frame = null; helperAlive = false; lastHref = ''; lastFy = 0; resetZoom();
    if (window.TribeSiteShelf && s !== 'site') window.TribeSiteShelf.close();
    const go = () => render();
    if (window.TribeMotion && window.TribeMotion.swap && !quiet) window.TribeMotion.swap(go); else go();
    if (window.TribePreviewFlint && window.TribePreviewFlint.source) window.TribePreviewFlint.source(s);
  }
  async function makeSite(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Making it…'; }
    try { await C.api(`/projects/${encodeURIComponent(C.project())}/website/instant`, { method: 'POST', body: {} }); await loadSite(); frame = null; render(); toast('Your website draft is ready. Click anything on it, or tell Flint what to change.'); }
    catch (e) { toast(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Make the website'; } }
  }
  function toBuilder() { close(); setTimeout(() => { try { location.hash = '#/docs/website'; } catch {} }, 0); }

  // ---------- the pane ----------
  function shell() {
    const el = document.createElement('div');
    el.className = 'pvw'; el.id = 'pvw';
    el.innerHTML = `<div class="pvw-bar" data-tauri-drag-region>
        <button class="pvw-back" data-act="back" title="Back to the app (Esc)" aria-label="Back to the app">${ico(I.back)}<span>Back to app</span></button>
        <button class="pvw-proj" data-act="proj" aria-haspopup="menu" title="Switch project"><span class="pvw-face" id="pvw-face"></span><b id="pvw-pname"></b>${ico(I.chev)}</button>
        <form class="pvw-path" id="pvw-path" autocomplete="off"><span class="pvw-path-k" aria-hidden="true">/</span><input id="pvw-path-in" spellcheck="false" aria-label="Page to show" placeholder="index.html"></form>
        <div class="pvw-src" role="tablist" aria-label="What to preview"><button role="tab" data-src="app" title="The app or game in the code" aria-selected="true">${ico(I.app)}<span>App</span></button><button role="tab" data-src="site" title="The project website (a draft until someone publishes it)" aria-selected="false">${ico(I.site)}<span>Website</span></button></div>
        <div class="pvw-seg" role="tablist" aria-label="Device size">${Object.entries(DEVICES).map(([k, d]) => `<button role="tab" data-dev="${k}" title="${d.label}${k === 'desktop' ? '' : ' · ' + d.w + 'px'}" aria-label="${d.label}">${ico(I[k])}<span>${d.label}</span></button>`).join('')}</div>
        <span class="pvw-meta" id="pvw-meta"></span>
        <span class="pvw-sp" data-tauri-drag-region></span>
        <span class="pvw-jump" role="group" aria-label="Back to a part of the app">${JUMPS.map(j => `<button class="pvw-btn" data-jump="${j.key}" title="${j.label}" aria-label="${j.label}"><svg class="pvw-i pvw-u"><use href="#${j.icon}"/></svg><b class="pvw-badge hidden" data-badge="${j.key}"></b></button>`).join('')}</span>
        <span class="pvw-div" aria-hidden="true"></span>
        <button class="pvw-btn" data-act="reload" title="Reload" aria-label="Reload">${ico(I.reload)}</button>
        <button class="pvw-btn" data-act="tab" title="Open in a new browser tab" aria-label="Open in a new browser tab">${ico(I.tab)}</button>
        <button class="pvw-btn" data-act="share" title="Copy a link friends can open on their phone" aria-label="Copy share link">${ico(I.link)}</button>
        <button class="pvw-btn pvw-edit" data-act="edit" title="Select: click anything on the page, then say what to change (double-click text to type over it)" aria-label="Select something on the page" aria-pressed="false"><svg class="pvw-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.5L10 19z"/></svg><span>Select</span></button>
        <button class="pvw-btn pvw-design" data-act="design" title="Open the website designer: blocks, pages, wiring, dark mode, Download HTML" aria-label="Design the website">${ico(I.design)}<span>Design</span></button>
        <button class="pvw-btn pvw-saved" data-act="shelf" title="Saved versions of the website: compare and restore" aria-label="Saved versions" aria-pressed="false">${ico(I.saved)}<span>Saved</span></button>
        <span class="pvw-morew"><button class="pvw-btn" data-act="more" title="More" aria-label="More" aria-haspopup="menu" aria-expanded="false">${ico(I.more)}</button>
          <span class="pvw-more hidden" id="pvw-more" role="menu">
            <button class="pvw-btn" role="menuitem" data-act="shot" title="Screenshot to Visuals" aria-label="Screenshot to Visuals">${ico(I.shot)}<span>Screenshot to Visuals</span></button>
            <button class="pvw-btn" role="menuitem" data-act="home" title="${isPhone() ? 'Add to Home Screen' : 'Desktop shortcut / Home Screen'}" aria-label="Add to Home Screen">${ico(I.home)}<span>${isPhone() ? 'Add to Home Screen' : 'Desktop shortcut'}</span></button>
            <button class="pvw-btn hidden" role="menuitem" data-act="gear" title="How the preview runs (host)" aria-label="Preview settings">${ico(I.gear)}<span>How the preview runs</span></button>
          </span></span>
      </div>
      <form class="pvw-set hidden" id="pvw-set"></form>
      <form class="pvw-edbar hidden" id="pvw-edbar" autocomplete="off"><span class="pvw-edhint" id="pvw-edhint"><b>Editing.</b> Double-click any text to change it. Or click something and tell Flint what to change.</span>
        <span class="pvw-edpick hidden" id="pvw-edpick"></span><input class="input pvw-edask" id="pvw-edask" placeholder="Click something on the page first" disabled maxlength="600" aria-label="What should Flint change?"><button class="btn sm primary" id="pvw-edgo" disabled>Ask Flint</button><button type="button" class="btn sm" data-act="edit">Done</button></form>
      <div class="pvw-body"><div class="pvw-stage" id="pvw-stage"><div class="pvw-frame" id="pvw-frame"></div><div class="pvw-zoom hidden" id="pvw-zoom" aria-hidden="true"></div><span class="pvw-zl hidden" id="pvw-zl"></span><span class="pvw-edge" id="pvw-edge" aria-hidden="true"></span></div></div>
      <nav class="pvw-ph" id="pvw-ph" aria-label="Page or edit"><button type="button" data-ph="page" aria-pressed="true">${ico(I.app)}<span>Page</span></button><button type="button" data-ph="edit" aria-pressed="false"><img src="assets/flint.svg" alt="" width="16" height="16"><span>Edit</span></button><button type="button" data-ph="saved" aria-pressed="false">${ico(I.saved)}<span>Saved</span></button></nav>`;
    el.addEventListener('click', e => {
      const d = e.target.closest('[data-dev]'); if (d) return setDevice(d.dataset.dev);
      const sv = e.target.closest('[data-src]'); if (sv) return setSource(sv.dataset.src);
      const ph = e.target.closest('[data-ph]'); if (ph) return phoneTab(ph.dataset.ph);
      const j = e.target.closest('[data-jump]'); if (j) return jump(j.dataset.jump);
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act !== 'more') moreMenu(false);
      ({ design: () => window.TribeSiteDesigner && window.TribeSiteDesigner.open({ pid: C.project() }), back: exit, proj: () => projMenu(a), more: () => moreMenu(), edit: toggleEdit, reload: () => reload(true), tab: openTab, share: copyShare, shot: screenshot, gear: toggleSettings, ask: askClaude, shelf: () => toggleShelf(), mksite: () => makeSite(a), builder: toBuilder, tosite: () => setSource('site'), toapp: () => setSource('app'), unzoom: resetZoom, repo: () => { close(); window.TribeApp && window.TribeApp.show('repo'); },
        home: () => window.TribeFolders && window.TribeFolders.home() })[a.dataset.act]?.();   // Home Screen / desktop shortcut (app/ui/folders.js)
    });
    return el;
  }
  // ---------- the focused workspace (v0.28): just the preview and Flint, full window ----------
  // Opening the preview hides the circle rail, the sidebar and the page (body.pvw-focus, preview.css); the bar has Back,
  // quick jumps into the app and everything else. Back / Esc / browser Back return exactly where you were.
  let backTo = null, pushed = false, returning = false, retPill = null;
  const PREV_RE = /^#\/preview(?:\/([^/?#]+))?$/;
  function enterFocus() {
    if (!backTo) backTo = { hash: PREV_RE.test(location.hash) ? '' : location.hash, view: document.body.dataset.view || '' };
    document.body.classList.add('pvw-focus');
    hidePill();
    const want = '#/preview/' + encodeURIComponent(C.project() || '');
    if (location.hash !== want) {
      try { history.pushState({ pvw: 1 }, '', location.pathname + location.search + want); pushed = true; } catch { pushed = false; }
    }
  }
  function leaveFocus() {
    if (!document.body.classList.contains('pvw-focus')) return;
    document.body.classList.remove('pvw-focus');
    moreMenu(false);
    const to = backTo; backTo = null;
    if (PREV_RE.test(location.hash)) {
      if (pushed && history.state && history.state.pvw) { returning = true; history.back(); }
      else { try { history.replaceState(null, '', location.pathname + location.search + ((to && to.hash) || '')); } catch {} }
    }
    pushed = false;
  }
  function exit() { close(); }
  addEventListener('popstate', () => {
    if (returning) { returning = false; return; }
    if (document.body.classList.contains('pvw-focus') && !PREV_RE.test(location.hash)) { pushed = false; close(); }
    else if (!document.body.classList.contains('pvw-focus') && PREV_RE.test(location.hash)) fromHash();
  });
  // deep link: #/preview/<project>
  let deep = false;
  async function fromHash() {
    const m = PREV_RE.exec(location.hash); if (!m || deep) return;
    if (pane && pane.isConnected) return;
    if (!C.connected() && !C.hasToken()) return;
    deep = true;
    try {
      const pid = m[1] ? decodeURIComponent(m[1]) : '';
      if (pid && pid !== C.project() && window.TribeProjects && window.TribeProjects.switchTo) { await window.TribeProjects.switchTo(pid, 'home'); await new Promise(r => setTimeout(r, 250)); }
      backTo = { hash: '', view: document.body.dataset.view || '' };
      pushed = false;
      await open();
    } finally { deep = false; }
  }
  addEventListener('hashchange', () => { if (PREV_RE.test(location.hash) && !document.body.classList.contains('pvw-focus')) fromHash(); });
  if (C.on) C.on('hello', () => setTimeout(fromHash, 120));

  // quick jump: leave the workspace for a part of the app; a slim pill brings you straight back
  function jump(key) {
    close();
    const S = window.TribeShell;
    setTimeout(() => { if (S && S.go) S.go(key); showPill(); }, 0);
  }
  function showPill() {
    if (isPhone()) return;
    if (!retPill) {
      retPill = document.createElement('div'); retPill.className = 'pvw-ret'; retPill.id = 'pvw-ret';
      retPill.innerHTML = `<button type="button" class="pvw-ret-go" data-ret="go">${ico(I.play)}<span>Back to preview</span></button><button type="button" class="pvw-ret-x" data-ret="x" title="Dismiss" aria-label="Dismiss">✕</button>`;
      retPill.addEventListener('click', e => { const b = e.target.closest('[data-ret]'); if (!b) return; hidePill(); if (b.dataset.ret === 'go') open(); });
      document.body.appendChild(retPill);
    }
    retPill.classList.remove('hidden');
  }
  function hidePill() { if (retPill) retPill.classList.add('hidden'); }
  function moreMenu(on) {
    const m = pane && pane.querySelector('#pvw-more'), b = pane && pane.querySelector('[data-act="more"]'); if (!m) return;
    const want = on === undefined ? m.classList.contains('hidden') : !!on;
    m.classList.toggle('hidden', !want); if (b) b.setAttribute('aria-expanded', String(want));
  }
  document.addEventListener('pointerdown', e => { if (pane && !e.target.closest('.pvw-morew')) moreMenu(false); if (!e.target.closest('.pvw-pmenu, [data-act="proj"]')) projMenu(null, false); }, true);
  let pmenu = null;
  function projMenu(anchor, on) {
    if (on === false || (pmenu && on !== true)) { if (pmenu) { pmenu.remove(); pmenu = null; } return; }
    if (!anchor) return;
    const list = (C.state().projects || []), cur = C.project(), F = window.TribeProjects && window.TribeProjects.face;
    pmenu = document.createElement('div'); pmenu.className = 'pvw-pmenu'; pmenu.setAttribute('role', 'menu');
    pmenu.innerHTML = `<p class="pvw-pmenu-k">Preview a project</p>` + list.map(p => `<button type="button" role="menuitem" data-pp="${esc(p.id)}" class="${p.id === cur ? 'on' : ''}">${F ? F(p, 'sm') : ''}<span>${esc(p.name)}</span></button>`).join('');
    const r = anchor.getBoundingClientRect(); pmenu.style.left = Math.round(r.left) + 'px'; pmenu.style.top = Math.round(r.bottom + 6) + 'px';
    pmenu.addEventListener('click', async e => {
      const b = e.target.closest('[data-pp]'); if (!b) return; const id = b.dataset.pp; projMenu(null, false);
      if (id === C.project()) return;
      backTo = backTo || { hash: '', view: '' };
      const keep = backTo; close();
      if (window.TribeProjects && window.TribeProjects.switchTo) await window.TribeProjects.switchTo(id, 'home');
      setTimeout(() => { backTo = keep; open(); }, 250);
    });
    document.body.appendChild(pmenu);
  }
  function paintBar() {
    if (!pane) return;
    const p = (C.state().projects || []).find(x => x.id === C.project()) || {};
    const n = pane.querySelector('#pvw-pname'); if (n) n.textContent = p.name || 'App';
    const f = pane.querySelector('#pvw-face'), F = window.TribeProjects && window.TribeProjects.face;
    if (f) f.innerHTML = F && p.id ? F(p, 'sm') : '';
    JUMPS.forEach(j => {
      const b = pane.querySelector(`[data-badge="${j.key}"]`); if (!b) return;
      const src = j.n && document.querySelector(j.n), t = src ? src.textContent.trim() : '';
      b.textContent = t; b.classList.toggle('hidden', !t || t === '0');
    });
    // comment pins (pins.js) join the editing tools beside Edit, apart from the quick jumps
    const pb = pane.querySelector('.pvw-bar > .pin-bar'), ed = pane.querySelector('.pvw-bar > .pvw-edit');
    if (pb && ed && pb.nextElementSibling !== ed) ed.before(pb);
    const pi = pane.querySelector('#pvw-path-in');
    if (pi && document.activeElement !== pi) pi.value = relPath(lastHref);
  }
  const relPath = h => { if (!h || !info || !info.path) return ''; const i = h.indexOf(info.path); return (i >= 0 ? h.slice(i + info.path.length) : '').replace(/^\/+/, ''); };
  function afterMount() {
    if (!pane) return;
    // Flint's toggle sits at the far right, then the window buttons (frameless desktop app) when the shell shows them
    const bar = pane.querySelector('.pvw-bar'), fl = bar && bar.querySelector('[data-pvf-toggle]');
    if (fl) bar.appendChild(fl);
    const wc = document.getElementById('win-ctl');
    if (bar && wc && !bar.querySelector('.pvw-wc') && getComputedStyle(wc).display !== 'none' && wc.offsetParent !== null) {
      const c = document.createElement('span'); c.className = 'pvw-wc'; c.innerHTML = wc.innerHTML;
      c.addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; const o = wc.querySelector(`[data-w="${b.dataset.w}"]`); if (o) o.click(); });
      bar.appendChild(c);
    }
    const form = pane.querySelector('#pvw-path');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); const v = pane.querySelector('#pvw-path-in').value.trim(); show(v); pane.querySelector('#pvw-path-in').blur(); });
    paintBar(); setTimeout(paintBar, 400);
  }
  setInterval(() => { if (pane && document.body.classList.contains('pvw-focus')) paintBar(); }, 2000);
  // going somewhere else in the app (Ctrl K, a notification, a link) while the workspace is up leaves it, with the pill to come back
  new MutationObserver(() => { if (pane && pane.isConnected && document.body.classList.contains('pvw-focus') && !isPhone()) { close(); showPill(); } })
    .observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  // Esc peels the innermost layer first: pin thread → picker/edit mode → a text box → the workspace.
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !pane || !pane.isConnected) return;
    if (document.querySelector('.modal:not(.hidden)')) return;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (pmenu) { projMenu(null, false); return stop(); }
    const mm = pane.querySelector('#pvw-more'); if (mm && !mm.classList.contains('hidden')) { moreMenu(false); return stop(); }
    if (window.TribeSiteShelf && window.TribeSiteShelf.isOpen()) { window.TribeSiteShelf.close(); return stop(); }
    if (window.TribePins && window.TribePins.escape && window.TribePins.escape()) return stop();
    if (editing) { toggleEdit(); return stop(); }
    const tg = e.target; if (tg && pane.contains(tg) && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) { tg.blur(); return stop(); }
    // otherwise the shell's Esc closes the preview panel; cleanup() leaves focus mode
  }, true);

  function mount(el) {
    const S = window.TribeShell;
    const title = ((C.state().projects || []).find(p => p.id === C.project()) || {}).name || 'App';
    if (S && S.preview && $('#preview-body')) {
      S.preview({ kind: 'Preview', title, node: el });
      document.body.classList.add('pvw-on');
      enterFocus();
      const host = $('#preview-body');
      const mo = new MutationObserver(() => { if (!el.isConnected) { mo.disconnect(); cleanup(); } });
      mo.observe(host, { childList: true });
      return;
    }
    // No shell (or no right panel): a full-screen sheet of our own.
    sheet = document.createElement('div'); sheet.className = 'pvw-sheet';
    sheet.innerHTML = `<header class="pvw-sheet-h"><span class="eyebrow">Preview</span><b>${esc(title)}</b><span class="pvw-sp"></span><button class="pvw-btn" data-close aria-label="Close preview">✕</button></header>`;
    sheet.appendChild(el); document.body.appendChild(sheet); document.body.classList.add('pvw-on');
    sheet.querySelector('[data-close]').onclick = close;
  }
  function cleanup() {
    document.body.classList.remove('pvw-on');
    leaveFocus(); projMenu(null, false);
    if (editing) { editing = false; picked = null; }
    if (ro) { ro.disconnect(); ro = null; }
    pane = null; frame = null; helperAlive = false;
  }
  function close() {
    if (sheet) { sheet.remove(); sheet = null; cleanup(); return; }
    if (pane && window.TribeShell && window.TribeShell.closePreview) window.TribeShell.closePreview();
    cleanup();
  }

  async function open() {
    if (!C.connected() && !C.hasToken()) return toast('Connect to your tribe first.');
    if (!pane || !pane.isConnected) {
      pane = shell(); mount(pane);
      // v0.27: Flint stays open beside the preview (app/ui/previewflint.js)
      if (window.TribePreviewFlint) window.TribePreviewFlint.mount(pane, { project: () => (info && info.project) || C.project(), href: () => lastHref, relayout: () => layout(), kind: () => (window.TribeSense && window.TribeSense.kind && window.TribeSense.kind()) || '', source: () => src, onPhoneOpen: on => paintPh(on ? 'edit' : 'page') });
      phoneGestures();
      afterMount();
    }
    const mine = pane; mine.classList.add('loading');
    try { await Promise.all([token(), loadSite()]); }
    catch (e) { mine.classList.remove('loading'); return pane === mine ? renderError(e.message) : undefined; }
    mine.classList.remove('loading');
    if (pane !== mine) return;   // closed while the token was on its way (the user went somewhere else)
    // which one to show: what you picked last time in this project, else the app when it runs, else the website draft
    const saved = lsGet(srcKey(), '');
    src = saved === 'site' || saved === 'app' ? saved : (info.hasRepo && info.hasIndex) ? 'app' : site && site.has ? 'site' : 'app';
    if (window.TribePreviewFlint && window.TribePreviewFlint.source) window.TribePreviewFlint.source(src);
    render();
  }
  function renderError(msg) {
    const f = pane && pane.querySelector('#pvw-frame'); if (!f) return;
    f.innerHTML = `<div class="pvw-empty"><span class="eyebrow">Preview</span><h3>Couldn't open the preview</h3><p>${esc(msg)}</p></div>`;
  }
  function render() {
    if (!pane || !info) return;
    const phone = isPhone();
    pane.dataset.device = phone ? (pdev === 'desktop' ? 'desktop' : 'fill') : device;
    pane.dataset.showing = src; pane.classList.toggle('src-site', src === 'site');
    pane.querySelectorAll('[data-src]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.src === src)));
    pane.querySelector('.pvw-saved').classList.toggle('hidden', src !== 'site');
    { const d = pane.querySelector('.pvw-design'); if (d) d.classList.toggle('hidden', src !== 'site'); }
    paintPh();
    if (src === 'site') return renderSite();
    pane.querySelectorAll('[data-dev]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.dev === (phone ? pdev : device))));
    pane.querySelector('[data-act="gear"]').classList.toggle('hidden', !info.canConfigure);
    const meta = pane.querySelector('#pvw-meta');
    meta.textContent = info.mode === 'dev' ? `dev :${info.port}` : info.root ? (info.root === '.' ? 'top folder of the code' : info.root + '/') : '';
    meta.title = info.mode === 'dev' ? `Proxying the dev server on localhost:${info.port} on the host` : 'Serving index.html from the code repository';
    const empty = !info.hasRepo || !info.hasIndex;
    pane.classList.toggle('is-empty', empty);
    pane.querySelector('#pvw-path').classList.remove('hidden');
    if (window.TribePhoneApp) window.TribePhoneApp.preview(pane, { empty });   // phone app mode: open it on a device (app/ui/phoneapp.js)
    pane.querySelectorAll('[data-act="tab"],[data-act="share"],[data-act="shot"],[data-act="reload"]').forEach(b => { b.disabled = empty; });
    const holder = pane.querySelector('#pvw-frame');
    if (empty) {
      frame = null; helperAlive = false;
      // v0.26: an AI Studio style start screen: say what to make, it gets a runnable first version right away (the
      // starter, when you're the host) and your agents and Flint build it out from there, live, in this pane.
      holder.innerHTML = `<div class="pvw-empty pvw-build"><span class="eyebrow">Preview · nothing to run yet</span><h3>What should it be?</h3>
        <p>Describe the app, game or site. You get a first version you can run here straight away, then your Claude and the tribe's agents build it out while you watch.</p>
        <form class="pvw-bform" id="pvw-bform" autocomplete="off"><textarea class="input" id="pvw-bprompt" rows="3" maxlength="1200" placeholder="A cozy pixel platformer where a little flame lights lanterns" aria-label="What should it be?"></textarea>
        <div class="pvw-bchips">${['A pixel platformer game', 'A website for a local bakery', 'A to-do app for our team', 'A 3D tavern to walk around'].map(t => `<button type="button" class="chip" data-bchip="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="pvw-brow"><button class="btn primary" id="pvw-bgo">${ico(I.play)} Build it</button>${info.hasRepo ? '' : '<button type="button" class="btn" data-act="repo">Set up the code repository</button>'}</div>
        <p class="pvw-bstat faint" id="pvw-bstat" aria-live="polite"></p></form>
        ${site && site.has ? `<p class="pvw-alt">The website is ready to look at. <button type="button" class="btn sm" data-act="tosite">${ico(I.site)} Show the website</button></p>` : ''}
        <details class="pvw-what"><summary>What does the preview run?</summary><p>A file called <code>index.html</code> in the code repository (or in <code>public/</code>, <code>dist/</code>, <code>build/</code>, <code>app/</code> or <code>web/</code>), or the dev server the host points it at.</p></details></div>`;
      const fm = holder.querySelector('#pvw-bform'), ta = holder.querySelector('#pvw-bprompt');
      holder.querySelectorAll('[data-bchip]').forEach(c => c.onclick = () => { ta.value = c.dataset.bchip; ta.focus(); });
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) fm.requestSubmit(); });
      fm.onsubmit = e => { e.preventDefault(); buildFrom(ta.value.trim()); };
      layout(); return;
    }
    if (!frame || !frame.isConnected) {
      holder.innerHTML = '';
      frame = document.createElement('iframe');
      frame.className = 'pvw-iframe'; frame.id = 'pvw-iframe';
      frame.setAttribute('sandbox', SANDBOX);
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('allow', 'fullscreen; gamepad; autoplay');
      frame.title = 'App preview';
      holder.appendChild(frame);
      load(url());
    }
    layout();
    if (!ro && window.ResizeObserver) { ro = new ResizeObserver(() => layout()); ro.observe(pane.querySelector('#pvw-stage')); }
  }
  // The website draft: the same frame, sandboxed (scripts for TribeCode's own helper only, no same-origin), with
  // click-to-select on and Flint's local edits beside it. No draft yet: one tap makes it.
  function renderSite() {
    const holder = pane.querySelector('#pvw-frame');
    pane.querySelector('#pvw-path').classList.add('hidden');
    const meta = pane.querySelector('#pvw-meta'); meta.textContent = site && site.unpublished ? 'draft · not published yet' : site && site.has ? 'draft' : ''; meta.title = 'Only the tribe sees the draft. The host or the project lead publishes it from Files › Website.';
    const empty = !(site && site.has);
    pane.classList.toggle('is-empty', empty);
    pane.querySelectorAll('[data-act="tab"],[data-act="share"],[data-act="shot"],[data-act="reload"],[data-act="edit"],[data-act="shelf"]').forEach(b => { b.disabled = empty; });
    if (window.TribePhoneApp) window.TribePhoneApp.preview(pane, { empty: true });
    if (empty) {
      frame = null; helperAlive = false;
      holder.innerHTML = `<div class="pvw-empty pvw-build"><span class="eyebrow">Website · nothing yet</span><h3>Make the project's website</h3>
        <p>One tap makes a first draft from what the project already has: its name, bio, vision, screenshots and team. Then click anything on it and tell Flint what to change. No AI needed.</p>
        <div class="pvw-brow"><button type="button" class="btn primary" data-act="mksite" ${site && site.canDraft === false ? 'disabled' : ''}>Make the website</button><button type="button" class="btn" data-act="builder">Pick a look in Files › Website</button>${info.hasIndex ? `<button type="button" class="btn" data-act="toapp">${ico(I.app)} Back to the app</button>` : ''}</div></div>`;
      layout(); return;
    }
    if (!frame || !frame.isConnected) {
      holder.innerHTML = '';
      frame = document.createElement('iframe');
      frame.className = 'pvw-iframe'; frame.id = 'pvw-iframe';
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.title = 'Website preview';
      holder.appendChild(frame);
      if (!editing) { editing = true; paintEditBtn(); }   // the website starts in select mode: click anything, then say what to change
      load(siteSrc());
    }
    layout();
    if (!ro && window.ResizeObserver) { ro = new ResizeObserver(() => layout()); ro.observe(pane.querySelector('#pvw-stage')); }
  }
  function paintEditBtn() {
    const b = pane && pane.querySelector('.pvw-edit'), bar = pane && pane.querySelector('#pvw-edbar');
    if (b) { b.classList.toggle('on', editing); b.setAttribute('aria-pressed', String(editing)); }
    if (bar) { bar.classList.toggle('hidden', !editing || src === 'site'); paintPick(); }
  }
  // the website changed (a Flint edit, someone in the builder, an undo, a restore): reload in place, keep the scroll
  let siteT = null;
  function siteChanged() {
    clearTimeout(siteT);
    siteT = setTimeout(async () => {
      const had = site && site.has; await loadSite();
      if (!pane || src !== 'site') return;
      if (!site.has || !had || !frame) { frame = null; render(); return; }
      softReload();
    }, 120);
  }
  // A change that lands while the page is still loading waits for that load to finish (restarting the load on
  // every save kept a busy page from ever showing up); the page's own live reload (SSE) covers the rest.
  let loadingSince = 0, pendingReload = false;
  function load(u) {
    if (!frame || !u) return; helperAlive = false; loadingSince = Date.now(); frame.src = u;
    frame.onload = () => { loadingSince = 0; if (pendingReload) { pendingReload = false; setTimeout(() => reload(), 50); } };
  }
  function softReload() { if (loadingSince && Date.now() - loadingSince < 8000) { pendingReload = true; return; } reload(); }
  // Device frames: the iframe keeps the device's real width (so the app sees 390 / 768 / 1280 px) and is
  // scaled down with a transform to fit the pane. On phones it just fills the sheet.
  function layout() {
    if (!pane) return;
    const stage = pane.querySelector('#pvw-stage'), holder = pane.querySelector('#pvw-frame');
    if (!frame || pane.dataset.device === 'fill' || pane.classList.contains('is-empty')) {
      zoomUi(false);
      holder.style.width = holder.style.height = ''; if (frame) { frame.style.width = frame.style.height = frame.style.transform = ''; } return;
    }
    const dk = DEVICES[pane.dataset.device] ? pane.dataset.device : device, d = DEVICES[dk], pad = dk === 'desktop' ? 2 : 14, cs = getComputedStyle(stage), px = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0), py = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0), sw = stage.clientWidth - px - 2, sh = stage.clientHeight - py - 2;   // the stage's real padding, so the frame fits and centres
    if (sw <= 0 || sh <= 0) return;
    const s = Math.min(1, (sw - pad * 2) / d.w, dk === 'desktop' ? Infinity : (sh - pad * 2) / d.h);
    const h = dk === 'desktop' ? Math.max(Math.floor((sh - pad * 2) / s), 200) : d.h;   // desktop fills the canvas height: no dead band above and below
    frame.style.width = d.w + 'px'; frame.style.height = h + 'px'; frame.style.transform = `scale(${s})`;
    holder.style.width = Math.round(d.w * s + pad * 2) + 'px'; holder.style.height = Math.round(h * s + pad * 2) + 'px';
    fitScale = s; zoomUi(isPhone());
  }
  function setDevice(d) {
    if (!DEVICES[d]) return;
    if (isPhone()) { pdev = d === 'desktop' ? 'desktop' : 'phone'; lsSet('tribecode.preview.pdevice', pdev); }   // phones: the real phone view, or the desktop page shrunk to fit (pinch to zoom)
    else { device = d; lsSet('tribecode.preview.device', d); }
    resetZoom(); render();
  }

  async function reload(manual) {
    if (!pane) return;
    if (src === 'site') { if (manual) await loadSite(); if (!site || !site.has) return render(); if (!frame) return render(); return load(siteSrc()); }
    try { await token(); } catch (e) { return toast(e.message); }
    if (!info.hasIndex || !info.hasRepo) return render();
    const base = url(), sub = lastHref && info && lastHref.startsWith(info.path) ? lastHref.slice(info.path.length) : '';
    if (!frame) return render();
    load(base + (manual ? sub : sub));
  }
  async function refresh() { if (!pane) return; try { await token(true); } catch {} if (src === 'site') await loadSite(); render(); reload(); }

  function openTab() {
    const w = window.open('about:blank', '_blank');
    if (w) try { w.opener = null; } catch {}
    token().then(() => {
      if (src === 'site') { const u = url(); if (!u) { if (w) w.close(); return toast('Make the website first.'); } if (w) w.location.href = u.replace('&edit=1', ''); else window.open(u.replace('&edit=1', ''), '_blank', 'noopener'); return; }
      if (!info.hasIndex) toast('There is no index.html yet: the tab shows an empty page until there is one.');
      if (w) w.location.href = url(); else window.open(url(), '_blank', 'noopener');
    }).catch(e => { if (w) w.close(); toast(e.message); });
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} t.remove(); return ok;
  }
  async function copyShare() {
    try { await token(); } catch (e) { return toast(e.message); }
    const link = src === 'site' ? (url() || '').replace('&edit=1', '') : info.share || url();
    if (!link) return toast('Make the website first.');
    pane && (pane.dataset.share = link);
    const ok = await copy(link);
    const what = src === 'site' ? 'Draft link copied: friends in the tribe can open it for the next 2 hours. Publish to give everyone the real page.' : info.shareKind === 'public' ? 'Public link copied: it opens on any phone for the next 2 hours.'
      : info.shareKind === 'wifi' ? 'Wi-Fi link copied: it works on this network. Turn on the public link in Settings to share it anywhere.'
      : 'Link copied: it works on this computer.';
    toast(ok ? what : link);
  }

  // Screenshot: the page draws itself (the injected helper) and posts the PNG back; it goes to Visuals,
  // which also feeds the pinned repo hero's picture.
  function screenshot() {
    if (!frame || !frame.contentWindow) return toast('Nothing to capture yet.');
    const id = Math.random().toString(36).slice(2);
    const done = new Promise((resolve, reject) => { shots.set(id, { resolve, reject }); setTimeout(() => { if (shots.has(id)) { shots.delete(id); reject(new Error('the page did not answer: ask your AI to post one with add_visual')); } }, 9000); });
    frame.contentWindow.postMessage({ tc: 'shot', id }, '*');
    const btn = pane.querySelector('[data-act="shot"]'); btn.disabled = true;
    done.then(async data => {
      if (!/^data:image\/png;base64,/.test(data)) throw new Error('not a PNG');
      const label = isPhone() ? 'phone' : device;
      const r = await C.api('/visuals', { method: 'POST', body: { screen: 'App preview', png_base64: data, note: `From the preview (${label})` } });
      toast(`Screenshot saved to Visuals${r.visual && r.visual.diffPrev != null ? ` · ${r.visual.diffPrev}% changed` : ''}`);
      if (window.TribeRepoHero) window.TribeRepoHero.refresh();
    }).catch(e => toast(`Couldn't capture: ${e.message}`)).finally(() => { if (btn.isConnected) btn.disabled = false; });
  }
  // ---------- v0.25: edit the page in the preview ----------
  let editing = false, picked = null;
  const boxOf = r => (r && [r.left, r.top, r.width, r.height].every(n => typeof n === 'number' && isFinite(n)) ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
  const flyTarget = p => (p && p.rect && frame ? { frame, rect: p.rect } : (pane && pane.querySelector('#pvw-frame')));   // where Flint works: the picked element inside the preview
  const asPick = m => ({ path: typeof m.path === 'string' ? m.path.slice(0, 400) : '', tag: String(m.tag || '').slice(0, 20), text: String(m.text || '').slice(0, 600), html: String(m.html || '').slice(0, 2000), rect: boxOf(m.rect),
    cs: m.cs && typeof m.cs === 'object' ? Object.fromEntries(Object.entries(m.cs).filter(([k, v]) => typeof v === 'string').map(([k, v]) => [String(k).slice(0, 30), v.slice(0, 120)]).slice(0, 14)) : null });
  // look the picked element up again on the (re)loaded page: by its path, else by tag + words
  function repick(p) {
    if (!p || !frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ tc: 'repick', path: p.path || '', tag: p.tag || '', text: p.text || '' }, '*');
  }
  function toggleEdit() {
    editing = !editing; picked = null;
    if (!editing && window.TribePreviewFlint) window.TribePreviewFlint.pick(null);
    paintEditBtn();
    if (frame && frame.contentWindow) frame.contentWindow.postMessage({ tc: 'edit', on: editing }, '*');
    if (editing && !helperAlive && src !== 'site') toast('Editing works on the project\'s own pages (static preview).');
  }
  function paintPick() {
    const bar = pane && pane.querySelector('#pvw-edbar'); if (!bar) return;
    const ask = bar.querySelector('#pvw-edask'), go = bar.querySelector('#pvw-edgo'), pk = bar.querySelector('#pvw-edpick');
    ask.disabled = go.disabled = !picked; ask.placeholder = picked ? 'e.g. make this bigger, change it to “Open daily”, make the button orange' : 'Click something on the page first';
    pk.classList.toggle('hidden', !picked); pk.textContent = picked ? `<${picked.tag}> ${picked.text ? '“' + picked.text.slice(0, 40) + (picked.text.length > 40 ? '…' : '') + '”' : ''}` : '';
  }
  async function editApi(path, body) {
    try { const r = await C.api('/preview/' + path, { method: 'POST', body }); toast(r.say ? `✏️ ${r.say}` : '✏️ Saved to ' + r.file); return r; }
    catch (e) { toast(e.message); reload(true); return null; }
  }
  document.addEventListener('submit', async e => {
    if (!e.target || e.target.id !== 'pvw-edbar') return; e.preventDefault();
    const ask = e.target.querySelector('#pvw-edask'), go = e.target.querySelector('#pvw-edgo');
    if (!picked || !ask.value.trim()) return;
    go.disabled = true; go.textContent = 'Flint is on it…';
    const FF = window.TribeFlintFly, tgt = flyTarget(picked); if (FF) FF.work(tgt, 'Editing');
    const r = await editApi('flint', { href: lastHref, pick: picked, ask: ask.value.trim() });
    if (FF) { if (r) FF.done(tgt, 'Done ✓'); else FF.home(); }
    go.textContent = 'Ask Flint'; go.disabled = false; if (r) { ask.value = ''; }
  });
  window.addEventListener('message', e => {
    if (!frame || e.source !== frame.contentWindow || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.tc === 'ready' && editing && frame && frame.contentWindow) { frame.contentWindow.postMessage({ tc: 'edit', on: true }, '*'); picked = null; paintPick(); }
    if (m.tc === 'pick' && m.re) {   // the answer to repick(): the same element after a reload, with its live styles; gone → clear the card
      const was = window.TribePreviewFlint && window.TribePreviewFlint.picked && window.TribePreviewFlint.picked();
      if (!was) return;
      const np = m.none ? null : asPick(m);
      if (editing) { picked = np; paintPick(); }
      window.TribePreviewFlint.pick(np);
      if (!np) window.TribePreviewFlint.feed && window.TribePreviewFlint.feed({ k: 'flint', text: 'The element you picked isn’t on the page any more, so I let it go. Pick it again with Edit.' });
      return;
    }
    if (m.tc === 'pick' && editing) { picked = m.none ? null : { path: typeof m.path === 'string' ? m.path.slice(0, 400) : '', tag: String(m.tag || '').slice(0, 20), text: String(m.text || '').slice(0, 600), html: String(m.html || '').slice(0, 2000), rect: boxOf(m.rect), cs: m.cs && typeof m.cs === 'object' ? Object.fromEntries(Object.entries(m.cs).filter(([k, v]) => typeof v === 'string').map(([k, v]) => [String(k).slice(0, 30), v.slice(0, 120)]).slice(0, 14)) : null }; paintPick(); }
    if (m.tc === 'pick' && editing && window.TribePreviewFlint) window.TribePreviewFlint.pick(picked);
    if (m.tc === 'error' && window.TribePreviewFlint) window.TribePreviewFlint.error({ msg: `${String(m.msg || 'error').slice(0, 240)}${m.src ? ` (${String(m.src).slice(0, 60)}${m.line ? ':' + Number(m.line) : ''})` : ''}`, line: Number(m.line) || 0 });   // no auto-focus: it would pull focus out of text you're editing in the page
    if (m.tc === 'text' && editing && src === 'site') { if (window.TribePreviewFlint && window.TribePreviewFlint.siteOps) window.TribePreviewFlint.siteOps([{ op: 'text', before: String(m.before || ''), after: String(m.after || '') }], `“${String(m.after || '').slice(0, 60)}”`); return; }
    if (m.tc === 'text' && editing) editApi('edit', { href: m.href || lastHref, tag: String(m.tag || ''), before: String(m.before || ''), after: String(m.after || '') });
    if (m.tc === 'scroll' && typeof m.fy === 'number') lastFy = m.fy;
    if (m.tc === 'ready' && src === 'site' && lastFy > 0.01 && frame && frame.contentWindow) frame.contentWindow.postMessage({ tc: 'scrollto', fy: lastFy, instant: true }, '*');
    if (m.tc === 'ready') { helperAlive = true; if (typeof m.href === 'string' && !(want && Date.now() < want.until && !m.href.includes(want.sub))) lastHref = m.href.slice(0, 500); if (pane) { pane.classList.add('ready'); paintBar(); } const fp = window.TribePreviewFlint && window.TribePreviewFlint.picked && window.TribePreviewFlint.picked(); if (fp) repick(fp); }
    if (m.tc === 'shot' && shots.has(m.id)) { const p = shots.get(m.id); shots.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(String(m.data || '')); }
  });

  // ---------- host settings: web root, dev server ----------
  function toggleSettings() {
    const f = pane && pane.querySelector('#pvw-set'); if (!f) return;
    if (!f.classList.contains('hidden')) { f.classList.add('hidden'); return; }
    const opts = ['auto', ...(info.candidates || []).filter(c => c !== '.'), '.'];
    const pinned = info.pinned === '' ? '.' : info.pinned || 'auto';
    if (!opts.includes(pinned)) opts.push(pinned);
    f.innerHTML = `<span class="eyebrow">How it runs</span>
      <label><span>Web root</span><select name="root">${opts.map(o => `<option value="${esc(o)}" ${o === pinned ? 'selected' : ''}>${o === 'auto' ? `Auto${info.root ? ' (' + esc(info.root === '.' ? 'top folder of the code' : info.root) + ')' : ''}` : o === '.' ? 'Top folder' : esc(o) + '/'}</option>`).join('')}<option value="__custom">Another folder…</option></select></label>
      <label class="pvw-custom hidden"><span>Folder</span><input name="custom" placeholder="site/" maxlength="120" autocomplete="off"></label>
      <label><span>Dev server</span><input name="port" inputmode="numeric" placeholder="port, e.g. 5173" value="${info.port || ''}" maxlength="5" autocomplete="off"></label>
      <p class="pvw-hint">Leave the port empty to serve files straight from the code repository. With a port, the preview shows the project's own dev server (<code>npm run dev</code>) running on the host.</p>
      <div class="pvw-set-acts"><button type="button" class="btn" data-set="cancel">Cancel</button><button class="btn primary">Save</button></div>`;
    f.classList.remove('hidden');
    const sel = f.querySelector('[name=root]');
    sel.onchange = () => f.querySelector('.pvw-custom').classList.toggle('hidden', sel.value !== '__custom');
    f.querySelector('[data-set=cancel]').onclick = () => f.classList.add('hidden');
    f.onsubmit = async e => {
      e.preventDefault();
      const root = sel.value === '__custom' ? f.querySelector('[name=custom]').value.trim() : sel.value;
      const port = f.querySelector('[name=port]').value.trim();
      try {
        const r = await C.api('/preview/settings', { method: 'PUT', body: { root, port: port ? Number(port) : null } });
        Object.assign(info, r.preview); f.classList.add('hidden'); frame = null; render();
        toast(r.preview.mode === 'dev' ? `Preview now shows localhost:${r.preview.port}` : 'Preview settings saved');
      } catch (err) { toast(err.message); }
    };
  }

  // Empty state: one tap asks the agents (the #agents channel; the project chat when no agent is here).
  // "Build it": the vision (when there is none), the starter (host, so there is something to run now), then the agents.
  async function buildFrom(text) {
    const st = pane && pane.querySelector('#pvw-bstat'), go = pane && pane.querySelector('#pvw-bgo');
    const say = m => { if (st) st.textContent = m; };
    if (!text) { say('Say what it should be first.'); return; }
    if (go) go.disabled = true;
    const pid = (info && info.project) || C.project(), name = ((C.state().projects || []).find(p => p.id === pid) || {}).name || 'Our project';
    try {
      say('Writing it down as the project vision…');
      try { const v = await C.api('/vision'); if (!String(v.text || '').trim()) await C.api('/vision', { method: 'PUT', body: { text: `# ${name}\n\n${text}\n` } }); } catch {}
      say('Making a first version you can run…');
      let made = false; try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/setup/starter`, { method: 'POST', body: {} }); made = !!(r.written && r.written.length); } catch {}
      const ask = `please build this in the project's code so it runs in TribeCode's preview (index.html at the top folder, relative paths): ${text}${made ? ' A starter is already in the repo; build on it.' : ''}`;
      try { await C.api('/agents/channel', { method: 'POST', body: { text: '@agents ' + ask } }); } catch { try { await C.api('/chat/general', { method: 'POST', body: { text: 'Claude, ' + ask } }); } catch {} }
      say(made ? 'A first version is running. Your agents were asked to build the rest; it refreshes here as they work.' : 'Asked your agents to build it. It appears here the moment there is a page.');
      if (made) toast('A first version is running. Your agents were asked to build the rest; it refreshes here as they work.');   // the start screen gives way to the app, so say it where it stays
      if (made) setTimeout(() => open(), 600);
    } finally { if (go) go.disabled = false; }
  }
  async function askClaude() {
    const text = 'please start the app: create an index.html at the top folder of the code (a no-build static page is fine, relative paths for scripts and images) so the tribe can watch it live in TribeCode\'s preview.';
    try { await C.api('/agents/channel', { method: 'POST', body: { text: '@agents ' + text } }); toast('Asked the agents in #agents'); }
    catch { try { await C.api('/chat/general', { method: 'POST', body: { text: 'Claude, ' + text } }); toast('Asked in the project chat'); } catch (e) { toast(e.message); } }
    const b = pane && pane.querySelector('[data-act="ask"]');
    if (b) { const p = document.createElement('p'); p.className = 'pvw-asked'; p.textContent = 'Asked. It shows up here as soon as it exists.'; b.replaceWith(p); }
  }

  // ---------- live updates ----------
  C.on('ws', m => {
    if (m && m.type === 'website' && pane && pane.isConnected && m.project === C.project()) { if (src === 'site') siteChanged(); }
    if (!m || !info || m.project && m.project !== info.project) return;
    if (m.type === 'preview') {
      if (!pane) return;
      if (pane.classList.contains('is-empty') || !(m.files || []).length) {
        const was = `${info.mode}|${info.port}|${info.root}`;
        return status().then(() => {
          if (`${info.mode}|${info.port}|${info.root}` !== was && info.hasIndex && info.hasRepo) { frame = null; render(); return; }   // dev server / web root changed
          if (info.hasIndex && info.hasRepo && !frame) render(); else if (!info.hasIndex) render();
          else if (frame && !helperAlive) softReload();
        }).catch(() => {});
      }
      if (!helperAlive) softReload();   // the page reloads itself through SSE when the helper runs
      if ((m.files || []).some(f => /(^|\/)index\.html?$/i.test(f))) status().then(() => { if (!info.hasIndex) render(); }).catch(() => {});   // index.html deleted or moved: back to the start screen
      if (window.TribePreviewFlint && (m.files || []).length) window.TribePreviewFlint.reloaded(m.files);
    }
    if (m.type === 'repo' && m.status && pane) {   // a commit landed (pull, merge): show it
      const sha = ((m.status.commits || [])[0] || {}).sha;
      if (sha && pane.dataset.head && pane.dataset.head !== sha && !helperAlive) softReload();
      if (sha) pane.dataset.head = sha;
    }
  });
  C.on('project', () => { info = null; site = null; if (pane && pane.isConnected) { frame = null; open(); } });
  addEventListener('resize', () => { if (pane) { const want = isPhone() ? (pdev === 'desktop' ? 'desktop' : 'fill') : device; if (pane.dataset.device !== want) render(); else layout(); } });

  // ---------- the Saved shelf (app/ui/siteshelf.js) ----------
  function toggleShelf(on) {
    const S = window.TribeSiteShelf; if (!S || !pane) return;
    const open = on === undefined ? !S.isOpen() : on; 
    if (open) S.open(pane, { project: () => C.project(), onClose: () => { const b = pane && pane.querySelector('.pvw-saved'); if (b) b.setAttribute('aria-pressed', 'false'); paintPh(); } }); else S.close();
    const b = pane.querySelector('.pvw-saved'); if (b) b.setAttribute('aria-pressed', String(open));
  }

  // ---------- phones: Page / Edit / Saved, swipe between them, pinch-zoom the page ----------
  function paintPh(which) {
    const nav = pane && pane.querySelector('#pvw-ph'); if (!nav) return;
    const S = window.TribeSiteShelf, F = window.TribePreviewFlint;
    const cur = which || (S && S.isOpen() ? 'saved' : F && F.isOpen && F.isOpen() ? 'edit' : 'page');
    nav.querySelectorAll('[data-ph]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ph === cur)));
    nav.querySelector('[data-ph="saved"]').classList.toggle('hidden', src !== 'site');
  }
  function phoneTab(which) {
    const F = window.TribePreviewFlint;
    if (which === 'saved') { if (src !== 'site') return; if (F && F.close) F.close(); toggleShelf(true); }
    else { toggleShelf(false); if (F) (which === 'edit' ? F.open : F.close)(); }
    paintPh(which);
  }
  // a horizontal swipe on the tab bar, the page's right edge or the edit sheet moves between Page and Edit
  function phoneGestures() {
    const sw = (el, onLeft, onRight) => {
      if (!el) return; let x0 = null, y0 = 0;
      el.addEventListener('pointerdown', e => { if (!isPhone() || e.target.closest('input, textarea, select, .pvf-props, .pvf-chips')) return; x0 = e.clientX; y0 = e.clientY; }, { passive: true });
      el.addEventListener('pointerup', e => { if (x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return; (dx < 0 ? onLeft : onRight)(); });
      el.addEventListener('pointercancel', () => { x0 = null; });
    };
    const ph = pane.querySelector('#pvw-ph'), order = () => (src === 'site' ? ['page', 'edit', 'saved'] : ['page', 'edit']);
    const cur = () => { const b = ph.querySelector('[aria-pressed="true"]'); return b ? b.dataset.ph : 'page'; };
    const step = d => { const o = order(), i = Math.max(0, o.indexOf(cur())); const n = o[Math.min(o.length - 1, Math.max(0, i + d))]; if (n !== cur()) phoneTab(n); };
    sw(ph, () => step(1), () => step(-1));
    sw(pane.querySelector('#pvw-edge'), () => phoneTab('edit'), () => {});
    sw(pane.querySelector('#pvf'), () => step(1), () => step(-1));
    // pinch-zoom (two fingers) and pan (one finger once zoomed) over the page frame; double-tap fits it again
    const z = pane.querySelector('#pvw-zoom'), pts = new Map(); let d0 = 0, z0 = 1, p0 = null, tap = 0;
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    z.addEventListener('pointerdown', e => { try { z.setPointerCapture(e.pointerId); } catch {} pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { d0 = dist(); z0 = zoom; } else { p0 = { x: e.clientX, y: e.clientY, zx, zy }; if (Date.now() - tap < 300) resetZoom(); tap = Date.now(); } });
    z.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && d0) { zoom = Math.max(1, Math.min(5, z0 * dist() / d0)); applyZoom(); }
      else if (pts.size === 1 && p0 && zoom > 1) { zx = p0.zx + (e.clientX - p0.x); zy = p0.zy + (e.clientY - p0.y); applyZoom(); }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; if (!pts.size) p0 = null; };
    z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
  }
  let fitScale = 1;
  function applyZoom() {
    const h = pane && pane.querySelector('#pvw-frame'); if (!h) return;
    h.style.transform = zoom > 1.001 ? `translate(${Math.round(zx)}px, ${Math.round(zy)}px) scale(${zoom})` : '';
    h.style.transformOrigin = 'top center';
    const l = pane.querySelector('#pvw-zl'); if (l) { l.textContent = `${Math.round(zoom * fitScale * 100)}% · double-tap to fit`; l.classList.toggle('hidden', zoom <= 1.001); }
  }
  function resetZoom() { zoom = 1; zx = zy = 0; applyZoom(); }
  // the pinch layer only sits over the scaled-down desktop view on a phone (the phone view is the real, tappable page)
  function zoomUi(on) { const z = pane && pane.querySelector('#pvw-zoom'); if (z) z.classList.toggle('hidden', !on || pane.dataset.device !== 'desktop' || !frame); if (!on) resetZoom(); }

  // ---------- entry points ----------
  // "Preview game" / "Preview site" / …: follows what the project is (server/sense.js via widgets.js, app/ui/sense.js)
  const label = () => { const l = window.TribeSense && window.TribeSense.previewLabel ? window.TribeSense.previewLabel() : ''; return l && l !== 'Preview' ? l : 'Preview app'; };
  // Ctrl K
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: label(), keys: 'preview run see live app browser game site play view', run: open },
    { kind: 'Action', label: `${label()} in a new tab`, keys: 'preview open browser tab window live app', run: openTab },
  ]);
  // The pinned repo hero (desktop Docs, phone Docs hub): a "Preview app" button on its band.
  if (window.TribeRepoHero && window.TribeRepoHero.onRender) window.TribeRepoHero.onRender((el, o) => {
    if (o && o.empty) return;
    const band = el.querySelector('.rhx-band'); if (!band || band.querySelector('.rhx-pv')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'rhx-pv'; b.innerHTML = `${ico(I.play)}<span>${esc(label())}</span>`;
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });
    b.addEventListener('keydown', e => e.stopPropagation());
    band.appendChild(b);
  });

  // show a page inside the app's code (a free Flint build lands in builds/<name>/): show('builds/sunrise-bakery/')
  let want = null;   // the page show() asked for: an older page saying "ready" for a moment doesn't pull the preview back
  async function show(rel) {
    if (!pane || !pane.isConnected) await open();
    if (src !== 'app') { src = 'app'; lsSet(srcKey(), 'app'); frame = null; if (window.TribePreviewFlint && window.TribePreviewFlint.source) window.TribePreviewFlint.source('app'); }
    try { await token(!(info && info.hasIndex)); } catch {}
    if (!info || !info.path) return;
    const sub = String(rel || '').replace(/^\/+/, '');
    render(); if (!frame) return;
    want = sub ? { sub, until: Date.now() + 5000 } : null;
    lastHref = info.path + sub; load(url() + sub);
  }
  window.TribePreview = { open, openTab, refresh, close, url, show, repick: p => repick(p), info: () => info, source: () => src, setSource, site: () => site, shelf: on => toggleShelf(on), phoneTab };
})();
