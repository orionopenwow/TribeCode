// Form and survey: an original TribeCode starter (MIT). One question per step, a progress bar, validation, and the
// answers as JSON at the end (send them anywhere with fetch). The questions live in QUESTIONS below.
var C = window.CONFIG || {};
var QUESTIONS = [
  { id: 'name', type: 'text', label: 'What should we call you?', required: true },
  { id: 'email', type: 'email', label: 'Your email', required: true },
  { id: 'role', type: 'choice', label: 'What do you do most?', options: ['Code', 'Design', 'Music', 'Writing', 'A bit of everything'] },
  { id: 'score', type: 'scale', label: C.scaleQuestion || 'How likely are you to tell a friend?', max: C.scaleMax || 10 },
  { id: 'note', type: 'long', label: 'Anything else?' }
];
var i = 0, answers = {}, form = document.getElementById('form'), box = document.getElementById('q'), err = document.getElementById('err');
document.getElementById('title').textContent = C.title || 'Quick survey';
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function show() {
  err.textContent = '';
  if (i >= QUESTIONS.length) {
    document.getElementById('step').textContent = 'Done';
    box.innerHTML = '<p>' + esc(C.thanks || 'Thank you! Here is what you sent:') + '</p><pre></pre>'; box.querySelector('pre').textContent = JSON.stringify(answers, null, 2);
    document.querySelector('.nav').hidden = true; return;
  }
  var q = QUESTIONS[i], v = answers[q.id] == null ? '' : answers[q.id], h = '<div class="bar"><i style="width:' + Math.round(i / QUESTIONS.length * 100) + '%"></i></div><label class="q" for="a">' + esc(q.label) + (q.required ? ' *' : '') + '</label>';
  if (q.type === 'choice') h += '<div class="opts">' + q.options.map(function (o, k) { return '<label class="opt"><input type="radio" name="a" value="' + esc(o) + '"' + (v === o ? ' checked' : '') + (k ? '' : ' id="a"') + '>' + esc(o) + '</label>'; }).join('') + '</div>';
  else if (q.type === 'scale') { h += '<div class="scale">'; for (var n = 1; n <= q.max; n++) h += '<label><input type="radio" name="a" value="' + n + '"' + (+v === n ? ' checked' : '') + (n === 1 ? ' id="a"' : '') + '>' + n + '</label>'; h += '</div>'; }
  else if (q.type === 'long') h += '<textarea class="input" id="a" rows="4"></textarea>';
  else h += '<input class="input" id="a" type="' + q.type + '" autocomplete="off">';
  box.innerHTML = h;
  var a = box.querySelector('#a'); if (a && 'value' in a && q.type !== 'choice' && q.type !== 'scale') { a.value = v; a.focus(); }
  document.getElementById('step').textContent = 'Question ' + (i + 1) + ' of ' + QUESTIONS.length;
  document.getElementById('back').disabled = i === 0;
  document.getElementById('next').textContent = i === QUESTIONS.length - 1 ? 'Send' : 'Next';
}
form.addEventListener('submit', function (e) {
  e.preventDefault();
  var q = QUESTIONS[i], picked = form.querySelector('input[name=a]:checked'), a = box.querySelector('#a');
  var v = picked ? picked.value : (q.type === 'choice' || q.type === 'scale') ? '' : a.value.trim();
  if (q.required && !v) { err.textContent = 'This one is needed.'; return; }
  if (q.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { err.textContent = 'That email does not look right.'; return; }
  answers[q.id] = q.type === 'scale' && v ? +v : v; i++; show();
});
document.getElementById('back').onclick = function () { if (i > 0) { i--; show(); } };
show();
