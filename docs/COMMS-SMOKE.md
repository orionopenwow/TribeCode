# Communications smoke test

`app/test/e2e_comms_smoke.py` checks every way people (and their Claude Code) talk inside a tribe, end to end, in real
Chrome. It is part of `npm test`.

```
python3 app/test/e2e_comms_smoke.py                       # ports 4921 (server) and 4923 (fake Ollama)
TRIBE_PORT_OFFSET=100 python3 app/test/e2e_comms_smoke.py # run beside other tests
```

It needs Python Playwright, `/usr/bin/google-chrome` and git. If the `claude` CLI is installed, it also runs the real
`claude mcp add` and `claude mcp list` (in a temporary HOME); otherwise it skips that one check and says so.

## The setup

- A host (Orion, desktop 1440px), a friend on desktop (Maya) and a friend on a phone (Jay: 390px, touch, iPhone user agent).
- One project, **Pixel Quest**, made from a folder on the host and turned into a git repo. Maya and Jay join it with a project invite, so they can only see that project. The tribe's first project (no repo) is used to check that nothing leaks between projects.
- Chrome runs with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`: a real WebRTC stack with a fake microphone that beeps.
- Every page gets a fake `SpeechRecognition`, the same object Chrome and Safari give a page. The app looks it up when it starts listening (`app/ui/speech.js`), so the test drives the real captions and Capture to notes code with `__fakeSpeech.say('…')`.
- A fake Ollama (Python `http.server`, answers `/api/tags`, `/api/generate` and `/api/chat`) stands in for the local model. The test can switch it off mid-run.

## What is covered

| Area | What the test proves |
| --- | --- |
| Project chat | A message typed on one page shows live on the other two (desktop and phone). It is stored in the project's channel file and is still there after a reload. A message in another project never reaches project-only friends, and Claude's `read_chat` doesn't see it either. |
| DMs | Phone to desktop and back, live. Only the two people can read it (the host gets 403). The unread badge counts up and clears when the thread is opened. `#general` counts up while you're in a DM. Unread survives a reload, and the thread history is still there. The phone has no sideways scroll. |
| Huddle audio | Three people join (two desktops and the phone). Every page has two `RTCPeerConnection`s in state `connected`, each with one live remote audio track and `inbound-rtp` audio `packetsReceived > 0` (and `packetsSent > 0`). |
| Huddle cleanup | When someone leaves, every side drops that peer. The leavers' connections are all `closed`, their remote `<audio>` elements are gone and their microphone tracks are `ended`. Closing the tab also takes you out of the huddle. |
| Captions → meeting notes | Captions are opt-in per person (Jay's mic is not transcribed until he opts in). Shared lines reach everyone in the huddle, the phone included. When the huddle ends, the "Meeting · …" doc in the project has the transcript by speaker, a summary and action items. "Meeting notes are ready" is posted in the project's chat. |
| Capture to notes | Speech on the phone lands in "Notes · Jay · <date>" in the project's Docs, not in another project. |
| After-huddle summary | See below: model on, model off, setting off, and a project without a repo. |
| Claude Code | See below: the command, the MCP handshake, online status, chat, and `@ai`. |

### After-huddle summary

This is a project setting, **Post a summary after the huddle**. It is off by default. The tribe host or the project's lead
switches it with the checkbox in the huddle's captions strip (or `PATCH /api/projects/:id {huddleSummary}`). Anyone
else gets a 403 and sees a read-only line. When a captioned huddle ends, or someone presses "End & summarize":

1. The local model writes a short summary and the overall mood (positive, neutral, negative or mixed). With no model, TribeCode picks the lines that carry plans and decisions (an extractive summary) and judges the mood from the words used.
2. One chat line goes to the project's channel: `🧾 Huddle summary · 3 min · Orion, Maya · mood: positive`, followed by the bullets.
3. If the project has a git repo, the summary is committed as `notes/huddles/<date>-<HHMM>.md` with the message `TribeCode: huddle notes <date>`. Only that file is committed, on the branch that is checked out, and it is never pushed (the repo autopilot or a person pushes it). The file holds the summary and the mood, not the transcript. The transcript stays in Docs, because the repo may be public.

The test checks all four cases: the model on (the fake Ollama's answer ends up in the chat and the file), the model off (extractive summary, negative mood), the setting off (meeting notes are written, but nothing is posted or committed), and a project with no repo (chat line only, no commit attempt).

### Claude Code

- The key is made through the UI (`TribeApp.connectClaude({fresh: true})`, which calls `POST /api/agents`). The printed command must match exactly:
  `claude mcp add --transport http tribecode http://localhost:<port>/mcp --header "Authorization: Bearer <key>"`.
  This is the documented form for current Claude Code (code.claude.com/docs/en/mcp: `--transport http <name> <url> --header "Authorization: Bearer …"`).
- The test replays what Claude Code 2.1.319 sends. These requests were recorded through a logging proxy during `claude mcp list`:
  1. a `server/discover` probe (`MCP-Protocol-Version: 2026-07-28`, `Mcp-Method: server/discover`). The server answers -32601, so Claude Code falls back to the older handshake;
  2. `initialize` with `protocolVersion: 2025-11-25` (answered with 2025-11-25);
  3. `notifications/initialized` (202);
  4. `GET /mcp` for a server stream (405, which the spec allows);
  5. `tools/list`.
  Then `tools/call`. A bad key gets 401.
- The agent shows online in the room as soon as Claude Code connects. Before this change, it only showed online once it called a tool.
- `read_chat` sees the project chat, and `post_chat` shows live on all three pages.
- `@ai` from the desktop friend goes to the host's Claude after the host approves with one tap. The question reaches the agent through `check_messages`, along with the project to answer in, and the answer shows in Maya's chat. With the host's policy set to "always", `@ai` from the phone goes straight to the agent, and the answer shows on the phone, also after a reload.
- With the `claude` CLI installed, the printed command is run as is, and `claude mcp list` must report `✓ Connected`.

## Bugs this test found (fixed)

1. **Meeting notes landed in the wrong project.** When the last person left a huddle by closing the tab (socket close events run outside any project), or left while viewing another project, the "Meeting · …" doc and the "notes are ready" line went to that other project. The tribe's first project usually got them. A meeting now belongs to the project where captions were turned on (`server/voice.js`).
2. **Claude Code looked offline right after connecting.** An agent only counted as online after its first tool call, so after `claude mcp add` the Connect dialog kept saying "Waiting for Claude Code…" until you asked Claude to do something. `initialize` and `tools/list` now count as "connected" (`server/mcp.js`, `touchAgent` in `server/index.js`).
3. **The MCP server echoed any protocol version.** `initialize` answered with whatever version the client asked for, so it claimed revisions it doesn't implement (for example 2026-07-28, which drops `initialize`). It now answers with the newest revision it speaks that isn't newer than the client's request (2025-11-25, 2025-06-18, 2025-03-26 or 2024-11-05). Claude Code 2.1 was not affected, because it probes with `server/discover` first, but other clients could be.
4. **`@ai` answers could land in the wrong project.** The question told the agent to "answer in #<channel>", but `post_chat` has no channel argument, so an agent working in another project posted the answer there. The question now names the project id, which `post_chat` takes (`server/askai.js`).

## What still needs a real device

The test uses real Chrome, real WebRTC and the real server, but a few things only show up on real hardware and real networks:

- **Huddles across the internet.** Peers here connect over localhost. Huddles use public STUN only (`app/ui/huddle.js`), and there is no TURN relay. On cellular data and on many office or hotel networks (symmetric NAT), audio will not connect. A TURN relay is on the roadmap. Test with one phone on Wi-Fi and one on cellular.
- **Real microphones.** That covers echo cancellation, Bluetooth headsets, a call interrupted by a phone call, and the screen locking while you're in a huddle (iOS suspends audio in the background).
- **Speech recognition.** It is simulated here. Real Chrome sends audio to Google's speech service and needs a network connection. iOS Safari's `webkitSpeechRecognition` stops after short pauses (the app restarts it) and only works in Safari or a Home Screen app, not in in-app browsers (Messenger, Instagram). Firefox has no speech recognition, and the app says so.
- **The local model.** The fake Ollama returns fixed text. A real Qwen or Llama may format its answer differently. The parser is lenient, and it falls back to the extractive summary when it can't read the answer, but a real run is worth doing once.
- **Claude Code doing real work.** The test speaks MCP exactly like Claude Code does, and checks that the real CLI connects. It does not run a model session (`claude -p`), which needs a signed-in account. Try it once by hand: connect, then ask Claude to "say hi in the tribe chat".
- **Public links.** Tailscale Funnel or cloudflared, and the mic on `https://` addresses (browsers block the mic on plain `http://` LAN addresses).
- **Push notifications.** Web Push on iPhone needs the Home Screen app (covered with mocks in `e2e_notify.py`).
