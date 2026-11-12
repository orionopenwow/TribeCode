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
  let root = null, st = null, saveT = 0, frameScroll = 0, liveText = null;

  const EDIT_CSS = `<style>[data-e]{cursor:text;border-radius:2px}[data-e]:hover{outline:1px dashed var(--muted);outline-offset:2px}[data-e]:focus{outline:2px solid var(--accent);outline-offset:2px}
[data-block]{position:relative}[data-block]:hover{outline:1px dashed var(--line);outline-offset:-1px}.wdz-sel{outline:2px solid var(--accent)!important;outline-offset:-2px}
[data-img]{cursor:pointer}[data-unwired]{outline:1px dashed var(--muted);outline-offset:3px}[data-unwired]::after{content:'not linked';font:600 10px/1 ui-monospace,monospace;margin-left:8px;opacity:.7}</style>`;
  const EDIT_JS = `<script>(function(){var post=function(m){m.sd=1;parent.postMessage(m,'*')};
document.addEventListener('click',function(e){var a=e.target.closest('a');if(a)e.preventDefault();var t=e.target;
var pg=t.closest('[data-page]');if(pg)return post({t:'page',id:pg.dataset.page});
var b=t.closest('[data-btn]');if(b)return post({t:'select',key:b.dataset.btn,kind:'button'});
var im=t.closest('[data-img]');if(im)return post({t:'select',key:im.dataset.img,kind:'image'});
var bl=t.closest('[data-block]');if(bl)post({t:'select',key:bl.dataset.block+'|',kind:'block'})},true);
document.addEventListener('submit',function(e){e.preventDefault()},true);
document.addEventListener('input',function(e){var el=e.target.closest('[data-e]');if(el)post({t:'text',key:el.dataset.e,value:el.innerText})});
document.addEventListener('focusout',function(e){var el=e.target.closest('[data-e]');if(el)post({t:'commit',key:el.dataset.e,value:el.innerText})});
document.addEventListener('keydown',function(e){var el=e.target.closest('[data-e]');if(el&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();el.blur()}if((e.ctrlKey||e.metaKey)&&!el&&/^[zy]$/i.test(e.key)){e.preventDefault();post({t:(e.key.toLowerCase()==='y'||e.shiftKey)?'redo':'undo'})}});
addEventListener('message',function(e){var d=e.data||{};if('sel' in d){[].forEach.call(document.querySelectorAll('.wdz-sel'),function(x){x.classList.remove('wdz-sel')});if(d.sel){var el=document.querySelector(d.sel);if(el){el.classList.add('wdz-sel');if(d.scroll)el.scrollIntoView({block:'center'})}}}if(d.y!=null)scrollTo(0,d.y)});
addEventListener('scroll',function(){post({t:'scroll',y:scrollY})},{passive:true});post({t:'ready'})})()<\/script>`;

  // ---------- state, history, saving ----------
  function fresh(cfg, pid) { return { pid, cfg: S().normalize(cfg), hist: [], fut: [], page: null, sel: null, dev: 'desktop', log: [], canEdit: true }; }
  const pageNow = () => st.cfg.pages.find(p => p.id === st.page) || st.cfg.pages[0];
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
  function save() {
    clearTimeout(saveT); const pid = st.pid, cfg = st.cfg;
    const status = $('#wdz-saved'); if (status) status.textContent = 'Saving…';
    saveT = setTimeout(async () => {
      try {
        if (pid && connected()) await C.api(`/projects/${encodeURIComponent(pid)}/site-config`, { method: 'PUT', body: { config: cfg } });
        else localStorage.setItem(LOCAL, JSON.stringify(cfg));
        if (status) status.textContent = pid && connected() ? 'Saved' : 'Saved on this device';
      } catch (e) { if (status) status.textContent = 'Not saved: ' + e.message; }
    }, 350);
  }
  const flush = () => new Promise(r => { if (!saveT) return r(); setTimeout(r, 450); });

  // ---------- open / close ----------
  async function open(o = {}) {
    if (!S()) return;
    const pid = o.pid || (C && C.project && C.project()) || '';
    let cfg = o.cfg || null;
    if (!cfg && pid && connected()) { try { cfg = (await C.api(`/projects/${encodeURIComponent(pid)}/site-config`)).config; } catch {} }
    if (!cfg && !pid) { try { cfg = JSON.parse(localStorage.getItem(LOCAL) || 'null'); } catch {} }
    mount();
    st = fresh(cfg || S().blank(projectName(pid)), pid);
    st.page = st.cfg.pages[0].id;
    root.hidden = false; document.body.classList.add('wdz-open');
    if (o.template) await useTemplate(o.template, true);
    else if (!cfg) showStart(); else paint();
    if (o.ask) setTimeout(() => ask(o.ask), 60);
    return st;
  }
  function close() { if (!root) return; flush(); root.hidden = true; document.body.classList.remove('wdz-open'); if (location.hash === '#/site-designer') history.back(); }
  function projectName(pid) { try { const p = ((C.state && C.state().projects) || []).find(x => x.id === pid); return (p && p.name) || 'My site'; } catch { return 'My site'; } }
  async function templateCfg(id) {
    if (connected()) { try { return (await C.api('/site-designer/template/' + encodeURIComponent(id))).config; } catch {} }
    return S().fromTemplate(id, { name: projectName(st && st.pid) });
  }
  async function useTemplate(id, first) {
    const c = await templateCfg(id); if (!c) return false;
    const keepName = st.cfg && st.cfg.name && st.cfg.name !== 'My site' && !first ? st.cfg.name : null;
    if (first && !st.hist.length && !st.log.length) { st.cfg = S().normalize(c); st.page = st.cfg.pages[0].id; save(); paint(); }
    else commit(c);
    st.page = st.cfg.pages[0].id; st.sel = null; hideStart(); paint();
    return !!keepName || true;
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
        <span class="wdz-devs" role="group" aria-label="Preview size"><button type="button" class="btn ghost sm" data-dev="desktop" aria-pressed="true">Desktop</button><button type="button" class="btn ghost sm" data-dev="phone" aria-pressed="false">Phone</button></span>
        <button type="button" class="btn sm" data-wdz="templates">Templates</button>
        <button type="button" class="btn sm" data-wdz="save">Save version</button>
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
          <div class="wdz-insp" id="wdz-insp"></div>
          <section class="wdz-flint" aria-label="Flint">
            <p class="wdz-fhead"><img src="assets/flint.svg" alt="" width="12" height="15"><b>Flint</b><span class="wdz-free">Free · no AI</span></p>
            <div class="wdz-log" id="wdz-log" aria-live="polite"></div>
            <div class="wdz-chips" id="wdz-chips">${['Make the buttons work', 'Add a page called About', 'Dark mode', 'Add a gallery', 'Make the picture round'].map(c => `<button type="button" class="wdz-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
            <form class="wdz-form" id="wdz-form" autocomplete="off"><input class="input" id="wdz-in" maxlength="400" placeholder="Tell Flint: wire this button to the contact page…" aria-label="Tell Flint what to change"><button type="submit" class="btn sm primary">Send</button></form>
          </section>
        </aside>
      </div>
      <div class="wdz-start" id="wdz-start" hidden></div>
      <input type="file" id="wdz-file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden>`;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.querySelector('#wdz-form').addEventListener('submit', e => { e.preventDefault(); const i = $('#wdz-in'), v = i.value.trim(); if (v) { i.value = ''; ask(v); } });
    root.querySelector('#wdz-theme').addEventListener('change', e => commit(S().setTheme(st.cfg, e.target.value)));
    root.querySelector('#wdz-file').addEventListener('change', onFile);
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#wdz-dlmenu').hidden) { $('#wdz-dlmenu').hidden = true; return; }
      const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    });
    addEventListener('message', onFrame);
    if (window.TribeBoost) window.TribeBoost.bind(root);
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
    $('#wdz-blocks').innerHTML = pg.blocks.map((b, i) => `<li class="wdz-blk${st.sel && st.sel.block === b.id ? ' is-sel' : ''}" draggable="true" data-blk="${b.id}" data-i="${i}"><span class="wdz-grip" aria-hidden="true">⋮⋮</span><button type="button" class="wdz-blk-t" data-pick="${b.id}">${esc(S().BLOCKS[b.type].label.replace(/ \(.*/, ''))}<small>${esc(b.variant)}</small></button><span class="wdz-blk-acts"><button type="button" data-move="up" data-id="${b.id}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button type="button" data-move="down" data-id="${b.id}" aria-label="Move down"${i < pg.blocks.length - 1 ? '' : ' disabled'}>↓</button><button type="button" data-del="${b.id}" aria-label="Delete block">×</button></span></li>`).join('');
    frame(); inspector(); logPaint();
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
  function frame() {
    const f = $('#wdz-frame'); if (!f) return;
    const fonts = file => FONTS.get(file) || '';
    if (!fontsAsked) loadFonts();
    f.srcdoc = S().render(st.cfg, { page: st.page, edit: true, mode: 'single', fonts, extraHead: EDIT_CSS, extraBody: EDIT_JS });
  }
  function postSel(scroll) {
    const f = $('#wdz-frame'); if (!f || !f.contentWindow) return;
    const s = st.sel, sel = !s ? '' : s.kind === 'button' ? `[data-btn="${s.block}|${s.path}"]` : s.kind === 'image' ? `[data-img="${s.block}|${s.path}"]` : `[data-block="${s.block}"]`;
    f.contentWindow.postMessage({ sel, scroll }, '*');
  }
  function onFrame(e) {
    const d = e.data; if (!d || !d.sd || !root || root.hidden) return;
    const f = $('#wdz-frame'); if (!f || e.source !== f.contentWindow) return;
    if (d.t === 'ready') { f.contentWindow.postMessage({ y: frameScroll }, '*'); postSel(false); return; }
    if (d.t === 'scroll') { frameScroll = d.y; return; }
    if (d.t === 'page') { st.page = d.id; st.sel = null; frameScroll = 0; paint(); return; }
    if (d.t === 'undo') return undo();
    if (d.t === 'redo') return redo();
    if (d.t === 'select') { const [block, path] = String(d.key).split('|'); st.sel = { block, path: path || '', kind: d.kind }; inspector(); postSel(false); $('#wdz-blocks').querySelectorAll('.wdz-blk').forEach(li => li.classList.toggle('is-sel', li.dataset.blk === block)); return; }
    if (d.t === 'text') { liveText = d; return; }
    if (d.t === 'commit') {
      liveText = null;
      const [block, path] = String(d.key).split('|'), b = pageNow().blocks.find(x => x.id === block); if (!b) return;
      const v = String(d.value || '').replace(/ /g, ' ').trim();
      if (String(S().getAt(b.props, path) ?? '') === v) return;
      st.hist.push(JSON.stringify(st.cfg)); st.fut = []; st.cfg = S().setProp(st.cfg, st.page, block, path, v);
      if (path === 'name' && b.type === 'links') {} save();
      root.querySelector('[data-wdz="undo"]').disabled = false; inspector();
    }
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
    if (t.closest('[data-chip]')) return ask(t.closest('[data-chip]').dataset.chip);
    if (t.closest('[data-tpl]')) { await useTemplate(t.closest('[data-tpl]').dataset.tpl); say(`Started from the ${t.closest('[data-tpl]').dataset.title || 'chosen'} template. Undo brings back what you had.`); return; }
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
    if (!a) { if (!t.closest('.wdz-dl')) $('#wdz-dlmenu').hidden = true; return; }
    const k = a.dataset.wdz;
    if (k === 'close') return close();
    if (k === 'undo') return undo();
    if (k === 'redo') return redo();
    if (k === 'mode') return commit(S().setMode(st.cfg, st.cfg.theme.mode === 'dark' ? 'light' : 'dark'));
    if (k === 'addpage') { const r = S().addPage(st.cfg, ''); commit(r.cfg); st.page = r.page.id; paint(); say(`Added ${r.page.title}. Rename it: “rename this page to About”.`); return; }
    if (k === 'picker') { const p = $('#wdz-picker'); p.hidden = !p.hidden; a.setAttribute('aria-expanded', String(!p.hidden)); if (!p.hidden) p.innerHTML = S().TYPES.map(ty => `<div class="wdz-pk"><b>${esc(S().BLOCKS[ty].label)}</b><span>${S().BLOCKS[ty].variants.map(v => `<button type="button" class="wdz-chip" data-add="${ty}" data-v="${v}">${esc(v)}</button>`).join('')}</span></div>`).join(''); return; }
    if (k === 'templates') return showStart(true);
    if (k === 'dlmenu') { const m = $('#wdz-dlmenu'); m.hidden = !m.hidden; a.setAttribute('aria-expanded', String(!m.hidden)); return; }
    if (k === 'dl-html' || k === 'dl-zip') { $('#wdz-dlmenu').hidden = true; return download(k === 'dl-zip' ? 'zip' : 'html'); }
    if (k === 'publish') { $('#wdz-dlmenu').hidden = true; return publish(); }
    if (k === 'save') return saveVersion();
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
    const file = e.target.files && e.target.files[0]; if (!file || !fileFor) return;
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
    if (!st.pid || !connected()) { try { localStorage.setItem(LOCAL + '.v', JSON.stringify(st.cfg)); } catch {} return say('Saved a version on this device.'); }
    clearTimeout(saveT); saveT = 0;
    try { await C.api(`/projects/${encodeURIComponent(st.pid)}/site-config`, { method: 'PUT', body: { config: st.cfg } }); const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/website/versions`, { method: 'POST', body: { note: `Designer · ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` } }); say('Saved to the Saved shelf. Restore it any time from Preview › Saved or Files › Website.'); return r; } catch (e) { say(e.message); }
  }

  // ---------- the start screen: 16 templates or blank ----------
  async function showStart(fromBar) {
    const box = $('#wdz-start'); box.hidden = false;
    let list = [];
    if (connected()) { try { list = (await C.api('/site-designer/templates')).templates; } catch {} }
    if (!list.length) list = S().TEMPLATES.map(id => ({ id, title: id, summary: '' }));
    box.innerHTML = `<div class="wdz-start-in"><p class="wdz-eyebrow">Website</p><h2>Start from a template</h2><p class="wdz-hint">Every template is blocks you can change, wire and export. Or tell Flint what the site is for.</p>
      <div class="wdz-tpls">${list.map(t => `<button type="button" class="wdz-tpl" data-tpl="${esc(t.id)}" data-title="${esc(t.title)}"><img src="${connected() ? `${esc(C.base ? C.base() : '')}/api/site-library/${esc(t.id)}/thumb.png` : ''}" alt="" loading="lazy"><b>${esc(t.title)}</b><small>${esc(t.summary)}</small></button>`).join('')}</div>
      <p class="wdz-row"><button type="button" class="btn sm" data-start="blank">${fromBar ? 'Keep my design' : 'Start blank'}</button></p></div>`;
    box.querySelectorAll('img').forEach(i => { i.onerror = () => { i.remove(); }; });
  }
  function hideStart() { const b = $('#wdz-start'); if (b) b.hidden = true; }

  // ---------- Flint ----------
  function say(text, extra) { st.log.push({ who: 'flint', text, html: extra || '' }); logPaint(); return text; }
  function logPaint() {
    const box = $('#wdz-log'); if (!box) return;
    box.innerHTML = st.log.slice(-30).map(m => m.who === 'me' ? `<p class="wdz-me">${esc(m.text)}</p>` : `<div class="wdz-fl"><img src="assets/flint.svg" alt="" width="11" height="14"><div>${m.text ? `<p>${esc(m.text)}</p>` : ''}${m.html || ''}</div></div>`).join('') || `<p class="wdz-hint">Say what you want: “make the buttons work”, “add a page called About”, “replace the image”, “dark mode”, “download the html”. No AI needed.</p>`;
    box.scrollTop = box.scrollHeight;
  }
  const ctxNow = () => ({ view: 'site', site: true, start: !$('#wdz-start').hidden || (!st.hist.length && !st.log.some(m => m.who === 'flint' && m.text)), pages: st.cfg.pages.map(p => p.title), selection: !!st.sel });
  async function ask(text) {
    if (!st) return '';
    st.log.push({ who: 'me', text }); logPaint();
    const startShown = !$('#wdz-start').hidden;
    const NL = window.TribeNLU; const P = NL ? NL.parse(text, ctxNow()) : { steps: [] };
    const steps = (P.steps || []).filter(s => s.intent && s.conf >= 0.6);
    if (startShown) hideStart();
    if (!steps.length) return boost(text);
    const before = JSON.stringify(st.cfg); let work = st.cfg; const said = [];
    for (const s of steps) {
      if (s.intent === 'undo') { if (work !== st.cfg) { st.cfg = work; } undo(); work = st.cfg; said.push(st.hist.length || st.fut.length ? 'Undone.' : 'Nothing to undo.'); continue; }
      if (s.intent === 'redo') { redo(); work = st.cfg; said.push('Redone.'); continue; }
      if (s.intent === 'lesson' && window.TribeFlintLessons) { window.TribeFlintLessons.open(s.slots.feature); said.push('Opened the lesson.'); continue; }
      const r = S().command(work, s, { page: st.page, sel: st.sel });
      if (!r) {
        if (window.TribeFlintLocal && !/^(build\.|canvas\.|edit\.)/.test(s.intent)) { const out = []; try { await window.TribeFlintLocal.handle(s.text || text, { say: t => { out.push(String(t || '').replace(/<[^>]+>/g, '')); return true; }, act: l => l, legacy: async t => { if (window.TribeFlint && window.TribeFlint.ask) window.TribeFlint.ask(t); out.push('Done in Flint’s chat.'); return true; }, special: async () => false, legacyHit: () => false, modelOnline: () => false, task: async (title, extra) => { try { return (await C.api('/tasks', { method: 'POST', body: { title, ...(extra || {}) } })).task; } catch { return null; } } }); } catch {} if (out.length) { said.push(out.join(' ')); continue; } }
        said.push(''); return boost(text);
      }
      if (r.cfg) work = S().normalize(r.cfg);
      if (r.page) st.page = r.page;
      if (r.sel) st.sel = { block: r.sel.block, path: r.sel.path || '', kind: /\.$/.test(r.sel.path || '') || /^site\.image/.test(s.intent) ? 'image' : 'block' };
      said.push(r.say);
      if (r.need === 'html' || r.need === 'zip') { if (work !== st.cfg) { commitAll(before, work); } await download(r.need); st.log.pop(); continue; }
      if (r.need === 'template') { commitAll(before, work); await useTemplate(r.template); work = st.cfg; continue; }
      if (r.need === 'upload') { commitAll(before, work); paint(); pickFile(); }
      if (r.need === 'board') { commitAll(before, work); paint(); board(); }
      if (r.need === 'alt') { commitAll(before, work); paint(); setTimeout(() => { const i = $('#wdz-alt'); if (i) i.focus(); }, 30); }
    }
    commitAll(before, work);
    const reply = said.filter(Boolean).join(' ');
    say(reply); paint(); postSel(true);
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
        if (n) { commit(c); return say(`${j.say || 'Done.'} ✦ via ${r.via}`); }
      } catch {}
    }
    const did = 'Nothing changed: that is not one of my free edits. For free I wire buttons, add and rename pages, add, move and remove blocks, swap and crop pictures, switch themes and dark mode, change words, and export HTML.';
    const would = 'An AI reads the request the way you said it and turns it into the same edits here, each one undoable.';
    st.log.push({ who: 'flint', text: '', html: B ? B.html({ did, would, ask: text }) : esc(did) }); logPaint();
    return 'boost';
  }

  // the #/site-designer link (router-free: a hash opens it over whatever is on screen)
  addEventListener('hashchange', () => { if (location.hash === '#/site-designer' && (!root || root.hidden)) open({}); });
  if (location.hash === '#/site-designer') addEventListener('load', () => setTimeout(() => open({}), 300));

  window.TribeSiteDesigner = { open, close, ask, download, undo, redo, state: () => st && { pid: st.pid, page: st.page, sel: st.sel, hist: st.hist.length, fut: st.fut.length, log: st.log, open: !!root && !root.hidden }, cfg: () => st && st.cfg, useTemplate };
})();
