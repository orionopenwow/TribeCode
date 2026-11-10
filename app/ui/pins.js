// Comment pins + presence (P1-E, docs/EDITOR-PARITY.md). Server: server/pins.js.
// On the live preview: press C (or the Comment button) and click anywhere on the page to drop a pin, talk in its thread,
// @mention friends (they get it in the Inbox), resolve it. A side list filters Open / Resolved / Mine. Pins stick to the
// element you clicked (a CSS path + the spot inside it), so they follow it when the layout moves; when the element is
// gone they fall back to where you clicked on the page.
// Presence: the avatars of friends looking at the preview sit in its bar. Click one to follow them: you go to their page
// and scroll where they scroll, until you click again (or scroll yourself).
//
// Other surfaces (the design canvas in app/ui/canvas/*, docs) mount pins with their own anchor provider:
//   const h = TribePins.mount(hostEl, {
//     surface: 'canvas', key: () => 'frame-1',                       // which set of pins (target.key must match)
//     layer: () => el,                                               // element to draw markers in (position: relative)
//     place: pins => Promise<[{ id, x, y, found }]>,                 // where each pin's target is, in layer px
//     pick: () => Promise<target|null>,                              // let the person click a spot; resolve its anchor
//   });
//   h.refresh(); h.comment(on); h.destroy();
// Public: window.TribePins = { mount, open(pinId), openRef('pid:pinId'), toggle(on), list() }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C || !C.api) return;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const t = (k, f) => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(k, f || k) : (f || k));
  const meId = () => (C.state().me || {}).id;
  const members = () => C.state().members || [];
  const initial = n => (String(n || '?').trim()[0] || '?').toUpperCase();
  const ago = iso => { const s = Math.max(1, (Date.now() - Date.parse(iso)) / 1000); return s < 60 ? t('now') : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };
  const relHref = h => String(h || '').replace(/^\/preview\/[^/]+\/[^/]+\//, '');   // page path without the per-person token
  const fmt = text => esc(text).replace(/(^|\s)@([\p{L}\p{N}_.-]+)/gu, '$1<b class="pin-at">@$2</b>');

  // ---------- data ----------
  let pins = [], loadedFor = null;
  async function load() {
    const pid = C.project(); if (!pid) return;
    try { const r = await C.api('/pins'); pins = r.pins || []; loadedFor = pid; } catch { pins = []; }
    mounts.forEach(h => h.refresh());
  }
  C.on('ws', m => {
    if (!m || m.type !== 'pins' || (m.project && m.project !== C.project())) return;
    if (m.removed) pins = pins.filter(p => p.id !== m.removed);
    else if (m.pin) { const i = pins.findIndex(p => p.id === m.pin.id); if (i >= 0) pins[i] = m.pin; else pins.push(m.pin); }
    mounts.forEach(h => h.refresh());
    if (openId && m.pin && m.pin.id === openId) renderThread();
    if (openId && m.removed === openId) closePop();
  });
  C.on('hello', load);
  C.on('project', () => { pins = []; loadedFor = null; closePop(); load(); });

  // ---------- the popover: new comment or a thread ----------
  let pop = null, openId = null, popAt = null;
  function closePop() { if (pop) pop.remove(); pop = null; openId = null; popAt = null; mounts.forEach(h => h.mark()); }
  function placePop(x, y) {
    popAt = { x, y };
    const w = innerWidth <= 820 ? innerWidth - 24 : Math.min(320, innerWidth - 24); pop.style.width = w + 'px'; const h = pop.offsetHeight || 200;
    let left = x + 18, top = y - 12;
    if (left + w > innerWidth - 12) left = Math.max(12, x - w - 18);
    if (top + h > innerHeight - 12) top = Math.max(12, innerHeight - h - 12);
    if (innerWidth <= 820) { left = 12; top = Math.max(12, innerHeight - h - 12); }
    pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.style.width = w + 'px';
  }
  function popShell() {
    closePop();
    pop = document.createElement('div'); pop.className = 'pin-pop'; pop.setAttribute('role', 'dialog');
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } });
    document.body.appendChild(pop); return pop;
  }
  // @mention helper: type @ and pick a friend
  function mentions(ta) {
    const box = document.createElement('div'); box.className = 'pin-mention hidden'; ta.after(box);
    const word = () => { const v = ta.value.slice(0, ta.selectionStart); const m = v.match(/(^|\s)@([\p{L}\p{N}_.-]*)$/u); return m ? m[2] : null; };
    const show = () => {
      const w = word(); if (w === null) return box.classList.add('hidden');
      const list = members().filter(m => m.id !== meId() && m.role !== 'agent' && String(m.name || '').toLowerCase().startsWith(w.toLowerCase())).slice(0, 5);
      if (!list.length) return box.classList.add('hidden');
      box.innerHTML = list.map(m => `<button type="button" data-name="${esc(m.name)}"><i style="background:${esc(m.color || 'var(--peer)')}">${esc(initial(m.name))}</i>${esc(m.name)}</button>`).join('');
      box.classList.remove('hidden');
    };
    box.addEventListener('mousedown', e => {
      const b = e.target.closest('[data-name]'); if (!b) return; e.preventDefault();
      const pos = ta.selectionStart, before = ta.value.slice(0, pos).replace(/@([\p{L}\p{N}_.-]*)$/u, '@' + b.dataset.name.split(' ')[0] + ' ');
      ta.value = before + ta.value.slice(pos); ta.selectionStart = ta.selectionEnd = before.length; box.classList.add('hidden'); ta.focus();
    });
    ta.addEventListener('input', show); ta.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 120));
  }
  function composer(x, y, target, surface) {
    popShell();
    pop.classList.add('pin-pop--new');
    pop.innerHTML = `<form class="pin-form" autocomplete="off"><span class="eyebrow mono">${esc(t('New comment'))}</span>
      ${target && target.tag ? `<span class="pin-on">&lt;${esc(target.tag)}&gt;${target.text ? ' “' + esc(target.text.slice(0, 40)) + '”' : ''}</span>` : ''}
      <textarea class="input" rows="3" maxlength="2000" placeholder="${esc(t('Add a comment. Type @ to mention someone'))}" aria-label="${esc(t('Comment'))}"></textarea>
      <div class="pin-acts"><button type="button" class="btn sm" data-x>${esc(t('Cancel'))}</button><button class="btn sm primary">${esc(t('Post'))}</button></div></form>`;
    const f = $('form', pop), ta = $('textarea', pop);
    mentions(ta);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } });
    $('[data-x]', pop).onclick = closePop;
    f.onsubmit = async e => {
      e.preventDefault(); const text = ta.value.trim(); if (!text) return;
      const btn = $('.primary', pop); btn.disabled = true;
      try { const r = await C.api('/pins', { method: 'POST', body: { surface, target, text } }); upsert(r.pin); closePop(); openThread(r.pin.id); }
      catch (err) { btn.disabled = false; toast(err.message); }
    };
    placePop(x, y); ta.focus();
  }
  function upsert(p) { const i = pins.findIndex(x => x.id === p.id); if (i >= 0) pins[i] = p; else pins.push(p); mounts.forEach(h => h.refresh()); }
  function openThread(id, at) {
    const p = pins.find(x => x.id === id); if (!p) return;
    popShell(); openId = id; renderThread();
    const xy = at || markerXY(id) || { x: innerWidth / 2, y: innerHeight / 3 };
    placePop(xy.x, xy.y);
    mounts.forEach(h => h.mark());
    const ta = $('textarea', pop); if (ta && innerWidth > 820) ta.focus();
  }
  function markerXY(id) { const m = document.querySelector(`.pin-mk[data-pin="${CSS.escape(id)}"]`); if (!m) return null; const r = m.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }
  function renderThread() {
    const p = pins.find(x => x.id === openId); if (!p || !pop) return;
    const draft = ($('textarea', pop) || {}).value || '';
    const mine = p.by === meId(), host = ['host', 'admin'].includes((C.state().me || {}).role);
    pop.classList.remove('pin-pop--new');
    pop.innerHTML = `<div class="pin-th-h"><span class="eyebrow mono">${esc(p.resolved ? t('Resolved') : t('Comment'))}</span><span class="pin-sp"></span>
        <button type="button" class="pin-ib" data-res title="${esc(p.resolved ? t('Reopen') : t('Resolve'))}" aria-label="${esc(p.resolved ? t('Reopen') : t('Resolve'))}">${p.resolved ? '↺' : '✓'}</button>
        ${mine || host ? `<button type="button" class="pin-ib" data-del title="${esc(t('Delete'))}" aria-label="${esc(t('Delete'))}">🗑</button>` : ''}
        <button type="button" class="pin-ib" data-x title="${esc(t('Close'))}" aria-label="${esc(t('Close'))}">✕</button></div>
      <ol class="pin-th">${p.thread.map(c => `<li><i class="pin-av" style="background:${esc(c.color || 'var(--peer)')}">${esc(initial(c.byName))}</i><div><b>${esc(c.byName)}</b> <span class="faint">${esc(ago(c.at))}</span><p>${fmt(c.text)}</p></div></li>`).join('')}</ol>
      ${p.resolved && p.resolvedBy ? `<p class="pin-resby">✓ ${esc(t('Resolved'))}</p>` : ''}
      <form class="pin-form pin-form--reply" autocomplete="off"><textarea class="input" rows="2" maxlength="2000" placeholder="${esc(t('Reply'))}…" aria-label="${esc(t('Reply'))}"></textarea>
        <div class="pin-acts"><button class="btn sm primary">${esc(t('Reply'))}</button></div></form>`;
    const ta = $('textarea', pop); ta.value = draft; mentions(ta);
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('form', pop).requestSubmit(); } });
    $('[data-x]', pop).onclick = closePop;
    $('[data-res]', pop).onclick = async () => { try { upsert((await C.api(`/pins/${p.id}/resolve`, { method: 'POST', body: { resolved: !p.resolved } })).pin); renderThread(); } catch (e) { toast(e.message); } };
    const del = $('[data-del]', pop); if (del) del.onclick = async () => { try { await C.api(`/pins/${p.id}`, { method: 'DELETE' }); pins = pins.filter(x => x.id !== p.id); closePop(); mounts.forEach(h => h.refresh()); } catch (e) { toast(e.message); } };
    $('form', pop).onsubmit = async e => {
      e.preventDefault(); const text = ta.value.trim(); if (!text) return;
      try { ta.value = ''; upsert((await C.api(`/pins/${p.id}/reply`, { method: 'POST', body: { text } })).pin); renderThread(); const n = $('textarea', pop); if (n) n.focus(); }
      catch (err) { ta.value = text; toast(err.message); }
    };
    const th = $('.pin-th', pop); th.scrollTop = th.scrollHeight;
    if (popAt) placePop(popAt.x, popAt.y);
  }

  // ---------- a mount: markers on a surface ----------
  const mounts = new Set();
  function mount(host, prov) {
    let layer = null, seq = 0, commenting = false;
    const h = {
      prov,
      mine: () => pins.filter(p => p.surface === prov.surface && (!prov.key || !p.target || (p.target.key || p.target.href ? sameKey(p) : true))),
      async refresh() {
        layer = prov.layer(); if (!layer) return;
        const list = h.mine().filter(p => !p.resolved || p.id === openId);
        const my = ++seq;
        let pos = [];
        try { pos = await prov.place(list); } catch { pos = []; }
        if (my !== seq || !layer.isConnected) return;
        const at = new Map(pos.map(x => [x.id, x]));
        layer.querySelectorAll('.pin-mk').forEach(el => { if (!at.has(el.dataset.pin)) el.remove(); });
        list.forEach((p, i) => {
          const xy = at.get(p.id); if (!xy) return;
          let el = layer.querySelector(`.pin-mk[data-pin="${CSS.escape(p.id)}"]`);
          if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'pin-mk'; el.dataset.pin = p.id; el.addEventListener('click', e => { e.stopPropagation(); openId === p.id ? closePop() : openThread(p.id); }); layer.appendChild(el); }
          el.style.setProperty('--c', p.color || 'var(--ember)');
          el.innerHTML = `<span>${esc(initial(p.byName))}</span>${p.thread.length > 1 ? `<em>${p.thread.length}</em>` : ''}`;
          el.title = `${p.byName}: ${p.thread[0].text.slice(0, 80)}`;
          el.setAttribute('aria-label', `${t('Comment')} · ${p.byName}`);
          el.style.transform = `translate(${Math.round(xy.x)}px, ${Math.round(xy.y)}px)`;
          el.classList.toggle('off', !!xy.hidden);
          el.classList.toggle('is-gone', xy.found === false);
          el.classList.toggle('is-res', !!p.resolved);
        });
        h.mark();
        if (prov.counted) prov.counted(h.mine().filter(p => !p.resolved).length);
        if (openId && popAt) { const xy = markerXY(openId); if (xy && pop) placePop(xy.x, xy.y); }
      },
      mark() { if (layer) layer.querySelectorAll('.pin-mk').forEach(el => el.classList.toggle('is-open', el.dataset.pin === openId)); },
      async comment(on) {
        commenting = on === undefined ? !commenting : !!on;
        if (prov.commenting) prov.commenting(commenting);
        if (!commenting) return;
        const target = await prov.pick(); if (!target) return;
        commenting = false; if (prov.commenting) prov.commenting(false);
        composer(target._x, target._y, cleanT(target), prov.surface);
      },
      isCommenting: () => commenting,
      destroy() { mounts.delete(h); if (layer) layer.querySelectorAll('.pin-mk').forEach(el => el.remove()); },
    };
    const sameKey = p => { const k = prov.key(); return p.target.key ? p.target.key === k : relHref(p.target.href) === relHref(k); };
    mounts.add(h);
    if (loadedFor !== C.project()) load(); else h.refresh();
    return h;
  }
  const cleanT = tg => { const o = { ...tg }; delete o._x; delete o._y; return o; };

  // ---------- the live preview ----------
  let pv = null;   // { pane, h, bar, layer, viewers, follow, list }
  const frameEl = () => document.getElementById('pvw-iframe');
  const post = msg => { const f = frameEl(); if (f && f.contentWindow) f.contentWindow.postMessage(msg, '*'); };
  let pvHref = '', pvFy = 0, posReq = null, pickReq = null;
  function geom() {
    const f = frameEl(); if (!f || !pv) return null;
    const holder = f.parentElement, fr = f.getBoundingClientRect(), hr = holder.getBoundingClientRect();
    const s = f.offsetWidth ? fr.width / f.offsetWidth : 1;
    return { f, holder, s, left: fr.left - hr.left - holder.clientLeft, top: fr.top - hr.top - holder.clientTop, w: fr.width, hgt: fr.height, fr };
  }
  function pvLayer() {
    const g = geom(); if (!g) return null;
    let l = g.holder.querySelector(':scope > .pin-layer');
    if (!l) { l = document.createElement('div'); l.className = 'pin-layer'; g.holder.appendChild(l); }
    Object.assign(l.style, { left: g.left + 'px', top: g.top + 'px', width: g.w + 'px', height: g.hgt + 'px' });
    return l;
  }
  const pvProvider = {
    surface: 'preview',
    key: () => pvHref,
    layer: pvLayer,
    place: list => new Promise(res => {
      const g = geom(); if (!g || !list.length) return res([]);
      const items = list.map(p => ({ id: p.id, sel: p.target.sel, ox: p.target.ox, oy: p.target.oy, fx: p.target.fx, fy: p.target.fy }));
      if (posReq) posReq.res(null);
      const timer = setTimeout(() => { posReq = null; res([]); }, 1500);
      posReq = { res: out => { clearTimeout(timer); posReq = null; if (!out) return res([]); const gg = geom() || g; res(out.map(o => ({ id: o.id, x: o.x * gg.s, y: o.y * gg.s, found: o.found, hidden: o.y < -4 || o.y * gg.s > gg.hgt + 4 || o.x < -4 || o.x * gg.s > gg.w + 4 }))); } };
      post({ tc: 'pinpos', items });
    }),
    pick: () => new Promise(res => { if (pickReq) pickReq(null); pickReq = res; post({ tc: 'pins', on: true }); }),
    commenting: on => {
      if (!pv) return;
      pv.pane.classList.toggle('pin-commenting', on);
      const b = pv.bar && pv.bar.querySelector('[data-pin-act="comment"]'); if (b) b.setAttribute('aria-pressed', String(on));
      if (!on) { post({ tc: 'pins', on: false }); if (pickReq) { const r = pickReq; pickReq = null; r(null); } }
      else { const ed = pv.pane.querySelector('.pvw-edit[aria-pressed="true"]'); if (ed) ed.click(); }   // one click mode at a time
      const hint = pv.pane.querySelector('.pin-hint'); if (hint) hint.classList.toggle('hidden', !on);
    },
    counted: n => { if (!pv) return; const b = pv.bar.querySelector('.pin-count'); if (b) { b.textContent = n || ''; b.classList.toggle('hidden', !n); } },
  };
  window.addEventListener('message', e => {
    const f = frameEl(); if (!f || e.source !== f.contentWindow || !e.data || typeof e.data !== 'object') return;
    const m = e.data;
    if (m.tc === 'ready') { pvHref = String(m.href || ''); if (pv) { if (pv.h.isCommenting()) post({ tc: 'pins', on: true }); pv.h.refresh(); sendView(true); if (pv.follow) chase(); } }
    if (m.tc === 'key' && pv) { if (m.key === 'Escape') pv.h.comment(false); else pv.h.comment(); }   // C pressed inside the preview page
    if (m.tc === 'pinpos' && posReq) posReq.res(Array.isArray(m.items) ? m.items : []);
    if (m.tc === 'scroll') {
      pvFy = Number(m.fy) || 0; if (typeof m.href === 'string') pvHref = m.href;
      if (pv) { schedule(); sendView(); if (pv.follow && !pv.chasing && Date.now() - (pv.chasedAt || 0) > 900) unfollow(); }
    }
    if (m.tc === 'pinpick' && pickReq) {
      const g = geom(), r = pickReq; pickReq = null;
      const x = g ? g.fr.left + m.x * g.s : innerWidth / 2, y = g ? g.fr.top + m.y * g.s : innerHeight / 2;
      r({ href: String(m.href || pvHref), sel: m.sel, ox: m.ox, oy: m.oy, fx: m.fx, fy: m.fy, tag: m.tag, text: m.text, _x: x, _y: y });
    }
  });
  // the hint / following pill and the list sit over the stage only (Flint's panel can share the body)
  function fitExtras() {
    if (!pv) return;
    const body = pv.pane.querySelector('.pvw-body'), stage = pv.pane.querySelector('#pvw-stage'), ex = pv.pane.querySelector('.pin-extras');
    if (!body || !stage || !ex) return;
    const br = body.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    ex.style.left = Math.max(0, sr.left - br.left) + 'px'; ex.style.right = Math.max(0, br.right - sr.right) + 'px';
  }
  let raf = 0; const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (pv) { fitExtras(); pv.h.refresh(); } }); };

  // presence: who else is looking at the preview, and following them
  let lastSent = 0;
  function sendView(force) {
    if (!pv || !C.send || !C.connected || !C.connected()) return;
    const now = Date.now(); if (!force && now - lastSent < 150) { clearTimeout(sendView.t); sendView.t = setTimeout(() => sendView(true), 160); return; }
    lastSent = now; C.send({ type: 'pin-view', open: true, href: pvHref, fy: pvFy });
  }
  const viewers = new Map();   // id -> { name, color, href, fy, at }
  C.on('ws', m => {
    if (!m || m.type !== 'pin-view' || !m.by || m.by === meId()) return;
    if (m.project && m.project !== C.project()) return;
    const fresh = m.open && !viewers.has(m.by);
    if (!m.open) viewers.delete(m.by); else viewers.set(m.by, { name: m.name, color: m.color, href: m.href, fy: m.fy, at: Date.now() });
    if (fresh && pv) setTimeout(() => sendView(true), 50);   // say hello back, so someone who just opened the preview sees you too
    drawViewers();
    if (pv && pv.follow === m.by) { if (m.open) chase(); else unfollow(); }
  });
  C.on('presence', ms => { const here = new Set((ms || []).filter(x => x.online).map(x => x.id)); [...viewers.keys()].forEach(id => { if (!here.has(id)) viewers.delete(id); }); drawViewers(); });
  setInterval(() => { if (pv && !document.hidden) sendView(true); }, 30_000);   // still here
  setInterval(() => { const cut = Date.now() - 90_000; let ch = false; viewers.forEach((v, id) => { if (v.at < cut) { viewers.delete(id); ch = true; } }); if (ch) drawViewers(); }, 30_000);
  function drawViewers() {
    if (!pv) return;
    fitExtras();
    const box = pv.bar.querySelector('.pin-viewers'); if (!box) return;
    box.innerHTML = [...viewers.entries()].slice(0, 5).map(([id, v]) => `<button type="button" class="pin-vw${pv.follow === id ? ' is-on' : ''}" data-follow="${esc(id)}" style="--c:${esc(v.color || 'var(--peer)')}" title="${esc(pv.follow === id ? t('Stop following') : t('Follow') + ' ' + v.name)}" aria-label="${esc((pv.follow === id ? t('Stop following') : t('Follow')) + ' ' + v.name)}" aria-pressed="${pv.follow === id}">${esc(initial(v.name))}</button>`).join('');
    const tag = pv.pane.querySelector('.pin-following');
    if (tag) { const v = pv.follow && viewers.get(pv.follow); tag.classList.toggle('hidden', !v); if (v) { tag.style.setProperty('--c', v.color || 'var(--peer)'); tag.querySelector('span').textContent = `${t('Following')} ${v.name}`; } }
    pv.pane.classList.toggle('pin-follow', !!pv.follow);
  }
  function follow(id) {
    if (!pv) return;
    if (pv.follow === id) return unfollow();
    pv.follow = id; drawViewers(); chase();
    if (window.TribeCursors && window.TribeCursors.follow) window.TribeCursors.follow(id);
  }
  function unfollow() { if (!pv || !pv.follow) return; pv.follow = null; drawViewers(); if (window.TribeCursors && window.TribeCursors.follow) window.TribeCursors.follow(null); }
  function chase() {
    const v = pv && pv.follow && viewers.get(pv.follow); if (!v) return;
    pv.chasing = true; pv.chasedAt = Date.now(); setTimeout(() => { if (pv) pv.chasing = false; }, 700);
    if (v.href && relHref(v.href) !== relHref(pvHref)) {
      const P = window.TribePreview, base = P && P.url && P.url(), f = frameEl();
      if (base && f) { f.src = base.replace(/[^/]*$/, '') + relHref(v.href); pvHref = ''; return; }   // its 'ready' chases again
    }
    post({ tc: 'scrollto', fy: v.fy, instant: true });
  }

  function attach(pane) {
    if (pv && pv.pane === pane) return;
    if (pv) detach();
    const bar = pane.querySelector('.pvw-bar'); if (!bar) return;
    const sp = bar.querySelector('.pvw-sp');
    const wrap = document.createElement('span'); wrap.className = 'pin-bar';
    wrap.innerHTML = `<span class="pin-viewers"></span>
      <button class="pvw-btn pin-cbtn" data-pin-act="comment" title="${esc(t('Comment'))} (C)" aria-label="${esc(t('Comment'))}" aria-pressed="false"><svg class="pvw-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-5 4v-4H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/></svg><b class="pin-count hidden"></b></button>
      <button class="pvw-btn" data-pin-act="list" title="${esc(t('Comments'))}" aria-label="${esc(t('Comments'))}" aria-pressed="false"><svg class="pvw-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></button>`;
    if (sp) sp.after(wrap); else bar.appendChild(wrap);
    const body = pane.querySelector('.pvw-body');
    const extras = document.createElement('div'); extras.className = 'pin-extras';
    extras.innerHTML = `<p class="pin-hint hidden"><b>${esc(t('Click anywhere to comment'))}</b><span>${esc(t('Esc to cancel'))}</span></p>
      <p class="pin-following hidden"><span></span><button type="button" class="btn sm" data-pin-act="unfollow">${esc(t('Stop following'))}</button></p>`;
    if (body) body.appendChild(extras);
    wrap.addEventListener('click', e => {
      const f = e.target.closest('[data-follow]'); if (f) return follow(f.dataset.follow);
      const a = e.target.closest('[data-pin-act]'); if (!a) return;
      if (a.dataset.pinAct === 'comment') pv.h.comment();
      if (a.dataset.pinAct === 'list') toggleList();
    });
    extras.addEventListener('click', e => { if (e.target.closest('[data-pin-act="unfollow"]')) unfollow(); });
    pv = { pane, bar, h: mount(pane, pvProvider), follow: null, list: null };
    const stage = pane.querySelector('#pvw-stage');
    if (stage) stage.addEventListener('scroll', schedule, { passive: true });
    if (window.ResizeObserver && stage) { pv.ro = new ResizeObserver(schedule); pv.ro.observe(stage); }
    drawViewers(); sendView(true);
  }
  function detach() {
    if (!pv) return;
    if (pv.ro) pv.ro.disconnect();
    pv.h.destroy(); closePop();
    if (C.send && C.connected && C.connected()) C.send({ type: 'pin-view', open: false });
    pv = null;
  }
  // the preview pane comes and goes (shell right panel or the phone sheet): watch for it
  new MutationObserver(() => {
    const pane = document.getElementById('pvw');
    if (pane && pane.isConnected) attach(pane); else if (pv && !pv.pane.isConnected) detach();
  }).observe(document.body, { childList: true, subtree: true });

  // ---------- the list: Open / Resolved / Mine ----------
  let filter = 'open';
  function toggleList(on) {
    if (!pv) return;
    const want = on === undefined ? !pv.list : !!on;
    const btn = pv.bar.querySelector('[data-pin-act="list"]');
    if (!want) { if (pv.list) pv.list.remove(); pv.list = null; if (btn) btn.setAttribute('aria-pressed', 'false'); return; }
    if (!pv.list) {
      pv.list = document.createElement('aside'); pv.list.className = 'pin-list'; pv.list.setAttribute('aria-label', t('Comments'));
      (pv.pane.querySelector('.pvw-body') || pv.pane).appendChild(pv.list);
      pv.list.addEventListener('click', e => {
        const f = e.target.closest('[data-filter]'); if (f) { filter = f.dataset.filter; return drawList(); }
        if (e.target.closest('[data-close]')) return toggleList(false);
        const it = e.target.closest('[data-open]'); if (it) jump(it.dataset.open);
      });
    }
    if (btn) btn.setAttribute('aria-pressed', 'true');
    if (innerWidth <= 820) { const r = pv.bar.getBoundingClientRect(); Object.assign(pv.list.style, { position: 'fixed', top: Math.round(r.bottom) + 'px', left: '0', right: '0', bottom: '0', width: 'auto' }); }   // phone: a sheet under the bar
    else pv.list.style.cssText = '';
    drawList();
  }
  function drawList() {
    if (!pv || !pv.list) return;
    const all = pins.filter(p => p.surface === 'preview');
    const shown = all.filter(p => filter === 'open' ? !p.resolved : filter === 'resolved' ? p.resolved : (p.by === meId() || p.thread.some(c => c.by === meId())));
    const n = { open: all.filter(p => !p.resolved).length, resolved: all.filter(p => p.resolved).length };
    pv.list.innerHTML = `<header><span class="eyebrow mono">${esc(t('Comments'))}</span><span class="pin-sp"></span><button type="button" class="pin-ib" data-close aria-label="${esc(t('Close'))}">✕</button></header>
      <div class="pin-seg" role="tablist">${[['open', t('Unresolved') + (n.open ? ' ' + n.open : '')], ['resolved', t('Resolved') + (n.resolved ? ' ' + n.resolved : '')], ['mine', t('Mine')]].map(([k, l]) => `<button role="tab" data-filter="${k}" aria-selected="${filter === k}">${esc(l)}</button>`).join('')}</div>
      <ol>${shown.slice().reverse().map(p => `<li><button type="button" data-open="${esc(p.id)}" class="${p.resolved ? 'is-res' : ''}"><i class="pin-av" style="background:${esc(p.color || 'var(--peer)')}">${esc(initial(p.byName))}</i>
        <span><b>${esc(p.byName)}</b> <span class="faint">${esc(ago(p.thread[p.thread.length - 1].at))}${p.thread.length > 1 ? ' · ' + (p.thread.length - 1) + ' ' + esc(t(p.thread.length === 2 ? 'reply' : 'replies')) : ''}</span>
        <em>${esc(p.thread[0].text.slice(0, 120))}</em>${p.target && p.target.href && relHref(p.target.href) !== relHref(pvHref) ? `<small class="mono">/${esc(relHref(p.target.href))}</small>` : ''}</span></button></li>`).join('') || `<li class="pin-none">${esc(filter === 'open' ? t('No open comments. Press C and click the page to add one.') : t('Nothing here yet.'))}</li>`}</ol>`;
  }
  const relist = () => { if (pv && pv.list) drawList(); };
  C.on('ws', m => { if (m && m.type === 'pins') relist(); });
  function jump(id) {
    const p = pins.find(x => x.id === id); if (!p) return;
    if (p.surface !== 'preview') return openThread(id);
    const go = () => { post({ tc: 'scrollto', fy: Math.max(0, (p.target.fy || 0) - 0.1), instant: true }); setTimeout(() => { if (pv) pv.h.refresh().then(() => openThread(id)); }, 260); };
    if (p.target && p.target.href && relHref(p.target.href) !== relHref(pvHref)) {
      const P = window.TribePreview, base = P && P.url && P.url(), f = frameEl();
      if (base && f) { f.src = base.replace(/[^/]*$/, '') + relHref(p.target.href); const once = e => { if (e.data && e.data.tc === 'ready' && e.source === f.contentWindow) { removeEventListener('message', once); setTimeout(go, 120); } }; addEventListener('message', once); return; }
    }
    go();
  }
  // from the Inbox: 'pid:pinId'
  async function openRef(ref) {
    const [pid, id] = String(ref || '').split(':'); if (!id) return;
    const P = window.TribePreview;
    if (pid && pid !== C.project() && C.switchProject) { try { await C.switchProject(pid); } catch {} }
    if (loadedFor !== C.project()) await load();
    if (P && P.open) await P.open();
    const wait = (n = 0) => { if (pv && frameEl() && pvHref) return jump(id); if (n < 40) setTimeout(() => wait(n + 1), 150); else openThread(id); };
    wait();
  }

  // C toggles comment mode on the preview (not while typing)
  document.addEventListener('keydown', e => {
    if (!pv || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    if ((e.key === 'c' || e.key === 'C') && !e.repeat) { e.preventDefault(); pv.h.comment(); }
    else if (e.key === 'Escape' && pv.h.isCommenting()) pv.h.comment(false);
  });
  document.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('.pin-mk')) closePop(); }, true);

  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: t('Comment on the preview'), keys: 'comment pin feedback note review preview', run: async () => { if (window.TribePreview) await window.TribePreview.open(); setTimeout(() => pv && pv.h.comment(true), 400); } },
  ]);

  // escape(): close the innermost pin thing (thread popover → comment list → comment mode); true when something closed.
  // The focused preview workspace (preview.js) asks this first, so Esc peels layers instead of closing the preview.
  function escape() {
    if (pop) { closePop(); return true; }
    if (pv && pv.list) { toggleList(false); return true; }
    if (pv && pv.h.isCommenting()) { pv.h.comment(false); return true; }
    return false;
  }
  window.TribePins = { mount, open: openThread, openRef, toggle: on => pv && pv.h.comment(on), list: () => pins.slice(), follow, unfollow, escape };
})();
