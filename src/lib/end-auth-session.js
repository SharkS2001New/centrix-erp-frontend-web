import { apiFetchCredentials, useCookieAuth } from "@/lib/auth-config";
import { apiV1BaseUrl } from "@/lib/api-base-url";

const LOGOUT_WAIT_MS = 5000;

/**
 * Revoke the server auth session (cookie and/or bearer token).
 * Uses keepalive so the request can finish even if the tab navigates to /login.
 * Waits up to `timeoutMs` for a response, but does not abort the in-flight request.
 *
 * @param {{ token?: string|null, timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, timedOut?: boolean }>}
 */
export async function endServerAuthSession({
  token = null,
  timeoutMs = LOGOUT_WAIT_MS,
} = {}) {
  if (typeof fetch !== "function") {
    return { ok: false, skipped: true };
  }

  const headers = { Accept: "application/json" };
  if (useCookieAuth) {
    // Cookie session — credentials include the HttpOnly session cookie.
  } else if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    return { ok: true, skipped: true };
  }

  const logoutUrl = `${apiV1BaseUrl()}/auth/logout`;

  const logoutFetch = fetch(logoutUrl, {
    method: "POST",
    credentials: apiFetchCredentials(),
    headers,
    // Survive soft/hard navigation after local clear + router.replace.
    keepalive: true,
  })
    .then((res) => ({ ok: res.ok || res.status === 401 || res.status === 204 }))
    .catch(() => ({ ok: false }));

  let timeoutId = null;
  const waitMs = Math.max(1, Number(timeoutMs) || LOGOUT_WAIT_MS);
  const timedOut = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ ok: false, timedOut: true }), waitMs);
  });

  try {
    return await Promise.race([logoutFetch, timedOut]);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}
