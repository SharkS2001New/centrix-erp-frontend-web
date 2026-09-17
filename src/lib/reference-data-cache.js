import { apiRequest, ApiError } from "@/lib/api";
import { getStoredOrganization, getStoredUser } from "@/lib/auth-storage";
import {
  fetchOrgCached,
  invalidateOrgCacheResource,
  orgCacheKey,
  clearOrgCache,
} from "@/lib/org-cache";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";

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
    const res = await apiRequest("/products/group-counts", { loading: false });
    return {
      by_subcategory_id: res?.by_subcategory_id ?? {},
      by_category_id: res?.by_category_id ?? {},
      by_unit_id: res?.by_unit_id ?? {},
      by_vat_id: res?.by_vat_id ?? {},
    };
  }, { ttlMs: 60_000 });
}

/** Invalidate one reference resource after CUD (suppliers, vats, uoms, etc.). Permanent until matching CUD or explicit Refresh. */
export function invalidateReferenceResource(resource, organizationId) {
  invalidateOrgCacheResource(resolveOrgId(organizationId), resource);
}

export function fetchCategoriesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "categories");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/reference/categories", {
      searchParams: { per_page: 200 },
      loading: false,
    });
    return res.data ?? [];
  });
}

export function fetchSubCategoriesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "sub-categories");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/reference/sub-categories", {
      searchParams: { per_page: 500 },
      loading: false,
    });
    return res.data ?? [];
  });
}

export function fetchVatsCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "vats");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/reference/vats", {
      searchParams: { per_page: 50 },
      loading: false,
    });
    return res.data ?? [];
  });
}

export function fetchSuppliersCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "suppliers");
  return fetchOrgCached(key, async () => {
    return fetchAllPaginatedRowsSmart("/reference/suppliers", {}, { perPage: 200 });
  });
}

/**
 * Resolve supplier names for a page of products — avoids crawling the full org list.
 * @param {number|string|null|undefined} organizationId
 * @param {Array<number|string>} ids
 * @returns {Promise<Array<{id: number, supplier_name?: string, supplier_code?: string}>>}
 */
export async function fetchSuppliersByIds(organizationId, ids) {
  const unique = [
    ...new Set(
      (ids ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  if (unique.length === 0) return [];

  const res = await apiRequest("/reference/suppliers", {
    searchParams: {
      ids: unique.join(","),
      per_page: Math.min(200, Math.max(unique.length, 1)),
    },
    loading: false,
  });
  return res?.data ?? [];
}

export function fetchUomsCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "uoms");
  return fetchOrgCached(key, async () => {
    const res = await apiRequest("/reference/uoms", {
      searchParams: { per_page: 500 },
      loading: false,
    });
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
    try {
      const res = await apiRequest("/branches", {
        searchParams: { per_page: 200 },
        loading: false,
      });
    return (res.data ?? []).filter(
        (branch) => !orgId || branch.organization_id === orgId,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        return [];
      }
      throw error;
    }
  });
}

export function fetchRoutesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "routes");
  return fetchOrgCached(key, async () => {
    // Use the permission-free reference picker (same as users/uoms). The CRUD
    // /routes resource requires sales.view|fulfillment.view and 403'd Mobile
    // Orders filters for queue-view-only roles.
    try {
      const res = await apiRequest("/reference/routes", {
        searchParams: { per_page: 200 },
        loading: false,
        reportIssues: false,
      });
    return (res.data ?? []).filter(
        (route) => !orgId || route.organization_id === orgId,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        return [];
      }
      throw error;
    }
  });
}

export function fetchRetailPackagesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "retail-package-settings");
  return fetchOrgCached(key, async () => {
    // Permanent until CUD (same as categories / UOMs). Paginate fully — orgs can
    // have one setting per product, which exceeds a single per_page:200 window.
    return fetchAllPaginatedRowsSmart(
      "/retail-package-settings",
      {},
      { perPage: 200, message: "Loading retail package settings…" },
    );
  });
}

/**
 * Lean fetch for visible catalogue/stock rows — avoids warming the full org map.
 * @param {string[]} productCodes
 * @returns {Promise<any[]>}
 */
export async function fetchRetailPackagesForProductCodes(productCodes) {
  const codes = [...new Set((productCodes ?? []).map((c) => String(c ?? "").trim()).filter(Boolean))];
  if (!codes.length) return [];
  const res = await apiRequest("/retail-package-settings", {
    searchParams: {
      per_page: Math.min(Math.max(codes.length, 25), 200),
      product_codes: codes.join(","),
    },
    loading: false,
  });
  return res.data ?? [];
}

export function fetchUsersCached(organizationId, { path = "/reference/users", searchParams = {} } = {}) {
  const orgId = resolveOrgId(organizationId);
  const paramsKey = Object.keys(searchParams).length
    ? JSON.stringify(searchParams, Object.keys(searchParams).sort())
    : path === "/reference/users"
      ? ""
      : path;
  const key = orgCacheKey(orgId, "users", paramsKey);
  return fetchOrgCached(key, async () => {
    try {
      const res = await apiRequest(path, {
        searchParams: { per_page: 200, ...searchParams },
        loading: false,
        reportIssues: false,
      });
    return res.data ?? [];
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        return [];
      }
      throw error;
    }
  });
}

/**
 * Users who can create orders / sell: backoffice create order, POS checkout,
 * hotel POS, or mobile field sales — filtered server-side by permissions.
 */
export function fetchSalesCapableUsersCached(organizationId) {
  return fetchUsersCached(organizationId, {
    searchParams: { sales_capable: 1 },
  });
}

/** Lean employee roster for pickers / dashboards (no bank/NOK/user graph). */
export function fetchEmployeesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const user = getStoredUser();
  const branchScope =
    user?.access_scope && user.access_scope !== "org" && user.branch_id != null
      ? `branch:${user.branch_id}`
      : "org";
  const key = orgCacheKey(orgId, "employees-lean", branchScope);
  return fetchOrgCached(key, async () => {
    return fetchAllPaginatedRowsSmart(
      "/employees",
      { fields: "lean" },
      { perPage: 200, message: "Loading employees…" },
    );
  });
}

export function fetchDriversCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "drivers");
  return fetchOrgCached(key, async () => {
    return fetchAllPaginatedRowsSmart("/drivers", {}, { perPage: 200 });
  });
}

export function fetchVehiclesCached(organizationId) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "vehicles");
  return fetchOrgCached(key, async () => {
    return fetchAllPaginatedRowsSmart("/vehicles", {}, { perPage: 200 });
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
