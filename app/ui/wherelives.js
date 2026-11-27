// Where it lives (pass 4, docs/WHERE-IT-LIVES.md): one plain sheet for a project's website and phone app.
// Three steps, each with what is true there and the one button for the next step:
//   1 In a folder        the design is real files in the project's folder (server/designfiles.js writes them a moment
//                        after every save): site/ and app-web/. Open the folder; double-click index.html.
//   2 With your friends  one invite link; friends change the same website and app, live, while the tribe can be reached.
//   3 Online             a public address that stays up (Publish › A link that stays up, on the person's own GitHub).
// It also asks the one question the folder can raise: files changed outside TribeCode are never written over silently
// ("Use the design" copies theirs to .my-changes first; "Keep my files" stops the designer writing that folder).
// Reached from the website designer (download menu), App Creator (Export menu) and the Publish sheet.
// Public: window.TribeWhere = { open(pid?, kind?), close(), status(pid), check(pid, kind), ask(pid, kind, status) }
(function () {
  'use strict';
  const C = window.TribeClient;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const F = (s, v) => T(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const ico = (n, s) => (window.TribeIcons && window.TribeIcons.has && window.TribeIcons.has(n) ? window.TribeIcons.svg(n, s || 16) : '');
  const online = () => !!(C && C.hasToken && C.hasToken() && C.connected && C.connected());
  const pidNow = () => (C && C.project && C.project()) || '';
  const KIND = { site: 'website', app: 'phone app' };
  let st = null, asking = null;

  // our own drawings: plain strokes in the app's tokens
  const DRAW = {
    folder: '<svg class="whl-draw" viewBox="0 0 72 56" aria-hidden="true"><rect x="6" y="6" width="60" height="38" rx="4" class="whl-d-body"/><path d="M26 50h20M36 44v6" class="whl-d-line"/><path d="M22 20h9l3 3h16v13H22z" class="whl-d-hot"/></svg>',
    friends: '<svg class="whl-draw" viewBox="0 0 72 56" aria-hidden="true"><circle cx="20" cy="20" r="7" class="whl-d-body"/><path d="M8 44c0-8 5-12 12-12s12 4 12 12" class="whl-d-body"/><circle cx="52" cy="20" r="7" class="whl-d-body"/><path d="M40 44c0-8 5-12 12-12s12 4 12 12" class="whl-d-body"/><path d="M29 22h14M39 18l4 4-4 4" class="whl-d-hot"/></svg>',
    online: '<svg class="whl-draw" viewBox="0 0 72 56" aria-hidden="true"><circle cx="36" cy="28" r="20" class="whl-d-body"/><path d="M16 28h40M36 8c8 6 8 34 0 40M36 8c-8 6-8 34 0 40" class="whl-d-line"/><circle cx="50" cy="14" r="5" class="whl-d-hotfill"/></svg>',
  };

  async function status(pid) { return C.api(`/projects/${encodeURIComponent(pid)}/design-files`, { project: pid }); }
  async function load(pid) {
    const out = { files: null, pub: null, people: 0 };
    if (!online()) return out;
    await Promise.all([
      status(pid).then(v => { out.files = v; }).catch(() => {}),
      C.api('/publish/real?project=' + encodeURIComponent(pid), { project: pid }).then(v => { out.pub = v; }).catch(() => {}),
    ]);
    const s = (C.state && C.state()) || {};
    out.people = (s.members || []).filter(m => m.role !== 'agent').length;
    return out;
  }

  async function open(pid, kind) {
    pid = pid || pidNow();
    if (!window.TribeUI || !window.TribeUI.sheet) return;
    if (st && st.sheet) close();
    const proj = ((C && C.state && C.state().projects) || []).find(p => p.id === pid) || {};
    st = { pid, kind: KIND[kind] ? kind : '', name: proj.name || '' };
    st.sheet = window.TribeUI.sheet({ id: 'whl-sheet', wide: true, eyebrow: 'Where it lives', title: proj.name || 'Your project',
      body: `<div class="whl" id="whl"><p class="faint">${esc(T('Checking your project…'))}</p></div>`, onClose: () => { st = null; } });
    st.sheet.el.classList.add('whl-sheet');
    const data = pid ? await load(pid) : { files: null, pub: null, people: 0 }; if (!st) return;
    Object.assign(st, data); draw();
  }
  function close() { if (st && st.sheet) st.sheet.close(); st = null; }

  const filesLine = (f, kind) => { const x = f && f[kind]; if (!x || !x.has) return ''; return `<li><code>${esc(x.folder)}/</code> <span>${esc(F(kind === 'site' ? 'the website, {n} files' : 'the phone app, {n} files', { n: x.files || '' }))}</span>${x.hands ? `<small>${esc(T('You keep your own files here. The designer is not writing this folder.'))} <button type="button" class="linkish" data-whl-use="${kind}">${esc(T('Write the design again'))}</button></small>` : ''}</li>`; };
  function heldBox(f) {
    return ['site', 'app'].filter(k => f && f[k] && f[k].held && f[k].held.length).map(k => `<div class="whl-warn" data-whl-held="${k}"><b>${esc(F(k === 'site' ? 'Files of the website were changed outside TribeCode' : 'Files of the phone app were changed outside TribeCode'))}</b>
      <p>${esc(f[k].held.slice(0, 6).join(', '))}${f[k].held.length > 6 ? ' …' : ''}</p>
      <p class="faint">${esc(T('Nothing was written over them. Choose which one the folder keeps.'))}</p>
      <div class="whl-row"><button type="button" class="btn" data-whl-use="${k}">${esc(T('Use the design'))}</button><button type="button" class="btn" data-whl-mine="${k}">${esc(T('Keep my files'))}</button></div>
      <small class="faint">${esc(T('Use the design: your versions are copied to the .my-changes folder first. Keep my files: the designer stops writing this folder, and publishing uses your files.'))}</small></div>`).join('');
  }
  function draw() {
    if (!st || !st.sheet) return;
    const root = st.sheet.el.querySelector('#whl'); if (!root) return;
    const f = st.files, pub = st.pub, pg = pub && pub.dest && pub.dest.pages, play = pub && pub.play;
    const none = !f || (!f.site.has && !f.app.has);
    const step = (n, key, title, line, state, body) => `<section class="whl-step" data-whl-step="${key}"><div class="whl-pic">${DRAW[key]}</div><div class="whl-t"><span class="eyebrow">${esc(F('Step {n} of 3', { n }))}</span><h4>${esc(T(title))}${state ? ` <span class="whl-tag">${esc(T(state))}</span>` : ''}</h4><p>${esc(T(line))}</p>${body}</div></section>`;
    const s1 = !online() ? `<p class="faint">${esc(T('With no tribe, your design is kept in this browser. Start or join a tribe and it becomes files in a folder.'))}</p>`
      : none ? `<p class="faint">${esc(T('Nothing here yet. Make a website or a phone app in Design and its files appear in the folder by themselves.'))}</p>`
        : `${heldBox(f)}<ul class="whl-files">${filesLine(f, 'site')}${filesLine(f, 'app')}</ul><p class="whl-path"><code id="whl-folder">${esc(f.folder)}</code></p>
          <div class="whl-row">${f.canOpen ? `<button type="button" class="btn" data-whl-open>${esc(T('Open the folder'))}</button>` : `<small class="faint">${esc(T('The folder is where this tribe is kept. Open it on that computer.'))}</small>`}</div>
          <small class="faint">${esc(T('Every change is written there a moment after you make it. Double-click index.html to open it with no internet.'))}</small>`;
    const keep = window.TribeCopy ? `<div class="whl-row"><button type="button" class="btn" data-whl-save>${esc(T('Save on this computer'))}</button><button type="button" class="btn" data-whl-load>${esc(T('Open a saved tribe'))}</button>${window.TribeCopy.line() ? `<small class="faint" data-whl-saved>${esc(window.TribeCopy.line())}</small>` : ''}</div>` : '';
    const s2 = `<div class="whl-row"><button type="button" class="btn${!none && st.people < 2 ? ' primary' : ''}" data-whl-invite>${esc(T('Invite a friend'))}</button>${window.TribeCopy ? `<button type="button" class="btn" data-whl-show>${esc(T('Show a friend'))}</button>` : ''}${st.people > 1 ? `<span class="faint">${esc(F('{n} people are in this tribe', { n: st.people }))}</span>` : ''}</div>
      <small class="faint">${esc(T('It reaches friends while the tribe can be reached. When it cannot, they see a plain message and what they typed waits on their device.'))}</small>
      ${window.TribeStatus ? `<div class="whl-row whl-runs"><span class="faint">${esc(T('Where your tribe runs'))}:</span> <button type="button" class="linkish" data-whl-runs>${esc(window.TribeStatus.now().label)}</button> <button type="button" class="linkish" data-whl-server>${esc(T('Run your own server'))}</button></div>` : ''}`;   // p10
    const link = pg ? pg.url : '';
    const s3 = `${link ? `<p class="whl-path"><a href="${esc(link)}" target="_blank" rel="noopener" id="whl-link">${esc(link)}</a></p>` : ''}
      <div class="whl-row"><button type="button" class="btn${!none && st.people > 1 && !link ? ' primary' : ''}" data-whl-online ${none ? 'disabled' : ''}>${esc(T(link ? 'Update it' : 'Put it online'))}</button>${!link && play ? `<span class="faint">${esc(T('It has a play link, which works while the tribe can be reached.'))}</span>` : ''}</div>
      <small class="faint">${esc(T('A public address on your own GitHub account, free. It stays up when every computer is off.'))}</small>
      <div class="whl-row"><span class="ghc-chip" id="whl-gh"></span></div>
      <div class="whl-backup" id="whl-backup"></div>`;   // p12: the one Backup on GitHub card (ghconnect.js backup)   // p10: the same GitHub status as everywhere else
    // pass 4 polish: with no tribe the first step says what is true (the browser keeps it), not that files are in a folder
    root.innerHTML = step(1, 'folder', 'In a folder', online() ? 'Your website and phone app are real files in the project’s folder, where this tribe is kept.' : 'In a tribe, your website and phone app are real files in the project’s folder.', none ? '' : 'Now', s1 + keep)
      + step(2, 'friends', 'With your friends', 'One link lets friends in. Everyone changes the same website and app, live, by their role.', st.people > 1 ? 'Now' : '', s2)
      + step(3, 'online', 'Online', 'Put it online and anyone can open it, on any phone or computer.', link ? 'Live' : '', s3);
    wire(root);
  }
  async function resolve(kind, use) {
    try {
      const r = await C.api(`/projects/${encodeURIComponent(st ? st.pid : asking.pid)}/design-files/resolve`, { method: 'POST', body: { kind, use } });
      toast(use === 'mine' ? T('Your files stay. The designer will not write this folder.') : r.kept ? F('The design is in the folder. Your versions are in {where}.', { where: r.kept }) : T('The design is in the folder.'));
      return r;
    } catch (e) { toast(e.message); return null; }
  }
  function wire(root) {
    const q = s => root.querySelector(s);
    const o = q('[data-whl-open]'); if (o) o.onclick = async () => { try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/design-files/open`, { method: 'POST', body: { kind: st.kind } }); if (!r.revealed) toast(F('The folder is {path}', { path: r.path })); } catch (e) { toast(e.message); } };
    const leave = () => { try { if (window.TribeAppCreator && window.TribeAppCreator.state && window.TribeAppCreator.state() && document.querySelector('#apc')) window.TribeAppCreator.close(); } catch {} };   // App Creator is full screen and makes the app behind it inert; it has saved
    const i = q('[data-whl-invite]'); if (i) i.onclick = () => { const pid = st.pid; close(); leave(); if (window.TribeInvite) window.TribeInvite.open({}); else if (window.TribeApp && window.TribeApp.openInvite) window.TribeApp.openInvite(); void pid; };
    const on = q('[data-whl-online]'); if (on) on.onclick = () => { const pid = st.pid; close(); leave(); if (window.TribePublish) window.TribePublish.open(pid, 'pages'); };
    const gh = q('#whl-gh'); if (gh && window.TribeGitHubConnect && window.TribeGitHubConnect.chip) window.TribeGitHubConnect.chip(gh, { before: () => { close(); leave(); } });
    const TC = window.TribeCopy;   // fix/p12-copies: keep, open and show copies (app/ui/tribecopy.js)
    const sv = q('[data-whl-save]'); if (sv && TC) sv.onclick = () => { close(); leave(); TC.save(); };
    const ld = q('[data-whl-load]'); if (ld && TC) ld.onclick = () => { close(); leave(); TC.open(); };
    const sf = q('[data-whl-show]'); if (sf && TC) sf.onclick = () => { const pid = st.pid; close(); leave(); TC.showFriend(pid); };
    const bk = q('#whl-backup'); if (bk && window.TribeGitHubConnect && window.TribeGitHubConnect.backup && C && C.hasToken && C.hasToken()) window.TribeGitHubConnect.backup(bk, { pid: st && st.pid, before: () => { close(); leave(); } });
    const runs = q('[data-whl-runs]'); if (runs) runs.onclick = () => window.TribeStatus && window.TribeStatus.open(runs);
    const srv = q('[data-whl-server]'); if (srv) srv.onclick = () => { close(); leave(); if (window.TribeOwnServer) window.TribeOwnServer.open(); };
    root.querySelectorAll('[data-whl-use]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await resolve(b.dataset.whlUse, 'design'); if (st) { if (r && r.status) st.files = r.status; draw(); } });
    root.querySelectorAll('[data-whl-mine]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await resolve(b.dataset.whlMine, 'mine'); if (st) { if (r && r.status) st.files = r.status; draw(); } });
  }

  // the one question, asked where the person is: in the editor whose files were changed outside
  function ask(pid, kind, f) {
    if (!window.TribeUI || !window.TribeUI.sheet || !f || !f[kind] || !(f[kind].held || []).length) return;
    if (asking || (st && st.sheet)) return;
    const held = f[kind].held;
    asking = { pid, kind };
    const sh = window.TribeUI.sheet({ id: 'whl-ask', eyebrow: 'Where it lives', title: kind === 'site' ? 'Files of the website were changed outside TribeCode' : 'Files of the phone app were changed outside TribeCode',
      body: `<div class="whl whl-askb"><p>${esc(held.slice(0, 6).join(', '))}${held.length > 6 ? ' …' : ''}</p><p class="faint">${esc(T('Nothing was written over them. Choose which one the folder keeps.'))}</p>
        <div class="whl-row"><button type="button" class="btn" data-whl-use="${kind}">${esc(T('Use the design'))}</button><button type="button" class="btn" data-whl-mine="${kind}">${esc(T('Keep my files'))}</button></div>
        <small class="faint">${esc(T('Use the design: your versions are copied to the .my-changes folder first. Keep my files: the designer stops writing this folder, and publishing uses your files.'))}</small></div>`,
      onClose: () => { asking = null; } });
    sh.el.querySelector('[data-whl-use]').onclick = async () => { await resolve(kind, 'design'); sh.close(); };
    sh.el.querySelector('[data-whl-mine]').onclick = async () => { await resolve(kind, 'mine'); sh.close(); };
  }
  const editorOpen = kind => (kind === 'site' ? (() => { const r = document.querySelector('#wdz, .wdz'); return !!r && !r.hidden; })() : !!document.querySelector('#apc'));
  async function check(pid, kind) { if (!online() || !pid) return; try { const f = await status(pid); if (f[kind] && f[kind].held && f[kind].held.length) ask(pid, kind, f); } catch {} }
  if (C && C.on) C.on('ws', m => {
    if (!m || m.type !== 'design-files' || !m.project) return;
    if (st && st.sheet && st.pid === m.project) { status(m.project).then(f => { if (st) { st.files = f; draw(); } }).catch(() => {}); return; }
    if (m.held > 0 && m.project === pidNow() && editorOpen(m.kind)) check(m.project, m.kind);
  });

  window.TribeWhere = { open, close, status, check, ask, state: () => st };
})();
