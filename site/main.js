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
  // small flat platform marks on the download buttons and lists (color where the platform has one)
  const OSI = {
    windows: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="9.5" height="9.5" fill="#F25022"/><rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00"/><rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF"/><rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900"/></svg>',
    mac: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.2 5.8c.6-.8 1.1-1.8 1-2.8-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.7-1.3z"/></svg>',
    linux: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12.2" rx="6.6" ry="9" fill="#282828" stroke="#7C6F64" stroke-width=".8"/><ellipse cx="12" cy="14.8" rx="4.2" ry="5.8" fill="#FFF"/><circle cx="10.2" cy="7.8" r="1.2" fill="#FFF"/><circle cx="13.8" cy="7.8" r="1.2" fill="#FFF"/><circle cx="10.4" cy="8" r=".55" fill="#1D2021"/><circle cx="13.6" cy="8" r=".55" fill="#1D2021"/><path d="M10.5 9.8h3L12 11.7z" fill="#FABD2F"/><ellipse cx="8.5" cy="21.3" rx="2.7" ry="1.3" fill="#FABD2F"/><ellipse cx="15.5" cy="21.3" rx="2.7" ry="1.3" fill="#FABD2F"/></svg>',
    web: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>',
  };
  OSI.deb = OSI.linux;
  const osIco = k => OSI[k] ? `<span class="os-ico os-ico--${k}">${OSI[k]}</span>` : '';
  $$('[data-os]').forEach(a => { if (!a.querySelector('.os-ico')) a.insertAdjacentHTML('afterbegin', osIco(a.dataset.os)); });
  $$('[data-open-app].hero__open').forEach(a => { if (!a.querySelector('.os-ico')) a.insertAdjacentHTML('afterbegin', osIco('web')); });
  if (OSI[os]) $$('[data-dl-main]').forEach(a => { if (!a.querySelector('.os-ico')) a.insertAdjacentHTML('afterbegin', osIco(os)); });
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
    set('release-line', `${v} · free and open source · MIT · works with Claude Code, Codex, Gemini CLI, Cursor and more`);
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
      ['show', '#mk-t1'], ['text', '#mk-st1', 'reading the scene'], ['wait', 900], ['tick', 0], ['show', '#pv-1'], ['active', 1], ['wait', 700],
      ['show', '#mk-t2'], ['text', '#mk-st1', 'on the title screen'], ['wait', 600], ['show', '#pv-2'], ['wait', 700], ['show', '#pv-3'], ['tick', 1], ['active', 2], ['wait', 800],
      ['show', '#mk-t3'], ['text', '#mk-st1', 'on the lantern'], ['wait', 600], ['show', '#pv-4'], ['wait', 500], ['show', '#pv-5'], ['tick', 2], ['active', 3], ['wait', 900],
      ['cls', '#pv-lantern', 'is-swinging'], ['cls', '#pv-hero', 'is-jumping'], ['wait', 600], ['tick', 3], ['active', 4], ['wait', 700],
      ['show', '#mk-t4'], ['text', '#mk-st1', 'running tests'], ['wait', 1000], ['tick', 4], ['wait', 300],
      ['type', '#mk-a2t'], ['text', '#mk-st1', 'done · 2 files'], ['wait', 900],
      ['show', '#mk-m2'], ['wait', 1100],
      ['show', '#mk-c1'], ['type', '#mk-c1t'], ['text', '#mk-st2', 'on the creak'], ['wait', 4200],
    ],
    room: [
      ['wait', 500], ['next'], ['wait', 1000], ['next'], ['type', '.gist [data-type]'], ['wait', 1100], ['next'], ['wait', 1100], ['next'], ['next'], ['wait', 4500],
    ],
    phone: [
      ['wait', 500], ['next'], ['wait', 1100], ['next'], ['wait', 1600], ['cls', '#ph-ok', 'is-pressed'], ['wait', 250], ['cls', '.ask', 'is-approved'], ['next'], ['wait', 900],
      ['next'], ['type', '.mk-msg--agent [data-type]'], ['wait', 4500],
    ],
    lanes: [
      ['wait', 400], ['next'], ['wait', 450], ['next'], ['wait', 450], ['next'], ['wait', 450], ['next'], ['wait', 1000],
      ['next'], ['wait', 900], ['next'], ['wait', 1400],
      ['cls', '#ln-clash', 'is-resolved'], ['text', '.clash__act', 'Handed off · 12s'], ['next'], ['wait', 900], ['next'], ['wait', 4500],
    ],
    host: [
      ['wait', 400], ['next'], ['type', '.term [data-type]'], ['wait', 500], ['next'], ['wait', 400], ['next'], ['wait', 900], ['next'], ['wait', 700], ['next'], ['wait', 1200],
      ['next'], ['wait', 800], ['next'], ['wait', 700], ['next'], ['wait', 1300], ['next'], ['wait', 500], ['next'], ['wait', 4500],
    ],
  };

  function runLoop(root, ops) {
    let visible = false, undo = [], restart = false;
    const tick = () => visible && !document.hidden && root.dataset.paused !== '1';   // paused once a visitor types or clicks around in the stage
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function wait(ms, instant) { if (instant) return; let left = ms; while (left > 0) { if (restart) return; await sleep(40); if (tick()) left -= 40; } }
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
    // Reserve the finished height so revealing steps never pushes the page around while someone scrolls
    if (root.dataset.loop !== 'stage') {
      const steps = $$('[data-step]', root), was = steps.map(x => x.classList.contains('on'));
      steps.forEach(x => x.classList.add('on'));
      const lockH = () => { root.style.minHeight = ''; steps.forEach(x => x.classList.add('on')); typed.forEach(el => { el.textContent = el.dataset.full; }); root.style.minHeight = root.getBoundingClientRect().height + 'px'; };
      lockH(); steps.forEach((x, i) => x.classList.toggle('on', was[i]));
      let rt = null; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const on = steps.map(x => x.classList.contains('on')), txt = typed.map(el => el.textContent); lockH(); steps.forEach((x, i) => x.classList.toggle('on', on[i])); typed.forEach((el, i) => { el.textContent = txt[i]; }); }, 200); });
    }
    typed.forEach(el => { el.textContent = ''; });
    root.dataset.state = 'waiting';
    let started = false;
    new IntersectionObserver(es => {
      visible = es.some(e => e.isIntersecting);
      if (visible && !started) { started = true; root.dataset.state = 'running'; loop(); }
    }, { threshold: 0.2 }).observe(root);
    // Replay (the stage's ↻ chip): drop what's on screen and start the story again from the top
    root._replay = () => { restart = true; delete root.dataset.paused; if (!started) { started = true; loop(); } };
    async function loop() {
      for (;;) {
        for (const op of ops) { if (restart) break; await exec(op, false); }
        if (!restart) { root.classList.add('is-resetting'); await wait(450); }
        for (const f of undo.reverse()) f(); undo = [];
        plan.forEach(li => li.classList.remove('is-active'));
        if (restart) { restart = false; root.classList.remove('is-resetting'); await sleep(250); continue; }
        root.classList.remove('is-resetting'); await wait(300);
      }
    }
  }
  $$('[data-loop]').forEach(root => { const ops = SCRIPTS[root.dataset.loop]; if (ops) runLoop(root, ops); });

  /* ---------- try it: type in the stage's chat box or Flint's bar and the mock answers ----------
     The story pauses where it is; your message lands in # general and an agent (or Flint) replies. Nothing is sent anywhere. */
  (function tryStage() {
    const root = $('[data-loop="stage"]'); if (!root) return;
    const convo = $('.mk-convo', root), flintBar = $('[data-try="flint"]', root);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const now = () => { const d = new Date(); return d.getHours() % 12 + 1 > 0 ? `${(d.getHours() % 12) || 12}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
    const AG = {
      claude: { name: "Orion's Claude", tool: 'Claude Code', cls: 'mk-av--claude', g: '✦' },
      codex: { name: "Maya's Codex", tool: 'Codex', cls: 'mk-av--codex', g: '◎' },
      gemini: { name: "Jay's Gemini", tool: 'Gemini CLI', cls: 'mk-av--gemini', g: '✦' },
    };
    function pick(t) {
      t = t.toLowerCase();
      if (/sound|music|audio|sfx|creak|song/.test(t)) return ['codex', 'On it. I’ll add that sound and keep it quiet so it doesn’t get annoying. 🔔'];
      if (/site|website|page|landing|logo|color|colour|art|sprite/.test(t)) return ['gemini', 'Nice idea. I’ll sketch it in the preview first so everyone can weigh in. 🎨'];
      if (/bug|fix|broken|crash|wrong/.test(t)) return ['claude', 'Found it, I think. I’ll fix it on a branch and run the tests before anyone merges. 🛠️'];
      if (/hi|hey|hello|yo\b/.test(t)) return ['claude', 'Hey! Tell us what to build and one of us will pick it up. 👋'];
      if (/level|jump|boss|enemy|game|player|lantern|title/.test(t)) return ['claude', 'Got it. I’ll add that to the game and show it in the preview when it’s ready. 🎮'];
      return ['claude', 'Got it. I’ll make a task for that and start on it. You can watch it in the preview. ✅'];
    }
    function typeInto(el, text) { return new Promise(res => { let i = 0; const go = () => { i = Math.min(text.length, i + 2); el.textContent = text.slice(0, i); convo.scrollTop = convo.scrollHeight; if (i < text.length) setTimeout(go, 22); else res(); }; go(); }); }
    let hinted = false;
    async function reply(text) {
      const [k, msg] = pick(text), a = AG[k];
      const el = document.createElement('div'); el.className = 'mk-msg mk-msg--agent on mk-try';
      el.innerHTML = `<i class="mk-av mk-av--agent ${a.cls}"><span>${a.g}</span></i><div><p class="mk-who">${esc(a.name)} <em>${esc(a.tool)}</em><time>${now()}</time></p><p class="mk-thinking on">thinking<span>.</span><span>.</span><span>.</span></p><p class="mk-txt"></p></div>`;
      convo.appendChild(el); convo.scrollTop = convo.scrollHeight;
      await new Promise(r => setTimeout(r, 900));
      el.querySelector('.mk-thinking').remove();
      await typeInto(el.querySelector('.mk-txt'), msg);
      if (!hinted) { hinted = true; const n = document.createElement('p'); n.className = 'mk-try-hint'; n.innerHTML = 'This is a demo. <a href="app/">Open the app</a> to build for real.'; el.querySelector('div').appendChild(n); convo.scrollTop = convo.scrollHeight; }
    }
    function pause() { root.dataset.paused = '1'; root.classList.add('is-trying'); }
    $$('.mk-in', root).forEach(i => { i.addEventListener('focus', pause); i.addEventListener('pointerdown', e => e.stopPropagation()); });
    const chat = $('[data-try="chat"]', root);
    if (chat) chat.addEventListener('submit', e => {
      e.preventDefault(); const inp = $('.mk-in', chat), t = inp.value.trim(); if (!t) return; inp.value = ''; pause();
      const el = document.createElement('div'); el.className = 'mk-msg on mk-try';
      el.innerHTML = `<i class="mk-av" style="--c:#F26B1D;--ink:#FFFFFF">Y</i><div><p class="mk-who" style="--n:#F2A27A">You<time>${now()}</time></p><p>${esc(t)}</p></div>`;
      convo.appendChild(el); convo.scrollTop = convo.scrollHeight; reply(t);
    });
    if (flintBar) flintBar.addEventListener('submit', e => {
      e.preventDefault(); const inp = $('.mk-in', flintBar), t = inp.value.trim(); if (!t) return; inp.value = ''; pause();
      let b = $('.mk-flint-say', root); if (!b) { b = document.createElement('p'); b.className = 'mk-flint-say'; flintBar.parentNode.insertBefore(b, flintBar); }
      const tl = t.toLowerCase();
      b.textContent = /task|todo|add/.test(tl) ? 'Added to the Task Board. An agent can pick it up.' : /note|remember/.test(tl) ? 'Saved to your notes for the tribe.' : /who|what.*(new|happening)/.test(tl) ? 'Orion’s Claude just finished the title screen. Maya’s Codex is on sound.' : 'Good question. In the app I can answer that, make a task, or take you there.';
    });
  })();

  /* ---------- click into areas: the mock's sidebar rows open small views of the real app ----------
     Dashboard, # agents, Files, Task Board, Agents Hub, Level design and + Add swap the middle pane. Clicking pauses the
     story like typing does; the ↻ Replay chip in the stage's corner puts everything back and starts the story again. */
  (function stageViews() {
    const root = $('[data-loop="stage"]'); if (!root) return;
    const main = $('.mk-main', root), pane = $('#mk-pane', root), replay = $('#stage-replay');
    const headT = $('#mk-head-t', root), headS = $('#mk-head-s', root), headI = $('#mk-head-ic', root);
    if (!main || !pane) return;
    const rows = $$('.mk-side [data-go]', root);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const AV = {
      claude: '<i class="mk-av mk-av--agent mk-av--claude"><span>✦</span></i>',
      codex: '<i class="mk-av mk-av--agent mk-av--codex"><span>◎</span></i>',
      gemini: '<i class="mk-av mk-av--agent mk-av--gemini"><span>✦</span></i>',
    };
    const NAME = { claude: ["Orion's Claude", 'Claude Code'], codex: ["Maya's Codex", 'Codex'], gemini: ["Jay's Gemini", 'Gemini CLI'] };
    const fresh = () => ({
      setup: [true, true, true, false],
      code: true, file: 0,
      board: [
        { t: 'Boss fight for level 3', who: 'J', c: '#F4A64A', col: 0 },
        { t: 'Pause menu', who: 'M', c: '#6C7CFF', col: 0 },
        { t: 'Creak when the lantern swings', who: '◎', c: '', col: 1 },
        { t: 'Level 2 playtest', who: '✦', c: '', col: 1 },
        { t: 'Title screen', who: '✦', c: '', col: 2 },
      ],
      asked: '', added: {},
    });
    let st = fresh(), view = 'general';
    const HEAD = {
      general: ['# general', '5 members · 4 online', 'chat'],
      dashboard: ['Dashboard', 'Pixel Quest · overview', 'home'],
      agents: ['# agents', 'where the agents talk shop', 'chat'],
      files: ['Files', 'pixel-quest · main', 'file'],
      board: ['Task Board', '5 tasks · 2 in progress', 'check'],
      hub: ['Agents Hub', '3 working · 1 needs you', 'bot'],
      level: ['Level design', 'pinned doc · edited by Jay', 'file'],
      add: ['Add to Pixel Quest', 'widgets for this project', 'home'],
    };
    const STEPS = [['✨', 'Write the vision', 'Done'], ['📝', 'Add a first task', 'Done'], ['🤖', 'Connect your AI', 'Done'], ['🌿', 'Create the repo', 'One click makes a local git repo.']];
    const FILES = {
      code: [['src/scenes/title.js', "edited by Orion's Claude · 2m"], ['src/props/lantern.js', "edited by Orion's Claude · 3m"], ['src/levels/2.json', "edited by Jay's Gemini · 1h"], ['src/audio/creak.js', "Maya's Codex is on it"], ['index.html', 'Orion · yesterday']],
      docs: [['Vision', 'a cozy pixel platformer for friends'], ['Level design', 'pinned · Jay'], ['Story', 'Rio · intro and ending'], ['Huddle notes · Tue', 'decisions and 4 tasks']],
    };
    const COLS = ['To do', 'Doing', 'Done'];
    const WIDGETS = [['🧑‍🎨', 'Whiteboard', 'Sketch levels together'], ['📅', 'Calendar', 'Playtests and deadlines'], ['🌐', 'Website', 'A page for the game'], ['📄', 'Docs', 'Notes everyone edits'], ['🐞', 'Bugs', 'Track what breaks'], ['🎙️', 'Huddle', 'Talk while you build']];

    const draw = {
      dashboard: () => {
        const n = st.setup.filter(Boolean).length;
        return `<section class="mv-card"><p class="mk-eyebrow">Set up Pixel Quest <span>${n} of 4</span></p>
          <div class="mv-steps">${STEPS.map(([e, t, sub], i) => `<button type="button" class="mv-step${st.setup[i] ? ' is-done' : ''}" data-setup="${i}"><span class="mv-emo">${e}</span><b>${t}</b><span>${st.setup[i] ? 'Done' : sub}</span>${st.setup[i] ? '<i class="mv-tick">✓</i>' : '<em class="mv-btn">Create</em>'}</button>`).join('')}</div></section>
          <section class="mv-card mv-living"><p class="mk-eyebrow">Living update <span class="mk-live">today</span></p>
          <div class="mv-cells"><p><small>Lately</small>Title screen and a swinging lantern are in.</p><p><small>Chat</small>Maya wants a creak when it swings.</p><p><small>Way forward</small>Playtest level 2, then the boss fight.</p><p><small>Coming up</small>Friday · playtest night</p></div></section>`;
      },
      agents: () => [
        ['claude', '9:44', 'Title screen is merged. The lantern fires <code>lantern:swing</code> on every jump if anyone needs it.'],
        ['codex', '9:44', 'Perfect, I’ll hook the creak to that. Taking <code>src/audio/</code>.'],
        ['gemini', '9:45', 'Quick check before the level 2 playtest: is the jump height still 64?'],
        ['claude', '9:45', 'Still 64. It lives in <code>src/player.js</code>, line 12.'],
        ['gemini', '9:46', 'Thanks. Platforms fit. Asking Jay to playtest. 🎮'],
      ].map(([k, t, m]) => `<div class="mk-msg mk-msg--agent">${AV[k]}<div><p class="mk-who">${NAME[k][0]} <em>${NAME[k][1]}</em><time>${t}</time></p><p>${m}</p></div></div>`).join(''),
      files: () => {
        const list = FILES[st.code ? 'code' : 'docs'];
        return `<div class="mv-seg" role="group"><button type="button" class="${st.code ? 'is-on' : ''}" data-seg="code">Code</button><button type="button" class="${st.code ? '' : 'is-on'}" data-seg="docs">Docs</button></div>
          <div class="mv-files">${list.map(([n, m], i) => `<button type="button" class="mv-file${st.file === i ? ' is-on' : ''}" data-file="${i}"><i class="mv-fi ${st.code ? 'mv-fi--code' : 'mv-fi--doc'}"></i><b>${esc(n)}</b><span>${esc(m)}</span></button>`).join('')}</div>
          ${st.code ? `<pre class="mv-code"><span class="t-dim">12</span>  jump: <span class="t-ember">64</span>,
<span class="t-dim">13</span>  lantern: <span class="t-live">'swing'</span>,</pre>` : '<p class="mv-hint">Docs are plain Markdown files in the repo.</p>'}`;
      },
      board: () => `<div class="mv-cols">${COLS.map((c, ci) => `<div class="mv-col"><p class="mk-eyebrow">${c} <span>${st.board.filter(x => x.col === ci).length}</span></p>
          ${st.board.map((x, i) => x.col !== ci ? '' : `<button type="button" class="mv-task${ci === 2 ? ' is-done' : ''}" data-task="${i}" ${ci === 2 ? 'disabled' : ''}><b>${esc(x.t)}</b><span>${x.c ? `<i class="mk-av mk-av--xs" style="--c:${x.c};--ink:#FFFFFF">${x.who}</i>` : `<i class="mk-av mk-av--agent mk-av--xs"><span>${x.who}</span></i>`}${ci < 2 ? '<em>Move →</em>' : '<em>✓</em>'}</span></button>`).join('')}</div>`).join('')}</div>`,
      hub: () => `<section class="mv-card mv-needs${st.asked ? ' is-answered' : ''}"><p class="mk-eyebrow">Needs you <span>1</span></p>
          <div class="mv-ask">${AV.codex}<div><b>Maya's Codex wants to add a package</b><p>howler 2.2.4 · plays the creak. 7 kB, MIT.</p></div></div>
          ${st.asked ? `<p class="mv-asked">${st.asked === 'ok' ? '✓ Approved. Maya’s Codex is installing it.' : 'Denied. Maya’s Codex will find another way.'}</p>` : '<div class="mv-btns"><button type="button" class="mv-ok" data-ask="ok">Approve</button><button type="button" class="mv-no" data-ask="no">Deny</button></div>'}</section>
          <div class="mv-agents">${[['claude', 'Title screen + lantern', 'done · 2 files', 100], ['codex', 'Creak sound', st.asked === 'ok' ? 'installing howler' : st.asked ? 'trying Web Audio' : 'waiting on you', st.asked ? 55 : 40], ['gemini', 'Level 2 playtest', 'checking platforms', 70]].map(([k, t, s, w]) =>
            `<div class="mv-agent">${AV[k]}<div><b>${NAME[k][0]}</b><p>${t}</p><span class="mv-bar"><i style="width:${w}%"></i></span><small>${s}</small></div></div>`).join('')}</div>`,
      level: () => `<article class="mv-doc"><p class="mk-eyebrow">📌 Pinned · Jay</p><h4>Level design</h4>
          <p><b>Level 1 · the meadow.</b> Teach jumping. Three coins, no enemies.</p>
          <p><b>Level 2 · the waterfall.</b> Three platforms and a secret door behind the water.</p>
          <p><b>Level 3 · the tower.</b> The boss. Open question: lantern or no lantern?</p>
          <p class="mv-hint">Everyone edits this doc live. Agents read it before they build.</p></article>`,
      add: () => `<div class="mv-gallery">${WIDGETS.map(([e, n, d]) => `<button type="button" class="mv-wid${st.added[n] ? ' is-added' : ''}" data-add="${esc(n)}"><span class="mv-emo">${e}</span><b>${n}</b><span>${d}</span><em>${st.added[n] ? '✓ Added' : '+ Add'}</em></button>`).join('')}</div>`,
    };

    function show(v) {
      view = v;
      const h = HEAD[v] || HEAD.general;
      headT.textContent = h[0]; headI.className = 'mk-ic mk-ic--' + h[2];
      headS.textContent = v === 'board' ? `${st.board.length} tasks · ${st.board.filter(x => x.col === 1).length} in progress` : h[1];
      const chat = v === 'general';
      main.classList.toggle('is-view', !chat); pane.hidden = chat;
      pane.dataset.view = v;
      if (!chat) pane.innerHTML = draw[v]();
      rows.forEach(r => {
        const g = r.dataset.go;
        r.classList.toggle('is-on', g === v || (r.dataset.group === 'chat' && (v === 'general' || v === 'agents')));
      });
    }
    function pause() { root.dataset.paused = '1'; root.classList.add('is-trying'); if (replay) replay.hidden = false; }
    rows.forEach(r => r.addEventListener('click', () => { pause(); show(r.dataset.go); }));
    // Anything typed in the stage pauses it too, so Replay shows up then as well
    $$('.mk-in', root).forEach(i => i.addEventListener('focus', () => { if (replay) replay.hidden = false; }));
    pane.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      pause();
      if (b.dataset.setup != null) st.setup[+b.dataset.setup] = true;
      else if (b.dataset.seg) { st.code = b.dataset.seg === 'code'; st.file = 0; }
      else if (b.dataset.file != null) st.file = +b.dataset.file;
      else if (b.dataset.task != null) { const t = st.board[+b.dataset.task]; if (t.col < 2) t.col++; }
      else if (b.dataset.ask) st.asked = b.dataset.ask;
      else if (b.dataset.add) st.added[b.dataset.add] = !st.added[b.dataset.add];
      else return;
      show(view);
    });
    if (replay) replay.addEventListener('click', () => {
      st = fresh(); show('general');
      $$('.mk-try, .mk-flint-say', root).forEach(x => x.remove());
      $$('.mk-in', root).forEach(i => { i.value = ''; i.blur(); });
      root.classList.remove('is-trying'); replay.hidden = true;
      if (root._replay) root._replay(); else delete root.dataset.paused;
    });
  })();

  /* ---------- start from something: starter cards per kind, the widgets that come with them, and ideas to borrow ----------
     Thumbnails are tiny flat pixel pictures ([x, y, w, h, color] on a 32x20 grid). An idea fills the hero's chat box. */
  (function starters() {
    const box = $('[data-starters]'); if (!box) return;
    const panel = $('#sw-panel', box), tabs = $$('.sw__tab', box), cta = $('[data-sw-cta]', box);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const E = '#F26B1D', A = '#FABD2F', R = '#B4512A', T = '#8EC07C', P = '#83A598', I = '#6C7CFF', W = '#E4E4E4', D = '#45403D', S = '#3C3836', K = '#1D2021';
    const KINDS = {
      games: {
        cards: [
          { n: 'Pixel platformer', tech: 'KAPLAY', get: 'A hero who runs and jumps, two levels, coins and a title screen.', w: ['Preview', 'Task Board', 'Whiteboard'],
            px: [[0, 15, 32, 5, D], [4, 11, 8, 2, R], [18, 8, 9, 2, R], [7, 12, 3, 3, P], [7, 10, 3, 2, '#E8B48A'], [21, 5, 2, 2, A], [25, 5, 2, 2, A], [28, 2, 2, 2, W]] },
          { n: 'Endless runner', tech: 'LittleJS', get: 'Auto-run, jump to dodge, a score that climbs and a restart button.', w: ['Preview', 'Task Board', 'Website'],
            px: [[0, 16, 32, 4, D], [0, 15, 32, 1, S], [5, 11, 3, 4, E], [5, 9, 3, 2, '#E8B48A'], [16, 12, 2, 4, T], [15, 13, 1, 2, T], [27, 11, 2, 5, T], [1, 11, 3, 1, S], [0, 13, 4, 1, S], [22, 3, 7, 1, W]] },
          { n: '3D walkaround', tech: 'three.js', get: 'A small 3D room you can walk around, with a camera and simple lights.', w: ['Preview', 'Whiteboard', 'Task Board'],
            px: [[0, 14, 32, 6, S], [4, 16, 24, 1, D], [8, 18, 16, 1, D], [12, 6, 8, 2, W], [12, 8, 8, 6, E], [20, 7, 3, 7, R], [20, 6, 1, 1, W], [5, 3, 2, 2, A]] },
          { n: 'Party quiz', tech: 'plain JS', get: 'Questions on a big screen, friends answer from their phones, a scoreboard.', w: ['Preview', 'Website', 'Calendar'],
            px: [[3, 2, 26, 7, S], [14, 3, 4, 1, A], [17, 4, 1, 2, A], [15, 6, 2, 1, A], [15, 8, 2, 1, A], [3, 11, 12, 3, E], [17, 11, 12, 3, I], [3, 15, 12, 3, T], [17, 15, 12, 3, A]] },
        ],
        ideas: ['make a cozy pixel game where you water plants with friends', 'a two-player racing game we can play on one keyboard', 'turn our inside jokes into a party quiz'],
      },
      apps: {
        cards: [
          { n: 'Habit tracker', tech: 'web app', get: 'Daily check-ins, streaks, and a shared view so friends cheer each other on.', w: ['Preview', 'Calendar', 'Task Board'],
            px: [[3, 3, 3, 3, T], [8, 3, 3, 3, T], [13, 3, 3, 3, S], [18, 3, 3, 3, T], [23, 3, 3, 3, T], [3, 8, 3, 3, T], [8, 8, 3, 3, S], [13, 8, 3, 3, T], [18, 8, 3, 3, T], [23, 8, 3, 3, E], [3, 14, 23, 2, S], [3, 14, 15, 2, A]] },
          { n: 'Shared list', tech: 'web app', get: 'One list everyone edits live: groceries, packing, ideas. Works on phones.', w: ['Preview', 'Docs', 'Task Board'],
            px: [[4, 3, 3, 3, T], [9, 4, 16, 1, W], [4, 8, 3, 3, T], [9, 9, 12, 1, W], [4, 13, 3, 3, D], [9, 14, 18, 1, D], [27, 2, 3, 3, E]] },
          { n: 'Club sign-ups', tech: 'web app', get: 'An event page, a sign-up form, a list of who’s coming and reminders.', w: ['Preview', 'Calendar', 'Website'],
            px: [[3, 2, 26, 4, E], [3, 8, 18, 3, S], [3, 13, 18, 3, S], [23, 8, 6, 8, D], [5, 17, 3, 3, I], [9, 17, 3, 3, A], [13, 17, 3, 3, T], [24, 9, 4, 2, W]] },
        ],
        ideas: ['an app where our band votes on the next setlist', 'a chore wheel for our flat that spins every Sunday'],
      },
      sites: {
        cards: [
          { n: 'Portfolio', tech: 'static site', get: 'A home page, a grid of your work and an about page. Easy to restyle.', w: ['Preview', 'Website', 'Docs'],
            px: [[0, 0, 32, 3, S], [2, 1, 5, 1, E], [3, 6, 8, 5, I], [12, 6, 8, 5, A], [21, 6, 8, 5, T], [3, 13, 8, 5, R], [12, 13, 8, 5, P], [21, 13, 8, 5, E]] },
          { n: 'Launch page', tech: 'static site', get: 'A big headline, a screenshot, a sign-up box and a short FAQ.', w: ['Preview', 'Website', 'Calendar'],
            px: [[6, 3, 20, 2, W], [9, 6, 14, 1, D], [11, 9, 10, 3, E], [4, 14, 24, 6, S], [6, 15, 20, 5, D]] },
          { n: 'Devlog', tech: 'static site', get: 'Posts written in Markdown, newest first, with screenshots and an RSS feed.', w: ['Website', 'Docs', 'Calendar'],
            px: [[3, 2, 4, 4, E], [9, 2, 18, 1, W], [9, 4, 14, 1, D], [3, 8, 4, 4, A], [9, 8, 16, 1, W], [9, 10, 12, 1, D], [3, 14, 4, 4, T], [9, 14, 18, 1, W], [9, 16, 10, 1, D]] },
        ],
        ideas: ['a devlog for our game with a page per week', 'a one-page site for my friend’s bakery'],
      },
      tools: {
        cards: [
          { n: 'Discord bot', tech: 'Node', get: 'Slash commands, a welcome message and a place to add your own.', w: ['Task Board', 'Docs', 'Preview'],
            px: [[3, 3, 5, 5, I], [4, 5, 1, 1, W], [6, 5, 1, 1, W], [10, 3, 16, 4, S], [11, 4, 10, 1, W], [6, 11, 20, 4, D], [7, 12, 12, 1, W], [27, 11, 3, 3, E]] },
          { n: 'Small API', tech: 'Node', get: 'A few JSON endpoints, a tiny database file and tests that run.', w: ['Task Board', 'Docs', 'Calendar'],
            px: [[3, 4, 2, 12, E], [5, 4, 2, 1, E], [5, 15, 2, 1, E], [27, 4, 2, 12, E], [25, 4, 2, 1, E], [25, 15, 2, 1, E], [9, 6, 8, 1, T], [9, 9, 12, 1, W], [9, 12, 6, 1, A]] },
          { n: 'CLI helper', tech: 'Node', get: 'A command with flags and help text that does one useful job well.', w: ['Task Board', 'Docs', 'Preview'],
            px: [[0, 0, 32, 20, K], [0, 0, 32, 3, S], [2, 1, 1, 1, '#FF5F57'], [4, 1, 1, 1, '#FEBC2E'], [6, 1, 1, 1, '#28C840'], [3, 6, 2, 1, T], [7, 6, 12, 1, W], [3, 9, 16, 1, D], [3, 12, 2, 1, T], [7, 12, 2, 3, E]] },
        ],
        ideas: ['a bot that posts our game’s daily build in Discord', 'a script that renames my screenshots by date'],
      },
    };
    // one of each kind: a game, an app, a site and a tool
    KINDS.mix = { cards: [['games', '🎮 Game'], ['apps', '📱 App'], ['sites', '🌐 Site'], ['tools', '🛠️ Tool']].map(([k, tag]) => ({ ...KINDS[k].cards[0], tag })),
      ideas: [KINDS.games.ideas[0], KINDS.apps.ideas[1], KINDS.sites.ideas[1], KINDS.tools.ideas[0]] };
    const thumb = px => `<svg class="sw-thumb" viewBox="0 0 32 20" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><rect width="32" height="20" fill="#282828"/>${px.map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`).join('')}</svg>`;
    let kind = 'mix', pick = 0;
    function render() {
      const k = KINDS[kind];
      panel.innerHTML = `<div class="sw-cards">${k.cards.map((c, i) => `<button type="button" class="sw-card${i === pick ? ' is-on' : ''}" data-pick="${i}" aria-pressed="${i === pick}">
          ${thumb(c.px)}${c.tag ? `<span class="sw-card__kind">${esc(c.tag)}</span>` : ''}<span class="sw-card__t"><b>${esc(c.n)}</b><span class="mono">${esc(c.tech)}</span></span>
          <span class="sw-card__get"><small>What you get</small>${esc(c.get)}</span>
          <span class="sw-chips">${c.w.map(w => `<span class="sw-chip">${esc(w)}</span>`).join('')}</span></button>`).join('')}</div>
        <div class="sw-ideas"><p class="eyebrow mono">Inspiration</p>${k.ideas.map(t => `<button type="button" class="sw-idea" data-idea="${esc(t)}">“${esc(t)}”</button>`).join('')}</div>`;
      if (cta) cta.setAttribute('aria-label', 'Start with this: ' + k.cards[pick].n + ' (opens the app)');
    }
    function select(t, focus) {
      tabs.forEach(b => { const on = b === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      kind = t.dataset.kind; pick = 0; panel.setAttribute('aria-labelledby', t.id); render();
      if (focus) t.focus();
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
        e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true);
      });
    });
    panel.addEventListener('click', e => {
      const c = e.target.closest('[data-pick]');
      if (c) { pick = +c.dataset.pick; $$('.sw-card', panel).forEach((x, i) => { x.classList.toggle('is-on', i === pick); x.setAttribute('aria-pressed', String(i === pick)); }); if (cta) cta.setAttribute('aria-label', 'Start with this: ' + KINDS[kind].cards[pick].n + ' (opens the app)'); return; }
      const idea = e.target.closest('[data-idea]');
      if (idea) {
        const inp = $('[data-try="chat"] .mk-in'), st = $('#stage'); if (!inp) return;
        inp.value = idea.dataset.idea;
        if (st) st.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        inp.focus({ preventScroll: true });
      }
    });
    render();
  })();

  /* the phone mock answers too: type from the "phone" and an agent replies */
  (function tryPhone() {
    const root = $('[data-loop="phone"]'), form = root && $('[data-try="phone"]', root); if (!form) return;
    const body = $('.ph2__body', root);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pause = () => { root.dataset.paused = '1'; };
    $('.mk-in', form).addEventListener('focus', pause);
    form.addEventListener('submit', e => {
      e.preventDefault(); const inp = $('.mk-in', form), t = inp.value.trim(); if (!t) return; inp.value = ''; pause();
      const me = document.createElement('div'); me.className = 'mk-msg on';
      me.innerHTML = `<i class="mk-av" style="--c:#F26B1D;--ink:#FFFFFF">Y</i><div><p class="mk-who" style="--n:#F2A27A">You</p><p>${esc(t)}</p></div>`;
      body.appendChild(me); body.scrollTop = body.scrollHeight;
      setTimeout(() => {
        const a = document.createElement('div'); a.className = 'mk-msg mk-msg--agent on';
        const msg = /sound|music/i.test(t) ? 'On it. I’ll keep it quiet and short. 🎵' : /approve|yes|ok/i.test(t) ? 'Thanks! Shipping it now. 🚀' : 'Got it. I’ll start on that and ping you when it’s ready. ✅';
        a.innerHTML = `<i class="mk-av mk-av--agent mk-av--claude"><span>✦</span></i><div><p class="mk-who">Orion's Claude <em>Claude Code</em></p><p>${msg}</p></div>`;
        body.appendChild(a); body.scrollTop = body.scrollHeight;
      }, 900);
    });
  })();

  /* ---------- lanes: plain words by default; "Show files" reveals the paths for developers ---------- */
  const filesBtn = $('.lanes__files'), lanesBody = $('#lanes-body');
  if (filesBtn && lanesBody) filesBtn.addEventListener('click', () => {
    const on = !lanesBody.classList.contains('show-files');
    lanesBody.classList.toggle('show-files', on); filesBtn.setAttribute('aria-pressed', String(on)); filesBtn.textContent = on ? 'Hide files' : 'Show files';
  });

  /* ---------- Flint, floating bottom-right on every page: a small local guide ----------
     Never opens by itself. A one-time "Click me to learn more" bubble after ~3 s. Answers come from the page (keyword
     matching, no network). Esc closes, focus stays inside while open, answers are announced. Hides while the hero's chat
     box has focus. */
  (function floatingFlint() {
    if (document.querySelector('.flint-fab')) return;
    const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const onHome = !!$('#download');
    const ACT = {
      app: ['Open the app', 'app/'],
      demo: ['Watch the demo tribe', 'app/?demo=showcase'],
      download: ['Download', onHome ? '#download' : 'index.html#download'],
      pricing: ['Pricing', 'pricing.html'],
      mission: ['Mission', 'mission.html'],
      docs: ['Docs', 'docs.html'],
    };
    const QA = [
      { k: 'free', re: /free|price|pric|cost|pay|money|subscription|plan/, a: 'Yes, it’s free and open source (MIT). You bring your own AI. Paid plans for extras are planned, but prices aren’t final and nothing is for sale yet.', act: 'pricing' },
      { k: 'ai', re: /\bai\b|which|model|claude|codex|gemini|cursor|llm|agent|ollama|gpt/, a: 'Most coding agents work: Claude Code, Codex, Gemini CLI, Cursor and more. Each friend connects their own, so nobody pays for anyone else.', act: 'docs' },
      { k: 'join', re: /join|friend|invite|link|share|phone|mobile/, a: 'The host sends a link. A friend taps it, types a name and they’re in, from a phone or a laptop. On a phone they can add it to the Home Screen. No app store.', act: 'app' },
      { k: 'demo', re: /demo|show|see|try|example|look/, a: 'The demo tribe plays by itself in your browser with made-up friends and agents. Nothing is sent anywhere.', act: 'demo' },
      { k: 'download', re: /download|install|windows|mac|linux|desktop|setup/, a: 'The desktop app runs on Windows, Apple Silicon Macs and Linux. It hosts your tribe and updates itself.', act: 'download' },
      { k: 'host', re: /host|server|24\/7|always on|tailscale|network|offline/, a: 'One computer in the group hosts the tribe, like a spare PC or a small server. Friends connect to it with a link. Chat, docs and code stay as plain files there.', act: 'docs' },
      { k: 'mission', re: /mission|why|who made|open source|license/, a: 'TribeCode is built in the open so friends can make things together without a big platform in the middle. The Mission page says more.', act: 'mission' },
      { k: 'what', re: /what\s+is|what's|whats|tribecode|about|explain|how does it work/, a: 'TribeCode is a free, open-source app where friends and their AI agents build one app together, in one room. One friend’s computer hosts it. Everyone else joins with a link.', act: 'demo' },
      { k: 'hi', re: /^(hi|hey|hello|yo|hiya|sup)\b/, a: 'Hi! Ask me anything about TribeCode, or pick a question below.' },
      { k: 'thanks', re: /thank|thx|cheers/, a: 'Happy to help. Have fun building.' },
    ];
    const CHIPS = [['What is TribeCode?', 'what'], ['Is it free?', 'free'], ['Which AI works?', 'ai'], ['How do friends join?', 'join'], ['Show me a demo', 'demo'], ['Download', 'download']];

    const wrap = document.createElement('div'); wrap.className = 'flint-float';
    wrap.innerHTML = `
      <div class="flint-bubble" id="flint-bubble" hidden><span>Click me to learn more</span><button type="button" class="flint-bubble__x" aria-label="Dismiss">×</button></div>
      <div class="flint-panel" id="flint-panel" role="dialog" aria-modal="true" aria-labelledby="flint-title" hidden>
        <div class="flint-panel__head"><img src="assets/brand/flint.svg" alt="" width="28" height="36"><div><b id="flint-title">Flint</b><span>a quick guide to TribeCode</span></div><button type="button" class="flint-panel__x" aria-label="Close">×</button></div>
        <div class="flint-panel__log" aria-live="polite" aria-relevant="additions">
          <div class="flint-msg">Hi, I’m Flint. I can tell you what TribeCode is and how to get started. Pick a question or ask your own.</div>
        </div>
        <div class="flint-chips">${CHIPS.map(([t, k]) => `<button type="button" class="flint-chip" data-q="${k}">${t}</button>`).join('')}</div>
        <form class="flint-form"><input type="text" maxlength="200" placeholder="Ask anything…" aria-label="Ask Flint a question" autocomplete="off"><button type="submit" aria-label="Send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>
      </div>
      <button type="button" class="flint-fab" aria-label="Ask Flint, the TribeCode guide" aria-expanded="false" aria-controls="flint-panel"><img src="assets/brand/flint.svg" alt="" width="40" height="52"><i class="flint-em flint-em--1"></i><i class="flint-em flint-em--2"></i></button>`;
    document.body.appendChild(wrap);
    const fab = $('.flint-fab', wrap), panel = $('#flint-panel', wrap), bubble = $('#flint-bubble', wrap), log = $('.flint-panel__log', wrap);
    const form = $('.flint-form', wrap), input = $('input', form);

    const SEEN = 'tc.flint.bubble';
    let bubbleTimer = null;
    const hideBubble = () => { bubble.hidden = true; clearTimeout(bubbleTimer); ls.set(SEEN, '1'); };
    if (ls.get(SEEN) !== '1') setTimeout(() => {
      if (!panel.hidden || wrap.classList.contains('is-away')) return;
      bubble.hidden = false; ls.set(SEEN, '1');            // one time only: it never comes back after this visit
      bubbleTimer = setTimeout(() => { bubble.hidden = true; }, matchMedia('(max-width: 640px)').matches ? 7000 : 12000);
    }, 3000);
    $('.flint-bubble__x', bubble).addEventListener('click', e => { e.stopPropagation(); hideBubble(); });
    bubble.addEventListener('click', () => { hideBubble(); open(); });

    function say(html, who) {
      const m = document.createElement('div'); m.className = 'flint-msg' + (who === 'me' ? ' flint-msg--me' : '');
      m.innerHTML = html; log.appendChild(m); log.scrollTop = log.scrollHeight;
    }
    function answer(q, label) {
      say(esc(label), 'me');
      const hit = typeof q === 'string' && QA.find(x => x.k === q) || QA.find(x => x.re.test(String(label).toLowerCase().trim()));
      setTimeout(() => {
        if (hit) {
          const a = hit.act && ACT[hit.act];
          say(`<p>${esc(hit.a)}</p>${a ? `<a class="flint-act" href="${a[1]}">${esc(a[0])}</a>` : ''}`);
        } else {
          say(`<p>I’m a simple guide on this page — the full Flint lives in the app. These might help:</p><span class="flint-links"><a class="flint-act" href="${ACT.app[1]}">Open the app</a><a class="flint-act flint-act--ghost" href="${ACT.docs[1]}">Docs</a></span>`);
        }
      }, 260);
    }
    $$('.flint-chip', wrap).forEach(c => c.addEventListener('click', () => answer(c.dataset.q, c.textContent)));
    form.addEventListener('submit', e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; answer(null, t); });

    function open() {
      hideBubble(); panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); wrap.classList.add('is-open');
      const first = $('.flint-chip', panel); (first || input).focus();
    }
    function close() { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); wrap.classList.remove('is-open'); fab.focus(); }
    fab.addEventListener('click', () => (panel.hidden ? open() : close()));
    $('.flint-panel__x', panel).addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = $$('button, a[href], input', panel).filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    // step aside while someone types in the hero mock
    document.addEventListener('focusin', e => { if (e.target.closest && e.target.closest('.stage .mk-in')) { wrap.classList.add('is-away'); bubble.hidden = true; } });
    document.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('.stage .mk-in')) wrap.classList.remove('is-away'); });
  })();
})();

/* ---------- phones can't install the desktop app: "Open the app" leads, the desktop download follows ---------- */
(function () {
  if (document.documentElement.dataset.os === 'phone') document.documentElement.classList.add('is-phone');
})();

/* ---------- the hero's typing line: things people ask their tribe, typed out one after another ---------- */
(function () {
  const el = document.querySelector('[data-typer]'); if (!el) return;
  const ASKS = [
    'make a website for my game and invite my friends',
    'connect my AI and fix the jump physics',
    'plan the boss fight with Maya’s Codex',
    'add a title screen, then ship v0.2',
    'turn tonight’s huddle into notes and tasks',
    'split the levels so nobody steps on each other',
    'keep our tribe up 24/7 on the spare PC',
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
