#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent",
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$DisplayName = "Centrix Print Agent"
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $sourceDir "publish"
$exe = Join-Path $publishDir "Centrix.PrintAgent.exe"

if (-not (Test-Path $exe)) {
    Write-Host "Publish folder not found. Run scripts\publish.ps1 first." -ForegroundColor Yellow
    exit 1
}

Write-Host "Installing Centrix Print Agent to $InstallDir ..."

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Copy-Item -Path (Join-Path $publishDir "*") -Destination $InstallDir -Recurse -Force
$installedExe = Join-Path $InstallDir "Centrix.PrintAgent.exe"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
    }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

New-Service `
    -Name $ServiceName `
    -BinaryPathName "`"$installedExe`"" `
    -DisplayName $DisplayName `
    -Description "Centrix ERP silent receipt printing for POS tills (http://127.0.0.1:9247)" `
    -StartupType Automatic | Out-Null

Start-Service -Name $ServiceName

Write-Host ""
Write-Host "Centrix Print Agent installed and started." -ForegroundColor Green
Write-Host "Health check: http://127.0.0.1:9247/v1/health"
Write-Host "Optional: install SumatraPDF for fully silent thermal printing."
Write-Host "In Centrix: Administration -> Local printing -> Centrix Print Agent -> Test connection -> Save."
