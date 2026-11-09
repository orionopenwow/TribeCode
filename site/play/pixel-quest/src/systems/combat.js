// Sword swing and hits. Owner: combat lane.
export function combat(world, dt, t) {
  const p = world.player, i = world.input || {};
  if (i.swing && p.swing <= 0) p.swing = t.swingTime;
  if (p.swing > 0) {
    p.swing -= dt;
    const hx = p.facing > 0 ? p.x + p.w : p.x - 14;
    for (const s of world.slimes) if (s.alive && s.x + 12 > hx && s.x < hx + 14 && Math.abs(s.y - p.y) < 16) s.alive = false;
  }
}
