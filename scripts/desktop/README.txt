TribeCode
=========

Testing runs straight from the code on GitHub. No installer to rebuild.

  Reset-Old-TribeCode.bat     Run once: stops old copies, clears old settings and
                              installers, removes the old v0.1 code copy.

  Working\Start-Working.bat   NEW WORK (dev branch) at http://localhost:4848.
                              Opens in its own window, pulls new commits every
                              20 s and reloads by itself. Uses a test tribe.
                              Keep its black window open while testing.

  Stable\Start-Stable.bat     RELEASED code (main) at http://localhost:4747,
                              your real tribe.

  Get-Latest-TribeCode.bat    Optional: the installed desktop app (only for
                              release checks; it updates itself after that).

Flow: new work lands on dev (Working) -> you try it -> it is merged to main
and released, which updates the GitHub repo, the website demo and the
desktop app together.

Needs Node.js and Git (the launchers open the download pages if missing).
