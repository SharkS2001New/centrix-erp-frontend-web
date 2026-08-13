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
  echo Install failed. Run this file as Administrator. Node.js 20+ is required.
  pause
  exit /b 1
)
echo.
pause
