/**
 * Centrix Attendance Agent — local Windows service health (office PC, port 9251).
 * Cloud Centrix talks to Hikvision through this agent; it is not the Centrix API.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:9251";
const HEALTH_PATH = "/v1/health";
const STATUS_PATH = "/api/status";
const HEALTH_TIMEOUT_MS = 1500;

export const ATTENDANCE_AGENT_DEFAULTS = {
  baseUrl: DEFAULT_BASE_URL,
};

export const ATTENDANCE_AGENT_NOT_RUNNING_MESSAGE =
  "CentrixAttendanceAgent is not running on this PC. Open Windows Services and start CentrixAttendanceAgent, or run BUILD-AND-INSTALL.bat as Administrator.";

export const ATTENDANCE_AGENT_TIMEOUT_MESSAGE =
  "Centrix could not reach the attendance agent in time. Confirm CentrixAttendanceAgent is running on the office PC (Windows Services), wait a minute, then try again.";

export function normalizeAttendanceAgentConfig(raw = {}) {
  return {
    baseUrl: String(raw.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "") || DEFAULT_BASE_URL,
  };
}

function agentUrl(config, path) {
  return `${config.baseUrl}${path}`;
}

/** True when the path is served by Centrix cloud for Hikvision / attendance agent bridge. */
export function isAttendanceAgentApiPath(path) {
  const normalized = String(path ?? "");
  return (
    /\/attendance-clock-devices\/\d+\/hikvision(?:\/|$|\?)/i.test(normalized) ||
    /\/attendance\/sync-from-devices(?:\/|$|\?)/i.test(normalized)
  );
}

/** Map fetch failures on attendance agent routes to actionable copy (not generic offline). */
export function userFacingAttendanceAgentError(error, fallback = ATTENDANCE_AGENT_TIMEOUT_MESSAGE) {
  if (!error) return fallback;
  if (error instanceof Error && error.message?.trim()) {
    const message = error.message.trim();
    if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) {
      return fallback;
    }
    return message;
  }
  return fallback;
}

/** Ping the local attendance agent status page. Returns null when unreachable. */
export async function checkAttendanceAgentHealth(
  config = ATTENDANCE_AGENT_DEFAULTS,
  { timeoutMs = HEALTH_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(agentUrl(config, HEALTH_PATH), {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    return {
      ok: Boolean(body.ok ?? body.ready),
      version: body.version ?? null,
      deviceNo: body.device_no ?? body.deviceNo ?? null,
      hikvisionHost: body.hikvision_host ?? body.hikvisionHost ?? null,
      raw: body,
    };
  } catch {
    try {
      const res = await fetch(agentUrl(config, STATUS_PATH), {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      return {
        ok: Boolean(body.ready),
        version: body.version ?? null,
        deviceNo: body.device_no ?? null,
        hikvisionHost: body.hikvision_host ?? null,
        raw: body,
      };
    } catch {
      return null;
    }
  } finally {
    clearTimeout(timer);
  }
}
