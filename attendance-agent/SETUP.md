# Hikvision → Centrix: finish checklist

Work through these in order. Software (agent + Centrix APIs) is ready; the remaining work is **on-site**.

---

## 1. Device network + ISAPI

On the Hikvision terminal (or via its web UI from a LAN PC):

1. Set a **static LAN IP** (example: `192.168.1.50`).
2. Confirm you can open `http://<LAN-IP>` in a browser on the office network.
3. Enable **ISAPI** (Access Control / Network / Integration — wording varies by firmware).
4. Note **admin username + password** for ISAPI (often the device admin account).
5. Prefer HTTP port **80** unless you deliberately use HTTPS on the device.

**Pass when:** browser login to the device works from the PC that will run the agent.

---

## 2. Register device in Centrix

1. Open Centrix → **Administration → Attendance clock-in** (or Organization settings → HR → Clock-in devices).
2. Click **Cloud + LAN setup guide** if you need the overview.
3. Add device:
   - **Device number:** e.g. `TERMINAL-01` (must match agent `deviceNo`)
   - **Provider:** Hikvision
   - **Host:** LAN IP (for your records / agent config)
   - Port `80`, username `admin`, password if you store it
4. Save — device must show as active.

**Pass when:** device appears in the Clock devices list with your `device_no`.

---

## 3. Align Hikvision person IDs ↔ employee codes

| Centrix (HR → Employees) | Hikvision person / employee No. |
|--------------------------|----------------------------------|
| `EMP#0001` or `0001`     | Same string on the terminal      |

1. In Centrix, open each employee and note **employee code**.
2. On the Hikvision, enroll / edit that person with the **same ID**.
3. Capture fingerprint on the device (templates stay on the terminal).

Centrix matches punches by that code (with or without `EMP#` prefix). Wrong ID = punch skipped.

**Pass when:** at least one test employee has matching IDs on both sides.

---

## 4. Download and install the agent (LAN PC)

### Recommended (preconfigured from Centrix)

1. In Centrix → **Administration → Attendance clock-in**, click **Download agent zip** for the terminal.
2. Unzip on a PC on the **same LAN** as the Hikvision (with internet to Centrix). Prefer `C:\Centrix\attendance-agent`.
3. Install **Node.js 20+** if needed: https://nodejs.org/
4. Double-click **`install-windows.bat`**. A browser opens so you can confirm **all connection details** (Centrix URL, token, device ID, LAN IP, port **80**, username, password). Click **Save, test & continue**.
5. The installer then registers an always-on Windows task (starts at logon/startup, restarts if it crashes).

If you need to change settings later: `open-settings.bat` or `npm run setup`.
To remove the service: `uninstall-windows.bat`.

The zip already includes `config.json` with Centrix API URL, a dedicated agent token, and `deviceId` / `deviceNo`.

### Manual (without Admin zip)

```bash
cd attendance-agent
cp config.example.json config.json
# edit centrixApiUrl, centrixToken, deviceNo, hikvision.*
npm run doctor
npm start         # continuous
# or: npm run once
```

**Pass when:** `npm run doctor` prints all checks passed.

---

## 5. Test one live punch

1. Have the test employee clock **in** on the Hikvision.
2. On the agent PC run `npm run once` (or wait for the running agent cycle).
3. Agent log should show something like: `in EMP#0001 @ …`
4. In Centrix → **HR → Attendance**, confirm the open clock session.

Then clock **out** and confirm the session closes.

**Pass when:** one full in/out appears in Centrix without manual entry.

---

## If something fails

| Symptom | Likely cause |
|---------|----------------|
| Doctor: Hikvision fail | Wrong IP, ISAPI off, firewall, bad password |
| Doctor: auth/me fail | Bad/expired token |
| Doctor: device not found | `deviceNo` ≠ Centrix Clock devices |
| Agent skips employee | Person ID ≠ employee code |
| No events pulled | No punches in lookback window, or AcsEvent filter |

---

## What’s next after go-live

1. Leave the agent on the always-on Windows task / office mini-PC.
2. Enroll remaining staff with matching IDs.
3. Train supervisors to use **HR → Attendance** (not the device UI) for records.
4. Optional later: multi-terminal agents (one config/`deviceNo` per device).
