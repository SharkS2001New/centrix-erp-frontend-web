#!/usr/bin/env node
/**
 * Shared Hikvision ISAPI helpers for the attendance agent.
 */

import { createHash, randomUUID } from "node:crypto";

export const AGENT_VERSION = "2.0.0";

export function deviceBaseUrl(hik) {
  const scheme = hik.useHttps ? "https" : "http";
  let port = Number(hik.port || (hik.useHttps ? 443 : 80));
  if (port === 8000 && !hik.useHttps) port = 80;
  return `${scheme}://${hik.host}:${port}`;
}

export function basicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/** Digest auth helper for Hikvision ISAPI (common on DS-K1T series). */
export async function fetchWithDigest(
  url,
  { method = "GET", body, username, password, headers = {}, accept = "application/json" } = {},
) {
  const first = await fetch(url, {
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
    return fetch(url, {
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

  return fetch(url, {
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
