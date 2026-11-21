# The website creator and App Creator next to Figma and Lovable

Written 2026-11-16 for the pass 4 polish. This is an honest comparison, for us, of what a person gets from each tool.
The facts about the other tools come from `docs/EDITOR-PARITY.md` (researched November 10, 2026) and from reviews read
on November 16, 2026; two of those reviews were written by competitors of the tool they describe, so treat their
criticism as one side. Our numbers are measured here (see "How we measured"). No TribeCode prices are in this file.

Short version: we are faster to a first result, cost nothing per change, work with no internet, and let friends work
together by role. Figma is better at freeform design. Lovable builds apps with a real backend, which we do not.

## The table

| | TribeCode website creator and App Creator | Figma (Design, Sites, Make) | Lovable |
|---|---|---|---|
| **Time to a first result** | Pick one of 25 website templates or 54 app templates and it is editable at once. Measured: the website designer opens in 0.3 to 0.7 s (0.8 to 1.9 s the first time from a template); App Creator opens in about 0.05 s (0.6 to 0.9 s the first time from a template) | Design starts from an empty canvas or a community file. Make turns a prompt into a prototype, with a wait for each generation | A prompt becomes a working app after a generation wait; reviews say the first result is strong |
| **Cost of each change** | None. There are no credits; every edit, Flint request and Polish is free and runs on the person's own computer | Make runs on monthly credits that do not roll over. Figma's own examples: a small change about 30 credits, making a design interactive about 75 | 5 free credits a day, capped at 30 a month. Reviews report fix-one-thing-break-another loops that use credits on each try |
| **With no internet** | Works. Designs are real files in the project's folder; double-click `index.html`. Flint's rules need no AI and no connection | Needs the service | Needs the service |
| **Working together** | Friends see each other's pointers and selections, with a soft lock while someone types. A friend sees a website edit in about 0.4 s and an app edit in about 0.3 s. Roles decide who changes directly and who suggests; a suggestion shows before and after and a person approves | **Better at the canvas:** live cursors, follow, comments and observation are the standard others copy. Permissions are by seat, not by "who may change the website" | Live multi-user sync works, but people work on prompts and a preview side by side; there are no roles or approvals inside a project |
| **Design control** | Sections and parts with typed words, looks, spacing handles, colour, type, 56 app looks, zoom, your own CSS. **Not** a freeform canvas: you cannot draw a shape anywhere or build a new component from nothing | **Better:** freeform vector design, auto layout, components with variants, variables with modes, prototyping with transitions | Visual edits for styling without spending a credit; layout changes go through prompts |
| **Code access** | The site is plain HTML and CSS with no scripts needed; see and copy any section's code, add your own CSS, download one file or a zip. The app exports as an offline web app and an Expo project | Make exports a ZIP that reviewers describe as a prototype codebase to review and refactor. Sites has no code export | Real, editable code with GitHub sync; a code view beside the preview |
| **Publishing** | Publish from the same place to a play link, GitHub Pages or a free cloud spot, with each one's free limits shown. Put it on your phone walks through Add to Home Screen. Verified here against a stand-in for GitHub, not yet on real devices | Sites and Make publish to a Figma address with custom domains. Reviews of Sites report slow pages, poor Lighthouse scores and thin search settings | One-click hosting and custom domains. **Better:** a hosted database, sign-in and storage through its backend connection |
| **AI help** | Flint with no AI understands 66 everyday requests per creator and "Polish it" tidies spacing, sizes, colour and dead buttons. A small model in the browser or on the computer can pick only from Flint's own checked commands. A member's own AI helper (Claude Code and others) reads the design and proposes changes; a person approves | Make and the Figma agent generate and edit from prompts; strong at producing a first design. Uses credits | The product is the AI: it writes the whole app from prompts, plans and debugs. Strongest of the three at "build me X" from nothing |
| **Learning** | Five lessons done in the real tool (first website, first phone app, together, online, power tools), 65 quick guides with Show me, and Flint answers "how do I" with no AI | A large library of courses, community files and tutorials, outside the tool | Docs, templates and a community; learning happens by prompting |

## Where the others are better (say so when asked)

- **Freeform vector design:** Figma. Our creators arrange ready-made sections and parts; they are not a drawing tool.
- **Components, variants and auto layout:** Figma. We have saved sections, looks and a brand kit, not a component system.
- **A hosted backend:** Lovable (database, sign-in, storage). Our exported apps keep their data on the phone; anything
  with accounts or a server needs a stronger AI and real code.
- **Building an app from one sentence:** Lovable and Figma Make. Flint with no AI starts from templates and recipes.
- **Real-device polish:** both ship to millions of devices. Ours has been checked in desktop Chrome and phone-sized
  windows only; nothing here has been tried on a real iPhone or Android phone yet.

## Where we are better

- **No credits, ever.** The rivals meter each change; ours cost nothing and need no account.
- **Offline and yours.** The design is real files in a folder on your computer.
- **Roles and approvals.** A tribe decides who changes things directly and who suggests; AI helpers always suggest.
- **Speed.** Both creators open in well under a second and an edit reaches a friend in about a third of a second.
- **Plain output.** A website is HTML and CSS that opens with a double-click.

## How we measured

Headless Chrome with the server on the same machine, three runs each, on 2026-11-16.

| What | Website designer | App Creator |
|---|---|---|
| Open (already has a design) | 340 to 660 ms end to end (on screen in 10 to 11 ms, page ready in 255 to 395 ms) | 45 to 72 ms |
| First open from a template | 0.8 to 1.9 s | 0.6 to 0.9 s |
| An edit reaches a friend | about 0.4 s | 0.29 to 0.33 s (it was 0.56 to 0.69 s before this pass) |

The website numbers are from `docs/SITE-CREATOR.md` (`app/test/e2e_site_polish.py` prints them). The App Creator
numbers come from a one-off script in this pass; the friend time fell because a save now waits 250 ms instead of
500 ms when someone else has the app open (`app/ui/appcreator.js`). A real network between two homes will add its
own delay to the friend numbers.
