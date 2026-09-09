#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\KraAgent",
    [string]$ServiceName = "CentrixKraAgent",
    [string]$DisplayName = "Centrix KRA Agent"
)

$ErrorActionPreference = "Stop"

# Release zip layout: this script sits next to Centrix.KraAgent.exe
# Dev layout: this script is under scripts\, binaries in ..\publish
$here = $PSScriptRoot
if (Test-Path (Join-Path $here "Centrix.KraAgent.exe")) {
    $publishDir = $here
    $configSearch = @((Join-Path $here "config.json"))
} else {
    $sourceDir = Split-Path -Parent $here
    $publishDir = Join-Path $sourceDir "publish"
    $configSearch = @(
        (Join-Path $sourceDir "config.json"),
        (Join-Path $publishDir "config.json")
    )
}

$exe = Join-Path $publishDir "Centrix.KraAgent.exe"
if (-not (Test-Path $exe)) {
    Write-Host "Centrix.KraAgent.exe not found next to this installer (or in publish\)." -ForegroundColor Yellow
    Write-Host "Re-download CentrixKraAgent.zip from Centrix Finance → KRA." -ForegroundColor Yellow
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

# Stop anything still bound to the local status port.
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

$configCopied = $false
$configSearch += (Join-Path $InstallDir "config.json")
foreach ($candidate in $configSearch) {
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

# Comstore PC must not sleep — sleep freezes CentrixKraAgent and all till fiscalization.
Write-Host "Configuring Windows power plan: Sleep / Hibernate = Never (plugged in) ..."
try {
    powercfg /change standby-timeout-ac 0 | Out-Null
    powercfg /change hibernate-timeout-ac 0 | Out-Null
    powercfg /change standby-timeout-dc 0 | Out-Null
    powercfg /change hibernate-timeout-dc 0 | Out-Null
    # Also clear modern standby / hybrid sleep where supported.
    powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 0 2>$null
    powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP HYBRIDSLEEP 0 2>$null
    powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE 0 2>$null
    powercfg /SETACTIVE SCHEME_CURRENT 2>$null
} catch {
    Write-Host "WARNING: could not change power plan automatically. Set Sleep = Never when plugged in." -ForegroundColor Yellow
}

Start-Service -Name $ServiceName
Start-Sleep -Seconds 2

$svc = Get-Service -Name $ServiceName
Write-Host ""
Write-Host "Installed:" -ForegroundColor Green
Write-Host "  $installedExe"
Write-Host "  Service: $ServiceName ($($svc.Status))"
Write-Host "  Status page: http://127.0.0.1:9261"
Write-Host ""
Write-Host "Start Comstore via Windows (startup / its own service). This agent only monitors Centrix + device."
Write-Host "This PC should stay awake (Sleep = Never). CentrixKraAgent also requests stay-awake while running."
Write-Host "Keep config.json private (contains a Centrix API token)."
