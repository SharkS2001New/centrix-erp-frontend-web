using System.Diagnostics;

namespace Centrix.PrintAgent.Services;

/// <summary>
/// Renders receipt HTML and sends it to a Windows printer.
/// Prefers wkhtmltopdf (Windows service safe), then Edge/Chrome headless as fallback.
/// </summary>
public sealed class HtmlPrintService
{
    private static readonly SemaphoreSlim PrintLock = new(1, 1);
    private readonly PrinterDiscovery _printers;

    public HtmlPrintService(PrinterDiscovery printers)
    {
        _printers = printers;
    }

    public async Task<(string JobId, string? Printer)> PrintHtmlAsync(
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
            var workDir = GetWorkDirectory();
            var jobDir = Path.Combine(workDir, $"{SanitizeFileName(documentId)}-{stamp}");
            Directory.CreateDirectory(jobDir);

            var htmlPath = Path.Combine(jobDir, "receipt.html");
            var pdfPath = Path.Combine(jobDir, "receipt.pdf");

            await File.WriteAllTextAsync(htmlPath, html, cancellationToken);

            try
            {
                var pageHeightMm = await RenderPdfAsync(html, htmlPath, pdfPath, jobDir, cancellationToken);

                var targetPrinter = ResolvePrinter(printerName);
                for (var copy = 0; copy < copies; copy++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await PrintPdfAsync(pdfPath, targetPrinter, pageHeightMm, cancellationToken);
                }

                return ($"{documentId}-{stamp}", targetPrinter);
            }
            finally
            {
                TryDelete(htmlPath);
                TryDelete(pdfPath);
                TryDeleteDirectory(jobDir);
            }
        }
        finally
        {
            PrintLock.Release();
        }
    }

    private static string GetWorkDirectory()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Centrix",
            "PrintAgent",
            "spool");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string SanitizeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var chars = value.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray();
        var cleaned = new string(chars).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "job" : cleaned;
    }

    private string? ResolvePrinter(string? requested)
    {
        if (!string.IsNullOrWhiteSpace(requested) && _printers.PrinterExists(requested))
        {
            return requested;
        }

        return _printers.DefaultPrinter();
    }

    private static async Task<int> RenderPdfAsync(
        string html,
        string htmlPath,
        string pdfPath,
        string workDir,
        CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        var pageHeightMm = WkhtmlPdfRenderer.EstimateThermalPageHeightMm(html);

        if (WkhtmlPdfRenderer.FindExecutable() is not null)
        {
            try
            {
                TryDelete(pdfPath);
                pageHeightMm = await WkhtmlPdfRenderer.RenderAsync(htmlPath, pdfPath, cancellationToken);
                if (File.Exists(pdfPath))
                {
                    return pageHeightMm;
                }
            }
            catch (Exception ex)
            {
                errors.Add($"wkhtmltopdf: {ex.Message}");
            }
        }
        else
        {
            errors.Add("wkhtmltopdf: not installed (re-run BUILD-AND-INSTALL.bat)");
        }

        var pdfPathNorm = ToForwardSlashPath(Path.GetFullPath(pdfPath));
        var htmlPathNorm = ToForwardSlashPath(Path.GetFullPath(htmlPath));
        var htmlUri = new Uri(htmlPathNorm).AbsoluteUri;
        var edgeProfileDir = ToForwardSlashPath(Path.Combine(workDir, "edge-profile"));

        var browsers = new[]
        {
            ("Microsoft Edge", FindEdgeExecutable()),
            ("Google Chrome", FindChromeExecutable()),
        };

        var argumentSets = new[]
        {
            new[]
            {
                "--headless=old",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--no-pdf-header-footer",
                "--prefer-css-page-size",
                "--run-all-compositor-stages-before-draw",
                "--virtual-time-budget=10000",
                $"--print-to-pdf={pdfPathNorm}",
                htmlUri,
            },
            new[]
            {
                "--headless=old",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--no-pdf-header-footer",
                "--prefer-css-page-size",
                "--run-all-compositor-stages-before-draw",
                "--virtual-time-budget=10000",
                $"--print-to-pdf={pdfPathNorm}",
                htmlPathNorm,
            },
            new[]
            {
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--smartscreen-disable",
                $"--user-data-dir={edgeProfileDir}",
                "--no-pdf-header-footer",
                "--prefer-css-page-size",
                "--run-all-compositor-stages-before-draw",
                "--virtual-time-budget=10000",
                $"--print-to-pdf={pdfPathNorm}",
                htmlUri,
            },
        };

        foreach (var (label, browserPath) in browsers)
        {
            if (string.IsNullOrWhiteSpace(browserPath))
            {
                continue;
            }

            foreach (var argumentSet in argumentSets)
            {
                try
                {
                    TryDelete(pdfPath);
                    var (exitCode, stderr) = await RunProcessAsync(browserPath, argumentSet, cancellationToken);
                    var created = await WaitForFileAsync(pdfPath, cancellationToken);
                    if (created)
                    {
                        return pageHeightMm;
                    }

                    var detail = string.IsNullOrWhiteSpace(stderr)
                        ? $"exit code {exitCode}"
                        : stderr.Trim();
                    errors.Add($"{label} ({argumentSet[0]}): {detail}");
                }
                catch (Exception ex)
                {
                    errors.Add($"{label}: {ex.Message}");
                }
            }
        }

        var joined = errors.Count > 0 ? string.Join(" | ", errors.Take(5)) : "unknown renderer error";
        throw new InvalidOperationException(
            "Could not render receipt HTML to PDF. " +
            joined +
            " Re-run BUILD-AND-INSTALL.bat as Administrator (installs wkhtmltopdf for the Windows service).");
    }

    public static bool IsSumatraAvailable() => FindSumatraExecutable() is not null;

    public static string? SumatraExecutablePath() => FindSumatraExecutable();

    private static async Task PrintPdfAsync(
        string pdfPath,
        string? printerName,
        int pageHeightMm,
        CancellationToken cancellationToken)
    {
        var sumatra = FindSumatraExecutable()
            ?? throw new InvalidOperationException(
                "SumatraPDF is required to print from the Windows service. Run scripts\\configure-sumatra.ps1 -SkipDownload as Administrator (copies Sumatra into the Print Agent folder).");

        var printSettings = WkhtmlPdfRenderer.BuildSumatraPrintSettings(pageHeightMm);
        var args = string.IsNullOrWhiteSpace(printerName)
            ? new[] { "-print-to-default", "-print-settings", printSettings, "-silent", "-exit-when-done", pdfPath }
            : new[] { "-print-to", printerName, "-print-settings", printSettings, "-silent", "-exit-when-done", pdfPath };

        var (exitCode, stderr) = await RunProcessAsync(sumatra, args, cancellationToken);
        if (exitCode != 0)
        {
            var target = string.IsNullOrWhiteSpace(printerName) ? "the Windows default printer" : $"\"{printerName}\"";
            var detail = string.IsNullOrWhiteSpace(stderr) ? $"SumatraPDF exit code {exitCode}." : stderr.Trim();
            throw new InvalidOperationException(
                $"Could not print to {target}. {detail} " +
                "Check the printer name in Centrix Local printing, set the Windows default printer, " +
                "or in services.msc set Centrix Print Agent to log on as this Windows user (USB receipt printers often need that).");
        }
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

    private static string? FindChromeExecutable()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
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

        var baseDir = AppContext.BaseDirectory;
        var candidates = new List<string>
        {
            Path.Combine(baseDir, "tools", "SumatraPDF", "SumatraPDF.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "SumatraPDF", "SumatraPDF.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "SumatraPDF", "SumatraPDF.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SumatraPDF", "SumatraPDF.exe"),
        };

        var systemDrive = Path.GetPathRoot(Environment.SystemDirectory);
        if (!string.IsNullOrWhiteSpace(systemDrive))
        {
            var usersRoot = Path.Combine(systemDrive, "Users");
            if (Directory.Exists(usersRoot))
            {
                try
                {
                    foreach (var userDir in Directory.EnumerateDirectories(usersRoot))
                    {
                        candidates.Add(Path.Combine(userDir, "AppData", "Local", "SumatraPDF", "SumatraPDF.exe"));
                    }
                }
                catch
                {
                    // ignore profile scan errors
                }
            }
        }

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return FindOnPath("SumatraPDF.exe");
    }

    private static string? FindOnPath(string fileName)
    {
        var pathValue = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(pathValue))
        {
            return null;
        }

        foreach (var dir in pathValue.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var candidate = Path.Combine(dir.Trim(), fileName);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            catch
            {
                // ignore invalid PATH entries
            }
        }

        return null;
    }

    private static string ToForwardSlashPath(string path) =>
        Path.GetFullPath(path).Replace('\\', '/');

    private static async Task<bool> WaitForFileAsync(string path, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 40; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (File.Exists(path) && new FileInfo(path).Length > 0)
            {
                return true;
            }

            await Task.Delay(125, cancellationToken);
        }

        return File.Exists(path) && new FileInfo(path).Length > 0;
    }

    private static async Task<(int ExitCode, string StdErr)> RunProcessAsync(
        string fileName,
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        foreach (var argument in arguments)
        {
            psi.ArgumentList.Add(argument);
        }

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException($"Could not start process: {fileName}");

        var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var stderr = await stderrTask;
        return (process.ExitCode, stderr);
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

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
            // ignore temp cleanup errors
        }
    }
}
