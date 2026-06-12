import { getToken, clearSession } from "./auth-storage";

const baseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

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
      return data.message;
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

export async function apiRequest(path, options = {}) {
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
    method: options.method ?? "GET",
    headers,
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

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      clearSession();
      localStorage.removeItem("pos_erp_active_session");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?reason=session");
      }
    }
    throw new ApiError(formatApiErrorMessage(data, res.statusText), res.status, data);
  }

  return data;
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

  const res = await fetch(url.toString(), { method: "GET", headers });
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

export async function uploadEmployeePhoto(employeeId, file) {
  return apiUpload(`/employees/${employeeId}/photo`, file);
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

  const res = await fetch(url.toString(), { method: "POST", headers, body: formData });
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
