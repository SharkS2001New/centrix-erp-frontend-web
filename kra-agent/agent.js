#!/usr/bin/env node
/**
 * Centrix KRA Agent — cloud Centrix ↔ local Comstore (e.g. http://127.0.0.1:4000).
 * Polls fiscal HTTP commands every ~1s so checkout stays fast.
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_VERSION = "1.0.0";
const LOCAL_PORT = 9261;
const CONFIG_PATH = join(__dirname, "config.json");
const STATE_PATH = join(__dirname, "state.json");

function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function loadConfig() {
  const cfg = loadJson(CONFIG_PATH, null);
  if (!cfg?.centrixApiUrl || !cfg?.centrixToken) {
    throw new Error(
      "config.json missing centrixApiUrl/centrixToken. Download the agent package from Centrix → Finance settings.",
    );
  }
  return {
    ...cfg,
    comstoreBaseUrl: String(cfg.comstoreBaseUrl || "http://127.0.0.1:4000").replace(/\/$/, ""),
    pollIntervalSeconds: Math.max(1, Number(cfg.pollIntervalSeconds ?? 1) || 1),
    heartbeatIntervalSeconds: Math.max(30, Number(cfg.heartbeatIntervalSeconds ?? 60) || 60),
    commandTimeoutSeconds: Math.max(10, Number(cfg.commandTimeoutSeconds ?? 50) || 50),
  };
}

function centrixHeaders(config) {
  return {
    Authorization: `Bearer ${config.centrixToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Centrix-Agent": "CentrixKraAgent",
    "X-Centrix-Agent-Version": AGENT_VERSION,
  };
}

function centrixBase(config) {
  return String(config.centrixApiUrl).replace(/\/$/, "");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function heartbeat(config) {
  const url = `${centrixBase(config)}/kra/agent/heartbeat`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: centrixHeaders(config),
      body: JSON.stringify({
        agent_version: AGENT_VERSION,
        comstore_base_url: config.comstoreBaseUrl,
      }),
    },
    15_000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Heartbeat HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function pullCommands(config) {
  const url = `${centrixBase(config)}/kra/agent/commands/pending?limit=1&agent_version=${encodeURIComponent(AGENT_VERSION)}`;
  const res = await fetchWithTimeout(url, { headers: centrixHeaders(config) }, 15_000);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pending commands HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function postResult(config, commandId, payload) {
  const url = `${centrixBase(config)}/kra/agent/commands/${encodeURIComponent(commandId)}/result`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: centrixHeaders(config),
      body: JSON.stringify({ ...payload, agent_version: AGENT_VERSION }),
    },
    15_000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Result HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

function headersToObject(headers) {
  const out = {};
  headers.forEach((value, key) => {
    out[key] = [value];
  });
  return out;
}

async function proxyToComstore(config, command) {
  const method = String(command.method || "GET").toUpperCase();
  const path = String(command.path || "");
  if (path === "/agent/ping") {
    return {
      success: true,
      status: 200,
      body: JSON.stringify({ pong: true, agent: "CentrixKraAgent", version: AGENT_VERSION }),
      headers: { "content-type": ["application/json"] },
    };
  }

  const url = `${config.comstoreBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const init = {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
  if (method !== "GET" && method !== "HEAD" && command.body != null) {
    init.body = JSON.stringify(command.body);
  }

  const timeoutMs = Math.round(Number(config.commandTimeoutSeconds) * 1000);
  const res = await fetchWithTimeout(url, init, timeoutMs);
  const body = await res.text();
  return {
    success: res.ok,
    status: res.status,
    body,
    headers: headersToObject(res.headers),
    error: res.ok ? undefined : formatComstoreHttpError(res.status, body),
  };
}

function formatComstoreHttpError(status, body) {
  const detail = extractComstoreErrorDetail(body);
  return detail ? `Comstore HTTP ${status}: ${detail}` : `Comstore HTTP ${status}`;
}

function extractComstoreErrorDetail(body) {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) return "";
  const clipped = trimmed.length > 800 ? trimmed.slice(0, 800) : trimmed;
  try {
    const json = JSON.parse(clipped);
    if (json && typeof json === "object") {
      for (const key of ["message", "Message", "error", "Error", "detail", "Detail", "title", "Title"]) {
        const value = json[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
  } catch {
    // not JSON
  }
  if (clipped.startsWith("<") || /^<!DOCTYPE/i.test(clipped)) return "";
  return clipped.length <= 400 ? clipped : clipped.slice(0, 400);
}

const runtime = {
  startedAt: new Date().toISOString(),
  lastHeartbeatAt: null,
  lastPollAt: null,
  lastError: null,
  commandsHandled: 0,
  online: false,
};

async function tickCommands(config) {
  runtime.lastPollAt = new Date().toISOString();
  const payload = await pullCommands(config);
  if (payload?.comstore_base_url) {
    config.comstoreBaseUrl = String(payload.comstore_base_url).replace(/\/$/, "");
  }
  const commands = Array.isArray(payload?.commands) ? payload.commands : [];
  for (const command of commands) {
    try {
      const result = await proxyToComstore(config, command);
      await postResult(config, command.id, result);
      runtime.commandsHandled += 1;
      runtime.lastError = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      runtime.lastError = message;
      try {
        await postResult(config, command.id, {
          success: false,
          status: 0,
          body: "",
          error: message.slice(0, 500),
        });
      } catch {
        /* ignore nested */
      }
    }
  }
}

function startLocalStatusServer(config) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${LOCAL_PORT}`);
    if (url.pathname === "/v1/health" || url.pathname === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          agent: "CentrixKraAgent",
          version: AGENT_VERSION,
          ...runtime,
          comstoreBaseUrl: config.comstoreBaseUrl,
          centrixApiUrl: config.centrixApiUrl,
        }),
      );
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><body style="font-family:system-ui;padding:24px">
        <h1>Centrix KRA Agent</h1>
        <p>Version ${AGENT_VERSION}</p>
        <p>Comstore: <code>${config.comstoreBaseUrl}</code></p>
        <p>Status JSON: <a href="/v1/health">/v1/health</a></p>
        <p>Keep this Windows service running while Centrix cloud fiscalizes sales.</p>
      </body></html>`);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });
  server.listen(LOCAL_PORT, "127.0.0.1");
  console.log(`[CentrixKraAgent] Local status http://127.0.0.1:${LOCAL_PORT}`);
}

async function main() {
  const config = loadConfig();
  startLocalStatusServer(config);
  console.log(`[CentrixKraAgent] ${AGENT_VERSION} → Centrix ${config.centrixApiUrl}`);
  console.log(`[CentrixKraAgent] Comstore ${config.comstoreBaseUrl} · poll ${config.pollIntervalSeconds}s`);

  let heartbeatBusy = false;
  let commandBusy = false;

  setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      await heartbeat(config);
      runtime.lastHeartbeatAt = new Date().toISOString();
      runtime.online = true;
      runtime.lastError = null;
    } catch (err) {
      runtime.online = false;
      runtime.lastError = err instanceof Error ? err.message : String(err);
      console.error("[CentrixKraAgent] heartbeat failed:", runtime.lastError);
    } finally {
      heartbeatBusy = false;
    }
  }, config.heartbeatIntervalSeconds * 1000);

  // Immediate first heartbeat + poll
  try {
    await heartbeat(config);
    runtime.lastHeartbeatAt = new Date().toISOString();
    runtime.online = true;
  } catch (err) {
    runtime.lastError = err instanceof Error ? err.message : String(err);
    console.error("[CentrixKraAgent] initial heartbeat failed:", runtime.lastError);
  }

  setInterval(async () => {
    if (commandBusy) return;
    commandBusy = true;
    try {
      await tickCommands(config);
    } catch (err) {
      runtime.lastError = err instanceof Error ? err.message : String(err);
      console.error("[CentrixKraAgent] poll failed:", runtime.lastError);
    } finally {
      commandBusy = false;
    }
  }, config.pollIntervalSeconds * 1000);
}

main().catch((err) => {
  console.error("[CentrixKraAgent] fatal:", err);
  process.exit(1);
});
