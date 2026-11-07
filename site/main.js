/* TribeCode showcase: downloads for your OS, live GitHub numbers, and quiet motion.
   No libraries. Everything degrades: without JS every link still points somewhere real. */
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

  /* ---------- nav ---------- */
  const nav = $('.nav');
  const onScroll = () => nav && nav.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const toggle = $('.nav__toggle'), links = $('#nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => { const open = links.classList.toggle('is-open'); toggle.setAttribute('aria-expanded', String(open)); });
    links.addEventListener('click', e => { if (e.target.closest('a')) { links.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); } });
  }

  /* ---------- downloads: your OS first ---------- */
  const ua = navigator.userAgent, plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const os = /iPhone|iPad|iPod|Android/i.test(ua) || (/Mac/.test(plat) && navigator.maxTouchPoints > 1) ? 'phone'
    : /Win/i.test(plat) ? 'windows' : /Mac/i.test(plat) ? 'mac' : /Linux|X11|CrOS/i.test(plat + ua) ? 'linux' : '';
  const NAMES = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
  const PICK = {   // release asset name patterns
    windows: [/_x64-setup\.exe$/i, /\.msi$/i],
    mac: [/aarch64\.dmg$/i, /\.dmg$/i],
    linux: [/\.AppImage$/i],
    deb: [/\.deb$/i, /\.rpm$/i],
  };
  const find = (assets, k) => { for (const re of PICK[k] || []) { const a = assets.find(x => re.test(x.name)); if (a) return a; } return null; };
  function setMain(label, href, meta) {
    $$('[data-dl-main]').forEach(a => { if (href) a.href = href; const l = $('[data-dl-label]', a); if (l) l.textContent = label; });
    if (meta) $$('[data-dl-meta]').forEach(m => { m.textContent = meta; });
  }
  if (os === 'phone') {
    setMain('Desktop app (Windows, Mac, Linux)', null);
  } else if (NAMES[os]) {
    setMain('Download for ' + NAMES[os], null);
    const mine = $(`.dl__menu [data-os="${os}"]`); if (mine) mine.classList.add('is-mine');
  }
  const dl = $('[data-dl]');
  if (dl) {
    const more = $('.dl__more', dl), menu = $('.dl__menu', dl);
    const close = () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); };
    more.addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; more.setAttribute('aria-expanded', String(open)); if (open) { const f = $('a', menu); f && f.focus(); } });
    document.addEventListener('click', e => { if (!dl.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { close(); more.focus(); } });
  }

  /* ---------- live GitHub numbers ---------- */
  const set = (k, v) => $$(`[data-gh="${k}"]`).forEach(el => { el.textContent = v; el.hidden = false; });
  const box = $('[data-gh-box]');
  let failed = 0;
  const fail = () => { if (++failed === 1) { const f = $('[data-gh-fallback]'); if (f) f.hidden = false; if (box) box.classList.add('is-fallback'); } };
  gh('').then(r => {
    set('stars', fmt(r.stargazers_count)); set('forks', fmt(r.forks_count)); set('issues', fmt(r.open_issues_count));
    box && box.classList.add('is-ready');
  }).catch(fail);
  gh('/releases/latest').then(rel => {
    const v = rel.tag_name || rel.name; if (!v) return;
    set('version', v); set('released', 'released ' + ago(rel.published_at));
    set('release-line', `${v} · open source · MIT · works with Claude Code`);
    const assets = rel.assets || [];
    $$('.dl__menu [data-os]').forEach(a => { const x = find(assets, a.dataset.os); if (x) { a.href = x.browser_download_url; const s = $('span', a); if (s) s.textContent = x.name.replace(/^TribeCode_?/, '') + ' · ' + Math.round(x.size / 1e6) + ' MB'; } });
    if (NAMES[os]) { const x = find(assets, os); if (x) setMain('Download for ' + NAMES[os], x.browser_download_url, `${v} · ${Math.round(x.size / 1e6)} MB · ${x.name}`); }
    else setMain($('[data-dl-label]') ? $('[data-dl-label]').textContent : 'Download', null, `${v} from GitHub Releases`);
  }).catch(fail);
  gh('/contributors?per_page=12').then(list => {
    const el = $('[data-gh="contributors"]'); if (!el || !Array.isArray(list)) return;
    el.innerHTML = '';
    list.filter(c => c.type !== 'Bot').slice(0, 12).forEach(c => {
      const a = document.createElement('a'); a.href = c.html_url; a.title = `${c.login} · ${c.contributions} commits`;
      const img = document.createElement('img'); img.src = c.avatar_url + '&s=72'; img.alt = c.login; img.width = 36; img.height = 36; img.loading = 'lazy';
      a.appendChild(img); el.appendChild(a);
    });
  }).catch(fail);

  /* ---------- copy buttons ---------- */
  $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const src = $(b.dataset.copy); if (!src) return;
    const label = $('span', b), was = label ? label.textContent : '';
    try { await navigator.clipboard.writeText(src.dataset.full || src.textContent); if (label) label.textContent = 'Copied'; }
    catch { if (label) label.textContent = 'Select and copy'; }
    setTimeout(() => { if (label) label.textContent = was; }, 1600);
  }));

  /* ---------- demo video: pause control, and still for reduced motion ---------- */
  const video = $('.frame__media'), vbtn = $('[data-video-toggle]');
  if (video && vbtn) {
    const sync = () => { const p = video.paused; vbtn.setAttribute('aria-label', p ? 'Play the demo' : 'Pause the demo'); $('use', vbtn).setAttribute('href', p ? '#i-play' : '#i-pause'); };
    vbtn.addEventListener('click', () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
    video.addEventListener('play', sync); video.addEventListener('pause', sync);
    if (reduce) { video.removeAttribute('autoplay'); video.pause(); }
    sync();
  }

  /* ---------- scroll reveal ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('is-in'));

  /* ---------- parallax on screenshot frames (small, fine pointers and wide screens only) ---------- */
  const par = $$('[data-parallax]');
  if (par.length && !reduce && matchMedia('(min-width: 900px)').matches) {
    let raf = 0;
    const tick = () => {
      raf = 0; const vh = innerHeight;
      par.forEach(el => {
        const r = el.getBoundingClientRect(); if (r.bottom < -100 || r.top > vh + 100) return;
        const k = parseFloat(el.dataset.parallax) || 0, off = (r.top + r.height / 2 - vh / 2) * -k;
        el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
      });
    };
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
    addEventListener('resize', tick); tick();
  }

  /* ---------- the typed claude mcp add line ---------- */
  const line = $('[data-type]'), term = line && line.closest('.term');
  if (line && term) {
    const full = line.textContent; line.dataset.full = full;
    if (reduce || !('IntersectionObserver' in window)) term.classList.add('is-done');
    else {
      line.textContent = '';
      const io = new IntersectionObserver(es => {
        if (!es.some(e => e.isIntersecting)) return; io.disconnect();
        let i = 0;
        const step = () => { i = Math.min(full.length, i + (full[i] === ' ' ? 1 : 2)); line.textContent = full.slice(0, i); if (i < full.length) setTimeout(step, 22 + Math.random() * 30); else setTimeout(() => term.classList.add('is-done'), 250); };
        setTimeout(step, 300);
      }, { threshold: 0.5 });
      io.observe(term);
    }
  }

  /* ---------- campfire embers: flat square pixels rising and fading ---------- */
  const cv = $('.fire__embers');
  if (cv && cv.getContext && !reduce) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, COLORS = ['#F26B1D', '#FFB86B', '#F26B1D', '#F8FAFC'];
    const parts = []; let on = false, last = 0;
    const spawn = () => parts.push({ x: 150 + Math.random() * 30 - 15, y: 104, vx: (Math.random() - .5) * .35, vy: -(.45 + Math.random() * .7), life: 0, max: 90 + Math.random() * 90, s: Math.random() < .3 ? 4 : 3, c: COLORS[(Math.random() * COLORS.length) | 0] });
    const frame = t => {
      if (!on) return;
      if (t - last > 90) { spawn(); last = t; }
      g.clearRect(0, 0, W, H);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life++; p.x += p.vx + Math.sin((p.life + i) / 14) * .25; p.y += p.vy;
        if (p.life > p.max) { parts.splice(i, 1); continue; }
        g.globalAlpha = 1 - p.life / p.max; g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
      g.globalAlpha = 1; requestAnimationFrame(frame);
    };
    new IntersectionObserver(es => { const vis = es.some(e => e.isIntersecting); if (vis && !on) { on = true; requestAnimationFrame(frame); } else if (!vis) on = false; }).observe(cv);
  }
})();
