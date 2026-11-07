// The heads-up display: level name, the light meter, embers and time. Drawn on the full-size display canvas
// (crisp text) on top of the scaled-up game picture. `s` is the pixel scale (display px per game px).
import { PALETTE as C } from '../art/palette.js';

export const font = (s, size, weight = 'bold') => `${weight} ${Math.round(size * s)}px ui-monospace, Consolas, Menlo, monospace`;

export function text(ctx, str, x, y, { s, size = 7, color = C.ui, align = 'left', weight } = {}) {
  ctx.font = font(s, size, weight); ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(str, x + s * 0.6, y + s * 0.6);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

export function drawHud(ctx, s, { level, light, embers, totalEmbers, time, muted }) {
  const pad = 6 * s;
  text(ctx, `${level.index + 1} · ${level.name}`, pad, pad, { s, size: 7 });
  // light meter
  const bw = 60 * s, bh = 5 * s, bx = pad, by = pad + 11 * s;
  ctx.fillStyle = C.uiPanel; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = light > 0.25 ? C.uiAccent : C.uiBad; ctx.fillRect(bx, by, Math.round(bw * Math.max(0, light)), bh);
  ctx.strokeStyle = C.uiBorder; ctx.lineWidth = Math.max(1, s * 0.5); ctx.strokeRect(bx, by, bw, bh);
  text(ctx, 'light', bx + bw + 4 * s, by - 1 * s, { s, size: 5, color: C.uiDim, weight: 'normal' });
  const W = ctx.canvas.width;
  text(ctx, `✦ ${embers}/${totalEmbers}`, W - pad, pad, { s, size: 7, align: 'right', color: C.uiAccent });
  text(ctx, clock(time) + (muted ? '  muted' : ''), W - pad, pad + 10 * s, { s, size: 5, align: 'right', color: C.uiDim, weight: 'normal' });
}

export const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
