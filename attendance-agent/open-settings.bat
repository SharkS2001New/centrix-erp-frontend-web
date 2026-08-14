@echo off
setlocal
set INSTALLDIR=C:\Program Files\Centrix\AttendanceAgent
if exist "%INSTALLDIR%\settings-ui.js" (
  cd /d "%INSTALLDIR%"
) else (
  cd /d "%~dp0"
)
set SETTINGS_URL=http://127.0.0.1:9251/
echo Opening CentrixAttendanceAgent Test connection...
curl -s -o nul --connect-timeout 2 %SETTINGS_URL%
if not errorlevel 1 (
  echo Agent is already running. Opening the browser...
  start "" "%SETTINGS_URL%"
  goto :eof
)
echo Starting Test connection. Leave this window open, or use the Windows service instead.
start "" "%SETTINGS_URL%"
node "%CD%\settings-ui.js"
if errorlevel 1 pause
