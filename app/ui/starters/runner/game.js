// Endless runner: an original TribeCode starter (MIT). One runner, obstacles that come faster and faster, a score and a
// best score. Everything you might tune is in config.js. Plain canvas, no libraries.
(function () {
  var C = window.CONFIG || {};
  var cv = document.getElementById('game'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, GROUND = H - 40;
  var best = 0, state, held = false;
  function reset() {
    state = { t: 0, speed: C.speed || 6, score: 0, over: false, started: false, obs: [], next: 60,
      p: { x: 70, y: GROUND - 36, w: 28, h: 36, vy: 0, onGround: true }, hills: [0, 210, 430] };
  }
  reset();
  function jump(down) {
    held = down;
    if (!down) return;
    if (state.over) return reset();
    state.started = true;
    if (state.p.onGround) { state.p.vy = -(C.jump || 12); state.p.onGround = false; }
  }
  addEventListener('keydown', function (e) { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); if (!e.repeat) jump(true); } });
  addEventListener('keyup', function (e) { if (e.code === 'Space' || e.code === 'ArrowUp') jump(false); });
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); jump(true); });
  addEventListener('pointerup', function () { jump(false); });
  function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function update() {
    var s = state, p = s.p;
    if (!s.started || s.over) return;
    s.t++; s.score += s.speed / 10; s.speed += (C.speedUp || 0.002);
    p.vy += (held && p.vy < 0 ? 0.45 : 1) * (C.gravity || 0.7); p.y += p.vy;
    if (p.y >= GROUND - p.h) { p.y = GROUND - p.h; p.vy = 0; p.onGround = true; }
    if (--s.next <= 0) {
      var tall = Math.random() < 0.35;
      s.obs.push(tall ? { x: W, y: GROUND - 46, w: 18, h: 46 } : { x: W, y: GROUND - 26, w: 26 + Math.random() * 20, h: 26 });
      s.next = Math.max(28, (C.gap || 70) + Math.random() * 60 - s.speed * 2);
    }
    s.obs.forEach(function (o) { o.x -= s.speed; });
    s.obs = s.obs.filter(function (o) { return o.x + o.w > 0; });
    s.hills = s.hills.map(function (h) { h -= s.speed * 0.3; return h < -200 ? W + 40 : h; });
    for (var i = 0; i < s.obs.length; i++) if (hit({ x: p.x + 4, y: p.y + 2, w: p.w - 8, h: p.h - 2 }, s.obs[i])) { s.over = true; best = Math.max(best, Math.floor(s.score)); }
  }
  function draw() {
    var s = state, p = s.p;
    ctx.fillStyle = C.sky || '#1B2028'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.hills || '#222833';
    s.hills.forEach(function (h) { ctx.beginPath(); ctx.moveTo(h, GROUND); ctx.lineTo(h + 90, GROUND - 70); ctx.lineTo(h + 180, GROUND); ctx.fill(); });
    ctx.fillStyle = C.ground || '#2A313C'; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = C.obstacle || '#FF6F8E'; s.obs.forEach(function (o) { ctx.fillRect(o.x, o.y, o.w, o.h); });
    ctx.fillStyle = C.runner || '#F26B1D'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = C.sky || '#1B2028'; ctx.fillRect(p.x + 18, p.y + 8, 5, 5);   // an eye
    if (p.onGround && s.started && !s.over) { ctx.fillStyle = C.runner || '#F26B1D'; var leg = Math.floor(s.t / 5) % 2; ctx.fillRect(p.x + (leg ? 4 : 16), p.y + p.h, 8, 4); }
    ctx.fillStyle = C.ink || '#E7E9EE'; ctx.font = '14px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('Score ' + Math.floor(s.score) + (best ? '   Best ' + best : ''), W - 12, 22);
    ctx.textAlign = 'center'; ctx.font = 'bold 18px system-ui, sans-serif';
    if (!s.started) ctx.fillText((C.title || 'Endless runner') + ': press Space or tap to run', W / 2, H / 2 - 20);
    if (s.over) ctx.fillText('Game over. Space or tap to run again', W / 2, H / 2 - 20);
  }
  (function loop() { update(); draw(); requestAnimationFrame(loop); })();
})();
