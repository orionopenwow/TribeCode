// Storage & sync (v0.26): one card in Settings that says, in plain words, where everything lives and what keeps it safe.
//   1. Where the tribe runs: this computer (the tribe folder, plain files) or a cloud host (with cloud save).
//   2. GitHub: each project's code repository, whether it's connected, and how autopilot syncs it (pull / push).
//   3. This device: what the app keeps here (settings, drafts, an offline copy) and "Save a copy".
// Server: GET /api/storage (server/index.js). Public: window.TribeStorage = { mount(el) }.
(function () {
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (k, f) => (window.TribeI18n ? window.TribeI18n.t(k, f) : f);
  async function mount(el) {
    if (!el) return;
    if (!C || !C.connected()) { el.innerHTML = `<p class="faint">${T('st.none', 'Start or join a tribe and this shows where everything is kept.')}</p>`; return; }
    el.innerHTML = `<p class="faint">${T('st.loading', 'Checking…')}</p>`;
    let s; try { s = await C.api('/storage'); } catch (e) { el.innerHTML = `<p class="faint">${esc(e.message)}</p>`; return; }
    const desk = window.TribeHost && window.TribeHost.isDesktop, repos = s.projects.filter(p => p.hasRepo);
    const runs = s.where === 'cloud'
      ? `<b>${T('st.cloud', 'A cloud host')}</b><span>${s.cloudSave ? T('st.cloudsave', 'Cloud save is on: every member\'s device keeps a sealed copy, so the tribe comes back if the host restarts.') : T('st.cloudoff', 'Cloud save is off. Set a fixed setup code on the host to turn it on.')}</span>`
      : `<b>${T('st.computer', 'The host\'s computer')}</b><span>${s.folder ? `${T('st.folder', 'Chat, tasks and docs are plain files in')} <code>${esc(s.folder)}</code>` : T('st.hostkeeps', 'The host keeps chat, tasks and docs as plain files on their computer.')}</span>`;
    const gh = repos.length
      ? repos.map(p => `<li><b>${esc(p.name)}</b> <span class="faint">${p.github ? esc(p.github.replace(/^https?:\/\/(www\.)?/, '').replace(/\.git$/, '')) : T('st.localonly', 'only on the host\'s computer (not on GitHub yet)')}</span></li>`).join('')
      : `<li class="faint">${T('st.norepo', 'No project has a code repository yet.')}</li>`;
    el.innerHTML = `<div class="stg">
      <div class="stg-t"><span class="stg-ico" aria-hidden="true">${s.where === 'cloud' ? '☁️' : '🖥️'}</span><div><span class="eyebrow">${T('st.runs', 'Where your tribe runs')}</span>${runs}</div></div>
      <div class="stg-t"><span class="stg-ico" aria-hidden="true">🐙</span><div><span class="eyebrow">${T('st.code', 'Code · GitHub')}</span><b>${s.github.signedIn ? `${T('st.signed', 'Signed in')}${s.github.login ? ' as ' + esc(s.github.login) : ''}` : T('st.notsigned', 'Not signed in to GitHub')}</b><ul class="stg-list">${gh}</ul>
        <span class="faint">${T('st.autopilot', 'Autopilot keeps each repository in sync (pull friends\' work, push saved commits). Turn it on per project under Code repository.')}</span></div></div>
      <div class="stg-t"><span class="stg-ico" aria-hidden="true">📱</span><div><span class="eyebrow">${T('st.device', 'This device')}</span><span>${T('st.devicetext', 'Keeps your settings, drafts and a copy of what you can see, so the app opens fast and works offline.')}</span></div></div>
      <div class="stg-acts">
        ${desk && s.folder ? `<button class="btn sm" data-stg="open">${T('st.open', 'Open the folder')}</button>` : ''}
        ${repos.length ? `<button class="btn sm" data-stg="repo">${T('st.sync', 'Code repository & sync')}</button>` : ''}
        ${!s.github.signedIn ? `<button class="btn sm" data-stg="gh">${T('st.gh', 'Sign in to GitHub')}</button>` : ''}
        <button class="btn sm" data-stg="copy">${T('st.copy', 'Save a copy')}</button>
        ${s.folder ? `<button class="btn sm" data-stg="backup">${T('st.backup', 'Download backup')}</button>` : ''}
      </div></div>`;
    el.querySelectorAll('[data-stg]').forEach(b => b.onclick = () => {
      const k = b.dataset.stg, click = id => { const x = document.getElementById(id); if (x) x.click(); };
      if (k === 'open') return window.TribeHost.openPath ? window.TribeHost.openPath(s.folder) : navigator.clipboard && navigator.clipboard.writeText(s.folder).then(() => window.TribeApp.toast('Folder path copied'));
      if (k === 'repo') { document.getElementById('set-close') && document.getElementById('set-close').click(); return window.TribeApp.show('repo'); }
      if (k === 'gh') { const g = document.getElementById('set-github'); if (g) { g.scrollIntoView({ block: 'center' }); const btn = g.querySelector('button'); if (btn) btn.focus(); } return; }
      if (k === 'copy') return click('set-copy');
      if (k === 'backup') { const more = document.getElementById('set-more'); if (more) more.open = true; return click('set-backup'); }
    });
  }
  window.TribeStorage = { mount };
})();
