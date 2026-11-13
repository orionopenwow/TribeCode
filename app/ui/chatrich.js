// Rich chat messages (feat/chat2): pictures in a small grid with a viewer, link previews, click-to-load YouTube /
// Vimeo, pictures and GIFs linked by URL, the GIF picker, and Settings › Chat.
// Safety: every string is escaped; only http(s) links are ever linked or fetched; previews and linked pictures come
// through the host's server (server/embeds.js: SSRF-checked fetch + picture proxy), so friends' browsers never load
// third-party content until someone clicks Play on a video (then a sandboxed youtube-nocookie / Vimeo frame).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient, S = window.TribeStore;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const token = () => (S.get().server && S.get().server.token) || '';
  const cur = () => (window.TribeDM ? window.TribeDM.current() : 'general');
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const signed = u => (window.TribeMedia ? window.TribeMedia.url(u) : u);   // fix/security-2: signed media links, not the sign-in key
  const proxy = u => signed(`${C.base()}/api/embeds/img?u=${encodeURIComponent(u)}`);
  const media = (ch, f) => signed(`${C.base()}/api/chat/${encodeURIComponent(ch)}/media/${encodeURIComponent(f)}`);

  // ---------- links ----------
  // http(s) links in plain text, without trailing punctuation (and a closing paren only when it opened inside).
  function urls(text) {
    const out = [];
    for (const m of String(text || '').matchAll(/\bhttps?:\/\/[^\s<>"'`]+/gi)) {
      let u = m[0];
      while (/[.,;:!?\]}*_~]$/.test(u) || (u.endsWith(')') && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length)) u = u.slice(0, -1);
      try { const x = new URL(u); if (x.protocol === 'http:' || x.protocol === 'https:') out.push(u); } catch {}
    }
    for (const m of String(text || '').matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi)) if (!out.includes(m[1])) out.push(m[1]);
    return out;
  }
  const IMG_EXT = /\.(png|jpe?g|gif|webp|avif)(\?[^#]*)?(#.*)?$/i;
  const isImageUrl = u => { try { const x = new URL(u); return IMG_EXT.test(x.pathname) || /^media\d*\.giphy\.com$/.test(x.hostname) || x.hostname === 'i.giphy.com'; } catch { return false; } };
  function video(u) {
    let x; try { x = new URL(u); } catch { return null; }
    const h = x.hostname.replace(/^(www|m)\./, '');
    let id = null;
    if (h === 'youtu.be') id = x.pathname.slice(1).split('/')[0];
    else if (h === 'youtube.com' || h === 'youtube-nocookie.com') id = x.searchParams.get('v') || (x.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1];
    if (id && /^[\w-]{6,20}$/.test(id)) return { kind: 'youtube', id, src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, site: 'YouTube' };
    if (h === 'vimeo.com' || h === 'player.vimeo.com') { const v = (x.pathname.match(/\/(?:video\/)?(\d{5,12})(?:\/|$)/) || [])[1]; if (v) return { kind: 'vimeo', id: v, src: `https://player.vimeo.com/video/${v}?autoplay=1&dnt=1`, site: 'Vimeo' }; }
    return null;
  }

  // ---------- what chatx.js puts in a message ----------
  // A message whose whole text is one picture / GIF link shows just the picture ("only").
  function parts(m, ch) {
    if (!m || m.vote || m.gist || m.deleted) return { html: '', only: false };
    const list = urls(m.text), text = String(m.text || '').trim();
    if (list.length === 1 && text === list[0] && isImageUrl(list[0])) return { html: linkedImage(list[0]), only: true };
    const out = [];
    for (const u of list.slice(0, 3)) {
      if (out.length >= 2) break;
      const v = video(u);
      if (v) out.push(`<div class="emb emb-vid" data-vid="${esc(v.src)}"><button type="button" class="emb-play" aria-label="Play ${esc(v.site)} video (loads ${esc(v.site)})"><span class="emb-pl" aria-hidden="true">▶</span><span class="emb-t"><b data-emb-title>${esc(v.site)} video</b><small>Click to load from ${esc(v.site)}</small></span></button><a class="emb-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">Open on ${esc(v.site)}</a><i hidden data-emb-url="${esc(u)}"></i></div>`);
      else if (isImageUrl(u)) out.push(linkedImage(u));
      else out.push(`<div class="emb emb-link" data-emb="${esc(u)}" hidden></div>`);
    }
    return { html: out.join(''), only: false };
  }
  const linkedImage = u => `<button type="button" class="thumb emb-img" data-full="${esc(proxy(u))}" data-src-url="${esc(u)}"><img src="${esc(proxy(u))}" alt="Picture from ${esc(hostOf(u))}" loading="lazy" referrerpolicy="no-referrer"></button>`;
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'a link'; } };
  // Several pictures in one message: a small grid (2 = side by side, 3 = one tall + two, 4+ = 2 by 2 with "+n").
  function grid(m, ch) {
    const imgs = Array.isArray(m.images) ? m.images.filter(x => x && x.file) : [];
    if (!imgs.length) return '';
    const shown = imgs.slice(0, 4), more = imgs.length - shown.length;
    return `<div class="igrid n${shown.length}" data-n="${imgs.length}">${shown.map((x, i) => `<button type="button" class="thumb ig" data-full="${esc(media(ch, x.file))}" data-i="${i}"><img src="${esc(media(ch, x.file))}" alt="Picture ${i + 1} of ${imgs.length}" loading="lazy">${i === 3 && more > 0 ? `<span class="ig-more">+${more}</span>` : ''}</button>`).join('')}`
      + `${imgs.slice(4).map((x, i) => `<span hidden class="ig-rest" data-full="${esc(media(ch, x.file))}" data-i="${i + 4}"></span>`).join('')}</div>`;
  }

  // ---------- previews: filled in after the message is on the page ----------
  const cache = new Map(); let previewsOff = false;
  async function fetchPreview(u) {
    if (cache.has(u)) return cache.get(u);
    const p = C.api('/embeds?url=' + encodeURIComponent(u)).then(r => { if (r.off) { previewsOff = true; return null; } return r.preview || null; }).catch(() => null);
    cache.set(u, p); return p;
  }
  async function hydrate(el) {
    el.dataset.h = '1';
    if (previewsOff) return;
    if (el.classList.contains('emb-vid')) {
      const u = (el.querySelector('[data-emb-url]') || {}).dataset; const p = u && await fetchPreview(u.embUrl);
      if (p && p.title) { const t = el.querySelector('[data-emb-title]'); if (t) t.textContent = p.title; }
      return;
    }
    const u = el.dataset.emb, p = await fetchPreview(u);
    if (!p || !el.isConnected) return;
    if (p.kind === 'image') { el.outerHTML = linkedImage(u); return; }
    if (p.kind !== 'page' || !(p.title || p.description)) return;
    el.innerHTML = `<a class="emb-card" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="emb-tx"><small class="emb-site">${esc(p.site || hostOf(u))}</small><b>${esc(p.title || hostOf(u))}</b>${p.description ? `<span class="emb-d">${esc(p.description)}</span>` : ''}</span>${p.image ? `<img class="emb-im" src="${esc(proxy(p.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</a>`;
    const im = el.querySelector('.emb-im'); if (im) im.onerror = () => im.remove();
    el.hidden = false;
  }
  let pending = false;
  function scan() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; document.querySelectorAll('.chat .emb:not([data-h])').forEach(hydrate); }); }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });

  // Play: swap the card for the provider's frame (sandboxed, no referrer).
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.emb-vid .emb-play'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const box = b.closest('.emb-vid'), src = box.dataset.vid;
    if (!/^https:\/\/(www\.youtube-nocookie\.com\/embed\/[\w-]+|player\.vimeo\.com\/video\/\d+)\?/.test(src)) return;
    box.innerHTML = `<iframe src="${esc(src)}" title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"></iframe>`;
    box.classList.add('playing');
  }, true);

  // ---------- picture viewer ----------
  function viewer(srcs, at = 0) {
    const old = $('#pv'); if (old) old.remove();
    let i = Math.max(0, Math.min(srcs.length - 1, at));
    const d = document.createElement('div'); d.id = 'pv'; d.className = 'modal pv'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Picture');
    const draw = () => {
      d.innerHTML = `<img src="${esc(srcs[i])}" alt="Picture ${i + 1} of ${srcs.length}"><button class="pv-x" aria-label="Close">✕</button>`
        + (srcs.length > 1 ? `<button class="pv-nav pv-prev" aria-label="Previous">‹</button><button class="pv-nav pv-next" aria-label="Next">›</button><span class="pv-n">${i + 1} / ${srcs.length}</span>` : '');
    };
    draw();
    d.addEventListener('click', e => {
      if (e.target.closest('.pv-prev')) { i = (i + srcs.length - 1) % srcs.length; return draw(); }
      if (e.target.closest('.pv-next')) { i = (i + 1) % srcs.length; return draw(); }
      if (e.target.tagName !== 'IMG') d.remove();
    });
    const key = e => { if (!d.isConnected) return removeEventListener('keydown', key, true); if (e.key === 'Escape') { e.stopPropagation(); d.remove(); } if (e.key === 'ArrowLeft' && srcs.length > 1) { i = (i + srcs.length - 1) % srcs.length; draw(); } if (e.key === 'ArrowRight' && srcs.length > 1) { i = (i + 1) % srcs.length; draw(); } };
    addEventListener('keydown', key, true);
    document.body.appendChild(d); d.querySelector('.pv-x').focus();
  }
  // The pictures a thumb belongs to (its grid, else just itself).
  function open(th) {
    const g = th.closest('.igrid');
    if (!g) return viewer([th.dataset.full]);
    const all = [...g.querySelectorAll('[data-full]')].sort((a, b) => a.dataset.i - b.dataset.i);
    viewer(all.map(x => x.dataset.full), Number(th.dataset.i) || 0);
  }

  // ---------- sending pictures (paste, drop, the picker) ----------
  const MAX = 6 * 1024 * 1024;
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  async function sendImages(files, ch = cur()) {
    files = [...files].filter(f => /^image\/(png|jpeg|gif|webp)$/.test(f.type));
    if (!files.length) return toast('PNG, JPEG, GIF or WebP pictures only.');
    if (files.length > 6) { toast('Up to 6 pictures at a time. Sending the first 6.'); files = files.slice(0, 6); }
    const big = files.find(f => f.size > MAX); if (big) return toast(`${big.name || 'That picture'} is over 6 MB.`);
    const inp = $('#chat-input'), text = inp ? inp.value.trim() : '';
    try {
      const items = await Promise.all(files.map(async f => ({ data: await toB64(f), mime: f.type })));
      if (items.length === 1) await C.api(`/chat/${ch}/image`, { method: 'POST', body: { ...items[0], text } });
      else await C.api(`/chat/${ch}/images`, { method: 'POST', body: { items, text } });
      if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    } catch (err) { toast(err.message); }
  }
  // Drop pictures anywhere on the chat column.
  document.addEventListener('dragover', e => { if (!e.target.closest || !e.target.closest('#view-chat') || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); document.body.classList.add('chat-drop'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest('#view-chat'))) document.body.classList.remove('chat-drop'); });
  document.addEventListener('drop', e => {
    document.body.classList.remove('chat-drop');
    if (!e.target.closest || !e.target.closest('#view-chat') || !e.dataTransfer) return;
    const files = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type)); if (!files.length) return;
    e.preventDefault(); e.stopPropagation(); sendImages(files);
  }, true);

  // ---------- GIF picker ----------
  let gifCfg = null;
  async function gifSettings() { if (gifCfg) return gifCfg; try { gifCfg = await C.api('/gifs/settings'); } catch { gifCfg = { provider: null }; } return gifCfg; }
  async function sendText(text) { try { await C.api(`/chat/${cur()}/send`, { method: 'POST', body: { text } }); } catch (e) { toast(e.message); } }
  function closeGif() { const p = $('#gif-pick'); if (p) p.remove(); }
  async function gifPicker(anchor) {
    if ($('#gif-pick')) return closeGif();
    const cfg = await gifSettings(), canSearch = cfg.provider === 'giphy';
    const p = document.createElement('div'); p.id = 'gif-pick'; p.className = 'gif-pick'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Send a GIF');
    p.innerHTML = `<div class="gp-tabs" role="tablist">${canSearch ? '<button role="tab" data-gt="search" aria-selected="true">Search</button>' : ''}<button role="tab" data-gt="mine" aria-selected="${!canSearch}">Your GIFs</button><button class="gp-x" aria-label="Close">✕</button></div>
      ${canSearch ? '<input class="input gp-q" id="gp-q" placeholder="Search GIPHY" autocomplete="off" maxlength="50">' : ''}
      <div class="gp-grid" id="gp-grid"></div>
      <form class="gp-link" id="gp-link"><input class="input" id="gp-url" placeholder="Paste a GIF link (https://…)" autocomplete="off" inputmode="url"><button class="btn sm" type="submit">Send</button></form>
      ${canSearch ? '<div class="gp-attr">Powered by GIPHY</div>' : '<div class="gp-attr">GIF search is off. The host can add a GIPHY key in Settings › Chat.</div>'}`;
    document.body.appendChild(p);
    if (!phone() && anchor) { const r = anchor.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.right - p.offsetWidth)) + 'px'; p.style.top = Math.max(8, r.top - p.offsetHeight - 8) + 'px'; }
    const grid = p.querySelector('#gp-grid');
    const cell = (src, send, label) => `<button type="button" class="gp-c" data-send="${esc(send)}" aria-label="${esc(label || 'Send this GIF')}"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`;
    const showMine = async () => {
      grid.innerHTML = '<p class="gp-empty">Loading…</p>';
      try {
        const gifs = (await C.api('/gifs/mine')).gifs || [];
        grid.innerHTML = gifs.length ? gifs.map(g => g.kind === 'file' ? cell(media(g.ch, g.file), 'file:' + g.ch + ':' + g.file, 'Send this GIF again') : cell(proxy(g.url), g.url)).join('') : '<p class="gp-empty">GIFs shared in this project show up here. Drop a .gif in the chat or paste a link below.</p>';
      } catch (e) { grid.innerHTML = `<p class="gp-empty">${esc(e.message)}</p>`; }
    };
    let t = null;
    const search = async q => {
      if (!q) { grid.innerHTML = '<p class="gp-empty">Type to search.</p>'; return; }
      grid.innerHTML = '<p class="gp-empty">Searching…</p>';
      try { const gifs = (await C.api('/gifs/search?q=' + encodeURIComponent(q))).gifs || []; grid.innerHTML = gifs.length ? gifs.map(g => cell(proxy(g.preview), g.url, g.title)).join('') : '<p class="gp-empty">No GIFs for that.</p>'; }
      catch (e) { grid.innerHTML = `<p class="gp-empty">${esc(e.message)}</p>`; }
    };
    const tab = k => { p.querySelectorAll('[data-gt]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.gt === k))); const q = p.querySelector('#gp-q'); if (q) q.hidden = k !== 'search'; if (k === 'mine') showMine(); else search(q ? q.value.trim() : ''); };
    p.addEventListener('click', async e => {
      if (e.target.closest('.gp-x')) return closeGif();
      const tb = e.target.closest('[data-gt]'); if (tb) return tab(tb.dataset.gt);
      const c = e.target.closest('[data-send]'); if (!c) return;
      const v = c.dataset.send; closeGif();
      if (v.startsWith('file:')) {   // a GIF file from this project: send it again as a picture
        const [, ch, f] = v.split(':');
        try { const blob = await (await fetch(window.TribeMedia ? await window.TribeMedia.urlAsync(media(ch, f)) : media(ch, f))).blob(); await sendImages([new File([blob], 'gif.gif', { type: 'image/gif' })]); } catch (err) { toast(err.message); }
      } else sendText(v);
    });
    const q = p.querySelector('#gp-q'); if (q) { q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => search(q.value.trim()), 300); }); }
    p.querySelector('#gp-link').addEventListener('submit', e => {
      e.preventDefault(); const u = p.querySelector('#gp-url').value.trim();
      let ok = false; try { ok = /^https?:$/.test(new URL(u).protocol); } catch {}
      if (!ok) return toast('Paste an http(s) link to a GIF.');
      closeGif(); sendText(u);
    });
    tab(canSearch ? 'search' : 'mine');
    setTimeout(() => (q || p.querySelector('#gp-url')).focus({ preventScroll: true }), 0);
  }
  document.addEventListener('mousedown', e => { const p = $('#gif-pick'); if (p && !(e.target.closest && (e.target.closest('#gif-pick') || e.target.closest('.cx-gif, [data-plus="gif"]')))) closeGif(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGif(); });

  // ---------- Settings › Chat ----------
  async function mountSettings(el) {
    const host = (C.state().me || {}).role === 'host';
    let prev = { previews: true }, g = { provider: null, hasKey: false };
    try { [prev, g] = await Promise.all([C.api('/embeds/settings'), C.api('/gifs/settings')]); } catch {}
    const bgOn = !(window.TribeChannels && window.TribeChannels.bgOff());
    el.innerHTML = `<div class="sc-rows">
      <div class="sc-r"><span>Link previews</span><button class="toggle set-toggle" role="switch" id="sc-prev" aria-label="Link previews" aria-checked="${prev.previews !== false}" ${host ? '' : 'disabled'}><span class="switch"></span></button></div>
      <div class="sc-r"><span>Chat backgrounds on this device</span><button class="toggle set-toggle" role="switch" id="sc-bg" aria-label="Chat backgrounds on this device" aria-checked="${bgOn}"><span class="switch"></span></button></div>
      ${host ? `<div class="sc-r sc-key"><span>GIF search <small>${g.hasKey ? 'GIPHY key saved on this computer' : 'Add a free GIPHY API key (developers.giphy.com)'}</small></span><span class="sc-kin"><input class="input" id="sc-key" type="password" autocomplete="off" placeholder="${g.hasKey ? '••••••••' : 'GIPHY API key'}"><button class="btn sm" id="sc-key-save">${g.hasKey ? 'Replace' : 'Save'}</button>${g.hasKey ? '<button class="btn sm" id="sc-key-rm">Remove</button>' : ''}</span></div>` : `<p class="faint sc-note">${g.provider ? 'GIF search is on.' : 'GIF search is off; the host can turn it on.'}${prev.previews === false ? ' The host turned link previews off.' : ''}</p>`}
    </div>`;
    const pv = el.querySelector('#sc-prev');
    if (pv && host) pv.onclick = async () => { try { const r = await C.api('/embeds/settings', { method: 'PATCH', body: { previews: pv.getAttribute('aria-checked') !== 'true' } }); pv.setAttribute('aria-checked', String(r.previews)); previewsOff = !r.previews; cache.clear(); } catch (e) { toast(e.message); } };
    el.querySelector('#sc-bg').onclick = e => { const T = window.TribeChannels; if (!T) return; const on = T.bgOff(); T.setBgOff(!on); e.currentTarget.setAttribute('aria-checked', String(on)); };
    const save = async key => { try { await C.api('/gifs/settings', { method: 'PATCH', body: { key } }); gifCfg = null; toast(key ? 'GIF search is on' : 'GIPHY key removed'); mountSettings(el); } catch (e) { toast(e.message); } };
    const ks = el.querySelector('#sc-key-save'); if (ks) ks.onclick = () => { const v = el.querySelector('#sc-key').value.trim(); if (v) save(v); };
    const kr = el.querySelector('#sc-key-rm'); if (kr) kr.onclick = () => save('');
  }
  C.on('hello', () => { gifCfg = null; previewsOff = false; cache.clear(); });

  window.TribeChatRich = { parts, grid, urls, isImageUrl, video, viewer, open, sendImages, gifPicker, closeGif, mountSettings, proxy };
})();
