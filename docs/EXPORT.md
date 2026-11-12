# Exporting docs, sheets and slides

Every doc, sheet and deck in Files exports from its own menu (app/ui/exporter.js). Nothing leaves your tribe unless you choose to.

| From | Files | Google |
| --- | --- | --- |
| Doc (⋯ › Export) | Word (.docx), Markdown, web page, print or save as PDF | **Copy for Google Docs**: copies with formatting and opens a new Doc (docs.new); paste once |
| Sheet (⬇ Export) | Excel (.xlsx, formulas kept with their values), CSV | **Copy for Google Sheets**: copies the table and opens a new Sheet (sheets.new); paste once |
| Slides (⬇ › PowerPoint or Google Slides) | PowerPoint (.pptx, 16:9), one web page, PDF, Markdown | **Open in Google Slides**: saves the .pptx and opens a new deck (slides.new); File › Import slides |

- The files are built in the browser with no add-ons: a small ZIP writer plus the minimal Office XML each format needs. Word, Excel, PowerPoint, LibreOffice, Google and Apple's apps open them.
- **Save to Desktop** (the desktop app on the host computer): writes to `Desktop/TribeCode Projects/<project>/Exports/` and opens the folder. Elsewhere the file downloads.
- Start one fast: the chat's **+ › Doc, sheet or slides**, the dashboard's quick actions, or Ctrl K › New doc / New sheet / New slides.

## Proof of work (Flint)

"Export the proof of work" (or the end of Help › Watch Flint build) packs a project's code, docs, design, chat, tasks and timeline into `<project>-proof.zip`, and the whole tribe into `tribe-<name>-proof.zip`, with the same ZIP writer. The host keeps them in `<tribe folder>/exports/`; they download in the browser too. Layout: [FLINT-TIERS.md](FLINT-TIERS.md#watch-flint-build-and-proof-of-work).

## Planned: Google Drive

Link a Google account (the Google sign-in already in Settings › Sign-in) with the `drive.file` scope, which only touches files TribeCode creates. Then: Save to Drive as a Google Doc, Sheet or Slides (converted on upload), and keep a linked copy that updates when the project's file changes. Needs a Google Cloud OAuth client and Google's app verification before public launch.
