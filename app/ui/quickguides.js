// Quick guides and learning progress (feat/learn, docs/LEARN-ASSESSMENT.md).
// One-screen "How do I…" cards: a line on why, 3 to 5 steps, "Do it for me" and "Show me". The cards live in ONE file,
// templates/quickguides.json, which the server hands out with the Guide (/api/guide -> quick), the app bundles
// (guide-pages.json), Flint's knowledge base indexes (server/flintkb.js) and the website shows (site/quick-guides.json).
//   window.TribeQuick = { load(), all(), get(id), groups(), search(q), match(text), open(id?), run(id), show(id),
//                         homeHTML(), flint(text), answer(text), forKind(kind) }
//   window.TribeLearn = { get(), mark(kind, id, state), done(kind, id), counts(), next(), resume(), summaryHTML() }
// The matcher (norm, score, match) is shared with node: require('app/ui/quickguides.js').match(guides, text).
// Progress is kept on this device (localStorage tribecode.learn). Academy progress stays on the server (server/academy.js).
(function (root, factory) { const core = factory(); if (typeof module === 'object' && module.exports) module.exports = core; else root.TribeQuickCore = core; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const STOP = new Set('a an the to of in on at for and or is are be do does did how what why where when can could should would i me my we our you your it this that with get use want need please way there some any so into from about by as if will'.split(' '));
  const stem = w => (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w.length > 3 ? w.replace(/s$/, '') : w);
  const words = s => String(s || '').toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w)).map(stem);
  let cacheFor = null, cache = null;
  function index(guides) {
    if (cacheFor === guides && cache) return cache;
    const df = new Map(), docs = guides.map(g => { const ph = [g.title, ...(g.asks || [])].map(words); const all = new Set(ph.flat()); all.forEach(w => df.set(w, (df.get(w) || 0) + 1)); return { g, ph }; });
    const idf = w => Math.log(1 + guides.length / (1 + (df.get(w) || 0)));
    cacheFor = guides; return (cache = { docs, idf });
  }
  // score(question, phrase): weighted overlap of the real words, 0..1. A card matches on its title or any of its asks.
  function match(guides, text, min) {
    const q = [...new Set(words(text))]; if (!q.length || !guides || !guides.length) return null;
    const { docs, idf } = index(guides), qn = q.reduce((n, w) => n + idf(w) ** 2, 0);
    let best = null, second = 0;
    for (const d of docs) {
      let s = 0;
      for (const p of d.ph) { const ps = new Set(p); if (!ps.size) continue; const dot = q.filter(w => ps.has(w)).reduce((n, w) => n + idf(w) ** 2, 0), pn = [...ps].reduce((n, w) => n + idf(w) ** 2, 0); const c = dot / Math.sqrt(qn * pn || 1); if (c > s) s = c; }
      if (!best || s > best.score) { second = best ? best.score : 0; best = { guide: d.g, score: s }; } else if (s > second) second = s;
    }
    if (!best || best.score < (min == null ? 0.58 : min)) return null;
    return { ...best, second };
  }
  const card = g => `${g.title}. ${g.intro || ''} ${(g.steps || []).map((s, i) => `${i + 1}. ${s}`).join(' ')}`;
  const core = { words, match, card };
  if (typeof document === 'undefined') return core;

  // ------------------------------------------------------------------ the browser half
  const W = window, $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (W.TribeI18n && W.TribeI18n.t ? W.TribeI18n.t(s, s) || s : s);
  const ic = (n, z) => (W.TribeIcons && W.TribeIcons.svg ? W.TribeIcons.svg(n, z || 16) : '');
  const toast = t => W.TribeApp && W.TribeApp.toast && W.TribeApp.toast(T(t));
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  let DATA = null, loading = null;
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (loading) return loading;
    const C = W.TribeClient, live = C && C.connected && C.connected();
    const from = url => fetch(url).then(r => (r.ok ? r.json() : null)).then(j => (j && j.quick && j.quick.guides ? j.quick : null)).catch(() => null);
    loading = (live ? from(C.base() + '/api/guide') : Promise.resolve(null)).then(q => q || (location.protocol === 'file:' ? null : from('guide-pages.json'))).then(q => { DATA = q || { guides: [], groups: [], labels: {} }; loading = null; return DATA; });
    return loading;
  }
  // "never name a feature the UI doesn't show": a card that needs a part of the app is listed only when that part is here
  const has = g => !g.needs || !!W[g.needs];
  const all = () => (DATA ? DATA.guides.filter(has) : []);
  const get = id => all().find(g => g.id === id) || null;
  const groups = () => (DATA ? (DATA.groups || []).map(([id, name]) => ({ id, name, guides: all().filter(g => g.group === id) })).filter(x => x.guides.length) : []);
  // {tokens} in a step: the live control's own words when it is on screen, a Settings tab's current name, else the text in the file
  function label(key) {
    const L = (DATA && DATA.labels || {})[key]; if (!L) return key;
    if (L.sel) { const el = [...document.querySelectorAll(L.sel)].find(x => x.offsetParent !== null); const t = el && (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' '); if (t && t.length <= 40) return t; }
    if (L.tab && W.TribeSettings && W.TribeSettings.tabs) { try { const t = W.TribeSettings.tabs().find(x => x.id === L.tab); if (t) return T(t.label); } catch {} }
    return T(L.text);
  }
  const fill = s => T(s).replace(/\{([a-z]+)\}/g, (m, k) => label(k));

  // ---------- progress, on this device ----------
  const KEY = 'tribecode.learn';
  const P = () => { try { const j = JSON.parse(ls.get(KEY) || '{}'); return { quick: j.quick || {}, lesson: j.lesson || {}, step: j.step || {}, last: j.last || null }; } catch { return { quick: {}, lesson: {}, step: {}, last: null }; } };
  function mark(kind, id, state) {
    if (!id) return; const p = P(), box = p[kind] || (p[kind] = {}), cur = box[id] || {};
    if (state === 'done') cur.done = cur.done || Date.now(); else cur.seen = cur.seen || Date.now();
    box[id] = cur; if (kind === 'quick') p.last = { kind, id }; ls.set(KEY, JSON.stringify(p));
    document.dispatchEvent(new CustomEvent('tribe:learn', { detail: { kind, id, state } }));
  }
  const done = (kind, id) => !!((P()[kind] || {})[id] || {}).done;
  const counts = () => { const p = P(), a = all(); return { quick: a.filter(g => (p.quick[g.id] || {}).done).length, quickSeen: a.filter(g => p.quick[g.id]).length, quickAll: a.length, lessons: Object.keys(p.lesson).length }; };
  // a step of the project journey (nextstep.js) and the card that teaches it. Doing the step is learning it.
  const STEP_GUIDE = { start: 'start-project', vision: 'write-idea', task: 'add-task', design: 'make-design', build: 'see-running', check: 'check-first', publish: 'publish', share: 'invite-friend', invite: 'invite-friend', ai: 'bring-ai', company: 'run-company' };
  const CORE = ['start-project', 'write-idea', 'invite-friend', 'add-task', 'make-site', 'see-running', 'bring-ai', 'publish', 'back-up', 'start-call', 'vote', 'older-version'];
  document.addEventListener('tribe:nextstep', e => { const id = STEP_GUIDE[e.detail && e.detail.id]; if (id) mark('quick', id, 'done'); });
  function resume() { const p = P(); return p.last && !done(p.last.kind, p.last.id) ? get(p.last.id) : null; }
  // what to learn next: the card you left open, then the one for your project's next step, then the basics in order
  async function next() {
    await load();
    const r = resume(); if (r) return { guide: r, why: 'resume' };
    try { const NS = W.TribeNextStep; if (NS && NS.next) { const n = await NS.next(), g = n && n.best && get(STEP_GUIDE[n.best.id]); if (g && !done('quick', g.id)) return { guide: g, why: 'project' }; } } catch {}
    const g = [...CORE.map(get).filter(Boolean), ...all()].find(x => !done('quick', x.id));
    return g ? { guide: g, why: 'basics' } : { guide: null, why: 'all' };
  }

  // ---------- Do it for me / Show me ----------
  const go = key => { try { const sh = W.TribeShell; if (W.TribeMarket && W.TribeMarket.unpage && key !== 'market') W.TribeMarket.unpage(); if (sh && sh.go) return sh.go(key); if (W.TribeApp && W.TribeApp.show) W.TribeApp.show(key); } catch {} };
  const fn = a => { const [g, m] = String(a).split('.'); const o = W[g]; return o && typeof o[m] === 'function' ? () => o[m]() : null; };
  const RUN = {
    next: a => W.TribeNextStep && (a === 'open' ? W.TribeNextStep.open() : W.TribeNextStep.act(a)),
    help: a => W.TribeHelp && W.TribeHelp.run(a),
    go,
    settings: a => W.TribeSettings && W.TribeSettings.open(a),
    call: a => { const f = fn(a); if (f) f(); },
    click: a => { const el = $(a); if (el) el.click(); },
    ask: a => { const F = W.TribeFlint; if (F && F.ask) { if (F.focus) F.focus(); F.ask(a); } },
    path: a => W.TribeGuide && W.TribeGuide.path && W.TribeGuide.path(a),
  };
  const split = s => { const i = String(s || '').indexOf(':'); return i < 0 ? [String(s || ''), ''] : [s.slice(0, i), s.slice(i + 1)]; };
  function canDo(g) { const [k, a] = split(g.do); if (!RUN[k]) return false; if (k === 'call') return !!fn(a); if (k === 'click') return !!$(a); if (k === 'next') return !!W.TribeNextStep; if (k === 'help') return !!W.TribeHelp; if (k === 'settings') return !!W.TribeSettings; if (k === 'ask') return !!W.TribeFlint; return true; }
  function leave(keepGuide) { closeSheet(); if (!keepGuide && W.TribeGuide && W.TribeGuide.isOpen && W.TribeGuide.isOpen()) W.TribeGuide.close(); if (W.TribeHelp && W.TribeHelp.close) W.TribeHelp.close(); }
  function run(id) {
    const g = get(id); if (!g || !canDo(g)) return false;
    const [k, a] = split(g.do); leave(k === 'path');
    mark('quick', id, 'done');
    try { RUN[k](a); } catch {}
    return true;
  }
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const find = sel => { for (const one of String(sel).split(',')) { const el = [...document.querySelectorAll(one.trim())].find(visible); if (el) return el; } return null; };
  function show(id) {
    const g = get(id), L = W.TribeFlintLessons; if (!g || !g.show || !L) return false;
    const s = g.show; leave(false); mark('quick', id, 'seen');
    if (s.lesson) { L.showMe(s.lesson); return true; }
    try { if (s.settings) RUN.settings(s.settings); else if (s.call) RUN.call(s.call); else if (s.go) go(s.go); } catch {}
    let n = 0; const tick = () => { const el = find(s.sel); if (el) return L.ring(el, T(s.say)); if (++n < 30) setTimeout(tick, 120); else toast('Open a project first, then try Show me again.'); };
    setTimeout(tick, 180);
    return true;
  }

  // ---------- the card and the list (TribeUI.sheet) ----------
  let sheet = null;
  function closeSheet() { if (sheet) { const s = sheet; sheet = null; s.close(); } }
  const stepsHTML = g => `<ol class="qg-steps">${g.steps.map(s => `<li>${esc(fill(s))}</li>`).join('')}</ol>`;
  const tick = id => (done('quick', id) ? `<span class="qg-done" title="${esc(T('Done'))}">${ic('check', 12)}<span class="qg-sr">${esc(T('Done'))}</span></span>` : '');
  const actsHTML = g => `${canDo(g) ? `<button type="button" class="btn primary" data-qg-do="${esc(g.id)}">${esc(T(g.doLabel || 'Do it for me'))}</button>` : ''}${g.show ? `<button type="button" class="btn" data-qg-show="${esc(g.id)}">${esc(T('Show me'))}</button>` : ''}`;
  function openCard(g) {
    closeSheet(); mark('quick', g.id, 'seen');
    const U = W.TribeUI; if (!U || !U.sheet) return;
    sheet = U.sheet({ kind: 'steps', id: 'qg-card', eyebrow: 'Quick guide', title: g.title,
      body: `<div class="qg-card" data-qg-id="${esc(g.id)}">${g.intro ? `<p class="qg-intro">${esc(T(g.intro))}</p>` : ''}${stepsHTML(g)}${done('quick', g.id) ? `<p class="qg-note">${ic('check', 12)} ${esc(T('You have done this one.'))}</p>` : ''}</div>`,
      foot: `<div class="qg-foot">${actsHTML(g)}<button type="button" class="linkish" data-qg-all>${esc(T('All quick guides'))}</button></div>`,
      onClose: () => { sheet = null; } });
  }
  function search(q) {
    const a = all(), t = String(q || '').trim().toLowerCase(); if (!t) return a;
    const qw = words(t), hit = g => { const hay = `${g.title} ${(g.asks || []).join(' ')} ${g.intro || ''} ${g.steps.join(' ')}`.toLowerCase(), hw = new Set(words(hay)); return (hay.includes(t) ? 3 : 0) + qw.filter(w => hw.has(w)).length + (qw.length && qw.every(w => [...hw].some(h => h.startsWith(w))) ? 1 : 0); };
    return a.map(g => [hit(g), g]).filter(x => x[0] > 0).sort((x, y) => y[0] - x[0]).map(x => x[1]);
  }
  const rowHTML = g => `<button type="button" class="qg-row" data-qg="${esc(g.id)}"><span class="qg-rt"><b>${esc(T(g.title))}</b><small>${g.steps.length} ${esc(T('steps'))}</small></span>${tick(g.id)}</button>`;
  function listHTML(q) {
    const t = String(q || '').trim();
    if (t) { const r = search(t); return r.length ? `<div class="qg-rows">${r.map(rowHTML).join('')}</div>` : `<p class="qg-none">${esc(T('No quick guide for that yet. Ask Flint, or search the pages below.'))}</p>`; }
    return groups().map(gr => `<h4 class="qg-g">${esc(T(gr.name))}</h4><div class="qg-rows">${gr.guides.map(rowHTML).join('')}</div>`).join('');
  }
  const searchHTML = () => `<label class="qg-search">${ic('search', 15)}<input type="search" data-qg-q placeholder="${esc(T('How do I…'))}" aria-label="${esc(T('Search quick guides'))}" autocomplete="off"></label>`;
  async function open(id) {
    await load();
    const g = id && get(id); if (g) return openCard(g);
    closeSheet(); const U = W.TribeUI; if (!U || !U.sheet) return;
    const c = counts();
    sheet = U.sheet({ kind: 'steps', id: 'qg-list', wide: true, eyebrow: 'Learn', title: 'Quick guides',
      body: `<div class="qg-list">${searchHTML()}<p class="qg-count">${c.quick} ${esc(T('of'))} ${c.quickAll} ${esc(T('done'))}</p><div class="qg-out" data-qg-out>${listHTML('')}</div></div>`, onClose: () => { sheet = null; } });
  }
  // the Learn home (guide.js) shows the same search, the cards for your next step first
  function homeHTML() {
    if (!DATA) return '';
    const a = all(), first = [...CORE.map(get).filter(Boolean)].filter(g => !done('quick', g.id)).slice(0, 6), pickd = first.length ? first : a.slice(0, 6), c = counts();
    return `<section class="qg-home" id="qg-home"><div class="qg-hh"><h2>${esc(T('Quick guides'))}</h2><span class="qg-count">${c.quick} ${esc(T('of'))} ${c.quickAll} ${esc(T('done'))}</span></div>
      <p class="qg-lead">${esc(T('One screen each: a few steps, a button that does it for you, and Show me.'))}</p>${searchHTML()}
      <div class="qg-out" data-qg-out data-qg-short="1"><div class="qg-rows">${pickd.map(rowHTML).join('')}</div></div>
      <button type="button" class="linkish qg-more" data-qg-all>${esc(T('All quick guides'))} (${a.length})</button></section>`;
  }
  // "My progress": the one summary of what you have learned, on the Learn home
  function summaryHTML(extra) {
    const c = counts(), r = resume();
    return `<section class="qg-prog" id="qg-prog" aria-label="${esc(T('My progress'))}"><span class="eyebrow">${esc(T('My progress'))}</span>
      <div class="qg-stats"><div><b>${c.quick}<i>/${c.quickAll}</i></b><small>${esc(T('Quick guides done'))}</small></div>${extra || ''}</div>
      <div class="qg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${c.quickAll}" aria-valuenow="${c.quick}"><span style="width:${c.quickAll ? Math.round(c.quick / c.quickAll * 100) : 0}%"></span></div>
      <button type="button" class="btn sm" data-qg-next>${esc(T(r ? 'Carry on where I stopped' : 'What should I learn next?'))}</button></section>`;
  }
  async function openNext() { const n = await next(); if (n.guide) openCard(n.guide); else toast('You have done every quick guide. The skills lessons are next.'); }

  document.addEventListener('click', e => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    let b;
    if ((b = t.closest('[data-qg-do]'))) { e.preventDefault(); return void run(b.dataset.qgDo); }
    if ((b = t.closest('[data-qg-show]'))) { e.preventDefault(); return void show(b.dataset.qgShow); }
    if ((b = t.closest('[data-learn-home]'))) { e.preventDefault(); return void (W.TribeGuide && W.TribeGuide.home && W.TribeGuide.home()); }   // the skills reader's way back to Learn
    if ((b = t.closest('[data-qg-all]'))) { e.preventDefault(); return void open(); }
    if ((b = t.closest('[data-qg-next]'))) { e.preventDefault(); return void openNext(); }
    if ((b = t.closest('[data-qg]'))) { e.preventDefault(); return void open(b.dataset.qg); }
  });
  document.addEventListener('input', e => {
    const i = e.target; if (!i || !i.matches || !i.matches('[data-qg-q]')) return;
    const out = i.closest('.qg-list, .qg-home'); const box = out && out.querySelector('[data-qg-out]'); if (!box) return;
    const q = i.value.trim();
    box.innerHTML = q || !box.dataset.qgShort ? listHTML(q) : `<div class="qg-rows">${all().slice(0, 6).map(rowHTML).join('')}</div>`;
  });

  // ---------- empty states: "How it works" opens the card for that kind of place (uikit.js asks TribeUI.emptyHow) ----------
  const KIND = { tasks: 'add-task', task: 'add-task', board: 'vote', proposals: 'vote', design: 'make-design', canvas: 'make-design', files: 'add-files', docs: 'add-files', preview: 'see-running', site: 'make-site', website: 'make-site', publish: 'publish', people: 'invite-friend', friends: 'invite-friend', agents: 'bring-ai', company: 'run-company', vision: 'write-idea', calendar: 'add-date', chat: 'tell-everyone', versions: 'older-version', work: 'get-help' };
  const forKind = kind => { const id = KIND[String(kind || '').toLowerCase()]; return id && DATA && get(id) ? id : null; };
  const emptyHow = kind => { const id = forKind(kind); return id ? { label: 'How it works', attr: `data-qg="${id}"`, run: () => open(id) } : null; };
  const provide = () => { const U = W.TribeUI; if (U) U.emptyHow = emptyHow; return !!U; };
  if (!provide()) addEventListener('DOMContentLoaded', provide);

  // ---------- Ctrl K ----------
  (W.TribePaletteActions = W.TribePaletteActions || []).push(() => [
    { kind: 'Action', label: 'Quick guides', keys: 'how do i help learn guide lesson steps', run: () => open() },
    ...all().map(g => ({ kind: 'Guide', label: g.title, keys: `how do i ${(g.asks || []).join(' ')}`, hint: 'Quick guide', run: () => open(g.id) })),
  ]);

  // ---------- Flint ----------
  const cardMsg = (g, lead) => ({ text: `${lead ? lead + ' ' : ''}${T(g.title)}. ${g.intro ? T(g.intro) : ''}`.trim(),
    acts: [...(canDo(g) ? [[T(g.doLabel || 'Do it for me'), 'quickdo', g.id]] : []), ...(g.show ? [[T('Show me'), 'quickshow', g.id]] : []), [T('Open the card'), 'quick', g.id]],
    extra: { html: `<div class="qg-inline" data-qg-id="${esc(g.id)}">${stepsHTML(g)}</div>`, quick: g.id } });
  // a "how do I…" question that a card answers (Flint asks this before its page search)
  function answer(text) { if (!DATA) return null; const m = match(all(), text); if (!m) return null; mark('quick', m.guide.id, 'seen'); return cardMsg(m.guide); }
  const RX = {
    list: /^(?:(?:open|show|see|list)(?: me)?(?: the| all)? )?(?:quick )?guides\??$|^quick guides?$|^how[- ]to(?:s| guides?)$/,
    next: /^(?:what (?:should|can|do) i learn(?: next| now| first)?|what(?:'s| is) (?:the )?next (?:lesson|guide)|teach me something(?: new)?|next lesson|next guide)\??$/,
    prog: /^(?:what have i learn(?:ed|t)(?: so far)?|my (?:learning )?progress|how much have i learn(?:ed|t)|show my progress)\??$/,
    resume: /^(?:resume|continue|carry on)(?: (?:the|my))?(?: (?:lesson|guide|learning|where i (?:stopped|left off)))?$/,
    named: /^(?:open|start|show(?: me)?|give me|do|begin|run)(?: the| a)? (?:quick )?(?:guide|lesson|card)(?: (?:on|for|about|called|to))? (.{3,80})$/,
  };
  async function flint(text) {
    const t = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
    const kind = RX.list.test(t) ? 'list' : RX.next.test(t) ? 'next' : RX.prog.test(t) ? 'prog' : RX.resume.test(t) ? 'resume' : RX.named.test(t) ? 'named' : '';
    if (!kind) return null;
    await load();
    const c = counts();
    if (kind === 'list') { open(); return { text: `${T('Quick guides are open:')} ${c.quickAll} ${T('one-screen answers. Type what you want to do in the search box.')}`, acts: [[T('What should I learn next?'), 'ask', 'what should I learn next']] }; }
    if (kind === 'named') {
      const name = RX.named.exec(t)[1], m = match(all(), name, 0.4) || (search(name)[0] ? { guide: search(name)[0] } : null);
      if (m) { mark('quick', m.guide.id, 'seen'); return cardMsg(m.guide, T('Here it is:')); }
      const L = W.TribeFlintLessons, f = L && Object.keys(L.LESSONS).find(k => k === name || L.LESSONS[k].title.toLowerCase().includes(name));
      if (f && L.open(f)) { mark('lesson', f, 'seen'); return { text: `${T('Here is the lesson:')} ${L.LESSONS[f].title}.`, acts: [] }; }
      return { text: T('I do not have a guide by that name. Quick guides has a search box.'), acts: [[T('Quick guides'), 'quick', '']] };
    }
    if (kind === 'resume') { const r = resume(); if (r) return cardMsg(r, T('Carrying on:')); }
    const n = await next();
    const tally = `${T('You have done')} ${c.quick} ${T('of')} ${c.quickAll} ${T('quick guides')}.`;
    if (kind === 'prog') return { text: `${tally}${c.lessons ? ` ${c.lessons} ${T('lessons opened')}.` : ''}`, acts: [...(n.guide ? [[T('What should I learn next?'), 'ask', 'what should I learn next']] : []), [T('Open Learn'), 'guide', '']] };
    if (!n.guide) return { text: `${tally} ${T('The skills lessons are next: how to find people who want what you made, and how to run it.')}`, acts: [[T('Open Learn'), 'guide', '']] };
    const lead = n.why === 'resume' ? T('You left this one open:') : n.why === 'project' ? T('Your project is ready for this:') : `${tally} ${T('Next:')}`;
    return cardMsg(n.guide, lead);
  }

  const kick = () => { if (location.protocol !== 'file:') load().catch(() => {}); };   // opened as a file there is nothing to fetch
  if (document.readyState === 'complete') setTimeout(kick, 800); else addEventListener('load', () => setTimeout(kick, 800));
  W.TribeQuick = { load, all, get, groups, search, match: t => match(all(), t), open, close: closeSheet, run, show, homeHTML, flint, answer, forKind, label, canDo: id => { const g = get(id); return !!g && canDo(g); } };
  W.TribeLearn = { get: P, mark, done, counts, next, resume, summaryHTML, openNext, STEP_GUIDE };
  return core;
});
