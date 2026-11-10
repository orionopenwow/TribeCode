# TribeCode design system

**Tactile Matte Developer UI × Editorial Flat Vector.** Clean, high-craft precision. TribeCode deliberately rejects the usual "AI-generated / vibecoded" tropes: no neon outer glows, no glassmorphism or backdrop blur, no chaotic multi-stop gradients.

## 1. Style

- **Zero-gloss flat matte surfaces.** Every element (brand mark, cards, buttons) is unshaded solid geometry: no specular highlights, no drop-shadow bloat. Depth comes only from **background luminance steps** and **crisp 1px borders**. A barely visible matte grain on the canvas is allowed; glowing radial gradients are not.
- **Faceted geometric silhouette.** Icons (the flame, the brackets) use sharp, intentional angular cuts that suggest structure and code, with no internal 3D facets. Organic warmth (the campfire) meets the rigid precision of syntax.
- **Editorial spot illustrations.** Flat, minimalist mid-century/editorial vector: people and objects built from clean, overlapping matte shapes. No tech renders, no 3D, no gradients.
- **Utilitarian bento architecture.** A disciplined modular bento grid with hairline borders, a geometric + monospaced type pairing, and generous negative space. It should feel like a native desktop IDE.

## 2. Palette: "Warm Hearth in a Dark Terminal"

Thermal contrast and semantic clarity: a deep, low-fatigue obsidian environment with warm, human accents. No cold cyberpunk blues, no purple AI gradients.

| Token | Name | Hex | Use |
| --- | --- | --- | --- |
| `--canvas` | Obsidian Slate | `#12151A` | App and page background. Zero-glare, low eye strain. |
| `--surface` | Charcoal Card | `#1B2028` | Bento cards, sidebars, code panes: hierarchy without shadows. |
| `--surface-2` | (step up) | `#222833` | Inputs, hovered rows, nested panels. |
| `--border` | Muted Steel | `#2A313C` | Every 1px boundary. |
| `--brand` | Ember Orange | `#F26B1D` | Primary CTAs, the flame, AI sparks, "Code" in the wordmark, active inline links ("Invite →"). |
| `--live` | Signal Teal | `#38C6B1` | Live state: connected pills, progress bars, local-brain nodes, active mic rings. |
| `--peer` | Huddle Indigo | `#6C7CFF` | Secondary peers and presence avatars, distinct from the host. |
| `--white` | Stark White | `#F8FAFC` | Headlines, the `< >` brackets, high-contrast text. |
| `--body` | Cool Slate | `#94A3B8` | Body copy and secondary labels. |
| `--online` | | `#3BD16F` | The small "online" dot and word only. |
| `--alert` | | `#FF6F8E` | Errors, drift and destructive actions. Use sparingly. |

Light mode mirrors the same rules: paper canvas `#F4F5F7`, white cards, `#DADFE6` hairlines, ink `#12151A`, the same brand/live/peer accents.

**Themes** (Settings › Theme) are custom-property overrides only, never new components.
- TribeCode Dark (the default) and Light are the base modes. The others are Midnight, Nordic, Nightshade, Campfire, Solar Dark, Solar Light and High contrast.
- Each theme is a base mode plus `data-theme` on `<body>`. The list is in `app/ui/themes.js` and the values in `app/ui/themes.css`.
- Ember stays the action color in every theme.
- Body text must reach 4.5:1 on every surface. Run `node scripts/theme-contrast.js` after changing any value.
- Use variables (`--canvas`, `--surface`, `--text`…), never hard-coded hex, so new UI follows every theme.

## 3. Rules for building

- **No** `backdrop-filter`, **no** glow `box-shadow`, **no** gradient fills on surfaces or text. A flat `box-shadow: 0 0 0 1px var(--border)` hairline is fine. Popovers and modals sit on a flat scrim and get a border, not a shadow.
- **Strict two-color pairing per component.**
  - Primary button or badge: solid `#F26B1D` fill + `#FFFFFF` text.
  - Secondary button (e.g. "Read Docs"): `#1B2028` fill + `#2A313C` border + white text.
  - Live pill: `#1B2028` fill + teal dot/text.
- **Typography:** headlines in Stark White (Inter Display ExtraBold, tight tracking); body in Cool Slate (Inter); labels, eyebrows, stats, paths and code in monospace (`JetBrains Mono`, `Cascadia Code`, `SF Mono`, `ui-monospace`). Ember Orange in text is reserved for the brand compound word ("Code") and active inline links.
- **Radii:** 8px controls, 12px cards, 16px panels/windows. Corners on the brand mark stay sharp.
- **Motion:** short and functional (120–220 ms ease-out), opacity/translate only. Respect `prefers-reduced-motion`. A speaking indicator is a solid teal ring, not a halo.
- **Icons:** 1.6px line icons (Lucide style); only status dots, avatars and the flame are filled.

## 4. Section clarity

Every screen reads top to bottom as a few clear sections, not a wall of cards.

- **Each section gets a mono eyebrow and a clear title.** The eyebrow (`.eyebrow`: monospace, 10.5px, uppercase, `.08em` tracking, faint) says what kind of thing it is ("Needs you", "Living notes", "Suggested"); the title (`.sec-head h2`: Inter Display, bold) says what it is ("1 approval", "The project journal", "Up next"). Never repeat the same word in both, or in the screen's header.
- **One hero card per screen.** Only the single most important thing gets the raised surface (`#1E242D`), the 1px border and the 3px Ember edge (`.hero-card`): the approvals that need you on Updates, the pinned repo on Docs, today's focus on Home. Everything else is a plain surface card or a list.
- **Long text gets a reading layout.** Line-height 1.6, about 65 characters per line (`max-width: 65ch`), its own calm space. Docs, journals, approval details and standups use it.
- **Spacing: generous on desktop, tight on phones.** Sections sit 40px apart on desktop and 26–28px on phones; phones drop page headers and repeated labels so content starts near the top.
- **Docs:** the pinned repo is the hero, with the living notes journal (decisions, voice notes, approvals, files) right under it, then files, then screenshots.

## 5. Flare

The UI stays calm and bare, but each screen's **one hero area may carry real imagery** to give it life and identity: README art, screenshots of the running app, game sprites, avatars.

- **Always real content, never decoration.** The picture comes from the project itself. The pinned repo hero (`app/ui/repohero.js`, `server/thumb.js`) uses, in order: the first real image in the repo's README (badges skipped; a GitHub remote without one uses GitHub's own card for the repo), else the latest screenshot of the app, else a flat tile with the repo's initials on the project color.
- **Only the hero.** One image area per screen, filling the top of the hero card (`object-fit: cover`, about 16:9 on desktop and 2:1 on phones). Lists and cards stay text.
- **Still flat.** No glows, gradients, vignettes or blur on or around the image. A 1px border separates it from the rest of the card.
- **Text never sits on the picture.** Titles, branch and status sit on a solid raised band under the image (or a solid chip over it, like "From the README"), never on a scrim.

## 6. Chat

Telegram-style bubbles laid out edge to edge like Instagram's web DMs (references: `design/inspiration/chat-ref-1..3.png`; code: `app/ui/chatx.js`, `app/ui/bubbles.css`).

- **Sides.** Others hug the left with a 30px avatar on the last bubble of their group; yours hug the right with no avatar or name. Max bubble width 68% (82% on phones).
- **Groups.** Consecutive messages from one person within 10 minutes form a group: 2px apart inside, 10px between groups. The name (member color, Teal + the Claude glyph for agents) sits in the first bubble only. Corners are 14px, 6px between bubbles of a group, 4px at the avatar corner of the last one; a single short line of yours is a full pill.
- **Inside the bubble.** Time at the bottom-right, inline after short text (plus ✓, or ✓✓ in Teal once your agent has read it). Reply quotes with a 3px bar in the quoted person's color. Reactions as chips with up to three tiny faces (else the count), yours with an Ember edge.
- **Media.** Voice notes: a 44px Ember play button, waveform, "0:09 · 35.5 KB", transcript under it. Images: a rounded card with the time on a solid pill. Vote and gist cards keep their own card in the same alignment.
- **Separators.** Date pills ("Today", "Yesterday", "July 20") and a quiet centered time between bursts 30+ minutes apart. System lines are small centered pills.
- **Tokens.** `--bubble-other` #1E242D with #2A313C border, text #E7EAF0, meta #8391A6 (4.9:1). `--bubble-mine` #3A2416 (a flat Ember tint, chosen over Indigo so "yours" reads as the brand) with #5A3218 border, text #F4EDE8 (12.5:1), meta #C79C80 (5.9:1).
- **Desktop chrome.** A header bar (avatar · channel + subtitle · huddle, share screen, info) and one full-width composer pill (emoji · message · mic · image · +).

## 7. Phones

See [MOBILE.md](MOBILE.md#the-phone-layout) for the phone layout (rack, panel, composer, sheets). The same tokens and rules apply; motion is the 120–220 ms set above, and everything stops under `prefers-reduced-motion`.

Tokens live in [`app/ui/tokens.css`](../app/ui/tokens.css) (app) and at the top of `site/styles.css` (website).

## 8. Navigation

- **Left sidebar = communication and core only.** Under the project header (the workspace switcher: tribe, the project's views Overview · Board · Repo · Timeline, pinned projects, collaborative rooms, personal scratchpad, new project, paste an invite link) sit four rows: **Chat & Streams** (#general, #agents and DMs fold out under it), **Docs & Files**, **Tasks & Board**, **Agents Hub**. Settings and Invite friends sit at the bottom. Nothing else gets a row: Updates live in the bell, the huddle in the chat header's call button (the sidebar shows it only while live, the call button gets a Teal dot), Capture to notes in the profile menu.
- **Workspaces are tabbed.** Tasks & Board (Board · Bugs · Proposals · Milestones · Calendar · Repo · Visuals, plus Roles and Requests when they apply) and Agents Hub (Agents · Your agents · Ownership · Conflicts · Hand-offs · Reviews · Daily plan · Secretary) open on their last tab. The tab bar is a mono eyebrow over a flat row with a 2px Ember underline on the current tab. Deep links: `#/tasks/bugs`, `#/agents/conflicts`. Breadcrumbs read View › Tab.
- **No project selected:** the Global Hub (`#/hub`) is the main screen and the four rows become Hub · Global docs · All repos · Agent fleet.
- **The right panel is contextual.** "In the room" lists people, agents and helpers (Secretary, local model, repo autopilot) and the private scratchpad; clicking an agent opens its detail there (task, hand-offs, conflicts, reviews, recent timeline). It hides with the X in its own corner and comes back from a slim tab on the main column's right edge.
- **The Guide is tucked away** (`app/ui/guide.js`, pages in `docs/guide/`): no row, no floating button. It opens from the profile menu (phones: the profile sheet), Ctrl K and the "? Guide" link at the bottom of Settings, as a reading layer like the Workshop.
- **Top right:** the update icon (only when an update is ready) · bell · profile (rightmost) · window lights.

## 9. Illustration and motion standard

Every explainer, infographic or illustration on the site or in the app is built to the fidelity of the hero widget (the animated app mock at the top of the website). The reference examples are the hero (`site/index.html` `.stage` + `site/main.js`) and the "How vibecoding works" scene (`#vf-scene` + `site/vibe-anim.js`).

- **Real UI, real text.** Show the actual interface: readable labels, chat lines, tool rows ("Edited index.html +27 −3"), buttons with their real names. No grey placeholder bars standing in for content.
- **Real steps, believable data.** Tell one concrete story with named people (Maya, Jay, Orion), a real-sounding project (a bake sale page, Pixel Quest) and plausible numbers. Never show prices or invented metrics as if they were TribeCode's own.
- **Readable beats.** Animate in steps a person can follow: someone asks, the AI thinks, a tool row appears, the result shows up. Hold the finished state for a few seconds before looping. Nothing moves so fast it can't be read.
- **The markup is the final frame.** Write the finished state in HTML so it reads with no JavaScript and holds still for `prefers-reduced-motion`. The script only hides steps and plays them in.
- **Reserve the space.** Hide steps with `visibility`, not `display`, so the layout never jumps while it plays.
- **Phone layout.** Design the 390 px version on purpose (stack the parts, shorten labels), with no horizontal scroll.
- **Words for everyone.** Mark the visuals `aria-hidden` and describe the whole story in a figcaption or `aria-label`.
- **Flat matte rules apply.** 1px borders, depth from luminance steps, palette colors only. Pixel art uses `shape-rendering: crispEdges` and shades with darker steps of the same color, never glows, blur or gradients.
- **Lightweight.** No libraries. DOM and inline SVG, a little CSS, one small script. Animate only while the scene is on screen (IntersectionObserver), and stop timers when it leaves.

## 10. Motion and agent-ready tokens

**Motion tokens** live in `app/ui/motion.css`. Use them instead of raw durations:

| Token | Value | For |
|---|---|---|
| `--dur-instant` | 80ms | press feedback, tooltip out |
| `--dur-quick` | 140ms | hover, toggles, section cross-fade |
| `--dur-base` | 200ms | drawers, sheets, toasts, menus |
| `--dur-slow` | 320ms | large panels |
| `--ease-out` / `--ease-in` / `--ease-in-out` | curves | arriving / leaving / moving A to B |

- Animate named properties, never `transition: all`. Lead with opacity and move 2 to 8px (`--rise`), no blur and no scale bounce.
- Things arrive on `--ease-out` and leave faster on `--ease-in`.
- Section switches go through `TribeMotion.swap(fn)` (`app/ui/motion.js`): a short View Transition cross-fade where the browser supports it, an instant swap otherwise.
- `prefers-reduced-motion` sets every duration to 0. The finished state must always read without motion (see §9).

**Agent-ready tokens.** `docs/design-tokens.json` is the machine-readable copy of this system (W3C Design Tokens format: `$value`, `$type`, a short `$description` of what each token is for, dark and light values, and the `var(--…)` to use). It also lists the core rules. AI agents read it, together with `AGENTS.md`, before they write UI, so every member's agent builds screens that match.

- The CSS is the source of truth. After changing a color, radius, font or motion token, run `node scripts/dev/design-tokens.js`.
- `npm test` runs it with `--check` and fails if the JSON is out of date.
