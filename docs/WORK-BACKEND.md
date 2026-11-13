# Work: the backend plan

Work is where people in TribeCode get help, offer help and trade time (`app/ui/talent.js`, `abilities.js`, `server/talent.js`). This document says what works today, what needs something shared between tribes, and a three-phase plan to get there. Phase 1 is done. Phase 2's feed half is built (2026-11-13, feat/build-feeds): signed feeds are fetched, stored and shown, with requests and moderation (`server/workfeed.js`, `server/workfetch.js`, `app/ui/workfeeds.js`); receipts, compute metering and the feeds directory are still to build. Phase 3 is optional and needs the owner's decisions, listed at the end of each phase.

## Where things stand

TribeCode has no central server. Each tribe's own server (the desktop app, a home computer, a free cloud box) keeps the tribe's data in its folder under `.tribe/`. That makes Work private and free to run. It also means anything that has to cross tribes needs a new piece.

| Need | Works today (each tribe's own server) | Needs something shared |
|---|---|---|
| Post a gig, apply, hire, assign, track, review, credit | Yes, `server/talent.js` (`.tribe/talent/gigs.json`) | No |
| Offers ("I'll draw your sprites"), requests, accept to a task | Yes, kind `offer` and the Task Board accept flow | No |
| Abilities profile | Yes, per tribe, also kept on the device with no tribe and synced on join | Sharing one profile across tribes would need an identity (Phase 3) |
| Time bank (hours, both people confirm) | Yes, `.tribe/talent/timebank.json` | Hours that count across tribes need a shared ledger or signed receipts (Phase 2 receipts, Phase 3 ledger) |
| Share spare AI time / compute | Offers and requests that become approvals; usage is logged by hand | Metering that others can trust needs signed usage receipts (Phase 2) or a broker (Phase 3) |
| Public gigs across tribes | Opt-in: a gig goes to the community GitHub repository by pull request; every tribe reads it through jsDelivr (Gigs › Public) | A faster way with no GitHub step: signed feeds (Phase 2) |
| Discovery and search | Only inside one tribe (skills, hours, filters) | Search across tribes: a feed index each tribe builds (Phase 2), or a hosted index (Phase 3) |
| Reputation and reviews | Finished work shows on a profile inside the tribe | Reviews that a stranger can trust need signatures (Phase 2) and an account behind them (Phase 3) |
| Payments, escrow, payouts | None. "Paid" is a note; people settle it themselves | A payment provider and a company that is the platform (Phase 3) |
| Disputes | None | A process and someone to run it (Phase 3) |
| Moderation and abuse | Leads hide spam inside their tribe; `server/moderation.js` report and block | Cross-tribe blocklists (Phase 2) and a review queue (Phase 3) |
| Identity verification | None (a member is whoever the tribe let in) | KYC through the payment provider for anyone who is paid (Phase 3) |
| Notifications across tribes | Inbox and push inside one tribe | Feed polling (Phase 2) or a hosted relay (Phase 3) |

## Phase 1: in-tribe only (done)

Everything in the first column above. API: `/api/talent/*` (see the header of `server/talent.js`). The client is the Work page: Get help, Offer help, Find people, the you strip, the guide, Gigs (This tribe and Public), My offers, Find people, Trade (Time bank and AI time). Tests: `e2e_talent.py`, `e2e_gigs_self.py`, `e2e_work_complete.py`, `e2e_work_v2.py`.

Privacy: nothing leaves the tribe unless a poster makes a gig Public and types a public contact. Costs: none beyond the tribe's own host.

## Phase 2: federation through signed gig feeds (no central server)

Each tribe publishes a signed JSON feed of the gigs its people made Public. Other tribes subscribe by pinning the publisher's key and pull the feed. Nobody runs a shared server, and a feed can be hosted anywhere static (the tribe's own server, GitHub Pages, a gist).

### Built now (groundwork)

- `server/workfeed.js`, test `app/test/workfeed_test.js` and the feed part of `e2e_work_v2.py`.
- A tribe key: ed25519 from `node:crypto`, made on first use, stored in `.tribe/work/feed-key.json` with file mode 0600. The public key is 43 base64url characters; people compare a short fingerprint (`xxxx-xxxx-xxxx-xxxx`, SHA-256).
- `GET /api/work/feed.json`: the signed feed. **Members only for now.** Opening it to anyone is a decision for the owner (below).
- `POST /api/work/feed/verify { feed }`: checks a feed and stores nothing.
- `GET|POST /api/work/subscriptions`, `DELETE /api/work/subscriptions/<id>`: hosts and admins pin another tribe's key (`https` URL optional, stored but **never fetched** yet).
- `POST /api/work/import { feed }`: verify, require a pinned key, keep the newest `seq`, store under `.tribe/work/feeds/<key>.json`. `GET /api/work/imported` lists those gigs, tagged with the tribe.
- A gig's visibility is a choice on the gig: This tribe | Public. `POST /api/talent/gigs/:id/share` makes it public (feed + community board bundle), `POST /api/talent/gigs/:id/unshare` takes it back out of the feed.

### Data model

```json
{
  "schema": "tribecode.workfeed/1",
  "tribe": { "name": "Otters", "key": "<base64url ed25519 public key>" },
  "issued": "2026-11-12T10:00:00.000Z",
  "expires": "2026-11-19T10:00:00.000Z",
  "seq": 1762941600000,
  "gigs": [
    { "id": "otters-q1", "title": "Pixel artist for a cozy game", "kind": "task", "seatKind": "design",
      "description": "…", "skills": ["pixel art"], "hours": 6, "pay": { "type": "time", "text": "1 h for 1 h" },
      "contact": "@camp on Discord", "posted": "2026-11-12" }
  ],
  "signature": { "alg": "ed25519", "key": "<same key>", "sig": "<base64url>" }
}
```

- Signature: ed25519 over the canonical JSON of the feed without `signature` (object keys sorted, no whitespace). `tribe.key` must equal `signature.key`.
- Only the fields above survive import; each is length-capped and control characters are stripped. At most 200 gigs.
- Feeds expire after 7 days; a feed dated more than 5 minutes ahead is refused. A newer `seq` replaces an older one, so a replayed old feed does nothing.

### Built 2026-11-13 (feat/build-feeds)

- **Fetching** (`server/workfetch.js`): https only (http for localhost only with `TRIBE_FEED_ALLOW_LOCAL=1`, for tests), every resolved address checked against private, loopback, link-local, CGNAT and metadata ranges, the connection pinned to the checked address (DNS rebinding), redirects only to the same host, 256 KB cap, 10 s limit, JSON or text/plain only, ETag, per-host backoff (5 min doubling to a day). About every 45 minutes (`TRIBE_WORK_FETCH_MS`), plus Fetch now. A wrong key, a bad signature, an expired feed or an older `seq` is refused and the stored copy stays.
- **Follow by address + key fingerprint**, pause, block (stored gigs deleted, never fetched), remove, hide one gig. Hosts and admins only (Gigs › Public › Feeds).
- **Publish**: Members only (default) or Open (`GET /api/work/feed.json` with no sign-in, 30 a minute per address).
- **Gigs › Public** merges followed tribes' gigs with the community board; each card names the tribe and its key fingerprint.
- **Request** on another tribe's gig: a note and a contact go into this tribe's signed feed (`requests`, addressed to their key). The other tribe's hosts see it only if they follow this tribe's feed; the person always gets a message to copy and send. The sheet says so.
- Tests: `workfeed_fetch_test.js`, `e2e_work_feeds.py`, `security7_test.py` › W.
- Not done: the fetcher has not had an outside security review; items 5, 6 below; the feeds directory and the shared blocklist; the keyword filter on import.

### Still to build in Phase 2

Items 1, 2, 4, 7 (per-tribe) and 8 are built as described above; 3 is built without the feeds directory.


1. **Fetching.** A scheduled pull of each subscription's `https` URL (every 30 to 60 minutes, `If-None-Match`/ETag, 256 KB cap, 10 s timeout, no redirects to private addresses, DNS resolved and checked against private and link-local ranges before connecting). This is the one SSRF-shaped part; it should go through the security owner's review (feat/harden) before it ships.
2. **A public feed URL.** A tribe that wants to be found publishes its feed: either the host flips "Publish our gig feed" (then `GET /api/work/feed.json` answers without a token, rate-limited), or TribeCode writes the feed to the tribe's GitHub Pages site on each change, so the home computer can stay private.
3. **Discovery.** Subscriptions are the index. Gigs › Public merges the community board with imported feeds, with search over title and skills done locally. A small "feeds directory" file in the community repository (name, key, URL) lets tribes find each other without a server.
4. **Applying across tribes.** The contact field stays the way in. Later: a signed "interest" message the other tribe's server accepts at `POST /api/work/inbox` (rate-limited per key, the sender's key shown).
5. **Reviews and time receipts.** When a gig is credited, the poster's tribe signs a small receipt `{ gig, worker key or contact, hours, rating 1–5, text, at }`. A worker can attach receipts to their profile, and anyone can check them against the tribe's key. Hours across tribes become receipts, not a shared ledger.
6. **Compute metering.** The person who shares AI time signs a usage receipt per approved request (`{ request, hours used, at }`), so both sides see the same numbers. No automatic routing through someone else's login, ever.
7. **Abuse controls.** Per-tribe blocklist of keys (one tap: "Hide this tribe"); a shared blocklist file in the community repository that tribes may opt into; caps on gigs per feed, size and fetch rate; keyword filter from `server/moderation.js` on import; a lead can unsubscribe and the stored copy is deleted.
8. **Caching.** Stored feeds live in `.tribe/work/feeds/`, are dropped on expiry or unsubscribe, and are served from disk to the UI; the client never fetches other tribes directly.

### Security and privacy

- The private key never leaves `.tribe/work/feed-key.json` (0600). Key rotation: a new key signs a "moved to" notice with the old key; subscribers update their pin.
- A feed holds only what a poster chose to make public, plus the contact they typed. No member ids, names or emails.
- Import needs a pinned key, so nobody can push gigs into a tribe that didn't ask.
- Unshare removes a gig from the next feed; copies other tribes already fetched expire within 7 days. The UI says so.

### Costs

None for TribeCode. A tribe that publishes pays nothing extra (its host or GitHub Pages).

### What the client needs

- Gigs › Public: merge imported feeds with the community board, tag each card with the tribe and its fingerprint, Hide this tribe.
- Settings › Work (host only): Publish our gig feed, the key fingerprint and a Copy feed link button, Subscriptions (add by link or key, remove).
- The gig sheet already has This tribe | Public.

### Tests needed

- `workfeed_test.js` (built): sign, verify, tamper, expiry, key file mode, subscribe-only import, replay.
- Fetch: a local HTTPS-less mock refused, redirect to a private address refused, oversize refused, ETag respected.
- e2e: two servers, tribe B subscribes to A, A shares a gig, B sees it in Public after a pull; A unshares, B's copy goes on the next pull.
- Receipts: a credited gig produces a receipt that verifies on another server.

### Open decisions for the owner

- Can a feed be public without a token, and is it opt-in per tribe (recommended: opt-in, off by default)?
- Do we keep the GitHub pull request path for the community board, or replace it with a feeds directory?
- Is there one shared blocklist, who maintains it, and is it on by default?

## Phase 3 (optional): a hosted "TribeCode Market"

A small hosted service for people who want reach and money handling. Tribes still work without it. It reads Phase 2 feeds; it doesn't replace them.

### What it adds

- **Accounts**: one person across tribes (builds on `server/accounts.js` and the existing sign-in providers), linked to their tribe keys.
- **Search**: a full-text index over subscribed public feeds and Market-posted gigs (Postgres with `tsvector` is enough at first).
- **Reviews**: only from a paid or credited gig, one per side, editable for 14 days, with a response from the other side.
- **Payments** through a provider (Stripe Connect Express or similar): the client pays into the platform, funds are held until the poster accepts the work (escrow-style, using the provider's delayed payouts/transfers), then paid out to the worker's connected account minus fees.
- **Disputes**: either side opens one before release; funds stay held; a person on the Market team decides inside 7 days using the gig's updates, hand-in and messages; the provider's own chargeback process still applies to card disputes.
- **Moderation pipeline**: report → automatic checks (keyword and link lists, rate signals, new-account limits) → human review queue → action (hide, warn, suspend) → appeal. Every action logged.
- **Notifications across tribes**: email and web push for Market events.

### API shapes (sketch)

```
POST /v1/accounts                       { provider token } -> { account }
POST /v1/accounts/:id/keys              { tribeKey, proof }   proof = signature over a server nonce
GET  /v1/gigs?q=&skills=&pay=&cursor=   search
POST /v1/gigs                           { gig, visibility }   or { feedUrl } to index a tribe feed
POST /v1/gigs/:id/offers                { note, price? }
POST /v1/contracts                      { gig, offer } -> { contract, paymentIntent }
POST /v1/contracts/:id/submit | accept | dispute
POST /v1/contracts/:id/review           { rating, text }
POST /v1/reports                        { target, reason }
POST /v1/webhooks/stripe                provider events (signature-checked)
```

### Data schemas (sketch)

- `accounts(id, display_name, created, status, stripe_account_id?, kyc_status)`
- `tribe_keys(account_id, key, fingerprint, verified_at)`
- `gigs(id, source: market|feed, feed_key?, title, body, skills[], pay_type, price_cents?, currency, contact?, status, created, expires)`
- `contracts(id, gig_id, client_id, worker_id, amount_cents, fee_cents, currency, status: funded|submitted|released|refunded|disputed, payment_intent_id, transfer_id?)`
- `reviews(contract_id, author_id, rating, text, created)`
- `reports(id, target_type, target_id, reporter_id, reason, status, decided_by?, action?)`
- `audit(id, actor, action, target, at, detail)`

### Security and privacy

- The Market never sees a tribe's private data: only feeds and what people post there.
- Payment details stay with the provider; we store ids only. Webhooks are signature-checked and idempotent.
- Account deletion removes profile and reviews they wrote (contracts kept for tax law with personal fields stripped).
- Rate limits per account and per IP; new accounts can't take paid gigs until KYC is done.

### Compliance notes

- **KYC**: the provider runs identity checks for anyone who receives money (Stripe Connect Express onboarding). We don't hold ID documents.
- **Taxes**: the provider issues 1099-K forms in the US and handles DAC7 reporting in the EU if configured; VAT/GST on our platform fee depends on where the client is (Stripe Tax can calculate it). Workers are responsible for their own income tax; the terms must say so.
- **Fees**: provider fees (card processing and payout fees) plus a platform fee we choose.
- **Marketplace rules**: terms of service, a prohibited-work list, a refund policy, a dispute policy and a privacy policy update. Some regions treat escrow-like holding as money transmission; using the provider's Connect flow (they hold the funds) avoids us holding money ourselves. Get a lawyer's review before launch.
- **Minors**: no paid gigs for people under 18.

### Costs (rough)

- Hosting: a small app server plus managed Postgres, about $25–60 a month at launch.
- Provider fees: per transaction (Stripe's standard card rate plus Connect payout fees, check current pricing).
- People: moderation and disputes are the real cost; plan a few hours a week at launch.

### What the client needs

- Sign in to the Market (the existing sign-in sheet), link this tribe's key.
- Gigs › Public gains Market results and a "Paid through TribeCode" badge.
- The post sheet gains a price with currency and "Pay through TribeCode"; the gig sheet gains Fund, Submit, Accept and pay, Open a dispute.
- My offers gains payouts status and a link to the provider's dashboard.
- Report on every public card and profile.

### Tests needed

- Contract state machine unit tests (every transition, double-submit, refund after dispute).
- Provider test mode end to end: fund, submit, accept, payout; refund; dispute.
- Webhook signature and replay tests.
- Search ranking and pagination.
- Moderation: report → hide → appeal.
- Client e2e with a mocked Market.

### Open decisions for the owner

- **Fees**: the platform fee (for example 5–10% of the job, or a flat fee), who pays it (client, worker or split), and whether free and time-swap gigs stay free (recommended: yes).
- **Regions**: which countries at launch (the provider's Connect coverage decides payout countries); currencies.
- **Refund policy**: full refund before work starts; after Submit, only through a dispute; a time limit for accepting work before funds auto-release (for example 7 days).
- **Disputes**: who decides, how fast, and whether there's an appeal.
- **Company**: which entity is the platform, its terms and support address.
- **Moderation**: in-house only, or a community-moderator program with clear limits.
