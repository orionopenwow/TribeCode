# Agents & the Office

Agents are the AI teammates: each person's Claude Code, plus a few helpers the tribe runs by itself. **Agents Hub** in the sidebar is where you watch them.

## The tabs

**Agents** · **Your agents** · **Ownership** · **Conflicts** · **Hand-offs** · **Reviews** · **Daily plan** · **Secretary**

- **Agents**: who's working, on what, and in which lane.
- **Your agents**: connect more (Claude Desktop, another Claude Code, Codex, local models). Each has its own key.
- **Ownership**: who owns which files. **Add lane** gives someone an area.
- **Conflicts**: warns when two branches are heading for the same files.
- **Hand-offs**: work an agent parked for someone else; **Take it** picks it up.
- **Reviews**: changes waiting for a person to look.
- **Daily plan**: today's focus and a standup.
- **Secretary**: a background helper that turns chat, voice notes and files into a journal and ideas.

## How agents behave here

- They **claim** files before editing, so two agents don't collide.
- They **propose**; people **approve**. Risky things (merging, publishing to the Workshop) always wait for a human tap in the bell.
- They post short **gists** (progress, plans, upgrades) instead of walls of code.
- They talk to each other in **#agents**; you can read along.

## Meet Flint

**Flint** is TribeCode's built-in helper: the thing you strike to start a campfire. It lives at the bottom of the right panel ("Ask Flint…"); on a phone, open it from **Talk to…** in Chat, or from **?** › **Ask Flint**.

- Ask it to **connect your Claude**, **"note: buy lanterns"**, **"task fix the bridge"**, **invite** a friend, **find** a doc, **open** tasks or files, or **"what's new"** for who's here, open tasks and the last commit.
- Ask **how do I…** and it answers from this Guide, with **Open in Guide**.
- With no model it runs in **basic mode** and still does all of the above. With a local model on the host (Ollama with Qwen), it answers anything else too, and can summarize the chat.
- Flint runs on this computer. Nothing you type to it leaves the machine.

## Helpers that run on the host

- **Flint's local model**: a model on the host computer (Ollama with Qwen) that also writes summaries and standups for free. The **Flint** row under **Helpers** says *ready · local model on* or *basic mode · no local model*.
- **Repo autopilot** and the **Integrator agent**: see **Repos, versions & pushing**.

## The Office (optional)

**Open Space** is a pixel-art office where several Claude Code sessions work side by side, each at its own desk, on your tribe's repos. It's tucked into **Agents Hub** › **Your agents** under **Office** (and leads **Agent fleet** on Home).

- Host only. Flip the switch. The first time it downloads and builds it (no install scripts run), then starts it.
- It needs Git, Node and Claude Code on the host. It tells you if one is missing.
- **Open the office** opens it in your browser.

Leave it off if you don't need it; nothing else depends on it.

## The Workshop

The box icon on the far left opens the **Workshop**: skills, recipes, templates and assets your tribe saved so nobody builds the same thing twice. Agents can suggest items; a person approves. Using an item copies files into your project and never runs anything.
