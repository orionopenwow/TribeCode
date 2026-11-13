// The dashboard's top (feat/dash-preview): a large preview band of the main project, then "Needs attention".
//   Band: the running app, else the website, else the latest design, else a calm "Set up your preview" card. The
//   picture is cheap: the app's cached screenshot from GET /api/thumb?prefer=shot (refetched when a screenshot, the
//   preview or the band changes), a flat page mock for the website, the design's own shapes as SVG. A live iframe
//   (sandboxed like the preview pane) only appears after a hover of ~0.7 s or a click/Enter, and goes when the band
//   redraws. Under the picture, on a solid strip: the project, what's shown (App / Website / Design), last updated and
//   by whom, who is here (presence.js), and the actions: Open preview · Open code/designer/design · Share link ·
//   Switch (App / Website / Design, saved for the tribe: PUT /api/dash/show) · ⋯ (Pin as main project, for leads).
//   Needs attention: GET /api/dash/criticals (server/dashband.js), ranked, at most 5 visible with "Show all", one
//   action each; "All clear" when there is nothing.
// Where it shows: a project's Dashboard (#pj-band-slot, #pj-crit-slot in projects.js) for that project; Home
// (#hub-band-slot in hub.js) for your most recent project, else the tribe's main one; with no tribe, Home shows the
// most recent website or design kept on this device (localfiles.js). A tribe with no projects gets "Start your first
// project". Server side: server/dashband.js. Test: app/test/e2e_dash_preview.py.
//   window.TribeDashBand = { mountProject(p), mountHome(slot), refresh(), state() }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const App = () => window.TribeApp, PJ = () => window.TribeProjects;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, sz = 15) => `<svg class="i" style="width:${sz}px;height:${sz}px" aria-hidden="true"><use href="#${id}"/></svg>`;
  const toast = m => App() && App().toast && App().toast(m);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  const ago = at => { const t = Date.parse(at); if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`; return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const LABEL = { app: 'App', site: 'Website', design: 'Design' };
  const KIND_I = { app: 'i-play', site: 'i-net', design: 'i-canvas' };
  const SANDBOX = 'allow-scripts allow-forms allow-pointer-lock allow-popups';
  const MAX = 5;

  // one band and one criticals block per place; kept as live nodes so a dashboard redraw doesn't reload the picture
  const S = { pj: { band: null, crit: null, pid: null, data: null, crits: null, all: false }, home: { band: null, pid: null, data: null } };

  // ---------- data ----------
  const api = (path, o = {}) => C().api(path, o);
  async function loadBand(pid) { try { return (await api('/dash/band', { project: pid })).band; } catch { return null; } }
  async function loadThumb(pid) { try { return (await api('/thumb?prefer=shot', { project: pid })).thumb; } catch { return null; } }
  async function loadCrits(pid) { try { return await api('/dash/criticals', { project: pid }); } catch { return { items: [], total: 0 }; } }
  const srcOf = u => { if (!/^\//.test(u)) return u; const a = `${C().base()}${u}`; return window.TribeMedia ? window.TribeMedia.url(a) : a; };

  // ---------- the picture ----------
  function tile(b, t) {
    const p = b.project, init = (t && t.initials) || String(p.name || '?').slice(0, 2).toUpperCase();
    return `<div class="db-tile" style="--pc:${esc(p.color || 'var(--brand)')}"><b>${esc(p.emoji || init)}</b><span>${esc(p.name)}</span></div>`;
  }
  function siteMock(s, name) {
    const title = (s && s.title) || name || 'Website';
    return `<div class="db-site" ${s && s.accent ? `style="--sa:${esc(s.accent)}"` : ''}><span class="db-site-bar"><i></i><i></i><i></i></span>
      <div class="db-site-body"><b>${esc(title)}</b>${s && s.tagline ? `<span>${esc(s.tagline)}</span>` : '<span class="db-ln"></span><span class="db-ln s"></span>'}<em></em>
      <div class="db-site-cols"><i></i><i></i><i></i></div></div></div>`;
  }
  async function designSvg(pid, d) {
    try { const r = await api('/canvas/' + encodeURIComponent(d.id), { project: pid }); const FV = window.TribeFilesView; if (FV && FV.thumb) return FV.thumb.design((r.file || {}).nodes); } catch {}
    return '';
  }

  // ---------- band markup ----------
  function head(b, where) {
    const by = b.updated && b.updated.byName ? ` by ${esc(b.updated.byName)}` : '';
    const upd = b.updated && b.updated.at ? `Updated ${esc(ago(b.updated.at))}${by}` : 'Not updated yet';
    const can = k => b.has[k];
    const sw = Object.keys(LABEL).map(k => `<button type="button" role="radio" class="db-sw-b" data-show="${k}" aria-checked="${b.pick === k}" ${can(k) && b.canSwitch ? '' : 'disabled'} title="${can(k) ? `Show the ${LABEL[k].toLowerCase()}` : `No ${LABEL[k].toLowerCase()} yet`}">${ico(KIND_I[k], 13)}<span>${LABEL[k]}</span></button>`).join('');
    const second = b.pick === 'app' ? ['code', 'i-git', 'Open code'] : b.pick === 'site' ? ['designer', 'i-quill', 'Open designer'] : ['design', 'i-canvas', 'Open design'];
    return `<div class="db-strip">
      <div class="db-id">${PJ() && PJ().face ? PJ().face(b.project, 'sm') : ''}<div class="db-id-t"><div class="db-name"><b>${esc(b.project.name)}</b><span class="db-kind">${ico(KIND_I[b.pick], 12)}${LABEL[b.pick]}</span>${b.isMain ? `<span class="db-main" title="${b.pinned ? 'Pinned as the tribe’s main project' : 'The tribe’s most active project'}">${b.pinned ? 'Main project' : 'Most active'}</span>` : ''}</div>
        <span class="db-upd">${upd}<span class="db-here" id="db-here-${where}"></span></span></div></div>
      <div class="db-acts">
        <button type="button" class="btn primary sm" data-db="open">${ico('i-play', 14)}${b.pick === 'design' ? 'Open design' : 'Open preview'}</button>
        ${b.pick === 'design' ? '' : `<button type="button" class="btn sm" data-db="${second[0]}">${ico(second[1], 14)}${second[2]}</button>`}
        ${b.pick === 'design' ? '' : `<button type="button" class="btn sm" data-db="share">${ico('i-link', 14)}Share link</button>`}
        <span class="db-tools"><span class="db-sw" role="radiogroup" aria-label="What the band shows">${sw}</span>
        <button type="button" class="btn sm db-more" data-db="more" aria-haspopup="menu" aria-label="More" title="More">⋯</button></span>
      </div></div>`;
  }
  function emptyBand(b, where) {
    const acts = b && b.canSwitch !== false;
    return `<section class="db-band db-empty" id="db-band-${where}" data-pick="none" aria-label="Preview">
      <div class="db-empty-in"><span class="eyebrow">Preview</span><h2>Set up your preview</h2>
        <p>Show what ${esc(b ? b.project.name : 'this project')} is making here, so everyone stays on track: the app, the website or a design.</p>
        ${acts ? `<div class="db-empty-acts"><button type="button" class="btn primary sm" data-db="new-site">${ico('i-net', 14)}Make the website</button><button type="button" class="btn sm" data-db="new-design">${ico('i-canvas', 14)}Start a design</button><button type="button" class="btn sm" data-db="new-app">${ico('i-play', 14)}Preview the app</button></div>` : ''}</div>
      ${b && b.canPin ? `<button type="button" class="btn sm db-more db-more-abs" data-db="more" aria-haspopup="menu" aria-label="More" title="More">⋯</button>` : ''}</section>`;
  }
  function startBand() {
    return `<section class="db-band db-empty db-start" id="db-band-home" data-pick="start" aria-label="Preview">
      <div class="db-empty-in"><span class="eyebrow">Your tribe</span><h2>Start your first project</h2>
        <p>A project is where the app, the website and the designs live. Its preview shows up right here.</p>
        <div class="db-empty-acts"><button type="button" class="btn primary sm" data-db="start">${ico('i-plus', 14)}Start your first project</button></div></div></section>`;
  }
  async function bandHtml(b, where) {
    if (!b) return '';
    if (b.pick === 'none') return emptyBand(b, where);
    let pic = '';
    if (b.pick === 'app') { const t = await loadThumb(b.project.id); pic = t && t.src && t.kind !== 'tile' ? `<img class="db-shot" alt="" decoding="async" referrerpolicy="no-referrer" src="${esc(srcOf(t.src))}">` : tile(b, t); }
    else if (b.pick === 'site') pic = siteMock(b.site, b.project.name);
    else pic = (await designSvg(b.project.id, b.design)) || tile(b);
    const live = b.pick === 'design' ? `${phone() ? 'Tap' : 'Click'} to open the design` : phone() ? 'Tap to run it live' : 'Hover or click to run it live';
    return `<section class="db-band" id="db-band-${where}" data-pick="${b.pick}" data-pid="${esc(b.project.id)}" aria-label="Preview of ${esc(b.project.name)}">
      <div class="db-stage" tabindex="0" role="button" aria-label="${esc(live)}"><div class="db-pic">${pic}</div><span class="db-hint">${ico(b.pick === 'design' ? 'i-canvas' : 'i-play', 12)}${live}</span></div>
      ${head(b, where)}</section>`;
  }

  // ---------- live iframe (on interaction only) ----------
  async function liveUrl(b) {
    const pid = b.project.id;
    if (b.pick === 'app') { const r = await api('/preview/token', { method: 'POST', project: pid }); return { url: r.path ? C().base() + r.path : null, share: r.share || (r.path ? C().base() + r.path : null) }; }
    if (b.pick === 'site') { const w = (await api(`/projects/${encodeURIComponent(pid)}/website`, { project: pid })).website || {}; const u = (w.gen && w.gen.draftUrl) || w.previewUrl; return { url: u ? C().base() + u : null, share: u ? C().base() + u : null }; }
    return { url: null };
  }
  let errSent = {};
  function goLive(band, b) {
    if (!band || band.querySelector('.db-frame') || b.pick === 'design') return;
    const stage = band.querySelector('.db-stage'); if (!stage) return;
    stage.classList.add('loading');
    liveUrl(b).then(({ url }) => {
      stage.classList.remove('loading');
      if (!url || !band.isConnected) return;
      const f = document.createElement('iframe');
      f.className = 'db-frame'; f.setAttribute('sandbox', SANDBOX); f.title = `${b.project.name}: live ${LABEL[b.pick].toLowerCase()}`; f.src = url; f.loading = 'eager';
      stage.querySelector('.db-pic').appendChild(f); stage.classList.add('live');
      const hint = stage.querySelector('.db-hint'); if (hint) hint.innerHTML = `<i class="db-dot" aria-hidden="true"></i>Live`;
    }).catch(() => stage.classList.remove('loading'));
  }
  addEventListener('message', e => {
    const m = e.data; if (!m || m.tc !== 'error') return;
    const f = [...document.querySelectorAll('.db-frame')].find(x => x.contentWindow === e.source); if (!f) return;
    const band = f.closest('.db-band'), pid = band && band.dataset.pid; if (!pid || errSent[pid]) return;
    errSent[pid] = 1;
    api('/dash/signal', { method: 'POST', project: pid, body: { kind: 'preview', ok: false, text: `${m.msg}${m.src ? ` (${m.src}:${m.line})` : ''}` } }).catch(() => {});
  });

  // ---------- actions ----------
  async function inProject(pid, fn) { if (PJ() && C().project && C().project() !== pid) await PJ().switchTo(pid, 'home'); return fn(); }
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Link copied.'); } catch { prompt('Copy this link', text); } }
  async function act(k, b, where, anchor) {
    const pid = b && b.project.id;
    if (k === 'start') return PJ() && PJ().openNew ? PJ().openNew() : window.TribeLocalSetup && window.TribeLocalSetup.start();
    if (k === 'more') return menu(anchor, b, where);
    if (k === 'new-site') return inProject(pid, () => window.TribeSiteDesigner && window.TribeSiteDesigner.open({ pid }));
    if (k === 'new-design') return inProject(pid, () => (window.TribeDesignFlow && window.TribeDesignFlow.open ? window.TribeDesignFlow.open({ kind: 'design' }) : window.TribeCanvas && window.TribeCanvas.open()));
    if (k === 'new-app') return inProject(pid, () => window.TribePreview && window.TribePreview.open());
    if (k === 'open') {
      if (b.pick === 'design') return inProject(pid, () => window.TribeCanvas && window.TribeCanvas.open(b.design.id));
      return inProject(pid, async () => { if (!window.TribePreview) return; await window.TribePreview.open(); window.TribePreview.setSource(b.pick === 'site' ? 'site' : 'app', true); });
    }
    if (k === 'code') return inProject(pid, () => App().show('repo'));
    if (k === 'designer') return inProject(pid, () => window.TribeSiteDesigner && window.TribeSiteDesigner.open({ pid }));
    if (k === 'design') return inProject(pid, () => window.TribeCanvas && window.TribeCanvas.open(b.design.id));
    if (k === 'share') { try { const r = await liveUrl(b); if (r.share) return copy(r.share); } catch (e) { return toast(e.message); } return toast('Nothing to share yet.'); }
    if (k === 'pin' || k === 'unpin') {
      try { await api('/dash/main', { method: 'PUT', project: pid, body: { project: k === 'pin' ? pid : null } }); toast(k === 'pin' ? `${b.project.name} is the main project.` : 'Unpinned. The most active project leads.'); } catch (e) { toast(e.message); }
      return refresh();
    }
    if (k === 'auto') { try { await api('/dash/show', { method: 'PUT', project: pid, body: { show: 'auto' } }); } catch (e) { toast(e.message); } return refresh(); }
  }
  function menu(anchor, b, where) {
    document.querySelectorAll('.db-menu').forEach(x => x.remove());
    const items = [];
    if (b && b.canPin) items.push(b.isMain && b.pinned ? ['unpin', 'Unpin main project'] : ['pin', 'Pin as main project']);
    if (b && b.chosen) items.push(['auto', 'Show automatically']);
    items.push(['refresh', 'Refresh the picture']);
    const m = document.createElement('div'); m.className = 'db-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map(([k, l]) => `<button type="button" role="menuitem" data-dbm="${k}">${esc(l)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); m.style.top = `${Math.round(r.bottom + 6)}px`; m.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)))}px`;
    m.onclick = e => { const x = e.target.closest('[data-dbm]'); if (!x) return; m.remove(); if (x.dataset.dbm === 'refresh') return refresh(); act(x.dataset.dbm, b, where); };
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } }, true), 0);
    const first = m.querySelector('button'); if (first) first.focus();
    m.addEventListener('keydown', e => { if (e.key === 'Escape') { m.remove(); anchor.focus(); } });
  }
  function bind(band, b, where) {
    if (!band) return;
    band.querySelectorAll('[data-db]').forEach(x => x.onclick = () => act(x.dataset.db, b, where, x));
    band.querySelectorAll('[data-show]').forEach(x => x.onclick = async () => {
      if (x.disabled || b.pick === x.dataset.show) return;
      try { await api('/dash/show', { method: 'PUT', project: b.project.id, body: { show: x.dataset.show } }); } catch (e) { return toast(e.message); }
      refresh();
    });
    const stage = band.querySelector('.db-stage'); if (!stage) return;
    let hov = 0;
    stage.onmouseenter = () => { if (!matchMedia('(hover: hover)').matches) return; hov = setTimeout(() => goLive(band, b), 700); };
    stage.onmouseleave = () => clearTimeout(hov);
    stage.onclick = () => (b.pick === 'design' ? act('open', b, where) : goLive(band, b));
    stage.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stage.onclick(); } };
    paintHere(band, b, where);
  }
  function paintHere(band, b, where) {
    const host = band.querySelector(`#db-here-${where}`), P = window.TribePresence; if (!host || !P || !P.at) return;
    const list = P.at(p => (p.pr || p.project) === b.project.id);
    host.innerHTML = list.length ? `<span class="db-sep" aria-hidden="true">·</span>${P.stack(list, { max: 4, cls: 'db-pz' })}` : '';
  }

  // ---------- Needs attention ----------
  function clientCrits(list) {
    const st = (window.TribeStore && window.TribeStore.get()) || {}, me = (C().state().me || {});
    if (st.hostOff && window.TribeHost && window.TribeHost.isDesktop && me.role === 'host') list.push({ k: 'setup', rank: 72, title: 'Hosting is off', sub: 'Friends can’t reach the tribe while this computer isn’t hosting it.', act: 'Turn it on', go: 'host' });
    return list.sort((a, b) => a.rank - b.rank);
  }
  function critHtml(d, all) {
    const items = clientCrits((d && d.items) || []);
    if (!items.length) return `<section class="db-crit clear" id="db-crit" aria-label="Needs attention"><span class="db-ok">${ico('i-check', 15)}All clear</span><small>Nothing needs you right now.</small></section>`;
    const shown = all ? items : items.slice(0, MAX);
    return `<section class="db-crit" id="db-crit" aria-label="Needs attention"><div class="db-crit-h"><span class="eyebrow">Needs attention</span><b>${items.length} ${items.length === 1 ? 'thing' : 'things'}</b></div>
      <ol class="db-list">${shown.map((x, i) => `<li class="db-item k-${esc(x.k)}${x.tone === 'alert' ? ' alert' : ''}" data-k="${esc(x.k)}"><i class="db-mark" aria-hidden="true"></i><div class="db-txt"><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</div><button type="button" class="btn sm" data-crit="${i}">${esc(x.act)}</button></li>`).join('')}</ol>
      ${items.length > MAX ? `<button type="button" class="linkish db-all" id="db-all">${all ? 'Show less' : `Show all ${items.length}`}</button>` : ''}</section>`;
  }
  async function critGo(x) {
    if (x.url) window.open(x.url, '_blank', 'noopener');
    const g = x.go;
    if (g === 'inbox') return window.TribeNotify && window.TribeNotify.openInbox();
    if (g === 'tasks' && x.k === 'accept' && x.task) { try { await api(`/tasks/${encodeURIComponent(x.task)}/accept`, { method: 'POST' }); toast('Accepted. It’s in progress.'); } catch (e) { toast(e.message); } return refresh(); }
    if (g === 'tasks' || g === 'repo') return App().show(g);
    if (g === 'preview') return window.TribePreview && window.TribePreview.open();
    if (g === 'site') return window.TribeSiteDesigner && window.TribeSiteDesigner.open({ pid: C().project() });
    if (g === 'company') return window.TribeCompany && (x.seat && window.TribeCompany.openSeat ? window.TribeCompany.openSeat(x.seat) : window.TribeCompany.go());
    if (g === 'github') return PJ() && PJ().step('github');
    if (g === 'backup') { if (window.TribeSettings) { window.TribeSettings.open(); setTimeout(() => { const m = $('#set-more'); if (m) m.open = true; const b = $('#set-backup'); if (b) { b.scrollIntoView({ block: 'center' }); b.focus(); } }, 250); } return; }
    if (g === 'host') return App().hostHere && App().hostHere();
    if (g === 'doc' && x.ref) return window.TribeShell && window.TribeShell.previewDoc(x.ref);
  }
  function bindCrit(el, d) {
    const items = clientCrits((d && d.items) || []);
    el.querySelectorAll('[data-crit]').forEach(b => b.onclick = () => critGo(items[+b.dataset.crit]));
    const all = el.querySelector('#db-all'); if (all) all.onclick = () => { S.pj.all = !S.pj.all; drawCrit(); };
  }
  function drawCrit() {
    const slot = $('#pj-crit-slot'); if (!slot) return;
    const sig = JSON.stringify([S.pj.crits, S.pj.all]);
    if (S.pj.crit && S.pj.crit.__sig === sig) { if (S.pj.crit.parentNode !== slot) slot.replaceChildren(S.pj.crit); return; }
    const box = document.createElement('div'); box.className = 'db-crit-wrap'; box.innerHTML = critHtml(S.pj.crits, S.pj.all); box.__sig = sig;
    bindCrit(box, S.pj.crits); S.pj.crit = box; slot.replaceChildren(box);
  }

  // ---------- mounting ----------
  async function paint(where, slot, b) {
    const st = S[where], sig = JSON.stringify(b);
    if (st.band && st.band.__sig === sig) { if (st.band.parentNode !== slot) slot.replaceChildren(st.band); return; }
    const html = await bandHtml(b, where);
    if (!slot.isConnected) return;
    const box = document.createElement('div'); box.className = 'db-wrap'; box.innerHTML = html; box.__sig = sig;
    const go = () => { slot.replaceChildren(box); bind(box.querySelector('.db-band'), b, where); };
    if (st.band && window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(go); else go();
    st.band = box;
  }
  // a project's Dashboard: this project's band, its criticals under it
  let seq = 0;
  async function mountProject(p) {
    const slot = $('#pj-band-slot'); if (!slot || !p) return;
    if (S.pj.pid === p.id && S.pj.band) { slot.replaceChildren(S.pj.band); if (S.pj.crit) $('#pj-crit-slot') && $('#pj-crit-slot').replaceChildren(S.pj.crit); }
    else { S.pj.band = null; S.pj.crit = null; S.pj.all = false; }
    S.pj.pid = p.id;
    const my = ++seq;
    const [b, cr] = await Promise.all([loadBand(p.id), loadCrits(p.id)]);
    if (my !== seq || !$('#pj-band-slot')) return;
    S.pj.data = b; S.pj.crits = cr;
    if (b) await paint('pj', $('#pj-band-slot'), b);
    drawCrit();
  }
  // Home: your most recent project (else the tribe's main one); no tribe: the newest website or design on this device
  async function mountHome(slot, force) {
    if (!slot) return;
    if (S.home.band && !S.home.band.isConnected) slot.replaceChildren(S.home.band);
    const key = (C() && C().connected() ? 'on' : 'off') + ':' + (((PJ() && PJ().list()) || []).length);
    if (!force && S.home.band && S.home.key === key && Date.now() - (S.home.at || 0) < 8000) return;   // Home redraws often: reuse the band for a few seconds
    S.home.key = key; S.home.at = Date.now();
    if (!C() || !C().connected()) return homeLocal(slot);
    const list = (PJ() && PJ().list()) || [];
    if (!list.length) { const box = document.createElement('div'); box.className = 'db-wrap'; box.innerHTML = startBand(); slot.replaceChildren(box); bind(box.querySelector('.db-band'), null, 'home'); S.home.band = box; S.home.band.__sig = 'start'; return; }
    let last = null; try { last = JSON.parse(localStorage.getItem(`tribecode.lastSession:${C().base()}`) || 'null'); } catch {}
    let pid = last && list.some(x => x.id === last.project) ? last.project : null;
    let b = await loadBand(pid || (PJ().current && PJ().current()) || list[0].id);
    if (!pid && b && b.main && b.main !== b.project.id) b = await loadBand(b.main);
    if (!b || !slot.isConnected) return;
    S.home.pid = b.project.id; S.home.data = b;
    await paint('home', slot, b);
  }
  async function homeLocal(slot) {
    const LF = window.TribeLocalFiles; if (!LF) { slot.replaceChildren(); return; }
    try { await LF.ready; } catch {}
    const it = (LF.list() || []).filter(x => x.kind === 'site' || x.kind === 'design').sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')))[0];
    if (!it) { slot.replaceChildren(); S.home.band = null; return; }
    const sig = `local:${it.id}:${it.updated}`; if (S.home.band && S.home.band.__sig === sig && S.home.band.parentNode === slot) return;
    const FV = window.TribeFilesView, kind = it.kind === 'site' ? 'site' : 'design';
    const pic = kind === 'site' ? siteMock({ title: it.title }, it.title) : (FV && FV.thumb ? FV.thumb.design(it.nodes) : '');
    const box = document.createElement('div'); box.className = 'db-wrap'; box.__sig = sig;
    box.innerHTML = `<section class="db-band db-local" id="db-band-home" data-pick="${kind}" aria-label="Preview of ${esc(it.title)}">
      <div class="db-stage" tabindex="0" role="button" aria-label="Open ${esc(it.title)}"><div class="db-pic">${pic}</div><span class="db-hint">${ico(KIND_I[kind], 12)}${kind === 'site' ? 'Click to run it live' : 'Click to open the design'}</span></div>
      <div class="db-strip"><div class="db-id"><div class="db-id-t"><div class="db-name"><b>${esc(it.title)}</b><span class="db-kind">${ico(KIND_I[kind], 12)}${LABEL[kind]}</span><span class="db-main">On this device</span></div><span class="db-upd">Updated ${esc(ago(it.updated))}</span></div></div>
      <div class="db-acts"><button type="button" class="btn primary sm" data-l="open">${ico('i-play', 14)}${kind === 'site' ? 'Open website' : 'Open design'}</button><button type="button" class="btn sm" data-l="start">${ico('i-plus', 14)}Make it a project</button></div></div></section>`;
    slot.replaceChildren(box); S.home.band = box;
    const stage = box.querySelector('.db-stage');
    const live = () => { if (kind !== 'site' || stage.querySelector('.db-frame')) return LF.open(it.id); const f = document.createElement('iframe'); f.className = 'db-frame'; f.setAttribute('sandbox', 'allow-scripts'); f.title = `${it.title}: live`; f.srcdoc = it.body || ''; stage.querySelector('.db-pic').appendChild(f); stage.classList.add('live'); };
    stage.onclick = live; stage.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); live(); } };
    box.querySelector('[data-l="open"]').onclick = () => LF.open(it.id);
    box.querySelector('[data-l="start"]').onclick = () => window.TribeLocalSetup && window.TribeLocalSetup.start();
  }

  // ---------- keep it current ----------
  let t = 0;
  function refresh() {
    clearTimeout(t);
    t = setTimeout(() => {
      const v = document.body.dataset.view;
      if (v === 'home' && PJ() && PJ().cur()) mountProject(PJ().cur());
      if (v === 'hub') { const s = $('#hub-band-slot'); if (s) mountHome(s, true); }
    }, 250);
  }
  function hook() {
    const c = C(); if (!c || !c.on) return setTimeout(hook, 200);
    ['dashband', 'visual', 'visuals', 'preview', 'task', 'approval', 'notification', 'site-comments', 'website', 'canvas', 'company'].forEach(k => c.on(k, refresh));
    c.on('ws', m => { if (m && (m.type === 'dashband' || m.type === 'site-comment' || m.type === 'site-config')) refresh(); });
    if (window.TribePresence && window.TribePresence.on) window.TribePresence.on(() => {
      if (S.pj.band && S.pj.data) paintHere(S.pj.band, S.pj.data, 'pj');
      if (S.home.band && S.home.data) paintHere(S.home.band, S.home.data, 'home');
    });
  }
  hook();
  addEventListener('focus', () => { if (document.querySelector('.db-band')) refresh(); });

  window.TribeDashBand = { mountProject, mountHome, refresh, state: () => ({ project: S.pj.data, crits: S.pj.crits, home: S.home.data }) };
})();
