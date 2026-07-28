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
    /// Rough mm height for an 80mm thermal receipt.
    /// Too tall (e.g. fixed 300mm) wastes blank feed; too short creates a 2nd PDF page
    /// and thermal printers print that as a second slip (footer/QR alone).
    /// </summary>
    internal static int EstimateThermalPageHeightMm(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return 90;
        }

        static int Count(string source, string token) =>
            Regex.Matches(source, token, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant).Count;

        var trCount = Count(html, "<tr\\b");
        var divCount = Count(html, "<div\\b");
        var pCount = Count(html, "<p\\b");
        var brCount = Count(html, "<br\\b");
        var imgCount = Count(html, "<img\\b");
        var preCount = Count(html, "<pre\\b");
        var hasKraQr = html.Contains("kra-etims-block", StringComparison.OrdinalIgnoreCase)
            || html.Contains("KRA eTIMS", StringComparison.OrdinalIgnoreCase);

        // Match classic WinForms density: compact header + rows, room for footer + QR on ONE page.
        // Header/meta ~28mm, rows ~6mm, misc blocks ~2mm, images/QR ~24mm each.
        var mm = 28
            + trCount * 6
            + Math.Max(0, divCount - 10) * 2
            + pCount * 3
            + brCount * 3
            + imgCount * 24
            + preCount * 18;

        // Footer + KRA QR must never spill onto page 2 (that becomes a "double receipt").
        if (hasKraQr)
        {
            mm += 12;
        }

        mm = (int)Math.Ceiling(mm * 1.05) + 8;
        return Math.Clamp(mm, 90, 260);
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
