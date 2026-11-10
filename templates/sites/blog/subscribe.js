/* The subscribe box posts to your newsletter service (site.json › subscribe › url). Until one is set it says so. */
(function () {
  [].forEach.call(document.querySelectorAll('.sf'), function (f) {
    f.addEventListener('submit', function (e) {
      var d = window.SiteData && SiteData.get();
      if (!(d && d.subscribe && d.subscribe.url)) { e.preventDefault(); var n = f.parentNode.querySelector('.sf-note'); if (n) n.hidden = false; }
    });
  });
})();
