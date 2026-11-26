$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$projectDir = Join-Path $root "src\Centrix.PrintAgent"
$publishDir = Join-Path $root "publish"
$frameworkCompiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (-not (Test-Path $frameworkCompiler)) {
    $frameworkCompiler = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

if (-not (Test-Path $frameworkCompiler)) {
    Write-Host "ERROR: .NET Framework 4.8 compiler was not found." -ForegroundColor Red
    Write-Host "Install .NET Framework 4.8 on Windows 7 SP1, then retry."
    exit 1
}

$sourceFiles = @(
    (Join-Path $projectDir "Program.cs"),
    (Join-Path $projectDir "Services\PrinterDiscovery.cs"),
    (Join-Path $projectDir "Services\HtmlPrintService.cs"),
    (Join-Path $projectDir "Services\PrintJobQueue.cs"),
    (Join-Path $projectDir "Services\WkhtmlPdfRenderer.cs")
)

foreach ($sourceFile in $sourceFiles) {
    if (-not (Test-Path $sourceFile)) {
        Write-Host ("ERROR: Missing source file: {0}" -f $sourceFile) -ForegroundColor Red
        exit 1
    }
}

if (Test-Path $publishDir) {
    Remove-Item -Path $publishDir -Recurse -Force
}
New-Item -ItemType Directory -Path $publishDir -Force | Out-Null

$exe = Join-Path $publishDir "Centrix.PrintAgent.exe"
Write-Host "Compiling Centrix Print Agent for .NET Framework 4.8..."
& $frameworkCompiler /nologo /target:exe /platform:x64 /out:$exe `
    /reference:System.dll `
    /reference:System.Core.dll `
    /reference:System.Drawing.dll `
    /reference:System.ServiceProcess.dll `
    /reference:System.Web.Extensions.dll `
    $sourceFiles

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) {
    Write-Host ("ERROR: C# compilation failed (exit code {0})." -f $LASTEXITCODE) -ForegroundColor Red
    exit 1
}

Write-Host ("Published: {0}" -f $exe) -ForegroundColor Green
