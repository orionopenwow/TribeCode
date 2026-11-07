// Chat extras: voice notes and pasted images (stored under chat/media/), replies, forwards (to a channel,
// a DM or your daily notes), reactions, pins, edit/delete own messages, read receipts for your own agent's
// channel, the @brain helper, and the agent's MCP tools check_messages / reply.
// Routes live under /api/chat/<channel>/<action>; the caller already checked the member can read <channel>.
'use strict';
const fs = require('node:fs');

const EMOJI = ['👍', '❤️', '😂', '🎉', '👀', '🔥'];
const MAX_MEDIA = 3 * 1024 * 1024, MAX_PINS = 5;
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'm4a', 'audio/mpeg': 'mp3', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MIME = { webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const pad = n => String(n).padStart(2, '0');
const localDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

module.exports = function chatx({ store, id, str, getMembers, canWrite = () => true, postChat, dms, sendTo, broadcast, brain, docs, loadTasks, commands }) {
  fs.mkdirSync(store.p('chat', 'media'), { recursive: true });
  const member = mid => getMembers().find(m => m.id === mid);
  const file = ch => `chat/${ch}.jsonl`;
  const emit = (ch, msg) => { const p = dms.pair(ch); if (p) p.forEach(mid => sendTo(mid, msg)); else broadcast(msg); };
  const all = ch => store.readJSONL(file(ch), 100000);
  const find = (ch, mid) => all(ch).find(m => m.id === mid) || null;

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

  // ---------- pins ----------
  const pinsFile = ch => `chat/${ch}.pins.json`;
  const pinIds = ch => store.readJSON(pinsFile(ch), []);
  const pins = ch => { const ids = pinIds(ch); const msgs = all(ch); return ids.map(i => msgs.find(m => m.id === i)).filter(m => m && !m.deleted); };
  const pushPins = ch => emit(ch, { type: 'chat-pins', channel: ch, pins: pins(ch) });

  // ---------- media ----------
  function saveMedia(data, mime, kind) {
    const base = String(mime || '').split(';')[0].trim().toLowerCase(), ext = EXT[base];
    if (!ext || !base.startsWith(kind === 'voice' ? 'audio/' : 'image/')) throw Object.assign(new Error('unsupported file type'), { status: 415 });
    const buf = Buffer.from(String(data || '').replace(/^data:[^,]*,/, ''), 'base64');
    if (!buf.length) throw Object.assign(new Error('empty file'), { status: 400 });
    if (buf.length > MAX_MEDIA) throw Object.assign(new Error('file too large (max 3 MB)'), { status: 413 });
    const name = `${Date.now().toString(36)}-${id(8).replace(/[^A-Za-z0-9]/g, 'x')}.${ext}`;
    fs.writeFileSync(store.p('chat', 'media', name), buf);
    return { file: name, mime: MIME[ext], size: buf.length };
  }
  const okFile = f => /^[A-Za-z0-9-]+\.(webm|ogg|m4a|mp3|png|jpg|gif|webp)$/.test(f || '');

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
    postChat(ch, 'brain', answer || "The local brain is off on the host, so I can't answer. To turn it on: install Ollama (ollama.com), run `ollama pull qwen3`, then restart TribeCode on the host.");
  }

  // Every member post (REST): slash commands, DM/mention notifications, @brain.
  function onPost(ch, me, text) {
    commands(ch, me, text);
    dms.onPost(ch, me, text);
    if (/(^|\s)@brain\b/i.test(text) && me.role !== 'agent') askBrain(ch, me, text).catch(e => console.error('brain', e));
  }

  // ---------- routes: /api/chat/<ch>/<action>[/<arg>] ----------
  async function route(req, res, { m, ch, action, arg, me, readBody, send, fail, url }) {
    if (action === 'media' && m === 'GET') {
      if (!okFile(arg) || !all(ch).some(x => x.media && x.media.file === arg)) return fail(res, 404, 'not found');
      let buf; try { buf = fs.readFileSync(store.p('chat', 'media', arg)); } catch { return fail(res, 404, 'not found'); }
      const ext = arg.split('.').pop();
      res.writeHead(200, { 'Content-Type': MIME[ext], 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=86400', 'Access-Control-Allow-Origin': '*' });
      return res.end(buf);
    }
    if (action === 'pins' && m === 'GET') return send(res, 200, { pins: pins(ch) });
    if (action === 'receipt' && m === 'GET') return send(res, 200, { receipt: receipt(ch) });
    if (me.role === 'spectator') return fail(res, 403, 'spectators can read but not post');
    const body = m === 'GET' || m === 'DELETE' ? {} : await readBody(req, 6 * 1024 * 1024);

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
    if (m === 'POST' && action === 'send') {
      const text = str(body.text, 4000); if (!text) return fail(res, 400, 'empty message');
      const orig = body.replyTo ? find(ch, String(body.replyTo)) : null;
      const extra = orig ? { replyTo: { id: orig.id, by: orig.by, text: orig.deleted ? 'message deleted' : clip(orig.text || (orig.media ? (orig.media.kind === 'voice' ? 'Voice note' : 'Image') : ''), 160) } } : {};
      const msg = postChat(ch, me.id, text, extra); onPost(ch, me, text);
      return send(res, 200, { message: msg });
    }

    const target = find(ch, String(body.id || arg || ''));
    if (!target) return fail(res, 404, 'message not found');

    if (m === 'POST' && action === 'react') {
      const e = String(body.emoji || ''); if (!EMOJI.includes(e)) return fail(res, 400, 'unknown reaction');
      const msg = update(ch, target.id, x => {
        const r = { ...(x.reactions || {}) }, set = new Set(r[e] || []);
        set.has(me.id) ? set.delete(me.id) : set.add(me.id);
        if (set.size) r[e] = [...set]; else delete r[e];
        x.reactions = r; if (!Object.keys(r).length) delete x.reactions; return x;
      });
      return send(res, 200, { message: msg });
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
      if (!dms.isDm(to) && !canWrite(to, me)) return fail(res, 403, 'you are not in that project');
      const extra = { fwd: { by: target.by, from, at: target.at } };
      if (target.media) extra.media = target.media;
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
      if (target.media && target.media.file && ![].concat(...allChannels()).some(x => x.id !== target.id && x.media && x.media.file === target.media.file)) {
        try { fs.unlinkSync(store.p('chat', 'media', target.media.file)); } catch {}
      }
      const msg = update(ch, target.id, x => ({ id: x.id, at: x.at, by: x.by, text: '', deleted: new Date().toISOString() }));
      if (pinIds(ch).includes(target.id)) { store.writeJSON(pinsFile(ch), pinIds(ch).filter(i => i !== target.id)); pushPins(ch); }
      return send(res, 200, { message: msg });
    }
    return fail(res, 404, 'not found');
  }
  // Forwards share the media file across channels: only delete it when nothing else points at it.
  function allChannels() {
    try { return fs.readdirSync(store.p('chat')).filter(f => f.endsWith('.jsonl')).map(f => store.readJSONL('chat/' + f, 100000)); } catch { return []; }
  }

  // ---------- MCP tools for agents ----------
  const out = t => ({ content: [{ type: 'text', text: t }] });
  const fail2 = t => ({ content: [{ type: 'text', text: t }], isError: true });
  const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
  const mcpTools = {
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
  };

  return { route, onPost, mcpTools, appendNotes, receipt, EMOJI };
};
