#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent",
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$TaskName = "CentrixPrintAgent",
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

Write-Host "Installing Centrix Print Agent to $InstallDir (user session — required for receipt printing)..."

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Copy-Item -Path (Join-Path $publishDir "*") -Destination $InstallDir -Recurse -Force
$installedExe = Join-Path $InstallDir "Centrix.PrintAgent.exe"

# Windows services run in session 0; Edge headless cannot render receipts there.
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
    }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "Removed legacy Windows service (printing requires a logged-in user session)."
}

$startCmd = Join-Path $InstallDir "start-print-agent.cmd"
@"
@echo off
start /min "" "$installedExe"
"@ | Set-Content -Path $startCmd -Encoding ASCII

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute $startCmd -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$Principal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "$DisplayName — silent receipt printing at http://127.0.0.1:9247" | Out-Null

# Start now for the current session (after stopping any stray instance on the port).
Get-Process -Name "Centrix.PrintAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $installedExe -WindowStyle Minimized

Write-Host ""
Write-Host "Centrix Print Agent installed and started in your user session." -ForegroundColor Green
Write-Host "Health check: http://127.0.0.1:9247/v1/health"
Write-Host "It will auto-start when any user logs on to this PC."
Write-Host "Install SumatraPDF for fully silent thermal printing:"
Write-Host "  https://www.sumatrapdfreader.org/download-free-pdf-viewer"
Write-Host "In Centrix: Administration -> Local printing -> Centrix Print Agent -> Test connection -> Save."
