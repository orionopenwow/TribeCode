# UX sweep, pass 13

A new person's walk at 1440x900 and 390x844: first open, the first project from one sentence, App Creator, the website
designer, Tasks, Messages, Files, Settings, Save on this computer, the tribe status popover (Your copy), Where it lives and
the Backup on GitHub card. Test: `app/test/e2e_ux_sweep_p13.py`.

## Fixed

- **"Two people changed this" names parts in plain words** (`copies.js` `describe`). A row used to read "header: Theirs
  again" (the block's type key and the other person's new words). It now reads the tool's own name for the part ("Big
  title", a website section's name, or the name someone gave the section) and, under it, what each side has: "Yours:
  “Mine again” · Theirs: “Theirs again”". The title is added when both sides agree on it ("Stat tiles · “This week”").
  Pages and screens say "Page" or "Screen"; whole-design settings say "The look", "The name", "Fonts" and so on, never a
  field key. Two colours read "Each of you picked a different colour." A removed-and-changed block says so.
- **One tap for every row:** with two or more rows the sheet offers "Keep all mine" and "Keep all theirs".
- **No send/get on the tribe's own computer:** the tribe status popover left out "Your copy · Send my changes / Get the
  latest" on the computer that runs the tribe, where there is no second copy (`tribestatus.js`).
- **Tasks:** one Flint button on an empty board. The welcome's "Ask Flint to plan" stays; the "Plan this week with Flint"
  chip above it now waits for the first task (on phones the chip was off screen in the scrolling chip row anyway).
- **Phones:** Flint's "Give Flint a local brain" offer was inserted above Home's own header and pushed the title half a
  screen down; it now sits under the header (`flintsetup.js`). The website designer's Edit hint told phone users to
  right-click and press Esc; touch screens now read "Press and hold anything for more." (`sitedesigner.js`).
- **Plain words:** the Settings look preview said "Pushed the new title screen. / Looks great. Shipping it. / Ship it";
  it now says "Saved the new title screen. / Looks great. Let's share it. / Share it". Files' code card eyebrow "Pinned
  repo" is "Pinned code" and its text no longer says "A repo is…" (`repohero.js`). The GitHub health tip says "a shared
  copy on GitHub" instead of "a shared GitHub repo" (`server/insights.js`).

## Rounded out

- **Undo after deleting a task.** The toast reads `Deleted "Paint the sign"` with an Undo button; Undo puts the same
  words, section, type, person and date back. The app's toast takes one optional action (`TribeApp.toast(msg, kind,
  { label, run })`) for the next feature that needs one.
- **? opens the keyboard shortcuts** when nothing is being typed and no sheet or editor is open (Ctrl / still works; App
  Creator and the website designer keep their own ? sheets).
- **The conflict sheet shows both versions** and has the "Keep all" pair (above), so people choose knowingly.

All new words are in `i18n-more.js` in the seven languages.

## Bigger suggestions (ranked)

1. **One name for Tasks.** The sidebar, tour and Flint say "Task Board"; the page says "Tasks" with a List | Board toggle.
   Rename the row "Tasks" everywhere (about ten files and some tests).
2. **One backup story.** "No backup yet" (Settings › Download backup, a .tar.gz) still shows after a .tribe copy was saved
   or Backup on GitHub is on. Count all three as a backup and point the tip at Backup on GitHub.
3. **"Code repository" in primary UI.** Still the section name, the empty-state title and several buttons ("Set up the
   code repository"). Call it "Code" / "Shared code" with the GitHub word only where GitHub is meant.
4. **Messages for a tribe of one.** A brand-new #general is empty space with "1 member"; give it one line and one button
   that brings in a friend or an AI helper (with the network lane's invite).
5. **Three ways to add a task.** "New task", the "Add a task… press Enter" line and the welcome's "Add a task" (which opens
   a second inline line). Make the welcome's button focus the main line.
6. **Status words differ by screen size.** Desktop "Needs someone / In progress / Waiting for review / Overdue", phones
   "No one / Doing / Review / Late". Pick short words that fit both.
7. **App Creator's phone header** squeezes the project name to one letter ("H…") beside undo, redo, ⋯, Flint, Play and
   Export. Move undo/redo into the ⋯ menu on phones.
8. **The welcome toast covers Home on phones** after joining ("You're in My Tribe! Say hi") and hides the messages card
   under it; dock it into the page or let it shrink after a few seconds.
9. **An empty right panel** beside an untouched first project (only a close button); show Flint's chat or nothing.
10. **"0 projects" on first open** while My Tribe already exists (blank). Count it, or hide the pill until there is one.
