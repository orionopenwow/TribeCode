# Solo mode and the Secretary

TribeCode works with zero friends. Your own agents (Claude Code on a few machines, Claude Desktop, Codex or any
other MCP client, the local models at home) join your tribe like teammates, and a background **Secretary** keeps
notes on everything you and they make.

## Your agents (`#/agents-hub`)

One screen, one card per agent: a kind glyph and color (Claude Code teal, Claude Desktop amber, other MCP agents
rose, local models green, the Secretary ember), live or idle, what it is doing, its lane (claimed files and
lanes), and its last gist. The hero shows them as a constellation around this computer.

- **Claude Code.** `POST /api/agents` with no body keeps the old behaviour: one "Claude · <you>" agent, a new
  key replaces the old one. With `{ "kind": "claude-code", "label": "laptop" }` you get another named agent with
  its own key. Up to 8 per person.
- **Claude Desktop.** `{ "kind": "claude-desktop", "label": "Claude Desktop" }` also returns a ready
  `claude_desktop_config.json` entry that runs the stdio bridge:

  ```json
  { "mcpServers": { "tribecode": { "command": "/path/to/node", "args": ["/path/to/scripts/mcp-stdio.js", "http://localhost:4747/mcp"],
                                   "env": { "TRIBE_TOKEN": "<key>" } } } }
  ```

  The file lives at `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
  `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS). Restart Claude Desktop after editing.
- **Any MCP client.** `{ "kind": "mcp", "label": "Codex" }` returns the HTTP URL + `Authorization` header (for
  clients that speak Streamable HTTP) and the same stdio snippet for clients that only speak stdio.
- **Revoke** one key with `DELETE /api/agents/mine?id=<agent id>` (or the card's "Revoke key"); without `id` it
  revokes your default agent, as before.
- **Local models**: the Ollama models on the host (`/api/tags`); the host picks which one the Secretary thinks with.

### The stdio bridge (`scripts/mcp-stdio.js`)

Zero dependencies. Reads JSON-RPC lines on stdin, POSTs each to `<url>/mcp` with `Authorization: Bearer
$TRIBE_TOKEN`, writes answers to stdout, sends nothing back for notifications (HTTP 202), passes
`Mcp-Session-Id` along, and turns HTTP errors into JSON-RPC errors so the client never hangs. It never prints the
key (errors go to stderr with the key redacted). The packaged desktop app ships only the server, so the server
writes a copy to `<tribe folder>/.tribe/mcp-stdio.js` and also serves it at `/api/agents/bridge.js`.

```
TRIBE_TOKEN=<key> node scripts/mcp-stdio.js http://localhost:4747/mcp
```

## The Secretary (`#/secretary`)

Off until the host turns it on. It runs on the host on a timer (every 15 minutes by default), skips quiet hours
(22:00 to 07:00 by default), does at most two local-model calls per tick, gives up on a slow model after 25 s,
and stops between steps when it is turned off. It never runs code and never fetches URLs.

Each tick, for every project (notes never cross projects):

1. **Ingest** what is new: chat, voice-note transcripts, images (file name and type), votes, docs (dropped files
   become docs), files in the repo's `notes/` and `files/` folders (headings and bullets for text, names for code,
   name and type otherwise), commits, agent gists/prompts, `/decide` decisions, new tasks, and notes people hand it.
2. **Distill** `YYYY-MM-DD.md` (in short, what happened, decisions, open questions, notes, research) and
   `DIGEST.md` (the ten things that matter now). Short gists, never code.
3. **Dream** `INSPIRATION.md`: realizations that connect two people's work (a sketch and a voice note, a doc and
   a question), each with its sources. One tap makes it a task or suggests a team vote.
4. **Research**: questions like "which library should we use for…?" become research requests. Agents pick them
   up over MCP and file findings back; they land in the journal and the digest at once.

With Ollama running it writes the "in short" line and the realizations with the local model; otherwise plain
rules (keywords, headings, bullets) do the work.

**Where the notes live.** `<tribe folder>/secretary/<project>/notes/`. When the project's repo autopilot commits
the tribe context (Repo → settings: autopilot on + commit context), the notes are mirrored into the repo at
`notes/secretary/` and committed and pushed with the same rules: only on the main branch, only when it is in sync
with origin, never force.

**Talking to it.** In chat: `@secretary <question>`, `@secretary note <text>`, `@secretary research <question>`.
In the Secretary view: the Ask box (start with `note:` to tell it something). Agents: MCP tools below.

### MCP tools (`server/mcp-secretary.js`)

| Tool | What it does |
| --- | --- |
| `secretary_inbox` | Open research requests in your project. |
| `secretary_file` | `{ request_id, findings[], sources[] }` files short findings back into the notes. |
| `secretary_ask` | `{ question }` answers from the journal, digest, research, docs and tasks. |

### HTTP (project-scoped, like every other route)

| Route | Who |
| --- | --- |
| `GET /api/secretary`, `GET /api/secretary/journal/:date` | project members |
| `PUT /api/secretary/config` `{ enabled, model, useBrain, everyMin, quiet:{on,from,to}, repoNotes }` | host only |
| `POST /api/secretary/tick` (run now, ignores quiet hours) | host only |
| `POST /api/secretary/ask` | members (not spectators) |
| `POST /api/secretary/note`, `/requests`, `/ideas/:id/task`, `/ideas/:id/vote`, `/ideas/:id/dismiss` | humans (not agents or spectators) |
