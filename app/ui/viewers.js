// Asset viewers (docs/VIEWERS.md): a 3D model viewer for GLB / glTF and a pixel-art animation viewer for PNG sprite
// sheets, GIFs and Aseprite / TexturePacker JSON sheets. One modal on desktop, a full-screen sheet on phones.
// Public: window.TribeViewers = { kindOf(name), open({ name, path? | src?, sheet?, size? }), close(), repoUrl(path), assets(el) }.
//   path: a file in the project's repo (served by server/files.js with the member's key); src: any URL TribeCode serves
//   (a chat attachment). Any element with data-view-path="<repo path>" or data-view-src + data-view-name opens a viewer.
// Hooked in: chat file chips (chatx.js) and the "Art & models" list right under the pinned repo hero (Docs on desktop
// and the phone Docs hub; repohero.js onRender). Safety: the bytes are parsed in this page by GLTFLoader or drawn on a canvas, never
// evaluated or rendered as a document. three.js (pinned 0.170.0) loads from the CDN only when a 3D viewer opens.
(function () {
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const kb = n => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  const num = n => Number(n || 0).toLocaleString();
  const ico = (d, sz = 16) => `<svg class="vw-i" viewBox="0 0 24 24" style="width:${sz}px;height:${sz}px" aria-hidden="true">${d}</svg>`;
  const I = {
    cube: '<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    play: '<path d="M8 5v14l11-7z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/>',
    prev: '<path d="m15 6-6 6 6 6"/>', next: '<path d="m9 6 6 6-6 6"/>', onion: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  };
  const THREE_VER = '0.170.0';
  const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/`;
  const MODEL = /\.(glb|gltf)$/i, SPRITE = /\.(png|gif)$/i;
  const kindOf = name => (MODEL.test(name || '') ? 'model' : SPRITE.test(name || '') ? 'sprite' : null);

  const token = () => (((window.TribeStore && window.TribeStore.get().server) || {}).token || '');
  const q = () => (C.project && C.project() ? `project=${encodeURIComponent(C.project())}` : '');   // fix/security-2: no sign-in key in URLs (bytes() sends it as a header)
  const signed = u => (window.TribeMedia ? window.TribeMedia.url(u) : u);
  const repoUrl = p => `${C.base()}/api/files/raw/${String(p).split('/').map(encodeURIComponent).join('/')}?${q()}`;
  async function bytes(url) {
    const r = await fetch(url, { headers: token() ? { Authorization: 'Bearer ' + token() } : {} });
    if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error || m; } catch {} throw new Error(m || `HTTP ${r.status}`); }
    return r.arrayBuffer();
  }

  // ---------- the modal / sheet ----------
  let root = null, cleanup = null, lastFocus = null;
  function frame(kind, name, sub) {
    close();
    lastFocus = document.activeElement;
    root = document.createElement('div');
    root.className = 'vw-back'; root.id = 'vw';
    root.innerHTML = `<div class="vw ${isPhone() ? 'sheet' : ''}" role="dialog" aria-modal="true" aria-label="${esc(name)}" data-kind="${kind}">
      <div class="vw-head"><span class="vw-ic">${ico(kind === 'model' ? I.cube : I.grid, 18)}</span>
        <div class="vw-t"><span class="eyebrow">${kind === 'model' ? '3D model' : 'Pixel art'}</span><h2 title="${esc(name)}">${esc(name.split('/').pop())}</h2>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
        <button class="vw-x" id="vw-close" aria-label="Close" title="Close (Esc)">${ico(I.x, 18)}</button></div>
      <div class="vw-body" id="vw-body"><div class="vw-load">Loading…</div></div></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => { if (e.target === root) close(); });
    root.querySelector('#vw-close').onclick = close;
    setTimeout(() => { const x = root && root.querySelector('#vw-close'); if (x) x.focus(); }, 0);
    return root.querySelector('#vw-body');
  }
  function close() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    if (root) { root.remove(); root = null; if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch {} }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && root) { e.stopPropagation(); close(); } }, true);
  const fail = (body, msg) => { if (body && body.isConnected) body.innerHTML = `<div class="vw-err"><span class="eyebrow">Viewer</span><h3>Couldn't open it</h3><p>${esc(msg)}</p></div>`; };

  async function open(o = {}) {
    const name = o.name || (o.path ? o.path.split('/').pop() : 'file'), kind = o.kind || kindOf(name);
    if (!kind) return toast('No viewer for this kind of file yet.');
    const src = o.src || (o.path ? repoUrl(o.path) : null); if (!src) return;
    const body = frame(kind, name, [o.path && o.path.includes('/') ? o.path.split('/').slice(0, -1).join('/') + '/' : '', o.size ? kb(o.size) : ''].filter(Boolean).join(' · '));
    try { return kind === 'model' ? await model(body, { ...o, name, src }) : await sprite(body, { ...o, name, src }); }
    catch (e) { console.warn('viewer:', e); fail(body, e.message || String(e)); }
  }

  // =====================================================================
  // 3D: GLB / glTF with three.js (lazy import map, pinned version)
  // =====================================================================
  // fix/security-2: subresource integrity for dynamic imports. Browsers can't put integrity="" on import(), and import-map
  // integrity isn't everywhere yet, so each file is fetched, its SHA-384 checked against the npm package's file (jsDelivr
  // serves /npm/three@0.170.0/... byte for byte from npm), and only then imported from a blob: URL. The few imports between
  // these files ('three', '../utils/BufferGeometryUtils.js') are pointed at the verified blobs. A changed file never runs.
  const THREE_FILES = {
    three: ['build/three.module.js', 'sha384-GY5FqjttLCFRt/McQbyaVdCk2O1IQtOeX8Py6NfD89BIAsIyJFRl4UgSXrk2vXAk'],
    bgu: ['examples/jsm/utils/BufferGeometryUtils.js', 'sha384-wOjwauvHlJO7K6APr7FmMGH2nupQa3Ndzas9bJZhsAMOK055efJud8ns4aYmASKv'],
    gltf: ['examples/jsm/loaders/GLTFLoader.js', 'sha384-Lq1Wl94so5JCKGDvezrdVMJhdeKQkwb8iwRo59QrPPd61CnrCJZLxYmFlQ8ZuOKR'],
    orbit: ['examples/jsm/controls/OrbitControls.js', 'sha384-aJoe4qqS/DgF2jh9njAuvA6QIveJYoCuYOfYjdFY8P3eawzmc9bEQ40jq2TvOyuP'],
  };
  async function verified(key) {
    const [file, sri] = THREE_FILES[key];
    const r = await fetch(THREE_CDN + file, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`);
    const buf = await r.arrayBuffer();
    const got = 'sha384-' + btoa(String.fromCharCode.apply(null, new Uint8Array(await crypto.subtle.digest('SHA-384', buf))));
    if (got !== sri) throw Object.assign(new Error(`${file} failed its integrity check, so it was not run`), { integrity: true });
    return new TextDecoder().decode(buf);
  }
  const blobOf = src => URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const point = (src, map) => Object.entries(map).reduce((s, [from, to]) => s.split(`from '${from}'`).join(`from '${to}'`), src);
  let threeP = null;
  function three() {
    if (threeP) return threeP;
    threeP = (async () => {
      const [t, bgu, gltf, orbit] = await Promise.all(['three', 'bgu', 'gltf', 'orbit'].map(verified));
      const tUrl = blobOf(t), bUrl = blobOf(point(bgu, { three: tUrl }));
      const gUrl = blobOf(point(gltf, { three: tUrl, '../utils/BufferGeometryUtils.js': bUrl })), oUrl = blobOf(point(orbit, { three: tUrl }));
      const [T, G, O] = await Promise.all([import(tUrl), import(gUrl), import(oUrl)]);
      window.TribeViewers.threeVerified = THREE_VER;   // tests: three.js ran from the checked files
      return { T, GLTFLoader: G.GLTFLoader, OrbitControls: O.OrbitControls };
    })().catch(e => { threeP = null; throw new Error(e.integrity ? `three.js ${THREE_VER} from the CDN ${e.message}.` : `Couldn't load three.js ${THREE_VER} from the CDN (${e.message || e}). Check the internet connection.`); });
    return threeP;
  }

  async function model(body, o) {
    body.innerHTML = '<div class="vw-load">Loading three.js…</div>';
    const [{ T, GLTFLoader, OrbitControls }, buf] = await Promise.all([three(), bytes(o.src)]);
    if (!body.isConnected) return;
    body.innerHTML = `<div class="vw-stage vw-3d" id="vw-stage"><canvas id="vw-canvas" aria-label="3D model, drag to rotate"></canvas>
        <span class="vw-hint">${isPhone() ? 'Drag to turn · pinch to zoom · double-tap to reset' : 'Drag to turn · wheel to zoom · double-click to reset'}</span></div>
      <div class="vw-info" id="vw-info"></div>`;
    const stage = body.querySelector('#vw-stage'), canvas = body.querySelector('#vw-canvas');
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x12151A, 1);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(45, 1, 0.01, 1000);
    scene.add(new T.HemisphereLight(0xffffff, 0x2a313c, 1.6));
    const sun = new T.DirectionalLight(0xffffff, 1.8); sun.position.set(3, 6, 4); scene.add(sun);
    const fill = new T.DirectionalLight(0xffffff, 0.5); fill.position.set(-4, 2, -3); scene.add(fill);

    // parse in the page: GLB bytes or glTF JSON; external buffers/textures resolve next to the file (repo files only)
    const manager = new T.LoadingManager();
    manager.setURLModifier(u => (/\/api\/files\/raw\//.test(u) && !/[?&]mt=/.test(u) ? signed(q() && !/[?&]project=/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}${q()}` : u) : u));   // fix/security-2: textures and buffers next to the model load with a signed link
    const loader = new GLTFLoader(manager);
    const base = o.path ? o.src.split('?')[0].replace(/[^/]*$/, '') : '';
    const data = /\.gltf$/i.test(o.name) ? new TextDecoder().decode(buf) : buf;
    const gltf = await new Promise((res, rej) => loader.parse(data, base, res, e => rej(new Error((e && e.message) || 'not a valid glTF file'))));
    const obj = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!obj) throw new Error('the file has no scene');
    scene.add(obj);

    // stats
    let tris = 0, meshes = 0; const mats = new Set();
    obj.traverse(n => {
      if (!n.isMesh) return; meshes++;
      const g = n.geometry, c = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
      tris += Math.floor(c / 3) * (n.isInstancedMesh ? n.count : 1);
      (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m && mats.add(m));
    });

    // frame it: ground grid under the model, camera at a 3/4 view
    const box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
    const dim = Math.max(size.x, size.y, size.z) || 1;
    const grid = new T.GridHelper(dim * 4, 20, 0x3a4350, 0x2a313c); grid.position.set(center.x, box.min.y, center.z); scene.add(grid);
    camera.near = dim / 200; camera.far = dim * 200; camera.updateProjectionMatrix();
    const dist = dim / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.7;
    const home = new T.Vector3(center.x + dist * 0.6, center.y + dist * 0.45, center.z + dist * 0.75);
    camera.position.copy(home);
    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(center); controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = dim / 20; controls.maxDistance = dim * 40; controls.update();
    const reset = () => { camera.position.copy(home); controls.target.copy(center); controls.update(); };
    canvas.addEventListener('dblclick', reset);
    let lastTap = 0; canvas.addEventListener('pointerup', e => { if (e.pointerType !== 'touch') return; const t = performance.now(); if (t - lastTap < 300) reset(); lastTap = t; });

    // animations
    const clips = gltf.animations || [];
    const mixer = clips.length ? new T.AnimationMixer(obj) : null;
    let action = null, playing = false, clipIx = 0;
    const play = i => { if (!mixer) return; if (action) action.stop(); clipIx = i; action = mixer.clipAction(clips[i]); action.reset().play(); playing = true; };
    if (clips.length) play(0);

    const info = body.querySelector('#vw-info');
    const stat = (k, v, id) => `<span class="vw-stat"${id ? ` id="${id}"` : ''}><small>${k}</small><b>${v}</b></span>`;
    info.innerHTML = `${stat('File', esc(kb(buf.byteLength)), 'vw-s-size')}${stat('Triangles', num(tris), 'vw-s-tris')}${stat('Meshes', num(meshes), 'vw-s-meshes')}${stat('Materials', num(mats.size), 'vw-s-mats')}${stat('Animations', num(clips.length), 'vw-s-anims')}
      <span class="vw-sp"></span>
      ${clips.length ? `<span class="vw-anim">${clips.length > 1 ? `<select class="input vw-clip" id="vw-clip" aria-label="Animation clip">${clips.map((c, i) => `<option value="${i}">${esc(c.name || `Clip ${i + 1}`)}</option>`).join('')}</select>` : `<span class="vw-clipname">${esc(clips[0].name || 'Clip 1')}</span>`}
        <button class="vw-btn" id="vw-play" aria-label="Pause" title="Play / pause">${ico(I.pause)}</button></span>` : ''}
      <button class="vw-btn" id="vw-reset" aria-label="Reset the view" title="Reset the view">${ico(I.reset)}</button>`;
    const pb = info.querySelector('#vw-play');
    const paintPlay = () => { if (!pb) return; pb.innerHTML = ico(playing ? I.pause : I.play); pb.setAttribute('aria-label', playing ? 'Pause' : 'Play'); pb.dataset.state = playing ? 'playing' : 'paused'; };
    paintPlay();
    if (pb) pb.onclick = () => { if (!action) play(clipIx); else { playing = !playing; action.paused = !playing; } paintPlay(); };
    const sel = info.querySelector('#vw-clip'); if (sel) sel.onchange = () => { play(Number(sel.value)); paintPlay(); };
    info.querySelector('#vw-reset').onclick = reset;

    const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(stage); resize();
    const clock = new T.Clock(); let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); const dt = clock.getDelta(); if (mixer && playing) mixer.update(dt); controls.update(); renderer.render(scene, camera); };
    loop();
    body.dataset.ready = '1';
    window.__tribeViewer = { kind: 'model', tris, meshes, materials: mats.size, animations: clips.length, playing: () => playing, time: () => (mixer ? mixer.time : 0) };
    cleanup = () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); if (mixer) mixer.stopAllAction();
      scene.traverse(n => { if (n.geometry) n.geometry.dispose(); (Array.isArray(n.material) ? n.material : n.material ? [n.material] : []).forEach(m => { Object.values(m).forEach(v => v && v.isTexture && v.dispose()); m.dispose(); }); });
      renderer.dispose(); try { renderer.forceContextLoss(); } catch {}
      window.__tribeViewer = null;
    };
  }

  // =====================================================================
  // Pixel art: sprite sheets (grid or Aseprite/TexturePacker JSON) and GIFs, plain canvas
  // =====================================================================
  // A small GIF decoder (frames composed with their disposal, delays in ms). No dependencies.
  function decodeGif(buf) {
    const d = new Uint8Array(buf); let p = 0;
    const u16 = () => { const v = d[p] | (d[p + 1] << 8); p += 2; return v; };
    if (String.fromCharCode(d[0], d[1], d[2]) !== 'GIF') throw new Error('not a GIF file');
    p = 6; const W = u16(), H = u16(), flags = d[p++]; const bgIx = d[p++]; p++;
    if (!W || !H || W * H > 16e6) throw new Error('GIF too big to view');
    const table = n => { const t = []; for (let i = 0; i < n; i++) { t.push([d[p], d[p + 1], d[p + 2]]); p += 3; } return t; };
    const gct = flags & 0x80 ? table(2 << (flags & 7)) : null;
    const screen = new Uint8ClampedArray(W * H * 4), frames = [];
    let gce = { disposal: 0, delay: 100, trans: -1 }, prev = null;
    const blocks = () => { const parts = []; let n = 0; while (p < d.length) { const len = d[p++]; if (!len) break; parts.push(d.subarray(p, p + len)); n += len; p += len; } const out = new Uint8Array(n); let o = 0; parts.forEach(x => { out.set(x, o); o += x.length; }); return out; };
    while (p < d.length) {
      const b = d[p++];
      if (b === 0x3B) break;
      if (b === 0x21) {
        const label = d[p++];
        if (label === 0xF9) { const len = d[p++]; const f = d[p]; const delay = (d[p + 1] | (d[p + 2] << 8)) * 10; gce = { disposal: (f >> 2) & 7, delay: delay || 100, trans: f & 1 ? d[p + 3] : -1 }; p += len; blocks(); }
        else blocks();
        continue;
      }
      if (b !== 0x2C) break;
      const x = u16(), y = u16(), w = u16(), h = u16(), f = d[p++];
      const lct = f & 0x80 ? table(2 << (f & 7)) : null, pal = lct || gct || [];
      const interlace = !!(f & 0x40), min = d[p++], px = lzw(min, blocks(), w * h);
      const saved = gce.disposal === 3 ? screen.slice() : null;
      const rows = interlace ? [...range(0, h, 8), ...range(4, h, 8), ...range(2, h, 4), ...range(1, h, 2)] : range(0, h, 1);
      for (let r = 0; r < h; r++) {
        const yy = y + rows[r]; if (yy >= H) continue;
        for (let c = 0; c < w; c++) {
          const xx = x + c; if (xx >= W) continue;
          const ix = px[r * w + c]; if (ix === gce.trans) continue;
          const col = pal[ix]; if (!col) continue;
          const o = (yy * W + xx) * 4; screen[o] = col[0]; screen[o + 1] = col[1]; screen[o + 2] = col[2]; screen[o + 3] = 255;
        }
      }
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').putImageData(new ImageData(screen.slice(), W, H), 0, 0);
      frames.push({ canvas: cv, delay: gce.delay });
      if (gce.disposal === 2) for (let r = y; r < Math.min(H, y + h); r++) screen.fill(0, (r * W + x) * 4, (r * W + Math.min(W, x + w)) * 4);
      else if (gce.disposal === 3 && saved) screen.set(saved);
      prev = gce; gce = { disposal: 0, delay: 100, trans: -1 };
    }
    void bgIx; void prev;
    if (!frames.length) throw new Error('the GIF has no frames');
    return { width: W, height: H, frames };
  }
  function range(a, n, s) { const o = []; for (let i = a; i < n; i += s) o.push(i); return o; }
  function lzw(min, data, count) {
    const out = new Uint8Array(count), clear = 1 << min, eoi = clear + 1;
    const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
    for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; }
    let size = min + 1, mask = (1 << size) - 1, next = eoi + 1, old = -1, first = 0, datum = 0, bits = 0, pos = 0, op = 0;
    while (op < count) {
      while (bits < size) { if (pos >= data.length) return out; datum |= data[pos++] << bits; bits += 8; }
      let code = datum & mask; datum >>>= size; bits -= size;
      if (code === clear) { size = min + 1; mask = (1 << size) - 1; next = eoi + 1; old = -1; continue; }
      if (code === eoi) break;
      if (old === -1) { if (code >= clear) break; out[op++] = suffix[code]; old = first = code; continue; }
      const inCode = code; let sp = 0;
      if (code >= next) { stack[sp++] = first; code = old; }
      while (code > eoi) { stack[sp++] = suffix[code]; code = prefix[code]; }
      first = suffix[code]; stack[sp++] = first;
      if (next < 4096) { prefix[next] = old; suffix[next] = first; next++; if (next === mask + 1 && next < 4096) { size++; mask = (1 << size) - 1; } }
      old = inCode;
      while (sp > 0 && op < count) out[op++] = stack[--sp];
    }
    return out;
  }
  // Aseprite / TexturePacker JSON: frames as an array or a hash, optional per-frame durations and tags.
  function parseSheet(j) {
    const list = Array.isArray(j.frames) ? j.frames : j.frames && typeof j.frames === 'object' ? Object.entries(j.frames).map(([k, v]) => ({ filename: k, ...v })) : [];
    const rects = list.map(f => f && f.frame).filter(r => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
    const durs = list.map(f => Number(f && f.duration) || 0);
    const tags = ((j.meta && j.meta.frameTags) || []).filter(t => Number.isFinite(t.from) && Number.isFinite(t.to)).map(t => ({ name: String(t.name || 'tag'), from: t.from, to: t.to }));
    return rects.length ? { rects, durs, tags } : null;
  }
  function guessGrid(w, h) {
    if (w > h && w % h === 0) return { fw: h, fh: h };          // a horizontal strip of square frames
    if (h > w && h % w === 0) return { fw: w, fh: w };          // a vertical strip
    for (const s of [64, 48, 32, 24, 16, 8]) if (w % s === 0 && h % s === 0 && (w > s || h > s)) return { fw: s, fh: s };
    return { fw: w, fh: h };
  }

  async function sprite(body, o) {
    const buf = await bytes(o.src);
    const isGif = /\.gif$/i.test(o.name) || (new Uint8Array(buf, 0, 3).reduce((s, c) => s + String.fromCharCode(c), '') === 'GIF');
    let img = null, gif = null, sheet = null;
    if (isGif) gif = decodeGif(buf);
    else {
      const url = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
      img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not a readable PNG')); i.src = url; });
      URL.revokeObjectURL(url);
      // an Aseprite / TexturePacker JSON next to it: the listing says so, else try <name>.json beside a code repository file
      const jsonPath = o.sheet || (o.path ? o.path.replace(/\.png$/i, '.json') : null);
      if (jsonPath) { try { sheet = parseSheet(JSON.parse(new TextDecoder().decode(await bytes(repoUrl(jsonPath))))); } catch {} }
    }
    if (!body.isConnected) return;
    const W = gif ? gif.width : img.naturalWidth, H = gif ? gif.height : img.naturalHeight;
    const g = guessGrid(W, H);
    const st = { fw: g.fw, fh: g.fh, fps: 8, zoom: 4, onion: false, playing: true, i: 0, mode: gif ? 'gif' : sheet ? 'json' : 'grid', tag: -1 };
    if (gif) { const avg = gif.frames.reduce((s, f) => s + f.delay, 0) / gif.frames.length; st.fps = Math.max(1, Math.min(60, Math.round(1000 / avg))); }
    else if (sheet && sheet.durs.some(Boolean)) { const ds = sheet.durs.filter(Boolean); st.fps = Math.max(1, Math.min(60, Math.round(1000 / (ds.reduce((a, b) => a + b, 0) / ds.length)))); }
    let frames = [];   // [{ x, y, w, h, src }] — src a canvas (GIF) or the sheet image
    const opaque = (() => { if (!img) return () => true; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); const a = x.getImageData(0, 0, W, H).data; return r => { for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) if (a[(yy * W + xx) * 4 + 3]) return true; return false; }; })();
    function build() {
      if (st.mode === 'gif') frames = gif.frames.map(f => ({ x: 0, y: 0, w: W, h: H, src: f.canvas }));
      else if (st.mode === 'json') { const all = sheet.rects.map(r => ({ ...r, src: img })); const t = sheet.tags[st.tag]; frames = t ? all.slice(t.from, t.to + 1) : all; }
      else {
        const fw = Math.max(1, Math.min(W, st.fw | 0)), fh = Math.max(1, Math.min(H, st.fh | 0)), cols = Math.max(1, Math.floor(W / fw)), rows = Math.max(1, Math.floor(H / fh));
        frames = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) frames.push({ x: c * fw, y: r * fh, w: fw, h: fh, src: img });
        while (frames.length > 1 && !opaque(frames[frames.length - 1])) frames.pop();   // empty cells at the end of a sheet
      }
      if (!frames.length) frames = [{ x: 0, y: 0, w: W, h: H, src: gif ? gif.frames[0].canvas : img }];
      st.i = Math.min(st.i, frames.length - 1);
    }
    build();
    const fit = () => { const f = frames[0], stage = body.querySelector('#vw-pstage'); const maxW = (stage ? stage.clientWidth : 320) - 24, maxH = (stage ? stage.clientHeight : 320) - 24; return Math.max(1, Math.min(8, Math.floor(Math.min(maxW / f.w, maxH / f.h)))); };

    body.innerHTML = `<div class="vw-pix">
        <div class="vw-stage vw-pstage" id="vw-pstage"><canvas id="vw-canvas" class="vw-px" aria-label="Animation preview"></canvas></div>
        <div class="vw-ctl" id="vw-ctl">
          <div class="vw-row">
            <button class="vw-btn" id="vw-prev" aria-label="Previous frame" title="Previous frame">${ico(I.prev)}</button>
            <button class="vw-btn vw-main" id="vw-play" aria-label="Pause" title="Play / pause (space)">${ico(I.pause)}</button>
            <button class="vw-btn" id="vw-next" aria-label="Next frame" title="Next frame">${ico(I.next)}</button>
            <input type="range" class="vw-scrub" id="vw-scrub" min="0" max="0" value="0" aria-label="Frame">
            <span class="vw-fno" id="vw-fno">1 / 1</span>
          </div>
          <div class="vw-row vw-wrap">
            <label class="vw-f"><small>FPS</small><input type="range" id="vw-fps" min="1" max="60" value="${st.fps}" aria-label="Frames per second"><b id="vw-fps-v">${st.fps}</b></label>
            <span class="vw-seg" role="group" aria-label="Zoom">${[1, 2, 4, 8].map(z => `<button data-zoom="${z}" aria-pressed="false">${z}×</button>`).join('')}</span>
            <button class="vw-tog" id="vw-onion" aria-pressed="false" title="Onion skin: the previous frame shows faintly">${ico(I.onion, 14)}<span>Onion skin</span></button>
          </div>
          ${st.mode === 'gif' ? '' : `<div class="vw-row vw-wrap vw-grid-ctl" id="vw-gridctl">
            ${sheet ? `<span class="vw-seg" role="group" aria-label="Frames from"><button data-mode="json">Sheet JSON</button><button data-mode="grid">Grid</button></span>
              ${sheet.tags.length ? `<select class="input vw-clip" id="vw-tag" aria-label="Animation tag"><option value="-1">All frames</option>${sheet.tags.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select>` : ''}` : ''}
            <span class="vw-dims" id="vw-dims"><label><small>Frame</small><input class="input" id="vw-fw" type="number" min="1" max="${W}" value="${st.fw}" aria-label="Frame width"></label><span class="faint">×</span><label><input class="input" id="vw-fh" type="number" min="1" max="${H}" value="${st.fh}" aria-label="Frame height"></label>
              <label><small>Cols</small><input class="input" id="vw-cols" type="number" min="1" max="${W}" value="${Math.floor(W / st.fw)}" aria-label="Columns"></label><label><small>Rows</small><input class="input" id="vw-rows" type="number" min="1" max="${H}" value="${Math.floor(H / st.fh)}" aria-label="Rows"></label></span>
          </div>`}
        </div>
        <div class="vw-sheet" id="vw-sheet"><canvas id="vw-sheetc" class="vw-px" aria-label="The whole sheet: tap a frame to jump to it"></canvas></div>
        <div class="vw-info" id="vw-info"></div>
      </div>`;
    const $ = s => body.querySelector(s);
    const cv = $('#vw-canvas'), ctx = cv.getContext('2d'), sc = $('#vw-sheetc'), sx = sc.getContext('2d');
    st.zoom = fit();
    function checker(c, w, h, s) { c.fillStyle = '#1B2028'; c.fillRect(0, 0, w, h); c.fillStyle = '#222833'; for (let y = 0; y < h; y += s) for (let x = (y / s) % 2 ? s : 0; x < w; x += s * 2) c.fillRect(x, y, s, s); }
    function draw() {
      const f = frames[st.i], z = st.zoom, w = f.w * z, h = f.h * z;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      ctx.imageSmoothingEnabled = false; checker(ctx, w, h, Math.max(4, z * 2));
      if (st.onion && frames.length > 1) { const pf = frames[(st.i - 1 + frames.length) % frames.length]; ctx.globalAlpha = 0.3; ctx.drawImage(pf.src, pf.x, pf.y, pf.w, pf.h, 0, 0, pf.w * z, pf.h * z); ctx.globalAlpha = 1; }
      ctx.drawImage(f.src, f.x, f.y, f.w, f.h, 0, 0, w, h);
      $('#vw-scrub').max = String(frames.length - 1); $('#vw-scrub').value = String(st.i);
      $('#vw-fno').textContent = `${st.i + 1} / ${frames.length}`;
      drawSheet();
    }
    function drawSheet() {
      const wrap = $('#vw-sheet'); if (!wrap) return;
      const src = st.mode === 'gif' ? null : img;
      if (!src) { wrap.classList.add('hidden'); return; }
      const avail = Math.max(64, wrap.clientWidth - 2), z = Math.max(1, Math.min(4, Math.floor(avail / W))) || 1, w = W * z, h = H * z;
      if (sc.width !== w || sc.height !== h) { sc.width = w; sc.height = h; }
      sx.imageSmoothingEnabled = false; checker(sx, w, h, 4); sx.drawImage(img, 0, 0, w, h);
      sx.lineWidth = 1; sx.strokeStyle = 'rgba(148,163,184,.35)';
      frames.forEach(f => sx.strokeRect(f.x * z + 0.5, f.y * z + 0.5, f.w * z - 1, f.h * z - 1));
      const f = frames[st.i]; sx.lineWidth = 2; sx.strokeStyle = '#F26B1D'; sx.strokeRect(f.x * z + 1, f.y * z + 1, f.w * z - 2, f.h * z - 2);
      sc.dataset.z = String(z);
    }
    function info() {
      const f = frames[0];
      $('#vw-info').innerHTML = [['File', kb(buf.byteLength)], ['Image', `${W}×${H}`], ['Frame', `${f.w}×${f.h}`], ['Frames', String(frames.length)], ['From', st.mode === 'gif' ? 'GIF' : st.mode === 'json' ? 'Sheet JSON' : 'Grid']]
        .map(([k, v], i) => `<span class="vw-stat" id="vw-s-${['size', 'img', 'frame', 'frames', 'from'][i]}"><small>${k}</small><b>${esc(v)}</b></span>`).join('');
    }
    function syncCtl() {
      body.querySelectorAll('[data-zoom]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.zoom) === st.zoom)));
      body.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
      const dims = $('#vw-dims'); if (dims) dims.classList.toggle('vw-off', st.mode !== 'grid');
      const tag = $('#vw-tag'); if (tag) tag.classList.toggle('hidden', st.mode !== 'json');
      const pb = $('#vw-play'); pb.innerHTML = ico(st.playing ? I.pause : I.play); pb.setAttribute('aria-label', st.playing ? 'Pause' : 'Play'); pb.dataset.state = st.playing ? 'playing' : 'paused';
      $('#vw-onion').setAttribute('aria-pressed', String(st.onion));
    }
    const step = n => { st.i = (st.i + n + frames.length) % frames.length; draw(); };
    $('#vw-play').onclick = () => { st.playing = !st.playing; last = performance.now(); acc = 0; syncCtl(); };
    $('#vw-prev').onclick = () => { st.playing = false; syncCtl(); step(-1); };
    $('#vw-next').onclick = () => { st.playing = false; syncCtl(); step(1); };
    $('#vw-scrub').oninput = e => { st.playing = false; syncCtl(); st.i = Number(e.target.value) || 0; draw(); };
    $('#vw-fps').oninput = e => { st.fps = Number(e.target.value) || 8; $('#vw-fps-v').textContent = String(st.fps); };
    body.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { st.zoom = Number(b.dataset.zoom); syncCtl(); draw(); });
    $('#vw-onion').onclick = () => { st.onion = !st.onion; syncCtl(); draw(); };
    body.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; st.i = 0; build(); syncCtl(); info(); draw(); });
    const tagSel = $('#vw-tag'); if (tagSel) tagSel.onchange = () => { st.tag = Number(tagSel.value); st.i = 0; build(); info(); draw(); };
    const num = (id, fn) => { const el = $(id); if (el) el.onchange = () => { const v = Math.max(1, Number(el.value) | 0); fn(v); st.mode = 'grid'; st.i = 0; build(); syncInputs(); syncCtl(); info(); draw(); }; };
    const syncInputs = () => { const s = (id, v) => { const el = $(id); if (el) el.value = String(v); }; s('#vw-fw', st.fw); s('#vw-fh', st.fh); s('#vw-cols', Math.max(1, Math.floor(W / st.fw))); s('#vw-rows', Math.max(1, Math.floor(H / st.fh))); };
    num('#vw-fw', v => { st.fw = Math.min(W, v); }); num('#vw-fh', v => { st.fh = Math.min(H, v); });
    num('#vw-cols', v => { st.fw = Math.max(1, Math.floor(W / Math.min(W, v))); }); num('#vw-rows', v => { st.fh = Math.max(1, Math.floor(H / Math.min(H, v))); });
    sc.addEventListener('click', e => { const r = sc.getBoundingClientRect(), z = Number(sc.dataset.z) || 1, x = (e.clientX - r.left) * (sc.width / r.width) / z, y = (e.clientY - r.top) * (sc.height / r.height) / z;
      const ix = frames.findIndex(f => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h); if (ix >= 0) { st.i = ix; st.playing = false; syncCtl(); draw(); } });
    // touch: swipe the stage to step frames
    let sx0 = null; const stg = $('#vw-pstage');
    stg.addEventListener('touchstart', e => { sx0 = e.touches[0].clientX; }, { passive: true });
    stg.addEventListener('touchend', e => { if (sx0 == null) return; const dx = e.changedTouches[0].clientX - sx0; sx0 = null; if (Math.abs(dx) > 40) { st.playing = false; syncCtl(); step(dx < 0 ? 1 : -1); } }, { passive: true });
    const key = e => { if (!root || e.target.closest('input,select,textarea')) return; if (e.key === ' ') { e.preventDefault(); $('#vw-play').click(); } else if (e.key === 'ArrowLeft') $('#vw-prev').click(); else if (e.key === 'ArrowRight') $('#vw-next').click(); };
    document.addEventListener('keydown', key);
    // playback: per-frame GIF delays / JSON durations when they exist and the fps slider is untouched; else the slider
    let raf = 0, last = performance.now(), acc = 0; const fps0 = st.fps;
    const frameMs = () => { if (st.fps === fps0) { if (st.mode === 'gif') return gif.frames[st.i].delay; if (st.mode === 'json' && sheet.durs.length) { const t = sheet.tags[st.tag], ix = (t ? t.from : 0) + st.i; if (sheet.durs[ix]) return sheet.durs[ix]; } } return 1000 / st.fps; };
    const loop = t => { raf = requestAnimationFrame(loop); if (!st.playing || frames.length < 2) { last = t; return; } acc += t - last; last = t; let guard = 0; while (acc >= frameMs() && guard++ < 10) { acc -= frameMs(); st.i = (st.i + 1) % frames.length; draw(); } };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => drawSheet()); ro.observe($('#vw-sheet'));
    syncCtl(); info(); draw();
    body.dataset.ready = '1';
    window.__tribeViewer = { kind: 'sprite', frames: () => frames.length, frame: () => st.i, playing: () => st.playing, zoom: () => st.zoom, mode: () => st.mode, size: [W, H] };
    cleanup = () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('keydown', key); window.__tribeViewer = null; };
  }

  // =====================================================================
  // The code repository's assets, under the pinned repo hero (Docs on desktop and phones)
  // =====================================================================
  let list = null, listAt = 0, listPid = null, listP = null, showAll = false;
  async function loadAssets(force) {
    const pid = C.project && C.project();
    if (!force && list && listPid === pid && Date.now() - listAt < 15000) return list;
    if (listP) return listP;
    listP = C.api('/files').then(r => { list = r; listAt = Date.now(); listPid = pid; return r; }).catch(() => list).finally(() => { listP = null; });
    return listP;
  }
  const row = a => `<div class="vw-arow"><span class="vw-aic k-${a.kind}">${ico(a.kind === 'model' ? I.cube : I.grid, 15)}</span>
      <span class="vw-at"><b title="${esc(a.path)}">${esc(a.path.split('/').pop())}</b><small>${esc(a.path.includes('/') ? a.path.split('/').slice(0, -1).join('/') + '/ · ' : '')}${esc(kb(a.size))}${a.sheet ? ' · sheet' : a.gif ? ' · GIF' : ''}</small></span>
      <button class="btn sm" data-view-path="${esc(a.path)}" data-view-size="${a.size}"${a.sheet ? ` data-view-sheet="${esc(a.sheet)}"` : ''}>View</button></div>`;
  async function assets(slot) {
    if (!slot) return;
    const r = await loadAssets();
    if (!slot.isConnected) return;
    const items = (r && r.assets) || [];
    if (!items.length) { slot.innerHTML = ''; slot.classList.add('hidden'); return; }
    slot.classList.remove('hidden');
    const models = items.filter(a => a.kind === 'model').length, shown = showAll ? items.slice(0, 120) : items.slice(0, 5);
    slot.innerHTML = `<div class="sec-head"><span class="eyebrow">Assets</span><h2>Art &amp; models</h2></div>
      <p class="vw-alead">${models ? `${models} 3D model${models === 1 ? '' : 's'} · ` : ''}${items.length - models} image${items.length - models === 1 ? '' : 's'} in the code repository. View plays sprite sheets and turns models around.</p>
      <div class="vw-alist">${shown.map(row).join('')}</div>
      ${items.length > 5 ? `<button class="linkish vw-amore" data-vw-more>${showAll ? 'Show fewer' : `Show all ${r.more ? `${r.assets.length}+` : items.length}`}</button>` : ''}`;
    const more = slot.querySelector('[data-vw-more]'); if (more) more.onclick = e => { e.stopPropagation(); showAll = !showAll; assets(slot); };
  }
  // the code repository hero calls this after every draw: keep one "Assets" section right after it
  if (window.TribeRepoHero && window.TribeRepoHero.onRender) window.TribeRepoHero.onRender((el, { empty }) => {
    let slot = el.nextElementSibling && el.nextElementSibling.classList.contains('vw-assets') ? el.nextElementSibling : null;
    if (empty) { if (slot) slot.remove(); return; }
    if (!slot) { slot = document.createElement('section'); slot.className = 'vw-assets hidden'; slot.id = el.id === 'doc-repo-hero' ? 'vw-assets-desk' : 'vw-assets-hub'; el.after(slot); }
    assets(slot);
  });
  C.on('project', () => { list = null; showAll = false; });
  C.on('ws', m => { if (m && (m.type === 'repo' || m.type === 'preview')) listAt = 0; });

  // one shared place: any [data-view-path] / [data-view-src] opens a viewer
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-view-path],[data-view-src]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    open({ path: b.dataset.viewPath || undefined, src: b.dataset.viewSrc || undefined, name: b.dataset.viewName || undefined, sheet: b.dataset.viewSheet || undefined, size: Number(b.dataset.viewSize) || undefined });
  }, true);

  window.TribeViewers = { kindOf, open, close, repoUrl, assets, loadAssets };
})();
