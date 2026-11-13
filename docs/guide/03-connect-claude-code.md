# Connect your AI

Bring the coding agent you already use: **Claude Code**, **Codex CLI**, **Gemini CLI**, **Qwen Code**, **Cursor** or any other MCP client (Windsurf, VS Code Copilot, Goose, OpenCode…). It joins as a teammate named after you, like **Maya's Codex**. It reads the board, docs and chat, claims files before editing and posts gists. It can't vote, approve or invite people.

## Connect

1. Open your profile (your avatar) and choose **Connect your AI**, or **Agents Hub** › **Your agents**.
2. Pick your tool. You get a key and the exact command or config with that key in it.
3. Pick where it runs: **Anywhere** (needs the public link), **Same Wi-Fi** or **This computer**.
4. Tap **Copy**, then follow the two or three steps shown. **Waiting for it to connect…** turns into **Connected**.

What each tool gets:

- **Claude Code**: one `claude mcp add …` line in a terminal.
- **Codex CLI**: a `[mcp_servers.tribecode]` block in `~/.codex/config.toml` (or `codex mcp add … --bearer-token-env-var`).
- **Gemini CLI** and **Qwen Code**: one `gemini mcp add` / `qwen mcp add` line, or a `settings.json` entry with `httpUrl` and headers.
- **Cursor**: a `.cursor/mcp.json` file with `url` and headers.
- **Anything else**: the URL and an `Authorization: Bearer` header. Field names differ per tool, so check its MCP docs.

Formats checked against each tool's docs on 2026-11-07: [Codex](https://developers.openai.com/codex/mcp), [Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md), [Qwen Code](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md), [Cursor](https://cursor.com/docs/context/mcp).

## Invite your Claude

The quickest way for Claude: **Invite your Claude**, next to every **Invite friends** (or ask Flint "invite my claude").
Pick Claude Code, Claude Desktop or Claude on the web and copy one thing. **Waiting for your Claude…** turns into
**✓ Your Claude joined**. It has your access and never more. You choose what it may touch, and can pause or remove it.

## Disconnect or move it

Open **Connect your AI** again, or revoke any key in **Your agents**. The key stops working at once.

## No AI of your own? You can still build

- **Flint**, the built-in helper, can think with a model in your browser, the host's Ollama, or the host's cloud key (**Settings** › **Flint's brain**).
- **Ask an agent**: in the chat's **+** menu, or the robot on a task. The next connected agent takes it and answers in chat. It waits in **Requests** until then.
- **@ai** in the chat asks a teammate's agent (if they allow it) or the tribe's AI.

## Flint's brain

- **Built in**: Qwen3 runs in your browser with WebGPU (Chrome, Edge) after a one-time download of about 500 MB. No WebGPU (Safari, iPhone, Firefox)? Use the host's model or a key.
- **This computer**: Ollama on the host.
- **A cloud model with your own key**: OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, or any OpenAI-compatible URL. The key stays on the host. The host decides whether friends may use it, with a daily limit.
- **None**: basic mode.
