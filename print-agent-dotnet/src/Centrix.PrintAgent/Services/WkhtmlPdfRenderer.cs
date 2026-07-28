using System.Diagnostics;
using System.Text.RegularExpressions;

namespace Centrix.PrintAgent.Services;

/// <summary>
/// Renders receipt HTML to PDF using wkhtmltopdf. Works from a Windows service (session 0).
/// </summary>
internal static class WkhtmlPdfRenderer
{
    public static string? FindExecutable()
    {
        var env = Environment.GetEnvironmentVariable("WKHTMLTOPDF_PATH");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env))
        {
            return env;
        }

        var baseDir = AppContext.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(baseDir, "tools", "wkhtmltopdf", "bin", "wkhtmltopdf.exe"),
            Path.Combine(baseDir, "wkhtmltopdf", "bin", "wkhtmltopdf.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "wkhtmltopdf", "bin", "wkhtmltopdf.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "wkhtmltopdf", "bin", "wkhtmltopdf.exe"),
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        var pathExe = FindOnPath("wkhtmltopdf.exe");
        return pathExe;
    }

    public static async Task RenderAsync(string htmlPath, string pdfPath, CancellationToken cancellationToken)
    {
        var executable = FindExecutable()
            ?? throw new InvalidOperationException(
                "wkhtmltopdf is missing. Install it manually, then re-run install-windows-service.ps1 or set WKHTMLTOPDF_PATH.");

        // Fixed tall pages (e.g. 300mm) make thermal printers feed a huge blank before/after content.
        // Size the PDF page to roughly match receipt content so Sumatra only advances that much paper.
        var html = await File.ReadAllTextAsync(htmlPath, cancellationToken);
        var pageHeightMm = EstimateThermalPageHeightMm(html);

        var args = new[]
        {
            "--quiet",
            "--enable-local-file-access",
            "--encoding",
            "utf-8",
            "--page-width",
            "80mm",
            "--page-height",
            $"{pageHeightMm}mm",
            "--margin-top",
            "0",
            "--margin-bottom",
            "0",
            "--margin-left",
            "1mm",
            "--margin-right",
            "1mm",
            "--disable-smart-shrinking",
            "--print-media-type",
            htmlPath,
            pdfPath,
        };

        var (exitCode, stderr) = await RunProcessAsync(executable, args, cancellationToken);
        if (exitCode != 0 || !File.Exists(pdfPath) || new FileInfo(pdfPath).Length == 0)
        {
            var detail = string.IsNullOrWhiteSpace(stderr)
                ? $"wkhtmltopdf exited with code {exitCode}."
                : stderr.Trim();
            throw new InvalidOperationException(detail);
        }
    }

    /// <summary>
    /// Rough mm height for an 80mm thermal receipt. Slightly oversizes to avoid clipping.
    /// </summary>
    internal static int EstimateThermalPageHeightMm(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return 80;
        }

        static int Count(string source, string token) =>
            Regex.Matches(source, token, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant).Count;

        var trCount = Count(html, "<tr\\b");
        var divCount = Count(html, "<div\\b");
        var pCount = Count(html, "<p\\b");
        var brCount = Count(html, "<br\\b");
        var imgCount = Count(html, "<img\\b");
        var preCount = Count(html, "<pre\\b");

        // Keep the estimate snug: too much safety buffer shows up as blank feed before
        // the next receipt's org name on thermal printers.
        // Header/meta ~24mm, rows ~5mm, misc blocks ~2–3mm, QR/images ~22mm each.
        var mm = 24
            + trCount * 5
            + Math.Max(0, divCount - 8) * 2
            + pCount * 3
            + brCount * 3
            + imgCount * 22
            + preCount * 16;

        // Keep only a very small buffer so footer lines are not clipped.
        mm = (int)Math.Ceiling(mm * 1.02) + 2;
        return Math.Clamp(mm, 55, 500);
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
            WorkingDirectory = Path.GetDirectoryName(fileName) ?? AppContext.BaseDirectory,
        };

        foreach (var argument in arguments)
        {
            psi.ArgumentList.Add(argument);
        }

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException($"Could not start wkhtmltopdf: {fileName}");

        var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken);
        var stderr = await stderrTask;
        return (process.ExitCode, stderr);
    }
}
