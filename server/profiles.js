// Profiles (feat/profiles): how each person shows up in the tribe, Discord/Root style.
//   Public: avatar (initials on a color, an emoji on a tint, one of 24 pixel critters, or a photo / GIF),
//   name color (a fixed palette), pronouns, bio, banner (palette color or picture), custom status (emoji + text +
//   clear-after), presence (online / idle / do not disturb / invisible), up to 3 links, time zone, per-project nicknames.
//   Private (only you see them): a note about someone, and people you muted for yourself.
// Agents have the same profile fields, but only online/idle presence (no do not disturb or invisible).
//
// HTTP
//   GET    /api/profile                    -> { profile, palette, pixels, notes, muted }       yours
//   PATCH  /api/profile[/<agentId>]        { field: value, … } -> { profile }                    you, or your agent
//   POST   /api/profile/avatar[?for=<agentId>]  { image: dataURL, still?: dataURL } -> { profile }  photo / GIF (still = first frame)
//   POST   /api/profile/banner[?for=<agentId>]  { image: dataURL } -> { profile }
//   GET    /api/profile/media/<file>       -> the picture (members only; <img> passes ?token=)
//   GET    /api/profile/<id>               -> { profile, member, badges, inCommon, agents, note, muted }
//   PUT    /api/profile/<id>/note          { text } -> { note }            private, only the author ever reads it
//   PUT    /api/profile/<id>/mute          { on } -> { muted }             mute someone for yourself
// Storage: .tribe/profiles.json (public), .tribe/profiles-private.json (notes + mutes, keyed by the author),
// .tribe/avatars/<file> (pictures).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NAME_COLORS = {
  teal: '#38C6B1', indigo: '#6C7CFF', sky: '#4FA8F0', violet: '#A58BFF', rose: '#FF6F8E', coral: '#FF8A65',
  amber: '#F2B33D', lime: '#9AD65C', mint: '#4CD6A0', sand: '#D9B98C', orchid: '#E07BD0', slate: '#9AA7B8',
};
const PIXELS = ['flame', 'campfire', 'tent', 'star', 'moon', 'fox', 'owl', 'bear', 'rabbit', 'frog', 'cat', 'raccoon',
  'hedgehog', 'deer', 'mushroom', 'pine', 'mountain', 'lantern', 'marshmallow', 'compass', 'canoe', 'firefly', 'snail', 'acorn',
  // v0.24 themed packs
  'rocket', 'planet', 'alien', 'ufo', 'comet', 'astronaut', 'fish', 'octopus', 'whale', 'crab', 'shell', 'jelly', 'dragon', 'wizard', 'crown', 'potion', 'sword', 'shield', 'robot', 'joystick', 'floppy', 'heart', 'ghost', 'cursor', 'pizza', 'donut', 'burger', 'sushi', 'icecream', 'coffee', 'headphones', 'guitar', 'note', 'ball', 'trophy', 'dice'];
const MAKER = { s: 6, hc: 8, sh: 6, h: 6, e: 5, m: 4, x: 7 };   // the avatar maker's parts and how many of each
const PRESENCE = ['online', 'idle', 'dnd', 'invisible'];
const CLEAR = { '30m': 30 * 60_000, '4h': 4 * 3600_000, today: null, never: 0 };
const LIM = { pronouns: 40, bio: 300, status: 80, link: 300, label: 32, nick: 32, note: 256, photo: 2_400_000, banner: 400_000 };
const IMG = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

const err = (status, msg) => Object.assign(new Error(msg), { status });
// One emoji (a single grapheme that is a pictograph or a flag), nothing else.
function emojiOk(s) {
  if (typeof s !== 'string' || !s || s.length > 16) return false;
  const seg = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)];
  return seg.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}]/u.test(s);
}
function tzOk(tz) { if (typeof tz !== 'string' || !tz || tz.length > 64) return false; try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }
function urlOk(u) {
  if (typeof u !== 'string' || !u.trim() || u.length > LIM.link) return null;
  let x; try { x = new URL(u.trim()); } catch { return null; }
  return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null;
}
const text = (v, max, lines = 1) => {
  if (typeof v !== 'string') return '';
  let s = v.replace(/\r/g, '').replace(/[\u0000-\u0008\u000B-\u001F\u007F‪-‮⁦-⁩]/g, '');
  s = lines > 1 ? s.split('\n').slice(0, lines).join('\n') : s.replace(/\n/g, ' ');
  return s.trim().slice(0, max);
};

function makeProfiles({ P, store, getMembers, pushPresence, now = () => Date.now() }) {
  const FILE = '.tribe/profiles.json', PRIV = '.tribe/profiles-private.json';
  const MEDIA = path.join(store.root, '.tribe', 'avatars');
  let db = store.readJSON(FILE, {}) || {}, priv = store.readJSON(PRIV, {}) || {};
  const save = () => store.writeJSON(FILE, db), savePriv = () => store.writeJSON(PRIV, priv);
  const member = mid => getMembers().find(m => m.id === mid) || null;
  const isAgent = m => !!m && m.role === 'agent';
  const raw = mid => (db[mid] = db[mid] || {});
  const mine = mid => (priv[mid] = priv[mid] || { notes: {}, muted: [] });

  // ---------- status expiry ----------
  const live = st => !!st && (!st.until || Date.parse(st.until) > now());
  setInterval(() => {
    let changed = false;
    for (const p of Object.values(db)) if (p.status && !live(p.status)) { delete p.status; changed = true; }
    if (changed) { save(); pushPresence(); }
  }, 20_000).unref();

  // ---------- what others see ----------
  function avatarOut(a) {
    if (!a || !a.kind || a.kind === 'initials') return null;
    if (a.kind === 'emoji') return { kind: 'emoji', emoji: a.emoji, tint: a.tint || null };
    if (a.kind === 'pixel') return { kind: 'pixel', pixel: a.pixel, tint: a.tint || null };
    if (a.kind === 'maker') return { kind: 'maker', spec: a.spec, tint: a.tint || null };
    if (a.kind === 'photo') return { kind: 'photo', file: a.file, still: a.still || null, anim: !!a.anim };
    return null;
  }
  // The light profile that rides along with presence (chat names, lists, popouts start from it).
  function brief(mid) {
    const p = db[mid]; if (!p) return null;
    const out = {};
    const av = avatarOut(p.avatar); if (av) out.avatar = av;
    if (p.nameColor) out.nameColor = p.nameColor;
    if (p.pronouns) out.pronouns = p.pronouns;
    if (live(p.status)) out.status = { emoji: p.status.emoji || null, text: p.status.text || '', until: p.status.until || null };
    if (p.nicks && Object.keys(p.nicks).length) out.nicks = { ...p.nicks };
    return Object.keys(out).length ? out : null;
  }
  function full(mid) {
    const p = db[mid] || {};
    return { ...(brief(mid) || {}), bio: p.bio || '', banner: p.banner || null, links: p.links || [], tz: p.tz || null, presence: p.presence || 'online', skills: p.skills || [], featured: p.featured || null, hire: !!p.hire };
  }
  // presence(): add the profile and the presence state; invisible people look offline to everyone else.
  //   idle = every socket of theirs reported idle (notify.js sends it after 3 quiet minutes or a hidden tab).
  function decorate(entry, m, idle) {
    const p = db[m.id] || {}, b = brief(m.id), chosen = p.presence || 'online';
    const out = b ? { ...entry, profile: b } : { ...entry };
    if (!entry.online) { out.state = 'offline'; return out; }
    if (!isAgent(m) && chosen === 'invisible') return { ...out, online: false, where: null, state: 'offline', _invisible: true };
    out.state = !isAgent(m) && chosen === 'dnd' ? 'dnd' : chosen === 'idle' || idle ? 'idle' : 'online';
    return out;
  }
  // presenceFor(viewer): you still see yourself as online when invisible; scoped friends only see nicknames for
  // projects they share.
  function forViewer(entry, viewer, isOnline) {
    let e = entry;
    if (viewer && e.id === viewer.id && (db[e.id] || {}).presence === 'invisible' && isOnline) e = { ...e, online: true, state: 'invisible' };
    if (e._invisible) { e = { ...e }; delete e._invisible; }
    if (viewer && P.scoped(viewer) && e.profile && e.profile.nicks) {
      const nicks = Object.fromEntries(Object.entries(e.profile.nicks).filter(([pid]) => P.canSee(viewer, pid)));
      e = { ...e, profile: { ...e.profile, nicks } };
    }
    return e;
  }
  const isDnd = mid => { const m = member(mid); return !!m && !isAgent(m) && (db[mid] || {}).presence === 'dnd'; };
  const isMuted = (viewer, mid) => !!priv[viewer] && Array.isArray(priv[viewer].muted) && priv[viewer].muted.includes(mid);

  // ---------- edits ----------
  function patch(target, body, { agent }) {
    const p = raw(target.id);
    if ('nameColor' in body) {
      if (body.nameColor === null || body.nameColor === '') delete p.nameColor;
      else if (NAME_COLORS[body.nameColor]) p.nameColor = body.nameColor;
      else throw err(400, 'pick a name color from the palette');
    }
    if ('avatar' in body) {
      const a = body.avatar || { kind: 'initials' };
      if (a.kind === 'initials') { delete p.avatar; }
      else if (a.kind === 'emoji') {
        if (!emojiOk(a.emoji)) throw err(400, 'use one emoji');
        if (a.tint && !NAME_COLORS[a.tint]) throw err(400, 'pick a tint from the palette');
        p.avatar = { kind: 'emoji', emoji: a.emoji, tint: a.tint || null };
      } else if (a.kind === 'pixel') {
        if (!PIXELS.includes(a.pixel)) throw err(400, 'unknown pixel avatar');
        if (a.tint && !NAME_COLORS[a.tint]) throw err(400, 'pick a tint from the palette');
        p.avatar = { kind: 'pixel', pixel: a.pixel, tint: a.tint || null };
      } else if (a.kind === 'maker') {
        const sp = a.spec || {}, spec = {};
        for (const [k, n] of Object.entries(MAKER)) { const v = Number(sp[k] ?? 0); if (!Number.isInteger(v) || v < 0 || v >= n) throw err(400, 'unknown avatar part'); spec[k] = v; }
        if (a.tint && !NAME_COLORS[a.tint]) throw err(400, 'pick a tint from the palette');
        p.avatar = { kind: 'maker', spec, tint: a.tint || null };
      } else if (a.kind === 'photo') {
        if (!p.avatar || p.avatar.kind !== 'photo') throw err(400, 'upload a picture first');   // set by POST /avatar
      } else throw err(400, 'unknown avatar kind');
    }
    if ('pronouns' in body) { const v = text(body.pronouns, LIM.pronouns); v ? p.pronouns = v : delete p.pronouns; }
    if ('bio' in body) { const v = text(body.bio, LIM.bio, 6); v ? p.bio = v : delete p.bio; }
    if ('banner' in body) {
      const bn = body.banner;
      if (!bn) delete p.banner;
      else if (bn.color && NAME_COLORS[bn.color]) p.banner = { color: bn.color };
      else if (bn.image && p.banner && p.banner.image === bn.image) {}   // unchanged picture
      else throw err(400, 'pick a banner color from the palette');
    }
    if ('status' in body) {
      const s = body.status;
      if (!s || (!s.text && !s.emoji)) delete p.status;
      else {
        if (s.emoji && !emojiOk(s.emoji)) throw err(400, 'use one emoji for your status');
        const clear = s.clear in CLEAR ? s.clear : 'never';
        let until = null;
        if (clear === '30m' || clear === '4h') until = new Date(now() + CLEAR[clear]).toISOString();
        else if (clear === 'today') {   // the end of your day: the browser sends its local midnight; never more than a day away
          const t = Date.parse(s.until); const max = now() + 24 * 3600_000;
          until = new Date(Number.isFinite(t) && t > now() && t <= max ? t : (() => { const d = new Date(now()); d.setHours(23, 59, 59, 0); return d.getTime(); })()).toISOString();
        }
        p.status = { emoji: s.emoji || null, text: text(s.text, LIM.status), clear, until, at: new Date(now()).toISOString() };
      }
    }
    if ('presence' in body) {
      if (!PRESENCE.includes(body.presence)) throw err(400, 'presence is online, idle, dnd or invisible');
      if (agent && (body.presence === 'dnd' || body.presence === 'invisible')) throw err(400, 'agents can be online or idle');
      body.presence === 'online' ? delete p.presence : p.presence = body.presence;
    }
    // profile-showcase: skills, one thing you made, and "open to helping other tribes" (the start of Triber)
    if ('skills' in body) { const out = (Array.isArray(body.skills) ? body.skills : []).map(x => text(x, 24)).filter(Boolean).slice(0, 8); out.length ? p.skills = out : delete p.skills; }
    if ('featured' in body) {
      const f = body.featured;
      if (!f || (!f.title && !f.url)) delete p.featured;
      else { const u = f.url ? urlOk(String(f.url)) : null; if (f.url && !u) throw err(400, 'the link must start with http:// or https://'); p.featured = { title: text(f.title, 60) || null, url: u || null }; }
    }
    if ('hire' in body) { body.hire ? p.hire = true : delete p.hire; }
    if ('links' in body) {
      if (!Array.isArray(body.links)) throw err(400, 'links is a list');
      if (body.links.length > 3) throw err(400, 'up to 3 links');
      const out = [];
      for (const l of body.links) {
        const u = typeof l === 'string' ? l : l && l.url; if (!u || !String(u).trim()) continue;
        const ok = urlOk(String(u)); if (!ok) throw err(400, 'links must start with http:// or https://');
        out.push({ url: ok, label: text(l && l.label, LIM.label) || null });
      }
      out.length ? p.links = out : delete p.links;
    }
    if ('tz' in body) {
      if (!body.tz) delete p.tz;
      else if (tzOk(body.tz)) p.tz = body.tz;
      else throw err(400, 'unknown time zone');
    }
    if ('nick' in body) {
      const n = body.nick || {}, pid = String(n.project || '');
      if (!pid || !P.get(pid)) throw err(400, 'unknown project');
      const owner = agent ? member(target.owner) || target : target;
      if (!P.canSee(owner, pid)) throw err(403, 'you are not in that project');
      const v = text(n.text, LIM.nick);
      p.nicks = p.nicks || {};
      v ? p.nicks[pid] = v : delete p.nicks[pid];
      if (!Object.keys(p.nicks).length) delete p.nicks;
    }
    p.updated = new Date(now()).toISOString();
    save(); pushPresence();
    return full(target.id);
  }

  // ---------- pictures ----------
  function dataBuf(url, max) {
    const mm = IMG.exec(String(url || '')); if (!mm) throw err(400, 'send a PNG, JPEG, WebP or GIF picture');
    const buf = Buffer.from(mm[2], 'base64');
    if (!buf.length) throw err(400, 'that picture is empty');
    if (buf.length > max) throw err(413, `that picture is over ${Math.round(max / 1024)} KB`);
    const sig = { png: [0x89, 0x50], jpeg: [0xFF, 0xD8], gif: [0x47, 0x49], webp: [0x52, 0x49] }[mm[1]];
    if (buf[0] !== sig[0] || buf[1] !== sig[1]) throw err(400, 'that file is not the picture it says it is');
    return { buf, ext: mm[1] === 'jpeg' ? 'jpg' : mm[1] };
  }
  function store_(owner, { buf, ext }) {
    fs.mkdirSync(MEDIA, { recursive: true });
    const name = `${owner.replace(/[^\w-]/g, '')}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(MEDIA, name), buf);
    return name;
  }
  const drop = name => { if (name && /^[\w-]+\.(png|jpg|webp|gif)$/.test(name)) fs.rm(path.join(MEDIA, name), { force: true }, () => {}); };
  function setPhoto(target, body) {
    const img = dataBuf(body.image, LIM.photo), anim = img.ext === 'gif';
    const still = anim && body.still ? dataBuf(body.still, LIM.banner) : null;
    if (still && still.ext === 'gif') throw err(400, 'the still frame must be a PNG, JPEG or WebP');
    const p = raw(target.id), old = p.avatar && p.avatar.kind === 'photo' ? p.avatar : null;
    p.avatar = { kind: 'photo', file: store_(target.id, img), still: still ? store_(target.id, still) : null, anim };
    if (old) { drop(old.file); drop(old.still); }
    p.updated = new Date(now()).toISOString(); save(); pushPresence();
    return full(target.id);
  }
  function setBanner(target, body) {
    const img = dataBuf(body.image, LIM.banner);
    if (img.ext === 'gif') throw err(400, 'banners are still pictures (PNG, JPEG or WebP)');
    const p = raw(target.id), old = p.banner && p.banner.image;
    p.banner = { image: store_(target.id, img) }; if (old) drop(old);
    p.updated = new Date(now()).toISOString(); save(); pushPresence();
    return full(target.id);
  }

  // ---------- one person, as a viewer sees them ----------
  function view(me, mid, visible) {
    const m = member(mid); if (!m || !visible(mid)) throw err(404, 'no such person');
    const owner = isAgent(m) ? member(m.owner) || m : m;
    const pidsOf = x => new Set(P.visibleTo(x).map(p => p.id));
    const theirs = pidsOf(owner), yours = pidsOf(me);
    const inCommon = P.visibleTo(me).filter(p => theirs.has(p.id) && yours.has(p.id)).slice(0, 12).map(p => ({ id: p.id, name: p.name, color: p.color || null, image: !!p.image }));
    const badges = [];
    const LABEL = { host: 'Host', admin: 'Admin', mod: 'Mod', spectator: 'Spectator', agent: 'Agent' };
    if (LABEL[m.role]) badges.push({ id: m.role, label: LABEL[m.role] });
    const pid = P.current(), pr = pid && P.get(pid) && (P.get(pid).members || {})[m.id];
    if ((pr === 'admin' || pr === 'mod') && pr !== m.role) badges.push({ id: pr, label: `${LABEL[pr]} here` });
    if (m.guestUntil) badges.push({ id: 'guest', label: 'Guest' });
    const agents = isAgent(m) ? [] : getMembers().filter(x => isAgent(x) && x.owner === m.id && visible(x.id)).map(x => ({ id: x.id, name: x.name, kind: x.kind || 'claude-code', label: x.label || null }));
    const pv = priv[me.id] || {};
    return {
      member: { id: m.id, name: m.name, color: m.color, role: m.role, joined: m.joined, agent: isAgent(m), owner: m.owner || null, ownerName: m.owner ? (member(m.owner) || {}).name || null : null, oauthAvatar: m.avatar || null },
      profile: full(m.id), badges, inCommon, agents,
      note: (pv.notes || {})[m.id] || '', muted: (pv.muted || []).includes(m.id), you: m.id === me.id,
      canEdit: m.id === me.id || (isAgent(m) && m.owner === me.id),
    };
  }

  // ---------- HTTP ----------
  async function route(req, res, { m, b, c, me, url, readBody, send, fail }, { visible }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    try {
      // which profile an edit is for: yours, or an agent you own (an agent token edits its own)
      const editable = id => {
        if (!id || id === me.id) return me;
        const t = member(id);
        if (t && isAgent(t) && t.owner === me.id) return t;
        throw err(403, 'you can only edit your own profile or your agents');
      };
      if (!b && m === 'GET') {
        const pv = priv[me.id] || {};
        return send(res, 200, { profile: full(me.id), palette: NAME_COLORS, pixels: PIXELS, notes: pv.notes || {}, muted: pv.muted || [], limits: LIM });
      }
      if (m === 'PATCH' && (!b || !c)) {
        if (me.role === 'spectator' && b) throw err(403, 'spectators can only edit their own profile');
        const t = editable(b ? decodeURIComponent(b) : null);
        const body = await readBody(req);
        return send(res, 200, { profile: patch(t, body, { agent: isAgent(t) }) });
      }
      if ((b === 'avatar' || b === 'banner') && m === 'POST') {
        const t = editable(url.searchParams.get('for'));
        const body = await readBody(req, 4 * 1024 * 1024);
        return send(res, 200, { profile: b === 'avatar' ? setPhoto(t, body) : setBanner(t, body) });
      }
      if (b === 'media' && c && m === 'GET') {
        if (!/^[\w-]+\.(png|jpg|webp|gif)$/.test(c)) return fail(res, 400, 'bad file');
        const file = path.join(MEDIA, c);
        let data; try { data = fs.readFileSync(file); } catch { return fail(res, 404, 'not found'); }
        const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[c.split('.').pop()];
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox", 'Access-Control-Allow-Origin': '*' });
        return res.end(data);
      }
      if (b && !c && m === 'GET') return send(res, 200, view(me, decodeURIComponent(b), visible));
      if (b && c === 'note' && m === 'PUT') {
        const mid = decodeURIComponent(b); if (!member(mid) || !visible(mid)) throw err(404, 'no such person');
        if (me.role === 'agent') throw err(403, 'agents do not keep notes');
        const body = await readBody(req), v = text(body.text, LIM.note, 6), pv = mine(me.id);
        v ? pv.notes[mid] = v : delete pv.notes[mid];
        savePriv(); return send(res, 200, { note: v });
      }
      if (b && c === 'mute' && m === 'PUT') {
        const mid = decodeURIComponent(b); if (!member(mid) || !visible(mid) || mid === me.id) throw err(400, 'not someone you can mute');
        if (me.role === 'agent') throw err(403, 'agents do not mute people');
        const body = await readBody(req), pv = mine(me.id), set = new Set(pv.muted || []);
        body.on === false ? set.delete(mid) : set.add(mid);
        pv.muted = [...set].slice(0, 500); savePriv();
        return send(res, 200, { muted: pv.muted.includes(mid), list: pv.muted });
      }
    } catch (e) { return fail(res, e.status || 500, e.message); }
    return fail(res, 404, 'not found');
  }

  return { route, decorate, forViewer, brief, full, isDnd, isMuted, NAME_COLORS, PIXELS };
}
module.exports = makeProfiles;
module.exports.NAME_COLORS = NAME_COLORS;
module.exports.PIXELS = PIXELS;
module.exports.emojiOk = emojiOk;
module.exports.urlOk = urlOk;
