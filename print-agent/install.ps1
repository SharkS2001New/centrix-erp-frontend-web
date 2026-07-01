# One-time setup for a Centrix till PC (Windows).
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1
#        powershell -ExecutionPolicy Bypass -File install.ps1 -Autostart
#
# Installs portable Node.js 20+ when system Node is missing or too old.

param(
  [switch]$Autostart
)

$ErrorActionPreference = "Stop"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Dir

$NodeVersion = (Get-Content -Path (Join-Path $Dir "node-version.txt") -Raw).Trim()
if (-not $NodeVersion) { $NodeVersion = "20.18.0" }

function Get-BundledNodeDir {
  $runtime = Join-Path $Dir "runtime"
  $candidate = Join-Path $runtime "node-v$NodeVersion-win-x64"
  if (Test-Path (Join-Path $candidate "node.exe")) {
    return $candidate
  }
  return $null
}

function Test-SystemNode {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  try {
    $major = [int](node -p "process.versions.node.split('.')[0]")
    return $major -ge 20
  } catch {
    return $false
  }
}

function Install-PortableNode {
  Write-Host "==> No suitable Node.js found — downloading portable Node.js $NodeVersion …"
  $runtime = Join-Path $Dir "runtime"
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  $zipPath = Join-Path $runtime "node.zip"
  $url = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
  Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
  Expand-Archive -Path $zipPath -DestinationPath $runtime -Force
  Remove-Item $zipPath -Force
  $nodeDir = Get-BundledNodeDir
  if (-not $nodeDir) {
    Write-Error "Portable Node.js download failed."
  }
  Write-Host "==> Portable Node.js installed at $nodeDir"
  return $nodeDir
}

function Initialize-NodePath {
  if (Test-SystemNode) {
    Write-Host "==> Using system Node.js $(node -v)"
    return @{
      NodeExe = "node"
      NpmExe = "npm"
      NpxExe = "npx"
      NodeDir = (Split-Path (Get-Command node).Source -Parent)
    }
  }

  $nodeDir = Get-BundledNodeDir
  if (-not $nodeDir) {
    $nodeDir = Install-PortableNode
  } else {
    Write-Host "==> Using bundled Node.js from $nodeDir"
  }

  $env:PATH = "$nodeDir;$env:PATH"
  return @{
    NodeExe = Join-Path $nodeDir "node.exe"
    NpmExe = Join-Path $nodeDir "npm.cmd"
    NpxExe = Join-Path $nodeDir "npx.cmd"
    NodeDir = $nodeDir
  }
}

$node = Initialize-NodePath

Write-Host "==> Installing Centrix Print Agent dependencies…"
& $node.NpmExe install

Write-Host "==> Installing Playwright Chromium…"
& $node.NpxExe playwright install chromium

$StartBat = Join-Path $Dir "start-agent.bat"
$nodeExeForStart = if ($node.NodeExe -eq "node") { "node" } else { $node.NodeExe }
@"
@echo off
cd /d "$Dir"
"$nodeExeForStart" server.js
"@ | Set-Content -Path $StartBat -Encoding ASCII

if ($Autostart) {
  $TaskName = "CentrixPrintAgent"
  $Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($Existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  $Action = New-ScheduledTaskAction -Execute $StartBat -WorkingDirectory $Dir
  $Trigger = New-ScheduledTaskTrigger -AtLogOn
  $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Centrix ERP silent receipt printing" | Out-Null
  Write-Host "==> Registered auto-start (Windows Task Scheduler: $TaskName)."
}

Write-Host ""
Write-Host "Done. Start the agent with:"
Write-Host "  $StartBat"
Write-Host ""
Write-Host "Recommended: install SumatraPDF for reliable silent printing:"
Write-Host "  https://www.sumatrapdfreader.org/"
Write-Host ""
Write-Host "Then in Centrix ERP: Administration -> Local printing -> enable agent -> Test print receipt."
