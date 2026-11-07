// Keyboard + touch input. Game code reads actions (left, right, jump, start, pause, mute), never raw keys.
// `pressed(action)` is true for one frame after the key goes down (edges are cleared by endFrame()).
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump',
  Enter: 'start', KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
};

export function createInput(target = window) {
  const held = new Set(), edges = new Set();
  const listeners = [];
  const down = a => { if (!held.has(a)) edges.add(a); held.add(a); listeners.forEach(f => f(a)); };
  const up = a => held.delete(a);

  target.addEventListener('keydown', e => {
    const a = KEYS[e.code]; if (!a) return;
    e.preventDefault(); if (!e.repeat) down(a);
  });
  target.addEventListener('keyup', e => { const a = KEYS[e.code]; if (a) up(a); });
  target.addEventListener('blur', () => held.clear());

  // On-screen buttons (index.html) for phones; tapping the canvas also counts as "start".
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('has-touch');
  for (const b of document.querySelectorAll('[data-key]')) {
    const a = b.dataset.key;
    b.addEventListener('pointerdown', e => { e.preventDefault(); down(a); if (a === 'jump') down('start'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { up(a); if (a === 'jump') up('start'); });
  }
  const canvas = document.getElementById('game');
  if (canvas) canvas.addEventListener('pointerdown', () => { down('start'); setTimeout(() => up('start'), 50); });

  return {
    held: a => held.has(a),
    pressed: a => edges.has(a),
    endFrame: () => edges.clear(),
    onAny: f => listeners.push(f),        // first input unlocks audio
    press: down, release: up,             // the debug hook (window.__lantern) drives these too
  };
}
