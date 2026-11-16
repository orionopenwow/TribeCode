// Put it on your phone (docs/HOMESCREEN-PATH.md): one guided path from any project (an App Creator app, a code app, a
// game, a website) to an icon on a phone's home screen. Five stages, each with a plain line, why it matters, a check
// where one is possible, what to do when stuck, outside reading, and what Flint does here with no AI. When the tribe has
// a stronger AI (a member's own Claude Code / Codex / Gemini, or the host's key) each stage offers one prefilled ask
// for the AI helpers; nothing they change joins the main copy without a person's OK.
//   1 Make it installable   the check (homescreen-core.js) and one-tap fix (POST /api/homescreen/fix), icons from the Launch kit
//   2 Put it online         this computer's play link, free cloud, GitHub Pages (the Publish sheet does the publishing) + free limits
//   3 Open it on your phone a QR code, Send by text, Share, Copy
//   4 Add to home screen    steps per phone and browser, with our own small drawings; warns about in-app browsers
//   5 A real store app      the Launch kit, Android/iPhone builds, costs from the stores' own pages
// Entry points: Publish › Where it goes, App Creator's export, Flint ("how do I put my app on my phone"), quick guides
// and Ctrl K (through the quick guides), and the 'phone' suggestions.
// Public: window.TribeHomescreen = { open(pid?, stage?), close(), state(), ready(), online(), phone(), add(), store(), suggestProvider }
(function () {
  'use strict';
  const C = window.TribeClient;
  const H = () => window.TribeHomeCore;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const F = (s, v) => T(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m);
  const ico = (n, s) => (window.TribeIcons && window.TribeIcons.has && window.TribeIcons.has(n) ? window.TribeIcons.svg(n, s || 16) : '');
  const online = () => !!(C && C.hasToken && C.hasToken()) && !(window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo());
  const pidNow = () => (C && C.project && C.project()) || '';
  let st = null;

  // ---------- small drawings: plain strokes in the app's tokens, never any maker's artwork ----------
  const PH = inner => `<svg class="hs-draw" viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="4" width="32" height="56" rx="6" class="hs-d-body"/>${inner}</svg>`;
  const DRAW = {
    share: PH('<rect x="16" y="46" width="32" height="14" rx="0" class="hs-d-bar"/><path d="M32 49v7M29 52l3-3 3 3" class="hs-d-hot"/><rect x="28.5" y="52" width="7" height="6" rx="1" class="hs-d-hot" fill="none"/>'),
    addhome: PH('<rect x="20" y="22" width="24" height="22" rx="3" class="hs-d-card"/><rect x="22" y="30" width="20" height="6" rx="2" class="hs-d-hotfill"/><path d="M25 33h3M26.5 31.5v3" class="hs-d-ink"/>'),
    webapp: PH('<rect x="20" y="24" width="24" height="14" rx="3" class="hs-d-card"/><rect x="34" y="28" width="7" height="5" rx="2.5" class="hs-d-hotfill"/><circle cx="38.5" cy="30.5" r="1.8" class="hs-d-ink"/>'),
    icon: PH('<rect x="21" y="12" width="8" height="8" rx="2" class="hs-d-dim"/><rect x="35" y="12" width="8" height="8" rx="2" class="hs-d-dim"/><rect x="21" y="26" width="8" height="8" rx="2" class="hs-d-dim"/><rect x="35" y="26" width="8" height="8" rx="2" class="hs-d-hotfill"/>'),
    dots: PH('<circle cx="42" cy="10" r="1.4" class="hs-d-hotfill"/><circle cx="42" cy="14" r="1.4" class="hs-d-hotfill"/><circle cx="42" cy="18" r="1.4" class="hs-d-hotfill"/>'),
    lines: PH('<path d="M37 48h8M37 51h8M37 54h8" class="hs-d-hot"/>'),
    install: PH('<rect x="22" y="12" width="22" height="26" rx="3" class="hs-d-card"/><path d="M25 18h16M25 24h16" class="hs-d-dimline"/><rect x="24" y="28" width="18" height="6" rx="2" class="hs-d-hotfill"/>'),
    confirm: PH('<rect x="19" y="20" width="26" height="22" rx="3" class="hs-d-card"/><path d="M23 27h18" class="hs-d-dimline"/><rect x="33" y="33" width="9" height="5" rx="2" class="hs-d-hotfill"/>'),
    bar: '<svg class="hs-draw" viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="12" width="56" height="40" rx="5" class="hs-d-body"/><rect x="8" y="17" width="48" height="7" rx="3.5" class="hs-d-card"/><rect x="47" y="18.5" width="6" height="4" rx="1" class="hs-d-hot" fill="none"/><path d="M50 19.5v2" class="hs-d-hot"/></svg>',
    more: PH('<circle cx="37" cy="10" r="1.3" class="hs-d-hotfill"/><circle cx="41" cy="10" r="1.3" class="hs-d-hotfill"/><circle cx="45" cy="10" r="1.3" class="hs-d-hotfill"/><rect x="20" y="14" width="24" height="3" rx="1.5" class="hs-d-dim"/>'),
    safari: PH('<circle cx="32" cy="30" r="9" class="hs-d-hot" fill="none"/><path d="M28 34l2-6 6-2-2 6z" class="hs-d-hotfill"/>'),
    chrome: PH('<circle cx="32" cy="30" r="9" class="hs-d-hot" fill="none"/><circle cx="32" cy="30" r="3.5" class="hs-d-hotfill"/>'),
  };

  // ---------- state ----------
  async function load(pid) {
    const out = { view: null, pub: null, ai: false, kit: null, brand: null };
    if (!online()) return out;
    const proj = { project: pid };
    await Promise.all([
      C.api('/homescreen?project=' + encodeURIComponent(pid), proj).then(v => { out.view = v; }).catch(e => { out.view = { problem: e.message, links: [], check: null, canFix: false }; }),
      C.api('/publish/real?project=' + encodeURIComponent(pid), proj).then(v => { out.pub = v; }).catch(() => {}),
      C.api('/flint/tiers').then(t => { out.ai = !!(t && t.now && t.now.host && t.now.host.online); }).catch(() => {}),
      C.api(`/projects/${encodeURIComponent(pid)}/launchkit`, proj).then(r => { out.kit = r && r.kit; }).catch(() => {}),
      (window.TribeBrandKit ? window.TribeBrandKit.get(pid).then(b => { out.brand = b; }).catch(() => {}) : Promise.resolve()),
    ]);
    const members = (C.state && C.state().members) || [];
    if (members.some(m => m.role === 'agent')) out.ai = true;   // a member's own AI helper is connected to the tribe
    return out;
  }
  const stageIdx = id => Math.max(0, H().STAGES.findIndex(s => s.id === id));
  const linkOf = () => { const l = (st.view && st.view.links) || []; return l.find(x => x.id === 'pages') || l.find(x => x.id === 'play') || null; };
  const isLocalUrl = u => { try { const h = new URL(u).hostname; return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(h) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h); } catch { return false; } };
  function stageDone(id) {
    const v = st.view || {};
    if (id === 'ready') return !!(v.check && v.check.ok);
    if (id === 'online') return !!linkOf() && !isLocalUrl(linkOf().url);
    if (id === 'open') return !!st.opened;
    if (id === 'add') return !!st.added;
    return false;
  }

  // ---------- open / close ----------
  async function open(pid, stage) {
    if (!H()) return toast(T('Put it on your phone did not load. Reload the app.'));
    pid = pid || pidNow(); if (!pid) return toast(T('Open a project first'));
    if (st && st.sheet) close();
    const proj = ((C && C.state && C.state().projects) || []).find(p => p.id === pid) || {};
    const ua = H().detect(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints || 0 });
    st = { pid, name: proj.name || T('your app'), stage: stage && H().STAGES.some(s => s.id === stage) ? stage : 'ready', ua, key: ua.key, opened: false, added: false, reach: {}, busy: false };
    if (!window.TribeUI || !window.TribeUI.sheet) return toast(T('Put it on your phone did not load. Reload the app.'));
    st.sheet = window.TribeUI.sheet({ id: 'hs-sheet', wide: true, kind: 'steps', eyebrow: 'Put it on your phone', title: proj.name || 'Your app',
      body: `<div class="hs" id="hs"><p class="hs-load faint">${esc(T('Checking your project…'))}</p></div>`, onClose: () => { st = null; } });
    st.sheet.el.classList.add('hs-sheet');
    const data = await load(pid); if (!st) return;
    Object.assign(st, data);
    if (!stage) st.stage = !stageDone('ready') ? 'ready' : !stageDone('online') ? 'online' : 'open';
    draw();
  }
  function close() { if (st && st.sheet) st.sheet.close(); st = null; }

  // ---------- drawing the sheet ----------
  function draw() {
    if (!st || !st.sheet) return;
    const root = st.sheet.el.querySelector('#hs'); if (!root) return;
    const S = H().STAGES, cur = S[stageIdx(st.stage)];
    const nav = `<nav class="hsp-steps" aria-label="${esc(T('Steps'))}">${S.map(s => `<button type="button" class="hsp-step${s.id === st.stage ? ' is-on' : ''}${stageDone(s.id) ? ' is-done' : ''}" data-hs-stage="${s.id}" aria-current="${s.id === st.stage ? 'step' : 'false'}"><span class="hs-n">${stageDone(s.id) ? ico('check', 14) || '✓' : s.n}</span><span class="hs-sl">${esc(T(s.short))}</span></button>`).join('')}</nav>`;
    root.innerHTML = `${st.ua.inApp && st.ua.phone ? inAppBanner() : ''}${nav}
      <section class="hs-stage" data-stage="${cur.id}"><span class="eyebrow">${esc(F('Step {n} of 5', { n: cur.n }))}</span><h4 class="hs-h">${esc(T(cur.title))}</h4>
        <p class="hs-line">${esc(T(cur.line))}</p><p class="hs-why"><b>${esc(T('Why'))}</b> ${esc(T(cur.why))}</p>
        <div class="hsp-body" id="hsp-body">${body(cur.id)}</div>
        ${aiCard(cur)}
        <details class="hs-stuck"><summary>${esc(T('Stuck?'))}</summary><p>${esc(T(cur.stuck))}</p></details>
        ${resources(cur.res)}
      </section>
      <footer class="hs-foot">${cur.n > 1 ? `<button type="button" class="btn" data-hs-go="${S[cur.n - 2].id}">${esc(T('Back'))}</button>` : '<span></span>'}${cur.n < 5 ? `<button type="button" class="btn${stageDone(cur.id) ? ' primary' : ''}" data-hs-go="${S[cur.n].id}">${esc(cur.n === 4 ? T('Next: a store app (optional)') : T('Next'))}</button>` : `<button type="button" class="btn" data-hs-done>${esc(T('Done'))}</button>`}</footer>`;
    wire(root, cur.id);
  }
  function resources(keys) {
    const Sx = H().SOURCES; const list = (keys || []).map(k => Sx[k]).filter(Boolean); if (!list.length) return '';
    return `<div class="hs-res"><span class="eyebrow">${esc(T('Read more'))}</span><ul>${list.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul></div>`;
  }
  function inAppBanner() {
    const a = st.ua.inApp, android = st.ua.os === 'android', url = location.href;
    const intent = android ? H().intentUrl(url) : null;
    return `<div class="hs-inapp" role="alert"><b>${esc(F('You are inside {app}’s browser.', { app: a }))}</b> <span>${esc(T(android ? 'It can’t install apps. Open this page in Chrome first.' : 'It has no Add to Home Screen. Tap ••• (or the compass) and choose Open in Safari.'))}</span>${intent ? ` <a class="btn sm" href="${esc(intent)}">${esc(T('Open in Chrome'))}</a>` : ''}</div>`;
  }
  function aiCard(cur) {
    const ask = H().ASKS[cur.id];
    if (st.ai) return `<div class="hs-ai"><span class="eyebrow">${esc(T('Your AI can do more here'))}</span><p class="hs-ai-q" id="hs-ai-q">${esc(T(ask))}</p>
      <div class="hsp-row"><button type="button" class="btn" id="hs-ai-send">${esc(T('Ask my AI helpers'))}</button><small class="faint">${esc(T('They work in their own corner; you approve every change.'))}</small></div></div>`;
    return `<div class="hs-ai is-local"><span class="eyebrow">${esc(T('With no AI'))}</span><p>${esc(T(cur.local))}</p><small class="faint">${esc(T('A stronger AI (your own Claude Code, Codex or Gemini) can go further here. Connect one in Agents Hub.'))}</small></div>`;
  }

  // ---------- each stage ----------
  function body(id) {
    if (id === 'ready') return bodyReady();
    if (id === 'online') return bodyOnline();
    if (id === 'open') return bodyOpen();
    if (id === 'add') return bodyAdd();
    return bodyStore();
  }
  const askBtn = () => `<button type="button" class="btn" data-gs-ask="site.publish">${esc(T('Ask to publish'))}</button><small class="faint">${esc(T('The people who can publish here get your request.'))}</small>`;
  function checkList(ch) {
    return `<ul class="hs-checks">${ch.items.map(x => `<li class="${x.ok ? 'is-ok' : x.need === 'required' ? 'is-bad' : 'is-soft'}" data-hs-check="${x.id}"><span class="hs-ci" aria-hidden="true">${x.ok ? (ico('check', 14) || '✓') : x.need === 'required' ? '×' : '–'}</span><span><b>${esc(T(x.label))}</b>${x.ok ? '' : `<small>${esc(T(x.why))}${x.need === 'recommended' ? ` <em>${esc(T('Recommended'))}</em>` : ''}</small>`}</span></li>`).join('')}</ul>`;
  }
  function bodyReady() {
    const v = st.view; if (!online()) return `<p class="faint">${esc(T('This needs the tribe on a computer or the free cloud, so the check can read your project’s files.'))}</p>`;
    if (!v || !v.check) return `<p class="hs-warn">${esc(v && v.problem ? T(v.problem) : T('There is no first page yet. Build a first version first.'))}</p>`;
    const ch = v.check, missing = ch.items.filter(x => !x.ok && x.fix);
    const act = !missing.length ? `<p class="hs-ok">${ico('check', 16)} ${esc(T('Ready: phones can install it.'))}</p>`
      : v.canFix ? `<div class="hsp-row"><button type="button" class="btn primary" id="hs-fix">${esc(T('Make it installable'))}</button><small class="faint">${esc(T('Adds only what is missing, with your Launch kit icon. Saved as a version you can go back to.'))}</small></div>`
        : `<div class="hsp-row">${askBtn()}</div>`;
    return `${checkList(ch)}${act}<p class="hs-done-note faint" id="hs-fixed" hidden></p>`;
  }
  function limitsTable(rows) {
    const Sx = H().SOURCES;
    return `<table class="hs-limits"><thead><tr><th>${esc(T('Where'))}</th><th>${esc(T('Cost'))}</th><th>${esc(T('Limits that matter'))}</th></tr></thead><tbody>${rows.map(r => `<tr data-hs-limit="${r.id}"><th scope="row">${esc(T(r.name))}</th><td>${esc(T(r.cost))}</td><td><ul>${r.facts.map(f => `<li>${esc(T(f))}</li>`).join('')}</ul>${r.src ? `<a class="hs-src" href="${esc(Sx[r.src].url)}" target="_blank" rel="noopener">${esc(F('Source: {s}', { s: Sx[r.src].title }))}</a>` : ''}${r.also ? ` <a class="hs-src" href="${esc(Sx[r.also].url)}" target="_blank" rel="noopener">${esc(Sx[r.also].title)}</a>` : ''}</td></tr>`).join('')}</tbody></table><small class="faint hs-read">${esc(F('Read on the providers’ own pages on {d}. Limits change; check before you rely on them.', { d: H().READ }))}</small>`;
  }
  function bodyOnline() {
    const links = (st.view && st.view.links) || [], can = st.view ? st.view.canFix : false;
    const live = links.length ? `<ul class="hs-links">${links.map(l => `<li data-hs-link="${l.id}"><span class="hs-lk"><b>${esc(T(l.id === 'pages' ? 'GitHub page' : 'Play link'))}</b><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></span><button type="button" class="btn sm" data-hs-reach="${esc(l.url)}">${esc(T('Check it'))}</button><div class="hs-reach" data-hs-reached="${esc(l.url)}">${reachHtml(st.reach[l.url])}</div></li>`).join('')}</ul>`
      : `<p class="faint">${esc(T('Not online yet. Pick one of these:'))}</p>`;
    const opt = (id, title, line, btn) => `<li class="hsp-opt" data-hs-opt="${id}"><b>${esc(T(title))}</b><span>${esc(T(line))}</span>${btn}</li>`;
    const pubBtn = (label, focus) => can ? `<button type="button" class="btn sm" data-hs-pub="${focus}">${esc(T(label))}</button>` : '';
    const opts = `<ul class="hsp-opts">
      ${opt('computer', 'This computer’s link', 'A play link from this computer. Fast to try; it stops when the computer sleeps.', pubBtn('Make a play link', ''))}
      ${opt('pages', 'GitHub Pages', 'A link that stays up for free, in your own GitHub account. Best for the home screen.', pubBtn('Publish to GitHub', 'pages'))}
      ${opt('cloud', 'Free cloud', 'Moves the whole tribe to a free server so everything stays online. It naps when nobody is there.', window.TribePhoneHost && window.TribePhoneHost.cloud ? `<button type="button" class="btn sm" data-hs-cloud>${esc(T('Set up free cloud'))}</button>` : '')}
    </ul>${can ? '' : `<div class="hsp-row">${askBtn()}</div>`}`;
    return `${live}${opts}<details class="hs-free" open><summary>${esc(T('Free limits'))}</summary>${limitsTable(H().LIMITS)}</details>`;
  }
  function reachHtml(r) {
    if (!r) return '';
    if (r.busy) return `<small class="faint">${esc(T('Checking the live link…'))}</small>`;
    if (!r.ok) return `<p class="hs-warn">${esc(T(r.error || 'The link did not answer.'))}</p>`;
    const bad = r.check ? r.check.items.filter(x => !x.ok && x.need === 'required') : [];
    return `${r.local ? `<p class="hs-warn">${esc(T('This address only works on this computer or the same Wi-Fi. Use a GitHub page or the public link for phones elsewhere.'))}</p>` : ''}${bad.length ? `<p class="hs-warn">${esc(F('Answers, but phones won’t install it yet: {list}.', { list: bad.map(x => T(x.label)).join(', ') }))}</p>` : `<p class="hs-ok">${ico('check', 14)} ${esc(T('Answers over https and passes the install check.'))}</p>`}`;
  }
  function bodyOpen() {
    const l = linkOf();
    if (!l) return `<p class="hs-warn">${esc(T('Put it online first: phones need a link.'))}</p><button type="button" class="btn" data-hs-go="online">${esc(T('Put it online'))}</button>`;
    const qr = window.TribeQR ? window.TribeQR.svg(l.url, { fg: '#111111', bg: '#FFFFFF' }) : '';
    const sms = `sms:?&body=${encodeURIComponent(l.url)}`;
    return `${isLocalUrl(l.url) ? `<p class="hs-warn">${esc(T('This address only works on this computer or the same Wi-Fi.'))}</p>` : ''}
      <div class="hs-open"><div class="hs-qr" aria-label="${esc(T('QR code for the link'))}">${qr}</div>
        <div class="hs-open-acts"><p class="hs-url"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></p>
          <p class="faint">${esc(T('Point the phone’s Camera app at the code, then tap the link it shows.'))}</p>
          <div class="hsp-row"><a class="btn" id="hs-sms" href="${esc(sms)}">${esc(T('Send by text'))}</a>${navigator.share ? `<button type="button" class="btn" id="hs-share">${esc(T('Share'))}</button>` : ''}<button type="button" class="btn" id="hs-copy">${esc(T('Copy link'))}</button></div>
          <label class="hs-tick"><input type="checkbox" id="hs-opened" ${st.opened ? 'checked' : ''}> <span>${esc(T('It opened on my phone'))}</span></label></div></div>`;
  }
  const TABS = [['iphone', 'iPhone', [['ios-safari', 'Safari'], ['ios-other', 'Chrome, Edge or Firefox'], ['inapp-ios', 'Inside another app']]],
    ['android', 'Android', [['android-chrome', 'Chrome'], ['android-samsung', 'Samsung Internet'], ['android-firefox', 'Firefox'], ['inapp-android', 'Inside another app']]],
    ['computer', 'Computer', [['desktop-chromium', 'Chrome or Edge'], ['desktop-other', 'Another browser']]]];
  function bodyAdd() {
    const s = H().steps(st.key), tab = s.tab, T3 = TABS.find(t => t[0] === tab) || TABS[0];
    const Sx = H().SOURCES;
    return `<div class="hs-tabs" role="tablist">${TABS.map(([id, label, list]) => `<button type="button" role="tab" class="hs-tab${id === tab ? ' is-on' : ''}" aria-selected="${id === tab}" data-hs-tab="${list[0][0]}">${esc(T(label))}</button>`).join('')}</div>
      <div class="hs-chips" role="group" aria-label="${esc(T('Browser'))}">${T3[2].map(([k, l]) => `<button type="button" class="chip${k === st.key ? ' is-on' : ''}" aria-pressed="${k === st.key}" data-hs-key="${k}">${esc(T(l))}</button>`).join('')}</div>
      ${st.ua.phone && st.ua.key === st.key ? `<p class="faint hs-you">${esc(T('Picked for the phone and browser you are using now.'))}</p>` : ''}
      <h5 class="hs-st" id="hs-steps-title">${esc(T(s.title))}</h5>
      <ol class="hs-how" data-hs-steps="${st.key}">${s.items.map((t, i) => `<li><span class="hs-pic">${DRAW[s.drawings[i]] || ''}</span><span>${esc(T(t))}</span></li>`).join('')}</ol>
      ${s.note ? `<p class="hs-note">${esc(T(s.note))}</p>` : ''}
      ${/^inapp-android/.test(st.key) && linkOf() ? `<a class="btn" href="${esc(H().intentUrl(linkOf().url) || '#')}">${esc(T('Open in Chrome'))}</a>` : ''}
      <label class="hs-tick"><input type="checkbox" id="hs-added" ${st.added ? 'checked' : ''}> <span>${esc(T('The icon is on my home screen'))}</span></label>`;
  }
  function bodyStore() {
    return `<p>${esc(T('Expo can build the iPhone app on its own Mac machines, and TribeCode prepares a GitHub build too, so you don’t need your own Mac. You do need Apple’s developer membership to put it on other people’s iPhones or in the App Store.'))}</p>
      <div class="hsp-row">${window.TribeLaunchKit ? `<button type="button" class="btn" data-hs-launch>${esc(T('Open the Launch kit'))}</button>` : ''}${window.TribePublish ? `<button type="button" class="btn" data-hs-pub="android">${esc(T('Make the Android app'))}</button>` : ''}${window.TribeAppCreator ? `<button type="button" class="btn" data-hs-expo>${esc(T('Export an Expo project'))}</button>` : ''}</div>
      <details class="hs-free" open><summary>${esc(T('Costs and free limits'))}</summary>${limitsTable(H().STORE)}</details>`;
  }

  // ---------- wiring ----------
  function wire(root, id) {
    root.querySelectorAll('[data-hs-stage],[data-hs-go]').forEach(b => b.onclick = () => { st.stage = b.dataset.hsStage || b.dataset.hsGo; draw(); const s = root.querySelector('.hs-stage'); if (s) s.scrollIntoView({ block: 'start' }); });
    const done = root.querySelector('[data-hs-done]'); if (done) done.onclick = close;
    const send = root.querySelector('#hs-ai-send'); if (send) send.onclick = () => askAI(id, send);
    if (id === 'ready') { const b = root.querySelector('#hs-fix'); if (b) b.onclick = () => fix(b); }
    root.querySelectorAll('[data-hs-reach]').forEach(b => b.onclick = () => reach(b.dataset.hsReach));
    root.querySelectorAll('[data-hs-pub]').forEach(b => b.onclick = () => { const f = b.dataset.hsPub; close(); window.TribePublish && window.TribePublish.open(undefined, f); });
    const cl = root.querySelector('[data-hs-cloud]'); if (cl) cl.onclick = () => { close(); window.TribePhoneHost.cloud(); };
    const lk = root.querySelector('[data-hs-launch]'); if (lk) lk.onclick = () => { const pid = st.pid; close(); window.TribeLaunchKit.open(pid); };
    const ex = root.querySelector('[data-hs-expo]'); if (ex) ex.onclick = () => { close(); try { window.TribeAppCreator.open(); } catch {} };
    const l = linkOf();
    const cp = root.querySelector('#hs-copy'); if (cp && l) cp.onclick = async () => { try { await navigator.clipboard.writeText(l.url); toast(T('Copied.')); } catch { window.prompt(T('Copy this:'), l.url); } };
    const sh = root.querySelector('#hs-share'); if (sh && l) sh.onclick = () => navigator.share({ title: st.name, url: l.url }).catch(() => {});
    const op = root.querySelector('#hs-opened'); if (op) op.onchange = () => { st.opened = op.checked; draw(); };
    const ad = root.querySelector('#hs-added'); if (ad) ad.onchange = () => { st.added = ad.checked; if (ad.checked) toast(T('Nice. It opens full screen from the icon.')); draw(); };
    root.querySelectorAll('[data-hs-tab],[data-hs-key]').forEach(b => b.onclick = () => { st.key = b.dataset.hsKey || b.dataset.hsTab; draw(); });
  }
  async function launchIcons() {
    // the Launch kit's icon, drawn at the two sizes phones ask for; the server draws one from the name and color when this fails
    const D = window.TribeLaunchDraw, kit = st.kit; if (!D || !kit || !kit.icon) return null;
    const out = {};
    try {
      for (const n of [192, 512]) { const c = document.createElement('canvas'); await D.icon(c, n, { ...kit.icon, brand: st.brand || { colors: { accent: '#F26B1D' } }, name: st.name }, 'opaque'); out[n] = c.toDataURL('image/png'); }
      return out;
    } catch { return null; }
  }
  async function fix(btn) {
    if (st.busy) return; st.busy = true; btn.disabled = true; btn.textContent = T('Adding what is missing…');
    try {
      const icons = await launchIcons();
      const color = st.brand && st.brand.colors && st.brand.colors.accent;
      const r = await C.api('/homescreen/fix', { method: 'POST', body: { project: st.pid, icons: icons || undefined, color: /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : undefined, name: st.name }, project: st.pid });
      st.view = { ...st.view, check: r.check }; st.lastUndo = r.undo || null;
      draw();
      const n = st.sheet && st.sheet.el.querySelector('#hs-fixed');
      if (n) {
        n.hidden = false; n.innerHTML = `<span>${esc(r.changed.length ? F('Added or updated: {files}. Saved as a version.', { files: r.changed.join(', ') }) : T('Nothing was missing.'))}</span>${r.undo ? `<button type="button" class="btn sm" id="hs-undo">${esc(T('Undo'))}</button>` : ''}`;
        const u = n.querySelector('#hs-undo'); if (u) u.onclick = async () => {
          u.disabled = true;
          try { const x = await C.api('/homescreen/undo', { method: 'POST', body: { project: st.pid, undo: r.undo }, project: st.pid }); st.view = { ...st.view, check: x.check }; draw(); toast(T('Put back as it was.')); }
          catch (e) { toast(e.message || String(e)); u.disabled = false; }
        };
      }
      toast(r.check && r.check.ok ? T('Installable now.') : T('Added what was missing.'));
    } catch (e) { toast(e.message || String(e)); btn.disabled = false; btn.textContent = T('Make it installable'); }
    finally { if (st) st.busy = false; }
  }
  async function reach(url) {
    st.reach[url] = { busy: true }; paintReach(url);
    try { st.reach[url] = await C.api('/homescreen/reach', { method: 'POST', body: { project: st.pid, url }, project: st.pid }); }
    catch (e) { st.reach[url] = { ok: false, error: e.message }; }
    paintReach(url);
  }
  function paintReach(url) { const box = st && st.sheet && [...st.sheet.el.querySelectorAll('[data-hs-reached]')].find(x => x.dataset.hsReached === url); if (box) box.innerHTML = reachHtml(st.reach[url]); }
  async function askAI(id, btn) {
    const text = T(H().ASKS[id]) + ` (${T('Project')}: ${st.name})`;
    btn.disabled = true;
    try {
      try { await C.api('/agents/channel', { method: 'POST', body: { text: '@agents ' + text }, project: st.pid }); toast(T('Sent to your AI helpers in #agents. You approve every change.')); }
      catch (e) {
        if (!/mention an agent|no agent/i.test(e.message || '')) throw e;
        await C.api('/tasks', { method: 'POST', body: { title: text.slice(0, 120), body: text, type: 'build' }, project: st.pid });
        toast(T('No AI helper is connected yet, so it is a task now.'));
      }
    } catch (e) { toast(e.message || String(e)); }
    finally { btn.disabled = false; }
  }

  // ---------- suggestions for the tribe (TribeSuggest) ----------
  const suggestProvider = {
    id: 'phone', title: 'On your phone',
    async gather(ctx) {
      const pid = (ctx && ctx.projectId) || pidNow(); if (!pid || !online()) return null;
      try { return { pid, view: await C.api('/homescreen?project=' + encodeURIComponent(pid), { project: pid }) }; } catch { return null; }
    },
    async suggest(ctx, g) {
      if (!g || !g.view || !g.view.check) return [];
      const v = g.view, name = v.name || T('your app'), out = [];
      const miss = v.check.items.filter(x => !x.ok && x.fix);
      if (miss.length && v.canFix && v.kind !== 'site') out.push({
        id: 'installable', kind: 'phone', title: F('Make {name} installable on phones', { name }),
        why: F('It is missing: {list}. Without them a phone opens it as a plain website.', { list: miss.slice(0, 3).map(x => T(x.label).toLowerCase()).join(', ') }),
        from: [{ kind: 'check', ref: 'installable', who: 'Flint' }],
        apply: async () => {
          const r = await C.api('/homescreen/fix', { method: 'POST', body: { project: g.pid }, project: g.pid });
          return async () => { if (r.undo) await C.api('/homescreen/undo', { method: 'POST', body: { project: g.pid, undo: r.undo }, project: g.pid }); };
        },
      });
      if (v.check.ok && (v.links || []).some(l => l.id === 'pages' || l.id === 'play')) out.push({
        id: 'homescreen', kind: 'phone', title: F('Add {name} to your home screen', { name }),
        why: T('It installs now. Scan the code on your phone and add it, so it opens like an app.'),
        from: [{ kind: 'publish', ref: ((v.links || [])[0] || {}).id || 'play', who: 'Flint' }],
        apply: async () => { open(g.pid, 'open'); return async () => {}; },
      });
      return out;
    },
  };
  function registerSuggest() { const S = window.TribeSuggest; if (S && typeof S.register === 'function' && !registerSuggest.done) { registerSuggest.done = true; try { S.register(suggestProvider); } catch {} } }
  registerSuggest(); window.addEventListener('load', registerSuggest); document.addEventListener('tribe:suggest-ready', registerSuggest);
  if (C && C.on) C.on('ws', m => { if (m && m.type === 'homescreen' && st && st.pid === m.project && !st.busy) load(st.pid).then(d => { if (st) { Object.assign(st, d); draw(); } }); });

  const go = s => () => open(undefined, s);
  window.TribeHomescreen = { open, close, state: () => st && { pid: st.pid, stage: st.stage, key: st.key, ai: st.ai, check: st.view && st.view.check, links: st.view && st.view.links }, ready: go('ready'), online: go('online'), phone: go('open'), add: go('add'), store: go('store'), suggestProvider };
})();
