/*! Moving backgrounds for websites made in TribeCode (feat/site-3d). Plain JS, no build step, no network.
 *
 * The effects "dots", "horizon", "ribbons", "streams", "rings", "orb", "arc" and "drops" are ports of
 * components from ThreeUI Community, rewritten without React and recoloured to follow the site's own palette:
 *
 *   MIT License. Copyright (c) 2026 Meng To
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 *   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 *   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 *   to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above
 *   copyright notice and this permission notice shall be included in all copies or substantial portions of the
 *   Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 *   LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
 *   SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 *   OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 *   DEALINGS IN THE SOFTWARE.
 *
 * The runtime around them is TribeCode's (MIT).
 *
 * How it works: a section that has a moving background carries data-fx="<kind>" and data-fx-o='{"s":speed,"d":density,
 * "i":intensity,"p":phones 0|1,"a":"#accent","b":"#second"}', and its first child is <div class="fx-layer"> showing a
 * still picture. This script puts a canvas in that layer and draws on it. The words of the section are ordinary HTML
 * above the layer, so they stay selectable. Rules it keeps:
 *   - one animation loop for the whole page; a section that is off screen, or a hidden tab, costs nothing
 *   - "reduce motion" on the device: one still frame, no animation
 *   - no WebGL (or a lost context): the still picture stays
 *   - small phones with p:0: the still picture stays
 *   - the pixel ratio is capped and the canvas never exceeds a pixel budget
 *   - removing the section (or undoing it) frees its canvas and its WebGL context
 * 3D kinds (sphere, dome, constellation, drift, warp) need Three.js: three.min.js and fx3d.js are loaded from the same
 * folder as this file, only when a page uses one of them.
 *   window.TribeFx = { register(kind, def), scan(root?), destroy(el), count(), stats() }
 *   def = { make(canvas, opts) -> { resize(w, h, dpr), draw(t, opts), dispose() } | null, scale?: 0..1 (render scale) }
 */
(function () {
  'use strict';
  if (window.TribeFx) { window.TribeFx.scan(); return; }
  var REG = {}, items = [], raf = 0, last = 0, frames = 0, loading3d = 0;
  var KINDS3D = { sphere: 1, dome: 1, constellation: 1, drift: 1, warp: 1 };
  var me = document.currentScript, BASE = me && me.src ? me.src.replace(/[^/]*$/, '') : '';
  var mq = function (q) { try { return window.matchMedia(q); } catch (e) { return { matches: false }; } };
  var reduce = mq('(prefers-reduced-motion: reduce)'), small = mq('(max-width: 640px)');
  var MAXPX = 1500000, MAXDPR = 1.5;

  function rgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h.slice(0, 6), 16); if (!isFinite(n)) n = 0x888888; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function num(v, d, lo, hi) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function read(el) {
    var o = {}; try { o = JSON.parse(el.getAttribute('data-fx-o') || '{}') || {}; } catch (e) {}
    return { speed: num(o.s, 1, 0, 3), density: num(o.d, 1, 0.3, 2.5), intensity: num(o.i, 1, 0.1, 2), phones: o.p === 0 ? 0 : 1, a: rgb(o.a || '#4263eb'), b: rgb(o.b || o.a || '#111111'), ah: o.a || '#4263eb', bh: o.b || o.a || '#111111' };
  }

  // ---------- one loop ----------
  function tick(now) {
    raf = 0; var dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now; var live = 0;
    for (var i = 0; i < items.length; i++) { var it = items[i]; if (!it.vis || it.still) continue; it.t += dt * it.o.speed; try { it.inst.draw(it.t, it.o); } catch (e) { kill(it); i--; continue; } live++; }
    frames++;
    if (live && !document.hidden) raf = requestAnimationFrame(tick); else last = 0;
  }
  function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); }
  function once(it) { if (!it.inst) return; try { it.inst.draw(it.still ? 8 : it.t, it.o); } catch (e) {} }
  function fit(it) {
    var r = it.layer.getBoundingClientRect(), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    var dpr = Math.min(window.devicePixelRatio || 1, MAXDPR) * (it.def.scale || 1);
    if (w * h * dpr * dpr > MAXPX) dpr = Math.sqrt(MAXPX / (w * h));
    if (w === it.w && h === it.h && dpr === it.dpr) return;
    it.w = w; it.h = h; it.dpr = dpr;
    try { it.inst.resize(w, h, dpr); } catch (e) {}
    once(it);
  }
  var IO = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { var it = find(e.target); if (!it) return; it.vis = e.isIntersecting; if (it.vis) { fit(it); if (it.still) once(it); else wake(); } });
  }, { rootMargin: '80px' }) : null;
  var RO = 'ResizeObserver' in window ? new ResizeObserver(function (es) { es.forEach(function (e) { var it = find(e.target.parentNode); if (it) fit(it); }); }) : null;
  function find(el) { for (var i = 0; i < items.length; i++) if (items[i].el === el) return items[i]; return null; }

  // ---------- mount / unmount ----------
  function layerOf(el) {
    var l = null; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.className && /(^| )fx-layer( |$)/.test(c.className)) { l = c; break; }
    if (!l) { l = document.createElement('div'); l.className = 'fx-layer'; l.setAttribute('aria-hidden', 'true'); el.insertBefore(l, el.firstChild); }
    return l;
  }
  function mount(el) {
    if (find(el)) return; var kind = el.getAttribute('data-fx'), def = REG[kind];
    if (!def) { if (KINDS3D[kind]) load3d(); return; }
    var o = read(el); if (!o.phones && small.matches) return;
    var layer = layerOf(el), canvas = document.createElement('canvas'), inst = null;
    try { inst = def.make(canvas, o); } catch (e) { inst = null; }
    if (!inst) return;                                   // no WebGL here: the still picture stays
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    layer.appendChild(canvas); layer.classList.add('fx-live');
    var it = { el: el, kind: kind, def: def, layer: layer, canvas: canvas, inst: inst, o: o, t: Math.random() * 40, vis: !IO, still: reduce.matches, w: 0, h: 0, dpr: 0 };
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); kill(it); }, false);
    items.push(it); if (IO) IO.observe(el); if (RO) RO.observe(layer);
    fit(it); if (it.vis && !it.still) wake();
  }
  function kill(it) {
    var i = items.indexOf(it); if (i < 0) return; items.splice(i, 1);
    try { if (IO) IO.unobserve(it.el); if (RO) RO.unobserve(it.layer); } catch (e) {}
    try { it.inst.dispose(); } catch (e) {}
    if (it.canvas.parentNode) it.canvas.parentNode.removeChild(it.canvas);
    it.layer.classList.remove('fx-live');
  }
  function scan(root) {
    var els = (root && root.querySelectorAll ? root : document).querySelectorAll('[data-fx]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
    if (root && root.getAttribute && root.getAttribute('data-fx')) mount(root);
  }
  function sweep() { for (var i = items.length - 1; i >= 0; i--) { var it = items[i]; if (!document.documentElement.contains(it.el) || !it.el.getAttribute('data-fx')) kill(it); else if (it.el.getAttribute('data-fx') !== it.kind) { kill(it); mount(it.el); } } }
  function load3d() {
    if (loading3d || !BASE) return; loading3d = 1;
    var add = function (src, next) { var s = document.createElement('script'); s.src = BASE + src; s.onload = next; s.onerror = function () { loading3d = 2; }; document.head.appendChild(s); };
    if (window.THREE) add('fx3d.js'); else add('three.min.js', function () { add('fx3d.js'); });
  }

  if ('MutationObserver' in window) new MutationObserver(function (ms) {
    var gone = false, came = false;
    ms.forEach(function (m) {
      if (m.type === 'attributes') { var it = find(m.target); if (it && m.attributeName === 'data-fx-o') { it.o = read(it.el); once(it); if (!it.still && it.vis) wake(); } else gone = came = true; return; }
      if (m.removedNodes.length) gone = true; if (m.addedNodes.length) came = true;
    });
    if (gone) sweep(); if (came) scan();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-fx', 'data-fx-o'] });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
  var onMotion = function () { items.forEach(function (it) { it.still = reduce.matches; once(it); }); if (!reduce.matches) wake(); };
  if (reduce.addEventListener) reduce.addEventListener('change', onMotion);
  if (small.addEventListener) small.addEventListener('change', function () { items.slice().forEach(function (it) { if (!it.o.phones && small.matches) kill(it); }); scan(); });
  window.addEventListener('pagehide', function () { items.slice().forEach(kill); });

  // ---------- helpers for effects ----------
  // a full-canvas fragment shader. Uniforms every shader gets: R (size in px), T (seconds), P (pixel ratio), D (density),
  // I (intensity), A and B (the two colours). Output is premultiplied alpha, so the section's own background shows through.
  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var HEAD = 'precision highp float;uniform vec2 R;uniform float T;uniform float P;uniform float D;uniform float I;uniform vec3 A;uniform vec3 B;\n';
  function shader(frag, scale) {
    return { scale: scale || 1, make: function (canvas) {
      var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); if (!gl) return null;
      var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
      var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, HEAD + frag)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(pr); var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      var U = {}; ['R', 'T', 'P', 'D', 'I', 'A', 'B'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
      var dpr = 1;
      return {
        resize: function (w, h, d) { dpr = d; canvas.width = Math.max(1, Math.round(w * d)); canvas.height = Math.max(1, Math.round(h * d)); gl.viewport(0, 0, canvas.width, canvas.height); },
        draw: function (t, o) { gl.uniform2f(U.R, canvas.width, canvas.height); gl.uniform1f(U.T, t); gl.uniform1f(U.P, dpr); gl.uniform1f(U.D, o.density); gl.uniform1f(U.I, o.intensity); gl.uniform3fv(U.A, o.a); gl.uniform3fv(U.B, o.b); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); },
        dispose: function () { try { gl.deleteProgram(pr); gl.deleteBuffer(buf); var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) {} }
      };
    } };
  }
  function flat(setup) {       // a 2D canvas effect: setup(ctx) -> { resize(w, h, dpr), draw(t, o) }
    return { make: function (canvas) { var ctx = canvas.getContext('2d'); if (!ctx) return null; var fx = setup(ctx, canvas); return { resize: function (w, h, d) { canvas.width = Math.max(1, Math.round(w * d)); canvas.height = Math.max(1, Math.round(h * d)); fx.resize(canvas.width, canvas.height, d); }, draw: fx.draw, dispose: function () { canvas.width = canvas.height = 1; } }; } };
  }
  var css = function (c, a) { return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + a + ')'; };
  var OUT = 'void put(vec3 c,float a){a=clamp(a,0.,1.);gl_FragColor=vec4(c*a,a);}\n';

  // ---------- the shader effects ----------
  // Pulsing dots (after "Dot Matrix")
  REG.dots = shader(OUT + 'void main(){vec2 uv=gl_FragCoord.xy/R.xy;float asp=R.x/R.y;vec2 g=gl_FragCoord.xy/(20.*P/D);vec2 f=fract(g)-.5;vec2 id=floor(g);' +
    'float pulse=sin(T*.5+id.x*.09+id.y*.07)*.5+.5;float rad=.08+pulse*.17;float al=smoothstep(rad,rad-.06,length(f));' +
    'float fade=smoothstep(1.25,.1,length(vec2((uv.x-.5)*asp,uv.y-.5)));put(mix(B,A,pulse),al*fade*(.22+.5*pulse)*I);}');

  // Glowing horizon (after "Emerald Horizon"): light rising from the bottom edge
  REG.horizon = shader(OUT + 'float hash(float n){return fract(sin(n)*1e4);}float noise(float x){float i=floor(x);float f=fract(x);float u=f*f*(3.-2.*f);return mix(hash(i),hash(i+1.),u);}' +
    'void main(){vec2 st=gl_FragCoord.xy/R.xy;float w=(sin(st.x*3.*D+T*.5)*.1+sin(st.x*5.*D-T*.3)*.05);float k=smoothstep(.55,-.1,st.y+w);' +
    'float v=noise(st.x*2.*D+T*.1)*.5+.5;k*=v*1.5;vec3 c=mix(A,B,clamp(st.x+sin(T*.2)*.5,0.,1.));float vg=smoothstep(1.2,.5,length(st-vec2(.5,0.)));put(c,pow(k,1.5)*.75*vg*I);}');

  // Ribbons of light (after "Ribbon Field")
  REG.ribbons = shader(OUT + 'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}' +
    'float rib(vec2 uv,float off,float w,float ph){float y=.55+.20*sin(uv.x*2.15+ph)+.045*sin(uv.x*7.-ph*.7);float d=abs(uv.y-y-off);return exp(-(d*d)/w);}' +
    'void main(){vec2 uv=gl_FragCoord.xy/R.xy;float t=T*.22;float r1=rib(uv,.03,.0065,t+.9);float r2=rib(uv,-.23,.0085,t+3.25);float r3=rib(uv,.25,.014,t+1.85);' +
    'float glow=r1*1.14+r2*1.05+r3*.48;vec3 c=(A*r1+mix(A,B,.6)*r2+B*r3)/max(.001,r1+r2+r3);float cell=7.*P/D;vec2 g=fract(gl_FragCoord.xy/cell)-.5;' +
    'float dotS=smoothstep(.36,.12,length(g));float n=hash(floor(gl_FragCoord.xy/cell));float scan=.72+.28*sin((uv.x+uv.y)*38.+T*1.3);' +
    'float a=clamp(glow*1.4,0.,1.)*dotS*(.5+.5*n)*scan;put(c,a*.9*I);}');

  // Flowing streams (after "Stream Convergence")
  REG.streams = shader(OUT + 'mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}' +
    'void main(){vec2 v=gl_FragCoord.xy/R.xy;vec2 p=v*2.-1.;p.x*=R.x/R.y;p=rot(.55)*p;vec3 c=vec3(0.);float a=0.;float spread=.07;' +
    'for(int i=0;i<3;i++){float off=float(1-i)*spread;float y=p.y+off+sin(p.x*2.5-T*1.5)*.12;float w=smoothstep(.85,.99,sin(y*6.*D+T*2.)*.5+.5);' +
    'vec3 k=i==0?A:(i==1?mix(A,B,.5):B);c+=k*w;a+=w;}c/=max(a,.001);float vg=exp(-length(p)*.55);put(c,clamp(a,0.,1.)*vg*.85*I);}');

  // Ringing bell (after "Bell Field"): the standing-wave pattern of a struck bell, quiet in the middle for the words
  REG.rings = shader(OUT + 'float bess(float x){return cos(x-.785398)/sqrt(1.+abs(x));}' +
    'void main(){vec2 uv=gl_FragCoord.xy/R.xy;vec2 p=uv*2.-1.;p.x*=R.x/R.y;float t=T*.09;float r=length(p);float a=atan(p.y,p.x);' +
    'float ang=3.+1.6*sin(t*.37)+sin(t*.19+1.7);float k=(3.1+sin(t*.23+.6))*D;float f1=bess(r*k*3.14159-t*2.2)*cos(ang*a+t*.5);' +
    'float f2=bess(r*k*1.6*3.14159+t*1.4)*cos((ang*2.+1.)*a-t*.31);float f=(f1+f2*.3)*1.3;float node=1.-smoothstep(0.,.075+.075*r,abs(f));' +
    'float anti=smoothstep(.4,.95,abs(f));float open=smoothstep(.14,.92,r);node*=open;anti*=open;float edge=mix(.1,1.,smoothstep(2.2,.28,r));' +
    'float al=node*.55+anti*.22;put(mix(A,B,anti/(node+anti+.001)),al*edge*I);}');

  // Glowing orb (after "Energy Orb"): a sphere of slow smoke with a soft rim
  REG.orb = shader(OUT + 'float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}' +
    'float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}' +
    'float fbm(vec3 p){float v=0.;float a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec3(1.7);a*=.5;}return v;}' +
    'void main(){vec2 uv=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);if(R.x>R.y*1.3)uv.x-=.42*R.x/R.y*.5;float r=length(uv);float RR=.34;if(r<RR){float z=sqrt(RR*RR-r*r);vec3 n=normalize(vec3(uv,z));float ca=T*.15;' +
    'mat3 ro=mat3(cos(ca),0.,sin(ca),0.,1.,0.,-sin(ca),0.,cos(ca));vec3 sp=ro*n;float f1=fbm(sp*2.6*D+vec3(0.,T*.12,0.));float f2=fbm(sp*4.5*D-vec3(T*.08,0.,T*.05)+f1*1.8);' +
    'float veil=smoothstep(.35,.75,f2);vec3 c=mix(B,A,clamp(f1*1.1+veil*.5,0.,1.));float fres=pow(1.-z/RR,2.2);c=mix(c,vec3(1.),clamp(fres*.55+veil*.15,0.,.7));put(c,(.5+.5*clamp(f1+fres,0.,1.))*min(1.,I));}' +
    'else{put(A,clamp(exp(-(r-RR)*14.),0.,1.)*.6*I);}}');

  // ---------- the 2D canvas effects ----------
  // Pixel arc (after "Data Pixel Arc"): small squares that light up along a wide arc
  REG.arc = flat(function (ctx) {
    var W = 1, H = 1, dpr = 1;
    return { resize: function (w, h, d) { W = w; H = h; dpr = d; }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var px = Math.max(4, Math.round(9 * dpr / o.density)), cols = Math.ceil(W / px), rows = Math.ceil(H / px), cy = H * 0.4, drop = H * 0.9, th = H * 0.35, a = o.a, b = o.b, tt = t * 1.2;
      for (var x = 0; x < cols; x++) { var X = x * px, nx = X / W * 2 - 1, curve = cy + Math.pow(Math.abs(nx), 1.8) * drop, side = Math.max(0, 1 - Math.pow(Math.abs(nx), 2.5)); if (side <= 0.02) continue; var w1 = Math.sin(nx * 4 - tt * 1.5) * 0.1;
        for (var y = Math.max(0, Math.floor((curve - th) / px)), y2 = Math.min(rows, Math.ceil((curve + th) / px)); y < y2; y++) { var Y = y * px, k = Math.max(0, 1 - Math.abs(Y - curve) / th); if (k <= 0.01) continue; k = Math.max(0, Math.min(1, k + w1 + Math.cos(Y * 0.01 / dpr + tt) * 0.1)) * side; if (k <= 0.03) continue;
          var m = k * k; ctx.fillStyle = css([b[0] + (a[0] - b[0]) * m, b[1] + (a[1] - b[1]) * m, b[2] + (a[2] - b[2]) * m], Math.min(1, k * 0.85 * o.intensity).toFixed(3)); ctx.fillRect(X, Y, px - Math.max(1, Math.round(dpr)), px - Math.max(1, Math.round(dpr))); } }
    } };
  });

  // Water drops (after "Condensation"): drops gather, grow, run down and leave a ripple
  REG.drops = flat(function (ctx) {
    var W = 1, H = 1, dpr = 1, drops = [], rings = [], lastT = 0, cascade = 0, max = 100, seed = 7;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed & 0xfffffff) / 0x10000000; };
    var add = function (head) { var m = 8 * dpr; drops.push({ x: m + rnd() * Math.max(1, W - m * 2), y: m + rnd() * Math.max(1, H - m * 2), r: (0.8 + (head || 0) * 1.6) * dpr, rMax: (3.5 + rnd() * 5.5) * dpr, grow: (0.25 + rnd() * 0.4) * dpr, run: false, vy: 0 }); };
    return { resize: function (w, h, d) { W = w; H = h; dpr = d; drops = []; rings = []; seed = 7; max = Math.max(50, Math.min(200, Math.round(W * H / (d * d) / 6500))); for (var i = 0; i < max * 0.6; i++) add(rnd() * 3); lastT = 0; },
      draw: function (t, o) {
        var dt = lastT ? Math.max(0, Math.min(0.05, t - lastT)) : 0.016, k = dt * 60; lastT = t; var cap = Math.round(max * o.density), i, j, d2, o2;
        if (drops.length < cap && rnd() < 0.34 * k) add();
        if (t - cascade > 6.4) { cascade = t; drops.filter(function (q) { return !q.run; }).sort(function (p, q) { return q.r - p.r; }).slice(0, 3).forEach(function (q) { q.run = true; q.vy = 0.35 * dpr; }); }
        for (i = drops.length - 1; i >= 0; i--) { d2 = drops[i]; if (!d2) continue;
          if (!d2.run) { d2.r += d2.grow * dt; if (d2.r >= d2.rMax) { d2.run = true; d2.vy = 0.3 * dpr; } continue; }
          d2.vy = Math.min(d2.vy + 0.075 * dpr * k, 5.4 * dpr); d2.y += d2.vy * k;
          for (j = drops.length - 1; j >= 0; j--) { o2 = drops[j]; if (o2 === d2 || o2.run) continue; if (Math.abs(o2.x - d2.x) < d2.r + o2.r + 1.5 * dpr && o2.y > d2.y - d2.r && o2.y < d2.y + d2.vy + d2.r) { d2.r = Math.sqrt(d2.r * d2.r + o2.r * o2.r); drops.splice(j, 1); if (j < i) i--; } }
          if (d2.y >= H - 2 * dpr) { rings.push({ x: d2.x, r: d2.r, born: t }); drops.splice(i, 1); } }
        rings = rings.filter(function (s) { return t - s.born < 0.76; });
        ctx.clearRect(0, 0, W, H); var al = Math.min(1, o.intensity);
        for (i = 0; i < drops.length; i++) { d2 = drops[i]; var lit = Math.min(1, d2.r / (9 * dpr));
          ctx.fillStyle = css(o.a, ((0.28 + lit * 0.3) * al).toFixed(3)); ctx.beginPath(); ctx.arc(d2.x, d2.y, d2.r, 0, 6.2832); ctx.fill();
          ctx.strokeStyle = css(o.b, ((0.45 + lit * 0.35) * al).toFixed(3)); ctx.lineWidth = 0.9 * dpr; ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,' + ((0.3 + lit * 0.3) * al).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(d2.x - d2.r * 0.32, d2.y - d2.r * 0.36, Math.max(0.45 * dpr, d2.r * 0.24), 0, 6.2832); ctx.fill(); }
        for (i = 0; i < rings.length; i++) { var s = rings[i], pr = (t - s.born) / 0.76, rr = s.r + pr * 16 * dpr; ctx.strokeStyle = css(o.b, ((1 - pr) * 0.5 * al).toFixed(3)); ctx.lineWidth = 1.1 * dpr; ctx.beginPath(); ctx.ellipse(s.x, H - 2 * dpr, rr, rr * 0.34, 0, 0, 6.2832); ctx.stroke(); }
      } };
  });

  window.TribeFx = {
    register: function (kind, def) { REG[kind] = def; }, scan: scan, kinds: function () { return Object.keys(REG); },
    destroy: function (el) { var it = find(el); if (it) kill(it); }, count: function () { return items.length; },
    stats: function () { return { items: items.length, frames: frames, running: !!raf, live: items.filter(function (it) { return it.vis && !it.still; }).length, still: reduce.matches, kinds: items.map(function (it) { return it.kind; }), size: items.map(function (it) { return [it.canvas.width, it.canvas.height]; }) }; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(); }); else scan();
})();
