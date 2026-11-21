// TribeCode's own small browser (feat/p10-market): a marketplace item's source or docs, a GitHub page, a published
// preview or a help link, without leaving the app.
//   Desktop app: its own window (a separate Tauri webview labelled "browse"). That window is not in any capability, so a
//     page in it can never call TribeCode's IPC; it has the page's own address bar-free chrome plus our title.
//   Browser: a panel on the right (full screen on phones) with Back, Forward, Reload, the address, "Open in your
//     browser" and Close. The page sits in a sandboxed iframe: a page from another site can't reach TribeCode's data;
//     one from this same server loses its origin (no allow-same-origin), so it can't read the tribe's token either.
//     Sites that refuse to be shown inside apps (X-Frame-Options / frame-ancestors) open in your own browser instead:
//     known ones straight away, others after one quick check by the tribe (GET /api/market/frameable).
// Only http(s). Nothing is ever added to the address (no tokens). Esc closes.
// Public: window.TribeBrowser = { open(url, { title }), close(), state() }
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const C = () => window.TribeClient;
  // big sites that always refuse to be framed: no point asking
  const NO_FRAME = /(^|\.)(github\.com|gist\.github\.com|gitlab\.com|npmjs\.com|google\.com|youtube\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|linkedin\.com|figma\.com|notion\.so|stackoverflow\.com|reddit\.com|discord\.com|apple\.com|microsoft\.com|openai\.com|anthropic\.com|claude\.ai|vercel\.com|netlify\.com|pypi\.org)$/i;
  const st = { open: false, url: '', title: '', back: [], fwd: [] };
  let el = null;

  function clean(raw) {
    let u; try { u = new URL(String(raw || ''), location.href); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    return u;
  }
  function external(u) {
    const T = window.__TAURI__;
    if (T && T.shell && T.shell.open) { T.shell.open(u.href).catch(() => window.open(u.href, '_blank', 'noopener')); return; }
    window.open(u.href, '_blank', 'noopener');
  }

  // ---------- desktop app: a separate window with no access to the app ----------
  async function desktop(u, title) {
    const W = window.__TAURI__ && window.__TAURI__.webviewWindow; if (!W || !W.WebviewWindow) return false;
    try {
      const old = await W.WebviewWindow.getByLabel('browse'); if (old) { try { await old.close(); } catch {} }
      const win = new W.WebviewWindow('browse', { url: u.href, title: `${title || u.hostname} · TribeCode`, width: 1100, height: 780, center: true, focus: true });
      await new Promise((ok, bad) => { win.once('tauri://created', ok); win.once('tauri://error', e => bad(e)); setTimeout(ok, 1500); });
      st.url = u.href; st.title = title; return true;
    } catch { return false; }
  }

  // ---------- browser: the panel ----------
  function build() {
    if (el) return el;
    el = document.createElement('section'); el.id = 'tb-browser'; el.className = 'tbw'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', tr('TribeCode browser')); el.hidden = true;
    el.innerHTML = `<header class="tbw-bar">
        <button type="button" class="tbw-b" data-tbw="back" aria-label="${esc(tr('Back'))}" title="${esc(tr('Back'))}"><svg class="i" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <button type="button" class="tbw-b" data-tbw="fwd" aria-label="${esc(tr('Forward'))}" title="${esc(tr('Forward'))}"><svg class="i" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
        <button type="button" class="tbw-b" data-tbw="reload" aria-label="${esc(tr('Reload'))}" title="${esc(tr('Reload'))}"><svg class="i" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button>
        <div class="tbw-addr"><b class="tbw-title"></b><span class="tbw-url"></span></div>
        <button type="button" class="btn sm" data-tbw="ext">${esc(tr('Open in your browser'))}</button>
        <button type="button" class="tbw-b" data-tbw="close" aria-label="${esc(tr('Close'))}" title="${esc(tr('Close'))} (Esc)"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </header>
      <div class="tbw-body"><iframe class="tbw-frame" title="" referrerpolicy="no-referrer" allow="clipboard-write"></iframe>
        <p class="tbw-hint">${esc(tr('Page blank?'))} <button type="button" class="linkish" data-tbw="ext">${esc(tr('Open it in your browser'))}</button></p></div>`;
    document.body.appendChild(el);
    el.querySelectorAll('[data-tbw]').forEach(b => b.onclick = () => act(b.dataset.tbw));
    return el;
  }
  function act(k) {
    if (k === 'close') return close();
    if (k === 'ext') { const u = clean(st.url); if (u) external(u); return; }
    if (k === 'reload') return show(st.url, st.title, true);
    if (k === 'back' && st.back.length) { st.fwd.push(st.url); const u = st.back.pop(); return show(u, st.title, true); }
    if (k === 'fwd' && st.fwd.length) { st.back.push(st.url); const u = st.fwd.pop(); return show(u, st.title, true); }
  }
  function show(href, title, nav) {
    const u = clean(href); if (!u) return;
    build(); const f = el.querySelector('.tbw-frame');
    const same = u.origin === location.origin;
    // another site: scripts and its own origin (it can't reach ours); this server: scripts but no origin (it can't read our storage)
    f.setAttribute('sandbox', same ? 'allow-scripts allow-forms allow-popups' : 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
    f.src = 'about:blank'; requestAnimationFrame(() => { f.src = u.href; });
    f.title = title || u.hostname;
    st.url = u.href; st.title = title || '';
    el.querySelector('.tbw-title').textContent = title || u.hostname;
    el.querySelector('.tbw-url').textContent = u.host + (u.pathname === '/' ? '' : u.pathname);
    el.querySelector('[data-tbw="back"]').disabled = !st.back.length;
    el.querySelector('[data-tbw="fwd"]').disabled = !st.fwd.length;
    if (!st.open) { el.hidden = false; st.open = true; document.addEventListener('keydown', onKey, true); requestAnimationFrame(() => el.classList.add('in')); el.querySelector('[data-tbw="close"]').focus({ preventScroll: true }); }
  }
  function onKey(e) { if (e.key === 'Escape' && st.open) { e.stopPropagation(); e.preventDefault(); close(); } }
  async function canFrame(u) {
    if (u.origin === location.origin) return true;
    if (NO_FRAME.test(u.hostname)) return false;
    const c = C();
    if (c && c.connected && c.connected()) { try { const r = await c.api('/market/frameable?url=' + encodeURIComponent(u.href)); return !!(r && r.frame); } catch {} }
    return true;   // can't tell: try it, with "Open in your browser" right there
  }

  async function open(href, opts = {}) {
    const u = clean(href); if (!u) { toast(tr('That isn’t a web address TribeCode can open.')); return false; }
    const title = opts.title || '';
    if (window.__TAURI__ && window.__TAURI__.webviewWindow && await desktop(u, title)) return true;
    if (!(await canFrame(u))) { external(u); toast(`${tr('Opened in your browser')}: ${u.hostname}`); return 'external'; }
    if (st.open && st.url && st.url !== u.href) { st.back.push(st.url); st.fwd = []; }
    show(u.href, title);
    return true;
  }
  function close() {
    if (!el || !st.open) return;
    st.open = false; el.classList.remove('in'); document.removeEventListener('keydown', onKey, true);
    const f = el.querySelector('.tbw-frame'); setTimeout(() => { if (!st.open) { el.hidden = true; f.src = 'about:blank'; st.back = []; st.fwd = []; } }, 180);
  }
  window.TribeBrowser = { open, close, state: () => ({ open: st.open, url: st.url, title: st.title }) };
})();
