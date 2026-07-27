@echo off
setlocal EnableExtensions
title Centrix Print Agent — Build and Install

cd /d "%~dp0"

echo.
echo  Centrix Print Agent — Build and Install
echo  --------------------------------------
echo  Folder: %CD%
echo.

REM Elevate to Administrator if needed
net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator permission...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-and-install.ps1"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo FAILED with exit code %EXITCODE%.
  echo Read the messages above, then press any key to close.
) else (
  echo Done. Press any key to close.
)
pause >nul
exit /b %EXITCODE%
