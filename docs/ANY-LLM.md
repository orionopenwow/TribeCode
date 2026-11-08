# Any LLM

Claude is no longer required. Three parts:

## 1. Bring any coding agent

Agents Hub › Your agents and the **Connect your AI** sheet offer Claude Code, Codex CLI, Gemini CLI, Qwen Code, Cursor,
Claude Desktop and any MCP client. Each tool mints its own revocable key (POST `/api/agents { kind }`); the agent is named
after its owner ("Maya's Codex"). The response carries `setup`: 2–3 steps and copy-ready blocks per place
(Anywhere / Same Wi-Fi / This computer), built by `server/agentshub.js setupFor`. The sheet polls `/api/agents/mine`
and flips "Waiting for it to connect…" to "Connected" live.

`/mcp` has always accepted `Authorization: Bearer <key>` (and still accepts `?token=`), so every tool uses the header.

Formats checked on 2026-11-07:
[Codex config.toml](https://developers.openai.com/codex/mcp) (`[mcp_servers.<name>]` `url` + `http_headers` /
`bearer_token_env_var`; `codex mcp add --url --bearer-token-env-var` from codex-rs `mcp_cmd.rs`),
[Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md) (`httpUrl` + `headers`,
`gemini mcp add -t http -H`), [Qwen Code](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md)
(same schema, `qwen mcp add --transport http --header`), [Cursor](https://cursor.com/docs/context/mcp)
(`.cursor/mcp.json` `url` + `headers`).

### The TribeCode MCP page

`#/mcp` (`app/ui/mcpdir.js`) is the calm directory of everything above, like Notion's "Notion MCP" page. It opens from
Agents Hub (the **MCP** tab and "Claude.ai, ChatGPT, VS Code and more →"), the Connect your AI sheet's **See all** chip,
Settings › TribeCode MCP, and the palette. One hero ("Use your agent to drive TribeCode", Connect opens the sheet for the
tool you used last), two tabs: **Discover clients** (searchable grid, 2 columns, 1 on phones) and **Connected** (your keys
from `GET /api/agents/mine`, live/idle, Remove = `DELETE /api/agents/mine?id=`). Every Connect reuses the sheet
(`TribeApp.connectClaude({ tool })`), so each client gets its own key and its exact setup. Up to 8 keys per person.

Formats added on 2026-11-07, each from the tool's own docs:

| Client | Where | Shape |
| --- | --- | --- |
| [VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) (Copilot Agent mode) | `.vscode/mcp.json` | `servers.<name>` `{ type: "http", url, headers }` (top-level key is `servers`, not `mcpServers`) |
| [Zed](https://zed.dev/docs/ai/mcp) | settings.json | `context_servers.<name>` `{ url, headers }` |
| [Cline](https://docs.cline.bot/mcp/configuring-mcp-servers) | `cline_mcp_settings.json` | `mcpServers.<name>` `{ type: "streamableHttp", url, headers }` (without `type` it falls back to SSE) |
| [Goose](https://github.com/block/goose/blob/main/crates/goose/src/agents/extension.rs) | `~/.config/goose/config.yaml` | `extensions.<name>` `{ type: streamable_http, uri, headers, enabled, timeout }` (the `headers` field is in the source, not the docs page) |
| [Continue](https://docs.continue.dev/customize/deep-dives/mcp) | `.continue/mcpServers/tribecode.yaml` | `mcpServers[]` `{ type: streamable-http, url, requestOptions.headers }` ([reference](https://docs.continue.dev/reference)) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers.<name>` `{ serverUrl, headers }` |
| [Claude.ai](https://claude.com/docs/connectors/custom) | Customize › Connectors › Add custom connector | the public https URL with `?token=`, **No sign-in** |
| [ChatGPT](https://developers.openai.com/api/docs/guides/developer-mode) | Settings › Apps › Advanced settings › Developer mode › Create app | the public https URL with `?token=`, **No Authentication** |

Honest notes:
- **Windsurf**: on 2026-11-07 `docs.windsurf.com/windsurf/cascade/mcp` redirects to Devin's docs, so the `serverUrl` +
  `headers` shape could not be re-checked there; it is the shape Windsurf documented before and the card says to check
  its MCP docs.
- **Claude.ai and ChatGPT** connect from their vendors' clouds, so they only get the tribe's public https link (Tailscale
  Funnel or a Cloudflare quick tunnel, `server/share.js`); without one the page shows a note (and the host a "Turn on the
  public link" button) and Connect mints nothing. Their forms take OAuth or no sign-in; TribeCode doesn't do OAuth, so
  the key rides in the URL (`/mcp` has always accepted `?token=`). Treat that URL like a password, and Remove it on the
  Connected tab to revoke it. Claude.ai's Request headers (beta, some organizations) can carry `Authorization: Bearer`
  instead. A Cloudflare quick tunnel changes address each start, so re-add the connector then; Funnel keeps it.
- Nothing is marked "Coming soon" today: every listed client works with a Bearer header or the token in the URL.

### Apps on this computer (special connections)

`server/connections.js`, the third section of the page. A desktop app that works with a project but has no API or MCP
server, such as [ArtCraft](https://github.com/storytold/artcraft) (open-source, MIT, an IDE for AI image and video work).
A connection does two plain things: **Open** the app, and **watch** an export folder so new renders land in the project.

- ArtCraft is detected at `%ProgramFiles%\ArtCraft` (Windows), `/Applications/ArtCraft.app` (macOS), or on PATH / as an
  AppImage (Linux). Not found: paste the path (a folder is fine; the app inside it is used).
- **+ Add a special connection**: name, emoji, app path, watch folder, web link, each optional except the name.
- The watcher polls the top level of the picked folder every 3 s. New png/jpg/webp/gif/mp4/webm files (up to 50 MB, once
  they stop growing) are copied into the project's Files (`uploads.addLocal`), PNGs up to 8 MB also into Visuals, and the
  chat gets one line per batch ("🎨 2 new renders from ArtCraft"). Files already there when the folder is picked are skipped.
- Stored per project in `.tribe/connections.json`; what the watcher has seen in `.tribe/connections-seen.json`.
- Security: GET is for every member of the project (no local paths unless host). Add, edit, remove and launch need the
  host **and** a request from the host's own computer (`isLocal`); friends get 403. Launch runs only the saved path,
  `spawn(path, [], { shell: false, detached: true })` (macOS `.app`: `/usr/bin/open <app>`). The watch folder must be a
  real folder (not a symlink, not the tribe folder); symlinked files inside it are skipped. Phones and friends see the
  section read-only with "Open on the host's computer".

## 2. Flint's brain

`server/llm.js` is the one provider layer for every server-side AI feature. `brain.generate/status/refresh` are routed
through it (`brain.route`), so Ask AI, vision drafts and phrase chips, suggested tasks, doc TL;DRs, huddle notes,
standups and the Secretary all use the chosen provider. Order: chosen provider → Ollama → basic.

- Providers: `ollama`, `openai`, `anthropic`, `gemini`, `openrouter`, `groq`, `custom` (any OpenAI-compatible base URL),
  `none`. Plain `fetch`, SSE streaming, timeouts, `<think>` stripped.
- The key lives only on the host: `.tribe/secrets/llm.json`, mode 0600, skipped by backups. Never logged (errors are
  scrubbed), never in a URL (Gemini gets `x-goog-api-key`), never in an API response, `/api/health` or the WebSocket.
- `GET /api/llm` (members: no key, no URL), `PUT /api/llm` and `POST /api/llm/test` (host only).
- Friends' calls go through the host (members only). The host turns that on/off; a soft daily cap per friend; 12 Flint
  asks a minute per friend. The caller comes from an AsyncLocalStorage set per API request.
- Flint replies show who answered (`X-Flint-Via` → "via Gemini 2.5 Flash").

**Built in (browser):** `app/ui/brainpick.js` imports WebLLM from `https://esm.run/@mlc-ai/web-llm@0.2.83` only when
someone picks Built in and taps Download, then runs `Qwen3-0.6B-q4f16_1-MLC` (or `Qwen3-1.7B-q4f16_1-MLC` on a GPU with
shader-f16, 8 GB and 1 GB buffers; `q4f32_1` without f16). This CDN script is the one exception to "zero dependencies",
loaded on demand and pinned like three.js in the viewers. It needs WebGPU; without it the sheet says so and points to
the host's model or a key. The model runs entirely in the browser.

## 3. Friends without an AI

**Ask an agent** (composer + menu, the robot on a task card, Requests): `POST /api/coord/asks` queues an open hand-off
with `ask: true`. Connected agents get a note; any agent sees it in `my_lane` and takes it with the MCP tool
`take_handoff` (then `done: true`). Flint (built in, or the host's brain) answers the rest.
