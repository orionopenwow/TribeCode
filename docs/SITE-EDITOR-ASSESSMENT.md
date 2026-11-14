# Website editor: what was broken, what changed, what is left

feat/site-editor2, 14 Nov 2026. The editor is `app/ui/sitedesigner.js` (the model is `app/ui/sitecfg.js`, the page-side
helper `app/ui/sitedesigner-frame.js`). New here: `app/ui/siteparts.js` (element tools), `app/ui/sitesuggest*.js` and
`server/sitesuggest.js` (suggestions from the tribe). Nothing was rebuilt; the same editor was extended.

## How it was measured

`python app/test/e2e_site_editable.py` does three things:

1. **Audit** (no server): all 52 templates in `app/ui/sitetpl`, every page, plus every block in every layout, rendered the
   way the editor's preview renders it. Every visible text node, picture and icon is checked for a way to select and change it.
2. **Walk** (`--walk`, the real editor): every template is opened; every entry of every list must be a selectable box;
   three random pieces of text per template are typed over and must land in the right place of the design; the phone
   size must not scroll sideways.
3. **Live** checks of behaviour: selection, the toolbar, Esc, the right-click menu, undo and redo, reload, a phone.

## Before and after

| | Before | After |
| --- | --- | --- |
| Visible text that can be selected and typed over | 1,522 of 1,919 (79%) | all (1,939 of 1,939) |
| Of that, notes meant for the owner (explained on click, not editable) | 0 marked | 59 pieces marked (29 in form notes, 30 in the 10 licence credits) |
| Pictures that can be replaced | 146 of 146 | 146 of 146 |
| Icons that can be swapped | 6 of 13 | 13 of 13 |
| List entries that can be selected, moved, copied, removed on their own | 0 of 497 | 497 of 497 |
| Random typed edits that land in the right place (walk) | not measured | 156 of 156 |
| Templates that scroll sideways at phone size | 0 | 0 |

The 397 dead text nodes, by place: the menu (page names, section links, the site name, the menu's button) 209; contact form
(labels, button, note) 102; newsletter (button, note, hint in the box) 33; licence credit 30; footer page links 12; pricing
table lines 6; the small note under a link 2 (the "Opens Friday at 10am" line from the report); other buttons and dots 3.

## What was wrong in behaviour (all fixed)

1. Clicking words selected nothing: no outline, no tools, the panel did not change. Only buttons, pictures and sections could be selected.
2. A click in the page while on Style, Site or Check replaced that panel's content but left its tab lit.
3. Every edit reloaded the preview: a flash, the caret lost, sometimes a double load. The page is now swapped in place.
4. Switching Desktop, Tablet, Phone redrew the whole page.
5. Delete with a picture or a button selected removed the whole section.
6. Words in a label the site shows in capitals were saved in capitals.
7. A line break typed with Shift Enter vanished on the next redraw.
8. Words leaving the page during a redraw could be saved back over a change Flint had just made.
9. Esc dropped the whole selection, and a second Esc closed the editor. Esc now steps out: stop typing, the entry, the section, nothing.
10. Lists had only "Add" and "Remove last". No reorder, copy or remove of one entry, no keyboard.
11. A double-click on a page name in the menu left the page instead of renaming it.
12. Pages could only be renamed through Flint; no reorder or remove in the panel; one title and description for the whole site.
13. Empty optional fields (a note, a caption, an eyebrow) were invisible, so nobody could find them.
14. The form's button tried to submit inside the preview (a console error each time).
15. The saved state was hidden on phones. Six panel tabs ran into each other.
16. The section bar on the page used text glyphs; it and the new toolbar now share one set of stroke icons and never cover each other.

## One way to work on the page now

- **Click** anything: one outline, one small toolbar (smaller, bigger, bold, colour, line up, the entry's move/copy/remove, Ask Flint, More). Words take the caret at once.
- **Double-click or Enter** types in words a single click uses for something else (a page name in the menu). Double-click a picture replaces it.
- **Esc** steps out. **Right-click** is the same actions as a menu. **Delete, Ctrl D, Alt ↑ ↓** act on the selected entry or section.
- **The panel** shows the path (Page › Section › Entry › Words), only the controls that apply, and "What the tribe said about this".
- **Screen sizes**: "Show it on" Computer, Tablet, Phone for one element or a section; faded in the editor, gone on the published site.
- **Pages**: rename in the menu or in Site; reorder, remove; a title and description per page.
- **Flint**, no AI: "make this bigger", "change this to …", "hide this on phones", "move this up", "make all buttons rounder",
  "change the opening time to Saturday 9am", "fade this section in", "what should we update on the site?", "apply what we decided".
- **Suggestions**: changes drawn from chat, tasks, docs, updates, decisions and comments, with before/after and the source. Never DMs or private notes.

## Against other editors

OpenPage here is github.com/buildingopen/openpage (MIT), the model this designer already follows (`docs/OPENPAGE-PORT.md`,
credited in `NOTICE`). Its README was read again for this pass; no code was taken. Lovable and Framer were read from their
public docs and pages (docs.lovable.dev/features/visual-edit, framer.com/scale); Squarespace, Wix, Carrd and Webflow from
general knowledge of their editors. Nothing of theirs (text, logos, assets) is used.

| Ability | Seen in | TribeCode before | Now |
| --- | --- | --- | --- |
| Click any text and type | all | partial (79%) | have |
| Select any element, tools next to it | Lovable, Framer, Wix, Squarespace | missing | have |
| Path of what is selected, step out with Esc | Framer, Webflow | missing | have |
| Right-click menu, keyboard for entries | Framer, Wix | missing | have |
| Per-element size, colour, alignment, bold | Lovable (by prompt), Framer, Wix | missing | have (site palette only) |
| Reorder, copy, remove one entry of a list | Squarespace, Wix, Carrd | missing | have (buttons and keys; no drag) |
| Blocks with layouts, picker, drag sections | OpenPage, Squarespace | have | have |
| Themes, fonts, corners, spacing site-wide | OpenPage, all | have | have, plus button style |
| Hide per screen size | Framer, Wix, Webflow | missing | have |
| Separate layouts per breakpoint | Framer, Webflow | missing | missing |
| Pages and menu management, per-page SEO | all | partial | have |
| Entrance on scroll | Framer, Wix, Squarespace | missing | partial (fade, rise; published site, browsers with scroll timelines) |
| Picture fill, focus, alt text | all | partial | have (no drag-to-crop) |
| Forms that deliver | Squarespace, Wix, Framer | partial (email or a form link) | partial (same; labels and button now editable) |
| Ask an AI about the selection | Lovable | partial (sections) | have, with no AI needed |
| Multi-select, draw on the page for the AI | Lovable | missing | missing |
| Comments pinned on the page | Lovable, Framer | have | have |
| Undo, redo, versions | OpenPage, all | have | have |
| JSON config panel | OpenPage | missing | missing (Advanced, later) |
| AI site generation from a prompt | OpenPage (Gemini), Lovable, Framer | have (no AI needed; better with one) | have |
| CMS collections, password pages, custom domains | Framer, Squarespace | missing | missing (out of scope here) |
| Changes suggested from the team's own chat, tasks and docs | none found | missing | have |

## Round 2 (same day): closed from the list below

- The toolbar never sits on words, a picture or the section's bar: it tries above, below, the right edge, then the nearest free spot on screen.
- On a phone the editor's top bar is one row (Back, pages, saved, undo, redo, More).
- Drag an entry of a list by the grip on its toolbar; a line shows where it lands. Sections already dragged by their bar.
- Bold, slanted or a link on some of the words (select them, press B, I or the link). Kept in the words as `**bold**`, `*slanted*`, `[words](https://…)`.
- Any colour for one element (a picker next to the palette), space around it, and its font.
- Avatars and logo-cloud pictures obey "Show it on".
- Drag a selected picture inside its frame to choose what stays in view.
- "Play it" shows a section's entrance in the editor; browsers without scroll timelines play it once when the page opens.
- A share picture per page; a section can move to another page.
- A contact form or signup can deliver into the project's chat with no outside service (`POST /api/site-form/<project>`): off until switched on in the form's settings; a hidden field, a link limit and rate limits guard it; it only works while the tribe's computer can be reached from where the site is, and the panel says so.
- "Change the website" is a row in the permissions table (`site.edit`), so a group's own roles can hold it and a refusal offers Ask.

## Still open, most important first

1. **A true desktop preview.** Tried (the page laid out at 1280 and drawn smaller): clicks from the test tool did not land through the scaled frame, so it was taken out again rather than shipped unverified.
2. **Multi-select** (shift-click several things, then move, hide, style or remove them).
3. **Suggestions in other languages and with an AI.** The rules read English sentences and the project's main chat only.
4. **Flint's replies and suggestion titles are English**; the fixed labels are translated. The new Flint sentences are matched in English only (not yet through `app/ui/flintlang.js`).
5. **Rich text is three marks** (bold, slanted, link); no lists or headings inside one element, and the panel's words box shows the marks as typed.
6. **The form's inbox is the chat**: no list of past messages in the editor, no reply from the app, no CAPTCHA.
7. **Per-breakpoint layouts** (only show/hide per size).
8. **Undo does not bring back the exact selection** (it selects the section that changed).
9. **Menu links on a one-page site are made from the sections**: they cannot be reordered or hidden one by one.
10. **Copy and paste a section between pages or sites; JSON view of the design.**
11. **Under a council, "change the website" is not voted by default** (it is a row any role can hold; add it to what the council decides if a group wants every edit voted).

## Files

- `app/ui/sitecfg.js`: every visible word through `E`/`BT`; site words (`@|name`, `@|pages.N.title`); `b.es` per-element style;
  `style.hide/anim/w`; `itemOp`, `setElStyle`, `setBtn`, `setPageSeo`, `movePage`; `retime`, `openTimes`; `commandEl`; new `applyOps` steps.
- `app/ui/sitedesigner-frame.js`: selection, toolbar, entries found from keys (no per-template marks), in-place page swap, words as written.
- `app/ui/siteparts.js`, `siteparts.css`: path, element panel, lists, pages, right-click menu, keys.
- `app/ui/sitesuggest-core.js`, `sitesuggest.js`, `server/sitesuggest.js`: suggestions and "what the tribe said".
- Tests: `app/test/e2e_site_editable.py`, `app/test/e2e_site_suggest.py`; Flint batch `scripts/dev/flint-eval/editor2.js`.
