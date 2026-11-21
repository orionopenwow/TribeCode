// Website: Files › Website (#/docs/website). feat/website-one: the website designer is the one website tool, so this page
// shows the designer's site and nothing else to make one with.
//   A designer site:   a preview of it, Open the designer, Put it online (the Publish sheet) or its link with Copy.
//   No site:           one button, Make a website, which opens the designer's start screen (what kind of site first).
//   An older site:     a site made with the old page builder (before v0.31) stays as it was. It shows read-only with one
//                      button, Bring it into the designer (siteimport.js reads its page into designer sections; the old
//                      files are not touched or deleted).
//   A site in code:    says where it is, with Open the code, and Make a website.
// Server: server/sitedesign.js (/api/projects/:id/site-config), server/showcase.js (/api/projects/:id/website, read only here).
//   window.TribeWebsite = { open(), load(), overviewLink(project), bring() }
(function () {
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) : s);
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const NAME = 'website';
  const pid = () => (window.TribeProjects && window.TribeProjects.current()) || (C.project && C.project()) || '';
  const enc = p => encodeURIComponent(p);
  const D = () => window.TribeSiteDesigner;
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!Number.isFinite(s)) return ''; if (s < 60) return T('just now'); if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const abs = u => (u && u.startsWith('/') && C.base ? C.base() + u : u);
  const projName = () => { try { const p = ((C.state && C.state().projects) || []).find(x => x.id === pid()); return (p && p.name) || 'My site'; } catch { return 'My site'; } };

  let open = false, seq = 0, cur = null;   // cur: what is drawn { pid, state, cfg, old, link }
  function section() {
    let s = document.getElementById('view-' + NAME);
    if (!s) { const main = $('#main') || $('.main'); if (!main) return null; s = document.createElement('section'); s.id = 'view-' + NAME; s.className = 'hidden'; s.setAttribute('aria-label', 'Website'); main.appendChild(s); }
    return s;
  }

  // ---------- view mounting (beside app.js views, like agentshub.js) ----------
  function show() {
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    document.querySelectorAll('[data-nav].on, [data-go].on').forEach(b => b.classList.remove('on'));
    try { C.sendActivity && C.sendActivity('Website'); } catch {}
    load();
  }
  function hide() { const sec = section(); if (sec) sec.classList.add('hidden'); open = false; }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  if (C && C.on) {
    C.on('ws', m => { if (!m || m.project !== pid()) return; if (m.type === 'website' || m.type === 'site-config' || m.type === 'publish') { if (open) load(true); overviewLink(); } });
    C.on('project', () => { cur = null; if (open) load(); });
    C.on('hello', () => { if (open) load(true); });
  }
  let dsgT = 0; addEventListener('tribe:site-draft', e => { if (open && e.detail && !e.detail.dirty && e.detail.pid === pid()) { clearTimeout(dsgT); dsgT = setTimeout(() => load(true), 300); } });

  // what there is: the designer's site, an older builder site, a site in the code, or nothing
  async function facts(p) {
    const connected = !(C.connected && !C.connected());
    const [sc, w] = await Promise.all([
      C.api(`/projects/${enc(p)}/site-config`).catch(() => null),
      C.api(`/projects/${enc(p)}/website`).then(r => r.website || r).catch(() => null),
    ]);
    const cfg = sc && sc.config;
    const G = (w && w.gen) || {}, draft = !!(G.draft && G.draftUrl), built = !!(w && w.exists && w.previewUrl);
    const sd = w && w.started;
    let old = null;
    if (!cfg && (draft || built)) {
      const useDraft = draft && (G.unpublished || !built);
      old = { url: useDraft ? `${G.draftUrl}&v=${enc(G.draft.updated || '')}` : `${w.previewUrl}&v=${enc((w.built && w.built.hash) || '')}`, at: (useDraft && G.draft.updated) || (w.built && w.built.at) || '', title: ((w.fields || {}).headline) || '' };
    }
    const repo = !cfg && !old && sd && sd.kind === 'repo' ? sd : null;
    return { pid: p, connected, cfg, canEdit: !sc || sc.canEdit !== false, savedAt: sc && sc.savedAt, savedBy: sc && sc.savedBy, old, repo, state: cfg ? 'site' : old ? 'old' : repo ? 'repo' : 'none' };
  }
  // the link it is online at, when the website is what was put online
  async function linkOf(p) {
    try {
      const [st, real] = await Promise.all([window.TribePublish ? window.TribePublish.state(p, true) : null, window.TribePublishReal ? window.TribePublishReal.status(p, true) : null]);
      if (real && real.what === 'app') return '';
      const pg = real && real.dest && real.dest.pages; if (pg && pg.url) return pg.url;
      const e = st && (st.published || [])[0]; return (e && e.url) || '';
    } catch { return ''; }
  }

  async function load(quiet) {
    const sec = section(); if (!sec) return;
    const p = pid();
    if (!p) { cur = null; sec.innerHTML = `<div class="wb-wait wb-nopj"><span class="eyebrow">${esc(T('Website'))}</span><h2>${esc(T('Open a project first'))}</h2><p>${esc(T('Each project has its own website. Pick one, or start one on Home.'))}</p><button class="btn primary" id="wb-home">${esc(T('Go to Home'))}</button></div>`; const h = $('#wb-home'); if (h) h.onclick = () => (window.TribeHub ? window.TribeHub.open('home') : window.TribeApp && window.TribeApp.show('hub')); return; }
    if (!quiet || !cur || cur.pid !== p) sec.innerHTML = `<div class="wb-wait">${esc(T('Loading…'))}</div>`;
    const n = ++seq, f = await facts(p);
    if (n !== seq || p !== pid()) return;
    const key = JSON.stringify([f.state, f.cfg, f.old && f.old.url, f.repo && f.repo.path, f.savedAt]);
    if (!(quiet && cur && cur.key === key && $('#wb-root'))) { cur = { ...f, key, link: cur && cur.pid === p ? cur.link : '' }; draw(); }
    if (f.state === 'site') { const l = await linkOf(p); if (n !== seq) return; cur.link = l; drawOnline(); }
  }

  // ---------- drawing ----------
  const frame = (attr, title) => `<iframe class="wb1-frame" id="wb-frame" title="${esc(T(title))}" sandbox="" referrerpolicy="no-referrer" loading="lazy" tabindex="-1" ${attr}></iframe>`;
  function siteHtml(cfg) { try { const S = window.TribeSiteCfg; return S ? S.exportFiles(cfg, 'html')['index.html'] : ''; } catch { return ''; } }
  // Saved designs (siteshelf.js): the designer's site, or an older site's saved versions, so none of them is lost
  const shelf = () => (window.TribeSiteShelf ? `<section class="wb1-saved" id="wb-versions-sec" aria-label="${esc(T('Saved designs'))}"><div class="sec-head"><span class="eyebrow">${esc(T('Website'))}</span><h2>${esc(T('Saved designs'))}</h2></div><div id="wb-versions"></div></section>` : '');
  function draw() {
    const sec = section(), f = cur; if (!sec || !f) return;
    let body = '';
    if (f.state === 'site') {
      const c = f.cfg, n = (c.pages || []).length, when = f.savedAt ? ago(f.savedAt) : '';
      body = `<section class="wb1-card" id="wb-site" aria-label="${esc(T('Your website'))}">
        <div class="wb1-pv" id="wb-pv" role="button" tabindex="0" aria-label="${esc(T('Open the designer'))}">${frame(`srcdoc="${esc(siteHtml(c))}"`, 'Your website')}</div>
        <div class="wb1-b"><span class="eyebrow">${esc(T('Your website'))}</span><h2 id="wb-name">${esc(c.name || projName())}</h2>
          <p class="wb1-meta">${n} ${esc(T(n === 1 ? 'page' : 'pages'))}${when ? ` · ${esc(T('saved'))} ${esc(when)}${f.savedBy ? ' · ' + esc(f.savedBy) : ''}` : ''}</p>
          <div class="wb1-online" id="wb-online" aria-live="polite"></div>
          <div class="wb-acts"><button type="button" class="btn primary" id="wb-design">${esc(T('Open the designer'))}</button><button type="button" class="btn" id="wb-put">${esc(T('Put it online'))}</button></div>
          ${window.TribeVersions ? `<p class="wb-hint"><button type="button" class="linkish" id="wb-allv">${esc(T('History'))}</button>: ${esc(T('every saved version, to look at or bring back.'))}</p>` : ''}</div></section>
        ${shelf()}`;
    } else if (f.state === 'old') {
      body = `<section class="wb1-card" id="wb-old" aria-label="${esc(T('Your older website'))}">
        <div class="wb1-pv">${frame(`src="${esc(abs(f.old.url))}"`, 'Your older website')}</div>
        <div class="wb1-b"><span class="eyebrow">${esc(T('Your older website'))}</span><h2>${esc(f.old.title || projName())}</h2>
          <p class="wb1-meta">${esc(T('Made with the old page builder'))}${f.old.at ? ` · ${esc(ago(f.old.at))}` : ''}</p>
          <p class="wb-note">${esc(T('It stays as it is. Bring it into the designer to keep working on it: its words and sections come along, and nothing of the old page is deleted.'))}</p>
          ${f.canEdit ? `<div class="wb-acts"><button type="button" class="btn primary" id="wb-bring">${esc(T('Bring it into the designer'))}</button></div>` : `<p class="wb-hint">${esc(T('Someone who can change the website can bring it into the designer.'))}</p>`}</div></section>
        ${shelf()}`;
    } else {
      body = `<section class="wb1-card wb1-none" id="wb-none" aria-label="${esc(T('Website'))}">
        <div class="wb1-b"><span class="eyebrow">${esc(T('Website'))}</span><h2>${esc(T('Make your website'))}</h2>
          <p class="wb-note">${esc(T('Pick what kind of site, then a template. Flint fills it in from the project, free. Every word, picture and colour is yours to change.'))}</p>
          ${f.repo ? `<p class="wb-note">${esc(T('Your team already has a website in the code'))}: <code>${esc(f.repo.path)}</code>.</p>` : ''}
          <div class="wb-acts"><button type="button" class="btn primary" id="wb-design" data-start="1">${esc(T('Make a website'))}</button>${f.repo ? `<button type="button" class="btn" id="wb-code">${esc(T('Open the code'))}</button>` : ''}</div></div></section>`;
    }
    sec.innerHTML = `<div class="wb1" id="wb-root" data-state="${f.state}">${body}</div>`;
    const opener = () => D() && D().open({ pid: pid() });
    const dz = $('#wb-design'); if (dz) dz.onclick = dz.dataset.start ? () => D() && D().open({ pid: pid(), start: true }) : opener;   // a site: open it; none: the start screen
    const pv = $('#wb-pv'); if (pv) { pv.onclick = opener; pv.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opener(); } }; }
    const put = $('#wb-put'); if (put) put.onclick = () => (window.TribePublish ? window.TribePublish.open(pid()) : toast(T('Publishing did not load. Reload the app.')));
    const av = $('#wb-allv'); if (av) av.onclick = () => window.TribeVersions.open();
    const br = $('#wb-bring'); if (br) br.onclick = bring;
    const cd = $('#wb-code'); if (cd) cd.onclick = () => { if (window.TribeShell) window.TribeShell.go('docs-files'); setTimeout(() => { try { window.TribeCodeFiles && window.TribeCodeFiles.set('code'); } catch {} }, 120); };
    const vb = $('#wb-versions'); if (vb) window.TribeSiteShelf.render(vb, pid(), { head: false });
    drawOnline();
  }
  function drawOnline() {
    const box = $('#wb-online'), put = $('#wb-put'); if (!box || !cur) return;
    const l = cur.link;
    box.innerHTML = l ? `<span class="wb1-live">${esc(T('Online'))}</span><a href="${esc(l)}" target="_blank" rel="noopener" id="wb-link">${esc(l.replace(/^https?:\/\//, ''))}</a><button type="button" class="btn sm" id="wb-copy">${esc(T('Copy'))}</button>` : `<span class="faint">${esc(T('Not online yet. Put it online to get a link to your site.'))}</span>`;
    if (put) put.textContent = T(l ? 'Update it' : 'Put it online');
    const cp = $('#wb-copy'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(l); toast(T('Link copied')); } catch { prompt(T('Copy this link'), l); } };
  }

  // ---------- an older site into the designer ----------
  // Reads the old page and turns it into designer sections (siteimport.js), saves it as the project's designer site
  // and a version. The old builder's files and settings stay where they were.
  async function bring() {
    const f = cur, p = pid(); if (!f || !f.old || !D()) return false;
    const b = $('#wb-bring'); if (b) { b.disabled = true; b.textContent = T('Bringing it in…'); }
    try {
      if (!window.TribeSiteImport) throw new Error(T('The importer did not load. Reload the app.'));
      const r = await fetch(abs(f.old.url)); if (!r.ok) throw new Error(T('The older page could not be read.'));
      const { cfg } = window.TribeSiteImport.fromHtml(await r.text(), { name: f.old.title || projName() });
      await D().open({ pid: p, cfg });
      await D().importCfg(cfg, T('Brought in from the older website'));
      cur = null; if (open) load(true);
      return true;
    } catch (e) {
      toast(e.message || T('That did not work. Start one in the designer instead.'));
      if (b) { b.disabled = false; b.textContent = T('Bring it into the designer'); }
      return false;
    }
  }

  // A small "Website" link on the project overview when there is one (projects.js leaves #pj-site-slot for it).
  let olTimer = null;
  function overviewLink() {
    clearTimeout(olTimer);
    olTimer = setTimeout(async () => {
      const slot = $('#pj-site-slot'), p = pid(); if (!slot || !p) return;
      let f; try { f = await facts(p); } catch { return; }
      slot.innerHTML = f.state === 'site' || f.state === 'old' ? ` · <button class="linkish pj-site" id="pj-site">${esc(T('Website'))}</button>` : '';
      const b = $('#pj-site'); if (b) b.onclick = () => (window.TribeShell ? window.TribeShell.go('website') : show());
    }, 80);
  }

  window.TribeWebsite = { open: show, load, overviewLink, bring };
})();
