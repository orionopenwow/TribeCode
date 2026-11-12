// Pomodoro timer: an original TribeCode starter (MIT). Focus and break rounds with a long break every few, a progress
// ring, the time in the tab title and a soft beep (Web Audio, no sound files). The lengths come from config.js.
var C = window.CONFIG || {};
var LEN = { focus: (C.focusMin || 25) * 60, short: (C.breakMin || 5) * 60, long: (C.longBreakMin || 15) * 60 };
var mode = 'focus', left = LEN.focus, timer = null, done = 0, endAt = 0;
var $ = function (id) { return document.getElementById(id); };
function fmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function paint() {
  $('time').textContent = fmt(left); $('mode').textContent = mode === 'focus' ? 'Focus' : mode === 'short' ? 'Short break' : 'Long break';
  document.body.classList.toggle('rest', mode !== 'focus');
  $('prog').style.strokeDashoffset = String(339.3 * (left / LEN[mode]));
  $('go').textContent = timer ? 'Pause' : 'Start';
  $('count').textContent = done + ' focus round' + (done === 1 ? '' : 's') + ' today';
  document.title = fmt(left) + ' · ' + (C.title || 'Pomodoro');
}
function beep() { try { var a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 660; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.25); } catch (e) {} }
function next() {
  if (mode === 'focus') { done++; mode = done % (C.roundsBeforeLong || 4) ? 'short' : 'long'; } else mode = 'focus';
  left = LEN[mode]; beep(); stop(); if (C.autoStart) start(); paint();
}
function tick() { left = Math.max(0, Math.round((endAt - Date.now()) / 1000)); if (!left) next(); paint(); }
function start() { endAt = Date.now() + left * 1000; timer = setInterval(tick, 250); }
function stop() { clearInterval(timer); timer = null; }
$('go').onclick = function () { if (timer) stop(); else start(); paint(); };
$('reset').onclick = function () { stop(); left = LEN[mode]; paint(); };
$('skip').onclick = next;
paint();
