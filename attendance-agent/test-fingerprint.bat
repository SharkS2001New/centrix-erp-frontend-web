@echo off
setlocal
set INSTALLDIR=C:\Program Files\Centrix\AttendanceAgent
if exist "%INSTALLDIR%\settings-ui.js" (
  cd /d "%INSTALLDIR%"
) else (
  cd /d "%~dp0"
)
echo.
echo After this starts, PLACE YOUR FINGER on the Hikvision terminal.
echo You have 90 seconds. Press any key to begin the wait.
pause >nul
echo Waiting 90 seconds for a new punch...
node "%CD%\settings-ui.js" --fingerprint
echo.
pause
