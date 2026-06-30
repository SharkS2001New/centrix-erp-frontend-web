/** Platform-controlled advanced catalog / master-data import. */

export function isAdvancedDataImportEnabled(capabilities) {
  return capabilities?.platform_advanced_data_import_enabled === true;
}

/** Import buttons are visible only to org administrators when the platform enabled the feature. */
export function canUseAdvancedDataImport({ user, capabilities } = {}) {
  if (!isAdvancedDataImportEnabled(capabilities)) return false;
  return Boolean(user?.is_admin || capabilities?.is_admin);
}
