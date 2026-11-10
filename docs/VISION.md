# TribeCode vision

*The product's vision (not a tribe's own `VISION.md`, which the Board votes on). Written 2026-11-07 from [RESEARCH-2026-11.md](RESEARCH-2026-11.md). [CONTEXT.md](CONTEXT.md) keeps what's in flight; this doc says where we're going and what we won't do.*

**TribeCode is the campfire where a few friends and their Claudes build one thing together, around one shared GitHub repo.**

**New in v0.27:** build apps, games and websites with your friends, and run the business around them. One person or a whole crew: give each role to a friend or an AI helper, and keep the decisions human. See [COMPANY.md](COMPANY.md).

Not another hosted app builder. A room: one link to join, phones welcome, your own agents, your files, any engine.

---

## 1. The niche we own first

**Small crews (2–8 people) building one thing together over a weekend, each with their own Claude Code.** The first wedge is **game jams and tiny game studios**, then hobby apps.

Why this crowd:

- **They exist at scale and already work in teams.** GMTK 2026 had 37,000 people. Vibe Jam 2026 had 945 games that were 90%+ AI-written, with a bonus for multiplayer.
- **Games show bugs instantly**, so vibe coding works better there than anywhere.
- **Nobody serves them on their own terms.** Hosted builders are single-player and bill per attempt. Zed Delta targets engineers in an editor. spawn.co has the "with friends" magic, but only inside its own engine, cloud and economy.

Who we're **not** for, yet: companies with compliance needs, solo founders shipping SaaS (Lovable already does that), large engineering teams. *(v0.27 widens this: Company mode gives solo founders a one-person C-suite of AI helpers, and friend crews a way to run what they build. We still don't chase compliance-heavy companies or large engineering teams.)*

## 2. Why we win there

| They | We |
| --- | --- |
| Pay per attempt (credits, checkpoints) | Your Claude subscription plus a free local model. No TribeCode bill. |
| Your code on their servers | Plain files and git on a friend's computer. Leave any time with everything. |
| Single-player, or a shared IDE | A room: lanes, #agents, approvals, huddles, votes |
| Desktop only | Phones are full members: voice notes, one-tap approvals, @ai |
| Their engine (spawn) | Any engine: three.js, Phaser, KAPLAY, Godot, Expo |
| "Learn the terminal, git and folders" (plain Claude Code) | One line to connect. Folders, repos, pushes and versions done for you. |
| Agents step on each other | Claims, lanes and conflict radar across *people's* agents |

## 3. The flair (keep it, it's the brand)

- **Matte, calm, craft.** Flat surfaces, 1px borders, Ember/Teal/Indigo on obsidian. No glows, gradients or AI sparkle. It should look like a tool made by people who care.
- **The campfire.** Tribe, huddle, gists, the flame. Warm words, not enterprise words. Presence is visible: who's here, which agent is working on what.
- **Phones first-class.** Everything a non-coder needs fits on a phone. A friend with no computer and no subscription still belongs.
- **Zero-step.** No wizard, no account, no form. Open, name, invite, build.
- **Humans decide, agents do.** Every risky action waits for a person's tap.

## 4. The north-star experience

> Friday, 7 pm. Maya opens TribeCode and taps **Invite a friend**. She texts the link to three friends. Two join from their phones on the bus; Theo joins from his laptop and pastes the one line that connects his Claude.
>
> Maya picks **Jam: 48 h** and a starter from the **Workshop**: a Phaser platformer someone featured last month. TribeCode imports it, checks its license, installs what it needs and gives everyone a lane: art, levels, movement.
>
> On the bus, Ana records a voice note: "the jump feels floaty". It lands as a task. Theo's Claude takes it, changes one number in its lane and posts a gist. Ana plays the new build on her phone and taps **Approve**.
>
> Sunday night, Maya taps **Ship**. The game goes to GitHub Pages and itch.io with version 1.0, a changelog written from the chat, and credits for every person and agent. The best bits (the jump tuning, the sprite pipeline) are saved as **recipes** for the next jam.
>
> Nobody opened a terminal except to paste one line. Nobody paid for credits. The code is on Maya's computer and on GitHub.

## 5. Rules that keep it simple

1. **Four rows, forever.** Chat, Docs, Tasks, Agents. New things become a tab, a sheet, a Ctrl K entry or a profile-menu item. Never a fifth row, never a floating button.
2. **One hero per screen.** If a feature needs a second hero, it needs its own screen.
3. **Off by default, one switch to turn on.** Engines, mobile mode, the Office, autopilot.
4. **Never install or run anything without a person's tap.** Imports copy files; installs show the exact command and license first.
5. **Ride Claude Code, don't fork it.** Use its skills, plugins, MCP and agent teams; add only the multiplayer layer.
6. **Plain files and git are the database.** If it can't be exported in one tap, don't build it.
7. **Phones in the same release.** Every feature checked at 390px.
8. **Cut before you add.** Each milestone removes or merges at least one thing.

## 6. Roadmap

### Now (next 2–3 milestones): make the core effortless

- **Guide** ✅: tucked-away how-to pages (profile menu, Ctrl K, Settings), `docs/guide/*.md`.
- **One-tap versions, releases and pushing**: a **Ship** button on the project that does commit → tag → push → release notes from Milestones and chat. **Undo to version…** restores any tag. The GitHub sign-in already exists; this puts it behind one verb.
- **Get organized**: every project gets a predictable folder (`~/TribeCode/Projects/<name>`) with **Open folder** and **Open in Claude Code** buttons, so nobody hunts for paths again. **Upload a repo** = drop a folder or paste a URL (exists); **push a repo** = automatic once signed in.
- **Dependency installs, safely**: detect `package.json`, `requirements.txt` or `project.godot`, then show one card: "Install 12 packages (npm ci)". Show licenses and a lockfile diff, run on the host only after a tap, and log it to the journal. Never on agents' say-so alone.
- **Workshop: featured projects**: a **Featured** strip on the Workshop's Starter shelf, curated in the community repo (`featured.json`) over jsDelivr: playable link, screenshot, engine, license, "Start from this".
- **Jam mode**: a project template with a timer, a theme vote, auto-lanes, and a submission checklist (itch.io page, build, credits).

### Next (this quarter): the best toolbox for vibe coding with Claude

- **Repo importer → reference code, templates and skills.** Paste a GitHub URL. TribeCode:
  1. checks the license (SPDX; MIT, Apache-2.0, BSD, CC0, CC-BY or MPL are allowed; GPL is flagged as "reference only, don't copy into closed projects"; no license means read-only),
  2. shallow-clones it into `workshop/reference/<repo>@<sha>`, pinned to a commit,
  3. builds a map (README, entry points, key files) with the local model,
  4. offers three outputs: **Template** (start a project from it), **Skill** (a `SKILL.md` built with Skill Seekers-style conversion, reviewed by a person), **Recipe** (a feature extracted with a check).
  Credits and the license travel with every copied file.
- **Skills & MCP catalog**: browse Anthropic's official, community and `anthropics/skills` marketplaces plus the tribe's Workshop in one list. **Add to my Claude** shows the exact `/plugin install …` or `claude mcp add …` line, its scope, and what it can touch. The Starter shelf picks per project type (game/site/app).
- **Engine packs** (each a template + skill + MCP + preview), off until chosen:
  - **Browser 2D/3D**: Phaser, KAPLAY, three.js, with the Game Studio `/play/` proxy and lanes (docs/GAME-STUDIO.md).
  - **Godot**: a Godot MCP server (e.g. Coding-Solo/godot-mcp, MIT) so agents run the game and read errors; web export for phone playtests.
  - **A spawn.co-style data engine as reference**: objects in YAML, behaviors as small scripts, HUD in HTML, every game a git repo, "places" and instances. We learn from the shape (agent-friendly, diffable data) and build it on three.js/KAPLAY in the open. We don't clone their platform or economy.
- **iOS/Android mode** (a project switch): an Expo template, Expo Go QR previews on everyone's phone, EAS build and submit with the owner's own accounts. Hidden unless switched on.
- **Viewers in Docs**: a **GLB/glTF viewer** (three.js, orbit, animations list) and a **pixel-art viewer** (nearest-neighbour zoom, sprite-sheet frames, palette) for files in the repo and the Workshop. They're hero images when they're the project's art.
- **Recipes replay** (Tribe Brain step 2): the local model matches a task to a saved recipe and applies it with its check, so Claude only fills the gaps.

### Later: the #1 place to vibe code together

- **Public Workshop**: tribes publish projects, recipes and skills to the community shelf; remix with credit ("Suggest to original", like Websim's flow but via git).
- **Jams on TribeCode**: hosted jam pages that link tribes, play links and voting. The jam is the growth loop.
- **Other apps and engines**: Unity/Unreal via their MCP servers when they're solid, Figma import for UI, Blender export to GLB.
- **Shared compute** across friends' machines (docs/SHARED-COMPUTE.md) and hosting that moves between friends (docs/MOBILE-TRIBES.md).
- **Native phone apps** (Tauri iOS/Android) once the PWA hits limits; a TURN relay for huddles on cellular.

## 7. What we will NOT build

- **Our own model or token billing.** People bring Claude (or a local model). No credits, ever.
- **A hosted cloud copy of tribes.** Optional relays for links are fine; storing people's code is not.
- **Our own code editor or IDE.** Claude Code, VS Code and Zed exist. We're the room around them.
- **Our own game engine or marketplace economy.** Templates on open engines, yes; spoins, no.
- **Auto-installing anything from the internet**, or agents approving their own work.
- **Scraping repos without licenses into templates**, or stripping credits.
- **Feeds, likes and follower counts.** Featured is curated; there's no infinite scroll.
- **Enterprise admin, SSO and compliance**, until a real crew asks.
- **A fifth sidebar row.**

## 8. How we'll know it's working

- A new friend goes from link to first message in **under 60 seconds**, on a phone.
- A host goes from install to "friend joined + Claude connected" in **under 5 minutes** without the guide. The guide is the safety net, not the path.
- A jam crew ships a playable build with **zero terminal use** beyond the one connect line.
- Every milestone: the Explorer finds **no dead buttons**, and one thing got removed.
