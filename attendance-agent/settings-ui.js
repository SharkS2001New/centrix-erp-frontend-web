#!/usr/bin/env node
/**
 * First-run / repair settings UI (local browser).
 * Opens http://127.0.0.1:9251 — fill Hikvision LAN IP / password and save.
 */

import http from "node:http";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  SETTINGS_UI_PORT,
  SETTINGS_UI_URL,
  ensureConfigFile,
  normalizeConfig,
  saveConfig,
  publicConfigView,
  isConfigReady,
} from "./config-lib.js";
import {
  deviceBaseUrl,
  fetchWithDigest,
  fetchAcsEvents,
  fetchHikvisionLocalTime,
  searchHikvisionUsers,
  AGENT_VERSION,
  centrixAuthHeaders,
  centrixDeviceBase,
} from "./isapi-lib.js";

function acsEventList(result) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.events) ? result.events : [];
}

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === "win32") {
    cmd = `cmd /c start "" "${url}"`;
  } else if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, () => {});
}

function htmlPage(installer = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Centrix Attendance Agent — ${installer ? "Install" : "Settings"}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --accent: #185fa5;
      --accent-soft: #e8f1f8;
      --ok: #166534;
      --ok-bg: #dcfce7;
      --warn: #92400e;
      --warn-bg: #fef3c7;
      --err: #991b1b;
      --err-bg: #fee2e2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--text);
      background:
        radial-gradient(1200px 500px at 10% -10%, #1e3a5f 0%, transparent 55%),
        radial-gradient(900px 400px at 100% 0%, #0ea5e9 0%, transparent 40%),
        var(--bg);
    }
    .wrap { max-width: 640px; margin: 0 auto; padding: 32px 16px 48px; }
    .brand {
      color: #e2e8f0;
      font-size: 13px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    h1 {
      color: #f8fafc;
      font-size: 28px;
      font-weight: 650;
      margin: 0 0 8px;
      letter-spacing: -0.02em;
    }
    .lead { color: #94a3b8; margin: 0 0 24px; line-height: 1.5; font-size: 15px; }
    .card {
      background: var(--card);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,.25);
    }
    .banner {
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 13px;
      line-height: 1.45;
      margin-bottom: 20px;
    }
    .banner.warn { background: var(--warn-bg); color: var(--warn); }
    .banner.ok { background: var(--ok-bg); color: var(--ok); }
    .banner.err { background: var(--err-bg); color: var(--err); }
    .grid { display: grid; gap: 14px; }
    @media (min-width: 560px) {
      .grid.two { grid-template-columns: 1fr 1fr; }
    }
    label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }
    input[type="text"], input[type="password"], input[type="number"], input[type="url"] {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      outline: none;
    }
    input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .check {
      display: flex; align-items: center; gap: 8px;
      font-size: 14px; color: #334155; margin-top: 4px;
    }
    .hint { font-size: 12px; color: var(--muted); margin-top: 6px; line-height: 1.4; }
    .section {
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid var(--border);
    }
    .section h2 { margin: 0 0 12px; font-size: 15px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
    button {
      border: 0;
      border-radius: 10px;
      padding: 11px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button.primary { background: var(--accent); color: #fff; }
    button.primary:disabled { opacity: .55; cursor: wait; }
    button.secondary { background: #f1f5f9; color: #0f172a; }
    #status { margin-top: 16px; font-size: 13px; white-space: pre-wrap; line-height: 1.45; }
    code { font-size: 12px; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">Centrix ERP</div>
    <h1>${installer ? "Install Attendance Agent" : "Attendance Agent settings"}</h1>
    <p class="lead">
      ${installer
        ? "Review every connection detail on this office PC, then save and test. After that, Windows will run the agent as an always-on service."
        : "First-run setup for this office PC. Centrix cloud cannot reach a LAN fingerprint terminal — this agent bridges them. Prefills come from Administration → Attendance clock-in."}
    </p>
    <div class="card">
      <div id="banner" class="banner warn" hidden></div>
      <form id="form" class="grid">
        <div>
          <label for="centrixApiUrl">Centrix API URL</label>
          <input id="centrixApiUrl" name="centrixApiUrl" type="url" autocomplete="off" />
          <p class="hint">Usually prefilled from your Centrix download (ends with <code>/api/v1</code>).</p>
        </div>
        <div>
          <label for="centrixToken">Centrix agent token</label>
          <input id="centrixToken" name="centrixToken" type="password" autocomplete="off" placeholder="Paste or keep downloaded token" />
          <p class="hint">Leave blank to keep the existing token.</p>
        </div>
        <div class="grid two">
          <div>
            <label for="deviceNo">Device number</label>
            <input id="deviceNo" name="deviceNo" type="text" placeholder="TERMINAL-01" autocomplete="off" />
          </div>
          <div>
            <label for="deviceId">Centrix device ID</label>
            <input id="deviceId" name="deviceId" type="number" min="1" step="1" />
            <p class="hint">Prefills from the Admin download. Needed so Manage Hikvision can proxy through this agent.</p>
          </div>
          <div>
            <label for="pollIntervalSeconds">Local fallback poll (seconds)</label>
            <input id="pollIntervalSeconds" name="pollIntervalSeconds" type="number" min="60" step="30" />
            <p class="hint">Used until Centrix tells the agent its schedule (default 1 hour).</p>
          </div>
          <div>
            <label for="lookbackMinutes">First-start lookback (minutes)</label>
            <input id="lookbackMinutes" name="lookbackMinutes" type="number" min="5" step="5" />
            <p class="hint">Used only when this PC has never synced. After that, catch-up starts from the last punch sent. Default 10080 = 7 days. Punches stay on the terminal; the agent posts them automatically when this service starts.</p>
          </div>
        </div>

        <div class="section">
          <h2>Hikvision terminal (LAN)</h2>
          <div class="grid two">
            <div>
              <label for="host">Device LAN IP</label>
              <input id="host" name="host" type="text" placeholder="192.168.1.50" required autocomplete="off" />
            </div>
            <div>
              <label for="port">Port</label>
              <input id="port" name="port" type="number" min="1" max="65535" />
              <p class="hint">Hikvision HTTP ISAPI uses <strong>80</strong>, not 8000.</p>
            </div>
            <div>
              <label for="username">Username</label>
              <input id="username" name="username" type="text" autocomplete="off" />
            </div>
            <div>
              <label for="password">Password</label>
              <input id="password" name="password" type="password" autocomplete="new-password" />
            </div>
          </div>
          <label class="check"><input id="useHttps" name="useHttps" type="checkbox" /> Device uses HTTPS on LAN</label>
          <p class="hint">PC and terminal must be on the same network. Enroll people with the same ID as Centrix employee code.</p>
        </div>

        <div class="section" id="fpSection">
          <h2>Test fingerprint (local)</h2>
          <p class="hint" style="margin-bottom:12px">
            Click <strong>Check fingerprint now</strong>, wait for the countdown, then place
            the finger. Only a punch during those 90 seconds counts. Enroll people on the
            terminal as <strong>0003</strong> (the number only — not EMP#0003).
          </p>
          <div class="actions" style="margin-top:0">
            <button type="submit" class="primary" name="fpPush" value="0" formaction="/fp-test" formmethod="post">Check fingerprint now</button>
            <button type="submit" class="secondary" name="fpPush" value="1" formaction="/fp-test" formmethod="post">Check &amp; send to Centrix</button>
          </div>
          <div id="fpStatus" style="margin-top:12px;font-size:13px;white-space:pre-wrap;line-height:1.45"></div>
        </div>

        <div class="actions">
          ${installer
            ? `<button type="button" class="primary" id="testBtn">Save, test &amp; continue</button>
          <button type="submit" class="secondary" id="saveBtn">Save without testing</button>`
            : `<button type="submit" class="primary" id="saveBtn">Save settings</button>
          <button type="button" class="secondary" id="testBtn">Save &amp; test connection</button>`}
        </div>
        <div id="status"></div>
      </form>
    </div>
  </div>
  <script>
    const el = (id) => document.getElementById(id);
    const installer = ${installer ? "true" : "false"};
    let existingToken = "";

    function setBanner(type, text) {
      const b = el("banner");
      if (!text) { b.hidden = true; return; }
      b.hidden = false;
      b.className = "banner " + type;
      b.textContent = text;
    }

    function fill(cfg) {
      existingToken = cfg.centrixToken || "";
      el("centrixApiUrl").value = cfg.centrixApiUrl || "";
      el("centrixToken").value = "";
      el("centrixToken").placeholder = cfg.hasCentrixToken
        ? "Token on file — leave blank to keep (" + (cfg.centrixTokenMasked || "saved") + ")"
        : "Required — re-download agent from Centrix Admin if missing";
      el("deviceNo").value = cfg.deviceNo || "";
      el("deviceId").value = cfg.deviceId || "";
      el("pollIntervalSeconds").value = cfg.pollIntervalSeconds || 3600;
      el("lookbackMinutes").value = cfg.lookbackMinutes || 10080;
      el("host").value = (cfg.hikvision && cfg.hikvision.host) || "";
      el("port").value = (cfg.hikvision && cfg.hikvision.port) || 80;
      el("username").value = (cfg.hikvision && cfg.hikvision.username) || "admin";
      el("password").value = (cfg.hikvision && cfg.hikvision.password) || "";
      el("useHttps").checked = Boolean(cfg.hikvision && cfg.hikvision.useHttps);
      if (cfg.ready) {
        setBanner("ok", installer
          ? "Prefills look complete. Confirm the LAN IP, port 80, and device password, then Save, test & continue."
          : "Configuration looks complete. You can still edit settings below.");
      } else {
        setBanner("warn", "Fill every connection field below, then Save. Missing: " + (cfg.missing || []).join(", "));
      }
    }

    function readForm() {
      return {
        centrixApiUrl: el("centrixApiUrl").value.trim(),
        centrixToken: el("centrixToken").value.trim() || existingToken,
        deviceNo: el("deviceNo").value.trim(),
        deviceId: el("deviceId").value ? Number(el("deviceId").value) : null,
        pollIntervalSeconds: Number(el("pollIntervalSeconds").value) || 3600,
        lookbackMinutes: Number(el("lookbackMinutes").value) || 10080,
        hikvision: {
          host: el("host").value.trim(),
          port: Number(el("port").value) || 80,
          username: el("username").value.trim() || "admin",
          password: el("password").value,
          useHttps: el("useHttps").checked,
        },
      };
    }

    async function load() {
      const res = await fetch("/api/config");
      const cfg = await res.json();
      fill(cfg);
    }

    async function save(test) {
      const status = el("status");
      const saveBtn = el("saveBtn");
      const testBtn = el("testBtn");
      saveBtn.disabled = true;
      testBtn.disabled = true;
      status.textContent = test ? "Saving and testing…" : "Saving…";
      status.style.color = "#64748b";
      try {
        const body = readForm();
        const res = await fetch(test ? "/api/save-and-test" : "/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Save failed");
        fill(data.config || data);
        if (test && data.test) {
          status.textContent = data.test.ok
            ? "Saved. Connection test passed.\\n" + (data.test.detail || "")
            : "Saved, but test failed:\\n" + (data.test.detail || "");
          status.style.color = data.test.ok ? "#166534" : "#991b1b";
          setBanner(data.test.ok ? "ok" : "err", data.test.ok
            ? (installer
              ? "Ready. Closing this window and installing the Windows service…"
              : "Ready. Close this window and run install-windows.bat (or npm start).")
            : "Fix the issues below, then test again.");
        } else {
          status.textContent = installer
            ? "Saved. Click Save, test & continue to install the service."
            : "Saved. Run install-windows.bat or npm start when ready.";
          status.style.color = "#166534";
          setBanner("ok", "Settings saved.");
        }
      } catch (err) {
        status.textContent = err.message || String(err);
        status.style.color = "#991b1b";
      } finally {
        saveBtn.disabled = false;
        testBtn.disabled = false;
      }
    }

    el("form").addEventListener("submit", (e) => {
      const dest = e.submitter && e.submitter.getAttribute("formaction");
      if (dest === "/fp-test") {
        const status = el("fpStatus");
        status.textContent = "Starting 90-second wait — place your finger on the terminal after the next page opens.";
        status.style.color = "#64748b";
        return;
      }
      e.preventDefault();
      void save(false);
    });
    el("testBtn").addEventListener("click", () => void save(true));
    load().catch((err) => setBanner("err", err.message || String(err)));
  </script>
</body>
</html>`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return JSON.parse(raw);
}

function configFromPostedBody(body, current) {
  const hikIn = body.hikvision && typeof body.hikvision === "object" ? body.hikvision : {};
  const postedPassword = String(hikIn.password ?? body.password ?? "");
  const useHttpsRaw = hikIn.useHttps ?? body.useHttps;
  const useHttps =
    useHttpsRaw === true ||
    useHttpsRaw === "on" ||
    useHttpsRaw === "1" ||
    useHttpsRaw === "true";
  return normalizeConfig({
    ...current,
    centrixApiUrl: body.centrixApiUrl || current.centrixApiUrl,
    centrixToken: String(body.centrixToken || "").trim() || current.centrixToken,
    deviceNo: body.deviceNo || current.deviceNo,
    deviceId: body.deviceId || current.deviceId,
    pollIntervalSeconds: body.pollIntervalSeconds || current.pollIntervalSeconds,
    lookbackMinutes: body.lookbackMinutes || current.lookbackMinutes,
    hikvision: {
      ...current.hikvision,
      host: hikIn.host || body.host || current.hikvision.host,
      port: hikIn.port || body.port || current.hikvision.port,
      username: hikIn.username || body.username || current.hikvision.username,
      password: postedPassword || current.hikvision.password,
      useHttps: useHttpsRaw == null || useHttpsRaw === "" ? current.hikvision.useHttps : useHttps,
    },
  });
}

function fingerprintResultHtml(result) {
  const ok = Boolean(result?.ok);
  const detail = String(result?.detail || "No detail")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>Fingerprint test</title>
<style>
  body { font-family: Segoe UI, sans-serif; background:#0f172a; color:#e2e8f0; margin:0; padding:32px; }
  .card { max-width:720px; margin:0 auto; background:#1e293b; border-radius:12px; padding:24px; }
  pre { white-space:pre-wrap; line-height:1.45; background:#0f172a; padding:16px; border-radius:8px; }
  a { color:#93c5fd; }
  .ok { color:#86efac; }
  .bad { color:#fca5a5; }
</style></head>
<body><div class="card">
  <p class="${ok ? "ok" : "bad"}"><strong>${ok ? "Fingerprint test" : "Fingerprint test failed"}</strong></p>
  <pre>${detail}</pre>
  <p><a href="/">Back to settings</a></p>
  <p style="opacity:.7;font-size:13px">If this page is blank or the browser errors, run <code>test-fingerprint.bat</code> in the agent folder — the Command window shows the real Hikvision error.</p>
</div></body></html>`;
}

const fingerprintWaits = new Map();

function eventKey(event) {
  return `${event.serial_no || ""}|${event.employee_no}|${event.punched_at}`;
}

function fingerprintWaitingHtml(secondsLeft, waitId, host) {
  const left = Math.max(0, Number(secondsLeft) || 0);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta http-equiv="refresh" content="3;url=/fp-wait?id=${encodeURIComponent(waitId)}" />
<title>Waiting for fingerprint</title>
<style>
  body { font-family: Segoe UI, sans-serif; background:#0f172a; color:#e2e8f0; margin:0; padding:32px; text-align:center; }
  .card { max-width:640px; margin:0 auto; background:#1e293b; border-radius:12px; padding:32px; }
  .secs { font-size:64px; font-weight:700; color:#93c5fd; margin:16px 0; }
  a { color:#93c5fd; }
</style></head>
<body><div class="card">
  <h1>Place your finger on the terminal now</h1>
  <p>Device ${host || ""} — wait for the accept beep. This page stays open for 90 seconds.</p>
  <p class="secs">${left}s</p>
  <p>Checking every 3 seconds. Do not close this tab.</p>
  <p><a href="/">Cancel — back to settings</a></p>
</div></body></html>`;
}

async function snapshotEventKeys(config) {
  return new Set();
}

async function startFingerprintWait(config, push) {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const startedAt = Date.now();
  fingerprintWaits.set(id, {
    push: Boolean(push),
    deadline: startedAt + 90_000,
    startedAt,
    keys: new Set(),
    host: config.hikvision?.host || "",
  });
  return id;
}

function isLivePunch(event, startedAt) {
  const t = Date.parse(event.punched_at);
  if (Number.isNaN(t)) return true;
  return t >= startedAt - 15_000;
}

async function applyFoundPunch(config, latest, push, events) {
  const lines = [
    `Found ${events.length} new event(s); latest:`,
    `  employee: ${latest.employee_no}`,
    `  time:     ${latest.punched_at}`,
    `  verify:   ${latest.verification_method || "—"}`,
    `  status:   ${latest.attendance_status || "—"}`,
  ];
  if (!push) {
    return { ok: true, detail: lines.join("\n"), latest, events };
  }
  if (!config.deviceId || !config.centrixApiUrl || !config.centrixToken) {
    lines.push("Cannot push: Centrix deviceId / API URL / token missing.");
    return { ok: false, detail: lines.join("\n"), latest, events };
  }
  const url = `${centrixDeviceBase(config)}/agent/ingest-events`;
  const res = await fetch(url, {
    method: "POST",
    headers: centrixAuthHeaders(config),
    body: JSON.stringify({
      agent_version: AGENT_VERSION,
      events: [
        {
          employee_no: latest.employee_no,
          employee_name: latest.employee_name,
          punched_at: latest.punched_at,
          attendance_status: latest.attendance_status,
          verification_method: latest.verification_method,
          card_no: latest.card_no,
          serial_no: latest.serial_no,
          major: latest.major,
          minor: latest.minor,
          raw: latest.raw,
        },
      ],
    }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    lines.push(`Centrix ingest failed HTTP ${res.status}: ${text.slice(0, 200)}`);
    return { ok: false, detail: lines.join("\n"), latest, events };
  }
  lines.push(
    `Sent to Centrix — stored=${json?.stored ?? 0} applied=${json?.applied ?? 0} skipped=${json?.skipped ?? 0}`,
  );
  return { ok: true, detail: lines.join("\n"), latest, events, ingest: json };
}

async function diagnoseNoNewPunch(config, { startedAt, host } = {}) {
  const lines = [];
  const pcNow = new Date();
  lines.push("Could not see a NEW punch during the 90-second wait. Diagnosis:");
  lines.push(`PC time: ${pcNow.toLocaleString()}`);

  try {
    const time = await fetchHikvisionLocalTime(config);
    if (time.date) {
      const skewMin = Math.round(Math.abs(time.date.getTime() - pcNow.getTime()) / 60000);
      lines.push(`Terminal clock: ${time.date.toLocaleString()} (${time.raw})`);
      if (skewMin > 10) {
        lines.push(
          `ISSUE: Terminal clock is wrong — about ${skewMin} minute(s) off this PC. Punches fall outside the search window.`,
        );
        lines.push("FIX: On the Hikvision, set Date/Time to match this PC (or turn on NTP). Then test again.");
      } else {
        lines.push(`Terminal clock matches this PC (within ${Math.max(0, skewMin)} min). Not a clock-skew issue.`);
      }
    } else {
      lines.push(`Terminal clock could not be parsed. Raw: ${time.raw || "empty"}`);
    }
  } catch (err) {
    lines.push(`Could not read terminal clock: ${err.message}`);
  }

  let users = [];
  let userTotal = 0;
  try {
    const found = await searchHikvisionUsers(config, 20);
    users = found.users;
    userTotal = found.total;
    if (userTotal < 1) {
      lines.push("ISSUE: Person is not enrolled on the terminal (0 people / no employee ID).");
        lines.push(
          "FIX: On the device, add person ID 0003 (digits only, matching Centrix), enroll their fingerprint, then retry during the countdown.",
        );
    } else {
      const sample = users
        .filter((u) => u.employeeNo)
        .slice(0, 5)
        .map((u) => u.employeeNo + (u.name ? ` (${u.name})` : ""))
        .join(", ");
      lines.push(`Terminal has ${userTotal} enrolled person(s)${sample ? `: ${sample}` : ""}.`);
    }
  } catch (err) {
    lines.push(`Could not list enrolled people: ${err.message}`);
  }

  let dayEvents = [];
  try {
    dayEvents = acsEventList(
      await fetchAcsEvents(config, new Date(pcNow.getTime() - 24 * 60 * 60 * 1000), pcNow),
    );
  } catch (err) {
    lines.push(`Could not list punches from the last 24 hours: ${err.message}`);
  }

  if (dayEvents.length) {
    const latest = dayEvents[dayEvents.length - 1];
    lines.push(
      `Latest punch already on the device: employee ${latest.employee_no} at ${latest.punched_at} (${latest.verification_method || "unknown verify"}).`,
    );
    const latestDate = new Date(latest.punched_at);
    if (!Number.isNaN(latestDate.getTime()) && startedAt && latestDate.getTime() < startedAt - 5000) {
      lines.push(
        "ISSUE: Finger was placed before you clicked (or the beep was earlier than this wait). That punch is too old for this test.",
      );
      lines.push(
        "FIX: Click Check fingerprint now first, wait until you see the countdown page, THEN place your finger and wait for the accept beep.",
      );
    }
  } else if (userTotal > 0) {
    lines.push("ISSUE: People are enrolled, but there are 0 punches in the last 24 hours.");
    lines.push(
      "FIX: Enroll fingerprint for an ID like 0003, click Check, wait for the countdown, THEN place that finger.",
    );
  }

  if (!lines.some((line) => line.startsWith("ISSUE:"))) {
    lines.push("ISSUE: No new punch arrived during the 90-second countdown.");
    lines.push(
      "FIX: With the countdown still on screen, place an enrolled finger and wait for the green/accept beep — not before clicking, and not after the timer hits 0.",
    );
  }

  lines.push(`Device: ${host || config.hikvision?.host || "?"}`);
  return lines.join("\n");
}

async function pollFingerprintWait(id) {
  const session = fingerprintWaits.get(id);
  if (!session) {
    return { kind: "missing" };
  }
  const config = normalizeConfig(ensureConfigFile());
  const left = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
  const from = new Date(session.startedAt - 10_000);
  const to = new Date();
  let events = [];
  try {
    events = acsEventList(await fetchAcsEvents(config, from, to));
  } catch (err) {
    if (left <= 0) {
      fingerprintWaits.delete(id);
      const detail = await diagnoseNoNewPunch(config, session).catch(() => err.message);
      return { kind: "timeout", host: session.host, detail };
    }
    return { kind: "waiting", left, id, host: session.host };
  }
  const fresh = (events || []).filter(
    (event) => isLivePunch(event, session.startedAt) && !session.keys.has(eventKey(event)),
  );
  if (fresh.length) {
    fingerprintWaits.delete(id);
    const latest = fresh[fresh.length - 1];
    const result = await applyFoundPunch(config, latest, session.push, fresh);
    return { kind: "done", result };
  }
  if (left <= 0) {
    fingerprintWaits.delete(id);
    const detail = await diagnoseNoNewPunch(config, session);
    return { kind: "timeout", host: session.host, detail };
  }
  return { kind: "waiting", left, id, host: session.host };
}

function sendJson(res, status, payload) {
  if (res.headersSent || res.writableEnded) return;
  try {
    res.writeHead(status, {
      "Content-Type": "application/json",
      Connection: "close",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(payload));
  } catch {
    try {
      res.destroy();
    } catch {
      /* ignore */
    }
  }
}

async function quickTest(config) {
  const lines = [];
  let ok = true;
  const hik = config.hikvision || {};
  if (!hik.host) {
    return { ok: false, detail: "Device LAN IP is required." };
  }

  const infoUrl = `${deviceBaseUrl(hik)}/ISAPI/System/deviceInfo`;
  try {
    const res = await fetchWithDigest(infoUrl, {
      method: "GET",
      username: hik.username || "admin",
      password: hik.password || "",
      accept: "application/xml, application/json",
    });
    if (res.status === 401) {
      ok = false;
      lines.push(`Hikvision reachable at ${hik.host}:${hik.port || 80}, but username/password was rejected.`);
    } else if (!res.ok) {
      ok = false;
      const text = await res.text();
      lines.push(`Hikvision deviceInfo HTTP ${res.status}: ${text.slice(0, 200)}`);
    } else {
      const text = await res.text();
      const model = text.match(/<model>([^<]+)</i)?.[1] || text.match(/"model"\s*:\s*"([^"]+)"/)?.[1];
      lines.push(`Hikvision ISAPI OK${model ? ` — ${model}` : ""} at ${infoUrl.replace(/\/ISAPI.*/, "")}`);
    }
  } catch (err) {
    ok = false;
    lines.push(`Cannot reach Hikvision at ${infoUrl}: ${err.message}`);
  }

  if (config.centrixApiUrl && config.centrixToken) {
    try {
      const url = `${config.centrixApiUrl.replace(/\/$/, "")}/auth/me`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.centrixToken}`,
        },
      });
      if (!res.ok) {
        ok = false;
        const text = await res.text();
        lines.push(`Centrix auth failed (${res.status}): ${text.slice(0, 200)}`);
      } else {
        lines.push("Centrix API token accepted.");
      }
    } catch (err) {
      ok = false;
      lines.push(`Centrix API unreachable: ${err.message}`);
    }
  } else {
    ok = false;
    lines.push("Centrix API URL or token missing — re-download the agent from Centrix Admin.");
  }

  if (!config.deviceNo) {
    ok = false;
    lines.push("Device number is required.");
  }
  if (!config.deviceId) {
    ok = false;
    lines.push("Centrix device ID is required — re-download the agent zip from Administration → Attendance clock-in.");
  }

  return { ok, detail: lines.join("\n") };
}

async function testFingerprintLocal(config, { push = false, lookbackSeconds = 900 } = {}) {
  const hik = config.hikvision || {};
  if (!hik.host) {
    return { ok: false, detail: "Device LAN IP is required." };
  }

  // Prove LAN reachability first — AcsEvent failures often hide as "network connection error".
  const infoUrl = `${deviceBaseUrl(hik)}/ISAPI/System/deviceInfo`;
  try {
    const res = await fetchWithDigest(infoUrl, {
      method: "GET",
      username: hik.username || "admin",
      password: hik.password || "",
      accept: "application/xml, application/json",
    });
    if (res.status === 401) {
      return {
        ok: false,
        detail:
          `Reached ${hik.host}:${hik.port || 80}, but username/password was rejected.\n` +
          "Fix Device username/password in settings, Save, then try again.",
      };
    }
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        detail: `Hikvision deviceInfo HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
  } catch (err) {
    return { ok: false, detail: err.message || String(err) };
  }

  const lookback = Math.max(120, Number(lookbackSeconds) || 120);
  const from = new Date(Date.now() - lookback * 1000);
  const to = new Date();
  let events;
  try {
    events = acsEventList(await fetchAcsEvents(config, from, to));
  } catch (err) {
    return {
      ok: false,
      detail:
        `Device is reachable at ${hik.host}, but reading punches failed:\n${err.message || String(err)}`,
    };
  }
  if (!events.length) {
    return {
      ok: false,
      detail:
        `Reached ${hik.host} (ISAPI OK) but found 0 punches in the last ${Math.round(lookback / 60)} minutes.\n` +
        "Do this in order:\n" +
        "1. Enroll the person on the terminal (same ID as Centrix employee code).\n" +
        "2. Place a finger, wait for the green/accept beep.\n" +
        "3. Click Check fingerprint now within a minute.\n" +
        "If you already beeped, the terminal clock may not match this PC — check the date/time on the Hikvision.",
    };
  }

  const fingerprintEvents = events.filter((e) =>
    String(e.verification_method || "")
      .toLowerCase()
      .includes("finger"),
  );
  const latest = fingerprintEvents[fingerprintEvents.length - 1] || events[events.length - 1];
  const lines = [
    `Found ${events.length} event(s); latest:`,
    `  employee: ${latest.employee_no}`,
    `  time:     ${latest.punched_at}`,
    `  verify:   ${latest.verification_method || "—"}`,
    `  status:   ${latest.attendance_status || "—"}`,
  ];

  if (!push) {
    return { ok: true, detail: lines.join("\n"), latest, events };
  }

  if (!config.deviceId || !config.centrixApiUrl || !config.centrixToken) {
    lines.push("Cannot push: Centrix deviceId / API URL / token missing.");
    return { ok: false, detail: lines.join("\n"), latest, events };
  }

  const url = `${centrixDeviceBase(config)}/agent/ingest-events`;
  const res = await fetch(url, {
    method: "POST",
    headers: centrixAuthHeaders(config),
    body: JSON.stringify({
      agent_version: AGENT_VERSION,
      events: [
        {
          employee_no: latest.employee_no,
          employee_name: latest.employee_name,
          punched_at: latest.punched_at,
          attendance_status: latest.attendance_status,
          verification_method: latest.verification_method,
          card_no: latest.card_no,
          serial_no: latest.serial_no,
          major: latest.major,
          minor: latest.minor,
          raw: latest.raw,
        },
      ],
    }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    lines.push(`Centrix ingest failed HTTP ${res.status}: ${text.slice(0, 200)}`);
    return { ok: false, detail: lines.join("\n"), latest, events };
  }
  lines.push(
    `Sent to Centrix — stored=${json?.stored ?? 0} applied=${json?.applied ?? 0} skipped=${json?.skipped ?? 0}`,
  );
  return { ok: true, detail: lines.join("\n"), latest, events, ingest: json };
}

/**
 * @param {{ openBrowser?: boolean, waitUntilReady?: boolean, installer?: boolean, keepOpen?: boolean }} [options]
 * @returns {Promise<{ ready: boolean, alreadyRunning?: boolean }>}
 */
export function runSettingsUi(options = {}) {
  const open = options.openBrowser !== false;
  const waitUntilReady = Boolean(options.waitUntilReady);
  const installer = Boolean(options.installer);
  const keepOpen = Boolean(options.keepOpen);

  return new Promise((resolve, reject) => {
    ensureConfigFile();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (!keepOpen) {
        try {
          server.close();
        } catch {
          /* ignore */
        }
      }
      resolve(result);
    };

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", SETTINGS_UI_URL);

        if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(htmlPage(installer));
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/config") {
          const view = publicConfigView(ensureConfigFile());
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify(view));
          return;
        }

        if (req.method === "GET" && url.pathname === "/fp-wait") {
          const id = url.searchParams.get("id") || "";
          const poll = await pollFingerprintWait(id);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          if (poll.kind === "done") {
            res.end(fingerprintResultHtml(poll.result));
            return;
          }
          if (poll.kind === "waiting") {
            res.end(fingerprintWaitingHtml(poll.left, poll.id, poll.host));
            return;
          }
          if (poll.kind === "timeout") {
            res.end(
              fingerprintResultHtml({
                ok: false,
                detail: poll.detail || `No new punch from ${poll.host || "the terminal"} in 90 seconds.`,
              }),
            );
            return;
          }
          res.end(
            fingerprintResultHtml({
              ok: false,
              detail: "This wait session expired. Go back to settings and click Check fingerprint now again.",
            }),
          );
          return;
        }

        if (req.method === "GET" && url.pathname === "/fp-test") {
          const push = url.searchParams.get("push") === "1";
          const config = normalizeConfig(ensureConfigFile());
          const id = await startFingerprintWait(config, push);
          res.writeHead(302, { Location: `/fp-wait?id=${encodeURIComponent(id)}` });
          res.end();
          return;
        }

        if (
          req.method === "POST" &&
          (url.pathname === "/fp-test" || url.pathname === "/api/test-fingerprint")
        ) {
          const body = await readBody(req);
          const current = normalizeConfig(ensureConfigFile());
          const merged = configFromPostedBody(body, current);
          let config = merged;
          try {
            config = saveConfig(merged);
          } catch {
            /* still test even if Program Files config is not writable */
          }
          const push =
            body.push === true ||
            body.push === "1" ||
            body.fpPush === "1" ||
            body.fpPush === 1;
          const wantsHtml =
            url.pathname === "/fp-test" ||
            String(req.headers.accept || "").includes("text/html");
          const id = await startFingerprintWait(config, push);
          if (wantsHtml) {
            res.writeHead(302, { Location: `/fp-wait?id=${encodeURIComponent(id)}` });
            res.end();
            return;
          }
          sendJson(res, 200, { ok: true, wait_id: id, wait_url: `/fp-wait?id=${id}` });
          return;
        }

        if (
          req.method === "POST" &&
          (url.pathname === "/api/config" || url.pathname === "/api/save-and-test")
        ) {
          const body = await readBody(req);
          const current = normalizeConfig(ensureConfigFile());
          if (!String(body.centrixToken || "").trim() && current.centrixToken) {
            body.centrixToken = current.centrixToken;
          }
          if (
            body.hikvision &&
            !String(body.hikvision.password || "") &&
            current.hikvision.password
          ) {
            body.hikvision.password = current.hikvision.password;
          }
          const saved = saveConfig({
            ...current,
            ...body,
            hikvision: { ...current.hikvision, ...(body.hikvision || {}) },
          });
          const view = publicConfigView(saved);
          const payload = { ...view, config: view, ready: view.ready };
          if (url.pathname === "/api/save-and-test") {
            payload.test = await quickTest(saved);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
          const testedOk = url.pathname === "/api/save-and-test" && payload.test?.ok;
          if (waitUntilReady && view.ready && (testedOk || (url.pathname === "/api/config" && !installer))) {
            setTimeout(() => finish({ ready: true }), testedOk ? 1200 : 400);
          }
          return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      } catch (err) {
        sendJson(res, 500, { ok: false, message: err.message || String(err) });
      }
    });

    server.requestTimeout = 600000;
    server.headersTimeout = 600000;
    server.timeout = 600000;

    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(`[attendance-agent] Settings UI port ${SETTINGS_UI_PORT} is already in use.`);
        console.error(`Open ${SETTINGS_UI_URL} in your browser, or close the other settings window.`);
        if (open) openBrowser(SETTINGS_UI_URL);
        finish({ ready: isConfigReady(ensureConfigFile()), alreadyRunning: true });
        return;
      }
      reject(err);
    });

    server.listen(SETTINGS_UI_PORT, "127.0.0.1", () => {
      console.log(`[attendance-agent] Settings UI: ${SETTINGS_UI_URL}`);
      if (waitUntilReady) {
        console.log(
          installer
            ? "Browser opened. Confirm connection details, then click Save, test & continue."
            : "Save settings in the browser — this window continues automatically when ready.",
        );
      } else {
        console.log("Fill the form in your browser, then Save. Press Ctrl+C here when finished.");
      }
      if (open) openBrowser(SETTINGS_UI_URL);
    });

    const shutdown = () => {
      if (keepOpen) return;
      finish({ ready: isConfigReady(ensureConfigFile()) });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun && process.argv.includes("--fingerprint")) {
  const push = process.argv.includes("--push");
  const config = normalizeConfig(ensureConfigFile());
  console.log("Place your finger on the Hikvision terminal NOW.");
  console.log("Waiting 90 seconds for a new punch...");
  snapshotEventKeys(config)
    .then(async () => {
      const startedAt = Date.now();
      const deadline = startedAt + 90_000;
      while (Date.now() < deadline) {
        const left = Math.ceil((deadline - Date.now()) / 1000);
        process.stdout.write(`\r${left}s left — place finger now...   `);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        let events = [];
        try {
          events = acsEventList(await fetchAcsEvents(config, new Date(startedAt - 10_000), new Date()));
        } catch (err) {
          process.stdout.write(`\n${err.message}\n`);
          continue;
        }
        const fresh = (events || []).filter((event) => isLivePunch(event, startedAt));
        if (fresh.length) {
          const result = await applyFoundPunch(config, fresh[fresh.length - 1], push, fresh);
          console.log(`\n${result.detail || (result.ok ? "OK" : "Failed")}`);
          process.exit(result.ok ? 0 : 1);
        }
      }
      const diagnosis = await diagnoseNoNewPunch(config, {
        startedAt,
        host: config.hikvision?.host,
      });
      console.log(`\n${diagnosis}`);
      process.exit(1);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
} else if (isDirectRun) {
  runSettingsUi({ openBrowser: true, keepOpen: true }).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
