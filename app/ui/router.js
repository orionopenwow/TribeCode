// One router: the single source of truth for where you are (docs/NAVIGATION.md).
//   place: 'global' (your own dashboard: Home, Files, Design, Code, Work, Agent fleet) or 'project' (inside a tribe's project)
//   section: the destination key on screen (TribeShell's registry: hub, docs-all, design-all, repos-all, work, fleet, home, chat, bugs…)
// Every button already lands in TribeShell.go(key) or a module's open(); the router watches the result and
//   - keeps browser history in step: each settled move is one history.pushState entry, so Back / Forward (and Alt+← / Alt+→,
//     the mouse's back button inside the desktop app) walk through places you've been, across projects too;
//   - keeps the global sidebar for the global sections (they never jump into a tribe's nest);
//   - stops dead ends: a project place asked for with no tribe at all lands on Home with one clear next step;
//   - sweeps stale panes: exactly one main view stays mounted after a move.
// Other modules replace the hash (#/hub/docs, #/tasks/bugs) with replaceState; this keeps the route state on that entry.
// Public: window.TribeRouter = { where(), go(key), back(), isGlobal(), history() }.
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const SH = () => window.TribeShell;
  const PJ = () => window.TribeProjects;
  const App = () => window.TribeApp;
  const toast = m => App() && App().toast && App().toast(m);
  const GLOBAL_KEYS = { hub: 'home', 'docs-all': 'docs', 'design-all': 'design', 'repos-all': 'repos', work: 'work', fleet: 'fleet' };
  const SEC_KEY = { home: 'hub', docs: 'docs-all', design: 'design-all', repos: 'repos-all', work: 'work', fleet: 'fleet' };
  const PROJECT_ONLY = new Set(['company', 'money', 'project-settings']);   // plus every core / docs / tasks / agents destination

  // ---------- where am I ----------
  function isGlobal() {
    const v = document.body.dataset.view || '';
    return !v || v === 'hub' || v === 'work' || (v === 'agents-hub' && document.body.dataset.scope === 'global');
  }
  function where() {
    const v = document.body.dataset.view || 'hub';
    if (isGlobal()) {
      const sec = v === 'work' ? 'work' : v === 'agents-hub' ? 'fleet' : ((window.TribeHub && window.TribeHub.mode()) || 'home');
      return { place: 'global', section: sec, key: SEC_KEY[sec] || 'hub' };
    }
    const key = (SH() && SH().current && SH().current()) || v;
    return { place: 'project', project: (C && C.project && C.project()) || null, view: v, key };
  }
  const sig = l => l ? [l.place, l.project || '', l.section || l.view || '', l.key || ''].join('|') : '';

  // ---------- going somewhere ----------
  const offlineDemo = () => !!(window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active());
  function projectOnly(key) {
    if (PROJECT_ONLY.has(key)) return true;
    const d = SH() && SH().dests ? SH().dests().find(x => x.key === key) : null;
    return !!d && ['core', 'docs', 'tasks', 'agents'].includes(d.group);
  }
  // No tribe on this device: a project place has nothing to show. Home says what to do instead of a blank page.
  function blocked(key) {
    if (!projectOnly(key) || offlineDemo() || (C && C.hasToken && C.hasToken())) return false;
    if (window.TribeHub) window.TribeHub.open('home'); else if (App()) App().show('hub');
    toast('That lives inside a tribe. Start your first project or join one with a link, right here on Home.');
    return true;
  }
  function go(key) {
    if (!key) return;
    if (blocked(key)) return;
    if (SH() && SH().go) SH().go(key);
  }

  // ---------- history: one entry per settled move ----------
  let last = '', restoring = 0, n = 0, settleT = null;
  const native = { push: history.pushState.bind(history), replace: history.replaceState.bind(history) };
  // Modules rewrite their hash with replaceState(null, …) while they hand over (hub.js on leaving Home), which wipes the
  // route off the entry we are leaving. Just before pushing the new place, the old entry gets its route and URL back.
  let lastLoc = null, lastUrl = '';
  const stamp = l => { if (!history.state || history.state.tribeRoute) native.replace({ ...(history.state || {}), tribeRoute: l, n: (history.state && history.state.n) || n }, '', location.href); };
  const trail = [];   // the places this tab has been (tests and the docs read it through history())
  function settle() {
    settleT = null;
    const l = where(), s = sig(l);
    if (restoring && Date.now() < restoring) { restoring = 0; last = s; lastLoc = l; lastUrl = location.href; stamp(l); sweep(l); return; }
    restoring = 0;
    if (s === last) { lastUrl = location.href; if (!history.state) stamp(l); return; }
    const first = !last, prev = lastLoc, prevUrl = lastUrl, url = location.href; last = s; lastLoc = l; lastUrl = url; sweep(l);
    if (first || (history.state && history.state.pvw)) { stamp(l); trail.push(s); return; }
    if (prev) native.replace({ tribeRoute: prev, n }, '', prevUrl || url);
    native.push({ tribeRoute: l, n: ++n }, '', url);
    trail.push(s); if (trail.length > 100) trail.shift();
  }
  const soon = () => { clearTimeout(settleT); settleT = setTimeout(settle, 140); };
  new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'data-scope'] });
  setTimeout(() => { const cl = $('#crumb-label'); if (cl) new MutationObserver(soon).observe(cl, { childList: true, characterData: true, subtree: true }); soon(); }, 0);
  if (C && C.on) C.on('project', soon);

  async function apply(l) {
    restoring = Date.now() + 1500;
    if (l.place === 'global') {
      if (l.section === 'work') { if (window.TribeTalent) window.TribeTalent.open(); return; }
      if (l.section === 'fleet') { if (SH()) SH().go('fleet'); return; }
      if (window.TribeHub) window.TribeHub.open(l.section || 'home');
      return;
    }
    if (!(C && C.hasToken && C.hasToken()) && !offlineDemo()) { if (window.TribeHub) window.TribeHub.open('home'); return; }
    if (l.project && PJ() && PJ().current && PJ().current() !== l.project && (PJ().list() || []).some(p => p.id === l.project)) {
      try { await PJ().switchTo(l.project, l.view); } catch {}
    }
    const has = SH() && SH().dests && SH().dests().some(d => d.key === l.key);
    if (has) SH().go(l.key); else if (App() && App().show) App().show(l.view);
  }
  // The full-screen preview (preview.js) pushes its own entry and steps back off it when it closes: that Back is its own,
  // not a move between places, so the place on screen stays.
  let pvwOn = document.body.classList.contains('pvw-focus'), pvwLeft = 0;
  new MutationObserver(() => { const on = document.body.classList.contains('pvw-focus'); if (pvwOn && !on) pvwLeft = Date.now(); pvwOn = on; }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  addEventListener('popstate', e => {
    const l = e.state && e.state.tribeRoute; if (!l) return;
    if (Date.now() - pvwLeft < 1500) { pvwLeft = 0; last = sig(where()); lastLoc = where(); lastUrl = location.href; stamp(lastLoc); return; }
    if (sig(l) === sig(where())) { last = sig(l); return; }
    closeLayers();
    apply(l);
  });
  // the layers that sit over a place (Workshop, Guide, popovers, the profile menu) close when you move with Back
  function closeLayers() {
    try { if (window.TribeWorkshop && window.TribeWorkshop.isOpen && window.TribeWorkshop.isOpen()) window.TribeWorkshop.close(); } catch {}
    try { if (window.TribeGuide && window.TribeGuide.close && document.body.classList.contains('gd-open')) window.TribeGuide.close(); } catch {}
    try { if (window.TribeProfileMenu) window.TribeProfileMenu.close(); } catch {}
  }
  // Back with the keyboard and the mouse's back button (the desktop app has no browser toolbar).
  const typing = t => t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], .cm-editor');
  addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); history.back(); } else if (e.key === 'ArrowRight') { e.preventDefault(); history.forward(); }
  });
  addEventListener('mouseup', e => { if (e.button === 3) { e.preventDefault(); history.back(); } else if (e.button === 4) { e.preventDefault(); history.forward(); } });

  // ---------- stale panes: one main view on screen ----------
  function sweep(l) {
    home(l);
    const v = document.body.dataset.view; if (!v) return;
    const mine = document.getElementById('view-' + v);
    if (!mine || mine.classList.contains('hidden')) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== mine && !s.classList.contains('hidden')) s.classList.add('hidden'); });
    document.body.classList.toggle('global', l.place === 'global');
  }
  // feat/files-dash: make it obvious you are on Home: the rail logo is lit, the breadcrumb starts with "Home ›"
  function home(l) {
    const g = l.place === 'global', lg = $('#rail-logo');
    if (lg) { lg.classList.toggle('on', g); if (g) lg.setAttribute('aria-current', 'page'); else lg.removeAttribute('aria-current'); }
    let hc = $('#crumb-home'); const sec = $('#crumb-section');
    if (!hc && sec) { hc = document.createElement('span'); hc.id = 'crumb-home'; hc.className = 'crumb-home'; hc.innerHTML = '<button class="crumb crumb-h" type="button" title="Home: your dashboard">Home</button><span class="sep" aria-hidden="true">›</span>'; sec.before(hc); hc.querySelector('button').onclick = () => (window.TribeHub ? window.TribeHub.open('home') : App().show('hub')); }
    if (hc) hc.hidden = !g;
  }

  // ---------- deep links that belong to the router ----------
  const fromHash = () => { if (location.hash === '#/hub/work' && document.body.dataset.view !== 'work' && window.TribeTalent) window.TribeTalent.open(); };
  addEventListener('hashchange', fromHash);
  if (location.hash === '#/hub/work') addEventListener('load', () => setTimeout(fromHash, 0), { once: true });

  // The rail logo: always your Home, from anywhere (closing whatever layer is open).
  const logo = $('#rail-logo');
  if (logo) logo.addEventListener('click', () => { closeLayers(); }, true);

  window.TribeRouter = { where, go, isGlobal, back: () => history.back(), history: () => trail.slice(), blocked: key => projectOnly(key) && !(C && C.hasToken && C.hasToken()) && !offlineDemo() };
})();
