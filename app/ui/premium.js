// Premium, calm and honest (feat/work-company, docs/PREMIUM.md). TribeCode is free and open source; Premium is for
// what costs real money to run (a hosted relay and cloud, AI credits on our account) plus a few extras (bigger teams,
// premium templates, priority builds). It never blocks a core local feature.
//   TribePremium.gate(feature, ctx) -> Promise<boolean>   true = go ahead
//     soft gates  'projects' (the 4th project and up), 'seats' (more than 5 company seats): a sheet once, then
//                 "Not now" continues and the sheet stays quiet for a week. Local work is never stopped.
//     extras      'template' (a premium template), 'cloud' (hosted relay/cloud), 'credits' (hosted AI credits):
//                 "Not now" just closes; nothing local depends on them.
//   TribePremium.plan()  { plan: 'free' | 'trial' | 'premium', until? }   a LOCAL state: no payments exist yet.
//   TribePremium.checkout(plan)  the Stripe / Paddle hook: a stub (see the TODO) that says so.
//   TribePremium.open()  the plan sheet;  footHtml()  a one-line "Free plan · What's Premium?" for views.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => window.TribeApp && window.TribeApp.toast && window.TribeApp.toast(m);
  const LS = 'tribecode.plan.v1', SNOOZE = 7 * 86400000, TRIAL = 14 * 86400000;
  const LIMITS = { projects: 3, seats: 5 };
  const DOCS = 'https://github.com/orionopenwow/TribeCode/blob/main/docs/PREMIUM.md';
  const FREE = ['Every local feature, forever: projects, chat, docs, tasks, Work, templates, rituals', 'Open source (MIT): read it, fork it, self-host it', 'Your own AI: your Claude Code, any API key, or a local model through Ollama', 'Your own hosting: this computer, your GitHub, a free cloud server, Tailscale or Cloudflare tunnels'];
  const ADDS = ['A hosted relay and cloud, so the tribe stays online without your computer', 'AI credits on our account, for friends who have no AI of their own', 'Bigger teams: more company seats and members, with roles', 'Premium templates (board pack, fundraising data room) and priority builds'];
  // The planned prices, word for word from the pricing page (site/pricing.html). Nothing is for sale yet: every paid row is
  // "Planned", and checkout() says so. Change them there first, then here.
  const PRICING = 'https://orionopenwow.github.io/TribeCode/about/pricing.html';
  const PRICES = {
    free: { name: 'Free', price: '$0', per: 'forever', status: 'Available now' },
    plans: [
      { id: 'hosted', name: 'Hosted', price: 'Price soon', per: '', status: 'Planned', adds: 'Always on: we host your tribe. Stays up when your laptop sleeps, a stable link, nightly backups.' },
      { id: 'tribe', name: 'Tribe', price: 'Price soon', per: '', status: 'Planned', adds: 'Everything in Hosted, and AI included for up to 8 people, keys or not, with a shared credit pool that refills weekly. 14-day free trial at launch, no card.' },
    ],
    credit: { cents: 1, line: 'Credits pay for AI we run for you', packs: [{ id: 's', credits: 1000 }, { id: 'm', credits: 2500 }, { id: 'l', credits: 5000 }], terms: 'Shared by the tribe, good for 12 months, with a spending cap.' },
  };
  const FEATURES = {
    projects: { soft: true, eyebrow: 'Project 4', title: 'Lots going on. Nice.', body: 'Projects stay free and unlimited on your own devices. Premium keeps every one of them online in our cloud, so friends can join any time.', links: [['Keep it online yourself: Tailscale Funnel', 'https://tailscale.com/kb/1223/funnel'], ['Or a free Render server', 'https://render.com/docs/free']] },
    seats: { soft: true, eyebrow: 'A bigger team', title: 'Your company is growing', body: 'Seats keep working on the free plan. Premium adds roles for larger teams and AI credits so seats without their own AI can still help.', links: [['Run a local model for free: Ollama', 'https://ollama.com']] },
    template: { soft: false, eyebrow: 'Premium template', title: 'This one is a Premium template', body: 'Every everyday template (standup, OKRs, briefs, launch, hiring, postmortems) is free. A few deeper packs come with Premium.', links: [['Free, open company handbooks: the GitLab Handbook (CC BY-SA)', 'https://handbook.gitlab.com/'], ['Basecamp\'s Shape Up (free book)', 'https://basecamp.com/shapeup']] },
    cloud: { soft: false, eyebrow: 'Hosted relay', title: 'Online without your computer', body: 'Premium runs the relay and storage for you. You can always host it yourself for free.', links: [['Cloudflare Tunnel', 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/'], ['Tailscale Funnel', 'https://tailscale.com/kb/1223/funnel']] },
    credits: { soft: false, eyebrow: 'AI credits', title: 'AI for friends without their own', body: 'Bring your own AI for free, always. Premium adds credits on our account for members who have none.', links: [['Ollama: free local models', 'https://ollama.com'], ['OpenRouter: many models, one key', 'https://openrouter.ai']] },
    overview: { soft: true, eyebrow: 'Your plan', title: 'Free, open source, yours', body: 'TribeCode is free and open source, and everything local stays that way. Premium pays for what costs us money to run.', links: [['TribeCode on GitHub (MIT)', 'https://github.com/orionopenwow/TribeCode']] },
  };

  const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
  const write = x => { try { localStorage.setItem(LS, JSON.stringify(x)); } catch {} };
  function plan() {
    const x = read();
    if (x.plan === 'trial' && x.until && Date.now() > Date.parse(x.until)) { x.plan = 'free'; delete x.until; write(x); }
    return { plan: x.plan || 'free', until: x.until || null };
  }
  const active = () => plan().plan !== 'free';
  let setPlan = function (p) { const x = read(); x.plan = p; if (p === 'trial') x.until = new Date(Date.now() + TRIAL).toISOString(); else delete x.until; write(x); window.dispatchEvent(new CustomEvent('tribe-plan', { detail: plan() })); return plan(); }

  // The payments hook. TODO(payments): wire Stripe Checkout (or Paddle Billing) here: create a checkout session on the
  // hosted service, open it, and on return verify the subscription server-side before setPlan('premium'). Until then
  // there is nothing to buy, and this says so.
  const PROVIDER = null;   // 'stripe' | 'paddle'
  async function checkout(p = 'premium') {
    if (!PROVIDER) { toast('Payments aren\'t live yet. Try Premium free meanwhile.'); return { ok: false, reason: 'no-provider', plan: p }; }
    return { ok: false, reason: 'todo' };
  }

  function overThreshold(feature, ctx = {}) {
    if (feature === 'projects') return (ctx.count || 0) > LIMITS.projects;
    if (feature === 'seats') return (ctx.count || 0) > LIMITS.seats;
    return true;
  }
  const snoozed = f => { const x = read(); return x.snooze && x.snooze[f] && Date.now() - x.snooze[f] < SNOOZE; };
  const snooze = f => { const x = read(); x.snooze = { ...(x.snooze || {}), [f]: Date.now() }; write(x); };

  let cur = null;
  function close(val) { if (!cur) return; const c = cur; cur = null; c.el.remove(); c.scrim.remove(); c.resolve(val); }
  function sheet(feature, ctx = {}) {
    const f = FEATURES[feature] || FEATURES.overview, p = plan();
    return new Promise(resolve => {
      if (cur) close(cur.soft);
      const scrim = document.createElement('div'); scrim.className = 'pm-scrim';
      const el = document.createElement('div'); el.className = 'pm-sheet'; el.id = 'pm-sheet'; el.dataset.feature = feature; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', f.title);
      el.innerHTML = `<header class="pm-h"><div><span class="eyebrow">${esc(f.eyebrow)}</span><h2>${esc(ctx.title && feature === 'template' ? ctx.title : f.title)}</h2></div><button class="fwin-btn" data-pm-x aria-label="Close">×</button></header>
        <p class="pm-lead">${esc(f.body)}</p>
        <div class="pm-cols"><section><span class="eyebrow">Free forever</span><ul>${FREE.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
          <section class="pm-plus"><span class="eyebrow">Premium adds</span><ul>${ADDS.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section></div>
        ${f.links.length ? `<div class="pm-links"><span class="eyebrow">Do it yourself, free</span>${f.links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>`).join('')}</div>` : ''}
        <p class="pm-plan" id="pm-plan">${p.plan === 'free' ? 'You\'re on the free plan.' : p.plan === 'trial' ? `Premium trial until ${esc(new Date(p.until).toLocaleDateString())}.` : 'You have Premium. Thank you.'} <a href="${DOCS}" target="_blank" rel="noopener noreferrer">How Premium works ↗</a></p>
        <footer class="pm-f"><button class="btn ghost" data-pm-notnow>Not now</button><span class="pm-sp"></span>${p.plan === 'free' ? '<button class="btn primary" data-pm-try>Try Premium free for 14 days</button>' : '<button class="btn primary" data-pm-ok>Continue</button>'}</footer>`;
      document.body.append(scrim, el);
      cur = { el, scrim, resolve, soft: !!f.soft };
      const notNow = () => { if (f.soft) snooze(feature); close(!!f.soft); };
      scrim.onclick = notNow;
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-pm-x') || b.hasAttribute('data-pm-notnow')) return notNow();
        if (b.hasAttribute('data-pm-ok')) return close(true);
        if (b.hasAttribute('data-pm-try')) { setPlan('trial'); toast('Premium trial on, for 14 days. No card, nothing to cancel.'); return close(true); }
      });
      el.querySelector('[data-pm-notnow]').focus({ preventScroll: true });
    });
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && cur) { e.stopPropagation(); const f = cur.el.dataset.feature; if (cur.soft) snooze(f); close(cur.soft); } }, true);

  async function gate(feature, ctx = {}) {
    if (active()) return true;
    if (!overThreshold(feature, ctx)) return true;
    const f = FEATURES[feature]; if (!f) return true;
    if (f.soft && snoozed(feature)) return true;
    return sheet(feature, ctx);
  }
  const footHtml = () => `<p class="pm-foot" id="pm-foot">${active() ? 'Premium' : 'Free plan'} · local, open source, your own AI. <button class="linkish" data-pm-open type="button">What does Premium add?</button></p>`;
  document.addEventListener('click', e => { if (e.target.closest('[data-pm-open]')) sheet('overview'); });

  // AI credits on this device (feat/shell-polish). There is no credit store yet, so this is honest: 0 until payments open.
  const credits = () => { const n = Number(read().credits); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  // harden: the server keeps the tribe's plan and credits (server/premium.js); this mirrors it. The trial starts there, once
  // per tribe, and a 402 from any route opens the plans pop-out.
  const Cn = () => window.TribeClient;
  async function sync() {
    const c = Cn(); if (!c || !c.api || !c.connected || !c.connected()) return;
    try { const v = await c.api('/premium'); const x = read(); x.plan = v.plan; if (v.until) x.until = v.until; else delete x.until; x.credits = v.credits; write(x); window.dispatchEvent(new CustomEvent('tribe-plan', { detail: plan() })); } catch {}
  }
  const setLocal = setPlan;
  setPlan = function (p) {
    const c = Cn();
    if (p === 'trial' && c && c.connected && c.connected()) c.api('/premium/trial', { method: 'POST', body: {} }).then(sync, e => { toast(e.message); sync(); });
    return setLocal(p);
  };
  addEventListener('tribe-402', e => { const d = (e && e.detail) || {}; if (window.TribePlans && window.TribePlans.open) window.TribePlans.open(null); else sheet(d.need === 'credits' ? 'credits' : d.feature === 'template' ? 'template' : 'overview'); });
  setTimeout(sync, 1500); addEventListener('focus', () => sync());
  window.TribePremium = { gate, plan, setPlan, checkout, credits, open: () => sheet('overview'), footHtml, LIMITS, FEATURES: Object.keys(FEATURES), FREE, ADDS, PRICES, PRICING, DOCS };
})();
