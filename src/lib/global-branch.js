import { getStoredOrganization, getStoredUser } from "@/lib/auth-storage";

const GLOBAL_BRANCH_KEY_PREFIX = "centrix.global-branch";
export const GLOBAL_BRANCH_CHANGED_EVENT = "centrix:global-branch-changed";

export function globalBranchStorageKey(userId, organizationId) {
  if (userId == null || organizationId == null) return null;
  return `${GLOBAL_BRANCH_KEY_PREFIX}:${organizationId}:${userId}`;
}

export function getGlobalBranchId(userId, organizationId) {
  if (typeof window === "undefined") return "";
  const key = globalBranchStorageKey(userId, organizationId);
  if (!key) return "";
  return window.localStorage.getItem(key) ?? "";
}

export function setGlobalBranchId(branchId, userId, organizationId) {
  if (typeof window === "undefined") return;
  const key = globalBranchStorageKey(userId, organizationId);
  if (!key) return;
  const value = branchId ? String(branchId) : "";
  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new CustomEvent(GLOBAL_BRANCH_CHANGED_EVENT, {
    detail: { branchId: value, userId: String(userId), organizationId: String(organizationId) },
  }));
}

export function selectedGlobalBranchId() {
  const user = getStoredUser();
  const organization = getStoredOrganization();
  if ((user?.access_scope ?? "org") !== "org" && !user?.is_admin) return "";
  return getGlobalBranchId(user?.id, organization?.id);
}

export function applyGlobalBranchToUrl(url, branchId, method = "GET", searchParams = null) {
  const requestMethod = String(method).toUpperCase();
  if (!branchId || !["GET", "POST", "DELETE"].includes(requestMethod)) return url;

  const path = url.pathname.replace(/^\/api\/v1(?=\/|$)/, "");
  if (/^\/auth(?:\/|$)/.test(path) || /^\/(?:reference\/)?branches(?:\/|$)/.test(path)) {
    return url;
  }

  if (requestMethod === "POST" && path.split("/").filter(Boolean).length > 2) {
    return url;
  }

  if (requestMethod === "DELETE") {
    url.searchParams.delete("filter[branch_id]");
    url.searchParams.set("branch_id", String(branchId));
    return url;
  }

  if (url.searchParams.get("filter[branch_id]")) return url;
  if (searchParams && searchParams["filter[branch_id]"]) return url;

  if (!url.searchParams.get("branch_id")) {
    url.searchParams.set("branch_id", String(branchId));
  }
  return url;
}
