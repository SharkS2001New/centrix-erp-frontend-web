param(
    [string]$InstallDir = "C:\Program Files\Centrix\PrintAgent",
    [string]$ServiceName = "CentrixPrintAgent",
    [string]$TaskName = "CentrixPrintAgent",
    [string]$DisplayName = "Centrix Print Agent",
    [bool]$DownloadWkhtml = $true,
    [switch]$SkipWkhtmlDownload,
    [switch]$SkipSumatraDownload
)

$ErrorActionPreference = "Stop"
$DownloadWkhtml = $DownloadWkhtml -and -not $SkipWkhtmlDownload
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentDir = Split-Path -Parent $scriptDir
$readyPackage = $false
if (Test-Path (Join-Path $scriptDir "Centrix.PrintAgent.exe")) {
    $sourceDir = $scriptDir
    $publishDir = $scriptDir
    $readyPackage = $true
} elseif (Test-Path (Join-Path $parentDir "Centrix.PrintAgent.exe")) {
    $sourceDir = $parentDir
    $publishDir = $parentDir
    $readyPackage = $true
} else {
    $sourceDir = $parentDir
    $publishDir = Join-Path $sourceDir "publish"
}
$exe = Join-Path $publishDir "Centrix.PrintAgent.exe"
$frameworkCompiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $frameworkCompiler)) {
    $frameworkCompiler = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

function Invoke-PackageTool([string[]]$Arguments) {
    $packageToolsSource = Join-Path $scriptDir "PackageTools.cs"
    if (-not (Test-Path $packageToolsSource)) {
        $packageToolsSource = Join-Path $scriptDir "scripts\PackageTools.cs"
    }
    if (-not (Test-Path $packageToolsSource)) {
        $packageToolsSource = Join-Path $sourceDir "scripts\PackageTools.cs"
    }
    if (-not (Test-Path $frameworkCompiler)) {
        throw ".NET Framework 4.8 compiler was not found. Install .NET Framework 4.8 and retry."
    }
    if (-not (Test-Path $packageToolsSource)) {
        throw "PackageTools.cs is missing; re-download the latest Centrix Print Agent source package."
    }

    $toolExe = Join-Path $env:TEMP ("CentrixPrintAgentTools-" + [Guid]::NewGuid().ToString("N") + ".exe")
    try {
        & $frameworkCompiler /nologo /target:exe /out:$toolExe `
            /reference:System.dll `
            /reference:System.IO.Compression.dll `
            $packageToolsSource
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $toolExe)) {
            throw "Could not compile the .NET Framework packaging utility."
        }

        & $toolExe @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "The packaging utility failed with exit code $LASTEXITCODE."
        }
    } finally {
        Remove-Item -Path $toolExe -Force -ErrorAction SilentlyContinue
    }
}

function Find-ExecutableOnPath([string]$FileName) {
    foreach ($directory in $env:Path.Split(";")) {
        if ($directory) {
            $candidate = Join-Path $directory.Trim() $FileName
            if (Test-Path $candidate) {
                return $candidate
            }
        }
    }
    return $null
}

function Find-WkhtmlTopdfBin {
    $candidates = @()
    if ($env:WKHTMLTOPDF_PATH -and (Test-Path $env:WKHTMLTOPDF_PATH)) {
        $candidates += Split-Path -Parent $env:WKHTMLTOPDF_PATH
    }
    $candidates += @(
        (Join-Path $env:ProgramFiles "wkhtmltopdf\bin"),
        (Join-Path ${env:ProgramFiles(x86)} "wkhtmltopdf\bin")
    )
    $usersRoot = Join-Path $env:SystemDrive "Users"
    if (Test-Path $usersRoot) {
        foreach ($profile in Get-ChildItem -Path $usersRoot -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer }) {
            $candidates += Join-Path $profile.FullName "AppData\Local\wkhtmltopdf\bin"
            $candidates += Join-Path $profile.FullName "AppData\Local\Programs\wkhtmltopdf\bin"
        }
    }
    $pathExe = Find-ExecutableOnPath "wkhtmltopdf.exe"
    if ($pathExe) {
        $candidates += Split-Path -Parent $pathExe
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate "wkhtmltopdf.exe"))) {
            return $candidate
        }
    }
    return $null
}

function Copy-WkhtmlTopdf([string]$SourceBin, [string]$TargetBin) {
    New-Item -ItemType Directory -Force -Path $TargetBin | Out-Null
    Copy-Item -Path (Join-Path $SourceBin "*") -Destination $TargetBin -Force -Recurse
}

function Download-File([string]$Url, [string]$OutFile) {
    Invoke-PackageTool @("download", $Url, $OutFile)
}

function Ensure-WkhtmlTopdf([string]$TargetPublishDir) {
    $targetBin = Join-Path $TargetPublishDir "tools\wkhtmltopdf\bin"
    if (Test-Path (Join-Path $targetBin "wkhtmltopdf.exe")) {
        return
    }

    $systemBin = Find-WkhtmlTopdfBin
    if (-not $systemBin -and $DownloadWkhtml) {
        $toolsDir = Join-Path $TargetPublishDir "tools"
        New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
        $installerPath = Join-Path $toolsDir "wkhtmltox-installer.exe"
        $url = "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe"
        Write-Host "Downloading wkhtmltopdf for Windows service printing..."
        Download-File $url $installerPath
        $process = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            throw ("wkhtmltopdf installer failed with exit code {0}." -f $process.ExitCode)
        }
        Start-Sleep -Seconds 2
        $systemBin = Find-WkhtmlTopdfBin
        Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
    }

    if ($systemBin) {
        Copy-WkhtmlTopdf $systemBin $targetBin
    }

    if (-not (Test-Path (Join-Path $targetBin "wkhtmltopdf.exe"))) {
        throw "wkhtmltopdf could not be found or bundled. Install it or allow the installer to download it, then rerun."
    }
}

function Find-SumatraExecutable {
    $candidates = @(
        (Join-Path $env:ProgramFiles "SumatraPDF\SumatraPDF.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "SumatraPDF\SumatraPDF.exe"),
        (Join-Path $env:LOCALAPPDATA "SumatraPDF\SumatraPDF.exe")
    )
    $usersRoot = Join-Path $env:SystemDrive "Users"
    if (Test-Path $usersRoot) {
        foreach ($profile in Get-ChildItem -Path $usersRoot -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer }) {
            $candidates += Join-Path $profile.FullName "AppData\Local\SumatraPDF\SumatraPDF.exe"
        }
    }
    $pathExe = Find-ExecutableOnPath "SumatraPDF.exe"
    if ($pathExe) {
        $candidates += $pathExe
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }
    return $null
}

function Ensure-SumatraPdf([string]$TargetPublishDir) {
    $targetExe = Join-Path $TargetPublishDir "tools\SumatraPDF\SumatraPDF.exe"
    if (Test-Path $targetExe) {
        return $targetExe
    }

    $existing = Find-SumatraExecutable
    if ($existing) {
        New-Item -ItemType Directory -Force -Path (Split-Path $targetExe) | Out-Null
        Copy-Item -Path $existing -Destination $targetExe -Force
        return $targetExe
    }

    if ($SkipSumatraDownload) {
        throw "SumatraPDF could not be found or bundled. Install it or allow the installer to download it, then rerun."
    }

    $toolsDir = Join-Path $TargetPublishDir "tools"
    $zipPath = Join-Path $toolsDir "SumatraPDF-3.5.2-64.zip"
    $extractDir = Join-Path $toolsDir "SumatraPDF-extract"
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    Write-Host "Downloading the Windows 7-compatible SumatraPDF release..."
    Download-File "https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.zip" $zipPath
    if (Test-Path $extractDir) {
        Remove-Item -Path $extractDir -Recurse -Force
    }
    Invoke-PackageTool @("extract", $zipPath, $extractDir)
    $found = Get-ChildItem -Path $extractDir -Recurse -Filter "SumatraPDF.exe" | Select-Object -First 1
    if (-not $found) {
        throw "SumatraPDF.exe was not found in the downloaded archive."
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $targetExe) | Out-Null
    Copy-Item -Path $found.FullName -Destination $targetExe -Force
    Remove-Item -Path $extractDir -Recurse -Force
    Remove-Item -Path $zipPath -Force
    return $targetExe
}

if (-not (Test-Path $exe)) {
    Write-Host "Build output missing. Run scripts\publish.ps1 first." -ForegroundColor Red
    exit 1
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Run this script as Administrator." -ForegroundColor Red
    exit 1
}

Write-Host ("Installing Centrix Print Agent to {0}..." -f $InstallDir)
Ensure-WkhtmlTopdf $publishDir
Ensure-SumatraPdf $publishDir | Out-Null
if (-not (Test-Path (Join-Path $publishDir "tools\wkhtmltopdf\bin\wkhtmltopdf.exe"))) {
    throw "wkhtmltopdf is missing from the package; refusing to install an incomplete print agent."
}
if (-not (Test-Path (Join-Path $publishDir "tools\SumatraPDF\SumatraPDF.exe"))) {
    throw "SumatraPDF is missing from the package; refusing to install an incomplete print agent."
}

if (-not $readyPackage) {
    foreach ($fileName in @("install-windows-service.ps1", "uninstall-windows-service.ps1", "PackageTools.cs")) {
        $sourceFile = Join-Path $scriptDir $fileName
        if (Test-Path $sourceFile) {
            Copy-Item -Path $sourceFile -Destination (Join-Path $publishDir $fileName) -Force
        }
    }

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
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows-service.ps1"
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
    $packagePath = Join-Path $publishDir "CentrixPrintAgent-win-x64.zip"
    Invoke-PackageTool @("zip", $publishDir, $packagePath)
    Write-Host ("Ready-to-install package: {0}" -f $packagePath) -ForegroundColor Green
}

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
Get-ChildItem -Path $publishDir -Force | Where-Object {
    $_.Name -ne "CentrixPrintAgent-win-x64.zip"
} | Copy-Item -Destination $InstallDir -Recurse -Force
if (-not (Test-Path (Join-Path $InstallDir "tools\wkhtmltopdf\bin\wkhtmltopdf.exe"))) {
    throw "wkhtmltopdf was not copied into the installed Print Agent tools folder."
}
if (-not (Test-Path (Join-Path $InstallDir "tools\SumatraPDF\SumatraPDF.exe"))) {
    throw "SumatraPDF was not copied into the installed Print Agent tools folder."
}
$installedExe = Join-Path $InstallDir "Centrix.PrintAgent.exe"

$taskScheduler = New-Object -ComObject "Schedule.Service"
$taskScheduler.Connect()
$taskFolder = $taskScheduler.GetFolder("\")
$registeredTasks = $taskFolder.GetTasks(0)
for ($taskIndex = 1; $taskIndex -le $registeredTasks.Count; $taskIndex++) {
    $registeredTask = $registeredTasks.Item($taskIndex)
    if ([String]::Equals($registeredTask.Name, $TaskName, [StringComparison]::OrdinalIgnoreCase)) {
        $taskFolder.DeleteTask($TaskName, 0)
        break
    }
}
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    if ($existingService.Status -eq "Running") {
        & sc.exe stop $ServiceName | Out-Null
        Start-Sleep -Seconds 2
    }
    & sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

& netsh.exe http add urlacl url=http://127.0.0.1:9247/ user=S-1-1-0 | Out-Null
if (-not [System.Diagnostics.EventLog]::SourceExists("CentrixPrintAgent")) {
    New-EventLog -LogName Application -Source "CentrixPrintAgent"
}

& sc.exe create $ServiceName binPath= "`"$installedExe`"" start= auto DisplayName= "$DisplayName" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Windows could not create the Centrix Print Agent service."
}
& sc.exe description $ServiceName "Centrix ERP local print service for POS tills" | Out-Null
& sc.exe start $ServiceName | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Windows could not start the service. Check the Application event log."
}

Start-Sleep -Seconds 3
$service = Get-Service -Name $ServiceName
if ($service.Status -ne "Running") {
    throw "The print agent service did not remain running. Check the Application event log."
}

Write-Host ""
Write-Host "Centrix Print Agent installed and started." -ForegroundColor Green
Write-Host "Health check: http://127.0.0.1:9247/v1/health"
Write-Host "For USB printers, set the service Log On user to the Windows account that can access the printer."
