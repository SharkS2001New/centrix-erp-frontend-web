# Centrix Print Agent

Local service for **silent receipt printing** at POS tills. The Centrix web ERP sends HTML receipt jobs to this agent; the agent prints to the configured thermal (or default) printer without opening the browser print dialog.

## Who needs this?

| Computer | Print agent? | Why |
|----------|--------------|-----|
| **POS / till PC** | **Yes — once per machine** | Silent thermal receipts at checkout |
| **Manager / backoffice laptop** | No | Browser print dialog is fine |
| **Warehouse / mobile** | No | Unless you add a fixed receipt printer there |

You do **not** run this on every user account — only on physical tills that print receipts.

## One-time install (per till PC)

Portable **Node.js 20+** is downloaded automatically when the PC does not already have it. No separate Node install required.

### Windows (easiest)

1. Double-click **`install-windows.bat`**, or use **Download & install print agent** in Centrix (Till management → Printing).
2. First run may take several minutes (Node.js + Chromium download).
3. (Recommended) Install [SumatraPDF](https://www.sumatrapdfreader.org/) for reliable silent printing.
4. In Centrix: enable agent → **Test print receipt** → Save.

Manual equivalent:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Autostart
```

### macOS / Linux

```bash
chmod +x install.sh
./install.sh --autostart
```

Then enable the agent in Centrix (same as step 4 above).

### After install

The agent listens on **http://127.0.0.1:9247**. It should start automatically when the user logs in to Windows/macOS.

To start manually:

```bash
npm start
# or Windows: start-agent.bat
```

## Centrix ERP configuration

1. Open **Sales → Till management → Printing**
2. Enable **Use Centrix Print Agent**
3. Click **Test agent**, then **Test print receipt**
4. Save

Settings are stored **in the browser on that till PC** (not org-wide).

## Installable POS app (optional, same till PC)

Open **`/pos`** in Chrome or Edge → **Install app**. This gives a fullscreen POS icon; the print agent still runs separately in the background.

## API

### `GET /v1/health`

```json
{
  "ok": true,
  "version": "0.1.0",
  "platform": "win32",
  "default_printer": "EPSON TM-T20",
  "printers": ["EPSON TM-T20", "Microsoft Print to PDF"]
}
```

### `POST /v1/print`

```json
{
  "html": "<!DOCTYPE html>…",
  "copies": 1,
  "job_type": "receipt",
  "document_id": "12345",
  "printer": "EPSON TM-T20"
}
```

## How printing works

1. Agent receives HTML (same receipt layout as browser preview).
2. Renders HTML to PDF via headless Chromium (Playwright).
3. Sends PDF to the printer silently (SumatraPDF on Windows, `lp` on Mac/Linux).

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PRINT_AGENT_PORT` | `9247` | Listen port |
| `PRINT_AGENT_HOST` | `127.0.0.1` | Bind address |
| `SUMATRA_PATH` | auto | Path to SumatraPDF.exe (Windows) |

## Security

- Binds to **localhost only** — not exposed to the network.
- Only the Centrix browser on the same machine should call the agent.

## Roadmap

- [ ] Single-file Windows installer (MSI) — no Node.js prerequisite for cashiers
- [ ] ESC/POS raw mode for common thermal printers
- [ ] Cash drawer kick via agent
