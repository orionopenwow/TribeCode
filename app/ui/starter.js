// The "+" starter: the smallest flow that gets a project started and working.
//   Top: "Create a new project" (name prefilled) · bottom: "Paste an invite link" (joins with app.js joinLink).
//   After Create, one compact screen per step, each skippable: Repo (the Docs card's defaults: GitHub when the
//   host can, auto-commit, autopilot, a folder per person) · Notes ("What are you making?", typed like messages
//   into the notes catalog; they also seed VISION.md and the flow's notes) · Agent (Connect your Claude Code,
//   live "Connected", and an invite link to copy) · Done opens Chat with the Getting started card folded.
// Creating reuses TribeFlow.create (room, invite link) with the repo left to the Repo step; the repo itself is
// made by server/notes.js (/api/dstart/create), the same as the Docs card. Desktop: a modal; phones: a bottom
// sheet (the shared #invite-modal is one on phones). Public: window.TribeStarter = { open }.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => App() && App().toast(t);
  const me = () => C.state().me || {};
  const ico = (d, sz = 16) => `<svg class="i" viewBox="0 0 24 24" style="width:${sz}px;height:${sz}px" aria-hidden="true">${d}</svg>`;
  const TICK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>', UP = '<path d="M12 19V5M6 11l6-6 6 6"/>', GIT = '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-11 5"/>';
  const STEPS = [['project', 'Project'], ['repo', 'Repo'], ['notes', 'Notes'], ['agent', 'Agent']];
  const modal = () => $('#invite-modal'), body = () => $('#invite-body');
  let s = null, timer = null;

  function close() { clearInterval(timer); timer = null; const m = modal(); if (m) { m.classList.add('hidden'); m.classList.remove('st-modal'); } }
  function frame(html) {
    const m = modal(); m.classList.remove('hidden'); m.classList.add('st-modal');
    body().innerHTML = `<div class="st" id="starter">${html}</div>`;
  }
  const progress = () => `<ol class="st-prog" aria-label="Steps">${STEPS.map(([k, l]) => { const v = s.done[k]; return `<li class="${v === 'ok' ? 'ok' : v === 'skip' ? 'skip' : s.step === k ? 'now' : ''}">${v === 'ok' ? ico(TICK, 12) : ''}${l}</li>`; }).join('<li class="sep" aria-hidden="true">·</li>')}</ol>`;

  // ---------- 1. two options ----------
  function open() {
    if (!C.connected()) return window.TribeSettings.joinPrompt();
    s = { pid: null, step: 'choose', done: {}, opts: { github: true, autoCommit: true, autopilot: true, folders: true }, lines: [], token: false };
    const canCreate = !Array.isArray(me().projects) && me().role !== 'spectator' && me().role !== 'agent';
    const name = window.TribeFlow ? window.TribeFlow.suggestName() : '';
    frame(`<span class="eyebrow">New</span><h2 class="st-h">Start or join a project</h2>
      ${canCreate ? `<section class="st-opt"><h3>Create a new project</h3>
        <form class="st-row" id="st-create-f"><input class="input" id="st-name" maxlength="48" value="${esc(name)}" aria-label="Project name" autocomplete="off"><button class="btn primary" id="st-create">Create</button></form>
        ${me().role === 'host' ? '<button class="linkish st-more" id="st-existing">Bring existing code: a folder, a repo or a GitHub URL</button>' : ''}</section>
      <div class="st-or"><span>or</span></div>` : ''}
      <section class="st-opt"><h3>Paste an invite link</h3>
        <form class="st-row" id="st-join-f"><input class="input" id="st-link" placeholder="https://…/join/k7Qx2" autocomplete="off" spellcheck="false" aria-label="Invite link"><button class="btn ${canCreate ? '' : 'primary'}" id="st-join">Join</button></form></section>
      <div class="modal-foot"><button class="btn ghost" data-close>Cancel</button></div>`);
    body().querySelector('[data-close]').onclick = close;
    const cf = $('#st-create-f'); if (cf) cf.onsubmit = e => { e.preventDefault(); create(); };
    const ex = $('#st-existing'); if (ex) ex.onclick = () => window.TribeProjects.openAdvanced();
    $('#st-join-f').onsubmit = e => { e.preventDefault(); const v = $('#st-link').value.trim(); if (!v) return $('#st-link').focus(); if (!App().parseInvite(v)) return toast('Paste the full invite link, e.g. http://host:4747/join/abc12'); close(); App().joinLink(v); };
    const n = $('#st-name'); if (n) { n.focus(); n.select(); } else $('#st-link').focus();
  }
  async function create() {
    const name = $('#st-name').value.trim() || (window.TribeFlow && window.TribeFlow.suggestName()) || 'New project';
    const b = $('#st-create'); b.disabled = true; b.textContent = 'Creating…';
    try {
      const f = await window.TribeFlow.create(name, { repo: false, stay: true });
      s.pid = f.project; s.name = f.name; s.invite = f.invite; s.done.project = 'ok';
      repoStep();
    } catch (e) { b.disabled = false; b.textContent = 'Create'; toast(e.message); }
  }

  // ---------- 2a. repo ----------
  async function repoStep() {
    s.step = 'repo';
    frame(`${progress()}<p class="st-wait">Checking GitHub…</p>`);
    try { s.start = await C.api('/dstart'); } catch (e) { s.start = { canCreate: false, github: {}, people: [], project: { name: s.name } }; }
    drawRepo();
  }
  function drawRepo(busy, steps) {
    const st = s.start, o = s.opts, gh = st.github || {}, host = st.canCreate;
    const opt = (k, l) => `<button type="button" class="ds-opt ${o[k] ? 'on' : ''}" data-opt="${k}" aria-pressed="${!!o[k]}"><span class="ds-sw" aria-hidden="true"></span>${l}</button>`;
    const stepsHtml = steps ? `<ol class="ds-steps">${[['repo', 'Repo'], ['folders', 'Folders'], ['github', 'GitHub']].map(([k, l]) => { const x = (steps[k] || {}).s || 'run'; return x === 'off' ? '' : `<li class="${x}">${x === 'ok' ? ico(TICK, 13) : x === 'run' ? '<span class="spin"></span>' : '·'}${l}</li>`; }).join('')}</ol>` : '';
    frame(`${progress()}<span class="eyebrow">Repo</span><h2 class="st-h">Create a GitHub repo?</h2>
      <p class="st-p">${host ? (gh.ready ? 'A private GitHub repo with a folder for each person and the notes, kept in sync by autopilot.' : 'A git repo on this computer with a folder for each person and the notes. Connect GitHub to push a private copy.') : `${esc((st.host || {}).name || 'The host')} creates repos, since git runs on their computer. Skip for now; Docs keeps the card.`}</p>
      ${host ? `<div class="ds-opts">${gh.ready ? opt('github', 'GitHub · private') : `<button type="button" class="ds-opt ds-connect" id="st-gh">${ico(GIT, 14)}Connect GitHub</button>`}${opt('autoCommit', 'Auto-commit')}${opt('autopilot', 'Autopilot')}${opt('folders', 'Folder per person')}</div>
        ${s.token ? '<form class="ds-token" id="st-token-f"><input class="input" id="st-token" type="password" autocomplete="off" placeholder="GitHub token (repo scope)" aria-label="GitHub token"><button class="btn">Save</button></form>' : ''}` : ''}
      <div class="modal-foot">${stepsHtml}<span style="flex:1"></span><button class="btn ghost" id="st-skip">${host ? 'Skip' : 'Next'}</button>${host ? `<button class="btn primary" id="st-repo" ${busy ? 'disabled' : ''}>${busy ? 'Creating…' : 'Create repo'}</button>` : ''}</div>`);
    document.querySelectorAll('#starter [data-opt]').forEach(b => b.onclick = () => { o[b.dataset.opt] = !o[b.dataset.opt]; drawRepo(); });
    const g = $('#st-gh'); if (g) g.onclick = () => { s.token = !s.token; drawRepo(); const t = $('#st-token'); if (t) t.focus(); };
    const tf = $('#st-token-f'); if (tf) tf.onsubmit = async e => { e.preventDefault(); const t = $('#st-token').value.trim(); if (!t) return; try { await C.api('/me/git', { method: 'PUT', body: { githubToken: t } }); s.token = false; o.github = true; s.start = await C.api('/dstart'); drawRepo(); toast('GitHub connected'); } catch (x) { toast(x.message); } };
    $('#st-skip').onclick = () => { s.done.repo = 'skip'; notesStep(); };
    const r = $('#st-repo'); if (r) r.onclick = async () => {
      drawRepo(true, { repo: { s: 'run' }, folders: { s: 'run' }, github: { s: o.github && gh.ready ? 'run' : 'off' } });
      try {
        const out = await C.api('/dstart/create', { method: 'POST', body: o });
        if (out.steps.repo.s !== 'ok') { drawRepo(false, out.steps); return toast(out.steps.repo.note || 'Could not create the repo'); }
        drawRepo(true, out.steps); s.done.repo = 'ok';
        if (window.TribeProjects) window.TribeProjects.refresh();
        setTimeout(notesStep, 700);
      } catch (x) { drawRepo(); toast(x.message); }
    };
  }

  // ---------- 2b. notes with context ----------
  function notesStep() {
    s.step = 'notes';
    frame(`${progress()}<span class="eyebrow">Notes</span><h2 class="st-h">What are you making?</h2>
      <p class="st-p">A few quick lines, like messages. The local model tidies them into the project's notes, and they start the vision and the plan.</p>
      <div class="st-lines" id="st-lines">${s.lines.map(l => `<div class="st-line">${esc(l)}</div>`).join('')}</div>
      <form class="ds-compose" id="st-note-f"><textarea id="st-note" rows="1" maxlength="2000" placeholder="A cozy co-op platformer about…" aria-label="A line about the project" enterkeyhint="send"></textarea><button class="ds-send" aria-label="Add line">${ico(UP, 17)}</button></form>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn ghost" id="st-skip">Skip</button><button class="btn primary" id="st-next" ${s.lines.length ? '' : 'disabled'}>Next</button></div>`);
    const ta = $('#st-note'), f = $('#st-note-f');
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } };
    f.onsubmit = async e => {
      e.preventDefault(); const t = ta.value.trim(); if (!t) return;
      ta.value = ''; ta.oninput();
      try { await C.api('/notes', { method: 'POST', body: { text: t } }); s.lines.push(t); $('#st-lines').insertAdjacentHTML('beforeend', `<div class="st-line">${esc(t)}</div>`); $('#st-next').disabled = false; }
      catch (x) { ta.value = t; toast(x.message); }
      ta.focus();
    };
    $('#st-skip').onclick = () => { s.done.notes = s.lines.length ? 'ok' : 'skip'; agentStep(); };
    $('#st-next').onclick = async () => {
      $('#st-next').disabled = true;
      try { await C.api('/dstart/vision', { method: 'POST', body: { lines: s.lines } }); } catch (x) { toast(x.message); }
      s.done.notes = 'ok'; agentStep();
    };
    ta.focus();
  }

  // ---------- 2c. agent ----------
  async function agentStep() {
    s.step = 'agent';
    frame(`${progress()}<p class="st-wait">Making a key for your Claude…</p>`);
    let r = null; try { r = await C.api('/agents', { method: 'POST' }); } catch (e) { r = null; }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || !!window.__TAURI__;
    const cmd = r ? (local ? r.commands.here : r.commands.anywhere || r.commands.wifi || r.commands.here) : '';
    frame(`${progress()}<span class="eyebrow">Agent</span><h2 class="st-h">Add your Claude</h2>
      <p class="st-p">Run this once in a terminal where you code. Your Claude Code joins ${esc(s.name || 'the project')}, reads the notes and the plan, and claims files before editing.</p>
      ${cmd ? `<div class="linkbox"><code id="st-cmd" title="${esc(cmd)}">${esc(cmd)}</code><button class="btn primary" id="st-copy">Copy</button></div>` : '<p class="st-p">Could not make a key right now. Connect later from the right panel.</p>'}
      <div class="cc-status" id="st-agent"><span class="cc-dot"></span>Waiting for Claude Code…</div>
      <div class="modal-foot">${s.invite && s.invite.link ? '<button class="btn ghost" id="st-invite">Copy invite link</button>' : ''}<span style="flex:1"></span><button class="btn primary" id="st-done">Done</button></div>`);
    const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { toast('Select it and copy.'); } };
    const c = $('#st-copy'); if (c) c.onclick = () => copy(cmd, 'Command copied. Paste it in your terminal.');
    const iv = $('#st-invite'); if (iv) iv.onclick = () => copy(s.invite.link, 'Invite link copied. Send it to a friend.');
    $('#st-done').onclick = done;
    const poll = async () => {
      const el = $('#st-agent'); if (!el) return clearInterval(timer);
      try { const a = await C.api('/agents/mine'); if (a.online) { el.innerHTML = `${ico(TICK, 14)}Connected · ${esc(a.agent.name)}`; el.classList.add('on'); s.done.agent = 'ok'; const pr = document.querySelector('#starter .st-prog'); if (pr) pr.outerHTML = progress(); } } catch {}
    };
    clearInterval(timer); timer = setInterval(poll, 2000); poll();
  }

  // ---------- 2d. done ----------
  function done() {
    const pid = s.pid; close();
    if (window.TribeFlow && pid) window.TribeFlow.fold(pid);
    App().show('chat');
    toast(`${s.name || 'Your project'} is ready`);
  }

  window.TribeStarter = { open, state: () => s };
})();
