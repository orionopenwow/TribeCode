// The one-click project flow, client side (server/flow.js):
//   create(name)    Create project -> room, invite link, repo, GitHub; opens the project's chat
//   kickoff card    docked at the top of Chat: steps (Room · Link · Repo · GitHub), the invite link
//                   (copy, QR, share sheet), roles to claim or give, a drop zone for notes and files,
//                   and "Start the flow". Once running it folds into a slim bar.
//   Updates         the plan as the one hero card (milestones -> items per role, blockers), plan
//                   changes to approve with one tap, "Assess now", and the gist feed.
//   Roles           each role's name, color, glyph, people (and their agents) and the folders it owns.
// Role colors carry through everything: gist cards, plan items, folder chips, task cards, avatar rings.
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const App = () => window.TribeApp;
  const G = () => window.TribeGists;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, cls = '') => `<svg class="i ${cls}"><use href="#${id}"/></svg>`;
  const toast = m => App() && App().toast(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#38C6B1', '#3DD6D0', '#9AE66E', '#E7E9EE', '#C9A66B', '#8FB39A', '#3BD16F'].includes(c) ? '#0B0C10' : '#fff');
  const me = () => C.state().me || {};
  const human = () => me().role && me().role !== 'agent' && me().role !== 'spectator';
  const memberOf = id => (C.state().members || []).find(m => m.id === id) || null;
  const nameOf = id => (memberOf(id) || {}).name || 'someone';

  let flow = null, minimized = false, filter = 'all';
  const pid = () => C.project();
  const role = rid => flow && flow.roles.find(r => r.id === rid) || null;
  const roleOfMember = mid => { if (!flow) return null; const m = memberOf(mid); const who = m && m.role === 'agent' && m.owner ? m.owner : mid; return flow.roles.find(r => r.members.includes(who)) || null; };
  function folderOwner(p) {
    if (!flow) return null; const f = String(p || '').replace(/^\.\//, ''); let best = null;
    for (const r of flow.roles) for (const fo of r.folders) if ((f + '/').startsWith(fo.path) && (!best || fo.path.length > best.folder.path.length)) best = { role: r, folder: fo };
    return best;
  }
  const avatar = (mid, sz = 22) => { const m = memberOf(mid) || { name: nameOf(mid), color: '#6C7CFF' }; const r = roleOfMember(mid);
    return `<span class="fav" title="${esc(m.name)}${r ? ' · ' + esc(r.name) : ''}" style="width:${sz}px;height:${sz}px;background:${esc(m.color || '#6C7CFF')};color:${ink(m.color)};--rc:${esc(r ? r.hex : 'transparent')}">${esc(initials(m.name))}</span>`; };

  // ---------- data ----------
  async function load() {
    if (!C.connected() || !pid()) return;
    try { const r = await C.api('/flow'); setFlow(r.flow); } catch { setFlow(null); }
  }
  function setFlow(f) {
    flow = f && f.project === pid() ? f : (f ? flow : null);
    if (!f) flow = null;
    try { minimized = !!(flow && localStorage.getItem('tribecode.flowMin.' + flow.project) === '1'); } catch {}
    draw();
  }
  function draw() { dock(); navRows(); decorateAll(); if (cur === 'updates') updates(); if (cur === 'roles') roles(); if (G()) G().decorate(); }
  C.on('hello', load); C.on('project', () => { hideMine(); load(); });
  C.on('ws', m => {
    if (m.type === 'flow' && m.project === pid()) { const steps = flow && JSON.stringify(flow.steps); setFlow(m.flow); if (steps && steps !== JSON.stringify(m.flow.steps)) stepToast(m.flow.steps); }
    if (m.type === 'gist' && m.project === pid() && cur === 'updates') feed();
  });
  function stepToast(s) { if (s.github && s.github.s === 'ok') toast('Pushed to a private GitHub repo'); }

  // ---------- create ----------
  async function create(name) {
    const r = await C.api('/flow/create', { method: 'POST', body: { name } });
    if (window.TribeProjects) { await window.TribeProjects.refresh(); await window.TribeProjects.switchTo(r.flow.project, 'chat'); }
    flow = r.flow; minimized = false; draw();
    App().show('chat');
    toast(`${r.flow.name} is live. Share the link.`);
    return r.flow;
  }
  function suggestName() {
    const first = String(me().name || 'My').split(/\s+/)[0];
    const words = ['Studio', 'Lab', 'Quest', 'Arcade', 'Workshop', 'Garden'];
    const taken = new Set(((window.TribeProjects && window.TribeProjects.list()) || []).map(p => p.name));
    for (const w of words) { const n = `${first}'s ${w}`; if (!taken.has(n)) return n; }
    return `${first}'s project ${taken.size + 1}`;
  }

  // ---------- kickoff card / running bar (docked at the top of Chat) ----------
  const STEP = [['room', 'Room'], ['link', 'Link'], ['repo', 'Repo'], ['github', 'GitHub']];
  function steps(f) {
    return `<ol class="fk-steps" aria-label="Setup">${STEP.map(([k, label]) => {
      const s = (f.steps[k] || {}).s || 'run';
      if (k === 'github' && (s === 'todo' || s === 'fail')) return `<li class="todo"><button class="fk-gh" id="flow-gh" title="${esc((f.steps.github || {}).note || 'Create a private GitHub repo and push')}">${ico('i-git')}Connect GitHub</button></li>`;
      return `<li class="${s}" title="${esc((f.steps[k] || {}).note || '')}">${s === 'ok' ? ico('i-tick') : s === 'fail' ? ico('i-x') : '<span class="spin" aria-hidden="true"></span>'}${label}</li>`;
    }).join('<li class="sep" aria-hidden="true">·</li>')}</ol>`;
  }
  function dockEl() {
    let d = $('#flow-dock');
    const col = $('#view-chat .chat-col'); if (!col) return null;
    if (!d) { d = document.createElement('div'); d.id = 'flow-dock'; d.className = 'flow-dock'; const list = $('#chat-list'); col.insertBefore(d, list); }
    return d;
  }
  function dock() {
    const d = dockEl(); if (!d) return;
    if (!flow) { d.innerHTML = ''; d.className = 'flow-dock'; return; }
    const f = flow;
    if (f.status === 'running' || minimized) {
      const pct = f.plan && f.plan.total ? Math.round(f.plan.done / f.plan.total * 100) : 0;
      const cm = f.plan && f.plan.milestones.find(m => m.id === f.plan.current);
      const waiting = f.changes.length && human() ? `<button class="fbar-wait" data-flow-go="updates">${f.changes.length === 1 ? 'A plan change' : `${f.changes.length} plan changes`} waiting</button>` : '';
      d.className = 'flow-dock bar';
      d.innerHTML = f.status === 'running'
        ? `<div class="fbar"><span class="live-dot" aria-hidden="true"></span><span class="fbar-t"><b>${cm ? esc(cm.title) : 'Plan done'}</b></span><span class="fbar-pg" title="${f.plan.done} of ${f.plan.total} done"><i style="width:${pct}%"></i></span>${f.blockers.length ? '<span class="fbar-blk">blocked</span>' : ''}${waiting}<button class="fbar-go" data-flow-go="updates">Plan<span class="lg"> &amp; updates</span> <svg class="i chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button></div>`
        : `<div class="fbar"><span class="eyebrow">Getting started</span><span class="fbar-t">${steps(f)}</span><button class="fbar-go" id="flow-expand">Open</button></div>`;
      wire(d); return;
    }
    d.className = 'flow-dock';
    const canEdit = human();
    d.innerHTML = `<section class="fk" id="flow-kick" aria-label="Getting started">
      <div class="fk-head"><div><span class="eyebrow">Getting started</span><h2>${esc(f.name || 'Your project')}</h2></div>${steps(f)}<button class="tb-icon fk-min" id="flow-min" title="Fold" aria-label="Fold the card">${ico('i-x')}</button></div>
      <div class="fk-block">
        <div class="fk-label"><span>Invite</span><span class="faint">${f.invite ? ({ public: 'works from anywhere', tailscale: 'Tailscale address', wifi: 'same Wi-Fi', local: 'this computer only' }[f.invite.kind] || '') : ''}</span></div>
        <div class="linkbox fk-link"><code id="flow-link" title="${esc(f.invite ? f.invite.link : '')}">${esc(f.invite ? f.invite.link : 'Making a link…')}</code>
          <button class="btn sm" id="flow-qr" title="QR code" aria-label="Show QR code">QR</button>${navigator.share ? `<button class="btn sm" id="flow-share">Share</button>` : ''}<button class="btn sm primary" id="flow-copy">Copy</button></div>
        <div class="fk-qr hidden" id="flow-qrbox"></div>
      </div>
      <div class="fk-block">
        <div class="fk-label"><span>Roles</span><button class="linkish" data-flow-go="roles">Edit roles</button></div>
        <div class="fk-roles" role="list">${f.roles.map(r => roleBtn(r)).join('')}</div>
        <div class="fk-menu hidden" id="flow-rmenu" role="menu"></div>
      </div>
      <div class="fk-block">
        <div class="fk-label"><span>Notes and files</span>${f.notes.length ? '' : '<span class="faint">ideas, sketches, a spec: anything</span>'}</div>
        <div class="fk-drop" id="flow-drop" tabindex="0" role="button" aria-label="Drop notes and files, or choose files">${ico('i-upload')}<span>Drop notes and files here</span><span class="faint">or <span class="linkish">choose</span></span><input type="file" id="flow-file" multiple hidden></div>
        <form class="fk-note" id="flow-noteform"><input class="input" id="flow-note" placeholder="Or type a quick note and press Enter" maxlength="4000" autocomplete="off" ${canEdit ? '' : 'disabled'}></form>
        ${f.notes.length ? `<div class="fk-notes">${f.notes.map(n => `<button class="fk-notechip" data-doc="${esc(n.doc || '')}" title="${esc(n.name)}">${ico(n.kind === 'file' ? 'i-folder' : 'i-doc')}<span>${esc(n.name)}</span></button>`).join('')}</div>` : ''}
      </div>
      <div class="fk-foot"><span class="faint">${f.notes.length ? 'Notes become the first plan, with tasks per role.' : 'Drop notes first, or start from the vision.'}</span><button class="btn primary" id="flow-start" ${canEdit ? '' : 'disabled'}>${ico('i-zap')}Start the flow</button></div>
    </section>`;
    wire(d);
  }
  function roleBtn(r) {
    const mine = r.members.includes(me().id);
    return `<button class="role-chip ${mine ? 'mine' : ''} ${r.members.length ? '' : 'open'}" role="listitem" data-role="${esc(r.id)}" style="--rc:${esc(r.hex)}" title="${esc(r.folders.map(f => f.path).join(', '))}">
      <span class="rg">${ico(r.glyph)}</span><span class="rn">${esc(r.name)}</span>${r.members.length ? `<span class="ravs">${r.members.slice(0, 3).map(mid => avatar(mid, 20)).join('')}</span>` : '<span class="ropen">open</span>'}</button>`;
  }
  function roleMenu(btn) {
    const menu = $('#flow-rmenu'); const r = role(btn.dataset.role); if (!menu || !r) return;
    if (!menu.classList.contains('hidden') && menu.dataset.role === r.id) { menu.classList.add('hidden'); return; }
    const mine = r.members.includes(me().id);
    const people = (C.state().members || []).filter(m => m.role !== 'agent' && m.role !== 'spectator' && m.id !== me().id);
    menu.dataset.role = r.id;
    menu.style.setProperty('--rc', r.hex);
    menu.innerHTML = `<div class="fm-head"><span class="rg">${ico(r.glyph)}</span><b>${esc(r.name)}</b><span class="fm-folders">${r.folders.map(f => `<span class="fchip" style="--rc:${esc(r.hex)}"><i class="rdot"></i><b>${esc(f.label)}</b><span class="fp">${esc(f.path)}</span></span>`).join('')}</span></div>
      <div class="fm-acts">${mine ? '<button class="btn sm" data-ract="leave">Leave</button>' : '<button class="btn sm primary" data-ract="take">Take it</button>'}
      ${people.length ? `<select class="fm-give" aria-label="Give ${esc(r.name)} to"><option value="">Give to…</option>${people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>` : '<span class="faint fm-none">Invite friends to give them roles</span>'}</div>`;
    menu.classList.remove('hidden');
    menu.querySelectorAll('[data-ract]').forEach(b => b.onclick = () => claim(r.id, { leave: b.dataset.ract === 'leave' }));
    const sel = menu.querySelector('.fm-give'); if (sel) sel.onchange = () => sel.value && claim(r.id, { member: sel.value });
  }
  async function claim(rid, body) {
    try { const r = await C.api(`/flow/roles/${encodeURIComponent(rid)}`, { method: 'POST', body }); setFlow(r.flow); } catch (e) { toast(e.message); }
  }
  function wire(d) {
    const on = (sel, fn) => { const el = d.querySelector(sel); if (el) el.onclick = fn; };
    on('#flow-min', () => { minimized = true; try { localStorage.setItem('tribecode.flowMin.' + flow.project, '1'); } catch {} dock(); });
    on('#flow-expand', () => { minimized = false; try { localStorage.removeItem('tribecode.flowMin.' + flow.project); } catch {} dock(); });
    on('#flow-copy', async () => { try { await navigator.clipboard.writeText(flow.invite.link); toast('Invite link copied'); } catch { getSelection().selectAllChildren($('#flow-link')); toast('Press Ctrl+C to copy'); } });
    on('#flow-share', () => navigator.share({ title: `Join ${flow.name} on TribeCode`, text: `Build ${flow.name} with me:`, url: flow.invite.link }).catch(() => {}));
    on('#flow-qr', () => { const b = $('#flow-qrbox'); if (b.classList.toggle('hidden')) return; b.innerHTML = `<div class="qr">${window.TribeQR.svg(flow.invite.link)}</div><p>Scan with a phone camera to join.</p>`; });
    on('#flow-gh', connectGitHub);
    on('#flow-start', startFlow);
    d.querySelectorAll('.role-chip').forEach(b => b.onclick = () => roleMenu(b));
    d.querySelectorAll('[data-flow-go]').forEach(b => b.onclick = () => open(b.dataset.flowGo));
    d.querySelectorAll('.fk-notechip[data-doc]').forEach(b => b.onclick = () => b.dataset.doc && (window.TribeShell ? window.TribeShell.previewDoc(b.dataset.doc) : null));
    const dz = d.querySelector('#flow-drop'), fi = d.querySelector('#flow-file');
    if (dz) {
      dz.onclick = () => fi.click();
      dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } };
      dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); const t = e.dataTransfer.getData('text/plain'); if (e.dataTransfer.files.length) dropFiles([...e.dataTransfer.files]); else if (t) note('Note', t); };
      fi.onchange = () => { dropFiles([...fi.files]); fi.value = ''; };
    }
    const nf = d.querySelector('#flow-noteform'); if (nf) nf.onsubmit = e => { e.preventDefault(); const i = $('#flow-note'); const t = i.value.trim(); if (!t) return; i.value = ''; note(t.split('\n')[0].slice(0, 60), t); };
  }
  const TEXTY = /\.(md|markdown|txt|text|csv|json|ya?ml|html?|js|ts|py|css)$/i;
  async function dropFiles(files) {
    let n = 0;
    for (const f of files.slice(0, 20)) {
      try {
        if (TEXTY.test(f.name) && f.size < 2e6) await C.api('/flow/notes', { method: 'POST', body: { name: f.name, text: await f.text() } });
        else {
          if (f.size > 10 * 1024 * 1024) { toast(`${f.name} is over 10 MB: put it in the repo instead`); continue; }
          const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = no; r.readAsDataURL(f); });
          await C.api('/flow/notes', { method: 'POST', body: { name: f.name, data } });
        }
        n++;
      } catch (e) { toast(e.message); }
    }
    if (n) { toast(n === 1 ? 'Added to Docs' : `${n} files added to Docs`); load(); }
  }
  async function note(name, text) {
    try { const r = await C.api('/flow/notes', { method: 'POST', body: { name, text } }); setFlow(r.flow); } catch (e) { toast(e.message); }
  }
  async function startFlow() {
    const b = $('#flow-start'); if (b) { b.disabled = true; b.innerHTML = '<span class="spin"></span>Planning…'; }
    try { const r = await C.api('/flow/start', { method: 'POST' }); setFlow(r.flow); toast(`Plan ready: ${r.flow.plan.total} tasks`); }
    catch (e) { toast(e.message); if (b) { b.disabled = false; b.textContent = 'Start the flow'; } }
  }
  function connectGitHub() {
    const m = $('#invite-modal'), body = $('#invite-body'); m.classList.remove('hidden');
    const st = flow.steps.github || {};
    body.innerHTML = `<span class="eyebrow">GitHub</span><h2>Put ${esc(flow.name)} on GitHub</h2>
      <p class="lead">TribeCode creates a private repo and pushes the starter. Paste a GitHub token with the <code>repo</code> scope (it stays on the host and never reaches a browser), or sign in with <code>gh auth login</code> on the host and press Try again.</p>
      ${st.s === 'fail' && st.note ? `<div class="np-err">${esc(st.note)}</div>` : ''}
      <div class="field"><input class="input" id="gh-token" type="password" placeholder="ghp_… or github_pat_…" autocomplete="off"></div>
      <div class="modal-foot"><a class="btn ghost" href="https://github.com/settings/tokens/new?scopes=repo&description=TribeCode" target="_blank" rel="noopener noreferrer">Make a token</a><span style="flex:1"></span><button class="btn" data-close>Later</button><button class="btn primary" id="gh-go">Try again</button></div>`;
    body.querySelector('[data-close]').onclick = () => m.classList.add('hidden');
    $('#gh-go').onclick = async () => {
      $('#gh-go').disabled = true; $('#gh-go').textContent = 'Pushing…';
      try { const r = await C.api('/flow/github', { method: 'POST', body: { token: $('#gh-token').value.trim() || undefined } }); setFlow(r.flow);
        if (r.step.s === 'ok') { m.classList.add('hidden'); } else { toast(r.step.note || 'Still not connected'); $('#gh-go').disabled = false; $('#gh-go').textContent = 'Try again'; } }
      catch (e) { toast(e.message); $('#gh-go').disabled = false; $('#gh-go').textContent = 'Try again'; }
    };
  }

  // ---------- my own views: Updates (plan + feed) and Roles ----------
  let cur = null;
  const VIEW_IDS = { updates: 'view-flow-updates', roles: 'view-flow-roles' };
  function sectionFor(k) {
    let s = document.getElementById(VIEW_IDS[k]);
    if (!s) { s = document.createElement('section'); s.id = VIEW_IDS[k]; s.className = 'hidden flow-view'; $('#main').appendChild(s); }
    return s;
  }
  function open(k) {
    if (!flow) return;
    document.body.classList.remove('drawer-open', 'mobile-chat');
    document.querySelectorAll('#main > section').forEach(s => s.classList.add('hidden'));
    cur = k; sectionFor(k).classList.remove('hidden');
    document.body.dataset.view = 'flow-' + k;
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = k === 'roles' ? 'Roles' : 'Updates';
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.remove('on'));
    document.querySelectorAll('[data-flow-nav]').forEach(b => b.classList.toggle('on', b.dataset.flowNav === k));
    $('#nest-updates') && $('#nest-updates').classList.toggle('on', k === 'updates');
    if (k === 'updates') updates(); else roles();
    $('#main').scrollTop = 0;
    try { C.sendActivity(k === 'roles' ? 'Roles' : 'Updates'); } catch {}
  }
  function hideMine() {
    cur = null; Object.values(VIEW_IDS).forEach(i => { const s = document.getElementById(i); if (s) s.classList.add('hidden'); });
    document.querySelectorAll('[data-flow-nav]').forEach(b => b.classList.remove('on')); const nu = $('#nest-updates'); if (nu) nu.classList.remove('on');
  }
  new MutationObserver(() => { if (cur && !String(document.body.dataset.view || '').startsWith('flow-')) hideMine(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  // Sidebar: a Roles row after Updates, and Updates opens the project's plan + feed when the project runs the flow.
  function navRows() {
    const after = $('#nest-updates'); if (!after) return;
    let r = $('#nest-roles');
    if (!flow) { if (r) r.remove(); return; }
    if (!r) { r = document.createElement('button'); r.className = 'nest-row'; r.id = 'nest-roles'; r.dataset.flowNav = 'roles'; r.innerHTML = `${ico('i-users')}<span>Roles</span>`; after.insertAdjacentElement('afterend', r); r.onclick = () => open('roles'); }
  }
  document.addEventListener('click', e => {
    if (!flow || !e.target.closest) return;
    const u = e.target.closest('#nest-updates');
    if (u) { e.stopImmediatePropagation(); e.preventDefault(); open('updates'); }
  }, true);

  // ---------- Updates: plan hero + changes + feed ----------
  function updates() {
    const s = sectionFor('updates'); const f = flow; if (!f) return;
    const plan = f.plan;
    const items = plan ? plan.milestones.flatMap(m => m.items) : [];
    const cm = plan && plan.milestones.find(m => m.id === plan.current);
    const pct = plan && plan.total ? Math.round(plan.done / plan.total * 100) : 0;
    const itemRow = i => { const r = role(i.role); return `<li class="pi ${i.done ? 'done' : ''}" style="--rc:${esc(r ? r.hex : 'var(--edge-pop)')}" data-task="${esc(i.task || '')}">
        <span class="pi-check" aria-label="${i.done ? 'done' : 'open'}">${i.done ? ico('i-tick') : ''}</span><span class="pi-t">${esc(i.text)}</span>${r ? G().roleChip(r) : ''}${i.assignee ? avatar(i.assignee, 20) : ''}</li>`; };
    const hero = plan ? `<section class="hero-card plan-hero" id="plan-hero">
        <span class="eyebrow">Plan${plan.version > 1 ? ` · v${plan.version}` : ''}</span>
        <h2>${cm ? esc(cm.title) : 'Everything in the plan is done'}</h2>
        <div class="ph-pg" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" title="${plan.done} of ${plan.total} done"><i style="width:${pct}%"></i></div>
        ${f.blockers.length ? `<div class="ph-blk">${f.blockers.map(b => `<div class="ph-b">${ico('i-hand')}<span><b>${esc(b.byName)}</b> ${esc(b.text)}</span>${human() ? `<button class="linkish" data-unblock="${esc(b.id)}">Resolved</button>` : ''}</div>`).join('')}</div>` : ''}
        ${cm ? `<ul class="pis cur">${cm.items.map(itemRow).join('')}</ul>` : ''}
        ${plan.milestones.length > 1 ? `<div class="ph-ms"><span class="eyebrow">Milestones</span>${plan.milestones.filter(m => m.id !== plan.current).map(m => { const done = m.items.length && m.items.every(i => i.done);
          return `<details class="ms ${done ? 'done' : ''}"><summary><span class="ms-dot">${done ? ico('i-tick') : ''}</span><b>${esc(m.title)}</b><span class="faint">${done ? 'done' : 'later'}</span></summary><ul class="pis">${m.items.map(itemRow).join('')}</ul></details>`; }).join('')}</div>` : ''}
        <div class="hero-acts"><button class="btn" id="flow-assess">${ico('i-eye')}Assess now</button><a class="btn ghost" href="${esc(C.base())}/api/flow/plan?project=${encodeURIComponent(f.project)}&token=${encodeURIComponent((window.TribeStore.get().server || {}).token || '')}" target="_blank" rel="noopener">PLAN.md</a></div>
      </section>`
      : `<section class="hero-card plan-hero" id="plan-hero"><span class="eyebrow">Plan</span><h2>No plan yet</h2><p>Claim roles and drop notes in the chat's Getting started card, then press Start the flow.</p><div class="hero-acts"><button class="btn primary" id="flow-tochat">Open the chat</button></div></section>`;
    const changes = f.changes.length ? `<section class="sec"><div class="sec-head"><span class="eyebrow">Waiting for a human</span><h2>Plan changes</h2></div>
        ${f.changes.map(c => { const r = role(c.role); return `<div class="pc" style="--rc:${esc(r ? r.hex : 'var(--edge-pop)')}" data-change="${esc(c.id)}"><div class="pc-main"><div class="pc-by">${r ? '<i class="rdot"></i>' : ''}${esc(c.byName)}</div><b>${esc(c.title)}</b>${c.bullets && c.bullets.length ? `<ul>${c.bullets.slice(0, 3).map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</div>
          ${human() ? `<div class="pc-acts"><button class="btn sm approve" data-decide="approve">Approve</button><button class="btn sm deny" data-decide="deny">Deny</button></div>` : '<span class="faint">a human decides</span>'}</div>`; }).join('')}</section>` : '';
    s.innerHTML = `<div class="view-head"><h1>Updates</h1><span class="faint">${esc(f.name || '')}</span><span style="flex:1"></span>${window.TribeNotify ? `<button class="btn" id="flow-inbox">${ico('i-bell')}Inbox</button>` : ''}</div>
      ${hero}${changes}
      <section class="sec"><div class="sec-head"><span class="eyebrow">Feed</span><h2>What happened</h2></div>
        <div class="gx-filters" role="tablist">${[['all', 'All'], ['progress', 'Progress'], ['plan', 'Plans'], ['upgrade', 'Upgrades'], ['blocker', 'Blockers'], ['assessment', 'Assessments']].map(([k, l]) => `<button role="tab" class="${filter === k ? 'on' : ''}" data-gf="${k}">${l}</button>`).join('')}</div>
        <div class="gx-feed" id="gx-feed"></div></section>`;
    const on = (sel, fn) => { const el = s.querySelector(sel); if (el) el.onclick = fn; };
    on('#flow-assess', assess);
    on('#flow-inbox', () => window.TribeNotify.openInbox());
    on('#flow-tochat', () => App().show('chat'));
    s.querySelectorAll('[data-decide]').forEach(b => b.onclick = async () => { const id = b.closest('[data-change]').dataset.change; b.disabled = true;
      try { const r = await C.api(`/flow/changes/${encodeURIComponent(id)}/${b.dataset.decide}`, { method: 'POST', body: {} }); setFlow(r.flow); toast(b.dataset.decide === 'approve' ? 'Added to the plan' : 'Turned down'); } catch (e) { toast(e.message); b.disabled = false; } });
    s.querySelectorAll('[data-unblock]').forEach(b => b.onclick = async () => { try { const r = await C.api(`/flow/blockers/${encodeURIComponent(b.dataset.unblock)}/resolve`, { method: 'POST' }); setFlow(r.flow); } catch (e) { toast(e.message); } });
    s.querySelectorAll('[data-gf]').forEach(b => b.onclick = () => { filter = b.dataset.gf; s.querySelectorAll('[data-gf]').forEach(x => x.classList.toggle('on', x === b)); feed(); });
    s.querySelectorAll('.pi[data-task]').forEach(li => li.onclick = () => { if (li.dataset.task) App().show('tasks'); });
    feed();
  }
  async function feed() {
    const box = $('#gx-feed'); if (!box) return;
    let list = [];
    try { list = (await C.api('/gists?limit=80')).gists || []; list.forEach(g => G().remember(g)); } catch {}
    const shown = list.filter(g => filter === 'all' || g.kind === filter);
    box.innerHTML = shown.length ? shown.map(g => G().card(g, { feed: true })).join('') : `<div class="pj-none">${filter === 'all' ? 'Nothing yet. Agents post gists here as they work; commits show up on their own.' : 'Nothing of this kind yet.'}</div>`;
  }
  async function assess() {
    const b = $('#flow-assess'); if (b) { b.disabled = true; b.innerHTML = '<span class="spin"></span>Assessing…'; }
    try { const r = await C.api('/flow/assess', { method: 'POST' }); setFlow(r.flow); toast('Assessment posted'); } catch (e) { toast(e.message); if (b) b.disabled = false; }
  }

  // ---------- Roles ----------
  function roles() {
    const s = sectionFor('roles'); const f = flow; if (!f) return;
    const edit = human();
    const people = (C.state().members || []).filter(m => m.role !== 'agent' && m.role !== 'spectator');
    s.innerHTML = `<div class="view-head"><h1>Roles</h1><span class="faint">who owns which folders</span><span style="flex:1"></span>${edit ? `<button class="btn" id="role-add">${ico('i-plus')}Add a role</button>` : ''}</div>
      <div class="roles-grid">${f.roles.map(r => {
        const agents = r.people.flatMap(p => p.agents);
        return `<section class="role-card" data-rid="${esc(r.id)}" style="--rc:${esc(r.hex)}">
          <header><button class="rg big" data-glyph title="Change the icon" ${edit ? '' : 'disabled'}>${ico(r.glyph)}</button>
            <input class="rc-name" value="${esc(r.name)}" maxlength="24" aria-label="Role name" ${edit ? '' : 'disabled'}>
            ${edit && f.roles.length > 1 ? `<button class="tb-icon rc-del" data-del title="Remove this role" aria-label="Remove ${esc(r.name)}">${ico('i-x')}</button>` : ''}</header>
          <div class="rc-colors" role="radiogroup" aria-label="Color">${Object.entries(f.palette).map(([k, hex]) => `<button class="rsw ${r.color === k || r.hex === hex ? "sel" : ""}" data-color="${k}" style="--sw:${hex}" title="${k}" aria-label="${k}" ${edit ? '' : 'disabled'}></button>`).join('')}</div>
          <div class="rc-sec"><span class="eyebrow">People</span>
            <div class="rc-people">${r.people.length ? r.people.map(p => `<span class="rc-person">${avatar(p.id, 24)}<span>${esc(p.name)}</span>${p.agents.length ? `<span class="rc-agent" title="${esc(p.agents.map(a => a.name).join(', '))}">${ico('i-robot')}</span>` : ''}</span>`).join('') : '<span class="faint">Open</span>'}</div>
            ${edit ? `<div class="rc-acts">${r.members.includes(me().id) ? '<button class="btn sm" data-leave>Leave</button>' : '<button class="btn sm primary" data-take>Take it</button>'}
              ${people.filter(p => p.id !== me().id && !r.members.includes(p.id)).length ? `<select class="fm-give" data-give aria-label="Give to"><option value="">Give to…</option>${people.filter(p => p.id !== me().id && !r.members.includes(p.id)).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>` : ''}</div>` : ''}
            ${agents.length ? `<div class="faint rc-note">${agents.length === 1 ? `${esc(agents[0].name)} works in these folders too.` : 'Their agents work in these folders too.'}</div>` : ''}</div>
          <div class="rc-sec"><span class="eyebrow">Folders</span>
            <div class="rc-folders">${r.folders.map((fo, i) => `<span class="fchip big" title="${esc(fo.path)}"><i class="rdot"></i><b>${esc(fo.label)}</b><span class="fp">${esc(fo.path)}</span>${edit ? `<button class="fx" data-unfolder="${i}" aria-label="Remove ${esc(fo.path)}">${ico('i-x')}</button>` : ''}</span>`).join('') || '<span class="faint">No folders yet</span>'}</div>
            ${edit ? `<form class="rc-addf" data-addf><input class="input" placeholder="folder/ (e.g. game/)" maxlength="80" aria-label="Add a folder"><button class="btn sm">Add</button></form>` : ''}</div>
        </section>`; }).join('')}</div>`;
    s.querySelectorAll('.role-card').forEach(card => {
      const rid = card.dataset.rid;
      const patch = fn => saveRoles(f.roles.map(r => (r.id === rid ? fn({ ...r, folders: r.folders.slice() }) : r)));
      const nm = card.querySelector('.rc-name'); if (nm) nm.onchange = () => nm.value.trim() && patch(r => ({ ...r, name: nm.value.trim() }));
      card.querySelectorAll('[data-color]').forEach(b => b.onclick = () => patch(r => ({ ...r, color: b.dataset.color })));
      const gb = card.querySelector('[data-glyph]'); if (gb) gb.onclick = () => patch(r => ({ ...r, glyph: f.glyphs[(f.glyphs.indexOf(r.glyph) + 1) % f.glyphs.length] }));
      const del = card.querySelector('[data-del]'); if (del) del.onclick = () => saveRoles(f.roles.filter(r => r.id !== rid));
      card.querySelectorAll('[data-unfolder]').forEach(b => b.onclick = () => patch(r => ({ ...r, folders: r.folders.filter((_, i) => i !== +b.dataset.unfolder) })));
      const af = card.querySelector('[data-addf]'); if (af) af.onsubmit = e => { e.preventDefault(); const v = af.querySelector('input').value.trim(); if (v) patch(r => ({ ...r, folders: [...r.folders, { path: v }] })); };
      const tk = card.querySelector('[data-take]'); if (tk) tk.onclick = () => claim(rid, {});
      const lv = card.querySelector('[data-leave]'); if (lv) lv.onclick = () => claim(rid, { leave: true });
      const gv = card.querySelector('[data-give]'); if (gv) gv.onchange = () => gv.value && claim(rid, { member: gv.value });
    });
    const add = $('#role-add'); if (add) add.onclick = () => { const used = new Set(f.roles.map(r => r.color)); const color = Object.keys(f.palette).find(k => !used.has(k)) || 'plum';
      saveRoles([...f.roles, { name: 'New role', color, glyph: 'i-spark', folders: [] }]).then(() => { const ins = document.querySelectorAll('.rc-name'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } }); };
  }
  async function saveRoles(list) {
    try { const r = await C.api('/flow/roles', { method: 'PUT', body: { roles: list.map(({ id, name, color, glyph, folders }) => ({ id, name, color, glyph, folders })) } }); setFlow(r.flow); } catch (e) { toast(e.message); }
  }

  // ---------- role color on task cards and avatar rings in the room list ----------
  function decorateAll() {
    const items = flow && flow.plan ? flow.plan.milestones.flatMap(m => m.items) : [];
    document.querySelectorAll('#board .task[data-id]').forEach(el => {
      const it = items.find(i => i.task === el.dataset.id), r = it && role(it.role);
      el.classList.toggle('has-role', !!r); if (r) el.style.setProperty('--rc', r.hex); else el.style.removeProperty('--rc');
    });
    document.querySelectorAll('#room-list .person[data-follow]').forEach(el => {
      const r = roleOfMember(el.dataset.follow), av = el.querySelector('.avatar'); if (!av) return;
      av.classList.toggle('role-ring', !!r); if (r) { av.style.setProperty('--rc', r.hex); av.title = r.name; }
    });
  }
  let dt; const decoSoon = () => { clearTimeout(dt); dt = setTimeout(decorateAll, 60); };
  function boot() {
    for (const sel of ['#board', '#room-list']) { const el = $(sel); if (el) new MutationObserver(decoSoon).observe(el, { childList: true, subtree: sel === '#board' }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.TribeFlow = { create, suggestName, load, open, state: () => flow, role, roleOfMember, folderOwner, openUpdates: () => open('updates'), openRoles: () => open('roles') };
})();
