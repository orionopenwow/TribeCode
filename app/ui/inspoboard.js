// Your inspiration board (feat/flint-ai): a Pinterest-like board of genuine, openly licensed pictures and sounds, per
// person (and per project), that Flint reads to adapt your style. Search Openverse (CC-licensed images and audio) or
// Wikimedia Commons, save to the board (the server keeps a copy of the thumbnail or sound preview: no hotlinking, and
// the license, creator and attribution are stored and shown), see it as a masonry grid with sound players, and press
// "✦ Use my board's style": the board's palette becomes your accent (fitted to your theme), and in a project the
// website's brand kit and design/inspiration.css follow (server/inspo.js apply). Works on this computer with no tribe
// (a local you). Offline, search says so and the board still works.
//   window.TribeInspoBoard = { open({ q, type, board }), close(), search(q, type), save(ref), useStyle(), state() }
(function () {
  'use strict';
  const C = () => window.TribeClient, S = () => window.TribeStore;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(t);
  const src = u => (u ? (C() ? C().base() : '') + u : '');
  const connected = () => !!(C() && C().connected && C().connected());
  const pid = () => (connected() && window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || '';
  const pname = () => { const p = ((C() && C().state().projects) || []).find(x => x.id === pid()); return p ? p.name : ''; };
  const st = { board: 'me', q: '', type: 'image', source: 'openverse', results: null, busy: false, view: null, note: '', applied: '', freesound: false };
  // polish: Freesound is a sound source once the host set its API key (server-side only; we only learn whether there is one)
  async function fsCheck() { try { st.freesound = !!(await C().api('/inspo/freesound')).configured; } catch { st.freesound = false; } }
  const api = (p, o) => C().api(p, o);
  const qb = () => (st.board === 'me' ? 'board=me' : 'project=' + encodeURIComponent(st.board));

  async function load() { try { st.view = await api('/inspo?' + qb()); } catch (e) { st.view = st.view || { items: [] }; st.note = st.note || e.message; } draw(); return st.view; }
  async function search(q, type) {
    if (q != null) st.q = String(q).trim(); if (type) st.type = type === 'audio' || type === 'sound' ? 'audio' : 'image';
    if (!st.q) return;
    if (st.type === 'audio' && !(st.source === 'freesound' && st.freesound)) st.source = 'openverse';
    if (st.type === 'image' && st.source === 'freesound') st.source = 'openverse';
    st.busy = true; st.note = ''; draw();
    try { const r = await api(`/inspo/search?q=${encodeURIComponent(st.q)}&type=${st.type}&source=${st.source}&${qb()}`); st.results = r; if (r.offline) st.note = r.note; }
    catch (e) { st.results = { results: [] }; st.note = e.message; }
    st.busy = false; draw(); return st.results;
  }
  async function save(ref) {
    const r = ((st.results && st.results.results) || []).find(x => x.ref === ref);
    try { st.view = await api('/inspo/save?' + qb(), { method: 'POST', body: st.board === 'me' ? { board: 'me', ref } : { project: st.board, ref } }); toast(`Saved ${r ? `“${r.title}”` : 'it'} to the board, with its credit`); }
    catch (e) { toast(e.status === 409 ? 'Already on the board' : 'Couldn\'t save it: ' + e.message); }
    draw(); return st.view;
  }
  async function remove(id) { try { st.view = await api(`/inspo/${encodeURIComponent(id)}?${qb()}`, { method: 'DELETE' }); } catch (e) { toast(e.message); } draw(); }

  // ---------- Flint adapts your style ----------
  const okHex = c => /^#[0-9a-f]{6}$/i.test(c || '');
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
  function fit(accent) {   // nudge the board's accent until it reads on the theme you use (TribeLook's own 3:1 check)
    const L = window.TribeLook; if (!L || !L.check) return accent;
    const light = document.body.classList.contains('light'), to = light ? '#000000' : '#FFFFFF';
    for (let t = 0; t <= 0.9; t += 0.06) { const c = t ? mix(accent, to, t) : accent; if (!L.check('accent', c)) return c; }
    return null;
  }
  async function useStyle() {
    const v = st.view && st.view.style ? st.view : await load();
    if (!v || !v.style) { toast('Save a few pictures to the board first: Flint reads their colors.'); return null; }
    const done = [], acc = fit(v.style.accent) || fit(v.style.accent2);
    if (acc && S()) { S().set({ look: { ...(S().get().look || {}), accent: acc } }); if (window.TribeLook && window.TribeLook.apply) await window.TribeLook.apply(); done.push(`your accent is ${acc}`); }
    const p = pid();
    if (p && connected()) {
      try { const r = await api('/inspo/apply', { method: 'POST', body: { project: p, to: 'both', ...(st.board === 'me' ? { from: 'me' } : {}) } }); if (r.changed && r.changed.length) done.push(`${pname() || 'the project'}: ${r.changed.join(', ')}`); if (window.TribePreview && window.TribePreview.reload) try { window.TribePreview.reload(); } catch {} }
      catch (e) { done.push(`the project stayed as it was (${e.message})`); }
    }
    st.applied = done.length ? `Done: ${done.join('; ')}. Fonts to pair: ${v.style.fonts.join(' + ')}.` : 'Nothing to change.';
    draw(); toast('✦ ' + st.applied); return { accent: acc, style: v.style, changed: done };
  }

  // ---------- view ----------
  const credit = it => `<p class="ibd-cred">${it.creator ? `by ${it.creatorUrl ? `<a href="${esc(it.creatorUrl)}" target="_blank" rel="noopener noreferrer">${esc(it.creator)}</a>` : esc(it.creator)} · ` : ''}${it.licenseUrl ? `<a class="ibd-lic" href="${esc(it.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(it.license)}</a>` : `<span class="ibd-lic">${esc(it.license || '')}</span>`}${it.landing ? ` · <a href="${esc(it.landing)}" target="_blank" rel="noopener noreferrer">source${it.provider ? ` (${esc(it.provider)})` : ''}</a>` : it.provider ? ` · ${esc(it.provider)}` : ''}</p>`;
  const sound = (u, title) => `<div class="ibd-snd"><span class="ibd-snd-ic" aria-hidden="true">♪</span><audio controls preload="none" src="${esc(src(u))}" aria-label="Play ${esc(title)}"></audio></div>`;
  function resultHtml(r) {
    const saved = ((st.view && st.view.items) || []).some(x => x.ref === r.ref);
    return `<figure class="ibd-tile ${r.kind}" data-ref="${esc(r.ref)}">${r.kind === 'sound' ? sound(r.preview, r.title) : `<img src="${esc(src(r.thumb))}" alt="${esc(r.title)}" loading="lazy">`}
      <figcaption><b>${esc(r.title)}</b>${credit(r)}<button class="btn sm ${saved ? '' : 'primary'} ibd-save" data-save="${esc(r.ref)}" ${saved ? 'disabled' : ''}>${saved ? 'On your board' : 'Save'}</button></figcaption></figure>`;
  }
  function itemHtml(it) {
    const media = it.kind === 'sound' ? (it.preview ? sound(it.preview, it.title) : `<p class="faint">Plays on <a href="${esc(it.landing)}" target="_blank" rel="noopener noreferrer">its page</a></p>`)
      : it.kind === 'image' && (it.cached || it.thumb) ? `<img src="${esc(it.cached ? src(it.cached) : it.thumb)}" alt="${esc(it.title)}" loading="lazy">` : it.kind === 'font' ? `<span class="ibd-font">Aa</span>` : `<span class="ibd-link">${esc(it.site || '')}</span>`;
    return `<figure class="ibd-tile ${esc(it.kind)} on-board" data-id="${esc(it.id)}">${media}<figcaption><b>${esc(it.title || '')}</b>${it.license ? credit(it) : ''}
      ${(it.colors || []).length ? `<span class="ibd-dots">${it.colors.slice(0, 5).map(c => `<i style="background:${esc(c)}" title="${esc(c)}"></i>`).join('')}</span>` : ''}</figcaption>
      <button class="ibd-x" data-rm="${esc(it.id)}" aria-label="Take it off the board" title="Take it off the board">×</button></figure>`;
  }
  function html() {
    const v = st.view || { items: [] }, items = v.items || [], style = v.style, r = st.results;
    const tabs = !pid() ? '' : `<div class="ibd-tabs" role="tablist"><button role="tab" aria-selected="${st.board === 'me'}" data-board="me">Mine</button><button role="tab" aria-selected="${st.board === pid()}" data-board="${esc(pid())}">${esc(pname() || 'This project')}</button></div>`;
    return `<div class="ibd-in" role="dialog" aria-modal="true" aria-label="Inspiration board">
      <header class="ibd-head"><div><span class="eyebrow">Inspiration</span><h2>Your board</h2><p class="faint">Openly licensed pictures and sounds, credited. Flint reads the board to match your style.</p></div>${tabs}<button class="ibd-close" id="ibd-close" aria-label="Close">×</button></header>
      <form class="ibd-search" id="ibd-form" autocomplete="off"><input class="input" id="ibd-q" value="${esc(st.q)}" placeholder="${st.type === 'audio' ? 'Search sounds: coin, rain, crowd…' : 'Search pictures: dusk, forest, neon…'}" aria-label="Search">
        <div class="seg" role="group" aria-label="What"><button type="button" data-type="image" aria-pressed="${st.type === 'image'}">Pictures</button><button type="button" data-type="audio" aria-pressed="${st.type === 'audio'}">Sounds</button></div>
        ${st.type === 'image' ? `<select class="input ibd-src" id="ibd-src" aria-label="Source"><option value="openverse" ${st.source === 'openverse' ? 'selected' : ''}>Openverse</option><option value="wikimedia" ${st.source === 'wikimedia' ? 'selected' : ''}>Wikimedia Commons</option></select>`
          : st.freesound ? `<select class="input ibd-src" id="ibd-src" aria-label="Source"><option value="openverse" ${st.source === 'openverse' ? 'selected' : ''}>Openverse</option><option value="freesound" ${st.source === 'freesound' ? 'selected' : ''}>Freesound</option></select>` : ''}
        <button class="btn primary" type="submit" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Searching…' : 'Search'}</button></form>
      ${st.note ? `<p class="ibd-note" role="status">${esc(st.note)}</p>` : ''}
      ${r && r.results && r.results.length ? `<section class="ibd-sec" aria-label="Results"><div class="sec-head"><span class="eyebrow">From ${r.source === 'wikimedia' ? 'Wikimedia Commons' : r.source === 'freesound' ? 'Freesound' : 'Openverse'}</span><h3>${r.results.length} openly licensed ${r.type === 'audio' ? 'sounds' : 'pictures'}</h3></div><div class="ibd-grid" id="ibd-results">${r.results.map(resultHtml).join('')}</div></section>` : r && !st.busy && !st.note ? '<p class="faint ibd-note">Nothing found. Try another word.</p>' : ''}
      ${style ? `<section class="ibd-style hero-card" id="ibd-style" aria-label="Your style"><div><span class="eyebrow">Your style, from the board</span><h3>Accent ${esc(style.accent)} · ${esc(style.fonts[0])} + ${esc(style.fonts[1])}</h3>
          <div class="ibd-pal">${['bg', 'surface', 'text', 'accent', 'accent2'].map(k => `<span class="ibd-sw" style="--c:${esc(v.palette[k])}" title="${esc(k)} ${esc(v.palette[k])}"><i></i><code>${esc(v.palette[k])}</code></span>`).join('')}</div>
          ${st.applied ? `<p class="ibd-applied" role="status">${esc(st.applied)}</p>` : `<p class="faint">One tap: your accent everywhere${pid() ? `, plus ${esc(pname() || 'this project')}'s website and app preview` : ''}.</p>`}</div>
        <button class="btn primary" id="ibd-use">✦ Use my board's style</button></section>` : ''}
      <section class="ibd-sec" aria-label="Saved"><div class="sec-head"><span class="eyebrow">${st.board === 'me' ? 'Saved by you' : 'Saved for the project'}</span><h3>${items.length ? `${items.length} on the board` : 'Nothing saved yet'}</h3></div>
        ${items.length ? `<div class="ibd-grid ibd-board" id="ibd-board">${items.map(itemHtml).join('')}</div>` : '<p class="faint">Search above and press Save. Pictures give the board its colors; sounds are kept for your app or game.</p>'}</section>
    </div>`;
  }
  function draw() {
    const el = document.getElementById('ibd'); if (!el) return;
    const keep = document.activeElement && document.activeElement.id === 'ibd-q';
    el.innerHTML = html();
    const q = el.querySelector('#ibd-q'); if (keep && q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    el.querySelector('#ibd-close').onclick = close;
    el.querySelector('#ibd-form').onsubmit = e => { e.preventDefault(); search(el.querySelector('#ibd-q').value); };
    el.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { st.type = b.dataset.type; st.results = null; st.q ? search() : draw(); });
    const sel = el.querySelector('#ibd-src'); if (sel) sel.onchange = () => { st.source = sel.value; if (st.q) search(); };
    el.querySelectorAll('[data-board]').forEach(b => b.onclick = () => { st.board = b.dataset.board; st.applied = ''; load(); });
    el.querySelectorAll('[data-save]').forEach(b => b.onclick = () => { b.disabled = true; b.textContent = 'Saving…'; save(b.dataset.save); });
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => remove(b.dataset.rm));
    const u = el.querySelector('#ibd-use'); if (u) u.onclick = () => useStyle();
  }
  function open(o = {}) {
    let el = document.getElementById('ibd');
    if (!el) { el = document.createElement('div'); el.id = 'ibd'; el.className = 'ibd'; document.body.appendChild(el); }
    el.classList.remove('hidden'); document.body.classList.add('ibd-open');
    if (o.board) st.board = o.board; else if (st.board !== 'me' && st.board !== pid()) st.board = 'me';
    if (o.type) st.type = o.type === 'audio' || o.type === 'sound' ? 'audio' : 'image';
    draw(); load(); fsCheck().then(() => { if (el) draw(); });
    if (o.q) search(o.q); else setTimeout(() => { const q = el.querySelector('#ibd-q'); if (q && !matchMedia('(hover: none)').matches) q.focus(); }, 40);
  }
  function close() { const el = document.getElementById('ibd'); if (el) el.classList.add('hidden'); document.body.classList.remove('ibd-open'); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('ibd-open')) close(); });
  if (C() && C().on) C().on('ws', m => { if (m && m.type === 'inspo' && document.body.classList.contains('ibd-open') && (m.project === st.board || (st.view && m.project === st.view.board))) load(); });
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [{ kind: 'Action', label: 'Inspiration board: pictures and sounds', keys: 'inspiration board mood pinterest pictures images sounds sfx openverse style', icon: 'i-sparkle', run: () => open() }]);
  window.TribeInspoBoard = { open, close, search, save, useStyle, load, state: () => ({ ...st }) };
})();
