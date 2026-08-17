# Build Centrix Print Agent (Windows)

Do this on a **Windows 10/11 x64** PC.

---

## Easiest way (recommended)

1. In Centrix: **Administration → Local printing → Centrix Print Agent (Windows)**
2. Click **Download build package (source)**
3. Unzip `CentrixPrintAgent-source.zip`
4. Open the unzipped folder `print-agent-dotnet`
5. **Double‑click `BUILD-AND-INSTALL.bat`**
6. Click **Yes** if Windows asks for Administrator permission
7. Wait until it says **SUCCESS**

The installer **does not download wkhtmltopdf** by default. Install it once yourself (link below), or the build will pick it up from `Program Files\wkhtmltopdf` automatically.

**wkhtmltopdf (one-time, for receipt rendering):**  
https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe

**SumatraPDF (silent PDF to printer):** must end up next to the Print Agent:

`C:\Program Files\Centrix\PrintAgent\tools\SumatraPDF\SumatraPDF.exe`

`BUILD-AND-INSTALL.bat` / `configure-sumatra.ps1` copy it there. If you installed Sumatra separately, run as Administrator:

```powershell
.\scripts\configure-sumatra.ps1 -SkipDownload
```

Or manually copy `SumatraPDF.exe` into that `tools\SumatraPDF\` folder.

**Usual install locations** (copy from whichever exists on the till PC):

- `C:\Program Files\SumatraPDF\SumatraPDF.exe`
- `C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe`
- `C:\Users\<your Windows user>\AppData\Local\SumatraPDF\SumatraPDF.exe`

Portable zip: extract and copy `SumatraPDF.exe` from the folder you unzipped. If unsure, search the PC for `SumatraPDF.exe` in File Explorer.

If Windows blocks the script, right‑click `BUILD-AND-INSTALL.bat` → **Run as administrator**.

---

## One-time requirement: .NET 8 SDK

Before the build can succeed:

1. Open https://dotnet.microsoft.com/download/dotnet/8.0  
2. Install **SDK 8.x — Windows x64** (not “Runtime”)
3. **Close all** PowerShell / CMD windows, then run `BUILD-AND-INSTALL.bat` again

Check:

```powershell
dotnet --version
```

---

## Do NOT do this

Do **not** type this literally:

```text
cd path\to\print-agent-dotnet
```

`path\to` was only a placeholder. Use the real folder you unzipped, or just double‑click `BUILD-AND-INSTALL.bat` (no `cd` needed).

---

## After SUCCESS

1. Open http://127.0.0.1:9247/v1/health — you should see JSON  
2. Centrix → Local printing → Centrix Print Agent → **Test connection** → Save  
3. Optional: install SumatraPDF for silent thermal printing  
   https://www.sumatrapdfreader.org/download-free-pdf-viewer

---

## If you prefer PowerShell by hand

Open **PowerShell as Administrator**, then:

```powershell
cd $HOME\Downloads\print-agent-dotnet
# ^ change this to wherever YOU unzipped the folder

Set-ExecutionPolicy -Scope Process Bypass
.\scripts\build-and-install.ps1
```

---

## Common errors

| Message / symptom | Fix |
|-------------------|-----|
| `path\to` not found | You copied the placeholder. Use double‑click `BUILD-AND-INSTALL.bat` instead |
| Scripts are disabled / cannot be loaded | Use `BUILD-AND-INSTALL.bat` (bypasses policy) or `Set-ExecutionPolicy -Scope Process Bypass` |
| `dotnet` is not recognized | Install .NET 8 **SDK**, close terminals, retry |
| `Unexpected token ')'` in `build-and-install.ps1` | You have an **old** build package. Download **build package (source)** again from Centrix (Administration → Local printing). The script must use `Step 1.` lines, not `1)` |
| `NU1101` / WebView2 package error | Re-download the source zip (0.2.2+ no longer needs WebView2). Only .NET 8 SDK is required |
| `#Requires -RunAsAdministrator` | Right‑click → Run as administrator |
| Publish failed | Stay on Windows x64; ensure SDK 8 is installed |
| Port / health fails | `Get-Process Centrix.PrintAgent` — must be running; open http://127.0.0.1:9247/v1/health |
| `Could not render receipt HTML to PDF` | Install wkhtmltopdf manually (link above), re-run install. Health must show `"wkhtmltopdf_available": true` |
| Test sent but nothing prints | Run `.\scripts\configure-sumatra.ps1` as Administrator. Health must show `"sumatra_available": true`. USB printers: service Log On -> this Windows user |
| Shared printer prints a Windows test page, Hotel POS does not | The Print Agent **Windows service** (Local System) often cannot see user-session shares. Health `printers` must list the share. If it does not, run `.\scripts\configure-user-session-printing.ps1` as Administrator, then Local printing → Test connection → pick that printer → Save → Test print |
| Configure Sumatra only | `.\scripts\configure-sumatra.ps1` (bundles SumatraPDF + sets SUMATRA_PATH). If already installed manually: `.\scripts\configure-sumatra.ps1 -SkipDownload` |
| Sumatra download 404 | Fixed in latest scripts (URL is `/dl/rel/3.6.1/...` not `/dl/rel/SumatraPDF-3.6.1-64.zip`). Or install Sumatra manually and run with `-SkipDownload` |
| wkhtmltopdf download slow / hangs | Install wkhtmltopdf manually (link above). Re-run `BUILD-AND-INSTALL.bat` - it copies from `Program Files\wkhtmltopdf` and skips download |
| Force download during install | `.\scripts\install-windows-service.ps1 -DownloadWkhtml` |
| Print dialog flashes / not silent | Install [SumatraPDF](https://www.sumatrapdfreader.org/download-free-pdf-viewer), pick your receipt printer in Centrix -> Local printing -> Save |

---

## Uninstall

```powershell
.\scripts\uninstall-windows-service.ps1
```
