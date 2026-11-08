// Profiles (feat/profiles): avatars, name colors, status and the profile popout, in one place other renderers call.
//   * Avatars: initials on a color (the default), an emoji on a tint, one of 24 pixel critters, or a photo. Animated
//     GIFs show their still frame until you hover them (calm by default).
//   * Name colors: a palette of 12. Each is checked against the current theme's surface; a color that would be hard
//     to read is nudged toward the text color until it reads at 4.5:1 (data-pf-fallback marks it).
//   * The popout: click any name or avatar (chat, member list, mentions). Banner, avatar, presence, status, bio,
//     links, local time, member since, projects in common, their agents, badges (roles when the tribe has them),
//     a private note, and Message / Add friend / Ask their AI, plus Activity, Mute and Copy user ID.
//   * The editor: TribeProfiles.edit(). A modal on desktop, a sheet on phones.
// Hooks are small on purpose: a decorator (MutationObserver) restyles chat rows, member rows and mentions after
// they render, so dm.js / chatx.js / bubbles.css only need to keep their data-by / data-follow attributes.
// Server: server/profiles.js (/api/profile). Styles: profiles.css.
//   window.TribeProfiles = { avatar(m, cls), fill(el, m), nameColor(m), displayName(m), open(id, anchor), close(),
//     edit(section), grouped(list, row), decorate(), palette, pixels, svg(id, tint) }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m);
  const isPhone = () => matchMedia('(max-width: 820px)').matches;
  const members = () => C.state().members || [];
  const meId = () => (C.state().me || {}).id;
  const memberOf = id => members().find(m => m.id === id) || null;
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ico = k => `<svg class="i" aria-hidden="true"><use href="#${k}"/></svg>`;

  // ---------- palette (same ids as server/profiles.js) ----------
  const PALETTE = { teal: '#38C6B1', indigo: '#6C7CFF', sky: '#4FA8F0', violet: '#A58BFF', rose: '#FF6F8E', coral: '#FF8A65',
    amber: '#F2B33D', lime: '#9AD65C', mint: '#4CD6A0', sand: '#D9B98C', orchid: '#E07BD0', slate: '#9AA7B8' };
  const EMOJI = ['🔥', '🦊', '🐻', '🐸', '🦉', '🐱', '🐰', '🦝', '🦔', '🍄', '🌲', '⛺', '⭐', '🌙', '🏕️', '🎮', '🎨', '🎧', '☕', '🌱', '🚀', '🧭', '🛶', '✨'];
  const STATUS_EMOJI = ['💻', '🎧', '☕', '🍕', '🏃', '🛠️', '🎮', '📚', '🌙', '🔥', '🌱', '✈️'];

  // ---------- 24 pixel critters (10×10, original art in the TribeCode campfire style) ----------
  const INK = { r: '#E8603C', o: '#F2B33D', y: '#FFD866', w: '#F8FAFC', k: '#1B2028', b: '#8B5A3C', n: '#C98B5B', g: '#7FBF5A', G: '#4E8A3E',
    t: '#38C6B1', s: '#9AA7B8', p: '#FF9AAE', u: '#4FA8F0', v: '#A58BFF', d: '#5A3A28', c: '#E9D8B4' };
  const ART = {
    flame:       ['....r.....', '....rr....', '...rro....', '...roor...', '..rrooor..', '..roooyr..', '.rrooyyor.', '.rooyyyor.', '.rooyyyor.', '..rroyorr.'],
    campfire:    ['....r.....', '...ror....', '...roor...', '..royyor..', '..royyor..', '...ryyr...', '.bb.rr.bb.', '..bbbbbb..', '.bb.bb.bb.', '..........'],
    tent:        ['..........', '....t.....', '...ttt....', '...tttt...', '..ttkttt..', '..tkkttt..', '.ttkkkttt.', '.tkkkkkttt', 'tttttttttt', '..........'],
    star:        ['....y.....', '....y.....', '...yyy....', 'yyyyyyyyy.', '.yyyyyyy..', '..yyyyy...', '..yy.yy...', '.yy...yy..', '.y.....y..', '..........'],
    moon:        ['...yyy....', '..yyw.....', '.yyw......', '.yy.......', 'yyy.......', 'yyy.......', '.yy.....y.', '.yyy...yy.', '..yyyyyyy.', '...yyyyy..'],
    fox:         ['.r......r.', '.rr....rr.', '.rrrrrrrr.', 'rrkrrrrkrr', 'rrrrrrrrrr', '.rwwrrwwr.', '..wwkkww..', '...wwww...', '....ww....', '..........'],
    owl:         ['.b......b.', '.bbbbbbbb.', 'bwwbbbbwwb', 'wkkwbbwkkw', 'bwwbobbwwb', '.bbbbbbbb.', '.bnnnnnnb.', '.bnnnnnnb.', '..bnnnnb..', '..o....o..'],
    bear:        ['.bb....bb.', '.bnbbbbnb.', '.bbbbbbbb.', 'bbkbbbbkbb', 'bbbbbbbbbb', 'bbbnnnnbbb', '.bbnkknbb.', '..bnnnnb..', '...bbbb...', '..........'],
    rabbit:      ['..w...w...', '..wp..wp..', '..wp..wp..', '..ww..ww..', '.wwwwwwww.', '.wkwwwwkw.', '.wwwppwww.', '..wwwwww..', '...wwww...', '..........'],
    frog:        ['.gg....gg.', 'gwkg..gwkg', 'gwwggggwwg', 'gggggggggg', 'gGggggggGg', 'ggGGGGGGgg', '.gggggggg.', '..gggggg..', '.gg....gg.', '..........'],
    cat:         ['.s......s.', '.ss....ss.', '.ssssssss.', 'ssyssssyss', 'ssksssskss', 'ssssppssss', '.ssskksss.', '..ssssss..', '...ssss...', '..........'],
    raccoon:     ['.s......s.', '.ss....ss.', '.ssssssss.', 'skkksskkks', 'skwksskwks', 'ssssssssss', '.sswkkwss.', '..swwwws..', '...ssss...', '..........'],
    hedgehog:    ['..........', '...b.b.b..', '..bbbbbbb.', '.bbbbbbbbb', 'bbbbbbbnnn', 'bbbbbbnnkn', 'bbbbbbnnnp', '.bbbbbnnn.', '..n...n...', '..........'],
    deer:        ['b.b....b.b', '.bb....bb.', '..bnnnnb..', '..nnnnnn..', '..nknnkn..', '..nnnnnn..', '...nccn...', '...ckkc...', '....cc....', '..........'],
    mushroom:    ['...rrrr...', '..rrwrrr..', '.rrrrrwrr.', '.rwrrrrrr.', 'rrrrrwrrrr', '...cccc...', '...cccc...', '...cccc...', '..gccccg..', '.gggggggg.'],
    pine:        ['....G.....', '...GGG....', '..GgGGG...', '...GGG....', '..GGgGG...', '.GGGGGGG..', '..GGGGG...', '.GGgGGGGG.', 'GGGGGGGGGG', '....bb....'],
    mountain:    ['..........', '....w.....', '...wws....', '..wssss...', '..ssssss..', '.sssssss..', '.ssssssss.', 'ssssssssss', 'GGGGGGGGGG', '..........'],
    lantern:     ['....kk....', '...k..k...', '..kkkkkk..', '..kyyyyk..', '..kyooyk..', '..kyooyk..', '..kyyyyk..', '..kkkkkk..', '...kkkk...', '..........'],
    marshmallow: ['........b.', '.......b..', '..wwwwbb..', '.wwwwwbw..', '.wcwwwww..', '.wwwwwww..', '..wwwww...', '..b.......', '.b........', 'b.........'],
    compass:     ['...oooo...', '..o....o..', '.o..r...o.', 'o..rr....o', 'o...kk...o', 'o....ss..o', 'o....s...o', '.o......o.', '..o....o..', '...oooo...'],
    canoe:       ['..........', '..........', '....k.....', '....k.....', '....kk....', 'r...k....r', 'rrrrrrrrrr', '.rrrrrrrr.', '..rrrrrr..', 'uuuuuuuuuu'],
    firefly:     ['..........', '..w....w..', '.www..www.', '..wwkkww..', '....kk....', '...kkkk...', '...kyyk...', '...yyyy...', '....yy....', '..........'],
    snail:       ['..........', '..........', '...bbbb...', '..bnnnnb..', '.bnbbbnnb.', '.bnbnbnnb.', '.bnbbnnb..', 'k.bbbbb...', 'cccccccc..', '..........'],
    acorn:       ['.....d....', '....d.....', '..dddddd..', '.dbdbdbdd.', '.dddddddd.', '..nnnnnn..', '..nnnnnn..', '...nnnn...', '....nn....', '..........'],
  };
  const PIXELS = Object.keys(ART);
  const svgCache = new Map();
  function svg(id, tint) {
    const key = id + '|' + (tint || ''); if (svgCache.has(key)) return svgCache.get(key);
    const rows = ART[id] || ART.flame; let rects = '';
    rows.forEach((row, y) => { for (let x = 0; x < 10; x++) { const ch = row[x]; if (ch && INK[ch]) rects += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${INK[ch]}"/>`; } });
    const out = `<svg class="pf-px" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect width="12" height="12" fill="${tint ? esc(PALETTE[tint] || tint) : '#2A313C'}"/>${rects}</svg>`;
    svgCache.set(key, out); return out;
  }

  // ---------- color: contrast against the theme's surface ----------
  function rgbOf(css) {
    const probe = rgbOf.el || (rgbOf.el = Object.assign(document.createElement('i'), { hidden: true }));
    if (!probe.isConnected) document.body.appendChild(probe);
    probe.style.color = ''; probe.style.color = css;
    const v = getComputedStyle(probe).color, m = v.match(/[\d.]+/g); if (!m) return null;
    return /^color\(srgb/.test(v) ? m.slice(0, 3).map(x => Number(x) * 255) : m.slice(0, 3).map(Number);
  }
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  let themeKey = '', inkCache = new Map();
  function themeColors() {
    const cs = getComputedStyle(document.body), key = (document.body.dataset.theme || '') + document.body.className;
    if (key !== themeKey) { themeKey = key; inkCache = new Map(); }
    return { surface: cs.getPropertyValue('--surface').trim() || '#1B2028', text: cs.getPropertyValue('--text').trim() || '#F8FAFC' };
  }
  // -> { color, fallback } or null when they use the default name color
  function legible(id) {
    const raw = PALETTE[id]; if (!raw) return null;
    const t = themeColors(); if (inkCache.has(id)) return inkCache.get(id);
    const bg = rgbOf(t.surface), to = rgbOf(t.text); let c = rgbOf(raw); let out = { color: raw, fallback: false };
    if (bg && to && c && ratio(c, bg) < 4.5) {
      for (let i = 0; i < 20 && ratio(c, bg) < 4.5; i++) c = c.map((v, k) => v + (to[k] - v) * 0.15);
      out = { color: hex(c), fallback: true };
    }
    inkCache.set(id, out); return out;
  }
  const nameColor = m => { const p = m && m.profile; return p && p.nameColor ? legible(p.nameColor) : null; };
  const ink = c => { const x = rgbOf(c); return x && lum(x) > 0.45 ? '#0B0C10' : '#fff'; };

  // ---------- names ----------
  const project = () => (C.project && C.project()) || null;
  function displayName(m) {
    if (!m) return 'someone';
    const n = m.profile && m.profile.nicks && project() && m.profile.nicks[project()];
    return n || m.name || 'someone';
  }

  // ---------- media URLs ----------
  const token = () => { try { return (window.TribeStore.get().server || {}).token || ''; } catch { return ''; } };
  const media = f => f ? `${C.base()}/api/profile/media/${encodeURIComponent(f)}?token=${encodeURIComponent(token())}` : '';

  // ---------- avatars ----------
  // Markup for the inside of an avatar (the caller keeps its own box size).
  function inner(m) {
    const a = m && m.profile && m.profile.avatar;
    if (!a) return null;
    if (a.kind === 'emoji') return { html: `<span class="pf-emo">${esc(a.emoji)}</span>`, bg: a.tint ? PALETTE[a.tint] : 'var(--surface-3)', cls: 'pf-k-emoji' };
    if (a.kind === 'pixel') return { html: svg(a.pixel, a.tint), bg: 'transparent', cls: 'pf-k-pixel' };
    if (a.kind === 'photo') {
      const still = a.anim && a.still ? media(a.still) : media(a.file);
      return { html: `<img class="pf-img" src="${esc(still)}" alt="" loading="lazy" ${a.anim ? `data-anim="${esc(media(a.file))}" data-still="${esc(still)}"` : ''}>`, bg: 'var(--surface-3)', cls: 'pf-k-photo' + (a.anim ? ' pf-anim' : '') };
    }
    return null;
  }
  // A full avatar element (for new renderers): <span class="pf-av …">.
  function avatar(m, cls = '') {
    const x = inner(m), st = m && m.state ? ` data-state="${esc(m.state)}"` : '';
    if (x) return `<span class="pf-av ${x.cls} ${esc(cls)}" style="background:${esc(x.bg)}"${st}>${x.html}</span>`;
    if (m && m.role === 'agent') return `<span class="pf-av pf-k-agent ${esc(cls)}"${st}>${ico('i-sparkle')}</span>`;
    const c = (m && m.color) || '#6C7CFF';
    return `<span class="pf-av ${esc(cls)}" style="background:${esc(c)};color:${ink(c)}"${st}>${esc(initials(m && m.name))}</span>`;
  }
  // Restyle an existing avatar box in place (keeps child dots like .st).
  function fill(el, m) {
    if (!el || !m) return false;
    const x = inner(m), sig = x ? x.html : '';
    if (el.dataset.pfSig === sig) return !!x;
    const keep = [...el.children].filter(c => c.matches('.st, .pf-dot, i.m2-on'));
    if (!x) { if (el.dataset.pfSig) { delete el.dataset.pfSig; el.classList.remove('pf-filled', 'pf-k-emoji', 'pf-k-pixel', 'pf-k-photo', 'pf-anim'); } return false; }
    el.dataset.pfSig = sig;
    el.classList.remove('pf-k-emoji', 'pf-k-pixel', 'pf-k-photo', 'pf-anim');
    el.classList.add('pf-filled', ...x.cls.split(' '));
    el.style.background = x.bg; el.innerHTML = x.html; keep.forEach(k => el.appendChild(k));
    return true;
  }
  // GIF avatars: still until hovered (or focused)
  const swap = (img, on) => { if (img && img.dataset.anim) img.src = on ? img.dataset.anim : img.dataset.still; };
  document.addEventListener('mouseover', e => { const img = e.target.closest && e.target.closest('.pf-anim'); if (img) swap(img.querySelector('img[data-anim]'), true); });
  document.addEventListener('mouseout', e => { const img = e.target.closest && e.target.closest('.pf-anim'); if (img && !img.contains(e.relatedTarget)) swap(img.querySelector('img[data-anim]'), false); });

  // ---------- presence + status words ----------
  const STATE = { online: 'Online', idle: 'Idle', dnd: 'Do not disturb', invisible: 'Invisible', offline: 'Offline' };
  const stateOf = m => (m && m.state) || (m && m.online ? 'online' : 'offline');
  const statusOf = m => { const s = m && m.profile && m.profile.status; return s && (!s.until || Date.parse(s.until) > Date.now()) ? s : null; };
  const statusLine = s => s ? `${s.emoji ? esc(s.emoji) + ' ' : ''}${esc(s.text || '')}`.trim() : '';

  // ---------- bio: markdown-light, safe ----------
  function bioHtml(src) {
    let t = esc(src || '');
    const codes = []; t = t.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)"]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer nofollow ugc">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)"]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer nofollow ugc">$2</a>');
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`).replace(/\n/g, '<br>');
  }
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  function localTime(tz) {
    try {
      const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
      const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return mine === tz ? `${t} local time` : `${t} for them`;
    } catch { return ''; }
  }
  const since = iso => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

  // ---------- private state (notes + mutes) ----------
  let mine = { muted: new Set(), notes: {}, loaded: false };
  async function loadMine() {
    if (!C.connected()) return;
    try { const r = await C.api('/profile'); mine = { muted: new Set(r.muted || []), notes: r.notes || {}, loaded: true, profile: r.profile }; decorate(true); } catch {}
  }

  // =====================================================================
  // Decorator: chat rows, member rows, mentions
  // =====================================================================
  let queued = false, force = false;
  function decorate(all) { if (all) force = true; if (queued) return; queued = true; requestAnimationFrame(run); }
  function nameRe() {
    const names = members().map(m => [displayName(m), m]).concat(members().map(m => [m.name, m])).filter(([n]) => n && n.length > 1);
    if (!names.length) return null;
    const alt = [...new Set(names.map(([n]) => n))].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return { re: new RegExp(`(^|[\\s(])@(${alt})(?![\\w])`, 'gi'), names };
  }
  function run() {
    queued = false; const all = force; force = false;
    const sel = s => document.querySelectorAll(all ? s : s.replace(/(^|,\s*)([^,]+)/g, '$1$2:not([data-pf])'));
    // chat rows
    for (const row of sel('.msg[data-by]')) {
      row.dataset.pf = '1';
      const m = memberOf(row.dataset.by); if (!m) continue;
      const av = row.querySelector(':scope > .avatar'); if (av) fill(av, m);
      const nm = row.querySelector('.mb > .nm, .mb > b'); const nc = nameColor(m);
      if (nm) {
        if (nc) { nm.style.setProperty('--nc', nc.color); nm.style.color = nc.color; nm.dataset.pfFallback = nc.fallback ? '1' : '0'; nm.dataset.pfColor = m.profile.nameColor; }
        else if (nm.dataset.pfColor) { nm.style.removeProperty('color'); delete nm.dataset.pfColor; delete nm.dataset.pfFallback; }
        const n = displayName(m), tn = [...nm.childNodes].find(x => x.nodeType === 3 && x.nodeValue.trim());
        if (tn && tn.nodeValue !== n && (tn.nodeValue === m.name || nm.dataset.pfNick)) { tn.nodeValue = n; nm.dataset.pfNick = '1'; }
      }
      row.classList.toggle('pf-muted', mine.muted.has(m.id) && m.id !== meId());
      mentions(row.querySelector('.mb'));
    }
    // member rows (room list, the people in the right panel)
    for (const row of sel('#room-list .person[data-follow]')) {
      row.dataset.pf = '1';
      const m = memberOf(row.dataset.follow); if (!m) continue;
      fill(row.querySelector('.avatar'), m);
      row.dataset.state = stateOf(m);
      const label = row.querySelector(':scope > div:not(.avatar) > span'); const nc = nameColor(m);
      if (label) { label.style.color = nc ? nc.color : ''; const tn = label.firstChild; if (tn && tn.nodeType === 3 && displayName(m) !== m.name) tn.nodeValue = displayName(m); }
      const s = statusOf(m), what = row.querySelector('.what');
      if (what && s) { what.textContent = statusLine(s); what.classList.add('pf-cs'); }
      if (what && !s && m.state === 'dnd') what.textContent = 'Do not disturb';
    }
    // doc mentions
    for (const el of sel('.dx-mention[data-peek^="person:"]')) {
      el.dataset.pf = '1'; const m = memberOf(el.dataset.peek.slice(7)); const nc = nameColor(m); if (nc) el.style.color = nc.color;
    }
    for (const el of sel('.pf-mention[data-pid]')) { el.dataset.pf = '1'; const nc = nameColor(memberOf(el.dataset.pid)); el.style.color = nc ? nc.color : ''; }
  }
  // @Name in chat text -> a colored chip that opens the popout
  function mentions(root) {
    if (!root || root.dataset.pfMn || !root.textContent.includes('@')) return;
    root.dataset.pfMn = '1';
    const r = nameRe(); if (!r) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('code, pre, a, .pf-mention, .nm, time, button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (w.nextNode()) if (w.currentNode.nodeValue.includes('@')) nodes.push(w.currentNode);
    for (const node of nodes) {
      const src = node.nodeValue; r.re.lastIndex = 0; if (!r.re.test(src)) continue; r.re.lastIndex = 0;
      const html = esc(src).replace(r.re, (all, pre, n) => {
        const hit = r.names.find(([x]) => x.toLowerCase() === n.toLowerCase()); if (!hit) return all;
        const nc = nameColor(hit[1]);
        return `${pre}<span class="pf-mention" data-pid="${esc(hit[1].id)}" data-pf="1" role="button" tabindex="0"${nc ? ` style="color:${esc(nc.color)}"` : ''}>@${n}</span>`;
      });
      const span = document.createElement('span'); span.innerHTML = html; node.replaceWith(...span.childNodes);
    }
  }
  new MutationObserver(muts => { for (const m of muts) if (m.addedNodes.length) { decorate(); return; } }).observe(document.body, { childList: true, subtree: true });
  C.on('presence', () => { decorate(true); if (pop && pop.id) refreshPop(); });
  C.on('hello', () => { loadMine(); decorate(true); });
  C.on('project', () => decorate(true));
  new MutationObserver(() => decorate(true)).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  // muted messages: tap to show
  document.addEventListener('click', e => { const r = e.target.closest && e.target.closest('.msg.pf-muted:not(.pf-show)'); if (r) { e.preventDefault(); e.stopPropagation(); r.classList.add('pf-show'); } }, true);

  // =====================================================================
  // Member list grouped by presence (app.js renderRoom calls this)
  // =====================================================================
  function grouped(list, row) {
    const order = ['online', 'idle', 'dnd', 'offline'], label = { online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline' };
    const by = { online: [], idle: [], dnd: [], offline: [] };
    for (const m of list) { const s = stateOf(m); (by[s === 'invisible' ? 'online' : s] || by.offline).push(m); }
    return order.filter(k => by[k].length).map(k => `<div class="pf-grp" data-grp="${k}">${label[k]} <span>${by[k].length}</span></div>${by[k].sort((a, b) => displayName(a).localeCompare(displayName(b))).map(row).join('')}`).join('');
  }

  // =====================================================================
  // Popout card
  // =====================================================================
  let pop = null;   // { id, el, scrim, data, anchor }
  function close() {
    if (!pop) return;
    const p = pop; pop = null;
    p.el.remove(); if (p.scrim) p.scrim.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  const onKey = e => { if (e.key === 'Escape' && pop) { e.stopPropagation(); close(); } };
  function bannerStyle(p) {
    const b = p.banner;
    if (b && b.image) return `background:var(--surface-3) url('${esc(media(b.image))}') center/cover no-repeat`;
    if (b && b.color && PALETTE[b.color]) return `background:${PALETTE[b.color]}`;
    return 'background:var(--surface-3)';
  }
  function card(d, { preview = false } = {}) {
    const m = { ...d.member, ...(memberOf(d.member.id) || {}), profile: d.profile }, p = d.profile || {};
    const s = p.status && (!p.status.until || Date.parse(p.status.until) > Date.now()) ? p.status : null;
    const st = d.you && p.presence === 'invisible' ? 'invisible' : stateOf(m);
    const nc = nameColor(m), nick = displayName(m) !== m.name;
    const badges = (d.badges || []).map(b => `<span class="pf-badge b-${esc(b.id)}">${esc(b.label)}</span>`).join('');
    const links = (p.links || []).map(l => `<a class="pf-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer nofollow">${ico('i-link')}<span>${esc(l.label || host(l.url))}</span></a>`).join('');
    const facts = [
      p.tz ? `<span class="pf-fact" data-tz="${esc(p.tz)}">${esc(localTime(p.tz))}</span>` : '',
      m.joined ? `<span class="pf-fact">Member since ${esc(since(m.joined))}</span>` : '',
    ].filter(Boolean).join('');
    const acts = preview || d.you ? '' : `<div class="pf-acts">
        ${!m.agent || m.owner === meId() ? `<button class="btn tonal" data-pop="dm">${ico('i-chat')}Message</button>` : ''}
        ${!m.agent ? `<button class="btn tonal" data-pop="friend" aria-pressed="${isFriend(m.id)}">${ico('i-users')}${isFriend(m.id) ? 'Friends' : 'Add friend'}</button>` : ''}
        ${(m.agent || (d.agents || []).length) ? `<button class="btn tonal" data-pop="ask">${ico('i-sparkle')}Ask ${m.agent ? 'it' : 'their AI'}</button>` : ''}
      </div>`;
    return `<div class="pf-banner" style="${bannerStyle(p)}"></div>
      <div class="pf-top"><span class="pf-avbox">${avatar(m, 'xl')}<i class="pf-dot" data-state="${esc(st)}" title="${esc(STATE[st] || '')}"></i></span>
        ${preview ? '' : `<button class="pf-more tb-icon" data-pop="more" aria-label="More" aria-haspopup="menu">${ico('i-more')}</button>`}</div>
      <div class="pf-id"><h3 class="pf-name"${nc ? ` style="color:${esc(nc.color)}" data-pf-fallback="${nc.fallback ? 1 : 0}"` : ''}>${esc(displayName(m))}</h3>
        <div class="pf-sub">${nick ? `<span>${esc(m.name)}</span>` : ''}${p.pronouns ? `<span>${esc(p.pronouns)}</span>` : ''}${m.agent && m.ownerName ? `<span>${esc(m.ownerName)}'s agent</span>` : ''}<span class="pf-st" data-state="${esc(st)}">${esc(STATE[st] || '')}</span></div>
        ${badges ? `<div class="pf-badges">${badges}</div>` : ''}</div>
      ${s ? `<div class="pf-status">${s.emoji ? `<span class="pf-se">${esc(s.emoji)}</span>` : ''}<span>${esc(s.text || '')}</span></div>` : ''}
      ${acts}
      ${p.bio ? `<section class="pf-sec"><span class="eyebrow">About me</span><div class="pf-bio">${bioHtml(p.bio)}</div></section>` : ''}
      ${links ? `<section class="pf-sec"><div class="pf-links">${links}</div></section>` : ''}
      ${facts ? `<div class="pf-facts">${facts}</div>` : ''}
      ${preview ? '' : `${(d.inCommon || []).length && !d.you ? `<section class="pf-sec"><span class="eyebrow">Projects in common</span><div class="pf-chips">${d.inCommon.map(x => `<span class="pf-chip">${esc(x.name)}</span>`).join('')}</div></section>` : ''}
      ${(d.agents || []).length ? `<section class="pf-sec"><span class="eyebrow">${d.you ? 'Your agents' : 'Their agents'}</span><div class="pf-agents">${d.agents.map(a => { const am = memberOf(a.id) || a; return `<button class="pf-agent" data-pop-agent="${esc(a.id)}">${avatar({ ...am, role: 'agent' }, 'sm')}<span>${esc(a.name)}</span><i class="pf-dot sm" data-state="${esc(stateOf(am))}"></i></button>`; }).join('')}</div></section>` : ''}
      ${d.you ? `<div class="pf-acts"><button class="btn primary" data-pop="edit">Edit profile</button><button class="btn tonal" data-pop="activity">Activity</button></div>`
        : `${window.TribePeople ? '<button class="linkish pf-full" data-pop="activity">View activity</button>' : ''}<section class="pf-sec pf-note"><label class="eyebrow" for="pf-note-in">Note <span class="pf-only">only you see this</span></label><textarea id="pf-note-in" class="pf-note-in" maxlength="256" rows="2" placeholder="Click to add a note">${esc(d.note || '')}</textarea></section>`}`}`;
  }
  let friendSet = null;
  const isFriend = id => !!(friendSet && friendSet.has(id)) || !!(window.TribeFriends && window.TribeFriends.list && window.TribeFriends.list().includes(id));
  async function open(id, anchor) {
    if (!id || id === 'tribecode' || id === 'brain' || !C.connected()) return;
    if (pop && pop.id === id) { close(); return; }
    close();
    const phone = isPhone();
    const el = document.createElement('div'); el.id = 'pf-pop'; el.className = 'pf-pop' + (phone ? ' sheet' : ''); el.setAttribute('role', 'dialog'); el.tabIndex = -1;
    const m = memberOf(id) || { id, name: '…' };
    el.setAttribute('aria-label', `${displayName(m)}'s profile`);
    el.innerHTML = `${phone ? '<div class="pf-grab" aria-hidden="true"></div>' : ''}<div class="pf-banner" style="background:var(--surface-3)"></div><div class="pf-top"><span class="pf-avbox">${avatar(m, 'xl')}</span></div><div class="pf-id"><h3 class="pf-name">${esc(displayName(m))}</h3></div>`;
    let scrim = null;
    if (phone) { scrim = document.createElement('div'); scrim.className = 'pf-scrim'; scrim.onclick = close; document.body.appendChild(scrim); }
    document.body.appendChild(el);
    pop = { id, el, scrim, anchor };
    place();
    document.addEventListener('keydown', onKey, true);
    try {
      const [d, fr] = await Promise.all([C.api(`/profile/${encodeURIComponent(id)}`), friendSet ? null : C.api('/friends').catch(() => null)]);
      if (fr) friendSet = new Set(fr.friends || []);
      if (!pop || pop.id !== id) return;
      pop.data = d; draw(); el.focus({ preventScroll: true });
    } catch (e) { if (pop && pop.id === id) el.insertAdjacentHTML('beforeend', `<p class="pf-err">${esc(e.message)}</p>`); }
  }
  async function refreshPop() {
    if (!pop || !pop.data) return;
    const id = pop.id;
    try { const d = await C.api(`/profile/${encodeURIComponent(id)}`); if (pop && pop.id === id) { pop.data = d; const ta = pop.el.querySelector('#pf-note-in'); if (ta && document.activeElement === ta) return; draw(); } } catch {}
  }
  function draw() {
    if (!pop || !pop.data) return;
    pop.el.innerHTML = `${pop.scrim ? '<div class="pf-grab" aria-hidden="true"></div>' : ''}${card(pop.data)}`;
    place();
  }
  function place() {
    if (!pop || pop.scrim) return;
    const el = pop.el, a = pop.anchor && pop.anchor.isConnected ? pop.anchor.getBoundingClientRect() : null;
    const w = el.offsetWidth || 320, h = el.offsetHeight || 360;
    let x = a ? a.right + 10 : (innerWidth - w) / 2, y = a ? a.top - 20 : 80;
    if (x + w > innerWidth - 12) x = a ? Math.max(12, a.left - w - 10) : innerWidth - w - 12;
    y = Math.max(12, Math.min(y, innerHeight - h - 12));
    el.style.left = `${Math.max(12, x)}px`; el.style.top = `${y}px`;
  }
  addEventListener('resize', () => { if (pop && !pop.scrim) place(); });
  document.addEventListener('click', e => {
    if (!pop || !e.target.closest) return;
    if (e.target.closest('#pf-pop, #pf-menu2, .pf-trigger-open')) return;
    close();
  });

  let noteTimer = null;
  document.addEventListener('input', e => {
    if (!e.target.matches || !e.target.matches('#pf-note-in') || !pop) return;
    const id = pop.id, v = e.target.value;
    clearTimeout(noteTimer); noteTimer = setTimeout(() => C.api(`/profile/${encodeURIComponent(id)}/note`, { method: 'PUT', body: { text: v } }).then(r => { mine.notes[id] = r.note; if (pop && pop.data) pop.data.note = r.note; }).catch(err => toast(err.message)), 500);
  });
  document.addEventListener('click', async e => {
    const t = e.target; if (!t.closest || !t.closest('#pf-pop, #pf-menu2')) return;
    const ag = t.closest('[data-pop-agent]'); if (ag) { const aid = ag.dataset.popAgent; close(); return open(aid); }
    const b = t.closest('[data-pop]'); if (!b || !pop) return;
    const d = pop.data, id = pop.id, k = b.dataset.pop; if (!d) return;
    if (k === 'more') return moreMenu(b);
    if (k === 'friend') {
      const on = !isFriend(id);
      try { const r = await C.api('/friends', { method: 'PUT', body: { id, on } }); friendSet = new Set(r.friends || []); draw(); toast(on ? `${displayName(d.member)} is now a friend` : 'Removed from friends'); } catch (err) { toast(err.message); }
      return;
    }
    menuClose();
    if (k === 'dm') { close(); return window.TribeDM && window.TribeDM.open(id); }
    if (k === 'edit') { close(); return edit(); }
    if (k === 'activity') { close(); return window.TribePeople && window.TribePeople.open(id); }
    if (k === 'copy') { try { await navigator.clipboard.writeText(id); toast('User ID copied'); } catch { prompt('User ID', id); } return; }
    if (k === 'mute') {
      const on = !d.muted;
      try { await C.api(`/profile/${encodeURIComponent(id)}/mute`, { method: 'PUT', body: { on } }); d.muted = on; on ? mine.muted.add(id) : mine.muted.delete(id); decorate(true); toast(on ? `Muted ${displayName(d.member)} for you` : `Unmuted ${displayName(d.member)}`); } catch (err) { toast(err.message); }
      return;
    }
    if (k === 'ask') {
      const agentId = d.member.agent ? id : (d.agents[0] || {}).id; if (!agentId) return;
      const q = window.prompt(`Ask ${d.member.agent ? d.member.name : 'their AI'}`); if (!q || !q.trim()) return;
      try { await C.api('/agents/channel', { method: 'POST', body: { text: `@${agentId} ${q.trim()}` } }); toast('Asked. The reply shows in #agents.'); } catch (err) { toast(err.message); }
    }
  });
  let menuEl = null;
  const menuClose = () => { if (menuEl) { menuEl.remove(); menuEl = null; } };
  function moreMenu(btn) {
    if (menuEl) return menuClose();
    const d = pop.data;
    menuEl = document.createElement('div'); menuEl.id = 'pf-menu2'; menuEl.className = 'pf-menu2'; menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML = `${window.TribePeople ? '<button role="menuitem" data-pop="activity">Activity</button>' : ''}
      ${d.you ? '<button role="menuitem" data-pop="edit">Edit profile</button>' : `<button role="menuitem" data-pop="mute">${d.muted ? 'Unmute' : 'Mute for me'}</button>`}
      <button role="menuitem" data-pop="copy">Copy user ID</button>`;
    pop.el.appendChild(menuEl);
    const r = btn.getBoundingClientRect(), pr = pop.el.getBoundingClientRect();
    menuEl.style.top = `${r.bottom - pr.top + 4}px`; menuEl.style.right = `${pr.right - r.right}px`;
  }

  // open from any name or avatar (capture, so this wins over row handlers; people.js stays reachable via Activity)
  const isSys = id => !id || id === 'tribecode' || id === 'brain';
  addEventListener('click', e => {
    const t = e.target; if (!t.closest || t.closest('#pf-pop, #person-panel, .pf-editor')) return;
    const hit = t.closest('.msg[data-by] > .avatar, .msg[data-by] .mb > .nm, .msg[data-by] .mb > b, #room-list .person[data-follow] .avatar, .pf-mention[data-pid], .dx-mention[data-peek^="person:"], [data-pop-person]');
    if (!hit) return;
    const id = hit.dataset.pid || hit.dataset.popPerson || (hit.dataset.peek ? hit.dataset.peek.slice(7) : null) || (hit.closest('[data-by]') || {}).dataset?.by || (hit.closest('[data-follow]') || {}).dataset?.follow;
    if (isSys(id) || !memberOf(id)) return;
    if (hit.closest('.msg.pf-muted:not(.pf-show)')) return;
    e.preventDefault(); e.stopPropagation();
    open(id, hit);
  }, true);
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.pf-mention[data-pid]')) { e.preventDefault(); open(e.target.dataset.pid, e.target); } });

  // =====================================================================
  // Editor
  // =====================================================================
  let ed = null;   // { el, scrim, draft, target }
  const meMember = () => memberOf(meId()) || C.state().me || {};
  async function edit(section, opts = {}) {
    if (!C.connected()) { toast('Connect to your tribe first.'); return; }
    closeEditor();
    let r; try { r = await C.api('/profile'); } catch (e) { toast(e.message); return; }
    const m = meMember(), p = r.profile || {};
    const draft = {
      name: m.name || '', avatar: p.avatar || { kind: 'initials' }, nameColor: p.nameColor || null, pronouns: p.pronouns || '', bio: p.bio || '',
      banner: p.banner || null, status: p.status ? { emoji: p.status.emoji || '', text: p.status.text || '', clear: 'keep' } : { emoji: '', text: '', clear: 'never' },
      presence: p.presence || 'online', links: [0, 1, 2].map(i => (p.links || [])[i] ? p.links[i].url : ''), labels: [0, 1, 2].map(i => ((p.links || [])[i] || {}).label || null), tz: p.tz || null,
      nick: (p.nicks || {})[project()] || '', tab: p.avatar ? p.avatar.kind : 'initials', tint: (p.avatar && p.avatar.tint) || 'teal', photoPending: null,
    };
    const phone = isPhone();
    const el = document.createElement('div'); el.className = 'pf-editor' + (phone ? ' sheet' : ''); el.id = 'pf-editor'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Edit profile');
    const scrim = document.createElement('div'); scrim.className = 'pf-scrim ed'; scrim.onclick = closeEditor;
    document.body.append(scrim, el);
    ed = { el, scrim, draft, saved: JSON.stringify(draft) };
    drawEditor();
    if (section) { const s = el.querySelector(`[data-sec="${section}"]`); if (s) s.scrollIntoView({ block: 'start' }); }
    document.addEventListener('keydown', edKey, true);
  }
  const edKey = e => { if (e.key === 'Escape' && ed) { e.stopPropagation(); closeEditor(); } };
  function closeEditor() { if (!ed) return; ed.el.remove(); ed.scrim.remove(); ed = null; document.removeEventListener('keydown', edKey, true); }
  const sw = (id, on, attr) => `<button type="button" class="pf-sw ${on ? 'on' : ''}" ${attr}="${id}" style="background:${PALETTE[id]}" aria-label="${id}" aria-pressed="${!!on}" title="${id}"></button>`;
  function previewData() {
    const d = ed.draft, m = meMember();
    const av = d.tab === 'photo' ? (d.photoPending ? { kind: 'photo-local' } : (d.avatar.kind === 'photo' ? d.avatar : null))
      : d.tab === 'emoji' ? { kind: 'emoji', emoji: d.avatar.emoji || '🔥', tint: d.tint } : d.tab === 'pixel' ? { kind: 'pixel', pixel: d.avatar.pixel || 'flame', tint: d.tint } : null;
    const status = d.status.text || d.status.emoji ? { emoji: d.status.emoji || null, text: d.status.text } : null;
    return { member: { ...m, name: d.name || m.name }, you: true, profile: { avatar: av && av.kind !== 'photo-local' ? av : null, nameColor: d.nameColor, pronouns: d.pronouns, bio: d.bio, banner: d.banner, links: d.links.map((url, i) => ({ url, label: d.labels[i] })).filter(l => l.url), tz: d.tz, status, presence: d.presence, nicks: d.nick ? { [project()]: d.nick } : {} }, badges: [] };
  }
  function drawEditor() {
    if (!ed) return;
    const d = ed.draft, el = ed.el, tabs = [['initials', 'Initials'], ['emoji', 'Emoji'], ['pixel', 'Pixel'], ['photo', 'Photo']];
    const tints = d.tab === 'emoji' || d.tab === 'pixel' ? `<div class="pf-row-sw" role="group" aria-label="Tint">${Object.keys(PALETTE).map(k => sw(k, d.tint === k, 'data-tint')).join('')}</div>` : '';
    const picker = d.tab === 'emoji' ? `<div class="pf-grid emo">${EMOJI.map(x => `<button type="button" class="pf-cell ${d.avatar.emoji === x ? 'on' : ''}" data-emo="${x}">${x}</button>`).join('')}</div><input class="input pf-emo-in" id="pf-emo-in" maxlength="16" placeholder="Or type one emoji" value="${esc(d.avatar.kind === 'emoji' && !EMOJI.includes(d.avatar.emoji) ? d.avatar.emoji || '' : '')}">`
      : d.tab === 'pixel' ? `<div class="pf-grid px">${PIXELS.map(x => `<button type="button" class="pf-cell ${d.avatar.pixel === x ? 'on' : ''}" data-px="${x}" aria-label="${x}" title="${x}">${svg(x, d.tint)}</button>`).join('')}</div>`
      : d.tab === 'photo' ? `<div class="pf-photo"><button type="button" class="btn tonal" data-ed="photo">${d.avatar.kind === 'photo' || d.photoPending ? 'Change picture' : 'Upload a picture'}</button><small class="faint">PNG, JPEG, WebP or GIF. GIFs move only when someone hovers them.</small></div>`
      : '<p class="faint pf-hint">Your initials on your color.</p>';
    const presence = [['online', 'Online', 'Shown when you are here'], ['idle', 'Idle', 'Shown as away'], ['dnd', 'Do not disturb', 'No phone or desktop alerts'], ['invisible', 'Invisible', 'Look offline, use everything']];
    const scrollTop = el.querySelector('.pf-ed-body') ? el.querySelector('.pf-ed-body').scrollTop : 0;
    el.innerHTML = `${ed.scrim && isPhone() ? '<div class="pf-grab" aria-hidden="true"></div>' : ''}
      <header class="pf-ed-head"><div><span class="eyebrow">You</span><h2>Edit profile</h2></div><button class="btn ghost" data-ed="cancel">Cancel</button></header>
      <div class="pf-ed-body">
        <div class="pf-ed-prev pf-pop static" aria-label="Preview">${card(previewData(), { preview: true })}</div>
        <section class="pf-ed-sec" data-sec="avatar"><span class="eyebrow">Avatar</span>
          <div class="pf-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="${d.tab === k ? 'on' : ''}" aria-selected="${d.tab === k}" data-tab="${k}">${l}</button>`).join('')}</div>
          ${picker}${tints}</section>
        <section class="pf-ed-sec" data-sec="name"><span class="eyebrow">Name</span>
          <label class="pf-lbl">Display name<input class="input" id="pf-name" maxlength="32" value="${esc(d.name)}" autocomplete="off"></label>
          ${project() ? `<label class="pf-lbl">Nickname in this project <small class="faint">optional</small><input class="input" id="pf-nick" maxlength="32" value="${esc(d.nick)}" autocomplete="off" placeholder="${esc(d.name)}"></label>` : ''}
          <label class="pf-lbl">Pronouns <small class="faint">optional</small><input class="input" id="pf-pron" maxlength="40" value="${esc(d.pronouns)}" autocomplete="off" placeholder="they/them"></label>
          <div class="pf-lbl">Name color<div class="pf-row-sw" role="group" aria-label="Name color"><button type="button" class="pf-sw none ${!d.nameColor ? 'on' : ''}" data-nc="" aria-label="Default" aria-pressed="${!d.nameColor}" title="Default"></button>${Object.keys(PALETTE).map(k => sw(k, d.nameColor === k, 'data-nc')).join('')}</div></div></section>
        <section class="pf-ed-sec" data-sec="about"><span class="eyebrow">About me</span>
          <textarea class="input pf-bio-in" id="pf-bio" maxlength="300" rows="4" placeholder="A line or two about you. **bold**, *italic* and links work.">${esc(d.bio)}</textarea><small class="faint pf-count" id="pf-bio-n">${d.bio.length}/300</small>
          <div class="pf-lbl">Links <small class="faint">up to 3</small>${d.links.map((u, i) => `<input class="input pf-link-in" data-link="${i}" maxlength="300" inputmode="url" placeholder="https://" value="${esc(u)}">`).join('')}</div>
          <div class="pf-lbl">Banner<div class="pf-row-sw" role="group" aria-label="Banner"><button type="button" class="pf-sw none ${!d.banner ? 'on' : ''}" data-bn="" aria-label="No banner" title="None"></button>${Object.keys(PALETTE).map(k => sw(k, d.banner && d.banner.color === k, 'data-bn')).join('')}<button type="button" class="btn tonal sm" data-ed="banner">${d.banner && d.banner.image ? 'Change picture' : 'Picture'}</button></div></div>
          <label class="pf-check"><input type="checkbox" id="pf-tz" ${d.tz ? 'checked' : ''}> Show my local time${d.tz ? ` <small class="faint">(${esc(d.tz)})</small>` : ''}</label></section>
        <section class="pf-ed-sec" data-sec="status"><span class="eyebrow">Status</span>
          <div class="pf-status-row"><input class="input pf-se-in" id="pf-se" maxlength="16" value="${esc(d.status.emoji)}" placeholder="🙂" aria-label="Status emoji"><input class="input" id="pf-st" maxlength="80" value="${esc(d.status.text)}" placeholder="What are you up to?" aria-label="Status text"></div>
          <div class="pf-row-emo">${STATUS_EMOJI.map(x => `<button type="button" class="pf-cell sm" data-se="${x}">${x}</button>`).join('')}</div>
          <label class="pf-lbl">Clear after<select class="input" id="pf-clear">${d.status.clear === 'keep' ? '<option value="keep" selected>Keep as is</option>' : ''}${[['30m', '30 minutes'], ['4h', '4 hours'], ['today', 'Today'], ['never', "Don't clear"]].map(([v, l]) => `<option value="${v}" ${d.status.clear === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${d.status.text || d.status.emoji ? '<button type="button" class="linkish" data-ed="clear-status">Clear status</button>' : ''}
          <div class="pf-pres" role="radiogroup" aria-label="Presence">${presence.map(([k, l, h]) => `<button type="button" role="radio" aria-checked="${d.presence === k}" class="pf-pres-o ${d.presence === k ? 'on' : ''}" data-pres="${k}"><i class="pf-dot" data-state="${k}"></i><span><b>${l}</b><small>${h}</small></span></button>`).join('')}</div></section>
      </div>
      <footer class="pf-ed-foot"><button class="btn ghost" data-ed="cancel">Cancel</button><button class="btn primary" data-ed="save" id="pf-save">Save</button></footer>`;
    const nb = el.querySelector('.pf-ed-body'); if (nb) nb.scrollTop = scrollTop;
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const redrawSoon = debounce(() => { if (!ed) return; const f = document.activeElement && document.activeElement.id; const pos = document.activeElement && document.activeElement.selectionStart; const prev = ed.el.querySelector('.pf-ed-prev'); if (prev) prev.innerHTML = card(previewData(), { preview: true }); if (f) { const x = document.getElementById(f); if (x && x !== document.activeElement) { x.focus(); try { x.setSelectionRange(pos, pos); } catch {} } } }, 120);
  document.addEventListener('input', e => {
    if (!ed || !ed.el.contains(e.target)) return;
    const d = ed.draft, t = e.target, v = t.value;
    if (t.id === 'pf-name') d.name = v; else if (t.id === 'pf-nick') d.nick = v; else if (t.id === 'pf-pron') d.pronouns = v;
    else if (t.id === 'pf-bio') { d.bio = v; const n = ed.el.querySelector('#pf-bio-n'); if (n) n.textContent = `${v.length}/300`; }
    else if (t.dataset.link !== undefined) { const i = +t.dataset.link; if (host(v.trim()) !== host(d.links[i] || '')) d.labels[i] = null; d.links[i] = v.trim(); }
    else if (t.id === 'pf-st') { d.status.text = v; if (d.status.clear === 'keep') d.status.clear = 'never'; }
    else if (t.id === 'pf-se') { d.status.emoji = v.trim(); if (d.status.clear === 'keep') d.status.clear = 'never'; }
    else if (t.id === 'pf-emo-in') { if (v.trim()) d.avatar = { kind: 'emoji', emoji: v.trim() }; }
    redrawSoon();
  });
  document.addEventListener('change', e => {
    if (!ed || !ed.el.contains(e.target)) return;
    const d = ed.draft, t = e.target;
    if (t.id === 'pf-clear') d.status.clear = t.value;
    if (t.id === 'pf-tz') { d.tz = t.checked ? Intl.DateTimeFormat().resolvedOptions().timeZone : null; drawEditor(); }
  });
  document.addEventListener('click', async e => {
    if (!ed || !e.target.closest || !ed.el.contains(e.target)) return;
    const d = ed.draft, t = e.target, x = s => t.closest(s);
    let b;
    if ((b = x('[data-tab]'))) { d.tab = b.dataset.tab; if (d.tab === 'emoji' && d.avatar.kind !== 'emoji') d.avatar = { kind: 'emoji', emoji: '🔥' }; if (d.tab === 'pixel' && d.avatar.kind !== 'pixel') d.avatar = { kind: 'pixel', pixel: 'flame' }; return drawEditor(); }
    if ((b = x('[data-emo]'))) { d.avatar = { kind: 'emoji', emoji: b.dataset.emo }; return drawEditor(); }
    if ((b = x('[data-px]'))) { d.avatar = { kind: 'pixel', pixel: b.dataset.px }; return drawEditor(); }
    if ((b = x('[data-tint]'))) { d.tint = b.dataset.tint; return drawEditor(); }
    if ((b = x('[data-nc]'))) { d.nameColor = b.dataset.nc || null; return drawEditor(); }
    if ((b = x('[data-bn]'))) { d.banner = b.dataset.bn ? { color: b.dataset.bn } : null; return drawEditor(); }
    if ((b = x('[data-se]'))) { d.status.emoji = b.dataset.se; if (d.status.clear === 'keep') d.status.clear = 'never'; return drawEditor(); }
    if ((b = x('[data-pres]'))) { d.presence = b.dataset.pres; return drawEditor(); }
    if (!(b = x('[data-ed]'))) return;
    const k = b.dataset.ed;
    if (k === 'cancel') return closeEditor();
    if (k === 'clear-status') { d.status = { emoji: '', text: '', clear: 'never' }; return drawEditor(); }
    if (k === 'photo') return pickPhoto();
    if (k === 'banner') return pickBanner();
    if (k === 'save') return save();
  });
  // photo: GIFs upload as they are (animated) with a first-frame still; everything else goes through the cropper
  async function pickPhoto(file) {
    file = file || await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp,image/gif'; i.onchange = () => res(i.files[0] || null); i.addEventListener('cancel', () => res(null)); i.click(); });
    if (!file) return;
    try {
      let image, still = null;
      if (file.type === 'image/gif') {
        if (file.size > 2_000_000) throw new Error('That GIF is over 2 MB. Pick a smaller one.');
        image = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
        const bmp = await createImageBitmap(file), cv = document.createElement('canvas'), s = Math.min(bmp.width, bmp.height);
        cv.width = cv.height = Math.min(256, s); cv.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, cv.width, cv.height);
        still = cv.toDataURL('image/png');
      } else {
        if (!window.TribeCropper) throw new Error('The picture tool is not loaded.');
        image = await window.TribeCropper.pick({ file, size: 256, title: 'Frame your avatar' });
        if (!image) return;
      }
      const r = await C.api('/profile/avatar', { method: 'POST', body: { image, still } });
      if (ed) { ed.draft.avatar = r.profile.avatar; ed.draft.tab = 'photo'; drawEditor(); }
      toast('Picture saved');
    } catch (e) { toast(e.message); }
  }
  async function pickBanner() {
    const file = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp'; i.onchange = () => res(i.files[0] || null); i.addEventListener('cancel', () => res(null)); i.click(); });
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file), W = 600, H = 200, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const k = Math.max(W / bmp.width, H / bmp.height), w = bmp.width * k, h = bmp.height * k;
      cv.getContext('2d').drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
      let url = cv.toDataURL('image/webp', 0.85); if (!/^data:image\/webp/.test(url)) url = cv.toDataURL('image/jpeg', 0.85);
      const r = await C.api('/profile/banner', { method: 'POST', body: { image: url } });
      if (ed) { ed.draft.banner = r.profile.banner; drawEditor(); }
    } catch (e) { toast(e.message); }
  }
  async function save() {
    const d = ed.draft, btn = ed.el.querySelector('#pf-save'); if (btn) btn.disabled = true;
    const body = {
      nameColor: d.nameColor, pronouns: d.pronouns, bio: d.bio, presence: d.presence, tz: d.tz,
      links: d.links.map((url, i) => ({ url, label: d.labels[i] })).filter(l => l.url),
      banner: d.banner ? (d.banner.image ? { image: d.banner.image } : { color: d.banner.color }) : null,
      avatar: d.tab === 'initials' ? { kind: 'initials' } : d.tab === 'emoji' ? { kind: 'emoji', emoji: d.avatar.emoji || '🔥', tint: d.tint } : d.tab === 'pixel' ? { kind: 'pixel', pixel: d.avatar.pixel || 'flame', tint: d.tint } : (d.avatar.kind === 'photo' ? { kind: 'photo' } : { kind: 'initials' }),
    };
    if (d.status.clear !== 'keep') {
      const midnight = new Date(); midnight.setHours(23, 59, 59, 0);
      body.status = d.status.text || d.status.emoji ? { emoji: d.status.emoji || null, text: d.status.text, clear: d.status.clear, until: d.status.clear === 'today' ? midnight.toISOString() : undefined } : null;
    }
    if (project()) body.nick = { project: project(), text: d.nick };
    try {
      await C.api('/profile', { method: 'PATCH', body });
      const name = d.name.trim();
      if (name && name !== meMember().name) {
        await C.api('/me', { method: 'PATCH', body: { name } });
        try { window.TribeStore.set({ name }); } catch {}
      }
      closeEditor(); toast('Profile saved'); loadMine();
    } catch (e) { toast(e.message); if (btn) btn.disabled = false; }
  }
  // quick presence (profile menu)
  async function setPresence(p) { try { await C.api('/profile', { method: 'PATCH', body: { presence: p } }); toast(STATE[p]); } catch (e) { toast(e.message); } }

  window.TribeProfiles = { avatar, fill, nameColor, legible, displayName, open, close, edit, closeEditor, grouped, decorate, setPresence, statusOf, statusLine, stateOf,
    palette: PALETTE, pixels: PIXELS, svg, bioHtml, STATE, muted: id => mine.muted.has(id) };
  if (C.connected()) loadMine();
})();
