// What should I do next? (feat/help-next, docs/HELP-NEXT.md): one engine that looks at the real state of the current
// project and answers with ONE best next step and why, two alternatives and "Not now". Everything that says "next"
// asks here: the ? menu's first entry, the Next chip in the project header and the card on the dashboard, Flint
// ("what should I do next", "I'm stuck", "what can I make", "inspire me", "how do I ship this") and empty states.
//   TribeNextStep.state()            -> Promise<state>   what the project has (vision, design, build, check, publish…)
//   TribeNextStep.next()             -> Promise<{ stage, stages, best, alts, done }>
//   TribeNextStep.open()             the sheet: journey strip, the step, alternatives, things to ask Flint
//   TribeNextStep.card(el)           draws the calm one-step card into el (the dashboard slot)
//   TribeNextStep.flint(text)        -> Promise<{ text, acts } | null>   Flint's answers from the same engine
//   TribeNextStep.prompts(view?)     five things to ask Flint, for where you are
//   TribeNextStep.ideas(kind?)       "what can I make" by kind
//   TribeNextStep.empty(opts)        HTML for the one empty-state pattern: title, one line, one action
//   TribeNextStep.nudges(on?)        get or set "Offer a next step when I look stuck"
// Works with no AI and with no tribe. The pure part (pick) is exported for tests.
(function () {
  'use strict';
  const C = () => window.TribeClient, App = () => window.TribeApp, Shell = () => window.TribeShell;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, s = 18) => (window.TribeIcons ? window.TribeIcons.svg(n, s) : '');
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
  const connected = () => !!(C() && C().connected && C().connected());
  const proj = () => (window.TribeProjects && window.TribeProjects.cur ? window.TribeProjects.cur() : null);
  const api = async (p, o) => { try { return await C().api(p, o); } catch { return null; } };
  const go = v => { const S = Shell(); if (S && S.go) S.go(v); else if (App()) App().show(v); };
  const day = () => new Date().toISOString().slice(0, 10);

  // ---------- the journey every project walks: idea -> design -> build -> check -> publish -> share ----------
  const STAGES = [['idea', 'Idea'], ['design', 'Design'], ['build', 'Build'], ['check', 'Check'], ['publish', 'Publish'], ['share', 'Share']];

  // ---------- state: only what the app already knows; a part that can't be read counts as "not yet" ----------
  async function state() {
    const p = proj(), st = { tribe: connected(), project: p ? { id: p.id, name: p.name, kind: p.kind || '' } : null, vision: false, tasks: 0, myTask: null, design: false, site: false, built: false, checked: false,
      published: false, friends: 0, ai: false, company: false };
    if (!st.tribe || !p) return st;
    const pid = encodeURIComponent(p.id), me = (C().state && C().state().me) || {};
    const [pulse, tasks, cnv, site, pv, pub, co] = await Promise.all([api(`/projects/${pid}/pulse`), api('/tasks'), api('/canvas'), api(`/projects/${pid}/site-config`), api('/preview'),
      (window.TribePublish && window.TribePublish.status ? Promise.resolve().then(() => window.TribePublish.status(p.id)).catch(() => null) : api('/publish?project=' + pid)), api(`/projects/${pid}/company`, { project: p.id })]);
    if (pulse) {
      st.vision = !!(pulse.vision && pulse.vision.has); st.tasks = pulse.taskCount || 0;
      st.friends = (pulse.team || []).filter(m => m.kind !== 'agent' && m.id !== me.id).length;
      st.ai = (pulse.agents || []).length > 0 || ((C().state().members || []).some(m => m.role === 'agent' && m.owner === me.id));
    }
    if (tasks && tasks.tasks) { const open = tasks.tasks.filter(t => t.status !== 'done'); st.tasks = Math.max(st.tasks, tasks.tasks.length); const mine = open.find(t => t.assignee === me.id && t.status === 'doing') || open.find(t => t.assignee === me.id); st.myTask = mine ? { id: mine.id, title: mine.title } : null; st.openTasks = open.length; }
    st.design = !!(cnv && (cnv.files || []).length);
    st.site = !!(site && site.config);
    st.built = st.site || !!(pv && pv.preview && pv.preview.hasIndex);
    st.published = !!(pub && (pub.published === true || (Array.isArray(pub.published) && pub.published.length) || pub.live || pub.url));
    st.checked = st.published || ls.get(`tribecode.next.${p.id}.checked`) === '1';
    st.company = !!(co && (co.company || co.seats || (co.name && co.seats)));
    // one voice: what reco.js senses about this project (company seats, money, assets, lessons, add-ons) joins the same list
    try { const R = window.TribeReco; if (R && R.list) st.extras = (await R.list(p.id, true)).filter(x => !['vision', 'friends', 'repo', 'company'].includes(x.id)).map(x => ({ id: 'x-' + x.id, title: x.t, why: x.why, act: x.b, run: 'reco:' + x.id, _x: x })); } catch {}
    return st;
  }

  // ---------- the steps (pure): each knows when it is done, why it matters and what one tap does ----------
  // run names are resolved in RUN below, so pick() stays pure and testable
  const kindWord = st => ({ game: 'game', '3d': 'game', app: 'app', tool: 'app', site: 'website' }[(st.project && st.project.kind) || ''] || 'project');
  function steps(st) {
    const what = kindWord(st), name = st.project ? st.project.name : '';
    return [
      { id: 'start', stage: 'idea', done: !!(st.tribe && st.project), title: 'Start your first project', why: 'Everything you make lives in a project. It starts on this device in one tap.', act: 'Start a project', run: 'start' },
      { id: 'vision', stage: 'idea', done: st.vision, title: 'Say what you are making', why: 'One or two sentences. Everyone, and every AI helper, reads them before they build.', act: 'Write it', run: 'vision' },
      { id: 'task', stage: 'idea', done: st.tasks > 0, title: 'Add a first small task', why: 'One small thing to build first turns the idea into something you can start today.', act: 'New task', run: 'task' },
      { id: 'design', stage: 'design', done: st.design || st.site || st.built, title: `Sketch how the ${what} looks`, why: 'A quick design gives you and your AI helper the same picture. Starters make it a two-minute job.', act: 'Open Design', run: 'design' },
      { id: 'build', stage: 'build', done: st.built, title: 'Build a first version', why: 'A rough version you can click beats a perfect plan. Flint builds one from a sentence, with no AI needed.', act: 'Ask Flint to build it', run: 'build', say: what === 'website' ? `make a website for ${name}` : what === 'game' ? `make a game called ${name}` : `build an app called ${name}` },
      { id: 'check', stage: 'check', done: st.checked, title: 'Check it before anyone sees it', why: 'Open it, try it on a phone size, and fix what looks off. Websites have Check my site.', act: st.site ? 'Check my site' : 'Open the preview', run: 'check' },
      { id: 'publish', stage: 'publish', done: st.published, title: 'Publish it', why: 'A link other people can open is the point. Publish runs a safety check first.', act: 'Publish', run: 'publish' },
      { id: 'share', stage: 'share', done: st.friends > 0, title: 'Bring a friend in', why: 'One link lets a friend join on a phone or a computer, to build with you or just to try it.', act: 'Invite', run: 'invite' },
    ];
  }
  const SIDE = st => [
    st.myTask && { id: 'mytask', title: `Carry on with “${st.myTask.title}”`, why: 'It is assigned to you and still open.', act: 'Open Tasks', run: 'tasks' },
    !st.ai && st.tribe && st.project && { id: 'ai', title: 'Add an AI helper', why: 'Claude, Cursor, Codex or Gemini can take tasks and build with you. Flint works without one.', act: 'Invite your agent', run: 'ai' },
    st.tribe && st.project && !st.company && { id: 'company', title: 'Run it as a company', why: 'Roles, check-ins and money in and out, set up by four questions.', act: 'Open Company', run: 'company' },
    ...(st.extras || []),
    { id: 'learn', title: 'See the whole path', why: 'A short guide from idea to a published link, with more depth when you want it.', act: 'Open the path', run: 'learn' },
    { id: 'tour', title: 'Take the tour with Flint', why: 'Two minutes: he flies you around the main places.', act: 'Start the tour', run: 'tour' },
  ].filter(Boolean);

  // pick(state, snoozed) -> { stage, stages, best, alts, done }: the first step not done and not snoozed today wins;
  // an open task of your own comes first once the idea is down. Pure: no DOM, no network.
  function pick(st, snoozed = []) {
    const all = steps(st), off = new Set(snoozed), todo = all.filter(s => !s.done), free = todo.filter(s => !off.has(s.id));
    const side = SIDE(st).filter(s => !off.has(s.id));
    const mine = side.find(s => s.id === 'mytask');
    let best = free[0] || null;
    if (mine && st.vision && st.tasks > 0) best = mine;
    if (!st.tribe || !st.project) best = all[0];
    const done = !todo.length;
    if (!best) best = done ? { id: 'keepgoing', stage: 'share', title: st.openTasks ? 'Pick the next task' : 'Plan what comes next', why: done ? 'It is published and shared. Keep the list of small next things moving.' : 'Everything else is set aside for today.', act: 'Open Tasks', run: 'tasks' } : side[0];
    const alts = [...free.filter(s => s !== best).slice(0, 1), ...side.filter(s => s !== best)].filter((s, i, a) => a.findIndex(x => x.id === s.id) === i).slice(0, 2);
    const cur = (todo[0] || all[all.length - 1]).stage;
    const stages = STAGES.map(([id, label]) => ({ id, label, done: all.filter(s => s.stage === id).every(s => s.done), here: id === cur && !done }));
    return { stage: cur, stages, best, alts, done };
  }

  const snoozeKey = () => `tribecode.next.snooze.${(proj() || {}).id || 'none'}.${day()}`;
  const snoozed = () => { try { return JSON.parse(ls.get(snoozeKey()) || '[]'); } catch { return []; } };
  const snooze = id => { const a = snoozed(); if (!a.includes(id)) a.push(id); ls.set(snoozeKey(), JSON.stringify(a)); };
  async function next() { const n = pick(await state(), snoozed()); lastBest = n.best; return n; }

  // ---------- what one tap does ----------
  const RUN = {
    start: () => { const A = App(); if (A && A.startFirst) A.startFirst(); else if (window.TribeProjects && window.TribeProjects.openNew) window.TribeProjects.openNew(); },
    vision: () => { go('home'); setTimeout(() => window.TribeProjects && window.TribeProjects.step('vision'), 120); },
    task: () => window.TribeProjects && window.TribeProjects.step('newtask'),
    design: () => { if (window.TribeDesignFlow && window.TribeDesignFlow.open) window.TribeDesignFlow.open(); else go('canvas'); },
    build: s => { const F = window.TribeFlint; if (F && F.prefill) F.prefill(s && s.say ? s.say : 'build it'); else go('home'); },
    check: () => { const p = proj(); if (p) ls.set(`tribecode.next.${p.id}.checked`, '1'); const SS = window.TribeSiteStudio; if (SS && SS.open && SS.check) { SS.open('check'); return; } if (window.TribePreview && window.TribePreview.open) window.TribePreview.open(); },
    publish: () => { if (window.TribePublish && window.TribePublish.open) window.TribePublish.open(); else go('website'); },
    invite: () => App() && App().openInvite && App().openInvite(),
    tasks: () => go('tasks'),
    ai: () => (window.TribeInviteAgent ? window.TribeInviteAgent.open() : App() && App().connectClaude && App().connectClaude()),
    company: () => go('company'),
    learn: () => window.TribeGuide && window.TribeGuide.path && window.TribeGuide.path(pathFor()),
    tour: () => window.TribeFlintGuide && window.TribeFlintGuide.tour && window.TribeFlintGuide.tour(),
  };
  const pathFor = () => ({ game: 'game', '3d': 'game', app: 'app', tool: 'app', site: 'website' }[(proj() || {}).kind || ''] || 'website');
  function run(step) { close(); if (step._x) { const x = step._x, M = window.TribeMode; try { if (x.unlock && M && M.allowsKey && !M.allowsKey(x.unlock) && M.unlock) M.unlock(x.unlock); x.run(); } catch {} } const f = RUN[step.run]; if (f) f(step); document.dispatchEvent(new CustomEvent('tribe:nextstep', { detail: { id: step.id } })); }

  // ---------- things to ask Flint, for where you are, and ideas by kind ----------
  const PROMPTS = {
    home: ['what should I do next', 'make a landing page for my project', 'add a task to test it on a phone', 'summarize my notes', 'what can I make'],
    canvas: ['make a login screen', 'tidy this up', 'make a dark version', 'rename the layers', 'make a poster for the launch'],
    website: ['add a pricing section', 'make the headline shorter', 'check my site', 'use a warmer colour', 'add a contact form'],
    tasks: ['add a task to fix the menu for friday', 'grab an open task', 'what is waiting for review', 'split this into smaller tasks', 'what should I do next'],
    docs: ['write a launch plan', 'make slides from this doc', 'summarize this doc', 'add a table of contents', 'new doc about the idea'],
    chat: ['what did we decide today', 'action items', 'start a video call', 'summarize my notes', 'tell everyone the build is ready'],
    company: ['what needs a person\'s OK', 'who has no role yet', 'add a check-in on monday', 'how much money came in this month', 'what should I do next'],
    preview: ['make the title bigger', 'make it dark', 'publish it', 'make it fit a phone', 'how do I ship this'],
  };
  function prompts(view) {
    let v = view; if (!v) { const h = location.hash; v = /canvas/.test(h) || document.body.classList.contains('cv-focus') ? 'canvas' : document.body.classList.contains('pvw-on') ? 'preview' : (App() && App().view ? App().view() : 'home'); }
    v = { 'ws-tasks': 'tasks', board: 'tasks', 'docs-files': 'docs', general: 'chat', design: 'canvas' }[v] || v;
    return (PROMPTS[v] || PROMPTS.home).slice(0, 5);
  }
  const IDEAS = {
    website: ['A page for a local café with hours and a menu', 'A portfolio for your photos or drawings', 'A link page for all your socials', 'A sign-up page for a club or a class', 'A small shop with your own checkout link'],
    game: ['A one-screen arcade game with a high score', 'A platformer with three short levels', 'A rolling-ball 3D course with gems', 'A quiz game about your friend group', 'A cozy clicker that saves progress'],
    app: ['A habit tracker for one habit', 'A shared shopping list', 'A tip and bill splitter', 'A study timer with breaks', 'A recipe box that works offline'],
    more: ['A poster and logo for an event', 'A pitch deck from your idea doc', 'A brand kit: colours, fonts and a logo', 'A budget sheet with a chart', 'A short video with titles'],
  };
  const ideas = kind => (kind && IDEAS[kind]) || IDEAS;

  // ---------- Flint: the same engine answers in chat ----------
  const RX = {
    next: /^(?:what (?:should|do|can) i do(?: (?:next|now))?|what next|what(?:'s| is) next for me|what(?:'s| is) (?:the )?next(?: step)?|next step|what now|where do i start|how do i (?:start|begin))\??$/,
    stuck: /^(?:i(?:'m| am) (?:stuck|lost|confused)|(?:i )?(?:don'?t|do not) know what to do(?: next)?|help me|i need help|what do i do)\??$/,
    make: /^(?:what can i (?:make|build|create)(?: here| with (?:this|tribecode))?|give me (?:an? )?(?:idea|ideas)|inspire me|(?:some )?ideas?(?: please)?|what should i (?:make|build))\??$/,
    ship: /^(?:how do i (?:ship|publish|launch|release|share)(?: (?:this|it|my (?:app|game|site|website|project)))?|how (?:do|can) (?:people|others|friends) (?:see|open|play|use) (?:this|it)|(?:ship|publish|launch) (?:it|this) how)\??$/,
  };
  async function flint(text) {
    const t = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
    const kind = RX.make.test(t) ? 'make' : RX.ship.test(t) ? 'ship' : RX.stuck.test(t) ? 'stuck' : RX.next.test(t) ? 'next' : '';
    if (!kind) return null;
    if (kind === 'make') {
      const I = IDEAS, pickOne = a => a[Math.floor(Math.random() * a.length)];
      return { text: `${T('A few things people make here:')}\n\n- **${T('Website')}**: ${T(pickOne(I.website))}\n- **${T('Game')}**: ${T(pickOne(I.game))}\n- **${T('App')}**: ${T(pickOne(I.app))}\n- **${T('More')}**: ${T(pickOne(I.more))}\n\n${T('Pick one and say it in your own words. I can start it from a sentence.')}`,
        acts: [[T('Make a website'), 'fill', 'make a website for '], [T('Make a game'), 'fill', 'make a game called '], [T('Open Design'), 'nextstep', 'design'], [T('More ideas'), 'ask', 'inspire me']] };
    }
    const st = await state(), n = pick(st, snoozed());
    if (kind === 'ship') {
      const todo = steps(st).filter(s => !s.done && ['build', 'check', 'publish'].includes(s.id));
      const line = !st.project ? T('Start a project first, then build something you can open.') : !todo.length ? T('It is already published. Open Publish to copy the link or publish again.') : `${T('To ship it:')} ${todo.map((s, i) => `${i + 1}. ${T(s.title)}`).join(' ')}`;
      return { text: line, acts: [[T((todo[0] || { act: 'Publish' }).act), 'nextstep', (todo[0] || { run: 'publish' }).run], [T('How publishing works'), 'nextstep', 'learn']] };
    }
    // one voice: a task of your own is simply one of the engine's steps (usually the top one)
    const lead = kind === 'stuck' ? T('No problem. Here is the one thing I would do next:') : T('Next:');
    const where = st.project ? ` ${T('You are at')} ${T(STAGES.find(s => s[0] === n.stage)[1])} (${n.stages.filter(s => s.done).length}/${STAGES.length}).` : '';
    return { text: `${lead} **${T(n.best.title)}**. ${T(n.best.why)}${where}`, acts: [[T(n.best.act), 'nextstep', n.best.run], ...n.alts.map(a => [T(a.title), 'nextstep', a.run]), [T('See all of it'), 'nextstep', 'open']] };
  }
  // a chip from Flint's reply: "nextstep:<run>"
  function act(runName) { if (runName === 'open') return open(); state().then(st => { const s = [...steps(st), ...SIDE(st)].find(x => x.run === runName) || { run: runName, id: runName }; run(s); }); }

  // ---------- the sheet ----------
  let el = null, scrim = null;
  function close() { if (el) el.remove(); if (scrim) scrim.remove(); el = scrim = null; document.removeEventListener('keydown', onKey, true); }
  function onKey(e) { if (e.key === 'Escape' && el) { e.stopPropagation(); e.preventDefault(); close(); } }
  const strip = n => `<ol class="ns-strip" aria-label="${esc(T('Where this project is'))}">${n.stages.map(s => `<li class="${s.done ? 'done' : ''}${s.here ? ' here' : ''}"${s.here ? ' aria-current="step"' : ''}><i aria-hidden="true">${s.done ? ic('check', 12) : ''}</i><span>${esc(T(s.label))}</span></li>`).join('')}</ol>`;
  async function open() {
    close();
    scrim = document.createElement('div'); scrim.className = 'nx-scrim'; scrim.onclick = close;
    el = document.createElement('div'); el.className = 'nx-sheet ns-sheet'; el.id = 'ns-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', T('What should I do next?'));
    el.innerHTML = `<header class="nx-h"><div><span class="eyebrow">${esc(T('Next'))}</span><h3>${esc(T('What should I do next?'))}</h3></div><button type="button" class="nx-x" data-ns-x aria-label="${esc(T('Close'))}">${ic('x', 16)}</button></header><div class="ns-body"><p class="ns-wait">${esc(T('Looking at your project…'))}</p></div>`;
    document.body.append(scrim, el); document.addEventListener('keydown', onKey, true);
    const mine = el, n = await next(); if (el !== mine) return;
    draw(n);
  }
  function draw(n) {
    const b = n.best, body = el.querySelector('.ns-body'), by = {};
    [b, ...n.alts].forEach(s => { by[s.id] = s; });
    body.innerHTML = `${proj() && connected() ? strip(n) : ''}
      <section class="ns-best" data-ns-step="${esc(b.id)}"><span class="eyebrow">${esc(T(n.done ? 'All six done' : 'Do this next'))}</span><h4>${esc(T(b.title))}</h4><p>${esc(T(b.why))}</p>
        <div class="ns-acts"><button type="button" class="btn primary" data-ns-run="${esc(b.id)}">${esc(T(b.act))}</button>${b.id !== 'start' && b.id !== 'keepgoing' ? `<button type="button" class="btn ghost" data-ns-not="${esc(b.id)}">${esc(T('Not now'))}</button>` : ''}</div></section>
      ${n.alts.length ? `<span class="eyebrow ns-e">${esc(T('Or'))}</span><div class="nx-rows">${n.alts.map(a => `<button type="button" class="nx-row" data-ns-run="${esc(a.id)}"><span class="nx-t"><b>${esc(T(a.title))}</b><small>${esc(T(a.why))}</small></span></button>`).join('')}</div>` : ''}
      <span class="eyebrow ns-e">${esc(T('Things you can ask Flint'))}</span><div class="ns-asks">${prompts().map(p => `<button type="button" class="ns-ask" data-ns-ask="${esc(p)}">${esc(T(p))}</button>`).join('')}</div>
      <footer class="ns-foot"><button type="button" class="linkish" data-ns-learn>${esc(T('Open the Help center'))}</button><label class="ns-sw"><input type="checkbox" data-ns-nudge${nudges() ? ' checked' : ''}> <span>${esc(T('Offer a next step when I look stuck'))}</span></label></footer>`;
    el.onclick = e => {
      if (e.target.closest('[data-ns-x]')) return close();
      const r = e.target.closest('[data-ns-run]'); if (r) return run(by[r.dataset.nsRun]);
      const no = e.target.closest('[data-ns-not]'); if (no) { snooze(no.dataset.nsNot); next().then(x => el && draw(x)); refreshAll(); return; }
      const a = e.target.closest('[data-ns-ask]'); if (a) { close(); const F = window.TribeFlint; if (F && F.prefill) F.prefill(a.dataset.nsAsk); return; }
      if (e.target.closest('[data-ns-learn]')) { close(); window.TribeGuide && window.TribeGuide.home && window.TribeGuide.home(); }
    };
    const sw = el.querySelector('[data-ns-nudge]'); if (sw) sw.onchange = () => nudges(sw.checked);
    const f = el.querySelector('[data-ns-run]'); if (f) f.focus({ preventScroll: true });
  }

  // ---------- the card (dashboard) and the chip (project header) ----------
  const cards = new Set();
  async function card(box) {
    if (!box) return; cards.add(box);
    const n = await next(); if (!box.isConnected) { cards.delete(box); return; }
    const b = n.best;
    box.innerHTML = `<section class="ns-card" id="ns-card" data-ns-step="${esc(b.id)}" aria-label="${esc(T('Next step'))}">
      <div class="ns-card-h"><span class="eyebrow">${esc(T('Next step'))}</span>${strip(n)}</div>
      <div class="ns-card-b"><div class="ns-card-t"><h3>${esc(T(b.title))}</h3><p>${esc(T(b.why))}</p></div>
      <div class="ns-acts"><button type="button" class="btn primary" data-ns-go>${esc(T(b.act))}</button><button type="button" class="btn ghost" data-ns-more>${esc(T('Other options'))}</button></div></div>
      ${n.alts.length ? `<div class="ns-card-alts"><span class="eyebrow">${esc(T('Or'))}</span>${n.alts.map((a, i) => `<button type="button" class="linkish" data-ns-alt="${i}">${esc(T(a.title))}</button>`).join('')}</div>` : ''}</section>`;
    box.querySelectorAll('[data-ns-alt]').forEach(x => { x.onclick = () => run(n.alts[+x.dataset.nsAlt]); });
    box.querySelector('[data-ns-go]').onclick = () => run(b);
    box.querySelector('[data-ns-more]').onclick = open;
  }
  function chip() {
    let c = document.getElementById('ns-chip'); if (c) return c;
    c = document.createElement('button'); c.type = 'button'; c.id = 'ns-chip'; c.className = 'ns-chip'; c.title = T('What should I do next?'); c.setAttribute('aria-label', T('What should I do next?'));
    c.innerHTML = `${ic('flag', 14)}<span>${esc(T('Next'))}</span>`; c.onclick = open;
    return c;
  }
  let rt; const refreshAll = () => { clearTimeout(rt); rt = setTimeout(() => { cards.forEach(b => (b.isConnected ? card(b) : cards.delete(b))); }, 500); };

  // ---------- empty states: ONE pattern, TribeUI.empty (uikit.js). This engine is its action provider ----------
  // TribeUI.emptyAction(kind, el) -> { label, run }: the step that fills that kind of empty place, else the last best step.
  const EMPTY_RUN = { tasks: 'task', task: 'task', board: 'task', design: 'design', canvas: 'design', files: 'build', preview: 'build', site: 'design', website: 'design', publish: 'publish', people: 'invite', friends: 'invite', agents: 'ai', company: 'company', vision: 'vision' };
  const EMPTY_LABEL = { task: 'New task', design: 'Open Design', build: 'Ask Flint to build it', publish: 'Publish', invite: 'Invite', ai: 'Add an AI helper', company: 'Open Company', vision: 'Write it' };
  let lastBest = null;
  function emptyAction(kind) {
    const r = EMPTY_RUN[String(kind || '').toLowerCase()];
    if (r) return { label: T(EMPTY_LABEL[r]), run: () => act(r) };
    if (lastBest && lastBest.id !== 'keepgoing') { const b = lastBest; return { label: T(b.act), run: () => run(b) }; }
    return { label: T('What should I do next?'), run: open };
  }
  function provide() { const U = window.TribeUI; if (U && U.emptyAction !== emptyAction) U.emptyAction = emptyAction; return !!U; }
  if (!provide()) { addEventListener('DOMContentLoaded', provide); addEventListener('load', provide); }
  // TribeNextStep.empty is only an alias of TribeUI.emptyHTML now (a plain fallback until uikit.js is on this branch)
  const empty = o => { const U = window.TribeUI, a = o.action || (o.act ? { label: o.act, run: () => (o.run && o.run !== 'open' ? act(o.run) : open()) } : null);
    if (U && U.emptyHTML) return U.emptyHTML({ title: o.title, line: o.line, kind: o.kind || o.id || '', action: a, how: o.how });
    return `<div class="ui-empty ns-empty" data-ui-kind="${esc(o.kind || o.id || '')}"><b>${esc(T(o.title))}</b><p>${esc(T(o.line))}</p>${a ? `<button type="button" class="btn primary" data-ns-emp="${esc(o.run || 'open')}">${esc(T(a.label))}</button>` : ''}</div>`; };
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-ns-emp]'); if (!b) return; e.preventDefault(); const r = b.dataset.nsEmp; if (r === 'open') open(); else act(r); });

  // ---------- stuck, gently: offer the next step once, never nag ----------
  const NUDGE = 'tribecode.next.nudges';
  function nudges(on) { if (on === undefined) return ls.get(NUDGE) !== '0'; ls.set(NUDGE, on ? null : '0'); return !!on; }
  let offered = false, idleT = null, fails = [], lastFail = '';
  const emptyOnScreen = () => [...document.querySelectorAll('.ui-empty, .ns-empty, .pj-empty, .empty, [class*="-empty"]:not(.hidden)')].some(n => n.offsetParent && n.getBoundingClientRect().height > 40 && !n.closest('#guide, .nx-sheet, .help-menu'));
  function offer(reason) {
    if (offered || !nudges() || el || navigator.webdriver && !window.__nsNudgeTest) return;
    if (document.querySelector('.nx-sheet, .modal:not(.hidden), #guide:not(.hidden), #fg-bubble.on, .pz-layer:not(.hidden)')) return;
    offered = true;
    let n = document.getElementById('ns-nudge'); if (n) n.remove();
    n = document.createElement('div'); n.id = 'ns-nudge'; n.className = 'nx-nudge ns-nudge'; n.setAttribute('role', 'status');
    n.innerHTML = `<span class="nx-dot" aria-hidden="true"></span><span class="nx-nt"><b>${esc(T(reason === 'fail' ? 'That didn\'t work twice' : 'Not sure what to do here?'))}</b><small>${esc(T('I can show the one next step for this project.'))}</small></span><button type="button" class="btn sm primary" data-ns-show>${esc(T('Show me'))}</button><button type="button" class="nx-x" aria-label="${esc(T('Close'))}">${ic('x', 14)}</button>`;
    document.body.appendChild(n);
    n.querySelector('[data-ns-show]').onclick = () => { n.remove(); open(); };
    n.querySelector('.nx-x').onclick = () => n.remove();
    setTimeout(() => n.isConnected && n.remove(), 12000);
  }
  const IDLE_MS = () => window.__nsIdleMs || 45000;
  function armIdle() { clearTimeout(idleT); if (offered) return; idleT = setTimeout(() => { if (emptyOnScreen()) offer('idle'); }, IDLE_MS()); }
  ['pointerdown', 'keydown', 'hashchange'].forEach(ev => addEventListener(ev, armIdle, true));
  setTimeout(armIdle, 3000);
  // the same failing action twice in a minute (the app's error toasts)
  function failed(msg) { const now = Date.now(); fails = fails.filter(t => now - t < 60000); if (msg && msg === lastFail) fails.push(now); else fails = [now]; lastFail = msg; if (fails.length >= 2) offer('fail'); }
  let lastT = 0; const seeToast = () => { const t = document.querySelector('.toast.t-err:not(.hidden)'); if (t && Date.now() - lastT > 800) { lastT = Date.now(); failed((t.textContent || '').trim().slice(0, 80)); } };
  const watch = () => { try { new MutationObserver(seeToast).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true }); } catch {} };
  if (document.body) watch(); else addEventListener('DOMContentLoaded', watch);

  // ---------- keep the card and the chip in step with the project ----------
  function mountChip() {
    const head = document.querySelector('#pj-overview .pj-title2'); if (!head || head.querySelector('#ns-chip')) return;
    const c = chip(), inv = head.querySelector('#pj-invite');
    if (inv) { c.style.marginLeft = 'auto'; inv.style.marginLeft = '8px'; inv.before(c); } else { c.style.marginLeft = 'auto'; head.appendChild(c); }
  }
  function mountCard() { const slot = document.getElementById('pj-next-slot'); if (slot) card(slot); mountChip(); }
  const hook = () => { const Cl = C(); if (!Cl || !Cl.on) return setTimeout(hook, 400); ['task', 'doc', 'vision', 'repo', 'cnv-op', 'publish', 'site-config', 'presence', 'project'].forEach(t => { try { Cl.on(t, refreshAll); } catch {} }); };
  hook();
  document.addEventListener('tribe:nextstep', () => setTimeout(refreshAll, 1500));

  window.TribeNextStep = { state, next, open, close, card, chip, mount: mountCard, flint, act, prompts, ideas, empty, emptyAction, _provide: provide, nudges, pick, steps, STAGES, _failed: failed, _offer: offer, refresh: refreshAll };
})();
