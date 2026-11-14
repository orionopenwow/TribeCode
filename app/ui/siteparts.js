// The website designer's element tools (feat/site-editor2). The designer (app/ui/sitedesigner.js) shows the selected
// thing; this file is what you can do with it when it is smaller than a section:
//   - the path of what is selected (Page › Section › Entry › Words), each step clickable; Esc walks it backwards
//   - one element's look: size, colour from the site's own palette, alignment, bold, and which screen sizes show it
//   - the entries of any list (plans, links, questions, features of a plan…): move, duplicate, add, remove, from the
//     small toolbar on the page, the panel, the right-click menu or the keyboard
//   - a section's width, entrance and screen sizes; a picture's fill, focus and removal
//   - the pages of the site: rename, reorder, remove, and each page's own title and description for search
//   - the right-click menu, built from the same actions
// Every change is one commit in the designer, so it is one Undo. window.TribeSiteParts.
(function () {
  'use strict';
  const S = () => window.TribeSiteCfg;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > (n || 28) ? t.slice(0, (n || 28) - 1) + '…' : t; };
  const blockOf = (api, id) => api.pageNow().blocks.find(b => b.id === id);
  const label = b => S().BLOCKS[b.type].label.replace(/ \(.*/, '');
  const DEV = [['desktop', 'Computer'], ['tablet', 'Tablet'], ['phone', 'Phone']];
  const LIST_NAMES = { items: 'Entry', plans: 'Plan', features: 'Line', buttons: 'Button', links: 'Link', socials: 'Social link' };

  // ---------- where the selection sits ----------
  const trimPath = p => String(p || '').replace(/\.$/, '');
  // the innermost list entry the selection belongs to: { list, i, item } or null
  function entryOf(sel) { if (!sel || sel.kind === 'block' || sel.block === '@') return null; const ls = S().listsOf(sel.path); return ls.length ? ls[ls.length - 1] : null; }
  // what holds the selection: the entry, then the entry around it, then the section, then nothing
  function parentOf(sel) {
    if (!sel || sel.kind === 'block' || sel.block === '@') return null;
    const own = trimPath(sel.path), up = S().listsOf(sel.path).map(l => l.item).filter(it => it !== own || sel.kind === 'image');   // words or a button that are the entry itself step past it
    const it = up[up.length - 1];
    if (it) return { block: sel.block, path: it, kind: 'item' };
    return { block: sel.block, path: '', kind: 'block' };
  }
  const stylePath = sel => sel.kind === 'image' ? sel.path + 'img' : sel.kind === 'text' || sel.kind === 'button' ? trimPath(sel.path) : '';
  const esOf = (b, sel) => { const p = stylePath(sel); return (p && b.es && b.es[p]) || {}; };
  function wordsOf(b, sel) { const v = S().getAt(b.props, sel.kind === 'button' ? sel.path + '.label' : trimPath(sel.path)); if (typeof v === 'string') return v; if (v && typeof v === 'object') { const f = Object.values(v).find(x => typeof x === 'string' && x && !/^data:/.test(x)); return f || ''; } return ''; }
  const KIND = { text: 'Words', button: 'Button', image: 'Picture', icon: 'Icon', field: 'Box to type in', item: 'Entry' };
  function crumbs(b, sel, api) {
    const out = [`<button type="button" data-sp="crumb" data-kind="">${esc(short(api.pageNow().title, 16))}</button>`, `<button type="button" data-sp="crumb" data-kind="block"${sel.kind === 'block' ? ' aria-current="true"' : ''}>${esc(label(b))}</button>`];
    if (sel.kind !== 'block') {
      const own = trimPath(sel.path);
      S().listsOf(sel.path).forEach(l => { const here = sel.kind === 'item' && l.item === own; const nm = LIST_NAMES[l.list.split('.').pop()] || 'Entry'; out.push(`<button type="button" data-sp="crumb" data-kind="item" data-path="${esc(l.item)}"${here ? ' aria-current="true"' : ''}>${esc(nm)} ${l.i + 1}</button>`); });
      if (sel.kind !== 'item') out.push(`<button type="button" aria-current="true" disabled>${esc(KIND[sel.kind] || 'This')}</button>`);
    }
    return `<nav class="sp-crumbs" aria-label="What is selected">${out.join('<span aria-hidden="true">›</span>')}</nav>`;
  }

  // ---------- one element's look ----------
  const P = (k, v, l, cur, extra) => `<button type="button" class="btn sm" data-sp="es" data-k="${k}" data-val="${v}" aria-pressed="${(cur || '') === v}"${extra || ''}>${l}</button>`;
  function looks(b, sel, api) {
    const e = esOf(b, sel), hide = String(e.hide || '').split(',').filter(Boolean), k = S().colors(api.cfg()), en = entryOf(sel);
    const sw = (v, col, l) => `<button type="button" class="btn sm sp-col" data-sp="es" data-k="col" data-val="${v}" aria-pressed="${(e.col || '') === v}"><i style="background:${col}"></i>${l}</button>`;
    return `<div class="sp-looks">
      <p class="wdz-f"><span>Size</span></p><p class="wdz-row" role="group" aria-label="Size">${P('sz', 's', 'Small', e.sz)}${P('sz', '', 'Normal', e.sz)}${P('sz', 'l', 'Large', e.sz)}${P('sz', 'xl', 'Huge', e.sz)}</p>
      <p class="wdz-f"><span>Colour</span></p><p class="wdz-row" role="group" aria-label="Colour">${P('col', '', 'As it is', e.col)}${sw('accent', k.accent, 'Main colour')}${sw('muted', k.muted, 'Quiet')}${sw('ink', k.ink, 'Strong')}</p>
      <p class="wdz-row"><label class="sp-pick"><span>Any colour</span><input type="color" data-escolor="1" value="${esc(e.c || k.accent)}" aria-label="Any colour"></label>${e.c ? '<button type="button" class="btn sm ghost" data-sp="es" data-k="c" data-val="">Back to the palette</button>' : ''}</p>
      <p class="wdz-f"><span>Space around it</span></p><p class="wdz-row" role="group" aria-label="Space around it">${P('sp', 's', 'Tight', e.sp)}${P('sp', '', 'Normal', e.sp)}${P('sp', 'l', 'Roomy', e.sp)}</p>
      <p class="wdz-f"><span>Font</span></p><p class="wdz-row" role="group" aria-label="Font">${P('f', '', 'As it is', e.f)}${P('f', 'display', 'Heading font', e.f)}${P('f', 'body', 'Text font', e.f)}${P('f', 'mono', 'Typewriter', e.f)}</p>
      <p class="wdz-f"><span>Line up</span></p><p class="wdz-row" role="group" aria-label="Line up">${P('al', '', 'As it is', e.al)}${P('al', 'left', 'Left', e.al)}${P('al', 'center', 'Middle', e.al)}${P('al', 'right', 'Right', e.al)}<button type="button" class="btn sm" data-sp="es" data-k="b" data-val="1" aria-pressed="${!!e.b}">Bold</button><button type="button" class="btn sm" data-sp="es" data-k="i" data-val="1" aria-pressed="${!!e.i}">Slanted</button></p>
      ${showOn(hide, 'el')}${en ? entryRow(b, en) : ''}${foot()}</div>`;
  }
  const showOn = (hide, scope) => `<p class="wdz-f"><span>Show it on</span></p><p class="wdz-row" role="group" aria-label="Show it on">${DEV.map(([d, l]) => `<button type="button" class="btn sm" data-sp="show" data-scope="${scope}" data-val="${d}" aria-pressed="${!hide.includes(d)}">${l}</button>`).join('')}</p>`;
  function entryRow(b, en) {
    const arr = S().getAt(b.props, en.list) || [], nm = LIST_NAMES[en.list.split('.').pop()] || 'Entry';
    return `<p class="wdz-f"><span>${esc(nm)} ${en.i + 1} of ${arr.length}</span></p><p class="wdz-row" role="group" aria-label="This entry"><button type="button" class="btn sm" data-sp="entry" data-val="up"${en.i ? '' : ' disabled'}>Move up</button><button type="button" class="btn sm" data-sp="entry" data-val="down"${en.i < arr.length - 1 ? '' : ' disabled'}>Move down</button><button type="button" class="btn sm" data-sp="entry" data-val="dup">Duplicate</button><button type="button" class="btn sm" data-sp="entry" data-val="add">Add another</button><button type="button" class="btn sm ghost" data-sp="entry" data-val="del">Remove</button></p>`;
  }
  const foot = () => `<p class="wdz-row"><button type="button" class="btn sm" data-sp="flint">Ask Flint about this</button><button type="button" class="btn sm ghost" data-sp="comment">Comment here</button></p><div class="sp-said" id="wdz-said"></div>`;

  // the panel for words, an entry, an icon or a box to type in
  function element(box, b, api) {
    const sel = api.sel(), en = entryOf(sel);
    if (sel.kind === 'text') {
      const v = wordsOf(b, sel);
      box.innerHTML = `${crumbs(b, sel, api)}<p class="wdz-eyebrow">Words</p><label class="wdz-f"><span class="sr">The words</span><textarea class="input" rows="${v.length > 60 ? 3 : 2}" data-etext="1" aria-label="The words">${esc(v)}</textarea></label><p class="wdz-hint">Type here or right on the page. Enter on the page finishes; Shift Enter starts a new line.</p>${looks(b, sel, api)}`;
      const ta = box.querySelector('[data-etext]'); ta.addEventListener('change', () => api.commit(S().setProp(api.cfg(), api.page(), b.id, trimPath(sel.path), ta.value.trim())));
    } else if (sel.kind === 'item') {
      const arr = S().getAt(b.props, en.list) || [], it = arr[en.i], nm = LIST_NAMES[en.list.split('.').pop()] || 'Entry';
      const fields = it && typeof it === 'object' ? Object.entries(it).filter(([k, x]) => typeof x === 'string' && !/^(img|alt|shape|icon|fit|pos)$/.test(k)) : [];
      box.innerHTML = `${crumbs(b, sel, api)}<p class="wdz-eyebrow">${esc(nm)} ${en.i + 1}</p>${typeof it === 'string' ? `<label class="wdz-f"><span class="sr">The words</span><input class="input" data-efield="" value="${esc(it)}" aria-label="The words"></label>` : fields.map(([k, x]) => `<label class="wdz-f"><span>${esc(FIELD[k] || k)}</span>${x.length > 60 ? `<textarea class="input" rows="3" data-efield="${esc(k)}">${esc(x)}</textarea>` : `<input class="input" data-efield="${esc(k)}" value="${esc(x)}">`}</label>`).join('')}${it && typeof it === 'object' && 'hot' in it ? `<p class="wdz-row"><button type="button" class="btn sm" data-sp="hot" aria-pressed="${!!it.hot}">Stands out</button></p>` : ''}${entryRow(b, en)}${foot()}`;
      box.querySelectorAll('[data-efield]').forEach(i => i.addEventListener('change', () => api.commit(S().setProp(api.cfg(), api.page(), b.id, en.item + (i.dataset.efield ? '.' + i.dataset.efield : ''), i.value))));
    } else if (sel.kind === 'icon') {
      box.innerHTML = `${crumbs(b, sel, api)}<p class="wdz-eyebrow">Icon</p><p class="wdz-row"><button type="button" class="btn sm primary" data-sp="swap">Swap the icon</button></p>${en ? entryRow(b, en) : ''}${foot()}`;
    } else {
      const v = S().getAt(b.props, trimPath(sel.path)) || '';
      box.innerHTML = `${crumbs(b, sel, api)}<p class="wdz-eyebrow">Box to type in</p><label class="wdz-f"><span>The grey hint inside it</span><input class="input" data-ephold="1" value="${esc(v)}" placeholder="you@example.com"></label><p class="wdz-hint">Visitors type here. The form’s link is in the section’s settings: press Esc.</p>${foot()}`;
      const i = box.querySelector('[data-ephold]'); i.addEventListener('change', () => api.commit(S().setProp(api.cfg(), api.page(), b.id, trimPath(sel.path), i.value.trim())));
    }
    said(api);
  }
  const FIELD = { q: 'Question', a: 'Answer', title: 'Title', text: 'Text', name: 'Name', role: 'Role', quote: 'What they said', label: 'Label', note: 'Small note', meta: 'On the right', value: 'Number', when: 'When', price: 'Price', per: 'Per', caption: 'Caption', tag: 'Tag' };

  // a list in a section's settings: every entry by name, with its own move, copy and remove
  function list(b, k, v) {
    const nm = LIST_NAMES[k] || 'Entry', name = x => typeof x === 'string' ? x : x && typeof x === 'object' ? (x.label || x.title || x.name || x.q || x.quote || x.value || x.alt || x.caption || '') : '';
    return `<div class="sp-list" data-list="${esc(k)}"><p class="wdz-f"><span>${esc(k)} · ${v.length}</span></p>${v.map((x, i) => `<div class="sp-li"><button type="button" class="sp-li-t" data-sp="pickentry" data-list="${esc(k)}" data-i="${i}" title="Select it on the page">${esc(short(name(x), 30) || `${nm} ${i + 1}`)}</button><span class="sp-li-a"><button type="button" data-sp="entry" data-val="up" data-list="${esc(k)}" data-i="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button type="button" data-sp="entry" data-val="down" data-list="${esc(k)}" data-i="${i}" aria-label="Move down"${i < v.length - 1 ? '' : ' disabled'}>↓</button><button type="button" data-sp="entry" data-val="dup" data-list="${esc(k)}" data-i="${i}" aria-label="Duplicate">⧉</button><button type="button" data-sp="entry" data-val="del" data-list="${esc(k)}" data-i="${i}" aria-label="Remove">×</button></span></div>`).join('')}<p class="wdz-row"><button type="button" class="btn sm" data-item="add" data-k="${esc(k)}">+ Add ${esc(nm.toLowerCase())}</button></p></div>`;
  }
  // a section can go to another page (it lands above that page's footer)
  let _cfgNow = null, _pageNow = null;
  const pagesOther = b => { const c = _cfgNow; if (!c || c.pages.length < 2 || b.type === 'footer') return ''; return `<label class="wdz-f"><span>Move it to another page</span><select class="input" data-sp-moveto="${esc(b.id)}"><option value="">Stays on this page</option>${c.pages.filter(p => p.id !== _pageNow).map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select></label>`; };
  document.addEventListener('change', e => { const i = e.target; if (!i || !i.matches || !i.matches('[data-sp-moveto]') || !i.value) return; const api = window.TribeSiteParts && window.TribeSiteParts._api; if (!api) return; const to = i.value, pg = api.cfg().pages.find(p => p.id === to); const c = S().moveBlockToPage(api.cfg(), api.page(), i.dataset.spMoveto, to); api.setSel(null); api.commit(c); api.say(`Moved the section to ${pg ? pg.title : 'the other page'}. Undo brings it back.`, '', [{ label: 'Undo', fn: () => api.undo() }]); });
  // a section's own look beyond background and spacing
  function section(b, api) { if (api) { _cfgNow = api.cfg(); _pageNow = api.page(); window.TribeSiteParts && (window.TribeSiteParts._api = api); }
    const st = b.style || {}, hide = String(st.hide || '').split(',').filter(Boolean), B = (k, v, l) => `<button type="button" class="btn sm" data-sp="sty" data-k="${k}" data-val="${v}" aria-pressed="${(st[k] || '') === v}">${l}</button>`;
    return `<p class="wdz-f"><span>Text size</span></p><p class="wdz-row" role="group" aria-label="Text size">${B('sz', 's', 'Small')}${B('sz', '', 'Normal')}${B('sz', 'l', 'Large')}</p>
      <p class="wdz-f"><span>Line up</span></p><p class="wdz-row" role="group" aria-label="Line up">${B('al', '', 'As it is')}${B('al', 'left', 'Left')}${B('al', 'center', 'Middle')}${B('al', 'right', 'Right')}</p>
      <p class="wdz-f"><span>Width</span></p><p class="wdz-row" role="group" aria-label="Width">${B('w', 'narrow', 'Narrow')}${B('w', '', 'Normal')}${B('w', 'wide', 'Wide')}</p>
      <p class="wdz-f"><span>When it scrolls into view</span></p><p class="wdz-row" role="group" aria-label="When it scrolls into view">${B('anim', '', 'Just there')}${B('anim', 'fade', 'Fades in')}${B('anim', 'rise', 'Rises in')}${st.anim ? '<button type="button" class="btn sm ghost" data-sp="play">Play it</button>' : ''}</p>
      ${pagesOther(b)}
      ${showOn(hide, 'block')}<div class="sp-said" id="wdz-said"></div>`;
  }
  function picture(b, sel, api) {
    const fit = S().getAt(b.props, sel.path + 'fit') || '', pos = S().getAt(b.props, sel.path + 'pos') || '', e = esOf(b, sel), hide = String(e.hide || '').split(',').filter(Boolean), en = entryOf(sel), has = !!S().getAt(b.props, sel.path + 'img');
    const B = (k, v, l, cur) => `<button type="button" class="btn sm" data-sp="pic" data-k="${k}" data-val="${v}" aria-pressed="${cur === v}">${l}</button>`;
    return `<p class="wdz-f"><span>In its frame</span></p><p class="wdz-row" role="group" aria-label="In its frame">${B('fit', '', 'Fill the frame', fit)}${B('fit', 'contain', 'Show all of it', fit)}</p>
      <p class="wdz-f"><span>Keep in view</span></p><p class="wdz-row" role="group" aria-label="Keep in view">${B('pos', 'top', 'Top', pos)}${B('pos', '', 'Middle', pos)}${B('pos', 'bottom', 'Bottom', pos)}${B('pos', 'left', 'Left', pos)}${B('pos', 'right', 'Right', pos)}</p>
      ${has ? '<p class="wdz-row"><button type="button" class="btn sm ghost" data-sp="clearpic">Take the picture out</button></p>' : ''}${showOn(hide, 'el')}${en ? entryRow(b, en) : ''}${foot()}`;
  }

  // ---------- words that belong to the site: its name, a page's name, the logo ----------
  function siteSel(box, api) {
    const sel = api.sel(), c = api.cfg(), m = /^pages\.(\d+)\.title$/.exec(sel.path), pg = m && c.pages[+m[1]];
    if (sel.kind === 'image') { box.innerHTML = `<p class="wdz-eyebrow">Logo</p><img class="wdz-thumb" src="${esc(c.logo || '')}" alt=""><p class="wdz-row"><button type="button" class="btn sm primary" data-site="logo">Change</button><button type="button" class="btn sm ghost" data-site="nologo">Remove</button></p><p class="wdz-hint">The logo sits in the menu on every page and is the tab icon too.</p>`; return; }
    if (pg) {
      box.innerHTML = `<p class="wdz-eyebrow">Page in the menu</p><label class="wdz-f"><span>Name</span><input class="input" data-pgname="${esc(pg.id)}" maxlength="40" value="${esc(pg.title)}"></label><p class="wdz-hint">Double-click the name in the menu to type it there.</p><p class="wdz-row"><button type="button" class="btn sm" data-sp="gopage" data-id="${esc(pg.id)}">Open this page</button><button type="button" class="btn sm" data-sp="panel" data-val="site">All pages</button></p>`;
      const i = box.querySelector('[data-pgname]'); i.addEventListener('change', () => i.value.trim() && api.commit(S().renamePage(api.cfg(), pg.id, i.value.trim())));
      return;
    }
    box.innerHTML = `<p class="wdz-eyebrow">Site name</p><label class="wdz-f"><span class="sr">Site name</span><input class="input" data-sitename="1" maxlength="80" value="${esc(c.name)}" aria-label="Site name"></label><p class="wdz-hint">It shows in the menu on every page and in the browser tab.</p><p class="wdz-row"><button type="button" class="btn sm" data-sp="panel" data-val="site">Site settings</button></p>`;
    const i = box.querySelector('[data-sitename]'); i.addEventListener('change', () => i.value.trim() && api.commit({ ...api.cfg(), name: i.value.trim().slice(0, 80) }));
  }

  // ---------- pages (in Site settings) ----------
  function pages(api) {
    const c = api.cfg(), cur = api.page();
    return `<div class="sp-pages"><p class="wdz-f"><span>Pages · ${c.pages.length}</span></p>${c.pages.map((p, i) => `<div class="sp-li${p.id === cur ? ' is-cur' : ''}"><input class="input sm" data-pgname="${esc(p.id)}" maxlength="40" value="${esc(p.title)}" aria-label="Page name"><span class="sp-li-a"><button type="button" data-sp="gopage" data-id="${esc(p.id)}" aria-label="Open this page" title="Open this page">→</button><button type="button" data-sp="pgmove" data-val="up" data-id="${esc(p.id)}" aria-label="Move up"${i > 1 ? '' : ' disabled'}>↑</button><button type="button" data-sp="pgmove" data-val="down" data-id="${esc(p.id)}" aria-label="Move down"${i > 0 && i < c.pages.length - 1 ? '' : ' disabled'}>↓</button><button type="button" data-sp="pgdel" data-id="${esc(p.id)}" aria-label="Remove this page"${i ? '' : ' disabled title="The first page is the home page"'}>×</button></span></div>`).join('')}
      <p class="wdz-row"><button type="button" class="btn sm" data-wdz="addpage">+ Add a page</button><button type="button" class="btn sm" data-sp="nav" data-val="${c.nav === 'centered' ? '' : 'centered'}" aria-pressed="${c.nav === 'centered'}">Menu in the middle</button></p>
      ${c.pages.length > 1 ? (() => { const p = c.pages.find(x => x.id === cur) || c.pages[0], ps = p.seo || {}; return `<p class="wdz-f"><span>“${esc(short(p.title, 20))}” in search results</span></p><label class="wdz-f"><span class="sr">Title of this page</span><input class="input" data-pgseo="title" maxlength="120" value="${esc(ps.title || '')}" placeholder="${esc(p.title)} · ${esc(c.seo.title || c.name)}" aria-label="Title of this page"></label><label class="wdz-f"><span class="sr">Description of this page</span><textarea class="input" rows="2" data-pgseo="description" maxlength="320" placeholder="What this page is about, in a sentence" aria-label="Description of this page">${esc(ps.description || '')}</textarea></label><p class="wdz-row"><span class="wdz-lab">Share picture for this page</span>${ps.image ? `<img class="wdz-mini wide" src="${esc(ps.image)}" alt="">` : ''}<button type="button" class="btn sm" data-site="pageshare">${ps.image ? 'Change' : 'Add'}</button></p>`; })() : ''}</div>`;
  }
  function wire(box, api) {
    box.querySelectorAll('[data-pgname]').forEach(i => i.addEventListener('change', () => i.value.trim() && api.commit(S().renamePage(api.cfg(), i.dataset.pgname, i.value.trim()))));
    box.querySelectorAll('[data-pgseo]').forEach(i => i.addEventListener('change', () => api.commit(S().setPageSeo(api.cfg(), api.page(), { [i.dataset.pgseo]: i.value.trim() }))));
  }

  // ---------- doing things ----------
  const CYCLE = { sz: ['s', '', 'l', 'xl'], col: ['', 'accent', 'muted', 'ink'], al: ['', 'center', 'right', 'left'] };
  function setEs(api, patch) { const sel = api.sel(), p = stylePath(sel); if (!p || sel.block === '@') return; api.commit(S().setElStyle(api.cfg(), api.page(), sel.block, p, patch)); }
  function step(api, k, dir) { const b = blockOf(api, api.sel().block); if (!b) return; const cur = esOf(b, api.sel())[k] || '', l = CYCLE[k], i = l.indexOf(cur); const next = dir ? l[Math.max(0, Math.min(l.length - 1, i + dir))] : l[(i + 1) % l.length]; if (next === cur) return api.say(dir > 0 ? 'That is as big as it goes.' : 'That is as small as it goes.'); setEs(api, { [k]: next }); }
  function entry(api, op, at) {
    const sel = api.sel(), en = at || entryOf(sel); if (!en) return false;
    const r = S().itemOp(api.cfg(), api.page(), sel.block, en.list, en.i, op);
    if (r.i < 0) { api.say(r.why === 'last' ? 'A list keeps at least one entry. Remove the whole section instead, or hide it.' : r.why === 'full' ? 'That list is full (24 entries).' : 'That entry is not there any more.'); return true; }
    const item = `${en.list}.${r.i}`;
    if (op === 'del') api.setSel({ block: sel.block, path: '', kind: 'block' });
    else if (op === 'add' || op === 'dup' || at) api.setSel({ block: sel.block, path: item, kind: 'item' });
    else { const own = trimPath(sel.path), rest = own.slice(en.item.length); api.setSel({ block: sel.block, path: item + rest + (/\.$/.test(sel.path) ? '.' : ''), kind: sel.kind }); }
    api.commit(r.cfg); api.postSel(true); return true;
  }
  function showToggle(api, scope, dev) {
    const sel = api.sel(), b = blockOf(api, sel.block); if (!b) return;
    const cur = String(scope === 'block' ? (b.style || {}).hide || '' : esOf(b, sel).hide || '').split(',').filter(Boolean), next = cur.includes(dev) ? cur.filter(d => d !== dev) : [...cur, dev];
    if (next.length >= 3) return api.say('It has to show somewhere. To take it off the site everywhere, hide the section or remove it.');
    if (scope === 'block') api.commit(S().setStyle(api.cfg(), api.page(), b.id, { hide: next.join(',') })); else setEs(api, { hide: next.join(',') });
  }
  function askFlint(api) {
    const sel = api.sel(), b = sel && blockOf(api, sel.block); if (!b) return;
    const w = short(wordsOf(b, sel), 40);
    api.say(w ? `About “${w}”: say what to change. “make this bigger”, “change this to …”, “hide this on phones”, “move this up”.` : 'Say what to change about it: “make this bigger”, “hide this on phones”, “move this up”, “remove this”.');
    api.fillFlint(sel.kind === 'text' || sel.kind === 'button' ? 'Change this to ' : 'Make this ');
  }
  function act(api, a) {
    const sel = api.sel(); if (!sel) return;
    if (a === 'smaller') return step(api, 'sz', -1);
    if (a === 'bigger') return step(api, 'sz', 1);
    if (a === 'bold') { const b = blockOf(api, sel.block); return b && setEs(api, { b: esOf(b, sel).b ? '' : 1 }); }
    if (a === 'ital') { const b = blockOf(api, sel.block); return b && setEs(api, { i: esOf(b, sel).i ? '' : 1 }); }
    if (a === 'wlink-none') return api.say('Select some of the words with the mouse first, then press the link button. To link a whole button, click the button.');
    if (a === 'wlink') {   // some words were just wrapped on the page: ask where they go, right in the panel
      api.panel('edit'); const box = api.box(); if (!box) return;
      box.insertAdjacentHTML('afterbegin', `<form class="sp-wlink" id="sp-wlink"><label class="wdz-f"><span>Link the selected words to</span><input class="input" id="sp-wlink-to" placeholder="https://… or an email address" autocomplete="off"></label><p class="wdz-row"><button type="submit" class="btn sm primary">Link</button><button type="button" class="btn sm ghost" data-sp="wlink-cancel">Cancel</button></p></form>`);
      const f = box.querySelector('#sp-wlink'), i = f.querySelector('input'); i.focus();
      f.addEventListener('submit', e => { e.preventDefault(); let v = i.value.trim(); if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) v = 'mailto:' + v; else if (v && !/^(https?:\/\/|mailto:|#|\/)/i.test(v)) v = 'https://' + v; f.remove(); api.post({ linkset: /^javascript:/i.test(v) ? '' : v }); });
      return;
    }
    if (a === 'color') return step(api, 'col');
    if (a === 'align') return step(api, 'al');
    if (a === 'link') { api.setSel({ ...sel, kind: 'button' }); api.panel('edit'); const i = api.root().querySelector('#wdz-link'); if (i) i.focus(); return; }
    if (/^(up|down|dup|add|del)$/.test(a)) return entry(api, a);
    if (a === 'flint') return askFlint(api);
    if (a === 'replace') return sel.block === '@' ? api.root().querySelector('[data-site="logo"]') && api.root().querySelector('[data-site="logo"]').click() : api.pickFile();
    if (a === 'fit') { const b = blockOf(api, sel.block); return b && api.commit(S().setProp(api.cfg(), api.page(), sel.block, sel.path + 'fit', S().getAt(b.props, sel.path + 'fit') === 'contain' ? '' : 'contain')); }
    if (a === 'swap') return api.iconPicker(`${sel.block}|${sel.path}`);
    if (a === 'words') { api.panel('edit'); const i = api.root().querySelector('[data-ephold],[data-etext],[data-sitename],[data-pgname]'); if (i) { i.focus(); i.select && i.select(); } return; }
    if (a === 'type') return api.post({ type: `${sel.block}|${sel.kind === 'button' ? sel.path + '.label' : trimPath(sel.path)}` });
    if (a === 'comment') return api.comment();
    if (a === 'section') { api.setSel({ block: sel.block, path: '', kind: 'block' }); api.panel('edit'); return api.postSel(false); }
    if (a === 'hidephone') return showToggle(api, sel.kind === 'block' ? 'block' : 'el', 'phone');
    if (a === 'clearpic') return api.commit(S().setImage(api.cfg(), api.page(), sel.block, sel.path, '', S().getAt(blockOf(api, sel.block).props, sel.path + 'alt') || ''));
  }
  function click(el, api) {
    const k = el.dataset.sp, v = el.dataset.val, sel = api.sel();
    if (k === 'menu') { closeMenu(); if (/^blk-/.test(v)) { const b = sel && blockOf(api, sel.block); if (!b) return; const c = api.cfg(), pg = api.page(); if (v === 'blk-up' || v === 'blk-down') return api.commit(S().moveBlock(c, pg, b.id, v.slice(4))); if (v === 'blk-dup') { const r = S().duplicateBlock(c, pg, b.id); api.setSel({ block: r.block.id, path: '', kind: 'block' }); return api.commit(r.cfg); } if (v === 'blk-hide') return api.commit(S().setHidden(c, pg, b.id, !b.hidden)); if (v === 'blk-del') { api.setSel(null); return api.commit(S().removeBlock(c, pg, b.id)); } } return act(api, v); }
    if (k === 'es') { const b = sel && blockOf(api, sel.block); if (!b) return; const cur = esOf(b, sel)[el.dataset.k]; return setEs(api, { [el.dataset.k]: /^(b|i)$/.test(el.dataset.k) ? (cur ? '' : 1) : v }); }
    if (k === 'show') return showToggle(api, el.dataset.scope, v);
    if (k === 'entry') return entry(api, v, el.dataset.list ? { list: el.dataset.list, i: +el.dataset.i, item: `${el.dataset.list}.${el.dataset.i}` } : null);
    if (k === 'pickentry') { api.setSel({ block: sel.block, path: `${el.dataset.list}.${el.dataset.i}`, kind: 'item' }); api.panel('edit'); return api.postSel(true); }
    if (k === 'crumb') { const kind = el.dataset.kind; api.setSel(!kind ? null : kind === 'block' ? { block: sel.block, path: '', kind: 'block' } : { block: sel.block, path: el.dataset.path, kind: 'item' }); api.panel('edit'); return api.postSel(true); }
    if (k === 'sty') return api.commit(S().setStyle(api.cfg(), api.page(), sel.block, { [el.dataset.k]: v }));
    if (k === 'pic') return api.commit(S().setProp(api.cfg(), api.page(), sel.block, sel.path + el.dataset.k, v));
    if (k === 'hot') { const en = entryOf(sel), b = blockOf(api, sel.block); return api.commit(S().setProp(api.cfg(), api.page(), sel.block, en.item + '.hot', !S().getAt(b.props, en.item + '.hot'))); }
    if (k === 'gopage') { api.setPage(el.dataset.id); return api.paint(); }
    if (k === 'pgmove') return api.commit(S().movePage(api.cfg(), el.dataset.id, v));
    if (k === 'pgdel') { const c = S().deletePage(api.cfg(), el.dataset.id); if (!c) return; const pg = api.cfg().pages.find(p => p.id === el.dataset.id); api.commit(c); return api.say(`Removed the page ${pg ? pg.title : ''}. Undo brings it back.`, '', [{ label: 'Undo', fn: () => api.undo() }]); }
    if (k === 'nav') { const c = JSON.parse(JSON.stringify(api.cfg())); if (v) c.nav = v; else delete c.nav; return api.commit(c); }
    if (k === 'panel') return api.panel(v);
    if (k === 'play') { const b = sel && blockOf(api, sel.block); return b && api.post({ play: b.id, anim: (b.style || {}).anim }); }
    if (k === 'wlink-cancel') { const f = api.root().querySelector('#sp-wlink'); if (f) f.remove(); return api.post({ linkset: '' }); }
    return act(api, k);
  }
  // keys for something smaller than a section. -> true when the key was used
  function key(e, api) {
    const sel = api.sel(), en = entryOf(sel), mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) { e.preventDefault(); if (sel.kind === 'image' && !en) { act(api, 'clearpic'); return true; } if (en) return entry(api, 'del'); return true; }
    if (mod && e.key.toLowerCase() === 'd' && en) { e.preventDefault(); return entry(api, 'dup'); }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && en) { e.preventDefault(); return entry(api, e.key === 'ArrowUp' ? 'up' : 'down'); }
    return false;
  }

  // ---------- the right-click menu ----------
  let menuEl = null;
  function closeMenu() { if (!menuEl || menuEl.hidden) return false; menuEl.hidden = true; return true; }
  function menu(api, x, y) {
    const sel = api.sel(), b = sel && blockOf(api, sel.block); if (!sel) return;
    const M = (v, l, hint) => `<button type="button" role="menuitem" data-sp="menu" data-val="${v}">${esc(l)}${hint ? `<kbd>${esc(hint)}</kbd>` : ''}</button>`, sep = '<hr>';
    let h = '';
    if (sel.block === '@') h = M('words', 'Edit the words', 'Enter') + (sel.kind === 'image' ? M('replace', 'Change the logo') : '');
    else if (b) {
      const en = entryOf(sel), e = esOf(b, sel), offPhone = String(sel.kind === 'block' ? (b.style || {}).hide || '' : e.hide || '').split(',').includes('phone');
      if (sel.kind === 'text' || sel.kind === 'button') h += M('type', 'Edit the words', 'Enter') + (sel.kind === 'button' ? M('link', 'Where it goes') : '') + M('bigger', 'Bigger') + M('smaller', 'Smaller') + M('bold', e.b ? 'Not bold' : 'Bold') + M('color', 'Next colour') + M('align', 'Line up differently');
      if (sel.kind === 'image') h += M('replace', 'Replace the picture', 'Enter') + M('fit', S().getAt(b.props, sel.path + 'fit') === 'contain' ? 'Fill the frame' : 'Show all of it') + (S().getAt(b.props, sel.path + 'img') ? M('clearpic', 'Take the picture out', en ? '' : 'Del') : '');
      if (sel.kind === 'icon') h += M('swap', 'Swap the icon');
      if (sel.kind === 'field') h += M('words', 'Change the grey hint');
      if (en) h += sep + M('up', 'Move up', 'Alt ↑') + M('down', 'Move down', 'Alt ↓') + M('dup', 'Duplicate', 'Ctrl D') + M('add', 'Add another') + M('del', 'Remove', 'Del');
      if (sel.kind === 'block') h += M('blk-up', 'Move up', 'Alt ↑') + M('blk-down', 'Move down', 'Alt ↓') + M('blk-dup', 'Duplicate', 'Ctrl D') + M('blk-hide', b.hidden ? 'Show on the site' : 'Hide from the site', 'H') + M('blk-del', 'Remove', 'Del');
      if (stylePath(sel) || sel.kind === 'block') h += sep + M('hidephone', offPhone ? 'Show on phones' : 'Hide on phones');
      h += sep + M('flint', 'Ask Flint about this') + M('comment', 'Comment here', 'C') + (sel.kind !== 'block' ? M('section', 'Select the section', 'Esc') : '');
    }
    if (!h) return;
    if (!menuEl) { menuEl = document.createElement('div'); menuEl.className = 'sp-menu'; menuEl.setAttribute('role', 'menu'); menuEl.setAttribute('aria-label', 'What you can do with it'); api.root().appendChild(menuEl); document.addEventListener('pointerdown', e => { if (menuEl && !menuEl.hidden && !menuEl.contains(e.target)) menuEl.hidden = true; }, true); }
    menuEl.innerHTML = h; menuEl.hidden = false;
    const w = menuEl.offsetWidth, hh = menuEl.offsetHeight;
    menuEl.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; menuEl.style.top = Math.max(8, Math.min(y, innerHeight - hh - 8)) + 'px';
    const f = menuEl.querySelector('button'); if (f) f.focus({ preventScroll: true });
    menuEl.onkeydown = e => { const bs = [...menuEl.querySelectorAll('button')], i = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); } };
  }
  // from the page: the toolbar, the right-click, a system note that was clicked
  function frame(d, api, rect) {
    if (d.t === 'menu') return menu(api, rect.left + d.x, rect.top + d.y);
    if (d.t === 'tb') return act(api, d.act);
    if (d.t === 'sys') {
      if (d.what === 'credit') return api.say('That line credits the designer of this template. Its licence asks for it to stay, so it cannot be edited or removed here.');
      api.setSel({ block: d.block, path: '', kind: 'block' }); api.panel('edit'); api.postSel(false);
      const i = api.root().querySelector('#wdz-insp [data-prop="email"], #wdz-insp [data-prop="action"]'); if (i) i.focus();
      return api.say(d.what === 'signup' ? 'That note is only for you: the signup box needs a link before it can collect emails. Paste one under “Form link” (Buttondown, Mailchimp, a Google Form). The note goes away once it is set.' : 'That note is only for you: the form needs an email address or a form link before it can send anything. Fill in either on the right. The note goes away once it is set.');
    }
  }
  // "What the tribe said about this" is filled by the suggestions (app/ui/sitesuggest.js) when it is there
  // the colour picker under "Colour": any colour for this one element (a change event, so one Undo per pick)
  document.addEventListener('change', e => { const i = e.target; if (!i || !i.matches || !i.matches('[data-escolor]') || !window.TribeSiteDesigner) return; const api = window.TribeSiteParts && window.TribeSiteParts._api; if (api) setEs(api, { c: i.value, col: '' }); });
  function said(api) { window.TribeSiteParts._api = api; const box = api.root().querySelector('#wdz-said'); if (box && window.TribeSiteSuggest && window.TribeSiteSuggest.said) window.TribeSiteSuggest.said(box, api); }

  const menuOpen = () => !!(menuEl && !menuEl.hidden);
  window.TribeSiteParts = { menuOpen, crumbs, looks, element, list, section, picture, siteSel, pages, wire, click, key, frame, menu, closeMenu, parentOf, entryOf, act, said };
})();
