@echo off
title TribeCode - try new work
rem Starts the Working version (dev branch, live reload) and shows it inside the desktop app window.
rem No exe to rebuild: the installed app just points at http://localhost:4848.
start "TribeCode Working server" /min cmd /c ""%~dp0Working\Start-Working.bat" --no-window"
echo  Starting the Working version...
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){ try { if((Invoke-WebRequest -UseBasicParsing http://localhost:4848/api/health -TimeoutSec 2).StatusCode -eq 200){ exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 (echo  It didn't start. Open the "TribeCode Working server" window to see why. & pause & exit /b 1)
if exist "%LOCALAPPDATA%\TribeCode\tribecode.exe" (
  start "" "tribecode://working"
) else (
  start msedge --app=http://localhost:4848 || start http://localhost:4848
)
