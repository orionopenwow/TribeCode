@echo off
setlocal
title TribeCode - get the latest version
cd /d "%~dp0"
echo.
echo  Downloading the latest TribeCode for Windows from GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12';" ^
  "$all = Invoke-RestMethod -Headers @{ 'User-Agent'='TribeCode' } 'https://api.github.com/repos/orionopenwow/TribeCode/releases?per_page=10';" ^
  "$r = $null; $a = $null; foreach ($x in $all) { if ($x.draft) { continue }; $a = $x.assets | Where-Object { $_.name -like '*-setup.exe' } | Select-Object -First 1; if ($a) { $r = $x; break } }" ^
  "if (-not $a) { Write-Host '  No Windows installer in the latest release yet. Try again in a few minutes.'; exit 2 }" ^
  "Write-Host ('  ' + $r.tag_name + ': ' + $a.name);" ^
  "Invoke-WebRequest -UseBasicParsing -Headers @{ 'User-Agent'='TribeCode' } $a.browser_download_url -OutFile $a.name;" ^
  "Set-Content -Path 'latest.txt' -Value $a.name"
if errorlevel 1 ( echo. & pause & exit /b 1 )
set /p SETUP=<latest.txt
echo.
echo  Saved %SETUP% in this folder. Starting the installer...
start "" "%SETUP%"
