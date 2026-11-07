@echo off
setlocal
title TribeCode - new project + instant friend link
cd /d "%~dp0"

where node >nul 2>nul || (echo  TribeCode needs Node.js: https://nodejs.org & start "" https://nodejs.org/en/download & pause & exit /b 1)
where git  >nul 2>nul || (echo  TribeCode needs Git: https://git-scm.com & start "" https://git-scm.com/download/win & pause & exit /b 1)

rem Uses the Working copy (dev branch, newest features) and its test tribe, at http://localhost:4848.
if not exist "TribeCode\server\index.js" (
  echo  Downloading TribeCode...
  git clone https://github.com/orionopenwow/TribeCode.git TribeCode || (pause & exit /b 1)
)
cd TribeCode
git fetch --quiet origin
git checkout --quiet -B dev origin/dev
set "TRIBE_DIR=%~dp0tribe-data"

echo.
echo  One click: starts TribeCode (if needed), turns on the public link, creates the
echo  Pixel Quest project, and opens a page with the invite link + QR for your friend
echo  and the command for your Claude Code.
echo.
node scripts\start-test-project.js --port 4848
echo.
echo  Text the link to your friend. Keep the TribeCode window open while you play.
pause
