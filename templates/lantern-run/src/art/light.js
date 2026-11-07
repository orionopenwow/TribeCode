// The night: a dark layer over the world with holes cut out around lights. Lights are drawn as three hard-edged
// rings (pixel-art banding) instead of a smooth fade.
import { PALETTE as C } from './palette.js';

let layer = null;

export function drawDarkness(ctx, lights) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!layer || layer.width !== W || layer.height !== H) { layer = document.createElement('canvas'); layer.width = W; layer.height = H; }
  const d = layer.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, W, H);
  d.fillStyle = C.darkness; d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    if (l.x < -l.r || l.x > W + l.r) continue;
    for (const [scale, alpha] of [[1, 0.35], [0.72, 0.65], [0.45, 1]]) {
      d.globalAlpha = alpha; d.beginPath(); d.arc(Math.round(l.x), Math.round(l.y), Math.max(2, l.r * scale), 0, Math.PI * 2); d.fill();
    }
  }
  d.globalAlpha = 1; d.globalCompositeOperation = 'source-over';
  ctx.drawImage(layer, 0, 0);
}
