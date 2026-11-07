// The pinned repo hero, with "Flare": real imagery on the screen's one hero area (docs/DESIGN-SYSTEM.md).
// The picture comes from server/thumb.js: the README's first image (or GitHub's card for the repo), else the
// latest app screenshot, else a flat tile with the repo's initials on the project color. The text sits on a
// solid raised band under the image: no scrims, no gradients, no blur.
// Public: window.TribeRepoHero = { render(el, { project, status, empty }), refresh() }.
//   status: the /api/repo status (branch, ahead, behind, dirtyCount, commits, remote) or null while loading.
// Mounted by mobile2.js at the top of the phone Docs hub. On desktop it fits the top of #view-docs (above .docs-grid).
(function () {
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ink = hex => { const h = String(hex || '#F26B1D').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#12151A' : '#FFFFFF'; };
  const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!isFinite(s)) return ''; if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; };
  const ico = (d, sz = 18) => `<svg class="i" viewBox="0 0 24 24" style="width:${sz}px;height:${sz}px" aria-hidden="true">${d}</svg>`;
  const GIT = '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-11 5"/>';
  const RIGHT = '<path d="m9 6 6 6-6 6"/>';
  const LABEL = { readme: 'From the README', github: 'GitHub', screenshot: 'Latest screenshot', tile: '' };
  let thumb = null, at = 0, inflight = null;
  const hooks = [];   // onRender(fn): features add to the hero (preview.js: "Preview app")

  const token = () => encodeURIComponent(((window.TribeStore && window.TribeStore.get().server) || {}).token || '');
  const srcOf = t => (/^\//.test(t.src) ? `${C.base()}${t.src}${t.src.includes('?') ? '&' : '?'}token=${token()}` : t.src);
  const tile = t => `<div class="rhx-tile" style="background:${esc(t.color)};color:${ink(t.color)}"><span>${esc(t.initials || '?')}</span></div>`;
  function art(t) {
    if (!t) return '<div class="rhx-tile rhx-wait"></div>';
    if (t.kind === 'tile' || !t.src) return tile(t);
    return `<img alt="" src="${esc(srcOf(t))}" loading="lazy" decoding="async" referrerpolicy="no-referrer">${LABEL[t.kind] ? `<span class="rhx-src">${LABEL[t.kind]}</span>` : ''}`;
  }
  async function load(force) {
    if (!C.connected()) return null;
    if (!force && thumb && Date.now() - at < 10000) return thumb;
    if (inflight) return inflight;
    inflight = C.api('/thumb').then(r => { thumb = r.thumb; at = Date.now(); return thumb; }).catch(() => thumb).finally(() => { inflight = null; });
    return inflight;
  }
  function draw(el, { project, status, empty } = {}) {
    const s = status && status.enabled ? status : null, c = s && (s.commits || [])[0];
    const name = (thumb && thumb.name) || (s && ((s.remote && s.remote.github) || s.name)) || (project && project.name) || 'repo';
    el.classList.add('hero-card', 'rhx');
    el.dataset.kind = thumb ? thumb.kind : 'loading';
    if (!empty) { el.dataset.nav = 'repo'; el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', 'Open the repo ' + name); }
    el.innerHTML = `<div class="rhx-art">${art(thumb)}</div>
      <div class="rhx-band">
        <span class="eyebrow">Pinned repo</span>
        ${empty ? `<h2>No repo pinned yet</h2><p>Point this project at a git folder or a GitHub repo, and it lives here: its picture, branch, last commit, what changed.</p><div class="hero-acts"><button class="btn" data-nav="repo">Set up the repo</button></div>`
        : `<div class="rhx-n"><span class="rhx-ic">${ico(GIT, 18)}</span><span class="rhx-t"><b>${esc(name)}</b><small>${esc(s ? (s.upstream || 'local') : 'reading the repo…')}</small></span>${ico(RIGHT, 18)}</div>
        ${c ? `<div class="rhx-c"><code>${esc(c.sha)}</code><span><b>${esc(c.subject)}</b><small>${esc(c.author)} · ${esc(ago(c.at))}</small></span></div>` : ''}
        ${s ? `<div class="rhx-chips"><span class="rhx-chip live">${esc(s.branch || 'main')}</span><span class="rhx-chip">↑${s.ahead || 0} ↓${s.behind || 0}</span><span class="rhx-chip ${s.dirtyCount ? 'warn' : ''}">${s.dirtyCount ? `${s.dirtyCount} changed` : 'clean'}</span></div>` : ''}`}
      </div>`;
    const img = el.querySelector('.rhx-art img');
    hooks.forEach(fn => { try { fn(el, { project, status, empty }); } catch (e) { console.error(e); } });
    if (img) img.onerror = () => { const a = el.querySelector('.rhx-art'); if (a && thumb) { a.innerHTML = tile(thumb); el.dataset.kind = 'tile'; } };   // offline GitHub card etc.
  }
  async function render(el, opts = {}) {
    if (!el) return;
    draw(el, opts);
    const before = thumb && thumb.src + thumb.kind;
    await load(opts.force);
    if (el.isConnected && (thumb && thumb.src + thumb.kind) !== before) draw(el, opts);
    else if (el.isConnected && el.dataset.kind === 'loading') draw(el, opts);
  }
  // A new screenshot or README change can change the picture.
  C.on('ws', m => { if (m.type === 'visual' || m.type === 'visuals' || m.type === 'repo') at = 0; });
  C.on('project', () => { thumb = null; at = 0; });
  window.TribeRepoHero = { render, refresh: () => { at = 0; return load(true); }, current: () => thumb, onRender: fn => hooks.push(fn) };
})();
