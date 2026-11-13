# Premium

TribeCode is free and open source (MIT). That doesn't change. Premium exists to pay for the things that cost real money
to run for you, and for a few extras. It never takes a local feature away, and it never stands between you and your
own work.

## Free forever

- **Everything local.** Projects (as many as you like), chat, docs, files, tasks, the board, Work (gigs, matching,
  review, the time bank), Company mode, every everyday template, rituals, Flint, the design canvas.
- **Open source.** Read the code, fork it, run your own copy. Nothing is held back in a closed build.
- **Your own AI.** Your Claude Code, any API key you bring, or a free local model through
  [Ollama](https://ollama.com). TribeCode never resells anyone's AI subscription.
- **Your own hosting.** This computer, your GitHub repository, a free cloud server
  ([Render](https://render.com/docs/free)), [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) or a
  [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

## What Premium adds

| | Why it costs something |
| --- | --- |
| **Hosted relay and cloud**: the tribe stays online without anyone's computer | Servers, storage and bandwidth |
| **AI credits** on our account, for members with no AI of their own | Model usage is billed per token |
| **Bigger teams**: more company seats and members, with roles | Support and the hosted side scale with people |
| **Premium templates** (board meeting pack, fundraising data room) | Written and kept current by people |
| **Priority builds**: early installers and faster fixes for your reports | Build time and attention |

## Where the app mentions it

Premium shows up as a calm sheet, at a few moments only. **"Not now" is always there**, and it is the first button.

| Moment | Gate | "Not now" |
| --- | --- | --- |
| Creating the 4th project | `projects` (soft) | The project is created. The sheet stays quiet for a week. |
| Adding the 6th company seat | `seats` (soft) | The seat is added. Quiet for a week. |
| Opening a premium template | `template` | Closes. Every everyday template stays free. |
| Hosted relay / cloud | `cloud` | Closes. Self-hosting links are right there. |
| Hosted AI credits | `credits` | Closes. Bring your own AI, or use Ollama. |

Each sheet also links to the free, open-source way to do the same thing yourself.

The footer of Work says which plan you're on, with "What does Premium add?".

## How it works today

- The server keeps the plan (`server/premium.js`, `.tribe/premium.json`): `free`, `trial` (14 days, no card, nothing to
  cancel) or `premium` (tier `hosted` or `tribe`). The browser's copy (`tribecode.plan.v1`) is only a mirror.
- **Whose plan.** A person with a real account (a password, a provider, a verified email or a passkey) has their own
  plan, trial, credits and receipts. Everyone else shares the tribe's, as before. A feature is open when either one is
  active, and credits come out of your own first, then the tribe's pool.
- **By hand.** On the host computer, `PUT /api/premium { plan?, until?, tier?, addCredits?, account? }` sets a plan or
  credits (`account` is an account id; without it the tribe's). It works with or without Stripe.

## Payments (Stripe)

**Hidden by default**, even with Stripe keys set. Open it with `TRIBE_PAYMENTS=1`, or on the host computer with
`PUT /api/premium/admin { "enabled": true }` (there is no switch in the app while it is hidden). While hidden: the plans
pop-out shows the plans and packs as information with "Paid plans are coming" and no buy or Manage billing buttons;
Settings has no Billing and receipts or Payments section; `checkout`, `portal` and `history` answer `404 { code:
'payments-hidden' }` and the webhook 404. Plans, credits, the 402s, the trial and `PUT /api/premium` on the host
computer work the same, and Flint's out-of-credits line doesn't mention buying.

Opened but with no secret key, the buttons say "The host hasn't turned on payments yet" and nothing else changes.

**Set the keys** with the environment, or (once payments are open) on the host computer in Settings › Tribe & admin › Payments, or with `PUT /api/premium/admin` (kept in
`.tribe/stripe.json`, 0600, the two secrets sealed with `.tribe/secret.key`; never sent back to a browser):

| Setting | What it is |
| --- | --- |
| `STRIPE_SECRET_KEY` | the secret key (`sk_live_…`, or `sk_test_…` to try it) |
| `STRIPE_WEBHOOK_SECRET` | the webhook's signing secret (`whsec_…`) |
| `STRIPE_PRICE_HOSTED`, `STRIPE_PRICE_TRIBE` | recurring monthly prices for Premium Hosted and Premium Tribe |
| `STRIPE_PRICE_CREDITS_10`, `_25`, `_50` | one-time prices for the 1,000, 2,500 and 5,000 credit packs |

The app and the pricing page show no amounts ("Price soon"): the planned prices stay in the owner's private plan, not in
the repo. What people pay is whatever the Stripe prices say. An item with no price id isn't sold.

**In Stripe** (Dashboard, once):

1. Products: **Premium Hosted** and **Premium Tribe** (each a recurring monthly price), and three one-time prices for
   the **1,000**, **2,500** and **5,000** credit packs, at the amounts in your plan. Copy each `price_…` id.
2. Developers › Webhooks › Add endpoint: `https://<your public address>/api/premium/webhook`, with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`,
   `charge.refunded`. Copy the signing secret.
3. Settings › Billing › Customer portal: turn it on (update card, cancel, invoices) so **Manage billing** has somewhere to go.

**What happens**

| Route | What it does |
| --- | --- |
| `POST /api/premium/checkout { item }` | `hosted`, `tribe` (a subscription) or `credits-10`, `-25`, `-50` (one-time). Makes a Checkout Session with the scope (the tribe, or the buyer's account) and the item in its metadata, and answers `{ url }`. People only. `409 payments-off`, `409 no-price`, `409 has-plan`. |
| `POST /api/premium/webhook` | Stripe's events. No sign-in: the `Stripe-Signature` header is checked against the raw body (HMAC-SHA256, constant time, 5 minutes of tolerance). Each event id is applied once. It changes plans and credits through the same `change()` that `PUT /api/premium` uses. |
| `POST /api/premium/portal` | `{ url }` for Stripe's customer portal (**Manage billing**). |
| `GET /api/premium/history` | receipts and recent credit use (Settings › Plan & AI). The tribe's receipts are for the host and admins. |
| `GET/PUT /api/premium/admin` | the host's settings, on the host computer. |

- A paid Checkout upgrades the plan or adds the pack's credits. Coming back from Stripe (`/?billing=success`) only looks
  again: nothing is granted by the browser.
- **Subscription updated**: the tier follows the price; "cancel at period end" shows the end date and the plan stays on.
- **Canceled** (`customer.subscription.deleted`, which Stripe sends when the paid time is over): back to free.
- **Payment failed**: the plan stays for a 7-day grace, then goes back to free. A payment inside the grace keeps it.
- **Refund of a credit pack** (`charge.refunded`): its credits come back out, a partial refund its share, never below zero.
- Events from another TribeCode on the same Stripe account are ignored (the metadata carries this install's id).

## What a credit buys

Only answers from the hosted "TribeCode credits" AI use credits; your own AI never does. An
answer costs by its size: what was sent (the instructions and the conversation) plus what came back, counted as
characters divided by 4.

| Size of the answer | Credits |
| --- | --- |
| up to 2,000 tokens | 1 |
| up to 8,000 tokens | 3 |
| up to 32,000 tokens | 10 |
| more | 25 |

The most an answer can cost (what is sent plus its length limit) is held before the call; what it didn't use comes
back when the answer is in, and all of it when the call fails without an answer. The table is `COST_TABLE` in
`server/premium.js`, and `GET /api/premium` sends it (`gated.aiCostTable`). Flint says once per session when credits
have run out, opens the plans, and after that answers in basic mode quietly.

## For developers

```js
const go = await TribePremium.gate('projects', { count: 4 });   // true = go ahead (soft gates always resolve true)
TribePremium.plan();       // { plan: 'free' | 'trial' | 'premium', until, tier }
TribePremium.checkout('credits-10');   // opens Stripe Checkout, or says payments aren't on ({ ok: false, reason: 'no-provider' })
TribePremium.manage();     // Stripe's customer portal
TribePremium.open();       // the plan sheet
TribePremium.footHtml();   // "Free plan · … What does Premium add?"
```

Rules for a new gate:

1. Never gate something that runs locally and worked before. Soft gates inform; they don't stop.
2. Gate at the moment of value (the 4th project, a bigger team), not on first run.
3. "Not now" first, a week of quiet after it, and a free do-it-yourself link on the sheet.
4. Test it in `app/test/e2e_premium.py` (payments: `e2e_payments.py`, `security8_test.py`).
