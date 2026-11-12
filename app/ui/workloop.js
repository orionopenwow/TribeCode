// Work, the whole loop (feat/work-company): post a need -> match people or agents -> assign -> track progress ->
// review -> credit (time bank hours and/or a line in Money). Lives inside Work (app/ui/talent.js), which calls in here:
//   suggestions card   "Suggested next" on Gigs: rules from tasks, company seats and gigs (app/ui/workcore.js), labelled
//                      "Basic · no AI"; when the tribe's AI is on the same lines are reworded in place ("✦ via …").
//   stage tracker      Posted · Assigned · Working · Review · Done on every gig that has someone.
//   loop panel         in a gig's sheet: matches with Assign, progress updates, hand in, review, credit.
// Server: server/talent.js (/api/talent/gigs/:id/matches|assign|progress|submit|review|credit).
//   window.TribeWorkLoop = { suggestHtml(), mountSuggest(el, gigs, refresh), stageHtml(g), loopHtml(g), wireLoop(el, g, refresh), suggestions }
(function () {
  'use strict';
  const C = () => window.TribeClient;
  const core = () => window.TribeWorkCore;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const st = () => (C() && C().state && C().state()) || {};
  const ago = iso => { const s = (Date.now() - Date.parse(iso || 0)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
  const api = (p, o) => C().api(p, o);
  const gigApi = (gid, what, body) => api(`/talent/gigs/${encodeURIComponent(gid)}/${what}`, body === undefined ? undefined : { method: 'POST', body });
  let last = { items: [], via: '' };

  // ---------- suggestions ----------
  async function gather(gigs) {
    const ps = (st().projects || []).slice(0, 6), members = st().members || [], me = st().me || {};
    const all = [];
    await Promise.all(ps.map(async p => {
      let tasks = [], seats = [];
      try { tasks = (await api('/tasks', { project: p.id })).tasks || []; } catch {}
      try { const r = await api(`/projects/${encodeURIComponent(p.id)}/company`, { project: p.id }); const co = r && (r.company !== undefined ? r.company : r); seats = (co && co.seats) || []; } catch {}
      all.push(...core().suggest({ tasks, seats, members, me, project: p.id, gigs: gigs.filter(g => g.project === p.id) }).map(s => ({ ...s, project: p.id })));
    }));
    all.push(...core().suggest({ tasks: [], seats: [], members, me, gigs: gigs.filter(g => !g.project) }));
    const seen = new Set(), rank = { review: 0, credit: 1, start: 2, post: 3, agent: 4, match: 5, check: 6, seat: 7 };
    return all.filter(s => !seen.has(s.id + (s.project || '')) && seen.add(s.id + (s.project || ''))).sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 6);
  }
  const suggestHtml = () => `<section class="card wl-sug" id="wl-suggest" aria-live="polite"><div class="wl-sug-h"><span class="eyebrow">Suggested next</span><span class="wl-via" id="wl-via">Basic · no AI</span></div><p class="tl-none">Looking at your tasks and seats…</p></section>`;
  function drawSuggest(el, items, via) {
    const box = el.querySelector('#wl-suggest') || el; if (!box) return;
    box.innerHTML = `<div class="wl-sug-h"><span class="eyebrow">Suggested next</span><span class="wl-via" id="wl-via">${via ? `✦ via ${esc(via)}` : 'Basic · no AI'}</span></div>
      ${items.length ? `<ul class="wl-sug-list">${items.map((s, i) => `<li class="wl-sug-row" data-sug="${esc(s.id)}" data-kind="${esc(s.kind)}"><span class="wl-dot" aria-hidden="true"></span><span class="wl-sug-t"><b>${esc(s.text)}</b>${s.why ? `<small>${esc(s.why)}</small>` : ''}</span><button class="btn sm ${i === 0 ? 'primary' : 'tonal'}" data-sug-do="${i}">${esc(label(s))}</button></li>`).join('')}</ul>`
        : '<p class="tl-none" id="wl-clear">All caught up. Post a need when something piles up, or start a doc from Templates.</p>'}`;
  }
  const label = s => ({ post: 'Post role', 'assign-tasks': 'Hand them over', 'connect-ai': 'Connect AI', 'hire-seat': 'Find someone', 'open-gig': s.kind === 'review' ? 'Review' : s.kind === 'credit' ? 'Credit' : s.kind === 'start' ? 'Update' : s.kind === 'match' ? 'Pick' : 'Open' }[s.action.type] || 'Open');
  async function mountSuggest(el, gigs, refresh) {
    if (!el || !core() || !C() || !C().connected()) return;
    const key = (gigs || []).map(g => g.id + g.stage + (g.applicantCount || 0)).join();
    if (last.key === key && Date.now() - (last.at || 0) < 20000) { drawSuggest(el, last.items, last.via); el.onclick = click(refresh); return; }
    const items = await gather(gigs || []);
    last = { items, via: '', key, at: Date.now() };
    if (!el.isConnected) return;
    drawSuggest(el, items, '');
    el.onclick = click(refresh);
    refine(el, items);
  }
  const click = refresh => async e => {
    const b = e.target.closest('[data-sug-do]'); if (!b) return;
    const s = last.items[+b.dataset.sugDo]; if (!s) return;
    if (s.action.type === 'assign-tasks') last.at = 0;
    await act(s, () => { last.at = 0; if (refresh) refresh(); });
  };
  async function refine(el, items) {   // the AI half: same lines, better words; the basic answer stands on any error
    if (!items.length) return;
    try {
      const on = window.TribeAIBasics && window.TribeAIBasics.online ? await window.TribeAIBasics.online() : { online: false };
      if (!on.online) return;
      const r = await api('/ai/refine', { method: 'POST', body: { kind: 'work.suggest', input: items.map(s => `- ${s.text} (${s.why || ''})`).join('\n'), draft: items.map(s => '- ' + s.text).join('\n') } });
      const lines = String(r.text || '').split('\n').map(l => /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(l)).filter(Boolean).map(m => m[1].replace(/\*\*/g, '').trim());
      if (lines.length !== items.length || last.items !== items) return;
      last = { ...last, items: items.map((s, i) => ({ ...s, text: lines[i] })), via: r.via || 'AI' };
      if (el.isConnected) drawSuggest(el, last.items, last.via);
    } catch {}
  }
  async function act(s, refresh) {
    const a = s.action;
    try {
      if (a.type === 'post') return window.TribeTalent.post(a.prefill);
      if (a.type === 'hire-seat') return window.TribeTalent.hireSlot(null, a.project || s.project, a.seat);
      if (a.type === 'connect-ai') return window.TribeShell && window.TribeShell.go('ws-agents');
      if (a.type === 'open-gig') return window.TribeTalent.openGig(a.gig);
      if (a.type === 'assign-tasks') {
        for (const t of a.tasks) await api(`/tasks/${encodeURIComponent(t)}`, { method: 'PATCH', body: { assignee: a.agent, status: 'doing' }, project: s.project });
        toast(`Handed ${a.tasks.length} to ${a.agentName}`); if (refresh) refresh();
      }
    } catch (e) { toast(e.message); }
  }

  // ---------- the stage tracker ----------
  const STEPS = [['open', 'Posted'], ['assigned', 'Assigned'], ['working', 'Working'], ['review', 'Review'], ['done', 'Done']];
  function stageHtml(g) {
    const s = g.stage || 'open', at = s === 'credited' ? 5 : STEPS.findIndex(x => x[0] === s);
    if (s === 'open' && !g.filledBy) return '';
    return `<ol class="wl-track" aria-label="Progress: ${esc(s)}">${STEPS.map(([k, l], i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}" data-step="${k}">${l}</li>`).join('')}</ol>
      ${g.filledName ? `<small class="wl-who">${g.filledAgent ? 'AI helper · ' : ''}${esc(g.filledName)}${g.pct != null && s !== 'open' ? ` · ${esc(g.pct)}%` : ''}${s === 'credited' ? ' · credited ✓' : ''}</small>` : ''}`;
  }

  // ---------- the loop panel in a gig's sheet ----------
  function loopHtml(g) {
    const s = g.stage || 'open', canWork = g.canManage || g.mine, ups = (g.updates || []).slice().reverse();
    const parts = [`<section class="wl-loop" id="wl-loop" data-stage="${esc(s)}">${stageHtml(g)}`];
    if (s === 'open' && g.canManage && g.status === 'open') parts.push(`<div class="wl-match"><span class="eyebrow">Matches · people and agents</span><ul class="wl-match-list" id="wl-matches"><li class="tl-none">Ranking by skills and seats…</li></ul></div>`);
    if (g.filledBy && (s === 'assigned' || s === 'working') && canWork) parts.push(`<form class="wl-up" id="wl-up"><span class="eyebrow">Progress</span><div class="wl-up-row"><input class="input" id="wl-up-t" maxlength="400" placeholder="What moved? One line is enough"><input class="input wl-pct" id="wl-up-p" type="number" min="0" max="100" step="5" placeholder="%" aria-label="Percent done" value="${g.pct != null ? esc(g.pct) : ''}"><button class="btn sm tonal" type="submit">Post update</button></div>
      <div class="wl-up-row"><input class="input" id="wl-sub-n" maxlength="600" placeholder="A note for the review (optional)"><button class="btn sm primary" type="button" id="wl-submit">Hand in for review</button></div></form>`);
    if (s === 'review' && g.canManage) parts.push(`<form class="wl-rev" id="wl-rev"><span class="eyebrow">Review</span><div class="wl-stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} of 5">★</button>`).join('')}</div>
      <textarea class="input" id="wl-rev-n" rows="2" maxlength="600" placeholder="What was good, what to change"></textarea><div class="wl-up-row"><button class="btn sm ghost" type="button" id="wl-changes">Ask for changes</button><button class="btn sm primary" type="button" id="wl-approve">Approve</button></div></form>`);
    if (s === 'review' && !g.canManage) parts.push('<p class="tl-fine">Handed in. The poster reviews it next.</p>');
    if (s === 'done' && g.canManage) parts.push(`<form class="wl-credit" id="wl-credit"><span class="eyebrow">Credit</span>
      ${g.filledAgent ? '<p class="tl-fine">An AI helper did this on its owner\'s AI. Record what it cost in Money, or just say thanks.</p>' : '<p class="tl-fine">Hours go to the time bank (they confirm, as always). An amount becomes a cost line in Money. TribeCode moves no money: settle it yourselves.</p>'}
      <div class="wl-up-row">${g.filledAgent ? '' : `<label class="tl-lbl wl-sm">Hours<input class="input" id="wl-cr-h" type="number" min="0" max="80" step="0.25" value="${esc(g.hours || 1)}"></label>`}
      ${g.project ? `<label class="tl-lbl wl-sm">Amount <small class="faint">optional</small><input class="input" id="wl-cr-a" type="number" min="0" step="0.01" placeholder="${g.pay && g.pay.type === 'paid' ? esc(g.pay.text || '0') : '0'}"></label>` : ''}</div>
      <div class="wl-up-row"><button class="btn sm ghost" type="button" id="wl-thanks">Just say thanks</button><button class="btn sm primary" type="submit" id="wl-cr-go">Credit</button></div></form>`);
    if (ups.length) parts.push(`<div class="wl-ups"><span class="eyebrow">History</span><ul class="tl-txs">${ups.slice(0, 12).map(u => `<li class="tl-tx wl-u" data-ukind="${esc(u.kind || '')}"><span class="tl-tx-t"><b>${esc(u.text)}</b><small>${esc(u.byName || '')} · ${esc(ago(u.at))}${u.pct != null ? ` · ${esc(u.pct)}%` : ''}</small></span></li>`).join('')}</ul></div>`);
    parts.push('</section>');
    return parts.join('');
  }
  function wireLoop(el, g, refresh) {
    const box = el.querySelector('#wl-loop'); if (!box) return;
    const run = async (what, body, msg) => { try { await gigApi(g.id, what, body); if (msg) toast(msg); await refresh(g.id); } catch (e) { toast(e.message); } };
    const ml = box.querySelector('#wl-matches');
    if (ml) gigApi(g.id, 'matches').then(r => {
      const list = r.matches || [];
      ml.innerHTML = list.length ? list.map((m, i) => `<li class="wl-m" data-match="${esc(m.id)}"><span class="tl-av" style="background:${esc(m.color || '#6C7CFF')}">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span><span class="tl-tx-t"><b>${esc(m.name)}${m.agent ? ' <i class="wl-ai">AI helper</i>' : ''}${i === 0 && m.score > 0 ? ' <i class="wl-best">Best match</i>' : ''}</b><small>${esc(m.why)}</small></span><button class="btn sm ${i === 0 ? 'primary' : 'tonal'}" data-assign="${esc(m.id)}">Assign</button></li>`).join('')
        : '<li class="tl-none">Nobody else in the tribe yet. Share the gig, or invite someone below.</li>';
    }).catch(() => { ml.innerHTML = '<li class="tl-none">Could not rank matches right now.</li>'; });
    box.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.assign) { t.disabled = true; return run('assign', { member: t.dataset.assign }, 'Assigned'); }
      if (t.id === 'wl-submit') return run('submit', { note: box.querySelector('#wl-sub-n').value }, 'Handed in for review');
      if (t.dataset.star) { box.querySelectorAll('[data-star]').forEach(s => { const on = +s.dataset.star <= +t.dataset.star; s.classList.toggle('on', on); s.setAttribute('aria-checked', String(s === t)); }); box.dataset.rating = t.dataset.star; return; }
      if (t.id === 'wl-approve' || t.id === 'wl-changes') return run('review', { verdict: t.id === 'wl-approve' ? 'approve' : 'changes', note: box.querySelector('#wl-rev-n').value, rating: +(box.dataset.rating || 0) }, t.id === 'wl-approve' ? 'Approved' : 'Asked for changes');
      if (t.id === 'wl-thanks') return run('credit', { thanks: true }, 'Thanked');
    });
    const up = box.querySelector('#wl-up'); if (up) up.onsubmit = e => { e.preventDefault(); const p = box.querySelector('#wl-up-p').value; run('progress', { text: box.querySelector('#wl-up-t').value, pct: p === '' ? null : +p }, 'Update posted'); };
    const cr = box.querySelector('#wl-credit'); if (cr) cr.onsubmit = e => { e.preventDefault(); const h = box.querySelector('#wl-cr-h'), a = box.querySelector('#wl-cr-a'); run('credit', { hours: h ? +h.value : 0, amount: a && a.value ? +a.value : 0 }, 'Credited'); };
  }

  window.TribeWorkLoop = { suggestHtml, mountSuggest, stageHtml, loopHtml, wireLoop, get suggestions() { return last; } };
})();
