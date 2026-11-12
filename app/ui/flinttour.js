// Flint's tour (v0.28.1): the one guided look around, for someone who just opened TribeCode.
// After Make it yours (personalize.js) Flint asks "Want a quick look around?". Yes flies him (flintguide.js, the
// flame that flies with pixel embers) to each real place with one short sentence and a small thing to try:
//   your Dashboard · Start a project · the project rail and + · Join with a link · inside a project (Messages, Files,
//   Design, Task Board, Agents Hub, Preview) · Flint himself · Ctrl K · Settings and Make it yours · the ? menu.
// Before you have a project, the project places are shown on a small "Inside a project" frame; once your first
// project exists a "Continue the tour" chip takes you round the real ones. Pause (or Esc) keeps your place; the
// ? menu, Ctrl K and the Dashboard's "Tour with Flint" pick it up again. One thing on screen at a time: it waits
// for Make it yours, the first run and Flint's intro. Never under automation unless ?flinttour=1 (or the test flag).
//   window.TribeFlintTour = { start(), offer(), label(), state(), reset() }
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const KEY = 'tribecode.flint.tour2';
  const C = () => window.TribeClient, App = () => window.TribeApp, G = () => window.TribeFlintGuide;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const write = patch => { const s = { ...read(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} return s; };
  const forced = () => /[?&]flinttour=1/.test(location.search) || (() => { try { return localStorage.getItem('tribecode.flinttour.test') === '1'; } catch { return false; } })();
  const blocked = () => /[?&](skipIntro|demo=|notour|welcome|tour=)/.test(location.search) || /^\/m\//.test(location.pathname)
    || (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active()) || (navigator.webdriver && !forced());
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden'; };
  // selectors are tried in the order written (the first is the preferred target), not document order
  const find = sel => { for (const one of sel.split(',')) { const el = [...document.querySelectorAll(one.trim())].find(visible); if (el) return el; } return null; };
  const inProject = () => !!(C() && C().connected && C().connected() && ((C().state() || {}).projects || []).length);
  const busy = () => !!($('#pz') || $('#fr-start') || $('#fg-intro') || $('#wl') || $('#intro') || (window.TribePersonalize && window.TribePersonalize.isOpen && window.TribePersonalize.isOpen()));

  // ---------- the stops ----------
  // [selector(s), sentence, try-it, needs a project?]. Project places point at the small frame when there is none yet.
  const PLACES = [
    { id: 'chat', sel: '#nest-chat', mock: 'Messages', icon: 'i-chat', text: 'Messages: one chat for your friends and their AI helpers, with channels and DMs.', tip: 'Type /task in chat and it lands on the board.' },
    { id: 'docs', sel: '#nest-docs', mock: 'Files', icon: 'i-doc', text: 'Files: docs that work like Notion, sheets, decks and any file you drop in.', tip: 'Start a note and it goes straight into your files.' },
    { id: 'canvas', sel: '#nest-canvas', mock: 'Design', icon: 'i-canvas', text: 'Design: a canvas like Figma. Draw screens, or ask me for one, then send it to the app as code.', tip: 'Try: "make a login screen".' },
    { id: 'tasks', sel: '#nest-ws-tasks', mock: 'Task Board', icon: 'i-check', text: 'Task Board: who does what, with one clear button for the next step on every task.', tip: 'Say "task: add a title screen" to me.' },
    { id: 'agents', sel: '#nest-ws-agents', mock: 'Agents Hub', icon: 'i-robot', text: 'Agents Hub: everyone’s AI helpers, what they’re working on, and their hand-offs.', tip: 'Connect your Claude Code, Codex or Gemini here.' },
    { id: 'preview', sel: '#nest-preview-slot .nest-row, #nest-preview-slot button, .wg-preview', mock: 'Preview app', icon: 'i-play', text: 'Preview: your app, game or site running live, with me beside it to change anything you click.', tip: 'Click a heading, then "make it bigger".' },
  ];
  function stops() {
    const proj = inProject();
    const list = [];
    if (proj) list.push({ sel: '#nest-overview, #rail-logo', text: 'This is your project’s Dashboard: what’s new, who’s here and what to do next.' });
    else list.push({ sel: '#hub-hero, #rail-logo', text: 'This is your Dashboard. Your projects, notes and what’s new all gather here.' });
    if (!proj) list.push({ sel: '#hub-host', text: 'Start your first project here. Say what you want to make and I build a first version you can run. Free, no AI needed.' });
    list.push({ sel: '#pj-rail, #pj-plus', text: 'Your projects sit in this rail, like servers on Discord. + starts a new one or joins a friend’s.', tip: phone() ? '' : 'Each circle is its own room.' });
    if (!proj) list.push({ sel: '#hub-join', text: 'Got a link from a friend? Paste it here and you’re in, on this computer or your phone.' });
    PLACES.forEach(p => list.push({ ...p, sel: proj ? p.sel : `#ft-m-${p.id}`, project: true }));
    list.push({ sel: '[data-flbar] .fl-in, .fl-in, #ft-m-flint', text: 'And me: ask anything, in plain words. Notes, tasks, themes, “how do I…”. Most things work without any AI.', tip: 'Try: “what can you do for free?”' });
    list.push({ sel: '#tour-search', text: 'Ctrl K jumps anywhere: docs, tasks, people, settings and actions.', tip: 'Press Ctrl K now and type “theme”.' });
    list.push({ sel: '#ub-me, #ub-gear, #nest-settings', text: 'You and your settings. Make it yours again any time from your profile menu.' });
    list.push({ sel: '#tb-help', text: 'Lost? The ? has the Guide, shortcuts, a demo tribe to play with, and this tour.' });
    return list;
  }

  // ---------- the small "Inside a project" frame (before your first project) ----------
  const ico = (k, n = 16) => `<svg class="i" style="width:${n}px;height:${n}px" aria-hidden="true"><use href="#${k}"/></svg>`;
  function mock(on) {
    let m = $('#ft-mock');
    if (!on) { if (m) m.remove(); return; }
    if (m) return m;
    m = document.createElement('div'); m.id = 'ft-mock'; m.className = 'ft-mock'; m.setAttribute('aria-hidden', 'true');
    m.innerHTML = `<div class="ft-mk-head"><span class="eyebrow">${esc(t('Inside a project'))}</span><small>${esc(t('You’ll see this once you have a project'))}</small></div>
      <div class="ft-mk-rows">${PLACES.map(p => `<div class="ft-mk-row" id="ft-m-${p.id}">${ico(p.icon)}<span>${esc(t(p.mock))}</span></div>`).join('')}</div>
      <div class="ft-mk-flint" id="ft-m-flint"><img src="assets/flint.svg" alt="" width="16" height="16"><span>${esc(t('Ask Flint…'))}</span></div>`;
    document.body.appendChild(m);
    return m;
  }

  // ---------- running it ----------
  let running = false, skipped = [];
  async function run(from) {
    if (running || !G()) return; running = true; skipped = [];
    const proj = inProject(), list = stops();
    let i = Math.max(0, Math.min(list.length - 1, from || 0));
    write({ started: true, mode: proj ? 'project' : 'fresh' });
    let res = 'next';
    try {
    for (; i < list.length; i++) {
      const s = list[i];
      if (s.project && !proj) mock(true); else mock(false);
      let el = find(s.sel);
      for (let w = 0; !el && w < 8; w++) { await new Promise(r => setTimeout(r, 250)); el = find(s.sel); }   // watchdog: 2 s, then the next stop
      if (!el) { skipped.push(s.id || s.sel); continue; }
      write({ i });
      const text = t(s.text) + (s.tip ? ` ${t(s.tip)}` : '');
      res = await G().point(el, text, { keep: true, dim: true, steps: list.length, step: i, skip: i < list.length - 1, skipLabel: t('Pause'), next: i === list.length - 1 ? t('Done') : t('Next') });
      if (res !== 'next') break;
    }
    } catch (e) { console.warn('flint tour:', e); res = 'skip'; }   // feat/demo-auto: an error never leaves the dim on
    mock(false);
    if (res === 'next') { const s0 = read(); write({ i: 0, done: true, paused: false, project: proj || !!s0.project, after: proj ? !!s0.after : true }); }
    else write({ paused: true, i });
    G().hide();
    running = false;
    window.dispatchEvent(new CustomEvent('tribe-flinttour', { detail: { done: res === 'next', proj } }));
    if (res !== 'next' && App() && App().toast) App().toast(t('Tour paused. Pick it up from the ? menu.'));
    rerenderHub();
  }
  function rerenderHub() { try { if (document.body.dataset.view === 'hub' && window.TribeHub && window.TribeHub.open) window.TribeHub.open('home'); } catch {} }
  function start() {
    hideChip();
    const s = read();
    // after a fresh-mode tour, "start" with a project goes round the real project places
    if (inProject() && s.after && !s.project) return run(0);
    return run(s.paused ? (s.i || 0) : 0);
  }
  function label() { const s = read(); return s.paused ? t('Continue the tour') : t('Tour with Flint'); }

  // ---------- the offer: once, right after Make it yours ----------
  async function offer() {
    if (!G() || blocked() || running) return;
    const s = read(); if (s.offered) return;
    write({ offered: true });
    const anchor = phone() ? find('#hpt-brand, #hub-hero') : find('#hub-hero, #rail-logo, #hpt-brand');   // phones: the top bar, so the bubble sits clear of the page
    const r = await G().point(anchor, t('Hi, I’m Flint! Want a quick look around? It takes about a minute.'), { keep: true, next: t('Yes, show me'), skip: true, skipLabel: t('Later') });
    if (r === 'next') { G().hide(); return run(0); }
    write({ later: true }); G().hide(); rerenderHub();
  }
  function maybeOffer() {
    if (blocked() || read().offered) return;
    if (busy()) return setTimeout(maybeOffer, 800);
    setTimeout(offer, 500);
  }
  window.addEventListener('tribe-personalized', () => setTimeout(maybeOffer, 400));
  // Make it yours already done (or not shown on this device): offer on a fresh open, or on the first hello
  const quietStart = () => { if (window.TribePersonalize && window.TribePersonalize.pending && window.TribePersonalize.pending()) return; setTimeout(maybeOffer, 1200); };
  window.addEventListener('tribe-fresh', quietStart);
  const hook = () => { const c = C(); if (!c || !c.on) return setTimeout(hook, 300); c.on('hello', () => { setTimeout(quietStart, 1500); setTimeout(chipCheck, 2500); }); };
  hook();

  // ---------- "Continue the tour" once your first project exists ----------
  function hideChip() { const c = $('#ft-chip'); if (c) c.remove(); }
  function chipCheck(tries = 0) {
    const s = read();
    if (!s.after || s.project || s.chipGone || blocked() || running || !inProject()) return;
    if (busy() || (window.TribeFirstRun && window.TribeFirstRun.progress && document.body.classList.contains('fr-on'))) { if (tries < 40) setTimeout(() => chipCheck(tries + 1), 3000); return; }
    if ($('#ft-chip')) return;
    const c = document.createElement('div'); c.id = 'ft-chip'; c.className = 'ft-chip'; c.setAttribute('role', 'status');
    c.innerHTML = `<img src="assets/flint.svg" alt="" width="18" height="18"><button class="ft-chip-go" id="ft-chip-go">${esc(t('Continue the tour'))}</button><span class="ft-chip-sub">${esc(t('Your project’s places, with Flint'))}</span><button class="ft-chip-x" id="ft-chip-x" aria-label="${esc(t('Not now'))}">×</button>`;
    document.body.appendChild(c);
    c.querySelector('#ft-chip-go').onclick = () => { hideChip(); run(0); };
    c.querySelector('#ft-chip-x').onclick = () => { write({ chipGone: true }); hideChip(); };
  }

  // the old 30-second tour and the old quick tour now open this one
  const redirect = () => {
    if (G()) G().tour = () => start();
    window.TribeTour = { start: () => start(), end: () => G() && G().hide(), isActive: () => running };
  };
  redirect(); setTimeout(redirect, 0);
  window.TribeFlintTour = { start, offer, label, state: read, reset: () => { try { localStorage.removeItem(KEY); } catch {} }, running: () => running, _stops: () => stops().length, _skipped: () => skipped.slice() };
})();
