// Motion Studio (feat/motion, docs/MOTION-STUDIO.md): make motion graphics in the app. The engine is app/ui/motionkit.js
// (a pure function of time); this file is the editor around it.
//   - Opens full screen from Design › Motion graphic, from Flint ("make a motion graphic", "use the UI reel"), from the
//     Launch kit (open({ template: 'app-preview', screens })) and from a saved file.
//   - Preview canvas, play / pause / scrub / loop, a beat timeline with the states on it (drag a state to move it),
//     a state list, a property sheet (size, radius, fill, words, position, the cursor's acts), the camera, 1:1 9:16 16:9 4:5.
//   - Templates by category (thumbnails drawn by the engine itself), 50+ feel presets, your own song with tempo detection,
//     a click track and UI sounds.
//   - Export: MP4 (Mediabunny from a CDN when it loads, MPL-2.0, never bundled), WebM, GIF, PNG, a self-contained HTML
//     page, and "Put it on my website" (a section of the website designer that plays it).
//   - Flint: a box in the studio, and the global Flint (flintlocal.js routes motion.* steps here, view 'motion').
//   - Saved in the project (server/motionstudio.js: motion/<key>.motion.json), on this device with no tribe
//     (localfiles.js kind 'motion'), with undo and redo.
//   - Suggestions: registers a provider with window.TribeSuggest when it exists (brand colour, new site sections, a song).
// Public: window.TribeMotionStudio = { open(opts), close(), isOpen(), state(), command(step), ask(text), thumb(id, w, h),
//   exportAs(fmt, o), seekTo(t), list(pid), templates() }
(function () {
  'use strict';
  const K = () => window.TribeMotionKit, C = window.TribeClient;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? (window.TribeI18n.t(s, s) || s) : s);
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const icon = (n, sz = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, sz, 'mos-i') : '');
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const connected = () => !!(C && C.connected && C.connected());
  const phoneOnly = () => !!(window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo());
  const projectId = () => (connected() && !phoneOnly() && C.project && C.project()) || '';
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'motion';
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0')).join('');
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const tok = () => ((window.TribeStore && window.TribeStore.get().server) || {}).token || '';
  const authH = () => ({ ...(tok() ? { Authorization: 'Bearer ' + tok() } : {}), ...(pid ? { 'X-Project': pid } : {}) });
  const MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm';

  let root = null, doc = null, key = '', pid = '', local = '', t = 0, playing = false, raf = 0, last = 0, sel = 0, hist = [], fut = [], saveT = 0, savedAt = '', tab = 'tpl', pick = null, audio = null, fontsReady = null;

  // ---------- fonts: the engine draws with Inter (bundled, SIL OFL) ----------
  function loadFonts() {
    if (fontsReady) return fontsReady;
    if (!document.getElementById('mos-fonts')) {
      const st = document.createElement('style'); st.id = 'mos-fonts';
      st.textContent = "@font-face{font-family:Inter;font-weight:500;font-display:block;src:url(motionfonts/Inter-Medium.woff) format('woff')}@font-face{font-family:Inter;font-weight:600;font-display:block;src:url(motionfonts/Inter-SemiBold.woff) format('woff')}@font-face{font-family:Inter;font-weight:700 800;font-display:block;src:url(motionfonts/InterDisplay-ExtraBold.woff) format('woff')}";
      document.head.append(st);
    }
    fontsReady = Promise.all(['500 20px Inter', '600 20px Inter', '800 20px Inter'].map(f => document.fonts && document.fonts.load ? document.fonts.load(f).catch(() => null) : null)).then(() => true);
    return fontsReady;
  }

  // ---------- thumbnails, drawn by the engine ----------
  const THUMBS = {};
  function thumb(id, w = 320, h = 200) {
    const k = `${id}:${w}x${h}`; if (THUMBS[k]) return THUMBS[k];
    const d = K().make(id), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    const s = Math.min(w / d.size.w, h / d.size.h), ox = (w - d.size.w * s) / 2, oy = (h - d.size.h * s) / 2;
    g.fillStyle = d.theme.bg; g.fillRect(0, 0, w, h); g.translate(ox, oy); g.scale(s, s);
    K().draw(g, d, K().beatSec(d, d.thumbAt >= 0 ? d.thumbAt : 2), { blur: 0 });
    return (THUMBS[k] = c.toDataURL('image/png'));
  }

  // ---------- history ----------
  function change(fn, note) {
    hist.push(JSON.stringify(doc)); if (hist.length > 80) hist.shift(); fut = [];
    const r = fn(clone(doc)); if (r) doc = r; doc = K().normalize(doc); doc.rev = (doc.rev || 0) + 1;
    if (sel >= doc.states.length) sel = doc.states.length - 1;
    scheduleSave(); renderAll(); if (note) say(note);
  }
  function undo() { if (!hist.length) return; fut.push(JSON.stringify(doc)); doc = K().normalize(JSON.parse(hist.pop())); doc.rev++; scheduleSave(); renderAll(); say(tr('Undone.')); }
  function redo() { if (!fut.length) return; hist.push(JSON.stringify(doc)); doc = K().normalize(JSON.parse(fut.pop())); doc.rev++; scheduleSave(); renderAll(); say(tr('Redone.')); }

  // ---------- saving: the project, this device, or a draft ----------
  function scheduleSave() { clearTimeout(saveT); setSaved(tr('Saving…')); saveT = setTimeout(save, 600); }
  function setSaved(s) { const el = root && $('#mos-saved', root); if (el) el.textContent = s; }
  async function save() {
    clearTimeout(saveT); if (!doc) return;
    try {
      if (pid) { if (!key) key = slug(doc.name) + '-' + rid(); window.__mosSelfAt = Date.now(); await C.api(`/projects/${encodeURIComponent(pid)}/motion/${encodeURIComponent(key)}`, { method: 'PUT', body: { doc } }); }
      else if (window.TribeLocalFiles && window.TribeLocalFiles.KINDS && window.TribeLocalFiles.KINDS.motion) {
        const LF = window.TribeLocalFiles; await LF.ready;
        if (local) await LF.save(local, { title: doc.name, body: JSON.stringify(doc) }); else { const it = await LF.create('motion', { title: doc.name, body: JSON.stringify(doc) }); local = it.id; }
      } else { try { localStorage.setItem('tribecode.motion.draft', JSON.stringify(doc)); } catch {} }
      savedAt = new Date().toISOString(); setSaved(tr('Saved'));
    } catch (e) { setSaved(tr('Not saved')); say(e.message || String(e)); }
  }
  async function list(p) { p = p || projectId(); if (!p) return []; try { return (await C.api(`/projects/${encodeURIComponent(p)}/motion`)).items || []; } catch { return []; } }

  // ---------- open / close ----------
  async function open(o = {}) {
    if (!K()) { toast(tr('Motion Studio did not load. Reload the app.')); return null; }
    await loadFonts();
    pid = o.pid !== undefined ? o.pid : projectId(); key = o.key || ''; local = o.local || ''; hist = []; fut = []; sel = 0; t = 0;
    let d = null;
    if (o.doc) d = o.doc;
    else if (key && pid) { try { d = (await C.api(`/projects/${encodeURIComponent(pid)}/motion/${encodeURIComponent(key)}`)).doc; } catch (e) { toast(e.message); } }
    else if (local && window.TribeLocalFiles) { try { const it = await window.TribeLocalFiles.get(local); d = it && JSON.parse(it.body || 'null'); } catch {} }
    if (!d) d = K().make(o.template || 'ui-reel', { screens: o.screens, name: o.name, caption: o.caption, cta: o.cta, accent: o.accent || brandAccent(), aspect: o.aspect });
    doc = K().normalize(d); doc.rev = (doc.rev || 0) + 1;
    await K().load(doc);
    mount();
    if (!key && !local) scheduleSave();
    if (o.ask) setTimeout(() => ask(o.ask), 50);
    play(o.autoplay !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches && !navigator.webdriver);
    return api.state();
  }
  function brandAccent() { try { const b = window.TribeBrand && window.TribeBrand.get && window.TribeBrand.get(); return b && b.accent || undefined; } catch { return undefined; } }
  function close() { play(false); stopAudio(); clearTimeout(saveT); if (doc) save(); if (root) root.remove(); root = null; document.body.classList.remove('mos-on'); }
  const isOpen = () => !!root && document.body.contains(root);

  // ---------- the editor ----------
  const TABS = [['tpl', 'Templates', 'template'], ['states', 'States', 'list'], ['edit', 'Edit', 'sliders'], ['feel', 'Feel', 'sparkle'], ['sound', 'Sound', 'mic'], ['export', 'Export', 'download']];
  function mount() {
    if (root) root.remove();
    root = document.createElement('div'); root.id = 'mos'; root.className = 'mos'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Motion Studio');
    root.innerHTML = `
      <header class="mos-top">
        <button type="button" class="mos-ib" id="mos-close" aria-label="Close">${icon('x', 18)}</button>
        <div class="mos-title"><span class="eyebrow">MOTION</span><input id="mos-name" class="mos-name" aria-label="Name" maxlength="80"></div>
        <span class="mos-saved faint" id="mos-saved"></span>
        <div class="mos-undo"><button type="button" class="mos-ib" id="mos-undo" aria-label="Undo"><svg class="mos-i" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button></div>
        <form class="mos-flint" id="mos-flint"><span class="mos-fl-i">${icon('flame', 16)}</span><input id="mos-ask" autocomplete="off" placeholder="Tell Flint: snappier, make it 9:16, add a toast" aria-label="Tell Flint what to change"><button type="submit" class="btn" id="mos-ask-go">Go</button></form>
        <button type="button" class="btn" id="mos-ai">Have my AI do it</button>
        <button type="button" class="btn primary" id="mos-export-btn">Export</button>
      </header>
      <p class="mos-say" id="mos-say" role="status" aria-live="polite"></p>
      <div class="mos-body">
        <aside class="mos-side" id="mos-side">
          <nav class="mos-tabs" role="tablist">${TABS.map(([id, label, ic]) => `<button type="button" role="tab" class="mos-tab" data-mos-tab="${id}">${icon(ic, 16)}<span>${label}</span></button>`).join('')}</nav>
          <div class="mos-pane" id="mos-pane"></div>
        </aside>
        <main class="mos-stage">
          <div class="mos-cvwrap" id="mos-cvwrap"><canvas id="mos-cv" aria-label="Preview"></canvas><div class="mos-pick hidden" id="mos-pickhint">Click the preview to place the cursor</div></div>
          <div class="mos-transport">
            <button type="button" class="mos-ib mos-play" id="mos-play" aria-label="Play">${icon('media', 18)}</button>
            <span class="mos-time" id="mos-time">0:00.0</span>
            <input type="range" id="mos-scrub" min="0" max="1000" value="0" aria-label="Scrub">
            <button type="button" class="mos-ib" id="mos-loop" aria-label="Loop" aria-pressed="true">${icon('refresh', 16)}</button>
            <select id="mos-aspect" aria-label="Size"><option value="1:1">1:1</option><option value="9:16">9:16</option><option value="16:9">16:9</option><option value="4:5">4:5</option></select>
          </div>
          <div class="mos-tl" id="mos-tl" aria-label="Beat timeline"></div>
        </main>
      </div>`;
    document.body.append(root); document.body.classList.add('mos-on');
    $('#mos-close', root).onclick = close;
    $('#mos-undo', root).onclick = undo;
    const nm = $('#mos-name', root); nm.value = doc.name; nm.onchange = () => change(d => { d.name = nm.value.trim() || 'Motion graphic'; return d; });
    $('#mos-flint', root).onsubmit = e => { e.preventDefault(); const v = $('#mos-ask', root).value.trim(); if (v) { ask(v); $('#mos-ask', root).value = ''; } };
    $('#mos-ai', root).onclick = haveAi;
    $('#mos-export-btn', root).onclick = () => setTab('export');
    $('#mos-play', root).onclick = () => play(!playing);
    $('#mos-scrub', root).oninput = e => { play(false); t = e.target.value / 1000 * K().duration(doc); frame(); };
    $('#mos-loop', root).onclick = () => change(d => { d.loop = !d.loop; return d; }, doc.loop ? tr('It plays once now.') : tr('It loops: the last frame is the first frame.'));
    $('#mos-aspect', root).onchange = e => command({ intent: 'motion.aspect', slots: { ratio: e.target.value } });
    $$('[data-mos-tab]', root).forEach(b => b.onclick = () => setTab(b.dataset.mosTab));
    $('#mos-cv', root).onclick = onCanvasClick;
    if (!mount.keys) { mount.keys = true; document.addEventListener('keydown', e => { if (isOpen()) onKey(e); }); }
    new ResizeObserver(() => frame()).observe($('#mos-cvwrap', root));
    setTab(isPhone() ? 'tpl' : (tab === 'edit' ? 'states' : tab));
    renderAll();
  }
  function onKey(e) {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (e.key === ' ') { e.preventDefault(); play(!playing); }
    else if (e.key === 'Escape') { if (pick) { pick = null; renderPick(); } else close(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { play(false); t = Math.max(0, Math.min(K().duration(doc), t + (e.key === 'ArrowRight' ? 1 : -1) * 60 / doc.bpm)); frame(); }
  }
  function setTab(id) {
    tab = id; if (!root) return;
    $$('[data-mos-tab]', root).forEach(b => { const on = b.dataset.mosTab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    renderPane();
  }
  function renderAll() { if (!root) return; $('#mos-aspect', root).value = K().ASPECTS[doc.aspect] ? doc.aspect : '1:1'; $('#mos-loop', root).setAttribute('aria-pressed', doc.loop ? 'true' : 'false'); const nm = $('#mos-name', root); if (document.activeElement !== nm) nm.value = doc.name; renderTimeline(); renderPane(); frame(); }

  // ---------- preview ----------
  function frame() {
    if (!root || !doc) return;
    const cv = $('#mos-cv', root), wrap = $('#mos-cvwrap', root), r = wrap.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), s = Math.min((r.width - 16) / doc.size.w, (r.height - 16) / doc.size.h);
    const cw = Math.max(1, Math.round(doc.size.w * s)), ch = Math.max(1, Math.round(doc.size.h * s));
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.scale(cv.width / doc.size.w, cv.height / doc.size.h);
    K().draw(g, doc, t, { blur: 0 });
    const dur = K().duration(doc), sc = $('#mos-scrub', root); if (document.activeElement !== sc) sc.value = Math.round(t / dur * 1000);
    $('#mos-time', root).textContent = `${fmt(t)} · ${tr('beat')} ${Math.floor((t - doc.offset) * doc.bpm / 60) + 1}`;
    const ph = $('#mos-ph', root); if (ph) ph.style.left = `${(t / dur) * 100}%`;
  }
  function play(on) {
    playing = !!on; cancelAnimationFrame(raf); if (!root) return;
    const b = $('#mos-play', root); b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); b.innerHTML = playing ? '<svg class="mos-i" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>' : icon('media', 18); b.classList.toggle('on', playing);
    if (playing) { startAudio(t); last = performance.now(); raf = requestAnimationFrame(tick); } else stopAudio();
  }
  function tick(now) {
    const dur = K().duration(doc); t += (now - last) / 1000; last = now;
    if (t >= dur) { if (doc.loop) { t %= dur; startAudio(t); } else { t = dur; frame(); return play(false); } }
    frame(); raf = requestAnimationFrame(tick);
  }
  const seekTo = v => { play(false); t = Math.max(0, +v || 0); frame(); return t; };

  // ---------- timeline ----------
  function renderTimeline() {
    const tl = root && $('#mos-tl', root); if (!tl) return;
    const beats = doc.bars * doc.beatsPerBar, KN = K().KINDS;
    tl.innerHTML = `<div class="mos-tl-in">${Array.from({ length: beats }, (_, b) => `<span class="mos-beat${b % doc.beatsPerBar === 0 ? ' bar' : ''}" style="left:${b / beats * 100}%">${b % doc.beatsPerBar === 0 ? b / doc.beatsPerBar + 1 : ''}</span>`).join('')}
      ${doc.states.map((s, i) => `<button type="button" class="mos-chip${i === sel ? ' on' : ''}" data-i="${i}" style="left:${s.at / beats * 100}%;width:calc(${(Math.max(0.5, ((doc.states[i + 1] || { at: beats }).at - s.at)) / beats) * 100}% - 3px)" title="${esc(KN[s.kind].name)} · beat ${s.at}">${esc(KN[s.kind].name)}</button>`).join('')}
      <span class="mos-ph" id="mos-ph"></span></div>`;
    $$('.mos-chip', tl).forEach(ch => {
      ch.onclick = () => { if (ch._moved) return; sel = +ch.dataset.i; seekTo(K().beatSec(doc, doc.states[sel].at) + 0.45); renderTimeline(); if (tab === 'states' || tab === 'edit') renderPane(); };
      ch.onpointerdown = e => {   // drag a state along the beat grid (quarter beats; hold Shift for free)
        const box = $('.mos-tl-in', tl).getBoundingClientRect(), i = +ch.dataset.i, x0 = e.clientX, at0 = doc.states[i].at; ch._moved = false; ch.setPointerCapture(e.pointerId);
        ch.onpointermove = ev => { const db = (ev.clientX - x0) / box.width * beats; if (Math.abs(ev.clientX - x0) > 3) ch._moved = true; const at = Math.max(0, Math.min(beats - 0.25, ev.shiftKey ? at0 + db : Math.round((at0 + db) * 4) / 4)); ch.style.left = `${at / beats * 100}%`; ch.dataset.at = at; };
        ch.onpointerup = () => { ch.onpointermove = ch.onpointerup = null; if (ch._moved && ch.dataset.at != null) { const at = +ch.dataset.at, dAt = at - at0; change(d => { const s = d.states[i]; s.at = at; s.acts.forEach(a => { a.at += dAt; if (a.until != null) a.until += dAt; }); return d; }, `${tr('Moved to beat')} ${at}.`); setTimeout(() => { ch._moved = false; }, 0); } };
      };
    });
  }

  // ---------- panes ----------
  function renderPane() {
    const p = root && $('#mos-pane', root); if (!p) return;
    if (tab === 'tpl') return paneTemplates(p);
    if (tab === 'states') return paneStates(p);
    if (tab === 'edit') return paneEdit(p);
    if (tab === 'feel') return paneFeel(p);
    if (tab === 'sound') return paneSound(p);
    if (tab === 'export') return paneExport(p);
  }
  function paneTemplates(p) {
    const k = K();
    p.innerHTML = `<p class="mos-lead">${tr('Every template is one shape that never cuts. Pick one, then change anything.')}</p>` + k.CATS.map(([c, name]) => {
      const ids = k.LIST.filter(id => k.TEMPLATES[id].cat === c); if (!ids.length) return '';
      return `<section class="mos-cat"><h4 class="eyebrow">${esc(name)}</h4><div class="mos-tpls">${ids.map(id => `<button type="button" class="mos-tpl${doc.template === id ? ' on' : ''}" data-tpl="${id}" title="${esc(k.TEMPLATES[id].about)}"><img alt="" width="160" height="100" data-src="${id}"><b>${esc(k.TEMPLATES[id].name)}</b></button>`).join('')}</div></section>`;
    }).join('');
    // thumbnails are drawn a few at a time so the pane opens at once
    const imgs = $$('img[data-src]', p); let i = 0; const next = () => { const end = Math.min(imgs.length, i + 6); for (; i < end; i++) imgs[i].src = thumb(imgs[i].dataset.src, 320, 200); if (i < imgs.length) requestAnimationFrame(next); }; requestAnimationFrame(next);
    $$('[data-tpl]', p).forEach(b => b.onclick = () => useTemplate(b.dataset.tpl));
  }
  async function useTemplate(id) {
    const prevScreens = (doc.states.find(s => s.kind === 'phone') || {}).screens;
    change(() => K().make(id, { name: doc.name !== K().TEMPLATES[doc.template || 'ui-reel']?.name ? doc.name : undefined, accent: doc.theme.accent, aspect: doc.aspect !== K().make(id).aspect && doc.template ? undefined : undefined, screens: prevScreens, feel: doc.feel || undefined }), `${tr('Template')}: ${tr(K().TEMPLATES[id].name)}.`);
    await K().load(doc); sel = 0; t = 0; frame();
  }
  function paneStates(p) {
    const KN = K().KINDS;
    p.innerHTML = `<p class="mos-lead">${tr('One shape, many states. Each starts on a beat.')}</p><ol class="mos-states">${doc.states.map((s, i) => `<li><button type="button" class="mos-st${i === sel ? ' on' : ''}" data-st="${i}"><span class="mos-st-b">${s.at}</span><b>${esc(tr(KN[s.kind].name))}</b><small>${esc(s.text || s.title || s.name || s.query || '')}</small></button></li>`).join('')}</ol>
      <div class="mos-row"><select id="mos-addkind" aria-label="Kind">${Object.entries(KN).map(([k, v]) => `<option value="${k}">${esc(tr(v.name))}</option>`).join('')}</select><button type="button" class="btn" id="mos-add">${icon('plus', 14)} Add a state</button></div>
      ${isPhone() ? '' : paneEditHtml()}`;
    $$('[data-st]', p).forEach(b => b.onclick = () => { sel = +b.dataset.st; seekTo(K().beatSec(doc, doc.states[sel].at) + 0.45); renderTimeline(); if (isPhone()) setTab('edit'); else renderPane(); });
    $('#mos-add', p).onclick = () => command({ intent: 'motion.add', slots: { kind: $('#mos-addkind', p).value } });
    if (!isPhone()) wireEdit(p);
  }
  function paneEdit(p) { p.innerHTML = paneEditHtml(); wireEdit(p); }
  const TEXT_FIELDS = { button: ['text'], island: ['title', 'sub'], player: ['title', 'artist'], chart: ['title', 'big'], bars: ['title'], donut: ['label'], cmdk: ['query'], toast: ['text'], card: ['title', 'body'], notif: ['title', 'body'], logo: ['text'], wordmark: ['text'], word: ['text'], list: ['title'], stat: ['value', 'prefix', 'suffix', 'label'], ring: ['label'], phone: ['caption'], post: ['name', 'handle', 'text'], quote: ['text', 'who'], poll: ['q'], count: ['go'], lower: ['name', 'role'], caption: ['text'], badge: ['text'], scene: ['title', 'sub'], appicon: ['text'], endcard: ['title', 'cta'], wipe: ['la', 'lb'] };
  const LABEL = { text: 'Words', title: 'Title', sub: 'Second line', artist: 'Artist', big: 'Big number', label: 'Label', query: 'Typed search', body: 'Body', value: 'Number', prefix: 'Before the number', suffix: 'After the number', caption: 'Caption', name: 'Name', handle: 'Handle', who: 'Who said it', q: 'Question', go: 'Last word', role: 'Role', cta: 'Button', la: 'Left label', lb: 'Right label' };
  function paneEditHtml() {
    const s = doc.states[sel]; if (!s) return '';
    const fields = TEXT_FIELDS[s.kind] || [], FILL = ['ink', 'paper', 'accent', 'none'];
    const num = (k, label, min, max, st = 1) => `<label class="mos-f"><span>${esc(label)}</span><input type="number" data-p="${k}" value="${s[k]}" min="${min}" max="${max}" step="${st}"></label>`;
    return `<section class="mos-edit" aria-label="This state">
      <h4 class="eyebrow">${esc(tr(K().KINDS[s.kind].name))} · ${tr('beat')} ${s.at}</h4>
      ${fields.map(f => `<label class="mos-f"><span>${esc(LABEL[f] || f)}</span>${f === 'body' || (f === 'text' && ['word', 'caption', 'post', 'quote'].includes(s.kind)) ? `<textarea data-p="${f}" rows="2">${esc(s[f] ?? '')}</textarea>` : `<input data-p="${f}" value="${esc(s[f] ?? '')}">`}</label>`).join('')}
      <div class="mos-grid2">${num('at', 'Beat', 0, 999, 0.25)}${num('w', 'Width', 0, 4000, 10)}${num('h', 'Height', 0, 4000, 10)}${num('r', 'Corners', 0, 2000, 2)}${num('cx', 'Left / right', -2000, 2000, 10)}${num('cy', 'Up / down', -2000, 2000, 10)}</div>
      <label class="mos-f"><span>Colour</span><select data-p="fill">${FILL.map(f => `<option value="${f}"${s.fill === f ? ' selected' : ''}>${{ ink: 'Ink', paper: 'Paper', accent: 'Accent', none: 'No shape' }[f]}</option>`).join('')}${FILL.includes(s.fill) ? '' : `<option value="${esc(s.fill)}" selected>${esc(s.fill)}</option>`}</select></label>
      <h4 class="eyebrow">Cursor</h4>
      <ul class="mos-acts">${s.acts.map((a, i) => `<li><span>${{ click: 'Click', drag: 'Drag', hover: 'Hover', type: 'Type', focus: 'Look at' }[a.type]} · ${tr('beat')} ${a.at}${a.until != null ? '–' + a.until : ''}</span>${a.type === 'type' || a.type === 'focus' ? '' : `<button type="button" class="mos-ib" data-pick="${i}" aria-label="Place on the preview">${icon('pin', 14)}</button>`}<button type="button" class="mos-ib" data-delact="${i}" aria-label="Remove">${icon('x', 14)}</button></li>`).join('') || `<li class="faint">${tr('No cursor moves in this state.')}</li>`}</ul>
      <div class="mos-row"><button type="button" class="btn" data-addact="click">Add a click</button><button type="button" class="btn" data-addact="drag">Add a drag</button></div>
      <h4 class="eyebrow">Whole piece</h4>
      <div class="mos-grid2"><label class="mos-f"><span>Tempo (BPM)</span><input type="number" data-g="bpm" value="${doc.bpm}" min="40" max="240"></label><label class="mos-f"><span>Bars</span><input type="number" data-g="bars" value="${doc.bars}" min="1" max="64"></label>
        <label class="mos-f"><span>Accent</span><input type="color" data-g="accent" value="${esc(doc.theme.accent)}"></label><label class="mos-f"><span>Canvas</span><input type="color" data-g="bg" value="${esc(doc.theme.bg)}"></label>
        <label class="mos-f"><span>Camera zoom</span><input type="range" data-g="cam" min="0" max="100" value="${Math.round(doc.camera.strength * 100)}"></label><label class="mos-f mos-check"><input type="checkbox" data-g="cursor"${doc.cursor ? ' checked' : ''}><span>Show the cursor</span></label></div>
      <div class="mos-row"><button type="button" class="btn" id="mos-del">${icon('delete', 14)} Remove this state</button></div></section>`;
  }
  function wireEdit(p) {
    const s = doc.states[sel]; if (!s) return;
    $$('[data-p]', p).forEach(el => el.onchange = () => { const k = el.dataset.p, v = el.type === 'number' ? +el.value : el.value; change(d => { const x = d.states[sel]; if (k === 'at') { const dAt = v - x.at; x.acts.forEach(a => { a.at += dAt; if (a.until != null) a.until += dAt; }); } x[k] = k === 'value' && /^[\d.]+$/.test(String(v)) ? +v : v; return d; }); });
    $$('[data-g]', p).forEach(el => el.onchange = () => { const k = el.dataset.g; change(d => { if (k === 'bpm' || k === 'bars') d[k] = +el.value; else if (k === 'accent' || k === 'bg') d.theme = { ...d.theme, [k]: el.value }; else if (k === 'cam') d.camera = { ...d.camera, strength: el.value / 100 }; else if (k === 'cursor') d.cursor = el.checked; return d; }); });
    $$('[data-delact]', p).forEach(b => b.onclick = () => change(d => { d.states[sel].acts.splice(+b.dataset.delact, 1); return d; }, tr('Removed.')));
    $$('[data-addact]', p).forEach(b => b.onclick = () => change(d => { const x = d.states[sel], nx = d.states[sel + 1], at = Math.min(x.at + 1, nx ? nx.at - 0.5 : x.at + 1); x.acts.push(b.dataset.addact === 'drag' ? { type: 'drag', at, until: at + 1, x0: -100, y0: 0, x1: 100, y1: 0 } : { type: 'click', at, x: 0, y: 0 }); return d; }, tr('Added. Use the pin to place it on the preview.')));
    $$('[data-pick]', p).forEach(b => b.onclick = () => { pick = { state: sel, act: +b.dataset.pick, end: 0 }; renderPick(); });
    const del = $('#mos-del', p); if (del) del.onclick = () => { if (doc.states.length < 2) return say(tr('A motion graphic needs at least one state.')); change(d => { d.states.splice(sel, 1); return d; }, tr('Removed.')); };
  }
  function renderPick() { const h = root && $('#mos-pickhint', root); if (h) { h.classList.toggle('hidden', !pick); h.textContent = pick && pick.end ? tr('Now click where the drag ends') : tr('Click the preview to place the cursor'); } }
  function onCanvasClick(e) {
    if (!pick) { play(!playing); return; }
    const cv = $('#mos-cv', root), r = cv.getBoundingClientRect(), f = K().seek(doc, t), s = doc.size, z = Math.min(s.w, s.h) / 1440 * f.zoom;
    const X = ((e.clientX - r.left) / r.width * s.w - s.w / 2) / z, Y = ((e.clientY - r.top) / r.height * s.h - s.h / 2) / z;
    const st = doc.states[pick.state], ux = Math.round(X - st.cx), uy = Math.round(Y - st.cy), a = st.acts[pick.act]; if (!a) { pick = null; return renderPick(); }
    if (a.type === 'drag' || a.type === 'hover') {
      if (!pick.end) { change(d => { const q = d.states[pick.state].acts[pick.act]; q.x0 = ux; q.y0 = uy; return d; }); pick.end = 1; return renderPick(); }
      change(d => { const q = d.states[pick.state].acts[pick.act]; q.x1 = ux; q.y1 = uy; return d; }, tr('Placed.'));
    } else change(d => { const q = d.states[pick.state].acts[pick.act]; q.x = ux; q.y = uy; return d; }, tr('Placed.'));
    pick = null; renderPick();
  }
  function paneFeel(p) {
    const F = K().FEELS;
    p.innerHTML = `<p class="mos-lead">${tr('How it moves: springs, blur between states, motion blur and the camera.')}</p>
      <div class="mos-grid2"><label class="mos-f"><span>Stiffness</span><input type="range" id="mos-k" min="40" max="900" value="${doc.spring.k}"></label><label class="mos-f"><span>Overshoot</span><input type="range" id="mos-z" min="70" max="120" value="${Math.round(240 - doc.spring.z * 100)}" aria-label="Overshoot (less to the right)"></label>
        <label class="mos-f"><span>Blur between states</span><input type="range" id="mos-sb" min="0" max="30" value="${doc.swap.blur}"></label><label class="mos-f"><span>Motion blur</span><select id="mos-mb">${[0, 2, 4, 8].map(n => `<option value="${n}"${doc.blur.n === n ? ' selected' : ''}>${n ? n + ' frames' : 'Off'}</option>`).join('')}</select></label></div>
      <div class="mos-feels">${Object.values(F).map(f => `<button type="button" class="mos-feel${doc.feel === f.id ? ' on' : ''}" data-feel="${f.id}"><b>${esc(tr(f.name))}</b><small>${esc(tr(f.about))}</small></button>`).join('')}</div>`;
    $$('[data-feel]', p).forEach(b => b.onclick = () => command({ intent: 'motion.feel', slots: { feel: b.dataset.feel } }));
    $('#mos-k', p).onchange = e => change(d => { d.spring.k = +e.target.value; d.feel = ''; return d; });
    $('#mos-z', p).onchange = e => change(d => { d.spring.z = (240 - e.target.value) / 100; d.feel = ''; return d; });
    $('#mos-sb', p).onchange = e => change(d => { d.swap.blur = +e.target.value; return d; });
    $('#mos-mb', p).onchange = e => change(d => { d.blur.n = +e.target.value; return d; });
  }

  // ---------- sound: your own song, a click track, UI sounds ----------
  function paneSound(p) {
    const m = doc.music;
    p.innerHTML = `<p class="mos-lead">${tr('Add a song and the states snap to its beat. Use music you have the rights to; royalty-free sources are your choice.')}</p>
      <div class="mos-song">${m && m.name ? `<b>${esc(m.name)}</b><small>${doc.bpm} BPM · ${tr('starts at')} ${doc.offset.toFixed(2)} s</small>` : `<small class="faint">${tr('No song yet. The preview uses a click track.')}</small>`}</div>
      <div class="mos-row"><label class="btn" for="mos-song-in">${icon('upload', 14)} Add a song</label><input type="file" id="mos-song-in" accept="audio/*" class="sr-only"><button type="button" class="btn" id="mos-snap">Snap to the beat</button>${m ? '<button type="button" class="btn" id="mos-song-x">Remove the song</button>' : ''}</div>
      <label class="mos-f mos-check"><input type="checkbox" id="mos-snd"${doc.sounds ? ' checked' : ''}><span>UI sounds on clicks, drags and typing</span></label>
      <label class="mos-f mos-check"><input type="checkbox" id="mos-click"${doc.clickTrack !== false ? ' checked' : ''}><span>Click track when there is no song</span></label>`;
    $('#mos-song-in', p).onchange = e => e.target.files[0] && addSong(e.target.files[0]);
    $('#mos-snap', p).onclick = () => command({ intent: 'motion.beat', slots: {} });
    const x = $('#mos-song-x', p); if (x) x.onclick = () => { audio = audio && { ...audio, song: null }; change(d => { d.music = null; return d; }, tr('Removed.')); };
    $('#mos-snd', p).onchange = e => change(d => { d.sounds = e.target.checked; return d; });
    $('#mos-click', p).onchange = e => change(d => { d.clickTrack = e.target.checked; return d; });
  }
  function actx() { if (!audio) audio = {}; if (!audio.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; audio.ctx = new AC(); } return audio.ctx; }
  async function addSong(file, by) {
    const ctx = actx(); if (!ctx) return say(tr('This browser cannot play sound.'));
    say(tr('Listening for the beat…'));
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const ch = buf.getChannelData(0), n = Math.min(ch.length, buf.sampleRate * 90), mono = new Float32Array(n); for (let i = 0; i < n; i++) mono[i] = ch[i] * 0.5 + (buf.numberOfChannels > 1 ? buf.getChannelData(1)[i] * 0.5 : ch[i] * 0.5);
      const r = K().analyze(mono, buf.sampleRate);
      audio.song = buf;
      let src = '';
      if (pid && connected()) { try { const up = await fetch(C.base() + `/api/uploads?name=${encodeURIComponent(file.name)}&scope=project`, { method: 'POST', headers: { ...authH(), 'Content-Type': 'application/octet-stream' }, body: file }); const j = await up.json(); if (j.file) src = `/api/uploads/${j.file.id}/raw`; } catch {} }
      change(d => { d.bpm = r.bpm; d.offset = r.offset; d.music = { name: file.name, src, by: by || '' }; return K().snap(d); }, `${tr('Found the beat')}: ${r.bpm} BPM. ${tr('Every state is on it now.')}`);
    } catch (e) { say(tr('That file could not be read as audio.')); }
  }
  async function songFromDoc() { if (audio && audio.song || !doc.music || !doc.music.src) return; const ctx = actx(); if (!ctx) return; try { const api0 = /^\/api\//.test(doc.music.src), u = api0 ? C.base() + doc.music.src : doc.music.src; const b = await (await fetch(u, api0 ? { headers: authH() } : {})).arrayBuffer(); audio.song = await ctx.decodeAudioData(b); } catch {} }
  // short synthesized UI sounds; each starts at its peak, so it lands on its event
  function voice(ctx, dest, kind, at) {
    const g = ctx.createGain(); g.connect(dest);
    if (kind === 'click' || kind === 'tick') { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(kind === 'click' ? 1800 : 2600, at); o.frequency.exponentialRampToValueAtTime(600, at + 0.04); g.gain.setValueAtTime(kind === 'click' ? 0.22 : 0.08, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05); o.connect(g); o.start(at); o.stop(at + 0.06); }
    else if (kind === 'pop') { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(520, at); o.frequency.exponentialRampToValueAtTime(1040, at + 0.08); g.gain.setValueAtTime(0.2, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14); o.connect(g); o.start(at); o.stop(at + 0.15); }
    else if (kind === 'whoosh') { const len = Math.floor(ctx.sampleRate * 0.18), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0); let s = 7; for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = ((s / 2147483647) * 2 - 1) * Math.sin(Math.PI * i / len); } const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, at); f.frequency.exponentialRampToValueAtTime(2400, at + 0.18); src.buffer = b; g.gain.setValueAtTime(0.06, at); src.connect(f); f.connect(g); src.start(at); }
    else if (kind === 'kick' || kind === 'hat') { const o = ctx.createOscillator(); o.type = kind === 'kick' ? 'sine' : 'square'; o.frequency.setValueAtTime(kind === 'kick' ? 140 : 8000, at); if (kind === 'kick') o.frequency.exponentialRampToValueAtTime(45, at + 0.12); g.gain.setValueAtTime(kind === 'kick' ? 0.3 : 0.025, at); g.gain.exponentialRampToValueAtTime(0.0001, at + (kind === 'kick' ? 0.16 : 0.03)); o.connect(g); o.start(at); o.stop(at + 0.2); }
  }
  // everything audible for [from, dur): the song, the click track, the UI sounds, scheduled on ctx starting at ctx time `at`
  function schedule(ctx, dest, from, at, dur) {
    const nodes = [];
    if (audio && audio.song && doc.music) { const s = ctx.createBufferSource(); s.buffer = audio.song; s.connect(dest); s.start(at, Math.max(0, from)); s.stop(at + (dur - from)); nodes.push(s); }
    else if (doc.clickTrack !== false) { const beat = 60 / doc.bpm, n = doc.bars * doc.beatsPerBar; for (let b = 0; b < n; b++) { const tb = doc.offset + b * beat; if (tb >= from && tb < dur) voice(ctx, dest, b % doc.beatsPerBar === 0 ? 'kick' : 'hat', at + tb - from); } }
    if (doc.sounds) for (const e of K().events(doc)) if (e.t >= from && e.t < dur) voice(ctx, dest, e.kind, at + e.t - from);
    return nodes;
  }
  function startAudio(from) {
    stopAudio(); if (navigator.webdriver || !doc || (!doc.sounds && !doc.music && doc.clickTrack === false)) return;
    const ctx = actx(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    songFromDoc(); const bus = ctx.createGain(); bus.connect(ctx.destination); audio.bus = bus; schedule(ctx, bus, from, ctx.currentTime + 0.03, K().duration(doc));
  }
  function stopAudio() { if (audio && audio.bus) { try { audio.bus.disconnect(); } catch {} audio.bus = null; } }

  // ---------- export ----------
  function paneExport(p) {
    const site = !!(window.TribeSiteFx && window.TribeSiteFx.KINDS && window.TribeSiteFx.KINDS.motion);
    p.innerHTML = `<p class="mos-lead">${tr('Everything renders here, frame by frame, from the same engine as the preview.')}</p>
      <div class="mos-exps">
        <button type="button" class="mos-exp" data-exp="mp4">${icon('media', 18)}<b>MP4 video</b><small>${tr('For X, TikTok, Instagram and YouTube')}</small></button>
        <button type="button" class="mos-exp" data-exp="webm">${icon('media', 18)}<b>WebM video</b><small>${tr('Works in any browser, with sound')}</small></button>
        <button type="button" class="mos-exp" data-exp="gif">${icon('photo', 18)}<b>GIF</b><small>${tr('Loops in chats and docs, no sound')}</small></button>
        <button type="button" class="mos-exp" data-exp="png">${icon('photo', 18)}<b>PNG frame</b><small>${tr('The frame you are looking at')}</small></button>
        <button type="button" class="mos-exp" data-exp="html">${icon('code', 18)}<b>HTML page</b><small>${tr('One file that plays it, no internet needed')}</small></button>
        ${window.TribeShareClip ? `<button type="button" class="mos-exp" data-share-clip>${icon('external', 18)}<b>${tr('Share a clip')}</b><small>${tr('Your app, site or a timelapse, sized for each feed, with words to post')}</small></button>` : ''}
        ${site ? `<button type="button" class="mos-exp" data-exp="site">${icon('globe', 18)}<b>Put it on my website</b><small>${tr('A section of your site that plays it')}</small></button>` : ''}
      </div>
      <div class="mos-grid2"><label class="mos-f"><span>Size</span><select id="mos-xs"><option value="1">${doc.size.w} × ${doc.size.h}</option><option value="0.5">${Math.round(doc.size.w / 2)} × ${Math.round(doc.size.h / 2)}</option></select></label>
        <label class="mos-f"><span>Frames per second</span><select id="mos-xf"><option value="30">30</option><option value="60">60</option></select></label></div>`;
    const shb = $('[data-share-clip]', p); if (shb) shb.onclick = () => window.TribeShareClip.open({ pid, aspect: doc.aspect === '4:5' ? '1:1' : doc.aspect });
    $$('[data-exp]', p).forEach(b => b.onclick = async () => { const fmt0 = b.dataset.exp; b.disabled = true; try { const r = await exportAs(fmt0, { scale: +$('#mos-xs', p).value, fps: +$('#mos-xf', p).value }); if (r && r.blob) download(r.blob, `${slug(doc.name)}.${r.ext}`); } catch (e) { say(e.message || String(e)); } b.disabled = false; });
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); say(`${tr('Downloaded')} ${name}.`); }
  function offscreen(scale) { const c = document.createElement('canvas'); c.width = Math.round(doc.size.w * scale / 2) * 2; c.height = Math.round(doc.size.h * scale / 2) * 2; return c; }
  function paint(c, tt, fps) { const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.scale(c.width / doc.size.w, c.height / doc.size.h); K().draw(g, doc, tt, { fps, blur: doc.blur.n }); }
  async function exportAs(fmt0, o = {}) {
    await loadFonts(); await K().load(doc);
    const fps = o.fps || 30, scale = o.scale || 1, dur = o.seconds || K().duration(doc), N = Math.max(1, Math.round(dur * fps));
    if (fmt0 === 'png') { const c = offscreen(scale); paint(c, t, fps); return { blob: await new Promise(r => c.toBlob(r, 'image/png')), ext: 'png' }; }
    if (fmt0 === 'html') return { blob: new Blob([await htmlPage()], { type: 'text/html' }), ext: 'html' };
    if (fmt0 === 'site') return toSite();
    if (fmt0 === 'gif') return { blob: await gif(Math.min(1, (o.gifWidth || 600) / doc.size.w), o.gifFps || 20, dur), ext: 'gif' };
    if (fmt0 === 'mp4') { try { const b = await mp4(scale, fps, N, dur); if (b) return { blob: b, ext: 'mp4' }; } catch (e) { console.warn('mp4', e); } say(tr('MP4 needs a newer browser and the internet once. Here is a WebM instead.')); }
    return { blob: await webm(scale, fps, dur), ext: 'webm' };
  }
  async function webm(scale, fps, dur) {
    if (!('MediaRecorder' in window)) throw new Error(tr('This browser cannot record video. Try Chrome, Edge or Firefox.'));
    const c = offscreen(scale), stream = c.captureStream(0), track = stream.getVideoTracks()[0];
    let ctx = null, dest = null;
    if (!navigator.webdriver && (doc.sounds || doc.music || doc.clickTrack !== false)) { ctx = actx(); if (ctx) { await songFromDoc(); dest = ctx.createMediaStreamDestination(); dest.stream.getAudioTracks().forEach(a => stream.addTrack(a)); } }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 10_000_000 }), parts = [];
    rec.ondataavailable = e => e.data.size && parts.push(e.data); const done = new Promise(r => (rec.onstop = r));
    paint(c, 0, fps); rec.start(200);
    const t0 = performance.now(); if (ctx) schedule(ctx, dest, 0, ctx.currentTime + 0.02, dur);
    for (let i = 0; ; i++) {   // the recorder keeps wall-clock time, so frames are paced in real time
      const tt = i / fps; if (tt >= dur) break; paint(c, tt, fps); if (track.requestFrame) track.requestFrame();
      if (i % fps === 0) say(`${tr('Recording')} ${Math.round(tt / dur * 100)}%`);
      const wait = t0 + (i + 1) * 1000 / fps - performance.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    }
    rec.stop(); await done; say(tr('Done.'));
    return new Blob(parts, { type: 'video/webm' });
  }
  async function mp4(scale, fps, N, dur) {
    if (!('VideoEncoder' in window)) return null;
    const M = await import(MEDIABUNNY);
    const c = offscreen(scale), out = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new M.BufferTarget() });
    const vs = new M.CanvasSource(c, { codec: 'avc', bitrate: M.QUALITY_HIGH }); out.addVideoTrack(vs, { frameRate: fps });
    let as = null, abuf = null;
    if (doc.sounds || doc.music || doc.clickTrack !== false) { try { await songFromDoc(); const OAC = window.OfflineAudioContext; const oc = new OAC(2, Math.ceil(dur * 48000), 48000); schedule(oc, oc.destination, 0, 0, dur); abuf = await oc.startRendering(); as = new M.AudioBufferSource({ codec: 'aac', bitrate: M.QUALITY_HIGH }); out.addAudioTrack(as); } catch { as = null; } }
    await out.start();
    for (let i = 0; i < N; i++) { paint(c, i / fps, fps); await vs.add(i / fps, 1 / fps); if (i % fps === 0) say(`${tr('Rendering')} ${Math.round(i / N * 100)}%`); }
    if (as && abuf) await as.add(abuf);
    await out.finalize(); say(tr('Done.'));
    return new Blob([out.target.buffer], { type: 'video/mp4' });
  }
  async function htmlPage() {
    const kit = await (await fetch('motionkit.js')).text(), d = JSON.stringify(doc).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(doc.name)}</title>
<style>html,body{margin:0;height:100%;background:${esc(doc.theme.bg)}}body{display:grid;place-items:center}canvas{max-width:100vw;max-height:100vh;width:auto;height:auto}</style></head>
<body><canvas id="c" width="${doc.size.w}" height="${doc.size.h}" aria-label="${esc(doc.name)}"></canvas>
<!-- Made with TribeCode Motion Studio. The engine below is MIT licensed. -->
<script>${kit.replace(/<\/script/gi, '<\\/script')}</script>
<script>(function(){var K=TribeMotionKit,d=K.normalize(${d}),c=document.getElementById('c'),g=c.getContext('2d'),t0=performance.now(),still=matchMedia('(prefers-reduced-motion: reduce)').matches;
K.load(d).then(function(){function f(n){K.draw(g,d,still?K.beatSec(d,d.thumbAt>=0?d.thumbAt:2):(n-t0)/1000);if(!still)requestAnimationFrame(f)}requestAnimationFrame(f)})})();</script>
</body></html>`;
  }
  // "Put it on my website": a new section in the website designer with this piece playing behind its words
  // (sitefx.js kind 'motion'; the published site carries motionkit.js beside fx.js, no network needed). One Undo removes it.
  async function toSite() {
    const SD = window.TribeSiteDesigner, SC = window.TribeSiteCfg, FX = window.TribeSiteFx;
    if (!SD || !SC || !FX || !FX.KINDS.motion) throw new Error(tr('The website designer did not load. Reload the app.'));
    await save();
    const st0 = SD.state && SD.state(); if (!st0 || !st0.open) await SD.open(pid ? { pid } : {});
    const cfg = SD.cfg(); if (!cfg) throw new Error(tr('Open the website designer first.'));
    const st = SD.state() || {}, pg = cfg.pages.find(x => x.id === st.page) || cfg.pages[0];
    const r = SC.addBlock(cfg, pg.id, 'cta'); r.block.props = { ...(r.block.props || {}), title: doc.name };
    const next = FX.setFx(r.cfg, pg.id, r.block.id, { kind: 'motion', m: doc, i: 1, c: 'accent', c2: 'ink' });
    await SD.importCfg(next, tr('a motion graphic'));
    close(); say(tr('Added a section to your website that plays this motion graphic.'));
    return null;
  }
  // a small GIF encoder: one shared palette (popular 5-bit colours across frames), LZW, looping forever
  async function gif(scale, fps, dur) {
    const c = offscreen(scale), w = c.width, h = c.height, g = c.getContext('2d', { willReadFrequently: true }), N = Math.max(1, Math.round(dur * fps));
    const counts = new Uint32Array(32768);
    for (let k = 0; k < 8; k++) { paint(c, dur * k / 8, 0); const px = g.getImageData(0, 0, w, h).data; for (let i = 0; i < px.length; i += 16) counts[(px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | px[i + 2] >> 3]++; }
    const top = Array.from(counts.keys()).filter(i => counts[i]).sort((a, b) => counts[b] - counts[a]).slice(0, 256);
    while (top.length < 256) top.push(0);
    const pal = top.map(i => [(i >> 10 & 31) << 3 | 4, (i >> 5 & 31) << 3 | 4, (i & 31) << 3 | 4]), map = new Uint8Array(32768).fill(255), cache = new Int16Array(32768).fill(-1);
    const nearest = q => { if (cache[q] >= 0) return cache[q]; const r = (q >> 10 & 31) << 3, gg = (q >> 5 & 31) << 3, b = (q & 31) << 3; let bi = 0, bd = 1e9; for (let i = 0; i < 256; i++) { const p = pal[i], dd = (p[0] - r) ** 2 + (p[1] - gg) ** 2 + (p[2] - b) ** 2; if (dd < bd) { bd = dd; bi = i; } } cache[q] = bi; return bi; };
    void map;
    const bytes = []; const w16 = v => bytes.push(v & 255, v >> 8 & 255), str = s => { for (const ch of s) bytes.push(ch.charCodeAt(0)); };
    str('GIF89a'); w16(w); w16(h); bytes.push(0xF7, 0, 0); pal.forEach(p => bytes.push(p[0], p[1], p[2]));
    bytes.push(0x21, 0xFF, 0x0B); str('NETSCAPE2.0'); bytes.push(3, 1, 0, 0, 0);
    const delay = Math.round(100 / fps);
    for (let f = 0; f < N; f++) {
      paint(c, f / fps, 0); const px = g.getImageData(0, 0, w, h).data, idx = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < px.length; i += 4, j++) idx[j] = nearest((px[i] >> 3) << 10 | (px[i + 1] >> 3) << 5 | px[i + 2] >> 3);
      bytes.push(0x21, 0xF9, 4, 0, delay & 255, delay >> 8, 0, 0, 0x2C); w16(0); w16(0); w16(w); w16(h); bytes.push(0);
      lzw(idx, 8, bytes);
      if (f % 10 === 0) { say(`${tr('Making the GIF')} ${Math.round(f / N * 100)}%`); await new Promise(r => setTimeout(r, 0)); }
    }
    bytes.push(0x3B); say(tr('Done.'));
    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  }
  function lzw(idx, minSize, out) {
    out.push(minSize); const clear = 1 << minSize, eoi = clear + 1; let size = minSize + 1, next = eoi + 1, dict = new Map(), buf = 0, nb = 0; const block = [];
    const emit = code => { buf |= code << nb; nb += size; while (nb >= 8) { block.push(buf & 255); buf >>= 8; nb -= 8; if (block.length === 255) { out.push(255, ...block); block.length = 0; } } };
    emit(clear); let cur = idx[0];
    for (let i = 1; i < idx.length; i++) { const k = idx[i], key = cur << 8 | k, hit = dict.get(key); if (hit !== undefined) { cur = hit; continue; } emit(cur); if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { emit(clear); dict = new Map(); size = minSize + 1; next = eoi + 1; } cur = k; }
    emit(cur); emit(eoi); if (nb > 0) { block.push(buf & 255); } if (block.length) out.push(block.length, ...block); out.push(0);
  }

  // ---------- Flint ----------
  function say(s) { const el = root && $('#mos-say', root); if (el) { el.textContent = s || ''; el.classList.toggle('on', !!s); } }
  async function command(step) {
    if (!step) return { text: '' };
    if (step.intent === 'motion.new') { const id = K().TEMPLATES[step.slots && step.slots.tpl] ? step.slots.tpl : 'ui-reel'; if (!isOpen()) await open({ template: id }); else await useTemplate(id); const text = `${tr('Opened Motion Studio with')} ${tr(K().TEMPLATES[id].name)}.`; say(text); return { text }; }
    if (!isOpen()) await open({});
    if (step.intent === 'motion.export') { setTab('export'); const r = await exportAs(step.slots && step.slots.fmt || 'mp4', {}); if (r && r.blob) download(r.blob, `${slug(doc.name)}.${r.ext}`); return { text: tr('Exporting.') }; }
    if (step.intent === 'motion.play') { play(step.slots && step.slots.on !== false); return { text: '' }; }
    if (step.intent === 'motion.song') { setTab('sound'); return { text: tr('Add a song from the Sound tab; the states snap to its beat.') }; }
    const r = K().command(doc, step);
    if (r.doc !== doc) { hist.push(JSON.stringify(doc)); fut = []; doc = r.doc; scheduleSave(); renderAll(); }
    say(r.say); return { text: r.say };
  }
  async function ask(text) {
    const N = window.TribeNLU; if (!N) return say(tr('Flint did not load.'));
    const steps = N.parse(text, { view: 'motion', now: new Date() }).steps.filter(s => s.conf >= 0.6);
    if (!steps.length || !steps.every(s => /^motion\./.test(s.intent))) { say(tr('I did not catch that. Try “snappier”, “make it 9:16”, “add a toast” or “export a GIF”. For bigger changes, use Have my AI do it.')); return null; }
    let out = ''; for (const s of steps) { const r = await command(s); out = r.text || out; }
    return out;
  }
  // "Have my AI do it": a brief for the person's own agent, which edits the doc over MCP (server/motionstudio.js)
  async function haveAi() {
    await save();
    const brief = `Motion Studio: please improve the motion graphic "${doc.name}" (key ${key || '(saved on this device)'}). Read it with motion_read, keep it one shape that never cuts, every change on the beat grid (${doc.bpm} BPM), springs with a tiny overshoot at most, and the last frame equal to the first. Save with motion_write. What I want: `;
    const ask0 = (root && $('#mos-ask', root).value.trim()) || '';
    if (pid && connected() && key) {
      try { await C.api('/agents/channel', { method: 'POST', body: { text: brief + (ask0 || 'make it feel more polished and readable') } }); say(tr('Sent to your AI helpers. Changes show up here when they save.')); return; } catch (e) { /* fall through to copying */ }
    }
    try { await navigator.clipboard.writeText(brief + (ask0 || '…')); say(tr('Copied a brief for your AI. Paste it into Claude Code, Codex or Gemini.')); } catch { say(brief); }
  }
  // live updates from teammates and agents
  if (C && C.on) try { C.on('ws', async m => { if (!m || m.type !== 'motion' || !isOpen() || !pid || m.project !== pid || m.key !== key || Date.now() - (window.__mosSelfAt || 0) < 1500) return; try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/motion/${encodeURIComponent(key)}`); if (r && r.updated !== savedAt && r.doc) { doc = K().normalize(r.doc); doc.rev++; await K().load(doc); renderAll(); say(`${tr('Updated by')} ${r.by || tr('someone')}.`); } } catch {} }); } catch {}

  // ---------- suggestions (window.TribeSuggest, feature-detected) ----------
  function registerSuggest() {
    const S = window.TribeSuggest; if (!S || !S.register || registerSuggest.done) return; registerSuggest.done = true;
    S.register({
      id: 'motion', title: 'Motion',
      async gather(ctx) {
        const p = ctx && ctx.projectId; if (!p || !connected()) return { items: [] };
        const items = await list(p); let newest = null; if (items[0]) { try { newest = (await C.api(`/projects/${encodeURIComponent(p)}/motion/${encodeURIComponent(items[0].key)}`)); } catch {} }
        let site = null; try { site = await C.api(`/projects/${encodeURIComponent(p)}/site-config`); } catch {}
        let songs = []; try { songs = ((await C.api(`/uploads?project=${encodeURIComponent(p)}`)).project || []).filter(f => f.kind === 'audio' || /^audio\//.test(f.type || '')); } catch {}
        return { items, newest, site, songs };
      },
      async suggest(ctx, got) {
        const out = [], p = ctx && ctx.projectId, n = got && got.newest, d = n && n.doc, brand = ctx && ctx.brand;
        if (!p) return out;
        const acc = brand && (brand.accent || (brand.colors && brand.colors.accent));
        if (d && acc && String(acc).toLowerCase() !== String(d.theme.accent).toLowerCase()) out.push({ id: `motion-brand-${n.key}`, title: `Use the brand's new colour in “${d.name}”`, why: `The brand's accent is ${acc}; this motion graphic still uses ${d.theme.accent}.`, from: [{ kind: 'brand', ref: 'accent', who: (brand && brand.by) || '' }],
          apply: async () => { const old = clone(d); const nd = K().command(d, { intent: 'motion.accent', slots: { color: { name: acc, hex: acc } } }).doc; await C.api(`/projects/${encodeURIComponent(p)}/motion/${encodeURIComponent(n.key)}`, { method: 'PUT', body: { doc: nd } }); return async () => { await C.api(`/projects/${encodeURIComponent(p)}/motion/${encodeURIComponent(n.key)}`, { method: 'PUT', body: { doc: old } }); }; } });
        const cfg = got && got.site && (got.site.cfg || got.site.config || got.site), upd = got && got.site && (got.site.updated || got.site.savedAt);
        if (cfg && (!n || (upd && upd > n.updated))) { const name = cfg.name || 'your website', hero = (((cfg.pages || [])[0] || {}).blocks || []).find(b => b.type === 'hero'), head = hero && hero.props && hero.props.title;
          out.push({ id: 'motion-site-clip', title: `Make a 9:16 clip of ${name}${head ? `: “${head}”` : ''}`, why: 'The website changed since the last motion graphic. A short vertical clip is ready for TikTok, Reels and Shorts.', from: [{ kind: 'site', ref: 'site-config', who: (got.site && got.site.by) || '' }],
            apply: async () => { const k = 'site-clip-' + rid(); const nd = K().make('social-hook', { name: `${name} clip`, aspect: '9:16', accent: acc || undefined }); const hs = nd.states.find(s => s.kind === 'word' && s.at > 0); if (hs && head) hs.text = head; await C.api(`/projects/${encodeURIComponent(p)}/motion/${k}`, { method: 'PUT', body: { doc: nd } }); return async () => { await C.api(`/projects/${encodeURIComponent(p)}/motion/${k}`, { method: 'DELETE' }); }; } });
        }
        const song = (got && got.songs || []).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
        if (d && song && !(d.music && d.music.src && d.music.src.includes(song.id)) && (!n.updated || song.at > n.updated)) out.push({ id: `motion-song-${song.id}`, title: `Sync “${d.name}” to the song ${song.byName || 'someone'} uploaded`, why: `${song.name} is in the project's files. Motion Studio finds its beat and snaps every state to it.`, from: [{ kind: 'upload', ref: song.id, who: song.byName || '' }],
          apply: async () => { const old = clone(d); await open({ pid: p, key: n.key }); const r = await fetch(C.base() + `/api/uploads/${song.id}/raw`, { headers: authH() }); const b = await r.blob(); await addSong(new File([b], song.name, { type: song.type || 'audio/mpeg' }), song.byName); await save(); return async () => { await C.api(`/projects/${encodeURIComponent(p)}/motion/${encodeURIComponent(n.key)}`, { method: 'PUT', body: { doc: old } }); if (isOpen() && key === n.key) { doc = K().normalize(old); doc.rev++; renderAll(); } }; } });
        return out;
      },
    });
  }
  registerSuggest(); window.addEventListener('tribe-suggest-ready', registerSuggest); setTimeout(registerSuggest, 2000);

  const api = {
    open, close, isOpen, command, ask, thumb, exportAs, seekTo, list, save, undo, redo,
    templates: () => K().LIST.map(id => ({ id, cat: K().TEMPLATES[id].cat, name: K().TEMPLATES[id].name, about: K().TEMPLATES[id].about })),
    state: () => ({ open: isOpen(), t, playing, sel, key, pid, local, tab, saved: savedAt, doc: doc ? clone(doc) : null, dur: doc ? K().duration(doc) : 0 }),
    pixels: tt => { const c = document.createElement('canvas'); c.width = Math.round(doc.size.w / 4); c.height = Math.round(doc.size.h / 4); paint(c, tt, 30); return c.toDataURL('image/png'); },
    tab: setTab,
  };
  window.TribeMotionStudio = api;
})();
