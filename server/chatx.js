// Chat extras: voice notes and pasted images (stored under chat/media/), replies, forwards (to a channel,
// a DM or your daily notes), reactions, pins, edit/delete own messages, read receipts for your own agent's
// channel, the @brain helper, and the agent's MCP tools check_messages / reply.
// Team votes (server/votes.js) ride on chat messages: /vote, the vote routes, MCP suggest_vote / check_vote,
// and the brain's "Turn this into a vote?" hint for messages that read like a decision.
// Reactions can act: ✅ on your agent's request approves it, 📌 pins the message.
// Routes live under /api/chat/<channel>/<action>; the caller already checked the member can read <channel>.
'use strict';
const fs = require('node:fs');

// Reactions: the quick bar shows the first six; the picker shows all of them.
const EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '✅', '🔥', '👎', '❌', '🙏', '💯', '🚀', '🤔', '😮', '😢', '👏', '🙌', '⭐', '💡', '🐛', '📌', '➕', '🎮', '✨'];
const makeVotes = require('./votes');
// feat/chat2: the emoji picker offers hundreds; a reaction is one emoji (with an optional skin tone / ZWJ sequence), nothing else
const okEmoji = e => EMOJI.includes(e) || (typeof e === 'string' && e.length <= 16 && /^[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(e)
  && /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\u200D\uFE0F\u20E3]|[\u{1F1E6}-\u{1F1FF}])+$/u.test(e));
const MAX_MEDIA = 3 * 1024 * 1024, MAX_IMAGE = 6 * 1024 * 1024, MAX_IMAGES = 6, MAX_PINS = 20;   // feat/chat2: GIFs need room; up to 6 pictures per message
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'm4a', 'audio/mpeg': 'mp3', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MIME = { webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const pad = n => String(n).padStart(2, '0');
const localDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

module.exports = function chatx({ store, id, str, getMembers, postChat, dms, sendTo, broadcast, brain, docs, loadTasks, commands, ask = null,
  approvals = null, board = null, createTask = null, bus = { notify() {} }, slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  voters = () => getMembers().filter(m => m.role !== 'agent' && m.role !== 'spectator'), channelOf = () => 'general', project = () => null, inProject = (p, fn) => fn(), voteTick = true,
  channelProject = () => null, canSeeProject = () => false }) {   // project-scoped access for writes into other channels (forward)
  fs.mkdirSync(store.p('chat', 'media'), { recursive: true });
  const member = mid => getMembers().find(m => m.id === mid);
  const file = ch => `chat/${ch}.jsonl`;
  const emit = (ch, msg) => { const p = dms.pair(ch); if (p) p.forEach(mid => sendTo(mid, msg)); else broadcast(msg); };
  // Lookups scan the cached lines newest-first and parse only candidates (store.findJSONL), so a
  // reaction, reply or image request no longer parses the whole channel history.
  const find = (ch, mid) => (mid ? store.findJSONL(file(ch), m => m.id === mid, `"id":${JSON.stringify(mid)}`) : null);
  const hasMedia = (ch, f) => !!store.findJSONL(file(ch), x => (!!x.media && x.media.file === f) || (Array.isArray(x.images) && x.images.some(i => i && i.file === f)), f);

  // Rewrite one message in place (chat files are append-only JSONL; edits are rare).
  function update(ch, mid, fn) {
    const path = store.p(file(ch));
    let text; try { text = fs.readFileSync(path, 'utf8'); } catch { return null; }
    let out = null;
    const lines = text.split('\n').map(l => {
      if (!l || out) return l;
      let m; try { m = JSON.parse(l); } catch { return l; }
      if (m.id !== mid) return l;
      out = fn(m) || m; return JSON.stringify(out);
    });
    if (!out) return null;
    const tmp = path + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, lines.join('\n')); fs.renameSync(tmp, path);
    emit(ch, { type: 'chat-update', channel: ch, message: out });
    return out;
  }

  // ---------- votes (server/votes.js) ----------
  const votes = makeVotes({ store, id, str, slug, find, update, postChat, getMembers, voters, bus, createTask, board, channelOf, project, inProject,
    isDm: ch => dms.isDm(ch), tick: voteTick });

  // ---------- pins ----------
  const pinsFile = ch => `chat/${ch}.pins.json`;
  const pinIds = ch => store.readJSON(pinsFile(ch), []);
  const pins = ch => pinIds(ch).map(i => find(ch, i)).filter(m => m && !m.deleted);
  const pushPins = ch => emit(ch, { type: 'chat-pins', channel: ch, pins: pins(ch) });

  // ---------- search: newest first, every word must appear (text, transcript, file name, vote question) ----------
  function search(ch, q, limit = 30) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(w => w.length > 1).slice(0, 6);
    if (!words.length) return [];
    const out = [], lines = store._lines(file(ch));
    for (let i = lines.length - 1; i >= 0 && out.length < Math.min(limit, 100); i--) {
      const low = lines[i].toLowerCase(); if (!words.every(w => low.includes(w))) continue;
      let msg; try { msg = JSON.parse(lines[i]); } catch { continue; }
      if (msg.deleted) continue;
      const hay = [msg.text, msg.media && msg.media.name, msg.vote && msg.vote.q].filter(Boolean).join(' ').toLowerCase();
      if (words.every(w => hay.includes(w))) out.push(msg);
    }
    return out;
  }

  // ---------- media ----------
  function saveMedia(data, mime, kind) {
    const base = String(mime || '').split(';')[0].trim().toLowerCase(), ext = EXT[base];
    if (!ext || !base.startsWith(kind === 'voice' ? 'audio/' : 'image/')) throw Object.assign(new Error('unsupported file type'), { status: 415 });
    const buf = Buffer.from(String(data || '').replace(/^data:[^,]*,/, ''), 'base64');
    if (!buf.length) throw Object.assign(new Error('empty file'), { status: 400 });
    const cap = kind === 'voice' ? MAX_MEDIA : MAX_IMAGE;
    if (buf.length > cap) throw Object.assign(new Error(`file too large (max ${cap / 1048576} MB)`), { status: 413 });
    if (kind !== 'voice' && !sniffImage(buf, ext)) throw Object.assign(new Error('that file is not the picture it says it is'), { status: 415 });
    const name = `${Date.now().toString(36)}-${id(8).replace(/[^A-Za-z0-9]/g, 'x')}.${ext}`;
    fs.writeFileSync(store.p('chat', 'media', name), buf);
    return { file: name, mime: MIME[ext], size: buf.length };
  }
  // feat/chat2: pictures must start with their format's signature (a mislabelled file is refused, not served as an image)
  function sniffImage(b, ext) {
    if (ext === 'png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    if (ext === 'jpg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (ext === 'gif') return b.slice(0, 4).toString('latin1') === 'GIF8';
    if (ext === 'webp') return b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP';
    return false;
  }
  const okFile = f => /^[A-Za-z0-9-]+\.(webm|ogg|m4a|mp3|png|jpg|gif|webp|bin)$/.test(f || '');
  // Any other file (PDF, zip, a big photo, a level file...): kept as-is under chat/media/<id>.bin with its
  // original name in the message, and always served as a download (never rendered by the browser).
  const MAX_FILE = 8 * 1024 * 1024;
  function saveFile(data, name, mime) {
    const buf = Buffer.from(String(data || '').replace(/^data:[^,]*,/, ''), 'base64');
    if (!buf.length) throw Object.assign(new Error('empty file'), { status: 400 });
    if (buf.length > MAX_FILE) throw Object.assign(new Error('files up to 8 MB in chat; bigger ones go in the repo'), { status: 413 });
    const file = `${Date.now().toString(36)}-${id(8).replace(/[^A-Za-z0-9]/g, 'x')}.bin`;
    fs.writeFileSync(store.p('chat', 'media', file), buf);
    const clean = String(name || 'file').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '_').trim().slice(0, 120) || 'file';
    return { kind: 'file', file, name: clean, mime: /^[\w.+-]+\/[\w.+-]+$/.test(String(mime || '')) ? String(mime).slice(0, 100) : 'application/octet-stream', size: buf.length };
  }

  // ---------- daily notes ----------
  function appendNotes(me, date, line) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : localDay(new Date());
    const title = `Notes · ${me.name} · ${day}`;
    for (let i = 0; i < 3; i++) {
      const d = docs.find(title);
      const r = d ? docs.upsert({ name: title, body: d.body.replace(/\s+$/, '') + '\n' + line, baseVersion: d.version, by: me.id })
        : docs.upsert({ name: title, body: `Captured with TribeCode. Visible to the tribe.\n\n${line}`, by: me.id });
      if (r.doc) return r.doc;
    }
    throw Object.assign(new Error('notes doc is busy, try again'), { status: 409 });
  }
  const noteLine = (m, me, from) => {
    const t = new Date(m.at), who = m.by === me.id ? '' : `${(member(m.by) || {}).name || (m.by === 'brain' ? 'Local Brain' : 'someone')}: `;
    return `- **${pad(t.getHours())}:${pad(t.getMinutes())}** ${who}${m.media && m.media.kind === 'voice' ? '🎙️ ' : ''}${m.text || (m.media ? '(' + m.media.kind + ')' : '')}${from ? ` _(from ${from})_` : ''}`;
  };
  const label = (ch, me) => { if (ch === 'general' || !dms.isDm(ch)) return '#' + ch; const p = dms.pair(ch) || []; const o = member(p.find(x => x !== me.id)); return o ? (o.role === 'agent' ? o.name : 'DM with ' + o.name) : 'a DM'; };

  // ---------- agent channel + receipts ----------
  const readFile = '.tribe/agent-read.json';
  const agentRead = () => store.readJSON(readFile, {});
  const agentChannel = ag => ag && ag.owner ? dms.nameFor(ag.owner, ag.id) : null;
  function receipt(ch) {
    const p = dms.pair(ch); if (!p) return null;
    const ag = p.map(member).find(m => m && m.role === 'agent'); if (!ag) return null;
    return { agent: ag.id, at: (agentRead()[ag.id] || {}).at || null };
  }

  // ---------- @brain ----------
  async function askBrain(ch, me, text) {
    const q = text.replace(/@brain\b/ig, '').trim() || 'What should we focus on next?';
    const who = mid => (mid === 'tribecode' ? 'TribeCode' : mid === 'brain' ? 'Local Brain' : (member(mid) || {}).name || 'someone');
    const recent = store.readJSONL(file(ch), 30).filter(m => !m.deleted && m.text).map(m => `${who(m.by)}: ${clip(m.text, 300)}`).join('\n');
    const tasks = loadTasks().slice(0, 40).map(t => `[${t.status}] ${t.title}${t.assignee ? ' (' + who(t.assignee) + ')' : ''}`).join('\n');
    const titles = docs.list().slice(0, 40).map(d => d.title).join(', ');
    let answer = null;
    try {
      answer = await brain.generate(`Recent chat:\n${recent}\n\nTask board:\n${tasks || '(empty)'}\n\nDocs: ${titles || '(none)'}\n\nQuestion from ${me.name}: ${q}\n\nAnswer in at most 3 short sentences. Plain text.`,
        { system: 'You are the local brain of a small team of friends building software. Answer briefly and only from the context given. If you do not know, say so.', maxTokens: 220 });
    } catch { answer = null; }
    postChat(ch, 'brain', answer || "No AI is on for the tribe right now, so I can't answer. The host can pick one in Settings › Flint's brain: Ollama on their computer, or a cloud model with their own key.");
  }

  // "Should we…?" -> a gentle "Turn this into a vote?" hint for the author only (never posted by itself).
  // The local brain words the vote when it is on; a plain heuristic draft otherwise.
  const hinted = new Map();   // member id -> last hint time
  async function hintVote(ch, me, msg) {
    if (!msg || me.role === 'agent' || me.role === 'spectator' || dms.isDm(ch) || !votes.looksLikeDecision(msg.text)) return;
    if (Date.now() - (hinted.get(me.id) || 0) < 60_000) return;
    hinted.set(me.id, Date.now());
    let d = null;
    try { d = brain && brain.voteDraft ? await brain.voteDraft(msg.text) : null; } catch { d = null; }
    const draft = d || votes.draftFrom(msg.text); if (!draft) return;
    sendTo(me.id, { type: 'vote-hint', id: msg.id, question: draft.question, options: draft.options || [], by: d ? 'brain' : 'tribecode' });
  }

  // Every member post (REST): slash commands, DM/mention notifications, @brain, vote hints.
  function onPost(ch, me, text, msg) {
    commands(ch, me, text);
    dms.onPost(ch, me, text);
    if (/(^|\s)@ai\b/i.test(text) && me.role !== 'agent' && ask) Promise.resolve(ask(ch, me, text)).catch(e => console.error('ask ai', e));   // server/askai.js
    else if (/(^|\s)@brain\b/i.test(text) && me.role !== 'agent') askBrain(ch, me, text).catch(e => console.error('brain', e));
    else hintVote(ch, me, msg).catch(e => console.error('vote hint', e));
  }
  // "/vote Question? | opt | opt | 24h" posts a vote card instead of the raw text. Returns the message or null.
  function command(ch, me, text) {
    const c = votes.parseCommand(text); if (!c) return null;
    return votes.create(ch, me, c);
  }

  // Your agent's request_approval also lands in your private chat with it, so a ✅ reaction approves it.
  function approvalAsked(ap, me) {
    if (!ap || ap.status !== 'pending' || me.role !== 'agent') return;
    const ch = agentChannel(me); if (!ch) return;
    postChat(ch, me.id, `🙋 Needs your OK: ${ap.title} (${ap.risk} risk). React ✅ to approve, or open Updates.`, { approval: ap.id });
  }
  // ✅ on an agent's message = approve its pending request (the one it links, or its latest one asked of you).
  function approveByReaction(target, me) {
    if (!approvals || me.role === 'agent') return null;
    const ag = member(target.by); if (!ag || ag.role !== 'agent') return null;
    const near = a => Math.abs(Date.parse(a.created) - Date.parse(target.at)) < 15 * 60_000;
    const mine = a => a && a.status === 'pending' && a.by === ag.id && (a.to.includes(me.id) || me.role === 'host');
    const ap = target.approval ? approvals.get(target.approval) : approvals.list().filter(a => mine(a) && near(a)).pop();
    if (!mine(ap)) return null;
    try { return approvals.decide(ap.id, 'approve', me, 'Approved with ✅ in chat'); } catch { return null; }
  }

  // ---------- routes: /api/chat/<ch>/<action>[/<arg>] ----------
  async function route(req, res, { m, ch, action, arg, sub, me, readBody, send, fail, url }) {
    if (action === 'media' && m === 'GET') {
      if (!okFile(arg) || !hasMedia(ch, arg)) return fail(res, 404, 'not found');
      let buf; try { buf = fs.readFileSync(store.p('chat', 'media', arg)); } catch { return fail(res, 404, 'not found'); }
      const ext = arg.split('.').pop();
      if (ext === 'bin') {   // shared files: always a download, never sniffed or rendered
        const msg = store.findJSONL(file(ch), x => !!x.media && x.media.file === arg, arg) || { media: {} };
        const nm = String(msg.media.name || 'file');
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': `attachment; filename="${nm.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nm)}`, 'Cache-Control': 'private, max-age=86400', 'Access-Control-Allow-Origin': '*' });
        return res.end(buf);
      }
      res.writeHead(200, { 'Content-Type': MIME[ext], 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=86400', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
      return res.end(buf);
    }
    if (action === 'pins' && m === 'GET') return send(res, 200, { pins: pins(ch) });
    if (action === 'search' && m === 'GET') return send(res, 200, { messages: search(ch, url.searchParams.get('q'), Number(url.searchParams.get('limit')) || 30) });
    if (action === 'receipt' && m === 'GET') return send(res, 200, { receipt: receipt(ch) });
    if (action === 'votes' && m === 'GET') { votes.sweep(); return send(res, 200, { votes: votes.list(ch) }); }
    if (me.role === 'spectator') return fail(res, 403, 'spectators can read but not post');
    const body = m === 'GET' || m === 'DELETE' ? {} : await readBody(req, action === 'file' ? 12 * 1024 * 1024 : action === 'images' ? 40 * 1024 * 1024 : action === 'image' ? 9 * 1024 * 1024 : 6 * 1024 * 1024);

    // feat/chat2: several pictures in one message (a small grid in the chat). GIF files keep animating.
    if (m === 'POST' && action === 'images') {
      const items = Array.isArray(body.items) ? body.items.slice(0, MAX_IMAGES + 1) : [];
      if (!items.length) return fail(res, 400, 'no pictures');
      if (items.length > MAX_IMAGES) return fail(res, 400, `up to ${MAX_IMAGES} pictures at a time`);
      const images = items.map(it => ({ ...saveMedia(it && it.data, it && it.mime, 'image'), kind: 'image' }));
      const text = str(body.text, 4000);
      const msg = images.length === 1 ? postChat(ch, me.id, text, { media: images[0] }) : postChat(ch, me.id, text, { images });
      if (text) dms.onPost(ch, me, text);
      return send(res, 200, { message: msg });
    }

    if (m === 'POST' && action === 'file') {
      const media = saveFile(body.data, body.name, body.mime);
      const text = str(body.text, 4000);
      const msg = postChat(ch, me.id, text, { media });
      if (text) dms.onPost(ch, me, text);
      return send(res, 200, { message: msg });
    }

    if (m === 'POST' && (action === 'voice' || action === 'image')) {
      const media = saveMedia(body.data, body.mime, action);
      media.kind = action;
      if (action === 'voice') {
        media.dur = Math.max(0, Math.min(Number(body.dur) || 0, 125));
        if (Array.isArray(body.wave)) media.wave = body.wave.slice(0, 48).map(v => Math.max(0, Math.min(9, Math.round(Number(v) || 0))));
      }
      const text = str(action === 'voice' ? body.transcript : body.text, 4000);
      const msg = postChat(ch, me.id, text, { media });
      if (text) dms.onPost(ch, me, text);
      return send(res, 200, { message: msg });
    }
    if (m === 'POST' && action === 'vote') {
      const pid = channelProject(ch);   // a vote's voters, tasks and proposals belong to its channel's project
      if (pid && pid !== project()) return inProject(pid, () => route(req, res, { m, ch, action, arg, sub, me, readBody: async () => body, send, fail, url }));
      if (!arg) return send(res, 200, { message: votes.create(ch, me, { question: body.question, options: body.options, minutes: Number(body.minutes) || 0, deadline: body.deadline, pitch: body.pitch }) });
      const op = sub || 'cast';
      if (op === 'cast') return send(res, 200, { message: votes.cast(ch, arg, me, String(body.option || '')) });
      if (op === 'close') return send(res, 200, { message: votes.close(ch, arg, me) });
      if (op === 'seen') return send(res, 200, { message: votes.seen(ch, arg, me) });
      if (op === 'remind') return send(res, 200, votes.remind(ch, arg, me));
      if (op === 'task') return send(res, 200, votes.toTask(ch, arg, me));
      if (op === 'board') return send(res, 200, votes.toBoard(ch, arg, me));
      return fail(res, 404, 'not found');
    }
    if (m === 'POST' && action === 'send') {
      const text = str(body.text, 4000); if (!text) return fail(res, 400, 'empty message');
      const voted = command(ch, me, text); if (voted) return send(res, 200, { message: voted });
      const orig = body.replyTo ? find(ch, String(body.replyTo)) : null;
      const extra = orig ? { replyTo: { id: orig.id, by: orig.by, text: orig.deleted ? 'message deleted' : clip(orig.text || (orig.media ? (orig.media.kind === 'voice' ? 'Voice note' : orig.media.kind === 'file' ? `File: ${orig.media.name || ''}` : 'Image') : ''), 160) } } : {};
      const msg = postChat(ch, me.id, text, extra); onPost(ch, me, text, msg);
      return send(res, 200, { message: msg });
    }

    const target = find(ch, String(body.id || arg || ''));
    if (!target) return fail(res, 404, 'message not found');

    if (m === 'POST' && action === 'react') {
      const e = String(body.emoji || ''); if (!okEmoji(e)) return fail(res, 400, 'unknown reaction');
      if (target.deleted) return fail(res, 400, 'message was deleted');
      let added = false;
      const msg = update(ch, target.id, x => {
        const r = { ...(x.reactions || {}) }, set = new Set(r[e] || []);
        if (body.on === true && set.has(me.id)) return x;   // "+👍" from the composer never toggles off
        if (set.has(me.id)) set.delete(me.id); else { set.add(me.id); added = true; }
        if (set.size) r[e] = [...set]; else delete r[e];
        x.reactions = r; if (!Object.keys(r).length) delete x.reactions; return x;
      });
      // Reaction-to-action: ✅ approves the agent's request, 📌 pins (when there is room).
      const out = { message: msg };
      if (added && e === '✅') { const ap = approveByReaction(target, me); if (ap) out.approved = { id: ap.id, title: ap.title }; }
      if (added && e === '📌' && !pinIds(ch).includes(target.id) && pinIds(ch).length < MAX_PINS) { store.writeJSON(pinsFile(ch), [target.id, ...pinIds(ch)]); pushPins(ch); out.pinned = true; }
      return send(res, 200, out);
    }
    if (m === 'POST' && action === 'pin') {
      let ids = pinIds(ch).filter(i => i !== target.id);
      if (body.on !== false) { if (ids.length >= MAX_PINS) return fail(res, 409, `up to ${MAX_PINS} pins: unpin one first`); ids = [target.id, ...ids]; }
      store.writeJSON(pinsFile(ch), ids); pushPins(ch);
      return send(res, 200, { pins: pins(ch) });
    }
    if (m === 'POST' && action === 'forward') {
      if (target.deleted) return fail(res, 400, 'message was deleted');
      const from = label(ch, me);
      if (body.to === 'notes') { const d = appendNotes(me, body.date, noteLine(target, me, from)); return send(res, 200, { doc: { slug: d.slug, title: d.title } }); }
      const to = String(body.to || '');
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(to) && !dms.isDm(to)) return fail(res, 400, 'bad channel');
      if (!dms.canRead(to, me)) return fail(res, 403, 'this conversation is private');
      if (me.role === 'spectator') return fail(res, 403, 'spectators can read but not post');
      if (!dms.isDm(to) && to !== 'general') {   // another project's channel: only if you can see that project
        const pid = channelProject(to);
        if (!pid) return fail(res, 404, 'no such channel');
        if (!canSeeProject(me, pid)) return fail(res, 403, 'you are not in that project');
        const extra = { fwd: { by: target.by, from: label(ch, me), at: target.at } };
        if (target.media) extra.media = target.media;
        if (target.images) extra.images = target.images;
        return send(res, 200, { message: inProject(pid, () => postChat(to, me.id, target.text || '', extra)) });
      }
      const extra = { fwd: { by: target.by, from, at: target.at } };
      if (target.media) extra.media = target.media;
      if (target.images) extra.images = target.images;
      const msg = postChat(to, me.id, target.text || '', extra);
      return send(res, 200, { message: msg });
    }
    if (m === 'POST' && action === 'notes') {
      const d = appendNotes(me, body.date, noteLine(target, me, target.by === me.id ? '' : label(ch, me)));
      return send(res, 200, { doc: { slug: d.slug, title: d.title } });
    }
    if (action === 'msg' && (m === 'PATCH' || m === 'DELETE')) {
      if (target.by !== me.id) return fail(res, 403, 'you can only change your own messages');
      if (target.deleted) return fail(res, 400, 'message was deleted');
      if (m === 'PATCH') {
        const text = str(body.text, 4000); if (!text) return fail(res, 400, 'empty message');
        return send(res, 200, { message: update(ch, target.id, x => ({ ...x, text, edited: new Date().toISOString() })) });
      }
      for (const md of [target.media, ...(Array.isArray(target.images) ? target.images : [])]) {
        if (md && md.file && !otherUses(md.file, target.id)) { try { fs.unlinkSync(store.p('chat', 'media', md.file)); } catch {} }
      }
      const msg = update(ch, target.id, x => ({ id: x.id, at: x.at, by: x.by, text: '', deleted: new Date().toISOString() }));
      if (pinIds(ch).includes(target.id)) { store.writeJSON(pinsFile(ch), pinIds(ch).filter(i => i !== target.id)); pushPins(ch); }
      return send(res, 200, { message: msg });
    }
    return fail(res, 404, 'not found');
  }
  // Forwards share the media file across channels: only delete it when nothing else points at it.
  function otherUses(f, mid) {
    let names = []; try { names = fs.readdirSync(store.p('chat')).filter(n => n.endsWith('.jsonl')); } catch { return false; }
    return names.some(n => store.findJSONL('chat/' + n, x => x.id !== mid && ((!!x.media && x.media.file === f) || (Array.isArray(x.images) && x.images.some(i => i && i.file === f))), f));
  }

  // ---------- MCP tools for agents ----------
  const out = t => ({ content: [{ type: 'text', text: t }] });
  const fail2 = t => ({ content: [{ type: 'text', text: t }], isError: true });
  const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
  const mcpTools = {
    search_chat: {
      description: 'Search the project chat (#general) for messages containing every word you give: decisions, links, file names, who said what. Newest first.',
      inputSchema: S({ query: { type: 'string', description: 'Words to look for' }, limit: { type: 'number', description: 'Max results (default 15, max 50)' } }, ['query']),
      run: ({ query, limit }) => {
        const hits = search('general', query, Math.min(Number(limit) || 15, 50));
        if (!hits.length) return out(`No messages match "${clip(query, 60)}".`);
        return out(hits.map(x => `[${x.at.slice(0, 16).replace('T', ' ')}] ${(member(x.by) || {}).name || (x.by === 'tribecode' ? 'TribeCode' : 'someone')}: ${clip(x.text || (x.media && x.media.name) || (x.vote && x.vote.q) || '', 300)}`).join('\n'));
      },
    },
    check_messages: {
      description: "Read new messages for you: your owner's private chat with you, plus @mentions of you in #general. Marks them read (your owner sees \"read\"). Answer with reply.",
      inputSchema: S({}),
      run: (_, me) => {
        const ch = agentChannel(me); if (!ch) return fail2('You have no owner channel.');
        const marks = agentRead(), since = (marks[me.id] || {}).at || '';
        const owner = member(me.owner) || { name: 'your owner' };
        const fmt = (x, who) => `[${x.at.slice(0, 16).replace('T', ' ')}] ${who}: ${x.text || (x.media ? '(' + x.media.kind + ')' : '')}`;
        const mine = store.readJSONL(file(ch), 500).filter(x => x.by !== me.id && !x.deleted && x.at > since);
        const short = `@claude`, full = '@' + me.name.toLowerCase();
        const mentions = store.readJSONL('chat/general.jsonl', 500).filter(x => x.at > since && !x.deleted && x.by !== me.id && x.text &&
          (x.text.toLowerCase().includes(full) || (x.by === me.owner && new RegExp(`(^|\\s)${short}\\b`, 'i').test(x.text))));
        const now = new Date().toISOString();
        marks[me.id] = { at: now }; store.writeJSON(readFile, marks);
        sendTo(me.owner, { type: 'chat-read', channel: ch, at: now });
        if (!mine.length && !mentions.length) return out('No new messages.');
        return out([mine.length ? `From ${owner.name} (private):\n` + mine.map(x => fmt(x, owner.name)).join('\n') : '',
          mentions.length ? 'Mentions in #general:\n' + mentions.map(x => fmt(x, (member(x.by) || {}).name || 'someone')).join('\n') : ''].filter(Boolean).join('\n\n'));
      },
    },
    reply: {
      description: "Reply to your owner in your private chat with them (shows up in their TribeCode chat).",
      inputSchema: S({ text: { type: 'string', description: 'Message' } }, ['text']),
      run: ({ text }, me) => {
        const ch = agentChannel(me); if (!ch) return fail2('You have no owner channel.');
        const t = str(text, 4000); if (!t) return fail2('Empty message.');
        postChat(ch, me.id, t); return out('Sent.');
      },
    },
    suggest_vote: {
      description: "Suggest that the team votes on a decision (e.g. \"Should we approve dark mode for the level editor?\"). Posts a vote card in #general labelled as suggested by your owner's Claude. Only humans vote and a majority of the project decides; you cannot vote. Leave options empty for Approve / Not yet, or give 2-6 options for a poll. Use it for scope or product decisions, not routine work. Rate-limited.",
      inputSchema: S({ question: { type: 'string', description: 'One short question ending with ?' }, options: { type: 'array', items: { type: 'string' }, description: 'Optional poll options (2-6)' },
        why: { type: 'string', description: 'One line of context shown on the card' }, deadline_hours: { type: 'number', description: 'Optional: close after this many hours' } }, ['question']),
      run: ({ question, options, why, deadline_hours }, me) => {
        if (me.role !== 'agent') return fail2('Only agents suggest votes this way.');
        try {
          const msg = votes.create('general', me, { question, options, why, minutes: Number(deadline_hours) > 0 ? Number(deadline_hours) * 60 : 0 });
          return out(`Vote posted in #general (id ${msg.id}): "${msg.vote.q}" · ${msg.vote.options.map(o => o.label).join(' / ')}. The humans vote; check the result later with check_vote.`);
        } catch (e) { return fail2(e.message); }
      },
    },
    check_vote: {
      description: 'See team votes in #general: pass an id for one vote (status, counts, result, and any task or proposal it became), or nothing for open and recently decided votes.',
      inputSchema: S({ id: { type: 'string', description: 'Vote id from suggest_vote (optional)' } }),
      run: ({ id: vid }) => {
        votes.sweep();
        const list = votes.list('general', 30);
        const fmt = v => `${v.id} [${v.status}] "${v.q}" · ${v.options.map(o => `${o.label} ${v.tally.counts[o.id]}`).join(', ')} · ${v.tally.voted}/${v.tally.n} voted${v.result ? ` · result: ${(v.options.find(o => o.id === v.result) || {}).label}` : ''}${v.task ? ` · task ${v.task.id}` : ''}${v.proposal ? ` · proposal ${v.proposal.id}` : ''}`;
        if (vid) { const v = list.find(x => x.id === vid); return v ? out(fmt(v)) : fail2(`No vote ${vid} in #general.`); }
        return out(list.length ? list.slice(0, 10).map(fmt).join('\n') : 'No votes yet.');
      },
    },
  };

  return { route, onPost, command, askBrain, approvalAsked, mcpTools, appendNotes, receipt, votes, search, EMOJI };
};
