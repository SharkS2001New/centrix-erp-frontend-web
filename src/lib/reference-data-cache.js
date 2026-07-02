import { apiRequest } from "@/lib/api";

const CACHE_MS = 5 * 60 * 1000;

/** @type {Map<string, { data?: unknown, promise?: Promise<unknown>, fetchedAt?: number }>} */
const entries = new Map();

function cacheKey(name, scope = "default") {
  return `${name}:${scope}`;
}

function readFresh(key) {
  const hit = entries.get(key);
  if (!hit?.data || hit.fetchedAt == null) return null;
  if (Date.now() - hit.fetchedAt > CACHE_MS) return null;
  return hit.data;
}

async function fetchCached(key, loader) {
  const fresh = readFresh(key);
  if (fresh != null) return fresh;

  const hit = entries.get(key);
  if (hit?.promise) return hit.promise;

  const promise = Promise.resolve()
    .then(loader)
    .then((data) => {
      entries.set(key, { data, fetchedAt: Date.now() });
      return data;
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });

  entries.set(key, { promise });
  return promise;
}

/** Drop cached branches/routes/uoms (e.g. on logout or org switch). */
export function invalidateReferenceDataCache() {
  entries.clear();
}

export function fetchBranchesCached(organizationId) {
  const key = cacheKey("branches", String(organizationId ?? "all"));
  return fetchCached(key, async () => {
    const res = await apiRequest("/branches", { searchParams: { per_page: 200 } });
    return (res.data ?? []).filter(
      (branch) => !organizationId || branch.organization_id === organizationId,
    );
  });
}

export function fetchRoutesCached() {
  const key = cacheKey("routes");
  return fetchCached(key, async () => {
    const res = await apiRequest("/routes", { searchParams: { per_page: 200 } });
    return res.data ?? [];
  });
}

export function fetchUomsCached() {
  const key = cacheKey("uoms");
  return fetchCached(key, async () => {
    const res = await apiRequest("/uoms", { searchParams: { per_page: 500 } });
    return res.data ?? [];
  });
}

export async function fetchRoutesAndUomsCached() {
  const [routes, uoms] = await Promise.all([fetchRoutesCached(), fetchUomsCached()]);
  return { routes, uoms };
}
