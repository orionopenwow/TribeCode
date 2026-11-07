// Lantern Run: the game loop and the moments between levels. Owned by the Lead lane; each other folder is a lane:
//   src/player  movement and feel     src/levels  level files + loader     src/art  everything you see
//   src/audio   sound effects         src/ui      title, HUD, screens      src/core  input + collision
import { createInput } from './core/input.js';
import { touchesHazard, boxesOverlap } from './core/physics.js';
import { loadAll, parseLevel, LEVELS, TILE } from './levels/loader.js';
import { createPlayer, updatePlayer } from './player/player.js';
import { drawBackground } from './art/background.js';
import { drawTiles, drawPlayer, drawEmber, drawMushroom, drawLantern, lightOf } from './art/sprites.js';
import { drawDarkness } from './art/light.js';
import { unlock, play, toggleMute, isMuted } from './audio/sfx.js';
import { drawHud } from './ui/hud.js';
import { drawTitle, drawHint, drawLevelDone, drawPause, drawWin } from './ui/screens.js';

const VIEW_W = 320, VIEW_H = 180, STEP = 1 / 120;
const LIGHT_DRAIN = 0.028;        // per second: a full flame lasts ~35 s without embers
const EMBER_LIGHT = 0.2;

const screen = document.getElementById('game');
const out = screen.getContext('2d');
const view = document.createElement('canvas'); view.width = VIEW_W; view.height = VIEW_H;
const g = view.getContext('2d');
const input = createInput();
input.onAny(() => unlock());

const game = {
  state: 'loading', levels: [], level: null, player: null, light: 1, time: 0, clock: 0, hint: 0, stateTime: 0,
  camX: 0, deaths: 0, embers: 0, totalTime: 0, manual: false, error: null,
};

function startLevel(i) {
  game.level = parseLevel(game.levels[i], i);
  game.player = createPlayer(game.level.start);
  game.light = 1; game.hint = 3.2; game.camX = 0; game.clock = 0;
  setState('play');
}
function newRun() { game.deaths = 0; game.embers = 0; game.totalTime = 0; startLevel(0); }
function setState(s) { game.state = s; game.stateTime = 0; }
function respawn() {
  game.player = createPlayer(game.level.start); game.light = 1; game.camX = 0; setState('play');
}
function lose(why) { if (game.state !== 'play') return; game.deaths++; play('hurt'); game.lostTo = why; setState('dying'); }

function update(dt) {
  game.time += dt; game.stateTime += dt;
  if (input.pressed('mute')) toggleMute();
  const st = game.state;
  if (st === 'title') { if (input.pressed('start') || input.pressed('jump')) { play('click'); newRun(); } return; }
  if (st === 'win') { if (game.stateTime > 0.8 && (input.pressed('start') || input.pressed('jump'))) { play('click'); newRun(); } return; }
  if (st === 'done') {
    if (game.stateTime > 0.8 && (input.pressed('start') || input.pressed('jump'))) {
      if (game.level.index + 1 < game.levels.length) startLevel(game.level.index + 1); else { play('win'); setState('win'); }
    }
    return;
  }
  if (st === 'paused') { if (input.pressed('pause')) setState('play'); return; }
  if (st === 'dying') { if (game.stateTime > 0.7) respawn(); return; }
  if (st !== 'play') return;
  if (input.pressed('pause')) { setState('paused'); return; }

  const { level, player } = game;
  game.clock += dt; game.totalTime += dt; game.hint = Math.max(0, game.hint - dt);
  for (const e of updatePlayer(player, input, dt, level)) play(e);
  for (const m of level.mushrooms) m.squash = Math.max(0, (m.squash || 0) - dt * 4);

  game.light = Math.max(0, game.light - LIGHT_DRAIN * dt);
  for (const e of level.embers) {
    if (!e.taken && boxesOverlap(player, { x: e.x + 1, y: e.y + 1, w: 8, h: 8 })) { e.taken = true; game.embers++; game.light = Math.min(1, game.light + EMBER_LIGHT); play('ember'); }
  }
  const hazard = touchesHazard(player, level);
  if (hazard) return lose(hazard);
  if (player.y > level.h * TILE + 16) return lose('fall');
  if (game.light <= 0) return lose('dark');
  const l = level.lantern;
  if (!l.lit && boxesOverlap(player, { x: l.x, y: l.y - 26, w: TILE, h: 36 })) { l.lit = true; play('lit'); setState('done'); }

  const target = Math.max(0, Math.min(level.w * TILE - VIEW_W, player.x - VIEW_W * 0.42));
  game.camX += (target - game.camX) * Math.min(1, dt * 8);
}

function step(dt) { update(dt); input.endFrame(); }

function render() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
  if (screen.width !== VIEW_W * s) { screen.width = VIEW_W * s; screen.height = VIEW_H * s; }
  const t = game.time, camX = Math.round(game.camX), level = game.level;
  drawBackground(g, camX, t);
  if (level) {
    drawTiles(g, level, camX, t);
    for (const m of level.mushrooms) drawMushroom(g, m, camX);
    drawLantern(g, level.lantern, camX, t);
    for (const e of level.embers) drawEmber(g, e, camX, t);
    const p = game.player, dying = game.state === 'dying';
    if (p) drawPlayer(g, p, camX, t, dying ? Math.max(0, 1 - game.stateTime / 0.7) : 1);
    const lights = [{ x: 256 - camX * 0.02, y: 28, r: 16 }, ...level.embers.filter(e => !e.taken).map(e => lightOf.ember(e, camX)), lightOf.lantern(level.lantern, camX)];
    if (p) lights.push(lightOf.player(p, camX, dying ? 0 : game.light));
    drawDarkness(g, lights);
  } else drawDarkness(g, [{ x: 160, y: 90, r: 70 }]);

  out.imageSmoothingEnabled = false;
  out.drawImage(view, 0, 0, screen.width, screen.height);
  if (level && game.state !== 'title') drawHud(out, s, { level, light: game.light, embers: level.embers.filter(e => e.taken).length, totalEmbers: level.embers.length, time: game.totalTime, muted: isMuted() });
  if (game.state === 'title') drawTitle(out, s, t);
  else if (game.state === 'play') drawHint(out, s, level, game.hint);
  else if (game.state === 'done') drawLevelDone(out, s, level, t, level.index + 1 >= game.levels.length);
  else if (game.state === 'paused') drawPause(out, s);
  else if (game.state === 'win') drawWin(out, s, t, { time: game.totalTime, embers: game.embers, totalEmbers: game.levels.reduce((n, l) => n + l.tiles.join('').split('*').length - 1, 0), deaths: game.deaths });
}

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (!game.manual) {
    acc += dt; let first = true;
    while (acc >= STEP) { update(STEP); if (first) { input.endFrame(); first = false; } acc -= STEP; }
  }
  render();
  requestAnimationFrame(frame);
}

// A small debug hook for tests and curious agents: window.__lantern.
//   await __lantern.ready; __lantern.start(0); __lantern.manual(true); __lantern.press('right'); __lantern.step(0.5)
window.__lantern = {
  ready: null,
  get state() { return game.state; }, get player() { return game.player; }, get level() { return game.level; }, get light() { return game.light; },
  get game() { return game; },
  start(i = 0) { startLevel(i); }, manual(on = true) { game.manual = !!on; },
  step(seconds = STEP) { for (let n = Math.max(1, Math.round(seconds / STEP)), i = 0; i < n; i++) step(STEP); return game.player && { x: game.player.x, y: game.player.y, onGround: game.player.onGround, vy: game.player.vy }; },
  press: a => input.press(a), release: a => input.release(a), levels: LEVELS,
};

window.__lantern.ready = loadAll().then(levels => { game.levels = levels; setState('title'); }).catch(e => { game.error = e.message; console.error(e); setState('error'); });
requestAnimationFrame(frame);
