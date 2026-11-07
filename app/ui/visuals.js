// Visuals: screenshots tracked over time, grouped by screen. Pick two versions to compare them side by side,
// with a swipe slider, or as a pixel diff (changed pixels in Ember Orange, with a % changed readout).
// Server: server/visuals.js (visuals/<screen>/<timestamp>.png + .json). Agents post with the add_visual MCP tool.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, F = window.TribeFloat, esc = F.esc;
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const nameOf = id => ((C.state().members || []).find(m => m.id === id) || {}).name || 'someone';
  const when = iso => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const TOL = 24, EMBER = [242, 107, 29];
  const st = { screens: [], screen: localStorage.getItem('tribecode.visScreen') || null, versions: [], a: null, b: null, mode: localStorage.getItem('tribecode.visMode') || 'swipe', swipe: 50, pct: null, loaded: false };
  const imgUrl = v => `${C.base()}/api/visuals/${v.screen}/${v.ts}.png?token=${encodeURIComponent(((window.TribeStore.get().server) || {}).token || '')}`;

  function ensureView() {
    let v = $('#view-visuals');
    if (!v && $('#main')) { v = document.createElement('section'); v.id = 'view-visuals'; v.className = 'hidden'; $('#main').appendChild(v); }
    return v;
  }

  async function show() { ensureView(); render(); await loadScreens(); }
  async function loadScreens() {
    if (!C.connected()) { st.loaded = true; return render(); }
    try { st.screens = (await C.api('/visuals')).screens; } catch (e) { toast('Could not load visuals: ' + e.message); }
    st.loaded = true;
    if (!st.screens.some(s => s.slug === st.screen)) st.screen = st.screens[0] ? st.screens[0].slug : null;
    await loadVersions(true);
  }
  async function loadVersions(reset) {
    if (!st.screen) { st.versions = []; return render(); }
    try { st.versions = (await C.api('/visuals/' + st.screen)).versions; } catch { st.versions = []; }
    const has = ts => st.versions.some(v => v.ts === ts);
    if (reset || !has(st.b)) st.b = st.versions.length ? st.versions[st.versions.length - 1].ts : null;
    if (reset || !has(st.a) || st.a === st.b) st.a = st.versions.length > 1 ? st.versions[st.versions.length - 2].ts : st.b;
    render();
  }

  function render() {
    const v = ensureView(); if (!v) return;
    const cur = st.screens.find(s => s.slug === st.screen);
    v.innerHTML = `<div class="view-head"><h1>Visuals</h1><span class="faint">${st.screens.length ? `${st.screens.length} screen${st.screens.length === 1 ? '' : 's'} · drop images to add a version` : 'screenshots over time'}</span>
        <button class="btn primary" id="vis-up" style="margin-left:auto"><svg class="i" style="width:15px;height:15px"><use href="#i-upload"/></svg>Add screenshot</button>
        <input type="file" id="vis-file" accept="image/*" multiple hidden></div>
      <div class="vis-grid">
        <aside class="vis-side" id="vis-side">${st.screens.map(s => `<button class="vis-screen ${s.slug === st.screen ? 'on' : ''}" data-screen="${esc(s.slug)}">
            <img alt="" loading="lazy" src="${esc(imgUrl(s.latest))}"><span><b>${esc(s.name)}</b><small>${s.count} version${s.count === 1 ? '' : 's'} · ${esc(ago(s.latest.at))}</small></span></button>`).join('')}
          <div class="vis-drop" id="vis-drop"><svg class="i"><use href="#i-image"/></svg><span>Drop screenshots here</span><small>or let your Claude Code post them with <code>add_visual</code></small></div></aside>
        <div class="vis-main" id="vis-main">${cur ? mainHtml(cur) : emptyHtml()}</div></div>`;
    bind(v);
    if (cur && st.versions.length) drawStage();
  }
  const emptyHtml = () => `<div class="doc-empty vis-empty"><svg class="i"><use href="#i-image"/></svg><h2>Track how your screens change</h2>
    <p>Drop screenshots here, grouped by screen name. Pick two versions to compare them side by side, with a swipe slider or a pixel diff.</p><button class="btn primary" id="vis-first">Add a screenshot</button></div>`;
  function verLabel(ts) { const i = st.versions.findIndex(v => v.ts === ts); const v = st.versions[i]; return v ? `v${i + 1} · ${when(v.at)}` : ''; }
  function mainHtml(cur) {
    const opts = sel => st.versions.map((v, i) => `<option value="${v.ts}" ${v.ts === sel ? 'selected' : ''}>v${i + 1} · ${esc(when(v.at))} · ${esc(nameOf(v.by))}</option>`).join('');
    return `<div class="vis-head"><h2>${esc(cur.name)}</h2>
        <div class="vis-pick"><label>Before<select id="vis-a">${opts(st.a)}</select></label><svg class="i"><use href="#i-diff"/></svg><label>After<select id="vis-b">${opts(st.b)}</select></label></div>
        <div class="tabs" id="vis-mode">${[['side', 'Side by side'], ['swipe', 'Swipe'], ['diff', 'Diff']].map(([k, l]) => `<button data-vm="${k}" class="${st.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="vis-pct" id="vis-pct" title="Share of pixels that changed">…</span></div>
      <div class="vis-strip" id="vis-strip">${st.versions.map((v, i) => `<button class="vis-thumb ${v.ts === st.a ? 'a' : ''} ${v.ts === st.b ? 'b' : ''}" data-ts="${v.ts}" title="v${i + 1} · ${esc(when(v.at))} · ${esc(nameOf(v.by))}${v.diffPrev !== null && v.diffPrev !== undefined ? ` · ${v.diffPrev}% vs previous` : ''}">
          <img alt="" loading="lazy" src="${esc(imgUrl(v))}"><span>v${i + 1}${v.ts === st.a ? ' <i>A</i>' : ''}${v.ts === st.b ? ' <i class="b">B</i>' : ''}</span></button>`).join('')}</div>
      <div class="vis-stage" id="vis-stage"></div>`;
  }

  function bind(v) {
    v.querySelector('#vis-up').onclick = () => pickFiles();
    const first = v.querySelector('#vis-first'); if (first) first.onclick = () => pickFiles();
    v.querySelector('#vis-file').onchange = e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) askScreen(files); };
    v.querySelectorAll('[data-screen]').forEach(b => {
      b.onclick = () => { st.screen = b.dataset.screen; localStorage.setItem('tribecode.visScreen', st.screen); loadVersions(true); };
      b.ondragover = e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); b.classList.add('over'); } };
      b.ondragleave = () => b.classList.remove('over');
      b.ondrop = e => { e.preventDefault(); e.stopPropagation(); b.classList.remove('over'); const s = st.screens.find(x => x.slug === b.dataset.screen); upload([...e.dataTransfer.files], s.name); };
    });
    v.ondragover = e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); v.classList.add('vis-over'); } };
    v.ondragleave = e => { if (!v.contains(e.relatedTarget)) v.classList.remove('vis-over'); };
    v.ondrop = e => { e.preventDefault(); v.classList.remove('vis-over'); const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')); if (files.length) askScreen(files); };
    const a = v.querySelector('#vis-a'), b = v.querySelector('#vis-b');
    if (a) a.onchange = () => { st.a = a.value; render(); };
    if (b) b.onchange = () => { st.b = b.value; render(); };
    v.querySelectorAll('[data-vm]').forEach(x => x.onclick = () => { st.mode = x.dataset.vm; localStorage.setItem('tribecode.visMode', st.mode); render(); });
    v.querySelectorAll('[data-ts]').forEach(x => x.onclick = e => {
      // Click: compare this version (B) with the one before it. Alt/Shift-click: set the "before" (A) side.
      const ts = x.dataset.ts, i = st.versions.findIndex(q => q.ts === ts);
      if (e.altKey || e.shiftKey) st.a = ts; else { st.b = ts; st.a = st.versions[Math.max(0, i - 1)].ts; }
      render();
    });
  }

  function pickFiles() { if (!C.connected()) return toast('Connect to a tribe to add screenshots.'); $('#vis-file').click(); }
  function guessName(f) { return f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_ ]?(v\d+|\d{6,}|\d{4}-\d{2}-\d{2}.*|screenshot.*|@\dx)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Untitled screen'; }
  function askScreen(files) {
    if (!C.connected()) return toast('Connect to a tribe to add screenshots.');
    const cur = st.screens.find(s => s.slug === st.screen);
    const box = document.createElement('div'); box.className = 'dx-picker vis-ask';
    box.innerHTML = `<div class="tf-eyebrow">${files.length} image${files.length === 1 ? '' : 's'} · which screen?</div><input class="cal-in" id="va-name" list="va-list" value="${esc(cur ? cur.name : guessName(files[0]))}" placeholder="Screen name, e.g. Login page">
      <datalist id="va-list">${st.screens.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
      <div class="cal-qrow"><button class="btn ghost" id="va-cancel">Cancel</button><button class="btn primary" id="va-go">Add</button></div>`;
    const anchor = $('#vis-up').getBoundingClientRect();
    const p = F.pop({ left: anchor.right - 280, top: anchor.top, bottom: anchor.bottom }, box);
    const go = () => { const n = box.querySelector('#va-name').value.trim(); p.close(); upload(files, n || guessName(files[0])); };
    box.querySelector('#va-go').onclick = go; box.querySelector('#va-cancel').onclick = () => p.close();
    box.querySelector('#va-name').onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => box.querySelector('#va-name').select(), 0);
  }
  function toPng(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url); resolve(c.toDataURL('image/png')); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} is not an image`)); };
      img.src = url;
    });
  }
  async function upload(files, screen) {
    let last = null;
    for (const f of files) {
      try {
        const data = f.type === 'image/png' ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }) : await toPng(f);
        last = (await C.api('/visuals', { method: 'POST', body: { screen, png_base64: data } })).visual;
      } catch (e) { toast(e.message); }
    }
    if (last) { st.screen = last.screen; localStorage.setItem('tribecode.visScreen', st.screen); toast(`Added to ${last.name}${last.diffPrev !== null ? ` · ${last.diffPrev}% changed` : ''}`); await loadScreens(); }
  }

  // ---------- compare ----------
  const imgCache = new Map();
  function loadImg(v) {
    if (imgCache.has(v.ts)) return imgCache.get(v.ts);
    const p = new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('image failed to load')); i.src = imgUrl(v); });
    imgCache.set(v.ts, p); return p;
  }
  function pixels(img, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); }
  // Pixel diff: returns { pct, canvas } where changed pixels are Ember Orange over a dimmed grayscale copy of B.
  function diff(imgA, imgB) {
    const w = Math.max(imgA.naturalWidth, imgB.naturalWidth), h = Math.max(imgA.naturalHeight, imgB.naturalHeight);
    const A = pixels(imgA, w, h).data, Bd = pixels(imgB, w, h), B = Bd.data;
    const out = new ImageData(w, h), O = out.data; let n = 0;
    const light = document.body.classList.contains('light');
    for (let i = 0; i < B.length; i += 4) {
      const ch = Math.abs(A[i] - B[i]) > TOL || Math.abs(A[i + 1] - B[i + 1]) > TOL || Math.abs(A[i + 2] - B[i + 2]) > TOL || Math.abs(A[i + 3] - B[i + 3]) > TOL;
      if (ch) { n++; O[i] = EMBER[0]; O[i + 1] = EMBER[1]; O[i + 2] = EMBER[2]; O[i + 3] = 255; }
      else { const g = (B[i] * 0.299 + B[i + 1] * 0.587 + B[i + 2] * 0.114); const v = light ? 190 + g * 0.25 : 26 + g * 0.5; O[i] = O[i + 1] = O[i + 2] = v; O[i + 3] = 255; }
    }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.className = 'vis-diff'; c.getContext('2d').putImageData(out, 0, 0);
    return { pct: Math.round(n / (w * h) * 10000) / 100, canvas: c };
  }
  let drawSeq = 0;
  async function drawStage() {
    const stage = $('#vis-stage'); if (!stage) return;
    const va = st.versions.find(v => v.ts === st.a), vb = st.versions.find(v => v.ts === st.b); if (!va || !vb) return;
    const my = ++drawSeq;
    let ia, ib; try { [ia, ib] = await Promise.all([loadImg(va), loadImg(vb)]); } catch (e) { stage.textContent = e.message; return; }
    if (my !== drawSeq) return;
    const d = diff(ia, ib); st.pct = d.pct;
    const pct = $('#vis-pct'); if (pct) { pct.textContent = va.ts === vb.ts ? 'same version' : `${d.pct}% changed`; pct.classList.toggle('hot', d.pct > 5); }
    const lab = (t, v) => `<span class="vis-tag">${t} · ${esc(verLabel(v.ts))}</span>`;
    if (st.mode === 'side') {
      stage.innerHTML = `<div class="vis-side-by"><figure>${lab('A', va)}<img alt="Before" src="${esc(ia.src)}"></figure><figure>${lab('B', vb)}<img alt="After" src="${esc(ib.src)}"></figure></div>`;
    } else if (st.mode === 'swipe') {
      stage.innerHTML = `<div class="vis-swipe" id="vis-swipe" style="--pos:${st.swipe}%;aspect-ratio:${d.canvas.width}/${d.canvas.height}">
          <img class="vis-b" alt="After" src="${esc(ib.src)}"><img class="vis-a" alt="Before" src="${esc(ia.src)}">
          <div class="vis-handle"><span></span></div>${lab('A', va).replace('vis-tag', 'vis-tag l')}${lab('B', vb).replace('vis-tag', 'vis-tag r')}
          <input type="range" min="0" max="100" step="0.5" value="${st.swipe}" aria-label="Swipe between versions" id="vis-range"></div>`;
      const box = $('#vis-swipe'), range = $('#vis-range');
      range.oninput = () => { st.swipe = +range.value; box.style.setProperty('--pos', st.swipe + '%'); };
    } else {
      stage.innerHTML = `<div class="vis-diffwrap"><div class="vis-legend"><span class="sw"></span>changed pixels · ${d.pct}% of ${d.canvas.width}×${d.canvas.height}${ia.naturalWidth !== ib.naturalWidth || ia.naturalHeight !== ib.naturalHeight ? ' · sizes differ' : ''}</div></div>`;
      stage.querySelector('.vis-diffwrap').appendChild(d.canvas);
    }
  }

  // ---------- wiring ----------
  C.on('ws', m => {
    if (m.type !== 'visual' && m.type !== 'visual-removed') return;
    const v = $('#view-visuals'); if (v && !v.classList.contains('hidden')) loadScreens();
  });
  F.more({ label: 'Visuals', icon: 'i-image', hint: 'compare', run: () => window.TribeApp.show('visuals') });
  F.more({ label: 'Pop out task board', icon: 'i-popout', run: () => window.TribePlan.floatTasks() });
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Go to', label: 'Visuals', keys: 'screenshots compare diff images visual', run: () => window.TribeApp.show('visuals') },
    { kind: 'Action', label: 'Add a screenshot', keys: 'visual upload image compare', run: () => { window.TribeApp.show('visuals'); setTimeout(pickFiles, 120); } },
  ]);
  ensureView();
  window.TribeVisuals = { show, load: loadScreens, upload, state: () => st, diff };
})();
