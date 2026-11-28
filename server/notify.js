// Notification hub ("pocket agent"). Listens on bus 'notify', and for every recipient decides:
//   in-app  : always lands in the inbox (.tribe/inbox/<member>.jsonl) and goes over open sockets
//   pocket  : ntfy, Web Push or a desktop (Tauri) notification, only when the member is away
//             (or always, by pref), outside quiet hours, the type is on, and not rate-limited
//   digest  : low-priority / switched-off types are batched into one summary every few hours
// Per-member prefs live in .tribe/notify.json. `decide()` is pure so the rules are unit-tested.
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const webpush = require('./webpush');

const TYPES = ['message', 'approval', 'mention', 'dm', 'task-assigned', 'reminder', 'proposal', 'bug-critical', 'release', 'huddle', 'meeting-notes', 'repo', 'comment-reply', 'visual-diff'];
const RATE_MS = 2 * 60_000;           // at most one pocket push per type per member per 2 minutes
const INBOX_KEEP = 200;
const NTFY_PRIORITY = { high: '4', normal: '3', low: '2' };
const NTFY_TAGS = { approval: 'raising_hand', mention: 'speech_balloon', dm: 'envelope', 'task-assigned': 'clipboard', reminder: 'alarm_clock',
  proposal: 'ballot_box', 'bug-critical': 'beetle', release: 'rocket', huddle: 'microphone', digest: 'newspaper', test: 'bell' };

function defaultPrefs() {
  return {
    types: { message: true, approval: true, mention: true, dm: true, 'task-assigned': true, reminder: true, proposal: true, 'bug-critical': true, release: false, huddle: false, 'meeting-notes': false, repo: false, 'comment-reply': true, 'visual-diff': false },
    channels: { ntfy: false, webpush: true, desktop: true, email: false },   // fix/security-review: ntfy (a third-party server, ntfy.sh by default) is opt-in
    ntfy: { server: 'https://ntfy.sh', topic: 'tribe-' + crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, '').slice(0, 14).toLowerCase() },
    when: { mode: 'away', awayMinutes: 5, quiet: { on: false, from: '22:00', to: '08:00' } },
    digest: { on: true, everyHours: 4, at: '' },
    mutes: { channels: {}, projects: {} },   // feat/settings-tabs: per channel / project: 'all' (default), 'mentions' or 'none' (legacy; groups below wins)
    groups: { projects: {}, channels: {} },  // p14: Discord-style per project / channel settings (docs/NOTIFICATIONS.md)
    app: { sound: true, toasts: true },      // p14: sounds and pop-ups, synced to all your devices
    tz: 'UTC',
    webpush: [],
  };
}
function mergePrefs(base, p) {
  const out = JSON.parse(JSON.stringify(base));
  if (!p || typeof p !== 'object') return out;
  for (const k of ['types', 'channels', 'ntfy', 'when', 'digest']) if (p[k] && typeof p[k] === 'object') Object.assign(out[k], p[k]);
  if (p.when && p.when.quiet) out.when.quiet = { ...base.when.quiet, ...p.when.quiet };
  if (typeof p.tz === 'string') out.tz = p.tz;
  if (Array.isArray(p.webpush)) out.webpush = p.webpush;
  if (p.mutes && typeof p.mutes === 'object') out.mutes = { channels: { ...((p.mutes || {}).channels || {}) }, projects: { ...((p.mutes || {}).projects || {}) } };
  if (p.app && typeof p.app === 'object') Object.assign(out.app, p.app);
  const g = p.groups && typeof p.groups === 'object' ? p.groups : (out.groups || {});
  out.groups = { projects: JSON.parse(JSON.stringify(g.projects || {})), channels: JSON.parse(JSON.stringify(g.channels || {})) };
  for (const kind of ['projects', 'channels']) for (const [k, lv] of Object.entries(out.mutes[kind])) {   // the old per channel / project levels carry over
    if (!LEVELS.includes(lv)) continue; const o = out.groups[kind][k] = out.groups[kind][k] || {}; if (!o.level) o.level = lv;
  }
  return out;
}
// Only accept known shapes from clients.
function cleanPrefs(cur, body, now = Date.now()) {
  const p = mergePrefs(cur, {});
  const b = body || {};
  if (b.types) for (const [k, v] of Object.entries(b.types)) if (TYPES.includes(k) || /^[a-z][a-z-]{1,30}$/.test(k)) p.types[k] = !!v;
  if (b.channels) for (const k of ['ntfy', 'webpush', 'desktop', 'email']) if (k in b.channels) p.channels[k] = !!b.channels[k];
  if (b.ntfy) {
    if (typeof b.ntfy.server === 'string' && /^https?:\/\/[^\s]+$/.test(b.ntfy.server.trim())) p.ntfy.server = b.ntfy.server.trim().replace(/\/+$/, '');
    if (typeof b.ntfy.topic === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(b.ntfy.topic.trim())) p.ntfy.topic = b.ntfy.topic.trim();
    if (p.ntfy.server !== cur.ntfy.server || p.ntfy.topic !== cur.ntfy.topic || b.ntfy.enabled === true) p.channels.ntfy = true;   // setting up ntfy turns it on
  }
  const hm = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if (b.when) {
    if (['away', 'always'].includes(b.when.mode)) p.when.mode = b.when.mode;
    if (Number.isFinite(Number(b.when.awayMinutes))) p.when.awayMinutes = Math.min(Math.max(Number(b.when.awayMinutes), 0), 240);
    if (b.when.quiet) {
      if ('on' in b.when.quiet) p.when.quiet.on = !!b.when.quiet.on;
      if (hm(b.when.quiet.from)) p.when.quiet.from = b.when.quiet.from;
      if (hm(b.when.quiet.to)) p.when.quiet.to = b.when.quiet.to;
    }
  }
  if (b.digest) {
    if ('on' in b.digest) p.digest.on = !!b.digest.on;
    if (Number.isFinite(Number(b.digest.everyHours))) p.digest.everyHours = Math.min(Math.max(Number(b.digest.everyHours), 1), 24);
    if (b.digest.at === '' || hm(b.digest.at)) p.digest.at = b.digest.at;
  }
  if (b.mutes && typeof b.mutes === 'object') for (const kind of ['channels', 'projects']) {
    const m = b.mutes[kind]; if (!m || typeof m !== 'object') continue;
    for (const [k, v] of Object.entries(m)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(k)) continue;
      if (v === 'all' || v === null) delete p.mutes[kind][k]; else if (v === 'mentions' || v === 'none') p.mutes[kind][k] = v;
    }
    const ks = Object.keys(p.mutes[kind]); if (ks.length > 200) for (const k of ks.slice(0, ks.length - 200)) delete p.mutes[kind][k];
  }
  if (b.groups && typeof b.groups === 'object') for (const kind of ['projects', 'channels']) {
    const m = b.groups[kind]; if (!m || typeof m !== 'object') continue;
    for (const [k, v] of Object.entries(m)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(k)) continue;
      if (v === null) { delete p.groups[kind][k]; delete p.mutes[kind][k]; continue; }
      if (!v || typeof v !== 'object') continue;
      const o = { ...(p.groups[kind][k] || {}) };
      if ('level' in v) {
        if (v.level === 'default' || v.level === null) { delete o.level; delete p.mutes[kind][k]; }
        else if (LEVELS.includes(v.level)) { o.level = v.level; if (v.level === 'all') delete p.mutes[kind][k]; else p.mutes[kind][k] = v.level; }
      }
      if ('mute' in v) {
        if (v.mute === null || v.mute === false || v.mute === 'off') delete o.until;
        else if (v.mute in MUTE_FOR) o.until = MUTE_FOR[v.mute] < 0 ? -1 : now + MUTE_FOR[v.mute];
      }
      if (kind === 'projects') {
        for (const f of ['noEveryone', 'noRoles']) if (f in v) { if (v[f]) o[f] = true; else delete o[f]; }
        if ('push' in v) { if (v.push === false) o.push = false; else delete o.push; }
        if ('muteNew' in v) { if (v.muteNew) { o.muteNew = true; o.muteNewAt = o.muteNewAt || new Date(now).toISOString(); } else { delete o.muteNew; delete o.muteNewAt; } }
      }
      if (Object.keys(o).length) p.groups[kind][k] = o; else delete p.groups[kind][k];
    }
    const ks = Object.keys(p.groups[kind]); if (ks.length > 300) for (const k of ks.slice(0, ks.length - 300)) delete p.groups[kind][k];
  }
  if (b.app && typeof b.app === 'object') for (const k of ['sound', 'toasts']) if (k in b.app) p.app[k] = !!b.app[k];
  if (typeof b.tz === 'string' && validTz(b.tz)) p.tz = b.tz;
  return p;
}
function validTz(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } }

// Local "HH:MM" and "YYYY-MM-DD" for a timestamp in a time zone.
function localParts(now, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: validTz(tz) ? tz : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = Object.fromEntries(f.formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return { hm: `${o.hour}:${o.minute}`, day: `${o.year}-${o.month}-${o.day}` };
}
function inQuiet(now, prefs) {
  const q = prefs.when && prefs.when.quiet;
  if (!q || !q.on || q.from === q.to) return false;
  const { hm } = localParts(now, prefs.tz);
  return q.from < q.to ? hm >= q.from && hm < q.to : hm >= q.from || hm < q.to;   // wraps past midnight
}

// Per channel / project mutes: 'none' silences everything from there, 'mentions' lets only mentions, DMs and approvals through.
function mutedBy(prefs, n, project = n.project) {
  const m = prefs.mutes || {}, lv = [(m.channels || {})[n.ref], (m.projects || {})[project]];
  if (lv.includes('none') && n.type !== 'approval') return true;
  return lv.includes('mentions') && !['mention', 'dm', 'approval'].includes(n.type);
}
// ---------- p14: Discord-style per project / channel settings (docs/NOTIFICATIONS.md) ----------
// level: 'all' | 'mentions' | 'none' (a channel can also say nothing = use the project's); until: ms, or -1 = until turned back on.
const LEVELS = ['all', 'mentions', 'none'];
const MUTE_FOR = { '15m': 15 * 60_000, '1h': 3600_000, '3h': 3 * 3600_000, '8h': 8 * 3600_000, '24h': 24 * 3600_000, forever: -1 };
// Things addressed to you count like an @mention; everything else (a chat message, a release, a huddle) like a plain message.
const PERSONAL = new Set(['mention', 'task-assigned', 'comment-reply', 'reminder', 'meeting', 'approval']);
const SMALL = 5;   // a project of up to 5 people starts on "All messages", a bigger one on "Only @mentions"
const defaultLevel = size => (size > SMALL ? 'mentions' : 'all');
const mutedNow = (until, now) => until === -1 || (typeof until === 'number' && until > now);
// Pure: (prefs, item, { project, size, now, chanCreated }) -> { notify, push, dot, badge, level, muted, reason }
//   notify: in-app pop-up, sound, inbox, desktop · push: also to the phone · dot: the unread dot · badge: counts as a mention
function groupVerdict(prefs, n, { project = null, size = 0, now = Date.now(), chanCreated = null } = {}) {
  const g = (prefs && prefs.groups) || {}, ref = n.ref || '';
  const pj = (project && (g.projects || {})[project]) || {}, ch = (ref && (g.channels || {})[ref]) || {};
  if (n.type === 'approval' || n.force) return { notify: true, push: true, dot: true, badge: true, level: 'all', muted: false, reason: 'needs-you' };
  if (n.type === 'dm' || /^dm-/.test(ref)) {   // DMs always notify unless that DM is muted
    const m = mutedNow(ch.until, now);
    return { notify: !m, push: !m, dot: !m, badge: !m, level: 'all', muted: m, reason: m ? 'dm-muted' : 'dm' };
  }
  if (!project && !ch.level && ch.until === undefined) return { notify: true, push: true, dot: true, badge: PERSONAL.has(n.type), level: 'all', muted: false, reason: 'no-project' };
  const newMuted = !!(pj.muteNew && !ch.level && ch.until === undefined && chanCreated && pj.muteNewAt && chanCreated > pj.muteNewAt);
  const muted = mutedNow(ch.until, now) || mutedNow(pj.until, now) || newMuted;
  const level = ch.level && ch.level !== 'default' ? ch.level : pj.level || (project ? defaultLevel(size) : 'all');
  let mention = PERSONAL.has(n.type);
  if (mention && n.everyone && pj.noEveryone) mention = false;   // Suppress @everyone and @here: it counts as a plain message
  if (mention && n.role && pj.noRoles) mention = false;
  if (level === 'none') return { notify: false, push: false, dot: !muted, badge: false, level, muted, reason: 'nothing' };
  const notify = mention || (level === 'all' && !muted);
  return { notify, push: notify && pj.push !== false, dot: !muted, badge: mention, level, muted, reason: notify ? (mention ? 'mention' : 'all') : muted ? 'muted' : 'mentions-only' };
}

// The decision table. Pure: (prefs, event, presence, time, last pushes) -> what to do.
//   pocket: send to phone/desktop now · digest: queue for the next summary · collapse: counted into the next push
function decide({ prefs, n, away, now, lastPush = {}, rateMs = RATE_MS }) {
  const t = prefs.types[n.type];
  const enabled = t === undefined ? n.priority !== 'low' : !!t;
  if (n.force) return { pocket: true, digest: false, reason: 'test' };
  if (!enabled) return { pocket: false, digest: !!prefs.digest.on, reason: prefs.digest.on ? 'digest' : 'off' };
  if (prefs.when.mode !== 'always' && !away) return { pocket: false, digest: false, reason: 'online' };
  if (inQuiet(now, prefs)) return { pocket: false, digest: true, held: true, reason: 'quiet' };
  const last = lastPush[n.type];
  if (n.type !== 'approval' && last && now - last.at < rateMs) return { pocket: false, digest: false, collapse: true, reason: last.ref && last.ref === n.ref ? 'duplicate' : 'rate' };
  return { pocket: true, digest: false, reason: 'push' };
}

// Is the digest for this member due?
function digestDue({ prefs, queue, lastDigest = 0, lastDigestDay = '', now }) {
  if (!queue.length || inQuiet(now, prefs)) return false;
  if (queue.some(q => q.held)) return true;                       // quiet hours just ended
  if (!prefs.digest.on) return false;
  if (prefs.digest.at) { const l = localParts(now, prefs.tz); return l.hm >= prefs.digest.at && lastDigestDay !== l.day; }
  return now - Math.max(lastDigest, Date.parse(queue[0].at) || 0) >= prefs.digest.everyHours * 3600_000;
}

// RFC 2047 so non-ASCII titles survive HTTP headers (ntfy decodes these).
const hdr = s => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

function mentionsIn(text, members, byId) {
  const words = (String(text).match(/@[^\s@]+/g) || []).map(w => w.slice(1).replace(/[.,!?;:)]+$/, '').toLowerCase());
  if (!words.length) return [];
  const all = words.some(w => w === 'everyone' || w === 'here' || w === 'tribe');
  return members.filter(m => m.role !== 'agent' && m.id !== byId && (all || words.some(w =>
    w === m.id.toLowerCase() || w === m.name.toLowerCase().replace(/\s+/g, '') || w === m.name.toLowerCase().split(/\s+/)[0]))).map(m => m.id);
}

// p14: who a message mentions, and how: by name, through @everyone / @here, or through their role (@admins, @mods…).
const ROLE_WORDS = { host: 'host', hosts: 'host', admin: 'admin', admins: 'admin', mod: 'mod', mods: 'mod', moderators: 'mod', builder: 'builder', builders: 'builder' };
function mentionDetail(text, members, byId) {
  const words = (String(text).match(/@[^\s@]+/g) || []).map(w => w.slice(1).replace(/[.,!?;:)]+$/, '').toLowerCase());
  const out = new Map(); if (!words.length) return out;
  const all = words.some(w => w === 'everyone' || w === 'here' || w === 'tribe'), roles = new Set(words.map(w => ROLE_WORDS[w]).filter(Boolean));
  for (const m of members) {
    if (m.role === 'agent' || m.id === byId) continue;
    const named = words.some(w => w === m.id.toLowerCase() || w === m.name.toLowerCase().replace(/\s+/g, '') || w === m.name.toLowerCase().split(/\s+/)[0]);
    if (named) out.set(m.id, {});
    else if (roles.has(m.role)) out.set(m.id, { role: true });
    else if (all) out.set(m.id, { everyone: true });
  }
  return out;
}

function makeNotify({ store, bus, getMembers, sendTo, publicUrl, postChat = () => {}, log = () => {}, now = () => Date.now(), fetchImpl = (...a) => globalThis.fetch(...a), tick = true, dnd = () => false, muted = () => false, mail = () => false, canMail = () => false, projectOf = () => null, projectSize = () => 0, projectsFor = () => [], canSeeRef = () => true, chanCreated = () => null, testClock = false }) {
  const realNow = now; let skew = 0; now = () => realNow() + skew;   // p14: tests move the clock to see a mute run out
  fs.mkdirSync(store.p('.tribe/inbox'), { recursive: true });
  const db = store.readJSON('.tribe/notify.json', null) || {};
  db.secret = db.secret || crypto.randomBytes(32).toString('base64url');
  db.members = db.members || {};
  db.used = db.used || [];
  const save = () => store.writeJSON('.tribe/notify.json', db);
  save();
  let vapid = null;
  const keys = () => (vapid = vapid || webpush.loadVapid(store));

  const rec = mid => (db.members[mid] = db.members[mid] || { prefs: defaultPrefs(), lastRead: null, queue: [] });
  const prefsOf = mid => { const r = rec(mid); r.prefs = mergePrefs(defaultPrefs(), r.prefs); return r.prefs; };
  const memberById = mid => getMembers().find(m => m.id === mid);
  const humans = () => getMembers().filter(m => m.role !== 'agent');
  const safe = mid => String(mid).replace(/[^A-Za-z0-9_-]/g, '_');

  // ---------- presence (per socket: idle/hidden since) ----------
  const live = new Map();   // memberId -> Map(socket -> { idle, since, desktop })
  function attach(me, s) {
    const st = { idle: false, since: now(), desktop: false };
    if (!live.has(me.id)) live.set(me.id, new Map());
    live.get(me.id).set(s, st);
    s.on('message', msg => {
      if (!msg || msg.type !== 'activity') return;
      if (typeof msg.idle === 'boolean' && msg.idle !== st.idle) { st.idle = msg.idle; st.since = now(); }
      if (msg.desktop) st.desktop = true;
      if (typeof msg.tz === 'string' && validTz(msg.tz)) { const p = prefsOf(me.id); if (p.tz !== msg.tz) { p.tz = msg.tz; save(); } }
    });
    s.on('close', () => { const m = live.get(me.id); if (m) { m.delete(s); if (!m.size) live.delete(me.id); } });
  }
  function isAway(mid, prefs = prefsOf(mid)) {
    const socks = live.get(mid);
    if (!socks || !socks.size) return true;
    const limit = (prefs.when.awayMinutes || 0) * 60_000;
    return [...socks.values()].every(st => st.idle && now() - st.since >= limit);
  }

  // ---------- inbox ----------
  const lineCount = new Map();
  function inboxAppend(mid, item) {
    const rel = `.tribe/inbox/${safe(mid)}.jsonl`;
    store.appendJSONL(rel, item);
    const n = (lineCount.get(mid) ?? store.readJSONL(rel, 100000).length - 1) + 1;
    lineCount.set(mid, n);
    if (n > INBOX_KEEP + 60) { const keep = store.readJSONL(rel, INBOX_KEEP); store._atomic(store.p(rel), keep.map(x => JSON.stringify(x)).join('\n') + '\n'); lineCount.set(mid, keep.length); }
  }
  const inbox = mid => store.readJSONL(`.tribe/inbox/${safe(mid)}.jsonl`, INBOX_KEEP).reverse();
  // Read state: everything up to lastRead is read, unless a per-item mark says otherwise. Snoozed items hide until they wake.
  const isUnread = (r, i, t = now()) => { const mk = (r.marks || {})[i.id] || {}; if (mk.snooze && Date.parse(mk.snooze) > t) return false; return mk.read === false || (mk.read !== true && (!r.lastRead || i.at > r.lastRead)); };
  const unread = mid => { const r = rec(mid); return inbox(mid).filter(i => isUnread(r, i)).length; };
  function mark(mid, nid, patch) {
    const r = rec(mid); r.marks = r.marks || {};
    r.marks[nid] = { ...(r.marks[nid] || {}), ...patch };
    const ids = Object.keys(r.marks); if (ids.length > 400) for (const k of ids.slice(0, ids.length - 400)) delete r.marks[k];
    save(); return r.marks[nid];
  }
  // Forwarded items are readable by anyone who can open the chat they were forwarded to.
  const shared = store.readJSON('.tribe/notify-shared.json', {});
  const findItem = (mid, nid) => inbox(mid).find(i => i.id === nid) || shared[nid] || null;
  const LABEL = { approval: 'Approval', mention: 'Mention', dm: 'Message', 'task-assigned': 'Task', reminder: 'Reminder', proposal: 'Proposal', 'bug-critical': 'Critical bug', release: 'Release', huddle: 'Huddle', digest: 'Digest' };
  const forwardText = (item, byName) => `> 🔔 **${LABEL[item.type] || 'Notification'}: ${String(item.title).replace(/\*/g, '')}** · forwarded by ${byName}\n${item.body ? '> ' + String(item.body).split('\n')[0].slice(0, 200) + '\n' : ''}[open](#notif:${item.id})`;

  // ---------- signed one-time action links (ntfy buttons, web push actions) ----------
  const sig = (aid, d, mid, e) => crypto.createHmac('sha256', db.secret).update(`${aid}|${d}|${mid}|${e}`).digest('base64url').slice(0, 32);
  function actionUrl(aid, decision, mid, ttlMs = 7 * 24 * 3600_000) {
    const e = Math.floor((now() + ttlMs) / 1000);
    return `${publicUrl()}/api/approvals/${encodeURIComponent(aid)}/${decision}?m=${encodeURIComponent(mid)}&e=${e}&t=${sig(aid, decision, mid, e)}`;
  }
  // Returns the member the link was minted for, or null. Each token works once.
  function verifyAction(aid, decision, q) {
    const mid = q.get('m'), e = Number(q.get('e')), t = q.get('t') || '';
    if (!mid || !e || e * 1000 < now() || db.used.includes(t)) return null;
    const want = sig(aid, decision, mid, e);
    if (t.length !== want.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(want))) return null;
    db.used.push(t); db.used = db.used.slice(-500); save();
    return memberById(mid) || null;
  }

  // ---------- pocket channels ----------
  const clickUrl = item => `${publicUrl()}/?open=${encodeURIComponent(item.view || 'inbox')}${item.ref ? '&ref=' + encodeURIComponent(item.ref) : ''}`;
  async function viaNtfy(mid, prefs, item) {
    const headers = { Title: hdr(item.title), Priority: NTFY_PRIORITY[item.priority] || '3', Tags: NTFY_TAGS[item.type] || 'bell', Click: clickUrl(item) };
    if (item.approval) headers.Actions = [`http, Approve, ${actionUrl(item.approval, 'approve', mid)}, method=POST, clear=true`, `http, Deny, ${actionUrl(item.approval, 'deny', mid)}, method=POST, clear=true`].join('; ');
    const res = await fetchImpl(`${prefs.ntfy.server}/${prefs.ntfy.topic}`, { method: 'POST', headers, body: item.body || item.title });
    return res.status < 300;
  }
  async function viaWebPush(mid, prefs, item) {
    let ok = 0;
    const payload = { title: item.title, body: item.body || '', tag: item.type === 'approval' ? 'approval-' + item.approval : item.type, url: clickUrl(item), view: item.view, ref: item.ref, priority: item.priority };
    if (item.approval) payload.actions = [{ action: 'approve', title: 'Approve', url: actionUrl(item.approval, 'approve', mid) }, { action: 'deny', title: 'Deny', url: actionUrl(item.approval, 'deny', mid) }];
    let json = JSON.stringify(payload);
    if (json.length > 3000) { payload.body = payload.body.slice(0, 400); json = JSON.stringify(payload); }
    for (const sub of [...prefs.webpush]) {
      try {
        const r = await webpush.send(sub, json, keys(), { urgency: item.priority === 'high' ? 'high' : item.priority === 'low' ? 'low' : 'normal', fetchImpl });
        if (r.gone) { prefs.webpush = prefs.webpush.filter(s => s.endpoint !== sub.endpoint); save(); } else if (r.status < 300) ok++;
      } catch (e) { log('web push failed: ' + e.message); }
    }
    return ok > 0;
  }
  function viaDesktop(mid, item) {
    let n = 0;
    for (const [s, st] of live.get(mid) || []) if (st.desktop && s.open) { s.send({ type: 'notification', item, pocket: true, unread: unread(mid) }); n++; }
    return n > 0;
  }
  async function pocket(mid, prefs, item, { phone = true } = {}) {
    const used = [];
    const tries = [];
    if (!phone) { if (prefs.channels.desktop && viaDesktop(mid, item)) used.push('desktop'); return used; }   // p14: the project's "Mobile push notifications" is off
    if (prefs.channels.ntfy && prefs.ntfy.topic && prefs.ntfy.server) tries.push(viaNtfy(mid, prefs, item).then(ok => ok && used.push('ntfy')).catch(e => log('ntfy failed: ' + e.message)));
    if (prefs.channels.webpush && prefs.webpush.length) tries.push(viaWebPush(mid, prefs, item).then(ok => ok && used.push('webpush')));
    if (prefs.channels.desktop && viaDesktop(mid, item)) used.push('desktop');
    if (prefs.channels.email && item.type !== 'test' && mail(mid, `TribeCode: ${item.title}`, `${item.title}\n\n${item.body || ''}\n\n${clickUrl(item)}\n\nChange what you get in Settings › Notifications.`)) used.push('email');
    await Promise.all(tries);
    return used;
  }

  // ---------- the hub ----------
  const lastPush = new Map();   // memberId -> { [type]: { at, ref } }
  const collapsed = new Map();  // memberId -> { [type]: count }
  const recent = new Map();     // memberId -> last decisions (debug + tests)
  function note(mid, entry) { const r = recent.get(mid) || []; r.unshift(entry); recent.set(mid, r.slice(0, 30)); }

  function recipients(n) {
    const list = n.to === 'all' || !n.to ? humans().map(m => m.id) : [].concat(n.to);
    return [...new Set(list)].filter(mid => { const m = memberById(mid); return m && m.role !== 'agent' && mid !== n.from && !muted(mid, n.from); });   // feat/profiles: people you muted don't notify you
  }

  async function handle(n) {
    for (const mid of recipients(n)) {
      const item = { id: 'n-' + crypto.randomBytes(6).toString('base64url'), at: n.at || new Date(now()).toISOString(), type: n.type, priority: n.priority || 'normal',
        title: String(n.title || n.type).slice(0, 160), body: String(n.body || '').slice(0, 600), view: n.view || null, ref: n.ref || null,
        from: n.from || null, approval: n.approval || null, actions: n.actions || undefined, ...(n.project ? { project: String(n.project).slice(0, 64) } : {}),
        ...(n.transient ? { transient: true } : {}), ...(n.channel ? { channel: n.channel } : {}) };
      const pid = item.project || (item.ref ? projectOf(item.ref) : null);
      if (pid && !item.project) item.project = pid;
      // p14: the person's per project / channel settings (Discord semantics, docs/NOTIFICATIONS.md) decide first, for every kind
      const gv = groupVerdict(prefsOf(mid), { ...item, force: n.force, everyone: !!(n.everyone && n.everyone.includes && n.everyone.includes(mid)), role: !!(n.role && n.role.includes && n.role.includes(mid)) },
        { project: pid, size: pid ? projectSize(pid) : 0, now: now(), chanCreated: item.ref ? chanCreated(item.ref) : null });
      if (!gv.notify) { note(mid, { at: item.at, type: item.type, title: item.title, pocket: false, digest: false, reason: gv.reason === 'mentions-only' || gv.reason === 'nothing' ? gv.reason : 'muted' }); continue; }
      if (!n.force && !item.transient) inboxAppend(mid, item);
      sendTo(mid, { type: 'notification', item, ...(item.transient ? {} : { unread: unread(mid) }) });
      const prefs = prefsOf(mid);
      const lp = lastPush.get(mid) || {};
      const d = !n.force && dnd(mid) ? { pocket: false, digest: false, reason: 'dnd' }   // feat/profiles: do not disturb silences pushes (the inbox still gets it)
        : decide({ prefs, n: n.force ? { ...item, force: true } : item, away: isAway(mid, prefs), now: now(), lastPush: lp });
      note(mid, { at: item.at, type: item.type, title: item.title, ...d });
      if (d.pocket) {
        const c = collapsed.get(mid) || {};
        const out = c[item.type] ? { ...item, body: `${item.body}${item.body ? '\n' : ''}+${c[item.type]} more like this` } : item;
        delete c[item.type]; collapsed.set(mid, c);
        lp[item.type] = { at: now(), ref: item.ref }; lastPush.set(mid, lp);
        const used = await pocket(mid, prefs, out, { phone: gv.push });
        recent.get(mid)[0].channels = used;
      } else if (d.digest) {
        const r = rec(mid); r.queue = [...(r.queue || []), { at: item.at, type: item.type, title: item.title, held: !!d.held }].slice(-100); save();
      } else if (d.collapse) {
        const c = collapsed.get(mid) || {}; c[item.type] = (c[item.type] || 0) + 1; collapsed.set(mid, c);
      }
    }
  }
  const pending = new Set();
  const onNotify = n => { const p = handle(n).catch(e => log('notify: ' + (e.stack || e.message))); pending.add(p); p.finally(() => pending.delete(p)); };
  bus.on('notify', onNotify);

  async function flushDigests() {
    for (const [mid, r] of Object.entries(db.members)) {
      if (!r.queue || !r.queue.length || !memberById(mid)) continue;
      const prefs = prefsOf(mid);
      if (dnd(mid)) continue;   // feat/profiles: hold the digest while do not disturb is on
      if (!digestDue({ prefs, queue: r.queue, lastDigest: r.lastDigest || 0, lastDigestDay: r.lastDigestDay || '', now: now() })) continue;
      const q = r.queue; r.queue = []; r.lastDigest = now(); r.lastDigestDay = localParts(now(), prefs.tz).day; save();
      if (prefs.when.mode !== 'always' && !isAway(mid, prefs)) continue;          // they've seen it all in the app
      const lines = q.slice(-6).reverse().map(x => '• ' + x.title);
      const item = { id: 'n-' + crypto.randomBytes(6).toString('base64url'), at: new Date(now()).toISOString(), type: 'digest', priority: 'low',
        title: `${q.length} update${q.length > 1 ? 's' : ''} from your tribe`, body: lines.join('\n') + (q.length > 6 ? `\n…and ${q.length - 6} more` : ''), view: 'inbox' };
      note(mid, { at: item.at, type: 'digest', title: item.title, pocket: true, reason: 'digest-sent', channels: await pocket(mid, prefs, item) });
    }
  }
  if (tick) setInterval(() => flushDigests().catch(e => log('digest: ' + e.message)), 30_000).unref();

  // Chat hook: @name, @everyone, @role -> a mention; everyone else who can read the channel -> a plain message (p14), which
  // only reaches people whose setting there is "All messages" (it never lands in the inbox).
  function chat(channel, by, text, label) {
    if (by === 'tribecode') return;
    const det = mentionDetail(text, getMembers(), by);
    const to = [...det.keys()];
    const who = (memberById(by) || {}).name || 'Someone', name = label || channel;
    if (to.length) bus.notify({ type: 'mention', priority: 'high', to, from: by, title: `${who} mentioned you in #${name}`, body: String(text).slice(0, 300), view: 'chat', ref: channel,
      everyone: to.filter(x => det.get(x).everyone), role: to.filter(x => det.get(x).role) });
    const rest = humans().map(m => m.id).filter(mid => mid !== by && !det.has(mid) && canSeeRef(mid, channel));
    if (rest.length) bus.notify({ type: 'message', priority: 'normal', transient: true, to: rest, from: by, title: `${who} in #${name}`, body: String(text).slice(0, 300), view: 'chat', ref: channel });
  }

  // ---------- REST: /api/notify/... ----------
  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (me.role === 'agent') return fail(res, 403, 'agents do not have notification settings');
    const r = rec(me.id);
    if (b === 'prefs' && m === 'GET') {
      const p = prefsOf(me.id);
      return send(res, 200, { prefs: { ...p, webpush: undefined }, now: now(), defaults: Object.fromEntries(projectsFor(me.id).map(x => [x.id, defaultLevel(x.size)])), small: SMALL, webpushDevices: p.webpush.length, vapidPublicKey: keys().publicKey,
        ntfyUrl: `${p.ntfy.server}/${p.ntfy.topic}`, types: TYPES, publicUrl: publicUrl(), emailAvailable: !!canMail(me.id) });
    }
    if (b === 'prefs' && (m === 'PUT' || m === 'PATCH')) {
      const body = await readBody(req);
      r.prefs = cleanPrefs(prefsOf(me.id), body, now()); save();
      const p = r.prefs, out = { ...p, webpush: undefined };
      sendTo(me.id, { type: 'notify-prefs', prefs: out, now: now() });   // p14: your other devices follow at once
      return send(res, 200, { prefs: out, now: now(), ntfyUrl: `${p.ntfy.server}/${p.ntfy.topic}` });
    }
    if (b === 'topic' && m === 'POST') { const p = prefsOf(me.id); p.ntfy.topic = defaultPrefs().ntfy.topic; save(); return send(res, 200, { topic: p.ntfy.topic, ntfyUrl: `${p.ntfy.server}/${p.ntfy.topic}` }); }
    if (b === 'inbox' && m === 'GET') return send(res, 200, { items: inbox(me.id), unread: unread(me.id), lastRead: r.lastRead, marks: r.marks || {} });
    if (b === 'read' && m === 'POST') {   // mark everything read (clears per-item "unread" marks, keeps snoozes)
      const body = await readBody(req).catch(() => ({}));
      if (body && typeof body.project === 'string') {   // p14: "Mark as read" on a project circle: only that project's items
        for (const i of inbox(me.id)) if (isUnread(r, i) && (i.project === body.project || (i.ref && projectOf(i.ref) === body.project))) { r.marks = r.marks || {}; r.marks[i.id] = { ...(r.marks[i.id] || {}), read: true }; }
        save(); return send(res, 200, { unread: unread(me.id) });
      }
      r.lastRead = new Date(now()).toISOString();
      for (const k of Object.keys(r.marks || {})) { delete r.marks[k].read; if (!Object.keys(r.marks[k]).length) delete r.marks[k]; }
      save(); return send(res, 200, { unread: unread(me.id) });
    }
    if (b === 'items' && c && m === 'GET') { const it = findItem(me.id, c); return it ? send(res, 200, { item: it, mark: (r.marks || {})[c] || {} }) : fail(res, 404, 'notification not found'); }
    if (b === 'items' && c && m === 'POST') {   // { read: true|false } or { snooze: ISO time | null }
      const body = await readBody(req); const patch = {};
      if (typeof body.read === 'boolean') patch.read = body.read;
      if (body.snooze === null) patch.snooze = undefined;
      else if (typeof body.snooze === 'string' && Date.parse(body.snooze) > now()) { patch.snooze = new Date(Date.parse(body.snooze)).toISOString(); patch.read = false; }
      return send(res, 200, { mark: mark(me.id, c, patch), unread: unread(me.id) });
    }
    if (b === 'mute' && m === 'POST') {   // "mute this kind": no more pings for the type; it goes to the digest
      const body = await readBody(req); const t = String(body.type || '');
      if (!/^[a-z][a-z-]{1,30}$/.test(t) || t === 'approval') return fail(res, 400, 'that kind cannot be muted');
      const p = prefsOf(me.id); p.types[t] = body.on === true; save(); return send(res, 200, { types: p.types });
    }
    if (b === 'forward' && m === 'POST') {
      const body = await readBody(req); const ch = String(body.channel || 'general');
      const dm = ch.match(/^dm-(.+)$/);
      if (dm) { const ids = getMembers().map(x => x.id).filter(x => ch === 'dm-' + [x, me.id].sort().join('-') || ch === 'dm-' + [me.id, x].sort().join('-')); if (!ids.length) return fail(res, 400, 'DM channel must be dm-<idA>-<idB> with you in it'); }
      else if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(ch)) return fail(res, 400, 'bad channel');
      if (me.role === 'spectator') return fail(res, 403, 'spectators cannot post');
      const it = findItem(me.id, String(body.id || '')); if (!it) return fail(res, 404, 'notification not found');
      shared[it.id] = { ...it, forwardedBy: me.id }; const ks = Object.keys(shared); if (ks.length > 300) delete shared[ks[0]];
      store.writeJSON('.tribe/notify-shared.json', shared);
      const msg = postChat(ch, me.id, forwardText(it, me.name));
      return send(res, 200, { message: msg, channel: ch });
    }
    if (b === 'state' && m === 'GET') return send(res, 200, { away: isAway(me.id), digest: { queued: (r.queue || []).length, items: r.queue || [] }, recent: recent.get(me.id) || [] });
    if (b === 'clock' && m === 'POST' && testClock) {   // tests only (TRIBE_TEST=1): move the clock so a timed mute runs out
      const body = await readBody(req); skew = Number(body.skewMs) || 0;
      for (const mm of humans()) sendTo(mm.id, { type: 'notify-prefs', prefs: { ...prefsOf(mm.id), webpush: undefined }, now: now() });
      return send(res, 200, { now: now(), skew });
    }
    if (b === 'vapid' && m === 'GET') return send(res, 200, { publicKey: keys().publicKey });
    if (b === 'webpush' && m === 'POST') {
      const body = await readBody(req); const s = body.subscription || {};
      if (typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !s.keys || !s.keys.p256dh || !s.keys.auth) return fail(res, 400, 'invalid push subscription');
      const p = prefsOf(me.id); p.webpush = [...p.webpush.filter(x => x.endpoint !== s.endpoint), { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, added: new Date(now()).toISOString() }].slice(-5);
      save(); return send(res, 200, { devices: p.webpush.length });
    }
    if (b === 'webpush' && m === 'DELETE') {
      const body = await readBody(req); const p = prefsOf(me.id);
      p.webpush = body.endpoint ? p.webpush.filter(x => x.endpoint !== body.endpoint) : []; save(); return send(res, 200, { devices: p.webpush.length });
    }
    if (b === 'test' && m === 'POST') {
      const prefs = prefsOf(me.id);
      const channels = await pocket(me.id, prefs, { id: 'n-test', at: new Date(now()).toISOString(), type: 'test', priority: 'normal', title: 'TribeCode test notification', body: 'If you can read this, your pocket is connected.', view: 'inbox' });
      return send(res, 200, { channels });
    }
    return null;
  }

  const unreadItems = mid => { const r = rec(mid); return inbox(mid).filter(i => isUnread(r, i)); };   // feat/dash-preview: unread mentions in Needs attention
  return { attach, route, chat, isAway, prefsOf, actionUrl, verifyAction, flushDigests, inbox, unread, unreadItems, keys, settle: () => Promise.all([...pending]), off: () => bus.off('notify', onNotify) };
}

module.exports = makeNotify;
Object.assign(module.exports, { groupVerdict, mentionDetail, defaultLevel, LEVELS, MUTE_FOR, SMALL, mutedBy, decide, inQuiet, digestDue, defaultPrefs, mergePrefs, cleanPrefs, mentionsIn, localParts, TYPES, RATE_MS });
