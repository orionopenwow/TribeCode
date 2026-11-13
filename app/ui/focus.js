// Your focus (feat/focus): the top of the right panel is where you act. It answers "what am I doing, what's next, which
// part of the code is mine", hands your AI helper a prompt that keeps it in your part (so nobody's changes collide), and
// keeps the everyday actions one click away: a doc, a sheet, slides, a task, the preview, Flint.
//   window.TribeFocus = { refresh(), prompt() }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C || !C.on) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = () => window.TribeApp, toast = (m, k) => A() && A().toast && A().toast(m, k);
  const desk = () => matchMedia('(min-width: 821px)').matches;
  const slug = t => String(t || 'work').toLowerCase().replace(/^\[[^\]]*\]\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'work';
  let last = null, busy = false, timer = null;

  async function data() {
    const st = C.state(), me = st.me || {};
    let tasks = [], own = { owners: [], lanes: [] };
    try { tasks = (await C.api('/tasks')).tasks || []; } catch {}
    try { own = await C.api('/coord/ownership'); } catch {}
    let shipD = null; try { shipD = await C.api('/ship'); } catch {}   // feat/ship-flow
    const open = tasks.filter(t => t.status !== 'done');
    const mine = open.filter(t => t.assignee === me.id);
    const now = mine.find(t => t.status === 'doing') || mine.find(t => t.status === 'review') || mine[0] || null;
    const next = open.filter(t => !t.assignee && t.status !== 'review').sort((a, b) => (a.order || 0) - (b.order || 0))[0] || null;
    const myRow = (own.owners || []).find(o => o.id === me.id) || { lanes: [], claims: [] };
    const myAgents = (st.members || []).filter(m => m.role === 'agent' && m.owner === me.id).map(m => m.id);
    const agentLanes = (own.owners || []).filter(o => myAgents.includes(o.id)).flatMap(o => o.lanes || []);
    const lanes = [...(myRow.lanes || []), ...agentLanes].map(l => l.area);
    const others = (own.owners || []).filter(o => o.id !== me.id && !myAgents.includes(o.id)).flatMap(o => [...(o.lanes || []).map(l => ({ who: o.name, area: l.area })), ...(o.claims || []).map(c => ({ who: o.name, area: c.path || c }))]).slice(0, 8);
    const project = window.TribeProjects && window.TribeProjects.cur ? window.TribeProjects.cur() : null;
    return { me, now, next, mine, lanes: [...new Set(lanes)], others, project, review: open.filter(t => t.status === 'review' && t.assignee !== me.id).length, ship: shipD, openCount: open.length };
  }

  function prompt(d = last) {
    if (!d) return '';
    const t = d.now || d.next, name = String(d.me.name || 'me').split(' ')[0];
    const branch = `tribe/${slug(name)}/${slug(t && t.title)}`;
    return [
      `You are ${name}'s AI helper in the TribeCode project "${d.project ? d.project.name : 'this project'}".`,
      t ? `Task: ${t.title}${t.body ? `\nDetails: ${String(t.body).slice(0, 600)}` : ''}` : 'Ask me which task to take, or pick the top unassigned one on the Task Board.',
      d.lanes.length ? `Stay in my part of the code: ${d.lanes.join(', ')}. Don't edit files outside it.` : 'Before editing, claim the files you will change (TribeCode tool: claim) so others know.',
      d.others.length ? `Others are working on these, so leave them alone: ${d.others.map(o => `${o.area} (${o.who})`).join('; ')}.` : '',
      `Work on a branch named ${branch}, save small changes often, and post a short update in TribeCode when something works.`,
      'When it is ready, move the task to Review and ask me to approve it. Never merge into main yourself.',
    ].filter(Boolean).join('\n');
  }

  function draw(d) {
    const box = $('#room-focus'); if (!box) return;
    if (!C.connected() || !d) { box.innerHTML = ''; return; }
    const t = d.now, n = d.next;
    box.innerHTML = `<div class="fc-head"><span class="fc-t">🎯 Your focus</span>${d.review ? `<button class="fc-badge" data-fc="review" title="Tasks waiting for a review">${d.review} to review</button>` : ''}</div>
      <button class="fc-now ${t ? '' : 'empty'}" data-fc="${t ? 'task' : 'pick'}">
        <small class="eyebrow">${t ? (t.status === 'doing' ? 'Working on' : t.status === 'review' ? 'Waiting for review' : 'Yours, not started') : 'Nothing assigned to you'}</small>
        <b>${esc(t ? t.title : n ? `Next up: ${n.title}` : 'Add a first task')}</b>
        ${d.mine.length > 1 ? `<span class="fc-more">+${d.mine.length - 1} more of yours</span>` : ''}</button>
      <div class="fc-lane"><span class="fc-k eyebrow">Your part of the code</span>${d.lanes.length ? `<span class="fc-areas">${d.lanes.map(a => `<code>${esc(a)}</code>`).join('')}</span>` : `<form class="fc-claim" data-fc-claim><input class="input" maxlength="200" placeholder="e.g. src/ui/ or docs/story.md" aria-label="Your part of the code"><button class="btn sm" type="submit">Claim</button></form>`}</div>
      <button class="btn sm fc-prompt" data-fc="prompt" title="Copies instructions that keep your AI helper in your part of the code">🤖 Copy prompt for my AI</button>
      <div class="fc-ship">${d.ship && d.ship.request && d.ship.request.status === 'pending' ? `<button class="fc-sh on" data-fc="ship" title="A ship request is waiting">🗳️ Vote: ship ${d.ship.request.count} saved change${d.ship.request.count === 1 ? '' : 's'}</button>` : d.ship && d.ship.canShip ? `<button class="fc-sh on" data-fc="ship" title="Review what changed and ship it to GitHub">🚀 ${d.ship.count} ready to ship</button>` : d.ship && d.ship.enabled ? '<button class="fc-sh" data-fc="ship" title="Everything is on GitHub">✅ All shipped</button>' : ''}<button class="fc-sh" data-fc="share" title="Copy progress, the GitHub link and an invite">📤 Share progress</button>${d.ship && d.ship.turbo && d.ship.turbo.on ? '<span class="fc-turbo" title="Turbo ships approved work at calm moments">⚡ Turbo</span>' : ''}</div>
      `;
    // v0.21: a brand-new project (no tasks, no part of the code, nothing to ship) has nothing to focus on yet: Next steps
    // says what to do, and new docs, sheets and slides start from Files or the + menu. So the card stays out of the way.
    if (!d.openCount && !d.lanes.length && !(d.ship && d.ship.request && d.ship.request.status === 'pending')) { box.innerHTML = ''; return; }
    // feat/calm-parity: while the getting-started steps are unfinished, the card waits until something is assigned to you
    if (document.body.dataset.calm && !d.mine.length) { box.innerHTML = ''; return; }
    box.querySelectorAll('[data-fc]').forEach(b => b.onclick = () => act(b.dataset.fc, d));
    const f = box.querySelector('[data-fc-claim]'); if (f) f.onsubmit = async e => {
      e.preventDefault(); const area = f.querySelector('input').value.trim(); if (!area) return;
      try { await C.api('/coord/lanes', { method: 'POST', body: { area } }); toast(`${area} is your part now. Others see it in the Agents Hub.`, 'ok'); refresh(); } catch (err) { toast(err.message, 'err'); }
    };
  }
  async function act(k, d) {
    const D = window.TribeDocs;
    if (k === 'prompt') { const p = prompt(d); try { await navigator.clipboard.writeText(p); toast('Copied. Paste it into your AI helper (Claude Code, Codex, Cursor…).', 'ok'); } catch { window.prompt('Copy this for your AI helper:', p); } return; }
    if (k === 'task' || k === 'review' || k === 'pick') return A().show('tasks');
    if (k === 'ship') { A().show('repo'); return setTimeout(() => window.TribeShip && window.TribeShip.refresh(), 60); }   // feat/ship-flow
    if (k === 'share') return window.TribeShip && window.TribeShip.share();
    if (k === 'newtask') { A().show('tasks'); return setTimeout(() => { const nb = $('#task-new'); if (nb) nb.click(); }, 80); }
    if (k === 'doc' && D) { A().show('docs'); return D.create(); }
    if (k === 'sheet' && D) { A().show('docs'); return D.newSheet(); }
    if (k === 'deck' && D) { A().show('docs'); return D.newDeck(); }
    if (k === 'preview') return window.TribePreview && window.TribePreview.open ? window.TribePreview.open() : A().show('docs');
    if (k === 'code') { A().show('docs'); return setTimeout(() => window.TribeCodeFiles && window.TribeCodeFiles.set && window.TribeCodeFiles.set('code'), 60); }
  }
  async function refresh() {
    if (!desk()) return;
    let box = $('#room-focus');
    if (!box) { const ag = $('#room-agents'); if (!ag) return; box = document.createElement('section'); box.id = 'room-focus'; box.className = 'room-focus'; box.setAttribute('aria-label', 'Your focus'); ag.before(box); }
    if (busy || !C.connected()) { if (!C.connected()) box.innerHTML = ''; return; }
    busy = true; try { last = await data(); draw(last); } catch {} finally { busy = false; }
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 500); };
  C.on('hello', soon); C.on('project', soon); C.on('task', soon); C.on('presence', soon);
  C.on('ws', m => { if (m && (m.type === 'coord' || m.type === 'claims' || m.type === 'tasks' || m.type === 'ship')) soon(); });
  C.on('ship', soon);
  addEventListener('resize', soon);
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
  window.TribeFocus = { refresh, prompt: () => prompt() };
})();
