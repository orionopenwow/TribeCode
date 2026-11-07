@echo off
title TribeCode - update and open
rem STABLE: the installed app (the .exe). It only changes when you double-click this file
rem (or press Restart to update inside the app). Installs it the first time, updates it to the
rem newest release, tidies away old versions, then opens it. One calm line per step.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\Tools\tribecode-update.ps1" -Clean -Launch
if errorlevel 1 (pause & exit /b 1)
timeout /t 3 /nobreak >nul
