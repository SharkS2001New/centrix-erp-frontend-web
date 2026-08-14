#!/usr/bin/env node
/**
 * First-run / repair settings UI (local browser).
 * Opens http://127.0.0.1:9251 — fill Hikvision LAN IP / password and save.
 */

import http from "node:http";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  AGENT_VERSION,
  centrixAuthHeaders,
  centrixDeviceBase,
} from "./isapi-lib.js";

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
            <label for="pollIntervalSeconds">Attendance poll (seconds)</label>
            <input id="pollIntervalSeconds" name="pollIntervalSeconds" type="number" min="60" step="30" />
          </div>
          <div>
            <label for="lookbackMinutes">Lookback (minutes)</label>
            <input id="lookbackMinutes" name="lookbackMinutes" type="number" min="5" step="5" />
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
            Place a finger on the Hikvision terminal, then click the button. This reads events from the
            device on this LAN and can push the punch to Centrix immediately.
          </p>
          <div class="actions" style="margin-top:0">
            <button type="button" class="primary" id="fpBtn">Check fingerprint now</button>
            <button type="button" class="secondary" id="fpPushBtn">Check &amp; send to Centrix</button>
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
      el("pollIntervalSeconds").value = cfg.pollIntervalSeconds || 60;
      el("lookbackMinutes").value = cfg.lookbackMinutes || 360;
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
        pollIntervalSeconds: Number(el("pollIntervalSeconds").value) || 60,
        lookbackMinutes: Number(el("lookbackMinutes").value) || 360,
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

    el("form").addEventListener("submit", (e) => { e.preventDefault(); void save(false); });
    el("testBtn").addEventListener("click", () => void save(true));

    async function runFingerprintTest(push) {
      const status = el("fpStatus");
      const fpBtn = el("fpBtn");
      const fpPushBtn = el("fpPushBtn");
      fpBtn.disabled = true;
      fpPushBtn.disabled = true;
      status.textContent = push
        ? "Reading terminal and sending to Centrix…"
        : "Reading recent punches from the terminal…";
      status.style.color = "#64748b";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      try {
        const res = await fetch("/api/test-fingerprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...readForm(),
            push: Boolean(push),
            lookback_seconds: 120,
          }),
          signal: ctrl.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || data.message || "Fingerprint test failed");
        status.textContent = data.detail || (data.ok ? "OK" : "No punch found");
        status.style.color = data.ok ? "#166534" : "#92400e";
        setBanner(data.ok ? "ok" : "warn", data.ok
          ? (push ? "Punch found and sent to Centrix (if configured)." : "Punch found on the terminal.")
          : (data.detail || "No recent punch. Place a finger on the terminal, wait for the beep, then try again."));
      } catch (err) {
        const raw = err && err.name === "AbortError"
          ? "Timed out after 90s waiting for the terminal. Check LAN IP / port 80, then try again."
          : (err && err.message ? String(err.message) : String(err));
        const msg = /failed to fetch|networkerror|network error when attempting to fetch/i.test(raw)
          ? "The settings window closed or the local agent restarted before the test finished. Leave this black Command window open, then click Check fingerprint now again."
          : raw;
        status.textContent = msg;
        status.style.color = "#991b1b";
        setBanner("err", msg);
      } finally {
        clearTimeout(timer);
        fpBtn.disabled = false;
        fpPushBtn.disabled = false;
      }
    }

    el("fpBtn").addEventListener("click", () => void runFingerprintTest(false));
    el("fpPushBtn").addEventListener("click", () => void runFingerprintTest(true));
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
  return JSON.parse(raw);
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

async function testFingerprintLocal(config, { push = false, lookbackSeconds = 120 } = {}) {
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

  const from = new Date(Date.now() - Math.max(15, lookbackSeconds) * 1000);
  const to = new Date();
  let events;
  try {
    events = await fetchAcsEvents(config, from, to);
  } catch (err) {
    return {
      ok: false,
      detail:
        `Device is reachable, but reading punches failed:\n${err.message || String(err)}\n` +
        "Place a finger on the terminal, wait for the beep, then try again.",
    };
  }
  if (!events.length) {
    return {
      ok: false,
      detail:
        `No events from ${hik.host} in the last ${lookbackSeconds}s.\n` +
        "Place a finger on the terminal, wait for acceptance, then try again.",
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
 * @param {{ openBrowser?: boolean, waitUntilReady?: boolean, installer?: boolean }} [options]
 * @returns {Promise<{ ready: boolean, alreadyRunning?: boolean }>}
 */
export function runSettingsUi(options = {}) {
  const open = options.openBrowser !== false;
  const waitUntilReady = Boolean(options.waitUntilReady);
  const installer = Boolean(options.installer);

  return new Promise((resolve, reject) => {
    ensureConfigFile();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        /* ignore */
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

        if (req.method === "POST" && url.pathname === "/api/test-fingerprint") {
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
          const config = saveConfig({
            ...current,
            ...body,
            hikvision: { ...current.hikvision, ...(body.hikvision || {}) },
          });
          try {
            const result = await testFingerprintLocal(config, {
              push: Boolean(body.push),
              lookbackSeconds: Number(body.lookback_seconds) || 120,
            });
            sendJson(res, 200, {
              ok: Boolean(result.ok),
              detail: result.detail || "",
            });
          } catch (err) {
            sendJson(res, 200, { ok: false, detail: err.message || String(err) });
          }
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
          // Never auto-close on a plain /api/config save — fingerprint test used to
          // POST that first, which shut the server down and produced a bogus
          // "lost contact with 127.0.0.1:9251" error.
          const testedOk = url.pathname === "/api/save-and-test" && payload.test?.ok;
          if (waitUntilReady && url.pathname === "/api/save-and-test" && view.ready && testedOk) {
            setTimeout(() => finish({ ready: true }), 1200);
          } else if (waitUntilReady && !installer && url.pathname === "/api/config" && view.ready) {
            setTimeout(() => finish({ ready: true }), 400);
          }
          return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      } catch (err) {
        sendJson(res, 500, { ok: false, message: err.message || String(err) });
      }
    });

    server.requestTimeout = 0;
    server.headersTimeout = 0;
    server.timeout = 0;

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

    const shutdown = () => finish({ ready: isConfigReady(ensureConfigFile()) });
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  runSettingsUi({ openBrowser: true }).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
