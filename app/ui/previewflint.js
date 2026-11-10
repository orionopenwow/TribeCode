// Flint beside the live preview (v0.27, Figma Make style): while the app, game or site runs in the preview, Flint
// stays open next to it. Describe a change, watch the build feed (what each AI helper is doing, files saved with
// +/− counts, the preview reloading, errors with a "Fix it" button) and see the element you picked as context.
// Desktop: a resizable, collapsible panel on the right of the preview (width and open/closed remembered on this
// device). Phones: a bottom sheet over the preview that you pull up.
// Mounted by app/ui/preview.js: window.TribePreviewFlint = { mount(pane, ctx), pick(p), reloaded(files), error(e), feed(line) }.
// It only uses Flint's public API (window.TribeFlint.ask / thread) and the existing endpoints and ws events:
//   looks ("make the title bigger", "change it to …") -> POST /api/preview/flint (rules, or Flint's AI)
//   assets ("add a jump sound") and questions          -> TribeFlint.ask
//   builds ("add a score")                            -> the AI helpers in #agents (POST /api/agents/channel)
// P1-G: pick an element and a compact property sheet edits it with no prompt and no AI (POST /api/preview/props;
// Undo: POST /api/preview/undo). P1-F: Plan first (editable steps before anything goes to the AI helpers), a list of
// notes applied together (Apply all), and the build history with one-click restore (/api/projects/:id/flint/history).
// Flint's free tier (server/flintfree.js, docs/FLINT-TIERS.md): "make a 3D game", "a to-do app", "a landing page for …"
// build from a recipe with no AI (POST /api/projects/:id/flint/build); a request that needs real engineering gets an honest
// card (POST /api/flint/tier) with "Send to my AI helper" and, when the tribe has one, "Try the tribe's AI".
(function () {
  const C = window.TribeClient; if (!C) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const KW = 'tribecode.pvf.w', KOFF = 'tribecode.pvf.off';
  const LOOK = /\b(bigger|larger|smaller|bold|cent(er|re)(ed)?|red|orange|yellow|green|teal|blue|indigo|purple|pink|white|black|gr[ae]y)\b|^(?:change|set|make|rename)?\s*(?:the\s+)?(?:text|it|this|words?)?\s*(?:to|say|says|read|reads)\b|^(?:delete|remove|hide)\s+(?:this|it|that)\b/i;
  const ASSET = /\b(sound|sfx|sprite|3d model|model|icon|font|texture)s?\b/i;
  const QUESTION = /^(how|what|why|where|when|who|can|could|should|is|are|do|does)\b|\?$/i;

  let el = null, ctx = null, picked = null, items = [], seen = new Set(), pending = null, tiers = null, notes = [], plans = new Map(), planSeq = 0;
  const KPLAN = 'tribecode.pvf.plan';
  const planOn = () => lsGet(KPLAN, '0') === '1';
  const nameOf = id => ((C.state().members || []).find(m => m.id === id) || {}).name || 'Someone';
  const roleOf = id => ((C.state().members || []).find(m => m.id === id) || {}).role || '';
  const project = () => (ctx && ctx.project && ctx.project()) || C.project();

  function chips() {
    const kind = (ctx && ctx.kind && ctx.kind()) || '';
    if (/game/.test(kind)) return ['Add a score', 'Make it harder', 'Add a jump sound', 'Make the title bigger'];
    return ['Make the title bigger', 'Make it dark', 'Mobile layout', 'Add a contact form'];
  }

  function mount(pane, c) {
    ctx = c;
    const body = pane.querySelector('.pvw-body'); if (!body || body.querySelector('.pvf')) return;
    el = document.createElement('aside');
    el.className = 'pvf'; el.id = 'pvf'; el.setAttribute('aria-label', 'Flint');
    el.innerHTML = `<div class="pvf-grip" role="separator" aria-orientation="vertical" aria-label="Resize Flint" tabindex="0"></div>
      <header class="pvf-head"><button type="button" class="pvf-handle" aria-label="Show or hide Flint"><i></i></button>
        <img src="assets/flint.svg" alt="" width="18" height="18"><b>Flint</b><span class="pvf-sub faint">builds with you, live</span>
        <button type="button" class="pvf-x" data-pvf="hide" title="Hide Flint" aria-label="Hide Flint">✕</button></header>
      <p class="pvf-tier" id="pvf-tier"><span class="pvf-free">Free</span><span id="pvf-tier-t">Edits and first builds need no AI</span></p>
      <ol class="pvf-feed" id="pvf-feed" aria-live="polite"></ol>
      <div class="pvf-hist hidden" id="pvf-hist" aria-label="Build history"></div>
      <div class="pvf-pick hidden" id="pvf-pick"><span></span><button type="button" class="pvf-tocanvas" data-open-canvas title="Edit this on the design canvas (P1-C)">Open in canvas</button><button type="button" data-pvf="unpick" aria-label="Clear the picked element">✕</button></div>
      <section class="pvf-props hidden" id="pvf-props" aria-label="Properties"></section>
      <div class="pvf-queue hidden" id="pvf-queue" aria-label="Notes to apply"></div>
      <div class="pvf-chips" id="pvf-chips"></div>
      <div class="pvf-tools"><label class="pvf-plan" title="Flint shows the steps first; you can edit them before anything goes to your AI helpers"><input type="checkbox" id="pvf-plan"> Plan first</label>
        <button type="button" class="pvf-tool" data-pvf="history" aria-expanded="false">History</button></div>
      <form class="pvf-form" id="pvf-form" autocomplete="off"><textarea class="input" id="pvf-in" rows="2" maxlength="800" placeholder="Describe a change…" aria-label="Describe a change"></textarea>
        <span class="pvf-btns"><button type="button" class="btn sm" id="pvf-add" title="Add to the list and apply them all together">+ Note</button><button class="btn primary sm" id="pvf-go">Send</button></span></form>`;
    body.appendChild(el);
    const w = Math.max(240, Math.min(520, Number(lsGet(KW, '320')) || 320));
    pane.style.setProperty('--pvf-w', w + 'px');
    setOpen(lsGet(KOFF, '0') !== '1' && !isPhone(), true);
    if (isPhone()) setOpen(false, true);
    paintChips(); paintPick(); paintFeed(); paintTier(); paintQueue();
    const pl = el.querySelector('#pvf-plan'); pl.checked = planOn(); pl.onchange = () => lsSet(KPLAN, pl.checked ? '1' : '0');
    el.querySelector('#pvf-add').onclick = () => { const ta2 = el.querySelector('#pvf-in'), t = ta2.value.trim(); if (!t) return ta2.focus(); notes.push({ text: t, pick: picked }); ta2.value = ''; paintQueue(); ta2.focus(); };
    wireProps();
    if (!items.length) feed({ k: 'flint', text: 'I’m watching the preview. Describe a change, or pick something on the page with Edit.' });
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-pvf]'); if (!a) return;
      if (a.dataset.pvf === 'hide') setOpen(false);
      if (a.dataset.pvf === 'unpick') { picked = null; paintPick(); }
      if (a.dataset.pvf === 'fix') fix(a.dataset.msg || '');
      if (a.dataset.pvf === 'history') toggleHistory();
      if (a.dataset.pvf === 'restore') restore(a.dataset.sha, a);
      if (a.dataset.pvf === 'savever') saveVersion(a);
      if (a.dataset.pvf === 'unnote') { notes.splice(+a.dataset.i, 1); paintQueue(); }
      if (a.dataset.pvf === 'clearnotes') { notes = []; paintQueue(); }
      if (a.dataset.pvf === 'applyall') applyAll(a);
      if (a.dataset.pvf === 'runplan' || a.dataset.pvf === 'dropplan') { const pl = plans.get(a.dataset.id); if (!pl) return; plans.delete(a.dataset.id); const card = a.closest('.pvf-plancard'); const steps = card ? card.querySelector('textarea').value.split('\n').map(x => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean) : pl.steps; card && card.querySelectorAll('button, textarea').forEach(x => { x.disabled = true; }); if (a.dataset.pvf === 'runplan') sendAgents(pl.text, pl.pick, steps); else feed({ k: 'flint', text: 'Plan dropped. Nothing was sent.' }); }
      if (a.dataset.pvf === 'undo') undo(a);
      if (a.dataset.pvf === 'pmin') { const bx = el.querySelector('#pvf-props'), m = !bx.classList.contains('is-min'); bx.classList.toggle('is-min', m); a.setAttribute('aria-expanded', String(!m)); lsSet('tribecode.pvf.pmin', m ? '1' : '0'); }
      if (a.dataset.pvf === 'seg') applyProp(a.dataset.prop, a.dataset.v);
      if (a.dataset.pvf === 'hand' && pending) { const p = pending; pending = null; a.closest('.pvf-t').querySelectorAll('button').forEach(b => { b.disabled = true; }); askAgents(p.text, p.pick); }
      if (a.dataset.pvf === 'tribeai' && pending) { const p = pending; pending = null; a.closest('.pvf-t').querySelectorAll('button').forEach(b => { b.disabled = true; }); if (window.TribeFlint && window.TribeFlint.ask) askFlint(p.text); }
    });
    el.querySelector('.pvf-handle').onclick = () => setOpen(!el.classList.contains('is-open'));
    el.querySelector('#pvf-chips').addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (b) send(b.dataset.chip); });
    const form = el.querySelector('#pvf-form'), ta = el.querySelector('#pvf-in');
    form.onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (t) { ta.value = ''; send(t); } };
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    el.addEventListener('keydown', e => { if (e.key === 'Escape' && isPhone() && el.classList.contains('is-open')) { e.stopPropagation(); setOpen(false); } });
    grip(pane); sheetDrag();
    // the toolbar's Flint toggle
    const bar = pane.querySelector('.pvw-bar');
    if (bar && !bar.querySelector('[data-act="flint"]')) {
      const t = document.createElement('button'); t.className = 'pvw-btn pvw-flint'; t.dataset.pvfToggle = '1';
      t.title = 'Flint'; t.setAttribute('aria-label', 'Flint'); t.innerHTML = '<img src="assets/flint.svg" alt="" width="16" height="16"><span>Flint</span>';
      t.onclick = () => setOpen(!el.classList.contains('is-open'));
      bar.appendChild(t);
    }
  }
  function setOpen(on, quiet) {
    if (!el) return;
    el.classList.toggle('is-open', on);
    const pane = el.closest('.pvw'); if (pane) pane.classList.toggle('pvf-open', on);
    document.body.classList.toggle('pvf-on', on && !isPhone());
    const t = pane && pane.querySelector('[data-pvf-toggle]'); if (t) t.setAttribute('aria-pressed', String(on));
    if (!isPhone() && !quiet) lsSet(KOFF, on ? '0' : '1');
    if (on && !quiet) setTimeout(() => { const i = el.querySelector('#pvf-in'); if (i && !isPhone()) i.focus(); }, 30);
    if (ctx && ctx.relayout) setTimeout(ctx.relayout, 0);
  }
  // desktop: drag the left edge to resize (240–520 px); arrows on the focused grip too
  function grip(pane) {
    const g = el.querySelector('.pvf-grip');
    const set = w => { w = Math.max(240, Math.min(520, Math.round(w))); pane.style.setProperty('--pvf-w', w + 'px'); lsSet(KW, String(w)); if (ctx && ctx.relayout) ctx.relayout(); };
    g.addEventListener('pointerdown', e => {
      if (isPhone()) return; e.preventDefault(); g.setPointerCapture(e.pointerId); pane.classList.add('pvf-resizing');
      const right = el.getBoundingClientRect().right;
      const mv = ev => set(right - ev.clientX), up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); pane.classList.remove('pvf-resizing'); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
    g.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); set(el.getBoundingClientRect().width + (e.key === 'ArrowLeft' ? 24 : -24)); } });
  }
  // phones: pull the sheet up or down by its head
  function sheetDrag() {
    const h = el.querySelector('.pvf-head'); let y0 = null, moved = false;
    h.addEventListener('pointerdown', e => { if (!isPhone() || e.target.closest('button:not(.pvf-handle)')) return; y0 = e.clientY; moved = false; });
    h.addEventListener('pointermove', e => { if (y0 !== null && Math.abs(e.clientY - y0) > 12) moved = true; });
    h.addEventListener('pointerup', e => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; if (!moved) return; setOpen(dy < 0); });
  }

  // the honest line under the header: what Flint can do right now for free, and which AI (if any) is on
  async function loadTiers(force) { if (tiers && !force) return tiers; try { tiers = await C.api('/flint/tiers'); } catch { tiers = { tiers: [], now: { host: { online: false } } }; } return tiers; }
  async function paintTier() {
    const t = el && el.querySelector('#pvf-tier-t'); if (!t) return;
    const T = await loadTiers(), host = (T.now && T.now.host) || {}, B = window.TribeBrain, dev = B && B.choice && B.choice() === 'browser' && B.browserReady && B.browserReady();
    t.textContent = dev ? 'Edits and first builds free · small model on this device' : host.online ? `Edits and first builds free · tribe AI: ${host.via || 'on'}` : 'Edits and first builds need no AI · bigger jobs go to your AI helper';
  }
  function paintChips() { const c = el && el.querySelector('#pvf-chips'); if (c) c.innerHTML = chips().map(t => `<button type="button" class="chip" data-chip="${esc(t)}">${esc(t)}</button>`).join(''); }
  function paintPick() {
    paintProps();
    const p = el && el.querySelector('#pvf-pick'); if (!p) return;
    p.classList.toggle('hidden', !picked);
    if (picked) p.querySelector('span').innerHTML = `Editing: <b>${esc(picked.text ? '“' + picked.text.slice(0, 48) + (picked.text.length > 48 ? '…' : '') + '”' : '<' + picked.tag + '>')}</b> <span class="faint">&lt;${esc(picked.tag)}&gt;</span>`;
  }
  const ICON = { you: '🗨', flint: '', agent: '✦', file: '✎', reload: '↻', task: '☑', error: '⚠', commit: '◆', ask: '→' };
  function paintFeed() {
    const f = el && el.querySelector('#pvf-feed'); if (!f) return;
    f.innerHTML = items.map(x => `<li class="pvf-it pvf-${x.k}">${x.k === 'flint' ? '<img src="assets/flint.svg" alt="" width="14" height="14">' : `<span class="pvf-ic" aria-hidden="true">${ICON[x.k] || '•'}</span>`}
      <div class="pvf-t">${x.who ? `<b>${esc(x.who)}</b> ` : ''}${x.html || esc(x.text)}${x.add != null ? ` <span class="pvf-diff"><ins>+${x.add}</ins> <del>−${x.del || 0}</del></span>` : ''}
      ${x.k === 'error' ? `<button type="button" class="btn sm" data-pvf="fix" data-msg="${esc(x.text)}">Fix it</button>` : ''}</div>
      <time>${new Date(x.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></li>`).join('');
    f.scrollTop = f.scrollHeight;
  }
  function feed(x) {
    x.at = x.at || Date.now();
    const key = x.key; if (key) { if (seen.has(key)) return; seen.add(key); }
    // fold repeated reloads into one line
    const last = items[items.length - 1];
    if (x.k === 'reload' && last && last.k === 'reload' && x.at - last.at < 4000) { last.at = x.at; last.n = (last.n || 1) + 1; last.text = `Reloaded the preview ✓${last.n > 1 ? ' ×' + last.n : ''}`; paintFeed(); return; }
    items.push(x); if (items.length > 60) items = items.slice(-60);
    paintFeed();
  }

  async function send(text, pickArg) {
    feed({ k: 'you', who: 'You', text });
    const pickNow = pickArg !== undefined ? pickArg : picked;
    try {
      // Flint's free tier: a recipe build, or an honest "this needs a stronger AI" (server/flintfree.js)
      let tier = null;
      if (!(pickNow && LOOK.test(text)) && !QUESTION.test(text)) { try { tier = await C.api('/flint/tier', { method: 'POST', body: { ask: text, picked: !!pickNow } }); } catch {} }
      if (tier && tier.tier === 'recipe' && !pickNow) return freeBuild(text);
      if (tier && tier.tier === 'agent') return tierCard(text, tier, pickNow);
      if (LOOK.test(text) || (pickNow && !ASSET.test(text) && !QUESTION.test(text))) {
        const FF = window.TribeFlintFly, fr = document.querySelector('#pvw-frame iframe'), tgt = pickNow && pickNow.rect && fr ? { frame: fr, rect: pickNow.rect } : (document.querySelector('#pvw-frame') || document.querySelector('#pvw'));
        if (FF) FF.work(tgt, 'Editing');
        try {
          const r = await C.api('/preview/flint', { method: 'POST', body: { href: (ctx && ctx.href && ctx.href()) || '', pick: pickNow || {}, ask: text } });
          if (FF) FF.done(tgt, 'Done ✓');
          return feed({ k: 'flint', text: r.say ? `${r.say} Saved to ${r.file}.` : `Saved to ${r.file}.` });
        } catch (e) { if (FF) FF.home(); if (!/AI|503|couldn/i.test(e.message || '')) return feed({ k: 'flint', text: e.message }); }
      }
      if ((ASSET.test(text) || QUESTION.test(text)) && window.TribeFlint && window.TribeFlint.ask) return askFlint(text);
      return askAgents(text, pickNow);
    } catch (e) { feed({ k: 'flint', text: e.message || String(e) }); }
  }
  async function freeBuild(text) {
    const pid = project(), FF = window.TribeFlintFly, tgt = document.querySelector('#pvw-frame') || document.querySelector('#pvw');
    if (FF) FF.work(tgt, 'Building');
    try {
      const r = await C.api(`/projects/${encodeURIComponent(pid)}/flint/build`, { method: 'POST', body: { ask: text } });
      if (!r.built && !r.exists) { if (FF) FF.home(); return feed({ k: 'flint', text: r.why || 'I couldn\'t build that one from a recipe.' }); }
      if (FF) FF.done(tgt, r.built ? 'Built ✓' : 'Here it is');
      feed({ k: 'flint', text: r.built ? `Built a ${r.title} for ${r.name}, free from the build kit (${r.files.length} files${r.dir ? ` in ${r.dir}/` : ''}). Pick anything on the page to change words, colors, size or spacing: also free.` : r.why });
      if (window.TribePreview && window.TribePreview.show) setTimeout(() => window.TribePreview.show(r.href || ''), 300);
    } catch (e) { if (FF) FF.home(); feed({ k: 'flint', text: e.message || String(e) }); }
  }
  async function tierCard(text, tier, pickNow) {
    pending = { text, pick: pickNow };
    const T = await loadTiers(), host = ((T.now || {}).host) || {};
    const agents = (C.state().members || []).some(m => m.role === 'agent');
    feed({ k: 'flint', html: `<span class="pvf-honest"><b>Bigger than my free tier.</b> ${esc(tier.why)}</span>
      <span class="pvf-acts"><button type="button" class="btn sm primary" data-pvf="hand">${agents ? 'Send to my AI helper' : 'Post it for my AI helper'}</button>${host.online ? `<button type="button" class="btn sm" data-pvf="tribeai">Try the tribe's AI${host.via ? ` (${esc(host.via)})` : ''}</button>` : ''}</span>` });
  }
  async function askFlint(text) {
    const T = window.TribeFlint, before = (T.thread() || []).length;
    T.ask(text);
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      await new Promise(r => setTimeout(r, 200));
      const th = T.thread() || [], last = th[th.length - 1];
      if (th.length >= before + 2 && last && last.who === 'flint') {
        const d = document.createElement('div'); d.innerHTML = String(last.text || '').replace(/\*\*|`/g, '');
        return feed({ k: 'flint', text: (d.textContent || '').trim().slice(0, 400) || 'Done.' });
      }
    }
    feed({ k: 'flint', text: 'Asked Flint: the answer is in the Flint panel.' });
  }
  const kitCache = {};
  async function kitHint() {
    const p = project(); if (!p) return '';
    if (!(p in kitCache)) { try { kitCache[p] = (await C.api(`/projects/${encodeURIComponent(p)}/buildkit`)).hint || ''; } catch { kitCache[p] = ''; } }
    return kitCache[p];
  }
  // Plan first (P1-F): editable steps before anything goes to the AI helpers
  function makePlan(text, pickNow) {
    const page = (ctx && ctx.href && ctx.href()) ? (String(ctx.href()).replace(/^\/preview\/[^/]+\/pv1\.[^/]+\/?/, '/') || '/') : 'the page';
    const steps = [pickNow ? `Find the ${pickNow.tag} “${(pickNow.text || '').slice(0, 40)}” on ${page}` : `Look at ${page} and the files behind it`];
    String(text).split(/\s*(?:;|\bthen\b|\band then\b|\n)\s*/i).map(x => x.trim()).filter(Boolean).forEach(x => steps.push(x.replace(/^\w/, c => c.toUpperCase())));
    steps.push('Keep the project\'s look and the build kit\'s quality bar', 'Check it at phone and desktop sizes', 'Save; the preview reloads by itself');
    return steps;
  }
  async function askAgents(text, pickNow) {
    if (!planOn()) return sendAgents(text, pickNow);
    const id = 'p' + (++planSeq), steps = makePlan(text, pickNow);
    plans.set(id, { text, pick: pickNow, steps });
    feed({ k: 'flint', html: `<span class="pvf-plancard"><b>Here's the plan.</b> Edit the steps, then run it.
      <textarea class="input" rows="${Math.min(8, steps.length + 1)}" aria-label="Plan steps">${esc(steps.map((x, i) => `${i + 1}. ${x}`).join('\n'))}</textarea>
      <span class="pvf-acts"><button type="button" class="btn sm primary" data-pvf="runplan" data-id="${id}">Run plan</button><button type="button" class="btn sm" data-pvf="dropplan" data-id="${id}">Cancel</button></span></span>` });
  }
  async function sendAgents(text, pickNow, steps) {
    const where = (ctx && ctx.href && ctx.href()) ? ` (page: ${String(ctx.href()).replace(/^\/preview\/[^/]+\/pv1\.[^/]+\/?/, '/') || '/'})` : '';
    const about = pickNow ? ` About the ${pickNow.tag} “${(pickNow.text || '').slice(0, 80)}”.` : '';
    const kit = await kitHint();   // the project's open-source stack + quality bar (server/buildkit.js)
    const plan = steps && steps.length ? ` Plan to follow: ${steps.map((x, i) => `${i + 1}. ${x}`).join(' ')}` : '';
    const msg = `@agents In the live preview${where}: ${text}.${about}${plan} Save the change in the project's code; the preview reloads by itself.${kit ? ' ' + kit : ''}`;
    if (window.TribeFlintFly) window.TribeFlintFly.done(document.querySelector('#pvf-feed') || document.querySelector('#pvw'), 'Sent to your AI');
    try { await C.api('/agents/channel', { method: 'POST', body: { text: msg } }); }
    catch { await C.api('/chat/general', { method: 'POST', body: { text: 'Claude, ' + msg.replace(/^@agents /, '') } }); }
    const online = (C.state().members || []).some(m => m.role === 'agent' && m.online);
    feed({ k: 'ask', text: online ? 'Sent to your AI helpers. Their work shows up here, and the preview reloads as they save.' : 'Sent to your AI helpers in #agents. None is connected right now: connect one in Connect your AI and it picks this up.' });
  }
  async function fix(msg) {
    feed({ k: 'you', who: 'You', text: 'Fix it' });
    await askAgents(`the page shows an error, please fix it: ${msg}`, null);
  }

  // ---------- notes applied together (P1-F) ----------
  function paintQueue() {
    const q = el && el.querySelector('#pvf-queue'); if (!q) return;
    q.classList.toggle('hidden', !notes.length);
    q.innerHTML = notes.length ? `<p class="pvf-qh"><b>${notes.length} note${notes.length > 1 ? 's' : ''}</b><span class="faint">applied together</span></p>
      <ol>${notes.map((n, i) => `<li><span>${esc(n.text)}${n.pick ? ` <em class="faint">on &lt;${esc(n.pick.tag)}&gt; “${esc((n.pick.text || '').slice(0, 24))}”</em>` : ''}</span><button type="button" data-pvf="unnote" data-i="${i}" aria-label="Remove this note">✕</button></li>`).join('')}</ol>
      <p class="pvf-acts"><button type="button" class="btn sm primary" data-pvf="applyall">Apply all (${notes.length})</button><button type="button" class="btn sm" data-pvf="clearnotes">Clear</button></p>` : '';
  }
  async function applyAll(btn) {
    const list = notes.slice(); notes = []; paintQueue();
    if (btn) btn.disabled = true;
    const rest = [];
    for (const n of list) {
      let free = !!(n.pick && LOOK.test(n.text));
      if (!free && !n.pick) { try { const t = await C.api('/flint/tier', { method: 'POST', body: { ask: n.text } }); free = t.tier === 'recipe'; } catch {} }
      if (free) await send(n.text, n.pick || null); else rest.push(n);
    }
    if (rest.length) {
      feed({ k: 'you', who: 'You', text: `Apply ${rest.length} note${rest.length > 1 ? 's' : ''} together` });
      await askAgents(rest.map((n, i) => `${i + 1}) ${n.text}${n.pick ? ` (on the ${n.pick.tag} “${(n.pick.text || '').slice(0, 60)}”)` : ''}`).join('; '), null);
    }
  }

  // ---------- the property sheet (P1-G): no prompt, no AI ----------
  const PROPS = [
    ['Spacing', [['padding', 'Padding'], ['margin', 'Margin']]],
    ['Size', [['width', 'Width'], ['height', 'Height']]],
    ['Text', [['font-size', 'Size'], ['font-weight', 'Weight']]],
    ['Color', [['color', 'Text'], ['background-color', 'Fill']]],
    ['Shape', [['border-radius', 'Radius'], ['text-align', 'Align']]],
  ];
  const hex = v => { const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/.exec(String(v || '')); if (!m) return /^#[0-9a-f]{6}$/i.test(v) ? v : ''; if (m[4] !== undefined && +m[4] === 0) return ''; return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join(''); };
  const trimLen = v => String(v || '').replace(/(\d+)\.\d+px/g, '$1px').trim();
  function paintProps() {
    const box = el && el.querySelector('#pvf-props'); if (!box) return;
    box.classList.toggle('hidden', !picked);
    if (!picked) { box.innerHTML = ''; return; }
    const cs = picked.cs || {};
    const field = (k, label) => {
      if (k === 'font-weight') return `<label><span>${label}</span><select data-prop="${k}">${['300', '400', '500', '600', '700', '800'].map(w => `<option ${String(cs[k]) === w ? 'selected' : ''}>${w}</option>`).join('')}</select></label>`;
      if (k === 'text-align') { const cur = cs[k] === 'start' ? 'left' : cs[k]; return `<span class="pvf-seg" role="group" aria-label="${label}">${['left', 'center', 'right'].map(v => `<button type="button" data-pvf="seg" data-prop="${k}" data-v="${v}" aria-pressed="${cur === v}" title="Align ${v}">${v === 'left' ? '⇤' : v === 'center' ? '↔' : '⇥'}</button>`).join('')}</span>`; }
      if (k === 'color' || k === 'background-color') { const h = hex(cs[k]); return `<label><span>${label}</span><span class="pvf-sw"><input type="color" data-prop="${k}" value="${h || '#000000'}" aria-label="${label} color"><input class="pvf-pv" data-prop="${k}" value="${esc(h || (k === 'background-color' ? 'none' : ''))}" aria-label="${label} value"></span></label>`; }
      return `<label><span>${label}</span><input class="pvf-pv" data-prop="${k}" value="${esc(trimLen(cs[k]))}" inputmode="text" aria-label="${label}"></label>`;
    };
    const min = lsGet('tribecode.pvf.pmin', '0') === '1'; box.classList.toggle('is-min', min);
    box.innerHTML = `<header><button type="button" class="pvf-pmin" data-pvf="pmin" aria-expanded="${!min}"><b>Properties</b></button><span class="faint">free · edits the code</span><button type="button" class="btn sm" data-pvf="undo" title="Undo the last change on this page">Undo</button></header>
      <div class="pvf-pgrid">${PROPS.map(([g, fs]) => `<p class="pvf-pg mono">${g}</p>${fs.map(([k, l]) => field(k, l)).join('')}`).join('')}</div>
      <p class="pvf-pstat faint" id="pvf-pstat" aria-live="polite"></p>`;
  }
  function wireProps() {
    const box = el.querySelector('#pvf-props');
    const go = t => { const k = t.dataset.prop; if (!k) return; let v = t.value.trim(); if ((k === 'color' || k === 'background-color') && v === 'none') v = ''; if (/^\d+(\.\d+)?$/.test(v) && !/weight/.test(k)) v += 'px'; applyProp(k, v); };
    box.addEventListener('change', e => { const t = e.target; if (t.matches('[data-prop]')) go(t); });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input.pvf-pv')) { e.preventDefault(); go(e.target); } });
  }
  const pstat = m => { const s = el && el.querySelector('#pvf-pstat'); if (s) s.textContent = m; };
  async function applyProp(k, v) {
    if (!picked) return;
    pstat('Saving…');
    try {
      const r = await C.api('/preview/props', { method: 'POST', body: { href: (ctx && ctx.href && ctx.href()) || '', pick: picked, set: { [k]: v } } });
      if (picked.cs) picked.cs[k] = v || picked.cs[k];
      if (k === 'text-align') el.querySelectorAll('#pvf-props [data-pvf="seg"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
      pstat(`Saved ${k} ${v || '(cleared)'} to ${r.file} ✓`);
    } catch (e) { pstat(e.message || String(e)); }
  }
  async function undo(btn) {
    if (btn) btn.disabled = true;
    try { const r = await C.api('/preview/undo', { method: 'POST', body: { href: (ctx && ctx.href && ctx.href()) || '' } }); pstat(`Undid the last change in ${r.file}${r.left ? ` (${r.left} more to undo)` : ''}.`); feed({ k: 'flint', text: `Undid the last change in ${r.file}.` }); }
    catch (e) { pstat(e.message || String(e)); }
    finally { if (btn) btn.disabled = false; }
  }

  // ---------- build history with one-click restore (P1-F) ----------
  const agoOf = iso => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return !isFinite(s) ? '' : s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
  async function paintHistory() {
    const h = el && el.querySelector('#pvf-hist'); if (!h) return;
    h.innerHTML = '<p class="faint">Loading the history…</p>';
    let r; try { r = await C.api(`/projects/${encodeURIComponent(project())}/flint/history`); } catch (e) { h.innerHTML = `<p class="faint">${esc(e.message)}</p>`; return; }
    h.innerHTML = `<header><b>Build history</b><span class="faint">${r.commits.length} version${r.commits.length === 1 ? '' : 's'}</span>${r.dirty ? `<button type="button" class="btn sm" data-pvf="savever">Save this version</button>` : ''}</header>
      ${r.dirty ? `<p class="pvf-hdirty faint">${r.dirty} unsaved change${r.dirty > 1 ? 's' : ''} since the last version.</p>` : ''}
      <ol>${r.commits.map((c, i) => `<li><span class="pvf-hs">${esc(c.subject.replace(/\s*\(via TribeCode\)$/, ''))}</span><span class="faint">${esc(c.author)} · ${agoOf(c.at)}</span>${i === 0 ? '<em class="pvf-now">current</em>' : `<button type="button" class="btn sm" data-pvf="restore" data-sha="${esc(c.sha)}">Restore</button>`}</li>`).join('')}</ol>`;
  }
  function toggleHistory() {
    const h = el.querySelector('#pvf-hist'), b = el.querySelector('[data-pvf="history"]');
    const on = h.classList.toggle('hidden') === false; b.setAttribute('aria-expanded', String(on));
    if (on) paintHistory();
  }
  async function restore(sha, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await C.api(`/projects/${encodeURIComponent(project())}/flint/restore`, { method: 'POST', body: { sha } });
      feed({ k: 'flint', text: `Restored “${r.subject.replace(/\s*\(via TribeCode\)$/, '')}”.${r.savedFirst ? ' Your unsaved changes were saved as a version first, so nothing is lost.' : ''} Every version stays in the history.` });
      paintHistory();
    } catch (e) { feed({ k: 'flint', text: e.message || String(e) }); if (btn) btn.disabled = false; }
  }
  async function saveVersion(btn) {
    if (btn) btn.disabled = true;
    try { await C.api(`/projects/${encodeURIComponent(project())}/flint/save`, { method: 'POST', body: {} }); paintHistory(); } catch (e) { feed({ k: 'flint', text: e.message || String(e) }); }
  }

  // ---------- the build feed from ws events ----------
  C.on('ws', m => {
    if (!el || !el.isConnected || !m) return;
    const pid = project();
    if (m.project && m.project !== pid) return;
    if (m.type === 'chat' && m.message) {
      const by = m.message.by;
      if (roleOf(by) !== 'agent') return;
      if (m.channel !== 'agents' && m.channel && !String(m.channel).includes(pid) && m.channel !== 'general') return;
      feed({ k: 'agent', who: nameOf(by), text: String(m.message.text || '').replace(/\s+/g, ' ').slice(0, 220), key: 'c' + m.message.id });
    }
    if (m.type === 'code-saved') feed({ k: 'file', who: nameOf(m.by), text: `saved ${m.path}`, add: m.add, del: m.del, key: 's' + m.path + m.sha });
    if (m.type === 'task' && m.task && m.task.title) feed({ k: 'task', text: `${m.task.title} · ${m.task.status || 'backlog'}`, key: 't' + m.task.id + m.task.status });
  });

  window.TribePreviewFlint = {
    mount,
    // a pick without the element's live styles (an old pick, or one handed in by code) is looked up on the page again,
    // so the Properties sheet always shows the real values (preview.js repick → the page's helper answers with a fresh pick)
    pick(p) { picked = p && p.tag ? p : null; paintPick(); if (picked && el && !el.classList.contains('is-open') && !isPhone()) setOpen(true, true); if (picked && !picked.cs && window.TribePreview && window.TribePreview.repick) window.TribePreview.repick(picked); },
    picked: () => picked,
    reloaded(files) { feed({ k: 'reload', text: 'Reloaded the preview ✓', html: null, files }); },
    error(e) { feed({ k: 'error', text: String(e && e.msg || e || 'error').slice(0, 300), key: 'e' + String(e && e.msg) + (e && e.line) }); },
    feed,
    open: () => setOpen(true), close: () => setOpen(false), isOpen: () => !!(el && el.classList.contains('is-open')),
    items: () => items.slice(),
    notes: () => notes.slice(),
  };
})();
