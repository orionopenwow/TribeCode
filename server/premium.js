// Premium and AI credits, checked on the server (harden, docs/REVIEW-2026-11-12.md, docs/PREMIUM.md). The browser's
// plan (app/ui/premium.js) is only a mirror of this: clearing site storage no longer resets a trial, and a gated feature
// is refused here, with a calm 402 that the app turns into the plans pop-out.
//
// What is gated (everything else, and everything local, stays free):
//   plan     premium templates saved to Files (POST /api/docs with source template:<premium id>)
//   credits  AI answered by the hosted "TribeCode credits" provider (server/llm.js 'hosted'), priced by size (COST_TABLE
//            below): the most an answer can cost is held before the call, what it didn't use comes back after, and all
//            of it when the call fails without an answer. Your own AI never spends credits.
//
// Whose plan (feat/auth3-pay): a person with a real account (a password, a provider, a verified email or a passkey) has
// their own plan, trial, credits and receipts; everyone else shares the tribe's, as before. A feature is open when
// either one is active, and credits are taken from your own first, then from the tribe's pool.
//
// State: .tribe/premium.json { …the tribe's scope…, accounts: { <account id>: scope }, events: [last 2000 webhook ids],
//   customers: { <Stripe customer>: scope key }, install }.  scope = { plan: 'free'|'trial'|'premium', tier, until,
//   trialUsed, credits, ledger: [last 200], billing: { customer, subscription, status, graceUntil, cancelAt, periodEnd },
//   receipts: [last 100] }.
// Every change is a synchronous read-check-write in one tick (Node runs one at a time), so concurrent requests can't
// spend the same credit twice, a webhook delivered twice is applied once, and the balance never goes below zero.
//
//   GET  /api/premium                 { plan, tier, until, credits, trialUsed, scope, billing, payments, gated }
//   POST /api/premium/trial           one 14-day trial per scope (people, not agents, guests or spectators)
//   PUT  /api/premium                 host, on the host computer: { plan?, until?, tier?, addCredits?, account? }
//   POST /api/premium/checkout        { item: hosted|tribe|credits-10|credits-25|credits-50 } -> { url }  (Stripe Checkout)
//   POST /api/premium/portal          -> { url }   Stripe's customer portal ("Manage billing")
//   GET  /api/premium/history         { receipts, usage, billing }
//   GET/PUT /api/premium/admin        host, on the host computer: the Stripe settings (never a secret back)
//   POST /api/premium/webhook         Stripe's signed events. No sign-in: the signature is the proof. Raw body, 5 minutes
//                                     of tolerance, each event id once. It changes plans and credits through change(),
//                                     the same path PUT uses.
// Payment failed: the plan stays for a grace period (7 days), then goes back to free unless a payment arrives.
// A refunded credit pack takes its credits back, never below zero.
'use strict';
const crypto = require('node:crypto');

const TRIAL_MS = 14 * 86400_000;
const TEST = process.env.TRIBE_TEST === '1';
const GRACE_MS = TEST && Number(process.env.TRIBE_TEST_GRACE_MS) > 0 ? Number(process.env.TRIBE_TEST_GRACE_MS) : 7 * 86400_000;
const PREMIUM_TEMPLATES = new Set(['board-meeting', 'fundraise']);   // app/ui/doctpl-data.js premium: true
const AI_COST = 1;   // the smallest answer
// Credits per hosted answer, by size. Size is in tokens, counted simply as characters / 4: what was sent (the
// instructions and the conversation) plus what came back. 1 credit is $0.01 of AI (site/pricing.html).
const COST_TABLE = [{ upTo: 2000, credits: 1 }, { upTo: 8000, credits: 3 }, { upTo: 32000, credits: 10 }, { upTo: Infinity, credits: 25 }];
const tokensOf = chars => Math.ceil(Math.max(0, Number(chars) || 0) / 4);
const costOf = tokens => COST_TABLE.find(r => tokens <= r.upTo).credits;
const SCOPE_RE = /^(tribe|acct:acct-[\w-]{4,40})$/;
const stripeUrl = u => (typeof u === 'string' && /^https:\/\/[a-z0-9.-]+\.stripe\.com\//.test(u) ? u.slice(0, 500) : null);

module.exports = function makePremium({ store, isLocal, log = () => {}, accountFor = () => null, stripe = null, origin = () => '', webhookBase = () => '' }) {
  const FILE = '.tribe/premium.json';
  const now = () => new Date().toISOString();
  const norm = d => ({ plan: ['trial', 'premium'].includes(d.plan) ? d.plan : 'free', tier: typeof d.tier === 'string' ? d.tier : null, until: d.until || null, trialUsed: !!d.trialUsed, credits: Math.max(0, Math.floor(Number(d.credits) || 0)),
    ledger: Array.isArray(d.ledger) ? d.ledger : [], billing: d.billing && typeof d.billing === 'object' ? d.billing : null, receipts: Array.isArray(d.receipts) ? d.receipts : [] });
  // a plan past its end, or past the grace after a failed payment, is free again
  function settle(s) {
    let changed = false;
    if (s.plan !== 'free' && s.until && Date.parse(s.until) < Date.now()) { s.plan = 'free'; s.tier = null; s.until = null; changed = true; }
    if (s.billing && s.billing.graceUntil && Date.parse(s.billing.graceUntil) < Date.now()) {
      if (s.plan !== 'free') { s.plan = 'free'; s.tier = null; s.until = null; s.ledger.push({ at: now(), by: null, n: 0, why: 'payment failed: back to free' }); }
      s.billing = { ...s.billing, graceUntil: null, status: 'lapsed' }; changed = true;
    }
    return changed;
  }
  function load() {
    const d = store.readJSON(FILE, null) || {};
    const all = { tribe: norm(d), accounts: {}, events: Array.isArray(d.events) ? d.events : [], customers: d.customers && typeof d.customers === 'object' ? d.customers : {}, install: typeof d.install === 'string' ? d.install : '' };
    for (const [k, v] of Object.entries(d.accounts && typeof d.accounts === 'object' ? d.accounts : {})) if (v && typeof v === 'object') all.accounts[k] = norm(v);
    let changed = settle(all.tribe); for (const s of Object.values(all.accounts)) changed = settle(s) || changed;
    if (changed) write(all);
    return all;
  }
  const trim = s => ({ ...s, ledger: s.ledger.slice(-200), receipts: s.receipts.slice(-100) });
  function write(all) { store.writeJSON(FILE, { ...trim(all.tribe), accounts: Object.fromEntries(Object.entries(all.accounts).map(([k, v]) => [k, trim(v)])), events: all.events.slice(-2000), customers: all.customers, install: all.install }); }
  const get = (all, key) => (key === 'tribe' ? all.tribe : all.accounts[key.slice(5)] || (all.accounts[key.slice(5)] = norm({})));
  // whose plan a request is about: the member's own account when they have a real one (an agent: its owner's), else the tribe's
  function keyFor(me) { if (!me) return 'tribe'; const aid = accountFor(me.role === 'agent' ? me.owner : me.id); return aid ? 'acct:' + aid : 'tribe'; }

  const active = me => { const all = load(); return all.tribe.plan !== 'free' || get(all, keyFor(me)).plan !== 'free'; };
  const pubBilling = s => (s.billing ? { status: s.billing.status || null, graceUntil: s.billing.graceUntil || null, cancelAt: s.billing.cancelAt || null, periodEnd: s.billing.periodEnd || null, manage: !!s.billing.customer } : null);
  function view(me) {
    const all = load(), key = keyFor(me), mine = get(all, key), eff = mine.plan !== 'free' || key === 'tribe' ? mine : all.tribe;
    return { plan: eff.plan, tier: eff.tier, until: eff.until, credits: key === 'tribe' ? mine.credits : mine.credits + all.tribe.credits, trialUsed: mine.trialUsed, scope: key === 'tribe' ? 'tribe' : 'account',
      ...(key === 'tribe' ? {} : { pools: { mine: mine.credits, tribe: all.tribe.credits } }), billing: pubBilling(mine),
      payments: { on: !!(stripe && stripe.on()), items: stripe ? Object.keys(stripe.ITEMS).filter(i => stripe.price(i)) : [] },
      gated: { templates: [...PREMIUM_TEMPLATES], aiCost: AI_COST, aiCostTable: COST_TABLE.map(r => ({ upToTokens: Number.isFinite(r.upTo) ? r.upTo : null, credits: r.credits })) } };
  }

  // Take n credits, or nothing: from your own, else from the tribe's pool. -> { scope, n } (what was held, for refund) or false.
  function reserve(me, n = AI_COST, why = 'ai') {
    const all = load(), key = keyFor(me); n = Math.max(1, Math.floor(n));
    for (const k of key === 'tribe' ? ['tribe'] : [key, 'tribe']) {
      const s = get(all, k); if (s.credits < n) continue;
      s.credits -= n; s.ledger.push({ at: now(), by: me ? me.id : null, n: -n, why });
      write(all); return { scope: k, n };
    }
    return false;
  }
  function refund(me, n = AI_COST, why = 'refund', hold = null) {
    n = Math.floor(n); if (n < 1) return;
    const all = load(), s = get(all, hold && SCOPE_RE.test(hold.scope) ? hold.scope : keyFor(me));
    s.credits += n; s.ledger.push({ at: now(), by: me ? me.id : null, n, why }); write(all);
  }
  const credits = me => view(me).credits;

  // The one path every plan or credit change takes (PUT /api/premium, and the payments webhook).
  function change(all, key, ch, by = null) {
    const s = get(all, key);
    if (ch.plan !== undefined) {
      s.plan = ch.plan;
      s.until = ch.plan === 'free' ? null : ch.until && Date.parse(ch.until) ? new Date(Date.parse(ch.until)).toISOString() : ch.plan === 'trial' ? new Date(Date.now() + TRIAL_MS).toISOString() : null;
      s.tier = ch.plan === 'premium' ? ch.tier || s.tier || null : null;
      s.ledger.push({ at: now(), by, n: 0, why: ch.why || 'plan: ' + ch.plan });
    }
    const add = Math.floor(Number(ch.addCredits) || 0);
    if (add) { const before = s.credits; s.credits = Math.max(0, s.credits + add); s.ledger.push({ at: now(), by, n: s.credits - before, why: ch.creditWhy || 'grant' }); }
    if (ch.billing) s.billing = { ...(s.billing || {}), ...ch.billing };
    if (ch.receipt) s.receipts.push({ id: 'rc-' + crypto.randomBytes(5).toString('hex'), at: now(), ...ch.receipt });
    return s;
  }

  // The calm answer for a gated feature. need: 'plan' | 'credits'
  const refuse = (send, res, need, feature, me) => send(res, 402, {
    error: need === 'credits' ? 'You are out of AI credits. Connect your own AI for free, or get credits.' : 'This one comes with Premium. Everything else stays free.',
    need, feature, plan: view(me).plan, credits: credits(me),
  });
  // POST /api/docs: a premium template's doc needs the plan
  function docBlocked(body, me) {
    const m = /^template:([\w-]{1,60})$/.exec(String((body && body.source) || ''));
    return !!(m && PREMIUM_TEMPLATES.has(m[1]) && !active(me));
  }

  // ---------- payments ----------
  const person = me => !(['agent', 'spectator'].includes(me.role) || me.guestUntil);
  const OFF = { error: "The host hasn't turned on payments yet.", code: 'payments-off' };
  function installId(all) { if (!all.install) { all.install = 'tc_' + crypto.randomBytes(9).toString('hex'); write(all); } return all.install; }
  // which scope an event is about: what we put in the metadata at checkout, else the customer we already know
  function scopeOf(all, obj) {
    const md = (obj && obj.metadata) || {};
    if (md.tribecode && md.tribecode !== all.install) return null;   // another TribeCode on the same Stripe account
    if (typeof md.scope === 'string' && SCOPE_RE.test(md.scope) && md.tribecode) return md.scope;
    const k = typeof obj.customer === 'string' ? all.customers[obj.customer] : null;
    return k && SCOPE_RE.test(k) ? k : null;
  }
  const money = (cents, cur) => ({ amount: Math.max(0, Math.floor(Number(cents) || 0)), currency: String(cur || 'usd').slice(0, 3).toLowerCase() });
  const TIER = { hosted: 'Premium Hosted', tribe: 'Premium Tribe' };
  // One Stripe event, already verified. Mutates `all`; returns a short word for the log. Unknown types are fine (ignored).
  function handle(all, ev) {
    const o = ev.data.object, key = scopeOf(all, o);
    const findReceipt = pred => { for (const [k, s] of [['tribe', all.tribe], ...Object.entries(all.accounts).map(([id, s]) => ['acct:' + id, s])]) { const r = s.receipts.find(pred); if (r) return { key: k, s, r }; } return null; };
    if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
      if (!key) return 'not ours';
      const item = String((o.metadata || {}).item || ''), it = stripe.ITEMS[item]; if (!it || it.mode !== o.mode) return 'unknown item';
      if (typeof o.customer === 'string') all.customers[o.customer] = key;
      if (findReceipt(r => r.session === o.id && r.kind !== 'failed')) return 'already applied';
      if (o.mode === 'subscription') {
        change(all, key, { plan: 'premium', tier: item, why: 'payments: ' + TIER[item], billing: { customer: o.customer || null, subscription: o.subscription || null, status: 'active', graceUntil: null, cancelAt: null },
          receipt: { kind: 'plan', label: TIER[item], session: o.id, ...money(o.amount_total, o.currency) } });
        return 'plan ' + item;
      }
      if (o.payment_status !== 'paid') return 'waiting for the payment';
      change(all, key, { addCredits: it.credits, creditWhy: 'bought', billing: { customer: o.customer || (get(all, key).billing || {}).customer || null },
        receipt: { kind: 'credits', label: it.label, credits: it.credits, removed: 0, session: o.id, pi: typeof o.payment_intent === 'string' ? o.payment_intent : null, ...money(o.amount_total, o.currency) } });
      return 'credits +' + it.credits;
    }
    if (ev.type === 'checkout.session.async_payment_failed') {
      if (!key) return 'not ours';
      change(all, key, { receipt: { kind: 'failed', label: 'Payment did not go through', session: o.id, ...money(o.amount_total, o.currency) } }); return 'payment failed';
    }
    if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
      if (!key) return 'not ours';
      const s = get(all, key), cur = s.billing || {};
      if (cur.subscription && o.id !== cur.subscription && ev.type === 'customer.subscription.deleted') return 'an older subscription';
      const pid = o.items && o.items.data && o.items.data[0] && o.items.data[0].price && o.items.data[0].price.id, tier = (pid && stripe.itemOfPrice(pid)) || (o.metadata || {}).item || s.tier;
      const periodEnd = Number(o.current_period_end) > 0 ? new Date(Number(o.current_period_end) * 1000).toISOString() : cur.periodEnd || null;
      const st = ev.type === 'customer.subscription.deleted' ? 'canceled' : String(o.status || '');
      if (st === 'active' || st === 'trialing') {
        change(all, key, { ...(s.plan !== 'premium' || s.tier !== tier ? { plan: 'premium', tier, why: 'payments: ' + (TIER[tier] || 'Premium') } : {}),
          billing: { customer: o.customer || cur.customer || null, subscription: o.id, status: st, graceUntil: null, periodEnd, cancelAt: o.cancel_at_period_end ? periodEnd : null } });
        return 'subscription ' + st;
      }
      if (st === 'past_due' || st === 'unpaid') { change(all, key, { billing: { subscription: o.id, status: st, graceUntil: cur.graceUntil || new Date(Date.now() + GRACE_MS).toISOString() } }); return 'grace'; }
      if (st === 'canceled' || st === 'incomplete_expired') {
        change(all, key, { ...(s.plan === 'premium' ? { plan: 'free', why: 'payments: the plan ended' } : {}), billing: { subscription: null, status: 'canceled', graceUntil: null, cancelAt: null, periodEnd: null },
          ...(s.plan === 'premium' ? { receipt: { kind: 'canceled', label: (TIER[s.tier] || 'Premium') + ' ended', amount: 0, currency: 'usd' } } : {}) });
        return 'canceled';
      }
      return 'subscription ' + st;
    }
    if (ev.type === 'invoice.payment_failed') {
      if (!key || !o.subscription) return 'not ours';
      const s = get(all, key), cur = s.billing || {};
      if (findReceipt(r => r.invoice === o.id && r.kind === 'failed')) return 'already applied';
      change(all, key, { billing: { status: 'past_due', graceUntil: cur.graceUntil || new Date(Date.now() + GRACE_MS).toISOString() }, receipt: { kind: 'failed', label: 'Payment did not go through', invoice: o.id, url: stripeUrl(o.hosted_invoice_url), ...money(o.amount_due, o.currency) } });
      return 'grace';
    }
    if (ev.type === 'invoice.paid' || ev.type === 'invoice.payment_succeeded') {
      if (!key || !o.subscription) return 'not ours';
      if (findReceipt(r => r.invoice === o.id && r.kind === 'invoice')) return 'already applied';
      const s = get(all, key);
      change(all, key, { billing: { status: 'active', graceUntil: null }, receipt: { kind: 'invoice', label: (TIER[s.tier] || 'Premium') + ' payment', invoice: o.id, url: stripeUrl(o.hosted_invoice_url), ...money(o.amount_paid, o.currency) } });
      return 'paid';
    }
    if (ev.type === 'charge.refunded') {
      const pi = typeof o.payment_intent === 'string' ? o.payment_intent : '', hit = pi ? findReceipt(r => r.kind === 'credits' && r.pi === pi) : null;
      if (!hit) return 'no pack for that charge';
      const total = Number(o.amount) || hit.r.amount || 0, back = Math.min(total, Number(o.amount_refunded) || 0);
      const owed = Math.max(0, Math.round(hit.r.credits * (total ? back / total : 1)) - (hit.r.removed || 0));   // a partial refund takes its share; a second one the rest
      const take = Math.min(owed, hit.s.credits);   // never below zero
      hit.r.removed = (hit.r.removed || 0) + owed;
      change(all, hit.key, { addCredits: -take, creditWhy: 'refund', receipt: { kind: 'refund', label: 'Refund: ' + hit.r.label, credits: -take, pi, url: stripeUrl(o.receipt_url), ...money(back, o.currency) } });
      return 'refund -' + take;
    }
    return 'ignored';
  }
  function readRaw(req, limit = 512 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
    });
  }
  async function webhook(req, res, { send, fail }) {
    if (req.method !== 'POST') return fail(res, 405, 'POST');
    if (!stripe || !stripe.webhookSecret()) return fail(res, 503, 'payments are off here');
    let ev; try { ev = stripe.verify(await readRaw(req), req.headers['stripe-signature']); } catch (e) { return fail(res, e.status || 400, e.status === 413 ? e.message : 'that webhook was not signed by Stripe for this TribeCode'); }
    // from here on one synchronous step: read, check the event id, apply, remember the id, write
    const all = load();
    if (all.events.includes(ev.id)) return send(res, 200, { ok: true, duplicate: true });
    let did; try { did = handle(all, ev); } catch (e) { log(`premium: webhook ${ev.type} failed: ${e.message}`); return fail(res, 500, 'could not apply that event'); }
    all.events.push(ev.id); write(all);
    if (did !== 'ignored') log(`premium: ${ev.type} -> ${did}`);
    return send(res, 200, { ok: true, did });
  }

  async function route(req, res, { m, b, me, readBody, send, fail }) {
    if (!me) return fail(res, 401, 'not a member of this tribe');
    if (m === 'GET' && !b) return send(res, 200, view(me));
    if (m === 'POST' && b === 'trial') {
      if (!person(me)) return fail(res, 403, 'ask someone in the tribe to start the trial');
      const all = load(), key = keyFor(me), d = get(all, key);
      if (d.plan === 'premium') return send(res, 200, view(me));
      if (d.trialUsed) return fail(res, 409, key === 'tribe' ? 'This tribe already had its free trial.' : 'You already had your free trial.');
      d.plan = 'trial'; d.until = new Date(Date.now() + TRIAL_MS).toISOString(); d.trialUsed = true; d.ledger.push({ at: now(), by: me.id, n: 0, why: 'trial' }); write(all);
      log(`premium: ${me.name} started the trial`);
      return send(res, 200, view(me));
    }
    if (m === 'PUT' && !b) {
      if (me.role !== 'host' || !isLocal(req)) return fail(res, 403, 'plans and credits change on the host computer (or from the payments webhook)');
      const body = await readBody(req) || {};
      if (body.plan !== undefined && !['free', 'trial', 'premium'].includes(body.plan)) return fail(res, 400, 'plan is free, trial or premium');
      const key = body.account ? 'acct:' + String(body.account) : 'tribe'; if (!SCOPE_RE.test(key)) return fail(res, 400, 'account is an account id (acct-…)');
      const all = load(); change(all, key, { plan: body.plan, until: body.until, tier: typeof body.tier === 'string' && TIER[body.tier] ? body.tier : undefined, addCredits: body.addCredits }, me.id); write(all);
      return send(res, 200, key === 'tribe' ? view(null) : { ...view(null), account: { id: String(body.account), plan: get(all, key).plan, credits: get(all, key).credits } });   // the scope that changed
    }
    if (m === 'GET' && b === 'history') {
      const all = load(), key = keyFor(me), s = get(all, key), lead = me.role === 'host' || me.role === 'admin';
      const rc = x => x.receipts.slice(-50).reverse().map(r => ({ id: r.id, at: r.at, kind: r.kind, label: r.label, amount: r.amount || 0, currency: r.currency || 'usd', ...(r.credits ? { credits: r.credits } : {}), ...(r.url ? { url: r.url } : {}) }));
      const use = x => x.ledger.slice(-30).reverse().map(l => ({ at: l.at, n: l.n, why: l.why, mine: !!(l.by && l.by === me.id) }));
      return send(res, 200, { scope: key === 'tribe' ? 'tribe' : 'account', receipts: key === 'tribe' && !lead ? [] : rc(s), usage: key === 'tribe' && !lead ? use(s).filter(l => l.mine) : use(s), billing: pubBilling(s),
        ...(key !== 'tribe' && lead ? { tribe: { receipts: rc(all.tribe), credits: all.tribe.credits, plan: all.tribe.plan } } : {}) });
    }
    if (b === 'admin') {
      if (me.role !== 'host' || !isLocal(req)) return fail(res, 403, 'payment settings change on the host computer');
      if (!stripe) return fail(res, 404, 'payments are not part of this server');
      if (m === 'GET') return send(res, 200, stripe.view(webhookBase(req)));
      if (m === 'PUT') { try { stripe.set(await readBody(req) || {}); } catch (e) { return fail(res, e.status || 400, e.message); } return send(res, 200, stripe.view(webhookBase(req))); }
      return fail(res, 405, 'GET or PUT');
    }
    if (m === 'POST' && (b === 'checkout' || b === 'portal')) {
      if (!person(me)) return fail(res, 403, 'ask someone in the tribe to do this');
      if (!stripe || !stripe.on()) return send(res, 409, OFF);
      const body = await readBody(req) || {}, all = load(), key = keyFor(me), s = get(all, key), base = String(origin(req) || '').replace(/\/+$/, '');
      try {
        if (b === 'portal') {
          const cus = s.billing && s.billing.customer; if (!cus) return send(res, 409, { error: 'There is nothing to manage yet: no plan or pack was bought here.', code: 'no-customer' });
          const r = await stripe.call('POST', '/v1/billing_portal/sessions', { customer: cus, return_url: base + '/?billing=portal' });
          if (!payUrl(r.url)) return fail(res, 502, 'the payment service did not answer: try again in a moment');
          return send(res, 200, { url: r.url });
        }
        const item = String(body.item || ''), it = stripe.ITEMS[item], price = it && stripe.price(item);
        if (!it) return fail(res, 400, 'item is hosted, tribe, credits-10, credits-25 or credits-50');
        if (!price) return send(res, 409, { error: "The host hasn't set that one up for sale yet.", code: 'no-price' });
        if (it.mode === 'subscription' && s.billing && s.billing.subscription && ['active', 'trialing', 'past_due'].includes(s.billing.status)) return send(res, 409, { error: 'You already have a plan here. Manage billing changes or cancels it.', code: 'has-plan' });
        const md = { tribecode: installId(all), scope: key, account: key === 'tribe' ? '' : key.slice(5), member: me.id, item, credits: String(it.credits || 0) };
        const cus = s.billing && s.billing.customer;
        const r = await stripe.call('POST', '/v1/checkout/sessions', { mode: it.mode, line_items: [{ price, quantity: 1 }], success_url: base + '/?billing=success', cancel_url: base + '/?billing=cancel',
          client_reference_id: key, metadata: md, ...(cus ? { customer: cus } : it.mode === 'payment' ? { customer_creation: 'always' } : {}),
          ...(it.mode === 'subscription' ? { subscription_data: { metadata: md } } : { payment_intent_data: { metadata: md } }) });
        if (!payUrl(r.url)) return fail(res, 502, 'the payment service did not answer: try again in a moment');
        log(`premium: ${me.name} opened checkout for ${item}`);
        return send(res, 200, { url: r.url, item, mode: it.mode });
      } catch (e) { return send(res, e.status || 502, { error: e.message, ...(e.code ? { code: e.code } : {}) }); }
    }
    return fail(res, 404, 'no such premium route');
  }
  // the page we send a browser to: Stripe's own, over https (a test's local fake when TRIBE_TEST=1)
  const payUrl = u => typeof u === 'string' && (/^https:\/\/[a-z0-9.-]+\.stripe\.com\//.test(u) || (stripe.isTest() && /^https?:\/\//.test(u)));
  return { route, webhook, view, active, reserve, refund, credits, refuse, docBlocked, AI_COST, PREMIUM_TEMPLATES, COST_TABLE, tokensOf, costOf };
};
module.exports.costOf = costOf; module.exports.tokensOf = tokensOf; module.exports.COST_TABLE = COST_TABLE;
