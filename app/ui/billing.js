// feat/auth3-pay (docs/PREMIUM.md › Payments): billing in Settings.
//  * Settings › Plan & AI › Billing and receipts: whose plan this is (yours or the tribe's), Manage billing (Stripe's
//    customer portal), what a credit buys (the size table), receipts and recent credit use (GET /api/premium/history).
//  * Settings › Tribe & admin › Payments (the host, on the host computer): the Stripe keys and price ids, the webhook
//    address and its events. Keys are write-only: the server never sends one back.
// Public: window.TribeBilling = { render(el), admin(el) }.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => window.TribeClient, P = () => window.TribePremium;
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const on = () => !!(C() && C().connected && C().connected());
  const n = x => Number(x).toLocaleString('en-US');
  const day = t => { try { return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };
  const money = (cents, cur) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: String(cur || 'usd').toUpperCase() }).format((cents || 0) / 100); } catch { return '$' + ((cents || 0) / 100).toFixed(2); } };
  const KIND = { plan: 'Plan', credits: 'Credits', invoice: 'Payment', refund: 'Refund', failed: 'Not paid', canceled: 'Ended' };
  const WHY = { ai: 'An AI answer', bought: 'Credit pack', refund: 'Refund', grant: 'Added by the host', trial: 'Trial started', 'ai failed': 'Given back: the AI did not answer', 'ai: smaller than held': 'Given back: a smaller answer' };

  async function render(el) {
    const sec = el.closest('.set-sec'), hide = () => { el.innerHTML = ''; if (sec) sec.hidden = true; };
    if (!on()) return hide();
    let v, h;
    try { v = await C().api('/premium'); if (!(v.payments && v.payments.offered)) return hide();   // payments aren't open here yet: no billing section at all
      h = await C().api('/premium/history'); } catch (e) { el.innerHTML = `<p class="set-note bl-note">${esc(e.message)}</p>`; return; }
    if (!el.isConnected) return;
    const bill = v.billing || {}, name = v.plan === 'premium' ? (v.tier === 'hosted' ? 'Premium Hosted' : v.tier === 'tribe' ? 'Premium Tribe' : 'Premium') : v.plan === 'trial' ? 'Premium trial' : 'Free';
    const state = bill.graceUntil ? `The last payment didn't go through. The plan stays on until ${esc(day(bill.graceUntil))}; update the card in Manage billing.` : bill.cancelAt ? `Ends on ${esc(day(bill.cancelAt))}.` : v.plan === 'trial' && v.until ? `Until ${esc(day(v.until))}. No card, nothing to cancel.` : bill.periodEnd && v.plan === 'premium' ? `Renews on ${esc(day(bill.periodEnd))}.` : v.plan === 'free' ? 'Everything local stays free.' : '';
    const rc = h.receipts || [], use = (h.usage || []).filter(u => u.n);
    const table = (v.gated && v.gated.aiCostTable) || [];
    el.innerHTML = `<div class="set-row" id="set-billing" data-keys="billing invoices receipts card stripe subscription cancel manage">
        <div class="set-l"><b>${esc(name)} <span class="oa-st ${v.plan === 'free' ? '' : 'on'}">${v.scope === 'account' ? 'Your account' : 'This tribe'}</span></b><small id="bl-state">${state} ${v.scope === 'account' ? 'Your plan and credits follow your account.' : 'People without an account share the tribe\'s plan and credits.'}${v.payments && v.payments.on ? '' : ' <span id="bl-nopay">The host hasn\'t turned on payments here yet.</span>'}</small></div>
        <div class="set-c">${bill.manage ? '<button class="btn" id="bl-manage">Manage billing</button>' : ''}<button class="btn" id="bl-plans" data-plans data-fixed="1">See plans</button></div></div>
      <div class="set-row set-row-wide" id="set-credits" data-keys="credits cost price tokens size">
        <div class="set-l"><b>AI credits: ${n(v.credits)}</b><small>${v.pools ? `${n(v.pools.mine)} yours, ${n(v.pools.tribe)} in the tribe's pool. Yours are used first. ` : ''}Only answers from TribeCode's own AI use credits; your own AI never does. An answer costs by its size (what was sent plus what came back, about 4 characters a token):</small></div>
        <div class="set-c"><table class="bl-table" id="bl-cost"><thead><tr><th>Size of the answer</th><th>Credits</th></tr></thead><tbody>${table.map((r, i) => `<tr><td>${r.upToTokens ? `up to ${n(r.upToTokens)} tokens` : `more than ${n(table[i - 1] ? table[i - 1].upToTokens : 0)} tokens`}</td><td>${n(r.credits)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="set-row set-row-wide" id="set-receipts" data-keys="receipts invoices history payments">
        <div class="set-l"><b>Receipts</b><small>${rc.length ? 'Newest first. Stripe keeps the full invoices: Manage billing opens them.' : v.scope === 'tribe' && !(h.receipts) ? 'The host and admins see the tribe\'s receipts.' : 'Nothing bought here yet.'}</small></div>
        ${rc.length ? `<div class="set-c"><ul class="bl-list" id="bl-receipts">${rc.map(r => `<li><span class="bl-when">${esc(day(r.at))}</span><span class="bl-what"><b>${esc(r.label)}</b><small>${esc(KIND[r.kind] || r.kind)}${r.credits ? ` · ${r.credits > 0 ? '+' : ''}${n(r.credits)} credits` : ''}</small></span><span class="bl-amt">${r.kind === 'canceled' ? '' : esc((r.kind === 'refund' ? '−' : '') + money(r.amount, r.currency))}</span>${r.url ? `<a class="bl-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Receipt</a>` : '<span class="bl-link"></span>'}</li>`).join('')}</ul></div>` : ''}</div>
      ${use.length ? `<div class="set-row set-row-wide" id="set-usage" data-keys="usage credits spent"><div class="set-l"><b>Recent credit use</b><small>The last ${use.length} change${use.length === 1 ? '' : 's'} to the balance.</small></div>
        <div class="set-c"><ul class="bl-list bl-use" id="bl-usage">${use.slice(0, 12).map(u => `<li><span class="bl-when">${esc(day(u.at))}</span><span class="bl-what"><b>${esc(WHY[u.why] || u.why || 'Change')}</b></span><span class="bl-amt">${u.n > 0 ? '+' : ''}${n(u.n)}</span></li>`).join('')}</ul></div></div>` : ''}`;
    const m = el.querySelector('#bl-manage'); if (m) m.onclick = async () => { m.disabled = true; await P().manage(); m.disabled = false; };
  }

  const LABEL = { hosted: 'Premium Hosted (recurring, monthly)', tribe: 'Premium Tribe (recurring, monthly)', 'credits-10': '1,000 credits · $10 (one-time)', 'credits-25': '2,500 credits · $25 (one-time)', 'credits-50': '5,000 credits · $50 (one-time)' };
  async function admin(el) {
    const me = C() && (C().state() || {}).me, sec = el.closest('.set-sec');
    const desk = !!(window.__TAURI__ || window.__TAURI_INTERNALS__) || /tauri\.localhost$/i.test(location.hostname);
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || desk;
    if (!(on() && me && me.role === 'host' && local)) { if (sec) sec.hidden = true; return; }
    let d; try { d = await C().api('/premium/admin'); } catch { if (sec) sec.hidden = true; return; }
    if (!d.enabled) { el.innerHTML = ''; if (sec) sec.hidden = true; return; }   // hidden until the host opens payments (TRIBE_PAYMENTS=1, or PUT /api/premium/admin { enabled: true })
    if (!el.isConnected) return;
    const env = d.fromEnv;
    el.innerHTML = `<div class="set-row set-row-wide" id="set-payments" data-keys="stripe payments checkout billing webhook price keys">
      <div class="set-l"><b>Stripe <span class="oa-st ${d.on ? 'on' : ''}" id="bl-pay-state">${d.on ? (d.mode === 'live' ? 'On' : 'On · test mode') : 'Off'}</span></b><small>${d.on ? 'The plans pop-out sells the plans and credit packs that have a price id below.' : 'Off: the plans pop-out says payments aren\'t on, and you can still set plans and credits by hand on this computer.'} Keys are kept sealed on this computer and never shown again.${env ? ' The secret key comes from the environment (STRIPE_SECRET_KEY).' : ''}</small></div>
      <form class="bl-form" id="bl-pay-form" autocomplete="off">
        <label class="bl-f">Secret key<input class="input" type="password" data-k="secretKey" autocomplete="new-password" spellcheck="false" placeholder="${d.hasSecret ? 'Saved. Type to replace it' : 'sk_live_…'}" ${env ? 'disabled' : ''}></label>
        <label class="bl-f">Webhook signing secret<input class="input" type="password" data-k="webhookSecret" autocomplete="new-password" spellcheck="false" placeholder="${d.hasWebhook ? 'Saved. Type to replace it' : 'whsec_…'}" ${d.webhookFromEnv ? 'disabled' : ''}></label>
        ${Object.entries(d.prices).map(([k, p]) => `<label class="bl-f">${esc(LABEL[k] || p.label)}<input class="input" data-p="${esc(k)}" value="${esc(p.id)}" spellcheck="false" placeholder="price_…" ${p.fromEnv ? 'disabled' : ''}></label>`).join('')}
        <div class="bl-hook"><span class="bl-f">Webhook address (add it in Stripe › Developers › Webhooks)</span><span class="set-url"><code id="bl-hook-url">${esc(d.webhookUrl || '')}</code><button class="btn sm" type="button" id="bl-hook-copy">Copy</button></span>
          <small>Events: ${d.events.map(esc).join(', ')}. Stripe must be able to reach this address, so it needs your public https address.</small></div>
        <p class="a3-err" id="bl-pay-err" role="alert"></p>
        <div class="bl-row"><button class="btn primary" type="submit" id="bl-pay-save">Save payments</button>${d.saved && !env ? '<button class="btn" type="button" id="bl-pay-off">Turn off</button>' : ''}</div>
      </form></div>`;
    const f = el.querySelector('#bl-pay-form'), err = el.querySelector('#bl-pay-err');
    el.querySelector('#bl-hook-copy').onclick = async e => { try { await navigator.clipboard.writeText(d.webhookUrl || ''); e.currentTarget.textContent = 'Copied'; } catch {} };
    const put = async body => { err.textContent = ''; try { await C().api('/premium/admin', { method: 'PUT', body }); toast('Payment settings saved'); if (P() && P().sync) P().sync(); admin(el); } catch (e) { err.textContent = e.message.replace(/^./, c => c.toUpperCase()); } };
    f.onsubmit = e => {
      e.preventDefault();
      const body = { prices: {} };
      f.querySelectorAll('[data-k]').forEach(i => { if (!i.disabled && i.value.trim()) body[i.dataset.k] = i.value.trim(); });
      f.querySelectorAll('[data-p]').forEach(i => { if (!i.disabled) body.prices[i.dataset.p] = i.value.trim(); });
      put(body);
    };
    const off = el.querySelector('#bl-pay-off'); if (off) off.onclick = () => put({ secretKey: '', webhookSecret: '' });
  }
  function boot() {
    const T = window.TribeSettings; if (!T || !T.addSection) return;
    try {
      T.addSection('ai', { id: 'billing', title: 'Billing and receipts', render: el => render(el) });
      T.addSection('admin', { id: 'payments', title: 'Payments', render: el => admin(el) });
    } catch {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.TribeBilling = { render, admin };
})();
