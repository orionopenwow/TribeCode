// Tavern 3D: sets up three.js, builds the room, lets the patrons in and runs the loop. Lanes:
//   src/scene   the room, furniture, lights        src/npcs   patrons: looks, behaviour, patrons.json
//   src/player  first-person controls              src/ui     tags, bubbles, Patrons panel, start card
import * as THREE from 'three';
import { buildRoom } from './scene/room.js';
import { loadPatrons, updatePatrons, patronInReach } from './npcs/index.js';
import { createPlayer } from './player/controls.js';
import { createLabels } from './ui/labels.js';
import { createRoster } from './ui/roster.js';

const $ = id => document.getElementById(id);
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);

const room = buildRoom(scene);
const player = createPlayer(camera, room, renderer.domElement);
const seed = Number(new URLSearchParams(location.search).get('seed')) || Date.now();
const state = { patrons: [], labels: null, roster: null, time: 0, manual: false, started: false };

function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function enter() {
  state.started = true; player.enabled = true;
  $('start').classList.add('hidden');
  state.roster && state.roster.close();
  player.lock();
}
$('enter').addEventListener('click', enter);
renderer.domElement.addEventListener('click', () => { if (state.started && !player.locked) player.lock(); });
addEventListener('keydown', e => {
  if (e.code === 'KeyE' && state.started) { const p = patronInReach(state.patrons, player); if (p) p.talkTo(player); }
  if (e.code === 'Enter' && !state.started) enter();
});

function tick(dt) {
  state.time += dt;
  room.update(state.time);
  player.update(dt);
  updatePatrons(state.patrons, dt, player);
}

function render() {
  if (state.labels) state.labels.update(camera, innerWidth, innerHeight);
  const near = state.started ? patronInReach(state.patrons, player) : null;
  const prompt = $('prompt');
  prompt.hidden = !near;
  if (near) prompt.textContent = `E · talk to ${near.name} (bot)`;
  if (state.roster) state.roster.refresh();
  renderer.render(scene, camera);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!state.manual) tick(dt);
  render();
  requestAnimationFrame(frame);
}

// Debug hook for tests and agents: window.__tavern
//   await __tavern.ready; __tavern.manual(true); __tavern.step(2); __tavern.patrons[0].order('follow')
window.__tavern = {
  ready: null, THREE, scene, room, player, enter,
  get patrons() { return state.patrons; }, get time() { return state.time; },
  manual(on = true) { state.manual = !!on; },
  step(seconds = 1 / 60) { for (let i = 0, n = Math.max(1, Math.round(seconds * 60)); i < n; i++) tick(1 / 60); render(); return state.patrons.map(p => p.view()); },
};

window.__tavern.ready = loadPatrons(scene, room, seed).then(patrons => {
  state.patrons = patrons;
  state.labels = createLabels($('labels'), patrons);
  state.roster = createRoster({ panel: $('roster'), list: $('roster-list'), toggle: $('roster-toggle'), patrons, onOpen: () => player.unlock() });
  $('load-note').textContent = `${patrons.length} patrons inside tonight, all of them bots.`;
  return patrons.length;
});
player.update(0);
requestAnimationFrame(frame);
