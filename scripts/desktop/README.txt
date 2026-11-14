TribeCode
=========

  Working\Start-Working.bat   THE MAIN FOLDER: the newest work (dev), open at once in its own
                              window. No .exe to build; it pulls new work by itself every 20 s
                              and reloads. Uses its own test tribe (Working\tribe-data).

  Stable\Update-and-Open-TribeCode.bat
                              THE INSTALLED APP (released versions). Updates the .exe only when
                              you double-click it (or press Restart to update in the app), then
                              opens it. Uses your own tribe in %USERPROFILE%\TribeCode.

  Invite-A-Friend.bat         ONE DOUBLE-CLICK: a fresh project and a link that works from
                              anywhere, already copied. Paste it in a text. Your friend taps
                              it, types a name and is in; on a computer the same link hands
                              them the one line that connects their Claude Code.
                              (Same as Home -> Invite a friend inside the app.)

  Start-Demo-Tribe.bat        A READY-MADE TRIBE TO TEST WITH FRIENDS: two projects in
                              %USERPROFILE%\TribeCode-Projects (Lantern Run, a 2D platformer,
                              and Tavern 3D, a tavern with bot patrons), each with roles that
                              own folders, tasks, a living doc, a vote and repo autopilot.
                              Prints the invite link and the Claude Code command. Uses the
                              Working copy (dev) at :4848. Checklist: docs\DEMO-TRIBE.md.

  Tools\
    Turn-On-Auto-Update.bat   Update quietly at log-in and daily at 4 am (never while open).
    Turn-Off-Auto-Update.bat
    Start-Stable-From-Source.bat  The released code from source in a browser (rarely needed).
    Reset-Everything.bat      Clears old settings and caches (asks first).


Flow: new work lands on dev (Working) -> merged to main and released -> the GitHub
release, the website demo and the desktop app all update together.
Needs Node.js and Git only for the Working folder.
