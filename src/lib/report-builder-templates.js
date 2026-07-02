import { apiRequest } from "@/lib/api";

/** @type {Map<string, { data?: unknown[], promise?: Promise<unknown[]>, fetchedAt?: number }>} */
const cache = new Map();

const CACHE_MS = 5 * 60 * 1000;

/**
 * Fetch custom report templates once per workspace (dedupes concurrent sidebar/hub requests).
 * @param {string | null | undefined} workspaceId
 */
export async function fetchReportBuilderTemplates(workspaceId) {
  const key = workspaceId ?? "default";
  const hit = cache.get(key);
  if (hit?.data && hit.fetchedAt != null && Date.now() - hit.fetchedAt < CACHE_MS) {
    return hit.data;
  }
  if (hit?.promise) {
    return hit.promise;
  }

  const promise = apiRequest("/reports/builder/templates", {
    searchParams: { workspace_id: workspaceId },
  })
    .then((res) => res.data ?? [])
    .catch(() => [])
    .then((data) => {
      cache.set(key, { data, fetchedAt: Date.now() });
      return data;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { promise });
  return promise;
}

export function invalidateReportBuilderTemplateCache() {
  cache.clear();
}
