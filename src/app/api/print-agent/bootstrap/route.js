export const runtime = "nodejs";

function windowsBootstrap(origin) {
  return `@echo off
setlocal EnableExtensions
title Centrix Print Agent — Install
set "INSTALL_DIR=%LOCALAPPDATA%\\CentrixPrintAgent"
set "ORIGIN=${origin}"

echo.
echo  Centrix Print Agent — one-time till setup
echo  Includes Node.js 20+ if not already on this PC.
echo  -------------------------------------------
echo.

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"

echo Downloading agent files from %ORIGIN% ...
curl -fsSL "%ORIGIN%/api/print-agent/file/server.js" -o server.js
if errorlevel 1 goto :download_fail
curl -fsSL "%ORIGIN%/api/print-agent/file/package.json" -o package.json
if errorlevel 1 goto :download_fail
curl -fsSL "%ORIGIN%/api/print-agent/file/node-version.txt" -o node-version.txt
if errorlevel 1 goto :download_fail
curl -fsSL "%ORIGIN%/api/print-agent/file/install.ps1" -o install.ps1
if errorlevel 1 goto :download_fail

echo.
echo Running install (Node.js if needed, npm, Playwright, auto-start)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_DIR%\\install.ps1" -Autostart
if errorlevel 1 (
  echo Install script failed. See messages above.
  pause
  exit /b 1
)

echo.
echo Done. Open Centrix ERP ^> Administration ^> Till printing
echo Enable the print agent and click "Test print receipt".
echo.
pause
exit /b 0

:download_fail
echo ERROR: Could not download installer files. Check internet and ERP URL.
pause
exit /b 1
`;
}

function macBootstrap(origin) {
  return `#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="\${HOME}/.centrix-print-agent"
ORIGIN="${origin}"

echo ""
echo " Centrix Print Agent — one-time till setup"
echo " Includes Node.js 20+ if not already on this PC."
echo " -------------------------------------------"
echo ""

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "Downloading agent files from $ORIGIN ..."
curl -fsSL "$ORIGIN/api/print-agent/file/server.js" -o server.js
curl -fsSL "$ORIGIN/api/print-agent/file/package.json" -o package.json
curl -fsSL "$ORIGIN/api/print-agent/file/node-version.txt" -o node-version.txt
curl -fsSL "$ORIGIN/api/print-agent/file/install.sh" -o install.sh
chmod +x install.sh

echo ""
echo "Running install (Node.js if needed, npm, Playwright, auto-start)..."
./install.sh --autostart

echo ""
echo "Done. Open Centrix ERP → Administration → Till printing"
echo "Enable the print agent and click Test print receipt."
`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? "windows";
  const origin = url.origin;

  if (platform === "mac" || platform === "linux") {
    const body = macBootstrap(origin);
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-sh; charset=utf-8",
        "Content-Disposition": 'attachment; filename="centrix-install-print-agent.sh"',
      },
    });
  }

  const body = windowsBootstrap(origin);
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="centrix-install-print-agent.bat"',
    },
  });
}
