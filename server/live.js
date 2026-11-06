// Live co-editing for Docs: one server-authoritative OT session per open doc.
// The Markdown file stays the source of truth: sessions load from it, persist to it (debounced) through
// docs' normal write path, and merge REST/agent writes and on-disk edits in as ops.
'use strict';
const crypto = require('node:crypto');
const OT = require('./ot');

const PERSIST_MS = 1500;      // write the file this long after the last op
const IDLE_MS = 60_000;       // keep an empty session this long so reconnecting tabs can catch up
const MAX_TEXT = 400_000;

module.exports = function live({ read, write, str }) {
  const sessions = new Map();   // slug -> session
  let peerSeq = 0;

  const peerList = s => [...s.peers.values()].map(p => ({ peer: p.peer, id: p.id, name: p.name, color: p.color, cursor: p.cursor }));
  const sendPeers = s => { const peers = peerList(s); for (const sock of s.peers.keys()) sock.send({ type: 'doc-peers', slug: s.slug, peers }); };
  const toPeers = (s, msg, except) => { for (const sock of s.peers.keys()) if (sock !== except) sock.send(msg); };

  // Stored cursors always describe the current server text: move them through every applied op.
  function moveCursors(s, op, authorPeer) {
    for (const p of s.peers.values()) if (p.cursor) {
      const own = p.peer === authorPeer;
      p.cursor.pos = OT.transformIndex(p.cursor.pos, op, own); p.cursor.sel = OT.transformIndex(p.cursor.sel, op, own);
    }
  }

  function open(slug) {
    let s = sessions.get(slug);
    if (s) { clearTimeout(s.idle); s.idle = null; syncFromDisk(s); return s; }
    const d = read(slug); if (!d) return null;
    s = { slug, sid: crypto.randomBytes(6).toString('base64url'), doc: new OT.Server(d.body || ''), title: d.title, version: Number(d.version) || 1,
      saved: d.body || '', savedRev: 0, peers: new Map(), dirty: false, lastBy: null, timer: null, idle: null };
    sessions.set(slug, s);
    return s;
  }

  // Apply an op made by someone outside the live session (REST PUT, agent write_doc, an editor on disk).
  // `base` is the text the writer started from at revision `baseRev`; the op is transformed past later ops.
  function applyExternal(s, by, op, baseRev) {
    const applied = s.doc.receive(baseRev, op, { by, ext: true });
    if (OT.isNoop(applied)) return;
    moveCursors(s, applied, null);
    s.dirty = true; s.lastBy = by;
    toPeers(s, { type: 'doc-op', slug: s.slug, rev: s.doc.rev, op: applied, by, ext: true });
  }

  // Someone edited the file without going through us (git pull, a text editor): merge it in.
  function syncFromDisk(s) {
    const d = read(s.slug); if (!d) return;
    if (Number(d.version) === s.version && d.body === s.saved.trim()) return;
    const baseRev = s.doc.since(s.savedRev) ? s.savedRev : s.doc.rev;
    const base = baseRev === s.savedRev ? s.saved : s.doc.text;
    applyExternal(s, d.updatedBy || null, OT.diff(base, d.body || ''), baseRev);
    if (d.title && d.title !== s.title) { s.title = d.title; toPeers(s, { type: 'doc-title', slug: s.slug, title: s.title, by: d.updatedBy || null }); }
    s.version = Number(d.version) || s.version; s.saved = s.doc.text; s.savedRev = s.doc.rev;
  }

  function persist(s) {
    clearTimeout(s.timer); s.timer = null;
    if (!sessions.has(s.slug)) return;
    syncFromDisk(s);
    if (!s.dirty) return;
    const d = read(s.slug); if (!d) return drop(s.slug);
    d.body = s.doc.text; d.title = s.title;
    d.version = Number(d.version) + 1; d.updated = new Date().toISOString(); if (s.lastBy) d.updatedBy = s.lastBy;
    s.version = d.version; s.saved = s.doc.text; s.savedRev = s.doc.rev; s.dirty = false;
    write(d);
  }
  const schedule = s => { s.dirty = true; clearTimeout(s.timer); s.timer = setTimeout(() => persist(s), PERSIST_MS); };

  function state(s, sock, extra = {}) {
    const p = s.peers.get(sock);
    return { type: 'doc-state', slug: s.slug, sid: s.sid, rev: s.doc.rev, title: s.title, version: s.version, you: p && p.peer, peers: peerList(s), ...extra };
  }

  // ---------- socket messages ----------
  function join(sock, me, msg) {
    const slug = String(msg.slug || '');
    const s = open(slug);
    if (!s) return sock.send({ type: 'doc-state', slug, error: 'doc not found' });
    if (!s.peers.has(sock)) {
      sock.peerId = sock.peerId || `${me.id}~${++peerSeq}`;
      s.peers.set(sock, { peer: sock.peerId, id: me.id, name: me.name, color: me.color, cursor: null, canEdit: me.role !== 'spectator' && me.role !== 'agent' });
    }
    // A tab that was here before (same session) catches up op by op; anyone else gets the full text.
    const missed = msg.sid === s.sid && Number.isInteger(msg.rev) ? s.doc.since(msg.rev) : null;
    if (missed) sock.send(state(s, sock, { from: msg.rev, ops: missed.map(h => ({ op: h.op, by: h.by, cid: h.cid, peer: h.peer })) }));
    else sock.send(state(s, sock, { text: s.doc.text }));
    sendPeers(s);
  }

  function leave(sock, slug) {
    const s = sessions.get(slug); if (!s || !s.peers.delete(sock)) return;
    if (s.peers.size) { sendPeers(s); toPeers(s, { type: 'doc-cursor', slug, peer: sock.peerId, gone: true }); return; }
    persist(s);
    s.idle = setTimeout(() => { if (!s.peers.size) { persist(s); sessions.delete(slug); } }, IDLE_MS);
    if (s.idle.unref) s.idle.unref();
  }
  const leaveAll = sock => { for (const slug of [...sessions.keys()]) leave(sock, slug); };

  function op(sock, me, msg) {
    const s = sessions.get(msg.slug), p = s && s.peers.get(sock);
    if (!p) return sock.send({ type: 'doc-error', slug: msg.slug, error: 'not in this doc session' });
    if (!p.canEdit) return sock.send({ type: 'doc-error', slug: msg.slug, error: 'spectators are read-only' });
    if (!OT.valid(msg.op, MAX_TEXT)) return sock.send({ type: 'doc-error', slug: msg.slug, error: 'bad op' });
    // A resend of an op we already applied (after a reconnect): just ack it again.
    if (msg.cid) { const i = s.doc.hist.findIndex(h => h.cid === msg.cid); if (i >= 0) return sock.send({ type: 'doc-ack', slug: s.slug, rev: s.doc.start + i + 1, cid: msg.cid }); }
    if (s.doc.text.length + OT.targetLen(msg.op) - OT.baseLen(msg.op) > MAX_TEXT) return sock.send({ type: 'doc-error', slug: s.slug, error: 'doc too large' });
    let applied;
    try { applied = s.doc.receive(msg.rev, msg.op, { by: me.id, cid: msg.cid, peer: p.peer }); }
    catch (e) { return sock.send(state(s, sock, { text: s.doc.text, resync: e.message })); }
    moveCursors(s, applied, p.peer);
    s.lastBy = me.id;
    sock.send({ type: 'doc-ack', slug: s.slug, rev: s.doc.rev, cid: msg.cid });
    toPeers(s, { type: 'doc-op', slug: s.slug, rev: s.doc.rev, op: applied, by: me.id, peer: p.peer }, sock);
    schedule(s);
  }

  function cursor(sock, msg) {
    const s = sessions.get(msg.slug), p = s && s.peers.get(sock); if (!p) return;
    let pos = Number(msg.pos), sel = Number(msg.sel ?? msg.pos);
    if (!Number.isInteger(pos) || !Number.isInteger(sel) || pos < 0 || sel < 0) return;
    // The client sent it at revision msg.rev; bring it up to date with ops applied since.
    const later = s.doc.since(Number(msg.rev)); if (!later) return;
    for (const h of later) { pos = OT.transformIndex(pos, h.op, h.peer === p.peer); sel = OT.transformIndex(sel, h.op, h.peer === p.peer); }
    const max = s.doc.text.length; pos = Math.min(pos, max); sel = Math.min(sel, max);
    p.cursor = { pos, sel };
    toPeers(s, { type: 'doc-cursor', slug: s.slug, peer: p.peer, id: p.id, name: p.name, color: p.color, pos, sel, rev: s.doc.rev }, sock);
  }

  function title(sock, me, msg) {
    const s = sessions.get(msg.slug), p = s && s.peers.get(sock); if (!p || !p.canEdit) return;
    const t = str(msg.title, 120) || 'Untitled'; if (t === s.title) return;
    s.title = t; s.lastBy = me.id;
    toPeers(s, { type: 'doc-title', slug: s.slug, title: t, by: me.id }, sock);
    schedule(s);
  }

  function flushMsg(sock, msg) { const s = sessions.get(msg.slug); if (s && s.peers.has(sock)) persist(s); }

  function handle(sock, me, msg) {
    if (typeof msg.slug !== 'string') return false;
    switch (msg.type) {
      case 'doc-join': join(sock, me, msg); return true;
      case 'doc-leave': leave(sock, msg.slug); return true;
      case 'doc-op': op(sock, me, msg); return true;
      case 'doc-cursor': cursor(sock, msg); return true;
      case 'doc-title': title(sock, me, msg); return true;
      case 'doc-flush': flushMsg(sock, msg); return true;
    }
    return false;
  }

  // ---------- hooks for the REST API and agents ----------
  // Before anyone reads a doc through the API, write pending live edits so version and text agree.
  // Returns the live text (exact, untrimmed) when a session is open.
  function flush(slug) {
    const s = sessions.get(slug); if (!s) return null;
    persist(s);
    return { body: s.doc.text, title: s.title, version: s.version };
  }

  // A REST PUT or agent write while people are typing. Merges instead of clobbering.
  // Returns null when no session is open (caller does the normal write), { conflict } or { doc }.
  function external(slug, { body, title: newTitle, baseVersion, force, by }) {
    const s = sessions.get(slug); if (!s) return null;
    syncFromDisk(s);   // so s.version / s.saved describe the file as the writer could have read it
    if (!force && (Number(baseVersion) !== s.version || !s.doc.since(s.savedRev))) { persist(s); return { conflict: true }; }
    if (typeof body === 'string') {
      body = body.slice(0, MAX_TEXT);
      // Writers base their text on what they last read at s.version (= s.saved), so diff from that and
      // let OT carry the edit past anything typed since. A forced write replaces the current text.
      if (force) applyExternal(s, by, OT.diff(s.doc.text, body), s.doc.rev);
      else applyExternal(s, by, OT.diff(s.saved, body), s.savedRev);
    }
    if (newTitle && newTitle !== s.title) { s.title = newTitle; s.dirty = true; s.lastBy = by; toPeers(s, { type: 'doc-title', slug, title: newTitle, by }); }
    if (!s.dirty) { s.dirty = true; s.lastBy = by; }   // an unchanged save still bumps the version, like before
    persist(s);
    return { doc: { ...read(slug), body: s.doc.text } };
  }

  function drop(slug) {
    const s = sessions.get(slug); if (!s) return;
    clearTimeout(s.timer); clearTimeout(s.idle); sessions.delete(slug);
  }

  const debug = slug => { const s = sessions.get(slug); return s && { rev: s.doc.rev, text: s.doc.text, peers: peerList(s), version: s.version, dirty: s.dirty }; };

  return { handle, leaveAll, flush, external, drop, debug, persistAll: () => { for (const s of sessions.values()) persist(s); } };
};
