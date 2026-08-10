# Centrix Attendance Agent

Local bridge for **cloud Centrix** + **LAN Hikvision** fingerprint terminals.

Centrix in the cloud cannot open `192.168.x.x`. This agent runs on an office PC
(or mini-PC) on the **same LAN as the terminal**, polls ISAPI punches, and posts
them to Centrix over the internet.

```
Hikvision (LAN IP)  ←ISAPI poll—  Attendance Agent  —HTTPS→  Centrix Cloud
```

## Requirements

- Node.js 20+
- PC on the same network as the Hikvision device
- Centrix API URL + a Sanctum token for a user with HR manage permission
- Device registered in Centrix HR → Clock devices (`device_no` must match)

## Setup

```bash
cd attendance-agent
cp config.example.json config.json
# edit config.json
npm start
```

One-shot sync (cron / Task Scheduler):

```bash
npm run once
```

## Windows Task Scheduler (recommended)

1. Create `config.json` as above.
2. Task Scheduler → Create Task → Trigger: every 5 minutes.
3. Action: `node` → Arguments: `C:\path\to\attendance-agent\agent.js --once`
4. Start in: `C:\path\to\attendance-agent`

## Employee IDs

Enroll people on the Hikvision with the same ID as Centrix **employee code**
(`EMP#0001` or `0001`). Fingerprints stay on the device; only punches go to Centrix.

## Config fields

| Field | Meaning |
|-------|---------|
| `centrixApiUrl` | e.g. `https://your-tenant.centrix.app/api/v1` |
| `centrixToken` | Bearer token (`Authorization: Bearer …`) |
| `deviceNo` | Same as registered in Centrix (e.g. `TERMINAL-01`) |
| `hikvision.host` | Local IP, e.g. `192.168.1.50` |
| `hikvision.port` | Usually `80` |
| `hikvision.username` / `password` | Device admin login |
| `pollIntervalSeconds` | Used when running without `--once` (default 300) |
