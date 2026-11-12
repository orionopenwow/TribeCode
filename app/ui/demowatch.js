// "Flint builds a game" (feat/demo-auto): a hands-off, ~90-second demo. You do nothing: Flint drives the REAL app in an
// isolated demo tribe (offline.js, mode 'watch': it lives in this tab only and never touches your own settings) while a
// caption says what he's doing and a spotlight + his cursor move to each real place:
//   1 a project "Lantern Run"   2 the vision   3 tasks, assigned to Flint, Maya and Claude   4 Maya joins and reacts
//   5 the platformer from the starter   6 "make jumping floatier"   7 a sprite from the inspiration board
//   8 Maya pins a comment in the preview   9 Flint fixes it   10 approve   11 a tiny website   12 the game plays itself
//   13 the proof ZIP   14 Your turn: Start a project / Try it yourself
// No AI and no server: the offline backend answers the API, the game is demo-game.html, the ZIP is TribeExport.zip.
// Every step finds its target within 2 s (a watchdog) or moves on with a short note; Esc, Exit, the end and any error
// always lift the dim. Controls: Pause/Play, 1x/2x, Skip to end, Exit (back to your own app, clean).
// Start: app/?demo=watch (the website's "Watch the demo"), Help › Watch Flint build a game, the empty Home's
// "Tour with Flint". ?speed=4 plays it faster (tests).
//   window.TribeDemoWatch = { start(), stop(), pause(), play(), speed(n), skipToEnd(), begin(), exit(), seed(ctx), active(), _test: { log(), state() } }
(function () {
  'use strict';
  const O = () => window.TribeOffline, K = () => window.TribeOffline && window.TribeOffline._k;
  const A = () => window.TribeApp, C = () => window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PID = 'lantern-run', GAME = 'Lantern Run', RELEASES = 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const on = () => !!(O() && O().mode && O().mode() === 'watch');
  const db = () => K().db();
  const iso = (t = Date.now()) => new Date(t).toISOString();

  // ---------- the tribe: Flint at the keyboard, Maya (a friend) and Claude (an agent) ----------
  function seed({ iso: iso2, rid }) {
    const now = Date.now(), first = 'sketchbook';
    return {
      on: true, v: 1, mode: 'watch', created: iso2(now), seq: 0,
      tribe: { name: 'Flint’s Workshop', created: iso2(now) },
      members: [
        { id: 'me', name: 'Flint', color: '#F26B1D', role: 'host', joined: iso2(now) },
        { id: 'maya', name: 'Maya', color: '#6C7CFF', role: 'builder', joined: iso2(now - 86400e3), online: false },
        { id: 'claude', name: 'Claude', color: '#38C6B1', role: 'agent', owner: 'me', joined: iso2(now), online: true, where: 'Tasks' },
      ],
      current: first,
      projects: [{ id: first, name: 'Sketchbook', emoji: '✏️', image: null, bio: 'Flint’s scratch space.', color: '#6C7CFF', channel: 'general', default: true, created: iso2(now), members: { me: 'host' } }],
      chat: { [first]: [{ id: 'm-' + rid(), at: iso2(now), by: 'tribecode', text: 'Flint’s Workshop is a demo that lives in this tab. Flint is about to build a game. Sit back.' }] },
      tasks: { [first]: [] }, docs: { [first]: [] }, vision: { [first]: '' }, gists: { [first]: [] },
      scratch: [], uploads: [], invites: [], friends: [], prefs: { pins: [] }, joinedRio: true, mayaHi: true, huddled: true, commented: true, approvals: [], inbox: [],
    };
  }

  // ---------- the preview answers in this demo: the game exists once Flint has built it ----------
  const gameUrl = () => new URL('demo-game.html', location.href).href;
  function route(method, parts, q, body, headers) {
    const d = K() && K().db(); if (!d || d.mode !== 'watch') return null;
    const [a, b, c] = parts, ok = x => [200, x];
    if (a === 'preview') {
      const pid = (headers['x-project'] && d.projects.some(p => p.id === headers['x-project'])) ? headers['x-project'] : K().cur();
      const built = !!(d.watch && d.watch.built) && pid === PID;
      const info = { project: pid, path: built ? gameUrl() : null, expires: iso(Date.now() + 3600e3), hasRepo: built, hasIndex: built, mode: 'static', root: '.', canConfigure: false };
      if (method === 'POST' && b === 'token') return ok(info);
      if (method === 'GET' && !b) return ok({ preview: info });
    }
    if (a === 'projects' && c === 'widgets' && method === 'GET') return ok({ widgets: (d.widgets || {})[b] || [], canEdit: true, preview: { show: b === PID && !!(d.watch && d.watch.built), label: 'Preview game', kind: 'game' }, website: { show: false } });
    return null;
  }
  function hook() { const k = K(); if (k && k.hooks && !k.hooks.route.includes(route)) k.hooks.route.push(route); }

  // ---------- the clock: scaled by the speed, stopped while paused ----------
  let running = false, paused = false, speedN = 1, turbo = 1, token = 0, clock = 0, last = 0, tick = null, idx = -1, finished = false;
  const log = [];
  const ABORT = { abort: true };
  let followEl = null, followSel = null, followT = 0;
  function loop() {
    const now = performance.now(); if (running && !paused) clock += (now - last) * speedN * turbo; last = now; paintTime();
    if (followEl && running && !paused && now - followT > 200) {   // the spotlight follows its target through re-renders; gone for good: no dim
      followT = now;
      if (!followEl.isConnected) { const again = followSel ? pick(followSel) : null; if (again) followEl = again; else { spot(null); return; } }
      spot(followEl, true);
    }
  }
  const pick = sel => { const list = typeof sel === 'function' ? [sel()] : [].concat(sel).flatMap(x => [...document.querySelectorAll(x)]); return list.find(el => el && el.isConnected && el.getClientRects().length && el.getBoundingClientRect().width > 0) || null; };
  async function hold(ms) { const t = token, end = clock + ms; while (clock < end) { await new Promise(r => setTimeout(r, 30)); if (t !== token || !running) throw ABORT; } }
  async function real(ms) { const t = token; await new Promise(r => setTimeout(r, ms)); if (t !== token || !running) throw ABORT; }
  // the watchdog: a target (a selector, a list of them, or a function) within 2 s of real time, else null
  async function find(sel, ms = 2000) {
    const end = Date.now() + ms, t = token;
    for (;;) { const el = pick(sel); if (el) return el; if (Date.now() > end) return null; await new Promise(r => setTimeout(r, 60)); if (t !== token || !running) throw ABORT; }
  }

  // ---------- the layer: the dim (four flat panels around a hole), the ring, the cursors, the caption and the bar ----------
  let layer = null, ui = null;
  function mount() {
    unmount();
    document.body.classList.add('dw-on');
    layer = document.createElement('div'); layer.className = 'dw-layer'; layer.id = 'dw-layer'; layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<div class="dw-dim" id="dw-dim"><i data-d="t"></i><i data-d="l"></i><i data-d="r"></i><i data-d="b"></i></div><div class="dw-ring" id="dw-ring"></div>';
    document.body.appendChild(layer);
    ui = document.createElement('section'); ui.className = 'dw-ui'; ui.id = 'dw-ui'; ui.setAttribute('role', 'region'); ui.setAttribute('aria-label', 'Flint builds a game');
    ui.innerHTML = `<div class="dw-cap" id="dw-cap" aria-live="polite"><img src="assets/flint.svg" alt="" width="36" height="36"><div class="dw-cap-b"><span class="dw-k" id="dw-k">Flint · step 1 of ${STEPS.length}</span><b class="dw-t" id="dw-t"></b><p class="dw-say" id="dw-say"></p><p class="dw-cmd" id="dw-cmd" hidden></p></div></div>
      <div class="dw-bar"><button class="dw-b dw-play" id="dw-play" aria-label="Pause" title="Pause (Space)"><span class="dw-pp" aria-hidden="true">❚❚</span></button>
        <div class="dw-segs" id="dw-segs">${STEPS.map((s, i) => `<i data-i="${i}" title="${esc(s.title)}"><b></b></i>`).join('')}</div>
        <span class="dw-time" id="dw-time">0:00</span>
        <button class="dw-b" id="dw-speed" aria-pressed="false" title="Speed">1×</button>
        <button class="dw-b" id="dw-skip" title="Skip to the end">Skip to end</button>
        <button class="dw-b dw-x" id="dw-exit" title="Exit the demo: back to your own app">Exit</button></div>`;
    document.body.appendChild(ui);
    ui.querySelector('#dw-play').onclick = () => (finished ? restart() : paused ? play() : pause());
    ui.querySelector('#dw-speed').onclick = () => speed(speedN === 2 ? 1 : 2);
    ui.querySelector('#dw-skip').onclick = () => skipToEnd();
    ui.querySelector('#dw-exit').onclick = () => exit();
    paintCtl();
  }
  function unmount() {
    for (const id of ['#dw-layer', '#dw-ui', '#dw-end', '#dw-inspo', '#dw-pin', '#dw-build', '#dw-proof']) { const e = $(id); if (e) e.remove(); }
    layer = null; ui = null; document.body.classList.remove('dw-on', 'dw-paused');
  }
  function spot(el, keep) {
    const dim = $('#dw-dim'), ring = $('#dw-ring'); if (!dim || !ring) return;
    if (!keep) { followEl = el || null; followSel = null; }
    if (!el || !el.isConnected) { followEl = null; dim.classList.remove('on'); ring.classList.remove('on'); return; }
    const r = el.getBoundingClientRect(), pad = 8;
    const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad), w = Math.min(innerWidth - x, r.width + pad * 2), h = Math.min(innerHeight - y, r.height + pad * 2);
    const set = (d, css) => Object.assign(dim.querySelector(`[data-d="${d}"]`).style, css);
    set('t', { left: '0px', top: '0px', width: '100vw', height: y + 'px' });
    set('b', { left: '0px', top: (y + h) + 'px', width: '100vw', height: Math.max(0, innerHeight - y - h) + 'px' });
    set('l', { left: '0px', top: y + 'px', width: x + 'px', height: h + 'px' });
    set('r', { left: (x + w) + 'px', top: y + 'px', width: Math.max(0, innerWidth - x - w) + 'px', height: h + 'px' });
    Object.assign(ring.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    dim.classList.add('on'); ring.classList.add('on');
  }
  const cursors = {};
  function cursor(id) {
    if (cursors[id] && cursors[id].el.isConnected) return cursors[id];
    const m = (db().members || []).find(x => x.id === id) || {}, el = document.createElement('div');
    el.className = 'dw-cur'; el.dataset.who = id; el.style.setProperty('--c', m.color || '#F26B1D');
    el.innerHTML = `<svg viewBox="0 0 16 20" class="dw-arrow"><path d="M1.5 1.5v15l4.2-4 3 6.8 2.6-1.1-3-6.6h5.9z"/></svg><span class="dw-name">${esc(String(m.name || id).split(' ')[0])}</span>`;
    (layer || document.body).appendChild(el);
    const c = { el, x: id === 'me' ? innerWidth * 0.5 : innerWidth + 30, y: innerHeight * (id === 'me' ? 0.55 : 0.35) };
    place(c); cursors[id] = c; return c;
  }
  const place = c => { c.el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`; };
  async function glide(id, el, dx = 0.5, dy = 0.5) {
    const c = cursor(id); if (!el) return;
    if (!el.isConnected) { if (followEl && followEl.isConnected) el = followEl; else return; }   // re-rendered meanwhile: where the spotlight is now
    const r = el.getBoundingClientRect(), to = { x: Math.min(innerWidth - 8, Math.max(8, r.left + r.width * dx)), y: Math.min(innerHeight - 8, Math.max(8, r.top + r.height * dy)) };
    if (calm()) { c.x = to.x; c.y = to.y; place(c); return; }
    const from = { x: c.x, y: c.y }, dur = Math.max(250, Math.min(900, Math.hypot(to.x - from.x, to.y - from.y) * 0.9)), t0 = clock;
    for (;;) { const p = Math.min(1, (clock - t0) / dur), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; c.x = from.x + (to.x - from.x) * e; c.y = from.y + (to.y - from.y) * e; place(c); if (p >= 1) break; await hold(16); }
  }
  function ripple(id) { const c = cursors[id]; if (!c || calm()) return; const r = document.createElement('i'); r.className = 'dw-ripple'; r.style.left = c.x + 'px'; r.style.top = c.y + 'px'; r.style.setProperty('--c', c.el.style.getPropertyValue('--c')); (layer || document.body).appendChild(r); setTimeout(() => r.remove(), 600); }
  // point: the watchdog finds the target, the spotlight and Flint's cursor go there; a miss is logged and skipped
  async function point(name, sel, opts = {}) {
    const el = await find(sel, opts.ms || 2000);
    log.push({ step: STEPS[idx] && STEPS[idx].id, target: name, found: !!el });
    if (!el) { note(`(I couldn’t find ${name} on this screen, so I’ll keep going.)`); spot(null); return null; }
    if (opts.scroll !== false) { const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight - 140) el.scrollIntoView({ block: 'center', behavior: 'instant' }); }
    spot(el); followSel = sel; await glide(opts.who || 'me', el, opts.dx, opts.dy);
    return el;
  }
  async function press(el, who = 'me') { if (!el) return; ripple(who); await hold(160); if (el.isConnected) el.click(); await hold(220); }
  function caption(s, i) {
    const k = $('#dw-k'), t = $('#dw-t'), say = $('#dw-say'), cmd = $('#dw-cmd'); if (!k) return;
    k.textContent = `Flint · step ${i + 1} of ${STEPS.length}`; t.textContent = s.title; say.textContent = s.say; cmd.hidden = true;
    document.querySelectorAll('#dw-segs [data-i]').forEach(b => { const n = Number(b.dataset.i); b.classList.toggle('past', n < i); b.classList.toggle('on', n === i); });
    const cap = $('#dw-cap'); if (cap) { cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in'); }
  }
  function note(text) { const say = $('#dw-say'); if (say) say.textContent = text; }
  async function typeCmd(text) {   // what Flint "types": shown in the caption as a command line
    const cmd = $('#dw-cmd'); if (!cmd) return; cmd.hidden = false; cmd.textContent = '› ';
    if (calm()) { cmd.textContent = '› ' + text; return; }
    for (const ch of text) { cmd.textContent += ch; await hold(28); }
  }
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function paintTime() { const t = $('#dw-time'); if (t) t.textContent = `${mmss(Math.min(clock, TOTAL))} / ${mmss(TOTAL)}`; if (idx >= 0) { const s = STEPS[idx], seg = document.querySelector(`#dw-segs [data-i="${idx}"] b`); if (seg && s) seg.style.width = Math.min(100, Math.max(0, (clock - (offsets[idx] || 0)) / s.dur * 100)) + '%'; } }
  function paintCtl() {
    const p = $('#dw-play'); if (p) { const lab = finished ? 'Watch again' : paused ? 'Play' : 'Pause'; p.setAttribute('aria-label', lab); p.title = lab; p.querySelector('.dw-pp').textContent = finished ? '↻' : paused ? '▶' : '❚❚'; }
    const sp = $('#dw-speed'); if (sp) { sp.textContent = speedN === 2 ? '2×' : '1×'; sp.setAttribute('aria-pressed', String(speedN === 2)); sp.classList.toggle('on', speedN === 2); }
    document.body.classList.toggle('dw-paused', paused);
  }

  // ---------- small helpers over the app ----------
  const api = (p, o) => C().api(p, o);
  const show = v => { try { if (window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(() => A().show(v)); else A().show(v); } catch {} };
  const closePreview = () => { try { if (window.TribePreview) window.TribePreview.close(); } catch {} };
  // what Flint changed in the game stays changed: a game frame that (re)loads gets it again when it says hello
  let gs = {};
  const game = msg => { for (const k of ['tune', 'sprite', 'fix', 'auto']) if (k in msg) gs[k] = msg[k]; const f = $('#pvw-iframe'); if (f && f.contentWindow) f.contentWindow.postMessage({ tour: 'keys', ...msg }, '*'); };
  let lit = 0, ready = 0;
  addEventListener('message', e => {
    const m = e.data; if (!m || m.tour !== 'game' || typeof m.lit !== 'number') return;
    lit = Math.max(lit, m.lit); ready++;
    const fr = $('#pvw-iframe'); if (fr && e.source === fr.contentWindow) fr.dataset.dwLoaded = '1';
    if (running && m.lit === 0 && e.source && Object.keys(gs).length) { try { e.source.postMessage({ tour: 'keys', ...gs }, '*'); } catch {} }
  });
  async function openPreview() {
    if (window.TribeWidgets && window.TribeWidgets.refresh) { try { await window.TribeWidgets.refresh(); } catch {} }
    if (!$('#pvw-iframe') && window.TribePreview) { try { await window.TribePreview.open(); } catch {} }
    const f = await find('#pvw-iframe', 4000);
    if (f && !/demo-game\.html/.test(f.src)) f.src = gameUrl();
    return f;
  }
  async function inProject(id) {
    if (C().project() !== id) { if (window.TribeProjects && window.TribeProjects.switchTo) await window.TribeProjects.switchTo(id, 'home'); else C().send({ type: 'project', id }); }
    for (let i = 0; i < 40 && C().project() !== id; i++) await real(60);
  }
  const W = () => (db().watch = db().watch || {});
  const say2 = (by, text) => K().post(PID, by, text);

  // ---------- the story (dur: ms at 1x; about 90 s in all) ----------
  const STEPS = [
    { id: 'project', title: 'A new project', dur: 6500, say: 'Hi, I’m Flint. Let’s make a game from nothing. First, a project: Lantern Run.', async run() {
      await hold(600);
      await point('the + button', ['#pj-plus', '#pj-rail']);
      await typeCmd('start a project called Lantern Run');
      if (!db().projects.some(p => p.id === PID)) await api('/projects', { method: 'POST', body: { name: GAME, emoji: '🏮' } });
      const p = db().projects.find(x => x.id === PID); if (p) { p.bio = 'A tiny night platformer: carry a little flame and light every lantern.'; p.members = { me: 'host', maya: 'builder' }; K().save(); K().push({ type: 'projects' }); }
      await inProject(PID); show('home'); await real(350);
      await point('the Lantern Run circle', [`#pj-rail [data-pj-open="${PID}"]`, '#pj-rail']);
    } },
    { id: 'vision', title: 'The vision', dur: 7000, say: 'Every project starts with one paragraph everyone reads first, AI helpers too.', async run() {
      await typeCmd('set the vision to: a cozy two-minute platformer…');
      await api('/vision', { method: 'PUT', body: { text: `# Vision · ${GAME}\n\nA cozy, two-minute platformer: carry a little flame named Wick through the night and light every lantern.\n\n## Done for v1\n- One level, six lanterns\n- Floaty, forgiving jumps\n- Plays in the browser and on phones\n` } });
      show('home'); if (window.TribeProjects && window.TribeProjects.overview) { try { await window.TribeProjects.overview(); } catch {} }
      await point('the vision on the dashboard', ['#pj-check [data-step="vision"]', '#pj-check', '#view-home']);
    } },
    { id: 'tasks', title: 'Tasks, assigned', dur: 8000, say: 'Three tasks: I take the level, Maya the art, Claude the sound. Each gets a name on it.', async run() {
      await typeCmd('add tasks: build level 1 (me), draw the lantern (Maya), jump sound (Claude)');
      const have = (db().tasks[PID] || []).length;
      if (!have) for (const [title, assignee] of [['[Levels] Build level 1: Lantern Hill', 'me'], ['[Art] Draw the lantern sprite', 'maya'], ['[Audio] A soft jump sound', 'claude']]) await api('/tasks', { method: 'POST', body: { title, assignee, status: assignee === 'me' ? 'doing' : 'backlog' } });
      show('tasks');
      const board = await point('the Task Board', ['#board', '#view-tasks']);
      if (board) for (const t of ['Lantern Hill', 'lantern sprite', 'jump sound']) { const card = await find(() => [...document.querySelectorAll('#board .task')].find(x => x.textContent.includes(t)), 1500); if (card) { spot(card); await glide('me', card, 0.3, 0.5); await hold(500); } }
    } },
    { id: 'friend', title: 'A friend joins', dur: 7500, say: 'Maya joins from a link on her phone, says hi and reacts. Chat is where friends and agents meet.', async run() {
      const m = db().members.find(x => x.id === 'maya'); if (m) { m.online = true; m.where = 'Chat'; K().save(); K().pushPresence(); }
      show('chat');
      await point('the chat', ['#chat-list', '#view-chat']);
      const mine = say2('me', 'Lantern Run is up! I’m on the level, Maya has the art, Claude the jump sound 🏮');
      await hold(900);
      say2('maya', 'Joined! On it 🎨');
      await hold(500);
      K().reactAs(K().chanOf('general'), mine, 'maya', '🔥');
      const rx = await point('Maya’s reaction', [`#chat-list .msg[data-id="${mine.id}"] .rx`, `#chat-list [data-id="${mine.id}"]`, '#chat-list'], { who: 'maya', dy: 0.5 });
      if (rx) await glide('me', rx, 0.5, 0.9);
      await hold(1400);   // a beat on the reaction
    } },
    { id: 'build', title: 'The game, from the starter', dur: 8000, say: 'Now the game. I build a platformer from the starter: no AI needed, it’s a recipe.', async run() {
      await typeCmd('make a platformer called Lantern Run');
      const card = buildCard(); document.body.appendChild(card);
      await point('the build log', '#dw-build');
      for (const li of card.querySelectorAll('li')) { await hold(320); li.classList.add('done'); }
      W().built = true; K().save();
      (db().gists[PID] = db().gists[PID] || []).unshift({ id: 'g-' + K().rid(6), kind: 'progress', title: 'Built Lantern Run from the starter', bullets: ['index.html, src/game.js, src/player.js, src/level.js', 'Runs in the preview'], files: [], by: 'me', byName: 'Flint', at: iso(), project: PID });
      say2('me', '🎮 **Lantern Run** runs! Open the preview to play.');
      card.remove();
      await openPreview();
      await point('the game in the preview', ['#pvw-iframe', '#pvw-stage', '#pvw']);
      await hold(800);
    } },
    { id: 'tune', title: 'Tune it', dur: 6000, say: 'It works, but the jump feels stiff. I just say what I want.', async run() {
      await typeCmd('make jumping floatier');
      const f = await openPreview();
      game({ tune: { gravity: 620, jump: 300 } });
      await point('the game', ['#pvw-iframe', '#pvw-stage']);
      game({ right: true }); await hold(350); game({ jump: true }); await hold(450); game({ jump: false }); await hold(600); game({ right: false });
      if (f) note('Floatier: gravity down a third, the jump holds a little longer. Saved as a version.');
    } },
    { id: 'sprite', title: 'A sprite from the board', dur: 7000, say: 'Maya pinned a firefly on the inspiration board. I drop it in as Wick’s friend.', async run() {
      const board = inspoCard(); document.body.appendChild(board);
      const tile = await point('the firefly on the inspiration board', '#dw-inspo [data-tile="firefly"]');
      const pv = await find(['#pvw-iframe', '#pvw-stage'], 1500);
      if (tile && pv) {
        const ghost = tile.cloneNode(true); ghost.className = 'dw-carry'; (layer || document.body).appendChild(ghost);
        const c = cursor('me'), move = () => { ghost.style.transform = `translate(${Math.round(c.x + 12)}px, ${Math.round(c.y + 8)}px)`; };
        move(); spot(pv);
        const iv = setInterval(move, 16); try { await glide('me', pv, 0.4, 0.5); } finally { clearInterval(iv); ghost.remove(); }
        ripple('me');
      }
      game({ sprite: 'firefly' });
      board.remove();
      await point('the game', ['#pvw-iframe', '#pvw-stage']);
    } },
    { id: 'comment', title: 'A comment pin', dur: 6500, say: 'Maya plays it and pins a comment right on the preview: the second gap is too wide.', async run() {
      const pv = await find(['#pvw-iframe', '#pvw-stage'], 1500);
      const list = ((db().pins = db().pins || {})[PID] = (db().pins || {})[PID] || []);
      const pin = { id: 'p-' + K().rid(8), surface: 'preview', target: { href: 'index.html', x: 0.42, y: 0.62 }, by: 'maya', at: iso(), resolved: false, thread: [{ id: 'c-' + K().rid(8), by: 'maya', at: iso(), text: 'This second gap is too wide for a first level 😅' }] };
      list.push(pin); W().pin = pin.id; K().save(); K().push({ type: 'pins', project: PID, pin: { ...pin, byName: 'Maya', color: '#6C7CFF' } });
      const mark = pinMark(pv, pin); document.body.appendChild(mark);
      cursor('maya');
      await point('Maya’s comment pin', '#dw-pin', { who: 'maya', dx: 0.04, dy: 1.1 });
    } },
    { id: 'fix', title: 'Flint fixes it', dur: 6500, say: 'I read the pin, widen the platform and answer her. The pin closes itself.', async run() {
      await typeCmd('fix: make the second gap shorter');
      game({ fix: true });
      const pin = ((db().pins || {})[PID] || []).find(p => p.id === W().pin);
      if (pin) { pin.thread.push({ id: 'c-' + K().rid(8), by: 'me', at: iso(), text: 'Shorter now: the platform is two tiles wider. Try it!' }); pin.resolved = true; pin.resolvedBy = 'me'; K().save(); K().push({ type: 'pins', project: PID, pin }); }
      const mk = $('#dw-pin'); if (mk) { mk.classList.add('done'); mk.querySelector('.dw-pin-t').innerHTML = '<b>Flint</b> Shorter now: the platform is two tiles wider. ✓ Resolved'; }
      await point('the resolved pin', '#dw-pin');
      await hold(1200); if (mk) mk.remove();
    } },
    { id: 'approve', title: 'Approve', dur: 7000, say: 'Changes join the main version only when a person says yes. One tap.', async run() {
      closePreview();
      const t = (db().tasks[PID] || [])[0];
      let ap = (db().approvals || []).find(a => a.status === 'pending' && a.project === PID);
      if (!ap && t) ap = K().askApproval(PID, t, 'claude');
      if (window.TribeNotify && window.TribeNotify.openInbox) { try { window.TribeNotify.openInbox(); } catch {} }
      const btn = ap ? await point('the Approve button', [`[data-decide="approve"][data-ap="${ap.id}"]`]) : null;
      if (btn) { await press(btn); await point('the approved request', () => [...document.querySelectorAll('#nf-list > *, #nf-list > * > *')].filter(e => /Approved by/.test(e.textContent) && e.getBoundingClientRect().height > 40).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0]); }
      if (ap && ap.status === 'pending') { try { await api(`/approvals/${encodeURIComponent(ap.id)}/approve`, { method: 'POST', body: { note: 'Ship it' } }); } catch {} }
      await hold(700);
      if (window.TribeNotify && window.TribeNotify.closeInbox) { try { window.TribeNotify.closeInbox(); } catch {} }
    } },
    { id: 'website', title: 'A tiny website', dur: 7500, say: 'Every game needs a page to share. One from the templates, filled in from the vision.', async run() {
      await typeCmd('make a website for the game');
      try { await api(`/projects/${PID}/website/instant`, { method: 'POST', body: { type: 'game', theme: 'retro' } }); } catch {}
      if (window.TribeShell && window.TribeShell.go) window.TribeShell.go('website'); else if (window.TribeWebsite) window.TribeWebsite.open();
      await point('the website draft', ['#wb-frame', '#view-docs .wb-preview', '#view-docs'], { ms: 3000 });
      await hold(1200);
    } },
    { id: 'play', title: 'It plays itself', dur: 9000, say: 'And here it is, playing itself: Wick runs, hops the gaps and lights the lanterns.', async run() {
      show('home'); lit = 0;
      const f = await openPreview();
      await point('the game', ['#pvw-iframe', '#pvw-stage']);
      for (let i = 0; i < 30 && f && !f.dataset.dwLoaded; i++) await real(100);   // the game said hello
      game({ reset: true }); game({ auto: true });
      for (let i = 0; i < 80 && lit < 4; i++) await hold(100);
      if (f) note(`Wick lit ${lit} lantern${lit === 1 ? '' : 's'} by himself. That’s the real game, running in the preview.`);
    } },
    { id: 'proof', title: 'Proof of work', dur: 6500, say: 'Last: a ZIP with everything we made and who made it. Yours to keep.', async run() {
      game({ auto: false }); closePreview();
      await typeCmd('export the proof of work');
      const card = proofCard(); document.body.appendChild(card);
      await point('the proof ZIP', '#dw-proof [data-dw-dl]');
    } },
    { id: 'end', title: 'Your turn', dur: 3000, say: 'That’s TribeCode: friends and their AI helpers, building one thing together. Your turn.', async run() {
      const pc = $('#dw-proof'); if (pc) pc.remove();
      endCard();
      await point('the Your turn card', '#dw-end .dw-end-card', { scroll: false });
    } },
  ];
  const offsets = []; let TOTAL = 0; STEPS.forEach(s => { offsets.push(TOTAL); TOTAL += s.dur; });

  // ---------- the small cards Flint brings along (flat, 1px borders, tokens) ----------
  function buildCard() {
    const c = document.createElement('div'); c.className = 'dw-card dw-build'; c.id = 'dw-build';
    c.innerHTML = `<span class="eyebrow">Starter · platformer</span><b>Building Lantern Run</b><ul>${['index.html', 'src/game.js', 'src/player.js', 'src/level.js', 'src/lanterns.js'].map(f => `<li><code>${f}</code></li>`).join('')}</ul>`;
    return c;
  }
  function inspoCard() {
    const c = document.createElement('div'); c.className = 'dw-card dw-inspo'; c.id = 'dw-inspo';
    const px = (fill, cells) => `<svg viewBox="0 0 8 8" width="44" height="44" shape-rendering="crispEdges">${cells.map(([x, y, f]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${f || fill}"/>`).join('')}</svg>`;
    const firefly = px('#FABD2F', [[3, 2, '#9AA4B2'], [4, 2, '#9AA4B2'], [2, 3, '#E8EAED'], [5, 3, '#E8EAED'], [3, 3], [4, 3], [3, 4], [4, 4], [3, 5, '#F26B1D'], [4, 5, '#F26B1D']]);
    const moth = px('#9AA4B2', [[1, 3], [2, 3], [5, 3], [6, 3], [2, 4], [3, 4, '#E8EAED'], [4, 4, '#E8EAED'], [5, 4], [3, 5], [4, 5]]);
    const star = px('#FABD2F', [[3, 1], [3, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [3, 4], [2, 5], [4, 5]]);
    c.innerHTML = `<span class="eyebrow">Inspiration board · Maya</span><div class="dw-tiles"><button class="dw-tile" data-tile="firefly">${firefly}<small>Firefly</small></button><button class="dw-tile" data-tile="moth">${moth}<small>Moth</small></button><button class="dw-tile" data-tile="star">${star}<small>Star</small></button></div>`;
    return c;
  }
  function pinMark(pv, pin) {
    const m = document.createElement('div'); m.className = 'dw-pin'; m.id = 'dw-pin';
    const r = pv ? pv.getBoundingClientRect() : { left: innerWidth * 0.5, top: innerHeight * 0.3, width: 400, height: 300 };
    m.style.left = Math.round(r.left + r.width * pin.target.x) + 'px'; m.style.top = Math.round(r.top + r.height * pin.target.y) + 'px';
    m.innerHTML = `<i class="dw-pin-dot">M</i><p class="dw-pin-t"><b>Maya</b> ${esc(pin.thread[0].text)}</p>`;
    return m;
  }
  let zipBlob = null;
  function proofFiles() {
    const d = db(), p = d.projects.find(x => x.id === PID) || {}, tasks = d.tasks[PID] || [], chat = (d.chat[PID] || []).filter(m => m.text);
    const who = id => ((d.members.find(m => m.id === id) || {}).name || id);
    return [
      ['README.md', `# ${GAME}: proof of work\n\nMade in TribeCode by ${d.members.filter(m => m.role !== 'agent').map(m => m.name).join(', ')} and Claude, ${new Date().toDateString()}.\nA demo run: everything below happened in the app, live.\n`],
      ['vision/VISION.md', (d.vision || {})[PID] || ''],
      ['tasks/board.md', tasks.map(t => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}${t.assignee ? ` (${who(t.assignee)})` : ''}`).join('\n') + '\n'],
      ['chat/transcript.md', chat.map(m => `**${who(m.by)}** ${m.text}`).join('\n\n') + '\n'],
      ['game/README.md', `${GAME}: a night platformer from the starter. Tuned: floatier jumps. Added: a firefly friend. Fixed: the second gap (Maya's pin).\n`],
      ['TIMELINE.md', STEPS.map((s, i) => `${i + 1}. ${s.title}`).join('\n') + '\n'],
    ];
  }
  function proofCard() {
    const files = proofFiles();
    try { zipBlob = window.TribeExport && window.TribeExport.zip ? window.TribeExport.zip(files, 'application/zip') : new Blob([files.map(f => f[1]).join('\n')], { type: 'text/plain' }); } catch { zipBlob = null; }
    const c = document.createElement('div'); c.className = 'dw-card dw-proof'; c.id = 'dw-proof';
    c.innerHTML = `<span class="eyebrow">Proof of work</span><b>lantern-run-proof.zip</b><ul>${files.map(f => `<li class="done"><code>${esc(f[0])}</code></li>`).join('')}</ul><button class="btn primary sm" data-dw-dl>Download the ZIP</button>`;
    c.querySelector('[data-dw-dl]').onclick = () => { if (!zipBlob) return; const u = URL.createObjectURL(zipBlob), a = document.createElement('a'); a.href = u; a.download = 'lantern-run-proof.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
    return c;
  }
  function endCard() {
    if ($('#dw-end')) return;
    const e = document.createElement('div'); e.className = 'dw-end'; e.id = 'dw-end'; e.setAttribute('role', 'dialog'); e.setAttribute('aria-label', 'Your turn');
    e.innerHTML = `<div class="dw-end-card"><img src="assets/flint.svg" alt="" width="48" height="48"><span class="eyebrow">Your turn</span><h2>Make something with your friends</h2>
      <p>A project, a vision, tasks for everyone, a game that runs, a page to share. Free, no AI needed to start.</p>
      <div class="dw-end-acts"><button class="btn primary" id="dw-start">Start a project</button><button class="btn" id="dw-try">Try it yourself</button></div>
      <div class="dw-end-more"><button class="linkish" id="dw-again">Watch again</button><span aria-hidden="true">·</span><a class="linkish" href="${RELEASES}" target="_blank" rel="noopener">Get the desktop app</a></div></div>`;
    document.body.appendChild(e);
    e.querySelector('#dw-start').onclick = () => { try { sessionStorage.setItem('tribecode.afterDemo', 'start'); } catch {} exit(); };
    e.querySelector('#dw-try').onclick = () => { stop(); O().start('quiet'); };
    e.querySelector('#dw-again').onclick = () => restart();
  }

  // ---------- the runner ----------
  async function runFrom(i) {
    const me = token;
    for (idx = i; idx < STEPS.length; idx++) {
      if (me !== token || !running) return;
      const s = STEPS[idx]; clock = Math.max(clock, offsets[idx]); caption(s, idx);
      try { await s.run(); const left = offsets[idx] + s.dur - clock; if (left > 0) await hold(left); }
      catch (e) { if (e === ABORT) { if (me !== token || !running) return; } else { console.warn('demo watch:', s.id, e); log.push({ step: s.id, target: 'run', found: false, error: String(e && e.message || e) }); } }
    }
    if (me === token && running) finish();
  }
  function finish() {
    finished = true; spot(null); idx = STEPS.length - 1;
    document.querySelectorAll('#dw-segs [data-i]').forEach(b => { b.classList.add('past'); b.classList.remove('on'); });
    endCard(); paintCtl(); log.push({ step: 'end', target: 'finished', found: true });
    Object.values(cursors).forEach(c => c.el.remove()); for (const k of Object.keys(cursors)) delete cursors[k];
  }
  function start(opts = {}) {
    if (!on()) { begin(); return false; }   // from inside the real app: the demo starts in this tab
    hook(); stop(true);
    const sp = Number(opts.speed) || 1; speedN = sp === 2 ? 2 : 1; turbo = sp >= 3 ? sp : 1;   // ?speed=4 (tests): the whole clock runs 4x; the bar offers people 1x and 2x
    running = true; paused = false; finished = false; token++; clock = 0; last = performance.now(); log.length = 0; gs = {}; lit = 0;
    mount(); clearInterval(tick); tick = setInterval(loop, 33);
    closePreview(); runFrom(0); return true;
  }
  function stop(quiet) {
    running = false; token++; clearInterval(tick); tick = null; paused = false;
    Object.values(cursors).forEach(c => c.el.remove()); for (const k of Object.keys(cursors)) delete cursors[k];
    unmount(); game({ auto: false });
    if (!quiet) log.push({ step: STEPS[idx] && STEPS[idx].id, target: 'stopped', found: true });
  }
  function pause() { if (!running || finished) return; paused = true; spot(null); paintCtl(); }
  function play() { if (!running || finished) return; paused = false; last = performance.now(); paintCtl(); }
  function speed(n) { speedN = n === 2 ? 2 : 1; paintCtl(); }
  function skipToEnd() {
    if (!running) return; token++; const me = token;
    closePreview(); for (const id of ['#dw-inspo', '#dw-pin', '#dw-build', '#dw-proof']) { const e = $(id); if (e) e.remove(); }
    paused = false; idx = STEPS.length - 1; caption(STEPS[idx], idx); clock = offsets[idx];
    (async () => { try { await STEPS[idx].run(); } catch {} if (me === token && running) finish();
    })();
  }
  function restart() { stop(true); try { sessionStorage.setItem('tribecode.watch.next', '1'); } catch {} O().reset(); }
  function exit() { stop(true); if (O() && O().exit) O().exit(); }

  // Esc ends the show (no dim, no cursors) and leaves the tribe to explore; the pill still has Exit
  addEventListener('keydown', e => {
    if (!running) return;
    if (e.key === 'Escape' && e.isTrusted) { e.preventDefault(); stop(); if (A() && A().toast) A().toast('Stopped. Look around, or Exit the demo from the pill at the top.'); }
    else if (e.key === ' ' && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '') && !e.target.isContentEditable) { e.preventDefault(); paused ? play() : pause(); }
  }, true);
  addEventListener('resize', () => { if (running && idx >= 0) spot(null); });


  window.TribeDemoWatch = {
    seed, start, stop, pause, play, speed, skipToEnd, exit, begin, active: () => running,
    _test: { log: () => log.slice(), state: () => ({ running, paused, finished, idx, id: STEPS[idx] && STEPS[idx].id, steps: STEPS.map(s => s.id), speed: speedN, clock: Math.round(clock), lit }) },
  };

  // ---------- entry points: ?demo=watch, Help, the empty Home's "Tour with Flint" (after the API: offline.js seeds from it) ----------
  const params = new URLSearchParams(location.search);
  let want = null;
  if (params.get('demo') === 'watch' && O()) {
    want = { speed: Number(params.get('speed')) || 1 };
    O().boot('watch', true);
    params.delete('demo'); params.delete('speed');
    try { history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); } catch {}
    try { sessionStorage.setItem('tribecode.view', 'home'); sessionStorage.setItem('tribecode.watch.speed', String(want.speed)); } catch {}
    window.__tribeRestoredView = true;
  } else { try { if (sessionStorage.getItem('tribecode.watch.next')) { sessionStorage.removeItem('tribecode.watch.next'); want = { speed: Number(sessionStorage.getItem('tribecode.watch.speed')) || 1 }; } } catch {} }
  // the Home's "Tour with Flint" with no tribe yet, and Help's entry: watch Flint build a game
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('#hub-tour, [data-dw-start]'); if (!t) return;
    const hasTribe = !!(C() && C().hasToken && C().hasToken()) && !on();
    const paused = !!(window.TribeFlintTour && window.TribeFlintTour.state && window.TribeFlintTour.state().paused);
    if (t.id === 'hub-tour' && (hasTribe || paused)) return;   // a real tribe, or "Continue the tour": Flint's look around the real places (flinttour.js)
    e.preventDefault(); e.stopPropagation(); begin();
  }, true);
  // from anywhere (the real app, another demo): a fresh watch demo in this tab, after a reload so nothing else is mounted
  function begin() { if (on() && !running) return start({ speed: 1 }); try { sessionStorage.setItem('tribecode.watch.next', '1'); sessionStorage.setItem('tribecode.watch.speed', '1'); sessionStorage.setItem('tribecode.view', 'home'); } catch {} O().boot('watch', true); location.reload(); }
  function boot() {
    const c = C(); if (!c) return;
    // after "Start a project" on the Your turn card: the real app is back; open its first-project flow
    let after = null; try { after = sessionStorage.getItem('tribecode.afterDemo'); sessionStorage.removeItem('tribecode.afterDemo'); } catch {}
    if (after === 'start' && !on()) setTimeout(() => { const b = document.querySelector('#hub-host button, #hub-host [data-act], #hub-host'); if (b && b.click) b.click(); }, 1200);
    if (on()) {
      if (!want) { try { if (sessionStorage.getItem('tribecode.watch.next')) { sessionStorage.removeItem('tribecode.watch.next'); want = { speed: 1 }; } } catch {} }
      if (!want) return;
      hook();
      const go1 = () => { if (!want) return; const w = want; want = null; setTimeout(() => start(w), 700); };
      if (c.connected()) go1(); else c.on('hello', go1);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (on()) hook();

})();
