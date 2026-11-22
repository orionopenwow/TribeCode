// The office, full page (feat/office-full): how a project's Agents & office looks (agentsdash.js paints its parts into
// this frame). One calm screen:
//   the head      one line: "Agents & office · 2 people online · 1 AI helper working", who is here as small avatars
//                 (a click opens the same card as the floor), and Add an AI helper / Invite a friend (agentsoffice.js)
//   the office    the pixel floor (or the desks) edge to edge, as tall as the page allows, at whole-pixel zoom, with more building drawn around it (no empty bands; drag to look around). One slim
//                 toolbar on its top edge: Floor | Desks, zoom − +, and one ⋯ menu (Fit, Your look, the office's set, Edit
//                 layout, Sound, Hide the office for me, Where your tribe runs, What's private, Back up to GitHub)
//   the panel     on the right (≥1280px; folds to an icon rail): Preview (the live app and website of this project,
//                 TribeDashBand's tabs), Working on (agentsdash.js: what needs an OK, each AI helper's work, people,
//                 tasks in progress), Updates (TribeFlintDash.updates and #agents, newest first). Phones: a tab strip
//                 opens it as a bottom sheet.
//   the box       one slim pill floating over the bottom of the floor (Flint's box, TribeFlint.mount). Plain words go
//                 to #general the way the Messages box sends them (they show in Messages); "@a-person" mentions them;
//                 "@claude do X" gives that AI helper a task; "@agents …" goes to #agents; "/" opens the commands (/task,
//                 /ai, /invite, /flint, /look, /where); "add claude" opens Claude's one setup; a request Flint knows ("make
//                 the website darker", "invite a friend") runs in Flint (no AI needed). Replies show briefly above it.
// Public: window.TribeOfficeFull = { ensure(el, pid), work(html), sync(), open(tab), route(text), panel(), menu() }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (s, v) => { let t = window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s; if (v) for (const k in v) t = t.split('{' + k + '}').join(v[k]); return t; };
  const ico = (n, s = 16) => (window.TribeIcons && window.TribeIcons.svg ? window.TribeIcons.svg(n, s) : '');
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const wide = () => matchMedia('(min-width: 1280px)').matches;
  const O = () => window.TribeOffice, AO = () => window.TribeAgentsOffice;
  const pidNow = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C() && C().project && C().project()) || '';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const LS_TAB = 'tribecode.officefull.tab', LS_PANEL = 'tribecode.officefull.panel';
  const TABS = [['preview', 'Preview', 'preview'], ['work', 'Working on', 'checklist'], ['updates', 'Updates', 'pulse']];
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s) || s < 0) return ''; return s < 60 ? T('now') : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };

  let root = null, om = null, flint = null, tab = ls.get(LS_TAB, 'work');   // Working on first: it is what this page is for
  if (!TABS.some(t => t[0] === tab)) tab = 'work';
  const panelOpen = () => { const v = ls.get(LS_PANEL, ''); return v ? v === 'open' : wide(); };

  // ---------- the frame ----------
  function frame(pid) {
    const tabs = TABS.map(([k, l, i]) => `<button type="button" role="tab" class="ofl-tab" id="ofl-tab-${k}" data-ofl-tab="${k}" aria-controls="ofl-pane-${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}" title="${esc(T(l))}">${ico(i, 16)}<span>${esc(T(l))}</span></button>`).join('');
    const pane = (k, inner) => `<div class="ofl-pane" id="ofl-pane-${k}" role="tabpanel" aria-labelledby="ofl-tab-${k}" tabindex="0"${k === tab ? '' : ' hidden'}>${inner}</div>`;
    return `<div class="ad-dash ao-full ofl" id="ad-dash" data-pid="${esc(pid)}" data-panel="${panelOpen() ? 'open' : 'closed'}">
      ${AO().head()}
      <div class="ofl-body">
        <div class="ofl-main">
          <div class="ofl-bar" id="ao-bar" role="toolbar" aria-label="${esc(T('The office'))}"></div>
          ${AO().office()}
          <div class="ofl-dock" id="ao-dock"><div class="ofl-box" id="ao-box"></div></div>
        </div>
        <aside class="ofl-side" id="ao-side" aria-label="${esc(T('Preview, work and updates'))}">
          <div class="ofl-tabs" role="tablist" aria-label="${esc(T('Side panel'))}">${tabs}<span class="ofl-gap"></span>
            <button type="button" class="ofl-fold" id="ofl-fold" aria-label="${esc(T('Fold the panel'))}" title="${esc(T('Fold the panel'))}">${ico('chev', 16)}</button></div>
          ${pane('preview', '<div id="ao-preview-slot" class="ofl-preview"></div>')}
          ${pane('work', '<div id="ao-work" class="ofl-work"></div>')}
          ${pane('updates', `<ul class="ofl-ups" id="ao-updates" aria-live="polite"><li class="ofl-quiet">${esc(T('Looking…'))}</li></ul>`)}
        </aside>
      </div>
      <nav class="ofl-strip" id="ofl-strip" aria-label="${esc(T('Preview, work and updates'))}">${TABS.map(([k, l, i]) => `<button type="button" class="btn ofl-sbtn" data-ofl-sheet="${k}">${ico(i, 16)}<span>${esc(T(l))}</span></button>`).join('')}</nav>
    </div>`;
  }

  // Builds the frame once per project; afterwards agentsdash.js only changes Working on. Returns true when it was built.
  function ensure(el, pid) {
    const have = el.querySelector('#ao-full, .ao-full');
    if (have && have.dataset.pid === pid && have.isConnected) { root = have; return false; }
    if (om && om.destroy) om.destroy(); om = null;
    el.innerHTML = frame(pid);
    root = el.querySelector('.ao-full'); root.id = 'ad-dash';
    om = AO().mountOffice(root, null, { full: true, onPaint: () => { sync(); if (window.TribeAgentsDash && window.TribeAgentsDash.repaint) window.TribeAgentsDash.repaint(); } });   // Working on follows the office too
    wireFrame();
    mountBox();
    show(tab, false);
    sync();
    return true;
  }
  const work = html => { const w = root && root.querySelector('#ao-work'); if (w) w.innerHTML = html; return w; };

  // ---------- the toolbar on the floor's top edge ----------
  function space() { const s = om && om.space && om.space(); return s || null; }
  function barHtml() {
    const Of = O(), d = Of && Of.state(), hid = Of && Of.hidden(), v = Of ? Of.view() : 'desks';
    const seg = !hid && d && d.on && Of.canFloor() ? `<div class="ofl-seg" role="group" aria-label="${esc(T('How to show the office'))}">${['floor', 'desks'].map(k => `<button type="button" class="ofl-sg${v === k ? ' on' : ''}" data-ofl-view="${k}" aria-pressed="${v === k}">${esc(T(k === 'floor' ? 'Floor' : 'Desks'))}</button>`).join('')}</div>` : `<span class="ofl-bar-t">${esc(T(hid ? 'The office is hidden' : 'The office'))}</span>`;
    const zoom = !hid && v === 'floor' && space() ? `<span class="ofl-zoom"><button type="button" class="ofl-ib" data-ofl-zoom="out" aria-label="${esc(T('Zoom out'))}" title="${esc(T('Zoom out'))}">−</button><button type="button" class="ofl-ib" data-ofl-zoom="in" aria-label="${esc(T('Zoom in'))}" title="${esc(T('Zoom in'))}">+</button></span>` : '';
    return `${seg}${zoom}<button type="button" class="ofl-ib ofl-more" id="ao-more" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(T('More'))}" title="${esc(T('More'))}">${ico('more', 16)}</button>`;
  }
  function paintBar() {
    const b = root && root.querySelector('#ao-bar'); if (!b) return;
    const keep = b.querySelector('#ao-menu');
    const html = barHtml();
    if (b.__sig === html && (!keep || keep.isConnected)) return;
    b.__sig = html; b.innerHTML = html;
    if (keep) closeMenu();
  }

  // ---------- the ⋯ menu ----------
  function menuHtml() {
    const Of = O(), sp = space(), info = sp && sp.info ? sp.info() : null, v = Of ? Of.view() : 'desks', hid = Of && Of.hidden();
    const item = (k, label, sub, extra = '') => `<button type="button" role="menuitem" class="ofl-mi" data-aom="${k}"${extra}><span class="ofl-mi-t"><b>${esc(T(label))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
    const floorPart = !hid && v === 'floor' && info ? [
      item('fit', 'Fit', T('Back to the whole office, filling the screen')),
      info.canLook ? item('look', 'Your look', T('Your character on the floor')) : '',
      info.canSet ? `<label class="ofl-mi ofl-mset"><span class="ofl-mi-t"><b>${esc(T('Office'))}</b><small>${esc(T('The look of the whole floor'))}</small></span><select class="input sm" data-aom-set aria-label="${esc(T('Office'))}">${info.sets.map(s => `<option value="${esc(s.id)}"${s.id === info.set ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : '',
      info.canSet ? item('edit', 'Edit layout', T('Move desks, plants and walls')) : '',
      item('sound', info.sound ? 'Sound on' : 'Sound off', T('A soft chime when someone needs your OK'), ` role="menuitemcheckbox" aria-checked="${info.sound}"`),
    ].join('') : '';
    const S = window.TribeStatus && window.TribeStatus.now ? window.TribeStatus.now() : null;
    const gh = AO() && AO().ghLine ? AO().ghLine() : null;
    return `${floorPart}${floorPart ? '<hr>' : ''}
      ${item('hide', hid ? 'Show the office' : 'Hide the office for me', T('Only on this device'))}
      <hr>
      ${item('where', 'Where your tribe runs', S ? `${S.label}${S.sub ? ' · ' + S.sub : ''}` : '')}
      ${item('privacy', 'What’s private', T('Who can open what'))}
      ${item('how', 'How AI helpers work here', T('Four steps, from connecting to your OK'))}
      ${item('github', gh && gh.btn === 'Back up now' ? 'Back up now' : 'Back up to GitHub', gh ? gh.text : T('A copy on GitHub keeps it safe'))}`;
  }
  function closeMenu() {
    const m = root && root.querySelector('#ao-menu'); if (m) m.remove();
    const b = root && root.querySelector('#ao-more'); if (b) b.setAttribute('aria-expanded', 'false');
  }
  function openMenu() {
    const b = root && root.querySelector('#ao-more'); if (!b) return;
    if (root.querySelector('#ao-menu')) return closeMenu();
    const m = document.createElement('div'); m.className = 'ofl-menu tm-rise'; m.id = 'ao-menu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', T('More'));
    m.innerHTML = menuHtml();
    root.querySelector('#ao-bar').appendChild(m); b.setAttribute('aria-expanded', 'true');
    const f = m.querySelector('[data-aom], select'); if (f) f.focus({ preventScroll: true });
    if (AO() && AO().ghLoad) AO().ghLoad().then(() => { if (m.isConnected) { const g = m.querySelector('[data-aom="github"]'); const gh = AO().ghLine(); if (g && gh) g.querySelector('.ofl-mi-t').innerHTML = `<b>${esc(T(gh.btn === 'Back up now' ? 'Back up now' : 'Back up to GitHub'))}</b><small>${esc(gh.text)}</small>`; } }).catch(() => {});
  }
  function menuAct(k, btn) {
    const sp = space();
    if (k === 'look' || k === 'edit' || k === 'fit') { closeMenu(); if (sp) sp.act(k); return; }
    if (k === 'sound') { if (sp) sp.act('sound'); const on = sp && sp.info().sound; btn.setAttribute('aria-checked', String(!!on)); btn.querySelector('b').textContent = T(on ? 'Sound on' : 'Sound off'); return; }
    if (k === 'hide') { closeMenu(); O().setHidden(!O().hidden()); return; }
    closeMenu();
    if (k === 'how') return how();
    if (AO() && AO().run) AO().run(k, btn);
  }

  function how() {
    const F = window.TribeFleet, U = window.TribeUI; if (!F || !U || !U.sheet) return;
    const sh = U.sheet({ id: 'ao-how-sheet', wide: true, eyebrow: T('Agents & office'), title: 'How AI helpers work here', body: F.how() });
    sh.body.addEventListener('click', e => { if (e.target.closest('#fl-guide')) { sh.close(); if (window.TribeGuide) window.TribeGuide.open('08-agents-and-office'); } });
    return sh;
  }
  // ---------- the side panel ----------
  function show(k, focus) {
    if (!TABS.some(t => t[0] === k) || !root) return;
    tab = k; ls.set(LS_TAB, k);
    const go = () => {
      root.querySelectorAll('.ofl-tab').forEach(b => { const on = b.dataset.oflTab === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      root.querySelectorAll('.ofl-pane').forEach(p => { p.hidden = p.id !== `ofl-pane-${k}`; });
      root.querySelectorAll('[data-ofl-sheet]').forEach(b => b.classList.toggle('on', b.dataset.oflSheet === k));
    };
    go();
    if (focus) { const t = root.querySelector(`#ofl-tab-${k}`); if (t) t.focus(); }
    if (k === 'preview') preview();
    if (k === 'updates') updates();
  }
  function setPanel(open) {
    if (!root) return;
    ls.set(LS_PANEL, open ? 'open' : 'closed');
    const apply = () => { root.dataset.panel = open ? 'open' : 'closed'; const f = root.querySelector('#ofl-fold'); if (f) { f.setAttribute('aria-label', T(open ? 'Fold the panel' : 'Open the panel')); f.title = T(open ? 'Fold the panel' : 'Open the panel'); } };
    if (window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(apply); else apply();
    if (open) show(tab);
  }
  // phones: the panel is a bottom sheet
  function sheet(k) {
    if (!root) return;
    show(k);
    root.dataset.sheet = 'open';
    const side = root.querySelector('#ao-side'); side.setAttribute('role', 'dialog'); side.setAttribute('aria-modal', 'true');
    let s = document.getElementById('ofl-scrim'); if (!s) { s = document.createElement('div'); s.id = 'ofl-scrim'; s.className = 'ofl-scrim'; s.onclick = closeSheet; document.body.appendChild(s); }
    const t = root.querySelector(`#ofl-tab-${k}`); if (t) t.focus({ preventScroll: true });
  }
  function closeSheet() {
    if (root) { delete root.dataset.sheet; const side = root.querySelector('#ao-side'); if (side) { side.removeAttribute('role'); side.removeAttribute('aria-modal'); } }
    const s = document.getElementById('ofl-scrim'); if (s) s.remove();
  }
  function preview() {
    const slot = root && root.querySelector('#ao-preview-slot'), B = window.TribeDashBand; if (!slot) return;
    if (B && B.mountOffice) B.mountOffice(slot);
    else slot.innerHTML = `<p class="ofl-quiet">${esc(T('The preview did not load. Reload the app.'))}</p>`;
  }

  // Updates: the living updates (flintdash.js) and what the agents said in #agents, newest first
  let upSeq = 0;
  async function updates() {
    const box = root && root.querySelector('#ao-updates'); if (!box || !C() || !C().hasToken || !C().hasToken()) return;
    const n = ++upSeq, pid = pidNow();
    const p = ((window.TribeProjects && window.TribeProjects.list && window.TribeProjects.list()) || []).find(x => x.id === pid) || { id: pid, name: '' };
    const [d, ch] = await Promise.all([C().api(`/projects/${encodeURIComponent(pid)}/pulse`).catch(() => ({})), C().api('/agents/channel?limit=12').catch(() => ({ messages: [] }))]);
    if (n !== upSeq || !box.isConnected) return;
    const st = C().state ? C().state() : {}, members = st.members || [], nameOf = id => ((members.find(m => m.id === id) || {}).name) || T('someone');
    const meId = (st.me || {}).id;
    let list = [];
    try { list = (window.TribeFlintDash && window.TribeFlintDash.updates ? window.TribeFlintDash.updates({ p, d: d || {}, meId, max: 24 }) : []).map(u => ({ ...u, src: 'up' })); } catch {}
    for (const m of (ch.messages || []).slice(-12)) list.push({ k: m.human ? 'person' : 'agent', t: `${nameOf(m.by)}${m.to ? ` → ${nameOf(m.to)}` : ''}: ${m.text}`, at: m.at, src: 'agents' });
    const now = list.filter(x => !x.at), timed = list.filter(x => x.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    list = [...now, ...timed].slice(0, 30);
    const TONE = { person: '--peer', agent: '--live', wait: '--amber', change: '--peer', task: '--live', doc: '--peer', commit: '--ember' };
    box.innerHTML = list.length ? list.map(u => `<li class="ofl-up" style="--t:var(${TONE[u.k] || '--faint'})"><span class="ofl-dot" aria-hidden="true"></span><span class="ofl-up-t">${esc(u.t)}</span><time${u.at ? ` datetime="${esc(u.at)}"` : ''}>${esc(u.at ? ago(u.at) : T('now'))}</time></li>`).join('')
      : `<li class="ofl-quiet">${esc(T('Quiet right now. What people and AI helpers do shows up here as it happens.'))}</li>`;
  }

  // ---------- the box: one slim pill over the bottom of the floor ----------
  const TOK = n => String(n || '').toLowerCase().replace(/\s+/g, '-');
  const agents = () => { const st = C() && C().state ? C().state() : {}; return (st.members || []).filter(m => m.role === 'agent' && m.owner).sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0)); };
  function agentTok(a) {   // the same names mentions.js offers: @my-claude, @maya's agent as @mayas-claude
    const st = C().state(), me = st.me || {}, ms = st.members || [];
    if (a.owner === me.id) return 'my-claude';
    const o = ms.find(m => m.id === a.owner); return o ? `${TOK(String(o.name).split(/\s+/)[0])}s-claude` : '';
  }
  // "@my-claude", "@mayas-claude", "@claude" (yours, or the only one) or its name: which AI helper a mention means
  function agentOf(tok) {
    const t = String(tok || '').toLowerCase(), list = agents(), me = ((C().state() || {}).me || {}).id;
    return list.find(a => agentTok(a) === t) || list.find(a => TOK(a.name) === t || TOK(String(a.name).split(/\s+·\s+/)[0]) === t && list.length === 1)
      || (/^(?:claude|my-ai|ai-helper)$/.test(t) ? list.find(a => a.owner === me) || (list.length === 1 ? list[0] : null) : null);
  }
  // two chips, only while the box is focused and empty
  function chips() {
    const a = agents()[0], tok = a && agentTok(a);
    return a && tok ? [{ label: T('Give {name} a task', { name: String(a.name).split(' · ')[0] }), fn: ui => ui.fill(`@${tok} `) }, { label: T('What’s everyone doing?'), fn: ui => ui.send('What’s everyone doing?') }]
      : [{ label: T('Add Claude'), fn: ui => ui.send('add claude') }, { label: T('Invite a friend'), fn: ui => ui.send('invite a friend') }];
  }
  // "/" opens the commands
  const CMDS = [['/task ', 'Make a task', 'task'], ['/ai', 'Add an AI helper (Claude, ChatGPT…)', 'ai'], ['/invite', 'Invite a friend', 'invite'], ['/flint ', 'Ask Flint', 'flint'], ['/look', 'Your look on the floor', 'look'], ['/where', 'Where your tribe runs', 'where']];
  let cmdSel = 0;
  function cmdList() { const v = flint ? flint.input.value : ''; return /^\/\S*$/.test(v) ? CMDS.filter(c => c[0].trim().startsWith(v.trim())) : []; }
  function paintCmds() {
    const m = root && root.querySelector('#ao-cmds'); if (!m) return;
    const l = cmdList(); m.hidden = !l.length; if (!l.length) return;
    cmdSel = Math.min(cmdSel, l.length - 1);
    m.innerHTML = l.map((c, i) => `<button type="button" role="option" class="ofl-cmd${i === cmdSel ? ' on' : ''}" aria-selected="${i === cmdSel}" data-ofl-cmd="${esc(c[0])}"><code>${esc(c[0].trim())}</code><span>${esc(T(c[1]))}</span></button>`).join('');
  }
  function pickCmd(c) {
    const ui = flint; if (!ui) return;
    if (/ $/.test(c)) { ui.fill(c); paintCmds(); return; }
    ui.input.value = ''; paintCmds(); ui.send(c);
  }
  let last = [];
  function mountBox() {
    const box = root.querySelector('#ao-box'), F = window.TribeFlint; if (!box) return;
    if (!F || !F.mount) { box.innerHTML = `<p class="ofl-quiet">${esc(T('The message box did not load. Reload the app.'))}</p>`; return; }
    flint = F.mount(box, { ctx: 'office', key: pidNow(), echo: false, placeholder: T('Message the tribe or ask Flint…'), hello: '', run: route, chips: [], after: () => { stripOn(); paintChips(); } });
    if (!flint) return;
    flint.clearAll();
    // the same box as Messages: its classes (.composer-dock .compose, .cx-btn) give the same shape, size and buttons
    box.classList.add('composer-dock'); flint.el.querySelector('.fl-bar').classList.add('compose');
    flint.el.querySelectorAll('.fl-bar .fl-me, .fl-bar .fl-ic').forEach(b => b.classList.add('cx-btn'));
    const inp = flint.input; inp.setAttribute('aria-label', T('Message the tribe, an AI helper or Flint. Type / for commands.')); inp.id = 'ao-input';
    if (window.TribeMentions && window.TribeMentions.wire) window.TribeMentions.wire(inp);
    const pop = document.createElement('div'); pop.id = 'ao-cmds'; pop.className = 'ofl-cmds'; pop.setAttribute('role', 'listbox'); pop.setAttribute('aria-label', T('Commands')); pop.hidden = true;
    flint.el.insertBefore(pop, flint.el.querySelector('.fl-bar'));
    inp.addEventListener('input', () => { cmdSel = 0; paintCmds(); paintChips(); });
    inp.addEventListener('focus', paintChips);
    inp.addEventListener('blur', () => setTimeout(() => { if (!flint.el.contains(document.activeElement)) { flint.chips([]); const m = root && root.querySelector('#ao-cmds'); if (m) m.hidden = true; } }, 150));
    inp.addEventListener('keydown', e => {
      const l = cmdList();
      if (l.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); cmdSel = (cmdSel + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length; return paintCmds(); }
      if (l.length && (e.key === 'Enter' || e.key === 'Tab') && !(l.length === 1 && l[0][0].trim() === inp.value.trim() && !/ $/.test(l[0][0]))) { e.preventDefault(); return pickCmd(l[cmdSel][0]); }
      if (e.key === 'ArrowUp' && !inp.value && last.length) { e.preventDefault(); inp.value = last[last.length - 1]; paintChips(); return; }   // the last thing you sent, again
      if (e.key === 'Escape' && inp.value) { e.preventDefault(); inp.value = ''; paintCmds(); paintChips(); }
    });
    pop.addEventListener('mousedown', e => { const b = e.target.closest('[data-ofl-cmd]'); if (b) { e.preventDefault(); pickCmd(b.dataset.oflCmd); } });
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ofl-x'; x.id = 'ao-replies-x'; x.setAttribute('aria-label', T('Hide the replies')); x.title = T('Hide the replies'); x.innerHTML = ico('x', 14);
    x.onclick = stripOff; flint.el.insertBefore(x, flint.el.querySelector('.flm-thread'));
    flint.el.querySelector('.flm-thread').id = 'ao-replies';
  }
  // "/" anywhere on this page (outside a text box) puts you in the box
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || !root || !root.isConnected || !flint || document.body.dataset.view !== 'coord') return;
    const t = e.target; if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    if (!root.offsetParent) return;
    e.preventDefault(); flint.input.focus(); flint.input.value = '/'; cmdSel = 0; paintCmds(); paintChips();
  });
  function paintChips() { if (!flint) return; const on = document.activeElement === flint.input && !flint.input.value; flint.chips(on ? chips() : []); }
  let stripT = 0, chatUntil = 0;
  function stripOn() {
    if (!root || !flint || !flint.thread.length) return;
    root.dataset.replies = 'on';
    clearTimeout(stripT); stripT = setTimeout(function fade() { const r = root && root.querySelector('#ao-replies'); if (r && (r.matches(':hover') || r.contains(document.activeElement))) { stripT = setTimeout(fade, 4000); return; } stripOff(); }, 12000);
  }
  function stripOff() { clearTimeout(stripT); if (root) delete root.dataset.replies; if (flint) flint.clearAll(); }

  // Where a sentence goes. TribeFlint.mount runs Flint when this returns 'flint'; anything else is done here.
  const SMALL = new Set(['hello', 'thanks', 'help.kb', 'chat.smalltalk', 'smalltalk', 'yes', 'no']);
  const DESIGN = /^(?:please\s+)?(?:make|change|turn|set|add|remove|put|use)\b.*\b(?:website|site|app|page|theme|colou?rs?|dark(?:er)?|light(?:er)?|font|logo|header|headline|button|section)\b/i;
  const AI_KIND = { claude: 'claude', 'claude code': 'claude', chatgpt: 'chatgpt', codex: 'codex', gemini: 'gemini', cursor: 'cursor' };
  function forFlint(text) {
    const t = text.toLowerCase();
    if (/^flint\b[,:]?\s*/i.test(text)) return text.replace(/^flint\b[,:]?\s*/i, '') || 'hi';
    const SE = window.TribeSiteEditCore; try { if (SE && SE.parse && SE.parse(text)) return text; } catch {}
    if (DESIGN.test(t)) return text;
    const L = window.TribeFlintLocal; let p = null; try { p = L && L.parse ? L.parse(text) : null; } catch {}
    const s = p && p.steps && p.steps[0];
    if (s && s.intent && (s.conf || 0) >= 0.6 && !SMALL.has(s.intent) && !/^(?:chat|dm)\.send$/.test(s.intent)) return text;
    return null;
  }
  // "What's everyone doing?": from the office's desks, no AI
  function everyoneLine() {
    const d = O() && O().state(); const list = ((d && d.desks) || []).filter(x => x.state !== 'off');
    if (!list.length) return T('Nobody else is here right now.');
    return list.map(x => { const l = (O().linesOf ? O().linesOf(x) : x.lines || [])[0]; return `${x.name}: ${l || O().statusOf(x)}`; }).join(' · ');
  }
  const openWork = () => (phone() ? sheet('work') : (setPanel(true), show('work')));
  const sent = {};   // cid -> the chat message id, so "Ask Flint instead" can take a message back
  async function route(raw, ui) {
    const text = String(raw || '').trim(); if (!text) return null;
    last = [...last.filter(x => x !== text), text].slice(-20);
    const c = C(), A = AO();
    ui.me(text);
    // the commands
    let m = text.match(/^\/(\w+)\s*(.*)$/);
    if (m && m[1] !== 'task') {
      const k = m[1].toLowerCase(), rest = m[2].trim();
      if (k === 'ai') { const kind = AI_KIND[rest.toLowerCase()] || 'claude'; A.pick(kind); ui.ev(T('The setup for {ai} is open: copy the one line and it joins here.', { ai: kind === 'claude' ? 'Claude' : rest || 'Claude' }), { k: 'info' }); return null; }
      if (k === 'invite') { A.friend(); ui.ev(T('The invite is open.'), { k: 'info' }); return null; }
      if (k === 'where') { A.run('where'); return null; }
      if (k === 'look') { if (window.TribeOfficeLooks && window.TribeOfficeLooks.openMine) { window.TribeOfficeLooks.openMine(); return null; } const sp = space(); if (sp) sp.act('look'); return null; }
      if (k === 'flint') { await ui.flint(rest || 'what can you do'); return null; }
    }
    // "add claude", "connect chatgpt": the one setup for that AI, straight away
    m = text.match(/^(?:please\s+)?(?:add|connect|set ?up|invite|hook up)\s+(?:my\s+|a\s+|an\s+)?(claude(?: code)?|chatgpt|codex|gemini|cursor|(?:an?\s+)?ai(?: helper)?|ai helper)\b/i);
    if (m) { const kind = AI_KIND[m[1].toLowerCase()] || 'other'; A.pick(kind); ui.ev(T('The setup is open: copy the one line and it sits down at a desk here.'), { k: 'info', acts: [{ label: T('Working on'), fn: openWork }] }); return null; }
    if (/^(?:what(?:'|’)?s|what is|what are)\s+(?:every(?:one|body)|people|the agents|the ai helpers)\s+(?:doing|up to|working on)\??$/i.test(text) || /^who(?:'|’)?s here\??$/i.test(text)) {
      ui.say(everyoneLine(), [{ label: T('Working on'), fn: openWork }]); return null;
    }
    // "@claude do X": a task for that AI helper, which hears about it at once (the fleet's route)
    m = text.match(/^@([^\s@]+)\s+(.+)$/);
    const ag = m && agentOf(m[1]);
    if (ag && c && c.hasToken && c.hasToken()) {
      try { await c.api(`/agents/fleet/${encodeURIComponent(ag.id)}/task`, { method: 'POST', body: { title: m[2].trim().slice(0, 200) } }); ui.ev(T('Task given to {name}. Its progress shows in Working on.', { name: ag.name }), { k: 'task', acts: [{ label: T('Working on'), fn: openWork }] }); if (O()) O().refresh(); }
      catch (e) { ui.say(e.message || String(e)); }
      return null;
    }
    if (!text.startsWith('@') && !text.startsWith('/')) { const f = forFlint(text); if (f) { await ui.flint(f); return null; } }
    if (!c || !c.hasToken || !c.hasToken()) { ui.say(T('Start or join a tribe first, then this goes to its chat.')); return null; }
    // "@agents …" is for every AI helper: #agents (it shows in Updates)
    if (/^@agents\b/i.test(text)) {
      try { await c.api('/agents/channel', { method: 'POST', body: { text } }); ui.ev(T('Sent to the AI helpers in #agents.'), { k: 'chat', acts: [{ label: T('Updates'), fn: () => (phone() ? sheet('updates') : (setPanel(true), show('updates'))) }] }); if (tab === 'updates') upSoon(); }
      catch (e) { ui.say(e.message || String(e)); }
      return null;
    }
    // everything else is a message in #general, the same way the Messages box sends it (the outbox: it shows in
    // Messages, counts as unread and notifies; "/task …" becomes a task there, "@someone" mentions them)
    const cid = c.newId ? c.newId() : String(Date.now()), body = { text, cid };
    if (c.queue) c.queue('/chat/general', body, { kind: 'chat', ch: 'general' }); else await c.api('/chat/general', { method: 'POST', body });
    const inMessages = { label: T('Open in Messages'), fn: () => window.TribeApp && window.TribeApp.show && window.TribeApp.show('chat') };
    const task = text.match(/^\/task\s+(.+)/i);
    if (task) ui.ev(T('Task made: {t}', { t: task[1].trim() }), { k: 'task', acts: [{ label: T('Open the board'), fn: () => window.TribeApp && window.TribeApp.show && window.TribeApp.show('tasks') }] });
    else ui.ev(T('Sent to #general.'), { k: 'chat', acts: [inMessages, ...(text.startsWith('@') ? [] : [{ label: T('Ask Flint instead'), fn: u => askInstead(u, text, cid) }])] });
    chatUntil = Date.now() + 3 * 60e3;
    return null;
  }
  // the message goes back out of #general and Flint gets it
  async function askInstead(ui, text, cid) {
    const c = C(), id = sent[cid];
    if (id) try { await c.api(`/chat/general/msg/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch {}
    await ui.flint(text.replace(/^flint\b[,:]?\s*/i, ''));
    stripOn();
  }
  // replies in the chat for a few minutes after you wrote there
  function hook() {
    const c = C(); if (!c || !c.on) return setTimeout(hook, 300);
    c.on('ws', m => {
      if (!m || !flint || !root || !root.isConnected) return;
      if (m.type === 'chat' && m.channel === 'general' && m.message) {
        const st = c.state(), me = (st.me || {}).id, by = m.message.by;
        if (by === me) { if (m.message.cid) sent[m.message.cid] = m.message.id; return; }
        if (Date.now() < chatUntil) { const who = by === 'tribecode' ? 'TribeCode' : ((st.members || []).find(x => x.id === by) || {}).name || T('Someone'); flint.ev(String(m.message.text || '').slice(0, 280), { who2: who, k: 'chat' }); stripOn(); }
      }
      if (/^(office|coord|task|tasks|claims|chat|agents|approval)/.test(m.type || '') && tab === 'updates') upSoon();
    });
    c.on('presence', () => { if (tab === 'updates') upSoon(); });
  }
  let upT = 0; const upSoon = () => { clearTimeout(upT); upT = setTimeout(() => { if (root && root.isConnected) updates(); }, 600); };
  hook();
  setInterval(() => { if (root && root.isConnected && tab === 'updates' && document.visibilityState === 'visible') updates(); }, 30000);
  // ---------- the head line: who is here, as small avatars ----------
  const initials = n => (String(n || '?').trim().split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).map(w => [...w][0]).slice(0, 2).join('') || '?').toUpperCase();
  function hereHtml() {
    const Of = O(); if (!Of || !Of.state()) return '';
    const list = ((Of.state().desks) || []).slice().sort((a, b) => (a.state === 'off') - (b.state === 'off'));
    const shown = list.slice(0, 6);
    return shown.map(x => `<button type="button" class="ofl-av" data-desk="${esc(x.id)}" data-role="${x.kind === 'agent' ? 'agent' : 'person'}" data-state="${esc(x.state)}" aria-label="${esc(x.name)}, ${esc(Of.statusOf(x))}" title="${esc(x.name)} · ${esc(Of.statusOf(x))}">${esc(initials(x.name))}</button>`).join('')
      + (list.length > 6 ? `<button type="button" class="ofl-av ofl-av-n" data-ofl-sheet="work" aria-label="${esc(T('{n} more', { n: list.length - 6 }))}">+${list.length - 6}</button>` : '');
  }
  function sync() {
    if (!root || !root.isConnected) return;
    paintBar();
    const h = root.querySelector('#ao-here'); if (h) { const html = hereHtml(); if (h.__sig !== html) { h.__sig = html; h.innerHTML = html; } }
    if (AO() && AO().refresh) AO().refresh();
    root.dataset.view = O() ? (O().hidden() ? 'hidden' : O().view()) : 'desks';
  }

  // ---------- wiring ----------
  function wireFrame() {
    root.addEventListener('click', e => {
      const t = e.target.closest ? e.target : null; if (!t) return;
      const tb = t.closest('[data-ofl-tab]'); if (tb) { if (phone()) return show(tb.dataset.oflTab); if (root.dataset.panel !== 'open') setPanel(true); return show(tb.dataset.oflTab); }
      if (t.closest('#ofl-fold')) { if (phone()) return closeSheet(); return setPanel(root.dataset.panel !== 'open'); }
      const sb = t.closest('[data-ofl-sheet]'); if (sb) { if (phone()) return sheet(sb.dataset.oflSheet); setPanel(true); return show(sb.dataset.oflSheet); }
      const v = t.closest('[data-ofl-view]'); if (v) return O().setView(v.dataset.oflView);
      const z = t.closest('[data-ofl-zoom]'); if (z) { const sp = space(); if (sp) sp.act(z.dataset.oflZoom); return; }
      if (t.closest('#ao-more')) return openMenu();
      const mi = t.closest('[data-aom]'); if (mi) return menuAct(mi.dataset.aom, mi);
      const av = t.closest('#ao-here [data-desk]'); if (av) return O().openCard(av.dataset.desk);
    });
    root.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-aom-set]'); if (s) { const sp = space(); if (sp) sp.act('set', s.value); } });
    root.addEventListener('keydown', e => {
      const tb = e.target.closest && e.target.closest('[data-ofl-tab]');
      if (tb && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        const ks = TABS.map(x => x[0]), i = ks.indexOf(tb.dataset.oflTab);
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? ks.length - 1 : (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + ks.length) % ks.length;
        e.preventDefault(); show(ks[n], true); return;
      }
      const m = root.querySelector('#ao-menu');
      if (m && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); const b = root.querySelector('#ao-more'); if (b) b.focus(); return; }
      if (m && m.contains(e.target) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const all = [...m.querySelectorAll('[data-aom], select')], i = all.indexOf(document.activeElement);
        const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]; if (n) { e.preventDefault(); n.focus(); }
      }
      if (root.dataset.sheet === 'open' && e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    });
    document.addEventListener('mousedown', e => { const m = root && root.querySelector('#ao-menu'); if (m && !m.contains(e.target) && !(e.target.closest && e.target.closest('#ao-more'))) closeMenu(); });
  }
  // leaving the page closes the sheet and the menu
  new MutationObserver(() => { if (document.body.dataset.view !== 'coord') { closeSheet(); closeMenu(); } }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

  // tab(k): show a tab without popping the phone's sheet open (computers open the panel)
  const tab0 = k => { if (!phone()) { if (root && root.dataset.panel !== 'open') { ls.set(LS_PANEL, 'open'); root.dataset.panel = 'open'; } } show(k); };
  window.TribeOfficeFull = { ensure, work, sync, tab: tab0, open: k => (phone() ? sheet(k) : (setPanel(true), show(k))), close: closeSheet, panel: setPanel, route: t => (flint ? flint.send(t) : null), box: () => flint, updates, menu: openMenu, everyoneLine };
})();
