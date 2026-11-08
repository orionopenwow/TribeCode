// Roles & privileges (feat/roles, server/perms.js).
//   * Role badges: small tonal pills (Host ember-soft, Admin indigo-soft, 🛡️ Mod teal-soft) for chat names, people lists, profiles.
//   * Mod tools: extra items in the chat message menu (Delete for everyone, Mute 10m/1h/24h) and person menus
//     (Mute, Unmute, Remove from project). The server checks every one of them again.
//   * Muted: a calm notice over the composer; posting opens again when the mute ends.
//   * Settings › Roles & privileges (host and admins): members with a role picker, the capabilities × roles matrix
//     (locked cells: host only), reset to defaults, and recent changes.
// Public: window.TribeRoles = { badge, label, can, outranks, msgMenuItems, onMsgAct, memberActions, onMemberAct, open, refresh, state }.
(function () {
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const RANK = { agent: 10, spectator: 20, builder: 40, mod: 60, admin: 80, host: 100 };
  const LABEL = { host: 'Host', admin: 'Admin', mod: 'Mod', builder: 'Builder', spectator: 'Spectator' };
  let st = { me: null, matrix: null, members: null, canReset: false };
  const members = () => C.state().members || [];
  const member = id => members().find(m => m.id === id);
  const meId = () => (C.state().me || {}).id;
  const myRole = () => (st.me && st.me.role) || (member(meId()) || C.state().me || {}).role || 'builder';
  const can = cap => !!(st.me && st.me.caps && st.me.caps[cap]);
  const roleOf = m => (m && m.role === 'agent' ? 'builder' : (m && m.role) || 'builder');
  function outranks(other) {
    if (!other || other.role === 'host') return false;
    if (myRole() === 'host') return true;
    return (RANK[myRole()] || 0) > (RANK[roleOf(other)] || 0);
  }
  const ago = iso => { const t = new Date(iso); return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

  // ---------- badges ----------
  function badge(x, { quiet = false } = {}) {
    const m = typeof x === 'string' ? member(x) : x; if (!m) return '';
    const r = m.role;
    if (r === 'host') return `<span class="role-pill rp-host" title="Host: runs the tribe on their computer">Host</span>`;
    if (r === 'admin') return `<span class="role-pill rp-admin" title="Admin: manages the tribe">Admin</span>`;
    if (r === 'mod') return `<span class="role-pill rp-mod" title="Mod: keeps the chat kind">${quiet ? '' : '<span class="rp-e" aria-hidden="true">🛡️</span>'}Mod</span>`;
    return '';
  }
  const label = r => LABEL[r] || r;

  // ---------- state ----------
  let loading = null;
  function refresh() {
    if (!C.connected || !C.connected()) return Promise.resolve(st);
    loading = C.api('/perms').then(r => {
      st = { me: r.me, matrix: r.matrix || null, members: r.members || null, canReset: !!r.canReset };
      const cm = C.state().me; if (cm && r.me && r.me.tribeRole) cm.role = r.me.tribeRole;
      muteNote(); drawModal(); repaint();
      return st;
    }).catch(() => st).finally(() => { loading = null; });
    return loading;
  }
  let lastSig = '';
  function onPresence() {
    const m = member(meId()); if (!m) return;
    const sig = `${m.role}|${m.mutedUntil || ''}`;
    if (sig !== lastSig) { lastSig = sig; refresh(); }
    else muteNote();
  }

  // ---------- muted notice ----------
  let muteTimer = null;
  function muteNote() {
    const m = member(meId()), until = (m && m.mutedUntil) || (st.me && st.me.mutedUntil);
    const live = until && Date.parse(until) > Date.now();
    const dock = $('#composer-mount'); if (!dock) return;
    let n = $('#mute-note');
    if (!live) { if (n) n.remove(); dock.classList.remove('is-muted'); return; }
    if (!n) { n = document.createElement('div'); n.id = 'mute-note'; n.className = 'mute-note'; n.setAttribute('role', 'status'); dock.parentNode.insertBefore(n, dock); }
    n.innerHTML = `<span class="mn-e" aria-hidden="true">🤫</span><span><b>You're muted until ${esc(ago(until))}.</b> You can read along; posting opens again then.</span>`;
    dock.classList.add('is-muted');
    clearTimeout(muteTimer); muteTimer = setTimeout(muteNote, Math.min(Math.max(Date.parse(until) - Date.now() + 500, 1000), 60_000));
  }

  // ---------- chat message menu (chatx.js calls these) ----------
  const isDm = ch => /^dm-/.test(String(ch || ''));
  function msgMenuItems(m, ch) {
    if (!m || m.by === meId() || m.deleted || isDm(ch) || m.by === 'tribecode') return '';
    const by = member(m.by), out = [];
    const ok = !by || outranks(by);
    if (can('chat.moderate') && ok) out.push(`<button role="menuitem" data-act="mod-del" class="danger">${ico('i-trash')}Delete for everyone</button>`);
    if (can('members.mute') && by && ok) {
      const who = by.role === 'agent' && by.owner ? member(by.owner) || by : by;
      out.push(`<div class="menu-label">Mute ${esc((who.name || '').split(' ')[0])}</div><div class="mod-mute-row">${[[10, '10m'], [60, '1h'], [1440, '24h']].map(([n, t]) => `<button role="menuitem" data-act="mod-mute" data-min="${n}" data-who="${esc(who.id)}">${t}</button>`).join('')}</div>`);
    }
    return out.length ? `<div class="mod-sep" role="separator"><span>🛡️ Mod tools</span></div>${out.join('')}` : '';
  }
  async function onMsgAct(btn, m, ch) {
    const act = btn.dataset.act;
    if (act === 'mod-del') { await C.api(`/chat/${ch}/msg/${m.id}`, { method: 'DELETE' }); toast('Deleted for everyone'); return true; }
    if (act === 'mod-mute') { await mute(btn.dataset.who, Number(btn.dataset.min)); return true; }
    return false;
  }
  async function mute(id, min) {
    const r = await C.api('/perms/mute', { method: 'POST', body: { member: id, minutes: min } });
    toast(`${(member(id) || {}).name || 'They'} ${min >= 60 ? `muted for ${Math.round(min / 60)}h` : `muted for ${min}m`}`); return r;
  }
  async function unmute(id) { await C.api(`/perms/mute/${encodeURIComponent(id)}`, { method: 'DELETE' }); toast(`${(member(id) || {}).name || 'They'} can post again`); }
  async function removeFromProject(id) {
    const pid = C.state().project;
    await C.api('/perms/remove', { method: 'POST', body: { member: id, project: pid } });
    toast(`${(member(id) || {}).name || 'They'} left this project`);
  }

  // ---------- person menus (people.js panel, mobile2.js profile sheet) ----------
  function memberActions(m, { cls = 'btn ghost', wrap = true } = {}) {
    if (!m || m.id === meId() || m.agent || m.role === 'agent') return '';
    const mem = member(m.id) || m; if (!outranks(mem)) return '';
    const out = [];
    const muted = mem.mutedUntil && Date.parse(mem.mutedUntil) > Date.now();
    if (can('members.mute')) out.push(muted ? `<button class="${cls}" data-mod="unmute" data-who="${esc(m.id)}">Unmute</button>`
      : `<button class="${cls}" data-mod="mute" data-who="${esc(m.id)}" aria-haspopup="menu">Mute…</button>`);
    if (can('members.remove') && C.state().project) out.push(`<button class="${cls} mod-danger" data-mod="remove" data-who="${esc(m.id)}">Remove from project</button>`);
    if (!out.length) return '';
    const inner = `${muted ? `<span class="mod-note">Muted until ${esc(ago(mem.mutedUntil))}</span>` : ''}${out.join('')}`;
    return wrap ? `<div class="mod-acts" aria-label="Mod tools"><span class="mod-eb">🛡️ Mod tools</span>${inner}</div>` : inner;
  }
  // One delegated handler for every [data-mod] button, wherever it is drawn.
  let armed = null;
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-mod]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const who = b.dataset.who, k = b.dataset.mod;
    try {
      if (k === 'mute') return muteMenu(b, who);
      if (k === 'mute-for') { closeMute(); await mute(who, Number(b.dataset.min)); return; }
      if (k === 'unmute') { await unmute(who); return; }
      if (k === 'remove') {
        if (armed !== b) { armed = b; b.dataset.label = b.textContent; b.textContent = 'Tap again to remove'; setTimeout(() => { if (armed === b) { armed = null; b.textContent = b.dataset.label; } }, 3000); return; }
        armed = null; await removeFromProject(who);
        if (window.TribeMobile && window.TribeMobile.closeSheet) window.TribeMobile.closeSheet();
      }
    } catch (err) { toast(err.message); }
  }, true);
  function closeMute() { const m = $('#mod-mute-menu'); if (m) m.remove(); }
  function muteMenu(anchor, who) {
    closeMute();
    const menu = document.createElement('div'); menu.id = 'mod-mute-menu'; menu.className = 'dm-menu msg-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="menu-label">Mute for</div>${[[10, '10 minutes'], [60, '1 hour'], [1440, '24 hours']].map(([n, t]) => `<button role="menuitem" data-mod="mute-for" data-min="${n}" data-who="${esc(who)}">${t}</button>`).join('')}`;
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, r.bottom + 4)) + 'px';
    menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left)) + 'px';
    const f = menu.querySelector('button'); if (f) f.focus();
    setTimeout(() => document.addEventListener('click', function off(ev) { if (!ev.target.closest('#mod-mute-menu')) { closeMute(); document.removeEventListener('click', off, true); } }, true), 0);
  }

  // ---------- Settings › Roles & privileges ----------
  const ico = (id, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const LOCK = '<svg class="rl-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const modal = () => $('#roles-modal');
  function ensure() {
    if (modal()) return;
    document.body.insertAdjacentHTML('beforeend', '<div class="modal hidden" id="roles-modal" role="dialog" aria-label="Roles and privileges"><div class="modal-card rl-card" id="roles-body"></div></div>');
    modal().addEventListener('click', e => { if (e.target === modal()) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal() && !modal().classList.contains('hidden') && !$('#mod-mute-menu')) close(); });
  }
  function close() { modal().classList.add('hidden'); }
  async function open() {
    ensure(); modal().classList.remove('hidden');
    $('#roles-body').innerHTML = '<p class="faint rl-wait">Loading…</p>';
    await refresh(); drawModal();
  }
  let showLog = false, log = [];
  function drawModal() {
    const box = $('#roles-body'); if (!box || modal().classList.contains('hidden')) return;
    if (!st.matrix) { box.innerHTML = `<header class="rl-head"><div><span class="eyebrow">Roles &amp; privileges</span><h2>Who can do what</h2></div><button class="btn ghost" data-rl="close">Done</button></header><p class="rl-fine">Only the host and admins manage roles.</p>`; return; }
    const cols = ['host', 'admin', 'mod', 'builder'];
    const people = (st.members || []).slice().sort((a, b) => (RANK[b.role] || 0) - (RANK[a.role] || 0) || a.name.localeCompare(b.name));
    const ink = c => (['#FFB86B', '#38C6B1', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
    const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const rows = people.map(p => {
      const opts = [...new Set([p.role, ...(p.options || [])])];
      const picker = p.role === 'host' ? '<span class="rl-fixed">Owner</span>'
        : p.id === meId() ? '<span class="rl-fixed">You</span>'
        : (p.options || []).length ? `<select class="input rl-pick" data-role-for="${esc(p.id)}" aria-label="Role for ${esc(p.name)}">${opts.map(r => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${label(r)}</option>`).join('')}</select>`
        : `<span class="rl-fixed" title="Only the host can change this">${label(p.role)}</span>`;
      const muted = p.mutedUntil && Date.parse(p.mutedUntil) > Date.now();
      return `<li class="rl-person"><span class="avatar" style="background:${esc(p.color)};color:${ink(p.color)}">${esc(initials(p.name))}</span>
        <span class="rl-who"><b>${esc(p.name)}</b>${badge(p)}${p.projectRole ? `<small>${label(p.projectRole)} in this project</small>` : ''}${p.guest ? '<small>guest pass</small>' : ''}${muted ? `<small class="rl-muted">muted until ${esc(ago(p.mutedUntil))}</small>` : ''}</span>${picker}</li>`;
    }).join('');
    let group = '';
    const matrix = st.matrix.map(c => {
      const head = c.group !== group ? `<tr class="rl-group"><th colspan="5" scope="colgroup">${esc(group = c.group)}</th></tr>` : '';
      const cells = cols.map(r => {
        const cell = c.cells[r];
        if (c.locked && r !== 'host') return `<td><span class="rl-cell locked" title="Host only" aria-label="${esc(c.label)} for ${label(r)}: host only">${LOCK}</span></td>`;
        if (r === 'host') return `<td><span class="rl-cell on fixed" title="The host can always do this" aria-label="${esc(c.label)} for Host: always">${CHECK}</span></td>`;
        return `<td><button class="rl-cell ${cell.on ? 'on' : ''} ${cell.changed ? 'changed' : ''}" role="switch" aria-checked="${cell.on}" data-cap="${esc(c.id)}" data-col="${r}" ${cell.edit ? '' : 'disabled'} title="${cell.edit ? (cell.on ? 'On' : 'Off') + (cell.changed ? ' (changed from default)' : '') : 'You can only change rows you hold, for roles below yours'}" aria-label="${esc(c.label)} for ${label(r)}">${cell.on ? CHECK : ''}</button></td>`;
      }).join('');
      return `${head}<tr class="${c.locked ? 'is-locked' : ''}"><th scope="row">${esc(c.label)}${c.locked ? ` <span class="rl-ho" title="Host only">${LOCK}</span>` : ''}</th>${cells}</tr>`;
    }).join('');
    box.innerHTML = `<header class="rl-head"><div><span class="eyebrow">Roles &amp; privileges</span><h2>Who can do what</h2></div><button class="btn ghost" data-rl="close">Done</button></header>
      <section class="rl-sec"><div class="rl-sh"><span class="eyebrow">Members</span><small>Admins run the tribe with you. 🛡️ Mods keep the chat kind. Nobody can give more than they have.</small></div>
        <ul class="rl-people">${rows || '<li class="faint">Just you so far.</li>'}</ul></section>
      <section class="rl-sec"><div class="rl-sh"><span class="eyebrow">Privileges</span><small>Turn a privilege on or off for a role. Locked rows stay with the host.</small></div>
        <div class="rl-scroll"><table class="rl-matrix"><thead><tr><th scope="col"><span class="sr">Privilege</span></th>${cols.map(r => `<th scope="col">${label(r)}</th>`).join('')}</tr></thead><tbody>${matrix}</tbody></table></div>
        <div class="rl-foot">${st.canReset ? '<button class="btn soft" data-rl="reset">Reset to defaults</button>' : ''}<button class="linkish" data-rl="log" aria-expanded="${showLog}">${showLog ? 'Hide' : 'Show'} recent changes</button></div>
        ${showLog ? `<ol class="rl-log">${log.length ? log.slice(0, 30).map(e => `<li><time>${esc(new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</time><span>${esc(line(e))}</span></li>`).join('') : '<li class="faint">Nothing yet.</li>'}</ol>` : ''}</section>`;
  }
  function line(e) {
    const by = e.byName || 'someone', t = e.targetName || 'someone';
    if (e.action === 'role') return `${by} changed ${t}: ${label(e.from) || 'none'} → ${label(e.to)}${e.scope === 'project' ? ' (this project)' : ''}`;
    if (e.action === 'mute') return `${by} muted ${t} for ${e.minutes >= 60 ? Math.round(e.minutes / 60) + 'h' : e.minutes + 'm'}`;
    if (e.action === 'unmute') return `${by} unmuted ${t}`;
    if (e.action === 'remove') return `${by} removed ${t} from ${e.projectName || 'a project'}`;
    if (e.action === 'message-delete') return `${by} deleted a message from ${t}`;
    if (e.action === 'privilege') return `${by} turned ${e.on ? 'on' : 'off'} "${(st.matrix || []).find(c => c.id === e.cap)?.label || e.cap}" for ${label(e.role)}`;
    if (e.action === 'privileges-reset') return `${by} reset privileges to defaults`;
    if (e.action === 'invite-revoke') return `${by} revoked an invite`;
    return `${by}: ${e.action}`;
  }
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('#roles-body [data-rl], #roles-body .rl-cell[data-cap]'); if (!t) return;
    try {
      if (t.dataset.rl === 'close') return close();
      if (t.dataset.rl === 'log') { showLog = !showLog; if (showLog) log = (await C.api('/perms/audit?limit=60')).entries || []; return drawModal(); }
      if (t.dataset.rl === 'reset') { t.disabled = true; const r = await C.api('/perms/reset', { method: 'POST' }); st.matrix = r.matrix; drawModal(); toast('Privileges back to defaults'); return refresh(); }
      if (t.dataset.cap) {
        t.disabled = true;
        const r = await C.api('/perms/overrides', { method: 'PUT', body: { cap: t.dataset.cap, role: t.dataset.col, on: t.getAttribute('aria-checked') !== 'true' } });
        st.matrix = r.matrix; drawModal(); refresh();
      }
    } catch (err) { toast(err.message); drawModal(); }
  });
  document.addEventListener('change', async e => {
    const s = e.target.closest && e.target.closest('#roles-body [data-role-for]'); if (!s) return;
    try { await C.api('/perms/assign', { method: 'POST', body: { member: s.dataset.roleFor, role: s.value } }); toast(`${(member(s.dataset.roleFor) || {}).name || 'They'} is now ${/^[aeiou]/i.test(label(s.value)) ? 'an' : 'a'} ${label(s.value)}`); }
    catch (err) { toast(err.message); }
    refresh();
  });

  // ---------- wiring ----------
  C.on('hello', () => { lastSig = ''; refresh(); });
  C.on('presence', onPresence);
  C.on('project', () => refresh());
  C.on('ws', m => { if (m && m.type === 'perms') refresh(); });
  if (C.connected && C.connected()) refresh();
  setTimeout(repaint, 0);

  // Lists drawn before this file loaded (or before a role changed) get their badges.
  function repaint() { try { if (window.TribeApp && window.TribeApp.refreshRoom) window.TribeApp.refreshRoom(); } catch {} }
  window.TribeRoles = { badge, label, can, outranks, msgMenuItems, onMsgAct, memberActions, open, refresh, state: () => st, myRole };
})();
