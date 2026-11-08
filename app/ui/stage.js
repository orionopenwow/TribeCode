// How far along the current project is, so the room panel and Flint can start simple and grow with the tribe.
//   new      nothing yet (no vision, no task): the panel shows just people and Flint's nudges
//   growing  something has started (a vision or a task): notes and Connect your AI appear
//   going    3 of the 4 setup steps done (vision, task, AI, repo): everything shows, the Task Board gets its tabs
// body[data-vision] says whether the vision exists (the sidebar's "+ Add" waits for it).
// projects.js reports the checklist after each Dashboard render; elsewhere we read /pulse once per project.
(function () {
  'use strict';
  const C = window.TribeClient;
  const pid = () => (window.TribeProjects && window.TribeProjects.current()) || '';
  const by = {};   // project id -> { vision, task, agent, repo }
  const KEYS = ['vision', 'task', 'agent', 'repo'];   // feat/setup-flow: the four setup steps (a friend joining is no longer one)
  let cur = null;
  function level(s) {
    if (!s) return 'going';   // unknown: show everything, as before
    const n = KEYS.filter(k => s[k]).length;
    if (!s.vision && !s.task) return 'new';
    return n >= 3 ? 'going' : 'growing';
  }
  function apply() {
    const s = by[pid()], lv = level(s);
    if (document.body.dataset.stage !== lv) document.body.dataset.stage = lv;
    const vs = s ? (s.vision ? '1' : '0') : '1';
    if (document.body.dataset.vision !== vs) document.body.dataset.vision = vs;
    const rs = s ? (s.repo ? '1' : '0') : '1';   // qa-pass: a project that already has code keeps its Repo tab (shell.js gated)
    if (document.body.dataset.repo !== rs) document.body.dataset.repo = rs;
    const key = JSON.stringify([pid(), s]);
    if (key !== cur) { cur = key; try { window.dispatchEvent(new CustomEvent('tribe:stage', { detail: { level: lv, steps: s || null } })); } catch {} }
  }
  const pinned = {};   // set(id, steps, { pin: true }) keeps a stage until the page reloads (tests, demos)
  function set(id, steps, o) { if (pinned[id] && !(o && o.pin)) return; by[id] = steps; if (o && o.pin) pinned[id] = 1; apply(); drawNext(); }

  // Next steps: big cards at the top of the right panel while a project is new or growing.
  // Clicking one runs the step, and Flint flies over to show where it happens.
  const NEXT = {
    vision: ['✨', 'Write the vision', 'What you’re making and who it’s for.', 'vision'],
    task: ['📝', 'Add a first task', 'One small thing to build first.', 'newtask'],
    agent: ['🤖', 'Connect your AI', 'Claude Code, Codex, Gemini or Cursor.', 'claude'],
    repo: ['🌿', 'Create the repo', 'The shared folder for your code, in one click.', 'repo'],
  };
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function drawNext() {
    const pane = document.getElementById('room-pane'); if (!pane) return;
    let box = document.getElementById('room-next');
    // qa-qol-2: on the Dashboard the Camp setup card already lists these same steps: no second copy in the panel
    const camp = document.body.dataset.view === 'home' && !!document.querySelector('#view-home:not(.hidden) #pj-check.hero');
    const s = by[pid()], lv = level(s), show = s && lv !== 'going' && !camp && !document.body.classList.contains('global');
    if (!show) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('section'); box.id = 'room-next'; box.className = 'room-next'; const head = pane.querySelector(':scope > .room-head'); if (head) head.after(box); else pane.prepend(box); }   // qa-qol-2: under the head, so its × sits on the cards' row (it floated alone below them)
    const todo = KEYS.filter(k => !s[k]);
    const n = 4 - todo.length;
    box.innerHTML = `<div class="rn-head"><span class="eyebrow">Next steps</span><span class="rn-n">${n} of 4 done</span></div>
      ${todo.map((k, i) => `<button class="rn-card ${i === 0 ? 'first' : ''}" data-rn="${NEXT[k][3]}"><span class="rn-e" aria-hidden="true">${NEXT[k][0]}</span><span class="rn-t"><b>${esc(NEXT[k][1])}</b><small>${esc(NEXT[k][2])}</small></span></button>`).join('')}`;
    box.querySelectorAll('[data-rn]').forEach(b => b.onclick = () => window.TribeProjects && window.TribeProjects.step(b.dataset.rn));
  }
  window.addEventListener('tribe:stage', drawNext);
  new MutationObserver(() => drawNext()).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-view'] });
  let busy = false;
  async function load() {
    const id = pid(); if (!id || !C || !C.connected() || busy || pinned[id]) return apply();
    busy = true;
    try {
      const d = await C.api(`/projects/${encodeURIComponent(id)}/pulse`);
      const meId = (C.state().me || {}).id, members = C.state().members || [];
      by[id] = { vision: !!(d.vision && d.vision.has), task: (d.taskCount || 0) > 0, friend: (d.team || []).some(m => m.kind !== 'agent' && m.id !== meId),
        agent: (d.agents || []).length > 0 || members.some(m => m.role === 'agent' && m.owner === meId), repo: !!(d.repo || ((window.TribeProjects && window.TribeProjects.cur()) || {}).hasRepo) };
    } catch {}
    busy = false; apply();
  }
  let t = null; const soon = (ms = 800) => { clearTimeout(t); t = setTimeout(load, ms); };
  if (C && C.on) {
    C.on('hello', () => soon(200)); C.on('project', () => soon(200)); C.on('projects', () => soon(400));
    C.on('ws', m => { if (m && /^(task|tasks|vision|doc|docs|presence|members|join|repo|setup)/.test(m.type || '')) soon(1500); });
  }
  window.TribeStage = { set, level: () => level(by[pid()]), steps: () => by[pid()] || null, refresh: () => soon(0) };
})();
// ---------- the rail's top slot: Home (the camp). The flame moved next to the wordmark; both go Home. ----------
(function () {
  const btn = document.getElementById('rail-camp'); if (!btn) return;
  btn.addEventListener('click', () => { const r = document.getElementById('rail-logo'); if (r) r.click(); });
})();
