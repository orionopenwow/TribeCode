# The demo tribe

A ready-made tribe for testing TribeCode with friends: two small, original games, already split into lanes,
with roles, tasks, notes, a living doc, a vote, toolbox picks and repo autopilot. One double-click sets it up.

## Start it

- **Windows:** double-click `Start-Demo-Tribe.bat` in the Desktop TribeCode folder (`scripts/desktop/`). It
  uses the Working copy (dev branch) at http://localhost:4848 and its own test tribe, so your own tribe is
  untouched.
- **Anywhere:** `npm run demo-tribe` (or `node scripts/start-demo-tribe.js`) against a running TribeCode.
  Options: `--port 4848`, `--dir <folder>` (default `~/TribeCode-Projects`), `--no-share`, `--cloudflare`,
  `--no-open`, `--no-start`.

The script starts TribeCode if it isn't running, copies the two templates into `~/TribeCode-Projects/` as git
repos, and calls `POST /api/host/demo-tribe` (accepted only from the host computer; the host's own sign-in is
never touched). It prints, and copies, an invite link that opens both projects, plus the `claude mcp add …`
command for a "Claude (demo)" agent of yours. Running it again reuses everything.

**GitHub:** save a token once (project flow card → Connect GitHub, or Settings) or sign in to the `gh` CLI, and
both repos are created as private GitHub repos and pushed. Without one they stay on your computer, and
Connect GitHub on the flow card pushes them later.

## What's inside

| | Lantern Run 🎮 | Tavern 3D 🍺 |
|---|---|---|
| What | A night platformer: carry a little flame through 3 short levels, collect embers, light the lanterns | A cozy 3D tavern: 6 bot patrons wander, sit, chat and take orders |
| Tech | Canvas + ES modules, no dependencies, art and sound made in code | three.js 0.170.0 from jsDelivr via an import map, no build step |
| Run | `node serve.js` → http://localhost:8080 | `node serve.js` → http://localhost:8081 |
| Lanes (role → folder) | Lead `docs/` `src/core/` · Player `src/player/` · Levels `src/levels/` · Art `src/art/` · Audio `src/audio/` · UI `src/ui/` | Lead `docs/` · Scene `src/scene/` · NPCs `src/npcs/` · Player `src/player/` · UI `src/ui/` |
| Plan | 2 milestones, 8 tasks, each tagged to a lane | 2 milestones, 8 tasks, each tagged to a lane |
| Living doc (pinned) | Level design notes | NPC personalities |
| Notes | Kickoff notes, Playtest 1 | Kickoff notes, Patron ideas |
| Vote | Proposal: Add a double jump to Wick | Proposal: Open an upstairs room |
| Toolbox | jsfxr, pixelfx | three.js, howler.js |

You lead both projects (the Lead role). The other roles are open for friends to claim. Repo autopilot is on:
it fast-forwards from GitHub and commits and pushes `TRIBE_CONTEXT.md` as the tribe works.

## Test checklist (with friends)

Tick these off together. Each line says what to do and what you should see.

**Join**
- [ ] Text the invite link. A friend on a **phone** taps it, types a name, taps Join → lands in the phone app
      with both projects; Share → Add to Home Screen opens it like an app.
- [ ] A friend on a **computer** opens the same link → Join → connects their own Claude Code from Agents Hub →
      Your agents (one `claude mcp add` line, their own key).
- [ ] You run the printed `claude mcp add …` command; in Claude Code, `list_projects` shows both projects.

**Lanes and claims**
- [ ] In a project's chat, the flow card lists the roles with their folders. A friend claims **Player**: chat
      says "took Player (src/player/)", and Agents → Ownership shows their lane.
- [ ] Their Claude Code reads `my_role` / `read_plan` and edits only inside `src/player/`. Asking it to edit
      `src/levels/` should end in a hand-off or a blocker gist, not an edit.
- [ ] Two agents `claim_file` the same file: the second one is told who holds it.

**Tasks and the living plan**
- [ ] Tasks & Board shows 8 tasks per project, each naming its role and folder. Move one to done → PLAN.md
      checks it off (and a commit "TribeCode: check off …" lands in the repo).
- [ ] An agent posts an `upgrade` gist → it shows as a plan change; only a human can approve it.

**Live docs and notes**
- [ ] Two people open the pinned **Level design notes** (or **NPC personalities**) and type at once: both see
      each other's edits live, nothing is lost.
- [ ] The notes (Kickoff notes, Playtest 1 / Patron ideas) are in Docs.

**Votes**
- [ ] The proposal vote is in chat. Every human votes Approve / Not yet; with a majority it passes and can be
      sent to the Board with one tap.
- [ ] Start a new one from the composer's **+** → Propose, or type `/vote Should we … | Yes | Later`.

**Autopilot and GitHub**
- [ ] With a token saved, both repos exist on GitHub (private). Push a commit from another clone → within a
      minute or two the host's repo fast-forwards (Repo tab activity: "Autopilot pulled …").
- [ ] Every commit becomes a short gist in chat, with the lane's folder chip, not a raw diff.

**@ai for friends without Claude**
- [ ] A phone-only friend types `@ai how do I make the jump higher?` in chat: it is answered by their own
      Claude, a teammate's Claude (by owner policy), the local model, or queued on the Board.

**Auto update**
- [ ] Desktop app: when a new release is out, Settings / the update pill offers **Restart to update**.
- [ ] Working copy (this demo): it pulls `dev` every 20 seconds; open tabs reload by themselves.

**Play**
- [ ] Lantern Run: everyone finishes all three levels. Then each lane ships one small polish from the plan.
- [ ] Tavern 3D: walk up to a patron and press E; Tab → Patrons → Follow me / Stay / Go to your spot.
      Every patron carries a BOT tag.

## For tests

`app/test/e2e_demo_tribe.py` runs the script against a throwaway server (GitHub mocked) and checks the projects,
roles and folders, tasks, the living doc, the vote, the toolbox, autopilot, the GitHub push, the repos on disk,
and that both games load with no console errors (Lantern Run's jump and run through `window.__lantern`, the
tavern's patrons, panel and orders through `window.__tavern`; three.js comes from the CDN or, in a sandbox
without it, from the npm tarball of the same version).
