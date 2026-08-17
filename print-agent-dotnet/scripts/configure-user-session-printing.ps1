#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent",
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$TaskName = "CentrixPrintAgent",
    [string]$DisplayName = "Centrix Print Agent"
)

$ErrorActionPreference = "Stop"

$installedExe = Join-Path $InstallDir "Centrix.PrintAgent.exe"
if (-not (Test-Path $installedExe)) {
    Write-Host "Print Agent is not installed at $InstallDir" -ForegroundColor Yellow
    Write-Host "Install it first (BUILD-AND-INSTALL.bat), then run this script."
    exit 1
}

Write-Host "Configuring Centrix Print Agent to print from your Windows user session..."
Write-Host "This is required for shared / network printers (Windows test page works, service print does not)."
Write-Host ""

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
    }
    Set-Service -Name $ServiceName -StartupType Disabled -ErrorAction SilentlyContinue
    Write-Host "Disabled Windows service $ServiceName (Local System cannot use most shared printers)."
}

Get-Process -Name "Centrix.PrintAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$startCmd = Join-Path $InstallDir "start-print-agent.cmd"
Set-Content -Path $startCmd -Encoding ASCII -Value @(
    '@echo off'
    ('start /min "" "{0}"' -f $installedExe)
)

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
$taskDescription = "{0} - silent receipt printing at http://127.0.0.1:9247 (user session for shared printers)" -f $DisplayName

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description $taskDescription | Out-Null

Start-Process -FilePath $installedExe -WindowStyle Minimized

Write-Host ""
Write-Host "Centrix Print Agent is now running in your user session." -ForegroundColor Green
Write-Host "Health check: http://127.0.0.1:9247/v1/health"
Write-Host "Confirm `"running_as_service`" is false and your shared printer appears under `"printers`"."
Write-Host "Then in Centrix: Administration -> Local printing -> Test connection -> select that printer -> Save."
Write-Host "Print a Hotel POS Test receipt (wait for success), then pay an order."
