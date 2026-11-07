@echo off
setlocal
title TribeCode - clean out old copies
cd /d "%~dp0"
echo.
echo  This cleans out old TribeCode copies so testing runs from source:
echo    - stops TribeCode, tribecode-server and any server on ports 4747 / 4848
echo    - deletes the old app settings and cache (dev.tribecode.desktop)
echo    - deletes old installers in this folder
echo    - deletes the old v0.1 code copy in %USERPROFILE%\TribeCode (only if it is a code copy)
echo  Your Stable and Working folders are kept.
echo.
choice /m "  Go ahead"
if errorlevel 2 exit /b 0

echo.
echo  Stopping TribeCode...
taskkill /F /T /IM tribecode.exe >nul 2>nul
taskkill /F /T /IM tribecode-server.exe >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":4747 .*LISTENING" /c:":4848 .*LISTENING"') do taskkill /F /PID %%p >nul 2>nul
timeout /t 2 >nul

echo  Removing old settings and cache...
if exist "%LOCALAPPDATA%\dev.tribecode.desktop" rmdir /s /q "%LOCALAPPDATA%\dev.tribecode.desktop"
if exist "%APPDATA%\dev.tribecode.desktop" rmdir /s /q "%APPDATA%\dev.tribecode.desktop"

echo  Removing old installers here...
del /q "TribeCode_*_x64-setup.exe" 2>nul
del /q "latest.txt" 2>nul

rem The old code copy: only delete it if it really is a git checkout of TribeCode with no tribe data in it.
rem %USERPROFILE%\TribeCode is also the default tribe folder: its data lives in .tribe\ (tribe.json, members.json)
rem and projects\, so any of those means "keep it".
set "OLD=%USERPROFILE%\TribeCode"
set "HASDATA="
if exist "%OLD%\.tribe" set "HASDATA=1"
if exist "%OLD%\projects" set "HASDATA=1"
if exist "%OLD%\tribe.json" set "HASDATA=1"
if exist "%OLD%\.git" if exist "%OLD%\server\index.js" (
  if defined HASDATA (
    echo  Kept %OLD%: it also holds tribe data.
  ) else (
    echo  Removing the old code copy in %OLD%...
    rmdir /s /q "%OLD%"
  )
)

echo.
echo  Done. Next:
echo    Stable\Start-Stable.bat    the released code (main)
echo    Working\Start-Working.bat  new work (dev), live reload, no exe
echo.
pause
