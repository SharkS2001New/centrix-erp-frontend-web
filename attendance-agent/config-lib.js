/**
 * Shared config helpers for Centrix Attendance Agent.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const AGENT_DIR = __dirname;
export const CONFIG_PATH = join(__dirname, "config.json");
export const EXAMPLE_PATH = join(__dirname, "config.example.json");
export const STATE_PATH = join(__dirname, "state.json");

export const SETTINGS_UI_PORT = 9251;
export const SETTINGS_UI_URL = `http://127.0.0.1:${SETTINGS_UI_PORT}`;

export function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function ensureConfigFile() {
  if (!existsSync(CONFIG_PATH) && existsSync(EXAMPLE_PATH)) {
    copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
  }
  return loadJson(CONFIG_PATH, emptyConfig());
}

function normalizeHikvisionPort(port, useHttps) {
  const n = Number(port);
  if (!Number.isFinite(n) || n <= 0) return useHttps ? 443 : 80;
  if (n === 8000 && !useHttps) return 80;
  return n;
}

export function emptyConfig() {
  return {
    centrixApiUrl: "",
    centrixToken: "",
    deviceId: null,
    deviceNo: "",
    hikvision: {
      host: "",
      port: 80,
      username: "admin",
      password: "",
      useHttps: false,
    },
    pollIntervalSeconds: 300,
    lookbackMinutes: 10080,
  };
}

export function normalizeConfig(raw) {
  const base = emptyConfig();
  const hik = raw?.hikvision && typeof raw.hikvision === "object" ? raw.hikvision : {};
  return {
    centrixApiUrl: String(raw?.centrixApiUrl ?? base.centrixApiUrl).trim().replace(/\/$/, ""),
    centrixToken: String(raw?.centrixToken ?? base.centrixToken).trim(),
    deviceId: raw?.deviceId != null && raw.deviceId !== "" ? Number(raw.deviceId) : null,
    deviceNo: String(raw?.deviceNo ?? base.deviceNo).trim(),
    hikvision: {
      host: String(hik.host ?? "").trim(),
      port: normalizeHikvisionPort(hik.port, Boolean(hik.useHttps)),
      username: String(hik.username ?? "admin").trim() || "admin",
      password: String(hik.password ?? ""),
      useHttps: Boolean(hik.useHttps),
    },
    pollIntervalSeconds:
      Number(raw?.pollIntervalSeconds) > 0 ? Number(raw.pollIntervalSeconds) : 300,
    lookbackMinutes: Number(raw?.lookbackMinutes) > 0 ? Number(raw.lookbackMinutes) : 10080,
  };
}

export function saveConfig(config) {
  const normalized = normalizeConfig(config);
  writeFileSync(CONFIG_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

/** True when the agent can poll without opening the settings UI. */
export function isConfigReady(config) {
  const c = normalizeConfig(config || {});
  return Boolean(
    c.centrixApiUrl &&
      c.centrixToken &&
      c.deviceId &&
      c.deviceNo &&
      c.hikvision.host &&
      String(c.hikvision.password || "").length > 0,
  );
}

export function missingConfigFields(config) {
  const c = normalizeConfig(config || {});
  const missing = [];
  if (!c.centrixApiUrl) missing.push("Centrix API URL");
  if (!c.centrixToken) missing.push("Centrix token");
  if (!c.deviceId) missing.push("device id");
  if (!c.deviceNo) missing.push("device number");
  if (!c.hikvision.host) missing.push("Hikvision LAN IP");
  if (!String(c.hikvision.password || "")) missing.push("Hikvision password");
  return missing;
}

export function publicConfigView(config) {
  const c = normalizeConfig(config || {});
  const token = c.centrixToken || "";
  return {
    ...c,
    centrixToken: token,
    centrixTokenMasked: token
      ? `${token.slice(0, 6)}…${token.slice(-4)} (${token.length} chars)`
      : "",
    hasCentrixToken: Boolean(token),
    ready: isConfigReady(c),
    missing: missingConfigFields(c),
  };
}
