// Approval board: proposals + votes, VISION.md, milestones (release = git tag on the host).
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TEMPLATE = '## Problem\nWhat is wrong or missing today?\n\n## Plan\nWhat we will build, in a few sentences.\n\n## Tasks\n- [ ] First task\n- [ ] Second task\n';
  let proposals = [], milestones = [], tab = 'open', loaded = false, open = new Set();

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
      proposals = p.proposals; milestones = ms.milestones; loaded = true;
      $('#ms-lead').textContent = ms.repo ? `Approved proposals become milestones. Releasing tags the project’s code repository (next: ${ms.next}).` : `Approved proposals become milestones (next: ${ms.next}). Give the project a code repository to tag releases in git.`;
      renderVision(v.text); render(); loadRadar();
    } catch (e) { window.TribeApp.toast('Could not load the board: ' + e.message); }
  }

  async function loadRadar() {
    try {
      const r = await C.api('/drift');
      if (!r.enabled) { $('#radar-lead').textContent = r.reason; $('#radar-list').innerHTML = ''; return; }
      $('#radar-lead').textContent = `Branches compared with ${r.main}. Behind = commits on ${r.main} they don't have yet.`;
      const max = Math.max(10, ...r.branches.map(b => b.behind));
      const color = { ok: 'var(--accent-2)', watch: 'var(--amber)', drifting: 'var(--ember)' };
      $('#radar-list').innerHTML = r.branches.length ? r.branches.map(b => `<div class="drow" title="${esc(b.sample.join(', '))}">
          <div class="dname"><b>${esc(b.branch)}</b><span>${esc(b.author || '')} · ${b.days === 0 ? 'today' : b.days + ' d ago'}${b.task ? ' · ' + esc(b.task.title) : ' · <span style="color:var(--amber)">no task</span>'}</span></div>
          <div class="dbar"><i style="width:${Math.max(4, (b.behind / max) * 100)}%;background:${color[b.level]}"></i></div>
          <span class="dlab" style="color:${color[b.level]}">${b.behind ? b.behind + ' behind' : 'in sync'}${b.ahead ? ' · ' + b.ahead + ' ahead' : ''}</span></div>`).join('')
        : '<div class="faint" style="font-size:13px">Only the main branch exists. Everyone is in sync.</div>';
    } catch { $('#radar-list').innerHTML = ''; }
  }

  function renderOffline() {
    $('#prop-list').innerHTML = '<div class="prop-empty">The approval board is shared, so it needs a tribe. Click <b>Invite friends</b> to start or join one.</div>';
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
      ${m.status === 'released' ? `<span class="chip teal">${m.git && m.git.pushed ? 'pushed' : 'released'}</span>` : isHost() ? `<button class="btn" data-release="${esc(m.version)}">Release</button>` : '<span class="chip amber">planned</span>'}</div>`).join('')
      : '<div class="faint" style="font-size:13px">No milestones yet. An approved proposal becomes the next one: <button class="btn sm" data-ms-new style="margin-left:6px">New proposal</button></div>';
    bind();
  }

  function renderVision(text) {
    const el = $('#vision-text');
    el.textContent = text.trim() || (isHost() ? 'Double-click to write your tribe\'s vision.' : 'The host hasn\'t written a vision yet.');
    el.title = isHost() ? 'Double-click to edit' : '';
    el.ondblclick = () => {
      if (!isHost()) return window.TribeApp.toast('Only the host edits VISION.md directly. Propose a change instead.');
      el.contentEditable = 'true'; el.focus();
      if (!text.trim()) el.textContent = '';
    };
    el.onblur = async () => {
      if (el.contentEditable !== 'true') return; el.contentEditable = 'false';
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
        try { const r = await C.api(`/proposals/${pid}/vote`, { method: 'POST', body: { vote } }); upsert(r.proposal); } catch (e) { window.TribeApp.toast(e.message); }
      });
      const w = card.querySelector('[data-withdraw]'); if (w) w.onclick = async () => { try { await C.api('/proposals/' + pid, { method: 'DELETE' }); load(); } catch (e) { window.TribeApp.toast(e.message); } };
      const full = card.querySelector('.ap-full'); if (full) full.addEventListener('toggle', () => { full.open ? open.add(pid) : open.delete(pid); });
      const say = card.querySelector('[data-comment]'); if (say) say.onsubmit = async e => {
        e.preventDefault(); const inp = say.querySelector('input'), text = inp.value.trim(); if (!text) return;
        try { const r = await C.api(`/proposals/${pid}/comment`, { method: 'POST', body: { text } }); inp.value = ''; upsert(r.proposal); } catch (err) { window.TribeApp.toast(err.message); }
      };
    });
    document.querySelectorAll('[data-release]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Releasing…';
      try { const r = await C.api(`/milestones/${b.dataset.release}/release`, { method: 'POST' }); window.TribeApp.toast(r.pushed ? `${b.dataset.release} tagged and pushed to GitHub` : r.tagged ? `${b.dataset.release} tagged in git` : r.note); load(); }
      catch (e) { window.TribeApp.toast(e.message); b.disabled = false; b.textContent = 'Release'; }
    });
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
