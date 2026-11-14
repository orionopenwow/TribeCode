// The brand kit (feat/design-site2): one small record per project, shared by the website designer (Style › Brand kit,
// app/ui/sitestudio.js) and the Design canvas (the swatches and fonts in its properties panel, app/ui/canvas/extras.js).
//   kit = { name, logo (data URL or ''), colors: { accent, ink, bg, more: [hex…] }, fonts: { display, body }, voice }
// With a tribe it lives on the host (GET|PUT /api/projects/:id/brand, server/sitedesign.js, .tribe/website/<id>.brand.json); with
// no tribe, or offline, it stays on this device. The record's shape is checked by TribeSiteCfg.kitNormalize both sides.
//   window.TribeBrandKit = { get(pid) -> Promise<kit>, set(pid, kit) -> Promise<kit>, cached(pid) -> kit | null, colors(kit) -> [hex…], onChange(fn) }
(function () {
  'use strict';
  const C = window.TribeClient, S = () => window.TribeSiteCfg;
  const KEY = pid => `tribecode.brand.${pid || 'me'}`;
  const online = pid => !!(pid && !/^demo_/.test(pid) && C && C.connected && C.connected() && C.hasToken && C.hasToken());
  const norm = k => (S() ? S().kitNormalize(k) : k);
  const mem = new Map(), subs = [];
  const local = pid => { try { const k = JSON.parse(localStorage.getItem(KEY(pid)) || 'null'); return k ? norm(k) : null; } catch { return null; } };
  const keep = (pid, k) => { mem.set(pid || 'me', k); try { localStorage.setItem(KEY(pid), JSON.stringify(k)); } catch {} return k; };
  async function get(pid) {
    if (online(pid)) { try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/brand`); return keep(pid, norm(r.kit)); } catch {} }
    return mem.get(pid || 'me') || keep(pid, local(pid) || norm({}));
  }
  async function set(pid, kit) {
    let k = norm(kit);
    if (online(pid)) { try { const r = await C.api(`/projects/${encodeURIComponent(pid)}/brand`, { method: 'PUT', body: { kit: k } }); k = norm(r.kit); } catch {} }
    keep(pid, k); subs.forEach(fn => { try { fn(pid, k); } catch {} });
    return k;
  }
  const cached = pid => mem.get(pid || 'me') || local(pid);
  const colors = k => (k && k.colors ? [k.colors.accent, k.colors.ink, k.colors.bg, ...(k.colors.more || [])].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i) : []);
  if (C && C.on) C.on('ws', d => { if (d && d.type === 'brand-kit' && d.project) get(d.project).then(k => subs.forEach(fn => { try { fn(d.project, k); } catch {} })); });
  window.TribeBrandKit = { get, set, cached, colors, onChange: fn => subs.push(fn) };
})();
