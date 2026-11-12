// The Marketplace (v0.27 company): hundreds of real, checked things a tribe can add — sidebar widgets, company
// templates, role playbooks, Claude Code skills, open-source libraries / tools / studios, starters, MCP connectors,
// asset packs, legal templates and academy tracks. Server: server/market.js (/api/market*), catalog
// templates/marketplace.json.
//
// Lives in the Workshop as its "Marketplace" tab (workshop.js calls TribeMarket.mount(body)), opens with
// #/market or window.TribeMarket.open({ kind }). Calm by design: a search, a Hot · Rising · New · Top switch and ONE
// Filters button (a popover; a bottom sheet on phones). Chips for active filters show only when some are set. Cards
// carry one action each; tap a card for details. "Hot" is honest: it is this tribe's use, never a global chart.
// Public: window.TribeMarket = { open(opts), mount(el), quick(sort, kind, n), use(id) }.
(function () {
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 16) => `<svg class="i" style="width:${sz}px;height:${sz}px"><use href="#${id}"/></svg>`;
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const me = () => (C.state && C.state().me) || {};
  const canUse = () => !offline && me().role && me().role !== 'spectator';
  const pid = () => (window.TribeProjects && window.TribeProjects.current()) || (C.project && C.project()) || '';
  const SORTS = [['hot', 'Hot'], ['rising', 'Rising'], ['new', 'New'], ['top', 'Top']];
  const KIND_LABEL = { widget: 'Widget', 'company-template': 'Company', playbook: 'Playbook', skill: 'Skill', library: 'Library', tool: 'Tool', studio: 'Studio', 'site-template': 'Starter', connector: 'Connector', 'asset-pack': 'Assets', legal: 'Legal', academy: 'Academy' };
  const SEAT_LABEL = { ceo: 'CEO', cto: 'Build', design: 'Design', growth: 'Grow', sales: 'Sales', support: 'Support', ops: 'Run', finance: 'Finance', legal: 'Legal' };
  const FOR_LABEL = { game: 'Games', site: 'Sites', app: 'Apps', business: 'Businesses', any: 'Anything' };
  function actionLabel(it) {
    switch (it.kind) {
      case 'widget': return 'Add';
      case 'skill': case 'library': case 'tool': case 'studio': case 'connector': return 'Add';
      case 'playbook': return 'Use';
      case 'site-template': return (it.tags || []).includes('remix') ? 'Start' : 'Browse';
      case 'company-template': return 'Start';
      case 'academy': return 'Start';
      default: return 'Open';
    }
  }
  const actionHint = it => ({ widget: 'Adds it to this project’s sidebar', skill: 'Copies the skill into the code repository’s .claude/skills', library: 'Adds it to the project’s Toolbox', tool: 'Adds it to the project’s Toolbox', studio: 'Adds it to the project’s Toolbox', connector: 'Adds it to the Toolbox so agents can set it up', playbook: 'Saves the checklist as a doc', 'company-template': 'Starts Company mode with this template', 'site-template': 'Starts a new project from it', academy: 'Opens the track', legal: 'Opens the template (a starting point, not legal advice)', 'asset-pack': 'Opens the asset library' }[it.kind] || '');

  const st = { q: '', sort: 'hot', kind: [], for: [], seat: [], tag: [], items: [], total: 0, catalog: 0, note: '', offset: 0, seq: 0 };
  try { st.sort = localStorage.getItem('tribecode.marketSort') || 'hot'; } catch {}
  let host = null;

  // ---------- the saved list (feat/files-dash): with no tribe answering (offline, no tribe yet, the host asleep) the
  // Marketplace reads the catalog saved with the app (market-catalog.json, scripts/dev/market-catalog.js) and says so
  // calmly. Never "Failed to fetch".
  const KIND_INFO = { widget: ['Widgets', '🧩'], 'company-template': ['Company templates', '🏢'], playbook: ['Playbooks', '📋'], skill: ['Skills', '🧠'], library: ['Libraries', '📚'], tool: ['Tools', '🛠️'], studio: ['Studios', '🎛️'], 'site-template': ['Starters', '🌐'], connector: ['Connectors', '🔌'], 'asset-pack': ['Asset packs', '🎨'], legal: ['Legal', '⚖️'], academy: ['Academy', '🎓'] };
  const SEATS = ['ceo', 'cto', 'design', 'growth', 'sales', 'support', 'ops', 'finance', 'legal'];
  let saved = null, offline = false;
  const savedList = () => (saved = saved || fetch('market-catalog.json').then(r => (r.ok ? r.json() : { items: [] })).then(d => (d.items || []).map((it, i) => ({ ...it, _i: i }))).catch(() => []));
  const reach = () => !!(C && C.connected && C.connected());
  async function api(path) {
    if (reach()) { try { const r = await C.api(path); offline = false; return r; } catch {} }
    offline = true; return local(path);
  }
  async function local(path) {
    const [p, query = ''] = String(path).split('?'), sp = new URLSearchParams(query), all = await savedList();
    const list = k => String(sp.get(k) || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const f = { q: String(sp.get('q') || '').toLowerCase().trim(), kind: list('kind'), tag: list('tag'), for: list('for'), seat: list('seat') };
    const hay = it => `${it.title} ${it.summary} ${(it.tags || []).join(' ')} ${it.kind} ${it.repo || ''} ${it.seat || ''}`.toLowerCase();
    const match = (it, skip) => (!f.q || f.q.split(/\s+/).every(w => hay(it).includes(w))) && (skip === 'kind' || !f.kind.length || f.kind.includes(it.kind))
      && (skip === 'tag' || !f.tag.length || f.tag.every(t => (it.tags || []).includes(t))) && (skip === 'for' || !f.for.length || (it.for || []).some(x => f.for.includes(x) || x === 'any'))
      && (skip === 'seat' || !f.seat.length || f.seat.includes(it.seat));
    const view = it => ({ ...it, kindLabel: (KIND_INFO[it.kind] || [it.kind])[0], uses: { week: 0, lastWeek: 0, all: 0 } });
    if (p === '/market/trending') return { items: [], updated: '' };
    if (p.startsWith('/market/items/')) { const it = all.find(x => x.id === decodeURIComponent(p.slice(14))); if (!it) throw new Error('That item is not in the saved list.'); return { item: view(it) }; }
    if (p === '/market/facets') {
      const out = { kind: {}, for: {}, seat: {}, tag: {} };
      for (const it of all) {
        if (match(it, 'kind')) out.kind[it.kind] = (out.kind[it.kind] || 0) + 1;
        if (match(it, 'for')) for (const x of it.for || []) out.for[x] = (out.for[x] || 0) + 1;
        if (match(it, 'seat') && it.seat) out.seat[it.seat] = (out.seat[it.seat] || 0) + 1;
        if (match(it, 'tag')) for (const t of it.tags || []) out.tag[t] = (out.tag[t] || 0) + 1;
      }
      return { total: all.filter(it => match(it)).length, catalog: all.length,
        kind: Object.keys(KIND_INFO).filter(k => out.kind[k]).map(k => ({ id: k, label: KIND_INFO[k][0], emoji: KIND_INFO[k][1], n: out.kind[k] })),
        for: Object.keys(FOR_LABEL).filter(k => out.for[k]).map(k => ({ id: k, label: FOR_LABEL[k], n: out.for[k] })),
        seat: SEATS.filter(k => out.seat[k]).map(k => ({ id: k, label: SEAT_LABEL[k] || k, n: out.seat[k] })),
        tag: Object.entries(out.tag).filter(([t]) => !['link', 'skill', 'open-source', 'mcp', 'claude-code'].includes(t)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([id, n]) => ({ id, n })) };
    }
    const sort = sp.get('sort') || 'hot', age = it => Math.max(0, (Date.now() - Date.parse((it.added || '2026-11-01') + 'T00:00:00Z')) / 86400000);
    const rank = { hot: it => 0.35 * it.score + (it.featured ? 8 : 0), rising: it => (age(it) <= 30 ? it.score * 0.5 * (1 - age(it) / 30) : 0), top: it => it.score };
    const hits = all.filter(it => match(it));
    if (sort === 'new') hits.sort((a, b) => String(b.added).localeCompare(String(a.added)) || b._i - a._i);
    else { const r = rank[sort] || rank.hot; hits.sort((a, b) => r(b) - r(a) || b.score - a.score || a.title.localeCompare(b.title)); }
    const offset = +sp.get('offset') || 0, limit = Math.min(60, +sp.get('limit') || 24);
    return { items: hits.slice(offset, offset + limit).map(view), total: hits.length, offset, limit, sort, catalog: all.length, saved: true,
      note: 'Showing the saved list: TribeCode’s picks, ranked by its own score. Your tribe’s Hot and Rising come back when your tribe is reachable.' };
  }
  function paintOffline() {
    const box = host && host.querySelector('#mk-offline'); if (!box) return;
    box.hidden = !offline;
    box.innerHTML = offline ? `<span class="mk-off-dot" aria-hidden="true"></span><span><b>Showing the saved list.</b> ${reach() ? 'Your tribe didn’t answer just now, so this is the catalog that came with the app.' : 'No tribe is connected here, so this is the catalog that came with the app.'} Open any item to read about it; adding things to a project needs a tribe.</span>${reach() ? '<button class="btn sm" type="button" data-mk-retry>Try again</button>' : ''}` : '';
    const rb = box.querySelector('[data-mk-retry]'); if (rb) rb.onclick = () => load(true);
  }
  const active = () => st.kind.length + st.for.length + st.seat.length + st.tag.length;
  function qs(extra = {}) {
    const p = new URLSearchParams();
    if (st.q) p.set('q', st.q);
    for (const k of ['kind', 'for', 'seat', 'tag']) if (st[k].length) p.set(k, st[k].join(','));
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  }

  // ---------- frame ----------
  function mount(el, opts = {}) {
    host = el;
    if (opts.kind) { st.kind = [opts.kind]; st.for = []; st.seat = []; st.tag = []; }
    if (opts.q != null) st.q = String(opts.q);
    el.innerHTML = `<div class="mk" id="market">
      <div class="mk-hero" id="mk-hero"><div><span class="mk-eyebrow">Curated · every link and license checked</span><h2>Add tools, skills and templates</h2>
        <p>Real, open things your crew can use. <b>Hot</b> and <b>Rising</b> come from what your tribe uses, not a global chart.</p></div></div>
      <div class="mk-offline" id="mk-offline" role="status" hidden></div>
      <section class="mk-trend" id="mk-trend" hidden aria-labelledby="mk-trend-t"></section>
      <div class="mk-bar">
        <label class="mk-search">${ico('i-search', 15)}<input id="mk-q" type="search" placeholder="Search the marketplace" autocomplete="off" aria-label="Search the marketplace" value="${esc(st.q)}"></label>
        <button class="mk-filter-btn" id="mk-filters" aria-haspopup="dialog" aria-expanded="false">${ico('i-list', 15)}<span>Filters</span><b class="mk-count" id="mk-fcount" hidden></b></button>
      </div>
      <div class="mk-sortrow">
        <div class="mk-seg" role="tablist" aria-label="Sort">${SORTS.map(([k, l]) => `<button role="tab" data-sort="${k}">${l}</button>`).join('')}</div>
        <span class="mk-note" id="mk-note"></span>
      </div>
      <div class="mk-chips" id="mk-chips" hidden></div>
      <div class="mk-grid" id="mk-grid" aria-live="polite"></div>
      <div class="mk-more" id="mk-more"></div>
    </div>`;
    let t; el.querySelector('#mk-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load(true); }, 180); });
    el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { st.sort = b.dataset.sort; try { localStorage.setItem('tribecode.marketSort', st.sort); } catch {} load(true); });
    el.querySelector('#mk-filters').onclick = e => { e.stopPropagation(); filtersOpen() ? closeFilters() : openFilters(); };
    el.querySelector('#mk-grid').addEventListener('click', e => {
      const u = e.target.closest('[data-use]'); if (u) { e.stopPropagation(); return use(u.dataset.use, u); }
      const c = e.target.closest('.mk-card'); if (c) openDetail(c.dataset.id);
    });
    el.querySelector('#mk-grid').addEventListener('keydown', e => { const c = e.target.closest('.mk-card'); if (c && (e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); openDetail(c.dataset.id); } });
    el.querySelector('#mk-chips').addEventListener('click', e => {
      const x = e.target.closest('[data-chip]'); if (x) { const [k, v] = x.dataset.chip.split(':'); st[k] = st[k].filter(y => y !== v); load(true); }
      if (e.target.closest('[data-clear]')) { st.kind = []; st.for = []; st.seat = []; st.tag = []; load(true); }
    });
    el.querySelector('#mk-trend').addEventListener('click', e => {
      const f = e.target.closest('[data-tf]'); if (f) { trend.focus = f.dataset.tf; return drawTrend(); }
      if (e.target.closest('[data-tall]')) { st.tag = ['trending']; st.kind = []; st.for = []; st.seat = []; return load(true); }
      const u = e.target.closest('[data-use]'); if (u) { e.stopPropagation(); return use(u.dataset.use, u); }
      const c = e.target.closest('.mk-tcard'); if (c) openDetail(c.dataset.id);
    });
    load(true);
    loadTrend();
  }

  // ---------- Trending on GitHub (server/trending.js: a daily feed of viral, permissively licensed repos) ----------
  const trend = { items: [], updated: '', focus: 'all' };
  const FOCUS = [['all', 'All'], ['agents', 'Agents'], ['ui', 'UI & design'], ['video', 'Video'], ['threejs', '3D & games'], ['skill', 'Skills']];
  const inFocus = (it, f) => f === 'all' || (it.tags || []).some(t => f === 'ui' ? ['ui', 'design', 'animation', 'css'].includes(t) : f === 'threejs' ? ['threejs', '3d', 'game'].includes(t) : f === 'video' ? ['video', 'audio', 'images'].includes(t) : t === f);
  const fmtStars = n => n == null ? '' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
  async function loadTrend() {
    try { const r = await api('/market/trending'); trend.items = r.items || []; trend.updated = r.updated || ''; } catch { trend.items = []; }
    drawTrend();
  }
  function drawTrend() {
    const box = host && host.querySelector('#mk-trend'); if (!box) return;
    box.hidden = !trend.items.length || !!(st.q || active());
    if (box.hidden) { box.innerHTML = ''; return; }
    const list = trend.items.filter(it => inFocus(it, trend.focus)).sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 10);
    box.innerHTML = `<div class="mk-trend-head"><div><span class="mk-eyebrow">Trending on GitHub · updated ${esc(trend.updated)}</span>
        <h3 id="mk-trend-t">New open source people are talking about</h3></div>
        <button class="btn sm" data-tall>See all ${trend.items.length}</button></div>
      <div class="mk-seg mk-tfocus" role="tablist" aria-label="Trending topic">${FOCUS.map(([k, l]) => `<button role="tab" data-tf="${k}" class="${trend.focus === k ? 'on' : ''}" aria-selected="${trend.focus === k}">${l}</button>`).join('')}</div>
      <div class="mk-trow">${list.map(it => `<article class="mk-tcard" data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(it.title)}">
        <div class="mk-card-top"><span class="mk-emo" aria-hidden="true">${esc(it.emoji || '✨')}</span><span class="mk-kind k-${esc(it.kind)}">${esc(KIND_LABEL[it.kind] || it.kind)}</span>${it.stars != null ? `<span class="mk-stars" title="Stars reported by the trend source">★ ${fmtStars(it.stars)}</span>` : ''}</div>
        <b class="mk-t">${esc(it.title)}</b><p class="mk-s">${esc(it.why || it.summary)}</p>
        <div class="mk-card-foot"><span class="mk-lic">${esc(String(it.license || ''))}</span><span class="mk-sp"></span>${canUse() ? `<button class="btn sm" data-use="${esc(it.id)}" title="${esc(actionHint(it))}">${actionLabel(it)}</button>` : ''}</div>
      </article>`).join('') || '<div class="mk-empty faint">Nothing trending in this topic today.</div>'}</div>`;
  }
  function chrome() {
    if (!host) return;
    host.querySelectorAll('[data-sort]').forEach(b => { const on = b.dataset.sort === st.sort; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    const n = active(), cnt = host.querySelector('#mk-fcount'); cnt.hidden = !n; cnt.textContent = n;
    host.querySelector('#mk-filters').classList.toggle('on', !!n);
    const chips = host.querySelector('#mk-chips');
    const list = [...st.kind.map(v => ['kind', v, KIND_LABEL[v] || v]), ...st.for.map(v => ['for', v, FOR_LABEL[v] || v]), ...st.seat.map(v => ['seat', v, `${SEAT_LABEL[v] || v} seat`]), ...st.tag.map(v => ['tag', v, '#' + v])];
    chips.hidden = !list.length;
    chips.innerHTML = list.map(([k, v, l]) => `<button class="mk-chip on" data-title data-chip="${k}:${esc(v)}" aria-label="Remove ${esc(l)}">${esc(l)}<span aria-hidden="true">×</span></button>`).join('') + (list.length > 1 ? '<button class="mk-clear" data-clear>Clear</button>' : '');
    host.querySelector('#mk-hero').hidden = !!(st.q || n);
    drawTrend();
  }

  // ---------- data ----------
  async function load(reset) {
    if (!host) return;
    if (reset) { st.offset = 0; st.items = []; }
    chrome();
    const n = ++st.seq, grid = host.querySelector('#mk-grid');
    if (reset) grid.innerHTML = '<div class="mk-empty faint">Loading…</div>';
    try {
      const r = await api('/market?' + qs({ sort: st.sort, offset: st.offset, limit: 24 }));
      if (n !== st.seq) return;
      paintOffline();
      st.items = reset ? r.items : [...st.items, ...r.items]; st.total = r.total; st.catalog = r.catalog; st.note = r.note;
      draw(reset);
      if (filtersOpen()) openFilters(true);
    } catch { if (n === st.seq) grid.innerHTML = '<div class="mk-empty"><b>The marketplace is resting</b><span>The saved list didn’t open either. Reload the app to try again.</span></div>'; }
  }
  function card(it) {
    const use = it.uses && it.uses.week ? `<span class="mk-use" title="Uses in your tribe this week">${it.uses.week} this week</span>` : '';
    return `<article class="mk-card" data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(it.title)}">
      <div class="mk-card-top"><span class="mk-emo" aria-hidden="true">${esc(it.emoji || '✨')}</span><span class="mk-kind k-${esc(it.kind)}">${esc(KIND_LABEL[it.kind] || it.kind)}</span>${it.license ? `<span class="mk-lic" title="License">${esc(String(it.license).replace(/ \(.*\)$/, ''))}</span>` : ''}</div>
      <b class="mk-t">${esc(it.title)}</b>
      <p class="mk-s">${esc(it.summary)}</p>
      <div class="mk-card-foot">${use}<span class="mk-sp"></span>${canUse() ? `<button class="btn sm ${it.kind === 'widget' || it.kind === 'skill' ? 'primary' : ''}" data-use="${esc(it.id)}" title="${esc(actionHint(it))}">${actionLabel(it)}</button>` : ''}</div>
    </article>`;
  }
  function draw(reset) {
    const grid = host.querySelector('#mk-grid');
    host.querySelector('#mk-note').textContent = st.note || '';
    // v0.27 Studios: with the Studio filter on, point to the Studios view (downloads, what each tool is for)
    const sb = host.querySelector('#mk-studios'); if (sb) sb.remove();
    if (window.TribeStudios && st.kind.includes('studio')) grid.insertAdjacentHTML('beforebegin', '<div class="mk-studios" id="mk-studios"><span>Want downloads and what each tool is for in this project?</span><button class="btn sm primary" type="button" data-open-studios>Open Studios</button></div>');
    const ob = host.querySelector('[data-open-studios]'); if (ob) ob.onclick = () => window.TribeStudios.open();
    if (!st.items.length) {
      grid.innerHTML = `<div class="mk-empty"><b>Nothing matches</b><span>Try fewer words${active() ? ' or clear a filter' : ''}.</span></div>`;
    } else if (reset) grid.innerHTML = st.items.map(card).join('');
    else grid.insertAdjacentHTML('beforeend', st.items.slice(grid.querySelectorAll('.mk-card').length).map(card).join(''));
    const more = host.querySelector('#mk-more');
    more.innerHTML = st.items.length ? `<span class="faint">Showing ${st.items.length} of ${st.total}</span>${st.items.length < st.total ? '<button class="btn" id="mk-more-btn">Show more</button>' : ''}` : '';
    const mb = more.querySelector('#mk-more-btn'); if (mb) mb.onclick = () => { st.offset = st.items.length; mb.disabled = true; load(false); };
  }

  // ---------- filters popover (a bottom sheet on phones) ----------
  let pop = null, scrim = null;
  const filtersOpen = () => !!pop;
  function closeFilters() { if (pop) pop.remove(); if (scrim) scrim.remove(); pop = scrim = null; const b = host && host.querySelector('#mk-filters'); if (b) b.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); }
  function outside(e) { if (pop && !pop.contains(e.target) && !e.target.closest('#mk-filters')) closeFilters(); }
  async function openFilters(refresh) {
    if (!host) return;
    let f; try { f = await api('/market/facets?' + qs()); } catch { return toast('Filters aren’t available right now.'); }
    const first = !pop;
    if (first) {
      if (isPhone()) { scrim = document.createElement('div'); scrim.className = 'mk-scrim'; scrim.onclick = closeFilters; document.body.appendChild(scrim); }
      pop = document.createElement('div'); pop.className = 'mk-pop' + (isPhone() ? ' sheet' : ''); pop.id = 'mk-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Filters');
      (isPhone() ? document.body : host.querySelector('.mk-bar')).appendChild(pop);
      document.addEventListener('mousedown', outside, true);
      host.querySelector('#mk-filters').setAttribute('aria-expanded', 'true');
    } else if (!refresh) return;
    const sec = (key, title, list, label) => list.length ? `<section><h6>${title}</h6><div class="mk-fchips">${list.map(x => `<button class="mk-chip ${st[key].includes(x.id) ? 'on' : ''}" data-f="${key}:${esc(x.id)}" data-title>${label(x)}<small>${x.n}</small></button>`).join('')}</div></section>` : '';
    const scroll = pop.querySelector('.mk-pop-b') ? pop.querySelector('.mk-pop-b').scrollTop : 0;
    pop.innerHTML = `${isPhone() ? '<div class="pj-grab"></div>' : ''}<header><b>Filters</b><span class="faint">${f.total} of ${f.catalog}</span></header>
      <div class="mk-pop-b">${sec('kind', 'Kind', f.kind, x => `${x.emoji} ${esc(x.label)}`)}${sec('for', 'Made for', f.for, x => esc(x.label))}${sec('seat', 'Company seat', f.seat, x => esc(SEAT_LABEL[x.id] || x.label))}${sec('tag', 'Tags', f.tag, x => esc(x.id))}</div>
      <footer><button class="linkish" data-fclear ${active() ? '' : 'disabled'}>Clear all</button><span class="mk-sp"></span><button class="btn primary sm" data-fdone>Show ${f.total}</button></footer>`;
    pop.querySelector('.mk-pop-b').scrollTop = scroll;
    pop.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.f.split(':'); st[k] = st[k].includes(v) ? st[k].filter(x => x !== v) : [...st[k], v]; load(true); });
    pop.querySelector('[data-fclear]').onclick = () => { st.kind = []; st.for = []; st.seat = []; st.tag = []; load(true); };
    pop.querySelector('[data-fdone]').onclick = closeFilters;
  }

  // ---------- detail sheet ----------
  let sheet = null;
  function closeDetail() { if (sheet) { sheet.remove(); sheet = null; } }
  async function openDetail(id) {
    let it = st.items.find(x => x.id === id);
    try { it = (await api('/market/items/' + encodeURIComponent(id))).item; } catch {}
    if (!it) return;
    closeDetail();
    const link = it.repo ? `https://github.com/${it.repo}` : it.url;
    const u = it.uses || {};
    sheet = document.createElement('div'); sheet.className = 'mk-detail-wrap'; sheet.id = 'mk-detail';
    sheet.innerHTML = `<div class="mk-scrim" data-dclose></div><aside class="mk-detail ${isPhone() ? 'sheet' : ''}" role="dialog" aria-label="${esc(it.title)}">
      ${isPhone() ? '<div class="pj-grab"></div>' : ''}<button class="mk-x" data-dclose aria-label="Close">${ico('i-x', 16)}</button>
      <span class="mk-eyebrow">${esc(it.emoji || '')} ${esc(KIND_LABEL[it.kind] || it.kind)}</span>
      <h2>${esc(it.title)}</h2>
      <p class="mk-lead">${esc(it.summary)}</p>
      ${it.steps ? `<ol class="mk-steps">${it.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      <dl class="mk-meta">
        ${it.license ? `<dt>License</dt><dd>${esc(it.license)}</dd>` : ''}
        <dt>Made for</dt><dd>${(it.for || []).map(f => esc(FOR_LABEL[f] || f)).join(', ')}</dd>
        ${it.seat ? `<dt>Seat</dt><dd data-title>${esc(SEAT_LABEL[it.seat] || it.seat)}</dd>` : ''}
        <dt>In your tribe</dt><dd>${u.all ? `${u.week} this week · ${u.all} in all` : 'Not used yet'}</dd>
        <dt>Added</dt><dd>${esc(it.added || '')}</dd>
        ${it.stars != null ? `<dt>Stars</dt><dd>${fmtStars(it.stars)} <span class="faint">as reported by the trend source</span></dd>` : ''}
        ${link ? `<dt>Source</dt><dd><a href="${esc(link)}" target="_blank" rel="noopener" data-visit>${esc(link.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></dd>` : ''}
      </dl>
      ${it.why ? `<p class="mk-why"><b>Why it’s here</b> ${esc(it.why)}</p>` : ''}
      ${(it.seenOn || []).length ? `<div class="mk-seen"><span class="mk-eyebrow">Seen on</span>${it.seenOn.map(x => { let h = ''; try { h = new URL(x.url).hostname.replace(/^www\./, ''); } catch {} return `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.url)}">${esc(x.site)}${['Blog', 'News', 'Forum'].includes(x.site) && h ? ` · ${esc(h)}` : ''}</a>`; }).join('')}</div>` : ''}
      ${(it.tags || []).length ? `<div class="mk-tags">${it.tags.map(t => `<button class="mk-chip" data-dtag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
      ${it.kind === 'legal' ? '<p class="mk-fine">A starting point, not legal advice. Check local law or ask a professional.</p>' : ''}
      <div class="mk-dacts">${canUse() ? `<button class="btn primary" data-duse>${actionLabel(it)}</button>` : ''}<span class="faint">${esc(actionHint(it))}</span></div>
    </aside>`;
    document.body.appendChild(sheet);
    sheet.querySelectorAll('[data-dclose]').forEach(b => b.onclick = closeDetail);
    const du = sheet.querySelector('[data-duse]'); if (du) du.onclick = () => use(it.id, du);
    const v = sheet.querySelector('[data-visit]'); if (v) v.addEventListener('click', () => { C.api(`/market/${encodeURIComponent(it.id)}/use`, { method: 'POST', body: { only: 'open' } }).catch(() => {}); });
    sheet.querySelectorAll('[data-dtag]').forEach(b => b.onclick = () => { closeDetail(); if (!st.tag.includes(b.dataset.dtag)) st.tag.push(b.dataset.dtag); load(true); });
  }
  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (sheet) { e.stopPropagation(); closeDetail(); } else if (pop) { e.stopPropagation(); closeFilters(); } }, true);

  // ---------- using an item ----------
  async function use(id, btn) {
    if (offline || !reach()) return toast('Adding things needs a tribe. Start a project or join one, then come back.');
    if (!canUse()) return toast('Spectators can look, not add');
    if (btn) btn.disabled = true;
    try {
      const r = await C.api(`/market/${encodeURIComponent(id)}/use`, { method: 'POST', body: { project: pid() } });
      const it = r.item || st.items.find(x => x.id === id) || {};
      if (r.pending) toast(r.message);
      else if (r.needs) toast(r.message || 'Not available yet');
      else if (r.done === 'widget') { toast(r.message); window.TribeWidgets && window.TribeWidgets.refresh(); }
      else if (r.done === 'toolbox') toast(r.message);
      else if (r.done === 'doc') { toast(r.message); if (r.doc && window.TribeShell && window.TribeShell.previewDoc) window.TribeShell.previewDoc(r.doc); }
      else if (r.client === 'open' && r.url) window.open(r.url, '_blank', 'noopener');
      else if (r.client === 'assets') { if (window.TribeAssets) window.TribeAssets.open({ kind: r.kind }); }
      else if (r.client === 'remix') {
        if (r.remix && r.repo && window.TribeProjects && window.TribeProjects.remix) { leave(); window.TribeProjects.openNew(); setTimeout(() => window.TribeProjects.remix(r.repo), 60); }
        else if (r.url) window.open(r.url, '_blank', 'noopener');
      } else if (r.client === 'company') {
        if (window.TribeCompany && window.TribeCompany.create) { leave(); await window.TribeCompany.create(r.template); window.TribeCompany.open(); }   // v0.27: company.js
        else { try { await C.api(`/projects/${encodeURIComponent(pid())}/company`, { method: 'PUT', body: { on: true, template: r.template } }); toast(`${it.title}: Company mode is on`); } catch { toast('Company mode isn’t ready on this tribe yet'); } }
      } else if (r.client === 'legal') { if (window.TribeLegal && window.TribeLegal.open) { leave(); window.TribeLegal.open(r.ref); } else toast('Legal templates come with Company mode'); }
      else if (r.client === 'academy') { if (window.TribeAcademy && window.TribeAcademy.open) { leave(); window.TribeAcademy.open(r.ref); } else toast('The academy comes with Company mode'); }
      // refresh the counts on screen (usage moves Hot)
      const i = st.items.findIndex(x => x.id === id); if (i >= 0 && r.item) { st.items[i] = r.item; const el = host && host.querySelector(`.mk-card[data-id="${CSS.escape(id)}"]`); if (el) el.outerHTML = card(r.item); }
      return r;
    } catch (e) { toast(e.message); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  }
  function leave() { closeDetail(); closeFilters(); if (window.TribeWorkshop && window.TribeWorkshop.close) window.TribeWorkshop.close(); }

  // a few items for other screens (the sidebar's + Add gallery)
  async function quick(sort = 'hot', kind = 'widget', n = 6, tag = '') {
    const p = new URLSearchParams({ sort, kind, limit: String(n) }); if (tag) p.set('tag', tag);
    return api('/market?' + p);
  }
  function open(opts = {}) {
    if (opts.kind) { st.kind = [opts.kind]; st.for = []; st.seat = []; st.tag = []; st.q = ''; }
    if (window.TribeWorkshop) window.TribeWorkshop.open('market');
  }
  addEventListener('hashchange', () => { if (location.hash === '#/market') open(); });
  if (location.hash === '#/market') addEventListener('load', () => open(), { once: true });
  window.TribeMarket = { open, mount, quick, use, close: () => { closeDetail(); closeFilters(); }, state: () => ({ ...st }) };
})();
