// Office Space (pass 11b): the office as a Pixel Agents style floor. Every person, AI helper and Flint is a character who
// walks to their desk, sits and types while writing, reads while reading, goes to the whiteboard when they hand work in,
// sits in the lounge while idle, and leaves by the door when they go offline. A speech bubble says when an agent needs your
// OK or someone just finished. Click anyone for their card, with the actions TribeCode already has (DM, call, give a task,
// open what they're editing, approve an agent's ask, pause it).
// Data: TribeOffice (server/office.js). Art: TribeOfficeArt (Pixel Agents' art, MIT, (c) 2026 Pablo De Lucca; character
// parts based on JIK-A-4's Metro City, CC0). Depth sorting, seats facing desks and the sprite timings follow Pixel Agents,
// ported to plain JavaScript; path finding, the card, the wardrobe and the editor are TribeCode's.
//   window.TribeOfficeSpace = { mount(el, office) -> { update(data), destroy() } }
(function () {
  'use strict';
  const S = window.TribeOfficeSets, A = window.TribeOfficeArt, C = window.TribeClient; if (!S || !A || !C) return;
  const T = 16;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPEED = 3;            // tiles a second (48 px/s, as in Pixel Agents)
  const WALK = [0, 1, 2, 1];  // walk1 walk2 walk3 walk2, 0.15 s each
  const SIT_PX = 6;           // seated characters sit 6 px lower, into the chair
  // dir: 0 down, 1 up, 2 right, 3 left (the sheet's rows; left is the right row mirrored)
  const STEP = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const LS_SOUND = 'tribecode.officespace.sound';
  const soundOn = () => { try { return localStorage.getItem(LS_SOUND) === '1'; } catch { return false; } };
  let actx = null;
  function chime() {
    if (!soundOn()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.12;
        o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.32); });
    } catch {}
  }
  // AI helpers wear the Teal shirt, a lanyard and a cap in their tool's colour (swatch numbers from wardrobe.json).
  const CAP = { claude: 3, cursor: 15, codex: 6, gemini: 12, qwen: 13 };
  function agentLook(id, kind) {
    const L = S.seedLook('agent:' + id);
    return { ...L, top: 1, topColor: 8, pants: 0, pantsColor: 11, full: 0, jacket: 0, hat: 3, hatColor: CAP[String(kind || '').toLowerCase()] ?? 8, acc: 6, accColor: 5, beard: 0 };
  }
  const bubbleUrl = {};
  const bubbleSrc = k => { if (bubbleUrl[k]) return bubbleUrl[k]; const c = A.bubble(k); if (!c) return ''; try { bubbleUrl[k] = c.toDataURL(); } catch { return ''; } return bubbleUrl[k]; };

  // o.bar === false: the page draws its own toolbar (Agents & office, agentsoffice.js) and calls act(k) / info();
  // o.fill: the floor fills its box (no aspect ratio of its own, no frame), still at whole-pixel zoom, centred.
  function mount(el, office, o = {}) {
    let data = null, layout = null, set = S.get('office'), raf = 0, last = 0, dead = false, view = { z: 0, ox: 0, oy: 0 };
    let editing = null, tool = 'move', sel = null, drag = null, cardFor = null, booted = false, artOk = false, geo = null, clock = 0;
    const chars = new Map();   // id -> { d, x, y (tile, float), path, dir, t, visible, target }
    const pets = [];
    el.innerHTML = `<div class="os${o.fill ? ' os-fill' : ''}" data-os>
      <div class="os-bar"${o.bar === false ? ' hidden' : ''}>
        <span class="os-gap"></span>
        <button class="btn sm" data-os-act="look">${esc(tr('Your look'))}</button>
        <label class="os-set" hidden><span class="sr-only">${esc(tr('Set'))}</span><select class="input sm" data-os-set></select></label>
        <button class="btn sm" data-os-act="edit" hidden>${esc(tr('Edit layout'))}</button>
        <button class="btn sm" data-os-act="sound" aria-pressed="${soundOn()}">${esc(soundOn() ? tr('Sound on') : tr('Sound off'))}</button>
        <span class="os-zoom"><button class="btn sm icon" data-os-act="out" aria-label="${esc(tr('Zoom out'))}">−</button><button class="btn sm icon" data-os-act="in" aria-label="${esc(tr('Zoom in'))}">+</button></span>
      </div>
      <div class="os-stage"><canvas class="os-canvas" role="img" aria-label="${esc(tr('Office Space: everyone at their desks'))}"></canvas><div class="os-layer" aria-live="polite"></div>
        <aside class="os-card" hidden></aside><aside class="os-edit" hidden></aside><aside class="os-look" hidden></aside></div>
      <ul class="sr-only os-sr"></ul>
    </div>`;
    const root = el.querySelector('[data-os]'), cv = root.querySelector('canvas'), ctx = cv.getContext('2d'), layer = root.querySelector('.os-layer');
    const stage = root.querySelector('.os-stage'), card = root.querySelector('.os-card'), edit = root.querySelector('.os-edit'), lookEl = root.querySelector('.os-look');

    // ---------- the layout: what stands where, which tiles are free, the seats and the spots ----------
    const sz = it => A.size(it.t, it.r) || { fw: 1, fh: 1, w: 16, h: 16, bg: 0, cat: 'misc' };
    const tileAt = (x, y) => layout.tiles[y * layout.w + x];
    const inside = (x, y) => x >= 0 && y >= 0 && x < layout.w && y < layout.h;
    const covers = (it, x, y) => { const s = sz(it); return x >= it.x && x < it.x + s.fw && y >= it.y && y < it.y + s.fh; };
    function rebuild() {
      const w = layout.w, h = layout.h, block = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) if (layout.tiles[i] === 'wall' || layout.tiles[i] === 'void') block[i] = 1;
      for (const it of layout.items) {
        const s = sz(it); if (s.wall || s.surface) continue;
        for (let dy = s.bg; dy < s.fh; dy++) for (let dx = 0; dx < s.fw; dx++) if (inside(it.x + dx, it.y + dy)) block[(it.y + dy) * w + it.x + dx] = 1;
      }
      const tableAt = (x, y) => layout.items.find(o => { const s = sz(o); return !s.wall && (s.cat === 'desks' || s.cat === 'electronics') && covers(o, x, y); });
      const pcAt = (x, y) => layout.items.find(o => sz(o).cat === 'electronics' && covers(o, x, y));
      const seats = [];
      for (const it of layout.items) {
        const s = sz(it); if (s.cat !== 'chairs') continue;
        const views = Object.keys((A.cat()[it.t] || {}).views || {}).length;
        for (let dy = s.bg; dy < s.fh; dy++) for (let dx = 0; dx < s.fw; dx++) {
          const x = it.x + dx, y = it.y + dy; if (!inside(x, y)) continue;
          // a chair with views faces its turn; a stool faces the desk next to it
          let dir = views > 1 ? [0, 2, 1, 3][it.r | 0] : -1;
          if (dir < 0) { dir = [1, 0, 2, 3].find(k => tableAt(x + STEP[k][0], y + STEP[k][1])); if (dir == null) dir = 0; }
          const fx = x + STEP[dir][0], fy = y + STEP[dir][1];
          // a work seat faces a computer (on the desk in front, or one tile further); a sofa by the coffee table does not
          const pc = tableAt(fx, fy) ? (pcAt(fx, fy) || pcAt(fx + STEP[dir][0], fy + STEP[dir][1]) || null) : null;
          seats.push({ x, y, dir, item: it, desk: !!pc, pc, sofa: it.t === 'SOFA' });
        }
      }
      seats.sort((a, b) => a.y - b.y || a.x - b.x);   // the front desks fill first
      geo = { block, seats };
    }
    const walk = (x, y) => inside(x, y) && geo && !geo.block[y * layout.w + x];
    const deskSeats = () => geo.seats.filter(s => s.desk);
    function door() {
      for (let y = layout.h - 1; y >= 0; y--) {
        let best = null;
        for (let x = 0; x < layout.w; x++) if (walk(x, y) && (!best || Math.abs(x - layout.w / 2) < Math.abs(best.x - layout.w / 2))) best = { x, y };
        if (best) return best;
      }
      return { x: 1, y: 1 };
    }
    // Spots in front of a kind of thing (its free neighbours, facing it); wall pieces: the floor right under them.
    function spotsNear(test) {
      const out = [];
      for (const it of layout.items.filter(test)) {
        const s = sz(it);
        if (s.wall) { for (let dx = 0; dx < s.fw; dx++) { const x = it.x + dx, y = it.y + s.fh; if (walk(x, y)) out.push({ x, y, dir: 1 }); } continue; }
        for (let dy = 0; dy < s.fh; dy++) for (let dx = 0; dx < s.fw; dx++) for (let k = 0; k < 4; k++) {
          const x = it.x + dx - STEP[k][0], y = it.y + dy - STEP[k][1];
          if (walk(x, y) && !covers(it, x, y) && !out.some(o => o.x === x && o.y === y)) out.push({ x, y, dir: k });
        }
      }
      return out;
    }
    const everyone = () => {
      const list = ((data && data.desks) || []).slice();
      list.push({ id: 'flint', name: 'Flint', kind: 'flint', state: 'active', spot: 'desk', lines: [] });
      return list;
    };
    function deskFor() {
      const out = new Map(), seats = deskSeats(), list = everyone().filter(d => d.kind !== 'flint'), taken = new Set();
      for (const s of seats) if (s.item.who && list.some(p => p.id === s.item.who) && !out.has(s.item.who)) { out.set(s.item.who, s); taken.add(s); }
      for (const p of list) if (!out.has(p.id)) { const s = seats.find(x => !taken.has(x) && !x.item.who); if (s) { out.set(p.id, s); taken.add(s); } }
      return out;
    }
    function targetOf(d, desks, used) {
      if (d.state === 'off') return { ...door(), leave: true };
      const free = list => list.find(p => !used.has(p.x + ',' + p.y)) || null;
      const lounge = () => { const s = free(geo.seats.filter(x => x.sofa)) || free(geo.seats.filter(x => !x.desk)); return s ? { x: s.x, y: s.y, dir: s.dir, sit: true } : null; };
      const desk = desks.get(d.id), atDesk = desk ? { x: desk.x, y: desk.y, dir: desk.dir, sit: true, desk: true, seat: desk } : null;
      if (d.id === 'flint') return free(spotsNear(i => i.t === 'COFFEE')) || free(spotsNear(i => sz(i).cat === 'decor')) || door();
      if (d.spot === 'board') return free(spotsNear(i => i.t === 'WHITEBOARD')) || atDesk || lounge() || door();
      if (d.spot === 'think') return free(spotsNear(i => /BOOKSHELF/.test(i.t))) || lounge() || atDesk || door();
      if (d.spot === 'lounge' || d.state === 'away') return lounge() || atDesk || door();
      if (atDesk) return atDesk;
      return lounge() || door();
    }
    // Breadth-first search over the floor (four directions). Floors are at most 40x28.
    function route(from, to) {
      const sx = Math.round(from.x), sy = Math.round(from.y), key = (x, y) => y * layout.w + x;
      if (sx === to.x && sy === to.y) return [];
      const prev = new Map([[key(sx, sy), -1]]), q = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = key(nx, ny);
          if (!inside(nx, ny) || prev.has(k)) continue;
          const goal = nx === to.x && ny === to.y;
          if (!goal && !walk(nx, ny)) continue;
          prev.set(k, key(x, y));
          if (goal) { const out = []; let c = k; while (c !== key(sx, sy)) { out.unshift({ x: c % layout.w, y: Math.floor(c / layout.w) }); c = prev.get(c); } return out; }
          q.push([nx, ny]);
        }
      }
      return [{ x: to.x, y: to.y }];   // no way through: step straight there
    }

    // ---------- the characters follow the data ----------
    function sync() {
      if (!geo) return;
      const desks = deskFor(), used = new Set(), list = everyone();
      for (const d of list) {
        let ch = chars.get(d.id);
        const tgt = targetOf(d, desks, used); used.add(tgt.x + ',' + tgt.y);
        if (!ch) { const st = d.state === 'off' || reduce() || !booted ? tgt : door(); ch = { d, x: st.x, y: st.y, path: [], dir: st.dir || 0, t: Math.random() * 2, visible: d.state !== 'off', target: null }; chars.set(d.id, ch); }
        ch.d = d;
        if (!ch.target || ch.target.x !== tgt.x || ch.target.y !== tgt.y || ch.target.leave !== tgt.leave) {
          ch.target = tgt;
          if (d.state !== 'off') ch.visible = true;
          if (reduce()) { ch.x = tgt.x; ch.y = tgt.y; ch.path = []; if (tgt.dir != null) ch.dir = tgt.dir; if (tgt.leave) ch.visible = false; }
          else ch.path = route({ x: ch.x, y: ch.y }, tgt);
        } else ch.target = tgt;
      }
      for (const id of [...chars.keys()]) if (!list.some(d => d.id === id)) chars.delete(id);
      if (!pets.length && artOk) {
        const spots = [door(), ...geo.seats.filter(s => s.sofa)].map(s => ({ x: s.x, y: s.y }));
        ['claudio', 'gitcat'].forEach((name, i) => { const f = freeTile(4 + i * 6) || spots[0]; if (f) pets.push({ name, x: f.x, y: f.y, path: [], dir: 0, t: i, wait: 2 + i * 3, heart: 0 }); });
      }
      booted = true;
      paintSr();
    }
    function poseOf(ch) {
      if (ch.path.length) return 'walk';
      const d = ch.d, t = ch.target || {};
      if (d.kind === 'flint') return 'stand';
      if (t.desk && d.state === 'active' && !d.paused) return d.kind === 'agent' ? (d.act === 'read' ? 'read' : d.act === 'type' || (d.files || []).length || d.task ? 'type' : 'sit') : (d.where ? 'type' : 'sit');
      if (t.sit) return 'sit';
      return 'stand';
    }
    const colOf = (pose, t) => reduce() ? ({ walk: 1, type: 3, read: 5, sit: 7, stand: 1 }[pose]) :
      pose === 'walk' ? WALK[Math.floor(t / 0.15) % 4] : pose === 'type' ? 3 + Math.floor(t / 0.3) % 2 : pose === 'read' ? 5 + Math.floor(t / 0.6) % 2 : pose === 'sit' ? 7 : 1;
    const lookOf = d => d.kind === 'agent' ? agentLook(d.id, d.agentKind) : Object.assign(S.seedLook(d.id), d.look || {});

    // ---------- drawing ----------
    function fit() {
      const r = stage.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
      if (o.fill) {   // the floor fills its box: the camera picks the zoom and where to look (camera()), the art reaches the edges (hall())
        if (!cam || cam.w !== cv.width || cam.h !== cv.height) cam = camera(cv.width, cv.height);
        const scale = Math.max(0.25, cam.s + view.z), W = layout.w * T * scale, H = layout.h * T * scale;
        const at = (v, size, f) => (size <= v ? (v - size) / 2 : Math.min(0, Math.max(v - size, v / 2 - f * scale)));
        return { scale, ox: Math.round(at(cv.width, W, cam.fx) + view.ox * dpr), oy: Math.round(at(cv.height, H, cam.fy) + view.oy * dpr), dpr };
      }
      // whole device pixels (the art stays crisp); quarter steps only when the floor would not fit at 1x
      const fitS = Math.min(r.width / (layout.w * T), r.height / (layout.h * T)) * dpr;
      const base = fitS >= 1 ? Math.floor(fitS) : Math.max(0.25, Math.floor(fitS * 4) / 4);
      const scale = Math.max(0.25, base + view.z);
      const W = layout.w * T * scale, H = layout.h * T * scale;
      const ox = Math.round((cv.width - W) / 2 + view.ox * dpr), oy = Math.round((cv.height - H) / 2 + view.oy * dpr);
      return { scale, ox, oy, dpr };
    }
    // Fill mode: the largest whole-pixel zoom at which the whole office fits the box, centred; more building is drawn
    // around it (hall()), so the art reaches every edge and there are no dark bands. Below 2x a small box gets 2x when
    // everyone (with their name tags) still fits, looking at the middle of where people are.
    let cam = null;
    function camera(vw, vh) {
      const fitS = Math.min(vw / (layout.w * T), vh / (layout.h * T));
      let s = fitS >= 1 ? Math.floor(fitS) : Math.max(0.25, Math.floor(fitS * 4) / 4);
      let fx = layout.w * T / 2, fy = layout.h * T / 2;
      const pts = [...chars.values()].filter(c => c.visible).map(c => c.target || c);
      if (s < 2 && fitS >= 1.5 && pts.length) {
        const px0 = Math.min(...pts.map(p => p.x)) - 1, px1 = Math.max(...pts.map(p => p.x)) + 2, py0 = Math.min(...pts.map(p => p.y)) - 2.5, py1 = Math.max(...pts.map(p => p.y)) + 1.5;
        if ((px1 - px0) * T * 2 <= vw && (py1 - py0) * T * 2 <= vh) { s = 2; fx = (px0 + px1) / 2 * T; fy = (py0 + py1) / 2 * T; }
      }
      return { s, fx, fy, w: vw, h: vh };
    }
    // More building around the office: the hall floor outside it and in its empty (void) tiles
    function hall() {
      const sc = F.scale * T, x0 = Math.floor(-F.ox / sc) - 1, x1 = Math.ceil((cv.width - F.ox) / sc) + 1, y0 = Math.floor(-F.oy / sc) - 1, y1 = Math.ceil((cv.height - F.oy) / sc) + 1;
      const f = set.palette.floor || {}, img = A.floor(S.floorOf('stone'), A.cvOf(typeof f === 'object' ? { ...f, b: (+f.b || 0) - 28 } : f));
      if (!img) return;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!inside(x, y) || tileAt(x, y) === 'void') ctx.drawImage(img, x * T, y * T);
    }
    let F = null;
    const pal = k => A.cvOf(set.palette[k]);
    function wallMask(x, y) { const isW = (a, b) => inside(a, b) && tileAt(a, b) === 'wall'; return (isW(x, y - 1) ? 1 : 0) | (isW(x + 1, y) ? 2 : 0) | (isW(x, y + 1) ? 4 : 0) | (isW(x - 1, y) ? 8 : 0); }
    function draw() {
      if (!layout) return;
      F = fit();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = typeof set.palette.void === 'string' ? set.palette.void : '#12151A'; ctx.fillRect(0, 0, cv.width, cv.height);
      if (!artOk || !geo) { placeLayer(); return; }
      ctx.setTransform(F.scale, 0, 0, F.scale, F.ox, F.oy); ctx.imageSmoothingEnabled = false;
      if (o.fill) hall();
      // floors, then carpets over them (marching squares on the corners between tiles)
      for (let y = 0; y < layout.h; y++) for (let x = 0; x < layout.w; x++) {
        const k = tileAt(x, y); if (k === 'void' || k === 'wall') continue;
        const img = A.floor(S.floorOf(k), pal(k === 'carpet' ? 'floor' : k)); if (img) ctx.drawImage(img, x * T, y * T);
      }
      const isC = (x, y) => inside(x, y) && tileAt(x, y) === 'carpet';
      for (let jy = 0; jy <= layout.h; jy++) for (let jx = 0; jx <= layout.w; jx++) {
        const c = (isC(jx - 1, jy - 1) ? 1 : 0) | (isC(jx, jy - 1) ? 2 : 0) | (isC(jx, jy) ? 4 : 0) | (isC(jx - 1, jy) ? 8 : 0);
        if (c) { const img = A.carpet(0, c, pal('carpet')); if (img) ctx.drawImage(img, jx * T - 8, jy * T - 8); }
      }
      if (editing) for (const a of layout.areas || []) { ctx.strokeStyle = 'rgba(232,225,211,0.45)'; ctx.lineWidth = 1 / F.scale; ctx.strokeRect(a.x * T + 0.5, a.y * T + 0.5, a.w * T - 1, a.h * T - 1); }
      // everything that stands, sorted by its base (Pixel Agents' zY rules)
      const Z = [];
      for (let y = 0; y < layout.h; y++) for (let x = 0; x < layout.w; x++) if (tileAt(x, y) === 'wall') { const img = A.wall(wallMask(x, y), pal('wall')); if (img) Z.push({ z: (y + 1) * T, f: () => ctx.drawImage(img, x * T, y * T - T) }); }
      const desks = deskFor(), working = new Set();
      for (const [id, s] of desks) { const ch = chars.get(id); if (s.pc && ch && ch.visible && !ch.path.length && ch.target && ch.target.desk && /type|read/.test(poseOf(ch))) working.add(s.pc); }
      const tops = layout.items.filter(o => { const s = sz(o); return !s.wall && s.cat === 'desks'; });
      for (const it of layout.items) {
        const s = sz(it), own = set.sprites[it.t];
        const on = working.has(it), img = own ? null : A.furn(it.t, it.r, { on, frame: reduce() ? 0 : Math.floor(clock / 0.25) });
        if (!img && !own) continue;
        let z = it.y * T + s.h;
        if (s.cat === 'chairs') z = (it.r | 0) === 2 ? (it.y + s.fh) * T + 1 : (it.y + 1) * T;
        if (s.surface) { const under = tops.find(o => covers(o, it.x, it.y + s.fh - 1)); if (under) z = under.y * T + sz(under).h + 0.5; }
        if (s.wall) z += 0.25;
        Z.push({ z, f: () => {
          if (own && own.img.complete && own.img.naturalWidth) ctx.drawImage(own.img, it.x * T, it.y * T, own.w * T, own.h * T); else if (img) ctx.drawImage(img, it.x * T, it.y * T);
          if (editing && sel === it) { ctx.strokeStyle = '#F26B1D'; ctx.lineWidth = 1 / F.scale; ctx.strokeRect(it.x * T + 0.5, it.y * T + 0.5, s.fw * T - 1, s.fh * T - 1); }
        } });
      }
      for (const ch of chars.values()) {
        if (!ch.visible) continue;
        const px = Math.round(ch.x * T + 8), py = Math.round(ch.y * T + 8), pose = poseOf(ch);
        if (ch.d.kind === 'flint') { const hov = reduce() ? 0 : Math.round(Math.sin(clock * 3) * 1.5) + 2, img = A.flint(reduce() ? 0 : Math.floor(clock / 0.2)); Z.push({ z: py + 8.5, f: () => { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px - 3, py - 1, 6, 1); ctx.drawImage(img, px - 5, py - 15 - hov); } }); continue; }
        const sh = A.sheet(lookOf(ch.d), () => kick());
        const off = /type|read|sit/.test(pose) && ch.target && ch.target.sit && !ch.path.length ? SIT_PX : 0;
        Z.push({ z: py + 8.5, f: () => A.drawSheet(ctx, sh, ch.dir, colOf(pose, ch.t), px, py + off) });
      }
      for (const p of pets) {
        const px = Math.round(p.x * T + 8), py = Math.round(p.y * T + 8), sh = A.pet(p.name);
        const col = p.path.length && !reduce() ? [0, 1, 0, 2][Math.floor(p.t / 0.15) % 4] : (p.dir < 2 && !reduce() ? 3 + [0, 1, 2, 1][Math.floor(p.t / 0.3) % 4] : 0);
        Z.push({ z: py + 8.4, f: () => { A.drawPet(ctx, sh, p.dir, col, px, py + 4); if (p.heart > 0) { const b = A.bubble('heart'); if (b) ctx.drawImage(b, px - 5, py - 22); } } });
      }
      Z.sort((a, b) => a.z - b.z);
      for (const o of Z) o.f();
      placeLayer();
    }
    // Names and bubbles are real elements over the canvas: names stay crisp and translate; the bubble is Pixel Agents' art.
    function headOf(ch) {
      const pose = poseOf(ch), off = /type|read|sit/.test(pose) && ch.target && ch.target.sit && !ch.path.length ? SIT_PX : 0;
      const top = ch.d.kind === 'flint' ? ch.y * T + 8 - 18 : ch.y * T + 8 - 32 + off + 2;
      return { x: (F.ox + (ch.x * T + 8) * F.scale) / F.dpr, y: (F.oy + top * F.scale) / F.dpr };
    }
    // Name tags: a pixel plate over each head (officespace.css): square, notched corners and a one-art-pixel outline at
    // the floor's zoom (--px), the role as a colour notch (an AI helper's tool, Flint's flame, a person's presence),
    // "Claude" with "Camp's" small for AI helpers, a pixel pointer to the head; tags never overlap (nudged up).
    function placeLayer() {
      if (!F) return;
      const px = Math.max(1, F.scale / F.dpr);
      if (layer.__px !== px) { layer.style.setProperty('--px', px.toFixed(2) + 'px'); layer.__px = px; }
      const out = [], bw = Math.max(11, Math.round(11 * F.scale / F.dpr));
      for (const ch of chars.values()) {
        if (!ch.visible) continue;
        const h = headOf(ch), kind = ch.d.bubble === 'ask' ? 'ask' : ch.d.bubble === 'done' ? 'done' : '';
        const src = kind && artOk ? bubbleSrc(kind) : '';
        const b = kind ? `<span class="os-bubble ${kind}">${src ? `<img class="os-bub" src="${src}" alt="" style="width:${bw}px">` : ''}<span class="os-bubble-t">${esc(tr(kind === 'ask' ? 'Needs your OK' : 'Done'))}</span></span>` : '';
        const [main, owner] = String(ch.d.name || '').split(' · ');
        const sub = ch.d.kind === 'agent' && owner ? `${owner.split(' ')[0]}'s` : '';
        const tool = ch.d.kind === 'agent' ? String(ch.d.agentKind || 'other').toLowerCase().replace(/[^a-z]/g, '') : '';
        const typing = /type/.test(poseOf(ch)) && !ch.path.length;
        out.push(`<button type="button" class="os-tag" data-os-who="${esc(ch.d.id)}" data-role="${esc(ch.d.kind)}"${tool ? ` data-tool="${esc(tool)}"` : ''} data-state="${esc(ch.d.state || 'active')}"${typing ? ' data-typing="1"' : ''} style="left:${h.x.toFixed(1)}px;top:${h.y.toFixed(1)}px">${b}<span class="os-name"><i class="os-notch" aria-hidden="true"></i>${ch.d.kind === 'agent' ? `<span class="sr-only">${esc(tr('AI helper'))}: </span>` : ''}<b>${esc(main)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${typing ? '<i class="os-typing" aria-hidden="true"></i>' : ''}</span></button>`);
      }
      const html = out.join('');
      if (layer.__html !== html) { layer.innerHTML = html; layer.__html = html; }
      // no two tags on top of each other: from the lowest up, a tag that would cover one below it moves up
      layer.querySelectorAll('.os-tag').forEach(e => { e.style.marginTop = ''; });
      const tags = [...layer.querySelectorAll('.os-tag')].map(e => ({ e, r: e.getBoundingClientRect(), dy: 0 })).sort((p, q) => q.r.bottom - p.r.bottom);
      for (let i = 0; i < tags.length; i++) for (let j = 0; j < i; j++) {
        const A2 = tags[i], B2 = tags[j], at = A2.r.top + A2.dy, ab = A2.r.bottom + A2.dy, bt = B2.r.top + B2.dy, bb = B2.r.bottom + B2.dy;
        if (A2.r.left < B2.r.right && A2.r.right > B2.r.left && at < bb && ab > bt) A2.dy -= ab - bt + 2;
      }
      for (const t of tags) t.e.style.marginTop = t.dy ? `${t.dy}px` : '';
    }
    function paintSr() {
      const sr = root.querySelector('.os-sr'); if (!sr) return;
      sr.innerHTML = everyone().map(d => `<li>${esc(d.name)}: ${esc(d.state === 'off' ? tr('Away from desk') : (d.lines || [])[0] || tr('At their desk'))}</li>`).join('');
    }

    // ---------- the loop: walk along paths, animate, redraw ----------
    function freeTile(near) {
      if (!geo) return null;
      const all = [];
      for (let y = 0; y < layout.h; y++) for (let x = 0; x < layout.w; x++) if (walk(x, y) && !geo.seats.some(s => s.x === x && s.y === y)) all.push({ x, y });
      return all.length ? all[(near | 0) % all.length] : null;
    }
    function stepAlong(o, dt, speed) {
      const n = o.path[0], dx = n.x - o.x, dy = n.y - o.y, dist = Math.hypot(dx, dy), step = speed * dt;
      o.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 3 : 2) : (dy < 0 ? 1 : 0);
      if (dist <= step) { o.x = n.x; o.y = n.y; o.path.shift(); return true; }
      o.x += dx / dist * step; o.y += dy / dist * step; return false;
    }
    function frame(now) {
      if (dead) return;
      raf = 0;
      const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
      let moving = false;
      if (!reduce() && geo) {
        clock += dt;
        for (const ch of chars.values()) {
          ch.t += dt;
          if (!ch.path.length) { if (ch.target && ch.target.dir != null && !ch.target.leave) ch.dir = ch.target.dir; continue; }
          moving = true;
          if (stepAlong(ch, dt, SPEED) && !ch.path.length && ch.target && ch.target.leave) ch.visible = false;
        }
        for (const p of pets) {   // pets wander: walk somewhere near, rest 3-15 s, walk again
          p.t += dt; if (p.heart > 0) p.heart -= dt;
          if (p.path.length) { stepAlong(p, dt, 2); continue; }
          p.wait -= dt;
          if (p.wait <= 0) {
            const opts = []; for (let y = Math.round(p.y) - 5; y <= Math.round(p.y) + 5; y++) for (let x = Math.round(p.x) - 5; x <= Math.round(p.x) + 5; x++) if (walk(x, y) && ![...chars.values()].some(c => Math.round(c.x) === x && Math.round(c.y) === y)) opts.push({ x, y });
            const g = opts[Math.floor(Math.random() * opts.length)]; if (g) p.path = route(p, g).filter(s => walk(s.x, s.y));
            p.wait = 3 + Math.random() * 12;
          }
        }
      }
      draw();
      if (!reduce() && document.visibilityState === 'visible' && el.isConnected) raf = requestAnimationFrame(frame);
      else if (moving) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    const ro = new ResizeObserver(() => { if (reduce()) draw(); else kick(); }); ro.observe(stage);

    // ---------- clicks: a character, a pet, a desk, or (in the editor) a tile ----------
    function toTile(e) {
      const r = cv.getBoundingClientRect(), dpr = F ? F.dpr : 1;
      const x = ((e.clientX - r.left) * dpr - F.ox) / (F.scale * T), y = ((e.clientY - r.top) * dpr - F.oy) / (F.scale * T);
      return { fx: x, fy: y, x: Math.floor(x), y: Math.floor(y) };
    }
    function hit(p) {
      let best = null;
      for (const ch of chars.values()) if (ch.visible && Math.abs(p.fx - (ch.x + 0.5)) < 0.5 && p.fy > ch.y - 1.5 && p.fy < ch.y + 0.9) best = ch;
      if (best) return best.d.id;
      const pet = pets.find(q => Math.abs(p.fx - (q.x + 0.5)) < 0.5 && p.fy > q.y - 0.5 && p.fy < q.y + 0.9);
      if (pet) { pet.heart = 1.5; kick(); return null; }
      for (const [id, s] of deskFor()) if ((s.x === p.x && s.y === p.y) || (s.pc && covers(s.pc, p.x, p.y))) return id;
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
      if (drag.moved && (view.z > 0 || o.fill)) { view.ox = drag.ox + dx; view.oy = drag.oy + dy; if (o.fill) { const r = stage.getBoundingClientRect(); view.ox = Math.max(-r.width / 2, Math.min(r.width / 2, view.ox)); view.oy = Math.max(-r.height / 2, Math.min(r.height / 2, view.oy)); } draw(); }
    });
    cv.addEventListener('pointerup', e => {
      if (editing) return editUp();
      const was = drag; drag = null;
      if (was && was.moved) return;
      const id = hit(toTile(e)); if (id) openCard(id); else closeCard();
    });
    cv.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    layer.addEventListener('click', e => { const t = e.target.closest('[data-os-who]'); if (t) openCard(t.dataset.osWho); });
    function zoom(k) { view.z = Math.max(o.fill && cam ? 1 - cam.s : 0, Math.min(6, view.z + k)); if (!view.z && !o.fill) { view.ox = 0; view.oy = 0; } draw(); }
    function refit() { view.z = 0; view.ox = 0; view.oy = 0; cam = null; draw(); }

    // ---------- the card: who, what they're doing, and one click into TribeCode ----------
    // The body and its actions are TribeOffice's (office.js): the desks and the list in Agents & office open the same card.
    const O = () => window.TribeOffice;
    function openCard(id) {
      const d = everyone().find(x => x.id === id); if (!d || !O()) return;
      cardFor = id; card.hidden = false; lookEl.hidden = true;
      card.innerHTML = `<header><canvas class="os-av" width="16" height="16" data-role="${esc(d.kind)}" aria-hidden="true"></canvas><div><b>${esc(d.name)}</b><span>${esc(O().kindText(d))} · ${esc(O().statusOf(d))}</span></div><button class="btn sm icon" data-os-close aria-label="${esc(tr('Close'))}">×</button></header>${O().cardBody(d)}`;
      card.dataset.who = id;
      face(card.querySelector('.os-av'), d);
    }
    // The card's avatar: the character's face (the top 16x16 of its front frame), or Flint.
    function face(c, d) {
      if (!c || !artOk) return;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, 16, 16);
      if (d.kind === 'flint') { x.drawImage(A.flint(0), 2, 1); return; }
      const sh = A.sheet(lookOf(d), () => face(c, d)); if (sh) x.drawImage(sh.c, 16, 2, 16, 16, 0, 0, 16, 16);
    }
    function closeCard() { card.hidden = true; cardFor = null; }
    card.addEventListener('click', e => {
      if (e.target.closest('[data-os-close]')) return closeCard();
      const d = everyone().find(x => x.id === card.dataset.who); if (!d || !O()) return;
      O().cardClick(e, card, d);
    });
    card.addEventListener('submit', e => { const d = everyone().find(x => x.id === card.dataset.who); if (O()) O().cardSubmit(e, card, d); });

    // ---------- Your look: the wardrobe, with the real parts ----------
    let draft = null;
    const ROWS = [['body', 'Body'], ['hair', 'Hair'], ['top', 'Top'], ['pants', 'Bottoms'], ['shoes', 'Shoes'], ['jacket', 'Jacket'], ['full', 'Outfit'], ['beard', 'Beard'], ['hat', 'Hat'], ['acc', 'Extra']];
    const SLOT = { glasses: 'shades', shades: 'shades' };
    const nameOf = (k, i) => { const id = A.PARTS[k][((i | 0) % A.PARTS[k].length + A.PARTS[k].length) % A.PARTS[k].length]; return id ? A.label(k === 'acc' ? (SLOT[id] || id) : k, id) : 'None'; };
    function openLook() {
      closeCard(); edit.hidden = true;
      draft = Object.assign(S.seedLook((data && data.me) || 'me'), (data && data.myLook) || {});
      lookEl.hidden = false; paintLook();
    }
    function paintLook() {
      const row = (k, label) => `<div class="os-part"><span>${esc(tr(label))}</span><button class="btn sm icon" data-lk="${k}" data-d="-1" aria-label="${esc(tr('Previous'))}">‹</button><b>${esc(tr(nameOf(k, draft[k] || 0)))}</b><button class="btn sm icon" data-lk="${k}" data-d="1" aria-label="${esc(tr('Next'))}">›</button></div>`;
      const sw = (k, slot, label) => { const cols = A.swatches(slot); return `<div class="os-sw" role="radiogroup" aria-label="${esc(tr(label))}"><span>${esc(tr(label))}</span>${cols.map((c, i) => `<button class="os-dot${(draft[k] | 0) === i ? ' on' : ''}" role="radio" aria-checked="${(draft[k] | 0) === i}" data-lc="${k}" data-i="${i}" style="background:${c}" aria-label="${esc(tr(label))} ${i + 1}"></button>`).join('')}</div>`; };
      const full = !!draft.full;
      lookEl.innerHTML = `<header><b>${esc(tr('Your look'))}</b><button class="btn sm icon" data-lk-close aria-label="${esc(tr('Close'))}">×</button></header>
        <div class="os-look-row"><canvas class="os-prev" width="16" height="32" aria-hidden="true"></canvas><div class="os-parts">${ROWS.map(([k, l]) => row(k, l)).join('')}</div></div>
        ${sw('skin', 'body', 'Skin')}${sw('hairColor', 'hair', 'Hair colour')}${full ? sw('fullColor', 'full', 'Outfit colour') : sw('topColor', 'top', 'Top colour') + sw('pantsColor', 'pants', 'Bottoms colour')}
        ${draft.jacket ? sw('jacketColor', 'jacket', 'Jacket colour') : ''}${draft.hat ? sw('hatColor', 'hat', 'Hat colour') : ''}${sw('shoesColor', 'shoes', 'Shoes colour')}
        <div class="os-acts"><button class="btn primary sm" data-lk-save>${esc(tr('Save my look'))}</button><button class="btn sm" data-lk-random>${esc(tr('Surprise me'))}</button></div>`;
      preview();
    }
    function preview() {
      const c = lookEl.querySelector('.os-prev'); if (!c) return;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, 16, 32);
      const sh = A.sheet(draft, preview); if (sh) A.drawSheet(x, sh, 0, 1, 8, 32);
    }
    lookEl.addEventListener('click', async e => {
      const t = e.target.closest('[data-lk],[data-lc],[data-lk-close],[data-lk-save],[data-lk-random]'); if (!t) return;
      if (t.matches('[data-lk-close]')) { lookEl.hidden = true; return; }
      if (t.matches('[data-lk]')) { const k = t.dataset.lk, n = S.LOOK[k] || A.PARTS[k].length; draft[k] = ((draft[k] | 0) + (+t.dataset.d) + n) % n; return paintLook(); }
      if (t.matches('[data-lc]')) { draft[t.dataset.lc] = +t.dataset.i; return paintLook(); }
      if (t.matches('[data-lk-random]')) { draft = S.seedLook(Math.random().toString(36)); return paintLook(); }
      if (t.matches('[data-lk-save]')) {
        try { const r = await C.api('/office/look', { method: 'PUT', body: { look: draft } }); if (data) data.myLook = r.look; toast(tr('Look saved')); lookEl.hidden = true; office.refresh(); } catch (err) { toast(err.message); }
      }
    });

    // ---------- the layout editor (host or admin): the real furniture ----------
    const TILE_TOOLS = [['wood', 'Wood'], ['floor', 'Floor'], ['tile', 'Tiles'], ['stone', 'Stone'], ['carpet', 'Carpet'], ['wall', 'Wall'], ['void', 'Outside']];
    const CATS = [['desks', 'Desks and tables'], ['chairs', 'Seats'], ['electronics', 'Computers'], ['decor', 'Plants'], ['wall', 'On the wall'], ['misc', 'Other']];
    let before = null;
    function openEdit() {
      if (!data || !data.canSet) return;
      closeCard(); lookEl.hidden = true;
      before = JSON.stringify(layout); editing = true; tool = 'move'; sel = null;
      edit.hidden = false; root.classList.add('editing'); paintEdit(); draw();
    }
    function paintEdit() {
      const people = everyone().filter(d => d.kind !== 'flint'), items = A.cat();
      const furn = CATS.map(([c, l]) => { const ids = Object.keys(items).filter(id => items[id].cat === c); return ids.length ? `<p class="os-sub">${esc(tr(l))}</p><div class="os-tools os-furn">${ids.map(id => `<button class="btn sm os-fb${tool === 'f:' + id ? ' on' : ''}" data-tool="f:${id}" aria-pressed="${tool === 'f:' + id}" title="${esc(tr(items[id].name))}"><canvas width="16" height="16" data-thumb="${id}" aria-hidden="true"></canvas><span class="sr-only">${esc(tr(items[id].name))}</span></button>`).join('')}</div>` : ''; }).join('');
      const seat = sel && sz(sel).cat === 'chairs';
      edit.innerHTML = `<header><b>${esc(tr('Edit layout'))}</b></header>
        <div class="os-tools" role="toolbar">${[['move', 'Move'], ['rotate', 'Turn'], ['erase', 'Remove'], ['area', 'Name an area']].map(([k, l]) => `<button class="btn sm${tool === k ? ' on' : ''}" data-tool="${k}" aria-pressed="${tool === k}">${esc(tr(l))}</button>`).join('')}</div>
        <p class="os-sub">${esc(tr('Floor'))}</p><div class="os-tools">${TILE_TOOLS.map(([k, l]) => `<button class="btn sm${tool === k ? ' on' : ''}" data-tool="${k}" aria-pressed="${tool === k}">${esc(tr(l))}</button>`).join('')}</div>
        ${furn}
        ${seat ? `<label class="os-assign"><span>${esc(tr('This seat is for'))}</span><select class="input sm" data-assign><option value="">${esc(tr('Anyone'))}</option>${people.map(p => `<option value="${esc(p.id)}"${sel.who === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
        <form class="os-area" data-area hidden><input class="input sm" maxlength="32" placeholder="${esc(tr('Area name, e.g. Lounge'))}"><button class="btn sm">${esc(tr('Name it'))}</button></form>
        <p class="faint os-hint">${esc(tr(tool === 'area' ? 'Drag over the floor, then name the area.' : TILE_TOOLS.some(t => t[0] === tool) ? 'Click or drag to paint.' : tool === 'move' ? 'Drag a piece to move it. Click a seat to choose who sits there.' : tool === 'rotate' ? 'Click a piece to turn it.' : tool === 'erase' ? 'Click a piece to remove it.' : 'Click an empty spot to place it.'))}</p>
        <div class="os-acts"><button class="btn primary sm" data-ed="save">${esc(tr('Save layout'))}</button><button class="btn sm" data-ed="cancel">${esc(tr('Cancel'))}</button></div>
        <div class="os-acts"><button class="btn sm" data-ed="reset">${esc(tr('Back to the default'))}</button><button class="btn sm" data-ed="export">${esc(tr('Export'))}</button><label class="btn sm os-import">${esc(tr('Import'))}<input type="file" accept="application/json,.json" data-ed-import hidden></label></div>`;
      for (const c of edit.querySelectorAll('[data-thumb]')) {   // a small picture of each piece, fitted into 16x16
        const img = A.furn(c.dataset.thumb, 0); if (!img) continue;
        const x = c.getContext('2d'), k = Math.min(16 / img.width, 16 / img.height); x.imageSmoothingEnabled = false;
        x.drawImage(img, Math.round((16 - img.width * k) / 2), Math.round((16 - img.height * k) / 2), Math.round(img.width * k), Math.round(img.height * k));
      }
    }
    // the piece under a tile: the nearest one in front (highest base) wins
    function pieceAt(x, y) { let best = null, bz = -1; for (const it of layout.items) if (covers(it, x, y)) { const z = it.y + sz(it).fh + (sz(it).wall ? -0.5 : 0); if (z > bz) { bz = z; best = it; } } return best; }
    const isTile = k => TILE_TOOLS.some(t => t[0] === k);
    function editDown(p, e) {
      if (!inside(p.x, p.y)) return;
      cv.setPointerCapture(e.pointerId);
      if (isTile(tool)) { layout.tiles[p.y * layout.w + p.x] = tool; drag = { paint: true }; rebuild(); draw(); return; }
      const it = pieceAt(p.x, p.y);
      if (tool === 'area') { drag = { area: true, a: p, b: p }; return; }
      if (tool === 'move') { sel = it || null; drag = it ? { item: it, dx: p.x - it.x, dy: p.y - it.y } : null; paintEdit(); draw(); return; }
      if (tool === 'rotate') { if (it) { const views = Object.keys((A.cat()[it.t] || {}).views || {}).length; if (views > 1) it.r = ((it.r || 0) + 1) % 4; sel = it; rebuild(); } draw(); return; }
      if (tool === 'erase') { if (it) { layout.items = layout.items.filter(i => i !== it); sel = null; rebuild(); } draw(); return; }
      if (tool.startsWith('f:')) {
        const id = tool.slice(2), s = A.size(id, 0); if (!s) return;
        const fits = s.wall || s.surface || (() => { for (let dy = s.bg; dy < s.fh; dy++) for (let dx = 0; dx < s.fw; dx++) if (!walk(p.x + dx, p.y + dy)) return false; return true; })();
        if (!fits || p.x + s.fw > layout.w || p.y + s.fh > layout.h) { toast(tr('There is no room for it there.')); return; }
        const n = { t: id, x: p.x, y: p.y, r: 0 }; layout.items.push(n); sel = n; rebuild(); paintEdit(); draw();
      }
    }
    function editMove(p) {
      if (!drag || !inside(p.x, p.y)) return;
      if (drag.paint && isTile(tool)) { layout.tiles[p.y * layout.w + p.x] = tool; rebuild(); draw(); }
      if (drag.item) { drag.item.x = Math.max(0, p.x - drag.dx); drag.item.y = Math.max(0, p.y - drag.dy); rebuild(); draw(); }
      if (drag.area) { drag.b = p; draw(); }
    }
    function editUp() {
      if (drag && drag.area) {
        const a = drag.a, b = drag.b; drag = null;
        const f = edit.querySelector('[data-area]'); f.hidden = false; f.dataset.rect = JSON.stringify({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 }); f.querySelector('input').focus();
        return;
      }
      drag = null; sync();
    }
    edit.addEventListener('click', async e => {
      const t = e.target.closest('[data-tool],[data-ed]'); if (!t) return;
      if (t.dataset.tool) { tool = t.dataset.tool; paintEdit(); return; }
      const k = t.dataset.ed;
      if (k === 'cancel') { layout = JSON.parse(before); rebuild(); stopEdit(); return; }
      if (k === 'reset') { if (!confirm(tr('Put back the default floor? Your layout changes go away.'))) return; await saveLayout(null); stopEdit(); return; }
      if (k === 'export') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(layout, null, 1)], { type: 'application/json' })); a.download = 'office-space-layout.json'; document.body.appendChild(a); a.click(); a.remove(); return; }
      if (k === 'save') { await saveLayout(layout); stopEdit(); }
    });
    edit.addEventListener('change', async e => {
      if (e.target.matches('[data-assign]') && sel) { if (e.target.value) { layout.items.forEach(i => { if (i !== sel && i.who === e.target.value) delete i.who; }); sel.who = e.target.value; } else delete sel.who; draw(); }
      if (e.target.matches('[data-ed-import]')) {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        try { const L = JSON.parse(await f.text()); if (!L || L.v !== 2 || !Array.isArray(L.tiles) || !Array.isArray(L.items)) throw new Error(tr('That file is not an Office Space layout.')); layout = L; normalise(); rebuild(); draw(); toast(tr('Imported. Save to keep it.')); } catch (err) { toast(err.message); }
      }
    });
    edit.addEventListener('submit', e => {
      const f = e.target.closest('[data-area]'); if (!f) return; e.preventDefault();
      const name = f.querySelector('input').value.trim(); if (!name) return;
      layout.areas = (layout.areas || []).concat([{ name, ...JSON.parse(f.dataset.rect || '{}') }]).slice(-12); f.hidden = true; f.querySelector('input').value = ''; draw();
    });
    async function saveLayout(L) {
      try { const r = await C.api('/office', { method: 'PUT', body: { layout: L } }); if (data) data.layout = r.layout; layout = usable(r.layout) || A.defaultLayout(everyone().length - 1); normalise(); rebuild(); toast(L ? tr('Layout saved') : tr('Back to the default floor')); office.refresh(); }
      catch (err) { toast(err.message); }
    }
    function stopEdit() { editing = false; sel = null; edit.hidden = true; root.classList.remove('editing'); sync(); draw(); }
    const usable = L => (L && L.v === 2 && Array.isArray(L.tiles) && Array.isArray(L.items) ? JSON.parse(JSON.stringify(L)) : null);   // layouts from before the art (v1) start from the new default
    // More people than desk seats: add a desk, a computer and a stool on free floor (only on screen; saving keeps them).
    function normalise() {
      rebuild();
      const need = everyone().filter(d => d.kind !== 'flint').length;
      let have = deskSeats().length;
      for (let y = 1; y < layout.h - 3 && have < need; y++) for (let x = 1; x < layout.w - 3 && have < need; x++) {
        let ok = true; for (let dy = 0; dy < 4 && ok; dy++) for (let dx = 0; dx < 3 && ok; dx++) if (!walk(x + dx, y + dy) || layout.items.some(i => covers(i, x + dx, y + dy))) ok = false;
        if (!ok) continue;
        layout.items.push({ t: 'DESK', x, y, r: 0 }, { t: 'PC', x: x + 1, y, r: 0 }, { t: 'CUSHIONED_BENCH', x: x + 1, y: y + 2, r: 0 });
        rebuild(); have = deskSeats().length;
      }
    }

    // ---------- the bar ----------
    root.querySelector('.os-bar').addEventListener('click', e => {
      const t = e.target.closest('[data-os-act]'); if (!t) return;
      const k = t.dataset.osAct;
      act(k);
    });
    function act(k, v) {
      if (k === 'look') return openLook();
      if (k === 'edit') return editing ? null : openEdit();
      if (k === 'sound') { try { localStorage.setItem(LS_SOUND, soundOn() ? '0' : '1'); } catch {} const t = root.querySelector('[data-os-act="sound"]'); t.setAttribute('aria-pressed', String(soundOn())); t.textContent = soundOn() ? tr('Sound on') : tr('Sound off'); if (soundOn()) chime(); return; }
      if (k === 'in') return zoom(1);
      if (k === 'out') return zoom(-1);
      if (k === 'set') return setTo(v);
      if (k === 'fit') return refit();
    }
    async function setTo(id) {
      try { await C.api('/office', { method: 'PUT', body: { set: id } }); set = S.get(id); const s2 = root.querySelector('[data-os-set]'); if (s2) s2.value = set.id; draw(); toast(tr('Set changed')); office.refresh(); } catch (err) { toast(err.message); }
    }
    card.addEventListener('click', e => { if (e.target.closest('[data-os-act="look"]')) openLook(); });
    root.querySelector('[data-os-set]').addEventListener('change', e => setTo(e.target.value));
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!lookEl.hidden) lookEl.hidden = true; else if (!card.hidden) closeCard(); else if (editing) { layout = JSON.parse(before); rebuild(); stopEdit(); } }
      if (editing && sel && (e.key === 'r' || e.key === 'R') && !/input|select|textarea/i.test(e.target.tagName)) { sel.r = ((sel.r || 0) + 1) % 4; rebuild(); draw(); }
      if (editing && sel && (e.key === 'Delete' || e.key === 'Backspace') && !/input|select|textarea/i.test(e.target.tagName)) { layout.items = layout.items.filter(i => i !== sel); sel = null; rebuild(); draw(); }
    });

    let asked = null;
    function update(d) {
      const nowAsk = new Set(((d && d.desks) || []).flatMap(x => (x.asks || []).filter(a => a.canDecide).map(a => a.id)));
      if (asked && [...nowAsk].some(id => !asked.has(id))) chime();
      asked = nowAsk;
      data = d;
      set = S.get(d && d.set);
      const sb = root.querySelector('.os-set'), sel2 = root.querySelector('[data-os-set]');
      sb.hidden = !(d && d.canSet); root.querySelector('[data-os-act="edit"]').hidden = !(d && d.canSet);
      if (sel2 && !sel2.options.length) sel2.innerHTML = S.list().map(s => `<option value="${esc(s.id)}">${esc(tr(s.name))}</option>`).join('');
      if (sel2) sel2.value = set.id;
      root.querySelector('[data-os-act="look"]').hidden = !(d && d.me) || ((d.desks || []).find(x => x.id === d.me) || {}).kind === 'agent';
      if (!artOk) return;   // the art is still loading: ready() calls update again
      if (!editing) {
        const L = usable(d && d.layout), sig = JSON.stringify(L) + '|' + everyone().length;
        if (!layout || root.__lsig !== sig) { layout = L || A.defaultLayout(everyone().length - 1); root.__lsig = sig; normalise(); }
        if (!o.fill) stage.style.aspectRatio = `${layout.w * T} / ${layout.h * T}`;
      }
      sync();
      if (o.fill && cam && F && !view.z && [...chars.values()].some(c => { if (!c.visible) return false; const p = c.target || c, sx = F.ox + (p.x * T + 8) * F.scale, sy = F.oy + (p.y * T + 8) * F.scale; return sx < 0 || sy < 24 * F.dpr || sx > cv.width || sy > cv.height; })) cam = null;   // someone is out of view: look again
      if (cardFor) { const keep = cardFor; if (everyone().some(x => x.id === keep)) openCard(keep); else closeCard(); }
      if (reduce()) draw(); else kick();
    }
    A.ready().then(() => { artOk = true; if (!dead && data) update(data); }).catch(() => { stage.dataset.noart = '1'; });
    const inst = {
      update,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); ro.disconnect(); },
      chars: () => [...chars.values()].map(c => ({ id: c.d.id, x: c.x, y: c.y, pose: poseOf(c), dir: c.dir, visible: c.visible, moving: !!c.path.length, bubble: c.d.bubble || null })),
      layout: () => layout,
      art: () => artOk,
      pets: () => pets.map(p => ({ name: p.name, x: p.x, y: p.y })),
      // where a tile's centre is on screen (tests and keyboard helpers)
      tileXY(x, y) { if (!F) draw(); const r = cv.getBoundingClientRect(); return { x: r.left + (F.ox + (x + 0.5) * T * F.scale) / F.dpr, y: r.top + (F.oy + (y + 0.5) * T * F.scale) / F.dpr }; },
      free(minX = 1) { for (let y = 1; y < layout.h - 1; y++) for (let x = Math.max(1, minX); x < layout.w - 1; x++) if (walk(x, y) && walk(x, y + 1) && !layout.items.some(i => covers(i, x, y) || covers(i, x, y + 1)) && ![...chars.values()].some(c => Math.round(c.x) === x && Math.round(c.y) === y)) return { x, y }; return null; },
      scale: () => (F ? F.scale : 0),
      act,
      // what the page's own toolbar may offer: the host's set and layout, your look, the sound, the zoom
      // the part of the box the office's art covers, in CSS pixels (fill mode: all of it)
      painted: () => { if (!F) draw(); const r = cv.getBoundingClientRect(); if (o.fill) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; const W = layout.w * T * F.scale / F.dpr, H = layout.h * T * F.scale / F.dpr; return { left: r.left + Math.max(0, F.ox / F.dpr), top: r.top + Math.max(0, F.oy / F.dpr), right: r.left + Math.min(r.width, F.ox / F.dpr + W), bottom: r.top + Math.min(r.height, F.oy / F.dpr + H) }; },
      info: () => ({ canSet: !!(data && data.canSet), canLook: !!(data && data.me) && ((data.desks || []).find(x => x.id === data.me) || {}).kind !== 'agent', sound: soundOn(), set: set.id, sets: S.list().map(x => ({ id: x.id, name: tr(x.name) })), zoom: view.z }),
    };
    root.__os = inst;
    return inst;
  }

  window.TribeOfficeSpace = { mount };
})();
