// Working together inside the creator tools (feat/cowork-editors): see where the others are in the website designer,
// App Creator and Motion Studio. Each person's pointer is anchored to the content it is over (a section, a part of a
// screen, a spot on the motion canvas), so it lands on the same thing at any window size; what they selected is outlined
// in their colour; what they are typing in says so ("Ana is editing the hero title"), and that thing is softly locked:
// you can still look, and a change to it says "Ana is editing this; ask or wait" instead of writing over them.
// Phones show no pointers, but the row of who is here and the outlines.
//
// The server relays { type:'cowork', ed, key, a, sel, selLabel, editing, editLabel, gone } to the others in the project
// (server/index.js). The pointer follows Settings › Profile › Live cursors (TribeCursors) and stops while the tab is hidden.
//
//   const h = TribeCowork.attach(ed, adapter)   ed = 'site' | 'app' | 'motion'
//     adapter = { key(): string                      what is open (people only see each other on the same thing)
//                 anchorAt(x, y): { p, x, y } | null  the content under a viewport point, as a path + fractions inside it
//                 rect(p): DOMRect | null             where a path is now, in viewport coordinates
//                 label(p): string                    "the hero title", for "Ana is editing …"
//                 draw?(people)                       draw them yourself (the website's preview lives in a sandboxed frame)
//                 row?: Element                       where the "who is here" chips go
//                 blockOf?(p): string }               paths in one block lock together (default: before the first '|')
//     h.select(p | null, label?)   h.editing(p | null, label?)   h.lockedBy(p) -> person | null   h.guard(p) -> bool
//     h.pointer(anchor | null)     (for a frame that measures its own pointer)   h.people()   h.detach()
//   TribeCowork.active() -> true while a creator tool is attached (the main-pane cursors step aside)
(function () {
  'use strict';
  const C = window.TribeClient; if (!C || !C.on) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const tt = (s, v) => T(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : null);
  const PAL = ['#F26B1D', '#38C6B1', '#6C7CFF', '#FABD2F', '#FF6F8E', '#3BD16F'];
  const colorOf = (id, c) => c || PAL[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PAL.length];
  const desk = () => matchMedia('(min-width: 821px) and (pointer: fine)').matches;
  const cursorsOn = () => !window.TribeCursors || !window.TribeCursors.on || window.TribeCursors.on();
  const live = () => !!(C.connected && C.connected() && (!C.hasToken || C.hasToken()));
  const send = m => { if (live()) { try { C.send(m); } catch {} } };
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  let cur = null;                      // the attached tool: { ed, ad, mine: { sel, selLabel, editing, editLabel }, layer, raf }
  const peers = new Map();             // member id -> { id, name, color, ed, key, a, sel, selLabel, editing, editLabel, seen, aSeen }

  // ---------- what I send ----------
  let lastPtr = 0, ptrT = 0, pend = null, showing = false;
  function pointer(anc) {
    if (!cur) return;
    if (!anc || !cursorsOn() || document.hidden) { if (showing) { send({ type: 'cowork', ed: cur.ed, key: cur.ad.key(), a: null }); showing = false; } return; }
    pend = { type: 'cowork', ed: cur.ed, key: cur.ad.key(), a: anc };
    const now = Date.now();
    if (now - lastPtr >= 55) { lastPtr = now; send(pend); pend = null; showing = true; }
    else if (!ptrT) ptrT = setTimeout(() => { ptrT = 0; if (pend) { lastPtr = Date.now(); send(pend); pend = null; showing = true; } }, 55);
  }
  function onMove(e) {
    if (!cur || cur.ad.draw && cur.ad.framePointer) return;   // the frame measures its own pointer and calls h.pointer()
    if (!desk()) return;
    let anc = null; try { anc = cur.ad.anchorAt(e.clientX, e.clientY); } catch {}
    pointer(anc);
  }
  function announce() {   // my selection and what I'm typing in, again now and then, so someone who just came sees it
    if (!cur) return;
    const m = cur.mine;
    send({ type: 'cowork', ed: cur.ed, key: cur.ad.key(), sel: m.sel ? { p: m.sel } : null, selLabel: m.selLabel || '', editing: m.editing ? { p: m.editing } : null, editLabel: m.editLabel || '' });
  }

  // ---------- what the others are doing ----------
  C.on('ws', m => {
    if (!m || m.type !== 'cowork' || !m.by) return;
    if (m.gone) { const p = peers.get(m.by); if (p && (!m.ed || p.ed === m.ed)) peers.delete(m.by); paint(); return; }
    const p = peers.get(m.by) || { id: m.by };
    const now = Date.now();
    Object.assign(p, { name: m.name || p.name || 'Friend', color: colorOf(m.by, m.color), ed: m.ed, key: m.key || '', seen: now });
    if ('a' in m) { p.a = m.a && m.a.p ? m.a : null; p.aSeen = now; }
    if ('sel' in m) { p.sel = m.sel && m.sel.p ? m.sel.p : null; p.selLabel = m.selLabel || ''; }
    if ('editing' in m) { p.editing = m.editing && m.editing.p ? m.editing.p : null; p.editLabel = m.editLabel || ''; }
    peers.set(m.by, p); paint();
  });
  C.on('presence', ms => { const here = new Set((ms || []).filter(x => x.online).map(x => x.id)); [...peers.keys()].forEach(id => { if (!here.has(id)) peers.delete(id); }); paint(); });
  C.on('project', () => { peers.clear(); paint(); });
  setInterval(() => {   // pointers fade after 10 s still; a person who stopped announcing leaves after 25 s
    const now = Date.now(); let ch = false;
    peers.forEach((p, id) => { if (p.a && now - (p.aSeen || 0) > 10000) { p.a = null; ch = true; } if (now - (p.seen || 0) > 25000) { peers.delete(id); ch = true; } });
    if (ch) paint();
    if (cur) announce();
  }, 5000);

  const here = () => (cur ? [...peers.values()].filter(p => p.ed === cur.ed && p.key === cur.ad.key()) : []);
  const blockOf = p => (cur && cur.ad.blockOf ? cur.ad.blockOf(p) : String(p || '').split('|')[0]);
  function lockedBy(p) {
    if (!p) return null;
    return here().find(x => x.editing && (x.editing === p || blockOf(x.editing) === blockOf(p))) || null;
  }
  function guard(p) {
    const who = lockedBy(p); if (!who) return true;
    toast(tt('{name} is editing this; ask or wait.', { name: who.name }));
    return false;
  }

  // ---------- drawing ----------
  function ensureLayer() {
    if (cur.layer && cur.layer.isConnected) return cur.layer;
    const l = document.createElement('div'); l.className = 'cw-layer'; l.setAttribute('aria-hidden', 'true'); document.body.appendChild(l); cur.layer = l; return l;
  }
  function paint() { if (!cur || cur.raf) return; cur.raf = requestAnimationFrame(() => { if (!cur) return; cur.raf = 0; draw(); }); }
  function draw() {
    const ppl = here(), showPtr = desk() && cursorsOn();
    row(ppl);
    if (cur.ad.draw) { try { cur.ad.draw(ppl.map(p => ({ id: p.id, name: p.name, color: p.color, a: showPtr ? p.a : null, sel: p.sel, selLabel: p.selLabel, editing: p.editing, editLabel: p.editLabel }))); } catch {} return; }
    const l = ensureLayer(), seen = new Set();
    for (const p of ppl) {
      // the outline: what they selected (or what they're typing in), with their name
      const box = p.editing || p.sel;
      let o = l.querySelector(`[data-cwo="${CSS.escape(p.id)}"]`);
      const r = box && cur.ad.rect(box);
      if (r && r.width) {
        if (!o) { o = document.createElement('div'); o.className = 'cw-out'; o.dataset.cwo = p.id; o.innerHTML = '<span class="cw-tag"></span>'; l.appendChild(o); }
        o.style.cssText = `left:${Math.round(r.left) - 2}px;top:${Math.round(r.top) - 2}px;width:${Math.round(r.width) + 4}px;height:${Math.round(r.height) + 4}px;--cw:${p.color}`;
        o.classList.toggle('is-editing', !!p.editing);
        o.querySelector('.cw-tag').textContent = p.editing ? tt('{name} is editing', { name: p.name }) : p.name;
        seen.add('o' + p.id);
      } else if (o) o.remove();
      // the pointer
      let c = l.querySelector(`[data-cwp="${CSS.escape(p.id)}"]`);
      const ar = showPtr && p.a && cur.ad.rect(p.a.p);
      if (ar && ar.width) {
        if (!c) { c = document.createElement('div'); c.className = 'cw-ptr'; c.dataset.cwp = p.id; c.innerHTML = `<svg viewBox="0 0 16 20" width="16" height="20"><path d="M1 1l13 8-6 1.5L5 18z" fill="${esc(p.color)}" stroke="#12151A" stroke-width="1.4" stroke-linejoin="round"/></svg><span style="background:${esc(p.color)}">${esc(p.name)}</span>`; l.appendChild(c); }
        c.style.transform = `translate(${Math.round(ar.left + p.a.x * ar.width)}px, ${Math.round(ar.top + p.a.y * ar.height)}px)`;
        seen.add('p' + p.id);
      } else if (c) c.remove();
    }
    l.querySelectorAll('[data-cwo]').forEach(x => { if (!seen.has('o' + x.dataset.cwo)) x.remove(); });
    l.querySelectorAll('[data-cwp]').forEach(x => { if (!seen.has('p' + x.dataset.cwp)) x.remove(); });
  }
  function row(ppl) {
    const el = cur.ad.row; if (!el) return;
    if (!ppl.length) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    const busy = ppl.find(p => p.editing);
    el.innerHTML = `<span class="cw-chips">${ppl.slice(0, 5).map(p => `<span class="cw-chip" style="--cw:${esc(p.color)}" title="${esc(p.editing ? tt('{name} is editing {what}', { name: p.name, what: p.editLabel || T('something') }) : p.name)}">${esc(initials(p.name))}</span>`).join('')}${ppl.length > 5 ? `<span class="cw-chip cw-more">+${ppl.length - 5}</span>` : ''}</span>`
      + `<span class="cw-say">${esc(busy ? tt('{name} is editing {what}', { name: busy.name, what: busy.editLabel || T('something') }) : ppl.length === 1 ? tt('{name} is here too', { name: ppl[0].name }) : tt('{n} people are here too', { n: ppl.length }))}</span>`;
  }
  // keep pointers on the content while things scroll, resize or the phone scales
  const re = () => paint();
  addEventListener('resize', re); document.addEventListener('scroll', re, true);
  setInterval(() => { if (cur && here().length) paint(); }, 400);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pointer(null); else if (cur) announce(); });
  addEventListener('pointermove', onMove, { passive: true });
  C.on('hello', () => { if (cur) announce(); });

  // ---------- attach / detach ----------
  function attach(ed, ad) {
    if (cur) cur.h.detach();
    const mine = { sel: null, selLabel: '', editing: null, editLabel: '' };
    const h = {
      select(p, label) { mine.sel = p || null; mine.selLabel = p ? (label || ad.label(p) || '') : ''; announce(); },
      editing(p, label) { const was = mine.editing; mine.editing = p || null; mine.editLabel = p ? (label || ad.label(p) || '') : ''; if (was !== mine.editing) announce(); },
      lockedBy, guard, pointer, people: () => here().map(p => ({ id: p.id, name: p.name, color: p.color, sel: p.sel, editing: p.editing, editLabel: p.editLabel })),
      repaint: paint,
      detach() {
        if (cur !== me) return;
        send({ type: 'cowork', ed, gone: true });
        if (cur.layer) cur.layer.remove(); if (cur.raf) cancelAnimationFrame(cur.raf);
        if (ad.row) { ad.row.innerHTML = ''; ad.row.hidden = true; }
        cur = null; document.body.classList.remove('cw-on');
      },
    };
    const me = { ed, ad, mine, layer: null, raf: 0, h };
    cur = me; document.body.classList.add('cw-on');
    // the main pane's live cursors step aside while a creator tool covers the screen
    try { C.send({ type: 'cursor', gone: true }); } catch {}
    announce(); paint();
    return h;
  }
  window.TribeCowork = { attach, active: () => !!cur, editor: () => (cur ? cur.ed : ''), _peers: () => [...peers.values()] };
})();
