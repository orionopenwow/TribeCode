// Coordinate (More → Agents, Ownership map, Conflict radar, Hand-offs, Reviews, Daily plan) plus the
// agents list in the right panel. Server: server/coord.js (/api/coord/*). Agents see the same things
// through MCP: my_lane, suggest_task, handoff, request_review, check_messages.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 15) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#${id}"/></svg>`;
  const toast = m => App() && App().toast(m);
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`; };
  const k = n => (n === null || n === undefined ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const me = () => C.state().me || {};
  const members = () => C.state().members || [];
  const TABS = [['agents', 'Agents', 'i-robot'], ['ownership', 'Ownership', 'i-map'], ['conflicts', 'Conflicts', 'i-merge'], ['handoffs', 'Hand-offs', 'i-hand'], ['reviews', 'Reviews', 'i-eye'], ['plan', 'Daily plan', 'i-sun']];
  let tab = 'agents';
  try { tab = sessionStorage.getItem('tribecode.coordTab') || localStorage.getItem('tribecode.coordTab') || 'agents'; } catch {}   // remembered across restarts

  function frame() {
    const root = $('#coord-root'); if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `<div class="view-head"><h1>Coordinate</h1><span class="faint" id="coord-sub"></span></div>
      <nav class="coord-tabs" id="coord-tabs" role="tablist">${TABS.map(([key, label, i]) => `<button role="tab" data-ct="${key}">${ico(i)}<span>${label}</span><span class="n" id="ct-n-${key}"></span></button>`).join('')}</nav>
      <div id="coord-body" class="coord-body"></div>`;
    root.querySelector('#coord-tabs').addEventListener('click', e => { const b = e.target.closest('[data-ct]'); if (b) open(b.dataset.ct); });
  }
  function open(t) { if (t) tab = t; try { sessionStorage.setItem('tribecode.coordTab', tab); localStorage.setItem('tribecode.coordTab', tab); } catch {} if (App().view() !== 'coord') App().show('coord'); else show(); }
  function show() {
    frame();
    document.querySelectorAll('#coord-tabs [data-ct]').forEach(b => { b.classList.toggle('on', b.dataset.ct === tab); b.setAttribute('aria-selected', String(b.dataset.ct === tab)); });
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = (TABS.find(x => x[0] === tab) || [])[1] || 'Coordinate';
    draw();
  }
  const body = () => $('#coord-body');
  const empty = (title, line) => `<div class="coord-empty"><b>${title}</b><span>${line}</span></div>`;
  async function draw() {
    const el = body(); if (!el) return;
    if (!C.connected()) { el.innerHTML = empty('Needs a tribe', 'Coordination is shared, so it lives on the tribe host.') + '<div class="coord-empty-acts"><button class="btn primary" data-coord-join>Host or join a tribe</button></div>'; el.querySelector('[data-coord-join]').onclick = () => window.TribeApp.openInvite(); return; }
    try { await ({ agents, ownership, conflicts, handoffs, reviews, plan })[tab](el); }
    catch (e) { el.innerHTML = empty('Could not load this', esc(e.message)); }
  }
  const act = (el, sel, fn) => el.querySelectorAll(sel).forEach(b => b.onclick = async e => { e.stopPropagation(); b.disabled = true; try { await fn(b); } catch (err) { toast(err.message); } b.disabled = false; });

  // ---------- agents ----------
  const ctlLabel = c => (c ? `${c.action === 'stop' ? 'Stop' : 'Pause'} requested${c.seen ? ' · seen' : ' · not seen yet'}` : '');
  function agentCard(a, compact) {
    const pct = a.tokens && a.budget ? Math.min(100, Math.round(a.tokens / a.budget * 100)) : null;
    const canSteer = a.yours || me().role === 'host';
    if (compact) return `<div class="ra-row ${a.online ? 'on' : ''}" data-agent="${esc(a.id)}"><span class="ra-dot"></span><div><b>${esc(a.name)}</b><span>${esc(a.control ? ctlLabel(a.control) : `${a.online ? (a.where || 'working') : 'idle'}${a.task ? ' · ' + a.task.title : ''}`)}</span></div></div>`;
    return `<article class="ag-card ${a.online ? 'on' : ''}" data-agent="${esc(a.id)}">
      <header><span class="ag-ico">${ico('i-robot', 18)}</span><div class="ag-t"><b>${esc(a.name)}</b><span class="faint">${a.yours ? 'yours' : `${esc(a.ownerName)}'s`} · ${a.online ? `<span class="ok">active</span> ${esc(ago(a.lastActive))}` : a.lastActive ? `last seen ${esc(ago(a.lastActive))}` : 'never connected'}</span></div>
</header>${a.control ? `<div class="ag-ctl">${ico('i-zap', 13)}${esc(ctlLabel(a.control))}</div>` : ''}
      <dl>
        <dt>Task</dt><dd>${a.task ? `${esc(a.task.title)} <span class="faint">· ${esc(a.task.status)}</span>` : '<span class="faint">none</span>'}</dd>
        <dt>Branch</dt><dd>${a.branch ? `<code>${esc(a.branch)}</code>` : '<span class="faint">none</span>'}</dd>
        <dt>Files</dt><dd>${a.files.length ? a.files.slice(0, 4).map(f => `<code>${esc(f)}</code>`).join(' ') + (a.files.length > 4 ? ` <span class="faint">+${a.files.length - 4}</span>` : '') : '<span class="faint">none claimed</span>'}</dd>
        <dt>Doing</dt><dd>${esc(a.online ? a.where || 'working' : 'idle')}</dd>
        <dt>Tokens</dt><dd>${a.tokens !== null ? `${k(a.tokens)}${a.budget ? ` of ${k(a.budget)}` : ''}${pct !== null ? `<span class="ag-bar"><i style="width:${pct}%" class="${pct > 85 ? 'hot' : ''}"></i></span>` : ''}` : '<span class="faint">not reported</span>'}</dd>
      </dl>
      ${canSteer ? `<footer>${a.control && a.control.action !== 'resume' ? '<button class="btn" data-ctl="resume">Resume</button>' : '<button class="btn" data-ctl="pause">Pause</button><button class="btn" data-ctl="stop">Stop</button>'}${a.yours ? '<button class="btn ghost" data-msg>Message</button>' : ''}</footer>` : ''}
    </article>`;
  }
  const sec = (eyebrow, title, inner, extra = '') => `<section class="sec"><div class="sec-head"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${extra}</div>${inner}</section>`;
  async function agents(el) {
    const [{ agents: list }, dl, ch] = await Promise.all([C.api('/coord/agents'), C.api('/coord/delegations').catch(() => ({ delegations: [] })), C.api('/agents/channel?limit=20').catch(() => ({ messages: [] }))]);
    const nameOf = id => ((members().find(m => m.id === id) || {}).name) || 'someone';
    // Needs attention: the single most important thing here, as the hero card.
    const attn = [
      ...list.filter(a => a.control).map(a => ({ who: a.name, what: ctlLabel(a.control), id: a.id })),
      ...list.filter(a => a.tokens && a.budget && a.tokens / a.budget > 0.85).map(a => ({ who: a.name, what: `${Math.round(a.tokens / a.budget * 100)}% of its token budget`, id: a.id })),
      ...dl.delegations.filter(d => d.status === 'awaiting-approval').map(d => ({ who: `${d.fromName} → ${d.toName}`, what: `wants to hand over "${d.taskTitle}"`, ap: d.approval })),
      ...list.filter(a => a.unread > 2 && !a.online).map(a => ({ who: a.name, what: `${a.unread} unread messages while idle`, id: a.id })),
    ];
    const hero = attn.length ? `<section class="hero-card ag-attn"><span class="eyebrow">Needs attention</span><h2>${attn.length === 1 ? esc(`${attn[0].who}: ${attn[0].what}`) : `${attn.length} things need a human`}</h2>
        ${attn.length > 1 ? attn.slice(0, 5).map(x => `<div class="hero-row"><b>${esc(x.who)}</b><span>${esc(x.what)}</span>${x.ap ? `<button class="btn primary" data-ap-yes="${esc(x.ap)}">Approve</button><button class="btn" data-ap-no="${esc(x.ap)}">Deny</button>` : ''}</div>`).join('') : attn[0].ap ? `<div class="hero-acts"><button class="btn primary" data-ap-yes="${esc(attn[0].ap)}">Approve</button><button class="btn" data-ap-no="${esc(attn[0].ap)}">Deny</button></div>` : ''}</section>` : '';
    const talk = ch.messages.slice(-15).map(m => `<div class="talk-row ${m.human ? 'human' : ''}"><b>${esc(nameOf(m.by))}</b>${m.to ? `<span class="faint">→ ${esc(nameOf(m.to))}</span>` : ''}<span class="talk-t">${esc(m.text)}</span><span class="faint">${esc(ago(m.at))}</span></div>`).join('');
    el.innerHTML = `${hero}
      ${sec('Agents', `${list.filter(a => a.online).length} working now`, list.length ? `<div class="ag-grid">${list.map(a => agentCard(a)).join('')}</div>` : empty('No agents yet', 'Connect your Claude Code from the right panel. Teammates\' agents show up here too.'))}
      ${sec('#agents', 'What the agents are saying', `<div class="talk">${talk || '<div class="pj-none">Quiet so far. Agents post here with agents_post, message_agent and delegate.</div>'}</div>
        <form class="coord-form talk-form" id="talk-form"><input class="input" id="talk-input" placeholder="@maya's-claude or @agents …" maxlength="2000" autocomplete="off"><button class="btn">Send</button></form>`)}
      ${dl.delegations.length ? sec('Delegations', 'Who handed what to whom', dl.delegations.slice(0, 12).map(d => `<div class="dl-row"><b>${esc(d.fromName)}</b><span class="faint">→</span><b>${esc(d.toName)}</b><span class="dl-t">${esc(d.taskTitle)}</span><span class="pj-chip ${d.status === 'accepted' ? 'ok' : d.status === 'awaiting-approval' ? 'hot' : ''}">${esc(d.status.replace('-', ' '))}</span></div>`).join('')) : ''}`;
    act(el, '[data-ctl]', async b => {
      const id = b.closest('[data-agent]').dataset.agent, action = b.dataset.ctl;
      await C.api(`/coord/agents/${encodeURIComponent(id)}/control`, { method: 'POST', body: { action } });
      toast(action === 'resume' ? 'Resumed' : `${action === 'stop' ? 'Stop' : 'Pause'} requested`); draw(); side();
    });
    act(el, '[data-msg]', async b => window.TribeDM && window.TribeDM.open(b.closest('[data-agent]').dataset.agent));
    act(el, '[data-ap-yes]', async b => { await C.api(`/approvals/${b.dataset.apYes}/approve`, { method: 'POST', body: {} }); toast('Approved'); setTimeout(draw, 3200); });
    act(el, '[data-ap-no]', async b => { await C.api(`/approvals/${b.dataset.apNo}/deny`, { method: 'POST', body: {} }); toast('Denied'); setTimeout(draw, 3200); });
    el.querySelector('#talk-form').onsubmit = async e => { e.preventDefault(); const t = $('#talk-input').value.trim(); if (!t) return; try { await C.api('/agents/channel', { method: 'POST', body: { text: t } }); $('#talk-input').value = ''; draw(); } catch (err) { toast(err.message); } };
  }

  // ---------- ownership ----------
  async function ownership(el) {
    const d = await C.api('/coord/ownership');
    const humans = members().filter(m => m.role !== 'spectator');
    const opts = humans.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    el.innerHTML = `${d.warnings.length ? `<section class="coord-warn">${d.warnings.map((w, i) => `<div class="cw-row">${ico('i-zap')}<span>${w.kind === 'claim-in-lane' ? `<b>${esc(w.a.name)}</b> claimed <code>${esc(w.path)}</code> inside <b>${esc(w.b.name)}</b>'s lane <code>${esc(w.area)}</code>` : `<b>${esc(w.a.name)}</b> and <b>${esc(w.b.name)}</b> both own <code>${esc(w.area)}</code> / <code>${esc(w.path)}</code>`}</span>${w.claim ? `<button class="btn" data-hand="${esc(w.claim)}" data-to="${esc(w.b.id)}">Hand off to ${esc(w.b.name)}</button>` : ''}</div>`).join('')}</section>` : ''}
      <form class="coord-form" id="lane-form"><input class="input" id="lane-area" placeholder="Own an area: src/ui/ or a file" maxlength="200"><select id="lane-owner">${opts}</select><button class="btn primary">Add lane</button></form>
      ${d.owners.length ? `<div class="own-grid">${d.owners.map(o => `<article class="own-card"><header><span class="avatar" style="background:${o.kind === 'agent' ? 'var(--surface-3)' : esc(o.color)}">${o.kind === 'agent' ? ico('i-robot', 14) : esc((o.name || '?')[0])}</span><b>${esc(o.name)}</b><span class="faint">${o.kind}</span></header>
          ${o.lanes.map(l => `<div class="own-line lane">${ico('i-map', 13)}<code>${esc(l.area)}</code><span class="faint">${esc(l.note || 'lane')}</span><button class="linkish" data-drop-lane="${esc(l.id)}">remove</button></div>`).join('')}
          ${o.claims.map(c => `<div class="own-line">${ico('i-folder', 13)}<code title="${esc(c.note || '')}">${esc(c.path)}</code><span class="faint">${esc(ago(c.at))}</span><select class="own-hand" data-claim="${esc(c.id)}" title="Hand off"><option value="">Hand off…</option>${members().filter(m => m.id !== o.id && m.role !== 'spectator').map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select></div>`).join('')}
          ${o.tasks.slice(0, 3).map(t => `<div class="own-line task">${ico('i-check', 13)}<span>${esc(t.title)}</span><span class="faint">${esc(t.status)}</span></div>`).join('')}
        </article>`).join('')}</div>` : empty('Nobody owns anything yet', 'Claims from people and agents show here, and you can give someone a lane.')}`;
    const lo = el.querySelector('#lane-owner'); if (lo) lo.value = me().id;
    el.querySelector('#lane-form').onsubmit = async e => { e.preventDefault(); const area = $('#lane-area').value.trim(); if (!area) return $('#lane-area').focus(); try { await C.api('/coord/lanes', { method: 'POST', body: { area, owner: $('#lane-owner').value } }); draw(); } catch (err) { toast(err.message); } };
    act(el, '[data-hand]', async b => { await C.api(`/coord/claims/${b.dataset.hand}/handoff`, { method: 'POST', body: { to: b.dataset.to } }); toast('Handed off'); draw(); });
    act(el, '[data-drop-lane]', async b => { await C.api(`/coord/lanes/${b.dataset.dropLane}`, { method: 'DELETE' }); draw(); });
    el.querySelectorAll('.own-hand').forEach(s => s.onchange = async () => { if (!s.value) return; try { await C.api(`/coord/claims/${s.dataset.claim}/handoff`, { method: 'POST', body: { to: s.value } }); toast('Handed off'); draw(); } catch (e) { toast(e.message); } });
  }

  // ---------- conflicts ----------
  async function conflicts(el) {
    el.innerHTML = '<div class="faint">Comparing branches…</div>';
    const d = await C.api('/coord/conflicts');
    if (!d.enabled) { el.innerHTML = empty('No repo to compare', esc(d.reason || 'Attach a git repo to this project (+ → drop a folder or paste a GitHub URL).')); return; }
    el.innerHTML = `<p class="coord-lead">${d.branches} branch${d.branches === 1 ? '' : 'es'} compared with <code>${esc(d.main)}</code>. Pairs that change the same files will collide when they merge.</p>
      ${d.pairs.length ? d.pairs.map(p => `<article class="cf-card"><div class="cf-pair"><span><code>${esc(p.a.branch)}</code><small>${esc(p.a.ownerName || '')}${p.a.behind ? ` · ${p.a.behind} behind` : ''}</small></span>${ico('i-merge', 18)}<span><code>${esc(p.b.branch)}</code><small>${esc(p.b.ownerName || '')}${p.b.behind ? ` · ${p.b.behind} behind` : ''}</small></span></div>
          <div class="cf-files">${p.files.map(f => `<code>${esc(f)}</code>`).join('')}${p.count > p.files.length ? `<span class="faint">+${p.count - p.files.length} more</span>` : ''}</div>
          <footer>${p.asked ? `<span class="faint">Asked ${esc(ago(p.asked))}</span>` : ''}<button class="btn ${p.asked ? '' : 'primary'}" data-sync data-a="${esc(p.a.branch)}" data-b="${esc(p.b.branch)}">Ask both to sync</button></footer></article>`).join('')
        : empty('No overlaps', 'No two branches touch the same files right now.')}`;
    act(el, '[data-sync]', async b => { const r = await C.api('/coord/conflicts/sync', { method: 'POST', body: { a: b.dataset.a, b: b.dataset.b } }); toast(`Asked ${r.asked.join(' and ')} to sync`); draw(); });
  }

  // ---------- hand-offs ----------
  async function handoffs(el) {
    const { handoffs: list } = await C.api('/coord/handoffs');
    const open = list.filter(h => h.status === 'open'), rest = list.filter(h => h.status !== 'open').slice(0, 12);
    const tasks = (window.TribeTasks && window.TribeTasks.all && window.TribeTasks.all()) || [];
    const row = h => `<article class="ho-card ${h.status}" data-ho="${esc(h.id)}"><header><b>${esc(h.title)}</b><span class="pj-chip ${h.status === 'open' ? 'hot' : ''}">${esc(h.status)}</span></header>
        <div class="faint">${esc(h.fromName)} → ${esc(h.toName)} · ${esc(ago(h.created))}${h.takenByName ? ` · taken by ${esc(h.takenByName)}` : ''}</div>
        ${h.context ? `<div class="ho-ctx md">${window.TribeMD.render(h.context)}</div>` : ''}
        ${(h.branch || h.files.length) ? `<div class="cf-files">${h.branch ? `<code>${esc(h.branch)}</code>` : ''}${h.files.map(f => `<code>${esc(f)}</code>`).join('')}</div>` : ''}
        <footer>${h.status === 'open' ? '<button class="btn primary" data-take>Take it</button>' : h.status === 'taken' ? '<button class="btn" data-done>Mark done</button>' : ''}</footer></article>`;
    el.innerHTML = `<details class="coord-new"><summary class="btn">${ico('i-hand')}Park work for someone</summary>
        <form id="ho-form" class="coord-form col"><input class="input" id="ho-title" placeholder="What is being handed off" maxlength="160"><textarea class="input" id="ho-ctx" placeholder="What's done, what's left, gotchas" rows="3"></textarea>
        <div class="coord-form"><select id="ho-to"><option value="">Anyone</option>${members().filter(m => m.id !== me().id && m.role !== 'spectator').map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}</select><select id="ho-task"><option value="">No task</option>${tasks.filter(t => t.status !== 'done').map(t => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')}</select><button class="btn primary">Hand off</button></div></form></details>
      ${open.length ? open.map(row).join('') : empty('Nothing waiting', 'When someone parks work for a teammate (or an agent calls handoff), it lands here with its context.')}
      ${rest.length ? `<h6 class="coord-h">Earlier</h6>${rest.map(row).join('')}` : ''}`;
    el.querySelector('#ho-form').onsubmit = async e => { e.preventDefault(); const title = $('#ho-title').value.trim(); if (!title) return $('#ho-title').focus(); try { await C.api('/coord/handoffs', { method: 'POST', body: { title, context: $('#ho-ctx').value, to: $('#ho-to').value || null, task: $('#ho-task').value || null } }); toast('Handed off'); draw(); } catch (err) { toast(err.message); } };
    act(el, '[data-take]', async b => { await C.api(`/coord/handoffs/${b.closest('[data-ho]').dataset.ho}/take`, { method: 'POST', body: {} }); toast('It\'s yours'); draw(); });
    act(el, '[data-done]', async b => { await C.api(`/coord/handoffs/${b.closest('[data-ho]').dataset.ho}/done`, { method: 'POST', body: {} }); draw(); });
  }

  // ---------- reviews ----------
  async function reviews(el) {
    const { reviews: list } = await C.api('/coord/reviews');
    const pend = list.filter(r => r.status === 'pending'), done = list.filter(r => r.status !== 'pending').slice(0, 10);
    const row = r => `<article class="rv-row ${r.status}" data-rv="${esc(r.id)}"><div class="rv-main"><b>${esc(r.title)}</b><span class="faint"><code>${esc(r.branch || '')}</code> · ${esc(r.byName)}${r.fromBoard ? ' · moved to Review on the board' : ''}${r.created ? ' · ' + esc(ago(r.created)) : ''}${r.status !== 'pending' ? ` · ${esc(r.status)}${r.decidedByName ? ' by ' + esc(r.decidedByName) : ''}` : ''}</span>${r.summary ? `<p>${esc(r.summary.split('\n')[0].slice(0, 200))}</p>` : ''}</div>
        ${r.status === 'pending' ? (r.canDecide ? '<div class="rv-act"><button class="btn primary" data-rv-do="approve">Approve</button><button class="btn" data-rv-do="deny">Deny</button></div>' : `<span class="faint">waiting on ${esc((r.askedOf || []).join(', ') || 'a human')}</span>`) : `<span class="pj-chip ${r.status === 'approved' ? 'ok' : ''}">${esc(r.status)}</span>`}</article>`;
    el.innerHTML = `${pend.length ? pend.map(row).join('') : empty('Nothing to review', 'Agents call request_review when a branch is ready; tasks moved to Review on the board show up here too.')}${done.length ? `<h6 class="coord-h">Decided</h6>${done.map(row).join('')}` : ''}`;
    act(el, '[data-rv-do]', async b => {
      const id = b.closest('[data-rv]').dataset.rv, d = b.dataset.rvDo;
      await C.api(`/coord/reviews/${encodeURIComponent(id)}/${d}`, { method: 'POST', body: {} }); toast(d === 'approve' ? 'Approved: task moved to Done' : 'Sent back to doing'); draw();
    });
    el.querySelectorAll('.rv-row .rv-main').forEach(m => m.onclick = () => { const r = list.find(x => x.id === m.closest('[data-rv]').dataset.rv); if (r && window.TribeShell) window.TribeShell.preview({ kind: 'Review', title: r.title, html: `<p class="faint"><code>${esc(r.branch || '')}</code> · ${esc(r.byName)}</p>${r.summary ? `<div class="md">${window.TribeMD.render(r.summary)}</div>` : ''}` }); });
  }

  // ---------- daily plan ----------
  async function plan(el, fresh) {
    const { plan: p, availability: av } = fresh ? { plan: (await C.api('/coord/plan', { method: 'POST', body: {} })).plan, availability: null } : await C.api('/coord/plan');
    const mine = av ? av.status : null;
    const group = new Map(); p.items.forEach(i => { if (!group.has(i.member)) group.set(i.member, []); group.get(i.member).push(i); });
    el.innerHTML = `<div class="plan-top"><div class="plan-focus">${ico('i-sun', 18)}<span>${esc(p.focus || 'Nothing planned yet.')}</span>${p.by === 'brain' ? '<span class="pj-chip">local brain</span>' : ''}</div>
        <div class="tabs plan-av" title="Your availability today">${[['in', 'In today'], ['part', 'Part day'], ['away', 'Away']].map(([v, l]) => `<button data-av="${v}" class="${mine === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn" id="plan-redo">${ico('i-refresh')}Re-plan</button><button class="btn primary" id="plan-all">Accept mine</button></div>
      ${p.items.length ? `<div class="plan-grid">${[...group].map(([mid, items]) => { const c = (p.crew || []).find(x => x.id === mid) || { name: items[0].name, kind: items[0].kind };
          return `<article class="plan-card"><header>${c.kind === 'agent' ? ico('i-robot', 16) : ico('i-users', 16)}<b>${esc(c.name)}</b>${c.cap ? `<span class="faint">${c.load}/${c.cap}</span>` : ''}</header>
            ${items.map(i => `<div class="plan-item ${i.accepted ? 'ok' : ''}" data-task="${esc(i.task)}" data-member="${esc(i.member)}"><span><b>${esc(i.title)}</b><small>${esc(i.why || '')}</small></span>${i.accepted ? ico('i-tick', 15) : '<button class="btn" data-accept>Accept</button>'}</div>`).join('')}</article>`; }).join('')}</div>`
        : empty('Nothing to plan', 'Add tasks to the board and the plan fills itself in.')}`;
    act(el, '[data-av]', async b => { await C.api('/coord/availability', { method: 'PUT', body: { status: b.dataset.av } }); plan(el, true); });
    act(el, '#plan-redo', async () => plan(el, true));
    act(el, '#plan-all', async () => { await C.api('/coord/plan/accept', { method: 'POST', body: { all: true } }); toast('Accepted'); draw(); });
    act(el, '[data-accept]', async b => { const r = b.closest('.plan-item'); await C.api('/coord/plan/accept', { method: 'POST', body: { task: r.dataset.task, member: r.dataset.member } }); draw(); });
  }

  // ---------- right panel: agents at a glance ----------
  let st;
  async function side() {
    const box = $('#room-agents'); if (!box) return;
    if (!C.connected()) { box.innerHTML = ''; return; }
    try {
      const { agents: list } = await C.api('/coord/agents');
      box.innerHTML = list.length ? `<h6>Agents</h6>${list.slice(0, 6).map(a => agentCard(a, true)).join('')}${list.length > 6 ? `<button class="linkish" data-ra-all>All ${list.length} agents</button>` : ''}` : '';
      box.querySelectorAll('[data-agent], [data-ra-all]').forEach(r => r.onclick = () => open('agents'));
    } catch {}
  }
  const sideSoon = () => { clearTimeout(st); st = setTimeout(side, 400); };
  const drawSoon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { if (App() && App().view() === 'coord') draw(); }, 400); }; })();
  C.on('hello', sideSoon); C.on('presence', sideSoon); C.on('claims', sideSoon); C.on('project', () => { sideSoon(); drawSoon(); });
  C.on('ws', m => { if (m.type === 'coord' || (m.type === 'chat' && m.channel === 'agents' && tab === 'agents')) { sideSoon(); drawSoon(); } });
  C.on('task', () => { if (['plan', 'reviews', 'agents'].includes(tab)) drawSoon(); });
  C.on('approval', () => { if (tab === 'reviews') drawSoon(); });
  setInterval(() => { if (document.visibilityState === 'visible') side(); }, 60_000);

  window.TribeCoord = { open, show, tab: () => tab, refresh: draw, side };
})();
