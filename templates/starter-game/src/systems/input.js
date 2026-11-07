// Keyboard + touch. Owner: core lane.
const keys = new Set();
addEventListener('keydown', e => keys.add(e.key.toLowerCase()));
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
const touch = { left: false, right: false, jump: false, swing: false };
const canvas = document.getElementById('game');
const zone = e => { const r = canvas.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; return x < 0.33 ? 'left' : x > 0.66 ? 'right' : 'jump'; };
canvas.addEventListener('pointerdown', e => { touch[zone(e)] = true; });
addEventListener('pointerup', () => { touch.left = touch.right = touch.jump = false; });

export function input(world) {
  const k = n => keys.has(n);
  world.input = {
    left: k('arrowleft') || k('a') || touch.left,
    right: k('arrowright') || k('d') || touch.right,
    jump: k(' ') || k('w') || k('arrowup') || touch.jump,
    swing: k('j') || k('x'),
  };
}
