// The night sky behind the level: stars, a moon and two layers of hills and trees that scroll slower than
// the level (parallax). Deterministic: the same camera position always draws the same picture.
import { PALETTE as C } from './palette.js';

const rand = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const STARS = (() => { const r = rand(7); return Array.from({ length: 70 }, () => ({ x: r() * 640, y: r() * 110, b: r() })); })();

export function drawBackground(ctx, camX, time) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.fillStyle = C.sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.skyLow; ctx.fillRect(0, H * 0.55, W, H * 0.45);
  for (const s of STARS) {
    const x = ((s.x - camX * 0.05) % 640 + 640) % 640;
    if (x > W) continue;
    if (s.b > 0.8 && Math.sin(time * 2 + s.x) > 0.7) continue;   // twinkle
    ctx.fillStyle = C.star; ctx.globalAlpha = 0.4 + s.b * 0.6; ctx.fillRect(Math.round(x), Math.round(s.y), 1, 1);
  }
  ctx.globalAlpha = 1;
  // moon
  const mx = 250 - camX * 0.02;
  ctx.fillStyle = C.moon; ctx.fillRect(Math.round(mx), 22, 12, 12); ctx.fillRect(Math.round(mx) - 1, 24, 14, 8); ctx.fillRect(Math.round(mx) + 2, 21, 8, 14);
  ctx.fillStyle = C.sky; ctx.fillRect(Math.round(mx) + 6, 21, 8, 10);
  layer(ctx, camX * 0.2, C.hillFar, 110, 26, 0.013, 3);
  trees(ctx, camX * 0.35, C.treeFar, 120, 37);
  layer(ctx, camX * 0.5, C.hillNear, 135, 18, 0.02, 11);
  trees(ctx, camX * 0.65, C.treeNear, 145, 53);
}

function layer(ctx, off, color, base, amp, freq, seed) {
  ctx.fillStyle = color;
  for (let x = 0; x < ctx.canvas.width; x += 2) {
    const wx = x + off, y = base + Math.sin(wx * freq + seed) * amp * 0.6 + Math.sin(wx * freq * 2.3 + seed * 2) * amp * 0.4;
    ctx.fillRect(x, Math.round(y), 2, ctx.canvas.height - Math.round(y));
  }
}

function trees(ctx, off, color, base, spacing) {
  ctx.fillStyle = color;
  const first = Math.floor(off / spacing) - 1;
  for (let i = first; i < first + ctx.canvas.width / spacing + 3; i++) {
    const h = 18 + ((i * 7919) % 17), x = Math.round(i * spacing - off + ((i * 31) % 13));
    for (let row = 0; row < h; row += 3) { const w = Math.max(2, Math.round((row / h) * 12)); ctx.fillRect(x - w / 2, base - h + row, w, 3); }
    ctx.fillRect(x - 1, base, 2, 8);
    ctx.fillRect(x - 6, base + 6, 12, ctx.canvas.height);
  }
}
