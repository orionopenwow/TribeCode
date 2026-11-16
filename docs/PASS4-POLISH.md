# Pass 4 polish: what a beginner's walk through the two creators found

2026-11-16, on `fix/p4-polish` (from `integ10` at 43c5f332). The website creator and App Creator were walked in a real
browser at 1440 and 390 px, in English and Spanish, dark and light, alone with no tribe and with a second person, with
every lesson's Show me pressed. The comparison with Figma and Lovable is in `docs/CREATORS-VS-RIVALS.md`.

Severity: **high** loses work or blocks a task; **medium** confuses or hides something; **low** polish.

| # | Where | What | Severity | Status |
|---|---|---|---|---|
| 1 | Motion Studio | Esc with a sheet open over it (the requests list) closed the studio under the sheet | high | Fixed: a sheet or dialog on top owns the keys. Test in `e2e_cowork_editors` |
| 2 | App Creator, Motion Studio, Launch kit | Someone who can change the tool directly had no way to the requests list once the strip was hidden | medium | Fixed: a Suggested changes button (More in App Creator) with a count. Tests in `e2e_app_plus`, `e2e_cowork_editors` |
| 3 | Website AI proposals | A helper's website proposal used its own Apply/Decline list while an app proposal was a change request | medium | Fixed: `site_propose` makes a change request (before and after, a person approves, Undo on the request). Test in `e2e_site_studio` |
| 4 | Make it beautiful | With only the tribe's AI key the button sent a brief that nothing picked up | medium | Fixed: only a member's own helper counts; otherwise the honest line and Polish it |
| 5 | Website designer | "Have my agent do it" (More) and "Make it beautiful" (Flint) were two names for one thing | medium | Fixed: one name, one sheet. Test in `e2e_site_polish` |
| 6 | Lessons | With the template shelf open from step 1, Show me on a later step rang a control hidden behind it | medium | Fixed: Show me closes the shelf |
| 7 | Lessons on a phone | Six steps pointed at controls that are under More on a phone and rang nothing | medium | Fixed: a second place to ring. Test in `e2e_lessons` |
| 8 | Lessons | Three Power tools steps were still hidden (spacing, Polish it, Make it beautiful) | medium | Fixed: all 16 are live; none waits |
| 9 | Where it lives, no tribe | Said the design is "real files in the project's folder" and, under it, that it is kept in the browser | medium | Fixed: the first line says what is true with no tribe |
| 10 | Website designer | Tab walked out of the full-screen designer into the app behind | medium | Fixed: Tab wraps inside it (the app behind is not made inert, so the Design flow dock, toasts and sheets keep working). Test in `e2e_site_polish` |
| 11 | App Creator screen map | Link lines ran across screens; a notice covered the hint | low | Fixed: lines travel in the gaps with real card heights; the hint moved to the top. Test in `e2e_app_plus` |
| 12 | Website designer, phone | The "Saved" words covered the second page tab | low | Fixed: a dot (full when saved, a ring while saving). Test in `e2e_site_polish` |
| 13 | Flint header | Read "basic mode · no model" while a model on the device was answering | low | Fixed: it agrees with the badge on each reply |
| 14 | App Creator, phone | The Flint sheet said "Flint" twice | low | Fixed |
| 15 | App Creator with a friend | An edit took 0.56 to 0.69 s to reach them | low | Fixed: 0.29 to 0.33 s (a save waits 250 ms when someone else is in) |
| 16 | Spanish (and the other six) | English tooltips, "Copied 3 parts", "Zoom 50%", Flint's chips in App Creator, "Filled from your project", "Saved · just now", the Flint status line | low | Fixed: 43 rows and 4 patterns; 20 lesson strings added to the website's languages |
| 17 | Lessons | Show me with nothing to ring said "Open a project first" while a project was open | low | Fixed: it says to do the earlier steps first |
| 18 | Flint | Did not know Where it lives | low | Fixed: "where is my site saved", "open the folder" and six more, with no AI; a step in Take it online |

## Left

- **Two website template galleries.** Design › Website opens "Start a site" (16 designs); the designer's own More ›
  Templates opens "Start from a template" (52). One way would be better; it is a product decision which one stays.
- **The template gallery keeps the editing bar.** Zoom, sizes and Comment show above the gallery when there is no page yet.
- **Where it lives with no tribe** offers Invite a friend, which needs a tribe first. A "Start a tribe" button there would be the honest next step.
- **Flint's reply sentences** are English in every language (the buttons, chips, badges and sheets are translated).
- **A helper nobody owns** still gets the older Apply/Decline list for website proposals.
- **App Creator's map** has no pinch zoom; tablet is the phone layout at tablet size.
- **Nothing was tried on a real phone**, with the real GitHub, or between two homes.
