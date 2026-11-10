/* Shows the "paste real reviews" note only while there are no reviews in site.json › reviews. */
(function () {
  function set(d) { var n = document.querySelector('.rv-empty'); if (n) n.hidden = !!(d && d.reviews && d.reviews.length); }
  set(window.SiteData && SiteData.get());
  document.addEventListener('site:data', function (e) { set(e.detail); });
})();
