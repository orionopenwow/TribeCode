// People (feat/presence): the People button in the top bar (with how many are online) opens a panel with two tabs.
//   This tribe: everyone in the tribe, people and AIs, with status, where they are now (click to jump there), what
//               they're working on (their in-progress tasks) and Message · Jump to · Profile · Star.
//   Friends:    starred friends, people you share a project with, and pending invites.
// Search and filters (Online, In this project, AIs), Invite at the top (the existing invite flow). A full-screen sheet on
// phones. Ctrl K gets "People" and "Where is <name>?"; Flint answers "where is Maya", "who's online", "who's working
// on the website" through flint().
//   window.TribePeoplePanel = { open(opts), close(), isOpen(), flint(intent, slots) -> { text, sum } }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (String(n || '?').trim().split(/\s+/).map(w => [...w][0]).slice(0, 2).join('') || '?').toUpperCase();
  const Z = () => window.TribePresence;
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const ICON = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.8 3.1-6 6.5-6s5.9 2.2 6.5 6"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.2c2.6.2 4.4 2 5 5"/></svg>';
  const STAR = on => `<svg class="i" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`;
  let open = false, tab = 'tribe', q = '', flt = new Set(), friends = new Set(), tasks = [], invites = [], focusId = null;

  // ---------- the button: top bar, left of the other status icons ----------
  const btn = document.createElement('button');
  btn.id = 'ppl-btn'; btn.className = 'ppl-btn'; btn.type = 'button'; btn.title = 'People: who is online and where';
  btn.setAttribute('aria-label', 'People'); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `${ICON}<span class="ppl-n" id="ppl-n" hidden>0</span>`;
  const tb = $('.titlebar .tb-right'); if (tb) tb.prepend(btn); else ($('.titlebar') || document.body).appendChild(btn);

  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="ppl-scrim" id="ppl-scrim" hidden></div>
    <aside class="ppl-panel" id="ppl-panel" role="dialog" aria-label="People" hidden tabindex="-1">
      <header class="ppl-head"><div><span class="eyebrow">People</span><h2 id="ppl-title">Who's around</h2></div>
        <button class="btn primary sm" id="ppl-invite" type="button">Invite</button>
        <button class="btn sm" id="ppl-claude" type="button" title="Invite your own AI agent (Claude, Cursor, Codex…): it joins next to you, with your access">Invite your agent</button>
        <button class="btn ghost sm" id="ppl-close" type="button" aria-label="Close">Done</button></header>
      <div class="ppl-tabs" role="tablist"><button role="tab" data-tab="tribe" type="button">This tribe</button><button role="tab" data-tab="friends" type="button">Friends</button></div>
      <div class="ppl-tools"><button class="linkish ppl-whocan" id="ppl-whocan" type="button">Who can do what here</button><input class="input ppl-q" id="ppl-q" type="search" placeholder="Search people" aria-label="Search people" autocomplete="off">
        <div class="ppl-chips" role="group" aria-label="Filters"><button type="button" class="ppl-chip" data-f="online" aria-pressed="false">Online</button><button type="button" class="ppl-chip" data-f="project" aria-pressed="false">In this project</button><button type="button" class="ppl-chip" data-f="ai" aria-pressed="false">AIs</button></div></div>
      <div class="ppl-body" id="ppl-body"></div>
    </aside>`;
  document.body.append(...wrap.children);

  // ---------- data ----------
  const me = () => C.state().me || {};
  const all = () => (C.state().members || []).filter(m => !m.guestUntil || Date.parse(m.guestUntil) > Date.now());
  const isAI = m => m.role === 'agent';
  const KIND_NAME = { claude: 'Claude', cursor: 'Cursor', codex: 'Codex', chatgpt: 'ChatGPT', gemini: 'Gemini', vscode: 'VS Code', windsurf: 'Windsurf', cline: 'Cline', zed: 'Zed', other: 'agent' };   // an invited agent's kind (server/agentshub.js AGENT_KINDS)
  const proj = () => (C.project && C.project()) || '';
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return '';
    if (s < 90) return 'just now'; if (s < 3600) return `${Math.round(s / 60)}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 172800) return 'yesterday'; return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function status(m) {
    if (!m.online) return { k: 'offline', t: 'offline', seen: (Z() && Z().seen(m.id)) || (isAI(m) ? m.since : null) };
    if ((Z() && Z().away(m.id)) || m.state === 'idle') return { k: 'away', t: 'away' };
    if (m.state === 'dnd') return { k: 'dnd', t: 'do not disturb' };
    return { k: 'online', t: 'online' };
  }
  const placeOf = m => (m.online && Z() ? Z().of(m.id) : null);
  const working = m => tasks.filter(t => t.status === 'doing' && t.assignee === m.id);
  const inProject = m => { const p = placeOf(m); return (p && p.pr === proj()) || (m.online && m.project === proj()); };
  async function load() {
    if (!C.connected || !C.connected()) return;
    const jobs = [
      C.api('/friends').then(r => { friends = new Set(r.friends || []); }).catch(() => {}),
      (window.TribeTasks && (window.TribeTasks.all() || []).length ? Promise.resolve({ tasks: window.TribeTasks.all() }) : C.api('/tasks')).then(r => { tasks = r.tasks || []; }).catch(() => {}),
    ];
    if (tab === 'friends' && !['spectator', 'agent'].includes(me().role)) jobs.push(C.api('/invites').then(r => { invites = r.invites || []; }).catch(() => { invites = []; }));
    await Promise.all(jobs); if (open) draw();
  }

  // ---------- drawing ----------
  function face(m) {
    const st = status(m).k;
    const av = window.TribeProfiles && window.TribeProfiles.avatar ? window.TribeProfiles.avatar(m, 'ppl-av') : `<span class="pf-av ppl-av" style="background:${esc(m.color || 'var(--peer)')}">${esc(initials(m.name))}</span>`;
    return `<span class="ppl-face">${av}<i class="ppl-dot st-${st}" aria-hidden="true"></i></span>`;
  }
  function row(m) {
    const s = status(m), p = placeOf(m), wk = working(m), you = m.id === me().id, Zp = Z();
    const where = p ? (Zp.canOpen(p) && !you ? `<button type="button" class="ppl-where linkish" data-jump="${esc(m.id)}" title="Jump there">${esc(Zp.label(p))}</button>` : `<span class="ppl-where">${esc(Zp.label(p))}</span>`) : '';
    const line = s.k === 'offline' ? `offline${s.seen ? ` · last seen ${esc(ago(s.seen))}` : ''}` : esc(s.t);
    const star = !isAI(m) && !you ? `<button type="button" class="ppl-act ppl-star${friends.has(m.id) ? ' on' : ''}" data-star="${esc(m.id)}" aria-pressed="${friends.has(m.id)}" title="${friends.has(m.id) ? 'Starred friend' : 'Star as friend'}" aria-label="${friends.has(m.id) ? 'Unstar' : 'Star'} ${esc(m.name)}">${STAR(friends.has(m.id))}</button>` : '';
    return `<div class="ppl-row${focusId === m.id ? ' focus' : ''}" data-mid="${esc(m.id)}">
      ${face(m)}
      <div class="ppl-t"><b>${esc(m.name)}${you ? ' <span class="ppl-you">you</span>' : ''}${isAI(m) ? ` <span class="ppl-ai${m.agentKind ? ' ppl-kind' : ''}" title="${esc(m.agentKind ? `AI agent · ${KIND_NAME[m.agentKind] || 'agent'}` : 'AI agent')}"${m.agentKind ? ` data-kind="${esc(m.agentKind)}"` : ''}>${m.agentKind && window.TribeIcons && window.TribeIcons.agent ? window.TribeIcons.agent(m.agentKind, 11) : ''}AI</span>` : ''}</b>${isAI(m) && m.invited && m.ownerName ? `<small class="ppl-by">invited by ${esc(m.ownerName)}</small>` : ''}
        <small class="ppl-st st-${s.k}">${line}${where ? ' · ' : ''}${where}</small>
        ${wk.length ? `<small class="ppl-wk">Working on ${wk.slice(0, 2).map(t => `“${esc(t.title)}”`).join(', ')}${wk.length > 2 ? ` +${wk.length - 2}` : ''}</small>` : ''}</div>
      ${you ? '' : `<div class="ppl-acts">
        ${!isAI(m) || m.owner === me().id ? `<button type="button" class="btn sm ppl-msg" data-dm="${esc(m.id)}">Message</button>` : ''}
        ${p && Zp.canOpen(p) ? `<button type="button" class="btn sm ppl-jump" data-jump="${esc(m.id)}">Jump to</button>` : ''}
        <button type="button" class="ppl-act" data-prof="${esc(m.id)}" title="View profile" aria-label="View ${esc(m.name)}'s profile"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg></button>
        ${star}</div>`}
    </div>`;
  }
  const rank = m => (m.id === me().id ? 3 : 0) + ({ online: 0, dnd: 0.5, away: 1, offline: 2 }[status(m).k]);
  const sort = l => l.sort((a, b) => rank(a) - rank(b) || (placeOf(b) ? 1 : 0) - (placeOf(a) ? 1 : 0) || String(a.name).localeCompare(b.name));
  function filtered(list) {
    const s = q.trim().toLowerCase();
    return list.filter(m => (!s || [m.name, Z() && placeOf(m) ? Z().label(placeOf(m)) : '', ...working(m).map(t => t.title)].join(' ').toLowerCase().includes(s))
      && (!flt.has('online') || m.online) && (!flt.has('project') || inProject(m)) && (!flt.has('ai') || isAI(m)));
  }
  const sec = (eyebrow, n, body) => `<section class="ppl-sec"><div class="ppl-sh"><span class="eyebrow">${esc(eyebrow)}</span>${n != null ? `<span class="ppl-sn">${esc(n)}</span>` : ''}</div>${body}</section>`;
  function draw() {
    const body = $('#ppl-body'); if (!body) return;
    document.querySelectorAll('#ppl-panel [data-tab]').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('#ppl-panel [data-f]').forEach(b => { const on = flt.has(b.dataset.f); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (!C.connected || !C.connected()) { body.innerHTML = '<p class="ppl-empty">People live in a tribe. Start a project or join one with a link, then everyone shows up here.</p>'; return; }
    const ppl = all();
    if (tab === 'tribe') {
      const list = sort(filtered(ppl)), on = list.filter(m => m.online && m.id !== me().id).length;
      body.innerHTML = list.length ? sec('Everyone', on ? `${on + 1} online` : 'Just you here', list.map(row).join('')) : '<p class="ppl-empty">No one matches. Clear the search or a filter.</p>';
    } else {
      const people = ppl.filter(m => !isAI(m) && m.id !== me().id);
      const starred = sort(filtered(people.filter(m => friends.has(m.id))));
      const mineP = new Set(((window.TribeProjects && window.TribeProjects.list()) || []).map(p => p.id));
      const shares = sort(filtered(people.filter(m => !friends.has(m.id) && (!Array.isArray(m.projects) || m.projects.some(x => mineP.has(x))))));
      const inv = invites.filter(i => i.by === me().id || me().role === 'host');
      body.innerHTML = sec('Starred friends', starred.filter(m => m.online).length + ' online', starred.length ? starred.map(row).join('') : '<p class="ppl-empty">Star someone with ☆ to keep them here.</p>')
        + sec('You share a tribe', null, shares.length ? shares.map(row).join('') : '<p class="ppl-empty">Everyone you share a project with shows up here.</p>')
        + sec('Pending invites', inv.length || null, inv.length ? inv.map(i => `<div class="ppl-row ppl-inv"><span class="ppl-face"><span class="pf-av ppl-av ppl-inv-av">+</span></span><div class="ppl-t"><b>${i.guest ? 'Guest pass' : 'Invite link'} · ${esc(i.uses || 0)}/${esc(i.maxUses)} used</b><small>expires ${esc(new Date(i.expires).toLocaleDateString([], { month: 'short', day: 'numeric' }))}${i.project ? ' · this project' : ''}</small></div></div>`).join('') : '<p class="ppl-empty">No open invites. <button type="button" class="linkish" data-invite>Invite someone</button></p>')
        + (canInvite() ? sec('Add someone new', null, `<button type="button" class="ppl-add" id="ppl-new-invite"><span class="ppl-ai k-ember" aria-hidden="true">+</span><span class="ppl-t"><b>Invite a friend</b><small>A link for this project. They join with a name, on a computer or a phone.</small></span></button>
          <button type="button" class="ppl-add" id="ppl-guest"><span class="ppl-ai k-indigo" aria-hidden="true">1×</span><span class="ppl-t"><b>One-time guest pass</b><small>Works once. Their account stops working after a day. Good for a quick look or a playtest.</small></span></button>
          <button type="button" class="ppl-add" id="ppl-new-claude"><span class="ppl-ai k-teal" aria-hidden="true">AI</span><span class="ppl-t"><b>Invite your agent</b><small>Your own Claude, Cursor, Codex or another AI joins next to you, with your access and never more.</small></span></button>
`) : '');
    }
    wire(body);
  }
  function wire(body) {
    body.querySelectorAll('[data-jump]').forEach(b => b.onclick = async () => { const id = b.dataset.jump; close(); await Z().jump(id); });
    body.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => { const id = b.dataset.dm; close(); if (window.TribeApp) window.TribeApp.show('chat'); setTimeout(() => window.TribeDM && window.TribeDM.open(id), 120); });
    body.querySelectorAll('[data-prof]').forEach(b => b.onclick = () => { const id = b.dataset.prof, m = all().find(x => x.id === id); close(); if (window.TribeAbilities && m && !isAI(m)) window.TribeAbilities.profile(id); else if (window.TribeProfiles) window.TribeProfiles.open(id, btn); });
    body.querySelectorAll('[data-star]').forEach(b => b.onclick = () => star(b.dataset.star));
    body.querySelectorAll('[data-invite]').forEach(b => b.onclick = () => invite());
    const nc = body.querySelector('#ppl-new-claude'); if (nc) nc.onclick = () => invite({ who: 'agent' });
    const ni = body.querySelector('#ppl-new-invite'); if (ni) ni.onclick = () => invite({ who: 'friend', project: proj() || undefined });
    const gp = body.querySelector('#ppl-guest'); if (gp) gp.onclick = () => invite({ who: 'guest' });
  }
  async function star(id) {
    const on = !friends.has(id);
    try { friends = new Set((await C.api('/friends', { method: 'PUT', body: { id, on } })).friends || []); toast(on ? 'Starred as a friend.' : 'Unstarred.'); } catch (e) { toast(e.message); }
    draw();
  }
  const canInvite = () => !['spectator', 'agent'].includes(me().role) && !me().guest;
  // Every invite here opens the one sheet (inviteone.js) on the right choice: a friend, a guest for a day, your Claude.
  function invite(opts) { close(); if (window.TribeApp && window.TribeApp.openInvite) window.TribeApp.openInvite(opts && opts.who ? opts : { who: 'friend' }); }
  function badge() {
    const n = all().filter(m => m.online && m.id !== me().id).length, el = $('#ppl-n');
    if (el) { el.textContent = n; el.hidden = !n; }
    btn.title = n ? `People: ${n} online` : 'People';
    btn.setAttribute('aria-label', n ? `People, ${n} online` : 'People');
  }

  // ---------- open / close ----------
  function show(o = {}) {
    open = true; if (o.tab) tab = o.tab; if (o.q !== undefined) q = o.q; if (o.filter) flt = new Set([].concat(o.filter)); focusId = o.focus || null;
    $('#ppl-q').value = q;
    $('#ppl-panel').hidden = false; $('#ppl-scrim').hidden = false; btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('ppl-on');
    draw(); load();
    requestAnimationFrame(() => { $('#ppl-panel').classList.add('in'); const f = focusId && $(`#ppl-body [data-mid="${CSS.escape(focusId)}"]`); if (f) f.scrollIntoView({ block: 'nearest' }); });
  }
  function close() {
    if (!open) return; open = false;
    const p = $('#ppl-panel'); p.classList.remove('in'); p.hidden = true; $('#ppl-scrim').hidden = true;
    btn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('ppl-on');
  }
  btn.onclick = () => (open ? close() : show());
  $('#ppl-whocan').onclick = () => { close(); window.TribeGroupStyle && window.TribeGroupStyle.open(); };   // feat/group-styles
  $('#ppl-scrim').onclick = close; $('#ppl-close').onclick = close; $('#ppl-invite').onclick = () => invite(); $('#ppl-claude').onclick = () => invite({ who: 'agent' });
  document.querySelectorAll('#ppl-panel [data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; focusId = null; draw(); load(); });
  document.querySelectorAll('#ppl-panel [data-f]').forEach(b => b.onclick = () => { const f = b.dataset.f; flt.has(f) ? flt.delete(f) : flt.add(f); draw(); });
  let qT = null; $('#ppl-q').oninput = e => { q = e.target.value; clearTimeout(qT); qT = setTimeout(draw, 80); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) close(); });
  const redraw = () => { badge(); if (open) draw(); };
  C.on('presence', redraw); C.on('status', redraw); C.on('task', () => { if (open) load(); });
  if (Z()) Z().on(redraw);

  // ---------- Ctrl K ----------
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => {
    const items = [{ kind: 'Action', label: 'People', keys: 'people friends tribe online who team members', hint: `${all().filter(m => m.online && m.id !== me().id).length} online`, run: () => show({ tab: 'tribe' }) },
      { kind: 'Action', label: 'Friends', keys: 'friends starred invite guest pass add friend', run: () => show({ tab: 'friends' }) }];
    for (const m of all()) {
      if (m.id === me().id) continue;
      const p = placeOf(m);
      items.push({ kind: 'Person', label: `Where is ${m.name}?`, keys: `where find locate ${m.name}`, hint: p ? Z().label(p) : status(m).t, run: () => (p && Z().canOpen(p) ? Z().jump(m.id) : show({ tab: 'tribe', focus: m.id, q: '' })) });
    }
    return items;
  });

  // ---------- Flint ----------
  const findP = who => { const s = String((who && who.name) || who || '').toLowerCase().trim(); if (!s) return null; return all().find(m => m.id === (who && who.id)) || all().find(m => m.name.toLowerCase() === s) || all().find(m => m.name.toLowerCase().split(/\s+/)[0] === s.split(/\s+/)[0]) || null; };
  function flint(intent, sl = {}) {
    const Zp = Z();
    if (intent === 'people.where') {
      const m = findP(sl.who); if (!m) return { text: "I don't know who that is in this tribe.", sum: 'looked for someone' };
      show({ tab: 'tribe', focus: m.id, q: '' });
      const s = status(m), p = placeOf(m), first = m.name.split(/\s+/)[0];
      if (!m.online) return { text: `${first} is offline${s.seen ? `, last seen ${ago(s.seen)}` : ''}.`, sum: `showed where ${first} is` };
      return { text: p ? `${first} is ${Zp.label(p)}${Zp.canOpen(p) ? '. **Jump to** takes you there.' : '.'}` : `${first} is ${s.t}, but isn't sharing where.`, sum: `showed where ${first} is` };
    }
    if (intent === 'people.online') {
      const on = all().filter(m => m.online && m.id !== me().id);
      show({ tab: 'tribe', filter: 'online', q: '' });
      return { text: on.length ? `${on.length} online: ${on.map(m => { const p = placeOf(m); return `**${m.name}**${p ? ' ' + Zp.label(p) : ''}`; }).join(', ')}.` : 'Nobody else is online right now.', sum: 'showed who is online' };
    }
    if (intent === 'people.working') {
      const w = String(sl.what || '').toLowerCase().replace(/^(the|our|my)\s+/, '');
      const site = /\b(site|website|web ?page|landing|designer)\b/.test(w);
      const hits = all().filter(m => m.online && m.id !== me().id).filter(m => {
        const p = placeOf(m), txt = [p ? Zp.label(p) : '', ...working(m).map(t => t.title)].join(' ').toLowerCase();
        return (site && p && p.k === 'site') || (w && txt.includes(w));
      });
      show({ tab: 'tribe', q: '', filter: [] });
      return { text: hits.length ? `${hits.map(m => `**${m.name}**`).join(', ')} ${hits.length === 1 ? 'is' : 'are'} on ${sl.what || 'it'} right now.` : `Nobody is on ${sl.what || 'that'} right now.`, sum: 'showed who is working on it' };
    }
    return null;
  }

  setTimeout(badge, 600);
  const loadFriends = () => { if (C.connected && C.connected()) C.api('/friends').then(r => { friends = new Set(r.friends || []); }).catch(() => {}); };
  C.on('status', s => { if (s && s.status === 'online') loadFriends(); }); setTimeout(loadFriends, 800);
  // fix/batch-fixes: the old Friends button (friends.js) is retired; its entry points open the Friends tab here
  window.TribeFriends = { open: () => show({ tab: 'friends', q: '' }), close, list: () => [...friends] };
  window.TribePeoplePanel = { open: show, close, isOpen: () => open, flint, draw };
})();
