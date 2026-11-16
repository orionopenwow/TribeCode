// Launch kit drawing (docs/LAUNCH-KIT.md): every picture the kit makes is drawn here on a canvas, at full size for the
// stores and small for the style thumbnails, so a thumbnail is exactly what you get. Zero dependencies.
//   TribeLaunchDraw.slide(canvas, W, H, o)    a store screenshot   o = { style, caption, sub, imgs: [img…], brand, index, count, tablet, name }
//   TribeLaunchDraw.feature(canvas, o)        the 1024x500 Google Play feature graphic   o = { brand, name, subtitle, iconCanvas, img }
//   TribeLaunchDraw.icon(canvas, size, o, kind) -> Promise   o = { style, text, symbol, brand, upload, swap, name }; kind from ICON_FILES
//   TribeLaunchDraw.paywall(canvas, w, h, model, brand, o) -> Promise   o = { name, symbol }
//   TribeLaunchDraw.screen(canvas, w, h, o)   a stand-in app screen when there is no real one yet   o = { brand, name, variant }
//   TribeLaunchDraw.png(canvas, { alpha }) -> Promise<Blob>   no alpha: a true RGB PNG (Apple refuses images with an alpha channel)
//   TribeLaunchDraw.img(url) -> Promise<HTMLImageElement>
// Device frames are our own plain shapes (a rounded body, a screen, a camera dot), not any maker's artwork.
(function () {
  'use strict';
  const L = () => window.TribeLaunchCore;
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);   // words drawn into a design follow the app's language
  const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
  const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  // ---------- small helpers ----------
  function hex2rgb(h) { const n = parseInt(String(h || '#000000').slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { const x = hex2rgb(a), y = hex2rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  function rr(x, cx, cy, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); x.beginPath(); x.moveTo(cx + r, cy); x.arcTo(cx + w, cy, cx + w, cy + h, r); x.arcTo(cx + w, cy + h, cx, cy + h, r); x.arcTo(cx, cy + h, cx, cy, r); x.arcTo(cx, cy, cx + w, cy, r); x.closePath(); }
  const cache = new Map();
  function img(url) {
    if (!url) return Promise.resolve(null);
    if (cache.has(url)) return cache.get(url);
    const p = new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    cache.set(url, p); if (cache.size > 80) cache.delete(cache.keys().next().value); return p;
  }
  function symbolImg(name, color, sw) {
    const I = window.TribeIcons, n = String(name || ''), S = window.TribeSiteCfg, AD = window.TribeAppData;   // 'site:x' and 'app:x' come from the design library
    const d = /^site:/.test(n) && S && S.icon ? String(S.icon(n.slice(5))).replace(/^<svg[^>]*>|<\/svg>$/g, '') : /^app:/.test(n) && AD && AD.ICONS ? AD.ICONS[n.slice(4)] || '' : I && I.paths ? (I.paths[n] || I.paths.spark || '') : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    return img('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }
  function cover(x, im, dx, dy, dw, dh) {
    if (!im) return; const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height; if (!iw || !ih) return;
    const s = Math.max(dw / iw, dh / ih), sw = dw / s, sh = dh / s;
    x.drawImage(im, (iw - sw) / 2, 0 + Math.max(0, (ih - sh) * 0), sw, sh, dx, dy, dw, dh);   // top-aligned: app screens read from the top
  }
  // Wraps text into lines that fit maxW, shrinking the size until it fits in maxLines. -> { lines, size }
  function wrap(x, text, maxW, size, maxLines, font, min) {
    text = String(text || '').trim(); if (!text) return { lines: [], size };
    for (let s = size; s >= (min || size * 0.55); s -= Math.max(1, size * 0.04)) {
      x.font = font(s); const out = []; let line = '';
      for (const w of text.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; } }
      if (line) out.push(line);
      if (out.length <= maxLines && out.every(l => x.measureText(l).width <= maxW)) return { lines: out, size: s };
    }
    x.font = font(min || size * 0.55); return { lines: text.split(/\s+/).reduce((a, w) => { const l = a[a.length - 1]; if (l && x.measureText(l + ' ' + w).width <= maxW) a[a.length - 1] = l + ' ' + w; else a.push(w); return a; }, []).slice(0, maxLines), size: min || size * 0.55 };
  }

  // ---------- colours for a style: three tones, picked by the style's place in the list ----------
  function palette(brand, tone) {
    const b = L().brandColors(brand);
    if (tone === 'accent') return { bg: b.accent, ink: b.accentInk, second: mix(b.accent, b.accentInk === '#FFFFFF' ? '#000000' : '#FFFFFF', 0.16), accent: b.accentInk === '#FFFFFF' ? '#FFFFFF' : '#14171C', soft: b.accentInk };
    if (tone === 'dark') return { bg: '#14171C', ink: '#F4F5F7', second: '#222831', accent: b.accent, soft: '#9AA3AF' };
    return { bg: '#F3F1EC', ink: '#14171C', second: mix('#F3F1EC', b.accent, 0.18), accent: b.accent, soft: '#5B6470' };
  }
  const TONES = ['accent', 'light', 'dark'];

  // ---------- backgrounds ----------
  function background(x, W, H, bg, p) {
    x.fillStyle = p.bg; x.fillRect(0, 0, W, H);
    x.fillStyle = p.second; x.strokeStyle = p.second; const u = Math.min(W, H);
    if (bg === 'diag') { x.beginPath(); x.moveTo(W, H * 0.28); x.lineTo(W, H); x.lineTo(0, H); x.lineTo(0, H * 0.72); x.closePath(); x.fill(); }
    else if (bg === 'band') x.fillRect(0, H * 0.56, W, H * 0.2);
    else if (bg === 'dots') { const g = u / 13, r = g * 0.1; for (let yy = g / 2; yy < H; yy += g) for (let xx = g / 2; xx < W; xx += g) { x.beginPath(); x.arc(xx, yy, r, 0, 7); x.fill(); } }
    else if (bg === 'grid') { const g = u / 9; x.lineWidth = Math.max(1, u * 0.003); x.beginPath(); for (let xx = g; xx < W; xx += g) { x.moveTo(xx, 0); x.lineTo(xx, H); } for (let yy = g; yy < H; yy += g) { x.moveTo(0, yy); x.lineTo(W, yy); } x.stroke(); }
    else if (bg === 'stripes') { const g = u / 10; x.lineWidth = g * 0.28; x.beginPath(); for (let k = -H; k < W + H; k += g) { x.moveTo(k, 0); x.lineTo(k + H, H); } x.stroke(); }
    else if (bg === 'circle') { x.beginPath(); x.arc(W * 0.5, H * 0.66, u * 0.52, 0, 7); x.fill(); }
    else if (bg === 'arc') { x.lineWidth = u * 0.12; x.beginPath(); x.arc(W, 0, u * 0.62, Math.PI * 0.5, Math.PI); x.stroke(); }
    else if (bg === 'corner') { rr(x, -u * 0.2, H - u * 0.7, u * 0.9, u * 0.9, u * 0.12); x.fill(); }
    else if (bg === 'frame') { const m = u * 0.035; x.lineWidth = u * 0.008; x.strokeRect(m, m, W - 2 * m, H - 2 * m); }
    else if (bg === 'halves') x.fillRect(0, H * 0.5, W, H * 0.5);
  }

  // ---------- a stand-in app screen ----------
  function screen(c, w, h, o) {
    o = o || {}; const x = c.getContext('2d'); c.width = w; c.height = h;
    const b = L().brandColors(o.brand), v = (o.variant | 0) % 4, u = w / 100;
    x.fillStyle = '#FBFBFA'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#14171C'; x.font = `700 ${u * 7}px ${SANS}`; x.textBaseline = 'alphabetic'; x.fillText(String(o.name || 'My app').slice(0, 18), u * 7, u * 24);
    x.fillStyle = '#8A929C'; x.font = `500 ${u * 3.6}px ${SANS}`; x.fillText(T(['Today', 'Explore', 'Progress', 'Library'][v]), u * 7, u * 14);
    const card = (cx, cy, cw, ch, fill) => { x.fillStyle = fill; rr(x, cx, cy, cw, ch, u * 3); x.fill(); };
    if (v === 0) { card(u * 6, u * 32, u * 88, u * 40, b.accent); for (let i = 0; i < 6; i++) { card(u * 6, u * (78 + i * 18), u * 88, u * 14, '#EEEDEA'); x.fillStyle = i % 2 ? b.accent : '#C9CED6'; x.beginPath(); x.arc(u * 14, u * (85 + i * 18), u * 3, 0, 7); x.fill(); x.fillStyle = '#B5BBC4'; x.fillRect(u * 21, u * (83 + i * 18), u * (40 + (i * 13) % 30), u * 2.6); } }
    else if (v === 1) { for (let i = 0; i < 8; i++) { const col = i % 2, row = i >> 1; card(u * (6 + col * 45), u * (32 + row * 46), u * 43, u * 42, i === 1 ? b.accent : '#EEEDEA'); } }
    else if (v === 2) { card(u * 6, u * 32, u * 88, u * 60, '#EEEDEA'); x.fillStyle = b.accent; for (let i = 0; i < 7; i++) { const bh = u * (12 + ((i * 37) % 36)); rr(x, u * (12 + i * 11.5), u * 86 - bh, u * 7, bh, u * 2); x.fill(); } for (let i = 0; i < 4; i++) card(u * 6, u * (98 + i * 18), u * 88, u * 14, '#EEEDEA'); }
    else { for (let i = 0; i < 5; i++) { card(u * 6, u * (32 + i * 32), u * 26, u * 28, i === 0 ? b.accent : '#E3E1DC'); x.fillStyle = '#B5BBC4'; x.fillRect(u * 38, u * (38 + i * 32), u * 44, u * 3); x.fillRect(u * 38, u * (46 + i * 32), u * 30, u * 2.4); } }
    x.fillStyle = '#FFFFFF'; x.fillRect(0, h - u * 18, w, u * 18); x.fillStyle = '#E5E3DE'; x.fillRect(0, h - u * 18, w, Math.max(1, u * 0.3));
    for (let i = 0; i < 4; i++) { x.fillStyle = i === v ? b.accent : '#B5BBC4'; x.beginPath(); x.arc(u * (16 + i * 22.5), h - u * 9, u * 2.6, 0, 7); x.fill(); }
    return c;
  }

  // ---------- device frames ----------
  // frame: dark | light | line | brand | none. Draws the body, then the picture clipped to the screen.
  function device(x, cx, cy, dw, dh, im, frame, p, tablet) {
    const u = dw, R = tablet ? u * 0.06 : u * 0.15, bez = frame === 'none' ? 0 : (tablet ? u * 0.035 : u * 0.04), sr = frame === 'none' ? (tablet ? u * 0.03 : u * 0.1) : Math.max(0, R - bez * 0.9);
    if (frame !== 'none') {
      rr(x, cx, cy, dw, dh, R);
      if (frame === 'line') { x.lineWidth = Math.max(1.5, u * 0.012); x.strokeStyle = p.ink; x.stroke(); }
      else { x.fillStyle = frame === 'light' ? '#E7E9EC' : frame === 'brand' ? p.accent : '#0E1013'; x.fill(); if (frame === 'light') { x.lineWidth = Math.max(1, u * 0.005); x.strokeStyle = '#C3C8CF'; x.stroke(); } }
    }
    x.save(); rr(x, cx + bez, cy + bez, dw - bez * 2, dh - bez * 2, sr); x.clip();
    x.fillStyle = '#FBFBFA'; x.fillRect(cx + bez, cy + bez, dw - bez * 2, dh - bez * 2);
    if (im) cover(x, im, cx + bez, cy + bez, dw - bez * 2, dh - bez * 2);
    x.restore();
    if (frame === 'none') { rr(x, cx, cy, dw, dh, sr); x.lineWidth = Math.max(1, u * 0.006); x.strokeStyle = 'rgba(20,23,28,0.18)'; x.stroke(); }
    else if (!tablet) { x.fillStyle = '#0E1013'; x.beginPath(); x.arc(cx + dw / 2, cy + bez + u * 0.045, u * 0.018, 0, 7); x.fill(); }
  }
  const PH = 2.17, TB = 1.33;   // body height / width: a modern phone, a tablet

  // ---------- captions ----------
  function fonts(type, brand) {
    const disp = brand && brand.fonts && brand.fonts.display ? `"${String(brand.fonts.display).replace(/"/g, '')}", ` : '';
    if (type === 'serif') return { cap: s => `700 ${s}px ${disp}${SERIF}`, sub: s => `400 ${s}px ${SANS}`, upper: false };
    if (type === 'mono') return { cap: s => `700 ${s}px ${disp}${SANS}`, sub: s => `500 ${s}px ${MONO}`, upper: false, eyebrow: true };
    if (type === 'caps') return { cap: s => `800 ${s}px ${disp}${SANS}`, sub: s => `500 ${s}px ${SANS}`, upper: true };
    if (type === 'light') return { cap: s => `300 ${s}px ${disp}${SANS}`, sub: s => `400 ${s}px ${SANS}`, upper: false, big: 1.12 };
    return { cap: s => `800 ${s}px ${disp}${SANS}`, sub: s => `500 ${s}px ${SANS}`, upper: false };
  }
  // Draws caption + subcaption in a box; returns the bottom y.
  function caption(x, o, box, p, align, scale) {
    const f = fonts(o.type, o.brand); let cap = String(o.caption || ''), sub = String(o.sub || '');
    if (f.upper) cap = cap.toUpperCase();
    const W = box.w, size0 = box.size * (f.big || 1) * (scale || 1);
    x.textAlign = align || 'center'; x.textBaseline = 'top';
    const ax = align === 'left' ? box.x : align === 'right' ? box.x + W : box.x + W / 2;
    let y = box.y;
    if (f.eyebrow && sub) { x.fillStyle = p.accent === p.bg ? p.ink : p.accent; x.font = f.sub(size0 * 0.32); try { x.letterSpacing = `${size0 * 0.03}px`; } catch {} x.fillText(sub.toUpperCase().slice(0, 40), ax, y); try { x.letterSpacing = '0px'; } catch {} y += size0 * 0.55; }
    const w1 = wrap(x, cap, W, size0, box.lines || 3, f.cap);
    x.fillStyle = p.ink; x.font = f.cap(w1.size); if (f.upper) { try { x.letterSpacing = `${w1.size * 0.02}px`; } catch {} }
    for (const l of w1.lines) { x.fillText(l, ax, y); y += w1.size * 1.12; }
    try { x.letterSpacing = '0px'; } catch {}
    if (sub && !f.eyebrow && box.sub !== false) { const w2 = wrap(x, sub, W, size0 * 0.42, 2, f.sub); y += size0 * 0.18; x.fillStyle = p.soft; x.font = f.sub(w2.size); for (const l of w2.lines) { x.fillText(l, ax, y); y += w2.size * 1.3; } }
    return y;
  }

  // ---------- one store screenshot ----------
  function slide(c, W, H, o) {
    o = o || {}; c.width = W; c.height = H; const x = c.getContext('2d');
    const C = L(), list = C.SHOT_STYLES, st = list.find(s => s.id === o.style) || list[0], si = list.indexOf(st);
    const p = palette(o.brand, TONES[(si * 5) % 3]), tablet = !!o.tablet, land = W > H;
    const imgs = (o.imgs || []).filter(Boolean), im = n => imgs[n % Math.max(1, imgs.length)] || null;
    const t = { caption: o.caption, sub: o.sub, type: st.type, brand: o.brand };
    const u = Math.min(W, H * 0.62), pad = u * 0.075, capSize = u * (tablet ? 0.07 : 0.088);
    const dwOf = k => (tablet ? Math.min(W * k * 0.95, H * 0.62 / TB) : W * k), dh = w => w * (tablet ? TB : PH);
    const fr = st.frame;
    background(x, W, H, st.bg, p);
    const top = () => caption(x, t, { x: pad, y: pad * 1.5, w: W - pad * 2, size: capSize }, p);
    const lay = st.layout;
    if (lay === 'top' || lay === 'badge') {
      let y0 = pad * 1.5;
      if (lay === 'badge' && t.sub) { x.font = `700 ${capSize * 0.34}px ${SANS}`; const tw = x.measureText(String(t.sub).toUpperCase().slice(0, 28)).width + capSize * 0.7; rr(x, (W - tw) / 2, y0, tw, capSize * 0.62, capSize * 0.31); x.fillStyle = p.accent === p.bg ? p.ink : p.accent; x.fill(); x.fillStyle = p.accent === p.bg ? p.bg : (C.lum(p.accent) > 0.55 ? '#14171C' : '#FFFFFF'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(t.sub).toUpperCase().slice(0, 28), W / 2, y0 + capSize * 0.32); y0 += capSize * 0.95; }
      const yb = caption(x, { ...t, sub: lay === 'badge' ? '' : t.sub }, { x: pad, y: y0, w: W - pad * 2, size: capSize }, p);
      const w = dwOf(0.74); device(x, (W - w) / 2, Math.max(yb + pad * 0.8, H * 0.27), w, dh(w), im(0), fr, p, tablet);
    } else if (lay === 'bottom') {
      const w = Math.min(dwOf(0.7), (H * 0.72 - pad * 1.4) / (tablet ? TB : PH)); device(x, (W - w) / 2, pad * 1.4, w, dh(w), im(0), fr, p, tablet);
      caption(x, t, { x: pad, y: H * 0.76, w: W - pad * 2, size: capSize * 0.92, lines: 2 }, p);
    } else if (lay === 'big') {
      const yb = caption(x, t, { x: pad, y: pad * 1.6, w: W - pad * 2, size: capSize * 1.45, lines: 4 }, p, 'left');
      const w = dwOf(0.6); device(x, W - w - pad, Math.max(yb + pad, H * 0.5), w, dh(w), im(0), fr, p, tablet);
    } else if (lay === 'tiltL' || lay === 'tiltR') {
      top(); const w = dwOf(0.66), hh = dh(w), a = (lay === 'tiltL' ? -1 : 1) * 0.14;
      x.save(); x.translate(W / 2, H * 0.67); x.rotate(a); device(x, -w / 2, -hh / 2, w, hh, im(0), fr, p, tablet); x.restore();
    } else if (lay === 'pair') {
      top(); const w = dwOf(0.54);
      x.save(); x.translate(W * 0.36, H * 0.68); x.rotate(-0.08); device(x, -w / 2, -dh(w) / 2, w, dh(w), im(1), fr, p, tablet); x.restore();
      x.save(); x.translate(W * 0.64, H * 0.72); x.rotate(0.06); device(x, -w / 2, -dh(w) / 2, w, dh(w), im(0), fr, p, tablet); x.restore();
    } else if (lay === 'fan') {
      top(); const w = dwOf(0.44);
      [[-0.22, 2, -0.2], [0.22, 1, 0.2], [0, 0, 0]].forEach(([a, n, dx]) => { x.save(); x.translate(W / 2 + dx * W * 0.62, H * 0.98); x.rotate(a); device(x, -w / 2, -dh(w) * 0.92, w, dh(w), im(n), fr, p, tablet); x.restore(); });
    } else if (lay === 'bleed') {
      if (im(0)) cover(x, im(0), 0, 0, W, H); else { const sc = document.createElement('canvas'); screen(sc, Math.round(W / 2), Math.round(H / 2), { brand: o.brand, name: o.name, variant: o.index }); x.drawImage(sc, 0, 0, W, H); }
      const bh = H * 0.24; x.save(); x.beginPath(); x.rect(0, 0, W, bh); x.clip(); background(x, W, H, st.bg, p); x.restore();
      caption(x, t, { x: pad, y: pad * 1.2, w: W - pad * 2, size: capSize * 0.9, lines: 2 }, p);
    } else if (lay === 'zoom') {
      top(); const w = dwOf(1.12); device(x, (W - w) / 2, H * 0.33, w, dh(w), im(0), fr, p, tablet);
    } else if (lay === 'block') {
      x.fillStyle = p.second; x.fillRect(0, 0, W, H * 0.44);
      caption(x, t, { x: pad, y: pad * 1.5, w: W - pad * 2, size: capSize }, p);
      const w = dwOf(0.7); device(x, (W - w) / 2, H * 0.3, w, dh(w), im(0), fr, p, tablet);
    } else if (lay === 'card') {
      top(); const w = W * 0.74, hh = Math.min(dh(w), H * 0.7); x.save(); rr(x, (W - w) / 2, H * 0.28, w, hh, w * 0.05); x.clip(); x.fillStyle = '#FBFBFA'; x.fillRect(0, 0, W, H); const sc = im(0); if (sc) cover(x, sc, (W - w) / 2, H * 0.28, w, hh); else { const s2 = document.createElement('canvas'); screen(s2, Math.round(w), Math.round(hh), { brand: o.brand, name: o.name, variant: o.index }); x.drawImage(s2, (W - w) / 2, H * 0.28); } x.restore();
      rr(x, (W - w) / 2, H * 0.28, w, hh, w * 0.05); x.lineWidth = Math.max(1.5, u * 0.006); x.strokeStyle = p.ink; x.stroke();
    } else if (lay === 'pano') {
      // one phone across two neighbouring screenshots: an even one shows its left half, the next one its right half
      const even = (o.index | 0) % 2 === 0, w = dwOf(0.92), hh = dh(w);
      caption(x, t, { x: even ? pad : W - pad - W * 0.66, y: pad * 1.5, w: W * 0.66, size: capSize * 0.9 }, p, even ? 'left' : 'right');
      device(x, even ? W - w / 2 : -w / 2, H * 0.3, w, hh, even ? im(0) : (o.prevImg || im(0)), fr, p, tablet);
    } else if (lay === 'stack') {
      top(); const w = dwOf(0.5); device(x, pad, H * 0.42, w, dh(w), im(1), fr, p, tablet); device(x, W - pad - w, H * 0.32, w, dh(w), im(0), fr, p, tablet);
    } else if (lay === 'callout') {
      top(); const w = dwOf(0.62), hh = dh(w), dx = pad * 1.2, dy = H * 0.3; device(x, dx, dy, w, hh, im(0), fr, p, tablet);
      const r = W * 0.2, cx = W - pad - r, cy = H * 0.52; x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip(); x.fillStyle = '#FBFBFA'; x.fillRect(cx - r, cy - r, r * 2, r * 2);
      if (im(0)) { const i0 = im(0), iw = i0.naturalWidth || i0.width, ih = i0.naturalHeight || i0.height; x.drawImage(i0, 0, ih * 0.12, iw * 0.5, iw * 0.5, cx - r, cy - r, r * 2, r * 2); } else { x.fillStyle = p.accent; x.beginPath(); x.arc(cx, cy, r * 0.5, 0, 7); x.fill(); }
      x.restore(); x.lineWidth = u * 0.012; x.strokeStyle = p.ink; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
    } else if (lay === 'side') {
      caption(x, t, { x: pad, y: pad * 1.5, w: W * 0.78, size: capSize }, p, 'left');
      const w = dwOf(0.82); device(x, W * 0.3, H * 0.34, w, dh(w), im(0), fr, p, tablet);
    } else if (lay === 'minimal') {
      const w = dwOf(0.8), hh = dh(w); device(x, (W - w) / 2, pad * 1.4, w, Math.min(hh, H * 0.8), im(0), fr, p, tablet);
      caption(x, { ...t, sub: '' }, { x: pad, y: H * 0.88, w: W - pad * 2, size: capSize * 0.62, lines: 1 }, p);
    } else if (lay === 'split') {
      x.fillStyle = p.second; x.beginPath(); x.moveTo(0, H * 0.42); x.lineTo(W, H * 0.3); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fill();
      caption(x, t, { x: pad, y: pad * 1.5, w: W * 0.8, size: capSize }, p, 'left');
      const w = dwOf(0.66), hh = dh(w); x.save(); x.translate(W * 0.6, H * 0.74); x.rotate(-0.06); device(x, -w / 2, -hh / 2, w, hh, im(0), fr, p, tablet); x.restore();
    }
    return c;
  }

  // ---------- the Google Play feature graphic (1024 x 500) ----------
  function feature(c, o) {
    o = o || {}; const W = 1024, H = 500; c.width = W; c.height = H; const x = c.getContext('2d');
    const p = palette(o.brand, 'accent'); background(x, W, H, 'circle', { ...p, second: p.second });
    x.fillStyle = p.bg; x.fillRect(0, 0, W * 0.6, H);
    if (o.iconCanvas) { x.save(); rr(x, 96, 150, 120, 120, 28); x.clip(); x.drawImage(o.iconCanvas, 96, 150, 120, 120); x.restore(); }
    x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = p.ink;
    const w1 = wrap(x, o.name || 'My app', 330, 56, 2, s => `800 ${s}px ${SANS}`); x.font = `800 ${w1.size}px ${SANS}`; let y = 150; for (const l of w1.lines) { x.fillText(l, 240, y); y += w1.size * 1.1; }
    if (o.subtitle) { const w2 = wrap(x, o.subtitle, 330, 26, 2, s => `500 ${s}px ${SANS}`); x.font = `500 ${w2.size}px ${SANS}`; x.fillStyle = p.soft; y += 8; for (const l of w2.lines) { x.fillText(l, 240, y); y += w2.size * 1.3; } }
    const w = 230; device(x, 700, 90, w, w * PH, o.img || null, 'dark', p, false);
    return c;
  }

  // ---------- app icons ----------
  function plate(x, kind, cx, cy, r, fill) {
    x.fillStyle = fill; x.beginPath();
    if (kind === 'circle') x.arc(cx, cy, r, 0, 7);
    else if (kind === 'squircle') rr(x, cx - r, cy - r, r * 2, r * 2, r * 0.42);
    else if (kind === 'hex') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); }
    else if (kind === 'diamond') { x.moveTo(cx, cy - r * 1.05); x.lineTo(cx + r * 1.05, cy); x.lineTo(cx, cy + r * 1.05); x.lineTo(cx - r * 1.05, cy); x.closePath(); }
    else if (kind === 'blob') { x.ellipse(cx, cy, r * 1.06, r * 0.9, -0.5, 0, 7); }
    else return;
    x.fill();
  }
  async function glyph(x, g, S, cx, cy, sc, col, o, weight) {
    const lw = S * (weight === 'thin' ? 0.035 : 0.06) * sc; x.strokeStyle = col; x.fillStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.lineJoin = 'round';
    const name = String(o.text || o.name || 'A').trim(), l1 = ([...name][0] || 'A').toUpperCase(), l2 = (name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || 'AB');
    const r = S * 0.24 * sc;
    if (g === 'letter' || g === 'monogram') {
      x.font = `${weight === 'thin' ? 400 : 800} ${S * (g === 'monogram' ? 0.32 : 0.5) * sc}px ${g === 'monogram' ? SERIF : SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(l1, cx, cy + S * 0.02 * sc);
      if (g === 'monogram') { x.beginPath(); x.arc(cx, cy, r * 1.2, 0, 7); x.stroke(); }
    } else if (g === 'letters2') { x.font = `${weight === 'thin' ? 400 : 800} ${S * 0.34 * sc}px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(l2.length > 1 ? l2[0].toUpperCase() + l2[1].toLowerCase() : l1, cx, cy + S * 0.015 * sc); }
    else if (g === 'icon') { const im = await symbolImg(o.symbol || 'spark', col, weight === 'thin' ? 1.3 : 2.1); if (im) { const s = S * 0.56 * sc; x.drawImage(im, cx - s / 2, cy - s / 2, s, s); } }
    else if (g === 'bars') { const bw = r * 0.42; [0.55, 0.85, 1.2].forEach((h, i) => { rr(x, cx - r * 0.95 + i * r * 0.72, cy + r * 0.6 - r * h * 1.2, bw, r * h * 1.2, bw / 2); x.fill(); }); }
    else if (g === 'orbit') { x.beginPath(); x.arc(cx, cy, r * 0.42, 0, 7); x.fill(); x.beginPath(); x.ellipse(cx, cy, r * 1.15, r * 0.48, -0.5, 0, 7); x.stroke(); x.beginPath(); x.arc(cx + r * 0.95, cy - r * 0.55, r * 0.14, 0, 7); x.fill(); }
    else if (g === 'wave') { for (let k = 0; k < 2; k++) { x.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40, xx = cx - r * 1.1 + t * r * 2.2, yy = cy + (k - 0.5) * r * 0.75 + Math.sin(t * Math.PI * 2) * r * 0.28; i ? x.lineTo(xx, yy) : x.moveTo(xx, yy); } x.stroke(); } }
    else if (g === 'spark') { x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.32 : r * 1.12; x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } x.closePath(); weight === 'thin' ? x.stroke() : x.fill(); }
    else if (g === 'stack') { for (let i = 2; i >= 0; i--) { rr(x, cx - r + i * r * 0.18, cy - r * 0.7 - i * r * 0.32 + r * 0.5, r * 1.6, r * 0.9, r * 0.2); if (weight === 'thin') x.stroke(); else { x.globalAlpha = 1 - i * 0.28; x.fill(); x.globalAlpha = 1; } } }
    else { x.beginPath(); x.arc(cx - r * 0.15, cy + r * 0.1, r * 0.7, 0, 7); x.fill(); x.beginPath(); x.arc(cx + r * 0.75, cy - r * 0.7, r * 0.24, 0, 7); x.fill(); }
  }
  async function icon(c, S, o, kind) {
    o = o || {}; kind = kind || 'opaque'; c.width = c.height = S; const x = c.getContext('2d'); x.clearRect(0, 0, S, S);
    const C = L(), st = C.ICON_STYLES.find(s => s.id === o.style) || C.ICON_STYLES[0], b = C.brandColors(o.brand);
    let bg = b.accent, ink = b.accentInk, second = mix(b.accent, b.accentInk === '#FFFFFF' ? '#000000' : '#FFFFFF', 0.2);
    if (o.swap) { const t = bg; bg = C.lum(b.bg) > 0.5 ? '#F6F4EF' : '#14171C'; ink = t; second = mix(bg, t, 0.18); }
    if (kind !== 'fg') {
      x.fillStyle = bg; x.fillRect(0, 0, S, S); x.fillStyle = second; x.strokeStyle = second;
      const B = st.bg;
      if (B === 'diag') { x.beginPath(); x.moveTo(S, 0); x.lineTo(S, S); x.lineTo(0, S); x.closePath(); x.fill(); }
      else if (B === 'vsplit') x.fillRect(S / 2, 0, S / 2, S);
      else if (B === 'ring') { x.lineWidth = S * 0.06; x.beginPath(); x.arc(S / 2, S / 2, S * 0.38, 0, 7); x.stroke(); }
      else if (B === 'dots') { const g = S / 8; for (let yy = g / 2; yy < S; yy += g) for (let xx = g / 2; xx < S; xx += g) { x.beginPath(); x.arc(xx, yy, g * 0.12, 0, 7); x.fill(); } }
      else if (B === 'grid') { const g = S / 6; x.lineWidth = S * 0.012; x.beginPath(); for (let k = g; k < S; k += g) { x.moveTo(k, 0); x.lineTo(k, S); x.moveTo(0, k); x.lineTo(S, k); } x.stroke(); }
      else if (B === 'stripes') { const g = S / 6; x.lineWidth = g * 0.3; x.beginPath(); for (let k = -S; k < S * 2; k += g) { x.moveTo(k, 0); x.lineTo(k + S, S); } x.stroke(); }
      else if (B === 'rays') { for (let i = 0; i < 12; i += 2) { x.beginPath(); x.moveTo(S / 2, S / 2); x.arc(S / 2, S / 2, S, i * Math.PI / 6, (i + 1) * Math.PI / 6); x.closePath(); x.fill(); } }
      else if (B === 'half') { x.beginPath(); x.arc(S / 2, S, S * 0.55, Math.PI, 0); x.fill(); }
      else if (B === 'corner') { x.beginPath(); x.arc(S, 0, S * 0.6, Math.PI * 0.5, Math.PI); x.lineTo(S, 0); x.closePath(); x.fill(); }
      else if (B === 'bands') { x.fillRect(0, S * 0.62, S, S * 0.12); x.fillRect(0, S * 0.8, S, S * 0.06); }
      if (kind === 'bg') return c;
    }
    const sc = kind === 'fg' ? 0.6 : kind === 'mask' ? 0.8 : 1, cx = S / 2, cy = S / 2;
    if (o.upload) { const im = await img(o.upload); if (im) { const s = S * (kind === 'fg' ? 0.62 : kind === 'mask' ? 0.8 : 1); if (kind === 'fg' || kind === 'mask') { x.save(); x.beginPath(); x.arc(cx, cy, s / 2, 0, 7); x.clip(); cover(x, im, cx - s / 2, cy - s / 2, s, s); x.restore(); } else cover(x, im, 0, 0, S, S); return c; } }
    const pr = S * 0.3 * sc, plateCol = st.plate === 'offset' ? null : ink, glyphCol = st.plate === 'none' || st.plate === 'offset' ? ink : bg;
    if (st.plate === 'offset') await glyph(x, st.glyph, S, cx + S * 0.035 * sc, cy + S * 0.035 * sc, sc, second, o, st.weight);
    else if (st.plate !== 'none') plate(x, st.plate, cx, cy, pr, plateCol);
    await glyph(x, st.glyph, S, cx, cy, st.plate === 'none' || st.plate === 'offset' ? sc : sc * 0.78, kind === 'fg' && st.plate === 'none' ? ink : glyphCol, o, st.weight);
    return c;
  }

  // ---------- paywalls ----------
  // Each layout is a list of blocks drawn top to bottom; the button and the small links sit at the bottom.
  const PW = {
    list: { tone: 'light', blocks: ['close', 'title', 'features', 'plans'] },
    cards: { tone: 'light', blocks: ['close', 'title', 'cards', 'features'] },
    features: { tone: 'light', blocks: ['close', 'badge', 'title', 'features', 'trial'] },
    compare: { tone: 'light', blocks: ['close', 'title', 'compare', 'plans1'] },
    minimal: { tone: 'light', blocks: ['close', 'space', 'title', 'price'] },
    hero: { tone: 'light', blocks: ['hero', 'title', 'plans'] },
    tiles: { tone: 'dark', blocks: ['close', 'title', 'tiles', 'plans1'] },
    timeline: { tone: 'light', blocks: ['close', 'title', 'timeline', 'price'] },
    toggle: { tone: 'light', blocks: ['close', 'title', 'segment', 'card', 'features'] },
    checklist: { tone: 'accent', blocks: ['close', 'title', 'checks'] },
    ladder: { tone: 'light', blocks: ['close', 'title', 'ladder'] },
    unlock: { tone: 'dark', blocks: ['close', 'title', 'unlock', 'plans1'] },
    sheet: { tone: 'light', blocks: ['sheet'] },
    lifetime: { tone: 'accent', blocks: ['close', 'space', 'badge', 'title', 'once', 'features'] },
    spotlight: { tone: 'dark', blocks: ['close', 'space', 'orb', 'title', 'features', 'trial'] },
    pills: { tone: 'light', blocks: ['close', 'title', 'pills', 'detail', 'features'] },
    onboard: { tone: 'light', blocks: ['dots', 'hero2', 'title', 'plans'] },
  };
  async function paywall(c, w, h, model, brand, o) {
    o = o || {}; c.width = w; c.height = h; const x = c.getContext('2d'), C = L(), m = C.paywallNorm(model), b = C.brandColors(brand);
    const L0 = PW[m.layout] || PW.list, u = w / 100;
    const P = L0.tone === 'dark' ? { bg: '#111418', ink: '#F4F5F7', soft: '#9AA3AF', line: '#2B313B', card: '#1A1E24', acc: b.accent, accInk: b.accentInk } : L0.tone === 'accent' ? { bg: b.accent, ink: b.accentInk, soft: mix(b.accentInk, b.accent, 0.35), line: mix(b.accent, b.accentInk, 0.3), card: mix(b.accent, b.accentInk, 0.12), acc: b.accentInk, accInk: b.accent } : { bg: '#FFFFFF', ink: '#14171C', soft: '#5B6470', line: '#E1E4E8', card: '#F5F6F7', acc: b.accent, accInk: b.accentInk };
    x.fillStyle = P.bg; x.fillRect(0, 0, w, h);
    const pad = u * 7, cw = w - pad * 2; let y = u * 10;
    const T = (s, size, weight, col, align, maxW, lines) => { const r = wrap(x, s, maxW || cw, size, lines || 2, z => `${weight} ${z}px ${SANS}`); x.font = `${weight} ${r.size}px ${SANS}`; x.fillStyle = col; x.textAlign = align || 'left'; x.textBaseline = 'top'; const ax = align === 'center' ? w / 2 : pad; for (const l of r.lines) { x.fillText(l, ax, y); y += r.size * 1.2; } };
    const check = (cx, cy, r, col, on) => { x.lineWidth = r * 0.28; x.strokeStyle = col; x.beginPath(); if (on !== false) { x.moveTo(cx - r * 0.5, cy); x.lineTo(cx - r * 0.1, cy + r * 0.4); x.lineTo(cx + r * 0.55, cy - r * 0.45); } else { x.moveTo(cx - r * 0.4, cy); x.lineTo(cx + r * 0.4, cy); } x.stroke(); };
    const box = (bx, by, bw, bh, on, fill) => { rr(x, bx, by, bw, bh, u * 3.2); x.fillStyle = fill || P.card; x.fill(); x.lineWidth = on ? u * 0.7 : u * 0.25; x.strokeStyle = on ? P.acc : P.line; x.stroke(); };
    const sym = await symbolImg(o.symbol || 'spark', L0.tone === 'light' ? b.accentInk : P.accInk, 1.8);
    const center = L0.blocks.includes('orb') || L0.blocks.includes('space') || m.layout === 'minimal';
    const planRow = (pl, i, by) => { box(pad, by, cw, u * 13, i === m.pick); x.font = `700 ${u * 4.2}px ${SANS}`; x.fillStyle = P.ink; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(pl.name, pad + u * 5, by + u * 6.5); x.textAlign = 'right'; x.fillText(pl.price, pad + cw - u * 5, by + u * 5); x.font = `500 ${u * 3}px ${SANS}`; x.fillStyle = P.soft; x.fillText(pl.period, pad + cw - u * 5, by + u * 9.4); if (pl.badge) { x.font = `700 ${u * 2.8}px ${SANS}`; const bw = x.measureText(pl.badge).width + u * 4; rr(x, pad + u * 5, by - u * 2.4, bw, u * 4.8, u * 2.4); x.fillStyle = P.acc; x.fill(); x.fillStyle = P.accInk; x.textAlign = 'left'; x.fillText(pl.badge, pad + u * 7, by); } };
    for (const blk of L0.blocks) {
      if (blk === 'close') { x.lineWidth = u * 0.7; x.strokeStyle = P.soft; x.beginPath(); x.moveTo(w - pad - u * 3, u * 7); x.lineTo(w - pad, u * 10); x.moveTo(w - pad, u * 7); x.lineTo(w - pad - u * 3, u * 10); x.stroke(); y = u * 16; }
      else if (blk === 'space') y += u * 18;
      else if (blk === 'dots') { for (let i = 0; i < 4; i++) { x.fillStyle = i === 3 ? P.acc : P.line; rr(x, w / 2 - u * 14 + i * u * 7.5, u * 8, i === 3 ? u * 6 : u * 3, u * 1.6, u * 0.8); x.fill(); } y = u * 16; }
      else if (blk === 'badge') { x.font = `700 ${u * 3.2}px ${SANS}`; const t = m.trial.on ? m.trial.text : T('Pro').toUpperCase(); const bw = x.measureText(t).width + u * 6; rr(x, center ? (w - bw) / 2 : pad, y, bw, u * 6, u * 3); x.fillStyle = P.acc; x.fill(); x.fillStyle = P.accInk; x.textBaseline = 'middle'; x.textAlign = center ? 'center' : 'left'; x.fillText(t, center ? w / 2 : pad + u * 3, y + u * 3.1); y += u * 10; }
      else if (blk === 'hero' || blk === 'hero2') { const hh = blk === 'hero' ? h * 0.3 : h * 0.22; x.fillStyle = P.acc; if (blk === 'hero') x.fillRect(0, 0, w, hh); else { rr(x, pad, y, cw, hh, u * 5); x.fill(); } const s = u * 26; if (sym) x.drawImage(sym, w / 2 - s / 2, (blk === 'hero' ? hh / 2 : y + hh / 2) - s / 2, s, s); y = (blk === 'hero' ? hh : y + hh) + u * 7; }
      else if (blk === 'orb') { x.fillStyle = P.acc; x.beginPath(); x.arc(w / 2, y + u * 16, u * 16, 0, 7); x.fill(); const s = u * 18; if (sym) x.drawImage(sym, w / 2 - s / 2, y + u * 16 - s / 2, s, s); y += u * 40; }
      else if (blk === 'title') { T(m.title, u * 8, 800, P.ink, center ? 'center' : 'left'); y += u * 1.5; T(m.sub, u * 3.8, 400, P.soft, center ? 'center' : 'left', cw, 3); y += u * 5; }
      else if (blk === 'features' || blk === 'checks') { const big = blk === 'checks'; for (const f of m.features.slice(0, big ? 7 : 5)) { const r = u * (big ? 3 : 2.4); if (big) { x.fillStyle = P.card; x.beginPath(); x.arc(pad + r, y + r, r * 1.3, 0, 7); x.fill(); } check(pad + r, y + r, r, P.acc); x.font = `${big ? 600 : 500} ${u * (big ? 4.4 : 3.9)}px ${SANS}`; x.fillStyle = P.ink; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(f, pad + r * 2 + u * 3.5, y + r); y += u * (big ? 10 : 7.5); } y += u * 3; }
      else if (blk === 'plans') { m.plans.slice(0, 3).forEach((pl, i) => { planRow(pl, i, y); y += u * 16.5; }); }
      else if (blk === 'plans1') { planRow(m.plans[m.pick], m.pick, y); y += u * 17; }
      else if (blk === 'cards') { const n = Math.min(3, m.plans.length), gw = (cw - u * 3 * (n - 1)) / n; m.plans.slice(0, n).forEach((pl, i) => { const bx = pad + i * (gw + u * 3), on = i === m.pick; box(bx, y + (on ? 0 : u * 3), gw, u * 34 - (on ? 0 : u * 3), on); x.textAlign = 'center'; x.textBaseline = 'top'; x.fillStyle = P.soft; x.font = `600 ${u * 3.2}px ${SANS}`; x.fillText(pl.name, bx + gw / 2, y + u * 7); x.fillStyle = P.ink; x.font = `800 ${u * 5}px ${SANS}`; x.fillText(pl.price, bx + gw / 2, y + u * 14); x.fillStyle = P.soft; x.font = `500 ${u * 2.6}px ${SANS}`; x.fillText(pl.period, bx + gw / 2, y + u * 22); }); y += u * 41; }
      else if (blk === 'trial') { box(pad, y, cw, u * 12, false); x.font = `600 ${u * 4}px ${SANS}`; x.fillStyle = P.ink; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(m.trial.text, pad + u * 5, y + u * 6); rr(x, pad + cw - u * 16, y + u * 3, u * 11, u * 6, u * 3); x.fillStyle = m.trial.on ? P.acc : P.line; x.fill(); x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(pad + cw - u * (m.trial.on ? 8 : 13), y + u * 6, u * 2.3, 0, 7); x.fill(); y += u * 16; }
      else if (blk === 'compare') { const cols = [pad + cw * 0.62, pad + cw * 0.86]; x.font = `700 ${u * 3.2}px ${SANS}`; x.fillStyle = P.soft; x.textAlign = 'center'; x.textBaseline = 'top'; x.fillText(T('Free'), cols[0], y); x.fillStyle = P.acc; x.fillText(T('Pro'), cols[1], y); y += u * 7; m.features.slice(0, 5).forEach((f, i) => { x.fillStyle = P.line; x.fillRect(pad, y - u * 1.8, cw, Math.max(1, u * 0.2)); x.font = `500 ${u * 3.6}px ${SANS}`; x.fillStyle = P.ink; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(f, pad, y + u * 2.4); check(cols[0], y + u * 2.4, u * 2, P.soft, i === 0); check(cols[1], y + u * 2.4, u * 2, P.acc); y += u * 8.5; }); y += u * 4; }
      else if (blk === 'price') { x.textAlign = center ? 'center' : 'left'; x.textBaseline = 'top'; x.fillStyle = P.ink; x.font = `800 ${u * 10}px ${SANS}`; const pl = m.plans[m.pick]; x.fillText(pl.price, center ? w / 2 : pad, y); y += u * 12; x.fillStyle = P.soft; x.font = `500 ${u * 3.6}px ${SANS}`; x.fillText(pl.period + (m.trial.on ? ' · ' + m.trial.text : ''), center ? w / 2 : pad, y); y += u * 10; }
      else if (blk === 'tiles') { const gw = (cw - u * 4) / 2; m.features.slice(0, 4).forEach((f, i) => { const bx = pad + (i % 2) * (gw + u * 4), by = y + (i >> 1) * (u * 30); box(bx, by, gw, u * 26, false); x.fillStyle = P.acc; x.beginPath(); x.arc(bx + u * 7, by + u * 8, u * 3.2, 0, 7); x.fill(); const r = wrap(x, f, gw - u * 8, u * 3.8, 2, z => `600 ${z}px ${SANS}`); x.font = `600 ${r.size}px ${SANS}`; x.fillStyle = P.ink; x.textAlign = 'left'; x.textBaseline = 'top'; r.lines.forEach((l, k) => x.fillText(l, bx + u * 4, by + u * 14 + k * r.size * 1.2)); }); y += u * 62; }
      else if (blk === 'timeline') { const steps = [['Today', 'Full access starts.'], ['Day 5', 'We remind you before the trial ends.'], ['Day 7', 'The plan begins. Cancel anytime before.']].map(r => r.map(T)); steps.forEach(([a, bb], i) => { x.fillStyle = i === 0 ? P.acc : P.line; x.beginPath(); x.arc(pad + u * 4, y + u * 4, u * 4, 0, 7); x.fill(); if (i < 2) { x.fillRect(pad + u * 3.4, y + u * 8, u * 1.2, u * 10); } x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = P.ink; x.font = `700 ${u * 4}px ${SANS}`; x.fillText(a, pad + u * 12, y + u * 0.5); x.fillStyle = P.soft; x.font = `400 ${u * 3.4}px ${SANS}`; x.fillText(bb, pad + u * 12, y + u * 6); y += u * 18; }); y += u * 2; }
      else if (blk === 'segment') { rr(x, pad, y, cw, u * 11, u * 5.5); x.fillStyle = P.card; x.fill(); rr(x, pad + u * 1, y + u * 1, cw / 2 - u * 1, u * 9, u * 4.5); x.fillStyle = P.acc; x.fill(); x.font = `700 ${u * 3.6}px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = P.accInk; x.fillText(m.plans[0].name, pad + cw / 4, y + u * 5.5); x.fillStyle = P.soft; x.fillText((m.plans[1] || m.plans[0]).name, pad + cw * 0.75, y + u * 5.5); y += u * 16; }
      else if (blk === 'card') { box(pad, y, cw, u * 26, true); x.textAlign = 'center'; x.textBaseline = 'top'; x.fillStyle = P.ink; x.font = `800 ${u * 9}px ${SANS}`; x.fillText(m.plans[0].price, w / 2, y + u * 5); x.fillStyle = P.soft; x.font = `500 ${u * 3.4}px ${SANS}`; x.fillText(m.plans[0].period, w / 2, y + u * 16.5); y += u * 32; }
      else if (blk === 'ladder') { m.plans.slice(0, 3).forEach((pl, i) => { const on = i === m.pick, bh = on ? u * 30 : u * 20; box(pad, y, cw, bh, on, on ? mix(P.card, P.acc, 0.08) : P.card); x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = P.ink; x.font = `800 ${u * 4.6}px ${SANS}`; x.fillText(pl.name, pad + u * 5, y + u * 4.5); x.textAlign = 'right'; x.fillText(pl.price, pad + cw - u * 5, y + u * 4.5); x.textAlign = 'left'; x.fillStyle = P.soft; x.font = `400 ${u * 3.2}px ${SANS}`; x.fillText(m.features.slice(0, on ? 2 : 1).join(' · '), pad + u * 5, y + u * 12); if (on) { x.fillText(pl.period, pad + u * 5, y + u * 19); } y += bh + u * 4; }); }
      else if (blk === 'unlock') { const gw = (cw - u * 4) / 2; box(pad, y, gw, u * 50, false); box(pad + gw + u * 4, y, gw, u * 50, true); x.textAlign = 'left'; x.textBaseline = 'top'; x.font = `700 ${u * 3.6}px ${SANS}`; x.fillStyle = P.soft; x.fillText(T('Now'), pad + u * 4, y + u * 4); x.fillStyle = P.acc; x.fillText(T('With Pro'), pad + gw + u * 8, y + u * 4); m.features.slice(0, 4).forEach((f, i) => { const yy = y + u * (13 + i * 9); check(pad + u * 6, yy + u * 2, u * 1.8, P.soft, false); check(pad + gw + u * 10, yy + u * 2, u * 1.8, P.acc); const r = wrap(x, f, gw - u * 14, u * 3, 1, z => `500 ${z}px ${SANS}`); x.font = `500 ${r.size}px ${SANS}`; x.fillStyle = P.soft; x.fillText(r.lines[0] || '', pad + u * 10, yy); x.fillStyle = P.ink; x.fillText(r.lines[0] || '', pad + gw + u * 14, yy); }); y += u * 56; }
      else if (blk === 'once') { box(pad, y, cw, u * 28, true); x.textAlign = 'center'; x.textBaseline = 'top'; const pl = m.plans.find(q => /once|lifetime/i.test(q.period + q.name)) || m.plans[0]; x.fillStyle = P.ink; x.font = `800 ${u * 10}px ${SANS}`; x.fillText(pl.price, w / 2, y + u * 5); x.fillStyle = P.soft; x.font = `500 ${u * 3.6}px ${SANS}`; x.fillText(pl.period, w / 2, y + u * 18); y += u * 34; }
      else if (blk === 'pills') { let px = pad; x.font = `700 ${u * 3.6}px ${SANS}`; m.plans.slice(0, 3).forEach((pl, i) => { const bw = x.measureText(pl.name).width + u * 9; rr(x, px, y, bw, u * 10, u * 5); x.fillStyle = i === m.pick ? P.acc : P.card; x.fill(); x.fillStyle = i === m.pick ? P.accInk : P.ink; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(pl.name, px + bw / 2, y + u * 5.2); px += bw + u * 3; }); y += u * 16; }
      else if (blk === 'detail') { const pl = m.plans[m.pick]; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = P.ink; x.font = `800 ${u * 8}px ${SANS}`; x.fillText(pl.price, pad, y); x.fillStyle = P.soft; x.font = `500 ${u * 3.6}px ${SANS}`; x.fillText(pl.period, pad, y + u * 10); y += u * 18; }
      else if (blk === 'sheet') {
        const sc = document.createElement('canvas'); screen(sc, Math.round(w / 2), Math.round(h / 2), { brand, name: o.name, variant: 1 }); x.drawImage(sc, 0, 0, w, h);
        x.fillStyle = 'rgba(10,12,16,0.55)'; x.fillRect(0, 0, w, h); const top = h * 0.42; rr(x, 0, top, w, h - top + u * 6, u * 6); x.fillStyle = P.bg; x.fill();
        x.fillStyle = P.line; rr(x, w / 2 - u * 6, top + u * 3, u * 12, u * 1.4, u * 0.7); x.fill(); y = top + u * 9; T(m.title, u * 6.6, 800, P.ink); y += u * 2; T(m.sub, u * 3.4, 400, P.soft, 'left', cw, 2); y += u * 4; m.plans.slice(0, 2).forEach((pl, i) => { planRow(pl, i, y); y += u * 16; });
      }
    }
    // the button, the trial line and the small links
    const by = h - u * 30; rr(x, pad, by, cw, u * 13, u * 4); x.fillStyle = P.acc; x.fill(); x.font = `800 ${u * 4.4}px ${SANS}`; x.fillStyle = P.accInk; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(m.cta, w / 2, by + u * 6.6);
    x.font = `500 ${u * 3}px ${SANS}`; x.fillStyle = P.soft; x.fillText(m.foot.join('   ·   '), w / 2, h - u * 9);
    return c;
  }

  // ---------- PNG without alpha (and with, when asked) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (bytes, c = 0xFFFFFFFF) => { for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return c; };
  function chunk(type, data) {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer); dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
    dv.setUint32(8 + data.length, (crc(out.subarray(4, 8 + data.length)) ^ 0xFFFFFFFF) >>> 0); return out;
  }
  async function png(c, opt) {
    if ((opt && opt.alpha) || typeof CompressionStream === 'undefined') return new Promise(res => c.toBlob(b => res(b), opt && opt.alpha ? 'image/png' : 'image/jpeg', 0.95));
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, raw = new Uint8Array((w * 3 + 1) * h);
    for (let y = 0, o = 0, i = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++, i += 4) { raw[o++] = d[i]; raw[o++] = d[i + 1]; raw[o++] = d[i + 2]; } }
    const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    const ih = new Uint8Array(13), dv = new DataView(ih.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ih[8] = 8; ih[9] = 2; ih[10] = 0; ih[11] = 0; ih[12] = 0;
    return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
  }

  window.TribeLaunchDraw = { slide, feature, icon, paywall, screen, png, img, palette, mix, PAYWALL_BLOCKS: PW };
})();
