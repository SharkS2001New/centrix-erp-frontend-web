# Centrix Print Agent

Local service for **silent receipt printing** at POS tills.

## Windows MSI installer (recommended)

The MSI bundles **Node.js 20**, npm dependencies, Playwright Chromium, and registers **auto-start at login**. Cashiers do not install anything manually.

### Build the MSI (once, on Windows)

**Requirements:** Windows 10+, [WiX Toolset 3.x](https://wixtoolset.org/), internet for first build.

```powershell
cd print-agent
winget install WiXToolset.WiXToolset   # if WiX not installed
npm run build:msi
```

Output: `print-agent/dist/CentrixPrintAgent-0.1.0.0.msi` (~300–400 MB).

Or trigger **GitHub Actions → Build Print Agent MSI** to build in the cloud and download the artifact.

### Deploy to till PCs

1. Copy `CentrixPrintAgent-0.1.0.0.msi` to each workstation (USB, network share, or **Download Windows MSI** in Centrix → Administration → Local printing).
2. Double-click the MSI → Next → Install (admin required).
3. (Recommended) Install [SumatraPDF](https://www.sumatrapdfreader.org/) for silent thermal printing.
4. In Centrix: enable print agent → **Test print receipt** → Save.

Install location default: `C:\Program Files\Centrix\PrintAgent\`

Uninstall via Windows Settings → Apps removes files and the scheduled task.

---

## Who needs this?

| Computer | Print agent? |
|----------|----------------|
| **POS / till PC** | Yes — once per machine |
| **Backoffice / managers** | No |

---

## Script installer (fallback)

If MSI is not built yet, use **Download script installer** in Administration → Local printing, or:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Autostart
```

The script downloads portable Node.js when missing.

---

## API

Agent listens on **http://127.0.0.1:9247** after install.

See previous README sections for `/v1/health` and `/v1/print`.

---

## Files

| Path | Purpose |
|------|---------|
| `scripts/build-msi.ps1` | Build MSI (Windows + WiX) |
| `scripts/stage-for-msi.ps1` | Bundle Node, npm, Playwright |
| `installer/Product.wxs` | WiX installer definition |
| `server.js` | Print agent HTTP service |
