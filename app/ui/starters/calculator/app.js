// Calculator: an original TribeCode starter (MIT). A small, safe expression parser (no eval) with + − × ÷ %, brackets,
// decimals and keyboard input. Add functions in the parser (see factor()).
var C = window.CONFIG || {};
var KEYS = [['C', 'fn'], ['(', 'fn'], [')', 'fn'], ['÷', 'op'], ['7'], ['8'], ['9'], ['×', 'op'], ['4'], ['5'], ['6'], ['−', 'op'], ['1'], ['2'], ['3'], ['+', 'op'], ['0', 'wide'], ['.'], ['=', 'eq']];
var expr = '', out = document.getElementById('out'), ex = document.getElementById('expr');
document.getElementById('keys').innerHTML = KEYS.map(function (k) { return '<button type="button" class="' + (k[1] || '') + '" data-k="' + k[0] + '">' + k[0] + '</button>'; }).join('');
function parse(s) {   // recursive descent: expr = term (+|- term)*, term = factor (*|/|% factor)*, factor = number | (expr) | -factor
  var i = 0; s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  function num() { var m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i)); if (!m) throw new Error('?'); i += m[0].length; return parseFloat(m[0]); }
  function factor() { if (s[i] === '-') { i++; return -factor(); } if (s[i] === '(') { i++; var v = sum(); if (s[i] !== ')') throw new Error('?'); i++; return v; } return num(); }
  function term() { var v = factor(); while (s[i] === '*' || s[i] === '/' || s[i] === '%') { var o = s[i++], r = factor(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
  function sum() { var v = term(); while (s[i] === '+' || s[i] === '-') { var o = s[i++], r = term(); v = o === '+' ? v + r : v - r; } return v; }
  var v = sum(); if (i < s.length) throw new Error('?'); return v;
}
function fmt(v) { return isFinite(v) ? String(+v.toFixed(C.decimals == null ? 10 : C.decimals)) : 'Not a number'; }
function press(k) {
  if (k === 'C') expr = '';
  else if (k === '=') { try { var v = fmt(parse(expr)); ex.textContent = expr + ' ='; expr = v === 'Not a number' ? '' : v; out.textContent = v; return; } catch (e) { out.textContent = 'Error'; return; } }
  else expr += k;
  ex.textContent = ''; out.textContent = expr || '0';
  try { if (/[-+×÷−%]/.test(expr)) ex.textContent = '= ' + fmt(parse(expr)); } catch (e) {}
}
document.getElementById('keys').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) press(b.dataset.k); });
addEventListener('keydown', function (e) {
  var m = { '*': '×', '/': '÷', '-': '−', Enter: '=', '=': '=', Escape: 'C', Backspace: 'back' }[e.key] || (/^[\d.+()%]$/.test(e.key) ? e.key : null);
  if (!m) return; e.preventDefault();
  if (m === 'back') { expr = expr.slice(0, -1); out.textContent = expr || '0'; return; }
  press(m);
});
