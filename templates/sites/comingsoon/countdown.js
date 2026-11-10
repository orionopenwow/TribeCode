/* Days until site.json › launch (YYYY-MM-DD), and a note if the waitlist form isn't connected yet. */
(function () {
  var cd = document.querySelector('.cd');
  function tick() {
    var d = window.SiteData && SiteData.get(); if (!cd || !d || !d.launch) return;
    var ms = Date.parse(d.launch + 'T00:00:00') - Date.now();
    if (isNaN(ms)) { cd.textContent = ''; return; }
    var days = Math.ceil(ms / 86400000);
    cd.textContent = days > 1 ? days + ' days to go' : days === 1 ? 'Tomorrow' : 'We\'re open';
  }
  tick(); setInterval(tick, 60000); document.addEventListener('site:data', tick);
  var f = document.querySelector('.wl');
  if (f) f.addEventListener('submit', function (e) { var d = window.SiteData && SiteData.get(); if (!(d && d.waitlist && d.waitlist.url)) { e.preventDefault(); document.querySelector('.wl-off').hidden = false; } });
})();
