// First-person controls: click to capture the mouse (pointer lock) and look around, WASD to walk, Shift to walk
// faster, arrow keys to turn without a mouse. The Player lane owns this folder.
import { collide } from '../scene/room.js';

const EYE = 1.6, RADIUS = 0.3, WALK = 2.4, RUN = 4.2, LOOK = 0.0022, TURN = 2.2;

export function createPlayer(camera, room, dom) {
  const keys = new Set();
  const p = { x: 0, z: 4.6, yaw: 0, pitch: -0.05, locked: false, enabled: false,
    yawForward: () => p.yaw + Math.PI,   // facing angle in the patrons' convention (0 = +z)
  };
  camera.rotation.order = 'YXZ';

  addEventListener('keydown', e => { if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { keys.add(e.code); if (p.enabled && e.code.startsWith('Arrow')) e.preventDefault(); } });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  document.addEventListener('pointerlockchange', () => { p.locked = document.pointerLockElement === dom; });
  document.addEventListener('mousemove', e => {
    if (!p.locked) return;
    p.yaw -= e.movementX * LOOK; p.pitch = Math.max(-1.3, Math.min(1.3, p.pitch - e.movementY * LOOK));
  });
  p.lock = () => { try { const r = dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} };
  p.unlock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  p.press = code => keys.add(code); p.release = code => keys.delete(code);   // the debug hook drives these

  p.update = dt => {
    if (p.enabled) {
      const k = c => keys.has(c);
      if (k('ArrowLeft')) p.yaw += TURN * dt;
      if (k('ArrowRight')) p.yaw -= TURN * dt;
      const f = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      const s = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
      if (f || s) {
        const speed = (k('ShiftLeft') || k('ShiftRight') ? RUN : WALK) * dt / Math.hypot(f, s);
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
        const c = collide({ x: p.x + (fx * f + rx * s) * speed, z: p.z + (fz * f + rz * s) * speed }, RADIUS, room.colliders, room.bounds);
        p.x = c.x; p.z = c.z;
      }
    }
    camera.position.set(p.x, EYE, p.z);
    camera.rotation.set(p.pitch, p.yaw, 0);
  };
  return p;
}
