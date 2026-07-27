#Requires -RunAsAdministrator
param(
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent"
)

$ErrorActionPreference = "Stop"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
    }
    sc.exe delete $ServiceName | Out-Null
}

if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}

Write-Host "Centrix Print Agent removed." -ForegroundColor Green
