// "See how TribeCode works" (fix/desk-demo): a hands-off, ~2-minute tour that starts from a BLANK SLATE. You do nothing:
// Flint drives the REAL app in an isolated demo (offline.js, mode 'watch': it lives in this tab only, never touches your
// own settings, shows none of your data, and is wiped on exit) while a caption says what he's doing and a spotlight + his
// cursor move to each real place. The first frame is an empty dashboard: no tribe, no projects. Then Flint makes it all:
//   1 a blank slate   2 make a tribe   3 start a project   4 write the vision   5 a friend joins and chats
//   6 tasks: assign, accept   7 make something in Files and Design   8 the website from a template   9 preview and a
//   comment   10 approve   11 the Company card   12 Your turn
// Chapter dots in the bar jump to any chapter (each chapter makes what it needs, so it plays on its own too; the first one
// starts over from blank). No AI and no server: the offline backend answers the API (plus the watch-only answers below).
// Every target is found within 2 s (a watchdog) or skipped with a short note; Esc, Exit, the end and any error always
// lift the dim. Controls: Pause/Play, 1x/2x, Skip to end, Exit (back to your own app, clean), the chapter dots.
// Start: app/?demo=watch (the website's "See how TribeCode works"), Help › See how TribeCode works, the empty Home's
// "Tour with Flint", Welcome's "Just watch it". The same in the browser, the phone/PWA and the desktop app (inside a demo
// the desktop app never starts, stops or signs in to its own tribe server: offline.js). ?speed=4 plays it faster (tests).
//   window.TribeDemoWatch = { start(), stop(), pause(), play(), speed(n), jump(i), skipToEnd(), begin(), exit(), seed(ctx), active(), _test: { log(), state() } }
(function () {
  'use strict';
  const O = () => window.TribeOffline, K = () => window.TribeOffline && window.TribeOffline._k;
  const A = () => window.TribeApp, C = () => window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PID = 'ember-cafe', NAME = 'Ember Café', TRIBE = 'Flint’s Workshop', RELEASES = 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const BIO = 'Our friend’s café: a website, a menu and the opening week.';
  const VISION = 'A warm little website for Ember Café: the menu, the hours and an order button, made by friends in one weekend.';
  const LABEL = 'See how TribeCode works';
  const on = () => !!(O() && O().mode && O().mode() === 'watch');
  const db = () => K().db();
  const iso = (t = Date.now()) => new Date(t).toISOString();

  // ---------- the blank slate: Flint alone, no tribe yet, no projects (the socket waits until he makes the tribe) ----------
  function seed({ iso: iso2 }) {
    const now = Date.now();
    return {
      on: true, v: 1, mode: 'watch', blank: true, created: iso2(now), seq: 0,
      tribe: { name: '', created: iso2(now) },
      members: [{ id: 'me', name: 'Flint', color: '#F26B1D', role: 'host', joined: iso2(now) }],
      current: null, projects: [],
      chat: {}, tasks: {}, docs: {}, vision: {}, gists: {}, company: {}, whiteboard: {},
      scratch: [], uploads: [], invites: [], friends: [], prefs: { pins: [] }, joinedRio: true, mayaHi: true, huddled: true, commented: true, approvals: [], inbox: [],
    };
  }
  // what "Create" makes: the tribe (just Flint), its first project, a hello in chat; then the app connects
  function create(draft) {
    const d = db(); if (!d) return;
    const now = iso(), name = String((draft && draft.name) || NAME).slice(0, 48), bio = String((draft && draft.bio) || BIO).slice(0, 300);
    if (!d.projects.some(p => p.id === PID)) {
      d.tribe = { name: TRIBE, created: now };
      d.projects.push({ id: PID, name, emoji: '☕', image: null, bio, color: '#F26B1D', channel: 'general', default: true, created: now, members: { me: 'host' } });
      d.chat[PID] = [{ id: 'm-' + K().rid(), at: now, by: 'tribecode', text: `Flint started **${TRIBE}** and its first project, **${name}**. It lives only in this tab.` }];
      d.tasks[PID] = []; d.docs[PID] = []; d.vision[PID] = ''; d.gists[PID] = [];
      d.current = PID;
    }
    K().save(); O().wake();
  }

  // ---------- the few answers only this tour needs (the offline backend answers the rest) ----------
  const gameUrl = () => new URL('demo-game.html', location.href).href;
  const W = () => (db().watch = db().watch || {});
  function route(method, parts, q, body, headers) {
    const d = K() && K().db(); if (!d || d.mode !== 'watch') return null;
    const [a, b, c] = parts, ok = x => [200, x], w = d.watch = d.watch || {};
    // the blank slate has no tribe and no project yet: nothing to read, nothing to change (the app asks very little before it connects)
    if (d.blank || !d.projects.length) return method === 'GET' ? ok({}) : [404, { error: 'Make a project first' }];
    if (a === 'preview') {
      const pid = (headers['x-project'] && d.projects.some(p => p.id === headers['x-project'])) ? headers['x-project'] : K().cur();
      const built = !!w.built && pid === PID;
      const info = { project: pid, path: built ? gameUrl() : null, expires: iso(Date.now() + 3600e3), hasRepo: built, hasIndex: built, mode: 'static', root: '.', canConfigure: false };
      if (method === 'POST' && b === 'token') return ok(info);
      if (method === 'GET' && !b) return ok({ preview: info });
    }
    if (a === 'projects' && c === 'widgets' && method === 'GET') return ok({ widgets: (d.widgets || {})[b] || [], canEdit: true, preview: { show: b === PID && !!w.built, label: 'Preview', kind: 'game' }, website: { show: false } });
    if (a === 'projects' && c === 'site-config') { if (method === 'GET') return ok({ config: (w.site || {})[b] || null }); if (method === 'PUT') { (w.site = w.site || {})[b] = body.config || body; K().save(); return ok({ ok: true }); } }
    if (a === 'tasks' && b === 'settings') {
      if (method === 'PUT') { w.work = { ...(w.work || {}), ...body }; K().save(); }
      return ok({ settings: { mode: 'lead', claimLimit: 0, agentAutoAccept: false, ...(w.work || {}) }, lead: true });
    }
    if (a === 'tasks' && c === 'accept' && method === 'POST') {
      const t = (d.tasks[K().cur()] || []).find(x => x.id === b); if (!t) return [404, { error: 'task not found' }];
      t.accept = 'accepted'; if (t.status === 'backlog') t.status = 'doing'; t.updated = iso(); K().save(); K().push({ type: 'task', task: t });
      return ok({ task: t });
    }
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
  const seen = el => !!(el && el.isConnected && el.getClientRects().length && el.getBoundingClientRect().width > 0);
  const pick = sel => { for (const x of [].concat(sel)) { const el = typeof x === 'function' ? x() : [...document.querySelectorAll(x)].find(seen); if (seen(el)) return el; } return null; };   // the first of a list (selectors or functions) that is on screen
  async function hold(ms) { const t = token, end = clock + ms; while (clock < end) { await new Promise(r => setTimeout(r, 30)); if (t !== token || !running) throw ABORT; } }
  async function real(ms) { const t = token; await new Promise(r => setTimeout(r, ms)); if (t !== token || !running) throw ABORT; }
  // the watchdog: a target (a selector, a list of them, or a function) within 2 s of real time, else null
  async function find(sel, ms = 2000) {
    const end = Date.now() + ms, t = token;
    for (;;) { const el = pick(sel); if (el) return el; if (Date.now() > end) return null; await new Promise(r => setTimeout(r, 60)); if (t !== token || !running) throw ABORT; }
  }

  // ---------- the layer: the dim (four flat panels around a hole), the ring, the cursors, the caption and the bar ----------
  let layer = null, ui = null;
  const EXTRAS = ['#dw-end', '#dw-pin'];
  function mount() {
    unmount();
    document.body.classList.add('dw-on');
    layer = document.createElement('div'); layer.className = 'dw-layer'; layer.id = 'dw-layer'; layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<div class="dw-dim" id="dw-dim"><i data-d="t"></i><i data-d="l"></i><i data-d="r"></i><i data-d="b"></i></div><div class="dw-ring" id="dw-ring"></div>';
    document.body.appendChild(layer);
    ui = document.createElement('section'); ui.className = 'dw-ui'; ui.id = 'dw-ui'; ui.setAttribute('role', 'region'); ui.setAttribute('aria-label', LABEL);
    ui.innerHTML = `<div class="dw-cap" id="dw-cap" aria-live="polite"><img src="assets/flint.svg" alt="" width="36" height="36"><div class="dw-cap-b"><span class="dw-k" id="dw-k">Flint · 1 of ${STEPS.length}</span><b class="dw-t" id="dw-t"></b><p class="dw-say" id="dw-say"></p><p class="dw-cmd" id="dw-cmd" hidden></p></div></div>
      <div class="dw-bar"><button class="dw-b dw-play" id="dw-play" aria-label="Pause" title="Pause (Space)"><span class="dw-pp" aria-hidden="true">❚❚</span></button>
        <nav class="dw-dots" id="dw-dots" aria-label="Chapters">${STEPS.map((s, i) => `<button type="button" class="dw-dot" data-i="${i}" title="${i + 1}. ${esc(s.title)}" aria-label="Chapter ${i + 1}: ${esc(s.title)}"><i><b></b></i></button>`).join('')}</nav>
        <span class="dw-time" id="dw-time">0:00</span>
        <button class="dw-b" id="dw-speed" aria-pressed="false" title="Speed">1×</button>
        <button class="dw-b" id="dw-skip" title="Skip to the end">Skip to end</button>
        <button class="dw-b dw-x" id="dw-exit" title="Exit the tour: back to your own app">Exit</button></div>`;
    document.body.appendChild(ui);
    ui.querySelector('#dw-play').onclick = () => (finished ? restart() : paused ? play() : pause());
    ui.querySelector('#dw-speed').onclick = () => speed(speedN === 2 ? 1 : 2);
    ui.querySelector('#dw-skip').onclick = () => skipToEnd();
    ui.querySelector('#dw-exit').onclick = () => exit();
    ui.querySelector('#dw-dots').onclick = e => { const b = e.target.closest('[data-i]'); if (b) jump(Number(b.dataset.i)); };
    paintCtl();
  }
  function unmount() {
    for (const id of ['#dw-layer', '#dw-ui', ...EXTRAS]) { const e = $(id); if (e) e.remove(); }
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
  function dropCursor(id) { if (cursors[id]) { cursors[id].el.remove(); delete cursors[id]; } }
  async function glide(id, el, dx = 0.5, dy = 0.5) {
    const c = cursor(id); if (!el) return;
    if (!el.isConnected) { if (followEl && followEl.isConnected) el = followEl; else return; }   // re-rendered meanwhile: where the spotlight is now
    const r = el.getBoundingClientRect(), to = { x: Math.min(innerWidth - 8, Math.max(8, r.left + r.width * dx)), y: Math.min(innerHeight - 8, Math.max(8, r.top + r.height * dy)) };
    if (calm()) { c.x = to.x; c.y = to.y; place(c); return; }
    const from = { x: c.x, y: c.y }, dur = Math.max(250, Math.min(900, Math.hypot(to.x - from.x, to.y - from.y) * 0.9)), t0 = clock;
    for (;;) { const p = Math.min(1, (clock - t0) / dur), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; c.x = from.x + (to.x - from.x) * e; c.y = from.y + (to.y - from.y) * e; place(c); if (p >= 1) break; await hold(16); }
  }
  function ripple(id) { const c = cursors[id]; if (!c || calm()) return; const r = document.createElement('i'); r.className = 'dw-ripple'; r.style.left = c.x + 'px'; r.style.top = c.y + 'px'; r.style.setProperty('--c', c.el.style.getPropertyValue('--c')); (layer || document.body).appendChild(r); setTimeout(() => r.remove(), 600); }
  // point: the watchdog finds the target, the spotlight and a cursor go there; a miss is logged and skipped
  async function point(name, sel, opts = {}) {
    const el = await find(sel, opts.ms || 2000);
    log.push({ step: STEPS[idx] && STEPS[idx].id, target: name, found: !!el });
    if (!el) { note(`(I couldn’t find ${name} on this screen, so I’ll keep going.)`); spot(null); return null; }
    if (opts.scroll !== false) { const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight - 140) el.scrollIntoView({ block: 'center', behavior: 'instant' }); }
    spot(el); followSel = sel; await glide(opts.who || 'me', el, opts.dx, opts.dy);
    return el;
  }
  async function press(el, who = 'me', click = true) { if (!el) return; ripple(who); await hold(160); if (click && el.isConnected) el.click(); await hold(220); }
  function caption(s, i) {
    const k = $('#dw-k'), t = $('#dw-t'), say = $('#dw-say'), cmd = $('#dw-cmd'); if (!k) return;
    k.textContent = `Flint · ${i + 1} of ${STEPS.length}`; t.textContent = s.title; say.textContent = s.say; cmd.hidden = true;
    document.querySelectorAll('#dw-dots [data-i]').forEach(b => { const n = Number(b.dataset.i); b.classList.toggle('past', n < i); b.classList.toggle('on', n === i); if (n === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    const cap = $('#dw-cap'); if (cap) { cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in'); }
  }
  function note(text) { const say = $('#dw-say'); if (say) say.textContent = text; }
  async function typeCmd(text) {   // what Flint "types": shown in the caption as a command line
    const cmd = $('#dw-cmd'); if (!cmd) return; cmd.hidden = false; cmd.textContent = '› ';
    if (calm()) { cmd.textContent = '› ' + text; return; }
    for (const ch of text) { cmd.textContent += ch; await hold(24); }
  }
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function paintTime() { const t = $('#dw-time'); if (t) t.textContent = `${mmss(Math.min(clock, TOTAL))} / ${mmss(TOTAL)}`; if (idx >= 0 && !finished) { const s = STEPS[idx], fill = document.querySelector(`#dw-dots [data-i="${idx}"] b`); if (fill && s) fill.style.width = Math.min(100, Math.max(0, (clock - (offsets[idx] || 0)) / s.dur * 100)) + '%'; } }
  function paintCtl() {
    const p = $('#dw-play'); if (p) { const lab = finished ? 'Watch again' : paused ? 'Play' : 'Pause'; p.setAttribute('aria-label', lab); p.title = lab; p.querySelector('.dw-pp').textContent = finished ? '↻' : paused ? '▶' : '❚❚'; }
    const sp = $('#dw-speed'); if (sp) { sp.textContent = speedN === 2 ? '2×' : '1×'; sp.setAttribute('aria-pressed', String(speedN === 2)); sp.classList.toggle('on', speedN === 2); }
    document.body.classList.toggle('dw-paused', paused);
  }

  // ---------- small helpers over the app ----------
  const api = (p, o) => C().api(p, o);
  const swap = fn => { try { if (window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(fn); else fn(); } catch {} };
  const show = v => swap(() => A().show(v));
  const go = key => { try { if (window.TribeShell && window.TribeShell.go) window.TribeShell.go(key); } catch {} };
  const closePreview = () => { try { if (window.TribePreview) window.TribePreview.close(); } catch {} };
  const say2 = (by, text, extra) => K().post(PID, by, text, extra);
  const byText = (sel, re, root = document) => () => [...root.querySelectorAll(sel)].find(e => re.test(e.textContent || '') && e.getBoundingClientRect().width > 0);
  // the game in the preview: one small beat, it plays itself
  let lit = 0;
  addEventListener('message', e => {
    const m = e.data; if (!m || m.tour !== 'game' || typeof m.lit !== 'number') return;
    lit = Math.max(lit, m.lit);
    const fr = $('#pvw-iframe'); if (fr && e.source === fr.contentWindow) fr.dataset.dwLoaded = '1';
    if (running && m.lit === 0 && e.source) { try { e.source.postMessage({ tour: 'keys', auto: true }, '*'); } catch {} }
  });
  const game = msg => { const f = $('#pvw-iframe'); if (f && f.contentWindow) f.contentWindow.postMessage({ tour: 'keys', ...msg }, '*'); };
  async function openPreview() {
    if (window.TribeWidgets && window.TribeWidgets.refresh) { try { await window.TribeWidgets.refresh(); } catch {} }
    if (!$('#pvw-iframe') && window.TribePreview) { try { await window.TribePreview.open(); } catch {} }
    const f = await find('#pvw-iframe', 4000);
    if (f && !/demo-game\.html/.test(f.src)) f.src = gameUrl();
    return f;
  }
  // every chapter makes what it needs, so a chapter dot can start anywhere
  async function inProject() {
    if (db().blank || !db().projects.some(p => p.id === PID)) create(null);
    for (let i = 0; i < 40 && !C().connected(); i++) await real(60);
    const inGlobal = () => document.body.classList.contains('global') || document.body.dataset.view === 'hub' || document.body.dataset.view === 'work';
    if (C().project() !== PID || inGlobal()) { if (window.TribeProjects && window.TribeProjects.switchTo) await window.TribeProjects.switchTo(PID, 'home'); else C().send({ type: 'project', id: PID }); }
    for (let i = 0; i < 40 && C().project() !== PID; i++) await real(60);
  }
  function friendJoins() {   // Maya joins the tribe and the project
    const d = db(), p = d.projects.find(x => x.id === PID);
    if (!d.members.some(m => m.id === 'maya')) {
      d.members.push({ id: 'maya', name: 'Maya', color: '#6C7CFF', role: 'builder', joined: iso(), online: true, where: 'Chat' });
      if (p) p.members = { ...(p.members || {}), maya: 'builder' };
      K().save(); K().pushPresence(); K().push({ type: 'projects' });
      say2('tribecode', 'Maya joined with an invite link 👋');
    }
  }
  function tidy() {   // what the last chapter opened goes away before the next one
    const W2 = window;
    try { if (W2.TribeLocalSetup && W2.TribeLocalSetup.state().open) W2.TribeLocalSetup.close(); } catch {}
    try { if (W2.TribeSiteDesigner && document.querySelector('#wdz:not([hidden])')) W2.TribeSiteDesigner.close(); } catch {}
    try { if (W2.TribeCanvas && W2.TribeCanvas.state && W2.TribeCanvas.state().open) W2.TribeCanvas.close(); } catch {}
    try { if (W2.TribeNotify && W2.TribeNotify.closeInbox) W2.TribeNotify.closeInbox(); } catch {}
    try { if (W2.TribeFilesView && W2.TribeFilesView.closeMenus) W2.TribeFilesView.closeMenus(); } catch {}
    game({ auto: false }); closePreview();
    for (const id of ['#dw-pin']) { const e = $(id); if (e) e.remove(); }
    dropCursor('maya');
  }
  const task = title => (db().tasks[PID] || []).find(t => t.title === title);
  function taskNow(title, fields) {
    let t = task(title); if (!t) t = K().addTask(PID, { title, by: 'me' });
    Object.assign(t, fields, { updated: iso() }); K().save(); K().push({ type: 'task', task: t }); return t;
  }
  const row = id => `#board .task[data-id="${id}"]`;
  // Flint types into a real field, one letter at a time (input events, so the app sees it as typing)
  async function typeInto(el, text) {
    if (!el) return; el.focus();
    const put = v => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    if (calm()) return put(text);
    put('');
    for (let i = 1; i <= text.length; i++) { if (!el.isConnected) return; put(text.slice(0, i)); await hold(28); }
  }

  // ---------- the story (dur: ms at 1x; about two minutes in all) ----------
  const STEPS = [
    { id: 'blank', title: 'A blank slate', dur: 7000, say: 'Hi, I’m Flint. This is TribeCode with nothing in it: no tribe, no projects. Let’s make something from scratch.', async run() {
      try { if (window.TribeHub) swap(() => window.TribeHub.open('home')); } catch {}
      await hold(300);
      await point('the empty dashboard', ['#hub-hero.hub-empty', '#hub-hero', '#view-hub']);
      await hold(1400);
      note('The rail on the left is empty too: every circle there will be a project.');
      await point('the empty rail', ['#pj-rail', '.rail']);
    } },
    { id: 'tribe', title: 'Make a tribe', dur: 10000, say: 'A tribe is a group of friends, people and AIs, making things together. Mine starts with one click.', async run() {
      if (!db().blank && db().projects.some(p => p.id === PID)) { note('The tribe is already here.'); await point('the tribe', ['#pj-rail']); return; }
      try { if (window.TribeHub) swap(() => window.TribeHub.open('home')); } catch {}
      const go1 = await point('Start your first project', ['#hub-host', '#hub-hero .he-go']);
      await press(go1);
      if (!$('#su-start') && window.TribeLocalSetup) { try { window.TribeLocalSetup.start(); } catch {} }
      await point('the start sheet', ['#su-start', '#su-form'], { ms: 2500 });
      const nm = await find('#su-name', 1500);
      await glide('me', nm); await typeInto(nm, NAME);
      const bio = await find('#su-bio', 1000);
      if (bio) { await glide('me', bio); await typeInto(bio, BIO); }
      await hold(400);
    } },
    { id: 'project', title: 'Start a project', dur: 7000, say: 'A project is one thing the tribe makes. Ember Café: a friend’s café that needs a website.', async run() {
      const btn = $('#su-start') ? await point('Create', ['#su-create']) : null;
      if (btn) await press(btn, 'me', false);
      try { if (window.TribeLocalSetup && window.TribeLocalSetup.state().open) window.TribeLocalSetup.close(); } catch {}
      create({ name: NAME, bio: BIO });
      await inProject(); show('home'); await real(350);
      await point('the Ember Café circle', [`#pj-rail [data-pj-open="${PID}"]`, '#pj-rail']);
      await hold(700);
      await point('its dashboard', ['#pj-check', '#view-home']);
    } },
    { id: 'vision', title: 'Write the vision', dur: 11000, say: 'First, the vision: what we’re making and who it’s for. Everyone reads it, AI helpers too.', async run() {
      await inProject(); show('home'); await real(300);
      const box = await point('the vision box', ['#ock-vis-in', '#pj-check [data-ck="vision"]', '#pj-check']);
      if (box && box.tagName === 'TEXTAREA') await typeInto(box, VISION);
      const save1 = await point('Save vision', ['[data-ock-vis] .ock-save'], { ms: 1200 });
      if (save1) await press(save1);
      if (!(db().vision[PID] || '').trim()) { try { await api('/vision', { method: 'PUT', body: { text: `# ${NAME}\n\n${VISION}\n` } }); } catch {} }
      await hold(500);
      await point('the checklist, one step done', ['#pj-check', '#view-home'], { scroll: false });
    } },
    { id: 'friend', title: 'A friend joins', dur: 12000, say: 'Maya opens an invite link and she’s in. Chat is where the tribe talks: friends and their AI helpers.', async run() {
      await inProject(); friendJoins(); show('chat');
      await point('the chat', ['#chat-list', '#view-chat']);
      const mine = say2('me', 'Welcome Maya! Ember Café needs a menu, a website and an order button ☕');
      await hold(900);
      K().reactAs(K().chanOf('general'), mine, 'maya', '🔥');
      await point('Maya’s reaction', [`#chat-list .msg[data-id="${mine.id}"] .rx`, `#chat-list [data-id="${mine.id}"]`], { who: 'maya' });
      await hold(500);
      const re = say2('maya', 'Yes! I’ll design the menu board 🎨', { replyTo: { id: mine.id, by: 'me', text: mine.text } });
      await point('Maya’s reply', [`#chat-list [data-id="${re.id}"]`, '#chat-list'], { who: 'maya' });
      await hold(800);
    } },
    { id: 'tasks', title: 'Tasks: assign and accept', dur: 11000, say: 'Tasks say who does what. I assign the menu board to Maya; it waits until she accepts.', async run() {
      await inProject(); friendJoins();
      W().work = { mode: 'lead' }; K().save();
      const t1 = taskNow('Design the menu board', { assignee: 'maya', status: 'backlog', accept: 'pending', assignedBy: 'me', assignedAt: iso() });
      show('tasks'); if (window.TribeTasks) { try { await window.TribeTasks.load(); } catch {} }
      await typeCmd('add a task “Design the menu board” for Maya');
      await point('the task, waiting for Maya', [`${row(t1.id)} .tk-offer--wait`, row(t1.id), '#board']);
      await hold(900);
      Object.assign(t1, { accept: 'accepted', acceptedAt: iso(), status: 'doing', updated: iso(), updatedBy: 'maya' }); K().save(); K().push({ type: 'task', task: t1 });
      say2('maya', 'Accepted **Design the menu board** 👍 I’m on it.');
      note('Maya accepts: it’s hers now, and in progress.');
      await point('Maya’s task, accepted', [row(t1.id), '#board'], { who: 'maya' });
      await hold(600);
    } },
    { id: 'make', title: 'Make something', dur: 12000, say: 'Files holds everything the project makes. + Create starts a doc, a sheet, a design or a website.', async run() {
      await inProject();
      go('docs'); await real(300);
      const create1 = await point('+ Create', [byText('#view-docs button', /^\s*\+?\s*Create\s*$/), byText('#view-docs button', /Create/), '#view-docs']);
      if (create1 && create1.tagName === 'BUTTON') { await press(create1); await point('what you can make', ['.fv-studio', '[role="menu"]', '.studio', '.fv-menu'], { ms: 1500 }); await hold(900); }
      try { if (window.TribeFilesView && window.TribeFilesView.closeMenus) window.TribeFilesView.closeMenus(); } catch {}
      note('A design: a real canvas with frames and layers. Flint sketches the menu screen.');
      if (window.TribeCanvas) { try { await window.TribeCanvas.open(); } catch {} }
      for (let i = 0; i < 30 && !((window.TribeCanvas && window.TribeCanvas.state()) || {}).canEdit; i++) await real(60);
      if (window.TribeCanvas && !((window.TribeCanvas.state() || {}).nodes || []).length) { try { window.TribeCanvas.insertSample(); } catch {} }
      await point('the design', ['#cv-stage', '#cv']);
      await hold(1500);
    } },
    { id: 'site', title: 'The website, from a template', dur: 16000, say: 'Websites: pick a template, change the words, wire the buttons, go dark. All free, no AI.', async run() {
      await inProject();
      const S = window.TribeSiteDesigner; if (!S) return;
      await S.open({ pid: PID, cfg: null });
      if (!(S.state() || {}).open) return;
      const tpl = await point('the café template', ['#wdz-start [data-tpl="cafe"]', '#wdz-start'], { ms: 2500 });
      await press(tpl, 'me', false);
      const cfg = window.TribeSiteCfg && window.TribeSiteCfg.fromTemplate('cafe', { name: NAME });
      if (cfg) await S.open({ pid: PID, cfg }); else await S.useTemplate('cafe', true);
      await real(300);
      await point('the site', ['#wdz-framewrap', '#wdz-frame'], { dx: 0.25, dy: 0.45 });
      await typeCmd('make the buttons work');
      await S.ask('link this to the contact page');
      await point('what Flint did', ['#wdz-log', '#wdz-insp']);
      await hold(700);
      await typeCmd('dark mode');
      await S.ask('dark mode');
      await point('the dark site', ['#wdz-framewrap', '#wdz-frame'], { dx: 0.3, dy: 0.4 });
      await hold(900);
    } },
    { id: 'preview', title: 'Preview and comment', dur: 10000, say: 'Preview runs what you make, live: here the little game for the café’s page. Maya pins a comment right on it.', async run() {
      await inProject(); friendJoins();
      W().built = true; K().save();
      const f = await openPreview();
      await point('the preview', ['#pvw-iframe', '#pvw-stage', '#pvw']);
      for (let i = 0; i < 20 && f && !f.dataset.dwLoaded; i++) await real(100);
      game({ reset: true }); game({ auto: true });
      await hold(1200);
      const pv = await find(['#pvw-iframe', '#pvw-stage'], 1500);
      const m = document.createElement('div'); m.className = 'dw-pin'; m.id = 'dw-pin';
      const r = pv ? pv.getBoundingClientRect() : { left: innerWidth * 0.5, top: innerHeight * 0.3, width: 400, height: 300 };
      m.style.left = Math.round(r.left + r.width * 0.42) + 'px'; m.style.top = Math.round(r.top + r.height * 0.55) + 'px';
      m.innerHTML = '<i class="dw-pin-dot">M</i><p class="dw-pin-t"><b>Maya</b> Can the lanterns be café lamps? 😄</p>';
      document.body.appendChild(m);
      await point('Maya’s comment pin', '#dw-pin', { who: 'maya', dx: 0.04, dy: 1.1 });
      await hold(1000);
      m.classList.add('done'); m.querySelector('.dw-pin-t').innerHTML = '<b>Flint</b> Done, café lamps now. ✓ Resolved';
      await point('the resolved pin', '#dw-pin');
    } },
    { id: 'approve', title: 'Approve', dur: 10000, say: 'Nothing goes out without a person saying yes. Maya’s menu board is ready; I approve it.', async run() {
      await inProject(); friendJoins(); show('home');
      const t = taskNow('Design the menu board', { assignee: 'maya', status: 'review', accept: 'accepted' });
      let ap = (db().approvals || []).find(a => a.status === 'pending' && a.project === PID);
      if (!ap) ap = K().askApproval(PID, t, 'maya');
      if (window.TribeNotify && window.TribeNotify.openInbox) { try { window.TribeNotify.openInbox(); } catch {} }
      const btn = ap ? await point('the Approve button', [`[data-decide="approve"][data-ap="${ap.id}"]`]) : null;
      if (btn) { await press(btn); await point('the approved request', () => [...document.querySelectorAll('#nf-list > *, #nf-list > * > *')].filter(e => /Approved by/.test(e.textContent) && e.getBoundingClientRect().height > 40).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0]); }
      if (ap && ap.status === 'pending') { try { await api(`/approvals/${encodeURIComponent(ap.id)}/approve`, { method: 'POST', body: { note: 'Ship it' } }); } catch {} }
      await hold(500);
    } },
    { id: 'company', title: 'Run it like a company', dur: 10000, say: 'When it gets serious, make it a company: seats like CEO, Build and Grow, each held by a friend, an AI, or both.', async run() {
      await inProject();
      go('company'); await real(300);
      const make = await find('#co-make', 1500);
      if (make) {
        await point('what a company adds', [() => make.closest('section, .co-ig, .hero-card, .card'), '#view-company']);
        await hold(1400);
        const b = await point('Make it a company', '#co-make');
        await press(b);
      }
      await point('the company', ['#view-company .co-seats', '#co-su', '#view-company'], { ms: 2500 });
      await hold(600);
    } },
    { id: 'end', title: 'Your turn', dur: 5000, say: 'From nothing to a tribe, a project, a site and a company. That’s TribeCode. Your turn.', async run() {
      tidy(); endCard();
      await point('the Your turn card', '#dw-end .dw-end-card', { scroll: false });
    } },
  ];
  const offsets = []; let TOTAL = 0; STEPS.forEach(s => { offsets.push(TOTAL); TOTAL += s.dur; });

  function endCard() {
    if ($('#dw-end')) return;
    const e = document.createElement('div'); e.className = 'dw-end'; e.id = 'dw-end'; e.setAttribute('role', 'dialog'); e.setAttribute('aria-label', 'Your turn');
    e.innerHTML = `<div class="dw-end-card"><img src="assets/flint.svg" alt="" width="48" height="48"><span class="eyebrow">Your turn</span><h2>Make something with your friends</h2>
      <p>A tribe is friends, people and AIs, making things together in projects. Everything works with no AI, and an AI makes it better.</p>
      <div class="dw-end-acts"><button class="btn primary" id="dw-start">Start a project</button><button class="btn" id="dw-try">Try it yourself</button></div>
      <div class="dw-end-more"><button class="linkish" id="dw-again">Watch again</button>${window.__TAURI__ ? '' : `<span aria-hidden="true">·</span><a class="linkish" href="${RELEASES}" target="_blank" rel="noopener">Get the desktop app</a>`}</div></div>`;
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
      try { if (idx) tidy(); await s.run(); const left = offsets[idx] + s.dur - clock; if (left > 0) await hold(left); }
      catch (e) { if (e === ABORT) { if (me !== token || !running) return; } else { console.warn('demo watch:', s.id, e); log.push({ step: s.id, target: 'run', found: false, error: String(e && e.message || e) }); } }
    }
    if (me === token && running) finish();
  }
  function finish() {
    finished = true; spot(null); idx = STEPS.length - 1;
    document.querySelectorAll('#dw-dots [data-i]').forEach(b => { b.classList.add('past'); b.classList.remove('on'); b.removeAttribute('aria-current'); });
    endCard(); paintCtl(); log.push({ step: 'end', target: 'finished', found: true });
    Object.values(cursors).forEach(c => c.el.remove()); for (const k of Object.keys(cursors)) delete cursors[k];
  }
  function start(opts = {}) {
    if (!on()) { begin(); return false; }   // from inside the real app: the tour starts in this tab
    hook(); stop(true);
    const sp = Number(opts.speed) || 1; speedN = sp === 2 ? 2 : 1; turbo = sp >= 3 ? sp : 1;   // ?speed=4 (tests): the whole clock runs 4x; the bar offers people 1x and 2x
    running = true; paused = false; finished = false; token++; clock = 0; last = performance.now(); log.length = 0; lit = 0;
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
  // a chapter dot: jump straight to that feature (the chapter makes what it needs)
  function jump(i) {
    if (!running || !(i >= 0 && i < STEPS.length)) return;
    if (i <= 1 && !db().blank) return restart();   // the blank slate and the tribe's making: start over from nothing
    token++; spot(null); tidy();
    const end = $('#dw-end'); if (end) end.remove();
    finished = false; paused = false; clock = offsets[i]; last = performance.now(); paintCtl();
    log.push({ step: STEPS[i].id, target: 'jump', found: true });
    document.querySelectorAll('#dw-dots b').forEach(b => { b.style.width = ''; });
    runFrom(i);
  }
  function skipToEnd() {
    if (!running) return; token++; const me = token;
    tidy(); paused = false; idx = STEPS.length - 1; caption(STEPS[idx], idx); clock = offsets[idx];
    (async () => { try { await STEPS[idx].run(); } catch {} if (me === token && running) finish(); })();
  }
  function restart() { stop(true); try { sessionStorage.setItem('tribecode.watch.next', '1'); } catch {} O().reset(); }
  function exit() { stop(true); if (O() && O().exit) O().exit(); }

  // Esc ends the show (no dim, no cursors, no cards) and leaves the tribe to explore; the pill still has Exit
  addEventListener('keydown', e => {
    if (!running) return;
    if (e.key === 'Escape' && e.isTrusted) { e.preventDefault(); tidy(); stop(); if (A() && A().toast) A().toast('Stopped. Look around, or Exit the demo from the pill at the top.'); }
    else if (e.key === ' ' && !/INPUT|TEXTAREA|BUTTON/.test((e.target && e.target.tagName) || '') && !e.target.isContentEditable) { e.preventDefault(); paused ? play() : pause(); }
  }, true);
  addEventListener('resize', () => { if (running && idx >= 0) spot(null); });

  window.TribeDemoWatch = {
    seed, start, stop, pause, play, speed, jump, skipToEnd, exit, begin, active: () => running, LABEL,
    _test: { log: () => log.slice(), state: () => ({ running, paused, finished, idx, id: STEPS[idx] && STEPS[idx].id, steps: STEPS.map(s => s.id), speed: speedN, clock: Math.round(clock), total: TOTAL, lit }) },
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
  // the Home's "Tour with Flint" with no tribe yet, and Help's entry: take the tour
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('#hub-tour, [data-dw-start]'); if (!t) return;
    const hasTribe = !!(C() && C().hasToken && C().hasToken()) && !on();
    const paused2 = !!(window.TribeFlintTour && window.TribeFlintTour.state && window.TribeFlintTour.state().paused);
    if (t.id === 'hub-tour' && (hasTribe || paused2)) return;   // a real tribe, or "Continue the tour": Flint's look around the real places (flinttour.js)
    e.preventDefault(); e.stopPropagation(); begin();
  }, true);
  // from anywhere (the real app, another demo): a fresh tour in this tab, after a reload so nothing else is mounted
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
      // the blank slate never says hello (no tribe yet): start once the shell is up
      if (c.connected()) go1(); else if (db() && db().blank) { const up = (n = 0) => (window.TribeApp && window.TribeApp.show && window.TribeHub && document.body.dataset.view) || n > 100 ? go1() : setTimeout(() => up(n + 1), 60); up(); } else c.on('hello', go1);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (on()) hook();

})();
