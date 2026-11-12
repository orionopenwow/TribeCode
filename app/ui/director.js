// The demo tour ("Director", feat/demo-tour): a scripted, about three-minute walk through the showcase tribe that
// drives the real app. Ghost cursors with names glide (bezier paths) to real buttons and click them; text is typed
// into the real inputs; the offline backend (offline.js) answers, so every screen is the true product, not a video:
//   1 Start a project (the Onboarding Checklist)   2 Write the vision        3 Friends join, the checklist fills
//   4 Add context (a file dropped in)               5 Messages               6 Task Board (create, drag to Done)
//   7 Agents Hub (agents at work, a hand-off)       8 Flint answers + points 9 Preview: the game, played
//   10 A doc written live with co-editors           11 The website builder   12 A vote passes, the milestone ships
//   13 + Add a widget                               14 Approve from your phone   15 Make your own tribe
// Phones (<= 820 px) play a shorter vertical cut (about 90 s) with touch dots instead of arrows.
// A slim chapter bar sits at the bottom: chapter segments + title, time / total, Pause/Play, Skip, 2x, Try it yourself
// (stops the tour and hands you the same tribe, which keeps running by itself), Leave. One caption line per chapter.
// Reduced motion: cursors cut instead of gliding, text appears a line at a time, no particles.
// Only runs inside the showcase (TribeOffline.mode() === 'showcase'): it never touches a real tribe.
// Start: ?demo=showcase (showcase.js sets window.__tribeTour; ?tour=off skips it, ?tour=fast runs it in seconds for
// tests), or "Play the 3-minute tour" in the Showcase pill. It also answers a few showcase-only API paths
// (agents at work, hand-offs, #agents, ownership, the website, the preview) through offline.js's hooks.route.
//   window.TribeDirector = { start(opts), stop(), pause(), play(), skip(), speed(n), active(), _test: { log(), state() } }
(function () {
  'use strict';
  const O = () => window.TribeOffline, K = () => window.TribeOffline && window.TribeOffline._k;
  const A = () => window.TribeApp, C = () => window.TribeClient, SC = () => window.TribeShowcase, D = () => SC() && SC()._dir;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const on = () => !!(O() && O().mode && O().mode() === 'showcase');
  const PID = 'lantern-run', NEW = 'Firefly Garden', NEWID = 'firefly-garden';
  const RELEASES = 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const ABORT = { abort: true };
  const iso = (t = Date.now()) => new Date(t).toISOString();
  const db = () => K().db();
  const member = id => (db().members || []).find(m => m.id === id);
  const colorOf = id => (member(id) || {}).color || '#6C7CFF';
  const firstName = () => String((member('me') || {}).name || 'You').split(' ')[0];

  // ======================================================================================================
  // Showcase-only API answers (they stay on after the tour, so "Try it yourself" finds the same screens)
  // ======================================================================================================
  function tourState() {
    const d = db(); if (d.tour) return d.tour;
    const now = Date.now();
    d.tour = {
      handoffs: [],
      channel: [
        { id: 'c1', by: 'claude-maya', text: 'Title screen is in review. I left the logo flicker at 6 fps, it reads calmer.', at: iso(now - 38 * 60e3) },
        { id: 'c2', by: 'claude', to: 'claude-maya', text: 'Thanks. I claimed src/levels/ for Willow Marsh, so I won\'t touch your UI files.', at: iso(now - 30 * 60e3) },
      ],
      website: { fields: { headline: '', tagline: '', about: '', footer: '', playUrl: '' }, sections: {}, built: null, auto: false },
    };
    K().save(); return d.tour;
  }
  const LANES = { claude: ['Levels', 'src/levels/willow-marsh.js'], 'claude-maya': ['UI', 'src/ui/title-screen.js'] };
  function agents() {
    const d = db(), now = Date.now(), ts = (d.tasks[PID] || []);
    const list = d.members.filter(m => m.role === 'agent' && m.owner).map((m, i) => {
      const t = ts.find(x => x.assignee === m.id && (x.status === 'doing' || x.status === 'review'));
      const owner = member(m.owner) || {};
      return { id: m.id, name: m.name, kind: 'claude-code', online: !!m.online, where: m.where || 'Tasks', task: t ? { id: t.id, title: t.title } : null, files: [(LANES[m.id] || ['', 'src/'])[1]],
        lastActive: iso(now - (i + 1) * 40e3), yours: m.owner === 'me', ownerName: owner.name || 'someone', tokens: null, control: null };
    });
    list.push({ id: 'codex-jay', name: 'Jay\'s Codex', kind: 'codex', online: true, where: 'Art', task: { id: 'x', title: '[Art] Warm halo ring on lit lanterns' }, files: ['src/art/halo.js'],
      lastActive: iso(now - 95e3), yours: false, ownerName: 'Jay', tokens: null, control: null });
    return list;
  }
  function owners() {
    return [
      { id: 'claude', name: (member('claude') || {}).name || 'Claude', kind: 'agent', lanes: [{ area: 'src/levels/' }], claims: [{ path: 'src/levels/willow-marsh.js' }] },
      { id: 'claude-maya', name: 'Maya\'s Claude', kind: 'agent', lanes: [{ area: 'src/ui/' }], claims: [{ path: 'src/ui/title-screen.js' }] },
      { id: 'jay', name: 'Jay', kind: 'person', color: colorOf('jay'), lanes: [{ area: 'src/art/' }, { area: 'docs/art-direction.md' }], claims: [] },
      { id: 'rio', name: 'Rio', kind: 'person', color: colorOf('rio'), lanes: [{ area: 'src/audio/' }], claims: [] },
    ];
  }
  function siteHtml(w, d) {
    const p = (d.projects || []).find(x => x.id === PID) || {}, f = w.fields;
    const people = d.members.filter(m => m.role !== 'agent').map(m => `<span style="border:1px solid #2A313C;border-radius:99px;padding:4px 10px;color:${esc(m.color)}">${esc(m.name)}</span>`).join(' ');
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(f.headline || p.name)}</title>
      <body style="margin:0;background:#12151A;color:#E8EAED;font:16px/1.6 Inter,system-ui,sans-serif">
      <header style="padding:56px 40px 32px;border-bottom:1px solid #2A313C"><div style="font:600 12px ui-monospace,monospace;letter-spacing:.12em;color:#38C6B1;text-transform:uppercase">A game by ${esc(d.tribe.name)}</div>
      <h1 style="font-size:44px;line-height:1.1;margin:10px 0 8px">${esc(p.emoji || '')} ${esc(f.headline || p.name)}</h1><p style="color:#9AA4B2;max-width:60ch;margin:0">${esc(f.tagline || p.bio || '')}</p>
      <a style="display:inline-block;margin-top:22px;background:#F26B1D;color:#12151A;font-weight:700;padding:10px 18px;border-radius:10px;text-decoration:none">Play in the browser</a></header>
      <section style="padding:28px 40px;max-width:65ch"><h2 style="font-size:20px">About</h2><p style="color:#C9CED6">${esc(f.about || 'Carry a little flame through three short levels and light every lantern.')}</p></section>
      <section style="padding:0 40px 40px"><h2 style="font-size:20px">Made by</h2><div style="display:flex;gap:8px;flex-wrap:wrap">${people}</div></section>
      <footer style="padding:18px 40px;border-top:1px solid #2A313C;color:#6B7480;font-size:13px">${esc(f.footer || 'Built together on TribeCode')}</footer></body>`;
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(html) + encodeURIComponent('<!--');   // a trailing comment swallows the "&v=" the builder adds
  }
  function website() {
    const d = db(), w = tourState().website, p = (d.projects || []).find(x => x.id === PID) || {};
    return { exists: !!w.built, built: w.built, fields: w.fields, defaults: { headline: p.name, tagline: p.bio || '', about: String((d.vision || {})[PID] || '').replace(/^#.*$/gm, '').trim().slice(0, 400), footer: `Made by ${d.tribe.name}` },
      sectionList: ['about', 'shots', 'play', 'palette', 'news', 'credits'], sections: w.sections, screens: [], shots: null, auto: w.auto, canManage: true, canSuggest: true, suggestable: {},
      suggestions: [], open: 0, path: 'site/index.html', inRepo: false, hint: '', previewUrl: w.built ? siteHtml(w, d) : null };
  }
  const gameUrl = () => new URL('demo-game.html', location.href).href;
  function route(method, parts, q, body, headers) {
    const d = K() && K().db(); if (!d || d.mode !== 'showcase') return null;
    const [a, b, c, e] = parts, GET = method === 'GET', POST = method === 'POST', PUT = method === 'PUT';
    const ok = x => [200, x];
    if (a === 'coord' && GET && b === 'agents' && !c) return ok({ agents: agents() });
    if (a === 'agents' && GET && b === 'fleet' && !c) {   // feat/fleet: the Agents Hub draws one row per agent from this
      const list = agents().map(x => ({ ...x, kindLabel: x.kind === 'codex' ? 'Codex' : 'Claude Code', label: null, owner: null, status: x.online ? (x.task || x.files.length ? 'working' : 'idle') : 'offline',
        lastSeen: x.lastActive, everSeen: true, branch: x.task ? 'task/' + x.task.id : null, budget: null, recent: [], project: PID, projectName: '', projectColor: null }));
      return ok({ scope: 'project', project: PID, you: { id: 'me', host: true, canAct: true }, connected: list.some(x => x.yours), agents: list, projects: [],
        next: [{ kind: 'working', rank: 5, title: `${list.filter(x => x.status === 'working').length} agents are working`, sub: list.filter(x => x.task).slice(0, 2).map(x => `${x.name}: ${x.task.title}`).join(' · '), project: PID }] });
    }
    if (a === 'coord' && b === 'handoffs') {
      const T = tourState();
      if (GET && !c) return ok({ handoffs: T.handoffs });
      const h = T.handoffs.find(x => x.id === c);
      if (h && POST && e === 'take') { h.status = 'taken'; h.to = 'me'; h.taken = iso(); K().save(); return ok({ handoff: h }); }
    }
    if (a === 'coord' && GET && b === 'ownership') return ok({ owners: owners(), warnings: [] });
    if (a === 'agents' && b === 'channel') {
      const T = tourState();
      if (GET) return ok({ messages: T.channel.slice(-(Number(q.get('limit')) || 20)) });
      if (POST) { const m = { id: 'c-' + K().rid(6), by: 'me', human: true, text: String(body.text || '').slice(0, 2000), at: iso() }; T.channel.push(m); K().save(); return ok({ message: m }); }
    }
    if (a === 'projects' && c === 'website' && b === PID) {
      const w = tourState().website;
      if (PUT && !e) { if (body.fields) Object.assign(w.fields, body.fields); if (body.sections) Object.assign(w.sections, body.sections); if (body.auto !== undefined) w.auto = !!body.auto; K().save(); return ok({ website: website() }); }
      if (POST && e === 'build') { const changed = !w.built; w.built = { at: iso(), hash: K().rid(6), auto: false }; K().save(); return ok({ website: website(), changed: true || changed }); }
      if (GET && !e) return ok({ website: website() });
    }
    if (a === 'projects' && c === 'widgets' && (GET || PUT)) {   // the same as offline.js, plus "Preview game" for Lantern Run
      d.widgets = d.widgets || {};
      if (PUT && Array.isArray(body.widgets)) { d.widgets[b] = body.widgets.slice(0, 24); K().save(); K().push({ type: 'widgets', project: b }); }
      return ok({ widgets: d.widgets[b] || [], canEdit: true, preview: { show: b === PID, label: 'Preview game', kind: 'game' }, website: { show: b === PID && !!tourState().website.built } });
    }
    if (a === 'preview') {
      const pid = (headers['x-project'] && d.projects.some(p => p.id === headers['x-project'])) ? headers['x-project'] : K().cur();
      const info = { project: pid, path: gameUrl(), expires: iso(Date.now() + 3600e3), hasRepo: pid === PID, hasIndex: pid === PID, mode: 'static', root: '.', canConfigure: false };
      if (POST && b === 'token') return ok(info);
      if (GET && !b) return ok({ preview: info });
    }
    return null;
  }
  function hookRoutes() { const k = K(); if (k && k.hooks && k.hooks.route && !k.hooks.route.includes(route)) k.hooks.route.push(route); }
  hookRoutes();

  // ======================================================================================================
  // The clock: virtual time that runs at 1x / 2x (or very fast for tests) and stops while paused
  // ======================================================================================================
  let vt = 0, lastReal = 0, speedN = 1, paused = false, running = false, token = 0, loopT = null, fast = false, narrating = false, quiet = false, guided = false;
  // feat/calm-tour: 1x is a calm pace (the scripted chapters run at 0.7 of their old speed), and the clock stops while
  // Flint introduces a chapter, so nothing moves underneath him while you read
  const PACE = 0.5;   // v0.25: calmer still (people said it ran too fast)
  let waiters = [];
  function loop() {
    const now = performance.now();
    if (running && !paused && !narrating) vt += (now - lastReal) * speedN * (fast ? 1 : guided ? 1.25 : PACE);
    lastReal = now;
    if (waiters.length) { const due = waiters.filter(w => w.at <= vt); if (due.length) { waiters = waiters.filter(w => w.at > vt); due.forEach(w => w.res()); } }
    paintTime();
  }
  function flush() { const ws = waiters; waiters = []; ws.forEach(w => w.res()); }
  async function wait(ms) { const t = token; await new Promise(res => waiters.push({ at: vt + Math.max(0, ms), res })); if (t !== token || !running) throw ABORT; }
  const frame = () => wait(1);
  async function real(ms) { const t = token; await new Promise(r => setTimeout(r, ms)); if (t !== token || !running) throw ABORT; }
  // waits in real time (the app's own work doesn't speed up): the element, or null after `ms`
  async function waitFor(sel, ms = 5000) {
    const end = Date.now() + ms;
    for (;;) {
      const el = typeof sel === 'function' ? sel() : $(sel);
      if (el && (typeof sel === 'function' || el.getClientRects().length)) return el;
      if (Date.now() > end) return null;
      await real(60);
    }
  }

  // ======================================================================================================
  // Ghost cursors
  // ======================================================================================================
  let layer = null; const cursors = {};
  function ensureLayer() { if (layer && layer.isConnected) return layer; layer = document.createElement('div'); layer.className = 'dt-layer'; layer.id = 'dt-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); return layer; }
  function cursor(id) {
    if (cursors[id] && cursors[id].el.isConnected) return cursors[id];
    const m = member(id) || {}, el = document.createElement('div');
    const label = id === 'me' ? firstName() : String(m.name || id).split(' ')[0];
    el.className = `dt-cur ${phone() ? 'touch' : ''}`; el.dataset.who = id; el.style.setProperty('--c', m.color || '#F26B1D');
    el.innerHTML = `${phone() ? '<i class="dt-dot"></i>' : '<svg viewBox="0 0 16 20" class="dt-arrow"><path d="M1.5 1.5v15l4.2-4 3 6.8 2.6-1.1-3-6.6h5.9z"/></svg>'}<span class="dt-name">${esc(label)}</span>`;
    ensureLayer().appendChild(el);
    const c = { id, el, x: id === 'me' ? innerWidth * 0.55 : innerWidth + 40, y: id === 'me' ? innerHeight * 0.6 : innerHeight * (0.3 + Object.keys(cursors).length * 0.12) };
    place(c); cursors[id] = c; return c;
  }
  function place(c) { c.el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`; }
  function dropCursor(id) { const c = cursors[id]; if (c) { c.el.remove(); delete cursors[id]; } }
  function clearCursors() { Object.keys(cursors).forEach(dropCursor); }
  const elOf = t => (typeof t === 'string' ? $(t) : t);
  function pointOf(t, dx = 0.5, dy = 0.5) {
    if (t && typeof t.x === 'number' && !(t instanceof Element)) return t;
    const el = elOf(t); if (!el) return null;
    let r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight - 70) { el.scrollIntoView({ block: 'center', behavior: 'instant' }); r = el.getBoundingClientRect(); }
    return { x: Math.min(innerWidth - 6, Math.max(6, r.left + r.width * dx)), y: Math.min(innerHeight - 6, Math.max(6, r.top + r.height * dy)) };
  }
  const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  async function move(id, target, ms = 850, opts = {}) {
    const c = cursor(id), to = pointOf(target, opts.dx, opts.dy); if (!to) return false;
    if (liveOn() && target && target.nodeType === 1 && !opts.carry) spot(target);   // the spotlight follows the action
    if (calm() || fast) { c.x = to.x; c.y = to.y; place(c); if (opts.carry) carryAt(opts.carry, c); await wait(calm() ? Math.min(ms, 250) : 1); return true; }
    const from = { x: c.x, y: c.y }, dist = Math.hypot(to.x - from.x, to.y - from.y), bend = Math.min(160, dist * 0.25) * (opts.bend || (id.length % 2 ? 1 : -1));
    const nx = -(to.y - from.y) / (dist || 1), ny = (to.x - from.x) / (dist || 1);
    const cp = { x: (from.x + to.x) / 2 + nx * bend, y: (from.y + to.y) / 2 + ny * bend };
    const start = vt, dur = Math.max(260, Math.min(ms, 300 + dist * 0.9));
    for (;;) {
      const p = Math.min(1, (vt - start) / dur), e = ease(p), u = 1 - e;
      c.x = u * u * from.x + 2 * u * e * cp.x + e * e * to.x; c.y = u * u * from.y + 2 * u * e * cp.y + e * e * to.y; place(c);
      if (opts.carry) carryAt(opts.carry, c);
      if (p >= 1) break;
      await frame();
    }
    return true;
  }
  function ripple(c) {
    if (calm()) return;
    const r = document.createElement('i'); r.className = 'dt-ripple'; r.style.setProperty('--c', c.el.style.getPropertyValue('--c'));
    r.style.left = c.x + 'px'; r.style.top = c.y + 'px'; ensureLayer().appendChild(r); setTimeout(() => r.remove(), 700);
    c.el.classList.add('down'); setTimeout(() => c.el.classList.remove('down'), 160);
  }
  // ---------- v0.22: Flint narrates live (no clicks needed) ----------
  // A spotlight dims everything but what's happening (it follows each click and each typed box), and Flint's line at the
  // bottom says what he's doing right now: "Clicking Save vision", "Typing the vision", then what it means.
  let spotEl = null, sayEl = null, sayT = null;
  const liveOn = () => running && !guided && !fast && !quiet;
  function spot(target, pad = 8) {
    if (!liveOn()) return;
    const el = elOf(target);
    if (!spotEl || !spotEl.isConnected) { spotEl = document.createElement('div'); spotEl.className = 'dt-spot'; spotEl.id = 'dt-spot'; spotEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(spotEl); }
    if (!el || !el.isConnected || !el.getClientRects().length) { spotEl.classList.add('wide'); return; }   // feat/demo-auto: no target, no dim (the old spot used to stay on a stale box)
    const r = el.getBoundingClientRect(), x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
    const w = Math.min(innerWidth - x - 4, r.width + pad * 2), h = Math.min(innerHeight - y - 4, r.height + pad * 2);
    spotEl.classList.remove('wide'); spotEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; spotEl.style.width = Math.round(w) + 'px'; spotEl.style.height = Math.round(h) + 'px';
  }
  // v0.26: Flint's card says, at a glance, which chapter this is (n of N, a progress bar), what it shows, what Flint is
  // explaining, and what is happening on screen right now (a separate "On screen" line, so clicks and typing never
  // replace the explanation). After each chapter it grows into a recap with what's next and the Next button.
  function sayBox() {
    if (!sayEl || !sayEl.isConnected) {
      sayEl = document.createElement('div'); sayEl.className = 'dt-say'; sayEl.id = 'dt-say'; sayEl.setAttribute('role', 'status'); sayEl.setAttribute('aria-live', 'polite');
      sayEl.innerHTML = `<div class="dt-say-head"><img src="assets/flint.svg" alt="" width="34" height="34"><div class="dt-say-meta"><span class="dt-say-who" id="dt-say-who">Flint</span><b class="dt-say-title" id="dt-say-title"></b></div><span class="dt-say-done" id="dt-say-done" hidden>✓ Done</span></div>
        <div class="dt-say-prog" aria-hidden="true"><i id="dt-say-bar"></i></div>
        <p class="dt-say-cap" id="dt-say-cap"></p>
        <p class="dt-say-t" id="dt-say-t"></p>
        <div class="dt-say-act" id="dt-say-act" hidden><span class="dt-say-act-k">On screen</span><span id="dt-say-act-t"></span></div>
        <div class="dt-say-foot" id="dt-say-foot" hidden><span class="dt-say-up" id="dt-say-up"></span></div>`;
      document.body.appendChild(sayEl);
    }
    return sayEl;
  }
  function chapter(s, n) {
    if (!liveOn() || !s) return;
    const b = sayBox(), N = list.length;
    b.querySelector('#dt-say-who').textContent = `Flint · Chapter ${n + 1} of ${N}`;
    b.querySelector('#dt-say-title').textContent = s.title || '';
    b.querySelector('#dt-say-cap').textContent = s.cap || '';
    b.querySelector('#dt-say-bar').style.width = Math.round((n + 1) / N * 100) + '%';
    b.querySelector('#dt-say-done').hidden = true; b.querySelector('#dt-say-foot').hidden = true; b.querySelector('#dt-say-act').hidden = true;
    b.classList.remove('big');
  }
  function live(text, { lead = '' } = {}) {
    if (!liveOn() || !text) return;
    const b = sayBox();
    if (lead === '▶' || lead === '⌨') {   // what's happening on screen: its own line, under the explanation
      const a = b.querySelector('#dt-say-act'); a.hidden = false; a.dataset.k = lead === '⌨' ? 'type' : 'click';
      const at = b.querySelector('#dt-say-act-t'); at.textContent = text; a.classList.remove('flash'); void a.offsetWidth; a.classList.add('flash');
      b.classList.add('in'); return;
    }
    const t = b.querySelector('#dt-say-t'); b.classList.remove('in'); void b.offsetWidth;
    if (lead === '✓') {   // the recap: bigger, with what's next
      b.classList.add('big'); b.querySelector('#dt-say-done').hidden = false; b.querySelector('#dt-say-act').hidden = true;
      const nx = list[idx + 1], up = b.querySelector('#dt-say-up'), foot = b.querySelector('#dt-say-foot');
      up.innerHTML = nx ? `<span class="k">Up next</span> <b>${esc(nx.title)}</b><span class="faint"> · ${esc(nx.cap || '')}</span>` : '<span class="k">Last one</span> <b>Your turn</b>';
      foot.hidden = false;
      t.textContent = text.replace(/^(Done|Nice|Great)[:!,.]\s*/i, '');   // the ✓ Done chip says it
    } else {
      // the chapter label used to be glued to the front of the line ("3/15 · Write the vision"); it lives in the header now
      const m = /^(\d+)\/(\d+) · (.*)$/.exec(lead || '');
      if (m && cur) chapter(cur, Number(m[1]) - 1);
      t.innerHTML = (lead && !m ? `<b>${esc(lead)}</b> ` : '') + esc(text);
      if (m) t.dataset.step = `${m[1]}/${m[2]}`;
    }
    b.classList.add('in');
  }
  const labelOf = el => { if (!el) return ''; const t = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.placeholder || '').replace(/\s+/g, ' ').trim(); return t.length > 42 ? t.slice(0, 40) + '…' : t; };
  const readMs = text => Math.max(2600, String(text || '').split(/\s+/).length * 300);
  async function readFor(text) { const t = token; let left = readMs(text); while (left > 0) { await new Promise(r => setTimeout(r, 100)); if (t !== token || !running) throw ABORT; if (!paused) left -= 100 * Math.max(1, speedN); } }
  // v0.25: after each chapter's recap the tour waits for you: Next on Flint's line (or Enter / →). Pause still works.
  function waitNext(label) {
    if (!liveOn()) return Promise.resolve();
    const t = token;
    return new Promise((res, rej) => {
      if (!sayEl || !sayEl.isConnected) return res();
      let b = sayEl.querySelector('#dt-say-next');
      if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary dt-say-next'; b.id = 'dt-say-next'; (sayEl.querySelector('#dt-say-foot') || sayEl).appendChild(b); }
      const ft = sayEl.querySelector('#dt-say-foot'); if (ft) ft.hidden = false;
      b.textContent = label || 'Next →'; b.hidden = false; sayEl.classList.add('wait');
      const key = e => { if ((e.key === 'Enter' || e.key === 'ArrowRight') && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) { e.preventDefault(); go(); } };
      const iv = setInterval(() => { if (t !== token || !running) { off(); rej(ABORT); } else if (jump != null) { off(); res(); } }, 100);
      function off() { clearInterval(iv); removeEventListener('keydown', key, true); if (b.isConnected) b.hidden = true; if (sayEl) sayEl.classList.remove('wait'); }
      function go() { off(); res(); }
      b.onclick = go; addEventListener('keydown', key, true); setTimeout(() => { try { b.focus({ preventScroll: true }); } catch {} }, 50);
    });
  }
  function unspot() { if (spotEl) spotEl.remove(); spotEl = null; if (sayEl) sayEl.remove(); sayEl = null; clearTimeout(sayT); }

  // glide to it, then click the real element (the app's own handler runs)
  async function click(id, target, opts = {}) {
    let el = elOf(target); if (!el) return false;
    if (liveOn()) { spot(el); const who = id === 'me' ? '' : String((member(id) || {}).name || id).split(' ')[0]; const lb = labelOf(el); if (lb && !opts.noClick) live(`${who ? who + ' clicks' : 'Clicking'} “${lb}”`, { lead: '▶' }); }
    await move(id, el, opts.ms || 850, opts); await wait(140);
    if (!el.isConnected && typeof target === 'string') el = $(target) || el;   // the screen re-rendered meanwhile
    ripple(cursor(id));
    if (!opts.noClick) { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.click(); }
    await wait(220); return true;
  }
  async function tap(id, x, y) { const c = cursor(id); await move(id, { x, y }, 700); ripple(c); await wait(200); }
  // type into an input or a textarea through its normal input events
  async function type(el, text, cps = 26) {
    el = elOf(el); if (!el) return;
    if (liveOn()) { spot(el); live(`Typing: “${text.split('\n')[0].slice(0, 60)}${text.length > 60 ? '…' : ''}”`, { lead: '⌨' }); }
    el.focus({ preventScroll: true });
    const setV = v => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    let v = el.value || '';
    const chunks = calm() ? text.split(/(?<=\n)/) : [...text];
    for (const ch of chunks) { v += ch; setV(v); await wait(calm() ? 160 : (ch === ' ' ? 1.6 : 1) * 1000 / cps); }
  }
  // a little card that rides along with the cursor (a file being dragged, a task card being moved)
  let carried = null;
  function carry(html, cls = '') { drop(); carried = document.createElement('div'); carried.className = 'dt-carry ' + cls; carried.innerHTML = html; ensureLayer().appendChild(carried); return carried; }
  function carryAt(el, c) { el.style.transform = `translate(${Math.round(c.x + 14)}px, ${Math.round(c.y + 10)}px) rotate(-2deg)`; }
  function drop() { if (carried) { carried.remove(); carried = null; } }

  // ======================================================================================================
  // Small helpers over the app
  // ======================================================================================================
  const NAV = { home: '#nest-overview', chat: '#nest-chat', docs: '#nest-docs', tasks: '#nest-ws-tasks', agents: '#nest-ws-agents' };
  const view = () => document.body.dataset.view || '';
  async function go(v) {
    const sel = NAV[v], row = sel && $(sel), rack = phone() && v !== 'agents' && $(`#tabbar [data-nav="${v}"]`);
    closeSheets();
    if (!phone() && row && row.getClientRects().length) await click('me', row);
    else if (rack && rack.getClientRects().length) await click('me', rack);
    else { if (phone()) await tap('me', innerWidth / 2, innerHeight - 40); if (v === 'agents') (window.TribeShell && window.TribeShell.go ? window.TribeShell.go('agents') : A().show('coord')); else A().show(v); }
    if (v === 'agents' && view() !== 'coord' && window.TribeShell) window.TribeShell.go('agents');
    if (v !== 'agents' && view() !== v) A().show(v);
    await real(fast ? 120 : 260);
  }
  function check(name, ok, info) { log.push({ scene: cur && cur.id, name, ok: !!ok, info: info || null, view: view(), at: Math.round(vt) }); }
  async function settle(sel, name, ms = 4000) { const el = await waitFor(sel, ms); check(name, !!el); return el; }
  const say = (by, text, pid = PID) => (D() ? D().say(by, text, pid) : K().post(pid, by, text));
  const where = (id, w) => D() && D().where(id, w);
  function closeSheets() { const sc = $('.m2-scrim:not(.out)'); if (sc) sc.click(); }
  function closeModals() { closeSheets(); document.querySelectorAll('.modal:not(.hidden) [data-close]').forEach(b => b.click()); document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden')); }
  function toProject(id) { const P = window.TribeProjects; if (C().project() === id) return; if (P && P.switchTo) P.switchTo(id); else C().send({ type: 'project', id }); }
  async function inProject(id) { toProject(id); await waitFor(() => C().project() === id && document.body, 4000); await real(fast ? 150 : 350); }
  function gameKeys(k) { const f = $('#pvw-iframe'); if (f && f.contentWindow) f.contentWindow.postMessage({ tour: 'keys', ...k }, '*'); keycaps(k); }
  let gameLit = 0;
  addEventListener('message', e => { const m = e.data; if (m && m.tour === 'game' && typeof m.lit === 'number') gameLit = Math.max(gameLit, m.lit); });
  let capsEl = null;
  function keycaps(k) {
    const pv = $('#pvw-stage') || $('#pvw'); if (!pv) return;
    if (!capsEl || !capsEl.isConnected) { capsEl = document.createElement('div'); capsEl.className = 'dt-keys'; capsEl.innerHTML = '<kbd data-k="left">←</kbd><kbd data-k="right">→</kbd><kbd data-k="jump" class="wide">Space</kbd>'; pv.appendChild(capsEl); }
    for (const key of ['left', 'right', 'jump']) if (typeof k[key] === 'boolean') capsEl.querySelector(`[data-k="${key}"]`).classList.toggle('on', k[key]);
  }

  // ======================================================================================================
  // The scenes (dur: desktop ms; pdur: the phone cut, phones play only scenes that have one)
  // ======================================================================================================
  const SCENES = [
    { id: 'start', title: 'Start a project', flint: ["#pj-plus, #hpt-brand", "Hi, I'm Flint. Let's build an app together, one step at a time. First, click the + to start a new project."], after: "Done: “Firefly Garden” is a new project. The checklist sets it up with you, one step at a time.", cap: 'Start a project. A short checklist sets it up with you.', dur: 12000, async run() {
      closeModals();
      await wait(600);
      const plus = $('#pj-plus');
      if (plus) { await click('me', plus, { noClick: true }); }
      let p = (db().projects || []).find(x => x.id === NEWID);
      if (!p) {
        await C().api('/projects', { method: 'POST', body: { name: NEW, emoji: '🌿' } });
        p = db().projects.find(x => x.id === NEWID);
        if (p) { p.members = { me: 'host' }; p.bio = ''; K().save(); K().push({ type: 'projects' }); }
      }
      await inProject(NEWID);
      if (view() !== 'home') A().show('home');
      if (window.TribeProjects) await window.TribeProjects.overview();
      await settle('#pj-check', 'checklist on the dashboard');
      await wait(900);
      const steps = document.querySelectorAll('#pj-check [data-step]');
      for (const s of steps) { await move('me', s, 500, { dx: 0.12 }); await wait(420); }
    } },
    { id: 'vision', title: 'Write the vision', flint: ["#pj-check [data-ck=\"vision\"], #pj-check", "Every project starts with what you're making. Click here to write the vision."], after: "Now everyone, and every AI helper, knows the plan: a cozy garden game that plays on a phone.", cap: 'Say what you’re making. Everyone, and every agent, reads it.', dur: 13000, async run() {
      if (C().project() !== NEWID) await inProject(NEWID);
      if (view() !== 'home') A().show('home');
      const b = await waitFor('#pj-check [data-ck="vision"]', 3000);
      if (b) await click('me', b); else if (window.TribeProjects) window.TribeProjects.step('vision');
      const ta = await settle('#pj-vtext', 'vision composer open');
      if (ta) {
        ta.value = '';
        await click('me', ta, { noClick: true, dy: 0.3 });
        await type(ta, `${NEW}: a tiny cozy garden game.\nPlant seeds at night, fireflies light the paths.\nDone for now: one garden, five plants, plays on a phone.`, 34);
        await wait(500);
        const save = $('#pj-vsave'); if (save) await click('me', save);
      }
      await waitFor(() => (db().vision || {})[NEWID], 3000);
      if (window.TribeProjects) await window.TribeProjects.overview();
      check('vision saved', !!(db().vision || {})[NEWID]);
      await settle('#pj-check [data-step="vision"].on', 'vision ticked', 3000);
    } },
    { id: 'friends', title: 'Friends join', flint: ["#tour-invite, #pj-check", "Building is better with friends. Click Invite: friends join with one link, no account needed."], after: "Maya and Jay joined, added a first task and set up the code repository. Next, let's look at a project that's further along.", cap: 'Friends join with one link. Their agents bring the first tasks.', dur: 11000, async run() {
      if (C().project() !== NEWID) await inProject(NEWID);
      if (view() !== 'home') A().show('home');
      const p = db().projects.find(x => x.id === NEWID);
      if (p) { p.members = { ...p.members, maya: 'builder', jay: 'builder' }; K().save(); K().push({ type: 'projects' }); }
      K().post(NEWID, 'tribecode', 'Maya and Jay joined **' + NEW + '** 👋');
      where('maya', NEW); where('jay', NEW);
      const maya = cursor('maya'), jay = cursor('jay');
      maya.x = innerWidth + 30; maya.y = innerHeight * 0.35; jay.x = innerWidth + 30; jay.y = innerHeight * 0.55; place(maya); place(jay);
      if (window.TribeProjects) await window.TribeProjects.overview();
      const box = $('#pj-check') || $('#pj-overview');
      await Promise.all([move('maya', box, 1100, { dx: 0.7, dy: 0.3 }), move('jay', box, 1300, { dx: 0.5, dy: 0.6, bend: 1 })]);
      await wait(700);
      K().addTask(NEWID, { title: '[Garden] A first seed bed with five plots', by: 'maya' });
      K().push({ type: 'task', task: (db().tasks[NEWID] || [])[0] });
      say('maya', 'Added our first task: a seed bed with five plots 🌱', NEWID);
      if (window.TribeProjects) await window.TribeProjects.overview();
      await wait(1400);
      db().repo = db().repo || {}; db().repo[NEWID] = { name: 'campfire-crew/firefly-garden', branch: 'main', ahead: 0, behind: 0, dirty: 0 }; K().save(); K().push({ type: 'repo' });
      say('jay', 'Set up the code repository too 📌', NEWID);
      if (window.TribeProjects) await window.TribeProjects.overview();
      await settle('#pj-check.done', 'checklist all set', 3000);
      await wait(1200);
      const lr = $(`#pj-rail [data-pj-open="${PID}"]`);
      if (lr) await click('me', lr, { noClick: true });
      dropCursor('jay');
      await inProject(PID);
      where('maya', 'Tasks'); where('jay', 'Docs · Art direction');
      if (view() !== 'home') A().show('home');
    } },
    { id: 'context', title: 'Add context', flint: ["#dropzone", "Have notes or pictures? Click here to add a file to the project."], after: "The notes became a doc in Files. AI helpers read it before they build.", cap: 'Drop in docs, notes or images. Flint and the agents read them.', dur: 11000, async run() {
      if (C().project() !== PID) await inProject(PID);
      if (view() !== 'home') A().show('home');
      const dz = await waitFor('#dropzone', 3000);
      if (!dz) { check('drop zone', false); return; }
      dz.scrollIntoView({ block: 'center', behavior: calm() ? 'instant' : 'smooth' });
      await wait(500);
      const me = cursor('me'); me.x = 40; me.y = innerHeight * 0.7; place(me);
      const chip = carry('<span class="dt-file">📄</span><b>playtest-notes.md</b>', 'file');
      carryAt(chip, me);
      await move('me', dz, 1300, { carry: chip, dy: 0.45 });
      dz.classList.add('over'); await wait(500);
      const text = '# Playtest notes\n\n- Rio\'s little brother finished Lantern Hill in 2 minutes.\n- The jump before the third lantern feels unfair: add an ember.\n- Everyone loved the squash on landing.\n';
      const dt = new DataTransfer(); dt.items.add(new File([text], 'playtest-notes.md', { type: 'text/markdown' }));
      ripple(me); drop();
      dz.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const ok = await waitFor(() => (db().docs[PID] || []).find(d => /playtest/i.test(d.slug)), 4000);
      check('file became a doc', !!ok);
      await waitFor(() => view() === 'docs' && document.body, 3000);
      await settle(() => [...document.querySelectorAll('#view-docs *')].find(e => e.children.length === 0 && /playtest/i.test(e.textContent)), 'the doc is in Files', 3000);
    } },
    { id: 'chat', title: 'Messages', flint: ["#nest-chat, #tabbar [data-nav=\"chat\"]", "Let's talk to the team. Click Messages."], after: "You asked Claude, an AI helper, for checkpoint flags, and it answered. Friends and AI helpers share one chat.", cap: 'Chat with friends and agents in one place. @claude answers.', dur: 14000, pdur: 14000, async run() {
      await go('chat');
      await settle('#chat-list', 'chat open');
      if (!phone()) { const m = cursor('maya'), j = cursor('jay'); m.x = innerWidth * 0.75; m.y = innerHeight * 0.3; j.x = innerWidth * 0.4; j.y = innerHeight + 30; place(m); place(j); }
      const list = $('#chat-list');
      say('maya', 'Willow Marsh is playable! The fog lifts when you light a lantern 🌫️');
      if (!phone()) await Promise.all([move('maya', list, 900, { dx: 0.35, dy: 0.62 }), move('jay', list, 1100, { dx: 0.6, dy: 0.8 })]); else await wait(900);
      await wait(700);
      say('jay', 'New lantern sprite is up. Warmer, less yellow ✨');
      await wait(900);
      const inp = $('#chat-input');
      if (inp) {
        await click('me', inp, { noClick: true, dx: 0.3 });
        await type(inp, '@claude can you add checkpoint flags to Willow Marsh?', 30);
        await wait(300);
        ripple(cursor('me'));
        const form = $('#chat-form'); if (form) form.requestSubmit();
      }
      await settle(() => [...document.querySelectorAll('#chat-list .msg')].find(e => /checkpoint flags/.test(e.textContent)), 'your message in the chat', 4000);
      const reply = await waitFor(() => (db().chat[PID] || []).slice(-4).find(m => m.by === 'claude'), 6000);
      check('claude answered', !!reply);
      await wait(900);
      if (D()) { const t = (db().tasks[PID] || []).find(x => x.status === 'doing') || (db().tasks[PID] || [])[0]; if (t) D().gist(t.id, t.assignee && member(t.assignee) && member(t.assignee).role === 'agent' ? t.assignee : 'claude-maya', 1); }
      if (!phone()) await move('maya', $('#chat-list'), 800, { dx: 0.5, dy: 0.85 });
    } },
    { id: 'tasks', title: 'Task Board', flint: ["#nest-ws-tasks, #tabbar [data-nav=\"tasks\"]", "Click Task Board to see the plan as cards."], after: "A new task went on the board, an AI helper picked one up, and Maya checked it and moved it to Done.", cap: 'Make a task. An agent picks it up, a friend reviews, it’s done.', dur: 14000, pdur: 14000, async run() {
      dropCursor('jay');
      await go('tasks');
      await settle('#board [data-col]', 'board open');
      const nb = $('#task-new');
      if (nb) {
        await click('me', nb);
        const qa = await waitFor('#board .quick-add, #m2-qt-in', 2000);
        if (qa && qa.id === 'm2-qt-in') {   // phones: the New task sheet
          await type(qa, '[Levels] Checkpoint flags on Willow Marsh', 32); await wait(300);
          const f = $('#m2-qt'); if (f) { ripple(cursor('me')); f.requestSubmit(); }
          await real(300); closeSheets();
        } else if (qa) {
          await type(qa, '[Levels] Checkpoint flags on Willow Marsh', 32);
          await wait(250);
          qa.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          await real(200);
          const again = $('#board .quick-add'); if (again) again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
      }
      const made = await waitFor(() => [...document.querySelectorAll('#board .task')].find(t => /Checkpoint flags on Willow/.test(t.textContent)), 3000);
      check('new task on the board', !!made);
      await wait(1200);
      // drag a card: In progress -> Review
      const dragTo = async (who, card, col) => {
        if (!card) return false;
        const id = card.dataset.id, title = (card.querySelector('[data-title]') || card).textContent.trim();
        await move(who, card, 800, { dy: 0.25 });
        ripple(cursor(who)); await wait(200);
        const ghost = carry(`<div class="dt-card">${esc(title)}</div>`, 'card'); card.classList.add('dt-lifted');
        const target = $(`#board [data-col="${col}"]`);
        await move(who, target, 1100, { carry: ghost, dy: 0.25 });
        drop(); card.classList.remove('dt-lifted');
        await window.TribeTasks.patch(id, { status: col, order: Date.now() });
        return id;
      };
      const doing = [...document.querySelectorAll('#board [data-col="doing"] .task')].find(t => !/Checkpoint flags on Willow/.test(t.textContent));
      const id1 = await dragTo('me', doing, 'review');
      check('card moved to Review', !!id1 && !!(await waitFor(`#board [data-col="review"] .task[data-id="${id1}"]`, 2500)));
      await wait(500);
      if (!phone()) { const m = cursor('maya'); if (m.x > innerWidth) { m.y = innerHeight * 0.4; place(m); } }
      const rev = [...document.querySelectorAll('#board [data-col="review"] .task')].find(t => t.dataset.id !== id1) || $(`#board [data-col="review"] .task[data-id="${id1}"]`);
      const id2 = await dragTo(phone() ? 'me' : 'maya', rev, 'done');
      check('card moved to Done', !!id2 && !!(await waitFor(`#board [data-col="done"] .task[data-id="${id2}"]`, 2500)));
      if (id2) say('maya', 'Reviewed and merged ✅');
    } },
    { id: 'agents', title: 'Agents Hub', flint: ["#nest-ws-agents", "Click Agents Hub to see what every AI helper is doing right now."], after: "Each AI helper works on its own part, so nobody gets in anyone's way. When one hands work to you, it takes one click.", cap: 'Every agent at work, in one calm place. Hand-offs take one click.', dur: 12000, pdur: 12000, async run() {
      dropCursor('maya');
      await go('agents');
      await settle('#ad-dash .fl-row, #ad-hero .ad-agent', 'agents at work');   // feat/fleet: one row per agent
      const T = tourState();
      const refresh = () => { const el = $('#ad-dash'); if (el && el.parentElement && window.TribeAgentsDash) window.TribeAgentsDash.render(el.parentElement); };
      await wait(1200);
      T.channel.push({ id: 'c-' + K().rid(5), by: 'claude-maya', to: 'claude', text: 'I\'m done with the title screen. Can you take the fog shader? It touches your level files.', at: iso() }); K().save(); refresh();
      await wait(1500);
      T.handoffs.unshift({ id: 'h-' + K().rid(6), status: 'open', from: 'claude-maya', fromName: 'Maya\'s Claude', to: 'me', title: 'Finish the Willow Marsh fog shader', created: iso(), files: ['src/levels/fog.js'] }); K().save(); refresh();
      const take = await waitFor('#ad-needs [data-ad-take]', 3000);
      check('hand-off in Needs you', !!take);
      await wait(700);
      for (let i = 0; i < 3 && take && T.handoffs[0].status !== 'taken'; i++) { await click('me', '#ad-needs [data-ad-take]'); await waitFor(() => T.handoffs[0].status === 'taken' && document.body, 1200); }
      check('hand-off taken', !!(T.handoffs[0] && T.handoffs[0].status === 'taken'));
      T.channel.push({ id: 'c-' + K().rid(5), by: 'claude', to: 'claude-maya', text: 'Got it. Claiming src/levels/fog.js now.', at: iso() }); K().save();
      await wait(800); refresh();
    } },
    { id: 'flint', title: 'Ask Flint', flint: ["#fl-input, #flint", "This is where you can ask me things. Click the Ask Flint box."], after: "I can catch you up, add tasks and notes, write docs, sheets and slides, and show you where things are.", cap: 'Flint, the built-in helper, answers and shows you where things are.', dur: 11000, async run() {
      if (view() !== 'tasks') A().show('tasks');
      const inp = await waitFor('#fl-input', 3000);
      if (!inp) { check('flint bar', false); return; }
      await click('me', inp, { noClick: true, dx: 0.3 });
      const before = ((window.TribeFlint && window.TribeFlint.thread()) || []).length;
      await type(inp, 'What\'s happening?', 30);
      await wait(250);
      if (window.TribeFlint) { inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); window.TribeFlint.ask('What\'s happening?'); }
      await waitFor(() => ((window.TribeFlint && window.TribeFlint.thread()) || []).length >= before + 2 && document.body, 4000);
      check('flint answered', ((window.TribeFlint && window.TribeFlint.thread()) || []).length >= before + 2);
      await wait(1500);
      if (window.TribeFlintGuide) {
        const target = $('#board [data-col="backlog"]') || $('#nest-ws-tasks');
        const left = (db().tasks[PID] || []).filter(t => t.status !== 'done').length;
        window.TribeFlintGuide.point(target, `${left} tasks still open. Agents grab them from here, one lane each.`, { next: 'Nice' });
        await wait(3800);
        window.TribeFlintGuide.hide();
      }
    } },
    { id: 'preview', title: 'Preview', flint: ["#nest-preview", "Let's try what the team made. Click Preview game."], after: "That's the real game, running right next to the work. Anyone in the project can play it.", cap: 'Run what you’re building right next to the work. Play it together.', dur: 14000, pdur: 14000, async run() {
      if (window.TribeFlintGuide) window.TribeFlintGuide.hide();
      if (view() !== 'tasks' && view() !== 'home') A().show('home');
      if (window.TribeWidgets) await window.TribeWidgets.refresh();
      const btn = await waitFor('#nest-preview', 1500);
      if (btn && !phone()) await click('me', btn); else { if (phone()) await tap('me', innerWidth / 2, innerHeight / 2); window.TribePreview && window.TribePreview.open(); }
      const f = await settle('#pvw-iframe', 'preview pane with the game', 5000);
      if (f && !/demo-game\.html/.test(f.src)) f.src = gameUrl();   // e.g. a non-http app origin
      await real(fast ? 400 : 900);
      gameLit = 0;
      gameKeys({ reset: true });
      const hold = async (k, ms) => { gameKeys({ [k]: true }); await wait(ms); gameKeys({ [k]: false }); };
      const stage = $('#pvw-stage');
      if (stage && !phone()) await move('me', stage, 700, { dx: 0.5, dy: 0.85 });
      // run right, hop the gaps, light the lanterns (the timing is the real game's physics at 1x)
      const script = [['right', true], 700, ['jump', 260], 450, ['jump', 300], 650, ['jump', 320], 700, ['jump', 300], 600, ['jump', 340], 700, ['jump', 300], 600, ['right', false]];
      for (const s of script) {
        if (typeof s === 'number') { await real(fast ? 30 : s / speedN); continue; }
        if (s[0] === 'right') gameKeys({ right: s[1] }); else { gameKeys({ jump: true }); await real(fast ? 30 : s[1] / speedN); gameKeys({ jump: false }); }
      }
      gameKeys({ right: true }); await real(fast ? 60 : 1600 / speedN); gameKeys({ right: false, jump: false });
      check('the game is playing', !!$('#pvw-iframe'), { lit: gameLit });
      await wait(400);
    } },
    { id: 'docs', title: 'Write together', flint: ["#nest-docs, #tabbar [data-nav=\"docs\"]", "Click Files to write a document together."], after: "Jay and Maya typed at the same time, each with their own colored cursor. Nothing gets lost.", cap: 'Docs are written live, together. Everyone’s cursor, in their color.', dur: 13000, pdur: 13000, async run() {
      if (window.TribePreview) window.TribePreview.close();
      await go('docs');
      if (window.TribeDocs) await window.TribeDocs.open('level-design');
      await settle('#doc-body', 'doc open');
      await waitFor(() => window.TribeCoedit && window.TribeCoedit.get('level-design') && window.TribeCoedit.get('level-design').joined, 3000);
      const jay = { peer: 'jay~1', id: 'jay', name: 'Jay', color: colorOf('jay') }, maya = { peer: 'maya~1', id: 'maya', name: 'Maya', color: colorOf('maya') };
      const all = [jay, maya], edit = (who, t, pos) => K().peerEdit('level-design', who, t, pos, all);
      const text = () => K().liveText('level-design') || '';
      edit(maya, text(), 0); edit(jay, text(), 0);
      const page = $('#doc-body') && ($('#doc-body').closest('.doc-edit') || $('#doc-body'));
      if (page && !phone()) await move('me', page, 700, { dx: 0.8, dy: 0.2 });
      // two friends type at once, near the top where you can see them: Jay adds to the intro, Maya adds a rule to Level 1
      const add1 = 'Every level ends at a big lantern you can see from the start. ';
      const add2 = '- A checkpoint flag halfway, so a fall costs one screen.\n';
      const after = (mark, fallback) => { const t = text(), i = t.indexOf(mark); return i >= 0 ? i + mark.length : fallback(t); };
      let pa = after('Teach one idea per level.', t => t.length), pb = -1;
      if (pa < text().length && text()[pa] === ' ') pa++;
      if (pa < text().length && text()[pa] !== '\n') pa = text().indexOf('\n', pa) < 0 ? text().length : text().indexOf('\n', pa);
      let a = 0, b = 0;
      const step = calm() ? 30 : 2;
      edit(jay, text(), pa);
      const ed = $('#doc-body') && ($('#doc-body').closest('.doc-edit') || $('#doc-body'));
      while (a < add1.length || b < add2.length) {
        if (a < add1.length) { const t = text(), n = Math.min(step, add1.length - a), s = (a === 0 ? ' ' : '') + add1.slice(a, a + n); edit(jay, t.slice(0, pa) + s + t.slice(pa), pa + s.length); if (pb > pa) pb += s.length; pa += s.length; a += n; }
        if (a > 12 && b < add2.length) {
          if (pb < 0) pb = after('- Five lanterns, no enemies.\n', t => t.length);
          const t = text(), n = Math.min(step, add2.length - b), s = add2.slice(b, b + n); edit(maya, t.slice(0, pb) + s + t.slice(pb), pb + s.length); if (pa > pb) pa += s.length; pb += s.length; b += n;
        }
        const caret = who => document.querySelector(`.co-caret[data-peer="${who}~1"]`);
        if (a === 4 && caret('jay')) { if (phone()) caret('jay').scrollIntoView({ block: 'center', behavior: 'instant' }); else await move('me', caret('jay'), 600, { dx: 0, dy: 3 }); }
        if (b === 4 && caret('maya')) {
          const h = [...document.querySelectorAll('.doc-edit h2, .doc-edit h3, .doc-edit [data-h], .doc-edit p, .doc-edit li')].find(e => /Level 1/.test(e.textContent) && e.getClientRects().length);
          (h || caret('maya')).scrollIntoView({ block: 'start', behavior: 'instant' });
          if (!phone()) await move('me', caret('maya'), 600, { dx: 0, dy: 3 });
        }
        else if (!ed) await wait(1);
        await wait(calm() ? 200 : 60);
      }
      check('co-editors wrote in the doc', text().includes(add1.trim()) && text().includes(add2.trim()));
      await settle(() => [...document.querySelectorAll('[class*="caret"], [class*="cursor"]')].find(e => /Jay|Maya/.test(e.textContent || '') || e.style.borderColor), 'remote carets drawn', 1500);
      await wait(1200);
    } },
    { id: 'website', title: 'The website', flint: ["#wt-website, #nest-website", "Click Website: your project gets a public page."], after: "The page was built from what you already wrote. Publish it when you like it.", cap: 'A public page for your project, built from what you already wrote.', dur: 17000, async run() {
      if (window.TribeShell && window.TribeShell.go) window.TribeShell.go('website'); else if (window.TribeWebsite) window.TribeWebsite.open();
      const tab = $('#wt-website'); if (tab && !phone()) await click('me', tab, { noClick: true });
      const head = await settle('#wb-headline', 'website builder open', 4000);
      if (head) {
        await click('me', head, { noClick: true, dx: 0.2 });
        head.value = ''; await type(head, 'Lantern Run', 26);
        const tag = $('#wb-tagline'); if (tag) { await click('me', tag, { noClick: true, dx: 0.2 }); tag.value = ''; await type(tag, 'Carry a little flame. Light up the night.', 36); }
        await wait(300);
        const build = $('#wb-build'); if (build) await click('me', build);
      }
      const fr = await settle('#wb-frame', 'the built page in the preview', 4000);
      const pv = fr && fr.closest('.wb-preview'); if (pv) pv.scrollIntoView({ block: 'start', behavior: calm() ? 'instant' : 'smooth' });
      await real(fast ? 50 : 900);   // let the smooth scroll land before anything else moves
      if (fr) await move('me', fr, 1200, { dx: 0.55, dy: 0.3 });
      await wait(2200);   // time to read the built page
      if (fr) await move('me', fr, 1600, { dx: 0.45, dy: 0.7 });
      await wait(2600);
    } },
    { id: 'ship', title: 'Vote and ship', flint: ["#wt-board, #nest-ws-tasks", "Big changes get a vote from the team. Click Board."], after: "The vote passed and the milestone shipped. Everyone who helped gets the credit.", cap: 'Big changes get a vote. When the milestone is done, it ships 🎉', dur: 14000, pdur: 14000, async run() {
      if (view() !== 'tasks') A().show('tasks');
      const tb = await waitFor('#wt-board', 2000);
      if (tb && !phone()) await click('me', tb); else A().show('board');
      await settle('#prop-list', 'proposals open');
      let pr = ((db().proposals || {})[PID] || []).find(p => p.status === 'open');
      if (!pr) {
        pr = { id: 'p-tour-' + K().rid(4), title: 'v0.3: a boss and phone controls', short: 'a boss fight and touch controls', version: 'v0.3', kind: 'feature', status: 'open', by: 'jay', created: iso(), votes: { jay: 'yes' },
          body: '## Plan\nA small boss at the top of the tower, and on-screen buttons for phones.\n\n## Tasks\n- [ ] [Boss] The Moth King\n- [ ] [UI] Touch controls\n' };
        db().proposals[PID] = [pr, ...(db().proposals[PID] || [])]; K().save(); K().push({ type: 'proposal', proposal: { ...pr, tally: K().tally(pr) } });
        A().show('board');
      }
      const yes = await waitFor(`[data-vote="yes"]`, 3000);
      if (yes) { await click('me', yes); }
      await wait(900);
      for (let i = 0; i < 4 && pr.status === 'open'; i++) { D() && D().voteOn(); await wait(700); }
      check('the vote passed', pr.status !== 'open', { status: pr.status });
      await wait(600);
      A().show('home');
      await waitFor('#sc-mile', 2500);
      if (D()) D().release();
      await settle('#sc-cele', 'milestone shipped card', 3000);
      const card = $('#sc-cele'); if (card && !phone()) await move('me', card, 700);
      if (!calm() && window.TribeFlintGuide && window.TribeFlintGuide._burst && card && $('#flint-guide')) { const r = card.getBoundingClientRect(); window.TribeFlintGuide._burst(r.left + 30, r.top + 20, 18); }
      await wait(2400);
    } },
    { id: 'add', title: '+ Add', flint: ["#nest-add", "Need more tools? Click + Add."], after: "A calendar is in the sidebar now. Bugs, links and docs go in the same way.", cap: 'Add what your project needs: a calendar, bugs, a link, a doc.', dur: 10000, async run() {
      document.querySelectorAll('.sc-cele').forEach(x => x.remove());
      if (view() !== 'home') A().show('home');
      const add = await waitFor('#nest-add', 2000);
      if (!add) { check('+ Add', false); return; }
      await click('me', add);
      await settle('.wgx-grid, [data-wadd]', 'the gallery is open', 3000);
      await wait(900);
      const card = $('[data-wadd="calendar"]:not([disabled])') || $('[data-wadd]:not([disabled])');
      const key = card && card.dataset.wadd;
      if (card) await click('me', card);
      await settle(key ? `#wg-${key}` : '.wg-row', 'the widget is in the sidebar', 3000);
      const row = key && $(`#wg-${key}`); if (row) await move('me', row, 600, { dx: 0.3 });
      await wait(700);
    } },
    { id: 'phone', title: 'On your phone', flint: [null, "When you're away, your phone asks before anything big happens. Press Show me."], after: "Approved from the phone. The change goes into the main version of the app.", cap: 'Away from your desk? Approve your agents’ work with one tap.', dur: 11000, async run() {
      if (view() !== 'home') A().show('home');
      const t = (db().tasks[PID] || []).find(x => x.status === 'doing') || (db().tasks[PID] || []).find(x => x.status === 'backlog');
      if (t && D()) { if (t.status !== 'doing') D().claim(t.id, 'claude-maya'); D().review(t.id, t.assignee || 'claude-maya'); }
      const ap = (db().approvals || []).find(a => a.status === 'pending');
      const ph = document.createElement('div'); ph.className = 'dt-phone'; ph.id = 'dt-phone';
      const who = ap ? esc(ap.byName || 'Maya\'s Claude') : 'Maya\'s Claude';
      ph.innerHTML = `<div class="dt-ph-screen"><div class="dt-ph-top"><span>9:41</span><span class="dt-ph-isl"></span><span>●●●</span></div>
        <div class="dt-ph-note"><span class="eyebrow">TribeCode · now</span><b>${who} asks: merge “${esc(ap ? String(ap.title).replace(/^Merge “?|”? into main$/g, '') : 'Checkpoint flags')}”</b><small>Low risk · one lane, no shared files</small></div>
        <div class="dt-ph-card"><span class="eyebrow">Approval</span><h4>${esc(ap ? ap.title : 'Merge into main')}</h4><p>${esc(ap ? ap.details : '')}</p>
        <div class="dt-ph-acts"><button class="dt-ph-no">Deny</button><button class="dt-ph-ok" id="dt-ph-ok">Approve</button></div><p class="dt-ph-done" hidden>Approved ✓ It ships to main.</p></div></div>`;
      document.body.appendChild(ph);
      await real(30); ph.classList.add('in');
      await wait(1500);
      const okb = $('#dt-ph-ok'), r = okb.getBoundingClientRect();
      const finger = cursor('me'); finger.el.classList.add('touch');
      await move('me', { x: r.left + r.width / 2, y: r.top + r.height / 2 }, 800);
      await wait(250); ripple(finger);
      if (ap) { try { await C().api(`/approvals/${encodeURIComponent(ap.id)}/approve`, { method: 'POST', body: { note: 'From my phone' } }); } catch {} }
      okb.parentElement.style.display = 'none'; ph.querySelector('.dt-ph-done').hidden = false;
      finger.el.classList.remove('touch');
      check('approved from the phone', !ap || ap.status === 'approved');
      if (ap) K().toast(`Approved from your phone: ${String(ap.title).replace(/^Merge /, '').replace(/ into main$/, '')} ships to main`);
      if (!phone()) await move('me', $('#nest-ws-tasks') || $('#pj-overview'), 900, { dx: 0.4 });
      await wait(3800);
      ph.classList.remove('in'); await wait(400); ph.remove();
    } },
    { id: 'end', title: 'Your turn', cap: 'That’s TribeCode: friends and their agents, building one thing together.', dur: 8000, pdur: 8000, async run() {
      clearCursors(); if (window.TribePreview) window.TribePreview.close();
      if (view() !== 'home') A().show('home');
      endCard();
      check('end card', !!$('#dt-end'));
      await wait(5000);
    } },
  ];

  // ======================================================================================================
  // The runner, the chapter bar, the caption and the end card
  // ======================================================================================================
  let opts0 = {};
  let list = [], idx = 0, cur = null, sceneStart = 0, offsets = [], total = 0, jump = null, done = false;
  const log = [];
  const dur = s => (phone() ? s.pdur || s.dur : s.dur);
  let runId = 0;
  async function runFrom(i) {
    idx = i; const me = ++runId;   // a stopped run never carries on into a new one
    while (running && me === runId && idx < list.length) {
      cur = list[idx]; jump = null; vt = offsets[idx]; sceneStart = vt;
      begin(cur);
      try {
        if (!['start', 'vision', 'friends'].includes(cur.id) && C().project() !== PID) await inProject(PID);   // e.g. after a skip
        await narrate(cur, idx);
        await cur.run();
        if (guided) await recap(cur, idx);
        else {
          const rest = dur(cur) - (vt - sceneStart); if (rest > 0) await wait(rest);
          if (liveOn() && cur.after && !opts0.classic) { spot(null); live(cur.after.replace(/\s*Next[^.]*\.?$/i, ''), { lead: '✓' }); await waitNext(idx >= list.length - 2 ? 'Finish →' : 'Next →'); }
        }
      } catch (e) {
        if (e !== ABORT) { console.warn('demo tour:', cur.id, e); check('scene ran', false, String(e && e.message || e)); }
        if (!running || me !== runId) return;
      }
      drop();
      if (jump != null) { const to = jump; jump = null; vt = offsets[to] || 0; idx = to; continue; }
      idx++;
    }
    if (running && me === runId) finish();
  }
  function begin(s) {
    const n = list.indexOf(s);
    closeSheets();
    const cap = $('#dt-cap');
    if (cap) { cap.classList.remove('in'); cap.innerHTML = `<span class="eyebrow">${n + 1} / ${list.length} · ${esc(s.title)}</span><span class="dt-cap-t">${esc(s.cap)}</span>`; void cap.offsetWidth; cap.classList.add('in'); }
    const t = $('#dt-title'); if (t) t.textContent = s.title;
    chapter(s, n);
    document.querySelectorAll('#dt-chaps [data-i]').forEach(b => { const i = Number(b.dataset.i); b.classList.toggle('past', i < n); b.classList.toggle('on', i === n); b.setAttribute('aria-current', i === n ? 'step' : 'false'); });
    log.push({ scene: s.id, name: 'reached', ok: true, view: view(), at: Math.round(vt) });
  }
  // Flint flies to the part of the screen this chapter is about, rings it (everything else dims a little) and says, in
  // a sentence, what it is and what you'd do there. He waits about as long as it takes to read (pause holds him), or
  // until you press "Show me".
  async function narrate(s, n) {
    const G = window.TribeFlintGuide;
    if (fast || quiet || !G || !s.flint) return;
    if (guided) return guidedStep(s, n);
    if (!opts0.classic) {   // v0.22 default: Flint shows and tells, nothing to click
      const [sel0, text0] = s.flint; const el0 = sel0 ? await waitFor(() => [...document.querySelectorAll(sel0)].find(e => e.getClientRects().length && e.getBoundingClientRect().width > 0), 2000) : null;   // watchdog: 2 s, then on without a spotlight
      if (sel0 && !el0) check('target found', false, sel0);
      spot(el0, 10); live(text0.replace(/\b(First, |Now |Then |Next, )?([Cc])lick\b/g, (m, a) => (a || '') + (a ? 'I click' : 'I click')).replace(/(^|[.!?]\s+)I click/g, (m, p) => p + 'I click'), { lead: `${n + 1}/${list.length} · ${s.title}` });
      await readFor(text0); return;
    }
    const [sel, text] = s.flint;
    const el = sel ? [...document.querySelectorAll(sel)].find(e => e.getClientRects().length && e.getBoundingClientRect().width > 0) : null;
    const t = token; narrating = true; document.body.classList.add('dt-narr');
    let done = false, left = Math.max(5200, text.split(/\s+/).length * 360);
    G.point(el, text, { next: n === list.length - 1 ? 'Finish' : 'Show me', steps: list.length, step: n, dim: true }).then(() => { done = true; });
    try {
      while (!done && left > 0) {
        await new Promise(r => setTimeout(r, 100));
        if (t !== token || !running) throw ABORT;
        if (!paused) left -= 100 * speedN;
      }
    } finally { if (!done) G.hide(); narrating = false; document.body.classList.remove('dt-narr'); }
    await real(250);
  }
  // ---------- the guided tour (the default): Flint points, you click, the app does it, Flint says what happened ----------
  // Each chapter: Flint rings the real button the chapter is about and asks you to click it (or "Do it for me"). Your
  // click is caught before the app sees it and the chapter plays the real feature, with your own cursor (no ghost "me").
  // Then a short recap and Next. Nothing moves on until you say so.
  function waitDone(t, isDone) { return new Promise((res, rej) => { const iv = setInterval(() => { if (t !== token || !running) { clearInterval(iv); rej(ABORT); } else if (isDone()) { clearInterval(iv); res(); } }, 80); }); }
  async function guidedStep(s, n) {
    const G = window.TribeFlintGuide, [sel, text] = s.flint;
    const el = sel ? [...document.querySelectorAll(sel)].find(e => e.getClientRects().length && e.getBoundingClientRect().width > 0) : null;
    const t = token; let done = false;
    narrating = true; document.body.classList.add('dt-narr');
    const hit = e => el && el.contains(e.target);
    const down = e => { if (!hit(e)) return; e.preventDefault(); e.stopPropagation(); done = true; G.hide(); };
    const swallow = e => { if (hit(e)) { e.preventDefault(); e.stopPropagation(); } };
    if (el) { addEventListener('pointerdown', down, true); addEventListener('click', swallow, true); }
    G.point(el, text, { next: el ? 'Do it for me' : 'Show me', steps: list.length, step: n, side: el ? undefined : 'below' }).then(() => { done = true; });
    try { await waitDone(t, () => done); }
    finally {
      removeEventListener('pointerdown', down, true); setTimeout(() => removeEventListener('click', swallow, true), 400);
      if (!done) G.hide(); narrating = false; document.body.classList.remove('dt-narr');
    }
    await real(200);
  }
  async function recap(s, n) {
    const G = window.TribeFlintGuide; if (!G || !s.after || fast || quiet) return;
    const t = token; let done = false; narrating = true;
    await real(500);
    G.point(null, s.after, { next: n >= list.length - 2 ? 'Finish' : 'Next', steps: list.length, step: n }).then(() => { done = true; });
    try { await waitDone(t, () => done); } finally { if (!done) G.hide(); narrating = false; }
  }
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function paintTime() {
    if (!bar) return;
    const t = done ? total : Math.min(total, vt);
    const k = fast ? 1 : PACE, tm = $('#dt-time'); if (tm) tm.textContent = guided && !done ? `Step ${Math.min(idx + 1, list.length)} of ${list.length}` : `${mmss(t / k)} / ${mmss(total / k)}`;
    if (cur && !done) { const n = list.indexOf(cur), seg = document.querySelector(`#dt-chaps [data-i="${n}"] i`); if (seg) seg.style.width = Math.min(100, Math.max(0, (vt - offsets[n]) / dur(cur) * 100)) + '%'; }
  }
  let bar = null;
  function buildBar() {
    removeUi();
    document.body.classList.add('dt-on');
    const cap = document.createElement('div'); cap.className = 'dt-cap'; cap.id = 'dt-cap'; cap.setAttribute('role', 'status'); cap.setAttribute('aria-live', 'polite'); document.body.appendChild(cap);
    bar = document.createElement('div'); bar.className = 'dt-bar'; bar.id = 'dt-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Demo tour');
    bar.innerHTML = `<button class="dt-b dt-play" id="dt-play" aria-label="Pause" title="Pause"><span class="dt-pp" aria-hidden="true">❚❚</span></button>
      <div class="dt-mid"><div class="dt-chaps" id="dt-chaps" role="group" aria-label="Chapters">${list.map((s, i) => `<button class="dt-seg" data-i="${i}" style="flex-grow:${dur(s)}" title="${i + 1}. ${esc(s.title)}" aria-label="Chapter ${i + 1}: ${esc(s.title)}"><i></i></button>`).join('')}</div>
        <div class="dt-meta"><span class="dt-title" id="dt-title"></span><span class="dt-time" id="dt-time">0:00 / ${mmss(total / (fast ? 1 : PACE))}</span></div></div>
      <button class="dt-b" id="dt-skip" title="Skip chapter" aria-label="Skip chapter">Skip<span class="dt-wide"> chapter</span></button>
      <button class="dt-b dt-speed" id="dt-speed" aria-pressed="false" title="Speed">2×</button>
      <button class="dt-b dt-try" id="dt-try">Try it<span class="dt-wide"> yourself</span></button>
      <button class="dt-b dt-x" id="dt-leave" title="Leave the demo" aria-label="Leave the demo">✕</button>`;
    document.body.appendChild(bar);
    bar.querySelector('#dt-play').onclick = () => (paused ? play() : pause());
    bar.querySelector('#dt-skip').onclick = () => skip();
    bar.querySelector('#dt-speed').onclick = () => speed(speedN === 2 ? 1 : 2);
    bar.querySelector('#dt-try').onclick = () => tryIt();
    bar.querySelector('#dt-leave').onclick = () => { stop(true); O().leave(); };
    bar.querySelectorAll('[data-i]').forEach(b => b.onclick = () => skip(Number(b.dataset.i)));
    paintCtl();
  }
  function paintCtl() {
    const p = $('#dt-play'); if (p) { p.setAttribute('aria-label', paused ? 'Play' : 'Pause'); p.title = paused ? 'Play' : 'Pause'; p.querySelector('.dt-pp').textContent = paused ? '▶' : '❚❚'; p.classList.toggle('paused', paused); }
    const s = $('#dt-speed'); if (s) { s.classList.toggle('on', speedN === 2); s.setAttribute('aria-pressed', String(speedN === 2)); }
    if (bar) bar.classList.toggle('paused', paused);
  }
  function removeUi() {
    ['#dt-bar', '#dt-cap', '#dt-end', '#dt-phone', '#dt-layer', '#dt-intro'].forEach(s => { const e = $(s); if (e) e.remove(); }); unspot();
    bar = null; layer = null; capsEl && capsEl.remove(); capsEl = null; clearCursors(); drop();
    document.body.classList.remove('dt-on');
  }
  function endCard() {
    const e = document.createElement('div'); e.className = 'dt-end'; e.id = 'dt-end'; e.setAttribute('role', 'dialog'); e.setAttribute('aria-label', 'Make your own tribe');
    const web = /^https?:/.test(location.protocol);
    e.innerHTML = `<div class="dt-end-card"><img src="assets/flint.svg" alt="" width="48" height="48" class="dt-end-flint"><span class="eyebrow">Your turn</span><h2>Make your own tribe</h2>
      <p>Share one code repository on GitHub, invite friends with one link, connect your AI. Free and open source.</p>
      <div class="dt-end-acts"><a class="btn primary" id="dt-download" href="${RELEASES}" target="_blank" rel="noopener">Download TribeCode</a>${web ? '<button class="btn" id="dt-browser">Open in browser</button>' : ''}</div>
      <div class="dt-end-more"><button class="linkish" id="dt-again">Watch again</button><span>·</span><button class="linkish" id="dt-explore">Explore this tribe</button></div></div>`;
    document.body.appendChild(e);
    e.querySelector('#dt-again').onclick = () => restart();
    e.querySelector('#dt-explore').onclick = () => tryIt();
    const b = e.querySelector('#dt-browser'); if (b) b.onclick = () => { stop(true); O().leave(); };
  }
  function finish() {
    done = true; running = false; flush(); paintTime();
    if (spotEl) { spotEl.remove(); spotEl = null; } if (sayEl) { sayEl.remove(); sayEl = null; } if (window.TribeFlintGuide) window.TribeFlintGuide.hide();
    clearInterval(loopT); loopT = null;
    document.querySelectorAll('#dt-chaps [data-i]').forEach(b => { b.classList.add('past'); b.classList.remove('on'); });
    const t = $('#dt-title'); if (t) t.textContent = 'The end';
    if (!$('#dt-end')) endCard();
    const p = $('#dt-play'); if (p) { p.onclick = () => restart(); p.setAttribute('aria-label', 'Watch again'); p.querySelector('.dt-pp').textContent = '↻'; }
    log.push({ scene: 'end', name: 'finished', ok: true, view: view(), at: Math.round(vt) });
  }

  // ======================================================================================================
  // Controls
  // ======================================================================================================
  function start(opts = {}) {
    if (!on()) return false;
    if (running) stop();
    hookRoutes();
    opts0 = opts; document.body.classList.toggle('dt-live', !opts.fast && opts.narrate !== false && !opts.guided && !opts.classic);
    fast = !!opts.fast; quiet = opts.narrate === false; guided = !!opts.guided && !fast && !quiet; /* v0.22: autoplay with live narration is the default */ document.body.classList.toggle('dt-guided', guided); speedN = fast ? 30 : 1; paused = false; done = false; token++; vt = 0; lastReal = performance.now();
    list = SCENES.filter(s => !phone() || s.pdur);
    offsets = []; total = 0; list.forEach(s => { offsets.push(total); total += dur(s); });
    if (SC() && SC().hold) SC().hold(true);
    closeModals(); document.querySelectorAll('.sc-cele').forEach(x => x.remove());
    K().closePop && K().closePop();
    buildBar(); ensureLayer();
    running = true; clearInterval(loopT); loopT = setInterval(loop, 16);
    if (!fast && !quiet && !opts.noIntro) { paused = true; intro().then(() => { if (running) { paused = false; runFrom(0); } }); }
    else runFrom(0);
    return true;
  }
  // Three slides before the tour: what you're about to see, what TribeCode is, how it works. You move on with Next
  // (or Enter / →, Back with ←), at your own pace; nothing advances by itself.
  const SLIDES = [
    { e: '🎬', h: 'Here is what you will see', p: 'Flint builds a tiny garden game with two friends in a few minutes: a project, a vision, friends joining, tasks, AI agents at work, a playable preview, a vote, and shipping it. Press Next whenever you are ready to move on.' },
    { e: '🔥', h: 'What TribeCode is', p: 'The place where friends make apps, games and websites together, with AI helpers. Chat, tasks, docs and the code live in one tribe. Your code is saved in your own GitHub repository.' },
    { e: '🧭', h: 'How it works', p: 'Say what you want to make. Send friends one link. Everyone, and every AI agent, takes a part. The tribe votes, and one tap ships it. Pause, skip or try it yourself any time from the bar at the bottom.' },
  ];
  function intro() {
    return new Promise(res => {
      const ov = document.createElement('div'); ov.className = 'dt-intro'; ov.id = 'dt-intro'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Before the tour');
      let i = 0, iv = null;
      const done = () => { clearInterval(iv); removeEventListener('keydown', key, true); ov.remove(); res(); };
      const next = () => { if (i >= SLIDES.length - 1) done(); else { i++; draw(); } };
      const back = () => { if (i > 0) { i--; draw(); } };
      function key(e) { if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); } else if (e.key === 'Escape') { e.preventDefault(); done(); } }
      const draw = () => {
        const x = SLIDES[i], last = i === SLIDES.length - 1;
        ov.innerHTML = `<div class="dt-in-card${ov.isConnected ? ' again' : ''}"><div class="dt-in-e" aria-hidden="true">${x.e}</div><p class="eyebrow mono">${i + 1} of ${SLIDES.length}</p><h2>${esc(x.h)}</h2><p class="dt-in-p">${esc(x.p)}</p>
          <div class="dt-in-dots">${SLIDES.map((_, k) => `<i class="${k < i ? 'past' : k === i ? 'on now' : ''}"><b></b></i>`).join('')}</div>
          <div class="dt-in-btns"><button class="linkish" id="dt-in-skip">Skip to the tour</button><span class="dt-in-nav">${i > 0 ? '<button class="btn" id="dt-in-back">Back</button>' : ''}<button class="btn primary" id="dt-in-next">${last ? 'Start the tour' : 'Next'}</button></span></div></div>`;
        ov.querySelector('#dt-in-skip').onclick = done;
        ov.querySelector('#dt-in-next').onclick = next;
        const bk = ov.querySelector('#dt-in-back'); if (bk) bk.onclick = back;
        setTimeout(() => { const n = ov.querySelector('#dt-in-next'); if (n) n.focus({ preventScroll: true }); }, 30);
      };
      draw(); document.body.appendChild(ov); addEventListener('keydown', key, true);
      iv = setInterval(() => { if (!running) done(); }, 200);
    });
  }
  function stop(quiet) {
    const was = running || done;
    running = false; done = false; token++; flush(); clearInterval(loopT); loopT = null;
    if (window.TribeFlintGuide) window.TribeFlintGuide.hide();
    document.body.classList.remove('dt-guided', 'dt-live', 'dt-paused', 'dt-narr');
    removeUi();
    if (!quiet && was && SC() && SC().hold) SC().hold(false);
  }
  function tryIt() {
    stop();
    log.push({ scene: cur && cur.id, name: 'try-it', ok: true, view: view(), at: Math.round(vt) });
    if (view() !== 'home' && A()) A().show('home');
    K().toast('Your turn: click anything. The tribe keeps going by itself.');
  }
  function restart() { stop(true); try { sessionStorage.setItem('tribecode.tour.next', fast ? 'fast' : guided ? 'on' : 'watch'); } catch {} O().reset(); }
  function pause() { if (!running) return; paused = true; document.body.classList.add('dt-paused'); paintCtl(); }
  function play() { if (!running) return; paused = false; document.body.classList.remove('dt-paused'); lastReal = performance.now(); paintCtl(); }
  function skip(to) {
    if (!running) return;
    const n = to == null ? idx + 1 : to;
    if (n >= list.length) { jump = list.length - 1; } else jump = Math.max(0, n);
    if (paused) { paused = false; paintCtl(); }
    token++; flush(); if (window.TribeFlintGuide) window.TribeFlintGuide.hide();
  }
  function speed(n) { if (!running) return; speedN = fast ? 30 : n === 2 ? 2 : 1; paintCtl(); }
  // You clicked into the app yourself: the tour waits for you
  document.addEventListener('pointerdown', e => { if (running && !paused && !guided && e.isTrusted && e.target.closest && !e.target.closest('.dt-bar, .dt-end, .fg-root, .dt-say, .dt-intro')) { pause(); K().toast('Paused. Press play to keep watching, or Try it yourself.'); } }, true);

  // feat/demo-auto: Esc, Back and a crash always lift the dim: Esc hands you the tribe (like Try it yourself)
  addEventListener('keydown', e => { if (e.key === 'Escape' && e.isTrusted && running && !$('#dt-intro')) { e.preventDefault(); tryIt(); } });
  addEventListener('popstate', () => { if (running && !fast) tryIt(); });
  addEventListener('error', () => { if (!running && spotEl) { spotEl.remove(); spotEl = null; } });
  window.TribeDirector = {
    start, stop, pause, play, skip, speed, tryIt, restart, active: () => running,
    _test: {
      log: () => log.slice(),
      state: () => ({ running, paused, done, speed: speedN, idx, id: cur && cur.id, scenes: list.map(s => s.id), elapsed: Math.round(vt), total }),
    },
  };

  // ---------- start on ?demo=showcase (showcase.js set window.__tribeTour) or after "Watch again" ----------
  let want = window.__tribeTour || null;
  try { const n = sessionStorage.getItem('tribecode.tour.next'); if (n) { sessionStorage.removeItem('tribecode.tour.next'); want = want || n; } } catch {}
  if (want && on() && SC() && SC().hold) SC().hold(true);   // before the showcase's own clock starts
  function boot() {
    if (!want || !on()) return;
    const c = C(); if (!c) return;
    const go1 = () => { if (!want) return; const w = want; want = null; setTimeout(() => start({ fast: w === 'fast', watch: w === 'watch' }), w === 'fast' ? 300 : 900); };
    if (c.connected()) go1(); else c.on('hello', go1);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
