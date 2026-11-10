// Talk to Flint beside the design canvas, like Figma Make: the canvas on the left, a chat with Flint on the right.
//   Simple (the default): just the canvas and Flint's pane. Layers and properties stay out of the way; selecting a layer
//     shows a small quick bar (fill, smaller, bigger, delete, ask Flint about this).
//   Advanced: the full editor (layers, properties, Inspect) and Flint becomes a tab in the right panel.
//   Switch in the top bar (Simple · Advanced) or with Ctrl Shift \. The choice is remembered per person on this device.
// Flint's moves are the free canvas engine (app/ui/canvas/flint.js run() -> server/canvasai.js): a screen from a
// template, tidy, rename, dark or light version, variants. Each step lands as your own change (Ctrl Z works) and every
// Flint message has its own Undo. The thread is per design file and shared live with everyone on it
// (server/canvaschat.js). Phones: Flint opens as a bottom sheet over the full-screen canvas.
//   window.TribeCanvasFlintPane = { mount(E), mode(), setMode(m), open(), close(), askFlint(text, ctx) }
// askFlint is the one door to Flint's brain here, so a local language engine (app/ui/flintnlu.js) can plug in later.
(function () {
  'use strict';
  const C = window.TribeClient;
  const MODE_KEY = 'tribecode.canvas.mode';
  const START = ['A login screen', 'A pricing section', 'A mobile home for a café', 'A dashboard in dark mode'];
  const WITH_SEL = ['Dark mode version', 'Make variants', 'Tidy up', 'Rename layers'];
  let E = null, pane = null, quick = null, items = [], loadedFor = '', busy = false, notes = [];
  const snaps = new Map();   // Flint message id -> that undo step (this browser only)
  const T = k => (E && E.T ? E.T(k) : k);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = s => document.querySelector(s);
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const FF = () => window.TribeFlintFly;
  const flame = (w = 14, h = 18) => `<img src="assets/flint.svg" alt="" width="${w}" height="${h}">`;
  const pid = () => (C.project ? C.project() : '');

  // ---------- mode ----------
  // New people start in Simple. Automated test browsers start in Advanced (the old layout) unless ?flintpane=1.
  function mode() {
    const m = ls.get(MODE_KEY);
    if (m === 'simple' || m === 'advanced') return m;
    return navigator.webdriver && !/[?&]flintpane=1/.test(location.search) ? 'advanced' : 'simple';
  }
  function setMode(m) { ls.set(MODE_KEY, m === 'advanced' ? 'advanced' : 'simple'); place(); }

  // ---------- the one door to Flint ----------
  async function askFlint(text, ctx) {
    const N = window.TribeFlintNLU;
    if (N && typeof N.canvas === 'function') { const r = await N.canvas(text, ctx); if (r) return r; }
    return window.TribeCanvasFlint.run(text);
  }

  function mount(editor) {
    E = editor;
    const cv = $('#cv'), body = cv && cv.querySelector('.cv-body'); if (!body || $('#cv-fpane')) return;
    pane = document.createElement('aside');
    pane.className = 'cv-fpane'; pane.id = 'cv-fpane'; pane.setAttribute('aria-label', 'Flint');
    pane.innerHTML = `
      <div class="fp-head">${flame()}<b>Flint</b><span class="fp-sub">${esc(T('designs with you'))}</span>
        <button type="button" class="fp-x" data-fp="hide" title="${esc(T('Hide Flint'))}" aria-label="${esc(T('Hide Flint'))}">✕</button></div>
      <p class="fp-free"><span class="fp-chip">${esc(T('Free'))}</span><span>${esc(T('Screens, tidy, rename, themes and variants need no AI'))}</span></p>
      <div class="fp-log" id="fp-log" aria-live="polite"></div>
      <div class="fp-chips" id="fp-chips"></div>
      <div class="fp-notes" id="fp-notes" hidden></div>
      <form class="fp-comp" id="fp-form" autocomplete="off">
        <textarea id="fp-in" rows="2" maxlength="600" placeholder="${esc(T('Describe a screen or a change…'))}" aria-label="${esc(T('Ask Flint to design'))}"></textarea>
        <div class="fp-row">
          <button type="button" class="fp-ib" data-fp="mic" data-dictate="fp-in" title="${esc(T('Dictate'))} (Ctrl Shift D)" aria-label="${esc(T('Dictate'))}"><svg class="fp-svg" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-mic"/></svg></button>
          <button type="button" class="btn sm" data-fp="note" title="${esc(T('Add a note and send several together'))}">+ ${esc(T('Note'))}</button>
          <span class="fp-sp"></span>
          <button type="submit" class="btn sm primary fp-send">${esc(T('Send'))}</button>
        </div>
      </form>`;
    body.appendChild(pane);
    // the mode switch, in the top bar beside the file name
    const head = cv.querySelector('.cv-head'), acts = head && head.querySelector('.cv-head-acts');
    if (head && acts && !$('#cv-mode')) {
      const sw = document.createElement('div');
      sw.className = 'cv-mode'; sw.id = 'cv-mode'; sw.setAttribute('role', 'radiogroup'); sw.setAttribute('aria-label', T('Editing tools'));
      sw.title = T('Advanced tools') + ' (Ctrl Shift \\)';
      sw.innerHTML = `<button type="button" role="radio" data-mode="simple">${esc(T('Simple'))}</button><button type="button" role="radio" data-mode="advanced">${esc(T('Advanced'))}</button>`;
      head.insertBefore(sw, acts);
      sw.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    }
    // events
    pane.querySelector('#fp-form').addEventListener('submit', e => { e.preventDefault(); submit(); });
    const inp = pane.querySelector('#fp-in');
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); inp.blur(); E.focus(); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd' && window.TribeSpeech) { e.preventDefault(); window.TribeSpeech.dictate(inp); }
    });
    pane.addEventListener('click', onClick);
    window.TribeCanvasFlint && window.TribeCanvasFlint.use({ open, toggle });
    // Ctrl Shift \ switches Simple / Advanced
    addEventListener('keydown', e => {
      if (document.body.dataset.view !== 'canvas' || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.code !== 'Backslash') return;
      e.preventDefault(); e.stopImmediatePropagation(); setMode(mode() === 'simple' ? 'advanced' : 'simple');
    }, true);
    // the Flint tab in Advanced (code.js switches Design / Inspect; this shows or hides the pane)
    const tabs = cv.querySelector('.cv-rtabs');
    if (tabs) tabs.addEventListener('click', e => { const b = e.target.closest('[data-rtab]'); if (b) showTab(b.dataset.rtab === 'flint'); });
    C.on('ws', onWs);
    // the quick bar over a selection (Simple)
    quick = document.createElement('div');
    quick.className = 'fp-quick'; quick.id = 'fp-quick'; quick.hidden = true;
    quick.innerHTML = `
      <label class="fp-qb fp-qcol" title="${esc(T('Fill'))}"><input type="color" data-q="fill" aria-label="${esc(T('Fill'))}"><i></i></label>
      <button type="button" class="fp-qb" data-q="smaller" title="${esc(T('Smaller'))}" aria-label="${esc(T('Smaller'))}">A−</button>
      <button type="button" class="fp-qb" data-q="bigger" title="${esc(T('Bigger'))}" aria-label="${esc(T('Bigger'))}">A+</button>
      <button type="button" class="fp-qb" data-q="del" title="${esc(T('Delete'))} (Del)" aria-label="${esc(T('Delete'))}"><svg class="fp-svg" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10M8 6V4h4v2M6.5 6l.7 10h5.6l.7-10"/></svg></button>
      <span class="fp-qalign" data-qalign>
        <span class="fp-qsep"></span>
        ${[['l', 'Align left', '<path d="M4 3v14M7 6h9M7 12h5"/>'], ['ch', 'Align centre', '<path d="M10 3v14M5 6h10M7 12h6"/>'], ['r', 'Align right', '<path d="M16 3v14M4 6h9M8 12h5"/>'], ['t', 'Align top', '<path d="M3 4h14M6 7v9M12 7v5"/>'], ['cv', 'Align middle', '<path d="M3 10h14M6 5v10M12 7v6"/>'], ['b', 'Align bottom', '<path d="M3 16h14M6 4v9M12 8v5"/>'], ['dh', 'Spread evenly', '<path d="M3 4v12M17 4v12M8 7h4v6H8z"/>']].map(([k, l, d]) => `<button type="button" class="fp-qb" data-q="align" data-k="${k}" title="${esc(T(l))}" aria-label="${esc(T(l))}"><svg class="fp-svg" viewBox="0 0 20 20" aria-hidden="true">${d}</svg></button>`).join('')}
      </span>
      <span class="fp-qsep"></span>
      <button type="button" class="fp-qb fp-qask" data-q="ask">${flame(11, 14)}<span>${esc(T('Ask Flint'))}</span></button>`;
    E.stage.appendChild(quick);
    quick.addEventListener('pointerdown', e => e.stopPropagation());
    quick.addEventListener('click', onQuick);
    quick.querySelector('[data-q="fill"]').addEventListener('input', e => { const c = e.target.value; if (E.sel.length) E.patchMany(E.sel, n => { if (n.t === 'instance') { n.ov = Object.assign({}, n.ov); n.ov.self = Object.assign({}, n.ov.self, { fill: c }); } else if (n.t === 'text') n.tx = Object.assign({}, n.tx, { col: c }); else n.fill = c; }); });
    E.stage.addEventListener('pointerdown', () => { dragging = true; quick.hidden = true; });
    addEventListener('pointerup', () => { if (dragging) { dragging = false; setTimeout(paintQuick, 30); } });
    setInterval(tick, 400);
    matchMedia('(max-width: 820px)').addEventListener('change', () => place());
    place();
  }
  let dragging = false, lastSelKey = '', lastFile = '';
  function tick() {
    if (!E || document.body.dataset.view !== 'canvas') return;
    const fk = pid() + '/' + E.file;
    if (fk !== lastFile) { lastFile = fk; load(); }
    const sk = E.sel.join(',');
    if (sk !== lastSelKey) { lastSelKey = sk; chips(); }
    paintQuick();
  }

  // ---------- where the pane lives ----------
  function place() {
    const cv = $('#cv'); if (!cv || !pane) return;
    const simple = mode() === 'simple';
    cv.classList.toggle('mode-simple', simple); cv.classList.toggle('mode-adv', !simple);
    document.querySelectorAll('#cv-mode [data-mode]').forEach(b => { const on = b.dataset.mode === mode(); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    const right = $('#cv-right'), body = cv.querySelector('.cv-body'), tabs = cv.querySelector('.cv-rtabs');
    let tab = tabs && tabs.querySelector('[data-rtab="flint"]');
    if (simple || isPhone()) {   // phones: Flint is always its own bottom sheet
      if (tab && isPhone()) { if (tab.classList.contains('on')) { const d = tabs.querySelector('[data-rtab="design"]'); if (d) d.click(); } tab.remove(); tab = null; }
      if (pane.parentNode !== body) body.appendChild(pane);
      pane.hidden = false; right && right.classList.remove('fp-on');
      if (tab && tab.classList.contains('on')) { const d = tabs.querySelector('[data-rtab="design"]'); if (d) d.click(); }
    } else {
      if (tabs && !tab) { tab = document.createElement('button'); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', 'false'); tab.dataset.rtab = 'flint'; tab.innerHTML = `${flame(10, 13)} ${esc(T('Flint'))}`; tabs.appendChild(tab); }
      if (right && pane.parentNode !== right) right.appendChild(pane);
      showTab(!!(tab && tab.classList.contains('on')));
    }
    const tr = $('#cv-tog-right');
    if (tr) { const t = simple ? T('Show or hide Flint') : T('Show or hide properties'); tr.title = t + (simple ? '' : ' (Ctrl Alt \\)'); tr.setAttribute('aria-label', t); }
    quick && (quick.hidden = true);
    chips(); paintLog();
    dispatchEvent(new Event('resize'));   // the canvas re-measures its stage
  }
  function showTab(on) {
    const right = $('#cv-right'); if (!pane || mode() === 'simple' || isPhone()) return;
    pane.hidden = !on; if (right) right.classList.toggle('fp-on', on);
    if (on) setTimeout(() => { scrollLog(); }, 0);
  }
  // open: the flame button, Shift I, "Ask Flint" on the quick bar
  function open(prefill) {
    const cv = $('#cv'); if (!cv || !pane) return;
    if (isPhone()) { cv.classList.remove('sheet-left', 'sheet-right'); cv.classList.add('sheet-flint'); }
    else if (mode() === 'simple') { if (cv.classList.contains('no-right')) { const b = $('#cv-tog-right'); if (b) b.click(); } }
    else { if (cv.classList.contains('no-right')) { const b = $('#cv-tog-right'); if (b) b.click(); } const t = cv.querySelector('.cv-rtabs [data-rtab="flint"]'); if (t && !t.classList.contains('on')) t.click(); }
    paintLog();
    const i = pane.querySelector('#fp-in');
    if (typeof prefill === 'string') { i.value = prefill; }
    // phones: no auto focus (the keyboard would jump up and scroll the page); desktop: focus without scrolling
    if (!isPhone() || typeof prefill === 'string') setTimeout(() => { i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length); }, 30);
    flameBtn(true);
  }
  function close() {
    const cv = $('#cv'); if (!cv) return;
    if (isPhone()) cv.classList.remove('sheet-flint');
    else if (mode() === 'simple') { if (!cv.classList.contains('no-right')) { const b = $('#cv-tog-right'); if (b) b.click(); } }
    else { const d = cv.querySelector('.cv-rtabs [data-rtab="design"]'); if (d) d.click(); }
    flameBtn(false); E && E.focus();
  }
  function shown() {
    const cv = $('#cv'); if (!cv || !pane) return false;
    if (isPhone()) return cv.classList.contains('sheet-flint');
    if (mode() === 'simple') return !cv.classList.contains('no-right');
    return !pane.hidden && !cv.classList.contains('no-right');
  }
  function toggle() { if (shown()) close(); else open(); }
  function flameBtn(on) { const b = $('#cv-flint-btn'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } }

  // ---------- the thread ----------
  async function load() {
    if (!E || !pane) return;
    const key = pid() + '/' + E.file; loadedFor = key;
    try { const r = await C.api('/canvaschat/' + encodeURIComponent(E.file)); if (loadedFor !== key) return; items = r.items || []; }
    catch { items = []; }
    paintLog();
  }
  function onWs(m) {
    if (!m || m.type !== 'cnv-chat' || !E) return;
    if (m.project && m.project !== pid()) return;
    if (m.file !== E.file || !m.item) return;
    upsert(m.item); paintLog();
  }
  function upsert(it) { const i = items.findIndex(x => x.id === it.id); if (i >= 0) items[i] = it; else items.push(it); }
  const ago = iso => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
  function paintLog() {
    const log = pane && pane.querySelector('#fp-log'); if (!log) return;
    if (!items.length && !busy) {
      log.innerHTML = `<div class="fp-hello">${flame(22, 28)}<b>${esc(T('Tell me what to design'))}</b><span>${esc(T('A screen, a section or a change to what you select. I build real frames with auto layout that you can edit, and every step can be undone.'))}</span></div>`;
      return;
    }
    const meId = (C.state && C.state().me && C.state().me.id) || '';
    log.innerHTML = items.map(it => {
      if (it.role === 'me') return `<div class="fp-msg fp-me"><span class="fp-av" style="--a:${esc(it.color || '#6C7CFF')}">${esc((it.name || '?').slice(0, 1).toUpperCase())}</span><div><p class="fp-who">${esc(it.by === meId ? T('You') : it.name)} <time>${esc(ago(it.at))}</time></p><p class="fp-t">${esc(it.text)}</p></div></div>`;
      const canUndo = !it.undone && it.kind && it.kind !== 'tier' && it.kind !== 'freeform' && it.kind !== 'note' && (snaps.has(it.id) || (it.ids && it.ids.length)) && E.canEdit;
      const honest = it.kind === 'tier' || it.kind === 'freeform';
      return `<div class="fp-msg fp-flint${it.undone ? ' is-undone' : ''}">${flame(13, 16)}<div><p class="fp-t">${honest ? `<b>${esc(it.kind === 'tier' ? T('Bigger than my free tier.') : T('That one is freeform.'))}</b> ` : ''}${esc(it.text)}</p>
        <p class="fp-acts">${it.undone ? `<span class="fp-undone">${esc(T('Undone'))}</span>` : ''}${it.focus && !it.undone ? `<button type="button" class="fp-link" data-fp="show" data-id="${esc(it.focus)}">${esc(T('Show'))}</button>` : ''}${canUndo ? `<button type="button" class="fp-link" data-fp="undo" data-id="${esc(it.id)}">${esc(T('Undo'))}</button>` : ''}${honest && it.ref ? `<button type="button" class="btn sm primary" data-fp="hand" data-text="${esc(it.ref)}">${esc(T('Send to my AI helper'))}</button>` : ''}<time>${esc(ago(it.at))}</time></p></div></div>`;
    }).join('') + (busy ? `<div class="fp-msg fp-flint is-wait">${flame(13, 16)}<div><p class="fp-t">${esc(T('On it…'))}</p></div></div>` : '');
    scrollLog();
  }
  function scrollLog() { const log = pane && pane.querySelector('#fp-log'); if (log) log.scrollTop = log.scrollHeight; }
  let chipKey = '';
  function chips() {
    const box = pane && pane.querySelector('#fp-chips'); if (!box || !E) return;
    const list = E.sel.length ? WITH_SEL : START, k = list.join('|') + mode();
    if (k === chipKey) return; chipKey = k;
    box.innerHTML = list.map(c => `<button type="button" class="fp-chipb" data-fp="chip" data-text="${esc(c)}">${esc(T(c))}</button>`).join('');
  }
  function paintNotes() {
    const box = pane.querySelector('#fp-notes');
    box.hidden = !notes.length;
    box.innerHTML = notes.length ? `<ol>${notes.map((n, i) => `<li><span>${esc(n.text)}</span><button type="button" class="fp-x sm" data-fp="unnote" data-i="${i}" aria-label="${esc(T('Remove'))}">✕</button></li>`).join('')}</ol>
      <p class="fp-row"><button type="button" class="btn sm primary" data-fp="applynotes">${esc(T('Send all'))} (${notes.length})</button><button type="button" class="btn sm" data-fp="clearnotes">${esc(T('Clear'))}</button></p>` : '';
  }

  // ---------- asking ----------
  async function post(body) { try { const r = await C.api('/canvaschat/' + encodeURIComponent(E.file), { method: 'POST', body }); upsert(r.item); return r.item; } catch { const it = Object.assign({ id: 'l' + Date.now(), at: new Date().toISOString(), name: T('You') }, body); upsert(it); return it; } }
  function submit() {
    const i = pane.querySelector('#fp-in'); const v = i.value.trim();
    if (!v) return; i.value = ''; send(v);
  }
  async function send(text, keepSel) {
    if (!E || busy) return;
    if (!E.canEdit) { await post({ role: 'flint', kind: 'note', text: T('View only: ask the host to make you a builder to design here.') }); paintLog(); return; }
    if (keepSel) E.select(keepSel);
    busy = true;
    await post({ role: 'me', text });
    paintLog();
    const ff = FF(); if (ff) ff.work(E.stage, T('Designing…'));
    let item;
    try {
      const { r, pairs } = await askFlint(text, { sel: E.sel.slice(), file: E.file });
      if (r.kind === 'tier' || r.kind === 'freeform') { if (ff) ff.home(); item = await post({ role: 'flint', kind: r.kind, text: r.why || r.say || '', ref: text }); }
      else {
        const ids = (r.create || []).map(n => n.id).filter(Boolean);
        item = await post({ role: 'flint', kind: r.kind || 'done', text: r.say || T('Done.'), focus: r.focus || '', ids });
        if (pairs) snaps.set(item.id, pairs);
        if (ff) { const t = r.focus && E.elOf(r.focus); if (t) setTimeout(() => ff.done(t, r.kind === 'build' ? T('Designed ✓') : T('Done ✓')), 120); else ff.home(); }
      }
    } catch (e) { if (ff) ff.home(); await post({ role: 'flint', kind: 'note', text: e.message || String(e) }); }
    finally { busy = false; paintLog(); }
  }
  async function onClick(e) {
    const b = e.target.closest('[data-fp]'); if (!b) return;
    const a = b.dataset.fp;
    if (a === 'hide') return close();
    if (a === 'chip') return send(b.dataset.text);
    if (a === 'mic') { if (window.TribeSpeech) window.TribeSpeech.dictate(pane.querySelector('#fp-in')); return; }
    if (a === 'note') { const i = pane.querySelector('#fp-in'); const v = i.value.trim(); if (!v) { i.focus(); return; } notes.push({ text: v, sel: E.sel.slice() }); i.value = ''; paintNotes(); i.focus(); return; }
    if (a === 'unnote') { notes.splice(+b.dataset.i, 1); paintNotes(); return; }
    if (a === 'clearnotes') { notes = []; paintNotes(); return; }
    if (a === 'applynotes') { const list = notes; notes = []; paintNotes(); for (const n of list) { await send(n.text, n.sel.length ? n.sel : null); } return; }
    if (a === 'show') { const id = b.dataset.id; if (E.S.get(id)) { E.select([id]); E.fit(true); } return; }
    if (a === 'undo') {
      const it = items.find(x => x.id === b.dataset.id); if (!it) return;
      const pairs = snaps.get(it.id) || (it.ids || []).map(id => ({ id, before: null }));
      E.revert(pairs); snaps.delete(it.id); it.undone = true; paintLog();
      try { const r = await C.api('/canvaschat/' + encodeURIComponent(E.file) + '/undo', { method: 'POST', body: { id: it.id } }); upsert(r.item); paintLog(); } catch {}
      return;
    }
    if (a === 'hand') {
      b.disabled = true;
      const msg = await window.TribeCanvasFlint.sendToHelpers(b.dataset.text);
      await post({ role: 'flint', kind: 'note', text: msg }); paintLog();
    }
  }

  // ---------- the quick bar over a selection (Simple) ----------
  function paintQuick() {
    if (!quick || !E) return;
    const on = mode() === 'simple' && !isPhone() && E.canEdit && E.sel.length > 0 && !dragging && document.body.dataset.view === 'canvas' && !document.querySelector('#cv-world [contenteditable="true"]');
    if (!on) { quick.hidden = true; return; }
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const id of E.sel) { const el = E.elOf(id); if (!el) continue; const r = el.getBoundingClientRect(); top = Math.min(top, r.top); left = Math.min(left, r.left); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom); }
    if (!Number.isFinite(top)) { quick.hidden = true; return; }
    const sr = E.stage.getBoundingClientRect();
    const al = quick.querySelector('[data-qalign]'); if (al) al.hidden = !(E.sel.length > 1 && window.TribeCanvasExtras);   // multi-select: align and spread (extras.js)
    quick.hidden = false;
    const w = quick.offsetWidth || 260, h = quick.offsetHeight || 36;
    let y = top - sr.top - h - 30;   // above the selection (clear of its name label), else below it
    if (y < 8) y = Math.min(sr.height - h - 80, bottom - sr.top + 34);
    const x = Math.max(8, Math.min(sr.width - w - 8, (left + right) / 2 - sr.left - w / 2));
    quick.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(8, y))}px)`;
    const n = E.S.get(E.sel[0]), col = n && (n.t === 'text' ? (n.tx && n.tx.col) : n.fill);
    const inp = quick.querySelector('[data-q="fill"]'), sw = quick.querySelector('.fp-qcol i');
    if (col && /^#[0-9a-f]{6}/i.test(col)) { if (document.activeElement !== inp) inp.value = col.slice(0, 7); sw.style.background = col; } else sw.style.background = 'transparent';
  }
  function onQuick(e) {
    const b = e.target.closest('[data-q]'); if (!b || b.dataset.q === 'fill') return;
    const q = b.dataset.q;
    if (q === 'del') { E.removeSel(); quick.hidden = true; return; }
    if (q === 'align') { if (window.TribeCanvasExtras) window.TribeCanvasExtras.align(b.dataset.k); return; }
    if (q === 'ask') { const n = E.S.get(E.sel[0]); open(n ? `${T('This')} “${(n.name || n.t)}”: ` : ''); return; }
    const k = q === 'bigger' ? 1.1 : 1 / 1.1;
    E.patchMany(E.sel, n => {
      if (n.t === 'text') { const tx = n.tx = Object.assign({}, n.tx); tx.s = Math.max(6, Math.round((tx.s || 16) * k)); }
      else { if (Number.isFinite(n.w)) n.w = Math.max(4, Math.round(n.w * k)); if (Number.isFinite(n.h)) n.h = Math.max(4, Math.round(n.h * k)); }
    });
  }

  window.TribeCanvasFlintPane = { mount, mode, setMode, open, close, toggle, askFlint, items: () => items.slice() };
  // the canvas may have been built before this file loaded (scripts load one by one): mount now
  if (document.getElementById('cv') && window.TribeCanvas && window.TribeCanvas._e) mount(window.TribeCanvas._e);
})();
