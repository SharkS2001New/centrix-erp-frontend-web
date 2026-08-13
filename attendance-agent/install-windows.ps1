# Centrix Attendance Agent - Windows install
# 1) Opens a browser to confirm every connection detail
# 2) Registers an always-on scheduled task (runs at startup / logon, restarts on crash)
# Requires Node.js 20+ (https://nodejs.org/)
# ASCII-only: Windows PowerShell 5.1 misreads UTF-8 arrows/dashes as broken quotes.

$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AgentDir
$taskName = "CentrixAttendanceAgent"

function Ensure-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Host "Node.js was not found. Install Node 20 LTS from https://nodejs.org/ then re-run this script." -ForegroundColor Yellow
    exit 1
  }
  $ver = (& node -v) -replace '^v', ''
  $major = [int]($ver.Split('.')[0])
  if ($major -lt 20) {
    Write-Host "Node.js $ver found; need 20+. Upgrade from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
  }
  Write-Host "Node.js $ver OK"
}

Ensure-Node

Write-Host ""
Write-Host "Opening the connection setup screen..." -ForegroundColor Cyan
Write-Host "Confirm Centrix URL, token, device ID, LAN IP, port 80, username and password."
Write-Host "Click  Save, test & continue  when the test passes."
Write-Host ""

$setup = @"
import { ensureConfigFile, isConfigReady } from './config-lib.js';
import { runSettingsUi } from './settings-ui.js';
ensureConfigFile();
const result = await runSettingsUi({ openBrowser: true, waitUntilReady: true, installer: true });
if (!result.ready && !isConfigReady(ensureConfigFile())) process.exit(1);
"@
$setup | & node --input-type=module
if ($LASTEXITCODE -ne 0) {
  Write-Host "Connection setup incomplete. Fix the settings, then re-run install-windows.bat." -ForegroundColor Yellow
  exit 1
}

Write-Host "Running connection doctor..." -ForegroundColor Cyan
& node doctor.js
if ($LASTEXITCODE -ne 0) {
  Write-Host "Doctor reported issues - re-run install-windows.bat after fixing settings." -ForegroundColor Yellow
  exit $LASTEXITCODE
}

$wrapper = Join-Path $AgentDir "run-service.cmd"
$action = New-ScheduledTaskAction -Execute $wrapper -WorkingDirectory $AgentDir
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn)
)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Stop-ScheduledTask -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Principal $principal `
  -Description "Centrix Attendance Agent - proxies Hikvision ISAPI and pushes punches to Centrix cloud" | Out-Null

try {
  Start-ScheduledTask -TaskName $taskName
} catch {
  Write-Host "Task registered but could not start immediately: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installed always-on task '$taskName' (starts at Windows logon / startup)." -ForegroundColor Green
Write-Host "The agent now talks to the Hikvision on this LAN and to Centrix online."
Write-Host "Done. Punches appear under Centrix HR -> Attendance."
Write-Host "Change connection details later: open-settings.bat"
Write-Host "Remove the service: uninstall-windows.bat"
Write-Host "Logs: $AgentDir\agent.log"
