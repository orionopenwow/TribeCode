// Share a clip (feat/site-demos, docs/SHARE-CLIPS.md): one place to turn a project into a short clip for X, TikTok,
// Instagram or YouTube, with the words to post beside it.
//   - What to show: the app's screens (App Creator), a screenshot from Visuals (the website, the game, the preview's
//     camera button), a timelapse of a screen's versions (or every screen) from oldest to newest, or pictures you add.
//   - The size each feed wants (9:16, 1:1, 16:9), the first words on screen, and a "Made with TribeCode · Remix" end
//     card that is on until you turn it off.
//   - A small live preview drawn by the same engine as Motion Studio (app/ui/motionkit.js + motionsocial.js).
//   - Captions for X, TikTok and Instagram drafted from what the tribe already wrote (shareclip-core.js), with limits
//     and checks, Copy, and "Better wording" when the tribe has an AI (aibasics 'share.caption').
//   - "Open in Motion Studio" builds the clip from a Share clips template and opens it there; Export in the studio
//     saves the video. Motion Studio is the one place that renders and exports.
// Opened from: Publish › Where it goes › Share a clip, Motion Studio's Export tab, Ctrl K, Flint ("make a clip for
// TikTok", "share this", "make a timelapse") and the tribe's suggestions ("Make a clip of today's changes").
// Public: window.TribeShareClip = { open(o), close(), state(), build(), captions(), suggestProvider }
//   o = { pid, source: 'app'|'shots'|'timelapse'|'upload', aspect: '9:16'|'1:1'|'16:9', platform: 'x'|'tiktok'|'instagram' }
(function () {
  'use strict';
  const C = window.TribeClient;
  const SC = () => window.TribeShareCore, K = () => window.TribeMotionKit;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.TribeI18n && window.TribeI18n.t ? (window.TribeI18n.t(s, s) || s) : s);
  const F = (s, o) => T(s).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] != null ? o[k] : m));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const ico = (n, sz = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, sz, 'shc-i') : '');
  const connected = () => !!(C && C.connected && C.connected());
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SIZES = [['9:16', 'TikTok, Reels, Shorts'], ['1:1', 'Feeds'], ['16:9', 'X and YouTube']];
  const SOURCES = [['app', 'phone', 'App screens'], ['shots', 'photo', 'A screenshot'], ['timelapse', 'clock', 'Timelapse'], ['upload', 'upload', 'My pictures']];
  let st = null;

  // ---------- pictures: every source ends as small JPEG data URLs, so the clip can be saved with the project ----------
  const visualUrl = (slug, ts) => { const u = `${(C && C.base && C.base()) || ''}/api/visuals/${slug}/${ts}.png`; return window.TribeMedia ? window.TribeMedia.url(u) : u; };
  const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function shrink(img, max = 900) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height; if (!w || !h) return '';
    const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    try { return c.toDataURL('image/jpeg', 0.84); } catch { return ''; }
  }
  async function appScreens(pid) {
    const AC = window.TribeAppCreator; if (!AC || typeof AC.screens !== 'function') return [];
    let list = []; try { list = (await AC.screens(pid)) || []; } catch { return []; }
    const out = [];
    for (const s of list.slice(0, 6)) {
      try {
        let src = s.png || s.image || '';
        if (!src && typeof s.render === 'function') { const c = document.createElement('canvas'); const r = await s.render(c, 585, 1266); const cv = r && r.getContext ? r : c; src = cv.toDataURL('image/jpeg', 0.86); }
        if (src) out.push({ name: s.name || T('Screen'), src });
      } catch {}
    }
    return out;
  }
  async function visuals(pid) {
    if (!connected()) return [];
    try { return ((await C.api('/visuals', { project: pid })).screens || []).filter(s => s.latest); } catch { return []; }
  }
  async function versionsOf(pid, slug) { try { return (await C.api(`/visuals/${encodeURIComponent(slug)}`, { project: pid })).versions || []; } catch { return []; } }

  // ---------- what the captions know: the project's own words ----------
  async function info(pid) {
    const s = (C && C.state && C.state()) || {}, proj = (s.projects || []).find(p => p.id === pid) || {};
    const brand = window.TribeBrandKit ? await window.TribeBrandKit.get(pid).catch(() => null) : null;
    const out = { name: (brand && brand.name) || proj.name || '', kind: 'project', what: proj.description || proj.gist || '', changes: [], link: '', people: (s.members || []).filter(m => !m.ai && !m.agent).length || 1 };
    if (!connected()) return out;
    const [sense, tasks, pub] = await Promise.all([
      C.api(`/projects/${encodeURIComponent(pid)}/sense`, { project: pid }).catch(() => null),
      C.api('/tasks', { project: pid }).catch(() => null),
      C.api('/publish/real?project=' + encodeURIComponent(pid)).catch(() => null)]);
    if (sense && sense.kind) out.kind = /game|3d/.test(sense.kind) ? 'game' : /site|web/.test(sense.kind) ? 'site' : 'app';
    const week = Date.now() - 7 * 864e5;
    out.changes = ((tasks && tasks.tasks) || []).filter(t => /done/.test(t.status || '') && (!t.doneAt || Date.parse(t.doneAt) > week)).slice(-3).map(t => String(t.title || '').replace(/^(?:add|make|build)\s+/i, m => m.toLowerCase()).slice(0, 60));
    const pg = pub && ((pub.dest && pub.dest.pages) || pub.pages); out.link = (pg && pg.url) || '';
    return out;
  }

  // ---------- the sheet ----------
  async function open(o = {}) {
    if (!SC() || !K() || !K().TEMPLATES['share-app-916']) return toast(T('Share a clip did not load. Reload the app.'));
    if (st) close();
    const pid = o.pid || (C && C.project && C.project()) || '';
    st = { pid, source: o.source || '', aspect: o.aspect || (o.platform === 'x' ? '16:9' : '9:16'), platform: o.platform || (o.aspect === '16:9' ? 'x' : 'tiktok'), end: true, hook: '', picks: {}, app: [], shots: [], lapse: '', uploads: [], caps: null, info: null, raf: 0, doc: null };
    const sh = window.TribeUI.sheet({ kind: 'steps', wide: true, id: 'shc-sheet', eyebrow: 'Share', title: 'Share a clip',
      body: `<div class="shc" id="shc"><p class="shc-lead">${esc(T('Pick what to show and the size. It opens in Motion Studio, where Export saves the video.'))}</p>
        <div class="shc-cols"><div class="shc-form">
          <p class="eyebrow shc-h">${esc(T('What to show'))}</p>
          <div class="shc-seg" id="shc-src" role="radiogroup" aria-label="${esc(T('What to show'))}">${SOURCES.map(([id, i, l]) => `<button type="button" class="shc-opt" role="radio" aria-checked="false" data-src="${id}">${ico(i, 18)}<span>${esc(T(l))}</span><small class="faint" data-count="${id}"></small></button>`).join('')}</div>
          <div class="shc-pick" id="shc-pick"></div>
          <p class="eyebrow shc-h">${esc(T('Size'))}</p>
          <div class="shc-seg shc-sizes" id="shc-size" role="radiogroup" aria-label="${esc(T('Size'))}">${SIZES.map(([a, l]) => `<button type="button" class="shc-opt" role="radio" aria-checked="false" data-aspect="${a}"><b>${a}</b><small class="faint">${esc(T(l))}</small></button>`).join('')}</div>
          <label class="shc-l" for="shc-hook">${esc(T('First words on screen'))}</label><input class="input" id="shc-hook" maxlength="80" autocomplete="off">
          <label class="shc-tg"><input type="checkbox" id="shc-end" checked> <span>${esc(T('End card: Made with TribeCode · Remix'))}</span></label>
        </div>
        <figure class="shc-prev"><canvas id="shc-cv" width="240" height="427" aria-label="${esc(T('Preview of the clip'))}"></canvas><figcaption class="faint" id="shc-pv-note"></figcaption></figure></div>
        <p class="eyebrow shc-h">${esc(T('Words to post with it'))}</p>
        <div class="shc-tabs" role="tablist">${SC().PLATFORMS.map(([id, n]) => `<button type="button" role="tab" class="shc-tab" data-plat="${id}" aria-selected="false">${esc(n)}</button>`).join('')}</div>
        <textarea class="input shc-cap" id="shc-cap" rows="5" aria-label="${esc(T('Caption'))}"></textarea>
        <div class="shc-capbar"><span class="faint mono" id="shc-count"></span><span class="shc-probs" id="shc-probs" role="status"></span><span class="shc-sp"></span><button type="button" class="btn" id="shc-better" hidden>${esc(T('Better wording'))}</button><button type="button" class="btn" id="shc-copy">${ico('copy', 16)} ${esc(T('Copy'))}</button></div>
      </div>`,
      foot: `<button type="button" class="btn" id="shc-cancel">${esc(T('Not now'))}</button><button type="button" class="btn primary" id="shc-go">${esc(T('Open in Motion Studio'))}</button>`,
      onClose: () => { if (st) { cancelAnimationFrame(st.raf); st = null; } } });
    st.sheet = sh; const el = sh.el;
    $('#shc-cancel', el).onclick = () => sh.close();
    $('#shc-go', el).onclick = go;
    $$('[data-src]', el).forEach(b => b.onclick = () => pickSource(b.dataset.src));
    $$('[data-aspect]', el).forEach(b => b.onclick = () => { st.aspect = b.dataset.aspect; seg('#shc-size', 'aspect', st.aspect); rebuild(); });
    $$('[data-plat]', el).forEach(b => b.onclick = () => showCap(b.dataset.plat));
    $('#shc-hook', el).oninput = e => { st.hook = e.target.value; rebuild(); };
    $('#shc-end', el).onchange = e => { st.end = e.target.checked; rebuild(); refreshCaps(); };
    $('#shc-cap', el).oninput = e => { if (st.caps) st.caps[st.platform] = e.target.value; counter(); };
    $('#shc-copy', el).onclick = copy;
    $('#shc-better', el).onclick = better;
    seg('#shc-size', 'aspect', st.aspect);
    // load what there is, then choose the best source when none was asked for
    const [inf, app, shots] = await Promise.all([info(pid), appScreens(pid), visuals(pid)]);
    if (!st) return;
    st.info = inf; st.app = app; st.shots = shots;
    $('#shc-hook', el).value = st.hook = SC().hook(inf);
    count('app', app.length); count('shots', shots.length); count('timelapse', shots.reduce((n, s) => n + (s.count || 1), 0));
    pickSource(st.source || (app.length ? 'app' : shots.length ? 'shots' : 'upload'));
    refreshCaps(); showCap(st.platform);
    const A = window.TribeAIBasics; if (A && A.online) A.online().then(r => { const b = st && $('#shc-better', el); if (b && r && r.online) b.hidden = false; }).catch(() => {});
    return state();
  }
  function close() { if (st && st.sheet) st.sheet.close(); }
  function state() { return st && { pid: st.pid, source: st.source, aspect: st.aspect, platform: st.platform, end: st.end, hook: st.hook, images: imagesNow().length, template: SC().template(st.source, st.aspect), caps: st.caps && { ...st.caps } }; }
  function seg(sel, key, val) { $$(`${sel} [data-${key}]`, st.sheet.el).forEach(b => b.setAttribute('aria-checked', String(b.dataset[key] === val))); }
  function count(src, n) { const e = st.sheet.el.querySelector(`[data-count="${src}"]`); if (e) e.textContent = n ? String(n) : ''; }

  async function pickSource(src) {
    st.source = src; seg('#shc-src', 'src', src);
    const box = $('#shc-pick', st.sheet.el);
    if (src === 'app') {
      box.innerHTML = st.app.length ? `<div class="shc-strip">${st.app.map(s => `<img src="${s.src}" alt="${esc(s.name)}" width="54" height="117">`).join('')}</div><p class="faint">${esc(F('{n} screens from the App Creator, swiped in a phone.', { n: st.app.length }))}</p>`
        : `<p class="faint">${esc(T('No app screens yet. Make an app in Design › App, or pick another source.'))}</p>`;
    } else if (src === 'shots') {
      box.innerHTML = st.shots.length ? `<div class="shc-grid">${st.shots.slice(0, 12).map((s, i) => `<button type="button" class="shc-shot" data-shot="${i}" aria-pressed="${i === (st.picks.shot || 0)}"><img alt="" width="96" height="60" src="${visualUrl(s.slug, s.latest.ts)}"><span>${esc(s.name)}</span></button>`).join('')}</div>`
        : `<p class="faint">${esc(T('No screenshots yet. Press the camera in the preview, or ask your AI to post one.'))}</p>`;
      $$('[data-shot]', box).forEach(b => b.onclick = () => { st.picks.shot = +b.dataset.shot; $$('[data-shot]', box).forEach(x => x.setAttribute('aria-pressed', String(x === b))); st.picks.shotSrc = ''; rebuild(); });
    } else if (src === 'timelapse') {
      const many = st.shots.filter(s => (s.count || 0) > 1);
      box.innerHTML = st.shots.length ? `<label class="shc-l" for="shc-lapse">${esc(T('Which screen'))}</label><select class="input" id="shc-lapse"><option value="">${esc(T('Every screen, oldest to newest'))}</option>${many.map(s => `<option value="${esc(s.slug)}">${esc(s.name)} · ${esc(F('{n} versions', { n: s.count }))}</option>`).join('')}</select>`
        : `<p class="faint">${esc(T('A timelapse needs screenshots over time. Press the camera in the preview now and then, and they add up.'))}</p>`;
      const sel = $('#shc-lapse', box); if (sel) { sel.value = st.lapse; sel.onchange = () => { st.lapse = sel.value; st.picks.lapse = null; rebuild(); }; }
    } else {
      box.innerHTML = `<label class="btn shc-up">${ico('upload', 16)} ${esc(T('Add pictures'))}<input type="file" id="shc-file" accept="image/*" multiple hidden></label><p class="faint" id="shc-up-n">${esc(st.uploads.length ? F('{n} pictures added', { n: st.uploads.length }) : T('Screenshots of your site, app or game work best.'))}</p>`;
      $('#shc-file', box).onchange = async e => { for (const f of [...e.target.files].slice(0, 10)) { const url = URL.createObjectURL(f); const im = await loadImg(url); URL.revokeObjectURL(url); const d = im && shrink(im); if (d) st.uploads.push(d); } st.uploads = st.uploads.slice(-10); $('#shc-up-n', box).textContent = F('{n} pictures added', { n: st.uploads.length }); rebuild(); };
    }
    await gather(); rebuild();
  }
  // the pictures the chosen source needs, fetched once and kept small
  async function gather() {
    if (st.source === 'shots' && st.shots.length && !st.picks.shotSrc) {
      const s = st.shots[st.picks.shot || 0]; const im = await loadImg(visualUrl(s.slug, s.latest.ts)); if (st) st.picks.shotSrc = im ? shrink(im, 1200) : '';
    }
    if (st.source === 'timelapse' && st.shots.length && !st.picks.lapse) {
      const slugs = st.lapse ? [st.lapse] : st.shots.slice(0, 8).map(s => s.slug), all = [];
      for (const slug of slugs) for (const v of await versionsOf(st.pid, slug)) all.push({ slug, ts: v.ts, at: v.at });
      all.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      const pick = all.length > 10 ? all.filter((_, i) => i % Math.ceil(all.length / 10) === 0).slice(0, 9).concat(all.slice(-1)) : all, out = [];
      for (const v of pick) { const im = await loadImg(visualUrl(v.slug, v.ts)); const d = im && shrink(im, 900); if (d) out.push(d); }
      if (st) st.picks.lapse = out;
    }
  }
  function imagesNow() {
    if (!st) return [];
    if (st.source === 'app') return st.app.map(s => s.src);
    if (st.source === 'shots') return st.picks.shotSrc ? [st.picks.shotSrc] : [];
    if (st.source === 'timelapse') return st.picks.lapse || [];
    return st.uploads;
  }
  function build() {
    if (!st) return null;
    const imgs = imagesNow(), tpl = SC().template(st.source === 'upload' ? (imgs.length > 1 ? 'timelapse' : 'shots') : st.source, st.aspect);
    const o = SC().options({ hook: st.hook, end: st.end, ...(st.source === 'app' ? { screens: imgs } : { images: imgs }) });
    const d = K().make(tpl, { ...o, accent: brandAccent() });
    d.name = `${(st.info && st.info.name) || T('My project')} · ${T('clip')}`;
    return d;
  }
  function brandAccent() { const b = window.TribeBrandKit && window.TribeBrandKit.cached && window.TribeBrandKit.cached(st && st.pid); return (b && b.colors && b.colors.accent) || undefined; }

  // ---------- the live preview ----------
  async function rebuild() {
    if (!st) return;
    st.doc = build(); if (!st.doc) return;
    try { await K().load(st.doc); } catch {}
    const cv = $('#shc-cv', st.sheet.el), d = st.doc, s = 240 / d.size.w; cv.width = 240; cv.height = Math.round(d.size.h * s);
    const note = $('#shc-pv-note', st.sheet.el); note.textContent = F('{a} · {s} seconds', { a: d.aspect, s: Math.round(K().duration(d)) });
    cancelAnimationFrame(st.raf);
    const g = cv.getContext('2d'), dur = K().duration(d), t0 = performance.now();
    const paint = tt => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.scale(s, s); K().draw(g, d, tt, {}); };
    if (reduced() || navigator.webdriver) { paint(dur * 0.4); return; }
    const loop = now => { if (!st || st.doc !== d) return; paint(((now - t0) / 1000) % dur); st.raf = requestAnimationFrame(loop); };
    st.raf = requestAnimationFrame(loop);
  }

  // ---------- captions ----------
  function refreshCaps() { if (!st || !st.info) return; const keep = st.caps && st.caps.edited; st.caps = keep ? st.caps : { ...SC().captions({ ...st.info, credit: st.end }) }; showCap(st.platform); }
  function showCap(p) {
    if (!st) return; st.platform = p;
    $$('[data-plat]', st.sheet.el).forEach(b => b.setAttribute('aria-selected', String(b.dataset.plat === p)));
    const ta = $('#shc-cap', st.sheet.el); ta.value = (st.caps && st.caps[p]) || ''; counter();
  }
  function counter() {
    const r = SC().check(st.platform, $('#shc-cap', st.sheet.el).value);
    const c = $('#shc-count', st.sheet.el); c.textContent = `${r.len} / ${r.max}`; c.classList.toggle('shc-over', r.over);
    $('#shc-probs', st.sheet.el).textContent = r.problems.map(T).join(' · ');
  }
  async function copy() {
    const t = $('#shc-cap', st.sheet.el).value;
    try { await navigator.clipboard.writeText(t); toast(T('Caption copied')); } catch { const ta = $('#shc-cap', st.sheet.el); ta.select(); document.execCommand && document.execCommand('copy'); toast(T('Caption copied')); }
  }
  async function better() {
    const A = window.TribeAIBasics, b = $('#shc-better', st.sheet.el); if (!A || !A.ask) return;
    b.disabled = true; const was = b.textContent; b.textContent = T('Working…');
    try {
      const r = await A.ask('share.caption', { ...st.info, endCard: st.end }, st.caps);
      const j = r && r.text ? JSON.parse(String(r.text).replace(/^[^{]*/, '').replace(/[^}]*$/, '')) : null;
      if (j && st) { for (const k of ['x', 'tiktok', 'instagram']) if (typeof j[k] === 'string' && j[k].trim()) st.caps[k] = j[k].trim(); st.caps.edited = true; showCap(st.platform); toast(T('Better wording is in. Edit anything you like.')); }
      else toast(T('The AI did not answer. The drafts are still here.'));
    } catch { toast(T('The AI did not answer. The drafts are still here.')); }
    finally { if (b.isConnected) { b.disabled = false; b.textContent = was; } }
  }

  // ---------- open it in Motion Studio, the one place that renders and exports ----------
  async function go() {
    if (!st) return;
    if (!imagesNow().length && st.source !== 'app') return toast(T('Pick or add a picture first.'));
    const M = window.TribeMotionStudio; if (!M || !M.open) return toast(T('Motion Studio did not load. Reload the app.'));
    const doc = build(), pid = st.pid; st.sheet.close();
    await M.open({ doc, pid: connected() ? pid : '' });
    toast(T('Your clip is open. Press Export to save it as a video.'));
  }

  // ---------- the tribe's suggestions: a clip when screens changed today ----------
  const today = () => new Date().toISOString().slice(0, 10);
  const suggestProvider = { id: 'share', title: 'Share',
    async gather(ctx) { const pid = ctx && ctx.projectId; if (!pid || !connected()) return null; return { shots: await visuals(pid) }; },
    async suggest(ctx, g) {
      if (!g || !g.shots) return [];
      const fresh = g.shots.filter(s => String(s.latest.at || '').slice(0, 10) === today()); if (!fresh.length) return [];
      const who = id => (((C.state && C.state().members) || []).find(m => m.id === id) || {}).name || '';
      return [{ id: 'share-today-' + today(), title: "Make a clip of today's changes", why: F('{n} screens got a new picture today. A short clip shows the progress.', { n: fresh.length }),
        from: fresh.slice(0, 3).map(s => ({ kind: 'visual', ref: s.slug, who: who(s.latest.by) || s.name })),
        async apply() { await open({ pid: ctx.projectId, source: fresh.some(s => (s.count || 0) > 1) ? 'timelapse' : 'shots' }); return () => close(); } }];
    } };
  function registerSuggest() { const S = window.TribeSuggest; if (S && typeof S.register === 'function' && !registerSuggest.done) { registerSuggest.done = true; try { S.register(suggestProvider); } catch {} } }
  registerSuggest(); document.addEventListener('tribe:suggest-ready', registerSuggest);

  window.TribeShareClip = { open, close, state, build, captions: () => st && st.caps, suggestProvider };
})();
