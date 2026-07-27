#Requires -Version 5.1
# Centrix Print Agent build script (Windows PowerShell 5.1 compatible)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Step([string]$message) {
    Write-Host $message
}

function Fail([string]$message) {
    Write-Host ""
    Write-Host ("ERROR: {0}" -f $message) -ForegroundColor Red
    Write-Host ""
    exit 1
}

function Fail-DotNetSdkMissing {
    Write-Host ""
    Write-Host "ERROR: .NET 8 SDK is not installed (or this terminal was opened before installing it)." -ForegroundColor Red
    Write-Host ""
    Write-Step "  Step 1. Download SDK 8.x for Windows x64:"
    Write-Step "          https://dotnet.microsoft.com/download/dotnet/8.0"
    Write-Step "  Step 2. Install it"
    Write-Step "  Step 3. Close ALL PowerShell / CMD windows"
    Write-Step "  Step 4. Run BUILD-AND-INSTALL.bat again"
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Centrix Print Agent - Build and Install" -ForegroundColor Cyan
Write-Host ("Working folder: {0}" -f $root)
Write-Host ""

# Admin check
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Fail "Open PowerShell as Administrator, or double-click BUILD-AND-INSTALL.bat (it will ask for admin)."
}

# .NET SDK check
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
    Fail-DotNetSdkMissing
}

$dotnetVersion = & dotnet --version 2>$null
Write-Host ("dotnet version: {0}" -f $dotnetVersion)
if (-not ($dotnetVersion -like "8.*")) {
    Write-Host "Warning: recommended SDK is .NET 8.x. Continuing anyway..." -ForegroundColor Yellow
}

$project = Join-Path $root "src\Centrix.PrintAgent\Centrix.PrintAgent.csproj"
if (-not (Test-Path $project)) {
    $missingMsg = "Project file missing: {0}{1}Unzip CentrixPrintAgent-source.zip fully, then run from inside print-agent-dotnet." -f $project, [Environment]::NewLine
    Fail $missingMsg
}

Write-Host ""
Write-Host "Step 1/2 - Publishing (this can take a few minutes)..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "publish.ps1")
if ($LASTEXITCODE -ne 0) {
    Fail "Publish failed. Scroll up for the dotnet error."
}

Write-Host ""
Write-Host "Step 2/2 - Installing Windows service..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "install-windows-service.ps1")
if ($LASTEXITCODE -ne 0) {
    Fail "Install failed. Scroll up for the service error."
}

Write-Host ""
Write-Host "SUCCESS" -ForegroundColor Green
Write-Step "  Step 1. Open http://127.0.0.1:9247/v1/health in a browser - you should see JSON."
Write-Step "  Step 2. In Centrix: Administration -> Local printing -> Centrix Print Agent -> Test connection -> Save"
Write-Host ""
