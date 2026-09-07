# Install Centrix KRA Agent as a Windows service (NSSM or schtasks fallback)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path (Join-Path $Root "config.json"))) {
  Write-Error "config.json missing. Download the agent package from Centrix Finance settings."
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js 18+ is required. Install from https://nodejs.org then re-run."
}

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
$serviceName = "CentrixKraAgent"
$agentJs = Join-Path $Root "agent.js"

if ($nssm) {
  & nssm stop $serviceName 2>$null
  & nssm remove $serviceName confirm 2>$null
  & nssm install $serviceName $node.Source $agentJs
  & nssm set $serviceName AppDirectory $Root
  & nssm set $serviceName Start SERVICE_AUTO_START
  & nssm set $serviceName AppStdout (Join-Path $Root "agent.out.log")
  & nssm set $serviceName AppStderr (Join-Path $Root "agent.err.log")
  & nssm start $serviceName
  Write-Host "Installed and started Windows service $serviceName via NSSM."
} else {
  $taskName = "CentrixKraAgent"
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  $action = New-ScheduledTaskAction -Execute $node.Source -Argument "`"$agentJs`"" -WorkingDirectory $Root
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Host "NSSM not found — registered Scheduled Task $taskName at startup (SYSTEM)."
  Write-Host "For a real Windows service, install NSSM and re-run this script."
}

Write-Host "Status UI: http://127.0.0.1:9261"
