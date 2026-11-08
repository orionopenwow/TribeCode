// Showcase mode: a lively pretend tribe for people who just want to look. It is the offline demo (offline.js: the
// mock /api/* backend and the fake socket) seeded with "Campfire Crew" and a script that plays out by itself.
// Every 3.5-7 s something happens through the same socket events the real UI already handles (chat, task, gist,
// proposal, milestones, approval, notification, presence, doc, repo), so the normal screens update on their own:
// friends chat, agents claim tasks and post gists, tasks move Doing -> Review -> Done, a friend approves, a commit
// lands, a vote passes, the milestone bar fills and, when it ships, a small celebration card shows. Then a new
// "season" starts with the milestone the vote just made. Your own actions keep working alongside (@claude answers).
// Start: ?demo=showcase (zero clicks), or "Watch it come alive" in the demo chooser (TribeOffline.start()).
// The script pauses while the tab is hidden. The pill's popout: Pause/Play, Speed 1x/2x, Restart, Explore quietly, Leave.
//   window.TribeShowcase = { seed(ctx), pop(opts), on(), pause(), play(), speed(n), _test: { beat(n), finish(), info() } }
(function () {
  'use strict';
  const O = () => window.TribeOffline, K = () => window.TribeOffline && window.TribeOffline._k;
  const A = () => window.TribeApp, C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PID = 'lantern-run', TAV = 'tavern-3d';
  const FRIENDS = ['maya', 'jay', 'rio', 'sam'];

  // ---------- the tribe ----------
  function seed({ iso, rid, st }) {
    const now = Date.now(), H = 3600e3;
    const name = st.name && st.name !== 'Me' ? st.name : 'Orion', first = name.split(' ')[0];
    let wt = null; try { wt = JSON.parse(localStorage.getItem('tribecode.welcome.tribe') || 'null'); } catch {}   // feat/welcome: the name from Flint's welcome
    const TRIBE = (wt && wt.name ? String(wt.name).slice(0, 40) : 'Campfire Crew'), TEMO = (wt && wt.emoji) || '🔥';
    let order = now - 30 * H;
    const t = (key, title, status, assignee, by, agoH, pid = PID) => ({ id: 't-' + key + '-' + rid(4), key, title, status, assignee: assignee || null, by, created: iso(now - agoH * H - H), updated: iso(now - agoH * H),
      updatedBy: assignee || by, order: order += 1000, source: 'board', body: '', project: pid });
    const L = [
      t('t1', '[Levels] Build Level 1: Lantern Hill', 'done', 'maya', 'me', 26),
      t('t2', '[Player] Wick\'s jump with a little coyote time', 'done', 'claude', 'me', 22),
      t('t3', '[Art] Night sky parallax in three layers', 'done', 'jay', 'jay', 18),
      t('t4', '[UI] Title screen with Start and a flickering logo', 'review', 'claude-maya', 'maya', 1.2),
      t('t5', '[Levels] Build Level 2: Willow Marsh', 'doing', 'maya', 'maya', 2),
      t('t6', '[Player] Checkpoint flags that relight Wick', 'backlog', null, 'me', 4),
      t('t7', '[Levels] Build Level 3: the Bell Tower', 'backlog', null, 'maya', 4.5),
      t('t8', '[Audio] Soft footsteps and a lantern chime', 'backlog', null, 'rio', 5),
      t('t9', '[Art] Warm halo ring on lit lanterns', 'backlog', null, 'jay', 6),
      t('t10', '[UI] Best time per level on the Lantern lit screen', 'backlog', null, 'sam', 7),
    ];
    const T = [
      t('v1', '[Scene] Block out the tavern room', 'done', 'sam', 'sam', 20, TAV),
      t('v2', '[Props] Barrels, mugs and a crackling hearth', 'doing', 'sam', 'sam', 3, TAV),
      t('v3', '[Light] Candle flicker shader', 'backlog', null, 'jay', 5, TAV),
    ];
    const key = k => L.find(x => x.key === k).id;
    const doc = (slug, title, by, agoH, body, pinned) => ({ slug, title, pinned: !!pinned, by, created: iso(now - agoH * H - 4 * H), updated: iso(now - agoH * H), updatedBy: by, version: 3, project: PID, body });
    const hm = d => new Date(d).toTimeString().slice(0, 5);
    const sc = { season: 1, step: 0, speed: 1, paused: false, keys: Object.fromEntries(L.map(x => [x.key, x.id])), order: ['t6', 't7', 't8'].map(key), shipped: [] };
    const msg = (by, text, agoMin) => ({ id: 'm-' + rid(), at: iso(now - agoMin * 60e3), by, text });
    return {
      on: true, v: 1, mode: 'showcase', created: iso(now - 30 * H), seq: 0,
      tribe: { name: TRIBE, created: iso(now - 30 * H) },
      members: [
        { id: 'me', name, color: st.color || '#F26B1D', role: 'host', joined: iso(now - 30 * H) },
        { id: 'maya', name: 'Maya', color: '#6C7CFF', role: 'builder', joined: iso(now - 29 * H), online: true, where: 'Tasks' },
        { id: 'jay', name: 'Jay', color: '#FFB86B', role: 'builder', joined: iso(now - 28 * H), online: true, where: 'Docs · Art direction' },
        { id: 'rio', name: 'Rio', color: '#9AE66E', role: 'builder', joined: iso(now - 20 * H), online: true, where: 'Chat' },
        { id: 'sam', name: 'Sam', color: '#C792EA', role: 'builder', joined: iso(now - 12 * H), online: false },
        { id: 'claude', name: `${first}'s Claude`.slice(0, 32), color: '#38C6B1', role: 'agent', owner: 'me', joined: iso(now - 26 * H), online: true, where: 'Tasks' },
        { id: 'claude-maya', name: 'Maya\'s Claude', color: '#38C6B1', role: 'agent', owner: 'maya', joined: iso(now - 26 * H), online: true, where: 'Review · title screen' },
        { id: 'flint', name: 'Flint', color: '#38C6B1', role: 'agent', owner: null, joined: iso(now - 30 * H), online: true, where: 'Living notes' },
      ],
      current: PID,
      projects: [
        { id: PID, name: 'Lantern Run', emoji: '🏮', image: null, bio: 'A cozy night platformer: carry a little flame through three short levels and light every lantern.',
          color: '#F26B1D', channel: 'general', default: true, created: iso(now - 30 * H), members: { me: 'host', maya: 'builder', jay: 'builder', rio: 'builder', sam: 'builder' } },
        { id: TAV, name: 'Tavern 3D', emoji: '🍺', image: null, bio: 'A small 3D tavern where the crew hangs out between levels. Candles, a hearth, a jukebox.',
          color: '#6C7CFF', channel: 'p-' + TAV, default: false, created: iso(now - 20 * H), members: { me: 'host', sam: 'builder', jay: 'builder', maya: 'builder' } },
      ],
      chat: {
        [PID]: [
          msg('tribecode', `${first} started **${TRIBE}** ${TEMO} This is a showcase: a pretend tribe that runs by itself in this browser. Nothing leaves this device.`, 60),
          msg('maya', 'Level 2 is coming along. The marsh fog finally looks right 🌫️', 42),
          msg('claude-maya', '📈 **Title screen is ready for review**\n- Start button, flickering logo, a soft fade in\n- Works with keys and touch', 70),
          msg('jay', 'Art direction doc is updated: warmer oranges, fewer blues. Have a look when you can.', 30),
          msg('rio', 'Footsteps next. I recorded gravel on my balcony, it sounds great 😄', 12),
        ],
        [TAV]: [
          msg('tribecode', 'Sam started **Tavern 3D**', 20 * 60),
          msg('sam', 'Hearth is in. Barrels next, then candles.', 180),
        ],
      },
      tasks: { [PID]: L, [TAV]: T },
      docs: {
        [PID]: [
          doc('level-design', 'Level design', 'maya', 3, '# Level design\n\nThree short levels, about two minutes each. Teach one idea per level.\n\n## Level 1 · Lantern Hill\n- Learn to jump and light a lantern.\n- Five lanterns, no enemies.\n\n## Level 2 · Willow Marsh\n- Fog hides the far platforms; lanterns clear it.\n- Moths drift in slow lines.\n\n## Level 3 · the Bell Tower\n- Climb up, light the bell at the top.\n\n## Rules of thumb\n- An ember before every hard jump.\n- If a jump feels unfair, it is unfair.\n', true),
          doc('art-direction', 'Art direction', 'jay', 1, '# Art direction\n\nWarm hearth in a dark night. Flat shapes, no gradients.\n\n## Palette\n- Night: deep slate blues, very few of them.\n- Light: ember orange, candle yellow.\n\n## Wick\n- A small flame with two dot eyes. Squash on landing.\n\n## Lanterns\n- Unlit: dark outline. Lit: warm fill and a halo ring.\n'),
          doc('living-notes', 'Living notes', 'flint', 0.5, `# Living notes\n\nThe crew's journal, written as things happen.\n\n- ${hm(now - 26 * H)} · Lantern Hill is playable end to end.\n- ${hm(now - 22 * H)} · Wick got coyote time; jumps feel fair now.\n- ${hm(now - 70 * 60e3)} · Maya's Claude finished the title screen and asked for review.\n`),
        ],
        [TAV]: [],
      },
      vision: {
        [PID]: '# Vision · Lantern Run\n\nA cozy, two-minute platformer about a small flame lighting up the night, built by a few friends and their agents.\n\n## Done for v1\n- A title screen and three levels\n- A boss at the top of the tower\n- Plays in the browser, on a phone too\n\n## Out of scope\n- Online play and accounts (for now)\n',
        [TAV]: '# Vision · Tavern 3D\n\nA small, warm 3D room the crew can wander around in. Candles, a hearth, a jukebox that plays Lantern Run music.\n',
      },
      gists: { [PID]: [], [TAV]: [] },
      milestones: { [PID]: [
        { version: 'v0.1', title: 'First playable: one level', created: iso(now - 26 * H), status: 'released', released: iso(now - 25 * H), tasks: [key('t1'), key('t2')] },
        { version: 'v0.2', title: 'title screen + 3 levels', short: '3 levels, title screen', created: iso(now - 20 * H), status: 'planned', tasks: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'].map(key) },
      ] },
      proposals: { [PID]: [
        { id: 'p-boss', title: 'v0.3: a boss and phone controls', short: 'a boss fight and touch controls', version: 'v0.3', kind: 'feature', status: 'open', by: 'jay', created: iso(now - 50 * 60e3), votes: { jay: 'yes' },
          body: '## Problem\nThe tower has no ending yet, and friends keep opening the game on their phones.\n\n## Plan\nA small boss at the top of the tower, and on-screen buttons for phones.\n\n## Tasks\n- [ ] [Boss] The Moth King, three slow phases\n- [ ] [UI] Touch controls: left, right, jump\n- [ ] [Audio] A boss music loop\n- [ ] [Levels] Boss arena on the tower roof\n' },
      ] },
      approvals: [
        { id: 'a-' + rid(6), status: 'pending', kind: 'merge', risk: 'low', title: 'Merge the title screen into main', details: 'Start button, a flickering logo and a soft fade in. 3 files, +118 −12.',
          by: 'claude-maya', byName: 'Maya\'s Claude', to: ['me', 'jay'], toNames: [name, 'Jay'], created: iso(now - 65 * 60e3), task: key('t4'), project: PID },
      ],
      inbox: [],
      lastRead: iso(now - 40 * 60e3),
      commits: { [PID]: [
        { sha: 'c41d9e2', subject: 'feat(ui): title screen with a flickering logo', by: 'claude-maya', at: iso(now - 72 * 60e3), add: 118, del: 12 },
        { sha: '9ab37f0', subject: 'feat(levels): willow marsh fog layer', by: 'maya', at: iso(now - 3 * H), add: 64, del: 9 },
        { sha: '2e81c5a', subject: 'feat(player): coyote time for jumps', by: 'claude', at: iso(now - 22 * H), add: 31, del: 4 },
      ] },
      repo: {},
      scratch: [], uploads: [], invites: [], friends: [], prefs: { pins: [] }, joinedRio: true, mayaHi: true,
      sc,
    };
  }
  // Inbox items reference the seeded approval: add them once the state exists (ids are random).
  function seedInbox(db) {
    if (db.inbox.length || !db.approvals[0]) return;
    const a = db.approvals[0], now = Date.now();
    db.inbox = [
      { id: 'n-seed1', type: 'approval', title: 'Maya\'s Claude asks: merge the title screen', body: a.details, at: a.created, priority: 'high', approval: a.id, view: 'tasks' },
      { id: 'n-seed2', type: 'proposal', title: 'Jay proposed v0.3: a boss and phone controls', body: 'Vote on the Board', at: new Date(now - 50 * 60e3).toISOString(), view: 'board' },
      { id: 'n-seed3', type: 'mention', title: 'Rio mentioned you in #general', body: 'Footsteps next. Want to hear them?', at: new Date(now - 12 * 60e3).toISOString(), view: 'chat' },
    ];
  }

  // ---------- seasons: each one ships a milestone ----------
  const SEASONS = [
    null,
    { version: 'v0.2' },
    { version: 'v0.3', next: { id: 'p-editor', by: 'maya', title: 'v0.4: a level editor for friends', short: 'a level editor', version: 'v0.4',
      body: '## Problem\nEveryone has level ideas, and only the agents can build them.\n\n## Plan\nA small in-game editor: paint tiles, place lanterns, test-play, share.\n\n## Tasks\n- [ ] [Editor] Tile palette and a paint brush\n- [ ] [Editor] Place lanterns, embers and moths\n- [ ] [Editor] Test-play from where you stand\n- [ ] [Editor] Save levels to the tribe\n' } },
    { version: 'v0.4', next: { id: 'p-share', by: 'rio', title: 'v0.5: share a level with a link', short: 'shareable levels', version: 'v0.5',
      body: '## Plan\nOne link opens a friend\'s level in the browser.\n\n## Tasks\n- [ ] [Share] Pack a level into a short link\n- [ ] [Share] Open a shared level from the link\n- [ ] [UI] A "levels from friends" shelf\n- [ ] [Audio] A tiny fanfare when you finish one\n' } },
  ];
  // after the written seasons: gentle polish passes, numbered on
  const POLISH = [['[Art] Wick blinks while idle', '[Audio] Wind in the marsh', '[Levels] A secret lantern in every level', '[UI] Remember the last level played'],
    ['[Player] A tiny wall slide', '[Art] Fireflies around lit lanterns', '[UI] A pause menu with volume', '[Levels] Speedrun ghosts for best times'],
    ['[Boss] A harder Moth King for a second run', '[Art] Rain on the tower roof', '[Audio] Bell tower chimes on the hour', '[UI] Colorblind-friendly lantern glow']];
  function seasonDef(n) {
    if (SEASONS[n]) return SEASONS[n];
    const k = n - SEASONS.length;
    return { version: `v0.${n + 1}`, pool: POLISH[k % 3], next: { id: 'p-polish-' + n, by: FRIENDS[n % 4], title: `v0.${n + 2}: polish pass ${k + 2}`, short: `polish pass ${k + 2}`, version: `v0.${n + 2}`,
      body: `## Plan\nSmall things that make it feel good.\n\n## Tasks\n${POLISH[(k + 1) % 3].map(x => `- [ ] ${x}`).join('\n')}\n` } };
  }

  // lines that change from season to season (picked by season + beat, never all the same text twice in a row)
  const SAY = {
    maya: ['Morning crew ☕ Coffee and lanterns.', 'Playtested the marsh twice. The fog trick works 🌫️', 'Who moved the ember before the big jump? It\'s perfect now.', 'I\'ll take the next playtest, send it my way.', 'Tiny thing: the moth path loops too fast on level 2.', 'This crew ships faster than my build finishes 😄'],
    jay: ['New lantern sprite is up in Files. Warmer, less yellow.', 'Halo ring idea: just a 1px outline that breathes. Thoughts?', 'Art direction doc has the boss palette now.', 'Flat shapes only, I promise 😇', 'Squash on landing makes Wick feel so much heavier, love it.', 'I can draw the editor icons tonight.'],
    rio: ['Footsteps on stone vs. wood, which one for the tower?', 'Chime sound is in. It\'s soft, I promise 🔔', 'Recorded rain on the window for later 🌧️', 'Tried it on my phone on the bus. Works!', 'The music loop is 16 bars, loops clean.', 'Lantern chime + bell = chef\'s kiss.'],
    sam: ['Tavern hearth crackles now 🔥', 'Candles flicker in the tavern too. Same shader as the lanterns.', 'Jukebox plays the Lantern Run theme, very cozy.', 'Barrels are in. One of them is a secret door.', 'Low-poly mugs done 🍺', 'Tavern runs at 60 fps on my old laptop.'],
  };
  const REACT = ['Nice one 🙌', 'Ship it 🚀', 'Looks great!', 'So good 😄', 'Love this', '🔥🔥', 'Playing it now', 'Perfect, thank you'];
  const GIST = [
    ['Claimed the folder first so nobody collides', 'Wrote it and played it end to end', 'Next: a friend reviews, then it ships'],
    ['Small change, two files', 'Checked it on a phone-sized screen', 'Moved the task to Review when done'],
    ['Reused the lantern code instead of a new system', 'Added a short note to Living notes', 'Next: review'],
  ];
  const DOCLINE = [
    ['level-design', '- Level 3 ends at the bell: light it and the whole town glows.'],
    ['art-direction', '- The Moth King: soft grey wings, one ember eye.'],
    ['level-design', '- Checkpoint flags relight Wick, so a fall never costs more than one screen.'],
    ['art-direction', '- Tavern windows show the night sky from the game.'],
    ['level-design', '- Every level hides one secret lantern.'],
  ];
  const pick = (arr, n) => arr[((n % arr.length) + arr.length) % arr.length];

  // ---------- small helpers over the offline backend ----------
  const db = () => K().db();
  const sc = () => db().sc;
  const tasks = (pid = PID) => (db().tasks[pid] = db().tasks[pid] || []);
  const task = id => tasks().find(x => x.id === id);
  const short = t => String(t.title).replace(/^\[[^\]]+\]\s*/, '');
  const name = id => K().nameOf(id);
  const member = id => db().members.find(m => m.id === id);
  const iso = () => new Date().toISOString();
  const rid = n => K().rid(n);
  function pushTask(t, pid = PID) { K().save(); if (pid === K().cur()) K().push({ type: 'task', task: t }); else K().push({ type: 'project-pulse', project: pid, kind: 'task' }); }
  function where(id, w, online = true) { const m = member(id); if (!m) return; m.where = w; m.online = online; K().save(); K().pushPresence(); }
  function say(by, text, pid = PID) { if (by !== 'me' && member(by) && !member(by).online && by !== 'tribecode') where(by, 'Chat'); return K().post(pid, by, text); }
  function journal(line) {
    const d = (db().docs[PID] || []).find(x => x.slug === 'living-notes'); if (!d) return;
    d.body = String(d.body).trimEnd() + `\n- ${new Date().toTimeString().slice(0, 5)} · ${line}\n`; d.version = (d.version || 1) + 1; d.updated = iso(); d.updatedBy = 'flint'; K().save();
    K().push({ type: 'doc', doc: { slug: d.slug, title: d.title, version: d.version, updated: d.updated, updatedBy: 'flint' } });
  }
  const milestone = () => ((db().milestones || {})[PID] || []).find(m => m.status === 'planned');
  function progress(m = milestone()) { if (!m) return { done: 0, total: 0 }; const ts = m.tasks.map(task).filter(Boolean); return { done: ts.filter(t => t.status === 'done').length, total: m.tasks.length }; }

  // ---------- the beats ----------
  function claim(id, who) {
    const t = task(id); if (!t || t.status === 'done' || t.status === 'review') return;
    Object.assign(t, { status: 'doing', assignee: who, updated: iso(), updatedBy: who }); pushTask(t);
    where(who, `Tasks · ${short(t)}`.slice(0, 60));
    say(who, `Picking up **${short(t)}**. I claimed the files first, so nobody's agent collides with mine.`);
  }
  function gist(id, who, n) {
    const t = task(id); if (!t || t.status === 'done') return;
    const g = { id: 'g-' + rid(8), kind: 'progress', title: `Progress: ${short(t)}`.slice(0, 90), bullets: pick(GIST, n), files: [], link: null, task: t.id, by: who, byName: name(who), agent: true, role: null, at: iso(), project: PID, auto: false };
    const msg = K().post(PID, who, `📈 **${g.title}**\n${g.bullets.map(b => `- ${b}`).join('\n')}`, { gist: g });
    g.msg = msg.id; (db().gists[PID] = db().gists[PID] || []).unshift(g); K().save();
    K().push({ type: 'gist', gist: g, project: PID }); K().pushHub();
  }
  function commit(id, who, n) {
    const t = task(id); if (!t) return;
    const add = 18 + ((n * 37 + t.title.length * 7) % 90), del = 2 + ((n * 13 + t.title.length) % 14);
    const lane = (t.title.match(/^\[([^\]]+)\]/) || [, 'game'])[1].toLowerCase();
    const c = { sha: rid(7).replace(/[g-z]/g, ch => 'abcdef'[ch.charCodeAt(0) % 6]), subject: `feat(${lane}): ${short(t).toLowerCase()}`.slice(0, 90), by: who, at: iso(), add, del };
    ((db().commits = db().commits || {})[PID] = db().commits[PID] || []).unshift(c); db().commits[PID] = db().commits[PID].slice(0, 30); K().save();
    K().post(PID, 'tribecode', `⎇ \`${c.sha}\` ${c.subject} · **+${add} −${del}** by ${name(who)}`);
    K().push({ type: 'repo' }); K().pushHub();
  }
  function review(id, who) {
    const t = task(id); if (!t || t.status === 'done') return;
    Object.assign(t, { status: 'review', updated: iso(), updatedBy: who }); pushTask(t);
    const me = member('me'), friend = who === 'claude-maya' ? 'jay' : 'maya';
    const a = { id: 'a-' + rid(6), status: 'pending', kind: 'merge', risk: 'low', title: `Merge “${short(t)}” into main`, details: `${name(who)} finished ${short(t).toLowerCase()} and played it through. Low risk: one lane, no shared files.`,
      by: who, byName: name(who), to: ['me', friend], toNames: [me.name, name(friend)], created: iso(), task: t.id, project: PID };
    db().approvals.unshift(a); db().approvals = db().approvals.slice(0, 40); K().save();
    K().push({ type: 'approval', approval: a });
    K().notify({ type: 'approval', title: `${name(who)} asks: merge “${short(t)}”`, body: a.details, priority: 'high', approval: a.id, view: 'tasks' });
    say(who, `**${short(t)}** is ready for review. One tap to approve in the Inbox 🔔`);
    where(who, 'Review');
  }
  function approve(id, n) {
    const t = task(id); if (!t) return;
    const a = db().approvals.find(x => x.task === id && x.status === 'pending');
    const friend = a ? a.to.find(x => x !== 'me') || 'maya' : pick(FRIENDS, n);
    if (a) K().decide(a, 'approve', friend, pick(['Played it, ship it', 'Looks great', 'Works on my phone too', 'Lovely'], n));   // the decided hook moves the task
    else if (t.status !== 'done') finish(t, friend);
    say(friend, pick(REACT, n + 1));
  }
  function finish(t, by) {
    if (t.status === 'done') return;
    Object.assign(t, { status: 'done', updated: iso(), updatedBy: by }); pushTask(t);
    if (t.assignee && member(t.assignee) && member(t.assignee).role === 'agent') where(t.assignee, 'Tasks');
    journal(`${name(by)} approved ${short(t)}; it shipped to main.`);
    paintMile(); paintState();
  }
  function friendFinish(id, who, n) {
    const t = task(id); if (!t || t.status === 'done') return;
    commit(id, who, n); finish(t, who);
    say(who, `**${short(t)}** is done and merged. Go play it!`);
  }
  function voteOn() {
    const pr = ((db().proposals || {})[PID] || []).find(p => p.status === 'open'); if (!pr) return;
    const who = ['maya', 'rio', 'jay', 'sam'].find(f => !(pr.votes || {})[f]); if (!who) return;
    if (!member(who).online) where(who, 'Board');
    K().vote(PID, pr, who, 'yes');
    if (pr.status === 'open') say(who, `Voted yes on **${pr.title}** 🗳️`);
    else K().notify({ type: 'proposal', title: `Approved: ${pr.title}`, body: `Milestone ${pr.milestone} is planned`, view: 'board' });
  }
  function docEdit(n) {
    const [slug, line] = pick(DOCLINE, n), by = slug === 'art-direction' ? 'jay' : 'maya';
    const d = (db().docs[PID] || []).find(x => x.slug === slug); if (!d) return;
    if (!String(d.body).includes(line)) { d.body = String(d.body).trimEnd() + '\n' + line + '\n'; d.version = (d.version || 1) + 1; d.updated = iso(); d.updatedBy = by; K().save();
      K().push({ type: 'doc', doc: { slug, title: d.title, version: d.version, updated: d.updated, updatedBy: by } }); }
    where(by, `Docs · ${d.title}`);
    K().post(PID, 'tribecode', `✏️ ${name(by)} is editing **${d.title}** · ${line.replace(/^- /, '+ ')}`);
  }
  function pinRepo() {
    if ((db().repo || {})[PID]) return;
    db().repo[PID] = { name: 'campfire-crew/lantern-run', branch: 'main', ahead: 0, behind: 0, dirty: 0 }; K().save();
    K().push({ type: 'repo' });
    say('rio', 'Pinned our repo to Lantern Run, so commits show up on the Repo card now 📌');
    journal('Rio pinned the repo: campfire-crew/lantern-run.');
  }
  function mention(n) {
    const who = pick(['jay', 'rio', 'maya'], n), me = member('me').name.split(' ')[0];
    const line = pick([`@${me} can you playtest the tower tonight?`, `@${me} want to hear the new chime?`, `@${me} which halo looks better, A or B?`], n);
    say(who, line);
    K().notify({ type: 'mention', title: `${name(who)} mentioned you in #general`, body: line, view: 'chat' });
  }
  function tavern(n) {
    const sam = member('sam'); if (!sam.online) { sam.online = true; sam.where = 'Tavern 3D'; K().save(); K().pushPresence(); }
    K().post(TAV, 'sam', pick(SAY.sam, n));
    const t = tasks(TAV).find(x => x.status !== 'done');
    if (t && n % 2) { t.status = t.status === 'backlog' ? 'doing' : 'done'; t.assignee = 'sam'; t.updated = iso(); t.updatedBy = 'sam'; pushTask(t, TAV); }
  }
  function chatter(n) { const who = pick(['maya', 'jay', 'rio'], n); say(who, pick(SAY[who], Math.floor(n / 3) + sc().season)); }
  function presenceBeat(n) {
    const jay = member('jay'); jay.online = !(jay.online && n % 2); jay.where = jay.online ? 'Docs · Art direction' : null; K().save(); K().pushPresence();
    where('flint', 'Living notes'); journal(pick(['Flint summed up the morning: two tasks shipped, one in review.', 'Flint noticed everyone is in the Bell Tower lane; suggested spreading out.', 'Flint wrote the standup: chat is busy, the board is moving.'], n));
  }
  function release() {
    const m = milestone(); if (!m) return;
    m.tasks.map(task).filter(t => t && t.status !== 'done').forEach(t => finish(t, 'maya'));
    m.status = 'released'; m.released = iso(); K().save();
    K().push({ type: 'milestones', milestones: db().milestones[PID] });
    const p = progress(m);
    const ppl = db().members.filter(x => x.role !== 'agent').length, ags = db().members.filter(x => x.role === 'agent').length;
    K().post(PID, 'tribecode', `Released **${m.version}**: ${m.title} 🚀 ${p.total} tasks by ${ppl} people and ${ags} agents.`);
    K().notify({ type: 'release', title: `Released ${m.version}`, body: m.title, view: 'board', ref: m.version });
    journal(`${m.version} shipped: ${m.short || m.title}.`);
    sc().shipped.push(m.version); K().save();
    celebrate(m, p);
  }
  function nextSeason() {
    const s = sc(); s.season++; s.step = 0;
    const def = seasonDef(s.season);
    let m = milestone();
    if (!m) {   // the vote didn't pass (you voted no?): plan the season's milestone directly
      const titles = def.pool || ['[Boss] The Moth King, three slow phases', '[UI] Touch controls: left, right, jump', '[Audio] A boss music loop', '[Levels] Boss arena on the tower roof'];
      const ids = titles.map(title => K().addTask(PID, { title, by: 'maya' }).id);
      m = { version: def.version, title: `polish pass ${s.season}`, created: iso(), status: 'planned', tasks: ids };
      db().milestones[PID].push(m); K().save(); K().push({ type: 'milestones', milestones: db().milestones[PID] });
    }
    s.order = m.tasks.filter(id => task(id) && task(id).status !== 'done');
    // keep the board tidy over a long watch: only the 12 newest done tasks stay
    const done = tasks().filter(t => t.status === 'done').sort((x, y) => String(y.updated).localeCompare(String(x.updated)));
    for (const t of done.slice(12)) { db().tasks[PID] = tasks().filter(x => x !== t); K().push({ type: 'task-removed', id: t.id }); }
    if (def.next && !((db().proposals[PID] || []).some(p => p.id === def.next.id))) {
      const pr = { ...def.next, kind: 'feature', status: 'open', created: iso(), votes: { [def.next.by]: 'yes' } };
      db().proposals[PID].unshift(pr); K().save();
      K().push({ type: 'proposal', proposal: { ...pr, tally: K().tally(pr) } });
      K().notify({ type: 'proposal', title: `${name(pr.by)} proposed ${pr.title}`, body: 'Vote on the Board', view: 'board' });
    }
    K().save();
    say('maya', pick([`New week, new milestone: **${m.version}**, ${m.short || m.title}. Who's in?`, `On to **${m.version}** (${m.short || m.title}). Agents, the board is yours 😄`, `**${m.version}** time: ${m.short || m.title}. Let's go!`], s.season));
    paintMile(); paintState();
  }

  // The season's beats, rebuilt the same way from (season, order) after a reload.
  function plan() {
    const s = sc(), n = s.season, T = s.order || [], q = [];
    const W = i => (i % 2 ? 'claude-maya' : 'claude');
    const F = [chatter, docEdit, tavern, mention, presenceBeat, chatter, docEdit]; let fi = 0;
    const fill = () => { const f = F[fi % F.length], k = fi++ + n * 5; q.push(() => f(k)); };
    if (n === 1) q.push(() => say('maya', pick(SAY.maya, 0))); else fill();
    T.forEach((id, i) => {
      q.push(() => claim(id, W(i)));
      if (i === 0 && n === 1) q.push(() => approve(s.keys.t4, 0));   // the seeded title screen review
      else if (i > 0) q.push(() => approve(T[i - 1], i + n));
      q.push(() => gist(id, W(i), i + n));
      if (i === 0 && n === 1) q.push(pinRepo);
      fill();
      q.push(() => commit(id, W(i), i + n));
      if (i < 2) q.push(voteOn);
      q.push(() => review(id, W(i)));
      if (n === 1 && i === 1) q.push(() => friendFinish(s.keys.t5, 'maya', 3));
      fill();
    });
    if (T.length) q.push(() => approve(T[T.length - 1], n + 7));
    q.push(release);
    fill();
    return q;
  }

  // ---------- the clock ----------
  let timer = null, held = false;   // held: feat/demo-tour's director plays its own script meanwhile
  const on = () => !!(O() && O().mode && O().mode() === 'showcase');
  function schedule(first) {
    clearTimeout(timer); timer = null;
    if (!on() || held || sc().paused || document.hidden || !(C() && C().connected())) return;
    const wait = first ? 1500 : 3500 + Math.random() * 3500;
    timer = setTimeout(tick, wait / (sc().speed || 1));
  }
  function beat() {
    const s = sc(), q = plan();
    if (s.step >= q.length) return nextSeason();
    const fn = q[s.step]; s.step++; K().save();
    try { fn(); } catch (e) { console.warn('showcase:', e); }
  }
  function tick() { if (!on()) return; beat(); paintState(); schedule(); }
  document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(timer) : schedule()));

  // ---------- task decisions: approving (you or a friend) ships the task; denying sends it back ----------
  function hook() {
    const k = K(); if (!k || hook.done) return; hook.done = true;
    k.hooks.decided.push(ap => {
      if (!on() || !ap.task) return;
      const t = task(ap.task); if (!t) return;
      if (ap.status === 'approved') { finish(t, ap.decidedBy); if (ap.decidedBy === 'me') setTimeout(() => on() && say(ap.by, 'Thanks! Merged and shipped ✅'), 900); }
      else { Object.assign(t, { status: 'doing', updated: iso(), updatedBy: ap.by }); pushTask(t); setTimeout(() => on() && say(ap.by, 'Fair point, reworking it now.'), 900); }
    });
  }

  // ---------- the celebration: a small flat card, no confetti ----------
  function celebrate(m, p) {
    document.querySelectorAll('.sc-cele').forEach(x => x.remove());
    const el = document.createElement('div'); el.className = 'sc-cele'; el.id = 'sc-cele'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="sc-cele-mark" aria-hidden="true"><svg class="i"><use href="#i-flag"/></svg></span><div class="sc-cele-t"><span class="eyebrow">Milestone shipped</span><b>${esc(m.version)} shipped 🎉</b><small>${esc(m.short || m.title)} · ${p.total} tasks · ${esc(db().tribe.name)}</small></div>
      <button class="btn sm" data-sc-go>See the board</button><button class="sc-x" data-sc-x aria-label="Dismiss">×</button>`;
    document.body.appendChild(el);
    el.querySelector('[data-sc-go]').onclick = () => { el.remove(); A() && A().show('board'); };
    el.querySelector('[data-sc-x]').onclick = () => el.remove();
    setTimeout(() => el.remove(), 9000 / (sc().speed || 1) + 3000);
  }

  // ---------- the milestone card on the project home ----------
  function mileHtml() {
    const m = milestone() || ((db().milestones || {})[PID] || []).slice(-1)[0]; if (!m) return '';
    const p = progress(m), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    const busy = db().members.filter(x => x.role === 'agent' && x.online && /^Tasks ·|^Review/.test(x.where || '')).map(x => x.name);
    return `<div class="sc-mile-head"><span class="eyebrow">Milestone · season ${sc().season}</span><span class="sc-mile-n">${p.done}/${p.total}</span></div>
      <h3>${esc(m.version)}: ${esc(m.title)}</h3>
      <div class="sc-bar" role="progressbar" aria-label="Milestone progress" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}"><span style="width:${pct}%"></span></div>
      <p class="faint">${m.status === 'released' ? 'Shipped 🎉' : busy.length ? `${esc(busy.join(' and '))} ${busy.length > 1 ? 'are' : 'is'} on it` : `${p.total - p.done} tasks to go`}</p>`;
  }
  function paintMile() {
    if (!on()) return;
    const host = document.querySelector('#pj-overview'); if (!host) return;
    let el = document.querySelector('#sc-mile');
    if (C().project() && C().project() !== PID) { if (el) el.remove(); return; }
    if (!el || !host.contains(el)) {
      const after = host.querySelector('#pj-living') || host.querySelector('.view-head'); if (!after) return;
      el = document.createElement('section'); el.className = 'card sc-mile'; el.id = 'sc-mile';
      after.after(el);
    }
    const html = mileHtml(); if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  }
  let mo = null;
  function watchOverview() {
    if (mo) return;
    mo = new MutationObserver(() => { if (on() && !document.querySelector('#sc-mile')) paintMile(); });
    const host = document.querySelector('#pj-overview'); if (host) mo.observe(host, { childList: true });
  }

  // ---------- the pill's state and popout ----------
  function paintState() {
    const st = document.querySelector('#sc-pill-state'); if (!st || !on()) return;
    const s = sc(); st.textContent = s.paused ? ' · paused' : s.speed > 1 ? ` · ${s.speed}×` : '';
    const pill = st.closest('.od-pill'); if (pill) pill.classList.toggle('paused', !!s.paused);
    const pop = document.querySelector('#demo-pop.sc-pop'); if (pop) fillPop(pop);
  }
  let popOpts = null;
  function fillPop(pop) {
    const s = sc(), m = milestone(), p = progress(m);
    pop.innerHTML = `<header><span class="od-dot" aria-hidden="true"></span><div><span class="eyebrow">Showcase · pretend tribe</span><b>${esc(db().tribe.name)} runs by itself</b></div></header>
      <p>Friends and agents act every few seconds, right in this browser. Chat, vote or approve any time; @claude answers. Nothing leaves this device.</p>
      <div class="sc-prog"><span class="faint">Season ${s.season}${m ? ` · ${esc(m.version)} · ${p.done}/${p.total}` : ''}</span><div class="sc-bar"><span style="width:${p.total ? Math.round(p.done / p.total * 100) : 100}%"></span></div></div>
      <div class="sc-ctl">
        <button class="btn sm" id="sc-play" aria-pressed="${!s.paused}">${s.paused ? '▶ Play' : '❚❚ Pause'}</button>
        <div class="sc-seg" role="group" aria-label="Speed"><button class="${s.speed === 1 ? 'on' : ''}" data-sc-speed="1" id="sc-speed-1">1×</button><button class="${s.speed === 2 ? 'on' : ''}" data-sc-speed="2" id="sc-speed-2">2×</button></div>
        <button class="btn sm" id="sc-restart">Restart</button>
      </div>
      <div class="od-acts">
        ${window.TribeDirector ? '<button id="sc-tour"><svg class="i"><use href="#i-play"/></svg><span>Play the 3-minute tour</span></button>' : ''}<!-- feat/demo-tour -->
        <button id="sc-quiet"><svg class="i"><use href="#i-zap"/></svg><span>Explore quietly</span></button>
        <button id="od-real" data-od="real"><svg class="i"><use href="#i-play"/></svg><span>Host this for real</span></button>
        <button id="od-leave"><svg class="i"><use href="#i-x"/></svg><span>Leave showcase</span></button>
      </div>`;
    pop.querySelector('#sc-play').onclick = () => (sc().paused ? play() : pause());
    pop.querySelectorAll('[data-sc-speed]').forEach(b => b.onclick = () => speed(Number(b.dataset.scSpeed)));
    pop.querySelector('#sc-restart').onclick = () => O().reset();
    const tour = pop.querySelector('#sc-tour'); if (tour) tour.onclick = () => { K().closePop(); window.TribeDirector.start(); };   // feat/demo-tour
    pop.querySelector('#sc-quiet').onclick = () => { clearTimeout(timer); popOpts.quiet(); };
    pop.querySelector('#od-leave').onclick = () => { clearTimeout(timer); popOpts.leave(); };
  }
  function pop(opts) {
    popOpts = opts;
    const el = document.createElement('div'); el.className = 'od-pop sc-pop'; el.id = 'demo-pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Showcase');
    fillPop(el); return el;
  }
  function pause() { sc().paused = true; K().save(); clearTimeout(timer); paintState(); }
  function play() { sc().paused = false; K().save(); schedule(true); paintState(); }
  function speed(n) { sc().speed = n === 2 ? 2 : 1; K().save(); schedule(); paintState(); }

  window.TribeShowcase = {  // API
    seed, pop, on, pause, play, speed,
    // feat/demo-tour: director.js holds the clock while it plays its own script, and uses the same beats
    hold(v) { held = !!v; if (held) clearTimeout(timer); else schedule(true); },
    _dir: { say, where, claim, gist, commit, review, approve, finish, friendFinish, voteOn, release, journal, milestone, progress, task, tasks, celebrate, paintMile, PID, TAV },
    _test: {
      beat(n = 1) { for (let i = 0; i < n; i++) beat(); paintState(); },
      finish() { const s0 = sc().season; let guard = 200; while (sc().season === s0 && guard--) beat(); paintState(); },   // jump to the end of this season (release + celebration)
      info() { const m = milestone(), p = progress(m); return { season: sc().season, step: sc().step, paused: sc().paused, speed: sc().speed, milestone: m && m.version, done: p.done, total: p.total, shipped: sc().shipped.slice() }; },
    },
  };
  // ---------- start (after window.TribeShowcase exists: offline.js's seed() asks it for the tribe) ----------
  // ?demo=showcase: set the demo up before tribe.js loads, then drop the parameter so a reload keeps going.
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === 'showcase' && O()) {
    // feat/demo-tour: the guided 3-minute tour plays unless ?tour=off; it starts from a fresh tribe so every run is the same
    const tour = params.get('tour') || 'on'; window.__tribeTour = tour === 'off' ? null : tour;
    O().boot('showcase', !!window.__tribeTour);
    params.delete('demo'); params.delete('tour');
    try { history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); } catch {}
    try { sessionStorage.setItem('tribecode.view', 'home'); } catch {}
    window.__tribeRestoredView = true;   // app.js: open the project home, not the Global Hub
  }
  // Listens always: "Watch it come alive" from the chooser starts the showcase without a reload.
  function ready() {
    const c = C(); if (!c) return;
    const go = () => { if (!on()) return; seedInbox(db()); K().save(); hook(); schedule(true); setTimeout(() => { watchOverview(); paintMile(); paintState(); }, 300); };
    c.on('hello', go);
    ['task', 'milestones', 'presence', 'project'].forEach(e => c.on(e, () => on() && setTimeout(paintMile, 450)));
    if (c.connected()) go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();

})();
