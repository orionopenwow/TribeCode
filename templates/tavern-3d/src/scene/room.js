// The tavern room: floor, walls, beams, the bar, the fireplace, a small stage, the kitchen hatch, tables and
// stools, barrels and lights. Everything is built from simple shapes (original, no model files).
// buildRoom() returns what other lanes need: colliders (boxes on the floor), named spots, seats, walkable
// points for wandering, and update(t) for the flickering fire.
import * as THREE from 'three';
import { COLORS } from './palette.js';

export const ROOM = { minX: -8, maxX: 8, minZ: -6, maxZ: 6, height: 4 };

const mat = color => new THREE.MeshLambertMaterial({ color });
const glow = color => new THREE.MeshBasicMaterial({ color });

export function buildRoom(scene) {
  const colliders = [];
  const box = (w, h, d, color, x, y, z, { solid = false, material } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || mat(color));
    m.position.set(x, y, z); scene.add(m);
    if (solid) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  };
  const cyl = (rt, rb, h, color, x, y, z, seg = 12, material) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material || mat(color)); m.position.set(x, y, z); scene.add(m); return m; };
  const W = ROOM.maxX - ROOM.minX, D = ROOM.maxZ - ROOM.minZ, H = ROOM.height;

  // floor planks (alternating tones), ceiling, walls with a darker skirting, beams
  for (let i = 0, z = ROOM.minZ; z < ROOM.maxZ; z += 0.5, i++) box(W, 0.05, 0.5, i % 2 ? COLORS.floor : COLORS.floorAlt, 0, -0.025, z + 0.25);
  box(W, 0.1, D, COLORS.ceiling, 0, H + 0.05, 0);
  for (const [w, d, x, z] of [[W, 0.2, 0, ROOM.minZ - 0.1], [W, 0.2, 0, ROOM.maxZ + 0.1], [0.2, D, ROOM.minX - 0.1, 0], [0.2, D, ROOM.maxX + 0.1, 0]]) {
    box(w, H, d, COLORS.wall, x, H / 2, z);
    box(w + 0.02, 1, d + 0.02, COLORS.wallLow, x, 0.5, z);
  }
  for (let x = -6; x <= 6; x += 3) box(0.25, 0.3, D, COLORS.beam, x, H - 0.15, 0);
  for (const x of [-7.9, 7.9]) for (const z of [-3, 0, 3]) box(0.2, H, 0.25, COLORS.beam, x, H / 2, z);

  // windows: night-blue glass with a frame, rain outside
  for (const z of [-3.5, 3.5]) { box(0.06, 1.2, 1.4, COLORS.beam, ROOM.maxX - 0.02, 2.1, z); box(0.07, 1, 1.2, 0, ROOM.maxX - 0.03, 2.1, z, { material: glow(COLORS.glassNight) }); }
  // the front door
  box(1.4, 2.4, 0.08, COLORS.woodDark, 0, 1.2, ROOM.maxZ - 0.02); box(0.1, 0.1, 0.1, COLORS.metal, 0.5, 1.1, ROOM.maxZ - 0.08);

  // the bar along the back wall, shelves with bottles behind it
  box(6.4, 1.1, 0.8, COLORS.wood, -2, 0.55, -4.4, { solid: true });
  box(6.6, 0.08, 1, COLORS.woodLight, -2, 1.14, -4.4);
  for (const y of [1.5, 2.2]) {
    box(6, 0.06, 0.35, COLORS.woodDark, -2, y, -5.8);
    for (let i = 0; i < 14; i++) cyl(0.05, 0.06, 0.32, [COLORS.bottleA, COLORS.bottleB, COLORS.bottleC][(i + Math.round(y * 10)) % 3], -4.7 + i * 0.4, y + 0.19, -5.8, 8);
  }
  colliders.push({ minX: -5.2, maxX: 1.2, minZ: -6, maxZ: -5.6 });   // shelves
  for (const x of [-4, -2.5, -1, 0.5]) { cyl(0.2, 0.2, 0.06, COLORS.woodDark, x, 0.8, -3.6); cyl(0.04, 0.04, 0.78, COLORS.metal, x, 0.39, -3.6, 6); }   // bar stools

  // fireplace on the left wall: stone, a dark hearth and a fire made of glowing cones
  box(0.9, 2.4, 2.6, COLORS.stone, -7.55, 1.2, 0, { solid: true });
  box(0.92, 0.9, 1.4, COLORS.stoneDark, -7.5, 0.45, 0);
  box(1.3, 0.12, 3, COLORS.stoneDark, -7.4, 2.4, 0);
  const flames = [];
  for (const [dz, s] of [[-0.3, 0.8], [0, 1], [0.3, 0.75]]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.6 * s, 6), glow(s === 1 ? COLORS.fireCore : COLORS.fire));
    f.position.set(-7.05, 0.3 * s + 0.05, dz); scene.add(f); flames.push(f);
  }
  const fireLight = new THREE.PointLight(COLORS.fire, 14, 12, 1.4); fireLight.position.set(-6.6, 0.9, 0); scene.add(fireLight);

  // the stage (back right) with a stool and a lute-ish stand
  box(3, 0.15, 3, COLORS.woodDark, 6.5, 0.075, -4.5);
  cyl(0.22, 0.22, 0.06, COLORS.wood, 6.9, 0.6, -5.2); cyl(0.04, 0.04, 0.5, COLORS.metal, 6.9, 0.38, -5.2, 6);

  // the kitchen hatch (right wall)
  box(0.8, 1, 2, COLORS.wood, 7.6, 0.5, 1, { solid: true });
  box(0.9, 0.06, 2.1, COLORS.woodLight, 7.6, 1.03, 1);
  cyl(0.25, 0.2, 0.25, COLORS.metal, 7.6, 1.18, 0.6); cyl(0.18, 0.18, 0.2, COLORS.metal, 7.6, 1.16, 1.4);

  // barrels in the back left corner
  for (const [x, z] of [[-7.2, -5.2], [-6.4, -5.4], [-7.25, -4.4]]) { cyl(0.38, 0.38, 0.95, COLORS.woodDark, x, 0.475, z, 14); cyl(0.4, 0.4, 0.05, COLORS.metal, x, 0.75, z, 14); colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 }); }

  // a rug in the middle
  box(4.2, 0.02, 2.6, COLORS.rugEdge, 0, 0.012, 1.2); box(3.9, 0.025, 2.3, COLORS.rug, 0, 0.015, 1.2);

  // round tables with a candle, four stools each (the stools are the seats)
  const seats = [], tables = [[-3.5, 0.5], [0.8, -0.6], [3.6, 2], [-4.6, 3.8]];
  tables.forEach(([x, z], ti) => {
    cyl(0.62, 0.62, 0.07, COLORS.woodLight, x, 0.78, z, 20); cyl(0.08, 0.12, 0.75, COLORS.woodDark, x, 0.38, z, 8);
    cyl(0.04, 0.04, 0.14, COLORS.candle, x, 0.88, z, 6);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), glow(COLORS.fireCore)); c.position.set(x, 0.98, z); scene.add(c); flames.push(c);
    colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 });
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, sx = x + Math.cos(a) * 0.95, sz = z + Math.sin(a) * 0.95;
      cyl(0.2, 0.2, 0.05, COLORS.wood, sx, 0.46, sz); cyl(0.035, 0.035, 0.44, COLORS.woodDark, sx, 0.22, sz, 6);
      seats.push({ id: `t${ti + 1}-${k + 1}`, x: sx, z: sz, faceX: x, faceZ: z, taken: null });
    }
  });

  // hanging lanterns and a warm ambient light
  for (const [x, z] of [[-2, -2], [2.5, 1.5], [-3, 3.5]]) {
    box(0.02, 0.6, 0.02, COLORS.metal, x, H - 0.3, z);
    box(0.22, 0.3, 0.22, 0, x, H - 0.75, z, { material: glow(COLORS.fireCore) });
    const l = new THREE.PointLight(COLORS.fireCore, 6, 9, 1.4); l.position.set(x, H - 0.9, z); scene.add(l);
  }
  scene.add(new THREE.HemisphereLight(COLORS.ambientSky, COLORS.ambientGround, 0.9));
  scene.background = new THREE.Color(0x0e0b09);
  scene.fog = new THREE.Fog(0x0e0b09, 10, 26);

  // Named spots for the patrons' jobs (patrons.json uses these names).
  const spots = { bar: { x: -2, z: -5.15, faceX: -2, faceZ: -3, via: { x: 1.8, z: -5.15 } }, stage: { x: 6.5, z: -4.6, faceX: 3, faceZ: 0, y: 0.15 }, kitchen: { x: 6.7, z: 1, faceX: 0, faceZ: 1 },
    fireplace: { x: -6.2, z: 1.6, faceX: -7, faceZ: 0, doing: 'warming up by the fire' }, door: { x: 0, z: 5, faceX: 0, faceZ: 0 }, window: { x: 6.8, z: 3.5, faceX: 8, faceZ: 3.5, doing: 'watching the rain' } };

  // Walkable points every metre (away from colliders): where wandering patrons pick their next stop.
  const walkable = [];
  for (let x = ROOM.minX + 1; x <= ROOM.maxX - 1; x += 1) for (let z = ROOM.minZ + 1; z <= ROOM.maxZ - 1; z += 1)
    if (!colliders.some(c => x > c.minX - 0.6 && x < c.maxX + 0.6 && z > c.minZ - 0.6 && z < c.maxZ + 0.6)) walkable.push({ x, z });

  let t0 = 0;
  function update(t) {
    t0 = t;
    fireLight.intensity = 12 + Math.sin(t * 9) * 1.5 + Math.sin(t * 23) * 1;
    flames.forEach((f, i) => { const s = 1 + Math.sin(t * (11 + i * 3) + i) * 0.08; f.scale.set(s, 1 + Math.sin(t * 13 + i) * 0.12, s); });
  }
  return { colliders, spots, seats, walkable, update, bounds: ROOM, time: () => t0 };
}

// Push a circle (x, z, radius) out of every collider and keep it inside the room. Returns the corrected point.
export function collide(p, r, colliders, bounds = ROOM) {
  let { x, z } = p;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX)), nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
    else {   // centre inside the box: leave by the nearest side
      const out = [[c.minX - r - x, 0], [c.maxX + r - x, 0], [0, c.minZ - r - z], [0, c.maxZ + r - z]].sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
      x += out[0]; z += out[1];
    }
  }
  x = Math.max(bounds.minX + r, Math.min(bounds.maxX - r, x));
  z = Math.max(bounds.minZ + r, Math.min(bounds.maxZ - r, z));
  return { x, z };
}
