// Money (v0.27 company mode): the company's books, plain. One hero card for this month (revenue, costs, net, runway,
// users, each with chips saying where the numbers came from), the ledger with ONE Filters popover, AI spend per seat,
// seat autopilot, the connectors picker and a CSV dropzone. Server: server/ledger.js + server/seatpilot.js.
//   window.TribeLedger    = { open(), mount(el, pid), hasCompany(pid?) }       the #/money view, or inside #co-ledger-slot
//   window.TribeSeatPilot = { mount(el, pid, seatId?) }                         one seat's autopilot, or every seat + pause-all
(function () {
  'use strict';
  const C = window.TribeClient;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => (window.TribeApp && window.TribeApp.toast ? window.TribeApp.toast(m) : console.log(m));
  const NAME = 'money', HASH = '#/money';
  const curPid = () => (window.TribeProjects && window.TribeProjects.current && window.TribeProjects.current()) || (C && C.project && C.project()) || '';
  const api = (pid, p, o) => C.api(`/projects/${encodeURIComponent(pid)}${p}`, { ...(o || {}), project: pid });
  const ZERO = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
  function money(n, cur, signed) {
    if (n == null || !Number.isFinite(n)) return '—';
    let s; try { s = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', minimumFractionDigits: ZERO.has(cur) ? 0 : 2, maximumFractionDigits: ZERO.has(cur) ? 0 : 2 }).format(Math.abs(n)); } catch { s = (cur || '') + ' ' + Math.abs(n).toFixed(2); }
    return (n < 0 ? '−' : signed && n > 0 ? '+' : '') + s;
  }
  const num = n => Number(n || 0).toLocaleString();
  const when = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const day = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
  const monthLabel = m => { const [y, mo] = String(m).split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' }); };
  const shift = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + k, 1)); return d.toISOString().slice(0, 7); };
  const thisMonth = () => new Date().toISOString().slice(0, 7);
  const SRC_LABEL = { manual: 'typed in', connector: 'connector', 'ai-spend': 'AI spend', ai: 'agent' };
  const CAT = { hosting: 'Hosting', tools: 'Tools', ai: 'AI', ads: 'Ads', fees: 'Fees', people: 'People', other: 'Other' };
  const chip = s => `<span class="lg-chip" data-t="${esc(s.type)}" title="${esc(`${SRC_LABEL[s.type] || s.type} · last added ${when(s.last)}`)}">${esc(s.type === 'manual' ? 'Typed in' : s.name)}${s.count > 1 ? ` <i>${s.count}</i>` : ''}</span>`;
  const chips = list => (list && list.length ? list.slice(0, 3).map(chip).join('') + (list.length > 3 ? `<span class="lg-chip more">+${list.length - 3}</span>` : '') : '<span class="lg-none">nothing recorded</span>');
  const ICON = '<symbol id="i-coin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M14.6 9.2c-.5-.8-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2c1.5.3 2.7.8 2.7 2.1s-1.2 2.1-2.7 2.1c-1.2 0-2.2-.5-2.7-1.4M12 6.4v1.5M12 16.1v1.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></symbol>';
  function ensureIcon() { const s = document.querySelector('svg symbol[id^="i-"]'); if (s && !document.getElementById('i-coin')) s.parentNode.insertAdjacentHTML('beforeend', ICON); }

  // ---------- shared cache per project ----------
  const cache = {};   // pid -> { ledger, summary, connectors, at }
  const has = {};     // pid -> company exists
  async function fetchAll(pid, month, filt) {
    const qs = new URLSearchParams({ month, ...(filt.kind ? { kind: filt.kind } : {}), ...(filt.source ? { source: filt.source } : {}), ...(filt.q ? { q: filt.q } : {}) }).toString();
    const [l, s, cn] = await Promise.all([api(pid, `/ledger?${qs}`), api(pid, `/ledger/summary?month=${month}`), api(pid, '/ledger/connectors').catch(() => ({ connectors: [] }))]);
    cache[pid] = { ledger: l, summary: s, connectors: cn.connectors || [], at: Date.now() };
    setHas(pid, !!l.company);
    return cache[pid];
  }
  function setHas(pid, v) { if (has[pid] === v) return; has[pid] = v; if (pid === curPid()) navRow(); }

  // ---------- one mounted Money panel ----------
  const insts = new Set();
  function mount(el, pid, opts = {}) {
    if (!el) return null;
    pid = pid || curPid();
    let inst = [...insts].find(i => i.el === el);
    if (!inst) { inst = { el, pid, opts, month: thisMonth(), filt: {}, adding: false, popOpen: false, connOpen: null }; insts.add(inst); }
    inst.pid = pid; inst.opts = opts;
    el.classList.add('lg-root');
    el.innerHTML = `<div class="lg-loading">Loading the books…</div>`;
    refresh(inst);
    return { refresh: () => refresh(inst) };
  }
  async function refresh(inst, quiet) {
    if (!inst.el.isConnected) { insts.delete(inst); return; }
    if (!C || !C.hasToken || !C.hasToken()) return;
    try { await fetchAll(inst.pid, inst.month, inst.filt); }
    catch (e) { if (!quiet) inst.el.innerHTML = `<div class="card lg-empty"><p class="eyebrow">Money</p><h3>Couldn't open the books</h3><p class="muted">${esc(e.message || e)}</p></div>`; return; }
    const ae = document.activeElement;
    if (quiet && ae && inst.el.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;   // don't redraw under the cursor
    render(inst);
  }

  function render(inst) {
    const { ledger: L, summary: S, connectors } = cache[inst.pid] || {};
    if (!L) return;
    const cur = S.currency, w = L.canWrite, el = inst.el;
    const cash = S.runway.cash;
    const runwayVal = S.runway.months != null ? `${S.runway.months} <small>months</small>` : '—';
    const costCats = S.costs.byCategory.slice(0, 3).map(c => `<span>${esc(CAT[c.category] || c.category)} ${esc(money(c.total, cur))}</span>`).join('');
    const nFilt = ['kind', 'source', 'q'].filter(k => inst.filt[k]).length;
    el.innerHTML = `
      ${inst.opts.embedded ? '' : `<header class="lg-head"><p class="eyebrow">Money${L.company && L.company.name ? ' · ' + esc(L.company.name) : ''}</p><h1>The books, plainly</h1></header>`}
      <section class="card lg-hero" aria-label="This month">
        <div class="lg-hero-top">
          <div><p class="eyebrow">${esc(monthLabel(S.month))}</p><h2>${S.month === thisMonth() ? 'This month' : esc(monthLabel(S.month))}</h2></div>
          <div class="lg-month" role="group" aria-label="Month">
            <button class="btn ghost lg-ic" data-m="-1" aria-label="Previous month">‹</button>
            <button class="btn ghost lg-ic" data-m="1" aria-label="Next month" ${S.month >= thisMonth() ? 'disabled' : ''}>›</button>
          </div>
        </div>
        <div class="lg-stats">
          <div class="lg-stat" id="lg-rev"><span class="lg-k">Revenue</span><b class="lg-v">${esc(money(S.revenue.total, cur))}</b><span class="lg-src">${chips(S.revenue.sources)}</span></div>
          <div class="lg-stat" id="lg-cost"><span class="lg-k">Costs</span><b class="lg-v">${esc(money(S.costs.total, cur))}</b>${costCats ? `<span class="lg-cats">${costCats}</span>` : ''}<span class="lg-src">${chips(S.costs.sources)}</span></div>
          <div class="lg-stat lg-net ${S.net < 0 ? 'neg' : S.net > 0 ? 'pos' : ''}" id="lg-net"><span class="lg-k">Net</span><b class="lg-v">${esc(money(S.net, cur, true))}</b><span class="lg-src"><span class="lg-none">revenue − costs</span></span></div>
          <div class="lg-stat" id="lg-runway"><span class="lg-k">Runway</span><b class="lg-v">${runwayVal}</b><span class="lg-src">${cash ? `<span class="lg-chip" data-t="manual" title="${esc(`Cash on hand, typed in by ${cash.byName || 'someone'} · ${when(cash.at)}`)}">Cash ${esc(money(cash.amount, cash.currency))}</span>` : ''}${S.runway.months == null ? `<span class="lg-none">${esc(S.runway.reason)}</span>` : ''}${w ? `<button class="lg-link" id="lg-cash">${cash ? 'Update cash' : 'Add cash on hand'}</button>` : ''}</span></div>
          <div class="lg-stat" id="lg-users"><span class="lg-k">Users</span><b class="lg-v">${esc(num(S.users.total))}</b><span class="lg-src">${chips(S.users.sources)}</span></div>
        </div>
        <form class="lg-cashform hidden" id="lg-cashform"><label>Cash on hand today <input class="input" name="amount" inputmode="decimal" placeholder="e.g. 4200" value="${cash ? esc(cash.amount) : ''}" required></label><span class="lg-cur">${esc(cur)}</span><button class="btn primary">Save</button><button class="btn ghost" type="button" data-x>Cancel</button></form>
        <p class="lg-asof">${S.entries ? `${S.entries} entr${S.entries === 1 ? 'y' : 'ies'} · last added ${esc(when(S.asOf))}` : 'Nothing recorded this month yet.'}${S.otherCurrencies.length ? ` · not counted: ${S.otherCurrencies.map(x => `${x.count} in ${esc(x.currency)}`).join(', ')}` : ''}<span> · Only what was recorded, never estimated. A starting point for your books, not financial advice: check with an accountant.</span></p>
      </section>

      <section class="lg-sec" aria-label="Ledger">
        <div class="lg-sec-head">
          <div><p class="eyebrow">Ledger</p><h3>Every number and where it came from</h3></div>
          <div class="lg-tools">
            <div class="lg-popwrap"><button class="btn" id="lg-filt" aria-expanded="${inst.popOpen}">Filters${nFilt ? ` <i class="lg-badge">${nFilt}</i>` : ''}</button>${inst.popOpen ? popover(inst, L) : ''}</div>
            <button class="btn" id="lg-export" title="A CSV for your accountant">Export CSV</button>
            ${w ? `<button class="btn primary" id="lg-add">${inst.adding ? 'Close' : '+ Add'}</button>` : ''}
          </div>
        </div>
        ${w && inst.adding ? addForm(L, cur) : ''}
        <div class="lg-list" id="lg-list">${L.entries.length ? L.entries.map(e => row(e, w)).join('') : `<p class="lg-emptyrow">${nFilt ? 'Nothing matches these filters.' : w ? 'No entries this month. Add one, drop a CSV export below, or connect Stripe.' : 'No entries this month.'}</p>`}</div>
        ${L.total > L.entries.length ? `<p class="lg-more">Showing ${L.entries.length} of ${L.total}. Export CSV for all of them.</p>` : ''}
      </section>

      ${aiBlock(S, L)}

      ${inst.opts.noPilot || !L.company ? '' : `<section class="lg-sec" aria-label="Seat autopilot"><div class="lg-sec-head"><div><p class="eyebrow">Seat autopilot</p><h3>What each seat does on its own</h3></div></div><div id="lg-pilot"></div></section>`}

      <section class="lg-sec" aria-label="Connect your tools">
        <div class="lg-sec-head"><div><p class="eyebrow">Connect</p><h3>Bring in numbers from your tools</h3></div></div>
        ${w ? `<label class="lg-drop" id="lg-drop" tabindex="0"><input type="file" accept=".csv,text/csv" hidden id="lg-file"><span class="lg-drop-ic" aria-hidden="true">⇪</span><span><b>Drop a CSV export here</b><small>Stripe balance or payments, Plausible visitors, a PostHog trends table, or any date, amount, label file.</small></span>
          <select class="input lg-kind" id="lg-kind" aria-label="A plain file holds"><option value="revenue">Plain file: revenue</option><option value="cost">Plain file: costs</option><option value="users">Plain file: users</option></select></label>
          <p class="lg-result hidden" id="lg-result" role="status"></p>` : ''}
        <div class="lg-conns">${connectors.map(c => connCard(c)).join('')}</div>
        <p class="lg-fine">Each connection uses your own account: TribeCode only reads what you bring in. These tools aren't made by or tied to TribeCode.</p>
      </section>
      ${inst.connOpen ? connSheet(inst, connectors.find(c => c.id === inst.connOpen), L) : ''}`;
    wire(inst, L, S);
    const slot = $('#lg-pilot', el); if (slot) pilotMount(slot, inst.pid, null);
  }

  function popover(inst, L) {
    const f = inst.filt;
    const k = (v, t) => `<button type="button" class="lg-seg ${(f.kind || '') === v ? 'on' : ''}" data-k="${v}">${t}</button>`;
    return `<div class="lg-pop" id="lg-pop" role="dialog" aria-label="Filters">
      <p class="eyebrow">Kind</p><div class="lg-segs">${k('', 'All')}${k('revenue', 'Revenue')}${k('cost', 'Costs')}${k('users', 'Users')}${k('other', 'Other')}</div>
      <p class="eyebrow">From</p><select class="input" id="lg-fsrc"><option value="">Anywhere</option>${['manual', 'connector', 'ai-spend', 'ai'].map(t => `<option value="${t}" ${f.source === t ? 'selected' : ''}>${esc(SRC_LABEL[t])}</option>`).join('')}${(L.sources || []).filter(s => s.type === 'connector').map(s => `<option value="${esc(s.name)}" ${f.source === s.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <p class="eyebrow">Search</p><input class="input" id="lg-fq" placeholder="Label or category" value="${esc(f.q || '')}">
      <div class="lg-pop-acts"><button type="button" class="btn ghost" id="lg-fclear">Clear</button><button type="button" class="btn primary" id="lg-fapply">Done</button></div></div>`;
  }
  function addForm(L, cur) {
    return `<form class="lg-addform" id="lg-addform">
      <div class="lg-segs" role="radiogroup" aria-label="Kind">${[['revenue', 'Revenue'], ['cost', 'Cost'], ['users', 'Users'], ['other', 'Other']].map(([v, t], i) => `<label class="lg-seg"><input type="radio" name="kind" value="${v}" ${i === 0 ? 'checked' : ''}>${t}</label>`).join('')}</div>
      <input class="input" name="label" placeholder="What is it? e.g. Pro plan, March" required maxlength="160">
      <input class="input lg-amt" name="amount" inputmode="decimal" placeholder="Amount (${esc(cur)})" required>
      <input class="input" name="at" type="date" value="${new Date().toISOString().slice(0, 10)}" aria-label="Date">
      <select class="input lg-cat" name="category" aria-label="Category">${Object.entries(CAT).map(([k, v]) => `<option value="${k}" ${k === 'other' ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn primary">Add</button></form>`;
  }
  function row(e, w) {
    const amt = e.kind === 'users' ? `${num(e.amount)} <small>users</small>` : esc(money(e.kind === 'cost' ? -e.amount : e.amount, e.currency, e.kind === 'revenue'));
    return `<div class="lg-row" data-id="${esc(e.id)}"><span class="lg-dot k-${esc(e.kind)}" aria-hidden="true"></span>
      <span class="lg-main"><b>${esc(e.label)}</b><small>${esc(day(e.at))}${e.category ? ' · ' + esc(CAT[e.category] || e.category) : ''} · ${chip({ ...e.source, count: 1, last: e.added })}${e.byName ? ` <span class="lg-by">by ${esc(e.byName)}</span>` : ''}</small></span>
      <span class="lg-amt k-${esc(e.kind)}">${amt}</span>${w ? `<button class="lg-x" data-del="${esc(e.id)}" aria-label="Remove ${esc(e.label)}" title="Remove">×</button>` : ''}</div>`;
  }
  function aiBlock(S, L) {
    const rows = (S.aiSpend.seats || []).filter(r => r.events || r.budget);
    if (!L.company) return '';
    const cur = S.aiSpend.currency;
    return `<section class="lg-sec" aria-label="AI spend"><div class="lg-sec-head"><div><p class="eyebrow">AI spend · week of ${esc(day(S.aiSpend.week))}</p><h3>Each seat against its weekly budget</h3></div><span class="lg-total">${esc(money(S.aiSpend.total, cur))}</span></div>
      ${rows.length ? `<div class="lg-ai">${rows.map(r => `<div class="lg-airow ${r.over ? 'over' : ''}"><span class="lg-seatdot" style="--c:${esc(r.color || '#94A3B8')}"></span><b>${esc(r.title)}</b>
        <span class="lg-bar" role="meter" aria-valuemin="0" aria-valuemax="${r.budget || 0}" aria-valuenow="${r.spent}" aria-label="${esc(r.title)} spend"><i style="width:${r.budget ? Math.min(100, r.pct) : 0}%"></i></span>
        <span class="lg-aiv">${esc(money(r.spent, cur))}${r.budget ? ` <small>of ${esc(money(r.budget, cur))}</small>` : ' <small>no cap</small>'}</span>
        <small class="lg-aim">${r.events ? `${r.events} report${r.events === 1 ? '' : 's'} · ${num(r.tokensIn + r.tokensOut)} tokens${r.models.length ? ' · ' + esc(r.models.slice(0, 2).join(', ')) : ''}` : 'nothing reported yet'}</small></div>`).join('')}</div>`
        : `<p class="lg-emptyrow">No AI spend reported this week. Agents report it with the report_spend tool; budgets come from each seat's charter.</p>`}</section>`;
  }
  function connCard(c) {
    const st = c.status || {};
    const state = c.id === 'stripe' ? (st.key ? (st.last ? `Synced ${when(st.last)}` : 'Key added') : '') : (st.imports ? `${st.imports} import${st.imports === 1 ? '' : 's'}` : '');
    return `<button class="lg-conn" data-conn="${esc(c.id)}" style="--c:${esc(c.color)}"><span class="lg-conn-ic" aria-hidden="true">${esc(c.name[0])}</span><span><b>${esc(c.name)}</b><small>${esc(c.gives)}</small></span>${state ? `<em class="lg-conn-st">${esc(state)}</em>` : ''}</button>`;
  }
  function connSheet(inst, c, L) {
    if (!c) return '';
    const st = c.status || {}, host = L.isHost;
    const stripe = c.id === 'stripe' ? `<div class="lg-way"><p class="eyebrow">Sync now</p>${st.key ? `<p>Key ${esc(st.hint || 'added')}${st.last ? ` · last sync ${esc(when(st.last))} (${st.added} new)` : ''}.</p><div class="lg-row-acts">${L.canWrite ? '<button class="btn primary" id="lg-sync">Sync now</button>' : ''}${host ? '<button class="btn ghost" id="lg-unkey">Remove key</button>' : ''}</div>`
      : host ? `<p>Paste a <a href="${esc(c.api.docs)}" target="_blank" rel="noopener">restricted key</a> with read access to Balance transactions. It stays on this computer, in the tribe's secrets, and is never shown again.</p><form class="lg-keyform" id="lg-keyform"><input class="input" name="key" placeholder="rk_live_…" autocomplete="off" spellcheck="false" required><button class="btn primary">Save key</button></form>`
      : '<p>The host adds a Stripe key on their computer to turn on Sync now. Until then, import a CSV export.</p>'}</div>` : '';
    return `<div class="lg-scrim" id="lg-scrim"></div><div class="lg-sheet" role="dialog" aria-modal="true" aria-label="Connect ${esc(c.name)}" style="--c:${esc(c.color)}">
      <div class="lg-sheet-head"><span class="lg-conn-ic" aria-hidden="true">${esc(c.name[0])}</span><div><p class="eyebrow">Connect</p><h3>${esc(c.name)}</h3><small>${esc(c.gives)}</small></div><button class="btn ghost lg-ic" id="lg-sheet-x" aria-label="Close">×</button></div>
      ${stripe}
      ${c.mcp ? `<div class="lg-way"><p class="eyebrow">With your own MCP server</p><p>Your Claude reads ${esc(c.name)} directly, with your login. In Claude Code:</p><code class="lg-code">${esc(c.mcp.add)}</code><p><a href="${esc(c.mcp.docs)}" target="_blank" rel="noopener">${esc(c.name)}'s MCP guide</a>. Then ask your finance agent to add what it reads with ledger_add.</p></div>` : ''}
      <div class="lg-way"><p class="eyebrow">With an API key</p><p>${esc(c.api.note)} <a href="${esc(c.api.docs)}" target="_blank" rel="noopener">How to make one</a>.${c.id === 'stripe' ? '' : ' Give it to your own agent, never paste keys in chat.'}</p></div>
      <div class="lg-way"><p class="eyebrow">With a CSV export</p><p>${esc(c.csv)} Then drop the file on "Drop a CSV export here".</p></div>
    </div>`;
  }

  function wire(inst, L, S) {
    const el = inst.el, pid = inst.pid;
    $$('[data-m]', el).forEach(b => b.onclick = () => { inst.month = shift(inst.month, +b.dataset.m); refresh(inst); });
    const cb = $('#lg-cash', el), cf = $('#lg-cashform', el);
    if (cb && cf) { cb.onclick = () => { cf.classList.toggle('hidden'); const i = cf.querySelector('input'); if (i) i.focus(); }; cf.querySelector('[data-x]').onclick = () => cf.classList.add('hidden');
      cf.onsubmit = async e => { e.preventDefault(); try { await api(pid, '/ledger/settings', { method: 'PUT', body: { cash: { amount: cf.amount.value, currency: S.currency } } }); toast('Cash on hand saved'); refresh(inst); } catch (er) { toast(er.message); } }; }
    const fb = $('#lg-filt', el);
    if (fb) fb.onclick = e => { e.stopPropagation(); inst.popOpen = !inst.popOpen; render(inst); if (inst.popOpen) { const q = $('#lg-fq', el); if (q && !matchMedia('(max-width: 820px)').matches) q.focus(); } };
    const pop = $('#lg-pop', el);
    if (pop) {
      pop.onclick = e => e.stopPropagation();
      $$('[data-k]', pop).forEach(b => b.onclick = () => { $$('[data-k]', pop).forEach(x => x.classList.toggle('on', x === b)); });
      const apply = () => { const on = $('[data-k].on', pop); inst.filt = { kind: on ? on.dataset.k : '', source: $('#lg-fsrc', pop).value, q: $('#lg-fq', pop).value.trim() }; inst.popOpen = false; refresh(inst); };
      $('#lg-fapply', pop).onclick = apply; $('#lg-fq', pop).onkeydown = e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') { inst.popOpen = false; render(inst); } };
      $('#lg-fclear', pop).onclick = () => { inst.filt = {}; inst.popOpen = false; refresh(inst); };
      setTimeout(() => document.addEventListener('click', function off() { if (inst.popOpen) { inst.popOpen = false; render(inst); } }, { once: true }), 0);
    }
    const ex = $('#lg-export', el);
    if (ex) ex.onclick = async () => {
      try { const r = await api(pid, `/ledger.csv?month=${inst.month}&format=json`); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' })); a.download = r.filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast(`Exported ${r.rows} row${r.rows === 1 ? '' : 's'}`); }
      catch (e) { toast(e.message); }
    };
    const ad = $('#lg-add', el); if (ad) ad.onclick = () => { inst.adding = !inst.adding; render(inst); const f = $('#lg-addform', el); if (f) f.label.focus(); };
    const af = $('#lg-addform', el);
    if (af) {
      const cat = af.querySelector('.lg-cat'), sync = () => { const k = af.kind.value; cat.classList.toggle('hidden', k !== 'cost'); af.amount.placeholder = k === 'users' ? 'How many people' : `Amount (${S.currency})`; };
      af.addEventListener('change', sync); sync();
      af.onsubmit = async e => { e.preventDefault(); const k = af.kind.value;
        try { await api(pid, '/ledger', { method: 'POST', body: { kind: k, label: af.label.value, amount: af.amount.value, at: af.at.value, ...(k === 'cost' ? { category: af.category.value } : {}) } }); inst.adding = false; if (af.at.value && af.at.value.slice(0, 7) !== inst.month) inst.month = af.at.value.slice(0, 7); toast('Added'); refresh(inst); }
        catch (er) { toast(er.message); } };
    }
    $$('[data-del]', el).forEach(b => b.onclick = async () => { const r = b.closest('.lg-row'); try { await api(pid, `/ledger/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); r && r.remove(); refresh(inst, true); } catch (e) { toast(e.message); } });
    // import
    const drop = $('#lg-drop', el), file = $('#lg-file', el), res = $('#lg-result', el);
    const send = async (text, name) => {
      if (!text || !text.trim()) return; drop.classList.add('busy');
      try { const r = await api(pid, '/ledger/import', { method: 'POST', body: { csv: text, name, kind: $('#lg-kind', el).value } });
        const what = { 'stripe-balance': 'Stripe balance changes', 'stripe-charges': 'Stripe payments', 'stripe-payouts': 'Stripe payouts', plausible: 'Plausible visitors', posthog: 'PostHog trends', generic: 'a plain file' }[r.format] || r.format;
        inst._result = `Read ${what}: added ${r.added}${r.skipped ? `, skipped ${r.skipped} already here` : ''}.${(r.warnings || []).length ? ' ' + r.warnings.join(' ') : ''}`; refresh(inst); }
      catch (e) { res.textContent = e.message; res.classList.remove('hidden'); res.classList.add('bad'); }
      finally { drop.classList.remove('busy'); }
    };
    if (drop) {
      const read = f => { if (!f) return; if (f.size > 4 * 1024 * 1024) { toast('That file is too big (4 MB at most)'); return; } const r = new FileReader(); r.onload = () => send(String(r.result), f.name); r.readAsText(f); };
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); read(e.dataTransfer.files[0]); });
      drop.addEventListener('paste', e => { const t = e.clipboardData && e.clipboardData.getData('text'); if (t) { e.preventDefault(); send(t, 'pasted'); } });
      drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
      file.onchange = () => { read(file.files[0]); file.value = ''; };
      if (inst._result && res) { res.textContent = inst._result; res.classList.remove('hidden', 'bad'); inst._result = ''; }
    }
    // connectors
    $$('[data-conn]', el).forEach(b => b.onclick = () => { inst.connOpen = b.dataset.conn; render(inst); const x = $('#lg-sheet-x', el); x && x.focus(); });
    const close = () => { inst.connOpen = null; render(inst); };
    const sx = $('#lg-sheet-x', el); if (sx) sx.onclick = close;
    const sc = $('#lg-scrim', el); if (sc) sc.onclick = close;
    const kf = $('#lg-keyform', el);
    if (kf) kf.onsubmit = async e => { e.preventDefault(); try { await api(pid, '/ledger/connectors/stripe/key', { method: 'PUT', body: { key: kf.key.value } }); kf.key.value = ''; toast('Stripe key saved on this computer'); refresh(inst); } catch (er) { toast(er.message); } };
    const sy = $('#lg-sync', el);
    if (sy) sy.onclick = async () => { sy.disabled = true; sy.textContent = 'Syncing…'; try { const r = await api(pid, '/ledger/connectors/stripe/sync', { method: 'POST', body: {} }); toast(`Stripe: ${r.added} new${r.skipped ? `, ${r.skipped} already here` : ''}`); refresh(inst); } catch (e) { toast(e.message); sy.disabled = false; sy.textContent = 'Sync now'; } };
    const uk = $('#lg-unkey', el);
    if (uk) uk.onclick = async () => { try { await api(pid, '/ledger/connectors/stripe/key', { method: 'DELETE' }); toast('Key removed'); refresh(inst); } catch (e) { toast(e.message); } };
    el.onkeydown = e => { if (e.key === 'Escape' && inst.connOpen) close(); };
  }

  // ---------- seat autopilot ----------
  const pilots = new Set();
  const EVERY = { daily: 'Every day', weekdays: 'Weekdays', weekly: 'Weekly' };
  const DAY = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  function pilotMount(el, pid, seatId) {
    if (!el) return null;
    pid = pid || curPid();
    let p = [...pilots].find(x => x.el === el);
    if (!p) { p = { el, pid, seatId, open: seatId || null }; pilots.add(p); }
    p.pid = pid; p.seatId = seatId || null; if (seatId) p.open = seatId;
    el.classList.add('sp-root');
    pilotLoad(p);
    return { refresh: () => pilotLoad(p) };
  }
  async function pilotLoad(p, quiet) {
    if (!p.el.isConnected) { pilots.delete(p); return; }
    try { p.st = await api(p.pid, '/seatpilot'); } catch (e) { if (!quiet) p.el.innerHTML = `<p class="lg-emptyrow">${esc(e.message)}</p>`; return; }
    const ae = document.activeElement;
    if (quiet && ae && p.el.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    pilotRender(p);
  }
  function seatPanel(p, id, s, cur) {
    const runs = p.st.runs.filter(r => r.seat === id).slice(0, 3);
    const pct = s.budget ? Math.min(100, Math.round(s.spent / s.budget * 100)) : 0, dis = s.canSteer ? '' : 'disabled';
    return `<div class="sp-panel" data-seat="${esc(id)}">
      <div class="sp-sched">
        <label class="sp-switch"><input type="checkbox" data-f="on" ${s.on ? 'checked' : ''} ${dis}><span>${s.on ? 'On' : 'Off'}</span></label>
        <select class="input" data-f="every" ${dis} aria-label="How often">${Object.entries(EVERY).map(([k, v]) => `<option value="${k}" ${s.every === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        ${s.every === 'weekly' ? `<select class="input" data-f="day" ${dis} aria-label="Day">${Object.entries(DAY).map(([k, v]) => `<option value="${k}" ${s.day === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ''}
        <label class="sp-at">at <input class="input" type="time" data-f="at" value="${esc(s.at)}" ${dis}></label>
      </div>
      <p class="eyebrow">Jobs ${s.custom ? '' : '<span class="sp-hint">from the charter</span>'}</p>
      <ol class="sp-tasks">${s.tasks.map((t, i) => `<li><input class="input" data-task="${i}" value="${esc(t)}" maxlength="400" ${dis} aria-label="Job ${i + 1}">${s.canSteer ? `<button class="lg-x" data-rmtask="${i}" aria-label="Remove job ${i + 1}">×</button>` : ''}</li>`).join('')}</ol>
      ${s.canSteer ? `<div class="sp-acts"><button class="btn ghost" data-addtask>+ Job</button><button class="btn" data-save>Save</button><button class="btn primary" data-run ${p.st.paused ? 'disabled title="Autopilot is paused"' : ''}>Run now</button></div>` : ''}
      <div class="sp-budget"><span>AI budget this week</span><span class="lg-bar ${s.budget && s.spent >= s.budget ? 'over' : ''}"><i style="width:${pct}%"></i></span><b>${esc(money(s.spent, cur))}${s.budget ? ` <small>of ${esc(money(s.budget, cur))}</small>` : ' <small>no cap</small>'}</b></div>
      ${s.needsApproval.length ? `<p class="sp-ok">Asks first: ${s.needsApproval.map(x => `<span class="lg-chip">${esc(x)}</span>`).join('')}<span class="lg-chip warn">health · money · legal topics</span></p>` : ''}
      ${runs.length ? `<ul class="sp-runs">${runs.map(r => `<li class="st-${esc(r.status)}"><span>${esc(when(r.at))}</span><b>${r.status === 'posted' ? `${r.jobs} job${r.jobs === 1 ? '' : 's'} posted${r.approvals && r.approvals.length ? `, ${r.approvals.length} waiting for approval` : ''}` : esc(r.reason || r.status)}</b><small>${esc(r.trigger)}</small></li>`).join('')}</ul>` : '<p class="sp-none">No runs yet.</p>'}
    </div>`;
  }
  function pilotRender(p) {
    const st = p.st, el = p.el, cur = st.currency;
    if (!st.company) { el.innerHTML = '<p class="lg-emptyrow">Seats run on autopilot once this project is a company.</p>'; return; }
    const ids = p.seatId ? [p.seatId] : Object.keys(st.seats);
    const line = s => s.on ? `${EVERY[s.every]}${s.every === 'weekly' ? ' ' + DAY[s.day] : ''} at ${s.at}${s.next ? ` · next ${when(s.next)}` : ''}` : 'Off';
    el.innerHTML = `${p.seatId ? '' : `<div class="sp-top ${st.paused ? 'paused' : ''}"><div><b>${st.paused ? 'Paused for everyone' : 'Autopilot is running'}</b><small>${st.paused ? `by ${esc(st.pausedBy || 'someone')} · ${esc(when(st.pausedAt))}` : 'Jobs go to each seat\'s agent in #agents. Anything outward or costly waits for a human.'}</small></div>${st.canSteer ? `<button class="btn ${st.paused ? 'primary' : ''}" id="sp-pause">${st.paused ? 'Resume all' : 'Pause all'}</button>` : ''}</div>`}
      <div class="sp-seats">${ids.map(id => { const s = st.seats[id]; if (!s) return ''; const open = p.open === id || !!p.seatId; return `<div class="sp-seat ${open ? 'open' : ''}">
        ${p.seatId ? '' : `<button class="sp-seathead" data-open="${esc(id)}" aria-expanded="${open}"><span class="lg-seatdot" style="--c:${esc(s.color || '#94A3B8')}"></span><b>${esc(s.title)}</b><small>${esc(s.holderNames.agent || s.holderNames.person || 'nobody yet')}</small><em class="${s.on && !st.paused ? 'on' : ''}">${esc(st.paused && s.on ? 'Paused' : line(s))}</em></button>`}
        ${open ? seatPanel(p, id, s, cur) : ''}</div>`; }).join('')}</div>
      ${p.seatId ? '' : `<details class="sp-more"><summary>Do-not-contact list · audit trail</summary>
        <p class="eyebrow">Never contact</p><textarea class="input" id="sp-dnc" rows="3" placeholder="One per line: an email, @domain.com or a name" ${st.canSteer ? '' : 'disabled'}>${esc(st.dnc.join('\n'))}</textarea>${st.canSteer ? '<button class="btn" id="sp-dnc-save">Save list</button>' : ''}
        <p class="eyebrow">Audit trail</p><ul class="sp-audit">${st.audit.slice(0, 15).map(a => `<li><span>${esc(when(a.at))}</span> <b>${esc(a.byName)}</b> ${esc(a.action)}${a.seat ? ' · ' + esc(a.seat) : ''}${a.detail ? ` <small>${esc(a.detail)}</small>` : ''}</li>`).join('') || '<li>Nothing yet.</li>'}</ul></details>`}`;
    // wire
    const pz = $('#sp-pause', el); if (pz) pz.onclick = async () => { try { p.st = await api(p.pid, '/seatpilot/pause', { method: 'POST', body: { paused: !st.paused } }); pilotRender(p); toast(p.st.paused ? 'Autopilot paused for everyone' : 'Autopilot resumed'); } catch (e) { toast(e.message); } };
    $$('[data-open]', el).forEach(b => b.onclick = () => { p.open = p.open === b.dataset.open ? null : b.dataset.open; pilotRender(p); });
    $$('.sp-panel', el).forEach(pn => {
      const id = pn.dataset.seat, s = st.seats[id];
      const collect = () => ({ on: pn.querySelector('[data-f="on"]').checked, every: pn.querySelector('[data-f="every"]').value, at: pn.querySelector('[data-f="at"]').value, ...(pn.querySelector('[data-f="day"]') ? { day: pn.querySelector('[data-f="day"]').value } : {}), tasks: $$('[data-task]', pn).map(i => i.value.trim()).filter(Boolean) });
      const put = async (body, msg) => { try { p.st = await api(p.pid, `/seatpilot/seats/${encodeURIComponent(id)}`, { method: 'PUT', body }); pilotRender(p); if (msg) toast(msg); } catch (e) { toast(e.message); } };
      const on = pn.querySelector('[data-f="on"]'); if (on) on.onchange = () => put(collect(), on.checked ? `${s.title} autopilot on` : `${s.title} autopilot off`);
      const ev = pn.querySelector('[data-f="every"]'); if (ev) ev.onchange = () => put(collect());
      const sv = pn.querySelector('[data-save]'); if (sv) sv.onclick = () => put(collect(), 'Saved');
      const at = pn.querySelector('[data-addtask]'); if (at) at.onclick = () => { const ol = pn.querySelector('.sp-tasks'); const n = ol.children.length; ol.insertAdjacentHTML('beforeend', `<li><input class="input" data-task="${n}" maxlength="400" placeholder="e.g. Draft two posts about this week's update" aria-label="Job ${n + 1}"></li>`); ol.lastElementChild.querySelector('input').focus(); };
      $$('[data-rmtask]', pn).forEach(b => b.onclick = () => { b.closest('li').remove(); });
      const rn = pn.querySelector('[data-run]');
      if (rn) rn.onclick = async () => { rn.disabled = true; try { const r = await api(p.pid, '/seatpilot/run', { method: 'POST', body: { seat: id } }); toast(`${r.run.jobs} job${r.run.jobs === 1 ? '' : 's'} posted to #agents${r.run.approvals.length ? `, ${r.run.approvals.length} waiting for approval` : ''}`); } catch (e) { toast(e.message); } pilotLoad(p); };
    });
    const ds = $('#sp-dnc-save', el); if (ds) ds.onclick = async () => { try { p.st = await api(p.pid, '/seatpilot/dnc', { method: 'PUT', body: { list: $('#sp-dnc', el).value.split('\n') } }); toast('Do-not-contact list saved'); pilotRender(p); } catch (e) { toast(e.message); } };
  }

  // ---------- the #/money view ----------
  let open = false;
  function section() {
    let s = document.getElementById('view-' + NAME);
    if (!s) { const main = $('.main'); if (!main) return null; s = document.createElement('section'); s.id = 'view-' + NAME; s.className = 'hidden'; main.appendChild(s); s.innerHTML = '<div class="lg-page" id="lg-page"></div>'; }
    return s;
  }
  function show() {
    const sec = section(); if (!sec) return;
    document.querySelectorAll('.main > section[id^="view-"]').forEach(s => { if (s !== sec) s.classList.add('hidden'); });
    delete document.body.dataset.scope;
    sec.classList.remove('hidden');
    document.body.classList.remove('mobile-chat', 'drawer-open');
    document.body.dataset.view = NAME; open = true;
    const crumb = $('#crumb-label'); if (crumb) crumb.textContent = 'Money';
    if (location.hash !== HASH) history.replaceState(null, '', location.pathname + location.search + HASH);
    try { C.sendActivity && C.sendActivity('Money'); } catch {}
    mount($('#lg-page', sec), curPid());
    window.scrollTo(0, 0); const m = $('.main'); if (m) m.scrollTop = 0;
  }
  function hide() { const sec = section(); if (sec) sec.classList.add('hidden'); open = false; if (location.hash === HASH) history.replaceState(null, '', location.pathname + location.search); }
  new MutationObserver(() => { if (open && document.body.dataset.view !== NAME) hide(); }).observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  const fromHash = () => { if (location.hash === HASH && !open) show(); };
  window.addEventListener('hashchange', fromHash);

  // The sidebar row: right under Agents Hub, only when this project is a company.
  function navRow() {
    ensureIcon();
    const after = document.getElementById('nest-ws-agents'); if (!after) return;
    let b = document.getElementById('nest-money');
    const on = !!has[curPid()];
    if (!b && on) { after.insertAdjacentHTML('afterend', '<button class="nest-row core" data-pnav="money" id="nest-money"><svg class="i"><use href="#i-coin"/></svg><span>Money</span></button>'); b = document.getElementById('nest-money'); }
    if (b) b.classList.toggle('hidden', !on);
  }
  async function probe() {
    const pid = curPid(); if (!pid || !C || !C.hasToken || !C.hasToken()) return;
    try { const l = await api(pid, '/ledger?limit=1'); setHas(pid, !!l.company); } catch { setHas(pid, false); }
  }
  let t = null;
  const soon = fn => { clearTimeout(t); t = setTimeout(fn, 250); };
  if (C && C.on) {
    C.on('hello', () => { setTimeout(fromHash, 50); probe(); });
    C.on('project', () => { navRow(); probe(); if (open) show(); });
    C.on('ws', m => {
      if (!m) return;
      if (m.type === 'company') { if (m.project === curPid()) probe(); soon(() => { insts.forEach(i => refresh(i, true)); pilots.forEach(p => pilotLoad(p, true)); }); }
      if (m.type === 'ledger') soon(() => insts.forEach(i => { if (i.pid === m.project) refresh(i, true); }));
      if (m.type === 'seatpilot') soon(() => pilots.forEach(p => { if (p.pid === m.project) pilotLoad(p, true); }));
    });
  }
  setTimeout(() => { ensureIcon(); fromHash(); probe(); }, 0);

  window.TribeLedger = { open: show, close: hide, isOpen: () => open, mount: (el, pid) => mount(el, pid, { embedded: true }), hasCompany: pid => !!has[pid || curPid()], refresh: () => insts.forEach(i => refresh(i)) };
  window.TribeSeatPilot = { mount: pilotMount };
})();
