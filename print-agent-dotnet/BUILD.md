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
| `Unexpected token ')'` in `install-user-session.ps1` | Same as above - re-download the source zip. Scripts must be plain ASCII (no smart quotes or em-dashes) |
| `#Requires -RunAsAdministrator` | Right‑click → Run as administrator |
| Publish failed | Stay on Windows x64; ensure SDK 8 is installed |
| Port / health fails | `Get-Process Centrix.PrintAgent` — must be running; open http://127.0.0.1:9247/v1/health |
| `Could not render receipt HTML to PDF` | Re-run `BUILD-AND-INSTALL.bat` as Administrator. Version **0.2.2+** installs **wkhtmltopdf** for the Windows service. Check http://127.0.0.1:9247/v1/health shows `"wkhtmltopdf_available": true` |
| Print dialog flashes / not silent | Install [SumatraPDF](https://www.sumatrapdfreader.org/download-free-pdf-viewer), pick your receipt printer in Centrix -> Local printing -> Save |

---

## Uninstall

```powershell
.\scripts\uninstall-windows-service.ps1
```
