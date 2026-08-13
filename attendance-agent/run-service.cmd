@echo off
rem Always-on wrapper used by the Centrix Attendance Agent Windows task.
cd /d "%~dp0"
:loop
echo [%date% %time%] starting attendance agent >> "%~dp0agent.log"
node "%~dp0agent.js" >> "%~dp0agent.log" 2>&1
echo [%date% %time%] agent exited %ERRORLEVEL% - restarting in 5s >> "%~dp0agent.log"
timeout /t 5 /nobreak >nul
goto loop
