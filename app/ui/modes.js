// Experience modes (v0.20): Beginner, Intermediate or Advanced decides how much of TribeCode a person sees.
// Roles still decide what someone is allowed to do (server/perms.js); the mode only decides what is on screen,
// so a beginner is never buried in agent coordination and an advanced builder never hunts for it.
//
// Which mode applies, first match wins:
//   1. the person's own choice (Settings › Experience), saved on their member record so it follows them to any device
//   2. the starting mode the host set for their role (Settings › Starting modes; tribe.modes)
//   3. what they said in the welcome ("Have you made an app before?": new → Beginner, a little → Intermediate)
//   4. Advanced: nothing hidden, the way TribeCode has always looked
//
//   TribeMode.get()            'beginner' | 'intermediate' | 'advanced'
//   TribeMode.allows(min)      true when the current mode is at least min
//   TribeMode.set(mode)        save your own choice ('' goes back to the default)
//   TribeMode.minFor(key)      the least mode a sidebar section needs
//   TribeMode.picker(el)       draws the three-choice picker into el
// In markup, data-mode-min="intermediate|advanced" hides an element below that mode (CSS in readability.css).
(function () {
  const MODES = [
    { k: 'beginner', e: '🌱', t: 'Beginner', s: 'Chat, Flint, templates, the Academy, the Marketplace and one-tap shipping. A company starts simple: seats and today\'s updates.' },
    { k: 'intermediate', e: '🌿', t: 'Intermediate', s: 'Adds the code repository, reviews, milestones, your own agents, Money, Work (gigs and hiring) and company goals.' },
    { k: 'advanced', e: '🌳', t: 'Advanced', s: 'Everything: seat autopilot, connectors, compute sharing, ownership, conflicts, hand-offs, MCP, the agent fleet and Turbo.' },
  ];
  const RANK = { beginner: 0, intermediate: 1, advanced: 2, focus: 9 };
  // Focused first run (app/ui/focus.js): while a new person is getting their first thing running, the sidebar keeps only
  // these; everything else is one "Show everything" (or one "Turn it on") away. Saved per device: 'tribecode.focus'.
  const FOCUS_KEEP = new Set(['home', 'chat', 'docs', 'docs-files', 'ws-tasks', 'tasks', 'hub', 'docs-all', 'settings', 'invite', 'updates', 'huddle', 'capture', 'guide', 'scratch', 'panel', 'project-settings', 'customize', 'context']);
  const focusOn = () => lsGet('tribecode.focus') === '1';
  // the least mode each sidebar section needs; anything not listed is for everyone
  const MIN = {
    repo: 'intermediate', 'repos-all': 'intermediate', visuals: 'intermediate', captures: 'intermediate', milestones: 'intermediate',
    agents: 'intermediate', 'agents-hub': 'intermediate', reviews: 'intermediate', plan: 'intermediate', roles: 'intermediate', bugs: 'intermediate',
    ownership: 'advanced', conflicts: 'advanced', handoffs: 'advanced', 'mcp-directory': 'advanced', fleet: 'advanced', secretary: 'advanced',
    money: 'intermediate', work: 'intermediate',   // v0.27 company: Company, Academy and the Marketplace are for everyone
  };
  // v0.27: features stack at your request. "Turn it on" (a recommendation, Flint, or a locked row) unlocks one feature for
  // you without changing your whole mode. Saved per device: localStorage 'tribecode.mode.unlocked'.
  const UKEY = 'tribecode.mode.unlocked';
  const unlocked = () => { try { return new Set(JSON.parse(lsGet(UKEY) || '[]')); } catch { return new Set(); } };
  const LKEY = 'tribecode.mode';
  const C = () => window.TribeClient;
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
  const ok = m => Object.prototype.hasOwnProperty.call(RANK, m);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fromWelcome() {
    try { const w = JSON.parse(lsGet('tribecode.welcome.tribe') || 'null'); return w && ({ new: 'beginner', some: 'intermediate', lots: 'advanced' })[w.level] || ''; } catch { return ''; }
  }
  function roleDefault() {
    const st = C() && C().state(), me = st && st.me, modes = st && st.tribe && st.tribe.modes;
    if (!me || !modes) return '';
    const role = me.guest ? 'guest' : me.role;
    return role === 'host' ? '' : (ok(modes[role]) ? modes[role] : '');
  }
  function own() {
    const st = C() && C().state(), me = st && st.me;
    if (me && ok(me.mode)) return me.mode;
    const l = lsGet(LKEY); return ok(l) ? l : '';
  }
  const get = () => own() || roleDefault() || fromWelcome() || 'advanced';
  const allows = min => !min || RANK[get()] >= (RANK[min] || 0);
  const minFor = key => (unlocked().has(key) ? '' : focusOn() && !FOCUS_KEEP.has(key) ? 'focus' : MIN[key] || '');
  const allowsKey = key => allows(minFor(key));
  function unlock(key) { const u = unlocked(); u.add(String(key)); lsSet(UKEY, JSON.stringify([...u].slice(-60))); last = ''; apply(); document.dispatchEvent(new CustomEvent('tribe:mode', { detail: { mode: get(), unlocked: key } })); }
  const isUnlocked = key => unlocked().has(key);
  const source = () => own() ? 'yours' : roleDefault() ? 'role' : fromWelcome() ? 'welcome' : 'default';

  let last = '';
  function apply() {
    const m = get(); document.body.dataset.mode = m;
    document.body.classList.toggle('focus-run', focusOn());
    document.body.dataset.unlocked = [...unlocked()].join(' ');   // v0.27: CSS can show an unlocked panel below its mode
    const sig = m + (focusOn() ? '+f' : ''); if (sig === last) return; const first = !last; last = sig;
    if (!first) {
      if (window.TribeShell && window.TribeShell.render) try { window.TribeShell.render(); } catch {}
      if (window.TribeShell && window.TribeShell.tabs) try { window.TribeShell.tabs(); } catch {}
      document.dispatchEvent(new CustomEvent('tribe:mode', { detail: { mode: m } }));
    }
  }
  async function set(mode) {
    const m = ok(mode) ? mode : '';
    lsSet(LKEY, m);
    const st = C() && C().state();
    if (st && st.me) { st.me.mode = m || undefined; if (C().connected()) { try { await C().api('/me', { method: 'PATCH', body: { mode: m } }); } catch {} } }
    apply(); return get();
  }

  // the three-choice picker (Settings, the welcome, the profile sheet)
  function picker(el, { onPick } = {}) {
    if (!el) return;
    const draw = () => {
      const cur = get(), src = source();
      el.innerHTML = `<div class="md-pick" role="radiogroup" aria-label="Experience">${MODES.map(x => `<button type="button" class="md-opt${x.k === cur ? ' on' : ''}" role="radio" aria-checked="${x.k === cur}" data-mode="${x.k}"><span class="md-e" aria-hidden="true">${x.e}</span><span class="md-t"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span></button>`).join('')}</div>
        ${src === 'role' ? '<p class="faint md-note">Your host picked this for your role. Choose another any time.</p>' : ''}`;
      el.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => { await set(b.dataset.mode); draw(); if (onPick) onPick(get()); });
    };
    draw();
  }
  // the host's starting mode for each role
  function rolePicker(el) {
    if (!el) return;
    const st = C() && C().state(), cur = (st && st.tribe && st.tribe.modes) || {};
    const ROLES = [['admin', 'Admins'], ['mod', 'Mods'], ['builder', 'Builders'], ['spectator', 'Spectators'], ['guest', 'Guests']];
    el.innerHTML = `<div class="md-roles">${ROLES.map(([r, l]) => `<label class="md-role"><span>${l}</span><select class="input set-select" data-role-mode="${r}" aria-label="Starting mode for ${l}">
        <option value="">Their choice</option>${MODES.map(x => `<option value="${x.k}" ${cur[r] === x.k ? 'selected' : ''}>${x.e} ${x.t}</option>`).join('')}</select></label>`).join('')}</div>`;
    el.querySelectorAll('[data-role-mode]').forEach(s => s.onchange = async () => {
      const body = {}; el.querySelectorAll('[data-role-mode]').forEach(x => { if (x.value) body[x.dataset.roleMode] = x.value; });
      try { const r = await C().api('/tribe/modes', { method: 'PUT', body }); if (st && st.tribe) st.tribe.modes = r.modes; apply(); } catch (e) { if (window.TribeApp && window.TribeApp.toast) window.TribeApp.toast(e.message); }
    });
  }

  function boot() {
    apply();
    const c = C(); if (c && c.on) { c.on('hello', apply); c.on('tribe', apply); c.on('presence', apply); }
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
  // focus(true|false): the focused first run turns this on for a new person and off with "Show everything"
  function focus(on) { lsSet('tribecode.focus', on ? '1' : ''); last = '~'; apply(); }
  window.TribeMode = { MODES, get, allows, allowsKey, set, minFor, unlock, isUnlocked, source, picker, rolePicker, apply, focus, focused: focusOn };
})();
