// Settings that belong to a person, kept on the tribe's server (feat/settings-tabs, docs/SETTINGS-AUDIT.md).
//   GET  /api/me/settings                 -> { settings, at }          settings sync: the same look and prefs on every device
//   PUT  /api/me/settings { settings }    -> { at }                    only whitelisted keys, at most 64 KB
//   GET  /api/me/privacy                  -> { privacy }               who can DM me, whether I send typing indicators
//   PUT  /api/me/privacy { dm, typing }   -> { privacy }
//   GET  /api/me/export                   -> { files }                 my data: messages I wrote, tasks I made or own, docs I made,
//                                                                       my uploads (small ones inline), my profile and prefs
//   POST /api/me/signout-others           -> { token, member, ended }  every other device signs out (device links end, the
//                                                                       main key is replaced; this device gets the new one)
//   GET|POST|DELETE /api/me/deletion      -> { deletion }              delete my account after a grace period (7 days), or undo
// Storage: .tribe/usersettings/<member>.json, .tribe/privacy.json, .tribe/deletions.json. Agents get none of these.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SYNC_KEYS = ['theme', 'themeSystem', 'themeDark', 'themeLight', 'themePicked', 'density', 'look', 'color', 'prefs', 'shortcuts', 'lang'];
const DM_POLICIES = ['everyone', 'known', 'staff'];
const STAFF = ['host', 'admin', 'mod'];
const MAX_SYNC = 64 * 1024, MAX_INLINE = 8 * 1048576;

module.exports = function mySettings({ store, getMembers, memberById, hash, id, saveMembers, devices, sockets, removeMember, isBlocked = () => false, publicMember, log = () => {}, graceMs, now = () => Date.now(), tick = true }) {
  const GRACE = Number(graceMs || process.env.TRIBE_DELETE_GRACE_MS) || 7 * 86400_000;
  const safe = mid => String(mid).replace(/[^A-Za-z0-9_-]/g, '_');
  const root = store.root;

  // ---------- privacy ----------
  let privacy = store.readJSON('.tribe/privacy.json', null) || {};
  const privOf = mid => ({ dm: 'everyone', typing: true, ...(privacy[mid] || {}) });
  const savePriv = () => store.writeJSON('.tribe/privacy.json', privacy);
  const dmFile = (a, b) => `chat/dm-${[a, b].sort().join('-')}.jsonl`;
  // May `from` start or continue a DM with `to`? Their own agents and the tribe's staff always may; blocked people never.
  function canDm(from, to) {
    if (!from || !to || from.id === to.id) return true;
    if (from.role === 'agent' && from.owner === to.id) return true;
    if (to.role === 'agent') return true;   // dm.js already keeps agent DMs to their owner
    if (isBlocked(to.id, from.id)) return false;
    const p = privOf(to.id).dm;
    if (p === 'everyone' || STAFF.includes(from.role)) return true;
    if (p === 'staff') return false;
    // 'known': people they've already written to in this DM
    return store.readJSONL(dmFile(from.id, to.id), 2000).some(x => x.by === to.id);
  }
  const typingOn = mid => privOf(mid).typing !== false;

  // ---------- settings sync ----------
  const syncRel = mid => `.tribe/usersettings/${safe(mid)}.json`;
  function cleanSync(s) {
    const out = {};
    if (!s || typeof s !== 'object') return out;
    for (const k of SYNC_KEYS) if (k in s) out[k] = s[k];
    return out;
  }

  // ---------- my data ----------
  function walkFiles(dir, want, out = []) {
    let ents = []; try { ents = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { return out; }
    for (const e of ents) if (e.isFile() && want.test(e.name)) out.push(dir + '/' + e.name);
    return out;
  }
  const projectDirs = () => { let p = []; try { p = fs.readdirSync(path.join(root, 'projects'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => 'projects/' + e.name); } catch {} return ['', ...p]; };
  function exportFor(me) {
    const files = {}, put = (k, v) => { files[k] = typeof v === 'string' ? v : JSON.stringify(v, null, 2); };
    const mine = getMembers().find(x => x.id === me.id) || me;
    const memberRec = Object.fromEntries(Object.entries(mine).filter(([k]) => !/hash|secret|password|key|token/i.test(k)));   // never a key
    put('profile.json', { ...publicMember(mine), ...memberRec });
    let msgs = 0, tasks = 0, docs = 0;
    for (const base of projectDirs()) {
      const pre = base ? base + '/' : '', tag = base ? base.slice(9) + '-' : '';
      for (const rel of walkFiles(pre + 'chat', /\.jsonl$/)) {
        const ch = path.basename(rel, '.jsonl');
        const list = store.readJSONL(rel, 1e6).filter(x => x && x.by === me.id);
        if (list.length) { put(`messages/${tag}${ch}.json`, list); msgs += list.length; }
      }
      for (const rel of walkFiles(pre + 'tasks', /\.md$/)) {
        const r = store.readMd(rel); if (!r || !r.meta) continue;
        if (r.meta.by === me.id || r.meta.assignee === me.id) { put(`tasks/${tag}${path.basename(rel, '.md')}.json`, { ...r.meta, body: r.body }); tasks++; }
      }
      for (const rel of walkFiles(pre + 'docs', /\.md$/)) {
        if (rel.endsWith('.summary.md')) continue;
        const r = store.readMd(rel); if (!r || !r.meta || r.meta.by !== me.id) continue;
        put(`docs/${tag}${path.basename(rel)}`, `# ${r.meta.title || path.basename(rel, '.md')}\n\n${r.body}\n`); docs++;
      }
    }
    // uploads: the index, and the files themselves while they fit
    const up = store.readJSON(`.tribe/uploads/${safe(me.id)}/index.json`, []);
    const uploads = Array.isArray(up) ? up : []; const inline = {}; let used = 0;
    for (const u of uploads) {
      const dir = path.join(root, '.tribe', 'uploads', safe(me.id), String(u.id || ''));
      let names = []; try { names = fs.readdirSync(dir); } catch { continue; }
      for (const n of names) {
        let st; try { st = fs.statSync(path.join(dir, n)); } catch { continue; }
        if (!st.isFile() || used + st.size > MAX_INLINE) continue;
        inline[`files/${String(u.id).replace(/[^\w-]/g, '')}-${n.replace(/[^\w.() -]/g, '_')}`] = fs.readFileSync(path.join(dir, n)).toString('base64'); used += st.size;
      }
    }
    if (uploads.length) put('files/index.json', uploads);
    const extra = { privacy: privOf(me.id), settings: store.readJSON(syncRel(me.id), null), flintMemory: store.readJSON(`.tribe/flint/memory/${safe(me.id)}.json`, null) };
    put('preferences.json', extra);
    put('README.txt', `Your TribeCode data, exported ${new Date(now()).toISOString()}.\nmessages/ holds messages you wrote (one file per conversation), tasks/ tasks you made or own, docs/ docs you made,\nfiles/ what you uploaded, profile.json and preferences.json your profile and settings.\nOther people's messages are not included: they are theirs.\n`);
    return { files, binary: inline, counts: { messages: msgs, tasks, docs, files: uploads.length } };
  }

  // ---------- sign out other devices ----------
  function signOutOthers(me, th) {
    const mem = memberById(me.id); if (!mem) return null;
    const usingMain = mem.tokenHash === th;
    const token = id(32); mem.tokenHash = hash(token); saveMembers();   // the main key changes: copies of the old one stop working
    let list = store.readJSON('.tribe/devices.json', []) || [];
    const before = list.filter(d => d.member === me.id).length;
    list = list.filter(d => d.member !== me.id || (!usingMain && (d.tokens || []).includes(th))).map(d => d.member === me.id ? { ...d, tokens: [th] } : d);
    store.writeJSON('.tribe/devices.json', list); try { devices.reload(); } catch {}
    let closed = 0;
    for (const s of sockets(me.id)) if (s.th !== th) { try { s.close(); closed++; } catch {} }
    log(`signed out ${me.id}'s other devices (${before} device link${before === 1 ? '' : 's'}, ${closed} socket${closed === 1 ? '' : 's'})`);
    return { token: usingMain ? token : null, ended: usingMain ? before : Math.max(0, before - 1), closed };
  }

  // ---------- account deletion with a grace period ----------
  let deletions = store.readJSON('.tribe/deletions.json', null) || {};
  const saveDel = () => store.writeJSON('.tribe/deletions.json', deletions);
  function sweep() {
    let n = 0;
    for (const [mid, d] of Object.entries(deletions)) {
      if (Date.parse(d.due) > now()) continue;
      delete deletions[mid]; saveDel();
      const mem = memberById(mid);
      if (mem && mem.role !== 'host') { try { removeMember(mem); n++; log(`deleted ${mid} after the grace period`); } catch (e) { log('deletion failed: ' + e.message); } }
    }
    return n;
  }
  if (tick) setInterval(sweep, Math.max(500, Math.min(60_000, Math.floor(GRACE / 3)))).unref();

  async function route(req, res, { b, m, me, th, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (me.role === 'agent') return fail(res, 403, 'people only');
    if (b === 'settings') {
      if (m === 'GET') { const r = store.readJSON(syncRel(me.id), null) || {}; return send(res, 200, { settings: r.settings || null, at: r.at || null }); }
      if (m === 'PUT') {
        const body = await readBody(req); const s = cleanSync(body && body.settings);
        if (JSON.stringify(s).length > MAX_SYNC) return fail(res, 413, 'settings are too big to sync');
        const at = new Date(now()).toISOString(); fs.mkdirSync(store.p('.tribe/usersettings'), { recursive: true }); store.writeJSON(syncRel(me.id), { at, settings: s }); return send(res, 200, { at });
      }
      if (m === 'DELETE') { store.remove(syncRel(me.id)); return send(res, 200, { ok: true }); }
    }
    if (b === 'privacy') {
      if (m === 'GET') return send(res, 200, { privacy: privOf(me.id) });
      if (m === 'PUT') {
        const body = await readBody(req), cur = { ...(privacy[me.id] || {}) };
        if (body.dm !== undefined) { if (!DM_POLICIES.includes(body.dm)) return fail(res, 400, 'dm must be everyone, known or staff'); cur.dm = body.dm; }
        if (body.typing !== undefined) cur.typing = !!body.typing;
        privacy[me.id] = cur; savePriv(); return send(res, 200, { privacy: privOf(me.id) });
      }
    }
    if (b === 'export' && m === 'GET') return send(res, 200, exportFor(me));
    if (b === 'signout-others' && m === 'POST') {
      const r = signOutOthers(me, th); if (!r) return fail(res, 404, 'not found');
      return send(res, 200, r.token ? { token: r.token, member: publicMember(memberById(me.id)), ended: r.ended, closed: r.closed } : { ended: r.ended, closed: r.closed });
    }
    if (b === 'deletion') {
      const view = () => deletions[me.id] ? { at: deletions[me.id].at, due: deletions[me.id].due } : null;
      if (m === 'GET') return send(res, 200, { deletion: view(), graceDays: Math.round(GRACE / 86400_000 * 10) / 10 });
      if (m === 'POST') {
        if (me.role === 'host') return fail(res, 403, 'the host can\'t delete themselves: Start fresh in Settings › Tribe & admin covers that');
        const body = await readBody(req); if (!body || body.confirm !== 'DELETE') return fail(res, 400, 'send { confirm: "DELETE" }');
        deletions[me.id] = { at: new Date(now()).toISOString(), due: new Date(now() + GRACE).toISOString() }; saveDel();
        log(`${me.id} asked to delete their account (due ${deletions[me.id].due})`);
        return send(res, 200, { deletion: view() });
      }
      if (m === 'DELETE') { delete deletions[me.id]; saveDel(); return send(res, 200, { deletion: null }); }
    }
    return fail(res, 404, 'no such settings route');
  }

  return { route, canDm, typingOn, privOf, exportFor, sweep, SYNC_KEYS };
};
