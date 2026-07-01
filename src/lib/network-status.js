import { apiV1BaseUrl } from "./api";

/** How often to probe API reachability while the app tab is visible and healthy. */
export const NETWORK_PING_INTERVAL_MS = 60_000;

/** Faster probes while offline or slow so the banner clears soon after recovery. */
export const NETWORK_DEGRADED_PING_INTERVAL_MS = 5_000;

/** Round-trip above this is shown as a slow connection (not the same as slow API call reports). */
export const NETWORK_SLOW_THRESHOLD_MS = 5_000;

/** Abort health probe after this — treated as offline/unreachable. */
export const NETWORK_PING_TIMEOUT_MS = 12_000;

/** Minimum outage length before auto-reporting after reconnect. */
export const NETWORK_OUTAGE_REPORT_MIN_MS = 10_000;

/** @type {Promise<{ ok: boolean, latencyMs: number }> | null} */
let healthPingInFlight = null;

/**
 * Lightweight reachability check — uses public /health (no auth required).
 * @returns {Promise<{ ok: boolean, latencyMs: number }>}
 */
export async function pingApiHealth() {
  if (healthPingInFlight) {
    return healthPingInFlight;
  }

  healthPingInFlight = pingApiHealthRequest().finally(() => {
    healthPingInFlight = null;
  });

  return healthPingInFlight;
}

async function pingApiHealthRequest() {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_PING_TIMEOUT_MS);

  try {
    const res = await fetch(`${apiV1BaseUrl()}/health?connectivity=1`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      // Public probe — omit cookies so cross-origin POS installs are not blocked by CORS credentials rules.
      credentials: "omit",
      cache: "no-store",
    });
    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - started,
    );
    let bodyOk = res.ok;
    if (bodyOk) {
      try {
        const body = await res.json();
        bodyOk = body?.ok !== false;
      } catch {
        bodyOk = false;
      }
    }

    return { ok: bodyOk, latencyMs };
  } catch {
    const latencyMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - started,
    );
    return { ok: false, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {boolean} browserOnline
 * @param {boolean} apiOk
 * @param {number} latencyMs
 * @returns {'online' | 'offline' | 'slow'}
 */
export function resolveNetworkStatus(browserOnline, apiOk, latencyMs) {
  if (!browserOnline || !apiOk) return "offline";
  if (latencyMs >= NETWORK_SLOW_THRESHOLD_MS) return "slow";
  return "online";
}
