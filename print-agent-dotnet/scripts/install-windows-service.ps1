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

function Find-WkhtmlTopdfInstallBin {
    $candidates = @(
        (Join-Path $env:ProgramFiles "wkhtmltopdf\bin"),
        (Join-Path ${env:ProgramFiles(x86)} "wkhtmltopdf\bin")
    )

    foreach ($candidate in $candidates) {
        $exePath = Join-Path $candidate "wkhtmltopdf.exe"
        if (Test-Path $exePath) {
            return $candidate
        }
    }

    return $null
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
    $installerPath = Join-Path $toolsDir "wkhtmltox-installer.exe"
    $url = "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe"

    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    Write-Host "Downloading wkhtmltopdf (headless HTML to PDF for Windows service)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing

    Write-Host "Installing wkhtmltopdf silently..."
    $installProcess = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
    if ($installProcess.ExitCode -ne 0) {
        throw ("wkhtmltopdf installer failed with exit code {0}." -f $installProcess.ExitCode)
    }

    Start-Sleep -Seconds 2
    $sourceBin = Find-WkhtmlTopdfInstallBin
    if (-not $sourceBin) {
        throw "wkhtmltopdf installed but wkhtmltopdf.exe was not found under Program Files."
    }

    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Copy-Item -Path (Join-Path $sourceBin "*") -Destination $binDir -Force

    Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path $wkhtmlExe)) {
        throw "Failed to copy wkhtmltopdf into the Print Agent folder."
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
