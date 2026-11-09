// Everything you see. Owner: art lane. Swap these shapes for sprites in src/art/ any time.
export function draw(ctx, w) {
  ctx.clearRect(0, 0, 480, 270);
  ctx.fillStyle = '#2A313C'; for (const s of w.platforms) ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = '#E8B04A'; for (const c of w.coins) if (!c.taken) { ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#38C6B1'; for (const s of w.slimes) if (s.alive) { ctx.beginPath(); ctx.ellipse(s.x + 6, s.y + 6, 7, 6, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(s.x - 1, s.y + 6, 14, 6); }
  const p = w.player;
  ctx.fillStyle = '#F26B1D'; ctx.fillRect(p.x, p.y, p.w, p.h);
  if (p.swing > 0) { ctx.fillStyle = '#F8FAFC'; ctx.fillRect(p.facing > 0 ? p.x + p.w : p.x - 12, p.y + 6, 12, 3); }
  ctx.fillStyle = '#F8FAFC'; ctx.font = '10px monospace'; ctx.fillText(`♥ ${p.hp}   ● ${p.coins}`, 8, 14);
}
