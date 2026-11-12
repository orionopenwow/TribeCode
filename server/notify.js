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

const TYPES = ['approval', 'mention', 'dm', 'task-assigned', 'reminder', 'proposal', 'bug-critical', 'release', 'huddle', 'meeting-notes', 'repo', 'comment-reply', 'visual-diff'];
const RATE_MS = 2 * 60_000;           // at most one pocket push per type per member per 2 minutes
const INBOX_KEEP = 200;
const NTFY_PRIORITY = { high: '4', normal: '3', low: '2' };
const NTFY_TAGS = { approval: 'raising_hand', mention: 'speech_balloon', dm: 'envelope', 'task-assigned': 'clipboard', reminder: 'alarm_clock',
  proposal: 'ballot_box', 'bug-critical': 'beetle', release: 'rocket', huddle: 'microphone', digest: 'newspaper', test: 'bell' };

function defaultPrefs() {
  return {
    types: { approval: true, mention: true, dm: true, 'task-assigned': true, reminder: true, proposal: true, 'bug-critical': true, release: false, huddle: false, 'meeting-notes': false, repo: false, 'comment-reply': true, 'visual-diff': false },
    channels: { ntfy: false, webpush: true, desktop: true },   // fix/security-review: ntfy (a third-party server, ntfy.sh by default) is opt-in
    ntfy: { server: 'https://ntfy.sh', topic: 'tribe-' + crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, '').slice(0, 14).toLowerCase() },
    when: { mode: 'away', awayMinutes: 5, quiet: { on: false, from: '22:00', to: '08:00' } },
    digest: { on: true, everyHours: 4, at: '' },
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
  return out;
}
// Only accept known shapes from clients.
function cleanPrefs(cur, body) {
  const p = mergePrefs(cur, {});
  const b = body || {};
  if (b.types) for (const [k, v] of Object.entries(b.types)) if (TYPES.includes(k) || /^[a-z][a-z-]{1,30}$/.test(k)) p.types[k] = !!v;
  if (b.channels) for (const k of ['ntfy', 'webpush', 'desktop']) if (k in b.channels) p.channels[k] = !!b.channels[k];
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

function makeNotify({ store, bus, getMembers, sendTo, publicUrl, postChat = () => {}, log = () => {}, now = () => Date.now(), fetchImpl = (...a) => globalThis.fetch(...a), tick = true, dnd = () => false, muted = () => false }) {
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
  async function pocket(mid, prefs, item) {
    const used = [];
    const tries = [];
    if (prefs.channels.ntfy && prefs.ntfy.topic && prefs.ntfy.server) tries.push(viaNtfy(mid, prefs, item).then(ok => ok && used.push('ntfy')).catch(e => log('ntfy failed: ' + e.message)));
    if (prefs.channels.webpush && prefs.webpush.length) tries.push(viaWebPush(mid, prefs, item).then(ok => ok && used.push('webpush')));
    if (prefs.channels.desktop && viaDesktop(mid, item)) used.push('desktop');
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
        from: n.from || null, approval: n.approval || null, actions: n.actions || undefined, ...(n.project ? { project: String(n.project).slice(0, 64) } : {}) };
      if (!n.force) inboxAppend(mid, item);
      sendTo(mid, { type: 'notification', item, unread: unread(mid) });
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
        const used = await pocket(mid, prefs, out);
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

  // Chat hook: @name, @everyone
  function chat(channel, by, text) {
    if (by === 'tribecode') return;
    const to = mentionsIn(text, getMembers(), by);
    if (!to.length) return;
    const who = (memberById(by) || {}).name || 'Someone';
    bus.notify({ type: 'mention', priority: 'high', to, from: by, title: `${who} mentioned you in #${channel}`, body: String(text).slice(0, 300), view: 'chat', ref: channel });
  }

  // ---------- REST: /api/notify/... ----------
  async function route(req, res, { m, b, c, me, readBody, send, fail }) {
    if (me.role === 'agent') return fail(res, 403, 'agents do not have notification settings');
    const r = rec(me.id);
    if (b === 'prefs' && m === 'GET') {
      const p = prefsOf(me.id);
      return send(res, 200, { prefs: { ...p, webpush: undefined }, webpushDevices: p.webpush.length, vapidPublicKey: keys().publicKey,
        ntfyUrl: `${p.ntfy.server}/${p.ntfy.topic}`, types: TYPES, publicUrl: publicUrl() });
    }
    if (b === 'prefs' && (m === 'PUT' || m === 'PATCH')) {
      const body = await readBody(req);
      r.prefs = cleanPrefs(prefsOf(me.id), body); save();
      const p = r.prefs; return send(res, 200, { prefs: { ...p, webpush: undefined }, ntfyUrl: `${p.ntfy.server}/${p.ntfy.topic}` });
    }
    if (b === 'topic' && m === 'POST') { const p = prefsOf(me.id); p.ntfy.topic = defaultPrefs().ntfy.topic; save(); return send(res, 200, { topic: p.ntfy.topic, ntfyUrl: `${p.ntfy.server}/${p.ntfy.topic}` }); }
    if (b === 'inbox' && m === 'GET') return send(res, 200, { items: inbox(me.id), unread: unread(me.id), lastRead: r.lastRead, marks: r.marks || {} });
    if (b === 'read' && m === 'POST') {   // mark everything read (clears per-item "unread" marks, keeps snoozes)
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

  return { attach, route, chat, isAway, prefsOf, actionUrl, verifyAction, flushDigests, inbox, unread, keys, settle: () => Promise.all([...pending]), off: () => bus.off('notify', onNotify) };
}

module.exports = makeNotify;
Object.assign(module.exports, { decide, inQuiet, digestDue, defaultPrefs, mergePrefs, cleanPrefs, mentionsIn, localParts, TYPES, RATE_MS });
