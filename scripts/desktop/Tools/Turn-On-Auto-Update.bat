@echo off
title TribeCode - auto update
rem Checks for a new TribeCode when you log in and every day at 4 am, and installs it quietly
rem (never while TribeCode is open: the app installs updates itself when you close it).
set "PS=powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%~dp0tribecode-update.ps1\" -Quiet"
schtasks /Create /F /TN "TribeCode\Update at logon" /SC ONLOGON /TR "%PS%" >nul && schtasks /Create /F /TN "TribeCode\Update daily" /SC DAILY /ST 04:00 /TR "%PS%" >nul
if errorlevel 1 (echo  Could not create the scheduled tasks. & pause & exit /b 1)
echo  Auto update is on: at log-in and daily at 4 am. Turn-Off-Auto-Update.bat undoes it.
pause
