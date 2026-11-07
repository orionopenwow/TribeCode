// Slimes patrol and bump the player. Owner: combat lane.
export function enemies(world, dt, t) {
  const p = world.player;
  for (const s of world.slimes) {
    if (!s.alive) continue;
    s.x += Math.sign(s.vx) * t.slimeSpeed * dt;
    if (s.x < 200 || s.x > 460) s.vx *= -1;
    if (Math.abs(s.x - p.x) < 12 && Math.abs(s.y - p.y) < 14 && p.swing <= 0) { p.hp = Math.max(0, p.hp - 1); p.x = 40; p.y = 200; }
  }
}
