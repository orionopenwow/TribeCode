// Lessons (pass 4): short tracks a person DOES in the real tool. The tracks live with the quick guides in ONE file,
// templates/quickguides.json ("tracks"), so the app, Flint and the website never drift.
//   A step = a title, one sentence, "Show me" (opens the place and rings the real control) and, where the app can tell,
//   a check that ticks the step by itself when the person has done it. "Done, next" always works too.
//   A small card stays on screen while the person works; closing it pauses the lesson (progress is kept).
//   Progress: on this device (localStorage tribecode.learn, next to the quick guides') and, in a tribe, with the person
//   (GET|PUT /api/me/learn), so it follows them to another device.
//   A step marked soon in the file is hidden until its control has been seen on screen once.
// Public: window.TribeLessons = { tracks(), get(id), steps(id), start(id, stepId?), stop(), state(), progress(id), done(id, stepId?),
//                                 mark(id, stepId), next(), show(id, stepId) -> Promise<bool>, homeHTML(), flint(text), suggestProvider, sync() }
(function () {
  'use strict';
  const W = window, KEY = 'tribecode.learn';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (W.TribeI18n && W.TribeI18n.t ? W.TribeI18n.t(s, s) || s : s);
  const F = (s, v) => T(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const ic = (n, z) => (W.TribeIcons && W.TribeIcons.svg ? W.TribeIcons.svg(n, z || 16) : '');
  const toast = t => W.TribeApp && W.TribeApp.toast && W.TribeApp.toast(T(t));
  const C = () => W.TribeClient;
  const live = () => { try { return !!(C() && C().connected && C().connected()); } catch { return false; } };
  const pid = () => { try { return (C() && C().project && C().project()) || ''; } catch { return ''; } };
  const ls = { get() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }, set(j) { try { localStorage.setItem(KEY, JSON.stringify(j)); } catch {} } };
  const Q = () => W.TribeQuick;

  // ---------- the tracks ----------
  const raw = () => (Q() && Q().tracks ? Q().tracks() : []);
  const tracks = () => raw().filter(t => !t.needs || !!W[t.needs]);
  const get = id => tracks().find(t => t.id === id) || null;
  const have = () => ls.get().have || {};
  // a step another branch is still adding shows once its control has been seen
  const steps = id => { const t = typeof id === 'string' ? get(id) : id, h = have(); return t ? t.steps.filter(s => !s.soon || h[`${t.id}/${s.id}`]) : []; };

  // ---------- progress ----------
  const prog = () => ls.get().track || {};
  const done = (tid, sid) => { const p = prog()[tid] || {}; if (sid) return !!p[sid]; const s = steps(tid); return !!s.length && s.every(x => p[x.id]); };
  const progress = tid => { const p = prog()[tid] || {}, s = steps(tid); return { done: s.filter(x => p[x.id]).length, all: s.length }; };
  function mark(tid, sid) {
    const j = ls.get(); j.track = j.track || {}; const box = j.track[tid] || (j.track[tid] = {});
    if (box[sid]) return false; box[sid] = Date.now(); ls.set(j);
    try { document.dispatchEvent(new CustomEvent('tribe:learn', { detail: { kind: 'track', id: tid, step: sid, state: 'done' } })); } catch {}
    queueSync(); return true;
  }
  // with the tribe: the earliest tick wins on both sides, nothing is ever un-ticked
  let syncT = 0, synced = false;
  const merge = (a, b) => { const out = { ...(a || {}) }; for (const [t, box] of Object.entries(b || {})) { if (!box || typeof box !== 'object') continue; out[t] = { ...(out[t] || {}) }; for (const [s, at] of Object.entries(box)) { const n = Number(at) || 0; if (n && (!out[t][s] || n < out[t][s])) out[t][s] = n; } } return out; };
  async function sync() {
    if (!live() || !C().api) return false;
    try {
      const j = ls.get(), r = await C().api('/me/learn', { method: 'PUT', body: { track: j.track || {} } });
      if (r && r.track) { const k = ls.get(); k.track = merge(k.track, r.track); ls.set(k); synced = true; paintHome(); }
      return true;
    } catch { return false; }
  }
  function queueSync() { clearTimeout(syncT); syncT = setTimeout(sync, 1200); }

  // what to learn next: the lesson you are in, then the first track with steps left (the two firsts come first)
  function next() {
    const j = ls.get(), cur = j.cur && get(j.cur.t);
    if (cur && !done(cur.id)) return { track: cur, step: steps(cur).find(s => !done(cur.id, s.id)), why: 'resume' };
    const t = tracks().find(x => !done(x.id));
    return t ? { track: t, step: steps(t).find(s => !done(t.id, s.id)), why: progress(t.id).done ? 'started' : 'new' } : { track: null, step: null, why: 'all' };
  }

  // ---------- reading the real tools (the checks) ----------
  const SD = () => W.TribeSiteDesigner, AC = () => W.TribeAppCreator;
  const sstate = () => { try { const s = SD() && SD().state(); return s && s.open ? s : null; } catch { return null; } };
  const scfg = () => { try { return sstate() ? SD().cfg() : null; } catch { return null; } };
  const astate = () => { try { const s = AC() && AC().state(); return s && s.open ? s : null; } catch { return null; } };
  const adoc = () => { try { return astate() ? AC().doc() : null; } catch { return null; } };
  const count = (o, rx) => (JSON.stringify(o || {}).match(rx) || []).length;
  const blocks = c => (c && c.pages ? c.pages.reduce((n, p) => n + (p.blocks || []).length, 0) : 0);
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // p6: prefer a match nothing covers (the lesson card and open tools can hide one copy of a control); else the first with a size
  const clear = el => { const r = el.getBoundingClientRect(), x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
  const find = sel => { let first = null; for (const one of String(sel || '').split(',')) { let all = []; try { all = [...document.querySelectorAll(one.trim())].filter(visible); } catch {} const top = all.find(clear); if (top) return top; first = first || all[0] || null; } return first; };
  const LINK = /"to":"[^"]+"/g;
  function baseline() {
    const c = scfg(), d = adoc();
    return { site: c ? JSON.stringify(c) : null, theme: c ? JSON.stringify(c.theme) : null, blocks: c ? blocks(c) : null, pages: c ? c.pages.length : null, slinks: c ? count(c, LINK) : null,
      app: d ? JSON.stringify(d) : null, atheme: d ? JSON.stringify(d.theme) : null, screens: d ? (d.screens || []).length : null, alinks: d ? count(d, LINK) : null, flags: {} };
  }
  // a tool that opens after the step began: its starting point is taken then
  function topUp(b) {
    if (b.site == null && scfg()) Object.assign(b, (({ site, theme, blocks, pages, slinks }) => ({ site, theme, blocks, pages, slinks }))(baseline()));
    if (b.app == null && adoc()) Object.assign(b, (({ app, atheme, screens, alinks }) => ({ app, atheme, screens, alinks }))(baseline()));
  }
  const CHECKS = {
    'site.open': () => !!scfg(),
    'site.change': b => { const c = scfg(); return !!c && b.site != null && JSON.stringify(c) !== b.site; },
    'site.look': b => { const c = scfg(); return !!c && b.theme != null && JSON.stringify(c.theme) !== b.theme; },
    'site.section': b => { const c = scfg(); return !!c && b.blocks != null && blocks(c) > b.blocks; },
    'site.page': b => { const c = scfg(); return !!c && b.pages != null && c.pages.length > b.pages; },
    'site.link': b => { const c = scfg(); return !!c && b.slinks != null && JSON.stringify(c) !== b.site && count(c, LINK) !== b.slinks; },
    'site.phone': () => { const s = sstate(); return !!s && s.dev === 'phone'; },
    'site.check': () => { const s = sstate(); return !!s && s.panel === 'check'; },
    'site.comment': () => { const s = sstate(); return !!s && !!s.cmode; },
    'site.out': b => !!b.flags.out,
    'app.open': () => !!adoc(),
    'app.change': b => { const d = adoc(); return !!d && b.app != null && JSON.stringify(d) !== b.app; },
    'app.screen': b => { const d = adoc(); return !!d && b.screens != null && (d.screens || []).length > b.screens; },
    'app.link': b => { const d = adoc(); return !!d && b.alinks != null && count(d, LINK) > b.alinks; },
    'app.play': () => { const s = astate(); return !!s && s.mode === 'play'; },
    'app.look': b => { const d = adoc(); return !!d && b.atheme != null && JSON.stringify(d.theme) !== b.atheme; },
    'app.export': b => !!b.flags.export,
    'phone.open': () => { try { return !!(W.TribeHomescreen && W.TribeHomescreen.state()); } catch { return false; } },
    'cowork.on': () => { try { return !!(W.TribeCowork && W.TribeCowork.active() && W.TribeCowork._peers().length); } catch { return false; } },
    'publish.done': b => !!b.flags.publish,
  };
  const passes = (name, b) => { if (!name) return false; if (name.startsWith('dom:')) return !!find(name.slice(4)); const f = CHECKS[name]; try { return !!(f && f(b)); } catch { return false; } };

  // ---------- opening the place a step happens in ----------
  const closeSite = () => { try { if (sstate()) SD().close(); } catch {} };
  const closeApp = () => { try { if (astate()) AC().close(); } catch {} };
  const call = (g, m, ...a) => { try { const o = W[g]; if (o && typeof o[m] === 'function') return o[m](...a); } catch {} };
  const OPEN = {
    sitelib: () => { closeApp(); if (!scfg()) (W.TribeSiteLib ? call('TribeSiteLib', 'open', { pid: pid() }) : call('TribeSiteDesigner', 'open', { pid: pid() })); },
    site: () => { closeApp(); if (!scfg()) call('TribeSiteDesigner', 'open', { pid: pid() }); },
    design: () => { closeSite(); if (!adoc()) call('TribeDesignFlow', 'open', {}); },
    app: () => { closeSite(); if (!adoc()) call('TribeAppCreator', 'open', { pid: pid() }); },
    phone: () => { closeSite(); closeApp(); call('TribeHomescreen', 'open'); },
    invite: () => { closeSite(); closeApp(); call('TribeApp', 'openInvite', { who: 'friend' }); },
    roles: () => { closeSite(); closeApp(); call('TribeShell', 'go', 'chat'); },
    changes: () => { call('TribeChanges', 'sheet'); },
    versions: () => { closeSite(); closeApp(); call('TribeVersions', 'open'); },
    publish: () => { closeSite(); closeApp(); if (W.TribePublish) call('TribePublish', 'open'); else call('TribeShell', 'go', 'home'); },
    suggest: () => { call('TribeSuggest', 'open'); },
    library: () => { call('TribeAssetLib', 'open'); },
    home: () => { closeSite(); closeApp(); call('TribeShell', 'go', 'home'); },
    where: () => { closeSite(); closeApp(); call('TribeWhere', 'open'); },
  };
  function leave() { try { if (W.TribeMarket && W.TribeMarket.unpage) W.TribeMarket.unpage(); if (Q() && Q().close) Q().close(); if (W.TribeGuide && W.TribeGuide.isOpen && W.TribeGuide.isOpen()) W.TribeGuide.close(); if (W.TribeHelp && W.TribeHelp.close) W.TribeHelp.close(); } catch {} }
  // Show me: open the place, then ring the real control. Answers whether something was ringed.
  function show(tid, sid) {
    const t = get(tid), s = t && t.steps.find(x => x.id === sid), L = W.TribeFlintLessons;
    if (!s || !s.show || !L) return Promise.resolve(false);
    leave();
    if (s.show.open !== 'sitelib') call('TribeSiteLib', 'close');   // pass 4 polish: the template shelf from an earlier step no longer sits over the next step's place
    if (!find(s.show.sel)) { try { (OPEN[s.show.open] || (() => {}))(); } catch {} }
    return new Promise(res => {
      const gn = L.begin ? L.begin() : null; let n = 0, sel = s.show.sel, alt = false; const tick = () => { if (gn != null && !L.live(gn)) return res(false); const el = find(sel); if (el) { L.ring(el, T(s.text), gn); return res(true); } if (n === 12 && !alt && L.phoneAlt) { const a = L.phoneAlt(sel); if (a) { alt = true; sel = a; } } /* p6: the phone's version of a control */ if (++n < 45) setTimeout(tick, 130); else { if (W.TribeApp && W.TribeApp.toast) W.TribeApp.toast(T(pid() ? 'That is not on screen yet. Do the earlier steps first, then try Show me again.' : 'Open a project first, then try Show me again.'), 'warn'); res(false); } };
      setTimeout(tick, 200);
    });
  }

  // ---------- the lesson card ----------
  let st = null, card = null, loop = 0;   // st = { t, i, base, small, fin }
  const state = () => (st ? { track: st.t.id, step: (curStep() || {}).id || '', small: !!st.small, finished: !!st.fin } : null);
  const curStep = () => (st ? steps(st.t)[st.i] : null);
  function remember() { const j = ls.get(); if (st && !st.fin) j.cur = { t: st.t.id, s: (curStep() || {}).id }; else delete j.cur; ls.set(j); }
  function ensureCard() {
    if (card && card.isConnected) return card;
    card = document.createElement('aside'); card.id = 'les-card'; card.className = 'les-card'; card.setAttribute('aria-label', T('Lesson'));
    card.addEventListener('click', e => {
      const b = e.target.closest('[data-les]'); if (!b) return;
      const a = b.dataset.les;
      if (a === 'show') { const s = curStep(); if (s) show(st.t.id, s.id); }
      else if (a === 'next') tickStep(true);
      else if (a === 'back') { if (st.i > 0) { st.i--; begin(); } }
      else if (a === 'small') { st.small = !st.small; paint(); }
      else if (a === 'close') stop();
      else if (a === 'start') start(b.dataset.id);
    });
    document.body.appendChild(card); return card;
  }
  function paint() {
    if (!st) return; ensureCard();
    const all = steps(st.t), s = all[st.i];
    card.classList.toggle('is-small', !!st.small); card.dataset.track = st.t.id; card.dataset.step = s ? s.id : '';
    if (st.fin) {
      const n = next();
      card.innerHTML = `<header><span class="eyebrow">${esc(T('Lesson finished'))}</span><button type="button" class="les-x" data-les="close" aria-label="${esc(T('Close the lesson'))}">${ic('x', 14)}</button></header>
        <h4>${esc(T(st.t.title))}</h4><p>${esc(T('You did every step. It is ticked on your Learn page.'))}</p>
        <div class="les-acts">${n.track ? `<button type="button" class="btn primary sm" data-les="start" data-id="${esc(n.track.id)}">${esc(F('Next: {name}', { name: T(n.track.title) }))}</button>` : ''}<button type="button" class="btn sm" data-les="close">${esc(T('Close'))}</button></div>`;
      return;
    }
    if (st.small) { card.innerHTML = `<button type="button" class="les-pill" data-les="small" aria-label="${esc(T('Open the lesson'))}">${ic('flag', 14)}<span>${esc(T('Lesson'))} ${st.i + 1}/${all.length}</span></button>`; return; }
    card.innerHTML = `<header><span class="eyebrow">${esc(T(st.t.title))} · ${st.i + 1}/${all.length}</span><span class="les-hb"><button type="button" class="les-x" data-les="small" aria-label="${esc(T('Make the lesson small'))}">–</button><button type="button" class="les-x" data-les="close" aria-label="${esc(T('Close the lesson'))}">${ic('x', 14) || '×'}</button></span></header>
      <div class="les-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${all.length}" aria-valuenow="${st.i}"><span style="width:${Math.round(st.i / all.length * 100)}%"></span></div>
      <h4>${esc(T(s.title))}</h4><p>${esc(T(s.text))}</p>
      <p class="les-ok" hidden>${ic('check', 14)} ${esc(T('Done'))}</p>
      <div class="les-acts"><button type="button" class="btn primary sm" data-les="show">${esc(T('Show me'))}</button><button type="button" class="btn sm" data-les="next">${esc(T(st.i + 1 < all.length ? 'Done, next' : 'Done'))}</button>${st.i > 0 ? `<button type="button" class="linkish" data-les="back">${esc(T('Back'))}</button>` : ''}</div>`;
  }
  const hits = (r, q) => !(r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom);
  // the card never sits on the control its step is about: it moves to the other side (to the top on phones) when it would
  function dodge() {
    if (!st || st.fin || !card || !card.isConnected) return;
    const s = curStep(), el = s && s.show && find(s.show.sel); if (!el) return;
    const q = el.getBoundingClientRect(); if (q.width > innerWidth * 0.6 && q.height > innerHeight * 0.5) return;   // a whole page or phone: nowhere is clear, stay put
    if (!hits(card.getBoundingClientRect(), q)) return;
    card.classList.toggle('is-alt');
    if (hits(card.getBoundingClientRect(), q)) card.classList.toggle('is-alt');
  }
  function begin() { st.base = baseline(); st.wait = 0; remember(); paint(); dodge(); }
  function start(tid, sid) {
    const t = get(tid); if (!t) return false;
    const all = steps(t); if (!all.length) return false;
    leave();
    let i = sid ? all.findIndex(s => s.id === sid) : all.findIndex(s => !done(t.id, s.id));
    if (i < 0) i = 0;                                   // every step is ticked: do it again from the top
    st = { t, i, base: null, small: false, fin: false };
    if (!synced) queueSync();                           // first lesson on this device: bring the person's ticks from the tribe
    begin();
    clearInterval(loop); loop = setInterval(tick, 600);
    return true;
  }
  function stop() { clearInterval(loop); loop = 0; if (card) { card.remove(); card = null; } if (st && st.fin) { const j = ls.get(); delete j.cur; ls.set(j); } st = null; try { W.TribeFlintLessons && W.TribeFlintLessons.unring(); } catch {} paintHome(); }
  // one step is done (by the check, or by "Done, next")
  function tickStep(byHand) {
    if (!st || st.fin) return;
    const all = steps(st.t), s = all[st.i]; if (!s) return;
    mark(st.t.id, s.id);
    try { W.TribeFlintLessons && W.TribeFlintLessons.unring(); } catch {}
    const go = () => { if (!st) return; const rest = steps(st.t), ni = rest.findIndex((x, k) => k > st.i && !done(st.t.id, x.id)); if (ni < 0) { st.fin = true; remember(); paint(); } else { st.i = ni; begin(); } };
    if (byHand) return go();
    const ok = card && card.querySelector('.les-ok'); if (ok) ok.hidden = false;
    st.wait = 1; setTimeout(go, 900);
  }
  function tick() {
    seeSoon();
    if (!st || st.fin || st.wait) return;
    if (card && card.inert) card.inert = false;          // a full-screen tool makes the page behind it inert; the lesson stays usable
    if (card && !card.isConnected) document.body.appendChild(card);
    const s = curStep(); if (!s) return;
    topUp(st.base); dodge();
    if (passes(s.check, st.base)) tickStep(false);
  }
  // a control another branch added is on screen: its step joins the track from now on
  function seeSoon() {
    const h = have(); let ch = false;
    for (const t of raw()) for (const s of t.steps) { if (s.soon && !h[`${t.id}/${s.id}`] && s.show && find(s.show.sel)) { h[`${t.id}/${s.id}`] = 1; ch = true; } }
    if (ch) { const j = ls.get(); j.have = h; ls.set(j); if (st) paint(); paintHome(); }
  }
  // clicks and events a check cannot read from the tools' state
  document.addEventListener('click', e => {
    if (!st || !st.base || !e.target.closest) return;
    if (e.target.closest('.wdz-dl, #wdz-dlmenu')) st.base.flags.out = true;
    if (e.target.closest('#apc-export')) st.base.flags.export = true;
  }, true);
  document.addEventListener('tribe:publish-real', e => { const d = e.detail || {}; if (st && st.base && (d.play || (d.dest && Object.keys(d.dest).length))) { st.base.flags.publish = true; st.base.flags.out = true; } note('publish'); });

  // ---------- the Learn page ----------
  const trackHTML = (t, nextId) => {
    const p = progress(t.id), fin = p.all && p.done === p.all, on = st && st.t.id === t.id;
    return `<article class="les-track${t.id === nextId ? ' is-next' : ''}" data-les-track="${esc(t.id)}"><div class="les-th"><b>${esc(T(t.title))}</b>${fin ? `<span class="les-fin">${ic('check', 12)} ${esc(T('Done'))}</span>` : `<small>${p.done}/${p.all} · ${t.mins || 5} min</small>`}</div>
      <p>${esc(T(t.intro))}</p><div class="les-bar"><span style="width:${p.all ? Math.round(p.done / p.all * 100) : 0}%"></span></div>
      <button type="button" class="btn sm${t.id === nextId ? ' primary' : ''}" data-les-start="${esc(t.id)}">${esc(T(on ? 'Carry on' : fin ? 'Do it again' : p.done ? 'Carry on' : 'Start'))}</button></article>`;
  };
  function homeHTML() {
    const ts = tracks(); if (!ts.length) return '';
    const n = next(), nid = n.track ? n.track.id : '';
    return `<section class="les-home" id="les-home"><div class="les-hh"><h2>${esc(T('Lessons'))}</h2><span class="les-count">${ts.filter(t => done(t.id)).length} ${esc(T('of'))} ${ts.length} ${esc(T('done'))}</span></div>
      <p class="les-lead">${esc(T('Short lessons you do in the real tool. Each step shows you where to click and ticks itself when you have done it.'))}</p>
      ${n.track ? `<p class="les-next"><span class="eyebrow">${esc(T('Next lesson'))}</span> <b>${esc(T(n.track.title))}</b>${n.step ? ` · ${esc(T(n.step.title))}` : ''}</p>` : ''}
      <div class="les-tracks">${ts.map(t => trackHTML(t, nid)).join('')}</div></section>`;
  }
  function paintHome() { const el = document.getElementById('les-home'); if (el) el.outerHTML = homeHTML(); }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-les-start]'); if (b) { e.preventDefault(); start(b.dataset.lesStart); } });
  document.addEventListener('tribe:learn', e => { if (e.detail && e.detail.kind === 'track') paintHome(); });

  // ---------- first run in a creator: one small offer, once ----------
  // It sits in the tool's own "nothing selected" panel, in the page flow, so it never covers a control.
  const FIRST = [
    { host: '#wdz-insp', tid: 'first-site', ok: () => { const x = sstate(); return !!x && !x.sel && x.panel === 'edit'; } },
    { host: '#apc-insp', tid: 'first-app', ok: () => { const x = astate(); return !!x && !x.sel && x.mode !== 'play' && !x.mobile; } },
  ];
  const offered = tid => { const j = ls.get(); return !!(j.off || {})[tid] || progress(tid).done > 0; };
  let offerObs = null, offerT = 0;
  function offer() {
    for (const f of FIRST) {
      const host = document.querySelector(f.host), t = get(f.tid); if (!host || !t) continue;
      const cur = host.querySelector('.les-offer');
      if (offered(f.tid) || st || !f.ok()) { if (cur) cur.remove(); continue; }
      if (cur) continue;
      const el = document.createElement('div'); el.className = 'les-offer'; el.dataset.track = f.tid;
      el.innerHTML = `<span>${esc(T('New here?'))} <b>${esc(T(t.title))}</b> · ${t.mins || 10} min</span><span class="les-offer-b"><button type="button" class="btn sm primary" data-les-go>${esc(T('Take the lesson'))}</button><button type="button" class="btn sm" data-les-no>${esc(T('No thanks'))}</button></span>`;
      el.addEventListener('click', e => { const no = e.target.closest('[data-les-no]'), go = e.target.closest('[data-les-go]'); if (!no && !go) return; const k = ls.get(); k.off = k.off || {}; k.off[f.tid] = Date.now(); ls.set(k); el.remove(); if (go) start(f.tid); });
      host.appendChild(el);
    }
    if (offerObs && tracks().length && FIRST.every(f => offered(f.tid))) { offerObs.disconnect(); offerObs = null; }   // nothing left to offer: stop watching
  }
  // watch only the two tools' own boxes (they are added to the page when first opened), never the whole app
  const later = () => { clearTimeout(offerT); offerT = setTimeout(offer, 300); };
  const watched = new WeakSet();
  function watchTools() { if (!offerObs) return; for (const sel of ['#wdz', '#apc']) { const r = document.querySelector(sel); if (r && !watched.has(r)) { watched.add(r); offerObs.observe(r, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); later(); } } }
  try { offerObs = new MutationObserver(later); new MutationObserver(watchTools).observe(document.body, { childList: true }); watchTools(); } catch {}

  // ---------- gentle suggestions after natural moments (the Suggestions engine, provider "learn") ----------
  function note(what) { const j = ls.get(); j.moments = j.moments || {}; if (!j.moments[what]) { j.moments[what] = Date.now(); ls.set(j); try { W.TribeSuggest && W.TribeSuggest.run && W.TribeSuggest.run({ providers: ['learn'] }); } catch {} } }
  addEventListener('tribe:site-draft', () => note('save'));
  const friends = () => { try { const s = C().state(), me = s.me; return (s.members || []).filter(m => m.role !== 'agent' && (!me || m.id !== me.id)).length; } catch { return 0; } };
  const suggestProvider = {
    id: 'learn', title: 'Lessons',
    async gather() { if (Q() && Q().load) await Q().load(); if (friends() > 0) note('friend'); return { moments: ls.get().moments || {}, off: ls.get().off || {} }; },
    async suggest(ctx, g) {
      if (!g || st) return [];
      const m = g.moments, pick = m.friend && !done('together') ? ['together', 'A friend joined. This shows how to see each other and agree on changes.']
        : m.publish && !done('power') ? ['power', 'You published. These tools save time on the next round.']
        : m.save && !done('online') ? ['online', 'You saved a design. This takes it from your computer to a public address.'] : null;
      const t = pick && get(pick[0]); if (!t || progress(t.id).done) return [];
      return [{ id: `lesson-${t.id}`, kind: 'learn', title: F('Lesson: {name}', { name: T(t.title) }), why: T(pick[1]), from: [{ kind: 'learn', ref: t.id, who: 'Flint' }],
        apply: async () => { start(t.id); return async () => { stop(); }; } }];
    },
  };
  function registerSuggest() { const S = W.TribeSuggest; if (S && typeof S.register === 'function' && !registerSuggest.done) { registerSuggest.done = true; try { S.register(suggestProvider); } catch {} } }
  registerSuggest(); addEventListener('load', registerSuggest); document.addEventListener('tribe:suggest-ready', registerSuggest);

  // ---------- Flint (no AI): "teach me to make a website", "lessons", "what should I learn next" ----------
  // what was asked is read by Flint's own rules (flintnlu.js trackOf), so the app and Flint's test set agree
  const startAct = t => [F('Start: {name}', { name: T(t.title) }), 'lesson', t.id];
  async function run(what) {
    if (Q() && Q().load) await Q().load();
    if (!tracks().length) return null;
    if (what === 'stop') { if (!st) return { text: T('No lesson is open.'), acts: [] }; stop(); return { text: T('Lesson paused. Your ticks are kept; say “lessons” to carry on.'), acts: [] }; }
    if (what === 'list') return { text: `${T('Lessons you do in the real tool:')} ${tracks().map(x => `${T(x.title)} (${progress(x.id).done}/${progress(x.id).all})`).join(', ')}.`, acts: tracks().filter(x => !done(x.id)).slice(0, 3).map(startAct) };
    if (what === 'next') {
      const n = next(); if (!n.track) return { text: T('You did every step. It is ticked on your Learn page.'), acts: [[T('All lessons'), 'guide', '']] };
      return { text: n.why === 'new' ? F('Start with the lesson “{name}”: {intro}', { name: T(n.track.title), intro: T(n.track.intro) }) : F('You are in the lesson “{name}”. Next step: {step}.', { name: T(n.track.title), step: n.step ? T(n.step.title) : '' }), acts: [[T(n.why === 'new' ? 'Start the lesson' : 'Carry on'), 'lesson', n.track.id], [T('All lessons'), 'guide', '']] };
    }
    const tr = get(what);
    if (!tr) return { text: T('I do not have a lesson by that name. These are the lessons:'), acts: tracks().slice(0, 4).map(startAct) };
    start(tr.id);
    const s = curStep();
    return { text: F('Lesson started: {name}. Step 1 of {n}: {step}. The card on screen shows each step; press Show me when you are not sure where to click.', { name: T(tr.title), n: steps(tr).length, step: s ? T(s.title) : '' }), acts: [] };
  }
  async function flint(text) { const NL = W.TribeNLU, what = NL && NL.trackOf ? NL.trackOf(text) : null; return what ? run(what) : null; }

  // Ctrl K
  (W.TribePaletteActions = W.TribePaletteActions || []).push(() => tracks().map(t => ({ kind: 'Lesson', label: `Lesson: ${t.title}`, keys: `learn teach lesson ${(t.asks || []).join(' ')}`, hint: 'Lesson', run: () => start(t.id) })));

  const kick = () => { if (Q() && Q().load) Q().load().then(() => { sync(); offer(); }).catch(() => {}); };
  if (document.readyState === 'complete') setTimeout(kick, 1500); else addEventListener('load', () => setTimeout(kick, 1500));
  W.TribeLessons = { tracks, get, steps, start, stop, state, progress, done, mark, next, show, homeHTML, flint, run, suggestProvider, sync, CHECKS: Object.keys(CHECKS), _synced: () => synced, _all: raw, _see: seeSoon };
})();
