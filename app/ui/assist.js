// Assist (server/assist.js): write the vision with help, and suggested tasks wherever "New task" opens.
//   - TribeAssist.vision(p, { host, done }): a calm composer (feat/setup-flow). A row of category chips (Game · App ·
//     Website · Tool · Bot · Something else) and one "What's the gist?" box; a local template fills VISION.md at once
//     (what / for whom / done for v1 / out of scope). "Improve with" Flint or My Claude is optional. Save also sets
//     the project kind for sense (PUT /api/projects/:id/sense).
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

  // feat/setup-flow: the streamlined composer. Pick a category, write the gist (one or two sentences), and a local
  // template fills VISION.md at once: what / for whom / done for v1 / out of scope. No model needed. "Improve with"
  // Flint or My Claude stays optional. Saving also tells project sense what kind of thing this is.
  const CATS = [
    { k: 'game', e: '🎮', t: 'Game', kind: 'game', who: 'Friends who like short, playful games', done: ['One level you can play start to finish', 'Controls that feel good on a keyboard and a phone', 'A win screen and a try-again screen'], out: ['Online multiplayer', 'Accounts and cloud saves', 'More than three levels'] },
    { k: 'app', e: '📱', t: 'App', kind: 'app', who: 'People who want this in their pocket', done: ['One main screen that works', 'What you add is still there after a reload', 'Looks right on a phone'], out: ['Accounts and sign-in', 'Payments', 'App store releases'] },
    { k: 'site', e: '🌐', t: 'Website', kind: 'site', who: 'Visitors who should get it in ten seconds', done: ['A clear headline and one button', 'Works on a phone', 'Live at a link you can share'], out: ['A blog', 'Logins', 'A content editor'] },
    { k: 'tool', e: '🛠️', t: 'Tool', kind: 'tool', who: 'Us, to save time on a boring job', done: ['Runs with one command', 'Handles the common case well', 'A short README with one example'], out: ['A visual interface', 'Plugins', 'Every edge case'] },
    { k: 'bot', e: '🤖', t: 'Bot', kind: 'bot', who: 'Our group chat', done: ['Answers one command', 'Runs on the host computer', 'Explains itself with /help'], out: ['Storing chat history', 'Many servers at once', 'Paid features'] },
    { k: 'other', e: '✨', t: 'Something else', kind: '', who: 'Our tribe and the people we show it to', done: ['A first version friends can try', 'A short README'], out: ['Big features, for now'] },
  ];
  const KIND_CAT = { game: 'game', '3d': 'game', app: 'app', site: 'site', tool: 'tool', api: 'tool', bot: 'bot' };
  function draftFrom(cat, gist) {
    const c = CATS.find(x => x.k === cat) || CATS[5];
    const g = String(gist || '').trim().replace(/\s+/g, ' ');
    const what = g ? cap(g.replace(/([^.!?])$/, '$1.')) : `${c.k === 'other' ? 'Something' : 'A ' + c.t.toLowerCase()} we build together.`;
    return `## What\n${what}\n\n## For whom\n${c.who}.\n\n## Done for v1\n${c.done.map(x => `- ${x}`).join('\n')}\n\n## Out of scope\n${c.out.map(x => `- ${x}`).join('\n')}`;
  }
  async function vision(p, opts = {}) {
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return;
    const h = opts.host !== undefined ? opts.host : me().role === 'host';
    stopWait();
    m.classList.remove('hidden');
    body.innerHTML = `<div class="av-wrap"><span class="eyebrow">Vision · ${esc(p.name)}</span><h2>${h ? 'What are you building?' : 'Suggest a vision'}</h2><p class="lead">Loading…</p></div>`;
    let ctx; try { ctx = await C.api('/assist/vision'); } catch (e) { ctx = { answers: {}, helpers: {}, model: {} }; }
    let sk = ''; try { sk = window.TribeSense && window.TribeSense.kind ? window.TribeSense.kind() : ''; } catch {}
    if (m.classList.contains('hidden')) return;
    const hp = ctx.helpers || {};
    let existing = String(ctx.vision || '').replace(/^#\s+.*\n+/, '').trim();
    if (/Replace these lines together/.test(existing)) existing = '';   // the starter's placeholder is not a vision
    let cat = KIND_CAT[sk] || '';
    const gist0 = (existing.match(/##\s*What\s*\n+([^\n#]+)/i) || [])[1] || (ctx.answers || {}).what || p.bio || '';
    body.innerHTML = `<div class="av-wrap av2">
      <span class="eyebrow">Vision · ${esc(p.name)}</span><h2>${h ? 'What are you building?' : 'Suggest a vision'}</h2>
      <p class="lead">Pick what it is and say the gist. The vision fills in by itself. ${h ? 'It becomes VISION.md, which the plan, the board and every agent read.' : 'It goes to the chat for the host to adopt.'}</p>
      <div class="av-cats" id="av-cats" role="radiogroup" aria-label="What is it?">${CATS.map(c => `<button type="button" role="radio" class="av-cat" data-cat="${c.k}" aria-checked="${c.k === cat}"><span class="emo" aria-hidden="true">${c.e}</span>${esc(c.t)}</button>`).join('')}</div>
      <label class="av-gist-l" for="av-gist">What’s the gist?</label>
      <textarea class="input av-gist" id="av-gist" rows="2" maxlength="400" placeholder="One or two sentences. For example: a cozy platformer where you light lanterns to find your way home.">${esc(gist0)}</textarea>
      <div class="av-draft-h"><span class="av-lbl">Your vision</span><span class="av-improve">Improve with
        <button type="button" class="btn sm av-imp" data-helper="flint">Flint</button>
        <button type="button" class="btn sm av-imp" data-helper="claude" ${hp.claude ? '' : 'disabled title="Connect your AI first"'}>My AI</button></span></div>
      <div class="av-status hidden" id="av-status" role="status"></div>
      <textarea class="input pj-vision-in av-text" id="pj-vtext" rows="9" aria-label="Your vision">${esc(existing)}</textarea>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Later</button><button class="btn primary" id="pj-vsave">${h ? 'Save the vision' : 'Send to chat'}</button></div></div>`;
    const ta = $('#pj-vtext'), st = $('#av-status'), gi = $('#av-gist');
    const status = (html, cls = '') => { st.className = `av-status ${cls}`; st.innerHTML = html; st.classList.toggle('hidden', !html); };
    // The draft follows the chips and the gist until someone edits it by hand.
    let edited = !!existing;
    const redraw = () => { if (edited) return; ta.value = draftFrom(cat || 'other', gi.value); };
    if (!existing) redraw();
    ta.addEventListener('input', e => { if (e.isTrusted) edited = true; });
    gi.addEventListener('input', redraw);
    body.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      cat = b.dataset.cat; body.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      if (edited && !ta.value.trim()) edited = false;
      redraw();
    });
    const close = () => { stopWait(); m.classList.add('hidden'); };
    body.querySelector('[data-close]').onclick = close;
    const fill = (text, note) => { ta.value = text.trim(); edited = true; status(note, 'ok'); };
    const answers = () => { const c = CATS.find(x => x.k === (cat || 'other')); return { what: gi.value.trim(), who: c.who, done: c.done.join('; '), out: c.out.join('; ') }; };

    body.querySelectorAll('.av-imp').forEach(b => b.onclick = async () => {
      if (b.disabled) return;
      const helper = b.dataset.helper; b.disabled = true; stopWait();
      try {
        if (helper === 'flint') {
          status('Flint is drafting…'); busy(true);
          try { const r = await C.api('/assist/vision', { method: 'POST', body: { helper, answers: answers() } }); fill(r.draft, r.by === 'model' ? 'Improved by Flint with the local model. Edit away.' : 'Drafted by Flint from your answers. Edit away.'); }
          finally { busy(false); }
        } else {
          const r = await C.api('/assist/vision', { method: 'POST', body: { helper, answers: answers() } });
          const who = 'your AI';
          status(`<span class="av-spin" aria-hidden="true"></span>Waiting for ${who}… <button type="button" class="linkish" id="av-cancel">Stop waiting</button>`, 'wait');
          busy(true);
          wait = { channel: r.channel, agent: r.agent.id, at: r.at, who, t: setTimeout(() => { if (wait) { stopWait(); status(`${cap(who)} hasn't answered yet. Its reply will be in your private chat with it.`); } }, 10 * 60_000) };
          const cb = $('#av-cancel'); if (cb) cb.onclick = () => { stopWait(); status(''); };
        }
      } catch (e) { status(esc(e.message), 'err'); }
      finally { b.disabled = false; }
    });
    onChat = ev => {
      if (!wait || !ev || ev.channel !== wait.channel) return;
      const msg = ev.message || {}; if (msg.by !== wait.agent || String(msg.at) < String(wait.at)) return;
      if ($('#invite-modal').classList.contains('hidden') || !$('#pj-vtext')) return stopWait();
      const who = wait.who; stopWait();
      fill(clean(msg.text), `Drafted by ${esc(who)}. Edit away.`);
    };
    if (!phone()) (gi.value ? ta : gi).focus();

    $('#pj-vsave').onclick = async () => {
      const t = ta.value.trim(); if (!t) return gi.focus();
      const kind = (CATS.find(x => x.k === cat) || {}).kind;
      try {
        if (h) {
          await C.api('/vision', { method: 'PUT', body: { text: `# ${p.name}\n\n${t}\n` } });
          if (kind) await C.api(`/projects/${encodeURIComponent(p.id)}/sense`, { method: 'PUT', body: { kind } }).catch(() => {});   // project sense follows the category
          toast('Vision saved');
        } else await C.api('/chat/general', { method: 'POST', body: { text: `💡 Vision suggestion for ${p.name}:\n${t}` } }).then(() => toast('Sent to the chat'));
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
