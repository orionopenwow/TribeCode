// Full-screen moments: the title, the level hint, "lantern lit", pause and the final win screen.
// Drawn on the display canvas over a dimmed game picture.
import { PALETTE as C } from '../art/palette.js';
import { text, clock } from './hud.js';

function veil(ctx, alpha = 0.55) { ctx.fillStyle = `rgba(8, 10, 18, ${alpha})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
const blink = time => Math.floor(time * 2) % 2 === 0;
const cta = () => (document.body.classList.contains('has-touch') ? 'Tap to start' : 'Press Enter');

export function drawTitle(ctx, s, time) {
  veil(ctx, 0.45);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  text(ctx, 'LANTERN RUN', W / 2, H * 0.28, { s, size: 22, align: 'center', color: C.uiAccent });
  text(ctx, 'Carry your little flame through the night', W / 2, H * 0.28 + 30 * s, { s, size: 6, align: 'center', weight: 'normal' });
  text(ctx, 'and light the three lanterns.', W / 2, H * 0.28 + 39 * s, { s, size: 6, align: 'center', weight: 'normal' });
  if (blink(time)) text(ctx, cta(), W / 2, H * 0.68, { s, size: 8, align: 'center' });
  text(ctx, '←/→ or A/D run · Space jump · M mute · P pause', W / 2, H - 14 * s, { s, size: 5, align: 'center', color: C.uiDim, weight: 'normal' });
}

export function drawHint(ctx, s, level, alpha) {
  if (alpha <= 0) return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.globalAlpha = Math.min(1, alpha);
  text(ctx, level.name, W / 2, H * 0.3, { s, size: 12, align: 'center', color: C.uiAccent });
  text(ctx, level.hint, W / 2, H * 0.3 + 18 * s, { s, size: 6, align: 'center', weight: 'normal' });
  ctx.globalAlpha = 1;
}

export function drawLevelDone(ctx, s, level, time, last) {
  veil(ctx, 0.35);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  text(ctx, 'Lantern lit!', W / 2, H * 0.32, { s, size: 16, align: 'center', color: C.uiAccent });
  text(ctx, `${level.name} · ${level.embers.filter(e => e.taken).length}/${level.embers.length} embers`, W / 2, H * 0.32 + 22 * s, { s, size: 6, align: 'center', weight: 'normal' });
  if (blink(time)) text(ctx, last ? cta() : `${cta()} for the next lantern`, W / 2, H * 0.66, { s, size: 7, align: 'center' });
}

export function drawPause(ctx, s) {
  veil(ctx, 0.6);
  text(ctx, 'Paused', ctx.canvas.width / 2, ctx.canvas.height * 0.42, { s, size: 14, align: 'center' });
  text(ctx, 'P to keep going', ctx.canvas.width / 2, ctx.canvas.height * 0.42 + 20 * s, { s, size: 6, align: 'center', color: C.uiDim, weight: 'normal' });
}

export function drawWin(ctx, s, time, stats) {
  veil(ctx, 0.5);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  text(ctx, 'The night is bright', W / 2, H * 0.22, { s, size: 14, align: 'center', color: C.uiAccent });
  text(ctx, `All three lanterns lit in ${clock(stats.time)}`, W / 2, H * 0.22 + 24 * s, { s, size: 7, align: 'center', weight: 'normal' });
  text(ctx, `Embers ${stats.embers}/${stats.totalEmbers} · Flames lost ${stats.deaths}`, W / 2, H * 0.22 + 36 * s, { s, size: 7, align: 'center', weight: 'normal' });
  if (blink(time)) text(ctx, `${cta()} to play again`, W / 2, H * 0.7, { s, size: 7, align: 'center' });
}
