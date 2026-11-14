// Publish (v0.27): one click turns what the preview shows into a public play link (server/publish.js).
// The sheet runs the safety check first: secrets block publishing (with "Fix it", which asks your AI helpers through a
// task), warnings can be published past. Then: the play link with Copy, a QR code, a share card preview, Remix on/off,
// Update and Unpublish. Entry points: a 🚀 button in the preview toolbar (added from outside preview.js), a "Share it"
// card on the project dashboard, Ctrl K, and ?remixPlay=<slug> (from a play page's "Remix this") starts a remix.
// Public: window.TribePublish = { open(pid?), state(pid?), status(pid?) }. The sheet also holds "Where it goes" (publishreal.js):
// a zip, a GitHub page, itch.io, an installable app and app packages.
(function () {
  const C = window.TribeClient; if (!C) return;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const me = () => C.state().me || {};
  const pidNow = () => C.project && C.project();
  const ROCKET = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15c-1.5 1.3-2 4-2 6 2 0 4.7-.5 6-2"/><path d="M9 12a17 17 0 0 1 11-9c0 5-3 9-9 11z"/><path d="M9 12 6 11l2-3 4-1M12 15l1 3 3-2 1-4"/><circle cx="15" cy="8.5" r="1.4"/></svg>';
  const cache = {};   // pid -> { published, canPublish }

  async function state(pid = pidNow(), fresh) {
    if (!pid) return { published: [], canPublish: false };
    if (cache[pid] && !fresh) return cache[pid];
    try { cache[pid] = await C.api('/publish?project=' + encodeURIComponent(pid)); } catch { cache[pid] = { published: [], canPublish: false }; }
    return cache[pid];
  }

  // ---------- the sheet ----------
  function sheet(html) {
    const m = $('#invite-modal'), body = $('#invite-body'); if (!m || !body) return null;
    body.classList.add('pb-sheet'); body.innerHTML = html; m.classList.remove('hidden');
    if (!m._pbWatch) { m._pbWatch = true; new MutationObserver(() => { if (m.classList.contains('hidden')) body.classList.remove('pb-sheet'); }).observe(m, { attributes: true, attributeFilter: ['class'] }); }
    const close = () => { m.classList.add('hidden'); body.classList.remove('pb-sheet'); };
    body.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    const first = body.querySelector('input, button.primary, button'); if (first) setTimeout(() => first.focus(), 30);
    return { body, close };
  }
  const findingRow = f => `<li class="pb-f pb-f--${f.level}"><span class="pb-f__lv">${f.level === 'block' ? 'Must fix' : 'Warning'}</span><div><b>${esc(f.kind)}</b>${f.file ? ` <code>${esc(f.file)}${f.line ? ':' + f.line : ''}</code>` : ''}<small>${esc(f.why)}</small></div>
    <button type="button" class="btn sm" data-fix="${esc(JSON.stringify({ k: f.kind, f: f.file, l: f.line, w: f.why }))}">Fix it</button></li>`;

  let FOCUS = '';
  async function open(pid = pidNow(), focus = '') {
    if (!pid) return toast('Open a project first');
    const p = (C.state().projects || []).find(x => x.id === pid) || { name: 'this project' };
    const s = sheet(`<p class="eyebrow">Publish</p><h2 class="pb-h">Share ${esc(p.name)} with a link</h2><p class="faint pb-sub">Checking the files before anything goes public…</p><div class="pb-body" id="pb-body"><div class="pb-spin" aria-label="Checking"></div></div>
      <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Close</button></div>`);
    if (!s) return;
    const st = await state(pid, true), cur = (st.published || [])[0];
    if (!st.canPublish && !cur) { $('#pb-body').innerHTML = `<p class="faint">${me().role === 'spectator' ? 'Spectators can watch, not publish. Ask the host for builder access.' : 'You can\'t publish this project.'}</p>`; return; }
    let ch; try { ch = await C.api('/publish/check', { method: 'POST', body: { project: pid } }); } catch (e) { $('#pb-body').innerHTML = `<p class="pb-err">${esc(e.message)}</p>`; return; }
    FOCUS = focus || ''; render(s, pid, p, cur, ch, st);
  }
  function render(s, pid, p, cur, ch, st) {
    const agent = me().role === 'agent';
    const warns = ch.findings.filter(f => f.level === 'warn'), blocks = ch.findings.filter(f => f.level === 'block');
    s.body.querySelector('.pb-sub').textContent = cur ? `Live at its play link · version ${cur.version}. Update it any time.` : 'Anyone with the link can open it, on any phone or computer. No account needed.';
    const chk = !ch.findings.length ? `<p class="pb-ok">✓ Safety check: ${ch.files} file${ch.files === 1 ? '' : 's'}, no secrets or risky code found.</p>`
      : `<div class="pb-check"><p class="pb-check__h">${blocks.length ? `✕ ${blocks.length} thing${blocks.length > 1 ? 's' : ''} must be fixed before this goes public` : `⚠ ${warns.length} warning${warns.length > 1 ? 's' : ''} to look over`}</p><ul class="pb-fl">${ch.findings.map(findingRow).join('')}</ul></div>`;
    $('#pb-body').innerHTML = `${cur ? live(cur) : ''}${chk}
      <form class="pb-form" id="pb-form" autocomplete="off">
        <label class="pb-l">Title<input class="input" id="pb-title" maxlength="80" value="${esc((cur && cur.title) || p.name)}"></label>
        <label class="pb-l">One line about it<input class="input" id="pb-desc" maxlength="240" placeholder="What is it? Who is it for?" value="${esc((cur && cur.desc) || p.bio || '')}"></label>
        <label class="pb-tg"><input type="checkbox" id="pb-remix" ${!cur || cur.allowRemix ? 'checked' : ''}> <span>Allow remix <small class="faint">People can start their own copy with your name on it.</small></span></label>
      </form><div id="pb-real" class="pb-real"></div>`;
    if (window.TribePublishReal) window.TribePublishReal.mount($('#pb-real'), pid, { title: () => ($('#pb-title') || {}).value, desc: () => ($('#pb-desc') || {}).value, focus: FOCUS }); FOCUS = '';
    const foot = s.body.querySelector('.modal-foot');
    foot.innerHTML = `${cur ? '<button class="linkish pb-down" id="pb-down">Unpublish</button>' : ''}<span style="flex:1"></span><button class="btn" data-close>Close</button>
      <button class="btn primary" id="pb-go" ${blocks.length ? 'disabled' : ''}>${blocks.length ? 'Fix the issues first' : agent ? 'Ask to publish' : warns.length ? (cur ? 'Update anyway' : 'Publish anyway') : cur ? 'Update the link' : 'Publish'}</button>`;
    foot.querySelector('[data-close]').onclick = s.close;
    wireLive(s.body, cur);
    s.body.querySelectorAll('[data-fix]').forEach(b => b.onclick = async () => {
      const x = JSON.parse(b.dataset.fix);
      try { await C.api('/tasks', { method: 'POST', body: { title: `Fix before publishing: ${x.k}${x.f ? ' in ' + x.f : ''}`, body: `${x.w}${x.f ? `\n\nFile: ${x.f}${x.l ? ' line ' + x.l : ''}` : ''}\n\n_From the publish safety check. AI helpers: fix it, then say so in the chat._` } }); b.textContent = 'Asked ✓'; b.disabled = true; toast('Added a task for your AI helpers'); }
      catch (e) { toast(e.message); }
    });
    const go = $('#pb-go');
    if (go) go.onclick = async () => {
      go.disabled = true; go.textContent = 'Publishing…';
      try {
        const r = await C.api('/publish', { method: 'POST', body: { project: pid, title: $('#pb-title').value, desc: $('#pb-desc').value, allowRemix: $('#pb-remix').checked, force: true } });
        if (r.pending) { $('#pb-body').innerHTML = `<p class="pb-ok">Asked ${esc((r.pending.toNames || []).join(', ') || 'your owner')} to approve. It goes live when they say yes.</p>`; go.remove(); return; }
        const st2 = await state(pid, true); toast('Published: the play link is ready');
        render(s, pid, p, (st2.published || [])[0], await C.api('/publish/check', { method: 'POST', body: { project: pid } }), st2);
        bump();
      } catch (e) { go.disabled = false; go.textContent = 'Try again'; toast(e.message); }
    };
    const down = $('#pb-down');
    if (down) down.onclick = async () => {
      if (!confirm('Take the play link down? People with the link will see "Nothing here".')) return;
      try { await C.api('/publish/' + encodeURIComponent(cur.slug), { method: 'DELETE' }); toast('Unpublished'); await state(pid, true); s.close(); bump(); } catch (e) { toast(e.message); }
    };
  }
  function live(e) {
    return `<section class="pb-live" aria-label="Play link">
      <div class="pb-card">${e.card ? `<img src="${esc(e.card)}" alt="">` : `<div class="pb-card__ph" aria-hidden="true">${ROCKET}</div>`}<div class="pb-card__t"><b>${esc(e.title)}</b><span>${esc(e.desc || 'Made with TribeCode')}</span><small>${esc(String(e.url).replace(/^https?:\/\//, ''))}</small></div></div>
      <div class="linkbox pb-link"><code id="pb-url">${esc(e.url)}</code><button class="btn" id="pb-qrb" type="button" aria-label="Show QR code">QR</button><button class="btn" id="pb-open" type="button">Open</button><button class="btn primary" id="pb-copy" type="button">Copy</button></div>
      <div class="qr pb-qr hidden" id="pb-qr"></div>
      <p class="faint pb-note">${/localhost|127\.0\.0\.1/.test(e.url) ? 'This link works on this computer. Turn on <b>Share beyond my Wi-Fi</b> in Invite friends to send it to anyone.' : /^http:\/\/(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(e.url) ? 'This link works on your Wi-Fi. Turn on <b>Share beyond my Wi-Fi</b> in Invite friends to send it anywhere.' : 'Works for anyone with the link.'}</p></section>`;
  }
  function wireLive(root, e) {
    if (!e) return;
    const c = root.querySelector('#pb-copy'); if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(e.url); c.textContent = 'Copied ✓'; setTimeout(() => { c.textContent = 'Copy'; }, 1500); } catch { prompt('Copy this link', e.url); } };
    const o = root.querySelector('#pb-open'); if (o) o.onclick = () => window.open(e.url, '_blank', 'noopener');
    const q = root.querySelector('#pb-qrb'); if (q) q.onclick = () => { const box = root.querySelector('#pb-qr'); if (!box) return; if (window.TribeQR) box.innerHTML = window.TribeQR.svg(e.url); box.classList.toggle('hidden'); };
  }

  // ---------- entry points ----------
  // 1) the preview toolbar: a 🚀 button next to "open in a new tab" (added from here so preview.js stays untouched)
  function addToolbar() {
    document.querySelectorAll('.pvw-btn[data-act="tab"]').forEach(tab => {
      const bar = tab.parentElement; if (!bar || bar.querySelector('[data-pub]')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pvw-btn pb-tool'; b.dataset.pub = '1'; b.title = 'Publish to a play link'; b.setAttribute('aria-label', 'Publish to a play link'); b.innerHTML = ROCKET;
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });
      tab.after(b);
    });
  }
  // 2) the project dashboard: a "Share it" card under Recommended next
  let cardSeq = 0;
  async function addCard() {
    const slot = document.getElementById('pj-reco-slot'); if (!slot) return;
    const pid = pidNow(); if (!pid) return;
    let card = document.getElementById('pb-dash');
    if (card && card.dataset.pid === pid && card.dataset.fresh === '1') return;
    if (!card) { card = document.createElement('section'); card.id = 'pb-dash'; card.className = 'card pb-dash'; card.setAttribute('aria-label', 'Share it'); slot.after(card); }
    card.dataset.pid = pid; card.dataset.fresh = '1';
    const n = ++cardSeq, st = await state(pid); if (n !== cardSeq) return;
    const e = (st.published || [])[0];
    if (!e && !st.canPublish) { card.remove(); return; }
    card.innerHTML = e
      ? `<div class="pb-dash__i" aria-hidden="true">${ROCKET}</div><div class="pb-dash__t"><span class="eyebrow">Live · play link</span><b>${esc(e.title)}</b><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(String(e.url).replace(/^https?:\/\//, ''))}</a></div><div class="pb-dash__a"><button class="btn sm" data-pb-copy>Copy</button><button class="btn sm primary" data-pb-open>Update</button></div>`
      : `<div class="pb-dash__i" aria-hidden="true">${ROCKET}</div><div class="pb-dash__t"><span class="eyebrow">Share it</span><b>Publish to a play link</b><small class="faint">Anyone can open it on a phone. A safety check runs first.</small></div><div class="pb-dash__a"><button class="btn sm primary" data-pb-open>Publish</button></div>`;
    card.querySelector('[data-pb-open]').onclick = () => open(pid);
    const cp = card.querySelector('[data-pb-copy]'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(e.url); toast('Link copied'); } catch { prompt('Copy this link', e.url); } };
  }
  const bump = () => { const c = document.getElementById('pb-dash'); if (c) c.dataset.fresh = '0'; addCard(); };
  let t; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { addToolbar(); addCard(); }, 60); }).observe(document.body, { childList: true, subtree: true });
  C.on('ws', m => { if (m && m.type === 'publish' && m.project) { delete cache[m.project]; bump(); } });
  C.on('project', () => { const c = document.getElementById('pb-dash'); if (c) c.dataset.fresh = '0'; });
  // 3) Ctrl K
  if (window.TribePalette && window.TribePalette.register) window.TribePalette.register(() => [
    { kind: 'Action', label: 'Publish to a play link', keys: 'publish share play link deploy ship public live url', run: () => open() },
  ]);
  // 4) "Remix this" from a play page: /?remixPlay=<slug>
  (function remixFromLink() {
    const slug = new URLSearchParams(location.search).get('remixPlay'); if (!slug || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) return;
    let tries = 0;
    const go = () => {
      if (!C.connected() || !C.state().me) { if (++tries < 60) setTimeout(go, 500); return; }
      const s = sheet(`<p class="eyebrow">Remix</p><h2 class="pb-h">Start your own copy?</h2><p class="faint pb-sub">A new project with the published files and the maker's name in the README. Their original stays as it is.</p>
        <div class="modal-foot"><span style="flex:1"></span><button class="btn" data-close>Not now</button><button class="btn primary" id="pb-remix-go">Remix it</button></div>`);
      if (!s) return;
      try { history.replaceState(null, '', location.pathname + location.hash); } catch {}
      $('#pb-remix-go').onclick = async () => {
        try { const r = await C.api('/publish/remix', { method: 'POST', body: { slug } }); s.close(); toast('Remixed: your copy is ready'); await C.switchProject(r.project.id); if (window.TribePreview) setTimeout(() => window.TribePreview.open(), 400); }
        catch (e) { toast(e.message); }
      };
    };
    setTimeout(go, 800);
  })();

  // status(pid): what is published where and the one next step (publishreal.js), for the guide and Flint
  const status = (pid, fresh) => (window.TribePublishReal ? window.TribePublishReal.status(pid, fresh) : state(pid, fresh).then(st => ({ kind: 'site', dest: {}, play: (st.published || [])[0] || null, next: (st.published || [])[0] ? 'share' : 'publish' })));
  window.TribePublish = { open, state, status };
})();
