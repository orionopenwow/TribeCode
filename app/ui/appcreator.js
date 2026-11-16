// App Creator (docs/APP-CREATOR.md): design a phone app screen by screen, click anything to edit it, link taps between
// screens and play it as a prototype, change the whole look in one place, stack kits from the library or the add-on
// shelf, and export a working phone web app or an Expo project, or hand it to the AI helpers.
//   Left:   Screens (the strip, add a screen or a kit) · Add (the component library) · Look (56 named looks and every
//           theme control: colour, light/dark, corners, type, spacing, icons, motion, iPhone/Android)
//   Middle: the phone with the screen; click a block to select it, click words to type, the small toolbar moves, copies,
//           links and removes. Play runs the prototype with the theme's motion.
//   Right:  the selection (link to a screen with a transition, icon, picture, style) and Flint (plain sentences, no AI).
// The model is app/ui/appcreator-core.js (shared with server/appcreator.js and the tests). Saved on the host
// (PUT /api/projects/:id/app-config) or, with no tribe, on this device. Every change is one Undo.
//   window.TribeAppCreator = { open({ template, kit, name, accent, pid }), close(), state(), doc(), ask(text) -> Promise<reply>,
//     apply(op), flint(step), installKit(kitId), screens(projectId) -> Promise<[{ id, name, html, render(canvas, w, h) }]>,
//     mini(doc, screenId?, width?) -> HTML, templates() }
(function () {
  'use strict';
  const A = () => window.TribeAppCore, C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? (window.TribeI18n.t(s, s) || s) : s);
  const connected = () => !!(C && C.connected && C.connected() && (!C.hasToken || C.hasToken()));
  const LOCAL = 'tribecode.appcreator.local';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const IC = { undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>', play: '<path d="M8 5.5v13l10.5-6.5z"/>', stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>' };
  const ic = (n, sz) => { const s = sz || 16; if (IC[n]) return `<svg class="apc-ic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`; const T = window.TribeIcons; return T && T.svg ? T.svg(n, s) : ''; };
  let root = null, st = null, saveT = 0, styleDone = false;

  // ---------- the shared stylesheet for every app on the page (one copy) ----------
  function ensureStyle() {
    if (styleDone || !A()) return; styleDone = true;
    const el = document.createElement('style'); el.id = 'apc-axcss';
    el.textContent = A().allFonts('assets/site-fonts/') + A().baseCSS('.ax');
    document.head.appendChild(el);
  }
  // a live, scaled picture of one screen (the gallery, the screen strip, the Launch kit's previews)
  function mini(doc, screenId, width) {
    const Co = A(); if (!Co || !doc) return ''; ensureStyle();
    const d = Co.normalize(doc), s = Co.findScreen(d, screenId || d.start) || d.screens[0], w = width || 120, k = w / 390;
    // a picture, not a control: it sits inside buttons (the gallery, the strip), so it holds no buttons, forms or inputs
    const html = Co.screenHTML(d, s, { edit: false }).replace(/<button\b/g, '<span').replace(/<\/button>/g, '</span>').replace(/<form\b/g, '<div').replace(/<\/form>/g, '</div>')
      .replace(/<input\b[^>]*?placeholder="([^"]*)"[^>]*>/g, '<span class="ax-in">$1</span>').replace(/<input\b[^>]*>/g, '<span class="ax-in"></span>');
    return `<span class="apc-mini" style="width:${w}px;height:${Math.round(844 * k)}px"><span class="ax apc-mini-in" ${Co.attrs(d)} data-i18n-skip aria-hidden="true" style="${Co.vars(d.theme)};transform:scale(${k.toFixed(4)})">${html}</span></span>`;
  }

  // ---------- open / close ----------
  async function open(o) {
    o = o || {};
    if (!A()) { toast('App Creator did not load. Reload the app.'); return; }
    ensureStyle();
    const pid = o.pid || (connected() && C.project ? C.project() : '');
    st = { open: true, pid, local: !pid, doc: null, rev: 0, canEdit: true, screen: '', sel: null, mode: 'edit', tab: 'screens', undo: [], redo: [], saving: false, savedAt: '', mobile: matchMedia('(max-width: 820px)').matches, sheet: '' };
    let cur = null;
    if (pid) { try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/app-config`); cur = r.config; st.rev = r.rev || 0; st.canEdit = r.canEdit !== false; } catch { cur = null; } }
    else cur = ls.get(LOCAL, null);
    let doc = cur ? A().normalize(cur) : null;
    if (o.template) { const t = A().template(o.template, { name: o.name, accent: o.accent }); if (t) { if (doc) st.undo.push(JSON.stringify(doc)); doc = t; } }
    if (!doc) doc = A().blank(o.name || 'My app');
    st.doc = doc; st.screen = doc.start;
    build();
    if (o.template || !cur) save();
    if (o.kit) installKit(o.kit, true);
    if (o.template && cur) toast('Started from the template. Undo brings back your earlier design.');
    return st;
  }
  function close() {
    if (!root) return; clearTimeout(saveT); if (st && st.dirty) save(true);
    root.remove(); root = null; document.body.classList.remove('apc-open'); if (st) st.open = false;
    document.removeEventListener('keydown', onKey, true);
  }

  // ---------- saving ----------
  function save(now) {
    clearTimeout(saveT); st.dirty = true;
    const run = async () => {
      if (!st) return; const doc = st.doc;
      if (st.local) { ls.set(LOCAL, doc); st.dirty = false; mark('Saved on this device'); return; }
      if (!st.canEdit) { mark('View only'); return; }
      st.saving = true; mark('Saving…');
      try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/app-config`, { method: 'PUT', body: { config: doc, base: st.rev } }); st.rev = r.rev; st.dirty = false; mark('Saved'); }
      catch (e) {
        if (e && (e.status === 409 || /409|conflict/i.test(e.message || ''))) { try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/app-config`); st.doc = A().normalize(r.config); st.rev = r.rev; paint(); toast('Someone else changed the app. You are seeing their version now.'); } catch {} }
        else mark('Not saved: ' + (e.message || 'offline'));
      } finally { st.saving = false; }
    };
    if (now) return run(); saveT = setTimeout(run, 500);
  }
  // pass 3: a word typed just before the tab closes or hides is saved too (keepalive, like the website designer)
  function flushNow() {
    if (!st || !st.dirty || st.saving) return; clearTimeout(saveT);
    if (st.local) { ls.set(LOCAL, st.doc); st.dirty = false; return; }
    if (!st.canEdit || !st.pid) return;
    C.api(`/projects/${encodeURIComponent(st.pid)}/app-config`, { method: 'PUT', body: { config: st.doc, base: st.rev }, keepalive: true }).then(r => { if (st) { st.rev = r.rev; st.dirty = false; mark('Saved'); } }).catch(() => {});
  }
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
  addEventListener('pagehide', flushNow);
  const mark = t => { const el = root && root.querySelector('#apc-saved'); if (el) el.textContent = t; };

  // ---------- edits ----------
  function commit(doc, say, keepSel) {
    st.undo.push(JSON.stringify(st.doc)); if (st.undo.length > 80) st.undo.shift(); st.redo = [];
    st.doc = A().normalize(doc);
    if (!A().findScreen(st.doc, st.screen)) st.screen = st.doc.start;
    if (!keepSel && st.sel && !A().findBlock(st.doc, st.sel.block)) st.sel = null;
    save(); paint(); if (say) note(say);
  }
  function apply(op) { const r = A().apply(st.doc, op); if (r.say === '' && op.op !== 'text') return r; commit(r.doc, r.say, op.op === 'text'); if (r.added && r.added[0]) { st.screen = r.added[0]; paint(); } if (r.block) { st.sel = { block: r.block, path: '', kind: 'block' }; paint(); } return r; }
  function undo() { if (!st.undo.length) return note('Nothing to undo.'); st.redo.push(JSON.stringify(st.doc)); st.doc = A().normalize(JSON.parse(st.undo.pop())); if (!A().findScreen(st.doc, st.screen)) st.screen = st.doc.start; st.sel = null; save(); paint(); note('Undone.'); }
  function redo() { if (!st.redo.length) return note('Nothing to redo.'); st.undo.push(JSON.stringify(st.doc)); st.doc = A().normalize(JSON.parse(st.redo.pop())); st.sel = null; save(); paint(); note('Redone.'); }
  const note = t => { const el = root && root.querySelector('#apc-note'); if (el) { el.textContent = t; el.hidden = !t; clearTimeout(note.t); note.t = setTimeout(() => { el.hidden = true; }, 3200); } };

  // ---------- layout ----------
  function build() {
    if (root) root.remove();
    root = document.createElement('div'); root.id = 'apc'; root.className = 'apc'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'App Creator');
    root.innerHTML = `<header class="apc-top">
        <button class="apc-tb" id="apc-close" aria-label="Close App Creator">${ic('x')}</button>
        <div class="apc-title"><span class="apc-eyebrow">App Creator</span><input id="apc-name" class="apc-name" aria-label="App name" maxlength="48" data-i18n-skip></div>
        <span class="apc-saved faint" id="apc-saved"></span>
        <span class="apc-sp"></span>
        <div class="apc-seg" role="group" aria-label="Phone look"><button data-plat="ios">iPhone</button><button data-plat="android">Android</button></div>
        <button class="apc-tb" id="apc-undo" aria-label="Undo" title="Undo">${ic('undo')}</button><button class="apc-tb" id="apc-redo" aria-label="Redo" title="Redo">${ic('redo')}</button>
        <button class="btn" id="apc-play">${ic('play')}<span>Play</span></button>
        <div class="apc-menuw"><button class="btn primary" id="apc-export" aria-haspopup="true">Export</button>
          <div class="apc-menu" id="apc-menu" hidden>
            <button data-x="pwa-save"><b>Save into the project</b><small>A phone web app in app-web/. The live preview opens it on any phone.</small></button>
            <button data-x="pwa-zip"><b>Download the phone web app</b><small>Plain HTML and JavaScript, works offline, Add to Home Screen.</small></button>
            <button data-x="expo-save"><b>Expo project</b><small>React Native in app-expo/, for the App Store and Google Play.</small></button>
            <button data-x="brief"><b>Have my AI build it for real</b><small>Sends the screens, flows and data to your AI helpers. Nothing joins the main copy until a person says yes.</small></button>
          </div></div>
      </header>
      <div class="apc-body">
        <aside class="apc-left" id="apc-left"><nav class="apc-tabs" role="tablist"><button data-tab="screens" role="tab">Screens</button><button data-tab="add" role="tab">Add</button><button data-tab="look" role="tab">Look</button></nav><div class="apc-pane" id="apc-pane"></div></aside>
        <main class="apc-mid" id="apc-mid"><div class="apc-phone" id="apc-phone"><div class="apc-screenwrap" id="apc-stage"></div></div><div class="apc-bar" id="apc-bar" hidden></div><p class="apc-note" id="apc-note" role="status" hidden></p></main>
        <aside class="apc-right" id="apc-right"><div id="apc-insp"></div>
          <form class="apc-ask" id="apc-ask"><span class="apc-eyebrow">Flint</span><input class="input" id="apc-ask-in" placeholder="Add a settings screen, make it dark, rounder…" autocomplete="off"><button class="btn" type="submit">Do it</button><p class="apc-reply faint" id="apc-reply"></p></form></aside>
      </div>
      <nav class="apc-rack" id="apc-rack"><button data-sheet="screens">Screens</button><button data-sheet="add">Add</button><button data-sheet="look">Look</button><button data-sheet="edit">Edit</button><button data-sheet="flint">Flint</button></nav>`;
    document.body.appendChild(root); document.body.classList.add('apc-open');
    const $ = s => root.querySelector(s);
    $('#apc-close').onclick = close;
    $('#apc-name').oninput = e => { st.doc.name = e.target.value.slice(0, 48); save(); };
    $('#apc-name').onchange = () => commit(st.doc, 'Renamed the app.', true);
    root.querySelectorAll('[data-plat]').forEach(b => b.onclick = () => apply({ op: 'platform', platform: b.dataset.plat }));
    $('#apc-undo').onclick = undo; $('#apc-redo').onclick = redo;
    $('#apc-play').onclick = () => { st.mode = st.mode === 'play' ? 'edit' : 'play'; st.sel = null; paint(); };
    $('#apc-export').onclick = e => { e.stopPropagation(); const m = $('#apc-menu'); m.hidden = !m.hidden; };
    root.addEventListener('click', e => { if (!e.target.closest('.apc-menuw')) $('#apc-menu').hidden = true; });
    root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { $('#apc-menu').hidden = true; doExport(b.dataset.x); });
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; paintLeft(); });
    root.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => openSheet(b.dataset.sheet));
    $('#apc-ask').onsubmit = async e => { e.preventDefault(); const i = $('#apc-ask-in'), t = i.value.trim(); if (!t) return; i.value = ''; const r = await ask(t); $('#apc-reply').textContent = r.text || ''; };
    document.addEventListener('keydown', onKey, true);
    paint();
    setTimeout(() => { const n = root && root.querySelector('#apc-name'); if (n && !st.mobile) n.blur(); }, 0);
  }
  function onKey(e) {
    if (!root || !st) return;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
    if (e.key === 'Escape') { if (st.mode === 'play') { st.mode = 'edit'; paint(); } else if (st.sheet) closeSheet(); else if (st.sel && !typing) { st.sel = null; paint(); } else if (!typing) close(); e.stopPropagation(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel && !typing) { e.preventDefault(); removeSel(); }
  }

  function paint() { if (!root) return; paintTop(); paintLeft(); paintStage(); paintInsp(); }
  function paintTop() {
    const $ = s => root.querySelector(s), n = $('#apc-name');
    if (document.activeElement !== n) n.value = st.doc.name;
    root.querySelectorAll('[data-plat]').forEach(b => b.classList.toggle('on', st.doc.platform === b.dataset.plat));
    $('#apc-play').classList.toggle('primary', st.mode === 'play'); $('#apc-play').innerHTML = st.mode === 'play' ? `${ic('stop')}<span>${tr('Stop')}</span>` : `${ic('play')}<span>${tr('Play')}</span>`;
    root.classList.toggle('apc-playing', st.mode === 'play');
  }

  // ---------- left: screens, the library, the look ----------
  function paintLeft(into) {
    const pane = into || root.querySelector('#apc-pane'); if (!pane) return;
    if (!into) root.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === st.tab); b.setAttribute('aria-selected', b.dataset.tab === st.tab ? 'true' : 'false'); });
    const tab = into ? into.dataset.pane : st.tab;
    if (tab === 'screens') return paintScreens(pane);
    if (tab === 'add') return paintAdd(pane);
    if (tab === 'look') return paintLook(pane);
  }
  function paintScreens(pane) {
    const d = st.doc;
    pane.innerHTML = `<p class="apc-eyebrow">${d.screens.length} ${tr(d.screens.length === 1 ? 'screen' : 'screens')}</p><div class="apc-strip" id="apc-strip">${d.screens.map((s, i) => `<div class="apc-sc${s.id === st.screen ? ' on' : ''}" data-sc="${esc(s.id)}" draggable="true"><button class="apc-scb" data-go="${esc(s.id)}" aria-label="${esc(s.name)}">${mini(d, s.id, 74)}</button><span class="apc-scn"><input value="${esc(s.name)}" data-rn="${esc(s.id)}" aria-label="Screen name" data-i18n-skip>${s.id === d.start ? `<small class="apc-pill">${tr('First')}</small>` : ''}${s.tab ? `<small class="apc-pill">${tr('Tab')}</small>` : ''}</span><span class="apc-scx"><button data-sm="${esc(s.id)}" data-d="-1" aria-label="Move up"${i ? '' : ' disabled'}>${ic('up', 14)}</button><button data-sm="${esc(s.id)}" data-d="1" aria-label="Move down"${i < d.screens.length - 1 ? '' : ' disabled'}>${ic('down', 14)}</button><button data-sx="${esc(s.id)}" aria-label="Remove screen"${d.screens.length > 1 ? '' : ' disabled'}>${ic('delete', 14)}</button></span></div>`).join('')}</div>
      <div class="apc-row"><button class="btn" id="apc-addsc">${ic('plus')}<span>Blank screen</span></button>${d.screens.some(s => s.blocks.some(b => b.type === 'tabs')) ? '' : `<button class="btn" id="apc-tabbar">${ic('grid')}<span>Add a tab bar</span></button>`}</div>
      <p class="apc-eyebrow">Add ready-made screens</p><div class="apc-kits">${Object.entries(A().KITS).map(([id, k]) => `<button class="apc-kit" data-kit="${esc(id)}"><b>${esc(tr(k.title))}</b><small>${esc(tr(k.summary))}</small></button>`).join('')}</div>
      <p class="apc-eyebrow">Start over from a template</p><button class="btn" id="apc-tpls">${ic('grid')}<span>Templates</span></button>`;
    pane.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { st.screen = b.dataset.go; st.sel = null; if (st.sheet) closeSheet(); paint(); });
    pane.querySelectorAll('[data-rn]').forEach(i => i.onchange = () => apply({ op: 'screen.rename', screen: i.dataset.rn, name: i.value }));
    pane.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => { const i = st.doc.screens.findIndex(s => s.id === b.dataset.sm); apply({ op: 'screen.move', screen: b.dataset.sm, to: i + (+b.dataset.d) }); });
    pane.querySelectorAll('[data-sx]').forEach(b => b.onclick = () => apply({ op: 'screen.remove', screen: b.dataset.sx }));
    pane.querySelectorAll('[data-kit]').forEach(b => b.onclick = () => installKit(b.dataset.kit));
    const ab = pane.querySelector('#apc-addsc'); if (ab) ab.onclick = () => apply({ op: 'screen.add', name: tr('New screen') });
    const tb = pane.querySelector('#apc-tabbar'); if (tb) tb.onclick = () => apply({ op: 'tabbar' });
    pane.querySelector('#apc-tpls').onclick = () => templatesSheet();
    // drag to reorder the strip
    let drag = null;
    pane.querySelectorAll('[data-sc]').forEach(el => {
      el.addEventListener('dragstart', () => { drag = el.dataset.sc; el.classList.add('drag'); });
      el.addEventListener('dragend', () => el.classList.remove('drag'));
      el.addEventListener('dragover', e => e.preventDefault());
      el.addEventListener('drop', e => { e.preventDefault(); if (!drag || drag === el.dataset.sc) return; apply({ op: 'screen.move', screen: drag, to: st.doc.screens.findIndex(s => s.id === el.dataset.sc) }); });
    });
  }
  function paintAdd(pane) {
    const B = A().BLOCKS;
    pane.innerHTML = `<p class="faint apc-hint">Click to add to the screen you see, under the selected part.</p>` + A().GROUPS.map(g => {
      const items = Object.entries(B).filter(([, b]) => b.group === g); if (!items.length) return '';
      return `<p class="apc-eyebrow">${esc(tr(g))}</p><div class="apc-lib">${items.map(([id, b]) => `<button class="apc-libi" data-add="${esc(id)}"><span class="apc-libic">${A().icon(b.icon) || ''}</span><span>${esc(tr(b.label))}</span></button>`).join('')}</div>`;
    }).join('') + `<p class="faint apc-hint">More screens and flows are under Screens › Add ready-made screens, and on the add-on shelf.</p>`;
    pane.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const sc = A().findScreen(st.doc, st.screen); let at;
      if (st.sel) { const i = sc.blocks.findIndex(x => x.id === st.sel.block); if (i >= 0) at = i + 1; }
      apply({ op: 'block.add', screen: st.screen, type: b.dataset.add, at }); if (st.sheet) closeSheet();
    });
  }
  function paintLook(pane) {
    const t = st.doc.theme, Co = A();
    const seg = (key, opts) => `<div class="apc-seg apc-segw" role="group">${opts.map(([v, l]) => `<button data-th="${key}" data-v="${v}" class="${t[key] === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
    const sw = Object.entries({ Ember: '#F26B1D', Red: '#D23B30', Amber: '#E0951F', Green: '#2F9E6E', Mint: '#33A889', Teal: '#2A8C80', Sky: '#3A8DDE', Blue: '#2F5BEA', Indigo: '#4F5BD5', Purple: '#7A5CC2', Pink: '#D2477F', Charcoal: '#2B2B2B' });
    pane.innerHTML = `<p class="apc-eyebrow">Looks</p><div class="apc-presets" id="apc-presets">${Co.PRESETS.map(p => { const k = Co.palette(p.theme); return `<button class="apc-pre${t.preset === p.id ? ' on' : ''}" data-pre="${esc(p.id)}" title="${esc(p.name)}"><span class="apc-prs" style="background:${k.bg};border-color:${k.line};border-radius:${{ sharp: 3, soft: 8, round: 12, pill: 16 }[p.theme.radius]}px"><i style="background:${k.accent}"></i><i style="background:${k.surface2}"></i></span><span class="apc-prn">${esc(p.name)}</span></button>`; }).join('')}</div>
      <p class="apc-eyebrow">Colour</p><div class="apc-sw">${sw.map(([n, h]) => `<button data-acc="${h}" style="background:${h}" aria-label="${esc(n)}" class="${t.accent === h ? 'on' : ''}"></button>`).join('')}<label class="apc-cpick" aria-label="Any colour"><input type="color" id="apc-acc" value="${esc(t.accent)}"></label></div>
      <p class="apc-eyebrow">Light or dark</p>${seg('mode', [['light', 'Light'], ['dark', 'Dark']])}
      <p class="apc-eyebrow">Background</p>${seg('surface', [['neutral', 'Plain'], ['warm', 'Warm'], ['cool', 'Cool'], ['tinted', 'Tinted']])}
      <p class="apc-eyebrow">Corners</p>${seg('radius', [['sharp', 'Sharp'], ['soft', 'Soft'], ['round', 'Round'], ['pill', 'Pill']])}
      <p class="apc-eyebrow">Type</p><select class="input" id="apc-font" aria-label="Type">${Object.entries(Co.FONTS).map(([k, f]) => `<option value="${k}"${t.font === k ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
      <p class="apc-eyebrow">Spacing</p>${seg('density', [['compact', 'Compact'], ['regular', 'Regular'], ['roomy', 'Roomy']])}
      <p class="apc-eyebrow">Icons</p>${seg('icons', [['thin', 'Thin'], ['regular', 'Regular'], ['bold', 'Bold']])}
      <p class="apc-eyebrow">Motion</p>${seg('motion', [['calm', 'Calm'], ['standard', 'Standard'], ['snappy', 'Snappy']])}
      ${st.pid ? `<p class="apc-eyebrow">Brand kit</p><div class="apc-row"><button class="btn" id="apc-brand-in">Use the brand kit</button><button class="btn" id="apc-brand-out">Save to brand kit</button></div>` : ''}${window.TribeAssetLib ? `<p class="apc-eyebrow">Library</p><div class="apc-row"><button class="btn" id="apc-lib">Colours from the library</button></div>` : ''}`;
    pane.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => apply({ op: 'preset', id: b.dataset.pre }));
    pane.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => apply({ op: 'theme', set: { accent: b.dataset.acc } }));
    pane.querySelector('#apc-acc').onchange = e => apply({ op: 'theme', set: { accent: e.target.value } });
    pane.querySelectorAll('[data-th]').forEach(b => b.onclick = () => apply({ op: 'theme', set: { [b.dataset.th]: b.dataset.v } }));
    pane.querySelector('#apc-font').onchange = e => apply({ op: 'theme', set: { font: e.target.value } });
    const bi = pane.querySelector('#apc-brand-in'); if (bi) bi.onclick = brandIn;
    const lb = pane.querySelector('#apc-lib'); if (lb) lb.onclick = () => window.TribeAssetLib.open({ kind: 'palette', onPick: x => { if (x.kind !== 'palette') return true; const p = window.TribeAssetLib.palette(x.id); if (!p) return; const dark = (() => { const n = parseInt(p.colors.bg.slice(1), 16); return ((n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11) < 100; })(); apply({ op: 'theme', set: { accent: p.colors.accent, mode: dark ? 'dark' : 'light' } }); } });
    const bo = pane.querySelector('#apc-brand-out'); if (bo) bo.onclick = brandOut;
  }
  // the brand kit the website designer and the canvas share (GET|PUT /api/projects/:id/brand)
  const FONT_OF = { 'Inter': 'clean', 'Outfit': 'friendly', 'Bricolage Grotesque': 'bold', 'Space Grotesk': 'tech', 'Fraunces': 'editorial', 'DM Serif Display': 'elegant', 'Instrument Serif': 'classic', 'JetBrains Mono': 'mono', 'Silkscreen': 'pixel' };
  async function brandIn() {
    try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/brand`); const k = r.kit || {}; const set = {}; if (k.colors && k.colors.accent) set.accent = k.colors.accent; if (k.fonts && FONT_OF[k.fonts.display]) set.font = FONT_OF[k.fonts.display]; if (k.name && st.doc.name === 'My app') st.doc.name = k.name; if (!Object.keys(set).length) return note('The brand kit has no colour or type yet.'); apply({ op: 'theme', set }); note('Used the brand kit’s colour and type.'); }
    catch (e) { note(e.message || 'Could not read the brand kit.'); }
  }
  async function brandOut() {
    try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/brand`).catch(() => ({ kit: {} })); const k = r.kit || {}, f = A().FONTS[st.doc.theme.font]; const kit = { ...k, name: k.name || st.doc.name, colors: { ...(k.colors || {}), accent: st.doc.theme.accent }, fonts: f.display ? { display: f.display, body: f.body } : (k.fonts || {}) }; await C.api(`/projects/${encodeURIComponent(st.pid)}/brand`, { method: 'PUT', body: { kit } }); note('Saved the colour and type to the brand kit. The website and the canvas use it too.'); }
    catch (e) { note(e.message || 'Could not save the brand kit.'); }
  }

  // ---------- the phone ----------
  // the phone scales to fit the middle (clicks still land: no iframe)
  function fit() {
    if (!root) return; const mid = root.querySelector('#apc-mid'), ph = root.querySelector('#apc-phone'); if (!mid || !ph) return;
    st.mobile = matchMedia('(max-width: 820px)').matches;
    const pw = st.mobile ? 390 : 414, phh = st.mobile ? 844 : 868, k = Math.min(1, (mid.clientWidth - 16) / pw, (mid.clientHeight - 16) / phh);
    ph.style.transform = k < 1 ? `scale(${k.toFixed(4)})` : '';
  }
  window.addEventListener('resize', () => { fit(); if (st && st.sel) paintSel(); });
  function paintStage() {
    const stage = root.querySelector('#apc-stage'), d = st.doc, Co = A(), phone = root.querySelector('#apc-phone');
    phone.className = `apc-phone apc-${d.platform}`; fit();
    if (st.mode === 'play') {
      const bar = root.querySelector('#apc-bar'); if (bar) bar.hidden = true;
      stage.innerHTML = `<div class="ax apc-ax" ${Co.attrs(d)} data-i18n-skip style="${Co.vars(d.theme)}">${d.screens.map(s => Co.screenHTML(d, s, { edit: false })).join('')}</div>`;
      Co.AxRun(stage.firstChild, { start: st.screen, onGo: id => { st.screen = id; } });
      return;
    }
    const s = Co.findScreen(d, st.screen) || d.screens[0];
    stage.innerHTML = `<div class="ax apc-ax apc-edit" ${Co.attrs(d)} data-i18n-skip style="${Co.vars(d.theme)}">${Co.screenHTML(d, s, { edit: true })}</div>`;
    const bar0 = root.querySelector('#apc-bar'); if (bar0) bar0.hidden = true;
    const ax = stage.firstChild;
    ax.querySelectorAll('[data-e]').forEach(el => { if (st.canEdit) el.setAttribute('contenteditable', 'plaintext-only'); el.spellcheck = false; });
    ax.querySelectorAll('input').forEach(i => { i.readOnly = true; i.tabIndex = -1; });
    ax.addEventListener('click', onStageClick, true);
    ax.addEventListener('input', onStageInput);
    ax.addEventListener('focusout', onStageBlur);
    ax.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('[data-e]') && !e.target.closest('.ax-text')) { e.preventDefault(); e.target.blur(); } });
    if (st.sel) { const el = selEl(); if (el) { el.classList.add('apc-sel'); placeBar(el); } else st.sel = null; }
  }
  function selEl() {
    const ax = root.querySelector('.apc-edit'); if (!ax || !st.sel) return null;
    const bEl = ax.querySelector(`[data-b="${CSS.escape(st.sel.block)}"]`); if (!bEl) return null;
    if (st.sel.kind === 'item') return bEl.querySelector(`[data-item="${CSS.escape(st.sel.path)}"]`) || bEl;
    return bEl;
  }
  function onStageClick(e) {
    const t = e.target, bEl = t.closest('[data-b]'); if (!bEl) { st.sel = null; paintSel(); return; }
    const isText = t.closest('[data-e]');
    if (!isText) e.preventDefault();
    const block = bEl.dataset.b, item = t.closest('[data-item]'), icEl = t.closest('[data-ic]'), img = t.closest('[data-img]');
    const lk = t.closest('[data-lk]');
    st.sel = { block, kind: item ? 'item' : 'block', path: item ? item.dataset.item : '', ic: icEl ? icEl.dataset.ic : '', img: img ? img.dataset.img : '', lk: lk ? lk.dataset.lk : '' };
    paintSel();
  }
  function paintSel() { root.querySelectorAll('.apc-sel').forEach(x => x.classList.remove('apc-sel')); const el = selEl(), bar = root.querySelector('#apc-bar'); if (el) { el.classList.add('apc-sel'); placeBar(el); } else if (bar) bar.hidden = true; paintInsp(); }
  function placeBar(el) {
    // the toolbar lives outside the scaled phone, so its buttons keep their full size
    const bar = root.querySelector('#apc-bar'), mid = root.querySelector('#apc-mid'); if (!bar || !st.canEdit) return;
    const item = st.sel.kind === 'item';
    bar.innerHTML = item
      ? `<button data-bar="item.up" aria-label="Move up">${ic('up', 15)}</button><button data-bar="item.down" aria-label="Move down">${ic('down', 15)}</button><button data-bar="item.add" aria-label="Add one more">${ic('plus', 15)}</button><button data-bar="item.dup" aria-label="Duplicate">${ic('duplicate', 15)}</button><button data-bar="link" aria-label="Link to a screen">${ic('link', 15)}</button><button data-bar="item.remove" aria-label="Remove">${ic('delete', 15)}</button>`
      : `<button data-bar="up" aria-label="Move up">${ic('up', 15)}</button><button data-bar="down" aria-label="Move down">${ic('down', 15)}</button><button data-bar="dup" aria-label="Duplicate">${ic('duplicate', 15)}</button><button data-bar="link" aria-label="Link to a screen">${ic('link', 15)}</button><button data-bar="del" aria-label="Remove">${ic('delete', 15)}</button>`;
    const r = el.getBoundingClientRect(), r0 = mid.getBoundingClientRect();
    bar.hidden = false;
    const top = r.top - r0.top - bar.offsetHeight - 6;
    bar.style.top = Math.max(4, top < 4 ? r.bottom - r0.top + 6 : top) + 'px';
    bar.style.left = Math.max(4, Math.min(mid.clientWidth - bar.offsetWidth - 4, r.left - r0.left)) + 'px';
    bar.querySelectorAll('[data-bar]').forEach(b => b.onclick = e => { e.stopPropagation(); barAct(b.dataset.bar); });
  }
  function barAct(a) {
    const s = st.sel; if (!s) return;
    if (a === 'up' || a === 'down') return apply({ op: 'block.move', block: s.block, dir: a === 'up' ? -1 : 1 });
    if (a === 'dup') return apply({ op: 'block.dup', block: s.block });
    if (a === 'del') return removeSel();
    if (a === 'link') { if (st.mobile) openSheet('edit'); const sel = root.querySelector('#apc-linkto') || document.querySelector('#apc-sheet #apc-linkto'); if (sel) sel.focus(); return; }
    if (/^item\./.test(a)) { const r = apply({ op: a, block: s.block, path: s.path }); if (a === 'item.remove') { st.sel = { block: s.block, kind: 'block', path: '' }; paintSel(); } return r; }
  }
  function removeSel() { const s = st.sel; if (!s) return; if (s.kind === 'item') apply({ op: 'item.remove', block: s.block, path: s.path }); else { apply({ op: 'block.remove', block: s.block }); st.sel = null; paint(); } }
  let typing = null;
  function onStageInput(e) {
    const el = e.target.closest('[data-e]'), bEl = e.target.closest('[data-b]'); if (!el || !bEl) return;
    const f = A().findBlock(st.doc, bEl.dataset.b); if (!f) return;
    if (!typing) { typing = { block: f.block.id, before: JSON.stringify(st.doc) }; }
    const setPath = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; };
    setPath(f.block.props, el.dataset.e, el.textContent.slice(0, 600)); save();
  }
  function onStageBlur(e) {
    if (!typing || !e.target.closest('[data-e]')) return;
    st.undo.push(typing.before); st.redo = []; typing = null;
    const strip = root.querySelector('#apc-strip'); if (strip && st.tab === 'screens') paintScreens(root.querySelector('#apc-pane'));
  }

  // ---------- right: the selection ----------
  function paintInsp(into) {
    const box = into || root.querySelector('#apc-insp'); if (!box) return;
    const d = st.doc, Co = A();
    if (st.mode === 'play') { box.innerHTML = `<p class="apc-eyebrow">Playing</p><p class="faint">Tap through the app like it is on a phone. Links move between screens with the ${esc(d.theme.motion)} motion. Esc or Stop to go back to editing.</p>`; return; }
    if (!st.sel) {
      const sc = Co.findScreen(d, st.screen);
      box.innerHTML = `<p class="apc-eyebrow">${esc(sc ? sc.name : '')}</p><p class="faint">Click any part of the screen to select it, or click words to type. The library is under Add, the whole look under Look.</p>
        <label class="apc-chk"><input type="checkbox" id="apc-first"${d.start === st.screen ? ' checked disabled' : ''}> <span>The app opens on this screen</span></label>`;
      const f = box.querySelector('#apc-first'); if (f) f.onchange = () => { st.doc.start = st.screen; commit(st.doc, 'The app opens here now.'); };
      return;
    }
    const fb = Co.findBlock(d, st.sel.block); if (!fb) { box.innerHTML = ''; return; }
    const bk = fb.block, B = Co.BLOCKS[bk.type];
    const lpath = st.sel.kind === 'item' ? st.sel.path : (st.sel.lk && !/^items\./.test(st.sel.lk) ? st.sel.lk : (bk.links[''] || ['button', 'card', 'feed'].includes(bk.type) ? (bk.type === 'card' && bk.props.button ? 'button' : '') : (bk.links.button ? 'button' : bk.props.button ? 'button' : '')));
    const link = bk.links[lpath] || null;
    const others = d.screens.filter(s => s.id !== fb.screen.id);
    const icPath = st.sel.ic, imPath = st.sel.img;
    box.innerHTML = `<p class="apc-eyebrow">${esc(tr(B.label))}${st.sel.kind === 'item' ? ` › ${esc(tr('one entry'))}` : ''}</p>
      <div class="apc-field"><label for="apc-linkto">When tapped, go to</label><select class="input" id="apc-linkto"><option value="">Nothing</option>${others.map(s => `<option value="${esc(s.id)}"${link && link.to === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="+new">A new screen…</option></select>
        <div class="apc-seg apc-segw" role="group" aria-label="Transition">${[['push', 'Slide'], ['sheet', 'Sheet'], ['fade', 'Fade'], ['morph', 'Grow']].map(([v, l]) => `<button data-how="${v}" class="${(link ? link.how : 'push') === v ? 'on' : ''}"${link ? '' : ' disabled'}>${esc(l)}</button>`).join('')}</div></div>
      ${icPath ? `<div class="apc-field"><span>Icon</span><div class="apc-icons">${Co.ICON_NAMES.map(n => `<button data-icn="${n}" aria-label="${n}" class="${Co.getPath(bk.props, icPath) === n ? 'on' : ''}">${Co.icon(n)}</button>`).join('')}</div></div>` : ''}
      ${imPath ? `<div class="apc-field"><span>Picture</span><div class="apc-ills">${Co.ILL_NAMES.map(n => `<button data-ill="${n}" aria-label="${n}" class="ax ${Co.getPath(bk.props, imPath) === n ? 'on' : ''}" ${Co.attrs(d)} style="${Co.vars(d.theme)}">${Co.illus(n, d.theme)}</button>`).join('')}</div></div>` : ''}
      ${bk.type === 'button' ? `<div class="apc-field"><span>Style</span><div class="apc-seg apc-segw">${[['primary', 'Main'], ['secondary', 'Quiet']].map(([v, l]) => `<button data-prop="style" data-v="${v}" class="${bk.props.style === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
      ${bk.type === 'chart' ? `<div class="apc-field"><span>Chart</span><div class="apc-seg apc-segw">${[['bar', 'Bars'], ['line', 'Line']].map(([v, l]) => `<button data-prop="kind" data-v="${v}" class="${bk.props.kind === v ? 'on' : ''}">${l}</button>`).join('')}</div><label for="apc-vals">Values</label><input class="input" id="apc-vals" value="${esc((bk.props.values || []).join(', '))}"></div>` : ''}
      ${bk.type === 'nav' ? `<label class="apc-chk"><input type="checkbox" id="apc-back"${bk.props.back ? ' checked' : ''}> <span>Back button</span></label>` : ''}
      <div class="apc-row"><button class="btn" data-bar2="dup">${ic('duplicate')}<span>Duplicate</span></button><button class="btn" data-bar2="del">${ic('delete')}<span>Remove</span></button></div>`;
    const lt = box.querySelector('#apc-linkto');
    lt.onchange = () => {
      let to = lt.value;
      if (to === '+new') { const r = A().apply(st.doc, { op: 'screen.add', name: tr('New screen') }); st.doc = r.doc; to = r.added[0]; }
      if (!to) return apply({ op: 'unlink', block: bk.id, path: lpath });
      apply({ op: 'link', block: bk.id, path: lpath, to, how: link ? link.how : 'push' });
    };
    box.querySelectorAll('[data-how]').forEach(b => b.onclick = () => link && apply({ op: 'link', block: bk.id, path: lpath, to: link.to, how: b.dataset.how }));
    box.querySelectorAll('[data-icn]').forEach(b => b.onclick = () => apply({ op: 'icon', block: bk.id, path: icPath, value: b.dataset.icn }));
    box.querySelectorAll('[data-ill]').forEach(b => b.onclick = () => apply({ op: 'illus', block: bk.id, path: imPath, value: b.dataset.ill }));
    box.querySelectorAll('[data-prop]').forEach(b => b.onclick = () => { const c = JSON.parse(JSON.stringify(st.doc)), f = A().findBlock(c, bk.id); f.block.props[b.dataset.prop] = b.dataset.v; commit(c, 'Changed it.', true); });
    const vals = box.querySelector('#apc-vals'); if (vals) vals.onchange = () => { const c = JSON.parse(JSON.stringify(st.doc)), f = A().findBlock(c, bk.id); f.block.props.values = vals.value.split(/[\s,]+/).map(Number).filter(x => !isNaN(x)).slice(0, 24); commit(c, 'Updated the chart.', true); };
    const bb = box.querySelector('#apc-back'); if (bb) bb.onchange = () => { const c = JSON.parse(JSON.stringify(st.doc)), f = A().findBlock(c, bk.id); f.block.props.back = bb.checked; commit(c, 'Changed it.', true); };
    box.querySelectorAll('[data-bar2]').forEach(b => b.onclick = () => barAct(b.dataset.bar2));
  }

  // ---------- phone sheets (the rack at the bottom) ----------
  function openSheet(kind) {
    closeSheet(); st.sheet = kind;
    const sh = document.createElement('div'); sh.id = 'apc-sheet'; sh.className = 'apc-sheet';
    sh.innerHTML = `<div class="apc-sheet-in"><header><b>${esc(tr({ screens: 'Screens', add: 'Add', look: 'Look', edit: 'Edit', flint: 'Flint' }[kind]))}</b><button class="apc-tb" id="apc-sheet-x" aria-label="Close">${ic('x')}</button></header><div class="apc-pane" data-pane="${kind}"></div></div>`;
    root.appendChild(sh);
    const pane = sh.querySelector('.apc-pane');
    if (kind === 'edit') paintInsp(pane);
    else if (kind === 'flint') { pane.innerHTML = `<form class="apc-ask"><input class="input" placeholder="Add a settings screen, make it dark…" autocomplete="off"><button class="btn primary" type="submit">Do it</button><p class="apc-reply faint"></p></form>`; const f = pane.querySelector('form'); f.onsubmit = async e => { e.preventDefault(); const i = f.querySelector('input'), t = i.value.trim(); if (!t) return; i.value = ''; const r = await ask(t); f.querySelector('.apc-reply').textContent = r.text || ''; }; }
    else paintLeft(pane);
    sh.querySelector('#apc-sheet-x').onclick = closeSheet;
    sh.addEventListener('click', e => { if (e.target === sh) closeSheet(); });
  }
  function closeSheet() { const sh = root && root.querySelector('#apc-sheet'); if (sh) sh.remove(); if (st) st.sheet = ''; }

  // ---------- templates ----------
  function templatesSheet() {
    closeSheet(); st.sheet = 'templates';
    const sh = document.createElement('div'); sh.id = 'apc-sheet'; sh.className = 'apc-sheet apc-tsheet';
    const list = A().templateList(), cats = [...new Set(list.map(t => t.cat))];
    sh.innerHTML = `<div class="apc-sheet-in"><header><b>Templates</b><span class="faint">${list.length} ${tr('apps')}</span><button class="apc-tb" id="apc-sheet-x" aria-label="Close">${ic('x')}</button></header><div class="apc-pane">${cats.map(c => `<p class="apc-eyebrow">${esc(tr(c))}</p><div class="apc-tgrid">${list.filter(t => t.cat === c).map(t => `<button class="apc-tpl" data-tpl="${esc(t.id)}">${mini(A().template(t.id), null, 104)}<b>${esc(tr(t.title))}</b><small>${esc(tr(t.summary))}</small></button>`).join('')}</div>`).join('')}</div></div>`;
    root.appendChild(sh);
    sh.querySelector('#apc-sheet-x').onclick = closeSheet;
    sh.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => { const d = A().template(b.dataset.tpl); closeSheet(); commit(d, `Started from the ${d.name} template. Undo brings back your design.`); st.screen = d.start; st.sel = null; paint(); });
  }

  // ---------- kits (also the add-on shelf's install path) ----------
  function installKit(id, quiet) {
    if (!st || !st.open) return open({ kit: id });
    const r = apply({ op: 'kit', kit: id }); if (!quiet && r.say) toast(r.say); return r;
  }

  // ---------- Flint (no AI): sentences -> the same edits ----------
  async function ask(text) {
    const N = window.TribeNLU; if (!N) return { text: 'Flint is not loaded.' };
    const sel = st.sel ? A().findBlock(st.doc, st.sel.block) : null;
    const r = N.parse(text, { now: new Date(), view: 'appcreator', selection: !!st.sel, selKind: sel ? sel.block.type : '', screens: st.doc.screens.map(s => s.name) });
    const out = [];
    for (const s of r.steps) { if (!s.intent || s.conf < 0.6) continue; const x = flint(s); if (x) out.push(x); }
    if (!out.length) return { text: tr('I can do that with an AI helper. Here I can add screens and kits, link buttons, and change the look: try “add a settings screen” or “make it dark”.') };
    const text2 = out.map(x => x.text).filter(Boolean).join(' '); note(text2); return { text: text2 };
  }
  const KIT_OF = { settings: 'settings', setting: 'settings', preferences: 'settings', onboarding: 'onboarding', welcome: 'onboarding', intro: 'onboarding', paywall: 'paywall', premium: 'paywall', subscription: 'paywall', profile: 'profile', account: 'profile', 'sign in': 'signin', signin: 'signin', login: 'signin', 'log in': 'signin', signup: 'signin', 'sign up': 'signin', chat: 'chat', messages: 'chat', shop: 'shop', store: 'shop', stats: 'charts', charts: 'charts', insights: 'charts', 'empty state': 'empty', player: 'player', music: 'player', search: 'search', notifications: 'notifications', alerts: 'notifications', checkout: 'checkout', cart: 'checkout', detail: 'detail', feed: 'feed', booking: 'calendar', calendar: 'calendar', timer: 'timer', map: 'map', help: 'help', faq: 'help', about: 'about', leaderboard: 'leaderboard', achievements: 'achievements', badges: 'achievements', invite: 'invite', permissions: 'permissions' };
  function flint(step) {
    const id = step.intent, sl = step.slots || {}, Co = A();
    if (id === 'app.make') { const t = Co.template(sl.template, { name: sl.name, accent: sl.color && sl.color.hex }); if (!t) return null; if (!st || !st.open) { open({ template: sl.template, name: sl.name, accent: sl.color && sl.color.hex }); return { text: `Opened App Creator with the ${t.name} template.` }; } commit(t, ''); st.screen = t.start; paint(); return { text: `Started a ${(Co.TEMPLATES.find(x => x.id === sl.template) || {}).title || 'new'} app. Click anything to change it.` }; }
    if (!st || !st.open) { open({}); }
    if (id === 'app.kit') { const k = KIT_OF[String(sl.kit || '').toLowerCase()] || sl.kit; const r = apply({ op: 'kit', kit: k }); return { text: r.say }; }
    if (id === 'app.block') { const at = st.sel ? (Co.findScreen(st.doc, st.screen).blocks.findIndex(b => b.id === st.sel.block) + 1) || undefined : undefined; const r = apply({ op: 'block.add', screen: st.screen, type: sl.type, at }); return { text: r.say }; }
    if (id === 'app.tabbar') return { text: apply({ op: 'tabbar' }).say };
    if (id === 'app.theme') { const set = {}; for (const k of ['mode', 'radius', 'font', 'density', 'icons', 'motion', 'surface']) if (sl[k]) set[k] = sl[k]; if (sl.color) set.accent = sl.color.hex; if ('sound' in sl) set.sound = sl.sound || ''; if (sl.font === 'next') { const ks = Object.keys(Co.FONTS); set.font = ks[(ks.indexOf(st.doc.theme.font) + 1) % ks.length]; } if (sl.radius === 'more' || sl.radius === 'less') { const ks = ['sharp', 'soft', 'round', 'pill'], i = ks.indexOf(st.doc.theme.radius); set.radius = ks[Math.max(0, Math.min(3, i + (sl.radius === 'more' ? 1 : -1)))]; } const r = apply({ op: 'theme', set }); return { text: sl.font === 'next' ? `Switched the type to ${Co.FONTS[set.font].name}.` : r.say }; }
    if (id === 'app.preset') { const p = Co.PRESETS.find(x => x.id === sl.preset || x.name.toLowerCase() === String(sl.preset || '').toLowerCase()); if (!p) return { text: 'That look is not in the list. Open Look to see all of them.' }; return { text: apply({ op: 'preset', id: p.id }).say }; }
    if (id === 'app.platform') return { text: apply({ op: 'platform', platform: sl.platform }).say };
    if (id === 'app.link') {
      const to = st.doc.screens.find(s => s.name.toLowerCase() === String(sl.to || '').toLowerCase()) || st.doc.screens.find(s => s.name.toLowerCase().includes(String(sl.to || '').toLowerCase()) || s.id === String(sl.to || '').toLowerCase());
      if (!to) return { text: `There is no ${sl.to} screen yet. Say “add a ${sl.to} screen” first.` };
      let sel = st.sel; const sc = Co.findScreen(st.doc, st.screen);
      if (!sel) { const btn = sc.blocks.find(b => b.type === 'button') || sc.blocks.find(b => b.props && b.props.button); if (!btn) return { text: 'Select the button first, then say where it goes.' }; sel = { block: btn.id, kind: 'block', path: '' }; }
      const fb = Co.findBlock(st.doc, sel.block), path = sel.kind === 'item' ? sel.path : (fb.block.type === 'button' || fb.block.type === 'feed' ? '' : 'button');
      return { text: apply({ op: 'link', block: sel.block, path, to: to.id, how: sl.how || 'push' }).say };
    }
    if (id === 'app.screen') return { text: apply({ op: 'screen.add', name: sl.name || 'New screen' }).say };
    if (id === 'app.play') { st.mode = 'play'; paint(); return { text: 'Playing the prototype. Tap through it; Esc to stop.' }; }
    if (id === 'app.export') { doExport(sl.kind === 'expo' ? 'expo-save' : sl.kind === 'ai' ? 'brief' : st.local ? 'pwa-zip' : 'pwa-save'); return { text: 'Exporting…' }; }
    if (id === 'app.undo') { undo(); return { text: 'Undone.' }; }
    if (id === 'app.rename') return { text: apply({ op: 'rename', name: sl.name }).say };
    return null;
  }

  // ---------- export ----------
  async function fontBytes(f) { try { const r = await fetch(`assets/site-fonts/${f}.woff2`); return r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; } }
  async function doExport(kind) {
    const Co = A(), X = window.TribeExport;
    try {
      if (kind === 'pwa-save' || kind === 'expo-save') {
        if (st.local || !st.pid) { if (kind === 'expo-save') return zipDownload(Co.expo(st.doc), '-expo'); return doExport('pwa-zip'); }
        await save(true);
        const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/app-config/export`, { method: 'POST', body: { kind: kind === 'pwa-save' ? 'pwa' : 'expo' } });
        if (r.kind === 'pwa') { toast(`Saved the phone web app in ${r.folder}/ (${r.written.length} files).`); note(`Saved in ${r.folder}/. Open the live preview to try it on a phone.`); if (window.TribePreview && window.TribePreview.open) setTimeout(() => { try { window.TribePreview.open(); } catch {} }, 200); }
        else { toast(`Saved the Expo project in ${r.folder}/.`); note(r.phoneApp ? 'The phone app card now points at app-expo/: install its dependencies there and scan the Expo Go code.' : `Saved in ${r.folder}/. Your phone app mode already uses another folder.`); }
        return r;
      }
      if (kind === 'pwa-zip') { const files = Co.pwa(st.doc), f = Co.FONTS[st.doc.theme.font]; for (const x of f.files) { const b = await fontBytes(x); if (b) files.push(['fonts/' + x + '.woff2', b]); } return zipDownload(files, '-app'); }
      if (kind === 'brief') {
        const text = Co.brief(st.doc);
        if (connected() && st.pid) {
          try { await C.api('/agents/channel', { method: 'POST', body: { text: '@agents ' + text } }); toast('Sent the brief to your AI helpers in #agents.'); note('Sent to #agents. You approve every change before it joins the main copy.'); return { sent: true, text }; }
          catch (e) {   // no AI helper in this project yet: the brief waits as a task the first helper (or person) picks up
            if (!/mention an agent/i.test(e.message || '')) throw e;
            await C.api('/tasks', { method: 'POST', body: { title: `Build “${st.doc.name}” for real`, body: text, type: 'build' } });
            toast('No AI helper is connected yet, so the brief is a task now.'); note('Saved as a task. Connect your AI (Agents Hub) and it can pick it up.'); return { task: true, text };
          }
        }
        try { await navigator.clipboard.writeText(text); } catch {}
        toast('Copied the brief. Paste it to your AI helper.'); return { copied: true, text };
      }
    } catch (e) { toast(e.message || 'Export failed'); note(e.message || 'Export failed'); return { error: e.message }; }
    function zipDownload(files, suffix) {
      if (!X || !X.zip) { toast('The exporter did not load.'); return null; }
      const blob = X.zip(files, 'application/zip'), name = (st.doc.name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + suffix + '.zip';
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast(`Downloaded ${name}.`); return { downloaded: name, files: files.map(x => x[0]) };
    }
  }

  // ---------- for the Launch kit and others: every screen, drawable ----------
  async function screens(projectId) {
    let doc = st && st.open && (!projectId || projectId === st.pid) ? st.doc : null;
    if (!doc && projectId && connected()) { try { doc = (await C.api(`/projects/${encodeURIComponent(projectId)}/app-config`)).config; } catch {} }
    if (!doc && !projectId) doc = ls.get(LOCAL, null);
    if (!doc) return [];
    const Co = A(), d = Co.normalize(doc), cssText = Co.css(d, { scope: '.ax' });
    return d.screens.map(s => {
      const html = `<div class="ax" ${Co.attrs(d)} style="position:relative;width:390px;height:844px;overflow:hidden">${Co.screenHTML(d, s, { edit: false })}</div>`;
      return { id: s.id, name: s.name, html, css: cssText, render: (canvas, w, h) => new Promise((res, rej) => {
        w = w || 390; h = h || 844; canvas.width = w; canvas.height = h;
        // an SVG picture of the screen: the HTML goes through the XML serializer, because an SVG image must be well-formed XML
        const box = document.createElement('div'); box.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); box.innerHTML = `<style>${cssText.replace(/@font-face\{[^}]*\}/g, '')}</style>${html}`;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="390" height="844" transform="scale(${w / 390},${h / 844})">${new XMLSerializer().serializeToString(box)}</foreignObject></svg>`;
        const img = new Image(); img.onload = () => { canvas.getContext('2d').drawImage(img, 0, 0); res(canvas); }; img.onerror = rej;
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }) };
    });
  }

  // ---------- the tribe's suggestions (window.TribeSuggest, when that engine is present) ----------
  function registerSuggest() {
    const S = window.TribeSuggest; if (!S || !S.register || registerSuggest.done) return; registerSuggest.done = true;
    const wants = [[/\b(log ?in|sign ?in|sign ?up|account|auth)\b/i, 'signin', 'Add a sign-in screen'], [/\b(settings?|preferences)\b/i, 'settings', 'Add a settings screen'], [/\b(onboarding|welcome|first run|intro)\b/i, 'onboarding', 'Add welcome pages'],
      [/\b(premium|paywall|subscription|pro plan|upgrade)\b/i, 'paywall', 'Add a paywall layout'], [/\b(chat|messag|dm)\w*/i, 'chat', 'Add chat screens'], [/\b(search|find)\b/i, 'search', 'Add a search screen'], [/\b(notification|alert|push)\w*/i, 'notifications', 'Add a notifications screen'],
      [/\b(profile|avatar|bio)\b/i, 'profile', 'Add a profile screen'], [/\b(stats?|charts?|analytics|insights?)\b/i, 'charts', 'Add a stats screen'], [/\b(map|location|nearby)\b/i, 'map', 'Add a map screen'], [/\b(leaderboard|ranking|high ?scores?)\b/i, 'leaderboard', 'Add a leaderboard'], [/\b(cart|checkout|buy)\b/i, 'checkout', 'Add a cart and checkout']];
    S.register({ id: 'app', title: 'App',
      async gather(ctx) {
        const pid = ctx && ctx.projectId; if (!pid || !connected()) return null;
        const [cfg, tasks, docs] = await Promise.all([C.api(`/projects/${encodeURIComponent(pid)}/app-config`).catch(() => null), C.api('/tasks', { project: pid }).catch(() => ({ tasks: [] })), C.api('/docs', { project: pid }).catch(() => ({ docs: [] }))]);
        return { doc: cfg && cfg.config, tasks: (tasks.tasks || []).filter(t => t.status !== 'done'), docs: (docs.docs || []).slice(0, 40) };
      },
      async suggest(ctx, g) {
        if (!g || !g.doc) return [];
        const Co = A(), doc = Co.normalize(g.doc), have = new Set(doc.screens.flatMap(s => s.blocks.map(b => b.type))), out = [];
        const sources = g.tasks.map(t => ({ text: `${t.title} ${t.body || ''}`, from: { kind: 'task', ref: t.id, who: t.assignee || '' } })).concat(g.docs.map(d => ({ text: `${d.title || ''} ${d.summary || ''}`, from: { kind: 'doc', ref: d.id || d.path, who: d.author || '' } })));
        const kitType = { signin: 'signin', settings: 'settings', onboarding: 'onboarding', paywall: 'paywall', chat: 'chat', search: 'search', profile: 'profile', charts: 'chart', map: 'map', checkout: 'stats', notifications: 'list', leaderboard: 'list' };
        for (const [rx, kitId, title] of wants) {
          const hits = sources.filter(x => rx.test(x.text)); if (!hits.length) continue;
          if (kitType[kitId] && have.has(kitType[kitId]) && !['notifications', 'leaderboard', 'checkout'].includes(kitId)) continue;
          if (doc.screens.some(s => s.id.startsWith(Co.KITS[kitId] ? Co.KITS[kitId].screens()[0].id : kitId))) continue;
          out.push({ id: `app-kit-${kitId}`, title, why: `Mentioned in ${hits.length === 1 ? (hits[0].from.kind === 'task' ? 'a task' : 'a doc') : hits.length + ' places'}: “${hits[0].text.trim().slice(0, 70)}”`, from: hits.slice(0, 3).map(h => h.from),
            apply: async () => { const before = JSON.stringify(doc); const r = Co.apply(doc, { op: 'kit', kit: kitId }); await C.api(`/projects/${encodeURIComponent(ctx.projectId)}/app-config`, { method: 'PUT', body: { config: r.doc, force: true } }); if (st && st.open && st.pid === ctx.projectId) { st.doc = r.doc; paint(); } return async () => { await C.api(`/projects/${encodeURIComponent(ctx.projectId)}/app-config`, { method: 'PUT', body: { config: JSON.parse(before), force: true } }); if (st && st.open && st.pid === ctx.projectId) { st.doc = Co.normalize(JSON.parse(before)); paint(); } }; } });
        }
        if (ctx.brand && ctx.brand.colors && ctx.brand.colors.accent && ctx.brand.colors.accent.toUpperCase() !== doc.theme.accent) out.push({ id: 'app-brand', title: 'Use the brand colour in the app', why: 'The brand kit has a colour the app does not use yet.', from: [{ kind: 'brand', ref: 'brand', who: '' }],
          apply: async () => { const before = JSON.stringify(doc); const r = Co.apply(doc, { op: 'theme', set: { accent: ctx.brand.colors.accent } }); await C.api(`/projects/${encodeURIComponent(ctx.projectId)}/app-config`, { method: 'PUT', body: { config: r.doc, force: true } }); return async () => { await C.api(`/projects/${encodeURIComponent(ctx.projectId)}/app-config`, { method: 'PUT', body: { config: JSON.parse(before), force: true } }); }; } });
        return out.slice(0, 6);
      } });
  }
  registerSuggest(); window.addEventListener('load', registerSuggest); setTimeout(registerSuggest, 1500);

  // the add-on shelf's app kits: market.js calls installKit when an "app-kit" item is used
  C && C.on && C.on('ws', m => { if (!m || m.type !== 'app-config' || !st || !st.open || m.project !== st.pid || st.dirty || typing) return; C.api(`/projects/${encodeURIComponent(st.pid)}/app-config`).then(r => { if (!st || !r.config || r.rev === st.rev) return; st.doc = A().normalize(r.config); st.rev = r.rev; paint(); note('Updated with a friend’s change.'); }).catch(() => {}); });
  if (location.hash === '#/app-creator') setTimeout(() => open({}), 300);
  window.addEventListener('hashchange', () => { if (location.hash === '#/app-creator' && (!st || !st.open)) open({}); });

  window.TribeAppCreator = { open, close, state: () => st, doc: () => st && st.doc, ask, apply: op => apply(op), flint, installKit, screens, mini, templates: () => A().templateList(), undo, redo, export: doExport };
})();
