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

rem STABLE = the released code on the main branch, with your real tribe (%USERPROFILE%\TribeCode).
if not exist "TribeCode\server\index.js" (
  echo  Downloading TribeCode...
  git clone https://github.com/orionopenwow/TribeCode.git TribeCode || (pause & exit /b 1)
)
cd TribeCode
git checkout --quiet main
echo  Getting the latest stable version...
git pull --ff-only --quiet

rem The installed desktop app also uses port 4747. If it's already running, just open it.
curl -s -o nul http://localhost:4747/api/health && (
  echo  TribeCode is already running on this computer. Opening it...
  start msedge --app=http://localhost:4747 || start "" http://localhost:4747
  timeout /t 3 >nul
  exit /b 0
)

echo.
echo  Stable TribeCode: http://localhost:4747   (Ctrl+C to stop)
start "" /b cmd /c "timeout /t 3 >nul && (start msedge --app=http://localhost:4747 || start http://localhost:4747)"
node server\index.js --port 4747
pause
