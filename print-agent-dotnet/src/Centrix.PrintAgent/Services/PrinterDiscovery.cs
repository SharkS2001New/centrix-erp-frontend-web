using System.Drawing.Printing;

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

    public bool PrinterExists(string? printerName)
    {
        if (string.IsNullOrWhiteSpace(printerName))
        {
            return false;
        }

        return ListPrinters().Any(name =>
            string.Equals(name, printerName, StringComparison.OrdinalIgnoreCase));
    }
}
