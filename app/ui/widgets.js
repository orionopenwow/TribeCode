// Sidebar widgets (feat/sidebar-widgets): the rows under a project's core rows (Dashboard · Messages · Files ·
// Task Board · Agents Hub), drawn into #nest-extra:
//   Preview game / Preview app / Preview   while the project has something to run (opens the preview pane, preview.js)
//   Website                                once the project's Website is built or set up (Files › Website, website.js)
//   the tribe's added widgets              built-in views (Calendar, Bugs…), custom links and pinned docs
//   + Add                                  a small picker; host and builders only
// Added widgets are saved per project for the whole tribe (server/widgets.js); a change reaches everyone live.
// Remove from the ⋯ on hover or a right-click; drag to re-order (desktop). Phones: the same rows sit in the side
// panel (the drawer), and the picker opens as a bottom sheet.
// Public: window.TribeWidgets = { refresh(), state(), openPicker() }.
(function () {
  const C = window.TribeClient;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 20) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#${id}"/></svg>`;
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const S = () => window.TribeShell;
  const pid = () => (window.TribeProjects && window.TribeProjects.current()) || (C.project && C.project()) || '';
  const closeDrawer = () => document.body.classList.remove('drawer-open');

  // The built-in views a tribe can add (keys match server/widgets.js; most are shell.js destinations).
  const BUILT = {
    calendar: { label: 'Calendar', icon: 'i-calendar', go: 'calendar' },
    bugs: { label: 'Bugs', icon: 'i-bug', go: 'bugs' },
    board: { label: 'Proposals & Board', icon: 'i-vote', go: 'board' },
    milestones: { label: 'Milestones', icon: 'i-flag', go: 'milestones' },
    repo: { label: 'Repo', icon: 'i-git', go: 'repo' },
    visuals: { label: 'Visuals & screenshots', icon: 'i-photo', go: 'visuals' },
    website: { label: 'Website', icon: 'i-link', go: 'website' },
    preview: { label: 'Preview', icon: 'i-play', run: () => window.TribePreview && window.TribePreview.open() },
    workshop: { label: 'Workshop', icon: 'i-box', run: () => window.TribeWorkshop && window.TribeWorkshop.open() },
    plan: { label: 'Daily plan', icon: 'i-sun', go: 'plan' },
    secretary: { label: 'Secretary', icon: 'i-quill', go: 'secretary' },
  };
  const ORDER = ['calendar', 'bugs', 'board', 'milestones', 'repo', 'visuals', 'website', 'preview', 'workshop', 'plan', 'secretary'];

  let st = { widgets: [], canEdit: false, preview: { show: false, label: 'Preview' }, website: { show: false } }, forPid = '', seq = 0;
  async function refresh() {
    const p = pid(); if (!p || !C.connected()) { st = { ...st, widgets: [], canEdit: false, preview: { show: false }, website: { show: false } }; return draw(); }
    const n = ++seq;
    try { const r = await C.api(`/projects/${encodeURIComponent(p)}/widgets`); if (n !== seq) return; st = r; forPid = p; }
    catch { if (n !== seq) return; st = { widgets: [], canEdit: false, preview: { show: false }, website: { show: false } }; }
    draw();
  }
  let rt; const soon = () => { clearTimeout(rt); rt = setTimeout(refresh, 250); };

  // ---------- the rows ----------
  const autoPreview = () => !!(st.preview && st.preview.show);
  const autoSite = () => !!(st.website && st.website.show);
  function rowOf(w) {
    if (w.kind === 'builtin') {
      const b = BUILT[w.key]; if (!b) return '';
      if ((w.key === 'website' && autoSite()) || (w.key === 'preview' && autoPreview())) return '';   // already a row of its own
      return `<button class="nest-row wg-row" draggable="${st.canEdit && !isPhone()}" data-wid="${esc(w.id)}" ${b.go ? `data-pnav="${esc(b.go)}"` : `data-wrun="${esc(w.key)}"`} id="wg-${esc(w.key)}">${ico(b.icon)}<span>${esc(b.label)}</span>${more(w)}</button>`;
    }
    const glyph = w.emoji ? `<span class="wg-emo" aria-hidden="true">${esc(w.emoji)}</span>` : ico(w.kind === 'doc' ? 'i-doc' : 'i-link');
    return `<button class="nest-row wg-row" draggable="${st.canEdit && !isPhone()}" data-wid="${esc(w.id)}" data-wopen="${esc(w.id)}" title="${esc(w.kind === 'link' ? w.url : 'Pinned doc')}">${glyph}<span>${esc(w.name)}</span>${more(w)}</button>`;
  }
  const more = w => st.canEdit ? `<span class="wg-more" role="button" tabindex="-1" data-wmore="${esc(w.id)}" title="More" aria-label="More for ${esc(w.name || (BUILT[w.key] || {}).label || 'this widget')}">⋯</span>` : '';
  function draw() {
    const box = $('#nest-extra'); if (!box) return;
    const rows = [];
    if (autoSite()) rows.push(`<button class="nest-row wg-auto" id="nest-website" data-pnav="website" title="The project's public page">${ico('i-link')}<span>Website</span></button>`);
    (st.widgets || []).forEach(w => rows.push(rowOf(w)));
    const html = rows.join('');
    if (box.innerHTML !== html) box.innerHTML = html;
    box.classList.toggle('empty', !rows.length);
    // Preview game / app: its own button at the bottom of the pane, above Invite friends (not among the rows)
    const pslot = $('#nest-preview-slot'), prev = autoPreview() ? `<button class="wg-preview" id="nest-preview" data-wrun="preview" data-kind="${esc(st.preview.kind || '')}" title="Run it and see it here">${ico('i-play')}<span>${esc(st.preview.label || 'Preview')}</span></button>` : '';
    if (pslot && pslot.innerHTML !== prev) pslot.innerHTML = prev;
    // + Add sits below the Repo row, in a bordered pill (the user's ask), not among the rows
    const slot = $('#nest-add-slot') || box, add = st.canEdit ? `<button class="nest-row wg-add" id="nest-add" title="Add a widget to this project's sidebar" aria-haspopup="menu">${ico('i-plus')}<span>Add</span></button>` : '';
    if (slot !== box && slot.innerHTML !== add) slot.innerHTML = add; else if (slot === box && add) box.insertAdjacentHTML('beforeend', add);
  }

  // ---------- clicks ----------
  function openWidget(w) {
    closeDrawer();
    const sh = S(); if (!sh) return;
    if (w.kind === 'doc') return sh.previewDoc(w.doc);
    if (w.kind === 'link') {
      sh.preview({ kind: 'Widget', title: w.name, html: `<div class="wg-frame"><iframe id="wg-iframe" src="${esc(w.url)}" title="${esc(w.name)}" sandbox="allow-scripts allow-forms allow-popups allow-same-origin" referrerpolicy="no-referrer" loading="lazy"></iframe></div>`,
        actions: [{ label: 'Open in a new tab', run: () => window.open(w.url, '_blank', 'noopener') }] });
    }
  }
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const m = e.target.closest('#nest-extra [data-wmore]'); if (m) { e.preventDefault(); e.stopPropagation(); return menu(m, m.dataset.wmore); }
    const add = e.target.closest('#nest-add'); if (add) { e.preventDefault(); return openPicker(add); }
    const r = e.target.closest('#nest-extra [data-wrun], #nest-preview-slot [data-wrun]'); if (r) { e.preventDefault(); closeDrawer(); const b = BUILT[r.dataset.wrun]; return b && b.run && b.run(); }
    const o = e.target.closest('#nest-extra [data-wopen]'); if (o) { e.preventDefault(); const w = (st.widgets || []).find(x => x.id === o.dataset.wopen); if (w) openWidget(w); }
  }, true);
  document.addEventListener('contextmenu', e => {
    const r = e.target.closest && e.target.closest('#nest-extra [data-wid]'); if (!r || !st.canEdit) return;
    e.preventDefault(); menu(r, r.dataset.wid);
  });

  // ---------- a small popover (flat, 1px border; a bottom sheet on phones) ----------
  let popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function pop(anchor, html, id) {
    closePop();
    const el = document.createElement('div'); el.className = `sh-pop wg-pop ${isPhone() ? 'sheet' : ''}`; el.id = id; el.setAttribute('role', 'menu');
    el.innerHTML = (isPhone() ? '<div class="pj-grab"></div>' : '') + html;
    document.body.appendChild(el); popEl = el;
    if (!isPhone()) {
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = Math.min(Math.max(8, r.right + 8), innerWidth - w - 8) + 'px';
      el.style.top = Math.min(Math.max(8, r.top - 6), innerHeight - h - 8) + 'px';
    }
    return el;
  }
  document.addEventListener('mousedown', e => { if (popEl && !popEl.contains(e.target) && !e.target.closest('#nest-add, [data-wmore]')) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && popEl) { closePop(); e.stopPropagation(); } }, true);

  async function save(list) {
    try { st = await C.api(`/projects/${encodeURIComponent(pid())}/widgets`, { method: 'PUT', body: { widgets: list } }); draw(); return true; }
    catch (e) { toast(e.message); return false; }
  }
  function menu(anchor, id) {
    const w = (st.widgets || []).find(x => x.id === id); if (!w) return;
    const el = pop(anchor, `<div class="sh-menu"><button data-wm="remove">${ico('i-x', 16)}<span>Remove from the sidebar</span></button></div>`, 'wg-menu');
    el.querySelector('[data-wm="remove"]').onclick = async () => { closePop(); if (await save(st.widgets.filter(x => x.id !== id))) toast('Removed'); };
  }

  // ---------- + Add: built in · a custom link or doc ----------
  function openPicker(anchor) {
    if (!st.canEdit) return;
    anchor = anchor || $('#nest-add');
    const have = new Set((st.widgets || []).filter(w => w.kind === 'builtin').map(w => w.key));
    if (autoSite()) have.add('website'); if (autoPreview()) have.add('preview');
    const el = pop(anchor, `<div class="sh-menu wg-pick">
        <h6>Add to this project</h6>
        ${ORDER.map(k => `<button data-wadd="${k}" ${have.has(k) ? 'disabled aria-disabled="true"' : ''}>${ico(BUILT[k].icon, 16)}<span>${esc(BUILT[k].label)}</span>${have.has(k) ? '<small>Added</small>' : ''}</button>`).join('')}
        <hr><button data-wcustom>${ico('i-link', 16)}<span>Custom link or doc…</span></button></div>`, 'wg-picker');
    el.querySelectorAll('[data-wadd]:not([disabled])').forEach(b => b.onclick = async () => {
      closePop();
      if (await save([...(st.widgets || []), { kind: 'builtin', key: b.dataset.wadd }])) toast(`${BUILT[b.dataset.wadd].label} added`);
    });
    el.querySelector('[data-wcustom]').onclick = () => custom(anchor);
  }
  async function custom(anchor) {
    const el = pop(anchor, `<form class="wg-form" id="wg-form" autocomplete="off">
        <h6>Custom widget</h6>
        <div class="wg-two"><input class="input wg-emoji" id="wg-emoji" maxlength="4" placeholder="🔗" aria-label="Emoji"><input class="input" id="wg-name" maxlength="40" placeholder="Name" aria-label="Name" required></div>
        <input class="input" id="wg-url" placeholder="https://…" aria-label="Link" inputmode="url">
        <select class="input" id="wg-doc" aria-label="Or pin a doc"><option value="">…or pin a doc</option></select>
        <div class="wg-acts"><button type="button" class="btn" id="wg-cancel">Cancel</button><button class="btn primary" id="wg-save">Add</button></div></form>`, 'wg-custom');
    const f = el.querySelector('form'), name = el.querySelector('#wg-name'), url = el.querySelector('#wg-url'), doc = el.querySelector('#wg-doc');
    if (!isPhone()) name.focus();
    C.api('/docs').then(({ docs }) => { doc.innerHTML += (docs || []).slice(0, 60).map(d => `<option value="${esc(d.slug)}">${esc(d.title)}</option>`).join(''); }).catch(() => {});
    doc.onchange = () => { if (doc.value && !name.value.trim()) name.value = doc.selectedOptions[0].textContent.slice(0, 40); };
    el.querySelector('#wg-cancel').onclick = closePop;
    f.onsubmit = async e => {
      e.preventDefault();
      const nm = name.value.trim(), emoji = el.querySelector('#wg-emoji').value.trim();
      let u = url.value.trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
      if (!nm) return name.focus();
      if (!u && !doc.value) { toast('Add a link or pick a doc'); return url.focus(); }
      const w = u ? { kind: 'link', name: nm, emoji, url: u } : { kind: 'doc', name: nm, emoji, doc: doc.value };
      if (await save([...(st.widgets || []), w])) { closePop(); toast(`${nm} added`); }
    };
  }

  // ---------- drag to re-order (desktop) ----------
  let dragId = null;
  document.addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('#nest-extra [data-wid]'); if (!r || !st.canEdit) return; dragId = r.dataset.wid; r.classList.add('dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } catch {} });
  document.addEventListener('dragover', e => { if (!dragId) return; const r = e.target.closest && e.target.closest('#nest-extra [data-wid]'); if (r) { e.preventDefault(); document.querySelectorAll('#nest-extra .drop').forEach(x => x !== r && x.classList.remove('drop')); r.classList.add('drop'); } });
  document.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('#nest-extra .dragging, #nest-extra .drop').forEach(x => x.classList.remove('dragging', 'drop')); });
  document.addEventListener('drop', e => {
    if (!dragId) return; const r = e.target.closest && e.target.closest('#nest-extra [data-wid]'); if (!r) return;
    e.preventDefault();
    const list = (st.widgets || []).slice(), from = list.findIndex(x => x.id === dragId), to = list.findIndex(x => x.id === r.dataset.wid);
    dragId = null; if (from < 0 || to < 0 || from === to) return draw();
    const [m] = list.splice(from, 1); list.splice(to, 0, m); save(list);
  });

  // ---------- keep in step ----------
  C.on('hello', soon); C.on('project', soon); C.on('projects', soon);
  C.on('ws', m => { if (m && ['widgets', 'website', 'preview', 'project'].includes(m.type) && (!m.project || m.project === pid())) soon(); });
  setTimeout(refresh, 0);
  window.TribeWidgets = { refresh, state: () => ({ ...st, project: forPid }), openPicker };
})();
