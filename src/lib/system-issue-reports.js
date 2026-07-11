import { postSystemIssueReportRaw } from "./system-issue-api";
import { classifyLatency, formatSlowLatencyMessage } from "./latency-split";

export const SLOW_REQUEST_THRESHOLD_MS = 12000;

const GENERIC_ISSUE_MESSAGE =
  /^an error occurred in .+ please report this to your system administrator\.?$/i;

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

/** Extract technical error detail from an API error body for super-admin issue logs. */
export function extractTechnicalDetailFromApiBody(data) {
  if (!data || typeof data !== "object") return null;

  const parts = [];
  if (data.exception_class) parts.push(String(data.exception_class));
  if (data.detail) parts.push(String(data.detail));
  else if (data.message && data.expose_detail) parts.push(String(data.message));
  if (data.file) parts.push(`at ${data.file}${data.line != null ? `:${data.line}` : ""}`);
  if (data.technical_detail) return String(data.technical_detail);
  if (data.trace) return String(data.trace);
  if (data.stack) return String(data.stack);

  return parts.length ? parts.join(" ") : null;
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
  issueReportId,
  apiBody,
}) {
  if (!shouldAutoLogApiError(path, status)) return null;

  // Server-side reporter owns HTTP 500 logs with full stack traces.
  if (status >= 500) {
    return issueReportId ? { id: issueReportId } : null;
  }

  const technicalDetail = extractTechnicalDetailFromApiBody(apiBody);
  const logMessage = technicalDetail
    ? String(technicalDetail).split("\n")[0].slice(0, 500)
    : String(message ?? "Request failed").slice(0, 500);

  if (!technicalDetail && GENERIC_ISSUE_MESSAGE.test(String(message ?? "").trim())) {
    return null;
  }

  return submitSystemIssueReport({
    kind: "error",
    message: logMessage,
    api_path: path,
    http_method: method,
    http_status: status,
    duration_ms: durationMs ?? null,
    context: {
      ...(context ?? {}),
      user_message: message,
      ...(technicalDetail ? { technical_detail: technicalDetail } : {}),
    },
  });
}

export async function logSlowRequestIssue({
  path,
  method,
  status,
  durationMs,
  serverMs = null,
}) {
  if (!shouldPromptSlowRequest(path, durationMs)) return null;

  const split = classifyLatency({ clientRttMs: durationMs, serverMs });

  return submitSystemIssueReport({
    kind: "slow",
    message: formatSlowLatencyMessage({
      mode: "request",
      clientRttMs: durationMs,
      serverMs,
    }),
    api_path: path,
    http_method: method,
    http_status: status ?? null,
    duration_ms: durationMs,
    context: {
      connectivity: "slow_request",
      ...split,
    },
  });
}
