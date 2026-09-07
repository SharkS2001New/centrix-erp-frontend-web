#Requires -RunAsAdministrator
param(
    [string]$ServiceName = "CentrixKraAgent",
    [string]$InstallDir = "C:\Program Files\Centrix\KraAgent"
)

$ErrorActionPreference = "Stop"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "Removed Windows service $ServiceName."
} else {
    Write-Host "Service $ServiceName was not installed."
}

if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Removed $InstallDir"
}
