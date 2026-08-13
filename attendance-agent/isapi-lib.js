#!/usr/bin/env node
/**
 * Shared Hikvision ISAPI helpers for the attendance agent.
 */

import { createHash, randomUUID } from "node:crypto";

export const AGENT_VERSION = "2.2.1";

/**
 * Format for Hikvision AcsEvent search — local wall clock with offset, never trailing Z.
 * Example: 2026-08-13T20:05:01+03:00
 */
export function formatAcsEventDateTime(date = new Date(), withOffset = true) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  if (!withOffset) {
    return `${y}-${m}-${day}T${h}:${min}:${s}`;
  }
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return `${y}-${m}-${day}T${h}:${min}:${s}${sign}${oh}:${om}`;
}

export function deviceBaseUrl(hik) {
  const scheme = hik.useHttps ? "https" : "http";
  let port = Number(hik.port || (hik.useHttps ? 443 : 80));
  if (port === 8000 && !hik.useHttps) port = 80;
  return `${scheme}://${hik.host}:${port}`;
}

export function basicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/**
 * Node/undici often surfaces LAN failures as cryptic "network connection error" / "fetch failed".
 * Unwrap causes and turn them into actionable text for the settings UI.
 */
export function describeNetworkError(err, targetUrl = "") {
  const parts = [];
  let cur = err;
  for (let i = 0; i < 4 && cur; i += 1) {
    const msg = String(cur.message || cur).trim();
    if (msg && !parts.includes(msg)) parts.push(msg);
    const code = cur.code || cur.cause?.code;
    if (code && !parts.includes(String(code))) parts.push(String(code));
    cur = cur.cause;
  }
  const joined = parts.join(" — ");
  const lower = joined.toLowerCase();
  const isLanFail =
    /network connection error|fetch failed|econnrefused|econnreset|etimedout|enotfound|ehostunreach|enetunreach|socket hang up|other side closed|connect timeout/i.test(
      lower,
    );

  if (!isLanFail) {
    return joined || "Unknown network error";
  }

  let hostHint = targetUrl;
  try {
    if (targetUrl) {
      const u = new URL(targetUrl);
      hostHint = `${u.hostname}:${u.port || (u.protocol === "https:" ? 443 : 80)}`;
    }
  } catch {
    /* keep raw */
  }

  return (
    `Cannot reach Hikvision at ${hostHint || "the configured LAN address"}. ` +
    "Confirm this PC is on the same office LAN, the Device LAN IP is correct, HTTP port is 80 " +
    "(not 8000), Windows Firewall allows Node, and you can open the device web page from this PC. " +
    `(Detail: ${joined})`
  );
}

async function rawFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new Error(describeNetworkError(err, url));
  }
}

/** Digest auth helper for Hikvision ISAPI (common on DS-K1T series). */
export async function fetchWithDigest(
  url,
  { method = "GET", body, username, password, headers = {}, accept = "application/json" } = {},
) {
  const first = await rawFetch(url, {
    method,
    headers: {
      Accept: accept,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (first.status !== 401) return first;

  const www = first.headers.get("www-authenticate") || "";
  if (!/digest/i.test(www)) {
    return rawFetch(url, {
      method,
      headers: {
        Accept: accept,
        Authorization: basicAuthHeader(username, password),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body != null ? JSON.stringify(body) : undefined,
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

  return rawFetch(url, {
    method,
    headers: {
      Accept: accept,
      Authorization: auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export function headersToObject(response) {
  const out = {};
  response.headers.forEach((value, key) => {
    out[key] = out[key] ? [].concat(out[key], value) : value;
  });
  return out;
}

export function centrixAuthHeaders(config) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.centrixToken}`,
  };
}

export function centrixDeviceBase(config) {
  return `${String(config.centrixApiUrl).replace(/\/$/, "")}/attendance-clock-devices/${config.deviceId}/hikvision`;
}

export function mapDirection(status) {
  const s = String(status || "").toLowerCase();
  if (["checkin", "check_in", "in", "1"].includes(s)) return "in";
  if (["checkout", "check_out", "out", "2"].includes(s)) return "out";
  return "auto";
}

export function normalizeEventRow(row) {
  const employeeNo = String(
    row.employeeNoString ?? row.employeeNo ?? row.cardNo ?? "",
  ).trim();
  const punchedAt = String(row.time ?? row.dateTime ?? "").trim();
  if (!employeeNo || !punchedAt) return null;

  return {
    employee_no: employeeNo,
    employee_name: row.name ? String(row.name) : null,
    punched_at: punchedAt,
    attendance_status: row.attendanceStatus ? String(row.attendanceStatus) : null,
    verification_method: row.currentVerifyMode
      ? String(row.currentVerifyMode)
      : row.verifyMode
        ? String(row.verifyMode)
        : null,
    card_no: row.cardNo ? String(row.cardNo) : null,
    serial_no: row.serialNo ? String(row.serialNo) : null,
    major: row.major != null ? Number(row.major) : null,
    minor: row.minor != null ? Number(row.minor) : null,
    direction: mapDirection(row.attendanceStatus),
    raw: row,
  };
}

/**
 * Pull attendance / access events from the local Hikvision terminal.
 * Tries several AcsEventCond shapes because firmware differs.
 */
export async function fetchAcsEvents(config, fromDate, toDate) {
  const hik = config.hikvision || {};
  const url = `${deviceBaseUrl(hik)}/ISAPI/AccessControl/AcsEvent?format=json`;
  const searchId = randomUUID().replace(/-/g, "").slice(0, 16);
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const to = toDate instanceof Date ? toDate : new Date(toDate);

  const timePairs = [
    {
      startTime: formatAcsEventDateTime(from, true),
      endTime: formatAcsEventDateTime(to, true),
    },
    {
      startTime: formatAcsEventDateTime(from, false),
      endTime: formatAcsEventDateTime(to, false),
    },
  ];
  const filters = [
    { major: 0, minor: 0, eventAttribute: "attendance" },
    { major: 0, minor: 0 },
  ];

  const candidates = [];
  for (const times of timePairs) {
    for (const filter of filters) {
      candidates.push({ ...times, ...filter });
    }
  }

  let lastError = null;
  for (const baseCond of candidates) {
    try {
      const events = [];
      let position = 0;
      for (let page = 0; page < 20; page += 1) {
        const body = {
          AcsEventCond: {
            ...baseCond,
            searchID: searchId,
            searchResultPosition: position,
            maxResults: 30,
          },
        };
        const res = await fetchWithDigest(url, {
          method: "POST",
          body,
          username: hik.username || "admin",
          password: hik.password || "",
        });
        const text = await res.text();
        let payload = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          payload = null;
        }
        if (!res.ok) {
          const msg = `Hikvision AcsEvent HTTP ${res.status}: ${text.slice(0, 300)}`;
          if (
            /badparameters|invalid content|0x60000001/i.test(text) ||
            res.status === 400
          ) {
            lastError = new Error(msg);
            break;
          }
          throw new Error(msg);
        }
        const list = payload?.AcsEvent?.InfoList ?? payload?.AcsEvent?.infoList ?? [];
        const rows = Array.isArray(list) ? list : list && typeof list === "object" ? [list] : [];
        for (const row of rows) {
          const normalized = normalizeEventRow(row);
          if (normalized) events.push(normalized);
        }
        const matches = Number(payload?.AcsEvent?.numOfMatches ?? rows.length);
        position += Math.max(1, matches);
        const status = String(payload?.AcsEvent?.responseStatusStrg ?? "").toLowerCase();
        if (matches < 1 || rows.length < 1 || status !== "more") {
          events.sort((a, b) => String(a.punched_at).localeCompare(String(b.punched_at)));
          return events;
        }
      }
      events.sort((a, b) => String(a.punched_at).localeCompare(String(b.punched_at)));
      return events;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Hikvision AcsEvent search failed.");
}
