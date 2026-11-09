// The logo's flicker (assets/icon-animated.svg, scripts/icon.js): a few pixels of the flame move, nothing else.
// - The top-left logo flickers while something is working: connecting, a prompt in flight (Flint, Ask AI, the
//   Secretary, the local model), or an agent in the room at work (last 20 s). Hover shows what; it rests otherwise.
// - Any "Loading…" placeholder gets the small flickering flame in front of it (no per-screen code needed).
// - Reduced motion: the SVG itself falls back to the still frame.   window.TribeLogo = { loader(size) }
(function () {
  'use strict';
  const STILL = 'assets/icon.svg', LIVE = 'assets/icon-animated.svg';
  // the top-left logo is the bare mark on its button's tile: still at rest, a short flicker on hover, looping while busy
  const RAIL_STILL = 'assets/icon-mark-animated.svg' /* the flame idles: it always flickers (feat: logo in the top bar) */, RAIL_LIVE = 'assets/icon-mark-animated.svg', RAIL_ONCE = 'assets/icon-mark-once.svg';
  let onceText = null, onceUrl = null;
  if (/^https?:/.test(location.protocol)) fetch(RAIL_ONCE).then(r => r.ok ? r.text() : null).then(t => { onceText = t; }).catch(() => {});   // not under file:// (tests, previews)
  function playOnce(img) {   // a fresh blob URL restarts the SVG's animation on every hover
    if (!onceText) return;
    if (onceUrl) URL.revokeObjectURL(onceUrl);
    const c = colors(); onceUrl = URL.createObjectURL(new Blob([onceText.replace(/#F8FAFC/gi, c.b).replace(/#F26B1D/gi, c.f)], { type: 'image/svg+xml' })); img.src = onceUrl; img.dataset.logo = '';
  }
  const logo = () => document.querySelector('#rail-logo img.logo');
  // v0.25: the logo takes the theme's colors (--logo-bracket, --logo-flame, --logo-tile in themes.css): the SVG text
  // is recolored and shown as a data URL, cached per file and color set. Default colors keep the plain file.
  const svgText = {}, tinted = {};
  function colors() { const cs = document.body ? getComputedStyle(document.body) : null, g = n => (cs && cs.getPropertyValue(n).trim()) || '';
    return { b: g('--logo-bracket') || '#F8FAFC', f: g('--logo-flame') || '#F26B1D', t: g('--logo-tile') || '#282828' }; }
  function themed(path) {
    const c = colors(), key = path + c.b + c.f + c.t;
    if (c.b.toUpperCase() === '#F8FAFC' && c.f.toUpperCase() === '#F26B1D' && c.t === '#282828') return { src: path, key };
    if (tinted[key]) return { src: tinted[key], key };
    if (svgText[path] === undefined && /^https?:/.test(location.protocol)) { svgText[path] = null; fetch(path).then(r => r.ok ? r.text() : '').then(t => { svgText[path] = t; sync(true); }).catch(() => {}); }
    const t = svgText[path]; if (!t) return { src: path, key: path };
    tinted[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t.replace(/#F8FAFC/gi, c.b).replace(/#F26B1D/gi, c.f).replace(/#282828/gi, c.t));
    return { src: tinted[key], key };
  }
  function setLogo(img, path, force) { const x = themed(path); if (force || img.dataset.logo !== x.key) { img.src = x.src; img.dataset.logo = x.key; img.dataset.logoPath = path; } }
  let hover = false, inflight = 0, agentAt = 0, agentName = '', timer = null;
  const AGENT_MS = 20000;
  // What counts as "working": TribeCode connecting, a prompt in flight (Flint, Ask AI, the Secretary, the local
  // model), or an agent in the room that did something in the last 20 s (posted, claimed, moved, pushed).
  function reason() {
    const C = window.TribeClient;
    if (!C || !C.connected()) return 'Connecting…';
    if (inflight > 0) return 'Thinking…';
    if (Date.now() - agentAt < AGENT_MS) return `${agentName || 'An agent'} is working`;
    return '';
  }
  function sync(force) {
    const img = logo() || document.createElement('img');
    const why = reason();
    if (why) setLogo(img, RAIL_LIVE, force === true);
    else if (!img.src.startsWith('blob:')) setLogo(img, RAIL_STILL, force === true);
    document.querySelectorAll('img.tc-mark').forEach(m => setLogo(m, why ? LIVE : STILL, force === true));   // the phone Home logo too
    const btn = img.closest('#rail-logo'); if (btn) { btn.classList.toggle('is-busy', !!why);
    btn.title = why ? `${why} · Home` : 'Home: your overview of everything'; }
    clearTimeout(timer); if (why && inflight === 0) timer = setTimeout(sync, 2000);   // let an agent's spell run out
  }
  // prompts in flight
  const PROMPT = /\/api\/(flint\/ask|hub\/ask|ask(\/|$|\?)|secretary\/ask|brain\/|docs\/[^/?]+\/tldr|ai\/)/;
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '', method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'POST' || !PROMPT.test(url)) return _fetch(input, init);
    inflight++; sync();
    const done = () => { inflight = Math.max(0, inflight - 1); sync(); };
    return _fetch(input, init).then(r => {
      // streamed replies (Flint) count until the body is read: watch a clone so the caller's stream is untouched
      if (r.body && /event-stream|x-ndjson|text\/plain/.test(r.headers.get('content-type') || '')) { const rd = r.clone().body.getReader(); const pump = () => rd.read().then(x => x.done ? done() : pump(), done); pump(); }
      else done();
      return r;
    }, e => { done(); throw e; });
  };
  window.TribeLogoBusy = { start() { inflight++; sync(); }, stop() { inflight = Math.max(0, inflight - 1); sync(); } };
  // agents at work: anything an agent member does over the socket
  const agentById = id => ((window.TribeClient && window.TribeClient.state().members) || []).find(m => m.id === id && m.role === 'agent');
  const lastWhere = new Map();
  function pulse(m) { agentAt = Date.now(); agentName = m.name || ''; sync(); }
  function onWs(m) {
    if (!m || m.type === 'presence' || m.type === 'hello') return;
    const ids = [m.from, m.by, m.member, m.author, m.who, m.message && m.message.from, m.claim && m.claim.by, m.gist && m.gist.by, m.task && m.task.updatedBy].filter(x => typeof x === 'string');
    for (const id of ids) { const a = agentById(id); if (a) return pulse(a); }
  }
  function onPresence(ms) {
    for (const m of ms || []) { if (m.role !== 'agent') continue; const w = m.online ? (m.where || '') : ''; if (lastWhere.has(m.id) && lastWhere.get(m.id) !== w && w) pulse(m); lastWhere.set(m.id, w); }
  }
  const btn = document.querySelector('#rail-logo');
  if (btn) { btn.addEventListener('mouseenter', () => { hover = true; sync(); }); btn.addEventListener('mouseleave', () => { hover = false; sync(); }); }
  const hook = () => { const C = window.TribeClient; if (!C || !C.on) return setTimeout(hook, 200); C.on('status', sync); C.on('ws', onWs); C.on('presence', onPresence); sync(); };
  hook();
  // a new theme repaints the logo
  if (window.MutationObserver && document.body) new MutationObserver(() => setTimeout(() => sync(true), 30)).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

  // "Loading…" placeholders get the flame
  const SKIP = new Set(['BUTTON', 'OPTION', 'TITLE', 'INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE']);
  function mark(root) {
    const els = root.nodeType === 1 ? [root, ...root.querySelectorAll('div,p,span,li,em')] : [];
    for (const el of els) {
      if (SKIP.has(el.tagName) || el.classList.contains('tc-loading') || el.children.length) continue;
      const t = el.textContent.trim(); if (t === 'Loading…' || t === 'Loading...') el.classList.add('tc-loading');
    }
  }
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { mark(n); if (n.matches('img.tc-mark') || n.querySelector('img.tc-mark')) sync(); } else if (n.nodeType === 3 && n.parentElement) mark(n.parentElement); })
    .observe(document.body, { childList: true, subtree: true });
  mark(document.body);
  window.TribeLogo = { busy: () => !!reason(), reason, agentPulse: pulse, loader: (size = 20) => `<img class="tc-loader" src="assets/icon-mark-animated.svg" width="${size}" height="${size}" alt="" aria-hidden="true">` };
})();
