@echo off
rem TribeCode clean slate: a throwaway local tribe folder (%USERPROFILE%\TribeCode-Dev, wiped each run), signed in as a
rem local guest, no tribe yet, live reload on. Add --keep to keep last time's folder. Docs: docs\DEV-TOOLS.md
cd /d "%~dp0.."
where node >nul 2>nul || (echo Node.js 20+ is needed: https://nodejs.org & pause & exit /b 1)
node scripts\dev\clean-slate.js %*
pause
