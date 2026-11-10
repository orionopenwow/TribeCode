# Polish audit: builder surfaces vs best-in-class (2026-11-10)

How this was done: every builder surface was screenshotted at 1440×900 and 390×844 with realistic content: the
Design canvas (empty, café sample, components, Inspect, a right-click), the focused Preview with Flint and the
property sheet, the website template gallery and its Easy/Comfortable/Pro picker, comment pins, Task Board,
Marketplace, Studios and the shortcut sheet. Each one was compared with the published behaviour and screenshots of the
tool that sets the bar for that surface: Figma Design and Figma Make (canvas, Inspect, components), Framer and Webflow
(site editing, empty states), Squarespace (template gallery, skill levels), Canva (presets, quick starts), Grok Build,
Lovable and Bolt (prompt-to-app panel). Sources are at the end. Related plan: `docs/EDITOR-PARITY.md`.

Ranking: **High** means people hit it in their first five minutes and it changes what they believe the tool can do.
**Medium** means it's a daily friction for regular users. **Low** is finish.

## 1. Design canvas

| Rank | What's missing or rough | Best-in-class bar | Fix | Status |
|---|---|---|---|---|
| High | Right-click did nothing (the browser menu was suppressed and nothing replaced it). | Figma's layer menu: copy/paste, order, group, component, hide/lock, rename, select parent; Framer and Canva have the same. | Right-click menu on layers, on the empty canvas (paste, zoom, new frame presets) and on rows in the layers panel. Every item shows its shortcut. | Done |
| High | No way to line things up: two or more layers had no align or distribute. | Figma's align bar at the top of the right panel when several layers are selected, plus Alt A / D / W / S / H / V. | Align bar (left, centre, right, top, middle, bottom, spread horizontally/vertically) shown for multi-select; Alt shortcuts; same actions in the right-click menu. | Done |
| High | Starting a frame meant guessing sizes; the blank-canvas card only offered the sample. | Figma's frame presets (phone, tablet, desktop, social), Canva's size picker. | "New frame" presets on the empty right panel, three quick starts on the blank-canvas card, five in the empty-canvas right-click. | Done |
| High | No rotate handle (rotation only by typing degrees). | Figma: hover just outside a corner to rotate; Shift snaps to 15°. | Round handle off the top-right corner; drag to rotate, Shift snaps to 15°; one undo step; hidden for groups and auto-layout children. | Done |
| Medium | A friend's dragged layer only jumped when they let go. | Figma shows others' moves live. | Drag positions ride along with the cursor message (throttled, max 40 layers) and paint as a dashed preview in the mover's colour until the real change lands. Server only relays it for people who can edit. | Done |
| Medium | Recolouring a design meant clicking every layer. | Figma's "Selection colors" in the right panel. | Selection colors: every fill, stroke and text colour inside what's selected, with a count; change one and every use changes, in one undo step. | Done |
| Medium | Tools gave no hint about what to do next. | Figma, Framer and Canva show a one-line hint for the active tool. | One-line hint above the toolbar while a drawing tool is active (Shift behaviour, where presets are). | Done |
| Medium | Frame names drew on top of each other and over neighbouring frames when zoomed out (very visible on phones). | Figma hides labels that don't fit. | A name that would overlap another name or another frame is skipped; the selected frame keeps its name. | Done |
| Medium | Exported CSS repeated raw hex colours. | Figma Dev Mode shows variables; Make's code uses tokens. | Export puts each colour once as a CSS variable on `.tc-design` (`--color-1`…) and the rules use `var()`, so the design can be rethemed in one place. Inspect still names TribeCode tokens. | Done |
| Medium | Ctrl / sheet listed no canvas or preview keys. | Figma's shortcut panel is filtered to where you are. | "Design canvas" and "Preview" sections; the section for where you are comes first and is marked "here". | Done |
| Low | No snapping toggle, no pixel grid at high zoom. | Figma: pixel grid past 400%, snap toggle. | Phase 2. | Open |
| Low | No colour styles or variables that persist across the file (Phase 2 "variables & modes"). | Figma variables with light/dark modes. | Needs a document-level store in `server/canvas.js` (unknown node types are dropped today). Selection colors + CSS-variable export cover the quick win. | Open |

## 2. Focused Preview + Flint pane

| Rank | Issue | Bar | Fix | Status |
|---|---|---|---|---|
| Medium | The property sheet sits below the activity log; on short windows it needs a scroll before you can change anything. | Framer and Webflow keep properties docked and always visible. | Make the sheet a tab beside the log when an element is picked. | Open |
| Low | Edit and Comment are separate toggles with similar icons. | Figma Make: one mode switch (Edit / Comment / Inspect). | Segmented mode control. | Open |

## 3. Website templates (gallery + Easy/Comfortable/Pro)

| Rank | Issue | Bar | Fix | Status |
|---|---|---|---|---|
| Medium | The site name defaulted to the raw folder name (`cafe`, `ember-socks`). | Squarespace prefills your business name properly. | Folder names read as titles ("Ember Socks"); a placeholder appears when empty. | Done |
| Low | Long card descriptions are cut mid-word with an ellipsis. | Squarespace shows a short line plus "Preview". | Write one-line card blurbs in the template manifests. | Open |

## 4. Task Board, Marketplace, Studios

These already match the bar after this week's redesigns: one hero card, real empty states, one primary action per row.
Small notes: Marketplace's "Trending" shelf cuts the fifth card at 1440px (scroll affordance only); Studios is fine.

## 5. Phase 2 quick-win checklist (from EDITOR-PARITY.md)

- [x] Multi-select align / distribute (part of Figma's right panel)
- [x] Frame presets
- [x] Colours as CSS variables in export (step toward variables)
- [x] Selection colours (step toward colour styles)
- [x] Live drag visibility for collaborators
- [x] Rotate handle
- [ ] Project-level light/dark tokens (needs the document store; see above)
- [ ] Click-through prototypes (interactions between frames)
- [ ] Responsive rules (min/max width, breakpoints per frame)
- [ ] Version history panel for designs (the app has git history for code; designs need snapshots)

## Sources

- [Figma shortcuts: aligning objects (Steve Kinney)](https://stevekinney.com/courses/figma/aligning-objects)
- [Figma keyboard shortcuts (Noble Desktop)](https://www.nobledesktop.com/shortcuts/figma/pc)
- [Mastering the right panel in Figma (UX Planet)](https://uxplanet.org/mastering-the-right-panel-great-figma-tips-and-tricks-for-every-product-designer-a7598138bea6)
- [40 Figma tips that make you faster (UX Collective)](https://uxdesign.cc/40-figma-tips-that-make-you-faster-88a13b43fae)
- [Framer review 2026 (DEV)](https://dev.to/jangwook_kim_e31e7291ad98/framer-review-2026-the-ai-website-builder-designers-actually-want-complete-guide-33gn)
- [Empty state design (Framer Websites)](https://framerwebsites.com/blog/empty-state-design)
- [Lovable user flow (Supademo)](https://supademo.com/user-flow-examples/lovable)
- [Getting started with Lovable (SitePoint)](https://www.sitepoint.com/getting-started-with-lovable/)
- [SaaS activation surfaces and empty states (Lazyweb)](https://experiments.lazyweb.com/research/web-saas-activation-surfaces-empty-states)
- Figma Config 2026, Figma Make and Grok Build sources: see `docs/EDITOR-PARITY.md`.
