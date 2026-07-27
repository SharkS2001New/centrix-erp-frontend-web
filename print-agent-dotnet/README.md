# Centrix Print Agent (.NET Windows Service)

Lightweight **Windows service** for silent receipt printing at POS tills. Replaces the old Node.js + Playwright MSI (~400 MB) and does not require QZ Tray.

## What it does

- Listens on **http://127.0.0.1:9247** (same API as before)
- `GET /v1/health` — list printers
- `POST /v1/print` — print receipt HTML silently
- Runs as a **Windows Service** (`CentrixPrintAgent`) and starts automatically
- Falls back in Centrix to the **browser print dialog** if the service is offline

## Requirements (till PC)

- Windows 10/11 x64
- [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) is **not** required when using the self-contained publish
- **Microsoft Edge** (built into Windows) — renders HTML to PDF
- **SumatraPDF** (recommended) — silent thermal printing without dialogs  
  https://www.sumatrapdfreader.org/download-free-pdf-viewer

## Build once (on a Windows dev PC)

```powershell
cd print-agent-dotnet
.\scripts\publish.ps1
```

Output:

- `publish/Centrix.PrintAgent.exe` (~15–25 MB self-contained)
- `publish/CentrixPrintAgent-win-x64.zip` — copy this to tills or host on R2/CDN

## Install on each till (admin PowerShell)

```powershell
cd print-agent-dotnet
.\scripts\publish.ps1
.\scripts\install-windows-service.ps1
```

Or unzip `CentrixPrintAgent-win-x64.zip` to `C:\Program Files\Centrix\PrintAgent` and run `install-windows-service.ps1`.

## Centrix setup

1. **Administration → Local printing**
2. Choose **Centrix Print Agent**
3. **Test connection** → pick printer → **Save**

## Why the old MSI / script failed

| Issue | Cause |
|-------|--------|
| MSI empty / missing | MSI must be built on Windows (WiX) and uploaded to R2 — not included in the Docker image by default |
| Script “can't download files” | Bootstrap downloads from `/api/print-agent/file/*` — fails if ERP URL is wrong or those files aren't deployed |
| QZ Tray won't download | QZ is a third-party installer; some PCs block it |

This .NET service is the recommended Windows path going forward.

## API

Same contract as `print-agent/server.js`:

```http
GET  /v1/health
POST /v1/print
Content-Type: application/json

{
  "html": "<html>...</html>",
  "copies": 1,
  "printer": "EPSON TM-T20",
  "document_id": "sale-123"
}
```

## Uninstall

```powershell
.\scripts\uninstall-windows-service.ps1
```
