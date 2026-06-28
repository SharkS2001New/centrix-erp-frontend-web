# Registers Centrix Print Agent to start at user logon (called by MSI post-install).
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$TaskName = "CentrixPrintAgent"
$StartScript = Join-Path $InstallDir "start-agent.cmd"

if (-not (Test-Path $StartScript)) {
  Write-Error "start-agent.cmd not found in $InstallDir"
}

$Existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute $StartScript -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Centrix ERP silent receipt printing" | Out-Null

Write-Host "Registered scheduled task: $TaskName"
