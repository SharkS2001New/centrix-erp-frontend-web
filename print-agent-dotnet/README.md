# Centrix Print Agent (.NET Windows Service)

Silent receipt + A4 document printing for Windows POS tills. Same API as before (`http://127.0.0.1:9247`).

Runs as a **Windows service** and renders with **wkhtmltopdf** (works in the background without Edge headless).

- **Thermal (80mm)** — POS receipts (`job_type: receipt`)
- **A4** — HR payslips, cash advances, leave forms, invoices (`payroll_receipt`, `cash_advance`, `leave_application`, …)

Agent **0.3.2+** bundles Sumatra on publish/install and downloads **wkhtmltopdf** during install by default so a till works after one admin install.

## For till / office staff

1. In Centrix open **Administration → Local printing**
2. Select **Centrix Print Agent (Windows)**
3. Prefer **Download Windows print service** (ready zip): unzip → right-click **`INSTALL.bat`** → Run as administrator
4. Open `http://127.0.0.1:9247/v1/health`, then **Test connection → Save** in Centrix

If only the source package is available, use **Download build package (source)** and follow **`BUILD.md`** / **`BUILD-AND-INSTALL.bat`** (.NET 8 SDK once).

USB receipt printers: if health is OK but nothing prints, set the Windows service **Log On** to the Windows user who can see that printer, then restart the service.

## For developers

Full step-by-step: **[BUILD.md](./BUILD.md)**

Quick publish (Windows + .NET 8 SDK):

```powershell
cd print-agent-dotnet
.\scripts\publish.ps1
.\scripts\install-windows-service.ps1
```

Host `publish/CentrixPrintAgent-win-x64.zip` via `PRINT_AGENT_DOTNET_URL` or `print-agent-dotnet/publish/` so tills can download the ready zip.

## API

- `GET /v1/health` — includes `async_print: true` when background queue is available
- `POST /v1/print` with `{ "html", "copies", "printer", "document_id", "wait" }`
  - Default: queues the job and returns immediately (`queued: true`) so POS stays snappy
  - `"wait": true`: prints synchronously (used by Admin → Test print)
