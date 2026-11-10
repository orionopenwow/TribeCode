/* RSVP form: posts to the form service in site.json › rsvp › url (Formspree, Tally, a Google Form…).
   Until one is set, sending shows a note instead of going nowhere. */
(function () {
  var f = document.querySelector('.rf'); if (!f) return;
  function url() { var d = window.SiteData && SiteData.get(); return d && d.rsvp && d.rsvp.url; }
  f.addEventListener('submit', function (e) { if (!url()) { e.preventDefault(); f.querySelector('.rf-note').hidden = false; } });
})();
