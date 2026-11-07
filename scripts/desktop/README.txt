TribeCode
=========

  TribeCode.bat               OPEN TRIBECODE. Installs it the first time, updates it to
                              the newest release every time, and tidies away old
                              versions and leftover files. (The app also updates itself:
                              it downloads in the background and installs when you close it.)

  Try-New-Work.bat            NEWEST WORK (dev branch), live: starts the Working server and
                              shows it inside the TribeCode app window. No exe to rebuild:
                              it reloads by itself when new commits land. Profile menu ->
                              "Back to the installed version" returns to the release.

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

  Working\                    The dev copy and its test tribe (tribe-data). Your real tribe
                              lives in %USERPROFILE%\TribeCode.

Flow: new work lands on dev (Try-New-Work) -> merged to main and released -> the GitHub
release, the website demo and the desktop app all update together.
Needs Node.js and Git only for Try-New-Work and the Working folder.
