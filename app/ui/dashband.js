// The dashboard's top (feat/dash-preview): a large preview band of the main project, then "Needs attention".
//   Band: the running app, else the app made in App Creator, else the website, else the latest design. With none of
//   those and a sentence about the project (its vision), a sketch of what the sentence describes (living preview:
//   firstlook.js draft(), drawn small by the same renderers, no AI) with "Make it real"; with no sentence, a calm
//   "Set up your preview" card that asks for it. A project with more than one thing gets tabs (App | Website | …):
//   a tab swaps the preview and its actions in place and is remembered per project on this device. The
//   picture is cheap: the app's cached screenshot from GET /api/thumb?prefer=shot (refetched when a screenshot, the
//   preview or the band changes), a flat page mock for the website, the design's own shapes as SVG. A live iframe
//   (sandboxed like the preview pane) only appears after a hover of ~0.7 s or a click/Enter, and goes when the band
//   redraws. Under the picture, on a solid strip: the project, what's shown (App / Website / Design), last updated and
//   by whom, who is here (presence.js), and the actions: Open preview · Open code/designer/design · Share link ·
//   ⋯ (Pin as main project, for leads; Show automatically). PUT /api/dash/show still sets the tribe's default.
//   Needs attention: GET /api/dash/criticals (server/dashband.js), ranked, at most 5 visible with "Show all", one
//   action each; "All clear" when there is nothing.
// Where it shows: a project's Dashboard (#pj-band-slot, #pj-crit-slot in projects.js) for that project; Home
// (#hub-band-slot in hub.js) for your most recent project, else the tribe's main one; with no tribe, Home shows the
// most recent website or design kept on this device (localfiles.js). A tribe with no projects gets "Start your first
// project". Server side: server/dashband.js. Tests: app/test/e2e_dash_preview.py, e2e_living_preview.py.
// Agents & office's side panel (officefull.js, #ao-preview-slot) shows the current project's band too, live at once.
//   window.TribeDashBand = { mountProject(p), mountHome(slot), mountOffice(slot), refresh(), card(pid), open(pid, k), state() }
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
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const LABEL = { app: 'App', site: 'Website', phone: 'Phone app', design: 'Design' };
  const ORDER = ['app', 'phone', 'site', 'design'];   // living preview: the main app first
  const KIND_I = { app: 'i-play', site: 'i-net', phone: 'i-grid', design: 'i-canvas' };
  const SANDBOX = 'allow-scripts allow-forms allow-pointer-lock allow-popups';
  const MAX = 5;

  // one band and one criticals block per place; kept as live nodes so a dashboard redraw doesn't reload the picture
  const S = { pj: { band: null, crit: null, pid: null, data: null, crits: null, all: false }, home: { band: null, pid: null, data: null }, office: { band: null, pid: null, data: null } };

  // ---------- data ----------
  const api = (path, o = {}) => C().api(path, o);
  async function loadBand(pid) { try { return (await api('/dash/band', { project: pid })).band; } catch { return null; } }
  async function loadThumb(pid) { try { return (await api('/thumb?prefer=shot', { project: pid })).thumb; } catch { return null; } }
  async function loadCrits(pid) { try { return await api('/dash/criticals', { project: pid }); } catch { return { items: [], total: 0 }; } }
  const srcOf = u => { if (!/^\//.test(u)) return u; const a = `${C().base()}${u}`; return window.TribeMedia ? window.TribeMedia.url(a) : a; };

  // ---------- living preview: which thing is shown ----------
  // The server picks the main app first. A tab chosen here is remembered per project on this device.
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
  const TABKEY = pid => `tribecode.band.tab:${(C() && C().base && C().base()) || ''}:${pid}`;
  const tabsOf = b => ORDER.filter(k => b.has && b.has[k]);
  const tabName = (b, k) => (k === 'phone' && !(b.has && b.has.app) ? 'App' : LABEL[k]);
  function view(b) {
    if (!b || !b.project || b.pick === 'none') return b;
    const mine = ls.get(TABKEY(b.project.id)), pick = mine && b.has && b.has[mine] ? mine : b.pick;
    return { ...b, pick, mine: pick === mine, updated: (b.updates && pick in b.updates ? b.updates[pick] : pick === b.pick ? b.updated : null) || null };
  }
  addEventListener('tribe:firstlook', e => { const pid = e.detail && e.detail.pid; if (pid) ls.set(TABKEY(pid), null); });   // what was just made is what shows

  // ---------- the sketch: what the sentence describes, before anything is made ----------
  const sentence = b => (b && b.pick === 'none' ? String(b.vision || '').replace(/\s+/g, ' ').trim() : '');
  const sketches = new Map();
  async function sketchOf(b) {
    const idea = sentence(b); if (!idea || idea.length < 3) return null;
    if (document.readyState !== 'complete') await new Promise(r => { addEventListener('load', r, { once: true }); setTimeout(r, 4000); });   // the creators load after this file
    const FL = window.TribeFirstLook; if (!FL || !FL.draft) return null;
    const key = `${b.project.id}|${b.project.name}|${idea}`; if (sketches.has(key)) return sketches.get(key);
    let d = null; try { d = await FL.draft(idea, b.project.name); } catch (e) { d = null; try { console.warn('sketch', e); } catch {} }
    if (d) d.pic = sketchPic(d, b.project.name);
    if (d && !d.pic) d = null;
    if (sketches.size > 40) sketches.clear();
    if (d) sketches.set(key, d);
    return d;
  }
  function siteOf(cfg, name) {   // the composed website's headline, line, colour and section names, for the flat page mock
    const S = window.TribeSiteCfg, blocks = (((cfg || {}).pages || [])[0] || {}).blocks || [], hero = blocks.find(x => x && /hero|header|cover/i.test(String(x.type || ''))) || blocks[0] || {}, f = hero.props || {};
    const secs = blocks.filter(x => x && x !== hero && !/^(nav|footer)$/.test(String(x.type || ''))).map(x => String((x.props && (x.props.title || x.props.heading)) || (S && S.BLOCKS && S.BLOCKS[x.type] && S.BLOCKS[x.type].label) || '').trim()).filter(Boolean);
    const ac = cfg && cfg.theme && cfg.theme.colors && cfg.theme.colors.accent;
    return { title: String(f.title || f.headline || name || '').slice(0, 80), tagline: String(f.text || f.subtitle || f.tagline || '').slice(0, 140), accent: /^#[0-9a-f]{3,8}$/i.test(String(ac || '')) ? ac : null, sections: [...new Set(secs)].slice(0, 3) };
  }
  function sketchPic(d, name) {
    const A = window.TribeAppCreator;
    if (d.kind === 'app') {
      if (!d.doc || !A || !A.mini) return '';
      // the first screen, and beside it the screen for the first thing the sentence names (a leaderboard, a map…)
      const names = (d.chips || []).slice(1).map(c => String(c).toLowerCase()), more = (d.doc.screens || []).find(x => x.id !== d.doc.start && names.includes(String(x.name || '').toLowerCase()));
      return `<div class="db-phone${more ? ' db-phone-2' : ''}">${A.mini(d.doc, null, 150)}${more ? A.mini(d.doc, more.id, 150) : ''}</div>`;
    }
    if (d.kind === 'site') return d.cfg ? siteMock(siteOf(d.cfg, name), name) : '';
    return `<div class="db-game"><span class="db-game-top"><i></i><i></i><i></i><em>${esc(d.starter || T('Game'))}</em></span><b>${esc(name)}</b><span class="db-game-go">${esc(T('Press start'))}</span><span class="db-game-land" aria-hidden="true"><i></i><i></i><i></i><u></u></span></div>`;
  }
  const SK_KIND = { app: 'Phone app', site: 'Website', game: 'Game' };
  function sketchBand(b, d, where) {
    const can = b.canSwitch !== false, idea = sentence(b);
    return `<section class="db-band db-sketch" id="db-band-${where}" data-pick="sketch" data-kind="${d.kind}" data-pid="${esc(b.project.id)}" aria-label="${esc(T('A sketch from your sentence'))}">
      <div class="db-stage db-sk-stage"><div class="db-pic" aria-hidden="true">${d.pic}</div><span class="db-sk-tag">${esc(T('Sketch'))}</span></div>
      <div class="db-strip db-sk-strip">
        <div class="db-sk-t"><span class="eyebrow">${esc(T('A sketch from your sentence'))}</span>
          <p class="db-sk-q">“${esc(idea)}”</p>
          <div class="db-sk-chips"><span class="db-kind">${ico(d.kind === 'site' ? 'i-net' : d.kind === 'app' ? 'i-grid' : 'i-play', 12)}${esc(T(SK_KIND[d.kind]))}</span>${(d.chips || []).slice(1).map(c => `<span class="db-chip">${esc(c)}</span>`).join('')}</div>
          <small class="db-sk-note">${esc(T('Nothing is made yet. This is what your sentence describes.'))}</small></div>
        <div class="db-acts">${can ? `<button type="button" class="btn primary sm" data-db="make-real">${ico('i-sparkle', 14)}${esc(T('Make it real'))}</button><button type="button" class="btn sm" data-db="say">${ico('i-quill', 14)}${esc(T('Change the sentence'))}</button>` : ''}
          ${b.canPin ? `<span class="db-tools"><button type="button" class="btn sm db-more" data-db="more" aria-haspopup="menu" aria-label="${esc(T('More'))}" title="${esc(T('More'))}">⋯</button></span>` : ''}</div>
      </div></section>`;
  }

  // ---------- the picture ----------
  function tile(b, t) {
    const p = b.project, init = (t && t.initials) || String(p.name || '?').slice(0, 2).toUpperCase();
    return `<div class="db-tile" style="--pc:${esc(p.color || 'var(--brand)')}"><b>${esc(p.emoji || init)}</b><span>${esc(p.name)}</span></div>`;
  }
  function siteMock(s, name) {
    const title = (s && s.title) || name || 'Website';
    return `<div class="db-site" ${s && s.accent ? `style="--sa:${esc(s.accent)}"` : ''}><span class="db-site-bar"><i></i><i></i><i></i></span>
      <div class="db-site-body"><b>${esc(title)}</b>${s && s.tagline ? `<span>${esc(s.tagline)}</span>` : '<span class="db-ln"></span><span class="db-ln s"></span>'}<em></em>
      <div class="db-site-cols">${s && s.sections && s.sections.length ? s.sections.map(x => `<i><small>${esc(x)}</small></i>`).join('') : '<i></i><i></i><i></i>'}</div></div></div>`;
  }
  async function phonePic(pid, size) {   // pass 6: an App Creator app: its first screen (p12: larger in the dashboard's band)
    try { const r = await api(`/projects/${encodeURIComponent(pid)}/app-config`, { project: pid }); const A = window.TribeAppCreator; if (r && r.config && A && A.mini) return `<div class="db-phone">${A.mini(r.config, null, size || 150)}</div>`; } catch {}
    return '';
  }
  async function designSvg(pid, d) {
    try { const r = await api('/canvas/' + encodeURIComponent(d.id), { project: pid }); const FV = window.TribeFilesView; if (FV && FV.thumb) return FV.thumb.design((r.file || {}).nodes); } catch {}
    return '';
  }

  // ---------- band markup ----------
  // p12: the controls are one quiet row above the picture: what to preview on the left, Open and Change it on the right,
  // the rest (Share link, pin, show automatically, refresh) in ⋯. The project's name is the page title, so it is not repeated.
  const SECOND = { app: ['code', 'i-git', 'Open code'], site: ['designer', 'i-quill', 'Open designer'], phone: ['appcreator', 'i-grid', 'Open App Creator'] };
  function acts(b) {
    const second = SECOND[b.pick];
    return `<div class="db-acts">
        <button type="button" class="btn primary sm" data-db="open" title="${esc(T(b.pick === 'design' ? 'Open design' : 'Open preview'))}">${ico('i-play', 14)}<span class="db-l">${esc(T('Open'))}</span></button>
        ${second ? `<button type="button" class="btn sm" data-db="${second[0]}" title="${esc(T(second[2]))}">${ico(second[1], 14)}<span class="db-l">${esc(T('Change it'))}</span></button>` : ''}
        <span class="db-tools"><button type="button" class="btn sm db-more" data-db="more" aria-haspopup="menu" aria-label="${esc(T('More'))}" title="${esc(T('More'))}">⋯</button></span>
      </div>`;
  }
  function barHtml(b, where) {
    const tabs = tabsHtml(b, where);
    return `<div class="db-bar">${tabs || `<span class="db-kind">${ico(KIND_I[b.pick], 13)}${esc(T(tabName(b, b.pick)))}</span>`}${acts(b)}</div>`;
  }
  function head(b, where) {   // a slim line under the picture: when it last changed and who is here
    const by = b.updated && b.updated.byName ? ` by ${esc(b.updated.byName)}` : '';
    const upd = b.updated && b.updated.at ? `Updated ${esc(ago(b.updated.at))}${by}` : 'Not updated yet';
    return `<div class="db-strip db-foot"><span class="db-upd">${upd}${b.isMain && b.pinned ? `<span class="db-sep" aria-hidden="true">·</span><span class="db-main" title="Pinned as the tribe’s main project">Main project</span>` : ''}<span class="db-here" id="db-here-${where}"></span></span></div>`;
  }
  // the tab row: only for things that exist, and only when there is more than one
  function tabsHtml(b, where) {
    const ks = tabsOf(b); if (ks.length < 2) return '';
    return `<div class="db-tabs" role="tablist" aria-label="${esc(T('What to preview'))}">${ks.map(k => `<button type="button" role="tab" class="db-tab" id="db-tab-${where}-${k}" data-show="${k}" title="${esc(T(tabName(b, k)))}" aria-selected="${b.pick === k}" aria-controls="db-panel-${where}" tabindex="${b.pick === k ? 0 : -1}">${ico(KIND_I[k], 14)}<span>${esc(T(tabName(b, k)))}</span>${k === 'site' && b.site && b.site.online ? `<span class="db-on"><i class="db-dot" aria-hidden="true"></i>${esc(T('Online'))}</span>` : ''}</button>`).join('')}</div>`;
  }
  function emptyBand(b, where) {
    const acts = b && b.canSwitch !== false;
    return `<section class="db-band db-empty" id="db-band-${where}" data-pick="none" aria-label="Preview">
      <div class="db-empty-in"><span class="eyebrow">Preview</span><h2>Set up your preview</h2>
        <p>${esc(T('Say what you’re making in one sentence and a sketch of it shows up here. Or start with one of these.'))}</p>
        ${acts ? `<div class="db-empty-acts"><button type="button" class="btn primary sm" data-db="say">${ico('i-quill', 14)}${esc(T('Say what you’re making'))}</button><button type="button" class="btn sm" data-db="new-site">${ico('i-net', 14)}Make the website</button><button type="button" class="btn sm" data-db="new-design">${ico('i-canvas', 14)}Start a design</button><button type="button" class="btn sm" data-db="new-app">${ico('i-play', 14)}Preview the app</button></div>` : ''}</div>
      ${b && b.canPin ? `<button type="button" class="btn sm db-more db-more-abs" data-db="more" aria-haspopup="menu" aria-label="More" title="More">⋯</button>` : ''}</section>`;
  }
  function startBand() {
    return `<section class="db-band db-empty db-start" id="db-band-home" data-pick="start" aria-label="Preview">
      <div class="db-empty-in"><span class="eyebrow">Your tribe</span><h2>Start your first project</h2>
        <p>A project is where the app, the website and the designs live. Its preview shows up right here.</p>
        <div class="db-empty-acts"><button type="button" class="btn primary sm" data-db="start">${ico('i-plus', 14)}Start your first project</button></div></div></section>`;
  }
  // the band's picture (no live iframe): also Home's preview cards (feat/p10-home)
  async function picOf(b, big) {
    if (b.pick === 'app') { const t = await loadThumb(b.project.id); return t && t.src && t.kind !== 'tile' ? `<img class="db-shot" alt="" decoding="async" referrerpolicy="no-referrer" src="${esc(srcOf(t.src))}">` : tile(b, t); }
    if (b.pick === 'site') return siteMock(b.site, b.project.name);
    if (b.pick === 'phone') return phonePic(b.project.id, big ? (phone() ? 170 : 200) : 150);
    return (await designSvg(b.project.id, b.design)) || tile(b);
  }
  // Home (feat/p10-home): one project's preview as a small card's data, or null when it has nothing to show yet
  async function card(pid) {
    const raw = await loadBand(pid); if (!raw || !raw.project) return null;
    const b = view(raw);
    if (b.pick === 'none') {   // the same as the dashboard: a sketch when there is only a sentence
      const d = await sketchOf(b);
      if (d) return { pid, name: b.project.name, project: b.project, pick: 'sketch', kind: 'Sketch from your sentence', pic: d.pic, updated: null };
      return { pid, name: b.project.name, project: b.project, pick: 'none', pic: '', updated: b.updated || null };
    }
    let pic = ''; try { pic = await picOf(b); } catch {}
    return { pid, name: b.project.name, project: b.project, pick: b.pick, kind: tabName(b, b.pick), pic, updated: b.updated || null };
  }
  async function bandHtml(b, where) {
    if (!b) return '';
    if (b.pick === 'none') { const d = await sketchOf(b); return d ? sketchBand(b, d, where) : emptyBand(b, where); }
    const pic = await picOf(b, true), tabs = tabsOf(b).length > 1;
    const opens = b.pick === 'phone' || (b.pick === 'site' && b.site && b.site.designed);
    const live = b.pick === 'design' ? `${phone() ? 'Tap' : 'Click'} to open the design` : opens ? `${phone() ? 'Tap' : 'Click'} to open the preview` : phone() ? 'Tap to run it live' : 'Hover or click to run it live';
    return `<section class="db-band has-bar${tabs ? ' has-tabs' : ''}" id="db-band-${where}" data-pick="${b.pick}" data-pid="${esc(b.project.id)}" aria-label="Preview of ${esc(b.project.name)}">
      ${barHtml(b, where)}<div class="db-panel" id="db-panel-${where}"${tabs ? ` role="tabpanel" aria-labelledby="db-tab-${where}-${b.pick}"` : ''}>
      <div class="db-stage" tabindex="0" role="button" aria-label="${esc(live)}"><div class="db-pic">${pic}</div><span class="db-hint">${ico(b.pick === 'design' ? 'i-canvas' : 'i-play', 12)}${live}</span></div>
      ${head(b, where)}</div></section>`;
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
    // living preview: the sketch's one button is the first-version path that already exists (firstlook.js)
    if (k === 'make-real') { const idea = sentence(b); if (!idea || !window.TribeFirstLook) return; return inProject(pid, () => window.TribeFirstLook.start({ pid, idea, name: b.project.name })); }
    if (k === 'say') return inProject(pid, () => PJ() && PJ().step && PJ().step('vision'));   // the one line under the project's name
    if (k === 'new-site') return inProject(pid, () => window.TribeSiteDesigner && window.TribeSiteDesigner.open({ pid, start: true }));
    if (k === 'new-design') return inProject(pid, () => (window.TribeDesignFlow && window.TribeDesignFlow.open ? window.TribeDesignFlow.open({ kind: 'design' }) : window.TribeCanvas && window.TribeCanvas.open()));
    if (k === 'new-app') return inProject(pid, () => window.TribePreview && window.TribePreview.open());
    if (k === 'open') {
      if (b.pick === 'none' || b.pick === 'sketch') return PJ() && PJ().switchTo && PJ().switchTo(pid, 'home');
      if (b.pick === 'design') return inProject(pid, () => window.TribeCanvas && window.TribeCanvas.open(b.design.id));
      // pass 6: a designed website and an App Creator app open full size (firstlook.js), like the first preview
      if (window.TribeFirstLook && (b.pick === 'phone' || (b.pick === 'site' && b.site && b.site.designed))) return inProject(pid, () => window.TribeFirstLook.open(pid, b.pick === 'phone' ? 'app' : 'site'));
      return inProject(pid, async () => { if (!window.TribePreview) return; await window.TribePreview.open(); window.TribePreview.setSource(b.pick === 'site' ? 'site' : 'app', true); });
    }
    if (k === 'code') return inProject(pid, () => App().show('repo'));
    if (k === 'designer') return inProject(pid, () => window.TribeSiteDesigner && window.TribeSiteDesigner.open({ pid }));
    if (k === 'appcreator') return inProject(pid, () => window.TribeAppCreator && window.TribeAppCreator.open({ pid }));
    if (k === 'design') return inProject(pid, () => window.TribeCanvas && window.TribeCanvas.open(b.design.id));
    // feat/dash-layout: a link copies; with nothing to share yet, the Publish sheet opens to put it online (no dead end)
    if (k === 'share') { let r = null; try { r = await liveUrl(b); } catch {} if (r && r.share) return copy(r.share); if (window.TribePublish && window.TribePublish.open) return inProject(pid, () => window.TribePublish.open(pid)); return toast('Nothing to share yet.'); }
    if (k === 'pin' || k === 'unpin') {
      try { await api('/dash/main', { method: 'PUT', project: pid, body: { project: k === 'pin' ? pid : null } }); toast(k === 'pin' ? `${b.project.name} is the main project.` : 'Unpinned. The most active project leads.'); } catch (e) { toast(e.message); }
      return refresh();
    }
    if (k === 'auto') { ls.set(TABKEY(pid), null); if (b.chosen && b.canSwitch !== false) { try { await api('/dash/show', { method: 'PUT', project: pid, body: { show: 'auto' } }); } catch (e) { toast(e.message); } } return refresh(true); }
  }
  function menu(anchor, b, where) {
    document.querySelectorAll('.db-menu').forEach(x => x.remove());
    const items = [];
    if (b && (b.pick === 'app' || b.pick === 'site')) items.push(['share', T('Share link')]);   // p12: out of the button row
    if (b && b.canPin) items.push(b.isMain && b.pinned ? ['unpin', 'Unpin main project'] : ['pin', 'Pin as main project']);
    if (b && (b.chosen || b.mine) && tabsOf(b).length > 1) items.push(['auto', 'Show automatically']);
    items.push(['refresh', 'Refresh the picture']);
    const m = document.createElement('div'); m.className = 'db-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map(([k, l]) => `<button type="button" role="menuitem" data-dbm="${k}">${esc(l)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); m.style.top = `${Math.round(r.bottom + 6)}px`; m.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)))}px`;
    m.onclick = e => { const x = e.target.closest('[data-dbm]'); if (!x) return; m.remove(); if (x.dataset.dbm === 'refresh') return refresh(true); act(x.dataset.dbm, b, where); };
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } }, true), 0);
    const first = m.querySelector('button'); if (first) first.focus();
    m.addEventListener('keydown', e => { if (e.key === 'Escape') { m.remove(); anchor.focus(); } });
  }
  function bind(band, b, where) {
    if (!band) return;
    band.querySelectorAll('[data-db]').forEach(x => x.onclick = () => act(x.dataset.db, b, where, x));
    // tabs: click or arrow keys (Left/Right, Home/End) show that thing; the choice stays on this device
    const tabs = [...band.querySelectorAll('.db-tab')];
    tabs.forEach((x, i) => {
      x.onclick = () => select(where, x.dataset.show);
      x.onkeydown = e => {
        const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
        if (n < 0) return; e.preventDefault(); select(where, tabs[n].dataset.show, true);
      };
    });
    const stage = band.querySelector('.db-stage'); if (!stage) return;
    let hov = 0;
    if (b.pick === 'none') return;   // a sketch is a picture: its button makes it real
    stage.onmouseenter = () => { if (!matchMedia('(hover: hover)').matches || b.pick === 'phone' || (b.site && b.site.designed)) return; hov = setTimeout(() => goLive(band, b), 700); };
    stage.onmouseleave = () => clearTimeout(hov);
    stage.onclick = () => (b.pick === 'design' || b.pick === 'phone' || (b.pick === 'site' && b.site && b.site.designed) ? act('open', b, where) : goLive(band, b));
    stage.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stage.onclick(); } };
    paintHere(band, b, where);
  }
  function paintHere(band, b, where) {
    const host = band.querySelector(`#db-here-${where}`), P = window.TribePresence; if (!host || !P || !P.at) return;
    const list = P.at(p => (p.pr || p.project) === b.project.id);
    host.innerHTML = list.length ? `<span class="db-sep" aria-hidden="true">·</span>${P.stack(list, { max: 4, cls: 'db-pz' })}` : '';
  }

  // ---------- Needs attention ----------
  // feat/calm-parity: while a project is young its setup gaps (no GitHub, no backup) wait in the getting-started
  // list (projects.js) instead of here. fold(pid, on) is set by the Dashboard on each redraw.
  const isGap = x => x && x.k === 'setup' && (x.go === 'github' || x.go === 'backup');
  let foldFor = {};
  function fold(pid, on) { const was = !!foldFor[pid]; foldFor[pid] = !!on; if (was !== !!on && S.pj.pid === pid && S.pj.crits) drawCrit(); }
  function gaps(pid) { return S.pj.pid === pid && foldFor[pid] && S.pj.crits ? (S.pj.crits.items || []).filter(isGap) : []; }
  function clientCrits(list) {
    list = foldFor[S.pj.pid] ? list.filter(x => !isGap(x)) : list.slice();
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
    const sig = JSON.stringify([S.pj.crits, S.pj.all, !!foldFor[S.pj.pid]]);
    try { dispatchEvent(new CustomEvent('tribe:dash-gaps', { detail: { pid: S.pj.pid } })); } catch {}
    if (S.pj.crit && S.pj.crit.__sig === sig) { if (S.pj.crit.parentNode !== slot) slot.replaceChildren(S.pj.crit); return; }
    const box = document.createElement('div'); box.className = 'db-crit-wrap'; box.innerHTML = critHtml(S.pj.crits, S.pj.all); box.__sig = sig;
    bindCrit(box, S.pj.crits); S.pj.crit = box; slot.replaceChildren(box);
  }

  // ---------- mounting ----------
  async function paint(where, slot, raw, focus) {
    const b = view(raw), st = S[where], sig = JSON.stringify([b, sentence(b) ? !!(window.TribeFirstLook && window.TribeFirstLook.draft) : 0]);
    if (st.band && st.band.__sig === sig) { if (st.band.parentNode !== slot) slot.replaceChildren(st.band); return; }
    const html = await bandHtml(b, where);
    if (!slot.isConnected) return;
    const box = document.createElement('div'); box.className = 'db-wrap'; box.innerHTML = html; box.__sig = sig;
    const go = () => { slot.replaceChildren(box); bind(box.querySelector('.db-band'), b, where); if (where === 'office' && (b.pick === 'app' || (b.pick === 'site' && !(b.site && b.site.designed)))) goLive(box.querySelector('.db-band'), b); if (focus) { const t = box.querySelector('.db-tab[aria-selected="true"]'); if (t) t.focus({ preventScroll: true }); } };
    if (st.band && window.TribeMotion && window.TribeMotion.swap) window.TribeMotion.swap(go); else go();
    st.band = box;
  }
  // a tab was chosen: remember it for this project on this device, and swap the preview and its actions in place
  async function select(where, k, focus) {
    const st = S[where], raw = st.data, slot = where === 'pj' ? $('#pj-band-slot') : where === 'office' ? $('#ao-preview-slot') : $('#hub-band-slot');
    if (!raw || !slot || !raw.has || !raw.has[k]) return;
    if (view(raw).pick === k) { if (focus) { const t = st.band && st.band.querySelector(`.db-tab[data-show="${k}"]`); if (t) t.focus(); } return; }
    ls.set(TABKEY(raw.project.id), k);
    await paint(where, slot, raw, true);
    try { dispatchEvent(new CustomEvent('tribe:band-tab', { detail: { pid: raw.project.id, show: k } })); } catch {}
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
  // Agents & office (officefull.js): the current project's app and website, live, in the side panel's Preview tab
  let oseq = 0;
  async function mountOffice(slot) {
    if (!slot) return;
    const pid = (PJ() && PJ().current && PJ().current()) || (C() && C().project && C().project());
    if (!pid) { slot.innerHTML = `<p class="ofl-quiet">${esc(T('Start a project first. Its app and website show here.'))}</p>`; return; }
    if (S.office.pid === pid && S.office.band && S.office.band.parentNode !== slot) slot.replaceChildren(S.office.band);
    if (S.office.pid !== pid) { S.office.band = null; S.office.data = null; }
    S.office.pid = pid;
    const my = ++oseq, b = await loadBand(pid);
    if (my !== oseq || !slot.isConnected) return;
    if (!b) { if (!S.office.band) slot.innerHTML = `<p class="ofl-quiet">${esc(T('The preview could not load right now.'))}</p>`; return; }
    S.office.data = b;
    await paint('office', slot, b);
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
    if (!list.length && window.TribeProjects && window.TribeProjects.hadProject && window.TribeProjects.hadProject() && !(window.TribeProjects.loaded && window.TribeProjects.loaded())) { slot.replaceChildren(); S.home.band = null; S.home.key = ''; return; }   // feat/p10-home: still loading, not "first project"
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
  function refresh(now) {
    clearTimeout(t);
    if (now === true) sketches.clear();
    t = setTimeout(() => {
      const v = document.body.dataset.view;
      if (v === 'home' && PJ() && PJ().cur()) mountProject(PJ().cur());
      if (v === 'hub') { const s = $('#hub-band-slot'); if (s) mountHome(s, true); }
      { const s = $('#ao-preview-slot'); if (s && s.offsetParent) mountOffice(s); }
    }, 250);
  }
  function hook() {
    const c = C(); if (!c || !c.on) return setTimeout(hook, 200);
    ['dashband', 'vision', 'visual', 'visuals', 'preview', 'task', 'approval', 'notification', 'site-comments', 'website', 'canvas', 'company'].forEach(k => c.on(k, () => refresh()));
    c.on('ws', m => { if (m && (m.type === 'dashband' || m.type === 'site-comment' || m.type === 'site-config')) refresh(); });
    if (window.TribePresence && window.TribePresence.on) window.TribePresence.on(() => {
      if (S.pj.band && S.pj.data) paintHere(S.pj.band, S.pj.data, 'pj');
      if (S.home.band && S.home.data) paintHere(S.home.band, S.home.data, 'home');
      if (S.office.band && S.office.data) paintHere(S.office.band, S.office.data, 'office');
    });
  }
  hook();
  addEventListener('focus', () => { if (document.querySelector('.db-band')) refresh(); });

  window.TribeDashBand = { mountProject, mountHome, mountOffice, refresh, fold, gaps, card, open: (pid, k = 'open') => loadBand(pid).then(b => b && act(k, view(b), 'home')), go: critGo, view, tabs: tabsOf, select, state: () => ({ project: S.pj.data, crits: S.pj.crits, home: S.home.data }) };
})();
