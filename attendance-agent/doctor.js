#!/usr/bin/env node
/**
 * Pre-flight checks: Hikvision ISAPI reachability + Centrix auth + device registration.
 * Usage: node doctor.js   (requires config.json)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "config.json");

function basicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function fetchWithDigest(url, { method = "GET", body, username, password } = {}) {
  const first = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (first.status !== 401) return first;

  const www = first.headers.get("www-authenticate") || "";
  if (!/digest/i.test(www)) {
    return fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: basicAuthHeader(username, password),
        ...(body ? { "Content-Type": "application/json" } : {}),
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
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function deviceBaseUrl(hik) {
  const scheme = hik.useHttps ? "https" : "http";
  const port = hik.port || (hik.useHttps ? 443 : 80);
  return `${scheme}://${hik.host}:${port}`;
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
}

async function main() {
  if (!existsSync(CONFIG_PATH)) {
    console.error("Missing config.json — copy config.example.json and edit it first.");
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  let failed = 0;

  console.log("\n1) Hikvision ISAPI (LAN)");
  try {
    const hik = config.hikvision;
    const url = `${deviceBaseUrl(hik)}/ISAPI/System/deviceInfo`;
    const res = await fetchWithDigest(url, {
      username: hik.username || "admin",
      password: hik.password || "",
    });
    if (!res.ok) {
      fail(`deviceInfo HTTP ${res.status}`);
      failed += 1;
    } else {
      const text = await res.text();
      const model = text.match(/<model>([^<]+)</i)?.[1] || text.match(/"model"\s*:\s*"([^"]+)"/)?.[1];
      ok(`Reached ${hik.host}${model ? ` (${model})` : ""}`);
    }
  } catch (err) {
    fail(err.message);
    failed += 1;
  }

  console.log("\n2) Centrix API auth");
  try {
    const base = String(config.centrixApiUrl).replace(/\/$/, "");
    const res = await fetch(`${base}/auth/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.centrixToken}`,
      },
    });
    if (!res.ok) {
      fail(`auth/me HTTP ${res.status} — token invalid or expired`);
      failed += 1;
    } else {
      const me = await res.json();
      const name = me?.user?.full_name || me?.user?.username || me?.username || "user";
      ok(`Authenticated as ${name}`);
    }
  } catch (err) {
    fail(err.message);
    failed += 1;
  }

  console.log("\n3) Clock device registered in Centrix");
  try {
    const base = String(config.centrixApiUrl).replace(/\/$/, "");
    const res = await fetch(`${base}/attendance-clock-devices?per_page=100`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.centrixToken}`,
      },
    });
    if (!res.ok) {
      fail(`attendance-clock-devices HTTP ${res.status}`);
      failed += 1;
    } else {
      const json = await res.json();
      const rows = json?.data ?? json ?? [];
      const list = Array.isArray(rows) ? rows : [];
      const match = list.find(
        (d) => String(d.device_no).toLowerCase() === String(config.deviceNo).toLowerCase(),
      );
      if (!match) {
        fail(
          `device_no "${config.deviceNo}" not found — register it in HR → Attendance → Clock devices`,
        );
        failed += 1;
      } else if (match.is_active === false) {
        fail(`device_no "${config.deviceNo}" exists but is inactive`);
        failed += 1;
      } else {
        ok(`Device ${config.deviceNo} is registered and active`);
      }
    }
  } catch (err) {
    fail(err.message);
    failed += 1;
  }

  console.log("");
  if (failed) {
    console.error(`Doctor found ${failed} issue(s). Fix them before live punches.`);
    process.exit(1);
  }
  console.log("All checks passed. Next: clock once on the terminal, then run: npm run once");
  console.log("Then confirm the session in Centrix HR → Attendance.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
