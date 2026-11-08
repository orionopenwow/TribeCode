# Starting a tribe from a phone, and sharing hosting

A tribe's code lives in its shared GitHub repo. To keep the tribe online and quick, someone runs it on a computer or server that stays on: the server, the chat, the docs, the repo and the agents' endpoint all run
there. Phones can't do that job (iOS and Android stop background apps, and there's no Node on a phone). So the plan is
not "host on the phone"; it's "a phone can start everything, and the hosting lives with whoever has a computer, and
can move".

## Words
- **Owner**: who started the tribe. Decides who hosts, can delete projects.
- **Host**: the computer running the tribe right now.
- **Co-host**: a computer that keeps a recent copy and can take over.

## Phase 1: start from a phone (shipped in v0.6.9, first part)
Phone Home's **+**, before you have a tribe, asks **Who runs it?**
1. **My own computer**: shares a link to yourself; install, open, and the app hosts (zero-step setup).
2. **A friend's computer**: shares a message asking a friend to host and send back the invite link.
3. **I have an invite link**: join.

Next in phase 1:
- **Pair a computer by QR**: the phone shows a QR; the desktop app scans it (or opens `tribecode://pair?…`), starts
  hosting with the phone's name as owner, and the phone is signed in immediately (a device link, like /m/<key>/).
- **Draft tribe on the phone**: until a host exists, ideas, voice notes, a vision and tasks are kept on the phone
  (IndexedDB). When the first host comes online, the draft moves in (one import call), so nothing waits on a computer.

## Phase 2: links that survive a move
Today an invite link is the host's address. If hosting moves, links break.
- The GitHub Pages friend link (`go.html#s=<host>&c=<code>`, site.js) becomes the stable address: the host publishes
  its current address to a small JSON on Pages (or a gist) each time it starts; `go.html` reads it and redirects.
- Phones remember the stable address, not the host's, so they follow a move without a new invite.

## Phase 3: move hosting in one tap
- **Settings › Hosting › Move to another computer**: the owner picks a member who has the desktop app.
- The current host makes a backup (the existing Download backup: members, projects, chat, docs, tasks), sends it
  to the new host over the tribe connection, the new host restores and starts, and publishes its address (phase 2).
- Repos move by git (they're already on GitHub with autopilot); local-only repos are included in the backup.

## Phase 4: co-hosts and failover
- Members who turn on **Co-host** keep a copy: every few minutes the host pushes an encrypted snapshot (the backup
  format, encrypted with a key only tribe members' apps hold) to a private GitHub repo or straight to co-hosts.
- If the host has been offline for a while, a co-host's app offers **Take over hosting**; the owner (or any member
  if the owner is away too) taps it, the co-host restores the newest snapshot and publishes its address.
- When the old host comes back, it sees it's no longer the host and becomes a co-host.
- Phones show who hosts: "Host: Orion's PC · online", and "Ask Maya to host" when it's away.

## Working with desktop people
- Phones are full members: chat, voice notes, docs, tasks, votes, approvals, @ai (a teammate's Claude, the local
  model, or the board), and their own Claude Code from any computer later.
- Desktop people bring the Claude Codes, the repos, and the hosting; phone people bring ideas, reviews, approvals.

## Order
1. QR pairing (phase 1). 2. Draft tribe on the phone (phase 1). 3. Stable links (phase 2). 4. Move hosting (phase 3).
5. Co-hosts + failover (phase 4). Each step is useful alone and keeps "self-hosted, zero dependencies".
