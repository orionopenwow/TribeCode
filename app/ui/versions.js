// Versions, in one place (feat/folder-sync; server/versions.js). A timeline of the project's saves and ships (who,
// when, the message, the files), with the website designer's saved versions in the same list. Pick one to see what
// changed and to: view a file's diff, restore that file, restore the whole project (as a new version: nothing is
// thrown away), name it ("v1 demo"), compare it with another, or download it as a zip.
// Ways in: the home pill's popover, the project's right-click menu and switcher, Ctrl K "Versions".
// Public: window.TribeVersions = { open(pid), close() }
(function () {
  'use strict';
  const C = () => window.TribeClient, S = () => window.TribeStore, A = () => window.TribeApp;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, s = 16) => `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const toast = m => A() && A().toast && A().toast(m);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const when = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const plural = (n, a) => `${n} ${a}${n === 1 ? '' : 's'}`;
  const api = (path, o) => C().api(path, o);

  let el = null, scrim = null, st = null;
  function close(now) {
    if (!el) return; const a = el, b = scrim; el = scrim = null; st = null;
    if (now) { a.remove(); b.remove(); return; }
    window.TribeUI.dismiss([a, b], () => { a.remove(); b.remove(); });   // the shared way out (uikit.js)
  }
  async function open(pid) {
    pid = pid || (C() && C().project && C().project());
    if (!pid || !(C() && C().connected && C().connected())) return toast('History belongs to a project in a tribe.');
    close(true);
    const name = ((C().state().projects || []).find(x => x.id === pid) || {}).name || 'This project';
    scrim = document.createElement('div'); scrim.className = 'ph-scrim vr-scrim'; scrim.onclick = () => close();
    el = document.createElement('div'); el.className = 'ph-sheet vr-sheet'; el.id = 'vr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'vr-h');
    el.innerHTML = `<header class="ph-h vr-head"><div><span class="eyebrow">History</span><h3 id="vr-h">${esc(name)}’s history</h3></div>
        <span class="vr-sp"></span><button type="button" class="btn sm" id="vr-save">Save a version now</button><button type="button" class="su-x lr-x" id="vr-x" aria-label="Close">${ic('x')}</button></header>
      <p class="vr-sub ph-note" id="vr-sub">Loading…</p>
      <nav class="vr-also" id="vr-also" aria-label="Kept elsewhere"><span class="faint">Kept separately:</span><button type="button" class="linkish" id="vr-designs" title="Designs of the website saved in the website designer">Saved designs</button><span class="faint" aria-hidden="true">·</span><button type="button" class="linkish" id="vr-shots" title="Earlier screenshots of each screen, in Visuals">Earlier shots</button></nav>
      <div class="vr-body"><ol class="vr-list" id="vr-list" aria-label="Versions"></ol><section class="vr-detail" id="vr-detail" aria-live="polite"><p class="faint">Pick a version to see what changed.</p></section></div>`;
    document.body.append(scrim, el);
    window.TribeUI.adopt(el, { scrim, kind: 'steps', onClose: () => close() });   // shared scrim, way in, Esc, focus trap
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    $('#vr-x', el).onclick = () => close();
    st = { pid, cmp: [], data: null, site: [] };
    $('#vr-designs', el).onclick = () => { close(); savedDesigns(pid); };
    $('#vr-shots', el).onclick = () => { close(); A().show('visuals'); };
    $('#vr-save', el).onclick = async () => { try { const r = await api(`/projects/${encodeURIComponent(pid)}/versions`, { method: 'POST', body: {} }); toast(r.version ? 'Saved a version.' : r.note); load(); } catch (e) { toast(e.message); } };
    await load();
    return el;
  }
  // Saved designs live with the website: Files › Website on a host (the preview's Saved button shows the same list),
  // the designer on this device
  function savedDesigns(pid) {
    if ((window.TribeDevice && window.TribeDevice.on()) || !A().show) return window.TribeSiteDesigner ? window.TribeSiteDesigner.open({ pid }) : null;
    location.hash = '#/docs/website';   // Files › Website (router.js)
    let n = 0; const go = () => { const sec = document.querySelector('#wb-versions-sec'); if (sec && sec.offsetParent) sec.scrollIntoView({ block: 'start' }); else if (++n < 25) setTimeout(go, 200); }; setTimeout(go, 150);
  }
  async function load(keep) {
    if (!el) return; const pid = st.pid;
    let d; try { d = await api(`/projects/${encodeURIComponent(pid)}/versions`); } catch (e) { $('#vr-sub', el).textContent = e.message; return; }
    let site = []; try { site = ((await api(`/projects/${encodeURIComponent(pid)}/website/versions`)).versions || []); } catch {}
    if (!el) return;
    st.data = d; st.site = site;
    $('#vr-sub', el).textContent = d.kind === 'device' ? `Kept on this device: the vision, docs and website, saved a few seconds after you stop editing. The newest ${d.cap || 40} are kept.${d.dirty ? ` ${plural(d.dirty, 'file')} changed since the last version.` : ''} Pick two with Compare to see what changed between them.` : !d.kind ? 'No folder or code repository yet: choose where it lives and its history starts.' : `${d.kind === 'history' ? 'A plain folder: TribeCode keeps its history in .tribe/history, your folder isn’t touched.' : 'From the project’s git history.'}${d.dirty ? ` ${plural(d.dirty, 'file')} changed since the last version.` : ''} Pick two with Compare to see what changed between them.`;
    $('#vr-save', el).hidden = !d.kind;
    const items = [...d.list.map(v => ({ ...v, k: 'code' })), ...site.map(v => ({ k: 'site', id: v.id, at: v.at || v.created, message: v.note || 'Saved design', author: v.byName || v.by || '' }))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    $('#vr-list', el).innerHTML = items.length ? items.map(v => v.k === 'site' ? `<li class="vr-item vr-site"><button type="button" class="vr-row" data-site="${esc(v.id)}"><span class="vr-dot" aria-hidden="true"></span><span class="vr-t"><b>${esc(v.message)}</b><small>Saved design · ${esc(v.author)} · ${when(v.at)}</small></span></button></li>`
      : `<li class="vr-item${st.cmp.includes(v.sha) ? ' cmp' : ''}"><button type="button" class="vr-row" data-sha="${esc(v.sha)}"><span class="vr-dot${v.shipped ? ' shipped' : ''}" aria-hidden="true"></span>
        <span class="vr-t"><b>${esc(v.message)}</b><small>${esc(v.author)} · ${when(v.at)} · ${plural(v.files, 'file')}</small>
        <span class="vr-badges">${v.tags.map(t => `<em class="vr-tag">${esc(t)}</em>`).join('')}${v.shipped ? `<em class="vr-ship">${v.shipped.pr ? 'pull request' : 'shipped'}</em>` : ''}</span></span></button>
        <label class="vr-cmp" title="Compare"><input type="checkbox" data-cmp="${esc(v.sha)}" ${st.cmp.includes(v.sha) ? 'checked' : ''}> Compare</label></li>`).join('') : '<li class="faint vr-none">No versions yet.</li>';
    el.querySelectorAll('[data-sha]').forEach(b => b.onclick = () => show(b.dataset.sha));
    el.querySelectorAll('[data-site]').forEach(b => b.onclick = () => { close(); savedDesigns(st.pid); });
    el.querySelectorAll('[data-cmp]').forEach(x => x.onchange = () => {
      const s = x.dataset.cmp; st.cmp = x.checked ? [...st.cmp.filter(y => y !== s), s].slice(-2) : st.cmp.filter(y => y !== s);
      el.querySelectorAll('[data-cmp]').forEach(y => { y.checked = st.cmp.includes(y.dataset.cmp); y.closest('.vr-item').classList.toggle('cmp', y.checked); });
      if (st.cmp.length === 2) compare();
    });
    if (!keep && d.list[0]) show(d.list[0].sha);
  }
  const diffHtml = t => `<pre class="vr-diff">${esc(t || 'No changes.').split('\n').map(l => `<span class="${/^\+(?!\+\+)/.test(l) ? 'add' : /^-(?!--)/.test(l) ? 'del' : /^@@/.test(l) ? 'hunk' : /^(diff |index |\+\+\+|---)/.test(l) ? 'meta' : ''}">${l}</span>`).join('\n')}</pre>`;
  const sub = () => `/projects/${encodeURIComponent(st.pid)}/versions`;
  async function show(sha) {
    if (!el) return; const box = $('#vr-detail', el);
    el.querySelectorAll('.vr-row').forEach(r => r.setAttribute('aria-current', String(r.dataset.sha === sha)));
    let v; try { v = await api(`${sub()}/${sha}`); } catch (e) { box.innerHTML = `<p class="faint">${esc(e.message)}</p>`; return; }
    const meta = (st.data.list || []).find(x => x.sha === sha) || {};
    const paint = () => {
      box.innerHTML = `<div class="vr-dh"><span class="eyebrow">${esc(sha.slice(0, 7))}${meta.tags && meta.tags.length ? ' · ' + esc(meta.tags.join(', ')) : ''}</span><h4>${esc(v.message)}</h4><p class="faint">${esc(v.author)} · ${when(v.at)}</p></div>
        <ul class="vr-files">${v.files.map(f => `<li><code>${esc(f.path)}</code><span class="vr-n"><i class="add">+${f.add}</i> <i class="del">−${f.del}</i></span><button type="button" class="linkish" data-diff="${esc(f.path)}">Diff</button><button type="button" class="linkish" data-restore-file="${esc(f.path)}">Restore this file</button></li>`).join('') || '<li class="faint">No file changes.</li>'}</ul>
        <div class="vr-acts"><button type="button" class="btn sm" id="vr-diff-all">Show the whole diff</button><button type="button" class="btn sm" id="vr-zip">${ic('box', 14)}Download zip</button>
          <form class="vr-tagf" id="vr-tagf"><input class="input" id="vr-tag" maxlength="60" placeholder="Name it, like v1 demo" value="${esc((meta.tags || [])[0] || '')}" aria-label="Name this version"><button class="btn sm" type="submit">Name</button></form>
          <button type="button" class="btn sm primary" id="vr-restore">Restore the project to this version</button></div>
        <div id="vr-diff-box"></div>`;
      const diffBox = $('#vr-diff-box', box);
      box.querySelectorAll('[data-diff]').forEach(b => b.onclick = async () => { try { diffBox.innerHTML = diffHtml((await api(`${sub()}/${sha}/diff?path=${encodeURIComponent(b.dataset.diff)}`)).diff); } catch (e) { toast(e.message); } });
      $('#vr-diff-all', box).onclick = async () => { try { diffBox.innerHTML = diffHtml((await api(`${sub()}/${sha}/diff`)).diff); } catch (e) { toast(e.message); } };
      box.querySelectorAll('[data-restore-file]').forEach(b => b.onclick = async () => {
        if (!confirm(`Put ${b.dataset.restoreFile} back as it was in this version? What's there now stays in the history.`)) return;
        try { await api(`${sub()}/${sha}/restore-file`, { method: 'POST', body: { path: b.dataset.restoreFile } }); toast(`${b.dataset.restoreFile} is back as it was.`); load(true); } catch (e) { toast(e.message); }
      });
      $('#vr-restore', box).onclick = async () => {
        if (!confirm('Restore the whole project to this version? It becomes a new version on top; everything after it stays in the history.')) return;
        try { await api(`${sub()}/${sha}/restore`, { method: 'POST' }); toast('Restored, as a new version.'); load(); } catch (e) { toast(e.message); }
      };
      $('#vr-tagf', box).onsubmit = async e => { e.preventDefault(); try { await api(`${sub()}/${sha}/tag`, { method: 'POST', body: { name: $('#vr-tag', box).value } }); toast('Named.'); await load(true); show(sha); } catch (x) { toast(x.message); } };
      $('#vr-zip', box).onclick = () => download(sha);
    };
    window.TribeMotion && window.TribeMotion.swap ? window.TribeMotion.swap(paint) : paint();
  }
  async function compare() {
    const box = $('#vr-detail', el), [x, y] = st.cmp;
    const order = (st.data.list || []).map(v => v.sha), a = order.indexOf(x) > order.indexOf(y) ? x : y, b = a === x ? y : x;   // older → newer
    try {
      const r = await api(`${sub()}/compare?a=${a}&b=${b}`);
      box.innerHTML = `<div class="vr-dh"><span class="eyebrow">Compare</span><h4>${esc(a.slice(0, 7))} → ${esc(b.slice(0, 7))}</h4><p class="faint">${plural(r.files.length, 'file')} changed between them.</p></div>
        <ul class="vr-files">${r.files.map(f => `<li><code>${esc(f.path)}</code><span class="vr-n"><i class="add">+${f.add}</i> <i class="del">−${f.del}</i></span></li>`).join('')}</ul>${diffHtml(r.diff)}`;
    } catch (e) { toast(e.message); }
  }
  async function download(sha) {
    try {
      const base = String(((S().get() || {}).server || {}).url || location.origin).replace(/\/+$/, ''), tok = ((S().get() || {}).server || {}).token;
      const r = await fetch(`${base}/api${sub()}/${sha}/zip`, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `The host said ${r.status}.`);
      const blob = await r.blob(), a = document.createElement('a'), name = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
      a.href = URL.createObjectURL(blob); a.download = name ? name[1] : `version-${sha.slice(0, 7)}.zip`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) { toast(e.message); }
  }
  const hook = () => { const c = C(); if (!c || !c.on) return setTimeout(hook, 300); c.on('ws', m => { if (el && m && m.type === 'versions' && m.project === st.pid) load(true); }); };
  hook();
  // Esc closes it wherever focus is (opened from the palette or Ctrl K, focus is still outside the sheet)
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && el && !e.defaultPrevented && !el.contains(e.target)) close(); });
  window.TribeVersions = { open, close, isOpen: () => !!el };
})();
