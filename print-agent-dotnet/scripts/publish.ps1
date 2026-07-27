$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root "src\Centrix.PrintAgent\Centrix.PrintAgent.csproj"
$publishDir = Join-Path $root "publish"
$zipPath = Join-Path $root "publish\CentrixPrintAgent-win-x64.zip"

Write-Host "Publishing Centrix Print Agent (win-x64, self-contained) ..."

dotnet publish $project `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -o $publishDir

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $publishDir "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Published:" -ForegroundColor Green
Write-Host "  $publishDir\Centrix.PrintAgent.exe"
Write-Host "  $zipPath"
Write-Host ""
Write-Host "On each till PC (admin PowerShell):"
Write-Host "  .\scripts\install-windows-service.ps1"
