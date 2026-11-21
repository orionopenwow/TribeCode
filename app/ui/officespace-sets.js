// Office Space sets (pass 11b): how the floor looks. A set is the same small manifest as before:
//   { id, name, palette: { floor, wood, tile, carpet, stone, wall, void }, sprites? }
// Palette values are a colour (#hex) or a colourise value { h, s, b, c } for the grey Pixel Agents floor and wall art
// (app/ui/officespace-art.js). sprites (optional) maps a furniture id to { src: 'data:image/png;base64,…', w, h } in tiles,
// drawn instead of the art; only data: PNGs are read, never a web address.
//   window.TribeOfficeSets = { T, list(), get(id), add(manifest), FLOORS, floorOf(kind), seedLook(id), LOOK }
(function () {
  'use strict';
  const T = 16;
  const SETS = new Map();
  function add(m) {
    if (!m || typeof m !== 'object' || !/^[a-z0-9-]{2,32}$/.test(m.id || '')) return false;
    const base = SETS.get('office'), p = Object.assign({}, base ? base.palette : {}, m.palette || {});
    const sprites = {};
    for (const [k, v] of Object.entries(m.sprites || {})) {
      if (!v || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.src || '')) continue;
      const img = new Image(); img.src = v.src; sprites[k] = { img, w: Math.max(1, Math.min(4, v.w | 0 || 1)), h: Math.max(1, Math.min(4, v.h | 0 || 1)) };
    }
    SETS.set(m.id, { id: m.id, name: String(m.name || m.id).slice(0, 40), palette: p, sprites, night: !!m.night });
    return true;
  }
  // Office: Pixel Agents' own look (wood work room, blue lounge, checker floor, navy walls), its default colours.
  add({ id: 'office', name: 'Office', palette: {
    wall: { h: 214, s: 30, b: -100, c: -55 }, wood: { h: 25, s: 48, b: -43, c: -88 }, floor: { h: 209, s: 39, b: -25, c: -80 },
    tile: { h: 209, s: 0, b: -16, c: -8 }, stone: { h: 35, s: 30, b: 15, c: 0 }, carpet: { h: 0, s: 71, b: -32, c: 0 }, void: '#12151A' } });
  // Night studio: the same art, recoloured: a deep blue floor, plum wood, a dimmer checker and amber rugs.
  add({ id: 'night', name: 'Night studio', night: true, palette: {
    wall: { h: 232, s: 32, b: -118, c: -60 }, wood: { h: 285, s: 22, b: -70, c: -88 }, floor: { h: 230, s: 42, b: -62, c: -82 },
    tile: { h: 230, s: 14, b: -52, c: -30 }, stone: { h: 240, s: 18, b: -40, c: -20 }, carpet: { h: 32, s: 70, b: -30, c: 0 }, void: '#0E1117' } });

  const list = () => [...SETS.values()].map(s => ({ id: s.id, name: s.name }));
  // 'tribecode' was the old default (drawn in code); it now means Office.
  const get = id => SETS.get(id) || SETS.get('office');

  // Floor kinds the layout uses, the floor art each one draws, and its palette key.
  const FLOORS = { floor: 0, wood: 6, tile: 8, stone: 5, carpet: 0 };
  const floorOf = kind => (kind in FLOORS ? FLOORS[kind] : 0);

  // A starting look from an id, so everyone looks different until they choose (numbers only; officespace-art.js reads them).
  const hash = s => { let h = 2166136261; for (const ch of String(s || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  // How many choices each look field has (server/office.js checks the same numbers).
  const LOOK = { body: 2, skin: 4, hair: 14, hairColor: 18, top: 5, topColor: 17, pants: 7, pantsColor: 17, shoes: 2, shoesColor: 17,
    jacket: 6, jacketColor: 17, full: 5, fullColor: 17, beard: 6, hat: 4, hatColor: 17, acc: 8 };
  function seedLook(id) {
    let h = hash(id); const pick = n => { const v = h % n; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; return v; };
    const L = { body: pick(2), skin: pick(4), hair: pick(14), hairColor: pick(7), top: pick(5), topColor: pick(17), pants: pick(2), pantsColor: pick(17), shoes: pick(2), shoesColor: pick(3) };
    if (pick(5) === 0) { L.jacket = 1 + pick(5); L.jacketColor = pick(17); }
    if (L.body === 0 && pick(4) === 0) L.beard = 1 + pick(5);
    if (pick(4) === 0) L.acc = 1 + pick(7);
    return L;
  }

  window.TribeOfficeSets = { T, list, get, add, FLOORS, floorOf, seedLook, LOOK };
})();
