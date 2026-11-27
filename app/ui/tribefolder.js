// The tribe's folder on the Desktop (p13, server/tribefolder.js). One calm line wherever it
// helps: after a tribe or project is made (tribenew.js), in Where it lives (wherelives.js) and in Settings › Projects
// and backup. "Saved on your Desktop · Open folder · Change".
//   On the tribe's own computer (the desktop app, or a page its own server serves): the line, Open folder (the server
//   opens it with Explorer / Finder / the file manager, only that folder) and Change (Move to a folder, livingrepo.js).
//   A friend on another computer with the desktop app: "Save a folder on this computer too" puts their copy of the
//   tribe (README, .gitignore, <Tribe>.tribe) in a folder on their own Desktop through their own TribeCode.
//   A browser elsewhere: nothing (the folder is on the other computer).
// Public: window.TribeDesktopFolder = { line(el, o), info(o), open(pathInside, o), saveCopy(), settings(el) }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const F = (s, v) => T(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const ico = (n, s) => (window.TribeIcons && window.TribeIcons.has && window.TribeIcons.has(n) ? window.TribeIcons.svg(n, s || 15) : '');
  const desktop = () => !!window.__TAURI__;
  const online = () => !!(C() && C().hasToken && C().hasToken() && C().connected && C().connected());
  const pidNow = () => (C() && C().project && C().project()) || '';

  // o: { server, token } to ask a tribe this page is not signed in to yet (right after it was made)
  async function call(path, opt = {}, o = {}) {
    if (o.server) {
      const r = await fetch(o.server.replace(/\/+$/, '') + '/api' + path, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || String(r.status)), { status: r.status }); return d;
    }
    return C().api(path, opt);
  }
  const info = (o = {}) => call('/tribe/desktop', {}, o);
  async function open(inside, o = {}) {
    try { const r = await call('/tribe/desktop/open', { method: 'POST', body: inside ? { path: inside } : {} }, o); if (!r.revealed) toast(F('The folder is {path}', { path: r.display })); return r; }
    catch (e) { toast(e.message); return null; }
  }

  // ---------- a friend's copy on this computer (the desktop app's own TribeCode) ----------
  const PORTS = [4747, 4748, 4749, 4757];
  async function localServer() {
    for (const p of PORTS) {
      const u = `http://127.0.0.1:${p}`;
      try { const r = await fetch(u + '/api/health', { cache: 'no-store' }); if (r.ok) return u; } catch {}
    }
    return '';
  }
  async function saveCopy() {
    const c = C(); if (!c || !c.api) return null;
    let copy; try { copy = await c.api('/tribe/copy'); } catch (e) { toast(e.message); return null; }
    const srv = await localServer();
    if (!srv) { if (window.TribeCopy && window.TribeCopy.save) window.TribeCopy.save(); return null; }   // no TribeCode running here: the one-file download
    try {
      const r = await fetch(srv + '/api/tribe/desktop/save-copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy, from: (c.base && c.base()) || '', open: true }) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || String(r.status));
      try { localStorage.setItem('tribecode.desktopCopy:' + ((c.base && c.base()) || ''), JSON.stringify({ at: Date.now(), where: d.display })); } catch {}
      toast(F('Saved in {where}.', { where: d.display }));
      return d;
    } catch (e) { toast(e.message); return null; }
  }
  const savedCopy = () => { try { return JSON.parse(localStorage.getItem('tribecode.desktopCopy:' + ((C() && C().base && C().base()) || '')) || 'null'); } catch { return null; } };

  // ---------- the one line ----------
  // line(el, { pid, server, token, change: true }) -> draws "Saved on your Desktop · Open folder · Change" (or nothing)
  async function line(el, o = {}) {
    if (!el) return;
    el.classList.add('tdf');
    let d = null; try { d = await info(o); } catch { d = null; }
    if (!el.isConnected) return;
    const pid = o.pid || (o.server ? '' : pidNow());
    if (o.wait && d && d.on && (!d.exists || (o.pid && !(d.projects || {})[o.pid])) && (o.tries || 0) < 8) { const t = (o.tries || 0) + 1; setTimeout(() => line(el, { ...o, tries: t }), 1000); return d; }   // just made: the folder follows in a moment
    if (d && d.exists && (d.canOpen || d.display)) {
      const where = (pid && d.projects && d.projects[pid]) || d.display;
      const head = d.desktop ? T('Saved on your Desktop') : F('Saved in: {where}', { where });
      el.innerHTML = `${ico('files')}<span class="tdf-t"><b>${esc(head)}</b>${d.desktop ? ` <code class="tdf-p">${esc(where)}</code>` : ''}</span>
        ${d.canOpen ? `<button type="button" class="linkish" data-tdf="open">${esc(T('Open folder'))}</button>` : ''}
        ${d.canOpen && o.change !== false && pid && !o.server && window.TribeHome && window.TribeHome.folder ? `<span aria-hidden="true">·</span><button type="button" class="linkish" data-tdf="change">${esc(T('Change'))}</button>` : ''}`;
      el.hidden = false;
      const op = el.querySelector('[data-tdf="open"]'); if (op) op.onclick = () => open(pid && d.projects && d.projects[pid] ? d.projects[pid].split('/').pop() : '', o);
      const ch = el.querySelector('[data-tdf="change"]'); if (ch) ch.onclick = () => { if (o.before) o.before(); window.TribeHome.folder({ pid }); };
      return d;
    }
    if (d && d.canMake && o.make) {
      el.innerHTML = `${ico('files')}<span class="tdf-t">${esc(T('Keep this tribe in a folder on your Desktop, ready for GitHub.'))}</span><button type="button" class="linkish" data-tdf="make">${esc(T('Make a folder on my Desktop'))}</button>`;
      el.hidden = false;
      el.querySelector('[data-tdf="make"]').onclick = async e => { e.target.disabled = true; try { await call('/tribe/desktop/make', { method: 'POST' }, o); } catch (er) { toast(er.message); } line(el, o); };
      return d;
    }
    // a friend's computer with the desktop app: their own copy, in a folder here
    if (desktop() && online() && !(d && d.canOpen) && !o.server) {
      const s = savedCopy();
      el.innerHTML = `${ico('files')}<span class="tdf-t">${s ? `<b>${esc(T('Saved on your Desktop'))}</b> <code class="tdf-p">${esc(s.where)}</code>` : esc(T('The tribe’s folder is on the computer that keeps it.'))}</span><button type="button" class="linkish" data-tdf="copy">${esc(s ? T('Save it again') : T('Save a folder on this computer too'))}</button>`;
      el.hidden = false;
      el.querySelector('[data-tdf="copy"]').onclick = async e => { e.target.disabled = true; await saveCopy(); line(el, o); };
      return d;
    }
    el.innerHTML = ''; el.hidden = true;
    return d;
  }

  // ---------- Settings › Projects and backup ----------
  function settings(el) {
    el.innerHTML = `<p class="set-note">${esc(T('Each project has its own folder inside it. Files you change in any program show up in TribeCode, and Backup on GitHub uses it as it is.'))}</p><div class="tdf-set"></div>`;
    return line(el.querySelector('.tdf-set'), { make: true });
  }
  function wireSettings() {
    const S = window.TribeSettings; if (!S || !S.addSection) return false;
    S.addSection('projects', { id: 'desktop-folder', title: T('Folder on your computer'), render: el => settings(el) });
    return true;
  }
  if (!wireSettings()) addEventListener('DOMContentLoaded', wireSettings, { once: true });

  window.TribeDesktopFolder = { line, info, open, saveCopy, settings };
})();
