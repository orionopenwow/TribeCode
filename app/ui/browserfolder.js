// A folder you pick or create, from a web page (feat/setup-github). The desktop app and a page served by TribeCode pick
// a real folder through TribeHome.pickFolder (livingrepo.js). A page with no TribeCode behind it (the website, a phone)
// keeps the tribe in this browser; here it can also save a copy of a project's files into a folder on the computer
// with the File System Access API (Chrome, Edge: the system picker has its own New folder button). Where the browser
// has no such picker (Firefox, Safari, phones) the same files download as one .zip instead.
// The folder handle is remembered in IndexedDB so "Save again" needs no second pick; nothing is uploaded anywhere.
// Public: window.TribeBrowserFolder = { can(), pick(), save(pid, handle), again(pid), zip(pid), files(pid), name(pid), forget(pid), mount(el, o) }
(function () {
  'use strict';
  const OFF = () => window.TribeOffline;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const can = () => typeof window.showDirectoryPicker === 'function' && window.isSecureContext !== false;
  const safe = s => String(s || '').replace(/[\\/:*?"<>|\x00-\x1F]+/g, '-').replace(/^\.+/, '').trim().slice(0, 80) || 'untitled';

  // ---------- remembered folders (IndexedDB keeps the handle itself; localStorage only its name) ----------
  const DB = 'tribecode-folders', STORE = 'handles', NAMES = 'tribecode.bfolder.names';
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => { d.close(); res(q && q.result); }; t.onerror = () => { d.close(); rej(t.error); }; }); };
  const names = () => { try { return JSON.parse(localStorage.getItem(NAMES) || '{}'); } catch { return {}; } };
  const setName = (pid, v) => { const n = names(); if (v) n[pid] = v; else delete n[pid]; try { localStorage.setItem(NAMES, JSON.stringify(n)); } catch {} };
  const name = pid => (names()[pid] || {}).name || '';
  const savedAt = pid => (names()[pid] || {}).at || '';
  async function forget(pid) { setName(pid, null); try { await tx('readwrite', s => s.delete(pid)); } catch {} }

  // ---------- the project's files, as plain text ----------
  function files(pid) {
    const db = OFF() && OFF().state && OFF().state(); if (!db) return {};
    const p = (db.projects || []).find(x => x.id === pid) || (db.projects || [])[0]; if (!p) return {};
    const out = {}, tasks = (db.tasks || {})[p.id] || [], vis = (db.vision || {})[p.id];
    out['README.md'] = `# ${p.name}\n\n${p.bio ? p.bio + '\n\n' : ''}Saved from TribeCode. Open it again any time; this folder is a copy.\n`;
    if (vis) out['VISION.md'] = String(vis);
    if (tasks.length) {
      const by = k => tasks.filter(t => t.status === k).map(t => `- [${k === 'done' ? 'x' : ' '}] ${t.title}`).join('\n') || '_none_';
      out['TASKS.md'] = `# Tasks\n\n## To do\n\n${by('backlog')}\n\n## Doing\n\n${by('doing')}\n\n## Review\n\n${by('review')}\n\n## Done\n\n${by('done')}\n`;
    }
    const T = window.TribeDevice && window.TribeDevice._k && window.TribeDevice._k.tree;
    if (T) { try { Object.assign(out, T(p.id).files); } catch {} }
    else for (const d of ((db.docs || {})[p.id] || [])) out[`docs/${safe(d.slug || d.title)}.md`] = String(d.body || '');
    return out;
  }

  // ---------- pick, save, save again ----------
  // pick(): must run inside a click. Answers the folder handle, or null when the person closed the picker.
  async function pick() {
    if (!can()) return null;
    try { return await window.showDirectoryPicker({ id: 'tribecode', mode: 'readwrite' }); }
    catch (e) { if (e && e.name === 'AbortError') return null; throw new Error('The browser did not open that folder. Pick another one.'); }
  }
  async function write(dir, path, text) {
    const parts = path.split('/').map(safe); let d = dir;
    for (const seg of parts.slice(0, -1)) d = await d.getDirectoryHandle(seg, { create: true });
    const f = await d.getFileHandle(parts[parts.length - 1], { create: true }), w = await f.createWritable();
    await w.write(text); await w.close();
  }
  async function save(pid, handle) {
    const fl = files(pid), list = Object.entries(fl);
    if (!list.length) throw new Error('There is nothing to save yet.');
    if (handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('The browser was not allowed to save into that folder.');
    for (const [p, t] of list) await write(handle, p, t);
    try { await tx('readwrite', s => s.put(handle, pid)); } catch {}
    setName(pid, { name: handle.name || 'folder', at: new Date().toISOString() });
    try { dispatchEvent(new CustomEvent('tribe-local-home', { detail: { pid } })); } catch {}
    return { folder: handle.name || 'folder', files: list.length };
  }
  async function again(pid) {
    let h = null; try { h = await tx('readonly', s => s.get(pid)); } catch {}
    if (!h) { h = await pick(); if (!h) return null; }
    return save(pid, h);
  }
  function zip(pid) {
    const fl = files(pid), list = Object.entries(fl), X = window.TribeExport;
    if (!list.length || !X || !X.zip) throw new Error('There is nothing to save yet.');
    const db = OFF().state(), p = (db.projects || []).find(x => x.id === pid) || db.projects[0];
    const blob = X.zip(list, 'application/zip'), u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = `${safe(p.name)}.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    return { files: list.length, name: a.download };
  }

  // ---------- the block inside setup (tribenew.js) and Sharing and backup: choose a folder, or the fallback ----------
  // o.onPick(handle|null) reports the choice; nothing is written until the caller saves.
  function mount(el, o = {}) {
    if (!el) return;
    let picked = null;
    const draw = () => {
      if (!can()) {
        el.innerHTML = `<p class="ph-note bf-note" id="bf-fallback">This browser can’t open folders. It will be kept in this browser, and you can download a copy of its files any time from Sharing and backup.</p>
          <p class="ph-note"><a href="${esc((window.TribeWeb && window.TribeWeb.RELEASES) || 'https://github.com/orionopenwow/TribeCode/releases/latest')}" target="_blank" rel="noopener">Get the TribeCode app</a> to keep it in a folder on your computer.</p>`;
        return;
      }
      el.innerHTML = `<div class="bf-row"><button type="button" class="btn" id="bf-pick">${picked ? 'Choose another folder' : 'Choose a folder'}</button><span class="bf-name" id="bf-name">${picked ? esc(picked.name) : 'No folder chosen yet'}</span></div>
        <p class="ph-note">Pick a folder, or make a new one in the window that opens. A copy of its files is saved there; it also stays in this browser.</p>`;
      el.querySelector('#bf-pick').onclick = async () => { try { const h = await pick(); if (h) { picked = h; if (o.onPick) o.onPick(h); draw(); } } catch (e) { toast(e.message); } };
    };
    draw();
  }

  window.TribeBrowserFolder = { can, pick, save, again, zip, files, name, savedAt, forget, mount };
})();
