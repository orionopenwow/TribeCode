# Language report

Written by `node scripts/dev/i18n-audit.js` (it walks the app headless; `app/test/e2e_i18n_audit.py` does the walking). Numbers are `before → after`. Do not edit the tables by hand: run the script. The notes under the tables are in `docs/I18N-REPORT-NOTES.md`.

**What was walked:** 74 places (every main section, every Settings tab, Help, the Guide, Next step, Publish, Versions, New, Invite, Plans, Flint's page, Academy, Marketplace, Company, Design, the website builder) in English and in each language at 1280, and German and Japanese again at 390. English showed 1854 different strings at 1280.

**Before** is commit `ed0e954`, walked the same way, except 2 places (docs, docs-files) that froze the app in every language but English at that commit and could not be walked. The first table leaves those places out on both sides, so the two numbers compare like with like; the second table is the whole app now.

**How a string counts as still English:** it reads exactly the same in the English walk and in the language walk, and it is not a name, a number, code, or a row whose translation is the English on purpose ("Chat" in Spanish, "Design" in French).

## Before and after, on the 72 places both could walk

| | Spanish | Portuguese | French | German | Japanese | Chinese | Korean |
|---|---|---|---|---|---|---|---|
| Visible strings still English | 1380 → 1245 | 1364 → 1245 | 1360 → 1245 | 1380 → 1245 | 1380 → 1245 | 1371 → 1245 | 1380 → 1245 |
| Placeholders, tooltips, labels still English | 405 → 388 | 401 → 388 | 398 → 388 | 405 → 388 | 405 → 388 | 400 → 388 | 405 → 388 |
| Date and time labels still English | 43 → 44 | 43 → 43 | 43 → 43 | 43 → 43 | 44 → 44 | 44 → 44 | 44 → 44 |
| Text cut off or off the screen (and not in English) | 5 → 5 | 5 → 6 | 2 → 3 | 6 → 7 | 3 → 2 | 1 → 0 | 1 → 0 |
| Mixed sentences (CJK with English words inside) | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| Flint replies that stayed English (of 5 asked) | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 | 1 → 1 |
| Phone (390): strings still English | – | – | – | 1362 → 1223 | 1304 → 1223 | – | – |
| Phone (390): text cut off | – | – | – | 2 → 3 | 2 → 1 | – | – |

Share of the strings English shows (1280) that are no longer English, counting names, numbers and code, which never needed translating: Spanish 21% → 30% · Portuguese 22% → 31% · French 22% → 31% · German 21% → 31% · Japanese 21% → 30% · Chinese 22% → 30% · Korean 21% → 30%. Read it as an upper bound on how much is translated.

## The whole app now (all places)

| | Spanish | Portuguese | French | German | Japanese | Chinese | Korean |
|---|---|---|---|---|---|---|---|
| Visible strings still English | 1248 | 1247 | 1247 | 1247 | 1247 | 1247 | 1247 |
| Placeholders, tooltips, labels still English | 388 | 388 | 388 | 388 | 388 | 388 | 388 |
| Date and time labels still English | 44 | 43 | 43 | 43 | 44 | 44 | 44 |
| Text cut off or off the screen | 5 | 6 | 3 | 7 | 2 | 0 | 0 |
| Labels the translator gave up on (must be 0) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## What is still English, by kind (German, 1280)

| Kind | Strings | Examples |
|---|---|---|
| Short labels and buttons (up to 32 characters) | 681 | "#general" · "+ Add a special connection" · "+ Add block" |
| Long copy (over 60 characters) | 188 | "A Phone app card on the overview: pick a sta…" · "A fresh tribe of your own: name, icon, where…" · "A hand-drawn style whiteboard for sketching …" |
| Sentences (33 to 60 characters) | 162 | "(the integrator agent) proposes one with" · "A code file you can edit here, or the repos …" · "A friend or an AI helper does each job." |
| Marketplace catalog and Guide content | 127 | "553 checked add-ons for your project: sideba…" · "A free-tier friendly agent for members who u…" · "A phone is a full member: chat, voice notes,…" |
| Pieces of a sentence split around a link or code | 36 | ") and paste it here." · ", copy it (it starts with" · ", for any of the above: what you type to Fli…" |
| Has a number in it (needs a pattern or plural) | 34 | "1 task · 0 done · shared with your tribe" · "14 of 15 journeys pass." · "2 GB" |
| Code, commands, addresses (stay as they are) | 19 | "$ claude mcp add" · "Cloudflare quick tunnel (no account): Window…" · "Export (.json)" |

## What is still English, by place first seen (German, 1280; top 15)

| Place | Strings |
|---|---|
| flint | 173 |
| market | 113 |
| ws-agents | 56 |
| settings:ai | 54 |
| settings:notifications | 52 |
| mcp-directory | 43 |
| repos-all | 42 |
| settings:projects | 41 |
| repo | 39 |
| agents-hub | 38 |
| settings:account | 37 |
| settings:workspace | 35 |
| home | 34 |
| secretary | 34 |
| website | 32 |

## The tables

| Check | Before | After |
|---|---|---|
| Keys in the table (app/ui/i18n.js) | 1324 | 1324 |
| Rows written in the source (more than keys means dead rows) | 1350 | 1324 |
| Keys defined twice with a different translation (the earlier one was never shown) | 15 | 0 |
| Rows without seven filled cells | 0 | 0 |
| Rows, patterns and plurals in app/ui/i18n-more.js | 0 | 181 |
| Translations that lost a {placeholder} | – | 0 |

## The website (site/lang/*.json)

| | Spanish | Portuguese | French | German | Japanese | Chinese | Korean |
|---|---|---|---|---|---|---|---|
| Keys | 1179 | 1179 | 1179 | 1179 | 1179 | 1179 | 1179 |
| Missing (of 1179) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Same as English (names, mostly) | 23 | 33 | 47 | 53 | 16 | 15 | 16 |

## What the audit found first: the app froze in every language but English

On the starting commit, choosing any language other than English and opening Files (the `docs` and `docs-files`
places, 2 of 46 main places) froze the app.

- Cause: `app/ui/shell.js` wrote the breadcrumb in English behind `if (crumb.textContent !== text)`, from a watcher
  on the breadcrumb itself. Once the translator had turned "Files" into "ファイル" that check never passed again:
  write English, translate, the watcher fires, write English. About 25 page-wide watchers each ran ~190 times in
  1.5 seconds, without end. It only showed where the breadcrumb is a single word that has a translation.
- Fix at the source: the breadcrumb is up to date when it shows the text or its translation (one line in shell.js).
- Fix for the whole class: the translator notices when something keeps writing a label back. After 20 swaps of one
  element in a second it leaves that label in English and lists it in `TribeI18n.held()`.
- Kept fixed: the audit fails on any held label, and it stages the same fight on purpose in every language to prove
  the guard trips. If the page stops answering, the test names the place instead of hanging.
- Checked: reproduced and traced on the starting commit in Japanese. (Before the cause was known, the walker had
  also stopped during its Spanish and German walks; the place was not recorded for those.) With the guard alone
  (shell line unfixed) the page answers and the label is reported. With both fixes the breadcrumb reads in
  Japanese, nothing is held, 0 of 46 places storm, and all seven languages now walk through Files.
- A side effect to know: the guard would also catch code that rewrites a translatable label many times a second
  for another reason (an animation that sets the same text every frame). That label would stay English and the
  audit would report it; the fix is in the code that rewrites it.

## Most of the app was never translated, and this pass does not finish that

The table had 1,324 rows, but they cover particular flows well (setup, publishing, phones) and much of the
everyday interface not at all: "Home", "Help", "Invite", "Company", "Friends", "Account", "Accept" had no row.
About three quarters of what English shows was still English in every language. After the freeze, that is the
main finding.

What this pass translated: 159 rows, 18 patterns and 4 plurals in `app/ui/i18n-more.js`, chosen from the busiest
places (Home, the dashboard, People, Invite, Work, Files, the Settings tab names, the ? menu, the shortcuts
sheet). Nearly all of the gain is those entries. Measured on the first full walk in German, 169 strings stopped
being English: 144 through a new row, 14 through a new pattern, 9 because a label with an emoji in front or "…"
after now uses the row for the plain words, and 2 because strings over 60 characters now translate on the page.
The long explanatory text is English because it has no rows, not because of the old 60-character limit.

What it did not do: translate everything. About 1,200 strings are still English in each language. Roughly 1,000
of those are interface text (in German about 680 short labels, 155 sentences and 185 longer paragraphs); the rest is
catalog content, strings with numbers, pieces of sentences and code. Closing that is a translation job of about
7,000 cells with a native reader per language, not more rows written in one sitting. The tooling to drive it to
zero and keep it there now exists (the tables above, the per-kind and per-place lists, the CI check).

Every translation in this pass was written and self-checked by the author of the code, with no native review.
Treat them as a careful first draft. The form of address follows what the existing rows do, counted from the
table (`docs/I18N-GLOSSARY.md`): French is "vous", German "du".

## What stays English on purpose

- Names: TribeCode, Flint, product and tool names, theme names (Campfire, Midnight, Nordic), file names, key names.
- What people wrote: chat, task titles, document text, project and tribe names. The sidebar switcher's name was
  being translated when it equalled an interface word (a tribe called "My Tribe" showed as "Mi tribu"); it is now
  protected like the other name fields. Inside a sentence ("Invite to My Tribe") a name is kept as written.
- Code, commands and addresses (`$ claude mcp add`, file extensions).
- The 553 Marketplace entries and the Guide's page bodies: content, not interface. The Guide's titles and
  summaries are not translated yet either, and its pages do not yet say "In English for now".

## Things rows cannot fix (they need a change in the code that builds the text)

- Sentences split around a link or a code snippet (`") and paste it here."`, `", copy it (it starts with"`).
  Translating the pieces gives broken grammar, because word order differs by language. The website's translator
  handles this with placeholders for the inner elements; the app's does not yet. About 40 such pieces stay English.
- One English word used with two meanings. A key is the English text, so "Move" (move a thing) and "Move" (move the
  tribe to another computer) share one translation; the same for "Weight", "Fill" and "Padding". The 15 keys that
  were defined twice with different translations were this problem in disguise: the later row silently won. The 26
  dead rows are removed (the evaluated table is identical before and after) and a repeat is now a failing check.
  Giving the second meaning its own key is still to do.
- Dates and times. The translator now offers `date`, `time`, `rel`, `num` and `list` (the system's own formatting
  per language), but the calendar's hour labels, weekday names and "just now" are still built in English by the
  code that draws them. That is why the "date and time labels" row does not move.
- Text drawn once through `t()` (Next step, the Guide, the first screen) stays in the previous language after a
  switch until that part is drawn again. The first screen's picker reloads the page for this reason; elsewhere a
  reload brings everything into the new language.
- What people wrote, when it sits outside the protected containers, is translated if it equals a row or fits a
  pattern (a file named "Settings"). Patterns only fill a name slot with text that starts with a capital or a
  non-Latin letter, so "Invite to this project" is never half-translated; containers of people's own text should
  carry `data-i18n-skip`.

## Text that does not fit

Counted as elements, not as places (a sidebar label shows on every place). Translating more text made a few more
things too long, mostly in German and French:

- A Settings tab label from this pass was too long in German and French. It is shortened ("Privatsphäre & Status",
  "Vie privée et présence") and checked: all eleven tab labels fit in German, French, Portuguese, Chinese and Korean.
- Two tab labels that were already cut before this pass still are: Spanish "Proyectos y copia de seguridad" (203px
  in a 162px tab) and Japanese "プロジェクトとバックアップ" (176px). They are existing rows, left as they were;
  "Proyectos y copias" and "プロジェクトと保存" would fit.
- In the agents list the helper's name ("Claude · Orion") is now cut with an ellipsis in Spanish, Portuguese,
  French and German, because the translated status word beside it is wider. Not restyled in this pass.
- In the ? menu the German subtitles are cut with an ellipsis. Not restyled in this pass.

## Flint in other languages

- Understanding: everyday requests in the seven languages are recognised by `app/ui/flintlang.js` and handed to
  Flint's existing rules; what the person named is kept as written. No model is involved.
- 40 phrasings per language were written before any tuning. First run, untuned: Spanish 15, Portuguese 15,
  French 17, German 11, Japanese 6, Chinese 9, Korean 4 (of 40). After tuning: 40 of 40 each.
- A second batch of 20 per language was written after the rules existed, scored once and not tuned against:
  Spanish 18, Portuguese 19, French 19, German 19, Japanese 20, Chinese 20, Korean 20 (of 20). The same person
  wrote the rules and both batches, so this shows the rules are not fitted only to the first batch. It is not an
  independent benchmark, and it covers 20 everyday requests, not Flint's whole catalog (259 entries).
- English is unchanged: the main evaluation is 1405/1427 (98.5%).
- Replies: Flint's core replies already existed in all eight languages. Replies written directly in English in
  other files (a rough count finds about 85) are not translated yet. The audit's reply check is a small probe: 8
  requests, of which 5 produce a reply through the test's stand-in for the chat.

## Choosing a language

- One picker (`TribeI18n.picker()`) is now in three places: Settings, the ? menu, and the first screen. Flint also
  switches language when asked ("speak French").
- First run follows the browser's language list (any of them, not only the first). The choice is remembered on the
  device. The website and the app use the same stored choice, which a browser only shares when both are served
  from the same address (the web app under the site); a self-hosted app and the public website each remember
  their own. The app's preference sync also carries the language (`prefs.js`); that path was not re-checked.
- On phones the picker's text is 16px like every other form control (`mobile.css`: smaller text makes iPhones zoom
  in on focus).

## Right to left

Not ready, and no right-to-left language was added. The translator sets the page direction for Arabic, Hebrew,
Persian and Urdu if one is added, but the interface would break widely: 1,234 left/right style declarations in
146 of 160 stylesheets against 3 direction-neutral ones, and about 174 lines of horizontal position math in 69
scripts (panels that slide, menus placed from the left edge, the canvas). The new picker and one rule in the
shared kit use direction-neutral properties. Making the rest mirror-ready is its own project: the shared kit
first, then section by section, with a mirrored run of the layout test.

## Which languages to add next

1. Italian, then Dutch, Polish and Turkish: same script and direction, so the cost is translation only (about
   1,500 app entries and 1,179 website strings each today, more once the gap above is closed).
2. Indonesian and Vietnamese: the same, with large phone-first audiences.
3. Hindi: left to right, but a new script; check fonts and line height first.
4. Traditional Chinese: cheap to derive from Simplified, with a native check of terms.
5. Arabic or Hebrew only after the right-to-left work above.

None was added now. The seven that exist are at most a third covered, and an eighth would spread the same gap wider.

## How far to trust these numbers

- The walk sees what is on screen in a fresh tribe with one task and one message. Screens that need more data
  (a running call, a full company, a published site) show less than they will in real use.
- A string counts as translated when it differs from the English. That says it was translated, not that the
  translation is good.
- "Before" was measured on a clean copy of the starting commit with the same walker, minus the two places that
  froze. The before-and-after table leaves those places out on both sides. The clean copy held only the server and
  the app, so its dashboard lacked a makers-only "Test robot notes" card that the full checkout shows: 13 strings
  that count against "after" and not against "before".
- Both columns were counted by the same code (`scripts/dev/i18n-audit.js`), including which rows are English on
  purpose and what counts as a date label.
- "After" counts about 30 strings that "before" could not: the name list was corrected between the two walks (it
  had treated Email, Pages, Cursor and AIs as names: 4 strings), and the agents hub showed 25 more strings on the
  after walk than on earlier walks of the same code (it was caught mid-redraw before). So the real drop is about
  30 larger than the table shows. The walker now waits for a place to stop changing instead of a fixed 400 ms;
  the starting commit was not walked again with that walker, which is the clean way to settle it.
- Counts can wobble by a few between runs (a tip or toast that shows on one run and not the next). The CI check
  allows a difference of 3.

## Asked for and not done in this pass

- Translating everything the audit found (see above: about a third is covered).
- Guide titles, summaries and Basics pages, and the "In English for now" note on Guide pages.
- Flint's directly written English replies, chips, lessons and help answers in other languages.
- Dates, times and counts built in English by the app's own code (the helpers exist; the callers still need them).
- Splitting the table into per-language files loaded on demand. All languages still load together (the table is
  about 350 KB, 139 KB compressed); new rows go in a second file.
- Right-to-left conversion beyond the picker and one shared rule.
- New languages.
