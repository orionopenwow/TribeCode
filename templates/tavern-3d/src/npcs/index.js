// Loads patrons.json and puts every patron in the room. The NPCs lane owns this folder.
import { makeBody } from './body.js';
import { Patron } from './patron.js';

// A small seeded random generator: ?seed=42 in the address bar replays the same evening.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function loadPatrons(scene, room, seed = Date.now()) {
  const res = await fetch(new URL('./patrons.json', import.meta.url));
  if (!res.ok) throw new Error(`could not load patrons.json (${res.status})`);
  const { patrons } = await res.json();
  const rnd = seeded(seed);
  return patrons.map(data => {
    const group = makeBody(data);
    scene.add(group);
    return new Patron(data, room, group, rnd);
  });
}

export function updatePatrons(patrons, dt, player) {
  const world = { player, patrons };
  for (const p of patrons) p.update(dt, world);
}

// The patron the player is looking at (or closest to, within reach), for "E to talk".
export function patronInReach(patrons, player, reach = 2.4) {
  let best = null, bestScore = Infinity;
  for (const p of patrons) {
    const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
    if (d > reach) continue;
    const ahead = Math.cos(Math.atan2(dx, dz) - player.yawForward());   // 1 straight ahead
    const score = d - ahead * 1.2;
    if (score < bestScore) { best = p; bestScore = score; }
  }
  return best;
}
