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

/** @param {object} capabilities erp/capabilities payload */
export function isOrgSettingsTabVisible(tabId, capabilities) {
  const modules = capabilities?.modules ?? {};
  const required = ORG_SETTINGS_TAB_MODULES[tabId] ?? ["admin"];
  return required.some((key) => modules[key]);
}

/** @param {object} capabilities */
export function visibleOrgSettingsTabs(allTabs, capabilities) {
  return allTabs.filter((tab) => isOrgSettingsTabVisible(tab.id, capabilities));
}
