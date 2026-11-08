// Assist (server/assist.js): write the vision with help, and suggested tasks wherever "New task" opens.
//   - TribeAssist.vision(p, { host, done }): a calm composer. Five guided prompts (pre-filled from the project's name,
//     bio, template, README, chat and tasks), "Draft with" Flint (the local model, or a template from the answers when
//     there's no model) · My Claude (asked in your private chat with it; its reply fills the editor) · Other model
//     (your other connected agents, hidden when there are none), and suggestion chips while you type.
//   - TribeAssist.ideas(box, { compact }): 3-5 suggested tasks. Tap adds to Backlog, ✕ dismisses (remembered),
//     "More ideas" asks the local model (or more heuristics without one).
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

  async function vision(p, opts = {}) {
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return;
    const h = opts.host !== undefined ? opts.host : me().role === 'host';
    stopWait();
    m.classList.remove('hidden');
    body.innerHTML = `<div class="av-wrap"><span class="eyebrow">Vision · ${esc(p.name)}</span><h2>${h ? 'What are you building?' : 'Suggest a vision'}</h2><p class="lead">Loading…</p></div>`;
    let ctx; try { ctx = await C.api('/assist/vision'); } catch (e) { ctx = { answers: {}, questions: [], helpers: {}, model: {} }; }
    if (m.classList.contains('hidden')) return;
    const qs = ctx.questions && ctx.questions.length ? ctx.questions : [{ k: 'what', q: 'What are you making?' }, { k: 'who', q: 'Who is it for?' }, { k: 'fun', q: 'What makes it fun or useful?' }, { k: 'done', q: 'What does "done" look like for v1?' }, { k: 'out', q: 'What is out of scope?' }];
    const hp = ctx.helpers || {}, others = hp.others || [];
    const existing = String(ctx.vision || '').replace(/^#\s+.*\n+/, '').trim();
    const seg = [['flint', 'Flint', ctx.model && ctx.model.online ? 'local model' : 'basic'], ['claude', 'My Claude', hp.claude ? (hp.claude.online ? 'online' : 'reads it next time') : 'not connected']];
    if (others.length) seg.push(['other', others.length === 1 ? others[0].name.split(' · ')[0] : 'Other model', others.length === 1 ? (others[0].online ? 'online' : 'offline') : `${others.length} connected`]);
    body.innerHTML = `<div class="av-wrap">
      <span class="eyebrow">Vision · ${esc(p.name)}</span><h2>${h ? 'What are you building?' : 'Suggest a vision'}</h2>
      <p class="lead">Answer a few prompts, let a helper draft it, then make it yours. ${h ? 'It becomes VISION.md, which the plan, the board and every agent read.' : 'It goes to the chat for the host to adopt.'}</p>
      <details class="av-qs" id="av-qs" ${existing ? '' : 'open'}><summary><span class="av-lbl">Guided prompts</span><span class="av-n">${qs.length}</span></summary>
        <div class="av-fields">${qs.map(q => `<label class="av-q"><span>${esc(q.q)}</span><input class="input" data-q="${esc(q.k)}" maxlength="400" value="${esc((ctx.answers || {})[q.k] || '')}" autocomplete="off"></label>`).join('')}</div></details>
      <div class="av-row"><span class="av-lbl">Draft with</span>
        <div class="av-seg" role="radiogroup" aria-label="Draft with">${seg.map(([k, l, s], i) => `<button type="button" role="radio" class="av-opt" data-helper="${k}" aria-checked="${i === 0}" ${k === 'claude' && !hp.claude ? 'disabled title="Connect your Claude Code first"' : ''}><b>${esc(l)}</b><small>${esc(s)}</small></button>`).join('')}</div>
        ${others.length > 1 ? `<select class="av-agent hidden" id="av-agent" aria-label="Which model">${others.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>` : ''}
        <button type="button" class="btn sm" id="av-go">Draft it</button></div>
      <div class="av-status hidden" id="av-status" role="status"></div>
      <textarea class="input pj-vision-in av-text" id="pj-vtext" rows="7" placeholder="A cozy pixel platformer for friends to build together.&#10;For people who like short levels and silly bosses.&#10;Done for now: 3 levels, a boss, playable in the browser.">${esc(existing)}</textarea>
      <div class="av-chips" id="av-chips" aria-label="Suggestions"></div>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Later</button><button class="btn primary" id="pj-vsave">${h ? 'Save the vision' : 'Send to chat'}</button></div></div>`;
    const ta = $('#pj-vtext'), st = $('#av-status');
    const answers = () => Object.fromEntries([...body.querySelectorAll('[data-q]')].map(i => [i.dataset.q, i.value.trim()]));
    const status = (html, cls = '') => { st.className = `av-status ${cls}`; st.innerHTML = html; st.classList.toggle('hidden', !html); };
    let helper = 'flint';
    body.querySelectorAll('.av-opt').forEach(b => b.onclick = () => {
      if (b.disabled) return;
      helper = b.dataset.helper; body.querySelectorAll('.av-opt').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      const sel = $('#av-agent'); if (sel) sel.classList.toggle('hidden', helper !== 'other');
    });
    const close = () => { stopWait(); m.classList.add('hidden'); };
    body.querySelector('[data-close]').onclick = close;
    const fill = (text, note) => { ta.value = text.trim(); ta.dispatchEvent(new Event('input')); const q = $('#av-qs'); if (q) q.open = false; status(note, 'ok'); };

    $('#av-go').onclick = async () => {
      const go = $('#av-go'); go.disabled = true; stopWait();
      try {
        if (helper === 'flint') {
          status('Flint is drafting…'); busy(true);
          try { const r = await C.api('/assist/vision', { method: 'POST', body: { helper, answers: answers() } }); fill(r.draft, r.by === 'model' ? 'Drafted by Flint with the local model. Edit away.' : 'Drafted by Flint from your answers. Edit away.'); }
          finally { busy(false); }
        } else {
          const sel = $('#av-agent');
          const r = await C.api('/assist/vision', { method: 'POST', body: { helper, answers: answers(), agent: sel ? sel.value : undefined } });
          const who = helper === 'claude' ? 'your Claude' : r.agent.name.split(' · ')[0];
          status(`<span class="av-spin" aria-hidden="true"></span>Waiting for ${esc(who)}… <button type="button" class="linkish" id="av-cancel">Stop waiting</button>`, 'wait');
          busy(true);
          wait = { channel: r.channel, agent: r.agent.id, at: r.at, who, t: setTimeout(() => { if (wait) { stopWait(); status(`${esc(cap(who))} hasn't answered yet. Its reply will be in your private chat with it.`); } }, 10 * 60_000) };
          const cb = $('#av-cancel'); if (cb) cb.onclick = () => { stopWait(); status(''); };
        }
      } catch (e) { status(esc(e.message), 'err'); }
      finally { go.disabled = false; }
    };
    onChat = ev => {
      if (!wait || !ev || ev.channel !== wait.channel) return;
      const msg = ev.message || {}; if (msg.by !== wait.agent || String(msg.at) < String(wait.at)) return;
      if ($('#invite-modal').classList.contains('hidden') || !$('#pj-vtext')) return stopWait();
      const who = wait.who; stopWait();
      fill(clean(msg.text), `Drafted by ${esc(who)}. Edit away.`);
    };

    // suggestion chips while typing: debounced, never blocking
    let ct, cseq = 0;
    const chips = () => {
      const t = ta.value, low = t.toLowerCase(), a = answers(), out = [];
      if (!t.trim()) { if (a.what) out.push(['Start with what it is', `${cap(a.what.replace(/\.$/, ''))}.`]); }
      else {
        if (!/\b(for|players?|users?|people|friends|audience|who)\b/.test(low)) out.push(["Add who it's for", `\nFor ${(a.who || 'our friends').replace(/^for\s+/i, '')}.`]);
        if (!/\b(done|v1|milestone|first version|ship|launch)\b/.test(low)) out.push(['Name a first milestone', `\n\n## Done for v1\n- ${a.done || 'a first version friends can try'}`]);
        if (!/\b(out of scope|not doing|won'?t|later|for now)\b/.test(low)) out.push(["Say what's out of scope", `\n\n## Out of scope\n- ${a.out || 'big features (for now)'}`]);
        if (out.length < 3 && !/\b(fun|useful|because|so that|why)\b/.test(low)) out.push(['Say why it matters', `\nWhat makes it good: ${a.fun || 'it is small and fun to share'}.`]);
      }
      return out.slice(0, 3);
    };
    const paint = (list, phr = []) => {
      const box = $('#av-chips'); if (!box) return;
      box.innerHTML = [...list.map(([l, ins]) => `<button type="button" class="av-chip" data-ins="${esc(ins)}">${PLUS}${esc(l)}</button>`),
        ...phr.map(x => `<button type="button" class="av-chip phr" data-ins="${esc(' ' + x)}">${esc(x)}</button>`)].join('');
      box.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => { insert(ta, b.dataset.ins); ta.focus(); schedule(); });
    };
    const schedule = () => {
      clearTimeout(ct);
      ct = setTimeout(async () => {
        const list = chips(); paint(list);
        if (!(ctx.model && ctx.model.online) || ta.value.trim().length < 20) return;
        const seq = ++cseq;
        try { const r = await C.api('/assist/complete', { method: 'POST', body: { text: ta.value } }); if (seq === cseq && r.phrases && r.phrases.length) paint(chips().slice(0, 2), r.phrases); } catch {}
      }, 450);
    };
    ta.addEventListener('input', schedule);
    body.querySelectorAll('[data-q]').forEach(i => i.addEventListener('input', schedule));
    schedule();
    if (!phone()) ta.focus();

    $('#pj-vsave').onclick = async () => {
      const t = ta.value.trim(); if (!t) return ta.focus();
      try {
        if (h) { await C.api('/vision', { method: 'PUT', body: { text: `# ${p.name}\n\n${t}\n` } }); toast('Vision saved'); }
        else { await C.api('/chat/general', { method: 'POST', body: { text: `💡 Vision suggestion for ${p.name}:\n${t}` } }); toast('Sent to the chat'); }
        close(); ideasCache = null; if (opts.done) opts.done();
      } catch (e) { toast(e.message); }
    };
  }
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
    let slot = box.querySelector(':scope > .as-ideas');
    if (!slot) { slot = document.createElement('section'); slot.className = 'as-ideas' + (opts.compact ? ' compact' : ''); box.appendChild(slot); }
    let d; try { d = await load(opts.force); } catch { slot.remove(); return; }
    paintIdeas(slot, d.items, opts);
  }
  function paintIdeas(slot, items, opts) {
    slot.innerHTML = `<div class="as-head"><span class="eyebrow">Suggested</span><b class="as-t">Ideas for next tasks</b><button type="button" class="linkish as-more" data-as-more>More ideas</button>${opts.closable ? `<button type="button" class="as-close" data-as-close aria-label="Hide the suggestions" title="Hide">${X}</button>` : ''}</div>
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
    if (t.hasAttribute('data-as-close')) { const pane = slot.closest('#as-tasks'); (pane || slot).remove(); return; }
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
    ideas(pane, { closable: true, force });
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#task-new') && !phone()) tasksPane(true); });
  C.on('project', () => { ideasCache = null; const p = $('#as-tasks'); if (p) p.remove(); });

  window.TribeAssist = { vision, ideas, tasksPane, reset: () => { ideasCache = null; } };
})();
