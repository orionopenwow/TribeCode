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
| commands | 26/38 (68%) | 26/38 (68%) | 36/38 (95%) | 36/38 (95%) |
| follow-ups | 3/17 (18%) | 3/17 (18%) | 17/17 (100%) | 17/17 (100%) |
| did-you-mean | 7/15 (47%) | 8/15 (53%) | 13/15 (87%) | 14/15 (93%) |
| help answers | 7/10 (70%) | 6/10 (60%) | 7/10 (70%) | 6/10 (60%) |
| search by meaning | 2/10 (20%) | 0/10 (0%) | 7/10 (70%) | 7/10 (70%) |
| duplicate tasks | 2/6 (33%) | 2/6 (33%) | 6/6 (100%) | 6/6 (100%) |
| summaries | 0/3 (0%) | 0/3 (0%) | 3/3 (100%) | 3/3 (100%) |
| copy / tone | 4/8 (50%) | 4/8 (50%) | 8/8 (100%) | 8/8 (100%) |
| generation | 2/10 (20%) | 2/10 (20%) | 10/10 (100%) | 10/10 (100%) |
| open writing (needs a writing model) | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) | 0/4 (0%) |
| **All scored rows** | **53/117 (45%)** | **51/117 (44%)** | **107/117 (91%)** | **107/117 (91%)** |

## By editor (commands)

| Editor | Main eval, no model | Batch 7 commands, no model |
|---|---|---|
| Anywhere (tasks, chat, calendar, settings) | 533/547 (97%) | 20/20 (100%) |
| Website designer | 618/625 (99%) | 7/7 (100%) |
| Preview | 27/27 (100%) | – |
| Design canvas | 156/156 (100%) | 2/4 (50%) |
| Sheets | 30/30 (100%) | 3/3 (100%) |
| Docs | 18/18 (100%) | 3/3 (100%) |
| Slides | 4/4 (100%) | 1/1 (100%) |
| **All** | **1386/1407 (99%)** | **36/38 (95%)** |

The local helper never decides a command, so these are the same with the fixture model.

## Weakest areas now

- **help answers**: 7/10 (70%) with no model, 6/10 (60%) with the fixture model. Fails:
  - “how do i get a friend into my tribe” → answered from docs/guide/06-phones.md
  - “how do i go back to an older version” → answered from docs/guide/09-troubleshooting.md
  - “how do i make a website for my project” → answered from docs/guide/02-projects-and-invites.md
- **search by meaning**: 7/10 (70%) with no model, 7/10 (70%) with the fixture model. Fails:
  - “where did we talk about how much it costs” → found f2, wanted d1
  - “money plan” → found d1, wanted f2
  - “things to do before release” → found d3, wanted d2
- **did-you-mean**: 13/15 (87%) with no model, 14/15 (93%) with the fixture model. Fails:
  - “bin that chore” → chips: nav.tasks, task.list, task.start
  - “give me the grand tour” → did task.assign
- **commands**: 36/38 (95%) with no model, 36/38 (95%) with the fixture model. Fails:
  - “i need a checkout screen” → got canvas.page
  - “make a night version of this frame” → got canvas.page
- **follow-ups**: 17/17 (100%) with no model, 17/17 (100%) with the fixture model.
- **open writing**: 0/4 without a writing model, by design. Examples: “write a poem about our tribe”, “draft a welcome email for new members”, “explain this error: TypeError x is undefined”.

## Weakest areas before the upgrades

- summaries: 0/3 (0%)
- follow-ups: 3/17 (18%)
- search by meaning: 2/10 (20%)
- generation: 2/10 (20%)
- duplicate tasks: 2/6 (33%)

