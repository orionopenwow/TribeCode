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
