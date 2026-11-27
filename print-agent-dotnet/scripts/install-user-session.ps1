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

function Find-WkhtmlTopdfBin {
    $candidates = @(
        (Join-Path $env:ProgramFiles "wkhtmltopdf\bin"),
        (Join-Path ${env:ProgramFiles(x86)} "wkhtmltopdf\bin")
    )
    if ($env:WKHTMLTOPDF_PATH -and (Test-Path $env:WKHTMLTOPDF_PATH)) {
        $candidates += Split-Path -Parent $env:WKHTMLTOPDF_PATH
    }

    $usersRoot = Join-Path $env:SystemDrive "Users"
    if (Test-Path $usersRoot) {
        foreach ($profile in Get-ChildItem -Path $usersRoot -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer }) {
            $candidates += Join-Path $profile.FullName "AppData\Local\wkhtmltopdf\bin"
            $candidates += Join-Path $profile.FullName "AppData\Local\Programs\wkhtmltopdf\bin"
        }
    }

    foreach ($directory in $env:Path.Split(";")) {
        if ($directory) {
            $pathExe = Join-Path $directory.Trim() "wkhtmltopdf.exe"
            if (Test-Path $pathExe) {
                $candidates += Split-Path -Parent $pathExe
                break
            }
        }
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate "wkhtmltopdf.exe"))) {
            return $candidate
        }
    }
    return $null
}

function Find-SumatraExecutable {
    $candidates = @(
        (Join-Path $env:ProgramFiles "SumatraPDF\SumatraPDF.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "SumatraPDF\SumatraPDF.exe"),
        (Join-Path $env:LOCALAPPDATA "SumatraPDF\SumatraPDF.exe")
    )
    if ($env:SUMATRA_PATH -and (Test-Path $env:SUMATRA_PATH)) {
        $candidates += $env:SUMATRA_PATH
    }
    $usersRoot = Join-Path $env:SystemDrive "Users"
    if (Test-Path $usersRoot) {
        foreach ($profile in Get-ChildItem -Path $usersRoot -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer }) {
            $candidates += Join-Path $profile.FullName "AppData\Local\SumatraPDF\SumatraPDF.exe"
        }
    }

    foreach ($directory in $env:Path.Split(";")) {
        if ($directory) {
            $pathExe = Join-Path $directory.Trim() "SumatraPDF.exe"
            if (Test-Path $pathExe) {
                $candidates += $pathExe
                break
            }
        }
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }
    return $null
}

$wkhtmlSourceBin = Find-WkhtmlTopdfBin
$wkhtmlTargetBin = Join-Path $publishDir "tools\wkhtmltopdf\bin"
if (Test-Path (Join-Path $wkhtmlTargetBin "wkhtmltopdf.exe")) {
    if ($wkhtmlSourceBin) {
        $sourcePath = [System.IO.Path]::GetFullPath($wkhtmlSourceBin).TrimEnd("\")
        $targetPath = [System.IO.Path]::GetFullPath($wkhtmlTargetBin).TrimEnd("\")
        if (-not [String]::Equals($sourcePath, $targetPath, [StringComparison]::OrdinalIgnoreCase)) {
            Copy-Item -Path (Join-Path $wkhtmlSourceBin "*") -Destination $wkhtmlTargetBin -Force -Recurse
        }
    }
} else {
    if (-not $wkhtmlSourceBin) {
        throw "wkhtmltopdf was not found. Install it or use the standard BUILD-AND-INSTALL.bat installer."
    }
    New-Item -ItemType Directory -Force -Path $wkhtmlTargetBin | Out-Null
    Copy-Item -Path (Join-Path $wkhtmlSourceBin "*") -Destination $wkhtmlTargetBin -Force -Recurse
}

$sumatraSource = Find-SumatraExecutable
if (-not (Test-Path (Join-Path $publishDir "tools\SumatraPDF\SumatraPDF.exe"))) {
    if (-not $sumatraSource) {
        throw "SumatraPDF was not found. Install it or use the standard BUILD-AND-INSTALL.bat installer."
    }
    $sumatraTargetDir = Join-Path $publishDir "tools\SumatraPDF"
    New-Item -ItemType Directory -Force -Path $sumatraTargetDir | Out-Null
    Copy-Item -Path $sumatraSource -Destination (Join-Path $sumatraTargetDir "SumatraPDF.exe") -Force
}

Write-Host ("Installing Centrix Print Agent to {0} (user session - required for receipt printing)..." -f $InstallDir)

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Copy-Item -Path (Join-Path $publishDir "*") -Destination $InstallDir -Recurse -Force
if (-not (Test-Path (Join-Path $InstallDir "tools\wkhtmltopdf\bin\wkhtmltopdf.exe"))) {
    throw "wkhtmltopdf was not copied into the installed Print Agent tools folder."
}
if (-not (Test-Path (Join-Path $InstallDir "tools\SumatraPDF\SumatraPDF.exe"))) {
    throw "SumatraPDF was not copied into the installed Print Agent tools folder."
}
$installedExe = Join-Path $InstallDir "Centrix.PrintAgent.exe"

# Windows services run in session 0; Edge headless cannot render receipts there.
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
    }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "Removed legacy Windows service (printing requires a logged-in user session)."
}

$startCmd = Join-Path $InstallDir "start-print-agent.cmd"
Set-Content -Path $startCmd -Encoding ASCII -Value @(
    '@echo off'
    ('start /min "" "{0}"' -f $installedExe)
)

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute $startCmd -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$Principal = New-ScheduledTaskPrincipal -GroupId "Users" -RunLevel Limited
$taskDescription = "{0} - silent receipt printing at http://127.0.0.1:9247" -f $DisplayName

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description $taskDescription | Out-Null

Get-Process -Name "Centrix.PrintAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $installedExe -WindowStyle Minimized

Write-Host ""
Write-Host "Centrix Print Agent installed and started in your user session." -ForegroundColor Green
Write-Host "Health check: http://127.0.0.1:9247/v1/health"
Write-Host "It will auto-start when any user logs on to this PC."
Write-Host "Bundled wkhtmltopdf and SumatraPDF in the Print Agent tools folder."
Write-Host "In Centrix: Administration -> Local printing -> Centrix Print Agent -> Test connection -> Save."
