// The website designer (feat/flint-site), rebuilt on OpenPage's model (github.com/buildingopen/openpage, MIT;
// reimplemented in plain JS, see NOTICE): one JSON config (app/ui/sitecfg.js) is the source of truth, a block picker with
// layout variants, theme presets with a real dark variant, inline text editing in the live preview, drag to reorder,
// undo/redo, pages, button wiring, picture tools and a standalone HTML export. Flint edits the same config, so every
// command he runs is one Undo away. Saved on the host (PUT /api/projects/:id/site-config); versions on the Saved shelf
// keep the config (server/siteflint.js). With no tribe it keeps the design on this device.
//   window.TribeSiteDesigner = { open({ pid, template, cfg }), close(), ask(text) -> Promise<reply>, state(), cfg(), download(kind) }
// Open it from Files › Website, Preview › Website, the project's website button (they call open), "open the website
// designer" in Flint's chat, or #/site-designer.
(function () {
  'use strict';
  const S = () => window.TribeSiteCfg, C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = s => root && root.querySelector(s);
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const LOCAL = 'tribecode.sitedesigner.local';
  const connected = () => !!(C && C.connected && C.connected() && C.hasToken && C.hasToken());
  let root = null, st = null, saveT = 0, frameScroll = 0, liveText = null, liveT = 0;

  const EDIT_CSS = `<style>[data-e]{cursor:text;border-radius:2px}[data-e]:hover{outline:1px dashed var(--muted);outline-offset:2px}[data-e]:focus{outline:2px solid var(--accent);outline-offset:2px}
[data-block]{position:relative}[data-block]:hover{outline:1px dashed var(--line);outline-offset:-1px}.wdz-sel{outline:2px solid var(--accent)!important;outline-offset:-2px}
[data-img]{cursor:pointer}.wdz-pin{position:absolute;z-index:5;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50% 50% 50% 0;border:2px solid #fff;background:#F26B1D;color:#fff;font:700 11px/1 system-ui;cursor:pointer;padding:0}.wdz-pin.done{background:#6b7280}.wdz-cm [data-block]{cursor:crosshair}.wdz-cm [data-block]:hover{outline:2px dashed #F26B1D!important}[data-unwired]{outline:1px dashed var(--muted);outline-offset:3px}[data-unwired]::after{content:'not linked';font:600 10px/1 ui-monospace,monospace;margin-left:8px;opacity:.7}</style>`;
  // the frame's helper is a real file loaded from the app's origin, never an inline script: the srcdoc frame inherits the
  // page's CSP, and the desktop app's has no 'unsafe-inline' (app/src-tauri/tauri.conf.json)
  const EDIT_JS = () => `<script src="${new URL('sitedesigner-frame.js', document.baseURI).href.replace(/"/g, '%22')}"><\/script>`;

  // ---------- state, history, saving ----------
  // feat/site-v2: edits are never lost. Every change goes to a local draft at once (localStorage, per project), and to
  // the host after a short pause with the rev it started from. The draft is flushed when the tab hides, the page
  // unloads, the route changes or the designer closes; it is restored on open when it is newer than the host's copy.
  // A newer rev on the host (someone else saved) answers 409: Keep mine · Keep theirs · Keep both (theirs goes to the
  // Saved shelf, mine stays).
  function fresh(cfg, pid) { return { pid, cfg: S().normalize(cfg), hist: [], fut: [], page: null, sel: null, dev: 'desktop', log: [], canEdit: true, rev: 0, savedAt: 0, dirty: false, comments: [], cmode: false, panel: 'edit', facts: null }; }
  const pageNow = () => st.cfg.pages.find(p => p.id === st.page) || st.cfg.pages[0];
  const DKEY = pid => `tribecode.sitedesigner.draft.${pid || 'local'}`;
  const readDraft = pid => { try { const d = JSON.parse(localStorage.getItem(DKEY(pid)) || (pid ? 'null' : localStorage.getItem(LOCAL) && JSON.stringify({ cfg: JSON.parse(localStorage.getItem(LOCAL)), at: 0, rev: 0, dirty: false }) || 'null')); return d && d.cfg ? d : null; } catch { return null; } };
  // a demo's project (demo_…, offline.js) keeps no draft once the demo has ended: its keys were wiped on exit
  const writeDraft = () => { if (!st) return; if (/^demo_/.test(st.pid || '') && !(window.TribeOffline && window.TribeOffline.active && window.TribeOffline.active())) return; try { localStorage.setItem(DKEY(st.pid), JSON.stringify({ cfg: st.cfg, at: Date.now(), rev: st.rev, dirty: st.dirty })); if (!st.pid) localStorage.setItem(LOCAL, JSON.stringify(st.cfg)); } catch {} };
  function commit(next, opts = {}) {
    if (!next || next === st.cfg) return false;
    st.hist.push(JSON.stringify(st.cfg)); if (st.hist.length > 80) st.hist.shift(); st.fut = [];
    st.cfg = S().normalize(next);
    if (!st.cfg.pages.some(p => p.id === st.page)) st.page = st.cfg.pages[0].id;
    save(); if (!opts.quiet) paint();
    return true;
  }
  function undo() { if (!st.hist.length) return false; st.fut.push(JSON.stringify(st.cfg)); st.cfg = JSON.parse(st.hist.pop()); fixPage(); save(); paint(); return true; }
  function redo() { if (!st.fut.length) return false; st.hist.push(JSON.stringify(st.cfg)); st.cfg = JSON.parse(st.fut.pop()); fixPage(); save(); paint(); return true; }
  function fixPage() { if (!st.cfg.pages.some(p => p.id === st.page)) st.page = st.cfg.pages[0].id; if (st.sel && !pageNow().blocks.some(b => b.id === st.sel.block)) st.sel = null; }
  const ago = t => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 20 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  function status(text) { const el = $('#wdz-saved'); if (!el) return; el.textContent = text != null ? text : st.dirty ? 'Saving…' : st.savedAt ? `Saved${st.pid && connected() ? '' : ' on this device'} · ${ago(st.savedAt)}` : ''; el.classList.toggle('is-dirty', !!st.dirty); }
  setInterval(() => { if (st && root && !root.hidden && !st.dirty) status(); }, 15000);
  function save() {
    clearTimeout(saveT); st.dirty = true; writeDraft(); status('Saving…');
    if (st.pid) dispatchEvent(new CustomEvent('tribe:site-draft', { detail: { pid: st.pid, dirty: true } }));
    saveT = setTimeout(push, 600);
  }
  async function push(opts = {}) {
    clearTimeout(saveT); saveT = 0; if (!st || !st.dirty) return true;
    const pid = st.pid, cfg = st.cfg, mine = JSON.stringify(cfg);
    if (!pid || !connected()) { st.dirty = false; st.savedAt = Date.now(); writeDraft(); status(); return true; }
    try {
      const r = await C.api(`/projects/${encodeURIComponent(pid)}/site-config`, { method: 'PUT', body: { config: cfg, base: st.rev, force: !!opts.force }, keepalive: !!opts.keepalive });
      if (!st || st.pid !== pid) return true;
      st.rev = r.rev || st.rev + 1; if (JSON.stringify(st.cfg) === mine) st.dirty = false; st.savedAt = Date.now(); writeDraft(); status(); hideConflict();
      dispatchEvent(new CustomEvent('tribe:site-draft', { detail: { pid, dirty: st.dirty } }));
      if (st.dirty) saveT = setTimeout(push, 600);
      return true;
    } catch (e) {
      if (e && (e.status === 409 || /conflict|409/.test(e.message || ''))) { conflict(e.body || e.data || {}); return false; }
      status('Not saved yet: ' + (e.message || 'offline') + ' · kept on this device'); saveT = setTimeout(push, 5000); return false;
    }
  }
  // flush now: the words being typed, then the draft, then the host (keepalive so it survives the page going away)
  function flushNow(keepalive) { if (!st) return Promise.resolve(true); if (liveText) commitText(liveText); writeDraft(); return st.dirty ? push({ keepalive }) : Promise.resolve(true); }
  const flush = () => flushNow(false);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(true); });
  addEventListener('pagehide', () => flushNow(true));
  addEventListener('hashchange', () => { if (st && st.dirty) flushNow(false); });
  function conflict(d) {
    st.conflict = d; let bar = $('#wdz-conflict');
    if (!bar) { bar = document.createElement('div'); bar.id = 'wdz-conflict'; bar.className = 'wdz-note wdz-conflict'; bar.setAttribute('role', 'alert'); root.querySelector('.wdz-stage').prepend(bar); }
    bar.hidden = false;
    bar.innerHTML = `<span><b>${esc(d.by || 'Someone')}</b> saved a newer version${d.at ? ' ' + esc(ago(Date.parse(d.at))) : ''} while you were editing.</span><button type="button" class="btn sm primary" data-cf="mine">Keep mine</button><button type="button" class="btn sm" data-cf="theirs">Keep theirs</button><button type="button" class="btn sm" data-cf="both">Keep both</button>`;
    status('Not saved: newer version on the host');
  }
  function hideConflict() { const b = $('#wdz-conflict'); if (b) b.hidden = true; if (st) st.conflict = null; }
  async function resolveConflict(how) {
    const d = st.conflict || {}; hideConflict();
    if (how === 'theirs') { st.hist.push(JSON.stringify(st.cfg)); st.cfg = S().normalize(d.config || st.cfg); st.rev = d.rev || st.rev; st.dirty = false; st.savedAt = Date.now(); writeDraft(); fixPage(); paint(); status(); return say('Using their version. Undo brings yours back.'); }
    if (how === 'both') { try { await C.api(`/projects/${encodeURIComponent(st.pid)}/website/versions`, { method: 'POST', body: { note: `Their version · ${d.by || 'someone'}` } }); } catch {} }
    st.dirty = true; await push({ force: true });
    say(how === 'both' ? 'Kept both: their design is in Saved designs, yours is the design now.' : 'Kept yours.');
  }

  // ---------- open / close ----------
  // open({ pid, template, prompt, cfg, ask }): the Design creation flow and Flint call this. template = a gallery id
  // (ours or an imported one); prompt = what the person said ("a link tree for June Bakes"): it can pick the template
  // and the name, and the rest is passed to Flint.
  async function open(o = {}) {
    if (!S()) return;
    if (st && root && !root.hidden) await flush();
    const pid = o.pid !== undefined ? o.pid : (C && C.project && C.project()) || '';
    let cfg = o.cfg || null, rev = 0, server = null;
    if (!cfg && pid && connected()) { try { server = await C.api(`/projects/${encodeURIComponent(pid)}/site-config`); cfg = server.config; rev = server.rev || 0; } catch {} }
    const d = !o.cfg && readDraft(pid);
    let restored = false;
    if (d && (!cfg || (d.dirty && (d.rev || 0) >= rev) || (!connected() && d.at))) { cfg = d.cfg; restored = !!d.dirty && !!server; }
    mount();
    st = fresh(cfg || S().blank(projectName(pid)), pid); st.rev = rev; st.savedAt = d && d.at || (server && server.savedAt ? Date.parse(server.savedAt) : 0);
    st.page = st.cfg.pages[0].id;
    root.hidden = false; document.body.classList.add('wdz-open');
    { const f = $('#wdz-frame'); if (f && f.srcdoc) { const n = f.cloneNode(false); n.removeAttribute('srcdoc'); f.replaceWith(n); } }   // a frame that was inside the hidden designer can stay unpainted in Chrome: start a fresh one
    if (d && d.dirty && server && (d.rev || 0) < rev && JSON.stringify(S().normalize(d.cfg)) !== JSON.stringify(st.cfg)) { st.dirty = true; st.cfg = S().normalize(d.cfg); conflict({ config: server.config, rev, by: server.savedBy, at: server.savedAt }); }
    else if (restored) { st.dirty = true; push(); }
    let tpl = o.template, rest = o.prompt || '';
    if (rest && !tpl && window.TribeNLU) { const P = window.TribeNLU.parse(rest, {}); const s = (P.steps || [])[0]; if (s && /^site\./.test(s.intent) && s.conf >= 0.6 && S().TEMPLATES.includes(s.intent.slice(5))) { tpl = s.intent.slice(5); if (s.slots && s.slots.name) o.name = s.slots.name; rest = ''; } }
    if (tpl) await useTemplate(tpl, !cfg, { name: o.name });
    else if (!cfg) showStart(); else paint();
    chipKey = ''; logPaint();   // feat/flint-unify: this design's thread and chips
    status(); await loadComments();
    if (o.comment) commentMode(true);
    const ask2 = o.ask || rest; if (ask2) setTimeout(() => ask(ask2), 60);
    return st;
  }
  function close() { if (!root) return; flush(); root.hidden = true; document.body.classList.remove('wdz-open'); if (location.hash === '#/site-designer') history.back(); }
  function projectName(pid) { try { const p = ((C.state && C.state().projects) || []).find(x => x.id === pid); return (p && p.name) || 'My site'; } catch { return 'My site'; } }
  // a template as a config: the static gallery first (works with no tribe and offline), then the host, then the model
  const inlineImgs = async c => { const walk = async o => { if (Array.isArray(o)) { for (const x of o) await walk(x); return; } if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { if ((k === 'img' || k === 'logo') && typeof o[k] === 'string' && o[k] && !/^data:/.test(o[k])) o[k] = await toData(o[k]); else await walk(o[k]); } }; await walk(c); return c; };
  async function templateCfg(id) {
    try { const r = await fetch('sitetpl/' + encodeURIComponent(id) + '.json'); if (r.ok) return S().normalize(await inlineImgs(await r.json())); } catch {}
    if (connected()) { try { return (await C.api('/site-designer/template/' + encodeURIComponent(id))).config; } catch {} }
    if (S().TEMPLATES.includes(id)) return S().fromTemplate(id, { name: projectName(st && st.pid) });
    return null;
  }
  async function useTemplate(id, first, o = {}) {
    const c = await templateCfg(id); if (!c) { say(`I could not load the ${id} template. Try another, or start blank.`); return false; }
    if (o.name) c.name = o.name;
    st.unfilled = JSON.stringify(c);
    let filled = c, used = [];
    if ((st.pid || o.name) && o.fill !== false) { const r = await autofill(c, o.name); filled = r.cfg; used = r.used; }   // a name you gave beats the project's
    if (first && !st.hist.length && !st.log.length) { st.cfg = S().normalize(filled); st.page = st.cfg.pages[0].id; save(); }
    else commit(filled);
    st.page = st.cfg.pages[0].id; st.sel = null; hideStart(); paint();
    fillNote(used);
    return true;
  }

  // ---------- auto-populate from the project (feat/site-v2) ----------
  async function loadFacts() {
    if (st.facts) return st.facts;
    let F = { name: projectName(st.pid) !== 'My site' ? projectName(st.pid) : '' };
    if (st.pid && connected()) { try { F = (await C.api(`/projects/${encodeURIComponent(st.pid)}/site-autofill`)).facts || F; } catch {} }
    else { try { const p = ((C.state && C.state().projects) || []).find(x => x.id === st.pid); if (p && p.bio) F.tagline = p.bio; } catch {} }
    if (F.images && F.images.length) F.images = (await Promise.all(F.images.slice(0, 6).map(u => toData(/^\/api\//.test(u) && C.base ? C.base() + u : u)))).filter(Boolean);
    st.facts = F; return F;
  }
  async function autofill(c, name) {
    const F0 = await loadFacts(), F = name ? { ...F0, name } : F0; const r = S().fill(c, F);
    const B = window.TribeBoost;   // with an AI on, better hero words from the same facts (one undo with the rest)
    try {
      if (B && await B.online() && window.TribeAIBasics && window.TribeAIBasics.ask && r.used.length) {
        const h = r.cfg.pages[0].blocks.find(b => b.type === 'hero');
        const a = h && await window.TribeAIBasics.ask('site.copy', { facts: { name: F.name, tagline: F.tagline, mission: String(F.mission || '').slice(0, 600), building: (F.building || []).map(x => x.title) }, hero: { title: h.props.title, text: h.props.text }, want: 'JSON {"title","text"}: a short, specific headline and one sentence, no hype words' }, '');
        const j = a && a.text ? JSON.parse((/\{[\s\S]*\}/.exec(a.text) || ['{}'])[0]) : null;
        if (j && j.title) { h.props.title = String(j.title).slice(0, 90); if (j.text) h.props.text = String(j.text).slice(0, 240); r.used.push(`better words ✦ via ${a.via}`); }
      }
    } catch {}
    return r;
  }
  function fillNote(used) {
    let n = $('#wdz-fill'); if (!used || !used.length) { if (n) n.hidden = true; return; }
    if (!n) { n = document.createElement('div'); n.id = 'wdz-fill'; n.className = 'wdz-note'; n.setAttribute('role', 'status'); root.querySelector('.wdz-stage').prepend(n); }
    n.hidden = false;
    n.innerHTML = `<span><b>Filled from your project:</b> ${esc(used.join(', '))}.</span><button type="button" class="btn sm" data-fill="blank">Start blank instead</button><button type="button" class="btn sm ghost" data-fill="ok" aria-label="Dismiss">OK</button>`;
  }

  // ---------- the DOM ----------
  function mount() {
    if (root) return;
    root = document.createElement('div'); root.id = 'wdz'; root.className = 'wdz'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Website designer');
    const P = S().PRESETS;
    root.innerHTML = `
      <header class="wdz-top">
        <button type="button" class="btn ghost sm" data-wdz="close" aria-label="Back">← Back</button>
        <b class="wdz-title"><span class="wdz-eyebrow">Website</span><span id="wdz-name"></span></b>
        <nav class="wdz-pages" id="wdz-pages" aria-label="Pages"></nav>
        <span class="wdz-sp"></span>
        <span class="wdz-saved" id="wdz-saved" aria-live="polite"></span>
        <button type="button" class="btn ghost sm wdz-ic" data-wdz="undo" title="Undo (Ctrl Z)" aria-label="Undo">↶</button>
        <button type="button" class="btn ghost sm wdz-ic" data-wdz="redo" title="Redo (Ctrl Shift Z)" aria-label="Redo">↷</button>
        <button type="button" class="btn sm" data-wdz="mode" id="wdz-mode" aria-pressed="false">Dark</button>
        <label class="wdz-sel-wrap"><span class="sr">Theme</span><select id="wdz-theme" class="input sm" aria-label="Theme">${Object.entries(P).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('')}</select></label>
        <span class="wdz-devs" role="group" aria-label="Preview size"><button type="button" class="btn ghost sm" data-dev="desktop" aria-pressed="true">Desktop</button><button type="button" class="btn ghost sm" data-dev="tablet" aria-pressed="false">Tablet</button><button type="button" class="btn ghost sm" data-dev="phone" aria-pressed="false">Phone</button></span>
        <button type="button" class="btn sm" data-wdz="comment" id="wdz-cmode" aria-pressed="false" title="Click a section to leave a comment (C)">Comment<span class="wdz-n" id="wdz-cn" hidden></span></button>
        <button type="button" class="btn ghost sm wdz-ic" data-wdz="keys" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
        <button type="button" class="btn sm" data-wdz="templates">Templates</button>
        <button type="button" class="btn sm" data-wdz="freeai" id="wdz-freeai" title="Copy the design for ChatGPT, Gemini or another free AI, then paste its answer back">Ask a free AI</button>
        <button type="button" class="btn sm" data-wdz="save" title="Keep this design in Saved designs (the project’s history is in Versions)">Save design</button>
        <span class="wdz-dl"><button type="button" class="btn sm primary" data-wdz="dl-html" id="wdz-dl">Download HTML</button><button type="button" class="btn sm primary wdz-dl-more" data-wdz="dlmenu" aria-label="More download options" aria-expanded="false">▾</button>
          <span class="wdz-menu" id="wdz-dlmenu" hidden role="menu"><button type="button" role="menuitem" data-wdz="dl-html"><b>index.html</b><small>One standalone file: every page, pictures inside, no scripts</small></button><button type="button" role="menuitem" data-wdz="dl-zip"><b>.zip with pages and assets</b><small>A file per page, assets/, fonts/ and site.json</small></button><button type="button" role="menuitem" data-wdz="publish"><b>Publish to the project</b><small>Writes it to the project's site/ folder</small></button></span></span>
      </header>
      <div class="wdz-body">
        <aside class="wdz-left" aria-label="Blocks">
          <p class="wdz-eyebrow">Blocks on this page</p>
          <ol class="wdz-blocks" id="wdz-blocks"></ol>
          <button type="button" class="btn sm wdz-add" data-wdz="picker" aria-expanded="false">+ Add block</button>
          <div class="wdz-picker" id="wdz-picker" hidden></div>
        </aside>
        <main class="wdz-stage"><div class="wdz-frame" id="wdz-framewrap" data-dev="desktop"><iframe id="wdz-frame" title="Live preview of the website" sandbox="allow-scripts"></iframe></div></main>
        <aside class="wdz-right" aria-label="Edit and Flint">
          <div class="wdz-ptabs" role="tablist" aria-label="Panel"><button type="button" role="tab" data-panel="edit" aria-selected="true">Edit</button><button type="button" role="tab" data-panel="comments" aria-selected="false">Comments<span class="wdz-n" id="wdz-cn2" hidden></span></button><button type="button" role="tab" data-panel="site" aria-selected="false">Site</button></div>
          <div class="wdz-insp" id="wdz-insp"></div>
          <section class="wdz-flint" id="wdz-flint" aria-label="Flint"></section>
        </aside>
      </div>
      <div class="wdz-start" id="wdz-start" hidden></div>
      <input type="file" id="wdz-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden><input type="file" id="wdz-import" accept=".html,.htm,text/html" hidden>
      <div class="wdz-peek" id="wdz-peek" hidden role="dialog" aria-label="Template preview"></div><div class="wdz-cpop" id="wdz-cpop" hidden></div><div class="wdz-keys" id="wdz-keys" hidden role="dialog" aria-label="Keyboard shortcuts"></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    mountFlint();
    root.querySelector('#wdz-theme').addEventListener('change', e => commit(S().setTheme(st.cfg, e.target.value)));
    root.querySelector('#wdz-file').addEventListener('change', onFile);
    root.querySelector('#wdz-import').addEventListener('change', onImport);
    root.addEventListener('input', e => { if (e.target && e.target.id === 'wdz-gq') { gal.q = e.target.value; galPaint(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && root && !root.hidden && !root.contains(e.target) && !e.defaultPrevented && !document.querySelector('.modal-wrap:not(.hidden), dialog[open]')) escape(); });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#wdz-dlmenu').hidden) { $('#wdz-dlmenu').hidden = true; return; }
      const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      keys(e);
    });
    addEventListener('message', onFrame);
    dragList();
  }

  // ---------- paint ----------
  function paint() {
    if (!root || !st) return;
    const c = st.cfg, pg = pageNow();
    $('#wdz-name').textContent = c.name;
    $('#wdz-pages').innerHTML = c.pages.map(p => `<button type="button" class="wdz-tab" data-page="${p.id}" aria-current="${p.id === pg.id ? 'page' : 'false'}">${esc(p.title)}</button>`).join('') + `<button type="button" class="wdz-tab wdz-tab-add" data-wdz="addpage" title="Add a page" aria-label="Add a page">+</button>`;
    $('#wdz-theme').value = c.theme.preset;
    const m = $('#wdz-mode'); m.setAttribute('aria-pressed', String(c.theme.mode === 'dark')); m.textContent = c.theme.mode === 'dark' ? 'Light' : 'Dark'; m.title = `Switch to the ${c.theme.mode === 'dark' ? 'light' : 'dark'} variant`;
    root.querySelector('[data-wdz="undo"]').disabled = !st.hist.length; root.querySelector('[data-wdz="redo"]').disabled = !st.fut.length;
    $('#wdz-blocks').innerHTML = pg.blocks.map((b, i) => `<li class="wdz-blk${st.sel && st.sel.block === b.id ? ' is-sel' : ''}${b.hidden ? ' is-hidden' : ''}" draggable="true" data-blk="${b.id}" data-i="${i}"><span class="wdz-grip" aria-hidden="true">⋮⋮</span><button type="button" class="wdz-blk-t" data-pick="${b.id}">${esc(S().BLOCKS[b.type].label.replace(/ \(.*/, ''))}<small>${esc(b.variant)}</small></button><span class="wdz-blk-acts"><button type="button" data-move="up" data-id="${b.id}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button type="button" data-move="down" data-id="${b.id}" aria-label="Move down"${i < pg.blocks.length - 1 ? '' : ' disabled'}>↓</button><button type="button" data-dup="${b.id}" aria-label="Duplicate block" title="Duplicate (Ctrl D)">⧉</button><button type="button" data-hide="${b.id}" aria-label="${b.hidden ? 'Show' : 'Hide'} block" aria-pressed="${!!b.hidden}" title="${b.hidden ? 'Show on the site' : 'Hide from the site'} (H)">${b.hidden ? '◌' : '◉'}</button><button type="button" data-del="${b.id}" aria-label="Delete block">×</button></span></li>`).join('');
    frame(); panelPaint(); logPaint(); status();
    const wrap = $('#wdz-framewrap'); wrap.dataset.dev = st.dev; root.querySelectorAll('[data-dev]').forEach(b => b.matches('button') && b.setAttribute('aria-pressed', String(b.dataset.dev === st.dev)));
  }
  // the site's fonts as data: URLs: the sandboxed preview has no origin, so it cannot fetch them itself
  const FONTS = new Map(); let fontsAsked = false;
  async function loadFonts() {
    fontsAsked = true;
    const files = ['fraunces-latin-700-normal', 'instrument-serif-latin-400-normal', 'space-grotesk-latin-700-normal', 'bricolage-grotesque-latin-800-normal', 'jetbrains-mono-latin-700-normal', 'silkscreen-latin-400-normal', 'inter-latin-400-normal'];
    await Promise.all(files.map(async n => { try { const r = await fetch('assets/site-fonts/' + n + '.woff2'); if (!r.ok) return; const b = await r.blob(); FONTS.set(n, await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })); } catch {} }));
    if (FONTS.size && root && !root.hidden) frame();
  }
  // the live preview: one render per tick; if the frame does not say "ready" soon, a fresh frame gets it (Chrome can leave
  // a sandboxed srcdoc frame blank when it is re-navigated quickly, e.g. right after the designer was hidden)
  let frameT = 0, frameWd = 0, frameReady = false;
  function frame() {
    if (!$('#wdz-frame')) return;
    if (!fontsAsked) loadFonts();
    clearTimeout(frameT);
    frameT = setTimeout(() => {
      const f = $('#wdz-frame'); if (!f || !st) return;
      const fonts = file => FONTS.get(file) || '';
      const html = S().render(st.cfg, { page: st.page, edit: true, mode: 'single', fonts, extraHead: EDIT_CSS, extraBody: EDIT_JS() });
      frameReady = false; f.srcdoc = html;
      clearTimeout(frameWd);
      frameWd = setTimeout(() => { if (frameReady || !root || root.hidden) return; const g = $('#wdz-frame'); if (!g) return; const n = g.cloneNode(false); n.removeAttribute('srcdoc'); g.replaceWith(n); n.srcdoc = html; }, 1500);
    }, 0);
  }
  function postSel(scroll) {
    const f = $('#wdz-frame'); if (!f || !f.contentWindow) return;
    const s = st.sel, sel = !s ? '' : s.kind === 'button' ? `[data-btn="${s.block}|${s.path}"]` : s.kind === 'image' ? `[data-img="${s.block}|${s.path}"]` : `[data-block="${s.block}"]`;
    f.contentWindow.postMessage({ sel, scroll }, '*');
  }
  function onFrame(e) {
    const d = e.data; if (!d || !d.sd || !root || root.hidden) return;
    const f = $('#wdz-frame'); if (!f || e.source !== f.contentWindow) return;
    if (d.t === 'ready') { frameReady = true; f.contentWindow.postMessage({ y: frameScroll }, '*'); postSel(false); postPins(); return; }
    if (d.t === 'scroll') { frameScroll = d.y; return; }
    if (d.t === 'esc') return escape();   // Esc pressed inside the preview
    if (d.t === 'page') { st.page = d.id; st.sel = null; frameScroll = 0; paint(); return; }
    if (d.t === 'undo') return undo();
    if (d.t === 'redo') return redo();
    if (d.t === 'select') { const [block, path] = String(d.key).split('|'); st.sel = { block, path: path || '', kind: d.kind }; inspector(); postSel(false); $('#wdz-blocks').querySelectorAll('.wdz-blk').forEach(li => li.classList.toggle('is-sel', li.dataset.blk === block)); return; }
    if (d.t === 'text') { liveText = d; clearTimeout(liveT); liveT = setTimeout(() => { if (liveText) { const l = liveText; commitText(l); } }, 900); return; }
    if (d.t === 'commit') return commitText(d);
    if (d.t === 'pin') return commentAt(d);
    if (d.t === 'pinopen') { st.panel = 'comments'; panelPaint(); const el = $(`[data-cmt="${CSS.escape(d.id)}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); return; }
  }

  function commitText(d) {
    liveText = null;
    const [block, path] = String(d.key).split('|'), b = pageNow().blocks.find(x => x.id === block); if (!b) return;
    const v = String(d.value || '').replace(/\u00a0/g, ' ').trim();
    if (String(S().getAt(b.props, path) ?? '') === v) return;
    st.hist.push(JSON.stringify(st.cfg)); st.fut = []; st.cfg = S().setProp(st.cfg, st.page, block, path, v);
    save(); const u = root.querySelector('[data-wdz="undo"]'); if (u) u.disabled = false; inspector();
  }
  // ---------- feat/site-v2: the right panel (Edit · Comments · Site), the block picker, shortcuts ----------
  function panelPaint() {
    if (!root || !st) return;
    root.querySelectorAll('[data-panel]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.panel === st.panel)));
    const open = st.comments.filter(c => c.status === 'open').length;
    [$('#wdz-cn'), $('#wdz-cn2')].forEach(n => { if (n) { n.hidden = !open; n.textContent = open; } });
    if (st.panel === 'comments') return commentsPaint();
    if (st.panel === 'site') return sitePaint();
    inspector();
    const s = st.sel, b = s && s.kind === 'block' && pageNow().blocks.find(x => x.id === s.block), box = $('#wdz-insp');
    if (b && box) {
      const sty = b.style || {}, B = (k, v, l) => `<button type="button" class="btn sm" data-sty="${k}" data-val="${v}" aria-pressed="${(sty[k] || '') === v}">${l}</button>`;
      box.insertAdjacentHTML('beforeend', `<p class="wdz-f"><span>Background</span></p><p class="wdz-row" role="group" aria-label="Background">${B('bg', '', 'None')}${B('bg', 'card', 'Tint')}${B('bg', 'accent', 'Accent')}${B('bg', 'ink', 'Dark')}</p>
        <p class="wdz-f"><span>Spacing</span></p><p class="wdz-row" role="group" aria-label="Spacing">${B('pad', 's', 'Tight')}${B('pad', '', 'Normal')}${B('pad', 'l', 'Roomy')}</p>
        <p class="wdz-row"><button type="button" class="btn sm" data-dup="${b.id}">Duplicate</button><button type="button" class="btn sm" data-hide="${b.id}" aria-pressed="${!!b.hidden}">${b.hidden ? 'Show on the site' : 'Hide from the site'}</button><button type="button" class="btn sm" data-wdz="comment">Comment here</button></p>`);
    }
  }
  // a tiny schematic of each block (flat shapes in the app's own tokens), so the picker shows what you get
  function schem(type, v) {
    const R = (x, y, w, h, o) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="currentColor" opacity="${o || 0.35}"/>`;
    const lines = (x, y, n, w) => Array.from({ length: n }, (_, i) => R(x, y + i * 5, w - (i === n - 1 ? 8 : 0), 2.5, 0.3)).join('');
    const cards = (n, y, h) => Array.from({ length: n }, (_, i) => R(4 + i * (52 / n), y, 52 / n - 3, h, 0.25)).join('');
    const body = {
      hero: v === 'split' ? R(4, 10, 24, 5, 0.6) + lines(4, 18, 2, 24) + R(4, 30, 10, 5, 0.8) + R(32, 6, 24, 30) : v === 'cover' ? R(0, 0, 60, 18) + R(4, 22, 30, 5, 0.6) + lines(4, 30, 1, 30) : v === 'accent' ? R(0, 0, 60, 40, 0.5) + R(14, 12, 32, 5, 0.9) + R(24, 24, 12, 5, 0.9) : R(12, 10, 36, 6, 0.6) + lines(16, 20, 2, 28) + R(24, 30, 12, 5, 0.8),
      features: v === 'list' ? lines(4, 6, 6, 52) : v === 'alternating' ? R(4, 4, 22, 14) + lines(30, 8, 2, 26) + R(34, 22, 22, 14) + lines(4, 26, 2, 26) : v === 'stats' ? cards(3, 12, 16) : cards(3, 10, 22),
      gallery: v === 'strip' ? cards(3, 10, 20) + R(56, 10, 4, 20, 0.15) : v === 'masonry' ? R(4, 4, 16, 18, .3) + R(22, 4, 16, 30, .3) + R(40, 4, 16, 14, .3) + R(4, 24, 16, 12, .3) + R(40, 20, 16, 16, .3) : cards(3, 4, 15) + cards(3, 22, 15),
      pricing: v === 'table' ? lines(4, 8, 5, 52) : cards(3, 6, 28), testimonials: v === 'spotlight' ? R(10, 12, 40, 5, 0.6) + R(16, 20, 28, 5, 0.6) + R(24, 30, 12, 3) : cards(3, 10, 20),
      faq: lines(4, 6, 6, 52), team: Array.from({ length: 4 }, (_, i) => `<circle cx="${10 + i * 14}" cy="18" r="5" fill="currentColor" opacity=".35"/>` + R(5 + i * 14, 27, 10, 2.5, .3)).join(''),
      links: `<circle cx="30" cy="8" r="4" fill="currentColor" opacity=".4"/>` + R(14, 15, 32, 5) + R(14, 22, 32, 5) + R(14, 29, 32, 5),
      list: lines(4, 6, 6, 52), contact: R(4, 6, 30, 4, 0.6) + R(4, 13, 40, 5, .2) + R(4, 20, 40, 5, .2) + R(4, 28, 14, 5, .7), embed: R(8, 4, 44, 30) + `<path d="M27 13 L35 19 L27 25Z" fill="currentColor" opacity=".7"/>`,
      text: v === 'two' ? R(4, 8, 16, 5, .6) + lines(24, 8, 5, 32) : lines(8, 8, 6, 44), footer: R(0, 26, 60, 14, .2) + R(4, 31, 16, 3, .5) + R(40, 31, 16, 3, .4),
      newsletter: R(12, 8, 36, 5, .6) + R(10, 20, 28, 7, .2) + R(40, 20, 12, 7, .7), cta: v === 'accent' ? R(0, 4, 60, 32, .5) + R(16, 12, 28, 5, .9) + R(24, 22, 12, 5, .9) : R(14, 12, 32, 5, .6) + R(24, 22, 12, 6, .8),
      stats: [0, 1, 2].map(i => R(6 + i * 18, 12, 12, 8, .6) + R(6 + i * 18, 23, 14, 2.5, .3)).join(''), logos: [0, 1, 2, 3].map(i => R(4 + i * 14, 16, 10, 6, .3)).join(''),
      banner: R(0, 14, 60, 10, .5) + R(18, 17.5, 24, 3, .9), divider: v === 'dots' ? [0, 1, 2].map(i => `<circle cx="${24 + i * 6}" cy="20" r="1.5" fill="currentColor" opacity=".5"/>`).join('') : R(6, 19, 48, 1.5, .5), image: v === 'side' ? R(4, 6, 26, 28) + lines(34, 12, 3, 22) : R(4, 4, 52, 24) + R(4, 31, 30, 3, .4),
    }[type] || lines(4, 6, 6, 52);
    return `<svg viewBox="0 0 60 40" width="60" height="40" aria-hidden="true">${body}</svg>`;
  }
  function picker() {
    const C2 = S().CATS || {}, groups = {};
    S().TYPES.forEach(t => { const g = C2[t] || 'More'; (groups[g] = groups[g] || []).push(t); });
    return Object.entries(groups).map(([g, ts]) => `<p class="wdz-eyebrow">${esc(g)}</p>${ts.map(ty => `<div class="wdz-pk"><b>${esc(S().BLOCKS[ty].label)}</b><span class="wdz-pkv">${S().BLOCKS[ty].variants.map(v => `<button type="button" class="wdz-pkb" data-add="${ty}" data-v="${v}" title="Add ${esc(S().BLOCKS[ty].label.toLowerCase())}: ${esc(v)}">${schem(ty, v)}<small>${esc(v)}</small></button>`).join('')}</span></div>`).join('')}`).join('');
  }
  const KEYS = [['?', 'These shortcuts'], ['Ctrl Z · Ctrl Shift Z', 'Undo · Redo'], ['Ctrl D', 'Duplicate the selected block'], ['Delete', 'Remove the selected block'], ['H', 'Hide or show the selected block'], ['Alt ↑ · Alt ↓', 'Move the selected block'], ['C', 'Comment mode'], ['1 · 2 · 3', 'Desktop · Tablet · Phone'], ['Ctrl S', 'Save a version'], ['Esc', 'Deselect, close']];
  function shortcuts() { const k = $('#wdz-keys'); k.hidden = !k.hidden; k.innerHTML = `<div class="wdz-keys-in"><p class="wdz-eyebrow">Keyboard shortcuts</p><dl>${KEYS.map(([a, b]) => `<dt><kbd>${esc(a)}</kbd></dt><dd>${esc(b)}</dd>`).join('')}</dl><button type="button" class="btn sm" data-wdz="keys">Close</button></div>`; }
  // Esc peels one layer: a popover, comment mode, the selection, then the designer itself (like the other full panes)
  function escape() {
    if (!root || root.hidden) return;
    for (const id of ['#wdz-dlmenu', '#wdz-keys', '#wdz-peek', '#wdz-picker']) { const x = $(id); if (x && !x.hidden) { x.hidden = true; return; } }
    if (st && st.cmode) return commentMode(false);
    if (st && st.sel) { st.sel = null; paint(); return; }
    close();
  }
  function keys(e) {
    const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const sb = st.sel && pageNow().blocks.find(b => b.id === st.sel.block), mod = e.ctrlKey || e.metaKey;
    if (e.key === '?') { e.preventDefault(); return shortcuts(); }
    if (e.key === 'Escape') return escape();
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return saveVersion(); }
    if (!mod && !e.altKey && /^[123]$/.test(e.key)) { st.dev = ['desktop', 'tablet', 'phone'][+e.key - 1]; return paint(); }
    if (!mod && e.key.toLowerCase() === 'c') return commentMode(!st.cmode);
    if (!sb) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); const r = S().duplicateBlock(st.cfg, st.page, sb.id); commit(r.cfg); st.sel = { block: r.block.id, path: '', kind: 'block' }; return paint(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.sel = null; return commit(S().removeBlock(st.cfg, st.page, sb.id)); }
    if (!mod && e.key.toLowerCase() === 'h') return commit(S().setHidden(st.cfg, st.page, sb.id, !sb.hidden));
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); return commit(S().moveBlock(st.cfg, st.page, sb.id, e.key === 'ArrowUp' ? 'up' : 'down')); }
  }

  // ---------- comments on sections -> tasks (feat/site-v2) ----------
  const CLOCAL = pid => `tribecode.sitedesigner.comments.${pid || 'local'}`;
  const tribeComments = () => !!(st.pid && connected());
  async function loadComments() {
    if (!st) return;
    if (tribeComments()) { try { st.comments = (await C.api(`/projects/${encodeURIComponent(st.pid)}/site-comments`)).comments || []; } catch { st.comments = []; } }
    else { try { st.comments = JSON.parse(localStorage.getItem(CLOCAL(st.pid)) || '[]'); } catch { st.comments = []; } }
    panelPaint(); postPins(); suggestTasks();
  }
  const saveLocalC = () => { try { localStorage.setItem(CLOCAL(st.pid), JSON.stringify(st.comments.slice(-200))); } catch {} };
  function postPins() {
    const f = $('#wdz-frame'); if (!f || !f.contentWindow || !st) return;
    const pg = pageNow(), list = st.comments.filter(c => c.status !== 'resolved' && pg.blocks.some(b => b.id === c.block));
    f.contentWindow.postMessage({ cm: st.cmode, pins: list.map(c => ({ id: c.id, block: c.block, x: c.x, y: c.y, text: c.text, status: c.status, n: st.comments.indexOf(c) + 1 })) }, '*');
  }
  function commentMode(on) {
    st.cmode = !!on; const b = $('#wdz-cmode'); if (b) b.setAttribute('aria-pressed', String(st.cmode));
    root.classList.toggle('is-cmode', st.cmode); postPins();
    if (st.cmode) { st.panel = 'comments'; panelPaint(); toast('Click a section to comment on it'); } else $('#wdz-cpop').hidden = true;
  }
  function commentAt(d) {
    const pop = $('#wdz-cpop'), fr = $('#wdz-frame').getBoundingClientRect(), b = pageNow().blocks.find(x => x.id === d.block); if (!b) return;
    const label = S().BLOCKS[b.type].label.replace(/ \(.*/, '') + (b.props.title ? ` · ${String(b.props.title).slice(0, 30)}` : '');
    pop.hidden = false; pop.style.left = Math.min(innerWidth - 300, fr.left + d.cx) + 'px'; pop.style.top = Math.min(innerHeight - 160, fr.top + d.cy + 8) + 'px';
    pop.innerHTML = `<form id="wdz-cform"><p class="wdz-eyebrow">Comment on ${esc(label)}</p><textarea class="input" id="wdz-ctext" rows="3" maxlength="600" placeholder="What should change? “Make this bigger”, “Wrong hours”…" aria-label="Your comment"></textarea><p class="wdz-row"><button type="submit" class="btn sm primary">Comment</button><button type="button" class="btn sm ghost" data-cact="cancel">Cancel</button></p></form>`;
    const ta = pop.querySelector('textarea'); ta.focus();
    pop.querySelector('form').onsubmit = async e => { e.preventDefault(); const text = ta.value.trim(); if (!text) return; pop.hidden = true; await addComment({ page: st.page, block: b.id, blockType: b.type, label, text, x: d.x, y: d.y }); };
    ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) pop.querySelector('form').requestSubmit(); if (e.key === 'Escape') pop.hidden = true; };
  }
  async function addComment(c) {
    if (tribeComments()) { try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/site-comments`, { method: 'POST', body: c }); st.comments.push(r.comment); } catch (e) { return say('Comment not saved: ' + e.message); } }
    else { st.comments.push({ ...c, id: 'c' + Date.now().toString(36), status: 'open', at: new Date().toISOString(), byName: 'You' }); saveLocalC(); }
    st.panel = 'comments'; panelPaint(); postPins(); suggestTasks();
  }
  function suggestTasks() {
    const open = st.comments.filter(c => c.status === 'open').length;
    if (open >= 3 && !st.suggested) { st.suggested = true; say(`There are ${open} open comments on the site. Want me to turn them into tasks, one per section?`, `<p class="wdz-row"><button type="button" class="btn sm primary" data-cact="tasks">Flint, turn these into tasks</button></p>`); }
  }
  async function commentAction(el) {
    const k = el.dataset.cact, id = el.dataset.id;
    if (k === 'cancel') { $('#wdz-cpop').hidden = true; return; }
    if (k === 'tasks') return turnIntoTasks();
    if (k === 'goto') { const c = st.comments.find(x => x.id === id); if (c) { if (c.page && st.cfg.pages.some(p => p.id === c.page)) st.page = c.page; st.sel = { block: c.block, path: '', kind: 'block' }; paint(); postSel(true); } return; }
    const c = st.comments.find(x => x.id === id); if (!c) return;
    if (tribeComments()) { try { if (k === 'del') await C.api(`/projects/${encodeURIComponent(st.pid)}/site-comments/${encodeURIComponent(id)}`, { method: 'DELETE' }); else { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/site-comments/${encodeURIComponent(id)}/${k}`, { method: 'POST', body: {} }); Object.assign(c, r.comment); } } catch (e) { return toast(e.message); } }
    else { if (k === 'resolve') c.status = 'resolved'; if (k === 'reopen') c.status = 'open'; saveLocalC(); }
    if (k === 'del') st.comments = st.comments.filter(x => x !== c);
    panelPaint(); postPins();
  }
  async function turnIntoTasks() {
    const open = st.comments.filter(c => c.status === 'open');
    if (!open.length) return say('No open comments to turn into tasks.');
    if (!tribeComments()) return say('Tasks belong to a tribe. Host or join one and the comments here become tasks for the team; for now they stay on this device.');
    await flush();
    let titles = null;
    const B = window.TribeBoost;   // with an AI on, it writes the task titles; the grouping per section stays the same
    try { if (B && await B.online() && window.TribeAIBasics && window.TribeAIBasics.ask && window.TribeAICore) { const g = window.TribeAICore.groupComments(open); const r = await window.TribeAIBasics.ask('site.comments', { groups: g.map(x => ({ section: x.label, comments: open.filter(c => x.ids.includes(c.id)).map(c => c.text) })), want: 'JSON {"titles": ["one short task title per group, starting with Website ·"]}' }, ''); const j = r && r.text ? JSON.parse((/\{[\s\S]*\}/.exec(r.text) || ['{}'])[0]) : null; if (j && Array.isArray(j.titles) && j.titles.length === g.length) titles = j.titles; } } catch {}
    try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/site-comments/tasks`, { method: 'POST', body: titles ? { titles } : {}, project: st.pid }); say(r.say + (titles ? ' ✦ titles by your AI.' : ' Basic · no AI: grouped per section.'), `<p class="wdz-row"><button type="button" class="btn sm" data-site="tasks">Open Tasks</button></p>`); await loadComments(); }
    catch (e) { say('Could not make the tasks: ' + e.message); }
  }
  function commentsPaint() {
    const box = $('#wdz-insp'); if (!box) return;
    const cs = st.comments.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)), open = cs.filter(c => c.status === 'open').length;
    box.innerHTML = `<p class="wdz-eyebrow">Comments${open ? ` · ${open} open` : ''}</p>${tribeComments() ? '' : '<p class="wdz-hint">On this device only. In a tribe, everyone sees them and Flint makes tasks.</p>'}
      <p class="wdz-row"><button type="button" class="btn sm${st.cmode ? ' primary' : ''}" data-wdz="comment" aria-pressed="${st.cmode}">${st.cmode ? 'Done commenting' : '+ Comment on a section'}</button>${open ? `<button type="button" class="btn sm" data-cact="tasks">Flint, turn these into tasks</button>` : ''}</p>
      ${cs.length ? `<ol class="wdz-clist">${cs.map(c => `<li class="wdz-c is-${esc(c.status)}" data-cmt="${esc(c.id)}"><button type="button" class="wdz-c-t" data-cact="goto" data-id="${esc(c.id)}"><span class="wdz-c-n">${st.comments.indexOf(c) + 1}</span><b>${esc(c.label || c.blockType || 'Section')}</b><span>${esc(c.text)}</span><small>${esc(c.byName || '')}${c.status === 'tasked' ? ' · a task' : c.status === 'resolved' ? ' · resolved' : ''}</small></button><span class="wdz-c-a">${c.status === 'resolved' ? `<button type="button" class="btn sm ghost" data-cact="reopen" data-id="${esc(c.id)}">Reopen</button>` : `<button type="button" class="btn sm ghost" data-cact="resolve" data-id="${esc(c.id)}">Resolve</button>`}<button type="button" class="btn sm ghost" data-cact="del" data-id="${esc(c.id)}" aria-label="Delete comment">×</button></span></li>`).join('')}</ol>` : '<p class="wdz-hint">No comments yet. Turn on Comment and click a section: “make this bigger”, “wrong hours”.</p>'}`;
  }

  // ---------- Site settings: SEO, social card, favicon, logo, language, fonts, spacing (feat/site-v2) ----------
  function sitePaint() {
    const box = $('#wdz-insp'); if (!box) return;
    const c = st.cfg, seo = c.seo || {}, FP = S().FONT_PAIRS, cur = Object.keys(FP).find(k => FP[k].display === c.theme.fonts.display && FP[k].body === c.theme.fonts.body) || '';
    box.innerHTML = `<p class="wdz-eyebrow">Site settings</p>
      <label class="wdz-f"><span>Site name</span><input class="input" data-seo="name" value="${esc(c.name)}"></label>
      <label class="wdz-f"><span>Page title (tab and search results)</span><input class="input" data-seo="title" maxlength="120" value="${esc(seo.title)}" placeholder="${esc(c.name)}"></label>
      <label class="wdz-f"><span>Description (search and link previews)</span><textarea class="input" rows="2" data-seo="description" maxlength="320" placeholder="One or two sentences about the site">${esc(seo.description)}</textarea></label>
      <p class="wdz-gprev" aria-label="Search preview"><b>${esc(seo.title || c.name)}</b><small>${esc(seo.description || 'Add a description so search results say what the site is.')}</small></p>
      <p class="wdz-row"><span class="wdz-lab">Logo</span>${c.logo ? `<img class="wdz-mini" src="${esc(c.logo)}" alt="">` : ''}<button type="button" class="btn sm" data-site="logo">${c.logo ? 'Change' : 'Add logo'}</button>${c.logo ? '<button type="button" class="btn sm ghost" data-site="nologo">Remove</button>' : ''}</p>
      <p class="wdz-row"><span class="wdz-lab">Favicon</span>${seo.favicon ? `<img class="wdz-mini" src="${esc(seo.favicon)}" alt="">` : ''}<button type="button" class="btn sm" data-site="favicon">${seo.favicon ? 'Change' : 'Add'}</button>${c.logo && seo.favicon !== c.logo ? '<button type="button" class="btn sm ghost" data-site="logofav">Use the logo</button>' : ''}</p>
      <p class="wdz-row"><span class="wdz-lab">Share image</span>${seo.image ? `<img class="wdz-mini wide" src="${esc(seo.image)}" alt="">` : ''}<button type="button" class="btn sm" data-site="share">${seo.image ? 'Change' : 'Add'}</button></p>
      <label class="wdz-f"><span>Language</span><select class="input" data-seo="lang">${[['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['ja', '日本語'], ['zh', '中文'], ['ko', '한국어']].map(([k, l]) => `<option value="${k}"${seo.lang === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="wdz-f"><span>Fonts</span><select class="input" data-site="fonts">${cur ? '' : '<option value="">The template’s own</option>'}${Object.entries(FP).map(([k, f]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(f.name)} · ${esc(f.display)}</option>`).join('')}</select></label>
      <p class="wdz-f"><span>Spacing between sections</span></p><p class="wdz-row" role="group" aria-label="Spacing">${['compact', 'normal', 'roomy'].map(k => `<button type="button" class="btn sm" data-site="space" data-val="${k}" aria-pressed="${(c.theme.space || 'normal') === k}">${k}</button>`).join('')}</p>
      <p class="wdz-row"><button type="button" class="btn sm" data-site="fill">Fill from the project</button><button type="button" class="btn sm ghost" data-site="importhtml" data-import="1">Import HTML…</button></p>
      ${c.credit ? `<p class="wdz-hint">Design credit (${esc(c.credit.license)}): “${esc(c.credit.text)}” is shown in the footer of every export, as its license asks.</p>` : ''}
      <p class="wdz-hint">No analytics or trackers are added to your site.</p>`;
    box.querySelectorAll('[data-seo]').forEach(i => i.addEventListener('change', () => { const k = i.dataset.seo; commit(k === 'name' ? { ...st.cfg, name: i.value.trim() || st.cfg.name } : S().setSeo(st.cfg, { [k]: i.value.trim() })); }));
    const fs = box.querySelector('[data-site="fonts"]'); fs.addEventListener('change', () => fs.value && commit(S().setFonts(st.cfg, fs.value)));
  }
  let picFor = null;
  async function siteAction(el) {
    const k = el.dataset.site;
    if (k === 'tasks') { close(); try { window.TribeShell && window.TribeShell.go ? window.TribeShell.go('tasks') : (location.hash = '#/tasks/board'); } catch {} return; }
    if (k === 'space') return commit(S().setSpace(st.cfg, el.dataset.val));
    if (k === 'nologo') return commit(S().setLogo(st.cfg, '', false));
    if (k === 'logofav') return commit(S().setSeo(st.cfg, { favicon: st.cfg.logo }));
    if (k === 'logo' || k === 'favicon' || k === 'share') { picFor = k; fileFor = null; const f = $('#wdz-file'); f.value = ''; f.click(); return; }
    if (k === 'fill') { const r = await autofill(st.cfg); commit(r.cfg); fillNote(r.used); if (!r.used.length) say('The project has nothing to fill in yet: give it a bio, a vision doc, members or tasks.'); return; }
  }

  // ---------- the template gallery (feat/site-v2): thumbnails, categories, search, Use this, a larger peek ----------
  const gal = { list: [], cats: [], cat: 'All', q: '', hov: null, ht: 0 };
  async function loadGallery() {
    if (gal.list.length) return;
    try { const r = await fetch('sitetpl/catalog.json'); if (r.ok) { const j = await r.json(); gal.list = j.templates || []; gal.cats = j.categories || []; } } catch {}
    if (!gal.list.length && connected()) { try { const j = await C.api('/site-designer/templates'); gal.list = j.templates || []; gal.cats = j.categories || []; } catch {} }
    if (!gal.list.length) gal.list = S().TEMPLATES.map(id => ({ id, title: id.charAt(0).toUpperCase() + id.slice(1), summary: '', category: '' }));
  }
  function galPaint() {
    const box = $('#wdz-gal'); if (!box) return;
    const q = gal.q.trim().toLowerCase();
    const list = gal.list.filter(t => (gal.cat === 'All' || t.category === gal.cat) && (!q || `${t.title} ${t.summary} ${t.category} ${(t.tags || []).join(' ')} ${t.source || ''}`.toLowerCase().includes(q)));
    $('#wdz-gcats').innerHTML = ['All', ...gal.cats].map(c => `<button type="button" class="wdz-chip" data-gcat="${esc(c)}" aria-pressed="${c === gal.cat}">${esc(c)}</button>`).join('');
    box.innerHTML = list.length ? list.map(t => `<div class="wdz-tpl" data-tpl="${esc(t.id)}" data-title="${esc(t.title)}" role="button" tabindex="0" aria-label="Use the ${esc(t.title)} template"><span class="wdz-tthumb">${t.thumb ? `<img src="${esc(t.thumb)}" alt="" loading="lazy" width="480" height="360">` : ''}</span><b>${esc(t.title)}</b><small>${esc(t.summary)}</small><span class="wdz-tmeta"><span class="wdz-tcat">${esc(t.category || '')}</span>${t.source && t.source !== 'TribeCode' ? `<span class="wdz-tsrc" title="${esc(t.source)} · ${esc(t.license)}">${esc(t.license)}</span>` : ''}</span><span class="wdz-tact"><button type="button" class="btn sm primary" data-tpl="${esc(t.id)}" data-title="${esc(t.title)}">Use this</button><button type="button" class="btn sm ghost" data-peek="${esc(t.id)}">Peek</button></span></div>`).join('') : `<p class="wdz-hint">No template matches “${esc(gal.q)}”. Try another word, or start blank.</p>`;
    box.querySelectorAll('img').forEach(i => { i.onerror = () => i.remove(); });
    $('#wdz-gcount').textContent = `${list.length} of ${gal.list.length}`;
  }
  async function peek(id, hover) {
    const t = gal.list.find(x => x.id === id), pk = $('#wdz-peek'); if (!t) return;
    pk.hidden = false; pk.innerHTML = `<div class="wdz-peek-in"><p class="wdz-row"><b>${esc(t.title)}</b><span class="wdz-hint">${esc(t.category || '')}${t.source && t.source !== 'TribeCode' ? ` · from ${esc(t.source)} (${esc(t.license)})` : ''}</span><span class="wdz-sp"></span><button type="button" class="btn sm primary" data-tpl="${esc(t.id)}" data-title="${esc(t.title)}">Use this</button><button type="button" class="btn sm ghost" data-peekclose="1" aria-label="Close preview">Close</button></p><div class="wdz-peek-f"><iframe title="Preview of ${esc(t.title)}" sandbox="" loading="lazy"></iframe></div></div>`;
    const c = await templateCfg(id); if (!c || pk.hidden) return;
    const fonts = file => FONTS.get(file) || ''; if (!fontsAsked) loadFonts();
    pk.querySelector('iframe').srcdoc = S().render(c, { fonts });
    if (hover) pk.querySelector('.wdz-peek-in').addEventListener('mouseleave', () => { pk.hidden = true; }, { once: true });
  }
  async function onImport(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!window.TribeSiteImport) return say('The importer is not loaded here.');
    const r = window.TribeSiteImport.fromHtml(await f.text(), { name: f.name.replace(/\.html?$/i, '') });
    commit(r.cfg); st.page = st.cfg.pages[0].id; hideStart(); paint();
    say(`Imported ${f.name}: ${r.report.length} sections became blocks (${[...new Set(r.cfg.pages[0].blocks.map(b => b.type))].join(', ')}). Pictures are placeholders: click one to put yours in. Undo brings back what you had.`);
  }

  // ---------- the inspector: the selected block, button or picture ----------
  function sectionOptions() { const out = []; st.cfg.pages.forEach(p => p.blocks.forEach(b => { if (b.type !== 'footer') out.push([`section:${b.id}`, `${p.title} › ${S().BLOCKS[b.type].label.replace(/ \(.*/, '')}${b.props.title ? ` (${String(b.props.title).slice(0, 24)})` : ''}`]); })); return out; }
  function inspector() {
    const box = $('#wdz-insp'); if (!box) return;
    const s = st.sel, pg = pageNow(), b = s && pg.blocks.find(x => x.id === s.block);
    if (!b) { box.innerHTML = `<p class="wdz-eyebrow">Edit</p><p class="wdz-hint">Click anything in the preview. Words: click and type. Buttons: pick where they go. Pictures: replace, round or square.</p>`; return; }
    const BL = S().BLOCKS[b.type];
    if (s.kind === 'button') {
      const h = S().getAt(b.props, s.path) || {}, l = h.link || {}, val = l.kind === 'page' ? `page:${l.to}` : l.kind === 'section' ? `section:${l.to}` : l.kind || '';
      box.innerHTML = `<p class="wdz-eyebrow">Button</p><label class="wdz-f"><span>Text</span><input class="input" data-lab="${esc(s.path)}" value="${esc(h.label || '')}"></label>
        <label class="wdz-f"><span>Goes to</span><select class="input" id="wdz-link"><option value="">Not linked yet</option><optgroup label="Pages">${st.cfg.pages.map(p => `<option value="page:${p.slug}"${val === 'page:' + p.slug ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</optgroup><optgroup label="Sections">${sectionOptions().map(([v, t]) => `<option value="${v}"${val === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</optgroup><option value="url"${val === 'url' ? ' selected' : ''}>A web address…</option><option value="email"${val === 'email' ? ' selected' : ''}>An email address…</option></select></label>
        <label class="wdz-f" id="wdz-link-to-w"${/^(url|email)$/.test(val) ? '' : ' hidden'}><span>${val === 'email' ? 'Email' : 'Address'}</span><input class="input" id="wdz-link-to" value="${esc(/^(url|email)$/.test(val) ? l.to : '')}" placeholder="${val === 'email' ? 'you@example.com' : 'https://'}"></label>
        <p class="wdz-hint">Or tell Flint: “link this button to the contact page”.</p>`;
      box.querySelector('#wdz-link').addEventListener('change', e => { const v = e.target.value; if (v === 'url' || v === 'email') { box.querySelector('#wdz-link-to-w').hidden = false; box.querySelector('#wdz-link-to').focus(); return; } const [k, to] = v ? [v.split(':')[0], v.slice(v.indexOf(':') + 1)] : ['', '']; commit(S().setLink(st.cfg, st.page, b.id, s.path, { kind: k, to })); });
      box.querySelector('#wdz-link-to').addEventListener('change', e => commit(S().setLink(st.cfg, st.page, b.id, s.path, { kind: box.querySelector('#wdz-link').value, to: e.target.value.trim() })));
      box.querySelector('[data-lab]').addEventListener('change', e => commit(S().setProp(st.cfg, st.page, b.id, s.path + '.label', e.target.value)));
      return;
    }
    if (s.kind === 'image') {
      const src = S().getAt(b.props, s.path + 'img'), alt = S().getAt(b.props, s.path + 'alt') || '', shape = S().getAt(b.props, s.path + 'shape') || '';
      box.innerHTML = `<p class="wdz-eyebrow">Picture</p>${src ? `<img class="wdz-thumb${shape === 'round' ? ' round' : ''}" src="${esc(src)}" alt="">` : '<p class="wdz-hint">No picture yet: a placeholder shows.</p>'}
        <p class="wdz-row"><button type="button" class="btn sm primary" data-img="upload">Upload</button><button type="button" class="btn sm" data-img="board">From my board</button></p>
        <p class="wdz-row" role="group" aria-label="Shape"><button type="button" class="btn sm" data-img="round" aria-pressed="${shape === 'round'}">Round</button><button type="button" class="btn sm" data-img="square" aria-pressed="${shape === 'square'}">Square</button><button type="button" class="btn sm ghost" data-img="none">Original</button></p>
        <label class="wdz-f"><span>Alt text (what it shows)</span><input class="input" id="wdz-alt" value="${esc(alt)}" placeholder="Mara at the wheel, glazing a mug"></label><div id="wdz-board" class="wdz-board" hidden></div>`;
      box.querySelector('#wdz-alt').addEventListener('change', e => commit(S().setImage(st.cfg, st.page, b.id, s.path, src, e.target.value.trim())));
      return;
    }
    const strings = Object.entries(b.props).filter(([k, v]) => typeof v === 'string' && !/^(img|alt|shape)$/.test(k));
    const lists = Object.entries(b.props).filter(([, v]) => Array.isArray(v));
    box.innerHTML = `<p class="wdz-eyebrow">${esc(BL.label)}</p>
      <p class="wdz-f"><span>Layout</span></p><p class="wdz-row wdz-vars" role="group" aria-label="Layout">${BL.variants.map(v => `<button type="button" class="btn sm" data-var="${v}" aria-pressed="${v === b.variant}">${esc(v)}</button>`).join('')}</p>
      ${strings.map(([k, v]) => `<label class="wdz-f"><span>${esc(k === 'url' ? 'Video or embed link' : k === 'action' ? 'Form link (Formspree, Google Forms…)' : k)}</span>${v.length > 70 || k === 'text' || k === 'bio' ? `<textarea class="input" rows="3" data-prop="${k}">${esc(v)}</textarea>` : `<input class="input" data-prop="${k}" value="${esc(v)}">`}</label>`).join('')}
      ${lists.map(([k, v]) => `<p class="wdz-row wdz-list"><span>${esc(k)}: ${v.length}</span><button type="button" class="btn sm" data-item="add" data-k="${k}">+ Add</button><button type="button" class="btn sm ghost" data-item="del" data-k="${k}"${v.length ? '' : ' disabled'}>− Remove last</button></p>`).join('')}
      ${'img' in b.props ? `<p class="wdz-row"><button type="button" class="btn sm" data-selimg="1">Picture…</button></p>` : ''}`;
    box.querySelectorAll('[data-prop]').forEach(i => i.addEventListener('change', () => commit(S().setProp(st.cfg, st.page, b.id, i.dataset.prop, i.value))));
  }
  function itemTemplate(b, k) { const d = S().BLOCKS[b.type].make(st.cfg.name)[k]; const last = (b.props[k] || []).slice(-1)[0]; return JSON.parse(JSON.stringify(last || (d && d[0]) || { label: 'New', link: { kind: '', to: '' } })); }

  // ---------- clicks ----------
  async function onClick(e) {
    const t = e.target, a = t.closest('[data-wdz]'), pg = pageNow();
    if (t.closest('[data-peek]')) { peek(t.closest('[data-peek]').dataset.peek); return; }
    if (t.closest('[data-tpl]')) { const x = t.closest('[data-tpl]'); const pk = $('#wdz-peek'); if (pk) pk.hidden = true; await useTemplate(x.dataset.tpl); say(`Started from the ${x.dataset.title || 'chosen'} template. Undo brings back what you had.`); return; }
    if (t.closest('[data-start="blank"]')) { hideStart(); paint(); return; }
    if (t.closest('[data-page]') && !a) { st.page = t.closest('[data-page]').dataset.page; st.sel = null; frameScroll = 0; paint(); return; }
    if (t.closest('[data-dev]') && t.closest('.wdz-devs')) { st.dev = t.closest('[data-dev]').dataset.dev; paint(); return; }
    if (t.closest('[data-pick]')) { st.sel = { block: t.closest('[data-pick]').dataset.pick, path: '', kind: 'block' }; paint(); postSel(true); return; }
    if (t.closest('[data-move]')) { const x = t.closest('[data-move]'); commit(S().moveBlock(st.cfg, st.page, x.dataset.id, x.dataset.move)); return; }
    if (t.closest('[data-del]')) { commit(S().removeBlock(st.cfg, st.page, t.closest('[data-del]').dataset.del)); return; }
    if (t.closest('[data-add]')) { const x = t.closest('[data-add]'); const r = S().addBlock(st.cfg, st.page, x.dataset.add, x.dataset.v); commit(r.cfg); st.sel = { block: r.block.id, path: '', kind: 'block' }; $('#wdz-picker').hidden = true; paint(); postSel(true); return; }
    if (t.closest('[data-var]') && st.sel) { commit(S().setVariant(st.cfg, st.page, st.sel.block, t.closest('[data-var]').dataset.var)); return; }
    if (t.closest('[data-item]') && st.sel) {
      const x = t.closest('[data-item]'), b = pg.blocks.find(y => y.id === st.sel.block); if (!b) return;
      const list = (b.props[x.dataset.k] || []).slice(); if (x.dataset.item === 'add') list.push(itemTemplate(b, x.dataset.k)); else list.pop();
      commit(S().setProp(st.cfg, st.page, b.id, x.dataset.k, list)); return;
    }
    if (t.closest('[data-selimg]') && st.sel) { st.sel = { block: st.sel.block, path: '', kind: 'image' }; inspector(); postSel(true); return; }
    if (t.closest('[data-img]') && t.closest('#wdz-insp') && st.sel) {
      const k = t.closest('[data-img]').dataset.img, s = st.sel;
      if (k === 'upload') return pickFile();
      if (k === 'board') return board();
      commit(k === 'none' ? S().setProp(st.cfg, st.page, s.block, s.path + 'shape', '') : S().imageShape(st.cfg, st.page, s.block, s.path, k)); return;
    }
    if (t.closest('[data-boardpick]')) { const src = await toData(t.closest('[data-boardpick]').dataset.boardpick); if (src && st.sel) { commit(S().setImage(st.cfg, st.page, st.sel.block, st.sel.path, src, t.closest('[data-boardpick]').dataset.alt || '')); say('Used the picture from your board. Undo puts the old one back.'); } return; }
    if (t.closest('[data-dup]')) { const r = S().duplicateBlock(st.cfg, st.page, t.closest('[data-dup]').dataset.dup); commit(r.cfg); st.sel = { block: r.block.id, path: '', kind: 'block' }; paint(); return; }
    if (t.closest('[data-hide]')) { const id = t.closest('[data-hide]').dataset.hide, b = pg.blocks.find(x => x.id === id); commit(S().setHidden(st.cfg, st.page, id, !(b && b.hidden))); return; }
    if (t.closest('[data-panel]')) { st.panel = t.closest('[data-panel]').dataset.panel; panelPaint(); return; }
    if (t.closest('[data-cf]')) return resolveConflict(t.closest('[data-cf]').dataset.cf);
    if (t.closest('[data-fill]')) { const k = t.closest('[data-fill]').dataset.fill; $('#wdz-fill').hidden = true; if (k === 'blank' && st.unfilled) { commit(JSON.parse(st.unfilled)); say('Started from the template as it is, with nothing filled in from the project. Undo brings the filled version back.'); } return; }
    if (t.closest('[data-sty]') && st.sel) { const x = t.closest('[data-sty]'); commit(S().setStyle(st.cfg, st.page, st.sel.block, { [x.dataset.sty]: x.dataset.val })); return; }
    if (t.closest('[data-cact]')) return commentAction(t.closest('[data-cact]'));
    if (t.closest('[data-site]')) return siteAction(t.closest('[data-site]'));
    if (t.closest('[data-gcat]')) { gal.cat = t.closest('[data-gcat]').dataset.gcat; galPaint(); return; }
    if (t.closest('[data-peek]')) { peek(t.closest('[data-peek]').dataset.peek); return; }
    if (t.closest('[data-peekclose]')) { const pk = $('#wdz-peek'); if (pk) pk.hidden = true; return; }
    if (t.closest('[data-import]')) { const f = $('#wdz-import'); f.value = ''; f.click(); return; }
    if (!a) { if (!t.closest('.wdz-dl')) $('#wdz-dlmenu').hidden = true; return; }
    const k = a.dataset.wdz;
    if (k === 'close') return close();
    if (k === 'undo') return undo();
    if (k === 'redo') return redo();
    if (k === 'mode') return commit(S().setMode(st.cfg, st.cfg.theme.mode === 'dark' ? 'light' : 'dark'));
    if (k === 'addpage') { const r = S().addPage(st.cfg, ''); commit(r.cfg); st.page = r.page.id; paint(); say(`Added ${r.page.title}. Rename it: “rename this page to About”.`); return; }
    if (k === 'picker') { const p = $('#wdz-picker'); p.hidden = !p.hidden; a.setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) p.innerHTML = picker(); if (false) p.innerHTML = S().TYPES.map(ty => `<div class="wdz-pk"><b>${esc(S().BLOCKS[ty].label)}</b><span>${S().BLOCKS[ty].variants.map(v => `<button type="button" class="wdz-chip" data-add="${ty}" data-v="${v}">${esc(v)}</button>`).join('')}</span></div>`).join(''); return; }
    if (k === 'templates') return showStart(true);
    if (k === 'dlmenu') { const m = $('#wdz-dlmenu'); m.hidden = !m.hidden; a.setAttribute('aria-expanded', String(!m.hidden)); return; }
    if (k === 'dl-html' || k === 'dl-zip') { $('#wdz-dlmenu').hidden = true; return download(k === 'dl-zip' ? 'zip' : 'html'); }
    if (k === 'publish') { $('#wdz-dlmenu').hidden = true; return publish(); }
    if (k === 'freeai') return window.TribeAIBridge && window.TribeAIBridge.open({ src: 'site', goal: 'Improve this website' });   // feat/agents-free
    if (k === 'save') return saveVersion();
    if (k === 'comment') return commentMode(!st.cmode);
    if (k === 'keys') return shortcuts();
  }
  function dragList() {
    let from = null;
    root.addEventListener('dragstart', e => { const li = e.target.closest && e.target.closest('.wdz-blk'); if (!li) return; from = li.dataset.blk; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', from); } catch {} li.classList.add('is-drag'); });
    root.addEventListener('dragover', e => { if (from && e.target.closest && e.target.closest('.wdz-blk')) e.preventDefault(); });
    root.addEventListener('drop', e => { const li = e.target.closest && e.target.closest('.wdz-blk'); if (!from || !li) return; e.preventDefault(); const to = +li.dataset.i; const id = from; from = null; commit(S().moveBlock(st.cfg, st.page, id, to)); });
    root.addEventListener('dragend', () => { from = null; root.querySelectorAll('.is-drag').forEach(x => x.classList.remove('is-drag')); });
  }

  // ---------- pictures ----------
  let fileFor = null;
  function pickFile() { fileFor = st.sel ? { ...st.sel } : null; const f = $('#wdz-file'); f.value = ''; f.click(); }
  async function onFile(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (picFor) { const k = picFor; picFor = null; if (file.size > 4 * 1024 * 1024) return say('That picture is over 4 MB. Try a smaller one.'); const src = await shrink(file); commit(k === 'logo' ? S().setLogo(st.cfg, src) : S().setSeo(st.cfg, k === 'favicon' ? { favicon: src } : { image: src })); say(k === 'logo' ? 'Logo added: it is in the header and is the tab icon too.' : k === 'favicon' ? 'Favicon set.' : 'Share image set: it shows when someone posts the link (after you publish to a real address).'); st.panel = 'site'; panelPaint(); return; }
    if (!fileFor) return;
    if (file.size > 12 * 1024 * 1024) return say('That picture is over 12 MB. Try a smaller one.');
    const src = await shrink(file);
    commit(S().setImage(st.cfg, st.page, fileFor.block, fileFor.path, src, S().getAt(pageNow().blocks.find(b => b.id === fileFor.block).props, fileFor.path + 'alt') || file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')));
    say(`Used ${file.name}. It is stored inside the site, so the HTML export works on its own. Add alt text so everyone knows what it shows.`);
  }
  function shrink(file) {   // pictures go into the config as data URLs: keep them small (longest side 1400px)
    return new Promise(res => {
      const r = new FileReader(); r.onload = () => {
        const src = r.result; if (/svg|gif/.test(file.type)) return res(src);
        const im = new Image(); im.onload = () => { const k = Math.min(1, 1400 / Math.max(im.width, im.height)); if (k === 1 && file.size < 400 * 1024) return res(src); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86)); };
        im.onerror = () => res(src); im.src = src;
      }; r.readAsDataURL(file);
    });
  }
  async function board() {
    const box = $('#wdz-board'); if (!box) return;
    box.hidden = false; box.innerHTML = '<p class="wdz-hint">Loading your board…</p>';
    let items = [];
    try { const pid = st.pid; const [a, b] = await Promise.all([pid ? C.api('/inspo?project=' + encodeURIComponent(pid)).catch(() => ({})) : {}, C.api('/inspo?board=me').catch(() => ({}))]); items = [...(a.items || []), ...(b.items || [])]; } catch {}
    const pics = items.filter(x => (x.kind || 'image') === 'image' && x.thumb).map(x => ({ src: /^\/api\//.test(x.thumb) ? C.base() + x.thumb : x.thumb, alt: x.title || x.name || '' }));
    box.innerHTML = pics.length ? `<p class="wdz-hint">Pick one from your inspiration board:</p><div class="wdz-bgrid">${pics.slice(0, 12).map(p => `<button type="button" data-boardpick="${esc(p.src)}" data-alt="${esc(p.alt)}" aria-label="${esc(p.alt || 'A picture from the board')}"><img src="${esc(p.src)}" alt=""></button>`).join('')}</div>` : `<p class="wdz-hint">Your board has no pictures yet. <button type="button" class="linkish" data-wdz-board-open>Open the inspiration board</button></p>`;
    const o = box.querySelector('[data-wdz-board-open]'); if (o) o.onclick = () => window.TribeInspoBoard && window.TribeInspoBoard.open({});
  }
  async function toData(src) {
    if (/^data:/.test(src)) return src;
    try { const r = await fetch(src); const b = await r.blob(); return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); } catch { return ''; }
  }

  // ---------- export, publish, versions ----------
  function blobDownload(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  async function download(kind) {
    const slug = S().slugify(st.cfg.name);
    if (kind !== 'zip') { const html = S().exportFiles(st.cfg, 'html')['index.html']; blobDownload(new Blob([html], { type: 'text/html' }), 'index.html'); say('Downloaded index.html: one standalone file with every page and its pictures. Open it in any browser, or put it on any host.'); return html; }
    const ex = S().exportFiles(st.cfg, 'zip'), files = Object.entries(ex.files);
    for (const a of ex.assets) { const b = S().dataToBytes(a.src); if (b) files.push([a.path, b]); }
    for (const f of ex.fonts) for (const n of [f.file, f.license]) { try { const r = await fetch('assets/site-fonts/' + n); if (r.ok) files.push(['fonts/' + n, new Uint8Array(await r.arrayBuffer())]); } catch {} }
    if (!window.TribeExport || !window.TribeExport.zip) return say('The zip writer is not loaded here. Download index.html instead.');
    blobDownload(window.TribeExport.zip(files, 'application/zip'), `${slug}-site.zip`);
    say(`Downloaded ${slug}-site.zip: ${Object.keys(ex.files).filter(f => /\.html$/.test(f)).length} pages, ${ex.assets.length} pictures in assets/, the fonts, and site.json to open it again.`);
    return files.map(f => f[0]);
  }
  async function publish() {
    if (!st.pid || !connected()) return say('Publishing writes to a project. Download HTML works anywhere.');
    await flush(); try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/site-config/publish`, { method: 'POST', body: {} }); say(`Published ${r.files.filter(f => /\.html$/.test(f)).length} pages to ${r.dir}.`); } catch (e) { say(e.message); }
  }
  async function saveVersion() {
    if (!st.pid || !connected()) { try { localStorage.setItem(LOCAL + '.v', JSON.stringify(st.cfg)); } catch {} return say('Saved this design on this device.'); }
    st.dirty = true; if (!(await push())) return say('Not saved: sort out the newer version first.');
    try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/website/versions`, { method: 'POST', body: { note: `Designer · ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` } }); say('Saved to Saved designs. Restore it any time from Preview › Saved or Files › Website.'); return r; } catch (e) { say(e.message); }
  }

  // ---------- the start screen: 16 templates or blank ----------
  async function showStart(fromBar) {
    const box = $('#wdz-start'); box.hidden = false;
    box.innerHTML = `<div class="wdz-start-in"><p class="wdz-eyebrow">Website</p><h2>Start from a template</h2><p class="wdz-hint">Every template is blocks you can change, wire and export.${st.pid ? ' Inside a project it fills in what TribeCode knows: the name, the team, hours from chat, your board’s colors.' : ''} Or tell Flint what the site is for.</p>
      <div class="wdz-gbar"><input class="input" id="wdz-gq" type="search" placeholder="Search templates: bakery, portfolio, link in bio…" aria-label="Search templates" value="${esc(gal.q)}"><span class="wdz-hint" id="wdz-gcount"></span><button type="button" class="btn sm" data-start="blank">${fromBar ? 'Keep my design' : 'Start blank'}</button><button type="button" class="btn sm ghost" data-import="1">Import HTML…</button></div>
      <div class="wdz-gcats" id="wdz-gcats" role="group" aria-label="Categories"></div>
      <div class="wdz-tpls" id="wdz-gal"><p class="wdz-hint">Loading templates…</p></div>
      <p class="wdz-hint">Templates from Start Bootstrap and Tailwind Toolbox (MIT) and HTML5 UP (CC BY 3.0, credited in the footer) are converted into blocks; see docs/SITE-TEMPLATES.md.</p></div>`;
    await loadGallery(); galPaint();
  }
  function hideStart() { const b = $('#wdz-start'); if (b) b.hidden = true; }

  // ---------- Flint ----------
  // feat/flint-unify: Flint here is the same chat as everywhere (TribeFlint.mount, ctx designer): the thread is this
  // design's log (st.log), so it follows the design's undo history; anything that is not a site edit goes to Flint's
  // full brain and its reply lands in this thread too.
  let fui = null, chipKey = '';
  function mountFlint() {
    const host = $('#wdz-flint'); if (!host || fui || !window.TribeFlint || !window.TribeFlint.mount) return;
    fui = window.TribeFlint.mount(host, { ctx: 'designer', echo: false, run: text => ask(text).then(() => true), onSay: m => { if (st) { st.log.push(m); logPaint(); } }, onClear: () => { if (st) { st.log = []; st.pending = null; logPaint(); } },
      hello: 'Say what to change: “add a link for my book club”, “make the buttons work”, “add a page called About”, “dark mode”. No AI needed, and Undo takes back any step.', chips: chipsNow, onEscape: () => escape() });
  }
  function chipsNow() {
    if (!st) return [];
    const links = st.cfg.pages.some(p => p.blocks.some(b => b.type === 'links')), sel = st.sel && pageNow().blocks.find(b => b.id === st.sel.block);
    if (sel && st.sel.kind === 'image') return ['Replace the picture', 'Make the picture round', 'Add a gallery'];
    if (sel) return [`Move this section up`, `Make this section teal`, 'Center the text in this section', 'Hide this section'];
    if (links) return ['Add a link for…', 'Add my Instagram', 'Make the buttons work', 'Dark mode', 'Rounder corners'];
    return ['Make the buttons work', 'Add a page called About', 'Add a link for…', 'Dark mode', 'Add a gallery', 'Make the picture round'];
  }
  function say(text, extra, acts) { st.log.push({ who: 'flint', text, html: extra || '', acts: acts || [] }); logPaint(); return text; }
  function logPaint() {
    if (!fui) mountFlint(); if (!fui || !st) return;
    st.log = st.log.slice(-40); fui.set(st.log);
    const k = chipsNow().join('|'); if (k !== chipKey) { chipKey = k; fui.chips(chipsNow()); }
  }
  const FMX = () => window.TribeFlintMax;
  const undoAct = () => ({ label: 'Undo', fn: () => { if (undo()) say('Undone.'); } });
  const chipActs = l => (l || []).map(c => /…$/.test(c) ? { label: c, act: 'fill', arg: c.replace(/…$/, '').replace(/^Paste the link$/, '') } : { label: c, act: 'ask', arg: c });
  const ctxNow = () => ({ view: 'site', site: true, start: !$('#wdz-start').hidden || (!st.hist.length && !st.log.some(m => m.who === 'flint' && m.text)), pages: st.cfg.pages.map(p => p.title), selection: !!st.sel });
  const LEAVE = /^(?:leave it(?: for now)?|skip(?: it)?|later|not now|never ?mind|no thanks|nah|no)\b/i;
  // the one question asked after an edit ("What’s the address?"): a link, an email, a handle, a page or words
  async function answerPending(text, NL) {
    const pend = st.pending; st.pending = null;
    if (LEAVE.test(text)) { say(`OK, “${pend.label || 'it'}” stays without ${pend.kind === 'text' ? 'an answer' : 'an address'} for now. Click it in the preview any time.`); return true; }
    const P0 = NL ? NL.parse(text, ctxNow()) : { steps: [] }, sure = (P0.steps || []).some(x => x.intent && x.conf >= 0.6 && !/^(?:help\.kb|find)$/.test(x.intent));
    const looks = /(?:https?:\/\/|www\.|@|\.[a-z]{2,6}\b|^\+?\d[\d\s().-]{5,}$)/i.test(text) || /^(?:link it to|to)\s+the\s+\w+/i.test(text);
    if (sure && !looks) return false;
    const r = S().answer(st.cfg, pend, text);
    if (r && r.relabel) { await runSteps([{ intent: 'site.link.add', slots: { label: r.relabel.replace(/^./, ch => ch.toUpperCase()) }, conf: 1, text }], text); return true; }
    if (r && r.cfg) { const before = JSON.stringify(st.cfg); commitAll(before, S().normalize(r.cfg)); if (r.sel) st.sel = { block: r.sel.block, path: r.sel.path || '', kind: 'block' }; say(r.say, '', [undoAct()]); paint(); postSel(true); return true; }
    if (!sure) { st.pending = pend; say(pend.kind === 'email' ? 'That doesn’t look like an email address. Type one like hello@example.com, or say “leave it”.' : pend.kind === 'phone' ? 'Type the number with its digits, or say “leave it”.' : pend.kind === 'handle' ? `Type the ${pend.label} handle, like @yourname, or paste the link.` : `Paste a link (like https://…), an email, or say a page, like “the contact page”. Or “leave it”.`, '', chipActs(['Leave it for now'])); return true; }
    return false;
  }
  async function ask(text) {
    if (!st) return '';
    st.log.push({ who: 'me', text }); logPaint();
    const startShown = !$('#wdz-start').hidden;
    const NL = window.TribeNLU;
    if (st.pending && await answerPending(text, NL)) return st.log[st.log.length - 1].text || '';
    const P = NL ? NL.parse(text, ctxNow()) : { steps: [] };
    const steps = (P.steps || []).filter(s => s.intent && s.conf >= 0.6);
    if (startShown) hideStart();
    if (!steps.length || steps.length < (P.steps || []).length && !steps.some(s => /^site\./.test(s.intent))) {
      if (NL && NL.needsAI && !NL.needsAI(text) && NL.clarify) {   // feat/flint-unify: ask, don't shrug
        const alts = ((P.steps[0] || {}).alts || P.alts || []).map(a => a.example).filter(Boolean);
        const q = NL.clarify(text, { view: 'designer' });
        const chips = q.chips.map(c => c.fill ? { label: c.label, act: 'fill', arg: c.say } : { label: c.label, act: 'ask', arg: c.say });
        return say(q.q, '', chips.slice(0, 4));
      }
      return boost(text);
    }
    return runSteps(steps, text);
  }
  async function runSteps(steps, text) {
    const before = JSON.stringify(st.cfg); let work = st.cfg; const said = []; let asked = null, chips = null, handed = false;
    const done = [], acts = []; let html = '';   // feat/flint-max: what to repeat elsewhere, Flint's swatches and tappable ideas
    for (const s of steps) {
      if (s.intent === 'undo') { if (work !== st.cfg) { st.cfg = work; } undo(); work = st.cfg; said.push(st.hist.length || st.fut.length ? 'Undone.' : 'Nothing to undo.'); continue; }
      if (s.intent === 'redo') { redo(); work = st.cfg; said.push('Redone.'); continue; }
      if (s.intent === 'lesson' && window.TribeFlintLessons) { window.TribeFlintLessons.open(s.slots.feature); said.push('Opened the lesson.'); continue; }
      if (/^site\.(hours|autofill)$/.test(s.intent) && st.pid) await loadFacts();
      // feat/flint-max: "do the same on the about page" replays the last edits there (one Undo with the rest)
      if (s.intent === 'site.same') {
        const want = String(s.slots.page || '').toLowerCase(), pgx = work.pages.find(p => p.title.toLowerCase() === want || p.slug === want) || work.pages.find(p => p.title.toLowerCase().includes(want));
        if (!pgx) { said.push(`There is no ${s.slots.page} page. Say “add a page called ${s.slots.page}” first.`); continue; }
        if (!(st.lastSteps || []).length) { said.push('Do what? Make a change first, then say “do the same on the ' + pgx.title + ' page”.'); continue; }
        st.page = pgx.id; let n = 0;
        for (const ls of st.lastSteps) { const rr = (FMX() && FMX().site(work, ls, { page: pgx.id, sel: null }, S())) || S().command(work, ls, { page: pgx.id, sel: null, facts: st.facts }); if (rr && rr.cfg) { work = S().normalize(rr.cfg); n++; } }
        said.push(n ? `Did the same on ${pgx.title}: ${st.lastSteps.map(x => x.text).join(', then ')}.` : `Nothing to repeat on ${pgx.title}.`); continue;
      }
      const rx = FMX() && /^site\./.test(s.intent) ? FMX().site(work, s, { page: st.page, sel: st.sel }, S()) : undefined;
      const r = rx !== undefined ? rx : /^site\./.test(s.intent) ? S().command(work, s, { page: st.page, sel: st.sel, facts: st.facts }) : null;
      if (r && r.cfg && !/^site\.(?:same|headlines|cta|readability)$/.test(s.intent)) done.push(s);
      if (r && r.html) html += r.html; if (r && r.acts) acts.push(...r.acts);
      if (!r) {
        // not a site edit: Flint's full brain does it (a task, a message, the theme, a question), replying right here
        if (!/^(build\.|canvas\.|edit\.)/.test(s.intent) && fui) { commitAll(before, work); if (said.length) { say(said.filter(Boolean).join(' ')); said.length = 0; } await fui.flint(s.text || text); work = st.cfg; handed = true; continue; }
        said.push(''); return boost(text);
      }
      if (r.cfg) work = S().normalize(r.cfg);
      if (r.page) st.page = r.page;
      if (r.sel) st.sel = { block: r.sel.block, path: r.sel.path || '', kind: /\.$/.test(r.sel.path || '') || /^site\.image/.test(s.intent) ? 'image' : 'block' };
      if (r.ask) asked = r.ask; if (r.chips) chips = r.chips;
      said.push(r.say);
      if (r.need === 'html' || r.need === 'zip') { if (work !== st.cfg) { commitAll(before, work); } await download(r.need); st.log.pop(); continue; }
      if (r.need === 'template') { commitAll(before, work); await useTemplate(r.template); work = st.cfg; continue; }
      if (r.need === 'publish') { commitAll(before, work); paint(); await publish(); st.log.pop(); continue; }
      if (r.need === 'device') { st.dev = r.dev; continue; }
      if (r.need === 'comments') { st.panel = 'comments'; continue; }
      if (r.need === 'comments-tasks') { commitAll(before, work); await turnIntoTasks(); said.pop(); continue; }
      if (r.need === 'autofill') { commitAll(before, work); const f = await autofill(st.cfg); commit(f.cfg); fillNote(f.used); work = st.cfg; said.pop(); said.push(f.used.length ? `Filled from the project: ${f.used.join(', ')}. Undo brings back what you had.` : 'The project has nothing to fill in yet: give it a bio, a vision doc, members or tasks.'); continue; }
      if (r.need === 'blank') { commitAll(before, work); commit(st.unfilled ? JSON.parse(st.unfilled) : S().blank(st.cfg.name)); work = st.cfg; said.pop(); said.push(st.unfilled ? 'Started from the template as it is, nothing filled in. Undo brings it back.' : 'Started blank. Undo brings back what you had.'); continue; }
      if (r.need === 'repo') { commitAll(before, work); await flush(); if (fui) { said.pop(); say('Building it into the repo as code. The design here stays as it is.'); await fui.flint('build me a landing page'); handed = true; } continue; }
      if (r.need === 'settings') { st.panel = 'site'; continue; }
      if (r.need === 'logo' || r.need === 'favicon' || r.need === 'seoimage') { commitAll(before, work); paint(); picFor = r.need === 'seoimage' ? 'share' : r.need; const f = $('#wdz-file'); f.value = ''; f.click(); continue; }
      if (r.need === 'upload') { commitAll(before, work); paint(); pickFile(); }
      if (r.need === 'board') { commitAll(before, work); paint(); board(); }
      if (r.need === 'alt') { commitAll(before, work); paint(); setTimeout(() => { const i = $('#wdz-alt'); if (i) i.focus(); }, 30); }
    }
    const changed = JSON.stringify(work) !== before || JSON.stringify(st.cfg) !== before;
    commitAll(before, work);
    if (asked) st.pending = asked;
    const reply = said.filter(Boolean).join(' ');
    if (done.length) st.lastSteps = done;
    if (reply || !handed) say(reply || 'Done.', html, [...(changed ? [undoAct()] : []), ...acts, ...chipActs(chips)]);
    paint(); postSel(true);
    return reply;
  }
  function commitAll(before, work) { if (JSON.stringify(work) === before || work === st.cfg && JSON.stringify(st.cfg) === before) return; if (work !== st.cfg) { st.hist.push(before); st.fut = []; st.cfg = work; fixPage(); save(); } }
  async function boost(text) {
    const B = window.TribeBoost;
    if (B && await B.online() && window.TribeAIBasics && window.TribeAIBasics.ask) {
      try {
        const pg = pageNow(); const r = await window.TribeAIBasics.ask('site.design', { ask: text, page: pg.title, blocks: pg.blocks.map(b => ({ id: b.id, type: b.type, props: Object.fromEntries(Object.entries(b.props).filter(([, v]) => typeof v === 'string' && !/^data:/.test(v))) })) }, '');
        const j = r && r.text ? JSON.parse((/\{[\s\S]*\}/.exec(r.text) || ['{}'])[0]) : null;
        let c = st.cfg, n = 0;
        for (const op of (j && j.ops) || []) { if (op.block && op.path && typeof op.value === 'string' && pg.blocks.some(b => b.id === op.block)) { c = S().setProp(c, st.page, op.block, op.path, op.value.slice(0, 600)); n++; } else if (op.add && S().BLOCKS[op.add]) { c = S().addBlock(c, st.page, op.add).cfg; n++; } }
        if (n) { commit(c); return say(`${j.say || 'Done.'} ✦ via ${r.via}`, '', [undoAct()]); }
      } catch {}
    }
    const did = 'Nothing changed: that needs new writing or pictures. For free I add links, socials, buttons, pages and sections, change any words, colors and layouts, wire buttons, swap pictures and export HTML.';
    const would = 'An AI writes the copy or makes the picture you asked for and turns it into the same edits here, each one undoable.';
    st.log.push({ who: 'flint', text: '', html: B ? B.html({ did, would, ask: text }) : esc(did) }); logPaint();
    return 'boost';
  }

  // the #/site-designer link (router-free: a hash opens it over whatever is on screen)
  addEventListener('hashchange', () => { if (location.hash === '#/site-designer' && (!root || root.hidden)) open({}); });
  if (location.hash === '#/site-designer') addEventListener('load', () => setTimeout(() => open({}), 300));

  // dirty(pid): edits not on the host yet (the sidebar's Website row shows a dot); hasDraft(pid): a design exists here
  const dirty = pid => { if (st && (pid == null || st.pid === pid)) return !!st.dirty; const d = readDraft(pid); return !!(d && d.dirty); };
  const hasDraft = pid => !!(st && st.pid === pid) || !!readDraft(pid);
  // feat/agents-free: a site config (or a page of HTML) from a free AI chat, imported as a new version (one Undo away)
  async function importCfg(cfg, note) {
    if (!root || root.hidden || !st) await open({});
    if (!st || !cfg) return false;
    commit(S().normalize(JSON.parse(JSON.stringify(cfg))));
    if (st.pid && connected()) { st.dirty = true; if (await push()) { try { await C.api(`/projects/${encodeURIComponent(st.pid)}/website/versions`, { method: 'POST', body: { note: String(note || 'From a free AI (pasted)').slice(0, 80) } }); } catch {} } }
    else { try { localStorage.setItem(LOCAL + '.v', JSON.stringify(st.cfg)); } catch {} }
    say(`Imported ${note || 'the pasted design'} as a new version. Undo puts the old one back.`);
    return true;
  }
  // feat/dropzone: files dropped on the designer. A page of HTML or a site config (.json) imports as a new version; pictures
  // replace the selected picture, or wait in the log as a picker (click a picture on the page, then one of these).
  async function dropFiles(files) {
    files = [...(files || [])]; if (!files.length) return false;
    if (!root || root.hidden || !st) await open({});
    if (!st) return false;
    const page = files.find(f => /\.html?$/i.test(f.name) || /^text\/html/.test(f.type)), cfgF = files.find(f => /\.json$/i.test(f.name));
    if (cfgF) { let cfg = null; try { cfg = JSON.parse(await cfgF.text()); } catch {} if (!cfg || !Array.isArray(cfg.pages)) { say(`${cfgF.name} is not a website config.`); return false; } return importCfg(cfg, cfgF.name); }
    if (page) { if (!window.TribeSiteImport) { say('The importer is not loaded here.'); return false; } const r = window.TribeSiteImport.fromHtml(await page.text(), { name: page.name.replace(/\.html?$/i, '') }); return importCfg(r.cfg, page.name); }
    const pics = files.filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f.name)).slice(0, 12);
    if (!pics.length) { say('Drop pictures, a page of HTML or a site config (.json) here.'); return false; }
    const srcs = []; for (const f of pics) { if (f.size > 12 * 1024 * 1024) continue; srcs.push({ src: await shrink(f), alt: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') }); }
    if (!srcs.length) { say('Those pictures are over 12 MB. Try smaller ones.'); return false; }
    const s0 = st.sel, b = s0 && pageNow().blocks.find(x => x.id === s0.block);
    if (b && (s0.kind === 'image' || srcs.length === 1)) { commit(S().setImage(st.cfg, st.page, s0.block, s0.path || '', srcs[0].src, srcs[0].alt)); say(`Used ${pics[0].name}. Undo puts the old one back.`); if (srcs.length === 1) return true; srcs.shift(); }
    st.drops = srcs;
    say(`${srcs.length === 1 ? 'Here is your picture' : `Here are your ${srcs.length} pictures`}: click a picture on the page, then pick one.`, `<div class="wdz-bgrid">${srcs.map(p => `<button type="button" data-boardpick="${esc(p.src)}" data-alt="${esc(p.alt)}" aria-label="${esc(p.alt)}"><img src="${esc(p.src)}" alt=""></button>`).join('')}</div>`);
    return true;
  }
  window.TribeSiteDesigner = { importCfg, dropFiles, open, close, ask, download, undo, redo, flush, dirty, hasDraft, comments: () => st ? st.comments : [], state: () => st && { pid: st.pid, page: st.page, sel: st.sel, hist: st.hist.length, fut: st.fut.length, log: st.log, pending: st.pending || null, open: !!root && !root.hidden, dirty: st.dirty, rev: st.rev, dev: st.dev, panel: st.panel, cmode: st.cmode }, cfg: () => st && st.cfg, useTemplate, gallery: () => gal.list };
})();
