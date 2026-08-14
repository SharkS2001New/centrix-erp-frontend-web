#!/usr/bin/env node
/**
 * Shared Hikvision ISAPI helpers for the attendance agent.
 */

import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";

export const AGENT_VERSION = "2.2.7";

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

function targetHostPort(targetUrl = "") {
  try {
    if (!targetUrl) return "";
    const u = new URL(targetUrl);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return `${u.hostname}:${port}`;
  } catch {
    return targetUrl;
  }
}

function collectErrorFacts(err) {
  const messages = [];
  const codes = [];
  let syscall = "";
  let address = "";
  let port = "";
  let cur = err;
  for (let i = 0; i < 6 && cur; i += 1) {
    const msg = String(cur.message || cur).trim();
    if (msg && !messages.includes(msg)) messages.push(msg);
    const code = cur.code || cur.errno;
    if (code != null && !codes.includes(String(code))) codes.push(String(code));
    if (!syscall && cur.syscall) syscall = String(cur.syscall);
    if (!address && cur.address) address = String(cur.address);
    if (!port && cur.port) port = String(cur.port);
    cur = cur.cause;
  }
  return { messages, codes, syscall, address, port };
}

/**
 * Turn Node/browser network noise into a specific LAN diagnosis.
 */
export function describeNetworkError(err, targetUrl = "") {
  const existing = String(err?.message || err || "").trim();
  if (
    /^(Nothing accepted the connection|Timed out waiting|Could not resolve|This PC has no route|HTTPS to |Could not complete HTTP to |Hikvision request to )/i.test(
      existing,
    )
  ) {
    return existing;
  }

  const { messages, codes, syscall, address, port } = collectErrorFacts(err);
  const blob = [...messages, ...codes, syscall].join(" ").toLowerCase();
  const host = targetHostPort(targetUrl) || (address && port ? `${address}:${port}` : address);
  const where = host ? `Hikvision at ${host}` : "the Hikvision terminal";

  if (/econnrefused/.test(blob)) {
    return (
      `Nothing accepted the connection on ${where}. ` +
      "Wrong LAN IP or port (use HTTP 80, not 8000), or ISAPI/web is disabled on the device."
    );
  }
  if (/etimedout|timed out|timeout/.test(blob)) {
    return (
      `Timed out waiting for ${where}. ` +
      "The IP may be wrong, the device is slow/offline, or a firewall is dropping the packets. Ping that IP from this PC."
    );
  }
  if (/enotfound|err_name_not_resolved|getaddrinfo/.test(blob)) {
    return (
      `Could not resolve the device hostname for ${where}. ` +
      "Use the numeric LAN IP (example 192.168.100.215), not a name the PC cannot look up."
    );
  }
  if (/ehostunreach|enetunreach/.test(blob)) {
    return (
      `This PC has no route to ${where}. ` +
      "Wi‑Fi guest isolation or a different subnet — browse to the device IP from this same PC to confirm."
    );
  }
  if (/cert|unauthorised|unauthorized|self[- ]signed|unable to verify/.test(blob) && /https/.test(String(targetUrl))) {
    return (
      `HTTPS to ${where} failed certificate checks. ` +
      "Uncheck “Device uses HTTPS on LAN” unless the terminal is actually on HTTPS."
    );
  }
  if (/econnreset|socket hang up|other side closed|econnaborted|epipe/.test(blob)) {
    return (
      `${where} closed the HTTP connection. ` +
      "Usually wrong protocol (HTTP vs HTTPS), the device rejected digest auth, or firmware dropped keep-alive. " +
      "Confirm username/password and that HTTPS is only enabled if the device uses it."
    );
  }
  if (/network.?error|fetch failed|fetch resource|und_err/.test(blob)) {
    return (
      `Could not complete HTTP to ${where}. ` +
      "Same-LAN is not enough if the agent cannot finish ISAPI (digest auth / closed socket). " +
      "Open the device web page from this PC, confirm port 80, then try again." +
      (codes[0] ? ` (code ${codes[0]})` : "")
    );
  }

  const joined = messages
    .filter((m) => !/network.?error when attempting to fetch resource/i.test(m))
    .join(" — ");
  return joined
    ? `Hikvision request to ${where} failed: ${joined}`
    : `Hikvision request to ${where} failed.`;
}

/**
 * Node's built-in fetch (undici) often fails against Hikvision firmware:
 * digest 401 + keep-alive reuse → "NetworkError when attempting to fetch resource."
 * Use node:http/https, IPv4, Connection: close, and always drain the 401 body.
 */
function hikvisionRequest(url, { method = "GET", headers = {}, body = null, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      done(reject, new Error(`Invalid Hikvision URL: ${url}`));
      return;
    }

    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = body == null ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const reqHeaders = {
      Connection: "close",
      Accept: headers.Accept || headers.accept || "application/json",
      ...headers,
    };
    if (payload) {
      reqHeaders["Content-Type"] = reqHeaders["Content-Type"] || reqHeaders["content-type"] || "application/json";
      reqHeaders["Content-Length"] = String(payload.length);
    }

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: reqHeaders,
        family: 4,
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const headerMap = {};
          for (const [key, value] of Object.entries(res.headers || {})) {
            headerMap[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
          }
          done(resolve, {
            status: res.statusCode || 0,
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            headers: {
              get(name) {
                return headerMap[String(name).toLowerCase()] ?? null;
              },
              forEach(callback) {
                for (const [key, value] of Object.entries(headerMap)) {
                  callback(value, key);
                }
              },
            },
            async text() {
              return buffer.toString("utf8");
            },
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy();
      done(reject, new Error(describeNetworkError(new Error(`Timed out after ${timeoutMs}ms`), url)));
    });
    req.on("error", (err) => {
      done(reject, new Error(describeNetworkError(err, url)));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function digestAuthorization(wwwAuthenticate, { method, url, username, password }) {
  const parts = Object.fromEntries(
    [...String(wwwAuthenticate).matchAll(/(\w+)=(?:"([^"]+)"|([^\s,]+))/g)].map((m) => [
      m[1].toLowerCase(),
      m[2] ?? m[3],
    ]),
  );
  const realm = parts.realm || "";
  const nonce = parts.nonce || "";
  const qop = (parts.qop || "auth").split(",")[0].trim();
  const opaque = parts.opaque;
  const algorithm = parts.algorithm || "MD5";
  const nc = "00000001";
  const cnonce = randomUUID().replace(/-/g, "").slice(0, 16);
  const uri = new URL(url).pathname + new URL(url).search;
  const ha1 = createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
  const ha2 = createHash("md5").update(`${method}:${uri}`).digest("hex");
  const response = createHash("md5")
    .update(qop ? `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}` : `${ha1}:${nonce}:${ha2}`)
    .digest("hex");
  return (
    `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
    `algorithm=${algorithm}, response="${response}"` +
    (qop ? `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"` : "") +
    (opaque ? `, opaque="${opaque}"` : "")
  );
}

/** Digest auth helper for Hikvision ISAPI (common on DS-K1T series). */
export async function fetchWithDigest(
  url,
  { method = "GET", body, username, password, headers = {}, accept = "application/json" } = {},
) {
  const commonHeaders = {
    Accept: accept,
    ...headers,
  };
  if (body != null && !commonHeaders["Content-Type"] && !commonHeaders["content-type"]) {
    commonHeaders["Content-Type"] = "application/json";
  }

  let first;
  try {
    first = await hikvisionRequest(url, { method, headers: commonHeaders, body });
  } catch (err) {
    throw new Error(describeNetworkError(err, url));
  }
  if (first.status !== 401) return first;

  const www = first.headers.get("www-authenticate") || "";
  try {
    if (!/digest/i.test(www)) {
      return await hikvisionRequest(url, {
        method,
        headers: {
          ...commonHeaders,
          Authorization: basicAuthHeader(username, password),
        },
        body,
      });
    }

    return await hikvisionRequest(url, {
      method,
      headers: {
        ...commonHeaders,
        Authorization: digestAuthorization(www, { method, url, username, password }),
      },
      body,
    });
  } catch (err) {
    throw new Error(describeNetworkError(err, url));
  }
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
    row.employeeNoString ?? row.employeeNo ?? row.EmployeeNo ?? row.cardNo ?? "",
  ).trim();
  const punchedAt = String(row.time ?? row.dateTime ?? row.Time ?? "").trim();
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
    { major: 5, minor: 75 },
    { major: 5, minor: 0 },
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
  let emptyAttempts = 0;
  for (const baseCond of candidates) {
    const searchId = randomUUID().replace(/-/g, "").slice(0, 16);
    try {
      const events = [];
      let rawRows = 0;
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
        const acs = payload?.AcsEvent ?? payload?.acsEvent ?? payload;
        const list = acs?.InfoList ?? acs?.infoList ?? [];
        const rows = Array.isArray(list) ? list : list && typeof list === "object" ? [list] : [];
        rawRows += rows.length;
        for (const row of rows) {
          const normalized = normalizeEventRow(row);
          if (normalized) events.push(normalized);
        }
        const matches = Number(acs?.numOfMatches ?? rows.length);
        position += Math.max(1, matches);
        const status = String(acs?.responseStatusStrg ?? "").toLowerCase();
        if (matches < 1 || rows.length < 1 || status !== "more") {
          break;
        }
      }
      if (events.length) {
        events.sort((a, b) => String(a.punched_at).localeCompare(String(b.punched_at)));
        return events;
      }
      if (rawRows > 0) {
        lastError = new Error(
          `Hikvision returned ${rawRows} event row(s) but none had employee ID + time. Enroll the person with an employee number matching Centrix.`,
        );
      } else {
        emptyAttempts += 1;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (emptyAttempts > 0 && !lastError) {
    return [];
  }
  if (emptyAttempts > 0) {
    return [];
  }

  throw lastError ?? new Error("Hikvision AcsEvent search failed.");
}
