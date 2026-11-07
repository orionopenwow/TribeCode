// Tile collision shared by everything that moves. Bodies are boxes { x, y, w, h, vx, vy } in pixels.
// Solid tiles block from every side; one-way planks only catch a body falling onto them from above.
import { TILE } from '../levels/loader.js';

export function moveAndCollide(body, dt, level) {
  body.onGround = false;
  // X first, then Y: simple and stable for small boxes on a grid.
  body.x += body.vx * dt;
  for (const t of overlapping(body, level)) {
    if (!level.isSolid(t.tx, t.ty)) continue;
    if (body.vx > 0) body.x = t.tx * TILE - body.w;
    else if (body.vx < 0) body.x = (t.tx + 1) * TILE;
    body.vx = 0;
  }
  const prevBottom = body.y + body.h;
  body.y += body.vy * dt;
  for (const t of overlapping(body, level)) {
    const solid = level.isSolid(t.tx, t.ty);
    const plank = !solid && level.isPlank(t.tx, t.ty) && body.vy >= 0 && prevBottom <= t.ty * TILE + 0.01;
    if (!solid && !plank) continue;
    if (body.vy > 0 || plank) { body.y = t.ty * TILE - body.h; body.onGround = true; }
    else if (body.vy < 0) body.y = (t.ty + 1) * TILE;
    body.vy = 0;
  }
  // Keep inside the level horizontally.
  if (body.x < 0) { body.x = 0; body.vx = 0; }
  const maxX = level.w * TILE - body.w;
  if (body.x > maxX) { body.x = maxX; body.vx = 0; }
}

// Thorns hurt in the lower half of their tile, water anywhere in it.
export function touchesHazard(body, level) {
  for (const t of overlapping(body, level)) {
    const k = level.kindAt(t.tx, t.ty);
    if (k === '~') return 'water';
    if (k === '^' && body.y + body.h > t.ty * TILE + TILE * 0.45) return 'thorns';
  }
  return null;
}

export function overlapping(body, level) {
  const out = [];
  const x0 = Math.floor(body.x / TILE), x1 = Math.floor((body.x + body.w - 0.001) / TILE);
  const y0 = Math.floor(body.y / TILE), y1 = Math.floor((body.y + body.h - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (level.inside(tx, ty)) out.push({ tx, ty });
  return out;
}

export const boxesOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
