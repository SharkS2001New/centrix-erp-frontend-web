# Centrix Attendance Agent

Local bridge for **cloud Centrix** + **LAN Hikvision** fingerprint terminals.

Centrix in the cloud cannot open `192.168.x.x`. This agent runs on an office PC
(or mini-PC) on the **same LAN as the terminal**:

- Polls ISAPI attendance punches and posts them to Centrix
- **On PC boot, catch-up is automatic** — punches stay on the terminal while the agent is off; when Windows starts the service, it pulls the backlog and posts it
- **Proxies all Manage Hikvision ISAPI commands** from Centrix cloud (users, cards, fingerprints, test connection, sync)

```
Hikvision (LAN)  ←ISAPI—  Attendance Agent  —HTTPS→  Centrix Cloud
                              ↑
                    Manage Hikvision UI sends commands;
                    agent executes them locally every ~5s
```

**Recommended:** download a **preconfigured zip** from Centrix → **HR → Attendance clock-in** → **Download agent zip**.

**Full on-site checklist:** see [SETUP.md](./SETUP.md).

## Requirements

- Node.js 20+
- PC on the same network as the Hikvision device
- Device registered in Centrix HR → Attendance clock-in

## Quick install (from Admin download)

1. Unzip `CentrixAttendanceAgent-….zip` (prefer `C:\Centrix\attendance-agent`).
2. Install Node.js 20+ if needed: https://nodejs.org/
3. Double-click **`install-windows.bat`** and accept the Administrator prompt.
4. Windows installs the **CentrixAttendanceAgent** service (Automatic delayed start). It runs in the background and starts with Windows.

Test connection later: **`open-settings.bat`**. Change IP or password in Centrix Administration, then download the agent again. Remove: **`uninstall-windows.bat`** (Administrator).

## Manual setup

```bash
cd attendance-agent
# config.json should already exist from the Centrix download
npm run doctor
npm start
```
