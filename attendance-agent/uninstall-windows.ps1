#Requires -RunAsAdministrator
# ASCII-only: Windows PowerShell 5.1 misreads UTF-8 punctuation as broken quotes.
$ErrorActionPreference = "Stop"

$ServiceName = "CentrixAttendanceAgent"
$InstallDir = "C:\Program Files\Centrix\AttendanceAgent"

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -eq "Running") {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  }
  sc.exe delete $ServiceName | Out-Null
  Start-Sleep -Seconds 2
  Write-Host "Removed Windows service '$ServiceName'."
}

$existingTask = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
if ($existingTask) {
  Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
  Write-Host "Removed legacy scheduled task '$ServiceName'."
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'agent\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (Test-Path $InstallDir) {
  Remove-Item -Path $InstallDir -Recurse -Force
  Write-Host "Removed $InstallDir"
}

Write-Host "CentrixAttendanceAgent uninstalled. Download-folder copies were left in place." -ForegroundColor Green
