// Tiny sound effects made with WebAudio oscillators: no sound files. Browsers only allow audio after the
// first key press or tap, so main.js calls unlock() then. M toggles mute.
const SOUNDS = {
  // [wave, start Hz, end Hz, seconds, volume]
  jump:   [['square', 280, 560, 0.12, 0.10]],
  land:   [['triangle', 140, 70, 0.07, 0.12]],
  bounce: [['square', 220, 880, 0.22, 0.10]],
  ember:  [['triangle', 880, 1320, 0.08, 0.10], ['triangle', 1320, 1760, 0.08, 0.08, 0.06]],
  hurt:   [['sawtooth', 300, 60, 0.3, 0.10]],
  lit:    [['triangle', 523, 523, 0.12, 0.10], ['triangle', 659, 659, 0.12, 0.10, 0.12], ['triangle', 784, 784, 0.25, 0.10, 0.24]],
  win:    [['triangle', 523, 523, 0.15, 0.10], ['triangle', 659, 659, 0.15, 0.10, 0.15], ['triangle', 784, 784, 0.15, 0.10, 0.3], ['triangle', 1047, 1047, 0.4, 0.10, 0.45]],
  click:  [['square', 660, 660, 0.04, 0.06]],
};

let ctx = null, muted = false;

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) { try { ctx = new AC(); } catch { ctx = null; } }
}

export function play(name) {
  if (!ctx || muted || !SOUNDS[name]) return;
  const now = ctx.currentTime;
  for (const [wave, f0, f1, dur, vol, delay = 0] of SOUNDS[name]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = now + delay;
    o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
}

export const toggleMute = () => (muted = !muted);
export const isMuted = () => muted;
