// Flint grows your idea (feat/flint-ai): he knows where the learning lives in TribeCode (the Academy's lessons, the
// Guide, Legal templates, the build kit and Studios, the Marketplace, the 16 website templates, the docs) and points you
// at the right one for what you're growing: a company, an app or game, a website, and the cohesion between the three.
//   "Grow my idea" -> 2–3 tappable questions -> a short plan that links company + app + website + resources.
// Everything here is rules plus the local knowledge base (/api/flint/kb, TF-IDF over the Guide and docs); with an AI on,
// the plan is refined in place (/api/ai/refine 'home.plan'). It also carries Flint's dashboard abilities: today's plan,
// the inspiration board, "use my board's style", open your files, start a project, explain a feature. Works with no tribe.
//   window.TribeFlintGrow = { flint(text) -> { text, acts } | null, run(arg), RES, recommend(goal), plan(answers), today() }
(function () {
  'use strict';
  const C = () => window.TribeClient, F = () => window.TribeFlint, AI = () => window.TribeAICore;
  const connected = () => !!(C() && C().connected && C().connected());
  const proj = () => { const st = C() ? C().state() : {}, id = window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current(); return connected() && id ? ((st.projects || []).find(p => p.id === id) || null) : null; };
  const act = (label, a, arg) => ({ label, act: a, arg: arg == null ? '' : String(arg) });
  const GH = 'https://github.com/orionopenwow/TribeCode/blob/main/docs/';

  // ---------- where the learning lives (deep links) ----------
  const RES = {
    'academy:founder': { e: '🎓', t: 'Academy · Founder basics', why: 'idea to first customers, in short lessons', tribe: true },
    'academy:ceo': { e: '🎓', t: 'Academy · CEO', why: 'goals, decisions and running the week', tribe: true },
    'academy:cto': { e: '🎓', t: 'Academy · Build', why: 'shipping the app without drowning', tribe: true },
    'academy:design': { e: '🎓', t: 'Academy · Design', why: 'a clear main screen and a brand that holds together', tribe: true },
    'academy:growth': { e: '🎓', t: 'Academy · Growth', why: 'finding the first 10 people who want it', tribe: true },
    'academy:sales': { e: '🎓', t: 'Academy · Sales', why: 'talking to people who could pay', tribe: true },
    'academy:finance': { e: '🎓', t: 'Academy · Finance', why: 'what you spend and earn each week', tribe: true },
    'academy:legal': { e: '🎓', t: 'Academy · Legal', why: 'the basics before you sign anything', tribe: true },
    'legal:terms': { e: '⚖️', t: 'Legal · Terms of service', why: 'a starting template (not legal advice)', tribe: true },
    'legal:privacy': { e: '⚖️', t: 'Legal · Privacy page', why: 'what your app or site collects, said plainly', tribe: true },
    'legal:cofounder': { e: '⚖️', t: 'Legal · Co-founder agreement', why: 'who owns what, before it matters', tribe: true },
    'company': { e: '🏢', t: 'Company mode', why: 'seats with charters, goals and decisions for the project', tribe: true },
    'website': { e: '🌐', t: 'Website', why: 'a draft site from what the project already has', tribe: true },
    'sites': { e: '🧩', t: '16 website templates', why: 'bakery to band to SaaS, ready to fill in', tribe: true },
    'buildkit': { e: '🧰', t: 'Build kit & Studios', why: 'the open-source stack Flint and the AI helpers build with, plus free creative tools' },
    'market': { e: '🛒', t: 'Marketplace', why: 'widgets, templates, skills and connectors', tribe: true },
    'board': { e: '🎨', t: 'Inspiration board', why: 'openly licensed pictures and sounds; Flint matches your style to it' },
    'guide:start-here': { e: '📘', t: 'Guide · Start here', why: 'TribeCode in five minutes' },
    'guide:company-mode': { e: '📘', t: 'Guide · Company mode', why: 'how seats, goals and approvals fit together' },
    'guide:academy-legal-offload': { e: '📘', t: 'Guide · Academy, Legal and Offload', why: 'learn a role, draft a document, do it free elsewhere' },
    'guide:marketplace': { e: '📘', t: 'Guide · Marketplace', why: 'what you can add and how' },
    'guide:repos-versions-pushing': { e: '📘', t: 'Guide · Code, versions, pushing', why: 'where the app lives and how it ships' },
    'doc:DESIGN-SYSTEM.md': { e: '📄', t: 'Docs · Design system', why: 'how TribeCode keeps one look, a model for yours' },
    'doc:FLINT-TIERS.md': { e: '📄', t: 'Docs · What Flint does for free', why: 'what needs no AI, and what a stronger AI adds' },
  };
  const GOALS = {
    company: { name: 'the company', res: ['academy:founder', 'company', 'academy:ceo', 'legal:cofounder', 'academy:finance', 'guide:company-mode'] },
    app: { name: 'the app', res: ['buildkit', 'academy:cto', 'guide:repos-versions-pushing', 'market', 'doc:FLINT-TIERS.md'] },
    website: { name: 'the website', res: ['website', 'sites', 'academy:growth', 'legal:privacy', 'legal:terms'] },
    cohesion: { name: 'one brand across all three', res: ['board', 'academy:design', 'doc:DESIGN-SYSTEM.md', 'website'] },
    learn: { name: 'learning', res: ['guide:start-here', 'academy:founder', 'guide:academy-legal-offload'] },
  };
  function goalOf(t) {
    t = String(t || '').toLowerCase();
    if (/\b(cohes|consisten|brand|same look|match|together|style|identity)\b/.test(t)) return 'cohesion';
    if (/\b(company|business|startup|start-?up|founder|ceo|legal|money|finance|funding|incorporat|co-?founder|revenue)\b/.test(t)) return 'company';
    if (/\b(web ?site|landing|home ?page|seo|domain)\b/.test(t)) return 'website';
    if (/\b(app|game|code|build|ship|feature|mobile|ios|android)\b/.test(t)) return 'app';
    return 'learn';
  }
  const recommend = goal => (GOALS[goal] || GOALS.learn).res.map(k => ({ key: k, ...RES[k] }));
  function open(key) {
    const [k, arg] = String(key).split(':'), A = window.TribeApp, tribeOnly = RES[key] && RES[key].tribe && !connected();
    if (tribeOnly) { const g = { academy: 'academy-legal-offload', legal: 'academy-legal-offload', company: 'company-mode', market: 'marketplace', website: 'start-here', sites: 'start-here' }[k]; if (window.TribeGuide) window.TribeGuide.open(g); return F() && F().say(`That one lives inside a tribe. I opened the Guide page about it; start a project and it's one tap away.`, [act('Start a project', 'grow', 'start')]); }
    if (k === 'academy' && window.TribeAcademy) return window.TribeAcademy.open({ tab: 'learn', track: arg });
    if (k === 'legal' && window.TribeLegal) return window.TribeLegal.open(arg);
    if (k === 'guide' && window.TribeGuide) return window.TribeGuide.open(arg);
    if (k === 'company' && window.TribeCompany) return window.TribeCompany.go ? window.TribeCompany.go() : window.TribeCompany.open();
    if (k === 'website') return window.TribeShell ? window.TribeShell.go('website') : window.TribeWebsite && window.TribeWebsite.open();
    if (k === 'sites' && window.TribeSiteLib) return window.TribeSiteLib.open({ pid: proj() && proj().id });
    if (k === 'buildkit' && window.TribeStudios) return window.TribeStudios.open();
    if (k === 'market' && window.TribeMarket) return window.TribeMarket.open();
    if (k === 'board' && window.TribeInspoBoard) return window.TribeInspoBoard.open();
    if (k === 'doc') return window.open(GH + arg, '_blank', 'noopener');
    if (A && A.toast) A.toast('That isn\'t available here yet.');
  }
  const resActs = list => list.slice(0, 4).map(r => act(`${r.e} ${r.t.replace(/^[^·]+· /, '')}`, 'res', r.key));
  const resLines = list => list.map(r => `${r.e} **${r.t}**: ${r.why}`).join('\n');

  // ---------- "Grow your idea": three tappable questions, then a plan ----------
  let flow = null;
  const Q = [
    { id: 'what', q: 'What are you growing?', a: [['company', 'A company'], ['app', 'An app or game'], ['website', 'A website'], ['all', 'All three, together']] },
    { id: 'stage', q: 'Where is it now?', a: [['idea', 'Just an idea'], ['works', 'Something works'], ['users', 'People use it']] },
    { id: 'need', q: 'What would help most right now?', a: [['clarity', 'Knowing what to do'], ['users', 'Finding people'], ['money', 'Money and the legal bits'], ['looks', 'Making it look like one thing']] },
  ];
  const ask = i => ({ text: `${i === 0 ? 'Let\'s grow it. ' : ''}${Q[i].q}`, acts: Q[i].a.map(([v, l]) => act(l, 'grow', `${Q[i].id}:${v}`)) });
  function plan(ans, p) {
    const name = (p && p.name) || 'your idea', what = ans.what || 'all', stage = ans.stage || 'idea', need = ans.need || 'clarity';
    const parts = [], keys = new Set(), use = (...k) => k.forEach(x => keys.add(x));
    const co = { idea: `Write the one-line promise of ${name} and who it's for. Make the project a company and give the seats a goal each.`, works: `Make ${name} a company: a CEO seat with this month's goal, a Build seat and a Grow seat.`, users: `Set this month's goal from what users ask for most; give Money a weekly line.` }[stage];
    const app = { idea: 'Build a free first version from a recipe (no AI needed), then show it to two friends.', works: 'Pick the one feature people use most and make it great; split the rest into small tasks.', users: 'Ship weekly: a short changelog each time, and fix what users trip over first.' }[stage];
    const web = { idea: 'A one-page site from the templates: the promise, a picture, a way to sign up.', works: 'A site with screenshots of what works and a play or sign-up link.', users: 'Add real quotes from users and a clear next step on the site.' }[stage];
    if (what === 'company' || what === 'all') { parts.push(`🏢 **Company**: ${co}`); use('company', 'academy:founder'); }
    if (what === 'app' || what === 'all') { parts.push(`🛠️ **App**: ${app}`); use('buildkit', 'academy:cto'); }
    if (what === 'website' || what === 'all') { parts.push(`🌐 **Website**: ${web}`); use('website', 'sites'); }
    parts.push(`🎨 **One thing, not three**: one name, one promise and one palette everywhere. Save a few pictures to your board and tap "Use my board's style" so the app and the site match.`); use('board');
    if (need === 'users') { parts.push('👋 **Next for you**: the Growth lessons, then post the site where your people already are.'); use('academy:growth'); }
    if (need === 'money') { parts.push('💸 **Next for you**: a weekly money line, then terms and a privacy page from the Legal templates (a starting point, not legal advice).'); use('academy:finance', 'legal:terms', 'legal:privacy'); }
    if (need === 'looks') { parts.push('✨ **Next for you**: the Design lessons and your inspiration board.'); use('academy:design'); }
    if (need === 'clarity') { parts.push('🧭 **Next for you**: Founder basics, then one task per seat for this week.'); use('academy:founder', 'guide:start-here'); }
    const list = [...keys].map(k => ({ key: k, ...RES[k] }));
    return { text: parts.join('\n\n'), res: list };
  }
  async function refine(kind, input, draft) {   // ✦ with an AI on: same place, better words; without, the plan stands
    if (!connected()) return null;
    const on = window.TribeAIBasics ? await window.TribeAIBasics.online() : { online: false }; if (!on.online) return null;
    try { const r = await C().api('/ai/refine', { method: 'POST', body: { kind, input, draft } }); return r && r.text ? r : null; } catch { return null; }
  }
  async function step(arg) {
    const [k, v] = String(arg || '').split(':');
    if (k === 'start') return startProject();
    if (k === 'restart' || !flow) flow = { i: 0, ans: {} };
    if (k && k !== 'restart' && v) { flow.ans[k] = v; flow.i = Q.findIndex(q => q.id === k) + 1; }
    if (flow.i < Q.length) { const a = ask(flow.i); return F().say(a.text, a.acts); }
    const p = proj(), ans = flow.ans, out = plan(ans, p); flow = null;
    const msg = F().say(`Here's a short plan for ${p ? p.name : 'your idea'}:\n\n${out.text}`, [...resActs(out.res), act('Start over', 'grow', 'restart')]);
    const r = await refine('home.plan', { goal: 'grow the idea: company, app and website, as one', project: p ? { name: p.name, bio: p.bio || '' } : null, answers: ans }, out.text);
    if (r && msg) { msg.text = `Here's a short plan for ${p ? p.name : 'your idea'} (✦ ${r.via}):\n\n${r.text}`; msg.via = r.via; F().redraw && F().redraw(); }
    return msg;
  }

  // ---------- today's plan (Home) ----------
  async function today() {
    const core = AI(); if (!core) return null;
    const st = C() ? C().state() : {}, me = st.me && st.me.id;
    let tasks = [], events = [];
    if (connected()) { try { tasks = (await C().api('/tasks')).tasks || []; } catch {} try { const d = new Date(), y = d.toISOString().slice(0, 10); const r = await C().api(`/calendar?from=${y}&to=${y}`); events = r.events || r.items || []; } catch {} }
    const notes = (window.TribeHub && window.TribeHub.scratch && window.TribeHub.scratch.notes && window.TribeHub.scratch.notes()) || [];
    const p = core.planDay({ me, tasks, events, notes, connected: connected() });
    const acts = p.items.slice(0, 3).map(x => x.kind === 'task' ? act(`Open “${x.t.slice(0, 28)}${x.t.length > 28 ? '…' : ''}”`, 'nav', 'tasks') : x.kind === 'note' ? act('Open the note', 'note', x.ref) : x.kind === 'start' ? act(connected() ? 'Add a task' : 'Start a project', connected() ? 'ask' : 'grow', connected() ? 'task: ' : 'start') : act('Open the calendar', 'nav', 'calendar'));
    const msg = F().say(`✦ Today's plan:\n${p.items.map((x, i) => `${i + 1}. **${x.t}**: ${x.why}`).join('\n')}`, acts);
    const r = await refine('home.plan', p.items.map(x => `${x.t} (${x.why})`).join('\n'), p.text);
    if (r && msg) { msg.text = `✦ Today's plan (via ${r.via}):\n${r.text}`; msg.via = r.via; F().redraw && F().redraw(); }
    return msg;
  }
  function startProject() {
    const host = document.querySelector('#hub-host');
    if (!connected() && host) { host.click(); return F().say('Starting your first project on this computer…'); }
    if (connected() && window.TribeShell && window.TribeShell.openNew) { window.TribeShell.openNew(); return F().say('Pick a name and I\'ll set it up.'); }
    if (window.TribeApp && window.TribeApp.openInvite) window.TribeApp.openInvite();
    return F().say('Projects live in a tribe. Get the desktop app to host one, or join a friend with their link.', [act('How hosting works', 'guide', 'hosting')]);
  }
  function openFiles() { if (window.TribeHub) { window.TribeHub.open('docs'); return F().say('Opened your files: your notes, your docs and anything you uploaded, across projects.'); } return null; }

  // ---------- explain a feature (local knowledge base, no model) ----------
  const FEATURES = /\b(inspiration board|mood ?board|flint|company mode|academy|marketplace|canvas|design canvas|website|jam|jams|huddle|autopilot|secretary|tribe|projects?|the board|task board|captures|whiteboard|studios|build kit|offload|legal templates|✦|ai basics|sparkle)\b/i;
  async function explain(q) {
    let a = null;
    try { const base = C() ? C().base() : ''; const tok = window.TribeStore && (window.TribeStore.get().server || {}).token; const r = await fetch(base + '/api/flint/kb?k=1&q=' + encodeURIComponent(q), { headers: tok ? { Authorization: 'Bearer ' + tok } : {} }); if (r.ok) a = ((await r.json()).answers || [])[0]; } catch {}
    if (!a) return null;
    return { text: `${a.title}${a.heading ? ` › ${a.heading}` : ''}: ${a.snippet}`, acts: a.slug ? [act('Open in Guide', 'guide', a.slug)] : [act('Read it', 'res', 'doc:' + String(a.file || '').replace(/^docs\//, ''))] };
  }

  // ---------- the router (flint.js special() asks this first) ----------
  async function route(text) {
    const t = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '');
    let m;
    if (/\b(resources?|courses?|lessons?|tutorials?|education|teach me|where (?:can|do) i learn|learn (?:about|how)|how do i (?:start|run|grow|launch|build) (?:a|my|our) (?:company|business|startup|website|app|brand))\b/.test(t)) {
      const g = goalOf(t), list = recommend(g);
      return F().say(`For ${GOALS[g].name}, start here:\n${resLines(list.slice(0, 4))}`, [...resActs(list), act('Grow my idea', 'grow', 'restart')]);
    }
    if (/\b(grow|develop|expand|flesh out)\b.*\b(idea|company|business|startup|app|project|brand)\b|^grow\b|\bhelp me (plan|start) (a|my|our) (company|business|startup)\b/.test(t)) { flow = { i: 0, ans: {} }; return step(''); }
    if (/\b(use|apply)\b.*\b(my|the)\b.*\bboard'?s?\b.*\b(style|look|colou?rs?|palette)\b|\b(match|adapt( to)?)\b.*\bmy (board|style)\b|^style (it|this) like my board\b/.test(t)) {
      if (!window.TribeInspoBoard) return null; const r = await window.TribeInspoBoard.useStyle();
      return r ? F().say(`Done. ${r.changed.join('; ') || 'Nothing changed'}. Fonts that pair with your board: ${r.style.fonts.join(' + ')}.`, [act('Open my board', 'res', 'board')]) : F().say('Save a few pictures to your inspiration board first: I read their colors.', [act('Open my board', 'res', 'board')]);
    }
    if ((m = /^(?:find|search(?: for)?|show me|get me|look for)\s+(?:some\s+)?(pictures?|images?|photos?|sounds?|sound effects?|music)\s+(?:of|for|like|about|with)\s+(.+)$/.exec(t)) || (m = /^search (?:openverse|the board|my board)(?: for)?\s+()(.+)$/.exec(t))) {
      if (!window.TribeInspoBoard) return null; const type = /sound|music/.test(m[1]) ? 'audio' : 'image';
      window.TribeInspoBoard.open({ q: m[2], type }); return F().say(`Searching openly licensed ${type === 'audio' ? 'sounds' : 'pictures'} for “${m[2]}”. Save what you like: each one keeps its credit, and I read the board to match your style.`, [act('Use my board\'s style', 'usestyle')]);
    }
    if (/^(?:open |show )?(?:my |the )?(?:inspiration|inspo|mood ?board|pinterest)(?: board)?$|^open my board$/.test(t)) { if (!window.TribeInspoBoard) return null; window.TribeInspoBoard.open(); return F().say('Opened your inspiration board. Search pictures or sounds, save what you like, then "Use my board\'s style".'); }
    if (/^(?:what'?s |make |show )?(?:my |the |today'?s )?(?:plan(?: for)? (?:my day|today)|plan my day|today'?s plan|plan for today|what'?s (?:on )?(?:for )?today)\??$/.test(t)) return today();
    if (/^(?:open|show)(?: me)? (?:my|all)(?: global)? (?:files|docs|notes)$/.test(t)) return openFiles();
    if (/^(?:start|create|make|begin)(?: a| my| our)?(?: new| first)? project$/.test(t)) return startProject();
    if ((m = /^(?:explain|what is|what's|whats|tell me about|how does)\s+(?:the\s+|a\s+)?(.+?)(?:\s+work)?\??$/.exec(t)) && FEATURES.test(m[1])) { const r = await explain(m[1]); if (r) return F().say(r.text, r.acts); }
    return null;
  }
  async function flint(text) { if (!F()) return null; const r = await route(text); return r ? true : null; }
  function run(a, arg) { if (a === 'res') return open(arg); if (a === 'grow') return step(arg); if (a === 'usestyle') return route('use my board\'s style'); if (a === 'today') return today(); if (a === 'files') return openFiles(); if (a === 'start') return startProject(); }
  window.TribeFlintGrow = { flint, run, RES, GOALS, recommend, plan, today, goalOf, open };
})();
