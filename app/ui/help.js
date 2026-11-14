// Help: a filled "?" at the far right of the title bar. A slim menu of six entries by intent (feat/help-next): What should
// I do next? · Learn (the Help center) · Ask Flint · Something's wrong · Keyboard shortcuts · What's new. The tours, demos,
// set-up pages and links the long list had live in the Help center (guide.js), one tap further.
//   window.TribeHelp = { open(), close(), shortcuts(), website(), run(key), all(), groups() }
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REPO = 'https://github.com/orionopenwow/TribeCode';
  const ico = id => `<svg class="i"><use href="#${id}"/></svg>`;
  const ver = () => (window.TribeUpdater && window.TribeUpdater.current && window.TribeUpdater.current()) || '';
  const guide = slug => window.TribeGuide && window.TribeGuide.open(slug);
  const ext = url => { try { const sh = window.__TAURI__ && window.__TAURI__.shell; if (sh && sh.open) return sh.open(url); } catch {} window.open(url, '_blank', 'noopener'); };
  // Back to the main website (tribecode.org). The web app served from the site itself (/app/) goes there in the same tab;
  // a self-hosted browser app opens it in a new tab so the app stays; the desktop app opens it in the system browser.
  const SITE = 'https://tribecode.org/';
  const website = () => { let same = false; try { same = !window.__TAURI__ && /(^|\.)tribecode\.org$/.test(location.hostname); } catch {} if (same) location.href = location.origin + '/'; else ext(SITE); };

  // feat/help-next (docs/HELP-NEXT.md): the ? menu is six entries by intent. Everything the long list had is still one
  // tap further, inside the Help center (guide.js draws ALL below with the same data-help keys).
  const ALL = {
    flint: ['i-flint', 'Ask Flint', 'The built-in helper, right in the room', () => window.TribeFlint && window.TribeFlint.focus()],
    tour: ['i-flint', 'Take the tour with Flint', 'He flies you around the main places', () => window.TribeFlintGuide && window.TribeFlintGuide.tour()],
    guide: ['i-doc', 'Guide', 'How TribeCode works, in short pages', () => guide()],
    start: ['i-play', 'Start here', 'Your first project in two minutes', () => guide('01-start-here')],
    watch: ['i-play', 'See how TribeCode works', 'Two minutes, hands off: Flint shows every main feature', () => window.TribeDemoWatch && window.TribeDemoWatch.begin()],   // feat/demo-auto
    flintrun: ['i-flint', 'Watch Flint build', 'An app, a site and a game in a few minutes, then the proof as ZIPs', () => window.TribeFlintRun && window.TribeFlintRun.start()],   // feat/flint-runthrough
    demo: ['i-zap', 'Try a demo tribe', 'Host a pretend tribe offline, right here', () => window.TribeOffline && window.TribeOffline.start()],   // feat/offline-demo
    claude: ['i-sparkle', 'Connect your AI', 'Claude Code, Codex, Gemini CLI, Cursor…', () => window.TribeApp && window.TribeApp.connectClaude ? window.TribeApp.connectClaude() : guide('03-connect-claude-code')],
    phones: ['i-users', 'Phones and friends', 'Invite links, the phone app, your AI from your phone', () => guide('06-phones')],
    trouble: ['i-hand', 'Troubleshooting', "When something doesn't connect", () => guide('09-troubleshooting')],
    keys: ['i-grid', 'Keyboard shortcuts', 'Ctrl K, Ctrl Shift B and the rest', () => shortcuts(), 'Ctrl /'],
    bug: ['i-bug', 'Report a bug', 'With the recent logs attached', () => window.TribeBugs && window.TribeBugs.capture(), 'Ctrl Shift B'],
    review: ['i-spark', 'Rate TribeCode', 'A quick review, good or bad', () => window.TribeFeedback && window.TribeFeedback.open()],
    update: ['i-refresh', 'Check for updates', '', () => { if (window.TribeUpdater && window.TribeUpdater.check) { window.TribeUpdater.check(true); window.TribeApp && window.TribeApp.toast('Checking for updates…'); } }],
    site: ['i-net', 'TribeCode website', 'tribecode.org', website],
    new: ['i-flag', "What's new", 'The changelog for every version', () => ext(`${REPO}/blob/main/CHANGELOG.md`)],
    docs: ['i-folder', 'Docs on GitHub', 'Design system, hosting, phones, the vision', () => ext(`${REPO}/tree/main/docs`)],
    gh: ['i-git', 'TribeCode on GitHub', 'Code, releases, issues · MIT', () => ext(REPO)],
    // the two new entries
    next: ['i-flag', 'What should I do next?', 'One step for where this project is', () => window.TribeNextStep && window.TribeNextStep.open()],
    learn: ['i-doc', 'Learn', 'Quick guides, paths, skills and tours, in one place', () => window.TribeGuide && (window.TribeGuide.home ? window.TribeGuide.home() : window.TribeGuide.open())],
    quick: ['i-zap', 'Quick guides', 'How do I…? One screen each', () => window.TribeQuick && window.TribeQuick.open()],   // feat/learn
    wrong: ['i-hand', "Something's wrong", 'Fix a problem, report a bug, check for updates', null],
  };
  const MAIN = ['next', 'quick', 'learn', 'flint', 'wrong', 'keys', 'new'];
  const WRONG = ['trouble', 'bug', 'update'];
  // the Help center groups the rest by what you want to do
  const GROUPS = [['Watch and try', ['tour', 'watch', 'flintrun', 'demo']], ['Set up', ['start', 'claude', 'phones']], ['More', ['review', 'site', 'docs', 'gh']]];
  const run = k => { const it = ALL[k]; if (it && it[3]) it[3](); };

  const btn = document.createElement('button');
  btn.id = 'tb-help'; btn.className = 'tb-help'; btn.title = 'Help'; btn.setAttribute('aria-label', 'Help'); btn.setAttribute('aria-haspopup', 'menu');
  // a filled circle with the ? cut out of it (currentColor fill, the ? in the canvas color)
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4.1" fill="none" stroke="var(--help-ink, #12151A)" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.35" fill="var(--help-ink, #12151A)"/></svg>';
  const wc = $('#win-ctl'), right = wc ? wc.parentElement : $('.titlebar .tb-right');
  if (wc) wc.before(btn); else if (right) right.appendChild(btn); else ($('.titlebar') || document.body).appendChild(btn);

  let menu = null;
  function close() { const sc = document.getElementById('help-scrim'); if (sc) { sc.classList.remove('on'); setTimeout(() => sc.remove(), 160); } if (menu) { menu.remove(); menu = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); } }
  const outside = e => { if (menu && !menu.contains(e.target) && !btn.contains(e.target)) close(); };
  function open() {
    if (menu) return close();
    menu = document.createElement('div'); menu.className = 'help-menu'; menu.id = 'help-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Help');
    const row = (k, primary) => { const [icon, t, sub, , kbd] = ALL[k];
      return `<button role="menuitem" data-help="${k}"${primary ? ' class="hm-primary"' : ''}${k === 'wrong' ? ' aria-haspopup="menu"' : ''}>${ico(icon)}<span class="hm-t"><b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${kbd ? `<span class="kbd">${esc(kbd)}</span>` : ''}${k === 'wrong' ? ico('i-chev') : ''}</button>`; };
    const main = () => `<div class="hm-sec">${MAIN.map((k, i) => row(k, i === 0)).join('')}</div>`
      + `<div class="hm-foot"><span>TribeCode${ver() ? ` v${esc(ver())}` : ''}</span><button type="button" class="hm-site" data-help="site">${esc(ALL.site[1])}</button></div>`;
    const wrong = () => `<div class="hm-sec"><button role="menuitem" class="hm-back" data-help-back>${ico('i-chev')}<span class="hm-t"><b>Back</b></span></button><span class="eyebrow">Something's wrong</span>${WRONG.map(k => row(k)).join('')}</div>`;
    const wire = () => {
      menu.querySelectorAll('[data-help]').forEach(b => b.onclick = e => { const k = b.dataset.help; if (k === 'wrong') { e.stopPropagation(); menu.innerHTML = wrong(); wire(); const f = menu.querySelector('[data-help]'); f && f.focus(); return; } close(); run(k); });
      const back = menu.querySelector('[data-help-back]'); if (back) back.onclick = e => { e.stopPropagation(); menu.innerHTML = main(); wire(); const f = menu.querySelector('[data-help="wrong"]'); f && f.focus(); };
    };
    menu.innerHTML = main();
    // the page behind dims a little while the menu is open (a click on it closes the menu)
    const scrim = document.createElement('div'); scrim.className = 'help-scrim'; scrim.id = 'help-scrim'; document.body.appendChild(scrim); requestAnimationFrame(() => scrim.classList.add('on'));
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect(), w = Math.min(320, innerWidth - 16);
    menu.style.width = w + 'px'; menu.style.top = (r.bottom + 8) + 'px'; menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    wire();
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', outside, true), 0);
    const first = menu.querySelector('button'); first && first.focus();
  }
  menu = null;
  btn.onclick = e => { e.stopPropagation(); open(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu) { close(); btn.focus(); return; }
    if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { const bs = [...menu.querySelectorAll('button')], i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); shortcuts(); }
  });

  // keyboard shortcuts sheet
  const KEYS = [
    ['Anywhere', [['Ctrl K', 'Search or jump to anything'], ['Ctrl /', 'These shortcuts'], ['Ctrl Shift B', 'Report a bug'], ['Ctrl Shift D', 'Dictate into chat'], ['Ctrl Shift L', 'Switch between your light and dark theme'], ['Esc', 'Close a panel or menu']]],
    ['Writing docs', [['Ctrl B / I / U', 'Bold, italic, underline'], ['Ctrl K', 'Add a link'], ['Ctrl Alt 1 · 2 · 3', 'Heading 1, 2, 3 (0 for normal text)'], ['Ctrl Shift 7 · 8 · 9', 'Numbered, bulleted, checklist'], ['Ctrl Z / Y', 'Undo, redo'], ['/', 'Insert a block']]],
    ['Chat', [['Enter', 'Send'], ['Shift Enter', 'New line'], ['@', 'Mention someone or an agent']]],
    ['Design canvas', [['V · F · R · O · T · K', 'Move, frame, rectangle, ellipse, text, scale'], ['Shift A', 'Add auto layout'], ['Ctrl Alt K', 'Create a component'], ['Ctrl Alt B', 'Detach an instance'],
      ['Ctrl G / Ctrl Shift G', 'Group, ungroup'], ['Ctrl D', 'Duplicate'], ['Alt drag', 'Duplicate while dragging'], ['Alt A · D · W · S', 'Align left, right, top, bottom'], ['Alt H · V', 'Align centers (Shift: spread evenly)'], ['Shift drag', 'Keep the angle or the ratio'], ['Ctrl ] / [', 'Bring forward, send backward'],
      ['Ctrl Shift H / L', 'Hide, lock'], ['Ctrl R', 'Rename'], ['Enter / Esc', 'Select children, select parent'], ['Arrows', 'Nudge 1 px (Shift: 10 px)'], ['Shift 1 / 2 / 0', 'Zoom to fit, to selection, to 100%'],
      ['Space drag', 'Pan'], ['C', 'Comment'], ['Shift I', 'Ask Flint'], ['Right-click', 'Layer menu: copy, order, align, presets']]],
    ['Calls', [['Ctrl Shift M', 'Join a call, then mute or unmute'], ['Ctrl Shift E', 'Camera on or off'], ['Ctrl Shift U', 'Open or close the call stage'], ['Ctrl Shift H', 'Raise or lower your hand (on the stage)'], ['Hold Space', 'Talk, with push to talk on'], ['Shift drag', 'Draw on a shared screen (click: laser)']]],
    ['Preview', [['Esc', 'Close the innermost thing, then leave'], ['C', 'Comment on the page'], ['Double-click text', 'Edit the words in place'], ['Ctrl Z', 'Undo the last edit']]],
  ];
  // the section for where you are comes first
  const here = () => document.body.classList.contains('cv-focus') ? 'Design canvas' : (document.body.classList.contains('pvw-focus') || document.body.classList.contains('pvw-on')) ? 'Preview' : /^#\/canvas/.test(location.hash) ? 'Design canvas' : /^#\/docs?\b/.test(location.hash) ? 'Writing docs' : /^#\/(chat|general)/.test(location.hash) ? 'Chat' : '';
  function shortcuts() {
    close(); const old = $('#help-keys'); if (old) return old.remove();
    const w = document.createElement('div'); w.className = 'help-keys-wrap'; w.id = 'help-keys';
    w.innerHTML = `<div class="help-keys" role="dialog" aria-label="Keyboard shortcuts"><header><div><span class="eyebrow">Help</span><h2>Keyboard shortcuts</h2></div><button class="btn ghost" id="hk-close">Done</button></header>
      <div class="hk-body">${[...KEYS].sort((x, y) => (y[0] === here()) - (x[0] === here())).map(([t, rows]) => `<section${t === here() ? ' class="hk-here"' : ''}><span class="eyebrow">${esc(t)}${t === here() ? ' · here' : ''}</span>${rows.map(([k, d]) => `<div class="hk-row"><span>${esc(d)}</span><span class="kbd">${esc(k)}</span></div>`).join('')}</section>`).join('')}</div></div>`;
    document.body.appendChild(w);
    const done = () => { w.remove(); document.removeEventListener('keydown', key); }, key = e => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', key); w.querySelector('#hk-close').onclick = done; w.onclick = e => { if (e.target === w) done(); };
  }
  window.TribeHelp = { open, close, shortcuts, website, run, all: () => ALL, groups: () => GROUPS };
})();
