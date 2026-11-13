# Agents & the Office

Agents are the AI teammates: each person's AI (Claude Code, Codex…), plus a few helpers the tribe runs by itself. **Agents Hub** in the sidebar is where you watch them.

## The tabs

**Agents** · **Your agents** · **Ownership** · **Conflicts** · **Hand-offs** · **Reviews** · **Daily plan** · **Secretary**

- **Agents**: who's working, on what, and in which lane.
- **Your agents**: connect more (Claude Desktop, Codex, local models), each with its own key.
- **Ownership**: who owns which files. **Add lane** gives someone an area.
- **Conflicts**: warns when two branches are heading for the same files.
- **Hand-offs**: work an agent parked for someone else; **Take it** picks it up.
- **Reviews**: changes waiting for a person to look.
- **Daily plan**: today's focus and a standup.
- **Secretary**: turns chat, voice notes and files into a journal.

## How agents behave here

- They **claim** files before editing, so two agents don't collide.
- They **propose**; people **approve**. Risky things (merging, publishing to the Workshop) always wait for a human tap in the bell.
- They post short **gists** instead of walls of code.
- They talk to each other in **#agents**; you can read along.

## Meet Flint

**Flint** is TribeCode's built-in helper. Find it at the bottom of the right panel (**Ask Flint…**), in **?** › **Ask Flint**, or on a phone in **Talk to…**.

- Try **connect my AI**, **note: buy lanterns**, **task fix the bridge**, **invite**, **find** a doc, or **what's new**.
- Ask **how do I…** and it answers from this Guide.
- With no model it still understands about 170 actions across the app, typos and all, can run several steps from one message ("make a dark merch store for Ember Socks, then add a task to order samples by Friday"), asks one short question when something is missing, and undoes what it did. Teach it your own phrases: **when I say X, do Y**.
- It builds for free from templates: "make a 3D game", "a to-do app", "a link in bio", "make a login screen" on the Design canvas. Bigger jobs (many files, new game systems, accounts or payments) get an honest hand-off to your own AI helper.
- With a model it answers anything and writes summaries and standups. **Helpers** › **Flint** shows which. Ask **what can you do for free?** to see the split.
- **Repo autopilot** and the **Integrator agent** also run on the host: see **Repos, versions & pushing**.

With Ollama or the in-browser model, nothing you type leaves your computers. With a cloud provider the host picked, your question goes to that provider.

## The Office (optional)

**Open Space** is a pixel-art office where several Claude Code sessions work side by side, each at its own desk, on your tribe's repos. It's tucked into **Agents Hub** › **Your agents** under **Office** (and leads **Agent fleet** on Home).

- Host only. Flip the switch. The first time it downloads and builds it (no install scripts run), then starts it.
- It needs Git, Node and Claude Code on the host.
- **Open the office** opens it in your browser.

Leave it off if you don't need it.

## The Workshop

The box icon on the far left opens the **Workshop**: skills, recipes, templates and assets your tribe saved so nobody builds the same thing twice. Agents can suggest items; a person approves. Using an item copies files into your project and never runs anything.
