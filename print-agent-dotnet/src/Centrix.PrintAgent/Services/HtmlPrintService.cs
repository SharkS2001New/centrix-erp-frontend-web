using System.Diagnostics;
using System.Drawing.Printing;

namespace Centrix.PrintAgent.Services;

/// <summary>
/// Renders receipt HTML and sends it to a Windows printer.
/// Uses Microsoft Edge headless for HTML→PDF, then silent print when SumatraPDF is installed.
/// </summary>
public sealed class HtmlPrintService
{
    private static readonly SemaphoreSlim PrintLock = new(1, 1);
    private readonly PrinterDiscovery _printers;

    public HtmlPrintService(PrinterDiscovery printers)
    {
        _printers = printers;
    }

    public async Task<string> PrintHtmlAsync(
        string html,
        string? printerName,
        int copies,
        string documentId,
        CancellationToken cancellationToken)
    {
        await PrintLock.WaitAsync(cancellationToken);
        try
        {
            var stamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var workDir = Path.Combine(Path.GetTempPath(), "centrix-print-agent");
            Directory.CreateDirectory(workDir);

            var htmlPath = Path.Combine(workDir, $"{documentId}-{stamp}.html");
            var pdfPath = Path.Combine(workDir, $"{documentId}-{stamp}.pdf");

            await File.WriteAllTextAsync(htmlPath, html, cancellationToken);

            try
            {
                await RenderPdfAsync(htmlPath, pdfPath, cancellationToken);

                var targetPrinter = ResolvePrinter(printerName);
                for (var copy = 0; copy < copies; copy++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await PrintPdfAsync(pdfPath, targetPrinter, cancellationToken);
                }

                return $"{documentId}-{stamp}";
            }
            finally
            {
                TryDelete(htmlPath);
                TryDelete(pdfPath);
            }
        }
        finally
        {
            PrintLock.Release();
        }
    }

    private string? ResolvePrinter(string? requested)
    {
        if (!string.IsNullOrWhiteSpace(requested) && _printers.PrinterExists(requested))
        {
            return requested;
        }

        return _printers.DefaultPrinter();
    }

    private static async Task RenderPdfAsync(string htmlPath, string pdfPath, CancellationToken cancellationToken)
    {
        var edge = FindEdgeExecutable();
        if (edge is null)
        {
            throw new InvalidOperationException(
                "Microsoft Edge is required to render receipts. Install Edge or use browser print as fallback.");
        }

        var htmlUri = new Uri(htmlPath).AbsoluteUri;
        var args =
            $"--headless --disable-gpu --no-pdf-header-footer --print-to-pdf=\"{pdfPath}\" \"{htmlUri}\"";

        var exitCode = await RunProcessAsync(edge, args, cancellationToken);
        if (exitCode != 0 || !File.Exists(pdfPath))
        {
            throw new InvalidOperationException("Could not render receipt HTML to PDF.");
        }
    }

    private static async Task PrintPdfAsync(string pdfPath, string? printerName, CancellationToken cancellationToken)
    {
        var sumatra = FindSumatraExecutable();
        if (sumatra is not null)
        {
            var args = string.IsNullOrWhiteSpace(printerName)
                ? $"-print-to-default -silent \"{pdfPath}\""
                : $"-print-to \"{printerName}\" -silent \"{pdfPath}\"";

            var exitCode = await RunProcessAsync(sumatra, args, cancellationToken);
            if (exitCode == 0)
            {
                return;
            }
        }

        // Fallback: Windows print verb (may flash spooler UI briefly).
        var psi = new ProcessStartInfo
        {
            FileName = pdfPath,
            Verb = "Print",
            UseShellExecute = true,
            CreateNoWindow = true,
        };

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException("Could not start the system print dialog for the PDF.");

        await process.WaitForExitAsync(cancellationToken);
    }

    private static string? FindEdgeExecutable()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static string? FindSumatraExecutable()
    {
        var env = Environment.GetEnvironmentVariable("SUMATRA_PATH");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env))
        {
            return env;
        }

        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "SumatraPDF", "SumatraPDF.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "SumatraPDF", "SumatraPDF.exe"),
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static async Task<int> RunProcessAsync(string fileName, string arguments, CancellationToken cancellationToken)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException($"Could not start process: {fileName}");

        await process.WaitForExitAsync(cancellationToken);
        return process.ExitCode;
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // ignore temp cleanup errors
        }
    }
}
