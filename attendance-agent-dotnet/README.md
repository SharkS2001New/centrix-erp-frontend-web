# Centrix Attendance Agent (.NET)

Native **Windows service** that bridges Hikvision fingerprint / face terminals on your office LAN to Centrix ERP cloud.

Same job as the old Node agent, built like the **Centrix Print Agent**:

- Self-contained `.exe` (no Node.js)
- Real Windows service (`CentrixAttendanceAgent`)
- Local status page at `http://127.0.0.1:9251`
- **Command polling runs independently** of punch catch-up so Centrix “Test connection” is not blocked for minutes
- Version **3.3.1** — punch upload **06:00–02:00 next day** (Nairobi), hourly + keep retrying; **heartbeat every 60s** so Centrix stays live overnight

## Requirements

- Windows 10/11 (x64)
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) on the PC that builds/installs (one-time)
- Same LAN as the Hikvision terminal
- Outbound HTTPS to your Centrix API

## Install (from Centrix download)

1. In Centrix → **HR → Attendance** → download the agent for the device.
2. Unzip `CentrixAttendanceAgent-….zip`.
3. Right-click **`BUILD-AND-INSTALL.bat`** → **Run as administrator**.
4. Open **http://127.0.0.1:9251** → **Test connection**.

The zip already contains `config.json` (API URL, token, device, Hikvision IP). Keep it private.

**You should not need to re-download every morning.** Keep the Windows service running; Centrix keeps the agent token across admin logins. Re-download only if last check-in never updates for hours.

## Uninstall

Run **`uninstall-windows.bat`** as Administrator.

## What it does

| Loop | Interval | Purpose |
|------|----------|---------|
| Command poll | 2s | Proxies ISAPI / Centrix PING (Test connection) + updates last check-in |
| Heartbeat | **60–120s** | Keepalive so Centrix shows the agent live overnight |
| Punch sync | **06:00–02:00 next day Africa/Nairobi**, retry every **5 min** | After each hour in that window, upload new punches (keeps retrying) |

## Legacy Node agent

The previous Node package under `attendance-agent/` is replaced by this .NET service. Uninstall any old Node service before installing, or use this installer (it replaces `CentrixAttendanceAgent`).
