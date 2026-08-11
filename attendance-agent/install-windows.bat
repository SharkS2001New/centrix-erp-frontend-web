@echo off
setlocal
cd /d "%~dp0"
echo Centrix Attendance Agent installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
if errorlevel 1 (
  echo.
  echo Install failed. Ensure Node.js 20+ is installed, then try again.
  pause
  exit /b 1
)
echo.
pause
