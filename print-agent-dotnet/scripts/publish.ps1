$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root "src\Centrix.PrintAgent\Centrix.PrintAgent.csproj"
$publishDir = Join-Path $root "publish"
$zipPath = Join-Path $root "publish\CentrixPrintAgent-win-x64.zip"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'dotnet' was not found." -ForegroundColor Red
    Write-Host "Install .NET 8 SDK from https://dotnet.microsoft.com/download/dotnet/8.0"
    Write-Host "Then close and reopen this window."
    exit 1
}

if (-not (Test-Path $project)) {
    Write-Host "ERROR: Missing project at $project" -ForegroundColor Red
    Write-Host "Make sure you unzipped CentrixPrintAgent-source.zip and are inside print-agent-dotnet."
    exit 1
}

Write-Host "Publishing Centrix Print Agent (win-x64, self-contained) ..."
Write-Host "Project: $project"

& dotnet publish $project `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -o $publishDir

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: dotnet publish failed (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

$exe = Join-Path $publishDir "Centrix.PrintAgent.exe"
if (-not (Test-Path $exe)) {
    Write-Host "ERROR: Publish finished but exe was not created: $exe" -ForegroundColor Red
    exit 1
}

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Zip exe + deps, but exclude recreating a nested zip of itself
$zipItems = Get-ChildItem -Path $publishDir -File | Where-Object { $_.Extension -ne ".zip" }
Compress-Archive -Path ($zipItems.FullName) -DestinationPath $zipPath -Force

# Also copy install scripts into publish for the ready zip consumers
Copy-Item (Join-Path $root "scripts\install-windows-service.ps1") $publishDir -Force
Copy-Item (Join-Path $root "scripts\uninstall-windows-service.ps1") $publishDir -Force

Write-Host ""
Write-Host "Published:" -ForegroundColor Green
Write-Host "  $exe"
Write-Host "  $zipPath"
Write-Host ""
Write-Host "Next: run BUILD-AND-INSTALL.bat as Administrator, or:"
Write-Host "  .\scripts\install-windows-service.ps1"
