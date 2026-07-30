# Builds CentrixPrintAgent.msi (Windows + WiX Toolset 3.x required).
param(
  [string]$Version = "0.1.0.0"
)

$ErrorActionPreference = "Stop"
$PrintAgentRoot = Split-Path -Parent $PSScriptRoot
$StagingRoot = Join-Path $PrintAgentRoot "dist\staging"
$DistDir = Join-Path $PrintAgentRoot "dist"
$InstallerDir = Join-Path $PrintAgentRoot "installer"
$OutMsi = Join-Path $DistDir "CentrixPrintAgent-$Version.msi"

function Find-WixBin {
  $candidates = @(
    "${env:ProgramFiles(x86)}\WiX Toolset v3.14\bin",
    "${env:ProgramFiles(x86)}\WiX Toolset v3.11\bin",
    "${env:ProgramFiles}\WiX Toolset v3.14\bin"
  )
  foreach ($path in $candidates) {
    if (Test-Path (Join-Path $path "candle.exe")) { return $path }
  }
  $candle = Get-Command candle.exe -ErrorAction SilentlyContinue
  if ($candle) { return $candle.Source | Split-Path -Parent }
  return $null
}

function Invoke-BuildTool {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Test-VersionString {
  param([string]$Value)

  if ($Value -notmatch '^\d+\.\d+\.\d+\.\d+$') {
    throw "Version must look like x.x.x.x (got '$Value')"
  }
}

Test-VersionString -Value $Version

$WixBin = Find-WixBin
if (-not $WixBin) {
  Write-Error @"
WiX Toolset 3.x not found. Install it, then re-run:

  winget install --id WiXToolset.WiXToolset

Or download from https://wixtoolset.org/
"@
}

Write-Host "==> Using WiX: $WixBin"

& (Join-Path $PrintAgentRoot "scripts\stage-for-msi.ps1") -StagingRoot $StagingRoot

New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
$WorkDir = Join-Path $DistDir "wix-work"
if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null

if (Test-Path $OutMsi) { Remove-Item $OutMsi -Force }

$HeatExe = Join-Path $WixBin "heat.exe"
$CandleExe = Join-Path $WixBin "candle.exe"
$LightExe = Join-Path $WixBin "light.exe"

$FilesWxs = Join-Path $WorkDir "Files.wxs"
$ProductWxsSource = Join-Path $InstallerDir "Product.wxs"
$ProductWxs = Join-Path $WorkDir "Product.wxs"
$LicenseSource = Join-Path $InstallerDir "License.rtf"
$LicenseWork = Join-Path $WorkDir "License.rtf"
$CandleOut = Join-Path $WorkDir "out"
$StagingDefine = ($StagingRoot -replace '\\', '/')

if (-not (Test-Path $LicenseSource)) {
  throw "Missing license file: $LicenseSource"
}

# Product.wxs + License.rtf must live next to each other for WixUILicenseRtf.
Copy-Item -Path $ProductWxsSource -Destination $ProductWxs -Force
Copy-Item -Path $LicenseSource -Destination $LicenseWork -Force

Write-Host "==> Harvesting staged files (this may take a minute) …"
Invoke-BuildTool -Name "heat.exe" -Command {
  & $HeatExe dir $StagingRoot `
    -out $FilesWxs `
    -gg -sfrag -srd -sreg `
    -cg ProductComponents `
    -dr INSTALLFOLDER `
    -var var.StagingSource `
    -kept-extension `.js `.json `.cmd `.exe `.dll `.pak `.bin `.dat `.txt `.html `.woff `.woff2
}

Write-Host "==> Compiling WiX …"
New-Item -ItemType Directory -Path $CandleOut -Force | Out-Null
# ProductVersion comes only from -d (Product.wxs keeps <?ifndef?> default for local candle).
Invoke-BuildTool -Name "candle.exe" -Command {
  & $CandleExe `
    "-dStagingSource=$StagingDefine" `
    "-dProductVersion=$Version" `
    "-out" "$CandleOut\" `
    $ProductWxs `
    $FilesWxs
}

Write-Host "==> Linking MSI …"
# light resolves WixUILicenseRtf relative to the current directory.
Push-Location $WorkDir
try {
  Invoke-BuildTool -Name "light.exe" -Command {
    & $LightExe -out $OutMsi -ext WixUIExtension -ext WixUtilExtension `
      (Join-Path $CandleOut "Product.wixobj") `
      (Join-Path $CandleOut "Files.wixobj")
  }
} finally {
  Pop-Location
}

if (-not (Test-Path $OutMsi)) {
  throw "MSI was not created: $OutMsi"
}

Write-Host ""
Write-Host "Built: $OutMsi"
Write-Host "Deploy to till PCs: double-click the MSI (admin required). No Node.js install needed."
