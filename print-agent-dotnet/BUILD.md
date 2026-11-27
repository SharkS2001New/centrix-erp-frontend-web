# Build Centrix Print Agent (Windows)

## Supported Windows versions

- Windows 7 **Service Pack 1**, 64-bit, with .NET Framework 4.8
- Windows 8.1 and Windows 10/11, 64-bit

The primary build and install path is compatible with Windows PowerShell 2.0, which ships with Windows 7. No .NET SDK, Node.js, or PowerShell upgrade is needed. The first install requires internet access to obtain the printer utilities.

## Build and install

1. In Centrix, open **Administration → Local printing**.
2. Click **Download build package (source)**.
3. Unzip `CentrixPrintAgent-source.zip`.
4. Open the extracted `print-agent-dotnet` folder.
5. Right-click **`BUILD-AND-INSTALL.bat`** and choose **Run as administrator**.
6. Wait for **SUCCESS**.
7. Open `http://127.0.0.1:9247/v1/health`, then use **Test connection → Save** in Centrix.

The build uses the C# compiler included with .NET Framework 4.8. The installer bundles wkhtmltopdf and a Windows 7-compatible SumatraPDF in `C:\Program Files\Centrix\PrintAgent\tools`. It copies them from standard Program Files or Windows user-profile locations when available, otherwise it downloads them. Installation fails rather than leaving an incomplete tools folder.
It also creates `publish\CentrixPrintAgent-win-x64.zip`; upload that package to the server's configured print-agent download location to distribute it to other tills.

For USB printers, set the service's **Log On** account to the Windows user who can access that printer, then restart the service.

## Manual commands

Run PowerShell as Administrator from the extracted folder:

```powershell
.\scripts\publish.ps1
.\scripts\install-windows-service.ps1
```

## Troubleshooting

| Message / symptom | Fix |
|---|---|
| `#Requires -Version 5.1` error | Re-download the latest source package. The current build scripts support PowerShell 2.0. |
| .NET Framework 4.8 is missing | Install .NET Framework 4.8 on Windows 7 SP1, restart if requested, then retry. |
| Scripts are disabled | Run `BUILD-AND-INSTALL.bat` as Administrator; it uses execution-policy bypass. |
| wkhtmltopdf download fails | Install [wkhtmltopdf 0.12.6](https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox-0.12.6-1.msvc2015-win64.exe), then rerun the installer. |
| SumatraPDF download fails | Install a Windows 7-compatible SumatraPDF version manually and rerun `install-windows-service.ps1 -SkipSumatraDownload`. |
| Port / health fails | Check that `CentrixPrintAgent` is running in Windows Services, then open `http://127.0.0.1:9247/v1/health`. |
| Agent runs but Centrix says offline | Hard-refresh Centrix. HTTPS pages need the agent's Private Network Access headers. |
| Agent is online but printing fails | Confirm `print_ready` is true in `/v1/health`; `wkhtmltopdf_error`, renderer paths, and `printers` identify missing tools or printer access. For USB printers, set the service Log On account to the Windows account that can access the printer. |

## Uninstall

Run PowerShell as Administrator from the extracted folder:

```powershell
.\scripts\uninstall-windows-service.ps1
```
