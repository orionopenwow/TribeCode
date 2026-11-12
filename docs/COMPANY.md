# Company mode

*New in v0.27.* Build apps, games and websites with your friends, and run the business around them. One person or a
whole crew: give each role to a friend or an AI helper, and keep the decisions human.

This page describes what Company mode is for and how it is meant to work, from a user's point of view. Some parts are
still landing during v0.27; the [CHANGELOG](../CHANGELOG.md) says what shipped in each release.

## What it is

A **company** in TribeCode is a project with a few extra pieces:

- a **name** and a **mission** (one or two sentences),
- **seats** for the jobs a business needs, each held by a person, an AI helper, or both,
- a **goal** or two for the month, with results you can measure,
- **rhythms**: short check-ins that arrive on their own.

Your app, game or website stays at the center. Company mode adds the work around it: telling people about it, looking
after the people who use it, and keeping track of money. A tribe can run more than one company; each one is its own
project. Turn it on from a project's settings, or start from a template (a software product, an agency, a creator,
a game studio, a local business, a nonprofit, a club, or blank).

## Seats

A seat is a job, not a person. New companies start with a lean four:

| Seat | Color | Looks after |
| --- | --- | --- |
| CEO | Ember `#F26B1D` | where the company is going, and the final say |
| Build | Teal `#38C6B1` | making the product |
| Grow | Yellow `#FABD2F` | finding people who want it |
| Run | Slate `#94A3B8` | keeping things working: support, tools, chores |

Add **Design, Sales, Support, Finance, Legal** or a custom seat with one tap when you need it.

Each seat has a **charter**, a few lines anyone can read:

- **Goal** this month, and what "done" looks like
- **Looks after**: the files, pages or tasks it owns
- **May do alone**: for example "draft posts", "sort feedback"
- **Needs an OK**: for example "publish", "spend money", "email customers"
- an optional weekly **budget**

### AI helpers in a seat

An AI helper (your own Claude Code, Codex, Gemini CLI or another agent) can hold a seat on its own or alongside a
person. It works inside its charter. Anything outward or costly, such as money, publishing, customer emails,
contracts or production deploys, goes to a person through the existing approvals inbox (one tap on a phone) before it
happens. Start small: one goal and a short "may do" list, then widen it after a week of reading what it did.

Agent seats run on each person's own AI. TribeCode never resells anyone's Claude Code or other subscription usage.

## Rhythms

Three check-ins come built in, and each can be turned off:

- **Standup**: a few lines from each seat. What got done, what's next, what's stuck.
- **Weekly review**: progress against the month's goals, and what needs a decision.
- **Board update**: a short summary you could send to a friend, a mentor or an investor.

Seats write their own parts. You read them in a minute and answer what needs you. No dashboards to babysit.

## Money

The **Money** view shows numbers like sign-ups, income and costs, but only numbers with a source:

- a **connected tool**, using the tribe's own account and key (the first connectors are Stripe for payments,
  PostHog or Plausible for analytics, and a newsletter service such as Buttondown or Resend), or
- a number a **person typed in**, shown with their name and the date.

A number without a source is not shown, and AI helpers explain numbers but never invent them. Nothing in Money is
financial advice.

## Work

- **Find vibecoding work**: pick up paid or volunteer projects that fit your tribe.
- **Hire into your tribe**: invite a builder for a role, with the same invite links as always.
- **Trade time**: swap hours with other builders (a review for a logo, a bug fix for a landing page).
- **Share compute**: lend spare computer power to your tribe (see [SHARED-COMPUTE.md](SHARED-COMPUTE.md)).

Work runs the whole loop: **post** a need (a gig, a role or a seat) → **match** people and AI helpers (ranked by skills,
seats and who asked) → **assign** (linked board tasks follow) → **track** progress updates → **review** (approve with a
rating, or ask for changes) → **credit** (hours in the time bank, both confirm, and/or a cost line in Money; TribeCode
moves no money). "Suggested next" on Gigs reads the board, seats and gigs with plain rules ("You have 3 untaken tasks in
Design, so post a Designer role", "Claude could take these 2"), labelled *Basic · no AI*; with the tribe's AI on, the
same lines are reworded in place. Code: `server/talent.js`, `app/ui/workloop.js`, `app/ui/workcore.js`.

## Templates and rituals

Work › Templates holds docs for running a company: daily standup, weekly review, OKRs, meeting notes, decision record,
product brief, launch plan, website plan + copy brief, brand guide, hiring/role doc, onboarding, investor update, retro
and incident postmortem. Each opens **Guided** (3–5 friendly questions, one at a time, Skip any), can switch to
**Advanced** at any moment (every question at once, live preview), and has **✦ Draft the rest** (fills empty sections
from the board and the people with no AI; with AI, drafts them from the project context). Docs save into the project's
Files, or on this device with no tribe. The standup, weekly review and retro can become **rituals**: one calendar event
("every weekday at 9") that asks each member in chat (a small card, or `/standup did … | next … | stuck …`) and writes
the day's doc. Code: `app/ui/doctpl.js`, `app/ui/doctpl-data.js`, `server/rituals.js`.

Premium is described in [PREMIUM.md](PREMIUM.md): everything local stays free.

## Academy

Short lessons for every seat: what a CEO does in week one, how Grow finds the first hundred users, how Run keeps
support calm. The public course on the website ends with a fifth module, **From project to business**
([learn.html#m5-0](https://tribecode.org/learn.html#m5-0)).

## Legal starting points

Drafts for common documents, such as a privacy policy, terms of use and a co-founder agreement, to read, adapt and
check. **They are starting points, not legal advice.** Laws differ by country and state; when money, contracts or
personal data are involved, ask a qualified professional where you live.

## Offload

Send simple, low-risk jobs (summaries, tidy-ups, first drafts) to free models, such as a local model through Ollama, so
your main AI's time goes to the hard parts. You choose what may be offloaded.

## Marketplace

Add-ons, connectors and skills from the community, built on the Workshop and the community shelf
(see [MARKETPLACE.md](MARKETPLACE.md) and [WORKSHOP.md](WORKSHOP.md)). Items list their license; TribeCode only bundles
permissively licensed content.

## What stays the same

- Your code and data stay in your tribe's folder and your own GitHub repository.
- People approve anything outward or costly. Agents never vote, approve or spend on their own.
- TribeCode itself is free and open source (MIT).

## For developers

Company data lives in `<tribe>/projects/<pid>/company.json` (seats, charters, goals, rhythms). The server exposes
`GET/PUT /api/projects/:id/company` and seat routes under `/api/projects/:id/company/seats`, and broadcasts
`{ type: 'company', project }` on change. See the server module and its tests for the exact fields.
