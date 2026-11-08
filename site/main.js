/* TribeCode download site: the download for your OS, live GitHub numbers, and the looping app mocks.
   No libraries. Everything degrades: without JS every link still points somewhere real and every mock shows its
   finished frame. */
(() => {
  'use strict';
  const REPO = 'orionopenwow/TribeCode';
  const API = 'https://api.github.com/repos/' + REPO;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { const v = JSON.parse(sessionStorage.getItem(k) || 'null'); return v && Date.now() - v.t < 10 * 60e3 ? v.d : null; } catch { return null; } },
    set(k, d) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), d })); } catch { /* private mode */ } },
  };
  async function gh(path) {
    const key = 'tc.gh' + path, hit = store.get(key);
    if (hit) return hit;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(API + path, { headers: { Accept: 'application/vnd.github+json' }, signal: ctl.signal });
      if (!r.ok) throw new Error('GitHub ' + r.status);
      const d = await r.json(); store.set(key, d); return d;
    } finally { clearTimeout(timer); }
  }
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
  const ago = iso => {
    const d = Math.max(0, Date.now() - new Date(iso).getTime()) / 864e5;
    return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 30 ? Math.round(d) + ' days ago' : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  /* ---------- nav: border once scrolled, dropdowns, the phone menu ---------- */
  const nav = $('.nav');
  const onScroll = () => nav && nav.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const menus = $$('[data-menu]').map(item => {
    const btn = $('button', item), list = $('.menu', item);
    const set = open => { list.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    return { item, btn, list, set };
  });
  const closeMenus = except => menus.forEach(m => { if (m !== except) m.set(false); });
  const hover = matchMedia('(hover: hover) and (min-width: 901px)');
  menus.forEach(m => {
    m.btn.addEventListener('click', e => { e.stopPropagation(); const open = (hover.matches && e.detail > 0) || m.list.hidden; closeMenus(m); m.set(open); if (open && e.detail === 0) { const f = $('a', m.list); f && f.focus(); } });
    m.item.addEventListener('mouseenter', () => { if (hover.matches) { closeMenus(m); m.set(true); } });
    m.item.addEventListener('mouseleave', () => { if (hover.matches) m.set(false); });
    m.list.addEventListener('click', e => { if (e.target.closest('a')) m.set(false); });
  });
  document.addEventListener('click', e => { if (!e.target.closest('[data-menu]')) closeMenus(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = menus.find(m => !m.list.hidden); if (open) { open.set(false); open.btn.focus(); }
    if (links && links.classList.contains('is-open')) setPhoneMenu(false);
  });
  const toggle = $('.nav__toggle'), links = $('#nav-links');
  function setPhoneMenu(open) {
    links.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Menu'); $('use', toggle).setAttribute('href', open ? '#i-close' : '#i-menu');
  }
  if (toggle && links) {
    toggle.addEventListener('click', () => setPhoneMenu(!links.classList.contains('is-open')));
    links.addEventListener('click', e => { const a = e.target.closest('a'); if (a) setPhoneMenu(false); });
  }

  /* ---------- downloads: your OS first ---------- */
  const ua = navigator.userAgent, plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const os = /iPhone|iPad|iPod|Android/i.test(ua) || (/Mac/.test(plat + ua) && navigator.maxTouchPoints > 1) ? 'phone'
    : /Windows/i.test(ua) || /^Win/i.test(plat) ? 'windows'
    : /Macintosh|Mac OS X/i.test(ua) || /Mac/i.test(plat) ? 'mac'
    : /Linux|X11|CrOS/i.test(plat + ua) ? 'linux' : '';
  const NAMES = { windows: 'Windows', mac: 'macOS (Apple Silicon)', linux: 'Linux' };
  const PICK = {   // release asset name patterns
    windows: [/_x64-setup\.exe$/i, /\.msi$/i],
    mac: [/aarch64\.dmg$/i, /\.dmg$/i],
    linux: [/\.AppImage$/i],
    deb: [/\.deb$/i, /\.rpm$/i],
  };
  const find = (assets, k) => { for (const re of PICK[k] || []) { const a = assets.find(x => re.test(x.name)); if (a) return a; } return null; };
  function setMain(label, href, meta) {
    $$('[data-dl-main]').forEach(a => { if (href) a.href = href; const l = $('[data-dl-label]', a); if (l && label) l.textContent = label; });
    if (meta) $$('[data-dl-meta]').forEach(m => { m.textContent = meta; });
  }
  document.documentElement.dataset.os = os || 'unknown';
  if (os === 'phone') setMain('Desktop app (Windows, Mac, Linux)', null);
  else if (NAMES[os]) {
    setMain('Download for ' + NAMES[os], null);
    $$(`[data-os="${os}"]`).forEach(a => a.classList.add('is-mine'));
  }

  /* ---------- live GitHub numbers ---------- */
  const set = (k, v) => $$(`[data-gh="${k}"]`).forEach(el => { el.textContent = v; el.hidden = false; });
  const box = $('[data-gh-box]');
  let failed = 0;
  const fail = () => { if (++failed === 1) { const f = $('[data-gh-fallback]'); if (f) f.hidden = false; if (box) box.classList.add('is-fallback'); } };
  gh('').then(r => {
    set('stars', fmt(r.stargazers_count)); set('forks', fmt(r.forks_count));
    box && box.classList.add('is-ready');
  }).catch(fail);
  gh('/releases/latest').then(rel => {
    const v = rel.tag_name || rel.name; if (!v) return;
    set('version', v); set('released', 'released ' + ago(rel.published_at));
    set('release-line', `${v} · free and open source · MIT · works with Claude Code`);
    const assets = rel.assets || [];
    $$('[data-os]').forEach(a => {
      const x = find(assets, a.dataset.os); if (!x) return;
      a.href = x.browser_download_url;
      const s = $('span', a); if (s && a.closest('.plats')) s.textContent = x.name.replace(/^TribeCode[_-]?/, '') + ' · ' + Math.round(x.size / 1e6) + ' MB';
    });
    if (NAMES[os]) { const x = find(assets, os); if (x) setMain('Download for ' + NAMES[os], x.browser_download_url, `${v} · ${Math.round(x.size / 1e6)} MB · ${x.name}`); }
    else setMain(null, null, `${v} from GitHub Releases`);
  }).catch(fail);

  /* ---------- scroll reveal ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('is-in'));

  /* ---------- the stage keeps its 1200x750 design and scales to fit ---------- */
  const stage = $('.stage');
  if (stage) {
    const fit = () => stage.style.setProperty('--k', String(stage.clientWidth / 1200));
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(stage); else addEventListener('resize', fit);
    fit();
  }

  /* ---------- looping mocks ----------
     Each [data-loop] runs a script of small ops. Steps ([data-step]) start hidden and are revealed in turn, [data-type]
     text is typed out, ticks check off. Time only advances while the mock is on screen and the tab is visible.
     Reduced motion (or no IntersectionObserver): every op runs at once and the finished frame stays. */
  const SCRIPTS = {
    stage: [
      ['wait', 700], ['show', '#mk-m1'], ['wait', 900],
      ['show', '#mk-a1'], ['show', '#mk-think'], ['text', '#mk-st1', 'reading the request'], ['wait', 1400],
      ['hide', '#mk-think'], ['type', '#mk-a1t'], ['wait', 300],
      ['show', '#mk-card'], ['active', 0], ['wait', 600],
      ['show', '#mk-t1'], ['text', '#mk-st1', 'reading title.js'], ['wait', 900], ['tick', 0], ['show', '#pv-1'], ['active', 1], ['wait', 700],
      ['show', '#mk-t2'], ['text', '#mk-st1', 'editing title.js'], ['wait', 600], ['show', '#pv-2'], ['wait', 700], ['show', '#pv-3'], ['tick', 1], ['active', 2], ['wait', 800],
      ['show', '#mk-t3'], ['text', '#mk-st1', 'editing lantern.js'], ['wait', 600], ['show', '#pv-4'], ['wait', 500], ['show', '#pv-5'], ['tick', 2], ['active', 3], ['wait', 900],
      ['cls', '#pv-lantern', 'is-swinging'], ['cls', '#pv-4', 'is-jumping'], ['wait', 600], ['tick', 3], ['active', 4], ['wait', 700],
      ['show', '#mk-t4'], ['text', '#mk-st1', 'running tests'], ['wait', 1000], ['tick', 4], ['wait', 300],
      ['type', '#mk-a2t'], ['text', '#mk-st1', 'idle · 2 files changed'], ['text', '#mk-st0', "Orion's Claude · done"], ['wait', 900],
      ['show', '#mk-m2'], ['wait', 4200],
    ],
    room: [
      ['wait', 500], ['next'], ['wait', 1000], ['next'], ['type', '.gist [data-type]'], ['wait', 1100], ['next'], ['wait', 1100], ['next'], ['next'], ['wait', 4500],
    ],
    phone: [
      ['wait', 500], ['next'], ['wait', 1100], ['next'], ['wait', 1600], ['cls', '#ph-ok', 'is-pressed'], ['wait', 250], ['cls', '.ask', 'is-approved'], ['next'], ['wait', 900],
      ['next'], ['type', '.mk-msg--agent [data-type]'], ['wait', 4500],
    ],
    lanes: [
      ['wait', 400], ['next'], ['wait', 500], ['next'], ['wait', 500], ['next'], ['wait', 1000], ['next'], ['wait', 900], ['next'], ['wait', 1400],
      ['cls', '#ln-clash', 'is-resolved'], ['text', '.clash__act', 'Handed off · 12s'], ['next'], ['wait', 4500],
    ],
    host: [
      ['wait', 400], ['next'], ['type', '.term [data-type]'], ['wait', 500], ['next'], ['wait', 400], ['next'], ['wait', 900], ['next'], ['wait', 700], ['next'], ['wait', 1200],
      ['next'], ['wait', 900], ['next'], ['wait', 600], ['next'], ['wait', 4500],
    ],
  };

  function runLoop(root, ops) {
    let visible = false, undo = [];
    const tick = () => visible && !document.hidden;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function wait(ms, instant) { if (instant) return; let left = ms; while (left > 0) { await sleep(40); if (tick()) left -= 40; } }
    const typed = $$('[data-type]', root);
    typed.forEach(el => { el.dataset.full = el.textContent; });
    const plan = $$('[data-tick]', root), count = $('#mk-count', root);
    const sync = () => { if (count) count.textContent = plan.filter(li => li.classList.contains('done')).length + '/' + plan.length; };
    async function exec(op, instant) {
      const [k, a, b] = op;
      const el = typeof a === 'string' ? $(a, root) : null;
      if (k === 'wait') return wait(a, instant);
      if (k === 'show' && el) { el.classList.add('on'); undo.push(() => el.classList.remove('on')); }
      else if (k === 'hide' && el) { el.classList.remove('on'); }
      else if (k === 'next') { const n = $$('[data-step]:not(.on)', root)[0]; if (n) { n.classList.add('on'); undo.push(() => n.classList.remove('on')); } }
      else if (k === 'cls' && el) { el.classList.add(b); undo.push(() => el.classList.remove(b)); }
      else if (k === 'text' && el) { const was = el.textContent; el.textContent = b; undo.push(() => { el.textContent = was; }); }
      else if (k === 'active') { plan.forEach(li => li.classList.remove('is-active')); if (plan[a]) plan[a].classList.add('is-active'); undo.push(() => plan.forEach(li => li.classList.remove('is-active'))); }
      else if (k === 'tick' && plan[a]) { plan[a].classList.remove('is-active'); plan[a].classList.add('done'); sync(); undo.push(() => { plan[a].classList.remove('done'); sync(); }); }
      else if (k === 'type' && el) {
        const full = el.dataset.full || '';
        undo.push(() => { el.textContent = ''; el.classList.remove('is-typing'); });
        if (instant) { el.textContent = full; return; }
        el.classList.add('is-typing');
        for (let i = 0; i < full.length;) { i = Math.min(full.length, i + 1 + (Math.random() * 3 | 0)); el.textContent = full.slice(0, i); await wait(28 + Math.random() * 24); }
        el.classList.remove('is-typing');
      }
    }
    if (reduce || !('IntersectionObserver' in window)) {
      ops.forEach(op => exec(op, true)); plan.forEach(li => li.classList.remove('is-active'));
      root.dataset.state = 'done'; return;
    }
    typed.forEach(el => { el.textContent = ''; });
    root.dataset.state = 'waiting';
    let started = false;
    new IntersectionObserver(es => {
      visible = es.some(e => e.isIntersecting);
      if (visible && !started) { started = true; root.dataset.state = 'running'; loop(); }
    }, { threshold: 0.2 }).observe(root);
    async function loop() {
      for (;;) {
        for (const op of ops) await exec(op, false);
        root.classList.add('is-resetting'); await wait(450);
        for (const f of undo.reverse()) f(); undo = [];
        root.classList.remove('is-resetting'); await wait(300);
      }
    }
  }
  $$('[data-loop]').forEach(root => { const ops = SCRIPTS[root.dataset.loop]; if (ops) runLoop(root, ops); });
})();

/* ---------- getting into the app: phones open it first; returning people get "Continue to your tribe" ---------- */
(function () {
  const root = document.documentElement;
  // phones can't install the desktop app: "Open the app" leads, the desktop download follows
  if (root.dataset.os === 'phone') root.classList.add('is-phone');
  // the app and the site share this origin, so the app's saved settings tell us you've been in before
  let st = null; try { st = JSON.parse(localStorage.getItem('tribecode.settings.v1') || 'null'); } catch (e) {}
  const back = st && (st.name || (st.server && st.server.token));
  const bar = document.getElementById('continue');
  if (back && bar) {
    const first = String(st.name || '').trim().split(/\s+/)[0];
    const label = bar.querySelector('[data-continue-label]'); if (label) label.textContent = first ? `Welcome back, ${first}. Continue to your tribe` : 'Continue to your tribe';
    bar.hidden = false;
    document.querySelectorAll('[data-open-app]').forEach(a => { a.firstChild && a.firstChild.nodeType === 3 && (a.firstChild.textContent = a.classList.contains('nav__open') ? 'Open your tribe' : 'Continue in your browser'); });
  }
})();

/* ---------- the hero's typing line: things people ask their tribe, typed out one after another ---------- */
(function () {
  const el = document.querySelector('[data-typer]'); if (!el) return;
  const ASKS = [
    'make a website for my game and invite my friends',
    'connect my Claude and fix the jump physics',
    'plan the boss fight with Maya’s Claude',
    'add a title screen, then ship v0.2',
    'turn tonight’s huddle into notes and tasks',
    'split the levels so nobody steps on each other',
    'host our tribe from my laptop',
    'preview the game on my phone',
  ];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = ASKS[0]; return; }
  let i = 0, n = ASKS[0].length, dir = -1, visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(el);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  (async function loop() {
    await wait(2200);                     // the first line sits there as the page loads
    for (;;) {
      if (!visible || document.hidden) { await wait(400); continue; }
      const t = ASKS[i];
      if (dir < 0) { n--; el.textContent = t.slice(0, n); el.scrollLeft = el.scrollWidth; await wait(18); if (n <= 0) { dir = 1; i = (i + 1) % ASKS.length; await wait(260); } }
      else { n++; el.textContent = ASKS[i].slice(0, n); el.scrollLeft = el.scrollWidth; await wait(34 + Math.random() * 40); if (n >= ASKS[i].length) { dir = -1; await wait(2300); } }
    }
  })();
})();
