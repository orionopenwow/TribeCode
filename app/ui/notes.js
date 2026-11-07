// The top of Docs (desktop and phone), server side in server/notes.js:
//   1. No repo yet: one hero card "Create a repo for <project>?" with compact settings, defaults on (push to a
//      private GitHub repo when the host can, auto-commit, autopilot, a folder per person) and the folder map.
//      Only the host creates; everyone else gets "Ask <host> to create the repo" (a one-tap nudge).
//      With a repo: the pinned repo hero (repohero.js) takes the card's place (phones: mobile2.js draws it).
//   2. The notes catalog ("Begin typing notes here"): type quick lines like chat (Enter adds, Shift+Enter is a
//      new line, the mic dictates). Each raw line shows at once for everyone; the local model then tidies it and
//      files it into a topic doc, shown under the raw line with a link to that doc. Shown while the project has
//      no notes, and always one click away as "Notes" at the top of the docs list.
// Public: window.TribeNotes = { mount, refresh, open, state }.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const me = () => C.state().me || {};
  const member = id => (C.state().members || []).find(m => m.id === id);
  const ico = (d, sz = 16) => `<svg class="i" viewBox="0 0 24 24" style="width:${sz}px;height:${sz}px" aria-hidden="true">${d}</svg>`;
  const TICK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>', UP = '<path d="M12 19V5M6 11l6-6 6 6"/>', MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', GIT = '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-11 5"/>';
  const hhmm = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const DEF = () => ({ github: true, autoCommit: true, autopilot: true, folders: true });

  let st = { pid: null, start: null, entries: null, open: false, opts: DEF(), steps: null, busy: false, token: false, repo: null };
  const reset = () => { st = { pid: C.project(), start: null, entries: null, open: false, opts: DEF(), steps: null, busy: false, token: false, repo: null }; };

  // ---------- mount + data ----------
  function mount() {
    const view = $('#view-docs'); if (!view) return;
    if (st.pid !== C.project()) reset();
    let top = $('#dstart');
    if (!top) { top = document.createElement('div'); top.id = 'dstart'; view.insertBefore(top, view.firstChild); }
    const side = $('#doc-list-wrap');
    if (side && !$('#ds-notes-row')) {
      const row = document.createElement('button'); row.id = 'ds-notes-row'; row.className = 'doc-item ds-row'; row.type = 'button';
      side.insertBefore(row, $('#doc-list'));
      row.onclick = () => open(true);
    }
    render(); load();
  }
  async function load() {
    if (!C.connected()) return render();
    const pid = C.project();
    try {
      const [s, n] = await Promise.all([C.api('/dstart'), C.api('/notes?limit=60')]);
      if (pid !== C.project()) return;
      st.start = s; st.entries = n.entries || [];
      if (s.hasRepo) { try { const r = await C.api('/repo'); st.repo = r.status && r.status.enabled ? r.status : null; } catch { st.repo = null; } }
    } catch (e) { st.start = st.start || null; st.entries = st.entries || []; }
    render();
  }
  const onScreen = () => { const v = $('#view-docs'); return v && !v.classList.contains('hidden'); };

  // ---------- render ----------
  function showNotes() {
    if (!st.entries) return false;
    if (!st.entries.length) st.open = true;   // sticky for this visit: it stays while people type
    return st.open;
  }
  function render() {
    const top = $('#dstart'), view = $('#view-docs'); if (!top || !view) return;
    const s = st.start, noRepo = !!(s && !s.hasRepo);
    view.classList.toggle('ds-norepo', noRepo);
    view.classList.toggle('ds-has-top', !!s);
    const notes = showNotes();
    top.innerHTML = `${noRepo ? card(s) : s && s.hasRepo ? '<div id="ds-hero" class="ds-desk"></div>' : ''}${notes ? notesSection() : ''}`;
    const row = $('#ds-notes-row');
    if (row) { const n = (st.entries || []).length; row.classList.toggle('on', notes); row.innerHTML = `<span class="t">${ico('<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>', 14)}Notes</span><span class="m">${n ? `${n} quick note${n === 1 ? '' : 's'}` : 'Type quick notes'}</span>`; }
    wire();
    const hero = $('#ds-hero');
    if (hero && window.TribeRepoHero && !isPhone()) window.TribeRepoHero.render(hero, { project: { name: s.project.name }, status: st.repo });
    if (window.TribeDocs && window.TribeDocs.current && !window.TribeDocs.current()) window.TribeDocs.renderEmpty && window.TribeDocs.renderEmpty();
  }
  function card(s) {
    const host = s.canCreate, o = st.opts, gh = s.github || {};
    const opt = (k, label, title) => `<button type="button" class="ds-opt ${o[k] ? 'on' : ''}" data-opt="${k}" aria-pressed="${!!o[k]}" title="${esc(title)}"><span class="ds-sw" aria-hidden="true"></span>${label}</button>`;
    const ghOpt = gh.ready ? opt('github', 'GitHub · private', `Push to a new private GitHub repo (${gh.via === 'gh' ? 'gh CLI' : 'saved token'})`)
      : `<button type="button" class="ds-opt ds-connect" id="ds-gh" aria-expanded="${st.token}">${ico(GIT, 14)}Connect GitHub</button>`;
    const people = (s.people || []).map(p => `<span class="ds-chip"><i style="background:${esc(p.color || '#6C7CFF')}"></i>${esc(p.folder)}</span>`).join('');
    const roles = (s.roles || []).map(r => `<span class="ds-chip" title="${esc(r.role)}"><i style="background:${esc(r.color)}"></i>${esc(r.path)}</span>`).join('');
    const steps = st.steps ? `<ol class="ds-steps" aria-label="Progress">${[['repo', 'Repo'], ['folders', 'Folders'], ['github', 'GitHub']].map(([k, l]) => {
      const x = (st.steps[k] || {}).s || 'run'; if (x === 'off') return '';
      return `<li class="${x}" title="${esc((st.steps[k] || {}).note || '')}">${x === 'ok' ? ico(TICK, 13) : x === 'fail' || x === 'todo' ? '·' : '<span class="spin" aria-hidden="true"></span>'}${l}</li>`; }).filter(Boolean).join('')}</ol>` : '';
    return `<section class="hero-card ds-card" id="ds-card" aria-labelledby="ds-card-h">
      <span class="eyebrow">Repo</span>
      <h2 id="ds-card-h">Create a repo for ${esc(s.project.name)}?</h2>
      <p>One git repo for the code, a folder for each person, and the notes. ${host ? (gh.ready ? 'A private copy goes to GitHub.' : 'It stays on this computer until you connect GitHub.') : `${esc((s.host || {}).name || 'The host')} creates it, since git runs on their computer.`}</p>
      ${host ? `<div class="ds-opts" role="group" aria-label="Repo settings">${ghOpt}${opt('autoCommit', 'Auto-commit', 'Commit notes and people folders as they change')}${opt('autopilot', 'Autopilot', 'Keep main in sync with GitHub, commit the tribe context')}${opt('folders', 'Folder per person', 'people/<name>/ for everyone, owned by them and their agents')}</div>
        ${st.token ? `<form class="ds-token" id="ds-token-form"><input class="input" id="ds-token" type="password" autocomplete="off" spellcheck="false" placeholder="GitHub token (repo scope)" aria-label="GitHub token"><button class="btn" type="submit">Save</button></form><p class="ds-fine">Stored on this computer only, never shown again. Or sign in with <code>gh auth login</code>.</p>` : ''}` : ''}
      ${o.folders || !host ? `<div class="ds-map" aria-label="Folders"><span class="eyebrow">Folders</span><div class="ds-chips">${people}${roles}<span class="ds-chip"><i style="background:var(--live)"></i>notes/</span></div></div>` : ''}
      <div class="hero-acts">${host ? `<button class="btn primary" id="ds-create" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Creating…' : 'Create repo'}</button>` : `<button class="btn" id="ds-nudge">Ask ${esc((s.host || {}).name || 'the host')} to create the repo</button>`}${steps}</div>
    </section>`;
  }
  function notesSection() {
    const can = me().role !== 'spectator' && me().role !== 'agent';
    const list = st.entries || [];
    return `<section class="ds-notes" id="ds-notes" aria-labelledby="ds-notes-h">
      <div class="sec-head"><span class="eyebrow">Notes</span><h2 id="ds-notes-h">Begin typing notes here</h2></div>
      <p class="ds-lead">Quick lines, like chat. The local model tidies each one and files it into the living notes.</p>
      <div class="ds-feed" id="ds-feed" aria-live="polite">${list.slice(-40).map(entry).join('')}</div>
      ${can ? `<form class="ds-compose" id="ds-form"><textarea id="ds-input" rows="1" maxlength="2000" placeholder="An idea, a bug, a thing to remember…" aria-label="Add a note" enterkeyhint="send"></textarea>
        ${window.TribeSpeech && window.TribeSpeech.supported() ? `<button type="button" class="ds-mic" data-dictate="ds-input" aria-label="Dictate" title="Dictate">${ico(MIC, 17)}</button>` : ''}
        <button class="ds-send" type="submit" aria-label="Add note">${ico(UP, 17)}</button></form>` : '<p class="ds-fine">Spectators can read the notes.</p>'}
    </section>`;
  }
  function entry(e) {
    const m = member(e.by) || { name: 'someone', color: '#6C7CFF' }, c = e.clean;
    const clean = c ? `<div class="ds-clean"><span class="ds-arrow" aria-hidden="true">↳</span><div class="ds-ct"><b>${esc(c.title)}</b> <span>${esc(c.text)}</span>
        <div class="ds-meta">${c.doc ? `<button class="ds-doc" data-doc="${esc(c.doc)}">${esc(c.docTitle || c.topic)}</button>` : `<span>${esc(c.topic)}</span>`}${(c.tags || []).map(t => `<span class="ds-tag">#${esc(t)}</span>`).join('')}${(c.related || []).map(r => `<span class="ds-rel">↔ ${esc(r)}</span>`).join('')}${c.tidyLater ? '<span class="ds-later" title="No local model was running: plain rules filed this one">tidy later</span>' : ''}</div></div></div>`
      : '<div class="ds-clean wait"><span class="ds-arrow" aria-hidden="true">↳</span><span class="spin" aria-hidden="true"></span>Tidying…</div>';
    return `<div class="ds-e" data-id="${esc(e.id)}"><div class="ds-raw"><span class="ds-dot" style="background:${esc(m.color)}"></span><b>${esc(m.name)}</b><span class="ds-txt">${esc(e.text)}</span><time datetime="${esc(e.at)}">${esc(hhmm(e.at))}</time></div>${clean}</div>`;
  }

  // ---------- actions ----------
  function wire() {
    document.querySelectorAll('#ds-card [data-opt]').forEach(b => b.onclick = () => { st.opts[b.dataset.opt] = !st.opts[b.dataset.opt]; render(); });
    const gh = $('#ds-gh'); if (gh) gh.onclick = () => { st.token = !st.token; render(); const t = $('#ds-token'); if (t) t.focus(); };
    const tf = $('#ds-token-form'); if (tf) tf.onsubmit = async e => {
      e.preventDefault(); const t = $('#ds-token').value.trim(); if (!t) return;
      try { await C.api('/me/git', { method: 'PUT', body: { githubToken: t } }); st.token = false; st.opts.github = true; toast('GitHub connected'); await load(); } catch (x) { toast(x.message); }
    };
    const cr = $('#ds-create'); if (cr) cr.onclick = createRepo;
    const nu = $('#ds-nudge'); if (nu) nu.onclick = async () => { nu.disabled = true; try { await C.api('/dstart/nudge', { method: 'POST' }); nu.textContent = `Asked ${(st.start.host || {}).name || 'the host'}`; } catch (x) { toast(x.message); nu.disabled = false; } };
    const f = $('#ds-form'), ta = $('#ds-input');
    if (f && ta) {
      const size = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };
      ta.oninput = size;
      ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } };
      f.onsubmit = async e => {
        e.preventDefault(); const text = ta.value.trim(); if (!text) return;
        ta.value = ''; size(); st.open = true;
        try { const r = await C.api('/notes', { method: 'POST', body: { text } }); add(r.entry); } catch (x) { ta.value = text; toast(x.message); }
        ta.focus();
      };
    }
    const mic = document.querySelector('#ds-form [data-dictate]'); if (mic) { mic.onmousedown = e => e.preventDefault(); mic.onclick = () => window.TribeSpeech.dictate($('#ds-input')); }
    document.querySelectorAll('#ds-feed [data-doc]').forEach(b => b.onclick = () => openDoc(b.dataset.doc));
    const feed = $('#ds-feed'); if (feed) feed.scrollTop = feed.scrollHeight;
  }
  function openDoc(slug) {
    if (!window.TribeDocs) return;
    window.TribeDocs.open(slug).then(() => { const p = $('#doc-pane'); if (p && isPhone()) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  async function createRepo() {
    if (st.busy) return;
    st.busy = true; st.steps = { repo: { s: 'run' }, folders: { s: 'run' }, github: { s: st.opts.github && st.start.github.ready ? 'run' : 'off' } }; render();
    try {
      const r = await C.api('/dstart/create', { method: 'POST', body: st.opts });
      st.steps = r.steps; st.busy = false; render();
      if (r.steps.repo.s !== 'ok') { toast(r.steps.repo.note || 'Could not create the repo'); return; }
      toast(r.steps.github && r.steps.github.s === 'ok' ? 'Repo created and pushed to GitHub' : 'Repo created');
      setTimeout(() => { st.steps = null; load(); if (window.TribeRepoHero) window.TribeRepoHero.refresh(); if (window.TribeMobile) window.TribeMobile.refresh(); if (window.TribeProjects) window.TribeProjects.refresh(); }, 900);
      return r;
    } catch (x) { st.busy = false; st.steps = null; render(); toast(x.message); }
  }
  function add(e) {
    if (!st.entries) st.entries = [];
    const i = st.entries.findIndex(x => x.id === e.id);
    if (i >= 0) { st.entries[i] = { ...st.entries[i], ...e, clean: e.clean || st.entries[i].clean }; } else st.entries.push(e);
    if (!onScreen() || !$('#ds-feed')) return render();
    const el = document.querySelector(`#ds-feed [data-id="${CSS.escape(e.id)}"]`), html = entry(st.entries.find(x => x.id === e.id));
    if (el) el.outerHTML = html; else $('#ds-feed').insertAdjacentHTML('beforeend', html);
    document.querySelectorAll('#ds-feed [data-doc]').forEach(b => b.onclick = () => openDoc(b.dataset.doc));
    const feed = $('#ds-feed'); feed.scrollTop = feed.scrollHeight;
    const row = $('#ds-notes-row .m'); if (row) row.textContent = `${st.entries.length} quick note${st.entries.length === 1 ? '' : 's'}`;
  }
  function open(focus) {
    st.open = true; render();
    const sec = $('#ds-notes'); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focus) { const t = $('#ds-input'); if (t) t.focus({ preventScroll: true }); }
  }

  // ---------- live ----------
  C.on('ws', m => {
    if (!m || m.project !== C.project()) return;
    if (m.type === 'note' && m.entry) add(m.entry);
    else if (m.type === 'note-clean' && m.clean && st.entries) { const e = st.entries.find(x => x.id === m.clean.id); if (e) add({ ...e, clean: m.clean }); }
    else if (m.type === 'dstart' && onScreen()) load();
  });
  C.on('repo', m => { if (st.start && st.start.hasRepo && m.status) { st.repo = m.status.enabled ? m.status : st.repo; const h = $('#ds-hero'); if (h && window.TribeRepoHero && !isPhone()) window.TribeRepoHero.render(h, { project: { name: st.start.project.name }, status: st.repo }); } });
  C.on('project', () => { reset(); if (onScreen()) mount(); else { const t = $('#dstart'); if (t) t.innerHTML = ''; } });
  C.on('presence', () => { if (st.start && !st.start.hasRepo && onScreen() && !st.busy) { clearTimeout(st.pt); st.pt = setTimeout(load, 600); } });

  window.TribeNotes = { mount, refresh: load, open, state: () => st, active: () => !!(st.start && (!st.start.hasRepo || showNotes())), createRepo: opts => C.api('/dstart/create', { method: 'POST', body: opts }), add: text => C.api('/notes', { method: 'POST', body: { text } }) };
})();
