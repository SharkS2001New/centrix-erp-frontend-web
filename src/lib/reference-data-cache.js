import { apiRequest } from "@/lib/api";
import { getStoredOrganization } from "@/lib/auth-storage";
import {
  fetchOrgCached,
  invalidateOrgCacheResource,
  orgCacheKey,
  clearOrgCache,
} from "@/lib/org-cache";

function resolveOrgId(organizationId) {
  return organizationId ?? getStoredOrganization()?.id ?? null;
}

/** Drop all org-scoped caches (logout, org switch, capabilities version bump). */
export function invalidateReferenceDataCache() {
  clearOrgCache();
}

/**
 * Product counts by category / subcategory / unit — avoids full catalog crawls.
 * Short-lived; cleared with product catalog invalidation paths via org resource key.
 */
export function fetchProductGroupCountsCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "product-group-counts");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/products/group-counts");
    return {
      by_subcategory_id: res?.by_subcategory_id ?? {},
      by_category_id: res?.by_category_id ?? {},
      by_unit_id: res?.by_unit_id ?? {},
      by_vat_id: res?.by_vat_id ?? {},
    };
  }, { ttlMs: 60_000 });
}

/** Invalidate one reference resource after CUD (suppliers, vats, uoms, etc.). Max TTL is 1h. */
export function invalidateReferenceResource(resource, organizationId) {
  invalidateOrgCacheResource(resolveOrgId(organizationId), resource);
}

export function fetchCategoriesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "categories");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/categories", { searchParams: { per_page: 200 } });
    return res.data ?? [];
  });
}

export function fetchSubCategoriesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "sub-categories");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/sub-categories", { searchParams: { per_page: 500 } });
    return res.data ?? [];
  });
}

export function fetchVatsCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "vats");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/vats", { searchParams: { per_page: 50 } });
    return res.data ?? [];
  });
}

export function fetchSuppliersCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "suppliers");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/suppliers", { searchParams: { per_page: 200 } });
    return res.data ?? [];
  });
}

export function fetchUomsCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "uoms");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/uoms", { searchParams: { per_page: 500 } });
    return res.data ?? [];
  });
}

export async function fetchCatalogReferenceDataCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const [categories, subCategories, vats, suppliers, uoms] = await Promise.all([
    fetchCategoriesCached(orgId),
    fetchSubCategoriesCached(orgId),
    fetchVatsCached(orgId),
    fetchSuppliersCached(orgId),
    fetchUomsCached(orgId),
  ]);
  return { categories, subCategories, vats, suppliers, uoms };
}

export function fetchBranchesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "branches");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/branches", { searchParams: { per_page: 200 } });
    return (res.data ?? []).filter(
      (branch) => !orgId || branch.organization_id === orgId,
    );
  });
}

export function fetchRoutesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "routes");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/routes", { searchParams: { per_page: 200 } });
    return (res.data ?? []).filter(
      (route) => !orgId || route.organization_id === orgId,
    );
  });
}

export function fetchRetailPackagesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "retail-package-settings");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/retail-package-settings", {
      searchParams: { per_page: 500 },
    });
    return res.data ?? [];
  });
}

export function fetchUsersCached(organizationId, { path = "/users" } = {}) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "users", path === "/users" ? "" : path);
  return fetchOrgCached(key, async () => {
    const res = await apiRequest(path, { searchParams: { per_page: 200 } });
    return res.data ?? [];
  });
}

/** Lean employee roster for pickers / dashboards (no bank/NOK/user graph). */
export function fetchEmployeesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "employees-lean");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/employees", {
      searchParams: { per_page: 200, fields: "lean" },
    });
    return res.data ?? [];
  });
}

export function fetchDriversCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "drivers");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/drivers", { searchParams: { per_page: 200 } });
    return res.data ?? [];
  });
}

export function fetchVehiclesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "vehicles");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/vehicles", { searchParams: { per_page: 200 } });
    return res.data ?? [];
  });
}

export async function fetchRoutesAndUomsCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const [routes, uoms] = await Promise.all([
    fetchRoutesCached(orgId),
    fetchUomsCached(orgId),
  ]);
  return { routes, uoms };
}

export async function fetchFulfillmentRefsCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const [routes, drivers, vehicles] = await Promise.all([
    fetchRoutesCached(orgId),
    fetchDriversCached(orgId),
    fetchVehiclesCached(orgId),
  ]);
  return { routes, drivers, vehicles };
}
