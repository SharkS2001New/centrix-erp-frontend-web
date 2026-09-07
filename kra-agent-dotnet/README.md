# Centrix KRA Agent (.NET)

Windows service (same model as Centrix Attendance Agent) that bridges **Centrix cloud** to **local Comstore** (`http://127.0.0.1:4000`).

## Latency

- Agent **long-polls** Centrix (`wait_ms=2000`) and wakes as soon as a fiscal command is queued (~50–150ms + internet RTT).
- Cloud waiter polls the DB every **50ms**.
- When the agent is online, checkout **skips the extra health probe** and goes straight to `complete-workflow` (one round-trip).
- Warm path does **not** re-probe Comstore before each fiscal command; auto-start only runs when Comstore is known down or a call fails as unreachable.

## Comstore auto-start

When `autoStartComstore` is `true` (default), the agent:

1. Probes `GET /api/health` on startup, on heartbeat, and after connection failures.
2. If down, starts Comstore via (first success wins):
   - Windows service names in `comstoreWindowsServiceNames` (or built-in names + any service whose name contains `comstore` / `vscu`)
   - `comstoreExecutablePath` (or common install paths under `C:\Comstore`, Program Files, …)
   - optional `comstoreStartCommand` (`cmd /c …`)
3. Waits up to `comstoreReadyTimeoutSeconds` for health to succeed, then retries the fiscal call.

Set an explicit service name or exe path in `config.json` if discovery misses your install.

## Install

1. Centrix → Finance → KRA: enable device + **Use shop PC agent**, set Comstore URL, **Download KRA agent**.
2. Unzip on the shop PC.
3. Right-click **BUILD-AND-INSTALL.bat** → Run as administrator  
   (needs .NET 8 SDK once to publish; installs a self-contained Windows service — no Node.js).
4. Open http://127.0.0.1:9261 → Test connection.

## Uninstall

`uninstall-windows.bat` (Administrator).
