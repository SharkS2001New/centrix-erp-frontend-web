#Requires -RunAsAdministrator
# CentrixAttendanceAgent - Windows service installer
# 1) Opens a browser to confirm every connection detail
# 2) Copies files to Program Files and installs a Windows service (starts with Windows)
# ASCII-only: Windows PowerShell 5.1 misreads UTF-8 punctuation as broken quotes.

$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AgentDir

$ServiceName = "CentrixAttendanceAgent"
$DisplayName = "Centrix Attendance Agent"
$InstallDir = "C:\Program Files\Centrix\AttendanceAgent"
$WinswUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"

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
  return $node.Source
}

function Xml-Escape([string]$value) {
  if ($null -eq $value) { return "" }
  return ($value -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;')
}

function Stop-LegacyTask {
  $existingTask = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
  if ($existingTask) {
    Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
    Write-Host "Removed legacy scheduled task '$ServiceName'."
  }
}

function Stop-AgentProcesses {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'agent\.js' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Ensure-WinSW([string]$targetExe) {
  $bundled = @(
    (Join-Path $AgentDir "WinSW-x64.exe"),
    (Join-Path $AgentDir "winsw.exe"),
    $targetExe
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

  if ($bundled -and $bundled -ne $targetExe) {
    Copy-Item -Path $bundled -Destination $targetExe -Force
    Write-Host "Using bundled WinSW service wrapper."
    return
  }
  if (Test-Path $targetExe) {
    Write-Host "WinSW service wrapper already present."
    return
  }

  Write-Host "Downloading WinSW service wrapper..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $WinswUrl -OutFile $targetExe -UseBasicParsing -TimeoutSec 120
  if (-not (Test-Path $targetExe)) {
    throw "Could not download WinSW. Allow internet access to GitHub, then re-run install-windows.bat."
  }
}

$nodeExe = Ensure-Node

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

Stop-LegacyTask
Stop-AgentProcesses

Write-Host "Installing Windows service '$ServiceName' to $InstallDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "logs") | Out-Null

$skipNames = @(
  "agent.log",
  "state.json",
  "CentrixAttendanceAgent.exe",
  "CentrixAttendanceAgent.xml",
  "CentrixAttendanceAgent.wrapper.log",
  "CentrixAttendanceAgent.out.log",
  "CentrixAttendanceAgent.err.log"
)
Get-ChildItem -Path $AgentDir -File | Where-Object { $skipNames -notcontains $_.Name } | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination (Join-Path $InstallDir $_.Name) -Force
}

$serviceExe = Join-Path $InstallDir "CentrixAttendanceAgent.exe"
$serviceXml = Join-Path $InstallDir "CentrixAttendanceAgent.xml"
$agentJs = Join-Path $InstallDir "agent.js"
$logDir = Join-Path $InstallDir "logs"

Ensure-WinSW -targetExe $serviceExe

$xml = @"
<service>
  <id>$ServiceName</id>
  <name>$DisplayName</name>
  <description>Bridges Centrix cloud to a LAN Hikvision terminal (ISAPI proxy and attendance sync).</description>
  <executable>$(Xml-Escape $nodeExe)</executable>
  <arguments>"$(Xml-Escape $agentJs)"</arguments>
  <workingdirectory>$(Xml-Escape $InstallDir)</workingdirectory>
  <logpath>$(Xml-Escape $logDir)</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <onfailure action="restart" delay="5 sec"/>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 hour</resetfailure>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <stoptimeout>15 sec</stoptimeout>
</service>
"@
[System.IO.File]::WriteAllText($serviceXml, $xml)

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  }
  & $serviceExe stop 2>$null | Out-Null
  & $serviceExe uninstall 2>$null | Out-Null
  Start-Sleep -Seconds 2
  $still = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($still) {
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
  }
}

Push-Location $InstallDir
try {
  & $serviceExe install
  if ($LASTEXITCODE -ne 0) {
    throw "WinSW install failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

sc.exe config $ServiceName start= delayed-auto | Out-Null
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null

Start-Service -Name $ServiceName
Start-Sleep -Seconds 2
$started = Get-Service -Name $ServiceName
if ($started.Status -ne "Running") {
  Write-Host "Service installed but is $($started.Status). Check logs in $logDir" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Installed Windows service '$ServiceName' (Automatic / delayed start)." -ForegroundColor Green
Write-Host "Manage it in services.msc, or: net start $ServiceName / net stop $ServiceName"
Write-Host "The agent talks to the Hikvision on this LAN and to Centrix online."
Write-Host "Change connection details later: $InstallDir\open-settings.bat"
Write-Host "Remove the service: uninstall-windows.bat (Run as Administrator)"
Write-Host "Logs: $logDir"
