/** Platform-controlled advanced catalog / master-data import. */

import { resolveHasPermission } from "@/lib/access-control";

export function isAdvancedDataImportEnabled(capabilities) {
  return capabilities?.platform_advanced_data_import_enabled === true;
}

/**
 * Import buttons when the platform enabled advanced import and the user may manage
 * that data (org admin, or holder of the route permission alias e.g. products.manage).
 */
export function canUseAdvancedDataImport({
  user,
  organization,
  capabilities,
  permission,
  isSuperAdmin,
} = {}) {
  if (!isAdvancedDataImportEnabled(capabilities)) return false;

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
