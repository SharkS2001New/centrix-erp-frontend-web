$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root "src\Centrix.KraAgent\Centrix.KraAgent.csproj"
$publishDir = Join-Path $root "publish"
$exampleConfig = Join-Path $root "config.example.json"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'dotnet' was not found." -ForegroundColor Red
    Write-Host "Install .NET 8 SDK from https://dotnet.microsoft.com/download/dotnet/8.0"
    exit 1
}

if (-not (Test-Path $project)) {
    Write-Host "ERROR: Missing project at $project" -ForegroundColor Red
    exit 1
}

Write-Host "Publishing Centrix KRA Agent (win-x64, self-contained) ..."
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

$exe = Join-Path $publishDir "Centrix.KraAgent.exe"
if (-not (Test-Path $exe)) {
    Write-Host "ERROR: Publish finished but exe was not created: $exe" -ForegroundColor Red
    exit 1
}

$configSrc = Join-Path $root "config.json"
if (Test-Path $configSrc) {
    Copy-Item $configSrc (Join-Path $publishDir "config.json") -Force
    Write-Host "Bundled config.json from Centrix download."
} elseif (Test-Path $exampleConfig) {
    Copy-Item $exampleConfig (Join-Path $publishDir "config.example.json") -Force
}

Copy-Item (Join-Path $root "scripts\install-windows-service.ps1") $publishDir -Force
Copy-Item (Join-Path $root "scripts\uninstall-windows-service.ps1") $publishDir -Force

Write-Host ""
Write-Host "Published:" -ForegroundColor Green
Write-Host "  $exe"
