// Gists, client side: compact cards for the short structured updates agents post (server/gists.js).
// In chat, any message that carries a `gist` is upgraded to a card (kind, author with their role color,
// 3-5 bullets, an expandable list of files as folder chips, a link to the diff). The Updates feed
// (app/ui/flow.js) uses the same card. Folder chips show which role's area a file is in: the role's
// color dot + the folder's friendly name.
//   window.TribeGists.render(msg) -> card HTML or null (for chat renderers that want to draw it themselves)
//   window.TribeGists.card(gist), .fchip(path), .roleChip(role)
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (id, cls = '') => `<svg class="i ${cls}"><use href="#${id}"/></svg>`;
  const KIND = {
    progress: { ico: 'i-tick', label: 'Progress' },
    upgrade: { ico: 'i-zap', label: 'Upgrade' },
    plan: { ico: 'i-map', label: 'Plan' },
    blocker: { ico: 'i-hand', label: 'Blocker' },
    assessment: { ico: 'i-eye', label: 'Assessment' },
  };
  const byMsg = new Map(), byId = new Map();
  const F = () => window.TribeFlow;
  const when = iso => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

  function remember(g) { if (!g || !g.id) return; byId.set(g.id, g); if (g.msg) byMsg.set(g.msg, g); }

  // A file path as a folder chip: role color dot, the folder's friendly name, then the rest of the path.
  function fchip(p) {
    const o = F() && F().folderOwner(p);
    if (!o) return `<span class="fchip plain" title="${esc(p)}"><span class="fp">${esc(p)}</span></span>`;
    const rest = String(p).slice(o.folder.path.length);
    return `<span class="fchip" style="--rc:${esc(o.role.hex)}" title="${esc(p)} · ${esc(o.role.name)}"><i class="rdot"></i><b>${esc(o.folder.label)}</b>${rest ? `<span class="fp">${esc(rest)}</span>` : ''}</span>`;
  }
  const roleChip = r => r ? `<span class="rchip" style="--rc:${esc(r.hex)}"><i class="rdot"></i>${esc(r.name)}</span>` : '';

  function card(g, { feed = false } = {}) {
    const k = KIND[g.kind] || KIND.progress;
    const role = F() && F().role(g.role);
    const files = g.files || [];
    const link = g.link && g.link !== '#repo' ? `<a class="gx-link" href="${esc(g.link)}" target="_blank" rel="noopener noreferrer">${/compare|commit/.test(g.link) ? 'View diff' : 'Open link'}</a>`
      : g.link === '#repo' ? '<button class="gx-link linkish" data-gx-repo>Open in Code</button>' : '';
    return `<article class="gx k-${esc(g.kind)}${feed ? ' feed' : ''}" data-gist="${esc(g.id)}" style="--rc:${esc(role ? role.hex : 'var(--edge-pop)')}">
      <header><span class="gx-kind">${ico(k.ico)}${k.label}</span>${feed ? `<span class="gx-by">${role ? '<i class="rdot"></i>' : ''}${esc(g.byName)}</span><time>${esc(when(g.at))}</time>` : (role ? roleChip(role) : '')}${g.auto ? '<span class="gx-auto" title="Written by TribeCode from the saved changes">from saved changes</span>' : ''}</header>
      <h4>${esc(g.title)}</h4>
      ${g.bullets && g.bullets.length ? `<ul>${g.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${files.length || link ? `<footer>${files.length ? `<button class="gx-files" aria-expanded="false">${ico('i-folder')}${files.length === 1 ? '1 file' : `${files.length} files`}</button>` : ''}${link}</footer>
      ${files.length ? `<div class="gx-filelist hidden">${files.map(fchip).join('')}</div>` : ''}` : ''}
    </article>`;
  }
  const render = m => (m && m.gist ? (remember({ ...m.gist, msg: m.id }), card(m.gist)) : null);

  // Upgrade chat bubbles that carry a gist (app.js / chatx.js draw them as plain text first).
  function decorate(list) {
    if (!list) return;
    for (const el of list.querySelectorAll('.msg[data-id]:not(.has-gx)')) {
      const g = byMsg.get(el.dataset.id); if (!g) continue;
      const body = [...el.querySelectorAll('p')].filter(p => !p.closest('.gx') && !p.classList.contains('vn-tx')).pop();
      el.classList.add('has-gx');
      if (body) body.outerHTML = card(g); else (el.lastElementChild || el).insertAdjacentHTML('beforeend', card(g));
    }
  }
  let pend = false;
  const soon = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; decorate($('#chat-list')); }); };
  async function load() {
    if (!C.connected()) return;
    try { const r = await C.api('/gists?limit=150'); (r.gists || []).forEach(remember); soon(); } catch {}
  }
  C.on('ws', m => {
    if (m.type === 'chat' && m.message && m.message.gist) { remember({ ...m.message.gist, msg: m.message.id }); soon(); }
    if (m.type === 'gist' && m.gist) { remember(m.gist); soon(); }
    if (m.type === 'flow') soon();
  });
  C.on('hello', load); C.on('project', load);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.gx-files');
    if (b) { const box = b.closest('.gx').querySelector('.gx-filelist'); const open = box.classList.toggle('hidden') === false; b.setAttribute('aria-expanded', String(open)); return; }
    if (e.target.closest && e.target.closest('[data-gx-repo]')) window.TribeApp.show('repo');
  });
  function boot() { const l = $('#chat-list'); if (l) new MutationObserver(soon).observe(l, { childList: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.TribeGists = { render, card, fchip, roleChip, remember, get: gid => byId.get(gid), all: () => [...byId.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))), KIND, decorate: soon };
})();
