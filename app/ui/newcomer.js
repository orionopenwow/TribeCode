// Newcomer start (feat/newcomer-start). Two rules for someone who has nothing yet.
//   blank()  The first project a TribeCode server makes on its own (the desktop app's or a fresh server's "My Tribe"),
//            while it is still exactly as made: the server marks it untouched (server/rooms.js). While it is the only
//            project, Home shows the one sentence ("What do you want to make?") instead of that empty dashboard, and the
//            sentence fills this project (TribeProjects.startFromIdea) instead of making a second one.
//   quiet()  The sidebar leaves out Set up company, Agents Hub and Agent fleet for a person with no project yet, or
//            whose tribe is only them with no AI helper and no company. They come back as soon as a second person, an AI
//            helper or a company is there. Ctrl K, the breadcrumb menu and Settings › Connect your AI still find them,
//            and a hidden row shows while its page is open.
// Automated browsers keep the old start unless ?newcomer=1 or ?freshopen=1 (like app.js's auto-claim), so tests that
// expect a project dashboard on a fresh server still get one.
//   window.TribeNewcomer = { live, blank, quiet, paint, whenKnown }
(function () {
  'use strict';
  const C = window.TribeClient;
  const live = () => !navigator.webdriver || /[?&](newcomer|freshopen)(=|&|$)/.test(location.search);
  const PJ = () => window.TribeProjects;

  function blank() {
    if (!live() || !C || !C.connected()) return null;
    const P = PJ(); if (!P || !P.loaded || !P.loaded()) return null;
    const l = P.list() || [];
    return l.length === 1 && l[0].untouched ? l[0] : null;
  }

  function quiet() {
    if (!live() || !C) return false;
    if (!C.connected()) return C.hasToken() ? document.body.classList.contains('nc-quiet') : true;   // no tribe yet; offline keeps what it was
    const st = C.state() || {}, me = st.me || {}, ms = st.members || [];
    if (me.role === 'agent' || me.role === 'spectator') return false;
    if (ms.some(m => m.role === 'agent')) return false;   // an AI helper
    if (ms.some(m => m.id !== me.id)) return false;      // a second person
    if (window.TribeCompany && window.TribeCompany.get && window.TribeCompany.get()) return false;   // a company
    return true;
  }

  function paint() {
    const q = quiet();
    if (document.body.classList.contains('nc-quiet') !== q) document.body.classList.toggle('nc-quiet', q);
  }
  let t = null; const soon = (ms = 120) => { clearTimeout(t); t = setTimeout(paint, ms); };

  // Run fn(blank()) once the project list is known (at most a few seconds after connecting).
  function whenKnown(fn) {
    const P = PJ(); let done = false;
    const go = () => { if (done) return; done = true; removeEventListener('tribe-projects-loaded', go); fn(blank()); };
    if (P && P.loaded && P.loaded()) return go();
    addEventListener('tribe-projects-loaded', go);
    setTimeout(go, 6000);
  }

  if (C && C.on) {
    C.on('hello', () => soon()); C.on('presence', () => soon()); C.on('status', () => soon()); C.on('project', () => soon(400));
    C.on('ws', m => { if (m && m.type === 'company') soon(800); });
  }
  addEventListener('tribe-projects-loaded', () => soon());
  addEventListener('hashchange', () => soon());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => paint(), { once: true }); else paint();

  window.TribeNewcomer = { live, blank, quiet, paint, whenKnown };
})();
