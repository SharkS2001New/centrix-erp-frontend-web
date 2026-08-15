#Requires -RunAsAdministrator
# CentrixAttendanceAgent - Windows service installer
# 1) Opens a browser to confirm every connection detail
# 2) Copies files to Program Files and installs a Windows service (starts with Windows)
# Compiles a small local service wrapper with csc.exe (ships with Windows). No GitHub download.
# ASCII-only: Windows PowerShell 5.1 misreads UTF-8 punctuation as broken quotes.

$ErrorActionPreference = "Stop"
$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AgentDir

$ServiceName = "CentrixAttendanceAgent"
$DisplayName = "Centrix Attendance Agent"
$InstallDir = "C:\Program Files\Centrix\AttendanceAgent"

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

function Find-Csc {
  $candidates = @(
    (Join-Path $env:windir "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:windir "Microsoft.NET\Framework\v4.0.30319\csc.exe")
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  return $null
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

function Remove-ExistingService {
  $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $existing) { return }
  if ($existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  }
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
}

$nodeExe = Ensure-Node
$csc = Find-Csc
if (-not $csc) {
  Write-Host ".NET Framework C# compiler (csc.exe) was not found." -ForegroundColor Yellow
  Write-Host "Install Microsoft .NET Framework 4.8, then re-run install-windows.bat as Administrator."
  exit 1
}

Write-Host ""
Write-Host "Checking config.json from the Centrix download..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $AgentDir "config.json")) -and (Test-Path (Join-Path $AgentDir "centrix-attendance-agent\config.json"))) {
  $AgentDir = Join-Path $AgentDir "centrix-attendance-agent"
  Set-Location $AgentDir
  Write-Host "Using folder $AgentDir"
}
$check = @"
import { ensureConfigFile, isConfigReady, missingConfigFields } from './config-lib.js';
const config = ensureConfigFile();
if (!isConfigReady(config)) {
  console.error('config.json is incomplete (' + missingConfigFields(config).join(', ') + ').');
  console.error('Re-download CentrixAttendanceAgent from Administration after saving the device LAN IP and password.');
  process.exit(1);
}
"@
$check | & node --input-type=module
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installer stopped. Fix the download in Centrix, then re-run install-windows.bat." -ForegroundColor Yellow
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
Remove-ExistingService

Write-Host "Installing Windows service '$ServiceName' to $InstallDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$logDir = Join-Path $InstallDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$skipNames = @(
  "agent.log",
  "state.json",
  "CentrixAttendanceAgent.exe",
  "CentrixAttendanceAgent.xml",
  "CentrixAttendanceAgent.wrapper.log",
  "CentrixAttendanceAgent.out.log",
  "CentrixAttendanceAgent.err.log",
  "WinSW-x64.exe",
  "winsw.exe"
)
Get-ChildItem -Path $AgentDir -File | Where-Object { $skipNames -notcontains $_.Name } | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination (Join-Path $InstallDir $_.Name) -Force
}

$nodePathFile = Join-Path $InstallDir "node-exe.txt"
[System.IO.File]::WriteAllText($nodePathFile, $nodeExe)

$serviceCs = Join-Path $InstallDir "CentrixAttendanceAgentService.cs"
$serviceExe = Join-Path $InstallDir "CentrixAttendanceAgent.exe"
if (-not (Test-Path $serviceCs)) {
  Write-Host "CentrixAttendanceAgentService.cs is missing from the package. Re-download CentrixAttendanceAgent from Centrix Admin." -ForegroundColor Yellow
  exit 1
}

Write-Host "Building service wrapper..."
& $csc /nologo /optimize /target:winexe /out:$serviceExe /r:System.dll /r:System.ServiceProcess.dll $serviceCs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $serviceExe)) {
  Write-Host "Could not compile CentrixAttendanceAgent.exe." -ForegroundColor Yellow
  exit 1
}

New-Service `
  -Name $ServiceName `
  -BinaryPathName "`"$serviceExe`"" `
  -DisplayName $DisplayName `
  -Description "Bridges Centrix cloud to a LAN Hikvision terminal (ISAPI proxy and attendance sync)." `
  -StartupType Automatic | Out-Null

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
Write-Host "Test connection later: $InstallDir\open-settings.bat"
Write-Host "Change IP or password in Centrix Administration, then download the agent again."
Write-Host "Remove the service: uninstall-windows.bat (Run as Administrator)"
Write-Host "Logs: $logDir"
