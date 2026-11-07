@echo off
title TribeCode
rem Opens TribeCode. First installs or updates it to the newest release (silently, no installer wizard)
rem and tidies away old versions. One calm line per step, then "TribeCode is up to date (vX)".
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tools\tribecode-update.ps1" -Clean -Launch
if errorlevel 1 (pause & exit /b 1)
rem Leave the summary on screen for a moment, then close by itself.
timeout /t 3 /nobreak >nul
