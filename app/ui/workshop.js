// The Workshop (#/workshop): a tribe-wide library apart from projects. Skills, recipes, templates,
// assets and scripts the tribe and its agents discovered, plus the community shelf (a public GitHub
// repo over jsDelivr). Server: server/workshop.js (/api/workshop/*). Agents: workshop_search,
// workshop_publish (a human approves), workshop_use (server/mcp-workshop.js).
//
// It is its own layer over the window (the rail stays visible on desktop), so it never mixes with a
// project's sections. Open it with location.hash = '#/workshop' or window.TribeWorkshop.open().
(function () {
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 16) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#${id}"/></svg>`;
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m);
  const size = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
  const token = () => { try { return (window.TribeStore.get().server || {}).token || ''; } catch { return ''; } };
  const me = () => C.state().me || {};
  const human = () => me().role && me().role !== 'agent' && me().role !== 'spectator';

  const KINDS = [['', 'All'], ['module', 'Modules'], ['skill', 'Skills'], ['recipe', 'Recipes'], ['template', 'Templates'], ['asset', 'Assets'], ['script', 'Scripts']];
  const KIND_LABEL = { module: 'Module', skill: 'Skill', recipe: 'Recipe', template: 'Template', asset: 'Asset', script: 'Script' };
  const LICENSES = [['CC0-1.0', 'CC0 1.0', 'Public domain. No credit needed.'], ['CC-BY-4.0', 'CC BY 4.0', 'Free to use. Credit the author.'], ['MIT', 'MIT', 'Free to use. Keep the license notice.'], ['Apache-2.0', 'Apache 2.0', 'Free to use. Keep the notice; patent grant.']];
  const licNote = id => (LICENSES.find(l => l[0] === id) || [])[2] || '';
  const IMG = /\.(png|jpe?g|webp|gif)$/i, TEXT = /\.(md|txt|json|js|ts|lua|gd|cs|py|glsl|frag|vert|wgsl)$/i, AUDIO = /\.(ogg|mp3|wav)$/i, MODEL = /\.(glb|gltf)$/i;
  const ALLOWED = /\.(glb|gltf|bin|png|jpe?g|webp|gif|svg|ogg|mp3|wav|json|md|txt|js|ts|lua|gd|cs|py|glsl|frag|vert|wgsl)$/i;

  let tab = 'shelf', kind = '', q = '', items = [], pending = [], comm = null, detail = null, open_ = false;
  try { tab = sessionStorage.getItem('tribecode.wsTab') || localStorage.getItem('tribecode.wsTab') || 'shelf'; } catch {}   // remembered across restarts

  // ---------- authenticated blobs (never put the token in a URL) ----------
  const blobs = new Map();
  async function blobUrl(url) {
    if (blobs.has(url)) return blobs.get(url);
    const p = fetch(C.base() + url, { headers: { Authorization: 'Bearer ' + token() } }).then(r => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then(b => URL.createObjectURL(b));
    blobs.set(url, p); p.catch(() => blobs.delete(url));
    return p;
  }
  async function textOf(url, max = 4000) { const r = await fetch(C.base() + url, { headers: { Authorization: 'Bearer ' + token() } }); if (!r.ok) throw new Error(r.status); return (await r.text()).slice(0, max); }
  const fileUrl = (it, rel) => `/api/workshop/${it._pending ? 'pending/' + it._pending : 'items/' + it.id}/files/${rel.split('/').map(encodeURIComponent).join('/')}`;

  // ---------- frame ----------
  function frame() {
    let root = document.getElementById('workshop'); if (root) return root;
    root = document.createElement('div'); root.id = 'workshop'; root.className = 'ws-layer hidden'; root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Workshop');
    root.innerHTML = `
      <header class="ws-top">
        <button class="ws-icon ws-back" id="ws-back" title="Back to projects" aria-label="Back to projects"><svg class="i" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="ws-brand"><span class="ws-eyebrow">Workshop</span><h1 id="ws-title">Tribe library</h1></div>
        <label class="ws-search">${ico('i-search', 15)}<input id="ws-q" type="search" placeholder="Search skills, assets, scripts…" autocomplete="off" aria-label="Search the Workshop"></label>
        <button class="btn primary ws-add" id="ws-add">${ico('i-plus', 15)}<span>Add</span></button>
      </header>
      <div class="ws-bar">
        <nav class="ws-tabs" role="tablist"><button role="tab" data-wt="market" aria-label="Marketplace"><span class="ws-tl">Marketplace</span><span class="ws-ts" aria-hidden="true">Market</span></button><button role="tab" data-wt="studios">Studios</button><button role="tab" data-wt="shelf" aria-label="Starter shelf"><span class="ws-tl">Starter shelf</span><span class="ws-ts" aria-hidden="true">Shelf</span></button><button role="tab" data-wt="library" aria-label="Tribe library"><span class="ws-tl">Tribe library</span><span class="ws-ts" aria-hidden="true">Library</span></button><button role="tab" data-wt="community">Community</button></nav>
        <div class="ws-chips" id="ws-chips">${KINDS.map(([k, l]) => `<button class="ws-chip" data-k="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="ws-scroll" id="ws-scroll"><div class="ws-inner" id="ws-body"></div></div>
      <div class="ws-drawer hidden" id="ws-drawer"><div class="ws-scrim" data-close></div><aside class="ws-detail" id="ws-detail" role="dialog" aria-label="Item"></aside></div>
      <div class="ws-modal hidden" id="ws-modal"><div class="ws-scrim" data-mclose></div><div class="ws-card" id="ws-mcard" role="dialog"></div></div>`;
    (document.querySelector('.shell .window') || document.body).appendChild(root);
    root.querySelector('#ws-back').onclick = close;
    root.querySelector('#ws-add').onclick = () => addDialog();
    let t; root.querySelector('#ws-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(); }, 180); });
    const top = () => { root.querySelector('#ws-scroll').scrollTop = 0; };
    root.querySelectorAll('[data-wt]').forEach(b => b.onclick = () => { tab = b.dataset.wt; try { sessionStorage.setItem('tribecode.wsTab', tab); localStorage.setItem('tribecode.wsTab', tab); } catch {} top(); load(); });
    root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; top(); load(); });
    root.querySelector('#ws-drawer').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDetail(); });
    root.querySelector('#ws-modal').addEventListener('click', e => { if (e.target.closest('[data-mclose]')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key !== 'Escape' || !open_) return; if (!root.querySelector('#ws-modal').classList.contains('hidden')) closeModal(); else if (detail) closeDetail(); });
    return root;
  }

  function open(which) {
    if (typeof which === 'string' && ['market', 'studios', 'shelf', 'library', 'community'].includes(which)) tab = which;   // v0.27 company: + market
    const root = frame(); open_ = true;
    root.classList.remove('hidden'); document.body.classList.add('ws-open'); document.body.classList.remove('drawer-open');
    if (location.hash !== '#/workshop') history.replaceState(null, '', location.pathname + location.search + '#/workshop');
    const crumb = document.getElementById('crumb-label'); if (crumb) crumb.textContent = 'Workshop';
    try { C.sendActivity('Workshop'); } catch {}
    load();
  }
  function close() {
    const root = document.getElementById('workshop'); if (!root) return;
    open_ = false; root.classList.add('hidden'); if (window.TribeMarket) window.TribeMarket.close(); document.body.classList.remove('ws-open'); closeDetail(); closeModal();
    if (location.hash === '#/workshop') history.replaceState(null, '', location.pathname + location.search);
    if (window.TribeApp && window.TribeApp.view) { const v = window.TribeApp.view(); const crumb = document.getElementById('crumb-label'); if (crumb && v) crumb.textContent = v[0].toUpperCase() + v.slice(1); }
  }
  // Leaving for a project (a circle, the logo, a section) closes the Workshop.
  document.addEventListener('click', e => { if (open_ && e.target.closest && e.target.closest('#pj-rail, #rail-logo, #pj-plus, [data-nav], [data-pnav]') && !e.target.closest('#workshop')) close(); }, true);
  addEventListener('hashchange', () => { if (location.hash === '#/workshop') open(); else if (open_) close(); });

  // ---------- data ----------
  async function load() {
    const root = frame();
    root.querySelectorAll('[data-wt]').forEach(b => { b.classList.toggle('on', b.dataset.wt === tab); b.setAttribute('aria-selected', String(b.dataset.wt === tab)); });
    root.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === kind));
    root.querySelector('#ws-title').textContent = tab === 'market' ? 'Marketplace' : tab === 'studios' ? 'Studios' : tab === 'library' ? 'Tribe library' : tab === 'shelf' ? 'Starter shelf' : 'Community shelf';
    root.querySelector('.ws-search').classList.toggle('hidden', tab === 'market' || tab === 'studios');   // v0.27 company: the Marketplace has its own search + filters
    root.querySelector('#ws-chips').classList.toggle('hidden', tab === 'shelf' || tab === 'market' || tab === 'studios');
    root.querySelector('#ws-add').classList.toggle('hidden', !(me().role && me().role !== 'spectator') || tab !== 'library');
    const body = root.querySelector('#ws-body');
    if (!C.hasToken() && tab === 'market' && window.TribeMarket) { window.TribeMarket.mount(body); return; }   // feat/files-dash: the Marketplace works with no tribe (the saved list)
    if (!C.hasToken()) { body.innerHTML = empty('Needs a tribe', 'The Workshop is shared, so it lives on the tribe host. Host or join a tribe first.'); return; }
    try {
      if (tab === 'studios') { if (window.TribeStudios) window.TribeStudios.mount(body); else body.innerHTML = empty('Studios unavailable', 'Reload the app.'); return; }   // v0.27: Studios (studios.js)
      if (tab === 'market') { if (window.TribeMarket) window.TribeMarket.mount(body); else body.innerHTML = empty('Marketplace unavailable', 'Reload the app.'); return; }   // v0.27 company (market.js)
      if (tab === 'shelf') { const pid = window.TribeProjects && window.TribeProjects.current(); drawShelf(body, await C.api('/shelf' + (pid ? `?project=${encodeURIComponent(pid)}` : '')), pid); return; }
      if (tab === 'library') {
        const qs = new URLSearchParams(); if (q) qs.set('q', q); if (kind) qs.set('kind', kind);
        const [a, p] = await Promise.all([C.api('/workshop/items?' + qs), C.api('/workshop/pending').catch(() => ({ pending: [] }))]);
        items = a.items; pending = p.pending || [];
        drawLibrary(body);
      } else {
        comm = await C.api('/workshop/community');
        drawCommunity(body);
      }
    } catch (e) { body.innerHTML = empty('Could not load the Workshop', esc(e.message)); }
  }
  const empty = (title, line, extra = '') => `<div class="ws-empty"><b>${title}</b><span>${line}</span>${extra}</div>`;

  // ---------- previews ----------
  function thumbHtml(it, { big = false, remote = null } = {}) {
    const files = it.files || [];
    const prev = it.preview && files.find(f => f.path === it.preview);
    if (prev || remote) {
      const info = (prev && prev.info) || it.info || {};
      const small = info.w && info.w <= 256;
      if (info.frames >= 2) return `<div class="ws-th ws-sprite" data-src="${esc(remote || fileUrl(it, prev.path))}" data-remote="${remote ? 1 : 0}" style="--frames:${info.frames};--ratio:${info.w && info.h ? info.h / (info.w / info.frames) : 1}"><i></i></div>`;
      return `<div class="ws-th ws-img${small ? ' px' : ''}"><img alt="" data-src="${esc(remote || fileUrl(it, prev.path))}" data-remote="${remote ? 1 : 0}"></div>`;
    }
    const model = files.find(f => MODEL.test(f.path));
    if (model) {
      const i = model.info || {};
      return `<div class="ws-th ws-glyph g-model">${cube(big ? 88 : 56)}<span class="ws-th-cap">${esc(model.path.split('.').pop().toUpperCase())}${i.meshes ? ` · ${i.meshes} mesh${i.meshes === 1 ? '' : 'es'}` : ''}${i.animations ? ` · ${i.animations} anim${i.animations === 1 ? '' : 's'}` : ''}</span></div>`;
    }
    const audio = files.find(f => AUDIO.test(f.path));
    if (audio) return `<div class="ws-th ws-glyph g-audio">${wave(big ? 120 : 84)}<span class="ws-th-cap">${esc(audio.path.split('/').pop())}</span></div>`;
    const main = files.find(f => /SKILL\.md$/i.test(f.path)) || files.find(f => TEXT.test(f.path) && !/\.json$/i.test(f.path)) || files.find(f => TEXT.test(f.path));
    if (main && !remote && !it._community && it.id) return `<div class="ws-th ws-code" data-text="${esc(fileUrl(it, main.path))}"><span class="ws-th-file">${esc(main.path.split('/').pop())}</span><pre></pre></div>`;
    return `<div class="ws-th ws-glyph">${ico('i-folder', big ? 48 : 34)}<span class="ws-th-cap">${files.length} file${files.length === 1 ? '' : 's'}</span></div>`;
  }
  const cube = s => `<svg viewBox="0 0 64 64" width="${s}" height="${s}" class="ws-cube" aria-hidden="true"><path d="M32 6 56 19v26L32 58 8 45V19z" fill="#1E242D" stroke="#2A313C"/><path d="M32 6 56 19 32 32 8 19z" fill="#2A313C"/><path d="M32 32v26L8 45V19z" fill="#222833"/><path d="M32 32 56 19v26L32 58z" fill="#1B2028"/><path d="M32 6 56 19v26L32 58 8 45V19zM8 19l24 13 24-13M32 32v26" fill="none" stroke="#FFB86B" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  const wave = w => `<svg viewBox="0 0 120 40" width="${w}" height="${w / 3}" aria-hidden="true">${[6, 14, 22, 30, 18, 34, 26, 12, 20, 32, 16, 8, 24, 28, 10].map((h, i) => `<rect x="${i * 8 + 1}" y="${20 - h / 2}" width="4" height="${h}" rx="2" fill="#38C6B1"/>`).join('')}</svg>`;
  // Fill thumbnails after rendering: blobs for tribe files (with the token in a header), the CDN for community images.
  function hydrate(el) {
    el.querySelectorAll('img[data-src]').forEach(img => { const s = img.dataset.src; img.removeAttribute('data-src'); if (img.dataset.remote === '1') { img.referrerPolicy = 'no-referrer'; img.src = s; } else blobUrl(s).then(u => { img.src = u; }).catch(() => img.closest('.ws-th').classList.add('broken')); });
    el.querySelectorAll('.ws-sprite[data-src]').forEach(d => { const s = d.dataset.src; d.removeAttribute('data-src'); const set = u => d.querySelector('i').style.backgroundImage = `url("${u}")`; if (d.dataset.remote === '1') set(s); else blobUrl(s).then(set).catch(() => {}); });
    el.querySelectorAll('.ws-code[data-text]').forEach(d => { const s = d.dataset.text; d.removeAttribute('data-text'); textOf(s, 1200).then(t => { d.querySelector('pre').textContent = t.split('\n').slice(0, d.closest('.ws-detail, .ws-hero') ? 40 : 9).join('\n'); }).catch(() => {}); });
  }

  // ---------- library ----------
  function card(it, extra = '', remote = null) {
    return `<article class="ws-item" data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(it.title)}">
      ${thumbHtml(it, { remote })}
      <div class="ws-item-b">
        <span class="ws-kind k-${esc(it.kind)}">${esc(KIND_LABEL[it.kind] || it.kind)}</span>
        <b class="ws-item-t">${esc(it.title)}</b>
        <span class="ws-item-m">${esc(it.author || it.byName || '')}${it.author || it.byName ? ' · ' : ''}${esc(it.license)}${it.kind === 'asset' || it.kind === 'template' ? ` · ${size(it.size)}` : ''}</span>
        ${it.usedIn && it.usedIn.length ? `<span class="ws-used">${ico('i-folder', 12)}${esc(it.usedIn.slice(0, 2).map(u => `${u.emoji ? u.emoji + ' ' : ''}${u.name}`).join(', '))}${it.usedIn.length > 2 ? ` +${it.usedIn.length - 2}` : ''}</span>` : ''}
        ${extra}
      </div></article>`;
  }
  // ---------- Starter shelf (templates/shelf.json, server/shelf.js): checked open-source tools, libraries and Claude skills ----------
  const SHELF_EMO = { studio: '🎨', skill: '✨', library: '📦', tool: '🛠️', mcp: '🔌' };
  const SHELF_KIND = { studio: 'Creative studios', skill: 'Claude Code skills', library: 'Libraries', tool: 'Tools', mcp: 'Agent tools (MCP)' };
  function shelfCard(it) {
    return `<article class="ws-card-s"><div class="wss-top"><span class="ws-eyebrow">${esc(it.license)}</span>${it.added ? '<span class="wss-added">in this project</span>' : ''}</div>
      <h3>${esc(it.title)}</h3><p>${esc(it.summary)}</p>${it.install ? `<code class="wss-cmd">${esc(it.install)}</code>` : ''}
      <div class="wss-acts">${it.added ? '' : `<button class="btn sm primary" data-shelf-add="${esc(it.id)}">${it.kind === 'skill' ? 'Add the skill' : 'Add to toolbox'}</button>`}<a class="btn sm" href="${esc(it.url || `https://github.com/${it.repo}`)}" target="_blank" rel="noopener noreferrer">Open</a></div></article>`;
  }
  function drawShelf(body, d, pid) {
    const pick = new Set((d.picks || []).map(x => x.id)), items = (d.items || []).filter(it => !q || `${it.title} ${it.summary} ${(it.for || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
    const types = (d.types || []).length ? `Picks for this ${d.types.join(' / ')} project` : 'Picks for this project';
    body.innerHTML = `${pick.size && !q ? `<section class="ws-sec"><div class="ws-sec-h"><span class="ws-eyebrow">${esc(types)}</span><h2>Start here</h2></div><div class="wss-grid">${items.filter(it => pick.has(it.id)).map(shelfCard).join('')}</div></section>` : ''}
      ${Object.entries(SHELF_KIND).map(([k, l]) => { const list = items.filter(it => it.kind === k); return list.length ? `<section class="ws-sec"><div class="ws-sec-h"><span class="ws-eyebrow">${list.length}</span><h2>${SHELF_EMO[k] ? `<span class="emo" aria-hidden="true">${SHELF_EMO[k]}</span>` : ''}${l}</h2></div><div class="wss-grid">${list.map(shelfCard).join('')}</div></section>` : ''; }).join('')}
      <p class="wss-note">Every entry is open source and was checked (repo, license, install line). Skills go into the project's <code>.claude/skills/</code>, where Claude Code finds them; everything else lands in the project's Toolbox doc.</p>`;
    body.querySelectorAll('[data-shelf-add]').forEach(b => b.onclick = async () => {
      if (!pid) return toast('Open a project first');
      b.disabled = true; b.textContent = 'Adding…';
      try { const r = await C.api(`/shelf/${encodeURIComponent(b.dataset.shelfAdd)}/add`, { method: 'POST', body: { project: pid } }); toast(r.where ? `Added to ${r.where}` : `${r.item.title} is in the Toolbox`); load(); }
      catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Add'; }
    });
  }
  function drawLibrary(body) {
    const mine = pending.filter(s => s.canDecide || s.by === me().id);
    const hero = items.find(it => it.preview) || items[0];
    const featured = hero && !q && !kind;
    body.innerHTML = `
      ${featured ? heroCard(hero) : !items.length && !q && !kind ? introHero() : ''}
      ${mine.length ? `<section class="ws-sec"><div class="ws-sec-h"><span class="ws-eyebrow">Waiting for you</span><h2>Suggested by agents</h2></div>
        <div class="ws-pend">${mine.map(s => `<div class="ws-prow" data-pend="${esc(s.id)}">${thumbHtml({ ...s.item, _pending: s.id })}
          <div class="ws-prow-t"><b>${esc(s.item.title)}</b><span>${esc(s.byName)} suggests · ${esc(KIND_LABEL[s.item.kind])} · ${s.item.files.length} file${s.item.files.length === 1 ? '' : 's'} · ${esc(s.item.license)}</span></div>
          <div class="ws-prow-a"><button class="btn ghost" data-review>Review</button>${s.canDecide ? '<button class="btn ws-ok" data-approve>Approve</button><button class="btn ws-no" data-deny>Deny</button>' : '<span class="faint">waiting</span>'}</div></div>`).join('')}</div></section>` : ''}
      <section class="ws-sec">
        <div class="ws-sec-h"><span class="ws-eyebrow">${q ? 'Search' : kind ? esc(KINDS.find(k => k[0] === kind)[1]) : 'Library'}</span><h2>${q ? `Results for “${esc(q)}”` : kind ? `Every ${esc(KIND_LABEL[kind].toLowerCase())} in the tribe` : 'Everything the tribe shared'}</h2></div>
        ${items.length ? `<div class="ws-grid">${items.filter(it => !featured || it.id !== hero.id).map(it => card(it)).join('') || '<div class="faint ws-only">That is the only one so far.</div>'}</div>`
          : q || kind ? empty('Nothing matches', 'Try other words, or look on the community shelf.') : ''}
      </section>`;
    body.querySelectorAll('.ws-item, .ws-hero[data-id]').forEach(el => {
      el.addEventListener('click', e => { if (e.target.closest('[data-use]')) return; openDetail(items.find(x => x.id === el.dataset.id)); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter') openDetail(items.find(x => x.id === el.dataset.id)); });
    });
    body.querySelectorAll('[data-use]').forEach(b => b.onclick = e => { e.stopPropagation(); useDialog(items.find(x => x.id === b.dataset.use)); });
    body.querySelectorAll('[data-intro-add]').forEach(b => b.onclick = () => addDialog());
    body.querySelectorAll('[data-intro-comm]').forEach(b => b.onclick = () => { tab = 'community'; load(); });
    body.querySelectorAll('.ws-prow').forEach(row => {
      const s = pending.find(x => x.id === row.dataset.pend);
      const decide = async (how, b) => { b.disabled = true; try { await C.api(`/workshop/pending/${s.id}/${how}`, { method: 'POST', body: {} }); toast(how === 'approve' ? `${s.item.title} is in the Workshop` : 'Suggestion declined'); load(); } catch (e) { toast(e.message); b.disabled = false; } };
      row.querySelector('[data-review]').onclick = () => openDetail({ ...s.item, _pending: s.id, _s: s });
      const ap = row.querySelector('[data-approve]'), dn = row.querySelector('[data-deny]');
      if (ap) ap.onclick = () => decide('approve', ap); if (dn) dn.onclick = () => decide('deny', dn);
    });
    hydrate(body);
  }
  function heroCard(it) {
    return `<section class="ws-hero" data-id="${esc(it.id)}">
      <div class="ws-hero-art">${thumbHtml(it, { big: true })}</div>
      <div class="ws-hero-band">
        <span class="ws-eyebrow">Latest · ${esc(KIND_LABEL[it.kind])}</span>
        <h2>${esc(it.title)}</h2>
        ${it.summary ? `<p>${esc(it.summary)}</p>` : ''}
        <div class="ws-hero-meta"><span>${esc(it.author || it.byName || '')}</span><span>${esc(it.license)}</span><span>v${esc(it.version)}</span>${it.usedIn.length ? `<span>used in ${it.usedIn.length} project${it.usedIn.length === 1 ? '' : 's'}</span>` : ''}</div>
        <div class="ws-hero-a"><button class="btn primary" data-use="${esc(it.id)}">Use in a project</button><button class="btn ghost">Details</button></div>
      </div></section>`;
  }
  function introHero() {
    const tiles = [['skill', 'Skills', 'SKILL.md folders your agents learned'], ['recipe', 'Recipes', 'Feature scripts with a check'], ['template', 'Templates', 'Project starters'], ['asset', 'Assets', 'GLB models, sprites, audio, shaders'], ['script', 'Scripts', 'Game scripts and tools']];
    return `<section class="ws-hero ws-intro">
      <div class="ws-intro-art">${tiles.map(([k, l, d]) => `<div class="ws-tile k-${k}"><span class="ws-kind k-${k}">${l}</span><span>${d}</span></div>`).join('')}</div>
      <div class="ws-hero-band">
        <span class="ws-eyebrow">Workshop</span>
        <h2>What the tribe figured out, ready to reuse</h2>
        <p>Keep the skills, scripts and assets you and your agents make in one shared library, apart from any project. Copy them into a project when you need them. Nothing here ever runs by itself.</p>
        <div class="ws-hero-a">${me().role !== 'spectator' ? '<button class="btn primary" data-intro-add>Add from a project</button>' : ''}<button class="btn ghost" data-intro-comm>Browse the community shelf</button></div>
      </div></section>`;
  }

  // ---------- detail ----------
  async function openDetail(it) {
    if (!it) return;
    const root = frame(); detail = it;
    let full = it;
    if (!it._pending && !it._community) { try { full = { ...(await C.api('/workshop/items/' + it.id)).item }; } catch {} }
    detail = full;
    const el = root.querySelector('#ws-detail');
    const files = full.files || [];
    const comm_ = full._community;
    el.innerHTML = `
      <header class="ws-d-head"><span class="ws-kind k-${esc(full.kind)}">${esc(KIND_LABEL[full.kind])}</span><span class="faint">v${esc(full.version)}</span><span class="spacer"></span><button class="ws-icon" data-close aria-label="Close">${ico('i-x', 16)}</button></header>
      <div class="ws-d-art">${detailArt(full)}</div>
      <div class="ws-d-body">
        <h2>${esc(full.title)}</h2>
        ${full.summary ? `<p class="ws-d-sum">${esc(full.summary)}</p>` : ''}
        <div class="ws-d-acts">${detailActions(full)}</div>
        <dl class="ws-dl">
          <dt>License</dt><dd><b>${esc(full.license)}</b> <span class="faint">${esc(licNote(full.license))}</span></dd>
          <dt>Author</dt><dd>${esc(full.author || '—')}</dd>
          ${full.byName && !comm_ ? `<dt>Added by</dt><dd>${esc(full.byName)}${full.updated ? ` <span class="faint">· ${esc(ago(full.updated))}</span>` : ''}</dd>` : ''}
          ${full.source && full.source.type === 'community' ? `<dt>From</dt><dd>community · ${esc(full.source.repo)}</dd>` : ''}
          ${full.tags && full.tags.length ? `<dt>Tags</dt><dd>${full.tags.map(t => `<span class="ws-tag">${esc(t)}</span>`).join(' ')}</dd>` : ''}
          ${!comm_ && !full._pending ? `<dt>Used in</dt><dd>${full.usedIn && full.usedIn.length ? full.usedIn.map(u => `${esc(u.emoji)} ${esc(u.name)} <span class="faint">${esc(u.dest)}/</span>`).join('<br>') : '<span class="faint">not used yet</span>'}</dd>` : ''}
        </dl>
        ${full.check ? `<div class="ws-check"><span class="ws-eyebrow">Check</span><div><b>${esc(full.check.kind)}</b>${full.check.run ? ` <code>${esc(full.check.run)}</code>` : ''}${full.check.file ? ` <code>${esc(full.check.file)}</code>` : ''}</div>${full.check.note ? `<p>${esc(full.check.note)}</p>` : ''}<span class="faint">Never run automatically. Run it yourself after copying.</span></div>` : ''}
        <div class="ws-files"><div class="ws-sec-h sm"><span class="ws-eyebrow">Files</span><h3>${files.length} file${files.length === 1 ? '' : 's'} · ${size(files.reduce((n, f) => n + f.size, 0))}</h3></div>
          ${files.map(f => `<div class="ws-file"><span class="ws-fx">${esc((f.path.split('.').pop() || '').slice(0, 4))}</span><span class="ws-fp">${esc(f.path)}</span><span class="ws-fs">${size(f.size)}</span><code class="ws-sha" title="sha256 ${esc(f.sha256)}">${esc(f.sha256.slice(0, 8))}</code>${!comm_ ? `<button class="ws-icon sm" data-file="${esc(f.path)}" title="Download" aria-label="Download ${esc(f.path)}"><svg class="i" viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg></button>` : ''}</div>`).join('')}
        </div>
        ${full.versions > 1 && full.history ? `<div class="ws-hist"><span class="ws-eyebrow">Versions</span>${full.history.slice().reverse().slice(0, 6).map(h => `<span>v${esc(h.version)} <span class="faint">${esc(ago(h.at))}</span></span>`).join('')}</div>` : ''}
      </div>`;
    root.querySelector('#ws-drawer').classList.remove('hidden');
    el.querySelectorAll('[data-file]').forEach(b => b.onclick = async () => { try { const u = await blobUrl(fileUrl(full, b.dataset.file)); const a = document.createElement('a'); a.href = u; a.download = b.dataset.file.split('/').pop(); a.click(); } catch (e) { toast('Could not download: ' + e.message); } });
    wireActions(el, full);
    hydrate(el);
  }
  function detailArt(it) {
    const files = it.files || [];
    const audio = files.find(f => AUDIO.test(f.path));
    const remote = it._community && it.previewUrl ? it.previewUrl : null;
    let out = thumbHtml(it, { big: true, remote });
    if (audio && !it._community) out += `<audio controls preload="none" data-audio="${esc(fileUrl(it, audio.path))}"></audio>`;
    const model = files.find(f => MODEL.test(f.path) && f.info);
    if (model) out += `<div class="ws-model-i">${[['meshes', 'mesh'], ['nodes', 'node'], ['materials', 'material'], ['animations', 'animation'], ['skins', 'skin']].filter(([k]) => model.info[k]).map(([k, one]) => `<span><b>${model.info[k]}</b> ${model.info[k] === 1 ? one : k}</span>`).join('')}${(model.info.animationNames || []).length ? `<span class="faint">${esc(model.info.animationNames.join(', '))}</span>` : ''}</div>`;
    return out;
  }
  function detailActions(it) {
    if (it._community) return it.inLibrary ? '<span class="faint">Already in the tribe library</span>' : human() ? `<button class="btn primary" data-get>Get for the tribe</button><span class="faint">Checked (sha256, size, type) before it is saved</span>` : '<span class="faint">A teammate can bring this into the tribe library</span>';
    if (it._pending) return it._s && it._s.canDecide ? '<button class="btn ws-ok" data-approve>Approve</button><button class="btn ws-no" data-deny>Deny</button>' : `<span class="faint">Waiting for approval</span>`;
    const b = [];
    if (me().role !== 'spectator') b.push('<button class="btn primary" data-use>Use in a project</button>');
    if (it.canEdit) b.push('<button class="btn" data-bump>New version</button>');
    if (human()) b.push('<button class="btn" data-donate>Donate to community</button>');
    if (it.canEdit) b.push('<button class="btn ghost ws-danger" data-remove>Remove</button>');
    return b.join('');
  }
  function wireActions(el, it) {
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = async () => { b.disabled = true; try { await fn(b); } catch (e) { toast(e.message); } b.disabled = false; }; };
    on('[data-use]', () => useDialog(it));
    on('[data-bump]', () => addDialog(it));
    on('[data-donate]', () => donateDialog(it));
    on('[data-remove]', async () => { if (!confirm(`Remove ${it.title} from the Workshop? Projects keep the copies they already have.`)) return; await C.api('/workshop/items/' + it.id, { method: 'DELETE' }); toast('Removed'); closeDetail(); load(); });
    on('[data-get]', async () => { const r = await C.api(`/workshop/community/${it.id}/get`, { method: 'POST', body: {} }); toast(`${r.item.title} is in the tribe library`); closeDetail(); tab = 'library'; load(); });
    on('[data-approve]', async () => { await C.api(`/workshop/pending/${it._pending}/approve`, { method: 'POST', body: {} }); toast('Approved'); closeDetail(); load(); });
    on('[data-deny]', async () => { await C.api(`/workshop/pending/${it._pending}/deny`, { method: 'POST', body: {} }); toast('Declined'); closeDetail(); load(); });
    const au = el.querySelector('audio[data-audio]'); if (au) blobUrl(au.dataset.audio).then(u => { au.src = u; }).catch(() => {});
  }
  function closeDetail() { detail = null; const d = document.getElementById('ws-drawer'); if (d) d.classList.add('hidden'); }

  // ---------- modal helpers ----------
  function modal(html, cls = '') {
    const root = frame(), m = root.querySelector('#ws-modal'), c = root.querySelector('#ws-mcard');
    c.className = 'ws-card ' + cls; c.innerHTML = html; m.classList.remove('hidden');
    return c;
  }
  function closeModal() { const m = document.getElementById('ws-modal'); if (m) m.classList.add('hidden'); }
  const mhead = (eyebrow, title) => `<header class="ws-m-head"><div><span class="ws-eyebrow">${eyebrow}</span><h2>${title}</h2></div><button class="ws-icon" data-mclose aria-label="Close">${ico('i-x', 16)}</button></header>`;
  async function projectList() { try { return (await C.api('/projects')).projects || []; } catch { return C.state().projects || []; } }

  // ---------- use in a project: show files + license first, then copy ----------
  async function useDialog(it) {
    const projects = (await projectList()).filter(p => p.hasRepo);
    const cur = C.project();
    const c = modal(`${mhead('Use in a project', esc(it.title))}
      ${projects.length ? `<div class="ws-form">
        <label>Project<select id="wu-p">${projects.map(p => `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.emoji ? p.emoji + ' ' : '')}${esc(p.name)}</option>`).join('')}</select></label>
        <label>Folder in the project<input id="wu-d" value="workshop/${esc(it.id)}" autocomplete="off" spellcheck="false"></label>
      </div>
      <div class="ws-plan" id="wu-plan"><span class="faint">Checking…</span></div>
      <footer class="ws-m-foot"><span class="ws-safe">${ico('i-check', 14)}Files are copied. Nothing runs or installs.</span><span class="spacer"></span><button class="btn ghost" data-mclose>Cancel</button><button class="btn primary" id="wu-go" disabled>Copy files</button></footer>`
      : `<div class="ws-empty"><b>No project folder yet</b><span>Workshop items are copied into a project's folder. Start a project from a folder or a code repository first.</span></div>`}`, 'ws-use');
    if (!projects.length) return;
    let plan = null, t;
    const check = async () => {
      const box = c.querySelector('#wu-plan'), go = c.querySelector('#wu-go');
      go.disabled = true;
      try {
        plan = await C.api(`/workshop/items/${it.id}/use`, { method: 'POST', body: { project: c.querySelector('#wu-p').value, dest: c.querySelector('#wu-d').value.trim(), dry: true } });
        box.innerHTML = `<div class="ws-lic"><b>${esc(plan.license)}</b><span>${esc(licNote(plan.license))}${plan.author ? ` Author: ${esc(plan.author)}.` : ''}</span></div>
          <div class="ws-plan-files">${plan.files.map(f => `<div class="${plan.conflicts.includes(f.path) ? 'clash' : ''}"><code>${esc(f.path)}</code><span>${size(f.size)}</span></div>`).join('')}</div>
          ${plan.conflicts.length ? `<label class="ws-over"><input type="checkbox" id="wu-o"> Replace ${plan.conflicts.length} file${plan.conflicts.length === 1 ? '' : 's'} that already exist${plan.conflicts.length === 1 ? 's' : ''}</label>` : ''}`;
        go.textContent = `Copy ${plan.files.length} file${plan.files.length === 1 ? '' : 's'}`;
        const o = box.querySelector('#wu-o'); go.disabled = !!plan.conflicts.length; if (o) o.onchange = () => { go.disabled = !o.checked; };
      } catch (e) { box.innerHTML = `<div class="ws-err">${esc(e.message)}</div>`; }
    };
    c.querySelector('#wu-p').onchange = check;
    c.querySelector('#wu-d').oninput = () => { clearTimeout(t); t = setTimeout(check, 250); };
    c.querySelector('#wu-go').onclick = async () => {
      const go = c.querySelector('#wu-go'); go.disabled = true;
      try {
        const o = c.querySelector('#wu-o');
        const r = await C.api(`/workshop/items/${it.id}/use`, { method: 'POST', body: { project: c.querySelector('#wu-p').value, dest: c.querySelector('#wu-d').value.trim(), overwrite: !!(o && o.checked) } });
        closeModal(); toast(`Copied ${r.copied} file${r.copied === 1 ? '' : 's'} to ${r.dest}/`); load(); if (detail) openDetail(detail);
      } catch (e) { toast(e.message); go.disabled = false; }
    };
    check();
  }

  // ---------- add to the Workshop (from a project folder, or uploaded files) ----------
  const guessKind = paths => {
    if (paths.some(p => /SKILL\.md$/i.test(p))) return 'skill';
    if (paths.some(p => MODEL.test(p) || IMG.test(p) || AUDIO.test(p) || /\.(glsl|frag|vert|wgsl|svg)$/i.test(p))) return 'asset';
    if (paths.some(p => /(^|\/)(package\.json|index\.html)$/i.test(p))) return 'template';
    return 'script';
  };
  const suggestLicense = k => (k === 'asset' ? 'CC0-1.0' : '');
  async function addDialog(base) {
    const projects = (await projectList()).filter(p => p.hasRepo);
    const cur = projects.find(p => p.id === C.project()) ? C.project() : (projects[0] || {}).id;
    const picked = new Set(); let uploads = null, dir = '', src = projects.length ? 'project' : 'upload';
    const c = modal(`${mhead(base ? 'New version' : 'Add to the Workshop', base ? esc(base.title) : 'Share something reusable')}
      <div class="ws-src">
        <div class="ws-seg" role="tablist"><button data-src="project" ${projects.length ? '' : 'disabled'}>From a project</button><button data-src="upload">Upload files</button></div>
        <div id="wa-proj" class="ws-pick">
          <select id="wa-p" aria-label="Project">${projects.map(p => `<option value="${esc(p.id)}" ${p.id === cur ? 'selected' : ''}>${esc(p.emoji ? p.emoji + ' ' : '')}${esc(p.name)}</option>`).join('')}</select>
          <div class="ws-crumbs" id="wa-crumbs"></div>
          <div class="ws-tree" id="wa-tree"></div>
        </div>
        <div id="wa-up" class="ws-pick hidden"><label class="ws-drop"><input type="file" id="wa-files" multiple><span>${ico('i-upload', 18)} Choose files</span><small>Models, images, audio, shaders, text and code. 25 MB a file, 100 MB in all.</small></label><div class="ws-upl" id="wa-upl"></div></div>
        <div class="ws-picked" id="wa-picked"></div>
      </div>
      <div class="ws-form two">
        <label>Kind<select id="wa-k">${KINDS.slice(1).map(([k, l]) => `<option value="${k}">${l.slice(0, -1)}</option>`).join('')}</select></label>
        <label>License<select id="wa-l" required><option value="">Choose a license</option>${LICENSES.map(([id, l, d]) => `<option value="${id}">${l} · ${d}</option>`).join('')}</select></label>
        <label class="wide">Title<input id="wa-t" maxlength="80" placeholder="Double jump for 2D platformers" autocomplete="off"></label>
        <label class="wide">Summary<textarea id="wa-s" maxlength="400" rows="2" placeholder="What it is and how to use it"></textarea></label>
        <label>Tags<input id="wa-g" placeholder="platformer, movement" autocomplete="off"></label>
        <label>Author<input id="wa-a" maxlength="64" value="${esc(me().name || '')}" autocomplete="off"></label>
        <label class="wide ws-recipe hidden">Check (how to prove it works; never run automatically)<input id="wa-c" maxlength="200" placeholder="npm test -- doublejump" autocomplete="off"></label>
      </div>
      <footer class="ws-m-foot"><span class="faint" id="wa-note">${me().role === 'agent' ? 'A human approves this first.' : ''}</span><span class="spacer"></span><button class="btn ghost" data-mclose>Cancel</button><button class="btn primary" id="wa-go">${base ? 'Publish new version' : 'Add to Workshop'}</button></footer>`, 'ws-add-m');
    const $ = s => c.querySelector(s);
    if (base) { $('#wa-k').value = base.kind; $('#wa-l').value = base.license; $('#wa-t').value = base.title; $('#wa-s').value = base.summary || ''; $('#wa-g').value = (base.tags || []).join(', '); $('#wa-a').value = base.author || ''; if (base.check && base.check.run) $('#wa-c').value = base.check.run; }
    const kindSync = () => $('.ws-recipe').classList.toggle('hidden', $('#wa-k').value !== 'recipe');
    $('#wa-k').onchange = () => { kindSync(); if (!$('#wa-l').value) $('#wa-l').value = suggestLicense($('#wa-k').value); };
    kindSync();
    const paths = () => (src === 'project' ? [...picked] : (uploads || []).map(f => f.path));
    function refreshPicked() {
      const ps = paths();
      $('#wa-picked').innerHTML = ps.length ? `<span class="ws-eyebrow">Picked</span>${ps.slice(0, 8).map(p => `<code>${esc(p)}</code>`).join('')}${ps.length > 8 ? `<span class="faint">+${ps.length - 8}</span>` : ''}` : '';
      if (ps.length && !base) {
        const k = guessKind(ps); $('#wa-k').value = k; kindSync();
        if (!$('#wa-l').value) $('#wa-l').value = suggestLicense(k);
        if (!$('#wa-t').value) $('#wa-t').value = ps[0].split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/^\w/, ch => ch.toUpperCase());
      }
    }
    async function tree() {
      const box = $('#wa-tree'), pid = $('#wa-p').value;
      if (!pid) { box.innerHTML = '<div class="faint">No project with a folder.</div>'; return; }
      box.innerHTML = '<div class="faint">Loading…</div>';
      try {
        const r = await C.api(`/workshop/browse?project=${encodeURIComponent(pid)}&dir=${encodeURIComponent(dir)}`);
        const segs = dir ? dir.split('/') : [];
        $('#wa-crumbs').innerHTML = `<button data-dir="">${esc((projects.find(p => p.id === pid) || {}).name || 'project')}</button>${segs.map((s, i) => `<span>/</span><button data-dir="${esc(segs.slice(0, i + 1).join('/'))}">${esc(s)}</button>`).join('')}`;
        box.innerHTML = r.entries.length ? r.entries.map(e => `<div class="ws-row ${e.allowed ? '' : 'off'}" data-path="${esc(e.path)}" data-dirp="${e.dir ? 1 : 0}">
            <input type="checkbox" ${picked.has(e.path) ? 'checked' : ''} ${e.allowed ? '' : 'disabled'} aria-label="Pick ${esc(e.name)}">
            ${e.dir ? `<button class="ws-dirbtn" data-open>${ico('i-folder', 15)}<span>${esc(e.name)}</span></button>` : `<span class="ws-fn">${esc(e.name)}</span><span class="faint">${e.allowed ? size(e.size) : 'not allowed'}</span>`}</div>`).join('') : '<div class="faint">Empty folder</div>';
        $('#wa-crumbs').querySelectorAll('[data-dir]').forEach(b => b.onclick = () => { dir = b.dataset.dir; tree(); });
        box.querySelectorAll('.ws-row').forEach(row => {
          const cb = row.querySelector('input'); const p = row.dataset.path;
          cb.onchange = () => { if (cb.checked) picked.add(p); else picked.delete(p); refreshPicked(); };
          const o = row.querySelector('[data-open]'); if (o) o.onclick = () => { dir = p; tree(); };
        });
      } catch (e) { box.innerHTML = `<div class="ws-err">${esc(e.message)}</div>`; }
    }
    const setSrc = s => { src = s; c.querySelectorAll('[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === s)); $('#wa-proj').classList.toggle('hidden', s !== 'project'); $('#wa-up').classList.toggle('hidden', s !== 'upload'); refreshPicked(); };
    c.querySelectorAll('[data-src]').forEach(b => b.onclick = () => setSrc(b.dataset.src));
    $('#wa-p').onchange = () => { dir = ''; picked.clear(); tree(); refreshPicked(); };
    $('#wa-files').onchange = async e => {
      const fs = [...e.target.files], bad = fs.filter(f => !ALLOWED.test(f.name));
      if (bad.length) toast(`Skipped ${bad.map(f => f.name).slice(0, 3).join(', ')}: that type is not allowed`);
      uploads = await Promise.all(fs.filter(f => ALLOWED.test(f.name)).map(f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ path: f.name, data: String(r.result).split(',')[1] || '', size: f.size }); r.onerror = rej; r.readAsDataURL(f); })));
      $('#wa-upl').innerHTML = uploads.map(u => `<div><code>${esc(u.path)}</code><span class="faint">${size(u.size)}</span></div>`).join('');
      refreshPicked();
    };
    $('#wa-go').onclick = async () => {
      const go = $('#wa-go');
      if (!paths().length) return toast('Pick at least one file or folder');
      if (!$('#wa-l').value) { $('#wa-l').focus(); return toast('Choose a license so others know how they may use it'); }
      if (!$('#wa-t').value.trim()) { $('#wa-t').focus(); return toast('Give it a title'); }
      go.disabled = true;
      const body = { kind: $('#wa-k').value, license: $('#wa-l').value, title: $('#wa-t').value.trim(), summary: $('#wa-s').value.trim(), tags: $('#wa-g').value, author: $('#wa-a').value.trim(),
        ...(base ? { id: base.id } : {}), ...($('#wa-k').value === 'recipe' && $('#wa-c').value.trim() ? { check: { kind: 'test', run: $('#wa-c').value.trim() } } : {}),
        ...(src === 'project' ? { from: { project: $('#wa-p').value, paths: [...picked] } } : { files: uploads.map(u => ({ path: u.path, data: u.data })) }) };
      try {
        const r = await C.api('/workshop/items', { method: 'POST', body });
        closeModal();
        if (r.pending) toast('Suggested. A teammate approves it before it is published.');
        else { toast(r.bumped ? `${r.item.title} is now v${r.item.version}` : `${r.item.title} is in the Workshop`); }
        tab = 'library'; await load(); if (r.item) openDetail(r.item);
      } catch (e) { toast(e.message); go.disabled = false; }
    };
    setSrc(src);
    if (projects.length) tree();
  }

  // ---------- donate to the community ----------
  async function donateDialog(it) {
    const r = await C.api(`/workshop/items/${it.id}/donate`, { method: 'POST', body: {} });
    const c = modal(`${mhead('Donate to the community', esc(it.title))}
      <p class="ws-m-lead">The community shelf is a public GitHub repository, <b>${esc(r.repo)}</b>, served to everyone through jsDelivr, a free open-source CDN. Your item goes in as a pull request; the code repository checks the license, file types, sizes and sha256 before anyone merges it.</p>
      <div class="ws-lic"><b>${esc(it.license)}</b><span>${esc(licNote(it.license))} Everyone will be able to use it under this license.</span></div>
      <div class="ws-bundle"><span class="ws-eyebrow">Bundle ready</span><code>${esc(r.bundle.folder)}/</code>${r.bundle.files.slice(0, 6).map(f => `<div><code>${esc(f.path)}</code>${f.size !== undefined ? `<span class="faint">${size(f.size)}</span>` : ''}</div>`).join('')}${r.bundle.files.length > 6 ? `<span class="faint">+${r.bundle.files.length - 6} more</span>` : ''}</div>
      <div class="ws-steps">
        <a class="btn primary" href="${esc(r.links.upload)}" target="_blank" rel="noopener noreferrer">Open GitHub upload</a>
        <button class="btn" id="wd-copy">Copy instructions</button>
        ${r.canPr ? '<button class="btn" id="wd-pr">Open a pull request for me</button>' : '<span class="faint">Save a GitHub token in Settings to open the pull request from here.</span>'}
      </div>
      <pre class="ws-instr">${esc(r.instructions)}</pre>
      <div id="wd-out"></div>`, 'ws-donate');
    c.querySelector('#wd-copy').onclick = async () => { try { await navigator.clipboard.writeText(r.instructions + '\n\nindex entry:\n' + JSON.stringify(r.indexEntry, null, 2)); toast('Copied'); } catch { toast('Select the text to copy it'); } };
    const pr = c.querySelector('#wd-pr');
    if (pr) pr.onclick = async () => {
      pr.disabled = true; pr.textContent = 'Opening…';
      try { const x = await C.api(`/workshop/items/${it.id}/donate`, { method: 'POST', body: { pr: true } }); c.querySelector('#wd-out').innerHTML = `<div class="ws-lic ok"><b>Pull request open</b><a href="${esc(x.pr.url)}" target="_blank" rel="noopener noreferrer">${esc(x.pr.url)}</a></div>`; pr.textContent = 'Done'; }
      catch (e) { toast(e.message); pr.disabled = false; pr.textContent = 'Open a pull request for me'; }
    };
  }

  // ---------- community shelf ----------
  function drawCommunity(body) {
    const c = comm || { items: [] };
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = (c.items || []).filter(it => (!kind || it.kind === kind) && words.every(w => [it.id, it.title, it.summary, ...(it.tags || [])].join(' ').toLowerCase().includes(w)));
    const host = me().role === 'host';
    body.innerHTML = `
      <section class="ws-hero ws-shelf">
        <div class="ws-shelf-art">${cdnArt()}</div>
        <div class="ws-hero-band">
          <span class="ws-eyebrow">Community shelf</span>
          <h2>${esc(c.repo || '')}</h2>
          <p>Open-licensed skills, scripts and assets donated by tribes everywhere. It is a public GitHub repository, served free through jsDelivr. Browsing is read-only; anything you bring in is checked (sha256, size, type) and copied as files.</p>
          <div class="ws-hero-meta">${c.available ? `<span class="ok">● reachable</span><span>${c.items.length} item${c.items.length === 1 ? '' : 's'}</span>${c.updated ? `<span>updated ${esc(ago(c.updated))}</span>` : ''}` : `<span class="ws-warn">● ${c.reason === 'missing' ? 'not set up yet' : c.reason === 'offline' ? 'offline' : 'unreadable'}</span>`}</div>
          <div class="ws-hero-a"><a class="btn ghost" href="https://github.com/${esc(c.repo)}" target="_blank" rel="noopener noreferrer">Open on GitHub</a><button class="btn ghost" id="wc-refresh">Refresh</button>${host ? '<button class="btn ghost" id="wc-repo">Change code repository</button>' : ''}</div>
        </div></section>
      <section class="ws-sec">
        ${c.available ? `<div class="ws-sec-h"><span class="ws-eyebrow">${q || kind ? 'Filtered' : 'On the shelf'}</span><h2>${q ? `Results for “${esc(q)}”` : 'Shared by the community'}</h2></div>
          ${list.length ? `<div class="ws-grid">${list.map(it => card({ ...it, usedIn: [], _community: true }, it.inLibrary ? '<span class="ws-have">in your library</span>' : '', it.previewUrl)).join('')}</div>` : empty('Nothing here yet', 'Be the first: open an item in your library and donate it.')}
          ${c.rejected && c.rejected.length ? `<p class="faint ws-rej">${c.rejected.length} entr${c.rejected.length === 1 ? 'y was' : 'ies were'} skipped because they failed the safety checks.</p>` : ''}`
        : empty(c.reason === 'missing' ? 'No community shelf yet' : 'Could not reach the community shelf', c.reason === 'missing'
          ? `There is no index at <code>${esc(c.repo)}</code> yet. Create that public code repository from <code>templates/workshop-repo/</code> in TribeCode’s code repository (README, index.json, contribution rules and a check that validates every item), then donate the first item from your library.`
          : `${esc(c.message || '')}. Your tribe library still works offline.`)}
      </section>`;
    body.querySelector('#wc-refresh').onclick = async () => { comm = await C.api('/workshop/community?refresh=1'); drawCommunity(body); };
    const rb = body.querySelector('#wc-repo');
    if (rb) rb.onclick = async () => { const r = prompt('Community repo (owner/repo) on GitHub', c.repo); if (!r) return; try { await C.api('/workshop/config', { method: 'PUT', body: { repo: r.trim() } }); comm = await C.api('/workshop/community?refresh=1'); drawCommunity(body); } catch (e) { toast(e.message); } };
    body.querySelectorAll('.ws-item').forEach(el => el.onclick = () => { const it = list.find(x => x.id === el.dataset.id); openDetail({ ...it, _community: true }); });
    hydrate(body);
  }
  // Editorial flat art for the shelf: boxes on a shelf (no gradients).
  const cdnArt = () => `<svg viewBox="0 0 320 180" class="ws-shelf-svg" aria-hidden="true"><rect x="0" y="0" width="320" height="180" fill="#12151A"/>
    <rect x="24" y="132" width="272" height="8" rx="2" fill="#2A313C"/><rect x="24" y="72" width="272" height="8" rx="2" fill="#2A313C"/>
    <rect x="40" y="96" width="44" height="36" rx="4" fill="#F26B1D"/><rect x="90" y="88" width="34" height="44" rx="4" fill="#1E242D" stroke="#2A313C"/><path d="M98 104h18M98 112h12M98 120h16" stroke="#38C6B1" stroke-width="2"/>
    <rect x="130" y="104" width="52" height="28" rx="4" fill="#6C7CFF"/><rect x="190" y="92" width="40" height="40" rx="4" fill="#1B2028" stroke="#2A313C"/><path d="M210 98l14 8v16l-14 8-14-8v-16z" fill="none" stroke="#FFB86B" stroke-width="2"/>
    <rect x="238" y="100" width="42" height="32" rx="4" fill="#38C6B1"/>
    <rect x="52" y="40" width="30" height="32" rx="4" fill="#1E242D" stroke="#2A313C"/><rect x="88" y="30" width="48" height="42" rx="4" fill="#FFB86B"/><rect x="142" y="44" width="36" height="28" rx="4" fill="#1B2028" stroke="#2A313C"/><circle cx="160" cy="58" r="7" fill="#F26B1D"/>
    <rect x="186" y="36" width="26" height="36" rx="4" fill="#6C7CFF"/><rect x="218" y="48" width="56" height="24" rx="4" fill="#1E242D" stroke="#2A313C"/><path d="M226 60h40" stroke="#F26B1D" stroke-width="2"/></svg>`;

  // live: new items, approvals decided elsewhere
  C.on('ws', m => { if (open_ && (m.type === 'workshop' || m.type === 'approval') && tab === 'library') load(); });
  C.on('hello', () => { if (location.hash === '#/workshop') open(); });

  window.TribeWorkshop = { open, close, isOpen: () => open_, reload: load };
  if (location.hash === '#/workshop') setTimeout(open, 0);
})();

// Rail entry (top level, apart from the project circles) and a palette-friendly global.
(() => {
  const b = document.getElementById('rail-workshop');
  if (b) b.addEventListener('click', e => { e.stopPropagation(); window.TribeWorkshop && (window.TribeWorkshop.isOpen() ? window.TribeWorkshop.close() : window.TribeWorkshop.open()); });
})();
