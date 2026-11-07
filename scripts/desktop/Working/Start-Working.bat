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
rem It uses its own test tribe in this folder (tribe-data), so your real tribe stays untouched.
if not exist "TribeCode\server\index.js" (
  echo  Downloading TribeCode...
  git clone https://github.com/orionopenwow/TribeCode.git TribeCode || (pause & exit /b 1)
)
cd TribeCode
git fetch --quiet origin
git checkout --quiet -B dev origin/dev
git branch --quiet --set-upstream-to=origin/dev dev

set "TRIBE_DIR=%~dp0tribe-data"
echo.
echo  Working TribeCode: http://localhost:4848   (test tribe: %TRIBE_DIR%)
node scripts\live.js --port 4848
pause
