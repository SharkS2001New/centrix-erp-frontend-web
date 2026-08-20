@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator rights...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo Building and installing Centrix Attendance Agent (.NET)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-and-install.ps1"
set ERR=%ERRORLEVEL%
echo.
if not %ERR%==0 (
  echo FAILED with exit code %ERR%.
  pause
  exit /b %ERR%
)
echo Success. Status page: http://127.0.0.1:9251
pause
