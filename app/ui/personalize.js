// Make it yours (v0.28): the first thing a new host sees, before the focused first run asks what to make.
// Three short steps, one card at a time, everything applied live and saved as you click:
//   1. You    — your name and a profile icon (letters, emoji or pixel art in a color, or your own photo via the cropper)
//   2. Look   — a theme (the same list as Settings), match system light/dark, and an accent
//   3. Touches — language and text size
// A small live preview of the app sits beside the card and repaints with every choice. Skip / Esc leaves at any point
// and keeps what you picked; the defaults are good. Shown once (localStorage), on a fresh tribe, to the host only.
// Never with ?skipIntro / ?demo= / ?welcome / ?tour=, in the offline demo, on a phone device link, or under automation
// unless ?personalize=1 (or the test flag). Reopen any time: Settings › Personalize, or the profile menu.
// The focused first run (firstrun.js) waits for this to finish, so only one onboarding thing shows at a time.
//   window.TribePersonalize = { open(step), close(), pending(), isOpen(), then(fn) }
(function () {
  'use strict';
  const C = window.TribeClient, S = window.TribeStore; if (!C || !S) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const t = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const P = () => window.TribeProfiles, T = () => window.TribeThemes;
  const DONE = 'tribecode.personalized';
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);

  // one tidy grid of 12: your letters, six emoji, four pixel faces, and your own photo
  const EMOJI = ['🦊', '🐻', '🐸', '🦉', '🚀', '🎮'];
  const PIX = ['flame', 'fox', 'cat', 'mushroom'];
  const TINTS = ['teal', 'indigo', 'sky', 'violet', 'rose', 'coral', 'amber', 'lime'];
  // accents offered here (null = the theme's own); colors that read badly on the chosen theme are hidden
  const ACCENTS = [[null, 'Theme'], ['#F26B1D', 'Ember'], ['#38C6B1', 'Teal'], ['#6C7CFF', 'Indigo'], ['#FF6F8E', 'Rose'], ['#F2B33D', 'Amber'], ['#A58BFF', 'Violet']];
  const SIZES = [['s', 'Small'], ['', 'Default'], ['l', 'Large'], ['xl', 'Larger']];
  const STEPS = [
    { k: 'you', eb: 'Make it yours', title: 'What should friends call you?' },
    { k: 'look', eb: 'Make it yours', title: 'Pick a look' },
    { k: 'touch', eb: 'Make it yours', title: 'Last touches' },
  ];

  const me = () => (C.state() || {}).me || {};
  const projects = () => (C.state() || {}).projects || [];
  const forced = () => /[?&]personalize=1/.test(location.search) || lsGet('tribecode.personalize.test') === '1';
  const blocked = () => /[?&](skipIntro|demo=|welcome|tour=)/.test(location.search) || /^\/m\//.test(location.pathname)
    || (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active()) || (navigator.webdriver && !forced());
  function eligible() {
    if (lsGet(DONE)) return false;
    const m = me(); if (!m.id || m.role !== 'host') return false;
    if (forced()) return true;
    if (blocked()) return false;
    const ps = projects(), fresh = !ps.length || (ps.length === 1 && !ps[0].hasRepo && !ps[0].bio);
    return fresh && lsGet('tribecode.firstrun.done') !== '1' && !lsGet('tribecode.firstrun.used');
  }
  let waiting = [];
  const pending = () => !!$('#pz') || eligible();
  const isOpen = () => !!$('#pz');
  function then(fn) { if (!pending()) fn(); else waiting.push(fn); }

  // ---------- the draft: what the card shows; saved as you go ----------
  let d = null, step = 0, el = null, opener = null;
  function fresh() {
    const m = me(), mine = (P() && C.state().members || []).find(x => x.id === m.id) || m;
    const a = (mine.profile && mine.profile.avatar) || { kind: 'initials' };
    const tintOf = c => (P() && Object.keys(P().palette).find(k => P().palette[k].toLowerCase() === String(c || '').toLowerCase())) || 'teal';
    return { name: mine.name || S.get().name || '', avatar: a, tint: a.tint || tintOf(mine.color), color: mine.color || S.get().color, photo: a.kind === 'photo' ? a : null };
  }
  // the member as the preview and the save see it
  const asMember = () => ({ ...me(), name: d.name || t('You'), color: d.avatar.kind === 'initials' ? (P() ? P().palette[d.tint] : d.color) : d.color, profile: { avatar: d.avatar } });
  const avatarHtml = (cls = '') => P() ? P().avatar(asMember(), cls) : `<span class="pf-av ${cls}">${esc((d.name || '?')[0])}</span>`;

  let saveT = 0;
  function saveProfile(now) {
    clearTimeout(saveT);
    const run = async () => {
      const m = me(); if (!m.id) return;
      const name = (d.name || '').trim().slice(0, 32);
      const color = P() ? P().palette[d.tint] : null;
      try {
        const body = {}; if (name && name !== m.name) body.name = name; if (d.avatar.kind === 'initials' && color && color !== m.color) body.color = color;
        if (body.name || body.color) { await C.api('/me', { method: 'PATCH', body: { name: name || m.name, ...(body.color ? { color: body.color } : {}) } }); S.set({ name: name || m.name, ...(body.color ? { color: body.color } : {}) }); }
        if (d.avatar.kind !== 'photo') await C.api('/profile', { method: 'PATCH', body: { avatar: d.avatar.kind === 'initials' ? { kind: 'initials' } : { ...d.avatar, tint: d.tint } } });
      } catch (e) { toast(e.message); }
    };
    if (now) return run(); saveT = setTimeout(run, 500);
  }

  // ---------- look: themes, accent, text size (stored per device, like Settings) ----------
  const look = () => Object.assign({ accent: null, fontSize: '' }, S.get().look || {});
  const setLook = patch => { S.set({ look: { ...(S.get().look || {}), ...patch } }); if (window.TribeLook && window.TribeLook.apply) window.TribeLook.apply(); };
  function pickTheme(id) {
    const Th = T(), cur = S.get(), th = Th.byId(id); if (!th) return;
    const sysMode = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    S.set({ ...Th.pick(id), themeSystem: !!(cur.themeSystem || cur.theme === 'system') && th.mode === sysMode });
    Th.apply(S.get());
    // an accent that no longer reads on this theme goes back to the theme's own
    const a = look().accent; if (a && window.TribeLook && window.TribeLook.check && window.TribeLook.check('accent', a)) setLook({ accent: null });
    if (window.TribeLook && window.TribeLook.apply) window.TribeLook.apply();
  }
  function toggleSystem() {
    const Th = T(), cur = S.get(), on = !(cur.themeSystem || cur.theme === 'system');
    S.set({ themeSystem: on, theme: cur.theme === 'system' ? Th.resolve(cur) : cur.theme }); Th.apply(S.get());
  }

  // ---------- rendering ----------
  const ico = k => `<svg class="i" aria-hidden="true"><use href="#${k}"/></svg>`;
  function stepYou() {
    const tiles = [`<button class="pz-av ${d.avatar.kind === 'initials' ? 'on' : ''}" data-av="initials" role="radio" aria-checked="${d.avatar.kind === 'initials'}" aria-label="${esc(t('Letters'))}">${P() ? P().avatar({ name: d.name || '?', color: P().palette[d.tint] }, 'pz-face') : ''}</button>`]
      .concat(EMOJI.map(e => { const on = d.avatar.kind === 'emoji' && d.avatar.emoji === e; return `<button class="pz-av ${on ? 'on' : ''}" data-av="emoji:${e}" role="radio" aria-checked="${on}" aria-label="${esc(e)}">${P() ? P().avatar({ profile: { avatar: { kind: 'emoji', emoji: e, tint: d.tint } } }, 'pz-face') : e}</button>`; }))
      .concat((P() ? PIX.filter(x => P().pixels.includes(x)) : []).map(px => { const on = d.avatar.kind === 'pixel' && d.avatar.pixel === px; return `<button class="pz-av ${on ? 'on' : ''}" data-av="pixel:${esc(px)}" role="radio" aria-checked="${on}" aria-label="${esc(px)}">${P().avatar({ profile: { avatar: { kind: 'pixel', pixel: px, tint: d.tint } } }, 'pz-face')}</button>`; }));
    const photoOn = d.avatar.kind === 'photo';
    tiles.push(`<button class="pz-av pz-up ${photoOn ? 'on' : ''}" data-av="photo" aria-label="${esc(t('Upload a photo'))}" title="${esc(t('Upload a photo'))}">${photoOn ? avatarHtml('pz-face') : ico('i-upload') + `<small>${esc(t('Photo'))}</small>`}</button>`);
    return `
      <label class="pz-lbl" for="pz-name">${esc(t('Your name'))}</label>
      <input class="input pz-name" id="pz-name" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(d.name)}" placeholder="${esc(t('Your name'))}">
      <p class="pz-lbl">${esc(t('Profile icon'))}</p>
      <div class="pz-avs" role="radiogroup" aria-label="${esc(t('Profile icon'))}">${tiles.join('')}</div>
      <input type="file" id="pz-file" accept="image/*" hidden>
      <p class="pz-lbl">${esc(t('Color'))}</p>
      <div class="pz-tints" role="radiogroup" aria-label="${esc(t('Color'))}">${TINTS.map(k => `<button class="pz-tint ${d.tint === k ? 'on' : ''}" data-tint="${k}" role="radio" aria-checked="${d.tint === k}" aria-label="${esc(k)}" style="--c:${P() ? P().palette[k] : ''}"></button>`).join('')}</div>`;
  }
  function stepLook() {
    const Th = T(), st = S.get(), cur = Th.resolve(st), sys = !!(st.themeSystem || st.theme === 'system'), a = look().accent;
    const cards = Th.list.map(th => `<button class="pz-th ${th.id === cur ? 'on' : ''}" data-th="${th.id}" role="radio" aria-checked="${th.id === cur}">
        <span class="pz-sw" style="background:${th.sw[0]}"><i style="background:${th.sw[1]}"></i><b style="background:${th.sw[2]}"></b></span><span class="pz-thn">${esc(t(th.name))}</span></button>`).join('');
    const okA = ([v]) => !v || !(window.TribeLook && window.TribeLook.check) || !window.TribeLook.check('accent', v);
    const accents = ACCENTS.filter(okA).map(([v, n]) => `<button class="pz-acc ${(a || null) === v ? 'on' : ''}" data-acc="${v || ''}" role="radio" aria-checked="${(a || null) === v}" title="${esc(t(n))}" aria-label="${esc(t(n))}" style="--c:${v || 'var(--accent)'}">${v ? '' : '<span>A</span>'}</button>`).join('');
    return `
      <div class="pz-ths" role="radiogroup" aria-label="${esc(t('Theme'))}">${cards}</div>
      <div class="pz-row"><span class="pz-lbl">${esc(t('Accent'))}</span><div class="pz-accs" role="radiogroup" aria-label="${esc(t('Accent'))}">${accents}</div></div>
      <div class="pz-row"><span class="pz-lbl">${esc(t('Match my system (light/dark)'))}</span><button class="toggle set-toggle" role="switch" id="pz-sys" aria-checked="${sys}" aria-label="${esc(t('Match my system (light/dark)'))}"><span class="switch"></span></button></div>`;
  }
  function stepTouch() {
    const I = window.TribeI18n, lang = I ? I.lang() : 'en', fs = look().fontSize || '';
    const langs = I ? I.LANGS.map(([k, n]) => `<button class="pz-chip ${k === lang ? 'on' : ''}" data-lang="${k}" role="radio" aria-checked="${k === lang}" lang="${k}">${esc(n)}</button>`).join('') : '';
    const sizes = SIZES.map(([k, n]) => `<button class="pz-seg ${k === (fs === 'm' ? '' : fs) ? 'on' : ''}" data-fs="${k}" role="radio" aria-checked="${k === fs}">${esc(t(n))}</button>`).join('');
    return `
      ${langs ? `<p class="pz-lbl">${esc(t('Language'))}</p><div class="pz-chips" role="radiogroup" aria-label="${esc(t('Language'))}">${langs}</div>` : ''}
      <p class="pz-lbl">${esc(t('Text size'))}</p><div class="pz-segs" role="radiogroup" aria-label="${esc(t('Text size'))}">${sizes}</div>
      <p class="pz-note">${esc(t('You can change all of this later in Settings.'))}</p>`;
  }
  function preview() {
    const nm = esc(d.name || t('You'));
    return `<div class="pz-app" aria-hidden="true">
        <div class="pz-rail"><i class="pz-logo"></i><i></i><i></i></div>
        <div class="pz-side"><b>${esc((C.state().tribe || {}).name || t('My Tribe'))}</b><span class="on"></span><span></span><span></span><span></span>
          <div class="pz-me">${avatarHtml('pz-face sm')}<em>${nm}</em></div></div>
        <div class="pz-main"><p class="pz-ch"># general</p>
          <div class="pz-msg">${avatarHtml('pz-face')}<div><b>${nm}</b><p>${esc(t('Hey! Let’s build something fun this weekend.'))}</p></div></div>
          <div class="pz-msg"><span class="pf-av pz-face pz-flint"><img src="assets/flint.svg" alt=""></span><div><b>Flint</b><p>${esc(t('I’m in. Tell me what you want to make.'))}</p></div></div>
          <div class="pz-comp"><span>${esc(t('Message #general'))}</span><i></i></div></div>
      </div>`;
  }
  function draw() {
    if (!el) return;
    const s = STEPS[step], body = step === 0 ? stepYou() : step === 1 ? stepLook() : stepTouch(), last = step === STEPS.length - 1;
    el.innerHTML = `<div class="pz-box">
        <section class="pz-card" role="dialog" aria-modal="true" aria-labelledby="pz-t">
          <div class="pz-prog" aria-label="${esc(t('Step'))} ${step + 1} / ${STEPS.length}">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
          <p class="pz-eb">${esc(t(s.eb))} · ${step + 1} / ${STEPS.length}</p>
          <h2 class="pz-t" id="pz-t">${esc(t(s.title))}</h2>
          <div class="pz-body" data-step="${s.k}">${body}</div>
          <footer class="pz-foot">
            <button class="btn ghost" id="pz-skip">${esc(t(opener === 'first' ? 'Skip' : 'Close'))}</button>
            <span class="pz-sp"></span>
            ${step ? `<button class="btn" id="pz-back">${esc(t('Back'))}</button>` : ''}
            <button class="btn primary" id="pz-next">${esc(t(last ? 'Done' : 'Next'))}</button>
          </footer>
        </section>
        <figure class="pz-prev"><figcaption class="pz-eb">${esc(t('Live preview'))}</figcaption>${preview()}</figure>
      </div>`;
    wire();
  }
  const repaintPreview = () => { const f = el && el.querySelector('.pz-prev'); if (f) f.innerHTML = `<figcaption class="pz-eb">${esc(t('Live preview'))}</figcaption>${preview()}`; };
  function go(n) { if (n >= STEPS.length) return finish(); step = Math.max(0, n); const run = () => draw(); window.TribeMotion ? window.TribeMotion.swap(run) : run(); const f = el.querySelector('#pz-name, .pz-body button.on, #pz-next'); if (f) f.focus(); }

  function wire() {
    const q = s => el.querySelector(s), all = (s, f) => el.querySelectorAll(s).forEach(f);
    q('#pz-skip').onclick = () => finish(true);
    q('#pz-next').onclick = () => { if (step === 0) saveProfile(true); go(step + 1); };
    const b = q('#pz-back'); if (b) b.onclick = () => go(step - 1);
    const nm = q('#pz-name');
    if (nm) nm.oninput = () => { d.name = nm.value; repaintPreview(); all('[data-av="initials"]', x => { x.innerHTML = P() ? P().avatar({ name: d.name || '?', color: P().palette[d.tint] }, 'pz-face') : ''; }); saveProfile(); };
    all('[data-av]', x => x.onclick = () => {
      const v = x.dataset.av;
      if (v === 'photo') return q('#pz-file').click();
      if (v === 'initials') d.avatar = { kind: 'initials' };
      else if (v.startsWith('emoji:')) d.avatar = { kind: 'emoji', emoji: v.slice(6), tint: d.tint };
      else if (v.startsWith('pixel:')) d.avatar = { kind: 'pixel', pixel: v.slice(6), tint: d.tint };
      saveProfile(); draw();
    });
    const file = q('#pz-file');
    if (file) file.onchange = async () => {
      const f = file.files && file.files[0]; file.value = ''; if (!f) return;
      try {
        const image = window.TribeCropper ? await window.TribeCropper.pick({ file: f, size: 256, title: t('Frame your avatar') }) : null;
        if (!image) return;
        const r = await C.api('/profile/avatar', { method: 'POST', body: { image, still: null } });
        d.avatar = (r && r.profile && r.profile.avatar) || { kind: 'photo' };
        if (!d.avatar.file) d.avatar = { kind: 'emoji', emoji: '🔥', tint: d.tint };
        draw();
      } catch (e) { if (e && e.message && !/cancel/i.test(e.message)) toast(e.message); }
    };
    all('[data-tint]', x => x.onclick = () => { d.tint = x.dataset.tint; if (d.avatar.kind === 'emoji' || d.avatar.kind === 'pixel') d.avatar = { ...d.avatar, tint: d.tint }; saveProfile(); draw(); });
    all('[data-th]', x => x.onclick = () => { pickTheme(x.dataset.th); draw(); });
    all('[data-acc]', x => x.onclick = () => { setLook({ accent: x.dataset.acc || null }); draw(); });
    const sys = q('#pz-sys'); if (sys) sys.onclick = () => { toggleSystem(); draw(); };
    all('[data-lang]', x => x.onclick = () => { if (window.TribeI18n) window.TribeI18n.set(x.dataset.lang); draw(); });
    all('[data-fs]', x => x.onclick = () => { setLook({ fontSize: x.dataset.fs }); draw(); });
  }
  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(true); }
    else if (e.key === 'Enter' && e.target && (e.target.id === 'pz-name' || e.target === document.body)) { e.preventDefault(); el.querySelector('#pz-next').click(); }
  }

  function open(at, how) {
    if (!C.connected || !C.connected()) return;
    if (el) { go(typeof at === 'number' ? at : step); return; }
    opener = how || 'menu';
    d = fresh(); step = typeof at === 'number' ? Math.max(0, Math.min(STEPS.length - 1, at)) : 0;
    el = document.createElement('div'); el.id = 'pz'; el.className = 'pz';
    document.body.appendChild(el); document.body.classList.add('pz-open');
    document.addEventListener('keydown', onKey, true);
    draw();
    setTimeout(() => { const n = el && el.querySelector('#pz-name'); if (n) { n.focus(); n.select(); } }, 60);
  }
  function close() {
    if (!el) return;
    document.removeEventListener('keydown', onKey, true);
    el.remove(); el = null; document.body.classList.remove('pz-open');
  }
  function finish(skipped) {
    if (d && step === 0 && !skipped) saveProfile(true); else if (d && saveT) saveProfile(true);
    lsSet(DONE, skipped ? 'skipped' : 'done');
    close();
    const fns = waiting; waiting = [];
    fns.forEach(f => { try { f(); } catch {} });
    window.dispatchEvent(new CustomEvent('tribe-personalized', { detail: { skipped: !!skipped } }));
  }

  // first launch: open once the tribe says hello (firstrun.js waits for us)
  let booted = false;
  function boot() { if (booted) return; booted = true; setTimeout(() => { if (eligible()) open(0, 'first'); }, 200); }
  if (C.on) C.on('hello', boot);
  if (C.connected && C.connected()) boot();
  window.addEventListener('tribe-lang', () => { if (el) draw(); });
  window.TribePersonalize = { open: s => open(s, 'menu'), close, pending, isOpen, then };
})();
