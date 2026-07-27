$ErrorActionPreference = "Stop"

$script:SumatraPortableUrl = "https://www.sumatrapdfreader.org/dl/rel/SumatraPDF-3.6.1-64.zip"

function Find-SumatraPdf {
    param([string]$TargetInstallDir)

    $bundled = Join-Path $TargetInstallDir "tools\SumatraPDF\SumatraPDF.exe"
    if (Test-Path $bundled) {
        return $bundled
    }

    if ($env:SUMATRA_PATH -and (Test-Path $env:SUMATRA_PATH)) {
        return $env:SUMATRA_PATH
    }

    $candidates = @(
        (Join-Path $env:ProgramFiles "SumatraPDF\SumatraPDF.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "SumatraPDF\SumatraPDF.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Ensure-SumatraPdf {
    param(
        [string]$TargetInstallDir,
        [switch]$SkipDownload
    )

    $targetExe = Join-Path $TargetInstallDir "tools\SumatraPDF\SumatraPDF.exe"
    if (Test-Path $targetExe) {
        Write-Host ("SumatraPDF already bundled: {0}" -f $targetExe)
        return $targetExe
    }

    $existing = Find-SumatraPdf -TargetInstallDir $TargetInstallDir
    if ($existing) {
        Write-Host ("Using existing SumatraPDF: {0}" -f $existing)
        New-Item -ItemType Directory -Force -Path (Split-Path $targetExe) | Out-Null
        Copy-Item -Path $existing -Destination $targetExe -Force
        return $targetExe
    }

    if ($SkipDownload) {
        Write-Host "SumatraPDF not found. Install manually or re-run without -SkipDownload." -ForegroundColor Yellow
        return $null
    }

    $toolsDir = Join-Path $TargetInstallDir "tools"
    $zipPath = Join-Path $toolsDir "SumatraPDF.zip"
    $extractDir = Join-Path $toolsDir "SumatraPDF-extract"

    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    Write-Host "Downloading SumatraPDF portable..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $script:SumatraPortableUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 300

    if (Test-Path $extractDir) {
        Remove-Item -Path $extractDir -Recurse -Force
    }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    $found = Get-ChildItem -Path $extractDir -Recurse -Filter "SumatraPDF.exe" | Select-Object -First 1
    if (-not $found) {
        throw "SumatraPDF.exe was not found in the downloaded archive."
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $targetExe) | Out-Null
    Copy-Item -Path $found.FullName -Destination $targetExe -Force

    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ("SumatraPDF installed: {0}" -f $targetExe)
    return $targetExe
}

function Set-PrintAgentServiceEnvironment {
    param(
        [string]$ServiceName,
        [string]$InstallDir,
        [string]$SumatraPath,
        [string]$WkhtmlPath = $null
    )

    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
    if (-not (Test-Path $regPath)) {
        Write-Host ("Service registry key not found yet: {0}" -f $ServiceName) -ForegroundColor Yellow
        return
    }

    $values = @()
    if ($SumatraPath) {
        $values += "SUMATRA_PATH=$SumatraPath"
    }
    if ($WkhtmlPath) {
        $values += "WKHTMLTOPDF_PATH=$WkhtmlPath"
    }

    if ($values.Count -eq 0) {
        return
    }

    Set-ItemProperty -Path $regPath -Name Environment -Value $values -Type MultiString
    Write-Host ("Configured service environment: {0}" -f ($values -join "; "))
}

function Restart-PrintAgentService {
    param([string]$ServiceName = "CentrixPrintAgent")

    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-Host ("Service {0} is not installed yet." -f $ServiceName) -ForegroundColor Yellow
        return
    }

    if ($service.Status -eq "Running") {
        Restart-Service -Name $ServiceName -Force
    } else {
        Start-Service -Name $ServiceName
    }

    Write-Host ("Restarted service: {0}" -f $ServiceName) -ForegroundColor Green
}
