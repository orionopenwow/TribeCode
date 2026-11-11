# Grok's scope, and how TribeCode gives each ability as a basic feature

Researched November 10, 2026. "Grok bot" here means xAI's Grok and its building side: **Build Mode** (prompt to app in
the Grok apps), the **Grok Build** coding agent, and **Grok Bot** (always-on agents). It does not mean Groq, the
inference company. The design comparison with Figma and Make is in [EDITOR-PARITY.md](EDITOR-PARITY.md); this page maps
abilities to TribeCode's principle, **basic features, supercharged by AI** ([DESIGN-SYSTEM.md §11](DESIGN-SYSTEM.md#11-basic-features-supercharged-by-ai)).

## What Grok can do today (paraphrased)

- **Build Mode (prompt to app).** Announced in late July 2026 for the top tier, then opened to every plan on web and
  mobile in mid-August. You describe a website, an app with working logic, a game or a dashboard, and Grok writes the
  code and runs a live preview inside the chat. You keep refining by talking (layout, features, restyle). Apps publish
  to a grok.me link or a custom domain, can be remixed, exported to GitHub, keep secrets for API keys, and get a
  generated cover image. Apps shared on X show an inline card (games get a play button). Apps can call Grok for chat,
  images and voice from their own code without API keys, with per-app revoke.
- **Grok Build (coding agent).** A terminal agent (interactive, headless for CI, or driven by editors over the Agent
  Client Protocol). Plan mode drafts a plan and diffs and waits for approval; code mode edits and runs commands; ask
  mode only reads. Up to eight subagents run in parallel, each in its own git worktree. Beta in May 2026, 1.0 in August;
  the harness is open source (Apache 2.0), the model is not.
- **Skills and connectors.** Reusable instruction folders around a `SKILL.md` (Claude Code skills work as is), five
  built-in skills (Word, slides, spreadsheets, PDFs, a skill creator), and about thirty hosted connectors (GitHub,
  Gmail, Notion…) plus bring-your-own MCP. A voice connector answers spoken requests from connected apps.
- **Grok Bot (always-on agents).** Early beta from August 11, 2026: named bots on a persistent cloud computer with a
  browser, files and logins, that keep memory, run routines on a schedule, can be taught a task by recording a few
  minutes of browser work, and work in small teams that hand off to each other. Boundaries are written in prose; there
  is no sandbox and no per-action audit view yet. Paid tiers only.
- **Images, video and voice.** Imagine (images and image-to-video) and Voice share one weekly usage pool with chat and
  Build. Since October 2026 one subscription bundles X, Grok and Cursor.

## The map: Grok ability → TribeCode basic feature → local brain → AI

"Basic" works with no AI at all. "Local brain" is Flint's rules, recipes and NLU (`app/ui/flintnlu.js`), plus a small
model when there is one. "Supercharged" is Claude, or any member's own AI, or the host's key (`server/llm.js`).

| Grok ability | Basic (no AI) | Better with the local brain | Supercharged (Claude or your own AI) |
|---|---|---|---|
| Prompt to app/site/game with live preview | Free recipes: landing page, to-do, 2D/3D game, video editor, 16 site templates (`server/flintfree.js`, `server/sitelib.js`), live preview | Flint fills name, words and accent from what you said; WebLLM/Ollama writes short copy | A member's Claude Code builds the rest in the same preview, plan first |
| Refine by talking (restyle, layout) | Point and edit + the property sheet, Undo (`server/preview.js`) | "make it bigger", "teal", "dark version" parsed locally | Open-ended changes go to your AI with the picked element as context |
| Plan mode | Tasks, "✦ Split into steps", "✦ Estimate" (rules) | — | ✦ refined plan from the tribe's AI; Claude Code plan mode |
| Parallel subagents in worktrees | Lanes, claims, ownership, conflicts (`server/claims.js`, `server/agentnet.js`) | — | Each friend's Claude works in parallel, coordinated in #agents |
| Publish, remix, GitHub export | Play links with a safety check, remix bar, the repo (`server/publish.js`, `server/repo.js`) | — | Agents ship through gated merges |
| Cover image for shared apps | The pinned repo hero uses the README image or a screenshot (`server/thumb.js`) | Inspiration board palette dresses the site | AI images where a member connected one (Studios) |
| Skills | Tribe skills Flint learns from repeats (`server/flintmem.js`), the build kit (`server/buildkit.js`) | Taught phrases ("when I say…") | Claude Code skills via MCP |
| Connectors / MCP | TribeCode's own MCP server and directory (`server/mcp.js`, `app/ui/mcpdir.js`) | — | Any member's agent with its own connectors |
| Voice | Dictation into Flint and chat, voice notes with transcripts, huddles | Local transcripts | Summaries of huddles and voice notes |
| Always-on bot with memory and routines | Flint remembers you (`server/flintmem.js`), the Secretary, autopilot, reminders, Company seats with charters | Today's plan on Home (✦, rules) | Seats held by AI helpers; a seat's ✦ charter drafted by the AI |
| Teach a task once | "When I say X, do Y", "no, I meant…" (taught phrases) | Did-you-mean learning | Agents turn repeats into skills |
| Images in apps | The inspiration board: openly licensed pictures and sounds from Openverse and Wikimedia Commons, credited | Server-side palette, font pairing, "Use my board's style" | AI describes and tags files; AI images via Studios |
| Business data → dashboards | Sheets with formulas, decks, docs from templates | — | ✦ summaries, Flint writes the sheet or deck |

## The everyday ✦ (shipped in this pass)

Chat: summarize the thread, turn it into tasks (with who and when). Tasks: split into steps, estimate, suggest an owner.
Docs and notes: tidy, outline, continue. Files: describe and tag. Home: today's plan. Company: fill in a seat's charter.
Each answers at once from rules and says "Basic · no AI"; with an AI on, the same card refines in place and says "✦ via
<model>". Code: `app/ui/aibasics-core.js` (rules), `app/ui/aibasics.js` (the ✦), `server/aibasics.js` (refine). Test:
`app/test/e2e_ai_basics.py`.

## Where TribeCode stays different

- Free and self-hosted: no usage pool, the host's machine does the work, and nothing needs a subscription to start.
- Friends, not a solo chat: every friend brings their own AI, and humans approve with one tap.
- Honest tiers: Flint says what he did with rules and what an AI added ([FLINT-TIERS.md](FLINT-TIERS.md)).
- Licenses respected: the inspiration board keeps a copy of each thumbnail with its license, creator and source.

## Sources

- xAI, "Grok Build Mode" announcement (July 28, 2026): https://x.ai/news/grok-build-mode
- xAI, "Grok Build for everyone" (August 19, 2026): https://x.ai/news/grok-build-for-everyone
- RuntimeWire, Grok Build on every plan with X distribution (August 20, 2026): https://runtimewire.com/article/spacexai-grok-build-every-plan-x-app-distribution
- Codersera, Grok Build, Skills and Connectors guide (2026): https://codersera.com/blog/xai-grok-build-skills-connectors-guide-2026/
- eesel AI, Grok Bot review (2026): https://www.eesel.ai/blog/grok-bot-review
- Mean CEO blog, Grok news, November 2026: https://blog.mean.ceo/grok-x-ai-news-november-2026/
- Openverse API (images and audio, CC-licensed, with attribution): https://api.openverse.org/v1/
