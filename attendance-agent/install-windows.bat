@echo off
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator rights to install the CentrixAttendanceAgent Windows service...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo Centrix Attendance Agent installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
if errorlevel 1 (
  echo.
  echo Install failed. See the message above.
  echo If this window is not running as Administrator, right-click install-windows.bat and choose Run as administrator.
  echo Node.js 20 or newer is required: https://nodejs.org/
  pause
  exit /b 1
)
echo.
pause
