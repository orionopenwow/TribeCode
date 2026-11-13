// Chat UI: an original TribeCode starter (MIT). Bubbles, grouping by person, a typing indicator and a pretend friend
// who answers, all in the page. Replace reply() with a WebSocket or your API to make it real.
var C = window.CONFIG || {};
document.getElementById('title').textContent = C.channel || '#general';
var log = document.getElementById('log'), form = document.getElementById('form'), input = document.getElementById('msg');
var typing = document.createElement('div'); typing.className = 'typing'; log.after(typing);
var FRIEND = C.friend || 'Maya';
function now() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function add(who, text) {
  var m = document.createElement('div'); m.className = 'msg' + (who === 'me' ? ' me' : '');
  if (who !== 'me') { var b = document.createElement('b'); b.textContent = who; m.appendChild(b); }
  m.appendChild(document.createTextNode(text));
  var t = document.createElement('time'); t.textContent = now(); m.appendChild(t);
  log.appendChild(m); log.scrollTop = log.scrollHeight;
}
var REPLIES = String(C.replies || 'Ooh, nice!|Show me when it works|I can take that one|Ha, same|Let\'s try it tonight').split('|');
function reply() { typing.textContent = FRIEND + ' is typing…'; setTimeout(function () { typing.textContent = ''; add(FRIEND, REPLIES[Math.floor(Math.random() * REPLIES.length)]); }, C.replyMs || 900); }
form.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value.trim(); if (!t) return; add('me', t); input.value = ''; reply(); });
add(FRIEND, C.greeting || 'Hey! The build is up, have a look'); add('Jay', 'Looks great on my phone'); add('me', 'Nice, adding the dark mode next');
