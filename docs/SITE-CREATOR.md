# The website designer: how it is laid out, and how fast it is

Pass 4 (`feat/p4-site`, 16 Nov 2026). The designer is `app/ui/sitedesigner.js` and `.css`; the page-side helper is
`app/ui/sitedesigner-frame.js`; the model is `app/ui/sitecfg.js`. Earlier work is in `docs/SITE-EDITOR-ASSESSMENT.md`
(what can be selected and typed over) and `docs/WEBSITE.md`. The test for everything on this page is
`app/test/e2e_site_polish.py`.

## One row

The top bar is one row at every width. It holds what is used all the time; the rest is under **More**.

| In the bar | Under More |
| --- | --- |
| Back, the site's name, the pages | Look: Dark or Light, the theme |
| Saved state, who else is here | Full width (a 1280 px page) |
| Undo, Redo | Templates |
| Desktop, Tablet, Phone | Save design |
| Zoom out, the zoom, Zoom in, Fit | Code |
| Comment, Keyboard shortcuts | Suggested changes (with a count when some wait for you) |
| More | Ask a free AI |
| Download HTML (and its menu: .zip, Publish to the project) | Have my agent do it |

As the window narrows, labels go before controls do: the device names become icons (under 1560 px), Back becomes an
arrow (1320), the site's name and Fit leave (1160). On a phone the row is Back, the pages (they scroll sideways), the
saved state, Undo, Redo, More and a download button; Comment and Keyboard shortcuts move into More. The row is 48 px
tall there and the page starts right under it.

The right panel has four tabs that fit one row in a 320 px panel: **Edit**, **Ideas** (Suggestions and Comments),
**Style** (Look and Site settings) and **Check**. A tab that holds two things remembers which one was open.

The strip that said "You can change this directly" is gone for people who can. It shows when it has something to say:
your changes need someone's OK, you can only watch, or changes are waiting for your OK ("1 change is waiting for your
OK", with **Look at them**). The same rule applies in App Creator, Motion Studio and the Launch kit, because the strip
is shared (`app/ui/changes.js`).

## Zoom

Zoom out, zoom in, **Fit** and 100% are in the bar; Ctrl + and Ctrl − zoom, Ctrl 0 goes back to 100%, Shift 1 fits the
width, and Ctrl with the wheel (a trackpad pinch) zooms from inside the page or the space around it. The steps are
25, 33, 50, 67, 75, 90, 100, 110, 125, 150 and 200%.

The preview keeps its real width while it is drawn smaller or larger, so the layout never changes with the zoom.
Clicking, typing, dragging and the right-click menu work at any zoom. Full width plus Fit shows a whole 1280 px page
in the window instead of scrolling sideways.

## Code

More › Code opens one sheet with three parts:

- **HTML**: the selected section exactly as it goes into the downloaded and published page, indented, with Copy.
- **CSS**: the rules of the site's stylesheet that name that section's classes, with Copy.
- **Your own CSS**: a box of CSS for the whole site. It is added at the end of the site's stylesheet, shows in the
  preview at once, is one Undo, and stays in the download, the .zip and the published site.

Your own CSS is cleaned in `sitecfg.cleanCss` whenever a design is normalised, so the server cleans it too. Removed:
`@import`, `@charset`, `@namespace`, `@font-face`; `url()` unless it is a picture inside the page (`data:image/…`),
a file under `assets/` or a `#fragment`; `expression()`, `behavior`, `-moz-binding`, `javascript:`; angle brackets
and backslash escapes. It is capped at 20,000 characters. The site is its own document in the preview frame, in the
export and when published, so the CSS cannot reach TribeCode's own screens.

## Space above and below a section

Select a section: two small handles appear at its top and bottom edge, each showing a number. Drag the top one for
the space above the section's content, the bottom one for the space below. The number snaps to the scale 0, 8, 16, 24,
32, 48, 64, 80, 96, 128, 160 and updates while you drag; letting go is one Undo. Arrow keys on a focused handle step
along the scale, a double-click gives the section the site's own spacing back, and Esc cancels a drag. Phones draw
the space at 65%, as they do for the site's own spacing. The Tight, Normal and Roomy buttons in the panel still set
both at once. There is no gap between the things inside a section in the model yet, so there is no handle for it.

## Shortcuts

`?` (or the ? button) opens the list. Everything in it works.

| Keys | What |
| --- | --- |
| Ctrl Z, Ctrl Shift Z | Undo, Redo |
| Enter | Type in the selected words |
| Ctrl D | Duplicate the selected section or entry |
| Delete | Remove the selected section or entry |
| Ctrl C, Ctrl X, Ctrl V | Copy, cut and paste a section, on any page (and in another site on this device) |
| Alt ↑, Alt ↓ | Move the selected section or entry |
| H | Hide or show the selected section |
| Right-click | Everything you can do with it |
| ↑, ↓ | With a section selected: select the one above or below |
| Shift click | Select several things |
| Esc | Stop typing, step out, close |
| 1, 2, 3 | Desktop, Tablet, Phone |
| Ctrl +, Ctrl − | Zoom in, Zoom out |
| Ctrl 0, Shift 1 | 100%, Fit the width |
| C | Comment mode |
| Ctrl S | Save a version |

Shortcuts used to work only while one of the designer's own controls had the focus. They now work after a click on
empty space too.

## Safety nets

- Picking a template when the website already has a design asks first: **Keep my site** or **Start over**. This is
  true in the designer's own gallery, the Design creation flow and the shelf.
- A suggested change to the website carries a before and an after picture of the page, drawn on the device from the
  published HTML, beside the list of what changed.
- A change of your own that did not come from the open designer (you approved a suggestion from the list, your agent's
  proposal was applied) now shows in the designer at once. It used to wait for a reload.

## Speed

Measured by `e2e_site_polish.py` in headless Chrome on the build machine, with the server on the same machine. Three
runs; your numbers depend on the computer and the network.

| What | Time |
| --- | --- |
| The designer is on screen after it is asked for | 10 to 11 ms |
| The page inside it is ready to edit | 255 to 395 ms |
| Open, end to end, from a test's point of view | 340 to 660 ms |
| First open of a new site from a template (fonts and the template load) | 0.8 to 1.9 s |
| Click the headline, type, and the design holds the new words | about 1.1 s (0.9 s of it is the pause that waits for you to stop typing; the page shows each letter at once) |
| An edit reaches a friend who has the designer open | 0.4 s (1.1 to 1.3 s before this pass) |

One thing was slow and is changed: a save waited 600 ms after the last change before it left. With a friend in the
designer it now waits 250 ms, so their copy follows sooner. Alone it still waits 600 ms, because nobody is watching
and each save sends the whole design.

## Left

- Zoom has no pan with Space and drag; the page scrolls inside its frame instead.
- The code view reads; it does not edit the section's HTML. Your own CSS is the way to change what the tools do not reach.
- No handle for the gap between things inside a section (the model has none).
- Flint's replies in the designer, and the status words in the saved slot ("Zoom 50%", "Space above: 48"), are English.
- The before and after pictures are drawn in Chrome and Edge; Safari may refuse to draw them, and then the list of
  changes shows alone.
