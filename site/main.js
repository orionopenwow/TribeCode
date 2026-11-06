/* TribeCode site: small, dependency-free interactions. */
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- mobile nav ---------- */
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  if (nav && toggle) {
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      toggle.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }

  /* ---------- scroll reveal + progress bars ---------- */
  const fillBars = (root) => root.querySelectorAll('.bar[data-fill]').forEach((b) => {
    b.querySelector('span').style.setProperty('--w', b.dataset.fill + '%');
  });
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-visible');
        fillBars(en.target);
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => { el.classList.add('is-visible'); fillBars(el); });
  }

  /* ---------- matte hover: 1px ember tick follows the pointer ---------- */
  if (fine) {
    document.querySelectorAll('.card').forEach((card) => {
      card.setAttribute('data-hover', '');
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      });
    });
  }

  /* ---------- device tilt (max 3deg, fine pointers only) ---------- */
  const device = document.querySelector('[data-tilt]');
  if (device && fine && !reduce) {
    const MAX = 3;
    let raf = 0;
    device.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = device.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        device.style.setProperty('--ry', (x * MAX * 2).toFixed(2) + 'deg');
        device.style.setProperty('--rx', (-y * MAX * 2).toFixed(2) + 'deg');
      });
    });
    device.addEventListener('pointerleave', () => {
      device.style.setProperty('--rx', '0deg');
      device.style.setProperty('--ry', '0deg');
    });
  }

  /* ---------- copy button ---------- */
  document.querySelectorAll('.js-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const src = document.getElementById(btn.dataset.copyTarget);
      const text = src.textContent.replace(/^\$\s*/, '').replace(/\s*\\\n\s*/g, ' ').trim();
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
        ta.remove();
      }
      const label = btn.querySelector('span');
      const icon = btn.querySelector('use');
      label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      icon.setAttribute('href', ok ? '#i-check' : '#i-copy');
      setTimeout(() => { label.textContent = 'Copy'; icon.setAttribute('href', '#i-copy'); }, 1800);
    });
  });

  /* ---------- hero live demo loop ---------- */
  const demo = document.querySelector('.demo');
  if (demo) {
    const joins = demo.querySelectorAll('.js-join');
    const count = demo.querySelector('.js-online');
    const states = ['s-typing', 's-typed', 's-task', 's-doing'];
    const set = (online, cls) => {
      joins.forEach((j) => j.classList.toggle('is-in', Number(j.dataset.join) < online));
      count.textContent = String(online);
      demo.classList.toggle('s-m', online >= 2);
      states.forEach((s) => demo.classList.toggle(s, cls.includes(s)));
    };
    if (reduce) {
      set(3, ['s-typing', 's-typed', 's-task', 's-doing']);
    } else {
      const timeline = [
        [0, 1, []],
        [900, 2, []],
        [2000, 2, ['s-typing']],
        [3300, 2, ['s-typing', 's-typed']],
        [4700, 2, ['s-typing', 's-typed', 's-task']],
        [6200, 2, ['s-typing', 's-typed', 's-task', 's-doing']],
        [7400, 3, ['s-typing', 's-typed', 's-task', 's-doing']],
      ];
      const LOOP = 11500;
      let timers = [];
      const run = () => {
        timers.forEach(clearTimeout);
        timers = timeline.map(([t, online, cls]) => setTimeout(() => set(online, cls), t));
        timers.push(setTimeout(run, LOOP));
      };
      // pause when off-screen to save work
      let running = false;
      const io = new IntersectionObserver(([en]) => {
        if (en.isIntersecting && !running) { running = true; run(); }
        else if (!en.isIntersecting && running) { running = false; timers.forEach(clearTimeout); }
      });
      io.observe(demo);
    }
  }

  /* ---------- embers: a few flat orange shards drifting up from the hero mark ---------- */
  const canvas = document.querySelector('.hero__embers');
  const mark = document.querySelector('.hero__mark');
  if (canvas && mark && !reduce && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    const COLORS = ['#F26B1D', '#F26B1D', '#FFB86B'];
    let w = 0, h = 0, dpr = 1, ox = 0, oy = 0, parts = [], last = 0, visible = true, raf = 0;
    const N = window.innerWidth < 760 ? 12 : 22;

    const measure = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const m = mark.getBoundingClientRect();
      ox = m.left - r.left + m.width / 2;
      oy = m.top - r.top + m.height * 0.42;
    };
    const spawn = (p, initial) => {
      p.x = ox + (Math.random() - 0.5) * 26;
      p.y = initial ? oy - Math.random() * oy : oy;
      p.vy = 10 + Math.random() * 16;            // px per second, slow
      p.vx = (Math.random() - 0.5) * 6;
      p.sway = Math.random() * Math.PI * 2;
      p.size = 2 + Math.random() * 2.5;
      p.rot = Math.random() * Math.PI;
      p.vr = (Math.random() - 0.5) * 0.8;
      p.tri = Math.random() < 0.4;
      p.color = COLORS[(Math.random() * COLORS.length) | 0];
      p.life = 0;
      p.max = 6 + Math.random() * 6;              // seconds
      if (initial) p.life = Math.random() * p.max * 0.7;
      return p;
    };
    const tick = (t) => {
      raf = requestAnimationFrame(tick);
      if (!visible) { last = t; return; }
      const dt = Math.min((t - last) / 1000 || 0, 0.05); last = t;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.life += dt;
        if (p.life >= p.max || p.y < -10) spawn(p, false);
        p.sway += dt * 0.9;
        p.x += (p.vx + Math.sin(p.sway) * 5) * dt;
        p.y -= p.vy * dt;
        p.rot += p.vr * dt;
        const k = p.life / p.max;
        ctx.globalAlpha = Math.max(0, (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88)) * 0.8;
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.tri) {
          ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size, p.size); ctx.lineTo(-p.size, p.size); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    const start = () => {
      measure();
      parts = Array.from({ length: N }, () => spawn({}, true));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('resize', measure, { passive: true });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
  }
})();
