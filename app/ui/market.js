// The Marketplace (v0.27 company, rebuilt in feat/market-v2): real, checked things a tribe can add — Claude Code
// skills, MCP servers, open-source libraries / tools / studios, starters, sidebar widgets, asset packs, company and
// legal templates, playbooks and academy tracks. Server: server/market.js (/api/market*), catalog
// templates/marketplace.json (verified by scripts/dev/market-catalog.js --fetch: every item has its real source,
// license, author and last update; README pictures as small WebP thumbnails in market-thumbs/, a drawn tile otherwise).
//
// A full page in the main content area, never a floating window: #/market (TribeMarket.page()), or mounted into any
// container with TribeMarket.mount(el) (the Workshop's Marketplace tab). Item details open as an in-page side panel
// (a full-page view with Back on phones). Every Add says what it did and offers Undo; the Installed tab lists what this
// project has, each with Remove. With no project picked, Add asks calmly ("Pick a project first") with a picker; with
// no tribe at all the setup is saved as a doc in Files on this device (localfiles.js), and Remove takes it back.
// Public: window.TribeMarket = { open(opts), page(opts), mount(el, opts), quick(sort, kind, n, tag), use(id), remove(id), close(), state() }.
(function () {
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const me = () => (C && C.state && C.state().me) || {};
  const reach = () => !!(C && C.connected && C.connected());
  const spectator = () => me().role === 'spectator';

  // ---------- icons: TribeIcons.svg when the shell has it, else this tiny local set with the same names ----------
  const PATHS = {
    all: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    skill: 'M12 3l1.8 4.9L19 9.7l-4.2 3.1L16.2 18 12 15l-4.2 3 1.4-5.2L5 9.7l5.2-1.8z',
    connector: 'M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5',
    library: 'M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.6-1 3 15.5-3.6 1z',
    tool: 'M14.5 6.5a4 4 0 0 0 5 5L13 18l-3 3-4-4 3-3 6.5-6.5zM4 20l3-3',
    studio: 'M5 4v16M12 4v16M19 4v16M3 9h4M10 15h4M17 7h4',
    'site-template': 'M3 5h18v14H3zM3 9h18M8 9v10',
    widget: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7',
    'asset-pack': 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01',
    templates: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
    playbook: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
    academy: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
    installed: 'M4 12.5l5 5L20 6.5',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    back: 'M15 5l-7 7 7 7', x: 'M6 6l12 12M18 6L6 18', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', filter: 'M4 6h16M7 12h10M10 18h4',
  };
  const TI = { search: 'search', x: 'x', installed: 'check', 'asset-pack': 'image', skill: 'star', ext: 'link', templates: 'folder', filter: 'filter', back: 'arrow-left' };   // our names -> app/ui/icons.js names
  function icon(name, sz = 16) {
    try { if (TI[name] && window.TribeIcons && window.TribeIcons.svg) { const s = window.TribeIcons.svg(TI[name], sz); if (s && /<svg/.test(s)) return s; } } catch {}
    return `<svg class="i mk-i" width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] || PATHS.all}"/></svg>`;
  }

  // ---------- kinds ----------
  const KIND_LABEL = { widget: 'Widget', 'company-template': 'Company', playbook: 'Playbook', skill: 'Skill', library: 'Library', tool: 'Tool', studio: 'Studio', 'site-template': 'Starter', connector: 'MCP server', 'asset-pack': 'Assets', legal: 'Legal', academy: 'Academy' };
  const KIND_ICON = { widget: 'widget', 'company-template': 'templates', playbook: 'playbook', skill: 'skill', library: 'library', tool: 'tool', studio: 'studio', 'site-template': 'site-template', connector: 'connector', 'asset-pack': 'asset-pack', legal: 'templates', academy: 'academy' };
  const CATS = [['', 'All', 'all'], ['skill', 'Skills', 'skill'], ['connector', 'MCP servers', 'connector'], ['library', 'Libraries', 'library'], ['tool', 'Tools', 'tool'], ['studio', 'Studios', 'studio'],
    ['site-template', 'Starters', 'site-template'], ['widget', 'Widgets', 'widget'], ['asset-pack', 'Assets', 'asset-pack'], ['company-template,legal', 'Templates', 'templates'], ['playbook', 'Playbooks', 'playbook'], ['academy', 'Academy', 'academy']];
  const SORTS = [['hot', 'Popular'], ['new', 'New'], ['az', 'A–Z']];
  const SEAT_LABEL = { ceo: 'CEO', cto: 'Build', design: 'Design', growth: 'Grow', sales: 'Sales', support: 'Support', ops: 'Run', finance: 'Finance', legal: 'Legal' };
  const FOR_LABEL = { game: 'Games', site: 'Sites', app: 'Apps', business: 'Businesses', any: 'Anything' };
  const TOOLBOX = new Set(['skill', 'library', 'tool', 'studio', 'connector']);
  function whatAddDoes(it, local) {
    if (local) return 'Saves its setup as a doc in your Files on this device. Remove deletes that doc.';
    return ({
      widget: 'Adds it to this project’s sidebar.',
      skill: `Copies the skill folder into the project’s .claude/skills${it.path ? `/${it.path.split('/').pop()}` : ''}, where Claude Code picks it up, and lists it in the Toolbox.`,
      connector: it.mcp ? `Adds the “${it.mcp.name}” MCP server to the project’s .mcp.json (Claude Code reads it) and lists it in the Toolbox.` : 'Lists it in the Toolbox with a link to its setup steps (its README has no ready MCP config).',
      library: 'Lists it in the project’s Toolbox (TOOLBOX.md) with its install line, so agents reach for it.',
      tool: 'Lists it in the project’s Toolbox (TOOLBOX.md), so agents reach for it.',
      studio: 'Lists it in the project’s Toolbox (TOOLBOX.md), so the crew knows it’s the tool for this.',
      playbook: 'Saves the checklist as a doc in Files.',
      legal: 'Drops the template into Files as a doc to fill in. A starting point, not legal advice.',
      academy: 'Saves the track’s lessons as a checklist doc in Files.',
      'company-template': 'Saves the company plan (seats, goals, first tasks) as a doc in Files.',
      'site-template': 'Saves a starter doc in Files with the clone command and credits.',
      'asset-pack': 'Pins it to the project’s inspiration board.',
    })[it.kind] || 'Adds it to the project.';
  }
  const mcpSnippet = it => it.mcp ? JSON.stringify({ mcpServers: { [it.mcp.name]: it.mcp.config } }, null, 2) : '';
  const srcOf = it => it.source || (it.repo ? `https://github.com/${it.repo}` : it.url) || '';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const ago = d => { const t = Date.parse(d); if (!t) return ''; const days = (Date.now() - t) / 864e5; return days < 1 ? 'today' : days < 2 ? 'yesterday' : days < 45 ? `${Math.round(days)} days ago` : days < 540 ? `${Math.round(days / 30)} months ago` : `${(days / 365).toFixed(1).replace(/\.0$/, '')} years ago`; };
  const monogram = t => { const w = String(t || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : (w[0] || '').slice(1, 2))).toUpperCase(); };

  const st = { q: '', sort: 'hot', kind: [], for: [], seat: [], tag: [], tab: 'browse', items: [], total: 0, catalog: 0, note: '', offset: 0, seq: 0, open: null, installedCount: 0, target: null };
  try { const s = localStorage.getItem('tribecode.marketSort'); if (SORTS.some(x => x[0] === s)) st.sort = s; } catch {}
  try { st.target = JSON.parse(sessionStorage.getItem('tribecode.marketTarget') || 'null'); } catch {}
  let root = null;

  // ---------- where an Add goes ----------
  const curProject = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C && C.project && C.project()) || '';
  const pid = () => (st.target && st.target.type === 'tribe' ? st.target.id : '') || curProject();
  const localMode = () => offline || !reach();
  const LKEY = 'tribecode.marketLocal.v1';
  const localInst = () => { try { return JSON.parse(localStorage.getItem(LKEY) || '{}') || {}; } catch { return {}; } };
  const saveLocal = m => { try { localStorage.setItem(LKEY, JSON.stringify(m)); } catch {} };

  // ---------- the saved list: with no tribe answering the Marketplace reads market-catalog.json (never "Failed to fetch") ----------
  const KIND_INFO = { widget: 'Widgets', 'company-template': 'Company templates', playbook: 'Playbooks', skill: 'Skills', library: 'Libraries', tool: 'Tools', studio: 'Studios', 'site-template': 'Starters', connector: 'MCP servers', 'asset-pack': 'Asset packs', legal: 'Legal', academy: 'Academy' };
  const SEATS = ['ceo', 'cto', 'design', 'growth', 'sales', 'support', 'ops', 'finance', 'legal'];
  let saved = null, offline = false;
  const savedList = () => (saved = saved || fetch('market-catalog.json').then(r => (r.ok ? r.json() : { items: [] })).then(d => (d.items || []).map((it, i) => ({ ...it, _i: i }))).catch(() => []));
  async function api(path) {
    if (reach()) { try { const r = await C.api(path); offline = false; return r; } catch {} }
    offline = true; return local(path);
  }
  async function local(path) {
    const [p, query = ''] = String(path).split('?'), sp = new URLSearchParams(query), all = await savedList(), inst = localInst();
    const list = k => String(sp.get(k) || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const f = { q: String(sp.get('q') || '').toLowerCase().trim(), kind: list('kind'), tag: list('tag'), for: list('for'), seat: list('seat') };
    const hay = it => `${it.title} ${it.summary} ${(it.tags || []).join(' ')} ${it.kind} ${it.repo || ''} ${it.author || ''} ${it.seat || ''}`.toLowerCase();
    const match = (it, skip) => (!f.q || f.q.split(/\s+/).every(w => hay(it).includes(w))) && (skip === 'kind' || !f.kind.length || f.kind.includes(it.kind))
      && (skip === 'tag' || !f.tag.length || f.tag.every(t => (it.tags || []).includes(t))) && (skip === 'for' || !f.for.length || (it.for || []).some(x => f.for.includes(x) || x === 'any'))
      && (skip === 'seat' || !f.seat.length || f.seat.includes(it.seat)) && (sp.get('installed') !== '1' || !!inst[it.id]);
    const view = it => ({ ...it, kindLabel: KIND_INFO[it.kind] || it.kind, uses: { week: 0, lastWeek: 0, all: 0 }, installed: !!inst[it.id] });
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
        kind: Object.keys(KIND_INFO).filter(k => out.kind[k]).map(k => ({ id: k, label: KIND_INFO[k], n: out.kind[k] })),
        for: Object.keys(FOR_LABEL).filter(k => out.for[k]).map(k => ({ id: k, label: FOR_LABEL[k], n: out.for[k] })),
        seat: SEATS.filter(k => out.seat[k]).map(k => ({ id: k, label: SEAT_LABEL[k] || k, n: out.seat[k] })),
        tag: Object.entries(out.tag).filter(([t]) => !['link', 'skill', 'open-source', 'mcp', 'claude-code'].includes(t)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([id, n]) => ({ id, n })) };
    }
    const sort = sp.get('sort') || 'hot', age = it => Math.max(0, (Date.now() - Date.parse((it.added || '2026-11-01') + 'T00:00:00Z')) / 864e5);
    const rank = { hot: it => 0.35 * it.score + (it.featured ? 8 : 0), rising: it => (age(it) <= 30 ? it.score * 0.5 * (1 - age(it) / 30) : 0), top: it => it.score };
    const hits = all.filter(it => match(it));
    if (sort === 'new') hits.sort((a, b) => String(b.added).localeCompare(String(a.added)) || b._i - a._i);
    else if (sort === 'az') hits.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    else { const r = rank[sort] || rank.hot; hits.sort((a, b) => r(b) - r(a) || b.score - a.score || a.title.localeCompare(b.title)); }
    const offset = +sp.get('offset') || 0, limit = Math.min(60, +sp.get('limit') || 24);
    return { items: hits.slice(offset, offset + limit).map(view), total: hits.length, offset, limit, sort, catalog: all.length, saved: true, installedCount: Object.keys(inst).length,
      note: sort === 'az' ? 'A to Z' : sort === 'new' ? 'Newest in the catalog' : 'TribeCode’s picks, ranked by its own score. Your tribe’s Popular comes back when your tribe is reachable.' };
  }
  function paintOffline() {
    const box = root && root.querySelector('#mk-offline'); if (!box) return;
    box.hidden = !offline;
    box.innerHTML = offline ? `<span class="mk-off-dot" aria-hidden="true"></span><span><b>Showing the saved list.</b> ${reach() ? 'Your tribe didn’t answer just now, so this is the catalog that came with the app.' : 'No tribe is connected here, so this is the catalog that came with the app.'} Add saves an item’s setup in your Files on this device.</span>${reach() ? '<button class="btn sm" type="button" data-mk-retry>Try again</button>' : ''}` : '';
    const rb = box.querySelector('[data-mk-retry]'); if (rb) rb.onclick = () => load(true);
  }
  const active = () => st.for.length + st.seat.length + st.tag.length;
  function qs(extra = {}) {
    const p = new URLSearchParams();
    if (st.q) p.set('q', st.q);
    for (const k of ['kind', 'for', 'seat', 'tag']) if (st[k].length) p.set(k, st[k].join(','));
    if (pid()) p.set('project', pid());
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  }

  // ---------- frame ----------
  function mount(el, opts = {}) {
    root = el;
    if (opts.kind) { st.kind = String(opts.kind).split(','); st.for = []; st.seat = []; st.tag = []; }
    if (opts.q != null) st.q = String(opts.q);
    if (opts.tab) st.tab = opts.tab;
    st.open = null;
    el.innerHTML = `<div class="mk${opts.page ? ' mk-full' : ''}" id="market">
      <header class="mk-head"><div class="mk-head-t"><span class="mk-eyebrow">Workshop · Marketplace</span><h1>Marketplace</h1>
        <p>Real, open things your crew can add: each with its source, license and author, checked at the source.</p></div></header>
      <div class="mk-offline" id="mk-offline" role="status" hidden></div>
      <div class="mk-main">
        <div class="mk-list">
          <nav class="mk-tabs" role="tablist" aria-label="Marketplace"><button role="tab" data-tab="browse">Browse</button><button role="tab" data-tab="installed">Installed <small id="mk-icount"></small></button></nav>
          <div class="mk-bar">
            <label class="mk-search">${icon('search', 15)}<input id="mk-q" type="search" placeholder="Search skills, MCP servers, libraries…" autocomplete="off" aria-label="Search the Marketplace" value="${esc(st.q)}"></label>
            <button class="mk-filter-btn" id="mk-filters" aria-haspopup="dialog" aria-expanded="false" title="Made for, seat and tags">${icon('filter', 15)}<span class="mk-fl">Filters</span><span class="mk-count" id="mk-fcount" hidden></span></button>
          </div>
          <div class="mk-cats" id="mk-cats" role="tablist" aria-label="Categories">${CATS.map(([k, l, ic]) => `<button class="mk-cat" role="tab" data-cat="${k}">${icon(ic, 14)}<span>${l}</span></button>`).join('')}</div>
          <div class="mk-sortrow"><div class="mk-seg" role="tablist" aria-label="Sort">${SORTS.map(([k, l]) => `<button role="tab" data-sort="${k}">${l}</button>`).join('')}</div><span class="mk-note" id="mk-note"></span></div>
          <div class="mk-chips" id="mk-chips" hidden></div>
          <section class="mk-trend" id="mk-trend" hidden aria-labelledby="mk-trend-t"></section>
          <div class="mk-grid" id="mk-grid" aria-live="polite"></div>
          <div class="mk-more" id="mk-more"></div>
        </div>
        <aside class="mk-side" id="mk-detail" aria-label="Item details" hidden></aside>
      </div>
      <div class="mk-result" id="mk-result" role="status" aria-live="polite" hidden></div>
    </div>`;
    const $ = s => el.querySelector(s);
    let t; $('#mk-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load(true); }, 180); });
    el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { st.sort = b.dataset.sort; try { localStorage.setItem('tribecode.marketSort', st.sort); } catch {} load(true); });
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab; load(true); });
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { st.kind = b.dataset.cat ? b.dataset.cat.split(',') : []; load(true); });
    $('#mk-filters').onclick = e => { e.stopPropagation(); filtersOpen() ? closeFilters() : openFilters(); };
    // thumbnails that fail fall back to the drawn tile (no broken images, ever)
    el.addEventListener('error', e => { const img = e.target; if (img && img.tagName === 'IMG' && img.closest('.mk-thumb')) { img.closest('.mk-thumb').classList.add('noimg'); img.remove(); } }, true);
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-use]'); if (a) { e.stopPropagation(); return use(a.dataset.use, a); }
      const r = e.target.closest('[data-remove]'); if (r) { e.stopPropagation(); return remove(r.dataset.remove, r); }
      if (e.target.closest('a[href]')) return;
      const x = e.target.closest('[data-chip]'); if (x) { const [k, v] = x.dataset.chip.split(':'); st[k] = st[k].filter(y => y !== v); return load(true); }
      if (e.target.closest('[data-clear]')) { st.for = []; st.seat = []; st.tag = []; return load(true); }
      const tf = e.target.closest('[data-tf]'); if (tf) { trend.focus = tf.dataset.tf; return drawTrend(); }
      if (e.target.closest('[data-tall]')) { st.tag = ['trending']; st.kind = []; st.for = []; st.seat = []; return load(true); }
      const c = e.target.closest('.mk-card, .mk-tcard'); if (c && !e.target.closest('.mk-side')) openDetail(c.dataset.id);
    });
    el.addEventListener('keydown', e => { const c = e.target.closest('.mk-card, .mk-tcard'); if (c && (e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); openDetail(c.dataset.id); } });
    load(true);
    loadTrend();
  }

  // ---------- Trending on GitHub (server/trending.js) ----------
  const trend = { items: [], updated: '', focus: 'all' };
  const FOCUS = [['all', 'All'], ['agents', 'Agents'], ['ui', 'UI & design'], ['video', 'Video'], ['threejs', '3D & games'], ['skill', 'Skills']];
  const inFocus = (it, f) => f === 'all' || (it.tags || []).some(t => f === 'ui' ? ['ui', 'design', 'animation', 'css'].includes(t) : f === 'threejs' ? ['threejs', '3d', 'game'].includes(t) : f === 'video' ? ['video', 'audio', 'images'].includes(t) : t === f);
  const fmtStars = n => n == null ? '' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
  async function loadTrend() { try { const r = await api('/market/trending'); trend.items = r.items || []; trend.updated = r.updated || ''; } catch { trend.items = []; } drawTrend(); }
  function drawTrend() {
    const box = root && root.querySelector('#mk-trend'); if (!box) return;
    box.hidden = !trend.items.length || !!(st.q || active() || st.kind.length) || st.tab !== 'browse';
    if (box.hidden) { box.innerHTML = ''; return; }
    const list = trend.items.filter(it => inFocus(it, trend.focus)).sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 10);
    box.innerHTML = `<div class="mk-trend-head"><div><span class="mk-eyebrow">Trending on GitHub · updated ${esc(trend.updated)}</span>
        <h3 id="mk-trend-t">New open source people are talking about</h3></div><button class="btn sm" data-tall>See all ${trend.items.length}</button></div>
      <div class="mk-seg mk-tfocus" role="tablist" aria-label="Trending topic">${FOCUS.map(([k, l]) => `<button role="tab" data-tf="${k}" class="${trend.focus === k ? 'on' : ''}" aria-selected="${trend.focus === k}">${l}</button>`).join('')}</div>
      <div class="mk-trow">${list.map(it => `<article class="mk-tcard" data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(it.title)}">
        <div class="mk-card-top"><span class="mk-kind k-${esc(it.kind)}">${esc(KIND_LABEL[it.kind] || it.kind)}</span>${it.stars != null ? `<span class="mk-stars" title="Stars reported by the trend source">★ ${fmtStars(it.stars)}</span>` : ''}</div>
        <b class="mk-t">${esc(it.title)}</b><p class="mk-s">${esc(it.why || it.summary)}</p>
        <div class="mk-card-foot"><span class="mk-lic">${esc(String(it.license || ''))}</span><span class="mk-sp"></span>${addBtn(it)}</div></article>`).join('') || window.TribeUI.emptyHTML({ cls: 'mk-empty', bare: true, line: 'Nothing trending in this topic today.' })}</div>`;
  }

  function chrome() {
    if (!root) return;
    const cat = st.kind.join(',');
    root.querySelectorAll('[data-sort]').forEach(b => { const on = b.dataset.sort === st.sort; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    root.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    root.querySelectorAll('[data-cat]').forEach(b => { const on = b.dataset.cat === cat; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    const n = active(), cnt = root.querySelector('#mk-fcount'); cnt.hidden = !n; cnt.textContent = n;
    root.querySelector('#mk-filters').classList.toggle('on', !!n);
    const chips = root.querySelector('#mk-chips');
    const list = [...st.for.map(v => ['for', v, FOR_LABEL[v] || v]), ...st.seat.map(v => ['seat', v, `${SEAT_LABEL[v] || v} seat`]), ...st.tag.map(v => ['tag', v, '#' + v])];
    if (st.kind.length && !CATS.some(c => c[0] === cat)) list.unshift(...st.kind.map(v => ['kind', v, KIND_LABEL[v] || v]));
    chips.hidden = !list.length;
    chips.innerHTML = list.map(([k, v, l]) => `<button class="mk-chip on" data-chip="${k}:${esc(v)}" aria-label="Remove ${esc(l)}">${esc(l)}<span aria-hidden="true">×</span></button>`).join('') + (list.length > 1 ? '<button class="mk-clear" data-clear>Clear</button>' : '');
    drawTrend();
  }

  // ---------- data ----------
  async function load(reset) {
    if (!root) return;
    if (reset) { st.offset = 0; st.items = []; }
    chrome();
    const n = ++st.seq, grid = root.querySelector('#mk-grid');
    if (reset && !grid.children.length) grid.innerHTML = '<div class="mk-empty faint">Loading…</div>';
    try {
      const extra = st.tab === 'installed' ? { installed: '1', sort: 'az', offset: st.offset, limit: 60 } : { sort: st.sort, offset: st.offset, limit: 24 };
      const r = await api('/market?' + qs(extra));
      if (n !== st.seq) return;
      paintOffline();
      st.items = reset ? r.items : [...st.items, ...r.items]; st.total = r.total; st.catalog = r.catalog; st.note = r.note; st.installedCount = r.installedCount || 0;
      const swap = () => draw(reset);
      if (reset && window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(swap); else swap();
      if (filtersOpen()) openFilters(true);
    } catch { if (n === st.seq) grid.innerHTML = window.TribeUI.emptyHTML({ cls: 'mk-empty', center: true, title: 'The marketplace is resting', line: 'The saved list didn’t open either. Reload the app to try again.' }); }
  }
  function thumb(it, big) {
    const tile = `<span class="mk-tile" aria-hidden="true"><span class="mk-tile-i">${icon(KIND_ICON[it.kind] || 'all', big ? 18 : 14)}</span><b>${esc(monogram(it.title))}</b></span>`;
    const cls = `mk-thumb k-${esc(it.kind)}${it.thumbWide ? ' wide' : ''}${big ? ' big' : ''}`;
    return it.thumb ? `<div class="${cls}">${tile}<img src="${esc(it.thumb)}" alt="" loading="lazy" decoding="async" width="320" height="180"></div>` : `<div class="${cls} noimg">${tile}</div>`;
  }
  function addBtn(it, big) {
    if (spectator()) return '';
    return it.installed ? `<span class="mk-added">${icon('installed', 13)}Added</span><button class="btn sm${big ? '' : ' ghost'}" data-remove="${esc(it.id)}">Remove</button>`
      : `<button class="btn sm${TOOLBOX.has(it.kind) || it.kind === 'widget' ? ' primary' : ''}" data-use="${esc(it.id)}" title="${esc(whatAddDoes(it, localMode()))}">Add</button>`;
  }
  function card(it) {
    const by = [it.author ? `by ${esc(it.author)}` : '', it.updated ? `updated ${esc(ago(it.updated))}` : '', it.stars != null ? `★ ${fmtStars(it.stars)}` : ''].filter(Boolean).join(' · ');
    const src = srcOf(it);
    return `<article class="mk-card${it.installed ? ' is-in' : ''}" data-id="${esc(it.id)}" tabindex="0" aria-label="${esc(it.title)}">
      ${thumb(it)}
      <div class="mk-cb">
        <div class="mk-card-top"><span class="mk-kind k-${esc(it.kind)}">${esc(KIND_LABEL[it.kind] || it.kind)}</span>${it.license ? `<span class="mk-lic" title="License: ${esc(it.license)}">${esc(String(it.license).replace(/ \(.*\)$/, ''))}</span>` : ''}</div>
        <b class="mk-t">${esc(it.title)}</b>
        <p class="mk-s">${esc(it.summary)}</p>
        ${by ? `<div class="mk-by">${by}</div>` : ''}
        <div class="mk-card-foot">${src ? `<a class="mk-src" href="${esc(src)}" target="_blank" rel="noopener" data-src title="${esc(src)}">${esc(host(src) === 'github.com' ? 'Source' : host(src))} ↗</a>` : ''}<span class="mk-sp"></span>${addBtn(it)}</div>
      </div>
    </article>`;
  }
  function draw(reset) {
    const grid = root.querySelector('#mk-grid');
    root.querySelector('#mk-note').textContent = st.tab === 'installed' ? (localMode() ? 'Saved in Files on this device' : 'In this project') : st.note || '';
    root.querySelector('#mk-icount').textContent = st.installedCount ? String(st.installedCount) : '';
    root.querySelector('.mk-sortrow .mk-seg').hidden = st.tab === 'installed';
    const sb = root.querySelector('#mk-studios'); if (sb) sb.remove();
    if (window.TribeStudios && st.kind.includes('studio') && st.tab === 'browse') grid.insertAdjacentHTML('beforebegin', '<div class="mk-studios" id="mk-studios"><span>Want downloads and what each tool is for in this project?</span><button class="btn sm primary" type="button" data-open-studios>Open Studios</button></div>');
    const ob = root.querySelector('[data-open-studios]'); if (ob) ob.onclick = () => window.TribeStudios.open();
    if (!st.items.length) {
      grid.innerHTML = st.tab === 'installed'
        ? window.TribeUI.emptyHTML({ kind: 'market-installed', cls: 'mk-empty', center: true, icon: icon('installed', 22), title: 'Nothing added yet', line: localMode() ? 'Add something and its setup lands in your Files on this device.' : 'What you add to this project shows up here, each with Remove.', action: { label: 'Browse the Marketplace', attr: 'data-goto-browse' } })
        : window.TribeUI.emptyHTML({ kind: 'no-results', cls: 'mk-empty', center: true, icon: icon('search', 22), title: 'Nothing matches', line: `Try fewer words${st.kind.length || active() ? ', another category or clear a filter' : ''}.`, action: st.kind.length || active() || st.q ? { label: 'Show everything', quiet: true, attr: 'data-reset-all' } : null });
      const gb = grid.querySelector('[data-goto-browse]'); if (gb) gb.onclick = () => { st.tab = 'browse'; load(true); };
      const ra = grid.querySelector('[data-reset-all]'); if (ra) ra.onclick = () => { st.q = ''; root.querySelector('#mk-q').value = ''; st.kind = []; st.for = []; st.seat = []; st.tag = []; load(true); };
    } else if (reset) grid.innerHTML = st.items.map(card).join('');
    else grid.insertAdjacentHTML('beforeend', st.items.slice(grid.querySelectorAll('.mk-card').length).map(card).join(''));
    const more = root.querySelector('#mk-more');
    more.innerHTML = st.items.length ? `<span class="faint">Showing ${st.items.length} of ${st.total}</span>${st.items.length < st.total ? '<button class="btn" id="mk-more-btn">Show more</button>' : ''}` : '';
    const mb = more.querySelector('#mk-more-btn'); if (mb) mb.onclick = () => { st.offset = st.items.length; mb.disabled = true; load(false); };
  }
  function refreshItem(item) {
    if (!item || !root) return;
    const i = st.items.findIndex(x => x.id === item.id); if (i >= 0) st.items[i] = { ...st.items[i], ...item };
    const el = root.querySelector(`.mk-card[data-id="${CSS.escape(item.id)}"]`); if (el) el.outerHTML = card(i >= 0 ? st.items[i] : item);
    if (st.open && st.open.id === item.id) { st.open = { ...st.open, ...item }; drawDetail(); }
    if (st.tab === 'installed') load(true);
    else { st.installedCount = Math.max(0, st.installedCount + (item.installed ? 1 : -1)); root.querySelector('#mk-icount').textContent = st.installedCount ? String(st.installedCount) : ''; }
  }

  // ---------- filters popover (made for, seat, tags; categories are the chips) ----------
  let pop = null, scrim = null;
  const filtersOpen = () => !!pop;
  function closeFilters() { if (pop) pop.remove(); if (scrim) scrim.remove(); pop = scrim = null; const b = root && root.querySelector('#mk-filters'); if (b) b.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); }
  function outside(e) { if (pop && !pop.contains(e.target) && !e.target.closest('#mk-filters')) closeFilters(); }
  async function openFilters(refresh) {
    if (!root) return;
    let f; try { f = await api('/market/facets?' + qs()); } catch { return toast('Filters aren’t available right now.'); }
    if (!pop) {
      if (isPhone()) { scrim = document.createElement('div'); scrim.className = 'mk-scrim'; scrim.onclick = closeFilters; document.body.appendChild(scrim); }
      pop = document.createElement('div'); pop.className = 'mk-pop' + (isPhone() ? ' sheet' : ''); pop.id = 'mk-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Filters');
      (isPhone() ? document.body : root.querySelector('.mk-bar')).appendChild(pop);
      document.addEventListener('mousedown', outside, true);
      root.querySelector('#mk-filters').setAttribute('aria-expanded', 'true');
    } else if (!refresh) return;
    const sec = (key, title, list, label) => list.length ? `<section><h6>${title}</h6><div class="mk-fchips">${list.map(x => `<button class="mk-chip ${st[key].includes(x.id) ? 'on' : ''}" data-f="${key}:${esc(x.id)}">${label(x)}<small>${x.n}</small></button>`).join('')}</div></section>` : '';
    const scroll = pop.querySelector('.mk-pop-b') ? pop.querySelector('.mk-pop-b').scrollTop : 0;
    pop.innerHTML = `${isPhone() ? '<div class="pj-grab"></div>' : ''}<header><b>Filters</b><span class="faint">${f.total} of ${f.catalog}</span></header>
      <div class="mk-pop-b">${sec('kind', 'Kind', f.kind, x => esc(KIND_LABEL[x.id] || x.label))}${sec('for', 'Made for', f.for, x => esc(x.label))}${sec('seat', 'Company seat', f.seat, x => esc(SEAT_LABEL[x.id] || x.label))}${sec('tag', 'Tags', f.tag, x => esc(x.id))}</div>
      <footer><button class="linkish" data-fclear ${active() || st.kind.length ? '' : 'disabled'}>Clear all</button><span class="mk-sp"></span><button class="btn primary sm" data-fdone>Show ${f.total}</button></footer>`;
    pop.querySelector('.mk-pop-b').scrollTop = scroll;
    pop.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.f.split(':'); st[k] = st[k].includes(v) ? st[k].filter(x => x !== v) : [...st[k], v]; load(true); });
    pop.querySelector('[data-fclear]').onclick = () => { st.kind = []; st.for = []; st.seat = []; st.tag = []; load(true); };
    pop.querySelector('[data-fdone]').onclick = closeFilters;
  }

  // ---------- detail: an in-page side panel (a full page with Back on phones) ----------
  function closeDetail() {
    st.open = null;
    const side = root && root.querySelector('#mk-detail'); if (side) { side.hidden = true; side.innerHTML = ''; }
    const m = root && root.querySelector('#market'); if (m) m.classList.remove('detail-open');
  }
  async function openDetail(id) {
    let it = st.items.find(x => x.id === id) || trend.items.find(x => x.id === id);
    try { it = (await api('/market/items/' + encodeURIComponent(id) + (pid() ? `?project=${encodeURIComponent(pid())}` : ''))).item; } catch {}
    if (!it || !root) return;
    st.open = it; st.picker = null;
    drawDetail();
    const side = root.querySelector('#mk-detail');
    if (root.querySelector('#market').clientWidth <= 860) { root.querySelector('#market').scrollIntoView({ block: 'start' }); } else side.scrollTop = 0;
    const h = side.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  function drawDetail() {
    const it = st.open, side = root && root.querySelector('#mk-detail'); if (!it || !side) return;
    root.querySelector('#market').classList.add('detail-open');
    side.hidden = false;
    const u = it.uses || {}, src = srcOf(it), loc = localMode(), narrow = root.querySelector('#market').clientWidth <= 860;
    const second = [];
    if (!loc && it.kind === 'site-template' && (it.tags || []).includes('remix') && it.repo && window.TribeProjects && window.TribeProjects.remix) second.push(['remix', 'Start a new project from it']);
    if (!loc && it.kind === 'company-template') second.push(['company', 'Turn on Company mode with it']);
    if (it.kind === 'academy' && window.TribeAcademy && window.TribeAcademy.open) second.push(['academy', 'Open the Academy']);
    if (it.kind === 'asset-pack' && !it.url && window.TribeAssets) second.push(['assets', 'Open the asset library']);
    const payload = it.kind === 'connector' && it.mcp ? `<pre class="mk-code" aria-label=".mcp.json">${esc(mcpSnippet(it))}</pre>`
      : it.install && TOOLBOX.has(it.kind) ? `<pre class="mk-code">${esc(it.install)}</pre>` : '';
    side.innerHTML = `<div class="mk-dtop"><button class="mk-back" data-dclose aria-label="Back to the list">${icon(narrow ? 'back' : 'x', 16)}<span>${narrow ? 'Back' : ''}</span></button></div>
      ${st.picker ? pickerHtml(it) : ''}
      ${thumb(it, true)}
      <span class="mk-eyebrow">${esc(KIND_LABEL[it.kind] || it.kind)}${it.author ? ` · by ${esc(it.author)}` : ''}</span>
      <h2>${esc(it.title)}</h2>
      <p class="mk-lead">${esc(it.summary)}</p>
      ${it.why ? `<p class="mk-why"><b>Why it’s here</b> ${esc(it.why)}</p>` : ''}
      ${it.steps ? `<ol class="mk-steps">${it.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      <div class="mk-dacts">${addBtn(it, true)}${second.map(([k, l]) => `<button class="btn sm" data-second="${k}">${esc(l)}</button>`).join('')}</div>
      <section class="mk-does"><h6>What Add does</h6><p>${esc(whatAddDoes(it, loc))}</p>${payload}</section>
      <div class="mk-links">${src ? `<a class="btn sm" href="${esc(src)}" target="_blank" rel="noopener" data-visit>Open source ↗</a>` : ''}${it.docs ? `<a class="btn sm" href="${esc(it.docs)}" target="_blank" rel="noopener" data-visit>Docs ↗</a>` : ''}</div>
      <dl class="mk-meta">
        <dt>License</dt><dd>${esc(it.license || '—')}</dd>
        ${it.author ? `<dt>Author</dt><dd>${esc(it.author)}</dd>` : ''}
        ${src ? `<dt>Source</dt><dd><a href="${esc(src)}" target="_blank" rel="noopener" data-visit>${esc(src.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></dd>` : ''}
        ${it.updated ? `<dt>Updated</dt><dd>${esc(it.updated)} <span class="faint">(${esc(ago(it.updated))})</span></dd>` : ''}
        ${it.stars != null ? `<dt>Stars</dt><dd>${fmtStars(it.stars)} <span class="faint">as reported by the trend source</span></dd>` : ''}
        <dt>Made for</dt><dd>${(it.for || []).map(f => esc(FOR_LABEL[f] || f)).join(', ') || '—'}</dd>
        ${it.seat ? `<dt>Seat</dt><dd>${esc(SEAT_LABEL[it.seat] || it.seat)}</dd>` : ''}
        ${!loc ? `<dt>In your tribe</dt><dd>${u.all ? `${u.week} this week · ${u.all} in all` : 'Not used yet'}</dd>` : ''}
        ${it.verified ? `<dt>Checked</dt><dd>${esc(it.verified.replace(' git', ' at the repo').replace(' listed', ', link listed').replace(' bundled', ', ships with TribeCode'))}</dd>` : ''}
      </dl>
      ${(it.seenOn || []).length ? `<div class="mk-seen"><span class="mk-eyebrow">Seen on</span>${it.seenOn.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.url)}">${esc(x.site)}${['Blog', 'News', 'Forum'].includes(x.site) && host(x.url) ? ` · ${esc(host(x.url))}` : ''}</a>`).join('')}</div>` : ''}
      ${(it.tags || []).length ? `<div class="mk-tags">${it.tags.map(t => `<button class="mk-chip" data-dtag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
      ${it.kind === 'legal' ? '<p class="mk-fine">A starting point, not legal advice. Check local law or ask a professional.</p>' : ''}`;
    side.querySelectorAll('[data-dclose]').forEach(b => b.onclick = closeDetail);
    side.querySelectorAll('[data-visit]').forEach(v => v.addEventListener('click', () => { if (!localMode()) C.api(`/market/${encodeURIComponent(it.id)}/use`, { method: 'POST', body: { only: 'open' } }).catch(() => {}); }));
    side.querySelectorAll('[data-dtag]').forEach(b => b.onclick = () => { closeDetail(); if (!st.tag.includes(b.dataset.dtag)) st.tag.push(b.dataset.dtag); load(true); });
    side.querySelectorAll('[data-second]').forEach(b => b.onclick = () => second2(it, b.dataset.second));
    side.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => pick(it, b.dataset.pick));
  }
  async function second2(it, k) {
    if (k === 'remix') { leave(); (window.TribeProjects.gallery || window.TribeProjects.openNew)(); setTimeout(() => window.TribeProjects.remix(it.repo), 60); }
    else if (k === 'company') {
      if (window.TribeCompany && window.TribeCompany.create) { leave(); await window.TribeCompany.create(it.ref || it.id.replace(/^co-/, '')); window.TribeCompany.open && window.TribeCompany.open(); }
      else { try { await C.api(`/projects/${encodeURIComponent(pid())}/company`, { method: 'PUT', body: { on: true, template: it.ref } }); result(`${it.title}: Company mode is on`); } catch { result('Company mode isn’t ready on this tribe yet'); } }
    } else if (k === 'academy') { leave(); window.TribeAcademy.open(it.ref); }
    else if (k === 'assets') window.TribeAssets.open({ kind: it.assetKind || '' });
  }

  // ---------- "Pick a project first": calm, inside the panel ----------
  function pickerHtml(it) {
    const projects = (!localMode() && window.TribeProjects && window.TribeProjects.list ? window.TribeProjects.list() : []) || [];
    const rows = [];
    for (const p of projects.slice(0, 8)) rows.push(`<button class="mk-pick" data-pick="tribe:${esc(p.id)}"><span class="mk-pick-e" aria-hidden="true">${esc(p.emoji || monogram(p.name))}</span><span><b>${esc(p.name || p.id)}</b><small>A project in your tribe</small></span></button>`);
    if (localMode() && window.TribeLocalFiles) rows.push(`<button class="mk-pick" data-pick="local"><span class="mk-pick-e" aria-hidden="true">${icon('templates', 16)}</span><span><b>This device</b><small>Your Files here. The setup is saved as a doc.</small></span></button>`);
    if (window.TribeProjects && window.TribeProjects.openNew) rows.push(`<button class="mk-pick" data-pick="new"><span class="mk-pick-e" aria-hidden="true">+</span><span><b>Start a project</b><small>Then come back and add it</small></span></button>`);
    return `<section class="mk-picker" id="mk-picker" role="group" aria-labelledby="mk-pick-t"><h3 id="mk-pick-t">Pick a project first</h3>
      <p>Where should ${esc(it.title)} go?</p><div class="mk-picks">${rows.join('') || '<span class="faint">Start or join a tribe to add things to a project.</span>'}</div></section>`;
  }
  function pick(it, v) {
    if (v === 'new') { leave(); return window.TribeProjects.openNew(); }
    st.target = v === 'local' ? { type: 'local' } : { type: 'tribe', id: v.slice(6) };
    try { sessionStorage.setItem('tribecode.marketTarget', JSON.stringify(st.target)); } catch {}
    st.picker = null; drawDetail();
    use(it.id);
  }
  async function askPick(id) {
    if (!st.open || st.open.id !== id) await openDetail(id);
    if (!st.open) return;
    st.picker = true; drawDetail();
    const p = root.querySelector('#mk-picker'); if (p) { p.scrollIntoView({ block: 'nearest' }); const b = p.querySelector('[data-pick]'); if (b) b.focus({ preventScroll: true }); }
    return { picker: true };
  }

  // ---------- the result line, with Undo ----------
  let resT = 0;
  function result(msg, undoFn, extra) {
    const box = root && root.querySelector('#mk-result'); if (!box) return toast(msg);
    clearTimeout(resT);
    box.innerHTML = `<span class="mk-res-i" aria-hidden="true">${icon('installed', 15)}</span><span class="mk-res-t">${esc(msg)}</span>${extra ? `<button class="btn sm" data-res-open>${esc(extra[0])}</button>` : ''}${undoFn ? '<button class="btn sm" data-res-undo>Undo</button>' : ''}<button class="mk-res-x" data-res-x aria-label="Dismiss">${icon('x', 14)}</button>`;
    box.hidden = false;
    const u = box.querySelector('[data-res-undo]'); if (u) u.onclick = () => { box.hidden = true; undoFn(); };
    const o = box.querySelector('[data-res-open]'); if (o) o.onclick = () => { box.hidden = true; extra[1](); };
    box.querySelector('[data-res-x]').onclick = () => { box.hidden = true; };
    resT = setTimeout(() => { if (box.isConnected) box.hidden = true; }, 9000);
  }

  // ---------- add / remove ----------
  async function itemOf(id) {
    let it = st.items.find(x => x.id === id) || (st.open && st.open.id === id ? st.open : null) || trend.items.find(x => x.id === id);
    if (!it) { try { it = (await api('/market/items/' + encodeURIComponent(id))).item; } catch {} }
    return it;
  }
  function setupDoc(it) {
    const src = srcOf(it), lines = [`# ${it.title}`, '', it.summary, '', `- Kind: ${KIND_LABEL[it.kind] || it.kind}`, `- License: ${it.license || 'see source'}`, it.author ? `- Author: ${it.author}` : '', src ? `- Source: ${src}` : '', it.docs ? `- Docs: ${it.docs}` : '', ''];
    if (it.kind === 'connector' && it.mcp) lines.push('## Add it to Claude Code', '', 'Put this in your project’s `.mcp.json`:', '', '```json', mcpSnippet(it), '```', '', `Or run: \`claude mcp add-json ${it.mcp.name} '${JSON.stringify(it.mcp.config)}'\``, '');
    else if (it.kind === 'skill' && it.repo) lines.push('## Add it to Claude Code', '', `Copy the folder \`${it.path || ''}\` from ${src} into your project’s \`.claude/skills/\`.`, '');
    else if (it.install) lines.push('## Install', '', '```', it.install, '```', '');
    else if (it.kind === 'site-template' && it.repo) lines.push('## Start from it', '', '```', `git clone --depth 1 https://github.com/${it.repo}`, '```', '');
    if (it.steps) lines.push('## Checklist', '', ...it.steps.map(s => `- [ ] ${s}`), '');
    if (it.kind === 'legal') lines.push('_A starting point, not legal advice._', '');
    lines.push('_From the TribeCode Marketplace._');
    return lines.filter(x => x !== null).join('\n');
  }
  async function use(id, btn) {
    if (spectator()) return toast('Spectators can look, not add');
    const it = await itemOf(id); if (!it) return;
    const loc = localMode();
    if (loc && !(st.target && st.target.type === 'local')) return askPick(id);
    if (!loc && !pid()) return askPick(id);
    if (btn) btn.disabled = true;
    try {
      if (loc) {
        const L = window.TribeLocalFiles; if (!L) return askPick(id);
        const f = await L.create('doc', { title: `${KIND_LABEL[it.kind] || 'Item'}: ${it.title}`, body: setupDoc(it) });
        const m = localInst(); m[it.id] = { file: f.id, at: new Date().toISOString() }; saveLocal(m);
        refreshItem({ ...it, installed: true });
        result(`${it.title}: setup saved in your Files on this device`, () => remove(id), L.open ? ['Open', () => L.open(f.id)] : null);
        return { ok: true, local: true, file: f.id };
      }
      const r = await C.api(`/market/${encodeURIComponent(id)}/use`, { method: 'POST', body: { project: pid() } });
      if (r.pending || r.needs) { result(r.message || 'Waiting'); return r; }
      if (r.client === 'open' && r.url) { window.open(r.url, '_blank', 'noopener'); return r; }
      if (r.done === 'widget' && window.TribeWidgets) window.TribeWidgets.refresh();
      const open = r.done === 'doc' && r.doc && window.TribeShell && window.TribeShell.previewDoc ? ['Open', () => window.TribeShell.previewDoc(r.doc)] : null;
      refreshItem(r.item || { ...it, installed: true });
      result(r.message || `${it.title} added`, r.already ? null : () => remove(id), open);
      return r;
    } catch (e) { result(e.message || 'Couldn’t add it'); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  }
  async function remove(id, btn) {
    const it = await itemOf(id); if (!it) return;
    if (btn) btn.disabled = true;
    try {
      if (localMode()) {
        const m = localInst(), rec = m[id];
        if (rec && window.TribeLocalFiles) { try { await window.TribeLocalFiles.remove(rec.file); } catch {} }
        delete m[id]; saveLocal(m);
        refreshItem({ ...it, installed: false });
        result(`${it.title} removed from this device`, () => use(id));
        return { ok: true };
      }
      const r = await C.api(`/market/${encodeURIComponent(id)}/remove`, { method: 'POST', body: { project: pid() } });
      if (r.item && r.item.kind === 'widget' && window.TribeWidgets) window.TribeWidgets.refresh();
      refreshItem(r.item || { ...it, installed: false });
      result(r.message || `${it.title} removed`, () => use(id));
      return r;
    } catch (e) { result(e.message || 'Couldn’t remove it'); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  }
  function leave() { closeDetail(); closeFilters(); if (window.TribeWorkshop && window.TribeWorkshop.isOpen && window.TribeWorkshop.isOpen()) window.TribeWorkshop.close(); unpage(); }

  // ---------- the full page: #/market in the main content area ----------
  let paged = false;
  function page(opts = {}) {
    const main = document.getElementById('main');
    if (!main) { const w = window.TribeWorkshop; if (w) w.open('market'); return; }
    if (window.TribeWorkshop && window.TribeWorkshop.isOpen && window.TribeWorkshop.isOpen()) window.TribeWorkshop.close();
    let sec = document.getElementById('view-market');
    if (!sec) { sec = document.createElement('section'); sec.id = 'view-market'; sec.className = 'mk-page'; sec.setAttribute('aria-label', 'Marketplace'); main.appendChild(sec); }
    document.body.classList.add('mk-page-on'); sec.hidden = false; paged = true;
    if (location.hash !== '#/market') history.pushState(null, '', location.pathname + location.search + '#/market');
    const crumb = document.getElementById('crumb-label'); if (crumb) crumb.textContent = 'Marketplace';
    try { C.sendActivity && C.sendActivity('Marketplace'); } catch {}
    const go = () => { mount(sec, { ...opts, page: true }); main.scrollTop = 0; };
    if (window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(go); else go();
  }
  function unpage() {
    if (!paged) return; paged = false;
    document.body.classList.remove('mk-page-on');
    const sec = document.getElementById('view-market'); if (sec) { sec.hidden = true; sec.innerHTML = ''; }
    if (root && !root.isConnected) root = null;
    if (location.hash === '#/market') history.replaceState(null, '', location.pathname + location.search);
  }
  // leaving for anything else (a circle, a section, the logo) closes the page, like every other view
  document.addEventListener('click', e => { if (paged && e.target.closest && e.target.closest('#pj-rail, #rail-logo, #pj-plus, [data-nav], [data-pnav]') && !e.target.closest('#view-market')) unpage(); }, true);
  addEventListener('hashchange', () => { if (location.hash === '#/market') page(); else if (paged) unpage(); });
  addEventListener('popstate', () => { if (location.hash !== '#/market' && paged) unpage(); });
  if (location.hash === '#/market') { const go = () => setTimeout(() => { if (!paged) page(); }, 300); if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true }); }
  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (pop) { e.stopPropagation(); closeFilters(); } else if (st.open && root && root.isConnected) { e.stopPropagation(); closeDetail(); } }, true);

  // a few items for other screens (the sidebar's + Add gallery)
  async function quick(sort = 'hot', kind = 'widget', n = 6, tag = '') {
    const p = new URLSearchParams({ sort, kind, limit: String(n) }); if (tag) p.set('tag', tag);
    return api('/market?' + p);
  }
  function open(opts = {}) {
    if (opts.kind) { st.kind = String(opts.kind).split(','); st.for = []; st.seat = []; st.tag = []; st.q = ''; }
    page(opts);
  }
  window.TribeMarket = { open, page, mount, quick, use, remove, close: () => { closeDetail(); closeFilters(); }, unpage, state: () => ({ ...st, paged, offline }) };
})();
