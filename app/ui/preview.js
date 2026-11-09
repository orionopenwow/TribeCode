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
    home: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 8v6M9 11h6"/>',
  };
  const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

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
  const url = () => (info ? absUrl(info.path) : null);

  // ---------- the pane ----------
  function shell() {
    const el = document.createElement('div');
    el.className = 'pvw'; el.id = 'pvw';
    el.innerHTML = `<div class="pvw-bar">
        <div class="pvw-seg" role="tablist" aria-label="Device size">${Object.entries(DEVICES).map(([k, d]) => `<button role="tab" data-dev="${k}" title="${d.label}${k === 'desktop' ? '' : ' · ' + d.w + 'px'}" aria-label="${d.label}">${ico(I[k])}<span>${d.label}</span></button>`).join('')}</div>
        <span class="pvw-meta" id="pvw-meta"></span>
        <span class="pvw-sp"></span>
        <button class="pvw-btn" data-act="reload" title="Reload" aria-label="Reload">${ico(I.reload)}</button>
        <button class="pvw-btn" data-act="tab" title="Open in a new browser tab" aria-label="Open in a new browser tab">${ico(I.tab)}</button>
        <button class="pvw-btn" data-act="share" title="Copy a link friends can open on their phone" aria-label="Copy share link">${ico(I.link)}</button>
        <button class="pvw-btn pvw-edit" data-act="edit" title="Edit the page: double-click text to change it, or pick anything and ask Flint" aria-label="Edit the page" aria-pressed="false">✏️<span>Edit</span></button>
        <button class="pvw-btn" data-act="shot" title="Screenshot to Visuals" aria-label="Screenshot to Visuals">${ico(I.shot)}</button>
        <button class="pvw-btn" data-act="home" title="${isPhone() ? 'Add to Home Screen' : 'Desktop shortcut / Home Screen'}" aria-label="Add to Home Screen">${ico(I.home)}</button>
        <button class="pvw-btn hidden" data-act="gear" title="How the preview runs (host)" aria-label="Preview settings">${ico(I.gear)}</button>
      </div>
      <form class="pvw-set hidden" id="pvw-set"></form>
      <form class="pvw-edbar hidden" id="pvw-edbar" autocomplete="off"><span class="pvw-edhint" id="pvw-edhint"><b>Editing.</b> Double-click any text to change it. Or click something and tell Flint what to change.</span>
        <span class="pvw-edpick hidden" id="pvw-edpick"></span><input class="input pvw-edask" id="pvw-edask" placeholder="Click something on the page first" disabled maxlength="600" aria-label="What should Flint change?"><button class="btn sm primary" id="pvw-edgo" disabled>Ask Flint</button><button type="button" class="btn sm" data-act="edit">Done</button></form>
      <div class="pvw-stage" id="pvw-stage"><div class="pvw-frame" id="pvw-frame"></div></div>`;
    el.addEventListener('click', e => {
      const d = e.target.closest('[data-dev]'); if (d) return setDevice(d.dataset.dev);
      const a = e.target.closest('[data-act]'); if (!a) return;
      ({ edit: toggleEdit, reload: () => reload(true), tab: openTab, share: copyShare, shot: screenshot, gear: toggleSettings, ask: askClaude, repo: () => { close(); window.TribeApp && window.TribeApp.show('repo'); },
        home: () => window.TribeFolders && window.TribeFolders.home() })[a.dataset.act]?.();   // Home Screen / desktop shortcut (app/ui/folders.js)
    });
    return el;
  }
  function mount(el) {
    const S = window.TribeShell;
    const title = ((C.state().projects || []).find(p => p.id === C.project()) || {}).name || 'App';
    if (S && S.preview && $('#preview-body')) {
      S.preview({ kind: 'Preview', title, node: el });
      document.body.classList.add('pvw-on');
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
    if (!pane || !pane.isConnected) { pane = shell(); mount(pane); }
    pane.classList.add('loading');
    try { await token(); }
    catch (e) { pane.classList.remove('loading'); return renderError(e.message); }
    pane.classList.remove('loading');
    render();
  }
  function renderError(msg) {
    const f = pane && pane.querySelector('#pvw-frame'); if (!f) return;
    f.innerHTML = `<div class="pvw-empty"><span class="eyebrow">Preview</span><h3>Couldn't open the preview</h3><p>${esc(msg)}</p></div>`;
  }
  function render() {
    if (!pane || !info) return;
    const phone = isPhone();
    pane.dataset.device = phone ? 'fill' : device;
    pane.querySelectorAll('[data-dev]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.dev === device)));
    pane.querySelector('[data-act="gear"]').classList.toggle('hidden', !info.canConfigure);
    const meta = pane.querySelector('#pvw-meta');
    meta.textContent = info.mode === 'dev' ? `dev :${info.port}` : info.root ? (info.root === '.' ? 'top folder of the code' : info.root + '/') : '';
    meta.title = info.mode === 'dev' ? `Proxying the dev server on localhost:${info.port} on the host` : 'Serving index.html from the code repository';
    const empty = !info.hasRepo || !info.hasIndex;
    pane.classList.toggle('is-empty', empty);
    if (window.TribePhoneApp) window.TribePhoneApp.preview(pane, { empty });   // phone app mode: open it on a device (app/ui/phoneapp.js)
    pane.querySelectorAll('[data-act="tab"],[data-act="share"],[data-act="shot"],[data-act="reload"]').forEach(b => { b.disabled = empty; });
    const holder = pane.querySelector('#pvw-frame');
    if (empty) {
      frame = null; helperAlive = false;
      holder.innerHTML = !info.hasRepo
        ? `<div class="pvw-empty"><span class="eyebrow">Preview</span><h3>Nothing to show yet</h3><p>Your app appears here once the project has a code repository: the shared folder that holds its code. Make one, and the app shows up here, live.</p><button class="btn primary" data-act="repo">Set up the code repository</button></div>`
        : `<div class="pvw-empty"><span class="eyebrow">Preview</span><h3>No page to show yet</h3><p>When your app has a first page, you see it here, and it refreshes by itself as your tribe changes it. Ask your AI to make that first page.</p><button class="btn primary" data-act="ask">${ico(I.play)} Ask my AI to start one</button><details class="pvw-what"><summary>What does it look for?</summary><p>A file called <code>index.html</code> in the code repository (or in <code>public/</code>, <code>dist/</code>, <code>build/</code>, <code>app/</code> or <code>web/</code>).</p></details></div>`;
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
  function load(u) { if (!frame) return; helperAlive = false; frame.src = u; }
  // Device frames: the iframe keeps the device's real width (so the app sees 390 / 768 / 1280 px) and is
  // scaled down with a transform to fit the pane. On phones it just fills the sheet.
  function layout() {
    if (!pane) return;
    const stage = pane.querySelector('#pvw-stage'), holder = pane.querySelector('#pvw-frame');
    if (!frame || pane.dataset.device === 'fill' || pane.classList.contains('is-empty')) {
      holder.style.width = holder.style.height = ''; if (frame) { frame.style.width = frame.style.height = frame.style.transform = ''; } return;
    }
    const d = DEVICES[device], pad = device === 'desktop' ? 2 : 14, sw = stage.clientWidth - 24, sh = stage.clientHeight - 24;
    if (sw <= 0 || sh <= 0) return;
    const s = Math.min(1, (sw - pad * 2) / d.w, device === 'desktop' ? Infinity : (sh - pad * 2) / d.h);
    const h = device === 'desktop' ? Math.max(Math.min(d.h, (sh - pad * 2) / s), 200) : d.h;
    frame.style.width = d.w + 'px'; frame.style.height = h + 'px'; frame.style.transform = `scale(${s})`;
    holder.style.width = Math.round(d.w * s + pad * 2) + 'px'; holder.style.height = Math.round(h * s + pad * 2) + 'px';
  }
  function setDevice(d) { if (!DEVICES[d]) return; device = d; lsSet('tribecode.preview.device', d); render(); }

  async function reload(manual) {
    if (!pane) return;
    try { await token(); } catch (e) { return toast(e.message); }
    if (!info.hasIndex || !info.hasRepo) return render();
    const base = url(), sub = lastHref && info && lastHref.startsWith(info.path) ? lastHref.slice(info.path.length) : '';
    if (!frame) return render();
    load(base + (manual ? sub : sub));
  }
  async function refresh() { if (!pane) return; try { await token(true); } catch {} render(); reload(); }

  function openTab() {
    const w = window.open('about:blank', '_blank');
    if (w) try { w.opener = null; } catch {}
    token().then(() => {
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
    const link = info.share || url();
    pane && (pane.dataset.share = link);
    const ok = await copy(link);
    const what = info.shareKind === 'public' ? 'Public link copied: it opens on any phone for the next 2 hours.'
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
  function toggleEdit() {
    editing = !editing; picked = null;
    const b = pane && pane.querySelector('.pvw-edit'), bar = pane && pane.querySelector('#pvw-edbar');
    if (b) { b.classList.toggle('on', editing); b.setAttribute('aria-pressed', String(editing)); }
    if (bar) { bar.classList.toggle('hidden', !editing); paintPick(); }
    if (frame && frame.contentWindow) frame.contentWindow.postMessage({ tc: 'edit', on: editing }, '*');
    if (editing && !helperAlive) toast('Editing works on the project\'s own pages (static preview).');
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
    const r = await editApi('flint', { href: lastHref, pick: picked, ask: ask.value.trim() });
    go.textContent = 'Ask Flint'; go.disabled = false; if (r) { ask.value = ''; }
  });
  window.addEventListener('message', e => {
    if (!frame || e.source !== frame.contentWindow || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.tc === 'ready' && editing && frame && frame.contentWindow) { frame.contentWindow.postMessage({ tc: 'edit', on: true }, '*'); picked = null; paintPick(); }
    if (m.tc === 'pick' && editing) { picked = m.none ? null : { tag: String(m.tag || '').slice(0, 20), text: String(m.text || '').slice(0, 600), html: String(m.html || '').slice(0, 2000) }; paintPick(); }   // no auto-focus: it would pull focus out of text you're editing in the page
    if (m.tc === 'text' && editing) editApi('edit', { href: m.href || lastHref, tag: String(m.tag || ''), before: String(m.before || ''), after: String(m.after || '') });
    if (m.tc === 'ready') { helperAlive = true; if (typeof m.href === 'string') lastHref = m.href.slice(0, 500); if (pane) pane.classList.add('ready'); }
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
  async function askClaude() {
    const text = 'please start the app: create an index.html at the top folder of the code (a no-build static page is fine, relative paths for scripts and images) so the tribe can watch it live in TribeCode\'s preview.';
    try { await C.api('/agents/channel', { method: 'POST', body: { text: '@agents ' + text } }); toast('Asked the agents in #agents'); }
    catch { try { await C.api('/chat/general', { method: 'POST', body: { text: 'Claude, ' + text } }); toast('Asked in the project chat'); } catch (e) { toast(e.message); } }
    const b = pane && pane.querySelector('[data-act="ask"]');
    if (b) { const p = document.createElement('p'); p.className = 'pvw-asked'; p.textContent = 'Asked. It shows up here as soon as it exists.'; b.replaceWith(p); }
  }

  // ---------- live updates ----------
  C.on('ws', m => {
    if (!m || !info || m.project && m.project !== info.project) return;
    if (m.type === 'preview') {
      if (!pane) return;
      if (pane.classList.contains('is-empty') || !(m.files || []).length) return status().then(() => { if (info.hasIndex && info.hasRepo && !frame) render(); else if (!info.hasIndex) render(); }).catch(() => {});
      if (!helperAlive) reload();   // the page reloads itself through SSE when the helper runs
    }
    if (m.type === 'repo' && m.status && pane) {   // a commit landed (pull, merge): show it
      const sha = ((m.status.commits || [])[0] || {}).sha;
      if (sha && pane.dataset.head && pane.dataset.head !== sha && !helperAlive) reload();
      if (sha) pane.dataset.head = sha;
    }
  });
  C.on('project', () => { info = null; if (pane && pane.isConnected) { frame = null; open(); } });
  addEventListener('resize', () => { if (pane) { const want = isPhone() ? 'fill' : device; if (pane.dataset.device !== want) render(); else layout(); } });

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

  window.TribePreview = { open, openTab, refresh, close, url, info: () => info };
})();
