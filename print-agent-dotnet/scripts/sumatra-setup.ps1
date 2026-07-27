$ErrorActionPreference = "Stop"

$script:SumatraZipUrls = @(
    "https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64.zip",
    "https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64.zip"
)

$script:SumatraInstallerUrls = @(
    "https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64-install.exe",
    "https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2-64-install.exe"
)

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

function Invoke-SumatraFileDownload {
    param(
        [string[]]$Urls,
        [string]$OutFile
    )

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    foreach ($url in $Urls) {
        try {
            Write-Host ("Trying download: {0}" -f $url)
            Invoke-WebRequest -Uri $url -OutFile $OutFile -UseBasicParsing -TimeoutSec 600 -MaximumRedirection 10
            if ((Test-Path $OutFile) -and ((Get-Item $OutFile).Length -gt 100000)) {
                return $true
            }
        } catch {
            Write-Host ("  failed: {0}" -f $_.Exception.Message) -ForegroundColor Yellow
            if (Test-Path $OutFile) {
                Remove-Item -Path $OutFile -Force -ErrorAction SilentlyContinue
            }
        }
    }

    return $false
}

function Install-SumatraFromZip {
    param(
        [string]$ZipPath,
        [string]$TargetExe
    )

    $extractDir = Join-Path (Split-Path $TargetExe) "..\SumatraPDF-extract"
    $extractDir = [System.IO.Path]::GetFullPath($extractDir)

    if (Test-Path $extractDir) {
        Remove-Item -Path $extractDir -Recurse -Force
    }

    Expand-Archive -Path $ZipPath -DestinationPath $extractDir -Force

    $found = Get-ChildItem -Path $extractDir -Recurse -Filter "SumatraPDF.exe" | Select-Object -First 1
    if (-not $found) {
        throw "SumatraPDF.exe was not found in the downloaded zip."
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $TargetExe) | Out-Null
    Copy-Item -Path $found.FullName -Destination $TargetExe -Force
    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}

function Install-SumatraFromInstallerExtract {
    param(
        [string]$InstallerPath,
        [string]$TargetExe
    )

    $extractDir = Join-Path (Split-Path $TargetExe) "..\SumatraPDF-extract"
    $extractDir = [System.IO.Path]::GetFullPath($extractDir)

    if (Test-Path $extractDir) {
        Remove-Item -Path $extractDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

    Write-Host ("Extracting SumatraPDF from installer to {0}..." -f $extractDir)
    $process = Start-Process -FilePath $InstallerPath -ArgumentList @("-x", "-d", $extractDir) -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw ("SumatraPDF installer extract failed with exit code {0}." -f $process.ExitCode)
    }

    $found = Get-ChildItem -Path $extractDir -Recurse -Filter "SumatraPDF.exe" | Select-Object -First 1
    if (-not $found) {
        throw "SumatraPDF.exe was not found after installer extract."
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $TargetExe) | Out-Null
    Copy-Item -Path $found.FullName -Destination $TargetExe -Force
    Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
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
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

    $zipPath = Join-Path $toolsDir "SumatraPDF.zip"
    $installerPath = Join-Path $toolsDir "SumatraPDF-installer.exe"

    Write-Host "Downloading SumatraPDF portable zip..."
    if (Invoke-SumatraFileDownload -Urls $script:SumatraZipUrls -OutFile $zipPath) {
        Install-SumatraFromZip -ZipPath $zipPath -TargetExe $targetExe
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "Zip download failed. Trying SumatraPDF installer extract..."
        if (-not (Invoke-SumatraFileDownload -Urls $script:SumatraInstallerUrls -OutFile $installerPath)) {
            throw "Could not download SumatraPDF. Install manually from https://www.sumatrapdfreader.org/download-free-pdf-viewer then re-run configure-sumatra.ps1 -SkipDownload"
        }
        Install-SumatraFromInstallerExtract -InstallerPath $installerPath -TargetExe $targetExe
        Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
    }

    if (-not (Test-Path $targetExe)) {
        throw "Failed to install SumatraPDF into the Print Agent folder."
    }

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
