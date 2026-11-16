// The suggestion engine's pure parts (docs/SUGGESTIONS.md), shared by the browser (app/ui/suggest.js), the host
// (server/suggest.js) and the unit test (app/test/suggest_core_test.js). No AI, no I/O: plain counting and rules.
//
//   weight(learn, provider, kind, now)      -> 0.15 … 2: how much this tribe wants this kind of suggestion lately
//   explain(learn, provider, kind, now)     -> a plain sentence ("You applied 3 like this and said no to 1 lately.")
//   record(learn, { provider, kind, verdict }, now) -> learn   verdict: 'yes' | 'no' | 'notlike' | 'later'
//   rank(items, { learn, dismissed, blocked, muted, now }) -> items, best first, never a dismissed id or a muted provider
//   allowNew(shown, { mode, now, quiet, asked }) -> how many never-seen suggestions may appear now (the cool-down)
//   editPatterns(log, now) -> repeated edits: [{ key, tool, what, prop, dir, value, n, refs, at }]
//   siteEdits(before, after) -> edit records from two website configs (element looks that changed)
//   palette(rgba, w, h, k) -> up to k hex colours, most present first, never two that look alike
//   shape(w, h) -> 'wide' | 'tall' | 'square'
//   asks(sources, tasks) -> features people asked for that no task covers: [{ key, label, title, from: [...] }]
//
// learn = { p: { <provider>: { y, n, at } }, k: { '<provider>|<kind>': { y, n, at } } }: counts that fade with a
// 30-day half-life, so what the tribe answered last week counts more than what it answered last spring.
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.TribeSuggestCore = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DAY = 864e5, HALF = 30 * DAY;
  const hash = s => { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const fade = (c, now) => { if (!c) return { y: 0, n: 0 }; const f = Math.pow(0.5, Math.max(0, (now - (c.at || now)) / HALF)); return { y: (c.y || 0) * f, n: (c.n || 0) * f }; };
  const one = (c, now) => { const { y, n } = fade(c, now); return 2 * (1 + y) / (2 + y + 1.5 * n); };   // 1 with no answers, towards 2 with yeses, towards 0 with noes
  // the provider's answers and this kind's answers both count; the kind's answers count twice as much
  function weight(learn, provider, kind, now = Date.now()) {
    const L = learn || {}, p = (L.p || {})[provider], k = (L.k || {})[`${provider}|${kind || ''}`];
    const w = (one(p, now) + 2 * one(k, now)) / 3;
    return Math.max(0.15, Math.min(2, Math.round(w * 1000) / 1000));
  }
  function explain(learn, provider, kind, now = Date.now()) {
    const L = learn || {}, k = fade((L.k || {})[`${provider}|${kind || ''}`], now), y = Math.round(k.y), n = Math.round(k.n);
    if (!y && !n) return 'New: nobody has answered one like this yet.';
    const part = [y ? `applied ${y} like this` : '', n ? `said no to ${n}` : ''].filter(Boolean).join(' and ');
    return `Your tribe ${part} lately, so ${weight(learn, provider, kind, now) >= 1 ? 'it comes up first' : 'it comes up less'}.`;
  }
  function record(learn, { provider, kind, verdict }, now = Date.now()) {
    const L = learn && typeof learn === 'object' ? learn : {}; L.p = L.p || {}; L.k = L.k || {};
    if (verdict === 'later') return L;   // "Not now" teaches nothing
    const bump = (map, key) => { const c = fade(map[key], now); if (verdict === 'yes') c.y += 1; else c.n += verdict === 'notlike' ? 3 : 1; map[key] = { y: Math.round(c.y * 1000) / 1000, n: Math.round(c.n * 1000) / 1000, at: now }; };
    bump(L.p, String(provider || '')); bump(L.k, `${provider || ''}|${kind || ''}`);
    // keep it small: the 200 kinds answered most recently
    const keys = Object.keys(L.k); if (keys.length > 200) keys.sort((a, b) => (L.k[a].at || 0) - (L.k[b].at || 0)).slice(0, keys.length - 200).forEach(x => delete L.k[x]);
    return L;
  }
  function rank(items, { learn, dismissed, blocked, muted, now = Date.now() } = {}) {
    const no = dismissed instanceof Set ? dismissed : new Set(Array.isArray(dismissed) ? dismissed : Object.keys(dismissed || {}));
    const mute = new Set(muted || []), blk = new Set(blocked || []), seen = new Set();
    return (items || []).filter(x => x && x.id && x.title && !no.has(x.id) && !mute.has(x.provider) && !blk.has(`${x.provider}|${x.kind || ''}`) && !seen.has(x.id) && seen.add(x.id))
      .map(x => ({ x, s: (Number.isFinite(x.score) ? x.score : 1) * weight(learn, x.provider, x.kind, now) }))
      .sort((a, b) => b.s - a.s).map(({ x, s }) => Object.assign(x, { rank: Math.round(s * 1000) / 1000 }));
  }
  const CAP = { gentle: 3, often: 12, off: 0 };
  // shown = [ms, …] when a never-seen suggestion first appeared; quiet = true during quiet hours. Asking always shows.
  function allowNew(shown, { mode = 'gentle', now = Date.now(), quiet = false, asked = false } = {}) {
    if (mode === 'off' && !asked) return 0;
    if (asked) return 50;
    if (quiet) return 0;
    const day = (shown || []).filter(t => now - t < DAY).length;
    return Math.max(0, (CAP[mode] == null ? CAP.gentle : CAP[mode]) - day);
  }

  // ---------- edits that repeat: "you've made 4 headings bigger" ----------
  // log = [{ tool, what, prop, dir?, value?, ref, at }]; four of the same kind in a week, on four different things
  function editPatterns(log, now = Date.now()) {
    const by = {};
    for (const e of log || []) {
      if (!e || now - (e.at || 0) > 7 * DAY) continue;
      const key = [e.tool, e.what, e.prop, e.dir == null ? '' : e.dir, e.value == null ? '' : e.value].join('|');
      const g = by[key] || (by[key] = { key, tool: e.tool, what: e.what, prop: e.prop, dir: e.dir, value: e.value, refs: new Set(), at: 0 });
      g.refs.add(e.ref || ''); g.at = Math.max(g.at, e.at || 0);
    }
    return Object.values(by).filter(g => g.refs.size >= 4).map(g => ({ ...g, n: g.refs.size, refs: [...g.refs] })).sort((a, b) => b.n - a.n || b.at - a.at);
  }
  const SZ = ['s', '', 'l', 'xl'];
  // what an element is, from its path in a section: the title, the words, a button, an entry's title
  function whatOf(path, type) {
    const p = String(path || '');
    if (/(^|\.)button(\.label)?$|^buttons\.\d+/.test(p)) return 'button';
    if (/^items\.\d+\.(title|q|name|label)$/.test(p)) return 'entry title';
    if (p === 'title' || (type === 'hero' && p === 'title') || p === 'name') return 'heading';
    if (/^(text|bio|lead|note|eyebrow)$/.test(p) || /^items\.\d+\.(text|a|desc)$/.test(p)) return 'text';
    return '';
  }
  function siteEdits(before, after) {
    const out = []; if (!before || !after || !Array.isArray(after.pages)) return out;
    const old = {}; for (const pg of before.pages || []) for (const b of pg.blocks || []) old[b.id] = b;
    for (const pg of after.pages) for (const b of pg.blocks || []) {
      const a = old[b.id]; if (!a) continue;
      const ea = a.es || {}, eb = b.es || {};
      for (const path of new Set([...Object.keys(ea), ...Object.keys(eb)])) {
        const x = ea[path] || {}, y = eb[path] || {}, what = whatOf(path, b.type); if (!what) continue;
        const ref = `${b.id}|${path}`;
        if ((x.sz || '') !== (y.sz || '')) { const d = SZ.indexOf(y.sz || '') - SZ.indexOf(x.sz || ''); if (d) out.push({ tool: 'site', what, prop: 'size', dir: d > 0 ? 1 : -1, ref }); }
        if (!!x.b !== !!y.b) out.push({ tool: 'site', what, prop: 'bold', value: y.b ? 1 : 0, ref });
        if ((x.al || '') !== (y.al || '') && y.al) out.push({ tool: 'site', what, prop: 'align', value: y.al, ref });
        if ((x.col || '') !== (y.col || '') && y.col) out.push({ tool: 'site', what, prop: 'color', value: y.col, ref });
        if ((x.f || '') !== (y.f || '') && y.f) out.push({ tool: 'site', what, prop: 'font', value: y.f, ref });
      }
    }
    return out;
  }
  // every element of that kind on the site, with what the edit would set on it (for "make all headings bigger")
  function siteTargets(cfg, pat) {
    const out = []; if (!cfg || !Array.isArray(cfg.pages)) return out;
    const done = new Set(pat.refs || []);
    for (const pg of cfg.pages) for (const b of pg.blocks || []) {
      const P = b.props || {}, paths = [];
      if (pat.what === 'heading') { if (typeof P.title === 'string' && P.title) paths.push('title'); if (b.type === 'links' && P.name) paths.push('name'); }
      if (pat.what === 'text') ['text', 'bio', 'lead'].forEach(k => { if (typeof P[k] === 'string' && P[k]) paths.push(k); });
      if (pat.what === 'button') { if (P.button && P.button.label) paths.push('button'); (P.buttons || []).forEach((x, i) => { if (x && x.label) paths.push(`buttons.${i}`); }); }
      if (pat.what === 'entry title') (P.items || []).forEach((x, i) => { if (x && typeof x.title === 'string' && x.title) paths.push(`items.${i}.title`); });
      for (const path of paths) {
        if (done.has(`${b.id}|${path}`)) continue;
        const cur = (b.es || {})[path] || {}; let set = null;
        if (pat.prop === 'size') { const i = SZ.indexOf(cur.sz || ''), j = Math.max(0, Math.min(3, i + pat.dir)); if (j !== i) set = { sz: SZ[j] }; }
        if (pat.prop === 'bold' && !!cur.b !== !!pat.value) set = { b: pat.value ? 1 : '' };
        if (pat.prop === 'align' && cur.al !== pat.value) set = { al: pat.value };
        if (pat.prop === 'color' && cur.col !== pat.value) set = { col: pat.value };
        if (pat.prop === 'font' && cur.f !== pat.value) set = { f: pat.value };
        if (set) out.push({ op: 'estyle', block: b.id, path, set });
      }
    }
    return out;
  }

  // ---------- photos: colours and shape, computed on the device, never sent anywhere ----------
  const hex2 = n => n.toString(16).padStart(2, '0');
  const toHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
  const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 * 0.3 + (a[1] - b[1]) ** 2 * 0.59 + (a[2] - b[2]) ** 2 * 0.11);
  function palette(rgba, w, h, k = 5) {
    const bins = new Map(), n = Math.min(rgba.length / 4, w * h);
    for (let i = 0; i < n; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3]; if (a < 128) continue;
      const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4), v = bins.get(key) || [0, 0, 0, 0];
      v[0] += r; v[1] += g; v[2] += b; v[3]++; bins.set(key, v);
    }
    const cand = [...bins.values()].map(v => [Math.round(v[0] / v[3]), Math.round(v[1] / v[3]), Math.round(v[2] / v[3]), v[3]]).sort((a, b) => b[3] - a[3]);
    const out = [];
    for (const c of cand) { if (out.every(o => dist(o, c) > 40)) out.push(c); if (out.length >= k) break; }
    return out.map(c => toHex(c[0], c[1], c[2]));
  }
  const lum = hex => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const sat = hex => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); const mx = Math.max(...v), mn = Math.min(...v); return mx ? (mx - mn) / mx : 0; };
  // the colour that would work as a main colour: lively, not near-white or near-black
  function accentOf(colors) { const ok = (colors || []).filter(c => { const l = lum(c); return l > 0.04 && l < 0.6 && sat(c) > 0.35; }); return ok[0] || ''; }
  const shape = (w, h) => !w || !h ? '' : w / h >= 1.3 ? 'wide' : h / w >= 1.3 ? 'tall' : 'square';
  const near = (a, b) => /^#[0-9a-f]{6}$/i.test(a || '') && /^#[0-9a-f]{6}$/i.test(b || '') && dist([1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))) < 30;

  // ---------- what people asked for that no task covers ----------
  const FEATURES = [
    ['dark', 'dark mode', /\bdark (?:mode|theme)\b|\bnight mode\b/i],
    ['login', 'sign-in', /\b(?:log ?in|sign ?in|sign ?up|accounts?|user accounts?)\b/i],
    ['search', 'search', /\bsearch(?: bar| box)?\b/i],
    ['notify', 'notifications', /\b(?:notifications?|push alerts?|reminders?)\b/i],
    ['offline', 'offline mode', /\b(?:offline mode|work offline|works offline)\b/i],
    ['share', 'sharing', /\b(?:share button|sharing|share it)\b/i],
    ['leader', 'a leaderboard', /\b(?:leader ?board|high ?scores?)\b/i],
    ['save', 'saving progress', /\b(?:save (?:game|progress|slots?)|saves? (?:the )?progress|autosave)\b/i],
    ['sound', 'sound and music', /\b(?:sound effects?|music|sfx|soundtrack)\b/i],
    ['multi', 'multiplayer', /\b(?:multiplayer|co-?op|play together)\b/i],
    ['lang', 'more languages', /\b(?:translations?|translate it|other languages|more languages|spanish version)\b/i],
    ['a11y', 'accessibility', /\b(?:accessib\w*|screen readers?|bigger text option)\b/i],
    ['onboard', 'onboarding', /\b(?:onboarding|tutorial|first[- ]run|welcome screens?)\b/i],
    ['settings', 'a settings screen', /\b(?:settings (?:screen|page)|preferences page)\b/i],
    ['profile', 'profiles', /\b(?:user profiles?|profile (?:page|screen))\b/i],
    ['map', 'a map', /\b(?:a map|map view|show it on a map)\b/i],
    ['calendar', 'a calendar', /\b(?:calendar(?: view)?|booking calendar)\b/i],
    ['export', 'export', /\b(?:export (?:to|as)|download (?:as )?(?:pdf|csv))\b/i],
  ];
  const WANT = /\b(?:we (?:need|should|could|must)|can we|could we|let'?s (?:add|have|do)|should (?:add|have)|needs?|wants?|missing|wish|would be (?:cool|nice|great)|add(?:ing)?|please add)\b/i;
  function asks(sources, tasks) {
    const have = (tasks || []).map(t => `${t.title || ''} ${t.desc || ''}`).join(' \n ');
    const by = {};
    for (const s of sources || []) {
      if (!s || !s.text || !/^(chat|update|doc|decision|proposal|comment)$/.test(s.kind)) continue;
      const t = String(s.text);
      if (!WANT.test(t)) continue;
      for (const [key, label, rx] of FEATURES) {
        if (!rx.test(t) || rx.test(have)) continue;
        const g = by[key] || (by[key] = { key, label, from: [], who: new Set() });
        if (g.from.length < 4) g.from.push({ kind: s.kind, ref: s.id, who: s.who || '', text: t.slice(0, 160) });
        g.who.add(s.who || '');
      }
    }
    return Object.values(by).map(g => ({ key: g.key, label: g.label, title: `Add ${g.label}`, n: g.from.length, people: g.who.size, from: g.from, score: 0.6 + Math.min(1.2, g.from.length * 0.3) + (g.who.size > 1 ? 0.4 : 0) }))
      .sort((a, b) => b.score - a.score);
  }

  return { weight, explain, record, rank, allowNew, CAP, editPatterns, siteEdits, siteTargets, whatOf, palette, accentOf, shape, lum, near, asks, hash, DAY, version: 1 };
});
