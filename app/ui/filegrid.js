// Files as a grid (feat/file-grid): when no doc is open, the Notes tab shows every file like a drive: a row of
// folders, then cards with a file-type icon, the name, and a thumbnail (the first picture in it, the start of the
// text on a small page, or the code on a dark card). Screenshots of the app get their own row.
//   window.TribeFileGrid = { render(pane, list, { open, create, nameOf, ago }) }
// feat/files-dash: the grid itself is filesview.js now (tabs with icons, + Create, previews, ⋯ menus); this file feeds it.
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const media = u => { if (!u) return ''; if (/^(https?:|data:)/.test(u)) return u; const abs = u.startsWith('/') ? C.base() + u : u; return window.TribeMedia ? window.TribeMedia.url(abs) : abs; };
  const CODE_EXT = /\.(js|ts|tsx|jsx|py|rs|go|c|cpp|h|cs|java|rb|php|lua|gd|json|css|html|sh|toml|yaml|yml)$/i;
  // the file's type: drives the icon chip and the thumbnail style
  function typeOf(d) {
    if (d.kind === 'sheet' || d.kind === 'deck') return d.kind;   // feat/crafts
    const src = String(d.source || '').toLowerCase(), ex = String(d.excerpt || '');
    if (/\.pdf$/.test(src)) return 'pdf';
    if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(src) || (d.img && ex.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim().length < 40)) return 'image';
    if (CODE_EXT.test(src) || /^\s*```/.test(ex)) return 'code';
    if (/\.(csv|xlsx?)$/.test(src) || /^\s*\|.*\|\s*\n\s*\|\s*-/.test(ex)) return 'sheet';
    if (/\.(mp3|wav|m4a|ogg)$/.test(src)) return 'audio';
    if (/\.(mp4|mov|webm)$/.test(src)) return 'video';
    return 'doc';
  }
  const TYPE = {
    doc: { ico: '📝', chip: 'DOC', label: 'Doc' }, image: { ico: '🖼️', chip: 'IMG', label: 'Picture' }, pdf: { ico: '📕', chip: 'PDF', label: 'PDF' },
    code: { ico: '💻', chip: '</>', label: 'Code' }, sheet: { ico: '📊', chip: 'CSV', label: 'Table' }, xsheet: { ico: '📊', chip: 'SHEET', label: 'Sheet' }, audio: { ico: '🎧', chip: 'AUD', label: 'Audio' },
    video: { ico: '🎬', chip: 'VID', label: 'Video' }, shot: { ico: '📸', chip: 'PNG', label: 'Screenshot' },
    deck: { ico: '🎞️', chip: 'SLIDES', label: 'Slides' },
  };
  const strip = t => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#]+/g, '').trim();
  function thumb(d, type) {
    if (type === 'sheet' && d.kind === 'sheet' && window.TribeSheet) {   // feat/crafts: the first rows, with formulas worked out
      const S = window.TribeSheet, g = S.parse(d.excerpt || '').grid.slice(0, 7), at = S.evaluate(g), cells = [];
      for (let r = 0; r < Math.max(g.length, 1); r++) for (let c = 0; c < 4; c++) cells.push(`<span class="${r === 0 ? 'h' : ''}">${esc(at(r, c))}</span>`);
      return `<div class="fg-th fg-th-sheet">${cells.join('')}</div>`;
    }
    if (type === 'deck' && window.TribeDeck) { const D = window.TribeDeck, k = D.parse(d.excerpt || ''), MDr = window.TribeMD; return `<div class="fg-th fg-th-deck"><section class="sd th-${k.theme}"><div class="sd-in md">${MDr ? MDr.render(k.slides[0].md) : esc(k.slides[0].md)}</div></section></div>`; }
    if (type === 'image' && d.img) return `<div class="fg-th fg-th-img"><img alt="" loading="lazy" src="${esc(media(d.img))}"></div>`;
    if (type === 'code') { const code = String(d.excerpt || '').replace(/^\s*```[^\n]*\n?/, '').replace(/\n?```[\s\S]*$/, '').split('\n').slice(0, 14).join('\n'); return `<div class="fg-th fg-th-code"><pre>${esc(code)}</pre></div>`; }
    const lines = String(d.excerpt || '').split('\n').filter(l => l.trim()).slice(0, 14);
    const body = lines.map(l => /^#{1,3}\s/.test(l) ? `<b>${esc(strip(l))}</b>` : /^\s*[-*]\s/.test(l) ? `<i>• ${esc(strip(l.replace(/^\s*[-*]\s/, '')))}</i>` : `<i>${esc(strip(l))}</i>`).join('');
    const pic = d.img ? `<img class="fg-pic" alt="" loading="lazy" src="${esc(media(d.img))}">` : '';
    return `<div class="fg-th fg-th-page"><div class="fg-paper"><b class="fg-pt">${esc(d.title || 'Untitled')}</b>${body || '<i class="fg-blank">Empty</i>'}${pic}</div></div>`;
  }
  function card(d, o) {
    const type = typeOf(d), T = d.kind === 'sheet' ? TYPE.xsheet : TYPE[type];   // a sheet made here says Sheet; an uploaded CSV says CSV
    return `<button class="fg-card" data-slug="${esc(d.slug)}" data-type="${type}" title="${esc(d.title || 'Untitled')}">
      <span class="fg-head"><span class="fg-ico fg-ico-${type}" aria-hidden="true">${esc(T.chip)}</span><span class="fg-name">${esc(d.title || 'Untitled')}</span><span class="fg-more" aria-hidden="true">⋮</span></span>
      ${thumb(d, type)}
      <span class="fg-meta">${T.ico} ${T.label}${d.updated && o.ago ? ` · ${esc(o.ago(d.updated))}` : ''}${d.updatedBy && o.nameOf ? ` · ${esc(o.nameOf(d.updatedBy))}` : ''}</span></button>`;
  }
  function folderOf(d) { const s = String(d.slug || ''); const i = s.lastIndexOf('/'); return i > 0 ? s.slice(0, i) : ''; }

  // ---------- feat/files-dash: the project's Files, drawn by filesview.js (the same dashboard as Home's) ----------
  const FV = () => window.TribeFilesView;
  const CAT = { doc: 'docs', image: 'pics', pdf: 'other', code: 'code', sheet: 'sheets', deck: 'slides', audio: 'media', video: 'media', shot: 'pics' };
  const TYPE_L = { doc: 'Doc', image: 'Picture', pdf: 'PDF', code: 'Code', sheet: 'Sheet', deck: 'Slides', audio: 'Audio', video: 'Video', shot: 'Screenshot' };
  const toast = m => window.TribeApp && window.TribeApp.toast(m);
  const projName = () => { const P = window.TribeProjects, id = P && P.current && P.current(); return ((P && P.list && P.list()) || []).find(x => x.id === id) || {}; };
  const memberOf = id => ((C.state() || {}).members || []).find(m => m.id === id) || null;
  let q = '', fv = null;
  function items(list, shots, at, o) {
    const T = FV().thumb, here = { key: 'here', label: projName().name || 'This project' };
    const out = list.filter(d => folderOf(d) === at || (!at && !folderOf(d))).map(d => {
      const type = typeOf(d), who = memberOf(d.updatedBy || d.by), cat = d.kind === 'deck' ? 'slides' : CAT[type] || 'docs';
      const th = type === 'doc' ? T.text(d.title, d.excerpt, d.img ? media(d.img) : '') : thumb(d, type);
      return { src: 'doc', id: d.slug, slug: d.slug, cat, type: d.kind === 'sheet' ? 'Sheet' : TYPE_L[d.kind === 'deck' ? 'deck' : type] || 'Doc', title: d.title || 'Untitled', at: d.updated, owner: who ? { name: who.name, color: who.color } : (d.updatedBy && o.nameOf ? { name: o.nameOf(d.updatedBy), color: 'var(--peer)' } : null),
        loc: here, mine: true, text: d.excerpt || '', thumb: th, cls: 'fg-card', attrs: `data-slug="${esc(d.slug)}" data-type="${type}"`, acts: ['open', 'rename', 'move', 'duplicate', 'download', 'delete'] };
    });
    // feat/dropzone: the project's uploaded files, in the folder they were dropped from (draggable out to the desktop)
    const UPCAT = { image: 'pics', audio: 'media', video: 'media', code: 'code', text: 'docs', pdf: 'other' };
    for (const f of (render.ups || []).filter(x => (x.dir || '') === at)) {
      const who = memberOf(f.by), u = media(`/api/uploads/${encodeURIComponent(f.id)}/raw`);
      out.push({ src: 'up', id: 'up:' + f.id, f, cat: UPCAT[f.kind] || 'other', type: f.kind === 'image' ? 'Picture' : f.kind === 'code' ? 'Code' : 'File', title: f.name, at: f.at, loc: here, mine: true,
        owner: who ? { name: who.name, color: who.color } : null, thumb: f.kind === 'image' && f.size < 4 * 1048576 && !/svg/.test(f.type) ? T.img(u) : T.icon(UPCAT[f.kind] || 'other', `${f.kind || 'file'} · ${Math.max(1, Math.round(f.size / 1024))} KB`),
        cls: 'fg-card', attrs: `data-up="${esc(f.id)}" data-upname="${esc(f.name)}" data-uptype="${esc(f.type || '')}" draggable="true"`, acts: ['open', 'download', 'delete'] });
    }
    if (!at) for (const s of (shots || []).slice(0, 24)) { const u = media(`/api/visuals/${s.latest.screen}/${s.latest.ts}.png`);
      out.push({ src: 'shot', id: 'shot:' + s.name, url: u, cat: 'pics', type: `Screenshot · ${s.count} version${s.count === 1 ? '' : 's'}`, title: s.name, at: s.latest.at || '', loc: { key: 'shots', label: 'Screenshots of the app' }, mine: true, thumb: T.img(u), cls: 'fg-card', attrs: `data-shot="${esc(u)}"`, acts: ['open', 'download'] }); }
    return out;
  }
  function create(k, anchor, o) {
    if (k === 'note' || k === 'doc') return o.create();
    if (k === 'sheet') return o.create('sheet');
    if (k === 'slides') return o.create('deck');
    if (k === 'code') return C.api('/docs', { method: 'POST', body: { title: 'untitled.js', body: '```js\n// untitled.js\n```\n' } }).then(r => o.open(r.doc.slug)).catch(e => toast(e.message));
    if (k === 'whiteboard') return C.api('/whiteboard', { method: 'POST', body: { name: 'Untitled board' } }).then(r => window.TribeWhiteboard && window.TribeWhiteboard.open(r.board.id)).catch(e => toast(e.message));
    if (k === 'design') return C.api('/canvas', { method: 'POST', body: { name: 'Untitled design' } }).then(r => { window.TribeApp.show('canvas'); setTimeout(() => window.TribeCanvas && window.TribeCanvas.open(r.file.id), 120); }).catch(e => toast(e.message));
    if (k === 'site') return window.TribeWebsite ? window.TribeWebsite.open() : toast('The website did not load. Reload the app.');
    if (k === 'template') return window.TribeDocsX ? window.TribeDocsX.templatePicker() : toast('Templates did not load. Reload the app.');
    if (k === 'assets') { if (window.TribeAssets) window.TribeAssets.open(); return; }
    if (k === 'upload') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.md,.txt,.csv,.tsv,.html,.json,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.mp3,.wav,.m4a,.mp4,.mov,.webm,.js,.ts,.py,.css';
      inp.onchange = () => { if (inp.files.length && window.TribeDocs && window.TribeDocs.importFiles) window.TribeDocs.importFiles([...inp.files]); };
      inp.click();
    }
  }
  async function make(kind, d, o) {
    if (kind === 'site') { toast('Flint builds the project’s website in Files › Website.'); return window.TribeWebsite && window.TribeWebsite.open(); }
    try { const r = await C.api('/docs', { method: 'POST', body: { title: d.title, body: d.body, ...(kind === 'sheet' ? { kind: 'sheet' } : kind === 'slides' ? { kind: 'deck' } : {}) } }); o.open(r.doc.slug); } catch (e) { toast(e.message); }
  }
  const saveBlob = (name, blob) => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
  async function act(k, it, anchor, arg) {
    try {
      if (it.src === 'shot') { if (k === 'download') { const r = await fetch(it.url); return saveBlob(`${it.title}.png`, await r.blob()); } return; }
      if (it.src === 'up') {   // feat/dropzone
        if (k === 'delete') { await C.api('/uploads/' + encodeURIComponent(it.f.id), { method: 'DELETE' }); render.ups = (render.ups || []).filter(x => x.id !== it.f.id); toast('Deleted.'); return; }
        if (k === 'download' || k === 'open') { const r = await fetch(media(`/api/uploads/${encodeURIComponent(it.f.id)}/raw${k === 'download' ? '?dl=1' : ''}`)); if (!r.ok) throw new Error('Could not open that file.'); const b = await r.blob();
          if (k === 'open' && /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)/.test(it.f.type || '')) { const w = window.open(URL.createObjectURL(b), '_blank', 'noopener'); if (w) return; } return saveBlob(it.f.name, b); }
        return;
      }
      const path = '/docs/' + encodeURIComponent(it.slug);
      if (k === 'rename') { await C.api(path, { method: 'PUT', body: { title: arg, force: true } }); return toast('Renamed.'); }
      if (k === 'delete') { await C.api(path, { method: 'DELETE' }); return toast('Deleted.'); }
      const full = (await C.api(path)).doc, extra = full.kind ? { kind: full.kind } : {};
      if (k === 'download') return saveBlob(`${String(full.title).replace(/[\\/:*?"<>|]+/g, '-')}.md`, new Blob([full.body || ''], { type: 'text/markdown' }));
      if (k === 'duplicate') { await C.api('/docs', { method: 'POST', body: { title: `${full.title} (copy)`, body: full.body || '', ...extra } }); return toast('Duplicated.'); }
      if (k === 'move') {
        const P = window.TribeProjects, cur = P && P.current(), list = ((P && P.list()) || []).filter(p => p.id !== cur);
        if (!list.length) return toast('There is no other project to move it to.');
        FV().closeMenus();
        const m = document.createElement('div'); m.className = 'fx-pop fx-menu'; m.id = 'fg-movemenu'; m.setAttribute('role', 'menu');
        m.innerHTML = `<div class="fx-pop-h"><span class="fx-eyebrow">Move to…</span></div>` + list.map(p => `<button type="button" role="menuitem" data-to="${esc(p.id)}">${FV().icon('tribe', 15)}<span>${esc(p.name)}</span></button>`).join('');
        document.body.appendChild(m); const r = (anchor && anchor.isConnected ? anchor : document.body).getBoundingClientRect();
        m.style.top = `${Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6))}px`; m.style.left = `${Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))}px`;
        m.querySelectorAll('[data-to]').forEach(b => b.onclick = async () => { m.remove(); try { await C.api('/docs', { method: 'POST', project: b.dataset.to, body: { title: full.title, body: full.body || '', ...extra } }); await C.api(path, { method: 'DELETE' }); toast(`Moved to ${(list.find(p => p.id === b.dataset.to) || {}).name}.`); } catch (e) { toast(e.message); } });
        setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } }, true), 0);
      }
    } catch (e) { toast(e.message); if (k === 'delete') throw e; }
  }
  async function render(pane, list, o) {
    if (!FV()) return;
    let at = pane.dataset.fgFolder || '';
    const upDirs = (render.ups || []).map(f => f.dir || '').filter(Boolean).flatMap(d => d.split('/').map((_, i, a) => a.slice(0, i + 1).join('/')));
    const folders = [...new Set([...list.map(folderOf).filter(Boolean), ...upDirs])].sort().filter(f => at ? f.startsWith(at + '/') && !f.slice(at.length + 1).includes('/') : !upDirs.includes(f) || !f.includes('/'));
    const top = () => `${at ? `<div class="fg-crumb"><button class="fg-up" data-up type="button">${FV().icon('tribe', 14)} Files</button><span aria-hidden="true">›</span><b>${esc(at.split('/').pop())}</b></div>` : ''}${!at ? '<div class="fg-repo"></div>' : ''}
      ${folders.length ? `<div class="fg-folders">${folders.map(f => `<button type="button" class="fg-folder" data-folder="${esc(f)}">${FV().icon('tribe', 16)}<span>${esc(f.split('/').pop())}</span><span class="fg-fn">${list.filter(d => folderOf(d) === f).length + (render.ups || []).filter(x => (x.dir || '') === f || (x.dir || '').startsWith(f + '/')).length}</span></button>`).join('')}</div>` : ''}`;
    const draw = shots => {
      { const h = document.getElementById('doc-repo-hero'), w = document.getElementById('doc-list-wrap'); if (h && w && pane.contains(h)) { const x = h.nextElementSibling && h.nextElementSibling.classList.contains('vw-assets') ? h.nextElementSibling : null; w.prepend(h); if (x) h.after(x); } }   // keep the code repository strip alive across redraws
      pane.innerHTML = '<div class="fg"></div>';
      const root = pane.firstChild;
      fv = FV().mount(root, {
        scope: 'project', idp: 'fg', title: 'Files', eyebrow: projName().name ? `${projName().name} · files` : 'This project', cardClass: 'fg-card', prefs: 'tribecode.pfiles', q,
        ids: { create: 'fg-new-menu', menu: 'fg-newmenu', grid: 'fg-items' },
        studio: { ids: { doc: 'doc-first', sheet: 'fg-new-sheet', slides: 'fg-new-deck' }, extra: [{ k: 'assets', ic: 'assets', t: 'Assets', s: 'Sounds, models, sprites, icons', id: 'fg-assets' }], note: 'Everyone in the project sees what you make here.' },
        top, create: (k, a) => create(k, a, o), make: (k, d) => make(k, d, o), act,
        open: it => (it.src === 'up' ? act('open', it) : it.src === 'shot' ? (window.TribePreview && window.TribePreview.image ? window.TribePreview.image(it.url, it.title) : window.open(it.url, '_blank', 'noopener')) : o.open(it.slug)),
        search: v => { q = v; },
      });
      fv.set(items(list, shots, at, o));
      const slot = root.querySelector('.fg-repo'), hero = document.getElementById('doc-repo-hero');
      if (slot && hero) { const extra = hero.nextElementSibling && hero.nextElementSibling.classList.contains('vw-assets') ? hero.nextElementSibling : null; slot.append(hero); if (extra) slot.append(extra); }
      root.querySelectorAll('[data-folder]').forEach(b => b.onclick = () => { at = pane.dataset.fgFolder = b.dataset.folder; draw(shots); });
      const up = root.querySelector('[data-up]'); if (up) up.onclick = () => { at = pane.dataset.fgFolder = ''; draw(shots); };
    };
    draw(render.shots);
    try { const u = await C.api('/uploads'); const ups = u.project || []; if (JSON.stringify(ups.map(x => x.id)) !== JSON.stringify((render.ups || []).map(x => x.id))) { render.ups = ups; if (pane.querySelector('.fx') && !pane.querySelector('#doc-title') && !pane.querySelector('#fx-rename')) draw(render.shots); } } catch {}   // feat/dropzone
    try { const v = await C.api('/visuals'); const n = (v.screens || []).length; if (n !== (render.shots || []).length) { render.shots = v.screens || []; if (pane.querySelector('.fx') && !pane.querySelector('#doc-title') && !pane.querySelector('#fx-rename')) draw(render.shots); } } catch {}
  }
  window.TribeFileGrid = { render, typeOf, folder: pane => (pane && pane.dataset.fgFolder) || '' };
})();
