# Flint capability report

Written by `node scripts/dev/flint-capability.js`; do not edit by hand. What Flint does **on the device with no AI service**, measured two ways:

- **Main eval** (`app/test/flint_eval.json`, 1407 phrasings): tuned against over many rounds, so read it as a regression check, not as a fair score.
- **Held-out batch 7** (`scripts/dev/flint-eval/held7.js`, 117 scored checks + 4 writing requests): written before the feat/flint-local upgrades, from the intent list only.

Caveats, read before quoting a number:

- The same hand wrote the tests and the code. Batch 7 was scored once before the upgrades (“before” below); the upgrades were then built **with those misses in view**, so “after” is a tuned score on that batch, not a held-out one.
- “Fixture model” is a 740 KB stand-in (`scripts/dev/flint-fixture-model.js`), not a trained model, and its synonym list was written by the same hand. It shows the wiring works. The real default model (potion-base-8M) has **not** been run here: the build machine cannot reach its publisher.
- Tier 2 (a local LLM) has no score: no real model was reachable. Its plumbing is tested with a scripted fake server (`app/test/e2e_flint_llm.py`). The “open writing” row is what it is for.
- Small sets: one case is 7–17 points in most rows.

## By skill type (held-out batch 7)

| Skill | Before · no model | Before · fixture model | After · no model | After · fixture model |
|---|---|---|---|---|
| commands | 26/38 (68%) | 26/38 (68%) | 26/38 (68%) | 26/38 (68%) |
| follow-ups | 3/17 (18%) | 3/17 (18%) | 3/17 (18%) | 3/17 (18%) |
| did-you-mean | 7/15 (47%) | 8/15 (53%) | 7/15 (47%) | 8/15 (53%) |
| help answers | 7/10 (70%) | 6/10 (60%) | 7/10 (70%) | 6/10 (60%) |
| search by meaning | 2/10 (20%) | 0/10 (0%) | 2/10 (20%) | 0/10 (0%) |
| duplicate tasks | 2/6 (33%) | 2/6 (33%) | 2/6 (33%) | 2/6 (33%) |
| summaries | 0/3 (0%) | 0/3 (0%) | 0/3 (0%) | 0/3 (0%) |
| copy / tone | 4/8 (50%) | 4/8 (50%) | 4/8 (50%) | 4/8 (50%) |
| generation | 2/10 (20%) | 2/10 (20%) | 2/10 (20%) | 2/10 (20%) |
| open writing (needs a writing model) | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) |
| **All scored rows** | **53/117 (45%)** | **51/117 (44%)** | **53/117 (45%)** | **51/117 (44%)** |

## By editor (commands)

| Editor | Main eval, no model | Batch 7 commands, no model |
|---|---|---|
| Anywhere (tasks, chat, calendar, settings) | 533/547 (97%) | 11/20 (55%) |
| Website designer | 618/625 (99%) | 6/7 (86%) |
| Preview | 27/27 (100%) | – |
| Design canvas | 156/156 (100%) | 2/4 (50%) |
| Sheets | 30/30 (100%) | 3/3 (100%) |
| Docs | 18/18 (100%) | 3/3 (100%) |
| Slides | 4/4 (100%) | 1/1 (100%) |
| **All** | **1386/1407 (99%)** | **26/38 (68%)** |

The local helper never decides a command, so these are the same with the fixture model.

## Weakest areas now

- **summaries**: 0/3 (0%) with no model, 0/3 (0%) with the fixture model. Fails:
  - “We met on Tuesday to plan the bake sale.…” → lost “14 June”, “card reader”, “library”
  - “The playtest had twelve players. Nine of…” → lost “second boss”
  - “Our newsletter has 1,200 readers and gro…” → lost “Thursdays”, “podcast”
- **follow-ups**: 3/17 (18%) with no model, 3/17 (18%) with the fixture model. Fails:
  - “add a task to design the logo … and make it urgent” → got nothing
  - “add a task to design the logo … due friday” → got nothing
  - “tell maya the build is up … tell sam too” → msg: "too"
- **search by meaning**: 2/10 (20%) with no model, 0/10 (0%) with the fixture model. Fails:
  - “where did we talk about how much it costs” → found f2, wanted d1
  - “what did we cut from v1” → found c2, wanted d3
  - “merch for the stand” → found d3, wanted t3
- **generation**: 2/10 (20%) with no model, 2/10 (20%) with the fixture model. Fails:
  - “a to-do app for the chores” → got nothing
  - “a 5 slide pitch from the vision doc” → got nothing
  - “launch page for our bake sale by friday” → no plan: one question with chips
- **duplicate tasks**: 2/6 (33%) with no model, 2/6 (33%) with the fixture model. Fails:
  - “Buy milk and eggs” → no warning
  - “Fix header bug” → no warning
  - “Email the venue about chairs” → no warning
- **open writing**: 0/4 without a writing model, by design. Examples: “write a poem about our tribe”, “draft a welcome email for new members”, “explain this error: TypeError x is undefined”.

## Weakest areas before the upgrades

- summaries: 0/3 (0%)
- follow-ups: 3/17 (18%)
- search by meaning: 2/10 (20%)
- generation: 2/10 (20%)
- duplicate tasks: 2/6 (33%)

