// Company links (v0.27): connects the Company view (company.js) to the parts built beside it, through the mount
// points and events company.js exposes:
//   view  'tribe:company-view'  → #co-ledger-slot (a compact "Money this month" card → Money) and #co-autopilot-slot
//                                  (every AI seat's schedule + pause-all, ledger.js TribeSeatPilot; Advanced or turned on)
//         .co-hire-slot[data-seat] on empty seat cards → "Hire someone" (talent.js)
//   sheet 'tribe:company-sheet' → #co-academy-slot ("Learn this role", academy.js), #co-hire-slot (talent.js),
//                                  #co-seat-autopilot-slot (this seat's schedule), #co-seat-ledger-slot (this seat's AI spend)
(function () {
  const C = window.TribeClient; if (!C) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0); } catch { return `${Math.round(Number(n) || 0)} ${cur || ''}`; } };
  const allows = key => !window.TribeMode || !window.TribeMode.allowsKey || window.TribeMode.allowsKey(key);

  async function moneyCard(el, pid) {
    if (!el) return;
    let s = null; try { s = await C.api(`/projects/${encodeURIComponent(pid)}/ledger/summary`); } catch { el.innerHTML = ''; return; }
    const cur = s.currency || 'USD', empty = !s.entries;
    const rev = (s.revenue || {}).total || 0, cost = (s.costs || {}).total || 0, net = s.net != null ? (typeof s.net === 'object' ? s.net.total : s.net) : rev - cost;
    const users = s.users && s.users.count ? s.users.total : null;
    el.innerHTML = `<section class="cl-money"><div class="cl-head"><span class="eyebrow">Money this month</span>${allows('money') ? '<button class="linkish" data-cl-money>Open Money →</button>' : '<button class="linkish" data-cl-unlock>Turn on Money</button>'}</div>
      ${empty ? '<p class="faint cl-empty">Nothing recorded yet. Add a number by hand or import a Stripe CSV; every figure keeps its source.</p>'
        : `<div class="cl-nums"><div><small>Revenue</small><b>${esc(money(rev, cur))}</b></div><div><small>Costs</small><b>${esc(money(cost, cur))}</b></div><div><small>Net</small><b class="${net >= 0 ? 'pos' : 'neg'}">${esc(money(net, cur))}</b></div>${users != null ? `<div><small>Users</small><b>${esc(users)}</b></div>` : ''}</div>`}</section>`;
    const go = () => (window.TribeShell && window.TribeShell.go ? window.TribeShell.go('money') : window.TribeLedger && window.TribeLedger.open());
    const b = el.querySelector('[data-cl-money]'); if (b) b.onclick = go;
    const u = el.querySelector('[data-cl-unlock]'); if (u) u.onclick = () => { window.TribeMode.unlock('money'); go(); };
  }
  async function seatSpend(el, pid, seatId) {
    if (!el) return;
    let w = null; try { w = await C.api(`/projects/${encodeURIComponent(pid)}/ledger/ai-spend`); } catch { el.innerHTML = ''; return; }
    const row = ((w && w.seats) || []).find(r => r.seat === seatId); if (!row || (!row.events && !row.budget)) { el.innerHTML = ''; return; }
    const pct = row.budget ? Math.min(100, Math.round(row.spent / row.budget * 100)) : 0;
    el.innerHTML = `<div class="cl-spend"><span class="eyebrow">AI spend this week</span><b>${esc(money(row.spent, w.currency))}${row.budget ? ` <span class="faint">of ${esc(money(row.budget, w.currency))}</span>` : ''}</b>${row.budget ? `<span class="cl-bar ${row.over ? 'over' : ''}"><i style="width:${pct}%"></i></span>` : ''}</div>`;
  }

  window.addEventListener('tribe:company-view', e => {
    const { project: pid } = e.detail || {}; if (!pid) return;
    moneyCard(document.getElementById('co-ledger-slot'), pid);
    const ap = document.getElementById('co-autopilot-slot');
    if (ap && window.TribeSeatPilot) window.TribeSeatPilot.mount(ap, pid);
    if (window.TribeTalent && window.TribeTalent.hireSlot) document.querySelectorAll('.co-hire-slot[data-seat]').forEach(el => { if (!el.children.length) window.TribeTalent.hireSlot(el, pid, el.dataset.seat); });
  });
  window.addEventListener('tribe:company-sheet', e => {
    const { project: pid, seat } = e.detail || {}; if (!pid || !seat) return;
    const ac = document.getElementById('co-academy-slot'); if (ac && window.TribeAcademy && window.TribeAcademy.mount) window.TribeAcademy.mount(ac, seat.kind === 'custom' ? 'founder' : seat.kind);
    const hs = document.getElementById('co-hire-slot'); if (hs && window.TribeTalent && window.TribeTalent.hireSlot) window.TribeTalent.hireSlot(hs, pid, seat.id);
    const sp = document.getElementById('co-seat-autopilot-slot'); if (sp && window.TribeSeatPilot && (seat.holder || {}).agent) window.TribeSeatPilot.mount(sp, pid, seat.id);
    seatSpend(document.getElementById('co-seat-ledger-slot'), pid, seat.id);
  });
})();
