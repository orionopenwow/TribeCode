@echo off
setlocal
title TribeCode STABLE (main) - http://localhost:4747
cd /d "%~dp0"
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

rem STABLE = the released code on the main branch, with your own tribe (%USERPROFILE%\TribeCode).
if not exist "%~dp0..\Stable" mkdir "%~dp0..\Stable"
cd /d "%~dp0..\Stable"
if not exist "TribeCode\server\index.js" (
  echo  Downloading TribeCode...
  git clone https://github.com/orionopenwow/TribeCode.git TribeCode || (pause & exit /b 1)
)
cd TribeCode
rem fix/p15-updates: update safely (your own edits are set aside with git stash, never lost; commits of your own stop it
rem with a clear message), stop an older TribeCode still running on the port, and print the version you're on now.
if not exist "scripts\update-from-source.js" git pull --ff-only
node scripts\update-from-source.js --branch main --port 4747

rem The installed desktop app also uses port 4747. If TribeCode of this same version is still running, just open it
rem (an older one was stopped above).
curl -s -o nul http://localhost:4747/api/health && (
  echo  TribeCode is already running on this computer. Opening it...
  start msedge --app=http://localhost:4747 || start "" http://localhost:4747
  timeout /t 3 >nul
  exit /b 0
)

echo.
echo  Stable TribeCode: http://localhost:4747   (Ctrl+C to stop)
start "" /b cmd /c "timeout /t 3 >nul && (start msedge --app=http://localhost:4747 || start http://localhost:4747)"
rem --serve restarts the server when it asks to finish an update (Settings > About > Repair install).
node scripts\update-from-source.js --serve --no-update -- --port 4747
pause
