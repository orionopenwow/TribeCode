// Pixel Quest: the game loop. The world lives here and survives code edits; each mechanic is a
// system in src/systems/ (one file per mechanic, one owner per file, see LANES.json).
import tuning from './data/tuning.js';
import { input } from './systems/input.js';
import { movement } from './systems/movement.js';
import { combat } from './systems/combat.js';
import { enemies } from './systems/enemies.js';
import { draw } from './art/draw.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

export const world = {
  player: { x: 40, y: 200, vx: 0, vy: 0, w: 12, h: 16, onGround: false, jumps: 0, facing: 1, hp: 3, swing: 0, coins: 0 },
  platforms: [
    { x: 0, y: 250, w: 480, h: 20 }, { x: 120, y: 200, w: 70, h: 8 }, { x: 230, y: 165, w: 70, h: 8 }, { x: 350, y: 130, w: 80, h: 8 },
  ],
  coins: [{ x: 150, y: 185 }, { x: 260, y: 150 }, { x: 385, y: 115 }].map(c => ({ ...c, taken: false })),
  slimes: [{ x: 300, y: 238, vx: -0.6, alive: true }],
  time: 0,
};

const systems = [input, movement, combat, enemies];
let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  world.time += dt;
  for (const s of systems) {
    try { s(world, dt, tuning); } catch (e) { console.error('system failed:', s.name, e); }   // one broken mechanic never stops the game
  }
  draw(ctx, world, tuning);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
