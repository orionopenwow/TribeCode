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
    repo: { label: 'Code repository', icon: 'i-git', go: 'repo' },
    visuals: { label: 'Visuals & screenshots', icon: 'i-photo', go: 'visuals' },
    website: { label: 'Website', icon: 'i-link', go: 'website' },
    preview: { label: 'Preview', icon: 'i-play', run: () => window.TribePreview && window.TribePreview.open() },
    workshop: { label: 'Workshop', icon: 'i-wrench', run: () => window.TribeWorkshop && window.TribeWorkshop.open() },
    plan: { label: 'Daily plan', icon: 'i-sun', go: 'plan' },
    secretary: { label: 'Secretary', icon: 'i-quill', go: 'secretary' },
    whiteboard: { label: 'Whiteboard', icon: 'i-whiteboard', run: () => window.TribeWhiteboard && window.TribeWhiteboard.open() },   // feat/whiteboard (whiteboard.js)
    // v0.27 company: four more views that already exist elsewhere in the app
    captures: { label: 'Captures', icon: 'i-link', go: 'captures' },
    assets: { label: 'Asset library', icon: 'i-photo', run: () => window.TribeAssets && window.TribeAssets.open() },
    mcp: { label: 'TribeCode MCP', icon: 'i-plug', go: 'mcp-directory' },
    market: { label: 'Marketplace', icon: 'i-wrench', run: () => window.TribeMarket && window.TribeMarket.open() },
  };
  const ORDER = ['whiteboard', 'calendar', 'bugs', 'board', 'milestones', 'repo', 'visuals', 'website', 'preview', 'workshop', 'plan', 'secretary', 'captures', 'assets', 'mcp', 'market'];

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
  // feat/site-v2: the Website row shows once a website draft exists (a designer config, a published site, a started site,
  // or a design on this device) and opens the website designer; a dot while edits are not on the host yet
  const SD = () => window.TribeSiteDesigner;
  const autoSite = () => !!(st.website && st.website.show) || !!(pid() && SD() && SD().hasDraft && SD().hasDraft(pid()));
  const siteIcon = () => (window.TribeIcons && window.TribeIcons.svg ? window.TribeIcons.svg('website', 18) : `<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3z"/></svg>`);
  addEventListener('tribe:site-draft', e => { const d = e.detail || {}; if (d.pid && d.pid === pid()) { if (!document.getElementById('nest-website')) draw(); const dot = document.querySelector('#nest-website .wg-dot'); if (dot) dot.hidden = !d.dirty; } });
  document.addEventListener('click', e => { const r = e.target.closest && e.target.closest('#nest-website[data-wdz-open]'); if (!r || !SD()) return; e.preventDefault(); e.stopPropagation(); SD().open({ pid: pid() }); }, true);
  function rowOf(w) {
    if (w.kind === 'builtin') {
      const b = BUILT[w.key]; if (!b) return '';
      if ((w.key === 'website' && autoSite()) || (w.key === 'preview' && pid())) return '';   // already a row of its own
      return `<button class="nest-row wg-row" draggable="${st.canEdit && !isPhone()}" data-wid="${esc(w.id)}" ${b.go ? `data-pnav="${esc(b.go)}"` : `data-wrun="${esc(w.key)}"`} id="wg-${esc(w.key)}">${ico(b.icon)}<span>${esc(b.label)}</span>${more(w)}</button>`;
    }
    const glyph = w.emoji ? `<span class="wg-emo" aria-hidden="true">${esc(w.emoji)}</span>` : ico(w.kind === 'doc' ? 'i-doc' : 'i-link');
    return `<button class="nest-row wg-row" draggable="${st.canEdit && !isPhone()}" data-wid="${esc(w.id)}" data-wopen="${esc(w.id)}" title="${esc(w.kind === 'link' ? w.url : 'Pinned doc')}">${glyph}<span>${esc(w.name)}</span>${more(w)}</button>`;
  }
  const more = w => st.canEdit ? `<span class="wg-more" role="button" tabindex="-1" data-wmore="${esc(w.id)}" title="More" aria-label="More for ${esc(w.name || (BUILT[w.key] || {}).label || 'this widget')}">⋯</span>` : '';
  function draw() {
    const box = $('#nest-extra'); if (!box) return;
    const rows = [];
    if (autoSite()) { const dirty = !!(SD() && SD().dirty && SD().dirty(pid())); rows.push(`<button class="nest-row wg-auto" id="nest-website" data-wdz-open="1" title="The project's website: open the designer">${siteIcon()}<span>Website</span><span class="wg-dot" title="Not saved to the host yet"${dirty ? '' : ' hidden'}></span></button>`); }
    (st.widgets || []).forEach(w => rows.push(rowOf(w)));
    const html = rows.join('');
    if (box.innerHTML !== html) box.innerHTML = html;
    box.classList.toggle('empty', !rows.length);
    // Preview game / app: its own button at the bottom of the pane, above Invite friends (not among the rows)
    // Always there once a project is open (the user's ask): the play button for the code under the whole app or game.
    // Before there is code, the preview opens on its "nothing to run yet" start screen.
    const pk = (st.preview && st.preview.kind) || '', plabel = (st.preview && st.preview.show && st.preview.label) || ({ game: 'Play the game', site: 'Preview the site', app: 'Preview the app' }[pk] || 'Preview app');
    const pslot = $('#nest-preview-slot'), prev = pid() ? `<button class="wg-preview" id="nest-preview" data-wrun="preview" data-kind="${esc(pk)}" title="Run the project's code and see it live">${ico('i-play')}<span>${esc(plabel)}</span></button>` : '';
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

  // ---------- + Add: a gallery, like a "new page" picker, in TribeCode's own style ----------
  // Search on top; two quick starts (a link, a pinned doc); "Built into TribeCode" as tinted cards with a small flat
  // preview of what each one looks like; then starter packs that add a few at once. A full-screen sheet on phones.
  const LOOK = {   // each card's tint, emoji, and the mini preview's columns + rows (flat, no data)
    calendar: { tint: 'indigo', emo: '🗓️', blurb: 'Plans, playtests and deadlines', cols: ['Event', 'When', 'Who'], pills: ['Playtest', 'Demo day', 'Jam'] },
    bugs: { tint: 'rose', emo: '🐞', blurb: 'Report it once, fix it once', cols: ['Bug', 'Severity', 'Owner'], pills: ['High', 'Medium', 'Low'] },
    board: { tint: 'amber', emo: '🗳️', blurb: 'Ideas the tribe votes on', cols: ['Proposal', 'Votes', 'Status'], pills: ['Yes 3', 'Open', 'Passed'] },
    milestones: { tint: 'teal', emo: '🚩', blurb: 'The big steps, with progress', cols: ['Milestone', 'Progress', 'Due'], pills: ['v0.1', 'v0.2', 'Launch'] },
    repo: { tint: 'green', emo: '🌿', blurb: 'Versions, saved changes, the code', cols: ['Branch', 'Last saved change', 'By'], pills: ['main', 'feat/ui', 'fix/jump'] },
    visuals: { tint: 'violet', emo: '📸', blurb: 'Screenshots of what got built', cols: ['Shot', 'From', 'When'], pills: ['Title', 'Level 2', 'Menu'] },
    website: { tint: 'blue', emo: '🌐', blurb: 'A public page for the project', cols: ['Page', 'Status', 'Link'], pills: ['Home', 'Live', 'Press'] },
    preview: { tint: 'ember', emo: '▶️', blurb: 'Run it and see it here', cols: ['Build', 'Status', 'Port'], pills: ['Ready', 'Running', 'Live'] },
    workshop: { tint: 'amber', emo: '🧰', blurb: 'Starters, assets and tools', cols: ['Item', 'Kind', 'License'], pills: ['Sprites', 'Template', 'MIT'] },
    plan: { tint: 'teal', emo: '☀️', blurb: "Today's focus for everyone", cols: ['Today', 'Who', 'Done'], pills: ['Focus', 'Next', 'Done'] },
    secretary: { tint: 'violet', emo: '🪶', blurb: 'Notes, recaps and follow-ups', cols: ['Note', 'From', 'When'], pills: ['Recap', 'Action', 'Idea'] },
    whiteboard: { tint: 'amber', emo: '🖍️', blurb: 'Draw, sketch and stick notes, together', art: 'board' },   // feat/whiteboard: its own mini preview
    captures: { tint: 'blue', emo: '🔖', blurb: 'Links, videos and voice notes, summed up', cols: ['Capture', 'From', 'When'], pills: ['Article', 'Video', 'Voice'] },   // v0.27 company
    assets: { tint: 'green', emo: '🎨', blurb: 'Open art, sounds, icons and fonts', cols: ['Asset', 'Kind', 'License'], pills: ['CC0', 'MIT', 'OFL'] },
    mcp: { tint: 'teal', emo: '🔌', blurb: 'Connect Claude and other apps to the tribe', cols: ['App', 'Status', 'Tools'], pills: ['Claude', 'Ready', 'Cursor'] },
    market: { tint: 'ember', emo: '🛍️', blurb: 'Hundreds of widgets, skills and templates', cols: ['Item', 'Kind', 'License'], pills: ['Widget', 'Skill', 'MIT'] },
  };
  const PACKS = [
    { id: 'jam', emo: '🎮', name: 'Game jam', blurb: 'Calendar, Bugs, Milestones and Visuals', keys: ['calendar', 'bugs', 'milestones', 'visuals'] },
    { id: 'launch', emo: '🚀', name: 'Ship a site', blurb: 'Website, Milestones and the Board', keys: ['website', 'milestones', 'board'] },
    { id: 'crew', emo: '🔥', name: 'Weekly crew', blurb: 'Daily plan, Calendar and Secretary', keys: ['plan', 'calendar', 'secretary'] },
  ];
  function mini(k) {
    const L = LOOK[k], dot = '<i class="wgx-av"></i>';
    if (L.art === 'board') return `<div class="wgx-mini wgx-board" aria-hidden="true"><b>${L.emo} ${esc(BUILT[k].label)}</b><svg viewBox="0 0 200 70" preserveAspectRatio="xMinYMin meet"><path d="M8 52c14-22 26-30 38-18s20 8 30-6" fill="none" stroke="#38C6B1" stroke-width="3" stroke-linecap="round"/><rect x="92" y="10" width="38" height="24" rx="3" fill="none" stroke="#6C7CFF" stroke-width="2"/><path d="M98 50h34M126 44l6 6-6 6" fill="none" stroke="#F8FAFC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="146" y="6" width="40" height="40" rx="3" fill="#FFB86B"/><rect x="152" y="16" width="26" height="3" rx="1.5" fill="#12151A" opacity=".5"/><rect x="152" y="24" width="18" height="3" rx="1.5" fill="#12151A" opacity=".5"/></svg></div>`;   // feat/whiteboard
    const row = i => `<div class="wgx-tr"><span class="wgx-bar" style="width:${[62, 48, 70][i]}%"></span><span class="wgx-pill p${i}">${esc(L.pills[i])}</span><span>${dot}<span class="wgx-bar s"></span></span></div>`;
    return `<div class="wgx-mini" aria-hidden="true"><b>${L.emo} ${esc(BUILT[k].label)}</b><div class="wgx-th">${L.cols.map(c => `<span>${esc(c)}</span>`).join('')}</div>${[0, 1, 2].map(row).join('')}</div>`;
  }
  function closeGallery() { const g = $('#wg-picker'); if (g) { g.closest('.wgx-scrim').remove(); document.removeEventListener('keydown', galleryKey, true); } }
  function galleryKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeGallery(); } }
  function openPicker(anchor) {
    if (!st.canEdit) return;
    closePop(); closeGallery();
    const have = new Set((st.widgets || []).filter(w => w.kind === 'builtin').map(w => w.key));
    if (autoSite()) have.add('website'); if (pid()) have.add('preview');
    const P = ((window.TribeProjects && window.TribeProjects.list()) || []).find(x => x.id === pid()) || {};
    const scrim = document.createElement('div'); scrim.className = 'wgx-scrim';
    scrim.innerHTML = `<div class="wgx ${isPhone() ? 'sheet' : ''}" id="wg-picker" role="dialog" aria-modal="true" aria-label="Add to this project">
      <header class="wgx-head"><button class="wgx-x" data-wclose aria-label="Close">${ico('i-x', 16)}</button><span class="wgx-to">Add to <b>${esc(P.emoji ? P.emoji + ' ' : '')}${esc(P.name || 'this project')}</b></span>
        <label class="wgx-search">${ico('i-search', 16)}<input id="wgx-q" placeholder="Search" autocomplete="off" aria-label="Search widgets"></label></header>
      <div class="wgx-body">
        <div class="wgx-quick">
          <button class="wgx-q" data-wcustom data-k="link custom url website">${ico('i-link', 18)}<b>A link</b><small>Any page, opened right here</small></button>
          <button class="wgx-q" data-wcustom data-doc data-k="doc pin file notes">${ico('i-doc', 18)}<b>Pin a doc</b><small>One of the project's files</small></button>
        </div>
        <div class="wgx-mk-head"><h6 class="wgx-h">🛍️ From the Marketplace</h6><div class="mk-seg" role="tablist" aria-label="Sort">${[['hot', 'Hot'], ['new', 'New'], ['top', 'Top']].map(([k, l]) => `<button role="tab" data-wmk="${k}">${l}</button>`).join('')}</div><a class="wgx-mk-all" href="#/market" id="wgx-mk-all">Browse all</a></div>
        <div class="wgx-mk" id="wgx-mk"></div>
        <h6 class="wgx-h">↗ Built into TribeCode</h6>
        <div class="wgx-grid">${ORDER.map(k => `<button class="wgx-card t-${LOOK[k].tint}" data-wadd="${k}" data-k="${esc((BUILT[k].label + ' ' + LOOK[k].blurb + ' ' + k).toLowerCase())}" ${have.has(k) ? 'disabled aria-disabled="true"' : ''}>
            <span class="wgx-top"><b>${esc(BUILT[k].label)}</b>${have.has(k) ? '<em>Added</em>' : ''}</span><small>${esc(LOOK[k].blurb)}</small>${mini(k)}</button>`).join('')}</div>
        <h6 class="wgx-h">🧩 Starter packs</h6>
        <div class="wgx-packs">${PACKS.map(p => { const left = p.keys.filter(k => !have.has(k)); return `<button class="wgx-pack" data-wpack="${p.id}" data-k="${esc((p.name + ' ' + p.blurb).toLowerCase())}" ${left.length ? '' : 'disabled'}><span class="wgx-pe">${p.emo}</span><span><b>${esc(p.name)}</b><small>${left.length ? esc(p.blurb) : 'All added'}</small></span></button>`; }).join('')}</div>
        <p class="wgx-none" hidden>Nothing matches. Try “calendar”, “bugs” or add <button class="linkish" data-wcustom>a link</button>.</p>
      </div></div>`;
    document.body.appendChild(scrim);
    const g = scrim.querySelector('#wg-picker'), q = g.querySelector('#wgx-q');
    if (!isPhone()) setTimeout(() => q.focus(), 30);
    document.addEventListener('keydown', galleryKey, true);
    scrim.addEventListener('mousedown', e => { if (e.target === scrim) closeGallery(); });
    g.querySelector('[data-wclose]').onclick = closeGallery;
    q.oninput = () => {
      const t = q.value.trim().toLowerCase(); let n = 0;
      g.querySelectorAll('[data-k]').forEach(el => { const on = !t || el.dataset.k.includes(t); el.hidden = !on; n += on; });
      g.querySelectorAll('.wgx-h').forEach(h => { const box = h.nextElementSibling; h.hidden = ![...box.children].some(c => !c.hidden); });
      g.querySelector('.wgx-none').hidden = n > 0;
    };
    q.onkeydown = e => { if (e.key === 'Enter') { const f = g.querySelector('[data-wadd]:not([hidden]):not([disabled]), [data-wpack]:not([hidden]):not([disabled])'); if (f) f.click(); } };
    g.querySelectorAll('[data-wadd]:not([disabled])').forEach(b => b.onclick = async () => {
      closeGallery();
      if (await save([...(st.widgets || []), { kind: 'builtin', key: b.dataset.wadd }])) toast(`${LOOK[b.dataset.wadd].emo} ${BUILT[b.dataset.wadd].label} added`);
    });
    g.querySelectorAll('[data-wpack]:not([disabled])').forEach(b => b.onclick = async () => {
      const p = PACKS.find(x => x.id === b.dataset.wpack), add = p.keys.filter(k => !have.has(k)).map(k => ({ kind: 'builtin', key: k }));
      closeGallery();
      if (await save([...(st.widgets || []), ...add])) toast(`${p.emo} ${p.name}: ${add.length} added`);
    });
    g.querySelectorAll('[data-wcustom]').forEach(b => b.onclick = () => { const doc = b.hasAttribute('data-doc'); closeGallery(); custom($('#nest-add') || anchor, doc); });
    marketStrip(g);
  }
  // v0.27 company: a few link widgets from the Marketplace (market.js / server/market.js), with quick sorts and a way to all of it
  let mkSort = 'hot';
  async function marketStrip(g) {
    const box = g.querySelector('#wgx-mk'), all = g.querySelector('#wgx-mk-all'); if (!box || !window.TribeMarket) return;
    g.querySelectorAll('[data-wmk]').forEach(b => { b.classList.toggle('on', b.dataset.wmk === mkSort); b.onclick = () => { mkSort = b.dataset.wmk; marketStrip(g); }; });
    all.onclick = e => { e.preventDefault(); closeGallery(); window.TribeMarket.open({ kind: 'widget' }); };
    try {
      const r = await window.TribeMarket.quick(mkSort, 'widget', 6, 'link');
      all.textContent = `Browse all (${r.catalog})`;
      const have = new Set((st.widgets || []).filter(w => w.kind === 'link').map(w => w.url));
      box.innerHTML = r.items.map(it => `<button class="wgx-mk-row" data-wmkid="${esc(it.id)}" data-k="${esc((it.title + ' ' + it.summary + ' ' + (it.tags || []).join(' ')).toLowerCase())}" ${have.has(it.url) ? 'disabled' : ''}><span class="mk-emo" aria-hidden="true">${esc(it.emoji || '🔗')}</span><span><b>${esc(it.title)}</b><small>${esc(it.summary)}</small></span>${have.has(it.url) ? '<em>Added</em>' : ''}</button>`).join('');
      box.querySelectorAll('[data-wmkid]:not([disabled])').forEach(b => b.onclick = async () => { closeGallery(); await window.TribeMarket.use(b.dataset.wmkid); });
    } catch { box.innerHTML = ''; }
  }
  async function custom(anchor, preferDoc) {
    const el = pop(anchor, `<form class="wg-form" id="wg-form" autocomplete="off">
        <h6>${preferDoc ? 'Pin a doc' : 'Add a link'}</h6>
        <div class="wg-two"><input class="input wg-emoji" id="wg-emoji" maxlength="4" placeholder="🔗" aria-label="Emoji"><input class="input" id="wg-name" maxlength="40" placeholder="Name" aria-label="Name" required></div>
        <input class="input" id="wg-url" placeholder="https://…" aria-label="Link" inputmode="url">
        <select class="input" id="wg-doc" aria-label="Or pin a doc"><option value="">…or pin a doc</option></select>
        <div class="wg-acts"><button type="button" class="btn" id="wg-cancel">Cancel</button><button class="btn primary" id="wg-save">Add</button></div></form>`, 'wg-custom');
    const f = el.querySelector('form'), name = el.querySelector('#wg-name'), url = el.querySelector('#wg-url'), doc = el.querySelector('#wg-doc');
    if (!isPhone()) (preferDoc ? doc : name).focus();
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
  C.on('ws', m => { if (m && ['widgets', 'website', 'preview', 'project', 'sense'].includes(m.type) && (!m.project || m.project === pid())) soon(); });
  setTimeout(refresh, 0);
  window.TribeWidgets = { refresh, state: () => ({ ...st, project: forPid }), openPicker };
})();
