// A project's app on the Home Screen, a shortcut on the host's Desktop, and the project as a Desktop folder.
// Server: server/applink.js (/app/<key>/: a stable private link to the live app, with its own manifest and icon)
// and server/export.js (Export to a folder, Keep a copy on my Desktop, Desktop shortcut; host computer only).
// Entry points: the pinned repo hero (desktop Docs, phone Docs hub), the preview pane's home button, Ctrl K.
// Public: window.TribeFolders = { home(), folders(), shortcut(), exportTo(mode) }.
(function () {
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
  const ico = d => `<svg class="fld-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    home: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 8v6M9 11h6"/>',
    desk: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/><path d="M9.5 10h5M12 7.5v5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
    dots: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  };
  let fs = null, fsAt = 0, fsPid = null;   // GET /api/export for the current project

  async function folderStatus(force) {
    if (!C.connected()) return null;
    if (!force && fs && fsPid === C.project() && Date.now() - fsAt < 15000) return fs;
    fs = await C.api('/export').catch(() => null); fsAt = Date.now(); fsPid = C.project();
    return fs;
  }
  const project = () => ((C.state().projects || []).find(p => p.id === C.project()) || {});
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} t.remove(); return ok;
  }

  // ---------- one modal (a bottom sheet on phones, via mobile.css) ----------
  function modal(html, cls) {
    let m = $('#fld-modal');
    if (!m) {
      m = document.createElement('div'); m.className = 'modal hidden'; m.id = 'fld-modal'; m.setAttribute('role', 'dialog');
      m.innerHTML = '<div class="modal-card fld-card" id="fld-card"></div>';
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !m.classList.contains('hidden')) close(); });
      document.body.appendChild(m);
    }
    const card = m.querySelector('#fld-card');
    card.className = 'modal-card fld-card ' + (cls || '');
    card.innerHTML = html;
    m.classList.remove('hidden');
    return card;
  }
  function close() { const m = $('#fld-modal'); if (m) m.classList.add('hidden'); }

  // ---------- Home Screen / desktop shortcut ----------
  function steps() {
    if (ios) return ['Tap <b>Open the app</b>. It opens in Safari.', `Tap <b>Share</b> ${ico(I.share)}`, 'Tap <b>Add to Home Screen</b>, then <b>Add</b>.'];
    if (android) return ['Tap <b>Open the app</b>. It opens in Chrome.', `Tap the menu ${ico(I.dots)}`, 'Tap <b>Add to Home screen</b> (or <b>Install app</b>).'];
    return ['Open the app in your browser.', 'Click <b>Install</b> in the address bar, or bookmark it.', 'On a phone: scan the code, then Add to Home Screen.'];
  }
  async function home() {
    if (!C.connected()) return toast('Connect to your tribe first.');
    let link; try { link = await C.api('/applink', { method: 'POST' }); } catch (e) { return toast(e.message); }
    const st = await folderStatus();
    const base = (C.base() || location.origin).replace(/\/+$/, '');
    const here = base + link.path, phoneUrl = link.share || here;
    const desk = !isPhone() && st && st.local;
    const qr = !isPhone() && window.TribeQR && link.share ? `<div class="fld-qr"><div class="qr">${window.TribeQR.svg(link.share)}</div><small>Scan with a phone camera, then Add to Home Screen.</small></div>` : '';
    const card = modal(`<span class="eyebrow">${desk ? 'Shortcut' : 'Home Screen'}</span>
      <div class="fld-hero"><img class="fld-app" src="${esc(base + link.icon)}" alt="" width="56" height="56"><div><h2>${esc(link.name)}</h2><p class="lead">Opens straight into the live app, full screen. It updates as the tribe builds.</p></div></div>
      ${desk ? `<button class="btn primary fld-wide" id="fld-desk">${ico(I.desk)}<span>Create desktop shortcut</span></button>` : ''}
      ${!desk ? `<ol class="fld-steps">${steps().map(s => `<li><span>${s}</span></li>`).join('')}</ol>` : ''}
      ${qr}
      <div class="fld-acts">${!desk ? `<a class="btn primary" id="fld-open" href="${esc(here)}" target="_blank" rel="noopener">Open the app</a>` : `<a class="btn" id="fld-open" href="${esc(here)}" target="_blank" rel="noopener">Open the app</a>`}<button class="btn" id="fld-copy">Copy link</button></div>
      <p class="fld-fine">The link opens only this app's preview, never your account. <button class="linkish" id="fld-off">Turn it off</button></p>
      <div class="modal-foot"><button class="btn ghost" data-close>Done</button></div>`, 'fld-home');
    card.dataset.url = here;
    const d = card.querySelector('#fld-desk'); if (d) d.onclick = shortcut;
    card.querySelector('#fld-copy').onclick = async () => { const ok = await copy(phoneUrl); toast(ok ? (link.share && isPhone() ? 'Link copied' : 'Link copied: paste it in your phone\'s browser') : phoneUrl); };
    card.querySelector('#fld-off').onclick = async () => {
      if (!confirm('Turn off this app link? Home Screen icons made from it stop working. You can make a new one anytime.')) return;
      try { await C.api('/applink', { method: 'DELETE' }); toast('Link turned off'); close(); } catch (e) { toast(e.message); }
    };
  }
  async function shortcut() {
    try {
      const r = await C.api('/shortcut', { method: 'POST' });
      toast(`Shortcut on your Desktop: ${r.path.split(/[\\/]/).pop()}`);
      const b = $('#fld-desk'); if (b) { b.classList.remove('primary'); b.querySelector('span').textContent = 'Shortcut created'; b.dataset.path = r.path; }
      return r;
    } catch (e) { toast(e.message); }
  }

  // ---------- Desktop folder: export + keep a copy ----------
  const STATE = { ok: 'Up to date', 'local-changes': 'Waiting: you changed files there', diverged: 'Waiting: it has its own commits', missing: 'The folder is gone', error: 'Could not update', off: 'Off' };
  async function folders() {
    const st = await folderStatus(true);
    if (!st) return toast('Connect to your tribe first.');
    if (!st.local) return home();   // not on the host computer: nothing to write here, offer the app link
    const p = project(), mi = st.mirror || {};
    const card = modal(`<span class="eyebrow">Desktop folder</span><h2>${esc(p.name || 'Project')} on your Desktop</h2>
      <p class="lead">Files land in <code class="fld-path">${esc(st.folder || 'Desktop/TribeCode Projects')}</code></p>
      ${!st.hasRepo ? '<p class="fld-note">This project has no repo yet, so there is nothing to export.</p>' : `
      <div class="fld-sec"><b>Export a copy</b>
        <div class="fld-two"><button class="btn primary" data-exp="files">${ico(I.folder)}<span>Just the files</span></button><button class="btn" data-exp="history"><span>With history</span></button></div>
        <small>Just the files: everything you see, ready to zip or share. With history: a git clone that pushes to GitHub.</small></div>
      <button class="toggle fld-toggle" role="switch" id="fld-mirror" aria-checked="${!!mi.enabled}"><span class="fld-tt"><b>Keep a copy on my Desktop</b><small id="fld-mstate">${mi.enabled ? esc(STATE[mi.state] || 'On') + (mi.note ? ' · ' + esc(mi.note) : '') : 'A folder that follows the project: it updates after every push.'}</small></span><span class="switch"></span></button>
      ${mi.enabled && mi.path ? `<p class="fld-fine"><code class="fld-path">${esc(mi.path)}</code> <button class="linkish" id="fld-show">Show</button></p>` : ''}`}
      <div class="fld-sec"><b>GitHub</b><div id="fld-gh"></div></div>
      <div class="modal-foot"><button class="btn ghost" data-close>Done</button></div>`, 'fld-folders');
    card.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => exportTo(b.dataset.exp, b));
    const t = card.querySelector('#fld-mirror');
    if (t) t.onclick = async () => {
      const on = t.getAttribute('aria-checked') !== 'true'; t.disabled = true; card.querySelector('#fld-mstate').textContent = on ? 'Making the copy…' : 'Turning off…';
      try { const r = await C.api('/export/mirror', { method: 'PUT', body: { enabled: on } }); fs = null; toast(on ? `Copy kept in ${r.mirror.path.split(/[\\/]/).pop()} on your Desktop` : 'The Desktop copy stops updating (the folder stays)'); folders(); }
      catch (e) { toast(e.message); t.disabled = false; folders(); }
    };
    const sh = card.querySelector('#fld-show'); if (sh) sh.onclick = () => C.api('/export/reveal', { method: 'POST', body: { what: 'mirror' } }).catch(e => toast(e.message));
    if (window.TribeGitHub) window.TribeGitHub.mount(card.querySelector('#fld-gh'));
  }
  async function exportTo(mode, btn) {
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; }
    try {
      const r = await C.api('/export', { method: 'POST', body: { mode } });
      toast(`Exported ${r.files} file${r.files === 1 ? '' : 's'} to ${r.path.split(/[\\/]/).pop()} on your Desktop`);
      const card = $('#fld-card'); if (card) card.dataset.exported = r.path;
      return r;
    } catch (e) { toast(e.message); }
    finally { if (btn) btn.disabled = false; }
  }

  // ---------- entry points ----------
  // The pinned repo hero: "Home Screen" on phones; "Shortcut" + "Folder" on the host computer; "Home Screen" elsewhere.
  if (window.TribeRepoHero && window.TribeRepoHero.onRender) window.TribeRepoHero.onRender((el, o) => {
    if (o && o.empty) return;
    const band = el.querySelector('.rhx-band'); if (!band || band.querySelector('.fld-hero-acts')) return;
    const row = document.createElement('div'); row.className = 'fld-hero-acts';
    const btn = (cls, icon, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fld-hb ' + cls; b.innerHTML = `${ico(icon)}<span>${label}</span>`;
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(); }); b.addEventListener('keydown', e => e.stopPropagation()); row.appendChild(b); return b; };
    btn('fld-hb-home', isPhone() ? I.home : I.desk, isPhone() ? 'Home Screen' : 'Shortcut', home);
    const f = btn('fld-hb-folder hidden', I.folder, 'Folder', folders);
    band.appendChild(row);
    if (!isPhone()) folderStatus().then(st => { if (st && st.local && f.isConnected) f.classList.remove('hidden'); });
  });
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: 'Add app to Home Screen', keys: 'home screen shortcut install phone app icon pwa', run: home },
    { kind: 'Action', label: 'Create desktop shortcut', keys: 'desktop shortcut icon app link', run: home },
    { kind: 'Action', label: 'Export project to a folder', keys: 'export folder desktop download copy files clone', run: folders },
  ]);
  C.on('project', () => { fs = null; });

  window.TribeFolders = { home, folders, shortcut, exportTo, close };
})();
