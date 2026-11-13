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
  const START = ['A login screen', 'A pricing section', 'Add a text that says…', 'Add a button that says…', 'Make the buttons work', 'Make a dark mode'];
  const WITH_SEL = ['Align these to the left', 'Group them', 'Duplicate this', 'Bring it to the front', 'Dark mode version', 'Tidy up', 'Rename layers'];
  let fui = null, E = null, pane = null, quick = null, items = [], loadedFor = '', busy = false, notes = [];
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
  // 1. Flint's local brain (app/ui/flintnlu.js) reads the ask with what's on screen (the canvas selection, the frame).
  // 2. Design asks (screens, tidy, rename, dark/light version, variants) go to the free canvas engine (flint.js run()).
  //    "Send this to the app" / "export as png" press those buttons. Anything else local (a task, a message, the theme,
  //    a question about TribeCode) goes to Flint's local hands (app/ui/flintlocal.js), answered here in the pane.
  // 3. What nothing local can do comes back from the canvas engine as the honest card (hand it to your AI helper).
  // Returns { r, pairs } like run(): r.kind 'build' | 'tidy' | ... | 'tier' | 'freeform' | 'note', r.say the reply.
  async function askFlint(text, ctx) {
    const NL = window.TribeNLU, L = window.TribeFlintLocal, CF = window.TribeCanvasFlint;
    let s = null;
    try { const c = Object.assign({}, L && L.ctx ? L.ctx() : {}, { view: 'canvas', selection: !!(ctx && ctx.sel && ctx.sel.length), frame: ctx && ctx.frame }); const P = NL && NL.parse(text, c); s = P && P.steps && P.steps.length === 1 ? P.steps[0] : null; } catch { s = null; }
    const sure = s && s.intent && s.conf >= 0.6;
    if (sure && (s.intent === 'canvas.send' || s.intent === 'canvas.export')) {
      const b = document.getElementById(s.intent === 'canvas.send' ? 'cv-send' : 'cv-export');
      if (b && !b.disabled) { b.click(); return { r: { kind: 'note', say: s.intent === 'canvas.send' ? T('Sending the selected frame to the app.') : T('Pick a format in the Export menu.') } }; }
      return { r: { kind: 'note', say: T('Select a frame first, then ask again.') } };
    }
    // feat/flint-site: a website (a template by meaning, "turn this into a real website") opens the website designer
    if (sure && /^site\./.test(s.intent) && window.TribeSiteDesigner) {
      const tpl = s.intent.slice(5), S2 = window.TribeSiteCfg, isTpl = !!(S2 && S2.TEMPLATES.includes(tpl));
      window.TribeSiteDesigner.open(isTpl ? { template: tpl } : {});
      return { r: { kind: 'note', say: isTpl ? T(`That is a website, so I opened the website designer with the ${s.label || tpl} template: real pages, buttons that go somewhere, dark mode and Download HTML. Your canvas stays as it is.`) : T('Opened the website designer: pages, working buttons, themes with a dark variant, and Download HTML.') } };
    }
    if (sure && MOVES[s.intent]) return move(s);
    if (sure && s.intent === 'lesson' && window.TribeFlintLessons) { window.TribeFlintLessons.open(s.slots.feature); return { r: { kind: 'note', say: T('Here is a short lesson. Show me points at the real thing.') } }; }
    if (sure && !/^(canvas\.|edit\.picked|build\.|site\.)/.test(s.intent) && fui) {   // feat/flint-unify: anything else goes to Flint's full brain; its replies land in this thread
      const out = await fui.capture(text); const said = out.map(m => String(m.text || '').replace(/<[^>]+>/g, '')).filter(Boolean);
      if (said.length) return { r: { kind: 'note', say: said.join(' ') } };
    }
    const out = await CF.run(text);
    if (out && out.r && out.r.kind === 'freeform' && window.TribeNLU && window.TribeNLU.needsAI && !window.TribeNLU.needsAI(text) && /^(?:please\s+|can you\s+|could you\s+)?(?:align|move|put|group|ungroup|lock|unlock|resize|rename|select|zoom|snap|fix|change|set|turn|swap|duplicate|copy|delete|remove|hide|show|bring|send|line|spread|space|nudge|shift|flip|rotate|center|centre|tidy|sort|arrange|order)\b/i.test(text.trim())) {   // a command it didn't get (a description of something to draw is generation: the AI card)   // not understood, and nothing to generate: one question with chips
      const q = window.TribeNLU.clarify(text, { view: 'canvas' }); return { r: { kind: 'ask', say: q.q, chips: q.chips } };
    }
    return out;
  }


  // ---------- feat/flint-unify: free canvas moves (align, spread, group, duplicate, lock, order, resize, add, snap…) ----------
  // Each lands as this person's own change (Ctrl Z works) and returns the before/after pairs so the message's Undo works.
  const nid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
  const snapAll = () => new Map(E.S.live().map(n => [n.id, JSON.stringify(n)]));
  function pairsSince(before) {
    const out = [], now = new Map(E.S.live().map(n => [n.id, n]));
    now.forEach((n, id) => { const b = before.get(id); if (!b) out.push({ id, before: null }); else if (b !== JSON.stringify(n)) out.push({ id, before: JSON.parse(b) }); });
    before.forEach((b, id) => { if (!now.has(id)) out.push({ id, before: JSON.parse(b) }); });
    return out;
  }
  const need = (n, what) => ({ r: { kind: 'note', say: n === 1 ? T(`Select a layer first, then say "${what}".`) : T(`Select ${n} or more layers first, then say "${what}".`) } });
  const ALN = { left: 'l', center: 'ch', right: 'r', top: 't', middle: 'cv', bottom: 'b' };
  function spot(w, h) {   // inside the selected frame, else the middle of the view
    const f = E.sel.length === 1 && E.S.get(E.sel[0]); if (f && (f.t === 'frame' || f.t === 'component')) return { p: f.id, x: Math.max(16, Math.round(((f.w || 390) - w) / 2)), y: Math.max(16, Math.round(((f.h || 400) - h) / 2)) };
    const v = E.view || { x: 0, y: 0, z: 1 }, st = E.stage.getBoundingClientRect(), z = v.z || 1;
    return { p: '', x: Math.round((st.width / 2 - (v.x || 0)) / z - w / 2), y: Math.round((st.height / 2 - (v.y || 0)) / z - h / 2) };
  }
  function shape(kind, text, col) {
    const id = nid(), c = col && col.hex;
    const S0 = { rect: [160, 100, { t: 'rect', fill: c || '#D9DEE7', r: 8, name: 'Rectangle' }], ellipse: [100, 100, { t: 'ellipse', fill: c || '#38C6B1', name: 'Circle' }], line: [240, 2, { t: 'rect', fill: c || '#2A313C', name: 'Line' }],
      image: [240, 160, { t: 'rect', fill: '#C7CCD6', r: 8, name: 'Image' }], frame: [390, 844, { t: 'frame', fill: '#FFFFFF', clip: true, name: 'Frame' }], card: [280, 160, { t: 'frame', fill: c || '#FFFFFF', r: 12, clip: true, name: 'Card' }],
      text: [240, 32, { t: 'text', name: (text || 'Text').slice(0, 40), tx: { c: text || 'Text', f: 'Inter', s: 20, wt: 500, lh: 1.3, al: 'left', col: c || '#16181D' }, sz: { h: 'fixed', v: 'hug' } }],
      button: [160, 44, { t: 'frame', fill: c || '#F26B1D', r: 10, name: 'Button' }] }[kind] || [160, 100, { t: 'rect', fill: '#D9DEE7', name: 'Rectangle' }];
    const [w, h, base] = S0, at = spot(w, h), n = Object.assign({ id, p: at.p, i: E.S.nextI(at.p), v: 1, x: at.x, y: at.y, w, h }, base), out = [n];
    if (kind === 'button') out.push({ id: nid(), t: 'text', p: id, i: 1, v: 1, x: 16, y: 11, w: w - 32, h: 22, name: 'Label', tx: { c: text || 'Button', f: 'Inter', s: 15, wt: 600, lh: 1.4, al: 'center', col: '#FFFFFF' }, sz: { h: 'fixed', v: 'hug' } });
    return out;
  }
  const MOVES = {
    'canvas.align': s => { if (E.sel.length < 2) return need(2, 'align these to the left'); window.TribeCanvasExtras.align(ALN[s.slots.dir] || 'l'); return `Aligned ${E.sel.length} layers to the ${s.slots.dir}.`; },
    'canvas.distribute': s => { if (E.sel.length < 3) return need(3, 'distribute evenly'); window.TribeCanvasExtras.align(s.slots.axis === 'v' ? 'dv' : 'dh'); return `Spread ${E.sel.length} layers evenly ${s.slots.axis === 'v' ? 'top to bottom' : 'left to right'}.`; },
    'canvas.group': () => { if (E.sel.length < 2) return need(2, 'group them'); const n = E.sel.length; E.group(); return `Grouped ${n} layers.`; },
    'canvas.ungroup': () => { if (!E.sel.length) return need(1, 'ungroup'); E.ungroup(); return 'Ungrouped.'; },
    'canvas.duplicate': () => { if (!E.sel.length) return need(1, 'duplicate this'); E.duplicate(); return `Duplicated. The copy is selected.`; },
    'canvas.lock': s => { if (!E.sel.length) return need(1, 'lock this'); const on = s.slots.on !== false; E.patchMany(E.sel, n => { if (on) n.lock = true; else delete n.lock; }); return on ? 'Locked: it can’t be moved or resized until you say "unlock".' : 'Unlocked.'; },
    'canvas.hide': s => { if (!E.sel.length) return need(1, 'hide this'); const on = s.slots.on !== false; E.patchMany(E.sel, n => { if (on) n.hide = true; else delete n.hide; }); return on ? 'Hidden. Say "show it" or use the eye in Layers to bring it back.' : 'Showing it again.'; },
    'canvas.order': s => { if (!E.sel.length) return need(1, 'bring it to the front'); E.order(s.slots.dir); return { front: 'Brought it to the front.', back: 'Sent it to the back.', up: 'Brought it forward one step.', down: 'Sent it back one step.' }[s.slots.dir] || 'Done.'; },
    'canvas.resize': s => { if (!E.sel.length) return need(1, 'resize it to 320 by 200'); const sl = s.slots; E.patchMany(E.sel, n => { if (sl.scale) { if (n.t === 'text' && n.tx) { n.tx = Object.assign({}, n.tx, { s: Math.max(6, Math.round((n.tx.s || 16) * sl.scale)) }); } if (Number.isFinite(n.w)) n.w = Math.max(1, Math.round(n.w * sl.scale)); if (Number.isFinite(n.h)) n.h = Math.max(1, Math.round(n.h * sl.scale)); } else { if (sl.w) n.w = sl.w; if (sl.h) n.h = sl.h; if (n.sz && (sl.w || sl.h)) n.sz = Object.assign({}, n.sz, sl.w ? { h: 'fixed' } : {}, sl.h ? { v: 'fixed' } : {}); } }); return sl.scale ? `Made it ${sl.scale > 1 ? 'twice as big' : 'half the size'}.` : `Resized to ${sl.w || '…'} × ${sl.h || '…'}.`.replace(' × …', ' wide').replace('… × ', '').replace(/^Resized to (\d+)\.$/, 'Resized to $1 tall.'); },
    'canvas.layer.rename': s => { if (!E.sel.length) return need(1, 'rename this to Header'); E.rename(E.sel[0], s.slots.name); return `Renamed it to “${s.slots.name}”.`; },
    'canvas.add': s => { const list = shape(s.slots.kind, s.slots.text, s.slots.color); E.addNodes(list); return { say: `Added ${s.slots.kind === 'ellipse' ? 'a circle' : s.slots.kind === 'image' ? 'an image placeholder' : 'a ' + s.slots.kind}${s.slots.text ? ` that says “${s.slots.text}”` : ''}. It’s selected: drag it where you want it.`, focus: list[0].id }; },
    'canvas.snap': () => { const ids = E.sel.length ? E.sel.slice() : E.S.kids('').map(n => n.id); if (!ids.length) return 'Nothing to snap yet.'; E.patchMany(ids, n => { if (Number.isFinite(n.x)) n.x = Math.round(n.x / 8) * 8; if (Number.isFinite(n.y)) n.y = Math.round(n.y / 8) * 8; if (Number.isFinite(n.w)) n.w = Math.max(8, Math.round(n.w / 8) * 8); if (Number.isFinite(n.h) && n.t !== 'text') n.h = Math.max(8, Math.round(n.h / 8) * 8); }); return `Snapped ${ids.length} layer${ids.length === 1 ? '' : 's'} to the 8px grid.`; },
    'canvas.delete': () => { if (!E.sel.length) return need(1, 'delete this'); const n = E.sel.length; E.removeSel(); return `Deleted ${n} layer${n === 1 ? '' : 's'}. Undo brings ${n === 1 ? 'it' : 'them'} back.`; },
    'canvas.selectall': () => { const ids = E.S.kids('').map(n => n.id); E.select(ids); return { say: `Selected ${ids.length} top-level layer${ids.length === 1 ? '' : 's'}.`, keep: true }; },
    // feat/flint-max: component recipes ("add a navbar", "turn these into a card grid") and palettes ("apply a sunset palette")
    'canvas.recipe': s => {
      const FM = window.TribeFlintMax; if (!FM) return 'Recipes did not load. Reload the page.';
      if (s.slots.kind === 'cardgrid' && E.sel.length >= 2) { const nodes = E.sel.map(id => E.S.get(id)).filter(Boolean), moves = FM.gridOf(nodes); const by = new Map(moves.map(m => [m.id, m.patch])); E.patchMany(nodes.map(n => n.id), n => Object.assign(n, by.get(n.id) || {})); return `Arranged ${nodes.length} layers into a card grid: 3 columns, 16px gaps, equal sizes.`; }
      const f = E.sel.length === 1 && E.S.get(E.sel[0]), inFrame = f && (f.t === 'frame' || f.t === 'component'), w = inFrame ? (f.w || 390) : 390;
      const at = inFrame ? { p: f.id, x: 0, y: s.slots.kind === 'footer' || s.slots.kind === 'tabbar' ? Math.max(0, (f.h || 844) - (s.slots.kind === 'footer' ? 120 : 72)) : 0, w } : Object.assign(spot(w, 320), { w });
      const list = FM.recipe(s.slots.kind, at, nid); if (!list) return 'I don’t have that recipe yet.';
      if (!inFrame) list[0].i = E.S.nextI(list[0].p);
      E.addNodes(list);
      return { say: `Added a ${({ cardgrid: 'card grid', navbar: 'navbar', tabbar: 'tab bar', modal: 'dialog', form: 'sign-up form' })[s.slots.kind] || s.slots.kind}: real layers you can move and edit, from a recipe (no AI).`, focus: list[0].id };
    },
    'canvas.palette': s => {
      const FM = window.TribeFlintMax; if (!FM) return 'Palettes did not load. Reload the page.';
      const P = FM.palette({ mood: s.slots.mood, color: s.slots.color && s.slots.color.hex }), k = P.colors;
      const ids = E.sel.length ? E.sel.slice() : E.S.live().map(n => n.id), all = new Set(ids); if (E.sel.length) E.S.live().forEach(n => { let q = n, d = 0; while (q && q.p && d++ < 40) { if (all.has(q.p)) { all.add(n.id); break; } q = E.S.get(q.p); } });
      const moves = FM.recolor([...all].map(id => E.S.get(id)).filter(Boolean), k); if (!moves.length) return 'Nothing to recolor yet.';
      const by = new Map(moves.map(m => [m.id, m.patch])); E.patchMany(moves.map(m => m.id), n => Object.assign(n, by.get(n.id)));
      return `Recolored ${moves.length} layer${moves.length === 1 ? '' : 's'} with the ${P.name} palette (${P.swatches.slice(0, 5).map(x => x.hex).join(' ')}), text at ${FM.contrast(k.ink, k.bg)}:1 contrast.`;
    },
    'canvas.zoom': s => { const to = s.slots.to, z = (E.view && E.view.z) || 1; if (to === 'fit') E.fit(false); else if (to === 'selection') E.fit(true); else E.zoomTo(to === '100' ? 1 : to === 'in' ? Math.min(8, z * 1.5) : Math.max(0.1, z / 1.5)); return { say: to === 'fit' ? 'Zoomed to fit everything.' : to === 'selection' ? 'Zoomed to the selection.' : `Zoom ${Math.round(((E.view && E.view.z) || 1) * 100)}%.`, keep: true }; },
  };
  function move(s) {
    if (!E.canEdit) return { r: { kind: 'note', say: T('View only: ask the host to make you a builder to design here.') } };
    const before = snapAll(); let out;
    try { out = MOVES[s.intent](s); } catch (e) { return { r: { kind: 'note', say: e.message || String(e) } }; }
    if (out && out.r) return out;
    const o = typeof out === 'string' ? { say: out } : out || {}, pairs = o.keep ? [] : pairsSince(before);
    return { r: { kind: pairs.length ? 'move' : 'note', say: T(o.say || 'Done.'), focus: o.focus || '', create: pairs.filter(p => !p.before).map(p => ({ id: p.id })) }, pairs: pairs.length ? pairs : null };
  }

  function mount(editor) {
    E = editor;
    const cv = $('#cv'), body = cv && cv.querySelector('.cv-body'); if (!body || $('#cv-fpane')) return;
    pane = document.createElement('aside');
    pane.className = 'cv-fpane'; pane.id = 'cv-fpane'; pane.setAttribute('aria-label', 'Flint');
    body.appendChild(pane);
    // feat/flint-unify: the one Flint chat (TribeFlint.mount, ctx canvas). The thread is this design file's, shared live.
    fui = window.TribeFlint && window.TribeFlint.mount ? window.TribeFlint.mount(pane, { ctx: 'canvas', echo: false, onSay: () => {}, run: async t => { await send(t); return true; },
      hello: T('Tell me what to design: a screen, a section, or a change to what you select (align, group, duplicate, add a text…). Every step can be undone.'), chips: () => chipList(),
      onEscape: u => { u.input.blur(); E.focus(); }, onAI: async t => { if (t) { const msg = await window.TribeCanvasFlint.sendToHelpers(t); await post({ role: 'flint', kind: 'note', text: msg }); paintLog(); } else if (window.TribeBrain) window.TribeBrain.open(); },
      tools: [{ label: '+ ' + T('Note'), html: '<span class="flm-note">+ ' + esc(T('Note')) + '</span>', title: T('Add what you typed as a note and send several together'), attrs: { 'data-fp': 'note' }, fn: () => {} }, { html: '✕', title: T('Hide Flint'), attrs: { 'data-fp': 'hide' }, fn: () => {} }] }) : null;
    if (fui) { const nb = document.createElement('div'); nb.className = 'fp-notes'; nb.id = 'fp-notes'; nb.hidden = true; fui.extra.appendChild(nb); }
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
    pane.addEventListener('click', onClick);
    // the AI-boost card's Use my AI: the mount's onAI above
    window.TribeCanvasFlint && window.TribeCanvasFlint.use({ open, toggle, send: t => { open(); return send(t); } });
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
    if (fui) { if (typeof prefill === 'string') fui.fill(prefill); else if (!isPhone()) setTimeout(() => fui.input.focus({ preventScroll: true }), 30); }
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
  const chipsBy = new Map();   // Flint message id -> its chips (a clarifying question), this browser only
  function paintLog() {
    if (!fui) return;
    const meId = (C.state && C.state().me && C.state().me.id) || '';
    fui.busy = busy;
    fui.set(items.map(it => {
      if (it.role === 'me') return { who: 'me', text: it.text, name: !it.by || it.by === meId ? T('You') : it.name };
      const canUndo = !it.undone && it.kind && it.kind !== 'tier' && it.kind !== 'freeform' && it.kind !== 'note' && it.kind !== 'ask' && (snaps.has(it.id) || (it.ids && it.ids.length)) && E.canEdit;
      const honest = it.kind === 'tier' || it.kind === 'freeform';
      const acts = [];
      if (it.focus && !it.undone) acts.push({ label: T('Show'), fn: () => { if (E.S.get(it.focus)) { E.select([it.focus]); E.fit(true); } } });
      if (canUndo) acts.push({ label: T('Undo'), fn: () => undoItem(it.id) });
      (chipsBy.get(it.id) || []).forEach(c => acts.push(c.fill ? { label: c.label, act: 'fill', arg: c.say } : { label: c.label, act: 'ask', arg: c.say }));
      return honest && window.TribeBoost ? { who: 'flint', text: '', html: window.TribeBoost.html({ did: `Nothing changed on the canvas. ${it.text || ''}`.trim(), would: 'An AI draws what you described as real layers here, and Undo takes it back.', ask: it.ref }) }
        : { who: 'flint', text: it.undone ? `${it.text} (${T('Undone')})` : it.text, undone: !!it.undone, acts };
    }));
  }
  async function undoItem(id) {
    const it = items.find(x => x.id === id); if (!it) return;
    const pairs = snaps.get(it.id) || (it.ids || []).map(i => ({ id: i, before: null }));
    E.revert(pairs); snaps.delete(it.id); it.undone = true; paintLog();
    try { const r = await C.api('/canvaschat/' + encodeURIComponent(E.file) + '/undo', { method: 'POST', body: { id: it.id } }); upsert(r.item); paintLog(); } catch {}
  }
  function addNote() { if (!fui) return; const v = fui.input.value.trim(); if (!v) { fui.input.focus(); return; } notes.push({ text: v, sel: E.sel.slice() }); fui.input.value = ''; paintNotes(); fui.input.focus(); }
  function scrollLog() { if (fui) fui.draw(); }
  let chipKey = '';
  const chipList = () => (E && E.sel.length ? WITH_SEL : START).map(c => T(c));
  function chips() {
    if (!fui || !E) return;
    const k = chipList().join('|') + mode();
    if (k === chipKey) return; chipKey = k; fui.chips(chipList());
  }
  function paintNotes() {
    const box = pane.querySelector('#fp-notes'); if (!box) return;
    box.hidden = !notes.length;
    box.innerHTML = notes.length ? `<ol>${notes.map((n, i) => `<li><span>${esc(n.text)}</span><button type="button" class="fp-x sm" data-fp="unnote" data-i="${i}" aria-label="${esc(T('Remove'))}">✕</button></li>`).join('')}</ol>
      <p class="fp-row"><button type="button" class="btn sm primary" data-fp="applynotes">${esc(T('Send all'))} (${notes.length})</button><button type="button" class="btn sm" data-fp="clearnotes">${esc(T('Clear'))}</button></p>` : '';
  }

  // ---------- asking ----------
  async function post(body) { try { const r = await C.api('/canvaschat/' + encodeURIComponent(E.file), { method: 'POST', body }); upsert(r.item); return r.item; } catch { const it = Object.assign({ id: 'l' + Date.now(), at: new Date().toISOString(), name: T('You') }, body); upsert(it); return it; } }
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
      const { r, pairs } = await askFlint(text, { sel: E.sel.slice(), file: E.file, frame: frameOfSel() });
      if (r.kind === 'tier' || r.kind === 'freeform') { if (ff) ff.home(); item = await post({ role: 'flint', kind: r.kind, text: r.why || r.say || '', ref: text }); }
      else if (r.kind === 'ask') { if (ff) ff.home(); item = await post({ role: 'flint', kind: 'note', text: r.say }); if (r.chips) chipsBy.set(item.id, r.chips); }
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
    if (a === 'note') return addNote();
    if (a === 'unnote') { notes.splice(+b.dataset.i, 1); paintNotes(); return; }
    if (a === 'clearnotes') { notes = []; paintNotes(); return; }
    if (a === 'applynotes') { const list = notes; notes = []; paintNotes(); for (const n of list) { await send(n.text, n.sel.length ? n.sel : null); } return; }
    if (a === 'hand') {
      b.disabled = true;
      const msg = await window.TribeCanvasFlint.sendToHelpers(b.dataset.text);
      await post({ role: 'flint', kind: 'note', text: msg }); paintLog();
    }
  }

  function frameOfSel() { let n = E.S.get(E.sel[0]); let k = 0; while (n && n.p && E.S.get(n.p) && k++ < 50) n = E.S.get(n.p); return n ? n.id : ''; }
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
