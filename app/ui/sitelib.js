// Website templates (feat/site-templates): a gallery of 16 real website templates (link in bio, merch shop, café,
// band, portfolio, …) and a Customize panel with three skill levels, driven by each site's site.json
// (server/sitelib.js, templates/sites/<id>/).
//   Easy         a short form: name, words, links, photos, a couple of colors. The preview updates as you type.
//   Comfortable  + looks (presets), fonts, every color, and sections you can hide or reorder; "Edit on the page"
//                opens the preview with Flint and the property sheet.
//   Pro          + the files, with what each one is for; the code is plain HTML/CSS/JS, commented.
// Edits are saved to site.json (and the pages re-rendered) as you go; Done saves a version (a git commit).
// Public: window.TribeSiteLib = { open({ pid }), edit({ pid, dir, level }), close() }
(function () {
  const nice = n => /[A-Z ]/.test(n) ? n : String(n).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());   // polish: a folder name like ember-socks reads as Ember Socks
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const t = s => (window.TribeI18n && window.TribeI18n.t && window.TribeI18n.t(s, s)) || s;
  const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const LEVELS = [
    { id: 'easy', label: 'Easy', sub: 'Fill in a short form. No code.' },
    { id: 'comfortable', label: 'Comfortable', sub: 'Also change the look, fonts and sections.' },
    { id: 'pro', label: 'Pro', sub: 'Also open the code. It\'s plain and commented.' },
  ];
  const FONTS = ['Fraunces', 'Instrument Serif', 'Bricolage Grotesque', 'Space Grotesk', 'JetBrains Mono', 'Silkscreen', 'Inter', 'System sans', 'System serif', 'Humanist', 'Geometric', 'Condensed', 'Monospace'];
  const COLOR_NAMES = { bg: 'Background', ink: 'Text', muted: 'Quiet text', card: 'Cards', panel: 'Panels', soft: 'Soft background', line: 'Lines', accent: 'Accent', hot: 'Highlight', pop: 'Highlight', rose: 'Second accent', leaf: 'Second accent', warn: 'Second accent' };

  let ov = null, lib = null, st = null;   // st: the open editor { pid, dir, data, level, title, frameUrl }

  // ---------- small helpers ----------
  const get = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function set(o, p, v) { const ks = String(p).split('.'); let cur = o; ks.slice(0, -1).forEach(k => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; }); cur[ks[ks.length - 1]] = v; }
  function overlay(cls) {
    close();
    ov = document.createElement('div');
    ov.className = 'slx ' + (cls || ''); ov.id = 'slx';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', t('Website templates'));
    document.body.appendChild(ov);
    ov.tabIndex = -1; setTimeout(() => { if (ov && !ov.contains(document.activeElement)) ov.focus(); }, 0);
    return ov;
  }
  function close() { if (ov) ov.remove(); ov = null; st = null; clearTimeout(saveT); }
  // Esc closes the gallery, or leaves Customize (saving first), wherever focus is
  document.addEventListener('keydown', e => { if (e.key !== 'Escape' || !ov) return; e.stopPropagation(); e.preventDefault(); if (st) done(false); else close(); }, true);

  // ---------- the gallery ----------
  async function open(opts = {}) {
    const pid = opts.pid || (C && C.project());
    const el = overlay('slx--gallery');
    el.innerHTML = `<div class="slx-win"><header class="slx-head"><div><p class="slx-eye">${t('Website templates')}</p><h2>${t('Start a site')}</h2></div>
      <label class="slx-search"><span class="sr-only">${t('Search templates')}</span><input id="slx-q" type="search" placeholder="${esc(t('Search templates'))}" autocomplete="off"></label>
      <button class="slx-x" type="button" data-slx="close" aria-label="${esc(t('Close'))}">×</button></header>
      <div class="slx-cats" id="slx-cats" role="tablist" aria-label="${esc(t('Categories'))}"></div>
      <div class="slx-body"><ul class="slx-grid" id="slx-grid"><li class="slx-loading">${t('Loading…')}</li></ul><aside class="slx-pick" id="slx-pick" hidden></aside></div></div>`;
    el.querySelector('[data-slx=close]').onclick = close;
    try { lib = lib || await C.api('/site-library'); if (!lib || !Array.isArray(lib.templates)) { lib = null; throw new Error('Website templates open once this project has a home. The website designer has templates that work right here.'); } lib.categories = lib.categories || []; } catch (e) { el.querySelector('#slx-grid').innerHTML = `<li class="slx-loading">${esc(e.message)}</li>`; return; }
    let cat = 'all', q = '';
    const cats = el.querySelector('#slx-cats');
    cats.innerHTML = [{ id: 'all', label: 'All' }, ...lib.categories].map(c => `<button type="button" role="tab" data-cat="${c.id}" aria-selected="${c.id === 'all'}">${esc(t(c.label))}</button>`).join('');
    cats.onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; cats.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-selected', String(x === b))); paint(); };
    const qi = el.querySelector('#slx-q'); qi.oninput = () => { q = qi.value.trim().toLowerCase(); paint(); };
    function paint() {
      const list = lib.templates.filter(x => (cat === 'all' || x.category === cat) && (!q || [x.title, x.summary, ...(x.tags || []), ...(x.goodFor || [])].join(' ').toLowerCase().includes(q)));
      el.querySelector('#slx-grid').innerHTML = list.length ? list.map(x => `<li><button type="button" class="slx-card" data-tpl="${esc(x.id)}">
        <span class="slx-th">${x.thumb ? `<img src="${esc(C.base() + x.thumb)}" alt="" loading="lazy" width="640" height="400">` : ''}</span>
        <span class="slx-ct"><b>${esc(x.title)}</b><small>${esc(x.summary)}</small></span></button></li>`).join('') : `<li class="slx-loading">${t('No templates match that.')}</li>`;
    }
    el.querySelector('#slx-grid').onclick = e => { const b = e.target.closest('[data-tpl]'); if (b) detail(pid, b.dataset.tpl); };
    paint();
    setTimeout(() => qi.focus(), 30);
  }
  function detail(pid, id) {
    const x = lib.templates.find(y => y.id === id); if (!x || !ov) return;
    const box = ov.querySelector('#slx-pick'); box.hidden = false; ov.classList.add('has-pick');
    const p = ((C.state() || {}).projects || []).find(pp => pp.id === pid) || {};
    let level = lsGet('tribecode.sitelib.level', 'easy');
    box.innerHTML = `<button class="slx-back" type="button" data-slx="unpick">← ${t('All templates')}</button>
      ${x.thumb ? `<img class="slx-big" src="${esc(C.base() + x.thumb)}" alt="" width="640" height="400">` : ''}
      <h3>${esc(x.title)}</h3><p class="slx-sum">${esc(x.summary)}</p>
      ${(x.goodFor || []).length ? `<p class="slx-good"><span>${t('Good for')}</span>${x.goodFor.map(g => `<i>${esc(g)}</i>`).join('')}</p>` : ''}
      <label class="slx-f"><span>${t('Your site name')}</span><input id="slx-name" value="${esc(nice(p.name || ''))}" maxlength="80" placeholder="${t('Your site name')}"></label>
      <fieldset class="slx-levels"><legend>${t('How do you want to customize it?')}</legend>${LEVELS.map(l => `<label class="slx-lv"><input type="radio" name="slx-lv" value="${l.id}" ${l.id === level ? 'checked' : ''}><span><b>${t(l.label)}</b><small>${t(l.sub)}</small></span></label>`).join('')}</fieldset>
      <button class="btn primary slx-use" type="button" id="slx-use">${t('Use this template')}</button>
      <p class="slx-fine">${window.TribeDevice && window.TribeDevice.on() ? 'It opens in the website designer, kept on this device.' : t('It goes into your project\'s code. Nothing you already have gets overwritten.')}</p>`;
    box.querySelector('[data-slx=unpick]').onclick = () => { box.hidden = true; ov.classList.remove('has-pick'); };
    box.querySelectorAll('input[name=slx-lv]').forEach(r => { r.onchange = () => { level = r.value; lsSet('tribecode.sitelib.level', level); }; });
    box.querySelector('#slx-use').onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = t('Making it…');
      // feat/calm-parity: a project on this device has no code folder to copy into; the same template opens in the website designer
      if (window.TribeDevice && window.TribeDevice.on() && window.TribeSiteDesigner) { close(); return window.TribeSiteDesigner.open({ pid, template: id }); }
      try {
        const r = await C.api(`/projects/${encodeURIComponent(pid)}/site-library`, { method: 'POST', body: { template: id, name: box.querySelector('#slx-name').value.trim(), level } });
        toast(`✓ ${x.title}: ${r.files.length} files${r.dir ? ' in ' + r.dir + '/' : ''}`);
        edit({ pid, dir: r.dir, level });
      } catch (err) { b.disabled = false; b.textContent = t('Use this template'); toast(err.message); }
    };
    box.querySelector('#slx-name').focus();
  }

  // ---------- Customize ----------
  let saveT = null, saving = false;
  async function edit({ pid, dir = '', level } = {}) {
    pid = pid || C.project();
    level = level || lsGet('tribecode.sitelib.level', 'easy');
    const el = overlay('slx--edit');
    el.innerHTML = `<div class="slx-win"><div class="slx-loading">${t('Loading…')}</div></div>`;
    let r, info;
    try { r = await C.api(`/projects/${encodeURIComponent(pid)}/site-data?dir=${encodeURIComponent(dir)}`); info = await C.api('/preview/token', { method: 'POST' }); }
    catch (e) { el.innerHTML = `<div class="slx-win"><p class="slx-loading">${esc(e.message)}</p><button class="btn" type="button" data-slx="close">${t('Close')}</button></div>`; el.querySelector('[data-slx=close]').onclick = close; return; }
    const base = /^https?:/.test(info.path) ? info.path : C.base() + info.path;
    st = { pid, dir: r.dir, data: r.data, files: r.files, level, title: (r.data.meta || {}).title || 'Website', frameUrl: base + (r.dir ? r.dir + '/' : '') };
    el.innerHTML = `<div class="slx-win"><header class="slx-head slx-head--edit">
        <div><p class="slx-eye">${t('Customize')} · ${esc(st.title)}</p><h2 id="slx-site-name">${esc(st.data.name || '')}</h2></div>
        <div class="slx-seg" role="radiogroup" aria-label="${esc(t('Skill level'))}">${LEVELS.map(l => `<button type="button" role="radio" data-lv="${l.id}" aria-checked="${l.id === level}" title="${esc(t(l.sub))}">${t(l.label)}</button>`).join('')}</div>
        <span class="slx-state" id="slx-state" aria-live="polite">${t('Saved')}</span>
        <button class="btn primary" type="button" data-slx="done">${t('Done')}</button></header>
      <div class="slx-edit"><form class="slx-form" id="slx-form" autocomplete="off"></form>
        <div class="slx-pv"><div class="slx-pvbar"><div class="slx-seg slx-dev" role="radiogroup" aria-label="${esc(t('Device size'))}"><button type="button" role="radio" data-dev="desk" aria-checked="true">${t('Desktop')}</button><button type="button" role="radio" data-dev="phone" aria-checked="false">${t('Phone')}</button></div><span class="slx-url">${esc((r.dir ? r.dir + '/' : '') + 'index.html')}</span></div>
          <div class="slx-frame"><iframe id="slx-iframe" title="${esc(t('Preview of your site'))}" sandbox="allow-scripts allow-forms allow-popups" src="${esc(st.frameUrl)}"></iframe></div></div></div></div>`;
    el.querySelector('[data-slx=done]').onclick = () => done(true);
    el.querySelectorAll('[data-lv]').forEach(b => { b.onclick = () => { st.level = b.dataset.lv; lsSet('tribecode.sitelib.level', st.level); el.querySelectorAll('[data-lv]').forEach(x => x.setAttribute('aria-checked', String(x === b))); form(); }; });
    el.querySelectorAll('[data-dev]').forEach(b => { b.onclick = () => { el.querySelectorAll('[data-dev]').forEach(x => x.setAttribute('aria-checked', String(x === b))); el.querySelector('.slx-frame').classList.toggle('is-phone', b.dataset.dev === 'phone'); }; });
    form();
  }
  function push() {   // the preview updates as you type; the file is saved a moment later
    const f = ov && ov.querySelector('#slx-iframe');
    try { f && f.contentWindow && f.contentWindow.postMessage({ tc: 'site-data', data: st.data }, '*'); } catch {}
    const nm = ov && ov.querySelector('#slx-site-name'); if (nm) nm.textContent = st.data.name || '';
    state(t('Saving…')); clearTimeout(saveT); saveT = setTimeout(save, 700);
  }
  function state(s) { const x = ov && ov.querySelector('#slx-state'); if (x) x.textContent = s; }
  async function save() {
    if (!st) return; saving = true;
    try { await C.api(`/projects/${encodeURIComponent(st.pid)}/site-data`, { method: 'PUT', body: { dir: st.dir, data: st.data } }); state(t('Saved')); }
    catch (e) { state(t('Not saved')); toast(e.message); }
    saving = false;
  }
  async function done(commit) {
    if (!st) return close();
    const s = st; clearTimeout(saveT); await save();
    if (commit) { try { await C.api(`/projects/${encodeURIComponent(s.pid)}/flint/save`, { method: 'POST', body: { message: `Customize the ${s.title} site (via TribeCode)` } }); } catch {} }
    close();
    if (commit && window.TribePreview && window.TribePreview.show) window.TribePreview.show(s.dir ? s.dir + '/' : '');
  }

  function field(f, val, path) {
    const id = 'slx-' + path.replace(/[^\w]/g, '-');
    const lab = `<span>${esc(t(f.label || f.key))}</span>`;
    if (f.type === 'textarea') return `<label class="slx-f" for="${id}">${lab}<textarea id="${id}" data-path="${esc(path)}" rows="3">${esc(val)}</textarea></label>`;
    if (f.type === 'image') return `<div class="slx-f slx-img">${lab}<span class="slx-imgrow"><img src="${esc(st.frameUrl + (val || ''))}" alt="" width="56" height="56"><input id="${id}" data-path="${esc(path)}" value="${esc(val)}" aria-label="${esc(t(f.label || f.key))}"><label class="btn sm slx-up">${t('Choose photo')}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="${esc(path)}" hidden></label></span></div>`;
    if (f.type === 'lines') {
      const keys = ['n', 'p', 'd'];
      const text = (Array.isArray(val) ? val : []).map(o => keys.map(k => (o && o[k]) || '').join(' · ').replace(/( · )+$/, '')).join('\n');
      return `<label class="slx-f" for="${id}">${lab}<textarea id="${id}" data-lines="${esc(path)}" rows="${Math.max(3, (val || []).length + 1)}">${esc(text)}</textarea></label>`;
    }
    return `<label class="slx-f" for="${id}">${lab}<input id="${id}" type="${f.type === 'url' ? 'url' : 'text'}" data-path="${esc(path)}" value="${esc(val)}"></label>`;
  }
  function form() {
    const box = ov && ov.querySelector('#slx-form'); if (!box || !st) return;
    const d = st.data, lv = st.level, th = d.theme || {};
    const parts = [];
    // the form the template asks for
    for (const f of d.form || []) {
      if (f.type === 'list') {
        const arr = Array.isArray(get(d, f.key)) ? get(d, f.key) : [];
        parts.push(`<fieldset class="slx-list" data-list="${esc(f.key)}"><legend>${esc(t(f.label || f.key))}</legend>${arr.map((it, i) => `<details class="slx-item" ${arr.length <= 3 || i === 0 || st.openItem === f.key + ':' + i ? 'open' : ''}><summary class="slx-item-h"><b>${esc(it[(f.fields[0] || {}).key] || `#${i + 1}`)}</b><span><button type="button" class="slx-ib" data-move="${esc(f.key)}:${i}:-1" aria-label="${esc(t('Move up'))}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="slx-ib" data-move="${esc(f.key)}:${i}:1" aria-label="${esc(t('Move down'))}" ${i < arr.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="slx-ib" data-del="${esc(f.key)}:${i}" aria-label="${esc(t('Remove'))}">×</button></span></summary>
          ${f.fields.map(sf => field(sf, it[sf.key] == null ? '' : it[sf.key], `${f.key}.${i}.${sf.key}`)).join('')}</details>`).join('')}
          <button type="button" class="btn sm slx-add" data-add="${esc(f.key)}">+ ${t('Add')}</button></fieldset>`);
      } else parts.push(field(f, get(d, f.key) == null ? '' : get(d, f.key), f.key));
    }
    // colors: Easy shows the template's main ones, Comfortable and Pro show them all
    const cols = Object.keys(th.colors || {}).filter(k => lv !== 'easy' || (th.easy || ['accent']).includes(k));
    if (cols.length) parts.push(`<fieldset class="slx-cols"><legend>${t('Colors')}</legend>${cols.map(k => `<label><input type="color" data-color="${esc(k)}" value="${esc(th.colors[k].length === 4 ? '#' + th.colors[k].slice(1).split('').map(c => c + c).join('') : th.colors[k])}"><span>${esc(t(COLOR_NAMES[k] || k))}</span></label>`).join('')}</fieldset>`);
    if (lv !== 'easy') {
      if ((d.presets || []).length) parts.push(`<fieldset class="slx-looks"><legend>${t('Look')}</legend>${d.presets.map(p => `<button type="button" class="slx-look ${th.preset === p.id ? 'on' : ''}" data-preset="${esc(p.id)}" aria-pressed="${th.preset === p.id}"><span class="slx-sw">${['bg', 'ink', 'accent'].map(k => `<i style="background:${esc((p.colors || {})[k] || '#888')}"></i>`).join('')}</span>${esc(p.name)}</button>`).join('')}</fieldset>`);
      parts.push(`<fieldset class="slx-fonts"><legend>${t('Fonts')}</legend>${['display', 'body'].map(k => `<label class="slx-f"><span>${t(k === 'display' ? 'Headings' : 'Body text')}</span><select data-font="${k}">${FONTS.map(f => `<option ${((th.fonts || {})[k] === f) ? 'selected' : ''}>${f}</option>`).join('')}</select></label>`).join('')}</fieldset>`);
      if ((d.sections || []).length) parts.push(`<fieldset class="slx-secs"><legend>${t('Sections')}</legend>${d.sections.map((s, i) => `<div class="slx-sec"><label><input type="checkbox" data-sec="${i}" ${s.on === false ? '' : 'checked'}> ${esc(s.label || s.id)}</label><span><button type="button" class="slx-ib" data-secmove="${i}:-1" aria-label="${esc(t('Move up'))}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="slx-ib" data-secmove="${i}:1" aria-label="${esc(t('Move down'))}" ${i < d.sections.length - 1 ? '' : 'disabled'}>↓</button></span></div>`).join('')}</fieldset>`);
      parts.push(`<div class="slx-onpage"><p>${t('Want to change something the form doesn\'t cover? Pick it on the page: Flint and the property sheet edit it for free.')}</p><button type="button" class="btn sm" data-slx="onpage">${t('Edit on the page')}</button></div>`);
    }
    if (lv === 'pro') {
      const what = f => /site\.json$/.test(f) ? t('All the content and settings this form edits') : /site\.js$/.test(f) ? t('Fills the page from site.json (delete it to hand-edit the HTML only)') : /fonts\.css$/.test(f) ? t('The fonts, all open source') : /\.html$/.test(f) ? t('A page') : /\.css$/.test(f) ? t('The styles') : /\.js$/.test(f) ? t('A small script') : /\.svg$/.test(f) ? t('A placeholder picture') : '';
      parts.push(`<fieldset class="slx-code"><legend>${t('The code')}</legend><ul>${(st.files || []).filter(f => !/^img\/uploads\//.test(f)).slice(0, 30).map(f => `<li><code>${esc((st.dir ? st.dir + '/' : '') + f)}</code><small>${esc(what(f))}</small></li>`).join('')}</ul>
        <p class="slx-fine">${t('Plain HTML, CSS and a little JavaScript, no build step. Elements marked data-s get their words from site.json.')}</p><button type="button" class="btn sm" data-slx="code">${t('Open the code')}</button></fieldset>`);
    }
    const keep = box.scrollTop;
    box.innerHTML = parts.join('');
    box.scrollTop = keep;
    wire(box);
  }
  function wire(box) {
    const d = st.data;
    box.oninput = e => {
      const x = e.target;
      if (x.dataset.path) { set(d, x.dataset.path, x.value); if (/\.(\d+)\.[^.]+$/.test(x.dataset.path)) { const h = x.closest('.slx-item'); if (h && h.querySelector('.slx-f') && h.querySelector('.slx-f input, .slx-f textarea') === x) h.querySelector('.slx-item-h b').textContent = x.value || '…'; } push(); }
      else if (x.dataset.lines) { const arr = x.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [n, p, dd] = l.split(/\s+·\s+|\s+\|\s+/); return { n: n || '', p: p || '', d: dd || '' }; }); set(d, x.dataset.lines, arr); push(); }
      else if (x.dataset.color) { d.theme = d.theme || {}; d.theme.colors = d.theme.colors || {}; d.theme.colors[x.dataset.color] = x.value; push(); }
    };
    box.onchange = async e => {
      const x = e.target;
      if (x.dataset.font) { d.theme.fonts = d.theme.fonts || {}; d.theme.fonts[x.dataset.font] = x.value; push(); }
      if (x.dataset.sec != null && x.type === 'checkbox') { d.sections[+x.dataset.sec].on = x.checked; push(); }
      if (x.dataset.upload && x.files && x.files[0]) {
        const file = x.files[0]; if (file.size > 6 * 1024 * 1024) return toast(t('That picture is over 6 MB.'));
        const data = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(file); });
        try {
          const r = await C.api(`/projects/${encodeURIComponent(st.pid)}/site-data/image`, { method: 'POST', body: { dir: st.dir, name: file.name, data } });
          set(d, x.dataset.upload, r.path); push(); setTimeout(form, 50);
        } catch (err) { toast(err.message); }
      }
    };
    box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.closest('summary')) e.preventDefault();
      if (b.dataset.add) { const f = (d.form || []).find(y => y.key === b.dataset.add); const arr = Array.isArray(get(d, b.dataset.add)) ? get(d, b.dataset.add) : []; arr.push(JSON.parse(JSON.stringify((f && f.add) || {}))); set(d, b.dataset.add, arr); st.openItem = b.dataset.add + ':' + (arr.length - 1); push(); form(); }
      if (b.dataset.del) { const [k, i] = b.dataset.del.split(':'); const arr = get(d, k); arr.splice(+i, 1); push(); form(); }
      if (b.dataset.move) { const [k, i, by] = b.dataset.move.split(':'); const arr = get(d, k), j = +i + +by; if (j < 0 || j >= arr.length) return; [arr[+i], arr[j]] = [arr[j], arr[+i]]; push(); form(); }
      if (b.dataset.secmove) { const [i, by] = b.dataset.secmove.split(':').map(Number), j = i + by; if (j < 0 || j >= d.sections.length) return; [d.sections[i], d.sections[j]] = [d.sections[j], d.sections[i]]; push(); form(); }
      if (b.dataset.preset) { const p = d.presets.find(y => y.id === b.dataset.preset); if (!p) return; d.theme = Object.assign({}, d.theme, { preset: p.id, colors: Object.assign({}, p.colors), fonts: Object.assign({}, p.fonts) }); push(); form(); }
      if (b.dataset.slx === 'onpage') { const s = st; done(true).then(() => { const pv = document.querySelector('#pvw [data-act="edit"]'); setTimeout(() => { if (pv && pv.getAttribute('aria-pressed') !== 'true') pv.click(); }, 900); }); return s; }
      if (b.dataset.slx === 'code') { const s = st; done(true).then(() => { if (window.TribeApp && window.TribeApp.show) window.TribeApp.show('repo'); }); return s; }
    };
  }

  window.TribeSiteLib = { open, edit, close };
})();
