// The one create-a-tribe flow (feat/ui-tribeflow). Every way in opens this sheet: the rail +, the empty Home, the
// welcome's "Start my tribe", Settings, the phone's projects sheet, Files' "move to a tribe", Flint and the Work
// page (they all call TribeProjects.openNew or TribeLocalSetup.start, which land here).
// feat/real-tribe: every tribe is a full tribe. The default path is two steps: Name and icon, then Invite (optional).
// It is made where it works best without asking: with the tribe you are in; on this computer when TribeCode runs here
// (the desktop app, or a page its own server serves), quietly; otherwise in this browser, where everything still works
// and "Put this tribe online" (sharecard.js) is one button away. "More options" on step 1 opens the list of places
// (step 2 below) for a folder, GitHub, a free cloud or a shared folder.
//   1. Name and icon, and one optional sentence: "What are you making?" (feat/vision-create). The sentence becomes the
//      project's vision (the one line under its name on the dashboard, /vision) and its first version (firstlook.js),
//      the same as the sentence box on Home. Left empty, nothing changes. With a sentence and no name, the name comes
//      from the sentence (TribeProjects.nameFromIdea).
//   2. (More options) Where it lives (feat/folder-sync): A folder on this computer · This device only · Free cloud ·
//      GitHub repo, each with a plain line and a recommended default (the folder on the desktop app; off with a reason on
//      a phone or the public website). GitHub can also be connected later to any of the others (livingrepo.js). Inside a tribe you
//      already have, the new one lives with it (or clones a GitHub repo there).
//   3. Invite friends (optional): once something hosts it, Invite friends opens the one invite sheet (inviteone.js) in the
//      new tribe; Skip is always there.
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
  const CARD = 'tribecode.tribenew.card', LOOK = 'tribecode.tribenew.look';
  // feat/vision-create: the same three examples as the sentence box on Home (hub.js)
  const IDEAS = ['A website for my friend’s bakery', 'An app that tracks our habits', 'A snake game for our group'];
  const homeIdea = () => { const h = document.getElementById('hub-idea'); return h && h.isConnected ? String(h.value || '') : ''; };   // typed on Home already: never typed twice
  const EMOJI = ['🏕️', '✦', '🎮', '🌐', '📱', '🎨', '🚀', '🔥', '🌱', '🎵', '🧪', '📚'];
  const STEPS = ['Name', 'Where', 'Friends'], QUICK = ['Name', 'Friends'];

  // ---------- where it can live ----------
  // feat/folder-sync: the home is the living repo. "A folder on this computer" (this computer hosts it, the files live
  // in your folder) is the desktop's pick; GitHub is also a synced copy any home can connect later (livingrepo.js).
  const folderOk = () => (window.TribeHome && window.TribeHome.canPickFolder ? window.TribeHome.canPickFolder() : { ok: false, why: 'Folders need the TribeCode app on your computer.' });
  // feat/setup-github: plain words, one order everywhere (on this computer · a folder you pick or create · GitHub ·
  // free cloud · a shared folder), and the browser's own folder picker where no TribeCode runs behind the page.
  const BF = () => window.TribeBrowserFolder;
  const canHere = () => desktop() || (served() && !phone());   // TribeCode runs on this computer (the app, or the server that serves this page)
  function homes() {
    const f = folderOk();
    if (inTribe()) {
      const t = ((C().state && C().state()) || {}).tribe || {}, tn = t.name || 'your tribe', host = !solo() && isHostHere();
      return [
        { k: 'tribe', icon: 'users', t: `With ${tn}`, s: solo() ? (phone() ? 'On this phone, next to your other projects' : 'In this browser, next to your other projects') : 'Next to your other projects. Everyone in the tribe sees it right away' },
        ...(host && f.ok ? [{ k: 'folder', icon: 'folder', t: 'A folder you pick or create', s: 'Its files go in a folder of yours on this computer. Edit them here or in any editor' }] : []),
        ...(!solo() ? [{ k: 'github', icon: 'git', t: 'GitHub', s: 'Bring code you already keep on GitHub. The tribe works on a copy with you' }] : []),
        ...(host && f.ok ? [{ k: 'shared', icon: 'net', t: 'A shared folder', s: 'A Dropbox, OneDrive, Google Drive or iCloud folder you already use. Friends who have the folder join from it' }] : []),
      ];
    }
    const here = canHere();
    const list = [
      ...(here ? [{ k: 'computer', icon: 'box', t: 'On this computer', s: 'The TribeCode app keeps it on this computer. Friends join with a link' }] : []),
      { k: f.ok ? 'folder' : 'bfolder', icon: 'folder', t: 'A folder you pick or create', s: f.ok ? 'Its files go in a folder of yours on this computer. Edit them here or in any editor' : phone() ? 'Folders need a computer. On a phone it stays on this phone, and you can download a copy' : BF() && BF().can() ? 'A copy of its files is saved in a folder on this computer. It also stays in this browser' : 'This browser can’t open folders. It stays in this browser, and you can download a copy' },
      { k: 'github', icon: 'git', t: 'GitHub', s: 'A copy is kept on GitHub. Friends can see it there even when this computer is off', note: 'You can also connect GitHub later.' },
      { k: 'cloud', icon: 'zap', t: 'Free cloud', s: window.TribeCloudHome.SUB },
      ...(f.ok ? [{ k: 'shared', icon: 'net', t: 'A shared folder', s: 'A Dropbox, OneDrive, Google Drive or iCloud folder you already use. Friends who have the folder join from it' }] : []),
    ];
    const dev = { k: 'device', icon: 'spark', t: phone() ? 'On this phone only' : 'In this browser only', s: 'Starts right away and works offline. Only you see it until you put it online' };
    return here ? [...list, dev] : [dev, ...list];   // the default always comes first
  }
  // A step with one choice is no step: "More options" shows only when there is something to choose.
  const choices = () => homes().filter(h => !h.off).length;
  const isHostHere = () => { const m = ((C() && C().state && C().state()) || {}).me || {}; return m.role === 'host'; };
  // feat/real-tribe: where a tribe is made when nobody asked (Create on step 1): with your tribe; on this computer when
  // TribeCode runs here; else in this browser.
  const served = () => /^https?:$/.test(location.protocol) && !staticWeb() && !/(^|\.)tauri\.localhost$/i.test(location.hostname);
  function auto() {
    if (inTribe()) return 'tribe';
    if (canHere()) return 'computer';
    return 'device';
  }
  // The recommended place is the one Create uses when nobody asks: your tribe; this computer when TribeCode runs here; else this browser.
  const recommended = () => auto();

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
    st = { step: 1, name: String(pre.name || '').slice(0, 48), vision: String(pre.vision != null ? pre.vision : homeIdea()).trim().slice(0, 600), emoji: pre.emoji || EMOJI[0], where: recommended(), created: null, busy: false, from: pre.from || '', opts: false };
    scrim = document.createElement('div'); scrim.className = 'ph-scrim tn-scrim'; scrim.onclick = () => close();
    el = document.createElement('div'); el.className = 'ph-sheet su-sheet tn-sheet'; el.id = 'tn';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'tn-h');
    document.body.append(scrim, el);
    addEventListener('keydown', onKey, true);
    draw();
    return el;
  }
  function head(eyebrow, title) {
    const steps = st.opts ? STEPS : QUICK, n = st.opts ? Math.min(st.step, 3) : st.step >= 3 ? 2 : 1;
    return `<div class="ph-grab" aria-hidden="true"></div>
      <header class="ph-h tn-head">${st.step > 1 && !st.busy ? `<button type="button" class="ph-back" id="tn-back" aria-label="Back">${ic('chev', 16)}</button>` : ''}
        <div><span class="eyebrow">${esc(eyebrow)}</span><h3 id="tn-h">${esc(title)}</h3></div>
        <button type="button" class="su-x" id="tn-x" aria-label="Close">${ic('x', 16)}</button></header>
      <ol class="tn-prog" aria-label="Step ${n} of ${steps.length}">${steps.map((s, i) => `<li class="${i + 1 < n ? 'done' : i + 1 === n ? 'on' : ''}"${i + 1 === n ? ' aria-current="step"' : ''}><span>${s}</span></li>`).join('')}</ol>`;
  }
  const err = (t) => { const e = $('#tn-err', el); if (!e) return; e.textContent = t || ''; e.hidden = !t; };
  function draw() {
    if (!el) return;
    const paint = () => {
      if (st.step === 1) step1(); else if (st.step === 2) step2(); else step3();
      const x = $('#tn-x', el); if (x) x.onclick = () => close();
      const b = $('#tn-back', el); if (b) b.onclick = () => { st.step = st.step === 3 && !st.opts ? 1 : st.step - 1; draw(); };
      el.dataset.step = st.step;
    };
    if (window.TribeMotion && window.TribeMotion.swap && el.childElementCount) window.TribeMotion.swap(paint); else paint();
  }

  // ---------- 1. name and icon ----------
  function step1() {
    const host = inTribe() && !solo() && PJ() && PJ().gallery;
    el.innerHTML = `${head(inTribe() ? 'New project' : 'Start a tribe', 'Name it and pick an icon')}
      <form id="tn-f1" autocomplete="off">
        <label class="ph-lab" for="tn-name">Name</label>
        <input class="input" id="tn-name" maxlength="48" placeholder="e.g. Lantern Crew" value="${esc(st.name)}">
        <label class="ph-lab" for="tn-vis">What are you making? <span class="tn-opt">optional</span></label>
        <textarea class="input tn-vis" id="tn-vis" rows="2" maxlength="600" placeholder="e.g. A website for my friend’s bakery" aria-describedby="tn-vis-h"${st.created ? ' disabled' : ''}>${esc(st.vision)}</textarea>
        <div class="tn-chips">${IDEAS.map(t => `<button type="button" class="tn-chip" data-tn-idea="${esc(t)}"${st.created ? ' disabled' : ''}>${esc(t)}</button>`).join('')}</div>
        <p class="tn-hint" id="tn-vis-h">One sentence is enough. A first version is made from it, and you can change it any time.</p>
        <span class="ph-lab" id="tn-emo-l">Icon</span>
        <div class="tn-emo" role="radiogroup" aria-labelledby="tn-emo-l">${EMOJI.map(e => `<button type="button" role="radio" data-tn-emo="${esc(e)}" aria-checked="${e === st.emoji}" aria-label="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        <p class="tn-err" id="tn-err" role="status" hidden></p>
        <div class="tn-prog-line" id="tn-run" role="status" aria-live="polite" hidden><span class="su-spin" aria-hidden="true"></span><span id="tn-run-t"></span></div>
        <div class="ph-acts"><button type="button" class="btn" id="tn-cancel">Cancel</button><button class="btn primary" id="tn-create" type="submit">${st.created ? 'Next' : 'Create'}</button></div>
      </form>
      <p class="ph-foot">${st.created || choices() < 2 ? '' : '<button type="button" class="linkish" id="tn-options">More options</button><span aria-hidden="true">·</span>'}${host ? '<button type="button" class="linkish" id="tn-more">Start from an idea, a template or my code</button><span aria-hidden="true">·</span>' : ''}<button type="button" class="linkish" id="tn-join">Join a friend’s tribe instead</button>${folderOk().ok ? '<span aria-hidden="true">·</span><button type="button" class="linkish" id="tn-join-shared">Join from a shared folder</button>' : ''}</p>`;
    const n = $('#tn-name', el);
    n.oninput = () => { st.name = n.value; err(''); };
    const v = $('#tn-vis', el);
    v.oninput = () => { st.vision = v.value; err(''); };
    v.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#tn-f1', el).requestSubmit(); } };
    el.querySelectorAll('[data-tn-idea]').forEach(b => b.onclick = () => { v.value = st.vision = b.dataset.tnIdea; err(''); v.focus(); });
    el.querySelectorAll('[data-tn-emo]').forEach(b => b.onclick = () => { st.emoji = b.dataset.tnEmo; el.querySelectorAll('[data-tn-emo]').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
    $('#tn-cancel', el).onclick = () => close();
    $('#tn-join', el).onclick = () => { close(true); window.TribeSettings && window.TribeSettings.joinPrompt && window.TribeSettings.joinPrompt(); };
    const js = $('#tn-join-shared', el); if (js) js.onclick = () => { st.name = n.value.trim() || 'Shared tribe'; st.where = 'shared'; st.step = 2; draw(); };
    const more = $('#tn-more', el); if (more) more.onclick = () => { const idea = v.value.trim(); close(true); PJ().gallery(); const i = document.getElementById('np-idea'); if (i && idea) i.value = idea; };   // the sentence comes along
    const named = () => {
      st.name = n.value.trim(); if (!st.created) st.vision = v.value.trim();
      if (!st.name && st.vision && PJ() && PJ().nameFromIdea) {   // a sentence and no name: the name comes from the sentence
        const taken = new Set(((PJ().list && PJ().list()) || []).map(p => p.name)), base = PJ().nameFromIdea(st.vision);
        let nm = base; for (let i = 2; taken.has(nm); i++) nm = `${base} ${i}`;
        st.name = n.value = nm.slice(0, 48);
      }
      if (!st.name) { err('Give it a name, or say what you’re making. You can change both later.'); n.focus(); return false; }
      return true;
    };
    const op = $('#tn-options', el); if (op) op.onclick = () => { if (!named()) return; if (!st.opts) st.where = recommended(); st.opts = true; st.step = 2; draw(); };
    $('#tn-f1', el).onsubmit = e => {
      e.preventDefault(); if (!named()) return;
      if (st.created) { st.step = 3; return draw(); }
      st.opts = false; st.where = auto(); create();   // no questions: it is made where it works best
    };
    if (!phone()) setTimeout(() => n.focus(), 30);
  }

  // ---------- 2. where it lives ----------
  function step2() {
    const list = homes(), rec = recommended(), done = st.created;
    if (!list.some(h => h.k === st.where)) st.where = rec;
    el.innerHTML = `${head('Where it’s kept', done ? 'It’s ready' : 'Where should it be kept?')}
      <p class="ph-lead">${done ? 'It’s made. You can change where it’s kept any time from Sharing and backup on the dashboard.' : 'Pick where its files are kept. You can change this later from Sharing and backup, and nothing is lost.'}</p>
      <div class="tn-where" role="radiogroup" aria-label="Where it’s kept">${list.map(h => `<button type="button" class="ph-row tn-row" role="radio" data-tn-where="${h.k}" aria-checked="${h.k === st.where}"${done || h.off ? ' disabled' : ''}${h.off ? ' data-off="1"' : ''}>
        <span class="ph-ic">${ic(h.icon)}</span><span class="ph-tt"><b>${esc(h.t)}${h.k === rec ? ' <em class="ph-tag">Recommended</em>' : ''}</b><small>${esc(h.s)}</small>${h.note ? `<small class="tn-later">${esc(h.note)}</small>` : ''}</span><span class="tn-dot" aria-hidden="true"></span></button>`).join('')}</div>
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
    if (w === 'folder') {
      box.innerHTML = `<div id="tn-folder"></div>${inTribe() ? '' : '<p class="ph-note">Optional: skip it and the files are kept in TribeCode’s own folder on this computer. Pick a folder any time from Sharing and backup on the dashboard.</p>'}`;
      if (window.TribeHome) window.TribeHome.pickFolder({ mount: $('#tn-folder', box), onChange: c => { st.folder = c; err(''); const go = $('#tn-go', el); if (go && !st.created) go.textContent = c && c.summary && !c.summary.empty ? 'Use what’s here' : 'Create'; } });
      if (st.folder) { /* a choice made before Back: the picker asks again (it re-checks the folder) */ st.folder = null; }
    } else if (w === 'bfolder') {   // a web page with no TribeCode behind it: the browser's own folder picker, or a clear fallback
      box.innerHTML = '<div id="tn-bfolder"></div>'; st.bfolder = null;
      if (BF()) BF().mount($('#tn-bfolder', box), { onPick: h => { st.bfolder = h; err(''); } });
    } else if (w === 'shared') {
      box.innerHTML = `<p class="ph-note tn-note">Pick the folder that Dropbox, OneDrive, Google Drive or iCloud keeps on this computer. If friends already shared one, you join it; otherwise a new one starts there.</p><div id="tn-folder"></div>`;
      if (window.TribeHome) window.TribeHome.pickFolder({ shared: true, mount: $('#tn-folder', box), onChange: c => { st.shared = c; err(''); const go = $('#tn-go', el); if (go && !st.created) go.textContent = c && c.join ? 'Join it' : 'Create'; } });
      st.shared = null;
    } else if (w === 'github') {
      // feat/setup-github: the one Connect GitHub flow (ghconnect.js): sign in, then pick or create the place on GitHub
      box.innerHTML = '<div id="tn-gh"></div>';
      const G = window.TribeGitHubConnect;
      if (G) st.ghCtl = G.mount($('#tn-gh', box), { name: st.name, repo: st.repo || '', local: !inTribe(), onChange: c => { st.repo = (c && c.repo) || ''; st.ghNew = !!(c && c.create); st.ghTok = (c && c.token) || ''; err(''); } });
    } else if (w === 'cloud') {
      // cloudhome.js: the same fields as every other place that offers Free cloud
      box.innerHTML = `<div class="tn-cloud">${window.TribeCloudHome.fields('tn', { value: st.cloud || '', code: st.cloudCode || '' })}</div>`;
      const ca = $('#tn-addr', box), cc = $('#tn-code', box);
      window.TribeCloudHome.wire(box, 'tn');
      ca.oninput = () => { st.cloud = ca.value; err(''); }; cc.oninput = () => { st.cloudCode = cc.value; err(''); };
    } else if (w === 'computer' && !desktop() && staticWeb()) {
      box.innerHTML = `<p class="ph-note tn-note">This page comes from the web, so it needs the TribeCode app on this computer. <a href="${esc((window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest')}" target="_blank" rel="noopener">Get the app</a>, or start on this device and move it later.</p>`;
    } else box.innerHTML = '';
  }
  const running = t => { const r = $('#tn-run', el); if (!r) return; r.hidden = !t; const x = $('#tn-run-t', el); if (x) x.textContent = t || ''; };
  function busy(on) {
    st.busy = on; if (!el) return;
    el.querySelectorAll('#tn-go, #tn-b2, #tn-create, #tn-cancel, #tn-options, #tn-name, #tn-vis, [data-tn-idea], [data-tn-emo], [data-tn-where]:not([data-off]), #tn-detail input, #tn-detail button').forEach(b => { b.disabled = on; });
    const back = $('#tn-back', el); if (back) back.hidden = on;
  }
  const parseRepo = v => { const m = String(v || '').trim().replace(/\.git$/, '').match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/); return m ? `${m[1]}/${m[2]}` : ''; };
  function draft() {
    if (!OFF() || !OFF().start) throw new Error('Setup did not load. Reload the app and try again.');
    if (!solo()) OFF().start('solo', { name: st.name, emoji: st.emoji, ...(st.vision ? { bio: st.vision.slice(0, 200) } : {}), quiet: !st.opts && st.where === 'computer' });
    return new Promise(res => { let n = 0; const t = () => (L() && L().pid() && inTribe()) || n++ > 60 ? res() : setTimeout(t, 100); t(); });
  }
  // feat/vision-create: the sentence becomes the project's vision, the one line under its name on the dashboard. The
  // same storage as the sentence box on Home (TribeProjects.keepIdea: the line about it and /vision). A tribe that
  // moves to this computer or a cloud takes it along with the rest of the draft.
  async function keepVision(pid) {
    if (!st.vision || !pid) return;
    try {
      if (PJ() && PJ().keepIdea) await PJ().keepIdea(pid, st.name, st.vision);
      else await C().api('/vision', { method: 'PUT', project: pid, body: { text: `# ${st.name}\n\n${st.vision}\n` } });
    } catch {}
  }
  async function create() {
    if (st.busy) return; err('');
    const w = st.where;
    let repo = '';
    if (w === 'github') { repo = parseRepo(st.repo); if (!repo) { err('Pick where it goes on GitHub first, or type it as owner/name.'); const r = $('#ghc-repo', el); if (r) r.focus(); return; } }
    if (w === 'cloud' && !String(st.cloud || '').trim()) { err('Set up your free cloud first, then paste its address here.'); const c = $('#tn-addr', el); if (c) c.focus(); return; }
    if (w === 'computer' && !desktop() && staticWeb()) { err('This needs the TribeCode app on this computer. Start on this device for now and move it later.'); return; }
    if ((w === 'folder' || w === 'shared') && !folderOk().ok) { err(folderOk().why); return; }
    if (w === 'shared' && !(st.shared && st.shared.path)) { err('Pick the shared folder first.'); return; }
    if (w === 'folder' && inTribe() && !(st.folder && st.folder.path)) { err('Pick the folder first: an empty one starts fresh, one with files keeps them.'); return; }
    // A first tribe with no folder picked yet: this computer hosts it in TribeCode's own folder; a folder can come later (the pill).
    busy(true);
    try {
      if (w === 'tribe' || (w === 'github' && inTribe()) || ((w === 'folder' || w === 'shared') && inTribe())) {
        running('Making it…');
        const body = { name: st.name, emoji: st.emoji, ...(w === 'github' && !st.ghNew ? { url: `https://github.com/${repo}` } : {}) };
        const r = await C().api('/projects', { method: 'POST', body });
        const p = r.project || r; st.created = { where: w, pid: p.id, server: (S().get().server || {}).url, repo };
        await keepVision(p.id);
        if (w === 'github' && st.ghNew && st.ghCtl) {   // feat/setup-github: a new place on GitHub, made and connected in the same click
          running('Making it on GitHub…');
          try { const g = await st.ghCtl.resolve(); await C().api(`/projects/${encodeURIComponent(p.id)}/sync`, { method: 'PUT', body: { kind: 'github', repo: g.repo, branch: 'main' } }); st.created.repo = g.repo; st.created.url = g.url; }
          catch (e) { toast(`${st.name} is made, but GitHub didn’t take: ${e.message} Connect it again from Sharing and backup on the dashboard.`); }
        }
        if (w === 'folder') { running('Setting up the folder…'); await C().api(`/projects/${encodeURIComponent(p.id)}/folder`, { method: 'PUT', body: { path: st.folder.path, gitInit: st.folder.gitInit } }).catch(e => toast(`${st.name} is made, but the folder didn’t take: ${e.message} Pick it again from Sharing and backup on the dashboard.`)); }
        if (w === 'shared') { running(st.shared.join ? 'Joining the shared copy…' : 'Starting the shared copy…'); await window.TribeHome.connectShared(p.id, st.shared, (path, o) => C().api(path, o)).catch(e => toast(`${st.name} is made, but the shared folder didn’t take: ${e.message}`)); }
        if (PJ() && PJ().refresh) await PJ().refresh();
      } else {
        running(st.opts ? (w === 'device' ? 'Making it on this device…' : 'Making it on this device first…') : 'Making it…');
        await draft();
        await keepVision(L().pid());   // on the draft first: it goes along wherever the tribe is kept
        if (w === 'device') st.created = { where: w, pid: L().pid() };
        else if (w === 'bfolder') {   // kept in this browser; a copy of its files goes into the folder that was picked
          st.created = { where: 'device', pid: L().pid() };
          if (st.bfolder && BF()) { running('Saving a copy in your folder…'); try { const r = await BF().save(L().pid(), st.bfolder); st.created.folder = r.folder; toast(`A copy is saved in ${r.folder}.`); } catch (e) { toast(`${st.name} is made, but the folder didn’t take: ${e.message} Try again from Sharing and backup on the dashboard.`); } }
        }
        else if (w === 'github') {
          running('Checking the repo on GitHub…');
          const tok = st.ghTok || undefined;
          const r = await L().github.connect(repo, tok && tok.trim() ? tok.trim() : undefined);
          st.created = { where: w, pid: L().pid(), repo, url: (r.live && r.live.url) || `https://github.com/${repo}` };
        } else if (w === 'computer' || w === 'folder' || w === 'shared') {
          let r = null;
          if (!st.opts) {   // feat/real-tribe: asked nothing, so nothing may fail: no TribeCode here (or it is busy) keeps it in this browser
            try { r = await L().host.computer({ step: () => running('Making it…'), noReload: true }); } catch { r = null; }
            if (!r || r.noApp || r.alreadyTribe || !r.server) { st.created = { where: 'device', pid: L().pid() }; r = null; }
          } else r = await L().host.computer({ step: running, noReload: true });
          if (!st.opts && !r) { /* kept in this browser */ } else {
          if (r && r.noApp) throw Object.assign(new Error('TribeCode isn’t running on this computer. Your tribe is safe in this browser; get the app to keep it on this computer, or pick In this browser only.'), { soft: true, keep: 'device' });
          if (r && r.alreadyTribe) throw Object.assign(new Error('This computer already has a tribe. Ask its owner for an invite link, or keep this one in this browser.'), { soft: true, keep: 'device' });
          st.created = { where: w, server: r.server, token: r.token, pid: ((r.projects || [])[0] || {}).id, reload: true };
          if (w === 'folder' && st.created.pid && st.folder && st.folder.path) {
            running('Setting up the folder…');
            const fr = await realFetch(`${r.server}/api/projects/${encodeURIComponent(st.created.pid)}/folder`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + r.token }, body: JSON.stringify({ path: st.folder.path, gitInit: st.folder.gitInit }) });
            if (!fr.ok) { const fd = await fr.json().catch(() => ({})); toast(`Your tribe is ready on this computer, but the folder didn’t take: ${fd.error || fr.status}. Pick it again from Sharing and backup on the dashboard.`); }
            else st.created.folder = (await fr.json().catch(() => ({}))).folder;
          }
          if (w === 'shared' && st.created.pid) {
            running(st.shared.join ? 'Joining the shared copy…' : 'Starting the shared copy…');
            const call = async (path, o) => { const x = await realFetch(`${r.server}/api${path}`, { method: o.method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + r.token }, body: JSON.stringify(o.body) }); const d = await x.json().catch(() => ({})); if (!x.ok) throw new Error(d.error || x.status); return d; };
            await window.TribeHome.connectShared(st.created.pid, st.shared, call).catch(e => toast(`Your tribe is ready on this computer, but the shared folder didn’t take: ${e.message}. Try again from Sharing and backup on the dashboard.`));
          }
          }
        } else if (w === 'cloud') {
          running('Reaching your cloud tribe…');
          const me = S().get();
          const c = await window.TribeCloudHome.connect({ value: st.cloud, code: st.cloudCode, name: me.name, color: me.color });
          const r = await L().host.importTo(c.server, c.token, { hosting: false, step: running, noReload: true });
          st.created = { where: w, server: c.server, token: c.token, pid: ((r.projects || [])[0] || {}).id, reload: true };
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
  function step3() {
    const c = st.created || {};
    const hosted = !!(c.server && c.token) || (inTribe() && !solo());
    el.innerHTML = `${head('Invite friends · optional', 'Who’s building with you?')}
      ${hosted ? `<p class="ph-lead">Friends join ${esc(st.name)} with a link, a guest gets a pass for a day, and your AI agent can come too. Invite them now, or any time from the sidebar.${c.where === 'folder' || c.where === 'computer' || c.where === 'shared' ? ' Links work for friends on this Wi-Fi while this computer is on. For friends anywhere, see More options under Sharing and backup on the dashboard.' : ''}</p>`
      : c.where === 'github' ? `<p class="ph-lead">Friends can follow it on GitHub right away. To build together at the same time, keep it on this computer or a free cloud later, from Sharing and backup.</p>
        <div class="su-cmd tn-link"><input class="input" id="tn-link" readonly value="${esc(c.url || '')}" aria-label="Repository link"><button type="button" class="btn" id="tn-copy">Copy</button></div>`
      : `<p class="ph-lead">${esc(st.name)} is ready and saved in this browser. Friends and AI agents join once it is online; you can do that now or any time from the dashboard.</p>`}
      <p class="tn-err" id="tn-err" role="status" hidden></p>
      <div class="ph-acts"><button type="button" class="btn" id="tn-skip">Skip</button>${hosted ? `<button type="button" class="btn" id="tn-done">Open ${esc(st.name)}</button><button type="button" class="btn primary" id="tn-invite">Invite friends</button>` : c.where === 'github' ? `<button type="button" class="btn primary" id="tn-done">Open ${esc(st.name)}</button>` : `<button type="button" class="btn" id="tn-done">Open ${esc(st.name)}</button><button type="button" class="btn primary" id="tn-online">Put this tribe online</button>`}</div>`;
    const ol = $('#tn-online', el); if (ol) ol.onclick = () => finish({ online: true });
    $('#tn-skip', el).onclick = () => finish(); $('#tn-done', el).onclick = () => finish();
    const iv = $('#tn-invite', el); if (iv) iv.onclick = () => finish({ invite: true });   // the one invite sheet (inviteone.js), once we're in the new tribe
    const copy = $('#tn-copy', el), inp = $('#tn-link', el);
    if (copy) copy.onclick = async () => { inp.select(); try { await navigator.clipboard.writeText(inp.value); copy.textContent = 'Copied'; } catch { toast(inp.value); } };
  }

  // ---------- done: land in the new tribe, with its first card ----------
  async function finish(then) {
    const c = st.created || {}, name = st.name, invite = !!(then && then.invite);
    // feat/vision-create: with a sentence the first version opens (firstlook.js) and the "Start your first project" card,
    // which asks for a sentence, is not shown: the question was answered already. Inviting comes right after it.
    const want = st.vision && c.pid && window.TribeFirstLook ? { pid: c.pid, name, idea: st.vision, at: Date.now(), then: invite ? 'invite' : then && then.online ? 'online' : '' } : null;
    if (want) { lsSet(LOOK, JSON.stringify(want)); lsSet(CARD, null); }
    else lsSet(CARD, JSON.stringify({ pid: c.pid || null, name, at: Date.now() }));
    close();
    if (c.reload) {   // a new host: this device signs in to it on the next load
      S().set({ server: { url: c.server, token: c.token }, hosting: ['computer', 'folder', 'shared'].includes(c.where) && desktop(), name: S().get().name });
      try { if (c.pid) localStorage.setItem('tribecode.project:' + c.server, c.pid); sessionStorage.setItem('tribecode.view', 'home'); if (invite && !want) sessionStorage.setItem('tribecode.invite.after', 'friend'); } catch {}
      if (OFF() && OFF().forget) try { OFF().forget(); } catch {}
      setTimeout(() => location.reload(), reduced() ? 0 : 180);
      return;
    }
    try {
      if (c.pid && PJ() && PJ().switchTo && (!PJ().current || PJ().current() !== c.pid)) await PJ().switchTo(c.pid, 'home');
      else if (A() && A().show) A().show('home');
    } catch {}
    if (want) return look();
    setTimeout(card, 120);
    if (invite && A() && A().openInvite) setTimeout(() => A().openInvite({ who: 'friend' }), 200);
    if (then && then.online && window.TribeShare) setTimeout(() => window.TribeShare.online('friends'), 260);
  }
  // The first version from the sentence, once this device is in the new tribe (straight away, or after the reload that
  // signs it in to a new home). What was picked on the last step (Invite friends, Put this tribe online) opens when the
  // first version is closed, unless something else was opened from it.
  let looking = false;
  async function look() {
    let w = null; try { w = JSON.parse(lsGet(LOOK) || 'null'); } catch {}
    if (!w || !w.pid || !w.idea || Date.now() - (w.at || 0) > 864e5) { if (w) lsSet(LOOK, null); return; }
    if (looking) return; looking = true;
    try {
      for (let i = 0; i < 100 && !(inTribe() && window.TribeFirstLook && PJ() && PJ().list && PJ().list().some(p => p.id === w.pid)); i++) await new Promise(r => setTimeout(r, 200));
      if (!inTribe() || !window.TribeFirstLook) return;
      lsSet(LOOK, null);
      try { if (PJ() && PJ().switchTo && PJ().current && PJ().current() !== w.pid) await PJ().switchTo(w.pid, 'home'); } catch {}
      if (w.then) addEventListener('tribe:firstlook-close', () => setTimeout(() => {
        if (document.body.classList.contains('fpv-open') || document.querySelector('#wdz, #apc') || (window.TribeInvite && window.TribeInvite.isOpen && window.TribeInvite.isOpen())) return;
        if (w.then === 'invite' && A() && A().openInvite) A().openInvite({ who: 'friend' });
        if (w.then === 'online' && window.TribeShare) window.TribeShare.online('friends');
      }, 320), { once: true });
      await window.TribeFirstLook.start({ pid: w.pid, idea: w.idea, name: w.name });
    } finally { looking = false; }
  }
  if (lsGet(LOOK)) addEventListener('load', () => setTimeout(look, 600));
  function card() {
    let want = null; try { want = JSON.parse(lsGet(CARD) || 'null'); } catch {}
    if (!want || Date.now() - (want.at || 0) > 7 * 864e5) { if (want) lsSet(CARD, null); return null; }
    const home = document.getElementById('view-home'); if (!home || home.classList.contains('hidden') || document.body.classList.contains('global')) return null;
    if (want.pid && PJ() && PJ().current && PJ().current() && PJ().current() !== want.pid) return null;
    let box = document.getElementById('tn-first'); if (box) return box;
    box = document.createElement('section'); box.id = 'tn-first'; box.className = 'tn-first'; box.setAttribute('aria-labelledby', 'tn-first-h');
    box.innerHTML = `<div><span class="eyebrow">${esc(want.name || 'Your tribe')} is ready</span><h2 id="tn-first-h">Start your first project</h2>
      <p>Say what you want to make in one sentence. A first version appears right away.</p></div>
      <div class="tn-first-acts"><button type="button" class="btn primary" id="tn-first-go">Start a project</button><button type="button" class="btn" id="tn-first-later">Later</button></div>`;
    home.prepend(box);
    const gone = () => { lsSet(CARD, null); box.remove(); };
    $('#tn-first-later', box).onclick = gone;
    $('#tn-first-go', box).onclick = () => { gone(); if (PJ() && PJ().gallery) PJ().gallery(); else if (window.TribeDesignFlow && window.TribeDesignFlow.open) window.TribeDesignFlow.open(); };   // feat/easy-start: one sentence first; templates and kinds are under it
    return box;
  }
  // after a reload (a new host) or a route change, the card waits for the tribe's Dashboard
  let cardT = 0;
  const watch = () => new MutationObserver(() => { if (!lsGet(CARD) || document.getElementById('tn-first')) return; clearTimeout(cardT); cardT = setTimeout(card, 200); })
    .observe(document.body, { attributes: true, attributeFilter: ['data-view', 'class'] });
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  if (lsGet(CARD)) addEventListener('load', () => setTimeout(card, 800));

  // The welcome's "Start my tribe" (welcome.js belongs to the intro): open this flow once the welcome is gone.
  document.addEventListener('click', e => {
    if (!(e.target.closest && e.target.closest('#wl [data-go="real"]'))) return;
    const wait = (n = 0) => (document.getElementById('wl') && n < 40 ? setTimeout(() => wait(n + 1), 50) : open({ from: 'welcome' }));
    setTimeout(wait, 0);
  }, true);

  window.TribeNew = { open, close, isOpen: () => !!el, state: () => (st ? { step: st.step, where: st.where, name: st.name, vision: st.vision, emoji: st.emoji, created: st.created && { ...st.created, token: undefined } } : null), card, recommended, homes: () => homes().map(h => h.k) };
})();
