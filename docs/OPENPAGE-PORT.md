# OpenPage → TribeCode website designer

OpenPage (github.com/buildingopen/openpage, MIT, by buildingopen) is a JSON-first website builder in React 19, Zustand,
dnd-kit and Tailwind 4: one typed site config, a visual editor, AI generation through Gemini, and a standalone HTML export.
TribeCode's website designer follows the same model in plain browser JavaScript with no dependencies
(`app/ui/sitecfg.js` the model and renderer, `app/ui/sitedesigner.js` the editor, `server/sitedesign.js` storage).
No OpenPage source is copied; this table is what we studied and what we built from it (feat/site-v2, clone of
2026-11-12). Credit: `NOTICE`.

Status: **done** (ported), **ours** (we do it differently on purpose), **no** (not ported, with the reason).

## Config schema

| OpenPage | TribeCode | Status |
|---|---|---|
| `SiteConfig { name, blocks, pages?, theme? }` | `{ v, name, theme, pages: [{ id, slug, title, blocks }], seo, logo?, credit?, template? }`: pages always present | done |
| `BlockConfig { id, type, variant, props }` | the same, plus `hidden` and `style: { bg, pad }` per block | done |
| `ThemeConfig` (bg0–bg5, text0–text3, accent, accentDim, borders, fontSans/Display/Mono, radius, radiusLg) | `theme { preset, mode, base, colors { bg, ink, muted, card, line, accent }, fonts { display, body }, radius, space }`: six roles, and a real dark variant computed and contrast-checked | ours |
| `PageConfig { name, path }` | `{ title, slug }`; slugs stay unique, the first page is `index` | done |
| Settings: siteName, siteDescription, faviconUrl, language, seoTitle, seoDescription, ogImageUrl | `cfg.seo { title, description, image, favicon, lang }` and `cfg.logo`, edited in the designer's Site panel or by Flint | done |
| Settings: gaId, posthogKey (analytics) | none: TribeCode sites carry no analytics or trackers | no (on purpose) |

## Blocks and variants (OpenPage: 19 types, 42 variants)

| OpenPage block · variants | TribeCode block · variants | Status |
|---|---|---|
| navbar · default, centered | the menu across pages (automatic), `cfg.nav` default/centered, logo in it | done |
| hero · centered, split, gradient, minimal | hero · center, split, minimal, **accent** (OpenPage's gradient as a flat accent band), **cover** (full-bleed picture) | done |
| features · grid, list, alternating | features · grid, list, stats, **alternating** | done |
| pricing · simple, comparison | pricing · cards, table | done |
| cta · simple, split | **cta** · simple, split, accent | done |
| footer · simple, multi-column, minimal | footer · simple, columns, **minimal** | done |
| testimonials · cards, carousel, spotlight | testimonials · cards, quotes, **spotlight** (carousel: no, it needs scripts; exports have none) | done |
| stats · grid, bar, counter | **stats** · grid, bar, big (counter animation: no, no scripts) | done |
| faq · accordion | faq · list, columns (`<details>`, works with no JavaScript) | done |
| team · grid | team · grid, list | done |
| contact · form | contact · form, simple (posts to the owner's email or form link, says so until set) | done |
| newsletter · simple | **newsletter** · inline, card | done |
| logocloud · default | **logos** · row, grid (wordmarks until a logo is added) | done |
| divider · line, space, dots | **divider** · line, space, dots | done |
| banner · ribbon, bar | **banner** · bar, ribbon | done |
| content · prose, columns, highlight (markdown) | text · plain, two, **highlight**, with markdown-lite (`##`, `**bold**`, `*em*`, `- lists`) | done |
| image · hero-image, side-by-side, grid | **image** · wide, side, framed (grid: the gallery block) | done |
| video · youtube, vimeo | embed · wide, inline (YouTube, Vimeo, Spotify, SoundCloud, Bandcamp) | done |
| gallery · grid, masonry | gallery · grid, masonry, strip | done |
| — | links (link in bio) · stack, cards, pills; list (menu, dates, episodes) · rows, cards, menu | ours |

## Themes

| OpenPage | TribeCode | Status |
|---|---|---|
| 10 presets: Dark Minimal, Ivory, Clean, Sand, Amber, Ocean, Rosé, Purple Haze, Slate, Forest | the same ten (`night, ivory, clean, sand, amber, ocean, rose, haze, slate, forest`), colors from OpenPage, muted text lifted to reach 4.5:1, fonts mapped to our OFL families | done |
| Google Fonts by name (loaded from fonts.googleapis.com) | 7 SIL OFL families shipped in `app/ui/assets/site-fonts`, 8 font pairs (`FONT_PAIRS`); nothing loads from a CDN | ours |
| radius, radiusLg | radius; section spacing (compact/normal/roomy) and per-block spacing | done |

## Editor

| OpenPage | TribeCode | Status |
|---|---|---|
| Layers panel: reorder (dnd-kit), duplicate, delete, add | blocks list: drag or ↑ ↓, duplicate, hide/show, delete | done |
| Block picker by category with descriptions | picker grouped by category, a schematic thumbnail per variant | done |
| Properties panel per block | inspector: layout, words, lists, pictures, buttons (where they go), background and spacing | done |
| Inline editing on the canvas | click and type in the live preview (sandboxed frame) | done |
| Design panel: preset swatches, colors, fonts, radius | theme select, Dark/Light variant, accent by Flint, Site panel: fonts, spacing | done |
| Canvas toolbar: desktop / tablet / mobile | Desktop · Tablet (820) · Phone (390), keys 1 2 3 | done |
| Keyboard: 1–5 routes, J JSON, H history, P preview, Esc, ⌘Z / ⌘⇧Z, ? help | `?` help, Ctrl Z / Ctrl Shift Z, Ctrl D duplicate, Delete, H hide, Alt ↑↓ move, C comment, 1 2 3 devices, Ctrl S save version, Esc | done |
| Version history (zustand snapshots) | undo/redo (80 steps) + the Saved shelf with thumbnails, compare and restore (server) | done |
| JSON drawer (edit the raw config) | not in the UI: `site.json` is in every zip export and the config is plain JSON on disk | no (rarely needed; kept simple) |
| Agent panel + AI generation (Gemini, `POST /api/generate`) | Flint with no AI (≈200 free edits, 620-case eval), the user's own AI through the AI-boost card for anything else | ours |
| Pexels image search (`api/pexels.ts`, needs a key) | the inspiration board (Openverse/Wikimedia, already in TribeCode) and uploads | ours |
| Templates (4: Portfolio, Restaurant, Agency, Blog) | gallery of 48 (16 ours + 32 imported open-source), previews, categories, search, peek | done |
| Scroll reveal animations | none in exports (no scripts; motion preference respected in the designer) | no (on purpose) |
| Deploy (`api/deploy.ts` to their host) | Publish to the project's `site/` folder (GitHub Pages ready), Download HTML or zip | ours |

## Export renderer

| OpenPage | TribeCode | Status |
|---|---|---|
| One HTML file, Tailwind via CDN, Google Fonts link | one standalone `index.html` (every page via `:target`, no scripts, pictures inside) or a zip (a file per page, `assets/`, `fonts/` with licenses, `site.json`) | done |
| `<title>`, description, og:title/description/image, favicon link, lang | the same from `cfg.seo` (og:image only when it is an absolute URL or an exported asset), `twitter:card` | done |
| Analytics snippets | none | no |
| Covers navbar … logocloud (not divider/banner/content/image/video/gallery) | every block type renders in the export | done |
| — | CC BY attribution line in the footer for templates that need it (`cfg.credit`) | ours |

## Not ported

- Carousel testimonials and counter animations: need JavaScript in the exported page; our exports have none.
- The JSON drawer: the config is reachable as `site.json`; a raw editor in the designer adds risk for little use.
- Gemini generation and Pexels search: tied to their keys and services; Flint (no AI) and the user's own AI cover it.
- Analytics (GA, PostHog): TribeCode sites are tracker-free by design.
