// Running, jumping (double jump), landing on platforms. Owner: movement lane.
let jumpHeld = false;
export function movement(world, dt, t) {
  const p = world.player, i = world.input || {};
  p.vx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
  if (p.vx) p.facing = p.vx;
  p.vx *= t.runSpeed;
  if (i.jump && !jumpHeld && p.jumps < t.maxJumps) { p.vy = -t.jumpVelocity; p.jumps++; p.onGround = false; }
  jumpHeld = !!i.jump;
  p.vy += t.gravity * dt;
  p.x = Math.max(0, Math.min(480 - p.w, p.x + p.vx * dt));
  const prevBottom = p.y + p.h;
  p.y += p.vy * dt;
  p.onGround = false;
  for (const s of world.platforms) {
    const over = p.x + p.w > s.x && p.x < s.x + s.w;
    if (over && p.vy >= 0 && prevBottom <= s.y && p.y + p.h >= s.y) { p.y = s.y - p.h; p.vy = 0; p.onGround = true; p.jumps = 0; }
  }
  for (const c of world.coins) if (!c.taken && Math.abs(p.x + 6 - c.x) < 10 && Math.abs(p.y + 8 - c.y) < 12) { c.taken = true; p.coins++; }
}
