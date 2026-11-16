/*! TribeCode Motion Kit (feat/motion): the engine behind Motion Studio. Plain JS, no build step, no network. MIT.
 *
 * One element that never cuts: every state of a motion graphic is the same shape morphing its size, corner radius,
 * position and colour while its content swaps with a short blur. A cursor drives the changes with real clicks and
 * drags, the camera zooms so each state fills the frame, and the last frame is the first frame, so it loops.
 *
 * Everything is a pure function of time. seek(doc, t) and draw(g, doc, t) carry no state between frames: no CSS
 * transitions, no timers. Springs are closed-form step responses, and a value that changes target many times is the
 * sum of one spring per change. A drag is direct manipulation (the value follows the cursor while it is held) and on
 * release it springs back from wherever it was. Two-edge springs (the leading edge on a stiffer spring) give tab
 * indicators and toggle knobs their stretch.
 *
 * Ideas, not code, from (all MIT): Emil Kowalski's skills (emilkowalski/skills), the Animate skill (cth9191/animate),
 * the HTML animation skill (drewharvey/claude-html-animation-skill), rossark-motion-skill and anime.js.
 *
 * The same file runs in Motion Studio, in node (tests, server-side Flint) and inside an exported page.
 *   TEMPLATES, CATS, FEELS, KINDS     templates by id (make(opts) -> doc), their categories, the feel presets
 *   define(id, cat, name, about, base, states), addCat(id, name), helpers   more templates from another file
 *   make(id, opts) -> doc             normalize(doc) -> doc                  duration(doc) -> seconds
 *   seek(doc, t) -> frame             draw(g, doc, t, { w, h, blur })        load(doc) -> Promise (pictures)
 *   events(doc) -> sounds             snap(doc) -> doc on the beat grid      analyze(samples, rate) -> { bpm, offset, onsets }
 *   command(doc, step) -> { doc, say } Flint's motion.* steps                applyFeel(doc, id) -> doc
 *   step(tau, k, z), channel(events, t, o)   the spring maths, exposed for tests
 */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeMotionKit = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 1;
  const clone = o => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const num = (v, d, lo, hi) => { v = +v; return Number.isFinite(v) ? clamp(v, lo, hi) : d; };
  const easeIO = u => (u = clamp(u, 0, 1), u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const easeOut = u => (u = clamp(u, 0, 1), 1 - Math.pow(1 - u, 3));
  const smooth = u => (u = clamp(u, 0, 1), u * u * (3 - 2 * u));

  // ---------- springs ----------
  // Step response of a spring with stiffness k (mass 1) and damping ratio z, from 0 to 1. Exactly 1 after SETTLE seconds,
  // so a loop's first and last frames match to the pixel.
  const SETTLE = 3.2;
  function step(tau, k = 220, z = 0.86, settle = SETTLE) {
    if (!(tau > 0)) return 0;
    if (tau >= settle) return 1;
    const w = Math.sqrt(k);
    if (z >= 1) return 1 - Math.exp(-w * tau) * (1 + w * tau);
    const wd = w * Math.sqrt(1 - z * z), e = Math.exp(-z * w * tau);
    return 1 - e * (Math.cos(wd * tau) + (z * w / wd) * Math.sin(wd * tau));
  }
  // A channel: events in time order, each { t, to, k?, z? } (spring to a value) or { t, t1, path(u) } (follow: the value is
  // path(u) while u goes 0 → 1 from t to t1; afterwards it starts from path(1)). o = { loop, dur, k, z, base }.
  // Looping: the previous cycle's events count too, so the channel at t = 0 equals the channel at t = dur.
  function channel(evs, t, o = {}) {
    const k0 = o.k || 220, z0 = o.z || 0.86, settle = Math.min(SETTLE, o.dur || SETTLE);
    if (!evs.length) return o.base || 0;
    let list = evs;
    let base;
    if (o.loop && o.dur) {
      base = endValue(evs);
      list = evs.map(e => shift(e, -o.dur)).concat(evs);
    } else base = evs[0].to != null ? evs[0].to : (evs[0].path ? evs[0].path(0) : 0);
    let prev = base, terms = [];
    for (const e of list) {
      if (e.t > t) break;
      if (e.path) {
        if (t < e.t1) return e.path(clamp((t - e.t) / Math.max(1e-6, e.t1 - e.t), 0, 1));
        base = e.path(1); prev = base; terms = [];
      } else { terms.push([e.t, e.to - prev, e.k || k0, e.z || z0]); prev = e.to; }
    }
    let v = base;
    for (const [t0, d, k, z] of terms) v += d * step(t - t0, k, z, settle);
    return v;
  }
  function endValue(evs) { let v = 0; for (const e of evs) v = e.path ? e.path(1) : e.to; return v; }
  function shift(e, by) { return e.path ? { ...e, t: e.t + by, t1: e.t1 + by } : { ...e, t: e.t + by }; }

  // ---------- colour ----------
  const hex = h => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return Number.isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [0, 0, 0]; };
  const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const mix = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
  const NAMED = { teal: '#38C6B1', ember: '#F26B1D', orange: '#F26B1D', indigo: '#6C7CFF', blue: '#3B82F6', green: '#3BD16F', rose: '#FF6F8E', pink: '#EC4899', red: '#EF4444', yellow: '#F5C518', purple: '#8B5CF6', violet: '#8B5CF6', black: '#111111', white: '#FFFFFF', gray: '#8A8F98', grey: '#8A8F98', lime: '#84CC16', cyan: '#06B6D4', gold: '#D4A017', mint: '#5EEAD4', coral: '#FB7185', navy: '#1E3A8A', brown: '#8B5E3C' };
  function colorOf(name, th) {
    if (!name) return hex(th.ink);
    if (name === 'ink' || name === 'paper' || name === 'accent' || name === 'bg' || name === 'muted') return hex(th[name]);
    if (/^#?[0-9a-f]{3,6}$/i.test(name)) return hex(name);
    return hex(NAMED[String(name).toLowerCase()] || th.ink);
  }

  // ---------- icons (stroke, 24 grid, the same paths as app/ui/icons.js) ----------
  const ICONS = {
    check: 'M5 12.5l4.5 4.5L19 7.5', search: 'M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0zM20 20l-4.2-4.2', x: 'M6 6l12 12M18 6L6 18', plus: 'M12 5v14M5 12h14',
    sparkle: 'M12 4l1.6 4.8L18.5 10l-4.9 1.4L12 16l-1.6-4.6L5.5 10l4.9-1.2z', bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
    bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z', clock: 'M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0zM12 7.5V12l3 2', chat: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    home: 'M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z', user: 'M15.5 8.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5',
    flame: 'M12 21c-3.6 0-6-2.4-6-5.6 0-2.6 1.6-4.4 3-6 .4 1.6 1.2 2.6 2.2 3C11 9 12.5 5.5 15 3.5c-.2 3 1.2 4.6 2.2 6.2.7 1.1.8 2.4.8 3.7 0 4.8-2.4 7.6-6 7.6z',
    pulse: 'M3 12h4l2.5-5 4 10 2.5-5H21', heart: 'M12 19.5s-7.5-4.3-7.5-9.7A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4c0 5.4-7.5 9.7-7.5 9.7z',
    repost: 'M7 7h10l-2.5-2.5M17 17H7l2.5 2.5M17 7v5M7 17v-5', share: 'M12 4v11M7.5 8.5L12 4l4.5 4.5M5 14v5h14v-5', pin: 'M12 21s6-5.6 6-11a6 6 0 0 0-12 0c0 5.4 6 11 6 11zM14.2 10a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z',
    play: 'M8 5.5v13l10.5-6.5z', volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11', phone: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2',
    gear: 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6',
    tribe: 'M4 7.5A1.5 1.5 0 0 1 5.5 6H10l2 2h6.5A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z', arrow: 'M5 12h14M13 6l6 6-6 6',
    ring: 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', cloud: 'M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 9.4 4.3 4.3 0 0 0 7 18z',
    star: 'M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z', camera: 'M4 8h3.5L9 6h6l1.5 2H20v11H4zM15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z',
    music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    cart: 'M3 4h2.5l2.2 10.5h10.6L20.5 7H7M10 19.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM18 19.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z', globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  };
  const P2D = {};
  function iconPath(name) { if (typeof Path2D === 'undefined') return null; const d = ICONS[name] || ICONS.sparkle; return P2D[d] || (P2D[d] = new Path2D(d)); }
  function icon(g, name, x, y, size, color, lw = 1.6, prog = 1) {
    const p = iconPath(name); if (!p) return;
    g.save(); g.translate(x - size / 2, y - size / 2); g.scale(size / 24, size / 24);
    g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    if (prog < 1) { g.setLineDash([Math.max(0.001, prog * 120), 120]); }
    g.stroke(p); g.restore();
  }

  // ---------- drawing helpers ----------
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
  }
  function txt(g, I, s, x, y, size, o = {}) {
    g.font = `${o.w || 600} ${size}px ${I.font}`; g.fillStyle = o.c || I.ink; g.textAlign = o.a || 'center'; g.textBaseline = o.b || 'middle';
    if (o.track) { try { g.letterSpacing = o.track + 'px'; } catch {} }
    g.fillText(String(s), x, y);
    if (o.track) { try { g.letterSpacing = '0px'; } catch {} }
  }
  const tw = (g, I, s, size, w = 600) => { g.font = `${w} ${size}px ${I.font}`; return g.measureText(String(s)).width; };
  function wrap(g, I, s, size, maxW, w = 500) {
    const out = []; let line = '';
    for (const word of String(s).split(/\s+/)) { const t = line ? line + ' ' + word : word; if (line && tw(g, I, t, size, w) > maxW) { out.push(line); line = word; } else line = t; }
    if (line) out.push(line); return out;
  }
  const alpha = (g, a, fn) => { if (a <= 0.001) return; g.save(); g.globalAlpha *= clamp(a, 0, 1); fn(); g.restore(); };

  // ---------- the kinds: what a state draws inside the shape ----------
  // Each kind: { name, size: [w, h, r], fill, draw(g, S, box, I), shape?(S, I) -> { dw, dh, dx, fill } }.
  // I (info): lt = seconds since this state began, T = time, ink/sub/acc/paper colours (css), sp(tau) spring, act(i) acts in seconds,
  // font, theme. Coordinates are units of a 1440 frame, origin at the shape's centre.
  const PLAY = [[-14, -20], [-14, 20], [22, 0], [22, 0]], PAUSE_L = [[-18, -20], [-18, 20], [-6, 20], [-6, -20]], PAUSE_R = [[6, -20], [6, 20], [18, 20], [18, -20]];
  function poly(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
  const lerpPts = (a, b, u) => a.map((p, i) => [lerp(p[0], b[i][0], u), lerp(p[1], b[i][1], u)]);
  // click acts flip a value: returns the number of clicks before t
  const clicksBefore = (acts, t, type = 'click') => acts.filter(a => a.type === type && a.t <= t).length;
  // drag/hover acts: the value at time t, from a mapping of the act's path
  function dragValue(acts, t, v0, map, I, opts = {}) {
    const evs = [{ t: -1e6, to: v0 }];
    for (const a of acts) if (a.type === 'drag') { evs.push({ t: a.t, t1: a.t1, path: u => map(lerp(a.x0, a.x1, easeIO(u)), lerp(a.y0, a.y1, easeIO(u))) }); if (opts.release) evs.push({ t: a.t1, to: opts.release(map(a.x1, a.y1)) }); }
    return channel(evs, t, { k: I.k, z: I.z });
  }
  function twoEdge(I, events, t, l0, r0) {   // events: [{ t, l, r }] → { l, r } with the leading edge on a stiffer spring
    const L = [{ t: -1e6, to: l0 }], R = [{ t: -1e6, to: r0 }]; let pl = l0;
    for (const e of events) { const right = e.l > pl; L.push({ t: e.t, to: e.l, k: I.k * (right ? 0.55 : 1.9), z: 0.9 }); R.push({ t: e.t, to: e.r, k: I.k * (right ? 1.9 : 0.55), z: 0.9 }); pl = e.l; }
    return { l: channel(L, t, {}), r: channel(R, t, {}) };
  }
  function screenMock(g, I, x, y, w, h, seed, dark) {   // a calm generic app screen when there is no picture
    const bg = dark ? I.inkC : I.paperC, fg = dark ? I.paperC : I.inkC;
    g.fillStyle = css(bg); g.fillRect(x, y, w, h);
    const u = w / 100, rows = [[8, 6, 44, 5], [8, 16, 84, 22], [8, 42, 40, 18], [52, 42, 40, 18], [8, 64, 84, 8], [8, 76, 84, 8]];
    const tint = [I.accC, mix(fg, bg, 0.82), mix(fg, bg, 0.9)];
    rows.forEach((r, i) => { g.fillStyle = css(i === (seed % 3) + 1 ? tint[0] : tint[1 + (i % 2)]); rr(g, x + r[0] * u, y + r[1] * h / 100, r[2] * u, r[3] * h / 100, 2.2 * u); g.fill(); });
  }
  const KINDS = {
    button: { name: 'Button', size: [360, 112, 56], fill: 'ink', draw(g, S, b, I) { const ic = S.icon; const tx = S.text || 'Get started', s = S.fs || 34; const w = tw(g, I, tx, s); if (ic) { icon(g, ic, -w / 2 - 6, 0, 30, I.ink, 2); txt(g, I, tx, 18, 0, s); } else txt(g, I, tx, 0, 0, s); } },
    loader: { name: 'Loader', size: [112, 112, 56], fill: 'ink', draw(g, S, b, I) { const r = Math.min(b.w, b.h) * 0.24, a = I.lt * Math.PI * 2.4; g.strokeStyle = I.ink; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, r, a, a + 1.6 + 0.6 * Math.sin(I.lt * 5)); g.stroke(); alpha(g, 0.18, () => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }); } },
    check: { name: 'Done', size: [112, 112, 56], fill: 'accent', draw(g, S, b, I) { const p = easeOut((I.lt - 0.04) / 0.32); g.save(); g.scale(2.4, 2.4); g.translate(-12, -12); g.strokeStyle = I.ink; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([Math.max(0.001, p * 22), 40]); g.beginPath(); g.moveTo(5, 12.5); g.lineTo(9.5, 17); g.lineTo(19, 7.5); g.stroke(); g.restore(); } },
    island: { name: 'Dynamic island', size: [440, 112, 56], fill: 'ink', draw(g, S, b, I) {
      const x = -b.w / 2 + 56; g.fillStyle = I.acc; g.beginPath(); g.arc(x, 0, 30, 0, Math.PI * 2); g.fill(); icon(g, S.icon || 'music', x, 0, 28, I.accInk, 2);
      txt(g, I, S.title || 'Lantern', x + 50, -14, 26, { a: 'left' }); txt(g, I, S.sub || 'Now playing', x + 50, 18, 20, { a: 'left', w: 500, c: I.sub });
      for (let i = 0; i < 5; i++) { const h = 14 + 22 * (0.5 + 0.5 * I.osc(1.1 + i * 0.27, i * 1.3)); g.fillStyle = I.acc; rr(g, b.w / 2 - 120 + i * 16, -h / 2, 7, h, 3.5); g.fill(); }
    } },
    player: { name: 'Music player', size: [760, 300, 48], fill: 'ink', draw(g, S, b, I) {
      const L = -b.w / 2 + 40, art = b.h - 80; g.fillStyle = I.acc; rr(g, L, -art / 2, art, art, 28); g.fill();
      g.strokeStyle = I.accInk; g.lineWidth = 3; for (let i = 0; i < 3; i++) { g.beginPath(); for (let x = 0; x <= art - 60; x += 6) { const y = I.osc(0.32, x / 18 + i * 1.4) * 10 + (i - 1) * 28; x ? g.lineTo(L + 30 + x, y) : g.moveTo(L + 30 + x, y); } alpha(g, 0.55, () => g.stroke()); }
      const tx = L + art + 36; txt(g, I, S.title || 'Golden Hour', tx, -64, 34, { a: 'left' }); txt(g, I, S.artist || 'The Night Owls', tx, -24, 24, { a: 'left', w: 500, c: I.sub });
      const clicks = I.acts.filter(a => a.type === 'click' && a.t <= I.T), on = clicks.length % 2 === 1;
      const evs = [{ t: -1e6, to: 0 }]; I.acts.filter(a => a.type === 'click').forEach((a, i) => evs.push({ t: a.t, to: (i + 1) % 2 }));
      const m = clamp(channel(evs, I.T, { k: I.k * 1.4, z: 0.95 }), 0, 1); void on;
      const px = b.w / 2 - 76, py = -44; g.fillStyle = I.ink; g.beginPath(); g.arc(px, py, 40, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(px, py); g.scale(0.85, 0.85); g.fillStyle = I.inkC0; poly(g, lerpPts(PLAY.map((p, i) => i < 2 ? [p[0] - 2, p[1]] : p), PAUSE_L, m)); g.fill(); alpha(g, m, () => { poly(g, PAUSE_R); g.fill(); }); g.restore();
      // progress: plays while on, scrubbed by a drag
      const bx = tx, bw = b.w / 2 - 40 - tx, by = 70; let p = S.p0 != null ? S.p0 : 0.18, last = I.t0, playing = false; const rate = 0.035;
      for (const a of I.acts.filter(a => a.t <= I.T).sort((x, y) => x.t - y.t)) {
        if (playing) p += rate * (a.t - last); last = a.t;
        if (a.type === 'click') playing = !playing;
        if (a.type === 'drag') { if (I.T < a.t1) { p = clamp(lerp(a.x0, a.x1, easeIO((I.T - a.t) / (a.t1 - a.t))) / bw + 0.5 - (bx + bw / 2) / bw, 0, 1); last = I.T; playing = playing && false; break; } p = clamp(a.x1 / bw + 0.5 - (bx + bw / 2) / bw, 0, 1); last = a.t1; }
      }
      if (playing) p += rate * (I.T - last); p = clamp(p, 0, 1);
      g.fillStyle = I.sub; rr(g, bx, by - 4, bw, 8, 4); alpha(g, 0.35, () => g.fill()); g.fillStyle = I.ink; rr(g, bx, by - 4, bw * p, 8, 4); g.fill(); g.beginPath(); g.arc(bx + bw * p, by, 11, 0, Math.PI * 2); g.fill();
      const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; txt(g, I, fmt(p * 214), bx, by + 34, 18, { a: 'left', w: 500, c: I.sub }); txt(g, I, '3:34', bx + bw, by + 34, 18, { a: 'right', w: 500, c: I.sub });
    } },
    slider: { name: 'Volume slider', size: [760, 140, 70], fill: 'paper',
      val(S, I) { const L = -380 + 120, W = 560; return dragValue(I.acts, I.T, S.v0 != null ? S.v0 : 0.45, x => (x - L) / W, I, { release: v => Math.min(1, v) }); },
      shape(S, I) { const v = this.val(S, I), over = Math.max(0, v - 1); const st = 1 - Math.exp(-over * 2.2); return { dw: st * 150, dh: -st * 26, dx: st * 75 }; },
      draw(g, S, b, I) { const v = this.val(S, I), L = -b.w / 2 + 120, W = b.w - 120 - 60; icon(g, 'volume', -b.w / 2 + 64, 0, 40, I.ink, 2.2);
        g.fillStyle = I.sub; rr(g, L, -9, W, 18, 9); alpha(g, 0.3, () => g.fill()); g.fillStyle = I.ink; rr(g, L, -9, W * clamp(v, 0, 1), 18, 9); g.fill(); } },
    toggle: { name: 'Toggle', size: [300, 150, 75], fill: 'ink',
      on(S, I) { return ((S.on0 ? 1 : 0) + clicksBefore(I.acts, I.T)) % 2; },
      shape(S, I) { const evs = [{ t: -1e6, to: S.on0 ? 1 : 0 }]; I.acts.filter(a => a.type === 'click').forEach((a, i) => evs.push({ t: a.t, to: ((S.on0 ? 1 : 0) + i + 1) % 2 })); const u = clamp(channel(evs, I.T, { k: I.k, z: 0.95 }), 0, 1); return { fillMix: u }; },
      draw(g, S, b, I) { const pad = 14, d = b.h - pad * 2, L0 = -b.w / 2 + pad, L1 = b.w / 2 - pad - d; const evs = []; let on = S.on0 ? 1 : 0; for (const a of I.acts) if (a.type === 'click') { on = 1 - on; evs.push({ t: a.t, l: on ? L1 : L0, r: (on ? L1 : L0) + d }); }
        const e = twoEdge(I, evs, I.T, S.on0 ? L1 : L0, (S.on0 ? L1 : L0) + d); g.fillStyle = I.ink; rr(g, e.l, -d / 2, e.r - e.l, d, d / 2); g.fill(); } },
    tabs: { name: 'Tabs', size: [780, 120, 60], fill: 'paper', draw(g, S, b, I) {
      const labels = S.labels || ['Home', 'Library', 'Profile'], n = labels.length, pad = 12, cw = (b.w - pad * 2) / n; let sel = S.sel0 || 0; const evs = [];
      for (const a of I.acts) if (a.type === 'click' && a.i != null) { sel = a.i; evs.push({ t: a.t, l: -b.w / 2 + pad + cw * sel, r: -b.w / 2 + pad + cw * (sel + 1) }); }
      const s0 = S.sel0 || 0, e = twoEdge(I, evs, I.T, -b.w / 2 + pad + cw * s0, -b.w / 2 + pad + cw * (s0 + 1));
      g.fillStyle = I.inkSolid; rr(g, e.l, -b.h / 2 + pad, e.r - e.l, b.h - pad * 2, (b.h - pad * 2) / 2); g.fill();
      labels.forEach((l, i) => { const cx = -b.w / 2 + pad + cw * (i + 0.5), over = clamp(1 - Math.abs(((e.l + e.r) / 2 - cx) / cw), 0, 1); txt(g, I, l, cx, 0, 28, { c: css(mix(I.inkC, I.paperC, over)) }); });
    } },
    chart: { name: 'Line chart', size: [900, 560, 40], fill: 'paper', draw(g, S, b, I) {
      const pts = S.pts || [12, 18, 15, 26, 22, 34, 31, 44, 40, 52], L = -b.w / 2 + 70, R = b.w / 2 - 50, T = -b.h / 2 + 110, B = b.h / 2 - 60, mx = Math.max(...pts) * 1.1;
      txt(g, I, S.title || 'Weekly players', L, -b.h / 2 + 52, 30, { a: 'left' }); txt(g, I, S.big || '+38%', R, -b.h / 2 + 52, 30, { a: 'right', c: I.acc });
      g.strokeStyle = I.sub; g.lineWidth = 1; alpha(g, 0.25, () => { for (let i = 0; i <= 3; i++) { const y = lerp(T, B, i / 3); g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); } });
      const X = i => lerp(L, R, i / (pts.length - 1)), Y = v => lerp(B, T, v / mx), p = easeOut((I.lt - 0.1) / 1.1);
      g.save(); g.beginPath(); g.rect(L - 10, T - 40, (R - L + 20) * p, B - T + 80); g.clip(); g.strokeStyle = I.ink; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath(); pts.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke(); g.restore();
      const hov = I.acts.find(a => a.type === 'hover' && I.T >= a.t - 0.05);
      if (hov) { const hx = I.T < hov.t1 ? lerp(hov.x0, hov.x1, easeIO((I.T - hov.t) / (hov.t1 - hov.t))) : hov.x1, i = clamp(Math.round((hx - L) / (R - L) * (pts.length - 1)), 0, pts.length - 1), a = smooth((I.T - hov.t + 0.05) / 0.2);
        alpha(g, a, () => { g.fillStyle = I.inkSolid; g.beginPath(); g.arc(X(i), Y(pts[i]), 11, 0, Math.PI * 2); g.fill(); const lab = `${pts[i] * 100}`, w = tw(g, I, lab, 24) + 36, ty = Y(pts[i]) - 62; rr(g, X(i) - w / 2, ty - 24, w, 48, 14); g.fill(); txt(g, I, lab, X(i), ty, 24, { c: I.paperCss }); }); }
    } },
    bars: { name: 'Bar chart', size: [900, 560, 40], fill: 'paper', draw(g, S, b, I) {
      const v = S.vals || [32, 48, 41, 66, 58, 82], lab = S.labels || ['M', 'T', 'W', 'T', 'F', 'S'], n = v.length, L = -b.w / 2 + 60, R = b.w / 2 - 60, B = b.h / 2 - 70, T = -b.h / 2 + 120, bw = (R - L) / n * 0.56, mx = Math.max(...v);
      txt(g, I, S.title || 'Sign-ups this week', L, -b.h / 2 + 54, 30, { a: 'left' });
      v.forEach((x, i) => { const p = step(I.lt - 0.08 * i - 0.1, I.k, I.z), h = (B - T) * x / mx * p, cx = lerp(L, R, (i + 0.5) / n); g.fillStyle = i === (S.hi != null ? S.hi : n - 1) ? I.acc : I.inkSolid; rr(g, cx - bw / 2, B - h, bw, h, 10); g.fill(); txt(g, I, lab[i] || '', cx, B + 34, 22, { w: 500, c: I.sub }); });
    } },
    donut: { name: 'Donut', size: [560, 560, 280], fill: 'paper', draw(g, S, b, I) {
      const parts = S.parts || [0.46, 0.32, 0.22], cols = [I.acc, I.inkSolid, I.sub], r = Math.min(b.w, b.h) * 0.32; let a0 = -Math.PI / 2; const p = easeOut((I.lt - 0.05) / 1.0);
      g.lineWidth = r * 0.34; g.lineCap = 'butt'; parts.forEach((x, i) => { g.strokeStyle = cols[i % 3]; g.beginPath(); g.arc(0, 0, r, a0, a0 + Math.PI * 2 * x * p - 0.03); g.stroke(); a0 += Math.PI * 2 * x * p; });
      txt(g, I, `${Math.round(parts[0] * 100 * p)}%`, 0, -6, 64, { w: 700 }); txt(g, I, S.label || 'on phones', 0, 44, 22, { w: 500, c: I.sub });
    } },
    cmdk: { name: 'Command palette', size: [820, 440, 28], fill: 'paper', draw(g, S, b, I) {
      const q = S.query || 'export', items = S.items || ['Export as video', 'Export as GIF', 'Share a link', 'Invite a friend', 'New motion graphic'];
      const ty = I.acts.find(a => a.type === 'type'), n = ty ? clamp(Math.floor((I.T - ty.t) / Math.max(0.04, (ty.t1 - ty.t) / q.length)), 0, q.length) : 0, typed = q.slice(0, n);
      const top = -b.h / 2; icon(g, 'search', -b.w / 2 + 52, top + 54, 30, I.sub, 2); txt(g, I, typed || 'Type a command…', -b.w / 2 + 88, top + 54, 30, { a: 'left', w: typed ? 600 : 500, c: typed ? I.ink : I.sub });
      if (I.osc(1.25) > 0) { const cx = -b.w / 2 + 88 + (typed ? tw(g, I, typed, 30) + 4 : 0); g.fillStyle = I.ink; g.fillRect(cx, top + 36, 2.5, 36); }
      txt(g, I, '⌘K', b.w / 2 - 50, top + 54, 22, { a: 'right', w: 500, c: I.sub });
      g.fillStyle = I.sub; alpha(g, 0.25, () => g.fillRect(-b.w / 2, top + 104, b.w, 1.5));
      const list = items.filter(x => x.toLowerCase().includes(typed.toLowerCase())).slice(0, 4), ent = I.acts.find(a => a.type === 'click' && a.enter && I.T >= a.t), flash = ent ? 1 - smooth((I.T - ent.t) / 0.4) : 0;
      list.forEach((x, i) => { const y = top + 150 + i * 70; if (i === 0) { g.fillStyle = css(mix(mix(I.paperC, I.inkC, 0.08), I.accC, flash * 0.6)); rr(g, -b.w / 2 + 16, y - 30, b.w - 32, 60, 14); g.fill(); } icon(g, i === 0 ? 'arrow' : 'sparkle', -b.w / 2 + 56, y, 26, i === 0 ? I.ink : I.sub, 1.8); txt(g, I, x, -b.w / 2 + 90, y, 26, { a: 'left', w: i === 0 ? 600 : 500, c: i === 0 ? I.ink : I.sub }); });
    } },
    toast: { name: 'Toast', size: [560, 104, 52], fill: 'ink', draw(g, S, b, I) { const x = -b.w / 2 + 52; g.fillStyle = I.acc; g.beginPath(); g.arc(x, 0, 24, 0, Math.PI * 2); g.fill(); icon(g, S.icon || 'check', x, 0, 26, I.accInk, 2.4, easeOut((I.lt - 0.1) / 0.3)); txt(g, I, S.text || 'Saved to your tribe', x + 46, 0, 28, { a: 'left' }); } },
    card: { name: 'Card', size: [640, 380, 36], fill: 'paper', draw(g, S, b, I) {
      const L = -b.w / 2 + 48, top = -b.h / 2 + 48; g.fillStyle = I.acc; rr(g, L, top, 72, 72, 20); g.fill(); icon(g, S.icon || 'bolt', L + 36, top + 36, 36, I.accInk, 2);
      txt(g, I, S.title || 'New feature', L, top + 120, 36, { a: 'left', b: 'top' }); wrap(g, I, S.body || 'Describe what changed in one or two short lines.', 26, b.w - 96).slice(0, 3).forEach((l, i) => alpha(g, smooth((I.lt - 0.12 - i * 0.07) / 0.25), () => txt(g, I, l, L, top + 176 + i * 38, 26, { a: 'left', b: 'top', w: 500, c: I.sub })));
    } },
    notif: { name: 'Notification', size: [720, 150, 40], fill: 'paper', draw(g, S, b, I) {
      const L = -b.w / 2 + 34; g.fillStyle = I.acc; rr(g, L, -36, 72, 72, 18); g.fill(); icon(g, S.icon || 'bell', L + 36, 0, 34, I.accInk, 2);
      txt(g, I, S.title || 'Maya approved your change', L + 98, -18, 28, { a: 'left' }); txt(g, I, S.body || 'Pixel Quest · tap to see it live', L + 98, 20, 22, { a: 'left', w: 500, c: I.sub }); txt(g, I, 'now', b.w / 2 - 34, -18, 20, { a: 'right', w: 500, c: I.sub });
    } },
    logo: { name: 'Logo', size: [520, 520, 260], fill: 'ink', draw(g, S, b, I) {
      const p = easeOut((I.lt - 0.05) / 0.9), hasText = !!S.text, my = hasText ? -40 : 0; icon(g, S.mark || 'flame', 0, my, Math.min(b.w, b.h) * 0.42, I.ink, 2.2, p);
      if (hasText) { const s = S.text, size = 46, w = tw(g, I, s, size, 700); let x = -w / 2; for (let i = 0; i < s.length; i++) { const cw = tw(g, I, s[i], size, 700), u = step(I.lt - 0.45 - i * 0.035, I.k, 0.9); alpha(g, u, () => txt(g, I, s[i], x + cw / 2, my + 170 + (1 - u) * 24, size, { w: 700 })); x += cw; } }
    } },
    wordmark: { name: 'Wordmark', size: [820, 220, 40], fill: 'none', draw(g, S, b, I) {
      const s = S.text || 'TribeCode', size = S.fs || 110;
      if (S.style === 'type') { const n = clamp(Math.floor((I.lt - 0.1) / 0.07), 0, s.length), part = s.slice(0, n); txt(g, I, part, -tw(g, I, s, size, 800) / 2, 0, size, { a: 'left', w: 800 }); if (I.osc(1.25) > 0 || n < s.length) { g.fillStyle = I.acc; g.fillRect(-tw(g, I, s, size, 800) / 2 + tw(g, I, part, size, 800) + 6, -size * 0.45, 8, size * 0.9); } return; }
      const w = tw(g, I, s, size, 800); let x = -w / 2; for (let i = 0; i < s.length; i++) { const cw = tw(g, I, s[i], size, 800), u = step(I.lt - 0.04 * i, I.k * 1.2, 0.88); g.save(); g.beginPath(); g.rect(-b.w, -size * 0.62, b.w * 2, size * 1.24); g.clip(); txt(g, I, s[i], x + cw / 2, (1 - u) * size, size, { w: 800, c: i === S.hi ? I.acc : I.ink }); g.restore(); x += cw; }
    } },
    word: { name: 'Words', size: [1100, 300, 0], fill: 'none', draw(g, S, b, I) {
      const size = S.fs || 150, words = String(S.text || 'Build it together').split(' '), lines = []; let line = [];
      for (const w of words) { const t = line.concat(w).join(' '); if (line.length && tw(g, I, t, size, 800) > b.w * 0.95) { lines.push(line); line = [w]; } else line.push(w); } if (line.length) lines.push(line);
      let k = 0; lines.forEach((ln, li) => { const full = ln.join(' '), w = tw(g, I, full, size, 800); let x = -w / 2; const y = (li - (lines.length - 1) / 2) * size * 1.05;
        ln.forEach(wd => { const ww = tw(g, I, wd, size, 800), u = step(I.lt - k * (S.gap || 0.09), I.k, 0.9); g.save(); g.beginPath(); g.rect(x - 10, y - size * 0.62, ww + 20, size * 1.24); g.clip(); txt(g, I, wd, x + ww / 2, y + (1 - u) * size * 0.9, size, { w: 800, c: S.hi != null && k === S.hi ? I.acc : I.ink }); g.restore(); x += ww + tw(g, I, ' ', size, 800); k++; }); });
    } },
    list: { name: 'List', size: [760, 520, 40], fill: 'paper', draw(g, S, b, I) {
      const items = S.items || ['Click anything to edit', 'Your AI and your friends', 'Nothing ships without a yes'], vals = S.vals, top = -b.h / 2 + 60, L = -b.w / 2 + 50;
      if (S.title) txt(g, I, S.title, L, top, 32, { a: 'left' });
      const y0 = top + (S.title ? 80 : 30), gap = Math.min(96, (b.h / 2 - 40 - y0) / Math.max(1, items.length - 1) + 0);
      items.forEach((x, i) => { const u = step(I.lt - 0.1 - i * 0.12, I.k, 0.9), y = y0 + i * gap; alpha(g, u, () => { g.save(); g.translate((1 - u) * 30, 0);
        if (vals) { txt(g, I, `${i + 1}`, L + 10, y, 26, { c: I.sub }); txt(g, I, x, L + 50, y, 28, { a: 'left' }); const w = (b.w - 380) * vals[i] / Math.max(...vals) * u; g.fillStyle = i === 0 ? I.acc : I.inkSolid; rr(g, b.w / 2 - 50 - w, y - 9, w, 18, 9); g.fill(); }
        else { g.fillStyle = I.acc; g.beginPath(); g.arc(L + 18, y, 18, 0, Math.PI * 2); g.fill(); icon(g, 'check', L + 18, y, 22, I.accInk, 2.4); txt(g, I, x, L + 54, y, 30, { a: 'left' }); } g.restore(); }); });
    } },
    stat: { name: 'Stat', size: [760, 420, 44], fill: 'paper', draw(g, S, b, I) {
      const v = S.value != null ? S.value : 12480, f = S.from || 0, u = step(I.lt - 0.05, I.k * 0.35, 1), n = Math.round(lerp(f, v, u));
      txt(g, I, `${S.prefix || ''}${n.toLocaleString('en-US')}${S.suffix || ''}`, 0, -20, S.fs || 132, { w: 800 }); txt(g, I, S.label || 'games played this week', 0, 90, 30, { w: 500, c: I.sub });
    } },
    ring: { name: 'Progress ring', size: [480, 480, 240], fill: 'paper', draw(g, S, b, I) {
      const v = S.value != null ? S.value : 0.82, r = Math.min(b.w, b.h) * 0.34, u = step(I.lt - 0.05, I.k * 0.4, 1); g.lineWidth = 26; g.lineCap = 'round';
      g.strokeStyle = I.sub; alpha(g, 0.2, () => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }); g.strokeStyle = I.acc; g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v * u); g.stroke();
      txt(g, I, `${Math.round(v * 100 * u)}%`, 0, -8, 76, { w: 800 }); txt(g, I, S.label || 'of the way there', 0, 52, 22, { w: 500, c: I.sub });
    } },
    phone: { name: 'Phone', size: [400, 820, 64], fill: 'ink', draw(g, S, b, I) {
      const inset = 14, sx = -b.w / 2 + inset, sy = -b.h / 2 + inset, sw = b.w - inset * 2, sh = b.h - inset * 2, n = Math.max(1, (S.screens || []).length || 3);
      const idx = channel([{ t: -1e6, to: 0 }].concat(I.acts.filter(a => a.type === 'click').map((a, i) => ({ t: a.t, to: (i + 1) % n }))), I.T, { k: I.k, z: 0.92 });
      g.save(); rr(g, sx, sy, sw, sh, Math.max(8, b.r - inset)); g.clip();
      for (let i = 0; i < n; i++) { const x = sx + (i - idx) * sw; if (x > sx + sw || x + sw < sx) continue; const src = (S.screens || [])[i]; const im = src && I.img(src); if (im) coverImg(g, im, x, sy, sw, sh); else screenMock(g, I, x, sy, sw, sh, i, !!S.dark); }
      g.restore(); g.fillStyle = I.inkSolidRaw; rr(g, -50, sy + 16, 100, 30, 15); g.fill();
      if (S.caption) txt(g, I, S.caption, 0, b.h / 2 + 70, 36, { c: I.ink0 });
    } },
    image: { name: 'Picture tour', size: [1080, 720, 28], fill: 'paper', draw(g, S, b, I) {
      const regs = S.regions || [{ x: 0, y: 0, z: 1 }, { x: -0.25, y: -0.2, z: 1.8 }, { x: 0.22, y: 0.18, z: 2 }, { x: 0, y: 0, z: 1 }], at = I.acts.filter(a => a.type === 'focus');
      const ch = key => channel([{ t: -1e6, to: regs[0][key] }].concat(at.map((a, i) => ({ t: a.t, to: (regs[i + 1] || regs[0])[key] }))), I.T, { k: I.k * 0.6, z: 1 });
      const z = ch('z'), x = ch('x'), y = ch('y'); g.save(); rr(g, -b.w / 2, -b.h / 2, b.w, b.h, b.r); g.clip(); g.scale(z, z); g.translate(-x * b.w, -y * b.h);
      const im = S.src && I.img(S.src); if (im) coverImg(g, im, -b.w / 2, -b.h / 2, b.w, b.h); else screenMock(g, I, -b.w / 2, -b.h / 2, b.w, b.h, 1, false); g.restore();
    } },
    wipe: { name: 'Before and after', size: [1080, 720, 28], fill: 'paper', draw(g, S, b, I) {
      const d = dragValue(I.acts, I.T, 0.5, x => clamp(x / b.w + 0.5, 0.02, 0.98), I), cut = -b.w / 2 + b.w * d;
      const draw1 = (src, seed, dark) => { const im = src && I.img(src); if (im) coverImg(g, im, -b.w / 2, -b.h / 2, b.w, b.h); else screenMock(g, I, -b.w / 2, -b.h / 2, b.w, b.h, seed, dark); };
      g.save(); rr(g, -b.w / 2, -b.h / 2, b.w, b.h, b.r); g.clip(); draw1(S.b, 2, false); g.beginPath(); g.rect(-b.w / 2, -b.h / 2, cut + b.w / 2, b.h); g.clip(); draw1(S.a, 0, true); g.restore();
      g.fillStyle = I.paperCss; g.fillRect(cut - 2, -b.h / 2, 4, b.h); g.beginPath(); g.arc(cut, 0, 30, 0, Math.PI * 2); g.fill(); icon(g, 'arrow', cut, 0, 28, I.inkSolid, 2);
      txt(g, I, S.la || 'Before', -b.w / 2 + 28, -b.h / 2 + 40, 24, { a: 'left', c: I.paperCss }); txt(g, I, S.lb || 'After', b.w / 2 - 28, -b.h / 2 + 40, 24, { a: 'right', c: I.inkSolid });
    } },
    post: { name: 'Social post', size: [860, 520, 40], fill: 'paper', draw(g, S, b, I) {
      const L = -b.w / 2 + 48, top = -b.h / 2 + 52; g.fillStyle = I.acc; g.beginPath(); g.arc(L + 32, top + 32, 32, 0, Math.PI * 2); g.fill(); txt(g, I, (S.name || 'Your name')[0], L + 32, top + 33, 30, { w: 700, c: I.accInk });
      txt(g, I, S.name || 'Your name', L + 82, top + 16, 28, { a: 'left', w: 700 }); txt(g, I, S.handle || '@yourhandle · now', L + 82, top + 50, 22, { a: 'left', w: 500, c: I.sub });
      wrap(g, I, S.text || 'We built a game this weekend with three friends and three AIs. Nobody touched a terminal.', 32, b.w - 96).slice(0, 5).forEach((l, i) => alpha(g, smooth((I.lt - 0.1 - i * 0.08) / 0.25), () => txt(g, I, l, L, top + 110 + i * 46, 32, { a: 'left', b: 'top', w: 500 })));
      const likes = Math.round((S.likes || 1240) * step(I.lt - 0.6, I.k * 0.3, 1)), y = b.h / 2 - 48; [['chat', '86'], ['repost', '212'], ['heart', likes.toLocaleString('en-US')], ['share', '']].forEach(([ic, n], i) => { const x = L + i * 170; icon(g, ic, x + 14, y, 28, i === 2 ? I.acc : I.sub, 2); if (n) txt(g, I, n, x + 40, y, 22, { a: 'left', w: 500, c: I.sub }); });
    } },
    quote: { name: 'Quote', size: [960, 560, 40], fill: 'paper', draw(g, S, b, I) {
      const L = -b.w / 2 + 70; txt(g, I, '“', L - 6, -b.h / 2 + 90, 140, { a: 'left', w: 800, c: I.acc });
      wrap(g, I, S.text || 'Add a real quote here, in the words someone actually used.', 44, b.w - 140, 600).slice(0, 4).forEach((l, i) => { const u = step(I.lt - 0.1 - i * 0.12, I.k, 0.9); alpha(g, u, () => txt(g, I, l, L, -b.h / 2 + 150 + i * 60 + (1 - u) * 20, 44, { a: 'left', b: 'top' })); });
      alpha(g, smooth((I.lt - 0.6) / 0.3), () => txt(g, I, S.who || '— Name, role', L, b.h / 2 - 60, 26, { a: 'left', w: 500, c: I.sub }));
    } },
    poll: { name: 'Poll', size: [800, 520, 40], fill: 'paper', draw(g, S, b, I) {
      const opts = S.opts || [['Platformer', 46], ['Puzzle', 31], ['Racing', 23]], L = -b.w / 2 + 48, W = b.w - 96, top = -b.h / 2 + 60, voted = I.acts.some(a => a.type === 'click' && I.T >= a.t), vt = (I.acts.find(a => a.type === 'click') || { t: 1e9 }).t;
      txt(g, I, S.q || 'What should we build next?', L, top, 32, { a: 'left' });
      opts.forEach(([t, v], i) => { const y = top + 80 + i * 100, u = voted ? step(I.T - vt - i * 0.05, I.k * 0.7, 0.95) : 0; g.strokeStyle = I.sub; g.lineWidth = 2; rr(g, L, y, W, 72, 18); alpha(g, 0.5, () => g.stroke()); g.fillStyle = i === (S.pick || 0) ? I.acc : css(mix(I.paperC, I.inkC, 0.12)); rr(g, L, y, W * v / 100 * u, 72, 18); g.fill();
        txt(g, I, t, L + 24, y + 36, 28, { a: 'left' }); alpha(g, u, () => txt(g, I, `${Math.round(v * u)}%`, L + W - 24, y + 36, 26, { a: 'right' })); });
    } },
    count: { name: 'Countdown', size: [420, 420, 210], fill: 'ink', draw(g, S, b, I) { const f = S.from || 3, beat = 60 / I.bpm, k = clamp(Math.floor(I.lt / beat), 0, f), lt = I.lt - k * beat, u = step(lt, I.k * 1.3, 0.85); const s = k >= f ? (S.go || 'Go') : String(f - k); g.save(); g.scale(0.7 + 0.3 * u, 0.7 + 0.3 * u); alpha(g, u, () => txt(g, I, s, 0, 6, s.length > 2 ? 110 : 190, { w: 800 })); g.restore(); } },
    lower: { name: 'Lower third', size: [860, 170, 14], fill: 'paper', draw(g, S, b, I) {
      const u = easeOut((I.lt - 0.05) / 0.45), L = -b.w / 2; g.fillStyle = I.acc; g.fillRect(L, -b.h / 2, 12, b.h);
      g.save(); g.beginPath(); g.rect(L + 12, -b.h / 2, (b.w - 12) * u, b.h); g.clip(); txt(g, I, S.name || 'Ana Ruiz', L + 48, -24, 48, { a: 'left', w: 700 }); txt(g, I, S.role || 'Game designer · Pixel Quest', L + 48, 34, 30, { a: 'left', w: 500, c: I.sub }); g.restore();
    } },
    caption: { name: 'Captions', size: [1000, 200, 24], fill: 'none', draw(g, S, b, I) {
      const words = String(S.text || 'we made this game in one weekend').split(' '), dur = Math.max(0.5, (S.hold || 4) * 60 / I.bpm), per = dur / words.length, cur = clamp(Math.floor(I.lt / per), 0, words.length - 1), size = S.fs || 64, style = S.style || 'karaoke';
      const lines = []; let ln = []; for (const w of words) { if (ln.length && tw(g, I, ln.concat(w).join(' '), size, 800) > b.w * 0.9) { lines.push(ln); ln = [w]; } else ln.push(w); } if (ln.length) lines.push(ln);
      let k = 0; lines.forEach((l, li) => { const full = l.join(' ').toUpperCase(), w = tw(g, I, full, size, 800); let x = -w / 2; const y = (li - (lines.length - 1) / 2) * size * 1.2;
        l.forEach(wd => { const W = wd.toUpperCase(), ww = tw(g, I, W, size, 800), on = k === cur, past = k <= cur, u = on ? step(I.lt - k * per, I.k * 1.5, 0.85) : 1;
          if (style === 'pill' && on) { g.fillStyle = I.acc; rr(g, x - 12, y - size * 0.62, ww + 24, size * 1.24, size * 0.3); g.fill(); }
          if (style === 'outline') { g.lineWidth = 10; g.strokeStyle = I.inkSolidRaw; g.lineJoin = 'round'; g.font = `800 ${size}px ${I.font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; alpha(g, past ? 1 : 0.35, () => g.strokeText(W, x + ww / 2, y)); }
          g.save(); g.translate(x + ww / 2, y); g.scale(on ? 1 + 0.08 * (1 - u) : 1, on ? 1 + 0.08 * (1 - u) : 1); alpha(g, past ? 1 : (style === 'karaoke' ? 0.35 : 0.5), () => txt(g, I, W, 0, 0, size, { w: 800, c: style === 'karaoke' && on ? I.acc : style === 'pill' && on ? I.accInk : style === 'outline' ? I.paperCss : I.ink })); g.restore();
          x += ww + tw(g, I, ' ', size, 800); k++; }); });
    } },
    badge: { name: 'Badge', size: [320, 100, 50], fill: 'ink', draw(g, S, b, I) { const live = S.live !== false; const x = -b.w / 2 + 44; if (live) { const p = 0.5 + 0.5 * Math.sin(I.T * Math.PI * 2 * I.bpm / 60); g.fillStyle = css(hex('#FF6F8E')); g.beginPath(); g.arc(x, 0, 10 + 2 * p, 0, Math.PI * 2); g.fill(); } else icon(g, S.icon || 'pin', x, 0, 30, I.acc, 2); txt(g, I, S.text || 'LIVE', x + 28, 0, 30, { a: 'left', w: 700, track: 2 }); } },
    scene: { name: 'Full frame', size: [1440, 1440, 0], fill: 'accent', draw(g, S, b, I) { if (S.title) { const u = step(I.lt - 0.15, I.k, 0.9); alpha(g, u, () => txt(g, I, S.title, 0, (1 - u) * 40 - (S.sub ? 30 : 0), S.fs || 110, { w: 800 })); } if (S.sub) alpha(g, smooth((I.lt - 0.35) / 0.3), () => txt(g, I, S.sub, 0, 70, 34, { w: 500, c: I.sub })); } },
    appicon: { name: 'App icon', size: [400, 400, 92], fill: 'accent', draw(g, S, b, I) { const p = easeOut((I.lt - 0.1) / 0.8); icon(g, S.mark || 'bolt', 0, 0, Math.min(b.w, b.h) * 0.56, I.ink, 2, p); if (S.text) alpha(g, smooth((I.lt - 0.7) / 0.3), () => txt(g, I, S.text, 0, b.h / 2 + 64, 40, { c: I.ink0 })); } },
    endcard: { name: 'End card', size: [880, 420, 44], fill: 'ink', draw(g, S, b, I) {
      icon(g, S.mark || 'flame', 0, -96, 72, I.acc, 2.2, easeOut((I.lt - 0.05) / 0.6)); const u = step(I.lt - 0.25, I.k, 0.9); alpha(g, u, () => txt(g, I, S.title || 'Made with TribeCode', 0, 10 + (1 - u) * 20, 52, { w: 800 }));
      const cta = S.cta || 'Remix it at tribecode.org', w = tw(g, I, cta, 26) + 56, v = step(I.lt - 0.5, I.k, 0.9); alpha(g, v, () => { g.strokeStyle = I.sub; g.lineWidth = 2; rr(g, -w / 2, 76, w, 64, 32); g.stroke(); txt(g, I, cta, 0, 108, 26, { w: 600 }); });
    } },
  };
  function coverImg(g, im, x, y, w, h) { const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height; if (!iw || !ih) return; const s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s; g.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }

  // ---------- doc ----------
  const THEMES = {
    warm: { bg: '#E9E6E1', ink: '#111111', paper: '#FFFFFF', accent: '#F26B1D', muted: '#8A867F' },
    night: { bg: '#12151A', ink: '#F4F2EE', paper: '#1E242D', accent: '#38C6B1', muted: '#8B93A1' },
    paper: { bg: '#FAFAF8', ink: '#111111', paper: '#FFFFFF', accent: '#111111', muted: '#8A8A8A' },
    ink: { bg: '#0B0B0C', ink: '#FFFFFF', paper: '#1A1A1C', accent: '#FFFFFF', muted: '#8E8E93' },
  };
  const ASPECTS = { '1:1': [1440, 1440], '9:16': [1080, 1920], '16:9': [1920, 1080], '4:5': [1080, 1350] };
  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    const th = { ...THEMES.warm, ...(THEMES[d.themeName] || {}), ...(d.theme || {}) };
    const size = d.size && d.size.w ? { w: num(d.size.w, 1440, 64, 4096), h: num(d.size.h, 1440, 64, 4096) } : { w: 1440, h: 1440 };
    const out = {
      v: VERSION, name: String(d.name || 'Motion graphic').slice(0, 80), template: String(d.template || ''), aspect: ASPECTS[d.aspect] ? d.aspect : aspectOf(size), size,
      bpm: num(d.bpm, 120, 40, 240), bars: num(d.bars, 4, 1, 64), beatsPerBar: num(d.beatsPerBar, 4, 2, 8), offset: num(d.offset, 0, 0, 30), loop: d.loop !== false,
      theme: th, themeName: d.themeName || '', font: String(d.font || 'Inter, "Geist", system-ui, -apple-system, "Segoe UI", sans-serif'),
      spring: { k: num(d.spring && d.spring.k, 220, 40, 900), z: num(d.spring && d.spring.z, 0.86, 0.7, 1.2) },
      swap: { blur: num(d.swap && d.swap.blur, 10, 0, 30), enter: num(d.swap && d.swap.enter, 0.2, 0.05, 0.8), out: num(d.swap && d.swap.out, 0.1, 0.03, 0.5) },
      camera: { strength: num(d.camera && d.camera.strength, 0.5, 0, 1), fill: num(d.camera && d.camera.fill, 0.66, 0.2, 0.95) },
      cursor: d.cursor !== false, blur: { n: num(d.blur && d.blur.n, 0, 0, 16) }, feel: String(d.feel || ''), sounds: d.sounds !== false,
      backdrop: d.backdrop && typeof d.backdrop === 'object' ? { kind: ['scene', 'image', 'grid'].includes(d.backdrop.kind) ? d.backdrop.kind : 'solid', src: String(d.backdrop.src || '') } : null,
      music: d.music && typeof d.music === 'object' ? { name: String(d.music.name || '').slice(0, 120), src: String(d.music.src || '').slice(0, 400), by: String(d.music.by || '').slice(0, 60) } : null,
      thumbAt: num(d.thumbAt, -1, -1, 999), images: d.images && typeof d.images === 'object' ? d.images : {}, rev: d.rev || 0,
      states: (Array.isArray(d.states) ? d.states : []).slice(0, 80).map(cleanState).filter(Boolean).sort((a, b) => a.at - b.at),
    };
    if (!out.states.length) out.states = [cleanState({ kind: 'button', at: 0 })];
    return out;
  }
  function aspectOf(s) { for (const [k, v] of Object.entries(ASPECTS)) if (v[0] === s.w && v[1] === s.h) return k; return 'custom'; }
  function cleanState(s) {
    if (!s || !KINDS[s.kind]) return null; const K = KINDS[s.kind], o = { ...s };
    o.at = num(s.at, 0, 0, 999); o.id = String(s.id || (s.kind + '-' + Math.round(o.at * 100)));
    const [w, h, r] = K.size; o.w = num(s.w, w, 0, 6000); o.h = num(s.h, h, 0, 6000); o.r = num(s.r, r, 0, 3000); o.fill = s.fill || K.fill; o.cx = num(s.cx, 0, -3000, 3000); o.cy = num(s.cy, 0, -3000, 3000);
    o.acts = (Array.isArray(s.acts) ? s.acts : []).slice(0, 24).map(a => ({ ...a, type: ['click', 'drag', 'hover', 'type', 'focus'].includes(a.type) ? a.type : 'click', at: num(a.at, o.at, 0, 999), until: a.until != null ? num(a.until, o.at, 0, 999) : undefined }));
    return o;
  }
  const beatSec = (d, b) => d.offset + b * 60 / d.bpm;
  const duration = d => { d = d.states ? d : normalize(d); return d.bars * d.beatsPerBar * 60 / d.bpm; };

  // ---------- the plan: channels built once per doc revision ----------
  const CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function plan(d) {
    const key = d.rev + ':' + d.states.length + ':' + d.bpm + ':' + d.offset + ':' + d.bars + ':' + d.loop + ':' + d.spring.k + ':' + d.spring.z + ':' + d.camera.strength + ':' + d.size.w + 'x' + d.size.h;
    const hit = CACHE && CACHE.get(d); if (hit && hit.key === key) return hit;
    const dur = duration(d), th = d.theme, L = d.loop, o = { loop: L, dur, k: d.spring.k, z: d.spring.z };
    const ST = d.states.map((s, i) => ({ s, i, t: beatSec(d, s.at), acts: s.acts.map(a => ({ ...a, t: beatSec(d, a.at), t1: a.until != null ? beatSec(d, a.until) : beatSec(d, a.at) })) }));
    const fit = Math.min(d.size.w, d.size.h) / 1440;
    // the camera zooms so each state fills the frame: strength 0 = still, 1 = every state fills the same share of the frame
    const zoomFor = s => { if (!d.camera.strength) return 1; const big = Math.max(s.w, s.h * (d.size.w / d.size.h)) || 1; return clamp(Math.pow((d.camera.fill * 1440) / big, 0.4 + 0.6 * d.camera.strength), 0.6, 4.5); };
    const ev = f => ST.map(x => ({ t: x.t, to: f(x.s) }));
    const C = {
      w: ev(s => s.w), h: ev(s => s.h), r: ev(s => s.r), cx: ev(s => s.cx), cy: ev(s => s.cy), zoom: ev(zoomFor),
      fr: ev(s => colorOf(s.fill === 'none' ? 'bg' : s.fill, th)[0]), fg: ev(s => colorOf(s.fill === 'none' ? 'bg' : s.fill, th)[1]), fb: ev(s => colorOf(s.fill === 'none' ? 'bg' : s.fill, th)[2]), fa: ev(s => s.fill === 'none' ? 0 : 1),
    };
    // the cursor: it arrives a little before each act and holds while it drags
    const lead = 0.26, cx = [], cy = [], press = [];
    for (const x of ST) for (const a of x.acts) {
      const ox = x.s.cx, oy = x.s.cy;
      if (a.type === 'type' || a.type === 'focus') continue;
      const X0 = (a.x0 != null ? a.x0 : (a.x || 0)) + ox, Y0 = (a.y0 != null ? a.y0 : (a.y || 0)) + oy;
      cx.push({ t: a.t - lead, to: X0, k: 140, z: 0.95 }); cy.push({ t: a.t - lead, to: Y0, k: 140, z: 0.95 });
      if (a.type === 'drag' || a.type === 'hover') {
        const X1 = a.x1 + ox, Y1 = (a.y1 != null ? a.y1 : a.y0) + oy;
        cx.push({ t: a.t, t1: a.t1, path: u => lerp(X0, X1, easeIO(u)) }); cy.push({ t: a.t, t1: a.t1, path: u => lerp(Y0, Y1, easeIO(u)) });
        if (a.type === 'drag') { press.push({ t: a.t, to: 1, k: 900, z: 1 }); press.push({ t: a.t1, to: 0, k: 600, z: 1 }); }
      } else { press.push({ t: a.t - 0.02, to: 1, k: 900, z: 1 }); press.push({ t: a.t + 0.08, to: 0, k: 500, z: 1 }); }
    }
    const sortT = a => a.sort((x, y) => x.t - y.t);
    const rest = { x: 520, y: 520 };
    if (!cx.length) { cx.push({ t: 0, to: rest.x }); cy.push({ t: 0, to: rest.y }); }
    const shapePress = []; for (const x of ST) for (const a of x.acts) if (a.type === 'click' && !a.soft) { shapePress.push({ t: a.t - 0.02, to: 0.965, k: 700, z: 1 }); shapePress.push({ t: a.t + 0.07, to: 1, k: 260, z: 0.8 }); }
    const P = { key, dur, fit, ST, C, o, cx: sortT(cx), cy: sortT(cy), press: sortT(press), sp: sortT(shapePress), hasCursor: d.cursor && ST.some(x => x.acts.some(a => a.type !== 'type' && a.type !== 'focus')) };
    if (CACHE) CACHE.set(d, P); return P;
  }

  // ---------- seek: every drawn value at time t ----------
  function seek(doc, t) {
    const d = doc && doc.states && doc.theme && doc.spring ? doc : normalize(doc), P = plan(d), dur = P.dur;
    const T = d.loop ? ((t % dur) + dur) % dur : clamp(t, 0, dur);
    const ch = (evs, base = 0, more) => channel(evs, T, { ...P.o, base, ...(more || {}) });
    // the active state, cyclic when looping
    let ai = -1; for (let i = 0; i < P.ST.length; i++) if (P.ST[i].t <= T + 1e-9) ai = i;
    let start, prevIdx;
    if (ai < 0) { ai = d.loop ? P.ST.length - 1 : 0; start = d.loop ? P.ST[ai].t - dur : 0; prevIdx = d.loop && P.ST.length > 1 ? ai - 1 : -1; }
    else { start = P.ST[ai].t; prevIdx = ai > 0 ? ai - 1 : (d.loop && P.ST.length > 1 ? P.ST.length - 1 : -1); }
    const cur = P.ST[ai], prev = prevIdx >= 0 ? P.ST[prevIdx] : null;
    const shape = { w: ch(P.C.w), h: ch(P.C.h), r: ch(P.C.r), x: ch(P.C.cx), y: ch(P.C.cy), fill: [ch(P.C.fr), ch(P.C.fg), ch(P.C.fb)], a: clamp(ch(P.C.fa), 0, 1), press: P.sp.length ? channel(P.sp, T, { ...P.o, base: 1 }) : 1 };
    const zoom = ch(P.C.zoom, 1);
    const cursor = P.hasCursor ? { x: channel(P.cx, T, { ...P.o, k: 140, z: 0.95 }), y: channel(P.cy, T, { ...P.o, k: 140, z: 0.95 }), press: P.press.length ? clamp(channel(P.press, T, { ...P.o, base: 0 }), 0, 1) : 0 } : null;
    const lt = T - start, sw = d.swap;
    const enter = smooth((lt - sw.out * 0.6) / sw.enter), leave = prev ? 1 - smooth(lt / sw.out) : 0;
    const f = { t: T, dur, beat: (T - d.offset) * d.bpm / 60, zoom, fit: P.fit, shape, cursor, cur: { st: cur, lt, a: enter, blur: (1 - enter) * sw.blur }, prev: prev && leave > 0.001 ? { st: prev, lt: T - (prev.t > T ? prev.t - dur : prev.t), a: leave, blur: (1 - leave) * sw.blur } : null, doc: d, mod: {} };
    // a kind may stretch the shape (the volume slider past its maximum) or tint it (the toggle turning on)
    const KC = KINDS[cur.s.kind]; if (KC && KC.shape) { try { f.mod = KC.shape.call(KC, cur.s, info(d, f, { acts: cur.acts }, lt, shape.fill)) || {}; } catch { f.mod = {}; } }
    return f;
  }

  // ---------- draw ----------
  const IMG = {};
  function load(doc) {
    const d = normalize(doc), srcs = new Set();
    for (const s of d.states) { (s.screens || []).forEach(x => x && srcs.add(x)); ['src', 'a', 'b'].forEach(k => typeof s[k] === 'string' && s[k] && srcs.add(s[k])); }
    if (d.backdrop && d.backdrop.src) srcs.add(d.backdrop.src);
    if (typeof Image === 'undefined') return Promise.resolve();
    return Promise.all([...srcs].map(src => IMG[src] && IMG[src].complete ? null : new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = im.onerror = () => res(); im.src = (d.images && d.images[src]) || src; IMG[src] = im; })));
  }
  const imgOf = src => { const im = IMG[src]; return im && im.complete && im.naturalWidth ? im : null; };
  function info(d, f, S, lt, contentFill) {
    const th = d.theme, fill = contentFill, dark = lum(fill) < 0.55, inkC = hex(th.ink), paperC = hex(th.paper), accC = hex(th.accent), bgC = hex(th.bg);
    const on = dark ? (lum(paperC) > 0.5 ? paperC : inkC) : (lum(inkC) < 0.5 ? inkC : paperC);
    const accInk = lum(accC) > 0.6 ? [17, 17, 17] : [255, 255, 255];
    const P = plan(d);
    return { lt, T: f.t, t0: f.t - lt, bpm: d.bpm, k: d.spring.k, z: d.spring.z, font: d.font, theme: th, acts: S.acts,
      ink: css(on), sub: css(mix(on, fill, 0.45)), acc: css(accC), accInk: css(accInk), accC, inkC: on, paperC: fill, paperCss: css(fill), inkSolid: css(on), inkSolidRaw: css(dark ? fill : on), inkC0: css(fill),
      ink0: css(lum(bgC) < 0.5 ? paperC : inkC), img: imgOf, P,
      // a periodic wiggle whose period divides the loop, so frame 0 equals the last frame
      osc: (hz, ph = 0) => { const n = Math.max(1, Math.round(hz * P.dur)); return Math.sin(2 * Math.PI * n / P.dur * f.t + ph); } };
  }
  function drawBackdrop(g, d, W, H) {
    const th = d.theme; g.fillStyle = th.bg; g.fillRect(0, 0, W, H);
    const b = d.backdrop; if (!b) return;
    if (b.kind === 'image' && b.src && imgOf(b.src)) { coverImg(g, imgOf(b.src), 0, 0, W, H); return; }
    if (b.kind === 'grid') { g.strokeStyle = css(mix(hex(th.bg), hex(th.ink), 0.08)); g.lineWidth = 1; const s = Math.min(W, H) / 18; for (let x = (W % s) / 2; x < W; x += s) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = (H % s) / 2; y < H; y += s) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } return; }
    if (b.kind === 'scene') {   // a calm flat landscape behind lower thirds and captions
      const bg = hex(th.bg), ink = hex(th.ink), acc = hex(th.accent); g.fillStyle = css(mix(bg, acc, 0.25)); g.beginPath(); g.arc(W * 0.7, H * 0.36, Math.min(W, H) * 0.12, 0, Math.PI * 2); g.fill();
      [[0.62, 0.12], [0.7, 0.2], [0.8, 0.3]].forEach(([y, m], i) => { g.fillStyle = css(mix(bg, ink, m)); g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += W / 24) g.lineTo(x, H * y + Math.sin(x / W * 6 + i * 2) * H * 0.03); g.lineTo(W, H); g.closePath(); g.fill(); });
    }
  }
  function drawContent(g, d, f, part, box, fillC) {
    const S = part.st.s, K = KINDS[S.kind]; if (!K || !K.draw) return;
    const I = info(d, f, { acts: part.st.acts }, part.lt, fillC);
    g.save(); g.globalAlpha *= part.a;
    if (part.blur > 0.3 && 'filter' in g && !d._noBlur) g.filter = `blur(${(part.blur * f.zoom * f.fit).toFixed(2)}px)`;
    try { K.draw.call(K, g, S, box, I); } catch (e) { /* a broken state never stops the frame */ }
    g.restore();
  }
  const CURSOR = [[0, 0], [0, 34], [9, 26], [15, 40], [21, 37], [15, 24], [27, 24]];
  function drawFrame(g, d, f, W, H) {
    drawBackdrop(g, d, W, H);
    const s = f.shape, K = KINDS[f.cur.st.s.kind] || {}, P = plan(d);
    // a kind may stretch the shape (the volume slider past its maximum) or tint it (the toggle turning on)
    const m = f.mod || {}, dw = m.dw || 0, dh = m.dh || 0, dx = m.dx || 0; let fill = s.fill; if (m.fillMix != null) fill = mix(s.fill, hex(d.theme.accent), m.fillMix); void K;
    g.save(); g.translate(W / 2, H / 2); g.scale(f.fit * f.zoom, f.fit * f.zoom); g.translate(s.x, s.y);
    g.save(); g.scale(s.press, s.press);
    const box = { w: Math.max(0, s.w + dw), h: Math.max(0, s.h + dh), r: s.r };
    g.translate(dx, 0);
    if (s.a > 0.002) { g.fillStyle = css(fill, s.a); rr(g, -box.w / 2, -box.h / 2, box.w, box.h, box.r); g.fill(); }
    const clipIt = s.a > 0.5 && f.cur.st.s.fill !== 'none'; if (clipIt) { rr(g, -box.w / 2, -box.h / 2, box.w, box.h, box.r); g.clip(); }
    const fillC = s.a > 0.5 ? fill : hex(d.theme.bg);
    if (f.prev) drawContent(g, d, f, f.prev, box, fillC);
    drawContent(g, d, f, f.cur, box, fillC);
    g.restore(); g.restore();
    if (f.cursor) {   // the cursor stays the same size on screen while the camera zooms
      const z = f.fit * f.zoom, x = W / 2 + (f.cursor.x + 0) * z, y = H / 2 + (f.cursor.y + 0) * z, sc = Math.min(W, H) / 1440 * 1.5 * (1 - 0.12 * f.cursor.press);
      g.save(); g.translate(x, y); g.scale(sc, sc); g.beginPath(); CURSOR.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = '#111111'; g.fill(); g.lineWidth = 2.2; g.strokeStyle = '#FFFFFF'; g.lineJoin = 'round'; g.stroke(); g.restore();
    }
    void P;
  }
  const BLUR = {};
  // draw(g, doc, t, { w, h, blur }) renders one frame at the canvas size; blur = N subframes blended for motion blur
  function draw(g, doc, t, o = {}) {
    const d = doc && doc.states && doc.theme && doc.spring ? doc : normalize(doc), W = o.w || d.size.w, H = o.h || d.size.h, n = o.blur != null ? o.blur : d.blur.n;
    if (n > 1 && o.fps && g.canvas && typeof document !== 'undefined') {
      // motion blur: each subframe is drawn whole on its own canvas, then averaged in (1, 1/2, 1/3 … = a running mean)
      const cv = g.canvas, off = BLUR.c && BLUR.c.width === cv.width && BLUR.c.height === cv.height ? BLUR.c : (BLUR.c = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height }));
      const og = off.getContext('2d'), m = g.getTransform();
      for (let i = 0; i < n; i++) {
        og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, off.width, off.height); og.setTransform(m);
        drawFrame(og, d, seek(d, t + i / (n * o.fps)), W, H);
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1 / (i + 1); g.drawImage(off, 0, 0); g.restore();
      }
      return;
    }
    drawFrame(g, d, seek(d, t), W, H);
  }

  // ---------- sounds: where each UI sound goes ----------
  function events(doc) {
    const d = normalize(doc), P = plan(d), out = [];
    P.ST.forEach((x, i) => { if (i || !d.loop) out.push({ t: x.t, kind: 'whoosh' }); for (const a of x.acts) { if (a.type === 'click') out.push({ t: a.t, kind: 'click' }); if (a.type === 'drag') { out.push({ t: a.t, kind: 'tick' }); out.push({ t: a.t1, kind: 'click' }); } if (a.type === 'type') { const q = String(x.s.query || '').length || 6; for (let k = 1; k <= q; k++) out.push({ t: a.t + (a.t1 - a.t) * k / q, kind: 'tick' }); } } if (x.s.kind === 'toast' || x.s.kind === 'check') out.push({ t: x.t + 0.06, kind: 'pop' }); });
    return out.filter(e => e.t >= 0 && e.t < P.dur).sort((a, b) => a.t - b.t);
  }
  // snap(doc): every state and act onto the half-beat grid
  function snap(doc, grid = 0.5) {
    const d = clone(normalize(doc)), q = v => Math.round(v / grid) * grid;
    d.states.forEach(s => { s.at = q(s.at); s.acts.forEach(a => { a.at = q(a.at); if (a.until != null) a.until = Math.max(a.at + grid, q(a.until)); }); });
    d.rev = (d.rev || 0) + 1; return d;
  }

  // ---------- music: tempo, downbeat and onsets from the samples (mono Float32Array) ----------
  function analyze(x, rate) {
    const hop = 512, win = 1024, n = Math.floor((x.length - win) / hop); if (n < 64) return { bpm: 120, offset: 0, onsets: [], confidence: 0 };
    const env = new Float32Array(n); let prevE = 0;
    for (let i = 0; i < n; i++) { let e = 0, p = 0; for (let j = 0; j < win; j++) { const v = x[i * hop + j], hp = v - p; p = v; e += hp * hp; } e = Math.log(1 + 1000 * e / win); env[i] = Math.max(0, e - prevE); prevE = e; }
    const fps = rate / hop; let best = 120, bestS = -1;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) { const lag = fps * 60 / bpm, L = Math.floor(lag), fr = lag - L; let s = 0; for (let i = 0; i + L + 1 < n; i++) s += env[i] * (env[i + L] * (1 - fr) + env[i + L + 1] * fr); s /= (n - lag); const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2)); if (s * w > bestS) { bestS = s * w; best = bpm; } }
    const beatF = fps * 60 / best; let ph = 0, phS = -1;
    for (let p = 0; p < beatF; p += 0.5) { let s = 0; for (let b = p; b < n; b += beatF) s += env[Math.round(b)] || 0; if (s > phS) { phS = s; ph = p; } }
    let down = 0, downS = -1; for (let k = 0; k < 4; k++) { let s = 0; for (let b = ph + k * beatF; b < n; b += beatF * 4) s += env[Math.round(b)] || 0; if (s > downS) { downS = s; down = k; } }
    let mean = 0; for (const v of env) mean += v; mean /= n; const onsets = []; for (let i = 1; i < n - 1; i++) if (env[i] > mean * 3 && env[i] >= env[i - 1] && env[i] > env[i + 1]) onsets.push(Math.round(i / fps * 1000) / 1000);
    const lag0 = win / rate;   // a frame's energy jumps when the onset enters the end of its window
    return { bpm: Math.round(best * 2) / 2, offset: Math.round(((ph + down * beatF) / fps + lag0) % (beatF * 4 / fps) * 1000) / 1000, onsets: onsets.slice(0, 2000).map(v => Math.round((v + lag0) * 1000) / 1000), confidence: Math.round(bestS * 1000) / 1000 };
  }

  // ---------- feel presets ----------
  // [id, name, about, stiffness, damping, swap blur, enter seconds, motion blur subframes, camera strength]
  const FEEL_ROWS = [
    ['crisp', 'Crisp', 'Fast, exact, almost no overshoot', 340, 0.92, 8, 0.16, 0, 0.5], ['snappy', 'Snappy', 'Quick and lively, a hint of overshoot', 420, 0.8, 8, 0.14, 0, 0.5],
    ['calm', 'Calm', 'Slow, soft settles', 120, 0.95, 12, 0.3, 0, 0.45], ['smooth', 'Smooth', 'Even and fluid', 200, 0.9, 10, 0.22, 2, 0.5],
    ['gentle', 'Gentle', 'Soft and unhurried', 140, 1, 12, 0.28, 0, 0.4], ['brisk', 'Brisk', 'Energetic without bounce', 360, 0.9, 6, 0.15, 0, 0.55],
    ['silky', 'Silky', 'Long, buttery settles with motion blur', 170, 0.94, 14, 0.26, 4, 0.5], ['steady', 'Steady', 'Predictable, no surprises', 220, 1, 8, 0.2, 0, 0.4],
    ['precise', 'Precise', 'Tight timing for UI demos', 300, 0.96, 6, 0.16, 0, 0.5], ['lively', 'Lively', 'Upbeat with a small overshoot', 380, 0.76, 10, 0.16, 0, 0.6],
    ['relaxed', 'Relaxed', 'Easy pace for long reads', 110, 0.97, 12, 0.32, 0, 0.35], ['firm', 'Firm', 'Solid stops, no wobble', 280, 1.05, 6, 0.18, 0, 0.5],
    ['soft', 'Soft', 'Cushioned arrivals', 150, 0.92, 14, 0.26, 2, 0.45], ['swift', 'Swift', 'In and out quickly', 480, 0.88, 6, 0.12, 0, 0.55],
    ['measured', 'Measured', 'Deliberate, keynote pacing', 160, 0.98, 10, 0.26, 0, 0.45], ['breezy', 'Breezy', 'Light and airy', 190, 0.85, 12, 0.2, 2, 0.5],
    ['tight', 'Tight', 'Minimal travel time', 520, 0.95, 4, 0.12, 0, 0.5], ['loose', 'Loose', 'Relaxed springs, a touch of give', 130, 0.8, 12, 0.26, 0, 0.45],
    ['polished', 'Polished', 'Studio default: smooth with light blur', 230, 0.88, 10, 0.2, 4, 0.5], ['studio', 'Studio', 'Motion blur on everything', 210, 0.9, 10, 0.2, 8, 0.5],
    ['launch', 'Product launch', 'Confident moves for a launch video', 260, 0.86, 10, 0.18, 4, 0.6], ['keynote', 'Keynote', 'Big, calm, centred', 150, 0.95, 12, 0.28, 2, 0.65],
    ['documentary', 'Documentary', 'Quiet and observational', 100, 1, 8, 0.34, 0, 0.3], ['playful', 'Playful', 'The most overshoot allowed', 400, 0.72, 10, 0.16, 0, 0.6],
    ['elegant', 'Elegant', 'Slow ease with long blur fades', 130, 0.96, 16, 0.32, 4, 0.45], ['minimal', 'Minimal', 'Plain fades, still camera', 220, 1, 4, 0.2, 0, 0],
    ['bold', 'Bold', 'Big camera moves, quick settles', 300, 0.86, 8, 0.16, 0, 0.85], ['punchy', 'Punchy', 'Hits on the beat', 560, 0.82, 6, 0.1, 0, 0.6],
    ['dreamy', 'Dreamy', 'Heavy blur between states', 140, 0.95, 24, 0.36, 4, 0.4], ['cinematic', 'Cinematic', 'Slow camera, rich motion blur', 120, 0.97, 14, 0.32, 8, 0.7],
    ['sharp', 'Sharp', 'No blur at all', 300, 0.92, 0, 0.14, 0, 0.5], ['fluid', 'Fluid', 'Continuous, liquid motion', 180, 0.88, 12, 0.22, 4, 0.55],
    ['liquid', 'Liquid', 'Stretchy edges, soft stops', 160, 0.82, 14, 0.24, 2, 0.5], ['weighty', 'Weighty', 'Heavy things moving slowly', 90, 1, 8, 0.3, 2, 0.4],
    ['light', 'Light', 'Small things moving fast', 450, 0.9, 6, 0.12, 0, 0.5], ['feather', 'Feather', 'Barely-there transitions', 200, 1, 16, 0.3, 0, 0.3],
    ['glide', 'Glide', 'Long glides, no stops', 150, 0.92, 10, 0.26, 4, 0.5], ['tactile', 'Tactile', 'Presses you can feel', 380, 0.9, 6, 0.14, 0, 0.5],
    ['hushed', 'Hushed', 'Quiet, small camera', 140, 0.98, 10, 0.28, 0, 0.2], ['energetic', 'Energetic', 'Fast and busy', 500, 0.82, 8, 0.12, 2, 0.7],
    ['rapid', 'Rapid fire', 'For short social clips', 600, 0.88, 4, 0.1, 0, 0.6], ['reveal', 'Slow reveal', 'Let each state breathe', 100, 0.96, 12, 0.4, 2, 0.45],
    ['easygoing', 'Easygoing', 'Friendly and slow', 125, 0.9, 12, 0.3, 0, 0.4], ['confident', 'Confident', 'Clear moves, firm landings', 280, 0.94, 8, 0.18, 2, 0.55],
    ['cleancut', 'Clean cut', 'Short swaps, no blur', 320, 0.95, 0, 0.1, 0, 0.5], ['velvet', 'Velvet', 'Soft blur, slow settles', 130, 0.93, 18, 0.3, 4, 0.45],
    ['metronome', 'Metronome', 'Locked to the beat', 450, 0.97, 4, 0.12, 0, 0.5], ['heartbeat', 'Heartbeat', 'Quick in, soft settle', 360, 0.84, 8, 0.12, 2, 0.55],
    ['paper', 'Paper', 'Flat and quiet, still camera', 240, 0.98, 6, 0.18, 0, 0], ['closeup', 'Close-up', 'The camera stays tight on each state', 230, 0.9, 10, 0.2, 2, 1],
    ['wide', 'Wide shot', 'The camera barely moves', 230, 0.9, 10, 0.2, 2, 0.12], ['social', 'Social', 'Made for 9:16 feeds: quick, punchy, readable', 420, 0.86, 8, 0.12, 2, 0.65],
    ['demo', 'Product demo', 'Clear clicks, readable pauses', 260, 0.94, 8, 0.18, 2, 0.55], ['ambient', 'Ambient', 'Background loop for a website', 90, 1, 14, 0.4, 0, 0.25],
  ];
  const FEELS = {}; for (const [id, name, about, k, z, blur, enter, mb, cam] of FEEL_ROWS) FEELS[id] = { id, name, about, k, z, blur, enter, mb, cam };
  function applyFeel(doc, id) { const f = FEELS[id]; const d = clone(normalize(doc)); if (!f) return d; d.feel = id; d.spring = { k: f.k, z: f.z }; d.swap = { ...d.swap, blur: f.blur, enter: f.enter }; d.blur = { n: f.mb }; d.camera = { ...d.camera, strength: f.cam }; d.rev++; return d; }

  // ---------- templates ----------
  const CATS = [
    ['ui', 'UI morph reels'], ['promo', 'App promos'], ['logo', 'Logo reveals'], ['type', 'Kinetic type'], ['stat', 'Stat counters'], ['chart', 'Chart reveals'],
    ['social', 'Social posts'], ['tour', 'Product tours'], ['end', 'End cards'], ['trans', 'Transitions'], ['lower', 'Lower thirds'], ['caption', 'Caption styles'],
  ];
  const TEMPLATES = {};
  // def(id, cat, name, about, base, states): states use beats; acts too. base: { bars, bpm, aspect, theme, feel, camera, backdrop, cursor }
  function def(id, cat, name, about, base, states) { TEMPLATES[id] = { id, cat, name, about, make: (o = {}) => build(id, base, typeof states === 'function' ? states(o) : states, o) }; }
  function build(id, base, states, o) {
    const size = ASPECTS[o.aspect || base.aspect || '1:1'];
    let d = { name: o.name || TEMPLATES[id].name, template: id, aspect: o.aspect || base.aspect || '1:1', size: { w: size[0], h: size[1] }, bpm: base.bpm || 120, bars: base.bars || 4, loop: true,
      themeName: base.theme || 'warm', camera: base.camera, backdrop: base.backdrop, cursor: base.cursor, thumbAt: base.thumb != null ? base.thumb : -1, states: clone(states) };
    if (o.accent) d.theme = { ...THEMES[d.themeName || 'warm'], accent: o.accent };
    d = normalize(d); d = applyFeel(d, o.feel || base.feel || 'polished');
    if (base.camera) d.camera = { ...d.camera, ...base.camera };   // a template that needs a still camera keeps it
    d.rev = 1; return d;
  }
  const S = (kind, at, props = {}, acts) => ({ kind, at, ...props, ...(acts ? { acts } : {}) });
  const click = (at, x, y, more) => ({ type: 'click', at, x, y, ...(more || {}) });
  const drag = (at, until, x0, y0, x1, y1) => ({ type: 'drag', at, until, x0, y0, x1, y1 });
  const hover = (at, until, x0, y0, x1, y1) => ({ type: 'hover', at, until, x0, y0, x1, y1 });
  const type = (at, until) => ({ type: 'type', at, until });
  const focus = at => ({ type: 'focus', at });

  // UI morph reels
  def('ui-reel', 'ui', 'The UI morph reel', 'Button, loader, check, island, player, scrub, volume, toggle, tabs, chart, ⌘K and a toast, all one shape. 120 BPM, 7 bars.', { bars: 7, thumb: 6.6, camera: { strength: 1, fill: 0.74 } }, [
    S('button', 0, { text: 'Get started' }, [click(1, 30, 10)]), S('loader', 1), S('check', 3), S('island', 4, { title: 'Lantern', sub: 'Now playing' }),
    S('player', 6, { title: 'Golden Hour', artist: 'The Night Owls' }, [click(7, 304, -44), drag(8.5, 10, 28, 70, 240, 70)]),
    S('slider', 11, { v0: 0.4 }, [drag(12, 13.5, -40, 0, 470, 0)]), S('toggle', 15, {}, [click(16, 0, 0), click(17, 0, 0)]),
    S('tabs', 18, { labels: ['Home', 'Library', 'Profile'] }, [click(19, 0, 0, { i: 1 }), click(20, 250, 0, { i: 2 })]),
    S('chart', 21, { title: 'Weekly players', big: '+38%' }, [hover(22, 23.5, -300, 40, 330, 40)]), S('cmdk', 24, { query: 'export' }, [type(24.4, 25.2), click(25.6, 0, -70, { enter: true, soft: true })]),
    S('toast', 26, { text: 'Exported. Saved to your tribe' }), S('button', 27.5, { text: 'Get started' })]);
  def('ui-checkout', 'ui', 'Checkout morph', 'Pay button to spinner to a check and a receipt card.', { bars: 4, thumb: 9 }, [
    S('button', 0, { text: 'Pay $24', icon: 'lock' }, [click(1.5, 20, 0)]), S('loader', 2), S('check', 4), S('card', 6, { icon: 'cart', title: 'Order confirmed', body: 'Two tickets for Saturday, 8 pm. A receipt is on its way.' }), S('toast', 12, { text: 'Receipt sent' }), S('button', 15, { text: 'Pay $24', icon: 'lock' })]);
  def('ui-player', 'ui', 'Music player morph', 'An island grows into a player; play, pause and scrub.', { bars: 4, thumb: 5 }, [
    S('island', 0, { title: 'Golden Hour', sub: 'Tap to open' }, [click(1.5, 0, 0)]), S('player', 2, {}, [click(3, 304, -44), drag(5, 7, 28, 70, 260, 70), click(9, 304, -44), click(11, 304, -44)]), S('island', 13.5, { title: 'Golden Hour', sub: 'Tap to open' })]);
  def('ui-controls', 'ui', 'Toggle and tabs', 'A toggle flips on the beat, then its knob becomes a liquid tab indicator.', { bars: 4, thumb: 9.5 }, [
    S('toggle', 0, {}, [click(1, 0, 0), click(3, 0, 0), click(5, 0, 0)]), S('tabs', 6, { labels: ['Play', 'Build', 'Share'] }, [click(7, 0, 0, { i: 1 }), click(8.5, 250, 0, { i: 2 }), click(10, -250, 0, { i: 0 }), click(12, 250, 0, { i: 2 })]), S('toggle', 14.5, { on0: 0 })]);
  def('ui-command', 'ui', 'Command palette', 'A search button opens ⌘K, types, and runs the command.', { bars: 4, thumb: 4 }, [
    S('button', 0, { text: 'Search', icon: 'search' }, [click(1.5, 0, 0)]), S('cmdk', 2, { query: 'invite', items: ['Invite a friend', 'Invite an AI helper', 'Copy invite link', 'New project'] }, [type(3, 5), click(6.5, 0, -70, { enter: true, soft: true })]), S('toast', 8, { text: 'Invite link copied' }), S('button', 14, { text: 'Search', icon: 'search' })]);
  def('ui-notify', 'ui', 'Notification flow', 'A badge becomes a notification, then an approval toast.', { bars: 4, thumb: 5 }, [
    S('badge', 0, { text: '1 NEW', live: false, icon: 'bell' }, [click(1.5, 0, 0)]), S('notif', 2, {}, [click(5, 200, 0)]), S('check', 6), S('toast', 8, { text: 'Approved. It is live' }), S('badge', 14, { text: '1 NEW', live: false, icon: 'bell' })]);
  def('ui-onboard', 'ui', 'Onboarding cards', 'Three cards morph into each other as the cursor taps Next.', { bars: 4, thumb: 2 }, [
    S('card', 0, { icon: 'sparkle', title: 'Make anything', body: 'Games, apps and websites, from one sentence.' }, [click(3, 220, 140)]), S('card', 4, { icon: 'tribe', title: 'With your friends', body: 'Everyone in one link, each with their own AI.' }, [click(7, 220, 140)]),
    S('card', 8, { icon: 'check', title: 'Nothing ships without a yes', body: 'Approve changes from your phone in one tap.' }, [click(11, 220, 140)]), S('button', 12, { text: 'Start building' }, [click(14, 0, 0)]), S('card', 15.5, { icon: 'sparkle', title: 'Make anything', body: 'Games, apps and websites, from one sentence.' })]);
  def('ui-island', 'ui', 'Dynamic island story', 'Island states: timer, call, music, done.', { bars: 4, thumb: 3 }, [
    S('island', 0, { title: 'Build timer', sub: '24:59 left', icon: 'clock' }), S('island', 4, { title: 'Maya is calling', sub: 'Tap to join the huddle', icon: 'user', w: 560 }, [click(6, 160, 0)]), S('island', 8, { title: 'Huddle', sub: '3 people · 2 AIs', icon: 'chat', w: 520 }), S('check', 12), S('island', 14, { title: 'Build timer', sub: '24:59 left', icon: 'clock' })]);
  // App promos
  def('app-preview', 'promo', 'App preview', 'Your app screens in a phone, swiped by the cursor. The Launch kit opens this one.', { bars: 4, thumb: 3, camera: { strength: 0.25 } }, o => [
    S('phone', 0, { screens: o.screens || [], caption: o.caption || '' }, [click(3, 0, 200), click(7, 0, 200), click(11, 0, 200)]), S('endcard', 13, { title: o.name || 'Get the app', cta: o.cta || 'Available on iPhone and Android', mark: 'phone' }), S('phone', 15.5, { screens: o.screens || [] })]);
  def('app-features', 'promo', 'Three features', 'Phone, then three words, then the phone again.', { bars: 4, thumb: 6, camera: { strength: 0.3 } }, [
    S('phone', 0, {}, [click(2.5, 0, 200)]), S('word', 4, { text: 'Plan it', hi: 1 }), S('word', 6, { text: 'Build it', hi: 1 }), S('word', 8, { text: 'Ship it', hi: 1 }), S('phone', 10, {}, [click(12.5, 0, 200)]), S('phone', 15, {})]);
  def('app-icon', 'promo', 'App icon reveal', 'A dot grows into your app icon, then the name.', { bars: 2, thumb: 4.5 }, [S('loader', 0, { fill: 'accent' }), S('appicon', 1.5, { text: 'Pixel Quest', mark: 'bolt' }), S('appicon', 7.5, { mark: 'bolt' })]);
  def('app-whatsnew', 'promo', 'What is new', 'A changelog card with three items ticking in.', { bars: 4, thumb: 5 }, [
    S('badge', 0, { text: 'v2.0', live: false, icon: 'sparkle' }), S('list', 2, { title: 'What is new', items: ['Edit by clicking anything', 'Moving backgrounds', 'Approvals on your phone'] }), S('toast', 10, { text: 'Update now', icon: 'arrow' }), S('badge', 14, { text: 'v2.0', live: false, icon: 'sparkle' })]);
  def('app-carousel', 'promo', 'Screen carousel 9:16', 'Phone screens for Reels, TikTok and Shorts with a caption.', { bars: 4, aspect: '9:16', thumb: 2, camera: { strength: 0.2 } }, [
    S('phone', 0, { caption: 'Swipe to see it', w: 520, h: 1060, r: 80 }, [click(2, 0, 300), click(4, 0, 300), click(6, 0, 300), click(8, 0, 300)]), S('word', 10, { text: 'Made with friends', hi: 2, fs: 110, w: 900 }), S('phone', 14, { caption: 'Swipe to see it', w: 520, h: 1060, r: 80 })]);
  def('app-download', 'promo', 'Get the app', 'A button becomes a phone, then back.', { bars: 2, thumb: 3 }, [S('button', 0, { text: 'Get the app', icon: 'phone' }, [click(1, 0, 0)]), S('phone', 1.5, {}, [click(4, 0, 200)]), S('button', 7, { text: 'Get the app', icon: 'phone' })]);
  // Logo reveals
  def('logo-draw', 'logo', 'Mark draws on', 'Your mark draws itself, then the name rises letter by letter.', { bars: 2, thumb: 3 }, [S('loader', 0), S('logo', 1, { text: 'Lantern Run', mark: 'flame' }), S('logo', 7.5, { mark: 'flame', text: 'Lantern Run' })]);
  def('logo-stagger', 'logo', 'Letter stagger', 'A wordmark rises one letter at a time, accent on one letter.', { bars: 2, thumb: 3, camera: { strength: 0 } }, [S('wordmark', 0, { text: 'TRIBECODE', hi: 5 }), S('wordmark', 4, { text: 'TRIBECODE', hi: 5 })]);
  def('logo-morph', 'logo', 'Shape to logo', 'A button-sized pill morphs into your round logo.', { bars: 2, thumb: 4 }, [S('button', 0, { text: '' }), S('logo', 2, { mark: 'sparkle' }), S('logo', 6, { mark: 'sparkle', fill: 'accent' }), S('button', 7.5, { text: '' })]);
  def('logo-type', 'logo', 'Typewriter wordmark', 'Your name types itself with an accent caret.', { bars: 2, thumb: 6, camera: { strength: 0 } }, [S('wordmark', 0, { text: 'pixelquest', style: 'type' }), S('wordmark', 7.6, { text: 'pixelquest', style: 'type' })]);
  def('logo-icon', 'logo', 'Icon and wordmark', 'App icon, then the wordmark beside it.', { bars: 2, thumb: 6 }, [S('appicon', 0, { mark: 'globe' }), S('wordmark', 3, { text: 'Atlas', fs: 140 }), S('appicon', 7, { mark: 'globe' })]);
  // Kinetic type
  def('type-punch', 'type', 'Word punch', 'One idea per beat, words rising from a mask.', { bars: 2, camera: { strength: 0 }, cursor: false, thumb: 2.4 }, [S('word', 0, { text: 'Build', fs: 220 }), S('word', 1, { text: 'it', fs: 220 }), S('word', 2, { text: 'together.', fs: 200, hi: 0 }), S('word', 4, { text: 'Ship it on Friday', fs: 130, hi: 3 }), S('word', 7.5, { text: 'Build', fs: 220 })]);
  def('type-quote', 'type', 'Big quote', 'A line set large, one word in the accent.', { bars: 2, camera: { strength: 0 }, cursor: false, thumb: 3 }, [S('word', 0, { text: 'Make the thing you wish existed', fs: 120, hi: 3 }), S('word', 7.5, { text: 'Make the thing you wish existed', fs: 120, hi: 3 })]);
  def('type-question', 'type', 'Question and answer', 'Ask it, pause, answer it.', { bars: 2, camera: { strength: 0 }, cursor: false, thumb: 5 }, [S('word', 0, { text: 'Need a website by tonight?', fs: 110 }), S('word', 4, { text: 'Click. Type. Done.', fs: 140, hi: 2 }), S('word', 7.5, { text: 'Need a website by tonight?', fs: 110 })]);
  def('type-list', 'type', 'List reveal', 'Three lines tick in on a card.', { bars: 2, thumb: 4 }, [S('list', 0, { items: ['Free to start', 'Bring your own AI', 'Your files stay yours'] }), S('list', 7.5, { items: ['Free to start', 'Bring your own AI', 'Your files stay yours'] })]);
  def('type-countdown', 'type', 'Countdown', '3, 2, 1 on the beat, then a message.', { bars: 2, thumb: 1.2, cursor: false }, [S('count', 0, { from: 3, go: 'Go' }), S('word', 4, { text: 'Jam starts now', fs: 130, hi: 2 }), S('count', 7.5, { from: 3 })]);
  def('type-stack', 'type', 'Stacked headline', 'A three-line headline builds up line by line.', { bars: 2, camera: { strength: 0 }, cursor: false, thumb: 5 }, [S('word', 0, { text: 'Games', fs: 170 }), S('word', 1.5, { text: 'Games. Apps.', fs: 170 }), S('word', 3, { text: 'Games. Apps. Websites.', fs: 150, hi: 2 }), S('word', 7.5, { text: 'Games', fs: 170 })]);
  // Stat counters
  def('stat-big', 'stat', 'One big number', 'A number counts up with a label.', { bars: 2, thumb: 4, cursor: false }, [S('badge', 0, { text: 'THIS WEEK', live: false, icon: 'pulse' }), S('stat', 1, { value: 12480, label: 'games played this week' }), S('badge', 7.5, { text: 'THIS WEEK', live: false, icon: 'pulse' })]);
  def('stat-trio', 'stat', 'Three stats', 'Three numbers, one per bar.', { bars: 4, thumb: 6, cursor: false }, [S('stat', 0, { value: 3, label: 'friends', suffix: '' }), S('stat', 4, { value: 3, label: 'AIs working', from: 0 }), S('stat', 8, { value: 1, label: 'weekend', suffix: '', fs: 150 }), S('word', 12, { text: 'One finished game', hi: 2, fs: 120 }), S('stat', 15.5, { value: 3, label: 'friends' })]);
  def('stat-ring', 'stat', 'Progress ring', 'A ring fills to a goal.', { bars: 2, thumb: 5, cursor: false }, [S('ring', 0, { value: 0.86, label: 'of the goal reached' }), S('ring', 7.5, { value: 0.86, label: 'of the goal reached' })]);
  def('stat-compare', 'stat', 'Before and after number', 'From one number to a better one.', { bars: 2, thumb: 6, cursor: false }, [S('stat', 0, { value: 14, suffix: ' days', label: 'to launch, before' }), S('stat', 3.5, { value: 2, from: 14, suffix: ' days', label: 'to launch, with your tribe' }), S('stat', 7.5, { value: 14, suffix: ' days', label: 'to launch, before' })]);
  // Chart reveals
  def('chart-line', 'chart', 'Line chart with tooltip', 'The line draws itself; the cursor hovers a point.', { bars: 2, thumb: 6 }, [S('chart', 0, { title: 'Daily players', big: '+38%' }, [hover(3, 6, -330, 40, 340, 40)]), S('chart', 7.6, { title: 'Daily players', big: '+38%' })]);
  def('chart-bars', 'chart', 'Bars rising', 'Bars grow in a stagger, the best day in the accent.', { bars: 2, thumb: 5, cursor: false }, [S('bars', 0, {}), S('bars', 7.6, {})]);
  def('chart-donut', 'chart', 'Donut split', 'A donut sweeps into its share.', { bars: 2, thumb: 5, cursor: false }, [S('donut', 0, { label: 'play on phones' }), S('donut', 7.6, { label: 'play on phones' })]);
  def('chart-board', 'chart', 'Leaderboard', 'Ranked rows with bars, top row in the accent.', { bars: 2, thumb: 5, cursor: false }, [S('list', 0, { title: 'Top builders', items: ['Maya', 'Sam', 'Ana', 'Leo'], vals: [42, 35, 28, 19] }), S('list', 7.6, { title: 'Top builders', items: ['Maya', 'Sam', 'Ana', 'Leo'], vals: [42, 35, 28, 19] })]);
  def('chart-story', 'chart', 'Number to chart', 'A stat becomes the chart behind it.', { bars: 4, thumb: 9 }, [S('stat', 0, { value: 38, suffix: '%', label: 'more players this month' }), S('chart', 4, { title: 'Players this month', big: '+38%' }, [hover(8, 12, -330, 40, 340, 40)]), S('stat', 15.5, { value: 38, suffix: '%', label: 'more players this month' })]);
  // Social posts
  def('social-post', 'social', 'Post card', 'A post that writes itself in, then the likes count up. Square for feeds.', { bars: 2, thumb: 6, cursor: false }, [S('post', 0, {}), S('post', 7.6, {})]);
  def('social-hook', 'social', 'Hook for 9:16', 'A two-line hook for TikTok, Reels and Shorts.', { bars: 2, aspect: '9:16', camera: { strength: 0 }, cursor: false, thumb: 5 }, [S('word', 0, { text: 'POV:', fs: 160, w: 900 }), S('word', 1, { text: 'your friends and their AIs built your game overnight', fs: 96, w: 900, hi: 2, gap: 0.06 }), S('word', 7.6, { text: 'POV:', fs: 160, w: 900 })]);
  def('social-carousel', 'social', 'Carousel slide 4:5', 'A tip card for Instagram, with a "swipe" nudge.', { bars: 2, aspect: '4:5', thumb: 4 }, [S('card', 0, { icon: 'sparkle', title: 'Tip 1: Click anything', body: 'Every word and picture on your site can be edited where it is.' }, [click(5, 250, 150)]), S('card', 6, { icon: 'arrow', title: 'Swipe for tip 2', body: 'Five small things that make a site feel finished.' }), S('card', 7.6, { icon: 'sparkle', title: 'Tip 1: Click anything', body: 'Every word and picture on your site can be edited where it is.' })]);
  def('social-launch', 'social', 'Launch announcement', 'Badge, headline, button.', { bars: 4, thumb: 7 }, [S('badge', 0, { text: 'NEW', live: false, icon: 'sparkle' }), S('word', 2, { text: 'Lantern Run is out today', hi: 1, fs: 120 }), S('button', 8, { text: 'Play it free', icon: 'play' }, [click(10, 0, 0)]), S('check', 11), S('badge', 15, { text: 'NEW', live: false, icon: 'sparkle' })]);
  def('social-quote', 'social', 'Quote card', 'A quote set on a card. Put in a real quote and who said it.', { bars: 2, thumb: 6, cursor: false }, [S('quote', 0, {}), S('quote', 7.6, {})]);
  def('social-poll', 'social', 'Poll', 'A question, a vote, the results fill in.', { bars: 2, thumb: 6 }, [S('poll', 0, {}, [click(3, -100, -40)]), S('poll', 7.6, {})]);
  def('social-milestone', 'social', 'Milestone', 'A ring fills, then "thank you".', { bars: 4, thumb: 5, cursor: false }, [S('ring', 0, { value: 1, label: 'first 1,000 players' }), S('word', 6, { text: 'Thank you', fs: 180, hi: 1 }), S('ring', 15.5, { value: 1, label: 'first 1,000 players' })]);
  def('social-live', 'social', 'Live now 9:16', 'A live badge and a stream title for stories.', { bars: 2, aspect: '9:16', thumb: 4, cursor: false }, [S('badge', 0, { text: 'LIVE' }), S('word', 2, { text: 'Building a game with chat', fs: 110, w: 900, hi: 1 }), S('badge', 7.6, { text: 'LIVE' })]);
  // Product tours
  def('tour-zoom', 'tour', 'Screenshot zoom tour', 'A screenshot with the camera moving to three spots. Drop in your own picture.', { bars: 4, thumb: 6, camera: { strength: 0.15 }, cursor: false }, [S('image', 0, {}, [focus(3), focus(7), focus(11)]), S('image', 15.5, {})]);
  def('tour-wipe', 'tour', 'Before and after wipe', 'Drag the divider between two pictures.', { bars: 4, thumb: 4.5, camera: { strength: 0.15 } }, [S('wipe', 0, {}, [drag(2, 5, 0, 0, 380, 0), drag(7, 10, 380, 0, -380, 0), drag(12, 14, -380, 0, 0, 0)]), S('wipe', 15.5, {})]);
  def('tour-spot', 'tour', 'Feature spotlight', 'A picture, then a callout card over it.', { bars: 4, thumb: 9, camera: { strength: 0.2 } }, [S('image', 0, {}, [focus(4)]), S('card', 8, { icon: 'sparkle', title: 'Click anything to edit', body: 'Words, pictures and buttons change right where they are.' }), S('image', 15.5, {})]);
  def('tour-devices', 'tour', 'Phone to desktop', 'The same app in a phone, then wide on a desktop.', { bars: 4, thumb: 9, camera: { strength: 0.3 } }, [S('phone', 0, {}, [click(3, 0, 200)]), S('image', 6, { w: 1200, h: 760 }, [focus(10)]), S('phone', 15.5, {})]);
  // End cards
  def('end-remix', 'end', 'Made with TribeCode', 'An end card with a remix link.', { bars: 2, thumb: 4, cursor: false }, [S('endcard', 0, {}), S('endcard', 7.6, {})]);
  def('end-follow', 'end', 'Follow for more', 'Your name and a follow button that gets clicked.', { bars: 2, thumb: 5 }, [S('endcard', 0, { title: 'Follow the build', cta: '@yourhandle', mark: 'user' }), S('button', 4, { text: 'Following', icon: 'check' }, [click(5, 0, 0)]), S('endcard', 7.6, { title: 'Follow the build', cta: '@yourhandle', mark: 'user' })]);
  def('end-cta', 'end', 'Link card', 'A big button with your link, clicked on the beat.', { bars: 2, thumb: 3 }, [S('button', 0, { text: 'Play at lantern.run', icon: 'globe', w: 620, h: 140, r: 70, fs: 40 }, [click(2, 0, 0), click(6, 0, 0)]), S('button', 7.6, { text: 'Play at lantern.run', icon: 'globe', w: 620, h: 140, r: 70, fs: 40 })]);
  // Transitions
  def('trans-circle', 'trans', 'Circle reveal', 'A dot grows to fill the frame, carrying the next title.', { bars: 2, camera: { strength: 0 }, cursor: false, thumb: 3 }, [S('scene', 0, { w: 120, h: 120, r: 60, fill: 'accent' }), S('scene', 1, { w: 2400, h: 2400, r: 1200, fill: 'accent', title: 'Chapter two' }), S('scene', 4, { w: 2400, h: 2400, r: 1200, fill: 'ink', title: 'The boss fight' }), S('scene', 7, { w: 120, h: 120, r: 60, fill: 'accent' })]);
  def('trans-pill', 'trans', 'Pill sweep', 'A pill stretches across the frame and becomes the next scene.', { bars: 2, camera: { strength: 0 }, cursor: false, thumb: 2.5 }, [S('scene', 0, { w: 300, h: 100, r: 50, fill: 'ink' }), S('scene', 1, { w: 1600, h: 100, r: 50, fill: 'ink' }), S('scene', 1.75, { w: 1600, h: 1600, r: 0, fill: 'ink', title: 'Next up', sub: 'Level 3' }), S('scene', 6, { w: 300, h: 100, r: 50, fill: 'ink' })]);
  def('trans-stack', 'trans', 'Card stack', 'Cards slide up and replace each other.', { bars: 2, camera: { strength: 0 }, cursor: false, thumb: 2 }, [S('scene', 0, { w: 900, h: 600, r: 40, fill: 'paper', title: 'One' }), S('scene', 2, { w: 900, h: 600, r: 40, fill: 'ink', title: 'Two', cy: -20 }), S('scene', 4, { w: 900, h: 600, r: 40, fill: 'accent', title: 'Three', cy: -40 }), S('scene', 6, { w: 900, h: 600, r: 40, fill: 'paper', title: 'One' })]);
  // Lower thirds
  def('lower-name', 'lower', 'Name and role', 'A lower third over your video. Use a transparent background or put it over a picture.', { bars: 2, aspect: '16:9', camera: { strength: 0 }, cursor: false, backdrop: { kind: 'scene' }, thumb: 2 }, [S('lower', 0, { cx: -700, cy: 330, w: 20 }), S('lower', 0.5, { cx: -280, cy: 330 }), S('lower', 6.5, { cx: -280, cy: 330 }), S('lower', 7.5, { cx: -700, cy: 330, w: 20 })]);
  def('lower-place', 'lower', 'Location tag', 'A pin and a place name slide in.', { bars: 2, aspect: '16:9', camera: { strength: 0 }, cursor: false, backdrop: { kind: 'scene' }, thumb: 3 }, [S('badge', 0, { text: 'PHOENIX, AZ', live: false, icon: 'pin', cx: -520, cy: 330, w: 90 }), S('badge', 0.5, { text: 'PHOENIX, AZ', live: false, icon: 'pin', cx: -480, cy: 330, w: 360 }), S('badge', 7, { text: 'PHOENIX, AZ', live: false, icon: 'pin', cx: -520, cy: 330, w: 90 })]);
  def('lower-live', 'lower', 'Live badge', 'A pulsing live badge in the corner, on the beat.', { bars: 2, aspect: '16:9', camera: { strength: 0 }, cursor: false, backdrop: { kind: 'scene' }, thumb: 2 }, [S('badge', 0, { cx: -720, cy: -380, w: 90 }), S('badge', 0.5, { cx: -640, cy: -380, w: 240 }), S('badge', 7.5, { cx: -720, cy: -380, w: 90 })]);
  // Caption styles
  def('cap-karaoke', 'caption', 'Karaoke captions', 'Words light up one at a time in the accent.', { bars: 2, aspect: '9:16', camera: { strength: 0 }, cursor: false, backdrop: { kind: 'scene' }, thumb: 3 }, [S('caption', 0, { text: 'we made this game in one weekend', style: 'karaoke', hold: 8, cy: 380, fs: 72, w: 900 }), S('caption', 7.6, { text: 'we made this game in one weekend', style: 'karaoke', hold: 8, cy: 380, fs: 72, w: 900 })]);
  def('cap-pill', 'caption', 'Pill captions', 'The spoken word sits on an accent pill.', { bars: 2, aspect: '9:16', camera: { strength: 0 }, cursor: false, backdrop: { kind: 'scene' }, thumb: 3 }, [S('caption', 0, { text: 'three friends three AIs zero terminals', style: 'pill', hold: 8, cy: 380, fs: 72, w: 900 }), S('caption', 7.6, { text: 'three friends three AIs zero terminals', style: 'pill', hold: 8, cy: 380, fs: 72, w: 900 })]);
  def('cap-outline', 'caption', 'Outline captions', 'Bold white words with a dark outline, readable on anything.', { bars: 2, aspect: '9:16', camera: { strength: 0 }, cursor: false, backdrop: { kind: 'scene' }, thumb: 3 }, [S('caption', 0, { text: 'and it actually works on phones', style: 'outline', hold: 8, cy: 380, fs: 76, w: 900 }), S('caption', 7.6, { text: 'and it actually works on phones', style: 'outline', hold: 8, cy: 380, fs: 76, w: 900 })]);

  // ---------- extension point: more templates from other files (motionsocial.js) ----------
  // define(id, cat, name, about, base, states) adds a template exactly like the ones above; addCat(id, name) adds a
  // category to the gallery. helpers are the same small builders the templates above use.
  const LIST = Object.keys(TEMPLATES);
  function define(id, cat, name, about, base, states) { def(id, cat, name, about, base, states); if (!LIST.includes(id)) LIST.push(id); return TEMPLATES[id]; }
  function addCat(id, name) { if (!CATS.some(c => c[0] === id)) CATS.push([id, name]); }
  const helpers = { S, click, drag, hover, type, focus };

  // ---------- Flint: motion.* steps (pure: the studio and the server share them) ----------
  function command(doc, step) {
    const s = step && step.slots || {}, id = step && step.intent || '';
    let d = clone(normalize(doc)), say = '';
    const bump = () => { d.rev = (d.rev || 0) + 1; };
    if (id === 'motion.speed') { const f = s.dir === 'slower' ? 0.85 : 1.18; d.bpm = clamp(Math.round(d.bpm * f), 40, 240); say = `${s.dir === 'slower' ? 'Slower' : 'Faster'}: ${d.bpm} BPM.`; }
    else if (id === 'motion.feel') { const f = FEELS[s.feel]; if (f) { d = applyFeel(d, s.feel); say = `Feel: ${f.name}. ${f.about}.`; } else if (s.feel === 'snappier') { d.spring.k = clamp(Math.round(d.spring.k * 1.35), 40, 900); d.swap.enter = Math.max(0.08, d.swap.enter * 0.8); say = 'Snappier: stiffer springs, quicker swaps.'; } else { d.spring.k = clamp(Math.round(d.spring.k * 0.72), 40, 900); d.swap.enter = Math.min(0.6, d.swap.enter * 1.25); say = 'Calmer: softer springs, slower swaps.'; } }
    else if (id === 'motion.overshoot') { d.spring.z = clamp(Math.round((d.spring.z + (s.more ? -0.06 : 0.06)) * 100) / 100, 0.7, 1.2); say = s.more ? 'A little more overshoot.' : (d.spring.z >= 1 ? 'No overshoot now.' : 'Less overshoot.'); }
    else if (id === 'motion.aspect') { const a = ASPECTS[s.ratio] ? s.ratio : '1:1'; d.aspect = a; d.size = { w: ASPECTS[a][0], h: ASPECTS[a][1] }; say = `Now ${a}${s.ratio === '9:16' ? ', ready for TikTok, Reels and Shorts' : a === '16:9' ? ', ready for X and YouTube' : a === '4:5' ? ', ready for Instagram posts' : ''}.`; }
    else if (id === 'motion.loop') { d.loop = s.on !== false; say = d.loop ? 'It loops: the last frame is the first frame.' : 'It plays once now.'; }
    else if (id === 'motion.beat') { d = snap(d); say = `Every state is on the beat grid (${d.bpm} BPM).`; }
    else if (id === 'motion.accent') { const c = s.color && (s.color.hex || NAMED[String(s.color.name || s.color).toLowerCase()]); if (c) { d.theme = { ...d.theme, accent: c }; say = `Accent is ${s.color.name || c} now.`; } else say = 'Which colour? Say a name like teal or a code like #38C6B1.'; }
    else if (id === 'motion.theme') { const th = THEMES[s.theme]; if (th) { d.themeName = s.theme; d.theme = { ...th, accent: s.keep ? d.theme.accent : th.accent }; say = s.theme === 'night' ? 'Dark canvas.' : 'Light canvas.'; } }
    else if (id === 'motion.add') { const k = KINDS[s.kind] ? s.kind : 'toast'; const last = d.states[d.states.length - 1], before = d.loop && d.states.length > 1 ? d.states[d.states.length - 2] : last; const at = d.loop ? Math.max(0, (before ? before.at : 0) + (last.at - before.at) / 2) : last.at + 2; d.states.push(cleanState({ kind: k, at: Math.round(at * 2) / 2 })); d.states.sort((a, b) => a.at - b.at); say = `Added ${KINDS[k].name.toLowerCase()} at beat ${Math.round(at * 2) / 2}.`; }
    else if (id === 'motion.remove') { const n = d.states.length; d.states = d.states.filter(x => x.kind !== s.kind); if (!d.states.length) d.states = [cleanState({ kind: 'button', at: 0 })]; say = d.states.length < n ? `Removed the ${(KINDS[s.kind] || { name: s.kind }).name.toLowerCase()}.` : `There is no ${s.kind} in this one.`; }
    else if (id === 'motion.text') { const tgt = d.states.find(x => s.kind ? x.kind === s.kind : ['button', 'word', 'toast', 'wordmark', 'endcard', 'caption', 'card', 'lower', 'badge'].includes(x.kind)); if (tgt) { const f = ['card', 'endcard'].includes(tgt.kind) ? 'title' : tgt.kind === 'lower' ? 'name' : 'text'; const old = tgt[f]; d.states.forEach(x => { if (x.kind === tgt.kind && x[f] === old) x[f] = s.text; }); say = `Changed the ${KINDS[tgt.kind].name.toLowerCase()} to “${s.text}”.`; } else say = 'There is no text in this one to change.'; }
    else if (id === 'motion.blur') { d.blur.n = s.on === false ? 0 : 4; say = s.on === false ? 'Motion blur is off.' : 'Motion blur is on (4 frames blended).'; }
    else if (id === 'motion.camera') { d.camera.strength = s.on === false ? 0 : clamp(d.camera.strength + (s.more === false ? -0.2 : 0.2), 0, 1); say = s.on === false ? 'The camera stays still.' : `Camera zoom ${Math.round(d.camera.strength * 100)}%.`; }
    else if (id === 'motion.cursor') { d.cursor = s.on !== false; say = d.cursor ? 'The cursor is back.' : 'No cursor now.'; }
    else if (id === 'motion.length') { d.bars = clamp(d.bars + (s.more === false ? -1 : 1), 1, 64); say = `${d.bars} bars (${Math.round(duration(d) * 10) / 10} s).`; }
    else return { doc, say: '' };
    bump(); return { doc: d, say };
  }
  // Screens may come as picture URLs or as { image | src | url, name } (the Launch kit and App Creator hand objects over).
  const srcOf = x => (typeof x === 'string' ? x : x && (x.image || x.src || x.url || x.png)) || '';
  function make(id, o) {
    const t = TEMPLATES[id] || TEMPLATES['ui-reel']; o = { ...(o || {}) };
    if (Array.isArray(o.screens)) o.screens = o.screens.map(srcOf).filter(Boolean);
    if (!o.aspect && o.size && o.size.w && o.size.h) { const r = o.size.w / o.size.h; o.aspect = r < 0.7 ? '9:16' : r < 0.9 ? '4:5' : r > 1.4 ? '16:9' : '1:1'; }
    return t.make(o);
  }

  return { VERSION, KINDS, TEMPLATES, LIST, define, addCat, helpers, CATS, FEELS, FEEL_LIST: Object.keys(FEELS), THEMES, ASPECTS, NAMED, ICONS,
    make, normalize, duration, seek, draw, load, events, snap, analyze, command, applyFeel, step, channel, twoEdge, beatSec, colorOf };
});
