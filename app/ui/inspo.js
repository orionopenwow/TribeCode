// The inspiration board (v0.25), on the dashboard: drop pictures, paste a Pinterest board or pin, a Dribbble shot, any
// gallery or site, a Google Fonts link or just a font name. Colors are measured right here in the browser (canvas +
// k-means on the picture), fonts are read from the page, and "Dress it up" puts the palette and font on the website and
// in design/inspiration.css for the app or game (server/inspo.js). No AI needed.
// window.TribeInspo = { draw(pid), addLink(url), addFiles(files), apply(to) }
(function () {
  'use strict';
  const C = () => window.TribeClient, A = () => window.TribeApp;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => A() && A().toast && A().toast(t);
  const pid = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C() && C().project()) || '';
  let st = null, busy = false, blobs = new Map();

  // ---------- colors from a picture: draw it small, k-means the pixels, keep the strong clusters ----------
  function paletteOf(img, k = 6) {
    const cv = document.createElement('canvas'), W = 64, H = Math.max(8, Math.round(64 * (img.naturalHeight || img.height || 64) / (img.naturalWidth || img.width || 64)));
    cv.width = W; cv.height = Math.min(H, 128); const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, cv.width, cv.height);
    let d; try { d = g.getImageData(0, 0, cv.width, cv.height).data; } catch { return []; }
    const px = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
    if (!px.length) return [];
    let cents = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) * px.length / k)].slice());
    let lab = new Array(px.length).fill(0);
    for (let it = 0; it < 10; it++) {
      for (let i = 0; i < px.length; i++) { let best = 0, bd = 1e9; for (let c = 0; c < k; c++) { const a = px[i], b = cents[c], dd = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (dd < bd) { bd = dd; best = c; } } lab[i] = best; }
      const sum = cents.map(() => [0, 0, 0, 0]); px.forEach((p, i) => { const s = sum[lab[i]]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
      cents = sum.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[c]));
    }
    const counts = cents.map((_, c) => lab.filter(x => x === c).length);
    return cents.map((c, i) => ({ c: '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(), n: counts[i] }))
      .filter(x => x.n > px.length * 0.03).sort((a, b) => b.n - a.n).map(x => x.c);
  }
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  async function proxied(u) {   // pictures from links come through the tribe's own server (no third-party requests from your browser)
    if (blobs.has(u)) return blobs.get(u);
    const s = window.TribeStore && window.TribeStore.get(), tok = s && s.server && s.server.token;
    const r = await fetch(C().base() + '/api/embeds/img?u=' + encodeURIComponent(u), { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    if (!r.ok) throw new Error('no picture'); const url = URL.createObjectURL(await r.blob()); blobs.set(u, url); return url;
  }
  async function thumbOf(file) {
    const url = URL.createObjectURL(file); const im = await loadImg(url);
    const s = Math.min(1, 360 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(im.naturalWidth * s)); cv.height = Math.max(1, Math.round(im.naturalHeight * s)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    let q = 0.82, out = cv.toDataURL('image/jpeg', q); while (out.length > 150 * 1024 && q > 0.4) { q -= 0.12; out = cv.toDataURL('image/jpeg', q); }
    const colors = paletteOf(im); URL.revokeObjectURL(url); return { thumb: out, colors };
  }

  // ---------- server ----------
  const api = (p, o) => C().api(p, o);
  async function load(p) { try { st = await api('/inspo?project=' + encodeURIComponent(p)); } catch { st = null; } return st; }
  async function addLink(url) {
    url = String(url || '').trim(); if (!url) return;
    if (!/^https?:\/\//i.test(url)) { if (/\s|^[a-z][a-z0-9 -]{1,40}$/i.test(url) && !/\./.test(url)) return addFont(url); url = 'https://' + url; }
    busy = true; paint();
    try {
      const r = await api('/inspo/link', { method: 'POST', body: { project: pid(), url } }); st = r;
      toast(`Added ${r.item.pinterest ? 'the Pinterest board' : r.item.title || r.item.site}: ${r.item.images.length} picture${r.item.images.length === 1 ? '' : 's'}${r.item.fonts.length ? `, fonts ${r.item.fonts.join(', ')}` : ''}`);
      measure(r.item);
    } catch (e) { toast('Couldn\'t add that: ' + e.message); }
    busy = false; paint();
  }
  async function measure(item) {   // a link's pictures: measure their colors here and send them back
    const cols = [];
    for (const u of (item.images || []).slice(0, 5)) { try { const im = await loadImg(await proxied(u)); paletteOf(im, 5).forEach(c => cols.push(c)); } catch {} }
    if (!cols.length) return;
    try { st = await api('/inspo/' + item.id, { method: 'PATCH', body: { project: pid(), colors: [...new Set([...cols, ...(item.colors || [])])].slice(0, 8) } }); paint(); } catch {}
  }
  async function addFiles(files) {
    const imgs = [...files].filter(f => /^image\//.test(f.type)).slice(0, 12); if (!imgs.length) return;
    busy = true; paint();
    for (const f of imgs) { try { const t = await thumbOf(f); st = await api('/inspo/image', { method: 'POST', body: { project: pid(), name: f.name.replace(/\.[^.]+$/, ''), ...t } }); paint(); } catch (e) { toast(`${f.name}: ${e.message}`); } }
    busy = false; paint(); toast(`Added ${imgs.length} picture${imgs.length === 1 ? '' : 's'} to the board`);
  }
  async function addFont(name) { try { st = await api('/inspo/font', { method: 'POST', body: { project: pid(), name } }); paint(); toast(`Added the font “${name}”`); } catch (e) { toast(e.message); } }
  async function apply(to = 'both') {
    try { const r = await api('/inspo/apply', { method: 'POST', body: { project: pid(), to } }); st = r; paint(); toast(`🎨 Dressed up: ${r.changed.join(', ')}`); return r; } catch (e) { toast(e.message); return null; }
  }
  async function shuffle() { try { st = await api('/inspo/apply', { method: 'POST', body: { project: pid(), shuffle: 'only' } }); paint(); } catch (e) { toast(e.message); } }
  async function remove(id) { try { st = await api('/inspo/' + id + '?project=' + encodeURIComponent(pid()), { method: 'DELETE' }); paint(); } catch (e) { toast(e.message); } }

  // ---------- the card ----------
  const ROLE = [['bg', 'Background'], ['surface', 'Surface'], ['text', 'Text'], ['accent', 'Accent'], ['accent2', 'Accent 2']];
  function html() {
    const items = (st && st.items) || [], pal = st && st.palette, f = st && st.font;
    const tile = it => `<figure class="ib-item" data-ib="${esc(it.id)}">${it.kind === 'image' ? `<img src="${esc(it.thumb)}" alt="">` : it.kind === 'font' ? `<span class="ib-font">Aa<small>${esc(it.title)}</small></span>` : `<span class="ib-link" data-imgs="${esc((it.images || []).slice(0, 4).join(' '))}">${(it.images || []).length ? '' : `<b>${esc(it.site || '')}</b>`}</span>`}
      <figcaption><b>${esc(it.title || '')}</b><small>${it.kind === 'link' ? esc(it.site || '') : it.kind === 'font' ? 'font' : 'picture'}</small>${(it.colors || []).length ? `<span class="ib-dots">${it.colors.slice(0, 5).map(c => `<i style="background:${esc(c)}"></i>`).join('')}</span>` : ''}</figcaption>
      <button class="ib-x" data-ib-x="${esc(it.id)}" title="Take it off the board" aria-label="Remove">×</button></figure>`;
    return `<section class="card ib-card" id="pj-board" aria-label="Inspiration board">
      <div class="ib-head"><div><span class="eyebrow">🎨 Inspiration board</span><h3>Show what you like. Flint dresses up ${esc(((C().state().projects || []).find(p => p.id === pid()) || {}).name || 'the project')}.</h3></div>
        ${items.length ? `<span class="ib-n">${items.length} on the board</span>` : ''}</div>
      <div class="ib-drop ${busy ? 'busy' : ''}" id="ib-drop" tabindex="0" role="button" aria-label="Drop pictures, or paste a link">
        <span class="ib-drop-ic" aria-hidden="true">${busy ? '⏳' : '📌'}</span>
        <div><b>${busy ? 'Reading it…' : 'Drop pictures here, or paste a link'}</b><small>Pinterest boards and pins, Dribbble, Behance, Instagram posts, any website or gallery, Google Fonts, or a font name like “Fraunces” or “pixel”. Making your own art? <a href="https://getartcraft.com/" target="_blank" rel="noopener">ArtCraft</a> is a free, open-source studio for it.</small></div>
        <form class="ib-form" id="ib-form"><input class="input" id="ib-url" placeholder="https://pinterest.com/…  or  a font name" autocomplete="off" aria-label="A link or a font name"><button class="btn" type="submit">Add</button><button class="btn" type="button" id="ib-pick">Pictures…</button></form></div>
      ${items.length ? `<div class="ib-grid">${items.map(tile).join('')}</div>` : ''}
      ${pal ? `<div class="ib-result"><div class="ib-pal">${ROLE.map(([k, l]) => `<div class="ib-sw" style="--c:${esc(pal[k])}"><i></i><span><b>${l}</b><code>${esc(pal[k])}</code></span></div>`).join('')}</div>
        <div class="ib-preview" style="--b:${esc(pal.bg)};--s:${esc(pal.surface)};--t:${esc(pal.text)};--a:${esc(pal.accent)};--a2:${esc(pal.accent2)}"><span class="ib-pv-h ${f && /fraunces|instrument/.test(f.pair) ? 'serif' : f && f.pair === 'silkscreen' ? 'pixel' : f && f.pair === 'mono' ? 'mono' : ''}">${esc(((C().state().projects || []).find(p => p.id === pid()) || {}).name || 'Your project')}</span><span class="ib-pv-p">How it would look, from your board.</span><span class="ib-pv-row"><i>Play</i><em>Learn more</em></span></div>
        <p class="ib-font-line">Font: <b>${esc(f ? ({ fraunces: 'Fraunces (serif)', instrument: 'Instrument Serif', grotesk: 'Space Grotesk', mono: 'JetBrains Mono', bricolage: 'Bricolage Grotesque', silkscreen: 'Silkscreen (pixel)' }[f.pair] || f.pair) : '')}</b> <span class="faint">from ${esc(f ? f.from : '')}</span></p>
        <div class="ib-acts"><button class="btn primary" data-ib-apply="both">🎨 Dress it up</button><button class="btn" data-ib-apply="site">Website only</button><button class="btn" data-ib-apply="app">App or game only</button><button class="linkish" id="ib-shuffle">Shuffle the accents</button></div>
        ${st.applied ? `<p class="faint ib-applied">Last dressed up ${new Date(st.applied.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</p>` : ''}</div>` : ''}
    </section>`;
  }
  function paint() {
    const slot = document.getElementById('pj-board-slot'); if (!slot) return;
    slot.innerHTML = html();
    const drop = slot.querySelector('#ib-drop'), form = slot.querySelector('#ib-form');
    ['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', ev => { const dt = ev.dataTransfer; if (dt.files && dt.files.length) return addFiles(dt.files); const u = dt.getData('text/uri-list') || dt.getData('text/plain'); if (u) addLink(u.split('\n')[0]); });
    drop.addEventListener('paste', ev => { const f = [...(ev.clipboardData.files || [])]; if (f.length) { ev.preventDefault(); addFiles(f); } });
    form.onsubmit = e => { e.preventDefault(); const v = slot.querySelector('#ib-url').value; slot.querySelector('#ib-url').value = ''; addLink(v); };
    slot.querySelector('#ib-pick').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true; i.onchange = () => addFiles(i.files); i.click(); };
    slot.querySelectorAll('[data-ib-x]').forEach(b => b.onclick = () => remove(b.dataset.ibX));
    slot.querySelectorAll('[data-ib-apply]').forEach(b => b.onclick = () => apply(b.dataset.ibApply));
    const sh = slot.querySelector('#ib-shuffle'); if (sh) sh.onclick = shuffle;
    slot.querySelectorAll('.ib-link[data-imgs]').forEach(async el => { const us = el.dataset.imgs.split(' ').filter(Boolean); for (const [i, u] of us.entries()) { try { const src = await proxied(u); if (!el.isConnected) return; const im = document.createElement('img'); im.src = src; im.alt = ''; im.className = 'ib-m' + i; el.appendChild(im); } catch {} } });
  }
  let stPid = '';
  async function draw(p) { p = p || pid(); if (!document.getElementById('pj-board-slot')) return; if (st && stPid === p) paint(); stPid = p; await load(p); if (stPid === p) paint(); }
  if (C() && C().on) C().on('ws', m => { if (m && m.type === 'inspo' && m.project === pid()) draw(); });
  window.TribeInspo = { draw, addLink, addFiles, addFont, apply, paletteOf };
})();
