#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent",
    [string]$ServiceName = "CentrixPrintAgent",
    [switch]$SkipDownload,
    [string]$SumatraPath = $null
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "sumatra-setup.ps1")

Write-Host ""
Write-Host "Centrix Print Agent - Configure SumatraPDF" -ForegroundColor Cyan
Write-Host ("Install folder: {0}" -f $InstallDir)
if ($SkipDownload) {
    Write-Host "Download skipped - using an existing SumatraPDF install only."
}
if ($SumatraPath) {
    Write-Host ("Using Sumatra path: {0}" -f $SumatraPath)
}
Write-Host ""

$sumatraPath = Ensure-SumatraPdf -TargetInstallDir $InstallDir -SkipDownload:$SkipDownload -ExplicitPath $SumatraPath
if (-not $sumatraPath) {
    exit 1
}

Set-PrintAgentServiceEnvironment -ServiceName $ServiceName -InstallDir $InstallDir -SumatraPath $sumatraPath
Restart-PrintAgentService -ServiceName $ServiceName

Write-Host ""
Write-Host "Done. Open http://127.0.0.1:9247/v1/health and confirm:" -ForegroundColor Green
Write-Host '  "sumatra_available": true'
Write-Host ("  ""sumatra_path"": ""{0}""" -f $sumatraPath)
Write-Host ""
