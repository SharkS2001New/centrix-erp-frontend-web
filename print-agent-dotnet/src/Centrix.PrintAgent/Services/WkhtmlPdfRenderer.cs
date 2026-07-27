using System.Diagnostics;

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

        var args = new[]
        {
            "--quiet",
            "--enable-local-file-access",
            "--encoding",
            "utf-8",
            "--page-width",
            "80mm",
            "--page-height",
            "300mm",
            "--margin-top",
            "2mm",
            "--margin-bottom",
            "2mm",
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
