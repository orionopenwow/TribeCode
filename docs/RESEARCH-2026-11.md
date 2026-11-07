# Research: the vibe-coding landscape, November 2026

What the market looks like, what people love and hate, and where a self-hosted, multiplayer, bring-your-own-Claude app can win. It feeds [VISION.md](VISION.md). Every claim links its source. Many sources are vendors or blogs selling something nearby, and the notes say so where it matters. Numbers are as reported, not audited.

Researched 2026-11-07 with web search and direct fetches. spawn.co was read from its own site.

## Top 10 findings in plain words

1. **The big builders are huge, and they're all single-player.** Lovable passed $400M a year in revenue by February 2026, and Cursor reportedly passed $2B ([aiproductivity.ai](https://aiproductivity.ai/news/lovable-400m-arr-146-employees/)). Their collaboration is a team plan or a shared workspace, not friends building live together.
2. **Pricing per attempt is the top complaint.** Credits burn on failed fixes, so bills are hard to predict. That's true of Lovable/Bolt-style builders ([DEV, Reszka](https://dev.to/pawel_reszka/the-no-code-credit-trap-how-ai-builders-are-quietly-draining-your-budget-20p4)), Replit's effort-based checkpoints ([Jet Admin](https://www.jetadmin.io/blog/replit-review/)) and Cursor's 2025 switch to credits ([Jet Admin](https://www.jetadmin.io/blog/cursor-pricing-explained-plans-credit-system-and-real-costs-in-2026/)). A friend group with flat Claude subscriptions and a local model doesn't have this problem.
3. **Hosted means trusting someone else with your code.** From Feb 3 to Apr 20, 2026, any Lovable user could open public projects' chat history and source code. Researchers' reports were closed instead of escalated ([Lovable's own post](https://lovable.dev/de/blog/our-response-to-the-april-2026-incident)). "Your files stay on your computer" is a real selling point now.
4. **The "70% wall".** Hosted builders get you most of the way, then stall on real auth, custom logic and integrations. People move to code-aware agents like Claude Code and Cursor for anything they'll maintain ([Sorceress summary of Reddit threads](https://sorceress.games/blog/vibe-coding-reddit-top-threads-decoded-2026)). TribeCode is built on Claude Code, so it starts on the right side of that wall.
5. **Multiplayer with agents just became a category, from the pro side.** Zed launched Delta (Aug 12, 2026; public beta Sep 16): a shared space for agent threads, with review in subthreads instead of pull requests ([Digital Applied](https://www.digitalapplied.com/blog/zed-ai-coding-deep-dive-multiplayer-agents-2026), [RuntimeWire](https://runtimewire.com/article/zed-launches-delta-ai-code-review-agent-conversations)). It targets engineers in an editor. Nobody owns "friends, phones, a weekend, one link".
6. **spawn.co is the closest thing to our game future, but it's a closed island.** It calls itself "Your Place to Make Games with Friends": an AI builder (Savi), its own engine, multiplayer from the start, each game a Git repo with YAML objects, scripts and an HTML HUD. It has one-click publishing, jams, a Discord, mods, and you can bring Claude Code or Codex. It's free to make and play, and creators keep 50% of in-game spending ([spawn.co](https://spawn.co)). The catch: their engine, their hosting, their economy. Our angle is the same "with friends" feeling, but with any engine and the files on your machine.
7. **Game jams are the natural wedge.** GMTK Game Jam 2026 had 37,000 people and 10,500+ games ([GMTK](https://gamemakerstoolkit.com/jam)). Vibe Jam 2026 drew 945 browser games with 90%+ AI-written code and gave bonus points for multiplayer ([Colyseus](https://colyseus.io/blog/vibe-jam-2026/)). Jams are short, done in teams, in the browser, and a huge AI-native crowd is already there.
8. **Claude Code is now a platform.** Plugins bundle skills, agents, hooks and MCP servers. Anthropic runs official, community and demo marketplaces, plus a web catalog with install counts ([Claude Code docs](https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md)). Agent teams (experimental) share a task list and warn against two teammates editing one file ([docs](https://code.claude.com/docs/en/agent-teams.md)), which is the same problem our lanes solve across people. Remote Control continues a local session from a phone ([docs](https://code.claude.com/docs/en/remote-control.md)). We should ride this ecosystem, not rebuild it.
9. **Turning repos into skills is already open source.** Skill Seekers (MIT, ~13.9K stars) converts docs sites, GitHub repos and PDFs into Claude skills with conflict detection ([getstack](https://getstack.dev/yusufkaraaslan/Skill_Seekers)). Godot has several MCP servers that run the game and read errors, e.g. Coding-Solo/godot-mcp (MIT) ([Summer Engine roundup](https://www.summerengine.com/blog/best-godot-mcp-server.md), a vendor). Mobile builders like Rork use Expo: scan a QR to run on your phone, EAS to ship to the stores ([nocode.mba](https://www.nocode.mba/articles/rork-ai-review-2026)). We can leverage all of these instead of writing our own.
10. **The terminal is still the wall for newcomers.** Guides for non-developers spend their time on the black window, getting lost in folders and frozen prompts. In teams, a technical "champion" sets up Claude Code for everyone else ([Seibert Group](https://agents.seibert.group/knowledge/non-developers)). There are even books about it, like "Terminal 101 for Claude Code: The Non-Coder's Only Guide" ([Storytel listing](https://www.storytel.com/sg/books/terminal-101-for-claude-code-the-non-coders-only-guide-before-starting-claude-code-13671327)). That champion is our host, and TribeCode is the champion's tool.

## The landscape

| Product | What it is | Price (as reported) | Multiplayer | Where code lives | Source |
| --- | --- | --- | --- | --- | --- |
| Lovable | Prompt-to-app for non-technical founders; auth, DB, hosting built in | Free 5 credits/day; from $25/mo | Workspace, not live co-building | Lovable cloud (GitHub sync) | [Tech Insider](https://tech-insider.org/au/lovable-vs-bolt-new-vs-v0-2026/) |
| Bolt.new | Prompt-to-app with Node in the browser; any framework | Free 1M tokens/mo; $25/mo; teams $30/member | Team plan | Bolt cloud (GitHub sync) | [Tech Insider](https://tech-insider.org/au/lovable-vs-bolt-new-vs-v0-2026/) |
| v0 | React/shadcn front ends for Vercel | Credits; team tiers | Team plan | Vercel | [Tech Insider](https://tech-insider.org/au/lovable-vs-bolt-new-vs-v0-2026/) |
| Replit Agent | Browser IDE + agent + deploy | Core $20; Pro from $100; Teams sunset Mar 2026 | Real-time co-editing (Pro) | Replit cloud | [Jet Admin](https://www.jetadmin.io/blog/replit-review/) (competitor) |
| Cursor | AI editor, agents, cloud agents | Pro $20, Pro+ $60, Ultra $200, Teams $40/$120 per user | Teams billing, not live rooms | Your machine + cloud agents | [Jet Admin](https://www.jetadmin.io/blog/cursor-pricing-explained-plans-credit-system-and-real-costs-in-2026/) |
| GitHub Copilot | Completions + cloud agent that returns PRs | Pro $10 (cloud agent, 1,500 credits), Pro+ $39, Max $100 | Through GitHub | GitHub | [Morph](https://www.morphllm.com/copilot-coding-agent) |
| Zed Delta | Multiplayer agent threads, review without PRs | Free in beta | Yes (pro devs) | Git-compatible, DeltaDB | [Digital Applied](https://www.digitalapplied.com/blog/zed-ai-coding-deep-dive-multiplayer-agents-2026) |
| Claude Code | Terminal/desktop/web agent; skills, plugins, MCP, agent teams | With Claude plans or API | Agent teams within one person's session | Your machine | [docs](https://code.claude.com/docs/en/agent-teams.md) |
| spawn.co | AI game builder + engine + hosting + creator economy | Free; creators keep 50% of spoins | Built for it: games are multiplayer | spawn's platform, Git per game | [spawn.co](https://spawn.co) |
| Websim | Prompt-made web toys and games with a remix feed | Credits | Group building: visitors vote on ideas the agent builds | Websim | [Latent Space wiki](https://latent.space/wiki/websim-ai-0309f8a4/) |
| Rork | AI mobile apps on React Native + Expo | $25–$1,800/mo credits | No | Rork + Expo EAS | [nocode.mba](https://www.nocode.mba/articles/rork-ai-review-2026) |
| Dyad / bolt.diy | Open-source local app builders, bring your own key or Ollama | Free | No | Your machine | [VP0](https://vp0.com/blogs/open-source-lovable-alternative.md) (vendor) |

## What people love

- **Speed from idea to something playable.** The upvoted view is that it works best with someone reviewing the output ([Sorceress](https://sorceress.games/blog/vibe-coding-reddit-top-threads-decoded-2026)).
- **Games give instant feedback.** Bugs show up the moment you play, and the asset pipeline matters more than the model (same source).
- **Remix culture.** Websim's feed, remix and "Suggest to original" flow, and group builds with 30+ contributors ([Latent Space](https://latent.space/wiki/websim-ai-0309f8a4/)).
- **Making it with friends.** spawn's whole pitch, plus jams, a Discord and creator payouts ([spawn.co](https://spawn.co)).

## What people complain about

- **Unpredictable bills**: credits per attempt and fix loops ([DEV](https://dev.to/pawel_reszka/the-no-code-credit-trap-how-ai-builders-are-quietly-draining-your-budget-20p4), [Jet Admin](https://www.jetadmin.io/blog/replit-review/), [Jet Admin](https://www.jetadmin.io/blog/cursor-pricing-explained-plans-credit-system-and-real-costs-in-2026/)).
- **Lock-in**: moving off a hosted builder means a rebuild; none offers a migration path to a competitor ([Tech Insider](https://tech-insider.org/au/lovable-vs-bolt-new-vs-v0-2026/)).
- **Security and trust**: the Lovable exposure ([Lovable](https://lovable.dev/de/blog/our-response-to-the-april-2026-incident)), and agents doing destructive things, like the Replit production-database deletion widely discussed on r/vibecoding and HN ([Sorceress](https://sorceress.games/blog/vibe-coding-reddit-top-threads-decoded-2026)).
- **The 70% wall and agent amnesia**: agents forget project rules past a few thousand lines (same source). Shared context files and lanes help here.
- **Mobile builders**: thin docs, stability, store submission is still painful (Rork, Trustpilot 2.9) ([nocode.mba](https://www.nocode.mba/articles/rork-ai-review-2026)).
- **Getting started with Claude Code**: the terminal, folders, setup ([Seibert](https://agents.seibert.group/knowledge/non-developers)).

## Under-served, where we fit

| Gap | Who almost covers it | Our answer |
| --- | --- | --- |
| A few friends, each with their own agent, building one thing live | Zed Delta (pros), Replit (one cloud IDE), spawn (one engine) | The tribe: one link, lanes, approvals, #agents |
| Phones as full members | Nobody for coding; Remote Control is one person's session | Phone rack, voice notes, one-tap approvals, @ai |
| No cloud bill, no hosted copy of your code | Dyad/bolt.diy (solo) | Host on one friend's computer; plain files plus git |
| Claude Code without the terminal and git pain | Claude desktop app (solo) | One line to connect; folders, repos, push and versions done for you |
| Jam-sized game crews on any engine | spawn (own engine), itch.io (no tools) | Game Studio on three.js/Phaser/KAPLAY/Godot, with jam mode |
| Turning open source into reusable know-how | Skill Seekers (CLI), plugin marketplaces | Workshop + importer with license checks, recipes that replay |

## Engines and tools worth leaning on

- **Browser engines** that LLMs know well: three.js, Phaser, KAPLAY (already in docs/GAME-STUDIO.md).
- **Godot** through MCP servers that run the project and read errors ([Summer Engine roundup](https://www.summerengine.com/blog/best-godot-mcp-server.md)).
- **Expo** for the iOS/Android mode: Expo Go QR previews and EAS builds, as Rork does ([nocode.mba](https://www.nocode.mba/articles/rork-ai-review-2026)).
- **Colyseus** for server-authoritative multiplayer when a game needs it; 15% of Vibe Jam's online multiplayer entries used it ([Colyseus](https://colyseus.io/blog/vibe-jam-2026/)).
- **Claude Code plugins and skills** from Anthropic's marketplaces and `anthropics/skills` ([docs](https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md)).
- **Skill Seekers** for repo/doc → skill conversion ([getstack](https://getstack.dev/yusufkaraaslan/Skill_Seekers)).

## Not verified this round

- Rosebud AI, Glitch and Discord's role as a social layer came up in searches but weren't fetched, so no claims are made about them here.
- Websim's funding and user counts aren't public in the sources read.
- spawn's money figures (like "about $500 a day" in the Creator Fund) are the company's own statements. Its page is also inconsistent about paid features.
