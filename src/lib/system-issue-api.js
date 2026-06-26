import { getToken } from "./auth-storage";
import { apiFetchCredentials } from "./auth-config";

const baseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/**
 * Minimal POST for system issue reports — bypasses apiRequest to avoid feedback loops.
 * @param {Record<string, unknown>} body
 */
export async function postSystemIssueReportRaw(body) {
  const token = getToken();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl()}/system-issue-reports`, {
    method: "POST",
    headers,
    credentials: apiFetchCredentials(),
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
}
