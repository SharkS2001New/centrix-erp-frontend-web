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

function clampPollSeconds(value, fallback = 300) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 60) return fallback;
  return Math.min(3600, Math.floor(n));
}

let attendanceIntervalSec = 300;
let attendanceTimer = null;
let runSyncFn = async () => {};

function applyRemotePollInterval(seconds) {
  const next = clampPollSeconds(seconds, attendanceIntervalSec);
  if (next === attendanceIntervalSec) return;
  attendanceIntervalSec = next;
  console.log(
    `[attendance-agent] Auto-sync every ${attendanceIntervalSec}s (Centrix admin setting)`,
  );
  scheduleAttendance();
}

function scheduleAttendance() {
  if (attendanceTimer) clearTimeout(attendanceTimer);
  attendanceTimer = setTimeout(async () => {
    await runSyncFn();
    scheduleAttendance();
  }, attendanceIntervalSec * 1000);
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
  const remotePoll = Number(payload?.poll_interval_seconds);
  if (Number.isFinite(remotePoll) && remotePoll >= 60) {
    applyRemotePollInterval(remotePoll);
  }
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

async function syncOnce(config) {
  const state = loadJson(STATE_PATH, {}) || {};
  const lookback = Math.max(5, Number(config.lookbackMinutes ?? 360));
  const from = state.lastEventAt
    ? new Date(new Date(state.lastEventAt).getTime() - 60_000)
    : new Date(Date.now() - lookback * 60_000);
  const to = new Date();

  console.log(`[attendance-agent] Polling ${config.hikvision.host} from ${from.toISOString()} …`);
  const events = await fetchAcsEvents(config, from, to);
  console.log(`[attendance-agent] Pulled ${events.length} event(s)`);

  if (events.length === 0) {
    state.lastSyncedAt = new Date().toISOString();
    saveState(state);
    return { applied: 0, skipped: 0, pulled: 0 };
  }

  let applied = 0;
  let skipped = 0;
  let lastEventAt = state.lastEventAt || null;

  if (config.deviceId) {
    try {
      const result = await postIngestEvents(config, events);
      applied = Number(result?.applied ?? 0);
      skipped = Number(result?.skipped ?? 0);
      lastEventAt = events[events.length - 1]?.punched_at ?? lastEventAt;
      console.log(
        `[attendance-agent] Ingest stored=${result?.stored ?? 0} applied=${applied} skipped=${skipped}`,
      );
    } catch (err) {
      console.warn(`[attendance-agent] Ingest failed, falling back to clock-punch: ${err.message}`);
      for (const event of events) {
        const key = `${event.employee_no}|${event.punched_at}|${event.serial_no ?? ""}`;
        if (state.seen?.[key]) {
          skipped += 1;
          continue;
        }
        try {
          await postPunchLegacy(config, event);
          applied += 1;
          state.seen = state.seen || {};
          state.seen[key] = Date.now();
          lastEventAt = event.punched_at;
        } catch (e) {
          skipped += 1;
          console.warn(`[attendance-agent] skip ${event.employee_no}: ${e.message}`);
        }
      }
    }
  } else {
    for (const event of events) {
      const key = `${event.employee_no}|${event.punched_at}|${event.serial_no ?? ""}`;
      if (state.seen?.[key]) {
        skipped += 1;
        continue;
      }
      try {
        await postPunchLegacy(config, event);
        applied += 1;
        state.seen = state.seen || {};
        state.seen[key] = Date.now();
        lastEventAt = event.punched_at;
      } catch (err) {
        skipped += 1;
        console.warn(`[attendance-agent] skip ${event.employee_no}: ${err.message}`);
      }
    }
  }

  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (state.seen) {
    for (const [k, ts] of Object.entries(state.seen)) {
      if (Number(ts) < cutoff) delete state.seen[k];
    }
  }
  state.lastEventAt = lastEventAt || state.lastEventAt || null;
  state.lastSyncedAt = new Date().toISOString();
  saveState(state);

  console.log(`[attendance-agent] Done applied=${applied} skipped=${skipped}`);
  return { applied, skipped, pulled: events.length };
}

async function main() {
  const once = process.argv.includes("--once");
  const skipUi = process.argv.includes("--no-setup-ui");
  let config = ensureConfigFile();

  if (!once && !skipUi) {
    const { runSettingsUi } = await import("./settings-ui.js");
    const needSetup = !isConfigReady(config);
    if (needSetup) {
      console.log(
        `[attendance-agent] First-run setup needed (${missingConfigFields(config).join(", ") || "incomplete"}). Opening settings UI…`,
      );
    } else {
      console.log(`[attendance-agent] Settings UI on ${SETTINGS_UI_URL} (stays up with this service)`);
    }
    const settings = runSettingsUi({
      openBrowser: needSetup,
      waitUntilReady: needSetup,
      keepOpen: true,
    });
    if (needSetup) {
      await settings;
      config = ensureConfigFile();
      if (!isConfigReady(config)) {
        console.error(
          `[attendance-agent] Still incomplete after settings UI. Missing: ${missingConfigFields(config).join(", ")}`,
        );
        process.exit(1);
      }
      console.log("[attendance-agent] Settings saved. Starting sync…");
    } else {
      settings.catch((err) => {
        console.warn(`[attendance-agent] settings UI: ${err.message || err}`);
      });
    }
  } else if (!isConfigReady(config)) {
    console.error(
      `[attendance-agent] Config incomplete (${missingConfigFields(config).join(", ")}). Open settings: npm run setup  →  ${SETTINGS_UI_URL}`,
    );
    process.exit(1);
  }

  if (once) {
    const commands = await pollCentrixCommands(config).catch((err) => {
      console.warn(`[attendance-agent] command poll: ${err.message}`);
      return 0;
    });
    if (commands > 0) console.log(`[attendance-agent] Proxied ${commands} ISAPI command(s)`);
    await syncOnce(config);
    return;
  }

  attendanceIntervalSec = clampPollSeconds(config.pollIntervalSeconds, 300);
  const commandPollSec = 2;
  console.log(
    `[attendance-agent] v${AGENT_VERSION} — ISAPI proxy every ${commandPollSec}s, attendance every ${attendanceIntervalSec}s (admin can change this in Centrix)`,
  );
  console.log(`[attendance-agent] Re-open settings anytime: npm run setup  (${SETTINGS_UI_URL})`);

  const pollCommands = async () => {
    try {
      const count = await pollCentrixCommands(config);
      if (count > 0) console.log(`[attendance-agent] Proxied ${count} ISAPI command(s)`);
    } catch (err) {
      console.warn(`[attendance-agent] command poll failed: ${err.message}`);
    }
  };

  const runSync = async () => {
    try {
      await syncOnce(config);
    } catch (err) {
      console.error(`[attendance-agent] sync failed: ${err.message}`);
    }
  };

  runSyncFn = runSync;
  await pollCommands();
  await runSync();
  scheduleAttendance();
  setInterval(pollCommands, commandPollSec * 1000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
