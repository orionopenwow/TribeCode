# Website

Every project (a game, an app, anything) gets its own public page, made from what the project already has.
Open it from **Files › Website** (`#/docs/website`). Once the page exists, **Website** also gets its own row in the project sidebar.

![Website on desktop](screenshots/website-suggestion.png)

## What goes on the page

One self-contained `site/index.html` in the project's repo (projects without a repo: `projects/<id>/site/` in the tribe folder).
It needs no JavaScript, uses semantic HTML, follows the reader's light or dark setting and fits phones.

| Part | Where it comes from |
| --- | --- |
| Name, headline, tagline | The project name and bio, or the text the team sets |
| Logo and favicon | The project picture (else its emoji or initials on the project color) |
| Colors | The project color plus flat tints (primary, tint, shade, canvas, paper). No gradients |
| About | `VISION.md` (headings and markdown marks removed), or custom text |
| Screens | Up to 6 featured screenshots from Visuals, copied to `site/shots/` |
| Play it / Try it | A link the team sets (https), else the app's own built `index.html` in the repo |
| Code on GitHub | The repo's `origin` remote, https form only |
| Made by | People with their roles, agents, and commit authors. Names only, never emails |
| What's new | Recent gists, else recent commits |

Each part can be switched off under **Sections**.

## Keep it updated automatically

Turn on **Keep it updated automatically** and the page rebuilds whenever the bio, picture, vision, screenshots,
people, roles or commits change (checked every few seconds; the file is written only when it changes).
When the repo autopilot is on, TribeCode also commits `site/` (only that folder) as "TribeCode: update the website"
and pushes it, under the same rules as the autopilot's other files: only on main and only when in sync with origin.

## Suggestions

Anyone in the project (not spectators or agents) can **Suggest an edit** to the headline, tagline, about text or footer.
Chat says "💡 Maya suggested a new tagline for the website" and the host or the project lead gets a notification.
The host or lead approves (the text is applied and the page is rebuilt) or declines. Everyone else sees the fields read-only.

## Publishing

TribeCode never calls GitHub's write APIs for this. GitHub Pages publishes from the repo root or `/docs`, so either:

- **Settings › Pages › Deploy from a branch (root)**, then open `/site/` on the Pages address, or
- add a Pages workflow that uploads the `site/` folder.

## Safety

- Everything on the page is HTML-escaped (a bio with `<script>` shows as text). The repo link must be https.
- The in-app preview (`GET /api/projects/:id/website/preview`) inlines the screenshots and is served with
  `Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; … sandbox`, `nosniff` and
  `no-store`. Iframes and new tabs use a signed preview token (the member's key never goes in a URL), and the iframe is
  sandboxed with no scripts and no same-origin access.

## In the preview: Flint edits it, no AI needed

The preview's bar has **App | Website**. Website shows the builder's draft (a sandboxed frame with TribeCode's own helper,
so you can click to select, double-click to type over words, and drop comment pins). Flint sits beside it (Edit on phones)
and understands plain sentences with no AI (`app/ui/siteedit-core.js`, shared with `server/siteflint.js`):

| Say | It does |
| --- | --- |
| make the headline say Fresh bread daily · change the tagline to … · the button says … | changes those words |
| click something, then type the new words (or "change it to …") | replaces exactly those words |
| change the accent to teal · make the main color blue · use #2A8C80 for the accent | brand colors (host or lead) |
| add a pricing section · add testimonials · remove the FAQ · move the FAQ to the top | sections (pricing and testimonials start with honest placeholders) |
| swap to the Studio template · use the Swiss layout · use the playful font | a look, a layout, a font pair |
| add my logo | asks for the file (PNG, JPG or plain SVG, under 200 KB) |
| undo · save this version as Before the launch | steps back · saves to the shelf |

Every change pushes an undo step and is kept as a version; the preview reloads in place (scroll kept). With an AI on
(Claude via the host's key, or a local model through `server/llm.js`) a sentence the rules don't know becomes the same
operations, checked the same way, and the reply says **✦ via …** instead of **Basic · no AI**.

**The Saved shelf** (Saved in the bar; the Saved tab on phones; Files › Website › Website versions): save the draft with a
note, see a flat thumbnail of each version, compare one with now (both thumbnails and the changes in words), restore it.
Stored in `.tribe/website/<id>.versions.json`. Phones: Page · Edit · Saved tabs (tap or swipe), the device toggle shows
the desktop page shrunk to fit with pinch-to-zoom (double-tap fits it again). Test: `app/test/e2e_preview_polish.py`.

`POST …/website/flint { ask, pick?, ops?, logo? }`, `POST …/website/undo`, `GET|POST …/website/versions`,
`POST …/website/versions/:vid/restore`, `GET …/website/versions/:vid/compare`, `DELETE …/website/versions/:vid`,
`GET …/website/draft?pt=&edit=1` (the draft with the preview helper).

## API

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/projects/:id/website` | members: state, defaults, suggestions, preview link |
| PUT | `/api/projects/:id/website` | host / lead: `{ auto, sections, fields: { headline, tagline, about, footer, playUrl }, shots }` |
| POST | `/api/projects/:id/website/build` | builders |
| GET | `/api/projects/:id/website/preview[?pt=]` | members, or a signed preview token |
| POST | `/api/projects/:id/website/suggest` | `{ field, text }`, members (not spectators) |
| POST | `/api/projects/:id/website/suggestions/:sid/approve` · `/decline` | host / lead |

Code: `server/showcase.js` (not `server/site.js`, which is TribeCode's own GitHub Pages friend links), `app/ui/website.js`,
`app/ui/website.css`. Test: `app/test/e2e_website.py`.

## TribeCode's own website (tribecode.org)

Everything above is the page each *project* gets. TribeCode's own site is the `site/` folder: the Pages workflow
(`.github/workflows/pages.yml`) publishes it at the root with the web app under `/app/`.

### Why TribeCode (the plan for the home page's `#why` section)

What sets TribeCode apart from Lovable, Bolt, Replit, v0, Cursor, Discord and Notion. Each tool there is very good at
one slice: an AI that writes an app from a prompt (Lovable, Bolt, v0, Replit), an AI editor for one coder (Cursor),
a group chat (Discord), a wiki (Notion). We only claim what is built today.

| # | Differentiator | Why it's true (what's built) | Visual |
| --- | --- | --- | --- |
| 1 | **A team that includes AIs.** Friends and the AI helpers they already use (Claude Code, Codex, Gemini, Cursor) in one chat; any task can go to a person or to someone's agent, and people approve what lands. | chat + agents, lanes, hand-offs, one-tap approvals (`server/coord.js`, `approvals.js`) | the phone task list with "Give to Claude" |
| 2 | **Works with no AI, better with one.** Flint builds a website from 16 templates, a to-do app, a video editor, a platformer and company docs with no model; with an AI on, the same buttons get the ✦ version. | `server/flintfree.js` recipes, `doctpl.js`, DESIGN-SYSTEM §11 | Chore Wheel, built from one sentence |
| 3 | **You own it, and it's free.** Runs on your computer or server; chat, docs and tasks are plain Markdown/JSONL; code in your GitHub repo; MIT. Paid plans (later) only cover hosting and AI credits (docs/PREMIUM.md). | the tribe folder layout | a real tribe folder tree |
| 4 | **App, website, company and game in one project.** | Watch Flint build makes all of them in one project | four renders from one run |
| 5 | **Proof of work.** Watch Flint build shows each step, then exports ZIPs with every file, the timeline and who was there. | `flintrun.js`, `server/flintrun.js` | the finished run |
| 6 | **Your phone is a real seat.** A phone browser can chat, approve a merge, send a voice note and take a task, no app store. | docs/MOBILE.md, PWA | the phone approval card |

Not claimed: hosted plans and AI credits (not live yet), native store apps, anything a stronger AI does on its own.

### The gallery (`#gallery`)

A balanced, filterable gallery (All · Apps · Websites · Docs & company · Design · Games, `site/showcase.js`): a wide
Watch Flint build card with what's inside its proof ZIP, then apps, websites, company templates, designs and, last,
two games. Every thumbnail is a real render made by `python3 scripts/dev/showcase-thumbs.py` (a throwaway tribe,
Watch Flint build, Flint's own free commands, the templates) into `site/assets/showcase/*.webp` + `proof.json`.

Each card's **Make this** opens the app ready to make it:

- `app/?ask=<sentence>`: Flint opens with that sentence typed in (never sent for you), e.g. `make a cafe website`.
  The build sentences are Flint's free recipes; `app/test/e2e_site_gallery.py` checks each one with
  `flintfree.classify`.
- `app/?make=doc:<id>`: Work › Templates opens that company template (works with no tribe).
- `app/?flintrun=1` (Watch Flint build), `app/#/hub/work` (Work), `app/?demo=showcase` (the demo tribe).

Handled by `app/ui/makelink.js`.

### Languages

`site/i18n.js` + `site/lang/<code>.json` (es, pt, fr, de, ja, zh, ko; English is the source). Every visible string
on every page is keyed by its English text; animated app mocks, code and names stay as they are. `TribeLang.missing()`
lists what has no translation, and `app/test/e2e_site_i18n.py` fails on any (`--dump file.json` lists them to
translate).
