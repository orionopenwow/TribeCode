/*! The 3D moving backgrounds for websites made in TribeCode (feat/site-3d). They need Three.js (three.min.js, MIT,
 * beside this file); fx.js loads both only when a page uses one of these kinds.
 *
 * "sphere" and "dome" are ports of the Orbital Sphere and Structure Flow components from ThreeUI Community
 * (MIT License, Copyright (c) 2026 Meng To; the full notice is at the top of fx.js and in LICENSE-threeui.txt),
 * rewritten without React and recoloured to follow the site's palette. "constellation", "drift" and "warp" are
 * TribeCode's own scenes, made after the same catalogue's particle fields. Everything else here is TribeCode's (MIT).
 */
(function () {
  'use strict';
  var T3 = window.THREE, FX = window.TribeFx; if (!T3 || !FX) return;
  var col = function (c) { return new T3.Color(c[0], c[1], c[2]); };
  // a small seeded generator, so a scene looks the same on every load
  var rng = function (s) { return function () { s = (s * 16807) % 2147483647; return (s & 0xfffffff) / 0x10000000; }; };
  // one round, soft-edged dot, shared by every scene on the page
  var dotTex = null, dot = function () { if (dotTex) return dotTex; var c = document.createElement('canvas'); c.width = c.height = 32; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.arc(16, 16, 13, 0, 6.2832); x.fill(); dotTex = new T3.CanvasTexture(c); return dotTex; };

  // scene(build): build({ scene, camera, o, R }) -> { frame(t, o, dt), size?(w, h), free: [things with dispose()] }
  function scene(fov, build) {
    return { make: function (canvas, o) {
      var renderer; try { renderer = new T3.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { return null; }
      renderer.setClearColor(0x000000, 0);
      var sc = new T3.Scene(), cam = new T3.PerspectiveCamera(fov, 1, 0.1, 400), last = 0;
      var s = build({ scene: sc, camera: cam, o: o });
      return {
        resize: function (w, h, d) { renderer.setPixelRatio(d); renderer.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); if (s.size) s.size(w, h, d); },
        draw: function (t, opts) { var dt = last ? Math.max(0, Math.min(0.05, t - last)) : 0.016; last = t; s.frame(t, opts, dt); renderer.render(sc, cam); },
        dispose: function () { (s.free || []).forEach(function (x) { try { x.dispose(); } catch (e) {} }); try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {} }
      };
    } };
  }
  var points = function (pos, size, color, opacity, colors) {
    var g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(pos, 3)); if (colors) g.setAttribute('color', new T3.BufferAttribute(colors, 3));
    var m = new T3.PointsMaterial({ size: size, map: dot(), alphaTest: 0.05, transparent: true, opacity: opacity, depthWrite: false, vertexColors: !!colors, color: colors ? 0xffffff : color, sizeAttenuation: true });
    return { mesh: new T3.Points(g, m), g: g, m: m };
  };

  // Orbital sphere (port): a sphere of fine points with slow orbits around it
  FX.register('sphere', scene(45, function (c) {
    var R = rng(11), group = new T3.Group(); c.scene.add(group);
    var radius = 2.2, n = Math.round(9000 * Math.min(1.6, c.o.density)), pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), k = 0, A = col(c.o.a), B = col(c.o.b);
    for (var i = 0; i < n; i++) { var phi = Math.acos(-1 + (2 * i) / n), th = Math.sqrt(n * Math.PI) * phi, x = radius * Math.cos(th) * Math.sin(phi), y = radius * Math.sin(th) * Math.sin(phi), z = radius * Math.cos(phi);
      var nz = Math.sin(x * 3.5) * Math.cos(y * 3.5) * Math.sin(z * 3.5) + Math.cos(x * 6) * 0.4; if (nz <= -0.1) continue; var ds = 1 + nz * 0.1;
      pos[k * 3] = x * ds; pos[k * 3 + 1] = y * ds; pos[k * 3 + 2] = z * ds; var m = B.clone().lerp(A, nz > 0.5 ? 1 : 0.35); cl[k * 3] = m.r; cl[k * 3 + 1] = m.g; cl[k * 3 + 2] = m.b; k++; }
    var P = points(pos.slice(0, k * 3), 0.05, 0, 0.9, cl.slice(0, k * 3)); group.add(P.mesh);
    var lm = new T3.LineBasicMaterial({ color: A, transparent: true, opacity: 0.3 }), free = [P.g, P.m, lm], lines = [];
    for (var j = 0; j < 6; j++) { var pts = [], or = radius * (1.08 + R() * 0.2); for (var q = 0; q <= 90; q++) { var a = q / 90 * Math.PI * 2; pts.push(Math.cos(a) * or, Math.sin(a) * or, Math.sin(a * 4) * 0.1); }
      var g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(pts, 3)); var line = new T3.Line(g, lm); line.rotation.x = R() * 6.28; line.rotation.y = R() * 6.28; group.add(line); lines.push(line); free.push(g);
      if (j % 2) { var ng = new T3.SphereGeometry(0.035, 12, 12), nm = new T3.MeshBasicMaterial({ color: A }), node = new T3.Mesh(ng, nm), an = R() * 6.28; node.position.set(Math.cos(an) * or, Math.sin(an) * or, 0); line.add(node); free.push(ng, nm); } }
    var base = 1;
    return { free: free, size: function (w, h) { if (w >= 900 && w > h * 1.2) { group.position.set(2.5, 0, -2); base = 1.15; c.camera.position.z = 5.5; } else { group.position.set(0, -0.6, -3); base = 1; c.camera.position.z = 6.5; } },
      frame: function (t, o) { P.m.opacity = Math.min(1, 0.9 * o.intensity); lm.opacity = Math.min(0.8, 0.3 * o.intensity); group.scale.setScalar(base); group.rotation.y = t * 0.05; group.rotation.x = t * 0.018; for (var i = 0; i < lines.length; i++) lines[i].rotation.z = t * 0.025 * (i % 2 ? -1 : 1) + i; } };
  }));

  // Rising dome (port of Structure Flow): a great dome of points turning slowly under the page
  FX.register('dome', scene(60, function (c) {
    var R = rng(23), n = Math.round(9000 * Math.min(1.6, c.o.density)), pos = new Float32Array(n * 3), radius = 25;
    for (var i = 0; i < n; i++) { var th = R() * 6.2832, phi = Math.acos(R() * 0.8 + 0.2); pos[i * 3] = radius * Math.sin(phi) * Math.cos(th); pos[i * 3 + 1] = radius * Math.cos(phi) - 20; pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(th); }
    var P = points(pos, 0.34, col(c.o.a), 0.8); c.scene.add(P.mesh); c.camera.position.set(0, 5, 30);
    return { free: [P.g, P.m], frame: function (t, o) { P.m.opacity = Math.min(1, 0.8 * o.intensity); P.mesh.rotation.y = t * 0.05; P.mesh.rotation.z = Math.sin(t * 0.05) * 0.06; } };
  }));

  // Constellation: drifting points joined by thin lines when they come close
  FX.register('constellation', scene(50, function (c) {
    var R = rng(31), n = Math.round(Math.min(150, 80 * c.o.density)), pos = new Float32Array(n * 3), vel = [], W = 15, H = 8, Dp = 6;
    for (var i = 0; i < n; i++) { pos[i * 3] = (R() - 0.5) * W * 2; pos[i * 3 + 1] = (R() - 0.5) * H * 2; pos[i * 3 + 2] = (R() - 0.5) * Dp * 2; vel.push((R() - 0.5) * 0.5, (R() - 0.5) * 0.5, (R() - 0.5) * 0.3); }
    var P = points(pos, 0.55, col(c.o.a), 0.9); c.scene.add(P.mesh);
    var MAXL = n * 6, lp = new Float32Array(MAXL * 6), lg = new T3.BufferGeometry(); lg.setAttribute('position', new T3.BufferAttribute(lp, 3)); lg.setDrawRange(0, 0);
    var lm = new T3.LineBasicMaterial({ color: col(c.o.b), transparent: true, opacity: 0.35 }), L = new T3.LineSegments(lg, lm); L.frustumCulled = false; P.mesh.frustumCulled = false; c.scene.add(L); c.camera.position.z = 16;
    return { free: [P.g, P.m, lg, lm], frame: function (t, o, dt) {
      var i, j, k = 0, lim = 3.4 * 3.4;
      for (i = 0; i < n; i++) { var a = i * 3; pos[a] += vel[a] * dt; pos[a + 1] += vel[a + 1] * dt; pos[a + 2] += vel[a + 2] * dt; if (Math.abs(pos[a]) > W) vel[a] *= -1; if (Math.abs(pos[a + 1]) > H) vel[a + 1] *= -1; if (Math.abs(pos[a + 2]) > Dp) vel[a + 2] *= -1; }
      for (i = 0; i < n && k < MAXL; i++) for (j = i + 1; j < n && k < MAXL; j++) { var dx = pos[i * 3] - pos[j * 3], dy = pos[i * 3 + 1] - pos[j * 3 + 1], dz = pos[i * 3 + 2] - pos[j * 3 + 2]; if (dx * dx + dy * dy + dz * dz < lim) { lp.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]], k * 6); k++; } }
      lg.setDrawRange(0, k * 2); lg.attributes.position.needsUpdate = true; P.g.attributes.position.needsUpdate = true;
      P.m.opacity = Math.min(1, 0.85 * o.intensity); lm.opacity = Math.min(0.9, 0.35 * o.intensity); c.scene.rotation.y = Math.sin(t * 0.05) * 0.25;
    } };
  }));

  // Drifting particles: a deep field of soft dots floating slowly upward
  FX.register('drift', scene(55, function (c) {
    var R = rng(47), n = Math.round(Math.min(2400, 1100 * c.o.density)), pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), sp = new Float32Array(n), A = col(c.o.a), B = col(c.o.b);
    for (var i = 0; i < n; i++) { pos[i * 3] = (R() - 0.5) * 60; pos[i * 3 + 1] = (R() - 0.5) * 34; pos[i * 3 + 2] = -R() * 50; sp[i] = 0.3 + R() * 0.9; var m = B.clone().lerp(A, R()); cl[i * 3] = m.r; cl[i * 3 + 1] = m.g; cl[i * 3 + 2] = m.b; }
    var P = points(pos, 0.7, 0, 0.85, cl); P.mesh.frustumCulled = false; c.scene.add(P.mesh); c.camera.position.z = 12;
    return { free: [P.g, P.m], frame: function (t, o, dt) { for (var i = 0; i < n; i++) { var a = i * 3; pos[a + 1] += sp[i] * dt * 0.9; pos[a] += Math.sin(t * 0.3 + i) * dt * 0.25; if (pos[a + 1] > 17) pos[a + 1] = -17; } P.g.attributes.position.needsUpdate = true; P.m.opacity = Math.min(1, 0.85 * o.intensity); } };
  }));

  // Starfield: points streaming gently toward the viewer
  FX.register('warp', scene(70, function (c) {
    var R = rng(59), n = Math.round(Math.min(2600, 1300 * c.o.density)), pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), A = col(c.o.a), B = col(c.o.b), DEEP = 120;
    for (var i = 0; i < n; i++) { var r = 3 + R() * 40, a = R() * 6.2832; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.sin(a) * r * 0.7; pos[i * 3 + 2] = -R() * DEEP; var m = B.clone().lerp(A, R()); cl[i * 3] = m.r; cl[i * 3 + 1] = m.g; cl[i * 3 + 2] = m.b; }
    var P = points(pos, 0.42, 0, 0.85, cl); P.mesh.frustumCulled = false; c.scene.add(P.mesh); c.camera.position.z = 0;
    return { free: [P.g, P.m], frame: function (t, o, dt) { for (var i = 0; i < n; i++) { var a = i * 3 + 2; pos[a] += dt * 9; if (pos[a] > -5) pos[a] = -DEEP; } P.g.attributes.position.needsUpdate = true; P.m.opacity = Math.min(1, 0.8 * o.intensity); P.mesh.rotation.z = t * 0.01; } };
  }));

  FX.scan();
})();
