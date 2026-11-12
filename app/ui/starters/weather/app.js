// Weather: an original TribeCode starter (MIT). A search box, today's conditions and a 5-day forecast, from mock data
// so it works offline. getWeather() is the one function to swap for a real API (see README.md: Open-Meteo needs no key).
var C = window.CONFIG || {};
var ICON = { sun: '☀', cloud: '☁', rain: '☂', storm: '⚡', snow: '❄', part: '⛅' };
function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function getWeather(city) {   // mock: the same city always gets the same weather. Real: return fetch(url).then(r => r.json()) shaped like this
  var h = hash(city.toLowerCase()), kinds = Object.keys(ICON), base = (h % 30) - 2;
  return Promise.resolve({ city: city, temp: base, kind: kinds[h % kinds.length], wind: 5 + h % 25, humidity: 30 + h % 60,
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(function (d, i) { return { d: d, hi: base + ((h >> i) % 7), lo: base - 4 - ((h >> (i + 2)) % 5), kind: kinds[(h >> i) % kinds.length] }; }) });
}
function unit(c) { return C.units === 'F' ? Math.round(c * 9 / 5 + 32) + '°F' : Math.round(c) + '°C'; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function show(city) {
  getWeather(city).then(function (w) {
    document.getElementById('now').innerHTML = '<div><h1>' + esc(w.city) + '</h1><div class="temp">' + unit(w.temp) + '</div></div><div class="ic" aria-label="' + w.kind + '">' + ICON[w.kind] + '</div><dl><div><dt>Wind</dt><dd>' + w.wind + ' km/h</dd></div><div><dt>Humidity</dt><dd>' + w.humidity + '%</dd></div></dl>';
    document.getElementById('days').innerHTML = w.days.map(function (d) { return '<div class="card day"><b>' + d.d + '</b><span class="ic">' + ICON[d.kind] + '</span>' + unit(d.hi) + ' <small>' + unit(d.lo) + '</small></div>'; }).join('');
  });
}
document.getElementById('form').addEventListener('submit', function (e) { e.preventDefault(); var c = document.getElementById('city').value.trim(); if (c) show(c); });
document.getElementById('note').textContent = 'Mock data for now: swap getWeather() in app.js for a real API.';
show(C.city || 'Lisbon');
