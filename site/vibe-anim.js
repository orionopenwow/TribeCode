/* "How vibecoding works" scene (v0.27), built to the hero widget's standard (docs/DESIGN-SYSTEM.md, Illustration and
   motion standard). The markup in index.html (#vf-scene) is the finished frame, so it reads fine with no JS and holds
   still for reduced motion. This script plays it in beats, about 16 s per loop, only while it's on screen:
     Maya says an idea → it flies to the AI → the AI reads the vision and builds the page →
     Jay types a countdown → it flies in → the countdown ticks → Maya asks for more → the page goes live.
   No libraries: DOM classes, a typing helper and one Web Animations call for the flying chip. */
(function () {
  'use strict';
  const root = document.getElementById('vf-scene'); if (!root || !root.classList.contains('vs')) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;   // the static markup is the final frame
  const $ = s => root.querySelector(s), step = k => root.querySelector(`[data-s="${k}"]`);
  const st = $('#vs-st'), chip = $('#vs-chip'), ai = $('.vs-ai');
  const texts = new Map([...root.querySelectorAll('[data-t]')].map(el => [el, el.textContent]));
  let run = 0;   // bumps on every (re)start so a stale loop stops itself

  const wait = (ms, id) => new Promise((ok, no) => setTimeout(() => (id === run ? ok() : no('stop')), ms));
  const on = k => { const el = step(k); if (el) el.classList.add('on'); };
  const status = (t, busy) => { st.textContent = t; st.classList.toggle('is-busy', !!busy); };
  async function type(el, id, cps = 30) {
    const full = texts.get(el) || ''; el.textContent = '';
    for (let i = 1; i <= full.length; i++) { el.textContent = full.slice(0, i); await wait(1000 / cps, id); }
  }
  // the idea flies from where it was said to the AI card, in a little arc
  async function fly(from, label, kind, id) {
    const r = root.getBoundingClientRect(), a = from.getBoundingClientRect(), b = ai.getBoundingClientRect();
    chip.textContent = label; chip.classList.toggle('is-b', kind === 'b');
    const x0 = a.left - r.left + a.width / 2 - 30, y0 = a.top - r.top + 8, x1 = b.left - r.left + b.width / 2 - 30, y1 = b.top - r.top + 10;
    const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 34;
    if (chip.animate) {
      chip.animate([{ transform: `translate(${x0}px,${y0}px) scale(.8)`, opacity: 0 }, { transform: `translate(${x0}px,${y0 - 6}px)`, opacity: 1, offset: .12 },
        { transform: `translate(${mx}px,${my}px)`, opacity: 1, offset: .55 }, { transform: `translate(${x1}px,${y1}px) scale(.9)`, opacity: 0 }], { duration: 900, easing: 'ease-in-out' });
    }
    await wait(900, id);
    ai.classList.add('is-flash'); await wait(260, id); ai.classList.remove('is-flash');
  }
  // the countdown ticks down while the scene plays
  let tick = null, left = 1 * 86400 + 14 * 3600 + 22 * 60 + 8;
  const pad = n => String(n).padStart(2, '0');
  const drawCount = () => { $('#vs-d').textContent = Math.floor(left / 86400); $('#vs-h').textContent = pad(Math.floor(left % 86400 / 3600)); $('#vs-m').textContent = pad(Math.floor(left % 3600 / 60)); $('#vs-s').textContent = pad(left % 60); };
  function reset() {
    root.querySelectorAll('[data-s].on').forEach(el => el.classList.remove('on'));
    texts.forEach((t, el) => { el.textContent = ''; });
    root.classList.remove('vs--talk', 'vs--tap', 'is-typing-b');
    clearInterval(tick); left = 1 * 86400 + 14 * 3600 + 22 * 60 + 8; drawCount();
    status('waiting for an idea');
  }

  async function play(id) {
    reset(); await wait(500, id);
    // 1. Maya says it
    on('a1'); root.classList.add('vs--talk'); await type(step('a1').querySelector('[data-t]'), id); root.classList.remove('vs--talk');
    await wait(250, id); await fly(step('a1'), 'a bake sale page', 'a', id);
    // 2. the AI reads and builds
    status('thinking', true); await wait(700, id);
    on('t1'); status('reading the vision', true); await wait(650, id);
    on('t2'); status('building the page', true); on('nav'); await wait(300, id); on('title'); await wait(350, id); on('i1'); await wait(250, id); on('i2'); await wait(500, id);
    status('waiting for a change');
    // 3. Jay codes a countdown
    on('b1'); root.classList.add('vs--tap', 'is-typing-b'); await type(step('b1'), id, 18); root.classList.remove('vs--tap'); await wait(300, id); root.classList.remove('is-typing-b');
    await fly($('.vs-code'), 'countdown.js', 'b', id);
    status('merging Jay’s change', true); await wait(600, id);
    on('t3'); on('count'); tick = setInterval(() => { left = Math.max(0, left - 1); drawCount(); }, 1000); await wait(900, id);
    status('listening');
    // 4. Maya steers it
    on('a2'); root.classList.add('vs--talk'); await type(step('a2').querySelector('[data-t]'), id); root.classList.remove('vs--talk');
    await wait(250, id); await fly(step('a2'), 'lemon bars + button', 'a', id);
    status('editing', true); await wait(600, id);
    on('t4'); on('i3'); await wait(350, id); on('btn'); await wait(500, id);
    // 5. tests pass, it's live
    status('running tests', true); await wait(700, id);
    on('t5'); on('live'); status('Done. It’s live, send the link.');
    await wait(4200, id);
  }
  async function loop(id) { try { while (id === run) await play(id); } catch (e) { if (e !== 'stop') throw e; } }
  function start() { run++; root.classList.add('vs--run'); loop(run); }
  function stop() { run++; clearInterval(tick); }

  if ('IntersectionObserver' in window) {
    let visible = false;
    new IntersectionObserver(es => {
      const v = es.some(e => e.isIntersecting);
      if (v && !visible) start(); else if (!v && visible) stop();
      visible = v;
    }, { threshold: 0.25 }).observe(root);
  } else start();
})();
