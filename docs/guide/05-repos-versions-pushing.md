# Repos, versions & pushing

You don't need to know git. TribeCode keeps a git repo for each project and can push it to GitHub for you.

## Sign in to GitHub once

**Settings** › **GitHub** › **Sign in with GitHub**. GitHub shows a short code: tap **Copy code**, then **Open GitHub**, paste it and approve. If you already use the GitHub CLI, **Use my GitHub CLI login** is one tap.

After that, everything pushes on its own. Your key stays on the host computer and is never sent to friends.

## Start from code you already have

When you make a project (the **+** under the circles):

- paste a GitHub URL into the name box, or
- tap **Bring existing code: a folder or repo** and drop the folder.

## Let Autopilot keep it in sync

**Tasks & Board** › **Repo** › **Autopilot** (host only, off by default):

- **Autopilot**: the main switch. Every action is logged.
- **Auto-pull main when clean**: picks up new commits (fast-forward only).
- **Commit + push the tribe context**: keeps the shared notes in the repo.
- **Report milestone tags**: released milestones get a version tag.

Autopilot never force-pushes and never merges someone's branch without an approved integration.

## Merging everyone's work safely

Each person's agent works on its own branch. The host's Claude Code can act as the **Integrator agent**: it collects branches, runs your **Check command** (like `npm test`) in a separate copy, and proposes an integration. When it's approved, the host taps **Integrate now**. **Run checks** re-runs the tests at any time.

## Versions

- **Milestones** (Tasks & Board) are your versions: name what's in the next one, and when you release it, Autopilot tags it.
- **Commits** and **Activity** on the Repo tab show what changed, by whom.

## Get the files out

- **Ctrl K** › **Export project to a folder**: **Just the files** (ready to zip) or **With history** (a git copy that pushes to GitHub).
- **Keep a copy on my Desktop**: a folder that updates after every push.
- **Settings** › **Download backup** (host): the whole tribe as one file.

## When a change needs a computer

A friend on a phone can't run code. Their change becomes a request on the Repo tab; someone with a computer taps **Take it**, or the host uses **Send to a desktop**.
