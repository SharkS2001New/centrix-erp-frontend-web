param(
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$TaskName = "CentrixPrintAgent",
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent"
)

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Run this script as Administrator." -ForegroundColor Red
    exit 1
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        & sc.exe stop $ServiceName | Out-Null
        Start-Sleep -Seconds 2
    }
    & sc.exe delete $ServiceName | Out-Null
}

& schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
& netsh.exe http delete urlacl url=http://127.0.0.1:9247/ | Out-Null

if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}

Write-Host "Centrix Print Agent removed." -ForegroundColor Green
