@echo off
rem ONE DOUBLE-CLICK: a fresh project, a link that works from anywhere, copied for you.
rem Paste it in a text to your friend. They tap it, type a name and they're in
rem (on a computer it also hands them the one line that connects their Claude Code).
set "APP=%LOCALAPPDATA%\TribeCode\tribecode.exe"
if not exist "%APP%" (
  echo  Installing TribeCode first...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Tools\tribecode-update.ps1" -Quiet
)
start "" "tribecode://invite"
