// Chat channels (feat/chat2): each project has its #general (the project's own channel, see projects.js) plus any
// channels its people create. A created channel's chat file is chat/<id>.jsonl with a short random id (c-xxxxxxxx),
// so renaming never moves data and ids never collide across projects. Messages stay in their channel's file, so
// "tagged by channel" is the file they live in; old #general history is untouched (untagged = general).
// Registry: .tribe/channels.json (tribe folder) = { list: [channel], general: { <project id>: { emoji, topic, bg } } }
//   channel = { id, project, name, emoji, topic, archived?, bg?, by, created }
//   bg = { kind: 'none' | 'pattern' | 'tint' | 'image', value }   (patterns: stars, dots, grid, campfire; tints: palette keys)
// Routes (the caller is a member; the request runs in a project):
//   GET    /api/channels                      -> { channels: [general, ...created], canManage }
//   POST   /api/channels { name, emoji?, topic? }          host / builders of the project
//   PATCH  /api/channels/<id> { name?, emoji?, topic?, archived?, bg? }   (#general: emoji, topic, bg only)
//   POST   /api/channels/<id>/bg { data, mime }            an uploaded background picture (png/jpeg/webp, 2 MB)
//   GET    /api/channels/<id>/bg/<file>                    the picture (anyone who can read the channel)
'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const PATTERNS = ['stars', 'dots', 'grid', 'campfire'];
const TINTS = ['ember', 'teal', 'indigo', 'amber', 'green', 'rose'];
const MAX = 40;   // channels per project
const MAX_BG = 2 * 1024 * 1024;
const BG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const BG_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

module.exports = function channels({ store, P, str, broadcast, getMembers }) {
  const FILE = '.tribe/channels.json';
  const load = () => { const v = store.readJSON(FILE, {}) || {}; return { list: Array.isArray(v.list) ? v.list : [], general: v.general && typeof v.general === 'object' ? v.general : {} }; };
  let reg = load();
  const save = () => store.writeJSON(FILE, reg);
  fs.mkdirSync(store.p('chat', 'bg'), { recursive: true });

  const byId = id => reg.list.find(c => c.id === id) || null;
  const isCustom = ch => typeof ch === 'string' && /^c-[a-f0-9]{8}$/.test(ch) && !!byId(ch);
  const projectOf = ch => (isCustom(ch) ? byId(ch).project : null);
  const archived = ch => !!(isCustom(ch) && byId(ch).archived);
  const canRead = (me, ch) => !!me && isCustom(ch) && P.canSee(me, byId(ch).project);
  // Host, or a builder (not a spectator / agent) in the project. A roles module can tighten this later.
  const canManage = (me, pid) => !!me && P.canSee(me, pid) && (me.role === 'host' || (me.role === 'builder' && ((P.get(pid) || {}).members || {})[me.id] !== 'spectator'));

  const cleanName = v => String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  const cleanEmoji = v => { const s = String(v || '').trim(); if (!s) return ''; const first = [...s].slice(0, 4).join(''); return /[<>&"'`\\]/.test(first) || /^[\w\s]+$/.test(first) ? '' : first; };
  const cleanBg = (v, pid, id) => {
    if (!v || typeof v !== 'object' || v.kind === 'none') return null;
    if (v.kind === 'pattern' && PATTERNS.includes(v.value)) return { kind: 'pattern', value: v.value };
    if (v.kind === 'tint' && TINTS.includes(v.value)) return { kind: 'tint', value: v.value };
    if (v.kind === 'image' && /^[a-z0-9-]+\.(png|jpg|webp)$/.test(String(v.value || '')) && fs.existsSync(store.p('chat', 'bg', v.value))) return { kind: 'image', value: v.value };
    return undefined;   // invalid: leave as is
  };
  const lastAt = (ch, pid) => { try { const rows = store.readJSONL(`chat/${ch === 'general' ? P.channelOf(pid) : ch}.jsonl`, 1); return rows.length ? rows[0].at : null; } catch { return null; } };
  const general = pid => ({ id: 'general', name: 'general', main: true, emoji: '', topic: '', bg: null, ...(reg.general[pid] || {}) });
  const view = (c, pid) => ({ id: c.id, name: c.name, emoji: c.emoji || '', topic: c.topic || '', bg: c.bg || null, archived: !!c.archived, main: !!c.main, last: lastAt(c.id, pid),
    ...(c.by ? { by: c.by } : {}), ...(c.created ? { created: c.created } : {}) });
  const listFor = pid => [view(general(pid), pid), ...reg.list.filter(c => c.project === pid).map(c => view(c, pid))];
  const push = pid => broadcast({ type: 'channels', project: pid, channels: listFor(pid) });
  // Agents and the MCP chat tool name channels by their name ("design"), "#design" or the id.
  function resolve(pid, nameOrId) {
    const s = String(nameOrId || '').replace(/^#/, '').trim().toLowerCase();
    if (!s || s === 'general') return 'general';
    const c = reg.list.find(x => x.project === pid && !x.archived && (x.id === s || x.name === s));
    return c ? c.id : null;
  }

  async function route(req, res, { m, b, c, parts, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    const pid = P.current() || P.defaultId();
    if (!P.canSee(me, pid)) return fail(res, 403, 'you are not in that project');
    if (!b && m === 'GET') return send(res, 200, { channels: listFor(pid), canManage: canManage(me, pid), patterns: PATTERNS, tints: TINTS });
    if (b && c === 'bg' && parts[3] && m === 'GET') {
      const f = parts[3];
      if (!/^[a-z0-9-]+\.(png|jpg|webp)$/.test(f)) return fail(res, 404, 'not found');
      const owner = b === 'general' ? general(pid) : byId(b);
      if (!owner || (b !== 'general' && !canRead(me, b)) || !owner.bg || owner.bg.value !== f) return fail(res, 404, 'not found');
      let buf; try { buf = fs.readFileSync(store.p('chat', 'bg', f)); } catch { return fail(res, 404, 'not found'); }
      res.writeHead(200, { 'Content-Type': BG_MIME[f.split('.').pop()], 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=86400', 'Content-Security-Policy': "default-src 'none'; sandbox" });
      return res.end(buf);
    }
    if (!canManage(me, pid)) return fail(res, 403, 'only the host and builders can change channels');
    if (!b && m === 'POST') {
      const body = await readBody(req);
      const name = cleanName(body.name); if (!name) return fail(res, 400, 'give the channel a name');
      if (name === 'general' || reg.list.some(x => x.project === pid && x.name === name)) return fail(res, 409, `#${name} already exists`);
      if (reg.list.filter(x => x.project === pid).length >= MAX) return fail(res, 409, `up to ${MAX} channels per project`);
      const ch = { id: 'c-' + crypto.randomBytes(4).toString('hex'), project: pid, name, emoji: cleanEmoji(body.emoji), topic: str(body.topic, 160), by: me.id, created: new Date().toISOString() };
      reg.list.push(ch); save(); push(pid);
      return send(res, 200, { channel: view(ch, pid) });
    }
    if (b && !c && m === 'PATCH') {
      const body = await readBody(req);
      const isGen = b === 'general', ch = isGen ? null : byId(b);
      if (!isGen && (!ch || ch.project !== pid)) return fail(res, 404, 'no such channel');
      const tgt = isGen ? (reg.general[pid] = reg.general[pid] || {}) : ch;
      if (!isGen && body.name !== undefined) {
        const name = cleanName(body.name); if (!name) return fail(res, 400, 'give the channel a name');
        if (name !== ch.name && (name === 'general' || reg.list.some(x => x.project === pid && x.name === name))) return fail(res, 409, `#${name} already exists`);
        ch.name = name;
      }
      if (body.emoji !== undefined) tgt.emoji = cleanEmoji(body.emoji);
      if (body.topic !== undefined) tgt.topic = str(body.topic, 160);
      if (!isGen && body.archived !== undefined) { if (body.archived) ch.archived = new Date().toISOString(); else delete ch.archived; }
      if (body.bg !== undefined) { const bg = cleanBg(body.bg, pid, b); if (bg === undefined) return fail(res, 400, 'unknown background'); if (bg) tgt.bg = bg; else delete tgt.bg; }
      save(); push(pid);
      return send(res, 200, { channel: view(isGen ? general(pid) : ch, pid) });
    }
    if (b && c === 'bg' && m === 'POST') {
      const isGen = b === 'general', ch = isGen ? null : byId(b);
      if (!isGen && (!ch || ch.project !== pid)) return fail(res, 404, 'no such channel');
      const body = await readBody(req, 3 * 1024 * 1024);
      const mime = String(body.mime || '').split(';')[0].trim().toLowerCase(), ext = BG_EXT[mime];
      if (!ext) return fail(res, 415, 'backgrounds can be PNG, JPEG or WebP');
      const buf = Buffer.from(String(body.data || '').replace(/^data:[^,]*,/, ''), 'base64');
      if (!buf.length) return fail(res, 400, 'empty file');
      if (buf.length > MAX_BG) return fail(res, 413, 'backgrounds up to 2 MB');
      const sig = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] }[ext];
      if (!sig.every((v, i) => buf[i] === v)) return fail(res, 415, 'that file is not the picture it says it is');
      const file = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      fs.writeFileSync(store.p('chat', 'bg', file), buf);
      const tgt = isGen ? (reg.general[pid] = reg.general[pid] || {}) : ch;
      tgt.bg = { kind: 'image', value: file }; save(); push(pid);
      return send(res, 200, { channel: view(isGen ? general(pid) : ch, pid) });
    }
    return fail(res, 405, 'not allowed');
  }

  return { route, isCustom, projectOf, archived, canRead, canManage, resolve, listFor, byId, PATTERNS, TINTS };
};
