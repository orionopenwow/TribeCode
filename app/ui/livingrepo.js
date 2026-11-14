// The project's living repo (feat/folder-sync): where it lives and its code repository are one thing. The home (a
// folder on this computer, this device, the tribe's own server, a cloud tribe) IS the repo; GitHub is its synced copy.
//
//   The pill     one status at the top for both: "Folder · ~/Games/Jiddles", "Folder + GitHub · synced 2 min ago",
//                "GitHub · 3 changes not shipped", "Paused", "Conflict needs you". It stands in for the Hosting pill.
//   Its popover  Move to a folder · Connect GitHub · Ship / sync settings · Share (and Ship now when there's GitHub).
//   Folder       desktop app: the native folder picker (Tauri dialog); a page the local host serves: a server-side
//                browser of folders under home (server/folderhome.js); the public website or a phone: off, with why.
//                Empty → starts fresh; files → "Use what's here" with what was found; no .git → git init, optional.
//   Sync         the "array of settings" (server/sync.js): manual or auto-ship and its trigger, push or a pull request,
//                message style, excludes, pull first and conflicts, auto-pull, tags, signing, approval, pause, the log.
//   Share        three paths, each one plain sentence: Work with friends anywhere (GitHub + the invite link, guided),
//                Share on this network (the host's own invite + QR, no GitHub), Just me for now.
// Public: window.TribeHome = { refresh(), open(), close(), where(), folder(o), pickFolder(o), canPickFolder(), github(),
//   sync(), renderSync(el, pid), ship(), share(), statusText(folder, sync), state() }
(function () {
  'use strict';
  const C = () => window.TribeClient, S = () => window.TribeStore, A = () => window.TribeApp, OFF = () => window.TribeOffline, L = () => window.TribeLocalSetup;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, s = 17) => `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const toast = m => A() && A().toast && A().toast(m);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = () => matchMedia('(max-width: 820px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent || '');
  const desktop = () => !!(window.TribeHost && window.TribeHost.isDesktop && window.__TAURI__);
  const localPage = () => /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const solo = () => !!(OFF() && OFF().solo && OFF().solo());
  const live = () => !!(C() && C().connected && C().connected()) && !solo() && !(OFF() && OFF().active && OFF().active());
  const pid = () => (C() && C().project && C().project()) || null;
  const realFetch = (u, o) => (OFF() && OFF().realFetch ? OFF().realFetch(u, o) : fetch(u, o));
  const me = () => ((C() && C().state && C().state()) || {}).me || {};
  const ago = t => { const s = Math.max(0, (Date.now() - Date.parse(t)) / 1000); return s < 50 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
  const plural = (n, a) => `${n} ${a}${n === 1 ? '' : 's'}`;

  // ---------- talking to the host (a member's token, or the host computer itself before a tribe exists) ----------
  const base = () => { const st = (S() && S().get()) || {}; return String((st.server && st.server.url) || (localPage() ? location.origin : '')).replace(/\/+$/, ''); };
  async function srv(path, { method = 'GET', body, auth = true } = {}) {
    if (auth && live()) return C().api(path, { method, body });
    const tok = auth ? (((S() && S().get().server) || {}).token || '') : '';
    const r = await realFetch(base() + '/api' + path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || `The host said ${r.status}.`), { status: r.status, data: d });
    return d;
  }

  // ---------- state of the current project ----------
  let cur = { pid: null, folder: null, sync: null, can: {}, at: 0 };
  async function load(force) {
    const p = pid(); if (!p || !live() || !((C().state().projects || []).some(x => x.id === p))) { cur = { pid: null }; return cur; }   // a project the host knows (no 404s mid-switch)
    if (!force && cur.pid === p && Date.now() - cur.at < 1500) return cur;
    const [f, s] = await Promise.all([srv(`/projects/${encodeURIComponent(p)}/folder`).catch(() => null), srv(`/projects/${encodeURIComponent(p)}/sync`).catch(() => null)]);
    cur = { pid: p, folder: f && f.folder, folderCan: (f && f.can) || {}, sync: s, at: Date.now() };
    return cur;
  }
  function statusText(folder, sync) {
    const st = sync && sync.status, gh = !!(st && st.connected);
    const tail = !gh ? '' : st.state === 'conflict' ? 'conflict needs you' : st.paused ? 'Paused' : st.pending ? `${plural(st.pending, 'change')} not shipped` : st.lastShip ? `synced ${ago(st.lastShip.at)}` : 'not shipped yet';
    const remote = st && st.kind === 'folder' ? 'shared folder' : 'GitHub';
    if (folder && gh) return { l: `Folder + ${remote}`, s: tail, tone: st.state };
    if (gh) return { l: remote === 'GitHub' ? 'GitHub' : 'Shared folder', s: tail, tone: st.state };
    if (folder) return { l: 'Folder', s: folder.display, tone: 'ok' };
    const hosting = window.TribeHostPill && document.getElementById('host-pill') && !document.getElementById('host-pill').classList.contains('hidden');
    return { l: hosting ? 'This computer' : 'In the tribe', s: 'choose where it lives', tone: 'none' };
  }

  // ---------- the one pill ----------
  const pill = document.createElement('button');
  pill.id = 'home-pill'; pill.className = 'host-pill lr-pill hidden'; pill.type = 'button'; pill.setAttribute('aria-haspopup', 'dialog'); pill.setAttribute('aria-expanded', 'false');
  function place() { const crumbs = $('#crumbs'); if (crumbs && pill.nextElementSibling !== crumbs) crumbs.parentNode.insertBefore(pill, crumbs); else if (!crumbs && !pill.parentNode) document.body.appendChild(pill); }
  let rt = 0;
  async function refresh() {
    clearTimeout(rt);
    const on = live() && !!pid() && (C().state().projects || []).some(x => x.id === pid());
    document.body.classList.toggle('lr-on', on);
    if (!on) { pill.classList.add('hidden'); close(); return; }
    place();
    try { await load(true); } catch {}
    try { window.TribeShare && window.TribeShare.card(); } catch {}   // feat/real-tribe: the dashboard card says what the pill said
    const t = statusText(cur.folder, cur.sync);
    pill.classList.remove('hidden'); pill.dataset.tone = t.tone || '';
    pill.innerHTML = `<span class="hp-dot lr-dot" aria-hidden="true"></span><span class="lr-l">${esc(t.l)}</span><span class="lr-s"> · ${esc(t.s)}</span>`;
    pill.title = `${t.l} · ${t.s}: where ${esc(((C().state().projects || []).find(x => x.id === pid()) || {}).name || 'this project')} lives and how it syncs`;
    if (cur.sync && cur.sync.status && cur.sync.status.lastShip) rt = setTimeout(refresh, 60_000);   // "synced N min ago" stays true
  }
  let pop = null;
  const anchorRect = () => { const a = anchorEl && anchorEl.isConnected && anchorEl.offsetParent ? anchorEl : null; return a ? a.getBoundingClientRect() : { top: 56, bottom: 56, left: Math.max(8, (innerWidth - 340) / 2) }; };
  function close() { if (pop) { pop.remove(); pop = null; pill.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); } }
  const outside = e => { if (pop && !pop.contains(e.target) && !pill.contains(e.target) && !(anchorEl && anchorEl.contains(e.target))) close(); };
  // feat/real-tribe: the pill no longer shows; this list opens from the dashboard's Sharing and backup card (More options)
  let anchorEl = null;
  async function open(anchor) {
    if (pop) return close();
    anchorEl = anchor && anchor.getBoundingClientRect ? anchor : document.getElementById('sc-more');
    await load(true).catch(() => {});
    const pj = ((C().state().projects || []).find(x => x.id === pid()) || {}), name = pj.name || 'This project', t = statusText(cur.folder, cur.sync);
    const st = (cur.sync && cur.sync.status) || {}, gh = !!st.connected, can = (cur.sync && cur.sync.can) || {}, pick = canPickFolder();
    const hosting = document.getElementById('host-pill') && !document.getElementById('host-pill').classList.contains('hidden');
    pop = document.createElement('div'); pop.className = 'host-pop lr-pop'; pop.id = 'home-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Sharing and backup');
    pop.innerHTML = `<header><span class="hp-dot lr-dot" data-tone="${esc(t.tone)}" aria-hidden="true"></span><div><span class="eyebrow">Sharing and backup</span><b>${esc(name)}: ${esc(t.l)}</b></div></header>
      <div class="hpo-rows">
        <div class="hpo-row"><span>Home</span><b>${cur.folder ? `<code title="${esc(cur.folder.display)}">${esc(cur.folder.display)}</code>` : hosting ? 'This computer' : 'The tribe’s host'}</b></div>
        <div class="hpo-row"><span>GitHub</span><b>${gh ? esc(st.repo) : 'Not connected'}</b></div>
        ${gh ? `<div class="hpo-row"><span>Sync</span><b>${esc(st.mode === 'auto' ? 'Auto-ship' : 'Manual')} · ${esc(t.s)}</b></div>` : ''}
        ${hosting ? '<div class="hpo-row"><span>Hosting</span><b>This computer</b></div>' : ''}
      </div>
      ${st.state === 'conflict' ? `<p class="lr-warn">GitHub and this folder changed the same lines (${esc((st.conflict.files || []).slice(0, 2).join(', '))}). Nothing was lost. <button class="linkish" id="hp-fix">Sort it out</button></p>` : ''}
      <div class="hpo-acts">
        <button id="hp-move" ${pick.ok ? '' : `aria-disabled="true" title="${esc(pick.why)}"`}>${ic('folder')}<span>${cur.folder ? 'Move to another folder' : 'Move to a folder'}${pick.ok ? '' : `<small>${esc(pick.why)}</small>`}</span></button>
        <button id="hp-github">${ic('git')}<span>${gh && st.kind !== 'folder' ? `GitHub · ${esc(st.repo)}` : 'Connect GitHub'}</span></button>
        <button id="hp-shared" ${pick.ok ? '' : `aria-disabled="true" title="${esc(pick.why)}"`}>${ic('net')}<span>${gh && st.kind === 'folder' ? `Shared folder · ${esc(st.repo)}` : 'Share through a synced folder'}</span></button>
        ${gh && can.ship ? `<button id="hp-ship">${ic('upload')}<span>Back up now${st.pending ? ` · ${plural(st.pending, 'change')}` : ''}</span></button>` : ''}
        <button id="hp-sync">${ic('gear')}<span>Backup settings</span></button>
        ${window.TribeVersions ? `<button id="hp-versions">${ic('refresh')}<span>Versions</span></button>` : ''}
        <button id="hp-share">${ic('users')}<span>Share</span></button>
        ${hosting ? `<button id="hp-host">${ic('net')}<span>Who can reach this computer</span></button>` : ''}
      </div>`;
    document.body.appendChild(pop);
    const r = anchorRect(); pop.style.top = (r.bottom + 8 + pop.offsetHeight > innerHeight ? Math.max(8, r.top - 8 - pop.offsetHeight) : r.bottom + 8) + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
    pill.setAttribute('aria-expanded', 'true');
    const on = (id, f) => { const b = pop.querySelector(id); if (b) b.onclick = () => { close(); f(); }; };
    on('#hp-move', () => (pick.ok ? folder({ pid: pid() }) : toast(pick.why)));
    on('#hp-github', () => (st.kind === 'folder' ? github(null, true) : github())); on('#hp-shared', () => (gh && st.kind === 'folder' ? sync() : pick.ok ? sharedFolder() : toast(pick.why))); on('#hp-ship', () => ship()); on('#hp-fix', () => ship()); on('#hp-sync', () => sync()); on('#hp-versions', () => window.TribeVersions.open()); on('#hp-share', () => share());
    on('#hp-host', async () => {   // the Hosting popout (hostpill.js), under this pill: invite, who can reach you, the Host switch
      if (!window.TribeHostPill) return window.TribeSettings && window.TribeSettings.open();
      await window.TribeHostPill.open(); const hp = document.getElementById('host-pop'), r = anchorRect();
      if (hp) { hp.style.top = (r.bottom + 8) + 'px'; hp.style.left = Math.max(8, r.left) + 'px'; }
    });
    setTimeout(() => document.addEventListener('click', outside, true), 0);
  }
  pill.onclick = e => { e.stopPropagation(); open(); };
  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (sh) return closeSheet();   /* a sheet opened from the pill closes on Esc even when focus is still outside it */ if (pop) { close(); pill.focus(); } });

  // ---------- one sheet at a time ----------
  let sh = null, scrim = null;
  function closeSheet(now) {
    if (!sh) return; const a = sh, b = scrim; sh = scrim = null;
    if (now || reduced()) { a.remove(); b.remove(); return; }
    a.classList.add('out'); b.classList.add('out'); setTimeout(() => { a.remove(); b.remove(); }, 160);
  }
  function sheet(id, label, html) {
    closeSheet(true); close();
    scrim = document.createElement('div'); scrim.className = 'ph-scrim lr-scrim'; scrim.onclick = () => closeSheet();
    sh = document.createElement('div'); sh.className = 'ph-sheet lr-sheet'; sh.id = id; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', label);
    sh.innerHTML = html; document.body.append(scrim, sh);
    sh.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); } });
    sh.querySelectorAll('[data-lr-close]').forEach(b => b.onclick = () => closeSheet());
    return sh;
  }
  const head = (eyebrow, title) => `<header class="ph-h"><div><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3></div><button type="button" class="su-x lr-x" data-lr-close aria-label="Close">${ic('x', 16)}</button></header>`;
  const swap = (el, fn) => (window.TribeMotion && window.TribeMotion.swap ? window.TribeMotion.swap(fn) : fn());

  // ---------- folders ----------
  function canPickFolder() {
    if (phone()) return { ok: false, why: 'Folders work in the desktop app on a computer, not on a phone.' };
    if (desktop() && window.__TAURI__.dialog && window.__TAURI__.dialog.open) return { ok: true, how: 'native' };
    if (localPage()) return { ok: true, how: 'browse' };
    return { ok: false, why: 'This page comes from the web. A folder home needs the TribeCode app on your computer.' };
  }
  function foundLine(sm) {
    if (!sm) return '';
    if (sm.empty) return '<p class="lr-found-t">Empty folder: it starts fresh.</p>';
    const chip = (on, t) => `<span class="lr-chip ${on ? 'on' : ''}">${on ? '✓' : '–'} ${esc(t)}</span>`;
    return `<p class="lr-found-t">${plural(sm.count, 'item')} here. TribeCode works with them in place.</p>
      <div class="lr-chips">${chip(sm.git, '.git')}${chip(sm.packageJson, 'package.json')}${chip(sm.indexHtml, 'index.html')}${chip(sm.readme, 'README')}</div>`;
  }
  // pickFolder: the sheet. o.pid: set that project's folder. o.onPick(choice) instead: hand back { path, display, summary, gitInit }.
  function pickFolder(o = {}) {
    const how = canPickFolder(); if (!how.ok) { toast(how.why); return null; }
    const moving = !!o.moving, inline = !!o.mount;
    const lazy = inline && how.how === 'browse';   // inline (create-a-tribe): nothing asks the host until you open the browser
    const inner = `${lazy ? '<button type="button" class="btn" id="lr-browse-go">Choose a folder…</button>' : ''}${how.how === 'native' ? '<button type="button" class="btn" id="lr-native">Choose a folder…</button>' : `<div class="lr-browse"${lazy ? ' hidden' : ''}><div class="lr-crumbs"><button type="button" class="ph-back lr-up" id="lr-up" aria-label="Up one folder">${ic('chev', 16)}</button><code id="lr-where">~</code></div>
        <div class="lr-dirs" id="lr-dirs" role="listbox" aria-label="Folders"></div>
        <form class="lr-mk" id="lr-mk"><input class="input" id="lr-mk-name" maxlength="80" placeholder="New folder name" aria-label="New folder name"><button class="btn sm" type="submit">New folder</button></form></div>`}
      <div class="lr-found" id="lr-found" hidden><code id="lr-chosen"></code><div id="lr-found-body"></div>
        <label class="lr-check" id="lr-git-l" hidden><input type="checkbox" id="lr-git" checked> Make it a git repo <small>optional: only GitHub sync needs it</small></label></div>
      <p class="tn-err ph-err" id="lr-ferr" role="status" hidden></p>`;
    let s;
    if (inline) { s = o.mount; s.innerHTML = `<div class="lr-inline-pick" id="lr-folder">${inner}</div>`; }
    else s = sheet('lr-folder', 'A folder on this computer', `${head('A folder on this computer', o.title || (moving ? 'Move it to another folder' : 'Pick its folder'))}
      <p class="ph-lead">${moving ? 'Pick an empty folder: the project’s files are copied there, and the old folder stays as it is.' : 'Files you edit in TribeCode are written straight into this folder, and edits from VS Code or anything else show up live.'}</p>
      ${inner}
      <div class="ph-acts"><button type="button" class="btn" data-lr-close>Cancel</button><button type="button" class="btn primary" id="lr-folder-go" disabled>${moving ? 'Move here' : 'Use this folder'}</button></div>`);
    let chosen = null, browsing = '';
    const err = t => { const e = $('#lr-ferr', s); if (/Failed to fetch|NetworkError|Load failed/i.test(t || '')) t = 'Couldn’t reach TribeCode on this computer to look at folders. Open the desktop app, or host the tribe here first.'; e.textContent = t || ''; e.hidden = !t; };
    const go = $('#lr-folder-go', s) || { disabled: true, textContent: '' };
    const pickOf = () => chosen && { path: chosen.path, display: chosen.display, summary: chosen.summary, gitInit: !$('#lr-git-l', s).hidden && $('#lr-git', s).checked, ...(o.shared ? { join: (s.querySelector('[data-join]:checked') || {}).value || '' } : {}) };
    const tell = () => { if (inline && o.onChange) o.onChange(pickOf()); };
    async function choose(path) {
      err(''); go.disabled = true; chosen = null; tell();
      let d = null;
      if (o.shared) {   // a folder your sync app keeps: the shared copies already in it, or a new one
        try { d = await srv('/folders/shared?path=' + encodeURIComponent(path), { auth: live() }); }
        catch (e) { if (how.how === 'native' && !base()) d = { path, display: path, repos: [] }; else { $('#lr-found', s).hidden = true; return err(e.message); } }
        chosen = { path: d.path, display: d.display, repos: d.repos || [] }; $('#lr-found', s).hidden = false; $('#lr-chosen', s).textContent = d.display;
        $('#lr-found-body', s).innerHTML = `${chosen.repos.length ? `<p class="lr-found-t">Shared TribeCode copies already here. Join one, or start a new one:</p>` : '<p class="lr-found-t">No shared copy here yet: TribeCode makes one, and friends with this folder join from it.</p>'}
          <div class="lr-joins">${chosen.repos.map((r, i) => `<label class="lr-radio"><input type="radio" name="lr-join" data-join value="${esc(r.name)}" ${i === 0 ? 'checked' : ''}><span><b>Join ${esc(r.title)}</b><small>${esc(r.name)}${r.at ? ' · updated ' + ago(r.at) : ''}</small></span></label>`).join('')}
          <label class="lr-radio"><input type="radio" name="lr-join" data-join value="" ${chosen.repos.length ? '' : 'checked'}><span><b>Start sharing here</b><small>A new shared copy in this folder</small></span></label></div>`;
        s.querySelectorAll('[data-join]').forEach(x => x.onchange = () => { go.textContent = x.value ? 'Join it' : 'Share through this folder'; tell(); });
        $('#lr-git-l', s).hidden = true;
        go.textContent = chosen.repos.length ? 'Join it' : 'Share through this folder'; go.disabled = false; tell(); return;
      }
      try { d = await srv('/folders/check', { method: 'POST', body: { path, project: o.pid || undefined }, auth: live() }); }
      catch (e) { if (how.how === 'native' && !base()) d = { path, display: path, summary: null }; else { $('#lr-found', s).hidden = true; return err(e.message); } }
      chosen = d; $('#lr-found', s).hidden = false; $('#lr-chosen', s).textContent = d.display;
      $('#lr-found-body', s).innerHTML = foundLine(d.summary);
      const noGit = d.summary && !d.summary.git; $('#lr-git-l', s).hidden = !noGit;
      if (moving && d.summary && !d.summary.empty) return err('Moving needs an empty folder. Make a new one, or pick an empty one.');
      go.textContent = moving ? 'Move here' : d.summary && !d.summary.empty ? 'Use what’s here' : 'Start fresh here';
      go.disabled = false; tell();
    }
    $('#lr-git', s).onchange = tell;
    async function browse(path) {
      try {
        const d = await srv('/folders/browse' + (path ? '?path=' + encodeURIComponent(path) : ''), { auth: live() });
        browsing = d.path; $('#lr-where', s).textContent = d.display; $('#lr-up', s).disabled = !d.parent; $('#lr-up', s).onclick = () => d.parent && browse(d.parent);
        $('#lr-dirs', s).innerHTML = d.dirs.length ? d.dirs.map(x => `<div class="lr-dir" role="option" tabindex="0" data-dir="${esc(x.path)}">${ic('folder', 15)}<span>${esc(x.name)}</span><button type="button" class="linkish" data-open="${esc(x.path)}">Open</button></div>`).join('') : '<p class="faint lr-none">No folders here. Make one below.</p>';
        $('#lr-dirs', s).querySelectorAll('[data-dir]').forEach(r => { r.onclick = e => { if (e.target.closest('[data-open]')) return; s.querySelectorAll('.lr-dir').forEach(x => x.setAttribute('aria-selected', String(x === r))); choose(r.dataset.dir); }; r.ondblclick = () => browse(r.dataset.dir); r.onkeydown = e => { if (e.key === 'Enter') r.click(); }; });
        $('#lr-dirs', s).querySelectorAll('[data-open]').forEach(b => b.onclick = () => browse(b.dataset.open));
        if (d.ok) choose(d.path); else { chosen = null; go.disabled = true; $('#lr-found', s).hidden = true; }
      } catch (e) { err(e.message); }
    }
    if (how.how === 'native') $('#lr-native', s).onclick = async () => {
      try { const p = await window.__TAURI__.dialog.open({ directory: true, multiple: false, title: 'Pick a folder for the project' }); if (p) choose(Array.isArray(p) ? p[0] : p); } catch (e) { err(String(e && e.message || e)); }
    };
    else {
      if (lazy) $('#lr-browse-go', s).onclick = () => { $('#lr-browse-go', s).hidden = true; $('.lr-browse', s).hidden = false; browse(o.start || ''); };
      else browse(o.start || '');
      $('#lr-mk', s).onsubmit = async e => {
        e.preventDefault(); const n = $('#lr-mk-name', s).value.trim(); if (!n) return;
        try { const d = await srv('/folders/mkdir', { method: 'POST', body: { parent: browsing, name: n }, auth: live() }); $('#lr-mk-name', s).value = ''; await browse(browsing); const row = s.querySelector(`[data-dir="${CSS.escape(d.path)}"]`); if (row) row.click(); else choose(d.path); }
        catch (x) { err(x.message); }
      };
    }
    if (o.path) choose(o.path);   // opened on a folder already picked (a folder dropped on the desktop app: dropzone.js)
    if (inline) return s;
    go.onclick = async () => {
      if (!chosen) return;
      const choice = pickOf();
      if (o.onPick) { closeSheet(); return o.onPick(choice); }
      go.disabled = true; go.textContent = moving ? 'Moving…' : 'Setting it up…';
      try {
        const r = await srv(`/projects/${encodeURIComponent(o.pid)}/folder`, { method: 'PUT', body: { path: choice.path, gitInit: choice.gitInit } });
        closeSheet(); toast(r.moved ? `Moved to ${r.folder.display}. The old folder is still there.` : `It lives in ${r.folder.display} now.`);
        refresh(); window.dispatchEvent(new CustomEvent('tribe-home-changed', { detail: { pid: o.pid } }));
      } catch (e) { go.disabled = false; go.textContent = moving ? 'Move here' : 'Use this folder'; err(e.message); }
    };
    return s;
  }
  async function folder(o = {}) {
    if (solo()) return soloToFolder(o.path);
    const p = o.pid || pid(); await load(true).catch(() => {});
    return pickFolder({ pid: p, path: o.path, moving: !!cur.folder || !!(cur.sync && cur.sync.status && cur.sync.status.hasFolder && !cur.folder && false) });
  }
  // A project on this device only: pick the folder, then this computer hosts it (setuplocal's host.computer) and it moves in.
  function soloToFolder(path) { return pickFolder({ title: 'Pick its folder', path, onPick: choice => soloTo(choice, 'folder') }); }
  async function soloTo(choice, kind) {
    {
      const s = sheet('lr-moving', 'Moving it', `${head('A folder on this computer', 'Moving it to your folder')}<div class="su-prog" role="status" aria-live="polite"><span class="su-spin" aria-hidden="true"></span><span id="lr-mv-t">Starting…</span></div><p class="tn-err ph-err" id="lr-mv-e" hidden></p>`);
      try {
        const r = await L().host.computer({ step: t => { const x = $('#lr-mv-t', s); if (x) x.textContent = t; }, noReload: true });
        if (!r || r.noApp || r.alreadyTribe) throw new Error(r && r.alreadyTribe ? 'This computer already hosts a tribe. Ask its host for an invite link.' : 'TribeCode isn’t running on this computer.');
        const first = (r.projects || [])[0];
        const call = async (path, o2) => { const x = await realFetch(`${r.server}/api${path}`, { method: o2.method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + r.token }, body: JSON.stringify(o2.body) }); const d = await x.json().catch(() => ({})); if (!x.ok) throw new Error(d.error || 'That didn’t take.'); return d; };
        if (kind === 'shared') await connectShared(first.id, choice, call);
        else await call(`/projects/${encodeURIComponent(first.id)}/folder`, { method: 'PUT', body: { path: choice.path, gitInit: choice.gitInit } });
        location.reload();
      } catch (e) { const x = $('#lr-mv-e', s); if (x) { x.textContent = e.message + ' Your project is safe on this device.'; x.hidden = false; } }
    }
  }

  // ---------- A shared folder (Dropbox, OneDrive, Google Drive, iCloud, a NAS, Syncthing) as the synced copy ----------
  const SHARED_LINE = 'A Dropbox, OneDrive, Google Drive or iCloud folder, a network share or a Syncthing folder you already sync. No account; friends with the same folder join from it.';
  async function connectShared(p, choice, call = srv) {
    const body = { shared: choice.path, ...(choice.join ? { sharedName: choice.join } : {}) };
    return choice.join ? call(`/projects/${encodeURIComponent(p)}/sync/join`, { method: 'POST', body }) : call(`/projects/${encodeURIComponent(p)}/sync`, { method: 'PUT', body: { kind: 'folder', ...body } });
  }
  function sharedFolder(after) {
    const how = canPickFolder(); if (!how.ok) { toast(how.why); return null; }
    return pickFolder({ shared: true, title: 'Share through a folder you already sync', onPick: async choice => {
      if (!live()) return soloTo(choice, 'shared');
      try { await connectShared(pid(), choice); refresh(); toast(choice.join ? 'Joined the shared copy: its files are here now.' : `Sharing through ${choice.display}. Ship to send changes; friends pull them.`); if (after) after(); }
      catch (e) { toast(e.message); }
    } });
  }

  // ---------- GitHub (a synced copy of any home) ----------
  async function github(after, replace) {
    if (solo()) return L() && L().choose ? L().choose('github') : null;
    await load(true).catch(() => {});
    const can = (cur.sync && cur.sync.can) || {}, st = (cur.sync && cur.sync.status) || {};
    if (st.connected && !replace) return sync();
    const s = sheet('lr-gh', 'Connect GitHub', `${head('Connect a GitHub repo', 'Give it a synced copy on GitHub')}
      <p class="ph-lead">The home stays the real thing. GitHub gets a copy when you ship, by hand or by itself. You can disconnect any time.</p>
      <div id="lr-gh-sign" class="lr-gh-sign"><span class="faint">Checking for a GitHub sign-in…</span></div>
      <label class="ph-lab" for="lr-gh-repo">Repository</label><input class="input" id="lr-gh-repo" placeholder="owner/name or https://github.com/owner/name" spellcheck="false">
      <label class="ph-lab" for="lr-gh-branch">Branch</label><input class="input" id="lr-gh-branch" value="main" spellcheck="false">
      <p class="ph-note">Nothing leaves this computer until you press Ship. Pick auto-ship in the settings after.</p>
      <p class="tn-err ph-err" id="lr-gh-err" role="status" hidden></p>
      <div class="ph-acts"><button type="button" class="btn" data-lr-close>Cancel</button><button type="button" class="btn primary" id="lr-gh-go" ${can.edit ? '' : 'disabled title="Only the host or the project lead connects GitHub"'}>Connect</button></div>`);
    const G = L() && L().github && L().github.guide;
    if (G) G.detect(true).then(d => { const box = $('#lr-gh-sign', s); if (!box) return; box.innerHTML = d.ready ? `<p class="lr-ok">✓ GitHub sign-in found (${esc(d.ready === 'gh' ? 'GitHub CLI' : d.ready === 'git' ? 'a git credential' : d.ready === 'browser' ? 'a token in this browser' : 'TribeCode’s GitHub sign-in')}).</p>` : `<details class="su-more lr-guide"><summary>No GitHub sign-in yet: how to add one</summary>${G.html(d)}</details>`; if (!d.ready && G.bind) try { G.bind(box, () => {}, () => github(after)); } catch {} }).catch(() => { const box = $('#lr-gh-sign', s); if (box) box.innerHTML = ''; });
    else $('#lr-gh-sign', s).innerHTML = '';
    const errf = t => { const e = $('#lr-gh-err', s); e.textContent = t || ''; e.hidden = !t; };
    $('#lr-gh-go', s).onclick = async () => {
      const repo = $('#lr-gh-repo', s).value.trim(); if (!repo) return errf('Type the repository as owner/name.');
      $('#lr-gh-go', s).disabled = true;
      try { await srv(`/projects/${encodeURIComponent(pid())}/sync`, { method: 'PUT', body: { kind: 'github', repo, branch: $('#lr-gh-branch', s).value.trim() || 'main' } }); closeSheet(); refresh(); if (after) after(); else sync(); }
      catch (e) { $('#lr-gh-go', s).disabled = false; errf(e.message); }
    };
    return s;
  }

  // ---------- Ship / sync settings (also a Settings section) ----------
  const TRIG = [['approve', 'On approve', 'When an approval in Work is approved'], ['done', 'On task Done', 'When a task moves to Done'], ['interval', 'Every few minutes', 'When there are changes'], ['save', 'On every save', 'Warning: every save goes to GitHub. Fine for a solo sketch, noisy for a team']];
  async function renderSync(el, p = pid()) {
    let d; try { d = await srv(`/projects/${encodeURIComponent(p)}/sync`); } catch (e) { el.innerHTML = `<p class="faint">${esc(e.message)}</p>`; return null; }
    const v = d.settings, st = d.status, ro = !d.can.edit, dis = ro ? 'disabled' : '';
    const seg = (name, val, opts) => `<div class="lr-seg" role="radiogroup">${opts.map(([k, t]) => `<button type="button" role="radio" data-${name}="${k}" aria-checked="${val === k}" ${dis}>${esc(t)}</button>`).join('')}</div>`;
    el.innerHTML = `${!st.connected ? `<p class="lr-warn">Nothing to ship to yet. <button type="button" class="linkish" id="lr-s-connect">Connect a GitHub repo</button> or <button type="button" class="linkish" id="lr-s-shared">share through a synced folder</button>. Until then nothing ships.</p>` : ''}
      ${ro ? '<p class="ph-note">Only the host or the project lead changes these. You can still ship by hand.</p>' : ''}
      <div class="lr-grid">
        <div><label class="ph-lab" for="lr-repo">${v.kind === 'folder' ? 'Shared folder copy' : 'Repository'}</label><input class="input" id="lr-repo" value="${esc(v.repo)}" placeholder="owner/name" ${v.kind === 'folder' ? 'readonly title="Pick another shared folder from the pill"' : dis}></div>
        <div><label class="ph-lab" for="lr-branch">Branch</label><input class="input" id="lr-branch" value="${esc(v.branch)}" ${dis}></div>
      </div>
      <span class="ph-lab">Shipping</span>${seg('mode', v.mode, [['manual', 'Manual'], ['auto', 'Auto-ship']])}
      <p class="ph-note" id="lr-mode-note">${v.mode === 'manual' ? 'Manual: a Ship button with what changed, a message and a target. Nothing leaves this computer until you press it.' : 'Auto-ship pushes by itself when the trigger below happens.'}</p>
      <div class="lr-auto" id="lr-auto" ${v.mode === 'auto' ? '' : 'hidden'}>
        <div class="lr-trig">${TRIG.map(([k, t, sub]) => `<label class="lr-radio"><input type="radio" name="lr-trig" data-trigger="${k}" ${v.trigger === k ? 'checked' : ''} ${dis}><span><b>${esc(t)}</b><small ${k === 'save' ? 'data-trigger-note' : ''}>${esc(sub)}</small></span></label>`).join('')}</div>
        <label class="lr-inline">Every <input class="input lr-num" id="lr-int" type="number" min="1" max="1440" value="${v.intervalMin}" ${dis}> minutes (for “every few minutes”)</label>
        <label class="lr-check"><input type="checkbox" id="lr-appr" ${v.requireApproval ? 'checked' : ''} ${dis}> Ask for approval before an auto-ship</label>
      </div>
      <span class="ph-lab">Where it goes</span>${v.kind === 'folder' ? '<p class="ph-note">Straight to the shared copy’s branch (pull requests are a GitHub thing).</p>' : seg('target', v.target, [['push', 'Push to the branch'], ['pr', 'A pull request per ship']])}
      <label class="ph-lab" for="lr-prt" ${v.target === 'pr' ? '' : 'hidden'} id="lr-prt-l">Pull request title</label><input class="input" id="lr-prt" value="${esc(v.prTitle)}" ${v.target === 'pr' ? '' : 'hidden'} ${dis}>
      <label class="ph-lab" for="lr-msg">Commit message</label>
      <select class="input" id="lr-msg" ${dis}><option value="auto" ${v.message === 'auto' ? 'selected' : ''}>Auto-summary of the changed files</option><option value="flint" ${v.message === 'flint' ? 'selected' : ''}>Flint writes it (needs an AI; else the auto-summary)</option><option value="own" ${v.message === 'own' ? 'selected' : ''}>My own</option></select>
      <input class="input" id="lr-own" placeholder="Your commit message" value="${esc(v.ownMessage)}" ${v.message === 'own' ? '' : 'hidden'} ${dis}>
      <label class="ph-lab" for="lr-ex">Also leave out <small class="faint">one pattern per line · .gitignore is respected · .tribe/ never ships</small></label>
      <textarea class="input" id="lr-ex" rows="2" placeholder="*.psd&#10;drafts/" ${dis}>${esc((v.exclude || []).join('\n'))}</textarea>
      <label class="lr-check"><input type="checkbox" id="lr-pull" ${v.pullFirst ? 'checked' : ''} ${dis}> Pull before ship</label>
      <label class="lr-inline">When GitHub changed the same lines: <select class="input" id="lr-conf" ${dis}><option value="stop" ${v.conflict === 'stop' ? 'selected' : ''}>Stop and show me</option><option value="mine" ${v.conflict === 'mine' ? 'selected' : ''}>Prefer mine</option><option value="theirs" ${v.conflict === 'theirs' ? 'selected' : ''}>Prefer GitHub’s</option></select></label>
      <label class="lr-inline">Pull from GitHub every <input class="input lr-num" id="lr-ap" type="number" min="0" max="1440" value="${v.autoPullMin}" ${dis}> minutes (0 is off)</label>
      <label class="lr-check"><input type="checkbox" id="lr-tag" ${v.tagMilestones ? 'checked' : ''} ${dis}> Tag a release on GitHub when a milestone is released</label>
      <label class="lr-inline">Sign commits as <select class="input" id="lr-sign" ${dis}><option value="member" ${v.signAs === 'member' ? 'selected' : ''}>each member</option><option value="bot" ${v.signAs === 'bot' ? 'selected' : ''}>the tribe bot</option></select></label>
      <label class="lr-check lr-pause"><input type="checkbox" id="lr-pause" ${v.paused ? 'checked' : ''} ${dis}> Pause sync <small>nothing ships or pulls until you turn it back on</small></label>
      <section class="lr-log"><div class="lr-log-h"><span class="eyebrow">Ship log</span>${d.can.undo && d.log.some(e => !e.undone && !e.revert && !e.pr) ? '<button type="button" class="btn sm" id="lr-undo">Undo last ship</button>' : '<button type="button" class="btn sm" id="lr-undo" disabled title="Nothing to undo yet">Undo last ship</button>'}</div>
        ${d.log.length ? `<ol>${d.log.slice(0, 8).map(e => `<li class="${e.undone ? 'undone' : ''}"><code>${esc(e.short || '')}</code><span>${esc(e.message || '')}</span><small>${esc(e.byName || '')} · ${esc(e.why)} · ${ago(e.at)}${e.pr ? ` · <a href="${esc(e.pr.url)}" target="_blank" rel="noopener">PR #${esc(e.pr.number)}</a>` : ''}${e.undone ? ' · undone' : ''}</small></li>`).join('')}</ol>` : '<p class="faint">No ships yet.</p>'}</section>`;
    const q = s => el.querySelector(s);
    const pickSeg = (name, cb) => el.querySelectorAll(`[data-${name}]`).forEach(b => b.onclick = () => { el.querySelectorAll(`[data-${name}]`).forEach(x => x.setAttribute('aria-checked', String(x === b))); cb && cb(b.dataset[name]); });
    pickSeg('mode', m => { q('#lr-auto').hidden = m !== 'auto'; q('#lr-mode-note').textContent = m === 'manual' ? 'Manual: a Ship button with what changed, a message and a target. Nothing leaves this computer until you press it.' : 'Auto-ship pushes by itself when the trigger below happens.'; });
    pickSeg('target', t => { q('#lr-prt').hidden = q('#lr-prt-l').hidden = t !== 'pr'; });
    q('#lr-msg').onchange = () => { q('#lr-own').hidden = q('#lr-msg').value !== 'own'; };
    const c = q('#lr-s-connect'); if (c) c.onclick = () => { closeSheet(true); github(); };
    const c2 = q('#lr-s-shared'); if (c2) c2.onclick = () => { closeSheet(true); sharedFolder(); };
    const u = q('#lr-undo'); if (u && !u.disabled) u.onclick = async () => {
      if (!confirm('Undo the last ship? TribeCode adds a commit that reverses it and pushes that.')) return;
      u.disabled = true; try { await srv(`/projects/${encodeURIComponent(p)}/sync/undo`, { method: 'POST' }); toast('Undone: a revert commit is on GitHub.'); renderSync(el, p); refresh(); } catch (e) { u.disabled = false; toast(e.message); }
    };
    const read = () => ({ ...(v.kind === 'folder' ? {} : { repo: q('#lr-repo').value.trim() }), branch: q('#lr-branch').value.trim() || 'main', mode: (el.querySelector('[data-mode][aria-checked="true"]') || {}).dataset?.mode || 'manual',
      trigger: (el.querySelector('[data-trigger]:checked') || {}).dataset?.trigger || v.trigger, intervalMin: Number(q('#lr-int').value) || 15, requireApproval: q('#lr-appr').checked,
      target: (el.querySelector('[data-target][aria-checked="true"]') || {}).dataset?.target || 'push', prTitle: q('#lr-prt').value, message: q('#lr-msg').value, ownMessage: q('#lr-own').value,
      exclude: q('#lr-ex').value, pullFirst: q('#lr-pull').checked, conflict: q('#lr-conf').value, autoPullMin: Number(q('#lr-ap').value) || 0, tagMilestones: q('#lr-tag').checked, signAs: q('#lr-sign').value, paused: q('#lr-pause').checked });
    return { read, can: d.can, data: d, save: async () => { const body = read(); if (!body.repo) delete body.repo; if (v.kind === 'folder') delete body.target; await srv(`/projects/${encodeURIComponent(p)}/sync`, { method: 'PUT', body }); refresh(); } };
  }
  async function sync() {
    if (solo()) return L() && L().choose ? L().choose('github') : null;
    const s = sheet('lr-sync', 'Ship and sync settings', `${head('Ship / sync settings', 'How it ships and syncs')}<div id="lr-sync-body" class="lr-sync-body"><p class="faint">Loading…</p></div>
      <p class="tn-err ph-err" id="lr-sync-err" role="status" hidden></p>
      <div class="ph-acts"><button type="button" class="btn lr-disc" id="lr-disc" hidden>Disconnect GitHub</button><span class="lr-sp"></span><button type="button" class="btn" data-lr-close>Cancel</button><button type="button" class="btn primary" id="lr-save">Save</button></div>`);
    const f = await renderSync($('#lr-sync-body', s)); if (!f || !sh) return s;
    const save = $('#lr-save', s), disc = $('#lr-disc', s);
    if (!f.can.edit) { save.hidden = true; }
    if (f.can.edit && f.data.status.connected) { disc.hidden = false; if (f.data.status.kind === 'folder') disc.textContent = 'Stop sharing'; disc.onclick = async () => { if (!confirm(f.data.status.kind === 'folder' ? 'Stop sharing through the folder? The shared copy stays where it is.' : 'Disconnect GitHub? Nothing on GitHub is deleted.')) return; await srv(`/projects/${encodeURIComponent(pid())}/sync`, { method: 'DELETE' }).catch(e => toast(e.message)); closeSheet(); refresh(); }; }
    save.onclick = async () => { save.disabled = true; try { await f.save(); closeSheet(); toast('Saved.'); } catch (e) { save.disabled = false; const x = $('#lr-sync-err', s); x.textContent = e.message; x.hidden = false; } };
    return s;
  }

  // ---------- Ship (manual) ----------
  async function ship() {
    await load(true).catch(() => {});
    const st = (cur.sync && cur.sync.status) || {}, v = (cur.sync && cur.sync.settings) || {};
    if (!st.connected) return github(() => ship());
    const s = sheet('lr-ship', 'Ship', `${head(`Ship to ${st.repo}`, st.state === 'conflict' ? 'GitHub changed the same lines' : 'Ship what changed')}<div id="lr-ship-body"><p class="faint">Looking at what changed…</p></div>
      <p class="tn-err ph-err" id="lr-ship-err" role="status" hidden></p><div class="ph-acts" id="lr-ship-acts"></div>`);
    const body = $('#lr-ship-body', s), acts = $('#lr-ship-acts', s), errf = t => { const e = $('#lr-ship-err', s); e.textContent = t || ''; e.hidden = !t; };
    if (st.state === 'conflict') {
      body.innerHTML = `<p class="ph-lead">Sync stopped so nothing is lost. These files changed here and on GitHub:</p><ul class="lr-files">${(st.conflict.files || []).map(f => `<li><code>${esc(f)}</code></li>`).join('')}</ul>
        <p class="ph-note">Keep mine uses this folder’s lines where they clash; Take GitHub’s uses GitHub’s. Everything else from both sides is kept.</p>`;
      acts.innerHTML = '<button type="button" class="btn" data-lr-close>Later</button><button type="button" class="btn" data-use="theirs">Take GitHub’s</button><button type="button" class="btn primary" data-use="mine">Keep mine</button>';
      acts.querySelector('[data-lr-close]').onclick = () => closeSheet();
      acts.querySelectorAll('[data-use]').forEach(b => b.onclick = async () => { b.disabled = true; try { await srv(`/projects/${encodeURIComponent(pid())}/sync/resolve`, { method: 'POST', body: { use: b.dataset.use } }); closeSheet(); refresh(); toast('Sorted. Ship when you’re ready.'); } catch (e) { b.disabled = false; errf(e.message); } });
      return s;
    }
    let ch; try { ch = await srv(`/projects/${encodeURIComponent(pid())}/sync/changes`); } catch (e) { body.innerHTML = ''; errf(e.message); return s; }
    const n = ch.files.length;
    body.innerHTML = `<p class="ph-lead">${n ? `${plural(n, 'file')} changed${ch.ahead ? ` and ${plural(ch.ahead, 'saved change')} waiting` : ''}.` : ch.ahead ? `${plural(ch.ahead, 'saved change')} waiting.` : 'Nothing new since the last ship.'}</p>
      ${n ? `<ul class="lr-files">${ch.files.slice(0, 8).map(f => `<li><span class="lr-st">${esc(f.state)}</span><code>${esc(f.path)}</code></li>`).join('')}${n > 8 ? `<li class="faint">and ${n - 8} more</li>` : ''}</ul>` : ''}
      <label class="ph-lab" for="lr-ship-msg">Message</label><input class="input" id="lr-ship-msg" maxlength="300" placeholder="${esc(v.message === 'own' && v.ownMessage ? v.ownMessage : ch.summary)}">
      <label class="ph-lab" for="lr-ship-tgt">Target</label><select class="input" id="lr-ship-tgt"><option value="push" ${v.target !== 'pr' ? 'selected' : ''}>Push to ${esc(v.branch)}</option><option value="pr" ${v.target === 'pr' ? 'selected' : ''}>Open a pull request into ${esc(v.branch)}</option></select>
      ${v.paused ? '<p class="lr-warn">Sync is paused. Resume it in the settings to ship.</p>' : ''}`;
    acts.innerHTML = `<button type="button" class="btn" data-lr-close>Cancel</button><button type="button" class="btn primary" id="lr-ship-go" ${n || ch.ahead ? '' : 'disabled'} ${v.paused ? 'disabled' : ''}>Ship</button>`;
    acts.querySelector('[data-lr-close]').onclick = () => closeSheet();
    $('#lr-ship-go', s).onclick = async () => {
      const b = $('#lr-ship-go', s); b.disabled = true; b.textContent = 'Shipping…'; errf('');
      try { const r = await srv(`/projects/${encodeURIComponent(pid())}/sync/ship`, { method: 'POST', body: { message: $('#lr-ship-msg', s).value.trim() || undefined, target: $('#lr-ship-tgt', s).value } }); closeSheet(); refresh(); toast(r.shipped ? (r.entry.pr ? `Opened pull request #${r.entry.pr.number}.` : `Shipped ${r.entry.short} to ${st.repo}.`) : r.note); }
      catch (e) { b.disabled = false; b.textContent = 'Ship'; errf(e.message); if (e.status === 409) refresh(); }
    };
    return s;
  }

  // ---------- Share: three paths ----------
  const WAYS = [
    ['anywhere', 'net', 'Work with friends anywhere', 'A GitHub repo holds the code and TribeCode’s invite link brings friends in, from any network. Needs a GitHub repo.', true],
    ['network', 'users', 'Share on this network', 'Friends on the same Wi-Fi join this computer with a link or a QR code. No GitHub, but only while this computer is on.'],
    ['folder', 'folder', 'Share through a folder you already sync', 'A Dropbox, OneDrive, Google Drive, iCloud, NAS or Syncthing folder holds a shared copy. No account or server; friends with the folder push and pull.'],
    ['solo', 'spark', 'Just me for now', 'It stays on this device or in its folder. Nothing is shared; switch any time.'],
  ];
  async function inviteLink(lan) {
    const d = await srv('/invites', { method: 'POST', body: { hours: 72, maxUses: 10, role: 'builder', ...(pid() ? { project: pid() } : {}) } });
    let host = base() || location.origin;
    if (lan) { try { const h = await srv('/health', { auth: false }); const l = (h.lan || []).find(x => x.kind === 'lan') || (h.lan || [])[0]; if (l) host = l.url; } catch {} }
    return `${String(host).replace(/\/+$/, '')}/join/${d.invite.code}`;
  }
  function linkBox(url) {
    let qr = ''; try { qr = window.TribeQR ? window.TribeQR.svg(url) : ''; } catch {}
    return `<div class="su-cmd tn-link lr-link"><input class="input" id="lr-share-link" readonly value="${esc(url)}" aria-label="Invite link"><button type="button" class="btn" id="lr-share-copy">Copy</button></div>${qr ? `<div class="lr-qr" aria-label="QR code to join">${qr}</div>` : ''}`;
  }
  function bindCopy(s) { const b = $('#lr-share-copy', s), i = $('#lr-share-link', s); if (b) b.onclick = async () => { i.select(); try { await navigator.clipboard.writeText(i.value); b.textContent = 'Copied'; } catch { toast(i.value); } }; }
  async function share() {
    if (!live()) {   // this device only: sharing needs a home first
      const s = sheet('lr-share', 'Share', `${head('Share', 'How should friends join?')}<div class="ph-list">${WAYS.map(([k, icn, t, sub, rec]) => `<button type="button" class="ph-row" data-share="${k}"><span class="ph-ic${rec ? ' live' : ''}">${ic(icn, 18)}</span><span class="ph-tt"><b>${esc(t)}${rec ? ' <em class="ph-tag">Recommended</em>' : ''}</b><small>${esc(sub)}</small></span></button>`).join('')}</div><div id="lr-share-detail"></div>`);
      s.querySelectorAll('[data-share]').forEach(b => b.onclick = () => { closeSheet(true); if (b.dataset.share === 'anywhere') L() && L().choose('github'); else if (b.dataset.share === 'network') L() && L().choose('computer'); else if (b.dataset.share === 'folder') sharedFolder(); else toast('It stays on this device. Share any time from the pill at the top.'); });
      return s;
    }
    await load(true).catch(() => {});
    const s = sheet('lr-share', 'Share', `${head('Share', 'How should friends join?')}
      <div class="ph-list lr-ways" role="radiogroup" aria-label="Ways to share">${WAYS.map(([k, icn, t, sub, rec]) => `<button type="button" class="ph-row" role="radio" aria-checked="false" data-share="${k}"><span class="ph-ic${rec ? ' live' : ''}">${ic(icn, 18)}</span><span class="ph-tt"><b>${esc(t)}${rec ? ' <em class="ph-tag">Recommended</em>' : ''}</b><small>${esc(sub)}</small></span></button>`).join('')}</div>
      <div id="lr-share-detail" class="lr-share-detail"></div><p class="tn-err ph-err" id="lr-share-err" role="status" hidden></p>
      <p class="ph-foot">You can switch later from Sharing and backup on the dashboard.</p>`);
    const det = $('#lr-share-detail', s), errf = t => { const e = $('#lr-share-err', s); e.textContent = t || ''; e.hidden = !t; };
    const shared = () => { try { localStorage.setItem(`tribecode.ov.${pid()}.shared`, '1'); } catch {} };   // the steps card's "Share it"
    const pick = k => s.querySelectorAll('[data-share]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.share === k)));
    s.querySelectorAll('[data-share]').forEach(b => b.onclick = () => { pick(b.dataset.share); errf(''); swap(det, () => paths[b.dataset.share]()); });
    const paths = {
      async anywhere() {
        await load(true).catch(() => {});
        const st = (cur.sync && cur.sync.status) || {}, v = (cur.sync && cur.sync.settings) || {}, can = (cur.sync && cur.sync.can) || {};
        det.innerHTML = `<ol class="ph-steps lr-steps">
          <li data-step="repo"><b>The GitHub repo.</b> ${st.connected ? `Connected: <code>${esc(st.repo)}</code> ✓` : `<span class="lr-row"><input class="input" id="lr-sh-repo" placeholder="owner/name" spellcheck="false" ${can.edit ? '' : 'disabled'}><button type="button" class="btn sm" id="lr-sh-conn" ${can.edit ? '' : 'disabled'}>Connect</button></span><small class="faint">Make an empty repo on github.com first, or use one you have.</small>`}</li>
          <li data-step="ship"><b>How it ships.</b> <span class="lr-seg" role="radiogroup"><button type="button" role="radio" data-ship-pick="manual" aria-checked="${v.mode !== 'auto'}" ${can.edit ? '' : 'disabled'}>Manual</button><button type="button" role="radio" data-ship-pick="auto" aria-checked="${v.mode === 'auto'}" ${can.edit ? '' : 'disabled'}>Auto-ship on task Done</button></span></li>
          <li data-step="invite"><b>Invite friends.</b> <button type="button" class="btn primary sm" id="lr-share-go">Make the invite link</button></li></ol><div id="lr-share-out"></div>`;
        let mode = v.mode === 'auto' ? 'auto' : 'manual';
        det.querySelectorAll('[data-ship-pick]').forEach(b => b.onclick = () => { mode = b.dataset.shipPick; det.querySelectorAll('[data-ship-pick]').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
        const conn = $('#lr-sh-conn', det);
        if (conn) conn.onclick = async () => { const r = $('#lr-sh-repo', det).value.trim(); if (!r) return errf('Type the repository as owner/name.'); conn.disabled = true; try { await srv(`/projects/${encodeURIComponent(pid())}/sync`, { method: 'PUT', body: { repo: r } }); refresh(); paths.anywhere(); } catch (e) { conn.disabled = false; errf(e.message); } };
        $('#lr-share-go', det).onclick = async () => {
          const b = $('#lr-share-go', det); b.disabled = true; errf('');
          try {
            const fresh = await load(true); const on = fresh.sync && fresh.sync.status && fresh.sync.status.connected;
            if (!on) throw new Error('Connect the GitHub repo first (step 1).');
            if (can.edit && (fresh.sync.settings.mode !== mode || (mode === 'auto' && fresh.sync.settings.trigger !== 'done'))) await srv(`/projects/${encodeURIComponent(pid())}/sync`, { method: 'PUT', body: mode === 'auto' ? { mode, trigger: 'done' } : { mode } });
            const url = await inviteLink(false); $('#lr-share-out', det).innerHTML = linkBox(url); bindCopy(det); refresh(); shared();
          } catch (e) { b.disabled = false; errf(e.message); }
        };
      },
      async network() {
        det.innerHTML = '<p class="faint">Making a link for this network…</p>';
        try { const url = await inviteLink(true); det.innerHTML = `<p class="ph-lead">Friends on the same Wi-Fi open this link or scan the code. It works while this computer runs TribeCode.</p>${linkBox(url)}`; bindCopy(det); shared(); }
        catch (e) { det.innerHTML = ''; errf(e.message); }
      },
      folder() {
        const st = (cur.sync && cur.sync.status) || {}, pick = canPickFolder();
        det.innerHTML = st.connected && st.kind === 'folder' ? `<p class="ph-lead">Sharing through <code>${esc(st.repo)}</code>. Friends who sync the same folder pick “Join from a shared folder” and choose it; Ship sends your changes, Pull brings theirs.</p>`
          : `<p class="ph-lead">${esc(SHARED_LINE)}</p><div class="ph-acts"><button type="button" class="btn primary" id="lr-share-folder" ${pick.ok ? '' : `disabled title="${esc(pick.why)}"`}>Pick the shared folder</button></div>${pick.ok ? '' : `<p class="ph-note">${esc(pick.why)}</p>`}`;
        const b = $('#lr-share-folder', det); if (b) b.onclick = () => { closeSheet(true); sharedFolder(() => share()); };
        shared();
      },
      solo() {
        det.innerHTML = `<p class="ph-lead" data-solo-done>It stays ${cur.folder ? `in <code>${esc(cur.folder.display)}</code>` : 'where it is'}. Nobody else sees it. Share any time from the pill at the top.</p><div class="ph-acts"><button type="button" class="btn primary" data-lr-close>Done</button></div>`;
        det.querySelector('[data-lr-close]').onclick = () => closeSheet(); shared();
      },
    };
    return s;
  }
  // The project's Invite: the three ways sit at the top of the invite sheet
  new MutationObserver(() => {
    const box = document.getElementById('tl-box'); if (!box || document.getElementById('lr-inv-ways') || !live()) return;
    const w = document.createElement('div'); w.id = 'lr-inv-ways'; w.className = 'lr-inv-ways';
    w.innerHTML = `<span class="eyebrow">Ways to share</span><div>${WAYS.filter(x => x[0] !== 'solo').map(([k, , t, , rec]) => `<button type="button" class="btn sm${rec ? ' primary' : ''}" data-inv-way="${k}">${esc(t)}</button>`).join('')}${canPickFolder().ok ? '<button type="button" class="btn sm" data-inv-join>Join from a shared folder</button>' : ''}</div>`;
    box.parentNode.insertBefore(w, box);
    const jb = w.querySelector('[data-inv-join]'); if (jb) jb.onclick = () => { const m = document.getElementById('invite-modal'); if (m) m.classList.add('hidden'); sharedFolder(); };
    w.querySelectorAll('[data-inv-way]').forEach(b => b.onclick = async () => { const m = document.getElementById('invite-modal'); if (m) m.classList.add('hidden'); const s = await share(); const r = s && s.querySelector(`[data-share="${b.dataset.invWay}"]`); if (r) r.click(); });
  }).observe(document.body, { childList: true, subtree: true });

  // "Choose where it lives": the steps card and Flint open this; one sheet, folder or GitHub (or both)
  async function where(o = {}) {
    if (solo()) return L() && L().where ? L().where() : null;
    await load(true).catch(() => {});
    const pick = canPickFolder(), st = (cur.sync && cur.sync.status) || {};
    const s = sheet('lr-where', 'Where it lives', `${head('Where it lives', 'Its home is its living repo')}
      <p class="ph-lead">The home holds the real files. GitHub is an optional synced copy on top, for any home.</p>
      <div class="ph-list">
        <button type="button" class="ph-row" data-w="folder" ${pick.ok ? '' : 'aria-disabled="true"'}><span class="ph-ic">${ic('folder', 18)}</span><span class="ph-tt"><b>${cur.folder ? `Folder · ${esc(cur.folder.display)}` : 'A folder on this computer'}${desktop() ? ' <em class="ph-tag">Recommended</em>' : ''}</b><small>${pick.ok ? (cur.folder ? 'Move it to another folder' : 'Your own folder: edit here or in VS Code, both stay in step') : esc(pick.why)}</small></span></button>
        ${o.onHost ? `<button type="button" class="ph-row" data-w="host"><span class="ph-ic">${ic('box', 18)}</span><span class="ph-tt"><b>Here, on the tribe’s host</b><small>One click: a living repo in the tribe’s own folder, with every change saved</small></span></button>` : ''}
        <button type="button" class="ph-row" data-w="shared" ${pick.ok ? '' : 'aria-disabled="true"'}><span class="ph-ic">${ic('net', 18)}</span><span class="ph-tt"><b>${st.connected && st.kind === 'folder' ? `Shared folder · ${esc(st.repo)}` : 'A shared folder'}</b><small>${pick.ok ? esc(SHARED_LINE) : esc(pick.why)}</small></span></button>
        <button type="button" class="ph-row" data-w="github"><span class="ph-ic live">${ic('git', 18)}</span><span class="ph-tt"><b>${st.connected ? `GitHub · ${esc(st.repo)}` : 'Connect a GitHub repo'}</b><small>${st.connected ? 'Ship / sync settings' : 'A synced copy friends can reach from anywhere. Manual or auto-ship'}</small></span></button>
      </div>`);
    s.querySelector('[data-w="folder"]').onclick = () => (pick.ok ? folder({ pid: pid() }) : toast(pick.why));
    s.querySelector('[data-w="github"]').onclick = () => (st.connected && st.kind === 'github' ? sync() : github(null, true));
    s.querySelector('[data-w="shared"]').onclick = () => (pick.ok ? sharedFolder() : toast(pick.why));
    const h = s.querySelector('[data-w="host"]'); if (h) h.onclick = () => { closeSheet(); o.onHost(); };
    return s;
  }

  // Settings › Projects & sync (feat/settings-tabs) when it exists; the pill is always the way in.
  function registerSettings() {
    const T = window.TribeSettings; if (!T || !T.addSection || registerSettings.done) return;
    registerSettings.done = true;
    try { T.addSection('projects', { id: 'ship-sync', title: 'Ship & sync', render: async el => { if (!live()) { el.innerHTML = '<p class="faint">Ship and sync settings belong to a project in a tribe.</p>'; return; } const f = await renderSync(el); if (f && f.can.edit) { const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = 'Save'; b.onclick = () => f.save().then(() => toast('Saved.')).catch(e => toast(e.message)); el.appendChild(b); } } }); } catch {}
  }

  // ---------- live updates ----------
  let qt = 0; const soon = () => { clearTimeout(qt); qt = setTimeout(refresh, 250); };
  const hook = () => {
    const c = C(); if (!c || !c.on) return setTimeout(hook, 300);
    ['hello', 'projects', 'project'].forEach(ev => c.on(ev, soon));
    c.on('status', () => { if (live() !== !pill.classList.contains('hidden')) soon(); });
    c.on('ws', m => {
      if (!m || m.project !== pid()) return;
      if (m.type === 'sync') soon();
      if (m.type === 'folder-change') { soon(); window.dispatchEvent(new CustomEvent('tribe-folder-change', { detail: m })); }
    });
    soon(); registerSettings();
  };
  hook(); if (S() && S().on) S().on(soon);
  document.addEventListener('DOMContentLoaded', registerSettings);

  window.TribeHome = { refresh, open, close, where, folder, sharedFolder, connectShared, SHARED_LINE, pickFolder, canPickFolder, github, sync, renderSync, ship, share, statusText, closeSheet, load, state: () => ({ ...cur }) };
})();
