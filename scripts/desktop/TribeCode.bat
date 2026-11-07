@echo off
title TribeCode
rem Opens TribeCode. First installs or updates it to the newest release, and tidies away old versions.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tools\tribecode-update.ps1" -Clean -Launch
if errorlevel 1 pause
