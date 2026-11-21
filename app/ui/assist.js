// Assist (server/assist.js): write the vision with help, and suggested tasks wherever "New task" opens.
//   - TribeAssist.vision(p, { host, done }): one plain box to change what the project is (feat/easy-start). The first
//     sentence typed at creation is the vision; there is no template (For whom / Done for v1 / Out of scope) any more.
//   - TribeAssist.ideas(box, { compact }): 3-5 suggested tasks. Tap adds to Backlog, ✕ dismisses (remembered),
//     "More ideas" asks the local model (or more heuristics without one). Shown only while the board has fewer
//     than 3 tasks.
// Desktop: the ideas panel opens above the board with "New task". Phones: in the New task sheet and under Up next.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => App() && App().toast(m);
  const me = () => C.state().me || {};
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const busy = on => { const L = window.TribeLogoBusy; if (L) try { on ? L.start() : L.stop(); } catch {} };
  const X = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const PLUS = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  // =====================================================================
  // The vision composer
  // =====================================================================
  let wait = null;   // { channel, agent, at, stop } while a Claude is drafting
  let onChat = null;   // the open composer's handler for its Claude's reply
  C.on('chat', ev => { if (onChat) try { onChat(ev); } catch {} });
  function stopWait() { if (wait) { clearTimeout(wait.t); busy(false); wait = null; } }

  // feat/easy-start: what you are making is the sentence typed when the project started. This is the one place to
  // change it by hand (the project's dashboard and settings open it; telling Flint "set the vision to: …" does the
  // same): one plain box with what it says now. No template, no headings to fill in, nothing to pick.
  const plain = t => String(t || '').replace(/^#\s+.*\n+/, '').trim();
  async function vision(p, opts = {}) {
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return;
    const h = opts.host !== undefined ? opts.host : me().role === 'host';
    stopWait();
    m.classList.remove('hidden');
    body.innerHTML = `<div class="av-wrap"><span class="eyebrow">${esc(p.name)}</span><h2>${h ? 'What are you making?' : 'Suggest what we’re making'}</h2><p class="lead">Loading…</p></div>`;
    let text = ''; try { text = plain((await C.api('/vision', { project: p.id })).text); } catch {}
    if (/Replace these lines together/.test(text)) text = '';   // the starter's placeholder is not a vision
    if (m.classList.contains('hidden')) return;
    body.innerHTML = `<div class="av-wrap av1">
      <span class="eyebrow">${esc(p.name)}</span><h2>${h ? 'What are you making?' : 'Suggest what we’re making'}</h2>
      <p class="lead">${h ? 'A sentence or two in your own words. Flint, your friends and any AI helper read it before they build.' : 'It goes to the chat for the person who runs this project to use.'}</p>
      <textarea class="input pj-vision-in av-text" id="pj-vtext" rows="4" maxlength="4000" aria-label="What are you making?" placeholder="For example: a cozy game where friends water plants at night.">${esc(text || p.bio || '')}</textarea>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Later</button><button class="btn primary" id="pj-vsave">${h ? 'Save' : 'Send to chat'}</button></div></div>`;
    const ta = $('#pj-vtext');
    const close = () => { stopWait(); m.classList.add('hidden'); };
    body.querySelector('[data-close]').onclick = close;
    if (!phone()) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch {} }
    $('#pj-vsave').onclick = async () => {
      const t = ta.value.trim(); if (!t) return ta.focus();
      try {
        if (h) { await C.api('/vision', { method: 'PUT', project: p.id, body: { text: `# ${p.name}\n\n${t}\n` } }); toast('Saved'); }
        else await C.api('/chat/general', { method: 'POST', body: { text: `💡 Suggestion for what ${p.name} is: ${t}` } }).then(() => toast('Sent to the chat'));
        close(); ideasCache = null; if (opts.done) opts.done();
      } catch (e) { toast(e.message); }
    };
  }
  // Settings › Projects: "What you’re making", with the sentence as it is now and Change.
  (function settingsRow(n = 0) {
    const T = window.TribeSettings; if (!T || !T.addSection) { if (n < 40) setTimeout(() => settingsRow(n + 1), 500); return; }
    try { T.addSection('projects', { id: 'making', title: 'What you’re making', render: async el => {
      const P = window.TribeProjects, p = P && P.cur && P.cur();
      if (!p || !C.connected()) { el.innerHTML = '<p class="faint">Open a project to see and change what it says it is.</p>'; return; }
      let text = ''; try { text = plain((await C.api('/vision', { project: p.id })).text); } catch {}
      const mine = me().role === 'host' || p.role === 'host';
      el.innerHTML = `<p class="av-set-t" id="av-set-t">${text ? esc(text.split('\n')[0].slice(0, 240)) : '<span class="faint">Nothing yet. One sentence is enough.</span>'}</p>
        <p class="faint">${esc(p.name)} was made from this sentence. Flint, your friends and any AI helper read it. You can also tell Flint: “set the vision to: …”.</p>
        <button type="button" class="btn" id="av-set-edit">${mine ? 'Change it' : 'Suggest a change'}</button>`;
      el.querySelector('#av-set-edit').onclick = () => vision(p, { host: mine, done: () => { if (T.open) T.open('projects', 'making'); } });
    } }); } catch {}
  })();
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const clean = t => String(t || '').replace(/^```[a-z]*\n?|```$/gm, '').replace(/^#\s+.*\n+/, '').replace(/^@\S+\s+/, '').trim();
  function insert(ta, s) {
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
    const at = document.activeElement === ta ? a : ta.value.length, end = document.activeElement === ta ? b : ta.value.length;
    ta.value = ta.value.slice(0, at) + s + ta.value.slice(end);
    const pos = at + s.length; try { ta.setSelectionRange(pos, pos); } catch {}
    ta.dispatchEvent(new Event('input'));
  }

  // =====================================================================
  // Suggested tasks
  // =====================================================================
  let ideasCache = null;   // { at, project, items }
  async function load(force) {
    const pj = C.project && C.project();
    if (!force && ideasCache && ideasCache.project === pj && Date.now() - ideasCache.at < 15000) return ideasCache;
    const r = await C.api('/assist/tasks');
    ideasCache = { at: Date.now(), project: pj, items: r.suggestions || [], model: !!r.model };
    return ideasCache;
  }
  async function ideas(box, opts = {}) {
    if (!box || !C.connected() || me().role === 'spectator' || me().role === 'agent') return;
    if (!opts.always && !few()) { const old = box.querySelector(':scope > .as-ideas'); if (old) old.remove(); return; }   // feat/tasks-company: always, when asked for (Plan this week)   // feat/setup-flow: only while the board is nearly empty
    let slot = box.querySelector(':scope > .as-ideas');
    if (!slot) { slot = document.createElement('section'); slot.className = 'as-ideas' + (opts.compact ? ' compact' : ''); box.appendChild(slot); }
    let d; try { d = await load(opts.force); } catch { slot.remove(); return; }
    paintIdeas(slot, d.items, opts);
  }
  const few = () => { const T = window.TribeTasks; return !T || !T.all || T.all().length < 3; };
  function paintIdeas(slot, items, opts) {
    slot.innerHTML = `<div class="as-head"><span class="eyebrow">${esc(opts.eyebrow || 'Suggested')}</span><b class="as-t">${esc(opts.title || 'Ideas for next tasks')}</b><button type="button" class="linkish as-more" data-as-more>More ideas</button>${opts.closable ? `<button type="button" class="as-close" data-as-close aria-label="Hide the suggestions" title="Hide">${X}</button>` : ''}</div>
      <div class="as-list">${items.length ? items.map(i => `<div class="as-idea" data-sid="${esc(i.id)}"><button type="button" class="as-add" data-as-add title="Add to Backlog">${PLUS}<span class="as-it"><b>${esc(i.title)}</b><small>${esc(i.why || '')}</small></span></button><button type="button" class="as-x" data-as-dismiss aria-label="Dismiss: ${esc(i.title)}" title="Not now">${X}</button></div>`).join('')
        : '<p class="as-empty">No new ideas right now. Try More ideas.</p>'}</div>`;
    slot._items = items; slot._opts = opts;
  }
  const allSlots = () => [...document.querySelectorAll('.as-ideas')];
  function drop(id) {
    if (ideasCache) ideasCache.items = ideasCache.items.filter(i => i.id !== id);
    for (const s of allSlots()) { s._items = (s._items || []).filter(i => i.id !== id); const row = s.querySelector(`[data-sid="${CSS.escape(id)}"]`); if (row) row.remove(); if (!s._items.length) paintIdeas(s, [], s._opts || {}); }
  }
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('[data-as-add], [data-as-dismiss], [data-as-more], [data-as-close]'); if (!t) return;
    const slot = t.closest('.as-ideas'); if (!slot) return;
    e.preventDefault(); e.stopPropagation();
    if (t.hasAttribute('data-as-close')) { const pane = slot.closest('#as-tasks, #tk-plan'); (pane || slot).remove(); return; }
    if (t.hasAttribute('data-as-more')) {
      t.disabled = true; const was = t.textContent; t.textContent = 'Thinking…'; busy(true);
      try {
        const r = await C.api('/assist/tasks?more=1');
        const have = new Set((slot._items || []).map(i => i.id));
        const add = (r.suggestions || []).filter(i => !have.has(i.id));
        if (!add.length) toast('No more ideas right now');
        const items = [...(slot._items || []), ...add].slice(-8);
        if (ideasCache) ideasCache.items = items;
        paintIdeas(slot, items, slot._opts || {});
      } catch (err) { toast(err.message); t.disabled = false; t.textContent = was; }
      finally { busy(false); }
      return;
    }
    const row = t.closest('[data-sid]'); if (!row) return;
    const id = row.dataset.sid, it = (slot._items || []).find(i => i.id === id); if (!it) return;
    row.classList.add('gone');
    if (t.hasAttribute('data-as-dismiss')) {
      try { await C.api('/assist/tasks/dismiss', { method: 'POST', body: { id, title: it.title } }); } catch (err) { toast(err.message); }
      return drop(id);
    }
    try {
      if (window.TribeTasks && window.TribeTasks.create) await window.TribeTasks.create(it.title, 'backlog');
      else await C.api('/tasks', { method: 'POST', body: { title: it.title, status: 'backlog' } });
      toast(`Added to Backlog: ${it.title}`);
      drop(id);
    } catch (err) { toast(err.message); row.classList.remove('gone'); }
  }, true);

  // Desktop: "New task" opens the ideas above the board (phones use the quick sheet in mobile2.js).
  function tasksPane(force) {
    const view = $('#view-tasks'); if (!view || phone()) return;
    let pane = $('#as-tasks');
    if (!pane) { pane = document.createElement('div'); pane.id = 'as-tasks'; const head = view.querySelector('.view-head'); head ? head.insertAdjacentElement('afterend', pane) : view.prepend(pane); }
    ideas(pane, { closable: true, compact: true, force });
    if (!pane.childElementCount) pane.remove();
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#task-new') && !phone()) tasksPane(true); });
  C.on('project', () => { ideasCache = null; const p = $('#as-tasks'); if (p) p.remove(); });

  window.TribeAssist = { vision, ideas, tasksPane, reset: () => { ideasCache = null; } };
})();
