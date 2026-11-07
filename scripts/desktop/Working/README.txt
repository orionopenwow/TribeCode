WORKING  (the newest work, branch dev)  <- the main folder we work in
=====================================================================

Double-click Start-Working.bat.

- Opens the newest TribeCode at once, in its own app window: no .exe to compile.
- Pulls new work from GitHub every 20 seconds; the server restarts by itself when
  server code changes and the window reloads when the screens change.
- Runs at http://localhost:4848, next to the installed app (4747), so both can be open.
- Uses its own test tribe in this folder (tribe-data), so testing never touches your real tribe.
- Phone layout: press F12 in Edge/Chrome, then Ctrl+Shift+M.

When the work here looks good, it is released from main, and ..\Stable picks it up
when you double-click Update-and-Open-TribeCode.bat.
