// Look: customize the tribe, a project and your own view (Settings › Look, the project menu's Customize, Ctrl K).
//   Tribe (host and builders): accent, background (none · flat pattern · solid tint · your picture, dimmed), name
//     (host), emoji or icon, density, font size.
//   This project: a theme override and a banner on the Dashboard.
//   Just me (this device): your own accent, background, density and font size, and whether project themes apply.
// The accent is the theme's highlight (--accent-2 / --live). Ember stays the brand and the burnt-rust primary button
// stays the main action. Legibility is computed, not guessed: the tribe accent is nudged per theme until it reaches
// 3:1 on the canvas, surface and main pane (and 4.5:1 as text); a personal accent or tint that fails on the theme you
// use is refused with a short reason; pictures are dimmed until body text keeps 4.5:1 against their brightest and
// darkest spots. Server: server/look.js (/api/look). Personal settings: TribeStore `look`.
//   window.TribeLook = { open(tab), apply(), state(), check(kind, value) }
(function () {
  'use strict';
  const C = window.TribeClient, S = window.TribeStore, $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const PJ = () => window.TribeProjects, T = () => window.TribeThemes;

  // ---------- color math (same as server/look.js) ----------
  const okHex = c => /^#[0-9a-fA-F]{6}$/.test(String(c || '').trim());
  const rgbOf = v => { v = String(v || '').trim(); if (okHex(v)) return [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16)); const m = v.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map(Number) : [0, 0, 0]; };
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lumA = a => { const [r, g, b] = a.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const lum = c => lumA(rgbOf(c));
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const worst = (c, bgs) => Math.min(...bgs.map(b => ratio(c, b)));
  function reach(c, bgs, min, to) { let out = c; for (let t = 0; t <= 1.0001 && worst(out, bgs) < min; t += 0.04) out = mix(c, to, t); return out; }

  // ---------- state ----------
  let server = null;   // GET /api/look
  const mine = () => Object.assign({ accent: null, bg: null, density: '', fontSize: '', projectThemes: true }, S.get().look || {});
  const setMine = patch => { S.set({ look: { ...mine(), ...patch } }); apply(); };
  const tribeLook = () => (server && server.look && server.look.tribe) || {};
  const projLook = pid => (server && server.look && server.look.projects && server.look.projects[pid]) || {};
  const curPid = () => (document.body.dataset.view === 'hub' ? '' : (PJ() && PJ().current && PJ().current()) || '');
  async function load() {
    if (!C || !C.connected || !C.connected()) return;
    try { server = await C.api('/look'); } catch { return; }
    const st = C.state(); if (st.tribe && server.look.tribe.name && st.tribe.name !== server.look.tribe.name) { st.tribe.name = server.look.tribe.name; window.TribeApp && window.TribeApp.refresh && window.TribeApp.refresh(); }
    const want = projectTheme() || (T() && T().resolve(S.get()));
    if (want && document.body.dataset.theme !== want) reTheme();
    apply(); if (isOpen()) draw();
  }

  // The theme's own colors (what our overrides sit on).
  function themeColors() {
    const cs = getComputedStyle(document.body), v = k => (cs.getPropertyValue(k) || '').trim();
    return { canvas: v('--canvas') || '#12151A', surface: v('--surface') || '#1B2028', main: v('--main') || v('--canvas') || '#161A20', text: v('--text') || '#F8FAFC', muted: v('--muted') || '#D4DBE5', faint: v('--faint') || '#A3AEBD', light: document.body.classList.contains('light') };
  }
  let baseMain = null;   // --main before a tint replaced it

  // '' if the combination reads well on the current theme, else the reason (used for personal choices and the test).
  function check(kind, value, tc = themeColors()) {
    if (kind === 'accent') {
      if (!okHex(value)) return 'Pick a color like #38C6B1.';
      const w = worst(value, [tc.canvas, tc.surface, baseMain || tc.main]);
      if (w < 3) return `That color is hard to see on this theme (${w.toFixed(1)}:1, needs 3:1). Try a ${tc.light ? 'darker' : 'lighter'} one.`;
      return '';
    }
    if (kind === 'tint') {
      const bg = tintColor(value, tc); if (!bg) return 'Unknown tint.';
      const w = Math.min(ratio(tc.text, bg), ratio(tc.muted, bg), ratio(tc.faint, bg));
      return w < 4.5 ? `Text would be hard to read on that tint (${w.toFixed(1)}:1, needs 4.5:1).` : '';
    }
    return '';
  }
  const tintColor = (id, tc) => { const h = server && server.tints && server.tints[id]; return h ? mix(baseMain || tc.main, h, tc.light ? 0.10 : 0.08) : null; };

  // Flat SVG tiles for the pattern backgrounds (one stroke color, low contrast, no gradients).
  function patternUrl(id, c) {
    const svg = {
      stars: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><g fill="${c}"><rect x="10" y="14" width="2" height="2"/><rect x="58" y="8" width="2" height="2"/><rect x="80" y="40" width="2" height="2"/><rect x="34" y="52" width="2" height="2"/><rect x="66" y="78" width="2" height="2"/><rect x="14" y="80" width="2" height="2"/><path d="M44 22h2v2h2v2h-2v2h-2v-2h-2v-2h2z"/></g></svg>`,
      dots: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="1.3" fill="${c}"/></svg>`,
      grid: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M32 0H0v32" fill="none" stroke="${c}" stroke-width="1"/></svg>`,
      topo: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><g fill="none" stroke="${c}" stroke-width="1"><path d="M-10 40c40-20 70 20 110 0s70-30 110-5"/><path d="M-10 70c45-22 75 18 115-2s65-28 105-6"/><path d="M-10 120c35-14 80 26 120 4s60-30 100-8"/><path d="M-10 160c50-20 70 22 110 2s70-26 110-4"/><ellipse cx="150" cy="96" rx="22" ry="12"/></g></svg>`,
    }[id];
    return svg ? `url("data:image/svg+xml,${encodeURIComponent(svg)}")` : '';
  }
  // A picture dimmed toward the main pane color until text reads well on it. Cached per picture + theme.
  const dimCache = new Map();
  function dimmed(src, dim, tc) {
    const key = src.length + ':' + src.slice(-40) + ':' + dim + ':' + tc.main + tc.muted;
    if (dimCache.has(key)) return dimCache.get(key);
    const job = new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const w = Math.min(1600, img.naturalWidth || 1600), h = Math.round(w * (img.naturalHeight || 1000) / (img.naturalWidth || 1600));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
        const [r, g, b] = rgbOf(baseMain || tc.main);
        for (let d = dim; d <= 0.985; d += 0.03) {
          x.globalAlpha = 1; x.drawImage(img, 0, 0, w, h); x.fillStyle = `rgba(${r},${g},${b},${d.toFixed(3)})`; x.fillRect(0, 0, w, h);
          let lo = 1, hi = 0; try { const px = x.getImageData(0, 0, w, h).data, step = Math.max(4, Math.floor(w * h / 6000)) * 4; for (let i = 0; i < px.length; i += step) { const l = lumA([px[i], px[i + 1], px[i + 2]]); if (l < lo) lo = l; if (l > hi) hi = l; } } catch { lo = hi = lum(tc.main); }
          const con = c => Math.min(...[lo, hi].map(l => { const a = lum(c); return (Math.max(a, l) + 0.05) / (Math.min(a, l) + 0.05); }));
          if (Math.min(con(tc.text), con(tc.muted)) >= 4.5 || d > 0.95) { resolve({ url: cv.toDataURL('image/jpeg', 0.82), dim: d }); return; }
        }
        resolve({ url: cv.toDataURL('image/jpeg', 0.82), dim: 0.98 });
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    dimCache.set(key, job); return job;
  }

  // ---------- apply ----------
  let applyGen = 0;
  function effective() {
    const t = tribeLook(), m = mine();
    return { accent: m.accent || t.accent || null, accentMine: !!m.accent, bg: m.bg || t.bg || { kind: 'none' }, bgMine: !!m.bg, density: m.density || t.density || '', densityMine: !!m.density, fontSize: m.fontSize || t.fontSize || '', emoji: t.emoji || '', icon: t.icon || '' };
  }
  function styleEl() { let s = $('#lk-style'); if (!s) { s = document.createElement('style'); s.id = 'lk-style'; document.head.appendChild(s); } return s; }
  async function apply() {
    if (!document.body) return;
    const my = ++applyGen;
    {
      const b = document.body, e = effective(), css = [];
      // read the theme's own colors (a tint replaces --main: switch it off for the reading; the accent touches none of these)
      const hadTint = b.dataset.lkTint; delete b.dataset.lkTint;
      const tc = themeColors(); baseMain = tc.main;
      if (hadTint) b.dataset.lkTint = hadTint;
      const set = { acc: null, bg: null, tint: null };
      if (e.accent && okHex(e.accent)) {
        const bgs = [tc.canvas, tc.surface, tc.main], toward = tc.light ? '#000000' : '#FFFFFF';
        const fail = e.accentMine ? check('accent', e.accent, tc) : '';
        if (!fail) {
          const acc = reach(e.accent, bgs, 3, toward), ink = reach(e.accent, [tc.surface, tc.main, tc.canvas], 4.5, toward);
          const on = ratio(acc, '#000000') >= ratio(acc, '#FFFFFF') ? '#0B0D10' : '#FFFFFF', [r, g, bb] = rgbOf(acc);
          css.push(`html body[data-lk-acc][data-theme], html body[data-lk-acc] { --accent-2: ${acc}; --live: ${acc}; --live-ink: ${ink}; --live-tint: rgba(${r},${g},${bb},0.16); --on-live: ${on}; }`);
          set.acc = acc;
        }
      }
      const bg = e.bg || { kind: 'none' };
      if (bg.kind === 'tint' && !(e.bgMine && check('tint', bg.id, tc))) {
        const t = tintColor(bg.id, tc); if (t) { css.push(`html body[data-lk-tint][data-theme], html body[data-lk-tint] { --main: ${t}; }`); set.tint = bg.id; }
      } else if (bg.kind === 'pattern') {
        const u = patternUrl(bg.id, mix(tc.main, tc.text, tc.light ? 0.12 : 0.09));
        if (u) { css.push(`html body[data-lk-bg] .main { background-color: var(--main); background-image: ${u}; background-attachment: local; } html body[data-lk-bg] .composer-dock { background: transparent; }`); set.bg = 'pattern:' + bg.id; }
      } else if (bg.kind === 'image' && bg.image) {
        const d = await dimmed(bg.image, Math.max(server ? server.minDim || 0.72 : 0.72, Number(bg.dim) || 0.85), tc);
        if (my !== applyGen) return;
        if (d) { css.push(`html body[data-lk-bg] .main { background-color: var(--main); background-image: url("${d.url}"); background-size: cover; background-position: center; } html body[data-lk-bg] .composer-dock { background: transparent; }`); set.bg = 'image'; b.dataset.lkDim = d.dim.toFixed(2); }
      }
      // the tribe's emoji or icon before its name
      if (e.icon) css.push(`#ws-name::before { content: ''; display: inline-block; width: 16px; height: 16px; margin-right: 7px; vertical-align: -3px; border-radius: 4px; background: url("${e.icon}") center / cover; }`);
      else if (e.emoji) css.push(`#ws-name::before { content: ${JSON.stringify(e.emoji)}; margin-right: 6px; }`);
      if (my !== applyGen) return;
      styleEl().textContent = css.join('\n');
      for (const [k, v] of [['lkAcc', set.acc], ['lkBg', set.bg], ['lkTint', set.tint]]) { if (v) b.dataset[k] = v; else delete b.dataset[k]; }
      if (document.documentElement.dataset.fs !== (e.fontSize && e.fontSize !== 'm' ? e.fontSize : '')) document.documentElement.dataset.fs = e.fontSize && e.fontSize !== 'm' ? e.fontSize : '';
      const want = e.density ? (e.density === 'compact' ? 'compact' : 'comfortable') : null;
      if (want && S.get().density !== want) S.set({ density: want });
      b.classList.toggle('compact', S.get().density === 'compact');
      banner();
    }
  }

  // ---------- the project theme ----------
  function projectTheme() {
    const pid = curPid(); if (!pid || mine().projectThemes === false) return '';
    const id = projLook(pid).theme; return id && T() && T().byId(id) ? id : '';
  }
  function patchThemes() {
    const th = T(); if (!th || th._lk) return; th._lk = true;
    const orig = th.apply;
    th.apply = arg => { const id = projectTheme(); const out = orig(id || arg); return out; };
  }
  function reTheme() { patchThemes(); if (window.TribeApp && window.TribeApp.applyTheme) window.TribeApp.applyTheme(); else if (T()) T().apply(S.get()); }

  // ---------- the Dashboard banner ----------
  // The cover: a solid palette color, a flat pattern on a color, your picture, or the GitHub repo's social preview
  // (fetched and cached by the host, server/look.js). Host and builders get a small "Change cover" button on hover.
  function coverStyle(c) {
    if (!c) return '';
    if (c.kind === 'color') return `background:${c.hex}`;
    if (c.kind === 'pattern') return `background-color:${c.hex};background-image:${patternUrl(c.id, lum(c.hex) > 0.35 ? mix(c.hex, '#000000', 0.25) : mix(c.hex, '#FFFFFF', 0.3))};background-size:auto`;
    if (c.image) return `background-image:url("${c.image}")`;
    return '';
  }
  function banner() {
    const ov = $('#pj-overview'); if (!ov) return;
    const pid = curPid(), c = pid && projLook(pid).cover, cur = ov.querySelector('.lk-banner'), can = !!(server && server.canEdit);
    const style = coverStyle(c), key = style.length + ':' + style.slice(-60) + can;
    if (!style) { if (cur) cur.remove(); return; }
    if (cur && cur.dataset.key === key) return;
    if (cur) cur.remove();
    const el = document.createElement('div'); el.className = `lk-banner k-${c.kind}`; el.dataset.key = key; el.setAttribute('role', 'img'); el.setAttribute('aria-label', c.kind === 'github' ? `GitHub preview of ${c.repo || 'the repo'}` : 'Project cover');
    el.setAttribute('style', style);
    if (can) { el.innerHTML = '<button class="lk-cover-btn" id="lk-cover-btn" type="button">Change cover</button>'; el.querySelector('button').onclick = e => { e.stopPropagation(); open('project'); }; }
    ov.insertBefore(el, ov.firstChild);
  }
  new MutationObserver(() => { const ov = $('#pj-overview'); if (ov && !ov.querySelector('.lk-banner') && curPid() && projLook(curPid()).cover) banner(); }).observe(document.body, { childList: true, subtree: true });

  // ---------- images in ----------
  function pickImage(max, cb, type = 'image/jpeg') {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp';
    i.onchange = () => { const f = i.files && i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => shrink(r.result, max, type).then(cb).catch(() => toast('That picture did not load')); r.readAsDataURL(f); };
    i.click();
  }
  function shrink(src, max, type) {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); res(cv.toDataURL(type, 0.84)); }; img.onerror = rej; img.src = src; });
  }

  // ---------- the panel ----------
  let tab = 'tribe', warn = '';
  const modal = () => $('#look-modal');
  const isOpen = () => !!(modal() && !modal().classList.contains('hidden'));
  function open(which) {
    if (!modal()) {
      document.body.insertAdjacentHTML('beforeend', '<div class="modal hidden" id="look-modal" role="dialog" aria-label="Customize"><div class="modal-card lk-card" id="look-body"></div></div>');
      modal().addEventListener('click', e => { if (e.target === modal()) close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(); });
    }
    tab = which === 'project' && curPid() ? 'project' : which === 'me' ? 'me' : which === 'project' ? 'tribe' : (which || 'tribe');
    warn = ''; modal().classList.remove('hidden'); draw(); load();
  }
  function close() { modal().classList.add('hidden'); }
  const isHost = () => ((C.state() || {}).me || {}).role === 'host';
  function swatches(cur, attr, withNone, noneLabel) {
    const pal = (server && server.palette) || [];
    return `<div class="lk-sw" role="radiogroup">${withNone ? `<button class="lk-chip ${!cur ? 'on' : ''}" ${attr}="" role="radio" aria-checked="${!cur}">${esc(noneLabel)}</button>` : ''}${pal.map(p => `<button class="lk-dot ${cur && cur.toUpperCase() === p.hex ? 'on' : ''}" ${attr}="${p.hex}" role="radio" aria-checked="${!!cur && cur.toUpperCase() === p.hex}" title="${esc(p.name)}" aria-label="${esc(p.name)}" style="--c:${p.hex}"></button>`).join('')}
      <label class="lk-custom" title="Custom color"><input type="color" ${attr}-custom value="${cur && okHex(cur) ? cur : '#38C6B1'}" aria-label="Custom color"><span>Custom</span></label></div>`;
  }
  function bgPicker(cur, attr, withNone, noneLabel, canImg) {
    const t = cur || { kind: 'none' }, tc = themeColors();
    const pat = id => `<button class="lk-tile ${t.kind === 'pattern' && t.id === id ? 'on' : ''}" ${attr}="pattern:${id}" aria-label="${id} pattern" style="background-color:${tc.main};background-image:${esc(patternUrl(id, mix(tc.main, tc.text, 0.22)))};background-size:auto"><span>${id}</span></button>`;
    const tint = (id, h) => `<button class="lk-tile ${t.kind === 'tint' && t.id === id ? 'on' : ''}" ${attr}="tint:${id}" aria-label="${id} tint" style="background:${mix(baseMain || tc.main, h, tc.light ? 0.10 : 0.08)}"><i style="background:${h}"></i><span>${id}</span></button>`;
    return `<div class="lk-tiles">${withNone ? `<button class="lk-tile ${!cur ? 'on' : ''}" ${attr}="" aria-label="${esc(noneLabel)}"><span>${esc(noneLabel)}</span></button>` : ''}
      <button class="lk-tile ${t.kind === 'none' && cur ? 'on' : ''}" ${attr}="none" aria-label="Plain"><span>Plain</span></button>
      ${((server && server.patterns) || []).map(pat).join('')}${Object.entries((server && server.tints) || {}).map(([id, h]) => tint(id, h)).join('')}
      ${canImg ? `<button class="lk-tile lk-img ${t.kind === 'image' ? 'on' : ''}" ${attr}="image" aria-label="Your picture" ${t.kind === 'image' && t.image ? `style="background-image:url('${t.image}')"` : ''}><span>${t.kind === 'image' ? 'Picture' : '+ Picture'}</span></button>` : ''}</div>
      ${t.kind === 'image' ? `<label class="lk-dim"><span>Dim</span><input type="range" min="${Math.round(((server && server.minDim) || 0.72) * 100)}" max="97" value="${Math.round((t.dim || 0.85) * 100)}" ${attr}-dim aria-label="Dim the picture"><b>${Math.round((t.dim || 0.85) * 100)}%</b></label>` : ''}`;
  }
  function coverPicker(pid, c, p) {
    const pal = [...new Set([...(p && p.color ? [String(p.color).toUpperCase()] : []), '#F26B1D', ...((server && server.palette) || []).map(x => x.hex), '#2A313C'])];
    const base = c && (c.kind === 'color' || c.kind === 'pattern') ? c.hex : pal[0];
    const gh = server && server.github && server.github[pid];
    return `<div class="lk-ban">${c ? `<div class="lk-ban-pv" style="${esc(coverStyle(c))}" role="img" aria-label="Current cover"></div>` : ''}
      <span class="wb-lbl">Color</span><div class="lk-sw">${pal.map(h => `<button class="lk-dot ${c && c.kind === 'color' && c.hex === h ? 'on' : ''}" data-cov="color:${h}" aria-label="Color ${h}" style="--c:${h}"></button>`).join('')}</div>
      <span class="wb-lbl">Pattern</span><div class="lk-tiles">${((server && server.patterns) || []).map(id => `<button class="lk-tile ${c && c.kind === 'pattern' && c.id === id ? 'on' : ''}" data-cov="pattern:${id}:${base}" aria-label="${id} pattern" style="${esc(coverStyle({ kind: 'pattern', id, hex: base }))}"><span>${id}</span></button>`).join('')}</div>
      <div class="wb-acts"><button class="btn" id="lk-ban">${c && c.kind === 'image' ? 'Change picture' : 'Upload picture'}</button>${gh ? `<button class="btn ${c && c.kind === 'github' ? 'on' : ''}" id="lk-gh" title="${esc(gh)}">${c && c.kind === 'github' ? 'Refresh GitHub preview' : 'Use the GitHub preview'}</button>` : ''}${c ? '<button class="linkish" id="lk-ban-x">Remove</button>' : ''}</div></div>`;
  }
  const seg = (cur, attr, opts) => `<div class="lk-seg" role="radiogroup">${opts.map(([v, l]) => `<button class="${(cur || '') === v ? 'on' : ''}" ${attr}="${v}" role="radio" aria-checked="${(cur || '') === v}">${esc(l)}</button>`).join('')}</div>`;
  const block = (eyebrow, title, body, note = '') => `<section class="lk-sec"><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3>${note ? `<p class="lk-note">${note}</p>` : ''}${body}</section>`;
  function draw() {
    const box = $('#look-body'); if (!box || !isOpen()) return;
    const t = tribeLook(), can = !!(server && server.canEdit), pid = curPid(), p = pid && PJ() && PJ().cur ? PJ().cur() : null, pl = pid ? projLook(pid) : {}, m = mine();
    const tabs = [['tribe', 'Tribe'], ...(pid ? [['project', p ? p.name : 'This project']] : []), ['me', 'Just me']];
    let body = '';
    if (!server) body = '<p class="lk-note">Loading…</p>';
    else if (tab === 'tribe') body = (can ? '' : '<p class="lk-note">The host and builders set the tribe\'s look. You can still pick your own under Just me.</p>') + `<fieldset ${can ? '' : 'disabled'} class="lk-fs">
      ${block('Identity', 'Name and icon', `<div class="lk-id">${isHost() ? `<input class="input" id="lk-name" maxlength="48" value="${esc(t.name || '')}" aria-label="Tribe name">` : `<b class="lk-tname">${esc(t.name || '')}</b>`}
        <input class="input lk-emoji" id="lk-emoji" maxlength="4" value="${esc(t.emoji || '')}" placeholder="🔥" aria-label="Tribe emoji">
        <button class="btn" id="lk-icon">${t.icon ? 'Change icon' : 'Upload icon'}</button>${t.icon ? '<button class="linkish" id="lk-icon-x">Remove</button>' : ''}</div>`)}
      ${block('Accent', 'Highlight color', swatches(t.accent, 'data-tacc', true, 'Theme default'), 'Live dots, switches and highlights. The orange brand and the main buttons stay as they are.')}
      ${block('Background', 'Behind the main pane', bgPicker(t.bg && t.bg.kind !== 'none' ? t.bg : { kind: 'none' }, 'data-tbg', false, '', true))}
      ${block('Density', 'Spacing', seg(t.density || 'cozy', 'data-tden', [['cozy', 'Cozy'], ['compact', 'Compact']]))}
      ${block('Text', 'Font size', seg(t.fontSize || 'm', 'data-tfs', [['s', 'Small'], ['m', 'Default'], ['l', 'Large'], ['xl', 'Larger']]))}</fieldset>`;
    else if (tab === 'project') body = (can ? '' : '<p class="lk-note">The host and builders set a project\'s look.</p>') + `<fieldset ${can ? '' : 'disabled'} class="lk-fs">
      ${block('Theme', `Theme for ${p ? p.name : 'this project'}`, `<div class="lk-themes" role="radiogroup"><button class="lk-chip ${!pl.theme ? 'on' : ''}" data-pth="" role="radio" aria-checked="${!pl.theme}">Everyone's own</button>${(T() ? T().list : []).map(x => `<button class="lk-th ${pl.theme === x.id ? 'on' : ''}" data-pth="${x.id}" role="radio" aria-checked="${pl.theme === x.id}" title="${esc(x.name)}"><span class="th-sw" aria-hidden="true"><i style="background:${x.sw[0]}"></i><i style="background:${x.sw[1]}"></i><b style="background:${x.sw[2]}"></b></span><span>${esc(x.name)}</span></button>`).join('')}</div>`, 'Applies while you are in this project. Anyone can opt out under Just me.')}
      ${block('Cover', 'Cover above the Dashboard', coverPicker(pid, pl.cover, p), 'A color, a pattern, a wide picture (about 5:1) or your GitHub repo\'s preview.')}</fieldset>`;
    else body = `${block('Accent', 'My highlight color', swatches(m.accent, 'data-macc', true, 'Use the tribe\'s'))}
      ${block('Background', 'My background', bgPicker(m.bg, 'data-mbg', true, 'Use the tribe\'s', true))}
      ${block('Density', 'My spacing', seg(m.density, 'data-mden', [['', 'Tribe\'s'], ['cozy', 'Cozy'], ['compact', 'Compact']]))}
      ${block('Text', 'My font size', seg(m.fontSize, 'data-mfs', [['', 'Tribe\'s'], ['s', 'Small'], ['m', 'Default'], ['l', 'Large'], ['xl', 'Larger']]))}
      ${block('Projects', 'Project themes', `<button class="toggle set-toggle" role="switch" id="lk-pth" aria-checked="${m.projectThemes !== false}" aria-label="Use project themes"><span>Use a project's theme while I'm in it</span><span class="switch"></span></button>`)}`;
    box.innerHTML = `<header class="set-head lk-head"><h2>Customize</h2><button class="btn ghost" id="lk-close" aria-label="Close">Done</button></header>
      <div class="lk-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="lk-tab ${tab === k ? 'on' : ''}" aria-selected="${tab === k}" data-ltab="${k}">${esc(l)}</button>`).join('')}</div>
      <p class="lk-warn ${warn ? '' : 'hidden'}" id="lk-warn" role="alert">${esc(warn)}</p>
      <div class="lk-body">${body}</div>`;
    wire(box);
  }
  async function putTribe(patch) {
    try { server = await C.api('/look', { method: 'PUT', body: { tribe: patch } }); warn = ''; apply(); draw(); return true; }
    catch (e) { warn = e.message; draw(); return false; }
  }
  async function putProject(patch) {
    try { server = await C.api('/look', { method: 'PUT', body: { project: { id: curPid(), ...patch } } }); warn = ''; reTheme(); apply(); draw(); return true; }
    catch (e) { warn = e.message; draw(); return false; }
  }
  function mineAccent(v) { const why = v ? check('accent', v) : ''; if (why) { warn = why; draw(); return false; } warn = ''; setMine({ accent: v || null }); draw(); return true; }
  function mineBg(v) {
    if (v && v.kind === 'tint') { const why = check('tint', v.id); if (why) { warn = why; draw(); return false; } }
    warn = ''; setMine({ bg: v }); draw(); return true;
  }
  const parseBg = (v, cur) => (v === '' ? null : v === 'none' ? { kind: 'none' } : v.startsWith('pattern:') ? { kind: 'pattern', id: v.slice(8) } : v.startsWith('tint:') ? { kind: 'tint', id: v.slice(5) } : cur);
  function wire(box) {
    const q = s => box.querySelector(s), all = (s, f) => box.querySelectorAll(s).forEach(f);
    q('#lk-close').onclick = close;
    all('[data-ltab]', b => b.onclick = () => { tab = b.dataset.ltab; warn = ''; draw(); });
    // tribe
    const nm = q('#lk-name'); if (nm) nm.onchange = () => putTribe({ name: nm.value });
    const em = q('#lk-emoji'); if (em) em.onchange = () => putTribe({ emoji: em.value });
    const ic = q('#lk-icon'); if (ic) ic.onclick = () => pickImage(128, src => putTribe({ icon: src }), 'image/png');
    const icx = q('#lk-icon-x'); if (icx) icx.onclick = () => putTribe({ icon: '' });
    all('[data-tacc]', b => b.onclick = () => putTribe({ accent: b.dataset.tacc || null }));
    const tcu = q('[data-tacc-custom]'); if (tcu) tcu.onchange = () => putTribe({ accent: tcu.value });
    all('[data-tbg]', b => b.onclick = () => { const v = b.dataset.tbg; if (v === 'image') return pickImage(1600, src => putTribe({ bg: { kind: 'image', image: src, dim: 0.85 } })); putTribe({ bg: parseBg(v) || { kind: 'none' } }); });
    const tdim = q('[data-tbg-dim]'); if (tdim) { tdim.oninput = () => { tdim.nextElementSibling.textContent = tdim.value + '%'; }; tdim.onchange = () => putTribe({ bg: { kind: 'image', dim: tdim.value / 100 } }); }
    all('[data-tden]', b => b.onclick = () => putTribe({ density: b.dataset.tden }));
    all('[data-tfs]', b => b.onclick = () => putTribe({ fontSize: b.dataset.tfs }));
    // project
    all('[data-pth]', b => b.onclick = () => putProject({ theme: b.dataset.pth }));
    const bn = q('#lk-ban'); if (bn) bn.onclick = () => pickImage(1800, src => putProject({ cover: { kind: 'image', image: src } }));
    const bnx = q('#lk-ban-x'); if (bnx) bnx.onclick = () => putProject({ cover: null });
    const gh = q('#lk-gh'); if (gh) gh.onclick = async () => { gh.disabled = true; gh.textContent = 'Getting the preview…'; await putProject({ cover: { kind: 'github' } }); };
    all('[data-cov]', b => b.onclick = () => { const [k, a, h] = b.dataset.cov.split(':'); putProject({ cover: k === 'color' ? { kind: 'color', hex: a } : { kind: 'pattern', id: a, hex: h } }); });
    // me
    all('[data-macc]', b => b.onclick = () => mineAccent(b.dataset.macc));
    const mcu = q('[data-macc-custom]'); if (mcu) mcu.onchange = () => mineAccent(mcu.value.toUpperCase());
    all('[data-mbg]', b => b.onclick = () => { const v = b.dataset.mbg; if (v === 'image') return pickImage(1600, src => mineBg({ kind: 'image', image: src, dim: 0.85 })); mineBg(parseBg(v, mine().bg)); });
    const mdim = q('[data-mbg-dim]'); if (mdim) { mdim.oninput = () => { mdim.nextElementSibling.textContent = mdim.value + '%'; }; mdim.onchange = () => mineBg({ ...mine().bg, dim: mdim.value / 100 }); }
    all('[data-mden]', b => b.onclick = () => { setMine({ density: b.dataset.mden }); if (b.dataset.mden) S.set({ density: b.dataset.mden === 'compact' ? 'compact' : 'comfortable' }); apply(); draw(); });
    all('[data-mfs]', b => b.onclick = () => { setMine({ fontSize: b.dataset.mfs }); draw(); });
    const pth = q('#lk-pth'); if (pth) pth.onclick = () => { setMine({ projectThemes: mine().projectThemes === false }); reTheme(); apply(); draw(); };
  }

  // ---------- wiring ----------
  patchThemes();
  if (C && C.on) {
    C.on('hello', () => load());
    C.on('ws', m => { if (m && m.type === 'look') load(); });
    C.on('project', () => setTimeout(() => { reTheme(); apply(); }, 0));
    C.on('status', () => { if (!server) load(); });
    // the hello can arrive before this script runs
    const first = () => { if (server) return; if (C.connected && C.connected()) load(); else setTimeout(first, 400); };
    setTimeout(first, 0);
  }
  new MutationObserver(muts => { if (muts.some(x => x.attributeName === 'data-theme' || x.attributeName === 'data-view')) { if (muts.some(x => x.attributeName === 'data-view')) { const want = projectTheme() || T() && T().resolve(S.get()); if (want && document.body.dataset.theme !== want) return reTheme(); } apply(); } })
    .observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'data-view'] });
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [{ kind: 'Action', label: 'Customize the look', keys: 'customize look theme background accent banner density font', icon: 'i-sparkle', run: () => open('tribe') }]);
  window.TribeLook = { open, apply, load, state: () => ({ server, mine: mine(), effective: effective() }), check };
})();
