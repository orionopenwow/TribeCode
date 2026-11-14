# Help, guide and "what next" (feat/help-next)

## The problem

The ? menu had 15 entries sorted by what we built (tour, demo, run-through, three set-up pages, four links). A newcomer could not tell which one answers "I do not know what to do now", and nothing took a person from an idea to a published link at the depth they need.

## Information architecture

**1. The ? menu: six entries, by intent** (`app/ui/help.js`)

| Entry | Answers | Opens |
|---|---|---|
| What should I do next? (main) | "I'm lost" | the next-step sheet |
| Learn | "teach me" | the Help center |
| Ask Flint | "let me just ask" | Flint |
| Something's wrong | "it broke" | Fix a problem, Report a bug, Check for updates |
| Shortcuts | "faster" | the shortcut list |
| What's new | "what changed" | the changelog |

Nothing was removed. The tour, demos, run-through, set-up pages, docs and GitHub moved to the Help center home with the same `data-help` keys. The website link is in the menu's footer.

**2. The Help center: one place** (`app/ui/guide.js`, `#/guide/home`)

It is the existing Guide, extended. Search comes first (by meaning when `TribeMeaning.search` is there, by words otherwise). Then six paths by goal: Make a website, Make a game, Make an app, Run it as a company, Work with friends, Use AI helpers. Each path (`#/guide/path/<id>/<level>`) has:

- a six-step journey with a **Do it** button per step,
- **Show me (60 seconds)**: the existing Flint lesson,
- one page at three depths: **Basics** (anyone, no AI), **In practice** (a working rhythm), **Production** (checklists: pipelines, budgets, performance, accessibility, store submission, roles, versioning).

Path pages are `docs/guide/p-<id>-<level>.md`, served as `paths` beside the 15 numbered pages, which stay as the reference.

**3. One next-step engine** (`app/ui/nextstep.js`)

`TribeNextStep.next()` reads real project state (vision, tasks, design, files, checked, published, people) and returns ONE best step with a reason, two alternatives and "Not now". The same answer shows in the ? menu, the **Next** chip in the project header, the dashboard card, Flint ("what should I do next", "I'm stuck", "what can I make", "inspire me", "how do I ship this") and the shared empty state (`TribeNextStep.empty`).

**4. Gentle nudge.** Idle on an empty screen, or the same error twice in a minute, offers the next step once per visit. It can be dismissed and turned off (the switch is in the sheet).

**5. Inspiration.** Five "Things you can ask Flint" for the page you are on, and ideas by kind for "what can I make".

## Why this shape

- People arrive with a goal, not a feature name, so the top level is goals and intents.
- One engine means one answer everywhere: no second "recommended" voice.
- Depth is opt-in. General audiences read Basics; a studio opens Production. Same path, same place.
- Everything works with no AI: the engine is rules over project state, and pages ship inside the app.

## Follow-ups

- Fold reco.js "Recommended next" into the next-step card.
- Use the shared empty state in more sections.
