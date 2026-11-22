/** Catalog scope helpers for org vs branch product ownership. */

import { selectedGlobalBranchId } from "@/lib/global-branch";

export function catalogMetaFromCapabilities(capabilities) {
  return capabilities?.catalog ?? {
    multi_branch: false,
    branch_count: 1,
    head_office_branch_id: null,
    default_branch_id: null,
  };
}

export function isMultiBranchCatalog(capabilities) {
  return Boolean(catalogMetaFromCapabilities(capabilities).multi_branch);
}

export function productScopeLabel(product) {
  if (product?.catalog_scope === "branch" || product?.branch_id) {
    const branch = product?.branch;
    if (branch?.branch_name) {
      return branch.branch_name;
    }
    return "Branch only";
  }
  return "All branches";
}

export function defaultProductCatalogScope(capabilities) {
  return isMultiBranchCatalog(capabilities) ? "organization" : "organization";
}

export function defaultProductBranchId(
  capabilities,
  user,
  branches = [],
  globalBranchId = selectedGlobalBranchId(),
) {
  if (globalBranchId) return globalBranchId;
  const list = Array.isArray(branches) ? branches : [];
  const orgWide =
    Boolean(user?.is_admin || user?.is_super_admin) ||
    (capabilities?.access_scope ?? user?.access_scope ?? "org") === "org";
  if (orgWide && isMultiBranchCatalog(capabilities)) {
    return list.length === 1 ? String(list[0].id) : "";
  }
  if (list.length === 1) return String(list[0].id);
  if (user?.branch_id) {
    return String(user.branch_id);
  }
  if (!isMultiBranchCatalog(capabilities)) {
    return list[0] ? String(list[0].id) : "";
  }
  const meta = catalogMetaFromCapabilities(capabilities);
  return "";
}
