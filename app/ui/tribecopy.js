// Copies of the tribe (fix/p12-copies): one way to keep, send, show and move a tribe.
//   Save on this computer   desktop app: the tribe is already a real folder here, so it says where and opens it.
//                           browser: downloads one .tribe file (projects, designs, docs, tasks, the chat you can see;
//                           never keys, tokens or anyone's direct messages) and offers the desktop app.
//   Open a saved tribe      reads a .tribe file (untrusted data: checked, clipped, rebuilt field by field) and adds its
//                           projects here, through the same call a move uses (POST /api/import/solo, offline.js in a browser).
//   Show a friend           a read-only link with the project inside it (small projects) and a QR. The friend sees the
//                           website and the plan, read-only, and taps Make my own copy (a new project, credited).
//   Send a copy             the same project as a .tribe file.
//   Move to the cloud       a guided flow: save a copy, start the new place, open the copy there, then friends follow:
//                           this place shows everyone a "The tribe moved" banner with the new address (one tap).
// Reached from Where your tribe runs (agentsoffice.js) and Where it lives (wherelives.js). The dashboard card says
// where the tribe is kept and when a copy was last saved (TribeCopy.line()).
// Public: window.TribeCopy = { save, open, showFriend, sendCopy, move, line, lastSaved, fromLink, check, pack, unpack }
(function () {
  'use strict';
  const C = window.TribeClient;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const F = (s, v) => T(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const SH = () => window.TribeUI;
  const OFF = () => window.TribeOffline;
  const solo = () => !!(OFF() && OFF().solo && OFF().solo());
  const desktop = () => !!window.__TAURI__;
  const online = () => !!(C && C.hasToken && C.hasToken() && C.connected && C.connected());
  const RELEASES = (window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest';
  const PAGES = 'https://orionopenwow.github.io/TribeCode/';
  const PEND = 'tribecode.pendingCopy', FORMAT = 'tribecode-tribe', MAX_FILE = 20 * 1024 * 1024, MAX_LINK = 7000, KEY = 'tribecode.savedCopy';
  const S = (v, n) => String(v == null ? '' : v).slice(0, n);
  const slug = s => S(s, 48).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tribe';

  // ---------- the file ----------
  function fromSolo(only) {
    const d = OFF().exportSolo(); if (!d) return null;
    const DS = (window.TribePhoneLocal && window.TribePhoneLocal.designs && window.TribePhoneLocal.designs()) || {};
    const projects = d.projects.filter(p => !only || p.key === only).map(p => { const o = { ...p }; delete o.github; delete o.company; if (DS[p.key]) o.designs = DS[p.key]; return o; });
    return { format: FORMAT, version: 1, saved: new Date().toISOString(), tribe: d.tribe, projects };
  }
  async function build(only) {
    if (solo()) return fromSolo(only);
    return C.api('/tribe/copy' + (only ? `?one=${encodeURIComponent(only)}` : ''));
  }
  // An opened file is someone else's data: only known fields of known shapes come through, every text is clipped.
  function check(raw) {
    if (!raw || typeof raw !== 'object' || raw.format !== FORMAT || !Array.isArray(raw.projects)) throw new Error(T('This is not a saved tribe.'));
    const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    const projects = raw.projects.slice(0, 12).filter(obj).map(p => {
      const ds = obj(p.designs), motion = ds && obj(ds.motion);
      return {
        key: S(p.key, 64), name: S(p.name, 48) || T('A copy'), emoji: S(p.emoji, 4), color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '', bio: S(p.bio, 200), vision: S(p.vision, 20000),
        tasks: (Array.isArray(p.tasks) ? p.tasks : []).slice(0, 300).filter(obj).map(t => ({ title: S(t.title, 200), status: S(t.status, 12), body: S(t.body, 20000), due: typeof t.due === 'string' ? S(t.due, 30) : null, type: S(t.type, 20) || undefined, subtasks: Array.isArray(t.subtasks) ? t.subtasks.slice(0, 30).filter(obj).map(x => ({ t: S(x.t, 200), done: !!x.done })) : undefined })).filter(t => t.title),
        docs: (Array.isArray(p.docs) ? p.docs : []).slice(0, 60).filter(obj).map(d => ({ title: S(d.title, 120), body: S(d.body, 400000), ...(d.kind === 'sheet' || d.kind === 'deck' ? { kind: d.kind } : {}) })),
        chat: (Array.isArray(p.chat) ? p.chat : []).slice(-1500).filter(obj).map(m => ({ by: m.by === 'me' ? 'me' : m.by === 'tribecode' ? 'tribecode' : 'friend', name: S(m.name, 32), at: S(m.at, 30), text: S(m.text, 4000) })).filter(m => m.text),
        designs: ds ? { site: obj(ds.site), app: obj(ds.app), motion: motion ? Object.fromEntries(Object.entries(motion).slice(0, 20).filter(([k, v]) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(k) && obj(v))) : null } : null,
      };
    });
    if (!projects.length) throw new Error(T('This saved tribe has no projects in it.'));
    return { tribe: { name: S(raw.tribe && raw.tribe.name, 48) }, from: S(raw.from, 32), projects };
  }
  function download(copy, name) {
    const blob = new Blob([JSON.stringify(copy)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function remember(o) { try { localStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), ...o })); } catch {} }
  function lastSaved() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
  const when = iso => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };
  // one line for the dashboard: where the tribe is kept, and the last copy
  function line() {
    const l = lastSaved();
    const where = solo() ? T('Kept in this browser') : desktop() ? T('Kept in a folder on this computer') : '';
    return [where, l ? F('Copy saved {when}', { when: when(l.at) }) : ''].filter(Boolean).join(' · ');
  }

  // ---------- Save on this computer ----------
  async function save() {
    if (!solo() && desktop() && online()) {
      let f = null; try { f = await C.api('/tribe/folder'); } catch {}
      if (f && f.path) return folderSheet(f);
    }
    return saveFile();
  }
  async function saveFile(only) {
    let copy; try { copy = await build(only); } catch (e) { return toast(e.message || T('Could not make the copy.')), null; }
    if (!copy || !copy.projects || !copy.projects.length) return toast(T('There is nothing to save yet.')), null;
    const name = `${slug(only ? copy.projects[0].name : (copy.tribe && copy.tribe.name) || 'tribe')}.tribe`;
    download(copy, name); remember({ file: name, where: 'downloads' });
    if (!only && SH() && SH().sheet) {
      const sh = SH().sheet({ id: 'tcp-saved', eyebrow: 'Save on this computer', title: 'Saved',
        body: `<p>${esc(F('{file} is in your Downloads. It has your projects, designs, docs, tasks and the chat you can see. Keys and direct messages stay out.', { file: name }))}</p>
          ${solo() && !desktop() ? `<p class="faint">${esc(T('For a real folder you can open, get TribeCode for your computer and open this file there.'))}</p><div class="tcp-row"><a class="btn primary" href="${esc(RELEASES)}" target="_blank" rel="noopener">${esc(T('Get TribeCode for your computer'))}</a></div>` : ''}` });
      return sh;
    }
    return name;
  }
  function folderSheet(f) {
    const sh = SH().sheet({ id: 'tcp-folder', eyebrow: 'Save on this computer', title: 'Kept in a folder on this computer',
      body: `<p>${esc(T('Everything in this tribe is real files in this folder. It saves by itself as you work.'))}</p><p class="tcp-path"><code id="tcp-path">${esc(f.path)}</code></p>
        <div class="tcp-row">${f.canOpen ? `<button type="button" class="btn primary" data-tcp="reveal">${esc(T('Open the folder'))}</button>` : ''}<button type="button" class="btn" data-tcp="file">${esc(T('Download a copy'))}</button></div>` });
    sh.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-tcp]'); if (!b) return;
      if (b.dataset.tcp === 'reveal') { try { const r = await C.api('/tribe/folder/open', { method: 'POST' }); remember({ where: 'folder', file: f.path }); if (!r.revealed) toast(F('The folder is {path}', { path: r.path })); } catch (er) { toast(er.message); } }
      if (b.dataset.tcp === 'file') { sh.close(); saveFile(); }
    });
    return sh;
  }

  // ---------- Open a saved tribe / Make my own copy ----------
  function pick() {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.tribe,application/json'; i.style.display = 'none';
      i.onchange = () => { const f = i.files && i.files[0]; i.remove(); res(f || null); };
      document.body.appendChild(i); i.click();
    });
  }
  async function open(file) {
    const f = file || await pick(); if (!f) return null;
    if (f.size > MAX_FILE) return toast(T('That file is too big to be a saved tribe.')), null;
    let data; try { data = check(JSON.parse(await f.text())); } catch (e) { return toast(e instanceof SyntaxError ? T('This is not a saved tribe.') : e.message), null; }
    return bring(data);
  }
  async function bring(data, { credit } = {}) {
    if (!online() && !solo()) { toast(T('Start or join a tribe first, then open the copy.')); return null; }
    const body = { draftId: 'c-' + Math.random().toString(36).slice(2, 14), tribe: data.tribe, projects: data.projects.map(p => {
      const o = { ...p }; delete o.designs; delete o.key;
      if (credit) { o.name = S(F('{name} (my copy)', { name: p.name }), 48); o.bio = S(F('A copy of {name}, shared by {who}.', { name: p.name, who: credit }), 200); o.chat = []; }
      return o; }) };
    let r; try { r = await C.api('/import/solo', { method: 'POST', body }); } catch (e) { toast(e.message); return null; }
    if (!r || !r.projects) { toast((r && r.error) || T('Could not open it.')); return null; }
    let missed = 0;
    for (let i = 0; i < data.projects.length; i++) {
      const ds = data.projects[i].designs, to = r.projects[i]; if (!ds || !to || !to.id) continue;
      const pp = `/projects/${encodeURIComponent(to.id)}`, put = (p, b) => C.api(p, { method: 'PUT', body: b, project: to.id }).then(x => { if (x && x.error) missed++; }).catch(() => missed++);
      if (ds.site) await put(`${pp}/site-config`, { config: ds.site, force: true });
      if (ds.app) await put(`${pp}/app-config`, { config: ds.app, force: true });
      for (const [k, doc] of Object.entries(ds.motion || {})) await put(`${pp}/motion/${encodeURIComponent(k)}`, { doc });
    }
    const n = r.projects.length;
    toast(missed ? T('The projects arrived. Some designs did not; open the file again to try them.') : n === 1 ? F('{name} is here now.', { name: r.projects[0].name }) : F('{n} projects are here now.', { n }));
    try { if (window.TribeProjects && window.TribeProjects.switchTo && r.projects[0] && !r.again) window.TribeProjects.switchTo(r.projects[0].id, 'home'); } catch {}
    return r;
  }

  // ---------- Show a friend (read-only link) / Send a copy ----------
  const b64u = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'undefined') return '0' + b64u(raw);
    return '1' + b64u(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  }
  async function unpack(s) {
    const z = s[0] === '1', bytes = unb64u(s.slice(1)); if (bytes.length > 2 * 1024 * 1024) throw new Error('too big');
    const txt = z ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(bytes);
    if (txt.length > 8 * 1024 * 1024) throw new Error('too big');
    return JSON.parse(txt);
  }
  // what a read-only link carries: the website, the app, the plan and the task list; never chat or docs
  function forLink(copy, from) {
    const p = copy.projects[0];
    return { format: FORMAT, version: 1, from: S(from, 32), tribe: { name: '' }, projects: [{ name: p.name, emoji: p.emoji, color: p.color, bio: p.bio, vision: p.vision, tasks: (p.tasks || []).map(t => ({ title: t.title, status: t.status })), docs: [], chat: [], designs: p.designs ? { site: p.designs.site || null, app: p.designs.app || null } : null }] };
  }
  const myName = () => { try { return ((C.state && C.state().me) || {}).name || ''; } catch { return ''; } };
  const linkBase = () => (/^https:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.hostname) ? location.origin + location.pathname.replace(/[^/]*$/, '') : PAGES);
  async function showFriend(pid) {
    pid = pid || (C && C.project && C.project()) || ''; if (!pid && solo()) { const d = OFF().exportSolo(); pid = d && d.projects[0] && d.projects[0].key; }
    let copy; try { copy = await build(pid); } catch (e) { return toast(e.message), null; }
    if (!copy || !copy.projects || !copy.projects.length) return toast(T('There is nothing to show yet.')), null;
    const code = await pack(forLink(copy, myName())), link = code.length <= MAX_LINK ? `${linkBase()}#copy=${code}` : '';
    let qr = ''; try { if (link && window.TribeQR) qr = `<div class="tcp-qr qr">${window.TribeQR.svg(link)}</div>`; } catch {}   // a QR holds short links only; a longer one goes by message
    const sh = SH().sheet({ id: 'tcp-show', eyebrow: copy.projects[0].name, title: 'Show a friend',
      body: link ? `<p>${esc(T('This link has the project inside it. Your friend sees it read-only and can make their own copy. Chat and docs stay out.'))}</p>
          <div class="tcp-row"><input class="input tcp-link" id="tcp-link" readonly value="${esc(link)}"><button type="button" class="btn primary" data-tcp="copy">${esc(T('Copy link'))}</button></div>${qr}
          <div class="tcp-row"><button type="button" class="btn" data-tcp="send">${esc(T('Send a copy as a file'))}</button></div>`
        : `<p>${esc(T('This project is too big for a link. Put it online and share that address, or send a copy as a file.'))}</p>
          <div class="tcp-row"><button type="button" class="btn primary" data-tcp="online">${esc(T('Put it online'))}</button><button type="button" class="btn" data-tcp="send">${esc(T('Send a copy as a file'))}</button></div>` });
    sh.body.addEventListener('click', e => {
      const b = e.target.closest('[data-tcp]'); if (!b) return;
      if (b.dataset.tcp === 'copy') { try { navigator.clipboard.writeText(link); toast(T('Link copied.')); } catch { const i = sh.body.querySelector('#tcp-link'); i.select(); document.execCommand('copy'); } }
      if (b.dataset.tcp === 'send') { sh.close(); sendCopy(pid); }
      if (b.dataset.tcp === 'online') { sh.close(); if (window.TribePublish) window.TribePublish.open(pid, 'pages'); }
    });
    return sh;
  }
  function sendCopy(pid) { return saveFile(pid || (C && C.project && C.project()) || ''); }

  // the friend's side: #copy=… opens read-only, with Make my own copy
  async function fromLink() {
    const m = /[#&]copy=([01][A-Za-z0-9_-]+)/.exec(location.hash || ''); if (!m) return null;
    let data; try { data = check(await unpack(m[1])); } catch { toast(T('This link is broken or cut off. Ask for it again.')); return null; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    const p = data.projects[0], site = p.designs && p.designs.site, SC = window.TribeSiteCfg;
    let preview = ''; try { if (site && SC && SC.render) preview = SC.render(site); } catch {}
    const tasks = p.tasks.slice(0, 12).map(t => `<li${t.status === 'done' ? ' class="tcp-done"' : ''}>${esc(t.title)}</li>`).join('');
    const sh = SH().sheet({ id: 'tcp-view', wide: true, eyebrow: data.from ? F('Shared by {who}', { who: data.from }) : 'Shared with you', title: `${p.emoji ? p.emoji + ' ' : ''}${p.name}`,
      body: `<p class="tcp-ro"><span class="tcp-tag">${esc(T('Read-only'))}</span> ${esc(p.bio || '')}</p>
        ${preview ? `<iframe class="tcp-frame" id="tcp-frame" sandbox="" title="${esc(T('Website'))}" referrerpolicy="no-referrer"></iframe>` : ''}
        ${p.vision ? `<section class="tcp-sec"><span class="eyebrow">${esc(T('The plan'))}</span><p class="tcp-read">${esc(p.vision.slice(0, 1200))}</p></section>` : ''}
        ${tasks ? `<section class="tcp-sec"><span class="eyebrow">${esc(T('Tasks'))}</span><ul class="tcp-tasks">${tasks}</ul></section>` : ''}
        <div class="tcp-row"><button type="button" class="btn primary" data-tcp="mine">${esc(T('Make my own copy'))}</button></div>
        <small class="faint">${esc(T('Your copy is yours to change. Theirs stays as it is.'))}</small>` });
    const fr = sh.body.querySelector('#tcp-frame'); if (fr) fr.srcdoc = preview;
    sh.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-tcp="mine"]'); if (!b) return;
      if (!online() && !solo() && OFF() && OFF().start) {   // no tribe yet: one starts in this browser (it may reload; the copy waits)
        try { sessionStorage.setItem(PEND, JSON.stringify(data)); } catch {}
        try { await OFF().start('solo'); } catch {}
        if (!solo()) return;
        try { sessionStorage.removeItem(PEND); } catch {}
      }
      b.disabled = true; const r = await bring(data, { credit: data.from || T('a friend') }); if (r) sh.close(); else b.disabled = false;
    });
    return sh;
  }

  // ---------- Move to the cloud (or any always-on server) ----------
  function move() {
    const steps = [
      ['1', 'Save a copy here', 'One file with every project you can see, its designs, docs, tasks and chat.', `<button type="button" class="btn primary" data-tcp="m-save">${esc(T('Save a copy'))}</button>`],
      ['2', 'Start the new place', 'Free cloud, or a server of your own that stays on.', `<button type="button" class="btn" data-tcp="m-cloud">${esc(T('Set up free cloud'))}</button><button type="button" class="btn" data-tcp="m-server">${esc(T('Run your own server'))}</button>`],
      ['3', 'Open the copy there', 'In the new place, open Where your tribe runs and choose Open a saved tribe.', ''],
      ['4', 'Bring your friends', 'Paste the new address. Everyone who opens this tribe sees it and moves with one tap. Then invite them from the new place.', `<div class="tcp-row"><input class="input" id="tcp-new" placeholder="https://…" inputmode="url"><button type="button" class="btn" data-tcp="m-tell">${esc(T('Tell everyone'))}</button></div>`],
    ];
    const body = `<p class="faint">${esc(T('Nothing is deleted here. This place keeps working until you turn it off.'))}</p>
      <ol class="tcp-steps">${steps.map(([n, t, s, a]) => `<li class="tcp-step"><span class="tcp-n">${n}</span><div><b>${esc(T(t))}</b><p class="faint">${esc(T(s))}</p>${a ? `<div class="tcp-row">${a}</div>` : ''}</div></li>`).join('')}</ol>
      <small class="faint">${esc(T('People join the new place again with a new link. Their direct messages stay where they are.'))}</small>`;
    const sh = SH().sheet({ id: 'tcp-move', wide: true, eyebrow: 'Where your tribe runs', title: 'Move it to the cloud', body });
    sh.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-tcp]'); if (!b) return; const k = b.dataset.tcp;
      if (k === 'm-save') saveFile();
      if (k === 'm-cloud') { if (window.TribeAgentsOffice && window.TribeAgentsOffice.cloud) window.TribeAgentsOffice.cloud(); else if (window.TribeCloudHome && window.TribeCloudHome.open) window.TribeCloudHome.open(); }
      if (k === 'm-server') { if (window.TribeOwnServer) window.TribeOwnServer.open(); }
      if (k === 'm-tell') {
        const v = S(sh.body.querySelector('#tcp-new').value.trim(), 300);
        if (!/^https:\/\/[^\s/]+\.[^\s]+$/.test(v)) return toast(T('Paste the new address, starting with https://'));
        try { await C.api('/tribe/moved', { method: 'PUT', body: { url: v } }); toast(T('Everyone here will see the new address.')); } catch (er) { toast(er.message); }
      }
    });
    return sh;
  }
  // this place says where the tribe went (set in step 4 above): one plain banner with one button
  let told = false;
  async function movedBanner() {
    if (told || !online() || solo()) return;
    let f = null; try { f = await C.api('/tribe/folder'); } catch { return; }
    if (!f || !f.movedTo || document.getElementById('tcp-moved')) return;
    told = true;
    const el = document.createElement('div'); el.id = 'tcp-moved'; el.className = 'tcp-moved'; el.setAttribute('role', 'status');
    el.innerHTML = `<span>${esc(F('{tribe} moved to a new place.', { tribe: f.name || T('This tribe') }))}</span><a class="btn primary" href="${esc(f.movedTo)}" rel="noopener">${esc(T('Go there'))}</a><button type="button" class="ui-x" aria-label="${esc(T('Close'))}">×</button>`;
    el.querySelector('button').onclick = () => el.remove();
    document.body.appendChild(el);
  }

  function boot() {
    if (/[#&]copy=/.test(location.hash || '')) setTimeout(() => fromLink(), 600);
    let pend = null; try { pend = JSON.parse(sessionStorage.getItem(PEND) || 'null'); sessionStorage.removeItem(PEND); } catch {}
    if (pend) setTimeout(() => { try { const d = check(pend); if (solo() || online()) bring(d, { credit: d.from || T('a friend') }); } catch {} }, 1500);
    setTimeout(movedBanner, 2500);
    window.addEventListener('hashchange', () => { if (/[#&]copy=/.test(location.hash || '')) fromLink(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.TribeCopy = { save, saveFile, open, bring, showFriend, sendCopy, move, line, lastSaved, fromLink, check, pack, unpack, movedBanner };
})();
