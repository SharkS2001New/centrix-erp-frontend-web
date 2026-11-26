using System;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.Linq;

namespace Centrix.PrintAgent.Services
{
    public sealed class PrinterDiscovery
    {
        public IReadOnlyList<string> ListPrinters()
        {
            try
            {
                return PrinterSettings.InstalledPrinters
                    .Cast<string>()
                    .Where(name => !String.IsNullOrWhiteSpace(name))
                    .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }
            catch
            {
                return new string[0];
            }
        }

        public string DefaultPrinter()
        {
            try
            {
                var settings = new PrinterSettings();
                return String.IsNullOrWhiteSpace(settings.PrinterName) ? null : settings.PrinterName;
            }
            catch
            {
                return null;
            }
        }

        public bool PrinterExists(string printerName)
        {
            if (String.IsNullOrWhiteSpace(printerName))
            {
                return false;
            }

            return ListPrinters().Any(name =>
                String.Equals(name, printerName, StringComparison.OrdinalIgnoreCase));
        }
    }
}
