# Docs, Sheets and Slides (crafts)

TribeCode has three light editors built in. Flint and every agent can write in all of them.

| | Built in (light, zero dependencies) | Full power (optional, linked) |
|---|---|---|
| Docs | Files › ＋ New doc: rich text, live co-editing, comments, history | [WordCraft](https://github.com/storytold/wordcraft): .docx, track changes, mail merge, PDF |
| Sheets | Files › 📊 Sheet: grid, formulas, paste from Excel, CSV in/out | [GridCraft](https://github.com/storytold/gridcraft): .xlsx, 500+ functions, pivots, charts |
| Slides | Files › 🎞️ Slides: themes, present full screen, HTML/PDF export | [DeckCraft](https://github.com/storytold/deckcraft): .pptx, animations, masters |

## Why a hybrid

- **The built-in editors add about 60 KB** (sheet.js, deck.js, crafts.css) and need nothing installed. They cover
  what friend groups do most: plans, budgets, trackers, score sheets, pitch decks, jam presentations.
- **The files stay plain text.** A sheet is a Markdown table (cells starting with `=` are formulas). A deck is Markdown
  split by `---`. They read well on GitHub, diff cleanly, and agents edit them like any other doc.
- **The Craft apps are for heavy work.** WordCraft, GridCraft and DeckCraft are open source (MIT or Apache-2.0), written
  in Rust, and each ships a desktop app, a web build and an MCP server. TribeCode links to them instead of bundling
  them, so the TribeCode download stays the same size.

## Flint writes them

- In the Ask bar: "write a doc about our art style", "make a sheet for our snack budget", "make slides about the jam".
  The flame menu has Write a doc / Make a sheet / Make slides.
- Inside a sheet or deck: ✨ Ask Flint changes what's there ("add a tax column at 8%", "make slide 3 punchier").
- With a brain (built in, Ollama, or the host's cloud key) Flint writes the whole thing. In basic mode he starts you
  from a template (budget, rota, score sheet, tracker, pitch outline).
- Route: `POST /api/flint/make { kind: doc|sheet|deck, ask, body? }` (server/flint.js) returns `{ title, body }`.

## Agents write them

`list_docs` shows each file's `kind`. `write_doc` takes `kind: "sheet"` or `"deck"` for new files. `read_doc` explains
the format. Example sheet body:

```
| Item | Qty | Price | Total |
| --- | --- | --- | --- |
| Chips | 2 | 3 | =B2*C2 |
| Total | | | =SUM(D2:D2) |
```

Formulas: `+ - * / ^ &`, comparisons, A1 refs and ranges, SUM AVERAGE MIN MAX COUNT COUNTA MEDIAN PRODUCT IF AND OR
NOT ROUND ABS SQRT LEN UPPER LOWER CONCAT TODAY SUMIF COUNTIF. Errors show as #DIV/0!, #VALUE!, #NAME?, #CYCLE!.

## Linking the Craft apps today

1. Install the app from its GitHub release (Windows, macOS, Linux).
2. Let your agent drive it: `claude mcp add gridcraft -- gridcraft-cli mcp` (same for `wordcraft-cli`, `deckcraft-cli`).
3. In TribeCode, Agents Hub › Apps on this computer › **Add a special connection**, pick the app and its export folder.
   New files it saves land in Files with a note in chat.
4. Download a sheet as CSV or a deck as HTML/Markdown from TribeCode to open it in the Craft app.

## Next

- `.xlsx` / `.docx` / `.pptx` import and export through the Craft apps' web builds, downloaded as an optional pack
  (server/packs.js) only when someone asks, served from the host.
- Charts in sheets (a small SVG bar/line chart from a selected range).
- Live co-editing per cell for sheets (today: saves merge cell by cell when two people edit at once).
