// Levels are JSON files in this folder: { name, hint, tiles: [18 strings] }. One character per 10x10 tile:
//   .  empty        #  ground        =  stone          -  one-way plank (jump up through it)
//   ^  thorns       ~  water         *  ember (refills your light)
//   B  bounce mushroom               P  player start   L  the lantern to light (the goal)
// Add a level: drop level-4.json next to these and add it to LEVELS.
export const TILE = 10;
export const LEVELS = ['level-1.json', 'level-2.json', 'level-3.json'];
const ENTITIES = new Set(['P', 'L', '*', 'B']);

// The raw JSON of every level, fetched once. parseLevel() makes a fresh, playable copy each time a level starts.
export async function loadAll() {
  return Promise.all(LEVELS.map(async name => {
    const res = await fetch(new URL(name, import.meta.url));
    if (!res.ok) throw new Error(`could not load ${name} (${res.status})`);
    return res.json();
  }));
}

export function parseLevel(data, index = 0) {
  const rows = data.tiles.map(r => r.split(''));
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const level = { index, name: data.name || `Level ${index + 1}`, hint: data.hint || '', w, h,
    start: { x: TILE, y: (h - 4) * TILE }, lantern: null, embers: [], mushrooms: [], rows };
  rows.forEach((row, ty) => row.forEach((ch, tx) => {
    if (!ENTITIES.has(ch)) return;
    const at = { x: tx * TILE, y: ty * TILE };
    if (ch === 'P') level.start = at;
    else if (ch === 'L') level.lantern = { ...at, lit: false };
    else if (ch === '*') level.embers.push({ ...at, taken: false });
    else if (ch === 'B') level.mushrooms.push({ ...at, squash: 0 });
    row[tx] = '.';
  }));
  if (!level.lantern) level.lantern = { x: (w - 3) * TILE, y: (h - 4) * TILE, lit: false };
  level.inside = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h;
  level.kindAt = (tx, ty) => (level.inside(tx, ty) ? rows[ty][tx] || '.' : '.');
  level.isSolid = (tx, ty) => { const k = level.kindAt(tx, ty); return k === '#' || k === '='; };
  level.isPlank = (tx, ty) => level.kindAt(tx, ty) === '-';
  return level;
}
