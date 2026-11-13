// The plan chip and its pop-out (feat/shell-polish). Every "FREE" / "Premium" / credits chip is a button: Flint's panes,
// the canvas Flint, the preview's Flint, the website designer, the AI-boost card and Settings › Plan. Clicking one opens
// a small pop-out with the plans and credits, all from TribePremium (premium.js, which copies site/pricing.html):
//   Free (what's included) · Premium (the planned prices and what each adds) · AI credit packs · Use my AI (free) ·
//   how many credits you have. Keyboard: Enter/Space opens, focus moves in and stays in, Esc closes and returns focus.
// On phones (≤ 520px) it is a bottom sheet.
//   window.TribePlans = { chip({ id, label }) -> html, open(anchor), close(), isOpen() }
// Chips other features draw (.fp-chip, .cvf-free, .pvf-free, .wdz-free) are upgraded here, so those files stay untouched.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = () => window.TribePremium;
  const ico = (n, s = 16) => (window.TribeIcons ? window.TribeIcons.svg(n, s) : '');
  const FOREIGN = '.fp-chip, .cvf-free, .pvf-free, .wdz-free';
  const label = () => { const p = P() ? P().plan().plan : 'free'; return p === 'premium' ? 'Premium' : p === 'trial' ? 'Trial' : 'Free'; };
  const n = x => Number(x).toLocaleString('en-US');

  function chip({ id = '', label: l } = {}) {
    return `<button type="button" class="plan-chip" data-plans aria-haspopup="dialog" aria-expanded="false"${id ? ` id="${esc(id)}"` : ''} title="See the plans and AI credits">${esc(l || label())}</button>`;
  }

  // ---------- the pop-out ----------
  let cur = null, note = '';
  const ITEM = { 1000: 'credits-10', 2500: 'credits-25', 5000: 'credits-50' };   // a pack's size -> the item the server sells (server/stripe.js ITEMS); no amounts live in the app
  function body() {
    const T = P(), pl = T.plan(), pr = T.PRICES, cr = T.credits(), sell = !!(T.offered && T.offered()), pay = sell && T.payments && T.payments(), bill = (sell && T.billing && T.billing()) || null;   // sell: the host has opened payments; until then the plans are information
    const grace = bill && bill.graceUntil ? `Your last payment didn't go through. Premium stays on until ${esc(new Date(bill.graceUntil).toLocaleDateString())}; update your card in Manage billing.` : bill && bill.cancelAt ? `Your plan ends on ${esc(new Date(bill.cancelAt).toLocaleDateString())}.` : '';
    const status = pl.plan === 'premium' ? 'You have Premium.' : pl.plan === 'trial' ? `Premium trial until ${esc(new Date(pl.until).toLocaleDateString())}.` : 'You\'re on the free plan.';
    return `<header class="plp-h"><div><span class="eyebrow">Plans &amp; credits</span><h2 id="plp-title">${esc(status)}</h2></div><button type="button" class="plp-x" data-plp-x aria-label="Close">${ico('x', 16)}</button></header>
      <p class="plp-bal" id="plp-bal">${ico('bolt', 16)}<span><b>${n(cr)}</b> AI credit${cr === 1 ? '' : 's'}</span><small>${esc(pr.credit.line)}</small></p>
      <section class="plp-card" data-plp="free"><div class="plp-top"><b>${esc(pr.free.name)}</b><span class="plp-price">${esc(pr.free.price)} <small>${esc(pr.free.per)}</small></span><span class="plp-tag is-on">${pl.plan === 'free' ? 'Your plan' : esc(pr.free.status)}</span></div>
        <ul>${T.FREE.map(x => `<li>${ico('check', 16)}<span>${esc(x)}</span></li>`).join('')}</ul></section>
      <section class="plp-card" data-plp="premium"><div class="plp-top"><b>Premium</b><span class="plp-tag${pl.plan === 'premium' ? ' is-on' : ''}">${pl.plan !== 'free' ? 'Yours' : pay ? 'Available' : 'Planned'}</span></div>
        <ul class="plp-tiers">${pr.plans.map(t => `<li><span class="plp-tn"><b>${esc(t.name)}</b><span class="plp-price">${esc(t.price)} <small>${esc(t.per)}</small></span>${pl.plan === 'premium' && pl.tier === t.id ? '<span class="plp-tag is-on">Your plan</span>' : sell ? `<button type="button" class="btn sm plp-buy" data-plp-plan="${esc(t.id)}">Choose ${esc(t.name)}</button>` : ''}</span><span class="plp-ta">${esc(t.adds)}</span></li>`).join('')}</ul>
        ${grace ? `<p class="plp-note plp-grace" id="plp-grace">${grace}</p>` : ''}</section>
      <section class="plp-card" data-plp="credits"><div class="plp-top"><b>AI credits</b><span class="plp-tag">${pay ? 'Available' : 'Planned'}</span></div>
        <div class="plp-packs" role="group" aria-label="Credit packs">${pr.credit.packs.map(k => sell && ITEM[k.credits] ? `<button type="button" class="plp-pack" data-plp-pack="${ITEM[k.credits]}"><b>${n(k.credits)}</b><small>credits</small></button>` : `<div class="plp-pack is-info"><b>${n(k.credits)}</b><small>credits</small></div>`).join('')}</div>
        <p class="plp-note">${esc(pr.credit.terms)}</p></section>
      ${sell ? '' : '<p class="plp-note plp-coming" id="plp-coming">Paid plans are coming. Everything free keeps working, and the trial needs no card.</p>'}
      <p class="plp-msg" id="plp-msg" role="status" ${note ? '' : 'hidden'}>${esc(note)}</p>
      <section class="plp-card plp-own" data-plp="own"><div class="plp-top"><b>Use my AI</b><span class="plp-tag is-free">Free</span></div>
        <p class="plp-note">Connect your own: Claude Code, an API key, Ollama or the built-in model. No credits needed, ever.</p>
        <button type="button" class="btn sm" data-plp-ai>${ico('plug', 16)}<span>Connect my AI</span></button></section>
      <footer class="plp-f"><a href="${esc(T.PRICING)}" target="_blank" rel="noopener noreferrer">Compare plans ${ico('external', 16)}</a><span class="plp-sp"></span>${bill && bill.manage ? '<button type="button" class="btn sm" data-plp-manage id="plp-manage">Manage billing</button>' : ''}${pl.plan === 'free' ? '<button type="button" class="btn sm primary" data-plp-try>Try Premium free for 14 days</button>' : ''}</footer>`;
  }
  const focusables = el => [...el.querySelectorAll('button, a[href]')].filter(x => !x.disabled && x.offsetParent !== null);
  function place(el, anchor) {
    if (matchMedia('(max-width: 520px)').matches || !anchor || !anchor.getBoundingClientRect) { el.classList.add('is-sheet'); return; }
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth, vh = innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    const below = r.bottom + 6 + h <= vh - 8, top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
    el.style.left = left + 'px'; el.style.top = Math.max(8, Math.min(top, vh - h - 8)) + 'px';
  }
  function open(anchor) {
    if (!P()) return;
    if (cur) { const same = cur.anchor === anchor; close(); if (same) return; }
    const scrim = document.createElement('div'); scrim.className = 'plp-scrim';
    const el = document.createElement('div'); el.className = 'plp'; el.id = 'plans-pop';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'plp-title');
    el.innerHTML = body();
    document.body.append(scrim, el);
    cur = { el, scrim, anchor };
    if (P().sync) P().sync();   // the newest plan, credits and whether the host sells here
    if (anchor && anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
    place(el, anchor);
    scrim.addEventListener('click', () => close());
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-plp-x')) return close();
      if (b.hasAttribute('data-plp-ai')) { close(); if (window.TribeBrain && window.TribeBrain.open) window.TribeBrain.open(); else if (window.TribeConnectAI && window.TribeConnectAI.open) window.TribeConnectAI.open(); return; }
      // feat/auth3-pay: the buttons are real. With payments off they say so, here and in a toast.
      const buy = b.hasAttribute('data-plp-pack') ? b.dataset.plpPack : b.hasAttribute('data-plp-plan') ? b.dataset.plpPlan : '';
      if (buy || b.hasAttribute('data-plp-manage')) {
        b.disabled = true;
        return (buy ? P().checkout(buy) : P().manage()).then(r => { b.disabled = false; say(r && !r.ok && r.message ? r.message : ''); }, () => { b.disabled = false; });
      }
      if (b.hasAttribute('data-plp-try')) { P().setPlan('trial'); const t = window.TribeApp && window.TribeApp.toast; if (t) t('Premium trial on, for 14 days. No card, nothing to cancel.'); return close(); }
    });
    el.addEventListener('keydown', e => {   // keep Tab inside
      if (e.key !== 'Tab') return;
      const f = focusables(el); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    const first = el.querySelector('[data-plp-x]'); if (first) first.focus({ preventScroll: true });
  }
  function say(t) { note = t || ''; const m = cur && cur.el.querySelector('#plp-msg'); if (m) { m.textContent = note; m.hidden = !note; } }
  function close() {
    if (!cur) return; const c = cur; cur = null; note = '';
    c.el.remove(); c.scrim.remove();
    if (c.anchor && c.anchor.setAttribute) { c.anchor.setAttribute('aria-expanded', 'false'); if (document.contains(c.anchor)) c.anchor.focus({ preventScroll: true }); }
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && cur) { e.stopPropagation(); e.preventDefault(); close(); } }, true);
  addEventListener('resize', () => { if (cur && !cur.el.classList.contains('is-sheet')) place(cur.el, cur.anchor); });
  window.addEventListener('tribe-plan', () => {
    document.querySelectorAll('.plan-chip[data-plans]').forEach(b => { if (!b.dataset.fixed) b.textContent = label(); });
    if (cur) { cur.el.innerHTML = body(); }
  });

  // ---------- every chip opens it ----------
  const SEL = '[data-plans], ' + FOREIGN;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest(SEL); if (!b) return; e.preventDefault(); e.stopPropagation(); open(b); }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = e.target.closest && e.target.closest(FOREIGN); if (!b || b.tagName === 'BUTTON') return;
    e.preventDefault(); open(b);
  });
  function upgrade(root) {
    const list = root.matches && root.matches(FOREIGN) ? [root] : root.querySelectorAll ? root.querySelectorAll(FOREIGN) : [];
    for (const b of list) {
      if (b._plp) continue; b._plp = 1;
      if (b.tagName !== 'BUTTON') { b.setAttribute('role', 'button'); b.tabIndex = 0; }
      b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); b.classList.add('plan-chip-up');
      if (!b.title) b.title = 'See the plans and AI credits';
    }
  }
  const boot = () => {
    upgrade(document);
    new MutationObserver(ms => { for (const m of ms) for (const x of m.addedNodes) if (x.nodeType === 1) upgrade(x); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();

  window.TribePlans = { chip, open, close, isOpen: () => !!cur };
})();
