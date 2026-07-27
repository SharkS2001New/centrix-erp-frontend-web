#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent",
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$TaskName = "CentrixPrintAgent",
    [string]$DisplayName = "Centrix Print Agent"
)

$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $sourceDir "publish"
$exe = Join-Path $publishDir "Centrix.PrintAgent.exe"

if (-not (Test-Path $exe)) {
    Write-Host "Publish folder not found. Run scripts\publish.ps1 first." -ForegroundColor Yellow
    exit 1
}

function Ensure-WkhtmlTopdf {
    param([string]$TargetInstallDir)

    $binDir = Join-Path $TargetInstallDir "tools\wkhtmltopdf\bin"
    $wkhtmlExe = Join-Path $binDir "wkhtmltopdf.exe"
    if (Test-Path $wkhtmlExe) {
        Write-Host ("wkhtmltopdf already installed: {0}" -f $wkhtmlExe)
        return $wkhtmlExe
    }

    $toolsDir = Join-Path $TargetInstallDir "tools"
    $zipPath = Join-Path $toolsDir "wkhtmltopdf.zip"
    $extractDir = Join-Path $toolsDir "wkhtmltopdf-extract"
    $url = "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.zip"

    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    Write-Host "Downloading wkhtmltopdf (headless HTML to PDF for Windows service)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

    if (Test-Path $extractDir) {
        Remove-Item -Path $extractDir -Recurse -Force
    }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    $found = Get-ChildItem -Path $extractDir -Recurse -Filter "wkhtmltopdf.exe" | Select-Object -First 1
    if (-not $found) {
        throw "wkhtmltopdf.exe was not found inside the downloaded archive."
    }

    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Copy-Item -Path (Join-Path $found.DirectoryName "*") -Destination $binDir -Force

    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path $wkhtmlExe)) {
        throw "Failed to install wkhtmltopdf."
    }

    Write-Host ("wkhtmltopdf installed: {0}" -f $wkhtmlExe)
    return $wkhtmlExe
}

Write-Host ("Installing Centrix Print Agent to {0} (Windows service)..." -f $InstallDir)

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Copy-Item -Path (Join-Path $publishDir "*") -Destination $InstallDir -Recurse -Force
$installedExe = Join-Path $InstallDir "Centrix.PrintAgent.exe"

Ensure-WkhtmlTopdf -TargetInstallDir $InstallDir | Out-Null

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed legacy logon scheduled task."
}

Get-Process -Name "Centrix.PrintAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
    }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

New-Service `
    -Name $ServiceName `
    -BinaryPathName "`"$installedExe`"" `
    -DisplayName $DisplayName `
    -Description "Centrix ERP silent receipt printing for POS tills (http://127.0.0.1:9247)" `
    -StartupType Automatic | Out-Null

Start-Service -Name $ServiceName

Write-Host ""
Write-Host "Centrix Print Agent installed and started as a Windows service." -ForegroundColor Green
Write-Host "Health check: http://127.0.0.1:9247/v1/health"
Write-Host "Install SumatraPDF for fully silent thermal printing:"
Write-Host "  https://www.sumatrapdfreader.org/download-free-pdf-viewer"
Write-Host "In Centrix: Administration -> Local printing -> Centrix Print Agent -> Test connection -> Save."
