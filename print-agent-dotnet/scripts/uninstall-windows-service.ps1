#Requires -RunAsAdministrator
param(
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$TaskName = "CentrixPrintAgent",
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

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Get-Process -Name "Centrix.PrintAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}

Write-Host "Centrix Print Agent removed." -ForegroundColor Green
