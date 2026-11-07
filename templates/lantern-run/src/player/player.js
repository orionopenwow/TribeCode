// Wick, the little flame you play. Movement, jump, coyote time, jump buffering, variable jump height.
// update() returns events ('jump', 'land', 'bounce') for the audio and art lanes to react to.
import { TUNING as T } from './tuning.js';
import { moveAndCollide, boxesOverlap } from '../core/physics.js';

export function createPlayer(start) {
  return {
    x: start.x + 1, y: start.y + (10 - T.height), w: T.width, h: T.height,
    vx: 0, vy: 0, onGround: false, facing: 1,
    coyote: 0, buffer: 0, jumping: false,
    squash: 0,                // art: >0 squashed (landing), <0 stretched (jumping)
    alive: true,
  };
}

export function updatePlayer(p, input, dt, level) {
  const events = [];
  const dir = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
  if (dir) p.facing = dir;

  // Run: accelerate toward the target speed, brake with friction when no key is held.
  const target = dir * T.runSpeed;
  const accel = dir ? (p.onGround ? T.accel : T.airAccel) : (p.onGround ? T.friction : T.airAccel * 0.4);
  if (p.vx < target) p.vx = Math.min(target, p.vx + accel * dt);
  else if (p.vx > target) p.vx = Math.max(target, p.vx - accel * dt);

  // Jump: buffered presses and a short grace after leaving a ledge make it forgiving.
  if (input.pressed('jump')) p.buffer = T.jumpBuffer; else p.buffer = Math.max(0, p.buffer - dt);
  p.coyote = p.onGround ? T.coyoteTime : Math.max(0, p.coyote - dt);
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -T.jumpSpeed; p.buffer = 0; p.coyote = 0; p.jumping = true; p.squash = -1;
    events.push('jump');
  }
  if (p.jumping && p.vy < 0 && !input.held('jump')) { p.vy *= T.jumpCut; p.jumping = false; }
  if (p.vy >= 0) p.jumping = false;

  p.vy = Math.min(T.maxFall, p.vy + T.gravity * dt);
  const wasGround = p.onGround, fallSpeed = p.vy;
  moveAndCollide(p, dt, level);
  if (p.onGround && !wasGround && fallSpeed > 120) { p.squash = 1; events.push('land'); }

  // Bounce mushrooms: land on one and it throws you up.
  for (const m of level.mushrooms) {
    const box = { x: m.x + 1, y: m.y + 4, w: 8, h: 6 };
    if (fallSpeed > 0 && boxesOverlap(p, box) && p.y + p.h <= box.y + 5) {
      p.y = box.y - p.h; p.vy = -T.bounceSpeed; p.jumping = false; p.squash = -1; m.squash = 1;
      events.push('bounce');
    }
  }
  p.squash *= Math.pow(0.001, dt);   // eases back to 0
  return events;
}
