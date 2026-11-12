// Flint on the design canvas (P1-F, docs/EDITOR-PARITY.md). A prompt bar above the canvas toolbar:
//   "make a login screen for Ember", "a pricing section", "a mobile home for a café", "a dashboard in dark mode"
//   -> a real frame from a template (templates/canvas/*.json), names, words and colors filled in from what you said;
//   with something selected: "dark mode version", "make variants", "tidy up" (auto layout, even spacing), "rename layers".
// Free: no model. The server plans the change (server/canvasai.js); it lands here as your own change, so Ctrl Z undoes it
// and everyone sees it live. Freeform asks get an honest card: send it to your AI helper (it has canvas tools) or, when
// the tribe has one, try the tribe's AI in Flint's chat. Flint's flier (app/ui/flintfly.js) flies to the frame he edits.
//   window.TribeCanvasFlint = { mount(E), ask(text), open(), close(), run(text) -> { r, pairs }, sendToHelpers(text), use(hook) }
// The Flint pane (flintpane.js) is the one place to talk to Flint on the canvas: it registers a hook with use(), and
// the toolbar's flame button and Shift I open the pane instead of this bar.
(function () {
  'use strict';
  const C = window.TribeClient;
  let E = null, bar = null, busy = false, last = '', hook = null;   // hook: the Flint pane (flintpane.js) takes over opening
  const T = k => (E && E.T ? E.T(k) : k);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FF = () => window.TribeFlintFly;
  const START = ['A login screen', 'A pricing section', 'A mobile home for a café', 'A dashboard in dark mode'];
  const WITH_SEL = ['Dark mode version', 'Make variants', 'Tidy up', 'Rename layers'];

  function mount(editor) {
    E = editor;
    const tools = document.getElementById('cv-tools'), stage = document.getElementById('cv-stage');
    if (!tools || !stage || document.getElementById('cv-flint-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'cv-tool cv-flint-tool'; btn.id = 'cv-flint-btn'; btn.type = 'button';
    btn.title = T('Ask Flint to design') + ' (Shift I)'; btn.setAttribute('aria-label', T('Ask Flint to design')); btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '<img src="assets/flint.svg" alt="" width="14" height="18">';
    tools.insertBefore(btn, tools.querySelector('.cv-sep'));
    bar = document.createElement('div');
    bar.className = 'cvf'; bar.id = 'cv-flint'; bar.hidden = true;
    bar.innerHTML = `
      <div class="cvf-out" id="cvf-out" aria-live="polite" hidden></div>
      <form class="cvf-form" id="cvf-form" autocomplete="off">
        <img class="cvf-mark" src="assets/flint.svg" alt="" width="14" height="18">
        <input class="cvf-in" id="cvf-in" type="text" maxlength="400" placeholder="${esc(T('Ask Flint: a login screen for Ember, a pricing section…'))}" aria-label="${esc(T('Ask Flint to design'))}">
        <span class="cvf-free" title="${esc(T('Templates, tidy, rename, variants and themes need no AI'))}">${esc(T('Free'))}</span>
        <button class="btn sm primary cvf-go" type="submit">${esc(T('Design'))}</button>
      </form>
      <div class="cvf-chips" id="cvf-chips"></div>`;
    stage.appendChild(bar);
    if (window.TribeBoost) window.TribeBoost.bind(bar, { onAI: t => useMyAI(t) });
    btn.onclick = () => (hook ? hook.toggle() : bar.hidden ? open() : close());
    bar.querySelector('#cvf-form').addEventListener('submit', e => { e.preventDefault(); const i = bar.querySelector('#cvf-in'); const v = i.value.trim(); if (v) { i.value = ''; ask(v); } });
    bar.querySelector('#cvf-in').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    bar.addEventListener('click', e => {
      const chip = e.target.closest('[data-cvf-chip]'); if (chip) return ask(chip.dataset.cvfChip);
      const a = e.target.closest('[data-cvf]'); if (!a) return;
      if (a.dataset.cvf === 'hand') handOff(a);
      if (a.dataset.cvf === 'tribeai') { a.disabled = true; if (window.TribeFlint && window.TribeFlint.ask) { window.TribeFlint.ask(last); say(T('Asked Flint: the answer is in the Flint panel.')); } }
      if (a.dataset.cvf === 'x') out(null);
    });
    // Shift I opens the bar (the canvas keeps single letters for its tools)
    addEventListener('keydown', e => {
      if (!E || document.body.dataset.view !== 'canvas' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'i') return;
      const tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (hook) hook.open(); else open();
    }, true);
    // the chips follow what's selected
    setInterval(() => { if (bar && !bar.hidden) chips(); }, 700);
  }
  let chipKey = '';
  function chips() {
    const box = bar && bar.querySelector('#cvf-chips'); if (!box) return;
    const list = E.sel.length ? WITH_SEL : START, k = list.join('|');
    if (k === chipKey) return; chipKey = k;
    box.innerHTML = list.map(c => `<button type="button" class="cvf-chip" data-cvf-chip="${esc(c)}">${esc(T(c))}</button>`).join('');
  }
  function open() {
    if (!bar) return;
    bar.hidden = false; chipKey = ''; chips();
    const b = document.getElementById('cv-flint-btn'); if (b) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
    setTimeout(() => { const i = bar.querySelector('#cvf-in'); if (i) i.focus(); }, 20);
  }
  function close() {
    if (!bar) return;
    bar.hidden = true;
    const b = document.getElementById('cv-flint-btn'); if (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
    if (E) E.focus();
  }
  function out(html) { const o = bar && bar.querySelector('#cvf-out'); if (!o) return; if (!html) { o.hidden = true; o.innerHTML = ''; return; } o.hidden = false; o.innerHTML = html + `<button type="button" class="cvf-x" data-cvf="x" aria-label="${esc(T('Close'))}">×</button>`; }
  const say = t => out(`<p class="cvf-say"><img src="assets/flint.svg" alt="" width="11" height="14"> ${esc(t)}</p>`);

  // run one ask: plan on the server, land it as this person's change. Returns { r, pairs } (pairs = that undo step).
  // polish: a design kept on this device (localfiles.js) plans here: Flint's free screen templates first (no AI); a freeform
  // ask goes to the same AI path as every ✦ (aibasics.js ask: the tribe's AI when a server is reachable, with the cloud
  // consent, else the in-browser model); with neither, the basic answer stands.
  const COL = /^#[0-9a-fA-F]{6}$/, num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
  const nid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
  function specNodes(spec, dx) {   // the model's small JSON -> canvas nodes (validated; anything odd is dropped)
    if (!spec || typeof spec !== 'object' || !Array.isArray(spec.layers)) return null;
    const W = num(spec.w, 200, 1600, 390), H = num(spec.h, 200, 2400, 844), root = nid();
    const out = [{ id: root, t: 'frame', p: '', i: 1, v: 1, x: dx, y: 0, name: String(spec.name || 'Screen').slice(0, 60), w: W, h: H, fill: COL.test(spec.fill) ? spec.fill : '#FFFFFF', clip: true }];
    spec.layers.slice(0, 14).forEach((l, i) => {
      if (!l || (l.t !== 'text' && l.t !== 'rect')) return;
      const n = { id: nid(), t: l.t, p: root, i: i + 1, v: 1, x: num(l.x, 0, W, 0), y: num(l.y, 0, H, 0), name: String(l.name || (l.t === 'text' ? 'Text' : 'Box')).slice(0, 60), w: num(l.w, 4, W, 120), h: num(l.h, 4, H, 40) };
      if (l.t === 'rect') { n.fill = COL.test(l.fill) ? l.fill : '#EEEEEE'; if (l.r) n.r = num(l.r, 0, 200, 0); }
      else { n.tx = { c: String(l.c || '').slice(0, 400) || 'Text', f: 'Inter', s: num(l.s, 8, 96, 16), wt: [400, 500, 600, 700, 800].includes(+l.wt) ? +l.wt : 400, lh: 1.35, al: 'left', col: COL.test(l.col) ? l.col : '#16181D' }; n.sz = { h: 'fixed', v: 'hug' }; }
      out.push(n);
    });
    return out.length > 1 ? out : null;
  }
  async function localPlan(text) {
    const live = E.S && E.S.roots ? E.S.roots() : [];
    const O = window.TribeOffline;
    let r = O && O.planDesign ? await O.planDesign({ ask: text, sel: E.sel, live }) : { kind: 'freeform', why: '' };
    if (r.kind === 'build') return { ...r, say: `${r.say || 'Done.'} · Basic · no AI` };
    if (r.kind === 'none' && (E.sel || []).length) return { ...r, say: 'On this device I design new screens. Tidy up, rename layers, variants and dark versions work once the design is in a project (Move to…).' };
    const AB = window.TribeAIBasics, a = AB && AB.ask ? await AB.ask('canvas.design', { ask: text }, '') : null;
    if (a && a.text) {
      let spec = null; try { spec = JSON.parse((/\{[\s\S]*\}/.exec(a.text) || [''])[0]); } catch {}
      const dx = live.length ? Math.max(...live.map(n => (n.x || 0) + (n.w || 0))) + 120 : 0;
      const create = specNodes(spec, dx);
      if (create) return { kind: 'build', create, focus: create[0].id, say: `Designed “${create[0].name}” · ✦ via ${a.via}` };
    }
    return { ...r, kind: r.kind === 'none' ? 'none' : 'freeform', local: true, why: (r.why ? r.why + ' ' : '') + 'No AI is reachable from this device, so I can only use my free screen templates here.' };
  }
  // ---------- feat/flint-site: wire buttons to screens, pictures, dark mode in place, new screens (free, on this canvas) ----------
  // Each lands as one undo step through E.insert / E.apply. The words come from Flint's local brain (flintnlu.js):
  // canvas.wire · canvas.image · canvas.dark · canvas.page.
  const hx = h => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const v = parseInt(h.slice(0, 6), 16); return isNaN(v) ? [0, 0, 0] : [v >> 16 & 255, v >> 8 & 255, v & 255]; };
  const lumOf = h => { const c = hx(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const satOf = h => { const c = hx(h).map(v => v / 255), mx = Math.max(...c), mn = Math.min(...c); return mx === 0 ? 0 : (mx - mn) / mx; };
  const mixOf = (a, b, t) => '#' + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
  function recolor(c, parentFill, toDark) {   // the same rules as server/canvasai.js themeFn, applied in place
    if (c.t === 'text' && c.tx) {
      const L = lumOf(c.tx.col || '#16181D'), onSat = parentFill && satOf(parentFill) > 0.35 && lumOf(parentFill) < 0.6;
      if (toDark) { if (!onSat && L < 0.2) c.tx.col = '#F1F0EC'; else if (!onSat && L < 0.5 && satOf(c.tx.col) < 0.3) c.tx.col = '#9BA1AB'; }
      else { if (!onSat && L > 0.6) c.tx.col = '#16181D'; else if (!onSat && L > 0.25 && satOf(c.tx.col) < 0.3) c.tx.col = '#6B6F78'; }
      return;
    }
    if (c.fill && /^#/.test(c.fill)) {
      const L = lumOf(c.fill), sa = satOf(c.fill);
      if (toDark) { if (L > 0.9) c.fill = parentFill ? '#1A1D23' : '#111318'; else if (L > 0.5 && sa < 0.35) c.fill = '#2C3039'; else if (L > 0.5) c.fill = mixOf(c.fill, '#111318', 0.35); else if (L < 0.06) c.fill = '#22262E'; }
      else { if (L < 0.06 || (L < 0.02)) c.fill = parentFill ? '#FFFFFF' : '#FAF8F5'; else if (L < 0.3 && sa < 0.35) c.fill = '#E7E3DD'; }
    }
    if (c.stroke) { const L = lumOf(c.stroke); if (toDark && L > 0.5 && satOf(c.stroke) < 0.35) c.stroke = '#2C3039'; if (!toDark && L < 0.2 && satOf(c.stroke) < 0.35) c.stroke = '#E7E3DD'; }
  }
  const rootOf = n => { let x = n, k = 0; while (x && x.p && E.S.get(x.p) && k++ < 60) x = E.S.get(x.p); return x; };
  const frames = () => E.S.roots().filter(n => n.t === 'frame' || n.t === 'component');
  const deep = o => JSON.parse(JSON.stringify(o));
  function darkInPlace(mode) {
    const toDark = mode !== 'light';
    const tops = E.sel.length ? [...new Set(E.sel.map(id => rootOf(E.S.get(id))).filter(Boolean))] : frames();
    if (!tops.length) return { kind: 'none', say: 'There is nothing on the canvas yet. Ask for a screen first: “a login screen”.' };
    const change = [];
    const walk = (n, pf) => { const c = deep(n); recolor(c, pf, toDark); const before = JSON.stringify(n); if (JSON.stringify(c) !== before) change.push(c); E.S.kids(n.id).forEach(k => walk(k, c.fill || pf)); };
    tops.forEach(t => { const c = deep(t); c.mode = toDark ? 'dark' : 'light'; recolor(c, null, toDark); change.push(c); E.S.kids(t.id).forEach(k => walk(k, c.fill)); });
    return { kind: 'recolor', change, focus: tops[0].id, say: `Switched ${tops.length === 1 ? `“${tops[0].name}”` : `${tops.length} screens`} to ${toDark ? 'dark' : 'light'} mode in place: backgrounds, cards, text and borders, checked for contrast. Ctrl Z or Undo brings the old colors back.` };
  }
  const labelOf = n => { if (!n) return ''; if (n.t === 'text') return (n.tx && n.tx.c) || ''; const t = E.S.descendants(n.id).find(k => k.t === 'text' && k.tx && k.tx.c); return t ? t.tx.c : n.name || ''; };
  const buttonish = n => {
    if (!n || !n.p) return false;
    const kids = E.S.kids(n.id), parent = E.S.get(n.p);
    if (n.t === 'text') return /^(link|nav link|menu item|tab)\b/i.test(n.name || '') && String((n.tx || {}).c || '').length <= 28 && !(parent && /button|btn|cta/i.test(parent.name || ''));
    if (kids.length > 2) return false;
    return /button|btn|cta|link\b|tab\b/i.test(n.name || '') || (n.r && (n.h || 0) <= 72 && (n.w || 0) <= 420 && kids.some(k => k.t === 'text' && String((k.tx || {}).c || '').length <= 28));
  };
  const GUESS_SCREEN = [[/sign ?up|get started|join|create (an )?account|register|start free|try (it )?free/i, 'Sign up', 'login'], [/log ?in|sign ?in/i, 'Sign in', 'login'], [/pric|plans|upgrade|buy|subscribe/i, 'Pricing', 'pricing'], [/checkout|cart|pay|order/i, 'Checkout', 'checkout'], [/settings|preferences/i, 'Settings', 'settings'], [/profile|account/i, 'Profile', 'profile'], [/dashboard|stats/i, 'Dashboard', 'dashboard'], [/chat|message/i, 'Chat', 'chat'], [/contact|talk to|email|write/i, 'Contact', ''], [/about|story|team|who/i, 'About', ''], [/work|how it works|learn more|see|explore|tour/i, 'How it works', ''], [/home|back/i, 'Home', 'home']];
  async function screenFor(name, kindHint) {   // an existing frame by name, else a new screen (a template when one fits, else a titled blank frame)
    const low = String(name || '').toLowerCase();
    const hit = frames().find(f => String(f.name || '').toLowerCase().includes(low));
    if (hit) return { frame: hit, nodes: [] };
    const tpl = kindHint || (GUESS_SCREEN.find(g => g[0].test(name)) || [])[2];
    if (tpl && !(window.TribeCanvas && window.TribeCanvas.local && window.TribeCanvas.local())) {
      try { const r = await C.api('/canvasai/plan', { method: 'POST', body: { ask: `make a ${tpl} screen`, file: E.file, sel: [] } }); if (r && r.kind === 'build' && r.create && r.create.length) { r.create[0].name = name.replace(/^\w/, ch => ch.toUpperCase()); return { frame: r.create[0], nodes: r.create }; } } catch {}
    }
    const last = frames().slice(-1)[0] || { w: 390, h: 844, y: 0 }, dx = frames().length ? Math.max(...frames().map(f => (f.x || 0) + (f.w || 0))) + 120 : 0;
    const id = nid(), title = name.replace(/^\w/, ch => ch.toUpperCase());
    const f = { id, t: 'frame', p: '', i: E.S.nextI(''), v: 1, x: dx, y: last.y || 0, name: title, w: last.w || 390, h: last.h || 844, fill: '#FFFFFF', clip: true };
    const t = { id: nid(), t: 'text', p: id, i: 1, v: 1, x: 32, y: 48, name: 'Title', w: Math.max(200, (last.w || 390) - 64), h: 40, tx: { c: title, f: 'Inter', s: 28, wt: 700, lh: 1.2, al: 'left', col: '#16181D' }, sz: { h: 'fixed', v: 'hug' } };
    return { frame: f, nodes: [f, t] };
  }
  async function wireMove(sl) {
    const url = sl.kind === 'url' || sl.kind === 'email' ? (sl.kind === 'email' ? 'mailto:' + sl.to : /^https?:/.test(sl.to) ? sl.to : `https://${sl.to}.com`) : '';
    // a picked button (or its label) is the target; a picked screen or group means every button inside it; nothing picked: every screen
    const picked = E.sel.map(id => E.S.get(id)).filter(Boolean).map(n => (n.t === 'text' && n.p && buttonish(E.S.get(n.p)) ? E.S.get(n.p) : n));
    let targets = picked.filter(n => buttonish(n) || (n.p && E.S.kids(n.id).length <= 2));
    const scope = picked.length && !targets.length ? picked : !picked.length ? frames() : [];
    if (scope.length) targets = scope.flatMap(f => E.S.descendants(f.id)).filter(buttonish);
    if (!targets.length) return { kind: 'none', say: 'I see no buttons yet. Select a layer and say “wire this to the pricing screen”, or ask for a screen with buttons first.' };
    const out = [], made = [], lines = [];
    for (const b of targets.slice(0, 24)) {
      if (!sl.to && b.link) continue;
      const c = deep(b);
      if (url) { c.link = { url }; lines.push(`“${labelOf(b) || b.name}” → ${sl.to}`); out.push(c); continue; }
      const label = labelOf(b), g = GUESS_SCREEN.find(x => x[0].test(label));
      const want = sl.to ? String(sl.to) : g ? g[1] : label || 'Next';
      const from = rootOf(b);
      let s = made.find(m => m.frame.name.toLowerCase() === want.toLowerCase()) || await screenFor(want, sl.to ? (GUESS_SCREEN.find(x => x[0].test(sl.to)) || [])[2] : g && g[2]);
      if (from && s.frame.id === from.id) continue;
      if (s.nodes.length && !made.includes(s)) { made.push(s); out.push(...s.nodes); }
      c.link = { to: s.frame.id, name: s.frame.name }; out.push(c); lines.push(`“${label || b.name}” → ${s.frame.name}`);
    }
    if (!lines.length) return { kind: 'none', say: 'Every button already goes somewhere. Select one and say “wire this to …” to change it.' };
    return { kind: 'build', create: out, focus: (targets[0] || {}).id, say: `Wired ${lines.length} button${lines.length === 1 ? '' : 's'}: ${lines.slice(0, 5).join(', ')}${lines.length > 5 ? '…' : ''}.${made.length ? ` Made ${made.map(m => `“${m.frame.name}”`).join(', ')} for ${made.length === 1 ? 'it' : 'them'}.` : ''} Send to app turns them into real links.` };
  }
  async function pageMove(sl) {
    const n = sl.name || `Screen ${frames().length + 1}`;
    const tpl = (GUESS_SCREEN.find(g => g[0].test(n)) || [])[2];
    const s = await screenFor(n, tpl);
    if (!s.nodes.length) return { kind: 'none', focus: s.frame.id, say: `There is already a “${s.frame.name}” screen.` };
    return { kind: 'build', create: s.nodes, focus: s.frame.id, say: `Added the “${s.frame.name}” screen next to the others${tpl ? ', from a free template' : ''}. Wire a button to it: select it and say “wire this to ${s.frame.name.toLowerCase()}”.` };
  }
  let imgFor = null;
  function pickImage(id) {
    imgFor = id;
    let f = document.getElementById('cv-img-file');
    if (!f) { f = document.createElement('input'); f.type = 'file'; f.id = 'cv-img-file'; f.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'; f.hidden = true; document.body.appendChild(f);
      f.addEventListener('change', () => { const file = f.files && f.files[0]; if (!file || !imgFor) return; const rd = new FileReader(); rd.onload = () => { const n = E.S.get(imgFor); if (!n) return; const shrinkTo = src => { const c = deep(n); c.img = src; if (!c.fill) c.fill = '#EEEEEE'; E.apply([c]); }; const im = new Image(); im.onload = () => { const k = Math.min(1, 1200 / Math.max(im.width, im.height)); if (k === 1 || /svg|gif/.test(file.type)) return shrinkTo(rd.result); const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); shrinkTo(cv.toDataURL('image/jpeg', 0.86)); }; im.onerror = () => shrinkTo(rd.result); im.src = rd.result; }; rd.readAsDataURL(file); }); }
    f.value = ''; f.click();
  }
  async function imageMove(sl) {
    const n = E.sel.map(id => E.S.get(id)).find(x => x && x.t !== 'text');
    if (!n) return { kind: 'none', say: 'Select the picture (or a box to fill with one) first, then ask again.' };
    if (sl.action === 'round' || sl.action === 'square') { const c = deep(n); c.r = sl.action === 'round' ? Math.round(Math.min(n.w || 100, n.h || 100) / 2) : 0; if (sl.action === 'round' && n.w && n.h && Math.abs(n.w - n.h) > 2) { c.w = c.h = Math.min(n.w, n.h); } return { kind: 'recolor', change: [c], focus: n.id, say: sl.action === 'round' ? 'Made it a circle.' : 'Squared the corners.' }; }
    if (sl.action === 'alt') { const c = deep(n); c.name = (c.name || 'Picture').replace(/^(?!Picture)/, 'Picture · '); return { kind: 'recolor', change: [c], focus: n.id, say: 'Named the layer as a picture; its alt text comes from the layer name when you send it to the app.' }; }
    if (sl.source === 'board') {
      let pics = []; try { const r = await C.api('/inspo?board=me'); pics = (r.items || []).filter(x => (x.kind || 'image') === 'image' && x.thumb); } catch {}
      if (pics.length) { let src = pics[0].thumb; if (/^\/api\//.test(src)) { try { const b = await (await fetch(C.base() + src)).blob(); src = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); } catch {} } const c = deep(n); c.img = src; return { kind: 'recolor', change: [c], focus: n.id, say: `Filled it with “${pics[0].title || 'a picture'}” from your inspiration board.` }; }
      pickImage(n.id); return { kind: 'note', say: 'Your board has no pictures yet, so pick one from your computer.' };
    }
    pickImage(n.id);
    return { kind: 'note', focus: n.id, say: 'Pick a picture: it fills the selected layer (cover), and Ctrl Z takes it back.' };
  }
  async function localMove(text) {
    const NL = window.TribeNLU; if (!NL || !E || !E.S) return null;
    let s = null; try { const P = NL.parse(text, { view: 'canvas', selection: !!E.sel.length }); s = P.steps.length === 1 ? P.steps[0] : null; } catch {}
    if (!s || s.conf < 0.6) return null;
    if (s.intent === 'canvas.dark' && !/\b(version|variant|copy)\b/i.test(text)) return darkInPlace(s.slots.mode);
    if (s.intent === 'canvas.dark' && !E.sel.length && frames().length && E.select) { E.select([frames().slice(-1)[0].id]); return null; }   // "dark mode version" with nothing selected: the last screen
    if (s.intent === 'canvas.wire') return wireMove(s.slots || {});
    if (s.intent === 'canvas.page') return pageMove(s.slots || {});
    if (s.intent === 'canvas.image') return imageMove(s.slots || {});
    return null;
  }
  async function run(text) {
    const local = window.TribeCanvas && window.TribeCanvas.local && window.TribeCanvas.local();
    const r = (await localMove(text)) || (local ? await localPlan(text) : await C.api('/canvasai/plan', { method: 'POST', body: { ask: text, file: E.file, sel: E.sel, boxes: Object.fromEntries(E.sel.map(id => [id, E.wbox(id)]).filter(x => x[1])) } }));
    const before = E.step ? E.step() : null;
    if (r.kind === 'build' || r.kind === 'variants' || r.kind === 'theme') E.insert(r.create, r.focus);
    else if (r.kind === 'rename' || r.kind === 'tidy' || r.kind === 'recolor') E.apply(r.change);
    const after = E.step ? E.step() : null;
    return { r, pairs: after && after !== before ? after : null };
  }
  async function ask(text) {
    if (hook && hook.send) return hook.send(text);   // the Flint pane is the one place to talk to Flint on the canvas
    if (!E || busy) return;
    if (!E.canEdit) return say(T('View only: ask the host to make you a builder to design here.'));
    open(); busy = true; last = text;
    bar.classList.add('is-busy');
    const ff = FF(); if (ff) ff.work(document.getElementById('cv-stage'), T('Designing…'));
    out(`<p class="cvf-say is-wait"><img src="assets/flint.svg" alt="" width="11" height="14"> ${esc(T('On it…'))} <span class="cvf-ask">“${esc(text)}”</span></p>`);
    try {
      const { r } = await run(text);
      if (r.kind === 'tier' || r.kind === 'freeform') { if (ff) ff.home(); return honest(r); }
      say(r.say || T('Done.'));
      if (ff) {
        const target = r.focus && E.elOf(r.focus);
        if (target) setTimeout(() => ff.done(target, r.kind === 'build' ? T('Designed ✓') : T('Done ✓')), 120); else ff.home();
      }
    } catch (e) { if (ff) ff.home(); say(e.message || String(e)); }
    finally { busy = false; bar.classList.remove('is-busy'); }
  }
  async function honest(r) {
    let host = {};
    try { host = ((await C.api('/flint/tiers')).now || {}).host || {}; } catch {}
    const agents = ((C.state && C.state().members) || []).some(m => m.role === 'agent');
    out(window.TribeBoost ? window.TribeBoost.html({ did: `Nothing changed on the canvas. ${r.why || ''}`.trim(), would: 'An AI draws what you described as real layers here, and Undo takes it back.', ask: last }) : `<p>${esc(r.why || '')}</p>`);
  }
  // "Use my AI" on the boost card: a connected AI helper gets the brief; with none, Flint's brain opens to connect one (free)
  async function useMyAI(text) { const agents = ((C.state && C.state().members) || []).some(m => m.role === 'agent'); if (agents) { say(await sendToHelpers(text || last)); return; } if (window.TribeBrain && window.TribeBrain.open) window.TribeBrain.open(); }
  async function handOff(btn) {
    btn.disabled = true;
    say(await sendToHelpers(last));
  }
  async function sendToHelpers(text) {
    const st = window.TribeCanvas && window.TribeCanvas.state ? window.TribeCanvas.state() : {};
    const sel = (st.selected || []).slice(0, 5);
    const msg = `@agents On the design canvas (Design, file "${st.name || E.file}"): ${text}.${sel.length ? ` Selected layers: ${sel.join(', ')}.` : ''} Use the canvas tools: get_canvas to read it, add_frame / add_layers / update_layer / set_auto_layout to draw, export_frame when it should become code. Keep real auto layout and the project's look.`;
    try { await C.api('/agents/channel', { method: 'POST', body: { text: msg } }); }
    catch { try { await C.api('/chat/general', { method: 'POST', body: { text: 'Claude, ' + msg.replace(/^@agents /, '') } }); } catch {} }
    const online = ((C.state && C.state().members) || []).some(m => m.role === 'agent' && m.online);
    return online ? T('Sent to your AI helpers. You\'ll see their cursor here as they draw.') : T('Sent to your AI helpers in #agents. None is connected right now: connect one in Connect your AI and it picks this up.');
  }

  window.TribeCanvasFlint = { mount, ask, open, close, run, sendToHelpers, useMyAI, use: h => { hook = h; if (h && bar) close(); }, get busy() { return busy; } };
  // the canvas may have been built before this file loaded (scripts load one by one): mount now
  if (document.getElementById('cv') && window.TribeCanvas && window.TribeCanvas._e) mount(window.TribeCanvas._e);
})();
