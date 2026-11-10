/* "How vibecoding works" pixel scene (v0.27). Left: someone talks to their phone. Right: a friend types on a laptop.
   Their ideas travel as pixels to the AI in the middle, which thinks (the blinking dots) and builds the app on screen:
   a header, a picture, lines of text, a button. Then it starts over with a new color. Drawn on a small canvas at
   200×72 logical pixels and scaled up crisp. Flat colors only (no glows), and it holds still for reduced motion. */
(function () {
  'use strict';
  const cv = document.getElementById('vf-scene'); if (!cv || !cv.getContext) return;
  const W = 200, H = 72, x = cv.getContext('2d');
  cv.width = W; cv.height = H; x.imageSmoothingEnabled = false;
  const C = { bg: '#1B2028', floor: '#232A34', edge: '#2A313C', skin: '#E8B48A', skin2: '#C98F66', hairA: '#3B2A20', hairB: '#1E1E28',
    shirtA: '#F26B1D', shirtB: '#6C7CFF', pants: '#2F3846', phone: '#0F1216', screen: '#38C6B1', laptop: '#8A94A6', lapDark: '#4A5262',
    app: '#12151A', appEdge: '#3A4350', ai: '#38C6B1', text: '#94A3B8', white: '#F8FAFC', green: '#3BD16F', yellow: '#FABD2F', pink: '#E86A92' };
  const r = (c, X, Y, w = 1, h = 1) => { x.fillStyle = c; x.fillRect(X | 0, Y | 0, w, h); };
  const still = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- people ----
  function personA(t) {   // standing, holding a phone up, talking
    const bx = 22, by = 30, talk = Math.floor(t / 6) % 2;
    r(C.hairA, bx + 1, by - 1, 8, 3); r(C.skin, bx + 1, by + 1, 8, 7); r(C.hairA, bx + 1, by + 1, 1, 3);
    r(C.phone, bx + 7, by + 4, 1, 1); r(C.hairB, bx + 6, by + 3, 1, 1);           // eye
    r(C.skin2, bx + 6, by + 6, 2, talk ? 2 : 1);                                    // mouth opens and closes
    r(C.shirtA, bx, by + 8, 10, 12); r(C.shirtA, bx + 9, by + 8, 3, 3);             // body + raised arm
    r(C.skin, bx + 11, by + 4, 2, 5);                                               // forearm up
    r(C.phone, bx + 12, by + 1, 4, 7); r(C.screen, bx + 13, by + 2, 2, 4);          // phone
    r(C.pants, bx + 1, by + 20, 3, 12); r(C.pants, bx + 6, by + 20, 3, 12);
    r(C.floor, bx - 2, by + 32, 16, 2);
    // speech: little waves out of the mouth while talking
    if (talk) { r(C.shirtA, bx + 17, by + 2, 1, 1); r(C.shirtA, bx + 19, by + 1, 1, 3); r(C.shirtA, bx + 21, by, 1, 5); }
  }
  function personB(t) {   // sitting at a laptop, typing
    const bx = 158, by = 36, k = Math.floor(t / 3) % 4;
    r(C.hairB, bx + 4, by - 6, 8, 3); r(C.skin, bx + 4, by - 4, 8, 7); r(C.hairB, bx + 11, by - 4, 1, 3);
    r(C.hairB, bx + 5, by - 2, 1, 1); r(C.skin2, bx + 5, by + 1, 2, 1);
    r(C.shirtB, bx + 3, by + 3, 10, 10);
    r(C.edge, bx - 14, by + 13, 30, 2);                                             // desk
    r(C.lapDark, bx - 12, by + 1, 13, 10); r(C.screen, bx - 11, by + 2, 11, 8);     // laptop screen (from behind it's the lid, keep it readable as a screen)
    for (let i = 0; i < 3; i++) r(C.app, bx - 10, by + 3 + i * 2, 4 + ((k + i) % 3) * 2, 1);   // code lines appearing
    r(C.laptop, bx - 13, by + 11, 16, 2);                                           // keyboard
    r(C.skin, bx - 2 - (k % 2) * 2, by + 9, 3, 2); r(C.skin, bx + 2 - ((k + 1) % 2) * 2, by + 9, 3, 2);   // hands tapping
    r(C.pants, bx + 4, by + 13, 9, 3); r(C.pants, bx + 10, by + 16, 3, 8);
    r(C.lapDark, bx + 2, by + 15, 14, 2); r(C.lapDark, bx + 14, by + 17, 2, 9);      // chair
    r(C.floor, bx - 16, by + 26, 34, 2);
  }

  // ---- the app being built in the middle ----
  const ACCENTS = [C.shirtA, C.green, C.shirtB, C.yellow, C.pink];
  function app(t, cyc, acc) {
    const ax = 76, ay = 14, aw = 48, ah = 44;
    r(C.appEdge, ax - 1, ay - 1, aw + 2, ah + 2); r(C.app, ax, ay, aw, ah);
    r(C.edge, ax, ay, aw, 5); r('#FF6F8E', ax + 2, ay + 2, 1, 1); r(C.yellow, ax + 4, ay + 2, 1, 1); r(C.green, ax + 6, ay + 2, 1, 1);
    const p = cyc;                       // 0..1 progress through this build
    if (p > .12) r(acc, ax + 4, ay + 8, Math.min(40, Math.floor((p - .12) * 300)), 4);                 // title bar
    if (p > .3) { r(C.edge, ax + 4, ay + 15, 18, 14); r(acc, ax + 8, ay + 21, 4, 4); r(C.text, ax + 13, ay + 19, 6, 6); }   // picture card
    for (let i = 0; i < 4; i++) if (p > .42 + i * .07) r(C.text, ax + 25, ay + 16 + i * 4, 18 - (i % 2) * 5, 2);           // text lines
    if (p > .75) { r(acc, ax + 4, ay + 34, 16, 5); r(C.app, ax + 7, ay + 36, 10, 1); }               // button
    if (p > .88 && Math.floor(t / 4) % 2) r(C.green, ax + aw - 7, ay + 34, 4, 4);                    // "it works" blink
  }
  // ---- the AI: a small teal block above the app, thinking ----
  function ai(t, busy) {
    const cx = 98, cy = 4;
    r(C.ai, cx, cy, 5, 5); r(C.app, cx + 1, cy + 1, 1, 1); r(C.app, cx + 3, cy + 1, 1, 1); r(C.app, cx + 1, cy + 3, 3, 1);
    if (busy) for (let i = 0; i < 3; i++) if (Math.floor(t / 3) % 4 > i) r(C.ai, cx + 8 + i * 3, cy + 3, 2, 2);   // thinking dots
    r(C.ai, cx + 2, cy + 6, 1, 3);       // a line down to the app
  }
  // ---- ideas travelling as pixels ----
  const lerp = (a, b, k) => a + (b - a) * k;
  function packets(t) {
    for (let i = 0; i < 4; i++) {
      const k = ((t / 40) + i / 4) % 1;
      // from the phone (left), arcing up to the AI
      const ax = lerp(38, 98, k), ay = lerp(30, 6, k) - Math.sin(k * Math.PI) * 10;
      r(C.shirtA, ax, ay, 2, 2);
      // from the laptop (right), arcing up to the AI
      const bx = lerp(150, 104, k), by = lerp(36, 6, k) - Math.sin(k * Math.PI) * 8;
      r(C.shirtB, bx, by, 2, 2);
    }
  }
  function stars() { [[8, 6], [60, 4], [140, 8], [186, 5], [130, 2], [16, 18], [190, 20]].forEach(([a, b]) => r(C.edge, a, b, 1, 1)); }

  let t = 0, last = 0;
  const CYCLE = 160;   // frames per build (about 13 s at 12 fps)
  function frame(now) {
    if (!still) requestAnimationFrame(frame);
    if (now - last < 83 && !still) return; last = now;   // ~12 fps for a pixel feel
    const cyc = still ? 1 : (t % CYCLE) / CYCLE, acc = ACCENTS[Math.floor(t / CYCLE) % ACCENTS.length];
    r(C.bg, 0, 0, W, H); stars();
    personA(t); personB(t); packets(t); ai(t, cyc < .9); app(t, cyc, acc);
    t++;
  }
  // only animate while on screen
  if ('IntersectionObserver' in window && !still) {
    let on = false;
    new IntersectionObserver(es => { const v = es.some(e => e.isIntersecting); if (v && !on) { on = true; requestAnimationFrame(frame); } else if (!v) on = false; }).observe(cv);
    const f0 = frame; frame = function (now) { if (!on) return; f0(now); };   // eslint-disable-line no-func-assign
  } else requestAnimationFrame(frame);
})();
