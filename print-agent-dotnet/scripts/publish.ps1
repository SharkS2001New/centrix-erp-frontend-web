$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root "src\Centrix.PrintAgent\Centrix.PrintAgent.csproj"
$publishDir = Join-Path $root "publish"
$zipPath = Join-Path $root "publish\CentrixPrintAgent-win-x64.zip"

. (Join-Path $PSScriptRoot "sumatra-setup.ps1")

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

# Bundle Sumatra into publish so install / ready zip work offline (no second configure step).
Write-Host ""
Write-Host "Bundling SumatraPDF into publish\tools\SumatraPDF ..." -ForegroundColor Cyan
$sumatra = Ensure-SumatraPdf -TargetInstallDir $publishDir
if (-not $sumatra -or -not (Test-Path $sumatra)) {
    Write-Host "ERROR: SumatraPDF could not be bundled into the publish folder." -ForegroundColor Red
    Write-Host "Check network access to sumatrapdfreader.org, or place SumatraPDF.exe at:" -ForegroundColor Red
    Write-Host "  $publishDir\tools\SumatraPDF\SumatraPDF.exe"
    exit 1
}

# Prefer shipping wkhtmltopdf when the build machine already has it (offline tills).
$wkPublishBin = Join-Path $publishDir "tools\wkhtmltopdf\bin"
$wkPublishExe = Join-Path $wkPublishBin "wkhtmltopdf.exe"
if (-not (Test-Path $wkPublishExe)) {
    $wkCandidates = @(
        (Join-Path $env:ProgramFiles "wkhtmltopdf\bin"),
        (Join-Path ${env:ProgramFiles(x86)} "wkhtmltopdf\bin")
    )
    foreach ($bin in $wkCandidates) {
        if ($bin -and (Test-Path (Join-Path $bin "wkhtmltopdf.exe"))) {
            New-Item -ItemType Directory -Force -Path $wkPublishBin | Out-Null
            Copy-Item -Path (Join-Path $bin "*") -Destination $wkPublishBin -Force
            Write-Host ("Bundled existing wkhtmltopdf into publish: {0}" -f $wkPublishExe) -ForegroundColor Cyan
            break
        }
    }
}

# Install helpers next to the exe (ready-zip consumers run these without the source tree).
$scriptsOut = Join-Path $publishDir "scripts"
New-Item -ItemType Directory -Force -Path $scriptsOut | Out-Null
@(
    "install-windows-service.ps1",
    "uninstall-windows-service.ps1",
    "configure-sumatra.ps1",
    "sumatra-setup.ps1"
) | ForEach-Object {
    $src = Join-Path $root "scripts\$_"
    if (Test-Path $src) {
        Copy-Item $src $scriptsOut -Force
    }
}
Copy-Item (Join-Path $root "BUILD-AND-INSTALL.bat") $publishDir -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $root "scripts\install-windows-service.ps1") $publishDir -Force

# Ready-zip one-click installer (no .NET SDK — just admin + network for wkhtml if not bundled).
$installBat = @"
@echo off
setlocal EnableExtensions
title Centrix Print Agent - Install
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator permission...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
if exist "%~dp0scripts\install-windows-service.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-windows-service.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows-service.ps1"
)
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" (
  echo FAILED with exit code %EXITCODE%.
) else (
  echo Done. Open http://127.0.0.1:9247/v1/health then Test connection in Centrix.
)
pause
exit /b %EXITCODE%
"@
Set-Content -Path (Join-Path $publishDir "INSTALL.bat") -Value $installBat -Encoding ASCII

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Include tools\ (Sumatra) and scripts\, not only top-level files.
$zipStaging = Join-Path $env:TEMP ("CentrixPrintAgent-zip-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $zipStaging | Out-Null
try {
    Get-ChildItem -Path $publishDir -Force | Where-Object {
        $_.Name -ne "CentrixPrintAgent-win-x64.zip"
    } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination (Join-Path $zipStaging $_.Name) -Recurse -Force
    }
    Compress-Archive -Path (Join-Path $zipStaging "*") -DestinationPath $zipPath -Force
} finally {
    Remove-Item -Path $zipStaging -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Published:" -ForegroundColor Green
Write-Host "  $exe"
Write-Host "  Sumatra: $sumatra"
Write-Host "  $zipPath"
Write-Host ""
Write-Host "Next: run BUILD-AND-INSTALL.bat as Administrator, or:"
Write-Host "  .\scripts\install-windows-service.ps1"
