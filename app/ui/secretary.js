// The Secretary view (#/secretary): today's digest as the one hero card, ask what the team knows, the
// inspiration board (realizations with their sources, one tap to a task or a vote), research requests for
// the agents, the daily journal, and the host's controls (on/off, model, quiet hours, run now).
// Also labels the secretary's chat replies (it answers @secretary in chat).
//   window.TribeSecretary = { open(), close() }
// Server: server/secretary.js (/api/secretary…). The view mounts in <section id="view-secretary"> (index.html).
(function () {
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const md = t => (window.TribeMD ? window.TribeMD.render(t) : `<pre>${esc(t)}</pre>`);
  const inl = t => (window.TribeMD ? window.TribeMD.inline(t) : esc(t));
  const NAME = 'secretary';
  const glyph = (k, n) => (window.TribeAgentsHub ? window.TribeAgentsHub.glyph(k, n) : '');
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const KIND = { chat: 'chat', voice: 'voice note', image: 'image', doc: 'doc', file: 'file', commit: 'commit', decision: 'decision', vote: 'vote', agent: 'agent', task: 'task', note: 'note', research: 'research', idea: 'idea', question: 'question', topic: 'topic' };
  const DOT = { decision: '#3BD16F', question: '#FFB86B', research: '#38C6B1', task: '#6C7CFF', topic: '#F26B1D', idea: '#F26B1D', doc: '#94A3B8', file: '#94A3B8', commit: '#38C6B1', voice: '#E86A92', image: '#E86A92' };

  let data = null, open = false, day = null, answer = null, busy = false;
  const section = () => document.getElementById('view-' + NAME);

  // ---------- mounting (beside app.js views) ----------
  function show() {
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));   // the app's nav: nothing of its own is current
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = 'Secretary';
    if (location.hash !== '#/' + NAME) history.replaceState(null, '', location.pathname + location.search + '#/' + NAME);
    try { C.sendActivity && C.sendActivity('Secretary'); } catch {}
    load();
  }
  function hide() {
    const sec = section(); if (sec) sec.classList.add('hidden');
    open = false;
    if (location.hash === '#/' + NAME) history.replaceState(null, '', location.pathname + location.search);
  }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  const fromHash = () => { if (location.hash === '#/' + NAME && !open) show(); };
  window.addEventListener('hashchange', fromHash);
  let soon = null;
  if (C && C.on) {
    C.on('hello', () => { setTimeout(fromHash, 50); if (open) load(true); });
    C.on('ws', m => { if (open && (m.type === 'secretary' || m.type === 'secretary-config')) { clearTimeout(soon); soon = setTimeout(() => load(true), 250); } });
    C.on('project', () => { if (open) { day = null; answer = null; load(); } });
  }
  setTimeout(fromHash, 0);

  // ---------- chat: the secretary's replies get a name and a glyph ----------
  function label(root) {
    root.querySelectorAll('.msg[data-by="secretary"]:not(.sy-msg)').forEach(el => {
      el.classList.add('sy-msg', 'brain');
      const b = el.querySelector('.mb > b, div > b'); if (b) b.textContent = 'Secretary';
      const av = el.querySelector('.avatar'); if (av) { av.className = 'avatar av-sec'; av.removeAttribute('style'); av.innerHTML = glyph('secretary', 16); }
    });
  }
  new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches && n.matches('.msg[data-by="secretary"]')) label(n.parentNode || document); else if (n.querySelector && n.querySelector('.msg[data-by="secretary"]')) label(n); } })
    .observe(document.body, { childList: true, subtree: true });

  // ---------- data ----------
  async function load(quiet) {
    const sec = section(); if (!sec) return;
    if (!C.hasToken || !C.hasToken()) { sec.innerHTML = `<div class="sy">${head()}<p class="faint">Start or join a tribe first.</p></div>`; return; }
    try {
      data = await C.api('/secretary');
      if (day && day !== data.journal.date) { try { const j = await C.api('/secretary/journal/' + day); data.journal = j; } catch { day = null; } }
    } catch (e) { if (!quiet) sec.innerHTML = `<div class="sy">${head()}<p class="faint">${esc(e.message)}</p></div>`; return; }
    if (quiet && document.activeElement && document.activeElement.closest && document.activeElement.closest('#view-secretary input, #view-secretary textarea, #view-secretary select')) return;
    render();
  }
  function status() {
    if (!data) return '';
    const s = !data.enabled ? ['off', 'Off'] : data.quiet ? ['quiet', 'Quiet hours'] : data.running ? ['live', 'Thinking'] : ['live', 'On'];
    return `<span class="sy-pill ${s[0]}"><i></i>${s[1]}${data.lastTick ? ` · read ${ago(data.lastTick)}` : ''}</span>`;
  }
  const head = () => `<header class="sec-head sy-head"><div><span class="eyebrow">Secretary</span><h1>What matters now</h1></div>${status()}</header>`;
  function srcBtn(ref, text) {
    if (!ref) return '';
    return `<button class="sy-src" data-ref-type="${esc(ref.type)}" data-ref-id="${esc(ref.id)}" title="${esc(text || '')}">${esc(KIND[ref.type] || ref.type)}</button>`;
  }

  function hero() {
    const d = data.digest || { items: [] };
    const img = `<img class="sy-flare" src="assets/illustrations/brain.svg" alt="" aria-hidden="true">`;
    if (!d.items.length) {
      return `<section class="hero-card sy-hero">${img}<span class="eyebrow">Digest</span><h2>${data.enabled ? 'Nothing to report yet' : 'A secretary for the tribe'}</h2>
        <p>${data.enabled ? 'It reads chat, voice notes, docs, files and code changes as they come in, then writes the ten things that matter here.' : 'It reads what everyone types, says and drops in, keeps a daily journal and a digest, dreams up ideas that connect people\'s work, and asks the agents to research what nobody knows yet. It runs on this computer and stays off until the host turns it on.'}</p>
        ${data.host ? `<div class="hero-acts">${data.enabled ? '<button class="btn primary" data-run>Read everything now</button>' : '<button class="btn primary" data-enable>Turn on the secretary</button>'}</div>` : ''}</section>`;
    }
    return `<section class="hero-card sy-hero">${img}<span class="eyebrow">Digest · ${esc(ago(d.updated))}</span><h2>${esc(data.inShort || 'The ten things that matter now')}</h2>
      <ol class="sy-digest">${d.items.map(x => `<li style="--dot:${DOT[x.kind] || 'var(--faint)'}"><span class="sy-dot"></span><span class="sy-t">${inl(x.text)}</span>${srcBtn(x.ref, x.text)}</li>`).join('')}</ol>
      ${data.host ? `<div class="hero-acts"><button class="btn" data-run>Read everything now</button></div>` : ''}</section>`;
  }
  function askHtml() {
    return `<section class="sec"><div class="sec-head"><span class="eyebrow">Ask</span><h2>What does the team know?</h2></div>
      <form class="sy-ask" id="sy-ask"><input class="input" id="sy-q" maxlength="500" placeholder="Ask anything, or start with note: to tell the secretary something" autocomplete="off"><button class="btn primary" type="submit"${busy ? ' disabled' : ''}>${busy ? 'Thinking…' : 'Ask'}</button></form>
      ${answer ? `<div class="sy-answer"><div class="sy-answer-t">${md(answer.answer)}</div>${answer.sources && answer.sources.length ? `<div class="sy-answer-s">${answer.sources.map(s => `<span>${esc(s)}</span>`).join('')}</div>` : ''}</div>` : ''}
      <p class="faint sy-hint">In chat, write <code>@secretary</code> and a question, <code>@secretary note …</code> or <code>@secretary research …</code>.</p></section>`;
  }
  function ideasHtml() {
    const ideas = data.ideas || [];
    return `<section class="sec"><div class="sec-head"><span class="eyebrow">Dreams</span><h2>Inspiration board</h2></div>
      ${ideas.length ? `<div class="sy-ideas">${ideas.map(i => `<article class="sy-idea" data-idea="${esc(i.id)}">
        <div class="sy-idea-top"><h3>${esc(i.title)}</h3>${i.status === 'task' ? '<span class="sy-tag task">task</span>' : i.status === 'vote' ? '<span class="sy-tag vote">vote</span>' : ''}<button class="sy-x" data-dismiss="${esc(i.id)}" title="Not useful" aria-label="Dismiss">×</button></div>
        <p>${esc(i.body)}</p>
        <div class="sy-srcs">${(i.sources || []).map(s => `<button class="sy-src2" data-ref-type="${esc(s.type)}" data-ref-id="${esc(s.id)}" title="${esc(s.label)}"><b>${esc(s.who || '')}</b>${esc(KIND[s.kind] || s.type)}</button>`).join('')}</div>
        ${i.status === 'new' && data.canAct !== false ? `<div class="sy-idea-acts"><button class="btn" data-task="${esc(i.id)}">Make it a task</button><button class="btn" data-vote="${esc(i.id)}">Suggest a vote</button></div>` : ''}
      </article>`).join('')}</div>` : `<div class="sy-empty">Realizations appear here when two people's work points the same way: a sketch and a voice note, a doc and a question.</div>`}</section>`;
  }
  function researchHtml() {
    const rq = data.requests || [];
    const open = rq.filter(r => r.status === 'open'), done = rq.filter(r => r.status === 'answered').slice(0, 6);
    return `<section class="sec"><div class="sec-head"><span class="eyebrow">Research</span><h2>For the agents</h2></div>
      <p class="sy-lead">The secretary never browses. It hands questions to the team's Claudes, who file short findings back (MCP <code>secretary_inbox</code> → <code>secretary_file</code>).</p>
      <form class="sy-ask" id="sy-rq"><input class="input" id="sy-rq-q" maxlength="300" placeholder="Ask the agents to look into…" autocomplete="off"><button class="btn" type="submit">Request</button></form>
      <div class="sy-rqs">${open.map(r => `<div class="sy-rq open" data-rq="${esc(r.id)}"><span class="sy-st"><i></i>open</span><div><b>${esc(r.question)}</b><small>${esc(r.byName)}${r.why ? ' · ' + esc(r.why) : ''} · ${ago(r.at)}</small></div></div>`).join('')}
        ${done.map(r => `<div class="sy-rq done" data-rq="${esc(r.id)}"><span class="sy-st live"><i></i>found</span><div><b>${esc(r.question)}</b><ul>${r.findings.map(f => `<li>${inl(f)}</li>`).join('')}</ul><small>Filed by ${esc(r.filedByName || 'an agent')} · ${ago(r.filedAt)}${r.sources.length ? ' · ' + r.sources.map(s => esc(s)).join(' · ') : ''}</small></div></div>`).join('')}
        ${!open.length && !done.length ? '<div class="sy-empty">No research yet. Questions like "which library should we use…?" in chat become requests by themselves.</div>' : ''}</div></section>`;
  }
  function journalHtml() {
    const j = data.journal || {}, days = data.days || [];
    const body = (j.md || '').replace(/^# .*\n/, '').replace(/^_.*_\n/m, '');
    return `<section class="sec"><div class="sec-head sy-jhead"><div><span class="eyebrow">Journal</span><h2>${esc(j.date ? new Date(j.date + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : 'Today')}</h2></div>
      ${days.length > 1 ? `<select class="sy-day" id="sy-day" aria-label="Pick a day">${days.map(d => `<option value="${d}"${d === j.date ? ' selected' : ''}>${d}</option>`).join('')}</select>` : ''}</div>
      ${body.trim() ? `<article class="sy-journal">${md(body)}</article>` : '<div class="sy-empty">The journal starts with the first run.</div>'}
      <p class="faint sy-hint">Saved in the tribe folder and, when the autopilot saves the tribe context, in the code repository at <code>${esc((data.repo || {}).path || 'notes/secretary/')}</code>.</p></section>`;
  }
  function settingsHtml() {
    if (!data.host) return '';
    const c = data.config, models = (data.brain || {}).models || [];
    const tog = (k, on, t, sub) => `<button class="toggle" role="switch" aria-checked="${on}" data-tog="${k}"><span>${t}${sub ? `<small>${sub}</small>` : ''}</span><span class="switch"></span></button>`;
    return `<section class="sec"><div class="sec-head"><span class="eyebrow">Host</span><h2>How the secretary works</h2></div>
      <div class="sy-set">
        <div class="toggles">${tog('enabled', c.enabled, 'Secretary on', 'Reads new work on a timer, writes notes, dreams up ideas')}
          ${tog('useBrain', c.useBrain, 'Use the local model', (data.brain || {}).online ? 'Ollama is running on this computer' : 'Ollama is not running: plain rules instead')}
          ${tog('quiet', c.quiet.on, 'Quiet hours', 'No background runs at night')}
          ${tog('repoNotes', c.repoNotes, 'Notes in the code repository', 'Committed with the tribe context when the autopilot does that')}</div>
        <div class="sy-fields">
          <label><span class="eyebrow">Model</span><select id="sy-model"><option value="">Default${(data.brain || {}).model && !c.model ? ` (${esc(data.brain.model)})` : ''}</option>${models.map(m => `<option value="${esc(m)}"${m === c.model ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
          <label><span class="eyebrow">Every</span><select id="sy-every">${[5, 10, 15, 30, 60, 120].map(n => `<option value="${n}"${n === c.everyMin ? ' selected' : ''}>${n < 60 ? n + ' min' : n / 60 + ' h'}</option>`).join('')}</select></label>
          <label><span class="eyebrow">Quiet from</span><input type="time" id="sy-from" value="${esc(c.quiet.from)}"></label>
          <label><span class="eyebrow">until</span><input type="time" id="sy-to" value="${esc(c.quiet.to)}"></label>
        </div>
      </div></section>`;
  }
  function render() {
    const sec = section(); if (!sec || !data) return;
    sec.innerHTML = `<div class="sy">${head()}${hero()}${askHtml()}${ideasHtml()}${researchHtml()}${journalHtml()}${settingsHtml()}</div>`;
    wire();
  }

  // ---------- actions ----------
  const put = async body => { try { await C.api('/secretary/config', { method: 'PUT', body }); await load(true); } catch (e) { toast(e.message); } };
  async function runNow(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
    try { const r = await C.api('/secretary/tick', { method: 'POST' }); const p = (r.projects || [])[0] || {}; toast(p.error ? p.error : `Read ${p.ingested || 0} new thing${p.ingested === 1 ? '' : 's'}${p.ideas ? `, ${p.ideas} new idea${p.ideas === 1 ? '' : 's'}` : ''}.`); } catch (e) { toast(e.message); }
    await load(true);
  }
  function jump(type, rid) {
    const A = window.TribeApp;
    if (type === 'chat') { A.show('chat'); setTimeout(() => { const el = document.querySelector(`#chat-list .msg[data-id="${CSS.escape(rid)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('pp-flash'); setTimeout(() => el.classList.remove('pp-flash'), 1800); } else toast('That message is further back in chat.'); }, 150); }
    else if (type === 'doc') { A.show('docs'); setTimeout(() => window.TribeDocs && window.TribeDocs.open(rid), 150); }
    else if (type === 'task') A.show('tasks');
    else if (type === 'commit' || type === 'file') { A.show('repo'); toast(type === 'commit' ? `Commit ${String(rid).slice(0, 7)}` : rid); }
    else if (type === 'research') { const el = document.querySelector(`[data-rq="${CSS.escape(rid)}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else if (type === 'idea') { const el = document.querySelector(`[data-idea="${CSS.escape(rid)}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    else if (type === 'agent' && window.TribePeople) window.TribePeople.open(rid);
  }
  function wire() {
    const sec = section();
    sec.querySelectorAll('[data-run]').forEach(b => b.onclick = () => runNow(b));
    sec.querySelectorAll('[data-enable]').forEach(b => b.onclick = async () => { await put({ enabled: true }); runNow(); });
    sec.querySelectorAll('[data-ref-type]').forEach(b => b.onclick = () => jump(b.dataset.refType, b.dataset.refId));
    $('#sy-ask').onsubmit = async e => {
      e.preventDefault(); const q = $('#sy-q').value.trim(); if (!q || busy) return;
      const note = q.match(/^(note|remember|fyi)\b[:\s]*(.+)/i);
      busy = true; render();
      try {
        if (note) { await C.api('/secretary/note', { method: 'POST', body: { text: note[2] } }); answer = { answer: 'Noted. It is in today\'s journal.', sources: [] }; }
        else answer = await C.api('/secretary/ask', { method: 'POST', body: { question: q } });
      } catch (err) { answer = { answer: err.message, sources: [] }; }
      busy = false; await load(true); render();
    };
    $('#sy-rq').onsubmit = async e => {
      e.preventDefault(); const q = $('#sy-rq-q').value.trim(); if (!q) return;
      try { await C.api('/secretary/requests', { method: 'POST', body: { question: q } }); toast('Requested. The agents see it in secretary_inbox.'); $('#sy-rq-q').value = ''; load(true); } catch (err) { toast(err.message); }
    };
    sec.querySelectorAll('[data-task]').forEach(b => b.onclick = async () => { b.disabled = true; try { await C.api(`/secretary/ideas/${b.dataset.task}/task`, { method: 'POST' }); toast('Made it a task.'); load(true); } catch (e) { toast(e.message); b.disabled = false; } });
    sec.querySelectorAll('[data-vote]').forEach(b => b.onclick = async () => { b.disabled = true; try { await C.api(`/secretary/ideas/${b.dataset.vote}/vote`, { method: 'POST' }); toast('Vote posted in chat.'); load(true); } catch (e) { toast(e.message); b.disabled = false; } });
    sec.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = async () => { try { await C.api(`/secretary/ideas/${b.dataset.dismiss}/dismiss`, { method: 'POST' }); load(true); } catch (e) { toast(e.message); } });
    const dsel = $('#sy-day'); if (dsel) dsel.onchange = async () => { day = dsel.value; try { data.journal = await C.api('/secretary/journal/' + day); render(); } catch (e) { toast(e.message); } };
    sec.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => {
      const k = b.dataset.tog, on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(on));
      put(k === 'quiet' ? { quiet: { on } } : { [k]: on });
    });
    const sel = (i, f) => { const el = $(i); if (el) el.onchange = () => put(f(el.value)); };
    sel('#sy-model', v => ({ model: v })); sel('#sy-every', v => ({ everyMin: Number(v) }));
    sel('#sy-from', v => ({ quiet: { from: v } })); sel('#sy-to', v => ({ quiet: { to: v } }));
  }

  window.TribeSecretary = { open: show, close: hide, isOpen: () => open };
})();
