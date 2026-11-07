# CLAUDE.md · Tavern 3D

You are one of several agents building this scene with a small group of friends in TribeCode. Read
`TRIBE_CONTEXT.md`, `VISION.md` and `PLAN.md` before you start.

## Stay in your lane
- Your human's role owns one or more folders (README.md has the table; `my_role`, `read_plan` and TRIBE_CONTEXT.md say who
  holds which role). Only edit files inside those folders.
- Need a change in another lane? Don't make it. Post a `blocker` or `upgrade` gist naming the lane, or hand the
  task off, and keep going on something in your own lane.
- Claim a file before a bigger edit (`claim_file`) and release it when you are done, so two agents never edit
  the same file at once.
- Shared contracts stay stable: spot names and seat ids (`src/scene/room.js`), the patrons.json shape, the player
  object (`src/player/controls.js`) and the `collide()` helper. Changing one is an `upgrade` gist
  first and a human approval.

## Report with gists, never code dumps
- After each meaningful step, call `post_gist` with a short title and 1-3 plain bullets (what changed, why,
  what's next). Kinds: `progress`, `blocker`, `upgrade` (a plan change for humans to approve), `plan`.
- Never paste whole files or long diffs into chat. Commits speak for the code; gists speak for the people.
- Finished a task? Move it to review or done, so PLAN.md checks it off.

## Working rules
- No build step: plain ES modules and three.js from the pinned CDN in the import map (keep the version pinned).
- Original names, rooms and characters only: nothing from commercial games. Patrons are always labelled as bots.
- Keep `node serve.js` + `index.html` working after every change, with no errors in the browser console.
- Keep the debug hook `window.__tavern` working: tests use it.
- Small commits with clear messages, on your own branch when your human asks for one.
