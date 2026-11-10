/* Meet Flint (v0.27.1): every visual on the page is a live copy of the TribeCode app (the homepage stage's mk-* pieces
   plus the views below), drawn at a fixed design size and scaled to fit. Each copy plays a short scripted story while it
   is on screen; a click stops the story so it doesn't fight you, and it starts again once you scroll away and back.
   The sidebar rows are real tabs. On phones the copies switch to the app's phone layout. Nothing leaves the page.
   Reduced motion: each story jumps to its last frame. Public (for tests): window.FlintTry = { ask(text) }. */
(function () {
  'use strict';
  const still = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = s => esc(s).replace(/```\n?([\s\S]*?)```/g, '<pre>$1</pre>').replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  const FLAME = '<img src="assets/brand/flint.svg" alt="" width="16" height="20">';
  const STOP = Symbol('stop');

  /* ---------------- the app's views (Kombucha Empire) ---------------- */
  const ROWS = [['dashboard', 'Dashboard', 'home'], ['messages', 'Messages', 'chat'], ['files', 'Files', 'file'], ['tasks', 'Task Board', 'check'], ['whiteboard', 'Whiteboard', 'board'], ['preview', 'Preview', 'play']];
  const ROW_OF = { dashboard: 'dashboard', brief: 'dashboard', invite: 'dashboard', messages: 'messages', approval: 'messages', files: 'files', doc: 'files', tasks: 'tasks', whiteboard: 'whiteboard', preview: 'preview' };
  const NAME = { dashboard: 'Dashboard', messages: 'Messages', files: 'Files', tasks: 'Task Board', whiteboard: 'Whiteboard', preview: 'Preview' };
  const CMD = { dashboard: 'go home', messages: 'open messages', files: 'open files', tasks: 'open the task board', whiteboard: 'open the whiteboard', preview: 'open the preview' };
  const head = (ic, t, s) => `<div class="mk-head"><span class="mk-head__ic">${ic}</span><div><b>${t}</b><span>${s}</span></div><span class="mk-head__acts"><i></i><i></i><i></i></span></div>`;
  const tiles = `<div class="fv-tiles"><div class="fv-tile" style="--c:#F26B1D"><small>Batches brewing</small><b>6</b><span>2 ready Friday</span></div><div class="fv-tile" style="--c:#38C6B1"><small>Orders this week</small><b>23</b><span>+5 vs last week</span></div><div class="fv-tile" style="--c:#FABD2F"><small>Needs you</small><b>1</b><span>1 approval waiting</span></div><div class="fv-tile" style="--c:#6C7CFF"><small>Tasks open</small><b>5</b><span>2 on you</span></div></div>`;
  const reco = `<div class="fv-card"><h5>Recommended next · picked for this project</h5><div class="fv-reco"><span>🪑</span><div><b>Fill the Grow seat</b><small>Give it to a friend, hire through Work, or an AI helper</small></div><span class="fv-btn">Open the org chart</span></div><div class="fv-reco"><span>💵</span><div><b>Track the money</b><small>Import a Stripe CSV in a minute</small></div><span class="fv-btn">Open Money</span></div><div class="fv-reco"><span>🧩</span><div><b>Find add-ons for this project</b><small>Sorted by what your tribe uses</small></div><span class="fv-btn">Marketplace</span></div></div>`;
  const msg = (av, who, time, text, o = {}) => `<div class="mk-msg${o.agent ? ' mk-msg--agent' : ''}">${o.agent ? `<i class="mk-av mk-av--agent ${o.cls || 'mk-av--claude'}"><span>${av}</span></i>` : `<i class="mk-av" style="--c:${o.c};--ink:#fff">${av}</i>`}<div><p class="mk-who"${o.n ? ` style="--n:${o.n}"` : ''}>${who}${o.tag ? ` <em>${o.tag}</em>` : ''}<time>${time}</time></p>${text ? `<p>${text}</p>` : ''}${o.extra || ''}</div></div>`;
  const V = {
    dashboard: () => head('🏕️', 'Kombucha Empire', '4 people · 2 AI helpers · hosting') + `<div class="fa-body">${tiles}${reco}</div>`,
    brief: () => head('🏕️', 'Kombucha Empire', '4 people · 2 AI helpers · hosting') + `<div class="fa-body"><div class="fv-card fv-brief"><h5>☀️ Flint · your morning brief</h5><p><b>Morning Camp.</b> 2 new orders came in overnight.</p><ul><li>The ginger batch is ready to bottle (day 10)</li><li>2 tasks on you: Orders page, Café list</li><li>Next up: fill the Grow seat</li></ul></div>${tiles}</div>`,
    messages: () => head('#', '# general', '5 members · 4 online') + `<div class="fv-chat">${msg('M', 'Maya', '9:38', 'Can we show today\'s orders on the dashboard?', { c: '#6C7CFF', n: '#9AA6FF' })}${msg('✦', 'Orion\'s Claude', '9:39', 'On it. Added a Today\'s orders card.', { agent: 1, tag: 'Claude Code', extra: '<div class="mk-tools"><div class="mk-tool on"><span class="mk-tool__k">Edited</span><span class="mk-tool__v">dashboard.js</span><span class="mk-diff"><ins>+38</ins> <del>−4</del></span></div><div class="mk-tool on"><span class="mk-tool__k">Tests</span><span class="mk-tool__v">6 passed</span><span class="mk-ok">✓</span></div></div>' })}${msg('J', 'Jay', '9:41', 'Delivery routes are done 🚚', { c: '#F4A64A', n: '#F4C27A' })}${msg('◎', 'Maya\'s Codex', '9:42', 'I\'ll add flavor photos next.', { agent: 1, cls: 'mk-av--codex', tag: 'Codex' })}</div>`,
    approval: () => head('#', '# general', '5 members · 4 online') + `<div class="fv-chat">${msg('M', 'Maya', '9:38', 'Spring flavors are live 🌸', { c: '#6C7CFF', n: '#9AA6FF' })}${msg('✦', 'Grow · Maya\'s Claude', '9:40', 'I drafted an email to our 120 customers about the spring flavors.', { agent: 1, tag: 'AI helper' })}<div class="fv-appr" id="fv-appr"><small>Needs your OK · Grow</small><b>Email 120 customers about the spring flavors?</b><span style="font-size:12px;color:var(--faint)">Outward and to customers, so a person decides.</span><div class="fv-row" id="fv-appr-btns"><span class="fv-ok" id="fv-ok">Approve</span><span class="fv-no">Deny</span></div></div></div>`,
    files: () => head('📄', 'Files', 'Docs, sheets, slides and the whiteboard') + `<div class="fa-body"><div class="fv-files">${[['📄', 'Launch plan', 'Flint draft · just now', 'doc'], ['✨', 'Vision', 'Camp · Monday', ''], ['📊', 'Budget', 'Sheet · Maya · yesterday', ''], ['🎞', 'Pitch for the café', 'Slides · Jay · 2 days ago', ''], ['💬', 'Meeting notes · Tue', 'Flint draft · Tuesday', '']].map(f => `<div class="fv-file"${f[3] ? ' data-open="doc"' : ''}><span>${f[0]}</span><div><b>${f[1]}</b><br><small>${f[2]}</small></div>${/Flint/.test(f[2]) ? '<em>✦ draft</em>' : ''}</div>`).join('')}</div></div>`,
    doc: () => `<div class="fv-doc"><div class="fv-crumb">Kombucha Empire › Files › <b>Launch plan</b><span class="fv-share fv-btn">Share</span></div><div class="fv-tools"><span>B</span><span><i>I</i></span><span>H1</span><span>H2</span><span class="sep"></span><span>•</span><span>☑</span><span>▦</span><span class="sep"></span><span>🔗</span><span>💬</span><span>🎙</span></div><div class="fv-page" id="fv-page"><h4>Launch plan</h4><p class="fv-flag">✦ <b>Flint draft</b> · from your vision, tasks, decisions and chat · review it before you share it</p></div></div>`,
    tasks: () => head('✅', 'Task Board', '7 tasks · 2 done · shared with your tribe') + `<div class="fa-body"><div class="fv-cols"><div class="fv-col" style="--c:#94A3B8"><h6><i></i>Backlog <em>3</em></h6>${task('Flavor photos', 'Maya\'s Codex', '#6C7CFF', '◎')}${task('Café list', 'Camp', '#F26B1D', 'C')}${task('Price sheet', 'Maya', '#6C7CFF', 'M')}</div><div class="fv-col" style="--c:#F26B1D"><h6><i></i>In progress <em>2</em></h6>${task('Orders page', 'Camp', '#F26B1D', 'C')}${task('Today\'s orders card', 'Orion\'s Claude', '#38C6B1', '✦')}</div><div class="fv-col" style="--c:#3BD16F"><h6><i></i>Done <em>2</em></h6>${task('Batch counter', 'Orion\'s Claude', '#38C6B1', '✦')}${task('Delivery routes', 'Jay', '#F4A64A', 'J')}</div></div></div>`,
    whiteboard: () => `<div class="fv-wb" data-wb><div class="fv-wb__tools"><span>↖</span><span>✎</span><span>▭</span><span>T</span><span class="on">▤</span><span>⌫</span><span>🖼</span></div><div class="fv-sticky" style="--c:#FABD2F;left:90px;top:40px">Farmers market Saturday!<small>Maya</small></div><div class="fv-sticky" style="--c:#38C6B1;left:270px;top:120px;--r:2deg">New flavor: hibiscus?<small>Jay</small></div><div class="fv-sticky" style="--c:#E86A92;left:130px;top:210px;--r:-1deg">Café order: 40 bottles<small>Camp</small></div></div>`,
    preview: () => `<div class="fv-pv"><div class="fv-pv__bar"><span class="mk-pv-dot"></span><b>Preview</b><span class="fv-rl">↻</span><span class="mk-url">kombucha-empire · live</span></div><div class="fv-pv__app"><h5 id="fv-title">Kombucha Empire</h5><span class="fv-k2">Small-batch kombucha, brewed in Phoenix</span><div class="fv-pv__stats"><span><b>6</b><small>batches brewing</small></span><span><b>148</b><small>bottles ready</small></span><span><b>23</b><small>orders this week</small></span></div>${[['Ginger Lemon', '#E8A23A', '90%', 'Ready'], ['Hibiscus Berry', '#C2416B', '60%', 'Day 6'], ['Mint Green Tea', '#5E9E63', '35%', 'Day 4']].map(b => `<div class="fv-batch" style="--c:${b[1]};--w:${b[2]}"><i></i><span>${b[0]}</span><u></u><em>${b[3]}</em></div>`).join('')}</div></div>`,
    settings: () => `<div class="fv-set"><div class="fv-set__nav"><span>Profile</span><span>Look</span><span>Language</span><span class="on">Flint</span><span>Flint's brain</span><span>Storage &amp; sync</span></div><div class="fv-set__body" id="fv-set"><h5>What Flint remembers about you</h5><small class="h">Only you can see these. Tell Flint “remember…”, or edit them here.</small>${note('name', 'My name is Camp')}${note('pref', 'I like code examples')}</div></div>`,
    skills: () => `<div class="fv-set"><div class="fv-set__nav"><span>Profile</span><span>Look</span><span class="on">Flint</span><span>Flint's brain</span></div><div class="fv-set__body" id="fv-set"><h5>Tribe skills</h5><small class="h">Shortcuts anyone in the tribe can run by name. Flint offers one when you repeat yourself.</small><div class="fv-skill"><b>/morning-check</b><ol><li>what's new</li><li>open the task board</li></ol></div></div></div>`,
    brain: () => `<div class="fv-set"><div class="fv-set__nav"><span>Profile</span><span>Flint</span><span class="on">Flint's brain</span><span>Storage &amp; sync</span></div><div class="fv-set__body"><h5>Flint's brain</h5><small class="h">Flint does the everyday things without one. Add one for anything else.</small>${[['basic', 'Basic mode', 'No AI · always on · free'], ['ollama', 'Qwen on the host\'s computer', 'Free · runs on the host\'s machine through Ollama'], ['cloud', 'A cloud AI', 'Claude, with the host\'s own key']].map(o => `<div class="fv-opt" data-brain="${o[0]}"><i></i><div><b>${o[1]}</b><small>${o[2]}</small></div></div>`).join('')}</div></div>`,
    academy: () => head('🎓', 'Academy · Code basics', 'Lesson 4 of 9 · about 3 minutes') + `<div class="fa-body"><div class="fv-lesson"><div class="fv-tabs" id="fv-tabs"><span data-s="picture">Picture</span><span data-s="analogy">Analogy</span><span data-s="code">Code</span><span data-s="steps">Steps</span></div><b style="font-size:20px;color:var(--text)">What is an API?</b><pre id="fv-lesson"></pre><div class="fv-quiz" id="fv-quiz"></div></div></div>`,
    invite: () => V.dashboard() + `<div class="fv-modal"><div class="fv-dlg"><h5>Invite to Kombucha Empire</h5><small>Your tribe link. Anyone with it picks a name and they're in. No AI needed.</small><div class="fv-link"><span>tribecode.org/t/kombucha-empire</span><span class="fv-btn fv-btn--go" style="flex:none">Copy</span></div><div style="display:flex;gap:12px;align-items:center"><div class="fv-qr">${qr()}</div><small>Or show this QR code. Works on any phone.</small></div></div></div>`,
  };
  function task(t, who, c, a) { return `<div class="fv-task"><b>${t}</b><span><i style="--c:${c}">${a}</i>${who}</span></div>`; }
  function note(k, t, isNew) { return `<div class="fv-note${isNew ? ' is-new' : ''}"><span class="k">${k}</span><span class="t">${t}</span><span class="b">Edit</span><span class="b">Delete</span></div>`; }
  function qr() { let s = '', x = 7; for (let i = 0; i < 81; i++) { x = (x * 73 + 41) % 101; const r = Math.floor(i / 9), c = i % 9, corner = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3); s += `<i class="${corner ? ((r % 2 === 1 && (c === 1 || c === 7)) ? 'o' : '') : (x % 3 ? 'o' : '')}"></i>`; } return s; }
  const LESSON = {
    picture: '📱 your app ── “menu, please” ➜ 🍽️ the API ➜ 👩‍🍳 the server\n📱 your app ⟵──── “here you go” ──────────┘',
    analogy: 'An API is a waiter. You don’t walk into the kitchen;\nyou order from a menu, and the waiter brings back\nexactly what you asked for.',
    code: 'const res = await fetch("/api/orders");\nconst orders = await res.json();   // the answer',
    steps: '1. Find the menu (the API’s docs).\n2. Ask for one thing (a request).\n3. Get an answer back.',
  };

  /* ---------------- the app frame ---------------- */
  function App(el, o) {
    const sm = !!o.small, W0 = o.w || (sm ? 920 : 1200), H0 = o.h || (sm ? 580 : 660);
    el.classList.toggle('fa--sm', sm);
    el.innerHTML = `<div class="fa__scaler"><div class="fa-win">
      <div class="mk-rail"><span class="mk-logo"><img src="assets/brand/icon.svg" alt="" width="44" height="44"></span><span class="mk-sep"></span><span class="mk-circle is-on" title="Kombucha Empire">🏕️</span><span class="mk-circle">🎮</span><span class="mk-circle mk-circle--add">+</span></div>
      <div class="mk-bar"><span class="mk-pill"><i class="mk-dot"></i><b>Kombucha Empire</b><span>4 here</span></span><span class="mk-search"><i class="mk-glass"></i>Search or jump to…<kbd>Ctrl K</kbd></span><span class="mk-bar__end"><span class="mk-help">?</span><span class="mk-lights"><i></i><i></i><i></i></span></span></div>
      <div class="mk-side" role="tablist" aria-label="Kombucha Empire sections">${ROWS.map(r => `<button type="button" class="mk-row" role="tab" aria-selected="false" tabindex="-1" data-row="${r[0]}"><i class="mk-ic mk-ic--${r[2]}"></i>${r[1]}</button>`).join('')}<p class="mk-recents">Recents</p><button type="button" class="mk-row mk-row--doc" data-row="files" data-doc tabindex="-1">📄 Launch plan</button>
        <div class="mk-side__foot"><span class="mk-invite">👋 Invite friends</span><div class="mk-me"><i class="mk-av mk-av--sm" style="--c:#F26B1D;--ink:#fff">C</i><div><b>Camp</b><span>Hosting</span></div></div></div></div>
      <div class="fa-main"><div class="fa-view" role="tabpanel"></div></div>
      <div class="fa-fl"><div class="fa-fl__head">${FLAME}<b>FLINT</b><span class="fa-fl__st">basic mode · no model</span><span class="fa-fl__x">⌄ ✕</span></div><div class="fa-fl__thread" aria-live="polite"></div><div class="fa-chips"></div>
        <form class="fa-ask">${FLAME}${o.input ? '<input type="text" placeholder="Ask Flint…" aria-label="Ask Flint" autocomplete="off">' : '<span class="fa-typed"></span>'}<svg class="mk-mic" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><button class="mk-send" type="${o.input ? 'submit' : 'button'}" aria-label="Send" tabindex="${o.input ? 0 : -1}"></button></form></div>
      <div class="fa-rack" aria-hidden="true"><span data-rk="dashboard">⌂</span><span data-rk="messages">💬</span><span data-rk="files">📄</span><span data-rk="tasks">☑</span><span class="fl">${FLAME}</span></div>
    </div>${o.card ? o.card : ''}</div>`;
    const q = s => el.querySelector(s), qa = s => [...el.querySelectorAll(s)];
    const scaler = q('.fa__scaler'), view = q('.fa-view'), thread = q('.fa-fl__thread'), st = q('.fa-fl__st'), win = q('.fa-win');
    let W = W0, H = H0;
    function fit() {
      const w = el.clientWidth || 1000, phone = w < 700;
      el.classList.toggle('is-phone', phone);
      W = phone ? 380 : W0; H = phone ? 720 : H0;
      const k = w / W; scaler.style.width = W + 'px'; scaler.style.height = H + 'px'; scaler.style.transform = `scale(${k})`; el.style.height = Math.round(H * k) + 'px';
    }
    fit(); if ('ResizeObserver' in window) new ResizeObserver(fit).observe(el); else addEventListener('resize', fit);
    const api = {
      el, q, view, cur: '', token: 0,
      go(name, flash) {
        api.cur = name; view.classList.remove('is-in'); void view.offsetWidth; view.innerHTML = (V[name] || V.dashboard)(); view.classList.add('is-in');
        const r = ROW_OF[name] || '';
        qa('.mk-row[role=tab]').forEach(b => { const on = b.dataset.row === r; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && flash) { b.classList.remove('is-flash'); void b.offsetWidth; b.classList.add('is-flash'); } });
        qa('.fa-rack span[data-rk]').forEach(s => s.classList.toggle('on', s.dataset.rk === r));
        const side = q('.mk-side'), onb = q('.mk-row.is-on'); if (el.classList.contains('is-phone') && side && onb) side.scrollLeft = Math.max(0, onb.offsetLeft - 10);
        const d = view.querySelector('[data-wb]'); if (d) drag(d);
        view.querySelectorAll('[data-open]').forEach(f => f.addEventListener('click', () => { if (o.onUser) o.onUser(); api.go(f.dataset.open, true); api.fill(); }));
      },
      me(text) { const d = document.createElement('div'); d.className = 'fa-m fa-m--me'; d.textContent = text; thread.appendChild(d); trim(); },
      async fl(text, acts, tok) {
        const t = document.createElement('div'); t.className = 'fa-m fa-m--fl'; t.innerHTML = `${FLAME}<p><span class="fa-dots">•••</span></p>`; thread.appendChild(t); trim();
        await api.wait(still ? 0 : 520, tok);
        t.innerHTML = `${FLAME}<div><p>${md(text)}</p>${acts && acts.length ? `<div class="fa-acts">${acts.map(a => `<button type="button" class="fa-act" data-ask="${esc(a[1])}">${esc(a[0])}</button>`).join('')}</div>` : ''}</div>`; trim();
      },
      async typeAsk(text, tok) { const s = q('.fa-typed'); if (!s) return; s.textContent = ''; for (const ch of text) { s.textContent += ch; await api.wait(still ? 0 : 28, tok); } await api.wait(still ? 0 : 250, tok); s.textContent = ''; },
      async say(text, tok) { await api.typeAsk(text, tok); api.me(text); },
      status(s, on) { st.textContent = s; st.classList.toggle('is-on', !!on); },
      toast(text) { const old = q('.fa-toast'); if (old) old.remove(); const t = document.createElement('div'); t.className = 'fa-toast'; t.textContent = text; q('.fa-main').appendChild(t); setTimeout(() => t.remove(), still ? 99999 : 2600); },
      clear() { thread.innerHTML = ''; },
      wait(ms, tok) { return new Promise((res, rej) => setTimeout(() => (tok != null && tok !== api.token ? rej(STOP) : res()), still ? 0 : ms)); },
      chips(list) { q('.fa-chips').innerHTML = list.map(c => `<button type="button" class="fa-chip" data-ask="${esc(c[1])}">${esc(c[0])}</button>`).join(''); },
      async typeInto(sel, html, tok, per = 260) { const box = view.querySelector(sel); if (!box) return; for (const h of html) { await api.wait(still ? 0 : per, tok); box.insertAdjacentHTML('beforeend', h); } },
      fill() { const p = view.querySelector('#fv-page'); if (p && p.children.length < 3) p.insertAdjacentHTML('beforeend', DOC.join('')); },
    };
    function trim() { while (thread.children.length > 7) thread.firstElementChild.remove(); }
    // sidebar rows are tabs: click or arrow keys open the view; Flint says where it lives
    el.addEventListener('click', e => {
      const b = e.target.closest('.mk-row[data-row]'); if (!b) return;
      if (o.onUser) o.onUser();
      const v = b.hasAttribute('data-doc') ? 'doc' : b.dataset.row; api.go(v, true); if (v === 'doc') api.fill();
      api.token++; tabSay(v);
    });
    el.addEventListener('keydown', e => {
      const b = e.target.closest('.mk-row[role=tab]'); if (!b || !/^Arrow(Up|Down|Left|Right)$|^Home$|^End$/.test(e.key)) return;
      e.preventDefault(); const tabs = qa('.mk-row[role=tab]'), i = tabs.indexOf(b);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (/Down|Right/.test(e.key) ? 1 : -1) + tabs.length) % tabs.length;
      tabs[n].focus(); tabs[n].click();
    });
    async function tabSay(v) { const tok = api.token; const nm = NAME[ROW_OF[v]] || 'Files'; try { api.me(v === 'doc' ? 'open the launch plan' : CMD[v]); await api.fl(v === 'doc' ? 'Opened **Launch plan** from Files.' : `**${nm}** lives here. Opened it for you.`, null, tok); } catch (e) { if (e !== STOP) throw e; } }
    api.go(o.view || 'dashboard');
    return api;
  }
  const DOC = ['<h6>What we’re launching</h6>', '<p>Track every kombucha batch from brewing to bottling, and take café orders online.</p>', '<h6>Done</h6>', '<ul><li>Batch counter · Orders page · Café list</li></ul>', '<h6>Still to do</h6>', '<ul><li>☐ Delivery routes (Jay) &nbsp; ☐ Flavor photos (Maya’s Codex)</li></ul>', '<h6>Launch checklist</h6>', '<ul><li>☐ Works on a phone &nbsp; ☐ Someone outside tried it &nbsp; ☐ Post written</li></ul>'];

  // draggable stickies on the whiteboard
  function drag(board) {
    board.querySelectorAll('.fv-sticky').forEach(s => s.addEventListener('pointerdown', e => {
      e.preventDefault(); const r = board.getBoundingClientRect(), k = r.width / board.offsetWidth || 1, x0 = e.clientX, y0 = e.clientY, l0 = s.offsetLeft, t0 = s.offsetTop;
      s.setPointerCapture(e.pointerId);
      const mv = ev => { s.style.left = Math.max(0, l0 + (ev.clientX - x0) / k) + 'px'; s.style.top = Math.max(0, t0 + (ev.clientY - y0) / k) + 'px'; };
      const up = () => { s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', up); };
      s.addEventListener('pointermove', mv); s.addEventListener('pointerup', up);
    }));
  }

  /* ---------------- stories ---------------- */
  // a story is an async function (app, tok, step) that plays once; the runner loops it while visible
  const S = {
    hero: async (a, t, step) => {
      a.go('dashboard'); a.clear(); a.status('basic mode · no model'); card(a, 0);
      await a.wait(900, t); await a.say('good morning', t);
      a.go('brief', true); await a.fl('**Morning Camp.** 2 new orders came in overnight; the ginger batch is ready to bottle. 2 tasks on you, and next up is filling the Grow seat.', null, t); card(a, 1);
      await a.wait(1800, t); await a.say('add a jump sound and make the title bigger', t);
      a.go('preview', true); await a.wait(500, t); card(a, 2);
      a.toast('Added jump.wav · credited in CREDITS.md'); await a.wait(700, t);
      const h = a.view.querySelector('#fv-title'); if (h) h.style.fontSize = '34px'; card(a, 3);
      await a.fl('Done: added `assets/sounds/jump.wav` (free to use, credited) and made the title 34px in the preview. Undo is one tap.', [['Undo', 'undo'], ['Make it bounce', 'bounce']], t); card(a, 4);
      await a.wait(3200, t);
    },
    run: async (a, t, step) => {
      a.go('dashboard'); a.clear(); step(0);
      await a.wait(700, t); step(1); await a.say('open the task board', t); a.go('tasks', true); step(2); await a.fl('**Task Board** lives here. Opened it for you.', null, t);
      await a.wait(1600, t); step(3); await a.say('open the whiteboard', t); a.go('whiteboard', true); await a.fl('**Whiteboard** lives here. Drag the notes around.', null, t);
      await a.wait(1600, t); await a.say('invite Sam', t); a.go('invite', true); await a.fl('Here’s your tribe link for Sam. Copy it, or show the QR code.', [['Copy link', 'copy']], t); a.toast('Link copied');
      await a.wait(2800, t);
    },
    teach: async (a, t, step) => {
      a.go('academy'); a.clear(); step(0); const pre = () => a.view.querySelector('#fv-lesson'), tab = s => a.view.querySelectorAll('#fv-tabs span').forEach(x => x.classList.toggle('on', x.dataset.s === s));
      await a.wait(600, t); step(1); await a.say('teach me what an API is', t);
      tab('picture'); pre().textContent = LESSON.picture; await a.fl('**An API**, as a picture. Want it another way?', [['Another way', 'x'], ['Quiz me lightly', 'x']], t);
      await a.wait(2000, t); step(2); await a.say('another way', t); tab('analogy'); pre().textContent = LESSON.analogy; await a.fl('**An API**, as an analogy: a waiter who brings what you order.', null, t);
      await a.wait(2000, t); tab('code'); pre().textContent = LESSON.code; await a.fl('And as code. I’ll remember you like code examples.', null, t);
      await a.wait(1600, t); step(3); a.view.querySelector('#fv-quiz').innerHTML = '<b>Quick one: an API is mostly…</b><span class="ok">✓ a menu of things to ask for</span><span>a kind of database</span>'; await a.fl('✓ Right. Nicely done.', null, t);
      await a.wait(2600, t);
    },
    docs: async (a, t, step) => {
      a.go('files'); a.clear(); step(0); a.status('ready · Claude through the host’s key', true);
      await a.wait(600, t); step(1); await a.say('write the launch doc', t);
      await a.fl('Writing the launch doc from your vision, tasks, decisions and chat…', null, t); step(2);
      a.go('doc', true); await a.typeInto('#fv-page', DOC, t, 380); step(3);
      a.toast('Launch plan saved to Files'); await a.fl('Done: **Launch plan** is in Files, marked as a Flint draft. Read it over before you share it.', [['Open it', 'x']], t);
      await a.wait(3000, t);
    },
    know: async (a, t, step) => {
      a.go('dashboard'); a.clear(); step(0);
      await a.wait(600, t); step(1); await a.say('good morning', t); a.go('brief', true);
      await a.fl('**Morning Camp.** 2 new orders overnight; last time you were on the orders page. Next up: fill the Grow seat.', null, t); step(2);
      await a.wait(1800, t); step(3); await a.say('remember I’m learning CSS', t);
      a.go('settings', true); await a.wait(400, t); a.view.querySelector('#fv-set').insertAdjacentHTML('beforeend', note('fact', 'I’m learning CSS', true));
      await a.fl('Okay, I’ll remember: “I’m learning CSS”. Only you can see it, in Settings › Flint.', null, t);
      await a.wait(3000, t);
    },
    brain: async (a, t, step) => {
      a.go('brain'); a.clear(); const pick = k => a.view.querySelectorAll('[data-brain]').forEach(x => x.classList.toggle('on', x.dataset.brain === k));
      step(1); pick('basic'); a.status('basic mode · no model'); await a.wait(500, t); await a.say('what changed today?', t);
      await a.fl('3 changes today: Maya’s Codex added Today’s orders, Jay finished delivery routes, 1 approval waits for you.', null, t);
      await a.wait(1600, t); step(2); pick('ollama'); a.status('ready · qwen3 on the host', true); a.toast('Flint’s brain: Qwen on the host’s computer'); await a.wait(600, t);
      await a.say('write a friendly note to the café about Friday', t); await a.fl('Hi Juniper Café! Your 40 bottles of Ginger Lemon are bottled and ready for Friday morning. Thanks for having us! 🍋', null, t);
      await a.wait(1800, t); step(3); pick('cloud'); a.status('ready · Claude through the host’s key', true); a.toast('Flint’s brain: a cloud AI'); await a.wait(600, t);
      await a.say('plan our spring launch in 3 steps', t); await a.fl('1. Brew two spring flavors this week.\n2. Email the 120 customers (it’ll ask you first).\n3. A tasting table at Saturday’s market.', null, t);
      await a.wait(3000, t);
    },
    skill: async (a, t, step) => {
      a.go('skills'); a.clear(); step(0);
      for (let i = 0; i < 2; i++) {
        step(1); await a.wait(400, t); await a.say('what’s new', t); await a.fl('3 changes today; 1 approval waits for you.', null, t);
        await a.say('write the changelog', t); await a.fl('Changelog drafted in Files.', null, t);
      }
      step(2); await a.fl('You’ve done these 2 together before. Want me to make it a skill? Then anyone can run it with **/ship-friday**.', [['Make it /ship-friday', 'x'], ['Not now', 'x']], t);
      await a.wait(1300, t); a.view.querySelector('#fv-set').insertAdjacentHTML('beforeend', '<div class="fv-skill" id="fv-sk"><b>/ship-friday</b><ol><li>what’s new</li><li>write the changelog</li></ol></div>'); a.toast('Saved /ship-friday for the whole tribe');
      await a.wait(1200, t); step(3); await a.say('/ship-friday', t); await a.fl('Running **/ship-friday**: 2 steps. Anything outward or costly still asks you first.', null, t);
      for (const li of a.view.querySelectorAll('#fv-sk li')) { await a.wait(700, t); li.classList.add('ok'); li.textContent = '✓ ' + li.textContent; }
      await a.fl('All 2 steps done.', null, t); await a.wait(2800, t);
    },
    safe: async (a, t, step) => {
      a.go('approval'); a.clear(); step(0);
      await a.wait(800, t); step(1); await a.fl('Grow wants to email 120 customers. That’s outward, so it waits for a person.', [['Review it', 'x']], t);
      await a.wait(1400, t); step(2);
      const ok = a.view.querySelector('#fv-ok'), cur = a.q('.fv-cursor') || (() => { const c = document.createElement('div'); c.className = 'fv-cursor'; c.innerHTML = '<svg viewBox="0 0 17 22" width="22" height="28"><path d="M1 1v17l5-4 3 7 3-1-3-7h7z" fill="#fff" stroke="#1D2021" stroke-width="1.5" stroke-linejoin="round"/></svg>'; a.q('.fa-main').appendChild(c); return c; })();
      const m = a.q('.fa-main').getBoundingClientRect(), r = ok.getBoundingClientRect(), k = m.width / a.q('.fa-main').offsetWidth || 1;
      cur.style.left = ((r.left - m.left) / k + 160) + 'px'; cur.style.top = ((r.top - m.top) / k + 90) + 'px'; await a.wait(60, t);
      cur.style.left = ((r.left - m.left) / k + 30) + 'px'; cur.style.top = ((r.top - m.top) / k + 10) + 'px'; await a.wait(900, t);
      a.view.querySelector('#fv-appr-btns').outerHTML = '<span class="fv-done">✓ Approved by Camp · sending now</span>'; cur.remove(); step(3);
      a.toast('Approved by Camp'); await a.fl('Approved by Camp at 9:43. The email is on its way.', null, t);
      await a.wait(3000, t);
    },
  };
  function card(a, n) {
    const c = a.q('.mk-card'); if (!c) return;
    c.querySelectorAll('.mk-plan li').forEach((li, i) => { li.classList.toggle('done', i < n); li.classList.toggle('is-active', i === n); });
    const ch = c.querySelector('.mk-chip'); if (ch) { ch.textContent = `${Math.min(n, 4)}/4`; ch.classList.toggle('mk-chip--live', n >= 4); }
  }
  const HERO_CARD = `<div class="mk-card" aria-hidden="true"><div class="mk-card__head"><img src="assets/brand/flint.svg" alt="" width="18" height="23" style="image-rendering:pixelated"><b style="color:var(--fa-act)">Flint</b><span class="mk-chip">0/4</span></div><p class="mk-card__title">Camp’s morning</p><ol class="mk-plan"><li><i></i><span>Catch Camp up</span></li><li><i></i><span>Open the preview</span></li><li><i></i><span>Add a jump sound</span></li><li><i></i><span>Make the title bigger</span></li></ol><div class="mk-follow"><span>+ Ask a follow-up</span><i class="mk-send"></i></div></div>`;

  // the runner: play while visible, stop on a visitor's click, resume after scrolling away and back
  function auto(app, story, steps) {
    let visible = false, userHeld = false, running = false;
    const lis = steps ? [...steps.querySelectorAll('li')] : [];
    const step = n => lis.forEach((li, i) => { li.classList.toggle('on', i === n - 1); li.classList.toggle('done', i < n - 1); });
    app.hold = () => { userHeld = true; app.token++; lis.forEach(li => li.classList.remove('on')); };
    async function loop() {
      if (running) return; running = true;
      try {
        while (visible && !userHeld) {
          const t = ++app.token;
          try { await story(app, t, step); } catch (e) { if (e !== STOP) throw e; }
          if (still) break;
        }
      } finally { running = false; }
    }
    if (still || !('IntersectionObserver' in window)) { visible = true; const t = ++app.token; story(app, t, step).catch(() => {}); return; }
    new IntersectionObserver(es => es.forEach(e => {
      visible = e.isIntersecting;
      if (visible) loop(); else { app.token++; userHeld = false; }
    }), { threshold: .3 }).observe(app.el);
  }

  /* ---------------- build the page ---------------- */
  const apps = {};
  document.querySelectorAll('[data-app]').forEach(el => {
    const k = el.dataset.app;
    if (k === 'try') return;
    const sm = k !== 'hero';
    const a = apps[k] = App(el, { small: sm, card: k === 'hero' ? HERO_CARD : '', view: { teach: 'academy', docs: 'files', know: 'dashboard', brain: 'brain', skill: 'skills', safe: 'approval' }[k] || 'dashboard', onUser: () => a.hold && a.hold() });
    a.el.addEventListener('pointerdown', () => a.hold && a.hold());
    const art = el.closest('.fx'), steps = art ? art.querySelector('.fx-steps') : null;
    if (S[k]) auto(a, S[k], steps);
  });

  /* ---------------- the try-it copy ---------------- */
  const tryEl = document.querySelector('[data-app="try"]');
  if (tryEl) {
    const a = App(tryEl, { input: true, h: 640, view: 'dashboard' });
    a.chips([['Hi Flint', 'hi'], ['Add a jump sound', 'add a jump sound'], ['Teach me what an API is', 'teach me what an API is'], ['Write the launch doc', 'write the launch doc'], ['Remember I like code examples', 'remember I like code examples'], ['Build me a habit tracker', 'build me a habit tracker'], ['What’s new?', "what's new?"], ['Open the whiteboard', 'open the whiteboard']]);
    let busy = false, news = 0;
    const R = [
      [/^(hi|hey|hello|morning|good morning|brief me)\b/, async () => { a.go('brief', true); await a.fl('**Morning Camp.** 2 new orders came in; the ginger batch is ready to bottle. 2 tasks on you, and next up is filling the Grow seat.', [['What should I do next?', 'what should I do next?']]); }],
      [/jump sound|sound effect|add a sound/, async () => { a.go('preview', true); a.toast('Added jump.wav · credited in CREDITS.md'); beep(); await a.fl('Added a jump sound: `assets/sounds/jump.wav` (credits in `assets/CREDITS.md`). Want more?', [['Make the title bigger', 'make the title bigger']]); }],
      [/title bigger|bigger title|make .*bigger/, async () => { if (a.cur !== 'preview') a.go('preview', true); await new Promise(r => setTimeout(r, 300)); const h = a.view.querySelector('#fv-title'); if (h) h.style.fontSize = '34px'; await a.fl('Made the title bigger in the preview (20px → 34px).', [['Undo', 'undo']]); }],
      [/^undo/, async () => { const h = a.view.querySelector('#fv-title'); if (h) h.style.fontSize = ''; await a.fl('Undone.'); }],
      [/^quiz/, async () => { await a.fl('Quick one: an API is mostly…', [['A menu of things to ask for', 'answer a'], ['A kind of database', 'answer b']]); }],
      [/^answer a/, async () => { await a.fl('✓ Right. Nicely done.'); }],
      [/^answer b/, async () => { await a.fl('Not quite: it’s a menu of things one program can ask another for.', [['Another way', 'teach me what an API is as analogy']]); }],
      [/teach me|explain|what('?s| is) an? api/, async t => { const s = /analog/.test(t) ? 'analogy' : /code/.test(t) ? 'code' : /step/.test(t) ? 'steps' : 'picture'; a.go('academy', true); a.view.querySelectorAll('#fv-tabs span').forEach(x => x.classList.toggle('on', x.dataset.s === s)); a.view.querySelector('#fv-lesson').textContent = LESSON[s]; const nx = { picture: 'analogy', analogy: 'code', code: 'steps', steps: 'picture' }[s]; await a.fl(`**An API**, ${s === 'picture' ? 'as a picture' : s === 'analogy' ? 'as an analogy' : s === 'code' ? 'as code' : 'step by step'}. I’ll remember the style you like.`, [['Another way', `teach me what an API is as ${nx}`], ['Quiz me lightly', 'quiz me']]); }],
      [/launch doc|launch plan|readme|meeting notes|changelog/, async () => { await a.fl('Writing the launch doc from your vision, tasks, decisions and chat…'); a.go('doc', true); await a.typeInto('#fv-page', DOC, null, 300); a.toast('Launch plan saved to Files'); await a.fl('Done: **Launch plan** is in Files, marked as a Flint draft. Read it over before you share it.'); }],
      [/^remember|^call me|^my name is/, async t => { const n = t.replace(/^remember (that )?/, '').replace(/^call me (.+)/, 'my name is $1'); a.go('settings', true); await new Promise(r => setTimeout(r, 300)); a.view.querySelector('#fv-set').insertAdjacentHTML('beforeend', note('pref', n.charAt(0).toUpperCase() + n.slice(1), true)); await a.fl(`Okay, I’ll remember: “${n}”. Only you can see it, in Settings › Flint.`, [['What do you know about me?', 'what do you know about me?']]); }],
      [/know about me|who am i/, async () => { a.go('settings', true); await a.fl('Here’s what you asked me to remember (only you can see it): your name is Camp, and you like code examples.', [['Forget everything', 'forget everything']]); }],
      [/^forget/, async () => { a.go('settings', true); a.view.querySelectorAll('.fv-note').forEach(n => n.remove()); await a.fl('Done. I’ve forgotten everything about you.'); }],
      [/^build( me)?/, async t => { const w = t.replace(/^build( me| us)?\s*(an?\s+)?/, '') || 'a habit tracker'; a.go('messages', true); await a.fl(`On it: “${w}”. I wrote it down as the vision, started a first version in the Preview, and handed the brief to Orion’s Claude. It refreshes as they work.`, [['Open the Preview', 'open the preview']]); a.toast('Brief sent to Orion’s Claude'); }],
      [/whiteboard/, async () => { a.go('whiteboard', true); await a.fl('**Whiteboard** lives here. Drag the notes around.'); }],
      [/task board|tasks/, async () => { a.go('tasks', true); await a.fl('**Task Board** lives here. Opened it for you.'); }],
      [/open the preview|^preview/, async () => { a.go('preview', true); await a.fl('**Preview** lives here: the app, running live.'); }],
      [/^\/ship-friday|ship friday/, async () => { a.go('skills', true); await a.fl('Running **/ship-friday**: what’s new → write the changelog. All done.'); a.toast('/ship-friday ran 2 steps'); }],
      [/what('?s| is) new|what changed|catch me up/, async () => { a.go('messages', true); news++; await a.fl('3 changes today: Maya’s Codex added Today’s orders, Jay finished delivery routes, and 1 approval is waiting for you.', [['Write the changelog', 'write the changelog']]); if (news === 2) await a.fl('You’ve done “what’s new” before. Want me to make a skill? Then anyone can run it with **/ship-friday**.', [['Make it /ship-friday', '/ship-friday']]); }],
      [/what should i do|what next|next up/, async () => { a.go('dashboard', true); await a.fl('Here’s what I’d do next:\n1. **Fill the Grow seat**\n2. **Track the money**: import a Stripe CSV\n3. **Find add-ons** for this project'); }],
      [/invite/, async () => { a.go('invite', true); await a.fl('Here’s your tribe link. Copy it, or show the QR code.'); a.toast('Link copied'); }],
    ];
    async function ask(text) {
      text = String(text || '').trim(); if (!text || busy) return; busy = true;
      try { a.token++; a.me(text); const t = text.toLowerCase().replace(/[?!.]+$/, ''); const hit = R.find(([rx]) => rx.test(t)); if (hit) await hit[1](t); else await a.fl('Here I can show a few things Flint does. In your own tribe, Flint handles the everyday things without an AI, and anything else once you add one. Try one of the suggestions.'); }
      finally { busy = false; }
    }
    tryEl.addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b) ask(b.dataset.ask); });
    tryEl.querySelector('.fa-ask').addEventListener('submit', e => { e.preventDefault(); const i = tryEl.querySelector('.fa-ask input'); const v = i.value; i.value = ''; ask(v); });
    a.fl('Hi, I’m **Flint**. Press a suggestion below or type your own, and watch the app.');
    window.FlintTry = { ask };
  }
  function beep() { try { const A = window.AudioContext || window.webkitAudioContext; const c = beep.c || (beep.c = new A()), o = c.createOscillator(), g = c.createGain(), t = c.currentTime; o.type = 'square'; o.frequency.setValueAtTime(280, t); o.frequency.exponentialRampToValueAtTime(820, t + .16); g.gain.setValueAtTime(.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .22); o.connect(g).connect(c.destination); o.start(t); o.stop(t + .24); } catch {} }

  /* ---------------- 02: the build feed + a phone running the app ---------------- */
  const fb = document.querySelector('[data-build]');
  if (fb) {
    const HAB = [['🗑️', 'Bins out', 'Maya', '#6C7CFF', 'M', 4, true], ['🪴', 'Plants watered', 'Jay', '#F4A64A', 'J', 9, true], ['🍽️', 'Dishes', 'Jay', '#F4A64A', 'J', 2, false], ['🧹', 'Hoover', 'Camp', '#F26B1D', 'C', 1, false], ['💸', 'Pay rent', 'Camp', '#F26B1D', 'C', 6, true]];
    fb.innerHTML = `<div class="fb__feed" aria-hidden="true">
        <div class="fb__head"><span class="mk-head__ic" style="width:30px;height:30px;border-radius:8px;border:1px solid var(--edge);display:grid;place-items:center">#</span><div><b># general</b><br><span>Flat habits · 3 here</span></div></div>
        <div class="mk-msg" data-k="1"><i class="mk-av" style="--c:#F26B1D;--ink:#fff">C</i><div><p class="mk-who">Camp<time>7:02</time></p><p>@flint build me a habit tracker for our flat</p></div></div>
        <div class="mk-msg" data-k="2"><i class="mk-av mk-av--agent" style="color:#F26B1D">${FLAME}</i><div><p class="mk-who" style="--n:#F2A36B">Flint<time>7:02</time></p><p>On it. Here’s what I’m doing:</p><div class="mk-tools"><div class="mk-tool on" data-k="2"><span class="mk-tool__k">Wrote</span><span class="mk-tool__v">the vision</span><span class="mk-ok">✓</span></div><div class="mk-tool on" data-k="3"><span class="mk-tool__k">Created</span><span class="mk-tool__v">index.html · app.js · style.css</span><span class="mk-diff"><ins>+142 +88 +61</ins></span></div><div class="mk-tool on" data-k="4"><span class="mk-tool__k">Tests</span><span class="mk-tool__v">4 passed</span><span class="mk-ok">✓</span></div><div class="mk-tool on" data-k="5"><span class="mk-tool__k">Handed</span><span class="mk-tool__v">the brief to Orion’s Claude</span></div></div></div></div>
        <div class="mk-msg mk-msg--agent" data-k="6"><i class="mk-av mk-av--agent mk-av--claude"><span>✦</span></i><div><p class="mk-who">Orion's Claude <em>Claude Code</em><time>7:05</time></p><p>Added streaks, so a habit you keep up shows a flame.</p><div class="mk-tools"><div class="mk-tool on"><span class="mk-tool__k">Edited</span><span class="mk-tool__v">streaks</span><span class="mk-diff"><ins>+34</ins></span></div></div></div></div>
        <span class="fb__status" data-k="7">● Preview reloaded ✓</span>
      </div>
      <div class="fb__phone" aria-hidden="true"><div class="fb__screen"><span class="fb__notch"></span><div class="fb__sb"><span>9:41</span><i>●●● ▮</i></div>
        <div class="fb__app is-blank" id="fb-app"><div class="ha-bar"><b>Flat habits</b><span>C</span></div>
          <div class="ha-week">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<span class="${i === 3 ? 'on' : ''}">${d}<b>${10 + i}</b></span>`).join('')}</div>
          <div class="ha-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="#ECE4D8" stroke-width="4"/><circle id="fb-ring" cx="18" cy="18" r="15" fill="none" stroke="#2F9E5B" stroke-width="4" stroke-linecap="round" stroke-dasharray="94.2" stroke-dashoffset="37.7" transform="rotate(-90 18 18)" style="transition:stroke-dashoffset .5s"/></svg><div><b id="fb-count">3 of 5 today</b><small>Nice going, flat 🎉</small></div></div>
          <div class="ha-list">${HAB.map((h, i) => `<div class="ha-row"><i>${h[0]}</i><div><b>${h[1]}</b><small><em style="--c:${h[3]}">${h[4]}</em>${h[2]}’s turn</small></div><span class="ha-flame" data-fl="${i}">🔥 ${h[5]}</span><span class="ha-chk${h[6] ? ' on' : ''}" data-ck="${i}">${h[6] ? '✓' : ''}</span></div>`).join('')}</div>
          <span class="ha-fab">+ Add habit</span>
          <div class="ha-tabs"><span class="on"><i>☀️</i>Today</span><span><i>📅</i>Week</span><span><i>👥</i>Flatmates</span></div>
        </div><span class="ha-home"></span></div></div>`;
    const art = fb.closest('.fx'), lis = art ? [...art.querySelectorAll('.fx-steps li')] : [];
    const step = n => lis.forEach((li, i) => { li.classList.toggle('on', i === n - 1); li.classList.toggle('done', i < n - 1); });
    const K = n => fb.querySelectorAll(`[data-k="${n}"]`).forEach(x => x.classList.add('is-on'));
    const app = fb.querySelector('#fb-app');
    let tok = 0, visible = false, running = false;
    const wait = (ms, t) => new Promise((res, rej) => setTimeout(() => (t !== tok ? rej(STOP) : res()), still ? 0 : ms));
    function reset() {
      fb.querySelectorAll('[data-k]').forEach(x => x.classList.remove('is-on')); fb.classList.remove('has-streaks'); app.classList.add('is-blank');
      app.querySelectorAll('.ha-toast').forEach(x => x.remove());
      const d = fb.querySelector('[data-ck="2"]'); d.classList.remove('on'); d.textContent = ''; fb.querySelector('[data-fl="2"]').textContent = '🔥 2';
      fb.querySelector('#fb-count').textContent = '3 of 5 today'; fb.querySelector('#fb-ring').style.strokeDashoffset = '37.7';
    }
    async function story(t) {
      reset(); step(0);
      await wait(600, t); step(1); K(1); await wait(900, t); step(2); K(2); await wait(800, t);
      K(3); await wait(500, t); app.classList.remove('is-blank'); await wait(900, t);
      K(4); await wait(700, t); K(5); step(3); await wait(900, t);
      const d = fb.querySelector('[data-ck="2"]'); d.classList.add('on', 'pop'); d.textContent = '✓'; setTimeout(() => d.classList.remove('pop'), 300);
      fb.querySelector('#fb-count').textContent = '4 of 5 today'; fb.querySelector('#fb-ring').style.strokeDashoffset = '18.8';
      app.insertAdjacentHTML('beforeend', '<div class="ha-toast"><em>J</em>Jay checked Dishes</div>');
      await wait(1200, t); K(6); fb.classList.add('has-streaks'); fb.querySelector('[data-fl="2"]').textContent = '🔥 3';
      await wait(800, t); K(7); await wait(3600, t);
    }
    if (still || !('IntersectionObserver' in window)) { story(++tok).catch(() => {}); }
    else new IntersectionObserver(es => es.forEach(async e => {
      visible = e.isIntersecting; if (!visible) { tok++; return; }
      if (running) return; running = true;
      try { while (visible) { const t = ++tok; try { await story(t); } catch (er) { if (er !== STOP) throw er; break; } } } finally { running = false; }
    }), { threshold: .3 }).observe(fb);
  }
})();
