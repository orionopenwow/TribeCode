/* Creator demos on the website (create.html and the home page's creator section). No libraries.
   - Clips: <figure class="cr-clip" data-clip="assets/create/reel"> holds a poster picture; when the figure scrolls into
     view, a muted, looping <video> (WebM, then MP4) is added and plays; it pauses when it scrolls out. With reduced
     motion, or when the browser saves data, only the poster shows.
   - Before and after: <div class="cr-ba"> with a range input; the divider follows it (keyboard and touch work too). */
(function () {
  'use strict';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection && navigator.connection.saveData);
  const clips = [...document.querySelectorAll('[data-clip]')];
  function start(fig) {
    if (fig.dataset.on) { const v = fig.querySelector('video'); if (v) v.play().catch(() => {}); return; }
    fig.dataset.on = '1';
    const base = fig.dataset.clip, v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.preload = 'auto';
    v.innerHTML = `<source src="${base}.webm" type="video/webm"><source src="${base}.mp4" type="video/mp4">`;
    v.addEventListener('playing', () => fig.classList.add('is-playing'), { once: true });
    fig.appendChild(v); v.play().catch(() => {});
  }
  function stop(fig) { const v = fig.querySelector('video'); if (v) v.pause(); }
  if (!still && clips.length) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => (e.isIntersecting ? start : stop)(e.target)), { rootMargin: '120px 0px', threshold: 0.15 });
      clips.forEach(c => io.observe(c));
    } else clips.forEach(start);
  }
  document.querySelectorAll('.cr-ba').forEach(box => {
    const r = box.querySelector('input[type=range]'); if (!r) return;
    const set = () => box.style.setProperty('--cut', r.value + '%');
    r.addEventListener('input', set); set();
  });
})();
