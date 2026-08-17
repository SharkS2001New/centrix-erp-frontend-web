using System.Drawing.Printing;
using System.Text.RegularExpressions;

namespace Centrix.PrintAgent.Services;

public sealed class PrinterDiscovery
{
    public IReadOnlyList<string> ListPrinters()
    {
        try
        {
            return PrinterSettings.InstalledPrinters
                .Cast<string>()
                .Where(static name => !string.IsNullOrWhiteSpace(name))
                .OrderBy(static name => name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    public string? DefaultPrinter()
    {
        try
        {
            var settings = new PrinterSettings();
            return string.IsNullOrWhiteSpace(settings.PrinterName) ? null : settings.PrinterName;
        }
        catch
        {
            return null;
        }
    }

    public bool PrinterExists(string? printerName) =>
        ResolveInstalledName(printerName) is not null;

    /// <summary>
    /// Map a Centrix / Windows UI name onto the exact InstalledPrinters string.
    /// Shared printers often appear as both \\HOST\Share and "Share on HOST".
    /// </summary>
    public string? ResolveInstalledName(string? requested)
    {
        if (string.IsNullOrWhiteSpace(requested))
        {
            return null;
        }

        var printers = ListPrinters();
        return MatchInstalledName(requested, printers);
    }

    internal static string? MatchInstalledName(string requested, IReadOnlyList<string> printers)
    {
        if (string.IsNullOrWhiteSpace(requested) || printers.Count == 0)
        {
            return null;
        }

        var want = requested.Trim();
        foreach (var printer in printers)
        {
            if (string.Equals(printer, want, StringComparison.OrdinalIgnoreCase))
            {
                return printer;
            }
        }

        var wantAliases = Aliases(want);
        foreach (var printer in printers)
        {
            var have = Aliases(printer);
            if (wantAliases.Overlaps(have))
            {
                return printer;
            }
        }

        var wantShare = ShareOrLocalName(want);
        if (string.IsNullOrEmpty(wantShare))
        {
            return null;
        }

        var shareHits = printers
            .Where(p => string.Equals(ShareOrLocalName(p), wantShare, StringComparison.OrdinalIgnoreCase))
            .ToList();
        return shareHits.Count == 1 ? shareHits[0] : null;
    }

    public static bool LooksLikeSharedPrinter(string? printerName)
    {
        var name = (printerName ?? "").Trim();
        if (name.Length == 0)
        {
            return false;
        }

        return name.StartsWith(@"\\", StringComparison.Ordinal)
            || name.Contains(@"\", StringComparison.Ordinal)
            || Regex.IsMatch(name, @"\son\s+\S+", RegexOptions.IgnoreCase);
    }

    private static HashSet<string> Aliases(string name)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var trimmed = name.Trim();
        if (trimmed.Length == 0)
        {
            return set;
        }

        set.Add(trimmed);
        set.Add(Regex.Replace(trimmed, @"\s+", " "));

        var (host, share) = SplitHostAndShare(trimmed);
        if (string.IsNullOrEmpty(share))
        {
            return set;
        }

        set.Add(share);
        if (!string.IsNullOrEmpty(host))
        {
            var hostKey = HostKey(host);
            set.Add($@"\\{host}\{share}");
            set.Add($@"\\{hostKey}\{share}");
            set.Add($"{share} on {host}");
            set.Add($"{share} on {hostKey}");
        }

        return set;
    }

    private static string? ShareOrLocalName(string name)
    {
        var (_, share) = SplitHostAndShare(name);
        return string.IsNullOrEmpty(share) ? name.Trim() : share;
    }

    private static (string? Host, string? Share) SplitHostAndShare(string name)
    {
        var trimmed = name.Trim();
        var unc = Regex.Match(trimmed, @"^\\\\([^\\]+)\\(.+)$");
        if (unc.Success)
        {
            return (unc.Groups[1].Value, unc.Groups[2].Value.Trim());
        }

        var onForm = Regex.Match(trimmed, @"^(.+?)\s+on\s+([^\\/]+)$", RegexOptions.IgnoreCase);
        if (onForm.Success)
        {
            return (onForm.Groups[2].Value.Trim(), onForm.Groups[1].Value.Trim());
        }

        return (null, trimmed);
    }

    private static string HostKey(string host)
    {
        var h = host.Trim().Trim('\\');
        var dot = h.IndexOf('.');
        return (dot > 0 ? h[..dot] : h).ToUpperInvariant();
    }
}
