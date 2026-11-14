// Approval board: proposals + votes, VISION.md, milestones (release = git tag on the host).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TEMPLATE = '## Problem\nWhat is wrong or missing today?\n\n## Plan\nWhat we will build, in a few sentences.\n\n## Tasks\n- [ ] First task\n- [ ] Second task\n';
  let proposals = [], milestones = [], tab = 'open', loaded = false, open = new Set(), hasRepo = false;
  // feat/tasks-company: no code repository yet → say so and offer to make one (TribeProjects.step('repo')), never a dead end
  const repoBtn = label => `<button class="btn sm" data-connect-repo>${label || 'Set up the code repository'}</button>`;
  function connectRepo() {
    const P = window.TribeProjects;
    if (isHost() && P && P.step) return P.step('repo');
    if (window.TribeShell && window.TribeShell.go) return window.TribeShell.go('repo');
    window.TribeApp.show('repo');
  }

  const meId = () => (C.state().me || {}).id;
  const isHost = () => (C.state().me || {}).role === 'host';
  const nameOf = id => { const m = (C.state().members || []).find(x => x.id === id); return m ? m.name : 'someone'; };
  const mdLite = t => esc(t).split('\n').map(l => {
    if (/^#{1,6}\s/.test(l)) return `<b class="h">${l.replace(/^#{1,6}\s/, '')}</b>`;
    if (/^\s*[-*]\s\[[xX]\]\s/.test(l)) return '☑ ' + l.replace(/^\s*[-*]\s\[[xX]\]\s/, '');
    if (/^\s*[-*]\s\[ \]\s/.test(l)) return '☐ ' + l.replace(/^\s*[-*]\s\[ \]\s/, '');
    if (/^\s*[-*]\s/.test(l)) return '• ' + l.replace(/^\s*[-*]\s/, '');
    return l;
  }).join('\n').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };

  async function load() {
    if (!C.connected()) { renderOffline(); return; }
    try {
      const [p, ms, v] = await Promise.all([C.api('/proposals'), C.api('/milestones'), C.api('/vision')]);
      proposals = p.proposals; milestones = ms.milestones; loaded = true; hasRepo = !!ms.repo;
      $('#ms-lead').textContent = ms.repo ? `Approved proposals become milestones. Releasing tags the project’s code repository (next: ${ms.next}).` : `Approved proposals become milestones (next: ${ms.next}). Give the project a code repository to tag releases in git.`;
      renderVision(v.text); render(); loadRadar();
    } catch (e) { window.TribeApp.toast('Could not load the board: ' + e.message); }
  }

  async function loadRadar() {
    try {
      const r = await C.api('/drift');
      if (!r.enabled) { $('#radar-lead').textContent = r.reason; $('#radar-list').innerHTML = `<div class="radar-why"><p class="faint">The radar compares each branch of the code repository with the main line, so it needs a repository with git in it.</p>${repoBtn()}</div>`; bindRepo(); return; }
      $('#radar-lead').textContent = `Branches compared with ${r.main}. Behind = commits on ${r.main} they don't have yet.`;
      const max = Math.max(10, ...r.branches.map(b => b.behind));
      const color = { ok: 'var(--accent-2)', watch: 'var(--amber)', drifting: 'var(--ember)' };
      $('#radar-list').innerHTML = r.branches.length ? r.branches.map(b => `<div class="drow" title="${esc(b.sample.join(', '))}">
          <div class="dname"><b>${esc(b.branch)}</b><span>${esc(b.author || '')} · ${b.days === 0 ? 'today' : b.days + ' d ago'}${b.task ? ' · ' + esc(b.task.title) : ' · <span style="color:var(--amber)">no task</span>'}</span></div>
          <div class="dbar"><i style="width:${Math.max(4, (b.behind / max) * 100)}%;background:${color[b.level]}"></i></div>
          <span class="dlab" style="color:${color[b.level]}">${b.behind ? b.behind + ' behind' : 'in sync'}${b.ahead ? ' · ' + b.ahead + ' ahead' : ''}</span></div>`).join('')
        : '<div class="faint" style="font-size:13px">Only the main branch exists. Everyone is in sync.</div>';
    } catch (e) {
      $('#radar-lead').textContent = 'The drift radar could not read the branches just now.';
      $('#radar-list').innerHTML = `<div class="radar-why"><p class="faint">${esc(e.message || 'The host did not answer.')} It reads the branches of the project's code repository on the host.</p><button class="btn sm" data-radar-retry>Try again</button></div>`;
      const b = $('[data-radar-retry]'); if (b) b.onclick = () => { b.disabled = true; b.textContent = 'Checking…'; loadRadar(); };
    }
  }

  function renderOffline() {
    window.TribeUI.empty($('#prop-list'), { kind: 'needs-tribe', bare: true, title: 'Proposals are shared with your tribe', line: 'Start a tribe or join one, and what people propose shows up here for a vote.', action: { label: 'Start a tribe', run: () => (window.TribeNew ? window.TribeNew.open() : window.TribeApp.openInvite()) } });
    $('#ms-list').innerHTML = ''; $('#vision-text').textContent = '';
  }

  function chipFor(p) {
    if (p.status === 'approved') return `<span class="chip teal">Approved → ${esc(p.milestone || '')}</span>`;
    if (p.status === 'parked') return '<span class="chip ember">Parked</span>';
    if (p.status === 'withdrawn') return '<span class="chip">Withdrawn</span>';
    return `<span class="chip amber">Voting · needs ${p.tally.needed} yes</span>`;
  }

  function render() {
    document.querySelectorAll('[data-pt]').forEach(b => b.classList.toggle('on', b.dataset.pt === tab));
    const list = proposals.filter(p => tab === 'parked' ? ['parked', 'withdrawn'].includes(p.status) : p.status === tab);
    $('#prop-list').innerHTML = list.length ? list.map(p => {
      const t = p.tally, mine = (p.votes || {})[meId()];
      const w = n => `${(n / Math.max(1, t.voters)) * 100}%`;
      const long = (p.body || '').split('\n').length > 7;
      // approval-cards: one tall card per proposal: a short summary, the vote, two big buttons and a comment box
      const plan = (p.body || '').split('\n').map(l => l.trim()).filter(l => l && !/^#/.test(l) && !/^- \[ \]/.test(l)).slice(0, 3).join(' ');
      const comments = (p.comments || []).slice(-3);
      const yes = mine === 'yes', no = mine === 'no';
      return `<article class="prop ap-card" data-pid="${esc(p.id)}">
        <div class="top">${chipFor(p)}${p.vision ? `<span class="chip ${p.vision.fits ? 'teal' : 'ember'}" title="${esc(p.vision.note || '')}">${p.vision.fits ? '🧭 Fits the vision' : '🧭 Off the vision'}</span>` : ''}${p.tasks && p.tasks.length ? `<span class="chip">📋 ${p.tasks.length} tasks</span>` : ''}</div>
        <h3>${esc(p.title)}</h3><div class="by">${esc(nameOf(p.by))} · ${ago(p.created)}</div>
        <div class="ap-thumb">${plan ? esc(plan.length > 220 ? plan.slice(0, 218).replace(/\s+\S*$/, '') + '…' : plan) : '<span class="faint">No details yet.</span>'}</div>
        ${p.body ? `<details class="ap-full" ${open.has(p.id) ? 'open' : ''}><summary data-more>Read the whole proposal</summary><div class="body open">${mdLite(p.body)}</div></details>` : ''}
        <div class="votes"><div class="vbar"><i style="width:${w(t.yes)};background:var(--accent-2)"></i><i style="width:${w(t.no)};background:var(--ember)"></i></div>
          <span>👍 ${t.yes} · 👎 ${t.no} · ⏳ ${t.pending} to vote</span></div>
        ${p.status === 'open' ? `<div class="ap-acts"><button class="ap-btn ap-yes ${yes ? 'on' : ''}" data-vote="yes" aria-pressed="${yes}">✓ Approve</button><button class="ap-btn ap-no ${no ? 'on' : ''}" data-vote="no" aria-pressed="${no}">✕ Deny</button></div>` : ''}
        ${comments.length ? `<ul class="ap-comments">${comments.map(c => `<li><b>${esc(nameOf(c.by))}</b> ${esc(c.text)}</li>`).join('')}</ul>` : ''}
        ${p.status === 'open' ? `<form class="ap-say" data-comment><input class="input" maxlength="1000" placeholder="Add a comment…" aria-label="Comment on ${esc(p.title)}"><button class="btn" type="submit">Send</button></form>` : ''}
        ${p.status === 'open' && (p.by === meId() || isHost()) ? '<button class="linkish ap-withdraw" data-withdraw>Withdraw this proposal</button>' : ''}
      </article>`;
    }).join('') : `<div class="prop-empty">${tab === 'open' ? 'No open proposals. Got an idea that changes the plan? Click <b>New proposal</b>.' : 'Nothing here yet.'}</div>`;

    $('#ms-list').innerHTML = milestones.length ? milestones.slice().reverse().map(m => `<div class="mile"><code>${esc(m.version)}</code><span class="grow" title="${esc(m.title)}">${esc(m.title)}</span>
      ${m.status === 'released' ? `<span class="chip teal" title="${esc(m.git && m.git.tagged ? 'Tagged in git' : 'Recorded without a git tag')}">${m.git && m.git.pushed ? 'pushed' : 'released'}</span>` : isHost() ? `<button class="btn" data-release="${esc(m.version)}">Release</button>` : '<span class="chip amber" title="The host releases milestones">planned</span>'}</div>`).join('') + (!hasRepo && isHost() && milestones.some(m => m.status !== 'released') ? `<div class="ms-repo">${repoBtn('Set up the code repository to tag releases')}</div>` : '')
      : '<div class="faint" style="font-size:13px">No milestones yet. An approved proposal becomes the next one: <button class="btn sm" data-ms-new style="margin-left:6px">New proposal</button></div>';
    bind();
  }

  function bindRepo() { document.querySelectorAll('[data-connect-repo]').forEach(b => b.onclick = connectRepo); }
  // Release with no code repository: explain, offer to make one, or record the milestone without a git tag.
  function releaseSheet(version, btn) {
    const body = $('#invite-body'), m = $('#invite-modal'); if (!body || !m) return;
    const ms = milestones.find(x => x.version === version) || { title: '' };
    body.innerHTML = `<span class="eyebrow">Release ${esc(version)}</span><h2>No code repository to tag yet</h2>
      <p class="lead">Releasing <b>${esc(ms.title)}</b> puts a git tag (${esc(version)}) on the project's code, so everyone can go back to exactly this version. This project has no code repository yet, so there is nothing to tag.</p>
      <div class="modal-foot" style="flex-wrap:wrap"><button class="btn" data-close>Cancel</button><button class="btn" id="rel-plain">Release without a tag</button><button class="btn primary" id="rel-repo">${isHost() ? 'Set up the code repository' : 'Open Code repository'}</button></div>`;
    m.classList.remove('hidden');
    const close = () => m.classList.add('hidden');
    body.querySelector('[data-close]').onclick = close;
    $('#rel-repo').onclick = () => { close(); connectRepo(); };
    $('#rel-plain').onclick = () => { close(); doRelease(version, btn); };
  }
  async function doRelease(version, b) {
    if (b) { b.disabled = true; b.textContent = 'Releasing…'; }
    try { const r = await C.api(`/milestones/${version}/release`, { method: 'POST' }); window.TribeApp.toast(r.pushed ? `${version} tagged and pushed to GitHub` : r.tagged ? `${version} tagged in git` : `${version} marked released (no git tag: the project has no code repository yet)`); load(); }
    catch (e) { window.TribeApp.toast(e.message); if (b) { b.disabled = false; b.textContent = 'Release'; } }
  }

  function renderVision(text) {
    const el = $('#vision-text');
    el.textContent = text.trim() || (isHost() ? 'Double-click to write your tribe\'s vision.' : 'The host hasn\'t written a vision yet.');
    el.title = isHost() ? 'Double-click to edit' : '';
    const card = $('#vision-card'); let eb = card && card.querySelector('[data-vision-edit]');
    if (card && !eb) { eb = document.createElement('button'); eb.className = 'btn sm vision-edit'; eb.dataset.visionEdit = ''; card.querySelector('h3').appendChild(eb); }
    if (eb) { eb.textContent = isHost() ? 'Edit' : 'Suggest a change'; eb.setAttribute('aria-pressed', 'false');
      eb.onmousedown = e => { if (el.contentEditable === 'true') e.preventDefault(); };   // "Done" saves via blur below
      eb.onclick = () => { if (!isHost()) return newProposal(); if (el.contentEditable === 'true') return el.blur(); el.ondblclick(); eb.textContent = 'Done'; eb.setAttribute('aria-pressed', 'true'); el.classList.add('editing'); }; }
    el.ondblclick = () => {
      if (!isHost()) return window.TribeApp.toast('Only the host edits VISION.md directly. Propose a change instead.');
      el.contentEditable = 'true'; el.focus();
      if (!text.trim()) el.textContent = '';
    };
    el.onblur = async () => {
      if (el.contentEditable !== 'true') return; el.contentEditable = 'false'; el.classList.remove('editing');
      const v = el.innerText.trim(); if (v === text.trim()) return renderVision(text);
      try { await C.api('/vision', { method: 'PUT', body: { text: v } }); text = v; window.TribeApp.toast('VISION.md saved'); } catch (e) { window.TribeApp.toast(e.message); }
      renderVision(text);
    };
  }

  function bind() {
    document.querySelectorAll('.prop').forEach(card => {
      const pid = card.dataset.pid;
      card.querySelectorAll('[data-vote]').forEach(b => b.onclick = async () => {
        const p = proposals.find(x => x.id === pid), mine = (p.votes || {})[meId()];
        const vote = mine === b.dataset.vote ? 'clear' : b.dataset.vote;
        const before = { ...(p.votes || {}) }, votes = { ...before };   // instant: your vote shows now, the server confirms
        if (vote === 'clear') delete votes[meId()]; else votes[meId()] = vote;
        upsert({ ...p, votes });
        try { const r = await C.api(`/proposals/${pid}/vote`, { method: 'POST', body: { vote } }); upsert(r.proposal); }
        catch (e) { upsert({ ...p, votes: before }); window.TribeApp.toast('Vote not saved: ' + e.message, 'err'); }
      });
      const w = card.querySelector('[data-withdraw]'); if (w) w.onclick = async () => { try { await C.api('/proposals/' + pid, { method: 'DELETE' }); load(); } catch (e) { window.TribeApp.toast(e.message); } };
      const full = card.querySelector('.ap-full'); if (full) full.addEventListener('toggle', () => { full.open ? open.add(pid) : open.delete(pid); });
      const say = card.querySelector('[data-comment]'); if (say) say.onsubmit = async e => {
        e.preventDefault(); const inp = say.querySelector('input'), text = inp.value.trim(); if (!text) return;
        try { const r = await C.api(`/proposals/${pid}/comment`, { method: 'POST', body: { text } }); inp.value = ''; upsert(r.proposal); } catch (err) { window.TribeApp.toast(err.message); }
      };
    });
    document.querySelectorAll('[data-release]').forEach(b => b.onclick = () => (hasRepo ? doRelease(b.dataset.release, b) : releaseSheet(b.dataset.release, b)));
    bindRepo();
  }

  function upsert(p) {
    const fresh = p.tally ? p : { ...p, tally: (proposals.find(x => x.id === p.id) || {}).tally || { yes: 0, no: 0, pending: 0, voters: 1, needed: 1 } };
    const i = proposals.findIndex(x => x.id === p.id); if (i >= 0) proposals[i] = fresh; else proposals.unshift(fresh);
    if (!p.tally) { load(); return; } // live event without tally: refresh counts
    render();
  }

  function newProposal() {
    if (!C.connected()) return window.TribeApp.openInvite();
    const body = $('#invite-body');
    body.innerHTML = `<h2>New proposal</h2><p class="lead">Big changes go through the board so everyone builds the same thing. Checklist items under <b>Tasks</b> become tasks when it's approved.</p>
      <div class="field"><label for="np-title">Title</label><input class="input" id="np-title" maxlength="160" placeholder="e.g. Rework combat into turn-based duels"></div>
      <div class="field"><label for="np-body">Details (Markdown)</label><textarea class="input" id="np-body">${esc(TEMPLATE)}</textarea></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" id="np-go">Propose</button></div>`;
    $('#invite-modal').classList.remove('hidden'); $('#np-title').focus();
    body.querySelector('[data-close]').onclick = () => $('#invite-modal').classList.add('hidden');
    $('#np-go').onclick = async () => {
      const title = $('#np-title').value.trim(); if (!title) { $('#np-title').focus(); return; }
      $('#np-go').disabled = true;
      try { const r = await C.api('/proposals', { method: 'POST', body: { title, body: $('#np-body').value } }); $('#invite-modal').classList.add('hidden'); tab = r.proposal.status === 'approved' ? 'approved' : 'open'; load(); window.TribeApp.toast(r.proposal.status === 'approved' ? 'Approved right away (you are the only voter).' : 'Proposal posted. Your vote counts as yes.'); }
      catch (e) { window.TribeApp.toast(e.message); $('#np-go').disabled = false; }
    };
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-pt]'); if (t) { tab = t.dataset.pt; render(); }
    if (e.target.closest('#prop-new, [data-ms-new]')) newProposal();
  });
  C.on('proposal', p => { if (loaded) upsert(p); });
  C.on('milestones', ms => { milestones = ms; if (loaded) render(); });
  C.on('presence', () => { if (loaded) render(); });

  window.TribeBoard = { load };
})();
