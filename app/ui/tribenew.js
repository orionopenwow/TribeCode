// The one create-a-tribe flow (feat/ui-tribeflow). Every way in opens this sheet: the rail +, the empty Home, the
// welcome's "Start my real tribe", Settings, the phone's projects sheet, Files' "move to a tribe", Flint and the Work
// page (they all call TribeProjects.openNew or TribeLocalSetup.start, which land here).
//   1. Name and icon.
//   2. Where it lives (the same homes as setuplocal's "Where should it live?"): This device · This computer hosts it ·
//      Free cloud · GitHub, each with a plain line and a recommended default for this platform. Inside a tribe you
//      already have, the new one lives with it (or clones a GitHub repo there).
//   3. Invite friends (optional): a real link once something hosts it; Skip is always there.
//   Done: you land in the new tribe's Dashboard with a "Start your first project" card.
// One sheet with a progress bar; screens swap inside it (no stacking, one scrim, gone on close). Back works on every
// step, Esc closes. Errors are inline and calm. The hosting itself is setuplocal.js (host.computer, host.importTo,
// github.connect) and offline.js (the draft on this device); nothing is duplicated here.
// Public: window.TribeNew = { open(prefill), close(), isOpen(), state(), card() }
(function () {
  'use strict';
  const C = () => window.TribeClient, S = () => window.TribeStore, OFF = () => window.TribeOffline, L = () => window.TribeLocalSetup;
  const A = () => window.TribeApp, PJ = () => window.TribeProjects, PH = () => window.TribePhoneHost;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, s = 18) => `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const toast = m => A() && A().toast && A().toast(m);
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const realFetch = (u, o) => (OFF() && OFF().realFetch ? OFF().realFetch(u, o) : fetch(u, o));
  const solo = () => !!(OFF() && OFF().solo && OFF().solo());
  const inTribe = () => !!(C() && C().connected && C().connected());   // a tribe here already (a server, or one on this device)
  const desktop = () => !!(window.TribeHost && window.TribeHost.isDesktop && window.__TAURI__);
  const phone = () => matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent || '');
  const staticWeb = () => /(^|\.)tribecode\.org$|\.github\.io$/.test(location.hostname) || !/^https?:$/.test(location.protocol);
  const CARD = 'tribecode.tribenew.card';
  const EMOJI = ['🏕️', '✦', '🎮', '🌐', '📱', '🎨', '🚀', '🔥', '🌱', '🎵', '🧪', '📚'];
  const STEPS = ['Name', 'Home', 'Friends'];

  // ---------- where it can live ----------
  function homes() {
    if (inTribe()) {
      const t = ((C().state && C().state()) || {}).tribe || {}, tn = t.name || 'your tribe';
      return [
        { k: 'tribe', icon: 'users', t: `With ${tn}`, s: solo() ? 'On this device, next to your other projects. Pick a home for them any time' : 'Where your tribe already lives. Everyone in it can see it right away' },
        ...(solo() ? [] : [{ k: 'github', icon: 'git', t: 'From a GitHub repo', s: 'Bring code you already have: the tribe keeps a copy and works on it with you' }]),
      ];
    }
    return [
      { k: 'device', icon: 'spark', t: phone() ? 'This phone' : 'This device', s: 'Starts right away and works offline. Only you see it until you give it a home' },
      { k: 'computer', icon: 'box', t: 'This computer hosts it', s: desktop() ? 'The desktop app keeps it online while this computer is on. Friends join with a link' : 'The TribeCode app or server on this computer keeps it online. Friends join with a link' },
      { k: 'cloud', icon: 'net', t: 'Free cloud', s: 'Always online on a free Render server, even when your computer is off' },
      { k: 'github', icon: 'git', t: 'A GitHub repo', s: 'Anyone can see the live repo and suggested changes. No server needs to stay on' },
    ];
  }
  // The recommended home: the tribe you are in; the desktop app or a page its server serves hosts; else this device.
  function recommended() {
    if (inTribe()) return 'tribe';
    if (desktop()) return 'computer';
    if (!phone() && !staticWeb()) return 'computer';
    return 'device';
  }

  // ---------- the sheet ----------
  let el = null, scrim = null, st = null;
  function closeOthers() {
    try { L() && L().close && L().close(); } catch {}
    try { PH() && PH().close && PH().close(); } catch {}
    try { window.TribeFloat && window.TribeFloat.closePop && window.TribeFloat.closePop(); } catch {}
    const m = $('#invite-modal'); if (m && !m.classList.contains('hidden')) m.classList.add('hidden');
    document.body.classList.remove('drawer-open');
  }
  function close(now) {
    if (!el) return; const a = el, b = scrim; el = scrim = null; st = null;
    removeEventListener('keydown', onKey, true);
    if (now || reduced()) { a.remove(); b.remove(); return; }
    a.classList.add('out'); b.classList.add('out');
    setTimeout(() => { a.remove(); b.remove(); }, 160);
  }
  function onKey(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
  }
  function open(pre = {}) {
    closeOthers();
    if (el) close(true);
    st = { step: 1, name: String(pre.name || '').slice(0, 48), emoji: pre.emoji || EMOJI[0], where: recommended(), created: null, busy: false, from: pre.from || '' };
    scrim = document.createElement('div'); scrim.className = 'ph-scrim tn-scrim'; scrim.onclick = () => close();
    el = document.createElement('div'); el.className = 'ph-sheet su-sheet tn-sheet'; el.id = 'tn';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tn-h');
    document.body.append(scrim, el);
    addEventListener('keydown', onKey, true);
    draw();
    return el;
  }
  function head(eyebrow, title) {
    const n = Math.min(st.step, 3);
    return `<div class="ph-grab" aria-hidden="true"></div>
      <header class="ph-h tn-head">${st.step > 1 && !st.busy ? `<button type="button" class="ph-back" id="tn-back" aria-label="Back">${ic('chev', 16)}</button>` : ''}
        <div><span class="eyebrow">${esc(eyebrow)}</span><h3 id="tn-h">${esc(title)}</h3></div>
        <button type="button" class="su-x" id="tn-x" aria-label="Close">${ic('x', 16)}</button></header>
      <ol class="tn-prog" aria-label="Step ${n} of 3">${STEPS.map((s, i) => `<li class="${i + 1 < n ? 'done' : i + 1 === n ? 'on' : ''}"${i + 1 === n ? ' aria-current="step"' : ''}><span>${s}</span></li>`).join('')}</ol>`;
  }
  const err = (t) => { const e = $('#tn-err', el); if (!e) return; e.textContent = t || ''; e.hidden = !t; };
  function draw() {
    if (!el) return;
    const paint = () => {
      if (st.step === 1) step1(); else if (st.step === 2) step2(); else step3();
      const x = $('#tn-x', el); if (x) x.onclick = () => close();
      const b = $('#tn-back', el); if (b) b.onclick = () => { st.step -= 1; draw(); };
      el.dataset.step = st.step;
    };
    if (window.TribeMotion && window.TribeMotion.swap && el.childElementCount) window.TribeMotion.swap(paint); else paint();
  }

  // ---------- 1. name and icon ----------
  function step1() {
    const host = inTribe() && !solo() && PJ() && PJ().gallery;
    el.innerHTML = `${head(inTribe() ? 'New tribe' : 'Start a tribe', 'Name it and pick an icon')}
      <form id="tn-f1" autocomplete="off">
        <label class="ph-lab" for="tn-name">Name</label>
        <input class="input" id="tn-name" maxlength="48" placeholder="e.g. Lantern Crew" value="${esc(st.name)}">
        <span class="ph-lab" id="tn-emo-l">Icon</span>
        <div class="tn-emo" role="radiogroup" aria-labelledby="tn-emo-l">${EMOJI.map(e => `<button type="button" role="radio" data-tn-emo="${esc(e)}" aria-checked="${e === st.emoji}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        <p class="tn-err" id="tn-err" role="status" hidden></p>
        <div class="ph-acts"><button type="button" class="btn" id="tn-cancel">Cancel</button><button class="btn primary" id="tn-next" type="submit">Next</button></div>
      </form>
      <p class="ph-foot">${host ? '<button type="button" class="linkish" id="tn-more">Start from an idea, a template or my code</button><span aria-hidden="true">·</span>' : ''}<button type="button" class="linkish" id="tn-join">Join a friend’s tribe instead</button></p>`;
    const n = $('#tn-name', el);
    n.oninput = () => { st.name = n.value; err(''); };
    el.querySelectorAll('[data-tn-emo]').forEach(b => b.onclick = () => { st.emoji = b.dataset.tnEmo; el.querySelectorAll('[data-tn-emo]').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
    $('#tn-cancel', el).onclick = () => close();
    $('#tn-join', el).onclick = () => { close(true); window.TribeSettings && window.TribeSettings.joinPrompt && window.TribeSettings.joinPrompt(); };
    const more = $('#tn-more', el); if (more) more.onclick = () => { close(true); PJ().gallery(); };
    $('#tn-f1', el).onsubmit = e => {
      e.preventDefault(); st.name = n.value.trim();
      if (!st.name) { err('Give it a name first. You can change it later.'); return n.focus(); }
      st.step = 2; draw();
    };
    if (!phone()) setTimeout(() => n.focus(), 30);
  }

  // ---------- 2. where it lives ----------
  function step2() {
    const list = homes(), rec = recommended(), done = st.created;
    if (!list.some(h => h.k === st.where)) st.where = rec;
    el.innerHTML = `${head('Where it lives', done ? `${st.name} is ready` : `Where should ${st.name} live?`)}
      <p class="ph-lead">${done ? 'It already has a home. You can move it any time from its settings.' : 'Pick one. You can move it later, nothing is lost.'}</p>
      <div class="tn-where" role="radiogroup" aria-label="Where it lives">${list.map(h => `<button type="button" class="ph-row tn-row" role="radio" data-tn-where="${h.k}" aria-checked="${h.k === st.where}"${done ? ' disabled' : ''}>
        <span class="ph-ic">${ic(h.icon)}</span><span class="ph-tt"><b>${esc(h.t)}${h.k === rec ? ' <em class="ph-tag">Recommended</em>' : ''}</b><small>${esc(h.s)}</small></span><span class="tn-dot" aria-hidden="true"></span></button>`).join('')}</div>
      <div class="tn-more-box" id="tn-detail"></div>
      <div class="tn-prog-line" id="tn-run" role="status" aria-live="polite" hidden><span class="su-spin" aria-hidden="true"></span><span id="tn-run-t"></span></div>
      <p class="tn-err" id="tn-err" role="status" hidden></p>
      <div class="ph-acts"><button type="button" class="btn" id="tn-b2">Back</button><button type="button" class="btn primary" id="tn-go">${done ? 'Next' : 'Create'}</button></div>`;
    el.querySelectorAll('[data-tn-where]').forEach(b => b.onclick = () => { st.where = b.dataset.tnWhere; el.querySelectorAll('[data-tn-where]').forEach(x => x.setAttribute('aria-checked', String(x === b))); err(''); detail(); });
    $('#tn-b2', el).onclick = () => { st.step = 1; draw(); };
    $('#tn-go', el).onclick = () => (done ? (st.step = 3, draw()) : create());
    detail();
  }
  // The extra a home needs, inline under the list (never another sheet).
  function detail() {
    const box = $('#tn-detail', el); if (!box) return;
    if (st.created) { box.innerHTML = ''; return; }
    const w = st.where;
    if (w === 'github') {
      box.innerHTML = `<label class="ph-lab" for="tn-repo">Repository</label><input class="input" id="tn-repo" placeholder="owner/name or https://github.com/owner/name" spellcheck="false" value="${esc(st.repo || '')}">
        ${inTribe() ? '' : `<details class="su-more"><summary>Token to write suggestions <span class="su-opt">optional</span></summary><input class="input" id="tn-tok" type="password" autocomplete="off" placeholder="github_pat_…" aria-label="GitHub token">
        <p class="ph-note">Without one, the tribe shows the live repo read-only. A token stays on this device only.</p></details>`}`;
      const r = $('#tn-repo', box); r.oninput = () => { st.repo = r.value; err(''); };
    } else if (w === 'cloud') {
      box.innerHTML = `<ol class="ph-steps tn-steps"><li><a href="https://render.com/deploy?repo=https://github.com/orionopenwow/TribeCode" target="_blank" rel="noopener">Open Render</a> and tap Apply (sign in with GitHub). The first build takes a few minutes.</li>
        <li>Open your new address, enter TRIBE_SETUP_CODE and your name, then make an invite link.</li><li>Paste the link here.</li></ol>
        <label class="ph-lab" for="tn-cloud">Invite link from your cloud tribe</label><input class="input" id="tn-cloud" inputmode="url" autocomplete="off" placeholder="https://…onrender.com/join/abc12" value="${esc(st.cloud || '')}">
        <p class="ph-note">Free plan: it naps after 15 minutes alone and wakes in about a minute.</p>`;
      const c = $('#tn-cloud', box); c.oninput = () => { st.cloud = c.value; err(''); };
    } else if (w === 'computer' && !desktop() && staticWeb()) {
      box.innerHTML = `<p class="ph-note tn-note">This page comes from the web, so it needs the TribeCode app on this computer. <a href="${esc((window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest')}" target="_blank" rel="noopener">Get the app</a>, or start on this device and move it later.</p>`;
    } else box.innerHTML = '';
  }
  const running = t => { const r = $('#tn-run', el); if (!r) return; r.hidden = !t; const x = $('#tn-run-t', el); if (x) x.textContent = t || ''; };
  function busy(on) {
    st.busy = on; if (!el) return;
    el.querySelectorAll('#tn-go, #tn-b2, [data-tn-where], #tn-detail input').forEach(b => { b.disabled = on; });
    const back = $('#tn-back', el); if (back) back.hidden = on;
  }
  const parseRepo = v => { const m = String(v || '').trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/); return m ? `${m[1]}/${m[2]}` : ''; };
  function draft() {
    if (!OFF() || !OFF().start) throw new Error('Setup did not load. Reload the app and try again.');
    if (!solo()) OFF().start('solo', { name: st.name, emoji: st.emoji });
    return new Promise(res => { let n = 0; const t = () => (L() && L().pid() && inTribe()) || n++ > 60 ? res() : setTimeout(t, 100); t(); });
  }
  async function create() {
    if (st.busy) return; err('');
    const w = st.where;
    let repo = '';
    if (w === 'github') { repo = parseRepo(st.repo); if (!repo) { err('Type the repository as owner/name.'); const r = $('#tn-repo', el); if (r) r.focus(); return; } }
    let inv = null;
    if (w === 'cloud') { inv = A() && A().parseInvite ? A().parseInvite(st.cloud || '') : null; if (!inv) { err('Paste the whole invite link from your cloud tribe, like https://…/join/abc12.'); const c = $('#tn-cloud', el); if (c) c.focus(); return; } }
    if (w === 'computer' && !desktop() && staticWeb()) { err('This needs the TribeCode app on this computer. Start on this device for now and move it later.'); return; }
    busy(true);
    try {
      if (w === 'tribe' || (w === 'github' && inTribe())) {
        running('Making it…');
        const body = { name: st.name, emoji: st.emoji, ...(w === 'github' ? { url: `https://github.com/${repo}` } : {}) };
        const r = await C().api('/projects', { method: 'POST', body });
        const p = r.project || r; st.created = { where: w, pid: p.id, server: (S().get().server || {}).url, repo };
        if (PJ() && PJ().refresh) await PJ().refresh();
      } else {
        running(w === 'device' ? 'Making it on this device…' : 'Making it on this device first…');
        await draft();
        if (w === 'device') st.created = { where: w, pid: L().pid() };
        else if (w === 'github') {
          running('Checking the repo on GitHub…');
          const tok = ($('#tn-tok', el) || {}).value || undefined;
          const r = await L().github.connect(repo, tok && tok.trim() ? tok.trim() : undefined);
          st.created = { where: w, pid: L().pid(), repo, url: (r.live && r.live.url) || `https://github.com/${repo}` };
        } else if (w === 'computer') {
          const r = await L().host.computer({ step: running, noReload: true });
          if (r && r.noApp) throw Object.assign(new Error('TribeCode isn’t running on this computer. Your tribe is safe on this device; get the app to host it, or pick This device.'), { soft: true, keep: 'device' });
          if (r && r.alreadyTribe) throw Object.assign(new Error('This computer already hosts a tribe. Ask its host for an invite link and pick Free cloud’s link box, or keep it on this device.'), { soft: true, keep: 'device' });
          st.created = { where: w, server: r.server, token: r.token, pid: ((r.projects || [])[0] || {}).id, reload: true };
        } else if (w === 'cloud') {
          running('Joining your cloud tribe…');
          const me = S().get(), nm = me.name && me.name !== 'Me' ? me.name : 'Host';
          const j = await realFetch(`${inv.server}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: inv.code, name: nm, color: me.color }) });
          const jd = await j.json().catch(() => ({})); if (!j.ok || !jd.token) throw new Error(jd.error || 'That invite didn’t work. Make a fresh link in your cloud tribe and paste it again.');
          const r = await L().host.importTo(inv.server, jd.token, { hosting: false, step: running, noReload: true });
          st.created = { where: w, server: inv.server, token: jd.token, pid: ((r.projects || [])[0] || {}).id, reload: true };
        }
      }
      lsSet('tribecode.firstrun.done', '1');   // the focused first run would open over the new tribe: this flow ends with its own card
      window.dispatchEvent(new CustomEvent('tribe-project-created', { detail: { name: st.name, local: !st.created.server } }));
      running(''); busy(false); st.step = 3; draw();
    } catch (e) {
      running(''); busy(false);
      err((e && e.message) || 'That didn’t work this time. Nothing was lost; try again.');
      if (e && e.keep && st.where !== e.keep) { /* offer the safe home, without choosing it for them */ const b = el && el.querySelector(`[data-tn-where="${e.keep}"]`); if (b) b.focus(); }
    }
  }

  // ---------- 3. invite friends (optional) ----------
  async function inviteLink() {
    const c = st.created || {};
    if (c.server && c.token) {
      const r = await realFetch(`${c.server}/api/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.token }, body: JSON.stringify({ hours: 72, maxUses: 10, role: 'builder' }) });
      const d = await r.json().catch(() => ({})); if (!r.ok || !d.invite) throw new Error(d.error || 'Couldn’t make a link right now.');
      return `${c.server}/join/${d.invite.code}`;
    }
    if (inTribe() && !solo()) {
      const d = await C().api('/invites', { method: 'POST', body: { hours: 72, maxUses: 10, role: 'builder', ...(c.pid ? { project: c.pid } : {}) } });
      const base = String((S().get().server || {}).url || location.origin).replace(/\/+$/, '');
      return `${base}/join/${d.invite.code}`;
    }
    return null;
  }
  function step3() {
    const c = st.created || {};
    const hosted = !!(c.server && c.token) || (inTribe() && !solo());
    el.innerHTML = `${head('Invite friends · optional', 'Who’s building with you?')}
      ${hosted ? `<p class="ph-lead">Send this link. Anyone with it can join ${esc(st.name)} for the next 3 days.</p>
        <div class="su-cmd tn-link"><input class="input" id="tn-link" readonly value="" placeholder="Making a link…" aria-label="Invite link"><button type="button" class="btn" id="tn-copy" disabled>Copy</button></div>`
      : c.where === 'github' ? `<p class="ph-lead">Friends can follow it on GitHub right away. To build together live, give it a host later (This computer or Free cloud).</p>
        <div class="su-cmd tn-link"><input class="input" id="tn-link" readonly value="${esc(c.url || '')}" aria-label="Repository link"><button type="button" class="btn" id="tn-copy">Copy</button></div>`
      : `<p class="ph-lead">It lives on this device for now, so friends can join once it has a home. Pick one any time from the pill at the top; this step will be waiting.</p>`}
      <p class="tn-err" id="tn-err" role="status" hidden></p>
      <div class="ph-acts"><button type="button" class="btn" id="tn-skip">Skip</button><button type="button" class="btn primary" id="tn-done">Open ${esc(st.name)}</button></div>`;
    $('#tn-skip', el).onclick = finish; $('#tn-done', el).onclick = finish;
    const copy = $('#tn-copy', el), inp = $('#tn-link', el);
    if (copy) copy.onclick = async () => { inp.select(); try { await navigator.clipboard.writeText(inp.value); copy.textContent = 'Copied'; } catch { toast(inp.value); } };
    if (hosted) inviteLink().then(u => { if (!el || !u) return; inp.value = u; copy.disabled = false; }).catch(e => { if (!el) return; inp.placeholder = 'No link yet'; err(`${e.message} You can invite from the tribe any time.`); });
  }

  // ---------- done: land in the new tribe, with its first card ----------
  async function finish() {
    const c = st.created || {}, name = st.name;
    lsSet(CARD, JSON.stringify({ pid: c.pid || null, name, at: Date.now() }));
    close();
    if (c.reload) {   // a new host: this device signs in to it on the next load
      S().set({ server: { url: c.server, token: c.token }, hosting: c.where === 'computer' && desktop(), name: S().get().name });
      try { if (c.pid) localStorage.setItem('tribecode.project:' + c.server, c.pid); sessionStorage.setItem('tribecode.view', 'home'); } catch {}
      if (OFF() && OFF().forget) try { OFF().forget(); } catch {}
      setTimeout(() => location.reload(), reduced() ? 0 : 180);
      return;
    }
    try {
      if (c.pid && PJ() && PJ().switchTo && (!PJ().current || PJ().current() !== c.pid)) await PJ().switchTo(c.pid, 'home');
      else if (A() && A().show) A().show('home');
    } catch {}
    setTimeout(card, 120);
  }
  function card() {
    let want = null; try { want = JSON.parse(lsGet(CARD) || 'null'); } catch {}
    if (!want || Date.now() - (want.at || 0) > 7 * 864e5) { if (want) lsSet(CARD, null); return null; }
    const home = document.getElementById('view-home'); if (!home || home.classList.contains('hidden') || document.body.classList.contains('global')) return null;
    if (want.pid && PJ() && PJ().current && PJ().current() && PJ().current() !== want.pid) return null;
    let box = document.getElementById('tn-first'); if (box) return box;
    box = document.createElement('section'); box.id = 'tn-first'; box.className = 'tn-first'; box.setAttribute('aria-labelledby', 'tn-first-h');
    box.innerHTML = `<div><span class="eyebrow">${esc(want.name || 'Your tribe')} is ready</span><h2 id="tn-first-h">Start your first project</h2>
      <p>A website, an app, a game, slides: pick one and Flint sets it up with a short plan.</p></div>
      <div class="tn-first-acts"><button type="button" class="btn primary" id="tn-first-go">Start a project</button><button type="button" class="btn" id="tn-first-later">Later</button></div>`;
    home.prepend(box);
    const gone = () => { lsSet(CARD, null); box.remove(); };
    $('#tn-first-later', box).onclick = gone;
    $('#tn-first-go', box).onclick = () => { gone(); if (window.TribeDesignFlow && window.TribeDesignFlow.open) window.TribeDesignFlow.open(); else if (PJ() && PJ().gallery) PJ().gallery(); };
    return box;
  }
  // after a reload (a new host) or a route change, the card waits for the tribe's Dashboard
  let cardT = 0;
  const watch = () => new MutationObserver(() => { if (!lsGet(CARD) || document.getElementById('tn-first')) return; clearTimeout(cardT); cardT = setTimeout(card, 200); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-view', 'class'] });
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  if (lsGet(CARD)) addEventListener('load', () => setTimeout(card, 800));

  // The welcome's "Start my real tribe" (welcome.js belongs to the intro): open this flow once the welcome is gone.
  document.addEventListener('click', e => {
    if (!(e.target.closest && e.target.closest('#wl [data-go="real"]'))) return;
    const wait = (n = 0) => (document.getElementById('wl') && n < 40 ? setTimeout(() => wait(n + 1), 50) : open({ from: 'welcome' }));
    setTimeout(wait, 0);
  }, true);

  window.TribeNew = { open, close, isOpen: () => !!el, state: () => (st ? { step: st.step, where: st.where, name: st.name, emoji: st.emoji, created: st.created && { ...st.created, token: undefined } } : null), card, recommended, homes: () => homes().map(h => h.k) };
})();
