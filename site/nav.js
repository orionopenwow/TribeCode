/* The site's Features mega-menu (v0.27.1). One source for every page: it fills #menu-features with grouped items
   (Build · Together · Run it · Learn), each with its own icon tile and a one-line description, and on wide screens a
   spotlight panel that shows a small live preview of the item you hover or focus, with a "See it" link. main.js opens and
   closes the menu (hover, click, Esc); this adds arrow-key movement inside it. On the homepage links are #anchors; on
   other pages they point back to index.html#…. The phone menu shows the same list compactly, without the spotlight.
   Runs before i18n.js, so the words are translated like the rest of the page. No libraries. */
(function () {
  'use strict';
  const box = document.getElementById('menu-features'); if (!box) return;
  const home = !!document.getElementById('make');
  const here = location.pathname.split('/').pop() || 'index.html';
  const href = h => (h.startsWith('#') ? (home ? h : 'index.html' + h) : h);
  const I = {   // 24×24 line icons, drawn with currentColor
    make: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/>',
    gallery: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    kit: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M17 13v8M13 17h8"/>',
    starters: '<path d="M5 19c1-4 3-6 7-7"/><path d="M12 12c2-5 5-8 9-9-1 4-4 7-9 9z"/><circle cx="16" cy="8" r="1.5"/><path d="M5 19l-1 2 2-1"/>',
    room: '<path d="M4 5h12v9H8l-4 3z"/><path d="M16 9h4v8l-3-2h-6v-1"/>',
    flint: 'FLINT',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/><path d="M10 9l1.5 1.5L14 8"/>',
    lanes: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.6"/><circle cx="14" cy="12" r="1.6"/><circle cx="10" cy="18" r="1.6"/>',
    company: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="15" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M12 8v4M6 15v-3h12v3"/>',
    host: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/>',
    vibe: '<path d="M4 15c0-5 3-8 8-8"/><path d="M8 15c0-3 1.5-4 4-4"/><circle cx="12" cy="15" r="1.4"/><path d="M15 9l5-3M15 13l6 1M15 17l4 3"/>',
    learn: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>',
    docs: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
  };
  const ITEMS = [
    ['Build', [
      ['make', '#make', 'What you can make', 'Games, sites and tools for the people around you', '#F26B1D'],
      ['gallery', '#gallery', 'Made with TribeCode', 'Real apps, sites, docs and designs to start from', '#E86A92'],
      ['kit', '#kit', 'The whole studio', 'Docs, widgets, studios and assets in one app', '#38C6B1'],
      ['starters', '#starters', 'Starters', 'Working first versions to play with and remix', '#FABD2F'],
    ]],
    ['Together', [
      ['room', '#room', 'One chat for everyone', 'Friends and their AI helpers in one room', '#6C7CFF'],
      ['flint', 'flint.html', 'Meet Flint', 'The built-in helper that runs the app with you', '#F26B1D'],
      ['phone', '#phone', 'Your phone as a remote', 'Approve, reply and send voice notes on the go', '#3BD16F'],
      ['lanes', '#lanes', 'Lanes', 'Each AI works its own part; people approve', '#38C6B1'],
    ]],
    ['Run it', [
      ['company', '#company', 'Company mode', 'Seats, money and hiring for a real business', '#FABD2F'],
      ['host', '#host', 'Where it runs', 'Your computer, your own server or the cloud', '#6C7CFF'],
    ]],
    ['Learn', [
      ['vibe', '#vibecoding', 'Vibecoding, explained', 'Make software by saying what you want', '#E86A92'],
      ['learn', 'learn.html', 'Learn', 'Five short, free lessons from zero', '#3BD16F'],
      ['docs', 'docs.html', 'Docs', 'Install, connect your AI, host, fix things', '#94A3B8'],
    ]],
  ];
  // small previews for the spotlight (flat, real words, the same pieces as the homepage mocks)
  const SPOT = {
    make: '<div class="sp-tiles"><span style="--c:#F26B1D">🎮<b>Lantern Run</b><i>game</i></span><span style="--c:#38C6B1">🧁<b>Oak St. Bakers</b><i>site</i></span><span style="--c:#6C7CFF">✅<b>Chore wheel</b><i>tool</i></span></div>',
    gallery: '<div class="sp-shots"><img src="assets/showcase/site-cafe.webp" alt="" loading="lazy" width="160" height="100"><img src="assets/showcase/app-dashboard.webp" alt="" loading="lazy" width="160" height="100"></div>',
    kit: '<div class="sp-grid"><span>📄 Docs</span><span>🔥 Flint</span><span>🧩 515 widgets</span><span>🎨 Studios</span></div>',
    starters: '<div class="sp-shots"><img src="assets/remix/kenney.jpg" alt="" loading="lazy" width="160" height="100"><img src="assets/remix/2048.jpg" alt="" loading="lazy" width="160" height="100"></div>',
    room: '<div class="sp-chat"><p><i style="--c:#6C7CFF">M</i><span>Can we get a title screen?</span></p><p><i class="ai">✦</i><span>On it. <em>Edited title +42</em></span></p><p><i class="ai2">◎</i><span>Adding a creak sound 🔔</span></p></div>',
    flint: '<div class="sp-flint"><p class="me">add a jump sound</p><p class="fl"><img src="assets/brand/flint.svg" alt="" width="18" height="23">Done: <code>jump.wav</code>, credited.</p><p class="me">teach me what an API is</p></div>',
    phone: '<div class="sp-phone"><div><small>NEEDS YOUR OK</small><b>Merge “title screen”?</b><span><em class="ok">Approve</em><em>Deny</em></span></div></div>',
    lanes: '<div class="sp-lanes"><p><span style="--c:#38C6B1;--w:70%"></span>Orion’s Claude · ui/</p><p><span style="--c:#6C7CFF;--w:45%"></span>Maya’s Codex · sound/</p><p><span style="--c:#FABD2F;--w:85%"></span>Jay’s Gemini · levels/</p></div>',
    company: '<div class="sp-seats"><span style="--c:#F26B1D">CEO<b>Camp</b></span><span style="--c:#38C6B1">Build<b>Claude ✦</b></span><span style="--c:#FABD2F">Grow<b>Maya</b></span><span style="--c:#94A3B8">Run<b>Flint ✦</b></span></div>',
    host: '<div class="sp-host"><p>✓ <b>Desktop app</b><span>runs it for you</span></p><p>✓ <b>Your own server</b><span>always on</span></p><p>✓ <b>Cloud host</b><span>Docker, Render</span></p></div>',
    vibe: '<div class="sp-flow"><span>Say it</span>→<span>Watch it</span>→<span>Steer it</span>→<span>Ship it</span></div>',
    learn: '<div class="sp-learn"><b>3 / 5</b><p><i class="on"></i>What code is</p><p><i class="on"></i>Vibecoding</p><p><i class="on"></i>Your first app</p><p><i></i>Working together</p></div>',
    docs: '<div class="sp-docs"><p>Get started</p><p>Connect your AI</p><p>Hosting and sharing</p><p>Security and privacy</p><p>Troubleshooting</p></div>',
  };
  const icon = k => k === 'flint' ? '<img src="assets/brand/flint.svg" alt="" width="18" height="23">' : `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;
  const item = ([k, h, t, d, c]) => `<li><a class="mm__a${h === here ? ' is-here' : ''}" href="${href(h)}" data-mm="${k}" style="--c:${c}"><span class="mm__ic" aria-hidden="true">${icon(k)}</span><span class="mm__tx"><b>${t}</b><span class="mm__d">${d}</span></span></a></li>`;
  const col = groups => groups.map(([g, list]) => `<div class="mm__grp"><p class="mm__eb mono">${g}</p><ul class="mm__list" role="list">${list.map(item).join('')}</ul></div>`).join('');
  const all = ITEMS.flatMap(g => g[1]);
  box.classList.add('mm');
  box.innerHTML = `<div class="mm__cols"><div class="mm__col">${col(ITEMS.slice(0, 2))}</div><div class="mm__col">${col(ITEMS.slice(2))}</div></div>
    <aside class="mm-spot" aria-live="polite"><div class="mm-spot__view" id="mm-view"></div><b class="mm-spot__t" id="mm-t"></b><span class="mm-spot__d" id="mm-d"></span><a class="mm-spot__go" id="mm-go" href="#">See it ↓</a></aside>`;
  function show(k) {
    const it = all.find(x => x[0] === k) || all[0];
    const v = document.getElementById('mm-view'); v.innerHTML = SPOT[it[0]] || ''; v.style.setProperty('--c', it[4]);
    const tr = s => (window.TribeLang && window.TribeLang.t ? window.TribeLang.t(s) : s);
    document.getElementById('mm-t').textContent = tr(it[2]);
    document.getElementById('mm-d').textContent = tr(it[3]);
    const go = document.getElementById('mm-go'); go.href = href(it[1]); go.textContent = tr(it[1].startsWith('#') ? 'See it ↓' : 'Open →');
    box.querySelectorAll('.mm__a').forEach(a => a.classList.toggle('is-spot', a.dataset.mm === it[0]));
  }
  show('make');
  box.addEventListener('mouseover', e => { const a = e.target.closest('.mm__a'); if (a) show(a.dataset.mm); });
  box.addEventListener('focusin', e => { const a = e.target.closest('.mm__a'); if (a) show(a.dataset.mm); });
  box.addEventListener('keydown', e => {
    if (!/^Arrow(Up|Down|Left|Right)$/.test(e.key) && e.key !== 'Home' && e.key !== 'End') return;
    const links = [...box.querySelectorAll('.mm__a')], i = links.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + links.length) % links.length;
    links[n].focus();
  });
})();
