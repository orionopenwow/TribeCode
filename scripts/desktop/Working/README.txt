WORKING  (branch: dev)
======================

Double-click Start-Working.bat to try new work before it's released.

- Runs at http://localhost:4848, next to Stable (4747), so both can be open.
- No exe to build: it pulls new commits from GitHub every 20 seconds,
  restarts the server when server code changes, and open browser tabs
  reload by themselves when the UI changes.
- Uses its own test tribe in this folder (tribe-data), so nothing you do
  here touches your real tribe.
- Try the phone layout: press F12 in Chrome/Edge, then Ctrl+Shift+M.

When the work on dev looks good, it gets merged into main and released.
Stable and the installed app pick it up then.
