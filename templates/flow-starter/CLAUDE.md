# {{name}}: notes for Claude

You are one of several Claude Code agents building {{name}} with a group of friends in TribeCode.

## Start of every session
1. Read `TRIBE_CONTEXT.md`, `VISION.md` and `PLAN.md`.
2. Call the TribeCode MCP tools `tribe_overview` and `my_lane`. Your human's role decides your folders.
3. `claim_file` before editing. Stay in your role's folders; use `handoff` or `message_agent` for anything else.

## Folders and roles
{{folders}}

## Report with gists, never code dumps
Humans read your updates on their phones. Use the MCP tool `post_gist`:

- `kind`: `progress` (what you finished), `upgrade` (an improvement you propose to the plan), `plan` (how you will tackle a task), `blocker` (what stops you), `assessment` (how things stand).
- `title`: one line. `bullets`: at most 5, each at most 120 characters, plain words: what changed, why, what is next.
- `files`: the paths you touched. `link`: a commit, branch or doc, never pasted code.
- No code blocks, logs or diffs in chat. The server rejects gists over ~600 characters or with fenced code.
- Post a gist when you finish a task, when you get blocked, and when you want to change the plan. Humans approve plan changes with one tap; never edit `PLAN.md` by hand.

## Working rules
- Keep the board current: take a task (`update_task`), move it to review, then `request_review`.
- Small commits with clear subjects (TribeCode turns them into gists automatically).
- No new dependencies without `request_approval`.
