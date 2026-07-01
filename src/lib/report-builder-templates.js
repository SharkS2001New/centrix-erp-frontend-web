import { apiRequest } from "@/lib/api";

/** @type {Map<string, Promise<unknown[]>>} */
const inFlight = new Map();

/**
 * Fetch custom report templates once per workspace (dedupes concurrent sidebar/hub requests).
 * @param {string | null | undefined} workspaceId
 */
export async function fetchReportBuilderTemplates(workspaceId) {
  const key = workspaceId ?? "default";
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const request = apiRequest("/reports/builder/templates", {
    searchParams: { workspace_id: workspaceId },
  })
    .then((res) => res.data ?? [])
    .catch(() => [])
    .finally(() => {
      window.setTimeout(() => inFlight.delete(key), 250);
    });

  inFlight.set(key, request);
  return request;
}
