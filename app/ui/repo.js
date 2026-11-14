// Repo view: live status of the project’s code repository, autopilot (host), "needs a desktop" change requests,
// branches with drift + conflict hints, integrations, and the activity log. Also the floating
// Context window (TRIBE_CONTEXT.md, Ctrl+Shift+K).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = iso => { if (!iso) return '–'; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const me = () => C.state().me || {};
  const isHost = () => me().role === 'host';
  const canEdit = () => me().role && me().role !== 'spectator';
  const icon = (id, sz = 15) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#i-${id}"/></svg>`;
  let st = { status: null, settings: null, activity: [], master: null }, changes = [], integrations = [], branches = null, openCr = new Set(), checks = {}, busy = new Set();
  let visible = false;

  // ---------- DOM: rail button, side item, view section, title-bar Context button ----------
  function inject() {
    const bugs = document.querySelector('.rail [data-nav="bugs"]');
    if (bugs && !document.querySelector('.rail [data-nav="repo"]')) bugs.insertAdjacentHTML('afterend', `<button class="nav" data-nav="repo" title="Code repository">${icon('git', 18).replace(' style="width:18px;height:18px"', '')}</button>`);
    const main = $('#main');
    if (main && !$('#view-repo')) main.insertAdjacentHTML('beforeend', `
     <section id="view-repo" class="hidden">
      <div class="view-head"><h1>Code repository</h1><span class="faint" id="repo-sub"></span>
        <button class="btn" id="repo-refresh" style="margin-left:auto" title="Fetch and refresh">${icon('refresh')}Refresh</button>
        <button class="btn primary" id="repo-send">${icon('upload')}Send to a desktop</button></div>
      <div class="repo-strip" id="repo-strip"></div>
      <div class="repo-grid">
        <div class="repo-col">
          <section class="card" id="cr-card"><h3>${icon('upload', 17)}Change requests<span class="chip" id="cr-count">0</span></h3>
            <div class="lead">Changes sent from phones and anywhere you can't push. Anyone (or any agent) can take one; patches apply into <code>change/&lt;id&gt;</code> with one click.</div>
            <div id="cr-list"></div></section>
          <section class="card" id="br-card"><h3>${icon('git', 17)}Branches</h3><div class="lead" id="br-lead">Every branch compared with main, with drift and conflict hints.</div><div id="br-list"></div></section>
          <section class="card" id="int-card"><h3>${icon('vote', 17)}Integrations</h3><div class="lead">The integrator agent proposes a merge order; humans approve on the Board; then it merges, checks and pushes.</div><div id="int-list"></div></section>
        </div>
        <div class="repo-col">
          <section class="card" id="ap-card"><h3>${icon('zap', 17)}Autopilot</h3><div id="ap-body"></div></section>
          <section class="card" id="act-card"><h3>${icon('list', 17)}Activity</h3><div id="act-list" class="act-list"></div></section>
          <section class="card" id="cm-card"><h3>${icon('git', 17)}Recent saved changes</h3><div id="cm-list"></div></section>
        </div>
      </div>
     </section>`);
    const tb = $('.titlebar'), sync = $('#sync-status');
    if (tb && sync && !$('#ctx-btn')) sync.insertAdjacentHTML('beforebegin', `<button class="ctx-btn" id="ctx-btn" title="Tribe context (Ctrl Shift K)">${icon('doc', 14)}<span>Context</span></button>`);
  }
  inject();

  // ---------- loading ----------
  async function load() {
    visible = true;
    if (!C.connected()) return renderOffline();
    try {
      const [r, cr, ints] = await Promise.all([C.api('/repo'), C.api('/changes'), C.api('/integrations')]);
      st = r; changes = cr.changes; integrations = ints.integrations;
      renderAll();
      loadBranches();
    } catch (e) {
      // feat/mobile-complete: a tribe that lives only on this phone has no git; say so calmly, with GitHub-from-the-phone and the next options
      if (window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo() && window.TribeNextOpts) return renderLocal();
      toast('Could not load the code repository: ' + e.message);
    }
  }
  function renderLocal() {
    $('#repo-sub').textContent = '';
    $('#repo-strip').innerHTML = window.TribeNextOpts.card('repo');
    // the cards that need git (shared workspace, shipping, change requests) step aside on a phone-only tribe
    document.querySelectorAll('#view-repo .card, #view-repo section').forEach(c => { if (!c.contains($('#repo-strip')) && !c.querySelector('#repo-strip')) c.hidden = true; });
    if ($('#repo-send')) $('#repo-send').hidden = true;
    for (const id of ['#cr-list', '#br-list', '#int-list', '#ap-body', '#act-list', '#cm-list']) $(id).innerHTML = '';
  }
  let brTimer = null;
  async function loadBranches() {
    if (!st.status || !st.status.enabled) { branches = null; renderBranches(); return; }
    try { branches = await C.api('/repo/branches'); } catch { branches = null; }
    renderBranches();
  }
  const reloadBranchesSoon = () => { clearTimeout(brTimer); brTimer = setTimeout(loadBranches, 800); };
  function renderAll() { renderStrip(); renderChanges(); renderBranches(); renderIntegrations(); renderAutopilot(); renderActivity(); renderCommits(); }

  function renderOffline() {
    $('#repo-sub').textContent = '';
    $('#repo-strip').innerHTML = '<span class="faint">The code repository view is shared, so it needs a tribe. Click <b>Invite friends</b> to start or join one.</span>';
    for (const id of ['#cr-list', '#br-list', '#int-list', '#ap-body', '#act-list', '#cm-list']) $(id).innerHTML = '';
  }

  // ---------- status strip ----------
  function renderStrip() {
    const s = st.status || {};
    if (!s.enabled) {
      $('#repo-sub').textContent = '';
      $('#repo-strip').innerHTML = `<span class="rs-item">${icon('git')}<span class="faint">${esc(s.reason || (s.loading ? 'Reading the code…' : 'No code repository connected to this project yet.'))}</span></span>`;
      return;
    }
    $('#repo-sub').textContent = s.remote && s.remote.github ? s.remote.github : s.name;
    const ci = s.ci ? `<span class="rs-item" title="${esc(s.ci.workflow || '')}"><span class="dot" style="background:${s.ci.conclusion === 'success' ? 'var(--online)' : s.ci.conclusion === 'failure' ? 'var(--ember)' : 'var(--amber)'}"></span>CI ${esc(s.ci.conclusion || s.ci.status)}</span>` : '';
    $('#repo-strip').innerHTML = `
      <span class="rs-item rs-branch" title="Checked-out branch">${icon('git')}<b>${esc(s.branch)}</b></span>
      <span class="rs-item" title="${s.upstream ? `Compared with ${esc(s.upstream)}` : 'No upstream branch'}"><span class="${s.ahead ? 'up' : ''}">↑${s.ahead || 0}</span> <span class="${s.behind ? 'down' : ''}">↓${s.behind || 0}</span></span>
      <span class="rs-item ${s.dirtyCount ? 'warn' : ''}" title="${esc((s.dirty || []).map(f => f.code + ' ' + f.path).join('\n') || 'Working tree clean')}">${s.dirtyCount ? `${s.dirtyCount} changed file${s.dirtyCount > 1 ? 's' : ''}` : 'clean'}${s.untrackedCount ? ` · ${s.untrackedCount} untracked` : ''}</span>
      <span class="rs-item" title="Last push by TribeCode / last update on origin">last push ${esc(ago(s.lastPush || s.originUpdated))}</span>
      ${ci}
      <span class="rs-item faint rs-end" title="Polled every 20 s, fetched every 2 min">${st.settings && st.settings.autopilot.enabled ? '<span class="dot" style="background:var(--live)"></span>autopilot on · ' : ''}checked ${esc(ago(s.checked))}</span>`;
  }

  // ---------- change requests ----------
  const crChip = c => c.status === 'done' ? '<span class="chip teal">done</span>' : c.status === 'claimed' ? `<span class="chip peer">taken · ${esc(c.claimedByName || '')}</span>` : '<span class="chip amber">open</span>';
  function renderChanges() {
    const list = changes.filter(c => c.status !== 'done').concat(changes.filter(c => c.status === 'done').slice(0, 3));
    $('#cr-count').textContent = String(changes.filter(c => c.status !== 'done').length);
    $('#cr-list').innerHTML = list.length ? list.map(c => {
      const mine = c.claimedBy === me().id, open = openCr.has(c.id);
      const canApply = c.hasPatch && !c.branch && c.status !== 'done' && (isHost() || mine) && st.status && st.status.enabled;
      return `<div class="cr ${c.status}" data-cr="${esc(c.id)}">
        <div class="cr-top">${crChip(c)}${c.hasPatch ? `<span class="chip">patch · ${c.patchLines} lines</span>` : ''}${c.branch ? `<span class="chip teal" title="Applied as ${esc(c.commit || '')}">${esc(c.branch)}</span>` : ''}<span class="cr-id">${esc(c.id)}</span></div>
        <button class="cr-title" data-cr-toggle>${esc(c.title)}</button>
        <div class="cr-by">${esc(c.byName)} · ${esc(ago(c.created))}${c.files && c.files.length ? ` · <code>${c.files.map(esc).join('</code> <code>')}</code>` : ''}</div>
        ${open && c.description ? `<div class="cr-desc md">${window.TribeMD.render(c.description)}</div>` : ''}
        ${open && c.hasPatch ? `<pre class="cr-patch" data-patch="${esc(c.id)}">Loading patch…</pre>` : ''}
        ${c.applyError && !c.branch && c.status !== 'done' ? `<pre class="cr-err">${esc(c.applyError)}</pre>` : ''}
        <div class="cr-act">
          ${c.status === 'open' && canEdit() ? '<button class="btn primary sm" data-take>Take it</button>' : ''}
          ${canApply ? `<button class="btn sm" data-apply ${busy.has(c.id) ? 'disabled' : ''}>${busy.has(c.id) ? 'Applying…' : 'Apply patch'}</button>` : ''}
          ${c.status === 'claimed' && (mine || c.by === me().id || isHost()) ? '<button class="btn sm" data-done>Done</button>' : ''}
          ${!open && (c.description || c.hasPatch) ? '<button class="btn ghost sm" data-cr-toggle>Details</button>' : ''}
        </div></div>`;
    }).join('') : '<div class="empty">No change requests. On a phone? Tap <b>Send to a desktop</b> to hand a change to someone who can push.</div>';
    list.filter(c => openCr.has(c.id) && c.hasPatch).forEach(async c => {
      try { const { change } = await C.api('/changes/' + c.id); const pre = document.querySelector(`[data-patch="${c.id}"]`); if (pre) pre.innerHTML = diffHtml(change.patch); } catch {}
    });
  }
  const diffHtml = p => String(p || '').split('\n').slice(0, 120).map(l => `<span class="${/^\+(?!\+\+)/.test(l) ? 'add' : /^-(?!--)/.test(l) ? 'del' : /^@@/.test(l) ? 'hunk' : ''}">${esc(l)}</span>`).join('\n');

  async function crAction(cid, what) {
    busy.add(cid); renderChanges();
    try {
      const r = await C.api(`/changes/${cid}/${what}`, { method: 'POST' });
      if (what === 'apply') toast(`Applied into ${r.branch} (${r.commit})`);
      if (what === 'claim') toast('It\'s yours. A task was added to Doing.');
      const c = r.change; const i = changes.findIndex(x => x.id === c.id); if (i >= 0) changes[i] = { ...changes[i], ...strip(c) };
    } catch (e) {
      if (what === 'apply') { const c = changes.find(x => x.id === cid); if (c) c.applyError = e.message; }
      toast(e.message.split('\n')[0]);
    }
    busy.delete(cid); renderChanges();
    if (what === 'apply') reloadBranchesSoon();
  }
  const strip = c => { const { patch, ...rest } = c; return { ...rest, patchLines: patch ? patch.split('\n').length : rest.patchLines || 0 }; };

  // ---------- branches ----------
  const LV = { ok: 'var(--live)', watch: 'var(--amber)', drifting: 'var(--ember)' };
  function renderBranches() {
    const s = st.status || {};
    if (!s.enabled) { $('#br-lead').textContent = s.reason || 'No code repository connected to this project yet.'; $('#br-list').innerHTML = ''; return; }
    const rows = (s.branches || []);
    const info = branches && branches.branches ? Object.fromEntries(branches.branches.map(b => [b.branch, b])) : {};
    const overlaps = (branches && branches.pairs) || [];
    $('#br-lead').textContent = `Compared with ${s.main}. ${branches ? (branches.conflicts.length ? `${branches.conflicts.length} conflicting pair${branches.conflicts.length > 1 ? 's' : ''} found by a dry-run merge.` : 'No conflicts between branches.') : 'Checking for conflicts…'}`;
    const max = Math.max(10, ...rows.map(b => b.behind));
    $('#br-list').innerHTML = rows.length ? rows.map(b => {
      const x = info[b.branch] || {};
      const hints = [
        ...(x.conflictsWithMain && x.conflictsWithMain.length ? [`<span class="chip ember" title="${esc(x.conflictsWithMain.join(', '))}">conflicts with ${esc(s.main)}</span>`] : []),
        ...(x.conflictsWith || []).map(o => `<span class="chip ember" title="${esc((overlaps.find(p => (p.a === o || p.b === o) && (p.a === b.branch || p.b === b.branch)) || {}).conflictFiles || '')}">conflicts with ${esc(o)}</span>`),
        ...overlaps.filter(p => !p.conflict && (p.a === b.branch || p.b === b.branch)).map(p => `<span class="chip amber" title="${esc(p.overlap.join(', '))}">overlaps ${esc(p.a === b.branch ? p.b : p.a)}</span>`),
        ...(x.changeRequest ? [`<span class="chip peer">${esc(x.changeRequest.id)}</span>`] : []),
      ];
      const ck = checks[b.branch];
      return `<div class="br" data-br="${esc(b.branch)}">
        <div class="br-main"><span class="lv" style="background:${LV[b.level]}" title="${esc(b.level)}"></span><b>${esc(b.branch)}</b>
          <span class="br-meta">${esc(b.author || '')} · ${b.days === 0 ? 'today' : b.days + ' d ago'} · ${b.files} file${b.files === 1 ? '' : 's'}${b.task ? ' · ' + esc(b.task.title) : ''}</span></div>
        <div class="dbar"><i style="width:${Math.max(4, (b.behind / max) * 100)}%;background:${LV[b.level]}"></i></div>
        <span class="dlab" style="color:${LV[b.level]}">${b.ahead} ahead · ${b.behind} behind</span>
        ${isHost() ? `<button class="btn ghost sm" data-check ${ck === 'running' ? 'disabled' : ''}>${ck === 'running' ? 'Checking…' : 'Run checks'}</button>` : ''}
        ${hints.length ? `<div class="br-hints">${hints.join('')}</div>` : ''}
        ${ck && ck !== 'running' ? `<div class="br-check ${ck.ok ? 'ok' : ck.skipped ? '' : 'bad'}">${ck.skipped ? esc(ck.note) : `${ck.ok ? 'Checks passed' : 'Checks failed'} · <code>${esc(ck.command)}</code> · ${(ck.ms / 1000).toFixed(1)} s`}${ck.tail ? `<pre>${esc(ck.tail)}</pre>` : ''}</div>` : ''}
      </div>`;
    }).join('') : `<div class="empty">Only ${esc(s.main)} exists. Everyone is in sync.</div>`;
  }

  // ---------- integrations ----------
  const intChip = i => ({ pending: '<span class="chip amber">awaiting approval</span>', approved: '<span class="chip teal">approved</span>', running: '<span class="chip peer">running</span>',
    merged: '<span class="chip teal">merged</span>', failed: '<span class="chip ember">stopped</span>', rejected: '<span class="chip">rejected</span>' }[i.state] || `<span class="chip">${esc(i.state)}</span>`);
  function renderIntegrations() {
    $('#int-list').innerHTML = integrations.length ? integrations.slice(0, 8).map(i => {
      const r = i.result || {};
      return `<div class="int" data-int="${esc(i.id)}" data-prop="${esc(i.proposal)}">
        <div class="cr-top">${intChip(i)}${i.tally && i.state === 'pending' ? `<span class="chip">${i.tally.yes} of ${i.tally.needed} yes</span>` : ''}<span class="cr-id">${esc(i.id)}</span></div>
        <div class="int-seq">${i.branches.map(b => `<code>${esc(b)}</code>`).join('<span class="arrow">→</span>')}<span class="arrow">→</span><code class="main">${esc(i.main || 'main')}</code></div>
        <div class="cr-by">${esc(i.byName)} · ${esc(ago(i.created))}${i.notes ? ' · ' + esc(i.notes.slice(0, 120)) : ''}</div>
        ${r.steps && r.steps.length ? `<div class="int-steps">${r.steps.map(esc).join(' · ')}</div>` : ''}
        ${r.ok === false ? `<pre class="cr-err">${esc(r.error || '')}${r.conflicts && r.conflicts.length ? '\nConflicts: ' + esc(r.conflicts.join(', ')) : ''}</pre>` : ''}
        <div class="cr-act">
          ${i.state === 'pending' && me().role !== 'agent' && canEdit() ? '<button class="btn sm" data-approve>Approve</button><button class="btn ghost sm" data-reject>Reject</button>' : ''}
          ${(i.state === 'approved' || (i.state === 'failed' && i.proposalStatus === 'approved')) && isHost() ? `<button class="btn primary sm" data-integrate ${busy.has(i.id) ? 'disabled' : ''}>${busy.has(i.id) ? 'Integrating…' : 'Integrate now'}</button>` : ''}
        </div></div>`;
    }).join('') : `<div class="empty">No integrations yet. ${st.master && st.master.name ? `<b>${esc(st.master.name)}</b> (the integrator agent) proposes one with <code>propose_integration</code>.` : 'Turn on the integrator agent in Autopilot.'}</div>`;
  }

  // ---------- autopilot (host) ----------
  const sw = (key, on, label, sub, disabled) => `<div class="ap-row ${disabled ? 'off' : ''}"><div><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</div>
    <button class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-sw="${key}" ${disabled || !isHost() ? 'disabled' : ''} aria-label="${esc(label)}"><i></i></button></div>`;
  function renderAutopilot() {
    const s = st.settings; if (!s) { $('#ap-body').innerHTML = ''; return; }
    const ap = s.autopilot, off = !ap.enabled;
    // the master is the host's agent: work it out from live presence so it updates when it connects
    const people = C.state().members || [], host = people.find(m => m.role === 'host'), agent = host && people.find(m => m.role === 'agent' && m.owner === host.id);
    if (host) st.master = s.integrator ? (agent ? { id: agent.id, name: agent.name } : { id: null, name: `Claude · ${host.name}`, pending: true }) : null;
    $('#ap-body').innerHTML = `
      <div class="lead">${isHost() ? 'Keeps the code repository in sync for you. Off by default. It never force-pushes and never merges code branches without an approved integration.' : 'Only the host changes these. Here is what is on.'}</div>
      <div class="ap-sync" id="ap-sync">${syncLine()}</div>
      ${sw('autopilot.enabled', ap.enabled, 'Autopilot', 'Syncs every 20 seconds while TribeCode runs. Every action is logged below')}
      <div class="ap-sub">
        ${sw('autopilot.autoPull', ap.autoPull, 'Auto-pull main when clean', 'Brings in friends\' pushed work. Fast-forward only', off)}
        ${sw('autopilot.autoPush', !!ap.autoPush, 'Auto-push saved commits', 'Sends your saved commits on main to GitHub. Never force-pushes, never when GitHub has newer work', off)}
        ${sw('autopilot.commitContext', ap.commitContext, 'Commit + push the tribe context', 'TRIBE_CONTEXT.md and tribe docs, if the tribe folder is in the code repository', off)}
        ${sw('autopilot.reportTags', ap.reportTags, 'Report milestone tags', 'Released milestones are tagged and pushed', off)}
      </div>
      <div class="ap-sep"></div>
      ${sw('integrator', s.integrator, 'Integrator agent', st.master ? `${esc(st.master.name)}${st.master.pending ? ' (connect your AI first)' : ''} collects, checks and assembles branches` : 'The host\'s AI agent becomes the master')}
      ${sw('keepContextLocal', s.keepContextLocal, 'Keep TRIBE_CONTEXT.md local', 'Adds it to the code repository\'s .gitignore')}
      <div class="ap-field"><label for="ap-cmd">Check command</label>
        <div class="ap-cmd"><input class="input" id="ap-cmd" placeholder="npm test (when package.json has a test script)" value="${esc(s.checkCommand)}" ${isHost() ? '' : 'disabled'} spellcheck="false">
        ${isHost() ? '<button class="btn sm" id="ap-cmd-save">Save</button>' : ''}</div>
        <span class="faint">Runs in a temporary worktree, never in your working tree. Timeout ${Math.round(s.checkTimeoutSec / 60)} min.</span></div>`;
  }
  // v0.26: where the repo stands against GitHub, in one line, plus "Update now"
  function syncLine() {
    const x = st.status || {}, s = st.settings || {}, A = s.autopilot || {};
    const state = !x.upstream ? 'Not connected to GitHub yet' : x.behind && x.ahead ? `${x.ahead} to push · ${x.behind} to pull (both changed)` : x.behind ? `${x.behind} new on GitHub to pull` : x.ahead ? `${x.ahead} saved commit${x.ahead > 1 ? 's' : ''} to push` : 'In sync with GitHub';
    const mode = !A.enabled ? 'Autopilot off: sync by hand' : A.autoPull && A.autoPush ? 'Autopilot: pull + push' : A.autoPull ? 'Autopilot: pull only' : A.autoPush ? 'Autopilot: push only' : 'Autopilot on, sync off';
    const when = s.lastSync || s.lastPush;
    return `<div class="ap-sync-t"><span class="eyebrow">Sync</span><b>${esc(state)}</b><span class="faint">${esc(mode)}${when ? ' · last synced ' + esc(ago(when)) : ''}${x.dirtyCount ? ` · ${x.dirtyCount} unsaved change${x.dirtyCount > 1 ? 's' : ''}` : ''}</span></div>
      ${isHost() && x.upstream ? '<button class="btn sm primary" id="ap-sync-now">Update now</button>' : ''}`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('#ap-sync-now'); if (!b) return;
    b.disabled = true; b.textContent = 'Updating…';
    try { const r = await C.api('/repo/sync', { method: 'POST' }); st.status = r.status; if (st.settings) st.settings.lastSync = r.lastSync; toast(r.note || (r.done && r.done.length ? 'Synced: ' + r.done.join(', ') : 'Already up to date')); renderAutopilot(); renderStrip(); }
    catch (err) { toast(err.message); b.disabled = false; b.textContent = 'Update now'; }
  });
  async function setSetting(key, value) {
    const body = key.startsWith('autopilot.') ? { autopilot: { [key.split('.')[1]]: value } } : { [key]: value };
    try { const r = await C.api('/repo/settings', { method: 'PUT', body }); st.settings = r.settings; renderAutopilot(); renderStrip(); }
    catch (e) { toast(e.message); }
  }

  // ---------- activity + commits ----------
  const KIND = { pull: 'var(--live)', push: 'var(--live)', sync: 'var(--live)', commit: 'var(--live)', tag: 'var(--brand)', apply: 'var(--live)', integrate: 'var(--live)', checks: 'var(--peer)', propose: 'var(--peer)', settings: 'var(--faint)' };
  function renderActivity() {
    const a = st.activity || [];
    $('#act-list').innerHTML = a.length ? a.slice(0, 30).map(e => `<div class="act"><span class="dot" style="background:${/failed/.test(e.kind) ? 'var(--ember)' : KIND[e.kind] || 'var(--faint)'}"></span>
      <span class="act-t">${esc(e.text)}${e.detail ? `<span class="faint"> · ${esc(e.detail)}</span>` : ''}</span><time>${esc(ago(e.at))}</time></div>`).join('')
      : '<div class="empty">Nothing yet. Autopilot actions, applied patches, checks and integrations show up here.</div>';
  }
  function renderCommits() {
    const c = (st.status && st.status.commits) || [];
    $('#cm-list').innerHTML = c.length ? c.slice(0, 6).map(x => `<div class="cm"><code>${esc(x.sha)}</code><span class="cm-s" title="${esc(x.subject)}">${esc(x.subject)}</span><span class="faint">${esc(x.author)} · ${esc(ago(x.at))}</span></div>`).join('') : '<div class="empty">No saved changes yet.</div>';
  }

  // ---------- "Send to a desktop" ----------
  const looksLikeDiff = t => /^(diff --git |--- |\+\+\+ |@@ )/m.test(t) && /^@@ /m.test(t);
  function sendForm(prefill = {}) {
    if (!C.connected()) { toast('Join a tribe first.'); return; }
    let m = $('#repo-modal');
    if (!m) { document.body.insertAdjacentHTML('beforeend', '<div class="modal hidden" id="repo-modal" role="dialog" aria-label="Send to a desktop"><div class="modal-card" id="repo-modal-body"></div></div>'); m = $('#repo-modal'); m.addEventListener('click', e => { if (e.target === m) close(); }); }
    const close = () => m.classList.add('hidden');
    $('#repo-modal-body').innerHTML = `<h2>Send to a desktop</h2>
      <p class="lead">Can't push from here? Describe the change, paste code or a patch, and a teammate (or their AI) on a desktop takes it from there.</p>
      <div class="field"><label for="sd-title">What should change</label><input class="input" id="sd-title" maxlength="160" placeholder="Fix the jump height on mobile" value="${esc(prefill.title || '')}"></div>
      <div class="field"><label for="sd-desc">Details</label><textarea class="input sd-desc" id="sd-desc" placeholder="Where, why, anything they should know">${esc(prefill.description || '')}</textarea></div>
      <div class="field"><label for="sd-files">Files (optional)</label><input class="input" id="sd-files" placeholder="src/player.ts, src/ui/hud.ts" value="${esc((prefill.files || []).join(', '))}"></div>
      <div class="field"><label for="sd-code">Code or patch (optional)</label><textarea class="input sd-code" id="sd-code" spellcheck="false" placeholder="Paste a unified diff (git diff) to make it one-click to apply, or just code.">${esc(prefill.patch || '')}</textarea>
        <span class="faint sd-hint" id="sd-hint"></span></div>
      <div class="modal-foot"><button class="btn" data-sd-close>Cancel</button><button class="btn primary" id="sd-go">Send</button></div>`;
    m.classList.remove('hidden');
    const hint = () => { const v = $('#sd-code').value; $('#sd-hint').textContent = !v.trim() ? '' : looksLikeDiff(v) ? 'Looks like a patch: it can be applied with one click.' : 'Plain code: it will be attached to the description.'; };
    $('#sd-code').addEventListener('input', hint); hint();
    m.querySelector('[data-sd-close]').onclick = close;
    $('#sd-title').focus();
    $('#sd-go').onclick = async () => {
      const title = $('#sd-title').value.trim(); if (!title) return $('#sd-title').focus();
      const code = $('#sd-code').value, isDiff = looksLikeDiff(code);
      let description = $('#sd-desc').value.trim();
      if (code.trim() && !isDiff) description += `${description ? '\n\n' : ''}\`\`\`\n${code.replace(/```/g, "'''")}\n\`\`\``;
      $('#sd-go').disabled = true;
      try {
        const { change } = await C.api('/changes', { method: 'POST', body: { title, description, patch: isDiff ? code : '', files: $('#sd-files').value } });
        close(); toast('Sent. You\'ll hear when someone takes it.');
        if (!changes.some(c => c.id === change.id)) changes.unshift(strip(change));
        if (visible) renderChanges();
      } catch (e) { toast(e.message); $('#sd-go').disabled = false; }
    };
  }

  // ---------- events ----------
  document.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('#repo-send')) return sendForm();
    if (t.closest('#repo-refresh')) { t.closest('#repo-refresh').disabled = true; try { const r = await C.api('/repo/refresh', { method: 'POST' }); st.status = r.status; renderAll(); loadBranches(); toast(r.status && r.status.enabled === false ? (r.status.reason || 'No code repository yet') : `Refreshed${r.status && r.status.branch ? ' ' + r.status.branch : ''} · ${r.status && r.status.behind ? r.status.behind + ' new from GitHub' : 'up to date'}`); } /* feat/tasks-company: say what Refresh found */ catch (er) { toast(er.message); } $('#repo-refresh').disabled = false; return; }
    if (t.closest('#ctx-btn')) return Ctx.toggle();
    const cr = t.closest('[data-cr]');
    if (cr) {
      const cid = cr.dataset.cr;
      if (t.closest('[data-cr-toggle]')) { openCr.has(cid) ? openCr.delete(cid) : openCr.add(cid); renderChanges(); return; }
      if (t.closest('[data-take]')) return crAction(cid, 'claim');
      if (t.closest('[data-apply]')) return crAction(cid, 'apply');
      if (t.closest('[data-done]')) return crAction(cid, 'done');
    }
    const s = t.closest('[data-sw]');
    if (s && !s.disabled) return setSetting(s.dataset.sw, !s.classList.contains('on'));
    if (t.closest('#ap-cmd-save')) return setSetting('checkCommand', $('#ap-cmd').value);
    const br = t.closest('[data-br]');
    if (br && t.closest('[data-check]')) {
      const b = br.dataset.br; checks[b] = 'running'; renderBranches();
      try { checks[b] = await C.api('/repo/checks', { method: 'POST', body: { branch: b } }); } catch (er) { checks[b] = { ok: false, command: '', ms: 0, tail: er.message }; }
      renderBranches(); return;
    }
    const it = t.closest('[data-int]');
    if (it) {
      if (t.closest('[data-approve]') || t.closest('[data-reject]')) {
        try { await C.api(`/proposals/${it.dataset.prop}/vote`, { method: 'POST', body: { vote: t.closest('[data-approve]') ? 'yes' : 'no' } }); toast('Vote recorded'); refreshIntegrations(); } catch (er) { toast(er.message); }
        return;
      }
      if (t.closest('[data-integrate]')) {
        const id = it.dataset.int; busy.add(id); renderIntegrations();
        try { const r = await C.api(`/integrations/${id}/integrate`, { method: 'POST' }); toast(r.ok ? `Merged into ${r.main}${r.pushed ? ' and pushed' : ''}` : `Stopped: ${r.error}`); } catch (er) { toast(er.message); }
        busy.delete(id); refreshIntegrations(); return;
      }
    }
  });
  document.addEventListener('keydown', e => {
    if (e.target && e.target.id === 'ap-cmd' && e.key === 'Enter') setSetting('checkCommand', e.target.value);
    if (e.key === 'Escape') { const m = $('#repo-modal'); if (m && !m.classList.contains('hidden')) m.classList.add('hidden'); }
  });
  // Ctrl+Shift+K: capture phase so the Ctrl+K palette doesn't also open.
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); Ctx.toggle(); }
  }, true);
  async function refreshIntegrations() { try { integrations = (await C.api('/integrations')).integrations; renderIntegrations(); } catch {} }
  const isShown = () => !$('#view-repo').classList.contains('hidden');
  C.on('repo', m => { st.status = m.status; if (isShown()) { renderStrip(); renderCommits(); const sy = document.getElementById('ap-sync'); if (sy) sy.innerHTML = syncLine(); renderBranches(); reloadBranchesSoon(); } });
  C.on('repo-settings', m => { st.settings = m.settings; if (isShown()) { renderAutopilot(); renderStrip(); } });
  C.on('repo-activity', m => { st.activity = [m.entry, ...(st.activity || [])].slice(0, 60); if (isShown()) renderActivity(); if (/integrate|propose/.test(m.entry.kind)) refreshIntegrations(); });
  C.on('change', m => {
    const i = changes.findIndex(x => x.id === m.change.id);
    if (i >= 0) changes[i] = { ...changes[i], ...m.change }; else changes.unshift({ patchLines: 0, ...m.change });
    if (isShown()) renderChanges();
  });
  C.on('proposal', () => { if (isShown()) refreshIntegrations(); });
  C.on('presence', () => { if (isShown() && st.settings) renderAutopilot(); });
  C.on('hello', () => { if (isShown()) load(); Ctx.refresh(); });

  // ---------- floating Context window ----------
  const Ctx = (() => {
    const KEY = 'tribecode.ctxwin';
    let el = null, open = false, collapsed = false, pos = null, md = '', fetchedAt = null;
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); open = !!s.open; collapsed = !!s.collapsed; pos = s.pos || null; } catch {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ open, collapsed, pos })); } catch {} };
    const phone = () => matchMedia('(max-width: 820px)').matches;
    function build() {
      if (el) return el;
      document.body.insertAdjacentHTML('beforeend', `<div class="ctx-win hidden" id="ctx-win" role="dialog" aria-label="Tribe context">
        <div class="ctx-head" id="ctx-head"><span class="ctx-name">${icon('doc', 14)}TRIBE_CONTEXT.md</span><span class="ctx-time" id="ctx-time"></span>
          <button class="ctx-b" id="ctx-copy" title="Copy for an AI agent">Copy</button>
          <button class="ctx-b" id="ctx-min" title="Collapse">–</button><button class="ctx-b" id="ctx-close" title="Close (Ctrl Shift K)" aria-label="Close">${icon('x', 13)}</button></div>
        <div class="ctx-body md" id="ctx-body"></div></div>`);
      el = $('#ctx-win');
      $('#ctx-close').onclick = () => toggle(false);
      $('#ctx-min').onclick = () => { collapsed = !collapsed; save(); apply(); };
      $('#ctx-copy').onclick = async () => { try { await navigator.clipboard.writeText(md); toast('Context copied. Paste it into any AI chat.'); } catch { toast('Copy failed'); } };
      // drag by the header (desktop only)
      $('#ctx-head').addEventListener('pointerdown', e => {
        if (phone() || e.target.closest('button')) return;
        const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        const move = ev => { pos = { x: Math.min(Math.max(0, ev.clientX - dx), innerWidth - 120), y: Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40) }; place(); };
        const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); save(); };
        addEventListener('pointermove', move); addEventListener('pointerup', up); e.preventDefault();
      });
      addEventListener('resize', place);
      return el;
    }
    function place() {
      if (!el) return;
      if (pos && !phone()) { el.style.left = Math.min(pos.x, innerWidth - 160) + 'px'; el.style.top = Math.min(pos.y, innerHeight - 44) + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; }
      else { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; }
    }
    function apply() {
      build(); el.classList.toggle('hidden', !open); el.classList.toggle('collapsed', collapsed && !phone());
      $('#ctx-min').textContent = collapsed ? '+' : '–'; $('#ctx-min').title = collapsed ? 'Expand' : 'Collapse';
      const b = $('#ctx-btn'); if (b) b.classList.toggle('on', open);
      place();
    }
    async function refresh() {
      if (!open) return;
      build();
      if (!C.connected()) { $('#ctx-body').innerHTML = '<p class="faint">The context file is written by the tribe host. Connect to a tribe to see it.</p>'; return; }
      try {
        const t = (window.TribeStore.get().server || {}).token || '';
        const r = await fetch(C.base() + '/api/context', { headers: t ? { Authorization: 'Bearer ' + t } : {} });
        if (!r.ok) throw new Error(r.statusText);
        md = await r.text(); fetchedAt = new Date();
        const top = $('#ctx-body').scrollTop;
        $('#ctx-body').innerHTML = window.TribeMD.render(md.replace(/^# .*\n/, '').replace(/^> Auto-generated.*\n/m, ''));
        $('#ctx-body').scrollTop = top;
        $('#ctx-time').textContent = 'updated ' + fetchedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      } catch (e) { $('#ctx-body').innerHTML = `<p class="faint">Could not load the context: ${esc(e.message)}</p>`; }
    }
    function toggle(force) { open = typeof force === 'boolean' ? force : !open; save(); apply(); if (open) refresh(); }
    let t = null;
    C.on('context', () => { clearTimeout(t); t = setTimeout(refresh, 250); });
    if (open) setTimeout(() => { apply(); refresh(); }, 0);
    return { toggle, refresh, isOpen: () => open };
  })();

  window.TribeRepo = { load, sendToDesktop: sendForm, context: Ctx };
})();
