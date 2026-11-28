@echo off
setlocal
title TribeCode - start a test project
cd /d "%~dp0"
rem In the repo this file lives in Tools\: step up to the repo root.
if exist "..\server\index.js" cd ..

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  TribeCode needs Node.js. Opening the download page...
  echo  Install the LTS version, then double-click this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  TribeCode needs Git. Opening the download page...
  echo  Install it with the default options, then double-click this file again.
  start "" https://git-scm.com/download/win
  pause
  exit /b 1
)

rem Works from anywhere: if this file isn't inside the repo, get the repo next to it.
if not exist "server\index.js" (
  if not exist "TribeCode\server\index.js" (
    echo  Downloading TribeCode...
    git clone https://github.com/orionopenwow/TribeCode.git TribeCode || (pause & exit /b 1)
  )
  cd TribeCode
)

rem fix/p15-updates: update safely (your own edits are set aside with git stash, never lost; commits of your own stop it
rem with a clear message), stop an older TribeCode still running on the port, and print the version you're on now.
if not exist "scripts\update-from-source.js" git pull --ff-only
node scripts\update-from-source.js

node scripts\start-test-project.js
echo.
echo  You can close this window. TribeCode keeps running in its own window.
pause
