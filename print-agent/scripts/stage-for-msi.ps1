# Builds offline staging folder for MSI packaging (Windows only).
param(
  [string]$StagingRoot = "",
  [string]$NodeVersion = ""
)

$ErrorActionPreference = "Stop"
$PrintAgentRoot = Split-Path -Parent $PSScriptRoot
if (-not $StagingRoot) {
  $StagingRoot = Join-Path $PrintAgentRoot "dist\staging"
}

if (-not $NodeVersion) {
  $NodeVersion = (Get-Content (Join-Path $PrintAgentRoot "node-version.txt") -Raw).Trim()
}
if (-not $NodeVersion) { $NodeVersion = "20.18.0" }

Write-Host "==> Staging Centrix Print Agent for MSI"
Write-Host "    Source:  $PrintAgentRoot"
Write-Host "    Staging: $StagingRoot"
Write-Host "    Node:    $NodeVersion"

if (Test-Path $StagingRoot) {
  Remove-Item $StagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $StagingRoot -Force | Out-Null

# Application files
Copy-Item (Join-Path $PrintAgentRoot "server.js") $StagingRoot
Copy-Item (Join-Path $PrintAgentRoot "package.json") $StagingRoot
Copy-Item (Join-Path $PrintAgentRoot "package-lock.json") $StagingRoot -ErrorAction SilentlyContinue
Copy-Item (Join-Path $PrintAgentRoot "node-version.txt") $StagingRoot

$ScriptsDir = Join-Path $StagingRoot "scripts"
New-Item -ItemType Directory -Path $ScriptsDir -Force | Out-Null
Copy-Item (Join-Path $PrintAgentRoot "scripts\register-scheduled-task.ps1") $ScriptsDir
Copy-Item (Join-Path $PrintAgentRoot "scripts\unregister-scheduled-task.ps1") $ScriptsDir

# Portable Node.js (Windows x64)
$RuntimeDir = Join-Path $StagingRoot "runtime"
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
$NodeFolder = "node-v$NodeVersion-win-x64"
$NodeDir = Join-Path $RuntimeDir $NodeFolder
if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
  Write-Host "==> Downloading portable Node.js $NodeVersion …"
  $zipPath = Join-Path $RuntimeDir "node.zip"
  $url = "https://nodejs.org/dist/v$NodeVersion/$NodeFolder.zip"
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
  Expand-Archive -Path $zipPath -DestinationPath $RuntimeDir -Force
  Remove-Item $zipPath -Force
}

$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
$NpxCmd = Join-Path $NodeDir "npx.cmd"
$env:PATH = "$NodeDir;$env:PATH"

# npm dependencies + Playwright Chromium (bundled in MSI)
$PlaywrightBrowsers = Join-Path $StagingRoot "playwright-browsers"
$env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightBrowsers
New-Item -ItemType Directory -Path $PlaywrightBrowsers -Force | Out-Null

Push-Location $StagingRoot
try {
  Write-Host "==> npm install (production) …"
  & $NpmCmd install --omit=dev
  Write-Host "==> playwright install chromium …"
  & $NpxCmd playwright install chromium
} finally {
  Pop-Location
}

# Launcher used by Scheduled Task
$StartCmd = Join-Path $StagingRoot "start-agent.cmd"
@"
@echo off
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%~dp0playwright-browsers
"%~dp0runtime\$NodeFolder\node.exe" server.js
"@ | Set-Content -Path $StartCmd -Encoding ASCII

Write-Host "==> Staging complete."
