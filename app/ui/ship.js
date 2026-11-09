// Ship it (feat/ship-flow): the "Ready to ship" card at the top of the Code repository view.
//   What changed since the last push (saved changes, files, who: people and AI helpers, linked tasks), what blocks a
//   push, then one clear action: the host's 🚀 Ship it, or 🙋 Ask to ship (people vote, or the host decides).
//   Votes with Approve / Deny and a comment; one-tap approvals on phones count too. The host picks how shipping is
//   decided (Host decides / Majority / Everyone) and can turn on ⚡ Turbo (ships on its own at calm moments).
//   📤 Share progress copies a plain-text summary + the GitHub link + an invite link.
// Server: server/ship.js (/api/ship…). window.TribeShip = { refresh(), share(), mount(el), state() }
(function () {
  'use strict';
  const C = window.TribeClient; if (!C || !C.on) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, k) => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m, k);
  const me = () => (C.state() || {}).me || {};
  const isHost = () => me().role === 'host';
  const canAct = () => me().role && me().role !== 'spectator' && me().role !== 'agent';
  const plural = (n, a, b = a + 's') => `${n} ${n === 1 ? a : b}`;
  const ago = iso => { if (!iso) return ''; const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
  let data = null, busy = false, timer = null, draft = '';

  async function load() {
    if (!C.connected()) return null;
    try { data = await C.api('/ship'); } catch { data = null; }
    return data;
  }
  function mount() {
    const view = $('#view-repo'); if (!view) return null;
    let card = $('#ship-card');
    if (!card) { const strip = $('#repo-strip'); if (!strip) return null; card = document.createElement('section'); card.className = 'card ship-card'; card.id = 'ship-card'; card.setAttribute('aria-label', 'Ready to ship'); strip.after(card); }
    return card;
  }
  const lines = st => { const a = +((String(st || '').match(/(\d+) insertion/) || [])[1] || 0), r = +((String(st || '').match(/(\d+) deletion/) || [])[1] || 0); return a || r ? ` · <span class="faint">+${a} / −${r} lines</span>` : ''; };
  function chip(p) { return `<span class="sh-who ${p.kind === 'agent' ? 'agent' : ''}" title="${p.kind === 'agent' ? `${esc(p.owner || '')}’s AI helper` : 'person'}">${p.kind === 'agent' ? '🤖' : '🧑'} ${esc(p.name)} <b>${p.count}</b></span>`; }

  function draw() {
    const card = mount(); if (!card) return;
    const d = data;
    if (!d) { card.innerHTML = ''; card.hidden = true; return; }
    card.hidden = false;
    const rq = d.request && ['pending', 'shipping'].includes(d.request.status) ? d.request : null;
    const turbo = d.turbo && d.turbo.on ? `<span class="sh-turbo" title="${esc(d.turbo.state || 'Watching for a calm moment')}">⚡ Turbo is on</span>` : '';
    const head = `<div class="sh-head"><h3>🚀 Ready to ship</h3>${turbo}<span class="sh-sp"></span><button class="btn sm" id="ship-share" type="button" title="Copy a progress summary, the GitHub link and an invite link">📤 Share progress</button></div>`;
    if (!d.enabled) { card.innerHTML = `${head}<p class="sh-note">${esc(d.blocker)}</p>`; bind(card); return; }
    const sub = d.count ? `<b>${plural(d.count, 'saved change')}</b> · ${plural(d.fileCount, 'file')}${lines(d.stat)} since the last push to GitHub`
      : '';
    const block = d.blocker ? `<p class="sh-note ${d.count ? 'warn' : 'ok'}">${d.count ? '⚠️' : '✅'} ${esc(d.blocker)}${d.lastShip && !d.count ? ` <span class="faint">Last shipped ${esc(ago(d.lastShip.at))}.</span>` : ''}</p>` : '';
    const commits = (d.commits || []).slice(0, 6).map(c => `<div class="sh-commit"><span class="sh-ci">${c.kind === 'agent' ? '🤖' : '💾'}</span><span class="sh-cs">${esc(c.subject)}</span><span class="faint">${esc(c.author)} · ${esc(ago(c.at))}</span></div>`).join('');
    const more = d.count > 6 ? `<div class="faint sh-more">+${d.count - 6} more saved changes</div>` : '';
    const files = (d.files || []).slice(0, 10).map(f => `<code>${esc(f)}</code>`).join('') + (d.fileCount > 10 ? `<span class="faint">+${d.fileCount - 10} more</span>` : '');
    const tasks = (d.tasks || []).slice(0, 5).map(t => `<span class="sh-task">${t.status === 'done' ? '✅' : '👀'} ${esc(t.title)}${t.who ? ` <span class="faint">· ${t.agent ? '🤖 ' : ''}${esc(t.who)}</span>` : ''}</span>`).join('');
    const waiting = (d.waiting || []).length ? `<p class="sh-wait">🌿 ${plural(d.waiting.length, 'branch', 'branches')} still waiting to merge first: ${d.waiting.slice(0, 3).map(b => `<code>${esc(b.branch)}</code>${b.author ? ` (${esc(b.author)})` : ''}`).join(', ')}. They join through Integrations below.</p>` : '';
    let action = '';
    if (rq) {
      const t = rq.tally, myVote = (rq.votes || []).find(v => v.id === me().id);
      const voteList = (rq.votes || []).map(v => `<span class="sh-vote ${v.v}">${v.v === 'yes' ? '👍' : '👎'} ${esc(v.name)}${v.comment ? `: “${esc(v.comment)}”` : ''}</span>`).join('');
      const comments = (rq.comments || []).slice(-3).map(c => `<div class="sh-cmt"><b>${esc(c.byName || '')}</b> ${esc(c.text)}</div>`).join('');
      action = `<div class="sh-req"><div class="sh-req-h">🗳️ <b>${esc(rq.byName)}</b> asked to ship ${plural(rq.count, 'saved change')} <code>${esc(rq.short)}</code> · ${esc(rq.modeText)}</div>
        ${rq.status === 'shipping' ? '<p class="sh-note">Shipping now…</p>' : `<div class="sh-tally"><span class="sh-bar"><i style="width:${Math.min(100, Math.round(t.yes / Math.max(1, t.needed) * 100))}%"></i></span><span>${t.yes} of ${t.needed} yes${t.waitingOn.length ? ` · waiting on ${esc(t.waitingOn.slice(0, 3).join(', '))}` : ''}</span></div>`}
        ${voteList ? `<div class="sh-votes">${voteList}</div>` : ''}${comments}
        ${rq.status === 'pending' && canAct() && !myVote ? `<form class="sh-act" data-sh-form><input class="input" maxlength="300" placeholder="Add a comment (optional)" aria-label="Comment" value="${esc(draft)}"><button class="btn sh-yes" type="button" data-sh="yes">✓ Approve</button><button class="btn sh-no" type="button" data-sh="no">✕ Deny</button></form>` : ''}
        ${rq.status === 'pending' && (rq.by === me().id || isHost()) ? '<button class="linkish sh-cancel" data-sh="cancel" type="button">Cancel this request</button>' : ''}</div>`;
    } else if (d.canShip && canAct()) {
      action = `<form class="sh-act" data-sh-form><input class="input" maxlength="300" placeholder="${isHost() && d.mode === 'host' ? 'Note for the tribe (optional)' : 'What’s in it and why it’s ready (optional)'}" aria-label="Note" value="${esc(draft)}">
        ${isHost() && d.mode === 'host' ? '<button class="btn primary" type="button" data-sh="ship">🚀 Ship it</button>' : '<button class="btn primary" type="button" data-sh="ask">🙋 Ask to ship</button>'}</form>
        <p class="sh-how faint">${esc(d.modeText)}. Only the saved changes above go out, exactly as you see them. Nothing is ever forced.</p>`;
    }
    const settings = isHost() ? `<div class="sh-set"><span class="sh-k">Who decides</span><div class="sh-seg" role="radiogroup" aria-label="Who decides">${[['host', '👑 Host'], ['majority', '🙌 Majority'], ['everyone', '🤝 Everyone']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${d.mode === k}" data-sh-mode="${k}">${l}</button>`).join('')}</div>
        <button type="button" data-mode-min="advanced" class="sh-tg ${d.turbo && d.turbo.on ? 'on' : ''}" data-sh="turbo" role="switch" aria-checked="${!!(d.turbo && d.turbo.on)}" title="Ships approved work on main by itself at calm moments: no unsaved edits, a quiet ${d.turbo ? d.turbo.quietMin : 10} min, checks passing, never during a vote, at most ${d.turbo ? d.turbo.maxPerHour : 4} times an hour"><i></i>⚡ Turbo</button>
        ${d.turbo && d.turbo.on && d.turbo.state ? `<span class="faint sh-tstate">${esc(d.turbo.state)}</span>` : ''}</div>` : '';
    const log = (d.log || []).slice(0, 3).map(x => `<div class="sh-log"><span>${esc(x.text)}</span><span class="faint">${esc(ago(x.at))}</span></div>`).join('');
    card.innerHTML = `${head}
      ${sub ? `<p class="sh-sub">${sub}</p>` : ''}${block}
      ${(d.people || []).length ? `<div class="sh-people">${d.people.map(chip).join('')}</div>` : ''}
      ${commits ? `<div class="sh-commits">${commits}${more}</div>` : ''}
      ${files ? `<div class="sh-files"><span class="sh-k">Files</span>${files}</div>` : ''}
      ${tasks ? `<div class="sh-tasks"><span class="sh-k">Tasks</span>${tasks}</div>` : ''}
      ${waiting}${action}${settings}${log ? `<div class="sh-logs">${log}</div>` : ''}`;
    bind(card);
  }
  function bind(card) {
    const sh = $('#ship-share', card); if (sh) sh.onclick = () => share();
    const f = $('[data-sh-form] input', card); if (f) f.oninput = () => { draft = f.value; };
    card.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => act(b.dataset.sh, b));
    card.querySelectorAll('[data-sh-mode]').forEach(b => b.onclick = () => setMode(b.dataset.shMode));
  }
  async function act(k, btn) {
    if (busy) return; busy = true; if (btn) btn.disabled = true;
    const note = draft.trim();
    try {
      if (k === 'ship' || k === 'ask') {
        const r = (await C.api('/ship/request', { method: 'POST', body: { note } })).request;
        draft = ''; toast(r.status === 'shipped' || r.status === 'shipping' ? '🚀 Shipping to GitHub…' : `Asked the tribe. ${r.modeText}.`, 'ok');
      } else if (k === 'yes' || k === 'no') {
        const r = (await C.api(`/ship/${data.request.id}/vote`, { method: 'POST', body: { vote: k, comment: note } })).request;
        draft = ''; toast(r.status === 'denied' ? 'Not shipping this time.' : r.status === 'shipping' || r.status === 'shipped' ? '🚀 Approved. Shipping…' : 'Vote counted.', k === 'yes' ? 'ok' : 'info');
      } else if (k === 'cancel') { await C.api(`/ship/${data.request.id}/cancel`, { method: 'POST' }); toast('Ship request cancelled.', 'info'); }
      else if (k === 'turbo') { const on = !(data.turbo && data.turbo.on); await C.api('/ship/settings', { method: 'PUT', body: { turbo: { on } } }); toast(on ? '⚡ Turbo is on: approved work ships by itself at calm moments.' : 'Turbo is off.', on ? 'ok' : 'info'); }
    } catch (e) { toast(e.message, 'err'); }
    busy = false; await refresh();
  }
  async function setMode(mode) {
    try { const r = await C.api('/ship/settings', { method: 'PUT', body: { mode } }); toast(`${r.modeText}.`, 'ok'); } catch (e) { toast(e.message, 'err'); }
    refresh();
  }

  // 📤 Share progress: the summary from the server + an invite link (when your role can invite)
  async function inviteLink() {
    try {
      const pid = C.project && C.project();
      const r = await C.api('/invites', { method: 'POST', body: { project: pid || null, maxUses: 5, hours: 72 } });
      let base = C.base(), site = null;
      try { const h = await C.api('/health'); const pick = (h.lan || [])[0]; site = h.site || null; if (pick && (pick.kind === 'public' || /\/\/(localhost|127\.0\.0\.1)(:|$)/.test(base))) base = pick.url; } catch {}
      return site && /^https:/.test(base) ? `${site}/app/go.html#s=${encodeURIComponent(base)}&c=${encodeURIComponent(r.invite.code)}` : `${base}/join/${r.invite.code}`;
    } catch { return null; }
  }
  async function share() {
    try {
      const s = await C.api('/ship/share'), link = await inviteLink();
      const text = s.text + (link ? `\n\nJoin us: ${link}` : '');
      try { await navigator.clipboard.writeText(text); toast('📤 Copied: progress, the GitHub link and an invite. Paste it in a chat or a text.', 'ok'); }
      catch { window.prompt('Copy this and send it:', text); }
      return text;
    } catch (e) { toast(e.message, 'err'); return null; }
  }

  async function refresh() {
    if (!$('#view-repo') || $('#view-repo').classList.contains('hidden')) { if (!$('#ship-card')) return; }
    await load(); draw();
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 400); };
  C.on('ship', soon); C.on('repo', soon); C.on('hello', soon); C.on('project', soon);
  C.on('ws', m => { if (m && m.type === 'ship') soon(); });
  // the repo view draws when shown
  const watchView = () => { const v = $('#view-repo'); if (!v) return setTimeout(watchView, 400); new MutationObserver(() => { if (!v.classList.contains('hidden')) soon(); }).observe(v, { attributes: true, attributeFilter: ['class'] }); if (!v.classList.contains('hidden')) soon(); };
  watchView();
  window.TribeShip = { refresh, share, mount, state: () => data, load };
})();
