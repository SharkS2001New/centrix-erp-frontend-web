/** API base URL only — keep free of api.js imports (used by realtime Echo auth). */
export function apiV1BaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
}
