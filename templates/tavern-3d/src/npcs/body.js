// How a patron looks: a rounded body, a head with two eyes, and a hat that says what they do.
// Simple shapes only (original). Returns a THREE.Group whose origin is at the patron's feet.
import * as THREE from 'three';

const lambert = color => new THREE.MeshLambertMaterial({ color });

export function makeBody(patron) {
  const g = new THREE.Group();
  const color = new THREE.Color(patron.color || '#9aa1b2');
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 4, 10), lambert(color));
  body.position.y = 0.6; g.add(body);
  if (patron.apron) { const apron = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 0.04), lambert(patron.apron)); apron.position.set(0, 0.55, 0.23); g.add(apron); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), lambert(0xe9c9a3));
  head.position.y = 1.32; g.add(head);
  for (const x of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), lambert(0x1b1410)); eye.position.set(x, 1.35, 0.18); g.add(eye); }
  const hat = makeHat(patron.hat, color);
  if (hat) { hat.position.y = 1.48; g.add(hat); }
  g.userData = { body, head };
  return g;
}

function makeHat(kind, color) {
  const dark = color.clone().multiplyScalar(0.55);
  if (kind === 'tall') {   // a cook's tall hat
    const h = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.3, 12), lambert(0xf2ede2)); c.position.y = 0.12; h.add(c);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lambert(0xf2ede2)); top.position.y = 0.3; h.add(top);
    return h;
  }
  if (kind === 'feather') {   // a bard's floppy cap with a feather
    const h = new THREE.Group();
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 10), lambert(dark)); c.rotation.z = 0.25; c.position.y = 0.04; h.add(c);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.06), lambert(0xf3e6c8)); f.position.set(0.12, 0.14, -0.05); f.rotation.z = -0.5; h.add(f);
    return h;
  }
  if (kind === 'hood') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), lambert(dark)); c.position.y = -0.14; c.rotation.x = -0.25; return c; }
  if (kind === 'cap') {
    const h = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.1, 12), lambert(dark)); h.add(c);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.14), lambert(dark)); brim.position.set(0, -0.04, 0.2); h.add(brim);
    return h;
  }
  return null;
}
