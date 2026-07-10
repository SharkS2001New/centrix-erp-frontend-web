import { getStoredOrganization } from "@/lib/auth-storage";
import { invalidateProductCatalogCache } from "@/lib/catalog-cache";
import {
  clearOrgCache,
  invalidateOrgCacheForOrg,
  invalidateOrgCacheResource,
} from "@/lib/org-cache";

function normalizeApiPath(path) {
  return String(path ?? "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/api\/v1/i, "")
    .replace(/\/+$/, "");
}

function isMutation(method) {
  const verb = (method ?? "GET").toUpperCase();
  return verb === "POST" || verb === "PUT" || verb === "PATCH" || verb === "DELETE";
}

function orgId() {
  return getStoredOrganization()?.id ?? null;
}

function invalidateReference(resource) {
  invalidateOrgCacheResource(orgId(), resource);
}

/**
 * Invalidate org caches after successful API mutations.
 * Reference helpers (suppliers, VAT, UOM, categories, …): max 1h cache, cleared on matching CUD.
 * Products: no client catalog cache — search/list always hit the API.
 */
export function handleCacheInvalidation(method, path) {
  if (!isMutation(method)) return;

  const normalized = normalizeApiPath(path);
  const organizationId = orgId();
  if (!organizationId) return;

  if (/^\/categories(\/|$)/.test(normalized)) {
    invalidateReference("categories");
    return;
  }
  if (/^\/sub-categories(\/|$)/.test(normalized)) {
    invalidateReference("sub-categories");
    return;
  }
  if (/^\/uoms(\/|$)/.test(normalized)) {
    invalidateReference("uoms");
    return;
  }
  if (/^\/vats(\/|$)/.test(normalized)) {
    invalidateReference("vats");
    return;
  }
  if (/^\/suppliers(\/|$)/.test(normalized)) {
    invalidateReference("suppliers");
    return;
  }
  if (/^\/branches(\/|$)/.test(normalized)) {
    invalidateReference("branches");
    return;
  }
  if (/^\/routes(\/|$)/.test(normalized)) {
    invalidateReference("routes");
    return;
  }

  if (/^\/products(\/|$)/.test(normalized) || /^\/products\/import/.test(normalized)) {
    invalidateProductCatalogCache(organizationId);
  }
}

/** Full org cache reset (logout, org switch). */
export function invalidateAllOrgCaches(organizationId = orgId()) {
  if (organizationId) {
    invalidateOrgCacheForOrg(organizationId);
    return;
  }
  clearOrgCache();
}
