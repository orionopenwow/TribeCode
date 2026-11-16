# Lessons: from nothing to a published website and an app on your home screen

Pass 4. A lesson is a short track the person DOES in the real tool. It sits beside the quick guides (one-screen
answers) and the paths (idea to published link): a quick guide answers one question, a lesson walks a beginner
through a whole first result.

Code: `app/ui/lessons.js` + `lessons.css` (the card, the Learn section, the checks, the suggestion provider),
`templates/quickguides.json` → `tracks` (the one source; the app bundle, `/api/guide`, Flint and the website read
it), `app/ui/flintnlu.js` `trackOf` (what Flint understands), `server/index.js` `GET|PUT /api/me/learn` (ticks kept
with the person), `scripts/dev/site-quick.js` (the website's copy), `app/test/e2e_lessons.py` (the test and the walk).

## The tracks

| Track | Steps today | Ends with |
|---|---|---|
| Your first website | 9 | a site downloaded or published |
| Your first phone app | 8 | the app on your phone's home screen |
| Build it together | 5 | a friend in, a change suggested and answered |
| Take it online | 5 | folder → shared → GitHub → a public address → a phone |
| Power tools | 7 (+9 waiting) | versions, comments, requests, Check, suggestions, the library, the install check |

## How a step works

- **The card** stays on screen while the person works (bottom left; above the bottom rack on phones). It can be made
  small or closed; closing pauses the lesson and the ticks are kept.
- **Show me** opens the place the step happens in and rings the real control. The ring says the step's own sentence.
- **The check** ticks the step when the app can tell it was done: it reads the website designer's and App Creator's
  own state (words changed, the look changed, a section, page, screen or link added, phone size, Check open, Play on)
  or sees the place open (invite, Requests, History, the library, Put it on your phone). The checks are the `CHECKS`
  table in `lessons.js`; `dom:<selector>` means "this is on screen".
- **Done, next** always works, so nobody is stuck on a step the app cannot see (roles, a second person).

A step is `{ id, title, text, show: { open, sel }, check?, soon? }`. `open` is one of the openers in `lessons.js`
(`site`, `sitelib`, `app`, `design`, `phone`, `invite`, `roles`, `changes`, `versions`, `publish`, `suggest`,
`library`, `home`). Keep a title to 8 words and the sentence to 30; the test enforces both and the plain-words rule.

## Steps that wait for their control (`soon: true`)

Nine Power tools steps teach controls other pass 4 branches are adding. They are hidden until one of their selectors
has been seen on screen once (`lessons.js` `seeSoon`); from then on the step is part of the track on that device, and
the walk in the test starts checking it as soon as `soon` is removed from the file.

| Step | Selectors it waits for |
|---|---|
| Zoom the page | `#wdz-zoom, [data-wdz='zoom']` |
| See the code | `#wdz-code, [data-wdz='code']` |
| Drag the spacing | `.wdz-space, [data-wdz='space']` |
| Restore an earlier app design | `#apc-history, [data-apc='history']` |
| Comment on a screen | `#apc-comment, [data-apc='comment']` |
| Change several parts at once | `#apc-multi, [data-apc='multi']` |
| See every screen at once | `#apc-map, [data-apc='map']` |
| Polish it with Flint | `[data-flint-polish], #wdz-polish, #apc-polish` |
| Ask a stronger AI to make it beautiful | `[data-flint-beautiful], #wdz-beautiful, #apc-beautiful` |

To wire one after merging: make the real control match a selector (or change the selector in the file), remove
`soon`, add a `check` if the tool's state can tell, run `node scripts/dev/app-bundle.js && node scripts/dev/site-quick.js`.

## Where a lesson is offered

- **Learn**: a Lessons section with every track's progress, and "Next lesson".
- **First run in a creator**: one small offer in the website designer and in App Creator for someone who has not
  started that track. "No thanks" is remembered; it is never shown again on that device.
- **Suggestions** (provider `learn`): at most one lesson, after a natural moment. A friend joined → Build it
  together; first publish → Power tools; first saved design → Take it online. Apply starts it; a "no" is remembered
  by the engine like any other suggestion.
- **Flint, no AI**: "teach me to make a website", "the app lesson", "lessons", "what is my next lesson", "stop the
  lesson". "What should I learn next?" still answers with a quick guide and now has the next lesson one tap away.
- **Ctrl K** lists the five lessons. **The website's Learn page** lists them with their steps.

## Progress

On the device in `localStorage['tribecode.learn']` (`track`, next to the quick guides' ticks). In a tribe the ticks
are also kept with the person (`.tribe/learn/<member>.json`); the earliest tick wins on both sides and nothing is
ever un-ticked, so two devices can only add to each other.

## The walk

`e2e_lessons.py` presses Show me on every quick guide and every lesson step and fails when nothing is ringed. Its
first run found four that rang nothing: the two App guides and the lessons' Design step when the shelf's full page
was open over the flow, "Undo a mistake" when Flint's panel was closed, and the publish step. All fixed.

## Left

- The website's lesson cards say "9 · 10 min" without the word "steps" (numbers are not translated there).
- Lesson progress follows the person inside one tribe; with sign-in on it should follow the account.
- No lesson yet for Motion Studio, the Launch kit or games.
