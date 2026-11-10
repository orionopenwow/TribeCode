// Studios (v0.27): free, open-source creative apps people use beside TribeCode — ArtCraft, Blender, Krita, Pixelorama,
// Godot, LMMS, Audacity, Kdenlive, Penpot and more (templates/studios.json, server/studios.js). Each card has a
// TribeCode-drawn thumbnail (not the tool's logo), what it does, its license and platforms, and a Download ↗ link to the
// tool's own page (TribeCode never downloads anything). A detail pane (side panel on desktop, sheet on phones) explains
// what it's good for, how it helps THIS project (from the project's kind, server/sense.js) and how to bring the work
// back into Files › Assets. The tribe can pin the tools it uses ("We use"); AI helpers read that via tribe_api
// (GET /api/projects/:id/studios).
// Opens as a Workshop tab (#/studios, Ctrl K "Studios", the chat's + menu, the asset library, the Marketplace's Studio
// filter). Public: window.TribeStudios = { open(id?), mount(el), detail(id) }.
(function () {
  const C = window.TribeClient; if (!C) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : null;
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const pid = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C.project && C.project()) || '';
  const me = () => (C.state() || {}).me || {};
  const canPin = () => { const r = me().role; return !!r && r !== 'agent' && r !== 'spectator'; };
  const NOUN = { game: 'game', '3d': '3D project', app: 'app', site: 'website', tool: 'tool', bot: 'bot', api: 'API', notes: 'notes project', other: 'project' };
  const CATS = [['', 'All'], ['art', 'Art'], ['3d', '3D'], ['sound', 'Sound'], ['video', 'Video'], ['design', 'Design'], ['engine', 'Engines']];
  const CAT = { artcraft: 'art', krita: 'art', pixelorama: 'art', blender: '3d', 'material-maker': '3d', lmms: 'sound', audacity: 'sound', beepbox: 'sound', kdenlive: 'video', obs: 'video', shotcut: 'video', penpot: 'design',
    godot: 'engine', gdevelop: 'engine', love: 'engine', raylib: 'engine', bevy: 'engine', fyrox: 'engine', stride: 'engine', pyxel: 'engine', tic80: 'engine', twine: 'engine' };
  // the asset library has ready-made versions of some of these
  const ASSET_KIND = { pixelorama: 'pixel', blender: 'model', 'material-maker': 'texture', lmms: 'sound', audacity: 'sound', beepbox: 'sound' };

  let data = null, host = null, cat = '', sheet = null, lastFocus = null;

  // A TribeCode-drawn thumbnail: a flat tile in the tool's color, a glyph and the name. Not the project's logo.
  const thumb = (s, big) => `<span class="sto-thumb${big ? ' big' : ''}" style="--c:${esc(s.color)}" aria-hidden="true"><i>${esc(s.glyph)}</i><b>${esc(s.title)}</b></span>`;
  const dl = (s, cls = 'btn sm') => `<a class="${cls} sto-dl" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-dl="${esc(s.id)}" aria-label="Download ${esc(s.title)} (opens its official page)">Download ↗</a>`;
  const plats = s => `<span class="sto-plats">${(s.platforms || []).map(p => `<span class="sto-plat">${esc(p)}</span>`).join('')}</span>`;
  const byId = id => (data && data.studios || []).find(s => s.id === id);

  function card(s, opts = {}) {
    const pinned = data.pinned.includes(s.id);
    return `<article class="sto-card${opts.wide ? ' wide' : ''}" data-id="${esc(s.id)}" tabindex="0" role="button" aria-label="${esc(s.title)}: ${esc(s.what)}">
      ${thumb(s, opts.wide)}
      <div class="sto-body"><div class="sto-t"><b>${esc(s.title)}</b>${pinned ? '<span class="sto-pin" title="Your tribe uses this">We use</span>' : ''}</div>
        <p class="sto-what">${esc(s.what)}</p>
        <div class="sto-meta"><span class="sto-lic">${esc(s.license)}</span>${plats(s)}</div>
        <div class="sto-acts">${dl(s, opts.wide ? 'btn sm primary' : 'btn sm')}<button class="btn sm ghost" data-more="${esc(s.id)}">How it helps</button></div></div>
    </article>`;
  }

  // the project's open-source build stack (server/buildkit.js): what Flint and the AI helpers build with
  function kitSec(k) {
    if (!k || !k.libs || !k.libs.length) return '';
    return `<section class="sto-sec sto-kit" id="sto-kit" aria-label="Build kit"><div class="sto-kithead"><span class="sto-eyebrow">Build kit · ${esc(k.title)}</span>
      <h3 class="sto-h">What your helpers build with</h3><p class="faint">Open-source libraries, pinned and loaded by the project from a CDN. Flint and every AI helper follow this stack and its quality bar.</p></div>
      <div class="sto-chips">${k.libs.map(l => `<span class="sto-chip" title="${esc(l.role)}"><b>${esc(l.name)}</b><span class="faint">${esc(l.version === 'built-in' ? 'built-in' : l.version)} · ${esc(l.license)}</span><i>${esc(l.role)}</i></span>`).join('')}</div></section>`;
  }
  function draw() {
    if (!host || !data) return;
    const kind = data.kind || 'other', noun = NOUN[kind] || 'project';
    const feat = data.studios.find(s => s.featured);
    const rec = data.recommended.map(byId).filter(s => s && !s.featured);
    const pinned = data.pinned.map(byId).filter(Boolean);
    const list = data.studios.filter(s => !cat || CAT[s.id] === cat);
    host.innerHTML = `<div class="sto" id="studios">
      <div class="sto-hero"><div><span class="sto-eyebrow">Studios · free and open source</span><h2>Creative tools for this ${esc(noun)}</h2>
        <p>${esc(data.helps)} TribeCode links to each tool's own download page; nothing is installed for you.</p></div></div>
      ${kitSec(data.kit)}
      ${feat ? `<section class="sto-sec" aria-label="Featured"><h3 class="sto-h">Featured</h3>${card(feat, { wide: true })}</section>` : ''}
      ${rec.length ? `<section class="sto-sec" aria-label="Recommended for this project"><h3 class="sto-h">Recommended for this ${esc(noun)}</h3><div class="sto-row" id="sto-rec">${rec.map(s => card(s)).join('')}</div></section>` : ''}
      ${pinned.length ? `<section class="sto-sec" aria-label="We use"><h3 class="sto-h">We use</h3><div class="sto-row" id="sto-pinned">${pinned.map(s => card(s)).join('')}</div></section>` : ''}
      <section class="sto-sec" aria-label="All studios"><div class="sto-allhead"><h3 class="sto-h">All studios <span class="faint">${data.studios.length}</span></h3>
        <div class="sto-cats" role="tablist" aria-label="Filter studios">${CATS.map(([k, l]) => `<button role="tab" class="sto-cat${cat === k ? ' on' : ''}" aria-selected="${cat === k}" data-cat="${k}">${l}</button>`).join('')}</div></div>
        <div class="sto-grid" id="sto-grid">${list.map(s => card(s)).join('')}</div></section>
      <p class="sto-foot faint">Thumbnails are drawn by TribeCode. Names belong to their projects. Licenses as listed in each project's repository.</p>
    </div>`;
  }

  function wire(el) {
    el.addEventListener('click', e => {
      if (e.target.closest('.sto-dl')) return;   // the link opens the official page in a new tab
      const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; draw(); const f = host.querySelector(`[data-cat="${cat}"]`); if (f) f.focus(); return; }
      const m = e.target.closest('[data-more]') || e.target.closest('.sto-card'); if (m) detail(m.dataset.more || m.dataset.id);
    });
    el.addEventListener('keydown', e => {
      const c = e.target.closest('.sto-card'); if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); detail(c.dataset.id); }
      const t = e.target.closest('[data-cat]');
      if (t && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); const i = CATS.findIndex(x => x[0] === cat), n = CATS[(i + (e.key === 'ArrowRight' ? 1 : CATS.length - 1)) % CATS.length][0]; cat = n; draw(); host.querySelector(`[data-cat="${n}"]`).focus(); }
    });
  }

  async function load() {
    const p = pid();
    if (!p) { data = { kind: 'other', helps: 'Open a project to get tools picked for it.', recommended: [], studios: [], pinned: [] }; }
    try { if (p) data = await C.api(`/projects/${encodeURIComponent(p)}/studios`); } catch (e) { if (host) host.innerHTML = `<div class="sto-empty">Couldn't load the studios: ${esc(e.message)}</div>`; return; }
    draw();
  }

  function mount(el) { host = el; cat = ''; if (!el.__stoWired) { el.__stoWired = true; wire(el); } el.innerHTML = '<div class="sto-empty">Loading studios…</div>'; return load(); }

  // ---------- the detail pane ----------
  function closeDetail() { if (!sheet) return; sheet.remove(); sheet = null; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  async function detail(id) {
    if (!data) { try { data = await C.api(`/projects/${encodeURIComponent(pid())}/studios`); } catch { return; } }
    const s = byId(id); if (!s) return;
    closeDetail(); lastFocus = document.activeElement;
    const kind = data.kind || 'other', noun = NOUN[kind] || 'project', fits = (s.for || []).includes(kind) || (s.for || []).includes('any');
    const role = s.role || 'the art, sound or video';
    const tail = CAT[s.id] === 'engine' ? 'Keep it in the code repository so friends and AI helpers can work on it with you.' : 'Bring the files back into Files › Assets and your AI helpers can wire them in.';
    const helps = fits ? `In this ${noun}, use ${s.title} to make ${role}. ${tail}`
      : `It's not the usual pick for a ${noun}, but ${s.title} can still make ${CAT[s.id] === 'video' ? 'a trailer or demo video' : CAT[s.id] === 'sound' ? 'sound and music' : CAT[s.id] === 'engine' ? 'a quick prototype' : 'art for the website and posts'}. ${tail}`;
    const pinned = data.pinned.includes(s.id), ak = ASSET_KIND[s.id];
    sheet = document.createElement('div'); sheet.className = 'sto-detail-wrap'; sheet.id = 'sto-detail';
    sheet.innerHTML = `<div class="sto-scrim" data-close></div>
      <aside class="sto-detail${phone() ? ' sheet' : ''}" role="dialog" aria-modal="true" aria-labelledby="sto-d-title" data-id="${esc(s.id)}">
        <div class="sto-d-head">${thumb(s, true)}<div><h2 id="sto-d-title">${esc(s.title)}</h2><p class="sto-what">${esc(s.what)}</p>
          <div class="sto-meta"><span class="sto-lic">${esc(s.license)}</span>${plats(s)}</div></div>
          <button class="sto-x" data-close aria-label="Close">×</button></div>
        <section class="sto-d-sec"><h3>What it's good for</h3><p>${esc(s.good)}</p></section>
        <section class="sto-d-sec sto-d-helps"><h3>How it helps this ${esc(noun)}</h3><p data-helps>${esc(helps)}</p></section>
        <section class="sto-d-sec"><h3>Bring your work back</h3><p>${esc(s.back)}</p>
          <p class="faint">Put the files in Files › Assets (assets/ in the code repository) and add a line to assets/CREDITS.md saying who made them.</p>
          ${ak && window.TribeAssets ? `<button class="btn sm ghost" data-assets="${ak}">Or grab ready-made ones from the asset library</button>` : ''}</section>
        <div class="sto-d-acts">${dl(s, 'btn primary')}${canPin() && pid() ? `<button class="btn ghost" data-pin aria-pressed="${pinned}">${pinned ? '✓ We use this' : 'We use this'}</button>` : ''}</div>
        <p class="faint sto-d-note">Opens ${esc(new URL(s.url).hostname)} in a new tab. TribeCode never downloads or installs it for you.</p>
      </aside>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', async e => {
      if (e.target.closest('[data-close]')) return closeDetail();
      const a = e.target.closest('[data-assets]'); if (a) { closeDetail(); window.TribeAssets.open({ kind: a.dataset.assets }); return; }
      const pb = e.target.closest('[data-pin]'); if (pb) {
        const want = new Set(data.pinned); want.has(s.id) ? want.delete(s.id) : want.add(s.id);
        try { data = await C.api(`/projects/${encodeURIComponent(pid())}/studios`, { method: 'PUT', body: { pinned: [...want] } }); const on = data.pinned.includes(s.id); pb.textContent = on ? '✓ We use this' : 'We use this'; pb.setAttribute('aria-pressed', String(on)); toast(on ? `Pinned ${s.title} for the tribe` : `Unpinned ${s.title}`); draw(); }
        catch (err) { toast(err.message); }
      }
    });
    const first = sheet.querySelector('.sto-dl'); if (first) first.focus();
  }
  document.addEventListener('keydown', e => {
    if (!sheet) return;
    if (e.key === 'Escape') { e.stopPropagation(); closeDetail(); return; }
    if (e.key === 'Tab') {   // keep focus inside the pane
      const f = [...sheet.querySelectorAll('a[href], button')].filter(x => x.offsetParent !== null); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }, true);

  function open(id) {
    if (window.TribeWorkshop) window.TribeWorkshop.open('studios');
    if (id) setTimeout(() => detail(id), 250);
  }
  addEventListener('hashchange', () => { if (location.hash === '#/studios') open(); });
  if (location.hash === '#/studios') addEventListener('load', () => open(), { once: true });
  if (C.on) C.on('ws', m => { if (m && m.type === 'studios' && host && host.isConnected && m.project === pid()) load(); });

  // Ctrl K
  (window.TribePaletteActions = window.TribePaletteActions || []).push(() => [{ kind: 'Action', label: 'Studios: free creative tools', keys: 'studios art tools blender krita artcraft godot pixel music video design download', run: () => open() }]);

  window.TribeStudios = { open, mount, detail, close: closeDetail };
})();
