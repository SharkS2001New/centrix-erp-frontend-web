using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;

namespace Centrix.PrintAgent.Services
{
    /// <summary>
    /// Renders receipt HTML and sends it to a Windows printer.
    /// Prefers wkhtmltopdf, then Edge/Chrome headless as fallback.
    /// Jobs for different printers run in parallel; the same printer is serialized.
    /// </summary>
    public sealed class HtmlPrintService
    {
        private static readonly ConcurrentDictionary<string, SemaphoreSlim> PrinterLocks =
            new ConcurrentDictionary<string, SemaphoreSlim>(StringComparer.OrdinalIgnoreCase);

        private readonly PrinterDiscovery _printers;

        public HtmlPrintService(PrinterDiscovery printers)
        {
            _printers = printers;
        }

        public PrintResult PrintHtml(
            string html,
            string printerName,
            int copies,
            string documentId,
            string jobType)
        {
            var targetPrinter = ResolvePrinter(printerName);
            var lockKey = String.IsNullOrWhiteSpace(targetPrinter) ? "__default__" : targetPrinter;
            var printerLock = PrinterLocks.GetOrAdd(lockKey, key => new SemaphoreSlim(1, 1));

            printerLock.Wait();
            try
            {
                var stamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var workDir = GetWorkDirectory();
                var jobDir = Path.Combine(workDir, String.Format("{0}-{1}", SanitizeFileName(documentId), stamp));
                Directory.CreateDirectory(jobDir);

                var htmlPath = Path.Combine(jobDir, "receipt.html");
                var pdfPath = Path.Combine(jobDir, "receipt.pdf");
                var thermal = WkhtmlPdfRenderer.IsThermalJob(jobType, html);
                File.WriteAllText(htmlPath, html, new UTF8Encoding(false));

                try
                {
                    var pageHeightMm = RenderPdf(html, htmlPath, pdfPath, jobDir, jobType);
                    for (var copy = 0; copy < copies; copy++)
                    {
                        PrintPdf(pdfPath, targetPrinter, pageHeightMm, thermal, html);
                    }

                    return new PrintResult(String.Format("{0}-{1}", documentId, stamp), targetPrinter);
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
                printerLock.Release();
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
            var chars = (value ?? String.Empty).ToCharArray();
            for (var i = 0; i < chars.Length; i++)
            {
                if (Array.IndexOf(invalid, chars[i]) >= 0)
                {
                    chars[i] = '_';
                }
            }

            var cleaned = new String(chars).Trim();
            return String.IsNullOrWhiteSpace(cleaned) ? "job" : cleaned;
        }

        private string ResolvePrinter(string requested)
        {
            if (!String.IsNullOrWhiteSpace(requested))
            {
                if (_printers.PrinterExists(requested))
                {
                    return requested;
                }

                throw new InvalidOperationException(
                    String.Format(
                        "Configured printer \"{0}\" is not visible to the Centrix Print Agent. Check the printer name and the Windows account running the service.",
                        requested));
            }

            var defaultPrinter = _printers.DefaultPrinter();
            if (String.IsNullOrWhiteSpace(defaultPrinter))
            {
                throw new InvalidOperationException(
                    "No Windows default printer is visible to the Centrix Print Agent.");
            }

            return defaultPrinter;
        }

        private static int RenderPdf(
            string html,
            string htmlPath,
            string pdfPath,
            string workDir,
            string jobType)
        {
            var errors = new List<string>();
            var thermal = WkhtmlPdfRenderer.IsThermalJob(jobType, html);
            var pageHeightMm = thermal ? WkhtmlPdfRenderer.EstimateThermalPageHeightMm(html) : 297;

            if (WkhtmlPdfRenderer.FindExecutable() != null)
            {
                try
                {
                    TryDelete(pdfPath);
                    pageHeightMm = WkhtmlPdfRenderer.Render(htmlPath, pdfPath, jobType);
                    if (File.Exists(pdfPath))
                    {
                        return pageHeightMm;
                    }
                }
                catch (Exception ex)
                {
                    errors.Add("wkhtmltopdf: " + ex.Message);
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
                new BrowserCandidate("Microsoft Edge", FindEdgeExecutable()),
                new BrowserCandidate("Google Chrome", FindChromeExecutable())
            };

            var argumentSets = new[]
            {
                new[]
                {
                    "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
                    "--no-pdf-header-footer", "--prefer-css-page-size",
                    "--run-all-compositor-stages-before-draw", "--virtual-time-budget=10000",
                    "--print-to-pdf=" + pdfPathNorm, htmlUri
                },
                new[]
                {
                    "--headless=old", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
                    "--no-pdf-header-footer", "--prefer-css-page-size",
                    "--run-all-compositor-stages-before-draw", "--virtual-time-budget=10000",
                    "--print-to-pdf=" + pdfPathNorm, htmlPathNorm
                },
                new[]
                {
                    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
                    "--smartscreen-disable", "--user-data-dir=" + edgeProfileDir,
                    "--no-pdf-header-footer", "--prefer-css-page-size",
                    "--run-all-compositor-stages-before-draw", "--virtual-time-budget=10000",
                    "--print-to-pdf=" + pdfPathNorm, htmlUri
                }
            };

            foreach (var browser in browsers)
            {
                if (String.IsNullOrWhiteSpace(browser.Path))
                {
                    continue;
                }

                foreach (var argumentSet in argumentSets)
                {
                    try
                    {
                        TryDelete(pdfPath);
                        var result = RunProcess(browser.Path, argumentSet);
                        if (WaitForFile(pdfPath))
                        {
                            return pageHeightMm;
                        }

                        var detail = String.IsNullOrWhiteSpace(result.StdErr)
                            ? "exit code " + result.ExitCode
                            : result.StdErr.Trim();
                        errors.Add(String.Format("{0} ({1}): {2}", browser.Name, argumentSet[0], detail));
                    }
                    catch (Exception ex)
                    {
                        errors.Add(browser.Name + ": " + ex.Message);
                    }
                }
            }

            var joined = errors.Count > 0
                ? String.Join(" | ", errors.Take(5).ToArray())
                : "unknown renderer error";
            throw new InvalidOperationException(
                "Could not render receipt HTML to PDF. " +
                joined +
                " Re-run BUILD-AND-INSTALL.bat as Administrator (installs wkhtmltopdf for the Windows service).");
        }

        public static bool IsSumatraAvailable()
        {
            return FindSumatraExecutable() != null;
        }

        public static string SumatraExecutablePath()
        {
            return FindSumatraExecutable();
        }

        private static void PrintPdf(
            string pdfPath,
            string printerName,
            int pageHeightMm,
            bool thermal,
            string html)
        {
            var sumatra = FindSumatraExecutable();
            if (sumatra == null)
            {
                throw new InvalidOperationException(
                    "SumatraPDF is required to print from the Windows service. Re-run BUILD-AND-INSTALL.bat as Administrator (bundles Sumatra automatically), or place SumatraPDF.exe under tools\\SumatraPDF next to the agent.");
            }

            var a4Orientation = thermal ? null : WkhtmlPdfRenderer.ResolveA4Orientation(html);
            var printSettings = WkhtmlPdfRenderer.BuildSumatraPrintSettings(pageHeightMm, thermal, a4Orientation);
            var args = String.IsNullOrWhiteSpace(printerName)
                ? new[] { "-print-to-default", "-print-settings", printSettings, "-silent", "-exit-when-done", pdfPath }
                : new[] { "-print-to", printerName, "-print-settings", printSettings, "-silent", "-exit-when-done", pdfPath };

            var result = RunProcess(sumatra, args);
            if (result.ExitCode != 0)
            {
                var target = String.IsNullOrWhiteSpace(printerName)
                    ? "the Windows default printer"
                    : "\"" + printerName + "\"";
                var detail = String.IsNullOrWhiteSpace(result.StdErr)
                    ? "SumatraPDF exit code " + result.ExitCode + "."
                    : result.StdErr.Trim();
                throw new InvalidOperationException(
                    String.Format(
                        "Could not print to {0}. {1} Check the printer name in Centrix Local printing, set the Windows default printer, or in services.msc set Centrix Print Agent to log on as this Windows user (USB receipt printers often need that).",
                        target,
                        detail));
            }
        }

        private static string FindSumatraExecutable()
        {
            var env = Environment.GetEnvironmentVariable("SUMATRA_PATH");
            if (!String.IsNullOrWhiteSpace(env) && File.Exists(env))
            {
                return TryBundleSumatraBesideAgent(env) ?? env;
            }

            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var bundled = Path.Combine(baseDir, "tools", "SumatraPDF", "SumatraPDF.exe");
            if (File.Exists(bundled))
            {
                return bundled;
            }

            var candidates = new List<string>
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "SumatraPDF", "SumatraPDF.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "SumatraPDF", "SumatraPDF.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SumatraPDF", "SumatraPDF.exe")
            };

            var systemDrive = Path.GetPathRoot(Environment.SystemDirectory);
            if (!String.IsNullOrWhiteSpace(systemDrive))
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
                        // Ignore profile scan errors.
                    }
                }
            }

            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return TryBundleSumatraBesideAgent(candidate) ?? candidate;
                }
            }

            return FindOnPath("SumatraPDF.exe");
        }

        private static string TryBundleSumatraBesideAgent(string sourceExe)
        {
            try
            {
                if (String.IsNullOrWhiteSpace(sourceExe) || !File.Exists(sourceExe))
                {
                    return null;
                }

                var baseDir = AppDomain.CurrentDomain.BaseDirectory;
                var target = Path.Combine(baseDir, "tools", "SumatraPDF", "SumatraPDF.exe");
                if (String.Equals(Path.GetFullPath(sourceExe), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
                {
                    return target;
                }

                Directory.CreateDirectory(Path.GetDirectoryName(target));
                File.Copy(sourceExe, target, true);
                return File.Exists(target) ? target : null;
            }
            catch
            {
                return null;
            }
        }

        private static string FindEdgeExecutable()
        {
            var candidates = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe")
            };
            return candidates.FirstOrDefault(File.Exists);
        }

        private static string FindChromeExecutable()
        {
            var candidates = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe")
            };
            return candidates.FirstOrDefault(File.Exists);
        }

        private static string FindOnPath(string fileName)
        {
            var pathValue = Environment.GetEnvironmentVariable("PATH");
            if (String.IsNullOrWhiteSpace(pathValue))
            {
                return null;
            }

            foreach (var dir in pathValue.Split(Path.PathSeparator))
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
                    // Ignore invalid PATH entries.
                }
            }

            return null;
        }

        private static string ToForwardSlashPath(string path)
        {
            return Path.GetFullPath(path).Replace('\\', '/');
        }

        private static bool WaitForFile(string path)
        {
            for (var attempt = 0; attempt < 40; attempt++)
            {
                if (File.Exists(path) && new FileInfo(path).Length > 0)
                {
                    return true;
                }
                Thread.Sleep(125);
            }
            return File.Exists(path) && new FileInfo(path).Length > 0;
        }

        private static ProcessResult RunProcess(string fileName, IEnumerable<string> arguments)
        {
            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
                WorkingDirectory = Path.GetDirectoryName(fileName) ?? AppDomain.CurrentDomain.BaseDirectory,
                Arguments = String.Join(" ", arguments.Select(QuoteArgument).ToArray())
            };

            using (var process = Process.Start(psi))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("Could not start process: " + fileName);
                }

                var stderrTask = process.StandardError.ReadToEndAsync();
                process.WaitForExit();
                return new ProcessResult(process.ExitCode, stderrTask.Result);
            }
        }

        private static string QuoteArgument(string value)
        {
            if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0)
            {
                return value;
            }

            var result = new StringBuilder("\"");
            var backslashes = 0;
            foreach (var ch in value)
            {
                if (ch == '\\')
                {
                    backslashes++;
                    continue;
                }

                if (ch == '"')
                {
                    result.Append('\\', backslashes * 2 + 1);
                    result.Append('"');
                    backslashes = 0;
                    continue;
                }

                result.Append('\\', backslashes);
                result.Append(ch);
                backslashes = 0;
            }

            result.Append('\\', backslashes * 2);
            result.Append('"');
            return result.ToString();
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
                // Ignore temp cleanup errors.
            }
        }

        private static void TryDeleteDirectory(string path)
        {
            try
            {
                if (Directory.Exists(path))
                {
                    Directory.Delete(path, true);
                }
            }
            catch
            {
                // Ignore temp cleanup errors.
            }
        }

        private sealed class BrowserCandidate
        {
            public BrowserCandidate(string name, string path)
            {
                Name = name;
                Path = path;
            }

            public string Name { get; private set; }
            public string Path { get; private set; }
        }

        private sealed class ProcessResult
        {
            public ProcessResult(int exitCode, string stdErr)
            {
                ExitCode = exitCode;
                StdErr = stdErr;
            }

            public int ExitCode { get; private set; }
            public string StdErr { get; private set; }
        }
    }

    public sealed class PrintResult
    {
        public PrintResult(string jobId, string printer)
        {
            JobId = jobId;
            Printer = printer;
        }

        public string JobId { get; private set; }
        public string Printer { get; private set; }
    }
}
