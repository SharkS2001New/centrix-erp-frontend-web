#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\AttendanceAgent",
    [string]$ServiceName = "CentrixAttendanceAgent"
)

$ErrorActionPreference = "Stop"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping $ServiceName ..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    sc.exe delete $ServiceName | Out-Null
    Write-Host "Service removed."
} else {
    Write-Host "Service $ServiceName was not installed."
}

if (Test-Path $InstallDir) {
    Write-Host "Removing $InstallDir ..."
    Remove-Item -Path $InstallDir -Recurse -Force
}

Write-Host "Done." -ForegroundColor Green
