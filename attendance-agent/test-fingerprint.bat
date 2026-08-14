@echo off
setlocal
set INSTALLDIR=C:\Program Files\Centrix\AttendanceAgent
if exist "%INSTALLDIR%\settings-ui.js" (
  cd /d "%INSTALLDIR%"
) else (
  cd /d "%~dp0"
)
echo.
echo Place a finger on the Hikvision terminal, wait for the beep, then press any key.
pause >nul
echo Checking the terminal...
node "%CD%\settings-ui.js" --fingerprint
echo.
pause
