@echo off
setlocal
title TribeCode WORKING (dev, live) - http://localhost:4848
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

rem WORKING = the dev branch, where new work lands first. No exe to compile:
rem it pulls from GitHub every 20 s and open tabs reload by themselves.
rem It uses its own test tribe in this folder (tribe-data), so your own tribe stays untouched.
if not exist "TribeCode\server\index.js" (
  echo  Downloading TribeCode...
  git clone https://github.com/orionopenwow/TribeCode.git TribeCode || (pause & exit /b 1)
)
cd TribeCode
git fetch --quiet origin
git checkout --quiet -B dev origin/dev
git branch --quiet --set-upstream-to=origin/dev dev

set "TRIBE_DIR=%~dp0tribe-data"
rem Let the desktop app's "Working version" switch talk to the app (window buttons, hosting). Only the
rem app's own page gets that by default; this marker file turns it on for :4848 on this computer.
if not exist "%USERPROFILE%\.tribecode" mkdir "%USERPROFILE%\.tribecode"
if not exist "%USERPROFILE%\.tribecode\working-lane" type nul > "%USERPROFILE%\.tribecode\working-lane"
rem Stop anything already on 4848 (an older Working window).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":4848 .*LISTENING"') do taskkill /F /PID %%p >nul 2>nul
echo.
echo  Working TribeCode: http://localhost:4848   (test tribe: %TRIBE_DIR%)
echo  Keep this window open while you test. Close it to stop.
rem Open it in its own app window (like the desktop app), a few seconds after the server starts.
if /i not "%~1"=="--no-window" start "" /b cmd /c "timeout /t 4 >nul && (start msedge --app=http://localhost:4848 || start http://localhost:4848)"
node scripts\live.js --port 4848 --no-open
echo.
echo  The server stopped. If there is an error above, send it to Claude.
pause
