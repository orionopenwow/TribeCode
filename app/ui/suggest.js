// The tribe's suggestion engine (docs/SUGGESTIONS.md): one place where ideas drawn from what the tribe does (files,
// photos, edits, chat, tasks, docs, the brand) wait for a person to say yes. Every tool adds its own provider; this
// file runs them gently, learns from the answers and draws the one Suggestions list the whole app reuses.
//
//   TribeSuggest.register({ id, title, gather(ctx) -> Promise<any>, suggest(ctx, gathered) -> Promise<[item]> })
//       ctx = { projectId, project, brand }. item = { id, title, why, from: [{ kind, ref, who }], apply() -> Promise<undoFn> }
//       optional on an item: kind, before, after, score (1 = normal), cap ('site.edit'…: who may apply), dismiss()
//   TribeSuggest.panel(box, { provider?, title? })   the list (a provider filters it: 'site', 'app', 'motion'…)
//   TribeSuggest.open({ provider? })                  the same list in a sheet
//   TribeSuggest.list(provider?) · count(provider?) · run({ asked }) · feedback(item, verdict) · why(id)
//   TribeSuggest.card(o)                              the one card (the website designer's Suggestions use it too)
//   TribeSuggest.noteEdit(e) · noteSiteEdit(before, after)   edits worth noticing (the 'edits' provider reads them)
//   TribeSuggest.flint(what, arg) -> Promise<sentence>        "what do you suggest?", "suggest less", "why that?"
//   TribeSuggest.idle() -> Promise                    resolves in the browser's next idle moment (for providers' heavy work)
//
// Gentle by design: providers run only when the browser is idle, the tab is visible, data saver and battery saver are
// off; each runs again only when what it reads changed; at most a few never-seen suggestions a day (Settings ›
// Suggestions: Gentle / Often / Off), none during quiet hours unless you ask. Nothing changes until Apply; every
// Apply has one Undo. Answers teach it (server/suggest.js keeps them for the tribe; a project on this device keeps them
// here). Photos are read on this device only and never sent anywhere.
(function () {
  'use strict';
  const C = window.TribeClient, CORE = () => window.TribeSuggestCore, S = () => window.TribeSiteCfg;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tr = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const ico = (n, z = 14) => (window.TribeIcons ? window.TribeIcons.svg(n, z) : '');
  const DAY = 864e5;

  // ---------- state ----------
  const providers = new Map();   // id -> { def, items: [], sig: '', at: 0, dirty: true, busy: false, err: '' }
  let pid = '', srv = null, srvFor = '', loadingSrv = null, asked = false, askedAt = 0, timer = 0, battery = null;
  const listeners = new Set();
  const lsKey = p => `tribecode.suggest.${p || 'local'}`;
  const local = () => { try { const v = JSON.parse(localStorage.getItem(lsKey(pid)) || 'null'); if (v && typeof v === 'object') return v; } catch {} return {}; };
  const saveLocal = v => { try { localStorage.setItem(lsKey(pid), JSON.stringify(v)); } catch {} };
  const L = () => { const v = local(); v.shown = v.shown || {}; v.log = (v.log || []).filter(t => Date.now() - t < 2 * DAY); v.later = v.later || {}; v.applied = v.applied || {}; v.edits = (v.edits || []).filter(e => Date.now() - e.at < 8 * DAY); v.cur = v.cur || {}; v.seen = v.seen || {}; return v; };
  const projectId = () => (C && C.project && C.project()) || '';
  const solo = () => !!(window.TribeOffline && window.TribeOffline.solo && window.TribeOffline.solo());
  const online = () => !!(C && C.connected && C.connected()) && !solo();
  const mode = () => { const p = window.TribePrefs && window.TribePrefs.get ? window.TribePrefs.get() : {}; return /^(gentle|often|off)$/.test(p.suggest || '') ? p.suggest : 'gentle'; };
  const quiet = () => { try { return !!(window.TribePrefs && window.TribePrefs.quiet && window.TribePrefs.quiet()); } catch { return false; } };
  const projectObj = () => { const st = C && C.state ? C.state() : {}; return ((st && st.projects) || []).find(p => p.id === projectId()) || { id: projectId() }; };
  let brandCache = { pid: '', kit: null };
  async function brand() { const p = projectId(); if (!online() || !p) return null; if (brandCache.pid === p) return brandCache.kit; try { const r = await C.api(`/projects/${encodeURIComponent(p)}/brand`); brandCache = { pid: p, kit: r && r.kit || null }; } catch { brandCache = { pid: p, kit: null }; } return brandCache.kit; }
  const ctx = async () => ({ projectId: projectId(), project: projectObj(), brand: await brand() });

  // ---------- the host's memory (or this device's, for a project kept here) ----------
  async function server(force) {
    const p = projectId();
    if (!online() || !p) { srv = null; srvFor = p; return null; }
    if (srv && srvFor === p && !force) return srv;
    if (loadingSrv && srvFor === p) return loadingSrv;
    srvFor = p;
    loadingSrv = C.api(`/projects/${encodeURIComponent(p)}/suggest`).then(r => { srv = r; return r; }).catch(() => { srv = null; return null; }).finally(() => { loadingSrv = null; });
    return loadingSrv;
  }
  const learn = () => (srv && srv.learn) || L().learn || { p: {}, k: {} };
  const dismissedSet = () => new Set([...((srv && srv.dismissed) || []), ...Object.keys(L().dismissed || {})]);
  const muted = () => (srv ? srv.muted || [] : L().muted || []);
  const canEdit = () => !srv || srv.canEdit !== false;

  // ---------- gentle scheduling ----------
  const MIN_GAP = { gentle: 8 * 60e3, often: 90e3, off: Infinity };
  function paused() {
    if (document.hidden) return 'hidden';
    const nc = navigator.connection; if (nc && nc.saveData) return 'data saver';
    if (battery && !battery.charging && battery.level < 0.2) return 'battery';
    if (mode() === 'off' && !askedLately()) return 'off';
    return '';
  }
  try { if (navigator.getBattery) navigator.getBattery().then(b => { battery = b; }).catch(() => {}); } catch {}
  const ric = window.requestIdleCallback ? (fn, t) => window.requestIdleCallback(fn, { timeout: t || 6000 }) : fn => setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: false }), 300);
  const idle = () => new Promise(r => ric(() => r(), 2000));
  function schedule(delay) { clearTimeout(timer); timer = setTimeout(() => ric(step), delay == null ? 1200 : delay); }
  async function step(deadline) {
    if (projectId() !== pid) { pid = projectId(); srv = null; providers.forEach(v => { v.items = []; v.sig = ''; v.dirty = true; v.at = 0; }); }
    if (!pid) return;
    const why = paused(); if (why) { schedule(why === 'off' ? 60e3 : 15e3); return; }
    await server();
    const gap = asked ? 0 : MIN_GAP[mode()] || MIN_GAP.gentle, now = Date.now();
    const next = [...providers.values()].find(v => v.dirty && !v.busy && (asked || now - v.at >= gap) && !muted().includes(v.def.id));
    if (!next) { const was = asked; asked = false; if (was) emit(); return; }
    if (deadline && deadline.timeRemaining && deadline.timeRemaining() < 4 && !deadline.didTimeout) { schedule(400); return; }
    next.busy = true;
    try {
      const c = await ctx();
      const got = await next.def.gather(c);
      const sig = CORE().hash(JSON.stringify(got == null ? null : got).slice(0, 200000));
      if (sig !== next.sig || asked) {
        await idle();
        const raw = got == null ? [] : await next.def.suggest(c, got);
        next.items = (Array.isArray(raw) ? raw : []).filter(x => x && x.id && x.title && typeof x.apply === 'function').slice(0, 20).map(x => normal(next.def, x));
        next.sig = sig;
      }
      next.err = '';
    } catch (e) { next.err = String(e && e.message || e); }
    next.busy = false; next.dirty = false; next.at = Date.now();
    emit();
    schedule(asked ? 50 : 600);
  }
  function normal(def, x) {
    const id = String(x.id).startsWith(def.id + ':') ? String(x.id) : `${def.id}:${x.id}`;
    return { ...x, id, provider: def.id, providerTitle: def.title, kind: x.kind || def.id, from: Array.isArray(x.from) ? x.from.filter(Boolean).slice(0, 4) : [], why: x.why || '' };
  }
  function dirty(ids) { providers.forEach((v, k) => { if (!ids || ids.includes(k)) v.dirty = true; }); schedule(); }
  function run(o = {}) { if (o.asked) { asked = true; askedAt = Date.now(); } dirty(o.providers || null); if (o.asked) { server(true); schedule(0); } return new Promise(r => { const t0 = Date.now(); const tick = () => { if ([...providers.values()].every(v => !v.dirty && !v.busy) || Date.now() - t0 > 20000) return r(list(o.provider)); setTimeout(tick, 120); }; tick(); }); }

  function register(def) {
    if (!def || !def.id || typeof def.gather !== 'function' || typeof def.suggest !== 'function') throw new Error('a provider needs id, gather and suggest');
    const id = String(def.id).replace(/[^\w-]/g, '').slice(0, 24);
    providers.set(id, { def: { ...def, id, title: def.title || id }, items: [], sig: '', at: 0, dirty: true, busy: false, err: '' });
    schedule();
    return () => { providers.delete(id); emit(); };
  }

  // ---------- what is shown: ranked by what the tribe answered, new ones let in slowly ----------
  function proposals() {
    return ((srv && srv.proposed) || []).map(p => normal({ id: 'ai', title: 'Ideas from people and AI helpers' }, { id: p.id, kind: p.kind, title: p.title, why: p.why || '', from: p.from || [], score: 1.1, action: p.action, apply: () => doAction(p.action, p) }));
  }
  // asked lately: "Look again", Flint or a tool's own panel; Off still shows what was asked for, for ten minutes
  const askedLately = () => asked || Date.now() - askedAt < 10 * 60e3;
  function list(provider) {
    const v = L(), now = Date.now();
    if (mode() === 'off' && !askedLately()) return [];
    const all = [...providers.values()].flatMap(x => x.items).concat(proposals())
      .filter(x => (!provider || x.provider === provider) && !v.applied[x.id] && !(v.later[x.id] && now - v.later[x.id] < 3 * DAY));
    const ranked = CORE().rank(all, { learn: learn(), dismissed: dismissedSet(), muted: muted(), now });
    let room = CORE().allowNew(v.log, { mode: mode(), now, quiet: quiet(), asked: askedLately() || !!provider }), changed = false;
    const out = ranked.filter(x => { if (v.shown[x.id]) return true; if (room <= 0) return false; room--; v.shown[x.id] = now; v.log.push(now); changed = true; return true; });
    if (changed) { const ks = Object.keys(v.shown); if (ks.length > 400) ks.sort((a, b) => v.shown[a] - v.shown[b]).slice(0, ks.length - 400).forEach(k => delete v.shown[k]); saveLocal(v); }
    return provider ? out.filter(x => x.provider === provider) : out;
  }
  const count = provider => list(provider).length;
  function emit() { listeners.forEach(fn => { try { fn(); } catch {} }); paintAll(); }
  const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  // ---------- answers ----------
  async function feedback(item, verdict) {
    const v = L();
    if (verdict === 'later') { v.later[item.id] = Date.now(); saveLocal(v); }
    if (verdict === 'yes') { v.applied[item.id] = Date.now(); saveLocal(v); }
    if (!online()) {
      v.learn = CORE().record(v.learn || { p: {}, k: {} }, { provider: item.provider, kind: item.kind, verdict });
      if (verdict === 'no' || verdict === 'notlike') { v.dismissed = v.dismissed || {}; v.dismissed[item.id] = Date.now(); }
      saveLocal(v); emit(); return { ok: true };
    }
    try {
      const r = await C.api(`/projects/${encodeURIComponent(projectId())}/suggest/feedback`, { method: 'POST', body: { id: item.id, provider: item.provider, kind: item.kind, verdict, title: item.title } });
      if (srv) { srv.learn = CORE().record(srv.learn || { p: {}, k: {} }, { provider: item.provider, kind: item.kind, verdict }); if (verdict === 'no' || verdict === 'notlike') srv.dismissed = (srv.dismissed || []).concat(item.id); srv.proposed = (srv.proposed || []).filter(p => verdict === 'later' || p.id !== item.id); }
      emit(); return r;
    } catch (e) { emit(); return { error: e.message }; }
  }
  const undos = new Map();   // id -> { undo, title }
  async function applyItem(item) {
    if (!canEdit()) return ask(item);
    let undo = null;
    try { undo = await item.apply(); }
    catch (e) { if (e && (e.status === 403 || /403|not allowed|read-only|cannot change/i.test(e.message || ''))) return ask(item, true); throw e; }
    undos.set(item.id, { undo: typeof undo === 'function' ? undo : null, title: item.title, item });
    await feedback(item, 'yes');
    return true;
  }
  async function undoItem(id) {
    const u = undos.get(id); if (!u) return false; undos.delete(id);
    if (u.undo) await u.undo();
    const v = L(); delete v.applied[id]; saveLocal(v); emit(); return true;
  }
  async function ask(item, refused) {
    const note = `${item.title}${item.why ? ` (${item.why})` : ''}`.slice(0, 300);
    try {
      if (window.TribeGroupStyle && window.TribeGroupStyle.ask) await window.TribeGroupStyle.ask(item.cap || 'site.edit', note);
      else if (online()) await C.api('/chat/general', { method: 'POST', body: { text: `Suggestion: ${note}` } });
    } catch {}
    const v = L(); v.later[item.id] = Date.now(); saveLocal(v); emit();
    toast(refused ? tr('You can’t change this here, so I asked the people who can.') : tr('Asked the people who can change this.'));
    return 'asked';
  }
  function why(id) {
    const x = list().find(i => i.id === id) || [...providers.values()].flatMap(v => v.items).find(i => i.id === id); if (!x) return '';
    const from = x.from.length ? `It came from ${x.from.map(chipText).join(', ')}.` : '';
    return [x.why, from, CORE().explain(learn(), x.provider, x.kind)].filter(Boolean).map(tr).join(' ');   // each sentence through the runtime (rows and patterns in i18n-more.js)
  }
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : null);

  // ---------- actions shared by providers and AI proposals ----------
  async function siteCfg() { const r = await C.api(`/projects/${encodeURIComponent(projectId())}/site-config`); return r; }
  // one website change: through the open designer when it shows this project (its own Undo), else a saved version
  async function siteApply({ ops, fn }) {
    const D = window.TribeSiteDesigner, st = D && D.state && D.state();
    if (st && st.open && st.pid === projectId() && D.applyChange) { const ok = D.applyChange(ops ? { ops } : { fn }); if (!ok) throw new Error(tr('That change no longer fits the site.')); return () => D.undo(); }
    const r = await siteCfg(); if (!r || !r.config) throw new Error(tr('This project has no website yet.'));
    if (r.canEdit === false) throw Object.assign(new Error('not allowed'), { status: 403 });
    let next = null;
    if (ops) { const a = S().applyOps(r.config, ops); if (!a.done.length) throw new Error(tr('That change no longer fits the site.')); next = a.cfg; } else next = fn(r.config);
    const put = await C.api(`/projects/${encodeURIComponent(projectId())}/site-config`, { method: 'PUT', body: { config: next, base: r.rev } });
    const before = r.config, rev = put && put.rev;
    return async () => { await C.api(`/projects/${encodeURIComponent(projectId())}/site-config`, { method: 'PUT', body: { config: before, base: rev } }); };
  }
  async function makeTask(title, desc) {
    const r = await C.api('/tasks', { method: 'POST', body: { title, desc: desc || '' } }); const t = r && r.task;
    return async () => { if (t && t.id) { try { await C.api('/tasks/' + encodeURIComponent(t.id), { method: 'DELETE' }); } catch {} } };
  }
  async function doAction(a, p) {
    a = a || { type: 'note' };
    if (a.type === 'task') return makeTask(a.title || p.title, a.desc || p.why || '');
    if (a.type === 'site') return siteApply({ ops: a.ops });
    return null;
  }

  // ---------- the card and the list ----------
  const KIND_WORD = { chat: 'chat', task: 'a task', doc: 'a doc', update: 'an update', decision: 'a decision', proposal: 'a proposal', comment: 'a comment', photo: 'photo', file: 'file', edit: 'edits', brand: 'brand kit', site: 'the site', ai: 'AI', agent: 'AI helper', person: 'idea' };
  function chipText(f) {
    const who = f.who ? `${f.who}’s` : '';
    if (f.kind === 'photo' || f.kind === 'file' || f.kind === 'edit') return `${who ? who + ' ' : ''}${f.kind === 'edit' ? 'edits' : f.kind}${f.label ? `: ${f.label}` : ''}`;
    if (f.kind === 'task') return `task: ${f.label || f.text || ''}`.slice(0, 60);
    if (f.kind === 'agent' || f.kind === 'person' || f.kind === 'ai') return f.who || KIND_WORD[f.kind];
    return `${f.who || 'someone'} in ${KIND_WORD[f.kind] || f.kind}`;
  }
  // o = { id, title, before?, after?, srcHtml?, why?, from?, row: [[attr, value, label, primary?]], rowClass?, cls? }
  function card(o) {
    const chips = (o.from || []).map(f => `<span class="sgx-chip">${esc(chipText(f))}</span>`).join('');
    return `<li class="sg${o.cls ? ' ' + o.cls : ''}" data-sgid="${esc(o.id)}"><p class="sg-t">${esc(o.title)}</p>${o.before != null && o.after != null ? `<p class="sg-ba"><del>${esc(o.before)}</del><ins>${esc(o.after)}</ins></p>` : ''}${o.srcHtml || ''}${o.why ? `<p class="sgx-why">${esc(tr(o.why))}</p>` : ''}${chips ? `<p class="sgx-from">${chips}</p>` : ''}
      <p class="${o.rowClass || 'sgx-row'}">${(o.row || []).map(([attr, val, label, primary]) => `<button type="button" class="btn sm${primary ? ' primary' : ''}${primary === 0 ? ' ghost' : ''}" ${attr}="${esc(val)}" data-id="${esc(o.id)}">${esc(label)}</button>`).join('')}</p></li>`;
  }
  const boxes = new Set();
  function panel(box, opt = {}) {
    if (!box) return;
    box.__sgx = opt; boxes.add(box); box.classList.add('sgx');
    if (!box.__sgxWired) { box.__sgxWired = true; box.addEventListener('click', e => { const b = e.target.closest('[data-sgx]'); if (b && box.contains(b)) click(box, b); }); }
    paint(box);
    if (!providers.size || [...providers.values()].some(v => v.dirty)) schedule(200);
  }
  function paint(box) {
    if (!box.isConnected) { boxes.delete(box); return; }
    const opt = box.__sgx || {}, items = list(opt.provider), busy = [...providers.values()].some(v => v.busy || v.dirty), m = mode();
    const done = opt.compact ? [] : [...undos.entries()].filter(([, u]) => !opt.provider || u.item.provider === opt.provider).slice(-3);
    const ce = canEdit();
    box.innerHTML = `<div class="sgx-head"><span class="eyebrow">${esc(tr(opt.title || 'Suggestions'))}${items.length ? ` · ${items.length}` : ''}</span>${opt.compact ? '' : `<button type="button" class="btn sm ghost" data-sgx="again">${ico('refresh', 13)}${esc(tr('Look again'))}</button>`}</div>
      ${opt.compact ? '' : `<p class="sgx-hint">${esc(tr(m === 'off' ? 'Suggestions are off. Look again still works when you ask.' : 'Ideas drawn from what your tribe adds and does: files, photos, edits, chat, tasks and docs. Nothing changes until you tap Apply.'))}</p>`}
      ${done.map(([id, u]) => `<p class="sgx-done">${ico('check', 13)}<span>${esc(tr('Applied'))}: ${esc(u.title)}</span>${u.undo ? `<button type="button" class="btn sm" data-sgx="undo" data-id="${esc(id)}">${esc(tr('Undo'))}</button>` : ''}</p>`).join('')}
      ${items.length ? `<ol class="sg-list">${items.slice(0, opt.max || 30).map(x => card({ id: x.id, title: x.title, before: x.before, after: x.after, why: x.why, from: x.from, row: [ce ? ['data-sgx', 'apply', tr('Apply'), true] : ['data-sgx', 'ask', tr('Ask'), true], ['data-sgx', 'later', tr('Not now')], ...(ce ? [['data-sgx', 'notlike', tr('Not like this')]] : []), ['data-sgx', 'why', tr('Why?'), 0]] })).join('')}</ol>${opt.compact && items.length > (opt.max || 30) ? `<p class="sgx-row"><button type="button" class="btn sm" data-sgx="all">${esc(tr('See all'))} (${items.length})</button></p>` : ''}`
        : `<p class="sgx-hint">${esc(tr(busy ? 'Looking quietly when your device is idle…' : 'Nothing to suggest right now. Ideas show up as your tribe adds photos, files, edits and plans.'))}</p>`}
      ${!opt.compact && srv && srv.ai && ce ? `<p class="sgx-row"><button type="button" class="btn sm" data-sgx="ai">${ico('sparkle', 13)}${esc(tr('Ask the AI for ideas'))}</button></p>` : ''}
      <p class="sgx-why-out" aria-live="polite" hidden></p>`;
  }
  function paintAll() { boxes.forEach(b => paint(b)); paintSlot(); }
  async function click(box, b) {
    const k = b.dataset.sgx, id = b.dataset.id, x = id && list((box.__sgx || {}).provider).find(i => i.id === id);
    if (k === 'again') { b.disabled = true; await run({ asked: true }); return paint(box); }
    if (k === 'all') return open({ provider: (box.__sgx || {}).provider });
    if (k === 'undo') { try { await undoItem(id); } catch (e) { toast(tr('Could not undo') + ': ' + e.message); } return; }
    if (k === 'ai') { b.disabled = true; try { const r = await C.api(`/projects/${encodeURIComponent(projectId())}/suggest/ideas`, { method: 'POST' }); await server(true); toast(r && r.ok ? tr('The AI added its ideas to the list.') : (r && r.say) || tr('The AI did not answer just now.')); } catch (e) { toast(e.message); } emit(); return; }
    if (!x) return;
    if (k === 'apply') { b.disabled = true; try { await applyItem(x); } catch (e) { toast(tr('Could not apply') + ': ' + (e.message || e)); b.disabled = false; } return; }
    if (k === 'ask') return ask(x);
    if (k === 'later') return feedback(x, 'later');
    if (k === 'notlike') { if (x.dismiss) { try { await x.dismiss(); } catch {} } return feedback(x, 'notlike'); }
    if (k === 'why') { const o = box.querySelector('.sgx-why-out'); if (o) { o.hidden = false; o.textContent = why(id); } }
  }
  let sheet = null;
  function open(o = {}) {
    if (sheet) sheet.close();
    if (!window.TribeUI || !window.TribeUI.sheet) return null;
    sheet = window.TribeUI.sheet({ kind: 'steps', id: 'sgx-sheet', eyebrow: 'Suggestions', title: o.provider ? (providers.get(o.provider) || { def: { title: o.provider } }).def.title : 'Ideas for this project', body: '<div class="sgx-sheet-box"></div>', onClose: () => { sheet = null; } });
    panel(sheet.body.querySelector('.sgx-sheet-box'), { provider: o.provider, title: 'Waiting' });   // the sheet's own header already says Suggestions
    run({ asked: true }).then(() => paintAll());
    return sheet;
  }
  // the project page: a calm card with the best two and the count
  function paintSlot() {
    const slot = document.getElementById('pj-suggest-slot'); if (!slot) return;
    if (mode() === 'off' || !projectId()) { slot.innerHTML = ''; return; }
    const n = count(); if (!n) { slot.innerHTML = ''; return; }
    if (!slot.__sgx) panel(slot, { compact: true, max: 2, title: 'Suggestions' }); else paint(slot);
    slot.classList.add('card', 'sgx-slot');
  }

  // ---------- edits worth noticing ----------
  function noteEdit(e) { if (!e || !e.tool || !e.what || !e.prop) return; const v = L(); v.edits.push({ ...e, at: Date.now() }); if (v.edits.length > 300) v.edits = v.edits.slice(-300); saveLocal(v); dirty(['edits']); }
  function noteSiteEdit(before, after) { try { const b = typeof before === 'string' ? JSON.parse(before) : before; CORE().siteEdits(b, after).forEach(noteEdit); } catch {} }

  // ---------- Flint ----------
  const PROV_WORDS = [['photos', /\bphotos?|pictures?|images?\b/], ['files', /\bfiles?|uploads?\b/], ['edits', /\bedits?\b/], ['talk', /\bchat|tasks?|docs?\b/], ['brand', /\bbrand|colou?rs?|fonts?\b/], ['site', /\b(?:web)?site|web ?page\b/], ['app', /\bapp\b/], ['motion', /\bmotion|animation|video\b/], ['launch', /\blaunch|store|app store\b/]];
  const MUTE_NAME = { photos: 'Photos', files: 'Files', edits: 'Your edits', talk: 'Chat, tasks and docs', brand: 'The brand', site: 'The website', app: 'The app', motion: 'Motion', launch: 'Launch kit' };
  const provOf = t => { const s = String(t || '').toLowerCase(); const hit = PROV_WORDS.find(([, rx]) => rx.test(s)); return hit ? hit[0] : ''; };
  async function flint(what, arg) {
    if (!projectId()) return tr('Open a project first: suggestions come from what its tribe adds and does.');
    if (what === 'less' || what === 'more' || what === 'off' || what === 'on') {
      const m = what === 'off' ? 'off' : what === 'more' ? 'often' : 'gentle';
      if (window.TribePrefs && window.TribePrefs.set) window.TribePrefs.set({ suggest: m }); emit();
      return what === 'off' ? tr('Suggestions are off. Ask me “what do you suggest?” any time and I will still look.') : m === 'often' ? tr('I will suggest more often now: up to 12 new ideas a day.') : tr('Gentle it is: a few new ideas a day at most, none during quiet hours.');
    }
    if (what === 'mute' || what === 'unmute') {
      const p = provOf(arg); if (!p) return tr('Which kind? Photos, files, edits, chat and tasks, the brand, the website, the app, motion or the launch kit.');
      if (online()) { try { const r = await C.api(`/projects/${encodeURIComponent(projectId())}/suggest/mute`, { method: 'PUT', body: { provider: p, on: what === 'mute' } }); if (srv) srv.muted = r.muted || []; } catch (e) { return e.message; } }
      else { const v = L(); const s = new Set(v.muted || []); if (what === 'mute') s.add(p); else s.delete(p); v.muted = [...s]; saveLocal(v); }
      emit(); return `${tr(MUTE_NAME[p] || p)}: ${tr(what === 'mute' ? 'okay, no more suggestions about this.' : 'suggestions about this are back on.')}`;
    }
    if (what === 'why') { const x = list()[0]; return x ? `“${x.title}”: ${why(x.id)}` : tr('There is nothing suggested right now, so there is nothing to explain.'); }
    const p = provOf(arg), items = await run({ asked: true, provider: p || undefined });
    open({ provider: p || undefined });
    if (!items.length) return p ? tr('Nothing to suggest about that right now. Ideas show up as your tribe adds photos, files, edits and plans.') : tr('Nothing to suggest right now. Ideas show up as your tribe adds photos, files, edits and plans.');
    return `${items.length === 1 ? tr('One idea') : `${items.length} ${tr('ideas')}`}: ${items.slice(0, 3).map(x => `${x.title.charAt(0).toLowerCase()}${x.title.slice(1)}`).join('; ')}${items.length > 3 ? ', …' : ''}. ${tr('Nothing changes until you tap Apply.')}`;
  }

  // ---------- live events: only what changed is read again ----------
  if (C && C.on) {
    C.on('hello', () => { srv = null; dirty(); });
    C.on('project', () => { pid = ''; schedule(300); });
    C.on('chat', () => dirty(['talk', 'site']));
    C.on('task', () => dirty(['talk', 'site']));
    C.on('doc', () => dirty(['talk', 'site']));
    C.on('ws', m => {
      if (!m || !m.type) return;
      if (m.type === 'uploads') dirty(['files', 'photos']);
      if (m.type === 'suggest') { server(true).then(emit); }
      if (m.type === 'site-comments' || m.type === 'site-config') dirty(['site', 'brand', 'edits']);
    });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(2000); });
  window.addEventListener('hashchange', () => setTimeout(paintSlot, 400));
  // the project page redraws often: fill its slot when it comes back empty (as sharecard.js does)
  setInterval(() => { const sl = document.getElementById('pj-suggest-slot'); if (sl && !sl.firstElementChild && mode() !== 'off') { sl.__sgx = null; paintSlot(); } }, 2000);

  window.TribeSuggest = { register, panel, open, list, count, run, feedback, apply: applyItem, undo: undoItem, why, card, noteEdit, noteSiteEdit, flint, idle, on, siteApply, makeTask, chipText, paintSlot, mode, paused, _providers: () => [...providers.keys()], _state: () => [...providers.values()].map(v => ({ id: v.def.id, busy: v.busy, dirty: v.dirty, at: v.at, n: v.items.length, err: v.err })) };
  schedule(1500);
})();
