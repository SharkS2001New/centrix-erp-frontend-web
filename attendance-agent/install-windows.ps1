# Centrix Attendance Agent — Windows install
# Run from this folder after unzipping the Admin download package.
# Requires Node.js 20+ (https://nodejs.org/)

$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AgentDir

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

Write-Host "Checking / completing first-run settings…" -ForegroundColor Cyan
$setup = @"
import { ensureConfigFile, isConfigReady } from './config-lib.js';
import { runSettingsUi } from './settings-ui.js';
const cfg = ensureConfigFile();
if (!isConfigReady(cfg)) {
  console.log('Opening settings UI — enter device LAN IP and password, then Save.');
  const result = await runSettingsUi({ openBrowser: true, waitUntilReady: true });
  if (!result.ready && !isConfigReady(ensureConfigFile())) process.exit(1);
} else {
  console.log('Settings already complete.');
}
"@
$setup | & node --input-type=module
if ($LASTEXITCODE -ne 0) {
  Write-Host "Settings incomplete. Double-click open-settings.bat, save, then re-run install-windows.bat." -ForegroundColor Yellow
  exit 1
}

$taskName = "CentrixAttendanceAgent"
$nodeExe = (Get-Command node).Source
$onceArgs = "`"$AgentDir\agent.js`" --once"
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument $onceArgs -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Poll Hikvision and push punches to Centrix" | Out-Null

Write-Host ""
Write-Host "Installed scheduled task '$taskName' (every 5 minutes)." -ForegroundColor Green
Write-Host "Running doctor + one sync now..."
& node doctor.js
if ($LASTEXITCODE -ne 0) {
  Write-Host "Doctor reported issues — open open-settings.bat, fix, then re-run install-windows.bat" -ForegroundColor Yellow
  exit $LASTEXITCODE
}
& node agent.js --once
Write-Host "Done. Punches appear under Centrix HR → Attendance."
Write-Host "Change settings later: open-settings.bat"
