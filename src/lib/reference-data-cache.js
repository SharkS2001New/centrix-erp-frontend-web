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

/** Drop cached reference lists (e.g. on logout or org switch). */
export function invalidateReferenceDataCache() {
  entries.clear();
}

export function fetchCategoriesCached() {
  const key = cacheKey("categories");
  return fetchCached(key, async () => {
    const res = await apiRequest("/categories", { searchParams: { per_page: 200 } });
    return res.data ?? [];
  });
}

export function fetchSubCategoriesCached() {
  const key = cacheKey("sub-categories");
  return fetchCached(key, async () => {
    const res = await apiRequest("/sub-categories", { searchParams: { per_page: 500 } });
    return res.data ?? [];
  });
}

export function fetchVatsCached() {
  const key = cacheKey("vats");
  return fetchCached(key, async () => {
    const res = await apiRequest("/vats", { searchParams: { per_page: 50 } });
    return res.data ?? [];
  });
}

export function fetchSuppliersCached() {
  const key = cacheKey("suppliers");
  return fetchCached(key, async () => {
    const res = await apiRequest("/suppliers", { searchParams: { per_page: 200 } });
    return res.data ?? [];
  });
}

export async function fetchCatalogReferenceDataCached() {
  const [categories, subCategories, vats, suppliers, uoms] = await Promise.all([
    fetchCategoriesCached(),
    fetchSubCategoriesCached(),
    fetchVatsCached(),
    fetchSuppliersCached(),
    fetchUomsCached(),
  ]);
  return { categories, subCategories, vats, suppliers, uoms };
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

export function fetchRoutesCached(organizationId) {
  const key = cacheKey("routes", String(organizationId ?? "default"));
  return fetchCached(key, async () => {
    const res = await apiRequest("/routes", { searchParams: { per_page: 200 } });
    return (res.data ?? []).filter(
      (route) => !organizationId || route.organization_id === organizationId,
    );
  });
}

export function fetchUomsCached() {
  const key = cacheKey("uoms");
  return fetchCached(key, async () => {
    const res = await apiRequest("/uoms", { searchParams: { per_page: 500 } });
    return res.data ?? [];
  });
}

export async function fetchRoutesAndUomsCached(organizationId) {
  const [routes, uoms] = await Promise.all([
    fetchRoutesCached(organizationId),
    fetchUomsCached(),
  ]);
  return { routes, uoms };
}
