// Launch kit (docs/LAUNCH-KIT.md): everything to put an app in the App Store and Google Play, built in and free.
// Six tabs: Screenshots (50 styles, every store size, a zip), Icon (54 styles, every icon size, a zip), Store text (limits,
// checks, a first draft without AI, better and translated with one), Paywall (17 layouts as designs; payments are not
// connected), Checklist (Apple and Google, saved per project) and Preview video (sizes, and Motion Studio when present).
// Opened from Publish › Where it goes › Launch kit, Ctrl K, Flint, and the quick guides.
//   window.TribeLaunchKit = { open(pid?, tab?), close(), state(), paywalls(), suggestProvider }
// Hooks it uses when they exist (feature-detected): TribeAppCreator.screens(pid) -> [{ id, name, image | render(w, h) }]
// and TribeAppCreator.insertScreen({ name, html, image }); TribeMotionStudio.open({ template: 'app-preview', screens });
// TribeSuggest.register(provider). Storage: GET|PUT /api/projects/:id/launchkit (server/launchkit.js); with no tribe,
// or a tribe kept on this device, the record stays in this browser.
(function () {
  'use strict';
  const C = window.TribeClient, K = () => window.TribeLaunchCore, D = () => window.TribeLaunchDraw;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const F = (s, v) => T(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const ico = (n, sz = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, sz) : '');
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const KEY = pid => `tribecode.launchkit.${pid || 'me'}`;
  const online = pid => !!(pid && !/^demo_/.test(pid) && C && C.connected && C.connected() && C.hasToken && C.hasToken() && !(window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo()));
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const TABS = [['shots', 'Screenshots', 'photo'], ['icon', 'Icon', 'palette'], ['text', 'Store text', 'quill'], ['paywall', 'Paywall', 'coin'], ['check', 'Checklist', 'check'], ['video', 'Preview video', 'media']];

  let st = null;   // { pid, kit, brand, name, kind, tab, sel, el, mem: Map(ref -> drawable), canEdit, saveT }

  // ---------- the record ----------
  async function load(pid) {
    let kit = null, canEdit = true;
    if (online(pid)) { try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/launchkit`, { project: pid }); kit = r.kit; canEdit = r.canEdit !== false; } catch {} }
    if (!kit) { try { kit = JSON.parse(localStorage.getItem(KEY(pid)) || 'null'); } catch {} }
    return { kit: K().norm(kit), canEdit };
  }
  function save(now) {
    if (!st) return; const pid = st.pid, kit = K().norm(st.kit);   // a clean copy goes out; the live record keeps its objects (the tabs hold them)
    try { localStorage.setItem(KEY(pid), JSON.stringify(kit)); } catch {}
    clearTimeout(st.saveT);
    const go = async () => { if (online(pid) && st && st.canEdit) { try { await C.api(`/projects/${encodeURIComponent(pid)}/launchkit`, { method: 'PUT', body: { kit }, project: pid }); } catch {} } };
    if (now) return go(); st.saveT = setTimeout(go, 600);
  }

  // ---------- where screens come from ----------
  const visualUrl = (slug, ts) => { const u = `${(C.base && C.base()) || ''}/api/visuals/${slug}/${ts}.png`; return window.TribeMedia ? window.TribeMedia.url(u) : u; };
  async function sources() {
    const out = [];
    const AC = window.TribeAppCreator;
    if (AC && typeof AC.screens === 'function') { try { for (const s of (await AC.screens(st.pid)) || []) out.push({ kind: 'app', ref: String(s.id || s.name), name: s.name || T('Screen'), item: s }); } catch {} }
    if (online(st.pid)) { try { const r = await C.api('/visuals', { project: st.pid }); for (const s of r.screens || []) if (s.latest) out.push({ kind: 'visual', ref: `${s.slug}/${s.latest.ts}`, name: s.name, at: s.latest.at }); } catch {} }
    for (const [ref, v] of st.mem) if (v.upload) out.push({ kind: 'mem', ref, name: v.name });
    out.push({ kind: 'paywall', ref: 'paywall', name: T('Your paywall') });
    return out;
  }
  async function drawable(src, i) {
    if (!src) { const c = document.createElement('canvas'); return D().screen(c, 393, 852, { brand: st.brand, name: st.name, variant: i }); }
    const k = `${src.kind}:${src.ref}`; if (st.mem.has(k)) return st.mem.get(k).d;
    let d = null;
    if (src.kind === 'visual') { const [slug, ts] = src.ref.split('/'); d = await D().img(visualUrl(slug, ts)); }
    else if (src.kind === 'mem') d = (st.mem.get(src.ref) || {}).d || null;
    else if (src.kind === 'paywall') { const c = document.createElement('canvas'); d = await D().paywall(c, 786, 1704, st.kit.paywall, st.brand, { name: st.name }); }
    else if (src.kind === 'app') {
      const AC = window.TribeAppCreator; let s = null; try { s = ((await AC.screens(st.pid)) || []).find(x => String(x.id || x.name) === src.ref); } catch {}
      if (s && s.image) d = await D().img(s.image);
      else if (s && typeof s.render === 'function') { const r = await s.render(786, 1704); d = typeof r === 'string' ? await D().img(r) : r; }
    }
    if (!d) return drawable(null, i);
    if (src.kind !== 'paywall') st.mem.set(k, { d }); return d;
  }

  // ---------- open / close ----------
  async function open(pid, tab) {
    if (!K() || !D()) return toast(T('The Launch kit did not load. Reload the app.'));
    pid = pid || (C && C.project && C.project()) || 'me';
    if (st && st.el) close();
    const proj = ((C && C.state && C.state().projects) || []).find(p => p.id === pid) || {};
    const r = await load(pid);
    const brand = window.TribeBrandKit ? await window.TribeBrandKit.get(pid).catch(() => null) : null;
    st = { pid, kit: r.kit, canEdit: r.canEdit, brand: brand || { colors: { accent: proj.color || '#F26B1D' } }, name: (brand && brand.name) || proj.name || 'My app', kind: 'app', tab: TABS.some(t => t[0] === tab) ? tab : 'shots', sel: 0, mem: new Map(), store: 'apple', size: 'ios69' };
    if (!st.kit.icon.text) st.kit.icon.text = ([...st.name][0] || 'A').toUpperCase();
    if (online(pid)) C.api(`/projects/${encodeURIComponent(pid)}/sense`, { project: pid }).then(s => { if (st && s) st.kind = s.kind === 'game' || s.kind === '3d' ? 'game' : 'app'; }).catch(() => {});
    const scrim = document.createElement('div'); scrim.className = 'lch-scrim';
    const el = document.createElement('section'); el.id = 'lch'; el.className = 'lch'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lch-h'); el.tabIndex = -1;
    el.innerHTML = `<header class="lch-head"><div class="lch-ttl"><span class="eyebrow">${esc(T('Launch kit'))}</span><h2 id="lch-h">${esc(st.name)}</h2></div>
      <span class="lch-prog" id="lch-prog"></span>${window.TribeAssetLib ? `<button type="button" class="btn sm ghost lch-lib" id="lch-lib">${ico('palette', 14)} <span>${esc(T('Library'))}</span></button>` : ''}<button type="button" class="lch-x" id="lch-x" aria-label="${esc(T('Close'))}">${ico('x', 18)}</button></header>
      <nav class="lch-tabs" role="tablist" aria-label="${esc(T('Launch kit'))}">${TABS.map(([id, l, i]) => `<button type="button" role="tab" class="lch-tab" data-lch-tab="${id}" aria-selected="false">${ico(i, 16)}<span>${esc(T(l))}</span></button>`).join('')}</nav>
      <div class="lch-body" id="lch-body"></div>`;
    document.body.append(scrim, el); st.el = el; st.scrim = scrim;
    scrim.onclick = close; el.querySelector('#lch-x').onclick = close;
    const lib = el.querySelector('#lch-lib'); if (lib) lib.onclick = () => library();
    fontReady().then(ok => { if (ok && st && st.el === el) show(st.tab); });
    if (window.TribeUI && window.TribeUI.adopt) window.TribeUI.adopt(el, { scrim, kind: 'steps', onClose: close });
    else el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    el.querySelectorAll('[data-lch-tab]').forEach(b => b.onclick = () => show(b.dataset.lchTab));
    show(st.tab); setTimeout(() => el.focus({ preventScroll: true }), 30);
  }
  // The brand font: a Google Fonts pair loads when online (fontlib.js); canvases wait for it, offline they use system fonts
  async function fontReady() {
    const f = st && st.brand && st.brand.fonts, FL = window.TribeFontLib; if (!f || !f.display || !FL || !FL.isG(f.display)) return false;
    FL.load([f.display, f.body]); const q = `700 40px "${String(f.display).replace(/"/g, '')}"`;
    try { await Promise.race([document.fonts.load(q), new Promise(r => setTimeout(r, 2500))]); return document.fonts.check(q); } catch { return false; }
  }
  // The shared design library: colours and fonts go to the brand kit (screenshots, icons, paywalls), an icon becomes the app icon's symbol
  function library() {
    const L = window.TribeAssetLib; if (!L || !st) return;
    L.open({ kind: 'palette', pid: st.pid, onPick: async x => {
      if (!['palette', 'font', 'icon'].includes(x.kind)) { toast(T('Pick colours, fonts or an icon for the Launch kit.')); return true; }
      try {
        if (x.kind === 'icon') { st.kit.icon.symbol = x.id; st.kit.icon.upload = ''; save(); toast(T('The app icon uses that symbol now.')); }
        else { const k = x.kind === 'palette' ? await L.usePalette(x.id, st.pid) : await L.useFont(x.id, st.pid); if (k) st.brand = { ...st.brand, ...k }; st.mem = new Map(); if (x.kind === 'font') await fontReady(); toast(T(x.kind === 'palette' ? 'Colours saved to the brand kit. The website, apps, motion and store pictures use them.' : 'Fonts saved to the brand kit.')); }
        if (st.el) show(x.kind === 'icon' ? 'icon' : st.tab);
      } catch (e) { toast(e.message || String(e)); }
    } });
  }
  function close() {
    if (!st || !st.el) return; save(true);
    const { el, scrim } = st; st.el = null;
    const done = () => { el.remove(); scrim.remove(); };
    if (window.TribeUI && window.TribeUI.dismiss) window.TribeUI.dismiss([el, scrim], done); else done();
  }
  function progress() { const p = K().progress(st.kit), e = st.el && st.el.querySelector('#lch-prog'); if (e) e.textContent = F('{done} of {total} launch steps done', p); }
  function show(tab) {
    st.tab = tab; const body = st.el.querySelector('#lch-body');
    st.el.querySelectorAll('[data-lch-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.lchTab === tab)));
    body.dataset.tab = tab; body.scrollTop = 0; progress();
    ({ shots: tabShots, icon: tabIcon, text: tabText, paywall: tabPaywall, check: tabCheck, video: tabVideo })[tab](body);
  }

  // ---------- Screenshots ----------
  function slides() { if (!st.kit.slides.length) st.kit.slides = [0, 1, 2].map(i => ({ src: null, caption: T(K().CAPTIONS[i]).replace('{name}', st.name), sub: T(K().SUBCAPTIONS[i]) })); return st.kit.slides; }
  const sizeOf = id => K().SIZES.find(s => s.id === id) || K().SIZES[0];
  async function renderSlide(c, i, W, H, styleId, size) {
    const s = slides()[i] || {}, prev = slides()[i - 1];
    const imgs = [await drawable(s.src, i), await drawable((slides()[i + 1] || {}).src, i + 1), await drawable((slides()[i + 2] || {}).src, i + 2)];
    D().slide(c, W, H, { style: styleId || st.kit.style, caption: String(s.caption || '').replace('{name}', st.name), sub: s.sub, imgs, prevImg: prev ? await drawable(prev.src, i - 1) : null, brand: st.brand, index: i, count: slides().length, tablet: !!(size && size.tablet), name: st.name });
    return c;
  }
  function tabShots(body) {
    const S = slides(), sz = sizeOf(st.size);
    body.innerHTML = `<div class="lch-split">
      <section class="lch-stage" aria-label="${esc(T('Preview'))}">
        <div class="lch-seg" role="group" aria-label="${esc(T('Size'))}">${K().SIZES.map(s => `<button type="button" class="chip${s.id === st.size ? ' is-on' : ''}" data-lch-size="${s.id}" aria-pressed="${s.id === st.size}">${esc(T(s.label))}</button>`).join('')}</div>
        <div class="lch-big"><canvas id="lch-cv" aria-label="${esc(T('Screenshot preview'))}"></canvas></div>
        <p class="lch-dim faint" id="lch-dim">${sz.w} × ${sz.h}</p>
        <ol class="lch-strip" id="lch-strip">${S.map((s, i) => `<li><button type="button" class="lch-th${i === st.sel ? ' is-on' : ''}" data-lch-sel="${i}" aria-label="${esc(F('Screenshot {n}', { n: i + 1 }))}"><canvas></canvas></button></li>`).join('')}${S.length < 10 ? `<li><button type="button" class="lch-add" id="lch-add" aria-label="${esc(T('Add a screenshot'))}">${ico('plus', 18)}</button></li>` : ''}</ol>
      </section>
      <section class="lch-side">
        <p class="eyebrow">${esc(F('Screenshot {n}', { n: st.sel + 1 }))}</p>
        <label class="lch-l">${esc(T('Screen'))}<button type="button" class="btn lch-pick" id="lch-src">${esc((S[st.sel] && S[st.sel].src && S[st.sel].src.name) || T('Pick a screen'))}</button></label>
        <label class="lch-l" for="lch-cap">${esc(T('Headline'))}</label><input class="input" id="lch-cap" maxlength="80" value="${esc((S[st.sel] || {}).caption || '')}">
        <div class="lch-starters" id="lch-starters" aria-label="${esc(T('Headline starters'))}">${K().CAPTIONS.slice(0, 52).map((c, i) => `<button type="button" class="chip sm" data-lch-cap="${i}">${esc(T(c).replace('{name}', st.name))}</button>`).join('')}</div>
        <label class="lch-l" for="lch-sub">${esc(T('Second line'))}</label><input class="input" id="lch-sub" maxlength="120" value="${esc((S[st.sel] || {}).sub || '')}">
        <div class="lch-row"><button type="button" class="btn sm" id="lch-up" ${st.sel ? '' : 'disabled'}>${esc(T('Move earlier'))}</button><button type="button" class="btn sm" id="lch-del" ${S.length > 1 ? '' : 'disabled'}>${esc(T('Remove'))}</button></div>
        <p class="eyebrow lch-h2">${esc(T('Style'))} <span class="faint" id="lch-stname"></span></p>
        <div class="lch-styles" id="lch-styles">${K().SHOT_STYLES.map(s => `<button type="button" class="lch-st${s.id === st.kit.style ? ' is-on' : ''}" data-lch-style="${s.id}" aria-label="${esc(K().styleName(s).map(T).join(' · '))}" aria-pressed="${s.id === st.kit.style}"><canvas width="96" height="190"></canvas></button>`).join('')}</div>
        <p class="eyebrow lch-h2">${esc(T('Download'))}</p>
        <div class="lch-sizes">${K().SIZES.map(s => `<label class="lch-ck"><input type="checkbox" data-lch-out="${s.id}" ${st.kit.sizes.includes(s.id) ? 'checked' : ''}> <span>${esc(T(s.label))} <small class="faint">${s.w}×${s.h}${s.req ? ' · ' + esc(T('needed')) : ''}</small></span></label>`).join('')}
          <label class="lch-ck"><input type="checkbox" id="lch-feat" ${st.kit.feature ? 'checked' : ''}> <span>${esc(T('Google Play feature graphic'))} <small class="faint">1024×500</small></span></label></div>
        <button type="button" class="btn primary lch-go" id="lch-zip">${esc(T('Download the screenshots'))}</button>
        <p class="faint lch-note">${esc(T('PNG files with no transparency, at the exact sizes each store asks for.'))}</p>
      </section></div>`;
    const big = body.querySelector('#lch-cv');
    const paint = async () => { const s = sizeOf(st.size), sc = Math.min(1, 900 / s.h); await renderSlide(big, st.sel, Math.round(s.w * sc), Math.round(s.h * sc), null, s); big.dataset.w = s.w; big.dataset.h = s.h; };
    const thumbs = async () => { const cs = body.querySelectorAll('#lch-strip canvas'); for (let i = 0; i < cs.length; i++) await renderSlide(cs[i], i, 120, 260, null, sizeOf(st.size)); };
    const styles = async () => { const s0 = sizeOf(st.size); for (const b of body.querySelectorAll('[data-lch-style]')) { if (!st.el || st.tab !== 'shots') return; await renderSlide(b.querySelector('canvas'), st.sel, 96, Math.round(96 * Math.min(2.2, s0.h / s0.w)), b.dataset.lchStyle, s0); } };
    const name = () => { const s = K().SHOT_STYLES.find(x => x.id === st.kit.style); const e = body.querySelector('#lch-stname'); if (e && s) e.textContent = K().styleName(s).map(T).join(' · '); };
    paint(); thumbs(); styles(); name();
    body.querySelectorAll('[data-lch-size]').forEach(b => b.onclick = () => { st.size = b.dataset.lchSize; tabShots(body); });
    body.querySelectorAll('[data-lch-sel]').forEach(b => b.onclick = () => { st.sel = +b.dataset.lchSel; tabShots(body); });
    const add = body.querySelector('#lch-add'); if (add) add.onclick = () => { S.push({ src: null, caption: T(K().CAPTIONS[S.length % 52]).replace('{name}', st.name), sub: '' }); st.sel = S.length - 1; save(); tabShots(body); };
    body.querySelector('#lch-src').onclick = () => pickScreen(body);
    const cap = body.querySelector('#lch-cap'), sub = body.querySelector('#lch-sub');
    let pt = 0; const redraw = () => { clearTimeout(pt); pt = setTimeout(() => { paint(); thumbs(); }, 160); };
    cap.oninput = () => { S[st.sel].caption = cap.value; save(); redraw(); };
    sub.oninput = () => { S[st.sel].sub = sub.value; save(); redraw(); };
    body.querySelectorAll('[data-lch-cap]').forEach(b => b.onclick = () => { cap.value = b.textContent; cap.oninput(); });
    body.querySelector('#lch-up').onclick = () => { if (!st.sel) return; const [x] = S.splice(st.sel, 1); S.splice(st.sel - 1, 0, x); st.sel--; save(); tabShots(body); };
    body.querySelector('#lch-del').onclick = () => { if (S.length < 2) return; S.splice(st.sel, 1); st.sel = Math.max(0, st.sel - 1); save(); tabShots(body); };
    body.querySelectorAll('[data-lch-style]').forEach(b => b.onclick = () => { st.kit.style = b.dataset.lchStyle; save(); body.querySelectorAll('[data-lch-style]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); name(); paint(); thumbs(); });
    body.querySelectorAll('[data-lch-out]').forEach(b => b.onchange = () => { st.kit.sizes = [...body.querySelectorAll('[data-lch-out]:checked')].map(x => x.dataset.lchOut); save(); });
    body.querySelector('#lch-feat').onchange = e => { st.kit.feature = e.target.checked; save(); };
    body.querySelector('#lch-zip').onclick = e => zipShots(e.currentTarget);
  }
  async function pickScreen(body) {
    const list = await sources();
    const sh = window.TribeUI.sheet({ eyebrow: T('Screenshot'), title: T('Pick a screen'), body: `<ul class="lch-srcs">${list.map((s, i) => `<li><button type="button" class="lch-src" data-i="${i}">${ico(s.kind === 'paywall' ? 'coin' : s.kind === 'app' ? 'phone' : 'photo', 16)}<span>${esc(s.name)}</span><small class="faint">${esc(T(s.kind === 'app' ? 'From the App Creator' : s.kind === 'visual' ? 'From Visuals' : s.kind === 'paywall' ? 'From the Paywall tab' : 'Uploaded'))}</small></button></li>`).join('')}
      <li><button type="button" class="lch-src" data-i="none">${ico('device', 16)}<span>${esc(T('A sample screen'))}</span><small class="faint">${esc(T('Until you have real ones'))}</small></button></li></ul>
      <label class="btn lch-up">${ico('upload', 16)} ${esc(T('Upload a picture'))}<input type="file" accept="image/png,image/jpeg,image/webp" id="lch-file" hidden></label>
      <p class="faint lch-note">${esc(T('Capture a screen from the live preview with its camera button, and it shows up here.'))}</p>` });
    const pick = src => { slides()[st.sel].src = src; if (src && src.kind === 'visual') { st.kit.seen = [...new Set(st.kit.seen.concat(src.ref))].slice(-60); } st.kit.shotsAt = new Date().toISOString(); save(); sh.close(); tabShots(body); };
    sh.body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => pick(b.dataset.i === 'none' ? null : { kind: list[+b.dataset.i].kind, ref: list[+b.dataset.i].ref, name: list[+b.dataset.i].name }));
    sh.body.querySelector('#lch-file').onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const url = URL.createObjectURL(f), im = await D().img(url); if (!im) return toast(T('That picture could not be read.'));
      const c = document.createElement('canvas'), sc = Math.min(1, 2868 / im.naturalHeight); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const name = f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 50) || T('Uploaded screen');
      if (online(st.pid)) { try { const r = await C.api('/visuals', { method: 'POST', body: { screen: name, png_base64: c.toDataURL('image/png'), note: 'Uploaded in the Launch kit' }, project: st.pid }); if (r.visual) { st.mem.set(`visual:${r.visual.screen}/${r.visual.ts}`, { d: c }); return pick({ kind: 'visual', ref: `${r.visual.screen}/${r.visual.ts}`, name }); } } catch {} }
      const ref = 'u' + Date.now().toString(36); st.mem.set(ref, { d: c, upload: true, name }); st.mem.set(`mem:${ref}`, { d: c }); pick({ kind: 'mem', ref, name });
    };
  }
  async function zipShots(btn) {
    const E = window.TribeExport; if (!E || !E.zip) return toast(T('Export did not load. Reload the app.'));
    const sizes = st.kit.sizes.map(sizeOf); if (!sizes.length && !st.kit.feature) return toast(T('Tick at least one size.'));
    btn.disabled = true; const was = btn.textContent, files = [], c = document.createElement('canvas'), S = slides();
    try {
      let n = 0; const total = sizes.length * S.length + (st.kit.feature ? 1 : 0);
      for (const s of sizes) for (let i = 0; i < S.length; i++) { btn.textContent = F('Drawing {n} of {total}…', { n: ++n, total }); await renderSlide(c, i, s.w, s.h, null, s); files.push([`${s.folder}/${String(i + 1).padStart(2, '0')}.png`, new Uint8Array(await (await D().png(c)).arrayBuffer())]); }
      if (st.kit.feature) { btn.textContent = F('Drawing {n} of {total}…', { n: ++n, total }); const ic = document.createElement('canvas'); await D().icon(ic, 240, { ...st.kit.icon, brand: st.brand, name: st.name }, 'opaque'); D().feature(c, { brand: st.brand, name: st.name, subtitle: st.kit.text.subtitle || st.kit.text.gshort, iconCanvas: ic, img: await drawable(S[0] && S[0].src, 0) }); files.push([K().FEATURE.file, new Uint8Array(await (await D().png(c)).arrayBuffer())]); }
      files.push(['README.txt', readme('shots', sizes)]);
      await E.save(E.zip(files, 'application/zip'), `${slug(st.name)}-store-screenshots.zip`);
      st.kit.shotsAt = new Date().toISOString(); save(); toast(T('Screenshots downloaded'));
    } catch (e) { toast(e.message || String(e)); }
    btn.disabled = false; btn.textContent = was;
  }
  const slug = s => String(s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
  function readme(what, sizes) {
    const lines = what === 'shots'
      ? ['Store screenshots made with TribeCode\'s Launch kit.', '', ...sizes.map(s => `${s.folder}/  ${s.w} x ${s.h}  ${s.label}${s.req ? ' (needed)' : ''}`), st.kit.feature ? `${K().FEATURE.file}  1024 x 500` : '', '', 'App Store: upload each folder under the matching iPhone or iPad size in App Store Connect.', 'Google Play: upload the phone (and tablet) images and the feature graphic in Play Console > Store presence.']
      : ['App icons made with TribeCode\'s Launch kit.', '', ...K().ICON_FILES.map(f => `${f.file}  ${f.size} px  ${f.kind === 'opaque' ? 'no transparency' : f.kind === 'fg' ? 'adaptive foreground, transparent' : f.kind === 'bg' ? 'adaptive background' : f.kind === 'mask' ? 'maskable (safe zone kept)' : 'transparency allowed'}`), '', 'ios/AppIcon-1024.png goes into your Xcode asset catalog or App Store Connect.', 'android/ files go into the Android project (mipmap-anydpi-v26) and Play Console (play-store-512.png).', 'web/ files go next to your site\'s manifest.json (see manifest-icons.json).'];
    return lines.filter(l => l !== undefined).join('\n') + '\n\nSizes follow Apple\'s and Google\'s pages as read on 2026-11-15. Check them again before you submit.\n';
  }

  // ---------- Icon ----------
  function tabIcon(body) {
    const ic = st.kit.icon, opts = () => ({ ...ic, brand: st.brand, name: st.name });
    body.innerHTML = `<div class="lch-split">
      <section class="lch-stage">
        <div class="lch-icbig"><canvas id="lch-ic" width="256" height="256" aria-label="${esc(T('Icon preview'))}"></canvas></div>
        <div class="lch-homes">${['light', 'dark'].map(m => `<div class="lch-home lch-home--${m}" aria-label="${esc(T(m === 'light' ? 'Home screen, light' : 'Home screen, dark'))}">${Array.from({ length: 8 }, (_, i) => i === 5 ? `<span class="lch-app"><canvas width="120" height="120"></canvas><small>${esc(st.name.slice(0, 12))}</small></span>` : '<span class="lch-app"><i></i><small></small></span>').join('')}</div>`).join('')}</div>
        <div class="lch-masks">${['ios', 'circle', 'squircle'].map(m => `<span class="lch-mask lch-mask--${m}"><canvas width="96" height="96"></canvas><small>${esc(T(m === 'ios' ? 'iPhone' : m === 'circle' ? 'Android round' : 'Android rounded'))}</small></span>`).join('')}</div>
      </section>
      <section class="lch-side">
        <label class="lch-l" for="lch-ictx">${esc(T('Letters'))}</label><input class="input" id="lch-ictx" maxlength="2" value="${esc(ic.text)}" autocomplete="off">
        <p class="lch-l">${esc(T('Symbol'))}</p>
        <div class="lch-syms">${K().SYMBOLS.map(n => `<button type="button" class="lch-sym${n === ic.symbol ? ' is-on' : ''}" data-lch-sym="${n}" aria-label="${esc(n)}" aria-pressed="${n === ic.symbol}">${ico(n, 20)}</button>`).join('')}</div>
        <div class="lch-row"><label class="lch-ck"><input type="checkbox" id="lch-swap" ${ic.swap ? 'checked' : ''}> <span>${esc(T('Swap the colors'))}</span></label>
          <label class="btn sm">${ico('upload', 14)} ${esc(T('Use a picture'))}<input type="file" accept="image/png,image/jpeg,image/webp" id="lch-icup" hidden></label>${ic.upload ? `<button type="button" class="btn sm" id="lch-icno">${esc(T('Remove the picture'))}</button>` : ''}</div>
        <p class="eyebrow lch-h2">${esc(T('Style'))} <span class="faint" id="lch-icname"></span></p>
        <div class="lch-icstyles" id="lch-icstyles">${K().ICON_STYLES.map(s => `<button type="button" class="lch-ist${s.id === ic.style ? ' is-on' : ''}" data-lch-icon="${s.id}" aria-label="${esc(K().iconStyleName(s).map(T).join(' · '))}" aria-pressed="${s.id === ic.style}"><canvas width="64" height="64"></canvas></button>`).join('')}</div>
        <button type="button" class="btn primary lch-go" id="lch-iczip">${esc(T('Download the icons'))}</button>
        <p class="faint lch-note">${esc(T('Every size for the App Store, Google Play, Android and the web, in one zip.'))}</p>
      </section></div>`;
    const big = body.querySelector('#lch-ic');
    const paint = async () => {
      await D().icon(big, 256, opts(), 'opaque');
      for (const c of body.querySelectorAll('.lch-home canvas, .lch-mask canvas')) { const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.drawImage(big, 0, 0, c.width, c.height); }
      const s = K().ICON_STYLES.find(x => x.id === ic.style), e = body.querySelector('#lch-icname'); if (e && s) e.textContent = K().iconStyleName(s).map(T).join(' · ');
    };
    const styles = async () => { for (const b of body.querySelectorAll('[data-lch-icon]')) { if (!st.el || st.tab !== 'icon') return; await D().icon(b.querySelector('canvas'), 64, { ...opts(), style: b.dataset.lchIcon }, 'opaque'); } };
    paint(); styles();
    const tx = body.querySelector('#lch-ictx'); let tt = 0;
    tx.oninput = () => { ic.text = tx.value.trim(); save(); clearTimeout(tt); tt = setTimeout(() => { paint(); styles(); }, 200); };
    body.querySelectorAll('[data-lch-sym]').forEach(b => b.onclick = () => { ic.symbol = b.dataset.lchSym; save(); body.querySelectorAll('[data-lch-sym]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); paint(); styles(); });
    body.querySelector('#lch-swap').onchange = e => { ic.swap = e.target.checked; save(); paint(); styles(); };
    body.querySelectorAll('[data-lch-icon]').forEach(b => b.onclick = () => { ic.style = b.dataset.lchIcon; save(); body.querySelectorAll('[data-lch-icon]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); paint(); });
    body.querySelector('#lch-icup').onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return; const im = await D().img(URL.createObjectURL(f)); if (!im) return toast(T('That picture could not be read.'));
      const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'), s = Math.max(512 / im.naturalWidth, 512 / im.naturalHeight); x.drawImage(im, (512 - im.naturalWidth * s) / 2, (512 - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
      ic.upload = c.toDataURL('image/png'); if (ic.upload.length > 690000) ic.upload = c.toDataURL('image/jpeg', 0.85); save(); tabIcon(body);
    };
    const no = body.querySelector('#lch-icno'); if (no) no.onclick = () => { ic.upload = ''; save(); tabIcon(body); };
    body.querySelector('#lch-iczip').onclick = async e => {
      const btn = e.currentTarget, E = window.TribeExport; if (!E || !E.zip) return; btn.disabled = true; const was = btn.textContent;
      try {
        const files = [], c = document.createElement('canvas');
        for (const f of K().ICON_FILES) { btn.textContent = F('Drawing {n} of {total}…', { n: files.length + 1, total: K().ICON_FILES.length }); await D().icon(c, f.size, opts(), f.kind); files.push([f.file, new Uint8Array(await (await D().png(c, { alpha: f.kind === 'fg' || f.kind === 'alpha' })).arrayBuffer())]); }
        files.push(['web/manifest-icons.json', JSON.stringify({ icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 2) + '\n']);
        files.push(['README.txt', readme('icons')]);
        await E.save(E.zip(files, 'application/zip'), `${slug(st.name)}-app-icons.zip`); toast(T('Icons downloaded'));
      } catch (er) { toast(er.message || String(er)); }
      btn.disabled = false; btn.textContent = was;
    };
  }

  // ---------- Store text ----------
  function tabText(body) {
    const t = st.kit.text, fields = K().FIELDS.filter(f => f.store === st.store);
    body.innerHTML = `<div class="lch-text">
      <div class="lch-row lch-texthead"><div class="lch-seg" role="group" aria-label="${esc(T('Store'))}">${[['apple', 'App Store'], ['google', 'Google Play']].map(([id, l]) => `<button type="button" class="chip${st.store === id ? ' is-on' : ''}" data-lch-store="${id}" aria-pressed="${st.store === id}">${esc(l)}</button>`).join('')}</div>
        <span class="lch-grow"></span><button type="button" class="btn" id="lch-draft">${esc(T('Write a first draft'))}</button><button type="button" class="btn" id="lch-ai">${ico('spark', 14)} ${esc(T('Make it better with AI'))}</button></div>
      <p class="faint lch-note">${esc(T('The first draft uses your project’s name, vision and finished tasks. Nothing is invented: no rankings, no numbers you did not write.'))}</p>
      ${fields.map(f => `<div class="lch-field" data-f="${f.id}"><div class="lch-fh"><label for="lch-t-${f.id}">${esc(T(f.label))}</label><span class="lch-count" id="lch-c-${f.id}"></span><button type="button" class="linkish" data-lch-copy="${f.id}">${esc(T('Copy'))}</button></div>
        ${f.long ? `<textarea class="input" id="lch-t-${f.id}" rows="${f.id === 'whatsnew' ? 4 : 8}">${esc(t[f.id])}</textarea>` : `<input class="input" id="lch-t-${f.id}" value="${esc(t[f.id])}" autocomplete="off" spellcheck="true">`}
        ${f.hint ? `<small class="faint">${esc(T(f.hint))}</small>` : ''}<ul class="lch-checks" id="lch-k-${f.id}"></ul>${f.id === 'keywords' ? `<button type="button" class="btn sm" id="lch-tidy">${esc(T('Tidy the keywords'))}</button>` : ''}</div>`).join('')}
      <div class="lch-field"><div class="lch-fh"><label>${esc(T('Other languages'))}</label></div>
        <div class="lch-langs">${((window.TribeI18n && window.TribeI18n.LANGS) || []).filter(l => l[0] !== 'en').map(([id, nm]) => `<label class="lch-ck"><input type="checkbox" data-lch-lang="${id}" ${st.kit.langs.includes(id) ? 'checked' : ''}> <span>${esc(nm)}</span></label>`).join('')}</div>
        <button type="button" class="btn sm" id="lch-tr">${esc(T('Translate with AI'))}</button><div id="lch-trout" class="lch-trout"></div></div>
    </div>`;
    const count = id => { const f = K().FIELDS.find(x => x.id === id), v = t[id] || '', n = f.bytes ? K().byteLen(v) : [...v].length, e = body.querySelector('#lch-c-' + id); if (e) { e.textContent = F(f.bytes ? '{n} / {max} bytes' : '{n} / {max}', { n, max: f.max }); e.classList.toggle('is-over', n > f.max); } };
    const checks = id => { const ul = body.querySelector('#lch-k-' + id); if (!ul) return; const list = K().check(id, t[id], t); ul.innerHTML = list.map(c => `<li class="is-${c.level}">${ico(c.level === 'bad' ? 'x' : c.level === 'warn' ? 'flag' : 'spark', 14)}<span>${esc(F(c.key, c.vars))}</span></li>`).join(''); };
    fields.forEach(f => { count(f.id); checks(f.id); const inp = body.querySelector('#lch-t-' + f.id); inp.oninput = () => { t[f.id] = inp.value; save(); count(f.id); checks(f.id); if (f.id === 'name' || f.id === 'subtitle') checks('keywords'); }; });
    body.querySelectorAll('[data-lch-store]').forEach(b => b.onclick = () => { st.store = b.dataset.lchStore; tabText(body); });
    body.querySelectorAll('[data-lch-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(t[b.dataset.lchCopy] || ''); toast(T('Copied')); } catch { toast(T('Could not copy')); } });
    const tidy = body.querySelector('#lch-tidy'); if (tidy) tidy.onclick = () => { const r = K().tidyKeywords(t.keywords, t); t.keywords = r.value; save(); toast(F('Freed {n} bytes', { n: r.saved })); tabText(body); };
    body.querySelector('#lch-draft').onclick = async () => {
      const d = K().draft(await context()), filled = [];
      for (const f of K().FIELDS) if (!String(t[f.id] || '').trim()) { t[f.id] = d[f.id]; filled.push(f.id); }
      if (!filled.length && !confirmReplace()) return;
      if (!filled.length) Object.assign(t, d);
      save(); tabText(body); toast(T('Draft written. Read it through before you use it.'));
    };
    const aiBtn = body.querySelector('#lch-ai');
    aiBtn.onclick = async () => {
      const A = window.TribeAIBasics; const on = A && A.online ? await A.online() : { online: false };
      if (!on.online) return toast(T('This needs an AI. Turn one on in Settings › AI, or use the first draft.'));
      aiBtn.disabled = true; const keys = K().FIELDS.map(f => f.id), draft = Object.fromEntries(keys.map(k => [k, t[k] || ''])); if (!keys.some(k => draft[k])) Object.assign(draft, K().draft(await context()));
      try { const r = await A.ask('store.listing', await context(), draft); const j = r && parseJSON(r.text); if (!j) throw new Error(T('The AI did not answer in the expected shape. Nothing changed.')); for (const k of keys) if (typeof j[k] === 'string') t[k] = j[k]; save(); tabText(body); toast(T('Improved. Read it through before you use it.')); }
      catch (e) { toast(e.message || String(e)); }
      aiBtn.disabled = false;
    };
    body.querySelectorAll('[data-lch-lang]').forEach(b => b.onchange = () => { st.kit.langs = [...body.querySelectorAll('[data-lch-lang]:checked')].map(x => x.dataset.lchLang); save(); });
    const out = body.querySelector('#lch-trout'); const showTr = () => { out.innerHTML = Object.entries(st.kit.localized || {}).map(([l, v]) => `<details><summary>${esc(((window.TribeI18n && window.TribeI18n.LANGS) || []).find(x => x[0] === l)?.[1] || l)}</summary><pre class="lch-pre">${esc(Object.entries(v || {}).map(([k, x]) => `${k}: ${x}`).join('\n\n'))}</pre></details>`).join(''); };
    showTr();
    body.querySelector('#lch-tr').onclick = async e => {
      const A = window.TribeAIBasics, on = A && A.online ? await A.online() : { online: false };
      if (!on.online) return toast(T('This needs an AI. Turn one on in Settings › AI.'));
      if (!st.kit.langs.length) return toast(T('Tick a language first.'));
      const btn = e.currentTarget; btn.disabled = true;
      for (const l of st.kit.langs) { try { const r = await A.ask('store.translate', { lang: l, listing: Object.fromEntries(K().FIELDS.map(f => [f.id, t[f.id] || ''])) }, ''); const j = r && parseJSON(r.text); if (j) st.kit.localized[l] = j; } catch {} }
      save(); showTr(); btn.disabled = false;
    };
  }
  const confirmReplace = () => window.confirm(T('Every field already has words. Replace them all with a new draft?'));
  function parseJSON(s) { const m = String(s || '').match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
  async function context() {
    const ctx = { name: st.name, kind: st.kind, features: [] };
    if (online(st.pid)) {
      const [v, s, tk] = await Promise.all([C.api('/vision', { project: st.pid }).catch(() => ({})), C.api(`/projects/${encodeURIComponent(st.pid)}/sense`, { project: st.pid }).catch(() => ({})), C.api('/tasks', { project: st.pid }).catch(() => ({}))]);
      ctx.vision = v.text || ''; ctx.summary = s.summary || ''; ctx.audience = s.audience || ''; if (s.kind === 'game' || s.kind === '3d') ctx.kind = 'game';
      const list = Array.isArray(tk.tasks) ? tk.tasks : Array.isArray(tk) ? tk : [];
      ctx.features = list.filter(x => x && /done|closed/i.test(x.status || x.column || '')).map(x => x.title).slice(0, 8);
    }
    return ctx;
  }

  // ---------- Paywall ----------
  function tabPaywall(body) {
    const m = st.kit.paywall = K().paywallNorm(st.kit.paywall), AC = window.TribeAppCreator, canInsert = !!(AC && typeof AC.insertScreen === 'function');
    body.innerHTML = `<div class="lch-split">
      <section class="lch-stage"><p class="lch-banner" role="note">${ico('lock', 14)} <span>${esc(T(K().PAYWALL_NOTE))}</span></p>
        <div class="lch-big lch-big--pw"><canvas id="lch-pw" aria-label="${esc(T('Paywall preview'))}"></canvas></div></section>
      <section class="lch-side">
        <p class="eyebrow">${esc(T('Layout'))} <span class="faint" id="lch-pwname"></span></p>
        <div class="lch-pws" id="lch-pws">${K().PAYWALLS.map(([id, nm]) => `<button type="button" class="lch-pwt${id === m.layout ? ' is-on' : ''}" data-lch-pw="${id}" aria-label="${esc(T(nm))}" aria-pressed="${id === m.layout}"><canvas width="90" height="195"></canvas></button>`).join('')}</div>
        <label class="lch-l" for="lch-pwt">${esc(T('Title'))}</label><input class="input" id="lch-pwt" maxlength="60" value="${esc(m.title)}">
        <label class="lch-l" for="lch-pws2">${esc(T('Second line'))}</label><input class="input" id="lch-pws2" maxlength="140" value="${esc(m.sub)}">
        <label class="lch-l" for="lch-pwf">${esc(T('What people get, one per line'))}</label><textarea class="input" id="lch-pwf" rows="4">${esc(m.features.join('\n'))}</textarea>
        <p class="lch-l">${esc(T('Plans'))}</p>
        <div class="lch-plans">${m.plans.map((p, i) => `<div class="lch-plan"><input class="input" data-pl="${i}" data-k="name" value="${esc(p.name)}" aria-label="${esc(T('Plan name'))}"><input class="input" data-pl="${i}" data-k="price" value="${esc(p.price)}" aria-label="${esc(T('Price shown'))}"><input class="input" data-pl="${i}" data-k="period" value="${esc(p.period)}" aria-label="${esc(T('How often'))}"><input class="input" data-pl="${i}" data-k="badge" value="${esc(p.badge)}" placeholder="${esc(T('Badge'))}" aria-label="${esc(T('Badge'))}"></div>`).join('')}</div>
        <label class="lch-ck"><input type="checkbox" id="lch-trial" ${m.trial.on ? 'checked' : ''}> <span>${esc(T('Free trial line'))}</span></label><input class="input" id="lch-trialt" maxlength="40" value="${esc(m.trial.text)}" aria-label="${esc(T('Free trial line'))}">
        <label class="lch-l" for="lch-cta">${esc(T('Button'))}</label><input class="input" id="lch-cta" maxlength="30" value="${esc(m.cta)}">
        <div class="lch-row lch-acts">${canInsert ? `<button type="button" class="btn primary" id="lch-pwins">${esc(T('Add to my app'))}</button>` : ''}<button type="button" class="btn${canInsert ? '' : ' primary'}" id="lch-pwhtml">${esc(T('Download the screen'))}</button><button type="button" class="btn" id="lch-pwshot">${esc(T('Use as a screenshot'))}</button></div>
        <p class="faint lch-note">${esc(T('The prices are examples for your own app. Connecting real payments is a separate step in your app’s code and store account.'))}</p>
      </section></div>`;
    const big = body.querySelector('#lch-pw');
    const paint = async () => { await D().paywall(big, 393, 852, m, st.brand, { name: st.name }); const e = body.querySelector('#lch-pwname'); if (e) e.textContent = T((K().PAYWALLS.find(x => x[0] === m.layout) || [])[1] || ''); };
    const thumbs = async () => { for (const b of body.querySelectorAll('[data-lch-pw]')) { if (!st.el || st.tab !== 'paywall') return; await D().paywall(b.querySelector('canvas'), 90, 195, { ...m, layout: b.dataset.lchPw }, st.brand, { name: st.name }); } };
    paint(); thumbs();
    let pt = 0; const redraw = () => { save(); clearTimeout(pt); pt = setTimeout(() => { paint(); thumbs(); }, 180); };
    body.querySelectorAll('[data-lch-pw]').forEach(b => b.onclick = () => { m.layout = b.dataset.lchPw; body.querySelectorAll('[data-lch-pw]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); save(); paint(); });
    const bind = (sel, fn) => { const e = body.querySelector(sel); e.oninput = e.onchange = () => { fn(e); redraw(); }; };
    bind('#lch-pwt', e => { m.title = e.value; }); bind('#lch-pws2', e => { m.sub = e.value; }); bind('#lch-pwf', e => { m.features = e.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8); });
    bind('#lch-trial', e => { m.trial.on = e.checked; }); bind('#lch-trialt', e => { m.trial.text = e.value; }); bind('#lch-cta', e => { m.cta = e.value; });
    body.querySelectorAll('[data-pl]').forEach(e => { e.oninput = () => { m.plans[+e.dataset.pl][e.dataset.k] = e.value; redraw(); }; });
    const html = () => K().paywallHTML(m, st.brand);
    body.querySelector('#lch-pwhtml').onclick = async () => { const E = window.TribeExport; const blob = new Blob([html()], { type: 'text/html' }); if (E && E.save) await E.save(blob, `${slug(st.name)}-paywall.html`); toast(T('Downloaded')); };
    const ins = body.querySelector('#lch-pwins'); if (ins) ins.onclick = async () => { try { const c = document.createElement('canvas'); await D().paywall(c, 786, 1704, m, st.brand, { name: st.name }); await AC.insertScreen({ name: T('Paywall'), html: html(), image: c.toDataURL('image/png'), kind: 'paywall' }); toast(T('Added to your app')); } catch (e) { toast(e.message || String(e)); } };
    body.querySelector('#lch-pwshot').onclick = () => { const S = slides(); if (S.length >= 10) return toast(T('Ten screenshots is the most a store takes.')); S.push({ src: { kind: 'paywall', ref: 'paywall', name: T('Your paywall') }, caption: T('Unlock everything'), sub: '' }); st.sel = S.length - 1; save(); show('shots'); };
  }

  // ---------- Checklist ----------
  function tabCheck(body) {
    const k = st.kit, group = s => K().CHECKLIST.filter(c => c.store === s);
    const act = c => { const g = c.go; if (g === 'note') return ''; const label = g.startsWith('url:') ? T('Open the page') : g.startsWith('publish:') ? T('Open Publish') : g === 'privacy' ? T('Make a privacy policy') : T('Do it here'); return `<button type="button" class="btn sm" data-lch-go="${esc(g)}">${esc(label)}</button>`; };
    body.innerHTML = `<div class="lch-check">${['apple', 'google'].map(s => { const g = group(s), d = g.filter(c => k.checks[c.id]).length; return `<section class="lch-group"><header class="lch-gh"><h3>${s === 'apple' ? 'App Store' : 'Google Play'}</h3><span class="faint">${esc(F('{done} of {total}', { done: d, total: g.length }))}</span></header>
      <ul class="lch-items">${g.map(c => `<li class="lch-item${k.checks[c.id] ? ' is-done' : ''}"><label class="lch-ck"><input type="checkbox" data-lch-chk="${c.id}" ${k.checks[c.id] ? 'checked' : ''}> <span><b>${esc(T(c.title))}</b></span></label><p class="faint">${esc(T(c.line))}</p>
        <div class="lch-row">${act(c)}${c.go === 'note' ? `<details${k.notes[c.id] ? ' open' : ''}><summary>${esc(T('Notes'))}</summary><textarea class="input" rows="3" data-lch-note="${c.id}" aria-label="${esc(T('Notes'))}">${esc(k.notes[c.id] || '')}</textarea></details>` : ''}</div></li>`).join('')}</ul></section>`; }).join('')}
      <section class="lch-sources"><p class="eyebrow">${esc(T('Where these rules come from'))}</p><ul>${K().SOURCES.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(T(t))}</a></li>`).join('')}</ul>
      <p class="faint lch-note">${esc(T('Paraphrased from Apple’s and Google’s pages, read on 15 November 2026. Store rules change, so read them again before you submit. This is not legal advice.'))}</p></section></div>`;
    body.querySelectorAll('[data-lch-chk]').forEach(b => b.onchange = () => { k.checks[b.dataset.lchChk] = b.checked; b.closest('.lch-item').classList.toggle('is-done', b.checked); save(); progress(); });
    body.querySelectorAll('[data-lch-note]').forEach(t => t.oninput = () => { k.notes[t.dataset.lchNote] = t.value; save(); });
    body.querySelectorAll('[data-lch-go]').forEach(b => b.onclick = () => go(b.dataset.lchGo));
  }
  function go(g) {
    if (g === 'shots' || g === 'icon' || g === 'text' || g === 'paywall' || g === 'video') return show(g === 'shots' ? 'shots' : g);
    if (g.startsWith('url:')) return window.open(g.slice(4), '_blank', 'noopener');
    if (g.startsWith('publish:')) { const pid = st.pid; close(); if (window.TribePublish) window.TribePublish.open(pid, g.slice(8)); return; }
    if (g === 'privacy') { const L = window.TribeLegal; if (L && L.open) { close(); return L.open('privacy'); } return toast(T('Write one in Docs, or use a privacy policy template from the Marketplace.')); }
  }

  // ---------- Preview video ----------
  function tabVideo(body) {
    const P = K().PREVIEW, M = window.TribeMotionStudio, yt = K().youtubeOk(st.kit.youtube);
    body.innerHTML = `<div class="lch-video">
      <section class="lch-group"><header class="lch-gh"><h3>App Store</h3></header><ul class="lch-specs">
        <li>${esc(F('{min} to {max} seconds, up to {n} per size', { min: P.apple.min, max: P.apple.max, n: P.apple.count }))}</li>
        <li>${esc(F('iPhone: {w} × {h}', { w: P.apple.phone[0], h: P.apple.phone[1] }))}</li><li>${esc(F('iPad: {w} × {h}', { w: P.apple.ipad[0], h: P.apple.ipad[1] }))}</li>
        <li>${esc(F('At most {fps} frames a second, MP4 or MOV, up to {mb} MB', { fps: P.apple.fps, mb: P.apple.mb }))}</li></ul></section>
      <section class="lch-group"><header class="lch-gh"><h3>Google Play</h3></header><ul class="lch-specs"><li>${esc(T(P.google.note))}</li><li>${esc(F('Only the first {n} seconds play by themselves: show the app early.', { n: P.google.autoplay }))}</li></ul>
        <label class="lch-l" for="lch-yt">${esc(T('YouTube link'))}</label><input class="input" id="lch-yt" inputmode="url" value="${esc(st.kit.youtube)}" placeholder="https://youtu.be/…"><small class="lch-ytok ${yt.ok ? '' : 'is-bad'}" id="lch-ytok">${yt.ok ? (yt.empty ? '' : esc(T('Looks right.'))) : esc(T(yt.key))}</small></section>
      <section class="lch-group lch-make"><h3>${esc(T('Make the video'))}</h3>
        ${M && typeof M.open === 'function' ? `<p class="faint">${esc(T('Motion Studio turns your screenshots into a short preview, sized for the stores.'))}</p><button type="button" class="btn primary" id="lch-motion">${esc(T('Make it in Motion Studio'))}</button>`
          : `<p class="faint">${esc(T('Record your screen on the phone while you use the app, then trim it to 15–30 seconds. Motion Studio will make this one tap when it arrives.'))}</p><button type="button" class="btn" id="lch-motion" disabled>${esc(T('Make it in Motion Studio'))}</button>`}</section></div>`;
    const y = body.querySelector('#lch-yt'), ok = body.querySelector('#lch-ytok');
    y.oninput = () => { st.kit.youtube = y.value.trim(); save(); const r = K().youtubeOk(st.kit.youtube); ok.textContent = r.ok ? (r.empty ? '' : T('Looks right.')) : T(r.key); ok.classList.toggle('is-bad', !r.ok); };
    const mb = body.querySelector('#lch-motion'); if (mb && !mb.disabled) mb.onclick = async () => {
      const screens = []; for (let i = 0; i < slides().length; i++) { const c = document.createElement('canvas'); await renderSlide(c, i, 886, 1920, null, sizeOf('ios69')); screens.push({ name: slides()[i].caption, image: c.toDataURL('image/png') }); }
      try { window.TribeMotionStudio.open({ template: 'app-preview', screens, size: { w: 886, h: 1920 }, brand: st.brand, name: st.name }); } catch (e) { toast(e.message || String(e)); }
    };
  }

  // ---------- for the App Creator: the paywall layouts as templates ----------
  function paywalls() {
    return K().PAYWALLS.map(([id, name]) => ({ id, name, model: () => ({ ...K().PAYWALL_DEFAULT, layout: id }), html: (m, brand) => K().paywallHTML({ ...m, layout: id }, brand), render: (c, w, h, m, brand) => D().paywall(c, w, h, { ...(m || K().PAYWALL_DEFAULT), layout: id }, brand) }));
  }

  // ---------- suggestions for the tribe (TribeSuggest) ----------
  const suggestProvider = {
    id: 'launch', title: 'Launch',
    async gather(ctx) {
      const pid = (ctx && ctx.projectId) || (C && C.project && C.project()); if (!pid) return null;
      const r = await load(pid); let screens = [], messages = [];
      if (online(pid)) {
        try { screens = (await C.api('/visuals', { project: pid })).screens || []; } catch {}
        try { const who = id => ((C.state && C.state().members) || []).find(x => x.id === id); messages = ((await C.api('/chat/general?limit=60', { project: pid })).messages || []).map(m => ({ id: m.id, by: m.by, name: m.name || (who(m.by) || {}).name || '', text: m.text || '', at: m.ts || m.at })); } catch {}
      }
      return { pid, kit: r.kit, screens, messages, canEdit: r.canEdit };
    },
    async suggest(ctx, g) {
      if (!g || !g.canEdit) return [];
      return K().suggestions(g).map(s => ({
        id: s.id, title: F(s.title, s.vars), why: F(s.why, { ...s.vars, who: s.vars && s.vars.who && s.vars.who !== 'Someone' ? s.vars.who : T('Someone') }), from: s.from,
        apply: async () => {
          const r = await load(g.pid), kit = r.kit, before = JSON.stringify(kit);
          if (s.op.kind === 'text') kit.text[s.op.field] = s.op.value;
          if (s.op.kind === 'shots') { kit.slides = kit.slides.concat(s.op.screens.map(src => ({ src, caption: '', sub: '' }))).slice(0, 10); kit.seen = [...new Set(kit.seen.concat(s.op.screens.map(x => x.ref)))].slice(-60); kit.shotsAt = new Date().toISOString(); }
          await putKit(g.pid, kit);
          return async () => { await putKit(g.pid, JSON.parse(before)); };
        },
      }));
    },
  };
  async function putKit(pid, kit) {
    kit = K().norm(kit); try { localStorage.setItem(KEY(pid), JSON.stringify(kit)); } catch {}
    if (st && st.pid === pid) { clearTimeout(st.saveT); st.kit = kit; if (st.el) show(st.tab); }   // a pending save of the old record must not land after this one
    if (online(pid)) await C.api(`/projects/${encodeURIComponent(pid)}/launchkit`, { method: 'PUT', body: { kit }, project: pid });
  }
  function registerSuggest() { const S = window.TribeSuggest; if (S && typeof S.register === 'function' && !registerSuggest.done) { registerSuggest.done = true; try { S.register(suggestProvider); } catch {} } }
  registerSuggest(); window.addEventListener('load', registerSuggest); document.addEventListener('tribe:suggest-ready', registerSuggest);

  // ---------- Ctrl K ----------
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: T('Launch kit'), keys: 'app store google play screenshots icon store listing keywords paywall launch checklist aso', run: () => open() },
  ]);
  if (C && C.on) C.on('ws', m => { if (m && m.type === 'launchkit' && st && st.el && m.project === st.pid && m.by !== (C.state && C.state().me && C.state().me.id)) load(st.pid).then(r => { if (st && st.el) { st.kit = r.kit; show(st.tab); } }); });

  window.TribeLaunchKit = { open, close, state: () => st && { pid: st.pid, tab: st.tab, kit: st.kit, open: !!st.el }, paywalls, suggestProvider, _render: { slide: renderSlide } };
})();
