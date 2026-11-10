// Flint beside the live preview (v0.27, Figma Make style): while the app, game or site runs in the preview, Flint
// stays open next to it. Describe a change, watch the build feed (what each AI helper is doing, files saved with
// +/− counts, the preview reloading, errors with a "Fix it" button) and see the element you picked as context.
// Desktop: a resizable, collapsible panel on the right of the preview (width and open/closed remembered on this
// device). Phones: a bottom sheet over the preview that you pull up.
// Mounted by app/ui/preview.js: window.TribePreviewFlint = { mount(pane, ctx), pick(p), reloaded(files), error(e), feed(line) }.
// It only uses Flint's public API (window.TribeFlint.ask / thread) and the existing endpoints and ws events:
//   looks ("make the title bigger", "change it to …") -> POST /api/preview/flint (rules, or Flint's AI)
//   assets ("add a jump sound") and questions          -> TribeFlint.ask
//   builds ("add a score", "make it dark")             -> the AI helpers in #agents (POST /api/agents/channel)
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

  let el = null, ctx = null, picked = null, items = [], seen = new Set();
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
      <ol class="pvf-feed" id="pvf-feed" aria-live="polite"></ol>
      <div class="pvf-pick hidden" id="pvf-pick"><span></span><button type="button" data-pvf="unpick" aria-label="Clear the picked element">✕</button></div>
      <div class="pvf-chips" id="pvf-chips"></div>
      <form class="pvf-form" id="pvf-form" autocomplete="off"><textarea class="input" id="pvf-in" rows="2" maxlength="800" placeholder="Describe a change…" aria-label="Describe a change"></textarea>
        <button class="btn primary sm" id="pvf-go">Send</button></form>`;
    body.appendChild(el);
    const w = Math.max(240, Math.min(520, Number(lsGet(KW, '320')) || 320));
    pane.style.setProperty('--pvf-w', w + 'px');
    setOpen(lsGet(KOFF, '0') !== '1' && !isPhone(), true);
    if (isPhone()) setOpen(false, true);
    paintChips(); paintPick(); paintFeed();
    if (!items.length) feed({ k: 'flint', text: 'I’m watching the preview. Describe a change, or pick something on the page with Edit.' });
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-pvf]'); if (!a) return;
      if (a.dataset.pvf === 'hide') setOpen(false);
      if (a.dataset.pvf === 'unpick') { picked = null; paintPick(); }
      if (a.dataset.pvf === 'fix') fix(a.dataset.msg || '');
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

  function paintChips() { const c = el && el.querySelector('#pvf-chips'); if (c) c.innerHTML = chips().map(t => `<button type="button" class="chip" data-chip="${esc(t)}">${esc(t)}</button>`).join(''); }
  function paintPick() {
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

  async function send(text) {
    feed({ k: 'you', who: 'You', text });
    const pickNow = picked;
    try {
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
  async function askAgents(text, pickNow) {
    const where = (ctx && ctx.href && ctx.href()) ? ` (page: ${String(ctx.href()).replace(/^\/preview\/[^/]+\/pv1\.[^/]+\/?/, '/') || '/'})` : '';
    const about = pickNow ? ` About the ${pickNow.tag} “${(pickNow.text || '').slice(0, 80)}”.` : '';
    const kit = await kitHint();   // the project's open-source stack + quality bar (server/buildkit.js)
    const msg = `@agents In the live preview${where}: ${text}.${about} Save the change in the project's code; the preview reloads by itself.${kit ? ' ' + kit : ''}`;
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
    pick(p) { picked = p && p.tag ? p : null; paintPick(); if (picked && el && !el.classList.contains('is-open') && !isPhone()) setOpen(true, true); },
    reloaded(files) { feed({ k: 'reload', text: 'Reloaded the preview ✓', html: null, files }); },
    error(e) { feed({ k: 'error', text: String(e && e.msg || e || 'error').slice(0, 300), key: 'e' + String(e && e.msg) + (e && e.line) }); },
    feed,
    open: () => setOpen(true), close: () => setOpen(false), isOpen: () => !!(el && el.classList.contains('is-open')),
    items: () => items.slice(),
  };
})();
