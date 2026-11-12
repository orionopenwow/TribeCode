// The intro before "See how TribeCode works" (feat/demo-intro): a few full-screen slides that say what the tour shows, how
// to drive it and that it's all pretend, before Flint's step 1. Five slides:
//   1 What you'll see (the story and its times)   2 How it works (the real caption card and bar, each control labelled)
//   3 The 12 chapters as a map (click one to start there)   4 It's all pretend (this tab only; Exit cleans up)   5 Your turn after
// Next/Back, ← →, Home/End, the dots, swipe at phone widths (scroll-snap), Skip intro (Esc too), and "Don't show the intro
// again" (localStorage 'tribecode.demo.intro' = 'off'). Shown only for a fresh start a person asked for (the website's link,
// Help, Welcome's Just watch it: demowatch.js sets sessionStorage 'tribecode.watch.intro'), never on Watch again or a
// chapter dot's reload, never at test speed (?speed=4) or in an automated browser unless forced (localStorage
// 'tribecode.test.intro' = '1'); ?intro=0 skips it.
// Public: window.TribeDemoIntro = { want(opts), open({ chapters, total, onStart(at) }), close(), isOpen(), go(i), index() }
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, n = 18) => `<svg class="i" style="width:${n}px;height:${n}px" aria-hidden="true"><use href="#${id}"/></svg>`;
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PREF = 'tribecode.demo.intro', FLAG = 'tribecode.watch.intro';
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const ICONS = { blank: 'i-sparkle', tribe: 'i-users', project: 'i-folder', vision: 'i-doc', friend: 'i-chat', tasks: 'i-check', make: 'i-canvas', site: 'i-net', preview: 'i-eye', approve: 'i-tick', company: 'i-grid', end: 'i-flag' };

  // Should the intro play before this start? (reads and clears the one-shot flag a fresh start sets)
  function want(opts = {}) {
    let fresh = false; try { fresh = sessionStorage.getItem(FLAG) === '1'; sessionStorage.removeItem(FLAG); } catch {}
    if (!fresh || lsGet(PREF) === 'off' || /[?&]intro=0/.test(location.search)) return false;
    if (lsGet('tribecode.test.intro') === '1') return true;
    return !navigator.webdriver && !(Number(opts.speed) >= 3);
  }

  let el = null, idx = 0, cfg = null, back = null;
  const N = 5;

  // ---------- the slides ----------
  function story(ch) {   // slide 1: the five things Flint makes, at the time they happen in the tour
    const at = id => { const c = ch.find(x => x.id === id); return c ? mmss(c.at) : ''; };
    const rows = [
      ['tribe', 'i-users', 'A tribe', 'Flint’s Workshop', 'friends, people and AIs'],
      ['project', 'i-folder', 'A project', '☕ Ember Café', 'with its vision written down'],
      ['tasks', 'i-check', 'Tasks', 'Menu board → Maya', 'assigned, then accepted'],
      ['make', 'i-canvas', 'A design', 'Menu card', 'made in Files › + Create'],
      ['site', 'i-net', 'A website', 'embercafe · dark mode', 'from a template, no AI'],
    ];
    return `<ol class="di-story" aria-hidden="true">${rows.map(([id, ic, t, v, s]) => `<li><span class="di-time">${at(id)}</span><span class="di-ic">${ico(ic, 18)}</span><span class="di-st"><b>${t}</b><span class="di-val">${esc(v)}</span><small>${s}</small></span></li>`).join('')}</ol>`;
  }
  function controls(ch, total) {   // slide 2: the tour's own caption card and bar, drawn with its real words, each control numbered
    const n = k => `<i class="di-n" aria-hidden="true">${k}</i>`;
    const dots = ch.map((c, i) => `<span class="di-dot${i < 2 ? ' past' : i === 2 ? ' on' : ''}"></span>`).join('');
    return `<div class="di-mock" aria-hidden="true">
      <div class="di-mcap"><img src="assets/flint.svg" alt="" width="32" height="32"><div class="di-mb">
        <p class="di-mh">${n(1)}<span class="di-mk">Step 3 of ${ch.length}</span><span class="di-msep">·</span><b>Start a project</b></p>
        <p class="di-ms">A project is one thing the tribe makes. Ember Café: a friend’s café that needs a website.</p></div>
        <div class="di-mfoot">${n(2)}<span class="di-mdots">${dots}</span><span class="di-mbtn">← Back</span><span class="di-mbtn pri">Next →</span>${n(3)}</div></div>
      <div class="di-mbar">${n(4)}<span class="di-mbtn">Auto-play ▸</span><span class="di-mtime">0:35 / ${mmss(total)}</span><span class="di-gap"></span>${n(5)}<span class="di-mbtn">Skip to end</span>${n(6)}<span class="di-mbtn">Exit</span></div></div>`;
  }
  const LEGEND = [
    ['Step counter', 'Where you are, and what Flint is doing in plain words.'],
    ['Chapter dots', 'One per chapter. The current one fills as it plays. Click any dot to jump.'],
    ['Back and Next', 'Flint does one chapter, then waits for you. <kbd>→</kbd> or <kbd>Enter</kbd> goes on, <kbd>←</kbd> goes back.'],
    ['Auto-play', 'Let Flint carry on by himself at a readable pace (<kbd>Space</kbd>). 1× or 2×.'],
    ['Skip to end', 'Straight to the last card.'],
    ['Exit', 'Back to your own app, cleaned up. <kbd>Esc</kbd> just stops the show.'],
  ];
  function map(ch) {   // slide 3: the 12 chapters, each a button that starts the tour there
    return `<ol class="di-map">${ch.map((c, i) => `<li><button type="button" class="di-ch" data-di-at="${i}" aria-label="Start at chapter ${i + 1}: ${esc(c.title)}">
      <span class="di-chn">${String(i + 1).padStart(2, '0')}</span><span class="di-ic">${ico(ICONS[c.id] || 'i-play', 16)}</span><span class="di-cht"><b>${esc(c.title)}</b><small>${mmss(c.at)}</small></span></button></li>`).join('')}</ol>`;
  }
  const pretend = () => `<div class="di-sand" aria-hidden="true">
      <div class="di-box demo"><span class="di-tag">This tab only</span><b>The demo</b>
        <p><span class="di-chip">☕ Ember Café</span><span class="di-chip">Maya</span><span class="di-chip">Flint</span></p><small>Made up for the tour. Gone when you Exit.</small></div>
      <div class="di-box mine"><span class="di-tag lock">${ico('i-eye', 13)} Untouched</span><b>Your TribeCode</b>
        <p><span class="di-chip">Your projects</span><span class="di-chip">Settings</span><span class="di-chip">Sign-in</span></p><small>Never read, never changed.</small></div></div>`;
  const after = () => `<ul class="di-next" aria-hidden="true">
      <li><span class="di-ic">${ico('i-plus', 18)}</span><span><b>Start a project</b><small>Your own, on this device, in a minute.</small></span></li>
      <li><span class="di-ic">${ico('i-users', 18)}</span><span><b>Make an account</b><small>So your work follows you to every device.</small></span></li>
      <li><span class="di-ic">${ico('i-link', 18)}</span><span><b>Invite friends</b><small>One link. They join from any browser or phone.</small></span></li></ul>`;
  function slides(ch, total) {
    const mins = Math.round(total / 30000) / 2;   // 2.5 → "2½"
    const say = `${Math.floor(mins)}${mins % 1 ? '½' : ''}`;
    return [
      { eye: 'What you’ll see', h: 'Flint builds a whole project from nothing', lead: `In about ${say} minutes Flint, TribeCode’s helper, makes a tribe, a project, tasks, a design and a website, right in the real app. You just watch.`,
        list: ['It starts empty: no tribe, no projects.', 'Every click happens where you would click.', 'No account, no AI and no setup needed.'], art: story(ch) },
      { eye: 'How it works', h: 'You set the pace', lead: 'A caption card says what Flint is doing. Under it, a slim bar has the rest.', legend: true, art: controls(ch, total) },
      { eye: `${ch.length} short chapters`, h: 'Pick where to start', lead: 'Each chapter shows one part of TribeCode and makes what it needs, so you can start anywhere. Click a chapter to begin there, or press Next to start at the top.', art: map(ch), wide: true },
      { eye: 'It’s all pretend', h: 'Nothing touches your real work', lead: 'The tour runs in this tab only, with made-up people and a made-up café.',
        list: ['Your projects, settings and sign-in are never read or changed.', 'Nothing is sent anywhere: no server, no AI.', 'Exit, or closing the tab, cleans up everything the tour made.'], art: pretend() },
      { eye: 'Afterwards', h: 'Then it’s your turn', lead: 'When the tour ends you can start your own project, make an account to keep it, and invite friends. Or just look around.', art: after() },
    ];
  }
  function slideHtml(s, i) {
    const legend = s.legend ? `<ol class="di-legend">${LEGEND.map(([t, d], k) => `<li><i class="di-n">${k + 1}</i><span><b>${t}</b><small>${d}</small></span></li>`).join('')}</ol>` : '';
    const list = s.list ? `<ul class="di-list">${s.list.map(x => `<li>${ico('i-tick', 15)}<span>${esc(x)}</span></li>`).join('')}</ul>` : '';
    return `<section class="di-slide${s.wide ? ' wide' : ''}" data-i="${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${N}: ${esc(s.eye)}" id="di-s${i}">
      <div class="di-in"><div class="di-txt"><span class="eyebrow di-eye"><span class="di-k">${i + 1} / ${N}</span>${esc(s.eye)}</span><h2 id="di-h${i}">${esc(s.h)}</h2><p class="di-lead">${esc(s.lead)}</p>${list}${legend}</div>
      <div class="di-art">${s.art}</div></div></section>`;
  }

  // ---------- the deck ----------
  function open(o) {
    close(true); cfg = o || {}; idx = 0; back = document.activeElement;
    let at = 0; const ch = (cfg.chapters || []).map(c => { const x = { ...c, at }; at += c.dur || 0; return x; });
    const total = cfg.total || at, S = slides(ch, total);
    el = document.createElement('div'); el.className = 'di'; el.id = 'di';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Before the tour: how it works');
    el.innerHTML = `<header class="di-top"><img src="assets/flint.svg" alt="" width="28" height="28"><span class="di-title">See how TribeCode works</span><span class="di-gap"></span>
        <button type="button" class="btn ghost di-skip" id="di-skip">Skip intro</button></header>
      <div class="di-track" id="di-track" aria-live="polite">${S.map(slideHtml).join('')}</div>
      <footer class="di-foot"><label class="di-never"><input type="checkbox" id="di-never"${lsGet(PREF) === 'off' ? ' checked' : ''}><span>Don’t show the intro again</span></label>
        <span class="di-gap"></span>
        <button type="button" class="btn di-back" id="di-back">← Back</button>
        <nav class="di-dots" id="di-dots" aria-label="Intro slides">${S.map((s, i) => `<button type="button" class="di-d" data-di-go="${i}" aria-label="Slide ${i + 1}: ${esc(s.eye)}"><i></i></button>`).join('')}</nav>
        <button type="button" class="btn primary di-go" id="di-next">Next →</button></footer>`;
    document.body.appendChild(el); document.body.classList.add('di-on');
    el.addEventListener('click', onClick);
    el.querySelector('#di-never').addEventListener('change', e => lsSet(PREF, e.target.checked ? 'off' : null));
    const tr = el.querySelector('#di-track');
    let st = 0; tr.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { const i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)); if (i !== idx) { idx = i; paint(); } }, 60); }, { passive: true });   // a swipe
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', onResize);
    paint(); show(0, true);
    setTimeout(() => { const f = el && el.querySelector('#di-next'); if (f) try { f.focus({ preventScroll: true }); } catch {} }, 30);
    return true;
  }
  function onResize() { if (el) show(idx, true); }
  function close(quiet) {
    if (!el) return;
    document.removeEventListener('keydown', onKey, true); removeEventListener('resize', onResize);
    el.remove(); el = null; document.body.classList.remove('di-on');
    if (!quiet && back && back.isConnected) try { back.focus(); } catch {}
  }
  function paint() {
    if (!el) return;
    el.querySelectorAll('[data-di-go]').forEach(b => { const on = Number(b.dataset.diGo) === idx; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    el.querySelectorAll('.di-slide').forEach(s => { const on = Number(s.dataset.i) === idx; s.toggleAttribute('inert', !on); s.setAttribute('aria-hidden', String(!on)); });
    const bk = el.querySelector('#di-back'), nx = el.querySelector('#di-next');
    bk.disabled = idx === 0; nx.textContent = idx === N - 1 ? 'Start the tour →' : 'Next →';
    el.dataset.i = String(idx);
  }
  // go to a slide: an instant scroll (the swipe track), then the slide rises in with the motion tokens
  function show(i, still) {
    if (!el) return;
    idx = Math.max(0, Math.min(N - 1, i));
    const tr = el.querySelector('#di-track'); tr.scrollTo({ left: idx * tr.clientWidth, behavior: 'instant' });
    paint();
    if (!still && !calm()) { const s = el.querySelector(`#di-s${idx} .di-in`); if (s) { s.classList.remove('rise'); void s.offsetWidth; s.classList.add('rise'); } }
  }
  function go(i) { show(i); }
  function next() { if (idx >= N - 1) return begin(0); show(idx + 1); }
  function prev() { if (idx > 0) show(idx - 1); }
  function begin(at) { const c = cfg; close(true); if (c && c.onStart) c.onStart(at || 0); }
  function onClick(e) {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'di-next') next();
    else if (t.id === 'di-back') prev();
    else if (t.id === 'di-skip') begin(0);
    else if (t.dataset.diGo != null) show(Number(t.dataset.diGo));
    else if (t.dataset.diAt != null) begin(Number(t.dataset.diAt));
  }
  function onKey(e) {
    if (!el || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); begin(0); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); e.stopPropagation(); if (idx < N - 1) show(idx + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); e.stopPropagation(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(N - 1); }
    else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'INPUT') { e.preventDefault(); next(); }
    else if (e.key === 'Tab') {   // focus stays in the deck (the slide that is showing, the top and the foot)
      const f = [...el.querySelectorAll('button:not([disabled]), input')].filter(x => x.offsetParent !== null && !x.closest('[inert]'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    e.stopPropagation();
  }

  window.TribeDemoIntro = { want, open, close: () => close(), isOpen: () => !!el, go, index: () => idx, next, back: prev };
})();
