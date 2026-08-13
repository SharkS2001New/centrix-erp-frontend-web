# Centrix Attendance Agent

Local bridge for **cloud Centrix** + **LAN Hikvision** fingerprint terminals.

Centrix in the cloud cannot open `192.168.x.x`. This agent runs on an office PC
(or mini-PC) on the **same LAN as the terminal**:

- Polls ISAPI attendance punches and posts them to Centrix
- **Proxies all Manage Hikvision ISAPI commands** from Centrix cloud (users, cards, fingerprints, test connection, sync)

```
Hikvision (LAN)  ←ISAPI—  Attendance Agent  —HTTPS→  Centrix Cloud
                              ↑
                    Manage Hikvision UI sends commands;
                    agent executes them locally every ~5s
```

**Recommended:** download a **preconfigured zip** from Centrix → **Administration → Attendance clock-in** → **Download agent**.

**Full on-site checklist:** see [SETUP.md](./SETUP.md).

## Requirements

- Node.js 20+
- PC on the same network as the Hikvision device
- Device registered in Centrix Administration → Attendance clock-in

## Quick install (from Admin download)

1. Unzip `CentrixAttendanceAgent-….zip`
2. Double-click **`open-settings.bat`** — browser settings UI (LAN IP / password)
3. Double-click **`install-windows.bat`** (Task Scheduler every 5 minutes)
4. Re-open settings later: `open-settings.bat` or `npm run setup`

First `npm start` also opens the settings UI if config is incomplete.

## Manual setup

```bash
cd attendance-agent
cp config.example.json config.json   # if needed
npm run setup                        # opens settings UI
npm run doctor
npm start
```

One-shot sync (cron / Task Scheduler):

```bash
npm run once
```
