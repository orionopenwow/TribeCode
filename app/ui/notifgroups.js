// Notification settings for each project, channel and DM, the way Discord does them (p14, docs/NOTIFICATIONS.md).
//   * Right-click a project circle (long-press on a phone): Mark as read, Notification settings ›, Mute project ›,
//     Invite people, Project settings. Desktop: a flyout with hover submenus. Phone: a bottom sheet you drill into.
//   * Right-click a channel or a DM in the conversation list, or the bell in the chat header: Mute ›, Notification settings ›.
//   * Settings › Notifications lists every project with its setting (settingsRows / wireSettings).
// The settings live on the tribe server per person (GET/PUT /api/notify/prefs, `groups`), so every device follows;
// a copy stays in localStorage for offline, and changes made offline are sent when the tribe is back.
// The server applies them to pushes, the inbox and in-app notifications (server/notify.js groupVerdict); this file
// mirrors the same rules for what only the app draws: unread dots, the circle's muted look, sounds, pop-ups, the title count.
// window.TribeNotifGroups = { verdict, allows, countsChat, isMuted, level, chanLevel, projectMenu, channelMenu, dmMenu,
//   chatBell, settingsRows, wireSettings, setApp, mentions, clearMentions, refOf, load, state }
(function () {
  'use strict';
  const C = window.TribeClient;
  if (!C) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const ico = (n, sz = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, sz) : '');
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const SMALL = 5;
  const PERSONAL = new Set(['mention', 'task-assigned', 'comment-reply', 'reminder', 'meeting', 'approval']);
  const DURS = [['15m', 'For 15 minutes'], ['1h', 'For 1 hour'], ['3h', 'For 3 hours'], ['8h', 'For 8 hours'], ['24h', 'For 24 hours'], ['forever', 'Until I turn it back on']];
  const LEVEL_LABEL = { all: 'All messages', mentions: 'Only @mentions', none: 'Nothing' };

  // ---------- state (server copy + local copy) ----------
  let groups = { projects: {}, channels: {} }, defaults = {}, skew = 0, app = null, pending = [];
  const mentionN = {};   // project -> mentions since you last looked
  const KEY = () => { try { return 'tribecode.notifgroups:' + C.base(); } catch { return 'tribecode.notifgroups'; } };
  function keep() { try { localStorage.setItem(KEY(), JSON.stringify({ groups, defaults, skew, app, pending })); } catch {} }
  function restore() {
    try { const v = JSON.parse(localStorage.getItem(KEY()) || 'null'); if (v && v.groups) { groups = v.groups; defaults = v.defaults || {}; skew = v.skew || 0; app = v.app || null; pending = Array.isArray(v.pending) ? v.pending : []; } } catch {}
  }
  restore();
  const now = () => Date.now() + skew;
  const changed = () => { keep(); document.dispatchEvent(new CustomEvent('tribe-notif-groups')); paintAll(); };
  function take(prefs, serverNow) {
    if (!prefs) return;
    if (prefs.groups) groups = { projects: prefs.groups.projects || {}, channels: prefs.groups.channels || {} };
    if (typeof serverNow === 'number') skew = serverNow - Date.now();
    if (prefs.app) {
      app = prefs.app; const P = window.TribePrefs;
      if (P && P.get) { const cur = P.get(), patch = {}; for (const k of ['sound', 'toasts']) if (k in app && cur[k] !== app[k]) patch[k] = app[k]; if (Object.keys(patch).length) P.set(patch); }
    }
    changed();
  }
  async function load() {
    if (!C.connected()) return;
    if (pending.length) await flush();
    try { const r = await C.api('/notify/prefs'); defaults = r.defaults || defaults; take(r.prefs, r.now); } catch {}
  }
  async function flush() {
    const q = pending; pending = []; keep();
    for (const body of q) { try { const r = await C.api('/notify/prefs', { method: 'PUT', body }); take(r.prefs, r.now); } catch { pending.push(body); } }
    keep();
  }
  // Apply locally at once (the same rules as the server's cleanPrefs), then send; offline it waits.
  function localApply(body) {
    for (const kind of ['projects', 'channels']) for (const [k, v] of Object.entries((body.groups || {})[kind] || {})) {
      const o = { ...(groups[kind][k] || {}) };
      if (v === null) { delete groups[kind][k]; continue; }
      if ('level' in v) { if (v.level === 'default' || v.level === null) delete o.level; else o.level = v.level; }
      if ('mute' in v) { if (!v.mute || v.mute === 'off') delete o.until; else o.until = v.mute === 'forever' ? -1 : now() + ({ '15m': 15, '1h': 60, '3h': 180, '8h': 480, '24h': 1440 }[v.mute] || 0) * 60000; }
      for (const f of ['noEveryone', 'noRoles', 'muteNew']) if (f in v) { if (v[f]) o[f] = true; else delete o[f]; }
      if ('push' in v) { if (v.push === false) o.push = false; else delete o.push; }
      if (Object.keys(o).length) groups[kind][k] = o; else delete groups[kind][k];
    }
    changed();
  }
  async function put(body) {
    localApply(body);
    if (!C.connected()) { pending.push(body); keep(); return; }
    try { const r = await C.api('/notify/prefs', { method: 'PUT', body }); take(r.prefs, r.now); }
    catch (e) { pending.push(body); keep(); }
  }
  const setApp = patch => put({ app: patch });
  C.on('hello', () => { load(); });
  C.on('ws', m => { if (m && m.type === 'notify-prefs') take(m.prefs, m.now); });   // your other devices changed something

  // ---------- the rules (mirror server/notify.js groupVerdict) ----------
  const mutedNow = u => u === -1 || (typeof u === 'number' && u > now());
  const projects = () => (window.TribeProjects && window.TribeProjects.list ? window.TribeProjects.list() : []) || [];
  const projectOfRef = ref => {
    if (!ref) return null;
    const p = projects().find(x => x.channel === ref); if (p) return p.id;
    const CH = window.TribeChannels; if (/^c-/.test(ref) && CH && CH.get && CH.get(ref)) return C.project();
    return null;
  };
  const sizeOf = pid => {
    const ms = (C.state().members || []).filter(m => m.role !== 'agent');
    return ms.filter(m => !Array.isArray(m.projects) || m.projects.includes(pid)).length;
  };
  const defaultOf = pid => defaults[pid] || (sizeOf(pid) > SMALL ? 'mentions' : 'all');
  const level = pid => ((groups.projects[pid] || {}).level) || defaultOf(pid);
  const chanLevel = ref => ((groups.channels[ref] || {}).level) || 'default';
  const isMuted = (kind, id) => mutedNow((groups[kind === 'project' ? 'projects' : kind === 'channel' ? 'channels' : kind][id] || {}).until);
  function verdict(item) {
    const ref = item.ref || '', pid = item.project || projectOfRef(ref);
    const pj = (pid && groups.projects[pid]) || {}, ch = (ref && groups.channels[ref]) || {};
    if (item.type === 'approval') return { notify: true, push: true, dot: true, badge: true };
    if (item.type === 'dm' || /^dm-/.test(ref)) { const m = mutedNow(ch.until); return { notify: !m, push: !m, dot: !m, badge: !m, muted: m }; }
    if (!pid && !ch.level && ch.until === undefined) return { notify: true, push: true, dot: true, badge: PERSONAL.has(item.type) };
    const muted = mutedNow(ch.until) || mutedNow(pj.until);
    const lv = ch.level && ch.level !== 'default' ? ch.level : pj.level || (pid ? defaultOf(pid) : 'all');
    let mention = PERSONAL.has(item.type);
    if (mention && item.everyone && pj.noEveryone) mention = false;
    if (mention && item.role && pj.noRoles) mention = false;
    if (lv === 'none') return { notify: false, push: false, dot: !muted, badge: false, level: lv, muted };
    const notify = mention || (lv === 'all' && !muted);
    return { notify, push: notify && pj.push !== false, dot: !muted, badge: mention, level: lv, muted };
  }
  const allows = item => !item || verdict(item).notify;
  const meId = () => (C.state().me || {}).id;
  const meName = () => String((C.state().me || {}).name || '');
  // The chat UI calls the current project's channel "general".
  const refOf = id => (!id || id === 'general' ? ((projects().find(p => p.id === C.project()) || {}).channel || 'general') : id);
  function mentionsMe(text) {
    const w = (String(text || '').match(/@[^\s@]+/g) || []).map(x => x.slice(1).replace(/[.,!?;:)]+$/, '').toLowerCase());
    const n = meName().toLowerCase();
    return w.some(x => x === String(meId()).toLowerCase() || x === n.replace(/\s+/g, '') || x === n.split(/\s+/)[0]) ? 'me' : w.some(x => ['everyone', 'here', 'tribe'].includes(x)) ? 'everyone' : '';
  }
  // Should a chat message add to the window title's count (and ding)?
  function countsChat(channel, message) {
    if (!message || message.by === meId() || message.by === 'tribecode') return false;
    const ref = refOf(channel), mm = mentionsMe(message.text);
    return verdict({ type: mm ? 'mention' : 'message', ref, everyone: mm === 'everyone' }).notify;
  }
  // Mentions per project (the red count on a circle)
  C.on('notification', m => {
    const it = m && m.item; if (!it || it.transient) return;
    const pid = it.project || projectOfRef(it.ref);
    if (pid && pid !== C.project() && PERSONAL.has(it.type) && it.type !== 'approval' && verdict(it).badge) { mentionN[pid] = (mentionN[pid] || 0) + 1; changed(); }
  });
  C.on('project', () => { const p = C.project(); if (mentionN[p]) { delete mentionN[p]; changed(); } });
  const mentions = pid => mentionN[pid] || 0;
  const clearMentions = pid => { delete mentionN[pid]; changed(); };

  // A mute that runs out repaints by itself.
  setInterval(() => {
    let any = false;
    for (const kind of ['projects', 'channels']) for (const [k, o] of Object.entries(groups[kind])) if (typeof o.until === 'number' && o.until > 0 && o.until <= now()) { delete o.until; if (!Object.keys(o).length) delete groups[kind][k]; any = true; }
    if (any) changed();
  }, 5000);

  // ---------- painting what the app draws ----------
  // The circles redraw themselves (projects.js asks circleState); the chat header's bell is repainted here.
  function circleState(pid) {
    const m = isMuted('project', pid);
    return { muted: m, dot: !m, mentions: mentions(pid), icon: m ? `<span class="ng-mute-ic" aria-hidden="true">${ico('bell-off', 11)}</span>` : '' };
  }
  function paintAll() {
    const bell = document.getElementById('ng-chat-bell');
    if (bell) {
      const ref = bell.dataset.ref, m = isMuted('channel', ref) || (!/^dm-/.test(ref) && isMuted('project', C.project()));
      if (bell.classList.contains('on') !== m || !bell.firstElementChild) { bell.innerHTML = ico(m ? 'bell-off' : 'bell', 16); bell.classList.toggle('on', m); }
    }
  }

  // ---------- the flyout (desktop) and the sheet (phone) ----------
  // A menu is { title, items } and an item one of:
  //   { label, icon, act }                         a plain row (closes the menu)
  //   { label, icon, hint, sub: () => menu }       a row that opens a submenu (hover / → on desktop, drill-in on phones)
  //   { label, radio: true, checked, act, note }   a choice (keeps the menu open)
  //   { label, check: true, checked, act }         a switch (keeps the menu open)
  //   { sep: true } · { head: 'text' }
  let root = null, opener = null, scrim = null;
  function close(refocus = true) {
    if (!root) return;
    root.remove(); root = null; document.querySelectorAll('.ng-menu.ng-sub').forEach(x => x.remove());
    if (scrim) { scrim.remove(); scrim = null; }
    document.removeEventListener('mousedown', outside, true);
    if (opener && !document.contains(opener) && opener.dataset && opener.dataset.pjOpen) opener = document.querySelector(`#pj-rail [data-pj-open="${CSS.escape(opener.dataset.pjOpen)}"], #pj-strip [data-pj-open="${CSS.escape(opener.dataset.pjOpen)}"]`) || opener;   // the rail redrew while the menu was open
    if (opener) { opener.setAttribute && opener.setAttribute('aria-expanded', 'false'); if (refocus && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true }); }
    opener = null;
  }
  function outside(e) { if (root && !e.target.closest('.ng-menu, .ng-sheet')) close(false); }
  const rowHtml = (it, i) => {
    if (it.sep) return '<hr class="ng-sep" role="separator">';
    if (it.head) return `<div class="ng-head">${esc(it.head)}</div>`;
    const role = it.radio ? 'menuitemradio' : it.check ? 'menuitemcheckbox' : 'menuitem';
    const state = it.radio || it.check ? ` aria-checked="${!!it.checked}"` : '';
    const lead = it.radio ? `<span class="ng-radio${it.checked ? ' on' : ''}" aria-hidden="true"></span>` : it.icon ? `<span class="ng-ic" aria-hidden="true">${ico(it.icon, 16)}</span>` : '';
    const tail = it.check ? `<span class="ng-switch${it.checked ? ' on' : ''}" aria-hidden="true"><i></i></span>` : it.sub ? `<span class="ng-chev" aria-hidden="true">${ico('chev', 14)}</span>` : '';
    return `<button type="button" class="ng-row${it.danger ? ' danger' : ''}" role="${role}" data-i="${i}"${state}${it.sub ? ' aria-haspopup="menu" aria-expanded="false"' : ''}${it.id ? ` id="${esc(it.id)}"` : ''}>${lead}<span class="ng-l"><span class="ng-t">${esc(T(it.label))}</span>${hintOf(it) ? `<span class="ng-hint">${esc(T(hintOf(it)))}${it.hintTime ? ' ' + esc(it.hintTime) : ''}</span>` : ''}${it.note ? `<span class="ng-note">${esc(T(it.note))}</span>` : ''}</span>${tail}</button>`;
  };
  const hintOf = it => (it.hintOf ? it.hintOf() : it.hint);
  // A choice in a submenu updates the hint on its parent row ("Notification settings · Only @mentions").
  function refreshHints() {
    if (!root || !root._menu) return;
    root.querySelectorAll('.ng-row').forEach(b => { const it = root._menu.items[+b.dataset.i], h = it && it.hintOf && b.querySelector('.ng-hint'); if (h) h.textContent = T(it.hintOf()); });
  }
  const keysIn = el => [...el.querySelectorAll(':scope > .ng-row:not([disabled]), :scope > .ng-body > .ng-row:not([disabled])')];
  function bindKeys(el, { onLeft } = {}) {
    el.addEventListener('keydown', e => {
      const all = keysIn(el), i = all.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]; if (n) n.focus(); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); (e.key === 'Home' ? all[0] : all[all.length - 1]).focus(); }
      else if (e.key === 'ArrowRight' && document.activeElement && document.activeElement.getAttribute('aria-haspopup')) { e.preventDefault(); e.stopPropagation(); document.activeElement.click(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'Escape') && onLeft) { e.preventDefault(); e.stopPropagation(); onLeft(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); }
    });
  }
  function place(el, x, y, w0) {
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = x, top = y;
    if (left + w > innerWidth - 8) left = w0 != null ? Math.max(8, w0 - w) : innerWidth - w - 8;
    left = Math.max(8, left); top = Math.min(Math.max(8, top), innerHeight - h - 8);
    el.style.left = left + 'px'; el.style.top = top + 'px';
  }
  // Desktop: one floating menu, submenus open beside their row.
  function flyout(menu, pt) {
    const el = document.createElement('div'); el.className = 'ng-menu'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', menu.title || '');
    el.innerHTML = menu.items.map(rowHtml).join('');
    document.body.appendChild(el); root = el; el._menu = menu;
    place(el, pt.x, pt.y);
    wireRows(el, menu, { depth: 0 });
    bindKeys(el);
    document.addEventListener('mousedown', outside, true);
    const f = keysIn(el)[0]; if (f) f.focus({ preventScroll: true });
    return el;
  }
  function openSub(row, it, depth) {
    document.querySelectorAll('.ng-menu.ng-sub').forEach(x => { if (+x.dataset.depth >= depth + 1) { const o = x._row; if (o) o.setAttribute('aria-expanded', 'false'); x.remove(); } });
    const menu = it.sub(); const el = document.createElement('div');
    el.className = 'ng-menu ng-sub'; el.dataset.depth = String(depth + 1); el.setAttribute('role', 'menu'); el.setAttribute('aria-label', T(it.label)); el._row = row;
    el.innerHTML = menu.items.map(rowHtml).join('');
    document.body.appendChild(el);
    const r = row.getBoundingClientRect(), pr = row.closest('.ng-menu').getBoundingClientRect();
    place(el, pr.right + 4, r.top - 5, pr.left - 4);
    row.setAttribute('aria-expanded', 'true');
    wireRows(el, menu, { depth: depth + 1, rerender: () => { const keepI = document.activeElement && document.activeElement.dataset.i; const m2 = it.sub(); el.innerHTML = m2.items.map(rowHtml).join(''); wireRows(el, m2, { depth: depth + 1 }); const back = keepI && el.querySelector(`[data-i="${keepI}"]`); if (back) back.focus({ preventScroll: true }); } });
    bindKeys(el, { onLeft: () => { el.remove(); row.setAttribute('aria-expanded', 'false'); row.focus(); } });
    return el;
  }
  function wireRows(el, menu, { depth, rerender }) {
    let hoverT = 0;
    el.querySelectorAll('.ng-row').forEach(b => {
      const it = menu.items[+b.dataset.i];
      b.addEventListener('mouseenter', () => {
        if (!isPhone()) b.focus({ preventScroll: true });
        clearTimeout(hoverT);
        hoverT = setTimeout(() => {
          if (it.sub) { if (b.getAttribute('aria-expanded') !== 'true') openSub(b, it, depth); }
          else document.querySelectorAll('.ng-menu.ng-sub').forEach(x => { if (+x.dataset.depth > depth) { if (x._row) x._row.setAttribute('aria-expanded', 'false'); x.remove(); } });
        }, it.sub ? 90 : 160);
      });
      b.addEventListener('click', async e => {
        e.stopPropagation();
        if (it.sub) { const s = openSub(b, it, depth); const f = keysIn(s)[0]; if (f) f.focus({ preventScroll: true }); return; }
        if (it.radio || it.check) { it.act(); if (rerender) rerender(); refreshHints(); return; }
        close(); if (it.act) it.act();
      });
    });
  }
  // Phone: a bottom sheet; a row with a submenu drills in, with a back button.
  function sheet(menu) {
    scrim = document.createElement('div'); scrim.className = 'ng-scrim'; scrim.onclick = () => close(false);
    const el = document.createElement('div'); el.className = 'ng-sheet ng-menu'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    document.body.append(scrim, el); root = el;
    const stack = [menu];
    const draw = () => {
      const m = stack[stack.length - 1], top = stack.length === 1;
      el.setAttribute('aria-label', m.title || '');
      el.innerHTML = `<div class="ng-grab" aria-hidden="true"></div><div class="ng-sheet-head">${top ? '' : `<button type="button" class="ng-back" aria-label="${esc(T('Back'))}">${ico('chev', 18)}</button>`}<b>${esc(T(m.title || ''))}</b></div><div class="ng-body" role="menu">${m.items.map(rowHtml).join('')}</div>`;
      const bk = el.querySelector('.ng-back'); if (bk) bk.onclick = () => { stack.pop(); draw(); };
      el.querySelectorAll('.ng-row').forEach(b => {
        const it = m.items[+b.dataset.i];
        b.onclick = async () => {
          if (it.sub) { stack.push(it.sub()); draw(); return; }
          if (it.radio || it.check) { it.act(); if (m.again) stack[stack.length - 1] = m.again(); draw(); return; }
          close(false); if (it.act) it.act();
        };
      });
      if (matchMedia('(hover: hover)').matches) { const f = el.querySelector('.ng-row'); if (f) f.focus({ preventScroll: true }); } else { el.tabIndex = -1; el.focus({ preventScroll: true }); }   // touch: focus the sheet, not its first row
    };
    draw();
    bindKeys(el, { onLeft: () => { if (stack.length > 1) { stack.pop(); draw(); } else close(); } });
    return el;
  }
  function show(anchor, menu, pt) {
    close(false);
    opener = anchor || null;
    if (anchor && anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
    if (isPhone()) return sheet(menu);
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { right: 40, top: 40, bottom: 40, left: 40 };
    return flyout(menu, pt && pt.x != null ? pt : { x: r.right + 8, y: r.top - 4 });
  }

  // ---------- the menus ----------
  const fmtUntil = u => {
    if (u === -1) return '';
    const d = new Date(u - skew), soon = u - now() < 20 * 3600e3;
    try { return d.toLocaleTimeString(window.TribeI18n && window.TribeI18n.lang ? window.TribeI18n.lang() : undefined, soon ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return d.toLocaleTimeString(); }
  };
  const muteHint = o => (o && o.until === -1 ? 'Until I turn it back on' : 'Muted until');
  const durMenu = (title, apply) => () => ({ title, items: DURS.map(([k, label]) => ({ label, act: () => apply(k), id: 'ng-dur-' + k })) });
  const hasRoles = () => (C.state().members || []).some(m => ['admin', 'mod'].includes(m.role));

  function notifMenu(pid) {
    const build = () => {
      const o = groups.projects[pid] || {}, cur = level(pid), def = defaultOf(pid);
      const lv = k => ({ label: LEVEL_LABEL[k], radio: true, checked: cur === k, note: k === def && !o.level ? 'Default' : '', id: 'ng-lv-' + k, act: () => put({ groups: { projects: { [pid]: { level: k } } } }) });
      return { title: 'Notification settings', again: build, items: [lv('all'), lv('mentions'), lv('none'), { sep: true },
        { label: 'Suppress @everyone and @here', check: true, checked: !!o.noEveryone, id: 'ng-noeveryone', act: () => put({ groups: { projects: { [pid]: { noEveryone: !o.noEveryone } } } }) },
        ...(hasRoles() ? [{ label: 'Suppress role mentions', check: true, checked: !!o.noRoles, id: 'ng-noroles', act: () => put({ groups: { projects: { [pid]: { noRoles: !o.noRoles } } } }) }] : []),
        { label: 'Mobile push notifications', check: true, checked: o.push !== false, id: 'ng-push', act: () => put({ groups: { projects: { [pid]: { push: o.push === false } } } }) },
        { label: 'Mute new channels', check: true, checked: !!o.muteNew, id: 'ng-mutenew', act: () => put({ groups: { projects: { [pid]: { muteNew: !o.muteNew } } } }) }] };
    };
    return build();
  }
  async function markProjectRead(pid) {
    const PJ = window.TribeProjects; if (PJ && PJ.pulses) { const p = PJ.pulses(); p[pid] = 0; }
    clearMentions(pid);
    try { await C.api('/notify/read', { method: 'POST', body: { project: pid } }); if (window.TribeNotify && window.TribeNotify.reload) window.TribeNotify.reload(); } catch {}
    document.dispatchEvent(new CustomEvent('tribe-notif-groups'));
    toast(T('Marked as read'));
  }
  // opts: { x, y, invite(), settings(), extras: [{ label, icon, act }] }
  function projectMenu(anchor, pid, opts = {}) {
    const p = projects().find(x => x.id === pid) || { id: pid, name: pid };
    const o = groups.projects[pid] || {}, muted = isMuted('project', pid);
    const items = [
      { label: 'Mark as read', icon: 'check', id: 'ng-read', act: () => markProjectRead(pid) },
      { sep: true },
      { label: 'Notification settings', icon: 'bell', hintOf: () => LEVEL_LABEL[level(pid)], id: 'ng-notif', sub: () => notifMenu(pid) },
      muted ? { label: 'Unmute project', icon: 'bell', hint: muteHint(o), hintTime: fmtUntil(o.until), id: 'ng-unmute', act: () => { put({ groups: { projects: { [pid]: { mute: null } } } }); toast(T('Unmuted')); } }
        : { label: 'Mute project', icon: 'bell-off', id: 'ng-mute', sub: durMenu('Mute project', k => { put({ groups: { projects: { [pid]: { mute: k } } } }); toast(T('Muted')); }) },
      { sep: true },
      ...(opts.invite ? [{ label: 'Invite people', icon: 'people', id: 'ng-invite', act: opts.invite }] : []),
      ...(opts.settings ? [{ label: 'Project settings', icon: 'gear', id: 'ng-settings', act: opts.settings }] : []),
      ...((opts.extras || []).length ? [{ sep: true }, ...opts.extras] : []),
    ];
    return show(anchor, { title: p.name, items }, opts);
  }
  function chanMenuModel(ref, name) {
    const isDm = /^dm-/.test(ref), o = groups.channels[ref] || {}, muted = isMuted('channel', ref);
    const muteRow = muted ? { label: isDm ? 'Unmute conversation' : 'Unmute channel', icon: 'bell', hint: muteHint(o), hintTime: fmtUntil(o.until), id: 'ng-unmute', act: () => { put({ groups: { channels: { [ref]: { mute: null } } } }); toast(T('Unmuted')); } }
      : { label: isDm ? 'Mute conversation' : 'Mute channel', icon: 'bell-off', id: 'ng-mute', sub: durMenu(isDm ? 'Mute conversation' : 'Mute channel', k => { put({ groups: { channels: { [ref]: { mute: k } } } }); toast(T('Muted')); }) };
    if (isDm) return { title: name, items: [muteRow] };
    const pid = projectOfRef(ref) || C.project();
    const build = () => {
      const cur = chanLevel(ref), def = level(pid);
      const lv = (k, label) => ({ label, radio: true, checked: cur === k, id: 'ng-clv-' + k, note: k === 'default' ? LEVEL_LABEL[def] : '', act: () => put({ groups: { channels: { [ref]: { level: k } } } }) });
      return { title: 'Notification settings', again: build, items: [lv('default', 'Use project default'), lv('all', 'All messages'), lv('mentions', 'Only @mentions'), lv('none', 'Nothing')] };
    };
    return { title: '#' + name, items: [muteRow, { label: 'Notification settings', icon: 'bell', hintOf: () => (chanLevel(ref) === 'default' ? 'Use project default' : LEVEL_LABEL[chanLevel(ref)]), id: 'ng-notif', sub: build }] };
  }
  const channelMenu = (anchor, id, opts = {}) => {
    const ref = refOf(id), CH = window.TribeChannels, c = CH && CH.get ? CH.get(id) : null;
    return show(anchor, chanMenuModel(ref, (c && c.name) || (id === 'general' ? 'general' : id)), opts);
  };
  const dmMenu = (anchor, memberId, opts = {}) => {
    const D = window.TribeDM; if (!D || !D.channelWith) return null;
    const m = (C.state().members || []).find(x => x.id === memberId);
    return show(anchor, chanMenuModel(D.channelWith(memberId), (m && m.name) || ''), opts);
  };

  // ---------- right-click and long-press on channels and DMs (the conversation list) ----------
  document.addEventListener('contextmenu', e => {
    const t = e.target.closest && e.target.closest('#dm-menu [data-ch], #dm-menu [data-dm]'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (t.dataset.ch) channelMenu(t, t.dataset.ch, { x: e.clientX, y: e.clientY }); else dmMenu(t, t.dataset.dm, { x: e.clientX, y: e.clientY });
  }, true);
  // Long-press (phones): circles, channels and DMs. The click that follows the press is swallowed.
  let lp = null, swallow = 0;
  const LP_SEL = '#pj-rail [data-pj-open], #pj-strip [data-pj-open], #dm-menu [data-ch], #dm-menu [data-dm]';
  document.addEventListener('touchstart', e => {
    const t = e.target.closest && e.target.closest(LP_SEL); if (!t) return;
    const pt = e.touches && e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: 0, y: 0 };
    clearTimeout(lp && lp.timer);
    lp = { t, pt, timer: setTimeout(() => { lp = null; swallow = Date.now(); longPress(t); }, 500) };
  }, { passive: true });
  const cancel = e => { if (!lp) return; if (e.type === 'touchmove' && e.touches && e.touches[0] && Math.hypot(e.touches[0].clientX - lp.pt.x, e.touches[0].clientY - lp.pt.y) < 10) return; clearTimeout(lp.timer); lp = null; };
  ['touchend', 'touchcancel', 'touchmove'].forEach(k => document.addEventListener(k, cancel, { passive: true }));
  document.addEventListener('click', e => { if (swallow && Date.now() - swallow < 800 && e.target.closest && e.target.closest(LP_SEL)) { e.preventDefault(); e.stopPropagation(); swallow = 0; } }, true);
  document.addEventListener('contextmenu', e => { if (swallow && Date.now() - swallow < 800 && e.target.closest && e.target.closest(LP_SEL)) e.preventDefault(); }, true);
  function longPress(t) {
    if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
    if (t.dataset.pjOpen) { const SH = window.TribeShell; if (SH && SH.railMenu) SH.railMenu(t, t.dataset.pjOpen); else projectMenu(t, t.dataset.pjOpen); }
    else if (t.dataset.ch) channelMenu(t, t.dataset.ch);
    else if (t.dataset.dm) dmMenu(t, t.dataset.dm);
  }

  // ---------- the bell in the chat header (Discord's bell) ----------
  function chatBell(view) {
    const ref = refOf(view), m = isMuted('channel', ref) || (!/^dm-/.test(ref) && isMuted('project', C.project()));
    return `<button type="button" class="cb-btn ng-chat-bell${m ? ' on' : ''}" id="ng-chat-bell" data-ref="${esc(ref)}" data-view="${esc(view || 'general')}" aria-haspopup="menu" aria-expanded="false" title="${esc(T('Notification settings'))}" aria-label="${esc(T('Notification settings'))}">${ico(m ? 'bell-off' : 'bell', 16)}</button>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#ng-chat-bell'); if (!b) return;
    e.stopPropagation();
    const v = b.dataset.view;
    if (/^dm-/.test(b.dataset.ref)) { const D = window.TribeDM, other = D && D.channelWith ? (C.state().members || []).find(x => x.id !== meId() && D.channelWith(x.id) === b.dataset.ref) : null; if (other) return dmMenu(b, other.id); return show(b, chanMenuModel(b.dataset.ref, ''), null); }
    const r = b.getBoundingClientRect();
    channelMenu(b, v, { x: r.left, y: r.bottom + 6 });
  });

  // ---------- Settings › Notifications: every project in one place ----------
  let setHelpers = null;
  function settingsRows(h) { setHelpers = h; const inner = settingsInner(h); return inner ? `<div class="ng-set-list" id="ng-set-list">${inner}</div>` : ''; }
  function settingsInner({ row, esc: e2 = esc }) {
    const list = projects();
    if (!list.length) return '';
    const PJ = window.TribeProjects;
    const opt = (v, label, sel) => `<option value="${v}" ${sel ? 'selected' : ''}>${esc(T(label))}</option>`;
    const rows = list.map(p => {
      const o = groups.projects[p.id] || {}, cur = o.level || '', def = defaultOf(p.id), muted = isMuted('project', p.id);
      const lvSel = `<select class="input set-select" data-ng-level="${e2(p.id)}" aria-label="${e2(T('Notification settings'))} · ${e2(p.name)}">${opt('default', T(LEVEL_LABEL[def]) + ' · ' + T('Default'), !cur)}${['all', 'mentions', 'none'].filter(k => true).map(k => opt(k, LEVEL_LABEL[k], cur === k)).join('')}</select>`;
      const muteSel = `<select class="input set-select" data-ng-mute="${e2(p.id)}" aria-label="${e2(T('Mute project'))} · ${e2(p.name)}">${muted ? `<option value="" selected>${esc(T(muteHint(o)))}${o.until !== -1 ? ' ' + esc(fmtUntil(o.until)) : ''}</option><option value="off">${esc(T('Unmute'))}</option>` : `<option value="" selected>${esc(T('Not muted'))}</option>${DURS.map(([k, l]) => opt(k, l, false)).join('')}`}</select>`;
      const face = PJ && PJ.face ? PJ.face(p, 'sm') : '';
      return row(`<span class="ng-set-pj${muted ? ' ng-muted' : ''}">${face}<span>${e2(p.name)}</span>${muted ? `<span class="ng-set-muted">${ico('bell-off', 13)}</span>` : ''}</span>`, `<span class="set-upd ng-set-ctl">${lvSel}${muteSel}</span>`, '', { id: 'set-ng-pj-' + String(p.id).replace(/[^\w-]/g, '_'), keys: 'mute project notifications discord' });
    }).join('');
    const own = Object.entries(groups.channels).filter(([, o]) => o.level || mutedNow(o.until));
    const chRows = own.map(([ref, o]) => {
      const name = /^dm-/.test(ref) ? T('Direct messages') : '#' + ((window.TribeChannels && window.TribeChannels.get && window.TribeChannels.get(ref) || {}).name || (projects().find(p => p.channel === ref) ? 'general' : ref));
      const bits = [o.level ? T(LEVEL_LABEL[o.level]) : '', mutedNow(o.until) ? T('Muted') : ''].filter(Boolean).join(' · ');
      return row(e2(name), `<button type="button" class="btn sm" data-ng-reset="${e2(ref)}">${esc(T('Use project default'))}</button>`, bits, { keys: 'channel mute' });
    }).join('');
    return rows + (chRows ? `<div class="ng-set-sub">${esc(T('Channels with their own setting'))}</div>` + chRows : '');
  }
  document.addEventListener('tribe-notif-groups', () => {   // the list follows changes from menus and your other devices
    const box = document.getElementById('ng-set-list'); if (!box || !setHelpers) return;
    const f = document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute('data-ng-level') ? '[data-ng-level="' + document.activeElement.getAttribute('data-ng-level') + '"]' : document.activeElement.getAttribute('data-ng-mute') ? '[data-ng-mute="' + document.activeElement.getAttribute('data-ng-mute') + '"]' : null : null;
    box.innerHTML = settingsInner(setHelpers); wireSettings(box);
    if (f) { const x = box.querySelector(f); if (x) x.focus({ preventScroll: true }); }
  });
  function wireSettings(el) {
    el.querySelectorAll('[data-ng-level]').forEach(s => s.onchange = () => put({ groups: { projects: { [s.dataset.ngLevel]: { level: s.value } } } }));
    el.querySelectorAll('[data-ng-mute]').forEach(s => s.onchange = () => { if (!s.value) return; put({ groups: { projects: { [s.dataset.ngMute]: { mute: s.value === 'off' ? null : s.value } } } }); });
    el.querySelectorAll('[data-ng-reset]').forEach(b => b.onclick = () => { put({ groups: { channels: { [b.dataset.ngReset]: null } } }); b.closest('.set-row') && b.closest('.set-row').remove(); });
  }

  window.TribeNotifGroups = { circleState, verdict, allows, countsChat, isMuted, level, chanLevel, defaultOf, projectMenu, channelMenu, dmMenu, chatBell, settingsRows, wireSettings, setApp, mentions, clearMentions, refOf, load, close, paint: paintAll,
    state: () => ({ groups: JSON.parse(JSON.stringify(groups)), defaults: { ...defaults }, skew, pending: pending.length, mentions: { ...mentionN } }) };
})();
