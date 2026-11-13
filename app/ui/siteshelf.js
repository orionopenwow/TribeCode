// The Saved shelf: snapshots of the project website (a flat thumbnail + a note) to compare and restore.
// In the preview (the Saved button, or the Saved tab on phones) and in Files › Website under "Website versions".
// Every Flint edit is kept as a recent version too, so nothing is ever lost (server/siteflint.js).
// Public: window.TribeSiteShelf = { open(pane, opts), close(), isOpen(), changed(), render(box, pid, opts) }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const ago = iso => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return !isFinite(s) ? '' : s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const api = (pid, path, opt) => C.api(`/projects/${encodeURIComponent(pid)}/website/versions${path || ''}`, opt);
  const boxes = new Set();   // every shelf on screen (preview + Files), repainted on changes

  function render(box, pid, opts = {}) {
    box.classList.add('ssh-box'); box.dataset.pid = pid; boxes.add(box);
    box._opts = opts;
    paint(box);
    if (!box._wired) { box._wired = true; box.addEventListener('click', e => onClick(box, e)); box.addEventListener('submit', e => onSave(box, e)); }
  }
  async function paint(box) {
    if (!box.isConnected) { boxes.delete(box); return; }
    const pid = box.dataset.pid, opts = box._opts || {};
    let r; try { r = await api(pid); } catch (e) { box.innerHTML = `<p class="ssh-none">${esc(e.message)}</p>`; return; }
    box._data = r;
    if (!r.current) { box.innerHTML = `<p class="ssh-none">There is no website yet, so nothing to save. Make it first: one tap in the preview's Website tab or in Files › Website.</p>`; return; }
    const card = v => `<li class="ssh-card" data-vid="${esc(v.id)}"><img class="ssh-th" src="${v.thumb}" alt="" width="96" height="96">
      <div class="ssh-txt"><b>${esc(v.note)}</b><small>${esc(v.byName || '')} · ${esc(ago(v.at))}</small><small class="ssh-hl">“${esc(v.headline.slice(0, 48))}”</small>
      <span class="ssh-acts"><button type="button" class="btn sm" data-ssh="compare">Compare</button><button type="button" class="btn sm" data-ssh="restore">Restore</button><button type="button" class="ssh-x" data-ssh="del" title="Remove from the shelf" aria-label="Remove ${esc(v.note)} from the shelf">✕</button></span></div></li>`;
    box.innerHTML = `${opts.head === false ? '' : `<header class="ssh-h"><span><span class="eyebrow">Saved shelf</span><h3>Website versions</h3></span>${opts.closable ? '<button type="button" class="ssh-x" data-ssh="close" aria-label="Close the shelf">✕</button>' : ''}</header>`}
      <form class="ssh-save" autocomplete="off"><img class="ssh-th sm" src="${r.current.thumb}" alt="The website now" width="56" height="56"><input class="input" name="note" maxlength="80" placeholder="A note, e.g. Before the launch" aria-label="A note for this version"><button class="btn sm primary">Save this version</button></form>
      <p class="ssh-k mono">Saved · ${r.saved.length}</p>
      ${r.saved.length ? `<ol class="ssh-list">${r.saved.map(card).join('')}</ol>` : '<p class="ssh-none">Nothing saved yet. Save a version before a big change: it keeps a picture and a note, and you can bring it back any time.</p>'}
      ${r.recent.length ? `<details class="ssh-rec"${opts.openRecent ? ' open' : ''}><summary class="ssh-k mono">Recent edits · ${r.recent.length}${r.undo ? ' · say “undo” to step back' : ''}</summary><ol>${r.recent.map(v => `<li data-vid="${esc(v.id)}"><span>${esc(v.note)}</span><small>${esc(ago(v.at))}</small><button type="button" class="btn sm" data-ssh="restore">Restore</button></li>`).join('')}</ol></details>` : ''}
      <div class="ssh-cmp hidden" role="region" aria-label="Compare"></div>`;
  }
  async function onSave(box, e) {
    if (!e.target.classList.contains('ssh-save')) return; e.preventDefault();
    const btn = e.target.querySelector('button'), note = e.target.note.value.trim(); btn.disabled = true;
    try { const r = await api(box.dataset.pid, '', { method: 'POST', body: { note } }); toast(`Saved “${r.note}” to the shelf`); paintAll(); }
    catch (er) { toast(er.message); btn.disabled = false; }
  }
  async function onClick(box, e) {
    const b = e.target.closest('[data-ssh]'); if (!b) return;
    const act = b.dataset.ssh, li = b.closest('[data-vid]'), vid = li && li.dataset.vid, pid = box.dataset.pid;
    if (act === 'close') return close();
    if (act === 'cmpx') { box.querySelector('.ssh-cmp').classList.add('hidden'); return; }
    if (act === 'restore') {
      b.disabled = true;
      try { const r = await api(pid, `/${encodeURIComponent(vid)}/restore`, { method: 'POST', body: {} }); toast(r.say); paintAll(); }
      catch (er) { toast(er.message); b.disabled = false; }
      return;
    }
    if (act === 'del') { try { await api(pid, `/${encodeURIComponent(vid)}`, { method: 'DELETE' }); paintAll(); } catch (er) { toast(er.message); } return; }
    if (act === 'compare') {
      const cmp = box.querySelector('.ssh-cmp'), v = ((box._data || {}).versions || []).find(x => x.id === vid) || {};
      cmp.classList.remove('hidden'); cmp.innerHTML = '<p class="ssh-none">Comparing…</p>';
      try {
        const r = await api(pid, `/${encodeURIComponent(vid)}/compare`);
        cmp.innerHTML = `<header class="ssh-h"><span><span class="eyebrow">Compare</span><h3>${esc(v.note || 'That version')} → now</h3></span><button type="button" class="ssh-x" data-ssh="cmpx" aria-label="Close the comparison">✕</button></header>
          <div class="ssh-two"><figure><img src="${r.thumb}" alt="That version"><figcaption>${esc(v.note || 'Then')}</figcaption></figure><figure><img src="${r.now}" alt="The website now"><figcaption>Now</figcaption></figure></div>
          ${r.changes.length ? `<ul class="ssh-chg">${r.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="ssh-none">No differences: this is what the website looks like now.</p>'}
          <p class="ssh-acts" data-vid="${esc(vid)}"><button type="button" class="btn sm primary" data-ssh="restore">Restore ${esc(v.note || 'this version')}</button><button type="button" class="btn sm" data-ssh="cmpx">Keep the current one</button></p>`;
      } catch (er) { cmp.innerHTML = `<p class="ssh-none">${esc(er.message)}</p>`; }
    }
  }
  function paintAll() { for (const b of [...boxes]) paint(b); }

  // ---------- in the preview: a panel over the right of the page (a full sheet on phones) ----------
  let panel = null, onClose = null;
  function open(pane, opts = {}) {
    const body = pane.querySelector('.pvw-body'); if (!body) return;
    if (!panel || !panel.isConnected) { panel = document.createElement('aside'); panel.className = 'ssh'; panel.id = 'ssh'; panel.setAttribute('aria-label', 'Saved versions'); body.appendChild(panel); }
    onClose = opts.onClose || null;
    render(panel, opts.project ? opts.project() : C.project(), { closable: true, openRecent: true });
  }
  function close() { if (panel) { boxes.delete(panel); panel.remove(); panel = null; const f = onClose; onClose = null; if (f) f(); } }
  let t = null;
  function changed() { clearTimeout(t); t = setTimeout(paintAll, 250); }
  if (C.on) C.on('ws', m => { if (m && m.type === 'website') changed(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel && panel.isConnected && !e.target.closest('input, textarea')) { e.stopPropagation(); close(); } }, true);

  window.TribeSiteShelf = { open, close, isOpen: () => !!(panel && panel.isConnected), changed, render, refresh: paintAll };
})();
