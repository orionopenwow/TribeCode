// Files as a grid (feat/file-grid): when no doc is open, the Notes tab shows every file like a drive: a row of
// folders, then cards with a file-type icon, the name, and a thumbnail (the first picture in it, the start of the
// text on a small page, or the code on a dark card). Screenshots of the app get their own row.
//   window.TribeFileGrid = { render(pane, list, { open, create, nameOf, ago }) }
(function () {
  'use strict';
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const media = u => { if (!u) return ''; if (/^(https?:|data:)/.test(u)) return u; const abs = u.startsWith('/') ? C.base() + u : u; return window.TribeMedia ? window.TribeMedia.url(abs) : abs; };
  const CODE_EXT = /\.(js|ts|tsx|jsx|py|rs|go|c|cpp|h|cs|java|rb|php|lua|gd|json|css|html|sh|toml|yaml|yml)$/i;
  // the file's type: drives the icon chip and the thumbnail style
  function typeOf(d) {
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
    code: { ico: '💻', chip: '</>', label: 'Code' }, sheet: { ico: '📊', chip: 'CSV', label: 'Table' }, audio: { ico: '🎧', chip: 'AUD', label: 'Audio' },
    video: { ico: '🎬', chip: 'VID', label: 'Video' }, shot: { ico: '📸', chip: 'PNG', label: 'Screenshot' },
  };
  const strip = t => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#]+/g, '').trim();
  function thumb(d, type) {
    if (type === 'image' && d.img) return `<div class="fg-th fg-th-img"><img alt="" loading="lazy" src="${esc(media(d.img))}"></div>`;
    if (type === 'code') { const code = String(d.excerpt || '').replace(/^\s*```[^\n]*\n?/, '').replace(/\n?```[\s\S]*$/, '').split('\n').slice(0, 14).join('\n'); return `<div class="fg-th fg-th-code"><pre>${esc(code)}</pre></div>`; }
    const lines = String(d.excerpt || '').split('\n').filter(l => l.trim()).slice(0, 14);
    const body = lines.map(l => /^#{1,3}\s/.test(l) ? `<b>${esc(strip(l))}</b>` : /^\s*[-*]\s/.test(l) ? `<i>• ${esc(strip(l.replace(/^\s*[-*]\s/, '')))}</i>` : `<i>${esc(strip(l))}</i>`).join('');
    const pic = d.img ? `<img class="fg-pic" alt="" loading="lazy" src="${esc(media(d.img))}">` : '';
    return `<div class="fg-th fg-th-page"><div class="fg-paper"><b class="fg-pt">${esc(d.title || 'Untitled')}</b>${body || '<i class="fg-blank">Empty</i>'}${pic}</div></div>`;
  }
  function card(d, o) {
    const type = typeOf(d), T = TYPE[type];
    return `<button class="fg-card" data-slug="${esc(d.slug)}" data-type="${type}" title="${esc(d.title || 'Untitled')}">
      <span class="fg-head"><span class="fg-ico fg-ico-${type}" aria-hidden="true">${esc(T.chip)}</span><span class="fg-name">${esc(d.title || 'Untitled')}</span><span class="fg-more" aria-hidden="true">⋮</span></span>
      ${thumb(d, type)}
      <span class="fg-meta">${T.ico} ${T.label}${d.updated && o.ago ? ` · ${esc(o.ago(d.updated))}` : ''}${d.updatedBy && o.nameOf ? ` · ${esc(o.nameOf(d.updatedBy))}` : ''}</span></button>`;
  }
  function folderOf(d) { const s = String(d.slug || ''); const i = s.lastIndexOf('/'); return i > 0 ? s.slice(0, i) : ''; }

  async function render(pane, list, o) {
    const folders = [...new Set(list.map(folderOf).filter(Boolean))].sort();
    let at = pane.dataset.fgFolder || '';
    const draw = (shots) => {
      const items = list.filter(d => folderOf(d) === at || (!at && !folderOf(d)));
      { const h = document.getElementById('doc-repo-hero'), w = document.getElementById('doc-list-wrap'); if (h && w && pane.contains(h)) { const x = h.nextElementSibling && h.nextElementSibling.classList.contains('vw-assets') ? h.nextElementSibling : null; w.prepend(h); if (x) h.after(x); } }   // keep the repo strip alive across redraws
      pane.innerHTML = `<div class="fg">
        <div class="fg-top"><h2>${at ? `<button class="fg-up" data-up>📁 Files</button> <span aria-hidden="true">›</span> ${esc(at.split('/').pop())}` : '📁 All files'}</h2><span class="fg-n">${list.length} file${list.length === 1 ? '' : 's'}</span><button class="btn" id="doc-first">＋ New doc</button></div>
        ${!at ? '<div class="fg-repo"></div>' : ''}
        ${!at && folders.length ? `<div class="fg-folders">${folders.map(f => `<button class="fg-folder" data-folder="${esc(f)}"><span aria-hidden="true">📁</span><span>${esc(f.split('/').pop())}</span><span class="fg-more" aria-hidden="true">⋮</span></button>`).join('')}</div>` : ''}
        ${items.length ? `<div class="fg-grid">${items.map(d => card(d, o)).join('')}</div>`
          : `<div class="fg-empty"><span aria-hidden="true">🗂️</span><b>${list.length ? 'Nothing in this folder yet' : 'Your tribe’s files live here'}</b><p>${list.length ? 'Pick another folder, or press ＋ New doc to add one here.' : 'Press <b>＋ New doc</b> to write the first one. Notes, pictures, PDFs and code your tribe adds show up here too.'}</p></div>`}
        ${!at && shots && shots.length ? `<h3 class="fg-sub">📸 Screenshots of the app</h3><div class="fg-grid">${shots.slice(0, 12).map(s => { const u = media(`/api/visuals/${s.latest.screen}/${s.latest.ts}.png`);
          return `<button class="fg-card" data-shot="${esc(u)}" data-title="${esc(s.name)}"><span class="fg-head"><span class="fg-ico fg-ico-shot" aria-hidden="true">PNG</span><span class="fg-name">${esc(s.name)}</span><span class="fg-more" aria-hidden="true">⋮</span></span><div class="fg-th fg-th-img"><img alt="" loading="lazy" src="${esc(u)}"></div><span class="fg-meta">📸 ${s.count} version${s.count === 1 ? '' : 's'}</span></button>`; }).join('')}</div>` : ''}
      </div>`;
      const slot = pane.querySelector('.fg-repo'), hero = document.getElementById('doc-repo-hero');
      if (slot && hero) { const extra = hero.nextElementSibling && hero.nextElementSibling.classList.contains('vw-assets') ? hero.nextElementSibling : null; slot.append(hero); if (extra) slot.append(extra); }
      pane.querySelector('#doc-first').onclick = () => o.create();
      pane.querySelectorAll('[data-slug]').forEach(b => b.onclick = () => o.open(b.dataset.slug));
      pane.querySelectorAll('[data-folder]').forEach(b => b.onclick = () => { at = pane.dataset.fgFolder = b.dataset.folder; draw(shots); });
      const up = pane.querySelector('[data-up]'); if (up) up.onclick = () => { at = pane.dataset.fgFolder = ''; draw(shots); };
      pane.querySelectorAll('[data-shot]').forEach(b => b.onclick = () => { if (window.TribePreview && window.TribePreview.image) window.TribePreview.image(b.dataset.shot, b.dataset.title); else window.open(b.dataset.shot, '_blank', 'noopener'); });
    };
    draw(render.shots);
    try { const v = await C.api('/visuals'); render.shots = v.screens || []; if (pane.querySelector('.fg') && !pane.querySelector('#doc-title')) draw(render.shots); } catch {}
  }
  window.TribeFileGrid = { render, typeOf };
})();
