#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent",
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$TaskName = "CentrixPrintAgent",
    [string]$DisplayName = "Centrix Print Agent",
    [switch]$DownloadWkhtml,
    [switch]$SkipSumatraDownload
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "sumatra-setup.ps1")

$sourceDir = Split-Path -Parent $PSScriptRoot
$publishDir = Join-Path $sourceDir "publish"
$exe = Join-Path $publishDir "Centrix.PrintAgent.exe"

if (-not (Test-Path $exe)) {
    Write-Host "Publish folder not found. Run scripts\publish.ps1 first." -ForegroundColor Yellow
    exit 1
}

function Find-WkhtmlTopdfSystemBin {
    $candidates = @()

    if ($env:WKHTMLTOPDF_PATH -and (Test-Path $env:WKHTMLTOPDF_PATH)) {
        $customDir = Split-Path -Parent $env:WKHTMLTOPDF_PATH
        if ($customDir) {
            $candidates += $customDir
        }
    }

    $candidates += @(
        (Join-Path $env:ProgramFiles "wkhtmltopdf\bin"),
        (Join-Path ${env:ProgramFiles(x86)} "wkhtmltopdf\bin")
    )

    $pathDirs = $env:Path -split ';' | Where-Object { $_ -and (Test-Path $_) }
    foreach ($dir in $pathDirs) {
        $candidate = Join-Path $dir "wkhtmltopdf.exe"
        if (Test-Path $candidate) {
            return Split-Path -Parent $candidate
        }
    }

    foreach ($candidate in $candidates) {
        $exePath = Join-Path $candidate "wkhtmltopdf.exe"
        if (Test-Path $exePath) {
            return $candidate
        }
    }

    return $null
}

function Copy-WkhtmlTopdfBin {
    param(
        [string]$SourceBin,
        [string]$TargetBinDir
    )

    New-Item -ItemType Directory -Force -Path $TargetBinDir | Out-Null
    Copy-Item -Path (Join-Path $SourceBin "*") -Destination $TargetBinDir -Force
}

function Ensure-WkhtmlTopdf {
    param([string]$TargetInstallDir)

    $binDir = Join-Path $TargetInstallDir "tools\wkhtmltopdf\bin"
    $wkhtmlExe = Join-Path $binDir "wkhtmltopdf.exe"
    if (Test-Path $wkhtmlExe) {
        Write-Host ("wkhtmltopdf already bundled: {0}" -f $wkhtmlExe)
        return $wkhtmlExe
    }

    $systemBin = Find-WkhtmlTopdfSystemBin
    if ($systemBin) {
        Write-Host ("Using existing wkhtmltopdf install: {0}" -f $systemBin)
        Copy-WkhtmlTopdfBin -SourceBin $systemBin -TargetBinDir $binDir
        if (Test-Path $wkhtmlExe) {
            Write-Host ("wkhtmltopdf bundled for Print Agent: {0}" -f $wkhtmlExe)
            return $wkhtmlExe
        }
    }

    if (-not $DownloadWkhtml) {
        Write-Host ""
        Write-Host "wkhtmltopdf was not bundled (no download requested)." -ForegroundColor Yellow
        Write-Host "Install wkhtmltopdf manually from:" -ForegroundColor Yellow
        Write-Host "  https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe" -ForegroundColor Yellow
        Write-Host "Then re-run install-windows-service.ps1, or set WKHTMLTOPDF_PATH to wkhtmltopdf.exe." -ForegroundColor Yellow
        Write-Host ""
        return $null
    }

    $toolsDir = Join-Path $TargetInstallDir "tools"
    $installerPath = Join-Path $toolsDir "wkhtmltox-installer.exe"
    $url = "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe"

    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    Write-Host "Downloading wkhtmltopdf (optional - pass -DownloadWkhtml only when needed)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing -TimeoutSec 600

    Write-Host "Installing wkhtmltopdf silently..."
    $installProcess = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
    if ($installProcess.ExitCode -ne 0) {
        throw ("wkhtmltopdf installer failed with exit code {0}." -f $installProcess.ExitCode)
    }

    Start-Sleep -Seconds 2
    $sourceBin = Find-WkhtmlTopdfSystemBin
    if (-not $sourceBin) {
        throw "wkhtmltopdf installer finished but wkhtmltopdf.exe was not found."
    }

    Copy-WkhtmlTopdfBin -SourceBin $sourceBin -TargetBinDir $binDir
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

$sumatraPath = Ensure-SumatraPdf -TargetInstallDir $InstallDir -SkipDownload:$SkipSumatraDownload
$wkhtmlPath = Join-Path $InstallDir "tools\wkhtmltopdf\bin\wkhtmltopdf.exe"
if (-not (Test-Path $wkhtmlPath)) {
    $wkhtmlPath = Find-WkhtmlTopdfSystemBin
    if ($wkhtmlPath) {
        $wkhtmlPath = Join-Path $wkhtmlPath "wkhtmltopdf.exe"
    } else {
        $wkhtmlPath = $null
    }
}

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

Set-PrintAgentServiceEnvironment `
    -ServiceName $ServiceName `
    -InstallDir $InstallDir `
    -SumatraPath $sumatraPath `
    -WkhtmlPath $(if (Test-Path $wkhtmlPath) { $wkhtmlPath } else { $null })

Start-Service -Name $ServiceName

Write-Host ""
Write-Host "Centrix Print Agent installed and started as a Windows service." -ForegroundColor Green
Write-Host "Health check: http://127.0.0.1:9247/v1/health"
if (-not $sumatraPath) {
    Write-Host "SumatraPDF is missing. Run scripts\configure-sumatra.ps1 as Administrator." -ForegroundColor Yellow
} else {
    Write-Host ("SumatraPDF: {0}" -f $sumatraPath)
}
Write-Host "In Centrix: Administration -> Local printing -> Centrix Print Agent -> Test connection -> Save."
