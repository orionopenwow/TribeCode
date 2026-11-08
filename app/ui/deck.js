// Slides (feat/crafts): a light deck maker inside Files. A deck is a doc with kind "deck" whose body is Markdown with
// one slide per section, split by a line of three dashes (the Marp/reveal habit), so decks read well on GitHub and
// agents or Flint can write them as text. "Notes:" starts a slide's speaker notes. A first-line comment
// <!-- theme: campfire|paper|ember --> picks the look. Present full screen, download one HTML file, or print to PDF.
// For animations, masters and .pptx round trips open the deck in DeckCraft (docs/CRAFTS.md).
//   window.TribeDeck = { parse(body), serialize(deck), html(deck), mount(pane, opts) -> { update(doc), destroy() } }
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MD = () => window.TribeMD;
  const THEMES = { campfire: 'Campfire', paper: 'Paper', ember: 'Ember' };
  const SEP = /^\s*---\s*$/;

  function parse(body) {
    let text = String(body || '').replace(/\r/g, ''), theme = 'campfire';
    const m = /^\s*<!--\s*theme:\s*([a-z]+)\s*-->\s*\n?/i.exec(text); if (m) { if (THEMES[m[1].toLowerCase()]) theme = m[1].toLowerCase(); text = text.slice(m[0].length); }
    const slides = []; let cur = [];
    for (const line of text.split('\n')) { if (SEP.test(line)) { slides.push(cur.join('\n')); cur = []; } else cur.push(line); }
    slides.push(cur.join('\n'));
    const out = slides.map(s => { const i = s.search(/^Notes:/m); return i < 0 ? { md: s.trim(), notes: '' } : { md: s.slice(0, i).trim(), notes: s.slice(i + 6).trim() }; }).filter((s, i, a) => s.md || s.notes || a.length === 1);
    return { theme, slides: out.length ? out : [{ md: '', notes: '' }] };
  }
  const serialize = d => `<!-- theme: ${d.theme} -->\n\n` + d.slides.map(s => s.md.trim() + (s.notes.trim() ? `\n\nNotes: ${s.notes.trim()}` : '')).join('\n\n---\n\n') + '\n';
  // a heading with at most two short lines under it reads as a title slide
  const isTitle = md => { const l = md.split('\n').filter(x => x.trim()); return l.length && l.length <= 3 && /^#\s/.test(l[0]) && l.slice(1).every(x => !/^\s*([-*]|\d+\.)\s/.test(x) && x.length < 90); };
  const media = u => (window.TribeMedia && /^\//.test(u) ? window.TribeMedia.url((window.TribeClient ? window.TribeClient.base() : '') + u) : u);
  function slideHtml(s, i) {
    let inner = MD() ? MD().render(s.md || '') : esc(s.md);
    inner = inner.replace(/<img([^>]*?)src="([^"]+)"/g, (x, a, u) => `<img${a}src="${esc(media(u))}"`);
    const onlyImg = /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(s.md || '');
    return `<section class="sd ${isTitle(s.md || '') ? 'sd-title' : ''} ${onlyImg ? 'sd-img' : ''}" data-i="${i}"><div class="sd-in md">${inner || '<p class="sd-empty">Empty slide</p>'}</div></section>`;
  }
  const CSS = `
.deck-page{margin:0;background:#12151A;font-family:Inter,system-ui,sans-serif}
.sd{position:relative;width:960px;height:540px;box-sizing:border-box;padding:56px 72px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start;font-size:26px;line-height:1.45}
.sd .sd-in>*:first-child{margin-top:0}.sd h1{font-size:54px;line-height:1.1;margin:0 0 18px;letter-spacing:-.01em}.sd h2{font-size:40px;line-height:1.15;margin:0 0 22px}.sd h3{font-size:30px;margin:0 0 14px}
.sd ul,.sd ol{margin:0;padding-left:1.1em}.sd li{margin:.25em 0}.sd p{margin:.4em 0}.sd img{max-width:100%;max-height:340px;border-radius:10px;display:block;margin:10px 0}
.sd code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.85em;padding:.1em .35em;border-radius:6px}.sd pre{font-size:18px;padding:16px 20px;border-radius:10px;overflow:hidden}
.sd table{border-collapse:collapse;font-size:22px}.sd th,.sd td{padding:8px 14px;border:1px solid}
.sd-title{justify-content:center}.sd-title h1{font-size:64px}.sd-title p{font-size:28px}
.sd-img{padding:28px;justify-content:center;align-items:center}.sd-img img{max-height:480px;margin:0 auto}
.sd-empty{opacity:.4}
.th-campfire{background:#12151A;color:#F1F4F8}.th-campfire h1,.th-campfire h2{color:#F8FAFC}.th-campfire h1:after,.th-campfire h2:after{content:'';display:block;width:64px;height:6px;margin-top:16px;background:#F26B1D}.th-campfire li::marker{color:#F26B1D}.th-campfire a{color:#38C6B1}.th-campfire code,.th-campfire pre{background:#1E242D}.th-campfire th,.th-campfire td{border-color:#2A313C}
.th-paper{background:#FAF8F3;color:#1D232C}.th-paper h1,.th-paper h2{color:#12151A}.th-paper h1:after,.th-paper h2:after{content:'';display:block;width:64px;height:6px;margin-top:16px;background:#F26B1D}.th-paper li::marker{color:#F26B1D}.th-paper a{color:#1A7F72}.th-paper code,.th-paper pre{background:#EDE9E0}.th-paper th,.th-paper td{border-color:#D8D2C4}
.th-ember{background:#F26B1D;color:#1A0F08}.th-ember h1,.th-ember h2{color:#12151A}.th-ember h1:after,.th-ember h2:after{content:'';display:block;width:64px;height:6px;margin-top:16px;background:#12151A}.th-ember li::marker{color:#12151A}.th-ember a{color:#12151A}.th-ember code,.th-ember pre{background:rgba(0,0,0,.12)}.th-ember th,.th-ember td{border-color:rgba(0,0,0,.25)}
.sd-num{position:absolute;right:28px;bottom:20px;font:600 14px/1 'JetBrains Mono',monospace;opacity:.45}`;
  // one self-contained HTML file: arrow keys, click, swipe; prints one slide per page
  function html(d, title) {
    const body = d.slides.map((s, i) => slideHtml(s, i).replace('</section>', `<span class="sd-num">${i + 1}</span></section>`)).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title || 'Slides')}</title><style>${CSS}
html,body{height:100%}body.deck-page{display:grid;place-items:center;overflow:hidden}.th-${d.theme}.sd{display:none}.sd.on{display:flex}
.stage{transform-origin:center}@media print{@page{size:960px 540px;margin:0}body.deck-page{display:block;overflow:visible;background:none}.stage{transform:none!important}.sd{display:flex!important;page-break-after:always;break-after:page}}</style></head>
<body class="deck-page"><div class="stage">${body.replace(/class="sd /g, `class="sd th-${d.theme} `)}</div>
<script>(function(){var s=[].slice.call(document.querySelectorAll('.sd')),i=0,st=document.querySelector('.stage');function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(e,k){e.classList.toggle('on',k===i)})}function fit(){var k=Math.min(innerWidth/960,innerHeight/540);st.style.transform='scale('+k+')'}addEventListener('resize',fit);fit();go(0);
addEventListener('keydown',function(e){if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0)go(i+1);if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0)go(i-1);if(e.key==='Home')go(0);if(e.key==='End')go(s.length-1)});
document.addEventListener('click',function(e){go(e.clientX<innerWidth/3?i-1:i+1)});var x0=null;addEventListener('touchstart',function(e){x0=e.touches[0].clientX});addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40)go(dx<0?i+1:i-1);x0=null});})();<\/script></body></html>`;
  }

  function mount(pane, o) {
    let doc = o.doc, d = parse(doc.body), at = 0, saveT = null;
    pane.innerHTML = `<div class="dk">
      <div class="sx-top">
        <span class="sx-ico" aria-hidden="true">🎞️</span>
        <input class="sx-title" id="dk-title" value="${esc(doc.title)}" maxlength="120" aria-label="Deck name">
        <span class="sx-status faint" id="dk-status">Saved</span>
        <span class="sx-acts">
          <select class="input dk-theme" id="dk-theme" aria-label="Theme">${Object.entries(THEMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <button class="btn ghost" id="dk-flint" title="Ask Flint to write or change slides">✨ Ask Flint</button>
          <button class="btn" id="dk-play" title="Present full screen">▶ Present</button>
          <button class="btn ghost" id="dk-more" title="Download or print" aria-label="Download or print">⬇</button>
          <button class="btn ghost" id="dk-del" title="Delete deck" aria-label="Delete deck">🗑</button>
          <button class="btn ghost" id="dk-close" title="Close" aria-label="Close deck">✕</button>
        </span>
      </div>
      <div class="sx-ask hidden" id="dk-ask"><input class="input" id="dk-ask-in" placeholder="e.g. a 6-slide pitch for our game, or: make slide 3 punchier"><button class="btn" id="dk-ask-go">Ask</button></div>
      <div class="dk-body">
        <nav class="dk-strip" id="dk-strip" aria-label="Slides"></nav>
        <div class="dk-main">
          <div class="dk-stage" id="dk-stage"></div>
          <div class="dk-tools">
            <button class="btn ghost" id="dk-add">＋ Slide</button><button class="btn ghost" id="dk-dup">Duplicate</button>
            <button class="btn ghost" id="dk-up" aria-label="Move slide up" title="Move up">↑</button><button class="btn ghost" id="dk-down" aria-label="Move slide down" title="Move down">↓</button>
            <button class="btn ghost" id="dk-rm">Remove slide</button><span class="faint dk-n" id="dk-n"></span>
          </div>
          <textarea class="dk-src" id="dk-src" spellcheck="true" aria-label="Slide text" placeholder="# A title&#10;- a point&#10;- another point"></textarea>
          <input class="input dk-notes" id="dk-notes" placeholder="Speaker notes (only you see these while presenting)" aria-label="Speaker notes">
        </div>
      </div>
    </div>`;
    const $ = s => pane.querySelector(s);
    const fitStage = () => { const st = $('#dk-stage'), sd = st && st.querySelector('.sd'); if (!sd) return; const k = Math.min(st.clientWidth / 960, 1.2); sd.style.transform = `scale(${k})`; st.style.height = Math.round(540 * k) + 'px'; };
    function drawStrip() {
      $('#dk-strip').innerHTML = d.slides.map((s, i) => `<button class="dk-th ${i === at ? 'on' : ''}" data-i="${i}" aria-label="Slide ${i + 1}" draggable="true"><span class="dk-thn">${i + 1}</span><span class="dk-thv">${slideHtml(s, i).replace('class="sd ', `class="sd th-${d.theme} `)}</span></button>`).join('');
    }
    function drawStage() { $('#dk-stage').innerHTML = slideHtml(d.slides[at], at).replace('class="sd ', `class="sd th-${d.theme} `); fitStage(); $('#dk-n').textContent = `Slide ${at + 1} of ${d.slides.length}`; }
    function drawAll() { $('#dk-theme').value = d.theme; drawStrip(); drawStage(); const s = d.slides[at]; if (document.activeElement !== $('#dk-src')) $('#dk-src').value = s.md; if (document.activeElement !== $('#dk-notes')) $('#dk-notes').value = s.notes; }
    const status = t => { $('#dk-status').textContent = t; };
    function queue() { status('Editing…'); clearTimeout(saveT); saveT = setTimeout(flush, 700); }
    async function flush() {
      clearTimeout(saveT); saveT = null; status('Saving…');
      const r = await o.save({ body: serialize(d), title: $('#dk-title').value.trim() || 'Untitled', baseVersion: doc.version });
      if (r && r.conflict) {   // theirs wins for other slides; the slide I'm on keeps my text
        const mine = d.slides[at]; doc = r.conflict; d = parse(doc.body); if (d.slides[at]) d.slides[at] = mine; else d.slides.push(mine);
        drawAll(); return flush();
      }
      if (r && r.doc) { doc = { ...doc, ...r.doc }; status(`Saved · v${doc.version}`); } else status('Not saved, retrying…');
    }
    const pick = i => { at = Math.max(0, Math.min(d.slides.length - 1, i)); drawAll(); };
    $('#dk-strip').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
    let dragFrom = null;
    $('#dk-strip').addEventListener('dragstart', e => { const b = e.target.closest('[data-i]'); if (b) dragFrom = +b.dataset.i; });
    $('#dk-strip').addEventListener('dragover', e => e.preventDefault());
    $('#dk-strip').addEventListener('drop', e => { e.preventDefault(); const b = e.target.closest('[data-i]'); if (b == null || dragFrom == null) return; const to = +b.dataset.i, [s] = d.slides.splice(dragFrom, 1); d.slides.splice(to, 0, s); at = to; dragFrom = null; drawAll(); queue(); });
    $('#dk-src').addEventListener('input', () => { d.slides[at].md = $('#dk-src').value; drawStage(); const th = $('#dk-strip').querySelector(`[data-i="${at}"] .dk-thv`); if (th) th.innerHTML = slideHtml(d.slides[at], at).replace('class="sd ', `class="sd th-${d.theme} `); queue(); });
    $('#dk-notes').addEventListener('input', () => { d.slides[at].notes = $('#dk-notes').value; queue(); });
    $('#dk-title').addEventListener('input', queue);
    $('#dk-theme').onchange = () => { d.theme = $('#dk-theme').value; drawAll(); queue(); };
    $('#dk-add').onclick = () => { d.slides.splice(at + 1, 0, { md: '## New slide\n\n- ', notes: '' }); pick(at + 1); queue(); setTimeout(() => { const t = $('#dk-src'); t.focus(); t.setSelectionRange(3, 12); }, 20); };
    $('#dk-dup').onclick = () => { d.slides.splice(at + 1, 0, { ...d.slides[at] }); pick(at + 1); queue(); };
    $('#dk-rm').onclick = () => { if (d.slides.length === 1) { d.slides[0] = { md: '', notes: '' }; } else d.slides.splice(at, 1); pick(Math.min(at, d.slides.length - 1)); queue(); };
    $('#dk-up').onclick = () => { if (at < 1) return; const [s] = d.slides.splice(at, 1); d.slides.splice(at - 1, 0, s); pick(at - 1); queue(); };
    $('#dk-down').onclick = () => { if (at >= d.slides.length - 1) return; const [s] = d.slides.splice(at, 1); d.slides.splice(at + 1, 0, s); pick(at + 1); queue(); };
    $('#dk-close').onclick = async () => { if (saveT) await flush(); o.close(); };
    $('#dk-del').onclick = () => o.del();
    $('#dk-play').onclick = () => present(d, at, doc.title);
    $('#dk-more').onclick = e => {
      const old = document.getElementById('dk-menu'); if (old) { old.remove(); return; }
      const m = document.createElement('div'); m.id = 'dk-menu'; m.className = 'fl-menu'; m.setAttribute('role', 'menu');
      m.innerHTML = `<button type="button" role="menuitem" data-x="html"><span class="fm-e">🌐</span><span><b>Download as a web page</b><small>One HTML file. Opens anywhere, arrow keys to move</small></span></button>
        <button type="button" role="menuitem" data-x="pdf"><span class="fm-e">🖨</span><span><b>Print or save as PDF</b><small>One slide per page</small></span></button>
        <button type="button" role="menuitem" data-x="md"><span class="fm-e">📝</span><span><b>Download the Markdown</b><small>Works with Marp and DeckCraft's importer</small></span></button>`;
      document.body.appendChild(m); const r = e.currentTarget.getBoundingClientRect(); m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px'; m.style.top = (r.bottom + 6) + 'px';
      const close = () => { m.remove(); removeEventListener('mousedown', out, true); }; const out = ev => { if (!m.contains(ev.target)) close(); }; addEventListener('mousedown', out, true);
      const name = ($('#dk-title').value.trim() || 'slides').replace(/[^\w .-]+/g, '');
      const dl = (data, type, ext) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
      m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
        close(); const x = b.dataset.x;
        if (x === 'html') dl(html(d, name), 'text/html', '.html');
        else if (x === 'md') dl(serialize(d), 'text/markdown', '.md');
        else { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; f.srcdoc = html(d, name); document.body.appendChild(f); f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch {} setTimeout(() => f.remove(), 60000); }; }
      });
    };
    const askBox = $('#dk-ask'), askIn = $('#dk-ask-in');
    $('#dk-flint').onclick = () => { askBox.classList.toggle('hidden'); if (!askBox.classList.contains('hidden')) askIn.focus(); };
    const ask = async () => {
      const t = askIn.value.trim(); if (!t || !o.askFlint) return;
      const b = $('#dk-ask-go'); b.disabled = true; b.textContent = 'Flint is working…';
      try { const out = await o.askFlint(`${t}\n(The person is looking at slide ${at + 1}.)`, serialize(d)); if (out && out.trim()) { d = parse(out); at = Math.min(at, d.slides.length - 1); drawAll(); await flush(); askIn.value = ''; askBox.classList.add('hidden'); } }
      finally { b.disabled = false; b.textContent = 'Ask'; }
    };
    $('#dk-ask-go').onclick = ask; askIn.onkeydown = e => { if (e.key === 'Enter') ask(); };
    const ro = window.ResizeObserver ? new ResizeObserver(fitStage) : null; if (ro) ro.observe($('#dk-stage'));
    drawAll();
    return {
      update(nd) { if (saveT || !nd || nd.version <= doc.version || document.activeElement === $('#dk-src')) return; doc = nd; d = parse(nd.body); at = Math.min(at, d.slides.length - 1); drawAll(); status(`Updated by ${o.nameOf ? o.nameOf(nd.updatedBy) : 'a teammate'} · v${nd.version}`); },
      flush: () => (saveT ? flush() : null), destroy() { clearTimeout(saveT); if (ro) ro.disconnect(); },
    };
  }

  // full-screen presenting, with notes and a timer at the bottom for the presenter
  function present(d, start, title) {
    const ov = document.createElement('div'); ov.className = 'dk-present'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', `Presenting ${title || 'slides'}`);
    let i = start || 0; const t0 = Date.now();
    ov.innerHTML = '<div class="dk-pv" id="dk-pv"></div><div class="dk-pbar"><span id="dk-pn"></span><span id="dk-pnotes"></span><span id="dk-pt"></span><button class="btn ghost" id="dk-px">Esc · end</button></div>';
    document.body.appendChild(ov);
    const fit = () => { const sd = ov.querySelector('.sd'); if (!sd) return; const k = Math.min(innerWidth / 960, (innerHeight - 44) / 540); sd.style.transform = `scale(${k})`; };
    const go = n => { i = Math.max(0, Math.min(d.slides.length - 1, n)); ov.querySelector('#dk-pv').innerHTML = slideHtml(d.slides[i], i).replace('class="sd ', `class="sd th-${d.theme} `); ov.querySelector('#dk-pn').textContent = `${i + 1} / ${d.slides.length}`; ov.querySelector('#dk-pnotes').textContent = d.slides[i].notes || ''; fit(); };
    const tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); ov.querySelector('#dk-pt').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    const key = e => { if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(i + 1); } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(i - 1); } else if (e.key === 'Escape') end(); else if (e.key === 'Home') go(0); else if (e.key === 'End') go(d.slides.length - 1); };
    const end = () => { clearInterval(tick); removeEventListener('keydown', key, true); removeEventListener('resize', fit); ov.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
    addEventListener('keydown', key, true); addEventListener('resize', fit);
    ov.querySelector('#dk-pv').onclick = e => go(e.clientX < innerWidth / 3 ? i - 1 : i + 1);
    let x0 = null; ov.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true }); ov.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1); x0 = null; });
    ov.querySelector('#dk-px').onclick = end;
    if (ov.requestFullscreen) ov.requestFullscreen().catch(() => {});
    go(i);
  }

  // the slide CSS, shared by the editor, thumbnails and presenting
  (function style() { if (document.getElementById('deck-css')) return; const s = document.createElement('style'); s.id = 'deck-css'; s.textContent = CSS; document.head.appendChild(s); })();
  window.TribeDeck = { parse, serialize, html, mount, present, THEMES };
})();
