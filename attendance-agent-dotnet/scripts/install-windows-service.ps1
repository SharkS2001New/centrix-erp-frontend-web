#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\AttendanceAgent",
    [string]$ServiceName = "CentrixAttendanceAgent",
    [string]$DisplayName = "Centrix Attendance Agent"
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $sourceDir "publish"
$exe = Join-Path $publishDir "Centrix.AttendanceAgent.exe"

if (-not (Test-Path $exe)) {
    Write-Host "Publish folder not found. Run scripts\publish.ps1 first." -ForegroundColor Yellow
    exit 1
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping existing service $ServiceName ..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

# Remove legacy Node-hosted service if present (same service name).
$legacyNode = Join-Path ${env:ProgramFiles} "Centrix\AttendanceAgent\agent.js"
if (Test-Path $legacyNode) {
    Write-Host "Replacing legacy Node Attendance Agent install..."
}

# Free status port if an old agent left it open.
try {
    $listeners = Get-NetTCPConnection -LocalPort 9251 -State Listen -ErrorAction SilentlyContinue
    foreach ($l in $listeners) {
        $procId = $l.OwningProcess
        if ($procId -and $procId -ne 0) {
            Write-Host "Stopping process $procId still listening on 127.0.0.1:9251 ..."
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
    # Get-NetTCPConnection may be unavailable on older Windows; ignore.
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path (Join-Path $publishDir "*") -Destination $InstallDir -Recurse -Force

$configCandidates = @(
    (Join-Path $sourceDir "config.json"),
    (Join-Path $publishDir "config.json"),
    (Join-Path $InstallDir "config.json")
)
$configCopied = $false
foreach ($candidate in $configCandidates) {
    if (Test-Path $candidate) {
        Copy-Item $candidate (Join-Path $InstallDir "config.json") -Force
        $configCopied = $true
        break
    }
}
if (-not $configCopied) {
    Write-Host "WARNING: config.json not found. Re-download the agent zip from Centrix." -ForegroundColor Yellow
}

$installedExe = Join-Path $InstallDir "Centrix.AttendanceAgent.exe"
Write-Host "Installing Windows service $ServiceName ..."
New-Service `
    -Name $ServiceName `
    -BinaryPathName "`"$installedExe`"" `
    -DisplayName $DisplayName `
    -Description "Bridges Hikvision fingerprint terminals on the LAN to Centrix ERP cloud." `
    -StartupType Automatic | Out-Null

sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
sc.exe config $ServiceName start= delayed-auto | Out-Null

Start-Service -Name $ServiceName
Start-Sleep -Seconds 2

$svc = Get-Service -Name $ServiceName
Write-Host ""
Write-Host "Installed:" -ForegroundColor Green
Write-Host "  $installedExe"
Write-Host "  Service: $ServiceName ($($svc.Status))"
Write-Host "  Status page: http://127.0.0.1:9251"
Write-Host ""
Write-Host "No Node.js required. Keep config.json private (contains a Centrix API token)."
