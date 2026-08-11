#!/usr/bin/env node
/**
 * On-LAN Hikvision → Centrix cloud attendance bridge.
 * Polls ISAPI AcsEvent on the local device IP, posts punches to Centrix.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  STATE_PATH,
  ensureConfigFile,
  isConfigReady,
  missingConfigFields,
  SETTINGS_UI_URL,
} from "./config-lib.js";

function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function basicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/** Digest auth helper for Hikvision ISAPI (common on DS-K1T series). */
async function fetchWithDigest(url, { method = "GET", body, username, password, headers = {} } = {}) {
  const first = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (first.status !== 401) return first;

  const www = first.headers.get("www-authenticate") || "";
  if (!/digest/i.test(www)) {
    // Fall back to basic
    return fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: basicAuthHeader(username, password),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  const parts = Object.fromEntries(
    [...www.matchAll(/(\w+)=(?:"([^"]+)"|([^\s,]+))/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3]]),
  );
  const realm = parts.realm || "";
  const nonce = parts.nonce || "";
  const qop = parts.qop || "auth";
  const opaque = parts.opaque;
  const nc = "00000001";
  const cnonce = randomUUID().replace(/-/g, "").slice(0, 16);
  const uri = new URL(url).pathname + new URL(url).search;
  const ha1 = createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
  const ha2 = createHash("md5").update(`${method}:${uri}`).digest("hex");
  const response = createHash("md5")
    .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    .digest("hex");
  const auth =
    `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
    `algorithm=MD5, response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"` +
    (opaque ? `, opaque="${opaque}"` : "");

  return fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function deviceBaseUrl(hik) {
  const scheme = hik.useHttps ? "https" : "http";
  const port = hik.port || (hik.useHttps ? 443 : 80);
  return `${scheme}://${hik.host}:${port}`;
}

function mapDirection(status) {
  const s = String(status || "").toLowerCase();
  if (["checkin", "check_in", "in", "1"].includes(s)) return "in";
  if (["checkout", "check_out", "out", "2"].includes(s)) return "out";
  return "auto";
}

async function fetchAcsEvents(config, fromIso, toIso) {
  const hik = config.hikvision;
  const url = `${deviceBaseUrl(hik)}/ISAPI/AccessControl/AcsEvent?format=json`;
  const searchId = randomUUID();
  const events = [];
  let position = 0;

  for (let page = 0; page < 20; page += 1) {
    const body = {
      AcsEventCond: {
        searchID: searchId,
        searchResultPosition: position,
        maxResults: 30,
        major: 5,
        startTime: fromIso,
        endTime: toIso,
      },
    };
    const res = await fetchWithDigest(url, {
      method: "POST",
      body,
      username: hik.username || "admin",
      password: hik.password || "",
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hikvision AcsEvent HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const payload = await res.json();
    const list = payload?.AcsEvent?.InfoList ?? payload?.AcsEvent?.infoList ?? [];
    const rows = Array.isArray(list) ? list : [];
    for (const row of rows) {
      const employeeNo = String(
        row.employeeNoString ?? row.employeeNo ?? row.cardNo ?? "",
      ).trim();
      const punchedAt = String(row.time ?? row.dateTime ?? "").trim();
      if (!employeeNo || !punchedAt) continue;
      events.push({
        employeeNo,
        punchedAt,
        direction: mapDirection(row.attendanceStatus),
      });
    }
    const matches = Number(payload?.AcsEvent?.numOfMatches ?? rows.length);
    position += Math.max(1, matches);
    if (matches < 1 || rows.length < 1) break;
  }

  events.sort((a, b) => String(a.punchedAt).localeCompare(String(b.punchedAt)));
  return events;
}

async function postPunch(config, event) {
  const url = `${String(config.centrixApiUrl).replace(/\/$/, "")}/attendance/clock-punch`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.centrixToken}`,
    },
    body: JSON.stringify({
      employee_code: event.employeeNo,
      device_no: config.deviceNo,
      punched_at: event.punchedAt,
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

async function syncOnce(config) {
  const state = loadJson(STATE_PATH, {}) || {};
  const lookback = Math.max(5, Number(config.lookbackMinutes ?? 360));
  const from = state.lastEventAt
    ? new Date(new Date(state.lastEventAt).getTime() - 60_000)
    : new Date(Date.now() - lookback * 60_000);
  const to = new Date();

  const fromIso = from.toISOString().replace(/\.\d{3}Z$/, "+00:00");
  const toIso = to.toISOString().replace(/\.\d{3}Z$/, "+00:00");

  console.log(`[attendance-agent] Polling ${config.hikvision.host} from ${fromIso} …`);
  const events = await fetchAcsEvents(config, fromIso, toIso);
  console.log(`[attendance-agent] Pulled ${events.length} event(s)`);

  let applied = 0;
  let skipped = 0;
  let lastEventAt = state.lastEventAt || null;

  for (const event of events) {
    const key = `${event.employeeNo}|${event.punchedAt}|${event.direction}`;
    if (state.seen?.[key]) {
      skipped += 1;
      continue;
    }
    try {
      const result = await postPunch(config, event);
      applied += 1;
      state.seen = state.seen || {};
      state.seen[key] = Date.now();
      lastEventAt = event.punchedAt;
      console.log(
        `[attendance-agent] ${result?.action || "ok"} ${event.employeeNo} @ ${event.punchedAt}`,
      );
    } catch (err) {
      skipped += 1;
      console.warn(`[attendance-agent] skip ${event.employeeNo}: ${err.message}`);
    }
  }

  // Prune seen map (keep ~7 days)
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

  if (!isConfigReady(config)) {
    const missing = missingConfigFields(config).join(", ");
    if (once || skipUi) {
      console.error(
        `[attendance-agent] Config incomplete (${missing}). Open settings: npm run setup  →  ${SETTINGS_UI_URL}`,
      );
      process.exit(1);
    }
    console.log(`[attendance-agent] First-run setup needed (${missing || "incomplete"}). Opening settings UI…`);
    const { runSettingsUi } = await import("./settings-ui.js");
    await runSettingsUi({ openBrowser: true, waitUntilReady: true });
    config = ensureConfigFile();
    if (!isConfigReady(config)) {
      console.error(
        `[attendance-agent] Still incomplete after settings UI. Missing: ${missingConfigFields(config).join(", ")}`,
      );
      process.exit(1);
    }
    console.log("[attendance-agent] Settings saved. Starting sync…");
  }

  if (once) {
    await syncOnce(config);
    return;
  }

  const intervalSec = Math.max(60, Number(config.pollIntervalSeconds ?? 300));
  console.log(`[attendance-agent] Running every ${intervalSec}s (Ctrl+C to stop)`);
  console.log(`[attendance-agent] Re-open settings anytime: npm run setup  (${SETTINGS_UI_URL})`);
  const run = async () => {
    try {
      await syncOnce(config);
    } catch (err) {
      console.error(`[attendance-agent] sync failed: ${err.message}`);
    }
  };
  await run();
  setInterval(run, intervalSec * 1000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
