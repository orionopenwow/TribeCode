// The asset library (v0.25): find open sounds, 3D models, rigged/animated models, textures, pixel sprites, icons, fonts and
// motion, hear or see them, and add them to the project in one click. Files go to assets/ in the repo with credits in
// assets/CREDITS.md (server/assets.js). Open it from Files › Assets, the chat's + menu, Flint ("add a jump sound"), or
// window.TribeAssets.open({ q, kind }).
(function () {
  'use strict';
  const C = () => window.TribeClient, A = () => window.TribeApp;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => { if (A() && A().toast) A().toast(t); };
  let cat = null, picked = new Map(), last = [], blobs = [];
  async function catalog() { if (!cat) cat = await C().api('/assets'); return cat; }
  // previews need the sign-in header, so they're fetched and shown as blob URLs
  async function blobUrl(q) {
    const st = window.TribeStore && window.TribeStore.get(), tok = st && st.server && st.server.token;
    const r = await fetch(C().base() + '/api/assets/preview?' + q, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    if (!r.ok) throw new Error('no preview');
    const u = URL.createObjectURL(await r.blob()); blobs.push(u); return u;
  }
  const canPreview = x => x.pack === 'sprites' || x.pack === 'sfx' || ['lucide', 'tabler', 'phosphor', 'heroicons', 'pixelarticons', 'pixel-hn'].includes(x.pack);
  function tile(x, kinds) {
    const k = kinds.find(k => k.id === x.kind) || {}, id = `${x.pack}:${x.name}`;
    return `<button type="button" class="as-tile${picked.has(id) ? ' on' : ''}" data-id="${esc(id)}" aria-pressed="${picked.has(id)}" title="${esc(x.title)} · ${esc(x.license)}">
      <span class="as-thumb" data-thumb="${esc(id)}">${x.pack === 'sfx' ? '<span class="as-play" aria-hidden="true">▶</span>' : `<span class="as-k" aria-hidden="true">${k.emoji || '📦'}</span>`}</span>
      <b>${esc(x.title)}</b><small>${esc(k.title || x.kind)} · ${esc(x.license)}</small></button>`;
  }
  async function thumbs(box) {
    for (const el of box.querySelectorAll('[data-thumb]')) {
      const [pack, ...rest] = el.dataset.thumb.split(':'), name = rest.join(':'), x = last.find(r => r.pack === pack && r.name === name);
      if (!x || !canPreview(x) || x.pack === 'sfx') continue;
      blobUrl(`pack=${encodeURIComponent(pack)}&name=${encodeURIComponent(name)}`).then(u => { el.innerHTML = `<img src="${u}" alt="">`; }).catch(() => {});
    }
  }
  async function play(name) { try { const u = await blobUrl(`pack=sfx&name=${encodeURIComponent(name)}`); new Audio(u).play().catch(() => {}); } catch {} }

  async function open(opts = {}) {
    if (!C() || !C().connected()) return toast('Connect to a tribe to use the asset library.');
    let c; try { c = await catalog(); } catch (e) { return toast('The asset library didn\'t load: ' + e.message); }
    document.getElementById('as-modal')?.remove(); picked = new Map();
    const m = document.createElement('div'); m.className = 'modal as-modal'; m.id = 'as-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Asset library');
    m.innerHTML = `<div class="modal-card as-card">
      <div class="as-head"><div><p class="eyebrow mono">Asset library</p><h2>Sounds, models, sprites and more</h2></div>${window.TribeStudios ? '<button class="btn sm ghost as-studios" data-studios title="Free creative tools to make your own">Make your own: Studios</button>' : ''}<button class="fwin-btn" data-close title="Close"><svg class="i"><use href="#i-x"/></svg></button></div>
      <p class="as-lead">Open assets only (CC0, MIT, OFL, CC-BY with credit). Everything you add lands in <code>assets/</code> with a credit line.</p>
      <div class="as-bar"><input class="input as-q" id="as-q" type="search" placeholder="Try jump, coin, heart, fox, forest…" value="${esc(opts.q || '')}" autocomplete="off" aria-label="Search assets"></div>
      <div class="as-kinds" role="tablist">${[{ id: '', title: 'All', emoji: '🎒' }, ...c.kinds].map(k => `<button type="button" class="as-kind${(opts.kind || '') === k.id ? ' on' : ''}" data-kind="${k.id}" role="tab" aria-selected="${(opts.kind || '') === k.id}">${k.emoji} ${esc(k.title)}</button>`).join('')}</div>
      <div class="as-grid" id="as-grid" aria-live="polite"></div>
      <details class="as-more"><summary>More places to get assets</summary><ul>${c.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> <span class="faint">${esc(s.license)}</span> · ${esc(s.summary)}</li>`).join('')}</ul>
        <p class="faint">Download a pack there and drop the files in Files. Left out on purpose: ${c.left_out.map(x => esc(x.title)).join(', ')}.</p></details>
      <div class="modal-foot as-foot"><span class="faint" id="as-count">Pick what you want</span><button class="btn" data-close>Cancel</button><button class="btn primary" id="as-add" disabled>Add to project</button></div></div>`;
    document.body.appendChild(m);
    const q = m.querySelector('#as-q'), grid = m.querySelector('#as-grid'), addB = m.querySelector('#as-add'), count = m.querySelector('#as-count');
    let kind = opts.kind || '', tmr = null, seq = 0;
    const close = () => { m.remove(); blobs.forEach(u => URL.revokeObjectURL(u)); blobs = []; };
    m.onclick = e => { if (e.target.closest('[data-studios]')) { close(); window.TribeStudios.open(); return; } if (e.target === m || e.target.closest('[data-close]')) close(); };
    m.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const paintCount = () => { count.textContent = picked.size ? `${picked.size} picked` : 'Pick what you want'; addB.disabled = !picked.size; };
    async function run() {
      const my = ++seq, term = q.value.trim();
      if (!term) {   // nothing typed: show the built-ins for this kind so the grid is never empty
        last = []; c.packs.filter(p => p.how === 'built-in' && (!kind || p.kind === kind)).forEach(p => (p.names || []).forEach(n => last.push({ pack: p.id, name: n, kind: p.kind, title: n, license: p.license })));
        if (!kind || kind === 'model' || kind === 'rigged') (c.packs.find(p => p.id === 'gltf') || { models: [] }).models.filter(x => !kind || x.kind === kind).forEach(x => last.push({ pack: 'gltf', name: x.name, kind: x.kind, title: x.name.replace(/([a-z])([A-Z])/g, '$1 $2'), license: x.license }));
      } else {
        grid.innerHTML = '<p class="faint as-empty">Looking…</p>';
        try { const r = await C().api(`/assets/search?q=${encodeURIComponent(term)}${kind ? `&kind=${kind}` : ''}`); if (my !== seq) return; last = r.results; } catch (e) { last = []; }
      }
      if (my !== seq) return;
      grid.innerHTML = last.length ? last.map(x => tile(x, c.kinds)).join('') : `<p class="faint as-empty">Nothing for “${esc(term)}” here. Try another word, or one of the places under “More places”.</p>`;
      grid.querySelectorAll('.as-tile').forEach(b => b.onclick = () => {
        const id = b.dataset.id, [pack, ...rest] = id.split(':'), name = rest.join(':');
        if (pack === 'sfx') play(name);
        if (picked.has(id)) picked.delete(id); else picked.set(id, { pack, name });
        b.classList.toggle('on', picked.has(id)); b.setAttribute('aria-pressed', picked.has(id)); paintCount();
      });
      thumbs(grid);
    }
    q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(run, 250); };
    m.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { kind = b.dataset.kind; m.querySelectorAll('[data-kind]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); run(); });
    addB.onclick = async () => {
      addB.disabled = true; addB.textContent = 'Adding…';
      try { const r = await C().api('/assets/add', { method: 'POST', body: { project: C().project(), items: [...picked.values()] } }); toast(`Added ${r.files.length} file${r.files.length === 1 ? '' : 's'} to ${r.where}`); close(); }
      catch (e) { toast('Not added: ' + e.message); addB.disabled = false; addB.textContent = 'Add to project'; }
    };
    run(); setTimeout(() => q.focus(), 30);
  }
  window.TribeAssets = { open, catalog };
})();
