# Your code, versions and GitHub

You don't need to know git. TribeCode keeps every version of each project's code and can save it to GitHub for you. In the app this place is the **Repo** tab: think of it as the project's code home.

## Sign in to GitHub once

**Settings** › **GitHub** › **Sign in with GitHub**. GitHub shows a short code: tap **Copy code**, then **Open GitHub**, paste it and approve. If you already use the GitHub CLI, **Use my GitHub CLI login** is one tap.

After that, your code is saved to GitHub on its own. Your key stays on the tribe's computer and is never sent to friends.

## Start from code you already have

When you make a project (the **+** under the circles):

- paste a GitHub address into the name box, or
- tap **Bring existing code** and drop the folder.

## Let Autopilot keep it up to date

**Task Board** › **Repo** › **Autopilot** (the tribe's computer only, off by default):

- **Autopilot**: the main switch. Every action is logged.
- **Auto-pull main when clean**: picks up new changes from GitHub when nothing of yours would be overwritten.
- **Commit + push the tribe context**: saves the shared notes with the code.
- **Report milestone tags**: released milestones get a version label.

Autopilot never overwrites history and never brings in someone's work without an approval.

## Bringing everyone's work together safely

Each person's agent works on its own copy, so nobody steps on anybody else. The AI agent on the tribe's computer can act as the **Integrator agent**: it collects the copies, runs your **Check command** (like `npm test`) on the side, and proposes one combined version. When it's approved, tap **Integrate now**. **Run checks** runs the tests again at any time.

## Versions

- **Milestones** (Task Board) are your versions: name what's in the next one, and when you release it, Autopilot labels it.
- **Commits** and **Activity** on the Repo tab show what changed, and who changed it.

## Get the files out

- **Ctrl K** › **Export project to a folder**: **Just the files** (ready to zip) or **With history** (every version, ready for GitHub).
- **Keep a copy on my Desktop**: a folder that updates after every save.
- **Settings** › **Download backup**: the whole tribe as one file.

## When a change needs a computer

A friend on a phone can't run code. Their change becomes a request on the Repo tab; someone with a computer taps **Take it**, or the person running the tribe uses **Send to a desktop**.
