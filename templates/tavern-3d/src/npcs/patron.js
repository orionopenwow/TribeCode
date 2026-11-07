// What a patron does. Every patron is a bot with a job (barkeep, bard, cook, regular), a home (their spot or seat)
// and three orders a person can give: Follow me, Stay, Go to your spot.
//   free mode:   go home and work or sit for a while, then sometimes wander or walk over to chat with someone
//   follow mode: keep about 1.5 m behind the player
//   stay mode:   stand still (still turns to face you and talks)
// Lines come from patrons.json, so new patrons and new lines need no code.
import { collide } from '../scene/room.js';

const RADIUS = 0.25, SPEED = 1.1, FOLLOW_SPEED = 1.9, NEAR = 2.2;
const WORK = { barkeep: 'tending the bar', bard: 'playing a tune', cook: 'cooking', regular: 'sitting' };
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];

export class Patron {
  constructor(data, room, group, rnd = Math.random) {
    Object.assign(this, { data, room, group, rnd });
    this.id = data.id; this.name = data.name; this.role = data.role || 'regular';
    this.mode = 'free';          // free | follow | stay
    this.activity = 'walking';   // what the roster shows
    this.path = []; this.timer = 1 + rnd() * 3; this.facing = 0;
    this.bubble = null; this.greetedAt = -99; this.chatAt = 4 + rnd() * 10; this.stuck = { t: 0, x: 0, z: 0 };
    this.partner = null; this.seat = null; this.sitting = false;
    const start = room.walkable[Math.floor(rnd() * room.walkable.length)] || { x: 0, z: 0 };
    this.x = start.x; this.z = start.z; this.y = 0;
    this.goHome();
  }

  // ---------- orders ----------
  follow() { this.stand(); this.mode = 'follow'; this.path = []; this.activity = 'following you'; this.say(pick(this.lines('follow'), this.rnd)); }
  stay() { this.stand(); this.mode = 'stay'; this.path = []; this.activity = 'staying'; this.say(pick(this.lines('stay'), this.rnd)); }
  sendHome() { this.mode = 'free'; this.say(pick(this.lines('home'), this.rnd)); this.goHome(); }
  order(name) { if (name === 'follow') this.follow(); else if (name === 'stay') this.stay(); else if (name === 'home') this.sendHome(); }

  lines(kind) { const l = (this.data.lines || {})[kind]; return l && l.length ? l : ['...']; }
  say(text, seconds = 3.5) { this.bubble = { text, until: this.room.time() + seconds }; }
  talkTo(player) { if (this.sitting && this.mode === 'free') this.timer = Math.max(this.timer, 3); this.faceTo(player.x, player.z); this.say(pick(this.lines(this.rnd() < 0.4 ? 'greet' : 'idle'), this.rnd), 4); }

  // ---------- where to go ----------
  home() {
    const h = this.data.home || 'fireplace';
    if (h.startsWith('seat:')) return this.room.seats.find(s => s.id === h.slice(5)) || this.room.spots.fireplace;
    return this.room.spots[h] || this.room.spots.fireplace;
  }
  goHome() { this.stand(); this.target = 'home'; this.route(this.home()); this.activity = 'walking'; }
  route(to) {
    const spots = this.room.spots, inBar = this.x < 1.2 && this.z < -4.75;
    const path = [];
    if (inBar && !(to === spots.bar)) path.push(spots.bar.via);          // out from behind the bar the way you came in
    if (to.via && !(to === spots.bar && inBar)) path.push(to.via);
    path.push(to);
    this.path = path;
  }
  stand() { if (this.seat) { this.seat.taken = null; this.seat = null; } this.sitting = false; this.y = 0; this.partner = null; }

  // ---------- every frame ----------
  update(dt, world) {
    const t = this.room.time(), p = world.player;
    const dPlayer = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.bubble && t > this.bubble.until) this.bubble = null;

    if (this.mode === 'follow') {
      if (dPlayer > 1.6) { this.walkToward(p.x, p.z, FOLLOW_SPEED, dt, world); this.activity = 'following you'; }
      else this.faceTo(p.x, p.z);
    } else if (this.mode === 'stay') {
      if (dPlayer < NEAR + 1) this.faceTo(p.x, p.z);
    } else this.freeMode(dt, world, t);

    // React when the player comes close: turn to them and say hello (not too often).
    if (dPlayer < NEAR && this.mode !== 'follow') {
      if (!this.path.length) this.faceTo(p.x, p.z);
      if (t - this.greetedAt > 25 && !this.bubble) { this.greetedAt = t; this.say(pick(this.lines('greet'), this.rnd)); }
    }
    // Background chatter when you're in earshot.
    if (t > this.chatAt) { this.chatAt = t + 9 + this.rnd() * 14; if (dPlayer < 9 && !this.bubble) this.say(pick(this.lines('idle'), this.rnd)); }
    this.place(t);
  }

  freeMode(dt, world, t) {
    if (this.path.length) {
      const wp = this.path[0];
      const arrive = this.path.length === 1 && wp.faceX !== undefined && this.room.seats.includes(wp) ? 0.5 : 0.12;
      if (Math.hypot(wp.x - this.x, wp.z - this.z) <= arrive) { this.path.shift(); if (!this.path.length) this.arrived(wp); }
      else { this.walkToward(wp.x, wp.z, SPEED, dt, world); this.checkStuck(dt); }
      return;
    }
    if (this.partner) {   // chatting with another patron
      this.faceTo(this.partner.x, this.partner.z);
      if ((this.timer -= dt) <= 0) { this.partner = null; this.goHome(); }
      return;
    }
    if ((this.timer -= dt) > 0) return;
    // Time to do something else.
    const r = this.rnd();
    if (this.target !== 'home') this.goHome();
    else if (r < this.data.restless * 0.6) { this.target = 'wander'; this.stand(); this.route(pick(this.room.walkable, this.rnd)); this.activity = 'wandering'; }
    else if (r < this.data.restless) {
      const other = world.patrons.find(o => o !== this && o.mode === 'free' && !o.partner && !o.path.length && this.rnd() < 0.5);
      if (other) { this.stand(); this.target = 'chat'; this.chatWith = other; const a = this.rnd() * Math.PI * 2; this.route({ x: other.x + Math.cos(a) * 1.1, z: other.z + Math.sin(a) * 1.1 }); this.activity = `going to ${other.name.split(' ')[0]}`; }
      else this.timer = 3 + this.rnd() * 5;
    } else this.timer = 5 + this.rnd() * 8;
  }

  arrived(wp) {
    if (this.target === 'home') {
      this.facing = Math.atan2((wp.faceX ?? this.x) - this.x, (wp.faceZ ?? this.z + 1) - this.z);
      if (this.room.seats.includes(wp) && !wp.taken) { wp.taken = this.id; this.seat = wp; this.sitting = true; this.x = wp.x; this.z = wp.z; this.activity = 'sitting'; }
      else { this.activity = wp.doing || (this.role !== 'regular' ? WORK[this.role] : 'standing around'); this.y = wp.y || 0; }
      this.timer = 6 + this.rnd() * 10;
    } else if (this.target === 'chat' && this.chatWith) {
      const o = this.chatWith; this.chatWith = null;
      if (o.mode === 'free' && !o.path.length) {
        this.partner = o; o.partner = this; this.timer = o.timer = 5 + this.rnd() * 3;
        this.activity = `talking with ${o.name.split(' ')[0]}`; o.activity = `talking with ${this.name.split(' ')[0]}`;
        this.say(pick(this.lines('idle'), this.rnd)); setTimeout(() => o.say(pick(o.lines('idle'), o.rnd)), 1800);
      } else this.goHome();
    } else { this.activity = 'looking around'; this.timer = 2 + this.rnd() * 4; this.target = 'idle'; }
  }

  walkToward(tx, tz, speed, dt, world) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz); if (d < 1e-4) return;
    const step = Math.min(d, speed * dt);
    let nx = this.x + dx / d * step, nz = this.z + dz / d * step;
    // keep a little space from other patrons and the player
    for (const o of [...world.patrons, world.player]) {
      if (o === this || o.sitting) continue;
      const ox = nx - o.x, oz = nz - o.z, od = Math.hypot(ox, oz);
      const gap = o === world.player ? 0.8 : 0.55;
      if (od > 1e-4 && od < gap) { nx += ox / od * (gap - od) * 0.5; nz += oz / od * (gap - od) * 0.5; }
    }
    const c = collide({ x: nx, z: nz }, RADIUS, this.room.colliders, this.room.bounds);
    this.x = c.x; this.z = c.z; this.facing = Math.atan2(dx, dz); this.moving = true;
  }

  checkStuck(dt) {
    const s = this.stuck; s.t += dt;
    if (s.t < 1.5) return;
    if (Math.hypot(this.x - s.x, this.z - s.z) < 0.15) {   // blocked: skip this stop, or pick a new one
      this.path.shift();
      if (!this.path.length) { this.target = 'idle'; this.activity = 'looking around'; this.timer = 1 + this.rnd() * 2; }
    }
    s.t = 0; s.x = this.x; s.z = this.z;
  }

  faceTo(x, z) { if (Math.hypot(x - this.x, z - this.z) > 0.05) this.facing = Math.atan2(x - this.x, z - this.z); }

  place(t) {
    const g = this.group, moving = this.moving; this.moving = false;
    g.position.set(this.x, this.y + (this.sitting ? -0.22 : 0), this.z);
    // turn smoothly
    let d = this.facing - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * 0.2;
    const { body, head } = g.userData;
    const bob = moving ? Math.abs(Math.sin(t * 9 + this.x)) * 0.05 : (this.activity === 'playing a tune' ? Math.sin(t * 4) * 0.03 : 0);
    body.position.y = 0.6 + bob; head.position.y = 1.32 + bob;
    g.rotation.z = this.activity === 'playing a tune' ? Math.sin(t * 2) * 0.06 : 0;
  }

  view() { return { id: this.id, name: this.name, role: this.role, color: this.data.color, activity: this.activity, mode: this.mode, bot: true, x: this.x, z: this.z }; }
}
