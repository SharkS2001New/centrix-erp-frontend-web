@echo off
setlocal
cd /d "%~dp0"
echo Opening Centrix Attendance Agent settings...
node "%~dp0settings-ui.js"
if errorlevel 1 pause
