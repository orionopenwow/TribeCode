/* A small lightbox for the gallery: click a photo to see it large; arrow keys move, Esc closes. */
(function () {
  var lb = document.querySelector('.lb'); if (!lb) return;
  var img = lb.querySelector('.lb-img'), cap = lb.querySelector('.lb-cap'), i = 0;
  function photos() { var d = window.SiteData && SiteData.get(); return (d && d.photos) || []; }
  function show(n) { var p = photos(); if (!p.length) return; i = (n + p.length) % p.length; img.src = p[i].img; img.alt = p[i].title || ''; cap.textContent = [p[i].title, p[i].place].filter(Boolean).join(' · '); }
  document.addEventListener('click', function (e) { var b = e.target.closest('.open'); if (!b) return; show(Number(b.getAttribute('data-n')) - 1); if (lb.showModal) lb.showModal(); });
  lb.querySelector('.prev').addEventListener('click', function () { show(i - 1); });
  lb.querySelector('.next').addEventListener('click', function () { show(i + 1); });
  lb.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
})();
