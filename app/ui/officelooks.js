// Your look (feat/office-looks): the character creator for Office Space. A large live preview (standing, walking,
// seated or typing, turning to face each way), the parts in tabs with real pixel swatches, colours per part, and
// Randomize, Undo, Reset and Save. It saves to the person's look (or an AI helper's, for its owner) in server/office.js,
// and the floor, the desks and the card redraw for everyone.
// Rules and art: TribeOfficeLooksCore (officelooks-core.js) and TribeOfficeArt (officespace-art.js).
// feat/p13-office: the first time it opens as "Make your character" with Done; your own look also has a name tag (your
// name in the tribe), and the last look you saved is kept on this device, so a new tribe starts with it (kept()).
// faceUrl(id) is a character's face as a picture, for avatars elsewhere (profiles.js) once the office has been seen.
//   window.TribeOfficeLooks = { open(opts), openMine(), openHelper(desk), lookOf(desk), render(canvas, look, o), kept(), faceUrl(id) }
//     open({ who: 'me' | agentId, name, look, base, first, onSaved(look) }); render draws one frame at a whole-number zoom.
(function () {
  'use strict';
  const K = () => window.TribeOfficeLooksCore, A = () => window.TribeOfficeArt, C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WALK = [0, 1, 2, 1];

  // ---------- whose look is it ----------
  // People: their saved look, or one picked from their id. AI helpers: their owner's choice, or the tool-coloured default.
  function lookOf(d) {
    const L = K(); if (!L || !d) return null;
    if (d.look) return d.look.v === 2 ? L.normalize(d.look) : L.normalize(Object.assign(window.TribeOfficeSets ? window.TribeOfficeSets.seedLook(d.id) : {}, d.look));
    return d.kind === 'agent' ? L.agent(d.id, d.agentKind) : L.seed(d.id);
  }

  // ---------- drawing ----------
  // One frame of a look into a canvas, at the largest whole-number zoom that fits (crisp pixels). dir 0 down, 1 up,
  // 2 right, 3 left; col 0-7 (walk, type, read, seated). crop: 'body' (16x32) or 'head' (16x16 from the top).
  function render(c, look, o) {
    o = o || {};
    const art = A(); if (!c || !art || !look) return false;
    const sh = art.sheet(look, () => render(c, look, o)); const x = c.getContext('2d');
    x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height);
    if (!sh) return false;
    const head = o.crop === 'head', sw = 16, shh = head ? 18 : 32, sy0 = head ? 1 : 0;
    const z = Math.max(1, Math.floor(Math.min(c.width / sw, c.height / shh)));
    const dx = Math.floor((c.width - sw * z) / 2), dy = head ? Math.floor((c.height - shh * z) / 2) : c.height - shh * z;
    const dir = o.dir | 0, col = o.col == null ? 1 : o.col | 0;
    if (dir === 3) { if (!sh.left) { sh.left = document.createElement('canvas'); sh.left.width = 128; sh.left.height = 96; const lx = sh.left.getContext('2d'); lx.translate(128, 0); lx.scale(-1, 1); lx.drawImage(sh.c, 0, 0); } x.drawImage(sh.left, (7 - col) * 16, 64 + sy0, sw, shh, dx, dy, sw * z, shh * z); }
    else x.drawImage(sh.c, col * 16, [0, 32, 64][dir] + sy0, sw, shh, dx, dy, sw * z, shh * z);
    return true;
  }

  // ---------- the creator ----------
  const HEADY = new Set(['hair', 'eyes', 'beard', 'hat', 'eyewear', 'headphones', 'earrings']);
  const COLOR_FOR = { body: 'skin', eyes: 'eyeColor', hair: 'hairColor', beard: 'beardColor', top: 'topColor', full: 'fullColor', pants: 'pantsColor', shoes: 'shoesColor', jacket: 'jacketColor',
    hat: 'hatColor', eyewear: 'frameColor', neck: 'neckColor', headphones: 'headphonesColor', earrings: 'metalColor', necklace: 'metalColor', watch: 'metalColor', lanyard: 'lanyardColor' };
  const POSES = [['stand', 'Stand'], ['walk', 'Walk'], ['sit', 'Sit'], ['type', 'Type']];
  const TURN = [0, 2, 1, 3];   // facing you, right, away, left
  const DIR_NAME = ['Facing you', 'Facing away', 'Facing right', 'Facing left'];
  let cur = null;

  // a plain character to show one part on (the draft's body and skin, grey clothes)
  function plain(draft, field) {
    const L = K(), bald = L.PARTS.hair.findIndex(p => p && p.id === 'bald');
    const base = { v: 2, body: draft.body, skin: draft.skin, eyes: draft.eyes, eyeColor: draft.eyeColor, hair: bald, hairColor: draft.hairColor, beardColor: draft.beardColor,
      top: 0, topColor: 3, pants: 0, pantsColor: 4, shoes: 0, shoesColor: 5 };
    if (field === 'hat' || field === 'headphones' || field === 'earrings') base.hair = draft.hair;
    if (field === 'pants' || field === 'shoes') base.top = 0;
    return base;
  }
  // Which colour rows the current draft needs in a tab
  function colourRows(tab, d) {
    const L = K(), id = (k) => { const p = L.part(k, d[k]); return p ? p.id : null; };
    return tab.colors.filter(([f]) => {
      if (f === 'topColor') return !d.full;
      if (f === 'fullColor') return !!d.full;
      if (f === 'jacketColor') return !!d.jacket;
      if (f === 'hatColor') return !!d.hat;
      if (f === 'frameColor') return !!d.eyewear;
      if (f === 'neckColor') return !!d.neck || id('full') === 'suit_and_tie';
      if (f === 'headphonesColor') return !!d.headphones;
      if (f === 'metalColor') return !!(d.earrings || d.necklace || d.watch);
      if (f === 'lanyardColor') return !!d.lanyard;
      if (f === 'beardColor') return !!d.beard;
      if (f === 'hairColor') return !!(L.part('hair', d.hair) || {}).file || !!d.beard;
      return true;
    });
  }

  function open(opts) {
    opts = opts || {};
    const L = K(), UI = window.TribeUI; if (!L || !A() || !UI || !UI.sheet) { toast(tr('The office art is still loading. Try again in a moment.')); return null; }
    if (cur) cur.close();
    const helper = opts.who && opts.who !== 'me';
    const start = L.normalize(opts.look || L.seed(opts.id || 'me'));
    const base = L.normalize(opts.base || start);
    const st = { draft: L.normalize(start), undo: [], tab: 'body', pose: 'walk', turn: 0, t0: performance.now(), raf: 0, saving: false };
    const first = !helper && !!opts.first;
    const meName = (() => { try { return ((C().state() || {}).me || {}).name || ''; } catch { return ''; } })();
    const title = helper ? tr('Change its look') : first ? tr('Make your character') : tr('Your look');
    const body = `<div class="olk" data-olk>
      <section class="olk-stage" aria-label="${esc(tr('Preview'))}">
        <div class="olk-floor">${helper ? '' : `<span class="olk-tag" aria-hidden="true">${esc(meName)}</span>`}<canvas class="olk-prev" width="128" height="256" role="img" aria-label=""></canvas></div>
        ${helper ? '' : `<label class="olk-name"><span>${esc(tr('Name tag'))}</span><input class="input sm" id="olk-name" maxlength="32" autocomplete="nickname" value="${esc(meName)}"></label>`}
        <div class="olk-turn"><button type="button" class="btn sm icon" data-olk-turn="-1" aria-label="${esc(tr('Turn left'))}">‹</button><span class="olk-dir" aria-live="polite"></span><button type="button" class="btn sm icon" data-olk-turn="1" aria-label="${esc(tr('Turn right'))}">›</button></div>
        <div class="olk-poses" role="radiogroup" aria-label="${esc(tr('Pose'))}">${POSES.map(([k, l]) => `<button type="button" class="olk-pose" role="radio" data-olk-pose="${k}">${esc(tr(l))}</button>`).join('')}</div>
        <div class="olk-dirs" aria-hidden="true">${[0, 2, 1, 3].map(dr => `<canvas width="48" height="96" data-olk-d="${dr}"></canvas>`).join('')}</div>
        <p class="olk-desc faint" aria-live="polite"></p>
      </section>
      <section class="olk-edit">
        <div class="olk-tabs" role="tablist" aria-label="${esc(tr('Parts'))}">${L.TABS.map(t => `<button type="button" role="tab" class="olk-tab" id="olk-t-${t.id}" data-olk-tab="${t.id}" aria-controls="olk-panel">${esc(tr(t.label))}</button>`).join('')}</div>
        <div class="olk-panel" id="olk-panel" role="tabpanel"></div>
      </section>
    </div>`;
    const foot = `<div class="olk-foot"><button type="button" class="btn sm" data-olk="random">${esc(tr('Randomize'))}</button><button type="button" class="btn sm" data-olk="undo">${esc(tr('Undo'))}</button><button type="button" class="btn sm" data-olk="reset">${esc(tr('Reset'))}</button><span class="olk-gap"></span><button type="button" class="btn sm" data-olk="cancel">${esc(tr(first ? 'Not now' : 'Cancel'))}</button><button type="button" class="btn primary sm" data-olk="save">${esc(tr(helper ? 'Save its look' : first ? 'Done' : 'Save my look'))}</button></div>`;
    const sh = UI.sheet({ id: 'olk-sheet', eyebrow: helper ? (opts.name || tr('AI helper')) : first ? tr('Welcome to the office') : tr('Office'), title, body, foot, wide: true, onClose: () => { cancelAnimationFrame(st.raf); if (cur && cur.sh === sh) cur = null; } });
    const root = sh.el.querySelector('[data-olk]'), panel = root.querySelector('.olk-panel'), prev = root.querySelector('.olk-prev');
    sh.el.classList.add('olk-card');

    // ---------- painting ----------
    function paintTabs() {
      root.querySelectorAll('[data-olk-tab]').forEach(b => { const on = b.dataset.olkTab === st.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      panel.setAttribute('aria-labelledby', 'olk-t-' + st.tab);
    }
    function swatch(field, i, p, selected) {
      const name = p ? tr(p.label) : tr('None');
      return `<button type="button" class="olk-sw${HEADY.has(field) ? ' head' : ''}" role="radio" aria-checked="${selected}" tabindex="${selected ? 0 : -1}" data-olk-f="${field}" data-olk-i="${i}" title="${esc(name)}">
        ${p ? `<canvas width="${HEADY.has(field) ? 48 : 32}" height="${HEADY.has(field) ? 54 : 64}" aria-hidden="true"></canvas>` : '<span class="olk-none" aria-hidden="true"></span>'}<span class="olk-sw-t">${esc(name)}</span></button>`;
    }
    function chips(field, label) {
      const d = st.draft, pal = L.COLOR[field], list = pal === 'hair+' ? [{ name: 'Same as hair', hex: null }, ...L.PAL.hair] : L.PAL[pal];
      return `<div class="olk-group"><p class="olk-sub" id="olk-c-${field}">${esc(tr(label))}</p><div class="olk-chips" role="radiogroup" aria-labelledby="olk-c-${field}">${list.map((c, i) => {
        const on = (d[field] | 0) === i;
        return `<button type="button" class="olk-chip${c.hex ? '' : ' same'}" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-olk-f="${field}" data-olk-i="${i}" aria-label="${esc(tr(c.name))}" title="${esc(tr(c.name))}"${c.hex ? ` style="--olk-c:${c.hex}"` : ''}></button>`;
      }).join('')}</div></div>`;
    }
    function paintPanel() {
      const d = st.draft, tab = L.TABS.find(t => t.id === st.tab);
      let html = '';
      for (const [field, label] of tab.parts) {
        const list = L.PARTS[field];
        // eyes: 0 means "the body's own"; show the styles, with the body's own one marked when 0
        const sel = field === 'eyes' && !d.eyes ? list.findIndex(e => e && e.id === L.part('body', d.body).eyes) : d[field] | 0;
        const order = list.map((p, i) => [p, i]).filter(([p, i]) => !(field === 'eyes' && i === 0));
        if (field === 'hair') { const b = order.findIndex(([p]) => p && p.id === 'bald'); if (b > 0) order.unshift(order.splice(b, 1)[0]); }
        html += `<div class="olk-group">${label ? `<p class="olk-sub" id="olk-g-${field}">${esc(tr(label))}</p>` : ''}<div class="olk-sws" role="radiogroup" aria-label="${esc(tr(label || tab.label))}">${order.map(([p, i]) => swatch(field, i, p, i === sel)).join('')}</div></div>`;
      }
      if (st.tab === 'pants' && d.full) html = `<p class="olk-note">${esc(tr('Your whole outfit covers this. Pick bottoms to wear a top and bottoms instead.'))}</p>` + html;
      if (st.tab === 'top' && d.full) html += `<p class="olk-note faint">${esc(tr('A whole outfit replaces the top and the bottoms.'))}</p>`;
      html += colourRows(tab, d).map(([f, l]) => chips(f, l)).join('');
      panel.innerHTML = html;
      thumbs();
    }
    function thumbs() {
      const d = st.draft;
      panel.querySelectorAll('.olk-sw canvas').forEach(c => {
        const b = c.closest('[data-olk-f]'), f = b.dataset.olkF, i = +b.dataset.olkI, look = plain(d, f);
        look[f] = i;
        if (f === 'full') look.full = i;
        const cf = COLOR_FOR[f]; if (cf && cf in d) look[cf] = d[cf];
        if (f === 'eyes' || f === 'hat' || f === 'eyewear') look.eyeColor = d.eyeColor;
        if (f === 'neck' && !d.neck) look.neckColor = d.neckColor;
        render(c, L.normalize(look), { crop: HEADY.has(f) ? 'head' : 'body', dir: 0, col: 1 });
      });
    }
    function describe() {
      root.querySelector('.olk-desc').textContent = L.describe(st.draft);
      prev.setAttribute('aria-label', (helper ? (opts.name || tr('AI helper')) : tr('You')) + ': ' + L.describe(st.draft));
    }
    function paintPose() {
      root.querySelectorAll('[data-olk-pose]').forEach(b => { const on = b.dataset.olkPose === st.pose; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      root.querySelector('.olk-dir').textContent = tr(DIR_NAME[TURN[st.turn]]);
    }
    function frameNow() {
      const t = (performance.now() - st.t0) / 1000, still = reduce();
      const col = st.pose === 'walk' ? (still ? 1 : WALK[Math.floor(t / 0.15) % 4]) : st.pose === 'sit' ? 7 : st.pose === 'type' ? (still ? 3 : 3 + Math.floor(t / 0.3) % 2) : 1;
      render(prev, st.draft, { dir: TURN[st.turn], col });
    }
    function loop() { frameNow(); if (!reduce() && (st.pose === 'walk' || st.pose === 'type')) st.raf = requestAnimationFrame(loop); }
    // the big preview's canvas matches its size on screen, so the zoom is a whole number of device pixels
    function fitPrev() { const r = window.devicePixelRatio || 1, w = Math.round(prev.clientWidth * r), h = Math.round(prev.clientHeight * r); if (w && h && (prev.width !== w || prev.height !== h)) { prev.width = w; prev.height = h; } }
    function preview() {
      cancelAnimationFrame(st.raf); fitPrev(); loop();
      root.querySelectorAll('[data-olk-d]').forEach(c => render(c, st.draft, { dir: +c.dataset.olkD, col: 1 }));
      describe();
      const u = sh.foot.querySelector('[data-olk="undo"]'); if (u) u.disabled = !st.undo.length;
      const rs = sh.foot.querySelector('[data-olk="reset"]'); if (rs) rs.disabled = JSON.stringify(L.compact(st.draft)) === JSON.stringify(L.compact(base));
    }
    function all() { paintTabs(); paintPanel(); paintPose(); preview(); }

    // ---------- changes ----------
    function set(field, i) {
      const before = st.draft, next = Object.assign({}, before, { [field]: i });
      if (field === 'top' || field === 'pants') next.full = 0;
      if (field === 'full' && i && !before.full) next.fullColor = before.topColor;
      const n = L.normalize(next, field);
      const lost = L.conflicts.filter(r => r.when(next)).map(r => r.why);
      if (JSON.stringify(n) === JSON.stringify(before)) return;
      st.undo.push(before); if (st.undo.length > 60) st.undo.shift();
      st.draft = n;
      if (lost.length) toast(tr(lost[0]));
      const focusKey = field + ':' + i;
      paintPanel(); preview();
      const b = panel.querySelector(`[data-olk-f="${field}"][data-olk-i="${i}"]`) || panel.querySelector(`[data-olk-f="${focusKey.split(':')[0]}"]`); if (b && root.contains(document.activeElement)) b.focus({ preventScroll: true });
    }
    function replace(next) { st.undo.push(st.draft); st.draft = L.normalize(next); paintPanel(); preview(); }

    const nameIn = root.querySelector('#olk-name'), tagEl = root.querySelector('.olk-tag');
    if (nameIn && tagEl) nameIn.addEventListener('input', () => { tagEl.textContent = nameIn.value.trim() || meName; });
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-olk-tab],[data-olk-f],[data-olk-pose],[data-olk-turn]'); if (!t) return;
      if (t.dataset.olkTab) { st.tab = t.dataset.olkTab; paintTabs(); paintPanel(); return; }
      if (t.dataset.olkPose) { st.pose = t.dataset.olkPose; st.t0 = performance.now(); paintPose(); preview(); return; }
      if (t.dataset.olkTurn) { st.turn = (st.turn + +t.dataset.olkTurn + 4) % 4; paintPose(); preview(); return; }
      if (t.dataset.olkF) set(t.dataset.olkF, +t.dataset.olkI);
    });
    // Arrow keys: tabs move along the tab list; inside a radio group they move the choice (and choose it).
    root.addEventListener('keydown', e => {
      const keys = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1, Home: -999, End: 999 };
      if (!(e.key in keys)) return;
      const t = e.target, group = t.closest('[role="tablist"],[role="radiogroup"]'); if (!group) return;
      const items = [...group.querySelectorAll('[role="tab"],[role="radio"]')]; const at = items.indexOf(t); if (at < 0) return;
      e.preventDefault();
      const k = keys[e.key], to = items[Math.max(0, Math.min(items.length - 1, Math.abs(k) > 1 ? (k < 0 ? 0 : items.length - 1) : (at + k + items.length) % items.length))];
      if (group.getAttribute('role') === 'tablist') { st.tab = to.dataset.olkTab; paintTabs(); paintPanel(); to.focus(); return; }
      to.click(); const again = root.querySelector(`[data-olk-f="${to.dataset.olkF}"][data-olk-i="${to.dataset.olkI}"]`) || root.querySelector(`[data-olk-pose="${to.dataset.olkPose}"]`); if (again) again.focus();
    });
    sh.foot.addEventListener('click', async e => {
      const t = e.target.closest('[data-olk]'); if (!t) return;
      const k = t.dataset.olk;
      if (k === 'random') return replace(L.random());
      if (k === 'undo') { if (!st.undo.length) return; st.draft = st.undo.pop(); paintPanel(); preview(); return; }
      if (k === 'reset') return replace(base);
      if (k === 'cancel') return sh.close();
      if (k === 'save') {
        if (st.saving) return; st.saving = true; t.disabled = true;
        try {
          const r = await C().api('/office/look', { method: 'PUT', body: helper ? { look: L.compact(st.draft), for: opts.who } : { look: L.compact(st.draft) } });
          if (!helper) {
            keep(r.look || L.compact(st.draft));
            const n = root.querySelector('#olk-name'), nm = n ? n.value.trim().slice(0, 32) : '';
            if (nm && nm !== meName) { try { await C().api('/me', { method: 'PATCH', body: { name: nm } }); } catch (err2) { toast(err2.message); } }
          }
          toast(tr(helper ? 'Its look is saved' : first ? 'Your character is at their desk' : 'Look saved'));
          if (opts.onSaved) opts.onSaved(r.look);
          if (window.TribeOffice && window.TribeOffice.refresh) window.TribeOffice.refresh();
          sh.close();
        } catch (err) { toast(err.message); t.disabled = false; st.saving = false; }
      }
    });
    all();
    cur = { sh, close: () => sh.close(), state: () => ({ draft: st.draft, tab: st.tab, undo: st.undo.length }) };
    return cur;
  }

  // Your own look: from the office's data when it's at hand, else asked from the server.
  async function openMine(extra) {
    let d = null;
    try { d = window.TribeOffice && window.TribeOffice.state ? window.TribeOffice.state() : null; } catch {}
    if (!d || !d.me) { try { d = await C().api('/office'); } catch (err) { toast(err.message); return null; } }
    const me = { id: d.me, kind: 'person', look: d.myLook };
    return open(Object.assign({ who: 'me', id: d.me, look: lookOf(me) }, extra || {}));
  }
  // An AI helper's look, for its owner (or the host or an admin): starts from its current look; Reset goes back to the default.
  function openHelper(desk, extra) {
    const L = K(); if (!L || !desk) return null;
    return open(Object.assign({ who: desk.id, id: desk.id, name: desk.name, look: lookOf(desk), base: L.agent(desk.id, desk.agentKind) }, extra || {}));
  }

  // ---------- kept on this device: the last look you saved, for the next tribe you join ----------
  const LS_LOOK = 'tribecode.office.look';
  function keep(look) { try { if (look) localStorage.setItem(LS_LOOK, JSON.stringify(look)); } catch {} }
  function kept() { try { const v = JSON.parse(localStorage.getItem(LS_LOOK) || 'null'); return v && typeof v === 'object' && v.v === 2 ? v : null; } catch { return null; } }

  // ---------- faces for avatars elsewhere (profiles.js): only saved looks, only once the art is loaded ----------
  const FACES = new Map();
  function faceUrl(id) {
    const O = window.TribeOffice, d = O && O.state && O.state(), art = A(), L = K();
    if (!d || !art || !L || !art.loaded || !art.loaded()) return null;
    const desk = (d.desks || []).find(x => x.id === id); if (!desk || !desk.look) return null;
    const look = lookOf(desk), key = id + '|' + JSON.stringify(look);
    if (FACES.has(key)) return FACES.get(key);
    const c = document.createElement('canvas'); c.width = 36; c.height = 36;
    if (!render(c, look, { crop: 'head', dir: 0, col: 1 })) return null;
    let url = null; try { url = c.toDataURL(); } catch {}
    if (url) FACES.set(key, url);
    return url;
  }

  window.TribeOfficeLooks = { open, openMine, openHelper, lookOf, render, current: () => cur, kept, keep, faceUrl };
})();
