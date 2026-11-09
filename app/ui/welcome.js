// Flint's welcome: the first thing someone sees after "Open in your browser" on the website (app/?welcome=1), or
// on a first visit to the hosted web app. Before the app shows, Flint walks them through making a pretend tribe,
// shows a few features, then asks how they want to see it:
//   * Build an app with me (the guided, hands-on tour, ?demo=showcase) or Just watch it (?demo=showcase&tour=watch),
//   * Explore it myself (the calm offline demo tribe),
//   * Start my real tribe (closes; first-run setup is already underneath).
// The pretend tribe's name and emoji carry into the demo (offline.js / showcase.js read WKEY).
// Shown once per browser (localStorage; ?welcome=1&flint=1 replays it), never in tests, the desktop app, a phone device link or the demo itself.
//   window.TribeWelcome = { open(), shouldShow() }
(function () {
  'use strict';
  const SEEN = 'tribecode.welcome.v1', WKEY = 'tribecode.welcome.tribe';
  const params = new URLSearchParams(location.search);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const KINDS = [['game', '🎮', 'Game'], ['app', '📱', 'App'], ['site', '🌐', 'Website'], ['tool', '🛠️', 'Tool']];
  const EMOJI = ['🔥', '🎮', '🚀', '🌱', '🎨', '🐉', '🍄', '⭐'];
  const NAMES = { game: 'Lantern Run', app: 'Pocket Planner', site: 'Corner Bakery', tool: 'Helper Bot' };
  const FEATURES = [
    { e: '💬', t: 'One chat for everyone', d: 'Friends and their AI talk in channels. Type /task and it lands on the board.', mock: 'chat' },
    { e: '🧭', t: 'Set up in four steps', d: 'Write the vision, add a first task, connect an AI, create the code repository.', mock: 'setup' },
    { e: '🤖', t: 'Agents pick up tasks', d: 'Each person’s AI claims work, posts what it did, and asks before merging.', mock: 'agents' },
    { e: '👀', t: 'Watch it take shape', d: 'The preview updates as code lands. Approve from your phone with one tap.', mock: 'preview' },
  ];

  function staticHost() { return /(^|\.)tribecode\.org$|\.github\.io$/.test(location.hostname); }
  function shouldShow() {
    if (params.has('skipIntro') || params.has('demo') || params.has('reset') || params.has('code') || params.has('notour')) return false;
    if (navigator.webdriver && !params.has('welcome')) return false;
    if (window.__TAURI__ || window.__TAURI_INTERNALS__ || location.protocol === 'file:' || /\/(join|m)\//.test(location.pathname)) return false;
    if (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active()) return false;
    if (lsGet(SEEN) === 'done' && !params.has('flint')) return false;   // once per browser (?welcome=1&flint=1 shows it again)
    if (params.has('welcome')) return true;
    const st = (window.TribeStore && window.TribeStore.get()) || {};
    return staticHost() && !lsGet(SEEN) && !st.onboarded && !(st.server && st.server.token);
  }

  const mock = {
    chat: `<div class="wl-m wl-m-chat"><p><i style="--c:#6C7CFF">M</i><span><b>Maya</b> the jump feels floaty</span></p><p><i style="--c:#38C6B1">🤖</i><span><b>Maya’s agent</b> On it: shorter hang time ✓</span></p><p class="me"><span>/task add a title screen</span></p></div>`,
    setup: `<div class="wl-m wl-m-setup"><p class="on">✨ Vision <s>done</s></p><p class="on">✅ First task <s>done</s></p><p class="nx">🤖 Connect your AI</p><p>📦 Create the code repository</p></div>`,
    agents: `<div class="wl-m wl-m-agents"><p><i>🤖</i><span>Jay’s agent</span><em class="d">Doing</em></p><p><i>🤖</i><span>Your agent</span><em class="r">Review</em></p><p><i>🤖</i><span>Maya’s agent</span><em class="k">Done</em></p></div>`,
    preview: `<div class="wl-m wl-m-prev"><div class="sky"><b class="p1"></b><b class="p2"></b><b class="hero"></b></div><p>Preview · <span>updated just now</span></p></div>`,
  };

  function open() {
    if (document.getElementById('wl')) return;
    lsSet(SEEN, 'open');
    const saved = (() => { try { return JSON.parse(lsGet(WKEY) || 'null'); } catch { return null; } })();
    const s = { step: 0, kind: (saved && saved.kind) || 'game', emoji: (saved && saved.emoji) || '🔥', name: (saved && saved.name) || '', feat: 0 };
    const el = document.createElement('div');
    el.className = 'wl'; el.id = 'wl'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Welcome to TribeCode');
    el.innerHTML = `<div class="wl-card">
        <header class="wl-top"><img class="wl-face" src="assets/flint.svg" alt="" width="44" height="44"><div class="wl-say" aria-live="polite"><span class="wl-who">Flint</span><p id="wl-line"></p></div>
          <button class="wl-skip" id="wl-skip" type="button">Skip</button></header>
        <div class="wl-body" id="wl-body"></div>
        <footer class="wl-foot"><div class="wl-dots" id="wl-dots">${[0, 1, 2, 3].map(i => `<i data-d="${i}"></i>`).join('')}</div>
          <button class="btn wl-back" id="wl-back" type="button">Back</button><button class="btn primary wl-next" id="wl-next" type="button">Next</button></footer>
      </div>`;
    document.body.appendChild(el); document.body.classList.add('wl-on');
    const $ = q => el.querySelector(q);
    let typing = null;
    const say = text => {
      clearInterval(typing); const p = $('#wl-line');
      if (reduce) { p.textContent = text; return; }
      let n = 0; p.textContent = ''; typing = setInterval(() => { n += 2; p.textContent = text.slice(0, n); if (n >= text.length) clearInterval(typing); }, 16);
    };
    const tribeName = () => (s.name.trim() || NAMES[s.kind]).slice(0, 40);
    const keep = () => lsSet(WKEY, JSON.stringify({ name: tribeName(), emoji: s.emoji, kind: s.kind }));

    const steps = [
      { // 0: hello
        line: 'Hi, I’m Flint 👋 I help your tribe keep track of things. Let me show you around with a pretend tribe. It takes about a minute.',
        html: () => `<div class="wl-hello"><div class="wl-fire" aria-hidden="true"><img src="assets/flint.svg" alt="" width="120" height="120"></div>
          <ul class="wl-facts"><li><span>👥</span>Friends, each with their own AI, build one thing together.</li><li><span>🔒</span>This tour is pretend and stays in your browser.</li></ul></div>`,
        next: 'Let’s go',
      },
      { // 1: make a pretend tribe
        line: 'First, a pretend tribe. What are you making? Pick a kind, an emoji, and a name if you like.',
        html: () => `<div class="wl-make">
          <div class="wl-tile" id="wl-tile"><span class="wl-tile-e">${esc(s.emoji)}</span><b id="wl-tile-n">${esc(tribeName())}</b><small>${esc(KINDS.find(k => k[0] === s.kind)[2])} · you + 3 friends</small></div>
          <div class="wl-fields">
            <span class="wl-k">Kind</span><div class="wl-chips" id="wl-kinds">${KINDS.map(([k, e, l]) => `<button type="button" data-kind="${k}" aria-pressed="${k === s.kind}"><span>${e}</span>${l}</button>`).join('')}</div>
            <span class="wl-k">Emoji</span><div class="wl-emo" id="wl-emo">${EMOJI.map(e => `<button type="button" data-emo="${e}" aria-pressed="${e === s.emoji}" aria-label="${e}">${e}</button>`).join('')}</div>
            <label class="wl-k" for="wl-name">Name</label><input class="input" id="wl-name" maxlength="40" placeholder="${esc(NAMES[s.kind])}" value="${esc(s.name)}" autocomplete="off">
          </div></div>`,
        bind: () => {
          const paint = () => { $('#wl-tile').innerHTML = `<span class="wl-tile-e">${esc(s.emoji)}</span><b id="wl-tile-n">${esc(tribeName())}</b><small>${esc(KINDS.find(k => k[0] === s.kind)[2])} · you + 3 friends</small>`; $('#wl-name').placeholder = NAMES[s.kind]; };
          $('#wl-kinds').onclick = e => { const b = e.target.closest('[data-kind]'); if (!b) return; s.kind = b.dataset.kind; el.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); paint(); };
          $('#wl-emo').onclick = e => { const b = e.target.closest('[data-emo]'); if (!b) return; s.emoji = b.dataset.emo; el.querySelectorAll('[data-emo]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); paint(); };
          $('#wl-name').oninput = e => { s.name = e.target.value; $('#wl-tile-n').textContent = tribeName(); };
          $('#wl-name').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(s.step + 1); } };
        },
        next: 'Make it',
      },
      { // 2: a few features
        line: () => `${tribeName()} is ready ${s.emoji} Here’s what you’ll find inside.`,
        html: () => `<div class="wl-feats">${FEATURES.map((f, i) => `<button type="button" class="wl-feat" data-f="${i}" aria-pressed="${i === s.feat}"><span class="wl-fe">${f.e}</span><span class="wl-ft"><b>${esc(f.t)}</b><small>${esc(f.d)}</small></span></button>`).join('')}
          <div class="wl-show" id="wl-show">${mock[FEATURES[s.feat].mock]}</div></div>`,
        bind: () => {
          const pick = i => { s.feat = i; el.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.f === i))); $('#wl-show').innerHTML = mock[FEATURES[i].mock]; };
          el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { stopAuto(); pick(+b.dataset.f); });
          if (!reduce) auto = setInterval(() => pick((s.feat + 1) % FEATURES.length), 2600);
        },
        next: 'Next',
      },
      { // 3: how to see it
        line: () => `How do you want to see ${tribeName()}?`,
        html: () => `<div class="wl-pick">
          <button type="button" class="wl-opt wl-opt--main" data-go="auto"><span class="wl-oe">🧭</span><span><b>Build an app with me</b><small>A guided tour, one step at a time. I point, you click, and you see each part of TribeCode do its job.</small></span><em>Recommended</em></button>
          <button type="button" class="wl-opt" data-go="watch"><span class="wl-oe">▶️</span><span><b>Just watch it</b><small>Sit back for about four minutes while it plays by itself.</small></span></button>
          <button type="button" class="wl-opt" data-go="explore"><span class="wl-oe">🧭</span><span><b>Explore it myself</b><small>A calm pretend tribe. Click around and try things. Nothing happens until you act.</small></span></button>
          <button type="button" class="wl-opt" data-go="real"><span class="wl-oe">🏕️</span><span><b>Start my real tribe</b><small>Skip the pretend part and set up your own.</small></span></button>
          <details class="wl-inv"><summary>Have an invite link?</summary><div class="web-join"><input class="input" id="wl-link" placeholder="https://…/join/k7Qx2" autocomplete="off" spellcheck="false"><button class="btn" id="wl-join" type="button">Join</button></div></details>
        </div>`,
        bind: () => {
          el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => finish(b.dataset.go));
          $('#wl-join').onclick = () => {
            const v = $('#wl-link').value, A = window.TribeApp;
            if (!A || !A.parseInvite(v)) { A && A.toast('Paste the full invite link, e.g. https://host/join/abc12'); $('#wl-link').focus(); return; }
            close(); A.joinLink(v);
          };
        },
        next: null,
      },
    ];
    let auto = null; const stopAuto = () => { clearInterval(auto); auto = null; };

    function go(n) {
      stopAuto();
      s.step = Math.max(0, Math.min(steps.length - 1, n));
      const st = steps[s.step];
      if (s.step >= 2) keep();
      el.dataset.step = s.step;
      $('#wl-body').innerHTML = `<div class="wl-pane">${st.html()}</div>`;
      say(typeof st.line === 'function' ? st.line() : st.line);
      st.bind && st.bind();
      el.querySelectorAll('[data-d]').forEach(d => d.classList.toggle('on', +d.dataset.d <= s.step));
      $('#wl-back').style.visibility = s.step ? 'visible' : 'hidden';
      $('#wl-next').hidden = !st.next; if (st.next) $('#wl-next').textContent = st.next;
      const f = $('#wl-body').querySelector(s.step === 1 ? '#wl-name' : '.wl-opt--main');
      if (f && !matchMedia('(pointer: coarse)').matches) setTimeout(() => f.focus({ preventScroll: true }), 30); else $('#wl-next').focus({ preventScroll: true });
    }
    function close() {
      stopAuto(); clearInterval(typing); lsSet(SEEN, 'done'); lsSet('tribecode.intro.v1', 'seen');
      removeEventListener('keydown', keys, true); el.remove(); document.body.classList.remove('wl-on');
      if (params.has('welcome')) { params.delete('welcome'); try { history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); } catch {} }
    }
    function finish(how) {
      keep();
      if (how === 'auto') { lsSet('tribecode.flint.tour', 'done'); close(); location.href = location.pathname + '?demo=showcase'; return; }
      if (how === 'watch') { lsSet('tribecode.flint.tour', 'done'); close(); location.href = location.pathname + '?demo=showcase&tour=watch'; return; }
      if (how === 'explore') { close(); const O = window.TribeOffline; if (O && O.start) O.start('quiet'); return; }
      try { localStorage.removeItem(WKEY); } catch {}
      close();
    }
    const keys = e => {
      if (!document.getElementById('wl')) return;
      if (e.key === 'Escape') { e.stopPropagation(); finish('real'); return; }
      if (e.key === 'Enter' && e.target === document.body) { e.stopPropagation(); if (steps[s.step].next) go(s.step + 1); }
    };
    addEventListener('keydown', keys, true);
    $('#wl-next').onclick = () => go(s.step + 1);
    $('#wl-back').onclick = () => go(s.step - 1);
    $('#wl-skip').onclick = () => (s.step < 3 ? go(3) : finish('real'));
    go(0);
  }

  window.TribeWelcome = { open, shouldShow, KEY: WKEY };
})();
