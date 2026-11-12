// Top-down arena: an original TribeCode starter (MIT). Move, aim and shoot; slimes come in waves from the edges and
// each wave has one more. Everything you might tune is in config.js. Plain canvas, no libraries.
(function () {
  var C = window.CONFIG || {};
  var cv = document.getElementById('game'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  var keys = {}, mouse = { x: W / 2, y: 0 }, touchTo = null, s;
  function reset() { s = { p: { x: W / 2, y: H / 2, r: 12, hp: C.hearts || 3, hurt: 0 }, bullets: [], foes: [], wave: 0, score: 0, over: false, cool: 0 }; nextWave(); }
  function nextWave() {
    s.wave++;
    for (var i = 0; i < (C.foesPerWave || 3) + s.wave; i++) {
      var side = Math.floor(Math.random() * 4), x = side === 1 ? W + 20 : side === 3 ? -20 : Math.random() * W, y = side === 0 ? -20 : side === 2 ? H + 20 : Math.random() * H;
      s.foes.push({ x: x, y: y, r: 11 + Math.random() * 6, sp: (C.foeSpeed || 1.2) * (0.7 + Math.random() * 0.6) });
    }
  }
  reset();
  addEventListener('keydown', function (e) { keys[e.code] = true; if (s.over && e.code === 'Space') reset(); if (/Arrow/.test(e.code)) e.preventDefault(); });
  addEventListener('keyup', function (e) { keys[e.code] = false; });
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  cv.addEventListener('pointermove', function (e) { mouse = pos(e); if (e.pointerType !== 'mouse' && touchTo) touchTo = pos(e); });
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault(); mouse = pos(e);
    if (s.over) return reset();
    if (e.pointerType !== 'mouse') touchTo = pos(e);
    shoot();
  });
  addEventListener('pointerup', function () { touchTo = null; });
  function shoot() {
    if (s.cool > 0) return;
    var a = Math.atan2(mouse.y - s.p.y, mouse.x - s.p.x), v = C.bulletSpeed || 9;
    s.bullets.push({ x: s.p.x, y: s.p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v }); s.cool = 8;
  }
  function update() {
    if (s.over) return;
    var p = s.p, sp = C.speed || 3, dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
    if (touchTo) { var tx = touchTo.x - p.x, ty = touchTo.y - p.y, d = Math.hypot(tx, ty); if (d > 20) { dx = tx / d; dy = ty / d; } }
    var len = Math.hypot(dx, dy) || 1; p.x = Math.max(p.r, Math.min(W - p.r, p.x + dx / len * sp)); p.y = Math.max(p.r, Math.min(H - p.r, p.y + dy / len * sp));
    if (s.cool > 0) s.cool--; if (p.hurt > 0) p.hurt--;
    s.bullets.forEach(function (b) { b.x += b.vx; b.y += b.vy; });
    s.bullets = s.bullets.filter(function (b) { return b.x > -10 && b.x < W + 10 && b.y > -10 && b.y < H + 10 && !b.dead; });
    s.foes.forEach(function (f) {
      var a = Math.atan2(p.y - f.y, p.x - f.x); f.x += Math.cos(a) * f.sp; f.y += Math.sin(a) * f.sp;
      s.bullets.forEach(function (b) { if (!b.dead && Math.hypot(b.x - f.x, b.y - f.y) < f.r + 3) { b.dead = true; f.dead = true; s.score += 10; } });
      if (!f.dead && !p.hurt && Math.hypot(p.x - f.x, p.y - f.y) < f.r + p.r) { p.hp--; p.hurt = 60; if (p.hp <= 0) s.over = true; }
    });
    s.foes = s.foes.filter(function (f) { return !f.dead; });
    if (!s.foes.length) nextWave();
  }
  function draw() {
    ctx.fillStyle = C.floor || '#1B2028'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = C.grid || '#222833'; ctx.lineWidth = 1;
    for (var x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
    for (var y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
    ctx.fillStyle = C.foe || '#3BD16F'; s.foes.forEach(function (f) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = C.bullet || '#FABD2F'; s.bullets.forEach(function (b) { ctx.fillRect(b.x - 3, b.y - 3, 6, 6); });
    var p = s.p, a = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    if (!(p.hurt && Math.floor(p.hurt / 6) % 2)) {
      ctx.fillStyle = C.hero || '#F26B1D'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(p.x + Math.cos(a) * 12 - 3, p.y + Math.sin(a) * 12 - 3, 6, 6);
    }
    ctx.fillStyle = C.ink || '#E7E9EE'; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Wave ' + s.wave + '   Score ' + s.score + '   ' + new Array(Math.max(0, p.hp) + 1).join('♥ '), 12, 22);
    if (s.over) { ctx.textAlign = 'center'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.fillText('Game over. Space or tap to play again', W / 2, H / 2); }
  }
  (function loop() { if (keys.Space && !s.over) shoot(); update(); draw(); requestAnimationFrame(loop); })();
})();
