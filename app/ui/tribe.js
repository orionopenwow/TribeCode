// Connection to the tribe server: REST + WebSocket with auto-reconnect.
(function () {
  const S = window.TribeStore;
  const listeners = {};
  let sock = null, retry = 0, state = { status: 'offline', members: [], me: null, tribe: null };

  const emit = (t, d) => (listeners[t] || []).forEach(fn => { try { fn(d); } catch (e) { console.error(e); } });

  function base() {
    if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
    return (S.get().server && S.get().server.url) || 'http://localhost:4747';
  }
  const token = () => (S.get().server && S.get().server.token) || '';

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(base() + '/api' + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
    return data;
  }

  function setStatus(s) { state.status = s; emit('status', state); }

  function connect() {
    if (!token()) { setStatus('offline'); return; }
    try { if (sock) sock.close(); } catch {}
    setStatus('connecting');
    const url = base().replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token());
    sock = new WebSocket(url);
    sock.onopen = () => { retry = 0; setStatus('online'); sendActivity(); };
    sock.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      emit('ws', m);   // every message, for feature modules (captions, typing, DMs…)
      if (m.type === 'hello') { state.huddle = m.huddle || []; emit('huddle', state.huddle); state.me = m.member; state.tribe = m.tribe; state.members = m.members; emit('hello', m); emit('presence', state.members); }
      if (m.type === 'presence') { state.members = m.members; emit('presence', state.members); }
      if (m.type === 'chat') emit('chat', m);
      if (m.type === 'task') emit('task', m.task);
      if (m.type === 'task-removed') emit('task-removed', m.id);
      if (m.type === 'proposal') emit('proposal', m.proposal);
      if (m.type === 'milestones') emit('milestones', m.milestones);
      if (m.type === 'doc') emit('doc', m.doc);
      if (m.type === 'bug') emit('bug', m.bug);
      if (m.type === 'dev-reload') {
        const busy = (window.TribeDocs && window.TribeDocs.isDirty()) || (window.TribeHuddle && window.TribeHuddle.inCall());
        if (busy) window.TribeApp && window.TribeApp.toast('A new version is ready. It loads when you finish what you are doing.');
        else setTimeout(() => location.reload(), 300);
      }
      if (m.type === 'huddle') { state.huddle = m.members; emit('huddle', m.members); }
      if (m.type === 'rtc') emit('rtc', m);
      if (m.type === 'claims') { state.claims = m.claims; emit('claims', m.claims); }
      if (m.type === 'doc-summary') emit('doc-summary', m);
      if (m.type === 'doc-removed') emit('doc-removed', m.slug);
      if (['doc-state', 'doc-op', 'doc-ack', 'doc-cursor', 'doc-peers', 'doc-title', 'doc-error'].includes(m.type)) emit(m.type, m);
    };
    sock.onclose = () => {
      setStatus(token() ? 'reconnecting' : 'offline');
      if (!token()) return;
      const wait = Math.min(15000, 500 * 2 ** retry++);
      setTimeout(connect, wait);
    };
  }

  let where = 'Home';
  function sendActivity(w) { if (w) where = w; if (sock && sock.readyState === 1) sock.send(JSON.stringify({ type: 'activity', where })); }

  // Called after first-run setup on the host machine (UI served by the server, no token yet).
  async function ensureMember({ name, color }) {
    if (token()) return 'member';
    try {
      const h = await api('/health');
      if (h.members === 0) {
        const r = await api('/bootstrap', { method: 'POST', body: { name, color } });
        S.set({ server: { url: base(), token: r.token } });
        connect();
        return 'host';
      }
    } catch { /* no server reachable: local-only mode */ }
    return false;
  }

  window.TribeClient = {
    api, connect, ensureMember, base, sendActivity,
    on(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    state: () => state,
    connected: () => state.status === 'online',
    hasToken: () => !!token(),
    send(obj) { if (sock && sock.readyState === 1) { sock.send(JSON.stringify(obj)); return true; } return false; },
    announce(text) { if (sock && sock.readyState === 1) sock.send(JSON.stringify({ type: 'announce', text })); },
    async probe() { try { return await api('/health'); } catch { return null; } },
  };
})();
