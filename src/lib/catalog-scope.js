/** Catalog scope helpers for org vs branch product ownership. */

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

export function defaultProductBranchId(capabilities, user, branches = []) {
  if (user?.branch_id) {
    return String(user.branch_id);
  }
  const list = Array.isArray(branches) ? branches : [];
  if (list.length === 1) {
    return String(list[0].id);
  }
  if (!isMultiBranchCatalog(capabilities)) {
    return list[0] ? String(list[0].id) : "";
  }
  const meta = catalogMetaFromCapabilities(capabilities);
  if (meta.default_branch_id) {
    return String(meta.default_branch_id);
  }
  const hq = list.find((b) => b.branch_code === "HQ");
  return hq ? String(hq.id) : list[0] ? String(list[0].id) : "";
}
