// Picture cropper (Discord-style): pick an image, drag to frame it, zoom with the slider / wheel / pinch, see it as
// the round rail bubble and the rounded square, then Apply. Limits: PNG, JPEG, WebP or GIF, up to 10 MB, at least
// 64 px. The result is a square (256 px by default) WebP (PNG if the browser can't), small enough for the server's
// 300 KB limit. Used for project pictures (projects.js: new project setup and the overview's camera badge).
//   window.TribeCropper.pick({ size, title }) -> Promise<dataURL | null>
(() => {
  'use strict';
  const MAX_BYTES = 10 * 1024 * 1024, MIN_PX = 64, TYPES = /^image\/(png|jpeg|webp|gif)$/;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast(m);

  function chooseFile() {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
      inp.onchange = () => res(inp.files[0] || null);
      inp.addEventListener('cancel', () => res(null));
      inp.click();
    });
  }
  async function load(file) {
    if (!file) return null;
    if (!TYPES.test(file.type)) throw new Error('Use a PNG, JPEG, WebP or GIF picture.');
    if (file.size > MAX_BYTES) throw new Error('That picture is over 10 MB. Pick a smaller one.');
    const img = await createImageBitmap(file);
    if (Math.min(img.width, img.height) < MIN_PX) throw new Error(`That picture is too small (at least ${MIN_PX} × ${MIN_PX} px).`);
    return img;
  }

  function editor(img, { size = 256, title = 'Frame your picture' } = {}) {
    return new Promise(resolve => {
      const V = 280;                                    // the square viewport in CSS px
      const base = V / Math.min(img.width, img.height); // "cover" scale at zoom 1
      let zoom = 1, x = 0, y = 0;                       // pan offset in viewport px (0,0 = centered)
      const wrap = document.createElement('div'); wrap.className = 'crop-wrap'; wrap.id = 'crop-wrap';
      wrap.innerHTML = `<div class="crop" role="dialog" aria-label="${esc(title)}">
        <header><span class="eyebrow">Picture</span><h2>${esc(title)}</h2></header>
        <div class="crop-stage"><canvas class="crop-cv" width="${V * 2}" height="${V * 2}" style="width:${V}px;height:${V}px" aria-label="Drag to move the picture"></canvas><div class="crop-mask" aria-hidden="true"></div></div>
        <div class="crop-zoom"><span aria-hidden="true">−</span><input type="range" id="crop-z" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><span aria-hidden="true">+</span></div>
        <div class="crop-prev" aria-hidden="true"><canvas class="cp-round" width="96" height="96"></canvas><canvas class="cp-square" width="96" height="96"></canvas><small>How it shows: the rail bubble and the overview</small></div>
        <footer><button class="linkish" id="crop-reset">Reset</button><span style="flex:1"></span><button class="btn" id="crop-cancel">Cancel</button><button class="btn primary" id="crop-apply">Apply</button></footer></div>`;
      document.body.appendChild(wrap);
      const cv = wrap.querySelector('.crop-cv'), ctx = cv.getContext('2d'), zr = wrap.querySelector('#crop-z');
      const clamp = () => {   // never show empty space: the picture always covers the frame
        const w = img.width * base * zoom, h = img.height * base * zoom, mx = Math.max(0, (w - V) / 2), my = Math.max(0, (h - V) / 2);
        x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
      };
      const drawTo = (c, out) => {
        const k = out / V, s = base * zoom * k, w = img.width * s, h = img.height * s, g = c.getContext('2d');
        g.clearRect(0, 0, out, out); g.imageSmoothingQuality = 'high';
        g.drawImage(img, (out - w) / 2 + x * k, (out - h) / 2 + y * k, w, h);
      };
      const draw = () => {
        clamp(); drawTo(cv, V * 2);
        drawTo(wrap.querySelector('.cp-round'), 96); drawTo(wrap.querySelector('.cp-square'), 96);
      };
      draw();
      // drag (mouse + touch), wheel and pinch zoom
      let drag = null, pinch = null;
      cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x, y }; });
      cv.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId || pinch) return; x = drag.x + (e.clientX - drag.sx); y = drag.y + (e.clientY - drag.sy); draw(); });
      cv.addEventListener('pointerup', () => { drag = null; });
      cv.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(1, Math.min(4, zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); zr.value = zoom; draw(); }, { passive: false });
      cv.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: zoom }; }, { passive: true });
      cv.addEventListener('touchmove', e => { if (pinch && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); zoom = Math.max(1, Math.min(4, pinch.z * d / pinch.d)); zr.value = zoom; draw(); } }, { passive: true });
      cv.addEventListener('touchend', () => { pinch = null; });
      zr.oninput = () => { zoom = +zr.value; draw(); };
      cv.tabIndex = 0;
      cv.addEventListener('keydown', e => { const st = e.shiftKey ? 10 : 3; if (e.key === 'ArrowLeft') x += st; else if (e.key === 'ArrowRight') x -= st; else if (e.key === 'ArrowUp') y += st; else if (e.key === 'ArrowDown') y -= st; else return; e.preventDefault(); draw(); });
      const done = v => { wrap.remove(); document.removeEventListener('keydown', esc_); resolve(v); };
      const esc_ = e => { if (e.key === 'Escape') done(null); };
      document.addEventListener('keydown', esc_);
      wrap.querySelector('#crop-reset').onclick = () => { zoom = 1; x = y = 0; zr.value = 1; draw(); };
      wrap.querySelector('#crop-cancel').onclick = () => done(null);
      wrap.addEventListener('click', e => { if (e.target === wrap) done(null); });
      wrap.querySelector('#crop-apply').onclick = () => {
        const out = document.createElement('canvas'); out.width = out.height = size; drawTo(out, size);
        let url = out.toDataURL('image/webp', 0.9);
        if (!/^data:image\/webp/.test(url)) url = out.toDataURL('image/png');
        if (url.length > 290_000) url = out.toDataURL('image/jpeg', 0.85);   // stay under the server's limit
        done(url);
      };
      setTimeout(() => cv.focus(), 30);
    });
  }

  async function pick(opts = {}) {
    try {
      const img = await load(opts.file || await chooseFile());
      if (!img) return null;
      return await editor(img, opts);
    } catch (e) { toast(e.message || 'Could not use that picture'); return null; }
  }
  window.TribeCropper = { pick, editor, load };
})();
