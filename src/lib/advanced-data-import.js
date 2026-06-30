/** Platform-controlled advanced catalog / master-data import. */

import { resolveHasPermission } from "@/lib/access-control";
import { advancedDataImportPagesFromApi, defaultAdvancedDataImportPages } from "./advanced-data-import-pages";

/** @typedef {import("./advanced-data-import-pages").AdvancedDataImportPageKey} AdvancedDataImportPageKey */

export {
  ADVANCED_DATA_IMPORT_PAGE_OPTIONS,
  defaultAdvancedDataImportPages,
} from "./advanced-data-import-pages";

export function isAdvancedDataImportEnabled(capabilities) {
  return capabilities?.platform_advanced_data_import_enabled === true;
}

export function isAdvancedDataImportPageEnabled(capabilities, page) {
  if (!isAdvancedDataImportEnabled(capabilities)) return false;
  if (!page) return true;
  const pages = capabilities?.advanced_data_import_pages;
  const resolved =
    pages && typeof pages === "object"
      ? advancedDataImportPagesFromApi(pages)
      : defaultAdvancedDataImportPages();
  return resolved[page] === true;
}

/**
 * Import buttons when the platform enabled advanced import, the page is allowed,
 * and the user may manage that data.
 */
export function canUseAdvancedDataImport({
  user,
  organization,
  capabilities,
  permission,
  isSuperAdmin,
  page,
} = {}) {
  if (!isAdvancedDataImportPageEnabled(capabilities, page)) return false;

  if (user?.is_admin || capabilities?.is_admin) return true;

  if (!permission) return false;

  return resolveHasPermission({
    user,
    organization,
    capabilities,
    code: permission,
    isSuperAdmin,
  });
}
