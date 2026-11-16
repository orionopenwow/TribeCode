// App Creator, the deeper tools (pass 4; docs/APP-CREATOR.md). The editor is app/ui/appcreator.js; this file adds what
// the website designer already had, the same way:
//   History    every save is kept (the last 30, plus named versions); see one and restore it (one Undo).
//   Comments   C, then click a part: a numbered pin with replies and Resolve. Any member can comment.
//   Several    Shift click selects several parts; move, duplicate, copy, cut and remove them together.
//   Clipboard  Ctrl C / X / V / D for parts and whole screens, across screens and projects (kept on this device).
//   Pictures   your own picture in any picture slot: pick a file, paste or drop. Made small and saved with the app.
//   Map        M: every screen as a thumbnail with arrows for the links; drag to arrange, zoom, fit; unreachable screens flagged.
//   Sizes      Tablet beside iPhone and Android; a light/dark peek that changes nothing.
//   Play       an app with working features (appfeatures.js) plays as the real exported app, in a frame.
//   ?          a sheet of the shortcuts that work.
// With no tribe everything is kept on this device. Nothing here needs an AI.
//   window.TribeAppPlus = { init(X), ... } where X is the editor's own small API (appcreator.js hands it over).
(function () {
  'use strict';
  let X = null;
  const st = () => X.st(), root = () => X.root(), A = () => window.TribeAppCore, C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => X.tr(s), ic = (n, z) => X.ic(n, z), note = t => X.note(t);
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
  const tribe = () => !!(st() && st().pid && X.connected());
  const api = (p, o) => C().api(`/projects/${encodeURIComponent(st().pid)}${p}`, o);
  const when = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const SVG = { map: '<rect x="3" y="4" width="6" height="9" rx="1.5"/><rect x="15" y="11" width="6" height="9" rx="1.5"/><path d="M9 8.5h3.5a2 2 0 0 1 2 2v2"/>', comment: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>', more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>', clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>', moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>', keys: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M7 10.5h.01M11 10.5h.01M15 10.5h.01M8 14h8"/>', copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5.5 15.5v-9a2 2 0 0 1 2-2h8"/>', cut: '<circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M8.5 15L17 5M15.5 15L7 5"/>', pic: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>', fit: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>', zin: '<path d="M12 6v12M6 12h12"/>', zout: '<path d="M6 12h12"/>' };
  const svg = (n, z) => SVG[n] ? `<svg class="apc-ic" width="${z || 16}" height="${z || 16}" viewBox="0 0 24 24" aria-hidden="true">${SVG[n]}</svg>` : ic(n, z);
  const typingNow = () => { const a = document.activeElement; return !!a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable); };

  // ---------- the top bar: Map, Comment and a More menu ----------
  function onBuild() {
    const r = root(), sp = r.querySelector('#apc-undo'); if (!sp || r.querySelector('#apc-more')) return;
    const seg = r.querySelector('.apc-top .apc-seg'); if (seg && !seg.querySelector('[data-dev]')) { const b = document.createElement('button'); b.dataset.dev = 'tablet'; b.textContent = 'Tablet'; seg.appendChild(b); b.onclick = () => setDevice('tablet'); }
    const wrap = document.createElement('span'); wrap.className = 'apc-plus';
    wrap.innerHTML = `<button class="apc-tb" id="apc-mapb" aria-label="Screen map" title="Screen map (M)" aria-pressed="false">${svg('map')}</button><button class="apc-tb" id="apc-cmb" aria-label="Comment" title="Comment (C)" aria-pressed="false">${svg('comment')}<span class="apc-cn" id="apc-cn" hidden></span></button>
      <span class="apc-menuw"><button class="apc-tb" id="apc-more" aria-label="More" title="More" aria-haspopup="true">${svg('more')}</button>
        <div class="apc-menu apc-moremenu" id="apc-moremenu" hidden>
          <button data-m="map" class="apc-m-phone"><b>Screen map</b><small>Every screen and the links between them.</small></button>
          <button data-m="comment" class="apc-m-phone"><b>Comment</b><small>Tap a part to leave a note on it.</small></button>
          <button data-m="history"><b>History</b><small>Earlier versions. See one and bring it back.</small></button>
          <button data-m="requests" data-cr-entry hidden><b>Suggested changes<span class="apc-n cr-n" data-cr-n hidden></span></b><small>What people asked to change, and what waits for you.</small></button>
          <button data-m="peek"><b id="apc-peek-l">Preview in dark</b><small>A look at the other mode. Nothing is changed.</small></button>
          <button data-m="size" class="apc-m-phone"><b>Phone or tablet</b><small id="apc-size-l"></small></button>
          <button data-m="keys" class="apc-m-desk"><b>Keyboard shortcuts</b><small>Press ? any time.</small></button>
        </div></span>`;
    (r.querySelector('#apc-redo') || sp).after(wrap);   // after Undo and Redo
    r.querySelector('#apc-mapb').onclick = () => toggleMap();
    r.querySelector('#apc-cmb').onclick = () => commentMode(!st().cmode);
    r.querySelector('#apc-more').onclick = e => { e.stopPropagation(); const m = r.querySelector('#apc-moremenu'); m.hidden = !m.hidden; const x = r.querySelector('#apc-menu'); if (x) x.hidden = true; paintTop(); };
    r.addEventListener('click', e => { if (!e.target.closest('.apc-plus .apc-menuw')) { const m = r.querySelector('#apc-moremenu'); if (m) m.hidden = true; } });
    r.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { r.querySelector('#apc-moremenu').hidden = true; const k = b.dataset.m;
      if (k === 'map') toggleMap(); else if (k === 'comment') commentMode(!st().cmode); else if (k === 'history') historySheet(); else if (k === 'peek') peek(); else if (k === 'keys') keysSheet();
      else if (k === 'size') { const d = st().doc, order = [['ios', 'phone'], ['android', 'phone'], ['ios', 'tablet']], i = order.findIndex(([p, dv]) => (dv === 'tablet') === (d.device === 'tablet') && (dv === 'tablet' || p === d.platform)); const n = order[(i + 1) % 3]; if (n[1] === 'tablet') setDevice('tablet'); else { if (d.device === 'tablet') setDevice('phone', true); X.apply({ op: 'platform', platform: n[0] }); } } });
    // someone who can change the app directly sees no strip, so the requests list is here (changes.js keeps the count)
    if (window.TribeChanges && window.TribeChanges.entry && st().pid) window.TribeChanges.entry(r.querySelector('#apc-moremenu [data-cr-entry]'), st().pid);
    // the strip above the editor can be hidden (cowork.js decides): the layout follows it
    const cr = r.querySelector('#apc-cr');
    if (cr) { const sync = () => r.classList.toggle('has-cr', !cr.hidden && cr.offsetHeight > 0); new MutationObserver(sync).observe(cr, { attributes: true, childList: true }); sync(); setTimeout(sync, 400); }
    // the phone refits whenever the space around it changes (the strip appearing, a panel, the window)
    const mid = r.querySelector('#apc-mid'); if (mid && window.ResizeObserver) { let t = 0; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (root() === r && st()) { X.fit(); if (st().sel) X.paintSel(); placePins(); } }, 30); }).observe(mid); }
    // your own pictures: drop a file on a picture, or paste one while a picture is selected
    r.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    r.addEventListener('drop', e => { const f = e.dataTransfer && [...e.dataTransfer.files].find(x => /^image\//.test(x.type)); if (!f) return; e.preventDefault(); const im = e.target.closest && e.target.closest('[data-img]'), b = e.target.closest && e.target.closest('[data-b]'); if (im && b) return setPicture(b.dataset.b, im.dataset.img, f); const s = st().sel; if (s && s.img) return setPicture(s.block, s.img, f); note('Drop the picture on a picture in the screen.'); });
    loadComments();
  }
  function paintTop() {
    const r = root(), s = st(); if (!r || !s) return;
    r.querySelectorAll('[data-plat]').forEach(b => b.classList.toggle('on', s.doc.device !== 'tablet' && s.doc.platform === b.dataset.plat));
    const t = r.querySelector('[data-dev]'); if (t) t.classList.toggle('on', s.doc.device === 'tablet');
    const mb = r.querySelector('#apc-mapb'); if (mb) { mb.classList.toggle('on', !!s.map); mb.setAttribute('aria-pressed', s.map ? 'true' : 'false'); }
    const cb = r.querySelector('#apc-cmb'); if (cb) { cb.classList.toggle('on', !!s.cmode); cb.setAttribute('aria-pressed', s.cmode ? 'true' : 'false'); }
    const n = r.querySelector('#apc-cn'), open = (s.comments || []).filter(c => c.status === 'open').length; if (n) { n.hidden = !open; n.textContent = open; }
    const dark = (s.peek || s.doc.theme.mode) === 'dark', pl = r.querySelector('#apc-peek-l'); if (pl) pl.textContent = tr(s.peek ? 'Stop the preview' : dark ? 'Preview in light' : 'Preview in dark');
    const sl = r.querySelector('#apc-size-l'); if (sl) sl.textContent = tr(s.doc.device === 'tablet' ? 'Now: tablet' : s.doc.platform === 'android' ? 'Now: Android phone' : 'Now: iPhone');
    r.classList.toggle('apc-cmode', !!s.cmode); r.classList.toggle('apc-peek', !!s.peek);
  }
  function setDevice(dev, quiet) { const s = st(); if ((s.doc.device === 'tablet') === (dev === 'tablet')) return; const r = X.apply({ op: 'device', device: dev }); if (quiet && r) note(''); }
  function peek() { const s = st(); s.peek = s.peek ? '' : (s.doc.theme.mode === 'dark' ? 'light' : 'dark'); X.paint(); note(s.peek ? `This is how it looks in ${s.peek} mode. Nothing was changed.` : 'Back to the app’s own look.'); }
  // the document as it is drawn (the peek flips light and dark for the eye only)
  function viewDoc() { const s = st(); if (!s.peek) return s.doc; return { ...s.doc, theme: A().normTheme({ ...s.doc.theme, mode: s.peek, preset: '' }) }; }
  const SIZE = () => (st().doc.device === 'tablet' ? { w: 768, h: 1024 } : { w: 390, h: 844 });

  // ---------- several parts at once ----------
  const selIds = () => { const s = st(); if (!s.sel) return []; const sc = A().findScreen(s.doc, s.screen), all = new Set([s.sel.block, ...(s.sels || [])]); return sc ? sc.blocks.filter(b => all.has(b.id)).map(b => b.id) : []; };
  function shiftClick(block) {
    const s = st(); if (!s.sel) return false;
    s.sels = s.sels || [];
    if (block === s.sel.block) { if (s.sels.length) { const n = s.sels.shift(); s.sel = { block: n, kind: 'block', path: '' }; } else s.sel = null; }
    else if (s.sels.includes(block)) s.sels = s.sels.filter(x => x !== block); else s.sels.push(block);
    if (s.sel) s.sel = { block: s.sel.block, kind: 'block', path: '' };
    X.paintSel(); return true;
  }
  function paintMulti() {
    const r = root(), s = st(); if (!r || !s) return; r.querySelectorAll('.apc-sel2').forEach(x => x.classList.remove('apc-sel2'));
    const ax = r.querySelector('.apc-edit'); if (!ax || !s.sel) { if (s) s.sels = []; return; }
    s.sels = (s.sels || []).filter(id => ax.querySelector(`[data-b="${CSS.escape(id)}"]`));
    for (const id of s.sels) { const el = ax.querySelector(`[data-b="${CSS.escape(id)}"]`); if (el) el.classList.add('apc-sel2'); }
  }
  // one Undo for the whole group
  function many(ops, say) {
    const s = st(); let doc = s.doc, last = null;
    for (const op of ops) { last = A().apply(doc, op); doc = last.doc; }
    if (JSON.stringify(doc) === JSON.stringify(s.doc)) return null;
    X.commit(doc, say == null ? (last && last.say) : say, true); return last;
  }
  function multiAct(a) {
    const s = st(), ids = selIds(); if (!ids.length) return;
    if (a === 'up') return many(ids.map(id => ({ op: 'block.move', block: id, dir: -1 })), '');
    if (a === 'down') return many(ids.slice().reverse().map(id => ({ op: 'block.move', block: id, dir: 1 })), '');
    if (a === 'dup') return many(ids.slice().reverse().map(id => ({ op: 'block.dup', block: id })), ids.length > 1 ? `Duplicated ${ids.length} parts.` : 'Duplicated it.');
    if (a === 'del') { const r = many(ids.map(id => ({ op: 'block.remove', block: id })), ids.length > 1 ? `Removed ${ids.length} parts. Undo brings them back.` : 'Removed it.'); s.sel = null; s.sels = []; X.paint(); return r; }
    if (a === 'copy') return copy();
    if (a === 'cut') return cut();
    if (/^style:/.test(a)) { const c = clone(s.doc); for (const id of ids) { const f = A().findBlock(c, id); if (f && f.block.type === 'button') f.block.props.style = a.slice(6); } X.commit(c, 'Changed them together.', true); }
  }
  function multiBar() {
    const n = selIds().length;
    return `<span class="apc-bn" data-i18n-skip>${n}</span><button data-bar="m:up" aria-label="Move up">${ic('up', 15)}</button><button data-bar="m:down" aria-label="Move down">${ic('down', 15)}</button><button data-bar="m:dup" aria-label="Duplicate">${ic('duplicate', 15)}</button><button data-bar="m:copy" aria-label="Copy">${svg('copy', 15)}</button><button data-bar="m:del" aria-label="Remove">${ic('delete', 15)}</button>`;
  }
  function multiInsp(box) {
    const s = st(), ids = selIds(), blocks = ids.map(id => A().findBlock(s.doc, id)).filter(Boolean), allBtn = blocks.length && blocks.every(f => f.block.type === 'button');
    box.innerHTML = `<p class="apc-eyebrow"><span data-i18n-skip>${ids.length}</span> ${esc(tr('parts selected'))}</p><p class="faint apc-hint">${esc(tr('Shift click adds or removes a part. What you do now happens to all of them, as one Undo.'))}</p>
      ${allBtn ? `<div class="apc-field"><span>Style</span><div class="apc-seg apc-segw"><button data-ma="style:primary">Main</button><button data-ma="style:secondary">Quiet</button></div></div>` : ''}
      <div class="apc-row"><button class="btn" data-ma="up">${ic('up')}<span>Move up</span></button><button class="btn" data-ma="down">${ic('down')}<span>Move down</span></button></div>
      <div class="apc-row"><button class="btn" data-ma="dup">${ic('duplicate')}<span>Duplicate</span></button><button class="btn" data-ma="copy">${svg('copy')}<span>Copy</span></button></div>
      <div class="apc-row"><button class="btn" data-ma="cut">${svg('cut')}<span>Cut</span></button><button class="btn" data-ma="del">${ic('delete')}<span>Remove</span></button></div>`;
    box.querySelectorAll('[data-ma]').forEach(b => b.onclick = () => multiAct(b.dataset.ma));
  }

  // ---------- copy, cut, paste (kept on this device, so it works between projects) ----------
  const CLIP = 'tribecode.appcreator.clip';
  const picsIn = (doc, json) => { const out = {}; String(json).replace(/"pic:([\w-]{1,40})"/g, (m, id) => { if (doc.pics && doc.pics[id]) out[id] = doc.pics[id]; return m; }); return out; };
  function copy(quiet) {
    const s = st();
    if (s.map && s.mapSel && s.mapSel.length) { const scr = s.doc.screens.filter(x => s.mapSel.includes(x.id)); if (!ls.set(CLIP, { kind: 'screens', screens: scr, pics: picsIn(s.doc, JSON.stringify(scr)), at: Date.now() })) return note('That is too big to copy on this device.'); if (!quiet) note(scr.length === 1 ? `Copied the screen ${scr[0].name}. Paste it here or in another project.` : `Copied ${scr.length} screens.`); return scr.length; }
    const ids = selIds();
    if (ids.length) { const blocks = ids.map(id => A().findBlock(s.doc, id).block); if (!ls.set(CLIP, { kind: 'blocks', blocks, pics: picsIn(s.doc, JSON.stringify(blocks)), at: Date.now() })) return note('That is too big to copy on this device.'); if (!quiet) note(blocks.length === 1 ? 'Copied. Paste it on any screen, here or in another project.' : `Copied ${blocks.length} parts.`); return blocks.length; }
    const sc = A().findScreen(s.doc, s.screen); if (!sc) return 0;
    if (!ls.set(CLIP, { kind: 'screens', screens: [sc], pics: picsIn(s.doc, JSON.stringify(sc)), at: Date.now() })) return note('That is too big to copy on this device.');
    if (!quiet) note(`Copied the screen ${sc.name}. Paste it here or in another project.`); return 1;
  }
  function cut() { const s = st(), ids = selIds(); if (!ids.length) return note('Select a part first, then cut it.'); copy(true); many(ids.map(id => ({ op: 'block.remove', block: id })), ids.length > 1 ? `Cut ${ids.length} parts. Paste them where you want them.` : 'Cut it. Paste it where you want it.'); s.sel = null; s.sels = []; X.paint(); }
  function paste() {
    const s = st(), c = ls.get(CLIP, null); if (!c) return note('Nothing copied yet. Select a part and press Ctrl C.');
    if (c.kind === 'screens') { const r = X.apply({ op: 'paste', screens: c.screens, pics: c.pics }); if (s.map) drawMap(); return r; }
    const sc = A().findScreen(s.doc, s.screen), ids = selIds(); let at; if (ids.length) at = sc.blocks.findIndex(b => b.id === ids[ids.length - 1]) + 1;
    const r = X.apply({ op: 'paste', blocks: c.blocks, screen: s.screen, at, pics: c.pics });
    if (r && r.blocks && r.blocks.length > 1) { s.sels = r.blocks.slice(1); X.paintSel(); }
    return r;
  }
  const clip = () => ls.get(CLIP, null);

  // ---------- your own pictures ----------
  function shrink(file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('That is not a picture.'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        try {
          const alpha = /png|webp|gif/.test(file.type); let max = 900, q = 0.82, out = '';
          for (let i = 0; i < 4; i++) {
            const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
            const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); if (!alpha) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); } g.drawImage(img, 0, 0, w, h);
            out = cv.toDataURL(alpha ? 'image/webp' : 'image/jpeg', q); if (out.length < 420000) break; max = Math.round(max * 0.7); q -= 0.08;
          }
          URL.revokeObjectURL(url); out.length < 600000 ? res(out) : rej(new Error('That picture is too big even when made smaller.'));
        } catch (e) { URL.revokeObjectURL(url); rej(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That picture could not be read.')); };
      img.src = url;
    });
  }
  async function setPicture(block, path, file) {
    try { const data = typeof file === 'string' ? file : await shrink(file); const r = X.apply({ op: 'pic', block, path, data }); return r; }
    catch (e) { note(e.message || 'That picture could not be used.'); return null; }
  }
  function pickPicture(block, path) { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => { if (i.files[0]) setPicture(block, path, i.files[0]); }; i.click(); }
  // the Picture field in the inspector: yours first, then the drawn set
  function picField(bk, imPath) {
    const d = st().doc, cur = A().getPath(bk.props, imPath), mine = Object.keys(d.pics || {});
    return `<div class="apc-row"><button class="btn" id="apc-pic">${svg('pic')}<span>Your picture</span></button></div><p class="faint apc-hint">${esc(tr('Pick a file, paste, or drop a picture on the screen. It is made small and saved with the app, nowhere else.'))}</p>${mine.length ? `<div class="apc-ills apc-mine">${mine.map(id => `<button data-mine="${esc(id)}" aria-label="Your picture" class="${cur === 'pic:' + id ? 'on' : ''}"><img src="${d.pics[id]}" alt=""></button>`).join('')}</div>` : ''}`;
  }
  function wirePicField(box, bk, imPath) {
    const b = box.querySelector('#apc-pic'); if (b) b.onclick = () => pickPicture(bk.id, imPath);
    box.querySelectorAll('[data-mine]').forEach(x => x.onclick = () => X.apply({ op: 'illus', block: bk.id, path: imPath, value: 'pic:' + x.dataset.mine }));
  }
  // paste: a picture from the clipboard goes into the selected picture; otherwise the copied parts or screens
  let pasteT = 0;
  document.addEventListener('paste', e => {
    if (!root() || !st() || !st().open || typingNow()) return;
    const f = e.clipboardData && [...e.clipboardData.files].find(x => /^image\//.test(x.type)); if (!f) return;
    clearTimeout(pasteT); e.preventDefault(); const s = st().sel;
    if (s && s.img) setPicture(s.block, s.img, f); else note('Select a picture in the screen first, then paste.');
  });

  // ---------- keys ----------
  const KEYS = [['Undo', 'Ctrl Z'], ['Redo', 'Ctrl Shift Z'], ['Copy the selected parts, or the screen', 'Ctrl C'], ['Cut', 'Ctrl X'], ['Paste', 'Ctrl V'], ['Duplicate', 'Ctrl D'], ['Select every part on the screen', 'Ctrl A'], ['Add a part to the selection', 'Shift click'], ['Move the selected part up or down', '↑ ↓'], ['Remove', 'Delete'], ['Step out, then close', 'Esc'], ['Comment on a part', 'C'], ['Screen map', 'M'], ['Play or stop', 'P'], ['Save a named version', 'Ctrl S'], ['This list', '?']];
  function keysSheet() {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    sheet('keys', 'Keyboard shortcuts', `<div class="apc-keys">${KEYS.map(([what, k]) => `<div class="apc-key"><span>${esc(tr(what))}</span><kbd data-i18n-skip>${esc(mac ? k.replace(/Ctrl/g, '⌘') : k)}</kbd></div>`).join('')}</div>`);
  }
  // returns true when the key was handled here
  function onKey(e) {
    const s = st(), r = root(); if (!s || !r) return false;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), typing = typingNow();
    if (e.key === 'Escape') {
      if (r.querySelector('#apc-cbox')) { closeBox(); return true; }
      if (s.cmode) { commentMode(false); return true; }
      if (s.map && !s.sheet) { if (s.mapSel && s.mapSel.length) { s.mapSel = []; drawMap(); } else toggleMap(false); return true; }
      return false;
    }
    if (typing) return false;
    if (s.sheet) return false;
    if (mod && k === 's') { e.preventDefault(); historySheet(true); return true; }
    if (mod && k === 'y') { e.preventDefault(); X.redo(); return true; }
    if (mod && k === 'c') { e.preventDefault(); copy(); return true; }
    if (mod && k === 'x') { e.preventDefault(); cut(); return true; }
    if (mod && k === 'v') { clearTimeout(pasteT); pasteT = setTimeout(paste, 40); return true; }   // a picture on the clipboard wins (the paste event)
    if (mod && k === 'd') { e.preventDefault(); if (s.map) mapAct('dup'); else if (s.sel) multiAct('dup'); else X.apply({ op: 'screen.dup', screen: s.screen }); return true; }
    if (mod && k === 'a' && s.mode === 'edit' && !s.map) { e.preventDefault(); const sc = A().findScreen(s.doc, s.screen); if (sc && sc.blocks.length) { s.sel = { block: sc.blocks[0].id, kind: 'block', path: '' }; s.sels = sc.blocks.slice(1).map(b => b.id); X.paintSel(); } return true; }
    if (mod || e.altKey) return false;
    if (s.map && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); mapAct('del'); return true; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && s.sel && (s.sels || []).length) { e.preventDefault(); multiAct('del'); return true; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && s.sel && s.mode === 'edit' && !s.map) { e.preventDefault(); if (s.sel.kind === 'item') X.apply({ op: e.key === 'ArrowUp' ? 'item.up' : 'item.down', block: s.sel.block, path: s.sel.path }); else multiAct(e.key === 'ArrowUp' ? 'up' : 'down'); return true; }
    if (e.key === '?') { e.preventDefault(); keysSheet(); return true; }
    if (k === 'c' && s.mode === 'edit' && !s.map) { commentMode(!s.cmode); return true; }
    if (k === 'm') { toggleMap(); return true; }
    if (k === 'p') { s.mode = s.mode === 'play' ? 'edit' : 'play'; s.sel = null; if (s.map) toggleMap(false); X.paint(); return true; }
    return false;
  }

  // ---------- a small sheet (the editor's own kind) ----------
  function sheet(kind, title, html, cls) {
    X.closeSheet(); const s = st(); s.sheet = kind;
    const sh = document.createElement('div'); sh.id = 'apc-sheet'; sh.className = 'apc-sheet apc-tsheet ' + (cls || 'apc-psheet');
    sh.innerHTML = `<div class="apc-sheet-in" role="dialog" aria-label="${esc(title)}"><header><b>${esc(tr(title))}</b><button class="apc-tb" id="apc-sheet-x" aria-label="Close">${ic('x')}</button></header><div class="apc-pane">${html}</div></div>`;
    root().appendChild(sh); sh.querySelector('#apc-sheet-x').onclick = X.closeSheet; sh.addEventListener('click', e => { if (e.target === sh) X.closeSheet(); });
    return sh;
  }

  // ---------- history ----------
  const HLOCAL = 'tribecode.appcreator.history';
  // with no tribe: every save on this device lands here (same rule as the host: one entry per two minutes of work)
  function rememberLocal(doc, name) {
    let h = ls.get(HLOCAL, []); if (!Array.isArray(h)) h = [];
    const now = Date.now(), last = h[h.length - 1], entry = { id: 'v' + now.toString(36), at: new Date(now).toISOString(), by: '', name: name || '', screens: doc.screens.length, config: doc };
    if (!name && last && !last.name && now - Date.parse(last.at) < 120000) { entry.id = last.id; h[h.length - 1] = entry; } else h.push(entry);
    const named = h.filter(v => v.name).slice(-10), plain = h.filter(v => !v.name).slice(-20), keep = new Set(named.concat(plain)); h = h.filter(v => keep.has(v));
    while (h.length > 1 && !ls.set(HLOCAL, h)) h.shift();   // a full device: the oldest go first
    if (h.length <= 1) ls.set(HLOCAL, h);
    return entry;
  }
  async function versions() {
    if (tribe()) { const r = await api('/app-config/history'); return r.versions || []; }
    return (ls.get(HLOCAL, []) || []).map(v => ({ id: v.id, at: v.at, by: '', name: v.name || '', screens: v.screens })).reverse();
  }
  async function versionDoc(id) {
    if (tribe()) return (await api('/app-config/history/' + encodeURIComponent(id))).config;
    const v = (ls.get(HLOCAL, []) || []).find(x => x.id === id); return v ? v.config : null;
  }
  async function nameVersion(id, name) {
    if (tribe()) return id ? api(`/app-config/history/${encodeURIComponent(id)}/name`, { method: 'POST', body: { name } }) : api('/app-config/history', { method: 'POST', body: { name } });
    if (!id) return rememberLocal(st().doc, name || 'Saved version');
    const h = ls.get(HLOCAL, []) || [], v = h.find(x => x.id === id); if (v) { v.name = String(name || '').slice(0, 60); ls.set(HLOCAL, h); } return v;
  }
  async function historySheet(focusName) {
    const s = st(); if (s.dirty && X.save) { try { await X.save(true); } catch {} }
    const sh = sheet('history', 'History', `<form class="apc-hsave" id="apc-hsave"><input class="input" id="apc-hname" maxlength="60" placeholder="${esc(tr('Name this version, like “v1 demo”'))}" autocomplete="off"><button class="btn primary" type="submit">Save a version</button></form><p class="faint apc-hint">${esc(tr(s.local ? 'Every save on this device is kept here: the last 20, and the ones you name.' : 'Every save is kept here for the whole tribe: the last 30, and the ones you name.'))}</p><div class="apc-hgrid"><div class="apc-hlist" id="apc-hlist"><p class="faint">${esc(tr('Loading…'))}</p></div><div class="apc-hview" id="apc-hview"></div></div>`, 'apc-hsheet');
    const list = sh.querySelector('#apc-hlist'), view = sh.querySelector('#apc-hview'); let all = [];
    const canName = s.local || s.canEdit;
    if (!canName) sh.querySelector('#apc-hsave').hidden = true;
    const show = async id => {
      list.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === id));
      const v = all.find(x => x.id === id); view.innerHTML = `<p class="faint">${esc(tr('Loading…'))}</p>`;
      let cfg = null; try { cfg = await versionDoc(id); } catch {}
      if (!cfg) { view.innerHTML = `<p class="faint">${esc(tr('That version could not be opened.'))}</p>`; return; }
      const d = A().normalize(cfg), same = JSON.stringify(d) === JSON.stringify(A().normalize(s.doc));
      view.innerHTML = `<div class="apc-hshots">${d.screens.slice(0, 4).map(x => X.mini(d, x.id, 96)).join('')}</div><p class="apc-hmeta"><b data-i18n-skip>${esc(v.name || when(v.at))}</b><span class="faint" data-i18n-skip>${esc([v.name ? when(v.at) : '', v.by, `${d.screens.length} ${tr(d.screens.length === 1 ? 'screen' : 'screens')}`].filter(Boolean).join(' · '))}</span></p>
        ${canName ? `<div class="apc-row"><input class="input" id="apc-hrn" maxlength="60" value="${esc(v.name)}" placeholder="${esc(tr('Name'))}" aria-label="Name"><button class="btn" id="apc-hrnb">Rename</button></div>` : ''}
        <div class="apc-row"><button class="btn primary" id="apc-hrestore"${same || !s.canDraft ? ' disabled' : ''}>Restore this version</button></div><p class="faint apc-hint">${esc(tr(same ? 'This is what you have now.' : 'Restoring changes the app to this version. Undo brings back what you have now, and nothing in History is lost.'))}</p>`;
      const rb = view.querySelector('#apc-hrestore'); if (rb) rb.onclick = () => { X.closeSheet(); X.commit(d, `Restored the version from ${v.name || when(v.at)}. Undo brings back what you had.`); s.screen = A().findScreen(s.doc, s.screen) ? s.screen : s.doc.start; s.sel = null; X.paint(); };
      const nb = view.querySelector('#apc-hrnb'); if (nb) nb.onclick = async () => { try { await nameVersion(id, view.querySelector('#apc-hrn').value.trim()); await load(id); } catch (e) { note(e.message || 'Could not rename it.'); } };
    };
    const load = async keep => {
      try { all = await versions(); } catch (e) { list.innerHTML = `<p class="faint">${esc(e.message || tr('History could not be read.'))}</p>`; return; }
      if (!all.length) { list.innerHTML = `<p class="faint">${esc(tr('No earlier versions yet. They appear as you work.'))}</p>`; view.innerHTML = ''; return; }
      list.innerHTML = all.map(v => `<button class="apc-hrow" data-v="${esc(v.id)}"><b data-i18n-skip>${esc(v.name || when(v.at))}</b><small data-i18n-skip>${esc([v.name ? when(v.at) : '', v.by, `${v.screens} ${tr(v.screens === 1 ? 'screen' : 'screens')}`].filter(Boolean).join(' · '))}</small>${v.name ? `<span class="apc-pill">${esc(tr('Named'))}</span>` : ''}</button>`).join('');
      list.querySelectorAll('[data-v]').forEach(b => b.onclick = () => show(b.dataset.v));
      show(keep && all.some(v => v.id === keep) ? keep : all[0].id);
    };
    sh.querySelector('#apc-hsave').onsubmit = async e => { e.preventDefault(); const i = sh.querySelector('#apc-hname'); try { await nameVersion('', i.value.trim() || 'Saved version'); i.value = ''; note('Saved this version. It stays in History.'); await load(); } catch (er) { note(er.message || 'Could not save the version.'); } };
    await load(); if (focusName && canName) sh.querySelector('#apc-hname').focus();
  }

  // ---------- comments ----------
  const CLOCAL = () => `tribecode.appcreator.comments.${(st() && st().pid) || 'local'}`;
  async function loadComments() {
    const s = st(); if (!s) return;
    if (tribe()) { try { s.comments = (await api('/app-comments')).comments || []; } catch { s.comments = s.comments || []; } }
    else s.comments = ls.get(CLOCAL(), []) || [];
    if (root()) { paintTop(); placePins(); if (!s.sel && s.mode === 'edit') { const b = root().querySelector('#apc-insp'); if (b && !typingNow()) inspEmpty(b); } }
  }
  const saveLocalC = () => ls.set(CLOCAL(), (st().comments || []).slice(-200));
  const me = () => { try { const S = C() && C().state && C().state(); return (S && S.me && (S.me.name || S.me.id)) || ''; } catch { return ''; } };
  function commentMode(on) { const s = st(); s.cmode = !!on; closeBox(); if (on) { s.sel = null; s.sels = []; if (s.map) toggleMap(false); if (s.mode === 'play') s.mode = 'edit'; X.paint(); note('Click the part you want to comment on. Esc to stop.'); } else { paintTop(); placePins(); } }
  function closeBox() { const b = root() && root().querySelector('#apc-cbox'); if (b) b.remove(); }
  function box(html, at) {
    closeBox(); const mid = root().querySelector('#apc-mid'), b = document.createElement('div'); b.id = 'apc-cbox'; b.className = 'apc-cbox'; b.innerHTML = html; mid.appendChild(b);
    const r0 = mid.getBoundingClientRect(), w = b.offsetWidth, h = b.offsetHeight;
    b.style.left = Math.max(8, Math.min(mid.clientWidth - w - 8, at.x - r0.left + 14)) + 'px'; b.style.top = Math.max(8, Math.min(mid.clientHeight - h - 8, at.y - r0.top - 10)) + 'px';
    b.addEventListener('click', e => e.stopPropagation()); return b;
  }
  // a click in comment mode: a new pin on that part
  function stageComment(e) {
    const s = st(), bEl = e.target.closest('[data-b]'), ax = root().querySelector('.apc-edit'); if (!ax) return;
    const base = bEl || ax, r = base.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const f = bEl && A().findBlock(s.doc, bEl.dataset.b), label = f ? tr(A().BLOCKS[f.block.type].label) : '';
    const b = box(`<form id="apc-cform"><p class="apc-eyebrow">${esc(tr('Comment'))}${label ? ' · ' + esc(label) : ''}</p><textarea class="input" id="apc-ctext" rows="3" maxlength="600" placeholder="${esc(tr('What should change here?'))}"></textarea><div class="apc-row"><button type="button" class="btn" id="apc-ccancel">Cancel</button><button class="btn primary" type="submit">Comment</button></div></form>`, { x: e.clientX, y: e.clientY });
    const ta = b.querySelector('#apc-ctext'); ta.focus();
    ta.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); b.querySelector('#apc-cform').requestSubmit(); } });
    b.querySelector('#apc-ccancel').onclick = closeBox;
    b.querySelector('#apc-cform').onsubmit = async ev => {
      ev.preventDefault(); const text = ta.value.trim(); if (!text) return;
      const body = { screen: s.screen, block: bEl ? bEl.dataset.b : '', label, text, x, y };
      try {
        if (tribe()) { const r2 = await api('/app-comments', { method: 'POST', body }); s.comments = (s.comments || []).filter(c => c.id !== r2.comment.id).concat(r2.comment); }
        else { s.comments = (s.comments || []).concat({ ...body, id: 'c' + Date.now().toString(36), by: tr('You'), at: new Date().toISOString(), status: 'open', replies: [] }); saveLocalC(); }
        closeBox(); commentMode(false); X.paint(); note('Comment added. Everyone who opens the app design sees it.');
      } catch (er) { note(er.message || 'The comment could not be saved.'); }
    };
  }
  const numOf = c => (st().comments || []).indexOf(c) + 1;
  // pins sit outside the scaled phone, so they keep their size
  function placePins() {
    const r = root(), s = st(); if (!r || !s) return; const mid = r.querySelector('#apc-mid'); if (!mid) return;
    let layer = mid.querySelector('#apc-pins'); if (!layer) { layer = document.createElement('div'); layer.id = 'apc-pins'; layer.className = 'apc-pins'; mid.appendChild(layer); }
    const ax = r.querySelector('.apc-edit'); if (!ax || s.mode === 'play' || s.map) { layer.innerHTML = ''; return; }
    const r0 = mid.getBoundingClientRect(), wrap = r.querySelector('#apc-stage').getBoundingClientRect();
    layer.innerHTML = (s.comments || []).filter(c => c.status === 'open' && c.screen === s.screen).map(c => {
      const el = c.block ? ax.querySelector(`[data-b="${CSS.escape(c.block)}"]`) : null, b = (el || ax).getBoundingClientRect();
      const x = b.left + b.width * (el ? c.x : Math.min(c.x, 0.9)), y = b.top + b.height * (el ? c.y : 0.02);
      if (y < wrap.top - 4 || y > wrap.bottom + 4) return '';
      return `<button class="apc-pin" data-pin="${esc(c.id)}" style="left:${Math.round(x - r0.left)}px;top:${Math.round(y - r0.top)}px" aria-label="${esc(tr('Comment'))} ${numOf(c)}" data-i18n-skip>${numOf(c)}</button>`;
    }).join('');
    layer.querySelectorAll('[data-pin]').forEach(b => b.onclick = e => { e.stopPropagation(); thread(b.dataset.pin, { x: e.clientX, y: e.clientY }); });
  }
  function thread(id, at) {
    const s = st(), c = (s.comments || []).find(x => x.id === id); if (!c) return;
    if (c.screen !== s.screen && A().findScreen(s.doc, c.screen)) { s.screen = c.screen; s.sel = null; if (s.map) toggleMap(false); X.paint(); }
    if (!at) { const p = root().querySelector(`[data-pin="${CSS.escape(id)}"]`), r = (p || root().querySelector('#apc-mid')).getBoundingClientRect(); at = { x: r.left + 12, y: r.top + 12 }; }
    const b = box(`<p class="apc-eyebrow" data-i18n-skip>${numOf(c)} · ${esc(c.label || tr('Screen'))}</p><div class="apc-thread"><div class="apc-cm"><b data-i18n-skip>${esc(c.by || '')}</b><small class="faint" data-i18n-skip>${esc(when(c.at))}</small><p data-i18n-skip>${esc(c.text)}</p></div>${(c.replies || []).map(r => `<div class="apc-cm apc-cmr"><b data-i18n-skip>${esc(r.by || '')}</b><small class="faint" data-i18n-skip>${esc(when(r.at))}</small><p data-i18n-skip>${esc(r.text)}</p></div>`).join('')}</div>
      <form id="apc-rform"><input class="input" id="apc-rtext" maxlength="600" placeholder="${esc(tr('Reply'))}" autocomplete="off"><button class="btn" type="submit">Reply</button></form>
      <div class="apc-row"><button class="btn" id="apc-cres">${esc(tr(c.status === 'open' ? 'Resolve' : 'Reopen'))}</button><button class="btn" id="apc-cdel">Remove</button><button class="btn" id="apc-cx">Close</button></div>`, at);
    const act = async (path, method, body) => {
      try {
        if (tribe()) { const r2 = await api(`/app-comments/${encodeURIComponent(id)}${path}`, { method, body }); if (r2.comment) s.comments = s.comments.map(x => x.id === id ? r2.comment : x); else s.comments = s.comments.filter(x => x.id !== id); }
        else { if (path === '/reply') c.replies = (c.replies || []).concat({ by: tr('You'), text: body.text, at: new Date().toISOString() }); else if (path === '/resolve') c.status = 'resolved'; else if (path === '/reopen') c.status = 'open'; else s.comments = s.comments.filter(x => x.id !== id); saveLocalC(); }
        return true;
      } catch (er) { note(er.message || 'That did not work.'); return false; }
    };
    b.querySelector('#apc-rform').onsubmit = async e => { e.preventDefault(); const t = b.querySelector('#apc-rtext').value.trim(); if (!t) return; if (await act('/reply', 'POST', { text: t })) { paintTop(); placePins(); thread(id, at); } };
    b.querySelector('#apc-cres').onclick = async () => { if (await act(c.status === 'open' ? '/resolve' : '/reopen', 'POST', {})) { closeBox(); X.paint(); note(c.status === 'open' ? 'Resolved. It stays in the list under “Show resolved”.' : 'Reopened.'); } };
    b.querySelector('#apc-cdel').onclick = async () => { if (await act('', 'DELETE')) { closeBox(); X.paint(); } };
    b.querySelector('#apc-cx').onclick = closeBox;
  }
  function commentsHTML() {
    const s = st(), all = s.comments || [], open = all.filter(c => c.status === 'open'), list = s.showResolved ? all : open;
    return `<p class="apc-eyebrow">${esc(tr('Comments'))} · <span data-i18n-skip>${open.length}</span></p>${list.length ? `<div class="apc-clist">${list.map(c => { const sc = A().findScreen(s.doc, c.screen); return `<button class="apc-crow${c.status === 'open' ? '' : ' done'}" data-cmt="${esc(c.id)}"><span class="apc-pin apc-pin-s" data-i18n-skip>${numOf(c)}</span><span><b data-i18n-skip>${esc(c.text.slice(0, 90))}</b><small data-i18n-skip>${esc([c.by, sc ? sc.name : '', (c.replies || []).length ? `${c.replies.length} ↩` : ''].filter(Boolean).join(' · '))}</small></span></button>`; }).join('')}</div>` : `<p class="faint apc-hint">${esc(tr(st().mobile ? 'No open comments yet.' : 'No open comments. Press C, then click a part to leave one.'))}</p>`}
      ${all.length > open.length ? `<label class="apc-chk"><input type="checkbox" id="apc-cshow"${s.showResolved ? ' checked' : ''}> <span>Show resolved</span></label>` : ''}`;
  }

  // ---------- the right panel with nothing selected: this screen, quick actions, comments, tips ----------
  function inspEmpty(box0) {
    const s = st(), d = s.doc, sc = A().findScreen(d, s.screen); if (!sc) { box0.innerHTML = ''; return; }
    const reach = reachable(d), can = s.canDraft;
    box0.innerHTML = `<p class="apc-eyebrow">${esc(tr('This screen'))}</p>
      <div class="apc-field"><label for="apc-scname">Name</label><input class="input" id="apc-scname" maxlength="40" value="${esc(sc.name)}" data-i18n-skip${can ? '' : ' disabled'}></div>
      <label class="apc-chk"><input type="checkbox" id="apc-first"${d.start === s.screen ? ' checked disabled' : ''}${can ? '' : ' disabled'}> <span>The app opens on this screen</span></label>
      ${reach.has(sc.id) ? '' : `<p class="apc-warn">${esc(tr('Nothing leads to this screen yet. Select a button and choose it under “When tapped, go to”.'))}</p>`}
      <p class="apc-eyebrow">${esc(tr('Do next'))}</p>
      <div class="apc-quick">${[['add', 'plus', 'Add a part'], ['screen', 'grid', 'Add a screen'], ['dup', 'duplicate', 'Copy this screen'], ['map', 'map', 'Screen map'], ['comment', 'comment', 'Comment'], ['history', 'clock', 'History']].map(([k, i, l]) => `<button class="apc-q" data-q="${k}"${!can && /add|screen|dup/.test(k) ? ' disabled' : ''}>${svg(i)}<span>${esc(tr(l))}</span></button>`).join('')}</div>
      ${commentsHTML()}
      <p class="apc-eyebrow">${esc(tr('Good to know'))}</p><ul class="apc-tips"><li>${esc(tr('Click words to type. Click a part to move, copy, link or remove it.'))}</li><li>${esc(tr('Shift click selects several parts at once.'))}</li><li>${esc(tr('Press ? for every shortcut.'))}</li></ul>`;
    const f = box0.querySelector('#apc-first'); if (f) f.onchange = () => { const c = clone(s.doc); c.start = s.screen; X.commit(c, 'The app opens here now.'); };
    const nm = box0.querySelector('#apc-scname'); if (nm) nm.onchange = () => X.apply({ op: 'screen.rename', screen: s.screen, name: nm.value });
    box0.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const k = b.dataset.q; if (s.sheet) X.closeSheet();
      if (k === 'add') { if (s.mobile) X.openSheet('add'); else X.setTab('add'); } else if (k === 'screen') X.apply({ op: 'screen.add', name: tr('New screen') }); else if (k === 'dup') X.apply({ op: 'screen.dup', screen: s.screen }); else if (k === 'map') toggleMap(true); else if (k === 'comment') commentMode(true); else if (k === 'history') historySheet(); });
    box0.querySelectorAll('[data-cmt]').forEach(b => b.onclick = () => { if (s.sheet) X.closeSheet(); thread(b.dataset.cmt); });
    const sr = box0.querySelector('#apc-cshow'); if (sr) sr.onchange = () => { s.showResolved = sr.checked; inspEmpty(box0); };
  }

  // ---------- the map of all screens ----------
  const CARD = { w: 136, h: 300, gx: 96, gy: 40 };
  function links(d) { const out = []; for (const sc of d.screens) for (const bk of sc.blocks) for (const l of Object.values(bk.links || {})) if (l && l.to !== sc.id && !out.some(x => x.from === sc.id && x.to === l.to)) out.push({ from: sc.id, to: l.to }); return out; }
  function reachable(d) { const L = links(d), seen = new Set([d.start]), q = [d.start]; while (q.length) { const id = q.shift(); for (const l of L) if (l.from === id && !seen.has(l.to)) { seen.add(l.to); q.push(l.to); } } return seen; }
  // where a screen sits: where the person put it, or columns by how many taps it is from the first screen
  function layout(d) {
    const L = links(d), depth = { [d.start]: 0 }, q = [d.start]; while (q.length) { const id = q.shift(); for (const l of L) if (l.from === id && depth[l.to] == null) { depth[l.to] = depth[id] + 1; q.push(l.to); } }
    const max = Math.max(0, ...Object.values(depth)), rows = {}, pos = {};
    for (const sc of d.screens) { const col = depth[sc.id] == null ? max + 1 : depth[sc.id], row = rows[col] = (rows[col] || 0); rows[col]++; pos[sc.id] = (d.map && d.map[sc.id]) || { x: col * (CARD.w + CARD.gx), y: row * (CARD.h + CARD.gy) }; }
    return pos;
  }
  let view = { x: 40, y: 40, k: 1 };
  function toggleMap(on) {
    const s = st(), r = root(); s.map = on == null ? !s.map : !!on; s.mapSel = [];
    let m = r.querySelector('#apc-map');
    if (!s.map) { if (m) m.remove(); r.classList.remove('apc-mapon'); paintTop(); X.paint(); return; }
    if (s.mode === 'play') s.mode = 'edit'; s.cmode = false; closeBox(); s.sel = null; s.sels = [];
    X.paint();
    if (!m) { m = document.createElement('div'); m.id = 'apc-map'; m.className = 'apc-map'; r.querySelector('#apc-mid').appendChild(m); wireMap(m); }
    r.classList.add('apc-mapon'); paintTop(); drawMap(); fitMap();
  }
  // pass 4 polish: a link line never runs across a screen. Lines are straight runs with rounded corners that travel in
  // the gaps between cards: straight across when nothing is in the way, otherwise out into the gap beside the first
  // card, along the gap above or below the row, and in from the gap beside the last card.
  function route(pos, from, to, hs) {
    const hOf = id => (hs && hs[id]) || CARD.h, A = { ...pos[from], h: hOf(from) }, B = { ...pos[to], h: hOf(to) }, W = CARD.w, others = Object.entries(pos).filter(([id]) => id !== from && id !== to).map(([id, p]) => ({ ...p, h: hOf(id) }));
    const hitsH = (y, x1, x2) => others.some(p => y > p.y - 6 && y < p.y + p.h + 6 && Math.max(x1, x2) > p.x - 6 && Math.min(x1, x2) < p.x + W + 6);
    const hitsV = (x, y1, y2) => others.some(p => x > p.x - 6 && x < p.x + W + 6 && Math.max(y1, y2) > p.y - 6 && Math.min(y1, y2) < p.y + p.h + 6);
    const poly = pts => { const P = pts.filter((q, i) => !i || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]); let d = `M${P[0][0]} ${P[0][1]}`;
      for (let i = 1; i < P.length; i++) { const [x, y] = P[i], n = P[i + 1], [px, py] = P[i - 1];
        if (!n) { d += ` L${x} ${y}`; continue; }
        const r = Math.min(10, Math.hypot(x - px, y - py) / 2, Math.hypot(n[0] - x, n[1] - y) / 2), ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(n[0] - x), vy = Math.sign(n[1] - y);
        d += ` L${x - ux * r} ${y - uy * r} Q${x} ${y} ${x + vx * r} ${y + vy * r}`; }
      return d; };
    const ay = A.y + CARD.h / 2, by = B.y + CARD.h / 2, acx = A.x + W / 2, bcx = B.x + W / 2;
    if (Math.abs(bcx - acx) < W) {   // one column: bottom to top, or round the side when a screen sits between
      const down = B.y >= A.y, y1 = A.y + (down ? A.h : 0), y2 = B.y + (down ? 0 : B.h);
      if (!hitsV(acx, y1, y2) && !hitsV(bcx, y1, y2)) { const my = Math.round((y1 + y2) / 2); return poly([[acx, y1], [acx, my], [bcx, my], [bcx, y2]]); }
      const lx = Math.min(A.x, B.x) - Math.round(CARD.gx / 3); return poly([[A.x, ay], [lx, ay], [lx, by], [B.x, by]]);
    }
    const right = bcx >= acx, sg = right ? 1 : -1, x1 = A.x + (right ? W : 0), x2 = B.x + (right ? 0 : W), g = Math.round(CARD.gx / 2);
    const l1 = x1 + sg * Math.min(g, Math.abs(x2 - x1) / 2), l2 = x2 - sg * Math.min(g, Math.abs(x2 - x1) / 2);
    if (!hitsV(l1, ay, by) && !hitsH(by, l1, x2) && !hitsH(ay, x1, l1)) return poly([[x1, ay], [l1, ay], [l1, by], [x2, by]]);
    if (!hitsH(ay, x1, l2) && !hitsV(l2, ay, by)) return poly([[x1, ay], [l2, ay], [l2, by], [x2, by]]);
    // a screen is in the way: travel along the gap above (or below) the target's row
    const gy = Math.round(CARD.gy / 2);
    for (const ly of [B.y - gy, B.y + B.h + gy, A.y - gy, A.y + A.h + gy]) if (!hitsV(l1, ay, ly) && !hitsH(ly, l1, l2) && !hitsV(l2, ly, by)) return poly([[x1, ay], [l1, ay], [l1, ly], [l2, ly], [l2, by], [x2, by]]);
    return poly([[x1, ay], [l1, ay], [l1, by], [x2, by]]);
  }
  function drawMap() {
    const s = st(), r = root(), m = r && r.querySelector('#apc-map'); if (!m || !s.map) return;
    const d = s.doc, pos = layout(d), reach = reachable(d), L = links(d);
    s.mapSel = (s.mapSel || []).filter(id => pos[id]);
    const mid = id => ({ x: pos[id].x + CARD.w / 2, y: pos[id].y + CARD.h / 2 });
    // one line per pair of screens (an arrowhead at each end when both link to each other); screens in one column join
    // bottom to top, the rest side to side

    m.querySelector('.apc-map-in').innerHTML = `<svg class="apc-map-svg" width="1" height="1" overflow="visible" aria-hidden="true"><defs><marker id="apc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5L9 5 1 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/></marker></defs></svg>`
      + d.screens.map(sc => `<div class="apc-mc${s.mapSel.includes(sc.id) ? ' sel' : ''}${sc.id === s.screen ? ' cur' : ''}${reach.has(sc.id) ? '' : ' lost'}" data-ms="${esc(sc.id)}" style="left:${pos[sc.id].x}px;top:${pos[sc.id].y}px" tabindex="0" role="button" aria-label="${esc(sc.name)}">${X.mini(d, sc.id, 120)}<span class="apc-mcn" data-i18n-skip>${esc(sc.name)}</span><span class="apc-mcp">${sc.id === d.start ? `<small class="apc-pill">${esc(tr('First'))}</small>` : ''}${reach.has(sc.id) ? '' : `<small class="apc-pill apc-pill-warn">${esc(tr('Can’t be reached'))}</small>`}</span></div>`).join('');
    const hs = {}; m.querySelectorAll('.apc-mc').forEach(el => { hs[el.dataset.ms] = el.offsetHeight; });
    const seen = new Set(), paths = L.map(l => {
      const key = [l.from, l.to].sort().join('>'); if (seen.has(key)) return ''; seen.add(key);
      const both = L.some(x => x.from === l.to && x.to === l.from), a = mid(l.from), b = mid(l.to), ends = `marker-end="url(#apc-arrow)"${both ? ' marker-start="url(#apc-arrow)"' : ''}`;
      const d = route(pos, l.from, l.to, hs); return `<path d="${d}" ${ends}/>`;
    }).join('');
    m.querySelector('.apc-map-svg').insertAdjacentHTML('beforeend', paths);
    const n = s.mapSel.length, bar = m.querySelector('.apc-map-sel');
    bar.hidden = !n; if (n) bar.innerHTML = `<span data-i18n-skip>${n}</span> ${esc(tr(n === 1 ? 'screen selected' : 'screens selected'))}<button class="btn" data-ma2="open"${n === 1 ? '' : ' hidden'}>Open</button><button class="btn" data-ma2="dup">Duplicate</button><button class="btn" data-ma2="copy">Copy</button><button class="btn" data-ma2="del">Remove</button>`;
    bar.querySelectorAll('[data-ma2]').forEach(b => b.onclick = () => mapAct(b.dataset.ma2));
    applyView();
  }
  function applyView() { const r = root(), m = r && r.querySelector('#apc-map'); if (!m) return; m.querySelector('.apc-map-in').style.transform = `translate(${Math.round(view.x)}px,${Math.round(view.y)}px) scale(${view.k.toFixed(3)})`; const z = m.querySelector('#apc-mz'); if (z) z.textContent = Math.round(view.k * 100) + '%'; }
  function fitMap() {
    const s = st(), m = root().querySelector('#apc-map'); if (!m) return; const pos = Object.values(layout(s.doc)); if (!pos.length) return;
    const x0 = Math.min(...pos.map(p => p.x)), y0 = Math.min(...pos.map(p => p.y)), x1 = Math.max(...pos.map(p => p.x)) + CARD.w, y1 = Math.max(...pos.map(p => p.y)) + CARD.h;
    const W = m.clientWidth, H = m.clientHeight, top = 68, bot = 44, k = Math.max(0.2, Math.min(1.2, (W - 48) / (x1 - x0), (H - top - bot) / (y1 - y0)));
    view = { k, x: (W - (x1 - x0) * k) / 2 - x0 * k, y: top + Math.max(0, (H - top - bot - (y1 - y0) * k) / 2) - y0 * k }; applyView();   // clear of the tools above and the hint below
  }
  function zoom(f, cx, cy) { const m = root().querySelector('#apc-map'), k = Math.max(0.2, Math.min(2, view.k * f)); if (cx == null) { cx = m.clientWidth / 2; cy = m.clientHeight / 2; } view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k; applyView(); }
  function mapAct(a) {
    const s = st(), ids = (s.mapSel || []).slice(); if (!ids.length) return note('Shift click or drag a box to select screens first.');
    if (a === 'open') { s.screen = ids[0]; return toggleMap(false); }
    if (a === 'copy') return copy();
    if (a === 'dup') { const r = many(ids.map(id => ({ op: 'screen.dup', screen: id })), ids.length > 1 ? `Made copies of ${ids.length} screens.` : null); drawMap(); return r; }
    if (a === 'del') { if (ids.length >= s.doc.screens.length) return note('An app needs at least one screen.'); const r = many(ids.map(id => ({ op: 'screen.remove', screen: id })), ids.length > 1 ? `Removed ${ids.length} screens. Undo brings them back.` : null); s.mapSel = []; drawMap(); return r; }
  }
  function wireMap(m) {
    m.innerHTML = `<div class="apc-map-in"></div><div class="apc-map-tools"><span class="apc-eyebrow">${esc(tr('Screen map'))}</span><button class="apc-tb" data-z="out" aria-label="Zoom out">${svg('zout')}</button><span class="apc-mz" id="apc-mz" data-i18n-skip>100%</span><button class="apc-tb" data-z="in" aria-label="Zoom in">${svg('zin')}</button><button class="btn" data-z="fit">${svg('fit')}<span>Fit</span></button><button class="btn" data-z="tidy">Tidy up</button><button class="btn" data-z="done">Done</button></div><div class="apc-map-sel" hidden></div><div class="apc-map-box" hidden></div><p class="apc-map-hint faint">${esc(tr('Drag a screen to arrange it. Click to open it. Shift drag selects several.'))}</p>`;
    m.querySelectorAll('[data-z]').forEach(b => b.onclick = e => { e.stopPropagation(); const z = b.dataset.z; if (z === 'in') zoom(1.25); else if (z === 'out') zoom(0.8); else if (z === 'fit') fitMap(); else if (z === 'done') toggleMap(false); else if (z === 'tidy') { const s = st(); if (s.doc.map) { const c = clone(s.doc); delete c.map; X.commit(c, 'Tidied the map.'); } drawMap(); fitMap(); } });
    m.addEventListener('wheel', e => { e.preventDefault(); const r = m.getBoundingClientRect(); if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 40) zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top); else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); } }, { passive: false });
    let g = null;
    m.addEventListener('pointerdown', e => {
      if (e.target.closest('.apc-map-tools, .apc-map-sel') || e.button > 0) return;
      const s = st(), card = e.target.closest('[data-ms]'), r = m.getBoundingClientRect();
      g = { x: e.clientX, y: e.clientY, moved: false, card: card ? card.dataset.ms : '', shift: e.shiftKey, vx: view.x, vy: view.y, r };
      if (g.card && !g.shift) { const pos = layout(s.doc), ids = s.mapSel.includes(g.card) ? s.mapSel.slice() : [g.card]; g.start = Object.fromEntries(ids.map(id => [id, { ...pos[id] }])); }
      try { m.setPointerCapture(e.pointerId); } catch {}
    });
    m.addEventListener('pointermove', e => {
      if (!g) return; const dx = e.clientX - g.x, dy = e.clientY - g.y; if (!g.moved && Math.hypot(dx, dy) < 5) return; g.moved = true;
      const s = st();
      if (g.card && !g.shift) { if (!s.canDraft) return; for (const [id, p] of Object.entries(g.start)) { const el = m.querySelector(`[data-ms="${CSS.escape(id)}"]`); if (el) { el.style.left = Math.round(p.x + dx / view.k) + 'px'; el.style.top = Math.round(p.y + dy / view.k) + 'px'; el.classList.add('drag'); } } m.querySelector('.apc-map-svg').style.opacity = '0.25'; }
      else if (g.shift) { const bx = m.querySelector('.apc-map-box'); bx.hidden = false; const x = Math.min(g.x, e.clientX) - g.r.left, y = Math.min(g.y, e.clientY) - g.r.top; bx.style.cssText = `left:${x}px;top:${y}px;width:${Math.abs(dx)}px;height:${Math.abs(dy)}px`; }
      else { view.x = g.vx + dx; view.y = g.vy + dy; applyView(); }
    });
    const end = e => {
      if (!g) return; const s = st(), h = g; g = null; const dx = e.clientX - h.x, dy = e.clientY - h.y;
      m.querySelector('.apc-map-box').hidden = true;
      if (!h.moved) {
        if (h.card && h.shift) { s.mapSel = s.mapSel.includes(h.card) ? s.mapSel.filter(x => x !== h.card) : s.mapSel.concat(h.card); return drawMap(); }
        if (h.card) { s.screen = h.card; return toggleMap(false); }
        if (s.mapSel.length) { s.mapSel = []; drawMap(); } return;
      }
      if (h.card && !h.shift) { if (!s.canDraft) return drawMap(); const at = {}, pos = layout(s.doc); for (const id of Object.keys(pos)) at[id] = pos[id]; for (const [id, p] of Object.entries(h.start)) at[id] = { x: Math.round(p.x + dx / view.k), y: Math.round(p.y + dy / view.k) }; const c = clone(s.doc); c.map = at; X.commit(c, '', true); return drawMap(); }
      if (h.shift) { const x0 = (Math.min(h.x, e.clientX) - h.r.left - view.x) / view.k, y0 = (Math.min(h.y, e.clientY) - h.r.top - view.y) / view.k, x1 = x0 + Math.abs(dx) / view.k, y1 = y0 + Math.abs(dy) / view.k, pos = layout(s.doc); s.mapSel = Object.keys(pos).filter(id => pos[id].x < x1 && pos[id].x + CARD.w > x0 && pos[id].y < y1 && pos[id].y + CARD.h > y0); return drawMap(); }
    };
    m.addEventListener('pointerup', end); m.addEventListener('pointercancel', () => { g = null; drawMap(); });
    m.addEventListener('keydown', e => { const card = e.target.closest && e.target.closest('[data-ms]'); if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); st().screen = card.dataset.ms; toggleMap(false); } });
  }

  // ---------- Play with working features: the real exported app, in a frame ----------
  let playUrl = '';
  function playFrame(stage) {
    const s = st(), d = viewDoc(); if (!(d.features && d.features.length) || !window.TribeAppFeatures) return false;
    try {
      const files = Object.fromEntries(A().pwa({ ...d, start: s.screen }).filter(f => typeof f[1] === 'string'));
      const js = String(files['app.js']).replace(/try \{ if \('serviceWorker' in navigator\)[^\n]*\n/, '');   // the editor's page is not the app: no service worker here
      if (playUrl) URL.revokeObjectURL(playUrl); playUrl = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
      const base = new URL('assets/site-fonts/', location.href).href;
      const html = String(files['index.html']).replace(/<link rel="(?:manifest|icon|apple-touch-icon)"[^>]*>/g, '').replace(/url\((['"]?)fonts\//g, `url($1${base}`).replace('<script src="app.js"></script>', `<script src="${playUrl}"></script>`);
      const sz = SIZE();
      stage.innerHTML = `<iframe class="apc-playframe" id="apc-playframe" title="${esc(d.name)}" width="${sz.w}" height="${sz.h}" data-i18n-skip></iframe>`;
      stage.firstChild.srcdoc = html; return true;
    } catch (e) { return false; }
  }
  function stopPlay() { if (playUrl) { URL.revokeObjectURL(playUrl); playUrl = ''; } }

  // after the editor draws the stage
  function afterStage() {
    const r = root(), s = st(); if (!r || !s) return;
    paintTop(); paintMulti(); placePins();
    const sc = r.querySelector('.apc-edit .ax-scroll'); if (sc) sc.addEventListener('scroll', () => { placePins(); }, { passive: true });
    if (s.map) drawMap();
  }
  window.addEventListener('resize', () => { if (root() && st()) { placePins(); } });
  function onWs(m) { if (m && m.type === 'app-comments' && st() && st().open && m.project === st().pid) loadComments(); }

  const playingReal = () => !!(root() && root().querySelector('#apc-playframe'));
  window.TribeAppPlus = { route, CARD, init(x) { X = x; if (C() && C().on) C().on('ws', onWs); }, onBuild, paintTop, onKey, shiftClick, paintMulti, selIds, multiBar, multiAct, multiInsp, copy, cut, paste, clip, picField, wirePicField, setPicture, shrink, keysSheet, historySheet, rememberLocal, versions, versionDoc, nameVersion, loadComments, commentMode, stageComment, placePins, thread, inspEmpty, toggleMap, drawMap, fitMap, zoom, mapAct, layout, links, reachable, playFrame, stopPlay, playingReal, afterStage, viewDoc, SIZE, setDevice, peek, view: () => view };
})();
