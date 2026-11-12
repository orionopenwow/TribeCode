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

## The website designer

![The website designer](screenshots/site-designer.png)

Open it from **Files › Website › Open the designer**, **Preview › Website › Design**, the project's Website link (it
goes to Files › Website), "open the website designer" in Flint's chat, or `#/site-designer`. It follows OpenPage's model
(github.com/buildingopen/openpage, MIT; reimplemented in plain JS, credited in `NOTICE`):

- **One JSON config** is the source of truth (`app/ui/sitecfg.js`): `{ name, theme: { preset, mode, colors, fonts,
  radius }, pages: [{ title, slug, blocks: [{ id, type, variant, props }] }] }`. Stored in `.tribe/website/<pid>.config.json`
  (`GET|PUT /api/projects/:id/site-config`); with no tribe it stays on this device.
- **Blocks** with layout variants, the same set tribecode.org has: hero (center, split, minimal), features (grid, list,
  stats), gallery (grid, masonry, strip), pricing (cards, table), testimonials, FAQ, team, links (link in bio), list
  (menu, dates, episodes), contact form, video/embed, text, footer, and a menu across pages. **+ Add block** picks a type
  and a variant; drag (or ↑ ↓) to reorder.
- **Themes**: eight presets (Paper, Swiss, Editorial, Terminal, Playful, Minimal, Bold, Soft). **Dark** switches to the
  design's own dark variant (a real palette, checked for contrast), not a filter.
- **Inline editing**: click words in the live preview and type. Click a button to choose where it goes (a page, a
  section, a web address, an email). Click a picture to upload one, take one from the inspiration board, make it round
  or square, and set alt text.
- **Undo / Redo** for everything (Ctrl Z, Ctrl Shift Z), including what Flint does.
- **Download HTML**: one standalone `index.html` with every page (CSS `:target`, no scripts, pictures inside). The ▾
  menu has a **zip** (a file per page, `assets/`, `fonts/`, `site.json`, README) and **Publish to the project** (writes
  the same files to `site/`, `POST …/site-config/publish`).
- **Versions**: Save version puts the config on the Saved shelf with a thumbnail; Restore brings it back
  (`server/siteflint.js` keeps `cfg` on each version).
- **The 16 templates** open as configs (`GET /api/site-designer/template/:id`, pictures inlined).

Flint edits the same config, free and undoable: "make the buttons work", "link this button to the contact page",
"add a page called About", "rename this page to Work", "replace the image", "use a picture from my board", "make the
picture round", "dark mode", "add a gallery", "move the FAQ to the top", "make the hero split", "use the swiss theme",
"make the accent teal", "change the headline to …", "download the html", "something for my band". What needs an AI gets
the one AI-boost card (Use my AI · Get credits / Premium). Test: `app/test/e2e_site_designer.py`.

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
