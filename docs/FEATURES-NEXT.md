# Features next

> Historical idea list (2026-11-06); many items have shipped since. `scripts/explore.py` still reads it to mark repeat suggestions. Current next steps: HANDOFF.md › Next steps.

Written during the v0.4 audit (2026-11-06). The ideas follow the vision in docs/CONTEXT.md: multiplayer vibecoding, humans deciding and agents doing, phones as first-class, Game Studio, the Workshop and the Tribe Brain, and the Secretary.

The doc has two parts:
- **Part 1:** the raw 50 ideas, one line each, with why.
- **Part 2:** the same ideas tightened. Overlaps are merged, weak ones cut, and the rest grouped into Quick wins, Next and Later.

## Part 1: 50 ideas

**Chat as the control room**
1. Load earlier messages: chat showed only the last 100. Long-running tribes lose their history.
2. Search the chat (UI + agents): "what did we decide about lava?" is the most common question in a team chat.
3. Share any file in chat: PDFs, zips and big photos were silently turned into empty stub docs.
4. Composer drafts survive reloads: phones reload PWAs all the time, and a half-written message vanished.
5. Unread count in the tab/window title: you can tell from the taskbar that friends are talking.
6. Threads (reply chains collapse under the first message): busy build chats bury questions.
7. Message permalinks ("Copy link" → jumps and highlights): you can point a friend or an agent at one message.
8. Scheduled messages / "post at 9am": coordinate across time zones.
9. Slash-command autocomplete (/task, /vote, /decide, @brain, @secretary): commands exist but nobody can discover them.
10. Edit your last message with ↑: chat muscle memory from Slack and Discord.
11. Read receipts for humans in DMs (opt-in): parity with the agent-channel receipts.
12. Link unfurl for GitHub PRs/commits/issues: the repo is the product, so show its status inline.

**Agents + humans**
13. Agent "standup" gist every morning per agent: humans see agent progress without reading logs.
14. `search_chat` MCP tool: agents can find decisions instead of asking again.
15. Agents' `read_chat` shows media and votes: agents saw blank lines for voice notes and images.
16. Approve from the lock screen (Web Push actions): the core loop is "agents propose, humans tap".
17. Agent budget meter (tokens/time per agent per day, set by the owner): keeps vibecoding affordable.
18. "Pair" mode: two humans' Claudes share one task, with the claims split automatically.
19. Agent hand-off notes are written into the task when an agent goes idle: no lost context.
20. Agent sandbox preview: an agent's branch runs in an iframe preview before merge.
21. Conflict pre-flight: before an agent claims a file, warn when a human is editing it in Docs or the repo.

**Persistence, data, trust**
22. One-click backup (.tar.gz) from Settings: "permanent persistence" needs an exit door.
23. Scheduled automatic backups (daily, keep 7) to a second folder or drive.
24. Restore from backup in the app (drop the archive on the desktop app).
25. Rename yourself everywhere: Settings changed the name only on that device.
26. A tribe export that is git-friendly (everything but `.tribe/`) with one click: an archive anyone can read.
27. Audit log of admin actions (invites, revokes, role changes): accountability among friends.
28. Data retention settings (auto-trim chat media older than N days): keep the host's disk in check.

**Friends, phones, joining**
29. Join a second project from an invite while signed in: it was impossible before.
30. QR invite on the phone (show the code to someone at the same table): the fastest join.
31. "Who's here" join toast with a wave back (one tap): warmth when a friend arrives.
32. Offline queue on phones: messages typed without signal send when back.
33. Push "Your friend's computer is back online": friends stop poking a dead link.
34. Spectator links for streaming / showing parents: the read-only role exists, but sharing it is clunky.
35. Per-project notification levels (all / mentions / none).

**Game Studio**
36. Play button: run the project's game in the preview pane, with friends seeing the same build.
37. Playtest session: everyone plays the build at once, and reactions/bug reports are tagged with a timestamp.
38. Level editor doc type (grid + palette in a doc, saved as JSON in the repo).
39. Asset drop → sprite sheet: drop PNG frames and the Workshop packs an atlas.
40. "Game jam" mode: a timer, a theme vote, and a final build gallery.

**Workshop / Tribe Brain**
41. Recipes from gists: when a progress gist lands with a passing test, offer "Save as recipe".
42. Replay-first: before an agent builds, `find_recipe` suggests matching recipes (local brain).
43. Tool scout digest: weekly upgrade gists from GitHub search, humans approve.
44. Shared compute: friends opt in as build/test workers; the host hands out jobs.

**Secretary / dashboard**
45. Morning digest on the phone (push): what changed overnight, what needs you.
46. "Catch me up" button per project: the Secretary summarizes since your last visit.
47. Voice memo → tasks: a voice note is transcribed and split into tasks by the brain.

**Reliability + polish**
48. WebSocket heartbeat (no ghost "online" friends): phones that lose signal stayed online forever.
49. Health page for the host: disk use, tunnel status, last backup, version, errors in the last hour.
50. Keyboard map overlay (?) and focus-visible everywhere: accessibility and power users.

## Part 2: tightened

### Merged and cut
- Merged: 2 + 14 (one search, UI and agents) · 22 + 23 + 24 + 26 (backup → scheduled → restore) · 16 + 45 (lock-screen actions belong with push) · 41 + 42 (recipes are one feature: save + replay) · 36 + 37 (Play then Playtest) · 13 + 19 (agent gists on idle/morning) · 30 + 34 (share sheet: QR / spectator / device link).
- Cut for now: 8 (scheduled messages: niche for friends), 11 (human read receipts: social pressure, little value), 18 (pair mode: coordination already covers it via lanes), 28 (retention: the disk isn't a problem at friend scale yet), 40 (jam mode: comes after Game Studio exists).

### (a) Quick wins (≤ 1–2 h each)
Done in this audit (`feat/audit`), each with a test:
1. ✅ Load earlier messages (#1): `?before=` paging, keeps your place. Test: `e2e_quickwins.py`
2. ✅ Search the chat + `search_chat` MCP (#2, #14). API and agents; a search box in the palette is the next step (palette.js belongs to nav)
3. ✅ Share any file in chat (#3): `chat/media/<id>.bin`, a download chip. Tests: `e2e_friend_flow.py`, `e2e_quickwins.py`
4. ✅ Drafts survive reloads (#4)
5. ✅ Unread count in the title (#5)
6. ✅ One-click backup (#22): Settings → Download backup, restore = extract + `--dir`
7. ✅ Rename yourself everywhere (#25): `PATCH /api/me`
8. ✅ Join a second project from an invite while signed in (#29)
9. ✅ Agents' read_chat shows media and votes (#15)
10. ✅ WebSocket heartbeat (#48)
11. ✅ Edit your last message with ↑ (#10)

Still quick, not yet done:
- Slash-command autocomplete (#9)
- Message permalinks (#7)
- "Who's here" wave-back toast (#31)
- Keyboard map overlay (#50)
- Per-project notification levels (#35)

### (b) Next (this month)
1. Lock-screen approvals + morning digest push (#16, #45)
2. Play button → Playtest session (#36, #37): the Game Studio MVP
3. Recipes: save from a gist, replay first (#41, #42)
4. Scheduled backups + restore in the app (#23, #24)
5. "Catch me up" per project (#46)
6. Offline send queue on phones (#32)
7. Threads (#6)
8. Health page for the host (#49)
9. Agent budget meter (#17)
10. GitHub link unfurls (#12)

### (c) Later
1. Shared compute workers (#44)
2. Tool scout digest (#43)
3. Level editor doc type (#38)
4. Asset drop → sprite atlas (#39)
5. Agent sandbox preview per branch (#20)
6. Conflict pre-flight between Docs/repo edits and agent claims (#21)
7. Audit log of admin actions (#27)
8. Voice memo → tasks (#47)
9. Share sheet: QR, spectator and device links in one place (#30, #34)
10. "Host is back online" push for friends (#33)

## Part 3: from the Explorer (2026-11-07)

`npm run explore` (docs/EXPLORER.md) clicked through the app on desktop, on a phone, in the desktop app and with no tribe. It also ran the core-intent journeys: agents collaborating, the Claude Code connector, repo autopilot, chat fidelity and notifications. These ideas come from where it got stuck or took the long way. Anything already listed above is left out; where an idea builds on an existing one, the link is noted.

### Quick wins
1. **A visible "Preview app" on desktop.** On desktop the preview opens only from Ctrl K or the Home fleet row; the journey "Preview the app" found no button. Add it to the project header or the project home. On phones it already sits on the repo hero.
2. **"Ask for a hand-off" in one tap.** When a claim is refused, a human sees "claimed by X" in the Ownership map. A button there should send X a hand-off request: agents now get a next step in the refusal text, and humans should get one too.
3. **Hint before the #agents channel refuses.** Sending without an @mention answers 400 ("@mention an agent"). Show the hint, with @-autocomplete, while typing. This pairs with slash-command autocomplete (#9).
4. **Empty states with one action.** "No milestones yet" should offer "Add a milestone", "No change requests" should offer "Send a request from your phone", and Conflict radar's "No overlaps" should offer "Give me a branch". Each one a single button.
5. **Dark ink on Ember for small text.** White on Ember is 3.05:1, under AA for text below 18px. Use canvas-colored ink on Ember buttons and badges, or keep Ember for large labels only. This needs a decision in DESIGN-SYSTEM.md. The Home "New project" tile's subline (#FDE4D6 on Ember, 2.5:1) belongs to the Home redesign.

### Next
6. **Insights that fix themselves.** Every `/api/insights` item gets one action: Download backup, Connect GitHub, Install Ollama, "Open the view" for explorer findings, and "Make it a task" for suggestions. This builds on the Health page (#49), which `/api/insights` now feeds.
7. **Nightly explorer with a delta.** A scheduled `npm run explore` uploads `findings.json` (POST /api/insights/explorer) and posts a gist in #agents: fixed, new and still-open findings since last night. Agents pick up the "new" list as tasks.
8. **"Ask the host for the public link" from the Connect card.** A member who sees no "Anywhere" command can't turn on the tunnel. One tap should notify the host, and the command should appear for the member once the host approves.
9. **Send report on any error toast.** Errors that reach a toast get "Send report". It goes through the self-heal error budget, so repeats are filed once.

### Later
10. **Explorer journeys written by the tribe.** A `journeys/` folder of plain-step goals ("invite a friend", "ship a level"), so a project's own app gets clicks-to-goal tracking in the milestone report.
