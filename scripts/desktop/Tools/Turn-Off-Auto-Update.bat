@echo off
schtasks /Delete /F /TN "TribeCode\Update at logon" >nul 2>nul
schtasks /Delete /F /TN "TribeCode\Update daily" >nul 2>nul
echo  Auto update is off.
pause
