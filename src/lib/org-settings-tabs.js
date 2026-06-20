/** Map organization settings tabs to ERP module keys (super-admin controlled). */
export const ORG_SETTINGS_TAB_MODULES = {
  general: ["admin"],
  sales: ["sales"],
  mobile: ["sales.mobile"],
  distribution: ["distribution"],
  inventory: ["inventory"],
  procurement: ["customers_suppliers"],
  finance: ["accounting", "payments"],
  ai: ["admin"],
  hr: ["hr_payroll"],
  notifications: ["admin"],
  security: ["admin"],
};

/** Tabs only shown when platform manages settings on behalf of a tenant without Administration. */
export const PLATFORM_MANAGED_ADMIN_TABS = new Set(["general", "ai", "notifications", "security"]);

/** @param {object} capabilities erp/capabilities payload */
export function isOrgSettingsTabVisible(tabId, capabilities, { platformManaged = false } = {}) {
  const modules = capabilities?.modules ?? {};
  const required = ORG_SETTINGS_TAB_MODULES[tabId] ?? ["admin"];
  if (platformManaged && PLATFORM_MANAGED_ADMIN_TABS.has(tabId)) {
    return true;
  }
  return required.some((key) => modules[key]);
}

/** @param {object} capabilities */
export function visibleOrgSettingsTabs(allTabs, capabilities, options = {}) {
  return allTabs.filter((tab) => isOrgSettingsTabVisible(tab.id, capabilities, options));
}
