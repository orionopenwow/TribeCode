# Website

Every project (a game, an app, anything) gets its own public page, made from what the project already has.
Open it from **Docs & Files › Website** (`#/docs/website`). The project overview shows a small **Website** link once the page exists.

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
