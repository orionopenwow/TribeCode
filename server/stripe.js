// Stripe, with no SDK (docs/PREMIUM.md › Payments): form-encoded calls over https, and the webhook's signature
// (HMAC-SHA256 over "<t>.<raw body>", compared in constant time, 5 minutes of tolerance).
//
// The host turns payments on with the environment or, on the host computer, Settings › Tribe & admin › Payments:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_HOSTED, STRIPE_PRICE_TRIBE                     recurring prices (the two plans)
//   STRIPE_PRICE_CREDITS_10, _CREDITS_25, _CREDITS_50           one-time prices (the credit packs)
// The environment wins. Settings are kept in .tribe/stripe.json (0600), the two secrets sealed (server/sealbox.js);
// neither is ever sent to a browser or written to a log. Prices people see still come from site/pricing data.
// TRIBE_STRIPE_BASE points the calls at a local fake, only when TRIBE_TEST=1.
'use strict';
const crypto = require('node:crypto');
const sealbox = require('./sealbox');

const FILE = '.tribe/stripe.json';
const ITEMS = {
  hosted: { env: 'STRIPE_PRICE_HOSTED', mode: 'subscription', label: 'Premium Hosted' },
  tribe: { env: 'STRIPE_PRICE_TRIBE', mode: 'subscription', label: 'Premium Tribe' },
  'credits-10': { env: 'STRIPE_PRICE_CREDITS_10', mode: 'payment', credits: 1000, label: '1,000 AI credits' },
  'credits-25': { env: 'STRIPE_PRICE_CREDITS_25', mode: 'payment', credits: 2500, label: '2,500 AI credits' },
  'credits-50': { env: 'STRIPE_PRICE_CREDITS_50', mode: 'payment', credits: 5000, label: '5,000 AI credits' },
};
const EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'customer.subscription.updated',
  'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'charge.refunded'];
const KEY_RE = /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,240}$/, WH_RE = /^whsec_[A-Za-z0-9+/=_-]{8,240}$/, PRICE_RE = /^price_[A-Za-z0-9]{4,120}$/;
const TOLERANCE_S = 300;

// { a: { b: 1 }, c: [{ d: 2 }] } -> a[b]=1&c[0][d]=2
function form(obj) {
  const out = new URLSearchParams();
  const walk = (k, v) => {
    if (v == null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${k}[${i}]`, x));
    else if (typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(k ? `${k}[${kk}]` : kk, vv);
    else out.append(k, String(v));
  };
  walk('', obj);
  return out.toString();
}

module.exports = function makeStripe({ store, log = () => {} }) {
  const box = sealbox(store);
  const file = () => store.readJSON(FILE, null) || {};
  const env = k => String(process.env[k] || '').trim();
  const secretKey = () => env('STRIPE_SECRET_KEY') || box.open(file().secretKey);
  const webhookSecret = () => env('STRIPE_WEBHOOK_SECRET') || box.open(file().webhookSecret);
  const price = item => (ITEMS[item] ? env(ITEMS[item].env) || String((file().prices || {})[item] || '') : '');
  const base = () => (process.env.TRIBE_TEST === '1' && env('TRIBE_STRIPE_BASE') ? env('TRIBE_STRIPE_BASE').replace(/\/+$/, '') : 'https://api.stripe.com');
  // Payments are HIDDEN until the host says they are ready: TRIBE_PAYMENTS=1, or { enabled: true } in the settings
  // (PUT /api/premium/admin on the host computer). Keys alone turn nothing on.
  const enabled = () => env('TRIBE_PAYMENTS') === '1' || file().enabled === true;
  const on = () => enabled() && !!secretKey();
  const itemOfPrice = pid => Object.keys(ITEMS).find(k => price(k) && price(k) === pid) || null;

  async function call(method, path, params) {
    const key = secretKey(); if (!key) throw Object.assign(new Error('payments are off here'), { status: 409, code: 'payments-off' });
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20_000);
    try {
      const res = await fetch(base() + path, { method, signal: ctl.signal, redirect: 'error', body: params ? form(params) : undefined,
        headers: { Authorization: 'Bearer ' + key, Accept: 'application/json', 'User-Agent': 'TribeCode', ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) } });
      const data = await res.json().catch(() => ({}));
      if (res.status >= 300) {
        const msg = String((data.error && (data.error.message || data.error.code)) || `HTTP ${res.status}`).replace(/(sk|rk|whsec)_[A-Za-z0-9_]+/g, '…').slice(0, 200);
        log(`stripe: ${method} ${path} failed: ${msg}`);
        throw Object.assign(new Error('the payment service did not accept that: try again in a moment'), { status: 502, code: 'stripe', detail: msg });
      }
      return data;
    } catch (e) {
      if (e.status) throw e;
      log(`stripe: ${method} ${path} did not answer (${e.name === 'AbortError' ? 'timeout' : e.message})`);
      throw Object.assign(new Error('the payment service did not answer: try again in a moment'), { status: 502, code: 'stripe' });
    } finally { clearTimeout(t); }
  }

  // The webhook: the raw body exactly as it arrived, and the Stripe-Signature header. Returns the event or throws.
  function verify(raw, header, nowMs = Date.now()) {
    const secret = webhookSecret(); if (!secret) throw Object.assign(new Error('payments are off here'), { status: 503 });
    const refuse = why => Object.assign(new Error(why), { status: 400 });
    if (!Buffer.isBuffer(raw) || !raw.length || typeof header !== 'string' || header.length > 2000) throw refuse('no signature');
    let t = '', sigs = [];
    for (const part of header.split(',')) { const i = part.indexOf('='); if (i < 0) continue; const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim(); if (k === 't') t = v; else if (k === 'v1') sigs.push(v); }
    if (!/^\d{1,12}$/.test(t) || !sigs.length) throw refuse('no signature');
    const want = crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest();
    let ok = false;
    for (const s of sigs.slice(0, 5)) { const got = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, 'hex') : Buffer.alloc(32); if (crypto.timingSafeEqual(got, want) && /^[0-9a-f]{64}$/i.test(s)) ok = true; }
    if (!ok) throw refuse('the signature does not match');
    if (Math.abs(nowMs / 1000 - Number(t)) > TOLERANCE_S) throw refuse('the signature is too old');
    let ev; try { ev = JSON.parse(raw.toString('utf8')); } catch { throw refuse('not JSON'); }
    if (!ev || typeof ev.id !== 'string' || !/^[\w-]{4,120}$/.test(ev.id) || typeof ev.type !== 'string' || !ev.data || typeof ev.data.object !== 'object' || !ev.data.object) throw refuse('not an event');
    return ev;
  }

  // What the host sees (never a secret)
  function view(webhookBase) {
    const f = file(), k = secretKey();
    return { enabled: enabled(), enabledFromEnv: env('TRIBE_PAYMENTS') === '1', on: on(), fromEnv: !!env('STRIPE_SECRET_KEY'), hasSecret: !!k, mode: k ? (/_live_/.test(k) ? 'live' : 'test') : null, hasWebhook: !!webhookSecret(), webhookFromEnv: !!env('STRIPE_WEBHOOK_SECRET'),
      prices: Object.fromEntries(Object.keys(ITEMS).map(i => [i, { id: price(i), fromEnv: !!env(ITEMS[i].env), label: ITEMS[i].label, mode: ITEMS[i].mode }])),
      webhookUrl: webhookBase ? webhookBase.replace(/\/+$/, '') + '/api/premium/webhook' : null, events: EVENTS, saved: !!(f.secretKey || f.webhookSecret || f.prices) };
  }
  function set(body) {
    const f = file(), bad = m => Object.assign(new Error(m), { status: 400 });
    if (body.enabled !== undefined) f.enabled = !!body.enabled;
    if (body.secretKey !== undefined) { const v = String(body.secretKey || '').trim(); if (!v) delete f.secretKey; else if (!KEY_RE.test(v)) throw bad('that does not look like a Stripe secret key (sk_live_… or sk_test_…)'); else f.secretKey = box.seal(v); }
    if (body.webhookSecret !== undefined) { const v = String(body.webhookSecret || '').trim(); if (!v) delete f.webhookSecret; else if (!WH_RE.test(v)) throw bad('that does not look like a webhook signing secret (whsec_…)'); else f.webhookSecret = box.seal(v); }
    if (body.prices && typeof body.prices === 'object') {
      f.prices = { ...(f.prices || {}) };
      for (const [k, v] of Object.entries(body.prices)) { if (!ITEMS[k]) continue; const x = String(v || '').trim(); if (!x) delete f.prices[k]; else if (!PRICE_RE.test(x)) throw bad(`the price for ${ITEMS[k].label} should look like price_…`); else f.prices[k] = x; }
    }
    box.writeJSON(FILE, f); log(`stripe: payment settings changed (${on() ? 'on' : enabled() ? 'shown, no key yet' : 'hidden'})`);
  }
  return { on, enabled, call, verify, view, set, price, itemOfPrice, webhookSecret: () => enabled() && !!webhookSecret(), isTest: () => base() !== 'https://api.stripe.com', ITEMS, EVENTS };
};
module.exports.form = form; module.exports.ITEMS = ITEMS;
