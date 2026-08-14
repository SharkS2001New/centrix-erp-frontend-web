#!/usr/bin/env node
/**
 * Local status page — Test connection only.
 * Device and Centrix settings come from the Admin download (config.json).
 * Opens http://127.0.0.1:9251
 */

import http from "node:http";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  SETTINGS_UI_PORT,
  SETTINGS_UI_URL,
  ensureConfigFile,
  isConfigReady,
  publicConfigView,
} from "./config-lib.js";
import { deviceBaseUrl, fetchWithDigest, AGENT_VERSION } from "./isapi-lib.js";

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

function htmlPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Centrix Attendance Agent</title>
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
      --err: #991b1b;
      --err-bg: #fee2e2;
      --warn: #92400e;
      --warn-bg: #fef3c7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(1200px 500px at 10% -10%, #1e3a5f 0%, transparent 55%),
        radial-gradient(900px 400px at 100% 0%, #0ea5e9 0%, transparent 40%),
        var(--bg);
    }
    .wrap { max-width: 560px; margin: 0 auto; padding: 32px 16px 48px; }
    .brand { color: #e2e8f0; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 8px; }
    h1 { color: #f8fafc; font-size: 26px; font-weight: 650; margin: 0 0 8px; }
    .lead { color: #94a3b8; margin: 0 0 24px; line-height: 1.5; font-size: 15px; }
    .card {
      background: var(--card);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,.25);
    }
    .banner { border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.45; margin-bottom: 16px; }
    .banner.warn { background: var(--warn-bg); color: var(--warn); }
    .banner.ok { background: var(--ok-bg); color: var(--ok); }
    .banner.err { background: var(--err-bg); color: var(--err); }
    dl { margin: 0 0 18px; display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; font-size: 14px; }
    dt { color: var(--muted); }
    dd { margin: 0; font-weight: 600; }
    button {
      border: 0; border-radius: 10px; padding: 11px 16px;
      font-size: 14px; font-weight: 600; cursor: pointer;
      background: var(--accent); color: #fff;
    }
    button:disabled { opacity: .55; cursor: wait; }
    #status { margin-top: 16px; font-size: 13px; white-space: pre-wrap; line-height: 1.45; }
    .hint { font-size: 12px; color: var(--muted); margin-top: 14px; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">Centrix ERP · v${AGENT_VERSION}</div>
    <h1>Attendance Agent</h1>
    <p class="lead">Connection details were set in Centrix before you downloaded this agent. Use Test connection to confirm the LAN terminal and Centrix API.</p>
    <div class="card">
      <div id="banner" class="banner warn" hidden></div>
      <dl>
        <dt>Device</dt><dd id="deviceNo">—</dd>
        <dt>LAN IP</dt><dd id="host">—</dd>
        <dt>Centrix</dt><dd id="api">—</dd>
      </dl>
      <button type="button" id="testBtn">Test connection</button>
      <div id="status"></div>
      <p class="hint">To change IP, password, or token, update the device in Centrix Administration → Attendance clock-in and download the agent again.</p>
    </div>
  </div>
  <script>
    const el = (id) => document.getElementById(id);
    function setBanner(type, text) {
      const b = el("banner");
      if (!text) { b.hidden = true; return; }
      b.hidden = false;
      b.className = "banner " + type;
      b.textContent = text;
    }
    async function load() {
      const res = await fetch("/api/config");
      const cfg = await res.json();
      el("deviceNo").textContent = cfg.deviceNo || "—";
      el("host").textContent = (cfg.hikvision && cfg.hikvision.host)
        ? cfg.hikvision.host + ":" + (cfg.hikvision.port || 80)
        : "—";
      el("api").textContent = cfg.centrixApiUrl || "—";
      if (cfg.ready) {
        setBanner("ok", "Config from Centrix download looks complete.");
      } else {
        setBanner("warn", "Config incomplete. Re-download CentrixAttendanceAgent from Administration. Missing: " + (cfg.missing || []).join(", "));
      }
    }
    async function test() {
      const btn = el("testBtn");
      const status = el("status");
      btn.disabled = true;
      status.textContent = "Testing Hikvision LAN and Centrix API…";
      status.style.color = "#64748b";
      try {
        const res = await fetch("/api/test-connection", { method: "POST" });
        const data = await res.json();
        status.textContent = data.detail || (data.ok ? "OK" : "Failed");
        status.style.color = data.ok ? "#166534" : "#991b1b";
        setBanner(data.ok ? "ok" : "err", data.ok ? "Connection test passed." : "Connection test failed.");
      } catch (err) {
        status.textContent = err.message || String(err);
        status.style.color = "#991b1b";
      } finally {
        btn.disabled = false;
      }
    }
    el("testBtn").addEventListener("click", () => void test());
    load().catch((err) => setBanner("err", err.message || String(err)));
  </script>
</body>
</html>`;
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
    return { ok: false, detail: "Device LAN IP is missing. Re-download the agent from Centrix Admin." };
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
    lines.push("Device number is missing.");
  }
  if (!config.deviceId) {
    ok = false;
    lines.push("Centrix device ID is missing — re-download the agent zip from Administration → Attendance clock-in.");
  }

  return { ok, detail: lines.join("\n") };
}

/**
 * @param {{ openBrowser?: boolean, waitUntilReady?: boolean, installer?: boolean, keepOpen?: boolean }} [options]
 * @returns {Promise<{ ready: boolean, alreadyRunning?: boolean }>}
 */
export function runSettingsUi(options = {}) {
  const open = options.openBrowser !== false;
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
          res.end(htmlPage());
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/config") {
          const view = publicConfigView(ensureConfigFile());
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify(view));
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/test-connection") {
          const test = await quickTest(ensureConfigFile());
          sendJson(res, 200, test);
          return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      } catch (err) {
        sendJson(res, 500, { ok: false, message: err.message || String(err) });
      }
    });

    server.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(`[attendance-agent] Status page port ${SETTINGS_UI_PORT} is already in use.`);
        if (open) openBrowser(SETTINGS_UI_URL);
        finish({ ready: isConfigReady(ensureConfigFile()), alreadyRunning: true });
        return;
      }
      reject(err);
    });

    server.listen(SETTINGS_UI_PORT, "127.0.0.1", () => {
      console.log(`[attendance-agent] Test connection: ${SETTINGS_UI_URL}`);
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
if (isDirectRun) {
  runSettingsUi({ openBrowser: true, keepOpen: true }).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
