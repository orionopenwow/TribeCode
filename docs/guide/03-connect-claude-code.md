# Invite your agent

Bring the AI agent you already use: **Claude**, **Cursor**, **Codex CLI**, **ChatGPT**, **Gemini CLI**, **VS Code** with Copilot, **Windsurf**, **Cline**, **Zed**, or anything else that speaks MCP. It joins as a teammate named after you, like **Maya's Cursor**, with your access and never more. TribeCode works with these tools; it isn't made by their vendors.

## Invite it

1. Press **Invite your agent**, next to every **Invite friends** (or ask Flint "invite my cursor").
2. Pick your agent. You see short steps and the exact command or config to paste.
3. Press **Copy** (or **Download** for a config file). That is when it gets its key.
4. **Waiting for your Cursor…** turns into **✓ Maya's Cursor joined**, and it says hello in chat.

What each one gets:

- **Claude Code**, **Gemini CLI**: one command in a terminal.
- **Claude Desktop**, **Cursor**, **VS Code**, **Windsurf**, **Cline**, **Zed**, **Codex CLI**: a few lines for its config file.
- **Claude on the web**, **ChatGPT**: an address with no key in it. They sign in on a TribeCode page you approve. The tribe needs its public link.
- **Something else**: the address and an `Authorization: Bearer` header, or the local bridge.

Each setup says how the agent behaves: it answers @mentions on its own while a session runs, or it checks when you ask it. Setups were checked against each tool's docs on 2026-11-13.

## One of each kind

You can have your Claude and your Cursor and your Codex: one of each, each with its own key. For each you choose what it may touch (chat, docs, tasks, files, website, approvals), and you can **Pause** or **Remove** it. It can't read other people's private messages, decide approvals or invite people. Find them all in **Settings** › **Plan & AI** › **Your invited agents**.

## Other tools

**Qwen Code**, **Goose**, **Continue** and more are on the **TribeCode MCP** page (Agents Hub › MCP): each gets a key you can revoke there. No MCP at all? **Use any free AI** in the Agents Hub: copy a prompt out, paste the answer back.

## No AI of your own? You can still build

- **Flint**, the built-in helper, thinks with a model in your browser, the host's Ollama or the host's cloud key.
- **Ask an agent**: in the chat's **+** menu, or the robot on a task. The next connected agent answers in chat.
- **@ai** in the chat asks a teammate's agent (if they allow it) or the tribe's AI.

## Flint's brain

- **Built in**: Qwen3 runs in your browser with WebGPU (Chrome, Edge) after a download of about 500 MB.
- **This computer**: Ollama on the host.
- **A cloud model with your own key**: OpenAI, Anthropic, Gemini, OpenRouter, Groq or any OpenAI-compatible URL. The key stays on the host.
- **None**: basic mode.
