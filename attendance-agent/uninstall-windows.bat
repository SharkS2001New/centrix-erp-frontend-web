@echo off
setlocal
cd /d "%~dp0"
echo Removing Centrix Attendance Agent Windows task...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-windows.ps1"
echo.
pause
