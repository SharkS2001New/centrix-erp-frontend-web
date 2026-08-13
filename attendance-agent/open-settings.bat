@echo off
setlocal
set INSTALLDIR=C:\Program Files\Centrix\AttendanceAgent
if exist "%INSTALLDIR%\settings-ui.js" (
  cd /d "%INSTALLDIR%"
) else (
  cd /d "%~dp0"
)
echo Opening CentrixAttendanceAgent settings...
node "%CD%\settings-ui.js"
if errorlevel 1 pause
