// A fixed clock and seeded randomness for screenshot runs (scripts/dev/fixedclock.py, scripts/dev/live-thumbs.py).
// One file, two uses:
//   node:    NODE_OPTIONS=--require=<this file>  with TRIBE_FIXED_NOW (ms) and TRIBE_FIXED_REAL0 (ms) in the environment
//   browser: added as an init script after `window.__TRIBE_FIXED = { now, real0, seed }`
// Time starts at TRIBE_FIXED_NOW when the run starts (TRIBE_FIXED_REAL0) and ticks on from there, so every process of
// one run (the tribe server, a restarted server, each browser page) shares one timeline and "2 minutes ago" still
// works. Without the settings this file does nothing.
(function () {
  'use strict';
  var g = typeof globalThis !== 'undefined' ? globalThis : this;
  var cfg = g.__TRIBE_FIXED || (typeof process !== 'undefined' && process.env && process.env.TRIBE_FIXED_NOW
    ? { now: +process.env.TRIBE_FIXED_NOW, real0: +process.env.TRIBE_FIXED_REAL0 || 0, seed: 0 } : null);
  if (!cfg || !isFinite(cfg.now) || g.__TRIBE_FIXED_ON) return;
  g.__TRIBE_FIXED_ON = true;
  var Real = g.Date, real0 = cfg.real0 || Real.now(), shift = cfg.now - real0;
  var now = function () { return Real.now() + shift; };
  function FixedDate() {
    if (!(this instanceof FixedDate)) return new Real(now()).toString();
    var a = arguments;
    var d = a.length === 0 ? new Real(now()) : a.length === 1 ? new Real(a[0]) : new Real(a[0], a[1], a.length > 2 ? a[2] : 1, a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0);
    Object.setPrototypeOf(d, new.target ? new.target.prototype : FixedDate.prototype);
    return d;
  }
  FixedDate.prototype = Real.prototype;   // instanceof Date, and every method, keep working
  Object.setPrototypeOf(FixedDate, Real);
  FixedDate.now = now; FixedDate.parse = Real.parse; FixedDate.UTC = Real.UTC;
  g.Date = FixedDate;
  // Seeded Math.random in pages only (mulberry32): shuffles and particles come out the same every run. The server
  // keeps real randomness for ids and tokens.
  if (cfg.seed && typeof window !== 'undefined') {
    var s = cfg.seed >>> 0;
    Math.random = function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
})();
