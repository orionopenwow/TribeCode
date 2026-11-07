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

  New-Project-For-A-Friend.bat  ONE CLICK: a Pixel Quest project, the public link, an invite
                              page with QR for your friend, and the command for your Claude Code.

  Tools\
    Turn-On-Auto-Update.bat   Update quietly at log-in and daily at 4 am (never while open).
    Turn-Off-Auto-Update.bat
    Start-Stable-From-Source.bat  The released code from source in a browser (rarely needed).
    Reset-Everything.bat      Clears old settings and caches (asks first).

  Working\                    The dev copy and its test tribe (tribe-data). Your real tribe
                              lives in %USERPROFILE%\TribeCode.

Flow: new work lands on dev (Try-New-Work) -> merged to main and released -> the GitHub
release, the website demo and the desktop app all update together.
Needs Node.js and Git only for Try-New-Work and New-Project-For-A-Friend.
