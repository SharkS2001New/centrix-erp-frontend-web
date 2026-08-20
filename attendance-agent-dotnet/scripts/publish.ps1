$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root "src\Centrix.AttendanceAgent\Centrix.AttendanceAgent.csproj"
$publishDir = Join-Path $root "publish"
$exampleConfig = Join-Path $root "config.example.json"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'dotnet' was not found." -ForegroundColor Red
    Write-Host "Install .NET 8 SDK from https://dotnet.microsoft.com/download/dotnet/8.0"
    Write-Host "Then close and reopen this window."
    exit 1
}

if (-not (Test-Path $project)) {
    Write-Host "ERROR: Missing project at $project" -ForegroundColor Red
    Write-Host "Unzip CentrixAttendanceAgent.zip and stay inside attendance-agent-dotnet."
    exit 1
}

Write-Host "Publishing Centrix Attendance Agent (win-x64, self-contained) ..."
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

$exe = Join-Path $publishDir "Centrix.AttendanceAgent.exe"
if (-not (Test-Path $exe)) {
    Write-Host "ERROR: Publish finished but exe was not created: $exe" -ForegroundColor Red
    exit 1
}

# Prefer prefilled config.json from the Centrix download (zip root).
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
Write-Host ""
Write-Host "Next: run BUILD-AND-INSTALL.bat as Administrator, or:"
Write-Host "  .\scripts\install-windows-service.ps1"
