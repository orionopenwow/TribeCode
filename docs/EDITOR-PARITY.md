# Editor parity: Figma Design, Figma Make and Grok Build

Researched November 10, 2026. This doc compares TribeCode with three tools that set the bar for building visually with AI:
- **Figma Design** (the canvas editor), as of Config 2026.
- **Figma Make** (prompt to app).
- **Grok Build**, xAI's prompt-to-app and coding agent. It replaced the browser canvas called Grok Studio and has been free in Build Mode since August 25, 2026.

For each feature it says what TribeCode has today, how big the gap is, and in what order to build. The goal is not to clone
anyone. It is to make "design it, build it, ship it with friends" feel as good as those three, while staying free, open and
self-hosted.

Constraints every work package below respects:
- **No dependencies:** TribeCode itself uses zero npm packages (plain Node and browser JS). Generated projects may load the build kit from a CDN.
- **Design rules:** the flat matte design system (`docs/DESIGN-SYSTEM.md`, `docs/design-tokens.json`, `app/ui/motion.css`).
- **Flint is honest about what he can do:** see `docs/FLINT-TIERS.md`, which the flint-free branch is writing.
- **No copying:** no copied trademarks, logos or UI artwork.
- **No prices** in the repo.

"Grok bot" is taken to mean xAI's Grok and its app-building side: Build Mode in the Grok apps, the Grok Build agent, and
the older Grok Studio canvas. It does not mean Groq, the inference company.

## 1. Parity matrix

Status: **have** = works today, **part** = a version exists, **miss** = not built. Effort: S ≈ a day, M ≈ a few
days, L ≈ a week or more for one agent. Priority: P1 is what the plan does first.

### Design canvas (Figma Design)

| Feature | What the bar is | TribeCode today | Gap | Effort | Pri |
|---|---|---|---|---|---|
| Infinite canvas, pan/zoom, select, marquee, multi-select, align/distribute, snapping, rulers | Figma's core canvas | **part**: `app/ui/whiteboard.js` has pan/zoom, select, marquee, shapes, text, sticky notes, pictures, undo, live sync (`server/whiteboard.js`). It's a whiteboard, not a design canvas: no snapping, smart guides or align tools | Build a design canvas mode on the same engine, or a sibling module | L | P1 |
| Frames (artboards) with device presets, nesting, clip content | Frames are the unit of design | **miss** (the preview has device sizes: `app/ui/preview.js` DEVICES) | Frames + presets (phone, tablet, desktop, social) | M | P1 |
| Layers panel: tree, rename, lock, hide, reorder, group (Ctrl G) | Left panel | **miss** | Layers tree built from the scene graph | M | P1 |
| Properties panel: x/y/w/h, rotation, radius, fill, stroke, effects, opacity, blend | Right panel | **miss** (whiteboard has a color and width palette) | Properties panel bound to the selection | M | P1 |
| Auto layout (direction, gap, padding, alignment, hug/fill/fixed, wrap) | The flagship layout model; maps to CSS flex | **miss** | Flex-backed auto layout, rendered as real CSS | L | P1 |
| Constraints / responsive resize | Pin edges, scale | **miss** | Left/right/center/scale constraints, mapped to CSS | M | P2 |
| Text: fonts, size, weight, line height, letter spacing, text styles | Typography | **part** (whiteboard text has one font) | Text properties + a few bundled open fonts | M | P1 |
| Components, instances, overrides, variants, component properties | Reusable UI | **miss** | Main component + instances with overrides; variants as named property sets | L | P1 (basic) / P2 (variants) |
| Styles and variables (color, number, string, boolean) with modes (light/dark) | Design tokens | **part**: our own tokens exist (`docs/design-tokens.json`), but nothing per project | Per-project variables with modes, exported as CSS custom properties | M | P2 |
| Shared libraries / design-system import | Team libraries, Make kits | **part**: marketplace libraries (`templates/marketplace.json`), build kit | "Use this design system" = tokens + components into a project | M | P2 |
| Prototyping: links between frames, triggers, transitions, Smart Animate, overlays | Click-through prototypes | **miss** (the live preview is the real app instead) | Simple frame-to-frame links + presentation mode; we lean on code previews for real behaviour | M | P2 |
| Motion timeline (keyframes, easing, export CSS/JSON/video) | New at Config 2026 (open beta) | **part**: `app/ui/motion.css/js` tokens; ad tools in `promo/` | Per-layer keyframes that export CSS; later video | L | P3 |
| Shader fills/effects (WebGPU) | New at Config 2026 | **miss** | Optional; a few parameterized CSS/canvas effects fit the flat rules better | M | P3 |
| Dev Mode / inspect: CSS for the selection, measurements, assets export, code connect | Handoff | **part**: element picker in the preview (`server/preview.js` pick script) shows tag/text/html | Inspect panel on canvas and preview: CSS, spacing, copy code | M | P1 |
| Code layers (code on the canvas, frame↔code) | Config 2026, waitlist | **part**: the preview *is* code; no canvas↔code link | **Our edge:** frame → HTML/CSS files in the project; preview element → editable canvas layer | L | P1 |
| Export PNG/SVG/PDF per layer/frame | Standard | **part** (whiteboard image export; deck PDF) | Per-frame PNG/SVG export | S | P1 |
| Multiplayer cursors, follow, spotlight, observation | Live collaboration | **have** in panes (`app/ui/cursors.js`) and on the whiteboard | Follow/spotlight a friend on canvas | S | P1 |
| Comments pinned to the canvas, threads, resolve, mentions | Feedback | **part**: doc comments (`app/ui/docsx.js`), board comments (`server/board.js`); none on canvas or preview | Pinned comments on canvas and preview | M | P1 |
| Version history, named versions, restore, branching | Safety net | **part**: doc history (`server/docsx.js`), git repo (`server/repo.js`) | Canvas snapshots + named versions; branching = git branches already | M | P2 |
| Plugins / widgets, generative plugins (describe a tool → plugin) | Extensibility | **part**: widgets (`app/ui/widgets.js`), marketplace, MCP tools (`server/mcp.js`) | Canvas plugin API (scene graph read/write) for Flint skills and agents | M | P2 |
| Figma agent on canvas (skills, connectors, attachments, shared chats) | Open beta at Config 2026 | **part**: Flint has skills, memory, docs, a flier that edits (`app/ui/flintfly.js`, `server/flintmem.js`); members' Claude Code via MCP | Flint reads/writes the canvas scene graph; agents as live collaborators | M | P1 |
| AI: First Draft / prompt-to-design, rename layers, visual search, image edit (Weave) | AI on canvas | **part**: Flint docs/sheets/decks; build kit starters | Prompt → frames from templates (free tier), layer naming, simple image tools via ArtCraft / Studios | M | P1 |
| Keyboard essentials (V, F frame, R, O, T, P, K scale, Shift A auto layout, Ctrl G, Alt drag duplicate, arrow nudge) | Muscle memory | **part** (whiteboard V/P/R/O/A/L/T/S/E/I) | Figma-compatible shortcut map in canvas mode | S | P1 |
| FigJam (whiteboard) | Brainstorm boards | **have**: `app/ui/whiteboard.js` | Stamps, voting dots, timer, sections | S | P3 |
| Slides | Decks | **have**: `app/ui/deck.js` (Markdown slides, present, PDF) | Canvas-designed slides later | — | P3 |
| Sites (design → published responsive site) | Figma Sites | **part**: publish (`server/publish.js`), site generator (`server/sitegen.js`) | Publish a canvas frame as a responsive page | M | P2 |
| Draw (vector pen, brushes) / Buzz (brand templates at scale) | Illustration / marketing assets | **part**: Studios link out to free tools (`templates/studios.json`) | Vector pen + boolean ops later; brand templates via components | L | P3 |

### Prompt to app (Figma Make, Grok Build, and Lovable / Bolt / v0 as the bar)

| Feature | What the bar is | TribeCode today | Gap | Effort | Pri |
|---|---|---|---|---|---|
| Chat → live preview of a working app | Make, Grok Build, Lovable | **have**: the Flint panel beside the preview (`app/ui/previewflint.js`), the build loop, live reload (`server/preview.js`) | Free-tier builds from starters (flint-free branch) | — | — |
| Plan mode (editable plan before code) | Make on paid plans, Grok Build | **part**: daily plan / tasks (`server/plan.js`, `app/ui/tasks.js`) | "Plan first" toggle in the Flint panel → editable steps → run | S | P1 |
| Point and edit (click element → restyle/swap/prompt) | Make | **have**: picker + rules + Flint (`server/preview.js`, `app/ui/previewflint.js`) | A visual property sheet on the picked element (no prompt needed) | M | P1 |
| Multi-select annotations sent together | Make | **miss** | Pin several notes on the preview, then "Apply all" | S | P1 |
| Attach frames/components as context | Make | **miss** (we attach elements and files) | Canvas frames as build context | S | P1 |
| Code view + manual edits + guidelines file | Make, Grok Studio | **part**: files/code (`server/codefiles.js`), `TRIBE_CONTEXT.md` (`server/context.js`) | Code tab beside the preview with save + diff | M | P2 |
| Version history of generations, restore, favourite | Make | **part** (git commits via the repo) | Timeline of builds with one-click restore | S | P1 |
| Parallel sub-agents in worktrees | Grok Build (up to 8) | **part**: AI helpers in #agents, lanes and claims (`server/agentnet.js`, `server/claims.js`) | Show parallel helpers' progress in the build feed | S | P2 |
| Publish to a URL + custom domain | Make (figma.site), Grok (grok.me) | **have**: play links, remix bar, safety check (`server/publish.js`); a cloud host for public URLs | Custom domain guide via the cloud host | S | P3 |
| Backend: database, auth, storage (Supabase, Payload) | Make connectors | **part**: tribe data APIs; no per-app backend | A tiny built-in app data store (key-value + auth through tribe members) for published apps; bring-your-own Supabase guide | M | P2 |
| GitHub two-way (clone, branch, PR) | Make, Grok export | **have**: repo, gated merges (`server/repo.js`, `server/integrator.js`) | — | — | — |
| Templates / kits / skills | Make kits, templates | **have**: starters, build kit, studios, marketplace, trending feed | — | — | — |
| MCP connectors for context | Make, Figma agent | **have**: MCP server (`server/mcp.js`), connectors | — | — | — |
| Live external data, image generation inside builds | Grok Build | **part**: Studios (ArtCraft etc.), media | Image slots filled from the asset library first, AI images where connected | S | P3 |
| Free usage | Grok Build Mode free since Aug 2026; Make runs on credits | **have, our angle**: Flint's free tier + friends' own agents | Keep honest tier messages (flint-free branch) | — | — |
| Multiplayer building (friends + their agents in one project) | Make: comment/riff; Grok: projects, private apps | **have, our edge**: tribes, roles, claims, approvals, jam mode | Bring it onto the canvas (Phase 1) | — | — |

## 2. Top 10 gaps (biggest "this feels like Figma or Make" wins)

1. A real design canvas: frames, a layers panel and a properties panel.
2. Auto layout that is literally CSS flex, so designs become code with no translation.
3. Canvas ↔ code: export a frame to HTML/CSS in the project; import a preview element as editable layers.
4. Components with instances and overrides.
5. Comments pinned to the canvas and the live preview.
6. Flint on the canvas: prompt to frames (free from templates), rename layers, tidy up, and agents editing the scene graph with live cursors.
7. Point-and-edit property sheet: change the picked element's spacing, size, color and font without typing a prompt.
8. Inspect / dev handoff: CSS, spacing and measurements for any layer or element.
9. Plan mode + build history with one-click restore in the Flint panel.
10. Variables with light/dark modes, exported as CSS custom properties.

## 3. Phased build plan

### Phase 1: "Figma and Make inside a friends app" (6 work packages, can run in parallel after P1-A)

> **Built (fork/canvas):** P1-A, P1-B and P1-D. `#/canvas` (sidebar: Design), `server/canvas.js`, `app/ui/canvas/{scene,canvas,layers,props}.js` + `canvas.css`, test `app/test/e2e_canvas.py`. For P1-C, `TribeCanvas.exportFrame(id)` (scene.js `toHTML`) returns `{ html, css, name }` with flex CSS for auto layout; the props panel and layers stay in sync through `TribeCanvas._e`.

**P1-A: Design canvas core.**
- **Files:**
  - new `app/ui/canvas/scene.js`: a JSON scene graph `{ id, type: frame|rect|ellipse|text|image|group|instance, parent, children, x, y, w, h, rotation, fill, stroke, radius, opacity, text{...}, layout{...}, name, locked, hidden }`, with ops for undo
  - new `app/ui/canvas/canvas.js`: DOM-rendered layers inside a transformed stage, so text is real text and output is close to final CSS. Pan, zoom, select, marquee, resize handles, smart guides, snapping, alt-drag duplicate, arrow nudge, Figma-compatible keys V F R O T K, Ctrl G and Ctrl D
  - new `app/ui/canvas/canvas.css`
  - new `server/canvas.js`: `/api/canvas/:project/:file` CRUD, op log over WebSocket `cnv-*` reusing the `server/whiteboard.js` sync pattern, and snapshots
  - route `#/canvas` in `shell.js`, plus an entry in the + Add gallery (`widgets.js`)
- **Acceptance:** two browsers edit one canvas live; undo is per person; 1,000 layers pan at 60fps; reload keeps everything.
- **Tests:** `app/test/e2e_canvas.py`.

**P1-B: Layers + properties panels and auto layout.**
- **Files:** new `app/ui/canvas/layers.js` (tree, drag reorder, rename, lock/hide, groups) and `app/ui/canvas/props.js` (position/size, radius, fill/stroke with token swatches from `docs/design-tokens.json`, text properties, auto layout: direction, gap, padding, align, hug/fill/fixed, wrap). A frame with auto layout renders with `display:flex` styles, so it is the same as the exported CSS.
- **Acceptance:** Shift A wraps a selection in auto layout; changing the gap reflows live for everyone.
- **Tests:** `e2e_canvas_props.py`.

**P1-C: Canvas ↔ code.**
- **Files:**
  - new `server/canvascode.js`: frame → semantic HTML + CSS (flex for auto layout, custom properties for colors), written to `<project>/design/<frame>.html` or into a chosen page through `server/codefiles.js`. The preview reloads on its own (`server/preview.js`).
  - the reverse: the picker's element (`server/preview.js` pick payload, extended with computed styles) → layers on the canvas.
  - an "Inspect" tab: CSS, spacing and measurements for any layer.
  - "Copy as HTML/CSS" and per-frame PNG/SVG export.
- **Acceptance:** design a card on the canvas, click "Send to app", and see it in the live preview. Pick a preview element, click "Edit on canvas", change the padding, send it back, and the preview updates.
- **Tests:** `e2e_canvas_code.py`.
- **Built (fork/canvas-code):** `server/canvascode.js` (`POST /api/canvascode/send`; markers `tribecode:design <file>:<frame>` around the CSS in `<head>` and the HTML in `<body>`, so a resend replaces only those parts; frame → file links in `.tribe/canvascode.json`; commits each send; scripts, handlers and paths outside the repo refused). `app/ui/canvas/code.js` + `code.css`: the Send to app button, the Inspect tab (CSS with token names, spacing, colors, copy), Alt-hover measuring, PNG/PNG 2x/SVG export, comment pins on layers (`TribePins.mount`, C), and "Open in canvas" from the Flint panel's picked element (the preview helper's `serialize` message returns the DOM with computed styles; flex → auto layout). Not yet: colors as CSS custom properties in the export (hex for now), and absolutely placed children in non-flex containers export as `position: absolute`.

**P1-D: Components (basic).**
- **Files:** additions to `app/ui/canvas/scene.js` for `component` and `instance` types; overrides on text, fill and visibility; "Detach"; an assets section in the layers panel. Each component exports as a reusable HTML snippet or class.
- **Acceptance:** editing the main component updates every instance live; overrides survive.
- **Tests:** in `e2e_canvas_props.py`.

**P1-E: Comments and presence on canvas and preview.**
- **Files:** new `server/pins.js` (comment pins `{ surface: canvas|preview|doc, target, x, y, thread[], resolved }`, notify via `server/notify.js`) and `app/ui/pins.js` (C to drop a pin, threads, @mentions, resolve). Follow/spotlight in `app/ui/cursors.js`; cursors and selection outlines on the canvas in the person's color.
- **Acceptance:** a friend's pin shows up live and lands in the Inbox; clicking it jumps to the spot.
- **Tests:** `e2e_pins.py`.

**P1-F: Flint and agents on the canvas, plus Make-style extras in the Flint panel.**
- **Files:**
  - `server/mcp.js` gets canvas tools (`canvas_read`, `canvas_apply_ops`), so members' Claude Code agents edit designs as collaborators, shown with their own cursors.
  - Flint (free tier): "make a pricing section / a login screen / a phone home screen" → frames from component templates in `templates/canvas/*.json`; "rename layers", "tidy up" (auto layout and spacing on the selection), "make a dark version". The small model only fills in copy. `app/ui/flintfly.js` flies to the frame being edited.
  - Flint panel (`app/ui/previewflint.js`): a Plan-first toggle (editable steps), multi-select annotations with "Apply all", a build history list with restore (git commits from `server/repo.js`), and attaching a canvas frame as context.
- **Acceptance:** the prompt "a sign-up screen for my café app" makes an editable frame with no paid model; Claude Code moves a layer through MCP and everyone sees its cursor.
- **Tests:** `e2e_canvas_flint.py`.

**P1-G: Point-and-edit property sheet (no prompt needed).**
- **Files:** `app/ui/previewflint.js` + `server/preview.js`. When an element is picked, show the same compact props UI as P1-B (spacing, size, radius, colors, font). Changes patch the source CSS deterministically through the existing look rules.
- **Acceptance:** padding and color changes on a picked button persist to files and reload the preview.
- **Tests:** in `e2e_build_loop.py` / new `e2e_point_edit.py`.

### Phase 2: depth

- **P2-A Variables and modes:** per-project tokens (color, number, string, boolean), light/dark modes, bind them in props, export as CSS custom properties.
  - Files: `server/canvas.js`, `app/ui/canvas/vars.js`.
- **P2-B Variants and component properties:** a variant grid; property types boolean, instance swap and text.
- **P2-C Prototype links and presentation mode:** frame → frame on click, with dissolve/slide/move transitions using motion tokens. Share as a play link via `server/publish.js`.
- **P2-D Constraints and responsive frames:** pin and scale rules mapped to CSS; preview a frame at phone, tablet and desktop sizes.
- **P2-E Use a design system:** import marketplace libraries and the TribeCode tokens pack as a project library.
- **P2-F Code tab beside the preview:** edit, save and diff (`server/codefiles.js`); a guidelines section in `TRIBE_CONTEXT.md`.
- **P2-G App data for published apps:** a tiny key-value + member sign-in API for play links, plus a "Bring your own Supabase" doc.
- **P2-H Canvas plugin API:** scene-graph read/write for widgets and Flint skills ("describe a tool → Flint builds a widget").
- **P2-I Canvas versions:** named snapshots, restore, compare.
- **P2-J Publish a frame as a responsive page:** like Figma Sites, via `server/sitegen.js` and `server/publish.js`.

### Phase 3: expressive

- **Motion timeline:** per-layer keyframes, easing from the motion tokens, export CSS/JSON, render to video through the ad tools.
- **Vector pen and boolean operations:** Draw-like.
- **FigJam extras:** stamps, dot voting, timer, sections.
- **Light effects:** a few parameterized canvas effects that stay inside the flat rules.
- **Brand templates at scale:** components + a data table → many social images, Buzz-like.
- **Slides designed on the canvas.**

## 4. Beyond them (what none of the three does for friends building together)

1. **Agents as visible teammates on the canvas:** each member's Claude Code / Codex has a named cursor, claims frames (lanes from `server/claims.js`), and asks for approval before big changes.
2. **Voice to design:** say "make the header bigger and teal" in a huddle; Flint applies it to the selection and everyone sees it.
3. **Jam mode on the canvas:** a timed design jam; everyone gets a frame, then a vote (`server/jam.js`).
4. **Remix any play link into a canvas:** open a published app and get its screens as editable frames.
5. **Approvals on design changes:** a role owner's OK before a component change ships to code (`server/approvals.js`).
6. **One file for design, code, tasks and docs:** a frame links to its task, its doc spec and the commit that built it.
7. **Phone sketch to frame:** draw on the phone whiteboard and Flint turns boxes into a wireframe frame.
8. **Free forever for the core:** Flint's free tier builds from templates; friends bring their own AI for the heavy lifting; nothing is metered by credits.
9. **Self-hosted and offline-first:** designs live in your tribe and your GitHub; works on a plane.
10. **Live "design review" huddle:** voice + follow mode + pins + meeting notes captured automatically (`server/voice.js`, `server/huddlesum.js`).
11. **Game-aware design:** frames for HUDs and menus that export straight into the 3D/2D starters (`templates/starter-3d`, `starter-game`).
12. **Design-system drift check:** Flint flags colors and spacing that don't match the project's variables (`server/drift.js` pattern).
13. **Daily trending kit:** the newest open-source UI and motion libraries from the trending feed, one click into the project (`server/trending.js`).
14. **Learn by watching:** the Academy replays how a friend built a screen, step by step from the op log.

## 5. Sources

- [Figma blog: Config 2026 recap](https://www.figma.com/blog/config-2026-recap/)
- [Figma forum: Everything announced at Config 2026](https://forum.figma.com/product-updates-3/everything-announced-at-config-2026-55221)
- [Figma Help: Config 2026 guide for admins](https://help.figma.com/hc/en-us/articles/41301052048791)
- [CMSWire: Figma launches code layers and motion](https://www.cmswire.com/digital-experience/figma-launches-code-layers-motion-at-config-2026/)
- [Figma blog: Figma Make general availability](https://www.figma.com/blog/figma-make-general-availability/)
- [Anima: Figma Make, what it is and its limits (2026)](https://animaapp.com/blog/ai-design-en/figma-make/)
- [VentureBeat: Figma Make two-way GitHub integration](https://venturebeat.com/technology/are-designers-the-new-swes-figma-makes-new-two-way-github-integration-turns-designs-into-live-production-code-with-built-in-governance)
- [Data Studios: Grok Build free access, publishing, limits](https://www.datastudios.org/post/grok-build-free-access-app-creation-publishing-models-and-current-limits)
- [daily.dev: Grok team projects, private apps, Grok Build rollout](https://daily.dev/posts/grok-adds-team-projects-private-apps-and-wider-rollout-of-grok-build-zlbwox0fm)
- [vibecoding.app: Grok Studio review (2026)](https://vibecoding.app/blog/grok-studio-review)
- [Developers Digest: Grok Build developer guide](https://www.developersdigest.tech/blog/grok-build-developer-guide-2026)
- [Figma Learn: Figma Buzz](https://help.figma.com/hc/en-us/categories/31194838351767-Figma-Buzz)
- [Figma: Config 2025 press release (Sites, Make, Draw, Buzz)](https://www.figma.com/blog/config-2025-press-release/)
