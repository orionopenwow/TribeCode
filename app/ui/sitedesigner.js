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
  // p4-site: stroke icons for the bar (the shared set where it has one, our own few where it does not)
  const sv = d => `<svg class="wdz-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = { back: sv('<path d="M19 12H5M11 6l-6 6 6 6"/>'), undo: sv('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'), redo: sv('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'), minus: sv('<path d="M5 12h14"/>'), plus: sv('<path d="M12 5v14M5 12h14"/>') };
  // pass 5: Flint's own column (rail, drawer, phone sheet) and the drag handles, eye and lock in the list of blocks
  Object.assign(IC, { chevR: sv('<path d="m9 6 6 6-6 6"/>'), eye: sv('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'), eyeOff: sv('<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    lock: sv('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'), unlock: sv('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'), grip: sv('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
    info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'), more: sv('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'), clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>') });
  const FLINT_IC = '<img class="fl-face" src="assets/flint.svg" alt="" width="20" height="20" aria-hidden="true">';
  const ic = (n, z = 16) => (window.TribeIcons && window.TribeIcons.has && window.TribeIcons.has(n) ? window.TribeIcons.svg(n, z) : '');
  const connected = () => !!(C && C.connected && C.connected() && C.hasToken && C.hasToken());
  let root = null, st = null, saveT = 0, frameScroll = 0, liveText = null, liveT = 0;
  let cw = null, crStrip = null, cwEditing = '';   // feat/cowork-editors: who else is here (cowork.js), how changes work here (changes.js)

  const EDIT_CSS = `<style>[data-e]{cursor:text;border-radius:2px}[data-e]:hover{outline:1px dashed var(--muted);outline-offset:2px}[data-e]:focus{outline:2px solid var(--accent);outline-offset:2px}
[data-block]{position:relative}[data-block]:hover{outline:1px dashed var(--line);outline-offset:-1px}.wdz-sel{outline:2px solid var(--accent)!important;outline-offset:-2px}
[data-img]{cursor:pointer}.wdz-pin{position:absolute;z-index:5;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50% 50% 50% 0;border:2px solid #fff;background:#F26B1D;color:#fff;font:700 11px/1 system-ui;cursor:pointer;padding:0}.wdz-pin.done{background:#6b7280}.wdz-cm [data-block]{cursor:crosshair}.wdz-cm [data-block]:hover{outline:2px dashed #F26B1D!important}[data-unwired]{outline:1px dashed var(--muted);outline-offset:3px}[data-unwired]::after{content:'not linked';font:600 10px/1 ui-monospace,monospace;margin-left:8px;opacity:.7}
[data-e]:empty{display:inline-block;min-width:5em;min-height:1em}[data-e]:empty::before{content:attr(data-hint);opacity:.55;font-style:italic;font-weight:400}[data-item]:hover{outline:1px dashed var(--muted);outline-offset:3px}[data-sys]{cursor:help}[data-ph],[data-icon]{cursor:pointer}[data-icon]:hover,[data-ph]:hover,[data-img]:hover{outline:1px dashed var(--muted);outline-offset:2px}
[data-e].wdz-sel,[data-btn].wdz-sel,[data-item].wdz-sel,[data-icon].wdz-sel,[data-ph].wdz-sel,[data-img].wdz-sel{outline-offset:2px!important}.tk[data-icon]{display:inline-grid}
.wdz-tb{position:absolute;z-index:8;display:flex;align-items:center;background:#16181D;border:1px solid #3A3F4A;border-radius:8px;overflow:hidden;font:600 13px/1 system-ui,sans-serif;color:#F2F3F5;text-align:left;white-space:nowrap}.wdz-tb button{all:unset;box-sizing:border-box;min-width:30px;height:30px;display:grid;place-items:center;cursor:pointer;padding:0 6px;color:#F2F3F5}.wdz-tb button:hover,.wdz-tb button:focus-visible{background:#2A2F39}.wdz-tb i{width:1px;height:18px;background:#3A3F4A}.wdz-tb [data-a=igrip]{cursor:grab;touch-action:none;letter-spacing:-2px}@media (max-width:480px){.wdz-tb [data-a=ital],.wdz-tb [data-a=wlink],.wdz-tb [data-a=align]{display:none}}[data-img].wdz-sel img{cursor:grab}.wdz-panning img{cursor:grabbing}.wdz-msel{outline:2px solid var(--accent)!important;outline-offset:2px}.wdz-idrop{position:absolute;z-index:9;background:#F26B1D;border-radius:2px;pointer-events:none}.wdz-bar svg{display:block}
html[data-dev=phone] .ehide-phone,html[data-dev=tablet] .ehide-tablet,html[data-dev=desktop] .ehide-desktop{opacity:.35;outline:1px dashed var(--muted);outline-offset:-3px}
[data-e]{white-space:pre-wrap}[data-e] a{cursor:text}a[data-new]{outline:1px dashed var(--accent);outline-offset:2px}[data-e]:empty:not([data-hint])::before{content:'Add words'}
.wdz-bar{position:absolute;top:8px;right:8px;z-index:6;display:flex;gap:0;background:#16181D;border:1px solid #3A3F4A;border-radius:8px;overflow:hidden;font:600 13px/1 system-ui,sans-serif;text-align:left}.wdz-bar button{all:unset;box-sizing:border-box;min-width:30px;height:30px;display:grid;place-items:center;color:#F2F3F5;cursor:pointer;padding:0 6px}.wdz-bar button+button{border-left:1px solid #3A3F4A}.wdz-bar button:hover,.wdz-bar button:focus-visible{background:#2A2F39}.wdz-bar [data-a=grip]{cursor:grab;touch-action:none;letter-spacing:-2px}.wdz-dragging,.wdz-dragging *{cursor:grabbing!important;user-select:none}.wdz-moving{opacity:.45}.wdz-drop{position:absolute;left:0;right:0;height:4px;background:var(--accent);z-index:7;pointer-events:none}.wdz-cm .wdz-bar{display:none}[data-icon]{cursor:pointer}[data-icon]:hover{outline:2px dashed var(--muted);outline-offset:2px}@media (max-width:480px){.wdz-bar button{min-width:36px;height:36px}}.wdz-sp{position:absolute;left:50%;z-index:7;transform:translateX(-50%);display:none;align-items:center;gap:6px;height:20px;padding:0 9px;background:#16181D;border:1px solid #3A3F4A;border-radius:10px;color:#F2F3F5;font:600 11px/1 ui-monospace,monospace;cursor:ns-resize;touch-action:none;user-select:none;-webkit-user-select:none;text-align:left}.wdz-sel>.wdz-sp{display:flex}.wdz-sp-pt{top:3px}.wdz-sp-pb{bottom:3px}.wdz-sp i{width:16px;height:2px;border-radius:1px;background:#F2F3F5}.wdz-sp b{font-weight:600;min-width:2ch;text-align:center}.wdz-sp:hover,.wdz-sp.is-drag,.wdz-sp:focus-visible{border-color:#F26B1D;outline:0}.wdz-sp-show-pt{box-shadow:inset 0 var(--pt,0) 0 rgba(242,107,29,.16)}.wdz-sp-show-pb{box-shadow:inset 0 calc(-1 * var(--pb,0)) 0 rgba(242,107,29,.16)}html.wdz-spacing,html.wdz-spacing *{cursor:ns-resize!important}@media (max-width:480px){.wdz-sp{height:30px;padding:0 12px}}
.wdz-bar [data-a=grip]{touch-action:none;cursor:grab}[data-locked]:hover{outline-style:solid;outline-color:var(--line)}[data-locked] [data-e]{cursor:default}.wdz-bar .wdz-lk{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;color:#F2F3F5;cursor:pointer;font:600 12px/1 system-ui,sans-serif}
.wdz-dropto{outline:3px solid var(--accent)!important;outline-offset:2px!important}
</style>`;
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
    if (lockedChange(next)) { paint(); return false; }   // someone else is typing in this part: "Ana is editing this; ask or wait"
    if (refuseLocked(next)) { paint(); return false; }   // pass 5: a locked section keeps its words and look
    const was = JSON.stringify(st.cfg);
    st.hist.push(was); if (st.hist.length > 80) st.hist.shift(); st.fut = [];
    st.cfg = S().normalize(next);
    if (window.TribeSuggest && !opts.fromSuggest) window.TribeSuggest.noteSiteEdit(was, st.cfg);   // repeated edits become a suggestion (app/ui/suggest.js)
    if (!st.cfg.pages.some(p => p.id === st.page)) st.page = st.cfg.pages[0].id;
    save(); if (!opts.quiet) paint();
    return true;
  }
  // pass 5: a locked section (its lock in the list of blocks, or right-click > Lock) cannot be changed or removed until it
  // is unlocked; its name, its lock and its place among the others can. Every way in (the page, the panel, Flint) stops here.
  function lockedHit(next) {
    if (!st.cfg.pages.some(p => p.blocks.some(b => b.locked))) return null;
    const strip = b => { const o = { ...b }; delete o.name; delete o.locked; return JSON.stringify(o); };
    const n = S().normalize(JSON.parse(JSON.stringify(next)));
    for (const pg of st.cfg.pages) for (const b of pg.blocks) {
      if (!b.locked) continue;
      const np = n.pages.find(p => p.id === pg.id), nb = np && np.blocks.find(x => x.id === b.id);
      if (!nb) return b;
      if (nb.locked && strip(nb) !== strip(b)) return b;
    }
    return null;
  }
  function refuseLocked(next) {
    let hit = null; try { hit = lockedHit(next); } catch { hit = null; }
    if (!hit) return false;
    toast(`${blkName(hit)} is locked. Unlock it to change it.`); return true;
  }
  const blkName = b => (b && b.name) || (b && S().BLOCKS[b.type] ? S().BLOCKS[b.type].label.replace(/ \(.*/, '') : 'This section');
  // Undo and Redo show what they changed: the section that differs is selected and brought into view (feat/site-editor2)
  function showChange(before, after) {
    try {
      const A = JSON.parse(before), B = after, pgB = B.pages.find(p => p.id === st.page) || B.pages[0], pgA = A.pages.find(p => p.id === pgB.id);
      if (!pgA) return; const byId = Object.fromEntries(pgA.blocks.map(b => [b.id, JSON.stringify(b)]));
      const hit = pgB.blocks.find(b => byId[b.id] !== JSON.stringify(b));
      if (hit) {
        // round 3: the exact thing that changed, not just its section: the first words, picture, button or look that differs
        const old = byId[hit.id] ? JSON.parse(byId[hit.id]) : null; let sel = { block: hit.id, path: '', kind: 'block' };
        if (old && old.type === hit.type) {
          const first = (x, y, p) => { if (JSON.stringify(x) === JSON.stringify(y)) return null; if (Array.isArray(x) && Array.isArray(y)) { if (x.length !== y.length) return null; for (let i = 0; i < x.length; i++) { const r = first(x[i], y[i], p ? `${p}.${i}` : String(i)); if (r) return r; } return null; } if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) { const r = first(x[k], y[k], p ? `${p}.${k}` : k); if (r) return r; } return null; } return p; };
          let p = first(old.props, hit.props, '') || (() => { const a = old.es || {}, b2 = hit.es || {}; return [...new Set([...Object.keys(a), ...Object.keys(b2)])].find(k => JSON.stringify(a[k]) !== JSON.stringify(b2[k])) || ''; })();
          if (p) {
            const m = /^(.*?)(?:\.)?(img|alt|shape|fit|pos|fx|fy)$/.exec(p), lk = /^(.*)\.(?:label|link(?:\..*)?)$/.exec(p);
            if (m) sel = { block: hit.id, path: m[1] ? m[1] + '.' : '', kind: 'image' };
            else if (lk && S().getAt(hit.props, lk[1]) && typeof S().getAt(hit.props, lk[1]) === 'object') sel = { block: hit.id, path: lk[1], kind: 'button' };
            else if (typeof S().getAt(hit.props, p) === 'string') sel = { block: hit.id, path: p, kind: 'text' };
            else if (S().getAt(hit.props, p) && typeof S().getAt(hit.props, p) === 'object' && 'label' in S().getAt(hit.props, p)) sel = { block: hit.id, path: p, kind: 'button' };
          }
        }
        st.sel = sel; st.multi = [];
        setTimeout(() => postSel(true), 60);
      }
    } catch {}
  }
  function undo() { if (!st.hist.length) return false; const was = JSON.stringify(st.cfg); st.fut.push(was); st.cfg = JSON.parse(st.hist.pop()); fixPage(); showChange(was, st.cfg); save(); paint(); return true; }
  function redo() { if (!st.fut.length) return false; const was = JSON.stringify(st.cfg); st.hist.push(was); st.cfg = JSON.parse(st.fut.pop()); fixPage(); showChange(was, st.cfg); save(); paint(); return true; }
  function fixPage() { if (!st.cfg.pages.some(p => p.id === st.page)) st.page = st.cfg.pages[0].id; if (st.sel && st.sel.block !== '@' && !pageNow().blocks.some(b => b.id === st.sel.block)) st.sel = null; }
  const ago = t => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 20 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  function status(text) { const el = $('#wdz-saved'); if (!el) return; el.textContent = text != null ? text : st.dirty ? 'Saving…' : st.savedAt ? `Saved${st.pid && connected() ? '' : ' on this device'} · ${ago(st.savedAt)}` : ''; el.classList.toggle('is-dirty', !!st.dirty); }
  setInterval(() => { if (st && root && !root.hidden && !st.dirty) status(); }, 15000);
  function save() {
    clearTimeout(saveT); st.dirty = true; writeDraft(); status('Saving…');
    if (st.pid) dispatchEvent(new CustomEvent('tribe:site-draft', { detail: { pid: st.pid, dirty: true } }));
    saveT = setTimeout(push, cw && cw.people && cw.people().length ? 250 : 600);   // p4-site: with a friend in here, their copy follows sooner
  }
  async function push(opts = {}) {
    clearTimeout(saveT); saveT = 0; if (!st || !st.dirty) return true;
    const pid = st.pid, cfg = st.cfg, mine = JSON.stringify(cfg);
    if (!pid || !connected()) { st.dirty = false; st.savedAt = Date.now(); writeDraft(); status(); return true; }
    if (st.canEdit === false) {   // feat/cowork-editors: a suggestion in the making stays on this device until it is sent
      st.dirty = false; st.pendingDraft = st.canSuggest && mine !== st.base; writeDraft();
      status(st.canSuggest ? (st.pendingDraft ? tr('Draft: suggest it to share') : '') : tr('View only')); if (crStrip) crStrip.draw(); return true;
    }
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

  // ---------- working together (feat/cowork-editors) ----------
  // A thing on the page is "<kind>:<block>|<path>" (the same key the preview uses), so pointers and outlines land on the
  // same words, picture or section at any window size. The preview is a sandboxed frame: it measures its own pointer
  // (cw-ptr) and draws the others itself ({ cw: people }).
  const blockOfP = p => { const k = String(p || ''); return k.slice(k.indexOf(':') + 1).split('|')[0]; };
  function thingLabel(p) {
    const k = String(p || ''), kind = k.slice(0, k.indexOf(':')), key = k.slice(k.indexOf(':') + 1), bid = key.split('|')[0], path = key.slice(bid.length + 1);
    const b = st && pageNow().blocks.find(x => x.id === bid); if (!b) return '';
    const sec = String(b.type || 'section').replace(/[-_]/g, ' ');
    const word = /title|head/i.test(path) ? tr('title') : kind === 'image' ? tr('picture') : kind === 'button' ? tr('button') : kind === 'text' ? tr('words') : '';
    return word ? `${sec} · ${word}` : sec;
  }
  function lockedChange(next) {
    if (!cw || !st.sel || cwEditing) return false;
    const p = `${st.sel.kind || 'block'}:${st.sel.block}|${st.sel.path || ''}`; if (!cw.lockedBy(p)) return false;
    const pg = x => (x.pages.find(q => q.id === st.page) || x.pages[0]).blocks.find(b => b.id === st.sel.block);
    let after = null; try { after = pg(S().normalize(next)); } catch {}
    if (JSON.stringify(pg(st.cfg)) === JSON.stringify(after)) return false;
    cw.guard(p); return true;
  }
  // what a suggestion changes, in words (the website has no picture of itself here; the summary says it)
  function siteSummary(baseJson, cfg) {
    let b = null; try { b = baseJson ? S().normalize(JSON.parse(baseJson)) : null; } catch {}
    if (!b) return [tr('A new website design')];
    const out = [], words = o => { const l = []; const walk = x => { if (typeof x === 'string') { if (x.trim() && !/^(#|data:|https?:)/.test(x)) l.push(x.trim()); } else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.values(x).forEach(walk); }; walk(o); return l; };
    for (const pg of cfg.pages) {
      const old = b.pages.find(x => x.id === pg.id); if (!old) { out.push(`${tr('Added the page')} ${pg.title || pg.id}`); continue; }
      for (const blk of pg.blocks) {
        const ob = old.blocks.find(x => x.id === blk.id), sec = String(blk.type || 'section').replace(/[-_]/g, ' ');
        if (!ob) { out.push(`${tr('Added a section:')} ${sec}`); continue; }
        if (JSON.stringify(ob) === JSON.stringify(blk)) continue;
        const a = words(ob.props), z = words(blk.props), gone = a.filter(x => !z.includes(x)), came = z.filter(x => !a.includes(x));
        if (gone.length === 1 && came.length === 1) out.push(`${sec}: “${gone[0].slice(0, 60)}” → “${came[0].slice(0, 60)}”`);
        else out.push(`${tr('Changed the section')} ${sec}`);
      }
      old.blocks.filter(x => !pg.blocks.some(y => y.id === x.id)).forEach(x => out.push(`${tr('Removed a section:')} ${String(x.type || 'section').replace(/[-_]/g, ' ')}`));
    }
    b.pages.filter(x => !cfg.pages.some(y => y.id === x.id)).forEach(x => out.push(`${tr('Removed the page')} ${x.title || x.id}`));
    if (JSON.stringify(b.theme) !== JSON.stringify(cfg.theme)) out.push(tr('Changed the look'));
    return out.slice(0, 8);
  }
  function postCw(people) { const f = $('#wdz-frame'); if (f && f.contentWindow && frameReady) f.contentWindow.postMessage({ cw: people || [] }, '*'); }
  function coworkOn() {
    if (cw) { cw.detach(); cw = null; }
    if (!root || !st || !st.pid || !connected()) return;
    let row = $('#wdz-cw'); if (!row) { const top = root.querySelector('.wdz-top'); if (top) { row = document.createElement('span'); row.id = 'wdz-cw'; row.className = 'cw-row'; row.hidden = true; const sv = $('#wdz-saved'); if (sv && sv.parentNode === top) sv.after(row); else top.appendChild(row); } }
    let strip = $('#wdz-cr'); if (!strip) { const top = root.querySelector('.wdz-top'); if (top) { strip = document.createElement('div'); strip.id = 'wdz-cr'; strip.className = 'cr-strip'; strip.hidden = true; top.after(strip); root.classList.add('has-cr'); } }
    if (window.TribeChanges && strip) crStrip = window.TribeChanges.strip(strip, 'site', { pid: st.pid, draft: () => st.cfg, dirty: () => !!st.pendingDraft, summary: () => siteSummary(st.base, st.cfg), before: () => (st.base ? snapSite(st.base, st.page) : null), after: () => snapSite(st.cfg, st.page),
      onSent: r => { if (r && (r.request || r.applied)) { st.pendingDraft = false; status(tr(r.applied ? 'Saved' : 'Sent for OK')); if (crStrip) crStrip.draw(); } } });
    if (!window.TribeCowork) return;
    cw = window.TribeCowork.attach('site', { key: () => (st && st.pid) || '', row, framePointer: true, anchorAt: () => null, rect: () => null, label: thingLabel, blockOf: blockOfP, draw: people => postCw(people) });
  }
  // someone else saved: an open designer with nothing unsaved takes their version (no reload); unsaved work keeps the
  // Keep mine / Keep theirs choice, and a draft waiting to be suggested stays the person's own
  if (C && C.on) C.on('ws', m => {
    if (!m || m.type !== 'site-config' || !st || !root || root.hidden || m.project !== st.pid) return;
    if ((m.rev || 0) <= (st.rev || 0)) return;
    // p4-site: a save of my own usually came from this designer (its answer sets the rev a moment later). When it did
    // not (I approved a suggested change from the list, or my agent's proposal was applied), take it like anyone's.
    const own = C.state && C.state().me && m.by === C.state().me.id, pidNow = st.pid;
    const take = () => { if (!st || st.pid !== pidNow || !root || root.hidden || (m.rev || 0) <= (st.rev || 0)) return; takeTheirs(); };
    if (own) setTimeout(take, 700); else take();
  });
  function takeTheirs() {
    C.api(`/projects/${encodeURIComponent(st.pid)}/site-config`).then(r => {
      if (!st || !r || !r.config || (r.rev || 0) <= (st.rev || 0)) return;
      st.base = JSON.stringify(S().normalize(r.config));
      if (st.dirty || liveText || st.pendingDraft) { if (st.pendingDraft) status(tr('A friend changed the site. Your draft stays yours until you send it.')); return; }
      const mine = C.state && C.state().me && r.savedBy === C.state().me.id;
      st.cfg = S().normalize(r.config); st.rev = r.rev; fixPage(); paint(); status(tr(mine ? 'Updated' : 'Updated with a friend’s change'));
    }).catch(() => {});
  }

  // ---------- open / close ----------
  // open({ pid, template, prompt, cfg, ask }): the Design creation flow and Flint call this. template = a gallery id
  // (ours or an imported one); prompt = what the person said ("a link tree for June Bakes"): it can pick the template
  // and the name, and the rest is passed to Flint.
  async function open(o = {}) {
    if (!S()) return;
    perf.t0 = performance.now(); perf.open = 0; perf.ready = 0;
    if (st && root && !root.hidden) await flush();
    const pid = o.pid !== undefined ? o.pid : (C && C.project && C.project()) || '';
    let cfg = o.cfg || null, rev = 0, server = null;
    if (!cfg && pid && connected()) { try { server = await C.api(`/projects/${encodeURIComponent(pid)}/site-config`); cfg = server.config; rev = server.rev || 0; } catch {} }
    let d = !o.cfg && readDraft(pid);
    let restored = false, brought = false;
    // pass 4: a site made on this device before there was a tribe comes along into a project that has none yet
    if (!o.cfg && !o.template && !o.prompt && pid && server && !server.config && !d && server.canEdit !== false) { const mine = readDraft(''); if (mine && mine.cfg && mine.cfg.pages && mine.cfg.pages.some(p => (p.blocks || []).length)) { d = { cfg: mine.cfg, at: Date.now(), rev: 0, dirty: true }; brought = true; } }
    if (d && (!cfg || (d.dirty && (d.rev || 0) >= rev) || (!connected() && d.at))) { cfg = d.cfg; restored = !!d.dirty && !!server; }
    mount();
    st = fresh(cfg || S().blank(projectName(pid)), pid); st.rev = rev; st.blank = !cfg;
    if (server) { st.canEdit = server.canEdit !== false; st.canSuggest = !!server.canSuggest; st.base = server.config ? JSON.stringify(S().normalize(server.config)) : ''; st.pendingDraft = !st.canEdit && !!d && !!d.cfg && JSON.stringify(st.cfg) !== st.base; }
    st.savedAt = d && d.at || (server && server.savedAt ? Date.parse(server.savedAt) : 0);
    st.page = st.cfg.pages[0].id;
    root.hidden = false; document.body.classList.add('wdz-open'); perf.open = Math.round(performance.now() - perf.t0); moreMenu(false);
    { const f = $('#wdz-frame'); if (f && f.srcdoc) { const n = f.cloneNode(false); n.removeAttribute('srcdoc'); f.replaceWith(n); } }   // a frame that was inside the hidden designer can stay unpainted in Chrome: start a fresh one
    if (d && d.dirty && server && (d.rev || 0) < rev && JSON.stringify(S().normalize(d.cfg)) !== JSON.stringify(st.cfg)) { st.dirty = true; st.cfg = S().normalize(d.cfg); conflict({ config: server.config, rev, by: server.savedBy, at: server.savedAt }); }
    else if (restored) { st.dirty = true; push(); }
    if (brought) setTimeout(() => say('Brought in the site you made on this device before the tribe.'), 300);
    let tpl = o.template, rest = o.prompt || '';
    if (rest && !tpl && window.TribeNLU) { const P = window.TribeNLU.parse(rest, {}); const s = (P.steps || [])[0]; if (s && /^site\./.test(s.intent) && s.conf >= 0.6 && S().TEMPLATES.includes(s.intent.slice(5))) { tpl = s.intent.slice(5); if (s.slots && s.slots.name) o.name = s.slots.name; rest = ''; } }
    if (tpl && o.askReplace && !(await okToReplace())) tpl = '';   // p4-site: a template over a site that is already there asks first
    hideStart();   // p5-start: a start screen left from last time does not cover this one
    if (tpl) await useTemplate(tpl, !cfg, { name: o.name });
    else if (!cfg) showStart(false, o.kind || '');
    else if (o.start) { paint(); showStart(true, o.kind || ''); }   // p5-start: "make a website" over a site that is there: the kinds, with Keep my design
    else paint();
    chipKey = ''; logPaint();   // feat/flint-unify: this design's thread and chips
    status(); await loadComments();
    coworkOn();
    if (pid && connected() && st.canEdit !== false && window.TribeWhere) window.TribeWhere.check(pid, 'site');   // pass 4: files changed outside TribeCode: ask, never write over them
    if (SG()) { SG().reset(); SG().refresh(sgApi()).catch(() => {}); }
    try { if (STU()) STU().opened(stuApi); } catch {}
    try { if (window.TribeSiteFxUI) window.TribeSiteFxUI.opened(stuApi); } catch {}   // feat/site-3d
    if (o.comment) commentMode(true);
    const ask2 = o.ask || rest; if (ask2) setTimeout(() => ask(ask2), 60);
    return st;
  }
  function close() { if (!root) return; if (cw) { cw.detach(); cw = null; } crStrip = null; try { if (STU()) STU().closed(); } catch {} flush(); root.hidden = true; document.body.classList.remove('wdz-open'); if (location.hash === '#/site-designer') history.back(); }
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
    st.page = st.cfg.pages[0].id; st.sel = null; st.blank = false; hideStart(); paint();
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
    n.innerHTML = `<span>${esc(tr('Filled in from your project:'))} <b>${esc(used.join(', '))}</b>. ${esc(tr('Change anything.'))}</span><button type="button" class="btn sm" data-fill="blank">${esc(tr('Use the template as it came'))}</button><button type="button" class="btn sm ghost wdz-ic" data-fill="ok" aria-label="${esc(tr('Dismiss'))}" title="${esc(tr('Dismiss'))}">${sv('<path d="M6 6l12 12M18 6 6 18"/>')}</button>`;
  }

  // ---------- the DOM ----------
  function mount() {
    if (root) return;
    root = document.createElement('div'); root.id = 'wdz'; root.className = 'wdz'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Website designer');
    const P = S().PRESETS;
    root.innerHTML = `
      <header class="wdz-top">
        <button type="button" class="btn ghost sm wdz-back" data-wdz="close" aria-label="Back" title="Back">${IC.back}<span class="wdz-lbl">Back</span></button>
        <b class="wdz-title"><span class="wdz-eyebrow">Website</span><span id="wdz-name"></span></b>
        <nav class="wdz-pages" id="wdz-pages" aria-label="Pages"></nav>
        <span class="wdz-sp"></span>
        <span class="wdz-saved" id="wdz-saved" aria-live="polite"></span>
        <button type="button" class="btn ghost sm wdz-ic" data-wdz="undo" title="Undo (Ctrl Z)" aria-label="Undo">${IC.undo}</button>
        <button type="button" class="btn ghost sm wdz-ic" data-wdz="redo" title="Redo (Ctrl Shift Z)" aria-label="Redo">${IC.redo}</button>
        <span class="wdz-devs" role="group" aria-label="Preview size"><button type="button" class="btn ghost sm" data-dev="desktop" aria-pressed="true" title="Desktop (1)">${ic('monitor')}<span class="wdz-lbl">Desktop</span></button><button type="button" class="btn ghost sm" data-dev="tablet" aria-pressed="false" title="Tablet (2)">${ic('tablet')}<span class="wdz-lbl">Tablet</span></button><button type="button" class="btn ghost sm" data-dev="phone" aria-pressed="false" title="Phone (3)">${ic('phone')}<span class="wdz-lbl">Phone</span></button></span>
        <span class="wdz-zoom" role="group" aria-label="Zoom"><button type="button" class="btn ghost sm wdz-ic" data-wdz="zoomout" title="Zoom out (Ctrl −)" aria-label="Zoom out">${IC.minus}</button><button type="button" class="btn ghost sm wdz-zv" data-wdz="zoom100" id="wdz-zoomv" title="Back to 100% (Ctrl 0)" aria-label="Zoom: back to 100%">100%</button><button type="button" class="btn ghost sm wdz-ic" data-wdz="zoomin" title="Zoom in (Ctrl +)" aria-label="Zoom in">${IC.plus}</button><button type="button" class="btn ghost sm wdz-zfit" data-wdz="zoomfit" title="Fit the whole width in the window (Shift 1)">Fit</button></span>
        <button type="button" class="btn sm wdz-hide-phone" data-wdz="comment" id="wdz-cmode" aria-pressed="false" title="Click a section to leave a comment (C)">Comment<span class="wdz-n" id="wdz-cn" hidden></span></button>
        <button type="button" class="btn ghost sm wdz-ic wdz-hide-phone" data-wdz="keys" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">${ic('help')}</button>
        <span class="wdz-morewrap"><button type="button" class="btn ghost sm wdz-ic wdz-more" data-wdz="more" aria-expanded="false" aria-haspopup="true" aria-controls="wdz-more" aria-label="More" title="More">${ic('more')}<span class="wdz-dot" id="wdz-moredot" hidden></span></button>
          <div class="wdz-menu wdz-moremenu" id="wdz-more" hidden role="group" aria-label="More">
            <p class="wdz-eyebrow">Look</p>
            <div class="wdz-mrow"><button type="button" class="btn sm" data-wdz="mode" id="wdz-mode" aria-pressed="false">Dark</button><label class="wdz-sel-wrap"><span class="sr">Theme</span><select id="wdz-theme" class="input sm" aria-label="Theme">${Object.entries(P).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('')}</select></label></div>
            <button type="button" data-wdz="wide" id="wdz-wide" aria-pressed="false" class="wdz-hide-phone"><b>Full width</b><small>Show the page at a full computer width (1280)</small></button>
            <button type="button" data-wdz="comment" class="wdz-only-phone"><b>Comment</b><small>Tap a section to leave a comment</small></button>
            <hr>
            <button type="button" data-wdz="templates"><b>Templates</b><small>Start again from a ready-made design</small></button>
            <button type="button" data-wdz="save"><b>Save design</b><small>Keep this version in Saved designs</small></button>
            <button type="button" data-wdz="code"><b>Code</b><small>Code for this section, and your own CSS</small></button>
            <button type="button" data-wdz="find"><b>Find and replace</b><small>Words on every page (Ctrl F)</small></button>
            <button type="button" data-wdz="history"><b>History</b><small>Every step of this design. Go back to any of them</small></button>
            <button type="button" data-wdz="requests" id="wdz-req" hidden><b>Suggested changes<span class="wdz-n" id="wdz-reqn" hidden></span></b><small>What people asked to change, and what waits for you</small></button>
            <hr>
            <button type="button" data-wdz="freeai" id="wdz-freeai"><b>Ask a free AI</b><small>Copy the design for ChatGPT, Gemini or another free AI, then paste its answer back</small></button>
            <button type="button" data-stu="agent" id="wdz-agent"><b>Make it beautiful</b><small>Your tribe’s AI proposes changes. You approve what it sends back.</small></button>
            <button type="button" data-wdz="keys" class="wdz-only-phone"><b>Keyboard shortcuts</b><small>For when a keyboard is attached</small></button>
          </div></span>
        <span class="wdz-dl"><button type="button" class="btn sm primary" data-wdz="dl-html" id="wdz-dl">Download HTML</button><button type="button" class="btn sm primary wdz-dl-more" data-wdz="dlmenu" aria-label="Download and publish" title="Download and publish" aria-expanded="false"><span class="wdz-dl-caret">▾</span><span class="wdz-dl-ico">${ic('download')}</span></button>
          <span class="wdz-menu" id="wdz-dlmenu" hidden role="menu"><button type="button" role="menuitem" data-wdz="dl-html"><b>index.html</b><small>One standalone file: every page, pictures inside, no scripts</small></button><button type="button" role="menuitem" data-wdz="dl-zip"><b>.zip with pages and assets</b><small>A file per page, assets/, fonts/ and site.json</small></button><button type="button" role="menuitem" data-wdz="where"><b>Where it lives</b><small>Your site is already files in the project folder. Open it, share it or put it online.</small></button></span></span>
      </header>
      <div class="wdz-body">
        <aside class="wdz-left" aria-label="Blocks">
          <p class="wdz-eyebrow">Blocks on this page</p>
          <ol class="wdz-blocks" id="wdz-blocks"></ol>
          <button type="button" class="btn sm wdz-add" data-wdz="picker" aria-expanded="false">+ Add block</button>
          <div class="wdz-picker" id="wdz-picker" hidden></div>
        </aside>
        <main class="wdz-stage"><div class="wdz-frame" id="wdz-framewrap" data-dev="desktop"><iframe id="wdz-frame" title="Live preview of the website" sandbox="allow-scripts"></iframe></div>
          <div class="wdz-float" id="wdz-find" hidden role="dialog" aria-label="Find and replace"></div><div class="wdz-float" id="wdz-hist" hidden role="dialog" aria-label="History"></div></main>
        <aside class="wdz-right" aria-label="Edit">
          <div class="wdz-phead"><div class="wdz-ptabs" role="tablist" aria-label="Panel"><button type="button" role="tab" data-panel="edit" aria-selected="true">Edit</button><button type="button" role="tab" data-panel="ideas" aria-selected="false">Ideas<span class="wdz-n" id="wdz-sn" hidden></span><span class="wdz-n" id="wdz-cn3" hidden></span></button><button type="button" role="tab" data-panel="style" aria-selected="false">Style</button><button type="button" role="tab" data-panel="check" aria-selected="false">Check</button></div>
            <div class="wdz-sub" id="wdz-sub-ideas" role="group" aria-label="Ideas" hidden><button type="button" data-panel="ideas" aria-pressed="true">Suggestions</button><button type="button" data-panel="comments" aria-pressed="false">Comments<span class="wdz-n" id="wdz-cn2" hidden></span></button></div>
            <div class="wdz-sub" id="wdz-sub-style" role="group" aria-label="Style" hidden><button type="button" data-panel="style" aria-pressed="true">Look</button><button type="button" data-panel="site" aria-pressed="false">Site settings</button></div></div>
          <div class="wdz-insp" id="wdz-insp"></div>
        </aside>
        <aside class="wdz-fl" id="wdz-fl" aria-label="Flint">
          <button type="button" class="wdz-fl-rail" data-wdz="flint" aria-controls="wdz-flint" aria-expanded="true" title="Flint (Ctrl J)">${FLINT_IC}<span>Flint</span></button>
          <button type="button" class="wdz-fl-grab" data-wdz="flint-sheet" aria-label="Show Flint's replies" aria-expanded="false"><span></span></button>
          <section class="wdz-flint" id="wdz-flint" aria-label="Flint"></section>
        </aside>
      </div>
      <div class="wdz-start" id="wdz-start" hidden></div>
      <input type="file" id="wdz-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden><input type="file" id="wdz-import" accept=".html,.htm,text/html" hidden>
      <div class="wdz-peek" id="wdz-peek" hidden role="dialog" aria-label="Template preview"></div><div class="wdz-cpop" id="wdz-cpop" hidden></div><div class="wdz-keys" id="wdz-keys" hidden role="dialog" aria-label="Keyboard shortcuts"></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    flintInit();
    root.addEventListener('focusin', e => { if (e.target && e.target.closest && e.target.closest('#wdz-insp, .wdz-fl, .wdz-left, .wdz-top')) flushText(); });   // pass 5: words typed on the page are kept before a box in the panel is used
    mountFlint();
    root.querySelector('#wdz-theme').addEventListener('change', e => commit(S().setTheme(st.cfg, e.target.value)));
    root.querySelector('#wdz-file').addEventListener('change', onFile);
    root.querySelector('#wdz-import').addEventListener('change', onImport);
    root.addEventListener('input', e => { if (e.target && e.target.id === 'wdz-gq') { gal.q = e.target.value; galPaint(); } });
    // keys work wherever the focus is while the designer is the top layer: on one of its own controls, or on nothing
    // (after a click on empty space the page itself has the focus, and a shortcut used to do nothing then)
    const onKey = e => {
      if (e.key === 'Escape' && !$('#wdz-dlmenu').hidden) { $('#wdz-dlmenu').hidden = true; return; }
      if (e.key === 'Escape' && !$('#wdz-more').hidden) { moreMenu(false); const mb = root.querySelector('[data-wdz="more"]'); if (mb) mb.focus(); return; }
      const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      keys(e);
    };
    const layered = () => !!document.querySelector('.modal-wrap:not(.hidden), dialog[open], .ui-card, .ui-sheet');
    document.addEventListener('keydown', e => {
      if (!root || root.hidden || !st || root.contains(e.target) || e.defaultPrevented || layered()) return;
      if (e.key === 'Escape') return escape();
      if (e.target === document.body || e.target === document.documentElement) onKey(e);
    });
    root.addEventListener('keydown', onKey);
    // pass 5: Ctrl J (Flint's column) and Ctrl F (find and replace) work from anywhere in the designer, even while typing
    // in a box (Flint's own box keeps its keys to itself, so these are caught on the way down)
    document.addEventListener('keydown', e => {
      if (!root || root.hidden || !st || layered() || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.code === 'KeyJ' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); return flintDock(); }
      if (e.code === 'KeyF' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); return findPanel(true); }
    }, true);
    // pass 4 polish: Tab stays inside the designer, the same rule as App Creator. The app behind is not made inert (the
    // Design flow dock, toasts and sheets live outside and must keep working); instead Tab wraps at the designer's ends,
    // and a Tab that would land in the app behind comes back. A sheet or dialog opened from here keeps its own focus.
    root.setAttribute('aria-modal', 'true');
    const tabbables = () => [...root.querySelectorAll('a[href], button, input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null && !el.closest('[hidden]'));
    const outside = el => !!(el && el.closest && el.closest('.modal-wrap, dialog, .ui-card, .ui-sheet, [role="dialog"]:not(#wdz), .dfl-dock, .dfl-chip, .toast, .les-card, .les-offer, .fls, .fls-tip, .flm, #flint-dock'));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || !root || root.hidden || !st || layered() || outside(document.activeElement)) return;
      const l = tabbables(); if (!l.length) return;
      const a = document.activeElement, inside = root.contains(a), first = l[0], last = l[l.length - 1];
      if (!inside) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    }, true);
    addEventListener('message', onFrame);
    dragList();
  }

  // ---------- paint ----------
  function paint() { if (!root || !st) return; chrome(); frame(); panelPaint(); logPaint(); status(); histPaint(); }
  function chrome() {
    if (!root || !st) return;
    const c = st.cfg, pg = pageNow();
    $('#wdz-name').textContent = c.name;
    $('#wdz-pages').innerHTML = c.pages.map((p, i) => `<button type="button" class="wdz-tab" data-page="${p.id}" aria-current="${p.id === pg.id ? 'page' : 'false'}"${i ? ` draggable="true" title="${esc(tr('Drag to change the order of the pages'))}"` : ''}>${esc(p.title)}</button>`).join('') + `<button type="button" class="wdz-tab wdz-tab-add" data-wdz="addpage" title="Add a page" aria-label="Add a page">+</button>`;
    $('#wdz-theme').value = c.theme.preset;
    const m = $('#wdz-mode'); m.setAttribute('aria-pressed', String(c.theme.mode === 'dark')); m.textContent = c.theme.mode === 'dark' ? 'Light' : 'Dark'; m.title = `Switch to the ${c.theme.mode === 'dark' ? 'light' : 'dark'} variant`;
    root.querySelector('[data-wdz="undo"]').disabled = !st.hist.length; root.querySelector('[data-wdz="redo"]').disabled = !st.fut.length;
    // pass 5: the list reads like the layers of a big editor: a grip to drag, the name (double-click or F2 to rename),
    // and on the right the eye (hide), the lock and a menu with everything else (the same menu as a right-click)
    $('#wdz-blocks').innerHTML = pg.blocks.map((b, i) => { const lab = S().BLOCKS[b.type].label.replace(/ \(.*/, ''); return `<li class="wdz-blk${st.sel && st.sel.block === b.id ? ' is-sel' : ''}${b.hidden ? ' is-hidden' : ''}${b.locked ? ' is-locked' : ''}" draggable="${b.locked ? 'false' : 'true'}" data-blk="${b.id}" data-i="${i}"><span class="wdz-grip" aria-hidden="true" title="Drag to move">${IC.grip}</span><button type="button" class="wdz-blk-t" data-pick="${b.id}" title="${esc(tr('Double-click to rename'))}"><span class="wdz-blk-n">${esc(b.name || lab)}</span><small>${esc(b.name ? `${lab} · ${b.variant}` : b.variant)}</small></button><span class="wdz-blk-acts"><button type="button" class="wdz-ba${b.hidden ? ' on' : ''}" data-hide="${b.id}" aria-label="${b.hidden ? 'Show' : 'Hide'} ${esc(b.name || lab)}" aria-pressed="${!!b.hidden}" title="${b.hidden ? 'Show on the site' : 'Hide from the site'} (H)">${b.hidden ? IC.eyeOff : IC.eye}</button><button type="button" class="wdz-ba${b.locked ? ' on' : ''}" data-lock="${b.id}" aria-label="${b.locked ? 'Unlock' : 'Lock'} ${esc(b.name || lab)}" aria-pressed="${!!b.locked}" title="${b.locked ? 'Unlock' : 'Lock so nobody changes it by accident'} (Ctrl Shift L)">${b.locked ? IC.lock : IC.unlock}</button><button type="button" class="wdz-ba" data-bmenu="${b.id}" aria-label="More for ${esc(b.name || lab)}" aria-haspopup="menu" title="More (right-click)">${IC.more}</button></span></li>`; }).join('');
    { const f0 = $('#wdz-frame'); if (f0 && f0.contentWindow && frameReady) f0.contentWindow.postMessage({ dev: st.dev }, '*'); }
    const wrap = $('#wdz-framewrap'); wrap.dataset.dev = st.dev;
    { const wb = $('#wdz-wide'), on = st.dev === 'desktop' && !!st.wide; wrap.classList.toggle('is-wide', on); if (wb) { wb.setAttribute('aria-pressed', String(on)); wb.hidden = st.dev !== 'desktop'; } }   // round 3: Desktop at a real computer width, scrolled sideways (no scaling, so every click lands where it looks)
    root.querySelectorAll('.wdz-devs [data-dev]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dev === st.dev)));
    { const rq = $('#wdz-req'); if (rq) rq.hidden = !(st.pid && connected() && window.TribeChanges); }
    applyZoom();
  }
  // the site's fonts as data: URLs: the sandboxed preview has no origin, so it cannot fetch them itself
  const FONTS = new Map(); let fontsAsked = false;
  async function loadFonts() {
    fontsAsked = true;
    const files = ['fraunces-latin-700-normal', 'instrument-serif-latin-400-normal', 'space-grotesk-latin-700-normal', 'bricolage-grotesque-latin-800-normal', 'jetbrains-mono-latin-700-normal', 'silkscreen-latin-400-normal', 'inter-latin-400-normal', 'dm-serif-display-latin-400-normal', 'outfit-latin-700-normal'];
    await Promise.all(files.map(async n => { try { const r = await fetch('assets/site-fonts/' + n + '.woff2'); if (!r.ok) return; const b = await r.blob(); FONTS.set(n, await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })); } catch {} }));
    if (FONTS.size && root && !root.hidden) frame();
  }
  // the live preview: one render per tick; if the frame does not say "ready" soon, a fresh frame gets it (Chrome can leave
  // a sandboxed srcdoc frame blank when it is re-navigated quickly, e.g. right after the designer was hidden)
  let frameT = 0, frameWd = 0, frameReady = false, softPage = null, escAt = 0, zoomAt = 0;
  function frame() {
    if (!$('#wdz-frame')) return;
    if (!fontsAsked) loadFonts();
    clearTimeout(frameT);
    frameT = setTimeout(() => {
      const f = $('#wdz-frame'); if (!f || !st) return;
      const fonts = file => FONTS.get(file) || '';
      const full = S().render(st.cfg, { page: st.page, edit: true, mode: 'single', fonts, extraHead: EDIT_CSS });
      // feat/site-editor2: split it into the site's own CSS and the page; a frame that is already up gets them as a
      // message and swaps them in place (no reload, no flash, scroll and caret stay)
      const a = full.indexOf('<style>'), b = full.indexOf('</style>', a), c = full.indexOf('<body>', b), d = full.lastIndexOf('</body>');
      const ok = a >= 0 && b > a && c > b && d > c, cssText = ok ? full.slice(a + 7, b) : '', inner = ok ? full.slice(c + 6, d) : '';
      if (ok && frameReady && softPage === st.page && f.contentWindow && f.getAttribute('srcdoc')) { f.contentWindow.postMessage({ html: inner, css: cssText, sel: st.sel ? { kind: st.sel.kind || 'block', key: `${st.sel.block}|${st.sel.path || ''}` } : null }, '*'); return; }
      const html = ok ? `${full.slice(0, a)}<style id="wdz-css">${cssText}</style>${full.slice(b + 8, c + 6)}<div id="wdz-root">${inner}</div>${EDIT_JS()}</body></html>` : full.replace('</body>', EDIT_JS() + '</body>');
      softPage = st.page;
      frameReady = false; f.srcdoc = html;
      clearTimeout(frameWd);
      frameWd = setTimeout(() => { if (frameReady || !root || root.hidden) return; const g = $('#wdz-frame'); if (!g) return; const n = g.cloneNode(false); n.removeAttribute('srcdoc'); g.replaceWith(n); n.srcdoc = html; }, 1500);
    }, 0);
  }
  function postSel(scroll) {
    const f = $('#wdz-frame'); if (!f || !f.contentWindow) return;
    const s = st.sel;
    f.contentWindow.postMessage({ sel: s ? { kind: s.kind || 'block', key: `${s.block}|${s.path || ''}` } : null, scroll }, '*');
  }
  function onFrame(e) {
    const d = e.data; if (!d || !d.sd || !root || root.hidden) return;
    const f = $('#wdz-frame'); if (!f || e.source !== f.contentWindow) return;
    if (d.t === 'ready') { frameReady = true; if (perf.t0 && !perf.ready) perf.ready = Math.round(performance.now() - perf.t0); if (cw) cw.repaint(); if (d.soft) { postSel(false); postPins(); return; } f.contentWindow.postMessage({ y: frameScroll, labels: frameLabels(), dev: st.dev }, '*'); postSel(false); postPins(); return; }
    if (d.t === 'scroll') { frameScroll = d.y; return; }
    if (d.t === 'zoom') { const now = Date.now(); if (now - zoomAt < 60) return; zoomAt = now; return zoomStep(d.dy < 0 ? 1 : -1); }
    if (d.t === 'spacing') return;
    if (d.t === 'space') {   // a spacing handle was let go: one step, one Undo
      const b = pageNow().blocks.find(x => x.id === d.block); if (!b) return;
      const v = d.value === '' ? '' : S().snapSpace(d.value);
      st.sel = { block: b.id, path: '', kind: 'block' }; commit(S().setStyle(st.cfg, st.page, b.id, { [d.side === 'pb' ? 'pb' : 'pt']: v == null ? '' : v }));
      flash(v === '' ? 'Spacing: the site’s own' : `${d.side === 'pb' ? 'Space below' : 'Space above'}: ${v}`);
      if (d.keep) setTimeout(() => { const g = $('#wdz-frame'); if (g && g.contentWindow) g.contentWindow.postMessage({ spfocus: d.side }, '*'); }, 80);
      return;
    }
    if ((d.t === 'menu' || d.t === 'pin') && st.zoom && st.zoom !== 1) { ['x', 'y', 'cx', 'cy'].forEach(k => { if (d.t === 'pin' && (k === 'x' || k === 'y')) return; if (typeof d[k] === 'number') d[k] = d[k] * st.zoom; }); }
    if (d.t === 'cw-ptr') { if (cw) cw.pointer(d.a || null); return; }   // feat/cowork-editors: the frame measures its own pointer
    if (d.t === 'esc') {   // Esc pressed inside the preview: with nothing left to step out of, the first press says so and the second closes
      const nothing = !st.sel && !st.cmode && ['#wdz-dlmenu', '#wdz-more', '#wdz-keys', '#wdz-peek', '#wdz-picker', '#wdz-find', '#wdz-hist'].every(id => { const x = $(id); return !x || x.hidden; }) && !(SP() && SP().menuOpen && SP().menuOpen());
      if (nothing && Date.now() - escAt > 2500) { escAt = Date.now(); toast('Press Esc again to close the designer'); return; }
      escAt = 0; return escape();
    }
    if (d.t === 'page') { if (d.id === st.page) { if (d.key) { st.sel = { block: '@', path: String(d.key).split('|')[1] || '', kind: 'text' }; st.panel = 'edit'; panelPaint(); } return; } flushText(); st.page = d.id; st.sel = null; frameScroll = 0; paint(); return; }
    if (d.t === 'tb' || d.t === 'menu' || d.t === 'sys' || d.t === 'key') { if (d.t !== 'key') flushText(); if (d.t === 'key') { if ((d.ctrl || d.meta) && !d.alt && d.code === 'KeyJ') return flintDock(); if ((d.ctrl || d.meta) && d.code === 'KeyF') return findPanel(true); return keys({ key: d.key, code: d.code || '', ctrlKey: d.ctrl, metaKey: d.meta, altKey: d.alt, shiftKey: d.shift, preventDefault() {}, target: null }); } return SP() && SP().frame(d, spApi, f.getBoundingClientRect()); }
    if (d.t === 'undo') return undo();
    if (d.t === 'redo') return redo();
    if (d.t === 'select') {
      if (SP()) SP().closeMenu();
      st.multi = [];
      if (!d.key) { if (st.sel) { st.sel = null; if (st.panel === 'edit') panelPaint(); chipKey = ''; logPaint(); $('#wdz-blocks').querySelectorAll('.wdz-blk.is-sel').forEach(li => li.classList.remove('is-sel')); } return; }
      const k = String(d.key), i = k.indexOf('|'), block = k.slice(0, i), path = k.slice(i + 1);
      const same = st.sel && st.sel.block === block && st.sel.path === path && st.sel.kind === (d.kind || 'block') && st.panel === 'edit';
      st.sel = { block, path, kind: d.kind || 'block' }; st.panel = 'edit'; panelPaint(); logPaint();   // a click in the page always shows what was clicked
      if (!same) { const ib = $('#wdz-insp'); if (ib) ib.scrollTop = 0; }   // a new selection starts at the top of its panel
      $('#wdz-blocks').querySelectorAll('.wdz-blk').forEach(li => li.classList.toggle('is-sel', li.dataset.blk === block));
      if (cw) cw.select(`${st.sel.kind}:${block}|${path}`); return;
    }
    if (d.t === 'text') {
      const ek = 'text:' + d.key;
      if (cw && cwEditing !== ek) { if (!cw.guard(ek)) { liveText = null; paint(); return; } cwEditing = ek; cw.editing(ek); }   // someone else is typing here
    }
    if (d.t === 'text') { liveText = d; clearTimeout(liveT); liveT = setTimeout(() => { if (liveText) { const l = liveText; commitText(l); } }, 900); return; }
    if (d.t === 'commit') return commitText(d);
    if (d.t === 'pin') return commentAt(d);
    if (d.t === 'multi') { flushText(); st.multi = (d.list || []).map(x => { const k = String(x.key), i = k.indexOf('|'); return { block: k.slice(0, i), path: k.slice(i + 1), kind: x.kind || 'block' }; }); st.sel = null; st.panel = 'edit'; panelPaint(); return; }
    if (d.t === 'focus') { const k = String(d.key), bid = k.slice(0, k.indexOf('|')), path = k.slice(k.indexOf('|') + 1); let c = S().setProp(st.cfg, st.page, bid, path + 'fx', Math.max(0, Math.min(100, +d.x || 0))); c = S().setProp(c, st.page, bid, path + 'fy', Math.max(0, Math.min(100, +d.y || 0))); c = S().setProp(c, st.page, bid, path + 'pos', ''); return commit(c); }
    if (d.t === 'imove') {   // an entry dragged to a new place among its own kind
      const k = String(d.key), bid = k.slice(0, k.indexOf('|')), item = k.slice(k.indexOf('|') + 1), list = item.replace(/\.\d+$/, ''); const mv = moveEntry(bid, list, +d.from, +d.to), c = mv.cfg, i = mv.i;
      const own = st.sel && st.sel.block === bid ? String(st.sel.path || '') : '', rest = own.indexOf(item) === 0 ? own.slice(item.length) : null;
      st.sel = rest != null && st.sel.kind !== 'item' ? { block: bid, path: `${list}.${i}${rest}`, kind: st.sel.kind } : { block: bid, path: `${list}.${i}`, kind: 'item' };
      return commit(c);
    }
    if (d.t === 'move') { commit(S().moveBlock(st.cfg, st.page, d.block, +d.to)); st.sel = { block: d.block, path: '', kind: 'block' }; return; }
    if (d.t === 'icon') return STU() && STU().iconPicker(stuApi, d.key);
    if (d.t === 'dropblock') { const a = st.dragAdd; if (a) addAt(a, +d.gap); return; }   // pass 5: a new block dragged onto the page
    if (d.t === 'dropimg') {   // pass 5: a picture file dropped onto a picture on the page
      const k = String(d.key), bid = k.slice(0, k.indexOf('|')), path = k.slice(k.indexOf('|') + 1), f2 = d.file, b = pageNow().blocks.find(x => x.id === bid);
      if (!b || !f2) return; if (f2.size > 12 * 1024 * 1024) return say('That picture is over 12 MB. Try a smaller one.');
      shrink(f2).then(src => { st.sel = { block: bid, path, kind: 'image' }; if (commit(S().setImage(st.cfg, st.page, bid, path, src, S().getAt(b.props, path + 'alt') || String(f2.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')))) flash(tr('Picture replaced')); }).catch(() => say('That picture could not be read.'));
      return;
    }
    if (d.t === 'act') {
      const id = d.block;
      if (d.act === 'unlock') return toggleLock(id);
      if (d.act === 'up' || d.act === 'down') { st.sel = { block: id, path: '', kind: 'block' }; return commit(S().moveBlock(st.cfg, st.page, id, d.act)); }
      if (d.act === 'dup') { const r = S().duplicateBlock(st.cfg, st.page, id); commit(r.cfg); st.sel = { block: r.block.id, path: '', kind: 'block' }; paint(); return; }
      if (d.act === 'del') return commit(S().removeBlock(st.cfg, st.page, id));
      if (d.act === 'add') { st.addAfter = id; const p = $('#wdz-picker'); p.hidden = false; p.innerHTML = picker(); const ab = root.querySelector('[data-wdz="picker"]'); if (ab) ab.setAttribute('aria-expanded', 'true'); p.scrollIntoView({ block: 'nearest' }); const f1 = p.querySelector('button'); if (f1) f1.focus(); return; }
    }
    if (d.t === 'pinopen') { st.panel = 'comments'; panelPaint(); const el = $(`[data-cmt="${CSS.escape(d.id)}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); return; }
  }

  function commitText(d) {
    liveText = null;
    if (cw && !cwEditing && d && d.key && cw.lockedBy('text:' + d.key)) { cw.guard('text:' + d.key); paint(); return; }
    if (cw && cwEditing) { cwEditing = ''; cw.editing(null); }
    const [block, path] = String(d.key).split('|');
    if (block === '@') { const next = S().setSiteText(st.cfg, path, String(d.value || '')); if (JSON.stringify(next) === JSON.stringify(st.cfg)) return; st.hist.push(JSON.stringify(st.cfg)); st.fut = []; st.cfg = S().normalize(next); save(); chrome(); if (st.panel === 'edit' || st.panel === 'site') panelPaint(); return; }
    const b = pageNow().blocks.find(x => x.id === block); if (!b) return;
    if (b.locked) { toast(`${blkName(b)} is locked. Unlock it to change it.`); paint(); return; }
    const v = String(d.value || '').replace(/\u00a0/g, ' ').trim(), old = String(S().getAt(b.props, path) ?? '');
    if (old === v) return;
    st.hist.push(JSON.stringify(st.cfg)); st.fut = []; st.cfg = S().setProp(st.cfg, st.page, block, path, v);
    save(); const u = root.querySelector('[data-wdz="undo"]'); if (u) u.disabled = false; const r2 = root.querySelector('[data-wdz="redo"]'); if (r2) r2.disabled = true;
    // pass 5: the panel's own box for these words follows what was typed on the page (a button's Text box did not, so an
    // edit made there later wrote the old words back over the new ones). A box the person already changed is left alone.
    const lab = /\.label$/.test(path) ? root.querySelector(`#wdz-insp [data-lab="${CSS.escape(path.replace(/\.label$/, ''))}"]`) : null;
    const live = lab || root.querySelector('#wdz-insp [data-etext]');
    if (st.panel === 'edit') { if (live && st.sel && st.sel.block === block && (document.activeElement !== live || live.value === old)) live.value = v; else if (!live) inspector(); }
  }
  const flushText = () => { if (liveText) commitText(liveText); };
  // feat/site-editor2: the element tools (app/ui/siteparts.js): one element's look, list entries, the right-click menu,
  // the pages list, the path of what is selected
  const SP = () => window.TribeSiteParts;
  // the suggestions drawn from the tribe (app/ui/sitesuggest.js)
  const SG = () => window.TribeSiteSuggest;
  const sgApi = () => ({ ...spApi, panelNow: () => st.panel, flush: () => flush(), close: () => close(), addComment: c => addComment(c) });
  const tr = t => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(t, t) : t);
  const frameLabels = () => ({ locked: tr('Locked'), unlock: tr('Locked. Click to unlock'), isEditing: tr('is editing'), smaller: tr('Smaller'), bigger: tr('Bigger'), bold: tr('Bold'), color: tr('Colour'), align: tr('Align'), link: tr('Where it goes'), up: tr('Move up'), down: tr('Move down'), dup: tr('Duplicate'), add: tr('Add another'), del: tr('Remove'), flint: tr('Ask Flint about this'), more: tr('More'), replace: tr('Replace the picture'), fit: tr('Fill or fit'), swap: tr('Swap the icon'), words: tr('Edit the words'), grip: tr('Drag to move this section'), sadd: tr('Add a section below'), igrip: tr('Drag to move it'), ital: tr('Slanted'), wlink: tr('Link the selected words'), spaceAbove: tr('Space above: drag, or press the arrow keys'), spaceBelow: tr('Space below: drag, or press the arrow keys') });
  const spApi = { setMulti: l => { st.multi = l || []; }, multi: () => st.multi || [], clearMulti: () => { st.multi = []; const f = $('#wdz-frame'); if (f && f.contentWindow) f.contentWindow.postMessage({ multi: 'none' }, '*'); }, sel: () => st.sel, setSel: s => { st.sel = s; }, cfg: () => st.cfg, commit: (c, o) => commit(c, o), page: () => st.page, setPage: id => { st.page = id; st.sel = null; frameScroll = 0; }, pageNow: () => pageNow(), say: (t, h, a) => say(t, h, a), ask: t => ask(t), pid: () => st.pid, connected: () => connected(),
    paint: () => paint(), panel: p => { if (p) st.panel = p; panelPaint(); }, postSel: sc => postSel(sc), post: m => { const f = $('#wdz-frame'); if (f && f.contentWindow) f.contentWindow.postMessage(m, '*'); }, root: () => root, box: () => $('#wdz-insp'),
    pickFile: () => pickFile(), iconPicker: key => STU() && STU().iconPicker(stuApi, key), comment: () => commentMode(true), fillFlint: t => { if (fui) fui.fill(t); }, undo: () => undo(), canEdit: () => st.canEdit !== false, dev: () => st.dev, comments: () => st.comments, tr,
    blockMenu: () => ({ paste: !!readClip(), look: !!readLook() }), blockAct: (v, b) => blockAct(v, b) };
  // ---------- feat/design-site2: Style, Check and "Have my agent do it" live in app/ui/sitestudio.js ----------
  const STU = () => window.TribeSiteStudio;
  const stuApi = { sel: () => st.sel, cfg: () => st.cfg, commit: c => commit(c), say: (t, h, a) => say(t, h, a), undo: () => undo(), pid: () => st.pid, page: () => st.page, connected: () => connected(), ask: t => ask(t),
    render: (c, o) => S().render(c, { ...o, fonts: file => FONTS.get(file) || '', extraHead: EDIT_CSS }), frameJs: () => EDIT_JS(),
    select: (block, pg) => { if (pg && st.cfg.pages.some(p => p.id === pg)) st.page = pg; st.sel = { block, path: '', kind: 'block' }; st.panel = 'edit'; paint(); postSel(true); } };
  // ---------- feat/site-v2: the right panel (Edit · Comments · Site), the block picker, shortcuts ----------
  // four tabs: Ideas holds Suggestions and Comments, Style holds Look and Site settings
  const GROUP = { comments: 'ideas', site: 'style' };
  function panelPaint() {
    if (!root || !st) return;
    const grp = GROUP[st.panel] || st.panel; st.sub = st.sub || {}; if (GROUP[st.panel] || st.panel === 'ideas' || st.panel === 'style') st.sub[grp] = st.panel;
    root.querySelectorAll('.wdz-ptabs [data-panel]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.panel === grp)));
    root.querySelectorAll('.wdz-sub').forEach(x => { x.hidden = x.id !== 'wdz-sub-' + grp; });
    root.querySelectorAll('.wdz-sub [data-panel]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.panel === st.panel)));
    const open = st.comments.filter(c => c.status === 'open').length;
    [$('#wdz-cn'), $('#wdz-cn2'), $('#wdz-cn3')].forEach(n => { if (n) { n.hidden = !open || (n.id === 'wdz-cn3' && grp === 'ideas'); n.textContent = open; } });
    if (st.panel === 'comments') return commentsPaint();
    if (st.panel === 'site') return sitePaint();
    if (st.panel === 'ideas' && SG()) return SG().paint($('#wdz-insp'), sgApi());
    if ((st.panel === 'style' || st.panel === 'check') && STU()) return STU().paint(st.panel, $('#wdz-insp'), stuApi);
    inspector();
    const s = st.sel, b = s && s.kind === 'block' && pageNow().blocks.find(x => x.id === s.block), box = $('#wdz-insp');
    if (b && box) {
      const sty = b.style || {}, B = (k, v, l) => `<button type="button" class="btn sm" data-sty="${k}" data-val="${v}" aria-pressed="${(sty[k] || '') === v}">${l}</button>`;
      box.insertAdjacentHTML('beforeend', `<p class="wdz-f"><span>Background</span></p><p class="wdz-row" role="group" aria-label="Background">${B('bg', '', 'None')}${B('bg', 'card', 'Tint')}${B('bg', 'accent', 'Accent')}${B('bg', 'ink', 'Dark')}</p>
        <p class="wdz-f"><span>Spacing</span></p><p class="wdz-row" role="group" aria-label="Spacing">${B('pad', 's', 'Tight')}${B('pad', '', 'Normal')}${B('pad', 'l', 'Roomy')}</p>
        ${SP() ? SP().section(b, spApi) : ''}
        ${SP() && SP().formRow ? SP().formRow(b, spApi) : ''}
        <p class="wdz-row"><button type="button" class="btn sm" data-dup="${b.id}">Duplicate</button><button type="button" class="btn sm" data-hide="${b.id}" aria-pressed="${!!b.hidden}">${b.hidden ? 'Show on the site' : 'Hide from the site'}</button><button type="button" class="btn sm" data-wdz="comment">Comment here</button></p>`);
      if (SP()) SP().said(spApi);
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
      // feat/design-site2: steps (numbered circles), visit us (facts in columns or a card with a button), timeline (a line with dots)
      steps: v === 'stack' ? [0, 1, 2].map(i => `<circle cx="9" cy="${8 + i * 12}" r="3.5" fill="currentColor" opacity=".6"/>` + R(17, 5.5 + i * 12, 22, 2.5, .5) + R(17, 9.5 + i * 12, 34, 2, .25)).join('') : [0, 1, 2].map(i => `<circle cx="${10 + i * 19}" cy="11" r="4" fill="currentColor" opacity=".6"/>` + R(5 + i * 19, 20, 12, 2.5, .5) + R(5 + i * 19, 25, 14, 2, .25) + R(5 + i * 19, 29, 10, 2, .25)).join(''),
      info: v === 'card' ? R(4, 4, 52, 32, .15) + [0, 1, 2].map(i => R(8, 9 + i * 7, 9, 2, .3) + R(20, 9 + i * 7, 22, 2.5, .5)).join('') + R(8, 29, 14, 4.5, .8) : R(4, 5, 20, 4, .6) + [0, 1, 2].map(i => R(4 + i * 18, 16, 8, 2, .3) + R(4 + i * 18, 21, 14, 2.5, .5) + R(4 + i * 18, 26, 11, 2, .25)).join(''),
      timeline: v === 'cards' ? [0, 1, 2].map(i => R(4 + i * 18, 8, 15, 24, .2) + R(6 + i * 18, 11, 7, 2, .6) + R(6 + i * 18, 16, 11, 2, .3) + R(6 + i * 18, 20, 9, 2, .3)).join('') : R(9.25, 4, 1.5, 32, .3) + [0, 1, 2].map(i => `<circle cx="10" cy="${8 + i * 12}" r="2.5" fill="currentColor" opacity=".7"/>` + R(17, 5.5 + i * 12, 10, 2, .3) + R(17, 9.5 + i * 12, 30, 2.5, .5)).join(''),
    }[type] || lines(4, 6, 6, 52);
    return `<svg viewBox="0 0 60 40" width="60" height="40" aria-hidden="true">${body}</svg>`;
  }
  function picker() {
    const C2 = S().CATS || {}, groups = {};
    S().TYPES.forEach(t => { const g = C2[t] || 'More'; (groups[g] = groups[g] || []).push(t); });
    return Object.entries(groups).map(([g, ts]) => `<p class="wdz-eyebrow">${esc(g)}</p>${ts.map(ty => `<div class="wdz-pk"><b>${esc(S().BLOCKS[ty].label)}</b><span class="wdz-pkv">${S().BLOCKS[ty].variants.map(v => `<button type="button" class="wdz-pkb" draggable="true" data-add="${ty}" data-v="${v}" title="Add ${esc(S().BLOCKS[ty].label.toLowerCase())}: ${esc(v)}. Or drag it onto the page.">${schem(ty, v)}<small>${esc(v)}</small></button>`).join('')}</span></div>`).join('')}`).join('') + (window.TribeSiteFxUI ? window.TribeSiteFxUI.picker() : '');   // feat/site-3d
  }
  const KEYS = [
    ['Edit', [['Ctrl Z · Ctrl Shift Z', 'Undo · Redo'], ['Enter · Double-click', 'Type in the selected words'], ['Ctrl D', 'Duplicate the selected section or entry'], ['Delete', 'Remove the selected section or entry'], ['Ctrl C · Ctrl X · Ctrl V', 'Copy, cut and paste a section, on any page'], ['Ctrl Alt C · Ctrl Alt V', 'Copy a section’s look, paste it on another'], ['Ctrl V on selected words', 'Paste a link: the words become a link'], ['Ctrl F', 'Find and replace words on every page']]],
    ['Sections', [['Alt ↑ · Alt ↓', 'Move the selected section or entry'], ['Drag', 'Move a section, an entry or a page; drag a new block onto the page'], ['F2', 'Rename the section in the list'], ['H', 'Hide or show the selected section'], ['Ctrl Shift L', 'Lock or unlock the selected section'], ['Right-click', 'Everything you can do with it']]],
    ['Move around', [['↑ · ↓', 'Select the section above or below'], ['Tab · Shift Tab', 'Select the next or the last section (on the page)'], ['Shift click', 'Select several things'], ['Esc', 'Stop typing, step out to what holds it, close']]],
    ['View', [['1 · 2 · 3', 'Desktop · Tablet · Phone'], ['Ctrl + · Ctrl −', 'Zoom in · Zoom out'], ['Ctrl 0 · Shift 1', '100% · Fit the width'], ['Ctrl J', 'Show or hide Flint'], ['C', 'Comment mode'], ['Ctrl S', 'Save a version'], ['?', 'These shortcuts']]]];
  function shortcuts() { const k = $('#wdz-keys'); k.hidden = !k.hidden; if (k.hidden) return; k.innerHTML = `<div class="wdz-keys-in" role="document"><p class="wdz-eyebrow">Website designer</p><h2 class="wdz-keys-h">Keyboard shortcuts</h2><div class="wdz-keys-g">${KEYS.map(([g, rows]) => `<section><h3>${esc(g)}</h3><dl>${rows.map(([a, b]) => `<dt>${a.split(' · ').map(x => `<kbd>${esc(x)}</kbd>`).join(' ')}</dt><dd>${esc(b)}</dd>`).join('')}</dl></section>`).join('')}</div><p class="wdz-hint">On a Mac, Ctrl is ⌘.</p><button type="button" class="btn sm" data-wdz="keys">Close</button></div>`; const c = k.querySelector('button'); if (c) c.focus(); }
  // Esc peels one layer: a popover, comment mode, the selection, then the designer itself (like the other full panes)
  function escape() {
    if (!root || root.hidden) return;
    for (const id of ['#wdz-dlmenu', '#wdz-more', '#wdz-keys', '#wdz-peek', '#wdz-picker', '#wdz-find', '#wdz-hist']) { const x = $(id); if (x && !x.hidden) { if (id === '#wdz-more') moreMenu(false); else x.hidden = true; return; } }
    if (st && st.cmode) return commentMode(false);
    if (SP() && SP().closeMenu()) return;
    if (st && st.multi && st.multi.length) { spApi.clearMulti(); panelPaint(); return; }
    if (st && st.sel) { flushText(); st.sel = SP() ? SP().parentOf(st.sel) : null; st.panel = 'edit'; panelPaint(); postSel(false); chipKey = ''; logPaint(); $('#wdz-blocks').querySelectorAll('.wdz-blk').forEach(li => li.classList.toggle('is-sel', !!st.sel && li.dataset.blk === st.sel.block)); return; }
    close();
  }
  function keys(e) {
    const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const sb = st.sel && pageNow().blocks.find(b => b.id === st.sel.block), mod = e.ctrlKey || e.metaKey;
    if (e.key === '?') { e.preventDefault(); return shortcuts(); }
    if (e.key === 'Escape') return escape();
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); return zoomStep(1); }
    if (mod && (e.key === '-' || e.key === '_')) { e.preventDefault(); return zoomStep(-1); }
    if (mod && e.key === '0') { e.preventDefault(); return setZoom(1); }
    if (!mod && e.key === '!') { e.preventDefault(); return setZoom('fit'); }
    if (mod && e.key.toLowerCase() === 'v' && !e.shiftKey && !e.altKey && readClip()) { e.preventDefault(); return pasteSection(); }
    if (!mod && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && st.sel && st.sel.kind === 'block' && (!t || t === document.body || t === root || (t.closest && t.closest('.wdz-left, .wdz-stage')))) { const bs = pageNow().blocks, i = bs.findIndex(b => b.id === st.sel.block), n = i < 0 ? null : bs[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { e.preventDefault(); st.sel = { block: n.id, path: '', kind: 'block' }; st.panel = 'edit'; panelPaint(); logPaint(); postSel(true); $('#wdz-blocks').querySelectorAll('.wdz-blk').forEach(li => li.classList.toggle('is-sel', li.dataset.blk === n.id)); } return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return saveVersion(); }
    if (!mod && !e.altKey && /^[123]$/.test(e.key)) { st.dev = ['desktop', 'tablet', 'phone'][+e.key - 1]; return chrome(); }
    if (!mod && e.key.toLowerCase() === 'c') return commentMode(!st.cmode);
    if (st.multi && st.multi.length > 1 && SP() && (e.key === 'Delete' || e.key === 'Backspace') && !mod) { e.preventDefault(); return SP().multiAct(spApi, 'del'); }
    // pass 5: Tab and Shift Tab step through the sections on the page (from the page itself; the panel keeps its own Tab)
    if (e.key === 'Tab' && !mod && !e.altKey && !t) { const bs = pageNow().blocks; if (!bs.length) return; const i = sb ? bs.indexOf(sb) : -1, n = bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]; flushText(); st.sel = { block: n.id, path: '', kind: 'block' }; st.panel = 'edit'; panelPaint(); logPaint(); postSel(true); $('#wdz-blocks').querySelectorAll('.wdz-blk').forEach(li => li.classList.toggle('is-sel', li.dataset.blk === n.id)); return; }
    if (!sb) return;
    if (e.key === 'F2') { e.preventDefault(); return renameBlock(sb.id); }
    if (mod && e.shiftKey && (e.code === 'KeyL' || e.key.toLowerCase() === 'l')) { e.preventDefault(); return toggleLock(sb.id); }
    if (mod && e.altKey && e.code === 'KeyC') { e.preventDefault(); return copyLook(sb); }
    if (mod && e.altKey && e.code === 'KeyV') { e.preventDefault(); return pasteLook(sb); }
    if (SP() && st.sel.kind !== 'block' && SP().key(e, spApi)) return;   // an entry, a picture, an element: its own shortcuts
    if (st.sel.kind !== 'block' && !mod && !e.altKey && e.key.toLowerCase() !== 'h') return;   // Delete with words selected never removes the whole section
    if (mod && e.key.toLowerCase() === 'c' && st.sel.kind === 'block') { if (t && String(getSelection() || '')) return; e.preventDefault(); return copySection(sb); }
    if (mod && e.key.toLowerCase() === 'x' && st.sel.kind === 'block') { e.preventDefault(); copySection(sb, true); st.sel = null; return commit(S().removeBlock(st.cfg, st.page, sb.id)); }
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
    if (!tribeComments()) return say('Tasks belong to a tribe. Start or join one and the comments here become tasks for the team; for now they stay on this device.');
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
      ${SP() ? SP().pages(spApi) : ''}
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
    if (SP()) SP().wire(box, spApi);
  }
  let picFor = null;
  async function siteAction(el) {
    const k = el.dataset.site;
    if (k === 'tasks') { close(); try { window.TribeShell && window.TribeShell.go ? window.TribeShell.go('tasks') : (location.hash = '#/tasks/board'); } catch {} return; }
    if (k === 'space') return commit(S().setSpace(st.cfg, el.dataset.val));
    if (k === 'nologo') return commit(S().setLogo(st.cfg, '', false));
    if (k === 'logofav') return commit(S().setSeo(st.cfg, { favicon: st.cfg.logo }));
    if (k === 'logo' || k === 'favicon' || k === 'share' || k === 'pageshare') { picFor = k; fileFor = null; const f = $('#wdz-file'); f.value = ''; f.click(); return; }
    if (k === 'fill') { const r = await autofill(st.cfg); commit(r.cfg); fillNote(r.used); if (!r.used.length) say('The project has nothing to fill in yet: give it a bio, a vision doc, members or tasks.'); return; }
  }

  // ---------- the template gallery (feat/site-v2): thumbnails, categories, search, Use this, a larger peek ----------
  const gal = { list: [], cats: [], cat: 'All', q: '', hov: null, ht: 0, kind: '' };
  async function loadGallery() {
    if (gal.list.length) return;
    try { const r = await fetch('sitetpl/catalog.json'); if (r.ok) { const j = await r.json(); gal.list = j.templates || []; gal.cats = j.categories || []; } } catch {}
    if (!gal.list.length && connected()) { try { const j = await C.api('/site-designer/templates'); gal.list = j.templates || []; gal.cats = j.categories || []; } catch {} }
    if (!gal.list.length) gal.list = S().TEMPLATES.map(id => ({ id, title: id.charAt(0).toUpperCase() + id.slice(1), summary: '', category: '' }));
  }
  function galPaint() {
    const box = $('#wdz-gal'); if (!box) return;
    const q = gal.q.trim().toLowerCase();
    const base = gal.kind && gal.kind !== 'all' && DD() ? DD().siteTemplatesFor(gal.list, gal.kind, q ? 0 : 12) : gal.list;   // p5-start: one kind's templates, best first
    const list = base.filter(t => (gal.kind !== 'all' || gal.cat === 'All' || t.category === gal.cat) && (!q || `${t.title} ${t.summary} ${t.category} ${(t.tags || []).join(' ')} ${t.source || ''}`.toLowerCase().includes(q)));
    $('#wdz-gcats').innerHTML = ['All', ...gal.cats].map(c => `<button type="button" class="wdz-chip" data-gcat="${esc(c)}" aria-pressed="${c === gal.cat}">${esc(c)}</button>`).join('');
    box.innerHTML = list.length ? list.map(t => `<div class="wdz-tpl" data-tpl="${esc(t.id)}" data-title="${esc(t.title)}" role="button" tabindex="0" aria-label="Use the ${esc(t.title)} template"><span class="wdz-tthumb">${t.thumb ? `<img src="${esc(t.thumb)}" alt="" loading="lazy" width="480" height="360">` : ''}</span><b>${esc(t.title)}</b><small>${esc(t.summary)}</small><span class="wdz-tmeta"><span class="wdz-tcat">${esc(t.category || '')}</span>${t.source && t.source !== 'TribeCode' ? `<span class="wdz-tsrc" title="${esc(t.source)} · ${esc(t.license)}">${esc(t.license)}</span>` : ''}</span><span class="wdz-tact"><button type="button" class="btn sm primary" data-tpl="${esc(t.id)}" data-title="${esc(t.title)}">Use this</button><button type="button" class="btn sm ghost" data-peek="${esc(t.id)}">Peek</button></span></div>`).join('') : `<p class="wdz-hint">No template matches “${esc(gal.q)}”. Try another word, or start blank.</p>`;
    box.querySelectorAll('img').forEach(i => { i.onerror = () => i.remove(); });
    $('#wdz-gcount').textContent = `${list.length} of ${gal.kind && gal.kind !== 'all' && DD() ? DD().siteTemplatesFor(gal.list, gal.kind).length : gal.list.length}`;
  }
  async function peek(id, hover) {
    const t = gal.list.find(x => x.id === id), pk = $('#wdz-peek'); if (!t) return;
    pk.hidden = false; pk.innerHTML = `<div class="wdz-peek-in"><p class="wdz-row"><b>${esc(t.title)}</b><span class="wdz-hint">${esc(t.category || '')}${t.source && t.source !== 'TribeCode' ? ` · from ${esc(t.source)} (${esc(t.license)})` : ''}</span><span class="wdz-sp"></span><button type="button" class="btn sm primary" data-tpl="${esc(t.id)}" data-title="${esc(t.title)}">Use this</button><button type="button" class="btn sm ghost" data-peekclose="1" aria-label="Close preview">Close</button></p><div class="wdz-peek-f"><iframe title="Preview of ${esc(t.title)}" sandbox="" loading="lazy"></iframe></div></div>`;
    const c = await templateCfg(id); if (!c || pk.hidden) return;
    const fonts = file => FONTS.get(file) || ''; if (!fontsAsked) loadFonts();
    pk.querySelector('iframe').srcdoc = S().render(c, { fonts, go: false });
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
    if (st.multi && st.multi.length > 1 && SP() && SP().multi) return SP().multi(box, spApi);
    if (s && s.block === '@' && SP()) return SP().siteSel(box, spApi);
    if (!b) { box.innerHTML = `<p class="wdz-eyebrow">Edit</p><p class="wdz-hint">Click anything in the preview. Words: click and type. Buttons: pick where they go. Pictures: replace, round or square.</p><p class="wdz-hint">Right-click anything for more. Esc steps out to what holds it.</p>`; return; }
    const BL = S().BLOCKS[b.type];
    if (SP() && /^(text|item|icon|field)$/.test(s.kind)) return SP().element(box, b, spApi);
    if (s.kind === 'button') {
      const h = S().getAt(b.props, s.path) || {}, l = h.link || {}, val = l.kind === 'page' ? `page:${l.to}` : l.kind === 'section' ? `section:${l.to}` : l.kind || '';
      box.innerHTML = `<p class="wdz-eyebrow">Button</p><label class="wdz-f"><span>Text</span><input class="input" data-lab="${esc(s.path)}" value="${esc(h.label || '')}"></label>
        <label class="wdz-f"><span>Goes to</span><select class="input" id="wdz-link"><option value="">Not linked yet</option><optgroup label="Pages">${st.cfg.pages.map(p => `<option value="page:${p.slug}"${val === 'page:' + p.slug ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</optgroup><optgroup label="Sections">${sectionOptions().map(([v, t]) => `<option value="${v}"${val === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</optgroup><option value="url"${val === 'url' ? ' selected' : ''}>A web address…</option><option value="email"${val === 'email' ? ' selected' : ''}>An email address…</option></select></label>
        <label class="wdz-f" id="wdz-link-to-w"${/^(url|email)$/.test(val) ? '' : ' hidden'}><span>${val === 'email' ? 'Email' : 'Address'}</span><input class="input" id="wdz-link-to" value="${esc(/^(url|email)$/.test(val) ? l.to : '')}" placeholder="${val === 'email' ? 'you@example.com' : 'https://'}"></label>
        <p class="wdz-hint">Or tell Flint: “link this button to the contact page”.</p>${SP() ? SP().looks(b, s, spApi) : ''}`;
      if (SP()) box.insertAdjacentHTML('afterbegin', SP().crumbs(b, s, spApi));
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
        <label class="wdz-f"><span>Alt text (what it shows)</span><input class="input" id="wdz-alt" value="${esc(alt)}" placeholder="Mara at the wheel, glazing a mug"></label><div id="wdz-board" class="wdz-board" hidden></div>${STU() && STU().illusRow ? STU().illusRow(stuApi) : ''}${SP() ? SP().picture(b, s, spApi) : ''}`;
      if (SP()) box.insertAdjacentHTML('afterbegin', SP().crumbs(b, s, spApi));
      box.querySelector('#wdz-alt').addEventListener('change', e => commit(S().setImage(st.cfg, st.page, b.id, s.path, src, e.target.value.trim())));
      return;
    }
    const strings = Object.entries(b.props).filter(([k, v]) => typeof v === 'string' && !/^(img|alt|shape)$/.test(k));
    const lists = Object.entries(b.props).filter(([, v]) => Array.isArray(v));
    box.innerHTML = `<p class="wdz-eyebrow">${esc(BL.label)}</p>
      <p class="wdz-f"><span>Layout</span></p><p class="wdz-row wdz-vars" role="group" aria-label="Layout">${BL.variants.map(v => `<button type="button" class="btn sm" data-var="${v}" aria-pressed="${v === b.variant}">${esc(v)}</button>`).join('')}</p>
      ${strings.map(([k, v]) => `<label class="wdz-f"><span>${esc((BL.fields && BL.fields[k]) || (k === 'url' ? 'Video or embed link' : k === 'action' ? 'Form link (Formspree, Google Forms…)' : k))}</span>${v.length > 70 || k === 'text' || k === 'bio' ? `<textarea class="input" rows="3" data-prop="${k}">${esc(v)}</textarea>` : `<input class="input" data-prop="${k}" value="${esc(v)}">`}</label>`).join('')}
      ${lists.map(([k, v]) => SP() ? SP().list(b, k, v, spApi) : `<p class="wdz-row wdz-list"><span>${esc(k)}: ${v.length}</span><button type="button" class="btn sm" data-item="add" data-k="${k}">+ Add</button><button type="button" class="btn sm ghost" data-item="del" data-k="${k}"${v.length ? '' : ' disabled'}>− Remove last</button></p>`).join('')}
      ${'img' in b.props ? `<p class="wdz-row"><button type="button" class="btn sm" data-selimg="1">Picture…</button></p>` : ''}`;
    box.querySelectorAll('[data-prop]').forEach(i => i.addEventListener('change', () => commit(S().setProp(st.cfg, st.page, b.id, i.dataset.prop, i.value))));
    if (SP()) box.insertAdjacentHTML('afterbegin', SP().crumbs(b, s, spApi));
    if (window.TribeSiteFxUI) window.TribeSiteFxUI.row(box, stuApi, b);   // feat/site-3d: the moving background behind this section
  }
  function itemTemplate(b, k) { const d = S().BLOCKS[b.type].make(st.cfg.name)[k]; const last = (b.props[k] || []).slice(-1)[0]; return JSON.parse(JSON.stringify(last || (d && d[0]) || { label: 'New', link: { kind: '', to: '' } })); }

  // ---------- clicks ----------
  async function onClick(e) {
    const t = e.target, a = t.closest('[data-wdz]'), pg = pageNow();
    if (t.closest('[data-peek]')) { peek(t.closest('[data-peek]').dataset.peek); return; }
    if (t.closest('[data-tpl]')) { const x = t.closest('[data-tpl]'); const pk = $('#wdz-peek'); if (pk) pk.hidden = true; const had = hasSite(); if (!(await okToReplace())) return; await useTemplate(x.dataset.tpl); say(had ? `Started from the ${x.dataset.title || 'chosen'} template. Undo brings back what you had.` : `Started from the ${x.dataset.title || 'chosen'} template. Click anything to change it.`); return; }
    if (t.closest('[data-start="blank"]')) { hideStart(); paint(); return; }
    if (t.closest('#wdz-start [data-kind]')) {   // p5-start: a kind of site, All kinds, See all, or Blank
      const k = t.closest('[data-kind]').dataset.kind, from = $('#wdz-start').dataset.from === '1';
      if (k === 'blank') { if (hasSite()) { if (!(await okToReplace())) return; commit(S().blank(st.cfg.name)); say(tr('Started from a blank page. Undo brings back what you had.')); } hideStart(); paint(); return; }
      gal.q = ''; gal.cat = 'All'; await showStart(from, k); const f = $('#wdz-start [data-kind], #wdz-start .wdz-tpl'); if (f && k) { const q = $('#wdz-gq'); (q || f).focus({ preventScroll: true }); } return;
    }
    if (t.closest('[data-page]') && !a) { st.page = t.closest('[data-page]').dataset.page; st.sel = null; frameScroll = 0; paint(); return; }
    if (t.closest('[data-dev]') && t.closest('.wdz-devs')) { st.dev = t.closest('[data-dev]').dataset.dev; chrome(); return; }   // only the frame's width changes: the page itself is not drawn again
    if (t.closest('[data-pick]')) { const id = t.closest('[data-pick]').dataset.pick; if (e.detail === 2) return renameBlock(id); if (st.sel && st.sel.block === id && st.sel.kind === 'block') return; st.sel = { block: id, path: '', kind: 'block' }; paint(); postSel(true); return; }   // pass 5: a double-click renames it
    if (t.closest('[data-move]')) { const x = t.closest('[data-move]'); commit(S().moveBlock(st.cfg, st.page, x.dataset.id, x.dataset.move)); return; }
    if (t.closest('[data-del]')) { commit(S().removeBlock(st.cfg, st.page, t.closest('[data-del]').dataset.del)); return; }
    if (t.closest('[data-add]')) { const x = t.closest('[data-add]'); const ai = st.addAfter ? pageNow().blocks.findIndex(b => b.id === st.addAfter) : -1; st.addAfter = null; const r = S().addBlock(st.cfg, st.page, x.dataset.add, x.dataset.v, ai >= 0 ? ai + 1 : undefined); commit(r.cfg); st.sel = { block: r.block.id, path: '', kind: 'block' }; $('#wdz-picker').hidden = true; paint(); postSel(true); return; }
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
    if (t.closest('[data-lock]')) { const id = t.closest('[data-lock]').dataset.lock; return toggleLock(id); }
    if (t.closest('[data-bmenu]')) { const x = t.closest('[data-bmenu]'), r = x.getBoundingClientRect(); return blockMenu(x.dataset.bmenu, r.left, r.bottom + 4); }
    if (t.closest('[data-hist]')) return histJump(+t.closest('[data-hist]').dataset.hist);
    if (t.closest('[data-fr]')) return findAct(t.closest('[data-fr]'));
    if (t.closest('[data-hide]')) { const id = t.closest('[data-hide]').dataset.hide, b = pg.blocks.find(x => x.id === id); commit(S().setHidden(st.cfg, st.page, id, !(b && b.hidden))); return; }
    if (t.closest('[data-panel]')) { const pb = t.closest('[data-panel]'), want = pb.dataset.panel; st.panel = pb.closest('.wdz-ptabs') ? ((st.sub || {})[want] || want) : want; panelPaint(); return; }
    if (t.closest('[data-cf]')) return resolveConflict(t.closest('[data-cf]').dataset.cf);
    if (t.closest('[data-fill]')) { const k = t.closest('[data-fill]').dataset.fill; $('#wdz-fill').hidden = true; if (k === 'blank' && st.unfilled) { commit(JSON.parse(st.unfilled)); say('Started from the template as it is, with nothing filled in from the project. Undo brings the filled version back.'); } return; }
    if (t.closest('[data-sty]') && st.sel) { const x = t.closest('[data-sty]'); commit(S().setStyle(st.cfg, st.page, st.sel.block, { [x.dataset.sty]: x.dataset.val })); return; }
    if (t.closest('[data-cact]')) return commentAction(t.closest('[data-cact]'));
    if (t.closest('[data-site]')) return siteAction(t.closest('[data-site]'));
    if (t.closest('[data-stu]') && STU()) { moreMenu(false); return STU().click(t.closest('[data-stu]'), stuApi); }
    if (t.closest('[data-sp]') && SP()) return SP().click(t.closest('[data-sp]'), spApi);
    if (t.closest('[data-sg]') && SG()) return SG().click(t.closest('[data-sg]'), sgApi());
    if (t.closest('[data-gcat]')) { gal.cat = t.closest('[data-gcat]').dataset.gcat; galPaint(); return; }
    if (t.closest('[data-peek]')) { peek(t.closest('[data-peek]').dataset.peek); return; }
    if (t.closest('[data-peekclose]')) { const pk = $('#wdz-peek'); if (pk) pk.hidden = true; return; }
    if (t.closest('[data-import]')) { const f = $('#wdz-import'); f.value = ''; f.click(); return; }
    if (!a) { if (!t.closest('.wdz-dl')) $('#wdz-dlmenu').hidden = true; if (!t.closest('.wdz-morewrap')) moreMenu(false); return; }
    const k = a.dataset.wdz;
    if (k === 'more') { const on = $('#wdz-more').hidden; moreMenu(on); if (on && e.detail === 0) { const f1 = $('#wdz-mode'); if (f1) f1.focus(); } return; }
    if (k !== 'dlmenu' && k !== 'mode') moreMenu(false);
    if (k === 'zoomin' || k === 'zoomout') return zoomStep(k === 'zoomin' ? 1 : -1);
    if (k === 'zoom100') return setZoom(1);
    if (k === 'zoomfit') return setZoom('fit');
    if (k === 'code') return codeSheet();
    if (k === 'requests') return window.TribeChanges && window.TribeChanges.sheet(st.pid);
    if (k === 'wide') { st.wide = !st.wide; return chrome(); }
    if (k === 'close') return close();
    if (k === 'undo') return undo();
    if (k === 'redo') return redo();
    if (k === 'mode') return commit(S().setMode(st.cfg, st.cfg.theme.mode === 'dark' ? 'light' : 'dark'));
    if (k === 'addpage') { const r = S().addPage(st.cfg, ''); commit(r.cfg); st.page = r.page.id; paint(); say(`Added ${r.page.title}. Rename it: “rename this page to About”.`); return; }
    if (k === 'picker') { st.addAfter = null; const p = $('#wdz-picker'); p.hidden = !p.hidden; a.setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) p.innerHTML = picker(); if (false) p.innerHTML = S().TYPES.map(ty => `<div class="wdz-pk"><b>${esc(S().BLOCKS[ty].label)}</b><span>${S().BLOCKS[ty].variants.map(v => `<button type="button" class="wdz-chip" data-add="${ty}" data-v="${v}">${esc(v)}</button>`).join('')}</span></div>`).join(''); return; }
    if (k === 'templates') return showStart(true, '');
    if (k === 'dlmenu') { const m = $('#wdz-dlmenu'); m.hidden = !m.hidden; a.setAttribute('aria-expanded', String(!m.hidden)); return; }
    if (k === 'dl-html' || k === 'dl-zip') { $('#wdz-dlmenu').hidden = true; return download(k === 'dl-zip' ? 'zip' : 'html'); }
    if (k === 'publish') { $('#wdz-dlmenu').hidden = true; return publish(); }
    if (k === 'where') { $('#wdz-dlmenu').hidden = true; await flush(); if (window.TribeWhere) window.TribeWhere.open(st.pid, 'site'); return; }
    if (k === 'freeai') return window.TribeAIBridge && window.TribeAIBridge.open({ src: 'site', goal: 'Improve this website' });   // feat/agents-free
    if (k === 'save') return saveVersion();
    if (k === 'comment') return commentMode(!st.cmode);
    if (k === 'keys') return shortcuts();
    if (k === 'flint') return flintDock();
    if (k === 'flint-sheet') return flintDock();
    if (k === 'find') return findPanel(true);
    if (k === 'history') return histPanel();
  }
  function toggleLock(id) {
    const b = pageNow().blocks.find(x => x.id === id); if (!b) return;
    const was = JSON.stringify(st.cfg); st.hist.push(was); if (st.hist.length > 80) st.hist.shift(); st.fut = [];   // a lock is never refused by the lock itself
    st.cfg = S().normalize(S().setLocked(st.cfg, st.page, id, !b.locked)); save(); paint();
    flash(b.locked ? `${blkName(b)} unlocked` : `${blkName(b)} locked: nobody changes it by accident`);
  }
  // pass 5: drag to reorder, the same everywhere in the designer. A mouse drags at once and a line shows where it lands;
  // a finger holds for a moment first (so a swipe still scrolls), and holding without moving opens the menu. Esc cancels.
  // Each drop is one Undo.
  let noTap = 0;
  function sortable(box, o) {
    let from = -1, gap = -1, line = null, touch = null, cur = null;
    const items = () => { const l = [...box.querySelectorAll(o.item)]; return o.group && cur ? l.filter(x => o.group(x) === o.group(cur)) : l; };
    const can = el => !o.can || o.can(el);
    const gapAt = (x, y) => { const l = items(); for (let i = 0; i < l.length; i++) { const r = l[i].getBoundingClientRect(); if (o.axis === 'x' ? x < r.left + r.width / 2 : y < r.top + r.height / 2) return Math.max(i, o.min || 0); } return l.length; };
    const show = g => {
      const l = items(); if (!l.length) return;
      if (!line) { line = document.createElement('div'); line.className = 'wdz-ldrop' + (o.axis === 'x' ? ' x' : ''); line.setAttribute('aria-hidden', 'true'); }
      const host = o.lineHost ? o.lineHost() : box; if (line.parentNode !== host) host.appendChild(line);
      const hr = host.getBoundingClientRect(), end = g >= l.length, a = l[Math.min(g, l.length - 1)].getBoundingClientRect();
      if (o.axis === 'x') Object.assign(line.style, { left: Math.round((end ? a.right + 1 : a.left - 2) - hr.left + host.scrollLeft) + 'px', top: Math.round(a.top - hr.top + host.scrollTop) + 'px', height: Math.round(a.height) + 'px', width: '' });
      else Object.assign(line.style, { top: Math.round((end ? a.bottom + 1 : a.top - 3) - hr.top + host.scrollTop) + 'px', left: Math.round(a.left - hr.left + host.scrollLeft) + 'px', width: Math.round(a.width) + 'px', height: '' });
    };
    const stop = () => { if (line) line.remove(); line = null; box.querySelectorAll(o.item).forEach(x => x.classList.remove('is-drag')); box.classList.remove('is-sorting'); from = -1; gap = -1; cur = null; };
    const drop = () => { const f = from, g = gap, el = cur, ext = from < 0 && o.external ? o.external() : null; stop(); if (ext && g >= 0) return o.onAdd && o.onAdd(ext, g); if (f < 0 || g < 0) return; const to = g > f ? g - 1 : g; if (to !== f) o.onMove(f, to, el); };
    box.addEventListener('dragstart', e => { const el = e.target.closest && e.target.closest(o.item); if (!el || !box.contains(el)) return; if (!can(el)) { e.preventDefault(); return; } cur = el; from = items().indexOf(el); el.classList.add('is-drag'); box.classList.add('is-sorting'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', el.textContent.trim().slice(0, 40)); } catch {} });
    const zone = o.zone ? o.zone() : box;
    zone.addEventListener('dragover', e => { if (from < 0 && !(o.external && o.external())) return; e.preventDefault(); e.dataTransfer.dropEffect = from < 0 ? 'copy' : 'move'; const g = gapAt(e.clientX, e.clientY); if (g !== gap) { gap = g; show(g); } });
    zone.addEventListener('dragleave', e => { if (e.relatedTarget && zone.contains(e.relatedTarget)) return; if (line) { line.remove(); line = null; } gap = -1; });
    zone.addEventListener('drop', e => { if (from < 0 && !(o.external && o.external())) return; e.preventDefault(); drop(); });
    box.addEventListener('dragend', () => stop());
    box.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || e.button) return; const el = e.target.closest && e.target.closest(o.item); if (!el || !box.contains(el) || e.target.closest('.wdz-blk-acts, .sp-li-a, input')) return;
      touch = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false };
      touch.t = setTimeout(() => { if (!touch) return; touch.on = true; box._held = Date.now(); if (can(el)) { cur = el; from = items().indexOf(el); el.classList.add('is-drag'); box.classList.add('is-sorting'); } try { el.setPointerCapture(touch.id); } catch {} if (navigator.vibrate) try { navigator.vibrate(8); } catch {} }, 380);
    });
    box.addEventListener('pointermove', e => {
      if (!touch || e.pointerId !== touch.id) return;
      if (!touch.on) { if (Math.abs(e.clientX - touch.x0) + Math.abs(e.clientY - touch.y0) > 8) { clearTimeout(touch.t); touch = null; } return; }
      if (from < 0) return; const g = gapAt(e.clientX, e.clientY); if (g !== gap) { gap = g; show(g); }
    });
    const up = ok => e => {
      if (!touch || e.pointerId !== touch.id) return; clearTimeout(touch.t); const t = touch; touch = null; if (!t.on) return;
      noTap = Date.now(); if (ok && gap >= 0 && from >= 0) return drop();
      stop(); if (ok && o.onHold) o.onHold(t.el, e.clientX, e.clientY);
    };
    box.addEventListener('pointerup', up(true)); box.addEventListener('pointercancel', up(false));
    box.addEventListener('touchmove', e => { if (touch && touch.on) e.preventDefault(); }, { passive: false });
    box.addEventListener('contextmenu', e => { if (touch || Date.now() - (box._held || 0) < 900) { e.preventDefault(); e.stopPropagation(); } }, true);   // the long press is the drag (and the menu when it does not move)
    box.addEventListener('click', e => { if (Date.now() - noTap < 450) { e.preventDefault(); e.stopPropagation(); } }, true);
    box.addEventListener('dragstart', () => { sortCancel = stop; }); box.addEventListener('pointerdown', () => { sortCancel = stop; });
    return { stop, busy: () => from >= 0 || !!line };
  }
  let sortCancel = null;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sortCancel && root && !root.hidden && document.querySelector('.wdz-ldrop, .is-sorting')) { e.stopPropagation(); sortCancel(); sortCancel = null; } }, true);
  // an entry of a list (a link, a card, a question) moved to a new place among its own kind: one Undo
  function moveEntry(bid, list, from, to) {
    let c = st.cfg, i = +from;
    for (let n = 0; n < 40 && i !== to; n++) { const r = S().itemOp(c, st.page, bid, list, i, to > i ? 'down' : 'up'); if (r.i < 0 || r.i === i) break; c = r.cfg; i = r.i; }
    return { cfg: c, i };
  }
  function dragList() {
    const blocks = () => pageNow().blocks;
    sortable($('#wdz-blocks'), {
      item: '.wdz-blk', lineHost: () => $('#wdz-blocks').parentNode, zone: () => root.querySelector('.wdz-left'), can: el => !el.classList.contains('is-locked'),
      external: () => st && st.dragAdd,
      onMove: (f, to) => { const b = blocks()[f]; if (!b) return; st.sel = { block: b.id, path: '', kind: 'block' }; commit(S().moveBlock(st.cfg, st.page, b.id, to)); postSel(true); flash(`Moved ${blkName(b)}`); },
      onAdd: (a, g) => addAt(a, g),
      onHold: (el, x, y) => blockMenu(el.dataset.blk, x, y),
    });
    sortable($('#wdz-pages'), {
      item: '.wdz-tab[data-page]', axis: 'x', min: 1, can: el => !!el.dataset.page && st.cfg.pages.findIndex(p => p.id === el.dataset.page) > 0,
      onMove: (f, to) => { const p = st.cfg.pages[f]; if (!p) return; commit(S().movePageTo(st.cfg, p.id, to)); flash(`Moved the ${p.title} page`); },
    });
    sortable($('#wdz-insp'), {
      item: '.sp-li[draggable]', group: el => el.closest('.sp-list'),
      onMove: (f, to, el) => { const l = el && el.closest('.sp-list'); if (!l || !st.sel) return; const list = l.dataset.list, bid = st.sel.block, mv = moveEntry(bid, list, f, to); st.sel = { block: bid, path: `${list}.${mv.i}`, kind: 'item' }; commit(mv.cfg); postSel(true); flash(tr('Moved')); },
    });
    // dragging a new block out of "+ Add block": onto the list (where the line is) or onto the page itself
    root.addEventListener('dragstart', e => {
      const k = e.target.closest && e.target.closest('.wdz-pkb[data-add]'); if (!k) return;
      st.dragAdd = { type: k.dataset.add, v: k.dataset.v }; e.dataTransfer.effectAllowed = 'copy'; try { e.dataTransfer.setData('text/plain', k.title || k.dataset.add); } catch {}
      const f = $('#wdz-frame'); if (f && f.contentWindow) f.contentWindow.postMessage({ adddrag: 1 }, '*');
    });
    root.addEventListener('dragend', e => { if (!st || !st.dragAdd) return; setTimeout(() => { if (st) st.dragAdd = null; }, 0); const f = $('#wdz-frame'); if (f && f.contentWindow) f.contentWindow.postMessage({ adddrag: 0 }, '*'); });
    // the list's own right-click, and its ⋯ button: the same menu as on the page
    $('#wdz-blocks').addEventListener('contextmenu', e => { const li = e.target.closest('.wdz-blk'); if (!li || e.defaultPrevented) return; e.preventDefault(); blockMenu(li.dataset.blk, e.clientX, e.clientY); });
    $('#wdz-blocks').addEventListener('dblclick', e => { const t = e.target.closest('.wdz-blk-t'); if (t) { e.preventDefault(); renameBlock(t.dataset.pick); } });
  }
  function addAt(a, g) {
    if (!a || !st) return; const r = S().addBlock(st.cfg, st.page, a.type, a.v, Math.max(0, Math.min(pageNow().blocks.length, g)));
    st.dragAdd = null; commit(r.cfg); st.sel = { block: r.block.id, path: '', kind: 'block' }; paint(); postSel(true);
    const pk = $('#wdz-picker'); if (pk) pk.hidden = true; const ab = root.querySelector('[data-wdz="picker"]'); if (ab) ab.setAttribute('aria-expanded', 'false');
    flash(`Added ${blkName(r.block)}`);
  }
  function blockMenu(id, x, y) {
    if (!SP() || !id) return; flushText();
    st.sel = { block: id, path: '', kind: 'block' }; st.panel = 'edit'; panelPaint(); postSel(true);
    $('#wdz-blocks').querySelectorAll('.wdz-blk').forEach(li => li.classList.toggle('is-sel', li.dataset.blk === id));
    SP().menu(spApi, x, y);
  }
  // rename in place in the list: Enter keeps it, Esc leaves it as it was; an empty name goes back to the block's kind
  function renameBlock(id) {
    const li = $('#wdz-blocks').querySelector(`.wdz-blk[data-blk="${CSS.escape(id)}"]`), b = pageNow().blocks.find(x => x.id === id); if (!li || !b) return;
    const t = li.querySelector('.wdz-blk-t'); if (!t || li.querySelector('.wdz-ren')) return;
    const inp = document.createElement('input'); inp.className = 'input wdz-ren'; inp.maxLength = 40; inp.value = blkName(b); inp.setAttribute('aria-label', tr('Name of this section in the list'));
    t.hidden = true; t.after(inp); inp.focus(); inp.select();
    let done = false;
    const end = keep => { if (done) return; done = true; const v = inp.value.trim(), now = pageNow().blocks.find(x => x.id === id); inp.remove(); t.hidden = false; if (!keep || !now) return; const lab = S().BLOCKS[now.type].label.replace(/ \(.*/, ''); const name = v === lab ? '' : v; if ((now.name || '') === name) return; commit(S().setBlockName(st.cfg, st.page, id, name)); flash(name ? `Renamed to ${name}` : 'Name back to the block’s kind'); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(true); } if (e.key === 'Escape') { e.preventDefault(); end(false); } });
    inp.addEventListener('blur', () => end(true));
  }

  // ---------- pictures ----------
  let fileFor = null;
  function pickFile() { fileFor = st.sel ? { ...st.sel } : null; const f = $('#wdz-file'); f.value = ''; f.click(); }
  async function onFile(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (picFor) { const k = picFor; picFor = null; if (file.size > 4 * 1024 * 1024) return say('That picture is over 4 MB. Try a smaller one.'); const src = await shrink(file); if (k === 'pageshare') { commit(S().setPageSeo(st.cfg, st.page, { image: src })); say(`Share picture set for the ${pageNow().title} page. Other pages keep the site's own.`); st.panel = 'site'; panelPaint(); return; } commit(k === 'logo' ? S().setLogo(st.cfg, src) : S().setSeo(st.cfg, k === 'favicon' ? { favicon: src } : { image: src })); say(k === 'logo' ? 'Logo added: it is in the header and is the tab icon too.' : k === 'favicon' ? 'Favicon set.' : 'Share image set: it shows when someone posts the link (after you publish to a real address).'); st.panel = 'site'; panelPaint(); return; }
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
    if (window.TribeSiteFx && window.TribeSiteFx.uses(st.cfg).any) await window.TribeSiteFx.preload(true);   // feat/site-3d: the background scripts go into the download
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
    await flush(); try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/site-config/publish`, { method: 'POST', body: {} }); say(`${r.files.filter(f => /\.html$/.test(f)).length} pages are in ${r.dir}${r.kept ? ' Your own versions are in ' + r.kept + '.' : ''}`); } catch (e) { say(e.message); }
  }
  async function saveVersion() {
    if (!st.pid || !connected()) { try { localStorage.setItem(LOCAL + '.v', JSON.stringify(st.cfg)); } catch {} return say('Saved this design on this device.'); }
    st.dirty = true; if (!(await push())) return say('Not saved: sort out the newer version first.');
    try { const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/website/versions`, { method: 'POST', body: { note: `Designer · ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` } }); say('Saved to Saved designs. Restore it any time from Preview › Saved or Files › Website.'); return r; } catch (e) { say(e.message); }
  }

  // ---------- the start screen (p5-start): what kind of site first, then that kind's templates ----------
  // gal.kind: '' the kinds · 'all' every template (search, categories) · a kind id: its templates, best first
  const DD = () => window.TribeDesignData;
  const kindsOf = () => (DD() && DD().SITE_KINDS) || [];
  function startHead(eyebrow, title, hint) { return `<p class="wdz-eyebrow">${esc(tr(eyebrow))}</p><h2>${esc(tr(title))}</h2>${hint ? `<p class="wdz-hint">${esc(tr(hint))}</p>` : ''}`; }
  async function showStart(fromBar, kind) {
    const box = $('#wdz-start'); if (!box) return; box.hidden = false;
    root.classList.add('wdz-starting');   // the page's own controls wait until there is a page
    box.dataset.from = fromBar ? '1' : '';
    if (kind !== undefined) gal.kind = kind === 'blank' ? '' : kind;
    await loadGallery();
    if (!gal.kind || !DD()) return startKinds(box);
    return startGallery(box);
  }
  const keepBtn = () => `<button type="button" class="btn sm" data-start="blank">${esc(tr($('#wdz-start') && $('#wdz-start').dataset.from ? 'Keep my design' : 'Start blank'))}</button>`;
  function startKinds(box) {
    const K = kindsOf(), main = K.filter(k => k.main), more = K.filter(k => !k.main), n = id => DD().siteTemplatesFor(gal.list, id).length;
    box.innerHTML = `<div class="wdz-start-in wdz-kinds-in">${startHead('Website', 'What kind of site?', 'Pick one to see its templates. Every word, picture and colour is yours to change after.')}
      <div class="wdz-kmain" role="list">${main.map(k => `<button type="button" class="wdz-kind wdz-kind-main" role="listitem" data-kind="${k.id}"><span class="wdz-kart">${k.art}</span><span class="wdz-ktxt"><b>${esc(tr(k.t))}</b><small>${esc(tr(k.d))}</small><span class="wdz-kn">${n(k.id)} ${esc(tr('templates'))}</span></span></button>`).join('')}</div>
      <p class="wdz-eyebrow wdz-kor">${esc(tr('Something else'))}</p>
      <div class="wdz-kmore" role="list">${more.map(k => `<button type="button" class="wdz-kind" role="listitem" data-kind="${k.id}" title="${esc(tr(k.d))}"><span class="wdz-kart">${k.art}</span><b>${esc(tr(k.t))}</b></button>`).join('')}</div>
      <div class="wdz-kfoot"><button type="button" class="btn sm ghost" data-kind="all">${esc(tr('See all templates'))} · ${gal.list.length}</button>${box.dataset.from ? keepBtn() : ''}<button type="button" class="btn sm ghost" data-import="1">${esc(tr('Import HTML…'))}</button></div>
      <p class="wdz-hint">${esc(tr('Or tell Flint what the site is for: “a page for my band”, “send people to my app”.'))}</p></div>`;
  }
  function startGallery(box) {
    const all = gal.kind === 'all', k = kindsOf().find(x => x.id === gal.kind) || {};
    box.innerHTML = `<div class="wdz-start-in"><button type="button" class="btn sm ghost wdz-kback" data-kind="">${IC.back}${esc(tr('All kinds'))}</button>
      ${startHead('Website', all ? 'All templates' : k.t || 'Templates', all ? 'Every template is blocks you can change, wire and export.' : k.d || '')}
      <div class="wdz-gbar"><input class="input" id="wdz-gq" type="search" placeholder="${esc(tr('Search templates: bakery, portfolio, link in bio…'))}" aria-label="${esc(tr('Search templates'))}" value="${esc(gal.q)}"><span class="wdz-hint" id="wdz-gcount"></span>${keepBtn()}${all ? `<button type="button" class="btn sm ghost" data-import="1">${esc(tr('Import HTML…'))}</button>` : ''}</div>
      <div class="wdz-gcats" id="wdz-gcats" role="group" aria-label="${esc(tr('Categories'))}"${all ? '' : ' hidden'}></div>
      <div class="wdz-tpls" id="wdz-gal"><p class="wdz-hint">${esc(tr('Loading templates…'))}</p></div>
      ${all ? '' : `<p class="wdz-row"><button type="button" class="btn sm" data-kind="all">${esc(tr('See all templates'))}</button></p>`}
      <p class="wdz-hint">${esc(tr('Templates from Start Bootstrap and Tailwind Toolbox (MIT) and HTML5 UP (CC BY 3.0, credited in the footer) are converted into blocks; see docs/SITE-TEMPLATES.md.'))}</p></div>`;
    galPaint();
  }
  function hideStart() { const b = $('#wdz-start'); if (b) b.hidden = true; if (root) root.classList.remove('wdz-starting'); }

  // ---------- p4-site: More, zoom, sections on the clipboard, code, ask before replacing, pictures of a change ----------
  const perf = { t0: 0, open: 0, ready: 0 };
  // a word in the saved slot for a moment (the zoom, a spacing), then back to whether it is saved
  let flashT = 0; const flash = text => { status(text); clearTimeout(flashT); flashT = setTimeout(() => { if (st && root && !root.hidden) status(); }, 1600); };
  function moreMenu(on) {
    const m = $('#wdz-more'), b = root && root.querySelector('[data-wdz="more"]'); if (!m || !b) return;
    m.hidden = !on; b.setAttribute('aria-expanded', String(!!on));
    if (on) { const dm = $('#wdz-dlmenu'); if (dm) dm.hidden = true; reqCount(); }
  }
  // how many suggested changes wait for this person: a count on More, so the strip need not sit there all day
  async function reqCount() {
    const n = $('#wdz-reqn'), dot = $('#wdz-moredot'); if (!n || !st || !st.pid || !connected() || !window.TribeChanges) { if (dot) dot.hidden = true; return; }
    try { const l = await window.TribeChanges.mine(st.pid), w = l.filter(x => x.canDecide).length; n.hidden = !w; n.textContent = w; if (dot) dot.hidden = !w; } catch {}
  }
  // zoom: the preview keeps its real width (so the layout does not change) and is drawn smaller or larger. Clicks,
  // typing and dragging work at any zoom because the browser maps them through the scale.
  const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];
  const stageW = () => { const sg = root && root.querySelector('.wdz-stage'); if (!sg) return 0; const cs = getComputedStyle(sg); return sg.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2; };
  const baseW = () => (st.dev === 'phone' ? Math.min(390, innerWidth <= 820 ? stageW() : 390) : st.dev === 'tablet' ? 820 : st.wide ? 1280 : stageW());
  const fitZ = () => { const w = baseW(), a = stageW(); return w > a && a > 0 ? Math.max(0.25, Math.floor(a / w * 100) / 100) : 1; };
  function setZoom(z) {
    if (!st) return;
    if (z === 'fit') { z = fitZ(); st.fit = true; } else st.fit = false;
    st.zoom = Math.max(0.25, Math.min(2, +z || 1)); applyZoom(); flash(`Zoom ${Math.round(st.zoom * 100)}%`);
  }
  function zoomStep(dir) { const z = (st && st.zoom) || 1; const i = dir > 0 ? ZOOMS.findIndex(x => x > z + 0.001) : ZOOMS.length - 1 - [...ZOOMS].reverse().findIndex(x => x < z - 0.001); const n = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i < 0 || i >= ZOOMS.length ? (dir > 0 ? ZOOMS.length - 1 : 0) : i))]; setZoom(n); }
  function applyZoom() {
    const wrap = $('#wdz-framewrap'), f = $('#wdz-frame'), zv = $('#wdz-zoomv'); if (!wrap || !f || !st) return;
    if (st.fit) st.zoom = fitZ();
    const z = st.zoom || 1; if (zv) zv.textContent = Math.round(z * 100) + '%';
    { const fb = root.querySelector('[data-wdz="zoomfit"]'); if (fb) fb.setAttribute('aria-pressed', String(!!st.fit)); }
    wrap.classList.toggle('is-zoom', z !== 1);
    if (z === 1) { wrap.style.width = ''; f.style.width = ''; f.style.height = ''; f.style.transform = ''; return; }
    const w = baseW(); wrap.style.width = Math.round(w * z) + 'px';
    f.style.width = w + 'px'; f.style.transform = `scale(${z})`; f.style.height = Math.round(wrap.clientHeight / z) + 'px';
  }
  addEventListener('resize', () => { if (root && !root.hidden && st) applyZoom(); });
  // Ctrl + wheel over the stage (outside the page) zooms too
  document.addEventListener('wheel', e => { if (!root || root.hidden || !(e.ctrlKey || e.metaKey) || !e.target.closest || !e.target.closest('.wdz-stage')) return; e.preventDefault(); const now = Date.now(); if (now - zoomAt < 60) return; zoomAt = now; zoomStep(e.deltaY < 0 ? 1 : -1); }, { passive: false });

  // a section on the clipboard: Ctrl C on a selected section, Ctrl V on any page (or in another site on this device)
  const CLIP = 'tribecode.sitedesigner.clip';
  let clip = null;
  const readClip = () => { if (clip) return clip; try { const c = JSON.parse(localStorage.getItem(CLIP) || 'null'); if (c && c.type && S().BLOCKS[c.type]) clip = c; } catch {} return clip; };
  function copySection(b, cut) {
    clip = JSON.parse(JSON.stringify({ type: b.type, variant: b.variant, props: b.props, style: b.style, es: b.es, fx: b.fx }));
    try { localStorage.setItem(CLIP, JSON.stringify(clip)); } catch {}
    toast(tr(cut ? 'Cut the section. Ctrl V puts it on any page.' : 'Copied the section. Ctrl V pastes it on any page.'));
  }
  // pass 5: a section's look (colours, spacing, sizes, its kind of layout when it is the same block) on its own clipboard
  const LOOK = 'tribecode.sitedesigner.look';
  let look = null;
  const readLook = () => { if (look) return look; try { const c = JSON.parse(localStorage.getItem(LOOK) || 'null'); if (c && c.type) look = c; } catch {} return look; };
  function copyLook(b) { look = S().lookOf(st.cfg, st.page, b.id); try { localStorage.setItem(LOOK, JSON.stringify(look)); } catch {} flash(tr('Copied the look')); toast(tr('Copied the look. Ctrl Alt V puts it on another section.')); }
  function pasteLook(b) { const l = readLook(); if (!l) return toast(tr('Copy a look first: right-click a section, Copy look.')); if (commit(S().pasteLook(st.cfg, st.page, b.id, l))) flash(tr('Pasted the look')); }
  // the section menu's own actions (siteparts.js shows them; the page and the list of blocks share it)
  function blockAct(v, b) {
    if (v === 'blk-cut') { copySection(b, true); st.sel = null; commit(S().removeBlock(st.cfg, st.page, b.id)); return true; }
    if (v === 'blk-copy') { copySection(b); return true; }
    if (v === 'blk-paste') { st.sel = { block: b.id, path: '', kind: 'block' }; pasteSection(); return true; }
    if (v === 'blk-rename') { setTimeout(() => renameBlock(b.id), 0); return true; }
    if (v === 'blk-copylook') { copyLook(b); return true; }
    if (v === 'blk-pastelook') { pasteLook(b); return true; }
    if (v === 'blk-lock') { toggleLock(b.id); return true; }
    return false;
  }
  function pasteSection() {
    const c0 = readClip(); if (!c0) return;
    const next = JSON.parse(JSON.stringify(st.cfg)), pg = next.pages.find(p => p.id === st.page) || next.pages[0];
    if (c0.type === 'footer' && pg.blocks.some(b => b.type === 'footer')) return say('This page already has a footer. Remove it first, or paste on another page.');
    const before = new Set(st.cfg.pages.flatMap(p => p.blocks.map(b => b.id)));
    const at = st.sel ? pg.blocks.findIndex(b => b.id === st.sel.block) : -1, foot = pg.blocks.findIndex(b => b.type === 'footer');
    pg.blocks.splice(at >= 0 ? at + 1 : foot >= 0 ? foot : pg.blocks.length, 0, JSON.parse(JSON.stringify(c0)));
    const norm = S().normalize(next), nb = (norm.pages.find(p => p.id === st.page) || norm.pages[0]).blocks.find(b => !before.has(b.id));
    if (nb) st.sel = { block: nb.id, path: '', kind: 'block' };
    commit(norm); paint(); postSel(true);
  }

  // Code: read and copy the selected section's HTML and CSS; write your own CSS for the whole site
  function codeSheet() {
    if (!window.TribeUI || !window.TribeUI.sheet) return;
    const pg = pageNow(), b = (st.sel && pg.blocks.find(x => x.id === st.sel.block)) || pg.blocks[0];
    const code = b ? S().sectionCode(st.cfg, st.page, b.id) : { html: '', css: '' };
    const label = b ? S().BLOCKS[b.type].label.replace(/ \(.*/, '') : '';
    const short = t => t.replace(/(src|href)="data:[^"]{120,}"/g, (m, k) => `${k}="data:… (a picture kept inside the page)"`);
    const sh = window.TribeUI.sheet({ id: 'wdz-code', wide: true, eyebrow: 'Website', title: 'Code',
      body: `<div class="wdz-code">
        <div class="wdz-code-tabs" role="tablist" aria-label="Code"><button type="button" role="tab" data-ct="html" aria-selected="true">HTML</button><button type="button" role="tab" data-ct="css" aria-selected="false">CSS</button><button type="button" role="tab" data-ct="own" aria-selected="false">Your own CSS</button></div>
        <div data-cp="html"><p class="wdz-hint">${b ? `${esc(tr('Code for this section'))}: <b>${esc(label)}</b>. ${esc(tr('This is what goes into the downloaded and published page.'))}` : ''}</p><pre class="wdz-pre" id="wdz-code-html" tabindex="0"></pre><p class="wdz-row"><button type="button" class="btn sm" data-copy="html">Copy HTML</button></p></div>
        <div data-cp="css" hidden><p class="wdz-hint">${esc(tr('The rules of the site’s stylesheet that style this section.'))}</p><pre class="wdz-pre" id="wdz-code-css" tabindex="0"></pre><p class="wdz-row"><button type="button" class="btn sm" data-copy="css">Copy CSS</button></p></div>
        <div data-cp="own" hidden><p class="wdz-hint">${esc(tr('Added at the end of the site’s stylesheet, for every page. It stays in the download and the published site. Anything that loads from another website is removed.'))}</p><label class="sr" for="wdz-code-own">Your own CSS</label><textarea class="input wdz-own" id="wdz-code-own" rows="12" spellcheck="false" autocapitalize="off" autocomplete="off" maxlength="20000" placeholder=".hero-split h1 { letter-spacing: -0.02em; }"></textarea><p class="wdz-hint" id="wdz-own-note" aria-live="polite"></p><p class="wdz-row"><button type="button" class="btn sm primary" data-own="apply">Apply</button><button type="button" class="btn sm" data-own="clear">Remove my CSS</button></p></div></div>` });
    const q = x => sh.el.querySelector(x);
    q('#wdz-code-html').textContent = short(code.html); q('#wdz-code-css').textContent = code.css; q('#wdz-code-own').value = st.cfg.css || '';
    sh.el.addEventListener('click', async e => {
      const tb = e.target.closest('[data-ct]'); if (tb) { sh.el.querySelectorAll('[data-ct]').forEach(x => x.setAttribute('aria-selected', String(x === tb))); sh.el.querySelectorAll('[data-cp]').forEach(x => { x.hidden = x.dataset.cp !== tb.dataset.ct; }); return; }
      const cp = e.target.closest('[data-copy]'); if (cp) { const text = cp.dataset.copy === 'html' ? code.html : code.css; try { await navigator.clipboard.writeText(text); toast(tr('Copied')); } catch { const r = document.createRange(); r.selectNodeContents(q('#wdz-code-' + cp.dataset.copy)); const g = getSelection(); g.removeAllRanges(); g.addRange(r); toast(tr('Selected. Press Ctrl C to copy.')); } return; }
      const own = e.target.closest('[data-own]'); if (own) {
        const raw = own.dataset.own === 'clear' ? '' : q('#wdz-code-own').value, clean = S().cleanCss(raw);
        if ((st.cfg.css || '') === clean) { q('#wdz-own-note').textContent = tr(clean ? 'Already applied.' : 'There is no CSS of yours on this site.'); return; }
        commit(S().setCss(st.cfg, raw)); q('#wdz-code-own').value = st.cfg.css || '';
        q('#wdz-own-note').textContent = tr(!clean ? 'Removed. Undo brings it back.' : clean.replace(/\s+/g, '') !== raw.replace(/\s+/g, '') ? 'Applied. Some of it was removed to keep the site safe; the box shows what is in use. Undo takes it back.' : 'Applied to every page. Undo takes it back.');
      }
    });
    return sh;
  }

  // a template over a site that already has something in it: ask first (it replaces the site for everyone)
  const hasSite = () => !!st && (!st.blank || st.hist.length > 0);   // st.blank: opened with nothing saved anywhere, and no template taken yet
  function okToReplace() {
    if (!hasSite() || !window.TribeUI || !window.TribeUI.sheet) return Promise.resolve(true);
    return new Promise(res => {
      let done = false; const end = v => { if (done) return; done = true; sh.close(); res(v); };
      const sh = window.TribeUI.sheet({ id: 'wdz-replace', kind: 'decision', eyebrow: 'Website', title: 'Start over from this template?',
        body: `<p>${esc(tr('This website already has a design'))}: <b>${esc(st.cfg.name || '')}</b>. ${esc(tr(st.pid && connected() ? 'Starting over replaces it for everyone in the tribe. Undo brings it back while the designer is open.' : 'Starting over replaces it. Undo brings it back while the designer is open.'))}</p>`,
        foot: `<button type="button" class="btn" id="wdz-keep">${esc(tr('Keep my site'))}</button><button type="button" class="btn primary" id="wdz-over">${esc(tr('Start over'))}</button>`, onClose: () => end(false) });
      sh.el.querySelector('#wdz-keep').onclick = () => end(false); sh.el.querySelector('#wdz-over').onclick = () => end(true);
    });
  }

  // a picture of the page for a change request (before and after): the published HTML drawn through an SVG image
  async function snapSite(cfgOrJson, pageId) {
    try {
      const cfg = typeof cfgOrJson === 'string' ? JSON.parse(cfgOrJson) : cfgOrJson; if (!cfg) return null;
      const c = S().normalize(JSON.parse(JSON.stringify(cfg))), pg = c.pages.find(p => p.id === pageId) || c.pages[0];
      const full = S().render(c, { page: pg.id, mode: 'pages', fonts: file => FONTS.get(file) || '' });
      const a = full.indexOf('<style>'), b = full.indexOf('</style>', a), d = full.indexOf('<body>', b), e = full.lastIndexOf('</body>'); if (a < 0 || b < 0 || d < 0 || e < 0) return null;
      const cssText = full.slice(a + 7, b).replace(/@import[^;]*;/g, '').replace(/:root\{/, '.wdz-snap{').replace(/(^|\})\s*(html|body)\s*(,\s*(html|body)\s*)*\{/g, '$1.wdz-snap{'), W = 1200, H = 1500, w = 480, h = 600;
      const box = document.createElement('div'); box.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      box.innerHTML = `<style>${cssText}.wdz-snap{width:${W}px;height:${H}px;overflow:hidden;margin:0;background:var(--bg);color:var(--ink);font-family:var(--body);line-height:1.6}.wdz-snap .skip{display:none}.wdz-snap [class*="an-"]{animation:none!important;opacity:1!important;transform:none!important}</style><div class="wdz-snap">${full.slice(d + 6, e).replace(/<script[\s\S]*?<\/script>/gi, '')}</div>`;
      box.querySelectorAll('img[loading]').forEach(i => i.removeAttribute('loading'));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="${W}" height="${H}">${new XMLSerializer().serializeToString(box)}</foreignObject></svg>`;
      const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, W, H, 0, 0, w, h);
      let out = cv.toDataURL('image/jpeg', 0.8); if (out.length > 380 * 1024) out = cv.toDataURL('image/jpeg', 0.5);
      return out.length <= 400 * 1024 ? out : null;
    } catch { return null; }
  }

  // ---------- Flint ----------
  // feat/flint-unify: Flint here is the same chat as everywhere (TribeFlint.mount, ctx designer): the thread is this
  // design's log (st.log), so it follows the design's undo history; anything that is not a site edit goes to Flint's
  // full brain and its reply lands in this thread too.
  let fui = null, chipKey = '';
  function mountFlint() {
    const host = $('#wdz-flint'); if (!host || fui || !window.TribeFlint || !window.TribeFlint.mount) return;
    fui = window.TribeFlint.mount(host, { ctx: 'designer', echo: false, run: text => ask(text).then(() => true), onSay: m => { if (st) { st.log.push(m); logPaint(); if (innerWidth <= 820 && m.who === 'flint' && root && !root.classList.contains('fl-sheet')) flintDock(true, { focus: false }); } }, onClear: () => { if (st) { st.log = []; st.pending = null; logPaint(); } },
      hello: tr('Say what to change, like “dark mode” or “add a page called About”.'), chips: chipsNow, onEscape: () => escape(),
      tools: [{ title: tr('Hide Flint (Ctrl J)'), html: IC.chevR, attrs: { 'data-fl-hide': '1' }, fn: () => flintDock(false) }] });
    if (fui && FC() && FC().extra) FC().extra(fui, 'site', () => ask('polish it'), () => { const b = root && root.querySelector('#wdz-agent'); if (b) b.click(); else ask('make it beautiful'); });   // one flow: the same sheet as More › Make it beautiful
  }
  function chipsNow() { return chipsAll().slice(0, 3); }   // pass 5: three at most, so the column stays calm
  function chipsAll() {
    if (!st) return [];
    const links = st.cfg.pages.some(p => p.blocks.some(b => b.type === 'links')), sel = st.sel && pageNow().blocks.find(b => b.id === st.sel.block);
    if (sel && st.sel.kind === 'image') return ['Replace the picture', 'Make the picture round', 'Hide this on phones'];
    if (sel && /^(text|button)$/.test(st.sel.kind)) return ['Make this bigger', 'Make this bold', 'Hide this on phones', 'Change this to…', ...(S().listsOf(st.sel.path).length ? ['Move this up'] : [])];
    if (sel && st.sel.kind === 'item') return ['Move this up', 'Duplicate this', 'Add another', 'Remove this'];
    if (sel) return [`Move this section up`, `Make this section teal`, 'Center the text in this section', 'Hide this section'];
    if (links) return ['Add a link for…', 'Add my Instagram', 'Make the buttons work', 'Dark mode', 'Rounder corners'];
    return ['Make the buttons work', 'Add a page called About', 'Add a link for…', 'Dark mode', 'Add a gallery', 'Make the picture round'];
  }
  // pass 5: Flint has his own column on the far right, beside (never on top of) the panel. It folds to a slim rail
  // (remembered per person) and opens again with one click or Ctrl J. In a narrower window (under 1440) he opens as a
  // drawer over the page, still left of the panel; on a phone he is a sheet at the bottom whose box to type in is
  // always there, and his replies slide up above it.
  const FLKEY = 'tribecode.sitedesigner.flint';
  const flMode = () => innerWidth <= 820 ? 'phone' : innerWidth < 1440 ? 'narrow' : 'wide';
  let flLast = '';
  function flintInit() {
    if (!root) return; const m = flMode(); flLast = m;
    root.classList.remove('fl-open', 'fl-rail', 'fl-sheet');
    if (m === 'phone') { flintAria(false); return; }
    let pref = 'open'; try { pref = localStorage.getItem(FLKEY) || 'open'; } catch {}
    const open = m === 'wide' && pref !== 'rail'; root.classList.add(open ? 'fl-open' : 'fl-rail'); flintAria(open);
  }
  function flintAria(open) { const r = root && root.querySelector('.wdz-fl-rail'), g = root && root.querySelector('.wdz-fl-grab'); if (r) { r.setAttribute('aria-expanded', String(!!open)); r.title = open ? tr('Hide Flint (Ctrl J)') : tr('Flint (Ctrl J)'); } if (g) g.setAttribute('aria-expanded', String(!!open)); }
  function flintDock(open, o = {}) {
    if (!root) return; const m = flMode();
    if (m === 'phone') { if (open == null) open = !root.classList.contains('fl-sheet'); root.classList.toggle('fl-sheet', !!open); flintAria(open); if (open && fui) setTimeout(() => { const b = fui.el && fui.el.querySelector('.flm-thread'); if (b) b.scrollTop = b.scrollHeight; }, 30); return; }
    if (open == null) open = !root.classList.contains('fl-open');
    root.classList.toggle('fl-open', !!open); root.classList.toggle('fl-rail', !open); flintAria(open);
    if (m === 'wide' && o.remember !== false) try { localStorage.setItem(FLKEY, open ? 'open' : 'rail'); } catch {}
    if (open && o.focus !== false && fui) fui.focus();
    else if (!open && root.contains(document.activeElement) && document.activeElement.closest('.wdz-fl')) { const r = root.querySelector('.wdz-fl-rail'); if (r) r.focus(); }
    if (st && st.zoom === 'fit') applyZoom();
  }
  addEventListener('resize', () => { if (!root || root.hidden) return; if (flMode() !== flLast) flintInit(); });

  // ---------- pass 5: find and replace words on every page ----------
  const fr = { q: '', r: '', case: false, whole: false, at: 0 };
  function findPanel(on) {
    const box = $('#wdz-find'); if (!box) return;
    if (on === false || (on == null && !box.hidden)) { if (box.contains(document.activeElement)) document.activeElement.blur(); box.hidden = true; return; }   // the keys go back to the page at once
    histPanel(false);
    // opening it with some words selected while typing on the page looks for those words (an open panel keeps its own)
    const sel = !box.hidden ? '' : (() => { try { const f = $('#wdz-frame'), w = f && f.contentWindow, a = w && w.document.activeElement; if (!a || !a.isContentEditable) return ''; const g = w.getSelection(); return g ? String(g).trim() : ''; } catch { return ''; } })();
    if (sel && sel.length < 60 && !/\n/.test(sel)) fr.q = sel;
    box.hidden = false; findPaint(); const i = box.querySelector('#wdz-fq'); if (i) { i.focus(); i.select(); }
  }
  function findPaint(keepFocus) {
    const box = $('#wdz-find'); if (!box || box.hidden) return;
    const hits = S().findWords(st.cfg, fr.q, fr), total = hits.reduce((a, h) => a + h.n, 0); fr.at = Math.min(fr.at, Math.max(0, hits.length - 1));
    const kind = t => (S().BLOCKS[t] ? S().BLOCKS[t].label.replace(/ \(.*/, '') : t);
    const snip = h => { const i = fr.case ? h.text.indexOf(fr.q) : h.text.toLowerCase().indexOf(fr.q.toLowerCase()), a = Math.max(0, i - 24); return `${a ? '…' : ''}${esc(h.text.slice(a, i))}<mark>${esc(h.text.slice(i, i + fr.q.length))}</mark>${esc(h.text.slice(i + fr.q.length, i + fr.q.length + 40))}${i + fr.q.length + 40 < h.text.length ? '…' : ''}`; };
    const list = hits.slice(0, 60).map((h, i) => { const b = (st.cfg.pages.find(p => p.id === h.page) || { blocks: [] }).blocks.find(x => x.id === h.block); return `<li><button type="button" class="wdz-fhit${i === fr.at ? ' is-on' : ''}" data-fr="go" data-i="${i}"><small>${esc(h.pageTitle)} · ${esc((b && b.name) || kind(h.type))}${h.locked ? ' · ' + esc(tr('locked')) : ''}</small><span>${snip(h)}</span></button></li>`; }).join('');
    const ae = document.activeElement, focusId = ae && box.contains(ae) ? ae.id : '';
    box.innerHTML = `<div class="wdz-fhead"><p class="wdz-eyebrow">${esc(tr('Find and replace'))}</p><button type="button" class="wdz-x" data-fr="close" aria-label="${esc(tr('Close'))}">×</button></div>
      <label class="wdz-f"><span class="sr">${esc(tr('Find'))}</span><input class="input" id="wdz-fq" placeholder="${esc(tr('Find words on every page'))}" value="${esc(fr.q)}" autocomplete="off" spellcheck="false"></label>
      <label class="wdz-f"><span class="sr">${esc(tr('Replace with'))}</span><input class="input" id="wdz-fr" placeholder="${esc(tr('Replace with'))}" value="${esc(fr.r)}" autocomplete="off" spellcheck="false"></label>
      <p class="wdz-row wdz-fopts"><label><input type="checkbox" id="wdz-fcase"${fr.case ? ' checked' : ''}> ${esc(tr('Match case'))}</label><label><input type="checkbox" id="wdz-fwhole"${fr.whole ? ' checked' : ''}> ${esc(tr('Whole words'))}</label></p>
      <p class="wdz-row"><button type="button" class="btn sm" data-fr="one"${hits.length ? '' : ' disabled'}>${esc(tr('Replace'))}</button><button type="button" class="btn sm primary" data-fr="all"${hits.length ? '' : ' disabled'}>${esc(tr('Replace all'))}</button><span class="wdz-fn" aria-live="polite">${fr.q.trim() ? (total ? `${total} ${total === 1 ? esc(tr('match')) : esc(tr('matches'))}` : esc(tr('Nothing found'))) : ''}</span></p>
      ${hits.length ? `<ol class="wdz-fhits">${list}</ol>` : ''}`;
    const fq = box.querySelector('#wdz-fq'), frp = box.querySelector('#wdz-fr');
    fq.oninput = () => { fr.q = fq.value; fr.at = 0; findPaint(true); }; frp.oninput = () => { fr.r = frp.value; };
    box.querySelector('#wdz-fcase').onchange = e => { fr.case = e.target.checked; findPaint(); }; box.querySelector('#wdz-fwhole').onchange = e => { fr.whole = e.target.checked; findPaint(); };
    box.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); findPanel(false); } if (e.key === 'Enter' && e.target === fq) { e.preventDefault(); findGo(e.shiftKey ? fr.at - 1 : fr.at + (box.dataset.went ? 1 : 0)); box.dataset.went = '1'; } if (e.key === 'Enter' && e.target === frp) { e.preventDefault(); findAct({ dataset: { fr: 'one' } }); } };
    if (keepFocus || focusId) { const f = box.querySelector('#' + (focusId || 'wdz-fq')); if (f) { f.focus(); if (f.setSelectionRange && f.value != null) try { f.setSelectionRange(f.value.length, f.value.length); } catch {} } }
  }
  function findGo(i) {
    const hits = S().findWords(st.cfg, fr.q, fr); if (!hits.length) return; fr.at = (i + hits.length) % hits.length; const h = hits[fr.at];
    flushText(); if (h.page !== st.page) { st.page = h.page; frameScroll = 0; }
    st.sel = { block: h.block, path: h.path, kind: 'text' }; st.panel = 'edit'; paint(); setTimeout(() => postSel(true), 120); findPaint(true);
  }
  function findAct(el) {
    const k = el.dataset.fr; if (k === 'close') return findPanel(false);
    if (k === 'go') return findGo(+el.dataset.i);
    const hits = S().findWords(st.cfg, fr.q, fr); if (!hits.length) return;
    flushText();
    if (k === 'all') { const r = S().replaceWords(st.cfg, fr.q, fr.r, fr); if (r.n && commit(r.cfg)) { flash(`${tr('Replaced')} ${r.n}`); toast(`${tr('Replaced')} ${r.n}. ${tr('One Undo takes them all back.')}`); } else if (hits.some(h => h.locked)) toast(tr('The words that are left are in locked sections.')); findPaint(true); return; }
    const h = hits[Math.min(fr.at, hits.length - 1)]; if (h.locked) { toast(tr('That one is in a locked section. Unlock it to change it.')); return findGo(fr.at + 1); }
    const r = S().replaceWords(st.cfg, fr.q, fr.r, { ...fr, only: { page: h.page, block: h.block, path: h.path } });
    if (r.n && commit(r.cfg)) flash(tr('Replaced'));
    findPaint(true); if (S().findWords(st.cfg, fr.q, fr).length) findGo(fr.at);
  }

  // ---------- pass 5: the history of this design: every step, newest first; click one to go back (or forward) to it ----------
  function stepLabel(a, b) {
    try {
      const A = typeof a === 'string' ? JSON.parse(a) : a, B = typeof b === 'string' ? JSON.parse(b) : b, kind = x => blkName(x);
      if (JSON.stringify(A.theme) !== JSON.stringify(B.theme)) return tr('Changed the look of the site');
      if (A.name !== B.name) return `${tr('Renamed the site')}: ${B.name}`;
      if ((A.css || '') !== (B.css || '')) return tr('Changed your own CSS');
      const ap = A.pages.map(p => p.id).join(), bp = B.pages.map(p => p.id).join();
      if (ap !== bp) { if (B.pages.length > A.pages.length) return `${tr('Added a page')}: ${B.pages.find(p => !A.pages.some(q => q.id === p.id)).title}`; if (B.pages.length < A.pages.length) return `${tr('Removed a page')}: ${A.pages.find(p => !B.pages.some(q => q.id === p.id)).title}`; return tr('Changed the order of the pages'); }
      for (const pb of B.pages) {
        const pa = A.pages.find(p => p.id === pb.id); if (!pa) continue;
        if (pa.title !== pb.title) return `${tr('Renamed a page')}: ${pb.title}`;
        const ai = pa.blocks.map(x => x.id), bi = pb.blocks.map(x => x.id);
        const added = pb.blocks.find(x => !ai.includes(x.id)); if (added) return `${tr('Added')} ${kind(added)}`;
        const gone = pa.blocks.find(x => !bi.includes(x.id)); if (gone) return `${tr('Removed')} ${kind(gone)}`;
        if (ai.join() !== bi.join()) { const mv = pb.blocks.find((x, i) => ai.indexOf(x.id) !== i && Math.abs(ai.indexOf(x.id) - i) > 0); return `${tr('Moved')} ${kind(mv || pb.blocks[0])}`; }
        for (const xb of pb.blocks) {
          const xa = pa.blocks.find(x => x.id === xb.id); if (!xa || JSON.stringify(xa) === JSON.stringify(xb)) continue;
          if (!!xa.locked !== !!xb.locked) return `${xb.locked ? tr('Locked') : tr('Unlocked')} ${kind(xb)}`;
          if (!!xa.hidden !== !!xb.hidden) return `${xb.hidden ? tr('Hid') : tr('Showed')} ${kind(xb)}`;
          if ((xa.name || '') !== (xb.name || '')) return `${tr('Renamed')} ${kind(xb)}`;
          if (JSON.stringify(xa.props) !== JSON.stringify(xb.props)) return `${tr('Changed the words in')} ${kind(xb)}`;
          return `${tr('Changed the look of')} ${kind(xb)}`;
        }
      }
      return tr('Changed the site');
    } catch { return tr('Changed the site'); }
  }
  function histPanel(on) {
    const box = $('#wdz-hist'); if (!box) return;
    if (on === false || (on == null && !box.hidden)) { if (box.contains(document.activeElement)) document.activeElement.blur(); box.hidden = true; return; }
    findPanel(false); box.hidden = false; histPaint(); const f = box.querySelector('.is-now') || box.querySelector('button'); if (f) f.focus();
  }
  function histPaint() {
    const box = $('#wdz-hist'); if (!box || box.hidden || !st) return;
    const all = [...st.hist, JSON.stringify(st.cfg), ...st.fut.slice().reverse()], now = st.hist.length;
    const rows = []; for (let i = all.length - 1; i >= Math.max(0, all.length - 61); i--) rows.push(`<li><button type="button" class="wdz-hrow${i === now ? ' is-now' : ''}${i > now ? ' is-fut' : ''}" data-hist="${i}"${i === now ? ' aria-current="step"' : ''}><span>${esc(i ? stepLabel(all[i - 1], all[i]) : tr('Where you started'))}</span><small>${i === now ? esc(tr('Now')) : i > now ? esc(tr('Undone')) : ''}</small></button></li>`);
    box.innerHTML = `<div class="wdz-fhead"><p class="wdz-eyebrow">${esc(tr('History'))}</p><button type="button" class="wdz-x" data-wdz="history" aria-label="${esc(tr('Close'))}">×</button></div><p class="wdz-hint">${esc(tr('Click a step to go back to it. Nothing is lost: the steps after it wait until you make a new change.'))}</p><ol class="wdz-hlist">${rows.join('')}</ol>`;
    box.onkeydown = e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); histPanel(false); } };
  }
  function histJump(i) {
    if (!st || !Number.isFinite(i)) return; const now = st.hist.length; if (i === now) return;
    flushText(); const was = JSON.stringify(st.cfg);
    while (st.hist.length > i) { st.fut.push(JSON.stringify(st.cfg)); st.cfg = JSON.parse(st.hist.pop()); }
    while (st.hist.length < i && st.fut.length) { st.hist.push(JSON.stringify(st.cfg)); st.cfg = JSON.parse(st.fut.pop()); }
    fixPage(); showChange(was, st.cfg); save(); paint(); histPaint(); flash(i < now ? tr('Went back') : tr('Went forward'));
  }

  // pass 4 (flintcreate.js): every reply says which level answered (rules, a local model, a stronger AI)
  let lvlNow = 'rules';
  const FC = () => window.TribeFlintCreate;
  const fcApi = () => ({ design: () => st.cfg, core: () => S(), commit: c => commit(c), pid: () => st.pid, host: () => root, panel: n => { st.panel = n; paint(); },
    outline: () => st.cfg.pages.map(pg => `${pg.title}: ${pg.blocks.filter(b => !b.hidden).map(b => b.type + (b.props && b.props.title ? ` “${String(b.props.title).slice(0, 40)}”` : '')).join(', ')}`).join('\n'),
    say: (t, html, un, chips, lvl) => { const was = lvlNow; if (lvl) lvlNow = lvl; say(t, html || '', [...(un ? [undoAct()] : []), ...chipActs(chips)]); lvlNow = was; } });
  function say(text, extra, acts) { st.log.push({ who: 'flint', text, html: extra || '', acts: acts || [], lvl: lvlNow }); logPaint(); return text; }
  function logPaint() {
    if (!fui) mountFlint(); if (!fui || !st) return;
    st.log = st.log.slice(-40); fui.set(st.log);
    { const c = fui.el && fui.el.querySelector('[data-flm="clear"]'); if (c) c.hidden = !st.log.length; }   // pass 5: nothing to clear, no button
    const k = chipsNow().join('|'); if (k !== chipKey) { chipKey = k; fui.chips(chipsNow()); }
  }
  const FMX = () => window.TribeFlintMax;
  const undoAct = () => ({ label: 'Undo', fn: () => { if (undo()) say('Undone.'); } });
  const chipActs = l => (l || []).map(c => /…$/.test(c) ? { label: c, act: 'fill', arg: c.replace(/…$/, '').replace(/^Paste the link$/, '') } : { label: c, act: 'ask', arg: c });
  const ctxNow = () => ({ selKind: st.sel ? st.sel.kind || 'block' : '', selList: !!(st.sel && S().listsOf(st.sel.path).length), view: 'site', site: true, start: !$('#wdz-start').hidden || (!st.hist.length && !st.log.some(m => m.who === 'flint' && m.text)), pages: st.cfg.pages.map(p => p.title), selection: !!st.sel });
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
    flushText();   // words still being typed on the page are kept before Flint changes anything
    st.log.push({ who: 'me', text }); logPaint();
    const startShown = !$('#wdz-start').hidden;
    const NL = window.TribeNLU;
    if (st.pending && await answerPending(text, NL)) return st.log[st.log.length - 1].text || '';
    const P = NL ? NL.parse(text, ctxNow()) : { steps: [] };
    const steps = (P.steps || []).filter(s => s.intent && s.conf >= 0.6);
    if (startShown) hideStart();
    if (!steps.length || steps.length < (P.steps || []).length && !steps.some(s => /^site\./.test(s.intent))) {
      if (FC() && FC().loose && NL) {   // pass 4
        const lo = await FC().loose(text, { kind: 'site', ctx: ctxNow() });
        if (lo && lo.says.length) {
          const ls2 = lo.says.flatMap(q => ((NL.parse(q, ctxNow()).steps) || []).filter(x => x.intent && x.conf >= 0.6).map(x => ({ ...x, text: x.text || q })));
          if (ls2.length) { lvlNow = lo.level; try { return await runSteps(ls2, text, `<small class="fc-read">${esc(tr('Read as'))}: ${lo.says.map(esc).join(' · ')}</small>`); } finally { lvlNow = 'rules'; } }
        } else if (lo && lo.text) { lvlNow = lo.level; try { return say(lo.text); } finally { lvlNow = 'rules'; } }
      }
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
  async function runSteps(steps, text, note) {
    const before = JSON.stringify(st.cfg); let work = st.cfg; const said = []; let asked = null, chips = null, handed = false;
    const done = [], acts = []; let html = note || '';   // feat/flint-max: what to repeat elsewhere, Flint's swatches and tappable ideas
    for (const s of steps) {
      if (s.intent === 'undo') { if (work !== st.cfg) { st.cfg = work; } undo(); work = st.cfg; said.push(st.hist.length || st.fut.length ? 'Undone.' : 'Nothing to undo.'); continue; }
      if (s.intent === 'redo') { redo(); work = st.cfg; said.push('Redone.'); continue; }
      // pass 4 (flintcreate.js): Polish it, Make it beautiful, Check, "what can you do here?", "remove this section"
      if (s.intent === 'site.block.remove' && !s.slots.block) { const pg4 = work.pages.find(x => x.id === st.page) || work.pages[0], b4 = st.sel && pg4.blocks.find(x => x.id === st.sel.block); if (!b4) { said.push('Click the section first, then say it again.'); continue; } work = S().removeBlock(work, pg4.id, b4.id); st.sel = null; said.push(`Removed the ${S().BLOCKS[b4.type].label.toLowerCase()}. Undo brings it back.`); continue; }
      if (FC() && FC().site && /^site\.(?:polish|beautify|help|check|fixall|el\.colorname)$/.test(s.intent)) { commitAll(before, work); const t4 = await FC().site(s, fcApi()); work = st.cfg; if (t4) said.push(t4); else handed = true; continue; }
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
      // feat/site-editor2: a sentence about the selected words, button, picture or entry is answered for that thing first
      const r0 = /^site\./.test(s.intent) && S().commandEl ? S().commandEl(work, s, { page: st.page, sel: st.sel, facts: st.facts }) : null;
      const rx = r0 || (FMX() && /^site\./.test(s.intent) ? FMX().site(work, s, { page: st.page, sel: st.sel }, S()) : undefined);
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
      if (r.sel) st.sel = { block: r.sel.block, path: r.sel.path || '', kind: r.sel.kind || (/\.$/.test(r.sel.path || '') || /^site\.image/.test(s.intent) ? 'image' : 'block') };
      if (r.ask) asked = r.ask; if (r.chips) chips = r.chips;
      said.push(r.say);
      if (r.need === 'html' || r.need === 'zip') { if (work !== st.cfg) { commitAll(before, work); } await download(r.need); st.log.pop(); continue; }
      if (r.need === 'template' && r.template === 'app-redirect') { const pgg = pageNow(), gb0 = pgg.blocks.find(b => b.type === 'go'); if (gb0) { commitAll(before, work); if (r.go) { commit(S().setProp(st.cfg, pgg.id, gb0.id, 'to', r.go)); said.pop(); said.push(`${tr('This page sends people to')} ${r.go}.`); } else { said.pop(); said.push(tr('This page already sends people on: put the address on the right.')); st.sel = { block: gb0.id, path: '', kind: 'block' }; } work = st.cfg; continue; } }   // p5-start: already the page that sends people on: only the address changes
      if (r.need === 'template') { commitAll(before, work); if (r.template === 'app-redirect' && hasSite() && !(await okToReplace())) { said.pop(); said.push(tr('Kept your site.')); continue; } await useTemplate(r.template); if (r.go) { const pg0 = st.cfg.pages[0], gb = pg0.blocks.find(b => b.type === 'go'); if (gb) commit(S().setProp(st.cfg, pg0.id, gb.id, 'to', r.go)); } work = st.cfg; continue; }
      if (r.need === 'start') { commitAll(before, work); await showStart(hasSite(), r.kind || ''); continue; }   // p5-start
      if (r.need === 'publish') { commitAll(before, work); paint(); await publish(); st.log.pop(); continue; }
      if (r.need === 'device') { st.dev = r.dev; continue; }
      if (r.need === 'suggest') { commitAll(before, work); said.pop(); const SG = window.TribeSiteSuggest; if (!SG) { said.push('Suggestions are not loaded here.'); continue; } said.push(await SG.flint(r.mode, sgApi())); work = st.cfg; continue; }
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
  function commitAll(before, work) { if (JSON.stringify(work) === before || work === st.cfg && JSON.stringify(st.cfg) === before) return; if (work !== st.cfg && refuseLocked(work)) return; if (work !== st.cfg) { st.hist.push(before); st.fut = []; st.cfg = work; fixPage(); save(); } }
  async function boost(text) {
    const B = window.TribeBoost;
    if (B && await B.online() && window.TribeAIBasics && window.TribeAIBasics.ask) {
      try {
        const pg = pageNow(); const r = await window.TribeAIBasics.ask('site.design', { ask: text, page: pg.title, blocks: pg.blocks.map(b => ({ id: b.id, type: b.type, props: Object.fromEntries(Object.entries(b.props).filter(([, v]) => typeof v === 'string' && !/^data:/.test(v))) })) }, '');
        const j = r && r.text ? JSON.parse((/\{[\s\S]*\}/.exec(r.text) || ['{}'])[0]) : null;
        let c = st.cfg, n = 0;
        for (const op of (j && j.ops) || []) { if (op.block && op.path && typeof op.value === 'string' && pg.blocks.some(b => b.id === op.block)) { c = S().setProp(c, st.page, op.block, op.path, op.value.slice(0, 600)); n++; } else if (op.add && S().BLOCKS[op.add]) { c = S().addBlock(c, st.page, op.add).cfg; n++; } }
        if (n) { commit(c); lvlNow = 'agent'; try { return say(`${j.say || 'Done.'} ✦ via ${r.via}`, '', [undoAct()]); } finally { lvlNow = 'rules'; } }
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
  // the suggestion engine applies a website suggestion here when the designer shows that project: one normal edit, one Undo
  function applyChange({ ops, fn } = {}) { if (!st) return false; let next = null; if (ops) { const r = S().applyOps(st.cfg, ops); if (!r.done.length) return false; next = r.cfg; } else if (typeof fn === 'function') next = fn(st.cfg); return commit(next, { fromSuggest: true }); }
  window.TribeSiteDesigner = { flint: open => flintDock(open == null ? null : !!open, { remember: false, focus: false }), applyChange, importCfg, dropFiles, open, close, ask, download, undo, redo, flush, dirty, hasDraft, comments: () => st ? st.comments : [], state: () => st && { multi: (st.multi || []).length, pid: st.pid, page: st.page, sel: st.sel, hist: st.hist.length, fut: st.fut.length, log: st.log, pending: st.pending || null, open: !!root && !root.hidden, dirty: st.dirty, rev: st.rev, dev: st.dev, panel: st.panel, cmode: st.cmode, zoom: st.zoom || 1, wide: !!st.wide }, cfg: () => st && st.cfg, useTemplate, gallery: () => gal.list, perf: () => ({ open: perf.open, ready: perf.ready }), zoom: setZoom, code: codeSheet, snap: snapSite };
})();
