import { getToken, clearSession, isScreenLocked, canSeeServerErrorDetail } from "./auth-storage";
import { isLicenseExpiredApiCode } from "./organization-license";
import { apiFetchCredentials, useCookieAuth } from "./auth-config";
import { apiV1BaseUrl } from "./api-base-url";
import { beginAppLoading, endAppLoading, isPageNavigationLoading } from "./app-loading";
import { emitSystemIssue } from "./system-issue-dispatcher";
import { logApiErrorIssue, logSlowRequestIssue } from "./system-issue-reports";
import { formatSlowLatencyMessage, parseServerDurationMs } from "./latency-split";
import { notifyError as showErrorToast } from "./notify";
import { handleCacheInvalidation } from "./cache-invalidation";
import { mayAffectInAppNotifications, notifyNotificationsChanged } from "./notification-events";
import { compressImageFileIfNeeded } from "./image-compress";

const baseUrl = () => apiV1BaseUrl();

export { apiV1BaseUrl };

/** Clear HttpOnly session cookie on the API (cookie-auth mode only). */
export async function revokeServerAuthSession() {
  if (!useCookieAuth || typeof window === "undefined") {
    return;
  }
  try {
    await fetch(`${baseUrl()}/auth/logout`, {
      method: "POST",
      credentials: apiFetchCredentials(),
      headers: { Accept: "application/json" },
    });
  } catch {
    /* ignore */
  }
}

function isAuthEndpoint(path) {
  const normalized = path.startsWith("http") ? new URL(path).pathname : path;
  return normalized.includes("/auth/login") || normalized.includes("/auth/logout");
}

export function apiBaseOrigin() {
  return baseUrl().replace(/\/api\/v1\/?$/, "");
}

/**
 * Rewrites authenticated API file URLs to the browser's configured API origin.
 * Backend serializers often use APP_URL, which may differ from NEXT_PUBLIC_API_URL.
 */
export function resolveProtectedFileUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return trimmed;

  const origin = apiBaseOrigin();

  if (trimmed.startsWith("/api/v1/") || trimmed.startsWith("/api/")) {
    return `${origin}${trimmed}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith("/api/v1/") || parsed.pathname.startsWith("/api/")) {
        return `${origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }

  return null;
}

/** Turn API storage paths into absolute URLs the browser can load. */
export function resolveCustomerMediaUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const origin = apiBaseOrigin();
  if (trimmed.startsWith("/storage/")) return `${origin}${trimmed}`;
  if (trimmed.startsWith("storage/")) return `${origin}/${trimmed}`;
  return `${origin}/storage/${trimmed.replace(/^\//, "")}`;
}

export class ApiError extends Error {
  constructor(message, status, body, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.systemIssuePrompted = Boolean(options.systemIssuePrompted);
  }
}

export { canSeeServerErrorDetail };

/** Message for the system-issue popup (generic for staff; technical for admins). */
export function formatSystemIssueMessage(data, statusText, apiPath) {
  if (canSeeServerErrorDetail() || (data && typeof data === "object" && data.expose_detail === true)) {
    const detail = formatApiErrorMessage(data, statusText);
    if (detail && !/^request failed$/i.test(detail)) {
      return detail;
    }
  }

  return `An error occurred in ${apiModuleLabel(apiPath)}. Please report this to your system administrator.`;
}

/** @param {unknown} error */
export function isSessionConflictError(error) {
  return (
    error instanceof ApiError
    && error.status === 403
    && (error.body?.code === "session_active_elsewhere"
      || String(error.message ?? "").toLowerCase().includes("another device"))
  );
}

export { isLicenseExpiredApiError, isLicenseExpiredApiCode } from "./organization-license";

/** @param {unknown} error */
export function isMissingProductWeightsError(error) {
  return error instanceof ApiError && error.body?.code === "missing_product_weights";
}

/** @param {unknown} error */
export function missingProductWeightsFromError(error) {
  if (!isMissingProductWeightsError(error)) return [];
  return Array.isArray(error.body?.products) ? error.body.products : [];
}

function dedupeRepeatedText(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return trimmed;

  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 2 && sentences.every((sentence) => sentence === sentences[0])) {
    return sentences[0];
  }

  const mid = Math.floor(trimmed.length / 2);
  const first = trimmed.slice(0, mid).trim();
  const second = trimmed.slice(mid).trim().replace(/^\.\s*/, "");
  if (first && second === first) return first;

  return trimmed;
}

/** Prefer first Laravel validation message over generic text. */
export function formatApiErrorMessage(data, fallback = "Request failed") {
  if (typeof data === "object" && data !== null) {
    const errors = data.errors;
    if (errors && typeof errors === "object") {
      for (const messages of Object.values(errors)) {
        if (Array.isArray(messages) && messages[0]) {
          return String(messages[0]);
        }
      }
    }
    if (data.expose_detail === true) {
      if (typeof data.detail === "string" && data.detail.trim()) {
        return data.detail.trim();
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
    }
    if (typeof data.message === "string" && data.message.trim()) {
      const detail = typeof data.detail === "string" && data.detail.trim() ? data.detail.trim() : "";
      const message = data.message.trim();
      if (/^server error$/i.test(message) && detail) {
        return detail;
      }
      if (detail && detail !== message && !message.includes(detail) && !detail.includes(message)) {
        return `${message} ${detail}`;
      }
      return dedupeRepeatedText(message);
    }
    if (typeof data.detail === "string" && data.detail.trim()) {
      return data.detail.trim();
    }
    if (typeof data.error === "object" && data.error !== null) {
      if (typeof data.error.errorMessage === "string" && data.error.errorMessage.trim()) {
        return data.error.errorMessage;
      }
      if (typeof data.error.message === "string" && data.error.message.trim()) {
        return data.error.message;
      }
    }
  }
  return fallback || "Request failed";
}

/** Map an API path to a user-facing module label. */
export function apiModuleLabel(path) {
  const normalized = String(path ?? "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api\/v1\//i, "")
    .replace(/^\/api\//i, "")
    .replace(/^\/+/, "");
  const first = normalized.split("/").filter(Boolean)[0] ?? "application";

  const labels = {
    organizations: "Platform",
    sales: "Sales",
    inventory: "Inventory",
    fulfillment: "Distribution",
    dispatch: "Distribution",
    trips: "Distribution",
    hr: "Human resources",
    employees: "Human resources",
    payroll: "Human resources",
    accounting: "Accounting",
    admin: "Administration",
    products: "Products",
    customers: "Customers",
    suppliers: "Suppliers",
    "lpo-mst": "Purchasing",
    lpo: "Purchasing",
    expenses: "Expenses",
    reports: "Reports",
    erp: "Settings",
    notifications: "Notifications",
    "action-requests": "Approvals",
  };

  return labels[first] ?? first.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * User-facing message for form submit / save failures.
 * Super admins see backend detail; everyone else gets a module-scoped generic message.
 */
export function resolveSubmitErrorMessage(error, options = {}) {
  const { isSuperAdmin = false, moduleName, apiPath } = options;
  const moduleLabel = moduleName || (apiPath ? apiModuleLabel(apiPath) : "this module");
  const technicalViewer = isSuperAdmin || canSeeServerErrorDetail();

  if (error instanceof ApiError) {
    if (error.systemIssuePrompted && !technicalViewer) {
      return `An error occurred in ${moduleLabel}. Please report this to your system administrator.`;
    }

    const body = error.body && typeof error.body === "object" ? error.body : null;
    if (body?.expose_detail === true || technicalViewer) {
      const detail = typeof body?.detail === "string" && body.detail.trim()
        ? body.detail.trim()
        : formatApiErrorMessage(body, "");
      if (detail) return detail;
    }
    if (body?.message && String(body.message).trim()) {
      return String(body.message).trim();
    }
    if (error.message && !/^server error$/i.test(error.message)) {
      return error.message;
    }
  }

  if (technicalViewer && error instanceof Error && error.message?.trim()) {
    return error.message.trim();
  }

  return `An error occurred in ${moduleLabel}. Please report this to your system administrator.`;
}

/** Prefer this over notifyError for API failures — skips toast when the system popup already opened. */
export function notifyActionError(error, fallback = "Request failed") {
  if (error instanceof ApiError && error.systemIssuePrompted) {
    return;
  }
  const message =
    error instanceof ApiError
      ? formatApiErrorMessage(error.body, error.message || fallback)
      : error instanceof Error
        ? error.message
        : fallback;
  showErrorToast(message || fallback);
}

function shouldTrackNavigationFetch(options, method) {
  if (options.loading === false) return false;
  if (method !== "GET") return false;
  return isPageNavigationLoading();
}

/** @type {Map<string, Promise<unknown>>} */
const inflightGetRequests = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildApiUrl(path, searchParams) {
  const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  return url;
}

function getInflightDedupeKey(method, urlString) {
  if (method !== "GET") return null;
  return `GET:${urlString}`;
}

export async function apiRequest(path, options = {}) {
  const method = options.method ?? "GET";
  const url = buildApiUrl(path, options.searchParams);
  const dedupeKey = options.dedupe === false ? null : getInflightDedupeKey(method, url.toString());

  if (dedupeKey && inflightGetRequests.has(dedupeKey)) {
    return inflightGetRequests.get(dedupeKey);
  }

  const promise = performApiRequest(path, url, { ...options, method });
  if (dedupeKey) {
    inflightGetRequests.set(dedupeKey, promise);
    promise.finally(() => {
      if (inflightGetRequests.get(dedupeKey) === promise) {
        inflightGetRequests.delete(dedupeKey);
      }
    });
  }

  return promise;
}

async function performApiRequest(path, url, options = {}) {
  const method = options.method ?? "GET";
  const trackNavigation = shouldTrackNavigationFetch(options, method);
  const trackIssues = options.reportIssues !== false;
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const apiPath = path.startsWith("http") ? new URL(path).pathname : path;

  if (trackNavigation) beginAppLoading(options.loadingLabel ?? "Loading…");

  try {
    const token = options.token ?? getToken();
    const headers = {
      Accept: "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      credentials: apiFetchCredentials(),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;

    if (!res.ok) {
      if (
        res.status === 429 &&
        method === "GET" &&
        !options._rateLimitRetried &&
        options.retryOnRateLimit !== false &&
        !options.signal?.aborted
      ) {
        const retryAfterHeader = Number(res.headers.get("Retry-After"));
        const retryMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? Math.min(retryAfterHeader * 1000, 8000)
          : 1500;
        await sleep(retryMs);
        return performApiRequest(path, url, { ...options, _rateLimitRetried: true, reportIssues: false });
      }

      if (typeof window !== "undefined") {
        const code = data?.code;
        const licenseExpired = isLicenseExpiredApiCode(code);

        if (licenseExpired && (res.status === 401 || res.status === 403)) {
          if (!isAuthEndpoint(path)) {
            await revokeServerAuthSession();
          }
          clearSession();
          localStorage.removeItem("pos_erp_active_session");
          if (!window.location.pathname.startsWith("/login")) {
            window.location.assign("/login?reason=license");
          }
        } else if (res.status === 401) {
          const locked = isScreenLocked();
          const stayOnPageWhileLocked =
            locked && code !== "session_active_elsewhere";

          if (!stayOnPageWhileLocked) {
            if (!isAuthEndpoint(path)) {
              await revokeServerAuthSession();
            }
            clearSession();
            localStorage.removeItem("pos_erp_active_session");
            if (!window.location.pathname.startsWith("/login")) {
              const reason =
                code === "session_idle_timeout"
                  ? "idle"
                  : code === "session_active_elsewhere"
                    ? "session"
                    : "auth";
              window.location.assign(`/login?reason=${reason}`);
            }
          }
        }
      }

      const errorMessage = formatApiErrorMessage(data, res.statusText);
      const issueMessage = formatSystemIssueMessage(data, res.statusText, apiPath);
      let systemIssuePrompted = false;
      if (trackIssues) {
        const report = await logApiErrorIssue({
          path: apiPath,
          method,
          status: res.status,
          message: issueMessage,
          durationMs,
          issueReportId: data?.issue_report_id ?? null,
          apiBody: data,
        });
        if (report?.id) {
          systemIssuePrompted = true;
          emitSystemIssue({
            type: "error",
            message: issueMessage,
            reportId: report.id,
            apiPath,
            httpMethod: method,
            httpStatus: res.status,
            durationMs,
          });
        }
      }
      throw new ApiError(errorMessage, res.status, data, { systemIssuePrompted });
    }

    if (trackIssues) {
      const serverMs = parseServerDurationMs(res, data);
      const slowReport = await logSlowRequestIssue({
        path: apiPath,
        method,
        status: res.status,
        durationMs,
        serverMs,
      });
      if (slowReport?.id) {
        emitSystemIssue({
          type: "slow",
          message: formatSlowLatencyMessage({
            mode: "request",
            clientRttMs: durationMs,
            serverMs,
          }),
          reportId: slowReport.id,
          apiPath,
          httpMethod: method,
          httpStatus: res.status,
          durationMs,
        });
      }
    }

    if (mayAffectInAppNotifications(method, apiPath, data)) {
      notifyNotificationsChanged();
    }

    handleCacheInvalidation(method, apiPath);

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    if (trackIssues && !(error instanceof ApiError)) {
      const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      const rawMessage = error instanceof Error ? error.message : "Network request failed";
      const issueMessage = canSeeServerErrorDetail()
        ? rawMessage
        : `An error occurred in ${apiModuleLabel(apiPath)}. Please report this to your system administrator.`;
      const report = await logApiErrorIssue({
        path: apiPath,
        method,
        status: 0,
        message: issueMessage,
        durationMs,
      });
      if (report?.id) {
        emitSystemIssue({
          type: "error",
          message: issueMessage,
          reportId: report.id,
          apiPath,
          httpMethod: method,
          httpStatus: 0,
          durationMs,
        });
        if (error instanceof ApiError) {
          error.systemIssuePrompted = true;
        }
      }
    }
    throw error;
  } finally {
    if (trackNavigation) endAppLoading();
  }
}

/** Multipart upload (e.g. customer shop image). */
export async function apiUpload(path, file, fieldName = "image") {
  const uploadFile = await compressImageFileIfNeeded(file);
  const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
  const token = getToken();
  const formData = new FormData();
  formData.append(fieldName, uploadFile);

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    credentials: apiFetchCredentials(),
    body: formData,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(formatApiErrorMessage(data, res.statusText || "Upload failed"), res.status, data);
  }

  return data;
}

export async function uploadCustomerShopImage(customerNum, file) {
  return apiUpload(`/customers/${customerNum}/shop-image`, file);
}

export async function apiFetchBlob(path) {
  const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: "GET",
    headers,
    credentials: apiFetchCredentials(),
  });
  if (!res.ok) {
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    throw new ApiError(formatApiErrorMessage(data, res.statusText), res.status, data);
  }
  return res.blob();
}

export function employeeDocumentFilePath(employeeId, documentId) {
  return `/employees/${employeeId}/documents/${documentId}/file`;
}

export function lpoAttachmentFilePath(attachmentId) {
  return `/lpo-attachments/${attachmentId}/file`;
}

export async function uploadEmployeePhoto(employeeId, file) {
  return apiUpload(`/employees/${employeeId}/photo`, file);
}

export async function uploadOrganizationLogo(organizationId, file, options = {}) {
  const path = options.uploadPath ?? `/organizations/${organizationId}/logo`;
  return apiUpload(path, file);
}

/** Multipart upload of multiple files; returns a Blob (e.g. ZIP download). */
export async function apiUploadFilesForBlob(path, files, fieldName = "files") {
  const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
  const token = getToken();
  const formData = new FormData();
  for (const file of files) {
    const uploadFile = await compressImageFileIfNeeded(file);
    formData.append(`${fieldName}[]`, uploadFile);
  }

  const headers = { Accept: "application/zip, application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    credentials: apiFetchCredentials(),
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    throw new ApiError(formatApiErrorMessage(data, res.statusText), res.status, data);
  }

  return res.blob();
}

export function organizationLogoFileUrl(organizationId, options = {}) {
  const relative = options.filePath ?? `/organizations/${organizationId}/logo/file`;
  return `${apiBaseOrigin()}/api/v1${relative}`;
}

export async function capturePodDelivery(saleId, payload) {
  const url = new URL(`${baseUrl()}/sales/orders/${saleId}/pod`);
  const token = getToken();
  const formData = new FormData();

  const recipient = payload.recipient_name ?? payload.pod_signer_name;
  if (recipient) formData.append("recipient_name", recipient);
  if (payload.notes ?? payload.pod_notes) formData.append("notes", payload.notes ?? payload.pod_notes);
  if (payload.trip_id) formData.append("trip_id", String(payload.trip_id));
  if (payload.status) formData.append("status", payload.status);
  if (payload.gps_lat != null) formData.append("gps_lat", String(payload.gps_lat));
  if (payload.gps_lng != null) formData.append("gps_lng", String(payload.gps_lng));
  if (payload.lines?.length) formData.append("lines", JSON.stringify(payload.lines));
  if (payload.photo instanceof File) {
    formData.append("photo", await compressImageFileIfNeeded(payload.photo));
  }
  if (payload.signature instanceof File) {
    formData.append("signature", await compressImageFileIfNeeded(payload.signature));
  }

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    credentials: apiFetchCredentials(),
    body: formData,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && typeof data.message === "string"
        ? data.message
        : res.statusText || "POD capture failed";
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

export function podRecordPhotoPath(podRecordId) {
  return `/pod-records/${podRecordId}/photo/file`;
}

export function podRecordSignaturePath(podRecordId) {
  return `/pod-records/${podRecordId}/signature/file`;
}

/** Multipart with extra fields (e.g. employee documents). */
export async function apiUploadForm(path, fields, fileField = "file") {
  const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
  const token = getToken();
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (key === fileField && value instanceof File) {
      formData.append(key, await compressImageFileIfNeeded(value));
    } else {
      formData.append(key, String(value));
    }
  }

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers,
    credentials: apiFetchCredentials(),
    body: formData,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && typeof data.message === "string"
        ? data.message
        : res.statusText || "Upload failed";
    throw new ApiError(msg, res.status, data);
  }
  return data;
}

/** Multipart JSON + optional file (e.g. returns with proof). */
export async function apiRequestMultipart(path, fields, options = {}) {
  const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
  const token = getToken();
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (value instanceof File) {
      formData.append(key, value);
    } else if (typeof value === "object") {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
  }

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: options.method ?? "POST",
    headers,
    credentials: apiFetchCredentials(),
    body: formData,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(formatApiErrorMessage(data, res.statusText || "Request failed"), res.status, data);
  }

  const method = options.method ?? "POST";
  const apiPath = path.startsWith("http") ? new URL(path).pathname : path;
  handleCacheInvalidation(method, apiPath);

  return data;
}

export function customerReturnProofFilePath(returnId) {
  return `/customer-returns/${returnId}/proof/file`;
}

export function supplierReturnProofFilePath(documentId) {
  return `/supplier-return-documents/${documentId}/proof/file`;
}
