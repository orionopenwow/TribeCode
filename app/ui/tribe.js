// Connection to the tribe server: REST + WebSocket with auto-reconnect.
(function () {
  const S = window.TribeStore;
  const listeners = {};
  let sock = null, retry = 0, state = { status: 'offline', members: [], me: null, tribe: null };

  const emit = (t, d) => [...(listeners[t] || [])].forEach(fn => { try { fn(d); } catch (e) { console.error(e); } });

  function base() {
    // A page served by a TribeCode server talks to that server. The Windows desktop app's own page is also http
    // (http://tauri.localhost), but that origin is the app's bundled files, not a server: every API call there came
    // back as index.html, so sign-in silently failed. The desktop app uses its saved server (its own on :4747).
    if (/^https?:$/.test(location.protocol) && !/(^|\.)tauri\.localhost$/i.test(location.hostname)) return location.origin;
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

  // ---------- the outbox: actions show at once and send in order, even while the server is waking up ----------
  // Each item is { id, path, method, body, kind, ch, at }. Network trouble (no answer, 5xx, 429) keeps it queued and retries;
  // a real refusal (4xx) drops it and tells the page ('outbox-failed'). Kept per server in localStorage, so a reload keeps it.
  const OB = () => 'tribecode.outbox:' + base();
  const obLoad = () => { try { const a = JSON.parse(localStorage.getItem(OB()) || '[]'); return Array.isArray(a) ? a.slice(0, 200) : []; } catch { return []; } };
  let outbox = null, flushing = false, flushTimer = null;
  const ob = () => (outbox = outbox || obLoad());
  function obSave() { try { localStorage.setItem(OB(), JSON.stringify(ob())); } catch {} emit('outbox', ob()); }
  const cid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  function queue(path, body = {}, { method = 'POST', kind = 'action', ch = null } = {}) {
    const item = { id: body.cid || cid(), path, method, body: { ...body, cid: body.cid || undefined }, kind, ch, at: Date.now(), project: project() };
    ob().push(item); obSave(); flush(); return item;
  }
  async function flush() {
    if (flushing || !ob().length || !token()) return; flushing = true; clearTimeout(flushTimer);
    while (ob().length) {
      const it = ob()[0];
      try { const r = await api(it.path, { method: it.method, body: it.body, project: it.project }); ob().shift(); obSave(); emit('outbox-sent', { item: it, result: r }); }
      catch (e) {
        if (!e.status || e.status >= 500 || e.status === 429) break;   // offline or waking up: try again soon
        ob().shift(); obSave(); emit('outbox-failed', { item: it, error: e.message });
      }
    }
    flushing = false; if (ob().length) flushTimer = setTimeout(flush, 4000);
  }
  addEventListener('online', () => { flush(); if (token() && state.status !== 'online') { retry = 0; connect(); } });   // network back: reconnect now, not after the back-off

  function setStatus(s) { state.status = s; emit('status', state); if (s === 'online') setTimeout(flush, 200); }

  let retryTimer = null;
  // ---------- cloud save (server/cloudsave.js): this device keeps a sealed copy of the tribe ----------
  // A free cloud host wipes its files when it naps. Whoever comes back first puts the tribe back from their copy;
  // later arrivals add what they have. If nobody here has a copy yet, we wait calmly instead of signing you out.
  const CS = () => 'tribecode.cloudsave:' + base();
  let cloud = false, saveTimer = null, saveEvery = null, waiting = false;
  const readCopy = () => { try { return JSON.parse(localStorage.getItem(CS()) || 'null'); } catch { return null; } };
  async function cloudRevive() {
    let h; try { h = await api('/health'); } catch { return 'down'; }
    cloud = !!h.cloud;
    if (!h.cloud || !h.cloudSave || h.members > 0) return 'ok';
    const copy = readCopy(); if (!copy || !copy.files) return 'empty';
    try { await api('/cloud/restore', { method: 'POST', body: { files: copy.files, sigs: copy.sigs } }); note('😴 Your tribe had a nap. Brought everything back from this device.'); return 'restored'; }
    catch { return 'empty'; }
  }
  async function cloudSave() {
    if (!cloud || !token()) return;
    try { const s = await api('/cloud/snapshot'); if (s && s.enabled) localStorage.setItem(CS(), JSON.stringify({ at: s.at, files: s.files, sigs: s.sigs })); } catch {}
  }
  const cloudSoon = () => { if (!cloud) return; clearTimeout(saveTimer); saveTimer = setTimeout(cloudSave, 15000); };
  async function cloudJoined() {   // after each sign-in: add what this device has, then refresh its copy every minute
    if (!cloud) return;
    const copy = readCopy();
    if (copy && copy.files) { try { await api('/cloud/merge', { method: 'POST', body: { files: copy.files, sigs: copy.sigs } }); } catch {} }
    cloudSave(); if (!saveEvery) saveEvery = setInterval(cloudSave, 60000);
  }
  function note(text, opts = {}) {
    let el = document.getElementById('cloud-note');
    if (!el) { el = document.createElement('div'); el.id = 'cloud-note'; el.setAttribute('role', 'status'); el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9999;max-width:min(560px,calc(100vw - 32px));padding:12px 16px;border-radius:12px;background:#1E242D;border:1px solid #F26B1D;color:#F8FAFC;font:500 14px/1.45 Inter,system-ui,sans-serif;display:flex;gap:12px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.35)'; document.body.appendChild(el); }
    el.innerHTML = ''; const t = document.createElement('span'); t.textContent = text; el.appendChild(t);
    if (opts.action) { const b = document.createElement('button'); b.textContent = opts.action[0]; b.style.cssText = 'flex:none;padding:6px 10px;border-radius:8px;border:1px solid #45403D;background:transparent;color:inherit;font:inherit;cursor:pointer'; b.onclick = opts.action[1]; el.appendChild(b); }
    clearTimeout(note.t); if (!opts.stay) note.t = setTimeout(() => el.remove(), 6000);
  }
  async function waitForTribe() {   // the tribe woke up empty and this device has no copy: wait for a friend's copy
    if (waiting) return; waiting = true;
    note('😴 The tribe is waking up. Waiting for a friend whose device has the saved copy…', { stay: true, action: ['Start fresh', () => { if (confirm('Start a fresh tribe? You will need the setup code, and old messages come back only when a friend with a saved copy opens TribeCode.')) { S.set({ server: { url: base(), token: '' } }); location.reload(); } }] });
    for (let i = 0; i < 360; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try { const h = await api('/health'); if (h.members > 0) break; } catch {}
    }
    waiting = false; const el = document.getElementById('cloud-note'); if (el) el.remove();
  }

  function connect() {
    clearTimeout(retryTimer); retryTimer = null;
    // Replacing a socket: detach it first, or its close event would schedule yet another connect()
    // that closes the new socket, and so on (a reconnect loop whenever connect() ran twice).
    if (sock) { const old = sock; sock = null; old.onclose = old.onmessage = old.onopen = null; try { old.close(); } catch {} }
    if (!token()) { setStatus('offline'); return; }
    setStatus('connecting');
    let want = ''; try { want = localStorage.getItem(projKey()) || ''; } catch {}
    const url = base().replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token()) + (want ? '&project=' + encodeURIComponent(want) : '');
    // feat/offline-demo: in the offline demo tribe the socket is a pretend one (app/ui/offline.js)
    const me = sock = (window.TribeOffline && window.TribeOffline.active() ? window.TribeOffline.socket(url) : new WebSocket(url));
    sock.onopen = () => { retry = 0; setStatus('online'); sendActivity(); };
    sock.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      emit('ws', m);   // every message, for feature modules (captions, typing, DMs…)
      if (m.type === 'hello') { setProject(m.project, m.projects); }
      if (m.type === 'chat' && m.message && m.message.cid) document.querySelectorAll(`.msg.pending[data-cid="${CSS.escape(m.message.cid)}"]`).forEach(el => el.remove());   // the outbox's instant bubble -> the real one
      if (m.type === 'hello') cloudJoined();   // cloud save: add this device's copy, then keep it fresh
      else if (cloud && (m.type === 'chat' || m.type === 'task' || m.type === 'doc' || m.type === 'presence')) cloudSoon();
      if (m.type === 'project-switched') { setProject(m.project); emit('project', state.project); }
      if (m.type === 'projects' || m.type === 'project-pulse') emit(m.type, m);
      if (m.type === 'hello') { state.huddle = m.huddle || []; emit('huddle', state.huddle); state.me = m.member; state.tribe = m.tribe; state.members = m.members; emit('hello', m); emit('presence', state.members); }
      if (m.type === 'presence') { state.members = m.members; emit('presence', state.members); }
      if (m.type === 'tribe' && m.tribe) { state.tribe = m.tribe; emit('tribe', m.tribe); }
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
      retryTimer = setTimeout(() => (cloud ? cloudRevive().then(r => (r === 'empty' ? waitForTribe() : null)) : Promise.resolve()).finally(connect), wait);   // cloud: the host may have napped
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
  // defer: an empty local tribe (no members yet, not a cloud server) is not claimed on open. The person sees their
  // Dashboard first and becomes host when they start their first project (app.js startFirst). Returns 'fresh'.
  async function ensureMember({ name, color, reclaim = false, defer = false }) {
    if (token()) {   // cloud: a napping host comes back empty; restore from this device, or wait for a friend's copy
      const r = await cloudRevive(); if (r === 'empty') await waitForTribe();
      return 'member';
    }
    try {
      const h = await api('/health'); cloud = !!h.cloud;
      if (h.members === 0) {
        if (defer && !h.cloud) { window.__tribeFresh = true; return 'fresh'; }
        window.__tribeFresh = false;
        const body = { name, color };
        if (h.cloud) {   // a new cloud tribe server: the first person claims it with its setup code (docs/CLOUD.md)
          const sc = window.prompt('This is a new TribeCode cloud server. Enter its setup code to become the host.\n\nIt is TRIBE_SETUP_CODE in your hosting dashboard (or in the server log).');
          if (!sc) return false;
          body.setupCode = sc.trim();
          if (!body.name || /^(me|you|host)$/i.test(body.name)) body.name = (window.prompt('Your name? Friends see it in chat.', '') || 'Host').trim().slice(0, 32) || 'Host';
        }
        const r = await api('/bootstrap', { method: 'POST', body });
        S.set({ server: { url: base(), token: r.token }, ...(h.cloud ? { name: r.member.name, color: r.member.color } : {}) });
        if (h.cloud) { try { if (window.__tribeCloseIntro && document.getElementById('intro')) window.__tribeCloseIntro(); localStorage.setItem('tribecode.intro.v1', 'seen'); } catch {} }   // claimed: straight into the tribe, no intro slides
        connect();
        return 'host';
      }
      // the sign-in backup (an HttpOnly cookie from when this browser joined or signed in): storage was cleared, not the account
      const ss = await api('/session').catch(() => null);
      if (ss && ss.token && ss.member) { S.set({ server: { url: base(), token: ss.token }, name: ss.member.name, color: ss.member.color, onboarded: true }); connect(); return 'member'; }
      if (reclaim) {   // the desktop app on the host computer: sign back in as the host (server checks it's really this machine)
        const r = await api('/host/reclaim', { method: 'POST', body: {} }).catch(e => { window.__authError = `Signing back in as the host failed: ${e.message || e}`; return null; });
        if (r && r.token) { S.set({ server: { url: base(), token: r.token }, name: r.member.name, color: r.member.color }); connect(); return 'reclaimed'; }
      }
    } catch (e) { window.__authError = `Could not sign in to the TribeCode server at ${base()}: ${e && e.message || e}`; }
    return false;
  }

  window.TribeClient = {
    api, connect, ensureMember, base, sendActivity, switchProject, project,
    on(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    state: () => state,
    connected: () => state.status === 'online',
    hasToken: () => !!token(),
    send(obj) { if (sock && sock.readyState === 1) { sock.send(JSON.stringify(obj)); return true; } return false; },
    queue, outbox: () => ob().slice(), flush, newId: cid,
    announce(text) { if (sock && sock.readyState === 1) sock.send(JSON.stringify({ type: 'announce', text })); },
    async probe() { try { return await api('/health'); } catch { return null; } },
  };
})();
