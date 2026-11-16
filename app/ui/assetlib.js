// The design library (feat/asset-libs): ONE place to find colours, fonts, icons, pictures, sounds, motion feels, moving
// backgrounds, App Creator parts and screens, and website sections, each with its licence and where it came from.
// The content lives where it already did (the website designer, App Creator, Motion Studio, the backgrounds pack);
// assetlib-data.js adds 56 palettes and 52 sounds and gathers everything into one list. Files that come from outside
// (3D models, music, big icon sets) stay in the Assets panel (assets.js), which links here and back.
//
// Colours and fonts are applied through the project's brand kit (brandkit.js), so the website designer, App Creator,
// Motion Studio and the Launch kit all pick them up the way they already read the brand: one way to change the look.
//   window.TribeAssetLib = {
//     list(kind?, q?) -> [{ kind, id, name, tags, license, source }]     count(kind?) -> number
//     open({ kind?, q?, pid?, onPick? })   the picker sheet; without onPick, colours and fonts go to the brand kit
//     usePalette(id, pid?) / useFont(id, pid?) -> Promise<kit>             play(soundId)   palette(id)  nearest(hex)
//     installPack(pack)   a shelf asset-pack adds its items (kind 'palette' | 'sound' | 'icon' …) to this list
//     provider            the 'library' provider for the tribe's suggestions (suggest.js)
//   }
(function () {
  'use strict';
  const D = () => window.TribeAssetData;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = s => (window.TribeI18n && window.TribeI18n.t ? window.TribeI18n.t(s, s) || s : s);
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : null);
  const extra = [];   // items installed from shelf asset-packs this session (and remembered on this device)
  const addPal = x => { const D0 = window.TribeAssetData; if (D0 && x.kind === 'palette' && x.palette && !D0.PALETTES.some(p => p.id === x.id)) D0.PALETTES.push({ id: x.id, name: x.name, mood: x.tags || '', colors: x.palette }); };
  try { JSON.parse(localStorage.getItem('tribecode.assetlib.packs') || '[]').forEach(x => { extra.push(x); addPal(x); }); } catch {}

  function all() {
    if (!D()) return [];
    return D().catalog({ site: window.TribeSiteCfg, app: window.TribeAppCore, fx: window.TribeSiteFx, motion: window.TribeMotionKit }).concat(extra.filter(x => x.kind !== 'palette'));   // pack palettes join PALETTES, which the catalog lists
  }
  function list(kind, q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return all().filter(x => (!kind || x.kind === kind) && words.every(w => (x.name + ' ' + x.tags + ' ' + x.id).toLowerCase().includes(w)));
  }
  const count = kind => list(kind).length;
  const pidNow = () => { try { const C = window.TribeClient; return (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C && C.project && C.project()) || ''; } catch { return ''; } };

  // ---------- sounds: drawn with WebAudio from a few notes ----------
  let ac = null;
  function play(id) {
    const s = D() && D().SOUNDS.find(x => x.id === id); if (!s) return false;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const t0 = ac.currentTime + 0.01;
      for (const [f, st, len, wave, g] of s.notes) {
        const o = ac.createOscillator(), v = ac.createGain(); o.type = wave; o.frequency.setValueAtTime(f, t0 + st);
        if (s.sweep) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * s.sweep), t0 + st + len);
        v.gain.setValueAtTime(0.0001, t0 + st); v.gain.exponentialRampToValueAtTime(g, t0 + st + 0.005); v.gain.exponentialRampToValueAtTime(0.0001, t0 + st + len);
        o.connect(v).connect(ac.destination); o.start(t0 + st); o.stop(t0 + st + len + 0.02);
      }
      return true;
    } catch { return false; }
  }

  // ---------- colours and fonts go to the brand kit ----------
  async function usePalette(id, pid) {
    const p = D().palette(id); if (!p) throw new Error('That palette is not in the library.');
    const B = window.TribeBrandKit; pid = pid || pidNow();
    if (!B) return { colors: p.colors };
    const k = await B.get(pid); k.colors = { accent: p.colors.accent, ink: p.colors.ink, bg: p.colors.bg, more: p.colors.more.slice() };
    return B.set(pid, k);
  }
  async function useFont(id, pid) {
    const F = window.TribeSiteCfg && window.TribeSiteCfg.FONT_PAIRS, f = F && F[id]; if (!f) throw new Error('That font pair is not in the library.');
    const B = window.TribeBrandKit; pid = pid || pidNow();
    if (!B) return { fonts: { display: f.display, body: f.body } };
    const k = await B.get(pid); k.fonts = { display: f.display, body: f.body };
    return B.set(pid, k);
  }

  // ---------- the tiles ----------
  const svg = (inner, cls) => `<svg class="${cls || 'al-i'}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  function thumb(x) {
    const id = x.id;
    if (x.kind === 'palette') { const p = D().palette(id); return p ? `<span class="al-pal" style="background:${p.colors.bg}"><i style="background:${p.colors.accent}"></i><i style="background:${p.colors.ink}"></i><i style="background:${p.colors.more[0]}"></i><i style="background:${p.colors.more[1]}"></i></span>` : ''; }
    if (x.kind === 'font') { const f = (window.TribeSiteCfg.FONT_PAIRS || {})[id] || {}; return `<span class="al-font" style="font-family:'${esc(f.display)}',serif">Aa</span>`; }
    if (x.kind === 'icon') { const [src, n] = id.split(':'); const inner = src === 'site' ? (window.TribeSiteCfg.icon ? window.TribeSiteCfg.icon(n) : '') : (window.TribeAppData && window.TribeAppData.ICONS[n] ? svg(window.TribeAppData.ICONS[n], 'al-ic') : ''); return `<span class="al-ico">${inner}</span>`; }
    if (x.kind === 'background') return `<img class="al-img" src="sitefx/thumbs/${esc(id)}.jpg" alt="" loading="lazy" width="120" height="75">`;
    if (x.kind === 'sound') return `<span class="al-snd">${svg('<path d="M5 9v6h4l5 4V5L9 9z"/><path d="M17 9a4 4 0 0 1 0 6"/>')}</span>`;
    if (x.kind === 'motion') return `<span class="al-mo">${svg('<path d="M3 17c4 0 4-10 9-10s5 10 9 10"/>')}</span>`;
    return `<span class="al-gen">${esc(String(x.name).slice(0, 1).toUpperCase())}</span>`;
  }
  const short = lic => ({ 'CC0-1.0': 'CC0', 'OFL-1.1': 'OFL' }[lic] || lic);
  function tile(x) {
    return `<button type="button" class="al-tile" data-al="${esc(x.kind)}|${esc(x.id)}" title="${esc(T(x.name))} · ${esc(x.license)} · ${esc(T(x.source))}">${thumb(x)}<b>${esc(T(x.name))}</b><small>${esc(short(x.license))}</small></button>`;
  }

  // ---------- the picker ----------
  let cur = null;
  function open(o) {
    o = o || {}; if (!D() || !window.TribeUI) return null;
    if (cur) cur.close();
    const kinds = D().KINDS.filter(k => count(k.id));
    let kind = o.kind && kinds.some(k => k.id === o.kind) ? o.kind : kinds[0].id, q = o.q || '';
    const body = document.createElement('div'); body.className = 'al-body';
    body.innerHTML = `<label class="al-q"><span class="sr-only">${esc(T('Search the library'))}</span><input class="input" id="al-q" type="search" autocomplete="off" placeholder="${esc(T('Search colours, icons, sounds…'))}" value="${esc(q)}"></label>
      <div class="al-kinds" role="tablist">${kinds.map(k => `<button type="button" role="tab" class="al-kind" data-alk="${k.id}" aria-selected="${k.id === kind}">${esc(T(k.name))} <small>${count(k.id)}</small></button>`).join('')}</div>
      <div class="al-grid" id="al-grid"></div><p class="al-note faint" id="al-note"></p>`;
    const s = window.TribeUI.sheet({ id: 'al-sheet', eyebrow: 'Library', title: 'Design library', body, wide: true, onClose: () => { cur = null; } });
    cur = s;
    const grid = body.querySelector('#al-grid'), note = body.querySelector('#al-note');
    const paint = () => {
      const items = list(kind, q).slice(0, 240);
      grid.innerHTML = items.length ? items.map(tile).join('') : `<p class="faint">${esc(T('Nothing matches that. Try another word.'))}</p>`;
      body.querySelectorAll('[data-alk]').forEach(b => b.setAttribute('aria-selected', b.dataset.alk === kind ? 'true' : 'false'));
      const first = items[0]; note.textContent = first ? `${T('Licence')}: ${first.license} · ${T(first.source)}` : '';
    };
    body.querySelector('#al-q').addEventListener('input', e => { q = e.target.value; paint(); });
    body.addEventListener('click', async e => {
      const k = e.target.closest('[data-alk]'); if (k) { kind = k.dataset.alk; paint(); return; }
      const t = e.target.closest('[data-al]'); if (!t) return;
      const [kd, ...rest] = t.dataset.al.split('|'), id = rest.join('|'), x = all().find(i => i.kind === kd && i.id === id);
      if (!x) return;
      note.textContent = `${T(x.name)} · ${T('Licence')}: ${x.license} · ${T(x.source)}`;
      if (kd === 'sound') play(id);
      if (o.onPick) { const keep = o.onPick(x); if (keep !== true) s.close(); return; }
      try {
        if (kd === 'palette') { await usePalette(id, o.pid); toast(T('Colours saved to the brand kit. The website, apps, motion and store pictures use them.')); s.close(); }
        else if (kd === 'font') { await useFont(id, o.pid); toast(T('Fonts saved to the brand kit.')); s.close(); }
      } catch (err) { toast(err.message || String(err)); }
    });
    paint();
    return s;
  }

  // ---------- shelf asset-packs ----------
  // pack = { id, title, items: [{ kind, id, name, tags?, license, source, palette?: { accent, ink, bg, more } }] }
  function installPack(pack) {
    if (!pack || !Array.isArray(pack.items)) return 0; let n = 0;
    const okLic = /^(CC0-1\.0|MIT|ISC|Apache-2\.0|BSD-[23]-Clause|OFL-1\.1|CC-BY-4\.0)$/;
    for (const it of pack.items) {
      if (!it || !it.kind || !it.id || !okLic.test(it.license || '')) continue;
      if (extra.some(x => x.kind === it.kind && x.id === it.id)) continue;
      const x = { kind: it.kind, id: String(it.id), name: String(it.name || it.id), tags: String(it.tags || pack.title || ''), license: it.license, source: String(it.source || pack.title || ''), pack: pack.id, ...(it.kind === 'palette' && it.palette ? { palette: it.palette } : {}) };
      if (x.kind === 'palette' && !(x.palette && /^#[0-9a-f]{6}$/i.test(x.palette.accent) && /^#[0-9a-f]{6}$/i.test(x.palette.ink) && /^#[0-9a-f]{6}$/i.test(x.palette.bg))) continue;
      extra.push(x); addPal(x);
      n++;
    }
    try { localStorage.setItem('tribecode.assetlib.packs', JSON.stringify(extra)); } catch {}
    if (n) lastPack = { id: pack.id, title: pack.title || pack.id, n, at: Date.now() };
    return n;
  }
  let lastPack = null;

  // ---------- the tribe's suggestions: a pack just installed, a colour that has a named palette ----------
  const provider = {
    id: 'library', title: 'Library',
    async gather(ctx) {
      const kit = window.TribeBrandKit && ctx && ctx.projectId ? await window.TribeBrandKit.get(ctx.projectId).catch(() => null) : null;
      return { accent: kit && kit.colors && kit.colors.accent, named: kit && kit.colors && D().PALETTES.some(p => p.colors.accent.toLowerCase() === String(kit.colors.accent || '').toLowerCase()), pack: lastPack };
    },
    async suggest(ctx, g) {
      const out = [];
      if (g && g.accent && !g.named) {
        const p = D().nearest(g.accent);
        if (p) out.push({ id: 'library:palette:' + p.id, title: `Use the “${p.name}” palette`, why: `Your brand colour is close to ${p.name}. The full palette adds matching text, background and two extra colours.`, from: [{ kind: 'brand', ref: 'brand', who: '' }],
          apply: async () => { const B = window.TribeBrandKit, before = B ? await B.get(ctx.projectId) : null; await usePalette(p.id, ctx.projectId); return async () => { if (B && before) await B.set(ctx.projectId, before); }; } });
      }
      if (g && g.pack && Date.now() - g.pack.at < 864e5) out.push({ id: 'library:pack:' + g.pack.id, title: `See what is in “${g.pack.title}”`, why: `${g.pack.n} new items joined the design library.`, from: [{ kind: 'shelf', ref: g.pack.id, who: '' }],
        apply: async () => { open({ q: '' }); return async () => {}; } });
      return out;
    },
  };
  function register() { const S = window.TribeSuggest; if (S && typeof S.register === 'function' && !register.done) { register.done = true; try { S.register(provider); } catch {} } }
  register(); document.addEventListener('tribe:suggest-ready', register); window.addEventListener('load', register);

  window.TribeAssetLib = { list, count, open, usePalette, useFont, play, installPack, provider, palette: id => D() && D().palette(id), nearest: h => D() && D().nearest(h) };
})();
