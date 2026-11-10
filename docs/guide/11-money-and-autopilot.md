# Money and autopilot

**Money** shows the business's numbers in plain words, and **autopilot** lets an AI-held seat work its charter on a schedule. Money appears once a project is a company (Intermediate mode, or turn it on from *Recommended next*).

## The books, plainly

Open **Money** in the sidebar. The top card is this month: **revenue**, **costs** (by category), **net**, **runway** and **users**. Every number shows where it came from (*typed in*, *Stripe CSV*, *Plausible CSV*…). Nothing is estimated.

Add numbers three ways:

1. **+ Add** and type it (amount, what it was, revenue or cost).
2. **Import CSV**: drop a Stripe export (balance, charges or payouts), a Plausible or PostHog export, or any file with *date, amount, label*. Re-importing the same file skips duplicates.
3. **Connect Stripe** (host only): paste a restricted, read-only Stripe key and press **Sync now**. The key stays on the host's computer and is never logged.

**Export CSV** gives your accountant a clean file. Set **cash on hand** to see runway.

> A starting point for your books, not financial advice. Check with an accountant.

## AI spend per seat

Each seat has a weekly AI budget. When AI helpers report what they spent, Money shows it per seat with a bar, and a seat stops at its cap.

## Autopilot (Advanced)

Open a seat held by an AI helper and set a schedule: **daily**, **weekdays** or **weekly**, a time, and the jobs it should do (taken from its charter). Then:

- Each run posts the job to the seat's AI helper in **#agents**.
- Anything in *Needs your OK* becomes an approval instead of an action.
- Outreach is always signed as the business and skips your **do-not-contact** list.
- Health, money and legal wording always goes to a person.
- **Pause all** stops every seat at once. Every run is in the audit trail.

On Sunday evening you get one summary: *what my agents did this week*.
