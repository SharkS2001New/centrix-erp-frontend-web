#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\KraAgent",
    [string]$ServiceName = "CentrixKraAgent",
    [string]$DisplayName = "Centrix KRA Agent"
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $sourceDir "publish"
$exe = Join-Path $publishDir "Centrix.KraAgent.exe"

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

# Stop legacy Node kra-agent if still bound to 9261.
try {
    $listeners = Get-NetTCPConnection -LocalPort 9261 -State Listen -ErrorAction SilentlyContinue
    foreach ($l in $listeners) {
        $procId = $l.OwningProcess
        if ($procId -and $procId -ne 0) {
            Write-Host "Stopping process $procId still listening on 127.0.0.1:9261 ..."
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
} catch { }

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

$installedExe = Join-Path $InstallDir "Centrix.KraAgent.exe"
Write-Host "Installing Windows service $ServiceName ..."
New-Service `
    -Name $ServiceName `
    -BinaryPathName "`"$installedExe`"" `
    -DisplayName $DisplayName `
    -Description "Bridges Centrix cloud fiscalization to local Comstore / Smart VSCU on this PC." `
    -StartupType Automatic | Out-Null

sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
sc.exe config $ServiceName start= auto | Out-Null
sc.exe config $ServiceName depend= Tcpip/Dnscache | Out-Null

Start-Service -Name $ServiceName
Start-Sleep -Seconds 2

$svc = Get-Service -Name $ServiceName
Write-Host ""
Write-Host "Installed:" -ForegroundColor Green
Write-Host "  $installedExe"
Write-Host "  Service: $ServiceName ($($svc.Status))"
Write-Host "  Status page: http://127.0.0.1:9261"
Write-Host ""
Write-Host "No Node.js required. Keep config.json private (contains a Centrix API token)."
