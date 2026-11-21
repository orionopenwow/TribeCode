// The office (feat/p10-office): a calm floor where every person and every AI helper in the tribe has a desk, and the
// screen at each desk says what they are doing right now, in short lines with a blinking cursor (a dim screensaver
// when nobody is there). People walk to the thinking spot, the task board or the lounge and back. Idea from the
// owner's own MIT project Vanilla Agents; drawn fresh in TribeCode's flat style.
// Server: server/office.js (GET/PUT /api/office). Off by default: the host or an admin turns it on per tribe, and
// each person can hide it for themselves on this device.
//   window.TribeOffice = { mount(el, { compact }), refresh(), hidden(), setHidden(bool), state(), settingsHtml }
//   mount() returns { destroy() }. compact: a one-line strip of who is at their desk (for the project dashboard).
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const initials = n => (String(n || '?').trim().split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).map(w => [...w][0]).slice(0, 2).join('') || '?').toUpperCase();   // "Claude · Maya" -> CM
  const LS_HIDE = 'tribecode.office.hide', LS_VIEW = 'tribecode.office.view';
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  // Office Space (pass 11): on a computer the office opens as the pixel floor; "Desks" keeps the calm list. Phones get the list.
  const viewOf = () => { try { return localStorage.getItem(LS_VIEW) === 'desks' ? 'desks' : 'floor'; } catch { return 'floor'; } };
  const canFloor = () => !isPhone() && !!window.TribeOfficeSpace;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let data = null, loading = null, last = 0;
  const mounts = new Set();

  const hidden = () => { try { return localStorage.getItem(LS_HIDE) === '1'; } catch { return false; } };
  function setHidden(v) { try { localStorage.setItem(LS_HIDE, v ? '1' : '0'); } catch {} paintAll(); }

  // ---------- data ----------
  async function load(force) {
    if (!C.hasToken || !C.hasToken()) return null;
    if (loading) return loading;
    if (!force && data && Date.now() - last < 1500) return data;
    loading = C.api('/office').then(d => { data = d; last = Date.now(); return d; }).catch(() => data).finally(() => { loading = null; });
    return loading;
  }
  const refresh = () => load(true).then(paintAll);
  const api = { refresh: () => refresh() };

  // Where a person is, in plain words (the same places presence.js shows on avatars).
  function placeText(d) {
    const P = window.TribePresence, w = d.where;
    if (!w) return '';
    if (typeof w === 'string') return w;
    try { if (P && P.label) { const l = P.label(w); if (l) return l; } } catch {}
    return w.l ? String(w.l) : '';
  }
  // The lines on a desk's screen.
  function screenLines(d) {
    if (d.kind === 'flint') return [tr('Ready when you are'), tr('Ask me what to do next')];
    const lines = [];
    if (d.kind === 'person' && d.state === 'active') { const p = placeText(d); if (p) lines.push(p); }
    lines.push(...(d.lines || []).map(tr));
    if (!lines.length && d.state === 'active') lines.push(d.kind === 'agent' ? tr('Connected') : tr('Around'));
    return lines.slice(0, 4);
  }
  const roleOf = d => (d.kind === 'flint' ? 'flint' : d.kind === 'agent' ? 'agent' : 'person');
  function withFlint(list) {
    const out = (list || []).slice();
    out.push({ id: 'flint', name: 'Flint', kind: 'flint', state: 'active', spot: 'desk', lines: [] });   // TribeCode's own helper always has a desk
    return out;
  }
  const status = d => (d.state === 'off' ? tr('Away from desk') : d.state === 'away' ? tr('Away') : d.spot === 'think' ? tr('Thinking') : d.spot === 'board' ? tr('At the task board') : d.spot === 'lounge' ? tr('In the lounge') : tr('At their desk'));

  // ---------- drawing ----------
  const avatar = (d, cls = '') => `<span class="of-av ${cls}" data-who="${esc(d.id)}" data-role="${roleOf(d)}" title="${esc(d.name)} · ${esc(status(d))}" aria-hidden="true">${d.kind === 'flint' ? '<svg viewBox="0 0 24 24" class="of-flame"><path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/></svg>' : esc(initials(d.name))}</span>`;
  function desk(d) {
    const here = d.state === 'active' && d.spot === 'desk';
    const lines = screenLines(d);
    const live = d.state === 'active' && lines.length;
    return `<article class="of-desk" data-desk="${esc(d.id)}" data-role="${roleOf(d)}" data-state="${esc(d.state)}" tabindex="0" role="button" aria-label="${esc(d.name)}: ${esc(status(d))}${lines.length ? '. ' + esc(lines.join('. ')) : ''}">
      <div class="of-screen${live ? ' on' : ' saver'}">${live ? `<ul>${lines.map((l, i) => `<li>${esc(l)}${i === lines.length - 1 ? '<i class="of-caret"></i>' : ''}</li>`).join('')}</ul>` : `<span class="of-saver">${esc(d.state === 'off' ? tr('Away from desk') : status(d))}</span>`}</div>
      <footer class="of-who"><span class="of-chair">${here ? avatar(d) : '<span class="of-av of-empty" aria-hidden="true"></span>'}</span>
        <span class="of-name"><b>${esc(d.name)}</b><span>${esc(d.kind === 'flint' ? tr('Built-in helper') : d.kind === 'agent' ? tr('AI helper') : tr('Person'))}${!here && d.state !== 'off' ? ' · ' + esc(status(d)) : ''}</span></span></footer>
    </article>`;
  }
  function zone(id, title, list, extra = '') {
    return `<section class="of-zone of-${id}" data-zone="${id}"><span class="eyebrow">${esc(title)}</span><div class="of-crowd">${list.map(d => avatar(d)).join('') || `<span class="faint of-none">${esc(tr('Nobody'))}</span>`}</div>${extra}</section>`;
  }
  function boardHtml(b) {
    if (!b) return '';
    const sum = [b.todo ? `${b.todo} ${tr('to do')}` : '', b.doing ? `${b.doing} ${tr('in progress')}` : '', b.requests ? `${b.requests} ${tr('waiting for an OK')}` : ''].filter(Boolean).join(' · ') || tr('Nothing waiting');
    return `<p class="of-sum">${esc(sum)}</p>${(b.top || []).length ? `<ul class="of-cards">${b.top.map(t => `<li data-task="${esc(t.id)}"><span>${esc(t.title)}</span>${t.who ? `<em>${esc(t.who)}</em>` : ''}</li>`).join('')}</ul>` : ''}`;
  }
  function floor(d) {
    const list = withFlint(d.desks);
    const at = s => list.filter(x => x.state !== 'off' && x.spot === s);
    const people = list.filter(x => x.kind === 'person').length, agents = list.filter(x => x.kind !== 'person').length;
    return `<div class="of-floor">
      <div class="of-desks">${list.map(desk).join('')}</div>
      <div class="of-zones">${zone('think', tr('Thinking spot'), at('think'))}${zone('board', tr('Task board'), at('board'), boardHtml(d.board))}${zone('lounge', tr('Lounge'), list.filter(x => x.state === 'away' || (x.state === 'active' && x.spot === 'lounge')))}</div>
      <p class="of-foot faint">${esc(`${people} ${people === 1 ? tr('person') : tr('people')} · ${agents} ${agents === 1 ? tr('helper') : tr('helpers')}`)} · <button class="linkish" data-of-hide>${esc(tr('Hide the office for me'))}</button></p>
    </div>`;
  }
  function strip(d) {
    const list = withFlint(d.desks).filter(x => x.state === 'active');
    if (!list.length) return '';
    return `<div class="of-strip" role="group" aria-label="${esc(tr('The office'))}"><span class="eyebrow">${esc(tr('The office'))}</span>
      <div class="of-strip-row">${list.slice(0, 8).map(x => `<button class="of-strip-who" data-desk="${esc(x.id)}" data-role="${roleOf(x)}" title="${esc(x.name)} · ${esc(screenLines(x)[0] || status(x))}">${avatar(x)}<span>${esc(screenLines(x)[0] || status(x))}</span></button>`).join('')}</div>
      <button class="linkish of-strip-open" data-of-open>${esc(tr('Open the office'))} →</button></div>`;
  }
  function offHtml(d) {
    if (!d) return '';
    if (!d.canSet) return `<div class="of-off"><p class="faint">${esc(tr('The office is off in this tribe. The host or an admin can turn it on.'))}</p></div>`;
    return `<div class="of-off"><p>${esc(tr('A floor where everyone, people and AI helpers, has a desk whose screen shows what they are doing right now.'))}</p>
      <button class="btn" data-of-on>${esc(tr('Turn on the office'))}</button></div>`;
  }

  // ---------- FLIP: avatars glide from their old place to the new one ----------
  function glide(el, paint) {
    const before = new Map(); if (!reduce()) el.querySelectorAll('[data-who]').forEach(a => before.set(a.dataset.who, a.getBoundingClientRect()));
    paint();
    if (reduce() || !before.size) return;
    el.querySelectorAll('[data-who]').forEach(a => {
      const b = before.get(a.dataset.who); if (!b) return;
      const n = a.getBoundingClientRect(), dx = b.left - n.left, dy = b.top - n.top; if (!dx && !dy) return;
      a.style.transition = 'none'; a.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => { a.style.transition = ''; a.style.transform = ''; });
    });
  }

  function paint(m) {
    const { el, opts } = m; if (!el.isConnected) { mounts.delete(m); return; }
    const d = data;
    if (opts.compact) { el.innerHTML = d && d.on && !hidden() ? strip(d) : ''; el.hidden = !el.innerHTML; return; }
    glide(el, () => {
      if (!d) { el.innerHTML = `<p class="faint of-wait">${esc(tr('Opening the office…'))}</p>`; return; }
      if (!d.on) { el.innerHTML = offHtml(d); return; }
      if (hidden()) { el.innerHTML = `<div class="of-off"><p class="faint">${esc(tr('You hid the office on this device.'))}</p><button class="btn" data-of-show>${esc(tr('Show the office'))}</button></div>`; return; }
      const toggle = canFloor() ? `<div class="of-view" role="group" aria-label="${esc(tr('How to show the office'))}"><button class="btn sm${viewOf() === 'floor' ? ' on' : ''}" data-of-view="floor" aria-pressed="${viewOf() === 'floor'}">${esc(tr('Floor'))}</button><button class="btn sm${viewOf() === 'desks' ? ' on' : ''}" data-of-view="desks" aria-pressed="${viewOf() === 'desks'}">${esc(tr('Desks'))}</button></div>` : '';
      if (canFloor() && viewOf() === 'floor') {
        // keep the canvas alive between refreshes: only feed it new data
        if (!m.space || !el.querySelector('.of-space')) {
          if (m.space) m.space.destroy();
          el.innerHTML = `${toggle}<div class="of-space"></div><p class="of-foot faint"><button class="linkish" data-of-hide>${esc(tr('Hide the office for me'))}</button></p>`;
          m.space = window.TribeOfficeSpace.mount(el.querySelector('.of-space'), api);
          const v = el.querySelector(':scope > .of-view'), bar = el.querySelector('.os-bar'); if (v && bar) bar.prepend(v);
        }
        m.space.update(d);
        return;
      }
      if (m.space) { m.space.destroy(); m.space = null; }
      el.innerHTML = toggle + floor(d);
    });
  }
  function paintAll() { mounts.forEach(paint); }

  async function setOn(on) {
    try { data = { ...(data || {}), ...(await C.api('/office', { method: 'PUT', body: { on } })) }; } catch (e) { if (window.TribeApp) window.TribeApp.toast(e.message); }
    refresh();
  }
  function openCard(id) {
    if (id === 'flint') { if (window.TribeFlint && window.TribeFlint.open) window.TribeFlint.open(); return; }
    const S = window.TribeShell;
    const d = data && (data.desks || []).find(x => x.id === id);
    if (d && d.kind === 'agent' && S && S.previewAgent) return S.previewAgent(id);
    if (window.TribeProfile && window.TribeProfile.open) return window.TribeProfile.open(id);
    if (window.TribePresence && window.TribePresence.jump) window.TribePresence.jump(id);
  }
  function click(e) {
    const t = e.target.closest('[data-of-on],[data-of-hide],[data-of-show],[data-of-open],[data-of-view],[data-desk],[data-task]'); if (!t) return;
    if (t.matches('[data-of-view]')) { try { localStorage.setItem(LS_VIEW, t.dataset.ofView); } catch {} return paintAll(); }
    if (t.matches('[data-of-on]')) return setOn(true);
    if (t.matches('[data-of-hide]')) return setHidden(true);
    if (t.matches('[data-of-show]')) return setHidden(false);
    if (t.matches('[data-of-open]')) {   // the project's Agents Hub, at the office
      const S = window.TribeShell;
      if (S && S.go) { S.go('agents'); setTimeout(() => { const o = document.getElementById('ad-office'); if (o) o.scrollIntoView({ block: 'start' }); }, 400); }
      else if (window.TribeAgentsHub && window.TribeAgentsHub.office) window.TribeAgentsHub.office();
      return;
    }
    if (t.matches('[data-task]')) { if (window.TribeTasks && window.TribeTasks.open) window.TribeTasks.open(t.dataset.task); return; }
    openCard(t.dataset.desk);
  }

  function mount(el, opts = {}) {
    const m = { el, opts };
    mounts.add(m);
    el.classList.add('of-mount'); if (opts.compact) el.classList.add('of-compact');
    el.addEventListener('click', click);
    el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-desk]')) { e.preventDefault(); openCard(e.target.dataset.desk); } });
    paint(m); load().then(() => paint(m));
    return { destroy() { mounts.delete(m); el.removeEventListener('click', click); if (m.space) m.space.destroy(); }, space: () => m.space };
  }

  // Live: presence, places, claims, tasks, change requests and the switches all repaint (at most every 1.5 s), plus a slow tick for "thinking".
  let soon = null;
  const nudge = () => { if (!mounts.size) return; clearTimeout(soon); soon = setTimeout(() => load(true).then(paintAll), 400); };
  if (C.on) {
    C.on('presence', nudge);
    C.on('ws', m => { if (m && /^(office|claims|task|tasks|places|place|changereq|coord|agents)/.test(m.type || '')) nudge(); });
  }
  setInterval(() => { if (mounts.size && document.visibilityState === 'visible') load(true).then(paintAll); }, 8000);

  // ---------- Settings: Tribe & admin (host/admin) and Workspace (everyone: hide for me) ----------
  function wireSettings() {
    const S = window.TribeSettings; if (!S || !S.addSection) return false;
    S.addSection('admin', { id: 'office', title: tr('The office'), render(el) {
      el.innerHTML = `<p class="faint">${esc(tr('Loading…'))}</p>`;
      load(true).then(d => {
        const on = !!(d && d.on), off = !!(d && d.agentsOff);
        el.innerHTML = `<div class="set-row"><div class="set-l"><b>${esc(tr('The office'))}</b><span class="set-hint">${esc(tr('Desks for everyone, people and AI helpers, with a screen that shows what they are doing. Off by default.'))}</span></div>
          <button class="toggle set-toggle" role="switch" id="set-office" aria-checked="${on}"${d && d.canSet ? '' : ' disabled'}><span class="switch"></span></button></div>
          <div class="set-row"><div class="set-l"><b>${esc(tr('AI helpers can work'))}</b><span class="set-hint">${esc(tr('Turn off to pause every agent in this tribe at once.'))}</span></div>
          <button class="toggle set-toggle" role="switch" id="set-agents-on" aria-checked="${!off}"${d && d.canSet ? '' : ' disabled'}><span class="switch"></span></button></div>`;
        el.querySelector('#set-office').onclick = async e => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(v)); await setOn(v); };
        el.querySelector('#set-agents-on').onclick = async e => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(v)); try { await C.api('/office', { method: 'PUT', body: { agentsOff: !v } }); } catch (err) { if (window.TribeApp) window.TribeApp.toast(err.message); } refresh(); };
      });
    } });
    S.addSection('workspace', { id: 'office-me', title: tr('The office'), render(el) {
      el.innerHTML = `<div class="set-row"><div class="set-l"><b>${esc(tr('Show the office'))}</b><span class="set-hint">${esc(tr('Only on this device. The tribe can still have it on.'))}</span></div>
        <button class="toggle set-toggle" role="switch" id="set-office-me" aria-checked="${!hidden()}"><span class="switch"></span></button></div>`;
      el.querySelector('#set-office-me').onclick = e => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', String(v)); setHidden(!v); };
    } });
    return true;
  }
  if (!wireSettings()) document.addEventListener('DOMContentLoaded', wireSettings, { once: true });

  window.TribeOffice = { mount, refresh, hidden, setHidden, state: () => data, setOn, load };
})();
