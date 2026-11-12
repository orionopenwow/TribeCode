// Memory cards: an original TribeCode starter (MIT). Flip two cards, keep the pairs, beat your best. A small card-game
// base: the deck, the turn logic and the score are plain functions you can grow into Snap, Go Fish or solitaire.
(function () {
  var C = window.CONFIG || {};
  var table = document.getElementById('table'), stats = document.getElementById('stats');
  var SYMBOLS = String(C.symbols || '★ ♥ ♦ ♣ ♠ ☀ ☾ ♪ ⚑ ✿ ☂ ⚓').split(/\s+/).filter(Boolean);
  var deck, open, moves, found, lock, best = null, started;
  document.getElementById('title').textContent = C.title || 'Memory cards';
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function deal() {
    var n = Math.max(2, Math.min(SYMBOLS.length, C.pairs || 8)), syms = SYMBOLS.slice(0, n);
    deck = shuffle(syms.concat(syms).map(function (s, i) { return { s: s, id: i }; }));
    open = []; moves = 0; found = 0; lock = false; started = Date.now();
    table.innerHTML = '';
    deck.forEach(function (c, i) {
      var b = document.createElement('button'); b.className = 'card'; b.type = 'button'; b.textContent = c.s; b.setAttribute('aria-label', 'Card ' + (i + 1));
      b.onclick = function () { flip(c, b); }; c.el = b; table.appendChild(b);
    });
    var w = document.getElementById('win'); if (w) w.remove();
    paint();
  }
  function paint() { stats.textContent = 'Moves ' + moves + ' · Pairs ' + found + '/' + deck.length / 2 + (best != null ? ' · Best ' + best : ''); }
  function flip(c, b) {
    if (lock || c.done || open.indexOf(c) >= 0) return;
    b.classList.add('up'); b.setAttribute('aria-label', c.s); open.push(c);
    if (open.length < 2) return;
    moves++;
    var a = open[0], z = open[1];
    if (a.s === z.s) { a.done = z.done = true; a.el.classList.add('done'); z.el.classList.add('done'); open = []; found++; if (found === deck.length / 2) win(); }
    else { lock = true; setTimeout(function () { a.el.classList.remove('up'); z.el.classList.remove('up'); open = []; lock = false; }, C.flipBackMs || 700); }
    paint();
  }
  function win() {
    best = best == null ? moves : Math.min(best, moves);
    var p = document.createElement('p'); p.id = 'win'; p.textContent = 'All pairs in ' + moves + ' moves and ' + Math.round((Date.now() - started) / 1000) + ' seconds.';
    table.after(p); paint();
  }
  document.getElementById('again').onclick = deal;
  deal();
})();
