# Flint: search by meaning

Flint finds things by what they mean, not only by the words in them. This works with no AI and nothing to download.
An optional helper makes it sharper.

## What you get

- **Commands in your own words.** Type "trash that job" and Flint asks "Did you mean this?" with the one command that
  fits. Nothing runs until you tap it. When several commands are close, you get up to three to pick from.
- **Search.** Ctrl K lists docs, tasks, chat, files, Versions and Guide pages that match by meaning, marked
  "by meaning". Exact matches still come first. In Flint, "find the gloomy image" and "where did we talk about …"
  answer the same way.
- **Help answers.** "How do I …" questions are matched to the Guide by meaning as well as by words.
- **Phrases you taught.** A taught phrase said in other words is offered as a chip. The exact phrase still runs at once.

## The two levels

| Level | What it is | Download |
|---|---|---|
| Built-in | A table of about 21,000 everyday words (`app/ui/flintwords.bin`, about 1.1 MB over the wire). Part of the app, cached for offline, read when the page is idle. | None |
| Helper | The local helper on Flint's page (`app/ui/flintmodel.js`). It reads whole phrases and is stacked on top of the table. | One download, opt-in |

Both run on the device. Nothing typed or searched leaves it. Only what a person can already see is searched. Private
messages are never indexed. The index lives in memory, is refreshed from the tribe at most once a minute, and only
new or edited items are processed again.

## For other features

```js
await TribeMeaning.search(query, { scopes, limit })
// -> [{ kind, label, hint, text, score, run() }], best first
// kind: 'Doc' | 'Task' | 'Chat' | 'File' | 'Version' | 'Guide' | 'Command'
// scopes: lower-case kinds; default is everything except 'command'. limit defaults to 6.

TribeMeaning.nearestIntent(text, ctx?)
// -> { intent, label, example, score, confident, alts: [...] } or null. Never runs anything.
// confident: show it as the single "Did you mean this?" chip.
```

`TribeMeaning.ready()` resolves when the table is loaded. `TribeMeaning.status()` says which level is in use. The full
notes are at the top of `app/ui/flintmeaning.js`.

## How it works

- `scripts/dev/flint-words.py` builds the table from GloVe word vectors (public domain) pulled toward WordNet's
  synonyms and broader terms, cut to 64 numbers per word and stored as bytes. Credits are in `NOTICE`.
- `app/ui/flintmeaning.js` matches word by word: each word of the request finds its closest word in the text, rare
  words count more, and a word that matches nearly everything in the list counts less.
- `app/ui/flintnlu.js` uses it only when its rules found nothing. It also reads a short list of everyday words per
  command (the cues), and keeps a real word the spell-fixer would have "corrected" into a command word.
- `app/ui/flintsem.js` blends it into ranking. `server/flintkb.js` re-ranks help answers with the same table.

## Measured

`node scripts/dev/flint-meaning-eval.js` scores three levels on the same sets.

- **No table**: Flint as shipped before this work.
- **Built-in**: the word table.
- **Stand-in**: the built-in table with the test fixture stacked on as the helper. The fixture is **not a trained
  model**; it only proves the wiring. The real helper model could not be downloaded in the build sandbox and has not
  been measured.

The tuning sets (batches 7 and 8, and `flint-eval/tune9.js`) were used to set blends and thresholds, so their numbers
flatter the table. Batch 9 (`flint-eval/held9.js`: 140 paraphrased commands, 12 help questions, 66 searches over a
seeded tribe) was written before the table existed and was never tuned against or inspected. It is the honest number.

A paraphrase counts as right when Flint does the right thing directly or the right command is among the chips.
"Wrong action" is Flint doing something else directly. Search is the first result, with the top three alongside.

<!-- numbers:start -->
| Set | no table | built-in | stand-in |
|---|---|---|---|
| tuning sets · paraphrases | 96/114 (84%), 3 wrong actions | 107/114 (94%), 3 wrong actions, single chip right 15 of 15 | 103/114 (90%), 3 wrong actions, single chip right 18 of 18 |
| tuning sets · help | 18/26 (69%) | 20/26 (77%) | 20/26 (77%) |
| tuning sets · search | 21/50 (42%), top 3: 30 | 26/50 (52%), top 3: 36 | 25/50 (50%), top 3: 36 |
| batch 9 (held out) · paraphrases | 83/140 (59%), 14 wrong actions | 96/140 (69%), 14 wrong actions, single chip right 15 of 20 | 90/140 (64%), 14 wrong actions, single chip right 13 of 18 |
| batch 9 (held out) · help | 6/12 (50%) | 6/12 (50%) | 6/12 (50%) |
| batch 9 (held out) · search | 18/66 (27%), top 3: 31 | 27/66 (41%), top 3: 46 | 30/66 (45%), top 3: 41 |
<!-- numbers:end -->

## Limits

- The table knows single English words. It does not know names, product words, or what a sentence implies
  ("nowhere to leave the car" is a weak match for "parking").
- Other languages fall back to Flint's rules and shared words.
- Long texts are eased down so a Guide section does not outrank a short task title by size alone.
