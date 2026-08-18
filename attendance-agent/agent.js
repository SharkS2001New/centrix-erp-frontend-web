#!/usr/bin/env node
/**
 * On-LAN Hikvision → Centrix cloud bridge.
 * Polls ISAPI AcsEvent on the local device IP, pushes events to Centrix ingest API,
 * and proxies ISAPI management commands from Centrix cloud to the local terminal.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  STATE_PATH,
  ensureConfigFile,
  isConfigReady,
  missingConfigFields,
  SETTINGS_UI_URL,
} from "./config-lib.js";
import {
  AGENT_VERSION,
  centrixAuthHeaders,
  centrixDeviceBase,
  deviceBaseUrl,
  fetchAcsEvents,
  fetchWithDigest,
  headersToObject,
} from "./isapi-lib.js";

function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function postIngestEvents(config, events) {
  if (!config.deviceId) {
    throw new Error("deviceId missing from config — re-download agent package from Centrix.");
  }
  const url = `${centrixDeviceBase(config)}/agent/ingest-events`;
  const res = await fetch(url, {
    method: "POST",
    headers: centrixAuthHeaders(config),
    body: JSON.stringify({
      agent_version: AGENT_VERSION,
      events: events.map((e) => ({
        employee_no: e.employee_no,
        employee_name: e.employee_name,
        punched_at: e.punched_at,
        attendance_status: e.attendance_status,
        verification_method: e.verification_method,
        card_no: e.card_no,
        serial_no: e.serial_no,
        major: e.major,
        minor: e.minor,
        raw: e.raw,
      })),
    }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg = json?.message || json?.errors || text.slice(0, 300);
    throw new Error(
      `Centrix ingest HTTP ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
    );
  }
  return json;
}

async function postPunchLegacy(config, event) {
  const url = `${String(config.centrixApiUrl).replace(/\/$/, "")}/attendance/clock-punch`;
  const res = await fetch(url, {
    method: "POST",
    headers: centrixAuthHeaders(config),
    body: JSON.stringify({
      employee_code: event.employee_no,
      device_no: config.deviceNo,
      punched_at: event.punched_at,
      direction: event.direction || "auto",
    }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const msg = json?.message || json?.errors || text.slice(0, 300);
    throw new Error(`Centrix clock-punch HTTP ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

async function executeIsapiCommand(config, command) {
  const method = String(command.method || "GET").toUpperCase();
  const path = command.path.startsWith("/") ? command.path : `/${command.path}`;
  if (method === "PING" || path === "/agent/ping") {
    return {
      success: true,
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pong: true,
        agent: "CentrixAttendanceAgent",
        version: AGENT_VERSION,
      }),
      error: null,
    };
  }

  const hik = config.hikvision;
  const accept = command.accept === "xml" ? "application/xml" : "application/json";
  const url = `${deviceBaseUrl(hik)}${path}`;
  const res = await fetchWithDigest(url, {
    method: command.method || "GET",
    body: command.body ?? undefined,
    username: hik.username || "admin",
    password: hik.password || "",
    accept,
  });
  const body = await res.text();

  return {
    success: res.ok,
    status: res.status,
    headers: headersToObject(res),
    body,
    error: res.ok ? null : body.slice(0, 500),
  };
}

async function submitCommandResult(config, commandId, result) {
  const url = `${centrixDeviceBase(config)}/agent/commands/${commandId}/result`;
  const res = await fetch(url, {
    method: "POST",
    headers: centrixAuthHeaders(config),
    body: JSON.stringify({
      agent_version: AGENT_VERSION,
      success: Boolean(result.success),
      status: result.status ?? null,
      headers: result.headers ?? {},
      body: result.body ?? "",
      error: result.error ?? null,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Command result HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

function clampPollSeconds(value, fallback = 600) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 60) return fallback;
  return Math.min(3600, Math.floor(n));
}

const DEFAULT_PUNCH_WINDOWS = [
  { name: "morning_clock_in", from: "08:00", to: "10:00" },
  { name: "lunch_clock_out", from: "12:30", to: "14:00" },
  { name: "lunch_clock_in", from: "13:00", to: "16:00" },
  { name: "evening_clock_out", from: "16:00", to: "22:00" },
];

let heartbeatIntervalSec = 600;
let punchPollSec = 60;
let punchLeadMin = 10;
let punchLagMin = 20;
let punchWindows = DEFAULT_PUNCH_WINDOWS;
let scheduleTimezone = "Africa/Nairobi";
let heartbeatTimer = null;
let punchTimer = null;
let commandPollTimer = null;
let commandPollInFlight = false;
let attendanceSyncInFlight = false;
let activeConfig = null;

function clockToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function nairobiMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: scheduleTimezone || "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function minutesInExpandedWindow(minutes, from, to, lead = punchLeadMin, lag = punchLagMin) {
  const startRaw = clockToMinutes(from);
  const endRaw = clockToMinutes(to);
  if (startRaw == null || endRaw == null) return false;
  const day = 24 * 60;
  let start = (startRaw - lead) % day;
  if (start < 0) start += day;
  const end = (endRaw + lag) % day;
  if (end < start) return minutes >= start || minutes <= end;
  return minutes >= start && minutes <= end;
}

function isInPunchUploadWindow(date = new Date()) {
  const minutes = nairobiMinutes(date);
  return (punchWindows || []).some((window) =>
    minutesInExpandedWindow(minutes, window.from, window.to),
  );
}

function applyAgentSchedule(payload) {
  if (!payload || typeof payload !== "object") return;
  const heartbeat = Number(payload.heartbeat_interval_seconds ?? payload.poll_interval_seconds);
  if (Number.isFinite(heartbeat) && heartbeat >= 60 && heartbeat !== heartbeatIntervalSec) {
    heartbeatIntervalSec = Math.min(3600, Math.floor(heartbeat));
    if (heartbeatTimer) scheduleHeartbeat();
    console.log(`[attendance-agent] Health check every ${heartbeatIntervalSec}s`);
  }
  const punch = Number(payload.punch_poll_seconds);
  if (Number.isFinite(punch) && punch >= 15 && punch !== punchPollSec) {
    punchPollSec = Math.min(600, Math.floor(punch));
    if (punchTimer) schedulePunchPolling();
  }
  if (Number.isFinite(Number(payload.punch_lead_minutes))) {
    punchLeadMin = Math.max(0, Math.min(60, Number(payload.punch_lead_minutes)));
  }
  if (Number.isFinite(Number(payload.punch_lag_minutes))) {
    punchLagMin = Math.max(0, Math.min(120, Number(payload.punch_lag_minutes)));
  }
  if (Array.isArray(payload.punch_windows) && payload.punch_windows.length) {
    punchWindows = payload.punch_windows.filter((w) => w?.from && w?.to);
  }
  if (payload.timezone) scheduleTimezone = String(payload.timezone);
}

function scheduleHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    void postHeartbeat(activeConfig).catch((err) => {
      console.warn(`[attendance-agent] heartbeat failed: ${err.message}`);
    });
  }, heartbeatIntervalSec * 1000);
}

function schedulePunchPolling() {
  if (punchTimer) clearInterval(punchTimer);
  punchTimer = setInterval(() => {
    void maybePunchSync(activeConfig);
  }, punchPollSec * 1000);
}

async function pollCentrixCommands(config) {
  if (!config.deviceId) return 0;

  const url =
    `${centrixDeviceBase(config)}/agent/commands/pending` +
    `?limit=5&agent_version=${encodeURIComponent(AGENT_VERSION)}`;
  const res = await fetch(url, { headers: centrixAuthHeaders(config) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Command poll HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const payload = await res.json();
  applyAgentSchedule(payload);
  const commands = payload?.commands ?? [];
  let handled = 0;

  for (const command of commands) {
    let result;
    try {
      result = await executeIsapiCommand(config, command);
      if (!result.success) {
        result = { success: false, error: result.error || `HTTP ${result.status}` };
      }
    } catch (err) {
      result = { success: false, error: err.message };
    }
    await submitCommandResult(config, command.id, result);
    handled += 1;
  }

  return handled;
}

async function pollCommandsSafe(config = activeConfig) {
  if (!config?.deviceId || commandPollInFlight) return 0;
  commandPollInFlight = true;
  try {
    const count = await pollCentrixCommands(config);
    if (count > 0) console.log(`[attendance-agent] Proxied ${count} ISAPI command(s)`);
    return count;
  } catch (err) {
    console.warn(`[attendance-agent] command poll failed: ${err.message}`);
    return 0;
  } finally {
    commandPollInFlight = false;
  }
}

function startCommandPolling(config) {
  activeConfig = config;
  if (commandPollTimer) return;
  const commandPollSec = 2;
  console.log(`[attendance-agent] ISAPI command poll every ${commandPollSec}s`);
  void pollCommandsSafe(config);
  commandPollTimer = setInterval(() => {
    void pollCommandsSafe(config);
  }, commandPollSec * 1000);
}

async function postHeartbeat(config) {
  if (!config?.deviceId) return;
  const url = `${centrixDeviceBase(config)}/agent/heartbeat`;
  const res = await fetch(url, {
    method: "POST",
    headers: centrixAuthHeaders(config),
    body: JSON.stringify({ agent_version: AGENT_VERSION }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Heartbeat HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const payload = await res.json().catch(() => ({}));
  applyAgentSchedule(payload);
}

async function maybePunchSync(config = activeConfig) {
  if (!config) return;
  if (!isInPunchUploadWindow()) return;
  if (attendanceSyncInFlight) return;
  attendanceSyncInFlight = true;
  try {
    await syncOnce(config);
  } catch (err) {
    console.error(`[attendance-agent] sync failed: ${err.message}`);
  } finally {
    attendanceSyncInFlight = false;
  }
}

async function runPunchSync(config = activeConfig) {
  if (!config) return;
  if (attendanceSyncInFlight) {
    console.log("[attendance-agent] Punch sync already running; skipping this tick");
    return;
  }
  attendanceSyncInFlight = true;
  try {
    try {
      await postHeartbeat(config);
    } catch (err) {
      console.warn(`[attendance-agent] heartbeat failed: ${err.message}`);
    }
    await syncOnce(config);
  } catch (err) {
    console.error(`[attendance-agent] sync failed: ${err.message}`);
  } finally {
    attendanceSyncInFlight = false;
  }
}

const CATCHUP_LOOKBACK_MINUTES = 7 * 24 * 60;
const CATCHUP_OVERLAP_MS = 15 * 60 * 1000;
const MAX_CATCHUP_WINDOWS = 30;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function eventTimeMs(event) {
  const n = new Date(event?.punched_at).getTime();
  return Number.isFinite(n) ? n : null;
}

function laterPunchedAt(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return String(b) > String(a) ? b : a;
}

async function ingestEventBatch(config, state, events) {
  let applied = 0;
  let skipped = 0;
  let lastEventAt = null;
  let failed = false;

  if (!events.length) {
    return { applied, skipped, lastEventAt, failed };
  }

  if (config.deviceId) {
    try {
      const result = await postIngestEvents(config, events);
      applied = Number(result?.applied ?? 0);
      skipped = Number(result?.skipped ?? 0);
      lastEventAt = events[events.length - 1]?.punched_at ?? null;
      console.log(
        `[attendance-agent] Ingest stored=${result?.stored ?? 0} applied=${applied} skipped=${skipped}`,
      );
      return { applied, skipped, lastEventAt, failed: false };
    } catch (err) {
      console.warn(`[attendance-agent] Ingest failed, falling back to clock-punch: ${err.message}`);
    }
  }

  for (const event of events) {
    const key = `${event.employee_no}|${event.punched_at}|${event.serial_no ?? ""}`;
    if (state.seen?.[key]) {
      skipped += 1;
      if (!failed) lastEventAt = laterPunchedAt(lastEventAt, event.punched_at);
      continue;
    }
    try {
      await postPunchLegacy(config, event);
      applied += 1;
      state.seen = state.seen || {};
      state.seen[key] = Date.now();
      if (!failed) lastEventAt = laterPunchedAt(lastEventAt, event.punched_at);
    } catch (e) {
      failed = true;
      skipped += 1;
      console.warn(`[attendance-agent] skip ${event.employee_no}: ${e.message}`);
    }
  }

  return { applied, skipped, lastEventAt, failed };
}

async function syncOnce(config) {
  const state = loadJson(STATE_PATH, {}) || {};
  const lookback = Math.max(
    CATCHUP_LOOKBACK_MINUTES,
    Number(config.lookbackMinutes ?? CATCHUP_LOOKBACK_MINUTES),
  );
  const initialFrom = state.lastEventAt
    ? new Date(new Date(state.lastEventAt).getTime() - CATCHUP_OVERLAP_MS)
    : new Date(Date.now() - lookback * 60_000);
  const initialTo = new Date();

  console.log(
    `[attendance-agent] Catch-up ${config.hikvision.host} from ${initialFrom.toISOString()} (punches stay on the terminal until posted)`,
  );

  const queue = [{ from: initialFrom, to: initialTo }];
  let applied = 0;
  let skipped = 0;
  let pulled = 0;
  let maxEventAt = state.lastEventAt || null;
  let failed = false;
  let windows = 0;

  while (queue.length && windows < MAX_CATCHUP_WINDOWS) {
    windows += 1;
    const { from, to } = queue.shift();
    if (!(from instanceof Date) || !(to instanceof Date) || from.getTime() >= to.getTime()) {
      continue;
    }

    const { events, truncated } = await fetchAcsEvents(config, from, to);
    console.log(
      `[attendance-agent] Pulled ${events.length} event(s)${truncated ? " (window full — splitting)" : ""}`,
    );
    pulled += events.length;
    await pollCommandsSafe(config);

    if (events.length) {
      const result = await ingestEventBatch(config, state, events);
      applied += result.applied;
      skipped += result.skipped;
      failed = failed || result.failed;
      if (!result.failed) {
        maxEventAt = laterPunchedAt(maxEventAt, result.lastEventAt);
      }
    }

    if (truncated && events.length) {
      const times = events.map(eventTimeMs).filter((n) => n != null);
      if (times.length) {
        const oldest = new Date(Math.min(...times) - 1000);
        const newest = new Date(Math.max(...times));
        if (oldest.getTime() > from.getTime()) {
          queue.push({ from, to: oldest });
        }
        if (newest.getTime() < to.getTime()) {
          queue.push({ from: newest, to });
        }
      }
    }
  }

  if (windows >= MAX_CATCHUP_WINDOWS && queue.length) {
    failed = true;
    console.warn(
      `[attendance-agent] Catch-up paused after ${windows} windows; remaining punches will sync on the next poll.`,
    );
  }

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (state.seen) {
    for (const [k, ts] of Object.entries(state.seen)) {
      if (Number(ts) < cutoff) delete state.seen[k];
    }
  }
  if (!failed) {
    state.lastEventAt = maxEventAt || state.lastEventAt || null;
  }
  state.lastSyncedAt = new Date().toISOString();
  saveState(state);

  console.log(`[attendance-agent] Done applied=${applied} skipped=${skipped} pulled=${pulled}`);
  return { applied, skipped, pulled };
}

async function runCatchupWithRetry(config) {
  const delaysMs = [0, 10_000, 20_000, 30_000, 60_000, 60_000];
  let lastError = null;
  for (let i = 0; i < delaysMs.length; i += 1) {
    if (delaysMs[i]) {
      console.log(`[attendance-agent] Retrying catch-up in ${delaysMs[i] / 1000}s (device or network may still be coming up)`);
      await sleep(delaysMs[i]);
    }
    try {
      await syncOnce(config);
      return;
    } catch (err) {
      lastError = err;
      console.error(`[attendance-agent] catch-up attempt ${i + 1} failed: ${err.message}`);
    }
  }
  if (lastError) {
    throw lastError;
  }
}

async function main() {
  const once = process.argv.includes("--once");
  const skipUi = process.argv.includes("--no-setup-ui");
  const config = ensureConfigFile();

  if (!isConfigReady(config)) {
    console.error(
      `[attendance-agent] Config incomplete (${missingConfigFields(config).join(", ")}). Re-download CentrixAttendanceAgent from HR → Attendance clock-in.`,
    );
    process.exit(1);
  }

  if (!once && !skipUi) {
    const { runSettingsUi } = await import("./settings-ui.js");
    console.log(`[attendance-agent] Test connection page on ${SETTINGS_UI_URL}`);
    runSettingsUi({ openBrowser: false, keepOpen: true }).catch((err) => {
      console.warn(`[attendance-agent] status page: ${err.message || err}`);
    });
  }

  if (once) {
    await pollCommandsSafe(config);
    await runPunchSync(config);
    return;
  }

  applyAgentSchedule({
    heartbeat_interval_seconds: config.heartbeatIntervalSeconds || config.pollIntervalSeconds,
    punch_poll_seconds: config.punchPollSeconds,
    punch_lead_minutes: config.punchLeadMinutes,
    punch_lag_minutes: config.punchLagMinutes,
    punch_windows: config.punchWindows,
    timezone: config.timezone,
  });
  heartbeatIntervalSec = clampPollSeconds(
    config.heartbeatIntervalSeconds || config.pollIntervalSeconds,
    heartbeatIntervalSec,
  );
  console.log(
    `[attendance-agent] v${AGENT_VERSION} — health check every ${heartbeatIntervalSec}s; punch upload during Admin clock-in/out windows`,
  );
  console.log(`[attendance-agent] Test connection in a browser: ${SETTINGS_UI_URL}`);

  activeConfig = config;
  startCommandPolling(config);
  scheduleHeartbeat();
  schedulePunchPolling();
  void (async () => {
    if (attendanceSyncInFlight) return;
    attendanceSyncInFlight = true;
    try {
      try {
        await postHeartbeat(config);
      } catch (err) {
        console.warn(`[attendance-agent] heartbeat failed: ${err.message}`);
      }
      await runCatchupWithRetry(config);
    } catch (err) {
      console.error(`[attendance-agent] startup catch-up failed: ${err.message}`);
    } finally {
      attendanceSyncInFlight = false;
    }
  })();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
