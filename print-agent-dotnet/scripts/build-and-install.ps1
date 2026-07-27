#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail([string]$message) {
    Write-Host ""
    Write-Host "ERROR: $message" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Centrix Print Agent - Build and Install" -ForegroundColor Cyan
Write-Host "Working folder: $root"
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
    $sdkHelp = @(
        ".NET 8 SDK is not installed (or this terminal was opened before installing it)."
        ""
        "1. Download SDK 8.x for Windows x64:"
        "   https://dotnet.microsoft.com/download/dotnet/8.0"
        "2. Install it"
        "3. Close ALL PowerShell / CMD windows"
        "4. Run BUILD-AND-INSTALL.bat again"
    ) -join [Environment]::NewLine
    Fail $sdkHelp
}

$dotnetVersion = (& dotnet --version 2>$null)
Write-Host ("dotnet version: {0}" -f $dotnetVersion)
if (-not ($dotnetVersion -like "8.*")) {
    Write-Host "Warning: recommended SDK is .NET 8.x. Continuing anyway..." -ForegroundColor Yellow
}

$project = Join-Path $root "src\Centrix.PrintAgent\Centrix.PrintAgent.csproj"
if (-not (Test-Path $project)) {
    Fail ("Project file missing: {0}{1}Unzip CentrixPrintAgent-source.zip fully, then run from inside print-agent-dotnet." -f $project, [Environment]::NewLine)
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
Write-Host "1. Open http://127.0.0.1:9247/v1/health in a browser - you should see JSON."
Write-Host "2. In Centrix: Administration -> Local printing -> Centrix Print Agent -> Test connection -> Save"
Write-Host ""
