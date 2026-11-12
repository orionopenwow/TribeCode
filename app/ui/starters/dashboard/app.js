// Dashboard: an original TribeCode starter (MIT). KPI tiles, a line chart, bars and a table drawn with plain SVG and
// DOM from mock data (data() below). Swap data() for fetch('/your/api') when you have a real source.
var C = window.CONFIG || {};
document.getElementById('title').textContent = C.title || 'Dashboard';
function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function data(days) {   // mock numbers, the same every load
  var r = rng(C.seed || 42), visits = [], v = C.baseVisits || 400;
  for (var i = 0; i < days; i++) { v = Math.max(50, v + (r() - 0.45) * 80); visits.push(Math.round(v)); }
  return { visits: visits, pages: [['/home', 48], ['/pricing', 27], ['/blog', 14], ['/about', 7], ['/contact', 4]], signups: ['Maya', 'Jay', 'Orion', 'Ada', 'Sam'].map(function (n, i) { return [n, (i + 1) * 3 + 'h ago']; }) };
}
function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
function draw() {
  var days = +document.getElementById('range').value, d = data(days), half = d.visits.slice(-Math.floor(days / 2)), prev = d.visits.slice(0, Math.floor(days / 2));
  var pct = Math.round((sum(half) / Math.max(1, sum(prev)) - 1) * 100);
  document.getElementById('sub').textContent = 'Mock data · ' + days + ' days';
  var k = [['Visits', sum(d.visits).toLocaleString(), pct], ['Signups', Math.round(sum(d.visits) * 0.031).toLocaleString(), pct - 3], ['Conversion', '3.1%', 1], ['Avg. session', '2m 14s', -2]];
  document.getElementById('kpis').innerHTML = k.map(function (x) { return '<div class="card kpi"><small>' + x[0] + '</small><b>' + x[1] + '</b><small class="' + (x[2] >= 0 ? 'up' : 'down') + '">' + (x[2] >= 0 ? '▲ ' : '▼ ') + Math.abs(x[2]) + '%</small></div>'; }).join('');
  var max = Math.max.apply(null, d.visits), W = 640, H = 200, step = W / (d.visits.length - 1);
  var pts = d.visits.map(function (v, i) { return (i * step).toFixed(1) + ',' + (H - v / max * (H - 20) + 10).toFixed(1); }).join(' ');
  var line = getComputedStyle(document.documentElement).getPropertyValue('--line') || '#2A313C';
  document.getElementById('chart').innerHTML = [0.25, 0.5, 0.75].map(function (f) { return '<line x1="0" x2="640" y1="' + H * f + '" y2="' + H * f + '" stroke="' + line + '"/>'; }).join('') + '<polyline fill="none" stroke="var(--accent, #F26B1D)" stroke-width="2.5" points="' + pts + '"/>';
  document.getElementById('bars').innerHTML = d.pages.map(function (p) { return '<div class="bar"><span>' + p[0] + '</span><i style="width:' + p[1] * 2 + '%"></i><span>' + p[1] + '%</span></div>'; }).join('');
  document.getElementById('table').innerHTML = d.signups.map(function (s) { return '<tr><td>' + s[0] + '</td><td>' + s[1] + '</td></tr>'; }).join('');
}
document.getElementById('range').onchange = draw;
draw();
