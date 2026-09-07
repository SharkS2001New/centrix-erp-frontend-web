$ErrorActionPreference = "Stop"
$serviceName = "CentrixKraAgent"
$taskName = "CentrixKraAgent"
$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssm) {
  & nssm stop $serviceName 2>$null
  & nssm remove $serviceName confirm 2>$null
}
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Centrix KRA Agent removed."
