# Website generator and Customize

## Design it for me (Docs & Files › Website)

`server/sitegen.js` turns what a project already has into a static page that does not look generated:
name, bio, VISION.md (paragraphs become the story, `- Title: line` bullets become features), project sense
(kind, tags, audience, tone), milestones (roadmap), recent commits and gists (devlog), Visuals screenshots
(hero and gallery), the people and agents who build it (team), and a play link (play section; a local build is
embedded, an https link opens in a new tab).

### Layouts

| Layout    | Display face (OFL)  | Feel                                         | Picked for                    |
|-----------|---------------------|----------------------------------------------|-------------------------------|
| Editorial | Fraunces 700        | Serif headlines, numbered sections, rules    | portfolio, blog               |
| Swiss     | Space Grotesk 700   | Strict 12-column grid, flat color band       | apps, SaaS, landing pages     |
| Devlog    | JetBrains Mono 700  | Dark, monospace, commit log up front         | tools, APIs, bots             |
| Poster    | Bricolage Grotesque | Oversized type, cut-paper shapes             | games, 3D                     |
| Journal   | Instrument Serif    | Quiet, centered, book-like                   | cozy, story, notes            |
| Arcade    | Silkscreen          | Pixel type, star field, chunky borders       | pixel-art and retro games     |

Body text is Inter. Fonts are self-hosted from `app/ui/assets/site-fonts` (latin subsets from Fontsource, SIL
OFL 1.1, licenses alongside) and copied to `site/fonts/` on publish. Nothing is hotlinked.

### Our design rules

These are written for TribeCode. They were informed by the general principles in Anthropic's public
`frontend-design` skill (github.com/anthropics/skills, Apache-2.0); no text was copied.

- One clear typographic idea per layout: a distinctive display face with a plain, readable body face.
- A real grid (12 columns on desktop, one column on phones) and generous, consistent spacing.
- A restrained palette: one paper, one ink, one primary (the project color, or a hue from its sense tags).
  Every pair is checked: links 4.5:1 on paper, button text 4.5:1, shapes 3:1.
- Flat: no gradients, glows, blur or drop shadows. Depth from rules, borders and blocks of color.
- No stock photos. The project's own screenshots first, otherwise seeded flat SVG art (pixel stars, a Swiss
  grid, contour lines, cut-paper shapes, a dot matrix, editorial rules).
- No JavaScript on the page. FAQ uses `<details>`. Semantic HTML, a skip link, visible focus.
- Copy is simple, direct and warm. No hype words (see `HYPE` in `server/sitegen.js`), no exclamation runs,
  at most one emoji per field.

### Copy and the brain

Template copy is deterministic (Regenerate picks other phrasings from a seed; hand edits are kept).
"Write it for me" asks the tribe's brain (`server/llm.js`: the host's cloud key, else Ollama) or the person's
in-browser model (WebLLM) to rewrite the copy as JSON under a strict style prompt. Every field is cleaned and a
field with a hype word keeps the template.

A connected Claude uses the MCP tools `website_draft`, `website_edit_section` and `website_request_publish`.
Agents never publish: the host or the project lead presses Publish.

## The site builder (three levels, one draft) — retired

> Archived section: the builder's UI (`app/ui/sitegen.js`) was removed in v0.31 (docs/UI-CLEANUP.md). Websites are now made in the website designer (docs/WEBSITE.md › The website designer) and from the template gallery (docs/SITE-TEMPLATES.md). The generator API below (`server/sitegen.js`) is still used by Flint and the website view. This section is kept for history.

The builder sat on top of the generator. Every level edits the same draft, and nothing is live until the host or
the project lead presses Publish.

| Level | Who it suits | What it shows |
|-------|--------------|---------------|
| ⚡ Instant | Beginner | One tap (**Make my site**). The kind of site is guessed from project sense, or picked from six chips; an optional theme. Shuffle, Write it for me, Publish. |
| 🧭 Guided | Intermediate | Three steps: **1 Type** (and the facts it needs: hours, address, phone, email, date, place, RSVP, a contact link) · **2 Brand** (themes, color, accent, logo, font pair, layout) · **3 Sections** (on/off, edit, Shuffle, Regenerate). The live preview sits beside it on desktop and below it on phones. |
| 🧑‍💻 Code | Advanced | The files Publish writes, with sizes, a viewer for `index.html` and `styles.css`, Copy, a jump to the Code view, and how to edit them. |

The level starts from the person's experience mode (`app/ui/modes.js`, `TribeMode.get()`): Beginner → Instant
with few buttons, Intermediate → Guided, Advanced → Guided with every control and the Code tab. Controls above a
mode carry `data-mode-min` (CSS in `readability.css`). A level picked in the builder is remembered on that device
while the mode shows it.

Flint runs Instant from a sentence: "make a website", "build a site for my bakery" (→ Small business), "a website
for our birthday party" (→ Event). "Shuffle our website layout" still shuffles.

### Site types

| Type | Sections, in order | Layout | Hero button |
|------|--------------------|--------|-------------|
| Game page | hero, play, features, gallery, story, devlog, roadmap, team, FAQ | Arcade / Poster (from sense) | Play it |
| App landing | hero, features, gallery, story, play, FAQ, contact | Swiss | Try it / See the code |
| Portfolio | hero, gallery (Selected work), features (What I do), story (About), contact | Editorial | Get in touch |
| Small business | hero, story, features (What we offer), gallery, visit (hours, address + map link, phone, email), FAQ | Journal | Visit us |
| Event | hero (date · place), event (when, where, RSVP), story, features, gallery, FAQ | Poster | RSVP |
| Docs / notes | hero, story (Start here), features (Topics), devlog (Latest notes), roadmap, FAQ | Devlog | — |

Starter copy comes from the project's facts, said the way each kind of site says them. A bakery's FAQ answers
"When are you open?" from the hours; build talk ("AI agents build it") is left off business, event and portfolio
pages. Facts are cleaned: links must be https, an email must look like one. Sections with nothing to show stay hidden.

### Brand kit

Per project, set by the host or the project lead (`GET|PUT /api/projects/:id/website/brand`):

- **Color**: a main color (8 quick swatches or any hex) and an optional accent. Contrast is fixed for the chosen
  layout with `reach()`, and the builder says what changed in plain words ("Adjusted so text stays readable on the
  Journal layout: links use #807113, buttons #A1900E").
- **Logo**: PNG, JPG or a plain SVG under 200 KB (an SVG with scripts, event handlers or outside links is refused).
  Stored in the website state, inlined in previews and exports, copied to `site/logo.<ext>` on publish. Without a
  logo the header shows a text wordmark (the project name unless one is set).
- **Font pair**: a display face + Inter, independent of the layout. All self-hosted (OFL), never hotlinked:
  Classic (Fraunces), Modern (Space Grotesk), Elegant (Instrument Serif), Techy (JetBrains Mono),
  Playful (Bricolage Grotesque), Retro (Silkscreen).

### Themes

Ten one-tap themes, each a palette + a font pair + a layout: Cozy, Bold, Minimal, Retro pixel, Night, Paper,
Bakery warm, Studio, Garden, Ocean. Instant and Guided can start from one. Contrast is fixed the same way.

### Suggest for me

**✨ Suggest for me** sends the project's facts (name, bio, vision, sense tags, the site type so far, themes the
tribe liked) to the brain on the same path as Write it for me (or the person's in-browser model). The reply is JSON
(theme, type, palette, font pair, section order, tagline, why); every part is validated against the known options
and the tagline goes through `clean()` and the hype check. With no model on, rules from project sense answer.
The suggestion shows as a card with **Apply** and **Not now**. It is never applied by itself.

It learns, locally: each project's website state keeps what was applied and skipped (`picks`), and the theme list
and the next suggestion are ordered by what this project, the rest of the tribe and the project's kind tend to
pick. The card says why ("Suggested because you picked Cozy before", "…because your tribe picked Paper on another
project", "…because Bakery warm suits a small business").

### Files people can edit

Publish writes, in the repo's `site/` folder (or the tribe folder without a repo):

- `index.html`: semantic, no JavaScript, readable indentation, and a marker before every part:
  `<!-- ===== section: hero ===== -->`. It links `styles.css`; no inline styles.
- `styles.css`: starts with the commented brand tokens (`:root { --paper; --ink; --primary; --link; --accent;
  --display; --body; --wrap; --gutter; --section; … }`), then the fonts, then one rule per line.
- `fonts/` (only the faces in use), `logo.<ext>`, `shots/`.

The sha of each file Publish wrote is kept. When `index.html` or `styles.css` on disk no longer matches, someone
edited it by hand: Publish answers 409 and the builder shows **Someone edited the code by hand** with **Keep their
edits** (those files are skipped, the rest update) or **Replace**. Automatic rebuilds always keep hand edits.
Nothing is overwritten silently. **Export** still gives one self-contained HTML file (styles, fonts, logo and
screenshots inlined).

### API

`POST /api/projects/:id/website/gen` `{ how: generate|shuffle|regenerate, layout? }`,
`PUT …/gen` `{ layout?, off?, order?, section?, copy?, reset?, type?, info?, theme? }`, `GET …/gen/prompt`, `POST …/write` `{ reply? }`,
`POST …/instant` `{ type?, theme?, hint? }`, `GET|PUT …/brand` `{ primary?, accent?, font?, wordmark?, logo? }`,
`POST …/ideas` `{ hint?, reply? }`, `POST …/ideas/apply`, `POST …/ideas/skip`, `GET …/ideas/prompt`, `GET …/code`,
`POST …/publish` `{ onEdited?: keep|replace }`, `POST …/classic`, `GET …/draft?pt=`, `GET …/export[?which=live]`.

The offline demo (`app/ui/offline.js`) has a small stand-in for these routes, so the showcase can show Instant,
themes and a suggestion without a server.

## Customize (Settings › Look, project menu › Customize)

`server/look.js` + `app/ui/look.js`. Tribe: accent (the theme's highlight; Ember and the primary button stay),
background (plain, pattern, tint, picture dimmed until text keeps 4.5:1), name (host), emoji or icon, density,
font size. Project: theme override and a Dashboard cover (palette color, flat pattern, uploaded picture, or the
GitHub repo's social preview, fetched and cached by the host in `.tribe/look/`, offered only for a github.com
remote). Just me: personal accent, background, density, font size, and an opt-out from project themes.
Combinations that fail contrast on the theme in use are refused with a reason.

## A local model (optional)

Nothing is trained. A local model only helps with "Write it for me", Flint and summaries. Install
[Ollama](https://ollama.com) on the host, then pull one Qwen model that fits the GPU:

| GPU memory          | Model                 | Command                  |
|---------------------|-----------------------|--------------------------|
| No GPU / under 6 GB | Qwen3 4B              | `ollama pull qwen3:4b`   |
| 8 GB                | Qwen3 8B (default)    | `ollama pull qwen3:8b`   |
| 12 to 16 GB         | Qwen3 14B             | `ollama pull qwen3:14b`  |
| 24 GB or more       | Qwen3 30B-A3B (MoE)   | `ollama pull qwen3:30b`  |

TribeCode picks an installed Qwen model by itself. Settings › Flint's brain shows which one answers.
