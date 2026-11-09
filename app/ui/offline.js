// Offline demo tribe: a pretend tribe that lives only in this browser, so anyone can try hosting (on a computer or a
// phone) with no server and no network. When it is on, the real app UI talks to a small backend in this file:
//   * window.fetch to <base>/api/* is answered here from localStorage (state) and IndexedDB (uploaded files);
//   * tribe.js's connect() asks TribeOffline.socket(url) for a fake WebSocket (one marked line in tribe.js).
// You are the host of "Demo Tribe" with one project (Lantern Run), two pretend friends (Maya, Jay) and a pretend
// Claude agent that answers @mentions, picks up new tasks and posts a gist. Inviting someone makes a pretend link and
// a third friend (Rio) "joins" a few seconds later. Anything not built here answers "Not in the offline demo".
// Leaving restores your real settings exactly (server URL and token, hosting); the demo survives reloads until reset.
// Showcase mode (app/ui/showcase.js): the same backend seeded with a lively "Campfire Crew" tribe and a script that
// plays out by itself (db.mode === 'showcase'). start() with no mode asks which one you want.
//   window.TribeOffline = { active(), start(mode), choose(), leave(), reset(), hostForReal(), socket(url), state(), _k }
(function () {
  'use strict';
  const S = window.TribeStore;
  const KEY = 'tribecode.offlineDemo.v1', BKEY = 'tribecode.offlineDemo.backup';
  const ORIGIN = 'https://offline-demo.tribecode.invalid';   // server.url while in the demo (what the desktop app's base() returns)
  const TOKEN = 'offline-demo';
  const NOPE = 'Not in the offline demo';
  const RELEASES = 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  const iso = (t = Date.now()) => new Date(t).toISOString();
  const C = () => window.TribeClient, A = () => window.TribeApp;
  const toast = m => A() && A().toast(m);
  // feat/welcome: the pretend tribe someone named in Flint's welcome (welcome.js), else the default
  const wtribe = dflt => { const w = ls.get('tribecode.welcome.tribe'); return w && w.name ? { name: String(w.name).slice(0, 40), emoji: w.emoji || '🔥' } : { name: dflt, emoji: '🔥' }; };

  let db = ls.get(KEY);
  const active = () => !!(db && db.on && ((S.get().server || {}).token === TOKEN));
  const save = () => { if (db) ls.set(KEY, db); };

  // ---------- the pretend tribe ----------
  const AGENT = 'claude';
  function seed(mode) {
    if (mode === 'showcase' && window.TribeShowcase) return window.TribeShowcase.seed({ iso, rid, st: S.get() });
    const st = S.get(), now = Date.now();
    const name = st.name && st.name !== 'Me' ? st.name : 'You', first = name.split(' ')[0];
    const pid = 'lantern-run';
    const t = (title, status, assignee, ago) => ({ id: 't-' + rid(6), title, status, assignee: assignee || null, by: 'maya', created: iso(now - ago), updated: iso(now - ago), order: now - ago, source: 'board', body: '', project: pid });
    return {
      on: true, v: 1, created: iso(now), seq: 0,
      tribe: { name: wtribe('Demo Tribe').name, created: iso(now) },
      members: [
        { id: 'me', name, color: st.color || '#F26B1D', role: 'host', joined: iso(now) },
        { id: 'maya', name: 'Maya', color: '#6C7CFF', role: 'builder', joined: iso(now - 86400e3), online: true, where: 'Chat' },
        { id: 'jay', name: 'Jay', color: '#FFB86B', role: 'builder', joined: iso(now - 86400e3), online: false },
        { id: AGENT, name: `Claude · ${first}`.slice(0, 32), color: '#38C6B1', role: 'agent', owner: 'me', joined: iso(now), online: true, where: 'Tasks' },
      ],
      current: pid,
      projects: [{ id: pid, name: 'Lantern Run', emoji: '🏮', image: null, bio: 'A cozy night platformer: carry a little flame through three short levels and light the lanterns.',
        color: '#F26B1D', channel: 'general', default: true, created: iso(now), members: { me: 'host', maya: 'builder', jay: 'builder' } }],
      chat: { [pid]: [
        { id: 'm-' + rid(), at: iso(now - 60e3), by: 'tribecode', text: `${first} started **${wtribe('Demo Tribe').name}** ${wtribe('Demo Tribe').emoji} It lives only in this browser: nothing leaves this device.` },
        { id: 'm-' + rid(), at: iso(now - 40e3), by: 'maya', text: 'Hey! I\'m Maya, a pretend friend. Say hi, or try **@claude** in a message 👋' },
      ] },
      tasks: { [pid]: [
        t('[Player] Add a tiny dust puff when Wick lands from a big fall', 'backlog', null, 50e3),
        t('[Levels] Add a checkpoint flag halfway through Lantern Hill', 'doing', 'maya', 45e3),
        t('[Art] Give the lit lantern a warm halo ring', 'backlog', null, 40e3),
        t('[UI] Show the best time per level on the Lantern lit screen', 'review', 'jay', 35e3),
      ] },
      docs: { [pid]: [
        { slug: 'level-design-notes', title: 'Level design notes', pinned: true, by: 'maya', created: iso(now - 30e3), updated: iso(now - 30e3), updatedBy: 'maya', version: 1, project: pid,
          body: '# Level design notes\n\nA living doc: edit it together and keep it short.\n\n## The grid\n- Tiles are 10x10 pixels, 18 rows tall.\n- Wick jumps about 5 tiles high and 7 tiles far.\n\n## Rules of thumb\n- Teach one idea per level.\n- An ember before every hard part.\n' },
        { slug: 'kickoff-notes', title: 'Kickoff notes', by: 'me', created: iso(now - 20e3), updated: iso(now - 20e3), updatedBy: 'me', version: 1, project: pid,
          body: '# Kickoff notes\n\n- Goal for tonight: everyone plays all three levels, then each lane ships one small polish.\n- Claim a role first (Player, Levels, Art, Audio, UI).\n- Playtest rule: if a jump feels unfair, it is unfair.\n' },
      ] },
      vision: { [pid]: '# Vision · Lantern Run\n\nA cozy, two-minute platformer about a small flame lighting up the night, built by a few friends and their agents in one evening.\n' },
      gists: { [pid]: [] },
      scratch: [], uploads: [], invites: [], friends: [], prefs: { pins: [] }, joinedRio: false,
    };
  }

  // ---------- views of the state (the same shapes the real server sends) ----------
  const me = () => db.members.find(m => m.id === 'me');
  const nameOf = id => id === 'tribecode' ? 'TribeCode' : ((db.members.find(m => m.id === id) || {}).name || 'someone');
  const proj = id => db.projects.find(p => p.id === id);
  const cur = () => proj(db.current) ? db.current : db.projects[0].id;
  let where = 'Home';
  // offline-profiles: the profile editor works in the demo too (the same fields as server/profiles.js, kept in this browser)
  const PF_COLORS = { teal: '#38C6B1', indigo: '#6C7CFF', sky: '#4FA8F0', violet: '#A58BFF', rose: '#FF6F8E', coral: '#FF8A65', amber: '#F2B33D', lime: '#9AD65C', mint: '#4CD6A0', sand: '#D9B98C', orchid: '#E07BD0', slate: '#9AA7B8' };
  const PF_PIXELS = ['flame', 'campfire', 'tent', 'star', 'moon', 'fox', 'owl', 'bear', 'rabbit', 'frog', 'cat', 'raccoon', 'hedgehog', 'deer', 'mushroom', 'pine', 'mountain', 'lantern', 'marshmallow', 'compass', 'canoe', 'firefly', 'snail', 'acorn'];
  const pfRaw = mid => ((db.profiles = db.profiles || {})[mid] = db.profiles[mid] || {});
  function pfBrief(mid) {
    const p = (db.profiles || {})[mid]; if (!p) return null; const out = {};
    if (p.avatar && p.avatar.kind && p.avatar.kind !== 'initials') out.avatar = p.avatar;
    if (p.nameColor) out.nameColor = p.nameColor; if (p.pronouns) out.pronouns = p.pronouns;
    if (p.status && (!p.status.until || Date.parse(p.status.until) > Date.now())) out.status = p.status;
    if (p.nicks && Object.keys(p.nicks).length) out.nicks = p.nicks;
    return Object.keys(out).length ? out : null;
  }
  const pfFull = mid => { const p = (db.profiles || {})[mid] || {}; return { ...(pfBrief(mid) || {}), bio: p.bio || '', banner: p.banner || null, links: p.links || [], tz: p.tz || null, presence: p.presence || 'online', skills: p.skills || [], featured: p.featured || null, hire: !!p.hire }; };
  function pfPatch(mid, b) {
    const p = pfRaw(mid);
    for (const k of ['nameColor', 'pronouns', 'bio', 'tz', 'presence']) if (k in b) { if (b[k] === null || b[k] === '') delete p[k]; else p[k] = String(b[k]).slice(0, k === 'bio' ? 300 : 80); }
    if ('avatar' in b) { const a = b.avatar || { kind: 'initials' }; if (a.kind === 'initials') delete p.avatar; else if (a.kind !== 'photo') p.avatar = { kind: a.kind, emoji: a.emoji || undefined, pixel: a.pixel || undefined, tint: a.tint || null }; }
    if ('banner' in b) { if (!b.banner) delete p.banner; else if (b.banner.color) p.banner = { color: b.banner.color }; }
    if ('status' in b) { const st = b.status; if (!st || (!st.text && !st.emoji)) delete p.status; else { const ms = { '30m': 30 * 60e3, '4h': 4 * 3600e3 }[st.clear]; p.status = { emoji: st.emoji || null, text: String(st.text || '').slice(0, 80), until: ms ? iso(Date.now() + ms) : null }; } }
    if ('links' in b) p.links = (Array.isArray(b.links) ? b.links : []).slice(0, 3).filter(l => l && /^https?:\/\//.test(l.url || '')).map(l => ({ url: String(l.url).slice(0, 300), label: String(l.label || '').slice(0, 32) }));
    if ('skills' in b) p.skills = (Array.isArray(b.skills) ? b.skills : []).map(x => String(x).slice(0, 24)).filter(Boolean).slice(0, 8);
    if ('featured' in b) p.featured = b.featured && (b.featured.title || b.featured.url) ? { title: String(b.featured.title || '').slice(0, 60), url: /^https?:\/\//.test(b.featured.url || '') ? b.featured.url : null } : null;
    if ('hire' in b) p.hire = !!b.hire;
    if ('nick' in b && b.project) { p.nicks = p.nicks || {}; if (b.nick) p.nicks[b.project] = String(b.nick).slice(0, 32); else delete p.nicks[b.project]; }
    save(); pushPresence(); return pfFull(mid);
  }
  function presence() {
    return db.members.map(m => {
      const on = m.id === 'me' ? true : !!m.online;
      const { online, where: w, ...rest } = m;
      const pb = pfBrief(m.id);
      return { ...rest, ...(pb ? { profile: pb } : {}), online: on, where: m.id === 'me' ? where : on ? (w || 'Home') : null, since: on ? db.created : null, project: on ? cur() : null };
    });
  }
  function counts(pid) {
    return { tasks: (db.tasks[pid] || []).filter(t => t.status !== 'done').length, docs: (db.docs[pid] || []).length, requests: 0, bugs: 0 };
  }
  function view(p) {
    const here = presence().filter(m => m.online && m.project === p.id).map(m => m.id);
    return { id: p.id, name: p.name, emoji: p.emoji || '', image: p.image || null, bio: p.bio || '', color: p.color, channel: p.channel, hasRepo: false, workspace: false, huddleSummary: false,
      members: Object.entries(p.members || {}).map(([id, role]) => ({ id, role })), created: p.created, default: !!p.default, counts: counts(p.id), here, role: 'host' };
  }
  const projects = () => db.projects.map(view);
  const docMeta = ({ body, ...d }) => ({ ...d, summary: '', words: String(body || '').split(/\s+/).filter(Boolean).length });
  function pulse(pid) {
    const p = proj(pid), tasks = db.tasks[pid] || [], docs = db.docs[pid] || [], people = presence();
    const here = people.filter(m => m.online && m.project === pid);
    const recent = [...tasks.map(t => ({ kind: 'task', at: t.updated, text: t.title, sub: `${t.status}${t.updatedBy ? ' · ' + nameOf(t.updatedBy) : ''}`, ref: t.id, by: t.updatedBy || t.by })),
      ...docs.map(d => ({ kind: 'doc', at: d.updated, text: d.title, sub: `doc · ${nameOf(d.updatedBy)}`, ref: d.slug, by: d.updatedBy })),
      ...((db.commits || {})[pid] || []).map(c => ({ kind: 'commit', at: c.at, text: c.subject, sub: `${c.sha} · ${nameOf(c.by)}${c.add != null ? ` · +${c.add} −${c.del}` : ''}`, ref: c.sha, by: c.by }))].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10);
    const doing = tasks.filter(t => t.status === 'doing'), todo = tasks.filter(t => t.status === 'backlog' || t.status === 'review');
    const chat = (db.chat[pid] || []).filter(m => m.by !== 'tribecode');
    return { project: view(p), here: here.map(m => ({ id: m.id, name: m.name, color: m.color, where: m.where, role: m.role })),
      agents: people.filter(m => m.role === 'agent' && m.online).map(a => ({ id: a.id, name: a.name, where: a.where, since: a.since })),
      team: people.filter(m => (p.members || {})[m.id] || m.role === 'agent').map(m => ({ id: m.id, name: m.name, color: m.color, role: (p.members || {})[m.id] || m.role, online: m.online, here: m.online, kind: m.role === 'agent' ? 'agent' : 'person' })),
      recent, taskCount: tasks.length, upcoming: [], repo: (db.repo || {})[pid] || null, bio: p.bio || '',
      vision: { has: !!db.vision[pid], excerpt: String(db.vision[pid] || '').replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 160) },
      living: { mood: db?.mode === 'showcase' ? 'buzzing' : chat.length ? 'steady' : 'fresh', by: 'tribecode',
        summary: `${p.name} is a pretend project in the ${db?.mode === 'showcase' ? 'showcase' : 'offline demo'}. ${doing.length ? `Now: ${doing[0].title}.` : todo.length ? `Next: ${todo[0].title}.` : 'Add a first task.'}`,
        lines: { lately: recent[0] ? `Last: ${recent[0].text}` : 'Nothing yet', chat: chat.length ? `${chat.length} message${chat.length === 1 ? '' : 's'}` : 'No messages yet',
          next: doing.length ? `In progress: ${doing[0].title}` : todo.length ? `Up next: ${todo[0].title}` : 'No tasks yet', soon: 'Nothing on the calendar' } } };
  }
  function hubData() {
    const feed = db.projects.flatMap(p => pulse(p.id).recent.map(r => ({ project: p.id, id: `${r.kind}:${r.ref}`, kind: r.kind, at: r.at, title: r.text, by: r.by && db.members.some(m => m.id === r.by) ? r.by : 'me', byName: r.by && db.members.some(m => m.id === r.by) ? nameOf(r.by) : me().name, sub: r.sub, ref: { type: r.kind, id: r.ref } })))
      .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 20);
    return { me: { id: 'me', name: me().name, role: 'host' }, hero: [], more: [], waiting: (db.approvals || []).filter(a => a.status === 'pending').length, feed, notes: [], suggestions: [],
      status: { activeToday: presence().filter(m => m.online && m.role !== 'agent').length, projects: db.projects.length, agents: [] },
      projects: db.projects.map(p => ({ id: p.id, name: p.name, emoji: p.emoji || '', color: p.color, image: p.image || null, last: db.created, here: p.id === cur() ? 1 : 0 })),
      people: [], lastProject: cur(), fleet: { agents: [], models: { online: false, model: '', list: [] }, loops: [], secretary: { enabled: false, quiet: false, model: '', lastRun: null, running: false } },
      ideas: [], prefs: db.prefs, notesApi: false, insightsApi: false, rev: 'demo-' + db.seq, at: iso() };
  }
  function hello() {
    return { type: 'hello', member: presence().find(m => m.id === 'me'), tribe: db.tribe, members: presence(), version: (document.querySelector('meta[name="tribe-version"]') || {}).content || '',
      huddle: [], project: cur(), projects: projects(), offlineDemo: true };
  }

  // ---------- the fake socket ----------
  const sockets = new Set();
  function push(msg) { if (!active()) return; db.seq++; for (const s of sockets) s._recv(msg); }
  const pushPresence = () => active() && push({ type: 'presence', members: presence() });
  const pushHub = () => push({ type: 'hub', rev: 'demo-' + db.seq });
  function chatPush(pid, msg) { push(pid === cur() ? { type: 'chat', channel: 'general', message: msg } : { type: 'project-pulse', project: pid, kind: 'chat' }); }
  class FakeSocket {
    constructor(url) {
      this.url = url; this.readyState = 0; this.onopen = this.onmessage = this.onclose = this.onerror = null;
      let want = ''; try { want = new URL(url.replace(/^ws/, 'http')).searchParams.get('project') || ''; } catch {}
      if (want && proj(want)) db.current = want;
      sockets.add(this);
      setTimeout(() => { if (this.readyState !== 0 || !active()) return; this.readyState = 1; if (this.onopen) this.onopen({}); this._recv(hello()); }, 20);
    }
    _recv(msg) { if (this.readyState !== 1) return; const data = JSON.stringify(msg); setTimeout(() => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data }); }, 0); }
    send(raw) { let m; try { m = JSON.parse(raw); } catch { return; } if (active()) onSocket(this, m); }
    close() { if (this.readyState === 3) return; this.readyState = 3; sockets.delete(this); setTimeout(() => this.onclose && this.onclose({}), 0); }
  }
  let presT = null;
  function onSocket(sock, m) {
    if (m.type === 'activity' && typeof m.where === 'string') { where = m.where.slice(0, 80); clearTimeout(presT); presT = setTimeout(pushPresence, 300); return; }
    if (m.type === 'project' && proj(m.id)) { db.current = m.id; save(); sock._recv({ type: 'project-switched', project: m.id }); pushPresence(); return; }
    if (m.type === 'ping') return sock._recv({ type: 'pong', t: m.t });
    if (m.type === 'announce' && m.text) return post(cur(), 'me', String(m.text).slice(0, 400));
    if (m.type === 'huddle-join') return toast('Huddles are ' + NOPE.toLowerCase().replace('not in', 'not in') + '.');
    if (String(m.type).startsWith('doc-')) return live(sock, m);
  }

  // Live docs for one person: a tiny version of server/live.js (no one else edits, so every op lands at the current rev).
  const sessions = new Map();
  function live(sock, m) {
    const OT = window.TribeOT, slug = String(m.slug || ''), list = db.docs[cur()] || [], d = list.find(x => x.slug === slug);
    const state = (s, extra) => ({ type: 'doc-state', slug, sid: 'demo', rev: s.rev, title: s.title, version: d ? d.version : 1, you: 'me~1', peers: [{ peer: 'me~1', id: 'me', name: me().name, color: me().color }], ...extra });
    if (m.type === 'doc-join') {
      if (!d) return sock._recv({ type: 'doc-state', slug, error: 'doc not found' });
      const s = { rev: 0, text: d.body || '', title: d.title, timer: null }; sessions.set(slug, s);
      return sock._recv(state(s, { text: s.text }));
    }
    const s = sessions.get(slug); if (!s || !d) return;
    const persist = () => { clearTimeout(s.timer); s.timer = null; if (!active()) return; if (d.body === s.text && d.title === s.title) return; d.body = s.text; d.title = s.title; d.version = (d.version || 1) + 1; d.updated = iso(); d.updatedBy = 'me'; save(); push({ type: 'doc', doc: { slug, title: d.title, version: d.version, updated: d.updated, updatedBy: 'me' } }); };
    if (m.type === 'doc-op') {
      if (!OT || m.rev !== s.rev || !OT.valid(m.op)) return sock._recv(state(s, { text: s.text, resync: 'out of step' }));
      try { s.text = OT.apply(s.text, m.op); } catch { return sock._recv(state(s, { text: s.text, resync: 'bad op' })); }
      s.rev++; sock._recv({ type: 'doc-ack', slug, rev: s.rev, cid: m.cid });
      clearTimeout(s.timer); s.timer = setTimeout(persist, 400); return;
    }
    if (m.type === 'doc-title') { s.title = String(m.title || '').slice(0, 120) || 'Untitled'; clearTimeout(s.timer); s.timer = setTimeout(persist, 400); return; }
    if (m.type === 'doc-flush') return persist();
    if (m.type === 'doc-leave') { persist(); sessions.delete(slug); }
  }
  // feat/demo-tour: a pretend friend edits a live doc (director.js): the new text goes out as an op from their peer, with
  // their caret, so coedit.js draws them like a real co-editor. all: everyone editing besides you [{ peer, id, name, color }].
  function peerEdit(slug, who, text, pos, all) {
    const OT = window.TribeOT, s = sessions.get(slug), d = (db.docs[cur()] || []).find(x => x.slug === slug); if (!d) return false;
    const peers = [{ peer: 'me~1', id: 'me', name: me().name, color: me().color }, ...(all || [who]).map(({ peer, id, name, color }) => ({ peer, id, name, color }))];
    if (!s || !OT) { d.body = text; save(); return false; }
    const op = OT.diff(s.text, text);
    if (op && !OT.isNoop(op)) { s.text = text; s.rev++; d.body = text; save(); push({ type: 'doc-op', slug, op, peer: who.peer, by: who.id }); }
    push({ type: 'doc-peers', slug, peers });
    if (pos != null) push({ type: 'doc-cursor', slug, peer: who.peer, id: who.id, name: who.name, color: who.color, pos, sel: pos });
    return true;
  }
  const liveText = slug => { const s = sessions.get(slug); return s ? s.text : null; };

  // ---------- the pretend people ----------
  const later = (ms, fn) => setTimeout(() => { if (active()) { try { fn(); } catch (e) { console.warn('offline demo:', e); } } }, ms);
  function post(pid, by, text, extra) {
    const msg = { id: 'm-' + rid(), at: iso(), by, text: String(text).slice(0, 4000), ...(extra || {}) };
    (db.chat[pid] = db.chat[pid] || []).push(msg); if (db.chat[pid].length > 400) db.chat[pid].splice(0, db.chat[pid].length - 400);
    save(); chatPush(pid, msg); return msg;
  }
  const LINES = [
    'Hi! I\'m a pretend Claude in this offline demo. In a real tribe I read the board, claim files before I edit and save my changes to the code. Make a task and watch me pick it up.',
    'Good idea. In a real tribe I\'d claim the folder first so nobody\'s agent collides with mine, then post a short gist when it\'s done.',
    'I\'d split that into one task per lane (Player, Levels, Art). Add them on the Tasks board and I\'ll grab one.',
    'Noted. A real coding agent (Claude Code, Codex, Gemini CLI…) connects from Connect your AI, then it shows up right here.',
  ];
  let said = 0;
  function onChat(pid, text) {
    const t = String(text);
    if (/@(claude|ai|agent)\b/i.test(t) || /\bclaude\b/i.test(t)) {
      const ask = t.replace(/@\w+/g, '').trim();
      later(900, () => {
        if (/\b(task|todo|to-do)\b/i.test(ask) && ask.length > 8) {
          const title = ask.replace(/^(please|can you|could you)\s+/i, '').replace(/\b(make|add|create)\s+(a\s+)?(task|todo)\s*(to|for|:)?\s*/i, '').slice(0, 120) || 'A task from chat';
          const task = addTask(pid, { title: title[0].toUpperCase() + title.slice(1), by: AGENT });
          post(pid, AGENT, `On it: I added **${task.title}** to Tasks and I'll take it.`);
          pickUp(pid, task.id, 1200);
        } else post(pid, AGENT, LINES[said++ % LINES.length]);
      });
    }
    if (/@maya\b/i.test(t)) later(1400, () => post(pid, 'maya', 'Ha, I\'m a pretend friend, but I\'d totally playtest that 😄'));
    else if (!db.mayaHi && !/@/.test(t)) { db.mayaHi = true; save(); later(1600, () => post(pid, 'maya', 'Welcome to the demo! Try **@claude** in a message, or add a task and see what happens.')); }
  }
  function addTask(pid, { title, by, status = 'backlog', body = '', assignee = null }) {
    const now = Date.now();
    const t = { id: `t-${now.toString(36)}-${rid(3)}`, title: String(title || '').slice(0, 200) || 'Untitled task', status: ['backlog', 'doing', 'review', 'done'].includes(status) ? status : 'backlog',
      assignee, by, created: iso(now), updated: iso(now), order: now, source: 'board', body: String(body || '').slice(0, 20000), project: pid };
    (db.tasks[pid] = db.tasks[pid] || []).push(t); save();
    if (pid === cur()) push({ type: 'task', task: t }); else push({ type: 'project-pulse', project: pid, kind: 'task' });
    return t;
  }
  // ---------- votes, approvals and the inbox (empty in the quiet demo; showcase.js fills them) ----------
  function tally(p) {
    const voters = db.members.filter(m => m.role !== 'agent' && m.role !== 'spectator').length || 1;
    const vs = Object.values(p.votes || {}), yes = vs.filter(v => v === 'yes').length, no2 = vs.filter(v => v === 'no').length;
    return { yes, no: no2, voters, pending: Math.max(0, voters - yes - no2), needed: Math.floor(voters / 2) + 1 };
  }
  function nextVersion(ms) {
    const last = (ms || []).map(m => String(m.version).replace(/^v/, '').split('.').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1])[0] || [0, 0];
    return `v${last[0]}.${(last[1] || 0) + 1}`;
  }
  const hooks = { approved: [], decided: [], route: [] };   // route: feat/demo-tour (director.js answers a few showcase-only paths first)
  function vote(pid, pr, who, v) {
    if (pr.status !== 'open') return pr;
    (pr.votes = pr.votes || {})[who] = v; save();
    const t = tally(pr);
    if (t.yes >= t.needed) {
      const ms = (db.milestones = db.milestones || {})[pid] = db.milestones[pid] || [];
      const version = pr.version || nextVersion(ms);
      pr.status = 'approved'; pr.closed = iso(); pr.milestone = version;
      const items = (String(pr.body || '').match(/^\s*[-*]\s+\[ \]\s+(.+)$/gm) || []).map(l => l.replace(/^\s*[-*]\s+\[ \]\s+/, '').trim()).slice(0, 12);
      pr.tasks = items.map(title => addTask(pid, { title, by: pr.by, body: `From proposal **${pr.title}** (${version}).` }).id);
      ms.push({ version, title: pr.short || pr.title, proposal: pr.id, created: pr.closed, status: 'planned', tasks: pr.tasks }); save();
      post(pid, 'tribecode', `Approved: **${pr.title}** → milestone **${version}**${items.length ? `, ${items.length} tasks created` : ''} 🎉`);
      push({ type: 'milestones', milestones: ms });
      hooks.approved.forEach(fn => { try { fn(pid, pr); } catch (e) { console.warn(e); } });
    } else if (t.no >= t.needed) { pr.status = 'parked'; pr.closed = iso(); save(); post(pid, 'tribecode', `Proposal parked: **${pr.title}**`); }
    push({ type: 'proposal', proposal: { ...pr, tally: tally(pr) } });
    return pr;
  }
  function decide(ap, what, who, note) {
    ap.status = what === 'approve' ? 'approved' : 'denied'; ap.decidedBy = who; ap.decidedByName = nameOf(who); ap.decided = iso(); if (note) ap.note = note; save();
    push({ type: 'approval', approval: ap });
    hooks.decided.forEach(fn => { try { fn(ap); } catch (e) { console.warn(e); } });
  }
  function notify(item) {
    const it = { id: 'n-' + rid(8), at: iso(), priority: 'normal', ...item };
    (db.inbox = db.inbox || []).unshift(it); db.inbox = db.inbox.slice(0, 120); save();
    push({ type: 'notification', item: it }); return it;
  }
  function pickUp(pid, tid, wait = 2500) {
    if (db.busy) return; db.busy = tid; save();
    later(wait, () => {
      const t = (db.tasks[pid] || []).find(x => x.id === tid); if (!t || t.status === 'done') { db.busy = null; save(); return; }
      Object.assign(t, { assignee: AGENT, status: 'doing', updated: iso(), updatedBy: AGENT }); save();
      if (pid === cur()) push({ type: 'task', task: t });
      post(pid, AGENT, `Picking up **${t.title}**. I'll post a gist when it's done.`);
      later(5000, () => {
        const t2 = (db.tasks[pid] || []).find(x => x.id === tid); db.busy = null; save(); if (!t2) return;
        Object.assign(t2, { status: 'review', updated: iso(), updatedBy: AGENT });
        if (pid === cur()) push({ type: 'task', task: t2 });
        const g = { id: 'g-' + rid(8), kind: 'progress', title: `Done: ${t2.title}`.slice(0, 90), bullets: ['Made the change in a pretend branch (nothing is really built in the demo)', 'Moved the task to Review', 'Next: a friend checks it, then it ships'],
          files: [], link: null, task: t2.id, by: AGENT, byName: nameOf(AGENT), agent: true, role: null, at: iso(), project: pid, auto: false };
        const msg = post(pid, AGENT, `📈 **${g.title}**\n${g.bullets.map(b => `- ${b}`).join('\n')}`, { gist: g });
        g.msg = msg.id; (db.gists[pid] = db.gists[pid] || []).unshift(g); save();
        push({ type: 'gist', gist: g, project: pid }); pushHub();
      });
    });
  }
  function friendJoins() {
    if (db.joinedRio) return; db.joinedRio = true; save();
    later(6000, () => {
      if (!db.members.some(m => m.id === 'rio')) db.members.push({ id: 'rio', name: 'Rio', color: '#9AE66E', role: 'builder', joined: iso(), online: true, where: 'Chat' });
      for (const p of db.projects) p.members.rio = 'builder';
      save(); pushPresence(); push({ type: 'projects' });
      post(cur(), 'tribecode', `Rio joined **${(db && db.tribe && db.tribe.name) || 'Demo Tribe'}** with your pretend link 👋`);
      later(1500, () => post(cur(), 'rio', 'Hi all! I\'m Rio, a pretend friend who just tapped your link 😄'));
    });
  }

  // ---------- uploads: small files kept as blobs in IndexedDB (memory if IndexedDB is unavailable) ----------
  const mem = new Map(); let idb = null;
  function store() {
    if (idb) return idb;
    idb = new Promise(res => {
      try { const r = indexedDB.open('tribecode-offline-demo', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
      catch { res(null); }
    });
    return idb;
  }
  async function blobPut(id, blob) { const d = await store(); if (!d) return mem.set(id, blob); await new Promise(res => { const tx = d.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put(blob, id); tx.oncomplete = tx.onerror = () => res(); }); }
  async function blobGet(id) { if (mem.has(id)) return mem.get(id); const d = await store(); if (!d) return null; return new Promise(res => { const r = d.transaction('blobs').objectStore('blobs').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
  async function blobDel(id) { mem.delete(id); const d = await store(); if (d) d.transaction('blobs', 'readwrite').objectStore('blobs').delete(id); }
  async function blobClear() { mem.clear(); const d = await store(); if (d) d.transaction('blobs', 'readwrite').objectStore('blobs').clear(); }
  const KIND = n => { const e = (String(n).split('.').pop() || '').toLowerCase(); return /^(png|jpe?g|gif|webp|avif|bmp|svg)$/.test(e) ? 'image' : /^(mp3|wav|ogg|m4a|flac)$/.test(e) ? 'audio' : /^(webm|mp4|mov)$/.test(e) ? 'video' : e === 'pdf' ? 'pdf' : /^(md|txt|csv|log)$/.test(e) ? 'text' : /^(js|ts|py|json|html|css)$/.test(e) ? 'code' : 'file'; };
  const MAX_UPLOAD = 8 * 1024 * 1024;

  // ---------- the API ----------
  const ok = d => [200, d];
  const no = (status = 404, error = NOPE) => [status, { error }];
  const slugify = s => (String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'doc').replace(/^-+/, '') || 'doc';
  function scratchPut(list) {
    const prev = new Map(db.scratch.map(n => [n.id, n])), now = iso(), seen = new Set(), out = [];
    for (const raw of (Array.isArray(list) ? list : []).slice(0, 200)) {
      const text = typeof (raw && raw.text) === 'string' ? raw.text.slice(0, 20000) : '';
      let key = raw && typeof raw.id === 'string' && /^n-[a-z0-9_-]{4,16}$/.test(raw.id) ? raw.id : 'n-' + rid(8);
      if (seen.has(key)) key = 'n-' + rid(8); seen.add(key);
      const old = prev.get(key); if (!text.trim() && !old) continue;
      out.push({ id: key, text, at: old ? old.at : now, updated: old && old.text === text ? old.updated : now });
    }
    db.scratch = out; save(); return out;
  }

  const ASSIST_Q = [{ k: 'what', q: 'What are you making?' }, { k: 'who', q: 'Who is it for?' }, { k: 'fun', q: 'What makes it fun or useful?' }, { k: 'done', q: 'What does "done" look like for v1?' }, { k: 'out', q: 'What is out of scope?' }];
  const ASSIST_TASKS = [['Add a title screen with a Start button', 'every game needs a front door'], ['Show a score and lives on screen', 'players like to see progress'], ['Add jump and coin sounds', 'sound makes it feel alive'],
    ['Build a second level', 'more to play'], ['Add a simple boss at the end', 'a goal for the first world'], ['Add touch controls for phones', 'friends will open it on their phones']];
  function visionDraft(a) {
    const one = s => String(s || '').replace(/\s+/g, ' ').trim().replace(/\.$/, ''), list = s => String(s || '').split(/\s*(?:,|;|\n|\band\b)\s*/i).map(one).filter(Boolean), cap = s => s[0].toUpperCase() + s.slice(1);
    const out = [];
    if (a.what) out.push(`${one(a.what)}.`); if (a.who) out.push(`For ${one(a.who).replace(/^for\s+/i, '')}.`); if (a.fun) out.push(`What makes it good: ${one(a.fun)}.`);
    if (list(a.done).length) out.push('', '## Done for v1', ...list(a.done).slice(0, 8).map(x => `- ${cap(x)}`));
    if (list(a.out).length) out.push('', '## Out of scope', ...list(a.out).slice(0, 6).map(x => `- ${cap(x)}`));
    return out.join('\n').trim();
  }

  // ---------- the site builder (app/ui/website.js + sitegen.js): a small in-browser stand-in for server/showcase.js + sitegen.js ----------
  const SB = {
    types: [['game', 'Game page', '🎮', 'Play button, screenshots, devlog'], ['app', 'App landing', '📱', 'What it does, try it, questions'], ['portfolio', 'Portfolio', '🖼️', 'Selected work, about, contact'],
      ['business', 'Small business', '🏪', 'Hours, location, contact'], ['event', 'Event', '📅', 'Date, place, RSVP link'], ['docs', 'Docs / notes', '📓', 'Start here, topics, latest notes']].map(([id, name, icon, note]) => ({ id, name, icon, note })),
    layouts: [['editorial', 'Editorial', 'Serif headlines, thin rules'], ['swiss', 'Swiss', 'A strict grid, a flat color band'], ['devlog', 'Devlog', 'Monospace, dark'], ['poster', 'Poster', 'Oversized type'], ['journal', 'Journal', 'Quiet, centered serif'], ['arcade', 'Arcade', 'Pixel type, a star field']].map(([id, name, note]) => ({ id, name, note })),
    themes: [['cozy', 'Cozy', '#C0653A', '#4C8C4A', 'instrument', 'journal', 'Warm and calm'], ['bold', 'Bold', '#E4572E', '', 'bricolage', 'poster', 'Big type, bright color'], ['minimal', 'Minimal', '#2F5BEA', '', 'grotesk', 'swiss', 'A grid and one blue'],
      ['retro', 'Retro pixel', '#FFC23D', '#7BD88F', 'silkscreen', 'arcade', 'Pixel type on a night sky'], ['night', 'Night', '#7BD88F', '#FFC23D', 'mono', 'devlog', 'Dark, monospace'], ['paper', 'Paper', '#B4432B', '', 'fraunces', 'editorial', 'Like a printed page'],
      ['bakery', 'Bakery warm', '#B86B2E', '#C2417F', 'fraunces', 'journal', 'Crust brown and berry'], ['studio', 'Studio', '#7A5CC2', '', 'grotesk', 'editorial', 'Quiet, for showing work']].map(([id, name, primary, accent, font, layout, note]) => ({ id, name, primary, accent, font, layout, note, fontName: font, why: `${name}: ${note.toLowerCase()}.` })),
    fonts: [['fraunces', 'Fraunces + Inter', 'Classic'], ['grotesk', 'Space Grotesk + Inter', 'Modern'], ['mono', 'JetBrains Mono + Inter', 'Techy'], ['bricolage', 'Bricolage Grotesque + Inter', 'Playful'], ['instrument', 'Instrument Serif + Inter', 'Elegant'], ['silkscreen', 'Silkscreen + Inter', 'Retro']].map(([id, name, feel]) => ({ id, name, feel })),
    order: { game: ['hero', 'features', 'story', 'faq', 'footer'], app: ['hero', 'features', 'story', 'faq', 'contact', 'footer'], portfolio: ['hero', 'features', 'story', 'contact', 'footer'], business: ['hero', 'story', 'features', 'visit', 'faq', 'footer'], event: ['hero', 'event', 'story', 'faq', 'footer'], docs: ['hero', 'story', 'features', 'faq', 'footer'] },
    names: { hero: 'Hero', story: 'Story', features: 'Features', visit: 'Visit us', event: 'Event details', contact: 'Contact', faq: 'FAQ', footer: 'Footer' },
  };
  function siteGuess(p, hint) { const t = `${hint || ''} ${p.name} ${p.bio || ''}`.toLowerCase(); return /bakery|cafe|coffee|shop|store|salon/.test(t) ? 'business' : /party|wedding|meetup|festival|event/.test(t) ? 'event' : /portfolio/.test(t) ? 'portfolio' : /notes|docs|wiki/.test(t) ? 'docs' : /game|platformer|quest|level/.test(t) ? 'game' : 'app'; }
  function siteHtml(p, s) {
    const g = s.gen, e = x => String(x ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])), c = g.copy, b = s.brand || {}, dark = ['devlog', 'arcade'].includes(g.layout);
    const paper = dark ? '#14161B' : '#F7F4EE', ink = dark ? '#ECEEF1' : '#1A1714', pri = b.primary || p.color || '#2F5BEA', i = g.info || {};
    const sec = k => k === 'hero' ? `<section class="hero"><p class="k">${e(c.hero.kicker)}</p><h1>${e(c.hero.title)}</h1><p class="d">${e(c.hero.dek)}</p></section>`
      : k === 'visit' ? (i.hours || i.address ? `<section><h2>Visit us</h2><p>${e(i.hours || '')}<br>${e(i.address || '')}</p></section>` : '')
      : k === 'event' ? (i.date || i.place ? `<section><h2>The details</h2><p>${e(i.date || '')} · ${e(i.place || '')}</p></section>` : '')
      : k === 'footer' ? `<footer>${e(p.name)} · made in the TribeCode demo</footer>` : c[k] && c[k].body ? `<section><h2>${e(c[k].title)}</h2><p>${e(c[k].body)}</p></section>` : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(p.name)}</title><style>body{margin:0;background:${paper};color:${ink};font:17px/1.6 system-ui,sans-serif}section,footer{max-width:860px;margin:0 auto;padding:40px 24px;border-top:1px solid ${dark ? '#2A2F37' : '#DCD4C6'}}.hero{border:0;padding-top:64px}.k{color:${pri};font:600 13px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em}h1{font-size:56px;line-height:1;margin:12px 0}.d{font-size:20px;opacity:.85}h2{font-size:28px;margin:0 0 10px}footer{font-size:14px;opacity:.8}</style></head><body>${(SB.order[g.type] || SB.order.app).filter(k => !(g.off || {})[k]).map(sec).join('')}</body></html>`;
  }
  function siteView(p, s) {
    let url = null; if (s.gen) { try { if (s.url) URL.revokeObjectURL(s.url); s.url = URL.createObjectURL(new Blob([siteHtml(p, s)], { type: 'text/html' })); url = s.url + '#draft'; } catch {} }
    const g = s.gen, ty = g ? g.type : siteGuess(p);
    return { project: p.id, auto: false, sections: {}, fields: {}, defaults: { headline: p.name, tagline: p.bio || '', about: '', footer: '' }, shots: null, screens: [], built: null, exists: false, path: 'site/index.html', inRepo: false, autopilot: false,
      previewUrl: null, suggestions: [], open: 0, canManage: true, canSuggest: true, suggestable: {}, sectionList: [], hint: 'In the real app, Publish writes site/index.html and site/styles.css into the project repo.',
      gen: { draft: g ? { ...g, edited: g.edited || {}, polished: null, secs: SB.order[g.type] || SB.order.app } : null, live: s.live || null, unpublished: !!g && !s.live, draftUrl: url, brain: false, canDraft: true, canPublish: true, canBrand: true,
        layouts: SB.layouts, sections: Object.entries(SB.names).map(([id, name]) => ({ id, name })), types: SB.types, themes: SB.themes, guess: { type: ty, name: SB.types.find(t => t.id === ty).name },
        brand: { primary: (s.brand || {}).primary || '', accent: (s.brand || {}).accent || '', font: (s.brand || {}).font || '', wordmark: '', logo: null, notes: [], swatches: ['#B4432B', '#E4572E', '#E0951F', '#4C8C4A', '#2A8C80', '#2F5BEA', '#7A5CC2', '#C2417F'], fonts: SB.fonts, layoutFont: 'fraunces' },
        idea: s.idea || null, handEdited: [] } };
  }
  function siteMock(p, sub, sid, M, body) {
    db.website = db.website || {}; const s = db.website[p.id] = db.website[p.id] || {};
    const make = (type, theme) => {
      const t = SB.order[type] ? type : siteGuess(p, body.hint), th = SB.themes.find(x => x.id === theme);
      const prev = s.gen || {};
      s.gen = { type: t, layout: th ? th.layout : { game: 'arcade', app: 'swiss', portfolio: 'editorial', business: 'journal', event: 'poster', docs: 'devlog' }[t], theme: th ? th.id : null, info: prev.info || {}, off: {}, seed: 0, updated: iso(),
        copy: { hero: { kicker: SB.types.find(x => x.id === t).name, title: p.name, dek: p.bio || `${p.name}, made by friends.`, cta: '' }, story: { title: t === 'business' ? 'Our story' : 'The idea', body: p.bio || '' },
          features: { title: 'What you get', items: [] }, faq: { title: 'Questions', items: [{ q: `What is ${p.name}?`, a: p.bio || 'A small project.' }] }, footer: { text: p.name }, contact: { title: 'Get in touch', body: '' }, visit: { title: 'Visit us' }, event: { title: 'The details' } } };
      if (th) s.brand = { ...(s.brand || {}), primary: th.primary, accent: th.accent, font: th.font };
      s.live = null; return t;
    };
    if (M === 'GET' && !sub) return ok({ website: siteView(p, s) });
    if (sub === 'instant' && M === 'POST') { const t = make(body.type, body.theme); save(); return ok({ type: t, guessed: !body.type, website: siteView(p, s) }); }
    if (sub === 'gen' && M === 'POST') { if (!s.gen) make(); else if (body.how === 'shuffle') { const ids = SB.layouts.map(x => x.id); s.gen.layout = ids[(ids.indexOf(s.gen.layout) + 1) % ids.length]; s.live = null; } save(); return ok({ website: siteView(p, s) }); }
    if (sub === 'gen' && M === 'PUT') {
      if (!s.gen) make();
      if (body.type) make(body.type, s.gen.theme); if (body.theme) make(s.gen.type, body.theme); if (body.layout) s.gen.layout = body.layout;
      if (body.info) s.gen.info = { ...s.gen.info, ...body.info }; if (body.off) s.gen.off = { ...s.gen.off, ...body.off };
      if (body.section && s.gen.copy[body.section]) s.gen.copy[body.section] = { ...s.gen.copy[body.section], ...(body.copy || {}) };
      s.live = null; save(); return ok({ website: siteView(p, s) });
    }
    if (sub === 'brand') { if (M !== 'GET') { s.brand = { ...(s.brand || {}), ...['primary', 'accent', 'font'].reduce((o, k) => (body[k] !== undefined ? { ...o, [k]: body[k] } : o), {}) }; s.live = null; save(); } return ok({ brand: siteView(p, s).gen.brand, website: siteView(p, s) }); }
    if (sub === 'ideas' && M === 'POST') {
      if (sid === 'apply' && s.idea) { make(s.idea.type, s.idea.theme); s.idea = null; } else if (sid === 'skip') s.idea = null;
      else { const t = siteGuess(p), th = SB.themes.find(x => x.id === ({ game: 'retro', business: 'bakery', event: 'bold', portfolio: 'studio', docs: 'night' }[t] || 'minimal')); s.idea = { type: t, theme: th.id, primary: th.primary, accent: th.accent, font: th.font, layout: th.layout, tagline: p.bio || '', why: `Suggested because ${th.name} suits this kind of project.`, via: 'rules' }; }
      save(); return ok({ idea: s.idea, website: siteView(p, s) });
    }
    if (sub === 'code' && M === 'GET') { if (!s.gen) return no(404, 'make a draft first'); const h = siteHtml(p, s); return ok({ files: [{ name: 'index.html', bytes: h.length, text: h, note: 'The page.' }, { name: 'styles.css', bytes: 0, note: 'In the real app the look lives here, with brand tokens at the top.' }], folder: 'site/', inRepo: false, handEdited: [], draft: true, howTo: 'In the real app, Publish writes these files to the repo and never overwrites hand edits without asking.' }); }
    if (sub === 'publish' && M === 'POST') { if (!s.gen) return no(409, 'make a draft first'); s.live = { layout: s.gen.layout, at: iso(), byName: me().name }; save(); return ok({ changed: true, website: siteView(p, s) }); }
    if (sub === 'write' && M === 'POST') return no(503, 'Writing needs a brain. In the demo there is none.');
    if (M === 'GET' && (sub === 'preview' || sub === 'export' || sub === 'draft')) return no(404, 'the demo shows the draft in the preview');
    return no(404, NOPE);
  }

  // ---------- project sense (app/ui/sense.js): a few of server/sense.js's templates, picked from the name and bio ----------
  function senseMock(p, e) {
    const text = `${p.name} ${p.bio || ''} ${((db.tasks || {})[p.id] || []).map(t => t.title).join(' ')}`.toLowerCase();
    const has = re => re.test(text);
    const sensed = has(/\b3d\b|tavern|three\.?js/) ? '3d' : has(/game|platformer|level|jump|quest/) ? 'game' : has(/site|landing|page|portfolio|pricing/) ? 'site' : has(/app|mobile|screen/) ? 'app' : 'other';
    const kind = e.override || sensed;
    const NOUN = { game: 'game', '3d': '3D scene', app: 'app', site: 'website', tool: 'tool', bot: 'bot', api: 'API', notes: 'notes', other: 'project' };
    const tags = [has(/platformer|jump/) && 'platformer', has(/cozy|candle|hearth|warm/) && 'cozy', has(/pixel|sprite/) && 'pixel art', has(/multiplayer|co-?op|crew/) && 'multiplayer'].filter(Boolean).slice(0, 3);
    const L = {
      game: [{ id: 'game-title', type: 'task', emoji: '📝', title: 'Add a title screen', text: 'Name, a "Press start" and the controls. It makes it feel like a real game.', task: 'Add a title screen' },
        { id: 'plat-coyote', type: 'idea', emoji: '🦘', title: 'Coyote time and jump buffering', text: 'Let a jump work a few frames after leaving a ledge. It feels fair.', task: 'Add coyote time and jump buffering' },
        { id: 'pal-cozy', type: 'palette', emoji: '🎨', title: 'Palette: Campfire cozy', text: 'Flat colors that fit. Use them as CSS variables so agents keep to them.', colors: ['#3E4A3D', '#8FB996', '#E8C9A0', '#C97C5D', '#F4EBD9'], task: 'Set up the campfire cozy palette' },
        { id: 'cozy-ref', type: 'reference', emoji: '👀', title: 'Look at: Stardew Valley, A Short Hike', text: 'Slow pace, warm colors, nothing punishes you for wandering.' },
        { id: 'plat-checkpoints', type: 'idea', emoji: '🚩', title: 'Checkpoints', text: 'A flag mid-level so a fall costs ten seconds, not the whole run.', task: 'Add checkpoints' }],
      '3d': [{ id: '3d-orbit', type: 'task', emoji: '📝', title: 'Add orbit controls and a ground plane', text: 'So everyone can look around the scene from the first version.', task: 'Add orbit controls and a ground plane' },
        { id: '3d-light', type: 'idea', emoji: '💡', title: 'One warm light, one cool fill', text: 'Two lights make a scene read as 3D. Add soft fog for depth.', task: 'Light the scene: warm key, cool fill, fog' },
        { id: 'cozy-sound', type: 'idea', emoji: '🎶', title: 'Soft ambient sound', text: 'A quiet loop (fire, rain) with a mute button. Cozy is half sound.', task: 'Soft ambient sound' }],
      site: [{ id: 'site-hero', type: 'task', emoji: '📝', title: 'Write the hero headline and one call to action', text: 'Short, specific, one button.', task: 'Write the hero headline and one call to action' },
        { id: 'site-meta', type: 'idea', emoji: '🔗', title: 'Share previews', text: 'A title, description and image for link previews.', task: 'Add share previews' },
        { id: 'pal-site', type: 'palette', emoji: '🎨', title: 'Palette: Clean paper', text: 'Flat colors that fit.', colors: ['#FFFFFF', '#111827', '#6B7280', '#2563EB', '#F3F4F6'], task: 'Set up the clean paper palette' }],
      app: [{ id: 'app-screens', type: 'task', emoji: '📝', title: 'Sketch the first three screens', text: 'Home, the main thing, settings.', task: 'Sketch the first three screens' },
        { id: 'app-offline', type: 'idea', emoji: '📶', title: 'Works offline', text: 'Keep the last data so it opens instantly with no signal.', task: 'Make it open offline' }],
      other: [{ id: 'any-vision', type: 'idea', emoji: '🧭', title: 'Write the vision in three lines', text: 'Who it is for, what it does, what it will never do.', task: 'Write the vision in three lines' }],
    };
    const desc = tags.filter(t => t !== 'multiplayer').slice(0, 2).join(', ');
    return { kind, label: NOUN[kind] || 'project', preview: { game: 'Preview game', '3d': 'Preview 3D scene', site: 'Preview site', app: 'Preview app' }[kind] || 'Preview', tags,
      audience: kind === 'site' ? 'visitors' : kind === 'app' ? 'everyday users' : 'players', tone: tags.includes('cozy') ? 'cozy and warm' : 'friendly',
      summary: kind === 'other' ? `${p.name}: still taking shape. Talk about it in chat and this fills in.` : `${p.name} looks like a ${desc ? desc + ' ' : ''}${NOUN[kind]} for ${kind === 'site' ? 'visitors' : kind === 'app' ? 'everyday users' : 'players'}.`,
      confidence: kind === 'other' ? 0 : 0.8, by: e.override ? 'host' : 'words', override: e.override, notes: e.notes, canEdit: true,
      kinds: ['game', '3d', 'app', 'site', 'tool', 'bot', 'api', 'notes'].map(id => ({ id, label: NOUN[id] })),
      signals: p.bio ? [{ from: 'bio', text: p.bio.slice(0, 90) }] : [], inspiration: (L[kind] || L.other).filter(x => !e.gone.includes(x.id)) };
  }
  async function route(method, path, q, body, headers) {
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent), [a, b, c] = parts;
    for (const h of hooks.route) { const r = h(method, parts, q, body, headers); if (r) return r; }   // feat/demo-tour
    const pid = (headers['x-project'] && proj(headers['x-project'])) ? headers['x-project'] : cur();
    const GET = method === 'GET', POST = method === 'POST', PUT = method === 'PUT', PATCH = method === 'PATCH', DEL = method === 'DELETE';
    switch (a) {
      case 'health': return ok({ ok: true, version: hello().version, tribe: db.tribe.name, members: db.members.length, lan: [], site: null, offlineDemo: true });
      case 'guide': return ok({ pages: [] });
      case 'me': if (GET && !b) return ok({ member: presence().find(m => m.id === 'me') });
        if (PATCH && !b) { const m = me(); if (body.name) m.name = String(body.name).slice(0, 32); if (body.color) m.color = String(body.color); save(); pushPresence(); return ok({ member: m }); } break;
      case 'projects': {
        if (!b && GET) return ok({ projects: projects(), current: cur() });
        if (!b && POST) {
          if (body.path || body.url || body.files) return no(400, 'Folders and repos are ' + NOPE.toLowerCase() + '. Start an empty project instead.');
          const name = String(body.name || 'New project').slice(0, 48); let id = slugify(name), n = 2; while (proj(id)) id = `${slugify(name)}-${n++}`;
          const p = { id, name, emoji: body.emoji || '', image: null, bio: '', color: ['#38C6B1', '#6C7CFF', '#FFB86B', '#FF6F8E'][db.projects.length % 4], channel: 'p-' + id, default: false, created: iso(), members: { me: 'host', maya: 'builder' } };
          db.projects.push(p); db.tasks[id] = []; db.docs[id] = []; db.chat[id] = []; db.gists[id] = []; save();
          post(id, 'tribecode', `${me().name} started **${name}**`);
          push({ type: 'projects' }); pushHub(); return ok({ project: view(p) });
        }
        const p = proj(b); if (!p) return no(404, 'project not found');
        if (!c && PATCH) { for (const k of ['name', 'emoji', 'color', 'bio']) if (typeof body[k] === 'string' && body[k] !== '') p[k] = body[k].slice(0, k === 'bio' ? 400 : 48); if (body.image !== undefined) p.image = body.image || null; save(); push({ type: 'projects' }); pushHub(); return ok({ project: view(p) }); }
        if (!c && DEL) {
          if (p.default) return no(400, 'the first project stays: rename it instead');
          if (String(body.confirm || '') !== p.name) return no(400, 'type the project name to confirm');
          db.projects = db.projects.filter(x => x !== p); if (db.current === p.id) db.current = db.projects[0].id; save();
          push({ type: 'projects' }); push({ type: 'project-removed', id: p.id }); pushHub(); return ok({ ok: true, removed: p.id });
        }
        if (c === 'pulse' && GET) return ok(pulse(p.id));
        if (c === 'requests' && GET) return ok({ approvals: (db.approvals || []).filter(x => x.status === 'pending'), changes: [], proposals: [] });
        if (c === 'widgets') {   // app/ui/widgets.js: extra sidebar rows (none to start)
          db.widgets = db.widgets || {};
          if (PUT && Array.isArray(body.widgets)) { db.widgets[p.id] = body.widgets.slice(0, 24); save(); push({ type: 'widgets', project: p.id }); }
          if (GET || PUT) return ok({ widgets: db.widgets[p.id] || [], canEdit: true, preview: { show: false, label: '' }, website: { show: false } });
        }
        if (c === 'website') return siteMock(p, parts[3], parts[4], method, body || {});   // feat/site-builder
        if (c === 'sense') {   // app/ui/sense.js: what the project is + the Inspiration card (server/sense.js, simplified)
          db.sense = db.sense || {}; const e = db.sense[p.id] = db.sense[p.id] || { override: '', notes: true, gone: [] };
          if (PUT) { if (body.kind !== undefined) e.override = String(body.kind || ''); if (body.notes !== undefined) e.notes = !!body.notes; save(); push({ type: 'sense', project: p.id }); }
          if (POST && parts[3] === 'dismiss') { e.gone.push(String(body.id || '')); save(); }
          if (GET || PUT || POST) return ok(senseMock(p, e));
        }
        if (c === 'workspace' && GET) return ok({ repo: null, github: { installed: false, signedIn: false, user: null }, branch: null, identity: { name: me().name, email: '', custom: false, hasToken: false } });
        break;
      }
      case 'chat': {
        if (!b) break;
        const chPid = b === 'general' ? pid : (db.projects.find(p => p.channel === b) || {}).id;
        if (!chPid) return no(404, 'Direct messages are ' + NOPE.toLowerCase());
        if (!c && GET) { const lim = Math.min(Number(q.get('limit')) || 100, 500), before = q.get('before'); let list = db.chat[chPid] || []; if (before) { const i = list.findIndex(m => m.id === before); list = i >= 0 ? list.slice(0, i) : []; } return ok({ messages: list.slice(-lim) }); }
        if ((!c && POST) || (c === 'send' && POST)) { const text = String(body.text || '').trim(); if (!text) return no(400, 'empty message'); const msg = post(chPid, 'me', text); onChat(chPid, text); return ok({ message: msg }); }
        if (c === 'pins' && GET) return ok({ pins: [] });
        if (c === 'receipt' && GET) return ok({ receipts: {} });
        break;
      }
      case 'ship': {   // feat/ship-flow: Ready to ship in the demo (pretend saved changes; "shipping" stays in this browser)
        const S = db.ship = db.ship || {}; const sp = S[pid] = S[pid] || { mode: 'host', turbo: { on: false, quietMin: 10, maxPerHour: 4 }, current: null, log: [], lastShip: null };
        const MT = { host: 'The host decides', majority: 'More than half of the people decide', everyone: 'Everyone has to say yes' };
        const agent = db.members.find(m => m.role === 'agent');
        const since = sp.lastShip ? Date.parse(sp.lastShip.at) : 0;
        const doneT = (db.tasks[pid] || []).filter(x => (x.status === 'done' || x.status === 'review') && Date.parse(x.updated) > since);
        const seed = sp.lastShip ? [] : [['Add the title screen', agent ? agent.id : 'maya'], ['Tune the jump so it feels snappy', 'jay'], ['Draw the lantern sprite', 'maya']];
        const commits = [...doneT.slice(-4).map(x => [`Finish: ${x.title}`, x.assignee || 'maya']), ...seed].map(([subject, who], i) => ({ sha: 'demo' + i, short: ('d' + (7300 + i * 37).toString(16)).slice(0, 7), author: nameOf(who), subject, at: iso(Date.now() - (i + 1) * 9 * 60e3), kind: (db.members.find(m => m.id === who) || {}).role === 'agent' ? 'agent' : 'person' }));
        const people = []; for (const c2 of commits) { const w = people.find(x => x.name === c2.author); if (w) w.count++; else people.push({ name: c2.author, kind: c2.kind, owner: c2.kind === 'agent' ? me().name : null, count: 1 }); }
        const files = commits.length ? ['src/scenes/title.js', 'src/player/jump.js', 'assets/lantern.png'].slice(0, Math.min(3, commits.length)) : [];
        const humans = db.members.filter(m => m.role !== 'agent' && m.role !== 'spectator');
        const voters = rq => (rq.mode === 'host' ? humans.filter(m => m.role === 'host') : humans);
        const tally = rq => { const v = voters(rq).map(m => m.id), yes = v.filter(x => rq.votes[x] && rq.votes[x].v === 'yes').length, no = v.filter(x => rq.votes[x] && rq.votes[x].v === 'no').length, n = v.length || 1;
          return { voters: v.length, yes, no, needed: rq.mode === 'host' ? 1 : rq.mode === 'majority' ? Math.floor(n / 2) + 1 : n, waitingOn: v.filter(x => !rq.votes[x]).map(nameOf) }; };
        const view = rq => rq && ({ ...rq, byName: nameOf(rq.by), tally: tally(rq), modeText: MT[rq.mode], votes: Object.entries(rq.votes).map(([id, x]) => ({ id, name: nameOf(id), ...x })), comments: rq.comments.map(x => ({ ...x, byName: nameOf(x.by) })) });
        const shipNow = (kind) => { const n = commits.length; sp.lastShip = { sha: 'demo', at: iso(), kind, count: n }; sp.log.unshift({ at: iso(), kind, text: `${kind === 'turbo' ? '⚡ Turbo shipped' : '🚀 Shipped'} ${n} saved change${n === 1 ? '' : 's'} to GitHub (pretend)`, count: n }); post(pid, 'tribecode', `🚀 Shipped ${n} saved change${n === 1 ? '' : 's'} to GitHub. (In the demo nothing leaves your browser.)`); };
        const evaluate = () => { const rq = sp.current; if (!rq || rq.status !== 'pending') return; const t2 = tally(rq);
          if (t2.yes >= t2.needed) { rq.status = 'shipped'; shipNow('ship'); } else if (rq.mode === 'host' ? t2.no >= 1 : rq.mode === 'majority' ? t2.no > t2.voters - t2.needed : t2.no >= 1) { rq.status = 'denied'; post(pid, 'tribecode', '⛔ Not shipping yet.'); } };
        const overview = () => ({ enabled: true, demo: true, branch: 'main', mode: sp.mode, modeText: MT[sp.mode], turbo: sp.turbo, log: sp.log.slice(0, 12), lastShip: sp.lastShip, request: view(sp.current),
          commits, count: commits.length, files, fileCount: files.length, stat: commits.length ? `${files.length} files changed, ${commits.length * 23} insertions(+), ${commits.length * 4} deletions(-)` : '', people,
          tasks: doneT.slice(-5).reverse().map(x => ({ id: x.id, title: x.title, status: x.status, who: x.assignee ? nameOf(x.assignee) : null, agent: !!(agent && x.assignee === agent.id) })), waiting: [],
          hasRemote: true, remote: { url: 'https://github.com/you/lantern-run', github: 'you/lantern-run', link: 'https://github.com/you/lantern-run' },
          canShip: commits.length > 0, blocker: commits.length ? '' : 'Everything is on GitHub. Nothing new to ship.' });
        const done = () => { save(); push({ type: 'ship', project: pid }); };
        if (!b && GET) return ok(overview());
        if (b === 'share' && GET) { const ts = db.tasks[pid] || [], p = proj(pid) || {};
          const text = [`${p.emoji || '🔥'} ${p.name} on TribeCode`, `✅ ${ts.filter(x => x.status === 'done').length} done · 🛠️ ${ts.filter(x => x.status === 'doing' || x.status === 'review').length} in progress · 📋 ${ts.filter(x => x.status === 'backlog').length} to do`, '', 'Up next:', ...ts.filter(x => x.status !== 'done').slice(0, 3).map(x => `• ${x.title}`), '', 'Code: https://github.com/you/lantern-run (pretend)'].join('\n');
          return ok({ text, repoUrl: 'https://github.com/you/lantern-run', counts: {} }); }
        if (b === 'pulse' && GET) { const lines = (db.tasks[pid] || []).filter(x => x.status === 'doing' && x.assignee).map(x => ({ kind: 'agent', text: `${(db.members.find(m => m.id === x.assignee) || {}).role === 'agent' ? '🤖' : '🧑'} ${nameOf(x.assignee)} is working on “${x.title}”` }));
          if (sp.current && sp.current.status === 'pending') lines.push({ kind: 'ship', text: `🚀 ${sp.current.count} saved changes waiting to ship` }); return ok({ lines }); }
        if (b === 'settings' && (PUT || PATCH)) { if (MT[body.mode]) sp.mode = body.mode; if (body.turbo && typeof body.turbo.on === 'boolean') { sp.turbo.on = body.turbo.on; sp.turbo.state = body.turbo.on ? 'Watching for a calm moment.' : ''; post(pid, 'tribecode', body.turbo.on ? `⚡ ${me().name} turned on Turbo.` : `${me().name} turned off Turbo.`); if (body.turbo.on && commits.length) later(2500, () => { if (sp.turbo.on && !(sp.current && sp.current.status === 'pending')) { shipNow('turbo'); sp.turbo.state = 'Shipped. Watching for the next calm moment.'; done(); } }); } done(); return ok({ mode: sp.mode, modeText: MT[sp.mode], turbo: sp.turbo }); }
        if (b === 'request' && POST) { if (sp.current && sp.current.status === 'pending') return no(409, 'A ship request is already waiting.'); if (!commits.length) return no(400, 'Nothing new to ship.');
          const rq = sp.current = { id: 'sh-' + rid(5), by: 'me', at: iso(), note: String(body.note || '').slice(0, 600), short: 'd7300ab', count: commits.length, fileCount: files.length, mode: sp.mode, status: 'pending', votes: { me: { v: 'yes', at: iso(), comment: '' } }, comments: body.note ? [{ by: 'me', at: iso(), text: String(body.note).slice(0, 600) }] : [] };
          post(pid, 'tribecode', `🚀 ${me().name} wants to ship ${rq.count} saved changes to GitHub. ${MT[rq.mode]}.`);
          evaluate();
          if (rq.status === 'pending') later(2200, () => { if (sp.current === rq && rq.status === 'pending') { rq.votes.maya = { v: 'yes', at: iso(), comment: 'Looks good 👍', from: 'phone' }; post(pid, 'maya', 'Voted yes from my phone 👍'); evaluate(); done(); } });
          done(); return ok({ request: view(rq) }); }
        if (b && c === 'vote' && POST) { const rq = sp.current; if (!rq || rq.id !== b || rq.status !== 'pending') return no(404, 'That ship request is gone.'); rq.votes.me = { v: body.vote === 'no' ? 'no' : 'yes', at: iso(), comment: String(body.comment || '').slice(0, 300) }; evaluate(); done(); return ok({ request: view(rq) }); }
        if (b && c === 'cancel' && POST) { const rq = sp.current; if (rq && rq.id === b) rq.status = 'cancelled'; done(); return ok({ request: view(rq) }); }
        if (b && c === 'comment' && POST) { const rq = sp.current; if (!rq || rq.id !== b) return no(404, 'gone'); rq.comments.push({ by: 'me', at: iso(), text: String(body.text || '').slice(0, 500) }); done(); return ok({ request: view(rq) }); }
        if (b === 'turbo' && c === 'run' && POST) return ok({ shipped: false, reason: 'In the demo, Turbo ships a moment after you turn it on.' });
        break;
      }
      case 'tasks': {
        const list = db.tasks[pid] = db.tasks[pid] || [];
        if (!b && GET) return ok({ tasks: list });
        if (!b && POST) { const t = addTask(pid, { ...body, by: 'me' }); if (!body.assignee) pickUp(pid, t.id); return ok({ task: t }); }
        const t = list.find(x => x.id === b); if (!t) return no(404, 'task not found');
        if (c === 'split' && POST) {   // feat/ship-flow: a task becomes smaller ones (rules, like the server's basic fallback)
          const base = t.title.replace(/^\[[^\]]*\]\s*/, '').trim(), bits = base.split(/\s*(?:,|;|\band then\b|\bthen\b|\band\b|\+)\s*/i).map(x => x.trim()).filter(x => x.length > 2);
          const titles = bits.length >= 2 ? bits.slice(0, 5).map(x => x[0].toUpperCase() + x.slice(1)) : [`Sketch how “${base}” should work`, `Build a first small version of “${base}”`, `Try “${base}” and fix what feels off`];
          const made = titles.map(title => addTask(pid, { title, by: 'me', body: `Part of: ${t.title} (${t.id})` }));
          post(pid, 'tribecode', `✂️ ${me().name} split “${t.title}” into ${made.length} smaller tasks.`);
          return ok({ tasks: made.map(x => ({ id: x.id, title: x.title })), by: 'rules' });
        }
        if (PATCH) {
          if (body.title !== undefined) t.title = String(body.title).slice(0, 200) || t.title;
          if (body.status !== undefined) { if (!['backlog', 'doing', 'review', 'done'].includes(body.status)) return no(400, 'bad status'); t.status = body.status; }
          if (body.assignee !== undefined) t.assignee = body.assignee && db.members.some(x => x.id === body.assignee) ? body.assignee : null;
          if (body.order !== undefined && Number.isFinite(Number(body.order))) t.order = Number(body.order);
          if (body.body !== undefined) t.body = String(body.body).slice(0, 20000);
          if (body.due !== undefined) t.due = body.due || null;
          t.updated = iso(); t.updatedBy = 'me'; save(); push({ type: 'task', task: t }); return ok({ task: t });
        }
        if (DEL) { db.tasks[pid] = list.filter(x => x !== t); save(); push({ type: 'task-removed', id: t.id }); return ok({ ok: true }); }
        break;
      }
      case 'docs': {
        const list = db.docs[pid] = db.docs[pid] || [];
        if (!b && GET) return ok({ docs: list.map(docMeta).sort((x, y) => String(y.updated).localeCompare(String(x.updated))) });
        if (!b && POST) {
          const title = String(body.title || 'Untitled').slice(0, 120); let s = slugify(title), n = 2; while (list.some(d => d.slug === s)) s = `${slugify(title)}-${n++}`;
          const now = iso(), d = { slug: s, title, by: 'me', created: now, updated: now, updatedBy: 'me', version: 1, project: pid, body: String(body.body || '').slice(0, 400000) };
          list.push(d); save(); push({ type: 'doc', doc: { slug: s, title, version: 1, updated: now, updatedBy: 'me' } }); return ok({ doc: { ...d, summary: '' } });
        }
        const d = list.find(x => x.slug === b); if (!d) return no(404, 'doc not found');
        if (!c && GET) { const s = sessions.get(b); return ok({ doc: { ...d, body: s ? s.text : d.body, summary: '' } }); }
        if (!c && PUT) {
          if (!body.force && body.baseVersion !== undefined && Number(body.baseVersion) !== Number(d.version)) return [409, { error: 'conflict', doc: { ...d, summary: '' } }];
          if (body.title !== undefined) d.title = String(body.title).slice(0, 120) || d.title;
          if (typeof body.body === 'string') d.body = body.body.slice(0, 400000);
          d.version = (d.version || 1) + 1; d.updated = iso(); d.updatedBy = 'me'; save();
          push({ type: 'doc', doc: { slug: d.slug, title: d.title, version: d.version, updated: d.updated, updatedBy: 'me' } }); return ok({ doc: { ...d, summary: '' } });
        }
        if (!c && DEL) { db.docs[pid] = list.filter(x => x !== d); sessions.delete(b); save(); push({ type: 'doc-removed', slug: b }); return ok({ ok: true }); }
        if (c === 'comments' && GET) return ok({ comments: [], threads: [] });   // docsx.js reads threads
        if (c === 'backlinks' && GET) return ok({ backlinks: [] });
        if (c === 'history' && GET && !parts[3]) return ok({ history: [] });
        if (c === 'meta' && (PUT || POST || PATCH)) { if (body.pinned !== undefined) d.pinned = !!body.pinned; save(); return ok({ meta: { pinned: !!d.pinned } }); }
        break;
      }
      case 'templates': return ok({ templates: [] });
      case 'vision': if (GET) return ok({ text: db.vision[pid] || '' }); if (PUT) { db.vision[pid] = String(body.text || '').slice(0, 20000); save(); post(pid, 'tribecode', 'VISION.md was updated'); return ok({ ok: true }); } break;
      case 'proposals': {   // the approval board (board.js): showcase.js seeds one and votes on it
        const list = (db.proposals = db.proposals || {})[pid] = db.proposals[pid] || [];
        if (GET && !b) return ok({ proposals: list.map(x => ({ ...x, tally: tally(x) })) });
        const pr = list.find(x => x.id === b); if (!pr) break;
        if (POST && c === 'vote') { vote(pid, pr, 'me', body.vote === 'no' ? 'no' : 'yes'); return ok({ proposal: { ...pr, tally: tally(pr) } }); }
        if (POST && c === 'comment') { const t = String(body.text || '').trim().slice(0, 1000); if (!t) return no(400, 'say something'); pr.comments = [...(pr.comments || []), { by: 'me', text: t, at: iso() }]; save(); return ok({ proposal: { ...pr, tally: tally(pr) } }); }
        break;
      }
      case 'milestones': if (GET && !b) { const ms = ((db.milestones || {})[pid] || []); return ok({ milestones: ms, next: nextVersion(ms), repo: false }); }
        if (POST && c === 'release') { const m = ((db.milestones || {})[pid] || []).find(x => x.version === b); if (!m) return no(404, 'milestone not found'); m.status = 'released'; m.released = iso(); save(); push({ type: 'milestones', milestones: db.milestones[pid] }); return ok({ milestone: m, tagged: false, pushed: false, note: 'Released in the demo (no real git tag).' }); }
        break;
      case 'scratch': {
        if (!b && GET) return ok({ notes: db.scratch.slice() });
        if (!b && (PUT || POST)) return ok({ notes: scratchPut(body.notes) });
        const n = db.scratch.find(x => x.id === b);
        if (b && !c && DEL) { db.scratch = db.scratch.filter(x => x !== n); save(); return ok({ notes: db.scratch }); }
        if (n && (c === 'move' || c === 'task') && POST) {
          const to = proj(body.project) ? body.project : pid; db.scratch = db.scratch.filter(x => x !== n); save();
          const [title, ...rest] = n.text.split('\n');
          if (c === 'task') return ok({ task: addTask(to, { title: title.replace(/^#+\s*/, '') || 'A note', body: rest.join('\n'), by: 'me' }), notes: db.scratch });
          const r = await route('POST', '/docs', q, { title: title.replace(/^#+\s*/, '') || 'A note', body: rest.join('\n') }, { 'x-project': to });
          return ok({ doc: r[1].doc, notes: db.scratch });
        }
        break;
      }
      case 'invites': {
        if (!b && POST) {
          const inv = { code: 'DEMO' + rid(4).toUpperCase(), by: 'me', role: body.role === 'spectator' ? 'spectator' : 'builder', maxUses: Number(body.maxUses) || 5, uses: 0, created: iso(), expires: iso(Date.now() + (Number(body.hours) || 24) * 3600e3), demo: true, ...(body.project && body.project !== 'tribe' ? { project: body.project } : {}) };
          db.invites.push(inv); save(); friendJoins(); noteInvite();
          return ok({ invite: inv });
        }
        if (!b && GET) return ok({ invites: db.invites });
        if (b && GET) { const inv = db.invites.find(i => i.code === b); return inv ? ok({ tribe: db.tribe.name, invitedBy: me().name, role: inv.role, expires: inv.expires, project: null, members: [] }) : no(404, 'invite not found'); }
        if (b && DEL) { db.invites = db.invites.filter(i => i.code !== b); save(); return ok({ ok: true }); }
        break;
      }
      case 'join': return no(410, 'This is a pretend link from the offline demo: it only works in the browser that made it.');
      case 'github': {   // a pretend GitHub sign-in, so the demo shows Connect GitHub end to end (nothing leaves the browser)
        const g = db.gh || (db.gh = { signedIn: false, login: null, polls: 0, state: 'none' });
        const view = () => ({ configured: true, source: 'tribecode', signedIn: g.signedIn, login: g.login, via: g.signedIn ? 'oauth' : null, flow: { state: g.state }, local: true, canConfigure: false, demo: true });
        if (GET && !b) return ok({ github: view() });
        if (b === 'device' && POST) { g.state = 'pending'; g.polls = 0; save(); return ok({ userCode: 'DEMO-2026', verificationUri: 'https://github.com/login/device', expiresAt: Date.now() + 900000, interval: 1 }); }
        if (b === 'device' && GET) { if (g.state === 'pending' && ++g.polls >= 2) { g.state = 'ok'; g.signedIn = true; g.login = (pfRaw('me') || {}).name ? String(pfRaw('me').name).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'you' : 'you'; } save(); return ok({ state: g.state, login: g.login }); }
        if (b === 'device' && DEL) { g.state = 'none'; save(); return ok({}); }
        if (b === 'signout' && POST) { Object.assign(g, { signedIn: false, login: null, state: 'none' }); save(); return ok({ github: view() }); }
        return no(400, 'not in the demo');
      }
      case 'profile': {
        if (GET && !b) return ok({ profile: pfFull('me'), palette: PF_COLORS, pixels: PF_PIXELS, notes: db.pfNotes || {}, muted: db.pfMuted || [], limits: { pronouns: 40, bio: 300, status: 80, link: 300, label: 32, nick: 32, note: 256 } });
        if ((PATCH || PUT) && !b) return ok({ profile: pfPatch('me', body || {}) });
        if (PATCH && b) { const ag = db.members.find(x => x.id === b && x.owner === 'me'); if (!ag) return no(403, 'not yours'); return ok({ profile: pfPatch(b, body || {}) }); }
        if (POST && (b === 'avatar' || b === 'banner')) { const img = String((body || {}).image || ''); if (!/^data:image\//.test(img)) return no(400, 'pick a picture'); const p = pfRaw(q.get && q.get('for') || 'me'); if (b === 'avatar') p.avatar = { kind: 'photo', file: img, still: (body.still || null), anim: /gif/.test(img) }; else p.banner = { image: img }; save(); pushPresence(); return ok({ profile: pfFull('me') }); }
        if (b && c === 'note' && PUT) { db.pfNotes = db.pfNotes || {}; db.pfNotes[b] = String((body || {}).text || '').slice(0, 256); save(); return ok({ note: db.pfNotes[b] }); }
        if (b && c === 'mute' && PUT) { const s2 = new Set(db.pfMuted || []); body.on ? s2.add(b) : s2.delete(b); db.pfMuted = [...s2]; save(); return ok({ muted: s2.has(b), list: db.pfMuted }); }
        if (b && !c && GET) { const m = db.members.find(x => x.id === b); if (!m) return no(404, 'no such person');
          const L = { host: 'Host', agent: 'Agent' };
          return ok({ member: { id: m.id, name: m.name, color: m.color, role: m.role, joined: m.joined, agent: m.role === 'agent', owner: m.owner || null, ownerName: m.owner ? (db.members.find(x => x.id === m.owner) || {}).name || null : null },
            profile: pfFull(m.id), badges: L[m.role] ? [{ id: m.role, label: L[m.role] }] : [], inCommon: (db.projects || []).slice(0, 6).map(p => ({ id: p.id, name: p.name, color: p.color || null, image: false })),
            agents: db.members.filter(x => x.role === 'agent' && x.owner === m.id).map(x => ({ id: x.id, name: x.name, kind: 'claude-code', label: null })), note: (db.pfNotes || {})[m.id] || '', muted: (db.pfMuted || []).includes(m.id), you: m.id === 'me', canEdit: m.id === 'me' || m.owner === 'me' }); }
        break;
      }
      case 'friends': if (GET) return ok({ friends: db.friends }); if (PUT) { const s = new Set(db.friends); body.on ? s.add(body.id) : s.delete(body.id); db.friends = [...s]; save(); return ok({ friends: db.friends }); } break;
      case 'uploads': {
        if (!b && GET) { const mine = db.uploads.filter(f => f.scope === 'me').slice().reverse(), project = db.uploads.filter(f => f.scope === 'project').slice().reverse(); return ok({ mine, project, max: MAX_UPLOAD }); }
        if (!b && POST) {
          const blob = body instanceof Blob ? body : new Blob([body || '']);
          if (!blob.size) return no(400, 'That file is empty.');
          if (blob.size > MAX_UPLOAD) return no(413, 'The offline demo keeps files up to 8 MB.');
          const name = String(q.get('name') || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120), scope = q.get('scope') === 'project' ? 'project' : 'me';
          const f = { id: 'u-' + rid(10), name, size: blob.size, type: blob.type || (KIND(name) === 'image' ? 'image/' + (name.split('.').pop().toLowerCase().replace('jpg', 'jpeg')) : 'application/octet-stream'), kind: KIND(name), by: 'me', byName: me().name, at: iso(), scope, ...(scope === 'project' ? { project: pid } : {}) };
          await blobPut(f.id, blob.type ? blob : new Blob([blob], { type: f.type })); db.uploads.push(f); save(); return ok({ file: f });
        }
        const f = db.uploads.find(x => x.id === b); if (!f) return no(404, 'file not found');
        if (c === 'raw' && GET) { const blob = await blobGet(f.id); return blob ? new Response(blob, { status: 200, headers: { 'Content-Type': f.type } }) : no(404, 'That file is gone from this browser.'); }
        if (!c && DEL) { db.uploads = db.uploads.filter(x => x !== f); await blobDel(f.id); save(); return ok({ ok: true }); }
        break;
      }
      case 'flint': if (GET && !b) return ok({ model: { online: false, model: '' } }); break;
      case 'llm': if (GET && !b) return ok({ provider: 'none', label: 'None (basic mode)', model: '', via: '', online: false, cloud: false, ready: false, friends: false, cap: 0, ollama: { online: false, model: '' }, you: { host: false, block: '', used: 0 } }); return no(403, 'The offline demo has no tribe brain: pick Built in to try a model in your browser.');   // feat/any-llm
      case 'hub': {
        if (!b && GET) return ok(hubData());
        if (b === 'prefs') { if (GET) return ok(db.prefs); db.prefs = { pins: Array.isArray(body.pins) ? body.pins.slice(0, 40) : db.prefs.pins }; save(); return ok(db.prefs); }
        if (b === 'docs' && GET) { const qq = String(q.get('q') || '').toLowerCase(); return ok({ docs: db.projects.flatMap(p => (db.docs[p.id] || []).filter(d => !qq || (d.title + ' ' + d.body).toLowerCase().includes(qq)).map(d => ({ project: p.id, projectName: p.name, color: p.color, slug: d.slug, title: d.title, at: d.updated, by: d.by, byName: nameOf(d.by), snippet: '', preview: String(d.body || '').replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 240) }))) }); }
        if (b === 'repos' && GET) return ok({ repos: [] });
        if (b === 'dismiss') return ok({ ok: true });
        break;
      }
      case 'insights': return ok({ items: [] });
      case 'gists': return ok({ gists: (db.gists[pid] || []).slice(0, Number(q.get('limit')) || 100) });
      case 'flow': if (GET && !b) return ok({ flow: null }); break;
      case 'approvals': {
        const list = db.approvals = db.approvals || [];
        if (GET && !b) return ok({ approvals: list, pending: list.filter(x => x.status === 'pending').length });
        if (GET && b === 'rules') return ok({ rules: [] });
        if (POST && b === 'bulk') { const out = list.filter(x => x.status === 'pending' && x.risk === 'low'); out.forEach(x => decide(x, 'approve', 'me', '')); return ok({ approved: out }); }
        const ap = list.find(x => x.id === b); if (!ap) break;
        if (GET && !c) return ok({ approval: ap });
        if (POST && (c === 'approve' || c === 'deny')) { if (ap.status !== 'pending') return no(409, 'already decided'); decide(ap, c, 'me', String(body.note || '').slice(0, 500)); return ok({ approval: ap }); }
        if (POST && c === 'question') { (ap.questions = ap.questions || []).push({ name: me().name, text: String(body.text || '').slice(0, 500) }); save(); return ok({ approval: ap }); }
        break;
      }
      case 'brain': if (GET) return ok({ brain: { online: false, model: '', error: 'No local model in the offline demo' } }); break;
      case 'calendar': if (GET) return ok(b === 'upcoming' ? { items: [] } : { events: [], items: [] }); break;
      case 'claims': if (GET) return ok({ claims: [] }); break;
      case 'coord':
        if (GET && b === 'summary') return ok({ reviews: 0, handoffs: 0, agents: 0 });
        if (GET && b === 'plan') return ok({ plan: { date: iso().slice(0, 10), focus: '', by: 'rules', items: [], crew: [] }, availability: null });
        if (GET && ['agents', 'reviews', 'handoffs', 'conflicts', 'ownership', 'delegations', 'asks'].includes(b)) return ok({ [b]: [] });
        if (POST && b === 'asks') return ok({ ask: { id: 'h-' + rid(6), title: String(body.text || 'A request').split('\n')[0].slice(0, 160), status: 'open', fromName: me().name, created: iso() } });   // feat/any-llm: the pretend Claude would pick it up
        break;
      case 'dms': if (GET) return ok({ conversations: [] }); break;
      case 'notify':
        if (GET && b === 'inbox') { const items = db.inbox || []; return ok({ items, unread: items.filter(i => !db.lastRead || i.at > db.lastRead).length, lastRead: db.lastRead || null, marks: db.marks || {} }); }
        if (GET && b === 'prefs') return ok({ prefs: {} });
        if (POST && b === 'read') { db.lastRead = iso(); db.marks = {}; save(); return ok({ ok: true }); }
        if (b === 'items' && c) { const it = (db.inbox || []).find(i => i.id === c); if (!it) break; if (GET) return ok({ item: it }); if (POST) { const mk = (db.marks = db.marks || {})[c] = { ...(db.marks[c] || {}), ...body }; save(); return ok({ mark: mk }); } }
        break;
      case 'people': if (GET && !b) return ok({ status: { startedAt: db.created, uptimeSec: 0, commitsToday: 0, commitsTotal: 0, repo: false } }); break;
      case 'shelf': if (GET && !b) return ok({ types: [], picks: [] }); break;
      case 'thumb': { const p = proj(pid); return ok({ thumb: { name: p.name, initials: p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(), color: p.color, kind: 'tile', at: db.created } }); }
      case 'visuals': if (GET && !b) return ok({ screens: [] }); break;
      case 'agents':
        if (b === 'mine' && GET) { const ag = presence().find(m => m.id === AGENT); return ok({ agent: ag, online: true, since: db.created, url: '', command: '', commands: { anywhere: null, wifi: null, here: null }, public: false, remove: '', agents: [{ ...ag, kind: 'claude-code', label: null, online: true }] }); }
        if (b === 'channel' && GET) return ok({ messages: [] });
        break;
      case 'bugs': if (GET && !b) return ok({ bugs: [] }); if (POST && !b) return ok({ bug: { id: 'b-' + rid(6), deduped: false } }); break;
      case 'ask': if (GET && !b) return ok({ policy: 'never' }); break;
      case 'assist': {   // app/ui/assist.js: the vision composer's basic draft and the game template's starter tasks
        const p = proj(pid), name = p.name;
        if (b === 'vision' && GET) return ok({ name, bio: p.bio, types: ['game'], kind: 'game', readme: '', docs: [], tasks: [], chat: '', questions: ASSIST_Q, vision: db.vision[pid] || '', model: { online: false, model: '' }, helpers: { claude: null, others: [] },
          answers: { what: p.bio ? `${name}: ${p.bio}` : `${name}: a small browser game we build together`, who: 'Friends who like short levels and silly bosses', fun: 'Quick to pick up, easy to share, a little bit silly', done: '3 levels, a boss and a score, playable in the browser', out: 'Online play and accounts (for now)' } });
        if (b === 'vision' && POST) { if ((body.helper || 'flint') !== 'flint') return no(); return ok({ draft: visionDraft(body.answers || {}), by: 'basic' }); }
        if (b === 'complete' && POST) return ok({ phrases: [] });
        if (b === 'tasks' && !c && GET) {
          const have = new Set((db.tasks[pid] || []).map(t => t.title.toLowerCase())), gone = new Set(db.dismissed || []);
          return ok({ model: { online: false }, suggestions: ASSIST_TASKS.filter(([t]) => !have.has(t.toLowerCase()) && !gone.has(t)).slice(0, q.get('more') ? 8 : 4).map(([title, why], i) => ({ id: 's-demo' + i, title, why, src: 'template' })) });
        }
        if (b === 'tasks' && c === 'dismiss' && POST) { (db.dismissed = db.dismissed || []).push(String(body.title || '')); save(); return ok({ ok: true }); }
        break;
      }
    }
    return no();
  }

  let lastNope = 0;
  const realFetch = window.fetch.bind(window);
  function ours(u) {
    if (!/^\/api\//.test(u.pathname)) return false;
    return u.origin === location.origin || u.origin === ORIGIN || u.origin === new URL(C() ? C().base() : location.origin, location.href).origin;
  }
  window.fetch = function (input, init) {
    if (!active()) return realFetch(input, init);
    let u; try { u = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href); } catch { return realFetch(input, init); }
    // Settings looks for Ollama on this device; the demo has no local model, so answer that quietly too.
    if (u.pathname === '/api/tags' && u.origin === new URL(S.get().brain.host || 'http://localhost:11434').origin) return Promise.resolve(new Response('{"models":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (!ours(u)) return realFetch(input, init);
    const req = input instanceof Request ? input : null, o = init || {};
    const method = String(o.method || (req && req.method) || 'GET').toUpperCase();
    const hdr = {}; new Headers(o.headers || (req && req.headers) || {}).forEach((v, k) => { hdr[k] = v; });
    return (async () => {
      let body = o.body;
      if (body === undefined && req && method !== 'GET') body = await req.blob();
      if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
      else if (body == null) body = {};
      let out;
      try { out = await route(method, u.pathname.replace(/^\/api/, ''), u.searchParams, body, hdr); }
      catch (e) { console.warn('offline demo:', e); out = [500, { error: 'The offline demo hit a snag: ' + (e && e.message || e) }]; }
      if (out instanceof Response) return out;
      const [status, data] = out;
      if (status === 404 && data.error === NOPE && method !== 'GET' && Date.now() - lastNope > 1500) { lastNope = Date.now(); setTimeout(() => toast('Not in the offline demo. Host for real to use it.'), 50); }
      return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    })();
  };

  // The invite modal: say plainly that the link is pretend.
  function noteInvite() {
    setTimeout(() => {
      const body = document.querySelector('#invite-modal:not(.hidden) #invite-body') || document.querySelector('.ii, #fl-instant');
      if (!body || body.querySelector('.od-note')) return;
      const n = document.createElement('p'); n.className = 'od-note';
      n.innerHTML = '<b>Pretend link.</b> The offline demo lives only in this browser, so nobody else can open it. A pretend friend will "join" in a few seconds. <button class="linkish" data-od="real">Host for real</button>';
      const foot = body.querySelector('.modal-foot'); foot ? foot.before(n) : body.appendChild(n);
    }, 120);
  }

  // ---------- start, leave, reset ----------
  function backup() {
    const st = S.get(), pk = 'tribecode.project:' + (C() ? C().base() : location.origin);
    let pkv = null; try { pkv = localStorage.getItem(pk); } catch {}
    return { server: { ...(st.server || {}) }, hosting: st.hosting, hostOff: st.hostOff, projKey: pk, projVal: pkv, at: iso() };
  }
  // start(): ask which demo (Explore quietly / Watch it come alive). start('quiet' | 'showcase') starts that one.
  function start(mode) {
    if (mode !== 'quiet' && mode !== 'showcase') return choose();
    closeChooser();
    if (active() && (db?.mode || 'quiet') === mode) { enterUi(); return; }
    const wasReal = !!(C() && C().hasToken()), wasDemo = active();
    if (!ls.get(BKEY)) ls.set(BKEY, backup());
    db = seed(mode); save(); blobClear();
    S.set({ server: { url: ORIGIN, token: TOKEN }, hosting: false });
    if (wasReal || wasDemo) { try { sessionStorage.setItem('tribecode.view', 'home'); } catch {} location.reload(); return; }
    paint(); C().connect();
    enterUi();
  }
  // Before tribe.js has loaded (showcase.js handles ?demo=showcase): set the demo up so the app boots straight into it.
  function boot(mode, fresh) {   // fresh: feat/demo-tour starts the tour from a new tribe
    if (!fresh && active() && (db?.mode || 'quiet') === mode) return;
    if (!ls.get(BKEY)) ls.set(BKEY, backup());
    db = seed(mode); save(); blobClear();
    S.set({ server: { url: ORIGIN, token: TOKEN }, hosting: false });
  }
  function choose() {
    if (active()) return enterUi();
    const modal = document.querySelector('#invite-modal'), body = document.querySelector('#invite-body'); if (!modal || !body) return start('quiet');
    modal.classList.remove('hidden');
    body.innerHTML = `<span class="eyebrow">Demo tribe · offline</span><h2>How do you want to try it?</h2>
      <div class="od-choice">
        <button class="od-opt" id="od-pick-alive" data-mode="showcase"><span class="od-tic"><svg class="i"><use href="#i-play"/></svg></span><span class="od-tt"><b>Watch it come alive</b><small>A busy pretend tribe runs by itself: friends chat, agents pick up tasks, a milestone ships. Join in any time.</small></span></button>
        <button class="od-opt" id="od-pick-quiet" data-mode="quiet"><span class="od-tic"><svg class="i"><use href="#i-zap"/></svg></span><span class="od-tt"><b>Explore quietly</b><small>Host a calm pretend tribe and try things yourself. Little happens until you act.</small></span></button>
      </div>
      <p class="faint od-fine">Both live only in this browser. Leaving puts your own settings back exactly.</p>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button></div>`;
    body.querySelector('[data-close]').onclick = closeChooser;
    body.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => start(b.dataset.mode));
  }
  function closeChooser() { const body = document.querySelector('#invite-body'); if (body && body.querySelector('.od-choice')) document.querySelector('#invite-modal').classList.add('hidden'); }
  function enterUi() {
    const go = () => { if (A() && A().show) A().show('home'); toast(db?.mode === 'showcase' ? `${db?.tribe?.name || 'Campfire Crew'} is live. Sit back and watch, or join in.` : `${db?.tribe?.name || 'Demo Tribe'} is ready. Nothing leaves this device.`); };
    if (C().connected()) return go();
    let n = 0; const wait = () => (C().connected() || ++n > 40 ? go() : setTimeout(wait, 50)); wait();
  }
  function restore() {
    const bk = ls.get(BKEY);
    if (bk) {
      S.set({ server: { url: (bk.server || {}).url || '', token: (bk.server || {}).token || '' }, hosting: bk.hosting, hostOff: bk.hostOff });
      try { if (bk.projVal == null) localStorage.removeItem(bk.projKey); else localStorage.setItem(bk.projKey, bk.projVal); } catch {}
    } else S.set({ server: { url: '', token: '' } });
    ls.del(BKEY);
  }
  function leave() {
    closePop(); for (const s of [...sockets]) s.close();
    restore(); ls.del(KEY); db = null; blobClear();
    try { sessionStorage.removeItem('tribecode.view'); } catch {}
    location.reload();
  }
  function reset() {
    closePop(); if (!active()) return;
    db = seed(db?.mode); save(); blobClear();
    try { sessionStorage.setItem('tribecode.view', 'home'); } catch {}
    location.reload();
  }
  // A demo whose token was replaced (you joined a real tribe meanwhile) is over: forget it, keep the new sign-in.
  if (db && db.on && (S.get().server || {}).token !== TOKEN) { ls.del(KEY); ls.del(BKEY); db = null; }

  // ---------- the pill (where the Hosting pill sits) and its popout ----------
  let pill = null, pop = null;
  function paint() {
    const on = active();
    document.body.classList.toggle('offline-demo', on);
    if (!on) { if (pill) pill.remove(); pill = null; return; }
    if (pill && pill.isConnected) return;
    pill = document.createElement('button'); pill.id = 'demo-pill'; pill.className = 'od-pill'; pill.setAttribute('aria-haspopup', 'dialog');
    const sc = db?.mode === 'showcase';
    if (sc) pill.classList.add('sc');
    pill.title = sc ? 'Showcase: a pretend tribe that runs by itself' : 'Offline demo: nothing leaves this device';
    pill.innerHTML = sc ? '<span class="od-dot" aria-hidden="true"></span><span class="od-l">Showcase</span><span class="od-s"> · pretend tribe</span><span class="sc-state" id="sc-pill-state"></span>'
      : '<span class="od-dot" aria-hidden="true"></span><span class="od-l">Offline demo</span><span class="od-s"> · nothing leaves this device</span>';
    place();
    pill.onclick = e => { e.stopPropagation(); pop ? closePop() : openPop(); };
  }
  // Desktop: in the title bar where the Hosting pill sits. Phones have no title bar outside Chat: the pill floats (offline.css).
  const phoneMq = matchMedia('(max-width: 820px)');
  function place() {
    if (!pill) return;
    const crumbs = document.querySelector('#crumbs');
    if (!phoneMq.matches && crumbs) { if (pill.nextElementSibling !== crumbs) crumbs.parentNode.insertBefore(pill, crumbs); }
    else if (pill.parentNode !== document.body) document.body.appendChild(pill);
  }
  phoneMq.addEventListener('change', () => { closePop(); place(); });
  function closePop() { if (pop) { pop.remove(); pop = null; if (pill) pill.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); } }
  const outside = e => { if (pop && !pop.contains(e.target) && !(pill && pill.contains(e.target))) closePop(); };
  function openPop() {
    closePop();
    if (db?.mode === 'showcase' && window.TribeShowcase) {
      pop = window.TribeShowcase.pop({ leave, close: closePop, quiet: () => { closePop(); db.mode = 'quiet'; save(); location.reload(); } });
      if (!pop) return;
      document.body.appendChild(pop); placePop(); return;
    }
    pop = document.createElement('div'); pop.className = 'od-pop'; pop.id = 'demo-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Offline demo');
    pop.innerHTML = `<header><span class="od-dot" aria-hidden="true"></span><div><span class="eyebrow">Offline demo</span><b>${esc(db.tribe.name)} lives in this browser</b></div></header>
      <p>You're the host of a pretend tribe: Maya, Jay and a pretend Claude answer you here. Nothing leaves this device, and it stays until you reset it.</p>
      <div class="od-acts">
        <button id="od-real" data-od="real"><svg class="i"><use href="#i-zap"/></svg><span>Host this for real</span></button>
        <button id="od-reset"><svg class="i"><use href="#i-refresh"/></svg><span>Reset demo</span></button>
        <button id="od-leave"><svg class="i"><use href="#i-x"/></svg><span>Leave demo</span></button>
      </div>`;
    document.body.appendChild(pop);
    pop.querySelector('#od-reset').onclick = reset;
    pop.querySelector('#od-leave').onclick = leave;
    placePop();
  }
  function placePop() {
    const r = pill.getBoundingClientRect();
    pop.style.top = (r.bottom + 8 + pop.offsetHeight > innerHeight ? Math.max(8, r.top - 8 - pop.offsetHeight) : r.bottom + 8) + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
    pill.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', outside, true), 0);
  }
  function hostForReal() {
    closePop();
    const modal = document.querySelector('#invite-modal'), body = document.querySelector('#invite-body'); if (!modal || !body) return;
    modal.classList.remove('hidden');
    body.innerHTML = `<span class="eyebrow">Host this for real</span><h2>A real tribe runs on a computer</h2>
      <ol class="od-steps">
        <li><b>On a PC or Mac:</b> install the TribeCode desktop app. It hosts your tribe by itself when you create your first project.</li>
        <li><b>Already have a computer running TribeCode?</b> Link it: open Settings there and send yourself a device link, or join it with an invite link.</li>
        <li><b>Then your phone joins</b> from anywhere with the link, and friends do too.</li>
      </ol>
      <p class="faint od-fine">Leaving the demo puts your own settings back exactly as they were. The demo itself stays in this browser only.</p>
      <div class="modal-foot"><button class="btn" data-close>Back to the demo</button><span style="flex:1"></span><button class="btn" id="od-join">Join with a link</button><a class="btn primary" id="od-get" href="${RELEASES}" target="_blank" rel="noopener">Get the desktop app</a></div>`;
    body.querySelector('[data-close]').onclick = () => modal.classList.add('hidden');
    body.querySelector('#od-join').onclick = () => { modal.classList.add('hidden'); if (active()) { restore(); ls.del(KEY); db = null; try { sessionStorage.setItem('tribecode.openJoin', '1'); } catch {} location.reload(); } else if (window.TribeSettings) window.TribeSettings.joinPrompt(); };
  }
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-od]'); if (!t) return;
    if (t.dataset.od === 'real') { e.preventDefault(); hostForReal(); }
    if (t.dataset.od === 'start') { e.preventDefault(); start(t.dataset.mode); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop) closePop(); });
  const ready = () => { paint(); try { if (sessionStorage.getItem('tribecode.openJoin')) { sessionStorage.removeItem('tribecode.openJoin'); setTimeout(() => window.TribeSettings && window.TribeSettings.joinPrompt(), 400); } } catch {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

  window.TribeOffline = {
    active, start, choose, boot, leave, reset, hostForReal,
    socket: url => new FakeSocket(url),
    state: () => db,
    mode: () => (active() ? db?.mode || 'quiet' : null),
    // for showcase.js: the same building blocks the pretend people above use
    _k: { db: () => db, save, push, post, addTask, presence, pushPresence, pushHub, nameOf, cur, proj, iso, rid, vote, decide, notify, tally, hooks, toast, peerEdit, liveText, pickUp, closePop: () => closePop(), placePop: () => pop && placePop() },
    // A button for Home, the phone sheets, Settings and Help: "Try a demo tribe (offline)" or, while in it, "Leave".
    label: () => (active() ? 'Leave the offline demo' : 'Try a demo tribe (offline)'),
    toggle: () => (active() ? leave() : start()),
    tile: () => `<button class="od-tile" id="hub-demo" data-od="start"><span class="od-tic"><svg class="i"><use href="#i-play"/></svg></span><span class="od-tt"><b>Try a demo tribe (offline)</b><small>Be the host of a pretend tribe right here: a project, two friends and a Claude. No setup, no network, nothing leaves this device.</small></span><em class="gs-go">Start demo<svg class="i"><use href="#i-chev"/></svg></em></button>`,
  };
})();
