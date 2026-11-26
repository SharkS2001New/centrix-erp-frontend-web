$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

function Fail([string]$message) {
    Write-Host ""
    Write-Host ("ERROR: {0}" -f $message) -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Centrix Print Agent - Build and Install" -ForegroundColor Cyan
Write-Host ("Working folder: {0}" -f $root)
Write-Host ""

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail "Run BUILD-AND-INSTALL.bat as Administrator."
}

$frameworkKey = "HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"
$framework = Get-ItemProperty $frameworkKey -ErrorAction SilentlyContinue
if (-not $framework -or [int]$framework.Release -lt 528040) {
    Fail "Install .NET Framework 4.8 (Windows 7 SP1 or later), restart the PC, then run this installer again."
}

Write-Host "Step 1/2 - Building the Windows 7-compatible agent..." -ForegroundColor Cyan
& (Join-Path $scriptDir "publish.ps1")
if ($LASTEXITCODE -ne 0) {
    Fail "Build failed. Scroll up for the compiler error."
}

Write-Host ""
Write-Host "Step 2/2 - Installing the Windows service..." -ForegroundColor Cyan
& (Join-Path $scriptDir "install-windows-service.ps1")
if ($LASTEXITCODE -ne 0) {
    Fail "Install failed. Scroll up for the service error."
}

Write-Host ""
Write-Host "SUCCESS" -ForegroundColor Green
Write-Host "Open http://127.0.0.1:9247/v1/health and confirm that it returns JSON."
Write-Host "Then use Administration -> Local printing -> Centrix Print Agent -> Test connection -> Save."
Write-Host ""
