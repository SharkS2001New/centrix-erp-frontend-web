# ASCII-only: Windows PowerShell 5.1 misreads UTF-8 punctuation as broken quotes.
$ErrorActionPreference = "Stop"
$taskName = "CentrixAttendanceAgent"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'agent\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Removed scheduled task '$taskName'." -ForegroundColor Green
Write-Host "config.json was left in place. Delete this folder if you no longer need the agent."
