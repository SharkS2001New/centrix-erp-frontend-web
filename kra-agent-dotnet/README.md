# Centrix KRA Agent (.NET)

Windows service that bridges **Centrix cloud** to **local Comstore** on the shop PC.

## Shop install

Finance → KRA → **Download Centrix KRA Agent** zips this folder with a prefilled `config.json`.

1. Unzip on the shop PC.
2. Right-click **BUILD-AND-INSTALL.bat** → Run as administrator (.NET 8 SDK required once).
3. Start Comstore with Windows (its own service / startup).
4. Open http://127.0.0.1:9261 → Test connection.

## Runtime behaviour

**CentrixKraAgent always keeps running** as a Windows service.

- Heartbeats Centrix on an interval and long-polls for fiscal commands.
- Probes Comstore `GET /api/health` (does **not** start Comstore — configure Windows to start Comstore).
- Pings the Smart VSCU / fiscal hardware IP from Finance settings.
- If Comstore is down, Finance shows “start Comstore manually”; the agent service stays up.

## Optional: stage a binary-only release

```bash
./scripts/stage-release.sh
```

Builds `release/win-x64/` for manual distribution. Finance download still packages the agent source tree by default.
