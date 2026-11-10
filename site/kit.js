/* "Everything in one place" (v0.27): tabs for Docs, Flint, Widgets, Studios and Games & apps. Each panel's mock plays its
   beats ([data-k] 1..n) one after another, then the next tab opens. Plays only while on screen; a click on a tab stops the
   auto-advance. Reduced motion: every beat shown, no auto-advance. Arrow keys move between tabs. */
(function () {
  'use strict';
  const box = document.querySelector('[data-kit]'); if (!box) return;
  const tabs = [...box.querySelectorAll('.kit__tab')], panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = 0, auto = !still, visible = false, timer = 0, beat = 0;
  function show(i, focus) {
    cur = (i + tabs.length) % tabs.length;
    tabs.forEach((t, j) => { const on = j === cur; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; panels[j].hidden = !on; });
    const bar = tabs[cur].parentElement, t = tabs[cur]; if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: t.offsetLeft - (bar.clientWidth - t.offsetWidth) / 2, behavior: still ? 'auto' : 'smooth' });
    if (focus) tabs[cur].focus();
    play();
  }
  function play() {
    clearTimeout(timer); const mock = panels[cur].querySelector('.kit__mock'); if (!mock) return;
    const steps = [...mock.querySelectorAll('[data-k]')], max = Math.max(0, ...steps.map(s => +s.dataset.k));
    if (still) { steps.forEach(s => s.classList.add('is-on')); return; }
    mock.classList.add('is-play'); steps.forEach(s => s.classList.remove('is-on')); beat = 0;
    const tick = () => {
      if (!visible) { timer = setTimeout(tick, 400); return; }
      beat++; steps.forEach(s => { if (+s.dataset.k <= beat) s.classList.add('is-on'); });
      if (beat < max) timer = setTimeout(tick, 900);
      else if (auto) timer = setTimeout(() => show(cur + 1), 3200);
    };
    timer = setTimeout(tick, 350);
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { auto = false; show(i); });
    t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); auto = false; show(cur + (e.key === 'ArrowRight' ? 1 : -1), true); } });
  });
  box.addEventListener('click', e => { if (e.target.closest('.kg__cats, .kg__view')) auto = false; });   // exploring the asset library stops the auto-advance
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); }, { threshold: .25 }).observe(box);
  else visible = true;
  show(0);
})();

// Remix gallery: "Show all" opens the rest of the cards.
(function () { const b = document.querySelector('[data-rx-all]'); if (!b) return; const n = document.querySelectorAll('.rx__card').length; b.textContent = 'Show all ' + n;
  b.addEventListener('click', () => { const rx = b.closest('.rx'); rx.classList.add('is-all'); b.setAttribute('aria-expanded', 'true'); const c = rx.querySelectorAll('.rx__card')[6]; if (c) { const a = c.querySelector('a'); if (a) a.focus({ preventScroll: true }); } }); })();

// Games & apps: the asset library's categories are real tabs, each showing assets from TribeCode's own library
// (templates/assets.json): sounds and sprites made by server/assetkit.js, the Khronos glTF sample models rendered as
// turntables (rigged ones walk), OFL fonts. Pictures load only when their tab opens. Credits: assets/kit/CREDITS.md.
(function () {
  'use strict';
  const root = document.querySelector('[data-kg]'); if (!root) return;
  const view = root.querySelector('#kg-view'), cats = [...root.querySelectorAll('.kg__cat')];
  const narrow = () => window.matchMedia && matchMedia('(max-width: 900px)').matches;
  const A = 'assets/kit/';
  const SOUNDS = [
    ['jump', .23, '100,100,100,100,100,100,100,92,83,75,68,60,53,47,41,35,30,25,21,17,13,10,8,6,6,6,6,6'],
    ['coin', .26, '100,100,100,100,100,94,86,79,71,65,58,52,46,40,35,30,26,22,18,15,12,9,7,6,6,6,6,6'],
    ['powerup', .42, '100,100,100,100,100,100,100,100,100,90,81,72,64,56,49,42,36,30,25,20,16,12,9,6,6,6,6,6'],
    ['laser', .19, '100,100,100,100,99,93,84,78,72,64,57,50,45,40,34,30,25,21,18,14,11,8,6,6,6,6,6,6'],
    ['hit', .16, '100,95,95,80,100,57,67,67,51,51,43,41,40,30,26,25,13,18,16,13,9,7,6,6,6,6,6,6'],
    ['explosion', .73, '95,100,78,87,81,80,70,60,55,52,47,45,26,25,15,13,18,17,15,12,10,8,6,6,6,6,6,6'],
  ];
  const MODELS = [['Lantern', 'Microsoft', 'CC0'], ['Avocado', 'Microsoft', 'CC0'], ['BoomBox', 'Microsoft', 'CC0'], ['WaterBottle', 'Microsoft', 'CC0']];
  const RIGGED = [['Fox', 'PixelMannen, tomkranis', 'CC0 + CC-BY', 'walk'], ['RiggedFigure', 'Cesium', 'CC-BY 4.0', 'animated'], ['BoxAnimated', 'Cesium', 'CC-BY 4.0', 'animated']];
  const TEX = [['brick', 'Red brick'], ['wood', 'Wood planks'], ['grass', 'Grass'], ['stone', 'Cobblestone']];
  const PIX = ['hero', 'slime', 'coin', 'heart', 'gem', 'key', 'chest', 'lantern'];
  const FONTS = [['Press Start 2P', 'KG Press Start 2P', 12], ['Silkscreen', 'KG Silkscreen', 15], ['VT323', 'KG VT323', 20], ['Space Grotesk', 'KG Space Grotesk', 16], ['JetBrains Mono', 'KG JetBrains Mono', 14], ['Inter', 'Inter, system-ui, sans-serif', 15]];
  const add = '<span class="kg__add">+ Add</span>';
  const DRAW = {
    sound: () => `<div class="kg__rows">${SOUNDS.slice(0, narrow() ? 6 : 5).map(([n, d, pk]) => `<div class="kg__it" data-snd="${n}" style="--d:${d}s">
      <button type="button" class="kg__play" aria-label="Play ${n}.wav">▶</button>
      <span class="kg__wave" aria-hidden="true">${pk.split(',').map(v => `<i style="height:${v}%"></i>`).join('')}<span class="kg__head"></span></span>
      <b>${n}.wav</b><small>${d.toFixed(2)} s · <span class="kg__lic">CC0</span><span class="kg__src"> TribeCode sound kit</span></small>${n === 'coin' ? '<span class="kg__add on">Added ✓</span>' : add}</div>`).join('')}</div>`,
    model: () => `<div class="kg__grid">${MODELS.map(([n, by, l]) => `<div class="kg__card"><div class="kg__spin" role="img" aria-label="${n}, turning" style="background-image:url(${A}m-${n.toLowerCase()}.webp)"></div><b>${n}</b><small>glTF · ${by}</small><span class="kg__foot"><span class="kg__lic">${l}</span>${add}</span></div>`).join('')}</div>`,
    rigged: () => `<div class="kg__grid kg__grid--3">${RIGGED.map(([n, by, l, a]) => `<div class="kg__card"><div class="kg__spin" role="img" aria-label="${n}, ${a}" style="background-image:url(${A}m-${n.toLowerCase()}.webp);--t:${n === 'Fox' ? '1.4s' : '2s'}"></div><b>${n}</b><small>${a} · ${by}</small><span class="kg__foot"><span class="kg__lic">${l}</span>${add}</span></div>`).join('')}</div>`,
    texture: () => `<div class="kg__grid">${TEX.map(([f, n]) => `<div class="kg__card"><div class="kg__tex" role="img" aria-label="${n} texture, tiled" style="background-image:url(${A}t-${f}.webp)"></div><b>${n}</b><span class="kg__foot"><small>example · tiles</small>${add}</span></div>`).join('')}</div>
      <p class="kg__note">Examples. In the app, search brings in free CC0 textures from Poly Haven.</p>`,
    pixel: () => `<div class="kg__grid">${PIX.slice(0, narrow() ? 6 : 8).map(n => `<div class="kg__card"><div class="kg__px"><img src="${A}${n}.svg" alt="${n} sprite" width="48" height="48"></div><span class="kg__foot"><b>${n}</b><span class="kg__lic">CC0</span></span></div>`).join('')}</div>`,
    font: () => `<div class="kg__rows">${FONTS.slice(0, narrow() ? 5 : 4).map(([n, fam, sz]) => `<div class="kg__font"><span class="kg__aa" style="font-family:${fam.includes(',') ? fam : `'${fam}'`}">Aa</span><b style="font-family:${fam.includes(',') ? fam : `'${fam}'`};font-size:${sz}px">The tribe builds tonight</b><small>${n} · <span class="kg__lic">OFL-1.1</span></small>${add}</div>`).join('')}</div>`,
  };
  let cur = null, audio = null;
  function show(cat, focus) {
    if (audio) { audio.pause(); audio = null; }
    cur = cat; cats.forEach(c => { const on = c.dataset.cat === cat; c.setAttribute('aria-selected', on); c.tabIndex = on ? 0 : -1; if (on && focus) c.focus(); });
    view.setAttribute('aria-label', (cats.find(c => c.dataset.cat === cat) || {}).textContent || '');
    view.innerHTML = DRAW[cat]();
  }
  cats.forEach((c, i) => {
    c.addEventListener('click', () => show(c.dataset.cat));
    c.addEventListener('keydown', e => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); e.stopPropagation(); show(cats[(i + (e.key === 'ArrowRight' ? 1 : cats.length - 1)) % cats.length].dataset.cat, true); });
  });
  view.addEventListener('click', e => {
    const b = e.target.closest('.kg__play'); if (b) {
      const row = b.closest('.kg__it'), name = row.dataset.snd;
      view.querySelectorAll('.kg__it').forEach(r => { r.classList.remove('is-playing'); r.querySelector('.kg__play').classList.remove('is-on'); r.querySelector('.kg__play').textContent = '▶'; });
      if (audio) audio.pause();
      audio = new Audio(A + name + '.wav'); audio.play().catch(() => {});
      void row.offsetWidth; row.classList.add('is-playing'); b.classList.add('is-on');
      audio.addEventListener('ended', () => { row.classList.remove('is-playing'); b.classList.remove('is-on'); });
      return;
    }
    const a = e.target.closest('.kg__add'); if (a && !a.classList.contains('on')) { a.classList.add('on'); a.textContent = 'Added ✓'; }
  });
  show('sound');
  let wasNarrow = narrow(); window.addEventListener('resize', () => { if (narrow() !== wasNarrow) { wasNarrow = narrow(); show(cur); } });
})();
