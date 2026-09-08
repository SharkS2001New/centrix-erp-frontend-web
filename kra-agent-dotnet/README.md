# Centrix KRA Agent (.NET)

Windows service that bridges **Centrix cloud** to **local Comstore** on the shop PC.

## Shop install (binary only)

Finance → KRA → **Download Centrix KRA Agent** serves a zip with:

- `Centrix.KraAgent.exe` (self-contained)
- `config.json` (org token, Comstore URL, hardware IP)
- `INSTALL.bat` / `uninstall.bat`

No source code and no .NET SDK on the shop PC. Run **INSTALL.bat** as Administrator.

### Build the installer for the web host (once, on Windows)

```powershell
cd kra-agent-dotnet
.\scripts\stage-release.ps1
```

Copy `release\win-x64\` onto the Centrix web host (or set `KRA_AGENT_RELEASE_DIR`).

## Runtime behaviour

**CentrixKraAgent always keeps running** as a Windows service.

- Heartbeats Centrix on an interval and long-polls for fiscal commands.
- Probes Comstore `GET /api/health` (does **not** start Comstore — configure Windows to start Comstore).
- Pings the Smart VSCU / fiscal hardware IP from Finance settings.
- If Comstore is down, Finance shows “start Comstore manually”; the agent service stays up.

## Dev (source) install

Developers with the .NET 8 SDK can still use `BUILD-AND-INSTALL.bat` from the source tree. Shops should only receive the staged release zip.
