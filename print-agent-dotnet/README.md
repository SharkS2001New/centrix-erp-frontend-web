# Centrix Print Agent (.NET Windows Service)

Silent receipt + A4 document printing for Windows POS tills. Same API as before (`http://127.0.0.1:9247`).

Runs as a **Windows service** and renders with **wkhtmltopdf** (works in the background without Edge headless).

- **Thermal (80mm)** — POS receipts (`job_type: receipt`)
- **A4** — HR payslips, cash advances, leave forms, invoices (`payroll_receipt`, `cash_advance`, `leave_application`, …)

Agent **0.3.3+** allows Chrome/Edge on the HTTPS Centrix UI to reach the loopback agent (Private Network Access). **0.3.2+** bundles Sumatra on publish/install and downloads **wkhtmltopdf** during install by default so a till works after one admin install.

## Windows compatibility

The .NET Framework 4.8 agent supports **Windows 7 SP1 x64 and later**. Windows 7 must have .NET Framework 4.8 installed. The build/install scripts run with Windows PowerShell 2.0, which is the version included with Windows 7.

## For till / office staff

1. In Centrix open **Administration → Local printing**
2. Select **Centrix Print Agent (Windows)**
3. If **Download Windows print service** is available, unzip it and run **`INSTALL.bat`** as administrator.
4. If only **Download build package (source)** is available, unzip it and run **`BUILD-AND-INSTALL.bat`** as administrator. This builds and installs the agent and creates `publish\CentrixPrintAgent-win-x64.zip` for distribution.
5. Open `http://127.0.0.1:9247/v1/health`, then **Test connection → Save** in Centrix.

USB receipt printers: if health is OK but nothing prints, set the Windows service **Log On** to the Windows user who can see that printer, then restart the service.

## For developers

Full step-by-step: **[BUILD.md](./BUILD.md)**

Quick build/install (Windows 7 SP1 x64 or later + .NET Framework 4.8):

```text
BUILD-AND-INSTALL.bat
```

The source build uses the C# compiler included with .NET Framework; no .NET SDK or PowerShell upgrade is needed.

## API

- `GET /v1/health` — includes `async_print: true` when background queue is available
- `POST /v1/print` with `{ "html", "copies", "printer", "document_id", "wait" }`
  - Default: queues the job and returns immediately (`queued: true`) so POS stays snappy
  - `"wait": true`: prints synchronously (used by Admin → Test print)
