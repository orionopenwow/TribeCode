@echo off
setlocal
title TribeCode - demo tribe (Lantern Run + Tavern 3D)
cd /d "%~dp0"

where node >nul 2>nul || (echo  TribeCode needs Node.js: https://nodejs.org & start "" https://nodejs.org/en/download & pause & exit /b 1)
where git  >nul 2>nul || (echo  TribeCode needs Git: https://git-scm.com & start "" https://git-scm.com/download/win & pause & exit /b 1)

rem Uses the Working copy (dev branch, newest features) and its test tribe, at http://localhost:4848,
rem so your real tribe stays untouched. Same clone as Working\Start-Working.bat.
if not exist "Working" mkdir "Working"
cd Working
if not exist "TribeCode\server\index.js" (
  echo  Downloading TribeCode...
  git clone https://github.com/orionopenwow/TribeCode.git TribeCode || (pause & exit /b 1)
)
cd TribeCode
git fetch --quiet origin
git checkout --quiet -B dev origin/dev
set "TRIBE_DIR=%~dp0Working\tribe-data"

echo.
echo  One click: starts TribeCode (if it isn't running), turns on the public link, and sets up
echo  two demo projects in %USERPROFILE%\TribeCode-Projects:
echo    Lantern Run  - a 2D platformer, one folder per lane (player, levels, art, audio, ui)
echo    Tavern 3D    - a 3D tavern with bot patrons (scene, npcs, player, ui)
echo  with roles, tasks, a living doc, a vote, toolbox picks and repo autopilot.
echo.
node scripts\start-demo-tribe.js --port 4848
echo.
echo  Text the invite link to your friends. docs\DEMO-TRIBE.md has the test checklist.
echo  Keep the TribeCode window open while you play.
pause
