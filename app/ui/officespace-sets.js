// Office Space sets (pass 11): everything the pixel office is drawn from, in code, by TribeCode. No image from anywhere
// else. A set is a palette plus small drawing functions for tiles and furniture; characters are built from parts.
// The same format can come as JSON from the marketplace later (docs/OFFICE-SPACE.md): { id, name, palette, sprites? }
// where sprites maps an item name to { src: 'data:image/png;base64,…', w, h } (16 px per tile) drawn instead of the code.
//   window.TribeOfficeSets = { list(), get(id), add(manifest), drawTile, drawItem, drawPerson, drawAgent, drawFlint, PARTS,
//     ITEMS, defaultLayout(n), seedLook(id) }
(function () {
  'use strict';
  const T = 16;   // px per tile
  // Read a palette token so the floor follows the app's own colours; fall back to the tokens' values.
  const tok = (name, fb) => { try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; } catch { return fb; } };
  const ember = () => tok('--ember', '#F26B1D'), teal = () => tok('--live', '#38C6B1'), indigo = () => tok('--peer', '#6C7CFF');

  const SETS = new Map();
  function add(m) {
    if (!m || typeof m !== 'object' || !/^[a-z0-9-]{2,32}$/.test(m.id || '')) return false;
    const p = Object.assign({}, SETS.get('tribecode') ? SETS.get('tribecode').palette : {}, m.palette || {});
    const sprites = {};
    for (const [k, v] of Object.entries(m.sprites || {})) {   // optional pictures from a set file: only data: PNGs, never a web address
      if (!v || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.src || '')) continue;
      const img = new Image(); img.src = v.src; sprites[k] = { img, w: Math.max(1, Math.min(4, v.w | 0 || 1)), h: Math.max(1, Math.min(4, v.h | 0 || 1)) };
    }
    SETS.set(m.id, { id: m.id, name: String(m.name || m.id).slice(0, 40), palette: p, sprites, night: !!m.night });
    return true;
  }
  // TribeCode: the app's matte greys with Ember, Teal and Indigo accents.
  add({ id: 'tribecode', name: 'TribeCode', palette: {
    floor: '#1E242D', floor2: '#1B2028', wall: '#2A313C', wallTop: '#3A4250', carpet: '#24303A', wood: '#3B3128', wood2: '#33291F', tile: '#222A33', tileLine: '#2A333E',
    desk: '#4A3E33', deskTop: '#5A4C3E', metal: '#8B95A3', screen: '#12151A', screenOn: '#1F3F3B', glow: '#38C6B1', chair: '#2E3642', chairTop: '#3B4452',
    plant: '#3BD16F', plantDark: '#2A8F4E', pot: '#7A5A44', sofa: '#6C7CFF', sofaDark: '#525FC6', cork: '#7A5A3C', paper: '#E8E1D3', mug: '#E8E1D3', rug: '#2B3542', rug2: '#323D4C',
    lamp: '#F2C46D', shadow: 'rgba(0,0,0,0.28)', ink: '#12151A' } });
  // Night studio: the second set, to show sets change the whole floor (dark blue floor, warm lamps).
  add({ id: 'night', name: 'Night studio', night: true, palette: {
    floor: '#151B2B', floor2: '#131827', wall: '#232B42', wallTop: '#323C5A', carpet: '#1C2440', wood: '#2B2230', wood2: '#241C29', tile: '#182036', tileLine: '#202945',
    desk: '#3A2E3E', deskTop: '#4A3A4E', screenOn: '#2B2A4A', glow: '#F2C46D', chair: '#262E48', chairTop: '#323B5A', sofa: '#B5623A', sofaDark: '#8E4A2B', rug: '#222B47', rug2: '#28324F', lamp: '#FFD38A' } });

  const list = () => [...SETS.values()].map(s => ({ id: s.id, name: s.name }));
  const get = id => SETS.get(id) || SETS.get('tribecode');

  // ---------- tiles ----------
  function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function drawTile(c, set, t, x, y, gx, gy) {
    const p = set.palette;
    if (t === 'wall') { px(c, x, y, T, T, p.wall); px(c, x, y, T, 3, p.wallTop); px(c, x, y + T - 1, T, 1, p.shadow); return; }
    if (t === 'carpet') { px(c, x, y, T, T, p.carpet); if ((gx + gy) % 2 === 0) px(c, x + 7, y + 7, 2, 2, p.floor2); return; }
    if (t === 'wood') { px(c, x, y, T, T, p.wood); px(c, x, y + (gx % 2 ? 5 : 11), T, 1, p.wood2); px(c, x + (gy % 2 ? 4 : 12), y, 1, T, p.wood2); return; }
    if (t === 'tile') { px(c, x, y, T, T, p.tile); px(c, x, y, T, 1, p.tileLine); px(c, x, y, 1, T, p.tileLine); return; }
    px(c, x, y, T, T, (gx + gy) % 2 ? p.floor : p.floor2);
  }

  // ---------- furniture (r: 0 faces down, 1 left, 2 up, 3 right) ----------
  const ITEMS = {
    desk: { block: true, seat: true }, plant: { block: true }, board: { block: true, wall: true }, sofa: { seat: true }, think: { seat: true },
    coffee: { block: true }, table: { block: true }, shelf: { block: true }, lamp: { block: true }, rug: { floor: true },
  };
  const SEAT = [[0, 1], [-1, 0], [0, -1], [1, 0]];   // where the chair is, from the desk, for each turn
  function drawItem(c, set, it, x, y, opt = {}) {
    const p = set.palette, s = set.sprites[it.t];
    if (s && s.img.complete && s.img.naturalWidth) { c.drawImage(s.img, x, y, s.w * T, s.h * T); return; }
    switch (it.t) {
      case 'rug': px(c, x + 1, y + 1, T - 2, T - 2, p.rug); px(c, x + 3, y + 3, T - 6, T - 6, p.rug2); break;
      case 'desk': {
        px(c, x + 1, y + 12, 14, 2, p.shadow);
        px(c, x + 1, y + 5, 14, 8, p.desk); px(c, x + 1, y + 5, 14, 2, p.deskTop);
        // monitor, turned to the chair
        const on = !!opt.on, scr = on ? p.screenOn : p.screen;
        px(c, x + 4, y + 1, 8, 6, p.metal); px(c, x + 5, y + 2, 6, 4, scr); px(c, x + 7, y + 7, 2, 1, p.metal);
        if (on) { const k = opt.tick || 0; px(c, x + 6, y + 3, 1 + (k % 3), 1, p.glow); px(c, x + 6, y + 5, 2 + ((k + 1) % 3), 1, p.glow); }
        px(c, x + 11, y + 8, 3, 2, p.paper);   // keyboard / papers
        break;
      }
      case 'chair': px(c, x + 4, y + 5, 8, 8, p.chair); px(c, x + 4, y + 5, 8, 2, p.chairTop); px(c, x + 7, y + 13, 2, 2, p.metal); break;
      case 'plant': px(c, x + 5, y + 10, 6, 5, p.pot); px(c, x + 4, y + 3, 8, 7, p.plant); px(c, x + 6, y + 1, 4, 3, p.plant); px(c, x + 5, y + 6, 2, 3, p.plantDark); px(c, x + 9, y + 4, 2, 3, p.plantDark); break;
      case 'board': {
        px(c, x + 1, y + 2, 14, 11, p.cork); const n = Math.min(6, opt.count || 3), cols = [ember(), teal(), indigo(), p.paper, p.lamp, p.plant];
        for (let i = 0; i < n; i++) px(c, x + 3 + (i % 3) * 4, y + 4 + Math.floor(i / 3) * 4, 3, 3, cols[i]);
        break;
      }
      case 'sofa': px(c, x, y + 4, T, 9, p.sofaDark); px(c, x + 1, y + 6, T - 2, 6, p.sofa); px(c, x, y + 4, T, 2, p.sofaDark); px(c, x, y + 13, T, 1, p.shadow); break;
      case 'think': px(c, x + 2, y + 6, 12, 8, p.sofaDark); px(c, x + 3, y + 7, 10, 6, p.sofa); px(c, x + 12, y + 1, 2, 6, p.metal); px(c, x + 10, y, 6, 2, p.lamp); break;
      case 'coffee': px(c, x, y + 5, T, 9, p.desk); px(c, x, y + 5, T, 2, p.deskTop); px(c, x + 3, y + 1, 5, 5, p.metal); px(c, x + 10, y + 3, 3, 3, p.mug); break;
      case 'table': px(c, x, y + 4, T, 9, p.desk); px(c, x + 1, y + 5, T - 2, 7, p.deskTop); px(c, x + 6, y + 7, 4, 3, p.paper); break;
      case 'shelf': px(c, x + 1, y + 1, 14, 13, p.desk); for (let r = 0; r < 3; r++) { px(c, x + 2, y + 2 + r * 4, 12, 3, p.wood2); px(c, x + 3 + r * 3, y + 2 + r * 4, 2, 3, [ember(), teal(), indigo()][r]); } break;
      case 'lamp': px(c, x + 7, y + 4, 2, 10, p.metal); px(c, x + 4, y + 1, 8, 4, p.lamp); px(c, x + 5, y + 14, 6, 1, p.shadow); break;
    }
  }

  // ---------- characters, built from parts ----------
  const PARTS = { body: 4, skin: 6, hair: 7, hairColor: 8, top: 6, topColor: 10, acc: 5 };
  const SKIN = ['#F3D2B3', '#E0AC85', '#C68A62', '#9A6544', '#6E4630', '#4A2F22'];
  const HAIR = ['#2B2420', '#5A3A22', '#8A5A2B', '#C48A3F', '#E5C27A', '#B9B4AD', '#7A2E2E', '#3A4A7A'];
  const TOPS = () => [indigo(), ember(), teal(), '#3BD16F', '#FF6F8E', '#8B95A3', '#E8E1D3', '#2E3A59', '#7E5A9B', '#D8A73C'];
  const NAMES = { body: ['Slim', 'Regular', 'Broad', 'Short'], hair: ['None', 'Short', 'Side part', 'Long', 'Bun', 'Curly', 'Mohawk'], top: ['Tee', 'Hoodie', 'Shirt', 'Overalls', 'Jacket', 'Long top'], acc: ['None', 'Glasses', 'Headphones', 'Cap', 'Earrings'] };
  const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  function seedLook(id) {
    let h = hash(id); const pick = n => { const v = h % n; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; return v; };
    return { body: pick(4), skin: pick(6), hair: pick(7), hairColor: pick(8), top: pick(6), topColor: pick(10), acc: pick(5) };
  }
  const shade = (hex, f) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()); if (!m) return hex; const n = parseInt(m[1], 16); const ch = k => Math.max(0, Math.min(255, Math.round(((n >> k) & 255) * f))); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };

  // A person in a 16x24 cell, feet at the bottom. pose: stand | walk | sit | type | read. dir: 0 down, 1 left, 2 up, 3 right.
  function drawPerson(c, look, x, y, pose = 'stand', frame = 0, dir = 0) {
    const L = Object.assign(seedLook('x'), look || {});
    const skin = SKIN[L.skin], hair = HAIR[L.hairColor], top = TOPS()[L.topColor], dark = shade(top, 0.72), legs = '#2E3642';
    const bw = [6, 7, 8, 6][L.body], bh = L.body === 3 ? 6 : 7, sit = pose === 'sit' || pose === 'type' || pose === 'read';
    const cx = x + 8, by = y + (sit ? 12 : 11) + (L.body === 3 ? 1 : 0);
    px(c, cx - 4, y + 22, 8, 2, 'rgba(0,0,0,0.25)');
    // legs
    if (sit) { px(c, cx - 3, by + bh, 2, 3, legs); px(c, cx + 1, by + bh, 2, 3, legs); }
    else { const a = pose === 'walk' ? (frame % 2 ? 1 : -1) : 0; px(c, cx - 3, by + bh, 2, 5 + a, legs); px(c, cx + 1, by + bh, 2, 5 - a, legs); px(c, cx - 3, by + bh + 4 + a, 2, 1, '#1B2028'); px(c, cx + 1, by + bh + 4 - a, 2, 1, '#1B2028'); }
    // body and top
    const bx = cx - Math.ceil(bw / 2);
    px(c, bx, by, bw, bh, top);
    if (L.top === 1) { px(c, bx, by, bw, 2, dark); px(c, cx - 1, by + 2, 2, 3, dark); }               // hoodie
    if (L.top === 2) { px(c, cx - 1, by, 2, 2, '#E8E1D3'); px(c, cx, by + 2, 1, bh - 2, dark); }       // shirt
    if (L.top === 3) { px(c, bx + 1, by + 2, bw - 2, bh - 2, '#3A4A7A'); }                              // overalls
    if (L.top === 4) { px(c, bx, by, 1, bh, dark); px(c, bx + bw - 1, by, 1, bh, dark); px(c, cx - 1, by, 1, bh, '#E8E1D3'); }   // jacket
    if (L.top === 5) { px(c, bx - 1, by + bh - 2, bw + 2, 2, top); }                                     // long top
    // arms and hands
    const ty = pose === 'type' ? (frame % 2) : 0;
    if (pose === 'type' && dir === 2) { px(c, bx - 1, by + 1, 1, 3, top); px(c, bx + bw, by + 1, 1, 3, top); px(c, bx, by - 1 + ty, 2, 1, skin); px(c, bx + bw - 2, by - ty, 2, 1, skin); }
    else if (pose === 'read') { px(c, bx - 1, by + 1, 1, 4, top); px(c, bx + bw, by + 1, 1, 4, top); px(c, cx - 3, by + 3, 6, 4, '#E8E1D3'); px(c, cx - 3, by + 3, 6, 1, indigo()); }
    else { const sw = pose === 'walk' ? (frame % 2 ? 1 : 0) : 0; px(c, bx - 1, by + 1 + sw, 1, 5, top); px(c, bx + bw, by + 1 + (1 - sw) * (pose === 'walk' ? 1 : 0), 1, 5, top); px(c, bx - 1, by + 6 + sw, 1, 1, skin); px(c, bx + bw, by + 6, 1, 1, skin); }
    // head
    const hx = cx - 3, hy = by - 7;
    px(c, hx, hy, 6, 6, skin);
    if (dir === 0) { px(c, hx + 1, hy + 3, 1, 1, '#12151A'); px(c, hx + 4, hy + 3, 1, 1, '#12151A'); }
    else if (dir === 1) px(c, hx + 1, hy + 3, 1, 1, '#12151A');
    else if (dir === 3) px(c, hx + 4, hy + 3, 1, 1, '#12151A');
    // hair
    switch (L.hair) {
      case 1: px(c, hx, hy - 1, 6, 2, hair); break;
      case 2: px(c, hx - 1, hy - 1, 7, 2, hair); px(c, hx - 1, hy, 1, 3, hair); break;
      case 3: px(c, hx - 1, hy - 1, 8, 2, hair); px(c, hx - 1, hy, 1, 7, hair); px(c, hx + 6, hy, 1, 7, hair); if (dir === 2) px(c, hx, hy, 6, 6, hair); break;
      case 4: px(c, hx, hy - 1, 6, 2, hair); px(c, hx + 2, hy - 3, 3, 2, hair); break;
      case 5: px(c, hx - 1, hy - 2, 8, 3, hair); px(c, hx - 1, hy + 1, 1, 2, hair); px(c, hx + 6, hy + 1, 1, 2, hair); break;
      case 6: px(c, hx + 2, hy - 3, 2, 4, hair); break;
    }
    if (L.hair && dir === 2 && L.hair !== 3 && L.hair !== 6) px(c, hx, hy, 6, 3, hair);
    // accessory
    if (L.acc === 1 && dir !== 2) { px(c, hx, hy + 3, 6, 1, '#12151A'); }
    if (L.acc === 2) { px(c, hx - 1, hy + 2, 1, 3, '#12151A'); px(c, hx + 6, hy + 2, 1, 3, '#12151A'); px(c, hx, hy - 1, 6, 1, '#12151A'); }
    if (L.acc === 3) { px(c, hx - 1, hy - 2, 8, 2, ember()); if (dir === 0) px(c, hx, hy, 6, 1, shade(ember(), 0.7)); }
    if (L.acc === 4 && dir !== 2) { px(c, hx - 1, hy + 4, 1, 1, '#F2C46D'); px(c, hx + 6, hy + 4, 1, 1, '#F2C46D'); }
  }

  // An AI helper: a small round robot. The accent follows its tool (Claude warm, Cursor pale, Codex green, others indigo).
  const ACCENT = { claude: '#E08A5B', cursor: '#C9D3DC', codex: '#3BD16F', gemini: '#6C9BFF', qwen: '#B07CFF' };
  function drawAgent(c, id, kind, x, y, pose = 'stand', frame = 0, dir = 0) {
    const h = hash(id), body = shade(teal(), 0.75 + (h % 4) * 0.08), acc = ACCENT[String(kind || '').toLowerCase()] || indigo(), metal = '#C9D3DC';
    const sit = pose === 'sit' || pose === 'type' || pose === 'read', bob = !sit && pose === 'walk' ? frame % 2 : 0, cx = x + 8, by = y + (sit ? 12 : 11) - bob;
    px(c, cx - 4, y + 22, 8, 2, 'rgba(0,0,0,0.25)');
    if (sit) { px(c, cx - 3, by + 7, 6, 3, shade(body, 0.7)); }
    else { px(c, cx - 3, by + 7, 2, 4, metal); px(c, cx + 1, by + 7, 2, 4, metal); px(c, cx - 4, by + 10, 3, 2, shade(body, 0.6)); px(c, cx + 1, by + 10, 3, 2, shade(body, 0.6)); }
    px(c, cx - 4, by, 8, 7, body); px(c, cx - 1, by + 2, 2, 2, acc);                          // body with a chest light
    const t = pose === 'type' ? frame % 2 : 0;
    px(c, cx - 5, by + 1 + t, 1, 4, metal); px(c, cx + 4, by + 2 - t, 1, 4, metal);           // arms
    const hy = by - 7;
    px(c, cx - 4, hy, 8, 6, metal); px(c, cx - 3, hy + 1, 6, 4, '#12151A');                  // head with a face screen
    if (dir !== 2) { const blink = frame % 23 === 0; px(c, cx - 2, hy + 2, 1, blink ? 1 : 2, teal()); px(c, cx + 1, hy + 2, 1, blink ? 1 : 2, teal()); if (pose === 'read') px(c, cx - 2, hy + 4, 4, 1, acc); }
    const ant = h % 3; px(c, cx, hy - 2, 1, 2, metal); px(c, cx - (ant === 1 ? 1 : 0), hy - 3, ant === 2 ? 3 : 2, 1, acc);
  }
  // Flint: a little flame with eyes.
  function drawFlint(c, x, y, pose = 'stand', frame = 0) {
    const e = ember(), cx = x + 8, f = frame % 2, by = y + 8;
    px(c, cx - 4, y + 22, 8, 2, 'rgba(0,0,0,0.25)');
    px(c, cx - 4, by + 6, 8, 8, e); px(c, cx - 3, by + 3, 6, 4, e); px(c, cx - 1 + f, by, 2, 4, e);
    px(c, cx - 2, by + 8, 4, 5, '#F2C46D'); px(c, cx - 1, by + 6, 2, 3, '#F2C46D');
    px(c, cx - 2, by + 9, 1, 2, '#12151A'); px(c, cx + 1, by + 9, 1, 2, '#12151A');
    if (pose === 'walk') px(c, cx - 4 + f * 7, by + 13, 1, 1, e);
  }

  // ---------- the default floor: desks for everyone, a lounge, a thinking corner, the task board, coffee and a meeting table ----------
  function defaultLayout(n = 6) {
    const rows = Math.max(2, Math.ceil(Math.max(6, n) / 4)), w = 24, h = Math.max(14, 6 + rows * 3);
    const tiles = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = y === 0 || x === 0 || x === w - 1 || y === h - 1;
      tiles.push(edge && !(y === h - 1 && (x === 11 || x === 12)) ? 'wall' : x >= 15 && y <= 5 ? 'carpet' : x >= 15 && y >= h - 6 ? 'wood' : 'floor');
    }
    const items = [];
    for (let r = 0; r < rows; r++) for (let k = 0; k < 4; k++) items.push({ t: 'desk', x: 2 + k * 3, y: 2 + r * 3, r: 0 });
    items.push({ t: 'board', x: 6, y: 0, r: 0 }, { t: 'board', x: 7, y: 0, r: 0 });
    items.push({ t: 'think', x: 19, y: 2, r: 0 }, { t: 'think', x: 21, y: 2, r: 0 }, { t: 'lamp', x: 17, y: 1, r: 0 }, { t: 'plant', x: 22, y: 1, r: 0 }, { t: 'shelf', x: 16, y: 1, r: 0 });
    const ly = h - 4;
    items.push({ t: 'rug', x: 18, y: ly, r: 0 }, { t: 'rug', x: 19, y: ly, r: 0 }, { t: 'rug', x: 20, y: ly, r: 0 }, { t: 'sofa', x: 18, y: ly - 1, r: 0 }, { t: 'sofa', x: 19, y: ly - 1, r: 0 }, { t: 'sofa', x: 20, y: ly - 1, r: 0 });
    items.push({ t: 'coffee', x: 22, y: h - 2, r: 0 }, { t: 'plant', x: 16, y: h - 2, r: 0 }, { t: 'plant', x: 1, y: h - 2, r: 0 });
    items.push({ t: 'table', x: 17, y: 8, r: 0 }, { t: 'table', x: 18, y: 8, r: 0 }, { t: 'table', x: 19, y: 8, r: 0 });
    return { v: 1, w, h, tiles, items, areas: [{ name: 'Desks', x: 1, y: 1, w: 13, h: h - 3 }, { name: 'Thinking corner', x: 15, y: 1, w: 8, h: 5 }, { name: 'Lounge', x: 15, y: h - 6, w: 8, h: 5 }] };
  }

  window.TribeOfficeSets = { T, list, get, add, drawTile, drawItem, drawPerson, drawAgent, drawFlint, PARTS, NAMES, SKIN, HAIR, TOPS, ITEMS, SEAT, defaultLayout, seedLook };
})();
