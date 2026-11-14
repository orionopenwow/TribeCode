# Roles and permissions: who can do what, and how a group decides

Written for feat/group-styles. Part 1 is what the code did before this branch (checked against the code, with the
file and function). Part 2 is where that was confusing. Part 3 is what this branch built. Part 4 is folders.

## 1. Who could do what before (three systems side by side)

There were three places that each said something about "who decides":

- **Tribe roles and the capability table** (`server/perms.js`): host, admin, mod, builder, spectator, and AI
  helpers (agents). One table of capabilities, a few of them host-only. This is the only one that grants anything.
- **Company roles** (`server/company.js`, formerly "seats"): a named role with a goal. It never grants anything
  (`check()`: "a seat never adds rights").
- **Task Board work mode** (`server/taskflow.js` `settings()`): "Lead assigns" or "Council". It only changes how
  tasks are handed out.

| Action | Who could, before | Where it is checked |
|---|---|---|
| Start a project | host, admin, mod, builder | `perms.js` CAPS `project.create`; `rooms.js:41`, `index.js` projects POST |
| Delete a project | host, admin | `project.delete`; `rooms.js:187` |
| Create and edit a website, design | anyone who is not a spectator or guest (AI helpers too, for drafts) | `sitedesign.js` route `canEdit`; `showcase.js` `canDraft`; `siteflint.js:164` (people only for the editor) |
| Change the look / design plan | builder and up, people only | `look.js` `canTribe` / `canProject`; `designplans.js` `canEdit` |
| Publish for everyone | anyone in the project who is not a spectator; never an AI helper | `publish.js` `canPublish`; `publishreal.js` `canSend` |
| Triage tasks (move, assign, close any) | host, admin, mod, builder | `tasks.triage`; `index.js` tasks PUT, `bugs.js:154` |
| Assign a task to someone else | "lead" = host, project host, or `settings.edit` (admin) | `taskflow.js` `isLead()` |
| Claim a task | anyone, only in Council mode | `taskflow.js` `claim()` |
| Approve a review / decide an approval | the AI helper's owner (low and medium risk); every person (high risk); any approval: admin; low-risk: mod | `approvals.js`; `index.js` `canDecideAny` (`approvals.approve`, `approvals.approve_low`) |
| Vote on a proposal (Board) | every person; never AI helpers or spectators; majority of people | `board.js` route `proposals/vote`, `resolve()` |
| Vote in chat | every person in the project; majority | `votes.js` `cast()`, `outcome()` |
| Close any proposal | host, admin, mod (or its author) | `board.manage`; `board.js` route DELETE |
| Merge into main | host, admin (and the host's "integrator" AI helper when switched on) | `repo.merge`; `repo.js:304,346`; `integrator.js` `isMaster()` |
| Ship to GitHub | per project: host/admin decide, or more than half, or everyone | `ship.js` `deciders()`, `settings()` |
| Release a milestone | host, admin | `board.js` route `milestones/release` (`repo.merge`) |
| Write code and files in the project folder | any builder in the project (an AI helper when its owner may) | `codefiles.js` `canEdit` / `personCan` |
| Write to a shared (synced) folder | any person in the project who is not a spectator or guest | `sync.js` `writer()`; `folderhome.js` `writer()` |
| Choose where the project folder lives, join or change a shared folder, undo a ship | "lead" = host, project host, or `settings.edit` | `folderhome.js` `lead()`; `sync.js` `lead()` |
| Delete someone else's files | host, admin | `files.delete`; `uploads.js:106`, `captures.js:599` |
| Invite people | host, admin, mod, builder | `members.invite`; `index.js` invites POST |
| Invite an AI helper | any person, for themselves (it acts as them, capped at builder) | `index.js` agents POST; `perms.js` `actingRole()` |
| Change roles | host, admin (below their own) | `roles.assign`; `perms.js` `assign()` |
| Change project settings and the plan | host, admin | `settings.edit`; `board.js` vision PUT, `rooms.js:183`, `checks.js`, `dashband.js` |
| Company: edit, give out roles, goals, "make a decision" | "lead" (as above); a decision also by whoever holds the lead role | `company.js` `isLead()`, `ceoCall` |
| Hosting, secrets, running programs, backup | the computer's owner only | `perms.js` locked rows; hard-coded where used |

## 2. Where it contradicted or confused

1. **Three meanings of "lead".** The Company page's lead was "whoever has `settings.edit`" (an admin), not whoever
   holds the Lead role. A builder given the Lead role could "make a decision" in the log but could not approve,
   merge, change settings or give out roles. The role looked like power and granted none.
2. **The lead role was hard-wired as "CEO".** `company.js` `KIND_TITLE.ceo = 'CEO'`; the person who makes the
   company is put in it and it can't be removed. The page renamed it to "Lead" on screen only.
3. **"Council" existed only on the Task Board.** It changed who picks up tasks. Merges, approvals, publishing and
   settings stayed with the host and admins, so a "council" group still had a single decider for everything that
   mattered.
4. **Four voting systems with four different electorates** (now one counting rule, part 3). Chat votes (`votes.js`, majority of the project's
   people), Board proposals (`board.js`, majority of all people), Ship it (`ship.js`, host / majority / everyone)
   and high-risk approvals (`approvals.js`, sent to every person). None knew about a
   council, and none could be asked "let me do this one thing".
5. **Publishing was not in the table.** Any builder could publish for the whole internet (`publishreal.js`
   `canSend`) while merging into main needed an admin. The riskier action had the looser rule and no row to change.
6. **An AI helper in a Company role.** It still acts at its owner's level capped at builder (`perms.js`
   `actingRole`), so the role is a label. That is right, but nothing on screen said so outside the role's panel.
7. **A refusal never said who could help.** Messages said "only the host or an admin…" with no next step.
8. **"Own folder" does not exist as a permission.** There is no per-person folder rule in the server. See part 4.

## 3. What this branch built: one setting, "how this group decides"

One setting per project (with a tribe default), in `server/groupstyle.js`, read by `perms.can()` as its last step
(`perms.js` `can()` → `groupstyle.hook()`). It is a layer on the **same** capability table, not another system. A
tribe that never chose keeps the exact old behaviour (`hook()` returns the table's answer untouched).

| Style | What it means | How the sensitive things are decided |
|---|---|---|
| **One lead** (default) | One person has the final say. The group picks the word: Lead, Captain, Director, Organizer, Teacher… | The table as it was. |
| **A council** | No single lead. Council members hold the day-to-day capabilities. | Approving anything (spending included), sending work to the main copy, publishing, changing roles, settings, how the group decides, deleting a project or someone's files, removing someone: pass when **N of the council** agree. N is "more than half", "any two" or "everyone", with a time limit and a rule for when time runs out. Nobody does these alone, the computer's owner included. |
| **Open** | Flat. Anyone building can do most things. | Deleting files or a project, removing someone, changing roles and changing how the group decides need **a second person** to agree. |
| **Our own roles** | The group names roles and ticks what each looks after. | Per thing, the group picks: one person who can · one person plus a second · the council · everyone · the lead only. |

How the pieces fit:

- **Custom roles** (name, colour, one-line purpose, what it looks after, who holds it) add capabilities for the people
  in them, in any style. They can never include a host-only row (`groupstyle.js` `clean()` drops it), never lift
  someone who only watches or has a guest pass, and never lift an AI helper (`hook()`: helpers stay at their owner's
  level, capped at builder).
- **Ask them.** When something needs agreement, or you simply can't do it, you ask (`POST /api/groupstyle/ask`). The
  request is a vote in the project's chat (`votes.js`, extended with a fixed list of deciders) and lands in the
  deciders' inbox. Under One lead the deciders are the people who can do it and one yes is enough; under a council
  it is the council. When it passes, the asker gets a **pass**: that one thing, in that one project, for one day.
  A proposed change to the style itself is applied by the server when the vote passes.
- **A refusal says who can.** `index.js` `fail()` adds `need` (what was missing, who can, whether you can ask) to a
  403; the app shows a small bar with "Ask them" (`groupstyle.js` `bar()`).
- **Who can do what here**: one sheet, opened from Company, People and Settings, drawn from the live table
  (`groupstyle.js` `who()`), with "Ask" on every row you can't do.
- **The group's words.** Company / Lead / Role / Check-in can be renamed (Club, Captain, Seat, Standup…). The app
  applies them after translation in every language (`app/ui/i18n.js` `words()`), and Flint reads the chosen words
  as the default ones (`plainWords()` in `flintnlu.js` `parse()`).
- **AI helpers and votes.** Off by default. If the group switches on "AI helpers may vote on small, safe things",
  a helper may fill its owner's ballot on a low-risk request only; the owner's own vote replaces it, so a person and
  their helper are never two votes.
- **One council, not two.** With the council style, the Task Board is "open to claim" (`taskflow.js` `settings()`)
  and Ship it uses the council's rule (`ship.js` `load()`); their own switches say so.
- **Publishing and "how the group decides" are rows now**: `site.publish` (default: builders and up, as before) and
  `group.decide` (default: admins).
- **Host-only rows stay host-only**, described as "the computer's owner". The owner can always put a project back
  to One lead (`POST /api/groupstyle/reset`), so a council that has gone quiet can't lock a tribe.

- **One counting rule.** `groupstyle.js` `counting()` (reached everywhere through `perms.counting()` and
  `perms.passMark()`) answers "who counts, and how many must agree". With no council it answers "the way it always
  was". Under a council: chat votes that are Approve / Not yet (`votes.js` `create()`), Board proposals (`board.js`
  `tally()`), Ship it (`ship.js` `deciders()`, `tally()`) and high-risk approvals (`approvals.js` `decide()`, one
  answer per council member) all count the council with the council's pass mark. Polls with options stay open to
  everyone, and an AI helper's small requests still go to its owner.
- **Propose and Request, outside the chat.** Any button marked `data-gs-ask` asks for that thing. They are on the
  Company page (a council member sees "Propose a change" where the edit buttons were hidden), on Publish ("Ask to
  publish"), on a waiting integration ("Ask to send it to the main copy"), on a task ("Put it to a vote"), in Files
  ("Send to the main copy" from My folder), and in the ? next step, which becomes "Ask them" when the step is
  something you can't do alone (`nextstep.js` `askStep()`).
- **Rules are visible in every style**: each row of "Who can do what here" shows how it is decided and by whom. They
  are editable in the "Our own roles" style.

What stayed as it was, on purpose: the approvals inbox still sends an AI helper's low and medium-risk requests to its
owner, and polls count everyone.

Not done yet: Board proposals and Ship it have no "time limit" of their own (the council's time limit applies to
chat votes and requests). The Company page's individual edit buttons open after the council says yes to "change
project settings" (a one-day pass); before that a council member sees one "Propose a change" button.

## 4. Folders: who may write where

| Place | Who may write | How work gets to the main copy |
|---|---|---|
| **The project's code folder** (the live copy everyone previews) | Any builder in the project; an AI helper when its owner may (`codefiles.js` `canEdit`). Spectators and guest passes: read only. | It already is the working copy. |
| **A branch of your own** (an AI helper's work, or yours in your own editor) | You and your helpers. | "Send my work to the main copy" = merge into main (`repo.merge`). One lead: the host or an admin does it, or says yes to your request. Council: the council agrees, then you send it. Open: any builder. Own roles: whoever holds a role that looks after it, under the rule the group picked. |
| **GitHub** (Ship it) | Decided per project: host/admin, more than half, or everyone (`ship.js`); under a council, the council's rule. | Ship it pushes exactly what was reviewed, never forced. |
| **A shared folder** (sync) | Any person in the project who is not a spectator or guest writes into it (`sync.js` `writer()`); only someone who may change settings connects, changes or undoes it (`lead()`). | Sync sends saved changes; conflicts are sorted out by someone who may change settings. |
| **My folder** (`people/<your id>/` in the project's files; "My folder" in Files › Code) | You, always, even on a guest pass; your AI helpers; and whoever may delete anyone's files, for tidying (`codefiles.js` `writeBlock()`). Nobody else. People who only watch have none. | "Send to the main copy" copies one file to the same path in the project (`codefiles.js` `send2main()`). It needs "send work to the main copy" (`repo.merge`), so the group's style decides: one lead = the host or an admin, or their yes to your request; council = the council agrees; open = any builder; own roles = whoever the group gave it to. A refusal shows who can and offers "Ask them". |

Fixed here: publishing had no row (part 2, point 5), and there was no folder of your own (point 8).

Honest limits of My folder: it lives in the project's files, so it needs a project folder; everyone in the project can
read it; builders can still edit the rest of the project folder directly, as before (My folder is the place to work
without touching the shared files, and the only place a guest pass can write). An AI helper writes in its owner's
folder, and elsewhere only where its owner already may.

## Tests

- `app/test/security10_test.py`: a council decision can't be forged (voting twice, a spectator, an AI helper, a
  builder outside the council, a chat vote that brings its own deciders, closing early); a pass is one person, one
  thing, one project; custom roles never hold host-only rows and never lift spectators or AI helpers; AI votes.
- `app/test/e2e_group_styles.py`: the sheet, the ways in, Ask them, the group's words in two languages, the setup
  question, a council, a custom role, a change put to a vote, 390px.
