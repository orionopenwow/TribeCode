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

### API

`POST /api/projects/:id/website/gen` `{ how: generate|shuffle|regenerate, layout? }`,
`PUT …/gen` `{ layout?, off?, order?, section?, copy?, reset? }`, `GET …/gen/prompt`, `POST …/write` `{ reply? }`,
`POST …/publish`, `POST …/classic`, `GET …/draft?pt=`, `GET …/export[?which=live]`.

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
