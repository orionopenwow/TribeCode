// Live co-editing for Docs: OT client session per open doc, remote carets drawn over the textarea,
// and the "Editing now" roster. The server (server/live.js) is authoritative; see server/ot.js.
(function () {
  const OT = window.TribeOT, C = window.TribeClient;
  const sessions = new Map();          // slug -> Session
  const tab = Math.random().toString(36).slice(2, 8);
  let cidSeq = 0;

  const textOn = hex => {               // readable label text on a member color
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#FFFFFF';
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#12151A' : '#FFFFFF';
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class Session {
    constructor(slug, hooks) {
      this.slug = slug; this.hooks = hooks || {};
      this.ot = null; this.sid = null; this.you = null;
      this.server = ''; this.doc = ''; this.dom = ''; this.queued = null; this.composing = false;
      this.cid = null; this.needResend = false; this.joined = false; this.joining = null; this.closed = false;
      this.cursors = new Map();          // peer -> { peer, id, name, color, pos, sel }
      this.peers = [];
      this.ta = null; this.layer = null; this.cursorTimer = null; this.cursorDirty = false; this.lastCursor = '';
      this.onWin = () => this.render();
      addEventListener('resize', this.onWin);
    }

    // ---------- lifecycle ----------
    join() {
      if (this.closed) return Promise.resolve(null);
      if (this.joined) return Promise.resolve(this);
      if (this.joining) return this.joining.promise;
      let done; const promise = new Promise(r => (done = r));
      const timer = setTimeout(() => { if (this.joining && this.joining.promise === promise) { this.joining = null; done(null); } }, 3000);
      this.joining = { promise, done: v => { clearTimeout(timer); this.joining = null; done(v); } };
      const sent = C.send({ type: 'doc-join', slug: this.slug, sid: this.sid || undefined, rev: this.ot ? this.ot.rev : undefined });
      if (!sent) this.joining.done(null);
      return promise;
    }
    leave() {
      if (this.closed) return;
      this.closed = true; this.joined = false;
      C.send({ type: 'doc-leave', slug: this.slug });
      sessions.delete(this.slug);
      clearTimeout(this.cursorTimer); removeEventListener('resize', this.onWin);
      if (this.layer) this.layer.remove();
      if (this.joining) this.joining.done(null);
    }
    pending() { return !!(this.ot && this.ot.inflight); }
    text() { return this.doc; }

    // ---------- from the server ----------
    onState(m) {
      if (m.error) { if (this.joining) this.joining.done(null); return this.hooks.onGone && this.hooks.onGone(m.error); }
      const first = !this.ot;
      this.needResend = true;
      if (m.ops && this.ot && m.sid === this.sid && m.from <= this.ot.rev && m.rev >= this.ot.rev) {
        // Catch-up after a reconnect: replay what we missed; our own op in there counts as its ack.
        for (const h of m.ops.slice(this.ot.rev - m.from)) {
          if (this.ot.inflight && h.cid && h.cid === this.cid) this.onAck({ cid: h.cid });
          else this.onRemote(h.op, h.peer, h.by);
        }
      } else if (typeof m.text === 'string') {
        if (first) { this.ot = new OT.Client(m.rev); this.server = this.doc = m.text; this.setDom(m.text); }
        else if (!this.ot.inflight) { const op = OT.diff(this.doc, m.text); this.ot = new OT.Client(m.rev); this.server = m.text; if (!OT.isNoop(op)) this.applyRemote(op, null); }
        else if (m.text === this.server) { this.ot.rev = m.rev; }                       // our edits never arrived: resend below
        else if (m.text === OT.apply(this.server, this.ot.inflight)) {                  // they arrived but the ack did not
          this.server = m.text; this.ot.rev = m.rev; this.ot.inflight = this.ot.buffer; this.ot.buffer = null; this.cid = null;
        } else {
          // Somebody else changed the doc and the server no longer has the history to merge our pending edits.
          const mine = this.doc; this.leave();
          return this.hooks.onConflict && this.hooks.onConflict(mine, m);
        }
        if (!first && m.resync) this.hooks.onToast && this.hooks.onToast('This doc was re-synced with the server');
      } else return;   // a catch-up for a state we are not in: ignore, a full state will follow on next join
      this.sid = m.sid; this.you = m.you; this.joined = true;
      if (this.needResend && this.ot.inflight) this.sendOp(this.ot.inflight, true);
      if (m.title !== undefined && this.hooks.onTitle) this.hooks.onTitle(m.title, null);
      if (m.version !== undefined && this.hooks.onVersion) this.hooks.onVersion(m.version);
      this.setPeers(m.peers || []);
      for (const p of m.peers || []) if (p.cursor && p.peer !== this.you) this.cursors.set(p.peer, { ...p, pos: this.ot.toLocal(p.cursor.pos), sel: this.ot.toLocal(p.cursor.sel) });
      if (this.joining) this.joining.done(this);
      this.status(); this.render(); this.queueCursor();
    }

    onRemote(op, peer, by, ext) {
      if (!this.ot) return;
      this.server = OT.apply(this.server, op);
      const local = this.ot.remote(op);
      this.applyRemote(local, peer);
      if (ext && this.hooks.onExternal) this.hooks.onExternal(by);
    }

    onAck(m) {
      if (!this.ot || !this.ot.inflight || m.cid !== this.cid) return;
      this.server = OT.apply(this.server, this.ot.inflight);
      const next = this.ot.ack();
      if (next) this.sendOp(next); else { this.cid = null; if (this.cursorDirty) this.queueCursor(); }
      this.status();
    }

    onCursor(m) {
      if (!this.ot || m.peer === this.you) return;
      if (m.gone) { this.cursors.delete(m.peer); return this.render(); }
      this.cursors.set(m.peer, { peer: m.peer, id: m.id, name: m.name, color: m.color, pos: this.ot.toLocal(m.pos), sel: this.ot.toLocal(m.sel) });
      this.render();
    }

    setPeers(list) {
      this.peers = list;
      const live = new Set(list.map(p => p.peer));
      for (const k of [...this.cursors.keys()]) if (!live.has(k)) this.cursors.delete(k);
      if (this.hooks.onPeers) {
        const seen = new Set(), me = (C.state().me || {}).id, out = [];
        for (const p of list) if (p.peer !== this.you && p.id !== me && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
        this.hooks.onPeers(out);
      }
      this.render();
    }

    // ---------- local edits ----------
    sendOp(op, resend) {
      if (!resend || !this.cid) this.cid = `${tab}-${++cidSeq}`;
      if (!this.joined) { this.needResend = true; return; }   // offline or rejoining: goes out with the next doc-state
      if (C.send({ type: 'doc-op', slug: this.slug, rev: this.ot.rev, op, cid: this.cid })) this.needResend = false;
    }

    // Call after the textarea changed because of the user (typing, paste, slash menu, list continuation...).
    localChange() {
      const ta = this.ta; if (!ta || !this.ot || this.closed) return;
      const val = ta.value; if (val === this.dom) return;
      let op = OT.diff(this.dom, val, ta.selectionEnd);
      this.dom = val;
      if (this.queued) { const [l, q] = OT.transform(op, this.queued); op = l; this.queued = q; }
      this.doc = OT.apply(this.doc, op);
      for (const c of this.cursors.values()) { c.pos = OT.transformIndex(c.pos, op, false); c.sel = OT.transformIndex(c.sel, op, false); }
      const out = this.ot.local(op); if (out) this.sendOp(out);
      this.status(); this.render(); this.queueCursor();
      if (this.hooks.onChange) this.hooks.onChange(this.doc, false);
    }

    // ---------- textarea ----------
    attach(ta) {
      this.ta = ta;
      if (ta.value !== this.doc) ta.value = this.doc;
      this.dom = ta.value; this.queued = null; this.composing = false;
      ta.addEventListener('compositionstart', () => { this.composing = true; });
      ta.addEventListener('compositionend', () => { this.composing = false; setTimeout(() => this.flushQueued(), 0); });
      for (const ev of ['select', 'keyup', 'mouseup', 'focus']) ta.addEventListener(ev, () => this.queueCursor());
      this.layer = document.createElement('div'); this.layer.className = 'co-layer'; this.layer.setAttribute('aria-hidden', 'true');
      (ta.offsetParent || ta.parentNode).appendChild(this.layer);
      this.render();
    }
    setDom(text) { if (this.ta) { this.ta.value = text; this.dom = text; if (this.hooks.onDom) this.hooks.onDom(); } else this.dom = text; }

    applyRemote(op, peer) {
      this.doc = OT.apply(this.doc, op);
      for (const c of this.cursors.values()) { const own = c.peer === peer; c.pos = OT.transformIndex(c.pos, op, own); c.sel = OT.transformIndex(c.sel, op, own); }
      if (this.ta && this.composing) this.queued = this.queued ? OT.compose(this.queued, op) : op;   // do not break an IME composition
      else this.applyToDom(op);
      this.render();
      if (this.hooks.onChange) this.hooks.onChange(this.doc, true);
    }
    flushQueued() { if (this.queued && !this.composing) { const q = this.queued; this.queued = null; this.applyToDom(q); this.render(); } }

    // Put a remote op into the textarea without moving the user's selection or the page.
    applyToDom(op) {
      const ta = this.ta;
      if (!ta || !ta.isConnected) { this.dom = OT.apply(this.dom, op); return; }
      const s = ta.selectionStart, e = ta.selectionEnd, dir = ta.selectionDirection, focused = document.activeElement === ta;
      const scroller = scrollParent(ta), top0 = scroller ? scroller.scrollTop : 0;
      // keep the caret where it is on screen when text above it grows or shrinks
      const firstChange = typeof op[0] === 'number' && op[0] > 0 ? op[0] : 0;
      const anchor = focused && firstChange < s ? measure(ta, [s])[0] : null;
      const val = OT.apply(ta.value, op);
      ta.value = val; this.dom = val;
      const ns = OT.transformIndex(s, op, false), ne = OT.transformIndex(e, op, false);
      if (focused) ta.setSelectionRange(ns, ne, dir); else { ta.selectionStart = ns; ta.selectionEnd = ne; }
      if (this.hooks.onDom) this.hooks.onDom();
      if (scroller) {
        scroller.scrollTop = top0;
        if (anchor) { const now = measure(ta, [ns])[0]; if (now && Math.abs(now.y - anchor.y) > 1) scroller.scrollTop = top0 + (now.y - anchor.y); }
      }
    }

    // ---------- cursors ----------
    queueCursor() {
      if (this.cursorTimer) return;
      this.cursorTimer = setTimeout(() => { this.cursorTimer = null; this.sendCursor(); }, 80);
    }
    sendCursor() {
      const ta = this.ta; if (!ta || !this.ot || !this.joined || this.closed) return;
      if (this.ot.inflight) { this.cursorDirty = true; return; }   // positions must be in server space
      this.cursorDirty = false;
      let pos = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd, sel = pos === ta.selectionStart ? ta.selectionEnd : ta.selectionStart;
      if (this.queued) { pos = OT.transformIndex(pos, this.queued, false); sel = OT.transformIndex(sel, this.queued, false); }
      const key = `${this.ot.rev}:${pos}:${sel}`; if (key === this.lastCursor) return; this.lastCursor = key;
      C.send({ type: 'doc-cursor', slug: this.slug, pos, sel, rev: this.ot.rev });
    }

    render() {
      const ta = this.ta, layer = this.layer;
      if (!ta || !layer || !ta.isConnected) return;
      if (!layer.isConnected) (ta.offsetParent || ta.parentNode).appendChild(layer);
      const list = [...this.cursors.values()];
      const hidden = ta.offsetParent === null || !list.length;
      layer.classList.toggle('hidden', hidden); if (hidden) { layer.innerHTML = ''; return; }
      const max = this.dom.length;
      // cursor positions are in doc space; while composing the DOM lags by `queued`
      const pts = measure(ta, list.map(c => Math.min(max, c.pos)));
      const lh = lineHeight(ta);
      layer.innerHTML = list.map((c, i) => {
        const p = pts[i]; if (!p) return '';
        const fg = textOn(c.color), below = p.y < 18;
        return `<div class="co-caret" data-peer="${esc(c.peer)}" style="left:${p.x}px;top:${p.y}px;height:${lh}px;background:${esc(c.color)}">` +
          `<span class="co-label${below ? ' below' : ''}" style="background:${esc(c.color)};color:${fg}">${esc(c.name)}</span></div>`;
      }).join('');
    }
  }

  // ---------- geometry (mirror-div technique, one mirror for many positions) ----------
  function measure(ta, positions) {
    if (ta.rtMeasure) return ta.rtMeasure(positions);   // feat/richtext: the rich surface maps Markdown offsets to the screen
    const m = document.createElement('div'), cs = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'padding', 'border', 'letterSpacing', 'wordSpacing', 'tabSize', 'textIndent', 'textTransform', 'width', 'boxSizing']
      .forEach(k => (m.style[k] = cs[k]));
    Object.assign(m.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordWrap: 'break-word', top: '0', left: '0', overflow: 'hidden', height: 'auto' });
    const text = ta.value, order = positions.map((p, i) => [Math.max(0, Math.min(text.length, p)), i]).sort((a, b) => a[0] - b[0]);
    const spans = []; let at = 0;
    for (const [p, i] of order) {
      if (p > at) m.appendChild(document.createTextNode(text.slice(at, p)));
      const sp = document.createElement('span'); sp.textContent = '​'; m.appendChild(sp); spans[i] = sp; at = p;
    }
    if (at < text.length) m.appendChild(document.createTextNode(text.slice(at)));
    ta.parentNode.appendChild(m);
    const out = spans.map(sp => sp && { x: sp.offsetLeft + ta.offsetLeft, y: sp.offsetTop + ta.offsetTop - ta.scrollTop });
    m.remove();
    return out;
  }
  function lineHeight(ta) { const cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight); return Number.isFinite(lh) ? lh : parseFloat(cs.fontSize) * 1.5; }
  function scrollParent(el) {
    for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p; }
    return document.scrollingElement;
  }

  // ---------- socket events ----------
  const route = fn => m => { const s = sessions.get(m.slug); if (s && !s.closed) fn(s, m); };
  C.on('doc-state', route((s, m) => s.onState(m)));
  C.on('doc-op', route((s, m) => s.onRemote(m.op, m.peer, m.by, m.ext)));
  C.on('doc-ack', route((s, m) => s.onAck(m)));
  C.on('doc-cursor', route((s, m) => s.onCursor(m)));
  C.on('doc-peers', route((s, m) => s.setPeers(m.peers || [])));
  C.on('doc-title', route((s, m) => s.hooks.onTitle && s.hooks.onTitle(m.title, m.by)));
  C.on('doc-error', route((s, m) => s.hooks.onToast && s.hooks.onToast(m.error === 'spectators are read-only' ? 'Spectators can read along but not edit' : 'Live edit rejected: ' + m.error)));
  C.on('status', st => { if (st.status !== 'online') for (const s of sessions.values()) { s.joined = false; s.status(); } });
  C.on('hello', () => { for (const s of sessions.values()) if (!s.joined && !s.joining) s.join(); });

  Session.prototype.status = function () {
    if (!this.hooks.onStatus) return;
    this.hooks.onStatus(!this.joined ? 'offline' : this.ot && this.ot.inflight ? 'syncing' : 'synced');
  };

  window.TribeCoedit = {
    open(slug, hooks) { const old = sessions.get(slug); if (old) { old.hooks = hooks; return old; } const s = new Session(slug, hooks); sessions.set(slug, s); return s; },
    get: slug => sessions.get(slug) || null,
    sendTitle(slug, title) { const s = sessions.get(slug); return !!(s && s.joined && C.send({ type: 'doc-title', slug, title })); },
    flush(slug) { C.send({ type: 'doc-flush', slug }); },
    debug(slug) { const s = sessions.get(slug); return s && { rev: s.ot && s.ot.rev, state: s.ot && s.ot.state, doc: s.doc, dom: s.dom, joined: s.joined, you: s.you, cursors: [...s.cursors.values()], peers: s.peers }; },
  };
})();
