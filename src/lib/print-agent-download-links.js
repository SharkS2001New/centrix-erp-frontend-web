/**
 * External downloads for Centrix Print Agent till setup (org admin Local printing).
 * Keep these as HTTPS deep links so admins can install prerequisites in one click.
 */

export const PRINT_AGENT_SUMATRA_PDF_URL =
  "https://www.sumatrapdfreader.org/download-free-pdf-viewer";

/** Stable Windows x64 installer for SumatraPDF (direct zip). */
export const PRINT_AGENT_SUMATRA_PDF_WIN64_URL =
  "https://www.sumatrapdfreader.org/dl/rel/SumatraPDF-3.5.2-64.zip";

export const PRINT_AGENT_DOTNET_SDK_URL =
  "https://dotnet.microsoft.com/download/dotnet/8.0";

/** wkhtmltopdf Windows x64 — used by the agent to render HTML receipts to PDF. */
export const PRINT_AGENT_WKHTMLTOPDF_URL =
  "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe";
