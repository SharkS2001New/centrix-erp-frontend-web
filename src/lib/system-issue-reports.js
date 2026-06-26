import { postSystemIssueReportRaw } from "./system-issue-api";

export const SLOW_REQUEST_THRESHOLD_MS = 12000;

const recentFingerprints = new Map();
const DEDUPE_MS = 60_000;

function fingerprint(payload) {
  return `${payload.kind}|${payload.api_path ?? ""}|${payload.message}|${payload.http_status ?? ""}`;
}

function shouldDedupe(payload) {
  const key = fingerprint(payload);
  const now = Date.now();
  const last = recentFingerprints.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recentFingerprints.set(key, now);
  return false;
}

function currentPageUrl() {
  if (typeof window === "undefined") return null;
  return window.location.pathname + window.location.search;
}

/**
 * @param {{
 *   kind: 'error' | 'slow' | 'user_report',
 *   message: string,
 *   user_notes?: string,
 *   api_path?: string,
 *   http_method?: string,
 *   http_status?: number | null,
 *   duration_ms?: number | null,
 *   context?: Record<string, unknown>,
 *   reported_by_user?: boolean,
 *   report_id?: string,
 * }} payload
 */
export async function submitSystemIssueReport(payload, options = {}) {
  if (shouldDedupe(payload) && !options.force) {
    return null;
  }

  try {
    return await postSystemIssueReportRaw({
      ...payload,
      page_url: payload.page_url ?? currentPageUrl(),
      reported_by_user: Boolean(payload.reported_by_user),
    });
  } catch {
    return null;
  }
}

export function shouldAutoLogApiError(path, status) {
  if (isIgnoredIssuePath(path)) return false;
  if (path === "/health" || path.endsWith("/health")) return false;
  if (status === 401 || status === 403 || status === 404 || status === 422) return false;
  return status >= 500 || status === 0;
}

export function shouldPromptSlowRequest(path, durationMs) {
  if (isIgnoredIssuePath(path)) return false;
  if (path === "/health" || path.endsWith("/health")) return false;
  return durationMs >= SLOW_REQUEST_THRESHOLD_MS;
}

function isIgnoredIssuePath(path) {
  const normalized = String(path ?? "");
  return (
    normalized.includes("/auth/")
    || normalized.includes("/system-issue-reports")
    || normalized.includes("/background-tasks/")
  );
}

export async function logApiErrorIssue({
  path,
  method,
  status,
  message,
  durationMs,
  context,
}) {
  if (!shouldAutoLogApiError(path, status)) return null;

  return submitSystemIssueReport({
    kind: "error",
    message: String(message ?? "Request failed").slice(0, 500),
    api_path: path,
    http_method: method,
    http_status: status,
    duration_ms: durationMs ?? null,
    context,
  });
}

export async function logSlowRequestIssue({
  path,
  method,
  status,
  durationMs,
}) {
  if (!shouldPromptSlowRequest(path, durationMs)) return null;

  return submitSystemIssueReport({
    kind: "slow",
    message: `Slow response (${Math.round(durationMs / 1000)}s)`,
    api_path: path,
    http_method: method,
    http_status: status ?? null,
    duration_ms: durationMs,
  });
}
