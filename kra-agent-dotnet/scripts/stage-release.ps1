# Stage a shop-facing installer folder (Windows PC with .NET 8 SDK).
# Output: release\win-x64\  — exe + install scripts only (no source).
# Deploy that folder (or zip) to the Centrix web host so Finance → Download serves it.
param(
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) {
    $OutDir = Join-Path $root "release\win-x64"
}

Write-Host "=== Stage Centrix KRA Agent release (binary installer) ===" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "publish.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$publishDir = Join-Path $root "publish"
$exe = Join-Path $publishDir "Centrix.KraAgent.exe"
if (-not (Test-Path $exe)) {
    Write-Host "ERROR: Missing $exe after publish." -ForegroundColor Red
    exit 1
}

if (Test-Path $OutDir) {
    Remove-Item $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Copy-Item (Join-Path $publishDir "*") $OutDir -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot "install-windows-service.ps1") $OutDir -Force
Copy-Item (Join-Path $PSScriptRoot "uninstall-windows-service.ps1") $OutDir -Force

$installBat = Join-Path $OutDir "INSTALL.bat"
@"
@echo off
:: Centrix KRA Agent — run as Administrator (no .NET SDK required)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows-service.ps1"
if errorlevel 1 pause
"@ | Set-Content -Path $installBat -Encoding ASCII

$uninstallBat = Join-Path $OutDir "uninstall.bat"
@"
@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-windows-service.ps1"
if errorlevel 1 pause
"@ | Set-Content -Path $uninstallBat -Encoding ASCII

# Do not ship example secrets or build leftovers into the customer folder.
Remove-Item (Join-Path $OutDir "config.example.json") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $OutDir "*.pdb") -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Staged installer at:" -ForegroundColor Green
Write-Host "  $OutDir"
Write-Host "Copy this folder onto the Centrix web host as kra-agent-dotnet/release/win-x64"
Write-Host "Finance → Download Centrix KRA Agent will zip it with a prefilled config.json."
