import { getToken } from "./auth-storage";

const baseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
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
    const msg =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : res.statusText || "Request failed";
    throw new ApiError(msg, res.status, data);
  }

  return data;
}
