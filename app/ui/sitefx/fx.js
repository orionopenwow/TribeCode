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
  var REG = {}, items = [], raf = 0, last = 0, frames = 0, loading3d = 0, CLOCK = {};
  var KINDS3D = { sphere: 1, dome: 1, constellation: 1, drift: 1, warp: 1 };
  var me = document.currentScript, BASE = me && me.src ? me.src.replace(/[^/]*$/, '') : '';
  var mq = function (q) { try { return window.matchMedia(q); } catch (e) { return { matches: false }; } };
  var reduce = mq('(prefers-reduced-motion: reduce)'), small = mq('(max-width: 640px)');
  var MAXPX = 1500000, MAXDPR = 1.5;

  function rgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h.slice(0, 6), 16); if (!isFinite(n)) n = 0x888888; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function num(v, d, lo, hi) { v = +v; return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function read(el) {
    var o = {}; try { o = JSON.parse(el.getAttribute('data-fx-o') || '{}') || {}; } catch (e) {}
    return { speed: num(o.s, 1, 0, 3), density: num(o.d, 1, 0.3, 2.5), intensity: num(o.i, 1, 0.1, 2), phones: o.p === 0 ? 0 : 1, a: rgb(o.a || '#4263eb'), b: rgb(o.b || o.a || '#111111'), ah: o.a || '#4263eb', bh: o.b || o.a || '#111111', m: o.m && typeof o.m === 'object' ? o.m : null };
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
    if (!def) { if (KINDS3D[kind] && hasGL()) load3d(); return; }   // no WebGL: Three.js is not even fetched
    if (kind === 'motion' && !window.TribeMotionKit) { loadMotion(); return; }   // feat/motion: the engine first, then this section mounts
    var o = read(el); if (!o.phones && small.matches) return;
    var layer = layerOf(el), canvas = document.createElement('canvas'), inst = null;
    try { inst = def.make(canvas, o); } catch (e) { inst = null; }
    if (!inst) return;                                   // no WebGL here: the still picture stays
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    layer.appendChild(canvas); layer.classList.add('fx-live');
    var key = kind + '|' + (el.id || ''), it = { el: el, kind: kind, key: key, def: def, layer: layer, canvas: canvas, inst: inst, o: o, t: CLOCK[key] != null ? CLOCK[key] : 20 + Math.random() * 20, vis: !IO, still: reduce.matches, w: 0, h: 0, dpr: 0 };
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); kill(it); }, false);
    items.push(it); if (IO) IO.observe(el); if (RO) RO.observe(layer);
    fit(it); if (it.vis && !it.still) wake();
  }
  function kill(it) {
    var i = items.indexOf(it); if (i < 0) return; items.splice(i, 1); CLOCK[it.key] = it.t;   // a section that comes back (an edit redraws the page) carries on where it was
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
  var gl0, hasGL = function () { if (gl0 === undefined) { try { var c = document.createElement('canvas'), g = c.getContext('webgl') || c.getContext('experimental-webgl'); gl0 = !!g; var x = g && g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { gl0 = false; } } return gl0; };
  var loadingMo = 0;
  function loadMotion() {
    if (loadingMo || !BASE) return; loadingMo = 1;
    var s = document.createElement('script'); s.src = BASE + 'motionkit.js'; s.onload = function () { scan(); };
    s.onerror = function () { if (/\/sitefx\/$/.test(BASE)) { var s2 = document.createElement('script'); s2.src = BASE + '../motionkit.js'; s2.onload = function () { scan(); }; document.head.appendChild(s2); } };
    document.head.appendChild(s);
  }
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

  // ---------- a Motion Studio piece (feat/motion): the engine draws it, covering the section ----------
  REG.motion = { make: function (canvas, o) {
    var K = window.TribeMotionKit, g = canvas.getContext('2d'); if (!K || !g || !o.m) return null;
    var d = K.normalize(o.m); K.load(d);
    return {
      resize: function (w, h, dpr) { canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr)); },
      draw: function (t) { var s = Math.max(canvas.width / d.size.w, canvas.height / d.size.h); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); g.translate((canvas.width - d.size.w * s) / 2, (canvas.height - d.size.h * s) / 2); g.scale(s, s); K.draw(g, d, t, { blur: 0 }); },
      dispose: function () {}
    };
  } };

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
    return { resize: function (w, h, d) { W = w; H = h; dpr = d; drops = []; rings = []; seed = 7; max = Math.max(50, Math.min(200, Math.round(W * H / (d * d) / 6500))); for (var i = 0; i < max * 0.7; i++) add(rnd() * 4); lastT = 0; },
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

  // ---------- more backgrounds (feat/asset-libs): drawn for TribeCode, no code from other catalogues ----------
  var NZ = 'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}' +
    'float vn(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}' +
    'float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*vn(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return v;}' +
    'float vig(vec2 uv){return smoothstep(1.3,.25,length(uv-.5));}\n';
  var SH = function (body, scale) { return shader(OUT + NZ + body, scale); };

  // Aurora: soft curtains of light near the top
  REG.aurora = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float x=uv.x*3.*D;float t=T*.15;float band=0.;for(int i=0;i<3;i++){float fi=float(i);float cy=.62+.1*fi+.07*sin(x*1.3+t*2.+fi)+.1*(fbm(vec2(x*.8+fi*3.,t))-.5);float d=uv.y-cy;band+=exp(-d*d*140.)*(.55+.45*sin(x*5.+t*3.+fi*2.));float k=cy-uv.y;band+=smoothstep(0.,.3,k)*exp(-k*7.)*.4*fbm(vec2(x*4.,t*2.+fi));}put(mix(A,B,uv.x),clamp(band,0.,1.)*.75*I);}', 0.6);
  // Horizon grid: a floor of lines running toward you
  REG.grid = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float hz=.46;if(uv.y>hz){put(A,0.);return;}float y=hz-uv.y;float z=.4/max(y,.002);float x=(uv.x-.5)*z*R.x/R.y*8.*D;float gx=fract(x);float gz=fract(z*D*1.2-T*.5);float wx=clamp(1.6*P*z*8.*D/R.y,.012,.45);float wz=clamp(1.6*P*.48*D/(y*y)/R.y,.012,.48);float l=max(1.-smoothstep(0.,wx,min(gx,1.-gx)),1.-smoothstep(0.,wz,min(gz,1.-gz)));float fade=smoothstep(0.,.12,y);float hl=exp(-y*R.y/P*.15);put(mix(B,A,clamp(y/hz*1.6,0.,1.)),clamp(l*fade*.75+hl*.5,0.,1.)*I);}');
  // Contour lines: a slow map of hills
  REG.contour = SH('void main(){vec2 uv=gl_FragCoord.xy/R;uv.x*=R.x/R.y;float n=fbm(uv*2.2*D+vec2(T*.04,T*.025));float v=n*12.;float f=fract(v);float l=1.-smoothstep(0.,.09,min(f,1.-f));float maj=step(.8,fract(floor(v)*.2+.1));put(mix(B,A,n),l*(.3+.35*maj)*I);}');
  // Blobs: soft shapes that drift and merge
  REG.blobs = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float asp=R.x/R.y;vec2 p=vec2(uv.x*asp,uv.y);float f=0.;vec3 col=vec3(0.);for(int i=0;i<5;i++){float fi=float(i);vec2 c=vec2(asp*(.5+.38*sin(T*.21*(1.+fi*.17)+fi*1.7)),.5+.32*cos(T*.17*(1.+fi*.13)+fi*2.3));float r=(.16+.04*fi)/D;float k=r*r/max(dot(p-c,p-c),1e-4);f+=k;col+=mix(A,B,fi/4.)*k;}col/=max(f,1e-4);put(col,smoothstep(.9,1.5,f)*.8*I);}', 0.6);
  // Wave lines: thin lines rolling like a calm sea
  REG.waves = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float a=0.;vec3 c=vec3(0.);for(int i=0;i<7;i++){float fi=float(i);float y=.18+fi*.1+.04*sin(uv.x*(3.+fi*.6)*D+T*(.4+fi*.07)+fi)+.02*sin(uv.x*11.-T*.8+fi*2.);float d=abs(uv.y-y)*R.y/P;float l=1.-smoothstep(.6,1.8,d);a+=l;c+=mix(A,B,fi/6.)*l;}c/=max(a,1e-3);put(c,clamp(a,0.,1.)*.7*I);}');
  // Pool light: the moving light on the floor of a pool
  REG.caustics = SH('float w(vec2 p,float t){return sin(p.x+sin(p.y*1.3+t)*1.2+t*.7)+sin(p.y*1.1+sin(p.x*.9-t*.8)*1.4-t*.5);}void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=uv*vec2(R.x/R.y,1.)*7.*D;float t=T*.6;float v=pow(1.-abs(w(p,t))*.5,7.)+pow(1.-abs(w(p*1.7+3.,t*1.2))*.5,9.)*.6;put(mix(B,A,clamp(v,0.,1.)),clamp(v,0.,1.)*.6*vig(uv)*I);}', 0.7);
  // Halftone: printed dots that swell and shrink
  REG.halftone = SH('void main(){float cell=10.*P/D;vec2 g=gl_FragCoord.xy/cell;vec2 id=floor(g);vec2 f=fract(g)-.5;vec2 uv=id*cell/R;float n=fbm(uv*vec2(R.x/R.y,1.)*2.5+vec2(T*.08,-T*.05));float r=.5*smoothstep(.3,.75,n);put(mix(B,A,n),smoothstep(r,r-.08,length(f))*.75*I);}');
  // Sliding stripes
  REG.stripes = SH('void main(){vec2 p=gl_FragCoord.xy/P;vec2 uv=gl_FragCoord.xy/R;float s=(p.x+p.y)/(26./D)-T*.4;float f=fract(s);float a=smoothstep(0.,.04,f)*smoothstep(.5,.46,f);put(mix(A,B,step(.5,fract(s*.5))),a*.32*vig(uv)*I);}');
  // Cells: a living pattern of cells
  REG.cells = SH('vec2 h22(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=vec2(uv.x*R.x/R.y,uv.y)*4.*D;vec2 i=floor(p);vec2 f=fract(p);float d1=8.;float d2=8.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=h22(i+g);o=.5+.5*sin(T*.4+6.2831*o);float d=length(g+o-f);if(d<d1){d2=d1;d1=d;}else if(d<d2){d2=d;}}float e=1.-smoothstep(0.,.05,d2-d1);put(mix(B,A,d1),(e*.65+(1.-d1)*.08)*I);}');
  // Sunburst: slow rays rising from below
  REG.sunburst = SH('void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=uv-vec2(.5,-.1);p.x*=R.x/R.y;float a=atan(p.y,p.x);float r=length(p);float rays=smoothstep(.55,.9,sin(a*14.*D+T*.3)*.5+.5);put(mix(A,B,r),rays*smoothstep(1.4,.2,r)*.42*I);}');
  // Spiral arms turning
  REG.spiral = SH('void main(){vec2 p=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);float r=length(p);float a=atan(p.y,p.x);float s=sin(a*3.+log(r+1e-3)*6.*D-T*.8);put(mix(A,B,clamp(r*1.5,0.,1.)),smoothstep(.6,.95,s)*smoothstep(.05,.2,r)*smoothstep(1.,.3,r)*.5*I);}');
  // Tunnel of rings moving toward you
  REG.tunnel = SH('void main(){vec2 p=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);float r=length(p);float z=.3/max(r,.01)+T*.6;float f=fract(z*D);float l=1.-smoothstep(0.,.1,min(f,1.-f));put(mix(B,A,fract(z*.25)),l*smoothstep(.03,.25,r)*smoothstep(1.2,.4,r)*.55*I);}');
  // Dunes: layered hills at sunset
  REG.dunes = SH('void main(){vec2 uv=gl_FragCoord.xy/R;vec3 c=A;float a=0.;float got=0.;for(int i=0;i<4;i++){float fi=float(i);float h=.16+fi*.12+.06*sin(uv.x*(2.+fi)*D+T*.05*(fi+1.)+fi*1.3)+.025*sin(uv.x*7.*D+fi*4.+T*.08);if(got<.5&&uv.y<h){c=mix(A,B,fi/3.);a=.62-.13*fi;got=1.;}}put(c,a*I);}');
  // Clouds drifting by
  REG.clouds = SH('void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=uv*vec2(R.x/R.y,1.)*2.*D;float n=fbm(p+vec2(T*.04,0.));n=smoothstep(.45,.8,n+.15*fbm(p*2.-T*.03));put(mix(B,A,uv.y),n*.6*I);}', 0.6);
  // Ink: swirls like ink in water
  REG.ink = SH('void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=uv*vec2(R.x/R.y,1.)*2.5*D;vec2 q=vec2(fbm(p+T*.05),fbm(p+vec2(5.2,1.3)-T*.04));vec2 r=vec2(fbm(p+3.*q+vec2(1.7,9.2)+T*.03),fbm(p+3.*q+vec2(8.3,2.8)));float f=fbm(p+3.*r);put(mix(B,A,clamp(f*f*2.,0.,1.)),smoothstep(.35,.85,f)*.7*I);}', 0.5);
  // Marble veins
  REG.marble = SH('void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=uv*vec2(R.x/R.y,1.)*3.*D;float n=fbm(p*.8+T*.02);float v=abs(sin(p.x*1.5+p.y*.7+n*6.+T*.05));put(mix(A,B,n),((1.-smoothstep(0.,.12,v))*.6+.05)*I);}', 0.7);
  // Scanlines with a slow bright band
  REG.scanlines = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float ln=step(.5,fract(gl_FragCoord.y/(4.*P/D)));float band=exp(-pow((uv.y-fract(T*.08))*8.,2.));float n=h21(floor(gl_FragCoord.xy/(2.*P))+floor(T*12.));put(mix(B,A,band),(ln*.1+band*.35*ln+n*.04)*I);}');
  // Tiles of quarter circles that flip now and then
  REG.truchet = SH('void main(){float s=48.*P/D;vec2 g=gl_FragCoord.xy/s;vec2 id=floor(g);vec2 f=fract(g);float h=h21(id);if(fract(h+floor(T*.15+h*3.)*.5)>.5)f.x=1.-f.x;float d=min(abs(length(f)-.5),abs(length(f-1.)-.5));vec2 uv=gl_FragCoord.xy/R;put(mix(A,B,uv.x),(1.-smoothstep(.03,.06,d))*.5*vig(uv)*I);}');
  // Honeycomb that pulses outward
  REG.hexes = SH('vec4 hx(vec2 p){vec2 r=vec2(1.,1.732);vec2 h=r*.5;vec2 a=mod(p,r)-h;vec2 b=mod(p-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;return vec4(g,p-g);}void main(){vec2 uv=gl_FragCoord.xy/R;vec4 h=hx(gl_FragCoord.xy/(26.*P/D));vec2 g=abs(h.xy);float e=max(dot(g,normalize(vec2(1.,1.732))),g.x);float pulse=.5+.5*sin(T*.8-length(h.zw)*.25);float l=smoothstep(.5,.46,e)-smoothstep(.46,.42,e);put(mix(B,A,pulse),(l*.55*pulse+.03)*vig(uv)*I);}');
  // Plus signs in a travelling wave
  REG.plus = SH('void main(){float s=22.*P/D;vec2 g=gl_FragCoord.xy/s;vec2 id=floor(g);vec2 f=fract(g)-.5;float w=.5+.5*sin(T*1.2-(id.x+id.y)*.35);float L=.18+.14*w;float t=.035;float pl=max(step(abs(f.x),t)*step(abs(f.y),L),step(abs(f.y),t)*step(abs(f.x),L));vec2 uv=gl_FragCoord.xy/R;put(mix(B,A,w),pl*(.22+.5*w)*vig(uv)*I);}');
  // Crosshatch, like a pencil sketch of the light
  REG.hatch = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float n=fbm(uv*vec2(R.x/R.y,1.)*2.*D+T*.04);vec2 p=gl_FragCoord.xy/P;float l1=1.-smoothstep(.7,1.5,abs(mod(p.x+p.y,9.)-4.5));float l2=1.-smoothstep(.7,1.5,abs(mod(p.x-p.y,9.)-4.5));put(mix(B,A,n),clamp(l1*smoothstep(.35,.5,n)+l2*smoothstep(.55,.7,n),0.,1.)*.42*I);}');
  // Checkerboard turning slowly
  REG.checker = SH('void main(){vec2 p=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);float a=T*.05;p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;vec2 g=floor(p*8.*D);float c=mod(g.x+g.y,2.);put(mix(A,B,c),c*.2*smoothstep(.9,.1,length(p))*I);}');
  // Colour fields: three soft pools of colour that wander
  REG.colorfield = SH('void main(){vec2 uv=gl_FragCoord.xy/R;vec2 c1=vec2(.3+.2*sin(T*.13),.4+.2*cos(T*.11));vec2 c2=vec2(.7+.2*cos(T*.09),.6+.2*sin(T*.15));vec2 c3=vec2(.5+.3*sin(T*.07+2.),.2+.15*cos(T*.12));float w1=exp(-dot(uv-c1,uv-c1)*6.*D);float w2=exp(-dot(uv-c2,uv-c2)*6.*D);float w3=exp(-dot(uv-c3,uv-c3)*8.*D);vec3 c=(A*w1+B*w2+mix(A,B,.5)*w3)/max(w1+w2+w3,1e-3);put(c,clamp(w1+w2+w3,0.,1.)*.55*I);}', 0.5);
  // Ridge lines: stacked lines with a mountain in the middle
  REG.ridges = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float a=0.;for(int i=0;i<14;i++){float fi=float(i);float y=.12+fi*.055+exp(-pow((uv.x-.5)*3.,2.))*fbm(vec2(uv.x*6.*D,fi*1.7+T*.15))*.12;float d=abs(uv.y-y)*R.y/P;a+=1.-smoothstep(.5,1.5,d);}put(mix(B,A,uv.y),clamp(a,0.,1.)*.7*I);}');
  // Radar sweep
  REG.radar = SH('void main(){vec2 p=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);float r=length(p);float a=atan(p.y,p.x);float sw=mod(a-T*.8,6.2832)/6.2832;float inside=step(r,.48);float trail=pow(1.-sw,6.)*inside;float d=abs(fract(r*8.*D+.5)-.5)/(8.*D);float rings=(1.-smoothstep(0.,1.5*P/min(R.x,R.y),d))*inside;put(mix(B,A,trail),clamp(trail*.55+rings*.2,0.,1.)*I);}');
  // Bokeh: soft out-of-focus lights
  REG.bokeh = SH('void main(){vec2 uv=gl_FragCoord.xy/R;vec2 p=vec2(uv.x*R.x/R.y,uv.y);float a=0.;vec3 c=vec3(0.);for(int i=0;i<12;i++){float fi=float(i);vec2 o=vec2(h21(vec2(fi,1.3))*R.x/R.y,fract(h21(vec2(fi,7.1))+T*.02*(.5+h21(vec2(fi,3.)))));float r=(.04+.08*h21(vec2(fi,9.)))/D;float k=smoothstep(r,r*.85,length(p-o))*(.3+.25*sin(T*.5+fi));a+=k;c+=mix(A,B,h21(vec2(fi,5.)))*k;}c/=max(a,1e-3);put(c,clamp(a,0.,1.)*.6*I);}');
  // Film grain with a soft vignette
  REG.grain = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float n=h21(gl_FragCoord.xy/P+floor(T*18.)*vec2(7.,13.));float sh=.5+.5*sin(uv.x*3.+T*.3);put(mix(B,A,sh),(n*.16*D+vig(uv)*.1)*I);}');
  // Chevrons sliding up
  REG.zigzag = SH('void main(){vec2 p=gl_FragCoord.xy/(30.*P/D);float y=p.y+abs(fract(p.x)-.5)-T*.25;float f=fract(y);vec2 uv=gl_FragCoord.xy/R;put(mix(A,B,uv.y),smoothstep(0.,.06,f)*smoothstep(.22,.16,f)*.42*vig(uv)*I);}');
  // Circuit: traces with pulses running along them
  REG.circuit = SH('void main(){float s=28.*P/D;vec2 g=gl_FragCoord.xy/s;vec2 id=floor(g);vec2 f=fract(g);float h=h21(id);float hor=step(.5,h);float d=hor>.5?abs(f.y-.5):abs(f.x-.5);float line=(1.-smoothstep(.03,.07,d))*step(.35,h21(id+3.1));float along=hor>.5?f.x:f.y;float k=fract(T*.35+h*7.+(hor>.5?id.x:id.y)*.13);float pulse=exp(-pow((along-k)*6.,2.));float node=(1.-smoothstep(.08,.12,length(f-.5)))*step(.8,h21(id+9.));vec2 uv=gl_FragCoord.xy/R;put(mix(B,A,pulse),(line*(.16+.6*pulse)+node*.45)*vig(uv)*I);}');
  // Light beams sweeping sideways
  REG.beams = SH('void main(){vec2 uv=gl_FragCoord.xy/R;float a=0.;for(int i=0;i<5;i++){float fi=float(i);float x=fract(h21(vec2(fi,2.))+T*.01*(fi+1.));float w=.02+.04*h21(vec2(fi,4.));a+=exp(-pow((uv.x-x)/w,2.))*(.5+.5*sin(T*.7+fi));}put(mix(B,A,uv.y),clamp(a,0.,1.)*smoothstep(0.,.8,uv.y)*.5*I);}');

  // the 2D ones: a fixed set of points from a seed, so the same section always looks the same
  function pts(n, seed) { var s = seed || 11, out = []; var r = function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (var i = 0; i < n; i++) out.push([r(), r(), r(), r(), r()]); return out; }
  function many(W, H, d, per, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(W * H / (d * d) / per))); }
  // Sparkles: little four-point stars that twinkle
  REG.sparkle = flat(function (ctx) {
    var W = 1, H = 1, d = 1, P = [];
    function star(x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill(); }
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; P = pts(many(w, h, dd, 2500, 40, 260), 11); }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var n = Math.round(P.length * Math.min(1, o.density / 1.4));
      for (var i = 0; i < n; i++) { var p = P[i], tw = Math.max(0, Math.sin(t * (0.6 + p[2] * 1.4) + p[3] * 40)); if (tw < 0.03) continue; ctx.fillStyle = css(i % 3 ? o.a : o.b, ((0.25 + 0.75 * tw) * Math.min(1, o.intensity)).toFixed(3)); star(p[0] * W, p[1] * H, (4 + p[2] * 9) * d * (0.35 + 0.65 * tw)); }
    } };
  });
  // Confetti falling and turning
  REG.confetti = flat(function (ctx) {
    var W = 1, H = 1, d = 1, P = [];
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; P = pts(many(w, h, dd, 3500, 30, 220), 23); }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var n = Math.round(P.length * Math.min(1, o.density / 1.4)), al = Math.min(1, o.intensity) * 0.8;
      for (var i = 0; i < n; i++) { var p = P[i], y = ((p[1] + t * (0.03 + p[2] * 0.05)) % 1) * (H + 40 * d) - 20 * d, x = p[0] * W + Math.sin(t * (0.8 + p[3]) + p[4] * 9) * 18 * d, a = t * (1 + p[3] * 2) + p[4] * 6;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, Math.cos(a * 1.7)); ctx.fillStyle = css(i % 2 ? o.a : o.b, al.toFixed(3)); ctx.fillRect(-4 * d, -7 * d, 8 * d, 14 * d); ctx.restore(); }
    } };
  });
  // Snow drifting down
  REG.snow = flat(function (ctx) {
    var W = 1, H = 1, d = 1, P = [];
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; P = pts(many(w, h, dd, 3500, 40, 300), 31); }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var n = Math.round(P.length * Math.min(1, o.density / 1.4)), al = Math.min(1, o.intensity);
      for (var i = 0; i < n; i++) { var p = P[i], z = 0.4 + p[2] * 0.6, y = ((p[1] + t * 0.025 * z) % 1) * H, x = (p[0] * W + Math.sin(t * 0.5 + p[3] * 9) * 14 * d * z + W) % W;
        ctx.fillStyle = css(i % 4 ? o.a : o.b, (0.35 + 0.45 * z) * al); ctx.beginPath(); ctx.arc(x, y, (1.2 + 3 * z) * d, 0, 6.2832); ctx.fill(); }
    } };
  });
  // Rain streaks
  REG.rain = flat(function (ctx) {
    var W = 1, H = 1, d = 1, P = [];
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; P = pts(many(w, h, dd, 4000, 40, 260), 41); }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var n = Math.round(P.length * Math.min(1, o.density / 1.4)), al = Math.min(1, o.intensity); ctx.lineCap = 'round';
      for (var i = 0; i < n; i++) { var p = P[i], z = 0.4 + p[2] * 0.6, L = (10 + 18 * z) * d, y = ((p[1] + t * (0.35 + 0.4 * z)) % 1) * (H + L) - L, x = (p[0] * (W + H * 0.25) - y * 0.25 + W) % W;
        ctx.strokeStyle = css(i % 3 ? o.a : o.b, (0.2 + 0.4 * z) * al); ctx.lineWidth = (0.6 + z) * d; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - L * 0.25, y + L); ctx.stroke(); }
    } };
  });
  // Bubbles rising and wobbling
  REG.bubbles = flat(function (ctx) {
    var W = 1, H = 1, d = 1, P = [];
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; P = pts(many(w, h, dd, 9000, 18, 100), 53); }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var n = Math.round(P.length * Math.min(1, o.density / 1.4)), al = Math.min(1, o.intensity);
      for (var i = 0; i < n; i++) { var p = P[i], r = (4 + 16 * p[2]) * d, y = H + r - ((p[1] + t * (0.02 + 0.03 * (1 - p[2]))) % 1) * (H + 2 * r), x = p[0] * W + Math.sin(t * (1 + p[3]) + p[4] * 7) * 10 * d;
        ctx.strokeStyle = css(i % 2 ? o.a : o.b, 0.55 * al); ctx.lineWidth = 1.2 * d; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = css(o.a, 0.08 * al); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * al).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, 6.2832); ctx.fill(); }
    } };
  });
  // Fireflies wandering and glowing
  REG.fireflies = flat(function (ctx) {
    var W = 1, H = 1, d = 1, P = [];
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; P = pts(many(w, h, dd, 9000, 22, 110), 67); }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var n = Math.round(P.length * Math.min(1, o.density / 1.4)), al = Math.min(1, o.intensity);
      for (var i = 0; i < n; i++) { var p = P[i], x = (p[0] + 0.06 * Math.sin(t * (0.2 + p[2] * 0.3) + p[3] * 9)) * W, y = (p[1] + 0.06 * Math.cos(t * (0.17 + p[3] * 0.3) + p[4] * 9)) * H, g = Math.max(0, Math.sin(t * (0.5 + p[2]) + p[4] * 20)), r = (10 + 14 * p[2]) * d;
        if (g < 0.05) continue; var gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, css(i % 3 ? o.a : o.b, 0.8 * g * al)); gr.addColorStop(1, css(o.a, 0)); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
    } };
  });
  // Code rain: columns of ones and zeros
  REG.coderain = flat(function (ctx) {
    var W = 1, H = 1, d = 1, cols = [];
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; cols = pts(Math.ceil(w / (16 * dd)) + 1, 79); }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var fs = 13 * d, step = 16 * d, rows = Math.ceil(H / step) + 1, al = Math.min(1, o.intensity), every = Math.max(1, Math.round(2 / o.density));
      ctx.font = fs + 'px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.textAlign = 'center';
      for (var c = 0; c < cols.length; c += every) { var p = cols[c], head = ((p[1] + t * (0.08 + 0.12 * p[2])) % 1.4) * rows, len = 6 + p[3] * 14;
        for (var r = Math.max(0, Math.floor(head - len)); r <= Math.min(rows, Math.floor(head)); r++) { var k = 1 - (head - r) / len; if (k <= 0) continue; var bit = (Math.sin((c * 31.7 + r * 17.3) + Math.floor(t * 3 + p[4] * 10)) > 0) ? '1' : '0';
          ctx.fillStyle = css(r === Math.floor(head) ? o.b : o.a, (k * 0.75 * al).toFixed(3)); ctx.fillText(bit, c * step + step / 2, r * step); } }
    } };
  });
  // Equalizer bars dancing at the bottom
  REG.equalizer = flat(function (ctx) {
    var W = 1, H = 1, d = 1;
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var bw = Math.max(4, Math.round(10 * d / o.density)), gap = Math.max(2, Math.round(bw * 0.4)), n = Math.ceil(W / (bw + gap)), al = Math.min(1, o.intensity);
      for (var i = 0; i < n; i++) { var x = i * (bw + gap), v = 0.5 + 0.25 * Math.sin(t * 2.1 + i * 0.45) + 0.2 * Math.sin(t * 3.3 - i * 0.21) + 0.12 * Math.sin(t * 5.7 + i * 1.3), mid = 1 - Math.abs(i / n - 0.5) * 1.2, h = Math.max(2 * d, v * mid * H * 0.45);
        ctx.fillStyle = css(o.a, 0.5 * al); ctx.fillRect(x, H - h, bw, h); ctx.fillStyle = css(o.b, 0.75 * al); ctx.fillRect(x, H - h - 3 * d, bw, 2 * d); }
    } };
  });
  // Orbits: little planets going round
  REG.orbits = flat(function (ctx) {
    var W = 1, H = 1, d = 1;
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var cx = W * 0.5, cy = H * 0.5, R = Math.min(W, H) * 0.46, n = Math.max(3, Math.round(6 * o.density)), al = Math.min(1, o.intensity);
      for (var i = 0; i < n; i++) { var r = R * (0.25 + 0.75 * (i + 1) / n), sp = 0.5 / Math.sqrt(i + 1), a = t * sp + i * 1.9;
        ctx.strokeStyle = css(o.b, 0.18 * al); ctx.lineWidth = d; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.42, 0, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = css(i % 2 ? o.a : o.b, 0.85 * al); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.42, (2.5 + i * 0.6) * d, 0, 6.2832); ctx.fill(); }
      ctx.fillStyle = css(o.a, 0.6 * al); ctx.beginPath(); ctx.arc(cx, cy, 7 * d, 0, 6.2832); ctx.fill();
    } };
  });
  // Pendulum wave: a row of dots swinging out of step and back in
  REG.pendulum = flat(function (ctx) {
    var W = 1, H = 1, d = 1;
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var n = Math.max(8, Math.round(18 * o.density)), al = Math.min(1, o.intensity), top = H * 0.12, bottom = H * 0.88;
      for (var i = 0; i < n; i++) { var y = top + (bottom - top) * i / (n - 1), w = (20 + i) / 20, x = W * 0.5 + Math.sin(t * w * 1.2) * W * 0.32;
        ctx.strokeStyle = css(o.b, 0.12 * al); ctx.lineWidth = d; ctx.beginPath(); ctx.moveTo(W * 0.5, y); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = css(i % 2 ? o.a : o.b, 0.85 * al); ctx.beginPath(); ctx.arc(x, y, 4 * d, 0, 6.2832); ctx.fill(); }
    } };
  });
  // Flow field: specks drawn along an invisible wind
  REG.flow = flat(function (ctx) {
    var W = 1, H = 1, d = 1, P = [], last = 0;
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; P = pts(many(w, h, dd, 1500, 80, 900), 89).map(function (p) { return [p[0] * w, p[1] * h, p[2]]; }); ctx.clearRect(0, 0, W, H); last = 0; }, draw: function (t, o) {
      var dt = last ? Math.min(0.05, Math.max(0, t - last)) : 0.016; last = t; var al = Math.min(1, o.intensity), n = Math.round(P.length * Math.min(1, o.density / 1.4));
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.2, dt * 3).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
      for (var i = 0; i < n; i++) { var p = P[i], a = Math.sin(p[0] / W * 5 + t * 0.2) * 2 + Math.cos(p[1] / H * 4 - t * 0.15) * 2, v = 40 * d * dt;
        p[0] += Math.cos(a) * v; p[1] += Math.sin(a) * v; if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) { p[0] = Math.random() * W; p[1] = Math.random() * H; }
        ctx.fillStyle = css(p[2] > 0.5 ? o.a : o.b, 0.55 * al); ctx.fillRect(p[0], p[1], 1.6 * d, 1.6 * d); }
    } };
  });
  // Lissajous: one curve that slowly changes shape
  REG.lissajous = flat(function (ctx) {
    var W = 1, H = 1, d = 1;
    return { resize: function (w, h, dd) { W = w; H = h; d = dd; }, draw: function (t, o) {
      ctx.clearRect(0, 0, W, H); var al = Math.min(1, o.intensity), A2 = 3, B2 = 4 + Math.max(0, Math.round(o.density - 1)), ph = t * 0.25, rx = W * 0.38, ry = H * 0.38;
      for (var k = 0; k < 2; k++) { ctx.strokeStyle = css(k ? o.b : o.a, (k ? 0.35 : 0.7) * al); ctx.lineWidth = (k ? 1 : 1.6) * d; ctx.beginPath();
        for (var s = 0; s <= 600; s++) { var u = s / 600 * 6.2832, x = W / 2 + Math.sin(A2 * u + ph + k * 0.4) * rx, y = H / 2 + Math.sin(B2 * u) * ry; if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
    } };
  });

  window.TribeFx = {
    register: function (kind, def) { REG[kind] = def; }, scan: scan, kinds: function () { return Object.keys(REG); },
    destroy: function (el) { var it = find(el); if (it) kill(it); }, count: function () { return items.length; },
    stats: function () { return { items: items.length, frames: frames, running: !!raf, live: items.filter(function (it) { return it.vis && !it.still; }).length, still: reduce.matches, kinds: items.map(function (it) { return it.kind; }), size: items.map(function (it) { return [it.canvas.width, it.canvas.height]; }) }; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(); }); else scan();
})();
