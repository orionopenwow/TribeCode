// Connection to the tribe server: REST + WebSocket with auto-reconnect.
(function () {
  const S = window.TribeStore;
  const listeners = {};
  let sock = null, retry = 0, state = { status: 'offline', members: [], me: null, tribe: null };

  const emit = (t, d) => [...(listeners[t] || [])].forEach(fn => { try { fn(d); } catch (e) { console.error(e); } });

  function base() {
    if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
    return (S.get().server && S.get().server.url) || 'http://localhost:4747';
  }
  const token = () => (S.get().server && S.get().server.token) || '';

  // Project rooms: every call says which project it is about (the server scopes tasks, docs, chat… to it).
  const projKey = () => 'tribecode.project:' + base();
  const project = () => state.project || null;
  async function api(path, { method = 'GET', body, project: pj } = {}) {
    const pid = pj || project();
    const res = await fetch(base() + '/api' + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}), ...(pid ? { 'X-Project': pid } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
    return data;
  }

  function setStatus(s) { state.status = s; emit('status', state); }

  let retryTimer = null;
  function connect() {
    clearTimeout(retryTimer); retryTimer = null;
    // Replacing a socket: detach it first, or its close event would schedule yet another connect()
    // that closes the new socket, and so on (a reconnect loop whenever connect() ran twice).
    if (sock) { const old = sock; sock = null; old.onclose = old.onmessage = old.onopen = null; try { old.close(); } catch {} }
    if (!token()) { setStatus('offline'); return; }
    setStatus('connecting');
    let want = ''; try { want = localStorage.getItem(projKey()) || ''; } catch {}
    const url = base().replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token()) + (want ? '&project=' + encodeURIComponent(want) : '');
    const me = sock = new WebSocket(url);
    sock.onopen = () => { retry = 0; setStatus('online'); sendActivity(); };
    sock.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      emit('ws', m);   // every message, for feature modules (captions, typing, DMs…)
      if (m.type === 'hello') { setProject(m.project, m.projects); }
      if (m.type === 'project-switched') { setProject(m.project); emit('project', state.project); }
      if (m.type === 'projects' || m.type === 'project-pulse') emit(m.type, m);
      if (m.type === 'hello') { state.huddle = m.huddle || []; emit('huddle', state.huddle); state.me = m.member; state.tribe = m.tribe; state.members = m.members; emit('hello', m); emit('presence', state.members); }
      if (m.type === 'presence') { state.members = m.members; emit('presence', state.members); }
      if (m.type === 'chat') emit('chat', m);
      if (m.type === 'task') emit('task', m.task);
      if (m.type === 'task-removed') emit('task-removed', m.id);
      if (m.type === 'proposal') emit('proposal', m.proposal);
      if (m.type === 'milestones') emit('milestones', m.milestones);
      if (m.type === 'doc') emit('doc', m.doc);
      if (m.type === 'bug') emit('bug', m.bug);
      if (['repo', 'repo-activity', 'repo-settings', 'change', 'context'].includes(m.type)) emit(m.type, m); // app/ui/repo.js
      if (m.type === 'notification' || m.type === 'approval') emit(m.type, m);   // notify.js
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
      if (sock !== me) return;   // an old socket we already replaced
      setStatus(token() ? 'reconnecting' : 'offline');
      if (!token()) return;
      const wait = Math.min(15000, 500 * 2 ** retry++);
      retryTimer = setTimeout(connect, wait);
    };
  }

  function setProject(pid, list) {
    if (list) state.projects = list;
    state.project = pid || null;
    try { if (pid) localStorage.setItem(projKey(), pid); } catch {}
  }
  // Switch rooms: the server moves this socket, then everything reloads for the new project.
  function switchProject(pid) {
    if (!pid || pid === state.project) return Promise.resolve(false);
    if (!(sock && sock.readyState === 1)) { setProject(pid); emit('project', pid); return Promise.resolve(true); }
    return new Promise(resolve => {
      const list = (listeners.project = listeners.project || []);
      const done = p => { if (p !== pid) return; list.splice(list.indexOf(done), 1); resolve(true); };
      list.unshift(done);   // resolve before the UI reloads, so callers can follow up with show()
      sock.send(JSON.stringify({ type: 'project', id: pid }));
      setTimeout(() => { const i = list.indexOf(done); if (i >= 0) { list.splice(i, 1); resolve(false); } }, 4000);
    });
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
    api, connect, ensureMember, base, sendActivity, switchProject, project,
    on(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    state: () => state,
    connected: () => state.status === 'online',
    hasToken: () => !!token(),
    send(obj) { if (sock && sock.readyState === 1) { sock.send(JSON.stringify(obj)); return true; } return false; },
    announce(text) { if (sock && sock.readyState === 1) sock.send(JSON.stringify({ type: 'announce', text })); },
    async probe() { try { return await api('/health'); } catch { return null; } },
  };
})();
