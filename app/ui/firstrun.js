// Focused first run (v0.28, from the breakout research: time to the "aha" moment). A brand-new host sees one question,
// "What do you want to make with your friends?", and in about a minute has something they described running in the
// preview, then one next step at a time: Invite a friend → Connect your own AI → Publish (when that feature exists).
// A guest who just joined by link lands in the live project (chat + preview) with a one-line welcome and "Say hi".
// While it runs, the sidebar keeps only Chat, Files, Tasks and the preview (TribeMode.focus); "Show everything" is
// always one click away, and advanced areas still open from Recommended next / "Turn it on".
// Getting started milestones are kept in the tribe folder only (/api/activation); nothing leaves this machine.
// Never shown with ?skipIntro / ?demo= / ?welcome, in the demo, or under automation unless ?focus=1 (or the test flag).
//   window.TribeFirstRun = { start(), guest(), next(), progress(), off() }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const t = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const App = () => window.TribeApp;
  const toast = m => App() && App().toast && App().toast(m);
  const K = { done: 'tribecode.firstrun.done', used: 'tribecode.firstrun.used', step: 'tribecode.firstrun.step', guest: 'tribecode.firstrun.guest.' };

  const IDEAS = [
    ['🎮', 'A pixel platformer', 'A pixel platformer where friends race to collect coins'],
    ['🎉', 'A party quiz', 'A party quiz game for game night, with a scoreboard'],
    ['🖍️', 'A multiplayer drawing game', 'A multiplayer drawing and guessing game for friends'],
    ['📦', 'An order tracker', 'An order tracker for a small shop: orders, status and who delivers'],
    ['📅', 'A booking page', 'A booking page where customers pick a time and get a confirmation'],
    ['🤖', 'A Discord bot', 'A Discord bot that answers questions and posts daily updates'],
  ];
  const KIND = [[/\b(game|platformer|quiz|pixel|level|drawing|guess|race|puzzle)\b/i, '🎮'], [/\b(site|website|page|portfolio|booking|landing|shop)\b/i, '🌐'], [/\b(app|tracker|planner|list|bot|tool|dashboard)\b/i, '📱']];

  const blocked = () => /[?&](skipIntro|demo=|welcome|tour=)/.test(location.search) || (window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active())
    || (navigator.webdriver && !/[?&]focus=1/.test(location.search) && lsGet('tribecode.firstrun.test') !== '1');
  const me = () => (C.state() || {}).me || {};
  const projects = () => (C.state() || {}).projects || [];
  const api = (path, o) => C.api(path, o);
  const track = ev => api('/activation', { method: 'POST', body: { event: ev } }).catch(() => {});

  function nameFrom(idea) {
    const P = window.TribeProjects; if (P && P.nameFromIdea) try { return P.nameFromIdea(idea); } catch {}
    const w = String(idea).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(x => x.length > 2).slice(1, 4);
    return (w.map(x => x[0].toUpperCase() + x.slice(1)).join(' ') || 'My project').slice(0, 40);
  }
  function focusOn(on) { if (window.TribeMode && window.TribeMode.focus) window.TribeMode.focus(on); allPill(); }
  function allPill() {
    let p = $('#fr-all');
    const on = window.TribeMode && window.TribeMode.focused && window.TribeMode.focused();
    if (!on) { if (p) p.remove(); return; }
    if (p) return;
    p = document.createElement('button'); p.id = 'fr-all'; p.className = 'fr-all'; p.type = 'button';
    p.innerHTML = `<span aria-hidden="true">✦</span>${esc(t('Show everything'))}`;
    p.title = t('Show every part of TribeCode');
    p.onclick = () => off();
    document.body.appendChild(p);
  }
  function off() { focusOn(false); lsSet(K.done, '1'); const n = $('#fr-next'); if (n) n.remove(); const s = $('#fr-start'); if (s) s.remove(); const g = $('#fr-hi'); if (g) g.remove(); document.body.classList.remove('fr-guest'); }

  // ---------- 1. the first screen for a new host ----------
  function start() {
    if ($('#fr-start')) return;
    const el = document.createElement('div');
    el.id = 'fr-start'; el.className = 'fr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'fr-t');
    el.innerHTML = `<div class="fr-box">
      <img class="fr-mark" src="assets/icon-mark-animated.svg" alt="" width="56" height="56">
      <p class="fr-eb">${esc(t('Your tribe is ready'))}</p>
      <h1 class="fr-t" id="fr-t">${esc(t('What do you want to make with your friends?'))}</h1>
      <form class="fr-form" id="fr-form" autocomplete="off">
        <textarea class="fr-in" id="fr-in" rows="2" maxlength="400" placeholder="${esc(t('Describe it in a sentence'))}" aria-label="${esc(t('What do you want to make with your friends?'))}"></textarea>
        <button class="btn primary fr-go" id="fr-go" type="submit">${esc(t('Make it'))}<svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button>
      </form>
      <div class="fr-chips" role="list">${IDEAS.map(([e, l, full]) => `<button type="button" class="fr-chip" role="listitem" data-fr-idea="${esc(full)}"><span aria-hidden="true">${e}</span>${esc(t(l))}</button>`).join('')}</div>
      <ol class="fr-steps" id="fr-steps" hidden></ol>
      <p class="fr-note">${esc(t('A first version runs right away, even without an AI. Your own Claude, Codex or Gemini can build the rest.'))}</p>
      <div class="fr-foot"><button type="button" class="linkish" id="fr-skip">${esc(t('Show everything'))}</button></div>
    </div>`;
    document.body.appendChild(el);
    const inp = $('#fr-in');
    el.querySelectorAll('[data-fr-idea]').forEach(b => b.onclick = () => { inp.value = b.dataset.frIdea; inp.focus(); });
    inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#fr-form').requestSubmit(); } };
    $('#fr-form').onsubmit = e => { e.preventDefault(); make(inp.value); };
    $('#fr-skip').onclick = () => off();
    el.addEventListener('keydown', e => { if (e.key === 'Escape') off(); });
    setTimeout(() => inp.focus(), 50);
  }
  const STEPS = ['Creating your project', 'Writing the idea down', 'Making a first version', 'Opening the preview'];
  let curStep = 0;
  function stepUi(i, fail) {
    curStep = i; const ol = $('#fr-steps'); if (!ol) return; ol.hidden = false;
    ol.innerHTML = STEPS.map((s, j) => `<li class="${j < i ? 'ok' : j === i ? (fail ? 'fail' : 'run') : ''}">${j < i ? '✓' : j === i ? (fail ? '!' : '<span class="spin" aria-hidden="true"></span>') : '·'} ${esc(t(s))}</li>`).join('');
  }
  async function make(raw) {
    const idea = String(raw || '').trim(); const inp = $('#fr-in');
    if (!idea) { inp && inp.focus(); return; }
    const go = $('#fr-go'); if (go) go.disabled = true;
    lsSet(K.used, '1');
    if (window.TribeMode && window.TribeMode.source && window.TribeMode.source() === 'default') { try { await window.TribeMode.set('beginner'); } catch {} }
    focusOn(true);
    const t0 = Date.now();
    try {
      stepUi(0);
      const taken = new Set(projects().map(p => p.name)), base = nameFrom(idea); let name = base;
      for (let i = 2; taken.has(name); i++) name = `${base} ${i}`;
      const kind = KIND.find(([re]) => re.test(idea));
      const f = await window.TribeFlow.create(name, { emoji: kind ? kind[1] : '✨', wait: 8000 });
      const pid = f.project; track('firstProject');
      // the flow's invite sheet / toast are for the long setup; this run shows its own next step
      setTimeout(() => { const inv = $('#invite-modal'); if (inv && !inv.classList.contains('hidden')) { const x = inv.querySelector('[data-close], .modal-x, #invite-close'); if (x) x.click(); else inv.classList.add('hidden'); } }, 50);
      stepUi(1);
      await api(`/projects/${encodeURIComponent(pid)}`, { method: 'PATCH', body: { bio: idea.slice(0, 200) } }).catch(() => {});
      await api('/vision', { method: 'PUT', project: pid, body: { text: `# ${name}\n\n${idea}\n` } }).catch(() => {});
      stepUi(2);
      await api(`/projects/${encodeURIComponent(pid)}/setup/starter`, { method: 'POST', body: {} }).catch(() => {});
      // your own AI helpers build the rest, when there are any
      const agents = ((C.state() || {}).members || []).filter(m => m.role === 'agent');
      if (agents.length && window.TribeAskAgent) window.TribeAskAgent.send({ text: `Build this: ${idea}`, detail: 'Build it in the project\'s code so it runs in TribeCode\'s preview (index.html at the top folder, relative paths). A starter is already in the repo; build on it.', src: 'firstrun' }).catch(() => {});
      stepUi(3);
      const s = $('#fr-start'); if (s) s.remove();
      if (window.TribePreview && window.TribePreview.open) { try { await window.TribePreview.open(); } catch {} }
      setTimeout(() => { const i = window.TribePreview && window.TribePreview.info && window.TribePreview.info(); if (!i || i.hasIndex !== false) track('firstPreview'); }, 1500);
      try { lsSet('tribecode.firstrun.ms', String(Date.now() - t0)); } catch {}
      lsSet(K.step, 'invite'); next();
    } catch (e) {
      stepUi(curStep, true);
      if (go) go.disabled = false; toast(e.message || 'Something went wrong');
    }
  }

  // ---------- 2. one next step at a time ----------
  async function next() {
    const step = lsGet(K.step) || 'invite';
    let el = $('#fr-next');
    if (!el) { el = document.createElement('section'); el.id = 'fr-next'; el.className = 'fr-next'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    const card = (eb, title, body, acts) => { el.innerHTML = `<button class="fr-x" id="fr-x" aria-label="${esc(t('Hide'))}" title="${esc(t('Hide'))}">×</button><p class="fr-eb">${esc(eb)}</p><h3>${esc(title)}</h3>${body}<div class="fr-acts">${acts}</div>`; $('#fr-x').onclick = () => el.remove(); };
    if (step === 'invite') {
      let link = ''; try { const r = await api('/tribe-link'); link = r.link || r.short || ''; } catch {}
      card(t('Next step · 1 of 3'), t('Invite a friend'), `<p class="fr-p">${esc(t('Anyone with this link picks a name and they’re in. No account needed.'))}</p>
        ${link ? `<div class="fr-link"><code id="fr-link">${esc(link)}</code><button class="btn sm primary" id="fr-copy">${esc(t('Copy'))}</button></div>` : ''}`,
        `<button class="btn sm" id="fr-qr">${esc(t('Show QR code'))}</button><button class="linkish" id="fr-later">${esc(t('Later'))}</button>`);
      const adv = () => { track('invited'); lsSet(K.step, 'ai'); next(); };
      const cp = $('#fr-copy'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(link); } catch {} cp.textContent = t('Copied ✓'); setTimeout(adv, 700); };
      $('#fr-qr').onclick = () => { if (App() && App().openInvite) App().openInvite(); adv(); };
      $('#fr-later').onclick = () => { lsSet(K.step, 'ai'); next(); };
    } else if (step === 'ai') {
      card(t('Next step · 2 of 3'), t('Connect your own AI'), `<p class="fr-p">${esc(t('Claude Code, Codex, Gemini CLI, Cursor or a local model. It joins the chat and builds with you, on your own subscription.'))}</p>`,
        `<button class="btn sm primary" id="fr-ai">${esc(t('Connect your AI'))}</button><button class="linkish" id="fr-later">${esc(t('Later'))}</button>`);
      $('#fr-ai').onclick = () => { if (window.TribeAgentsHub && window.TribeAgentsHub.open) window.TribeAgentsHub.open(); lsSet(K.step, 'publish'); el.remove(); };
      $('#fr-later').onclick = () => { lsSet(K.step, 'publish'); next(); };
    } else if (step === 'publish') {
      const pub = window.TribePublish;
      if (!pub || !pub.open) { lsSet(K.step, 'done'); return next(); }
      card(t('Next step · 3 of 3'), t('Publish your play link'), `<p class="fr-p">${esc(t('A link anyone can open to play or use it, with a button to remix it.'))}</p>`,
        `<button class="btn sm primary" id="fr-pub">${esc(t('Publish'))}</button><button class="linkish" id="fr-later">${esc(t('Later'))}</button>`);
      $('#fr-pub').onclick = () => { pub.open(); track('published'); lsSet(K.step, 'done'); el.remove(); };
      $('#fr-later').onclick = () => { lsSet(K.step, 'done'); next(); };
    } else {
      card(t('You’re set'), t('Your first thing is running'), `<p class="fr-p">${esc(t('Everything else is here when you want it: docs, tasks, your AI helpers, a company, the Marketplace.'))}</p>`,
        `<button class="btn sm primary" id="fr-every">${esc(t('Show everything'))}</button><button class="linkish" id="fr-stay">${esc(t('Keep it simple'))}</button>`);
      $('#fr-every').onclick = () => off();
      $('#fr-stay').onclick = () => { lsSet(K.done, '1'); el.remove(); };
    }
  }

  // ---------- 3. a guest who just joined by link ----------
  async function guest() {
    const st = C.state() || {}, m = me(), ps = projects();
    // the live project: the newest one with code (the host's first run makes one); else where they are
    const live = ps.filter(x => x.hasRepo).slice(-1)[0], p = live || ps.find(x => x.id === (C.project && C.project())) || ps[0];
    if (!p) return;
    if (live && C.project && C.project() !== live.id && window.TribeProjects && window.TribeProjects.switchTo) { try { await window.TribeProjects.switchTo(live.id, 'chat'); } catch {} }
    lsSet(K.guest + (m.id || ''), '1');
    focusOn(true); document.body.classList.add('fr-guest');
    if (App() && App().show) App().show('chat');
    if (window.TribePreview && window.TribePreview.open) setTimeout(() => { try { window.TribePreview.open(); } catch {} }, 300);
    const host = (st.members || []).find(x => x.role === 'host');
    const el = document.createElement('section'); el.id = 'fr-hi'; el.className = 'fr-hi'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="fr-hi-e" aria-hidden="true">👋</span><div class="fr-hi-t"><b>${esc(t('Welcome to'))} ${esc(p.name)}</b><small>${esc(host ? host.name : '')} ${esc(t('is building it right now. Watch it in the preview and say hi.'))}</small></div>
      <button class="btn sm primary" id="fr-sayhi">${esc(t('Say hi'))}</button><button class="linkish" id="fr-hi-all">${esc(t('Show everything'))}</button>`;
    document.body.appendChild(el);
    $('#fr-sayhi').onclick = () => {
      const box = document.querySelector('#composer textarea, #msg-input, .composer textarea, textarea[name="msg"]');
      if (box) { box.value = `Hi ${host ? host.name.split(' ')[0] : 'everyone'}! 👋 `; box.dispatchEvent(new Event('input', { bubbles: true })); box.focus(); }
      el.remove();
    };
    $('#fr-hi-all').onclick = () => off();
  }

  // ---------- 4. Getting started N/5 in Home ----------
  let prog = null, progAt = 0;
  async function progress(force) {
    if (me().role !== 'host' || lsGet(K.used) !== '1') return;
    if (force || !prog || Date.now() - progAt > 15000) { try { prog = await api('/activation'); progAt = Date.now(); } catch { return; } }
    const home = document.querySelector('.hub-home'); if (!home || !prog || prog.done >= prog.total) { const o = $('#fr-prog'); if (o && (!prog || prog.done >= prog.total)) o.remove(); return; }
    let el = $('#fr-prog');
    const L = { firstPreview: 'First version running', invited: 'Invited a friend', friendJoined: 'A friend joined', aiConnected: 'Connected an AI', published: 'Published a play link' };
    const html = `<div class="fr-prog-h"><span class="fr-eb">${esc(t('Getting started'))}</span><b>${prog.done}/${prog.total}</b></div><div class="fr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${prog.total}" aria-valuenow="${prog.done}" aria-label="${esc(t('Getting started'))}"><i style="width:${Math.round(prog.done / prog.total * 100)}%"></i></div>
      <ul>${prog.steps.map(k => `<li class="${prog[k] ? 'ok' : ''}">${prog[k] ? '✓' : '○'} ${esc(t(L[k] || k))}</li>`).join('')}</ul>`;
    if (!el) { el = document.createElement('section'); el.id = 'fr-prog'; el.className = 'fr-prog'; home.prepend(el); }
    if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
  }

  // ---------- boot ----------
  function decide() {
    allPill();
    if (window.TribePersonalize && window.TribePersonalize.pending()) { window.TribePersonalize.then(() => setTimeout(decide, 250)); return; }   // Make it yours first: one onboarding thing at a time
    if (blocked()) return;
    const m = me(); if (!m.id) return;
    if (m.role === 'host') {
      const ps = projects(), fresh = !ps.length || (ps.length === 1 && !ps[0].hasRepo && !ps[0].bio);   // a new tribe has one empty default project
      if (fresh && lsGet(K.done) !== '1' && !lsGet(K.used)) start();
      else if (lsGet(K.used) === '1' && lsGet(K.done) !== '1' && projects().length && lsGet(K.step) && lsGet(K.step) !== 'done' && !$('#fr-next')) next();
    } else if (m.role !== 'agent' && !lsGet(K.guest + m.id) && m.joined && Date.now() - Date.parse(m.joined) < 30 * 60 * 1000) {
      guest();
    }
  }
  let booted = false;
  function boot() { if (booted) return; booted = true; setTimeout(decide, 250); }
  if (C.on) { C.on('hello', boot); C.on('projects', () => setTimeout(() => progress(true), 300)); C.on('presence', () => progress()); }
  if (C.connected && C.connected()) boot();
  let progT = 0, hadHome = false;
  new MutationObserver(() => {
    const home = !!document.querySelector('.hub-home');
    if (home && (!hadHome || !$('#fr-prog'))) { clearTimeout(progT); progT = setTimeout(() => progress(true), 250); }
    hadHome = home;
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.TribeFirstRun = { start, guest, next, progress, off };
})();
