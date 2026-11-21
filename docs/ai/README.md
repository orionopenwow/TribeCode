# TribeCode for AI agents: start here

TribeCode is where a small group builds a project together: chat, tasks, docs, code, and three design tools (a website designer, App Creator for phone apps, and Motion Studio). You were invited by one of its people and work with their access, never more. This page tells you where to look; each tool has its own master guide.

## The guides

| Guide | Read it when you are asked to | Get it with |
| --- | --- | --- |
| [WEBSITE.md](WEBSITE.md) | build, restyle, rewrite or fix the project's website | `get_guide("website")` |
| [APP.md](APP.md) | design or change the project's phone app | `get_guide("app")` |
| [MOTION.md](MOTION.md) | make or change a motion graphic | `get_guide("motion")` |

Each guide stands on its own: the shape of the data, the tools in order, every step with an example, how to make the result good, a checklist, and what never to do. Over MCP the same guides are resources (`tribecode://guide/website` …) and prompts (`design_website`, `design_app`, `design_motion`).

## Always first: the project brief

`project_brief` returns what this project is: its name, the vision, what kind of thing it is, the audience and tone, the brand kit (colours, fonts, voice), what already exists (pages, screens, motion graphics), facts and decisions from the project's memory, open tasks and comments on the designs, and who approves what. It only holds what the person who invited you can see. Design from it. A fact that is not in it is a question for the person, never something to make up.

## How every design tool works

1. **Read** (`project_brief`, then `site_read` / `app_read` / `motion_read`).
2. **Propose** steps (`site_propose` / `app_propose`), first with `dry_run: true`. A step that cannot be used is skipped and named, with a corrected example.
3. **Check** (`site_check` / `app_check`) and fix what it lists.
4. **A person approves.** They see before and after; one Undo takes it back. You cannot approve your own proposal.

## What is always a person's to do

Publishing, exporting, deleting pages or screens, uploading pictures, payments and accounts, and anything in a project you were not invited to.

## In a project folder

A project's designs are also real files in its folder (`site/`, `app-web/`). TribeCode writes an `AGENTS.md` there (and a `CLAUDE.md` that points to it) with what the project is and where things are, and copies of these guides in `.tribe/ai/` with the current brief as `.tribe/ai/PROJECT.md`. A file a person wrote themselves is never replaced.

## Keeping these guides true

The lists in the guides (sections, layouts, parts, looks, fonts, kits, templates, steps) are written from the app's own data by `node scripts/dev/ai-guides.js`; `--check` runs in `npm test`. The design rules and the steps' examples live in `app/ui/aiguide-core.js`, which the MCP tools, "Make it beautiful", the copy-and-paste bridge and Flint's local model all read, so every path gives an AI the same advice.
