// Team votes in chat (server/votes.js). chatx.js renders a message with a `vote` through TribeVotes.card;
// this file owns the card, its taps (vote, nudge, close, make it a task, send to Board), "who's seen it",
// the brain's "Turn this into a vote?" hint, and the small "Start a vote" sheet:
//   window.TribeVotes.openComposer({ question, options, channel })   (the phone composer "+" menu calls it)
(function () {
  const $ = s => document.querySelector(s);
  const C = window.TribeClient;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const ink = c => (['#FFB86B', '#38C6B1', '#3DD6D0', '#9AE66E', '#E7E9EE'].includes(c) ? '#0B0C10' : '#fff');
  const toast = t => window.TribeApp && window.TribeApp.toast(t);
  const icon = (k, cls = '') => `<svg class="i ${cls}"><use href="#${k}"/></svg>`;
  const me = () => (C.state().me || {}).id;
  const members = () => C.state().members || [];
  const member = id => members().find(m => m.id === id);
  const nameOf = id => { const m = member(id); if (!m) return id === 'tribecode' ? 'TribeCode' : 'someone'; if (m.role === 'agent' && member(m.owner)) return `${member(m.owner).name}'s Claude`; return m.name; };
  const colorOf = id => (member(id) || {}).color || '#6C7CFF';
  const humans = () => members().filter(m => m.role !== 'agent' && m.role !== 'spectator');
  const cur = () => (window.TribeDM ? window.TribeDM.current() : 'general');
  const isDm = ch => /^dm-/.test(ch || '');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const names = ids => { const n = ids.map(nameOf); return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`; };

  function left(dl) {
    const s = (Date.parse(dl) - Date.now()) / 1000;
    if (s <= 30) return 'closing…';
    if (s < 3600) return `${Math.ceil(s / 60)}m left`;
    if (s < 86400 * 2) return `${Math.round(s / 3600)}h left`;
    return `${Math.round(s / 86400)}d left`;
  }
  const clock = at => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // ---------- the card ----------
  function stats(v) {
    const elig = Array.isArray(v.eligible) && v.eligible.length ? v.eligible : humans().map(m => m.id);
    const n = Math.max(1, v.status === 'open' ? elig.length : (v.voters || elig.length));
    const counts = Object.fromEntries(v.options.map(o => [o.id, 0]));
    const by = Object.fromEntries(v.options.map(o => [o.id, []]));
    for (const [mid, o] of Object.entries(v.ballots || {})) if (o in counts) { counts[o]++; by[o].push(mid); }
    const voted = Object.keys(v.ballots || {}).length;
    return { n, counts, by, voted, needed: Math.floor(n / 2) + 1, waiting: elig.filter(x => !(v.ballots || {})[x]) };
  }
  function faces(ids) {
    const shown = ids.slice(0, 4).map(id => `<span class="vt-face" style="background:${esc(colorOf(id))};color:${ink(colorOf(id))}" title="${esc(nameOf(id))}">${esc(initials(nameOf(id)))}</span>`).join('');
    return ids.length ? `<span class="vt-faces">${shown}${ids.length > 4 ? `<span class="vt-face more">+${ids.length - 4}</span>` : ''}</span>` : '';
  }
  function card(m, ch) {
    const v = m.vote, s = stats(v), open = v.status === 'open', mine = (v.ballots || {})[me()];
    const approve = v.kind === 'approve', suggested = v.suggested && v.suggested.agent;
    const meM = member(me()) || {}, canVote = open && meM.role !== 'agent' && meM.role !== 'spectator';
    const head = open ? (suggested ? 'Suggested vote' : approve ? 'Vote · approve?' : 'Poll')
      : v.status === 'passed' ? 'Vote · passed' : v.status === 'failed' ? (v.reason === 'no quorum' ? 'Vote · no quorum' : 'Vote · not yet') : v.status === 'tie' ? 'Poll · tie' : 'Poll · closed';
    const when = open ? (v.deadline ? left(v.deadline) : `${s.needed} of ${s.n} decide`) : `closed ${clock(v.closed || m.at)}`;
    const total = Math.max(1, open ? s.n : s.voted || 1);
    const opts = v.options.map(o => {
      const c = s.counts[o.id], pct = Math.round((c / total) * 100), win = !open && v.result === o.id;
      const cls = [approve ? o.id : 'opt', mine === o.id ? 'mine' : '', win ? 'win' : ''].join(' ');
      const mark = approve ? icon(o.id === 'yes' ? 'i-vt-yes' : 'i-vt-no', 'vt-ic') : '';
      return `<button class="vt-o ${cls}" data-vt-opt="${esc(o.id)}" ${canVote ? '' : 'disabled'} aria-pressed="${mine === o.id}" aria-label="${esc(o.label)}: ${c} vote${c === 1 ? '' : 's'}">
        <i class="vt-fill" style="width:${pct}%"></i>${mark}<span class="vt-l">${esc(o.label)}</span>${faces(s.by[o.id])}<b class="vt-n">${c}</b></button>`;
    }).join('');
    let foot = '';
    if (open) {
      const author = m.by === me() || (v.suggested && v.suggested.owner === me()) || meM.role === 'host';
      const nudge = s.waiting.filter(x => x !== me()).length && mine ? `<button class="vt-link" data-vt="remind" title="Ping ${esc(names(s.waiting.filter(x => x !== me())))}">Nudge ${s.waiting.filter(x => x !== me()).length}</button>` : '';
      foot = `<div class="vt-foot"><span>${s.voted} of ${s.n} voted${s.waiting.length && s.waiting.length <= 3 ? ` · waiting on ${esc(names(s.waiting))}` : ''}</span><span class="vt-sp"></span>${nudge}${author ? '<button class="vt-link" data-vt="close">Close</button>' : ''}</div>`;
    } else {
      const counts = v.options.map(o => `${s.counts[o.id]} ${approve ? o.label.toLowerCase() : o.label}`).join(' · ');
      const head2 = v.status === 'passed' ? 'Approved' : v.status === 'failed' ? (v.reason === 'no quorum' ? 'Too few votes' : 'Not yet') : v.status === 'tie' ? 'Tie' : v.result ? (v.options.find(o => o.id === v.result) || {}).label : 'No votes';
      const decided = v.status === 'passed' || (v.status === 'closed' && v.result);
      const acts = decided && meM.role !== 'agent' && meM.role !== 'spectator' ? `<div class="vt-acts">
          ${v.task ? `<span class="vt-done">${icon('i-check')}Task · ${esc(v.task.title)}</span>` : `<button class="btn vt-btn" data-vt="task">${icon('i-check')}Make it a task</button>`}
          ${v.proposal ? `<span class="vt-done">${icon('i-vote')}On the Board${v.proposal.status === 'approved' ? ' · approved' : ''}</span>` : `<button class="btn vt-btn" data-vt="board">${icon('i-vote')}Send to Board</button>`}</div>` : '';
      foot = `<div class="vt-res"><b>${esc(head2)}</b><span>${esc(counts)}</span></div>${acts}`;
    }
    const seenIds = Object.keys(v.seen || {});
    const seen = open && seenIds.length ? `<div class="vt-seen" title="${esc(names(seenIds))}">${icon('i-eye')}Seen by ${seenIds.length === 1 ? esc(nameOf(seenIds[0])) : `${seenIds.length}`}</div>` : '';
    return `<div class="vt ${open ? 'open' : 'closed'} st-${esc(v.status)} ${suggested ? 'sug' : ''}" data-vote="${esc(m.id)}" data-ch="${esc(ch)}" ${open && !(v.seen || {})[me()] ? 'data-unseen="1"' : ''}>
      <div class="vt-eye"><span class="vt-k">${esc(head)}</span><span class="vt-when" ${open && v.deadline ? `data-dl="${esc(v.deadline)}"` : ''}>${esc(when)}</span></div>
      <div class="vt-q">${esc(v.q)}</div>
      ${suggested ? `<div class="vt-sug">${icon('i-sparkle')}Suggested by ${esc(nameOf(v.suggested.agent))}${v.why ? ` · <span>${esc(v.why)}</span>` : ''}</div>` : ''}
      <div class="vt-opts ${approve ? 'two' : ''}">${opts}</div>
      ${foot}${seen}</div>`;
  }

  // ---------- "Turn this into a vote?" (from the brain, for the author only) ----------
  const hints = new Map();   // message id -> { question, options, by }
  function hint(m) {
    const h = hints.get(m.id); if (!h || m.by !== me() || m.deleted) return '';
    return `<div class="vt-hint" data-vh="${esc(m.id)}">${icon('i-vote')}<span>Turn this into a vote?</span><button class="vt-link" data-vh-go>Make it a vote</button><button class="vt-x" data-vh-x aria-label="Dismiss">${icon('i-x')}</button></div>`;
  }

  // ---------- actions ----------
  const api = (ch, path, body = {}) => C.api(`/chat/${encodeURIComponent(ch)}/vote${path}`, { method: 'POST', body });
  const busy = new Set();
  async function act(el, fn) {
    const k = el.dataset.vote; if (busy.has(k)) return; busy.add(k);
    try { await fn(); } catch (e) { toast(e.message); } finally { busy.delete(k); }
  }
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target; if (!t) return;
    const card = t.closest('.vt[data-vote]');
    if (card) {
      const ch = card.dataset.ch || 'general', id = card.dataset.vote;
      const o = t.closest('[data-vt-opt]');
      if (o && !o.disabled) { e.stopPropagation(); return act(card, () => api(ch, `/${id}/cast`, { option: o.dataset.vtOpt })); }
      const b = t.closest('[data-vt]'); if (!b) return;
      e.stopPropagation();
      const op = b.dataset.vt;
      return act(card, async () => {
        const r = await api(ch, `/${id}/${op}`);
        if (op === 'remind') toast(`Nudged ${(r.reminded || []).join(', ')}`);
        if (op === 'task' && r.task) toast(`Task created: ${r.task.title}`);
        if (op === 'board' && r.proposal) toast(r.proposal.status === 'approved' ? `On the Board and approved: ${r.proposal.title}` : `Sent to the Board: ${r.proposal.title}`);
      });
    }
    const h = t.closest('.vt-hint[data-vh]');
    if (h) {
      e.stopPropagation();
      const id = h.dataset.vh, d = hints.get(id);
      hints.delete(id); if (window.TribeChatX && window.TribeChatX.rerender) window.TribeChatX.rerender(id);
      if (t.closest('[data-vh-go]') && d) openComposer({ question: d.question, options: d.options });
    }
  }, true);

  // "Who's seen it": mark a vote seen once it is on screen.
  const sent = new Set();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(list => {
    for (const en of list) {
      if (!en.isIntersecting || document.hidden) continue;
      const el = en.target, id = el.dataset.vote; io.unobserve(el);
      if (sent.has(id) || !el.dataset.unseen) continue;
      const m = member(me()); if (!m || m.role === 'agent' || m.role === 'spectator') continue;
      sent.add(id); api(el.dataset.ch || 'general', `/${id}/seen`).catch(() => sent.delete(id));
    }
  }, { threshold: 0.6 }) : null;
  function watchCards(root) { if (io) root.querySelectorAll('.vt[data-unseen]').forEach(el => { if (!sent.has(el.dataset.vote)) io.observe(el); }); }
  function boot() {
    const l = $('#chat-list'); if (!l) return;
    new MutationObserver(() => watchCards(l)).observe(l, { childList: true, subtree: true }); watchCards(l);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  // Countdowns stay current without re-rendering the chat.
  setInterval(() => document.querySelectorAll('.vt-when[data-dl]').forEach(el => { el.textContent = left(el.dataset.dl); }), 20_000);

  C.on('ws', m => {
    if (m.type !== 'vote-hint' || !m.id) return;
    hints.set(m.id, { question: m.question, options: m.options || [], by: m.by });
    if (window.TribeChatX && window.TribeChatX.rerender) window.TribeChatX.rerender(m.id);
  });

  // ---------- "Start a vote" sheet ----------
  const DEADLINES = [{ k: 0, label: 'When decided' }, { k: 60, label: '1 hour' }, { k: 1440, label: '24 hours' }, { k: 4320, label: '3 days' }];
  let sheet = null, lastFocus = null;
  function openComposer(opts = {}) {
    closeComposer();
    lastFocus = document.activeElement;
    const state = { kind: opts.options && opts.options.length >= 2 ? 'poll' : 'approve', options: opts.options && opts.options.length >= 2 ? opts.options.slice(0, 6) : ['', ''], minutes: 0 };
    const n = humans().length || 1;
    sheet = document.createElement('div');
    sheet.className = 'vt-layer';
    sheet.innerHTML = `<div class="vt-scrim" data-close></div>
      <form class="vt-sheet" id="vt-sheet" role="dialog" aria-modal="true" aria-labelledby="vt-title" autocomplete="off">
        <div class="vt-grab" aria-hidden="true"></div>
        <div class="vt-eye"><span class="vt-k">New vote</span><button type="button" class="vt-x" data-close aria-label="Close">${icon('i-x')}</button></div>
        <h3 id="vt-title">Start a vote</h3>
        <label class="vt-lbl" for="vt-q">Question</label>
        <textarea id="vt-q" rows="2" maxlength="200" placeholder="Should we add dark mode to the level editor?"></textarea>
        <div class="vt-seg" role="radiogroup" aria-label="Kind of vote">
          <button type="button" role="radio" data-kind="approve">Approve / Not yet</button><button type="button" role="radio" data-kind="poll">Poll</button></div>
        <div class="vt-optlist" id="vt-optlist"></div>
        <div class="vt-lbl">Closes</div>
        <div class="vt-chips" role="radiogroup" aria-label="Closes">${DEADLINES.map(d => `<button type="button" role="radio" data-min="${d.k}">${d.label}</button>`).join('')}</div>
        <p class="vt-note">${n === 1 ? 'You are the only person here, so your vote decides.' : `A majority of the ${n} people here decides (${Math.floor(n / 2) + 1}).`} Agents can suggest votes but never vote.</p>
        <div class="vt-actions"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary" id="vt-go">Start vote</button></div>
      </form>`;
    document.body.appendChild(sheet);
    const q = sheet.querySelector('#vt-q'); q.value = opts.question || '';
    const draw = () => {
      sheet.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.kind === state.kind)));
      sheet.querySelectorAll('[data-min]').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.min) === state.minutes)));
      const box = sheet.querySelector('#vt-optlist');
      box.hidden = state.kind !== 'poll';
      box.innerHTML = state.kind !== 'poll' ? '' : state.options.map((o, i) => `<div class="vt-orow"><input class="vt-oin" data-i="${i}" maxlength="60" placeholder="Option ${i + 1}" value="${esc(o)}">${state.options.length > 2 ? `<button type="button" class="vt-x" data-rm="${i}" aria-label="Remove option ${i + 1}">${icon('i-x')}</button>` : ''}</div>`).join('')
        + (state.options.length < 6 ? `<button type="button" class="vt-link vt-add" data-add>${icon('i-plus')}Add option</button>` : '');
    };
    sheet.addEventListener('input', e => { if (e.target.matches('.vt-oin')) state.options[Number(e.target.dataset.i)] = e.target.value; });
    sheet.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-close]')) return closeComposer();
      const k = t.closest('[data-kind]'); if (k) { state.kind = k.dataset.kind; draw(); if (state.kind === 'poll') { const f = sheet.querySelector('.vt-oin'); if (f && !f.value) f.focus(); } return; }
      const d = t.closest('[data-min]'); if (d) { state.minutes = Number(d.dataset.min); draw(); return; }
      if (t.closest('[data-add]')) { state.options.push(''); draw(); const ins = sheet.querySelectorAll('.vt-oin'); ins[ins.length - 1].focus(); return; }
      const rm = t.closest('[data-rm]'); if (rm) { state.options.splice(Number(rm.dataset.rm), 1); draw(); }
    });
    sheet.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeComposer(); }
      if (e.key === 'Enter' && e.target.id === 'vt-q' && !e.shiftKey) { e.preventDefault(); sheet.querySelector('form').requestSubmit(); }
      if (e.key === 'Tab') {   // keep focus inside the sheet
        const f = [...sheet.querySelectorAll('button, textarea, input')].filter(x => !x.disabled && x.offsetParent);
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    sheet.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const question = q.value.trim(); if (!question) { q.focus(); return toast('Ask a question first.'); }
      const options = state.kind === 'poll' ? state.options.map(o => o.trim()).filter(Boolean) : [];
      if (state.kind === 'poll' && options.length < 2) return toast('A poll needs two options.');
      let ch = opts.channel || cur(); if (isDm(ch)) ch = 'general';
      const go = sheet.querySelector('#vt-go'); go.disabled = true;
      try {
        await C.api(`/chat/${encodeURIComponent(ch)}/vote`, { method: 'POST', body: { question, options, minutes: state.minutes } });
        closeComposer();
        if (window.TribeApp && window.TribeApp.view && window.TribeApp.view() !== 'chat') window.TribeApp.show('chat');
        if (ch === 'general' && cur() !== 'general' && window.TribeDM && window.TribeDM.back) window.TribeDM.back();
      } catch (err) { toast(err.message); go.disabled = false; }
    });
    draw();
    requestAnimationFrame(() => { sheet.classList.add('in'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
  }
  function closeComposer() {
    if (!sheet) return;
    const s = sheet; sheet = null;
    s.classList.remove('in');
    setTimeout(() => s.remove(), reduced() ? 0 : 160);
    if (lastFocus && lastFocus.isConnected) try { lastFocus.focus({ preventScroll: true }); } catch {}
  }

  window.TribeVotes = { openComposer, closeComposer, card, hint, isOpen: () => !!sheet };
})();
