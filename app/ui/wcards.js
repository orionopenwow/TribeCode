// Live widget cards (feat/widgets-v2): the small cards the "+ Add" picker puts in the sidebar, in a project and on Home.
// Each card has the same shell: an icon, a title and a ⋯ menu (Settings when it has any, Refresh, Rename, Move up/down,
// Remove), then real data, a calm empty state with one action, or an error with Retry. Cards that read the tribe's data
// (tasks, presence, milestones, the build…) reload when a matching socket message arrives; cards that keep their own
// state (note, checklist, bookmarks, countdown, poll) save it on the host (server/widgets.js, POST /api/widgets/act) and
// reach everyone live. widgets.js owns the list, the picker and the order; this file draws the cards.
// Public: window.TribeCards = { META, mount(box, list, ctx), live(msg), mini(key), keys(scope) }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = (n, s = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, s, 'i') : '');
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const me = () => (C.state && C.state().me) || {};
  const go = k => { document.body.classList.remove('drawer-open'); window.TribeShell && window.TribeShell.go(k); };
  const ago = t => { const s = Math.max(0, (Date.now() - Date.parse(t)) / 1000); if (!isFinite(s)) return ''; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
  const span = ms => { if (ms <= 0) return 'now'; const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${Math.max(1, m)}m`; };
  const empty = (text, act, label) => `<div class="wgc-empty"><p>${esc(text)}</p>${act ? `<button type="button" class="btn sm" data-wgc-act="${esc(act)}">${esc(label)}</button>` : ''}</div>`;
  const api = (p, o) => C.api(p, o);

  // ---------- the catalogue: what each card is, where it can sit, and how it loads ----------
  // cat: Team · Plan · Build · Notes · You. live: socket message types that reload it. multi: more than one allowed.
  const META = {
    mytasks: { label: 'My tasks', icon: 'tasks', cat: 'Team', blurb: 'What is yours, with Accept', live: ['task', 'task-removed'] },
    presence: { label: "Who's here", icon: 'people', cat: 'Team', blurb: 'Who is online and where', live: ['presence'], home: 1 },
    activity: { label: 'Recent activity', icon: 'pulse', cat: 'Team', blurb: 'The latest changes, newest first', live: ['task', 'repo', 'repo-activity', 'visual', 'proposal', 'website'], home: 1 },
    clocks: { label: 'Team clocks', icon: 'clock', cat: 'Team', blurb: "Everyone's local time", live: ['presence'], home: 1 },
    poll: { label: 'Poll', icon: 'poll', cat: 'Team', blurb: 'Ask a question, the tribe votes', multi: 1, own: 1 },
    timeline: { label: 'Milestones timeline', icon: 'flag', cat: 'Plan', blurb: 'Each milestone and its progress', live: ['milestones', 'task', 'task-removed'] },
    ritual: { label: 'Next standup', icon: 'timer', cat: 'Plan', blurb: 'Countdown to the next ritual', live: ['event', 'event-removed', 'ritual'] },
    countdown: { label: 'Countdown', icon: 'calendar', cat: 'Plan', blurb: 'Days left until a date', multi: 1, own: 1, home: 1 },
    checklist: { label: 'Checklist', icon: 'checklist', cat: 'Plan', blurb: 'A short shared list to tick off', multi: 1, own: 1, home: 1 },
    build: { label: 'Build status', icon: 'bolt', cat: 'Build', blurb: 'Passing or failing: real checks, agents and CI', live: ['dashband', 'checks'] },
    ship: { label: 'Ship & sync', icon: 'git', cat: 'Build', blurb: 'Saved changes not shipped yet', live: ['ship', 'repo'] },
    thumb: { label: 'Preview', icon: 'preview', cat: 'Build', blurb: 'A picture of the running app', live: ['visual', 'preview'] },
    sitestatus: { label: 'Website status', icon: 'globe', cat: 'Build', blurb: 'Draft or built, with comments', live: ['website', 'site-comments', 'publish'] },
    note: { label: 'Quick note', icon: 'notes', cat: 'Notes', blurb: 'A scratchpad everyone shares', multi: 1, own: 1, home: 1 },
    bookmarks: { label: 'Bookmarks', icon: 'link', cat: 'Notes', blurb: 'Pinned links in one card', multi: 1, own: 1, home: 1 },
    quickdocs: { label: 'Quick docs', icon: 'docs', cat: 'Notes', blurb: 'The latest docs and sheets', live: ['doc-summary', 'doc-removed', 'docs'], home: 1 },
    inspo: { label: 'Inspiration strip', icon: 'palette', cat: 'Notes', blurb: 'The board, as a strip of pictures', live: ['inspo'] },
    tip: { label: 'Flint tip', icon: 'spark', cat: 'You', blurb: 'One useful thing a day', home: 1 },
    credits: { label: 'Plan & credits', icon: 'gauge', cat: 'You', blurb: 'Your plan and AI credits', home: 1 },
  };
  const keys = scope => Object.keys(META).filter(k => scope !== 'home' || META[k].home);

  // Flint's tips: real features, each with a way to try it
  const TIPS = [
    ['Press Ctrl K to jump anywhere: a doc, a task, a person.', 'Try it', () => document.getElementById('tour-search') && document.getElementById('tour-search').click()],
    ['Alt ↑ / Alt ↓ moves a sidebar row or a widget, no mouse needed.', '', null],
    ['Assign a task and it waits for an Accept, so nobody gets work they did not agree to.', 'Open tasks', () => go('ws-tasks')],
    ['Invite your own Claude: it joins with your access and never more.', 'Invite', () => { const b = document.getElementById('sf-claude'); if (b) b.click(); }],
    ['Right-click a widget for its menu, or use its ⋯.', '', null],
    ['Use any free AI from the Agents Hub: copy a context pack out, paste the answer back.', 'Agents Hub', () => go('ws-agents')],
    ['The inspiration board turns pictures you save into a palette for the website.', '', null],
    ['Rituals post the standup questions in chat and write the answers into a doc.', 'Calendar', () => go('calendar')],
  ];
  const tipIndex = () => Math.floor(Date.now() / 86400000) % TIPS.length;

  // ---------- loaders: (ctx) -> data; views: (data, ctx) -> html ----------
  const L = {
    async mytasks() { const r = await api('/tasks'); const id = me().id; return (r.tasks || []).filter(t => t.assignee === id && t.status !== 'done').sort((a, b) => (b.accept === 'pending') - (a.accept === 'pending')); },
    async presence() { const r = await api('/members'); return (r.members || []).filter(m => m.role !== 'agent' || m.online); },
    async activity(ctx) { const r = await api('/hub'); return (r.feed || []).filter(f => ctx.scope === 'home' || !f.project || f.project === ctx.scope).slice(0, 6); },
    async clocks() {
      const r = await api('/members'), ms = (r.members || []).filter(m => m.role !== 'agent').slice(0, 10);
      const out = await Promise.all(ms.map(m => api('/profile/' + encodeURIComponent(m.id)).then(p => ({ ...m, tz: (p.profile || p).tz || null })).catch(() => ({ ...m, tz: null }))));
      return out;
    },
    async timeline() {
      const [m, t] = await Promise.all([api('/milestones'), api('/tasks')]); const tasks = t.tasks || [];
      return (m.milestones || []).map(x => { const ids = x.tasks || [], done = ids.filter(id => (tasks.find(k => k.id === id) || {}).status === 'done').length; return { ...x, done, total: ids.length }; });
    },
    async ritual() { const r = await api('/calendar/upcoming?n=20'); return (r.items || []).find(x => x.kind === 'event' && x.ritual) || null; },
    async build() {
      const [b, c, k] = await Promise.all([api('/dash/band'), api('/dash/criticals').catch(() => ({ items: [] })), api('/checks').catch(() => null)]);
      return { sig: ((b.band || {}).signals) || {}, fail: (c.items || []).filter(x => x.k === 'build'), checks: k };
    },
    async ship() { return api('/ship'); },
    async thumb() { return (await api('/thumb?prefer=shot')).thumb || null; },
    async sitestatus(ctx) { return (await api(`/projects/${encodeURIComponent(ctx.scope)}/website`)).website || {}; },
    async quickdocs(ctx) { const r = await api(ctx.scope === 'home' ? '/hub/docs' : '/docs'); return (r.docs || []).slice().sort((a, b) => Date.parse(b.updated || b.at || 0) - Date.parse(a.updated || a.at || 0)).slice(0, 6); },
    async inspo(ctx) { const r = await api('/inspo?project=' + encodeURIComponent(ctx.scope)); return (r.items || []).filter(i => i.thumb || i.src || i.url).slice(0, 8); },
  };

  const V = {
    mytasks(d) {
      if (!d.length) return empty('Nothing on your plate.', 'go:ws-tasks', 'Open the Task Board');
      return `<ul class="wgc-list">${d.slice(0, 6).map(t => `<li><span class="wgc-txt" title="${esc(t.title)}">${esc(t.title)}</span>${t.accept === 'pending' ? `<button type="button" class="btn sm primary" data-wgc-accept="${esc(t.id)}">Accept</button>` : `<span class="wgc-tag">${esc(t.status)}</span>`}</li>`).join('')}</ul>`;
    },
    presence(d) {
      const on = d.filter(m => m.online || m.state === 'online' || m.state === 'away'), id = me().id;
      if (!on.length || (on.length === 1 && on[0].id === id)) return empty('Only you are here right now.', 'invite', 'Invite friends');
      return `<ul class="wgc-list">${on.slice(0, 8).map(m => `<li><i class="wgc-dot${m.state === 'away' ? ' away' : ''}" style="--who:${esc(m.color || 'var(--peer)')}"></i><span class="wgc-txt">${esc(m.name)}${m.id === id ? ' (you)' : ''}</span><small class="wgc-sub">${esc(m.where || (m.state === 'away' ? 'away' : ''))}</small></li>`).join('')}</ul>`;
    },
    activity(d) {
      if (!d.length) return empty('Nothing has happened here yet.', 'go:ws-tasks', 'Add a task');
      return `<ul class="wgc-list">${d.map(f => `<li><span class="wgc-txt" title="${esc(f.title)}">${esc(f.title)}</span><small class="wgc-sub">${esc(f.byName || '')} · ${esc(ago(f.at))}</small></li>`).join('')}</ul>`;
    },
    clocks(d) {
      const mine = Intl.DateTimeFormat().resolvedOptions().timeZone, id = me().id, self = d.find(m => m.id === id);
      const t = tz => { try { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz }); } catch { return ''; } };
      const set = d.filter(m => m.tz);
      const rows = set.map(m => `<li><span class="wgc-txt">${esc(m.name)}</span><b class="wgc-num">${esc(t(m.tz))}</b></li>`).join('');
      const ask = self && !self.tz ? `<button type="button" class="btn sm" data-wgc-act="tz">Share my time zone (${esc(mine.split('/').pop().replace(/_/g, ' '))})</button>` : '';
      if (!set.length) return `<div class="wgc-empty"><p>Nobody has shared a time zone yet. It is ${esc(t(mine))} here.</p>${ask}</div>`;
      return `<ul class="wgc-list">${rows}</ul>${ask ? `<div class="wgc-foot">${ask}</div>` : ''}`;
    },
    timeline(d) {
      if (!d.length) return empty('No milestones yet. They come from approved proposals.', 'go:milestones', 'Open milestones');
      return `<ul class="wgc-list wgc-ms">${d.slice(-5).map(m => { const pct = m.total ? Math.round(100 * m.done / m.total) : (m.status === 'shipped' || m.status === 'done' ? 100 : 0); return `<li><span class="wgc-txt" title="${esc(m.title)}"><b>${esc(m.version || '')}</b> ${esc(m.title || '')}</span><small class="wgc-sub">${m.total ? `${m.done}/${m.total}` : esc(m.status || '')}</small><span class="wgc-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></span></li>`; }).join('')}</ul>`;
    },
    ritual(d) {
      if (!d) return empty('No standup or ritual on the calendar.', 'go:calendar', 'Schedule one');
      const at = Date.parse(d.start || d.at);
      return `<div class="wgc-big"><b class="wgc-num" data-wgc-until="${at}">${esc(span(at - Date.now()))}</b><span class="wgc-txt">${esc(d.title)}</span><small class="wgc-sub">${esc(new Date(at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</small></div>`;
    },
    build(d) {
      const b = d.sig.build, p = d.sig.preview, fail = d.fail[0], k = d.checks, last = k && k.last, mine = b && b.source === 'checks';
      const dur = ms => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${Math.round(ms / 100) / 10} s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
      const row = (name, s) => s ? `<li><i class="wgc-state ${s.ok ? 'ok' : 'bad'}" aria-hidden="true"></i><span class="wgc-txt">${esc(name)}: ${s.ok ? 'passing' : 'failing'}</span><small class="wgc-sub">${esc(ago(s.at))}</small></li>${s.text ? `<li class="wgc-why"><small class="wgc-sub" title="${esc(s.text)}">${esc(s.text)}</small></li>` : ''}` : '';
      // the host's own checks (server/checks.js): pass or fail, how long, and the lines that failed
      let ck = '';
      if (k && k.running) ck = `<li data-wgc-checks="running"><i class="wgc-state warn" aria-hidden="true"></i><span class="wgc-txt">Checks: running…</span><small class="wgc-sub">${esc(k.what.label || '')}</small></li>`;
      else if (last) ck = `<li data-wgc-checks="${esc(last.state)}"><i class="wgc-state ${last.ok ? 'ok' : 'bad'}" aria-hidden="true"></i><span class="wgc-txt">Checks: ${last.ok ? 'passing' : last.state === 'timeout' ? 'timed out' : 'failing'}</span><small class="wgc-sub" title="${esc(last.label || '')} · ${esc(ago(last.at))}">${esc(dur(last.ms || 0))}</small></li>${!last.ok && (last.lines || []).length ? `<li class="wgc-why wgc-lines"><ul>${last.lines.slice(0, 4).map(l => `<li title="${esc(l)}">${esc(l)}</li>`).join('')}</ul></li>` : ''}`;
      const gh = k && k.github ? `<li><i class="wgc-state ${k.github.state === 'pass' ? 'ok' : k.github.state === 'fail' ? 'bad' : 'warn'}" aria-hidden="true"></i><span class="wgc-txt">GitHub: ${k.github.state === 'pass' ? 'passing' : k.github.state === 'fail' ? `${k.github.failing} failing` : 'running'}</span><small class="wgc-sub">${k.github.total} check${k.github.total === 1 ? '' : 's'}</small></li>` : '';
      const off = k && k.off ? `<p class="wgc-sub wgc-pad wgc-note-off" data-wgc-checks-off>${k.needsLead ? 'Checks are off: others can change this code.' : 'Checks are turned off.'}</p>` : '';
      const foot = k && (k.can.run || k.can.set || k.runs.length) ? `<div class="wgc-foot">${k.can.run ? `<button type="button" class="btn sm" data-wgc-act="checks-run" ${k.running || k.queued ? 'disabled' : ''}>${k.running || k.queued ? 'Running…' : 'Run checks'}</button>` : ''}${last ? '<button type="button" class="btn sm ghost" data-wgc-act="checks-log">Log</button>' : ''}${k.can.set && k.what.runsCode ? `<button type="button" class="btn sm ghost" data-wgc-act="checks-set">${k.off ? 'Turn on…' : 'Settings'}</button>` : ''}</div>` : '';
      if (!b && !p && !fail && !ck && !gh) return (k && k.what.kind !== 'none') ? `<div class="wgc-empty"><p>${esc(k.off ? '' : `Nothing has run yet. This project's check: ${k.what.label}.`)}</p></div>${off}${foot}` : empty('No builds reported yet. Agents report them as they work.', 'preview', 'Run the preview');
      return `<ul class="wgc-list">${ck}${mine ? '' : row('Build', b)}${gh}${row('Preview', p)}${fail && !(b && b.ok === false) ? `<li><i class="wgc-state bad" aria-hidden="true"></i><span class="wgc-txt">${esc(fail.title)}</span></li>` : ''}</ul>${off}${foot}`;
    },
    ship(d) {
      if (!d || d.enabled === false) return empty('This project has no code repository yet.', 'go:repo', 'Set one up');
      const n = d.dirty || 0, last = d.lastShip;
      return `<ul class="wgc-list"><li><span class="wgc-txt">${I('git', 14)} ${esc(d.branch || 'main')}</span><small class="wgc-sub">${d.count || 0} saved</small></li>
        <li><i class="wgc-state ${n ? 'warn' : 'ok'}" aria-hidden="true"></i><span class="wgc-txt">${n ? `${n} change${n > 1 ? 's' : ''} not saved yet` : 'Everything is saved'}</span></li>
        <li><span class="wgc-txt">${last ? `Shipped ${esc(ago(last.at || last))}` : 'Not shipped yet'}</span><small class="wgc-sub">${d.hasRemote ? (d.behind ? `${d.behind} behind` : 'in sync') : 'no remote'}</small></li></ul>`;
    },
    thumb(d) {
      if (!d) return empty('Nothing to show yet.', 'preview', 'Open the preview');
      const pic = d.src ? `<img src="${esc(d.src)}" alt="The latest picture of ${esc(d.name || 'the project')}" loading="lazy">` : `<span class="wgc-tile" style="--tile:${esc(d.color || 'var(--surface-2)')}">${esc(d.initials || '')}</span>`;
      return `<button type="button" class="wgc-shot" data-wgc-act="preview" aria-label="Open the preview">${pic}</button><small class="wgc-sub">${esc({ screenshot: 'Latest screenshot', readme: 'From the README', github: 'From GitHub', tile: 'No picture yet' }[d.kind] || '')}</small>`;
    },
    sitestatus(d) {
      if (!d.exists && !d.built && !d.auto) return empty('No website yet.', 'site', 'Start the website');
      const n = d.open || 0;
      return `<ul class="wgc-list"><li><i class="wgc-state ${d.exists ? 'ok' : 'warn'}" aria-hidden="true"></i><span class="wgc-txt">${d.exists ? 'Built' : 'Draft'}</span><small class="wgc-sub">${d.built ? esc(ago(d.built.at || d.built)) : ''}</small></li>
        <li><span class="wgc-txt">${n ? `${n} open comment${n > 1 ? 's' : ''}` : 'No open comments'}</span></li></ul><div class="wgc-foot"><button type="button" class="btn sm" data-wgc-act="site">Open the designer</button></div>`;
    },
    quickdocs(d) {
      if (!d.length) return empty('No docs yet.', 'go:docs', 'Open Files');
      return `<ul class="wgc-list">${d.map(x => `<li><button type="button" class="wgc-link" data-wgc-doc="${esc(x.slug || x.id)}">${I(x.kind === 'sheet' ? 'sheets' : x.kind === 'deck' ? 'slides' : 'docs', 14)}<span class="wgc-txt">${esc(x.title || x.slug)}</span></button></li>`).join('')}</ul>`;
    },
    inspo(d) {
      if (!d.length) return empty('The inspiration board is empty.', 'inspo', 'Open the board');
      return `<div class="wgc-strip">${d.map(i => `<button type="button" class="wgc-pic" data-wgc-act="inspo" aria-label="${esc(i.title || 'Picture')}"><img src="${esc(i.thumb || i.src || i.url)}" alt="" loading="lazy"></button>`).join('')}</div>`;
    },
    tip(d, ctx) {
      const i = ((ctx.st.tip ?? tipIndex()) % TIPS.length + TIPS.length) % TIPS.length, [text, act] = TIPS[i];
      return `<p class="wgc-tip">${esc(text)}</p><div class="wgc-foot">${act ? `<button type="button" class="btn sm" data-wgc-act="tipgo">${esc(act)}</button>` : ''}<button type="button" class="btn sm ghost" data-wgc-act="tipnext">Next tip</button></div>`;
    },
    credits() {
      const P = window.TribePremium, plan = P && P.plan ? P.plan() : 'free', n = P && P.credits ? P.credits() : 0;
      const name = typeof plan === 'string' ? plan : (plan && (plan.name || plan.id)) || 'free';
      return `<ul class="wgc-list"><li><span class="wgc-txt">Plan</span><b class="wgc-num">${esc(name[0].toUpperCase() + name.slice(1))}</b></li><li><span class="wgc-txt">AI credits</span><b class="wgc-num">${n}</b></li></ul><p class="wgc-sub wgc-pad">Bring your own AI for free, always.</p><div class="wgc-foot"><button type="button" class="btn sm" data-wgc-act="plans">See plans</button></div>`;
    },
    // ---- cards with their own state (ctx.data) ----
    note(_, ctx) {
      const d = ctx.data || {};
      return `<textarea class="wgc-note" rows="4" maxlength="4000" placeholder="${ctx.canEdit ? 'Write a note for everyone…' : 'Nothing written yet'}" aria-label="Note" ${ctx.canEdit ? '' : 'readonly'}>${esc(d.text || '')}</textarea><small class="wgc-sub wgc-pad" data-wgc-saved>${d.at ? `Saved ${esc(ago(d.at))}` : ''}</small>`;
    },
    checklist(_, ctx) {
      const items = (ctx.data || {}).items || [], done = items.filter(x => x.done).length;
      const list = items.length ? `<ul class="wgc-list wgc-check">${items.map(x => `<li><label><input type="checkbox" data-wgc-tick="${esc(x.id)}" ${x.done ? 'checked' : ''} ${ctx.canEdit ? '' : 'disabled'}><span class="wgc-txt${x.done ? ' done' : ''}" title="${esc(x.text)}">${esc(x.text)}</span></label>${ctx.canEdit ? `<button type="button" class="wgc-x" data-wgc-del="${esc(x.id)}" aria-label="Delete ${esc(x.text)}">${I('x', 12)}</button>` : ''}</li>`).join('')}</ul>` : `<p class="wgc-sub wgc-pad">Nothing on the list yet.</p>`;
      return `${items.length ? `<small class="wgc-sub wgc-pad">${done}/${items.length} done</small>` : ''}${list}${ctx.canEdit ? `<form class="wgc-add" data-wgc-form="add"><input class="input" name="text" maxlength="140" placeholder="Add an item" aria-label="Add an item" autocomplete="off"></form>${done ? '<div class="wgc-foot"><button type="button" class="btn sm ghost" data-wgc-act="clear">Clear done</button></div>' : ''}` : ''}`;
    },
    bookmarks(_, ctx) {
      const items = (ctx.data || {}).items || [];
      const list = items.length ? `<ul class="wgc-list">${items.map(x => `<li><a class="wgc-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" title="${esc(x.url)}">${I('link', 14)}<span class="wgc-txt">${esc(x.name)}</span></a>${ctx.canEdit ? `<button type="button" class="wgc-x" data-wgc-del="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">${I('x', 12)}</button>` : ''}</li>`).join('')}</ul>` : (ctx.canEdit ? '' : `<p class="wgc-sub wgc-pad">No links yet.</p>`);
      return `${list}${ctx.canEdit ? `<form class="wgc-add" data-wgc-form="link"><input class="input" name="url" placeholder="Paste a link" aria-label="Link" inputmode="url" autocomplete="off"></form>` : ''}`;
    },
    countdown(_, ctx) {
      const d = ctx.data || {};
      if (!d.date) return empty('Count down to a launch, a jam or a demo day.', ctx.canEdit ? 'settings' : '', 'Set the date');
      const at = Date.parse(d.date);
      return `<div class="wgc-big"><b class="wgc-num" data-wgc-until="${at}">${esc(at > Date.now() ? span(at - Date.now()) : 'Today')}</b><span class="wgc-txt">${esc(d.title)}</span><small class="wgc-sub">${esc(new Date(at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))}</small></div>`;
    },
    poll(_, ctx) {
      const d = ctx.data || {};
      if (!d.q) return empty('Ask the tribe something.', ctx.canEdit ? 'settings' : '', 'Write a question');
      return `<p class="wgc-q">${esc(d.q)}</p><div class="wgc-poll" role="group" aria-label="${esc(d.q)}">${d.options.map((o, i) => { const n = d.counts[i] || 0, pct = d.total ? Math.round(100 * n / d.total) : 0; return `<button type="button" class="wgc-opt${d.mine === i ? ' on' : ''}" data-wgc-vote="${i}" aria-pressed="${d.mine === i}" ${ctx.canVote ? '' : 'disabled'}><i style="width:${pct}%"></i><span class="wgc-txt">${esc(o)}</span><b class="wgc-num">${n}</b></button>`; }).join('')}</div><small class="wgc-sub wgc-pad">${d.total} vote${d.total === 1 ? '' : 's'}${ctx.canVote && d.mine !== null ? ' · tap yours to undo' : ''}</small>`;
    },
  };
  const SETTINGS = {
    countdown: d => `<label>Name<input class="input" name="title" maxlength="60" required value="${esc((d || {}).title || '')}" placeholder="Demo day"></label><label>Date<input class="input" type="date" name="date" required value="${esc(((d || {}).date || '').slice(0, 10))}"></label>`,
    poll: d => `<label>Question<input class="input" name="q" maxlength="140" required value="${esc((d || {}).q || '')}" placeholder="Which art style?"></label>${[0, 1, 2, 3].map(i => `<input class="input" name="o${i}" maxlength="60" value="${esc(((d || {}).options || [])[i] || '')}" placeholder="Choice ${i + 1}${i < 2 ? '' : ' (optional)'}" aria-label="Choice ${i + 1}">`).join('')}<p class="wgc-sub">Saving a new question clears the votes.</p>`,
  };

  // ---------- mounting ----------
  const inst = new Map();   // wid -> { el, key, data, err, loading, at }
  let CTX = null;
  const title = w => w.title || (META[w.key] || {}).label || 'Widget';
  function shell(w, ctx) {
    const m = META[w.key] || {}, el = document.createElement('section');
    el.className = 'wgc'; el.dataset.wid = w.id; el.dataset.key = w.key; el.id = 'wgc-' + w.id;
    el.setAttribute('aria-label', title(w));
    el.innerHTML = `<header class="wgc-h">${I(m.icon || 'other', 16)}<h3 class="wgc-t" title="${esc(title(w))}">${esc(title(w))}</h3><button type="button" class="wgc-more" data-wgc-more aria-haspopup="menu" aria-label="Options for ${esc(title(w))}">${I('more', 16)}</button></header><div class="wgc-b" aria-live="polite"></div>`;
    return el;
  }
  function ctxFor(w) { return { scope: CTX.scope, canEdit: CTX.canEdit, canVote: CTX.canVote, data: (CTX.data || {})[w.id] || null, st: inst.get(w.id) || {} }; }
  function paint(w) {
    const it = inst.get(w.id); if (!it) return;
    const b = it.el.querySelector('.wgc-b'), m = META[w.key] || {}, c = ctxFor(w);
    // a note being typed in is never overwritten; it takes the new text on blur
    if (w.key === 'note') { const ta = b.querySelector('textarea'); if (ta && document.activeElement === ta) { it.stale = true; return; } }
    let html;
    if (it.err) html = `<div class="wgc-err" role="alert"><p>Couldn't load this.</p><button type="button" class="btn sm" data-wgc-act="retry">Retry</button></div>`;
    else if (!m.own && L[w.key] && it.data === undefined) html = `<p class="wgc-sub wgc-pad wgc-loading">Loading…</p>`;
    else html = V[w.key] ? V[w.key](it.data, c) : '';
    if (it.html !== html) {
      // an add-row being typed in keeps its text and focus across a repaint (another member's change arriving)
      const a = document.activeElement, typing = a && b.contains(a) && a.matches('.wgc-add input') ? { form: a.closest('[data-wgc-form]').dataset.wgcForm, v: a.value } : null;
      b.innerHTML = html; it.html = html;
      if (typing) { const n = b.querySelector(`[data-wgc-form="${typing.form}"] input`); if (n) { n.value = typing.v; n.focus(); } }
    }
    it.el.classList.toggle('is-err', !!it.err);
    const t = it.el.querySelector('.wgc-t'); if (t.textContent !== title(w)) { t.textContent = title(w); t.title = title(w); it.el.setAttribute('aria-label', title(w)); }
  }
  async function load(w) {
    const it = inst.get(w.id); if (!it || !L[w.key]) return paint(w);
    const n = it.seq = (it.seq || 0) + 1;
    try { const d = await L[w.key](ctxFor(w)); if (n !== it.seq) return; it.data = d; it.err = null; }
    catch (e) { if (n !== it.seq) return; it.err = e.message || 'error'; }
    it.at = Date.now(); paint(w);
  }
  function mount(box, list, ctx) {
    if (!box) return;
    const scopeChanged = CTX && CTX.scope !== ctx.scope; CTX = ctx;
    if (scopeChanged) { inst.forEach(it => it.el.remove()); inst.clear(); }
    const cards = list.filter(w => w.kind === 'card' && META[w.key]), ids = new Set(cards.map(w => w.id));
    for (const [id, it] of inst) if (!ids.has(id)) { it.el.remove(); inst.delete(id); }
    let prev = null;
    for (const w of cards) {
      let it = inst.get(w.id);
      if (!it) { it = { el: shell(w, ctx), key: w.key, w }; inst.set(w.id, it); load(w); }
      it.w = w;
      const want = prev ? prev.nextSibling : box.firstChild;
      if (want !== it.el) box.insertBefore(it.el, want);
      prev = it.el; paint(w);
    }
    // anything else in the box (Home's link rows) stays after the cards
    box.classList.toggle('empty', !box.children.length);
  }
  // live: a socket message reloads the cards that read that kind of thing (gently: one reload per card per 400ms)
  const timers = new Map();
  function live(msg) {
    if (!msg || !CTX) return;
    if (msg.project && CTX.scope !== 'home' && msg.project !== CTX.scope) return;
    for (const it of inst.values()) {
      const m = META[it.key]; if (!m.live || !m.live.includes(msg.type)) continue;
      clearTimeout(timers.get(it.w.id)); timers.set(it.w.id, setTimeout(() => load(it.w), 400));
    }
  }
  setInterval(() => {   // countdowns and clocks tick
    document.querySelectorAll('[data-wgc-until]').forEach(el => { const ms = Number(el.dataset.wgcUntil) - Date.now(); el.textContent = ms > 0 ? span(ms) : 'now'; });
    for (const it of inst.values()) if (it.key === 'clocks' && it.data) { it.html = ''; paint(it.w); }
  }, 30000);

  // ---------- actions ----------
  const wOf = el => { const c = el.closest('.wgc'); return c && inst.get(c.dataset.wid) ? inst.get(c.dataset.wid).w : null; };
  async function act(w, op, body = {}) {
    try {
      const r = await api('/widgets/act', { method: 'POST', body: { scope: CTX.scope, wid: w.id, op, ...body } });
      CTX.data = { ...(CTX.data || {}), [w.id]: r.data }; if (r.widget && r.widget.title !== w.title) w.title = r.widget.title;
      paint(w); return r;
    } catch (e) { toast(e.message); return null; }
  }
  function openSettings(w, anchor) {
    const W = window.TribeWidgets; if (!SETTINGS[w.key] || !W) return;
    const el = W.pop(anchor, `<form class="wg-form wgc-set" autocomplete="off"><h6>${esc(title(w))}</h6>${SETTINGS[w.key]((CTX.data || {})[w.id])}<div class="wg-acts"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary">Save</button></div></form>`, 'wgc-settings');
    const f = el.querySelector('form'); setTimeout(() => { const i = f.querySelector('input'); if (i) i.focus(); }, 20);
    f.querySelector('[data-cancel]').onclick = () => W.closePop();
    f.onsubmit = async e => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(f));
      const body = w.key === 'poll' ? { q: v.q, options: [v.o0, v.o1, v.o2, v.o3].filter(x => x && x.trim()) } : { title: v.title, date: v.date ? v.date + 'T12:00:00' : '' };
      if (await act(w, 'set', body)) { W.closePop(); toast('Saved'); }
    };
  }
  // Build status: the last run's log, and the lead's switch (with what turning it on means, in plain words)
  async function checksLog(w, anchor) {
    const W = window.TribeWidgets; if (!W) return;
    try {
      const k = await api('/checks'), last = k.last; if (!last) return;
      const r = (await api('/checks/runs/' + encodeURIComponent(last.id))).run;
      W.pop(anchor, `<div class="wg-form wgc-set wgc-log"><h6>${r.ok ? 'Checks passed' : r.state === 'timeout' ? 'Checks timed out' : 'Checks failed'}</h6><p class="wgc-sub">${esc(r.label || '')} · ${esc(r.byName || '')} · ${esc(ago(r.at))}</p><pre tabindex="0">${esc(r.log || '(no output)')}</pre>${k.runs.length > 1 ? `<p class="wgc-sub">Earlier: ${k.runs.slice(1, 6).map(x => `${x.ok ? '✓' : '✗'} ${esc(ago(x.at))}`).join(' · ')}</p>` : ''}</div>`, 'wgc-settings');
    } catch (e) { toast(e.message); }
  }
  async function checksSet(w, anchor) {
    const W = window.TribeWidgets; if (!W) return;
    let k; try { k = await api('/checks'); } catch (e) { return toast(e.message); }
    const on = k.settings.on === true || (k.settings.on === null && !k.shared);
    const el = W.pop(anchor, `<form class="wg-form wgc-set" autocomplete="off"><h6>Run checks on the host</h6>
      <p class="wgc-sub">This project's check is <b>${esc(k.what.label)}</b>. It runs after each ship and when someone presses Run checks.</p>
      <p class="wgc-sub wgc-warn" id="wgc-checks-warn">Turning this on runs this project's scripts on the host computer. Anyone who can change the project's code can change what runs there. Only turn it on if you trust everyone who can write to this project.</p>
      <label class="wgc-row"><input type="checkbox" name="on" ${on ? 'checked' : ''}> Run this project's checks on the host</label>
      <div class="wg-acts"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary">Save</button></div></form>`, 'wgc-settings');
    const f = el.querySelector('form'); f.querySelector('[data-cancel]').onclick = () => W.closePop();
    f.onsubmit = async e => { e.preventDefault(); try { await api('/checks', { method: 'PUT', body: { on: f.elements.on.checked } }); W.closePop(); toast(f.elements.on.checked ? 'Checks are on for this project' : 'Checks are off for this project'); load(w); } catch (er) { toast(er.message); } };
  }
  async function run(w, a, btn) {
    if (a === 'retry') { const it = inst.get(w.id); it.err = null; it.data = undefined; paint(w); return load(w); }
    if (a.startsWith('go:')) return go(a.slice(3));
    if (a === 'invite') { const b = document.getElementById('tour-invite'); return b && b.click(); }
    if (a === 'preview') return window.TribePreview && window.TribePreview.open();
    if (a === 'site') return window.TribeSiteDesigner ? window.TribeSiteDesigner.open({ pid: CTX.scope }) : go('website');
    if (a === 'inspo') return window.TribeInspoBoard && window.TribeInspoBoard.open({ board: CTX.scope });
    if (a === 'plans') return window.TribePremium && window.TribePremium.open && window.TribePremium.open();
    if (a === 'settings') return openSettings(w, btn);
    if (a === 'clear') return act(w, 'clear');
    if (a === 'tipnext') { const it = inst.get(w.id); it.tip = (it.tip ?? tipIndex()) + 1; return paint(w); }
    if (a === 'tipgo') { const it = inst.get(w.id), t = TIPS[(((it.tip ?? tipIndex()) % TIPS.length) + TIPS.length) % TIPS.length]; return t[2] && t[2](); }
    if (a === 'checks-run') { try { btn.disabled = true; btn.textContent = 'Running…'; await api('/checks/run', { method: 'POST', body: {} }); } catch (e) { toast(e.message); load(w); } return; }
    if (a === 'checks-log') return checksLog(w, btn);
    if (a === 'checks-set') return checksSet(w, btn);
    if (a === 'tz') {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      try { await api('/profile', { method: 'PATCH', body: { tz } }); toast('Time zone shared'); load(w); } catch (e) { toast(e.message); }
    }
  }
  document.addEventListener('click', async e => {
    const t = e.target; if (!t.closest || !t.closest('.wgc')) return;
    const w = wOf(t); if (!w) return;
    const more = t.closest('[data-wgc-more]'); if (more) { e.preventDefault(); return window.TribeWidgets && window.TribeWidgets.menu(more, w.id); }
    const a = t.closest('[data-wgc-act]'); if (a) { e.preventDefault(); return run(w, a.dataset.wgcAct, a); }
    const acc = t.closest('[data-wgc-accept]'); if (acc) {
      acc.disabled = true;
      try { await api(`/tasks/${encodeURIComponent(acc.dataset.wgcAccept)}/accept`, { method: 'POST', body: {} }); toast('Accepted'); load(w); } catch (er) { acc.disabled = false; toast(er.message); }
      return;
    }
    const doc = t.closest('[data-wgc-doc]'); if (doc) { document.body.classList.remove('drawer-open'); return window.TribeShell && window.TribeShell.previewDoc(doc.dataset.wgcDoc); }
    const del = t.closest('[data-wgc-del]'); if (del) return act(w, 'del', { item: del.dataset.wgcDel });
    const vote = t.closest('[data-wgc-vote]'); if (vote) return act(w, 'vote', { opt: Number(vote.dataset.wgcVote) });
  });
  document.addEventListener('change', e => { const x = e.target.closest && e.target.closest('.wgc [data-wgc-tick]'); if (x) { const w = wOf(x); if (w) act(w, 'toggle', { item: x.dataset.wgcTick }); } });
  document.addEventListener('submit', async e => {
    const f = e.target.closest && e.target.closest('.wgc [data-wgc-form]'); if (!f) return;
    e.preventDefault(); const w = wOf(f), i = f.querySelector('input'), v = i.value.trim(); if (!w || !v) return;
    i.value = '';
    let r;
    if (f.dataset.wgcForm === 'add') r = await act(w, 'add', { text: v });
    else { const url = /^https?:\/\//i.test(v) ? v : 'https://' + v; let name = ''; try { name = new URL(url).hostname.replace(/^www\./, ''); } catch {} r = await act(w, 'add', { url, name }); }
    const n = inst.get(w.id) && inst.get(w.id).el.querySelector(`[data-wgc-form="${f.dataset.wgcForm}"] input`);
    if (n) { if (!r) n.value = v; n.focus(); }
  });
  // the note saves itself 600ms after typing stops, and on blur
  const noteT = new Map();
  document.addEventListener('input', e => {
    const ta = e.target.closest && e.target.closest('.wgc .wgc-note'); if (!ta) return;
    const w = wOf(ta); if (!w) return; const s = ta.parentElement.querySelector('[data-wgc-saved]'); if (s) s.textContent = 'Saving…';
    clearTimeout(noteT.get(w.id)); noteT.set(w.id, setTimeout(() => saveNote(w, ta), 600));
  });
  async function saveNote(w, ta) {
    noteT.delete(w.id);
    const r = await act(w, 'set', { text: ta.value });
    const s = inst.get(w.id) && inst.get(w.id).el.querySelector('[data-wgc-saved]'); if (s && r) s.textContent = 'Saved just now';
  }
  document.addEventListener('focusout', e => {
    const ta = e.target.closest && e.target.closest('.wgc .wgc-note'); if (!ta) return;
    const w = wOf(ta); if (!w) return;
    if (noteT.has(w.id)) { clearTimeout(noteT.get(w.id)); saveNote(w, ta); }
    const it = inst.get(w.id); if (it && it.stale) { it.stale = false; setTimeout(() => paint(w), 0); }
  });

  // ---------- the picker's preview: a small flat drawing of the card ----------
  function mini(k) {
    const m = META[k]; if (!m) return '';
    const lines = { mytasks: ['Fix the jump', 'Accept'], presence: ['Maya · in Docs', 'Jay · in chat'], activity: ['Level 2 saved · Jay', 'Bug closed · Maya'], clocks: ['Maya 9:14 AM', 'Jay 5:14 PM'], poll: ['Pixel art ███', 'Low-poly █'],
      timeline: ['v0.1 ████░', 'v0.2 █░░░░'], ritual: ['2h 14m', 'Standup'], countdown: ['12d 4h', 'Demo day'], checklist: ['☑ Title screen', '☐ Sound'], build: ['● Build: passing', '● Preview: passing'],
      ship: ['main · 3 saved', 'Everything is saved'], thumb: ['▣ latest screenshot', ''], sitestatus: ['● Built', '2 open comments'], note: ['Remember the palette…', ''], bookmarks: ['🔗 Figma', '🔗 itch.io'],
      quickdocs: ['Game design doc', 'Level sheet'], inspo: ['▣ ▣ ▣ ▣', ''], tip: ['Press Ctrl K to jump', 'Next tip'], credits: ['Plan · Free', 'AI credits · 0'] }[k] || [];
    return `<div class="wgx-mini wgc-mini" aria-hidden="true"><b>${I(m.icon, 14)} ${esc(m.label)}</b>${lines.filter(Boolean).map(l => `<span>${esc(l)}</span>`).join('')}</div>`;
  }

  window.TribeCards = { META, mount, live, mini, keys, reload: id => { const it = inst.get(id); if (it) load(it.w); }, settings: (id, anchor) => { const it = inst.get(id); if (it) openSettings(it.w, anchor); }, hasSettings: k => !!SETTINGS[k] };
})();
