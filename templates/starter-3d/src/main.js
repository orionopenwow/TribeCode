// {{name}}: a polished three.js starter from TribeCode's build kit (templates/buildkit.json › 3d-game).
// What's here, so you can build on it: ACES tone mapping + sRGB, soft shadows from one key light, fog, a fixed-step
// physics world (cannon-es) with interpolation between steps, a rolling player with a follow camera, gems to collect, a tiny
// synth for sounds (swap in howler.js and real files later), a loading screen, touch stick, pause and mute.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = { canvas: css('--canvas') || '#12151A', accent: css('--accent') || '#F26B1D', second: css('--second') || '#38C6B1', surface: css('--surface') || '#1B2028' };

// ---------- renderer ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.canvas);
scene.fog = new THREE.Fog(COLORS.canvas, 28, 70);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

// one key light with soft shadows + a hemisphere fill
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a2c22, 1.5));
const sun = new THREE.DirectionalLight(0xffe6c8, 2.6);
sun.position.set(12, 20, 8); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 60 });
scene.add(sun, sun.target);

// ---------- physics: fixed step 1/60 s ----------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
const matGround = new CANNON.Material('ground'), matBall = new CANNON.Material('ball');
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matBall, { friction: 0.4, restitution: 0.15 }));
const bodies = [];   // [mesh, body] pairs kept in sync, with interpolation

// a soft tile texture for the ground, drawn on a canvas (no image files to load)
function tiles() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#3b4352'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#434c5c'; x.fillRect(0, 0, 128, 128); x.fillRect(128, 128, 128, 128);
  x.strokeStyle = '#2f3643'; x.lineWidth = 3; x.strokeRect(0, 0, 256, 256); x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const shared = {   // reuse geometries and materials (draw calls stay low)
  box: new THREE.BoxGeometry(1, 1, 1),
  stone: new THREE.MeshStandardMaterial({ color: 0x5a6474, roughness: 0.85 }),
  ground: new THREE.MeshStandardMaterial({ map: tiles(), roughness: 0.95 }),
  crate: new THREE.MeshStandardMaterial({ color: COLORS.accent, roughness: 0.55 }),
  gem: new THREE.MeshStandardMaterial({ color: COLORS.second, roughness: 0.2, metalness: 0.1, emissive: COLORS.second, emissiveIntensity: 0.25 }),
};

function addBox({ size, pos, mass = 0, mat = shared.stone }) {
  const mesh = new THREE.Mesh(shared.box, mat);
  mesh.scale.set(...size); mesh.castShadow = mass > 0 || size[1] > 0.5; mesh.receiveShadow = true;
  scene.add(mesh);
  const body = new CANNON.Body({ mass, material: matGround, shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)) });
  body.position.set(...pos); world.addBody(body);
  mesh.position.copy(body.position);
  if (mass) bodies.push([mesh, body]);
  return body;
}

// the island: a ground slab, a few steps, and a stack of crates to knock over
addBox({ size: [40, 1, 40], pos: [0, -0.5, 0], mat: shared.ground });
// scenery: instanced pillars around the edge (one draw call for all of them)
{
  const n = 14, pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.6, 1, 10), shared.stone, n), m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, h = 2 + (i * 7 % 5) * 0.7, x = Math.cos(a) * 17, z = Math.sin(a) * 17;
    m.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)); pillars.setMatrixAt(i, m);
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(0.45, 0.6, h, 10) }); b.position.set(x, h / 2, z); world.addBody(b);
  }
  pillars.castShadow = pillars.receiveShadow = true; scene.add(pillars);
}
[[6, 0.5, -4, 4, 1, 4], [9, 1, -4, 2, 2, 4], [-7, 0.75, 5, 5, 1.5, 3], [0, 0.4, -12, 10, 0.8, 2]].forEach(([x, y, z, w, h, d]) => addBox({ size: [w, h, d], pos: [x, y, z] }));
for (let i = 0; i < 9; i++) addBox({ size: [1, 1, 1], pos: [-3 + (i % 3) * 1.05, 0.5 + Math.floor(i / 3) * 1.02, -3], mass: 1, mat: shared.crate });

// the player: a rolling ball
const player = new CANNON.Body({ mass: 2, material: matBall, shape: new CANNON.Sphere(0.6), linearDamping: 0.25, angularDamping: 0.4 });
player.position.set(0, 2, 6); world.addBody(player);
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 20), new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.35 }));
ball.castShadow = true; scene.add(ball);
bodies.push([ball, player]);

// gems to collect
const gems = [];
[[6, 2, -4], [9, 3.2, -4], [-7, 2.6, 5], [0, 1.6, -12], [12, 1, 8], [-12, 1, -8], [-14, 1, 10], [14, 1, -12]].forEach(p => {
  const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), shared.gem);
  g.position.set(...p); g.castShadow = true; scene.add(g); gems.push(g);
});
$('total').textContent = gems.length;

// ---------- sound: a tiny synth (the "audio hook"; swap in howler.js for files) ----------
let audio = null, muted = false;
function blip(f0, f1, dur = 0.15, type = 'square', vol = 0.12) {
  if (muted) return;
  try {
    audio = audio || new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch {}
}
const sfx = { jump: () => blip(260, 620, 0.18), gem: () => { blip(880, 880, 0.08); setTimeout(() => blip(1320, 1320, 0.12), 70); }, bump: () => blip(160, 60, 0.12, 'sine', 0.2) };
player.addEventListener('collide', e => { if (Math.abs(e.contact.getImpactVelocityAlongNormal()) > 5) sfx.bump(); });

// ---------- input: keyboard, drag to look, touch stick ----------
const keys = new Set();
let yaw = 0, pitch = 0.34, paused = false, playing = false;
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP' && playing) paused = !paused;
  if (e.code === 'Space' && playing) { e.preventDefault(); jump(); }
});
addEventListener('keyup', e => keys.delete(e.code));
let drag = null;
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' || e.clientX > innerWidth / 2) drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; yaw -= (e.clientX - drag.x) * 0.005; pitch = Math.min(1.1, Math.max(0.12, pitch + (e.clientY - drag.y) * 0.004)); drag.x = e.clientX; drag.y = e.clientY; });
addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) drag = null; });
const stick = { el: $('stick'), x: 0, y: 0, id: null };
stick.el.addEventListener('pointerdown', e => { stick.id = e.pointerId; stick.el.setPointerCapture(e.pointerId); moveStick(e); });
stick.el.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
stick.el.addEventListener('pointerup', () => { stick.id = null; stick.x = stick.y = 0; stick.el.firstElementChild.style.transform = ''; });
function moveStick(e) {
  const r = stick.el.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  stick.x = x; stick.y = y; stick.el.firstElementChild.style.transform = `translate(${x * 36}px, ${y * 36}px)`;
}
let grounded = false;
function jump() { if (grounded) { player.velocity.y = 9; sfx.jump(); } }
function toggleMute() { muted = !muted; $('mute').textContent = muted ? 'Sound off' : 'Sound on'; }
$('mute').addEventListener('click', toggleMute);

// ---------- loop: fixed-step physics, interpolated rendering ----------
const STEP = 1 / 60, ray = new CANNON.Ray(), rayRes = new CANNON.RaycastResult();
const camPos = new THREE.Vector3(0, 6, 14), look = new THREE.Vector3(), _q = new THREE.Quaternion();
let last = performance.now(), acc = 0, score = 0;
function physics() {
  let ix = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
  let iz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + stick.y;
  const s = Math.sin(yaw), c = Math.cos(yaw), force = 34;
  player.applyForce(new CANNON.Vec3((ix * c + iz * s) * force, 0, (iz * c - ix * s) * force));
  rayRes.reset(); ray.from.copy(player.position); ray.to.set(player.position.x, player.position.y - 0.75, player.position.z);
  grounded = ray.intersectWorld(world, { skipBackfaces: true, result: rayRes, collisionFilterMask: -1 }) && rayRes.body !== player;
  if (player.position.y < -12) { player.position.set(0, 3, 6); player.velocity.set(0, 0, 0); }
  for (const [, b] of bodies) { (b._prevP = b._prevP || new CANNON.Vec3()).copy(b.position); (b._prevQ = b._prevQ || new CANNON.Quaternion()).copy(b.quaternion); }
  world.step(STEP);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing && !paused) { acc += dt; while (acc >= STEP) { physics(); acc -= STEP; } }
  // blend between the last two physics states so motion stays smooth on 90/120 Hz screens
  const k = acc / STEP;
  for (const [m, b] of bodies) {
    const p0 = b._prevP || b.position, q0 = b._prevQ || b.quaternion;
    m.position.set(p0.x + (b.position.x - p0.x) * k, p0.y + (b.position.y - p0.y) * k, p0.z + (b.position.z - p0.z) * k);
    m.quaternion.set(q0.x, q0.y, q0.z, q0.w).slerp(_q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), k);
  }
  const t = now / 1000;
  for (const g of gems) {
    if (!g.visible) continue;
    if (!reduced) { g.rotation.y = t * 1.6; g.position.y += Math.sin(t * 2 + g.position.x) * 0.002; }
    if (g.position.distanceTo(ball.position) < 1.1) { g.visible = false; score++; $('score').textContent = score; sfx.gem(); }
  }
  // camera: smooth follow from behind (frame-rate independent)
  const target = new THREE.Vector3(ball.position.x + Math.sin(yaw) * 9 * Math.cos(pitch), ball.position.y + 9 * Math.sin(pitch) + 1, ball.position.z + Math.cos(yaw) * 9 * Math.cos(pitch));
  camPos.lerp(target, 1 - Math.exp(-dt * 6)); camera.position.copy(camPos);
  look.lerp(ball.position, 1 - Math.exp(-dt * 10)); camera.lookAt(look);
  sun.position.set(ball.position.x + 12, 20, ball.position.z + 8); sun.target.position.copy(ball.position);
  renderer.render(scene, camera);
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
document.addEventListener('visibilitychange', () => { if (document.hidden) paused = true; });

// ---------- loading screen ----------
// Real assets go through a LoadingManager so the bar shows true progress; this starter has none, so it compiles
// the shaders (the slow part on phones) and then offers Play.
const manager = new THREE.LoadingManager();
manager.onProgress = (_u, done, total) => { $('bar').style.width = `${Math.round(done / total * 100)}%`; };
$('bar').style.width = '60%';
renderer.compile(scene, camera);
requestAnimationFrame(frame);
setTimeout(() => {
  $('bar').style.width = '100%'; $('load-note').textContent = 'Ready.'; $('play').hidden = false; $('play').focus();
  document.documentElement.dataset.ready = '1';
}, 150);
$('play').addEventListener('click', () => {
  playing = true; paused = false; $('loader').hidden = true; $('hud').hidden = false; stick.el.classList.add('on'); blip(440, 660, 0.12, 'sine');
});
