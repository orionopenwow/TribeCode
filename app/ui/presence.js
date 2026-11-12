// Where everyone is (feat/presence). This tab reports the place it is in (a doc, the website designer, a chat channel,
// a task, the preview, a design canvas…) as one small websocket frame when the place changes, never per keystroke.
// Others' places come back as small frames too (server/places.js), and show as stacked avatars on the place itself
// (doc header, designer toolbar, chat header, task sheet, canvas, preview) and on the matching list rows (doc list,
// Files cards, task cards), with a quiet "Maya is here" when someone joins the place you are in.
// Privacy: Settings › "Show where I am" (on by default) and "Appear away"; a DM is only ever "in messages".
//   window.TribePresence = { here(), of(mid), all(), seen(mid), away(mid), label(p, short), canOpen(p), jump(mid|p),
//                            stack(list, opts), prefs(), setPrefs({ show, away }), frames() }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (String(n || '?').trim().split(/\s+/).map(w => [...w][0]).slice(0, 2).join('') || '?').toUpperCase();
  const LS = 'tribecode.presence.v1';
  let places = {}, seen = {}, away = new Set(), myPrefs = { show: true, away: false };
  try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); if (v) myPrefs = { show: v.show !== false, away: !!v.away }; } catch {}
  let mine = null, sentSig = null, sendT = null, sent = 0;
  const meId = () => (C.state().me || {}).id;
  const members = () => C.state().members || [];
  const memberOf = id => members().find(m => m.id === id);
  const sig = p => (p ? [p.k, p.id || '', p.l || '', p.pr || ''].join('|') : '');
  const same = (a, b) => !!a && !!b && a.k === b.k && (a.id || '') === (b.id || '') && (a.pr || '') === (b.pr || '');

  // ---------- where am I ----------
  const proj = () => (C.project && C.project()) || '';
  const vis = el => !!el && !el.hidden && !el.classList.contains('hidden') && el.getClientRects().length > 0;
  function here() {
    const pr = proj(), W = window, v = document.body.dataset.view || '';
    try { const sd = W.TribeSiteDesigner && W.TribeSiteDesigner.state(); if (sd && sd.open) return { k: 'site', id: sd.pid || pr, l: 'Website designer', pr: sd.pid || pr }; } catch {}
    if (document.body.classList.contains('pvw-focus')) return { k: 'preview', id: pr, l: 'Preview', pr };
    try { const cv = W.TribeCanvas && W.TribeCanvas.state(); if (cv && cv.open) return { k: 'canvas', id: cv.file || 'main', l: cv.name || 'Design canvas', pr }; } catch {}
    if (v === 'tasks' && W.TribeTasks && W.TribeTasks.current) {
      const id = W.TribeTasks.current(), t = id && (W.TribeTasks.all() || []).find(x => x.id === id);
      if (t) return { k: 'task', id: t.id, l: t.title, pr };
      return { k: 'board', id: '', l: 'Task board', pr };
    }
    if (v === 'docs' && W.TribeDocs && W.TribeDocs.current) { const d = W.TribeDocs.current(); if (d && d.slug) return { k: 'doc', id: d.slug, l: d.title || 'Untitled', pr }; return { k: 'files', id: '', l: 'Files', pr }; }
    if (v === 'chat') {
      if (document.body.classList.contains('dm-open')) return { k: 'dm', id: '', l: 'messages', pr: '' };
      const ch = (W.TribeDM && W.TribeDM.current && W.TribeDM.current()) || 'general';
      const l = ch === 'general' ? '#general' : (W.TribeChannels && W.TribeChannels.label ? W.TribeChannels.label(ch) : '#' + ch);
      return { k: 'chat', id: ch, l, pr };
    }
    if (!v || v === 'hub' || (W.TribeRouter && W.TribeRouter.isGlobal && W.TribeRouter.isGlobal())) return { k: 'home', id: '', l: 'Home', pr: '' };
    const lab = (($('#crumb-label') || {}).textContent || v).trim().slice(0, 40);
    return { k: 'view', id: v, l: lab, pr };
  }
  // ---------- reporting: on change only, debounced ----------
  function report(force) {
    const p = myPrefs.show && !myPrefs.away ? here() : null;
    mine = here();
    const s = sig(p);
    if (!force && s === sentSig) return;
    clearTimeout(sendT);
    sendT = setTimeout(() => {
      if (!C.connected || !C.connected()) return;
      if (C.send({ type: 'place', p })) { sentSig = s; sent++; }
      paint();
    }, force ? 0 : 350);
  }
  let tickT = null;
  const soon = () => { clearTimeout(tickT); tickT = setTimeout(() => report(false), 120); };
  new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'class'] });
  addEventListener('hashchange', soon);
  document.addEventListener('click', () => setTimeout(soon, 250), true);
  setInterval(() => report(false), 2000);   // anything the hooks missed (cheap: no frame unless the place changed)

  // ---------- incoming ----------
  const listeners = [];
  const changed = (why) => { paint(); listeners.forEach(f => { try { f(why); } catch {} }); };
  C.on('hello', m => {
    const s = m.places || {}; places = s.places || {}; seen = s.seen || {}; away = new Set(s.away || []);
    if (s.prefs) { myPrefs = { show: s.prefs.show !== false, away: !!s.prefs.away }; try { localStorage.setItem(LS, JSON.stringify(myPrefs)); } catch {} }
    sentSig = null; report(true); changed('hello');
  });
  C.on('ws', m => {
    if (!m || m.type !== 'place' || !m.by) return;
    const was = places[m.by];
    if (m.p) places[m.by] = m.p; else delete places[m.by];
    if (m.st === 'away') away.add(m.by); else away.delete(m.by);
    if (m.seen) seen[m.by] = m.seen;
    if (m.by !== meId() && m.p && mine && same(m.p, mine) && !(was && same(was, mine))) hello(m.by);
    changed('place');
  });
  C.on('presence', () => paint());
  async function snap() {   // in case hello came before this script
    try { const s = await C.api('/places'); places = s.places || {}; seen = s.seen || {}; away = new Set(s.away || []); if (s.prefs) myPrefs = { show: s.prefs.show !== false, away: !!s.prefs.away }; changed('snap'); } catch {}
  }
  if (C.connected && C.connected()) { snap(); report(true); }

  // ---------- reading ----------
  const of = mid => places[mid] || null;
  function label(p, short) {
    if (!p) return '';
    const l = p.l || '';
    switch (p.k) {
      case 'doc': return short ? l : `in ${l} doc`;
      case 'site': return 'in the website designer';
      case 'chat': return `in ${l || 'chat'}`;
      case 'dm': return 'in messages';
      case 'task': return `on task “${l}”`;
      case 'preview': return 'in the preview';
      case 'canvas': return `in design canvas “${l}”`;
      case 'files': return 'in Files';
      case 'board': return 'on the task board';
      case 'home': return 'on Home';
      case 'agent': return l;
      default: return `in ${l}`;
    }
  }
  const canOpen = p => !!p && p.k !== 'dm' && p.k !== 'agent' && (!p.pr || (window.TribeProjects && (window.TribeProjects.list() || []).some(x => x.id === p.pr)) || p.pr === proj());
  async function jump(x) {
    const p = typeof x === 'string' ? of(x) : x; if (!canOpen(p)) return false;
    const W = window, A = W.TribeApp;
    if (p.pr && p.pr !== proj() && W.TribeProjects && W.TribeProjects.switchTo) { try { await W.TribeProjects.switchTo(p.pr); } catch {} }
    const wait = ms => new Promise(r => setTimeout(r, ms));
    switch (p.k) {
      case 'doc': A.show('docs'); await wait(60); if (W.TribeDocs) await W.TribeDocs.open(p.id); break;
      case 'site': if (W.TribeSiteDesigner) await W.TribeSiteDesigner.open({ pid: p.pr || proj() }); break;
      case 'chat': A.show('chat'); await wait(40); if (p.id && p.id !== 'general' && W.TribeDM && W.TribeDM.openChannel) W.TribeDM.openChannel(p.id); else if (W.TribeDM && W.TribeDM.back) W.TribeDM.back(); break;
      case 'task': A.show('tasks'); await wait(60); if (W.TribeTasks) { if (!(W.TribeTasks.all() || []).some(t => t.id === p.id)) await W.TribeTasks.load(); W.TribeTasks.open(p.id); } break;
      case 'preview': if (W.TribePreview) W.TribePreview.open(); break;
      case 'canvas': if (W.TribeCanvas) W.TribeCanvas.open(p.id); break;
      case 'files': A.show('docs'); break;
      case 'board': A.show('tasks'); break;
      case 'home': if (W.TribeHub) W.TribeHub.open('home'); else A.show('hub'); break;
      default: if (W.TribeShell && W.TribeShell.go) W.TribeShell.go(p.id); else A.show(p.id);
    }
    setTimeout(soon, 200);
    return true;
  }
  // who (other than me) is at a place matching fn
  function at(fn) { const me = meId(); return members().filter(m => m.id !== me && m.online !== false && places[m.id] && fn(places[m.id], m)); }

  // ---------- drawing: stacked avatars ----------
  function face(m, cls) {
    if (window.TribeProfiles && window.TribeProfiles.avatar) return window.TribeProfiles.avatar(m, 'pz-av ' + (cls || ''));
    const c = m.color || 'var(--peer)';
    return `<span class="pz-av pf-av ${cls || ''}" style="background:${esc(c)}">${esc(initials(m.name))}</span>`;
  }
  function names(list) { const n = list.map(m => m.name); return n.length <= 1 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; }
  function stack(list, o = {}) {
    if (!list.length) return '';
    const max = o.max || 3, shown = list.slice(0, max), more = list.length - shown.length;
    const t = `${names(list)} ${list.length === 1 ? 'is' : 'are'} here now`;
    return `<span class="pz-stack ${o.cls || ''}" role="img" aria-label="${esc(t)}" title="${esc(t)}" data-pz-ids="${esc(list.map(m => m.id).join(','))}">${shown.map(m => face(m)).join('')}${more > 0 ? `<span class="pz-more">+${more}</span>` : ''}</span>`;
  }
  // put (or refresh) a stack into a host element without churn
  function put(host, list, o = {}) {
    if (!host) return;
    let el = host.querySelector(':scope > .pz-slot');
    const key = list.map(m => m.id + (m.color || '')).join(',');
    if (!list.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('span'); el.className = 'pz-slot ' + (o.slot || ''); if (o.before && host.contains(o.before)) host.insertBefore(el, o.before); else if (o.first) host.prepend(el); else host.appendChild(el); }
    if (o.before && host.contains(o.before) && el.nextSibling !== o.before && o.before.parentNode === host) host.insertBefore(el, o.before);   // keep it next to its anchor
    if (el.dataset.k === key) return;
    el.dataset.k = key; el.innerHTML = stack(list, o);
  }
  let painting = false;
  function paint() {
    if (painting) return; painting = true;
    try {
      const pr = proj(), W = window;
      // on the place itself
      const doc = W.TribeDocs && W.TribeDocs.current && W.TribeDocs.current();
      const ds = $('#dl-save') || $('#doc-status'), dh = ds ? ds.parentNode : $('.dl-head');   // beside "Saved" in the doc's top bar
      put(dh, doc ? at(p => p.k === 'doc' && p.id === doc.slug && (p.pr || pr) === pr) : [], { cls: 'pz-head', before: ds });
      const wdz = $('#wdz .wdz-top'); if (wdz) { const sd = W.TribeSiteDesigner && W.TribeSiteDesigner.state(); put(wdz, sd && sd.open ? at(p => p.k === 'site' && (p.pr || p.id) === (sd.pid || pr)) : [], { cls: 'pz-head', before: wdz.querySelector('.wdz-sp') }); }
      const ch = $('#chat-head'); if (ch && ch.parentNode) { const cur = (W.TribeDM && W.TribeDM.current && W.TribeDM.current()) || 'general'; put(ch.parentNode, !document.body.classList.contains('dm-open') ? at(p => p.k === 'chat' && p.id === cur && (p.pr || pr) === pr) : [], { cls: 'pz-head', before: ch.nextSibling }); }
      const td = $('#tk-drawer'); if (td) { const id = W.TribeTasks && W.TribeTasks.current && W.TribeTasks.current(); put(td, id && !td.hidden ? at(p => p.k === 'task' && p.id === id) : [], { cls: 'pz-head', slot: 'pz-drawer', first: true }); }
      const cvh = $('.cv-head-acts'); if (cvh) { const cv = W.TribeCanvas && W.TribeCanvas.state(); put(cvh, cv && cv.open ? at(p => p.k === 'canvas' && p.id === (cv.file || 'main') && (p.pr || pr) === pr) : [], { cls: 'pz-head', first: true }); }
      const pv = $('.pvw-bar'); if (pv) put(pv, document.body.classList.contains('pvw-focus') ? at(p => p.k === 'preview' && (p.pr || pr) === pr) : [], { cls: 'pz-head', before: pv.querySelector('.pvw-edit') });
      // on list rows
      const rows = (sel, fn) => document.querySelectorAll(sel).forEach(el => put(el.matches('.fx-card') ? (el.querySelector('.fx-r2') || el) : el, at(p => fn(p, el)), { cls: 'pz-row' }));
      rows('.doc-item[data-slug]', (p, el) => p.k === 'doc' && p.id === el.dataset.slug && (p.pr || pr) === pr);
      rows('.fx-card[data-slug]', (p, el) => p.k === 'doc' && p.id === el.dataset.slug && (p.pr || pr) === pr);
      rows('.fx-card[data-gdoc]', (p, el) => { const [a, b] = el.dataset.gdoc.split('|'); return p.k === 'doc' && p.id === b && p.pr === a; });
      rows('.fx-card[data-gsite]', (p, el) => p.k === 'site' && (p.pr || p.id) === el.dataset.gsite);
      rows('.fx-card[data-gdesign]', (p, el) => { const [a, b] = el.dataset.gdesign.split('|'); return p.k === 'canvas' && p.id === b && p.pr === a; });
      rows('#board .task[data-id]', (p, el) => p.k === 'task' && p.id === el.dataset.id);
    } finally { painting = false; }
  }
  // repaint when lists redraw (throttled; the work is a few selector queries)
  let pT = null;
  new MutationObserver(muts => {
    if (painting) return;
    if (muts.every(m => m.target.closest && m.target.closest('.pz-slot'))) return;
    if (!Object.keys(places).length) return;
    clearTimeout(pT); pT = setTimeout(paint, 200);
  }).observe(document.body, { childList: true, subtree: true });

  // ---------- "Maya is here" ----------
  function hello(mid) {
    const m = memberOf(mid); if (!m) return;
    setTimeout(() => {
      const slot = [...document.querySelectorAll('.pz-slot')].find(s => vis(s) && s.closest('.dl-head, .dl-top, .wdz-top, #tk-drawer, .cv-head-acts, .pvw-bar, .chat-col, #view-chat'));
      const chip = document.createElement('span'); chip.className = 'pz-hello'; chip.setAttribute('role', 'status');
      chip.innerHTML = `<i aria-hidden="true"></i>${esc(m.name.split(/\s+/)[0])} is here`;
      if (slot) slot.after(chip); else { chip.classList.add('pz-hello-float'); document.body.appendChild(chip); }
      setTimeout(() => { chip.classList.add('out'); setTimeout(() => chip.remove(), 400); }, 3200);
    }, 60);
  }

  // ---------- privacy ----------
  async function setPrefs(p) {
    myPrefs = { ...myPrefs, ...p }; try { localStorage.setItem(LS, JSON.stringify(myPrefs)); } catch {}
    try { const r = await C.api('/places/prefs', { method: 'PUT', body: p }); if (r && r.prefs) myPrefs = r.prefs; } catch {}
    sentSig = '\u0000'; report(true); changed('prefs');
    return myPrefs;
  }
  // Settings: two rows right under Profile (settings.js redraws its modal; these are added back each time)
  function settingsRows() {
    const box = $('#settings-body'); if (!box || box.querySelector('#pz-set') || !C.connected()) return;
    const sp = $('#set-profile'), prof = sp ? sp.closest('.set-row') : null;
    const sw = (id, on, l, hint) => `<div class="set-row"><div class="set-l"><b>${l}</b><small>${hint}</small></div><div class="set-c"><label class="pz-sw"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="sr">${l}</span></label></div></div>`;
    const el = document.createElement('div'); el.id = 'pz-set';
    el.innerHTML = sw('pz-show', myPrefs.show, 'Show where I am', 'Your tribe sees the doc, chat or task you have open. DMs only show as “in messages”.')
      + sw('pz-away', myPrefs.away, 'Appear away', 'You look away and your place is hidden. You still get everything.');
    if (prof) prof.after(el); else { const h = box.querySelector('.set-head'); if (h) h.after(el); else box.prepend(el); }
    el.querySelector('#pz-show').onchange = e => setPrefs({ show: e.target.checked });
    el.querySelector('#pz-away').onchange = e => setPrefs({ away: e.target.checked });
  }
  new MutationObserver(() => { const b = $('#settings-body'); if (b && !b.querySelector('#pz-set') && b.querySelector('.set-head')) settingsRows(); }).observe(document.body, { childList: true, subtree: true });

  window.TribePresence = {
    here, of, all: () => ({ ...places }), seen: mid => seen[mid] || null, away: mid => away.has(mid), label, canOpen, jump, stack, at, paint,
    prefs: () => ({ ...myPrefs }), setPrefs, frames: () => sent, on: fn => listeners.push(fn), settingsRows,
  };
})();
