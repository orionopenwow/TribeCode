#!/usr/bin/env node
// The site and app illustrations, as pixel art (since the pixel-flame brand, see scripts/icon.js and docs/BRAND.md).
// Every piece is drawn on its own pixel grid (one grid cell = one art pixel = 4 units of the old 160×120 / 320×200 /
// 1200×750 drawings, 5 for cooperative), from the compact sprite maps and a few shape helpers below, and written as
// SVG <rect>s with shape-rendering="crispEdges", so it stays sharp at every size and is easy to edit here.
//
// Subtle FX are plain CSS inside each SVG (they run inside <img> too, no script): the fire flickers through 4 frames
// like the logo, a few ember pixels rise, stars twinkle slowly, robot eye LEDs blink now and then. Slow and small, flat
// (no glow, blur or gradient), and all of it stops under prefers-reduced-motion (the rest frame shows).
//   node scripts/pixel-art.js        writes site/assets/art/*.svg, app/ui/assets/illustrations/*.svg (+ the site mirror)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// ---------------------------------------------------------------- palette (Campfire), one character per color
const P = {
  K: '#1D2021', c: '#12151A', S: '#282828', A: '#2E2C2B', s: '#32302F', h: '#3C3836', g: '#45403D', G: '#5C544E', p: '#232526',
  O: '#F26B1D', Y: '#FABD2F', R: '#B4512A', T: '#38C6B1', L: '#8EC07C', I: '#6C7CFF', q: '#83A598',
  W: '#F8FAFC', w: '#E4E4E4', l: '#B9B9B9', b: '#5A3E30', B: '#6E4C39', n: '#3A2A22',
  x: '#3BD16F', r: '#FF6F8E', d: '#1B2028', e: '#2A313C', E: '#232A35',
  // skin tones, light to deep
  1: '#F3CFAE', 2: '#E8B48A', 3: '#C68A5E', 4: '#A86B4A', 5: '#6E4630',
};

// ---------------------------------------------------------------- a pixel grid with a few drawing helpers
class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; return this; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  // a rectangle with its corner pixels cut (r = 1 or 2), the pixel version of a rounded rect
  rrect(x, y, w, h, c, r = 1) {
    this.rect(x, y, w, h, c);
    if (r <= 0) return this;
    const cut = r >= 2 ? [[0, 0], [1, 0], [0, 1]] : [[0, 0]];
    for (const [i, j] of cut) { this.set(x + i, y + j, null); this.set(x + w - 1 - i, y + j, null); this.set(x + i, y + h - 1 - j, null); this.set(x + w - 1 - i, y + h - 1 - j, null); }
    return this;
  }
  // the 1-pixel outline of a rounded rect, filled with `fill` (or left empty)
  frame(x, y, w, h, c, fill, r = 1) { this.rrect(x, y, w, h, c, r); if (fill !== undefined) this.rrect(x + 1, y + 1, w - 2, h - 2, fill, Math.max(0, r - 1) || 0); return this; }
  disc(cx, cy, r, c) { for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) { const dx = x + .5 - cx, dy = y + .5 - cy; if (dx * dx + dy * dy <= r * r) this.set(x, y, c); } return this; }
  ellipse(cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.set(x, y, c); } return this; }
  // Bresenham line; dash = [on, off] for a dotted link
  line(x0, y0, x1, y1, c, dash) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy, k = 0;
    for (;;) { if (!dash || k % (dash[0] + dash[1]) < dash[0]) this.set(x0, y0, c); k++; if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    return this;
  }
  path(pts, c, dash) { for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, dash); return this; }
  // a sprite: rows of characters, '.' or ' ' clear. recolor maps template characters (@ skin, # hair, % top, & pants...)
  sprite(map, x, y, { recolor = {}, flip = false } = {}) {
    map.forEach((row, j) => { const r = flip ? [...row].reverse().join('') : row; [...r].forEach((ch, i) => { if (ch === '.' || ch === ' ') return; const k = recolor[ch] ?? ch; if (k) this.set(x + i, y + j, k); }); });
    return this;
  }
  // fill everything below a height profile (one value per column)
  below(f, c) { for (let x = 0; x < this.w; x++) for (let y = Math.round(f(x)); y < this.h; y++) this.set(x, y, c); return this; }
}

// grid -> <rect>s: horizontal runs per color, then runs stacked on the next rows merged into one taller rect
function rects(grid) {
  const runs = [];
  for (let y = 0; y < grid.h; y++) {
    let x = 0;
    while (x < grid.w) { const c = grid.get(x, y); if (!c) { x++; continue; } let e = x; while (e + 1 < grid.w && grid.get(e + 1, y) === c) e++; runs.push({ x, y, w: e - x + 1, h: 1, c }); x = e + 1; }
  }
  const key = r => `${r.x},${r.w},${r.c}`, open = new Map(), out = [];
  for (const r of runs) {
    const k = key(r), o = open.get(k);
    if (o && o.y + o.h === r.y) { o.h++; continue; }
    if (o) out.push(o);
    open.set(k, r);
  }
  out.push(...open.values());
  const by = {};
  for (const r of out) (by[r.c] = by[r.c] || []).push(r);
  return Object.entries(by).map(([c, rs]) => `<g fill="${P[c] || c}">${rs.sort((a, b) => a.y - b.y || a.x - b.x).map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`).join('')}</g>`).join('');
}

// ---------------------------------------------------------------- sprites
// People, side view, facing right (flip for left). @ skin, # hair (or head wrap), % top, & trousers, * shoes, c eye.
const HEAD = {
  short: ['....####....', '...######...', '..####@@@...', '..###@@c@...', '..##@@@@@@..', '...#@@@@....', '....@@@.....'],
  long: ['...#####....', '..#######...', '..####@@@...', '..###@@c@...', '..###@@@@@..', '..###@@@@...', '..###.@@....'],
  curly: ['..######....', '.########...', '.#####@@@...', '.####@@c@...', '.####@@@@@..', '..###@@@@...', '....@@@.....'],
  wrap: ['...#####....', '..#######...', '..###@@@@...', '..##@@@c@...', '..##@@@@@@..', '..###@@@#...', '...######...'],
  bun: ['..##.###....', '..#######...', '..####@@@...', '..###@@c@...', '..##@@@@@@..', '...#@@@@....', '....@@@.....'],
};
const SIT = {   // seated on a log (the log is b/B), 10 rows
  warm: ['...%%%%%....', '..%%%%%%%%@.', '..%%%%%%....', '..%%%%%%....', '..%%%%%%....', '..%%&&&&&&..', '..&&&&&&&&..', 'bbbbbbbb&&..', 'BBBBBBBB&&..', '........**..'],
  laptop: ['...%%%%%....', '..%%%%%%..w.', '..%%%%%%..wO', '..%%%%%%@.w.', '..%%%%%%%@w.', '..%%&&&&wwww', '..&&&&&&&&..', 'bbbbbbbb&&..', 'BBBBBBBB&&..', '........**..'],
  phone: ['...%%%%%.w..', '..%%%%%%@w..', '..%%%%%%%...', '..%%%%%%....', '..%%%%%%....', '..%%&&&&&&..', '..&&&&&&&&..', 'bbbbbbbb&&..', 'BBBBBBBB&&..', '........**..'],
};
const STAND = { // standing, 13 rows under the head
  phone: ['...%%%%%.w..', '..%%%%%%@w..', '..%%%%%%%...', '..%%%%%%....', '..%%%%%%....', '..%%%%%%....', '...&&&&&....', '...&&.&&....', '...&&.&&....', '...&&.&&....', '...&&.&&....', '...**.**....'],
  arm: ['...%%%%%....', '..%%%%%%%%..', '..%%%%%%.%%.', '..%%%%%%..@.', '..%%%%%%....', '..%%%%%%....', '...&&&&&....', '...&&.&&....', '...&&.&&....', '...&&.&&....', '...&&.&&....', '...**.**....'],
  tablet: ['...%%%%%....', '..%%%%%%.ww.', '..%%%%%%%wO.', '..%%%%%%@ww.', '..%%%%%%.ww.', '..%%%%%%....', '...&&&&&....', '...&&.&&....', '...&&.&&....', '...&&.&&....', '...&&.&&....', '...**.**....'],
};
function person(g, x, y, { head = 'short', pose = 'warm', sit = true, skin = '2', hair = 'K', top = 'q', pants = 'g', shoes = 'K', flip = false } = {}) {
  const recolor = { '@': skin, '#': hair, '%': top, '&': pants, '*': shoes };
  g.sprite(HEAD[head], x, y, { recolor, flip });
  g.sprite((sit ? SIT : STAND)[pose], x, y + 7, { recolor, flip });
}
// the robot agent, facing out; its eyes go on their own layers so they can blink
const ROBOT = ['...........', '.....w.....', '.wwwwwwwww.', 'wwKKKKKKKww', 'wwKKKKKKKww', 'wwKKKKKKKww', 'wwKKKKKKKww', '.wwwwwwwww.', '..ggggggg..', '.GgggggggG.', '.GgggggggG.', '..ggggggg..', 'bbbbbbbbbbb', 'BBBBBBBBBBB'];
const ROBOT_SM = ['wwwwwww', 'wKKKKKw', 'wKKKKKw', 'wKKKKKw', 'wwwwwww'];   // a small head, for the lanes
function robot(g, x, y, fx, { seat = true } = {}) {
  g.sprite(seat ? ROBOT : ROBOT.slice(0, 12), x, y);
  fx.eyes(x + 3, y + 4, x + 7, y + 4, 2);
  fx.pulse(x + 5, y, 'L');
}

// Fires: hand-drawn rest frames; the flicker frames move the tip and the side tongues a pixel, like the logo.
const FIRE_L = [
  '.................', '........O........', '........O........', '.......OO........', '.......OOO.......', '......OOOO.......', '......OOOOO...O..',
  '..O...OOOOO...O..', '..OO.OOOOOOO.OO..', '..OOOOOOOOOOOOO..', '..OOOOOOOYOOOOO..', '.OOOOOOOYYOOOOOO.', '.OOOOOOYYYOOOOOO.',
  '.OOOOOOYYYYOOOOO.', 'OOOOOOYYYYYOOOOOO', 'OOOOOYYYYYYYOOOOO', 'OOOOOYYYYYYYYOOOO', 'OOOOYYYYYYYYYOOOO', '.OOOYYYYYYYYYOOO.',
  '.OOOOYYYYYYYOOOO.', '..OOOOYYYYYOOOO..', '...OOOOOOOOOOO...', '.....OOOOOOO.....',
];
const FIRE_M = [
  '.............', '......O......', '......O......', '.....OO......', '.....OOO.....', '....OOOO..O..', '..O.OOOOO.O..', '..OOOOOOOOO..',
  '..OOOOOYOOOO.', '.OOOOOYYOOOO.', '.OOOOYYYOOOO.', '.OOOYYYYYOOO.', 'OOOOYYYYYYOOO', 'OOOYYYYYYYOOO', '.OOYYYYYYYOO.', '..OOYYYYYOO..', '...OOOOOOO...',
];
const FIRE_S = ['.......', '...O...', '...OO..', '..OOO.O', '.OOOOOO', 'OOOYOOO', 'OOYYYOO', '.OYYYO.', '..OOO..'];
const LOGS_L = ['bbb.............BBB', '.bbbbb.......BBBBB.', '...bbbbbb.BBBBBB...', '.....bbbbBBBBB.....', '...BBBBBB.bbbbbb...', '.BBBBB.......bbbbb.', 'BBB.............bbb'];
const LOGS_M = ['bb.........BB', '.bbbb...BBBB.', '...bbbBBB....', '...BBBbbb....', '.BBBB...bbbb.', 'BB.........bb'];
const LOGS_S = ['bb...BB', '.bbBBB.', '.BBBbb.', 'BB...bb'];

const shiftRow = (row, dx) => dx > 0 ? '.'.repeat(dx) + row.slice(0, row.length - dx) : row.slice(-dx) + '.'.repeat(-dx);
const put = (row, i, ch) => row.slice(0, i) + ch + row.slice(i + 1);
function frames(rest, tip, tongueL, tongueR) {   // tip: the rows of the tip; tongues: [x, y] where a tongue reaches a pixel higher
  const sh = dx => rest.map((r, j) => tip.includes(j) ? shiftRow(r, dx) : r);
  const f1 = sh(1); f1[tongueL[1]] = put(f1[tongueL[1]], tongueL[0], 'O');
  const f2 = rest.slice(); const top = tip[0] - 1; f2[top] = put(f2[top], rest[tip[0]].indexOf('O'), 'O'); f2[tongueR[1]] = put(f2[tongueR[1]], tongueR[0], 'O');
  const f3 = sh(-1);
  return [rest, f1, f2, f3];
}
const FIRES = {
  L: frames(FIRE_L, [1, 2, 3, 4, 5], [2, 6], [14, 5]),
  M: frames(FIRE_M, [1, 2, 3, 4], [2, 5], [10, 4]),
  S: frames(FIRE_S, [1, 2], [6, 2], [1, 4]),
};
const BRACKET = [   // the logo's white pixel bracket, left side ( ; mirror for )
  '...WWW', '..WWWW', '.WWWWW', '.WWWW.', 'WWWW..', 'WWW...', 'WWW...', 'WWW...', 'WWW...', 'WWW...', 'WWW...', 'WWWW..', '.WWWW.', '.WWWWW', '..WWWW', '...WWW',
];
const SPARK = ['...X...', '...X...', '..XXX..', 'XXXXXXX', '..XXX..', '...X...', '...X...'];
const SPARK_S = ['.X.', 'XXX', '.X.'];
const FONT = { O: ['.XX.', 'X..X', 'X..X', 'X..X', '.XX.'], M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'], R: ['XXX.', 'X..X', 'XXX.', 'X.X.', 'X..X'] };
const DOT = {   // round avatar discs, hand-drawn so the edge reads round at this size
  9: ['..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..'],
  7: ['..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..'],
};
// a disc of size n centred on the grid cell (x, y), with a letter on it
function avatar(g, x, y, n, c, ch, ink) { const o = (n - 1) / 2, f = FONT[ch]; g.sprite(tint(DOT[n], c), x - o, y - o); g.sprite(tint(f, ink), x - Math.floor(f[0].length / 2), y - 2); }
const BADGE_OK = ['..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXKKX', 'XKKXXKKXX', 'XXKKKKXXX', 'XXXKKXXXX', '.XXXXXXX.', '..XXXXX..'];
const BADGE_MOON = ['..YYY.', '.YYY..', 'YYY...', 'YYY...', 'YYY...', '.YYY..', '..YYY.'];   // always on
const tint = (map, c) => map.map(r => r.replace(/X/g, c));

// ---------------------------------------------------------------- a piece: base art + FX layers + the CSS they need
function Piece(w, h) {
  const base = new Grid(w, h), layers = [], css = new Set(), parts = [];
  const layer = cls => { const g = new Grid(w, h); layers.push({ cls, g }); return g; };
  const fx = {
    // the fire: the logs on the base, the 4 flicker frames as layers (only one shows at a time)
    fire(size, x, y, { embers = 3 } = {}) {
      const fr = FIRES[size], logs = { L: LOGS_L, M: LOGS_M, S: LOGS_S }[size];
      const fw = fr[0][0].length, lw = logs[0].length, fh = fr[0].length;
      const lx = x + Math.floor((fw - lw) / 2), ly = y + fh - Math.ceil(logs.length / 2) - 1;
      base.sprite(logs, lx, ly);
      fr.forEach((m, i) => layer(`f f${i}`).sprite(m, x, y));
      css.add('fire');
      const cx = x + Math.floor(fw / 2);
      for (let i = 0; i < embers; i++) parts.push(`<rect class="em em${i}" x="${cx + [-3, 2, 0, 4][i % 4]}" y="${y + [3, 5, 1, 4][i % 4]}" width="1" height="1" fill="${P[i % 2 ? 'O' : 'Y']}"/>`);
      if (embers) css.add('embers');
    },
    eyes(x1, y1, x2, y2, hgt = 2, c = 'L') {   // open: 1×hgt LEDs; shut: just the bottom pixel
      const o = layer('eo'), s = layer('ec');
      for (const [x, y] of [[x1, y1], [x2, y2]]) { o.rect(x, y, 1, hgt, c); s.rect(x, y + hgt - 1, 1, 1, c); }
      css.add('blink');
    },
    pulse(x, y, c, n = 1) { parts.push(`<rect class="pu" x="${x}" y="${y}" width="${n}" height="${n}" fill="${P[c]}"/>`); css.add('pulse'); },
    stars(pts, c = 'W') {   // [x, y] pixels, split over three slow twinkle groups
      const gs = [layer('tw tw0'), layer('tw tw1'), layer('tw tw2')];
      pts.forEach(([x, y], i) => gs[i % 3].set(x, y, c));
      css.add('twinkle');
    },
    spark(x, y, small, c = 'Y', twinkle = true) { (twinkle ? layer(`tw tw${(x + y) % 3}`) : base).sprite(tint(small ? SPARK_S : SPARK, c), x, y); if (twinkle) css.add('twinkle'); },
    wave(x, y, sets, c) {   // a voice waveform that breathes between two heights
      sets.forEach((hs, i) => { const g = layer(`wv wv${i}`); hs.forEach((hh, k) => g.rect(x + k * 2, y - Math.floor(hh / 2), 1, hh, c)); });
      css.add('wave');
    },
  };
  function svg(title, { slice = false } = {}) {
    const C = {
      fire: '.f{opacity:0;animation:pf 1.2s steps(1,end) infinite}.f0{opacity:1}.f1{animation-delay:-.9s}.f2{animation-delay:-.6s}.f3{animation-delay:-.3s}@keyframes pf{0%{opacity:1}25%{opacity:0}100%{opacity:0}}',
      embers: '.em{opacity:0;animation:emy 4.8s steps(8,end) infinite,emo 4.8s linear infinite}.em1{animation-delay:-1.6s}.em2{animation-delay:-3.2s}.em3{animation-delay:-2.4s}@keyframes emy{from{transform:translateY(0)}to{transform:translateY(-8px)}}@keyframes emo{0%{opacity:0}15%{opacity:1}70%{opacity:.8}100%{opacity:0}}',
      blink: '.eo{animation:eo 5.6s steps(1,end) infinite}.ec{opacity:0;animation:ec 5.6s steps(1,end) infinite}@keyframes eo{0%{opacity:1}95%{opacity:0}98%{opacity:1}}@keyframes ec{0%{opacity:0}95%{opacity:1}98%{opacity:0}}',
      pulse: '.pu{animation:pu 3.2s steps(1,end) infinite}@keyframes pu{0%{opacity:1}50%{opacity:.35}}',
      twinkle: '.tw{animation:tw 7s ease-in-out infinite}.tw1{animation-duration:9s;animation-delay:-3s}.tw2{animation-duration:11s;animation-delay:-6s}@keyframes tw{0%,100%{opacity:1}50%{opacity:.45}}',
      wave: '.wv1{opacity:0}.wv0,.wv1{animation:wv 2.4s steps(1,end) infinite}.wv1{animation-delay:-1.2s}@keyframes wv{0%{opacity:1}50%{opacity:0}}',
    };
    const st = [...css].map(k => C[k]).join('') + '@media (prefers-reduced-motion:reduce){*{animation:none!important}.f,.ec,.wv1,.em{opacity:0}.f0,.eo,.wv0{opacity:1}}';
    const body = rects(base) + layers.map(({ cls, g }) => `<g class="${cls}">${rects(g)}</g>`).join('') + parts.join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${slice ? ' preserveAspectRatio="xMidYMid slice"' : ''} shape-rendering="crispEdges" role="img" aria-labelledby="t"><title id="t">${title}</title><style>${st}</style>${body}</svg>\n`;
  }
  return { base, layer, fx, svg, w, h };
}

// shared scenery
function pine(g, cx, top, h, c, trunk = 'K') {   // three stepped tiers and a trunk
  const tiers = 3, th = Math.floor(h / tiers);
  for (let t = 0; t < tiers; t++) for (let j = 0; j < th + 2; j++) { const half = Math.floor((j + t * 3) / 2.2) + t; g.rect(cx - half, top + t * th + j, half * 2 + 1, 1, c); }
  g.rect(cx - 1, top + tiers * th + 2, 3, 6, trunk);
}
function tent(g, cx, apex, base) {
  for (let y = apex; y <= base; y++) { const half = Math.round((y - apex) * 0.68); g.rect(cx - half, y, half + 1, 1, 'g'); g.rect(cx + 1, y, half, 1, 'h'); }
  for (let y = apex + 12; y <= base; y++) { const half = Math.round((y - apex - 12) * 0.34); g.rect(cx - half, y, half * 2 + 1, 1, 'O'); }
  g.set(cx - 2, apex - 2, 'G').set(cx - 1, apex - 1, 'G').set(cx + 1, apex - 1, 'G').set(cx + 2, apex - 2, 'G');
}
function moon(g, cx, cy, r, sky) { g.disc(cx, cy, r, 'w'); g.disc(cx + r * 0.45, cy - r * 0.3, r * 0.85, sky); }

// ---------------------------------------------------------------- the pieces
const ART = {};

// The hero backdrop behind the app mock (1200×750 → 300×188 at 4 units a pixel).
ART['site/assets/art/stage-night.svg'] = () => {
  const pc = Piece(300, 188), g = pc.base, fx = pc.fx;
  g.rect(0, 0, 300, 188, 'A').rect(0, 0, 300, 58, 'S');
  moon(g, 290, 24, 7, 'S');
  fx.stars([[8, 5], [37, 7], [65, 3], [97, 8], [130, 4], [164, 7], [197, 3], [226, 8], [257, 5], [277, 9], [296, 40], [287, 53], [5, 33], [11, 65], [3, 92], [295, 75], [120, 12], [245, 14]]);
  fx.spark(22, 1, false); fx.spark(177, 1, true); fx.spark(9, 48, true); fx.spark(293, 62, true);
  g.below(x => 136 - 9 * Math.sin(x / 34) - 5 * Math.sin(x / 13 + 1), 'h');     // far hills
  g.below(x => 158 - 5 * Math.sin(x / 40 + 2) - 2 * Math.sin(x / 17), 's');     // near hills
  g.below(x => 176 + Math.sin(x / 50), 'S');                                    // ground
  pine(g, 7, 82, 76, 'K'); pine(g, -2, 112, 52, 'p');
  pine(g, 291, 75, 84, 'K'); pine(g, 280, 117, 44, 'p');
  tent(g, 167, 152, 177);
  g.ellipse(75, 179, 37, 4, 's');
  fx.fire('M', 69, 160);
  person(g, 23, 158, { head: 'bun', sit: false, pose: 'phone', skin: '2', hair: 'b', top: 'Y', pants: 'B' });
  person(g, 46, 160, { head: 'short', pose: 'laptop', skin: '1', hair: 'K', top: 'q', pants: 'g' });
  person(g, 90, 160, { head: 'wrap', pose: 'warm', skin: '4', hair: 'Y', top: 'O', pants: 'g', flip: true });
  robot(g, 113, 163, fx);
  return pc.svg('A pixel-art night scene: friends and a small robot agent around a campfire, a tent, hills, pines, a moon and stars', { slice: true });
};

// The download card: three friends and a robot round a big fire (320×200 → 80×50).
ART['site/assets/art/tribe.svg'] = () => {
  const pc = Piece(80, 50), g = pc.base, fx = pc.fx;
  fx.stars([[7, 5], [24, 10], [53, 4], [73, 11], [64, 2], [16, 1]]);
  fx.spark(34, 2, false);
  g.below(x => 42.5 - 1.2 * Math.sin(x / 9), 's');
  g.ellipse(40, 45, 18, 2.5, 'h');
  fx.fire('L', 32, 20, { embers: 4 });
  person(g, 14, 31, { head: 'short', pose: 'warm', skin: '2', hair: 'K', top: 'q', pants: 'g' });
  person(g, 52, 31, { head: 'wrap', pose: 'warm', skin: '4', hair: 'Y', top: 'O', pants: 'g', flip: true });
  person(g, 66, 25, { head: 'curly', sit: false, pose: 'phone', skin: '5', hair: 'K', top: 'Y', pants: 'K', flip: true });
  robot(g, 2, 33, fx);
  return pc.svg('Three friends and a robot agent around a campfire under the stars, in pixel art');
};

// Feature: one room (160×120 → 40×30).
ART['site/assets/art/room.svg'] = () => {
  const pc = Piece(40, 30), g = pc.base, fx = pc.fx;
  g.rrect(8, 2, 24, 10, 's', 2); g.rect(18, 12, 3, 1, 's').rect(19, 13, 1, 1, 's');
  g.rect(11, 5, 11, 1, 'W').rect(11, 8, 16, 1, 'l');
  fx.pulse(27, 5, 'L', 2);
  person(g, 1, 15, { head: 'short', sit: false, pose: 'arm', skin: '2', hair: 'K', top: 'q', pants: 'g' });
  robot(g, 14, 16, fx, { seat: false });
  person(g, 27, 15, { head: 'wrap', sit: false, pose: 'arm', skin: '4', hair: 'Y', top: 'O', pants: 'g', flip: true });
  return pc.svg('Two friends and a small robot agent talking in one speech bubble, in pixel art');
};

// Feature: approvals on the phone (40×30).
ART['site/assets/art/phone.svg'] = () => {
  const pc = Piece(40, 30), g = pc.base;
  person(g, 3, 12, { head: 'bun', sit: false, pose: 'arm', skin: '3', hair: 'n', top: 'Y', pants: 'K' });
  g.rect(13, 21, 6, 2, 'Y').rect(19, 20, 2, 2, '3');                                // the arm up to the phone
  g.rrect(21, 5, 12, 21, 'K', 2); g.rect(22, 6, 10, 19, 's');
  g.rect(23, 8, 7, 1, 'l');
  g.rect(23, 11, 8, 6, 'S'); g.rect(24, 12, 5, 1, 'W'); g.rect(24, 14, 3, 2, 'x'); g.rect(28, 14, 2, 2, 'g');
  g.rect(23, 18, 6, 1, 'l').rect(23, 20, 7, 1, 'l').rect(23, 23, 8, 1, 'O');
  g.sprite(tint(BADGE_OK, 'x'), 30, 1);
  return pc.svg('A friend holding a phone that shows an approved request, in pixel art');
};

// Feature: lanes (40×30).
ART['site/assets/art/lanes.svg'] = () => {
  const pc = Piece(40, 30), g = pc.base, fx = pc.fx;
  for (const y of [4, 12, 20]) g.rrect(2, y, 36, 6, 's', 1);
  g.rect(6, 7, 5, 1, 'h').rect(13, 7, 5, 1, 'h').rect(6, 23, 5, 1, 'h').rect(13, 23, 5, 1, 'h').rect(10, 15, 5, 1, 'h').rect(17, 15, 5, 1, 'h');
  const flag = (x, y, c, left) => { g.rect(x, y, 1, 9, 'w'); g.sprite(left ? ['ccc.', 'cccc', 'ccc.'] : ['.ccc', 'cccc', '.ccc'], left ? x + 1 : x - 4, y, { recolor: { c } }); };
  flag(35, 2, 'O', false); flag(4, 10, 'q', true); flag(35, 18, 'Y', false);
  g.sprite(ROBOT_SM, 20, 3); g.sprite(ROBOT_SM, 20, 19);
  fx.eyes(22, 5, 24, 5, 1); fx.eyes(22, 21, 24, 21, 1);
  g.path([[28, 10], [30, 12], [30, 16], [28, 18]], 'L', [1, 1]);
  g.set(26, 17, 'L').set(27, 18, 'L').set(28, 17, 'L').set(29, 16, 'L');
  g.rect(31, 11, 4, 5, 'W'); g.set(34, 11, 'l');
  return pc.svg('Three lanes, each with its own flag, and two robot agents passing a file between lanes, in pixel art');
};

// Feature: the home server (40×30).
ART['site/assets/art/host.svg'] = () => {
  const pc = Piece(40, 30), g = pc.base, fx = pc.fx;
  g.path([[12, 11], [7, 14], [5, 19]], 'G', [1, 1]); g.path([[27, 11], [32, 14], [34, 20]], 'G', [1, 1]); g.line(20, 18, 20, 23, 'G', [1, 1]);
  g.rrect(12, 3, 16, 15, 'w', 1); g.rect(13, 4, 14, 9, 'K');
  fx.fire('S', 17, 4, { embers: 0 });
  g.rect(14, 14, 8, 1, 'l').rect(14, 16, 8, 1, 'l');
  pc.fx.pulse(25, 15, 'L');
  g.rect(13, 18, 2, 1, 'l').rect(25, 18, 2, 1, 'l');
  g.sprite(BADGE_MOON, 29, 0);
  g.rrect(2, 19, 6, 10, 'w', 1); g.rect(3, 20, 4, 7, 'q');
  g.rrect(31, 20, 8, 6, 'w', 1); g.rect(32, 21, 6, 4, 'Y'); g.rect(30, 26, 10, 1, 'l');
  g.rrect(18, 24, 5, 6, 'w', 1); g.rect(19, 25, 3, 4, 'I');
  return pc.svg('A small home server with a campfire on its screen and a moon badge for always on, linked to two phones and a laptop, in pixel art');
};

// App: cooperative workspaces (320×220 → 64×44 at 5 units a pixel).
ART['app/ui/assets/illustrations/cooperative.svg'] = () => {
  const pc = Piece(64, 44), g = pc.base, fx = pc.fx;
  g.frame(18, 5, 28, 20, 'T', 'd', 1); g.rect(19, 6, 26, 3, 'E');
  g.set(20, 7, 'r').set(22, 7, 'Y').set(24, 7, 'x');
  g.sprite(['..W', '.W.', 'W..', '.W.', '..W'], 25, 12); g.sprite(['W..', '.W.', '..W', '.W.', 'W..'], 37, 12);
  fx.fire('S', 29, 10, { embers: 0 });
  g.rect(20, 11, 3, 1, 'T').rect(20, 13, 2, 1, 'T').rect(41, 11, 3, 1, 'O').rect(42, 13, 2, 1, 'O').rect(20, 21, 4, 1, 'T').rect(25, 21, 3, 1, 'O').rect(40, 21, 4, 1, 'T');
  g.line(32, 25, 32, 28, 'T'); g.line(24, 28, 40, 28, 'T'); g.line(24, 28, 28, 31, 'T'); g.line(40, 28, 36, 31, 'T'); g.line(28, 31, 36, 31, 'T');
  for (const [x, y] of [[24, 28], [40, 28], [28, 31], [36, 31]]) g.set(x, y, 'Y');
  pc.fx.pulse(32, 28, 'O');
  person(g, 5, 24, { head: 'curly', sit: false, pose: 'arm', skin: '2', hair: 'O', top: 'O', pants: 'g' });
  person(g, 47, 24, { head: 'long', sit: false, pose: 'tablet', skin: '4', hair: 'K', top: 'T', pants: 'g', flip: true });
  return pc.svg('Two friends building together at a shared screen, in pixel art');
};

// App: the campfire huddle (80×55).
ART['app/ui/assets/illustrations/campfire.svg'] = () => {
  const pc = Piece(80, 55), g = pc.base, fx = pc.fx;
  g.sprite(BRACKET, 3, 19); g.sprite(BRACKET, 71, 19, { flip: true });
  g.ellipse(40, 49, 18, 2.5, 'K');
  fx.fire('L', 32, 23, { embers: 3 });
  person(g, 15, 33, { head: 'short', pose: 'phone', skin: '2', hair: 'K', top: 'T', pants: 'g' });
  person(g, 53, 33, { head: 'wrap', pose: 'warm', skin: '4', hair: 'Y', top: 'O', pants: 'g', flip: true });
  [[29, 8, 'O', 'O', 'W'], [40, 6, 'I', 'M', 'W'], [51, 8, 'T', 'R', 'c']].forEach(([x, y, c, ch, ink]) => { avatar(g, x, y, 9, c, ch, ink); g.rect(x + 3, y + 3, 2, 2, 'x'); });
  return pc.svg('A campfire between code brackets with friends gathered around, in pixel art');
};

// App: the local brain (80×55).
ART['app/ui/assets/illustrations/brain.svg'] = () => {
  const pc = Piece(80, 55), g = pc.base, fx = pc.fx;
  // two hemispheres from overlapping lobes, an ember outline round a dark fill
  const shape = new Grid(80, 55);
  for (const [x, y, r] of [[33, 15, 7], [28, 22, 7], [27, 31, 7], [31, 39, 6], [37, 41, 5], [37, 12, 5], [34, 27, 8]]) { shape.disc(x, y, r, 1); shape.disc(80 - x, y, r, 1); }
  for (let y = 0; y < 55; y++) for (let x = 0; x < 80; x++) if (shape.get(x, y)) {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !shape.get(x + a, y + b));
    g.set(x, y, edge || x === 39 || x === 40 ? 'O' : 'd');
  }
  g.rect(39, 6, 2, 1, null);
  const tr = (pts) => g.path(pts, 'O');
  tr([[36, 13], [36, 18], [31, 21], [31, 26]]); tr([[36, 18], [29, 18]]); tr([[31, 26], [28, 29]]); tr([[36, 30], [36, 26], [31, 26]]); tr([[36, 35], [31, 38], [31, 41]]); tr([[36, 30], [33, 33]]);
  tr([[43, 13], [43, 18], [48, 21], [48, 26]]); tr([[43, 18], [50, 18]]); tr([[48, 26], [51, 29]]); tr([[43, 30], [43, 26], [48, 26]]); tr([[43, 35], [48, 38], [48, 41]]); tr([[43, 30], [46, 33]]);
  const nodes = [[36, 13], [29, 18], [28, 29], [31, 41], [33, 33], [43, 13], [50, 18], [51, 29], [48, 41], [46, 33]];
  nodes.forEach(([x, y]) => g.set(x, y, 'Y'));
  const blink = pc.layer('tw tw1'); [[29, 18], [51, 29], [31, 41]].forEach(([x, y]) => blink.set(x - 1, y, 'Y').set(x + 1, y, 'Y').set(x, y - 1, 'Y').set(x, y + 1, 'Y'));
  // traces out to the files
  g.path([[21, 17], [15, 17], [13, 14]], 'T'); g.line(20, 27, 10, 27, 'T'); g.path([[21, 37], [15, 37], [13, 40]], 'T');
  g.path([[58, 17], [64, 17], [66, 14]], 'T'); g.line(60, 27, 66, 27, 'T'); g.line(58, 37, 63, 37, 'T');
  const doc = (x, y, c) => { g.rect(x, y, 7, 8, 'W'); g.rect(x + 5, y, 2, 2, 'l'); g.set(x + 6, y, null); g.rect(x + 1, y + 4, 4, 1, c).rect(x + 1, y + 6, 3, 1, c); };
  doc(7, 9, 'T'); doc(7, 40, 'O'); doc(66, 8, 'T');
  g.rect(3, 26, 4, 1, 'O').rect(3, 29, 3, 1, 'O').rect(69, 26, 6, 1, 'O').rect(69, 29, 4, 1, 'O');
  for (const y of [20, 33]) { g.line(5, y, 5, y + 2, 'T'); g.set(4, y + 1, 'T').set(6, y + 1, 'T'); g.rect(3, y + 4, 5, 1, 'T'); }
  fx.spark(65, 38, false, 'O'); fx.spark(72, 34, true, 'Y');
  return pc.svg('A circuit brain connected to files, with a sparkle, in pixel art');
};

// App: the huddle chat (80×55).
ART['app/ui/assets/illustrations/chat.svg'] = () => {
  const pc = Piece(80, 55), g = pc.base, fx = pc.fx;
  avatar(g, 8, 9, 9, 'O', 'O', 'W'); g.rect(11, 12, 2, 2, 'x');
  avatar(g, 8, 24, 9, 'I', 'M', 'W'); g.rect(11, 27, 2, 2, 'x');
  avatar(g, 7, 37, 7, 'O', 'O', 'W'); avatar(g, 7, 48, 7, 'I', 'M', 'W');
  g.frame(16, 5, 38, 9, 'e', 'E', 2); g.rect(20, 9, 17, 1, 'W').rect(39, 9, 8, 1, 'T');
  g.frame(57, 7, 20, 5, 'T', null, 1); g.rect(58, 8, 14, 3, 'T');
  fx.wave(17, 24, [[1, 3, 6, 2, 8, 4, 1, 5, 2, 1], [2, 5, 3, 6, 4, 7, 3, 2, 4, 1]], 'l');
  g.rrect(40, 20, 3, 5, 'l', 1); g.set(39, 24, 'l').set(43, 24, 'l').rect(40, 26, 3, 1, 'l').set(41, 27, 'l');
  g.frame(57, 21, 20, 5, 'O', null, 1); g.rect(58, 22, 11, 3, 'O');
  g.frame(12, 34, 43, 7, 'e', 'd', 2); g.rect(16, 37, 24, 1, 'W');
  fx.fire('S', 47, 32, { embers: 0 });
  g.frame(12, 45, 40, 7, 'e', 'd', 2); g.rect(16, 48, 20, 1, 'W').rect(38, 48, 6, 1, 'T');
  fx.spark(62, 38, false, 'O');
  return pc.svg('A live chat feed with avatars, a voice waveform and progress bars, in pixel art');
};

module.exports = { ART, Grid, rects, P };

if (require.main === module) {
  for (const [file, make] of Object.entries(ART)) {
    const out = make();
    const targets = [file];
    if (file.startsWith('app/ui/assets/illustrations/')) targets.push(file.replace('app/ui/assets/', 'site/assets/'));
    for (const t of targets) { fs.writeFileSync(path.join(root, t), out); console.log('wrote', t, `(${out.length} bytes)`); }
  }
}
