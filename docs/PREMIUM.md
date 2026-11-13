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

- The plan is a **local state** (`localStorage`, `tribecode.plan.v1`): `free`, `trial` (14 days, no card, nothing to
  cancel) or `premium`.
- **There are no payments yet.** `TribePremium.checkout()` is the hook for Stripe Checkout or Paddle Billing and says
  so until it's wired (see the `TODO(payments)` in `app/ui/premium.js`). When it lands: create the checkout session on
  the hosted service, verify the subscription server-side, then set the plan. Until that backend exists, the site's pricing page and the
  plans pop-out (`app/ui/plans.js`, `PRICES` in `premium.js`) say "Price soon" and show no amounts; the planned
  prices stay in the owner's private plan, not in the repo.

## For developers

```js
const go = await TribePremium.gate('projects', { count: 4 });   // true = go ahead (soft gates always resolve true)
TribePremium.plan();       // { plan: 'free' | 'trial' | 'premium', until }
TribePremium.open();       // the plan sheet
TribePremium.footHtml();   // "Free plan · … What does Premium add?"
```

Rules for a new gate:

1. Never gate something that runs locally and worked before. Soft gates inform; they don't stop.
2. Gate at the moment of value (the 4th project, a bigger team), not on first run.
3. "Not now" first, a week of quiet after it, and a free do-it-yourself link on the sheet.
4. Test it in `app/test/e2e_premium.py`.
