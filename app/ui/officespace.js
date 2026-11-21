// Office Space (pass 11): the office drawn as a small pixel floor. Every person, AI helper and Flint is a character who
// walks to their desk, types while writing, reads while reading, goes to the task board when they hand work in, sits in
// the thinking corner while waiting, rests in the lounge when idle, and leaves by the door when they go offline. A bubble
// says when an agent needs your OK or someone just finished. Click anyone for their card, with the actions TribeCode
// already has (DM, call, give a task, open what they're editing, approve an agent's ask, pause it).
// Data: TribeOffice (server/office.js). Art: TribeOfficeSets (ours, drawn in code). Idea for walking characters at desks
// from Pixel Agents (MIT, Pablo De Lucca); no code or art from it is used here.
//   window.TribeOfficeSpace = { mount(el, office) -> { update(data), destroy() } }
(function () {
  'use strict';
  const S = window.TribeOfficeSets, C = window.TribeClient; if (!S || !C) return;
  const T = S.T;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPEED = 3.2;   // tiles a second

  function mount(el, office) {
    let data = null, layout = null, set = S.get('tribecode'), raf = 0, last = 0, tick = 0, dead = false, view = { z: 0, ox: 0, oy: 0 };
    let editing = null, tool = 'move', sel = null, drag = null, cardFor = null;
    const chars = new Map();   // id -> { d, x, y (tile, float), path, dir, pose, frame, visible, target }
    el.innerHTML = `<div class="os" data-os>
      <div class="os-bar">
        <span class="eyebrow">${esc(tr('Office Space'))}</span>
        <span class="os-gap"></span>
        <button class="btn sm" data-os-act="look">${esc(tr('Your look'))}</button>
        <label class="os-set" hidden><span class="sr-only">${esc(tr('Set'))}</span><select class="input sm" data-os-set></select></label>
        <button class="btn sm" data-os-act="edit" hidden>${esc(tr('Edit layout'))}</button>
        <span class="os-zoom"><button class="btn sm icon" data-os-act="out" aria-label="${esc(tr('Zoom out'))}">−</button><button class="btn sm icon" data-os-act="in" aria-label="${esc(tr('Zoom in'))}">+</button></span>
      </div>
      <div class="os-stage"><canvas class="os-canvas" role="img" aria-label="${esc(tr('Office Space: everyone at their desks'))}"></canvas><div class="os-layer" aria-live="polite"></div>
        <aside class="os-card" hidden></aside><aside class="os-edit" hidden></aside><aside class="os-look" hidden></aside></div>
      <ul class="sr-only os-sr"></ul>
    </div>`;
    const root = el.querySelector('[data-os]'), cv = root.querySelector('canvas'), ctx = cv.getContext('2d'), layer = root.querySelector('.os-layer');
    const stage = root.querySelector('.os-stage'), card = root.querySelector('.os-card'), edit = root.querySelector('.os-edit'), lookEl = root.querySelector('.os-look');

    // ---------- the layout, the occupied tiles and the spots ----------
    const deskItems = () => layout.items.filter(i => i.t === 'desk');
    const at = (x, y) => layout.items.find(i => i.x === x && i.y === y && !(S.ITEMS[i.t] || {}).floor);
    const tileAt = (x, y) => layout.tiles[y * layout.w + x];
    const inside = (x, y) => x >= 0 && y >= 0 && x < layout.w && y < layout.h;
    const walk = (x, y) => inside(x, y) && tileAt(x, y) !== 'wall' && !((it => it && (S.ITEMS[it.t] || {}).block)(at(x, y)));
    const seatOf = d => { const [dx, dy] = S.SEAT[d.r || 0]; return { x: d.x + dx, y: d.y + dy, dir: [2, 3, 0, 1][d.r || 0] }; };
    const door = () => { for (let x = 0; x < layout.w; x++) if (tileAt(x, layout.h - 1) !== 'wall') return { x, y: layout.h - 1 }; return { x: 1, y: layout.h - 2 }; };
    function deskFor() {
      const out = new Map(), desks = deskItems(), free = desks.filter(d => !d.who);
      const list = everyone();
      for (const d of desks) if (d.who && list.some(p => p.id === d.who)) out.set(d.who, d);
      for (const p of list) if (!out.has(p.id)) { const d = free.find(x => ![...out.values()].includes(x)); if (d) out.set(p.id, d); }
      return out;
    }
    // Spots near an item: its own tile if it's a seat, otherwise the free tile in front of it.
    function spotsNear(type) {
      const out = [];
      for (const it of layout.items.filter(i => i.t === type)) {
        if ((S.ITEMS[type] || {}).seat && type !== 'desk') out.push({ x: it.x, y: it.y, dir: 0, sit: true });
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (walk(it.x + dx, it.y + dy)) out.push({ x: it.x + dx, y: it.y + dy, dir: dy === 1 ? 2 : dy === -1 ? 0 : dx === 1 ? 1 : 3 });
      }
      return out;
    }
    const everyone = () => {
      const list = ((data && data.desks) || []).slice();
      list.push({ id: 'flint', name: 'Flint', kind: 'flint', state: 'active', spot: 'desk', lines: [] });
      return list;
    };
    function targetOf(d, desks, used) {
      if (d.state === 'off') return { ...door(), leave: true };
      const pick = (type, fallback) => { const all = spotsNear(type); const s = all.find(p => !used.has(p.x + ',' + p.y)) || all[0]; return s || fallback; };
      if (d.id === 'flint') return pick('coffee', { x: 2, y: 2, dir: 0 });
      const desk = desks.get(d.id);
      if (d.spot === 'think') return pick('think', desk && seatOf(desk));
      if (d.spot === 'board') return pick('board', desk && seatOf(desk));
      if (d.spot === 'lounge' || d.state === 'away') return pick('sofa', pick('rug', desk && seatOf(desk)));
      if (desk) return { ...seatOf(desk), desk: true };
      return pick('sofa', door());
    }
    // Breadth-first search over the floor (four directions). Our own, small: floors are at most 40x28.
    function route(from, to) {
      const sx = Math.round(from.x), sy = Math.round(from.y), key = (x, y) => y * layout.w + x;
      if (sx === to.x && sy === to.y) return [];
      const prev = new Map([[key(sx, sy), -1]]), q = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (prev.has(k)) continue;
          const goal = nx === to.x && ny === to.y;
          if (!goal && !walk(nx, ny)) continue;
          if (!inside(nx, ny)) continue;
          prev.set(k, key(x, y));
          if (goal) { const out = []; let c = k; while (c !== key(sx, sy)) { out.unshift({ x: c % layout.w, y: Math.floor(c / layout.w) }); c = prev.get(c); } return out; }
          q.push([nx, ny]);
        }
      }
      return [{ x: to.x, y: to.y }];   // no way through: step straight there
    }

    // ---------- the characters follow the data ----------
    function sync() {
      const desks = deskFor(), used = new Set(), list = everyone();
      for (const d of list) {
        let ch = chars.get(d.id);
        const tgt = targetOf(d, desks, used); used.add(tgt.x + ',' + tgt.y);
        if (!ch) { const st = d.state === 'off' ? tgt : (reduce() ? tgt : door()); ch = { d, x: st.x, y: st.y, path: [], dir: 0, pose: 'stand', frame: 0, visible: d.state !== 'off', target: null }; chars.set(d.id, ch); }
        ch.d = d;
        if (!ch.target || ch.target.x !== tgt.x || ch.target.y !== tgt.y || ch.target.leave !== tgt.leave) {
          ch.target = tgt;
          if (d.state !== 'off') ch.visible = true;
          if (reduce()) { ch.x = tgt.x; ch.y = tgt.y; ch.path = []; if (tgt.leave) ch.visible = false; }
          else ch.path = route({ x: ch.x, y: ch.y }, tgt);
        }
      }
      for (const id of [...chars.keys()]) if (!list.some(d => d.id === id)) chars.delete(id);
      paintSr();
    }
    function poseOf(ch) {
      if (ch.path.length) return 'walk';
      const d = ch.d, t = ch.target || {};
      if (t.desk && d.state === 'active') return d.kind === 'agent' ? (d.act === 'read' ? 'read' : d.act === 'type' || (d.files || []).length || d.task ? 'type' : 'sit') : (d.where ? 'type' : 'sit');
      if (t.sit) return 'sit';
      return 'stand';
    }

    // ---------- drawing ----------
    function fit() {
      const r = stage.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
      const base = Math.max(1, Math.floor(Math.min(r.width / (layout.w * T), r.height / (layout.h * T)) * dpr));
      const scale = Math.max(1, base + view.z);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
      const W = layout.w * T * scale, H = layout.h * T * scale;
      const ox = Math.round((cv.width - W) / 2 + view.ox * dpr), oy = Math.round((cv.height - H) / 2 + view.oy * dpr);
      return { scale, ox, oy, dpr };
    }
    let F = null;
    function draw() {
      if (!layout) return;
      F = fit();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = set.palette.floor2; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(F.scale, 0, 0, F.scale, F.ox, F.oy); ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < layout.h; y++) for (let x = 0; x < layout.w; x++) S.drawTile(ctx, set, tileAt(x, y), x * T, y * T, x, y);
      if (editing) for (const a of layout.areas || []) { ctx.strokeStyle = 'rgba(232,225,211,0.35)'; ctx.lineWidth = 1 / F.scale; ctx.strokeRect(a.x * T + 0.5, a.y * T + 0.5, a.w * T - 1, a.h * T - 1); }
      // rugs first, then everything else and the characters sorted by row so nearer things draw over farther ones
      for (const it of layout.items.filter(i => i.t === 'rug')) S.drawItem(ctx, set, it, it.x * T, it.y * T);
      const desks = deskFor(), byDesk = new Map([...desks].map(([id, d]) => [d, id]));
      const drawables = [];
      for (const it of layout.items) {
        if (it.t === 'rug') continue;
        drawables.push({ y: it.y, z: 0, f: () => {
          const who = byDesk.get(it), ch = who && chars.get(who), on = !!(ch && ch.d.state === 'active' && ch.target && ch.target.desk && !ch.path.length);
          S.drawItem(ctx, set, it, it.x * T, it.y * T, { on, tick, count: data && data.board ? Math.min(6, (data.board.todo || 0) + (data.board.doing || 0)) : 3 });
          if (it.t === 'desk') { const s = seatOf(it); drawables.push({ y: s.y - 0.01, z: 1, f: () => S.drawItem(ctx, set, { t: 'chair' }, s.x * T, s.y * T) }); }
          if (editing && sel === it) { ctx.strokeStyle = '#F26B1D'; ctx.lineWidth = 1 / F.scale; ctx.strokeRect(it.x * T + 0.5, it.y * T + 0.5, T - 1, T - 1); }
        } });
      }
      // run the item pass first so chairs get queued, then sort everything
      const first = drawables.slice(); first.forEach(o => { o.q = true; });
      const queue = [];
      for (const o of first) queue.push(o);
      for (const ch of chars.values()) if (ch.visible) queue.push({ y: ch.y + 0.5, z: 2, f: () => drawChar(ch) });
      queue.sort((a, b) => a.y - b.y || a.z - b.z);
      for (const o of queue) { const n = drawables.length; o.f(); if (drawables.length > n) for (const extra of drawables.slice(n)) { extra.f(); } drawables.length = n; }
      placeLayer();
    }
    function drawChar(ch) {
      const x = ch.x * T, y = ch.y * T - 9, pose = poseOf(ch), d = ch.d, fr = reduce() ? 0 : ch.frame;
      if (d.kind === 'flint') S.drawFlint(ctx, x, y, pose, fr);
      else if (d.kind === 'agent') S.drawAgent(ctx, d.id, d.agentKind, x, y, pose, fr, ch.dir);
      else S.drawPerson(ctx, d.look || S.seedLook(d.id), x, y, pose, fr, ch.dir);
    }
    // Names and bubbles are real text over the canvas, so they stay crisp and translate.
    function placeLayer() {
      if (!F) return;
      const dpr = F.dpr, out = [];
      for (const ch of chars.values()) {
        if (!ch.visible) continue;
        const sx = (F.ox + (ch.x * T + 8) * F.scale) / dpr, sy = (F.oy + (ch.y * T - 9) * F.scale) / dpr;
        const b = ch.d.bubble === 'ask' ? `<span class="os-bubble ask">${esc(tr('Needs your OK'))}</span>` : ch.d.bubble === 'done' ? `<span class="os-bubble done">${esc(tr('Done'))}</span>` : '';
        out.push(`<button type="button" class="os-tag" data-os-who="${esc(ch.d.id)}" data-role="${esc(ch.d.kind)}" style="left:${sx.toFixed(1)}px;top:${sy.toFixed(1)}px">${b}<span class="os-name">${esc(ch.d.name)}</span></button>`);
      }
      const html = out.join('');
      if (layer.__html !== html) { layer.innerHTML = html; layer.__html = html; }
    }
    function paintSr() {
      const sr = root.querySelector('.os-sr'); if (!sr) return;
      sr.innerHTML = everyone().map(d => `<li>${esc(d.name)}: ${esc(d.state === 'off' ? tr('Away from desk') : (d.lines || [])[0] || tr('At their desk'))}</li>`).join('');
    }

    // ---------- the loop: walk along paths, animate, redraw ----------
    function frame(now) {
      if (dead) return;
      raf = 0;
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
      let moving = false;
      if (!reduce()) {
        tick = Math.floor(now / 160);
        for (const ch of chars.values()) {
          ch.frame = tick;
          if (!ch.path.length) { if (ch.target && ch.target.dir != null && !ch.target.leave) ch.dir = ch.target.dir; continue; }
          moving = true;
          const n = ch.path[0], dx = n.x - ch.x, dy = n.y - ch.y, dist = Math.hypot(dx, dy), step = SPEED * dt;
          ch.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 2 : 0);
          if (dist <= step) { ch.x = n.x; ch.y = n.y; ch.path.shift(); if (!ch.path.length && ch.target && ch.target.leave) ch.visible = false; }
          else { ch.x += dx / dist * step; ch.y += dy / dist * step; }
        }
      }
      draw();
      if (!reduce() && document.visibilityState === 'visible' && el.isConnected) raf = requestAnimationFrame(frame);
      else if (moving) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    const ro = new ResizeObserver(() => { if (reduce()) draw(); else kick(); }); ro.observe(stage);

    // ---------- clicks: a character, a desk, or (in the editor) a tile ----------
    function toTile(e) {
      const r = cv.getBoundingClientRect(), dpr = F ? F.dpr : 1;
      const x = ((e.clientX - r.left) * dpr - F.ox) / (F.scale * T), y = ((e.clientY - r.top) * dpr - F.oy) / (F.scale * T);
      return { fx: x, fy: y, x: Math.floor(x), y: Math.floor(y) };
    }
    function hit(p) {
      let best = null;
      for (const ch of chars.values()) if (ch.visible && Math.abs(p.fx - (ch.x + 0.5)) < 0.55 && p.fy > ch.y - 0.7 && p.fy < ch.y + 1) best = ch;
      if (best) return best.d.id;
      const it = at(p.x, p.y);
      if (it && it.t === 'desk') { for (const [id, d] of deskFor()) if (d === it) return id; }
      return null;
    }
    cv.addEventListener('pointerdown', e => {
      if (!F || !layout) return;
      const p = toTile(e);
      if (editing) return editDown(p, e);
      drag = { sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy, moved: false };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (editing) return editMove(toTile(e), e);
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved && view.z > 0) { view.ox = drag.ox + dx; view.oy = drag.oy + dy; draw(); }
    });
    cv.addEventListener('pointerup', e => {
      if (editing) return editUp();
      const was = drag; drag = null;
      if (was && was.moved) return;
      const id = hit(toTile(e)); if (id) openCard(id); else closeCard();
    });
    cv.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    layer.addEventListener('click', e => { const t = e.target.closest('[data-os-who]'); if (t) openCard(t.dataset.osWho); });
    function zoom(k) { view.z = Math.max(0, Math.min(4, view.z + k)); if (!view.z) { view.ox = 0; view.oy = 0; } draw(); }

    // ---------- the card: who, what they're doing, and one click into TribeCode ----------
    const placeText = d => { const P = window.TribePresence; try { if (d.where && P && P.label) return P.label(d.where) || ''; } catch {} return typeof d.where === 'string' ? d.where : ''; };
    function openCard(id) {
      const d = everyone().find(x => x.id === id); if (!d) return;
      cardFor = id; card.hidden = false; lookEl.hidden = true;
      const st = d.state === 'off' ? tr('Offline') : d.state === 'away' ? tr('Away') : d.spot === 'think' ? tr('Thinking') : d.spot === 'board' ? tr('At the task board') : d.spot === 'lounge' ? tr('In the lounge') : tr('At their desk');
      let body = '';
      if (d.kind === 'flint') {
        body = `<p class="faint">${esc(tr('TribeCode\'s own helper. He works with no AI and gets better with one.'))}</p>
          <div class="os-acts"><button class="btn primary sm" data-os-do="flint">${esc(tr('Ask Flint'))}</button><button class="btn sm" data-os-do="next">${esc(tr('What to do next'))}</button><button class="btn sm" data-os-do="design">${esc(tr('Polish a design'))}</button></div>`;
      } else if (d.kind === 'agent') {
        const asks = (d.asks || []).map(a => `<li class="os-ask"><span>${esc(a.title)}</span>${a.canDecide ? `<span class="os-ask-acts"><button class="btn sm ok" data-os-ap="approve" data-id="${esc(a.id)}">${esc(tr('Approve'))}</button><button class="btn sm" data-os-ap="question" data-id="${esc(a.id)}">${esc(tr('Ask for changes'))}</button></span>` : `<em class="faint">${esc(tr('Waiting for an OK'))}</em>`}</li>`).join('');
        body = `<dl class="os-dl">${d.ownerName ? `<dt>${esc(tr('Helps'))}</dt><dd>${esc(d.ownerName)}</dd>` : ''}${d.agentKind ? `<dt>${esc(tr('Tool'))}</dt><dd>${esc(d.agentKind)}</dd>` : ''}${d.task ? `<dt>${esc(tr('Task'))}</dt><dd><button class="linkish" data-os-task="${esc(d.task.id)}">${esc(d.task.title)}</button></dd>` : ''}</dl>
          ${(d.files || []).length ? `<p class="os-sub">${esc(tr('Files it claimed'))}</p><ul class="os-files">${d.files.map(f => `<li><button class="linkish" data-os-file="${esc(f)}">${esc(f)}</button></li>`).join('')}</ul>` : ''}
          ${(d.lines || []).length ? `<p class="os-sub">${esc(tr('Last steps'))}</p><ul class="os-lines">${d.lines.map(l => `<li>${esc(tr(l))}</li>`).join('')}</ul>` : ''}
          ${asks ? `<p class="os-sub">${esc(tr('Asking for your OK'))}</p><ul class="os-asks">${asks}</ul><input class="input sm os-note" maxlength="300" placeholder="${esc(tr('What to change (for Ask for changes)'))}">` : ''}
          <div class="os-acts"><button class="btn sm" data-os-do="dm">${esc(tr('Message it'))}</button>${d.state !== 'off' ? `<button class="btn sm" data-os-do="${d.paused ? 'resume' : 'pause'}">${esc(d.paused ? tr('Resume') : tr('Pause'))}</button>` : ''}<button class="btn sm" data-os-do="agent">${esc(tr('Its page'))}</button></div>`;
      } else {
        const where = placeText(d), mine = (window.TribeTasks && window.TribeTasks.all ? window.TribeTasks.all() : []).filter(t => t.assignee === d.id).slice(-3).reverse();
        body = `${where ? `<p class="os-where"><span class="faint">${esc(tr('Now'))}</span> ${esc(where)} <button class="linkish" data-os-do="open">${esc(tr('Open'))}</button></p>` : ''}
          ${d.task ? `<p class="os-where"><span class="faint">${esc(tr('Task'))}</span> <button class="linkish" data-os-task="${esc(d.task.id)}">${esc(d.task.title)}</button></p>` : ''}
          ${mine.length ? `<p class="os-sub">${esc(tr('Recent work'))}</p><ul class="os-lines">${mine.map(t => `<li><button class="linkish" data-os-task="${esc(t.id)}">${esc(t.title)}</button> <span class="faint">${esc(t.status || '')}</span></li>`).join('')}</ul>` : ''}
          <div class="os-acts">${d.id !== (data && data.me) ? `<button class="btn primary sm" data-os-do="dm">${esc(tr('Message'))}</button><button class="btn sm" data-os-do="call">${esc(tr('Call'))}</button>` : `<button class="btn primary sm" data-os-act="look">${esc(tr('Your look'))}</button>`}<button class="btn sm" data-os-do="profile">${esc(tr('Profile'))}</button></div>
          ${d.id !== (data && data.me) ? `<form class="os-give" data-os-give><input class="input sm" maxlength="140" placeholder="${esc(tr('Give a task…'))}" aria-label="${esc(tr('Give a task'))}"><button class="btn sm">${esc(tr('Give'))}</button></form>` : ''}`;
      }
      card.innerHTML = `<header><span class="os-av" data-role="${esc(d.kind)}">${esc(String(d.name || '?').slice(0, 1).toUpperCase())}</span><div><b>${esc(d.name)}</b><span>${esc(d.kind === 'agent' ? tr('AI helper') : d.kind === 'flint' ? tr('Built-in helper') : tr('Person'))} · ${esc(st)}</span></div><button class="btn sm icon" data-os-close aria-label="${esc(tr('Close'))}">×</button></header>${body}`;
      card.dataset.who = id;
    }
    function closeCard() { card.hidden = true; cardFor = null; }
    async function act(kind, d, btn) {
      const W = window;
      try {
        if (kind === 'dm') { if (W.TribeDM && W.TribeDM.open) await W.TribeDM.open(d.id); return; }
        if (kind === 'call') { if (W.TribeDM && W.TribeDM.open) await W.TribeDM.open(d.id); if (W.TribeHuddle && W.TribeHuddle.join) W.TribeHuddle.join(); return; }
        if (kind === 'profile') { if (W.TribeProfiles && W.TribeProfiles.open) W.TribeProfiles.open(d.id, btn); return; }
        if (kind === 'open') { if (W.TribePresence && W.TribePresence.jump) { const ok = await W.TribePresence.jump(d.id); if (ok === false) toast(tr('You can\'t open that from here.')); } return; }
        if (kind === 'agent') { if (W.TribeShell && W.TribeShell.previewAgent) W.TribeShell.previewAgent(d.id); return; }
        if (kind === 'pause' || kind === 'resume') { await C.api(`/coord/agents/${encodeURIComponent(d.id)}/control`, { method: 'POST', body: { action: kind } }); toast(kind === 'pause' ? tr('Paused') : tr('Resumed')); office.refresh(); return; }
        if (kind === 'flint') { if (W.TribeFlint && W.TribeFlint.open) W.TribeFlint.open(); return; }
        if (kind === 'next') { if (W.TribeShell && W.TribeShell.go) W.TribeShell.go('dashboard'); return; }
        if (kind === 'design') { if (W.TribeDesignFlow && W.TribeDesignFlow.open) W.TribeDesignFlow.open(); else if (W.TribeShell && W.TribeShell.go) W.TribeShell.go('design'); return; }
      } catch (e) { toast(e.message); }
    }
    card.addEventListener('click', async e => {
      const t = e.target.closest('[data-os-close],[data-os-do],[data-os-ap],[data-os-task],[data-os-file],[data-os-act]'); if (!t) return;
      const d = everyone().find(x => x.id === card.dataset.who); if (!d) return;
      if (t.matches('[data-os-close]')) return closeCard();
      if (t.matches('[data-os-act]')) return;   // handled by the bar's listener (Your look)
      if (t.matches('[data-os-task]')) { if (window.TribeTasks && window.TribeTasks.open) window.TribeTasks.open(t.dataset.osTask); return; }
      if (t.matches('[data-os-file]')) { const A = window.TribeApp; if (A && A.show) A.show('code'); setTimeout(() => { if (window.TribeCodeFiles && window.TribeCodeFiles.open) window.TribeCodeFiles.open(t.dataset.osFile); }, 120); return; }
      if (t.matches('[data-os-ap]')) {
        const v = t.dataset.osAp, note = (card.querySelector('.os-note') || {}).value || '';
        if (v === 'question' && !note.trim()) { const n = card.querySelector('.os-note'); if (n) n.focus(); toast(tr('Say what to change first.')); return; }
        try {
          t.disabled = true;
          if (v === 'approve') await C.api(`/approvals/${encodeURIComponent(t.dataset.id)}/approve`, { method: 'POST', body: { note: note.trim() || undefined } });
          else await C.api(`/approvals/${encodeURIComponent(t.dataset.id)}/question`, { method: 'POST', body: { text: note.trim() } });
          toast(v === 'approve' ? tr('Approved') : tr('Sent. It can change it and ask again.'));
          office.refresh();
        } catch (err) { t.disabled = false; toast(err.message); }
        return;
      }
      act(t.dataset.osDo, d, t);
    });
    card.addEventListener('submit', async e => {
      const f = e.target.closest('[data-os-give]'); if (!f) return; e.preventDefault();
      const inp = f.querySelector('input'), title = inp.value.trim(); if (!title) return;
      try { if (window.TribeTasks && window.TribeTasks.create) await window.TribeTasks.create(title, 'todo', { assignee: card.dataset.who }); else await C.api('/tasks', { method: 'POST', body: { title, status: 'todo', assignee: card.dataset.who } }); inp.value = ''; toast(tr('Task given')); office.refresh(); } catch (err) { toast(err.message); }
    });

    // ---------- Your look: the wardrobe ----------
    let draft = null;
    function openLook() {
      closeCard(); edit.hidden = true;
      draft = Object.assign(S.seedLook((data && data.me) || 'me'), (data && data.myLook) || {});
      lookEl.hidden = false; paintLook();
    }
    function paintLook() {
      const row = (k, label, names) => `<div class="os-part"><span>${esc(tr(label))}</span><button class="btn sm icon" data-lk="${k}" data-d="-1" aria-label="${esc(tr('Previous'))}">‹</button><b>${esc(names ? tr(names[draft[k]]) : String(draft[k] + 1))}</b><button class="btn sm icon" data-lk="${k}" data-d="1" aria-label="${esc(tr('Next'))}">›</button></div>`;
      const sw = (k, cols, label) => `<div class="os-sw" role="radiogroup" aria-label="${esc(tr(label))}"><span>${esc(tr(label))}</span>${cols.map((c, i) => `<button class="os-dot${draft[k] === i ? ' on' : ''}" role="radio" aria-checked="${draft[k] === i}" data-lc="${k}" data-i="${i}" style="background:${c}" aria-label="${esc(tr(label))} ${i + 1}"></button>`).join('')}</div>`;
      lookEl.innerHTML = `<header><b>${esc(tr('Your look'))}</b><button class="btn sm icon" data-lk-close aria-label="${esc(tr('Close'))}">×</button></header>
        <div class="os-look-row"><canvas class="os-prev" width="64" height="96" aria-hidden="true"></canvas><div class="os-parts">
          ${row('body', 'Body', S.NAMES.body)}${row('hair', 'Hair', S.NAMES.hair)}${row('top', 'Top', S.NAMES.top)}${row('acc', 'Extra', S.NAMES.acc)}</div></div>
        ${sw('skin', S.SKIN, 'Skin')}${sw('hairColor', S.HAIR, 'Hair colour')}${sw('topColor', S.TOPS(), 'Top colour')}
        <div class="os-acts"><button class="btn primary sm" data-lk-save>${esc(tr('Save my look'))}</button><button class="btn sm" data-lk-random>${esc(tr('Surprise me'))}</button></div>`;
      const pc = lookEl.querySelector('.os-prev').getContext('2d'); pc.imageSmoothingEnabled = false; pc.setTransform(4, 0, 0, 4, 0, 0); pc.clearRect(0, 0, 16, 24); S.drawPerson(pc, draft, 0, 0, 'stand', 0, 0);
    }
    lookEl.addEventListener('click', async e => {
      const t = e.target.closest('[data-lk],[data-lc],[data-lk-close],[data-lk-save],[data-lk-random]'); if (!t) return;
      if (t.matches('[data-lk-close]')) { lookEl.hidden = true; return; }
      if (t.matches('[data-lk]')) { const k = t.dataset.lk, n = S.PARTS[k]; draft[k] = (draft[k] + (+t.dataset.d) + n) % n; return paintLook(); }
      if (t.matches('[data-lc]')) { draft[t.dataset.lc] = +t.dataset.i; return paintLook(); }
      if (t.matches('[data-lk-random]')) { draft = S.seedLook(Math.random().toString(36)); return paintLook(); }
      if (t.matches('[data-lk-save]')) {
        try { const r = await C.api('/office/look', { method: 'PUT', body: { look: draft } }); if (data) data.myLook = r.look; toast(tr('Look saved')); lookEl.hidden = true; office.refresh(); } catch (err) { toast(err.message); }
      }
    });

    // ---------- the layout editor (host or admin) ----------
    const TOOLS = [['move', 'Move'], ['rotate', 'Turn'], ['erase', 'Remove'], ['floor', 'Floor'], ['wall', 'Wall'], ['carpet', 'Carpet'], ['wood', 'Wood'], ['tile', 'Tiles'],
      ['desk', 'Desk'], ['plant', 'Plant'], ['sofa', 'Sofa'], ['think', 'Thinking seat'], ['coffee', 'Coffee'], ['table', 'Table'], ['shelf', 'Shelf'], ['lamp', 'Lamp'], ['rug', 'Rug'], ['board', 'Task board'], ['area', 'Name an area']];
    const TILE_TOOLS = new Set(['floor', 'wall', 'carpet', 'wood', 'tile']);
    let before = null, areaStart = null;
    function openEdit() {
      if (!data || !data.canSet) return;
      closeCard(); lookEl.hidden = true;
      before = JSON.stringify(layout); editing = true; tool = 'move'; sel = null;
      edit.hidden = false; root.classList.add('editing'); paintEdit(); draw();
    }
    function paintEdit() {
      const people = everyone().filter(d => d.kind !== 'flint');
      edit.innerHTML = `<header><b>${esc(tr('Edit layout'))}</b></header>
        <div class="os-tools" role="toolbar">${TOOLS.map(([k, l]) => `<button class="btn sm${tool === k ? ' on' : ''}" data-tool="${k}" aria-pressed="${tool === k}">${esc(tr(l))}</button>`).join('')}</div>
        ${sel && sel.t === 'desk' ? `<label class="os-assign"><span>${esc(tr('This desk is for'))}</span><select class="input sm" data-assign><option value="">${esc(tr('Anyone'))}</option>${people.map(p => `<option value="${esc(p.id)}"${sel.who === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
        <form class="os-area" data-area hidden><input class="input sm" maxlength="32" placeholder="${esc(tr('Area name, e.g. Lounge'))}"><button class="btn sm">${esc(tr('Name it'))}</button></form>
        <p class="faint os-hint">${esc(tr(tool === 'area' ? 'Drag over the floor, then name the area.' : TILE_TOOLS.has(tool) ? 'Click or drag to paint.' : tool === 'move' ? 'Drag a piece to move it. Click a desk to choose who sits there.' : tool === 'rotate' ? 'Click a piece to turn it.' : tool === 'erase' ? 'Click a piece to remove it.' : 'Click an empty spot to place it.'))}</p>
        <div class="os-acts"><button class="btn primary sm" data-ed="save">${esc(tr('Save layout'))}</button><button class="btn sm" data-ed="cancel">${esc(tr('Cancel'))}</button></div>
        <div class="os-acts"><button class="btn sm" data-ed="reset">${esc(tr('Back to the default'))}</button><button class="btn sm" data-ed="export">${esc(tr('Export'))}</button><label class="btn sm os-import">${esc(tr('Import'))}<input type="file" accept="application/json,.json" data-ed-import hidden></label></div>`;
    }
    function editDown(p, e) {
      if (!inside(p.x, p.y)) return;
      cv.setPointerCapture(e.pointerId);
      if (TILE_TOOLS.has(tool)) { layout.tiles[p.y * layout.w + p.x] = tool; drag = { paint: true }; draw(); return; }
      const it = at(p.x, p.y) || layout.items.find(i => i.x === p.x && i.y === p.y);
      if (tool === 'area') { areaStart = p; drag = { area: true, a: p, b: p }; return; }
      if (tool === 'move') { sel = it || null; drag = it ? { item: it } : null; paintEdit(); draw(); return; }
      if (tool === 'rotate') { if (it) { it.r = ((it.r || 0) + 1) % 4; sel = it; } draw(); return; }
      if (tool === 'erase') { if (it) { layout.items = layout.items.filter(i => i !== it); sel = null; } draw(); return; }
      if (!it && tileAt(p.x, p.y) !== 'wall' || tool === 'board') { const n = { t: tool, x: p.x, y: p.y, r: 0 }; layout.items.push(n); sel = n; paintEdit(); draw(); }
    }
    function editMove(p) {
      if (!drag || !inside(p.x, p.y)) return;
      if (drag.paint && TILE_TOOLS.has(tool)) { layout.tiles[p.y * layout.w + p.x] = tool; draw(); }
      if (drag.item) { drag.item.x = p.x; drag.item.y = p.y; draw(); }
      if (drag.area) { drag.b = p; draw(); }
    }
    function editUp() {
      if (drag && drag.area) {
        const a = drag.a, b = drag.b; drag = null;
        const f = edit.querySelector('[data-area]'); f.hidden = false; f.dataset.rect = JSON.stringify({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 }); f.querySelector('input').focus();
        return;
      }
      drag = null;
    }
    edit.addEventListener('click', async e => {
      const t = e.target.closest('[data-tool],[data-ed]'); if (!t) return;
      if (t.dataset.tool) { tool = t.dataset.tool; paintEdit(); return; }
      const k = t.dataset.ed;
      if (k === 'cancel') { layout = JSON.parse(before); stopEdit(); return; }
      if (k === 'reset') { if (!confirm(tr('Put back the default floor? Your layout changes go away.'))) return; await saveLayout(null); stopEdit(); return; }
      if (k === 'export') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(layout, null, 1)], { type: 'application/json' })); a.download = 'office-space-layout.json'; document.body.appendChild(a); a.click(); a.remove(); return; }
      if (k === 'save') { await saveLayout(layout); stopEdit(); }
    });
    edit.addEventListener('change', async e => {
      if (e.target.matches('[data-assign]') && sel) { if (e.target.value) { layout.items.forEach(i => { if (i !== sel && i.who === e.target.value) delete i.who; }); sel.who = e.target.value; } else delete sel.who; draw(); }
      if (e.target.matches('[data-ed-import]')) {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        try { const L = JSON.parse(await f.text()); if (!L || !Array.isArray(L.tiles) || !Array.isArray(L.items)) throw new Error(tr('That file is not an Office Space layout.')); layout = L; normalise(); draw(); toast(tr('Imported. Save to keep it.')); } catch (err) { toast(err.message); }
      }
    });
    edit.addEventListener('submit', e => {
      const f = e.target.closest('[data-area]'); if (!f) return; e.preventDefault();
      const name = f.querySelector('input').value.trim(); if (!name) return;
      layout.areas = (layout.areas || []).concat([{ name, ...JSON.parse(f.dataset.rect || '{}') }]).slice(-12); f.hidden = true; f.querySelector('input').value = ''; draw();
    });
    async function saveLayout(L) {
      try { const r = await C.api('/office', { method: 'PUT', body: { layout: L } }); if (data) data.layout = r.layout; layout = r.layout ? JSON.parse(JSON.stringify(r.layout)) : S.defaultLayout(everyone().length); normalise(); toast(L ? tr('Layout saved') : tr('Back to the default floor')); office.refresh(); }
      catch (err) { toast(err.message); }
    }
    function stopEdit() { editing = false; sel = null; edit.hidden = true; root.classList.remove('editing'); sync(); draw(); }
    // More people than desks: add desks on free floor (only on screen; saving keeps them).
    function normalise() {
      const need = everyone().filter(d => d.kind !== 'flint').length;
      let have = deskItems().length;
      for (let y = 2; y < layout.h - 2 && have < need; y += 3) for (let x = 2; x < layout.w - 2 && have < need; x += 3) {
        if (walk(x, y) && walk(x, y + 1) && !at(x, y)) { layout.items.push({ t: 'desk', x, y, r: 0 }); have++; }
      }
    }

    // ---------- the bar ----------
    root.querySelector('.os-bar').addEventListener('click', e => {
      const t = e.target.closest('[data-os-act]'); if (!t) return;
      const k = t.dataset.osAct;
      if (k === 'look') return openLook();
      if (k === 'edit') return editing ? null : openEdit();
      if (k === 'in') return zoom(1);
      if (k === 'out') return zoom(-1);
    });
    card.addEventListener('click', e => { if (e.target.closest('[data-os-act="look"]')) openLook(); });
    root.querySelector('[data-os-set]').addEventListener('change', async e => {
      try { await C.api('/office', { method: 'PUT', body: { set: e.target.value } }); set = S.get(e.target.value); draw(); toast(tr('Set changed')); office.refresh(); } catch (err) { toast(err.message); }
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!lookEl.hidden) lookEl.hidden = true; else if (!card.hidden) closeCard(); else if (editing) { layout = JSON.parse(before); stopEdit(); } }
      if (editing && sel && (e.key === 'r' || e.key === 'R')) { sel.r = ((sel.r || 0) + 1) % 4; draw(); }
      if (editing && sel && (e.key === 'Delete' || e.key === 'Backspace') && !/input|select|textarea/i.test(e.target.tagName)) { layout.items = layout.items.filter(i => i !== sel); sel = null; draw(); }
    });

    function update(d) {
      data = d;
      if (!editing) {
        const L = d && d.layout ? JSON.parse(JSON.stringify(d.layout)) : null;
        const sig = JSON.stringify(L);
        if (!layout || root.__lsig !== sig) { layout = L || S.defaultLayout(everyone().length); root.__lsig = sig; }
        normalise();
      }
      set = S.get(d && d.set);
      const sb = root.querySelector('.os-set'), sel2 = root.querySelector('[data-os-set]');
      sb.hidden = !(d && d.canSet); root.querySelector('[data-os-act="edit"]').hidden = !(d && d.canSet);
      if (sel2 && !sel2.options.length) sel2.innerHTML = S.list().map(s => `<option value="${esc(s.id)}">${esc(tr(s.name))}</option>`).join('');
      if (sel2) sel2.value = set.id;
      root.querySelector('[data-os-act="look"]').hidden = !(d && d.me) || ((d.desks || []).find(x => x.id === d.me) || {}).kind === 'agent';
      sync();
      if (cardFor) { const keep = cardFor; if (everyone().some(x => x.id === keep)) openCard(keep); else closeCard(); }
      if (reduce()) draw(); else kick();
    }
    return {
      update,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); ro.disconnect(); },
      chars: () => [...chars.values()].map(c => ({ id: c.d.id, x: c.x, y: c.y, pose: poseOf(c), visible: c.visible, moving: !!c.path.length, bubble: c.d.bubble || null })),
      layout: () => layout,
    };
  }

  window.TribeOfficeSpace = { mount };
})();
