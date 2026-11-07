// Everything in the world is drawn in code from the palette: no image files to load.
// All functions draw on the low-resolution game canvas (320x180) in world pixels minus the camera.
import { PALETTE as C } from './palette.js';
import { TILE } from '../levels/loader.js';

const px = (ctx, x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
// A tiny deterministic noise so ground speckles stay put between frames.
const hash = (x, y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967295; };

export function drawTiles(ctx, level, camX, time) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(level.w - 1, Math.ceil((camX + ctx.canvas.width) / TILE));
  for (let ty = 0; ty < level.h; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = level.kindAt(tx, ty); if (k === '.') continue;
    const x = tx * TILE - camX, y = ty * TILE;
    const openAbove = !level.isSolid(tx, ty - 1) && level.kindAt(tx, ty - 1) !== '~';
    if (k === '#') {
      px(ctx, x, y, TILE, TILE, C.ground);
      if (hash(tx, ty) > 0.6) px(ctx, x + 2 + Math.floor(hash(ty, tx) * 5), y + 3 + Math.floor(hash(tx + 7, ty) * 5), 2, 1, C.groundDark);
      if (openAbove) { px(ctx, x, y, TILE, 3, C.grass); px(ctx, x, y, TILE, 1, C.grassLight); if (hash(tx, 99) > 0.5) px(ctx, x + 3, y - 2, 1, 2, C.grassLight); }
    } else if (k === '=') {
      px(ctx, x, y, TILE, TILE, C.stone); px(ctx, x, y, TILE, 1, C.stoneLight); px(ctx, x, y + TILE - 1, TILE, 1, C.stoneDark);
      px(ctx, x + (ty % 2 ? 4 : 0), y + 4, 1, 4, C.stoneDark);
    } else if (k === '-') {
      px(ctx, x, y, TILE, 3, C.plank); px(ctx, x, y, TILE, 1, C.plankLight); px(ctx, x + 8, y + 1, 1, 2, C.plankDark);
      if (!level.isPlank(tx - 1, ty)) px(ctx, x + 1, y + 3, 2, 3, C.plankDark);
      if (!level.isPlank(tx + 1, ty)) px(ctx, x + 7, y + 3, 2, 3, C.plankDark);
    } else if (k === '^') {
      for (let i = 0; i < 3; i++) { const bx = x + 1 + i * 3; px(ctx, bx, y + 8, 3, 2, C.thorn); px(ctx, bx + 1, y + 5, 1, 3, C.thorn); px(ctx, bx + 1, y + 5, 1, 1, C.thornLight); }
    } else if (k === '~') {
      px(ctx, x, y, TILE, TILE, C.water);
      if (level.kindAt(tx, ty - 1) !== '~') { const w = Math.round(Math.sin(time * 3 + tx) * 1.5); px(ctx, x, y, TILE, 1, C.waterLight); px(ctx, x + 3 + w, y + 2, 3, 1, C.waterLight); }
    }
  }
}

export function drawPlayer(ctx, p, camX, time, dim = 1) {
  const sq = p.squash || 0, w = Math.round(8 + sq * 2), h = Math.round(9 - sq * 2);
  const cx = p.x + p.w / 2 - camX, bottom = p.y + p.h;
  const x = cx - w / 2, y = bottom - h;
  ctx.globalAlpha = dim;
  // flame tip, flickering
  const flick = Math.sin(time * 18) > 0 ? 1 : 0;
  px(ctx, cx - 2 - p.facing, y - 3 - flick, 3, 3, C.flameEdge);
  px(ctx, cx - 1 - p.facing, y - 5 - flick, 2, 2, C.flame);
  // body
  px(ctx, x, y + 1, w, h - 1, C.flameEdge);
  px(ctx, x + 1, y, w - 2, h, C.flame);
  px(ctx, x + 2, y + 3, w - 4, h - 4, C.flameCore);
  // eyes look where you run
  const ex = cx + p.facing * 1.5;
  px(ctx, ex - 2, y + 3, 1, 2, C.eye); px(ctx, ex + 1, y + 3, 1, 2, C.eye);
  ctx.globalAlpha = 1;
}

export function drawEmber(ctx, e, camX, time) {
  if (e.taken) return;
  const bob = Math.round(Math.sin(time * 4 + e.x * 0.1) * 1.5);
  const x = e.x + 3 - camX, y = e.y + 3 + bob;
  px(ctx, x, y, 4, 4, C.ember); px(ctx, x + 1, y + 1, 2, 2, C.emberCore);
  if (Math.sin(time * 9 + e.x) > 0.6) px(ctx, x + 1, y - 2, 1, 1, C.ember);
}

export function drawMushroom(ctx, m, camX) {
  const x = m.x - camX, y = m.y, s = Math.round((m.squash || 0) * 2);
  px(ctx, x + 4, y + 6, 2, 4, C.mushroomStem);
  px(ctx, x, y + 3 + s, TILE, 4 - s, C.mushroomCap);
  px(ctx, x + 1, y + 2 + s, TILE - 2, 1, C.mushroomCap);
  px(ctx, x + 2, y + 4 + s, 1, 1, C.mushroomDots); px(ctx, x + 6, y + 3 + s, 2, 1, C.mushroomDots);
}

export function drawLantern(ctx, l, camX, time) {
  const x = l.x - camX, y = l.y;
  px(ctx, x + 4, y - 14, 2, 24, C.post); px(ctx, x + 4, y - 14, 1, 24, C.postLight);
  px(ctx, x + 1, y - 16, 8, 2, C.post);
  const glow = l.lit ? (Math.sin(time * 10) > -0.3 ? C.flameCore : C.flame) : C.glassDark;
  px(ctx, x + 2, y - 24, 6, 8, C.post);
  px(ctx, x + 3, y - 23, 4, 6, l.lit ? C.glass : C.glassDark);
  px(ctx, x + 4, y - 21, 2, 3, glow);
  px(ctx, x + 1, y - 26, 8, 2, C.post);
}

export const lightOf = {
  player: (p, camX, strength) => ({ x: p.x + p.w / 2 - camX, y: p.y + p.h / 2, r: 18 + 42 * strength }),
  ember: (e, camX) => ({ x: e.x + 5 - camX, y: e.y + 5, r: 10 }),
  lantern: (l, camX) => ({ x: l.x + 5 - camX, y: l.y - 20, r: l.lit ? 90 : 8 }),
};
