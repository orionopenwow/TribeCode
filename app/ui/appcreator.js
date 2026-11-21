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
  const A = () => window.TribeAppCore, C = window.TribeClient, P = () => window.TribeAppPlus;   // P: appcreator-plus.js (pass 4)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? (window.TribeI18n.t(s, s) || s) : s);
  const connected = () => !!(C && C.connected && C.connected() && (!C.hasToken || C.hasToken()));
  const onDevice = () => !!(window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo());   // feat/easy-start: a tribe that lives in this browser saves here
  const LOCAL = 'tribecode.appcreator.local';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const IC = { undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>', play: '<path d="M8 5.5v13l10.5-6.5z"/>', stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>' };
  const ic = (n, sz) => { const s = sz || 16; if (IC[n]) return `<svg class="apc-ic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`; const T = window.TribeIcons; return T && T.svg ? T.svg(n, s) : ''; };
  let root = null, st = null, saveT = 0, styleDone = false;
  let cw = null, crStrip = null;   // feat/cowork-editors: who else is here (cowork.js) and how changes work here (changes.js)

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
    // pass 4: someone in a tribe that cannot be reached right now still means the tribe's app, not the design kept on this
    // device with no tribe (which opened in its place and looked like the app had gone)
    const inTribe = !!(C && C.hasToken && C.hasToken()) && !(window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo());
    const pid = o.pid || ((connected() || inTribe) && C.project ? C.project() : '');
    st = { open: true, pid, local: !pid, doc: null, rev: 0, canEdit: true, canDraft: true, base: '', pendingDraft: false, screen: '', sel: null, mode: 'edit', tab: 'screens', sels: [], peek: '', cmode: false, comments: [], map: false, mapSel: [], undo: [], redo: [], saving: false, savedAt: '', mobile: matchMedia('(max-width: 820px)').matches, sheet: '' };
    let cur = null;
    // pass 4: changes that could not be sent (the tribe was unreachable) are kept on this device and come back here
    let unsent = pid ? ls.get(UNSENT(pid), null) : null, unreachable = false;
    if (pid) { try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/app-config`); cur = r.config; st.rev = r.rev || 0; st.canEdit = r.canEdit !== false; st.canDraft = st.canEdit || !!r.canSuggest; st.base = cur ? JSON.stringify(A().normalize(cur)) : ''; } catch (e) { cur = null; unreachable = !(e && e.status); } }
    else cur = ls.get(LOCAL, null);
    if (unreachable && !(unsent && unsent.doc)) { st = null; toast('Can’t reach the tribe right now. Your app is safe there; try again in a moment.'); return null; }   // never a blank app saved over the real one
    let doc = cur ? A().normalize(cur) : null, resend = false;
    if (unsent && unsent.doc && st.canEdit) {
      const mine = A().normalize(unsent.doc);
      if (unreachable) { doc = mine; cur = mine; st.rev = unsent.base || 0; resend = true; }
      else if (!doc || JSON.stringify(mine) === JSON.stringify(doc)) ls.set(UNSENT(pid), null);
      else if ((unsent.base || 0) === st.rev) { doc = mine; resend = true; }
      else if (window.TribeUI && window.TribeUI.sheet) {
        const pick = await new Promise(res => {
          let done = false; const end = v => { if (done) return; done = true; sh.close(); res(v); };
          const sh = window.TribeUI.sheet({ id: 'apc-unsent', kind: 'decision', eyebrow: 'App Creator', title: 'Two versions of this app',
            body: `<p>${esc(tr('You changed this app while the tribe could not be reached, and someone changed it since.'))}</p><p class="faint">${esc(tr('Keep mine replaces theirs for everyone. Keep theirs drops the changes kept on this device.'))}</p>`,
            foot: `<button type="button" class="btn" id="apc-theirs">${esc(tr('Keep theirs'))}</button><button type="button" class="btn primary" id="apc-mine">${esc(tr('Keep mine'))}</button>`,
            onClose: () => end('later') });
          sh.el.querySelector('#apc-theirs').onclick = () => end('theirs'); sh.el.querySelector('#apc-mine').onclick = () => end('mine');
        });
        if (pick === 'mine') { st.undo.push(JSON.stringify(doc)); doc = mine; resend = true; }
        else if (pick === 'theirs') ls.set(UNSENT(pid), null);
      }
    }
    // pass 3: picking a template in the gallery over an app the tribe already has asks first (the old app was replaced
    // and saved over at once; Undo only lasted until App Creator closed)
    if (o.template && o.askReplace && doc && doc.screens && doc.screens.length && window.TribeUI && window.TribeUI.sheet) {
      const pick = await new Promise(res => {
        let done = false; const end = v => { if (done) return; done = true; sh.close(); res(v); };
        const sh = window.TribeUI.sheet({ id: 'apc-replace', kind: 'decision', eyebrow: 'App Creator', title: 'Start over from this template?',
          body: `<p>${esc(tr('This project already has an app'))}: <b>${esc(doc.name || '')}</b>. ${esc(tr('Starting over replaces it for everyone in the tribe.'))}</p>`,
          foot: `<button type="button" class="btn" id="apc-keep">${esc(tr('Keep my app'))}</button><button type="button" class="btn primary" id="apc-over">${esc(tr('Start over'))}</button>`,
          onClose: () => end('keep') });
        sh.el.querySelector('#apc-keep').onclick = () => end('keep'); sh.el.querySelector('#apc-over').onclick = () => end('over');
      });
      if (pick !== 'over') o = { ...o, template: '' };
    }
    if (o.template) { const t = A().template(o.template, { name: o.name, accent: o.accent }); if (t) { if (doc) st.undo.push(JSON.stringify(doc)); doc = t; } }
    // pass 4: an app made on this device before there was a tribe comes along into a project that has none yet
    let brought = false;
    if (!doc && pid && !unreachable && st.canEdit && !o.name) { const mine = ls.get(LOCAL, null); if (mine && mine.screens && mine.screens.length) { doc = A().normalize(mine); brought = true; } }
    if (!doc) doc = A().blank(o.name || 'My app');
    st.doc = doc; st.screen = doc.start;
    // someone who can only suggest picks up their unsent draft on this device (it is theirs until they send it)
    if (pid && !st.canEdit && st.canDraft) { const dr = ls.get(DRAFT(pid), null); if (dr && dr.doc) { st.doc = A().normalize(dr.doc); st.pendingDraft = true; } }
    build();
    coworkOn();
    if (o.template || !cur || resend) save();
    if (resend && !unreachable) toast('Sent the changes you made while the tribe could not be reached.');
    if (brought) toast('Brought in the app you made on this device before the tribe.');
    if (pid && st.canEdit && window.TribeWhere) window.TribeWhere.check(pid, 'app');   // files changed outside TribeCode: ask, never write over them
    if (o.kit) installKit(o.kit, true);
    if (o.template && cur) note('Started from the template. Undo brings back your earlier design.');   // pass 4: a short note under the phone, not a toast over the screen
    return st;
  }
  function close(fromBack) {
    if (!root) return; clearTimeout(saveT); if (st && st.dirty) save(true);
    if (shell) { shell.destroy(); shell = null; } if (backDone) { const d = backDone; backDone = null; if (fromBack !== true) d(); }
    if (cw) { cw.detach(); cw = null; } crStrip = null; if (P()) P().stopPlay();
    inertOthers(false); root.remove(); root = null; document.body.classList.remove('apc-open'); if (st) st.open = false;
    document.removeEventListener('keydown', onKey, true);
  }

  // ---------- saving ----------
  function save(now) {
    clearTimeout(saveT); st.dirty = true;
    const run = async () => {
      if (!st) return; const doc = st.doc;
      if (st.local) { ls.set(LOCAL, doc); st.dirty = false; mark('Saved on this device'); if (P()) P().rememberLocal(doc); return; }
      if (!st.canEdit) {
        if (!st.canDraft) { st.dirty = false; mark('View only'); return; }
        // a suggestion in the making: kept on this device until "Suggest this change" sends it (server/changereq.js)
        st.dirty = false; st.pendingDraft = JSON.stringify(st.doc) !== st.base; ls.set(DRAFT(st.pid), st.pendingDraft ? { doc: st.doc, at: Date.now() } : null);
        mark(st.pendingDraft ? 'Draft: suggest it to share' : ''); if (crStrip) crStrip.draw(); return;
      }
      const pid = st.pid;
      st.saving = true; mark('Saving…'); ls.set(UNSENT(pid), { doc, base: st.rev, at: Date.now() });   // pass 4: on this device until the tribe has it
      try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/app-config`, { method: 'PUT', body: { config: doc, base: st.rev } }); if (!st || st.pid !== pid) return; st.rev = r.rev; if (st.doc === doc) { st.dirty = false; ls.set(UNSENT(pid), null); } mark(onDevice() ? 'Saved on this device' : 'Saved'); if (st.doc !== doc) saveT = setTimeout(run, 300); }
      catch (e) {
        if (!st || st.pid !== pid) return;
        if (e && (e.status === 409 || /409|conflict/i.test(e.message || ''))) { try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/app-config`); st.doc = A().normalize(r.config); st.rev = r.rev; ls.set(UNSENT(pid), null); paint(); toast('Someone else changed the app. You are seeing their version now.'); } catch {} }
        else if (e && e.status && e.status < 500) { ls.set(UNSENT(pid), null); mark('Not saved: ' + (e.message || '')); }
        else { mark('Saved on this device. It goes to the tribe when it’s back'); clearTimeout(saveT); saveT = setTimeout(run, 5000); }   // tried again by itself
      } finally { if (st) st.saving = false; }
    };
    if (now) return run(); saveT = setTimeout(run, cw && cw.people && cw.people().length ? 250 : 500);   // pass 4 polish: with a friend in here, their copy follows sooner (as in the website designer)
  }
  // pass 3: a word typed just before the tab closes or hides is saved too (keepalive, like the website designer)
  function flushNow() {
    if (!st || !st.dirty || st.saving) return; clearTimeout(saveT);
    if (st.local) { ls.set(LOCAL, st.doc); st.dirty = false; return; }
    if (!st.canEdit || !st.pid) return;
    const pid = st.pid; ls.set(UNSENT(pid), { doc: st.doc, base: st.rev, at: Date.now() });
    C.api(`/projects/${encodeURIComponent(pid)}/app-config`, { method: 'PUT', body: { config: st.doc, base: st.rev }, keepalive: true }).then(r => { ls.set(UNSENT(pid), null); if (st) { st.rev = r.rev; st.dirty = false; mark('Saved'); } }).catch(() => {});
  }
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
  addEventListener('pagehide', flushNow);
  const mark = t => { const el = root && root.querySelector('#apc-saved'); if (el) el.textContent = tr(t); };
  const DRAFT = pid => `tribecode.appcreator.draft.${pid}`;
  const UNSENT = pid => `tribecode.appcreator.unsent.${pid}`;   // pass 4: an edit the tribe has not confirmed yet

  // ---------- edits ----------
  function commit(doc, say, keepSel) {
    if (lockedChange(doc)) { paint(); return false; }   // someone else is typing in this part: "Ana is editing this; ask or wait"
    st.undo.push(JSON.stringify(st.doc)); if (st.undo.length > 80) st.undo.shift(); st.redo = [];
    st.doc = A().normalize(doc);
    if (!A().findScreen(st.doc, st.screen)) st.screen = st.doc.start;
    if (!keepSel && st.sel && !A().findBlock(st.doc, st.sel.block)) st.sel = null;
    save(); paint(); if (say) note(say);
  }
  function apply(op) { const r = A().apply(st.doc, op); if (r.say === '' && op.op !== 'text') return r; commit(r.doc, r.say, op.op === 'text'); if (r.added && r.added[0]) { st.screen = r.added[0]; paint(); } if (r.block) { st.sel = { block: r.block, path: '', kind: 'block' }; paint(); } return r; }
  function undo() { st.sels = []; if (!st.undo.length) return note('Nothing to undo.'); st.redo.push(JSON.stringify(st.doc)); st.doc = A().normalize(JSON.parse(st.undo.pop())); if (!A().findScreen(st.doc, st.screen)) st.screen = st.doc.start; st.sel = null; save(); paint(); note('Undone.'); }
  function redo() { st.sels = []; if (!st.redo.length) return note('Nothing to redo.'); st.undo.push(JSON.stringify(st.doc)); st.doc = A().normalize(JSON.parse(st.redo.pop())); st.sel = null; save(); paint(); note('Redone.'); }
  const note = t => { const el = root && root.querySelector('#apc-note'); if (el) { el.textContent = t; el.hidden = !t; clearTimeout(note.t); note.t = setTimeout(() => { el.hidden = true; }, 3200); } };

  // pass 3: a full-screen editor keeps Tab inside it; the app behind is inert while it is open (it was reachable by Tab)
  let inerted = [];
  function inertOthers(on) {
    if (on) { if (inerted.length) return; inerted = [...document.body.children].filter(e => e !== root && !e.inert && e.tagName !== 'SCRIPT'); inerted.forEach(e => { e.inert = true; }); }
    else { inerted.forEach(e => { e.inert = false; }); inerted = []; }
  }
  // ---------- layout ----------
  function build() {
    if (root) root.remove();
    root = document.createElement('div'); root.id = 'apc'; root.className = 'apc'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'App Creator');
    root.innerHTML = `<header class="apc-top">
        ${CS() ? CS().backHTML('apc-close') : `<button class="apc-tb" id="apc-close" aria-label="Close App Creator">${ic('x')}</button>`}
        <div class="apc-title"><span class="apc-eyebrow">App Creator</span><input id="apc-name" class="apc-name" aria-label="App name" maxlength="48" data-i18n-skip></div>
        ${CS() ? CS().undoHTML({ undo: 'apc-undo', redo: 'apc-redo', history: 'apc-histc' }, { history: true }) : `<button class="apc-tb" id="apc-undo" aria-label="Undo" title="Undo">${ic('undo')}</button><button class="apc-tb" id="apc-redo" aria-label="Redo" title="Redo">${ic('redo')}</button>`}
        <span class="apc-saved faint" id="apc-saved"></span>
        <span class="cw-row" id="apc-cw" hidden></span>
        <span class="apc-sp"></span>
        <div class="apc-seg" role="group" aria-label="Phone look"><button data-plat="ios">iPhone</button><button data-plat="android">Android</button></div>
        <span class="apc-sp"></span>
        <button class="btn" id="apc-play">${ic('play')}<span>Play</span></button>
        <div class="apc-menuw"><button class="btn primary" id="apc-export" aria-haspopup="true">Export</button>
          <div class="apc-menu" id="apc-menu" hidden>
            <button data-x="pwa-save"><b>Try it in the live preview</b><small>Your app is already saved as files in app-web/. This opens it in the preview, on any phone.</small></button>
            <button data-x="where"><b>Where it lives</b><small>Your app is already files in the project folder. Open it, share it or put it online.</small></button>
            <button data-x="pwa-zip"><b>Download the phone web app</b><small>Plain HTML and JavaScript, works offline, Add to Home Screen.</small></button>
            <button data-x="expo-save"><b>Expo project</b><small>React Native in app-expo/, for the App Store and Google Play.</small></button>
            <button data-x="brief"><b>Have my AI build it for real</b><small>Sends the screens, flows and data to your AI helpers. Nothing joins the main copy until a person says yes.</small></button>
          </div></div>
      </header>
      <div class="cr-strip" id="apc-cr" hidden></div>
      <div class="apc-body">
        <aside class="apc-left" id="apc-left"><nav class="apc-tabs" role="tablist"><button data-tab="screens" role="tab">Screens</button><button data-tab="add" role="tab">Add</button><button data-tab="look" role="tab">Look</button></nav><div class="apc-pane" id="apc-pane"></div></aside>
        <main class="apc-mid" id="apc-mid"><div class="apc-phone" id="apc-phone"><div class="apc-screenwrap" id="apc-stage"></div></div><div class="apc-bar" id="apc-bar" hidden></div><p class="apc-note" id="apc-note" role="status" hidden></p></main>
        <aside class="apc-right" id="apc-right"><div id="apc-insp"></div></aside>
      </div>
      <nav class="apc-rack" id="apc-rack"><button data-sheet="screens">Screens</button><button data-sheet="add">Add</button><button data-sheet="look">Look</button><button data-sheet="edit">Edit</button><button data-sheet="flint">Flint</button></nav>`;
    document.body.appendChild(root); document.body.classList.add('apc-open'); root.classList.add('has-cr'); root.setAttribute('aria-modal', 'true'); inertOthers(true);
    const $ = s => root.querySelector(s);
    $('#apc-close').onclick = () => close();
    $('#apc-name').oninput = e => { st.doc.name = e.target.value.slice(0, 48); save(); };
    $('#apc-name').onchange = () => commit(st.doc, 'Renamed the app.', true);
    root.querySelectorAll('[data-plat]').forEach(b => b.onclick = () => { if (st.doc.device === 'tablet') { const c = JSON.parse(JSON.stringify(st.doc)); c.device = 'phone'; c.platform = b.dataset.plat; return commit(c, b.dataset.plat === 'android' ? 'Using the Android look.' : 'Using the iPhone look.', true); } apply({ op: 'platform', platform: b.dataset.plat }); });
    $('#apc-undo').onclick = undo; $('#apc-redo').onclick = redo;
    $('#apc-play').onclick = () => { st.mode = st.mode === 'play' ? 'edit' : 'play'; st.sel = null; st.sels = []; if (st.map && P()) P().toggleMap(false); paint(); };
    $('#apc-export').onclick = e => { e.stopPropagation(); const m = $('#apc-menu'); m.hidden = !m.hidden; };
    root.addEventListener('click', e => { if (!root) return; if (!e.target.closest('.apc-menuw')) $('#apc-menu').hidden = true; });   // Back closes the tool before this runs
    root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { $('#apc-menu').hidden = true; doExport(b.dataset.x); });
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; paintLeft(); });
    root.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => openSheet(b.dataset.sheet));
    if (P()) P().onBuild();
    // pass 9: Flint has his own column on the far right (the shared creator shell), opened again by the flame in the top bar
    const hc = $('#apc-histc'); if (hc) hc.onclick = () => { if (P() && P().historySheet) P().historySheet(); };
    if (CS()) {
      shell = CS().flint(root, { top: $('.apc-top'), before: $('#apc-play'), body: $('.apc-body'), right: $('#apc-right'),
        mount: (host, tools) => FC() && FC().appPanel ? FC().appPanel(host, fcApi, { column: true, tools }) : null,
        phone: open => { if (open) openSheet('flint'); else if (st && st.sheet === 'flint') closeSheet(); } });
      backDone = CS().history(root, () => close(true));
    }
    document.addEventListener('keydown', onKey, true);
    paint();
    setTimeout(() => { const n = root && root.querySelector('#apc-name'); if (n && !st.mobile) n.blur(); }, 0);
  }
  function onKey(e) {
    if (!root || !st) return;
    if (document.querySelector('.ui-scrim')) return;   // pass 4: a sheet on top (Where it lives, Put it on your phone) takes its own keys; Esc used to close App Creator under it
    const typing = /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
    if (P() && P().onKey(e)) { e.stopPropagation(); return; }   // pass 4: copy, paste, duplicate, arrows, the map, comments, "?"
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
    const ub = $('#apc-undo'), rb = $('#apc-redo'); if (ub) ub.disabled = !st.undo.length; if (rb) rb.disabled = !st.redo.length;
    if (P()) P().paintTop();
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
    }).join('') + `<p class="faint apc-hint">More screens and flows are under Screens › Add ready-made screens, and on the add-on shelf.</p>` + featuresHTML();
    wireFeatures(pane);
    pane.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const sc = A().findScreen(st.doc, st.screen); let at;
      if (st.sel) { const i = sc.blocks.findIndex(x => x.id === st.sel.block); if (i >= 0) at = i + 1; }
      apply({ op: 'block.add', screen: st.screen, type: b.dataset.add, at }); if (st.sheet) closeSheet();
    });
  }
  // What the app does (appfeatures.js): working behaviours Flint adds with no AI. They run in the exported phone web app.
  function featuresHTML() {
    const FX = window.TribeAppFeatures; if (!FX) return '';
    const on = new Set(st.doc.features || []), groups = {};
    for (const f of FX.list()) (groups[f.groupName] = groups[f.groupName] || []).push(f);
    return `<p class="apc-eyebrow" id="apc-feat-h">${esc(tr('What it does'))} · ${on.size}</p><p class="faint apc-hint">${esc(tr('Working features for the exported phone app. Everything stays on the phone.'))}</p>`
      + Object.entries(groups).map(([g, items]) => `<details class="apc-featg"${items.some(f => on.has(f.id)) ? ' open' : ''}><summary>${esc(tr(g))}</summary><div class="apc-feats">${items.map(f => `<button class="apc-feat${on.has(f.id) ? ' on' : ''}" data-feat="${esc(f.id)}" aria-pressed="${on.has(f.id)}"><b>${esc(tr(f.title))}</b><span>${esc(tr(f.what))}</span></button>`).join('')}</div></details>`).join('');
  }
  function wireFeatures(pane) {
    pane.querySelectorAll('[data-feat]').forEach(b => b.onclick = () => { const id = b.dataset.feat, had = (st.doc.features || []).includes(id); const r = apply({ op: had ? 'feature.remove' : 'feature.add', feature: id }); if (r && r.say) note(r.say); });
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

  // ---------- working together (feat/cowork-editors) ----------
  // A part of a screen is "<screen>|<block>"; pointers and outlines are anchored to it, so they land on the same part at
  // any window size and phone scale.
  function partLabel(p) {
    const [scr, blk] = String(p || '').split('|'), d = st && st.doc; if (!d) return '';
    const sc = A().findScreen(d, scr), f = blk && A().findBlock(d, blk);
    const kind = f && f.block ? String(f.block.type || 'part').replace(/[-_]/g, ' ') : '';
    return kind ? `${sc ? sc.name : scr} · ${kind}` : (sc ? sc.name : '');
  }
  function lockedChange(next) {
    if (!cw || !st.sel || typing) return false;
    const p = `${st.screen}|${st.sel.block}`; if (!cw.lockedBy(p)) return false;
    const a = A().findBlock(st.doc, st.sel.block), b = A().findBlock(A().normalize(next), st.sel.block);
    if (JSON.stringify(a && a.block) === JSON.stringify(b && b.block)) return false;
    cw.guard(p); return true;
  }
  async function snapOf(docLike) {
    try {
      const Co = A(), d = Co.normalize(typeof docLike === 'string' ? JSON.parse(docLike) : docLike), s = Co.findScreen(d, st.screen) || d.screens[0]; if (!s) return null;
      const cssText = Co.css(d, { scope: '.ax' }).replace(/@font-face\{[^}]*\}/g, '');
      const html = `<div class="ax" ${Co.attrs(d)} style="position:relative;width:390px;height:844px;overflow:hidden">${Co.screenHTML(d, s, { edit: false })}</div>`;
      const box = document.createElement('div'); box.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml'); box.innerHTML = `<style>${cssText}</style>${html}`;
      const w = 234, h = 506, svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="390" height="844" transform="scale(${w / 390},${h / 844})">${new XMLSerializer().serializeToString(box)}</foreignObject></svg>`;
      const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/jpeg', 0.82);
    } catch { return null; }
  }
  function summaryOf(baseJson, doc) {
    const out = []; let b = null; try { b = baseJson ? A().normalize(JSON.parse(baseJson)) : null; } catch {}
    if (!b) return [tr('A new app design')];
    const ids = new Set(b.screens.map(x => x.id));
    doc.screens.filter(x => !ids.has(x.id)).forEach(x => out.push(`${tr('Added the screen')} ${x.name}`));
    b.screens.filter(x => !doc.screens.some(y => y.id === x.id)).forEach(x => out.push(`${tr('Removed the screen')} ${x.name}`));
    doc.screens.forEach(x => { const o = b.screens.find(y => y.id === x.id); if (o && JSON.stringify(o) !== JSON.stringify(x)) out.push(`${tr('Changed the screen')} ${x.name}`); });
    if (JSON.stringify(b.theme) !== JSON.stringify(doc.theme)) out.push(tr('Changed the look'));
    if (b.name !== doc.name) out.push(`${tr('Renamed the app to')} ${doc.name}`);
    return out.slice(0, 8);
  }
  function coworkOn() {
    if (cw) { cw.detach(); cw = null; }
    if (!root || !st || !st.pid || !connected()) return;
    if (window.TribeChanges) crStrip = window.TribeChanges.strip(root.querySelector('#apc-cr'), 'app', { pid: st.pid, draft: () => st.doc, dirty: () => !!st.pendingDraft,
      before: () => snapOf(st.base || st.doc), after: () => snapOf(st.doc), summary: () => summaryOf(st.base, st.doc),
      onSent: r => { if (r && (r.request || r.applied)) { st.pendingDraft = false; ls.set(DRAFT(st.pid), null); mark(r.applied ? 'Saved' : 'Sent for OK'); if (crStrip) crStrip.draw(); } } });
    if (!window.TribeCowork) return;
    cw = window.TribeCowork.attach('app', {
      key: () => (st && st.pid) || '',
      row: root.querySelector('#apc-cw'),
      anchorAt: (x, y) => {
        if (!st || st.mode === 'play') return null;
        const stage = root && root.querySelector('#apc-stage'), el = document.elementFromPoint(x, y); if (!stage || !el || !stage.contains(el)) return null;
        const b = el.closest('[data-b]'), base = b || stage.querySelector('.ax') || stage, r = base.getBoundingClientRect(); if (!r.width || !r.height) return null;
        return { p: `${st.screen}|${b ? b.dataset.b : ''}`, x: (x - r.left) / r.width, y: (y - r.top) / r.height };
      },
      rect: p => {
        const [scr, blk] = String(p || '').split('|'); if (!st || !root || scr !== st.screen || st.mode === 'play') return null;
        const stage = root.querySelector('#apc-stage'); if (!stage) return null;
        const el = blk ? stage.querySelector(`[data-b="${CSS.escape(blk)}"]`) : stage.querySelector('.ax'); return el ? el.getBoundingClientRect() : null;
      },
      label: partLabel,
      blockOf: p => String(p || ''),
    });
  }

  // ---------- the phone ----------
  // the phone scales to fit the middle (clicks still land: no iframe)
  function fit() {
    if (!root) return; const mid = root.querySelector('#apc-mid'), ph = root.querySelector('#apc-phone'); if (!mid || !ph) return;
    st.mobile = matchMedia('(max-width: 820px)').matches;
    const sz = P() ? P().SIZE() : { w: 390, h: 844 }, pad = st.mobile ? 0 : 24;
    const pw = sz.w + pad, phh = sz.h + pad, k = Math.min(1, (mid.clientWidth - 16) / pw, (mid.clientHeight - 16) / phh);
    ph.style.transform = k < 1 ? `scale(${k.toFixed(4)})` : '';
  }
  window.addEventListener('resize', () => { fit(); if (root && st && st.sel) paintSel(); });
  function paintStage() {
    const stage = root.querySelector('#apc-stage'), d = P() ? P().viewDoc() : st.doc, Co = A(), phone = root.querySelector('#apc-phone');
    phone.className = `apc-phone apc-${d.platform}${d.device === 'tablet' ? ' apc-tablet' : ''}`; fit();
    if (st.mode !== 'play' && P()) P().stopPlay();
    if (st.mode === 'play') {
      const bar = root.querySelector('#apc-bar'); if (bar) bar.hidden = true;
      // pass 4: an app with working features plays as the real exported app (appfeatures.js runs inside the frame)
      if (P() && P().playFrame(stage)) { P().afterStage(); return; }
      stage.innerHTML = `<div class="ax apc-ax" ${Co.attrs(d)} data-i18n-skip style="${Co.vars(d.theme)}">${d.screens.map(s => Co.screenHTML(d, s, { edit: false })).join('')}</div>`;
      Co.AxRun(stage.firstChild, { start: st.screen, onGo: id => { st.screen = id; } });
      if (P()) P().afterStage();
      return;
    }
    const s = Co.findScreen(d, st.screen) || d.screens[0];
    stage.innerHTML = `<div class="ax apc-ax apc-edit" ${Co.attrs(d)} data-i18n-skip style="${Co.vars(d.theme)}">${Co.screenHTML(d, s, { edit: true })}</div>`;
    const bar0 = root.querySelector('#apc-bar'); if (bar0) bar0.hidden = true;
    const ax = stage.firstChild;
    ax.querySelectorAll('[data-e]').forEach(el => { if (st.canDraft) el.setAttribute('contenteditable', 'plaintext-only'); el.spellcheck = false; });
    ax.querySelectorAll('input').forEach(i => { i.readOnly = true; i.tabIndex = -1; });
    ax.addEventListener('click', onStageClick, true);
    ax.addEventListener('input', onStageInput);
    ax.addEventListener('focusout', onStageBlur);
    ax.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('[data-e]') && !e.target.closest('.ax-text')) { e.preventDefault(); e.target.blur(); } });
    if (st.sel) { const el = selEl(); if (el) { el.classList.add('apc-sel'); placeBar(el); } else st.sel = null; }
    if (P()) P().afterStage();
  }
  function selEl() {
    const ax = root.querySelector('.apc-edit'); if (!ax || !st.sel) return null;
    const bEl = ax.querySelector(`[data-b="${CSS.escape(st.sel.block)}"]`); if (!bEl) return null;
    if (st.sel.kind === 'item') return bEl.querySelector(`[data-item="${CSS.escape(st.sel.path)}"]`) || bEl;
    return bEl;
  }
  function onStageClick(e) {
    if (st.cmode && P()) { e.preventDefault(); e.stopPropagation(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); P().stageComment(e); return; }   // pass 4: a comment on this part
    const t = e.target, bEl = t.closest('[data-b]'); if (!bEl) { st.sel = null; st.sels = []; paintSel(); return; }
    if (e.shiftKey && P() && st.sel) { e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); P().shiftClick(bEl.dataset.b); return; }   // pass 4: several parts
    st.sels = [];
    const isText = t.closest('[data-e]');
    if (!isText) e.preventDefault();
    const block = bEl.dataset.b, item = t.closest('[data-item]'), icEl = t.closest('[data-ic]'), img = t.closest('[data-img]');
    const lk = t.closest('[data-lk]');
    st.sel = { block, kind: item ? 'item' : 'block', path: item ? item.dataset.item : '', ic: icEl ? icEl.dataset.ic : '', img: img ? img.dataset.img : '', lk: lk ? lk.dataset.lk : '' };
    paintSel();
  }
  function paintSel() { if (cw) cw.select(st.sel ? `${st.screen}|${st.sel.block}` : null); root.querySelectorAll('.apc-sel').forEach(x => x.classList.remove('apc-sel')); const el = selEl(), bar = root.querySelector('#apc-bar'); if (el) { el.classList.add('apc-sel'); placeBar(el); } else if (bar) bar.hidden = true; if (P()) P().paintMulti(); paintInsp(); }
  function placeBar(el) {
    // the toolbar lives outside the scaled phone, so its buttons keep their full size
    const bar = root.querySelector('#apc-bar'), mid = root.querySelector('#apc-mid'); if (!bar || !st.canDraft) return;
    const item = st.sel.kind === 'item', multi = P() && (st.sels || []).length;
    bar.innerHTML = multi ? P().multiBar() : item
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
    if (/^m:/.test(a)) return P().multiAct(a.slice(2));
    if ((st.sels || []).length && P() && /^(dup|del)$/.test(a)) return P().multiAct(a);
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
    if (!typing && cw && !cw.guard(`${st.screen}|${f.block.id}`)) { el.blur(); paint(); return; }   // someone else is typing here
    if (!typing) { typing = { block: f.block.id, before: JSON.stringify(st.doc) }; if (cw) cw.editing(`${st.screen}|${f.block.id}`); }
    const setPath = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; };
    setPath(f.block.props, el.dataset.e, el.textContent.slice(0, 600)); save();
  }
  function onStageBlur(e) {
    if (!typing || !e.target.closest('[data-e]')) return;
    st.undo.push(typing.before); st.redo = []; typing = null; if (cw) cw.editing(null);
    const strip = root.querySelector('#apc-strip'); if (strip && st.tab === 'screens') paintScreens(root.querySelector('#apc-pane'));
  }

  // ---------- right: the selection ----------
  function paintInsp(into) {
    const box = into || root.querySelector('#apc-insp'); if (!box) return;
    const d = st.doc, Co = A();
    if (st.mode === 'play') { box.innerHTML = `<p class="apc-eyebrow">Playing</p><p class="faint apc-hint">Tap through the app like it is on a phone. Links move between screens with the ${esc(d.theme.motion)} motion. Esc or Stop to go back to editing.</p>${P() && P().playingReal() ? `<p class="faint apc-hint">${esc(tr('This is the real app: its working features run here, and what they save stays on this device.'))}</p>` : ''}`; return; }
    if (!st.sel && P()) return P().inspEmpty(box);   // pass 4: this screen, quick actions, comments, tips
    if (st.sel && (st.sels || []).length && P()) return P().multiInsp(box);
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
      ${imPath ? `<div class="apc-field"><span>Picture</span>${P() ? P().picField(bk, imPath) : ''}<div class="apc-ills">${Co.ILL_NAMES.map(n => `<button data-ill="${n}" aria-label="${n}" class="ax ${Co.getPath(bk.props, imPath) === n ? 'on' : ''}" ${Co.attrs(d)} style="${Co.vars(d.theme)}">${Co.illus(n, d.theme)}</button>`).join('')}</div></div>` : ''}
      ${bk.type === 'button' ? `<div class="apc-field"><span>Style</span><div class="apc-seg apc-segw">${[['primary', 'Main'], ['secondary', 'Quiet']].map(([v, l]) => `<button data-prop="style" data-v="${v}" class="${bk.props.style === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
      ${bk.type === 'chart' ? `<div class="apc-field"><span>Chart</span><div class="apc-seg apc-segw">${[['bar', 'Bars'], ['line', 'Line']].map(([v, l]) => `<button data-prop="kind" data-v="${v}" class="${bk.props.kind === v ? 'on' : ''}">${l}</button>`).join('')}</div><label for="apc-vals">Values</label><input class="input" id="apc-vals" value="${esc((bk.props.values || []).join(', '))}"></div>` : ''}
      ${bk.type === 'nav' ? `<label class="apc-chk"><input type="checkbox" id="apc-back"${bk.props.back ? ' checked' : ''}> <span>Back button</span></label>` : ''}
      <div class="apc-row"><button class="btn" data-bar2="dup">${ic('duplicate')}<span>Duplicate</span></button><button class="btn" data-bar2="m:copy">${ic('duplicate')}<span>Copy</span></button><button class="btn" data-bar2="del">${ic('delete')}<span>Remove</span></button></div>`;
    if (imPath && P()) P().wirePicField(box, bk, imPath);
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
    else if (kind === 'flint' && FC() && FC().appPanel) FC().appPanel(pane, fcApi);
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
  // pass 4 (flintcreate.js): the Flint panel, the level badge, Undo on every reply, the local model for loose requests, Polish it
  const FC = () => window.TribeFlintCreate;
  const CS = () => window.TribeCreatorShell;
  let shell = null, backDone = null;
  const fcApi = { st: () => st, core: () => A(), apply: op => apply(op), commit: (d, say) => commit(d, say || ''), undo: () => undo(), redo: () => redo(), paint: () => paint(), flint: step => flint(step), note: t => note(t), root: () => root, pid: () => (st && st.pid) || '', close: () => close() };
  async function ask(text) {
    if (FC() && FC().appAsk && st) return FC().appAsk(text, fcApi);
    const N = window.TribeNLU; if (!N) return { text: 'Flint is not loaded.' };
    const sel = st.sel ? A().findBlock(st.doc, st.sel.block) : null;
    const r = N.parse(text, { now: new Date(), view: 'appcreator', selection: !!st.sel, selKind: sel ? sel.block.type : '', screens: st.doc.screens.map(s => s.name) });
    const out = [];
    for (const s of r.steps) { if (!s.intent || s.conf < 0.6) continue; const x = flint(s); if (x) out.push(x); }
    if (!out.length) {   // feat/flint-appknow: say honestly what it needs (server/flintfree.js classify), and what Flint can do here
      let why = ''; if (connected()) { try { const t = await C.api('/flint/tier', { method: 'POST', body: { ask: text } }); if (t && t.tier === 'agent') why = t.why + ' '; } catch {} }
      const t2 = why + tr('Here I can add screens and kits, link buttons, change the look, and add working features like offline storage, search, reminders or a dark mode switch: say “what features can you add?”.');
      note(t2); return { text: t2 };
    }
    const text2 = out.map(x => x.text).filter(Boolean).join(' '); note(text2); return { text: text2 };
  }
  const KIT_OF = { settings: 'settings', setting: 'settings', preferences: 'settings', onboarding: 'onboarding', welcome: 'onboarding', intro: 'onboarding', paywall: 'paywall', premium: 'paywall', subscription: 'paywall', profile: 'profile', account: 'profile', 'sign in': 'signin', signin: 'signin', login: 'signin', 'log in': 'signin', signup: 'signin', 'sign up': 'signin', chat: 'chat', messages: 'chat', shop: 'shop', store: 'shop', stats: 'charts', charts: 'charts', insights: 'charts', 'empty state': 'empty', player: 'player', music: 'player', search: 'search', notifications: 'notifications', alerts: 'notifications', checkout: 'checkout', cart: 'checkout', detail: 'detail', feed: 'feed', booking: 'calendar', calendar: 'calendar', timer: 'timer', map: 'map', help: 'help', faq: 'help', about: 'about', leaderboard: 'leaderboard', achievements: 'achievements', badges: 'achievements', invite: 'invite', permissions: 'permissions' };
  function flint(step) {
    const id = step.intent, sl = step.slots || {}, Co = A();
    if (id === 'app.make') { const t = Co.template(sl.template, { name: sl.name, accent: sl.color && sl.color.hex }); if (!t) return null; if (!st || !st.open) { open({ template: sl.template, name: sl.name, accent: sl.color && sl.color.hex }); return { text: `Opened App Creator with the ${t.name} template.` }; } commit(t, ''); st.screen = t.start; paint(); return { text: `Started a ${(Co.TEMPLATES.find(x => x.id === sl.template) || {}).title || 'new'} app. Click anything to change it.` }; }
    if (!st || !st.open) { open({}); }
    if (id === 'app.needsai') return null;   // flintnlu.js: a server or native job; ask() says so honestly (server/flintfree.js classify)
    if (id === 'app.feature') { const r = apply({ op: sl.off ? 'feature.remove' : 'feature.add', feature: sl.feature }); return { text: r.say || 'That feature is not in the list.' }; }   // appfeatures.js
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
      if (kind === 'where') { if (window.TribeWhere) window.TribeWhere.open(st.pid, 'app'); return { where: true }; }
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
        // feat/flint-appknow: parts that only look right until the app runs on a phone (appfeatures.js suggestions())
        const FX = window.TribeAppFeatures;
        if (FX && FX.suggestions) for (const h of FX.suggestions(doc).slice(0, 2)) out.push({ id: h.id, title: h.title, why: h.why, from: [{ kind: 'design', ref: 'app', who: '' }],
          apply: async () => { const before = JSON.stringify(doc); const r = Co.apply(doc, { op: 'feature.add', feature: h.feature }); await C.api(`/projects/${encodeURIComponent(ctx.projectId)}/app-config`, { method: 'PUT', body: { config: r.doc, force: true } }); if (st && st.open && st.pid === ctx.projectId) { st.doc = r.doc; paint(); } return async () => { await C.api(`/projects/${encodeURIComponent(ctx.projectId)}/app-config`, { method: 'PUT', body: { config: JSON.parse(before), force: true } }); if (st && st.open && st.pid === ctx.projectId) { st.doc = Co.normalize(JSON.parse(before)); paint(); } }; } });
        return out.slice(0, 8);
      } });
  }
  registerSuggest(); window.addEventListener('load', registerSuggest); setTimeout(registerSuggest, 1500);

  // the add-on shelf's app kits: market.js calls installKit when an "app-kit" item is used
  C && C.on && C.on('ws', m => { if (!m || m.type !== 'app-config' || !st || !st.open || m.project !== st.pid || st.dirty || typing) return; C.api(`/projects/${encodeURIComponent(st.pid)}/app-config`).then(r => { if (!st || !r.config || r.rev <= st.rev || st.dirty) return; /* pass 4: an answer older than what is on screen (a save landed meanwhile) never replaces it */ st.base = JSON.stringify(A().normalize(r.config)); st.rev = r.rev; if (st.pendingDraft) { note('A friend changed the app. Your draft stays yours until you send it.'); return; } st.doc = A().normalize(r.config); paint(); note('Updated with a friend’s change.'); }).catch(() => {}); });
  if (location.hash === '#/app-creator') setTimeout(() => open({}), 300);
  window.addEventListener('hashchange', () => { if (location.hash === '#/app-creator' && (!st || !st.open)) open({}); });

  // pass 4: the deeper tools (history, comments, several parts, clipboard, pictures, the map) live in appcreator-plus.js
  if (P()) P().init({ st: () => st, root: () => root, tr, ic, note, mini, connected, commit, apply: op => apply(op), paint, paintSel, fit, save: now => save(now), undo, redo, openSheet, closeSheet, setTab: t => { st.tab = t; paintLeft(); } });
  window.TribeAppCreator = { open, close, state: () => st, doc: () => st && st.doc, ask, apply: op => apply(op), flint, installKit, screens, mini, templates: () => A().templateList(), undo, redo, export: doExport };
})();
