// Person view: click a name or avatar (chat, room list, agents panel) and a calm panel opens inside the
// chat column (a bottom sheet on phones): who they are, what they and their Claude are on now, and one
// timeline of their commits, agent prompts, chat and notes. Chat items jump to the message in the main
// chat; commits and prompts show the chat around that moment.
//   window.TribePeople = { open(memberId), close(), statusLine(el) }
// Server: server/people.js (GET /api/people/:id). Hooks are event delegation only, so no other UI file
// needs to change: .msg[data-by] avatars/names, #room-list .person avatars (+ a "Profile" item in the
// room menu), agents panel names, and any element with data-person="<member id>".
(function () {
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => [...w][0]).slice(0, 2).join('').toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#38C6B1', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
  const ico = (k, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#${k}"/></svg>`;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const members = () => (C && C.state().members) || [];
  const meId = () => ((C && C.state().me) || {}).id;
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m);
  const KINDS = [['all', 'All'], ['commit', 'Commits'], ['prompt', 'Prompts'], ['chat', 'Chat'], ['note', 'Notes']];

  // ---------- time, words not numbers ----------
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return '';
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 172800) return 'yesterday';
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function span(sec) {
    sec = Math.max(0, Math.round(sec)); const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }
  const clock = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // ---------- roles (GET /api/projects/:id/roles may not exist yet: degrade to host/builder/agent) ----------
  const roleCache = new Map();
  async function roleOf(m) {
    const pid = C.project && C.project(); const key = pid || '-';
    let map = roleCache.get(key);
    if (!map || Date.now() - map.at > 30_000) {
      map = { at: Date.now(), by: {} };
      if (pid) try {
        const r = await C.api(`/projects/${encodeURIComponent(pid)}/roles`);
        const list = Array.isArray(r) ? r : Array.isArray(r.roles) ? r.roles : Array.isArray(r.members) ? r.members : r.roles && typeof r.roles === 'object' ? Object.entries(r.roles).map(([k, v]) => ({ member: k, ...(typeof v === 'string' ? { name: v } : v) })) : [];
        for (const x of list) {
          const ids = [x.member, x.memberId, x.id].concat(Array.isArray(x.members) ? x.members : []).filter(Boolean);
          const role = { name: x.role && typeof x.role === 'object' ? x.role.name : x.title || x.roleName || x.name || x.role, color: x.color || (x.role && x.role.color) || null };
          for (const id of ids) if (typeof id === 'string') map.by[id] = role;
        }
      } catch {}
      roleCache.set(key, map);
    }
    const r = map.by[m.agent ? m.owner : m.id] || map.by[m.id];
    if (r && r.name && typeof r.name === 'string') return { name: r.name, color: r.color || m.color };
    return { name: m.agent ? `${m.ownerName ? m.ownerName + "'s" : 'An'} AI` : m.host ? 'Host' : m.role === 'admin' ? 'Admin' : m.role === 'mod' ? 'Mod' : m.role === 'spectator' ? 'Spectator' : 'Builder', color: m.agent ? '#38C6B1' : m.color };
  }

  // ---------- panel ----------
  let cur = null, data = null, kind = 'all', loading = false, expanded = new Set(), backPill = null;
  function host() {
    let el = $('#person-panel'); if (el) return el;
    el = document.createElement('aside'); el.id = 'person-panel'; el.className = 'pp hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Person'); el.tabIndex = -1;
    const view = $('#view-chat');
    (view || document.body).appendChild(el);
    return el;
  }
  function scrim() {
    let s = $('#pp-scrim'); if (s) return s;
    s = document.createElement('div'); s.id = 'pp-scrim'; s.className = 'pp-scrim hidden'; s.onclick = close; document.body.appendChild(s);
    return s;
  }

  async function open(mid, opts = {}) {
    if (!mid || mid === 'tribecode' || mid === 'brain' || !C || !C.connected || !C.connected()) return;
    if (window.TribeApp && window.TribeApp.view && window.TribeApp.view() !== 'chat' && !opts.stay) window.TribeApp.show('chat');
    if (cur !== mid) { kind = 'all'; expanded = new Set(); data = null; }
    cur = mid; hidePill();
    const el = host(), view = $('#view-chat');
    if (view && el.parentNode !== view && !isPhone()) view.appendChild(el);
    if (isPhone() && el.parentNode !== document.body) document.body.appendChild(el);
    el.classList.remove('hidden'); el.classList.toggle('sheet', isPhone());
    if (view) view.classList.toggle('pp-open', !isPhone());
    document.body.classList.toggle('pp-on', !isPhone());   // people.css gives the chat room on laptop widths
    scrim().classList.toggle('hidden', !isPhone());
    document.body.classList.toggle('pp-sheet', isPhone());
    if (!data) el.innerHTML = skeleton(mid);
    await load();
    if (!opts.noFocus) el.focus({ preventScroll: true });
  }
  function close() {
    const el = $('#person-panel'); if (el) el.classList.add('hidden');
    const v = $('#view-chat'); if (v) v.classList.remove('pp-open');
    const s = $('#pp-scrim'); if (s) s.classList.add('hidden');
    document.body.classList.remove('pp-sheet', 'pp-on');
    cur = null; data = null; hidePill();
  }
  function skeleton(mid) {
    const m = members().find(x => x.id === mid) || { name: '…', color: '#2A313C' };
    return `<header class="pp-head"><div class="pp-av" style="background:${esc(m.color)};color:${ink(m.color)}">${esc(initials(m.name))}</div><div class="pp-id"><h2>${esc(m.name)}</h2><div class="pp-sub">&nbsp;</div></div>
      <button class="pp-close tb-icon" aria-label="Close">${ico('i-x')}</button></header><div class="pp-body"><div class="pp-skel"></div><div class="pp-skel short"></div></div>`;
  }
  async function load({ append = false } = {}) {
    if (!cur || loading) return; loading = true;
    const mid = cur;
    try {
      const q = new URLSearchParams({ kind, limit: '30' });
      if (append && data && data.timeline.next) q.set('before', data.timeline.next);
      const r = await C.api(`/people/${encodeURIComponent(mid)}?${q}`);
      if (mid !== cur) return;
      if (append && data) { r.timeline.items = data.timeline.items.concat(r.timeline.items); }
      data = r; data.role = await roleOf(r.member);
      render();
    } catch (e) {
      const el = host();
      el.innerHTML = `${skeleton(mid).split('<div class="pp-body">')[0]}<div class="pp-body"><p class="pp-empty">${esc(e.status === 403 ? 'They are not in this project.' : e.message)}</p></div>`;
    } finally { loading = false; }
  }

  // ---------- render ----------
  function presenceLine(d) {
    const p = d.presence, m = d.member;
    if (m.agent) return p.online ? 'active now' : p.since ? `last active ${esc(ago(p.since))}` : 'not connected yet';
    if (!p.online) return p.since ? `last seen ${esc(ago(p.since))}` : 'away';
    const w = (p.where || 'Home').replace(/^Docs · /, 'Docs · editing ');
    return `in ${esc(w)}`;
  }
  function agentLine(d) {
    const a = d.now.agent; if (!a) return '';
    const what = a.control ? `${a.control.action === 'stop' ? 'stop' : 'pause'} requested` : a.online ? (a.task ? a.task.title : 'active now') : 'idle';
    return `<div class="pp-agent ${a.online ? 'on' : ''}" data-person="${esc(a.id)}" title="Open ${esc(a.name)}"><span class="pp-dot"></span><span class="pp-agent-n">AI</span><span class="pp-agent-w">${esc(what)}</span></div>`;
  }
  function header(d) {
    const m = d.member, role = d.role || { name: '', color: m.color };
    const av = m.agent ? `<div class="pp-av agent" style="--ring:${esc(role.color || '#38C6B1')}">${ico('i-sparkle')}</div>`
      : `<div class="pp-av" style="--ring:${esc(role.color || m.color)};background:${esc(m.color)};color:${ink(m.color)}">${esc(initials(m.name))}</div>`;
    return `<header class="pp-head">${av}<div class="pp-id"><h2>${esc(m.name)}${window.TribeRoles && !m.agent ? window.TribeRoles.badge(m) : ''}${m.you ? ' <span class="pp-you">you</span>' : ''}</h2>
      <div class="pp-sub"><span class="pp-role" style="--rc:${esc(role.color || 'var(--muted)')}">${esc(role.name)}</span><span class="pp-sep">·</span><span class="pp-where ${d.presence.online ? 'on' : ''}">${presenceLine(d)}</span></div>
      ${agentLine(d)}</div><button class="pp-close tb-icon" aria-label="Close">${ico('i-x')}</button></header>`;
  }
  function actions(d) {
    const m = d.member, me = (C.state().me || {}), out = [];
    const mineAgent = m.agent && m.owner === me.id;
    if (!m.you && (!m.agent || mineAgent) && window.TribeDM) out.push(`<button class="btn" data-pp="dm">${ico('i-chat')}Message</button>`);
    const askable = me.role !== 'spectator' && me.role !== 'agent' && (m.agent ? m.id : m.agentOf && m.agentOf.id);
    if (askable) out.push(`<button class="btn" data-pp="ask">${ico('i-sparkle')}Ask ${m.agent ? 'it' : 'their AI'}</button>`);
    if (!m.you && !m.agent && d.presence.online) out.push(`<button class="btn ghost" data-pp="follow">${ico('i-eye')}Follow</button>`);
    const mod = window.TribeRoles && !m.agent ? window.TribeRoles.memberActions(m) : '';   // feat/roles: Mute, Remove from project
    if (!out.length && mod) return mod;
    return out.length ? `<div class="pp-acts">${out.join('')}</div>${mod}<form class="pp-ask hidden" id="pp-ask"><input class="input" maxlength="1500" placeholder="Ask ${esc(m.agent ? m.name : m.agentOf ? m.agentOf.name : '')}…" autocomplete="off"><button class="btn primary">Send</button></form>` : '';
  }
  function now(d) {
    const n = d.now, m = d.member;
    const task = n.task || (n.agent && n.agent.task);
    const files = n.files.concat(n.agent ? n.agent.files.map(f => ({ ...f, agent: true })) : []);
    const title = task ? esc(task.title) : files.length ? `Editing ${esc(files[0].path.split('/').pop())}` : m.agent ? (d.presence.online ? 'Working' : 'Idle') : 'Nothing claimed';
    const chips = [
      ...files.slice(0, 5).map(f => `<code class="pp-file ${f.agent ? 'agent' : ''}" title="${esc((f.agent ? 'Their AI · ' : '') + (f.note || f.path))}">${esc(f.path)}</code>`),
      ...(files.length > 5 ? [`<span class="pp-more" title="${esc(files.slice(5).map(f => f.path).join('\n'))}">+ more</span>`] : []),
      ...n.lanes.map(l => `<span class="pp-lane" title="Lane: they own this area">${esc(l)}</span>`),
    ];
    const ctl = n.control ? `<div class="pp-ctl">${ico('i-zap')}${esc(n.control.action === 'stop' ? 'Stop' : 'Pause')} requested by ${esc(n.control.by)}</div>` : '';
    return `<section class="pp-sec pp-now"><span class="eyebrow">Now</span><h3>${title}</h3>${task && task.status !== 'doing' ? `<p class="pp-muted">${esc(task.status)}</p>` : ''}${chips.length ? `<div class="pp-chips-row">${chips.join('')}</div>` : ''}${ctl}${context(d)}</section>`;
  }
  function context(d) {
    const c = d.context; if (!c) return '';
    const pct = c.usedPct;
    return `<div class="pp-ctx" title="${pct !== null && pct !== undefined ? `Context window ${pct}% used · ` : ''}reported ${esc(ago(c.at))}">
      ${pct !== null && pct !== undefined ? `<div class="pp-bar" role="meter" aria-label="Context window used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%" class="${pct >= 85 ? 'hot' : ''}"></i></div>` : ''}
      ${c.focus ? `<p class="pp-focus">${esc(c.focus)}</p>` : ''}</div>`;
  }
  function item(x) {
    const t = `<time datetime="${esc(x.at)}" title="${esc(new Date(x.at).toLocaleString())}">${esc(ago(x.at))}</time>`;
    if (x.kind === 'commit') {
      const open = expanded.has(x.sha);
      return `<li class="pp-it k-commit ${open ? 'open' : ''}" data-kind="commit" data-sha="${esc(x.sha)}" data-at="${esc(x.at)}"><span class="pp-k">${ico('i-git')}</span>
        <button class="pp-main" aria-expanded="${open}"><span class="pp-tx">${esc(x.text)}</span><span class="pp-meta"><code>${esc(x.short)}</code>${x.files.length ? `<span class="pp-files">${esc(x.files.slice(0, 2).map(f => f.split('/').pop()).join(', '))}${x.files.length > 2 || x.moreFiles ? '…' : ''}</span>` : ''}</span></button>${t}
        <div class="pp-x" ${open ? '' : 'hidden'}></div></li>`;
    }
    if (x.kind === 'prompt') {
      const open = expanded.has('p' + x.at);
      return `<li class="pp-it k-prompt ${x.shared ? 'shared' : ''} ${open ? 'open' : ''}" data-kind="prompt" data-at="${esc(x.at)}"><span class="pp-k">${ico('i-sparkle')}</span>
        <button class="pp-main" aria-expanded="${open}"><span class="pp-tx">${esc(x.text)}</span></button>${t}<div class="pp-x" ${open ? '' : 'hidden'}></div></li>`;
    }
    if (x.kind === 'chat') return `<li class="pp-it k-chat" data-kind="chat" data-id="${esc(x.id)}" data-at="${esc(x.at)}"><span class="pp-k">${ico('i-chat')}</span>
        <button class="pp-main" title="Show in chat"><span class="pp-tx">${esc(x.text)}</span></button>${t}</li>`;
    return `<li class="pp-it k-note" data-kind="note" data-slug="${esc(x.slug)}" data-at="${esc(x.at)}"><span class="pp-k">${ico('i-doc')}</span>
        <button class="pp-main" title="Open the doc"><span class="pp-tx">${x.verb === 'edited' ? 'Edited' : 'Wrote'} <b>${esc(x.title)}</b></span></button>${t}</li>`;
  }
  function timeline(d) {
    const k = d.timeline.kinds, total = Object.values(k).reduce((a, b) => a + b, 0);
    const chips = KINDS.filter(([v]) => v === 'all' || k[v]).map(([v, l]) => `<button class="pp-chip ${kind === v ? 'on' : ''}" data-kind-f="${v}" aria-pressed="${kind === v}" title="${v === 'all' ? '' : `${k[v]} ${l.toLowerCase()}`}">${l}</button>`).join('');
    const items = d.timeline.items;
    return `<section class="pp-sec pp-tl"><span class="eyebrow">Timeline</span>${total ? `<div class="pp-filter" role="group" aria-label="Filter">${chips}</div>` : ''}
      ${items.length ? `<ol class="pp-list">${items.map(item).join('')}</ol>` : `<p class="pp-empty">${total ? 'Nothing here yet.' : `Quiet so far. Commits, ${d.member.agent ? 'prompts' : 'their AI’s prompts'}, chat and notes show up here.`}</p>`}
      ${d.timeline.more ? '<button class="linkish pp-older" data-pp="older">Older</button>' : ''}</section>`;
  }
  function foot(d) {
    const c = d.counters, bits = [];
    if (d.member.host && c.uptimeSec !== null) bits.push(`<span title="This computer hosts the tribe. Running since ${esc(new Date(c.startedAt).toLocaleString())}" data-up="${esc(c.startedAt)}">up ${span(c.uptimeSec)}</span>`);
    else if (d.presence.online && d.presence.since && !d.member.agent) bits.push(`<span title="Online since ${esc(clock(d.presence.since))}">here ${span((Date.now() - Date.parse(d.presence.since)) / 1000)}</span>`);
    if (c.commits) bits.push(`<span title="${c.commits} commit${c.commits === 1 ? '' : 's'} in this project${c.commitsToday ? `, ${c.commitsToday} today` : ''}">${c.commitsToday ? `${c.commitsToday} commit${c.commitsToday === 1 ? '' : 's'} today` : `${c.commits} commit${c.commits === 1 ? '' : 's'}`}</span>`);
    return bits.length ? `<footer class="pp-foot">${bits.join('<span class="pp-sep">·</span>')}</footer>` : '';
  }
  function render() {
    const el = host(), d = data; if (!d) return;
    const sc = el.querySelector('.pp-body'), top = sc ? sc.scrollTop : 0;
    el.innerHTML = `${header(d)}<div class="pp-body">${actions(d)}${now(d)}${timeline(d)}</div>${foot(d)}`;
    const nb = el.querySelector('.pp-body'); if (nb) nb.scrollTop = top;
    for (const key of expanded) { const li = key.startsWith('p') ? el.querySelector(`.pp-it.k-prompt[data-at="${CSS.escape(key.slice(1))}"]`) : el.querySelector(`.pp-it.k-commit[data-sha="${CSS.escape(key)}"]`); if (li) expand(li, true); }
  }

  // ---------- timeline actions ----------
  function nearestMsg(at) {
    const list = [...document.querySelectorAll('#chat-list .msg[data-at]')]; if (!list.length) return null;
    let best = null, bd = Infinity; const t = Date.parse(at);
    for (const el of list) { const d = Math.abs(Date.parse(el.dataset.at) - t); if (d < bd) { bd = d; best = el; } }
    return best;
  }
  function flash(el) {
    el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    el.classList.remove('pp-flash'); void el.offsetWidth; el.classList.add('pp-flash');
    setTimeout(() => el.classList.remove('pp-flash'), 1800);
  }
  function jumpTo(id, at) {
    if (window.TribeDM && window.TribeDM.current && window.TribeDM.current() !== 'general') window.TribeDM.back();
    if (window.TribeApp && window.TribeApp.view() !== 'chat') window.TribeApp.show('chat');
    const el = id ? document.querySelector(`#chat-list .msg[data-id="${CSS.escape(id)}"]`) : nearestMsg(at);
    if (!el) { toast('That message is further back than the chat has loaded.'); return false; }
    if (isPhone()) minimize();
    flash(el); return true;
  }
  async function expand(li, quiet) {
    const box = li.querySelector('.pp-x'); if (!box) return;
    const sha = li.dataset.sha, key = sha || 'p' + li.dataset.at;
    if (!quiet && expanded.has(key)) { expanded.delete(key); li.classList.remove('open'); box.hidden = true; li.querySelector('.pp-main').setAttribute('aria-expanded', 'false'); return; }
    expanded.add(key); li.classList.add('open'); box.hidden = false; li.querySelector('.pp-main').setAttribute('aria-expanded', 'true');
    if (box.dataset.done) return;
    box.innerHTML = '<div class="pp-skel short"></div>';
    try {
      const mid = encodeURIComponent(cur);
      const [cm, ar] = await Promise.all([
        sha ? C.api(`/people/${mid}/commit/${sha}`).then(r => r.commit).catch(() => null) : null,
        C.api(`/people/${mid}/around?at=${encodeURIComponent(li.dataset.at)}`).then(r => r.messages).catch(() => []),
      ]);
      let h = '';
      if (cm) {
        const max = Math.max(1, ...cm.files.map(f => (f.add || 0) + (f.del || 0)));
        h += `<ul class="pp-diff">${cm.files.map(f => `<li title="${f.add === null ? 'binary' : `+${f.add} −${f.del}`}"><code>${esc(f.path)}</code><span class="pp-spark" aria-hidden="true"><i class="a" style="width:${Math.round((f.add || 0) / max * 100)}%"></i><i class="d" style="width:${Math.round((f.del || 0) / max * 100)}%"></i></span></li>`).join('')}${cm.more ? `<li class="pp-muted">and ${cm.more} more</li>` : ''}</ul>`;
        if (cm.body) h += `<p class="pp-body-tx">${esc(cm.body)}</p>`;
      }
      if (ar && ar.length) {
        h += `<div class="pp-around"><span class="pp-around-h">Chat around then</span>${ar.map(m => `<button class="pp-am ${m.after ? 'after' : ''}" data-jump="${esc(m.id)}" data-at="${esc(m.at)}"><b>${esc(m.name)}</b><span>${esc(m.text)}</span><time>${esc(clock(m.at))}</time></button>`).join('')}</div>`;
      } else h += '<p class="pp-muted">No chat around then.</p>';
      box.innerHTML = h; box.dataset.done = '1';
    } catch (e) { box.innerHTML = `<p class="pp-muted">${esc(e.message)}</p>`; }
  }

  // phone: after a jump, tuck the sheet away and leave a pill to come back
  function minimize() {
    const back = cur;
    const el = $('#person-panel'); if (el) el.classList.add('hidden');
    const s = $('#pp-scrim'); if (s) s.classList.add('hidden');
    document.body.classList.remove('pp-sheet');
    if (!backPill) { backPill = document.createElement('button'); backPill.className = 'pp-pill'; backPill.type = 'button'; document.body.appendChild(backPill); }
    const m = data && data.member; backPill.innerHTML = `${ico('i-users')}Back to ${esc(m ? m.name : 'profile')}`;
    backPill.classList.remove('hidden'); backPill.onclick = () => open(back);
  }
  function hidePill() { if (backPill) backPill.classList.add('hidden'); }

  // ---------- panel clicks ----------
  document.addEventListener('click', async e => {
    const el = e.target.closest && e.target.closest('#person-panel'); if (!el) return;
    const t = e.target;
    if (t.closest('.pp-close')) return close();
    const f = t.closest('[data-kind-f]'); if (f) { kind = f.dataset.kindF; expanded = new Set(); return load(); }
    const p = t.closest('.pp-agent[data-person]'); if (p) return open(p.dataset.person);
    const a = t.closest('[data-pp]');
    if (a) {
      const m = data.member;
      if (a.dataset.pp === 'dm') { close(); return window.TribeDM.open(m.id); }
      if (a.dataset.pp === 'follow') { const row = document.querySelector(`#room-list .person[data-follow="${CSS.escape(m.id)}"]`); if (row && row.onclick) { close(); row.onclick(); } return; }
      if (a.dataset.pp === 'ask') { const fm = el.querySelector('#pp-ask'); fm.classList.toggle('hidden'); if (!fm.classList.contains('hidden')) fm.querySelector('input').focus(); return; }
      if (a.dataset.pp === 'older') return load({ append: true });
    }
    const j = t.closest('.pp-am[data-jump]'); if (j) return jumpTo(j.dataset.jump, j.dataset.at);
    const li = t.closest('.pp-it'); if (!li || !t.closest('.pp-main')) return;
    if (li.dataset.kind === 'chat') return jumpTo(li.dataset.id, li.dataset.at);
    if (li.dataset.kind === 'note') { if (window.TribeApp) window.TribeApp.show('docs'); if (window.TribeDocs && window.TribeDocs.open) window.TribeDocs.open(li.dataset.slug); return; }
    return expand(li);
  });
  document.addEventListener('submit', async e => {
    if (!e.target.matches || !e.target.matches('#pp-ask')) return;
    e.preventDefault();
    const inp = e.target.querySelector('input'), q = inp.value.trim(); if (!q || !data) return;
    const m = data.member, agentId = m.agent ? m.id : m.agentOf && m.agentOf.id;
    try {
      await C.api('/agents/channel', { method: 'POST', body: { text: `@${agentId} ${q}` } });
      inp.value = ''; e.target.classList.add('hidden'); toast(`Asked ${m.agent ? m.name : m.agentOf.name}. The reply shows in #agents.`);
    } catch (err) { toast(err.message); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur && !document.querySelector('.modal:not(.hidden)')) close(); });

  // ---------- open from anywhere (event delegation; capture so row handlers don't run first) ----------
  const isSys = id => !id || id === 'tribecode' || id === 'brain';
  let lastRow = null;
  addEventListener('click', e => {
    const t = e.target; if (!t.closest) return;
    if (t.closest('#person-panel')) return;
    // room list: the avatar opens the profile; the rest of the row keeps its menu (Message / Follow) and gains "Profile"
    const row = t.closest('#room-list .person[data-follow]');
    if (row) { lastRow = row.dataset.follow; if (t.closest('.avatar') && !window.TribeProfiles) { e.preventDefault(); e.stopPropagation(); open(row.dataset.follow); } return; }   // feat/profiles: with profiles.js the avatar opens the popout; its View activity opens this panel
    // agents at a glance (right panel) and agent cards: the name opens the profile
    const ag = t.closest('#room-agents .ra-row[data-agent] b, .ag-card[data-agent] .ag-t b, .ag-card[data-agent] .ag-ico');
    if (ag) { e.preventDefault(); e.stopPropagation(); open(ag.closest('[data-agent]').dataset.agent); return; }
    const dp = t.closest('[data-person]');
    if (dp && !dp.closest('#person-panel')) { e.preventDefault(); e.stopPropagation(); open(dp.dataset.person); return; }
  }, true);
  document.addEventListener('click', e => {
    const t = e.target; if (!t.closest) return;
    const hit = !window.TribeProfiles && t.closest('.msg[data-by] > .avatar, .msg[data-by] .mb > b'); if (!hit) return;   // feat/profiles: names open the popout
    const by = hit.closest('.msg').dataset.by; if (isSys(by)) return;
    open(by);
  });
  // "Profile" in the room menu dm.js shows when a person row is clicked
  new MutationObserver(() => {
    const menu = document.getElementById('dm-menu');
    if (!menu || menu.querySelector('[data-act="profile"]') || !lastRow) return;
    const b = document.createElement('button'); b.setAttribute('role', 'menuitem'); b.dataset.act = 'profile';
    b.innerHTML = `${ico('i-users')}Profile`;
    const who = lastRow; b.onclick = () => { menu.remove(); open(who); };
    menu.insertBefore(b, menu.firstChild);
  }).observe(document.body, { childList: true });

  // ---------- live ----------
  let soon;
  const refresh = () => { clearTimeout(soon); soon = setTimeout(() => { if (cur && !loading) load(); }, 600); };
  if (C) {
    C.on('chat', ({ message }) => { if (cur && message && (message.by === cur || (data && data.member.agentOf && message.by === data.member.agentOf.id))) refresh(); });
    C.on('presence', () => { if (cur) refresh(); });
    C.on('claims', () => { if (cur) refresh(); });
    C.on('project', () => { if (cur) close(); roleCache.clear(); });
  }
  addEventListener('resize', () => { if (!cur) return; const el = $('#person-panel'); if (el && el.classList.contains('sheet') !== isPhone()) open(cur, { noFocus: true, stay: true }); });

  // ---------- status line: host uptime + project commits, small and mono ----------
  const lines = new Set();
  let status = null, statusAt = 0;
  async function fetchStatus() {
    if (!C || !C.connected || !C.connected()) return null;
    try { const r = await C.api('/people'); status = r.status; statusAt = Date.now(); } catch {}
    return status;
  }
  function drawLine(el) {
    if (!status) { el.textContent = ''; return; }
    const up = status.uptimeSec + (Date.now() - statusAt) / 1000;
    const parts = [`<span>up ${span(up)}</span>`];
    if (status.repo && status.commitsToday) parts.push(`<span>${status.commitsToday} commit${status.commitsToday === 1 ? '' : 's'} today</span>`);
    el.innerHTML = parts.join('<span class="pp-sep">·</span>');
    el.title = `Host running since ${new Date(status.startedAt).toLocaleString()}${status.repo ? ` · ${status.commitsTotal} commit${status.commitsTotal === 1 ? '' : 's'} in this project` : ''}`;
  }
  function statusLine(el) {
    if (!el) return null;
    el.classList.add('pp-status'); lines.add(el);
    if (status) drawLine(el); else fetchStatus().then(() => lines.forEach(drawLine));
    return el;
  }
  setInterval(() => { if (!lines.size || document.visibilityState !== 'visible') return; [...lines].forEach(l => { if (!l.isConnected) lines.delete(l); }); fetchStatus().then(() => lines.forEach(drawLine)); }, 60_000);
  if (C) { C.on('hello', () => fetchStatus().then(() => lines.forEach(drawLine))); C.on('project', () => fetchStatus().then(() => lines.forEach(drawLine))); }
  // Until the shell mounts it in the sidebar footer, it sits quietly at the bottom of the room pane.
  function mountDefault() {
    if (document.querySelector('.pp-status')) return;
    const pane = $('#room-pane'); if (!pane) return;
    const el = document.createElement('div'); el.id = 'people-status'; pane.appendChild(el); statusLine(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountDefault); else mountDefault();

  window.TribePeople = { open, close, statusLine, current: () => cur };
})();
