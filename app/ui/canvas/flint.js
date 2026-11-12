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
  async function run(text) {
    const local = window.TribeCanvas && window.TribeCanvas.local && window.TribeCanvas.local();
    const r = local ? await localPlan(text) : await C.api('/canvasai/plan', { method: 'POST', body: { ask: text, file: E.file, sel: E.sel, boxes: Object.fromEntries(E.sel.map(id => [id, E.wbox(id)]).filter(x => x[1])) } });
    const before = E.step ? E.step() : null;
    if (r.kind === 'build' || r.kind === 'variants' || r.kind === 'theme') E.insert(r.create, r.focus);
    else if (r.kind === 'rename' || r.kind === 'tidy') E.apply(r.change);
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
    out(`<div class="cvf-honest"><p><b>${esc(r.tier === 'agent' ? T('Bigger than my free tier.') : T('That one is freeform.'))}</b> ${esc(r.why || '')}</p>
      <p class="cvf-acts"><button type="button" class="btn sm primary" data-cvf="hand">${esc(agents ? T('Send to my AI helper') : T('Post it for my AI helper'))}</button>${host.online ? `<button type="button" class="btn sm" data-cvf="tribeai">${esc(T("Try the tribe's AI"))}${host.via ? ` (${esc(host.via)})` : ''}</button>` : ''}</p></div>`);
  }
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

  window.TribeCanvasFlint = { mount, ask, open, close, run, sendToHelpers, use: h => { hook = h; if (h && bar) close(); }, get busy() { return busy; } };
  // the canvas may have been built before this file loaded (scripts load one by one): mount now
  if (document.getElementById('cv') && window.TribeCanvas && window.TribeCanvas._e) mount(window.TribeCanvas._e);
})();
