# Removes Centrix Print Agent scheduled task (MSI uninstall).
$ErrorActionPreference = "SilentlyContinue"
$TaskName = "CentrixPrintAgent"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
