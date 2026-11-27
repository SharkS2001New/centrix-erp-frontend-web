using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Centrix.PrintAgent.Services
{
    /// <summary>
    /// Renders HTML to PDF using wkhtmltopdf, which works from a Windows service.
    /// Thermal and A4 jobs use different page geometry.
    /// </summary>
    internal static class WkhtmlPdfRenderer
    {
        private const int ThermalPaperWidthTenthsMm = 800;

        public static string FindExecutable()
        {
            var env = Environment.GetEnvironmentVariable("WKHTMLTOPDF_PATH");
            if (!String.IsNullOrWhiteSpace(env) && File.Exists(env))
            {
                return env;
            }

            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var candidates = new List<string>
            {
                Path.Combine(baseDir, "tools", "wkhtmltopdf", "bin", "wkhtmltopdf.exe"),
                Path.Combine(baseDir, "wkhtmltopdf", "bin", "wkhtmltopdf.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "wkhtmltopdf", "bin", "wkhtmltopdf.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "wkhtmltopdf", "bin", "wkhtmltopdf.exe")
            };

            var systemDrive = Path.GetPathRoot(Environment.SystemDirectory);
            if (!String.IsNullOrWhiteSpace(systemDrive))
            {
                var usersRoot = Path.Combine(systemDrive, "Users");
                if (Directory.Exists(usersRoot))
                {
                    try
                    {
                        foreach (var profile in Directory.GetDirectories(usersRoot))
                        {
                            candidates.Add(Path.Combine(profile, "AppData", "Local", "wkhtmltopdf", "bin", "wkhtmltopdf.exe"));
                            candidates.Add(Path.Combine(profile, "AppData", "Local", "Programs", "wkhtmltopdf", "bin", "wkhtmltopdf.exe"));
                        }
                    }
                    catch (UnauthorizedAccessException)
                    {
                        // Continue with machine-wide locations when user profiles are inaccessible.
                    }
                    catch (IOException)
                    {
                        // Continue with machine-wide locations when user profiles are unavailable.
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

            return FindOnPath("wkhtmltopdf.exe");
        }

        public static string ProbeError()
        {
            var executable = FindExecutable();
            if (executable == null)
            {
                return "wkhtmltopdf.exe was not found.";
            }

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = executable,
                    Arguments = "--version",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = Path.GetDirectoryName(executable) ?? AppDomain.CurrentDomain.BaseDirectory
                };
                using (var process = Process.Start(psi))
                {
                    if (process == null)
                    {
                        return "Windows could not start wkhtmltopdf.exe.";
                    }

                    if (!process.WaitForExit(5000))
                    {
                        process.Kill();
                        return "wkhtmltopdf.exe did not respond to --version within 5 seconds.";
                    }

                    return process.ExitCode == 0
                        ? null
                        : "wkhtmltopdf.exe --version exited with code " + process.ExitCode + ".";
                }
            }
            catch (Win32Exception ex)
            {
                return "Windows could not start wkhtmltopdf.exe: " + ex.Message;
            }
            catch (IOException ex)
            {
                return "wkhtmltopdf.exe could not be read: " + ex.Message;
            }
            catch (UnauthorizedAccessException ex)
            {
                return "wkhtmltopdf.exe could not be accessed: " + ex.Message;
            }
            catch (InvalidOperationException ex)
            {
                return "wkhtmltopdf.exe could not run: " + ex.Message;
            }
        }

        public static bool IsThermalJob(string jobType, string html)
        {
            if (!String.IsNullOrWhiteSpace(jobType))
            {
                var type = jobType.Trim().ToLowerInvariant();
                if (new[] { "receipt", "thermal", "kra", "kra_receipt", "pos_receipt", "hospitality_check" }
                    .Contains(type))
                {
                    return true;
                }

                if (new[] { "document", "invoice", "a4", "payroll_receipt", "cash_advance",
                    "leave_application", "lpo", "picking_list", "report" }.Contains(type))
                {
                    return false;
                }
            }

            if (!String.IsNullOrEmpty(html))
            {
                if (ContainsIgnoreCase(html, "centrix-print-thermal"))
                {
                    return true;
                }

                if (ContainsIgnoreCase(html, "size: A4")
                    || ContainsIgnoreCase(html, "size:A4")
                    || ContainsIgnoreCase(html, "210mm 297mm")
                    || ContainsIgnoreCase(html, "297mm 210mm")
                    || ContainsIgnoreCase(html, "page: centrix-edge")
                    || ContainsIgnoreCase(html, "has-doc-print-edge-footer"))
                {
                    return false;
                }
            }

            return true;
        }

        public static string ResolveA4Orientation(string html)
        {
            if (String.IsNullOrEmpty(html))
            {
                return null;
            }

            if (Regex.IsMatch(html, @"297mm\s+210mm", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            {
                return "landscape";
            }

            if (Regex.IsMatch(html, @"210mm\s+297mm", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            {
                return "portrait";
            }

            return null;
        }

        public static bool IsLandscapeDocument(string html)
        {
            return String.Equals(ResolveA4Orientation(html), "landscape", StringComparison.OrdinalIgnoreCase);
        }

        public static int Render(string htmlPath, string pdfPath, string jobType)
        {
            var executable = FindExecutable();
            if (executable == null)
            {
                throw new InvalidOperationException(
                    "wkhtmltopdf is missing. Install it manually, then re-run install-windows-service.ps1 or set WKHTMLTOPDF_PATH.");
            }

            var html = File.ReadAllText(htmlPath);
            if (!IsThermalJob(jobType, html))
            {
                var landscape = IsLandscapeDocument(html);
                RenderA4(executable, htmlPath, pdfPath, landscape);
                return landscape ? 210 : 297;
            }

            var pageHeightMm = EstimateThermalPageHeightMm(html);
            RenderAtHeight(executable, htmlPath, pdfPath, pageHeightMm);
            if (CountPdfPages(pdfPath) > 1)
            {
                pageHeightMm = Math.Min(520, (int)Math.Ceiling(pageHeightMm * 1.45) + 24);
                RenderAtHeight(executable, htmlPath, pdfPath, pageHeightMm);
            }

            return pageHeightMm;
        }

        private static void RenderA4(string executable, string htmlPath, string pdfPath, bool landscape)
        {
            var orientation = landscape ? "Landscape" : "Portrait";
            var viewport = landscape ? "1123x794" : "794x1123";
            var args = new[]
            {
                "--quiet", "--enable-local-file-access", "--encoding", "utf-8",
                "--page-size", "A4", "--orientation", orientation,
                "--margin-top", "0mm", "--margin-bottom", "0mm",
                "--margin-left", "0mm", "--margin-right", "0mm",
                "--disable-smart-shrinking", "--print-media-type", "--viewport-size", viewport,
                htmlPath, pdfPath
            };

            EnsureRendered(executable, args, pdfPath);
        }

        private static void RenderAtHeight(string executable, string htmlPath, string pdfPath, int pageHeightMm)
        {
            var viewportHeightPx = Math.Max(120, (int)Math.Ceiling(pageHeightMm / 25.4 * 96.0));
            var args = new[]
            {
                "--quiet", "--enable-local-file-access", "--encoding", "utf-8",
                "--page-width", "80mm", "--page-height", pageHeightMm + "mm",
                "--margin-top", "0mm", "--margin-bottom", "0mm",
                "--margin-left", "0mm", "--margin-right", "0mm",
                "--disable-smart-shrinking", "--print-media-type", "--viewport-size",
                "302x" + viewportHeightPx, htmlPath, pdfPath
            };

            EnsureRendered(executable, args, pdfPath);
        }

        private static void EnsureRendered(string executable, string[] args, string pdfPath)
        {
            var result = RunProcess(executable, args);
            if (result.ExitCode != 0 || !File.Exists(pdfPath) || new FileInfo(pdfPath).Length == 0)
            {
                var detail = String.IsNullOrWhiteSpace(result.StdErr)
                    ? "wkhtmltopdf exited with code " + result.ExitCode + "."
                    : result.StdErr.Trim();
                throw new InvalidOperationException(detail);
            }
        }

        internal static int CountPdfPages(string pdfPath)
        {
            try
            {
                var bytes = File.ReadAllBytes(pdfPath);
                var text = Encoding.GetEncoding(28591).GetString(bytes);
                return Regex.Matches(text, @"/Type\s*/Page(?!\s*s)", RegexOptions.CultureInvariant).Count;
            }
            catch
            {
                return 1;
            }
        }

        public static string BuildSumatraPrintSettings(int pageHeightMm, bool thermal, string a4Orientation)
        {
            if (!thermal)
            {
                if (String.Equals(a4Orientation, "landscape", StringComparison.OrdinalIgnoreCase))
                {
                    return "noscale,paper=A4,landscape";
                }
                if (String.Equals(a4Orientation, "portrait", StringComparison.OrdinalIgnoreCase))
                {
                    return "noscale,paper=A4,portrait";
                }
                return "noscale,paper=A4";
            }

            return String.Format(
                "noscale,paper={0}x{1}",
                ThermalPaperWidthTenthsMm,
                Math.Max(700, pageHeightMm * 10));
        }

        internal static int EstimateThermalPageHeightMm(string html)
        {
            if (String.IsNullOrWhiteSpace(html))
            {
                return 90;
            }

            var trCount = Count(html, "<tr\\b");
            var divCount = Count(html, "<div\\b");
            var pCount = Count(html, "<p\\b");
            var brCount = Count(html, "<br\\b");
            var imgCount = Count(html, "<img\\b");
            var preCount = Count(html, "<pre\\b");
            var footerLineCount = Count(html, "footer-text")
                + Count(html, "footer-powered-by")
                + Count(html, "footer-line-divider");
            var hasKraQr = ContainsIgnoreCase(html, "kra-etims-block")
                || ContainsIgnoreCase(html, "KRA eTIMS")
                || ContainsIgnoreCase(html, "Scan to verify");

            var mm = 24
                + trCount * 6
                + Math.Max(0, divCount - 10) * 2
                + pCount * 3
                + brCount * 3
                + imgCount * 26
                + preCount * 18
                + footerLineCount * 4;

            if (hasKraQr)
            {
                mm += 28;
            }

            mm = (int)Math.Ceiling(mm * 1.14) + 12;
            return Math.Max(80, Math.Min(480, mm));
        }

        private static int Count(string source, string token)
        {
            return Regex.Matches(source, token, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant).Count;
        }

        private static bool ContainsIgnoreCase(string source, string value)
        {
            return source.IndexOf(value, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static string FindOnPath(string fileName)
        {
            var pathValue = Environment.GetEnvironmentVariable("PATH");
            if (String.IsNullOrWhiteSpace(pathValue))
            {
                return null;
            }

            foreach (var dir in pathValue.Split(new[] { Path.PathSeparator }, StringSplitOptions.RemoveEmptyEntries))
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

        private static ProcessResult RunProcess(string fileName, string[] arguments)
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
                    throw new InvalidOperationException("Could not start wkhtmltopdf: " + fileName);
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
}
