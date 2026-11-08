// The pixel wordmark (since v0.15.1): chunky pixel letters, "Tribe" in white and "Code" in Ember, each with a
// darker shade along the bottom edges and a near-black outline, so it reads on any background. Drawn from the glyph
// maps below on a unit grid (crispEdges rects), like the icon (scripts/icon.js).   require('./wordmark-pixel').wordmark()
'use strict';
const H = 15;   // cap height in units; x-height starts at row 4
// '#' = filled. Each glyph is H rows; widths vary.
const G = {
  T: ['###########', '###########', '###########', ...Array(12).fill('....###....')],
  r: ['........', '........', '........', '........', '###.####', '########', ...Array(9).fill('###.....')],
  i: ['###', '###', '###', '...', ...Array(11).fill('###')],
  b: [...Array(4).fill('###.......'), '#########.', '##########', '##########', ...Array(5).fill('###....###'), '##########', '##########', '#########.'],
  e: ['..........', '..........', '..........', '..........', '.########.', '##########', '##########', '###....###', '##########', '##########', '##########', '###.......', '##########', '##########', '.#########'],
  C: ['.##########', '###########', '###########', '###.....###', ...Array(7).fill('###........'), '###.....###', '###########', '###########', '.##########'],
  o: ['..........', '..........', '..........', '..........', '.########.', '##########', '##########', ...Array(5).fill('###....###'), '##########', '##########', '.########.'],
  d: [...Array(4).fill('.......###'), '.#########', '##########', '##########', ...Array(5).fill('###....###'), '##########', '##########', '.#########'],
};
const fixRow = (g) => g.map(r => r.replace(/\./g, ' '));
function wordmark({ tribe = '#F8FAFC', tribeShade = '#A8A29E', code = '#F26B1D', codeShade = '#A8471B', outline = '#12151A', u = 6 } = {}) {
  const word = [['T', 0], ['r', 0], ['i', 0], ['b', 0], ['e', 0], ['C', 1], ['o', 1], ['d', 1], ['e', 1]];
  const PAD = 2, GAP = 1;   // outline room around the word, gap between letters (outlines meet in it)
  // place glyphs on a grid
  let x = PAD; const cells = new Map();   // "x,y" -> 0 tribe | 1 code
  for (const [ch, part] of word) {
    const rows = G[ch], w = Math.max(...rows.map(r => r.length));
    rows.forEach((r, y) => { [...r].forEach((c, i) => { if (c === '#') cells.set(`${x + i},${y + PAD}`, part); }); });
    x += w + GAP;
  }
  const W = x - GAP + PAD, HH = H + PAD * 2 + 1;   // one extra row: the outline is thicker at the bottom
  const has = (a, b) => cells.has(`${a},${b}`);
  const out = [], fill = { 0: [], 1: [] }, shade = { 0: [], 1: [] };
  for (let yy = 0; yy < HH; yy++) for (let xx = 0; xx < W; xx++) {
    if (has(xx, yy)) {
      const p = cells.get(`${xx},${yy}`), low = !has(xx, yy + 1) || (yy >= H + PAD - 2 && !has(xx, yy + 2));
      (low ? shade : fill)[p].push([xx, yy]);
    } else {
      // outline: any neighbour (8-way) filled, or a filled cell two above (the heavier bottom edge)
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (has(xx + dx, yy + dy)) { near = true; break; }
      if (!near && has(xx, yy - 2) && !has(xx, yy - 1) === false) near = true;
      if (!near && (has(xx, yy - 2) || has(xx - 1, yy - 2) || has(xx + 1, yy - 2)) && yy >= H + PAD) near = true;
      if (near) out.push([xx, yy]);
    }
  }
  // merge horizontal runs into rects
  const rects = (pts, color) => {
    const byRow = new Map(); pts.forEach(([a, b]) => { if (!byRow.has(b)) byRow.set(b, []); byRow.get(b).push(a); });
    let s = '';
    for (const [yy, xs] of byRow) { xs.sort((a, b) => a - b); let st = xs[0], pv = xs[0]; for (let i = 1; i <= xs.length; i++) { if (xs[i] === pv + 1) { pv = xs[i]; continue; } s += `<rect x="${st * u}" y="${yy * u}" width="${(pv - st + 1) * u}" height="${u}"/>`; st = pv = xs[i]; } }
    return `<g fill="${color}">${s}</g>`;
  };
  const body = rects(out, outline) + rects(fill[0], tribe) + rects(shade[0], tribeShade) + rects(fill[1], code) + rects(shade[1], codeShade);
  return { body, width: W * u, height: HH * u };
}
module.exports = { wordmark };
