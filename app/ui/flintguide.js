// Flint, the guide: the mascot (assets/flint.svg, the logo's flame with blinking pixel eyes) flies across the screen
// to whatever he's showing you, points at it with a short speech bubble, and leaves a trail of rising pixel embers.
//   TribeFlintGuide.point(target, text, { side, next, done })   target: a selector or an element; resolves when closed
//   TribeFlintGuide.tour()                                         opens Flint's tour (flinttour.js)
//   TribeFlintGuide.hide()
// Flat matte: the bubble is a card with a 1px border; the embers are square pixels that rise and fade (no glow).
// Reduced motion: Flint jumps instead of flying and there are no embers.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const SIZE = 44;

  let root = null, sprite = null, bubble = null, pos = null, emberT = null, resolveCur = null;
  function ensure() {
    if (root) return;
    root = document.createElement('div'); root.className = 'fg-root'; root.id = 'flint-guide';
    root.innerHTML = `<div class="fg-scrim" id="fg-scrim"></div><div class="fg-ring" id="fg-ring"></div>
      <img class="fg-sprite" id="fg-sprite" src="assets/flint.svg" alt="Flint" width="${SIZE}" height="${SIZE}">
      <div class="fg-bubble" id="fg-bubble" role="dialog" aria-live="polite"></div>`;
    document.body.appendChild(root);
    sprite = $('#fg-sprite'); bubble = $('#fg-bubble');
    $('#fg-scrim').onclick = () => close();
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('on')) { const c = document.getElementById('fg-intro'); if (c) { c.remove(); try { localStorage.setItem('tribecode.flint.intro', 'done'); } catch {} root.classList.remove('touring'); } close(); } });
  }
  const elOf = t => typeof t === 'string' ? document.querySelector(t) : t;
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };

  // pixel embers: little squares that drift up and fade, dropped along Flint's path
  function ember(x, y) {
    const e = document.createElement('i'); e.className = 'fg-ember';
    const s = [3, 3, 4, 5][Math.floor(Math.random() * 4)], c = ['#F26B1D', '#FF8A3D', '#FABD2F', '#FFFFFF'][Math.floor(Math.random() * 4)];
    e.style.cssText = `left:${x + (Math.random() * 16 - 8)}px;top:${y + (Math.random() * 10 - 5)}px;width:${s}px;height:${s}px;background:${c};--dx:${(Math.random() * 24 - 12).toFixed(0)}px;--dy:${-(24 + Math.random() * 40).toFixed(0)}px;animation-duration:${(600 + Math.random() * 700).toFixed(0)}ms`;
    root.appendChild(e); setTimeout(() => e.remove(), 1400);
  }
  function trail(on) {
    clearInterval(emberT); emberT = null;
    if (!on || calm()) return;
    emberT = setInterval(() => { const r = sprite.getBoundingClientRect(); ember(r.left + r.width / 2, r.top + r.height * 0.8); }, 45);
  }
  function burst(x, y, n = 14) { if (calm()) return; for (let i = 0; i < n; i++) setTimeout(() => ember(x, y), i * 18); }

  function flyTo(x, y) {
    return new Promise(res => {
      const from = pos || { x: innerWidth - SIZE - 24, y: innerHeight - SIZE - 24 };
      sprite.style.transition = 'none'; sprite.style.transform = `translate(${from.x}px, ${from.y}px)`;
      sprite.getBoundingClientRect();
      const dist = Math.hypot(x - from.x, y - from.y), ms = calm() ? 0 : Math.min(900, 280 + dist * 0.6);
      sprite.style.transition = ms ? `transform ${ms}ms cubic-bezier(.3,.7,.2,1)` : 'none';
      sprite.style.transform = `translate(${x}px, ${y}px)`;
      pos = { x, y }; trail(true);
      setTimeout(() => { trail(false); burst(x + SIZE / 2, y + SIZE * 0.7, 8); res(); }, ms + 20);
    });
  }

  function place(el, text, opts) {
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2 - 1, top: innerHeight / 2 - 1, right: innerWidth / 2 + 1, bottom: innerHeight / 2 + 1, width: 2, height: 2 };
    // the ring around the target
    const ring = $('#fg-ring');
    if (el) { ring.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`; ring.classList.add('on'); }
    else ring.classList.remove('on');
    // Flint beside the target (right if there's room, else left; below on phones)
    let side = opts.side || (r.right + SIZE + 290 < innerWidth ? 'right' : r.left - SIZE - 290 > 0 ? 'left' : 'below');
    if (phone()) side = r.top > innerHeight / 2 ? 'above' : 'below';
    let fx, fy;
    if (side === 'right') { fx = r.right + 14; fy = r.top + r.height / 2 - SIZE / 2; }
    else if (side === 'left') { fx = r.left - SIZE - 14; fy = r.top + r.height / 2 - SIZE / 2; }
    else if (side === 'above') { fx = Math.min(innerWidth - SIZE - 12, Math.max(12, r.left + r.width / 2 - SIZE / 2)); fy = r.top - SIZE - 14; }
    else { fx = Math.min(innerWidth - SIZE - 12, Math.max(12, r.left + r.width / 2 - SIZE / 2)); fy = r.bottom + 14; }
    fx = Math.max(8, Math.min(innerWidth - SIZE - 8, fx)); fy = Math.max(8, Math.min(innerHeight - SIZE - 8, fy));
    return { fx, fy, side, text, r };
  }
  function showBubble(p, opts) {
    const steps = opts.steps ? `<span class="fg-steps">${opts.step + 1} / ${opts.steps}</span>` : '';
    bubble.innerHTML = `<p>${esc(p.text)}</p><div class="fg-acts">${steps}<span style="flex:1"></span>${opts.skip ? `<button class="fg-skip" id="fg-skip">${esc(opts.skipLabel || 'Skip tour')}</button>` : ''}<button class="btn primary fg-next" id="fg-next">${esc(opts.next || 'Got it')}</button></div>`;
    const bw = Math.min(280, innerWidth - 24); bubble.style.width = bw + 'px';
    let bx = p.side === 'left' ? p.fx - bw - 10 : p.fx + SIZE + 10, by = p.fy - 6;
    if (p.side === 'below' || p.side === 'above' || bx + bw > innerWidth - 8 || bx < 8) { bx = Math.max(12, Math.min(innerWidth - bw - 12, p.fx + SIZE / 2 - bw / 2)); by = p.side === 'above' ? p.fy - 10 - 110 : p.fy + SIZE + 10; }
    by = Math.max(8, Math.min(innerHeight - 140, by));
    bubble.style.left = bx + 'px'; bubble.style.top = by + 'px'; bubble.classList.add('on');
    return new Promise(res => {
      $('#fg-next').onclick = () => res('next'); const sk = $('#fg-skip'); if (sk) sk.onclick = () => res('skip');
      resolveCur = res; setTimeout(() => $('#fg-next') && $('#fg-next').focus(), 50);
    });
  }
  // feat/demo-auto: the ring follows its target while the bubble is open (re-renders, scrolling). If the target is gone
  // for 2 s (a route change, a stale selector), Flint moves on by himself: a tour step says 'next', anything else closes.
  let follow = null;
  function track(el, sel, opts) {
    clearInterval(follow); if (!el) return;
    let lost = 0;
    follow = setInterval(() => {
      if (!root || !root.classList.contains('on') || !resolveCur) { clearInterval(follow); return; }
      if (!el.isConnected || !visible(el)) { const again = typeof sel === 'string' ? document.querySelector(sel) : null; if (again && visible(again)) { el = again; lost = 0; } else { lost += 250; const fr = $('#fg-ring'); if (fr) fr.classList.remove('on'); if (lost >= 2000) { clearInterval(follow); const r = resolveCur; resolveCur = null; close(true); if (!opts.keep) close(); r(opts.steps ? 'next' : 'close'); } return; } }
      const r = el.getBoundingClientRect(), fr = $('#fg-ring'); if (fr) { fr.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`; fr.classList.add('on'); }
    }, 250);
  }

  async function point(target, text, opts = {}) {
    ensure(); root.classList.add('on'); root.classList.toggle('dim', !!opts.dim);
    let el = elOf(target);
    if (el && !visible(el)) { el.scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' }); await new Promise(r => setTimeout(r, 350)); }
    if (el && !visible(el)) el = null;
    bubble.classList.remove('on');
    const p = place(el, text, opts);
    await flyTo(p.fx, p.fy);
    const shown = showBubble(p, opts); track(el, target, opts);
    const res = await shown; clearInterval(follow);
    if (!opts.keep) close(true);
    return res;
  }
  function close(soft) {
    if (!root) return;
    if (!soft) clearInterval(follow);
    if (bubble) bubble.classList.remove('on'); const fr = $('#fg-ring'); if (fr) fr.classList.remove('on');
    if (resolveCur) { const r = resolveCur; resolveCur = null; if (!soft) r('close'); }
    if (!soft || !root.classList.contains('touring')) {
      const s = sprite.getBoundingClientRect(); burst(s.left + SIZE / 2, s.top + SIZE / 2, 16);
      root.classList.remove('on', 'dim', 'touring'); pos = null;
    }
  }

  // The offer and the full tour now live in flinttour.js (one guided look around, after Make it yours).
  // ---------- Flint's own intro: the first time someone clicks into "Ask Flint…" ----------
  // A dimmed, skippable one-screen guide: what Flint does, how to talk to him, how he learns. Shown once.
  const INTRO = 'tribecode.flint.intro';
  const TILES = [
    ['💬', 'Ask anything', 'What’s new, who’s doing what, how do I…'],
    ['📝', 'Take notes', 'Start with “note:” and he saves it for the tribe.'],
    ['✅', 'Make tasks', 'Say “task: add a title screen” and it’s on the board.'],
    ['🙋', 'He asks too', 'When something’s unclear, he asks a short question first.'],
    ['🧠', 'He learns', 'Reads your vision, tasks and chat, and picks up skills your AI teaches him.'],
    ['🔒', 'Stays here', 'Runs on this computer. Pick his brain in Settings.'],
  ];
  function intro(input) {
    if (document.getElementById('fg-intro')) return;
    ensure(); root.classList.add('on', 'dim', 'touring');
    const card = document.createElement('div'); card.className = 'fg-intro'; card.id = 'fg-intro'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Meet Flint');
    card.innerHTML = `<img class="fg-intro-face" src="assets/flint.svg" alt="" width="64" height="64">
      <span class="eyebrow">Meet Flint</span><h2>Your tribe’s helper</h2><p class="fg-intro-p">Type to him like a friend. Here’s what he’s good at.</p>
      <div class="fg-intro-grid">${TILES.map(([e, t, d]) => `<div class="fg-tile"><span class="fg-tile-e">${e}</span><b>${esc(t)}</b><small>${esc(d)}</small></div>`).join('')}</div>
      <div class="fg-intro-try"><span class="faint">Try:</span>${['What’s new?', 'note: playtest Friday', 'task: fix the jump'].map(x => `<button class="fg-try" data-try="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="fg-acts"><button class="fg-skip" id="fg-intro-skip">Skip</button><span style="flex:1"></span><button class="btn primary" id="fg-intro-go">Got it</button></div>`;
    root.appendChild(card);
    if (!calm()) { const r = card.getBoundingClientRect(); burst(r.left + 48, r.top + 48, 18); }
    const done = (fill) => {
      try { localStorage.setItem(INTRO, 'done'); } catch {}
      card.remove(); root.classList.remove('touring'); close();
      if (input) { if (fill) input.value = fill; input.focus(); }
    };
    card.querySelector('#fg-intro-skip').onclick = () => done();
    card.querySelector('#fg-intro-go').onclick = () => done();
    card.querySelectorAll('[data-try]').forEach(b => b.onclick = () => done(b.dataset.try));
    setTimeout(() => { const g = card.querySelector('#fg-intro-go'); if (g) g.focus(); }, 60);
  }
  document.addEventListener('focusin', e => {
    const i = e.target.closest && e.target.closest('.fl-in'); if (!i) return;
    let seen = null; try { seen = localStorage.getItem(INTRO); } catch {}
    if (seen || /[?&](skipIntro|demo=showcase|notour)/.test(location.search) || navigator.webdriver || (window.TribePrefs && window.TribePrefs.get().flintTips === false)) return;
    i.blur(); intro(i);
  });


  // navigating away (Back/Forward, a hash route) never leaves the dim behind
  addEventListener('popstate', () => { if (root && root.classList.contains('on')) close(); });
  addEventListener('hashchange', () => { if (root && root.classList.contains('on') && !root.classList.contains('touring')) close(); });
  window.TribeFlintGuide = { point, tour: () => window.TribeFlintTour && window.TribeFlintTour.start(), intro, hide: () => { const c = document.getElementById('fg-intro'); if (c) c.remove(); close(); }, _burst: burst };
})();
