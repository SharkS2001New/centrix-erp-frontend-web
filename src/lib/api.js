import { getToken, clearSession, isScreenLocked } from "./auth-storage";
import { apiFetchCredentials, useCookieAuth } from "./auth-config";
import { beginAppLoading, endAppLoading, isPageNavigationLoading } from "./app-loading";
import { emitSystemIssue } from "./system-issue-dispatcher";
import { logApiErrorIssue, logSlowRequestIssue } from "./system-issue-reports";

const baseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export function apiV1BaseUrl() {
  return baseUrl();
}

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
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
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

function shouldTrackNavigationFetch(options, method) {
  if (options.loading === false) return false;
  if (method !== "GET") return false;
  return isPageNavigationLoading();
}

export async function apiRequest(path, options = {}) {
  const method = options.method ?? "GET";
  const trackNavigation = shouldTrackNavigationFetch(options, method);
  const trackIssues = options.reportIssues !== false;
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const apiPath = path.startsWith("http") ? new URL(path).pathname : path;

  if (trackNavigation) beginAppLoading(options.loadingLabel ?? "Loading…");

  try {
    const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
    if (options.searchParams) {
      for (const [k, v] of Object.entries(options.searchParams)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
      }
    }

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
      if (res.status === 401 && typeof window !== "undefined") {
        const code = data?.code;
        const locked = isScreenLocked();
        const stayOnPageWhileLocked =
          locked && code !== "session_active_elsewhere";

        if (!stayOnPageWhileLocked) {
          if (!isAuthEndpoint(path)) {
            await revokeServerAuthSession();
          }
          clearSession();
          localStorage.removeItem("pos_erp_active_session");
          const loginPath = "/login";
          if (!window.location.pathname.startsWith(loginPath)) {
            const reason =
              code === "session_idle_timeout"
                ? "idle"
                : code === "session_active_elsewhere"
                  ? "session"
                  : "auth";
            window.location.assign(`${loginPath}?reason=${reason}`);
          }
        }
      }

      const errorMessage = formatApiErrorMessage(data, res.statusText);
      if (trackIssues) {
        const report = await logApiErrorIssue({
          path: apiPath,
          method,
          status: res.status,
          message: errorMessage,
          durationMs,
        });
        if (report?.id) {
          emitSystemIssue({
            type: "error",
            message: errorMessage,
            reportId: report.id,
            apiPath,
            httpMethod: method,
            httpStatus: res.status,
            durationMs,
          });
        }
      }
      throw new ApiError(errorMessage, res.status, data);
    }

    if (trackIssues) {
      const slowReport = await logSlowRequestIssue({
        path: apiPath,
        method,
        status: res.status,
        durationMs,
      });
      if (slowReport?.id) {
        emitSystemIssue({
          type: "slow",
          message: `Slow response (${Math.round(durationMs / 1000)}s)`,
          reportId: slowReport.id,
          apiPath,
          httpMethod: method,
          httpStatus: res.status,
          durationMs,
        });
      }
    }

    return data;
  } catch (error) {
    if (trackIssues && !(error instanceof ApiError)) {
      const durationMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      const message = error instanceof Error ? error.message : "Network request failed";
      const report = await logApiErrorIssue({
        path: apiPath,
        method,
        status: 0,
        message,
        durationMs,
      });
      if (report?.id) {
        emitSystemIssue({
          type: "error",
          message,
          reportId: report.id,
          apiPath,
          httpMethod: method,
          httpStatus: 0,
          durationMs,
        });
      }
    }
    throw error;
  } finally {
    if (trackNavigation) endAppLoading();
  }
}

/** Multipart upload (e.g. customer shop image). */
export async function apiUpload(path, file, fieldName = "image") {
  const url = new URL(path.startsWith("http") ? path : `${baseUrl()}${path}`);
  const token = getToken();
  const formData = new FormData();
  formData.append(fieldName, file);

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
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : res.statusText || "Upload failed";
    throw new ApiError(msg, res.status, data);
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
    formData.append(`${fieldName}[]`, file);
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
  if (payload.photo instanceof File) formData.append("photo", payload.photo);
  if (payload.signature instanceof File) formData.append("signature", payload.signature);

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
      formData.append(key, value);
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
